using System.Runtime.InteropServices;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// The tests' OWN window (the only window any test moves): created on its own message-loop thread, shown without
/// activation (focus never leaves the user's app), animated so Windows.Graphics.Capture has frames, destroyed on Dispose.
/// <see cref="Kind.AltTab"/> makes it alt-tab eligible (APPWINDOW + NOACTIVATE); <see cref="Kind.Resizable"/> is a normal
/// overlapped window with invisible resize borders, for placement math.
/// </summary>
public sealed unsafe partial class OwnWindow : IDisposable
{
    public enum Kind { Popup, AltTab, Resizable }

    private static int s_classCount;
    private static readonly Dictionary<nint, OwnWindow> Windows = [];
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new();
    private uint _threadId;
    private int _tick;

    public nint Hwnd { get; private set; }
    public bool Animate { get; set; } = true;

    public OwnWindow(Kind kind, int x, int y, int w, int h, string title = "Prism Play test window (temporary)")
    {
        _thread = new Thread(() => Run(kind, x, y, w, h, title)) { IsBackground = true, Name = "own-test-window" };
        _thread.Start();
        if (!_ready.Wait(5000)) throw new InvalidOperationException("test window did not start");
        if (Hwnd == 0) throw new InvalidOperationException("CreateWindowEx failed");
    }

    /// <summary>A small window in the bottom-right corner of the primary monitor's work area.</summary>
    public static OwnWindow InCorner(Kind kind, int w = 320, int h = 200)
    {
        var work = PrimaryWork();
        return new OwnWindow(kind, work.Right - w - 32, work.Bottom - h - 32, w, h);
    }

    public static (int Left, int Top, int Right, int Bottom) PrimaryWork()
    {
        var r = new int[4];
        fixed (int* p = r) SystemParametersInfoW(0x0030 /* SPI_GETWORKAREA */, 0, p, 0);
        return (r[0], r[1], r[2], r[3]);
    }

    private void Run(Kind kind, int x, int y, int w, int h, string title)
    {
        SetThreadDpiAwarenessContext(-4);
        var cls = $"PrismPlayW1Test{Interlocked.Increment(ref s_classCount)}_{Environment.ProcessId}";
        fixed (char* c = cls)
        {
            var wc = new WNDCLASSEXW { cbSize = (uint)sizeof(WNDCLASSEXW), lpfnWndProc = &WndProc, hInstance = GetModuleHandleW(null), lpszClassName = c, hCursor = 0 };
            RegisterClassExW(&wc);
            uint style, ex;
            switch (kind)
            {
                case Kind.AltTab: style = 0x80000000 | 0x00C00000; ex = 0x40000 | 0x08000000; break;           // POPUP|CAPTION, APPWINDOW|NOACTIVATE
                case Kind.Resizable: style = 0x00CF0000; ex = 0x08000000 | 0x40000; break;                      // OVERLAPPEDWINDOW, NOACTIVATE|APPWINDOW
                default: style = 0x80000000; ex = 0x80 | 0x08000000; break;                                    // POPUP, TOOLWINDOW|NOACTIVATE
            }
            Hwnd = CreateWindowExW(ex, cls, title, style, x, y, w, h, 0, 0, wc.hInstance, 0);
            if (Hwnd != 0)
            {
                lock (Windows) Windows[Hwnd] = this;
                ShowWindow(Hwnd, 4 /* SW_SHOWNOACTIVATE */);
                SetTimer(Hwnd, 1, 16, 0);
            }
            _threadId = GetCurrentThreadId();
            _ready.Set();
            while (GetMessageW(out var m, 0, 0, 0) > 0) { TranslateMessage(m); DispatchMessageW(m); }
        }
    }

    [UnmanagedCallersOnly]
    private static nint WndProc(nint h, uint msg, nint wp, nint lp)
    {
        OwnWindow? self;
        lock (Windows) Windows.TryGetValue(h, out self);
        switch (msg)
        {
            case 0x0113: // WM_TIMER
                if (self is { Animate: true }) { self._tick++; InvalidateRect(h, 0, 0); }
                return 0;
            case 0x000F: // WM_PAINT: synthetic blue/violet bands only
            {
                var ps = stackalloc byte[72];
                var dc = BeginPaint(h, ps);
                GetClientRect(h, out var rc);
                var t = self?._tick ?? 0;
                var band = new RECT { Left = rc.Left, Top = rc.Top, Right = rc.Right, Bottom = rc.Bottom };
                var b1 = CreateSolidBrush((uint)(0x60 + (t * 3 & 0x7F)) << 16 | 0x28u << 8 | 0x30u);
                FillRect(dc, &band, b1);
                DeleteObject(b1);
                band.Top = rc.Top + (rc.Bottom - rc.Top) / 3;
                band.Bottom = band.Top + (rc.Bottom - rc.Top) / 6;
                band.Left = rc.Left + (t * 4) % Math.Max(1, rc.Right - rc.Left);
                var b2 = CreateSolidBrush(0xF2A2B8);
                FillRect(dc, &band, b2);
                DeleteObject(b2);
                EndPaint(h, ps);
                return 0;
            }
            case 0x0002: // WM_DESTROY
                lock (Windows) Windows.Remove(h);
                PostQuitMessage(0);
                return 0;
        }
        return DefWindowProcW(h, msg, wp, lp);
    }

    /// <summary>Moves OUR window (SetWindowPos, no activation).</summary>
    public void MoveTo(int x, int y, int w, int h) => SetWindowPos(Hwnd, 0, x, y, w, h, 0x4 | 0x10);

    public void Minimize() => ShowWindow(Hwnd, 7 /* SW_SHOWMINNOACTIVE */);
    public void Restore() => ShowWindow(Hwnd, 4 /* SW_SHOWNOACTIVATE */);

    public void Dispose()
    {
        if (Hwnd != 0) PostMessageW(Hwnd, 0x0010 /* WM_CLOSE */, 0, 0);
        _thread.Join(3000);
        Hwnd = 0;
    }

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public nint hwnd; public uint message; public nint wParam, lParam; public uint time; public POINT pt; public uint lPrivate; }
    [StructLayout(LayoutKind.Sequential)]
    private struct WNDCLASSEXW { public uint cbSize, style; public delegate* unmanaged<nint, uint, nint, nint, nint> lpfnWndProc; public int cbClsExtra, cbWndExtra; public nint hInstance, hIcon, hCursor, hbrBackground; public char* lpszMenuName, lpszClassName; public nint hIconSm; }

    [LibraryImport("user32.dll")] private static partial ushort RegisterClassExW(WNDCLASSEXW* wc);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] private static partial nint CreateWindowExW(uint ex, string cls, string? title, uint style, int x, int y, int w, int h, nint parent, nint menu, nint inst, nint param);
    [LibraryImport("user32.dll")] private static partial nint DefWindowProcW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] private static partial int ShowWindow(nint h, int cmd);
    [LibraryImport("user32.dll")] private static partial int GetMessageW(out MSG m, nint h, uint min, uint max);
    [LibraryImport("user32.dll")] private static partial int TranslateMessage(in MSG m);
    [LibraryImport("user32.dll")] private static partial nint DispatchMessageW(in MSG m);
    [LibraryImport("user32.dll")] private static partial int PostMessageW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] private static partial void PostQuitMessage(int code);
    [LibraryImport("user32.dll")] private static partial nuint SetTimer(nint h, nuint id, uint ms, nint proc);
    [LibraryImport("user32.dll")] private static partial int InvalidateRect(nint h, nint r, int erase);
    [LibraryImport("user32.dll")] private static partial nint BeginPaint(nint h, byte* ps);
    [LibraryImport("user32.dll")] private static partial int EndPaint(nint h, byte* ps);
    [LibraryImport("user32.dll")] private static partial int FillRect(nint dc, RECT* r, nint brush);
    [LibraryImport("user32.dll")] private static partial int GetClientRect(nint h, out RECT r);
    [LibraryImport("user32.dll")] private static partial int SetWindowPos(nint h, nint after, int x, int y, int cx, int cy, uint flags);
    [LibraryImport("user32.dll")] private static partial int SystemParametersInfoW(uint action, uint p, void* pv, uint ini);
    [LibraryImport("user32.dll")] private static partial nint SetThreadDpiAwarenessContext(nint ctx);
    [LibraryImport("gdi32.dll")] private static partial nint CreateSolidBrush(uint color);
    [LibraryImport("gdi32.dll")] private static partial int DeleteObject(nint obj);
    [LibraryImport("kernel32.dll")] private static partial uint GetCurrentThreadId();
    [LibraryImport("kernel32.dll")] private static partial nint GetModuleHandleW(char* name);
}
