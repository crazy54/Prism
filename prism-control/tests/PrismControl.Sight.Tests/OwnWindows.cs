using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Tests;

public enum OwnWindowMode { Gdi, SwapchainBgra8, SwapchainFp16 }

public sealed class OwnWindowOptions
{
    public int X { get; init; }
    public int Y { get; init; }
    public int W { get; init; } = 320;
    public int H { get; init; } = 200;
    public bool Topmost { get; init; } = true;
    /// <summary>Put it at the bottom of the z-order (behind every other window) instead.</summary>
    public bool Bottom { get; init; }
    /// <summary>WS_OVERLAPPEDWINDOW with a caption and borders (client offset tests) instead of a popup.</summary>
    public bool Bordered { get; init; }
    public OwnWindowMode Mode { get; init; } = OwnWindowMode.Gdi;
    /// <summary>Animation: called on the window thread every <see cref="FrameIntervalMs"/> to produce the next frame (GDI).</summary>
    public Func<long, SightImage>? Animate { get; init; }
    public int FrameIntervalMs { get; init; } = 16;
}

/// <summary>
/// A window this process creates and owns: never activated (WS_EX_NOACTIVATE, SW_SHOWNOACTIVATE), no taskbar button
/// (tool window), destroyed on Dispose. It shows a GDI image or a D3D11 flip-model swapchain (BGRA8 SDR, or FP16 scRGB
/// HDR with DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709). These are the only windows the Sight tests ever capture.
/// </summary>
public sealed unsafe partial class OwnWindow : IDisposable
{
    private static readonly ConcurrentDictionary<nint, OwnWindow> Windows = new();
    private static int _registered;
    private const string ClassName = "PrismSightTestWindow";
    private readonly OwnWindowOptions _o;
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new();
    private readonly object _gate = new();
    private SightImage? _gdiImage;
    private byte[]? _pending;
    private int _pendingPitch;
    private nint _device, _context, _swap;
    private long _frameNo;
    private Exception? _startError;
    public readonly List<double> FrameIntervalsMs = [];
    private long _lastFrameTicks;

    private OwnWindow(OwnWindowOptions o)
    {
        _o = o;
        _thread = new Thread(Run) { IsBackground = true, Name = "own-window" };
        _thread.SetApartmentState(ApartmentState.STA);
    }

    public nint Hwnd { get; private set; }
    public OwnWindowOptions Options => _o;

    public static OwnWindow Create(OwnWindowOptions o)
    {
        var w = new OwnWindow(o);
        w._thread.Start();
        if (!w._ready.Wait(5000)) throw new TimeoutException("test window did not start");
        if (w._startError is not null) throw new InvalidOperationException("test window failed: " + w._startError.Message, w._startError);
        return w;
    }

    /// <summary>GDI: the image to paint (copied).</summary>
    public void SetImage(SightImage img)
    {
        lock (_gate) _gdiImage = img.Clone();
        InvalidateRect(Hwnd, 0, 0);
    }

    /// <summary>Swapchain: raw texels (BGRA8 or RGBA16F) for the next present.</summary>
    public void SetPixels(byte[] data, int rowPitch)
    {
        lock (_gate) { _pending = data; _pendingPitch = rowPitch; }
    }

    public void Minimize() => ShowWindow(Hwnd, 7 /* SW_SHOWMINNOACTIVE */);
    public void Restore() => ShowWindow(Hwnd, 4 /* SW_SHOWNOACTIVATE */);
    public void MoveTo(int x, int y) => SetWindowPos(Hwnd, 0, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010 /* NOSIZE|NOZORDER|NOACTIVATE */);

    private void Run()
    {
        try
        {
            EnsureClass();
            uint ex = 0x08000000 /* NOACTIVATE */ | 0x80 /* TOOLWINDOW */;
            if (_o.Topmost && !_o.Bottom) ex |= 0x8 /* TOPMOST */;
            var style = _o.Bordered ? 0x00CF0000u /* WS_OVERLAPPEDWINDOW */ : 0x80000000u /* WS_POPUP */;
            Hwnd = CreateWindowExW(ex, ClassName, "Prism Sight test window (temporary)", style, _o.X, _o.Y, _o.W, _o.H, 0, 0, GetModuleHandleW(null), 0);
            if (Hwnd == 0) throw new InvalidOperationException($"CreateWindowEx failed ({Marshal.GetLastPInvokeError()})");
            Windows[Hwnd] = this;
            if (_o.Mode != OwnWindowMode.Gdi) CreateSwapchain();
            ShowWindow(Hwnd, 4 /* SW_SHOWNOACTIVATE */);
            if (_o.Bottom) SetWindowPos(Hwnd, 1 /* HWND_BOTTOM */, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            SetTimer(Hwnd, 1, (uint)Math.Max(1, _o.FrameIntervalMs), 0);
        }
        catch (Exception e)
        {
            _startError = e;
            _ready.Set();
            return;
        }
        _ready.Set();
        while (GetMessageW(out var m, 0, 0, 0) > 0)
        {
            TranslateMessage(m);
            DispatchMessageW(m);
        }
        ReleaseSwapchain();
    }

    private void OnTimer()
    {
        var now = System.Diagnostics.Stopwatch.GetTimestamp();
        if (_lastFrameTicks != 0)
            lock (FrameIntervalsMs) FrameIntervalsMs.Add((now - _lastFrameTicks) * 1000.0 / System.Diagnostics.Stopwatch.Frequency);
        _lastFrameTicks = now;
        _frameNo++;
        if (_o.Animate is { } anim)
        {
            var img = anim(_frameNo);
            lock (_gate) _gdiImage = img;
            InvalidateRect(Hwnd, 0, 0);
            UpdateWindow(Hwnd);
        }
        if (_swap != 0) Present();
    }

    private void Paint()
    {
        var ps = stackalloc byte[72];
        var dc = BeginPaint(Hwnd, ps);
        SightImage? img;
        lock (_gate) img = _gdiImage;
        if (img is not null)
        {
            var bmi = stackalloc byte[40];
            new Span<byte>(bmi, 40).Clear();
            *(int*)bmi = 40; *(int*)(bmi + 4) = img.Width; *(int*)(bmi + 8) = -img.Height; *(short*)(bmi + 12) = 1; *(short*)(bmi + 14) = 32;
            fixed (byte* p = img.Pixels) SetDIBitsToDevice(dc, 0, 0, (uint)img.Width, (uint)img.Height, 0, 0, 0, (uint)img.Height, p, bmi, 0);
        }
        EndPaint(Hwnd, ps);
    }

    // ------------------------------------------------------------------ swapchain

    private void CreateSwapchain()
    {
        (_device, _context, _) = D3D11.CreateDevice();
        var iidFactory = new Guid("50c83a1c-e072-4c48-87b0-3630fa36a6d0");
        Marshal.ThrowExceptionForHR(CreateDXGIFactory2(0, &iidFactory, out var factory));
        try
        {
            var desc = stackalloc uint[11];
            desc[0] = (uint)_o.W; desc[1] = (uint)_o.H;
            desc[2] = _o.Mode == OwnWindowMode.SwapchainFp16 ? D3D11.DXGI_FORMAT_R16G16B16A16_FLOAT : D3D11.DXGI_FORMAT_B8G8R8A8_UNORM;
            desc[3] = 0; desc[4] = 1; desc[5] = 0; desc[6] = 0x20 /* RENDER_TARGET_OUTPUT */; desc[7] = 2; desc[8] = 0 /* STRETCH */;
            desc[9] = 4 /* FLIP_DISCARD */; desc[10] = 0;
            var flags = stackalloc uint[1];
            nint swap;
            var hr = ((delegate* unmanaged[Stdcall]<nint, nint, nint, uint*, nint, nint, nint*, int>)D3D11.Slot(factory, 15))(factory, _device, Hwnd, desc, 0, 0, &swap);
            Marshal.ThrowExceptionForHR(hr);
            _swap = swap;
            if (_o.Mode == OwnWindowMode.SwapchainFp16)
            {
                Marshal.ThrowExceptionForHR(D3D11.QueryInterface(_swap, new Guid("94d99bdb-f1f8-4ab0-b236-7da0170edab1"), out var sc3));
                try { Marshal.ThrowExceptionForHR(((delegate* unmanaged[Stdcall]<nint, uint, int>)D3D11.Slot(sc3, 38))(sc3, 1 /* RGB_FULL_G10_NONE_P709 */)); }
                finally { D3D11.Release(sc3); }
            }
        }
        finally { D3D11.Release(factory); }
    }

    private void Present()
    {
        byte[]? data;
        int pitch;
        lock (_gate) { data = _pending; pitch = _pendingPitch; }
        if (data is not null)
        {
            var iid = D3D11.IID_ID3D11Texture2D;
            nint buf;
            if (((delegate* unmanaged[Stdcall]<nint, uint, Guid*, nint*, int>)D3D11.Slot(_swap, 9))(_swap, 0, &iid, &buf) >= 0)
            {
                fixed (byte* p = data)
                    ((delegate* unmanaged[Stdcall]<nint, nint, uint, nint, byte*, uint, uint, void>)D3D11.Slot(_context, 48))(_context, buf, 0, 0, p, (uint)pitch, 0);
                D3D11.Release(buf);
            }
        }
        ((delegate* unmanaged[Stdcall]<nint, uint, uint, int>)D3D11.Slot(_swap, 8))(_swap, 1, 0);
    }

    private void ReleaseSwapchain()
    {
        if (_swap != 0) D3D11.Release(_swap);
        if (_context != 0) D3D11.Release(_context);
        if (_device != 0) D3D11.Release(_device);
        _swap = _context = _device = 0;
    }

    public void Dispose()
    {
        if (Hwnd != 0)
        {
            PostMessageW(Hwnd, 0x0010 /* WM_CLOSE */, 0, 0);
            _thread.Join(3000);
            Windows.TryRemove(Hwnd, out _);
        }
    }

    // ------------------------------------------------------------------ Win32

    private static void EnsureClass()
    {
        if (Interlocked.Exchange(ref _registered, 1) == 1) return;
        fixed (char* cls = ClassName)
        {
            var wc = new WNDCLASSEXW { cbSize = (uint)sizeof(WNDCLASSEXW), lpfnWndProc = &WndProc, hInstance = GetModuleHandleW(null), lpszClassName = cls, hCursor = 0 };
            RegisterClassExW(&wc);
        }
    }

    [UnmanagedCallersOnly]
    private static nint WndProc(nint h, uint msg, nint wp, nint lp)
    {
        Windows.TryGetValue(h, out var self);
        switch (msg)
        {
            case 0x0014: return 1;                                   // WM_ERASEBKGND
            case 0x000F: if (self is not null) { self.Paint(); return 0; } break;   // WM_PAINT
            case 0x0113: self?.OnTimer(); return 0;                  // WM_TIMER
            case 0x0021: return 3;                                   // WM_MOUSEACTIVATE → MA_NOACTIVATE
            case 0x0002: PostQuitMessage(0); return 0;               // WM_DESTROY
        }
        return DefWindowProcW(h, msg, wp, lp);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WNDCLASSEXW
    {
        public uint cbSize, style;
        public delegate* unmanaged<nint, uint, nint, nint, nint> lpfnWndProc;
        public int cbClsExtra, cbWndExtra;
        public nint hInstance, hIcon, hCursor, hbrBackground;
        public char* lpszMenuName, lpszClassName;
        public nint hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG { public nint hwnd; public uint message; public nint wParam, lParam; public uint time; public int x, y; public uint lPrivate; }

    [LibraryImport("user32.dll", SetLastError = true)] private static partial ushort RegisterClassExW(WNDCLASSEXW* wc);
    [LibraryImport("user32.dll", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint CreateWindowExW(uint ex, string cls, string title, uint style, int x, int y, int w, int h, nint parent, nint menu, nint inst, nint param);
    [LibraryImport("user32.dll")] private static partial nint DefWindowProcW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] private static partial int ShowWindow(nint h, int cmd);
    [LibraryImport("user32.dll")] private static partial int UpdateWindow(nint h);
    [LibraryImport("user32.dll")] private static partial int SetWindowPos(nint h, nint after, int x, int y, int cx, int cy, uint flags);
    [LibraryImport("user32.dll")] private static partial int GetMessageW(out MSG m, nint h, uint min, uint max);
    [LibraryImport("user32.dll")] private static partial int TranslateMessage(in MSG m);
    [LibraryImport("user32.dll")] private static partial nint DispatchMessageW(in MSG m);
    [LibraryImport("user32.dll")] private static partial int PostMessageW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] private static partial void PostQuitMessage(int code);
    [LibraryImport("user32.dll")] private static partial nuint SetTimer(nint h, nuint id, uint ms, nint proc);
    [LibraryImport("user32.dll")] private static partial int InvalidateRect(nint h, nint r, int erase);
    [LibraryImport("user32.dll")] private static partial nint BeginPaint(nint h, byte* ps);
    [LibraryImport("user32.dll")] private static partial int EndPaint(nint h, byte* ps);
    [LibraryImport("gdi32.dll")] private static partial int SetDIBitsToDevice(nint dc, int x, int y, uint w, uint h, int sx, int sy, uint start, uint lines, byte* bits, byte* bmi, uint usage);
    [LibraryImport("kernel32.dll", StringMarshalling = StringMarshalling.Utf16)] private static partial nint GetModuleHandleW(string? name);
    [LibraryImport("dxgi.dll")] private static partial int CreateDXGIFactory2(uint flags, Guid* iid, out nint factory);
}
