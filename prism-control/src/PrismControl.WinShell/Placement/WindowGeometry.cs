using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Placement;

/// <summary>A window's geometry and state, read on a per-monitor-v2 thread (physical pixels).</summary>
public sealed record WindowGeometry(
    nint Hwnd,
    PixelRect WindowRect,
    PixelRect Frame,
    bool Maximized,
    bool Minimized,
    bool Topmost,
    bool Elevated,
    bool Hung,
    bool IsShellSurface,
    string ProcessName);

/// <summary>Window reads for placement. All real; safe mode keeps them.</summary>
public interface IWindowGeometryReader
{
    WindowGeometry? Read(nint hwnd);
    /// <summary>A Direct3D exclusive-fullscreen app is in front (SHQueryUserNotificationState = 3) and it is this window.</summary>
    bool IsExclusiveFullscreen(nint hwnd);
}

/// <summary>Window writes. Gated: safe mode uses <see cref="SafeWindowWriter"/>.</summary>
public interface IWindowWriter
{
    /// <summary>Un-maximizes or un-minimizes (ShowWindowAsync SW_RESTORE: never blocks on a hung app).</summary>
    bool Restore(nint hwnd);
    bool Maximize(nint hwnd);
    /// <summary>SetWindowPos (window rect, physical pixels; async to the target's thread; no z-order or activation change).</summary>
    bool SetBounds(nint hwnd, PixelRect windowRect);
    bool SetTopmost(nint hwnd, bool on);
}

/// <summary>Safe-mode overlay so the topmost/maximize keys still show what the fake did.</summary>
public interface IWindowOverlay
{
    bool? TopmostOverride(nint hwnd);
    bool? MaximizedOverride(nint hwnd);
}

internal sealed unsafe partial class Win32WindowGeometry : IWindowGeometryReader
{
    public WindowGeometry? Read(nint hwnd)
    {
        if (hwnd == 0 || Native.IsWindow(hwnd) == 0) return null;
        using var dpi = ThreadDpi.PerMonitorV2();
        if (Native.GetWindowRect(hwnd, out var wr) == 0) return null;
        var frame = Native.FrameBounds(hwnd);
        var ex = (uint)Native.GetWindowLongPtrW(hwnd, Native.GWL_EXSTYLE);
        Native.GetWindowThreadProcessId(hwnd, out var pid);
        var il = Native.Integrity(pid, out _);
        var cls = Native.ClassName(hwnd);
        var shell = hwnd == Native.GetShellWindow() || cls is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "Progman" or "WorkerW";
        var exe = Path.GetFileName(Native.ImagePath(pid) ?? "?");
        return new WindowGeometry(hwnd, wr.ToPixelRect(), frame, Native.IsZoomed(hwnd) != 0, Native.IsIconic(hwnd) != 0,
            (ex & Native.WS_EX_TOPMOST) != 0, il == -2 || il > Native.OwnIntegrity, Native.IsHungAppWindow(hwnd) != 0, shell, exe);
    }

    public bool IsExclusiveFullscreen(nint hwnd)
    {
        if (Native.SHQueryUserNotificationState(out var state) != 0 || state != 3 /* QUNS_RUNNING_D3D_FULL_SCREEN */) return false;
        var fg = Native.GetForegroundWindow();
        return fg == hwnd || Native.GetAncestor(fg, Native.GA_ROOTOWNER) == hwnd;
    }
}

/// <summary>The real window writer. Never constructed in safe mode. Every call is asynchronous to the target thread.</summary>
internal sealed partial class Win32WindowWriter : IWindowWriter
{
    public bool Restore(nint hwnd) => ShowWindowAsync(hwnd, Native.SW_RESTORE) != 0;
    public bool Maximize(nint hwnd) => ShowWindowAsync(hwnd, Native.SW_MAXIMIZE) != 0;

    public bool SetBounds(nint hwnd, PixelRect r)
    {
        using var dpi = ThreadDpi.PerMonitorV2();
        return Native.SetWindowPos(hwnd, 0, r.Left, r.Top, r.Width, r.Height,
            Native.SWP_NOZORDER | Native.SWP_NOACTIVATE | Native.SWP_NOOWNERZORDER | Native.SWP_ASYNCWINDOWPOS) != 0;
    }

    public bool SetTopmost(nint hwnd, bool on)
    {
        const uint flags = Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_ASYNCWINDOWPOS;
        // Measured on this PC (Windows 26300, the tests' own window): HWND_TOPMOST alone is silently ignored for a window
        // that was never topmost (SetWindowPos returns TRUE, WS_EX_TOPMOST stays clear); HWND_NOTOPMOST first makes it
        // take. Both are posted in order to the window's thread. The caller re-reads WS_EX_TOPMOST either way.
        if (on) Native.SetWindowPos(hwnd, Native.HWND_NOTOPMOST, 0, 0, 0, 0, flags);
        return Native.SetWindowPos(hwnd, on ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST, 0, 0, 0, 0, flags) != 0;
    }

    [LibraryImport("user32.dll")] private static partial int ShowWindowAsync(nint h, int cmd);
}

/// <summary>Safe mode: window moves, maximize and topmost are logged and remembered, never applied.</summary>
public sealed class SafeWindowWriter(ILog log) : IWindowWriter, IWindowOverlay
{
    private readonly ConcurrentDictionary<nint, bool> _topmost = new();
    private readonly ConcurrentDictionary<nint, bool> _maximized = new();
    private readonly ConcurrentQueue<string> _writes = new();

    public IReadOnlyList<string> Writes => [.. _writes];

    public bool Restore(nint hwnd) { _maximized[hwnd] = false; return Record("would restore a window"); }
    public bool Maximize(nint hwnd) { _maximized[hwnd] = true; return Record("would maximize a window"); }
    public bool SetBounds(nint hwnd, PixelRect windowRect) => Record($"would move a window to {windowRect}");
    public bool SetTopmost(nint hwnd, bool on) { _topmost[hwnd] = on; return Record($"would turn always-on-top {(on ? "on" : "off")}"); }

    public bool? TopmostOverride(nint hwnd) => _topmost.TryGetValue(hwnd, out var v) ? v : null;
    public bool? MaximizedOverride(nint hwnd) => _maximized.TryGetValue(hwnd, out var v) ? v : null;

    private bool Record(string what)
    {
        _writes.Enqueue(what);
        log.Info("[safe mode] " + what);
        return true;
    }
}
