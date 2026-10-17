using System.Diagnostics;
using PrismControl.Core.Hosting;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using Windows.Graphics;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;

namespace PrismControl.Sight.Capture;

public enum CaptureFormatPreference { Auto, Bgra8, Fp16 }

public sealed class CaptureOptions
{
    /// <summary>Auto = FP16 scRGB when the window's monitor has HDR (advanced color) on, else BGRA8. See NOTES.md (HDR).</summary>
    public CaptureFormatPreference Format { get; init; } = CaptureFormatPreference.Auto;
    /// <summary>The fastest frame delivery we ask WGC for (IGraphicsCaptureSession5.MinUpdateInterval). Default 100 ms (10 Hz).</summary>
    public TimeSpan MinUpdateInterval { get; init; } = TimeSpan.FromMilliseconds(100);
    /// <summary>HDR: the HUD white level in nits (null = the monitor's SDR white level, refined by a white-reference region).</summary>
    public double? PaperWhiteNits { get; init; }
    /// <summary>Probes only: receives each crop's raw texels (region, bytes, width, height, bytes per pixel) before conversion.</summary>
    internal Action<int, byte[], int, int, int>? RawCrops { get; init; }
}

/// <summary>What the capture should copy on this frame (decided by the engine's plan).</summary>
public sealed class CropPlan
{
    public static readonly CropPlan Empty = new() { Regions = [] };
    public required IReadOnlyList<RegionCrop> Regions { get; init; }
    /// <summary>Also read back the whole content (calibration capture only, ≤ 1/s).</summary>
    public bool FullFrame { get; init; }
    /// <summary>HDR: a region whose brightest pixels are HUD white at this encoded level (paper-white measurement).</summary>
    public int? WhiteReferenceRegion { get; init; }
    public double WhiteReferenceLevel { get; init; } = 1.0;
}

/// <summary>The crops of one frame, converted to sRGB8.</summary>
public sealed class CapturedFrame
{
    public required DateTimeOffset At { get; init; }
    public required int ContentWidth { get; init; }
    public required int ContentHeight { get; init; }
    public required Dictionary<int, SightImage> Regions { get; init; }
    public SightImage? Full { get; init; }
    public required CapturePixelFormat Format { get; init; }
    /// <summary>The scRGB paper white used for the conversion (1 for BGRA8).</summary>
    public required double PaperWhite { get; init; }
    /// <summary>True when cut from the cached copy of the last frame (the content has not changed since).</summary>
    public bool FromCache { get; init; }
    /// <summary>GPU copy + map (ms) and CPU conversion (ms) for this frame.</summary>
    public required double CopyMs { get; init; }
    public required double ConvertMs { get; init; }
}

public sealed class CaptureStats
{
    public long FramesArrived;
    public long FramesUsed;
    public long FramesFromCache;
    public long FramesSkippedBusy;
    public double CopyMsTotal, CopyMsMax, ConvertMsTotal;
    /// <summary>CPU time (this thread) spent in the whole frame handler, ms: separates real work from waiting on the GPU.</summary>
    public double HandlerCpuMsTotal;
    public double CopyMsAvg => FramesUsed == 0 ? 0 : CopyMsTotal / FramesUsed;
    public double ConvertMsAvg => FramesUsed == 0 ? 0 : ConvertMsTotal / FramesUsed;
}

/// <summary>
/// Window capture is not possible for this game (WGC refused the window). Sight never falls back to capturing the
/// monitor (that would read other apps' pixels): it is unavailable for this game, with this message.
/// </summary>
public sealed class SightCaptureUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>The planner's input: the content size and the frame time.</summary>
public readonly record struct CaptureTickInfo(int ContentWidth, int ContentHeight, DateTimeOffset At);

/// <summary>
/// Windows.Graphics.Capture of one game WINDOW (never a monitor: M11), borderless, cursor off, frame rate capped with
/// MinUpdateInterval. On each frame it asks the planner which regions are due and copies ONLY those rectangles on the
/// GPU (CopySubresourceRegion into a small staging atlas), maps that atlas once and converts the crops to sRGB8 (FP16
/// scRGB is divided by paper white). There is never a full-frame CPU readback, except the opt-in calibration frame.
/// WGC sends frames only when the content changes, so the latest frame is also kept as a GPU-side copy: due regions
/// of a static screen are cut from it (<see cref="PollCached"/>). A minimized window delivers no frames; the runner
/// pauses the engine then. Pixels never leave memory here.
/// </summary>
public sealed class WgcRegionCapture : Service.ICaptureSource
{
    private static int _accessRequested;
    private readonly nint _hwnd;
    private readonly CaptureOptions _o;
    private readonly Func<CaptureTickInfo, CropPlan> _planner;
    private readonly Action<CapturedFrame> _sink;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gpu = new();
    private nint _device, _context, _atlas, _full, _last;
    private uint _atlasW, _atlasH, _fullW, _fullH, _lastW, _lastH, _lastFormat;
    private SizeInt32 _lastSize;
    private long _lastFrameTicks;
    private IDirect3DDevice? _winrt;
    private GraphicsCaptureItem? _item;
    private Direct3D11CaptureFramePool? _pool;
    private GraphicsCaptureSession? _session;
    private SizeInt32 _poolSize;
    private double? _measuredPaperWhite;
    private int _disposed;
    private (bool Hdr, double SdrWhite, nint Monitor) _display;
    private long _lastDisplayCheck;

    /// <summary>A measured paper white is never trusted outside 80–1000 nits (scRGB 1.0–12.5): a bright scene can't run away with it.</summary>
    internal const double MinPaperWhite = 1.0, MaxPaperWhite = 12.5;

    public WgcRegionCapture(nint hwnd, CaptureOptions options, Func<CaptureTickInfo, CropPlan> planner, Action<CapturedFrame> sink, ILog? log = null, TimeProvider? time = null)
    {
        _hwnd = hwnd;
        _o = options;
        _planner = planner;
        _sink = sink;
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
    }

    public CapturePixelFormat Format { get; private set; }
    public nint Monitor { get; private set; }
    public double PaperWhite { get; private set; } = 1;
    public CaptureStats Stats { get; } = new();
    public bool BorderlessApplied { get; private set; }
    public bool MinIntervalApplied { get; private set; }
    /// <summary>Raised when the captured item closes (window destroyed).</summary>
    public event Action? Closed;

    /// <summary>Milliseconds since WGC last delivered a frame (∞ before the first).</summary>
    public double MsSinceLastFrame => Interlocked.Read(ref _lastFrameTicks) is var t && t == 0 ? double.PositiveInfinity : Stopwatch.GetElapsedTime(t).TotalMilliseconds;

    public static bool IsSupported()
    {
        try { return GraphicsCaptureSession.IsSupported(); }
        catch (Exception) { return false; }
    }

    /// <summary>Asks once per process for borderless capture (unpackaged: Allowed without a prompt on this PC).</summary>
    public static async Task<bool> RequestBorderlessAsync()
    {
        if (Interlocked.Exchange(ref _accessRequested, 1) == 1) return true;
        try { return await GraphicsCaptureAccess.RequestAccessAsync(GraphicsCaptureAccessKind.Borderless) == Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus.Allowed; }
        catch (Exception) { return false; }
    }

    /// <summary>
    /// Starts the session. Throws <see cref="SightCaptureUnavailableException"/> when the window cannot be captured
    /// (there is no monitor fallback). On any failure everything created so far is released before it throws.
    /// </summary>
    public void Start()
    {
        try { StartCore(); }
        catch (Exception)
        {
            Dispose();
            throw;
        }
    }

    private void StartCore()
    {
        (_device, _context, _winrt) = D3D11.CreateDevice();
        Monitor = WindowGeometry.MonitorOf(_hwnd);
        var color = DisplayInfo.ForMonitor(Monitor);
        var hdr = color?.AdvancedColorEnabled == true;
        _display = (hdr, color?.SdrWhiteNits ?? 0, Monitor);
        Interlocked.Exchange(ref _lastDisplayCheck, Stopwatch.GetTimestamp());
        Format = _o.Format switch
        {
            CaptureFormatPreference.Bgra8 => CapturePixelFormat.Bgra8,
            CaptureFormatPreference.Fp16 => CapturePixelFormat.ScRgbFp16,
            _ => hdr ? CapturePixelFormat.ScRgbFp16 : CapturePixelFormat.Bgra8,
        };
        PaperWhite = Format == CapturePixelFormat.Bgra8 ? 1 : _o.PaperWhiteNits is { } nits ? nits / 80.0 : color?.SdrWhiteScRgb ?? 1;
        try { _item = D3D11.CreateItemForWindow(_hwnd); }
        catch (Exception ex)
        {
            // M11: no monitor fallback, ever. A monitor capture would also read (and in calibration, save) every other
            // window over the game's rectangle.
            throw new SightCaptureUnavailableException($"window capture is not available for this game (0x{ex.HResult:X8}): Sight is off for it (it never captures the whole screen)", ex);
        }
        _item.Closed += OnClosed;
        _poolSize = _item.Size;
        _pool = Direct3D11CaptureFramePool.CreateFreeThreaded(_winrt, PoolFormat, 2, _poolSize);
        _pool.FrameArrived += OnFrameArrived;
        _session = _pool.CreateCaptureSession(_item);
        try { _session.IsCursorCaptureEnabled = false; } catch (Exception) { /* older OS */ }
        try { _session.IsBorderRequired = false; BorderlessApplied = !_session.IsBorderRequired; }
        catch (Exception) { BorderlessApplied = false; }
        MinIntervalApplied = D3D11.TrySetMinUpdateInterval(_session, _o.MinUpdateInterval);
        _session.StartCapture();
        _log.Info($"sight: capture started (window, {Format}, paper white {PaperWhite:F2}, border {(BorderlessApplied ? "off" : "on")}, min interval {(MinIntervalApplied ? _o.MinUpdateInterval.TotalMilliseconds + " ms" : "n/a")})");
    }

    /// <summary>
    /// True when the window moved to another monitor, or its monitor's HDR state or SDR white level changed since Start
    /// (checked at most every 2 s; a DXGI query). The service then restarts the session.
    /// </summary>
    public bool DisplayChanged()
    {
        if (_disposed != 0 || _device == 0) return false;
        var last = Interlocked.Read(ref _lastDisplayCheck);
        if (last != 0 && Stopwatch.GetElapsedTime(last) < TimeSpan.FromSeconds(2)) return false;
        Interlocked.Exchange(ref _lastDisplayCheck, Stopwatch.GetTimestamp());
        try
        {
            var mon = WindowGeometry.MonitorOf(_hwnd);
            var color = DisplayInfo.ForMonitor(mon);
            var now = (color?.AdvancedColorEnabled == true, color?.SdrWhiteNits ?? 0, mon);
            if (now.Item1 == _display.Hdr && Math.Abs(now.Item2 - _display.SdrWhite) < 0.5 && now.mon == _display.Monitor) return false;
            _log.Info($"sight: display changed (HDR {_display.Hdr}→{now.Item1}, SDR white {_display.SdrWhite:0}→{now.Item2:0} nits, monitor {(now.mon == _display.Monitor ? "same" : "moved")})");
            return true;
        }
        catch (Exception) { return false; }
    }

    private DirectXPixelFormat PoolFormat => Format == CapturePixelFormat.Bgra8 ? DirectXPixelFormat.B8G8R8A8UIntNormalized : DirectXPixelFormat.R16G16B16A16Float;

    /// <summary>Changes the frame-rate cap at runtime (closed loops ask for faster frames while they run).</summary>
    public bool SetMinUpdateInterval(TimeSpan interval) => _session is not null && D3D11.TrySetMinUpdateInterval(_session, interval);

    /// <summary>Paper white measured from the white-reference region (HDR), smoothed.</summary>
    public double? MeasuredPaperWhite => _measuredPaperWhite;

    private void OnClosed(GraphicsCaptureItem sender, object args) => Closed?.Invoke();

    private void OnFrameArrived(Direct3D11CaptureFramePool pool, object args)
    {
        Interlocked.Increment(ref Stats.FramesArrived);
        if (!Monitor_TryEnter())
        {
            Interlocked.Increment(ref Stats.FramesSkippedBusy);
            using var dropped = pool.TryGetNextFrame();
            return;
        }
        try
        {
            if (_disposed != 0) return;
            using var frame = pool.TryGetNextFrame();
            if (frame is null) return;
            Interlocked.Exchange(ref _lastFrameTicks, Stopwatch.GetTimestamp());
            var size = frame.ContentSize;
            if (size.Width != _poolSize.Width || size.Height != _poolSize.Height)
            {
                _poolSize = size;
                pool.Recreate(_winrt, PoolFormat, 2, size);
                return;   // the next frame has the new size
            }
            var tex = D3D11.TextureOf(frame.Surface);
            try
            {
                var (texW, texH, texFormat) = D3D11.Describe(tex);
                // Keep a GPU-side copy for static screens (WGC is silent until the content changes again).
                if (_last == 0 || _lastW != texW || _lastH != texH || _lastFormat != texFormat)
                {
                    if (_last != 0) D3D11.Release(_last);
                    _last = D3D11.CreateDefault(_device, texW, texH, texFormat);
                    (_lastW, _lastH, _lastFormat) = (texW, texH, texFormat);
                }
                D3D11.CopyResource(_context, _last, tex);
                _lastSize = size;
                Process(tex, texW, texH, size, fromCache: false);
            }
            finally { D3D11.Release(tex); }
        }
        catch (Exception ex)
        {
            _log.Warn($"sight: frame failed ({ex.GetType().Name} 0x{ex.HResult:X8})");
        }
        finally { System.Threading.Monitor.Exit(_gpu); }
    }

    /// <summary>
    /// When WGC has been silent for at least <paramref name="quietFor"/> (static content), cut the due regions from the
    /// cached copy of the last frame. Returns true when it delivered a frame.
    /// </summary>
    public bool PollCached(TimeSpan quietFor)
    {
        if (MsSinceLastFrame < quietFor.TotalMilliseconds || _last == 0) return false;
        if (!Monitor_TryEnter()) return false;
        try
        {
            if (_disposed != 0 || _last == 0) return false;
            return Process(_last, _lastW, _lastH, _lastSize, fromCache: true);
        }
        catch (Exception ex)
        {
            _log.Warn($"sight: cached frame failed ({ex.GetType().Name})");
            return false;
        }
        finally { System.Threading.Monitor.Exit(_gpu); }
    }

    private bool Monitor_TryEnter() => System.Threading.Monitor.TryEnter(_gpu);

    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    private static extern int GetThreadTimes(nint thread, out long creation, out long exit, out long kernel, out long user);
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    private static extern nint GetCurrentThread();

    private static double ThreadCpuMs() => GetThreadTimes(GetCurrentThread(), out _, out _, out var k, out var u) != 0 ? (k + u) / 10_000.0 : 0;

    private bool Process(nint tex, uint texW, uint texH, SizeInt32 size, bool fromCache)
    {
        var cpu0 = ThreadCpuMs();
        try { return ProcessCore(tex, texW, texH, size, fromCache); }
        finally { lock (Stats) Stats.HandlerCpuMsTotal += ThreadCpuMs() - cpu0; }
    }

    private bool ProcessCore(nint tex, uint texW, uint texH, SizeInt32 size, bool fromCache)
    {
        // Where the client area sits inside the captured surface.
        if (!WindowGeometry.TryGetClientOnScreen(_hwnd, out var client)) return false;
        if (!WindowGeometry.TryGetFrameBounds(_hwnd, out var origin)) return false;
        var offX = client.X - origin.X;
        var offY = client.Y - origin.Y;
        var surfW = (int)Math.Min(texW, (uint)size.Width);
        var surfH = (int)Math.Min(texH, (uint)size.Height);
        var contentW = Math.Min(client.W, surfW - Math.Max(0, offX));
        var contentH = Math.Min(client.H, surfH - Math.Max(0, offY));
        if (contentW <= 0 || contentH <= 0) return false;
        var now = _time.GetUtcNow();
        var plan = _planner(new CaptureTickInfo(contentW, contentH, now));
        if (plan.Regions.Count == 0 && !plan.FullFrame) return false;

        var sw = Stopwatch.StartNew();
        var layout = Layout(plan.Regions);
        var placed = new List<(RegionCrop Crop, int AX, int AY, PixelRect Src)>();
        if (plan.Regions.Count > 0)
        {
            EnsureAtlas(layout.W, layout.H, _lastFormat != 0 ? _lastFormat : D3D11.Describe(tex).Format);
            for (var i = 0; i < plan.Regions.Count; i++)
            {
                var crop = plan.Regions[i];
                var src = crop.Rect.Offset(offX, offY).ClampTo(surfW, surfH);
                if (src.IsEmpty) continue;
                var (ax, ay) = layout.Positions[i];
                D3D11.CopyRegion(_context, _atlas, (uint)ax, (uint)ay, tex, (uint)src.X, (uint)src.Y, (uint)src.Right, (uint)src.Bottom);
                placed.Add((crop, ax, ay, src));
            }
        }
        var regions = new Dictionary<int, SightImage>();
        double convertMs = 0;
        var bpp = Format == CapturePixelFormat.Bgra8 ? 4 : 8;
        if (placed.Count > 0)
        {
            var (data, pitch) = D3D11.Map(_context, _atlas);
            if (data == 0) return false;
            var copyDone = sw.Elapsed.TotalMilliseconds;
            try
            {
                unsafe
                {
                    var basePtr = (byte*)data;
                    foreach (var (crop, ax, ay, src) in placed)
                    {
                        var img = new SightImage(src.W, src.H);
                        for (var y = 0; y < src.H; y++)
                        {
                            var row = new ReadOnlySpan<byte>(basePtr + (long)(ay + y) * pitch + ax * bpp, src.W * bpp);
                            var dst = img.Pixels.AsSpan(y * src.W * 4, src.W * 4);
                            if (bpp == 4)
                            {
                                row.CopyTo(dst);
                                for (var x = 3; x < dst.Length; x += 4) dst[x] = 255;
                            }
                            else ColorPipeline.ScRgbToSrgb8(row, dst, src.W, PaperWhite);
                        }
                        if (bpp == 8 && plan.WhiteReferenceRegion == crop.Region) MeasureWhite(basePtr, pitch, ax, ay, src, plan.WhiteReferenceLevel);
                        if (_o.RawCrops is { } raw)
                        {
                            var bytes = new byte[src.W * src.H * bpp];
                            for (var y = 0; y < src.H; y++)
                                new ReadOnlySpan<byte>(basePtr + (long)(ay + y) * pitch + ax * bpp, src.W * bpp).CopyTo(bytes.AsSpan(y * src.W * bpp));
                            raw(crop.Region, bytes, src.W, src.H, bpp);
                        }
                        regions[crop.Region] = img;
                    }
                }
            }
            finally { D3D11.Unmap(_context, _atlas); }
            convertMs = sw.Elapsed.TotalMilliseconds - copyDone;
        }
        var full = plan.FullFrame ? ReadFull(tex, texW, texH, offX, offY, contentW, contentH) : null;
        var total = sw.Elapsed.TotalMilliseconds;
        lock (Stats)
        {
            Stats.FramesUsed++;
            if (fromCache) Stats.FramesFromCache++;
            Stats.CopyMsTotal += total - convertMs;
            Stats.CopyMsMax = Math.Max(Stats.CopyMsMax, total - convertMs);
            Stats.ConvertMsTotal += convertMs;
        }
        _sink(new CapturedFrame
        {
            At = now, ContentWidth = contentW, ContentHeight = contentH, Regions = regions, Full = full, Format = Format,
            PaperWhite = PaperWhite, FromCache = fromCache, CopyMs = total - convertMs, ConvertMs = convertMs,
        });
        return true;
    }

    private unsafe void MeasureWhite(byte* basePtr, int pitch, int ax, int ay, PixelRect src, double level)
    {
        var buf = new byte[src.W * src.H * 8];
        for (var y = 0; y < src.H; y++)
            new ReadOnlySpan<byte>(basePtr + (long)(ay + y) * pitch + ax * 8, src.W * 8).CopyTo(buf.AsSpan(y * src.W * 8));
        var est = ColorPipeline.EstimatePaperWhite(buf, src.W * src.H, level);
        if (est is not { } pw || _o.PaperWhiteNits is not null) return;
        // Smooth, never let one frame swing it more than 10%, and never leave 80–1000 nits (an absolute bound: a run of
        // bright frames could otherwise walk it anywhere, 10% at a time).
        _measuredPaperWhite = SmoothPaperWhite(_measuredPaperWhite ?? PaperWhite, pw);
        PaperWhite = _measuredPaperWhite.Value;
    }

    /// <summary>One white-reference update: ±10% per frame, smoothed, and always inside the absolute 80–1000 nit bound.</summary>
    internal static double SmoothPaperWhite(double previous, double estimate)
    {
        var prev = Math.Clamp(previous, MinPaperWhite, MaxPaperWhite);
        var clamped = Math.Clamp(estimate, prev * 0.9, prev * 1.1);
        return Math.Clamp(prev * 0.8 + clamped * 0.2, MinPaperWhite, MaxPaperWhite);
    }

    private SightImage? ReadFull(nint tex, uint texW, uint texH, int offX, int offY, int w, int h)
    {
        var format = _lastFormat;
        if (_full == 0 || _fullW < texW || _fullH < texH)
        {
            if (_full != 0) D3D11.Release(_full);
            _full = D3D11.CreateStaging(_device, texW, texH, format);
            _fullW = texW;
            _fullH = texH;
        }
        var x0 = Math.Max(0, offX);
        var y0 = Math.Max(0, offY);
        D3D11.CopyRegion(_context, _full, 0, 0, tex, (uint)x0, (uint)y0, (uint)Math.Min(texW, x0 + w), (uint)Math.Min(texH, y0 + h));
        var (data, pitch) = D3D11.Map(_context, _full);
        if (data == 0) return null;
        try
        {
            unsafe
            {
                var span = new ReadOnlySpan<byte>((void*)data, pitch * h);
                if (Format == CapturePixelFormat.ScRgbFp16) return ColorPipeline.ScRgbToImage(span, w, h, pitch, PaperWhite);
                var img = new SightImage(w, h);
                for (var y = 0; y < h; y++)
                {
                    span.Slice(y * pitch, w * 4).CopyTo(img.Pixels.AsSpan(y * w * 4));
                    for (var x = 3; x < w * 4; x += 4) img.Pixels[y * w * 4 + x] = 255;
                }
                return img;
            }
        }
        finally { D3D11.Unmap(_context, _full); }
    }

    /// <summary>Shelf packing of the crops into the atlas (rows of decreasing height, 2048 px wide at most).</summary>
    internal static (int W, int H, (int X, int Y)[] Positions) Layout(IReadOnlyList<RegionCrop> crops)
    {
        var pos = new (int, int)[crops.Count];
        var order = Enumerable.Range(0, crops.Count).OrderByDescending(i => crops[i].Rect.H).ToList();
        var maxW = Math.Max(256, Math.Min(4096, crops.Count == 0 ? 256 : Math.Max(crops.Max(c => c.Rect.W), 2048)));
        int x = 0, y = 0, rowH = 0, w = 1;
        foreach (var i in order)
        {
            var r = crops[i].Rect;
            if (x > 0 && x + r.W > maxW) { y += rowH; x = 0; rowH = 0; }
            pos[i] = (x, y);
            x += r.W;
            w = Math.Max(w, x);
            rowH = Math.Max(rowH, r.H);
        }
        return (w, Math.Max(1, y + rowH), pos);
    }

    private void EnsureAtlas(int w, int h, uint format)
    {
        if (_atlas != 0 && _atlasW >= w && _atlasH >= h) return;
        if (_atlas != 0) D3D11.Release(_atlas);
        _atlasW = (uint)Math.Max(w, (int)_atlasW);
        _atlasH = (uint)Math.Max(h, (int)_atlasH);
        _atlas = D3D11.CreateStaging(_device, _atlasW, _atlasH, format);
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        try { if (_pool is not null) _pool.FrameArrived -= OnFrameArrived; } catch (Exception) { }
        try { if (_item is not null) _item.Closed -= OnClosed; } catch (Exception) { }
        try { _session?.Dispose(); } catch (Exception) { }
        try { _pool?.Dispose(); } catch (Exception) { }
        lock (_gpu)
        {
            if (_atlas != 0) D3D11.Release(_atlas);
            if (_full != 0) D3D11.Release(_full);
            if (_last != 0) D3D11.Release(_last);
            _atlas = _full = _last = 0;
            // M8: the WinRT IDirect3DDevice wrapper holds its own reference to the DXGI device: close it too.
            try { _winrt?.Dispose(); } catch (Exception) { }
            _winrt = null;
            if (_context != 0) D3D11.Release(_context);
            if (_device != 0) D3D11.Release(_device);
            _context = _device = 0;
        }
    }
}
