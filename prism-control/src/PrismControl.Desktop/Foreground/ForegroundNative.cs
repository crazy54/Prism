using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

internal enum HotkeyTrickResult
{
    /// <summary>WM_HOTKEY arrived: our process received the last input event, and the callback ran inside the handler.</summary>
    Fired,
    /// <summary>The key was sent but no WM_HOTKEY arrived in time (UIPI, a secure desktop, a busy input queue).</summary>
    TimedOut,
    /// <summary>The trick could not start: SendInput failed, the key is not F13–F24, or RegisterHotKey failed for a reason other than "taken".</summary>
    Unavailable,
    /// <summary>Another app registered the trick key as a global hotkey (ERROR_HOTKEY_ALREADY_REGISTERED): it is never sent.</summary>
    KeyInUse,
}

/// <summary>
/// The OS operations the foreground ladder uses. Reads are synchronous; writes are async because the real
/// implementation runs them on the shell thread. Tests use a scripted fake: no window is ever focused for real.
/// </summary>
internal interface IForegroundNative
{
    bool IsWindow(nint hwnd);
    nint RootOf(nint hwnd);
    nint RootOwnerOf(nint hwnd);
    bool IsMinimized(nint hwnd);
    nint GetForeground();
    /// <summary>True when the window's process runs above our integrity level (UIPI applies).</summary>
    bool IsAboveUs(nint hwnd);
    /// <summary>True when the window belongs to this process.</summary>
    bool IsOurs(nint hwnd);

    Task RestoreAsync(nint hwnd);
    Task<bool> SetForegroundAsync(nint hwnd);
    Task SwitchToAsync(nint hwnd);
    Task<bool> AllowSetForegroundAsync(uint pid);
    /// <summary>
    /// Registers <paramref name="virtualKey"/> (F13–F24, no modifiers) as a hotkey, sends it, and runs
    /// <paramref name="onRights"/> inside WM_HOTKEY (on the shell thread). Never sends the key when another app owns it.
    /// </summary>
    Task<HotkeyTrickResult> HotkeyTrickAsync(uint virtualKey, Action onRights, TimeSpan timeout, CancellationToken ct);
    /// <summary>The synchronous SetForegroundWindow / AllowSetForegroundWindow used inside the hotkey handler.</summary>
    bool SetForegroundNow(nint hwnd);
    void RestoreNow(nint hwnd);
    bool AllowSetForegroundNow(uint pid);

    Task DelayAsync(TimeSpan delay, CancellationToken ct);
}

/// <summary>The real implementation. Every write refuses in safe mode as a last line of defense (it should never be reached then).</summary>
internal sealed class Win32ForegroundNative(ShellThread shell) : IForegroundNative
{
    /// <summary>The hotkey id Chromium's ForegroundHelper uses.</summary>
    internal const int HotkeyId = 0xBABA;
    /// <summary>dwExtraInfo on every event this library injects ("PRDK"), so our own input is recognizable.</summary>
    internal const nint ExtraInfoMarker = 0x5052444B;

    public bool IsWindow(nint hwnd) => hwnd != 0 && User32.IsWindow(hwnd) != 0;
    public nint RootOf(nint hwnd) { var r = User32.GetAncestor(hwnd, User32.GA_ROOT); return r != 0 ? r : hwnd; }
    public nint RootOwnerOf(nint hwnd) { var r = User32.GetAncestor(hwnd, User32.GA_ROOTOWNER); return r != 0 ? r : hwnd; }
    public bool IsMinimized(nint hwnd) => User32.IsIconic(hwnd) != 0;
    public nint GetForeground() => User32.GetForegroundWindow();

    public bool IsAboveUs(nint hwnd)
    {
        User32.GetWindowThreadProcessId(hwnd, out var pid);
        return ProcessInfo.IsAboveUs(pid);
    }

    public bool IsOurs(nint hwnd)
    {
        if (hwnd == 0) return false;
        User32.GetWindowThreadProcessId(hwnd, out var pid);
        return pid == (uint)Environment.ProcessId;
    }

    private static bool Blocked => SafeModeEnvironment.FromEnvironment();

    public Task RestoreAsync(nint hwnd) => shell.InvokeAsync(() => RestoreNow(hwnd));
    public Task<bool> SetForegroundAsync(nint hwnd) => shell.InvokeAsync(() => SetForegroundNow(hwnd));
    public Task SwitchToAsync(nint hwnd) => shell.InvokeAsync(() => { if (!Blocked) User32.SwitchToThisWindow(hwnd, 1); });
    public Task<bool> AllowSetForegroundAsync(uint pid) => shell.InvokeAsync(() => AllowSetForegroundNow(pid));

    public void RestoreNow(nint hwnd)
    {
        // Async: ShowWindow on a hung app's window would block the shell thread.
        if (!Blocked && User32.IsIconic(hwnd) != 0) User32.ShowWindowAsync(hwnd, User32.SW_RESTORE);
    }

    public bool SetForegroundNow(nint hwnd) => !Blocked && User32.SetForegroundWindow(hwnd) != 0;
    public bool AllowSetForegroundNow(uint pid) => !Blocked && User32.AllowSetForegroundWindow(pid) != 0;

    public async Task<HotkeyTrickResult> HotkeyTrickAsync(uint virtualKey, Action onRights, TimeSpan timeout, CancellationToken ct)
    {
        if (Blocked || !FunctionKeys.IsF13ToF24((VirtualKey)virtualKey)) return HotkeyTrickResult.Unavailable;
        var fired = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = await shell.InvokeAsync(() =>
        {
            void Handler()
            {
                shell.UnregisterHotkey(HotkeyId);
                try { onRights(); }
                finally { fired.TrySetResult(); }
            }

            // If another app owns the key (no modifiers), we must not send it: it would trigger their hotkey.
            if (!shell.TryRegisterHotkey(HotkeyId, 0, virtualKey, Handler, out var error))
                return error == Kernel32.ERROR_HOTKEY_ALREADY_REGISTERED ? HotkeyTrickResult.KeyInUse : HotkeyTrickResult.Unavailable;
            if (SendKey(virtualKey) != 2)
            {
                shell.UnregisterHotkey(HotkeyId);
                return HotkeyTrickResult.Unavailable;
            }
            return HotkeyTrickResult.Fired;   // here: "sent"; Fired is reported only once WM_HOTKEY arrived
        }, ct).ConfigureAwait(false);
        if (started != HotkeyTrickResult.Fired) return started;

        using var timer = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var done = await Task.WhenAny(fired.Task, Task.Delay(timeout, timer.Token)).ConfigureAwait(false);
        timer.Cancel();
        if (done != fired.Task)
        {
            // Too late: drop the registration so a late WM_HOTKEY does nothing.
            try { await shell.InvokeAsync(() => shell.UnregisterHotkey(HotkeyId), CancellationToken.None).ConfigureAwait(false); }
            catch (ObjectDisposedException) { }
            ct.ThrowIfCancellationRequested();
        }
        return fired.Task.IsCompleted ? HotkeyTrickResult.Fired : HotkeyTrickResult.TimedOut;
    }

    private static unsafe uint SendKey(uint vk)
    {
        var scan = (ushort)User32.MapVirtualKeyW(vk, User32.MAPVK_VK_TO_VSC_EX);
        var inputs = stackalloc INPUT[2];
        inputs[0] = new INPUT { type = User32.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = (ushort)vk, wScan = scan, dwExtraInfo = ExtraInfoMarker } } };
        inputs[1] = new INPUT { type = User32.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = (ushort)vk, wScan = scan, dwFlags = User32.KEYEVENTF_KEYUP, dwExtraInfo = ExtraInfoMarker } } };
        return User32.SendInput(2, inputs, sizeof(INPUT));
    }

    public Task DelayAsync(TimeSpan delay, CancellationToken ct) => Task.Delay(delay, ct);
}
