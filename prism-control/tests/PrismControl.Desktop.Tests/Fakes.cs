using System.Runtime.InteropServices;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;

namespace PrismControl.Desktop.Tests;

/// <summary>A log that keeps every line (tests assert on safe-mode lines and that secrets never appear).</summary>
public sealed class RecordingLog : ILog
{
    private readonly List<string> _lines = [];
    public IReadOnlyList<string> Lines { get { lock (_lines) return [.. _lines]; } }
    public string Text => string.Join("\n", Lines);
    public void Write(LogLevel level, string message, Exception? exception = null) { lock (_lines) _lines.Add($"{level}: {message}"); }
    public ILog For(string category) => this;
    public bool IsEnabled(LogLevel level) => true;
}

/// <summary>A temporary folder, deleted on dispose.</summary>
public sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "prism-desktop-test-" + Guid.NewGuid().ToString("N")[..8]);
    public TempDir() => Directory.CreateDirectory(Path);
    public string File(string name) => System.IO.Path.Combine(Path, name);
    public void Dispose()
    {
        for (var i = 0; i < 20; i++)
        {
            try { if (Directory.Exists(Path)) Directory.Delete(Path, recursive: true); return; }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Thread.Sleep(50); }
        }
    }
}

/// <summary>Sets an environment variable for a test and restores it.</summary>
public sealed class EnvScope : IDisposable
{
    private readonly string _name;
    private readonly string? _before;
    public EnvScope(string name, string? value) { _name = name; _before = Environment.GetEnvironmentVariable(name); Environment.SetEnvironmentVariable(name, value); }
    public void Dispose() => Environment.SetEnvironmentVariable(_name, _before);
}

/// <summary>Enough of the host for DesktopServices.GetOrCreate / RelayInstaller.ForModule.</summary>
public sealed class FakeModuleContext(string pluginDirectory, string dataDirectory, bool safeMode) : IModuleContext, IDisposable
{
    private readonly CancellationTokenSource _shutdown = new();
    public RecordingLog RecordingLog { get; } = new();
    public ILog Log => RecordingLog;
    public IDataRegistry Data => throw new NotSupportedException();
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    /// <summary>Set to give the context working global settings (else they throw, like a bare host).</summary>
    public IGlobalSettings? Globals { get; set; }
    public IGlobalSettings GlobalSettings => Globals ?? throw new NotSupportedException();
    public IPluginEvents Events => throw new NotSupportedException();
    public IDeviceDirectory Devices => throw new NotSupportedException();
    public TimeProvider Time => TimeProvider.System;
    public CancellationToken ShutdownToken => _shutdown.Token;
    public string PluginDirectory => pluginDirectory;
    public string DataDirectory => dataDirectory;
    public bool SafeMode => safeMode;
    public void OpenUrl(string url) { }
    public void Shutdown() => _shutdown.Cancel();
    public void Dispose() => _shutdown.Cancel();
}

/// <summary>A scripted <see cref="IForegroundNative"/>: no window is ever touched. Records every write in order.</summary>
internal sealed class FakeForegroundNative : IForegroundNative
{
    public readonly HashSet<nint> Windows = [];
    public readonly Dictionary<nint, nint> Roots = new();
    public readonly Dictionary<nint, nint> RootOwners = new();
    public readonly HashSet<nint> Minimized = [];
    public readonly HashSet<nint> Elevated = [];
    public readonly HashSet<nint> Ours = [];
    public nint Foreground;
    public HotkeyTrickResult Trick = HotkeyTrickResult.Fired;
    /// <summary>Whether SetForegroundWindow works inside the hotkey handler / on its own / via SwitchToThisWindow.</summary>
    public bool SfwInHandlerWorks = true, SfwWorks, SwitchWorks, AsfwInHandlerWorks = true, AsfwWorks;
    /// <summary>Restores apply only after this many foreground checks (async ShowWindow).</summary>
    public int RestoreLag;
    public readonly List<string> Calls = [];
    public int Delays, TrickCalls;
    private bool _inHandler;
    private readonly Dictionary<nint, int> _pendingRestore = new();

    public bool IsWindow(nint hwnd) => Windows.Contains(hwnd);
    public nint RootOf(nint hwnd) => Roots.TryGetValue(hwnd, out var r) ? r : hwnd;
    public nint RootOwnerOf(nint hwnd) => RootOwners.TryGetValue(hwnd, out var r) ? r : hwnd;
    public bool IsMinimized(nint hwnd)
    {
        if (_pendingRestore.TryGetValue(hwnd, out var left))
        {
            if (left <= 0) { _pendingRestore.Remove(hwnd); Minimized.Remove(hwnd); }
            else _pendingRestore[hwnd] = left - 1;
        }
        return Minimized.Contains(hwnd);
    }
    public nint GetForeground() => Foreground;
    public bool IsAboveUs(nint hwnd) => Elevated.Contains(hwnd);
    public bool IsOurs(nint hwnd) => Ours.Contains(hwnd);

    public Task RestoreAsync(nint hwnd) { RestoreNow(hwnd); return Task.CompletedTask; }
    public Task<bool> SetForegroundAsync(nint hwnd) => Task.FromResult(SetForegroundNow(hwnd));
    public Task SwitchToAsync(nint hwnd)
    {
        Calls.Add($"switch {hwnd}");
        if (SwitchWorks) Foreground = hwnd;
        return Task.CompletedTask;
    }
    public Task<bool> AllowSetForegroundAsync(uint pid) => Task.FromResult(AllowSetForegroundNow(pid));

    /// <summary>The virtual key of every trick call, in order.</summary>
    public readonly List<uint> TrickKeys = [];

    public Task<HotkeyTrickResult> HotkeyTrickAsync(uint virtualKey, Action onRights, TimeSpan timeout, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        TrickCalls++;
        TrickKeys.Add(virtualKey);
        Calls.Add("trick");
        if (Trick == HotkeyTrickResult.Fired)
        {
            _inHandler = true;
            try { onRights(); }
            finally { _inHandler = false; }
        }
        return Task.FromResult(Trick);
    }

    public bool SetForegroundNow(nint hwnd)
    {
        Calls.Add(_inHandler ? $"sfw-in-handler {hwnd}" : $"sfw {hwnd}");
        var ok = _inHandler ? SfwInHandlerWorks : SfwWorks;
        if (ok) Foreground = hwnd;
        return ok;
    }

    public void RestoreNow(nint hwnd)
    {
        Calls.Add($"restore {hwnd}");
        if (!Minimized.Contains(hwnd)) return;
        if (RestoreLag == 0) Minimized.Remove(hwnd); else _pendingRestore[hwnd] = RestoreLag;
    }

    public bool AllowSetForegroundNow(uint pid)
    {
        Calls.Add(_inHandler ? $"asfw-in-handler {pid}" : $"asfw {pid}");
        return _inHandler ? AsfwInHandlerWorks : AsfwWorks;
    }

    public Task DelayAsync(TimeSpan delay, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Delays++;
        return Task.CompletedTask;
    }
}

/// <summary>A scripted keyboard: records batches; can accept only part of a batch or throw.</summary>
internal sealed class FakeInjector : IKeyboardInjector
{
    public readonly List<KeyEvent[]> Batches = [];
    /// <summary>For each Send call in order: how many events to accept (-1 = all, -2 = throw). Missing = all.</summary>
    public readonly Queue<int> Script = new();
    public nint ForegroundWindow = 0x1000;
    public readonly HashSet<nint> Elevated = [];
    public Func<nint>? ForegroundFunc;

    public IEnumerable<KeyEvent> Accepted => _accepted;
    private readonly List<KeyEvent> _accepted = [];

    public int Send(ReadOnlySpan<KeyEvent> events)
    {
        var batch = events.ToArray();
        Batches.Add(batch);
        var take = Script.Count > 0 ? Script.Dequeue() : -1;
        if (take == -2) throw new InvalidOperationException("simulated SendInput failure");
        var n = take < 0 ? batch.Length : Math.Min(take, batch.Length);
        _accepted.AddRange(batch.Take(n));
        return n;
    }

    // Deterministic US set-1 scan codes for the keys the tests use (E0 prefix for extended keys).
    public ushort ScanCode(ushort vk) => vk switch
    {
        0x11 => 0x1D, 0x10 => 0x2A, 0x12 => 0x38, 0x56 => 0x2F, 0x43 => 0x2E, 0x41 => 0x1E, 0x0D => 0x1C, 0x09 => 0x0F,
        0x25 => 0xE04B, 0x26 => 0xE048, 0x27 => 0xE04D, 0x28 => 0xE050, 0x2E => 0xE053, 0xA5 => 0xE038, 0x5B => 0xE05B, 0x73 => 0x3E,
        _ => 0,
    };

    public nint Foreground() => ForegroundFunc?.Invoke() ?? ForegroundWindow;
    public bool IsAboveUs(nint hwnd) => Elevated.Contains(hwnd);

    /// <summary>The net key state after everything accepted: keys still down (should be empty after every call).</summary>
    public List<(ushort Vk, ushort Scan)> StillDown()
    {
        var down = new List<(ushort, ushort)>();
        foreach (var e in _accepted)
        {
            var k = (e.Vk, e.Scan);
            if (!e.IsUp) down.Add(k);
            else { var i = down.LastIndexOf(k); if (i >= 0) down.RemoveAt(i); }
        }
        return down;
    }
}

/// <summary>An IShellThread that runs work inline on the caller (unit tests of components that only need InvokeAsync).</summary>
internal sealed class InlineShell : IShellThread
{
    public int Invokes;
    public event Action<ShellBroadcast>? Broadcast { add { } remove { } }
    public nint WindowHandle => 0;
    public bool IsCurrentThread => true;
    public Task<T> InvokeAsync<T>(Func<T> work, CancellationToken ct = default)
    {
        Interlocked.Increment(ref Invokes);
        try { return Task.FromResult(work()); } catch (Exception ex) { return Task.FromException<T>(ex); }
    }
    public Task InvokeAsync(Action work, CancellationToken ct = default) => InvokeAsync(() => { work(); return 0; }, ct);
    public void Dispose() { }
}

/// <summary>Test-only Win32 reads and own-window helpers.</summary>
internal static unsafe partial class TestNative
{
    [LibraryImport("user32.dll")] public static partial nint GetThreadDpiAwarenessContext();
    [LibraryImport("user32.dll")] public static partial int GetAwarenessFromDpiAwarenessContext(nint ctx);
    [LibraryImport("user32.dll")] public static partial int IsWindow(nint h);
    [LibraryImport("user32.dll")] public static partial int IsWindowVisible(nint h);
    [LibraryImport("user32.dll")] public static partial nint GetAncestor(nint h, uint flags);
    [LibraryImport("user32.dll")] public static partial nint GetDesktopWindow();
    [LibraryImport("user32.dll")] public static partial nint GetWindowLongPtrW(nint h, int idx);
    [LibraryImport("user32.dll")] public static partial nint SendMessageW(nint h, uint msg, nint wp, nint lp);
    [LibraryImport("user32.dll")] public static partial uint GetWindowThreadProcessId(nint h, out uint pid);
    [LibraryImport("user32.dll", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint CreateWindowExW(uint exStyle, string cls, string? title, uint style, int x, int y, int w, int h, nint parent, nint menu, nint inst, nint param);
    [LibraryImport("user32.dll")] public static partial int DestroyWindow(nint h);
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial int SetWindowTextW(nint h, string text);
    [LibraryImport("user32.dll")] public static partial nint CreateIconIndirect(Interop.ICONINFO* info);
    [LibraryImport("user32.dll")] public static partial int DestroyIcon(nint h);
    [LibraryImport("gdi32.dll")] public static partial nint CreateBitmap(int w, int h, uint planes, uint bpp, void* bits);
    [LibraryImport("gdi32.dll")] public static partial nint CreateDIBSection(nint dc, Interop.BITMAPINFOHEADER* bmi, uint usage, out nint bits, nint section, uint offset);
    [LibraryImport("gdi32.dll")] public static partial int DeleteObject(nint obj);
    [LibraryImport("user32.dll")] public static partial int ShowWindow(nint h, int cmd);
    [LibraryImport("kernel32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial nint GetModuleHandleW(string? name);
    [LibraryImport("kernel32.dll", StringMarshalling = StringMarshalling.Utf8)] public static partial nint GetProcAddress(nint module, string name);
    [LibraryImport("user32.dll")] public static partial ushort RegisterClassExW(Interop.WNDCLASSEXW* wc);

    private const string TestClass = "PrismDesktopTestWindow";
    private static bool _registered;

    /// <summary>A hidden, off-screen, no-activate tool window of our own whose window procedure is DefWindowProcW.</summary>
    public static nint CreateOwnTestWindow(string title)
    {
        if (!_registered)
        {
            fixed (char* name = TestClass)
            {
                var wc = new Interop.WNDCLASSEXW
                {
                    cbSize = (uint)sizeof(Interop.WNDCLASSEXW),
                    lpfnWndProc = (delegate* unmanaged<nint, uint, nint, nint, nint>)GetProcAddress(GetModuleHandleW("user32.dll"), "DefWindowProcW"),
                    hInstance = GetModuleHandleW(null),
                    lpszClassName = name,
                };
                RegisterClassExW(&wc);
            }
            _registered = true;
        }
        return CreateWindowExW(0x08000080 /* WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW */, TestClass, title, 0x80000000 /* WS_POPUP, hidden */, -32000, -32000, 10, 10, 0, 0, 0, 0);
    }
}
