using System.Runtime.InteropServices;

namespace PrismControl.Desktop.Interop;

// Win32 interop for the desktop platform. Source-generated (LibraryImport) so it stays correct under trimming/AOT.
// x64 layouts match WinPlayProbe/Native.cs (verified on this PC, research/windows-probe-results.md).

[StructLayout(LayoutKind.Sequential)]
internal struct RECT
{
    public int Left, Top, Right, Bottom;
}

[StructLayout(LayoutKind.Sequential)]
internal struct POINT
{
    public int X, Y;
}

[StructLayout(LayoutKind.Sequential)]
internal struct SIZE
{
    public int cx, cy;
}

[StructLayout(LayoutKind.Sequential)]
internal struct MSG
{
    public nint hwnd;
    public uint message;
    public nint wParam, lParam;
    public uint time;
    public POINT pt;
    public uint lPrivate;
}

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct WNDCLASSEXW
{
    public uint cbSize, style;
    public delegate* unmanaged<nint, uint, nint, nint, nint> lpfnWndProc;
    public int cbClsExtra, cbWndExtra;
    public nint hInstance, hIcon, hCursor, hbrBackground;
    public char* lpszMenuName, lpszClassName;
    public nint hIconSm;
}

[StructLayout(LayoutKind.Sequential)]
internal struct ICONINFO
{
    public int fIcon;
    public int xHotspot, yHotspot;
    public nint hbmMask, hbmColor;
}

[StructLayout(LayoutKind.Sequential)]
internal struct BITMAP
{
    public int bmType, bmWidth, bmHeight, bmWidthBytes;
    public ushort bmPlanes, bmBitsPixel;
    public nint bmBits;
}

[StructLayout(LayoutKind.Sequential)]
internal struct BITMAPINFOHEADER
{
    public uint biSize;
    public int biWidth, biHeight;
    public ushort biPlanes, biBitCount;
    public uint biCompression, biSizeImage;
    public int biXPelsPerMeter, biYPelsPerMeter;
    public uint biClrUsed, biClrImportant;
}

/// <summary>SendInput layouts (x64: INPUT 40 bytes, union at +8; KEYBDINPUT 24; MOUSEINPUT 32).</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct KEYBDINPUT
{
    public ushort wVk, wScan;
    public uint dwFlags, time;
    public nint dwExtraInfo;
}

[StructLayout(LayoutKind.Sequential)]
internal struct MOUSEINPUT
{
    public int dx, dy;
    public uint mouseData, dwFlags, time;
    public nint dwExtraInfo;
}

[StructLayout(LayoutKind.Explicit)]
internal struct InputUnion
{
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
}

[StructLayout(LayoutKind.Sequential)]
internal struct INPUT
{
    public uint type;
    public InputUnion u;
}

[StructLayout(LayoutKind.Sequential)]
internal struct SECURITY_ATTRIBUTES
{
    public int nLength;
    public nint lpSecurityDescriptor;
    public int bInheritHandle;
}

[StructLayout(LayoutKind.Sequential)]
internal struct FILETIME
{
    public uint Low, High;
    public readonly long Ticks => ((long)High << 32) | Low;
}

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct PROCESSENTRY32W
{
    public uint dwSize, cntUsage, th32ProcessID;
    public nuint th32DefaultHeapID;
    public uint th32ModuleID, cntThreads, th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    public fixed char szExeFile[260];
}

internal static unsafe partial class User32
{
    public const int GWL_STYLE = -16, GWL_EXSTYLE = -20, GCLP_HICON = -14, GCLP_HICONSM = -34;
    public const uint WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000, WS_EX_NOACTIVATE = 0x08000000;
    public const uint WS_POPUP = 0x80000000;
    public const uint GA_PARENT = 1, GA_ROOT = 2, GA_ROOTOWNER = 3, GW_OWNER = 4, GW_CHILD = 5, GW_HWNDNEXT = 2;
    public const int SW_RESTORE = 9, SW_SHOWNOACTIVATE = 4;
    public const uint MONITOR_DEFAULTTONEAREST = 2;
    public const uint WM_NULL = 0, WM_DESTROY = 0x2, WM_SETTINGCHANGE = 0x1A, WM_GETICON = 0x7F, WM_DISPLAYCHANGE = 0x7E,
        WM_TIMER = 0x113, WM_HOTKEY = 0x312, WM_POWERBROADCAST = 0x218, WM_DEVICECHANGE = 0x219, WM_CLIPBOARDUPDATE = 0x31D,
        WM_THEMECHANGED = 0x31A, WM_SYSCOLORCHANGE = 0x15, WM_DPICHANGED = 0x2E0, WM_WTSSESSION_CHANGE = 0x2B1,
        WM_QUIT = 0x12, WM_CLOSE = 0x10, WM_APP = 0x8000;
    public const uint SMTO_ABORTIFHUNG = 0x2, SMTO_BLOCK = 0x1;
    public const nint ICON_SMALL = 0, ICON_BIG = 1, ICON_SMALL2 = 2;
    public const uint PM_REMOVE = 1, PM_NOREMOVE = 0;
    public const uint QS_ALLINPUT = 0x04FF, MWMO_INPUTAVAILABLE = 0x4;
    public const uint VK_F22 = 0x85, MOD_NOREPEAT = 0x4000;
    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2, KEYEVENTF_UNICODE = 0x4, KEYEVENTF_SCANCODE = 0x8;
    public const uint MAPVK_VK_TO_VSC_EX = 4;
    public const uint DI_NORMAL = 0x3;
    public const uint WINEVENT_OUTOFCONTEXT = 0x0, WINEVENT_SKIPOWNPROCESS = 0x2;
    public static readonly nint DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;

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
    [LibraryImport("user32.dll")] public static partial int GetWindowTextW(nint h, char* buf, int n);
    [LibraryImport("user32.dll")] public static partial int GetClassNameW(nint h, char* buf, int n);
    [LibraryImport("user32.dll")] public static partial uint GetWindowThreadProcessId(nint h, out uint pid);
    [LibraryImport("user32.dll")] public static partial int GetWindowRect(nint h, out RECT r);
    [LibraryImport("user32.dll")] public static partial nint GetForegroundWindow();
    [LibraryImport("user32.dll")] public static partial int SetForegroundWindow(nint h);
    [LibraryImport("user32.dll")] public static partial void SwitchToThisWindow(nint h, int altTab);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial int AllowSetForegroundWindow(uint pid);
    [LibraryImport("user32.dll")] public static partial int ShowWindowAsync(nint h, int cmd);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial nint SendMessageTimeoutW(nint h, uint msg, nint wp, nint lp, uint flags, uint timeout, out nint result);
    [LibraryImport("user32.dll")] public static partial nint SendMessageW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] public static partial nint SetThreadDpiAwarenessContext(nint ctx);
    [LibraryImport("user32.dll")] public static partial nint MonitorFromWindow(nint h, uint flags);
    [LibraryImport("user32.dll")] public static partial nint GetShellWindow();
    [LibraryImport("user32.dll", SetLastError = true)] public static partial int RegisterHotKey(nint h, int id, uint mods, uint vk);
    [LibraryImport("user32.dll")] public static partial int UnregisterHotKey(nint h, int id);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial uint SendInput(uint count, INPUT* inputs, int size);
    [LibraryImport("user32.dll")] public static partial uint MapVirtualKeyW(uint code, uint type);
    [LibraryImport("user32.dll")] public static partial nint SetWinEventHook(uint eventMin, uint eventMax, nint hmod,
        delegate* unmanaged<nint, uint, nint, int, int, uint, uint, void> proc, uint pid, uint tid, uint flags);
    [LibraryImport("user32.dll")] public static partial int UnhookWinEvent(nint hook);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial ushort RegisterClassExW(WNDCLASSEXW* wc);
    [LibraryImport("user32.dll", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint CreateWindowExW(uint exStyle, string cls, string? title, uint style, int x, int y, int w, int h, nint parent, nint menu, nint inst, nint param);
    [LibraryImport("user32.dll")] public static partial int DestroyWindow(nint h);
    [LibraryImport("user32.dll")] public static partial nint DefWindowProcW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] public static partial int GetMessageW(out MSG m, nint h, uint min, uint max);
    [LibraryImport("user32.dll")] public static partial int PeekMessageW(out MSG m, nint h, uint min, uint max, uint remove);
    [LibraryImport("user32.dll")] public static partial int TranslateMessage(in MSG m);
    [LibraryImport("user32.dll")] public static partial nint DispatchMessageW(in MSG m);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial int PostMessageW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll", SetLastError = true)] public static partial int PostThreadMessageW(uint tid, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] public static partial uint MsgWaitForMultipleObjectsEx(uint count, nint* handles, uint ms, uint wakeMask, uint flags);
    [LibraryImport("user32.dll")] public static partial int GetIconInfo(nint hIcon, out ICONINFO info);
    [LibraryImport("user32.dll")] public static partial int DestroyIcon(nint h);
    [LibraryImport("user32.dll")] public static partial nint CopyIcon(nint h);
    [LibraryImport("user32.dll")] public static partial nint CreateIconIndirect(ICONINFO* info);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int SetWindowTextW(nint h, string text);
    [LibraryImport("user32.dll")] public static partial nint GetDC(nint h);
    [LibraryImport("user32.dll")] public static partial int ReleaseDC(nint h, nint dc);
    [LibraryImport("user32.dll")] public static partial int GetKeyState(int vk);
    [LibraryImport("user32.dll")] public static partial uint GetDpiForWindow(nint h);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial nint FindWindowExW(nint parent, nint after, string? cls, string? title);
    [LibraryImport("user32.dll")] public static partial int GetSystemMetrics(int index);
    [LibraryImport("user32.dll")] public static partial int GetCursorPos(out POINT p);
    [LibraryImport("user32.dll")] public static partial nint WindowFromPoint(POINT p);
    public const int SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77, SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;
    public const uint INPUT_MOUSE = 0;

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
        len = Math.Min(len, 4096);
        var buf = new char[len + 1];
        fixed (char* p = buf)
        {
            var n = GetWindowTextW(h, p, buf.Length);
            return n > 0 ? new string(p, 0, n) : "";
        }
    }
}

internal static unsafe partial class Gdi32
{
    [LibraryImport("gdi32.dll")] public static partial nint CreateCompatibleDC(nint dc);
    [LibraryImport("gdi32.dll")] public static partial int DeleteDC(nint dc);
    [LibraryImport("gdi32.dll")] public static partial nint CreateDIBSection(nint dc, BITMAPINFOHEADER* bmi, uint usage, out nint bits, nint section, uint offset);
    [LibraryImport("gdi32.dll")] public static partial nint CreateBitmap(int w, int h, uint planes, uint bpp, void* bits);
    [LibraryImport("gdi32.dll")] public static partial nint SelectObject(nint dc, nint obj);
    [LibraryImport("gdi32.dll")] public static partial int DeleteObject(nint obj);
    [LibraryImport("gdi32.dll")] public static partial int GetObjectW(nint obj, int size, void* buf);
    [LibraryImport("gdi32.dll")] public static partial int GetDIBits(nint dc, nint bmp, uint start, uint lines, void* bits, BITMAPINFOHEADER* bmi, uint usage);
}

internal static unsafe partial class Kernel32
{
    public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    public const uint TH32CS_SNAPPROCESS = 0x2;
    public const int ERROR_ALREADY_EXISTS = 183, ERROR_CLASS_ALREADY_EXISTS = 1410, ERROR_HOTKEY_ALREADY_REGISTERED = 1409,
        ERROR_ACCESS_DENIED = 5, ERROR_PIPE_BUSY = 231, APPMODEL_ERROR_NO_APPLICATION = 15703, ERROR_INSUFFICIENT_BUFFER = 122;

    [LibraryImport("kernel32.dll", SetLastError = true)] public static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] public static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] public static partial int QueryFullProcessImageNameW(nint h, uint flags, char* buf, ref uint size);
    [LibraryImport("kernel32.dll")] public static partial nint GetCurrentProcess();
    [LibraryImport("kernel32.dll")] public static partial uint GetCurrentThreadId();
    [LibraryImport("kernel32.dll")] public static partial nint GetModuleHandleW(char* name);
    [LibraryImport("kernel32.dll")] public static partial int GetApplicationUserModelId(nint process, ref uint len, char* buf);
    [LibraryImport("kernel32.dll")] public static partial int GetProcessTimes(nint h, out FILETIME creation, out FILETIME exit, out FILETIME kernel, out FILETIME user);
    [LibraryImport("kernel32.dll", SetLastError = true)] public static partial nint CreateToolhelp32Snapshot(uint flags, uint pid);
    [LibraryImport("kernel32.dll")] public static partial int Process32FirstW(nint snap, PROCESSENTRY32W* e);
    [LibraryImport("kernel32.dll")] public static partial int Process32NextW(nint snap, PROCESSENTRY32W* e);
    [LibraryImport("kernel32.dll", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint CreateNamedPipeW(string name, uint openMode, uint pipeMode, uint maxInstances, uint outBuf, uint inBuf, uint defaultTimeout, SECURITY_ATTRIBUTES* sa);
    [LibraryImport("kernel32.dll", SetLastError = true)] public static partial int GetNamedPipeClientProcessId(nint pipe, out uint pid);
}

internal static unsafe partial class Advapi32
{
    public const uint TOKEN_QUERY = 0x8;
    public const int TokenElevation = 20, TokenIntegrityLevel = 25;

    [LibraryImport("advapi32.dll", SetLastError = true)] public static partial int OpenProcessToken(nint h, uint access, out nint token);
    [LibraryImport("advapi32.dll", SetLastError = true)] public static partial int GetTokenInformation(nint token, int cls, void* info, uint len, out uint ret);
    [LibraryImport("advapi32.dll")] public static partial byte* GetSidSubAuthorityCount(nint sid);
    [LibraryImport("advapi32.dll")] public static partial uint* GetSidSubAuthority(nint sid, uint i);
}

internal static unsafe partial class Dwm
{
    public const uint DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
    [LibraryImport("dwmapi.dll")] public static partial int DwmGetWindowAttribute(nint h, uint attr, void* value, uint size);
}

internal static unsafe partial class Shell32
{
    [LibraryImport("shell32.dll")] public static partial int SHGetPropertyStoreForWindow(nint hwnd, Guid* riid, nint* ppv);
    [LibraryImport("shell32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int SHCreateItemFromParsingName(string path, nint bc, Guid* riid, nint* ppv);
}

internal static unsafe partial class Ole32
{
    [LibraryImport("ole32.dll")] public static partial int CoCreateInstance(Guid* clsid, nint outer, uint ctx, Guid* iid, nint* ppv);
    [LibraryImport("ole32.dll")] public static partial int PropVariantClear(void* pv);
}

/// <summary>Raw COM vtable helpers: deterministic Release on the calling thread (no RCWs, no finalizer-thread releases).</summary>
internal static unsafe class ComVtbl
{
    public static nint Slot(nint obj, int i) => (*(nint**)obj)[i];

    public static uint Release(nint obj) => obj == 0 ? 0 : ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(obj, 2))(obj);
}
