using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>App icons for windows, as PNG. Real: <see cref="IconProvider"/>. Read-only: safe mode does not apply.</summary>
public interface IIconProvider
{
    /// <summary>
    /// A <paramref name="sizePx"/>×<paramref name="sizePx"/> PNG (16–256; the icon is fitted and centered on transparency)
    /// for Win32 and packaged (AUMID) apps, or null when no icon could be read. Cached by AUMID / exe path and size.
    /// Never runs shell calls on the caller's thread.
    /// </summary>
    Task<byte[]?> GetAppIconPngAsync(WindowInfo w, int sizePx, CancellationToken ct = default);
}

/// <summary>
/// The icon ladder (research/windows-probe-results.md §4, lead constraint 5), all on the shell thread (STA, COM):
/// <list type="number">
/// <item>the window's own icon: WM_GETICON (SendMessageTimeout 100 ms, ICON_BIG then ICON_SMALL2), then GCLP_HICON /
/// GCLP_HICONSM (class icons also work for elevated windows, whose messages UIPI drops). Used when it is at least ¾ of
/// the requested size (WM_GETICON is 32 px for most apps; Orca's is 256);</item>
/// <item>IShellItemImageFactory at the requested size: <c>shell:AppsFolder\&lt;AUMID&gt;</c> when the window has one,
/// then the exe path (11–94 ms, hence the cache);</item>
/// <item>the window icon at whatever size it had.</item>
/// </list>
/// Results (including "no icon", for 5 minutes) are cached in memory: at most 256 entries, oldest evicted.
/// </summary>
public sealed class IconProvider : IIconProvider
{
    private const int MaxEntries = 256;
    private static readonly TimeSpan NegativeTtl = TimeSpan.FromMinutes(5);

    private readonly IShellThread _shell;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly Func<WindowInfo, int, BgraImage?> _load;
    private readonly object _gate = new();
    private readonly Dictionary<string, (byte[]? Png, DateTimeOffset At, long Order)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Task<byte[]?>> _inflight = new(StringComparer.OrdinalIgnoreCase);
    private long _order;

    public IconProvider(IShellThread shell, ILog? log = null, TimeProvider? time = null)
        : this(shell, log, time, IconBitmaps.Load) { }

    internal IconProvider(IShellThread shell, ILog? log, TimeProvider? time, Func<WindowInfo, int, BgraImage?> load)
    {
        _shell = shell;
        _log = (log ?? NullLog.Instance).For("icons");
        _time = time ?? TimeProvider.System;
        _load = load;
    }

    /// <summary>How many shell/window loads ran (tests: proves the cache).</summary>
    internal int Loads;

    public static string CacheKey(WindowInfo w, int sizePx) =>
        (w.AppUserModelId is { Length: > 0 } a ? "aumid:" + a : w.ExePath is { Length: > 0 } p ? "exe:" + p : "hwnd:" + w.Hwnd) + "@" + sizePx;

    public Task<byte[]?> GetAppIconPngAsync(WindowInfo w, int sizePx, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(w);
        ct.ThrowIfCancellationRequested();
        sizePx = Math.Clamp(sizePx, 16, 256);
        var key = CacheKey(w, sizePx);
        Task<byte[]?> task;
        lock (_gate)
        {
            if (_cache.TryGetValue(key, out var hit) && (hit.Png is not null || _time.GetUtcNow() - hit.At < NegativeTtl))
            {
                _cache[key] = hit with { Order = ++_order };
                return Task.FromResult(hit.Png);
            }
            if (!_inflight.TryGetValue(key, out task!))
            {
                task = LoadAsync(w, sizePx, key);
                _inflight[key] = task;
            }
        }
        return task.WaitAsync(ct);
    }

    private async Task<byte[]?> LoadAsync(WindowInfo w, int sizePx, string key)
    {
        byte[]? png = null;
        try
        {
            await Task.Yield();
            Interlocked.Increment(ref Loads);
            var img = await _shell.InvokeAsync(() => _load(w, sizePx)).ConfigureAwait(false);
            if (img is not null) png = PngWriter.Encode(img.FitSquare(sizePx)); // already off the shell thread
        }
        catch (Exception ex)
        {
            _log.Debug("Icon load failed: " + ex.GetType().Name);
        }
        lock (_gate)
        {
            _inflight.Remove(key);
            _cache[key] = (png, _time.GetUtcNow(), ++_order);
            if (_cache.Count > MaxEntries)
            {
                var oldest = _cache.MinBy(kv => kv.Value.Order).Key;
                _cache.Remove(oldest);
            }
        }
        return png;
    }

    internal int CacheCount { get { lock (_gate) return _cache.Count; } }
}

/// <summary>Win32/shell icon extraction. Call on the shell thread (STA, COM initialized).</summary>
internal static unsafe class IconBitmaps
{
    private static readonly Guid IidShellItemImageFactory = new("bcc18b79-ba16-442f-80c4-8a59c30c463b");
    private const int SiigbfIconOnly = 0x4;
    private const int MaxIconPx = 1024;

    public static BgraImage? Load(WindowInfo w, int sizePx)
    {
        var windowIcon = w.Hwnd != 0 && User32.IsWindow(w.Hwnd) != 0 ? FromWindow(w.Hwnd) : null;
        if (windowIcon is not null && Math.Max(windowIcon.Width, windowIcon.Height) * 4 >= sizePx * 3) return windowIcon;
        if (w.AppUserModelId is { Length: > 0 } aumid && FromShell(@"shell:AppsFolder\" + aumid, sizePx) is { } packaged) return packaged;
        if (w.ExePath is { Length: > 0 } exe && FromShell(exe, sizePx) is { } file) return file;
        return windowIcon;
    }

    /// <summary>The largest of the window's icons (WM_GETICON big/small2, class icon, class small icon).</summary>
    public static BgraImage? FromWindow(nint hwnd)
    {
        BgraImage? best = null;
        void Consider(nint hIcon)
        {
            if (hIcon == 0) return;
            var img = FromIcon(hIcon);
            if (img is not null && (best is null || img.Width > best.Width)) best = img;
        }
        if (User32.SendMessageTimeoutW(hwnd, User32.WM_GETICON, User32.ICON_BIG, 0, User32.SMTO_ABORTIFHUNG, 100, out var big) != 0) Consider(big);
        if (best is null && User32.SendMessageTimeoutW(hwnd, User32.WM_GETICON, User32.ICON_SMALL2, 0, User32.SMTO_ABORTIFHUNG, 100, out var small) != 0) Consider(small);
        Consider(User32.GetClassLongPtrW(hwnd, User32.GCLP_HICON));
        if (best is null) Consider(User32.GetClassLongPtrW(hwnd, User32.GCLP_HICONSM));
        return best;
    }

    /// <summary>HICON → straight BGRA. Alpha comes from a 32-bpp color bitmap, else from the AND mask. Does not destroy the icon.</summary>
    public static BgraImage? FromIcon(nint hIcon)
    {
        if (User32.GetIconInfo(hIcon, out var ii) == 0) return null;
        try
        {
            if (ii.hbmColor == 0)
            {
                // Monochrome: the mask is double height (AND on top, XOR below).
                var m = ReadBitmap(ii.hbmMask, out var mw, out var mh);
                if (m is null || mh < 2) return null;
                var h = mh / 2;
                var px = new byte[mw * h * 4];
                for (var i = 0; i < mw * h; i++)
                {
                    var and = m[i * 4];
                    var xor = m[(mw * h + i) * 4];
                    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = xor;
                    px[i * 4 + 3] = (byte)(and == 0 ? 255 : 0);
                }
                return new BgraImage(mw, h, px);
            }
            var color = ReadBitmap(ii.hbmColor, out var w, out var hh);
            if (color is null) return null;
            var hasAlpha = false;
            for (var i = 3; i < color.Length; i += 4) if (color[i] != 0) { hasAlpha = true; break; }
            if (!hasAlpha)
            {
                var mask = ii.hbmMask != 0 ? ReadBitmap(ii.hbmMask, out var mw, out var mh) : null;
                for (var i = 0; i < w * hh; i++)
                    color[i * 4 + 3] = (byte)(mask is null || mask[i * 4] == 0 ? 255 : 0); // AND bit 0 = opaque
            }
            return new BgraImage(w, hh, color);
        }
        finally
        {
            if (ii.hbmColor != 0) Gdi32.DeleteObject(ii.hbmColor);
            if (ii.hbmMask != 0) Gdi32.DeleteObject(ii.hbmMask);
        }
    }

    /// <summary>IShellItemImageFactory.GetImage(SIIGBF_ICONONLY) for a parsing name (an exe path or shell:AppsFolder\AUMID).</summary>
    public static BgraImage? FromShell(string parsingName, int sizePx)
    {
        var iid = IidShellItemImageFactory;
        nint factory;
        if (Shell32.SHCreateItemFromParsingName(parsingName, 0, &iid, &factory) != 0 || factory == 0) return null;
        try
        {
            nint hbm;
            var size = new SIZE { cx = sizePx, cy = sizePx };
            var hr = ((delegate* unmanaged[Stdcall]<nint, SIZE, int, nint*, int>)ComVtbl.Slot(factory, 3))(factory, size, SiigbfIconOnly, &hbm);
            if (hr != 0 || hbm == 0) return null;
            try
            {
                var px = ReadBitmap(hbm, out var w, out var h);
                if (px is null) return null;
                BgraImage.UnpremultiplyIfNeeded(px);
                var img = new BgraImage(w, h, px);
                return img.IsFullyTransparent() ? null : img;
            }
            finally { Gdi32.DeleteObject(hbm); }
        }
        finally { ComVtbl.Release(factory); }
    }

    /// <summary>Any HBITMAP → 32-bpp top-down BGRA via GetDIBits.</summary>
    public static byte[]? ReadBitmap(nint hbm, out int width, out int height)
    {
        width = height = 0;
        BITMAP bm;
        if (Gdi32.GetObjectW(hbm, sizeof(BITMAP), &bm) == 0) return null;
        width = bm.bmWidth;
        height = Math.Abs(bm.bmHeight);
        if (width <= 0 || height <= 0 || width > MaxIconPx || height > MaxIconPx * 2) return null;
        var info = stackalloc byte[sizeof(BITMAPINFOHEADER) + 256 * 4]; // room for a color table, which 32-bpp output never needs
        var bmi = (BITMAPINFOHEADER*)info;
        *bmi = new BITMAPINFOHEADER { biSize = (uint)sizeof(BITMAPINFOHEADER), biWidth = width, biHeight = -height, biPlanes = 1, biBitCount = 32 };
        var px = new byte[width * height * 4];
        var dc = User32.GetDC(0);
        try
        {
            fixed (byte* p = px)
                return Gdi32.GetDIBits(dc, hbm, 0, (uint)height, p, bmi, 0) == height ? px : null;
        }
        finally { User32.ReleaseDC(0, dc); }
    }
}
