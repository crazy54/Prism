using System.Runtime.InteropServices;
using PrismControl.Desktop;
using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Capture;

public enum WindowVisibility { Visible, Minimized, Hidden, Cloaked, Gone }

/// <summary>
/// Read-only window facts for capture and for frame → screen conversion. Every geometry call runs in a per-monitor-v2
/// DPI scope (the plugin has no DPI manifest), so all rectangles are physical pixels in virtual-desktop coordinates
/// (monitors left of or above the primary have negative origins). Titles are never read.
/// </summary>
public static unsafe partial class WindowGeometry
{
    /// <summary>The client area in screen coordinates.</summary>
    public static bool TryGetClientOnScreen(nint hwnd, out PixelRect client)
    {
        client = default;
        using var dpi = DpiScope.PerMonitorV2();
        if (GetClientRect(hwnd, out var rc) == 0) return false;
        var pt = new POINT();
        if (ClientToScreen(hwnd, ref pt) == 0) return false;
        client = new PixelRect(pt.X, pt.Y, rc.Right - rc.Left, rc.Bottom - rc.Top);
        return client.W > 0 && client.H > 0;
    }

    /// <summary>The DWM extended frame bounds (what a WGC window capture's surface covers).</summary>
    public static bool TryGetFrameBounds(nint hwnd, out PixelRect frame)
    {
        frame = default;
        using var dpi = DpiScope.PerMonitorV2();
        RECT r;
        if (DwmGetWindowAttribute(hwnd, 9 /* DWMWA_EXTENDED_FRAME_BOUNDS */, &r, (uint)sizeof(RECT)) != 0)
        {
            if (GetWindowRect(hwnd, out r) == 0) return false;
        }
        frame = new PixelRect(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
        return frame.W > 0 && frame.H > 0;
    }

    public static PixelRect MonitorBounds(nint hmonitor)
    {
        using var dpi = DpiScope.PerMonitorV2();
        var mi = stackalloc byte[40];
        new Span<byte>(mi, 40).Clear();
        *(int*)mi = 40;
        if (GetMonitorInfoW(hmonitor, mi) == 0) return default;
        var r = (RECT*)(mi + 4);
        return new PixelRect(r->Left, r->Top, r->Right - r->Left, r->Bottom - r->Top);
    }

    public static nint MonitorOf(nint hwnd) => DisplayInfo.MonitorFromWindow(hwnd, 2);

    /// <summary>The top-level window of <paramref name="hwnd"/> (GetAncestor GA_ROOT), or itself.</summary>
    public static nint RootOf(nint hwnd)
    {
        if (hwnd == 0) return 0;
        var r = GetAncestor(hwnd, 2);
        return r == 0 ? hwnd : r;
    }

    public static nint Foreground() => GetForegroundWindow();

    public static WindowVisibility Visibility(nint hwnd)
    {
        if (hwnd == 0 || IsWindow(hwnd) == 0) return WindowVisibility.Gone;
        if (IsIconic(hwnd) != 0) return WindowVisibility.Minimized;
        if (IsWindowVisible(hwnd) == 0) return WindowVisibility.Hidden;
        uint cloaked = 0;
        if (DwmGetWindowAttribute(hwnd, 14 /* DWMWA_CLOAKED */, &cloaked, 4) == 0 && cloaked != 0) return WindowVisibility.Cloaked;
        return WindowVisibility.Visible;
    }

    public static string ClassName(nint hwnd)
    {
        var buf = stackalloc char[256];
        var n = GetClassNameW(hwnd, buf, 256);
        return n <= 0 ? "" : new string(buf, 0, n);
    }

    public static int ProcessId(nint hwnd)
    {
        GetWindowThreadProcessId(hwnd, out var pid);
        return (int)pid;
    }

    /// <summary>The process's full image path (PROCESS_QUERY_LIMITED_INFORMATION only: no read access to its memory).</summary>
    public static string? ProcessPath(int pid)
    {
        var h = OpenProcess(0x1000, 0, (uint)pid);
        if (h == 0) return null;
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, buf, ref len) != 0 ? new string(buf, 0, (int)len) : null;
        }
        finally { CloseHandle(h); }
    }

    /// <summary>
    /// A point in content (client-area) pixels of a capture → screen pixels. The capture's content is the client area at
    /// 1:1 physical pixels, so this is the client origin plus the point; <paramref name="captureScale"/> covers a capture
    /// that was scaled (capture pixels per screen pixel).
    /// </summary>
    public static bool TryContentToScreen(nint hwnd, double contentX, double contentY, out PointI screen, double captureScale = 1.0)
    {
        screen = default;
        if (!TryGetClientOnScreen(hwnd, out var client)) return false;
        screen = ContentToScreen(client, contentX, contentY, captureScale);
        return true;
    }

    /// <summary>Pure form of <see cref="TryContentToScreen"/> (tests pin it, including negative monitor origins).</summary>
    public static PointI ContentToScreen(PixelRect clientOnScreen, double contentX, double contentY, double captureScale = 1.0)
    {
        if (captureScale <= 0 || double.IsNaN(captureScale)) throw new ArgumentOutOfRangeException(nameof(captureScale));
        var x = clientOnScreen.X + (int)Math.Floor(contentX / captureScale);
        var y = clientOnScreen.Y + (int)Math.Floor(contentY / captureScale);
        return new PointI(Math.Clamp(x, clientOnScreen.X, clientOnScreen.Right - 1), Math.Clamp(y, clientOnScreen.Y, clientOnScreen.Bottom - 1));
    }

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }

    [LibraryImport("user32.dll")] private static partial int GetClientRect(nint hwnd, out RECT rc);
    [LibraryImport("user32.dll")] private static partial int GetWindowRect(nint hwnd, out RECT rc);
    [LibraryImport("user32.dll")] private static partial int ClientToScreen(nint hwnd, ref POINT pt);
    [LibraryImport("user32.dll")] private static partial int GetMonitorInfoW(nint hmonitor, byte* info);
    [LibraryImport("user32.dll")] private static partial int IsWindow(nint hwnd);
    [LibraryImport("user32.dll")] private static partial nint GetAncestor(nint hwnd, uint flags);
    [LibraryImport("user32.dll")] private static partial nint GetForegroundWindow();
    [LibraryImport("user32.dll")] private static partial int IsIconic(nint hwnd);
    [LibraryImport("user32.dll")] private static partial int IsWindowVisible(nint hwnd);
    [LibraryImport("user32.dll")] private static partial int GetClassNameW(nint hwnd, char* buf, int max);
    [LibraryImport("user32.dll")] private static partial uint GetWindowThreadProcessId(nint hwnd, out uint pid);
    [LibraryImport("dwmapi.dll")] private static partial int DwmGetWindowAttribute(nint hwnd, uint attr, void* value, uint size);
    [LibraryImport("kernel32.dll")] private static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] private static partial int QueryFullProcessImageNameW(nint h, uint flags, char* buf, ref uint size);
}
