namespace PrismControl.Desktop;

/// <summary>What <see cref="IForegroundService.BringToFrontAsync"/> did.</summary>
public enum ForegroundResult
{
    /// <summary>The window is now the foreground window.</summary>
    Focused,
    /// <summary>It already was (and was not minimized). Nothing was changed.</summary>
    AlreadyFocused,
    /// <summary>It was minimized; it was restored and is now the foreground window.</summary>
    Restored,
    /// <summary>Windows refused every rung of the ladder (the taskbar button probably flashes instead).</summary>
    Refused,
    /// <summary>The handle is 0 or the window no longer exists.</summary>
    NoWindow,
    /// <summary>Refused, and an elevated window was involved (the target, or the current foreground window that swallows our input under UIPI). Show "admin app".</summary>
    Elevated,
    /// <summary>Safe mode: nothing was changed (logged only).</summary>
    SafeMode,
}

/// <summary>Which rung of the foreground ladder made it work (research/windows.md §1d; the lock timeout is infinite on this PC).</summary>
public enum ForegroundRung
{
    /// <summary>No rung succeeded, or none was tried (no window, safe mode, already focused).</summary>
    None,
    /// <summary>The F22 hotkey trick (Chromium's ui::ForegroundHelper) gave us the right, then SetForegroundWindow.</summary>
    HotkeyTrick,
    /// <summary>Plain SetForegroundWindow (the trick was skipped or timed out, but Windows allowed it).</summary>
    SetForegroundWindow,
    /// <summary>SwitchToThisWindow, the last resort.</summary>
    SwitchToThisWindow,
}

/// <summary>The detailed outcome of a foreground attempt (for logs and diagnostics).</summary>
public sealed record ForegroundOutcome(ForegroundResult Result, ForegroundRung Rung, nint Window, TimeSpan Elapsed)
{
    public bool Succeeded => Result.Succeeded();
}

public static class ForegroundResultExtensions
{
    /// <summary>True for <see cref="ForegroundResult.Focused"/>, <see cref="ForegroundResult.AlreadyFocused"/> and <see cref="ForegroundResult.Restored"/>.</summary>
    public static bool Succeeded(this ForegroundResult r) => r is ForegroundResult.Focused or ForegroundResult.AlreadyFocused or ForegroundResult.Restored;
}

/// <summary>
/// Foreground control for a background process (the plugin is never the foreground app: deck presses arrive over HID).
/// Real: <see cref="ForegroundService"/>. Safe mode: <see cref="SafeModeForegroundService"/> (logs, returns
/// <see cref="ForegroundResult.SafeMode"/>, changes nothing; reads stay real).
/// </summary>
public interface IForegroundService
{
    /// <summary>
    /// Brings <paramref name="hwnd"/> (or its top-level window) to the foreground: restore if minimized, then the ladder
    /// F22 hotkey trick → SetForegroundWindow → SwitchToThisWindow, each verified with GetForegroundWindow.
    /// Never throws for OS failures; cancellation throws <see cref="OperationCanceledException"/>.
    /// </summary>
    Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default);

    /// <summary>
    /// Lets another process (e.g. chrome.exe) take the foreground itself: our process gains the right with the hotkey
    /// trick, then calls AllowSetForegroundWindow(pid). The grant lasts until the user's next input. False when refused.
    /// </summary>
    Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default);

    /// <summary>The current foreground window (0 when none: lock screen, UAC, focus in transition).</summary>
    nint GetForeground();

    /// <summary>
    /// The most recent foreground window that is not owned by the Stream Deck app, by this process, or by a transient shell
    /// surface (taskbar, task switcher), and that still exists. 0 if none was seen yet. Tracked with
    /// SetWinEventHook(EVENT_SYSTEM_FOREGROUND) on the shell thread.
    /// </summary>
    nint LastExternalForeground { get; }

    /// <summary>Same as <see cref="BringToFrontAsync"/>, plus which rung worked and how long it took.</summary>
    async Task<ForegroundOutcome> BringToFrontDetailedAsync(nint hwnd, CancellationToken ct = default) =>
        new(await BringToFrontAsync(hwnd, ct).ConfigureAwait(false), ForegroundRung.None, hwnd, TimeSpan.Zero);
}
