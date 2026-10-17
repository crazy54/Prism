using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>Which broadcast or window message reached the shell thread's hidden window.</summary>
public enum ShellBroadcastKind
{
    /// <summary>WM_DISPLAYCHANGE: resolution, refresh rate or monitor layout changed. WParam = bits per pixel, LParam = LOWORD width / HIWORD height.</summary>
    DisplayChange,
    /// <summary>WM_SETTINGCHANGE: <see cref="ShellBroadcast.Area"/> names the setting ("ImmersiveColorSet" = dark/light mode, "Policy", "intl", ...).</summary>
    SettingChange,
    /// <summary>WM_POWERBROADCAST: WParam is the PBT_* code. For PBT_POWERSETTINGCHANGE (0x8013), <see cref="ShellBroadcast.Data"/> is a copy of the POWERBROADCAST_SETTING.</summary>
    PowerBroadcast,
    /// <summary>WM_DEVICECHANGE: WParam is the DBT_* code; <see cref="ShellBroadcast.Data"/> is a copy of the DEV_BROADCAST_HDR block, if any.</summary>
    DeviceChange,
    /// <summary>WM_CLIPBOARDUPDATE (after a module called AddClipboardFormatListener(<see cref="IShellThread.WindowHandle"/>)).</summary>
    ClipboardUpdate,
    /// <summary>WM_THEMECHANGED.</summary>
    ThemeChanged,
    /// <summary>WM_SYSCOLORCHANGE.</summary>
    SysColorChange,
    /// <summary>WM_WTSSESSION_CHANGE (after WTSRegisterSessionNotification(<see cref="IShellThread.WindowHandle"/>)): lock, unlock, connect...</summary>
    SessionChange,
}

/// <summary>
/// One message the shell thread's hidden top-level window received. Pointer payloads are copied before the message
/// returns: <see cref="Area"/> for WM_SETTINGCHANGE strings and <see cref="Data"/> for POWERBROADCAST_SETTING /
/// DEV_BROADCAST_HDR blocks. <see cref="LParam"/> is the raw value, which is meaningless for pointer payloads afterwards.
/// </summary>
public sealed record ShellBroadcast(ShellBroadcastKind Kind, uint Message, nint WParam, nint LParam, string? Area = null, byte[]? Data = null);

/// <summary>
/// The desktop platform's one STA "shell thread" (research/windows.md §1.3). It owns:
/// <list type="bullet">
/// <item>a message pump (WINEVENT_OUTOFCONTEXT hooks need one on the hooking thread);</item>
/// <item>a hidden top-level window that receives WM_DISPLAYCHANGE / WM_SETTINGCHANGE / WM_POWERBROADCAST (message-only
/// windows do not get broadcasts), raised as <see cref="Broadcast"/>;</item>
/// <item>COM initialized as STA, for shell calls (icons), and a per-monitor-v2 DPI context for geometry.</item>
/// </list>
/// Never block it: work you invoke must finish in milliseconds. Its callbacks never run module code: events are raised on
/// the thread pool, in order.
/// </summary>
public interface IShellThread : IDisposable
{
    /// <summary>Runs <paramref name="work"/> on the shell thread and returns its result. Inline when already on it.</summary>
    Task<T> InvokeAsync<T>(Func<T> work, CancellationToken ct = default);

    /// <summary>Runs <paramref name="work"/> on the shell thread. Inline when already on it.</summary>
    Task InvokeAsync(Action work, CancellationToken ct = default);

    /// <summary>Broadcast and listener messages to the hidden window, raised on the thread pool in arrival order.</summary>
    event Action<ShellBroadcast>? Broadcast;

    /// <summary>The hidden top-level window (never shown). Register listeners with it inside <see cref="InvokeAsync(Action, CancellationToken)"/>:
    /// AddClipboardFormatListener, RegisterPowerSettingNotification, WTSRegisterSessionNotification.</summary>
    nint WindowHandle { get; }

    /// <summary>True on the shell thread itself.</summary>
    bool IsCurrentThread { get; }
}

/// <summary>The real shell thread. One per process is enough: <see cref="DesktopServices"/> shares it between modules.</summary>
public sealed unsafe class ShellThread : IShellThread
{
    private const uint InvokeMessage = User32.WM_APP + 0x51;
    private const uint StopMessage = User32.WM_APP + 0x52;
    private const string ClassName = "PrismControl.Desktop.Shell";

    private static readonly ConcurrentDictionary<nint, ShellThread> ByWindow = new();
    private static readonly ConcurrentDictionary<nint, WinEventCallback> Hooks = new();
    private static readonly object ClassGate = new();
    private static bool _classRegistered;

    private readonly ILog _log;
    private readonly Thread _thread;
    private readonly ConcurrentQueue<WorkItem> _work = new();
    private readonly SerialDispatcher _events;
    private readonly Dictionary<int, Action> _hotkeys = new();      // shell thread only
    private readonly List<nint> _ownHooks = [];                      // shell thread only
    private int _invokePosted;
    private volatile bool _stopped;
    private nint _hwnd;
    private int _threadId;

    public ShellThread(ILog? log = null)
    {
        _log = (log ?? NullLog.Instance).For("shell");
        _events = new SerialDispatcher(_log);
        using var ready = new ManualResetEventSlim();
        Exception? failure = null;
        _thread = new Thread(() => Run(ready, e => failure = e)) { IsBackground = true, Name = "Prism Desktop shell" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        if (!ready.Wait(TimeSpan.FromSeconds(10))) throw new InvalidOperationException("The desktop shell thread did not start.");
        if (failure is not null) throw new InvalidOperationException("The desktop shell thread failed to start: " + failure.Message, failure);
    }

    public event Action<ShellBroadcast>? Broadcast;

    public nint WindowHandle => _hwnd;

    public bool IsCurrentThread => Environment.CurrentManagedThreadId == _threadId;

    /// <summary>The native thread id (for PostThreadMessage and tests).</summary>
    internal uint NativeThreadId { get; private set; }

    public Task<T> InvokeAsync<T>(Func<T> work, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(work);
        if (IsCurrentThread)
        {
            try { return Task.FromResult(work()); }
            catch (Exception ex) { return Task.FromException<T>(ex); }
        }
        if (ct.IsCancellationRequested) return Task.FromCanceled<T>(ct);
        if (_stopped) return Task.FromException<T>(new ObjectDisposedException(nameof(ShellThread)));
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _work.Enqueue(new WorkItem(() =>
        {
            if (ct.IsCancellationRequested) { tcs.TrySetCanceled(ct); return; }
            try { tcs.TrySetResult(work()); }
            catch (Exception ex) { tcs.TrySetException(ex); }
        }, () => tcs.TrySetException(new ObjectDisposedException(nameof(ShellThread)))));
        Wake();
        return tcs.Task;
    }

    public Task InvokeAsync(Action work, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(work);
        return InvokeAsync(() => { work(); return true; }, ct);
    }

    /// <summary>Completes after every Broadcast/event callback queued so far has been raised (tests).</summary>
    internal Task DrainEventsAsync() => _events.DrainAsync();

    /// <summary>Queues a callback on the ordered thread-pool event queue (used by the catalog and tracker).</summary>
    internal void PostEvent(Action raise) => _events.Post(raise);

    // ------------------------------------------------------------------ hotkeys and WinEvent hooks (shell thread only)

    /// <summary>Registers a hotkey on the hidden window. <paramref name="onPressed"/> runs on the shell thread inside WM_HOTKEY.</summary>
    internal bool TryRegisterHotkey(int id, uint modifiers, uint vk, Action onPressed, out int error)
    {
        EnsureOnThread();
        error = 0;
        if (User32.RegisterHotKey(_hwnd, id, modifiers, vk) == 0)
        {
            error = Marshal.GetLastPInvokeError();
            return false;
        }
        _hotkeys[id] = onPressed;
        return true;
    }

    internal void UnregisterHotkey(int id)
    {
        EnsureOnThread();
        if (_hotkeys.Remove(id)) User32.UnregisterHotKey(_hwnd, id);
    }

    internal delegate void WinEventCallback(uint evt, nint hwnd, int idObject, int idChild, uint eventThread, uint timeMs);

    /// <summary>
    /// SetWinEventHook(WINEVENT_OUTOFCONTEXT) for [min, max]. The callback runs on the shell thread during the pump: keep
    /// it to a few filters and a <see cref="PostEvent"/>. Returns 0 on failure.
    /// </summary>
    internal nint AddWinEventHook(uint min, uint max, WinEventCallback callback)
    {
        EnsureOnThread();
        var hook = User32.SetWinEventHook(min, max, 0, &OnWinEvent, 0, 0, User32.WINEVENT_OUTOFCONTEXT);
        if (hook == 0) return 0;
        Hooks[hook] = callback;
        _ownHooks.Add(hook);
        return hook;
    }

    internal void RemoveWinEventHook(nint hook)
    {
        EnsureOnThread();
        if (hook == 0) return;
        Hooks.TryRemove(hook, out _);
        _ownHooks.Remove(hook);
        User32.UnhookWinEvent(hook);
    }

    [UnmanagedCallersOnly]
    private static void OnWinEvent(nint hook, uint evt, nint hwnd, int idObject, int idChild, uint thread, uint time)
    {
        try
        {
            if (Hooks.TryGetValue(hook, out var cb)) cb(evt, hwnd, idObject, idChild, thread, time);
        }
        catch { /* never let an exception cross into user32 */ }
    }

    // ------------------------------------------------------------------ thread

    private void EnsureOnThread()
    {
        if (!IsCurrentThread) throw new InvalidOperationException("Call this on the shell thread (inside InvokeAsync).");
    }

    private void Wake()
    {
        if (Interlocked.Exchange(ref _invokePosted, 1) == 1) return;
        if (User32.PostMessageW(_hwnd, InvokeMessage, 0, 0) == 0)
        {
            // The queue is full (10,000 messages) or the window is gone: the next successful post drains everything.
            Interlocked.Exchange(ref _invokePosted, 0);
            if (_stopped) DrainCancelled();
        }
    }

    private void Run(ManualResetEventSlim ready, Action<Exception> fail)
    {
        try
        {
            _threadId = Environment.CurrentManagedThreadId;
            NativeThreadId = Kernel32.GetCurrentThreadId();
            User32.SetThreadDpiAwarenessContext(User32.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            EnsureClass();
            // A top-level window (not HWND_MESSAGE): only top-level windows receive broadcasts. WS_EX_TOOLWINDOW keeps it
            // out of alt-tab even if something ever showed it. It is never shown.
            _hwnd = User32.CreateWindowExW(User32.WS_EX_TOOLWINDOW, ClassName, "Prism Control shell", User32.WS_POPUP, 0, 0, 0, 0, 0, 0, Kernel32.GetModuleHandleW(null), 0);
            if (_hwnd == 0) throw new InvalidOperationException("CreateWindowExW failed: " + Marshal.GetLastPInvokeError());
            ByWindow[_hwnd] = this;
        }
        catch (Exception ex)
        {
            fail(ex);
            ready.Set();
            return;
        }
        ready.Set();

        while (User32.GetMessageW(out var msg, 0, 0, 0) > 0)
        {
            User32.TranslateMessage(msg);
            User32.DispatchMessageW(msg);
        }
        Cleanup();
    }

    private void Cleanup()
    {
        foreach (var hook in _ownHooks.ToArray()) { Hooks.TryRemove(hook, out _); User32.UnhookWinEvent(hook); }
        _ownHooks.Clear();
        foreach (var id in _hotkeys.Keys.ToArray()) User32.UnregisterHotKey(_hwnd, id);
        _hotkeys.Clear();
        ByWindow.TryRemove(_hwnd, out _);
        if (_hwnd != 0) User32.DestroyWindow(_hwnd);
        DrainCancelled();
    }

    private void DrainCancelled()
    {
        while (_work.TryDequeue(out var item)) item.Cancel();
    }

    private static void EnsureClass()
    {
        lock (ClassGate)
        {
            if (_classRegistered) return;
            fixed (char* name = ClassName)
            {
                var wc = new WNDCLASSEXW
                {
                    cbSize = (uint)sizeof(WNDCLASSEXW),
                    lpfnWndProc = &WndProc,
                    hInstance = Kernel32.GetModuleHandleW(null),
                    lpszClassName = name,
                };
                if (User32.RegisterClassExW(&wc) == 0 && Marshal.GetLastPInvokeError() != Kernel32.ERROR_CLASS_ALREADY_EXISTS)
                    throw new InvalidOperationException("RegisterClassExW failed: " + Marshal.GetLastPInvokeError());
            }
            _classRegistered = true;
        }
    }

    [UnmanagedCallersOnly]
    private static nint WndProc(nint hwnd, uint msg, nint wp, nint lp)
    {
        try
        {
            if (ByWindow.TryGetValue(hwnd, out var self) && self.Handle(msg, wp, lp) is { } handled) return handled;
        }
        catch { /* never let an exception cross into user32 */ }
        return User32.DefWindowProcW(hwnd, msg, wp, lp);
    }

    /// <summary>Returns a result when the message is fully handled, null to fall through to DefWindowProc.</summary>
    private nint? Handle(uint msg, nint wp, nint lp)
    {
        switch (msg)
        {
            case InvokeMessage:
                Interlocked.Exchange(ref _invokePosted, 0);
                while (_work.TryDequeue(out var item))
                {
                    if (_stopped) { item.Cancel(); continue; }
                    item.Run();
                }
                return 0;
            case StopMessage:
                _stopped = true;
                // PostQuitMessage equivalent for this thread; the loop exits and Cleanup runs.
                User32.PostThreadMessageW(NativeThreadId, User32.WM_QUIT, 0, 0);
                return 0;
            case User32.WM_HOTKEY:
                if (_hotkeys.TryGetValue((int)wp, out var onHotkey)) onHotkey();
                return 0;
            case User32.WM_DISPLAYCHANGE: Raise(new ShellBroadcast(ShellBroadcastKind.DisplayChange, msg, wp, lp)); return null;
            case User32.WM_SETTINGCHANGE:
                Raise(new ShellBroadcast(ShellBroadcastKind.SettingChange, msg, wp, lp, lp != 0 ? ReadString((char*)lp, 256) : null));
                return null;
            case User32.WM_POWERBROADCAST:
                // PBT_POWERSETTINGCHANGE: lParam → POWERBROADCAST_SETTING { GUID PowerSetting; DWORD DataLength; UCHAR Data[] }.
                Raise(new ShellBroadcast(ShellBroadcastKind.PowerBroadcast, msg, wp, lp, null,
                    wp == 0x8013 && lp != 0 ? Copy((byte*)lp, 20 + (int)Math.Min(*(uint*)((byte*)lp + 16), 4096u)) : null));
                return null;
            case User32.WM_DEVICECHANGE:
                Raise(new ShellBroadcast(ShellBroadcastKind.DeviceChange, msg, wp, lp, null,
                    lp != 0 && (wp == 0x8000 || wp == 0x8004 || wp == 0x8006) ? Copy((byte*)lp, (int)Math.Clamp(*(uint*)lp, 12u, 4096u)) : null));
                return null;
            case User32.WM_CLIPBOARDUPDATE: Raise(new ShellBroadcast(ShellBroadcastKind.ClipboardUpdate, msg, wp, lp)); return 0;
            case User32.WM_THEMECHANGED: Raise(new ShellBroadcast(ShellBroadcastKind.ThemeChanged, msg, wp, lp)); return null;
            case User32.WM_SYSCOLORCHANGE: Raise(new ShellBroadcast(ShellBroadcastKind.SysColorChange, msg, wp, lp)); return null;
            case User32.WM_WTSSESSION_CHANGE: Raise(new ShellBroadcast(ShellBroadcastKind.SessionChange, msg, wp, lp)); return null;
            case User32.WM_CLOSE:
                return 0; // never closed from outside; Dispose stops the thread
        }
        return null;
    }

    private void Raise(ShellBroadcast b)
    {
        if (Broadcast is null) return;
        _events.Post(() => Broadcast?.Invoke(b));
    }

    private static string ReadString(char* p, int max)
    {
        var n = 0;
        while (n < max && p[n] != '\0') n++;
        return new string(p, 0, n);
    }

    private static byte[] Copy(byte* p, int length) => new ReadOnlySpan<byte>(p, length).ToArray();

    public void Dispose()
    {
        if (_stopped) return;
        if (_hwnd != 0 && User32.PostMessageW(_hwnd, StopMessage, 0, 0) != 0)
        {
            if (!_thread.Join(TimeSpan.FromSeconds(2))) _log.Warn("The desktop shell thread did not stop within 2 s.");
        }
        _stopped = true;
        DrainCancelled();
        _events.Dispose();
    }

    private readonly record struct WorkItem(Action Run, Action Cancel);
}
