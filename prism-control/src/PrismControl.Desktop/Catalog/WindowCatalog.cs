using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>
/// A top-level window, read in one pass. <see cref="Title"/> is personal data: never log it. <see cref="Bounds"/> is the
/// DWM extended frame (the visible frame, without the invisible resize borders) in physical pixels; for a minimized
/// window it is the off-screen iconic position, so check <see cref="IsMinimized"/>.
/// </summary>
/// <param name="Pid">The owning process. For UWP frames (ApplicationFrameHost) it is the hosted app's process when known.</param>
/// <param name="ProcessName">The exe file name ("chrome.exe"), or "" when the process cannot be read.</param>
/// <param name="AppUserModelId">The window's explicit AUMID (Chrome sets "Chrome"), else the package AUMID of a packaged app ("Pkg_xyz!App"), else null.</param>
/// <param name="IsCloaked">Cloaked by the shell because it lives on another virtual desktop (only such cloaked windows are listed).</param>
/// <param name="IsElevated">Its process runs above our integrity level: UIPI drops our messages and input, and it cannot be moved by us.</param>
/// <param name="Monitor">The HMONITOR it is on (nearest).</param>
public sealed record WindowInfo(nint Hwnd, int Pid, string ProcessName, string? ExePath, string Title, string? AppUserModelId,
    bool IsMinimized, bool IsMaximized, bool IsCloaked, bool IsElevated, nint Monitor, RectI Bounds);

public enum WindowEventKind
{
    /// <summary>EVENT_OBJECT_CREATE of a top-level window (often still hidden).</summary>
    Created,
    /// <summary>EVENT_OBJECT_DESTROY of a top-level window we had seen.</summary>
    Destroyed,
    /// <summary>EVENT_OBJECT_SHOW: a top-level window became visible (it may now be alt-tab eligible).</summary>
    Shown,
    /// <summary>EVENT_OBJECT_HIDE.</summary>
    Hidden,
    /// <summary>EVENT_OBJECT_NAMECHANGE of the window itself (coalesced while a previous one is still queued).</summary>
    TitleChanged,
    /// <summary>EVENT_SYSTEM_MINIMIZESTART.</summary>
    Minimized,
    /// <summary>EVENT_SYSTEM_MINIMIZEEND.</summary>
    Restored,
    /// <summary>EVENT_SYSTEM_FOREGROUND.</summary>
    Foreground,
    /// <summary>EVENT_OBJECT_CLOAKED (for example, a virtual-desktop switch hides it).</summary>
    Cloaked,
    /// <summary>EVENT_OBJECT_UNCLOAKED.</summary>
    Uncloaked,
    /// <summary>EVENT_SYSTEM_MOVESIZEEND: the user finished moving or resizing it.</summary>
    MoveSizeEnded,
}

public sealed record WindowEvent(WindowEventKind Kind, nint Hwnd);

/// <summary>The alt-tab window list and window change events. Real: <see cref="WindowCatalog"/>. Read-only: safe mode does not apply.</summary>
public interface IWindowCatalog
{
    /// <summary>
    /// Alt-tab eligible windows in z-order (front first): the current desktop's windows, plus windows on other virtual
    /// desktops flagged <see cref="WindowInfo.IsCloaked"/>. App-cloaked windows and prelaunched/suspended UWP frames are
    /// excluded. Synchronous and fast (about 1 ms per window); call it off hot paths, not per frame.
    /// </summary>
    IReadOnlyList<WindowInfo> AltTabWindows();

    /// <summary>Any window (alt-tab eligible or not), or null when it no longer exists.</summary>
    WindowInfo? Get(nint hwnd);

    /// <summary>Create/destroy/show/hide/title/minimize/restore/foreground/cloak/move events of top-level windows, raised on the thread pool in order.</summary>
    event Action<WindowEvent>? Changed;
}

/// <summary>The raw facts alt-tab eligibility depends on (pure input for <see cref="AltTabRules"/>).</summary>
internal readonly record struct WindowFacts(bool Visible, bool IsShellWindow, uint ExStyle, int TitleLength, bool OwnerWalkOk,
    uint Cloaked, bool? OnCurrentDesktop, bool HasDesktopId);

internal enum AltTabVerdict { Exclude, Include, IncludeCloaked }

/// <summary>
/// Raymond Chen's owner walk (oldnewthing 2007-10-08) plus modern filters (research/windows.md §2.1):
/// tool windows and no-activate windows are excluded unless WS_EX_APPWINDOW; untitled windows are excluded; DWM-cloaked
/// windows are excluded unless the shell cloaked them because they are on another (known) virtual desktop.
/// </summary>
internal static class AltTabRules
{
    public const uint CloakedApp = 1, CloakedShell = 2, CloakedInherited = 4;

    public static AltTabVerdict Classify(in WindowFacts f)
    {
        if (!f.Visible || f.IsShellWindow) return AltTabVerdict.Exclude;
        var tool = (f.ExStyle & User32.WS_EX_TOOLWINDOW) != 0;
        var app = (f.ExStyle & User32.WS_EX_APPWINDOW) != 0;
        if (tool && !app) return AltTabVerdict.Exclude;
        if ((f.ExStyle & User32.WS_EX_NOACTIVATE) != 0 && !app) return AltTabVerdict.Exclude;
        if (f.TitleLength <= 0) return AltTabVerdict.Exclude;
        if (!f.OwnerWalkOk && !app) return AltTabVerdict.Exclude;
        if (f.Cloaked == 0) return AltTabVerdict.Include;
        // Shell-cloaked + on a different, real desktop = "on Desktop N". Shell-cloaked with no desktop id = prelaunched or
        // suspended UWP frames (Settings, Xbox, TextInputHost on this PC); app-cloaked = hidden by the app itself.
        if ((f.Cloaked & CloakedShell) != 0 && f.OnCurrentDesktop == false && f.HasDesktopId) return AltTabVerdict.IncludeCloaked;
        return AltTabVerdict.Exclude;
    }
}

/// <summary>
/// The real catalog: EnumWindows + the rules above, read on the caller's thread inside a per-monitor-v2 DPI scope (COM via
/// the implicit MTA, verified on this PC). Events come from WinEvent hooks on the shell thread, installed on the first
/// <see cref="Changed"/> subscription and raised on the thread pool in order.
/// </summary>
public sealed class WindowCatalog : IWindowCatalog, IDisposable
{
    private const uint EvForeground = 0x0003, EvMoveSizeEnd = 0x000B, EvMinimizeStart = 0x0016, EvMinimizeEnd = 0x0017;
    private const uint EvCreate = 0x8000, EvDestroy = 0x8001, EvShow = 0x8002, EvHide = 0x8003, EvNameChange = 0x800C;
    private const uint EvCloaked = 0x8017, EvUncloaked = 0x8018;

    private static readonly Guid ClsidVirtualDesktopManager = new("aa509086-5ca9-4c25-8f95-589d3c07b48a");
    private static readonly Guid IidVirtualDesktopManager = new("a5cd92ff-29be-454c-8d04-d82879fb3f1b");
    private static readonly Guid IidPropertyStore = new("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    private static readonly Guid PkeyAppUserModelId = new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

    private readonly ShellThread? _shell;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly ConcurrentDictionary<nint, byte> _known = new();
    private readonly ConcurrentDictionary<nint, byte> _pendingTitles = new();
    private readonly List<nint> _hooks = [];
    private Action<WindowEvent>? _changed;
    private bool _hooksRequested;

    public WindowCatalog(ShellThread? shell, ILog? log = null)
    {
        _shell = shell;
        _log = (log ?? NullLog.Instance).For("windows");
    }

    public event Action<WindowEvent>? Changed
    {
        add
        {
            lock (_gate)
            {
                _changed += value;
                if (!_hooksRequested && _shell is not null)
                {
                    _hooksRequested = true;
                    _ = InstallHooksAsync();
                }
            }
        }
        remove { lock (_gate) _changed -= value; }
    }

    /// <summary>Completes when the WinEvent hooks are installed (tests; subscribers need not wait).</summary>
    internal Task? HooksReady { get; private set; }

    // ------------------------------------------------------------------ enumeration

    public unsafe IReadOnlyList<WindowInfo> AltTabWindows()
    {
        using var dpi = DpiScope.PerMonitorV2();
        var handles = EnumTopLevel();
        var vdm = CreateVirtualDesktopManager();
        try
        {
            var shellWindow = User32.GetShellWindow();
            var exeCache = new Dictionary<uint, string?>();
            var result = new List<WindowInfo>();
            foreach (var h in handles)
            {
                if (User32.IsWindowVisible(h) == 0) continue;
                var facts = Facts(h, shellWindow, vdm);
                var verdict = AltTabRules.Classify(facts);
                if (verdict == AltTabVerdict.Exclude) continue;
                _known.TryAdd(h, 0);
                result.Add(Build(h, verdict == AltTabVerdict.IncludeCloaked, exeCache));
            }
            return result;
        }
        finally { ComVtbl.Release(vdm); }
    }

    public unsafe WindowInfo? Get(nint hwnd)
    {
        if (hwnd == 0 || User32.IsWindow(hwnd) == 0) return null;
        using var dpi = DpiScope.PerMonitorV2();
        uint cloaked = 0;
        Dwm.DwmGetWindowAttribute(hwnd, Dwm.DWMWA_CLOAKED, &cloaked, 4);
        var info = Build(hwnd, cloaked != 0, new Dictionary<uint, string?>());
        return User32.IsWindow(hwnd) != 0 ? info : null;
    }

    private static unsafe List<nint> EnumTopLevel()
    {
        var list = new List<nint>(1024);
        var handle = GCHandle.Alloc(list);
        try { User32.EnumWindows(&Collect, GCHandle.ToIntPtr(handle)); }
        finally { handle.Free(); }
        return list;
    }

    [UnmanagedCallersOnly]
    private static int Collect(nint hwnd, nint lp)
    {
        ((List<nint>)GCHandle.FromIntPtr(lp).Target!).Add(hwnd);
        return 1;
    }

    private static unsafe WindowFacts Facts(nint h, nint shellWindow, nint vdm)
    {
        var ex = (uint)User32.GetWindowLongPtrW(h, User32.GWL_EXSTYLE);
        uint cloaked = 0;
        Dwm.DwmGetWindowAttribute(h, Dwm.DWMWA_CLOAKED, &cloaked, 4);
        bool? onCurrent = null;
        var hasDesktop = false;
        if (cloaked != 0 && vdm != 0)
        {
            int on;
            if (((delegate* unmanaged[Stdcall]<nint, nint, int*, int>)ComVtbl.Slot(vdm, 3))(vdm, h, &on) == 0) onCurrent = on != 0;
            Guid desk;
            hasDesktop = ((delegate* unmanaged[Stdcall]<nint, nint, Guid*, int>)ComVtbl.Slot(vdm, 4))(vdm, h, &desk) == 0 && desk != Guid.Empty;
        }
        return new WindowFacts(true, h == shellWindow, ex, User32.GetWindowTextLengthW(h), OwnerWalk(h), cloaked, onCurrent, hasDesktop);
    }

    /// <summary>Raymond Chen's walk with the intended <c>!= walk</c> comparison.</summary>
    private static bool OwnerWalk(nint h)
    {
        var walk = User32.GetAncestor(h, User32.GA_ROOTOWNER);
        nint next;
        for (var guard = 0; guard < 64 && (next = User32.GetLastActivePopup(walk)) != walk; guard++)
        {
            if (User32.IsWindowVisible(next) != 0) break;
            walk = next;
        }
        return walk == h;
    }

    private static unsafe WindowInfo Build(nint h, bool cloaked, Dictionary<uint, string?> exeCache)
    {
        User32.GetWindowThreadProcessId(h, out var pid);
        if (User32.ClassName(h) == "ApplicationFrameWindow")
        {
            // A UWP frame belongs to ApplicationFrameHost; the app's process owns the CoreWindow child (when not suspended).
            var core = User32.FindWindowExW(h, 0, "Windows.UI.Core.CoreWindow", null);
            if (core != 0)
            {
                User32.GetWindowThreadProcessId(core, out var corePid);
                if (corePid != 0) pid = corePid;
            }
        }
        if (!exeCache.TryGetValue(pid, out var path)) exeCache[pid] = path = ProcessInfo.ImagePath(pid);
        RECT r;
        var bounds = Dwm.DwmGetWindowAttribute(h, Dwm.DWMWA_EXTENDED_FRAME_BOUNDS, &r, (uint)sizeof(RECT)) == 0
            ? RectI.From(r)
            : User32.GetWindowRect(h, out r) != 0 ? RectI.From(r) : default;
        return new WindowInfo(h, (int)pid, path is null ? "" : Path.GetFileName(path), path, User32.WindowText(h),
            WindowAumid(h) ?? ProcessInfo.ApplicationUserModelId(pid),
            User32.IsIconic(h) != 0, User32.IsZoomed(h) != 0, cloaked, ProcessInfo.IsAboveUs(pid),
            User32.MonitorFromWindow(h, User32.MONITOR_DEFAULTTONEAREST), bounds);
    }

    private static unsafe nint CreateVirtualDesktopManager()
    {
        var clsid = ClsidVirtualDesktopManager;
        var iid = IidVirtualDesktopManager;
        nint p;
        return Ole32.CoCreateInstance(&clsid, 0, 0x17 /* CLSCTX_ALL */, &iid, &p) == 0 ? p : 0;
    }

    /// <summary>PKEY_AppUserModel_ID from the window's property store (explicit per-window AUMIDs and UWP frames).</summary>
    private static unsafe string? WindowAumid(nint h)
    {
        var iid = IidPropertyStore;
        nint ps;
        if (Shell32.SHGetPropertyStoreForWindow(h, &iid, &ps) != 0 || ps == 0) return null;
        try
        {
            var key = stackalloc byte[20];
            *(Guid*)key = PkeyAppUserModelId;
            *(uint*)(key + 16) = 5;
            var pv = stackalloc byte[24];
            new Span<byte>(pv, 24).Clear();
            var hr = ((delegate* unmanaged[Stdcall]<nint, byte*, byte*, int>)ComVtbl.Slot(ps, 5))(ps, key, pv);
            string? s = null;
            if (hr == 0 && *(ushort*)pv == 31 /* VT_LPWSTR */ && *(char**)(pv + 8) != null) s = new string(*(char**)(pv + 8));
            Ole32.PropVariantClear(pv);
            return string.IsNullOrEmpty(s) ? null : s;
        }
        finally { ComVtbl.Release(ps); }
    }

    // ------------------------------------------------------------------ events

    private async Task InstallHooksAsync()
    {
        var shell = _shell!;
        var ready = shell.InvokeAsync(() =>
        {
            (uint Min, uint Max)[] ranges =
            [
                (EvForeground, EvForeground), (EvMoveSizeEnd, EvMoveSizeEnd), (EvMinimizeStart, EvMinimizeEnd),
                (EvCreate, EvHide), (EvNameChange, EvNameChange), (EvCloaked, EvUncloaked),
            ];
            foreach (var (min, max) in ranges)
            {
                var hook = shell.AddWinEventHook(min, max, OnWinEvent);
                if (hook == 0) _log.Warn($"SetWinEventHook(0x{min:X}-0x{max:X}) failed; some window events will be missed.");
                else lock (_gate) _hooks.Add(hook);
            }
        });
        HooksReady = ready;
        try { await ready.ConfigureAwait(false); }
        catch (Exception ex) { _log.Warn("Installing window event hooks failed: " + ex.Message); }
    }

    /// <summary>Shell thread: cheap filters only, then hand off to the ordered thread-pool queue.</summary>
    private void OnWinEvent(uint evt, nint hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (hwnd == 0 || idObject != 0 /* OBJID_WINDOW */ || idChild != 0 /* CHILDID_SELF */) return;
        if (_shell is not null && hwnd == _shell.WindowHandle) return;
        WindowEventKind kind;
        switch (evt)
        {
            case EvDestroy:
                if (!_known.TryRemove(hwnd, out _)) return;
                Raise(WindowEventKind.Destroyed, hwnd);
                return;
            case EvForeground: kind = WindowEventKind.Foreground; break;
            case EvMoveSizeEnd: kind = WindowEventKind.MoveSizeEnded; break;
            case EvMinimizeStart: kind = WindowEventKind.Minimized; break;
            case EvMinimizeEnd: kind = WindowEventKind.Restored; break;
            case EvCreate: kind = WindowEventKind.Created; break;
            case EvShow: kind = WindowEventKind.Shown; break;
            case EvHide: kind = WindowEventKind.Hidden; break;
            case EvNameChange: kind = WindowEventKind.TitleChanged; break;
            case EvCloaked: kind = WindowEventKind.Cloaked; break;
            case EvUncloaked: kind = WindowEventKind.Uncloaked; break;
            default: return;
        }
        if (User32.GetAncestor(hwnd, User32.GA_ROOT) != hwnd) return; // top-level windows only
        _known.TryAdd(hwnd, 0);
        if (kind == WindowEventKind.TitleChanged && !_pendingTitles.TryAdd(hwnd, 0)) return; // one queued per window
        Raise(kind, hwnd);
    }

    private void Raise(WindowEventKind kind, nint hwnd)
    {
        var e = new WindowEvent(kind, hwnd);
        _shell!.PostEvent(() =>
        {
            if (kind == WindowEventKind.TitleChanged) _pendingTitles.TryRemove(hwnd, out _);
            _changed?.Invoke(e);
        });
    }

    public void Dispose()
    {
        if (_shell is null) return;
        nint[] hooks;
        lock (_gate) { hooks = [.. _hooks]; _hooks.Clear(); }
        if (hooks.Length == 0) return;
        try { _ = _shell.InvokeAsync(() => { foreach (var h in hooks) _shell.RemoveWinEventHook(h); }); }
        catch (ObjectDisposedException) { }
    }
}
