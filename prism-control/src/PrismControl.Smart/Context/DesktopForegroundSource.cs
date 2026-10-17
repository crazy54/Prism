using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Smart.Context;

/// <summary>
/// The real foreground source: Desktop's LastExternalForeground (never the Stream Deck app, us, or the taskbar), the
/// window catalog for its facts, and GetClassName for match rules on the window class. Read-only.
/// </summary>
public sealed partial class DesktopForegroundSource : IForegroundSource, IDisposable
{
    private readonly IForegroundService _fg;
    private readonly IWindowCatalog _windows;
    private readonly ILog _log;
    private readonly object _gate = new();
    private ForegroundApp? _cached;
    private nint _cachedHwnd;
    private string? _cachedTitle;

    public DesktopForegroundSource(IForegroundService fg, IWindowCatalog windows, ILog? log = null)
    {
        _fg = fg;
        _windows = windows;
        _log = (log ?? NullLog.Instance).For("foreground");
        _windows.Changed += OnWindowEvent;
    }

    public event Action? Changed;

    public ForegroundApp? Current
    {
        get
        {
            var hwnd = _fg.LastExternalForeground;
            if (hwnd == 0) return null;
            lock (_gate)
            {
                if (_cachedHwnd == hwnd && _cached is not null) return _cached;
            }
            return Refresh(hwnd);
        }
    }

    public bool IsInFront(ForegroundApp app)
    {
        var fg = _fg.GetForeground();
        if (fg == 0) return false;
        if (fg == app.Hwnd) return true;
        _ = GetWindowThreadProcessId(fg, out var pid);
        return pid != 0 && pid == (uint)app.Pid;
    }

    public bool IsElevated(ForegroundApp app) => _windows.Get(app.Hwnd)?.IsElevated ?? app.IsElevated;

    public nint ForegroundWindow => _fg.GetForeground();

    private ForegroundApp? Refresh(nint hwnd)
    {
        WindowInfo? w;
        try { w = _windows.Get(hwnd); }
        catch (Exception ex) { _log.Debug("window lookup failed: " + ex.GetType().Name); w = null; }
        if (w is null) return null;
        var app = new ForegroundApp(w.Hwnd, w.Pid, w.ProcessName, w.ExePath, w.Title, w.AppUserModelId, ClassName(w.Hwnd), w.IsElevated);
        lock (_gate)
        {
            _cached = app;
            _cachedHwnd = hwnd;
            _cachedTitle = app.Title;
        }
        return app;
    }

    private void OnWindowEvent(WindowEvent e)
    {
        if (e.Kind is not (WindowEventKind.Foreground or WindowEventKind.TitleChanged or WindowEventKind.Destroyed or WindowEventKind.Restored)) return;
        var hwnd = _fg.LastExternalForeground;
        if (e.Kind == WindowEventKind.TitleChanged && e.Hwnd != hwnd) return;
        lock (_gate) { _cachedHwnd = 0; _cached = null; }
        _ = Refresh(hwnd);
        Changed?.Invoke();
    }

    private static string? ClassName(nint hwnd)
    {
        Span<char> buf = stackalloc char[256];
        unsafe
        {
            fixed (char* p = buf)
            {
                var n = GetClassNameW(hwnd, p, buf.Length);
                return n > 0 ? new string(buf[..n]) : null;
            }
        }
    }

    [LibraryImport("user32.dll", SetLastError = true)]
    private static unsafe partial int GetClassNameW(nint hWnd, char* lpClassName, int nMaxCount);

    [LibraryImport("user32.dll")]
    private static partial uint GetWindowThreadProcessId(nint hWnd, out uint lpdwProcessId);

    public void Dispose() => _windows.Changed -= OnWindowEvent;
}
