using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.WinShell.Shared;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;

namespace PrismControl.WinShell.Switcher;

/// <summary>
/// Live window thumbnails with Windows.Graphics.Capture (research/windows.md §2; probe "capture": borderless is Allowed
/// with no prompt here, CreateForWindow 2 ms, frames only when content changes, 0 frames while minimized).
/// <para>
/// Cost control, so 12 keys + 1 widget stay cheap:
/// <list type="bullet">
/// <item>one capture session per window, shared by every lease (a key and the browser showing the same window);</item>
/// <item>the session's MinUpdateInterval (raw ABI, not in the 22621 projection) is the fastest lease's interval, and
///   frames arriving early are dropped before any copy;</item>
/// <item>the GPU downscales: the frame is copied into a mip-chained texture, GenerateMips box-filters it, and only the mip
///   level just above the thumbnail size is read back (a few hundred KB instead of a 19 MB 3440×1388 frame);</item>
/// <item>JPEG encoding runs per due lease on the thread pool, never on the capture thread.</item>
/// </list>
/// Pixels live in memory only; nothing is saved or logged. The border is never shown (IsBorderRequired = false), and if
/// borderless capture is not allowed the source reports unavailable and keys show icons instead.
/// </para>
/// </summary>
internal sealed class WgcThumbnailSource : IThumbnailSource
{
    private static readonly Guid IID_IDXGIDevice = new("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
    private static readonly Guid IID_DxgiInterfaceAccess = new("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1");
    private static readonly Guid IID_ID3D11Texture2D = new("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
    private static readonly Guid IID_ItemInterop = new("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");
    private static readonly Guid IID_GraphicsCaptureItem = new("79C3F95B-31F7-4EC2-A464-632EF5D30760");
    private static readonly Guid IID_Session5 = new("67c0ea62-1f85-5061-925a-239be0ac09cb");
    private const uint DXGI_FORMAT_B8G8R8A8_UNORM = 87;

    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly object _d3d = new();
    private readonly Dictionary<nint, Session> _sessions = [];
    private nint _device, _context;
    private IDirect3DDevice? _winrtDevice;
    private Task<bool>? _availability;
    private bool _disposed;

    public WgcThumbnailSource(ILog log) => _log = log;

    public ThumbnailStats Stats { get; } = new();

    public bool IsAvailable => _availability is { IsCompletedSuccessfully: true } t && t.Result;

    public Task<bool> EnsureAvailableAsync()
    {
        lock (_gate) return _availability ??= CheckAsync();
    }

    private async Task<bool> CheckAsync()
    {
        try
        {
            if (!GraphicsCaptureSession.IsSupported()) { _log.Info("thumbnails: Windows.Graphics.Capture is not supported; keys show icons"); return false; }
            var access = await GraphicsCaptureAccess.RequestAccessAsync(GraphicsCaptureAccessKind.Borderless);
            if (access != Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus.Allowed)
            {
                _log.Info($"thumbnails: borderless capture is {access}; keys show icons (a yellow capture border is never acceptable)");
                return false;
            }
            lock (_d3d) return CreateDevice();
        }
        catch (Exception ex)
        {
            _log.Warn("thumbnails: capture is unavailable; keys show icons", ex);
            return false;
        }
    }

    private bool CreateDevice()
    {
        if (_device != 0) return true;
        var hr = Native.D3D11CreateDevice(0, 1 /* HARDWARE */, 0, 0x20 /* BGRA_SUPPORT */, 0, 0, 7, out var dev, out _, out var ctx);
        if (hr != 0) { _log.Warn($"thumbnails: D3D11CreateDevice 0x{hr:X8}"); return false; }
        if (Native.QueryInterface(dev, IID_IDXGIDevice, out var dxgi) != 0) { Native.Release(ctx); Native.Release(dev); return false; }
        try
        {
            if (Native.CreateDirect3D11DeviceFromDXGIDevice(dxgi, out var insp) != 0) { Native.Release(ctx); Native.Release(dev); return false; }
            _winrtDevice = WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(insp);
            Native.Release(insp);
        }
        finally { Native.Release(dxgi); }
        _device = dev;
        _context = ctx;
        return true;
    }

    public IThumbnailLease Subscribe(nint hwnd, ThumbnailRequest request)
    {
        var lease = new Lease(this, hwnd, request);
        if (!IsAvailable)
        {
            // Not checked yet: check, then attach. Unavailable leases simply stay Off.
            _ = EnsureAvailableAsync().ContinueWith(t =>
            {
                if (t.IsCompletedSuccessfully && t.Result) Attach(lease);
                else lease.SetState(CaptureState.Off);
            }, TaskScheduler.Default);
            return lease;
        }
        Attach(lease);
        return lease;
    }

    private void Attach(Lease lease)
    {
        Session? s;
        Session? replaced = null;
        lock (_gate)
        {
            if (_disposed || lease.IsDisposed) return;
            if (!_sessions.TryGetValue(lease.Hwnd, out s) || s.Dead)
            {
                // A dead session (its window closed; the handle may now be another window) leaves the map; it is disposed
                // here if nobody holds it, or when its last lease detaches.
                if (s is { Dead: true } && s.LeaseCount == 0) replaced = s;
                s = Session.Create(this, lease.Hwnd);
                if (s is null) { _sessions.Remove(lease.Hwnd); lease.SetState(CaptureState.Failed); }
                else _sessions[lease.Hwnd] = s;
                Stats.Sessions = _sessions.Count;
            }
            s?.Add(lease);
        }
        replaced?.Dispose();
    }

    private void Detach(Lease lease)
    {
        // Detach from the lease's OWN session (not whatever the map holds for that hwnd now).
        if (lease.Owner is not { } s) return;
        if (s.Remove(lease) > 0) return;
        lock (_gate)
        {
            if (_sessions.TryGetValue(lease.Hwnd, out var current) && ReferenceEquals(current, s)) _sessions.Remove(lease.Hwnd);
            Stats.Sessions = _sessions.Count;
        }
        s.Dispose();
    }

    public void Dispose()
    {
        Session[] all;
        lock (_gate)
        {
            _disposed = true;
            all = [.. _sessions.Values];
            _sessions.Clear();
        }
        foreach (var s in all) s.Dispose();
        lock (_d3d)
        {
            _winrtDevice = null;
            Native.Release(_context);
            Native.Release(_device);
            _context = _device = 0;
        }
    }

    // ================================================================ one capture session per window

    private sealed class Session : IDisposable
    {
        private readonly WgcThumbnailSource _owner;
        private readonly List<Lease> _leases = [];
        private readonly GraphicsCaptureItem _item;
        private readonly Direct3D11CaptureFramePool _pool;
        private readonly GraphicsCaptureSession _session;
        private Windows.Graphics.SizeInt32 _poolSize;
        private BgraImage? _source;
        private int _contentW, _contentH;
        private long _seq;
        private long _sourceTicks;
        private int _processing;
        private TimeSpan _appliedInterval = TimeSpan.MinValue;
        private nint _mipTex, _mipSrv, _staging;
        private int _mipW, _mipH, _stagingW, _stagingH;
        public volatile bool Dead;

        private Session(WgcThumbnailSource owner, nint hwnd, GraphicsCaptureItem item)
        {
            _owner = owner;
            Hwnd = hwnd;
            _item = item;
            _poolSize = item.Size;
            _pool = Direct3D11CaptureFramePool.CreateFreeThreaded(owner._winrtDevice!, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, _poolSize);
            _session = _pool.CreateCaptureSession(item);
            _session.IsCursorCaptureEnabled = false;
            _session.IsBorderRequired = false;
            _item.Closed += (_, _) => OnClosed();
            _pool.FrameArrived += (p, _) => OnFrame(p);
        }

        public nint Hwnd { get; }

        public int LeaseCount { get { lock (_leases) return _leases.Count; } }

        public static Session? Create(WgcThumbnailSource owner, nint hwnd)
        {
            try
            {
                var item = CreateItem(hwnd);
                if (item is null) return null;
                var s = new Session(owner, hwnd, item);
                s._session.StartCapture();
                return s;
            }
            catch (Exception ex)
            {
                owner._log.Debug($"thumbnails: capture refused for a window (0x{ex.HResult:X8})");
                return null;
            }
        }

        private static unsafe GraphicsCaptureItem? CreateItem(nint hwnd)
        {
            const string cls = "Windows.Graphics.Capture.GraphicsCaptureItem";
            if (Native.WindowsCreateString(cls, (uint)cls.Length, out var hs) != 0) return null;
            try
            {
                nint interop;
                var iid = IID_ItemInterop;
                if (Native.RoGetActivationFactory(hs, &iid, &interop) != 0) return null;
                try
                {
                    nint itemPtr;
                    var iidItem = IID_GraphicsCaptureItem;
                    var hr = ((delegate* unmanaged[Stdcall]<nint, nint, Guid*, nint*, int>)Native.Slot(interop, 3))(interop, hwnd, &iidItem, &itemPtr);
                    if (hr != 0 || itemPtr == 0) return null;
                    var item = GraphicsCaptureItem.FromAbi(itemPtr);
                    Native.Release(itemPtr);
                    return item;
                }
                finally { Native.Release(interop); }
            }
            finally { Native.WindowsDeleteString(hs); }
        }

        public void Add(Lease lease)
        {
            lock (_leases) _leases.Add(lease);
            lease.Attach(this);
            ApplyInterval();
            var src = _source;
            // A static window sends no new frames: serve a late subscriber from the last frame, or restart for a bigger one.
            if (src is not null)
            {
                var (tw, th) = ImageCodec.FitInside(_contentW, _contentH, lease.Request.MaxWidth, lease.Request.MaxHeight);
                if (src.Width >= tw && src.Height >= th) Deliver(lease, src, Interlocked.Increment(ref _seq), _sourceTicks);
                else _ = RestartForSizeAsync();
            }
            else lease.SetState(CaptureState.Starting);
        }

        private async Task RestartForSizeAsync()
        {
            // Recreating the pool makes WGC send a fresh frame.
            await Task.Yield();
            try { lock (_owner._d3d) _pool.Recreate(_owner._winrtDevice!, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, _item.Size); }
            catch { /* the next content change will deliver */ }
        }

        public int Remove(Lease lease)
        {
            int n;
            lock (_leases) { _leases.Remove(lease); n = _leases.Count; }
            if (n > 0) ApplyInterval();
            return n;
        }

        public unsafe void ApplyInterval()
        {
            // Under the leases lock, so concurrent callers (mailboxes, the game timer, Focus) apply in a consistent order
            // and the last one always reflects the current leases.
            lock (_leases)
            {
                var min = _leases.Count == 0 ? TimeSpan.FromSeconds(1) : _leases.Min(l => l.Request.Interval);
                if (min == _appliedInterval || Dead) return;
                _appliedInterval = min;
                PutMinUpdateInterval(min);
            }
        }

        private unsafe void PutMinUpdateInterval(TimeSpan min)
        {
            try
            {
                // IGraphicsCaptureSession5.put_MinUpdateInterval (vtable 7): WGC itself stops sending frames faster than this.
                var p = ((WinRT.IWinRTObject)_session).NativeObject.ThisPtr;
                if (Native.QueryInterface(p, IID_Session5, out var s5) == 0)
                {
                    ((delegate* unmanaged[Stdcall]<nint, long, int>)Native.Slot(s5, 7))(s5, min.Ticks);
                    Native.Release(s5);
                }
            }
            catch { /* older Windows: we drop early frames ourselves */ }
        }

        private void OnClosed()
        {
            Dead = true;
            Lease[] leases;
            lock (_leases) leases = [.. _leases];
            foreach (var l in leases) l.SetState(CaptureState.Closed);
        }

        private void OnFrame(Direct3D11CaptureFramePool pool)
        {
            using var frame = pool.TryGetNextFrame();
            if (frame is null || Dead) return;
            _owner.Stats.Arrived();
            // Due-ness is judged on WGC's own frame clock (SystemRelativeTime): with MinUpdateInterval set to the fastest
            // lease's interval, every frame is due for that lease, and slower leases take every Nth frame. Wall-clock checks
            // dropped frames that arrived a millisecond "early".
            var now = frame.SystemRelativeTime.Ticks;
            Lease[] due;
            int maxW = 0, maxH = 0;
            lock (_leases)
            {
                due = _leases.Where(l => l.IsDue(now)).ToArray();
                foreach (var l in _leases) { maxW = Math.Max(maxW, l.Request.MaxWidth); maxH = Math.Max(maxH, l.Request.MaxHeight); }
            }
            if (due.Length == 0 || Interlocked.Exchange(ref _processing, 1) == 1) return;
            try
            {
                var cs = frame.ContentSize;
                int cw = Math.Max(1, cs.Width), ch = Math.Max(1, cs.Height);
                var sw = Stopwatch.StartNew();
                BgraImage? img;
                lock (_owner._d3d)
                {
                    // Dispose sets Dead and releases the textures under this same lock: never recreate them after that.
                    if (Dead) return;
                    img = ReadDownscaled(frame, Math.Min(cw, _poolSize.Width), Math.Min(ch, _poolSize.Height), maxW, maxH);
                }
                if (cs.Width != _poolSize.Width || cs.Height != _poolSize.Height)
                {
                    _poolSize = cs;
                    try { lock (_owner._d3d) pool.Recreate(_owner._winrtDevice!, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, cs); }
                    catch { /* keep the old pool */ }
                }
                if (img is null) return;
                _owner.Stats.Processed(sw.Elapsed);
                _source = img;
                _contentW = cw;
                _contentH = ch;
                _sourceTicks = now;
                var seq = Interlocked.Increment(ref _seq);
                foreach (var l in due) Deliver(l, img, seq, now);
            }
            catch (Exception ex)
            {
                _owner._log.Debug($"thumbnails: frame failed (0x{ex.HResult:X8})");
            }
            finally { Volatile.Write(ref _processing, 0); }
        }

        private void Deliver(Lease lease, BgraImage src, long seq, long frameTicks)
        {
            lease.MarkDelivered(frameTicks);
            var cw = _contentW > 0 ? _contentW : src.Width;
            var ch = _contentH > 0 ? _contentH : src.Height;
            var (tw, th) = ImageCodec.FitInside(cw, ch, lease.Request.MaxWidth, lease.Request.MaxHeight);
            tw = Math.Min(tw, src.Width);
            th = Math.Min(th, src.Height);
            _ = Task.Run(async () =>
            {
                try
                {
                    var t0 = Stopwatch.GetTimestamp();
                    var small = tw == src.Width && th == src.Height ? src : ImageCodec.Downscale(src, tw, th);
                    var jpeg = await ImageCodec.EncodeJpegAsync(small, 0.8).ConfigureAwait(false);
                    _owner.Stats.Delivered(jpeg.Length, Stopwatch.GetElapsedTime(t0));
                    lease.Deliver(new ThumbnailFrame(jpeg, small.Width, small.Height, seq));
                }
                catch (Exception ex) { _owner._log.Debug($"thumbnails: encode failed (0x{ex.HResult:X8})"); }
            });
        }

        /// <summary>GPU: frame → mip chain → the level just above the target → staging → CPU box filter to ≤ 2× the target.</summary>
        private unsafe BgraImage? ReadDownscaled(Direct3D11CaptureFrame frame, int cw, int ch, int maxW, int maxH)
        {
            var dev = _owner._device;
            var ctx = _owner._context;
            if (dev == 0) return null;
            var surf = WinRT.MarshalInterface<IDirect3DSurface>.FromManaged(frame.Surface);
            nint access = 0, tex = 0;
            try
            {
                if (Native.QueryInterface(surf, IID_DxgiInterfaceAccess, out access) != 0) return null;
                var iidTex = IID_ID3D11Texture2D;
                if (((delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)Native.Slot(access, 3))(access, &iidTex, &tex) != 0 || tex == 0) return null;

                var (tw, th) = ImageCodec.FitInside(cw, ch, Math.Max(1, maxW), Math.Max(1, maxH));
                var level = 0;
                while ((cw >> (level + 1)) >= tw && (ch >> (level + 1)) >= th && level < 12) level++;
                if (!EnsureMip(dev, cw, ch)) return null;
                var box = stackalloc uint[6] { 0, 0, 0, (uint)cw, (uint)ch, 1 };
                // CopySubresourceRegion (46): the frame's content area into mip 0.
                ((delegate* unmanaged[Stdcall]<nint, nint, uint, uint, uint, uint, nint, uint, uint*, void>)Native.Slot(ctx, 46))(ctx, _mipTex, 0, 0, 0, 0, tex, 0, box);
                // GenerateMips (54).
                ((delegate* unmanaged[Stdcall]<nint, nint, void>)Native.Slot(ctx, 54))(ctx, _mipSrv);
                int lw = Math.Max(1, cw >> level), lh = Math.Max(1, ch >> level);
                if (!EnsureStaging(dev, lw, lh)) return null;
                ((delegate* unmanaged[Stdcall]<nint, nint, uint, uint, uint, uint, nint, uint, uint*, void>)Native.Slot(ctx, 46))(ctx, _staging, 0, 0, 0, 0, _mipTex, (uint)level, null);
                var mapped = stackalloc byte[16];
                var hr = ((delegate* unmanaged[Stdcall]<nint, nint, uint, int, uint, byte*, int>)Native.Slot(ctx, 14))(ctx, _staging, 0, 1 /* READ */, 0, mapped);
                if (hr != 0) { _owner._log.Debug($"thumbnails: Map 0x{hr:X8}"); return null; }
                try
                {
                    var data = *(byte**)mapped;
                    var pitch = *(uint*)(mapped + 8);
                    var img = BgraImage.Create(lw, lh);
                    fixed (byte* d = img.Pixels)
                    {
                        for (var y = 0; y < lh; y++)
                        {
                            var row = data + (long)y * pitch;
                            var o = d + (long)y * lw * 4;
                            Buffer.MemoryCopy(row, o, lw * 4, lw * 4);
                            for (var x = 3; x < lw * 4; x += 4) o[x] = 255;
                        }
                    }
                    return img;
                }
                finally { ((delegate* unmanaged[Stdcall]<nint, nint, uint, void>)Native.Slot(ctx, 15))(ctx, _staging, 0); }
            }
            finally
            {
                Native.Release(tex);
                Native.Release(access);
                Native.Release(surf);
            }
        }

        private unsafe bool EnsureMip(nint dev, int w, int h)
        {
            if (_mipTex != 0 && _mipW == w && _mipH == h) return true;
            ReleaseTextures(mipOnly: true);
            var desc = stackalloc uint[11];
            desc[0] = (uint)w; desc[1] = (uint)h; desc[2] = 0 /* full chain */; desc[3] = 1; desc[4] = DXGI_FORMAT_B8G8R8A8_UNORM;
            desc[5] = 1; desc[6] = 0; desc[7] = 0 /* DEFAULT */; desc[8] = 0x8 | 0x20 /* SHADER_RESOURCE | RENDER_TARGET */; desc[9] = 0; desc[10] = 0x1 /* GENERATE_MIPS */;
            nint t;
            if (((delegate* unmanaged[Stdcall]<nint, uint*, nint, nint*, int>)Native.Slot(dev, 5))(dev, desc, 0, &t) != 0) return false;
            nint srv;
            if (((delegate* unmanaged[Stdcall]<nint, nint, nint, nint*, int>)Native.Slot(dev, 7))(dev, t, 0, &srv) != 0) { Native.Release(t); return false; }
            _mipTex = t; _mipSrv = srv; _mipW = w; _mipH = h;
            return true;
        }

        private unsafe bool EnsureStaging(nint dev, int w, int h)
        {
            if (_staging != 0 && _stagingW == w && _stagingH == h) return true;
            if (_staging != 0) { Native.Release(_staging); _staging = 0; }
            var desc = stackalloc uint[11];
            desc[0] = (uint)w; desc[1] = (uint)h; desc[2] = 1; desc[3] = 1; desc[4] = DXGI_FORMAT_B8G8R8A8_UNORM;
            desc[5] = 1; desc[6] = 0; desc[7] = 3 /* STAGING */; desc[8] = 0; desc[9] = 0x20000 /* CPU_ACCESS_READ */; desc[10] = 0;
            nint t;
            if (((delegate* unmanaged[Stdcall]<nint, uint*, nint, nint*, int>)Native.Slot(dev, 5))(dev, desc, 0, &t) != 0) return false;
            _staging = t; _stagingW = w; _stagingH = h;
            return true;
        }

        private void ReleaseTextures(bool mipOnly = false)
        {
            if (_mipSrv != 0) { Native.Release(_mipSrv); _mipSrv = 0; }
            if (_mipTex != 0) { Native.Release(_mipTex); _mipTex = 0; }
            _mipW = _mipH = 0;
            if (!mipOnly && _staging != 0) { Native.Release(_staging); _staging = 0; _stagingW = _stagingH = 0; }
        }

        public void Dispose()
        {
            lock (_owner._d3d)
            {
                Dead = true;
                ReleaseTextures();
            }
            try { _session.Dispose(); } catch { /* already closed */ }
            try { _pool.Dispose(); } catch { /* already closed */ }
            _source = null;
        }
    }

    // ================================================================ a consumer's handle

    private sealed class Lease(WgcThumbnailSource owner, nint hwnd, ThumbnailRequest request) : IThumbnailLease
    {
        private ThumbnailRequest _request = request;
        private Session? _session;
        private long _lastFrame = long.MinValue;
        private volatile ThumbnailFrame? _latest;
        private volatile CaptureState _state = CaptureState.Starting;
        public bool IsDisposed;

        public nint Hwnd { get; } = hwnd;
        public ThumbnailFrame? Latest => _latest;
        public CaptureState State => _state;
        public event Action? Updated;

        public ThumbnailRequest Request
        {
            get => _request;
            set
            {
                if (value == _request) return;
                _request = value;
                _session?.ApplyInterval();
            }
        }

        public void Attach(Session s) => _session = s;

        public Session? Owner => _session;

        /// <summary>2 ms of slack absorbs rounding in WGC's spacing; a key at 500 ms can never exceed 2 fps by more than that.</summary>
        private static readonly long Slack = TimeSpan.FromMilliseconds(2).Ticks;

        public bool IsDue(long frameTicks)
        {
            var last = Interlocked.Read(ref _lastFrame);
            return last == long.MinValue || frameTicks < last || frameTicks - last >= _request.Interval.Ticks - Slack;
        }

        public void MarkDelivered(long frameTicks) => Interlocked.Exchange(ref _lastFrame, frameTicks);

        public void Deliver(ThumbnailFrame f)
        {
            if (IsDisposed) return;
            _latest = f;
            _state = CaptureState.Live;
            Updated?.Invoke();
        }

        public void SetState(CaptureState s)
        {
            if (IsDisposed || _state == s) return;
            _state = s;
            Updated?.Invoke();
        }

        public void Dispose()
        {
            if (IsDisposed) return;
            IsDisposed = true;
            Updated = null;
            owner.Detach(this);
            _latest = null;
        }
    }
}
