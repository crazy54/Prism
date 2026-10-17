#if !PRISM_DESKTOP
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.WinShell.Shared.DesktopShim;

// TEMPORARY thin adapters behind the Desktop contract (CONTRACT-platform.md §1.1–§1.3), used until PrismControl.Desktop is
// integrated. They follow the research (windows.md §2): Raymond Chen's alt-tab walk + DWM cloaking, a WinEvent hook on an
// STA pump for changes and LastExternalForeground, IShellItemImageFactory icons. Safe mode swaps the two writers
// (foreground, input) for logging fakes; reads stay real.

/// <summary>Alt-tab windows in z-order, kept fresh by WinEvent hooks on the shell thread.</summary>
internal sealed unsafe partial class LocalWindowCatalog : IWindowCatalog, IDisposable
{
    private sealed record Meta(int Pid, string ProcessName, string? ExePath, string? Aumid, bool Elevated);

    private static LocalWindowCatalog? s_current;
    [ThreadStatic] private static List<nint>? t_enum;

    private readonly StaPump _shell;
    private readonly ConcurrentDictionary<nint, Meta> _meta = new();
    private readonly ConcurrentDictionary<uint, string> _exeByPid = new();
    private readonly List<nint> _hooks = [];
    private readonly int _ownPid = Environment.ProcessId;
    private nint _lastExternal;

    public LocalWindowCatalog(StaPump shell)
    {
        _shell = shell;
        s_current = this;
        var fg = Native.GetForegroundWindow();
        if (IsExternal(fg)) _lastExternal = fg;
        _shell.InvokeAsync(InstallHooks).Wait(TimeSpan.FromSeconds(2));
    }

    public event Action<WindowEvent>? Changed;

    public nint LastExternalForeground => Native.IsWindow(_lastExternal) != 0 ? _lastExternal : 0;

    public IReadOnlyList<WindowInfo> AltTabWindows()
    {
        var all = t_enum ??= new List<nint>(1024);
        all.Clear();
        Native.EnumWindows(&EnumCb, 0);
        var shellWindow = Native.GetShellWindow();
        var list = new List<WindowInfo>();
        using var dpi = ThreadDpi.PerMonitorV2();
        foreach (var h in all)
        {
            if (h == shellWindow || !IsAltTab(h)) continue;
            if (Describe(h) is { } w) list.Add(w);
        }
        all.Clear();
        // Forget metadata for windows that are gone.
        if (_meta.Count > 256)
            foreach (var k in _meta.Keys) if (Native.IsWindow(k) == 0) _meta.TryRemove(k, out _);
        return list;
    }

    public WindowInfo? Get(nint hwnd)
    {
        if (hwnd == 0 || Native.IsWindow(hwnd) == 0) return null;
        using var dpi = ThreadDpi.PerMonitorV2();
        return Describe(hwnd);
    }

    [UnmanagedCallersOnly]
    private static int EnumCb(nint h, nint _)
    {
        t_enum?.Add(h);
        return 1;
    }

    /// <summary>Raymond Chen's walk (oldnewthing 2007-10-08) with the intended `!= walk` comparison, plus modern filters.</summary>
    internal static bool IsAltTab(nint h)
    {
        if (Native.IsWindowVisible(h) == 0) return false;
        var ex = (uint)Native.GetWindowLongPtrW(h, Native.GWL_EXSTYLE);
        bool tool = (ex & Native.WS_EX_TOOLWINDOW) != 0, app = (ex & Native.WS_EX_APPWINDOW) != 0;
        if (tool && !app) return false;
        if ((ex & Native.WS_EX_NOACTIVATE) != 0 && !app) return false;
        if (Native.GetWindowTextLengthW(h) == 0) return false;
        var walk = Native.GetAncestor(h, Native.GA_ROOTOWNER);
        nint next;
        while ((next = Native.GetLastActivePopup(walk)) != walk)
        {
            if (Native.IsWindowVisible(next) != 0) break;
            walk = next;
        }
        return walk == h || app;
    }

    private WindowInfo? Describe(nint h)
    {
        var meta = _meta.GetOrAdd(h, ReadMeta);
        if (meta.Pid == 0) return null;
        var bounds = Native.FrameBounds(h);
        return new WindowInfo(h, meta.Pid, meta.ProcessName, meta.ExePath, Native.WindowText(h), meta.Aumid,
            Native.IsIconic(h) != 0, Native.IsZoomed(h) != 0, Native.Cloaked(h) != 0, meta.Elevated,
            Native.MonitorFromWindow(h, Native.MONITOR_DEFAULTTONEAREST), new RectI(bounds.Left, bounds.Top, bounds.Right, bounds.Bottom));
    }

    private static Meta ReadMeta(nint h)
    {
        Native.GetWindowThreadProcessId(h, out var pid);
        // UWP apps: the frame belongs to ApplicationFrameHost; the app is the CoreWindow child's process.
        var path = Native.ImagePath(pid);
        if (path is not null && Path.GetFileName(path).Equals("ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase))
        {
            var core = FindWindowExW(h, 0, "Windows.UI.Core.CoreWindow", null);
            if (core != 0)
            {
                Native.GetWindowThreadProcessId(core, out var appPid);
                if (appPid != 0 && Native.ImagePath(appPid) is { } appPath) { pid = appPid; path = appPath; }
            }
        }
        var il = Native.Integrity(pid, out _);
        var elevated = il == -2 || (il > Native.OwnIntegrity);
        return new Meta((int)pid, path is null ? "?" : Path.GetFileName(path), path, ReadAumid(h), elevated);
    }

    private static string? ReadAumid(nint h)
    {
        try
        {
            var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
            nint ps;
            if (SHGetPropertyStoreForWindow(h, &iid, &ps) != 0 || ps == 0) return null;
            try
            {
                var key = stackalloc byte[20];
                *(Guid*)key = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
                *(uint*)(key + 16) = 5; // PKEY_AppUserModel_ID
                var pv = stackalloc byte[24];
                new Span<byte>(pv, 24).Clear();
                var hr = ((delegate* unmanaged[Stdcall]<nint, byte*, byte*, int>)Native.Slot(ps, 5))(ps, key, pv);
                string? s = null;
                if (hr == 0 && *(ushort*)pv == 31 /* VT_LPWSTR */) s = new string(*(char**)(pv + 8));
                PropVariantClear(pv);
                return s;
            }
            finally { Native.Release(ps); }
        }
        catch { return null; }
    }

    private bool IsExternal(nint h)
    {
        if (h == 0 || Native.IsWindow(h) == 0) return false;
        Native.GetWindowThreadProcessId(h, out var pid);
        if (pid == 0 || pid == _ownPid) return false;
        var exe = _exeByPid.GetOrAdd(pid, p => Path.GetFileName(Native.ImagePath(p) ?? "") ?? "");
        return !exe.StartsWith("StreamDeck", StringComparison.OrdinalIgnoreCase);
    }

    // ---------------------------------------------------------------- WinEvent hooks (shell thread)

    private void InstallHooks()
    {
        foreach (var (min, max) in new (uint, uint)[] { (0x0003, 0x0003), (0x0016, 0x0017), (0x8000, 0x8003), (0x800C, 0x800C), (0x8017, 0x8018) })
        {
            var h = SetWinEventHook(min, max, 0, &WinEventProc, 0, 0, 0x0000 /* WINEVENT_OUTOFCONTEXT */ | 0x0002 /* SKIPOWNPROCESS */);
            if (h != 0) _hooks.Add(h);
        }
    }

    [UnmanagedCallersOnly]
    private static void WinEventProc(nint hook, uint evt, nint hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (idObject != 0 || idChild != 0 || hwnd == 0) return;
        var self = s_current;
        if (self is null) return;
        if (Native.GetAncestor(hwnd, Native.GA_ROOT) != hwnd) return;
        var kind = evt switch
        {
            0x0003 => WindowEventKind.Foreground,
            0x0016 => WindowEventKind.Minimized,
            0x0017 => WindowEventKind.Restored,
            0x8000 => WindowEventKind.Created,
            0x8001 => WindowEventKind.Destroyed,
            0x8002 => WindowEventKind.Shown,
            0x8003 => WindowEventKind.Hidden,
            0x800C => WindowEventKind.TitleChanged,
            0x8017 => WindowEventKind.Cloaked,
            _ => WindowEventKind.Uncloaked,
        };
        if (kind == WindowEventKind.Foreground && self.IsExternal(hwnd)) self._lastExternal = hwnd;
        if (kind == WindowEventKind.Destroyed) self._meta.TryRemove(hwnd, out _);
        // Creates/shows of non-alt-tab windows are very frequent: only report windows that matter.
        if (kind is WindowEventKind.Created or WindowEventKind.Shown or WindowEventKind.TitleChanged && !IsAltTab(hwnd)) return;
        var e = new WindowEvent(kind, hwnd);
        ThreadPool.UnsafeQueueUserWorkItem(static s => s.self.Changed?.Invoke(s.e), (self, e), preferLocal: false);
    }

    public void Dispose()
    {
        var hooks = _hooks.ToArray();
        _hooks.Clear();
        _shell.InvokeAsync(() => { foreach (var h in hooks) UnhookWinEvent(h); }).Wait(TimeSpan.FromSeconds(1));
        if (s_current == this) s_current = null;
    }

    [LibraryImport("user32.dll")] private static partial nint SetWinEventHook(uint min, uint max, nint module, delegate* unmanaged<nint, uint, nint, int, int, uint, uint, void> proc, uint pid, uint tid, uint flags);
    [LibraryImport("user32.dll")] private static partial int UnhookWinEvent(nint hook);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] private static partial nint FindWindowExW(nint parent, nint after, string? cls, string? title);
    [LibraryImport("shell32.dll")] private static partial int SHGetPropertyStoreForWindow(nint hwnd, Guid* riid, nint* ppv);
    [LibraryImport("ole32.dll")] private static partial int PropVariantClear(void* pv);
}

/// <summary>The real foreground helper: a dummy F22 key event (the trick Chromium's ui::ForegroundHelper relies on) gives
/// this background process the foreground right, then SetForegroundWindow, with SwitchToThisWindow as the fallback.</summary>
internal sealed class LocalForegroundService(LocalWindowCatalog catalog, ILog log) : IForegroundService
{
    public nint GetForeground() => Native.GetForegroundWindow();
    public nint LastExternalForeground => catalog.LastExternalForeground;

    public async Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default)
    {
        if (hwnd == 0 || Native.IsWindow(hwnd) == 0) return ForegroundResult.NoWindow;
        var minimized = Native.IsIconic(hwnd) != 0;
        if (!minimized && Native.GetForegroundWindow() == hwnd) return ForegroundResult.AlreadyFocused;
        Native.GetWindowThreadProcessId(hwnd, out var pid);
        var il = Native.Integrity(pid, out _);
        var elevated = il == -2 || il > Native.OwnIntegrity;
        if (minimized) Native.ShowWindow(hwnd, Native.SW_RESTORE);
        SendF22();
        Native.SetForegroundWindow(hwnd);
        await Task.Delay(60, ct).ConfigureAwait(false);
        if (Native.GetForegroundWindow() != hwnd)
        {
            Native.SwitchToThisWindow(hwnd, 1);
            await Task.Delay(90, ct).ConfigureAwait(false);
        }
        if (Native.GetForegroundWindow() == hwnd) return minimized ? ForegroundResult.Restored : ForegroundResult.Focused;
        log.Info($"foreground refused for pid {pid}{(elevated ? " (elevated)" : "")}");
        return elevated ? ForegroundResult.Elevated : ForegroundResult.Refused;
    }

    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default)
    {
        SendF22();
        return Task.FromResult(AllowSetForegroundWindow((uint)pid) != 0);
    }

    private static unsafe void SendF22()
    {
        var inputs = stackalloc INPUT[2];
        inputs[0] = new INPUT { type = 1, wVk = 0x85 };
        inputs[1] = new INPUT { type = 1, wVk = 0x85, dwFlags = 0x2 };
        Native.SendInput(2, inputs, sizeof(INPUT));
    }

    [DllImport("user32.dll")] private static extern int AllowSetForegroundWindow(uint pid);
}

/// <summary>SendInput chords (down in order, up in reverse, one atomic batch; always releases what went down).</summary>
internal sealed class LocalInputSender : IInputSender
{
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => Task.FromResult(Send(keys));
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => Task.FromResult(Send([key]));

    public Task<bool> SendTextAsync(string text, CancellationToken ct = default)
    {
        var list = new List<INPUT>();
        foreach (var c in text)
        {
            list.Add(new INPUT { type = 1, wScan = c, dwFlags = 0x4 });
            list.Add(new INPUT { type = 1, wScan = c, dwFlags = 0x4 | 0x2 });
        }
        return Task.FromResult(SendBatch(list.ToArray()) == list.Count);
    }

    public bool TargetIsElevated(nint hwnd)
    {
        Native.GetWindowThreadProcessId(hwnd, out var pid);
        var il = Native.Integrity(pid, out _);
        return il == -2 || il > Native.OwnIntegrity;
    }

    private static bool Send(IReadOnlyList<VirtualKey> keys)
    {
        var arr = new INPUT[keys.Count * 2];
        for (var i = 0; i < keys.Count; i++)
        {
            arr[i] = Key((ushort)keys[i], up: false);
            arr[keys.Count * 2 - 1 - i] = Key((ushort)keys[i], up: true);
        }
        var sent = SendBatch(arr);
        if (sent == arr.Length) return true;
        // Release everything that may have gone down.
        var ups = Enumerable.Range(0, keys.Count).Select(i => Key((ushort)keys[keys.Count - 1 - i], up: true)).ToArray();
        SendBatch(ups);
        return false;
    }

    private static INPUT Key(ushort vk, bool up)
    {
        var extended = vk is 0x25 or 0x26 or 0x27 or 0x28 or 0x5B or 0x5C or 0x2D or 0x2E or 0x24 or 0x23 or 0x21 or 0x22;
        return new INPUT { type = 1, wVk = vk, dwFlags = (extended ? 0x1u : 0) | (up ? 0x2u : 0) };
    }

    private static unsafe int SendBatch(INPUT[] inputs)
    {
        if (inputs.Length == 0) return 0;
        fixed (INPUT* p = inputs) return (int)Native.SendInput((uint)inputs.Length, p, sizeof(INPUT));
    }
}

/// <summary>IShellItemImageFactory on the exe path (or shell:AppsFolder\AUMID) on the shell thread, cached per app and size.</summary>
internal sealed partial class LocalIconProvider(StaPump shell) : IIconProvider
{
    private readonly ConcurrentDictionary<string, Task<byte[]?>> _cache = new(StringComparer.OrdinalIgnoreCase);

    public Task<byte[]?> GetAppIconPngAsync(WindowInfo w, int sizePx, CancellationToken ct = default)
    {
        var source = w.ExePath is { Length: > 0 } p ? p : w.AppUserModelId is { Length: > 0 } a ? @"shell:AppsFolder\" + a : null;
        if (source is null) return Task.FromResult<byte[]?>(null);
        var key = source + "|" + sizePx;
        return _cache.GetOrAdd(key, _ => Load(source, sizePx));
    }

    private async Task<byte[]?> Load(string source, int size)
    {
        var img = await shell.InvokeAsync(() => Extract(source, size)).ConfigureAwait(false);
        return img is null ? null : ImageCodec.EncodePng(img, premultiplied: true);
    }

    private static unsafe BgraImage? Extract(string source, int size)
    {
        var iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        nint fac;
        if (SHCreateItemFromParsingName(source, 0, &iid, &fac) != 0 || fac == 0) return null;
        try
        {
            nint hbm;
            var sz = new SIZE { cx = size, cy = size };
            var hr = ((delegate* unmanaged[Stdcall]<nint, SIZE, int, nint*, int>)Native.Slot(fac, 3))(fac, sz, 0x4 /* SIIGBF_ICONONLY */, &hbm);
            if (hr != 0 || hbm == 0) return null;
            try
            {
                BITMAP bm;
                GetObjectW(hbm, sizeof(BITMAP), &bm);
                if (bm.bmWidth <= 0 || bm.bmHeight <= 0 || bm.bmBitsPixel != 32) return null;
                var img = BgraImage.Create(bm.bmWidth, bm.bmHeight);
                var bi = new BITMAPINFOHEADER { biSize = 40, biWidth = bm.bmWidth, biHeight = -bm.bmHeight, biPlanes = 1, biBitCount = 32 };
                var dc = CreateCompatibleDC(0);
                try { fixed (byte* p = img.Pixels) GetDIBits(dc, hbm, 0, (uint)bm.bmHeight, p, &bi, 0); }
                finally { DeleteDC(dc); }
                return img;
            }
            finally { DeleteObject(hbm); }
        }
        finally { Native.Release(fac); }
    }

    [LibraryImport("shell32.dll", StringMarshalling = StringMarshalling.Utf16)] private static unsafe partial int SHCreateItemFromParsingName(string path, nint bc, Guid* riid, nint* ppv);
    [LibraryImport("gdi32.dll")] private static unsafe partial int GetObjectW(nint obj, int size, void* buf);
    [LibraryImport("gdi32.dll")] private static partial int DeleteObject(nint obj);
    [LibraryImport("gdi32.dll")] private static partial nint CreateCompatibleDC(nint dc);
    [LibraryImport("gdi32.dll")] private static partial int DeleteDC(nint dc);
    [LibraryImport("gdi32.dll")] private static unsafe partial int GetDIBits(nint dc, nint hbm, uint start, uint lines, void* bits, BITMAPINFOHEADER* bi, uint usage);
}
#endif
