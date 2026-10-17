using System.Runtime.InteropServices;

namespace PrismControl.WinShell.Shared;

/// <summary>A rectangle in physical pixels (read on a per-monitor-v2 thread; see <see cref="ThreadDpi"/>).</summary>
public readonly record struct PixelRect(int Left, int Top, int Right, int Bottom)
{
    public int Width => Right - Left;
    public int Height => Bottom - Top;
    public bool IsEmpty => Width <= 0 || Height <= 0;
    public int CenterX => Left + Width / 2;
    public int CenterY => Top + Height / 2;

    public static PixelRect FromSize(int x, int y, int w, int h) => new(x, y, x + w, y + h);

    public bool Contains(int x, int y) => x >= Left && x < Right && y >= Top && y < Bottom;

    public PixelRect Intersect(PixelRect o)
    {
        int l = Math.Max(Left, o.Left), t = Math.Max(Top, o.Top), r = Math.Min(Right, o.Right), b = Math.Min(Bottom, o.Bottom);
        return r <= l || b <= t ? default : new PixelRect(l, t, r, b);
    }

    public long Area => IsEmpty ? 0 : (long)Width * Height;

    public override string ToString() => $"({Left},{Top}) {Width}x{Height}";
}

[StructLayout(LayoutKind.Sequential)]
internal struct RECT
{
    public int Left, Top, Right, Bottom;
    public readonly PixelRect ToPixelRect() => new(Left, Top, Right, Bottom);
    public static RECT From(PixelRect r) => new() { Left = r.Left, Top = r.Top, Right = r.Right, Bottom = r.Bottom };
}

[StructLayout(LayoutKind.Sequential)]
internal struct POINT { public int X, Y; }

[StructLayout(LayoutKind.Sequential)]
internal struct MSG { public nint hwnd; public uint message; public nint wParam, lParam; public uint time; public POINT pt; public uint lPrivate; }

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct MONITORINFOEXW { public uint cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; public fixed char szDevice[32]; }

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct PHYSICAL_MONITOR { public nint hPhysicalMonitor; public fixed char szPhysicalMonitorDescription[128]; }

[StructLayout(LayoutKind.Sequential)]
internal struct WINDOWPLACEMENT { public uint length, flags, showCmd; public POINT ptMinPosition, ptMaxPosition; public RECT rcNormalPosition; }

[StructLayout(LayoutKind.Sequential)]
internal struct SIZE { public int cx, cy; }

[StructLayout(LayoutKind.Sequential)]
internal struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public nint bmBits; }

[StructLayout(LayoutKind.Sequential)]
internal struct BITMAPINFOHEADER { public uint biSize; public int biWidth, biHeight; public ushort biPlanes, biBitCount; public uint biCompression, biSizeImage; public int biXPelsPerMeter, biYPelsPerMeter; public uint biClrUsed, biClrImportant; }

/// <summary>KEYBDINPUT inside an INPUT (x64 layout: type, 4 bytes of padding, then the union of 32 bytes).</summary>
[StructLayout(LayoutKind.Explicit, Size = 40)]
internal struct INPUT
{
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public ushort wVk;
    [FieldOffset(10)] public ushort wScan;
    [FieldOffset(12)] public uint dwFlags;
    [FieldOffset(16)] public uint time;
    [FieldOffset(24)] public nint dwExtraInfo;
}

/// <summary>P/Invoke for the windows module (W1 owns; W2 may add entries). Geometry calls must run inside a <see cref="ThreadDpi"/>.</summary>
internal static unsafe partial class Native
{
    // ---------------------------------------------------------------- constants
    public const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
    public const uint WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_POPUP = 0x80000000, WS_MAXIMIZEBOX = 0x00010000, WS_CHILD = 0x40000000;
    public const uint WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOPMOST = 0x8;
    public const uint GA_ROOT = 2, GA_ROOTOWNER = 3, GW_OWNER = 4;
    public const uint MONITOR_DEFAULTTONULL = 0, MONITOR_DEFAULTTOPRIMARY = 1, MONITOR_DEFAULTTONEAREST = 2;
    public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_NOOWNERZORDER = 0x200, SWP_ASYNCWINDOWPOS = 0x4000;
    public const int SW_MAXIMIZE = 3, SW_SHOWNOACTIVATE = 4, SW_RESTORE = 9, SW_SHOWMINNOACTIVE = 7;
    public static readonly nint HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
    public const uint DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
    public static readonly nint DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;
    public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    // ---------------------------------------------------------------- user32: windows (reads)
    [LibraryImport("user32.dll")] public static partial int EnumWindows(delegate* unmanaged<nint, nint, int> cb, nint lParam);
    [LibraryImport("user32.dll")] public static partial int IsWindow(nint h);
    [LibraryImport("user32.dll")] public static partial int IsWindowVisible(nint h);
    [LibraryImport("user32.dll")] public static partial int IsIconic(nint h);
    [LibraryImport("user32.dll")] public static partial int IsZoomed(nint h);
    [LibraryImport("user32.dll")] public static partial int IsHungAppWindow(nint h);
    [LibraryImport("user32.dll")] public static partial nint GetAncestor(nint h, uint flags);
    [LibraryImport("user32.dll")] public static partial nint GetLastActivePopup(nint h);
    [LibraryImport("user32.dll")] public static partial nint GetWindow(nint h, uint cmd);
    [LibraryImport("user32.dll")] public static partial nint GetWindowLongPtrW(nint h, int idx);
    [LibraryImport("user32.dll")] public static partial nint GetClassLongPtrW(nint h, int idx);
    [LibraryImport("user32.dll")] public static partial int GetWindowTextLengthW(nint h);
    [LibraryImport("user32.dll")] public static partial int GetWindowTextW(nint h, char* buf, int max);
    [LibraryImport("user32.dll")] public static partial int GetClassNameW(nint h, char* buf, int max);
    [LibraryImport("user32.dll")] public static partial uint GetWindowThreadProcessId(nint h, out uint pid);
    [LibraryImport("user32.dll")] public static partial int GetWindowRect(nint h, out RECT r);
    [LibraryImport("user32.dll")] public static partial int GetWindowPlacement(nint h, ref WINDOWPLACEMENT wp);
    [LibraryImport("user32.dll")] public static partial nint GetForegroundWindow();
    [LibraryImport("user32.dll")] public static partial nint GetShellWindow();
    [LibraryImport("user32.dll")] public static partial uint GetDpiForWindow(nint h);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial nint SendMessageTimeoutW(nint h, uint msg, nint wp, nint lp, uint flags, uint timeout, out nint result);

    // ---------------------------------------------------------------- user32: windows (WRITES: only through the gated writers)
    [LibraryImport("user32.dll", SetLastError = true)] public static partial int SetWindowPos(nint h, nint after, int x, int y, int cx, int cy, uint flags);
    [LibraryImport("user32.dll")] public static partial int ShowWindow(nint h, int cmd);
    [LibraryImport("user32.dll")] public static partial int SetForegroundWindow(nint h);
    [LibraryImport("user32.dll")] public static partial void SwitchToThisWindow(nint h, int altTab);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial uint SendInput(uint count, INPUT* inputs, int size);

    // ---------------------------------------------------------------- user32: DPI
    [LibraryImport("user32.dll")] public static partial nint SetThreadDpiAwarenessContext(nint ctx);
    [LibraryImport("user32.dll")] public static partial nint GetThreadDpiAwarenessContext();
    [LibraryImport("user32.dll")] public static partial int AreDpiAwarenessContextsEqual(nint a, nint b);
    [LibraryImport("user32.dll")] public static partial int GetAwarenessFromDpiAwarenessContext(nint ctx);
    [LibraryImport("shcore.dll")] public static partial int GetDpiForMonitor(nint hmon, int type, out uint x, out uint y);

    // ---------------------------------------------------------------- user32: monitors and modes
    [LibraryImport("user32.dll")] public static partial int EnumDisplayMonitors(nint hdc, nint clip, delegate* unmanaged<nint, nint, RECT*, nint, int> cb, nint data);
    [LibraryImport("user32.dll")] public static partial int GetMonitorInfoW(nint hmon, MONITORINFOEXW* mi);
    [LibraryImport("user32.dll")] public static partial nint MonitorFromWindow(nint h, uint flags);
    [LibraryImport("user32.dll")] public static partial nint MonitorFromRect(in RECT r, uint flags);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int EnumDisplaySettingsExW(string? device, int mode, byte* devmode, uint flags);
    /// <summary>WRITE (except with CDS_TEST): only through the gated display writer.</summary>
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int ChangeDisplaySettingsExW(string? device, byte* devmode, nint hwnd, uint flags, nint lparam);
    [LibraryImport("user32.dll")] public static partial int GetDisplayConfigBufferSizes(uint flags, out uint numPaths, out uint numModes);
    [LibraryImport("user32.dll")] public static partial int QueryDisplayConfig(uint flags, ref uint numPaths, byte* paths, ref uint numModes, byte* modes, nint topologyId);
    [LibraryImport("user32.dll")] public static partial int DisplayConfigGetDeviceInfo(byte* packet);
    /// <summary>WRITE: only through the gated display writer.</summary>
    [LibraryImport("user32.dll")] public static partial int DisplayConfigSetDeviceInfo(byte* packet);

    // ---------------------------------------------------------------- dxva2: DDC/CI
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int GetNumberOfPhysicalMonitorsFromHMONITOR(nint hmon, out uint n);
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int GetPhysicalMonitorsFromHMONITOR(nint hmon, uint n, PHYSICAL_MONITOR* arr);
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int DestroyPhysicalMonitors(uint n, PHYSICAL_MONITOR* arr);
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int GetVCPFeatureAndVCPFeatureReply(nint h, byte code, out int type, out uint cur, out uint max);
    /// <summary>WRITE: only through the gated DDC writer.</summary>
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int SetVCPFeature(nint h, byte code, uint value);
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int GetCapabilitiesStringLength(nint h, out uint len);
    [LibraryImport("dxva2.dll", SetLastError = true)] public static partial int CapabilitiesRequestAndCapabilitiesReply(nint h, byte* buf, uint len);

    // ---------------------------------------------------------------- dwm
    [LibraryImport("dwmapi.dll")] public static partial int DwmGetWindowAttribute(nint h, uint attr, void* value, uint size);

    // ---------------------------------------------------------------- kernel32 / advapi32
    [LibraryImport("kernel32.dll", SetLastError = true)] public static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] public static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] public static partial int QueryFullProcessImageNameW(nint h, uint flags, char* buf, ref uint size);
    [LibraryImport("kernel32.dll")] public static partial nint GetCurrentProcess();
    [LibraryImport("kernel32.dll")] public static partial uint GetCurrentThreadId();
    [LibraryImport("advapi32.dll", SetLastError = true)] public static partial int OpenProcessToken(nint h, uint access, out nint token);
    [LibraryImport("advapi32.dll", SetLastError = true)] public static partial int GetTokenInformation(nint token, int cls, void* info, uint len, out uint ret);
    [LibraryImport("advapi32.dll")] public static partial byte* GetSidSubAuthorityCount(nint sid);
    [LibraryImport("advapi32.dll")] public static partial uint* GetSidSubAuthority(nint sid, uint index);

    // ---------------------------------------------------------------- shell32 / powrprof
    [LibraryImport("shell32.dll")] public static partial int SHQueryUserNotificationState(out int state);
    [LibraryImport("powrprof.dll")] public static partial int PowerRegisterForEffectivePowerModeNotifications(uint version, delegate* unmanaged<int, nint, void> cb, nint ctx, nint* handle);
    [LibraryImport("powrprof.dll")] public static partial int PowerUnregisterFromEffectivePowerModeNotifications(nint handle);

    // ---------------------------------------------------------------- d3d11 / combase (thumbnails)
    [LibraryImport("d3d11.dll")] public static partial int D3D11CreateDevice(nint adapter, int driverType, nint software, uint flags, nint levels, uint numLevels, uint sdk, out nint device, out int level, out nint context);
    [LibraryImport("d3d11.dll")] public static partial int CreateDirect3D11DeviceFromDXGIDevice(nint dxgiDevice, out nint inspectable);
    [LibraryImport("combase.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int WindowsCreateString(string s, uint len, out nint hstring);
    [LibraryImport("combase.dll")] public static partial int WindowsDeleteString(nint hstring);
    [LibraryImport("combase.dll")] public static partial int RoGetActivationFactory(nint classId, Guid* iid, nint* factory);

    // ---------------------------------------------------------------- COM vtable helpers
    public static nint Slot(nint obj, int i) => (*(nint**)obj)[i];
    public static uint Release(nint obj) => obj == 0 ? 0 : ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(obj, 2))(obj);
    public static int QueryInterface(nint obj, Guid iid, out nint result)
    {
        nint r;
        var hr = ((delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)Slot(obj, 0))(obj, &iid, &r);
        result = r;
        return hr;
    }

    // ---------------------------------------------------------------- small helpers (reads)
    public static string ClassName(nint h)
    {
        var b = stackalloc char[256];
        var n = GetClassNameW(h, b, 256);
        return n > 0 ? new string(b, 0, n) : "";
    }

    public static string WindowText(nint h)
    {
        var len = GetWindowTextLengthW(h);
        if (len <= 0) return "";
        len = Math.Min(len, 1024);
        var buf = new char[len + 1];
        fixed (char* p = buf)
        {
            var n = GetWindowTextW(h, p, buf.Length);
            return n > 0 ? new string(p, 0, n) : "";
        }
    }

    public static string? ImagePath(uint pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return null;
        try
        {
            var b = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, b, ref len) != 0 ? new string(b, 0, (int)len) : null;
        }
        finally { CloseHandle(h); }
    }

    /// <summary>Integrity RID of a process (0x2000 medium, 0x3000 high, 0x4000 system); -1 unreadable; -2 cannot open (protected, treat as higher).</summary>
    public static int Integrity(uint pid, out bool elevated)
    {
        elevated = false;
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return -2;
        try { return IntegrityOf(h, out elevated); }
        finally { CloseHandle(h); }
    }

    public static int IntegrityOf(nint process, out bool elevated)
    {
        elevated = false;
        if (OpenProcessToken(process, 0x8 /* TOKEN_QUERY */, out var tok) == 0) return -1;
        try
        {
            uint e;
            if (GetTokenInformation(tok, 20 /* TokenElevation */, &e, 4, out _) != 0) elevated = e != 0;
            var buf = stackalloc byte[64];
            if (GetTokenInformation(tok, 25 /* TokenIntegrityLevel */, buf, 64, out _) == 0) return -1;
            var sid = *(nint*)buf;
            var c = *GetSidSubAuthorityCount(sid);
            return c == 0 ? -1 : (int)*GetSidSubAuthority(sid, (uint)(c - 1));
        }
        finally { CloseHandle(tok); }
    }

    private static int _ownIntegrity = int.MinValue;

    /// <summary>Our own integrity RID (Medium under the Stream Deck app).</summary>
    public static int OwnIntegrity
    {
        get
        {
            if (_ownIntegrity == int.MinValue)
            {
                var il = IntegrityOf(GetCurrentProcess(), out _);
                _ownIntegrity = il >= 0 ? il : 0x2000;
            }
            return _ownIntegrity;
        }
    }

    public static uint Cloaked(nint h)
    {
        uint c = 0;
        return DwmGetWindowAttribute(h, DWMWA_CLOAKED, &c, 4) == 0 ? c : 0;
    }

    /// <summary>DWMWA_EXTENDED_FRAME_BOUNDS: the visible frame, never DPI-virtualized. Falls back to GetWindowRect.</summary>
    public static PixelRect FrameBounds(nint h)
    {
        RECT r;
        if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, &r, (uint)sizeof(RECT)) == 0 && r.Right > r.Left) return r.ToPixelRect();
        return GetWindowRect(h, out var wr) != 0 ? wr.ToPixelRect() : default;
    }
}

/// <summary>
/// Makes the current thread per-monitor-v2 DPI aware for the scope, then restores it. The plugin process has no DPI
/// manifest (it is DPI-unaware), so geometry APIs return virtualized coordinates on scaled monitors unless the calling
/// thread opts in (research/windows.md §1.2). A ref struct, so it cannot live across an await.
/// </summary>
public readonly ref struct ThreadDpi
{
    private readonly nint _previous;

    private ThreadDpi(nint previous) => _previous = previous;

    public static ThreadDpi PerMonitorV2() => new(Native.SetThreadDpiAwarenessContext(Native.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2));

    /// <summary>True when the calling thread is per-monitor aware right now (awareness 2).</summary>
    public static bool IsPerMonitorAware => Native.GetAwarenessFromDpiAwarenessContext(Native.GetThreadDpiAwarenessContext()) == 2;

    public void Dispose()
    {
        if (_previous != 0) Native.SetThreadDpiAwarenessContext(_previous);
    }
}
