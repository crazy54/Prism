using PrismControl.Core.Hosting;

namespace PrismControl.Desktop;

/// <summary>
/// The real foreground service. A Stream Deck press is not a Windows input event, so neither the app, nor Prism Control,
/// nor the target holds the foreground right, and on this PC SPI_GETFOREGROUNDLOCKTIMEOUT is effectively infinite
/// (research/windows-probe-results.md §4). The ladder, each rung verified with GetForegroundWindow:
/// <list type="number">
/// <item><b>Hotkey trick</b> (Chromium's ui::ForegroundHelper): register the trick key (F22 by default, F13–F24
/// configurable: <see cref="HotkeyTrickKey"/>) on the shell window, SendInput it, and inside WM_HOTKEY (our process now
/// "received the last input event") restore + SetForegroundWindow. Skipped when the current foreground window is
/// elevated (UIPI drops our key) or already ours, when another app owns the key (we never send it then: it would fire
/// their hotkey), or when the trick is turned off (<see cref="HotkeyTrickEnabled"/>).</item>
/// <item><b>SetForegroundWindow</b> on its own.</item>
/// <item><b>SwitchToThisWindow</b>, the last resort.</item>
/// </list>
/// Attempts are serialized. Never throws for OS failures.
/// </summary>
public sealed class ForegroundService : IForegroundService, IHotkeyTrickSettings
{
    /// <summary>How long the hotkey trick waits for WM_HOTKEY (research/browser.md §3.1: ≤ 200 ms).</summary>
    public static readonly TimeSpan HotkeyTimeout = TimeSpan.FromMilliseconds(200);
    private static readonly TimeSpan VerifyStep = TimeSpan.FromMilliseconds(15);

    private readonly IForegroundNative _native;
    private readonly Func<nint> _lastExternal;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly HashSet<VirtualKey> _inUseLogged = [];
    private volatile bool _trickEnabled = true;
    private int _trickKey = (int)VirtualKey.F22;
    private int _lastTrick = (int)HotkeyTrickStatus.NotTried;

    public ForegroundService(ShellThread shell, ForegroundTracker tracker, ILog? log = null)
        : this(new Win32ForegroundNative(shell), () => tracker.LastExternal, log ?? NullLog.Instance, TimeProvider.System)
    {
    }

    internal ForegroundService(IForegroundNative native, Func<nint> lastExternal, ILog log, TimeProvider time)
    {
        _native = native;
        _lastExternal = lastExternal;
        _log = log.For("foreground");
        _time = time;
    }

    // ------------------------------------------------------------------ the trick's switches (IHotkeyTrickSettings)

    /// <summary>False: the hotkey trick is never used (no key is pressed); SetForegroundWindow and SwitchToThisWindow still run.</summary>
    public bool HotkeyTrickEnabled
    {
        get => _trickEnabled;
        set
        {
            if (_trickEnabled == value) return;
            _trickEnabled = value;
            _log.Info(value
                ? $"Focus trick on ({FunctionKeys.Name(HotkeyTrickKey)})."
                : "Focus trick off: no key is pressed to bring windows to the front (Windows may flash the taskbar button instead).");
        }
    }

    /// <summary>The trick key: F13–F24 only (default F22).</summary>
    public VirtualKey HotkeyTrickKey
    {
        get => (VirtualKey)Volatile.Read(ref _trickKey);
        set
        {
            if (!FunctionKeys.IsF13ToF24(value)) throw new ArgumentOutOfRangeException(nameof(value), value, "The focus trick key must be F13–F24.");
            if (Interlocked.Exchange(ref _trickKey, (int)value) != (int)value) _log.Info($"Focus trick key: {FunctionKeys.Name(value)}.");
        }
    }

    public HotkeyTrickStatus LastTrick => (HotkeyTrickStatus)Volatile.Read(ref _lastTrick);

    private void Note(HotkeyTrickStatus s) => Volatile.Write(ref _lastTrick, (int)s);

    /// <summary>Runs the trick if it is on and records (and, for a taken key, logs) the outcome. Null = disabled, not tried.</summary>
    private async Task<HotkeyTrickResult?> TrickAsync(Action onRights, CancellationToken ct)
    {
        if (!_trickEnabled) { Note(HotkeyTrickStatus.Disabled); return null; }
        var key = HotkeyTrickKey;
        var r = await _native.HotkeyTrickAsync((uint)key, onRights, HotkeyTimeout, ct).ConfigureAwait(false);
        Note(r switch
        {
            HotkeyTrickResult.Fired => HotkeyTrickStatus.Fired,
            HotkeyTrickResult.TimedOut => HotkeyTrickStatus.TimedOut,
            HotkeyTrickResult.KeyInUse => HotkeyTrickStatus.KeyInUse,
            _ => HotkeyTrickStatus.Failed,
        });
        if (r == HotkeyTrickResult.KeyInUse)
        {
            bool first;
            lock (_inUseLogged) first = _inUseLogged.Add(key);
            var line = $"The focus trick key {FunctionKeys.Name(key)} is registered by another app: it is never sent, and bring-to-front falls back to SetForegroundWindow (pick another key or turn the trick off in settings).";
            if (first) _log.Info(line); else _log.Debug(line);
        }
        return r;
    }

    // ------------------------------------------------------------------ IForegroundService

    public nint GetForeground() => _native.GetForeground();

    public nint LastExternalForeground => _lastExternal();

    public async Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) =>
        (await BringToFrontDetailedAsync(hwnd, ct).ConfigureAwait(false)).Result;

    public async Task<ForegroundOutcome> BringToFrontDetailedAsync(nint hwnd, CancellationToken ct = default)
    {
        var start = _time.GetTimestamp();
        if (hwnd == 0 || !_native.IsWindow(hwnd)) return new(ForegroundResult.NoWindow, ForegroundRung.None, hwnd, TimeSpan.Zero);
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var target = _native.RootOf(hwnd);
            var outcome = await LadderAsync(target, ct).ConfigureAwait(false);
            outcome = outcome with { Elapsed = _time.GetElapsedTime(start) };
            _log.Debug($"bring 0x{target:X} to front: {outcome.Result} via {outcome.Rung} in {outcome.Elapsed.TotalMilliseconds:F0} ms");
            return outcome;
        }
        finally { _gate.Release(); }
    }

    private async Task<ForegroundOutcome> LadderAsync(nint target, CancellationToken ct)
    {
        var wasMinimized = _native.IsMinimized(target);
        var foreground = _native.GetForeground();
        if (!wasMinimized && IsTarget(foreground, target)) return new(ForegroundResult.AlreadyFocused, ForegroundRung.None, target, TimeSpan.Zero);

        var success = wasMinimized ? ForegroundResult.Restored : ForegroundResult.Focused;
        var foregroundElevated = foreground != 0 && _native.IsAboveUs(foreground);

        // Rung 1: the hotkey trick. Restore + SetForegroundWindow run inside WM_HOTKEY, while we hold the right.
        if (!foregroundElevated && !_native.IsOurs(foreground))
        {
            var trick = await TrickAsync(() =>
            {
                if (wasMinimized) _native.RestoreNow(target);
                _native.SetForegroundNow(target);
            }, ct).ConfigureAwait(false);
            if (trick == HotkeyTrickResult.Fired && await VerifyAsync(target, wasMinimized, 6, ct).ConfigureAwait(false))
                return new(success, ForegroundRung.HotkeyTrick, target, TimeSpan.Zero);
            if (trick is { } t) _log.Debug($"hotkey trick: {t}");
        }
        else Note(HotkeyTrickStatus.Skipped);

        // Rung 2: plain SetForegroundWindow (works when the lock is open, or the right from rung 1 arrived late).
        if (wasMinimized) await _native.RestoreAsync(target).ConfigureAwait(false);
        ct.ThrowIfCancellationRequested();
        if (await _native.SetForegroundAsync(target).ConfigureAwait(false) && await VerifyAsync(target, wasMinimized, 4, ct).ConfigureAwait(false))
            return new(success, ForegroundRung.SetForegroundWindow, target, TimeSpan.Zero);

        // Rung 3: SwitchToThisWindow.
        ct.ThrowIfCancellationRequested();
        await _native.SwitchToAsync(target).ConfigureAwait(false);
        if (await VerifyAsync(target, wasMinimized, 10, ct).ConfigureAwait(false))
            return new(success, ForegroundRung.SwitchToThisWindow, target, TimeSpan.Zero);

        var elevated = foregroundElevated || _native.IsAboveUs(target);
        return new(elevated ? ForegroundResult.Elevated : ForegroundResult.Refused, ForegroundRung.None, target, TimeSpan.Zero);
    }

    /// <summary>The target, or one of its owned windows (an active dialog), is in front and, if it was minimized, restored.</summary>
    private async Task<bool> VerifyAsync(nint target, bool mustRestore, int attempts, CancellationToken ct)
    {
        for (var i = 0; ; i++)
        {
            if (IsTarget(_native.GetForeground(), target) && (!mustRestore || !_native.IsMinimized(target))) return true;
            if (i + 1 >= attempts) return false;
            await _native.DelayAsync(VerifyStep, ct).ConfigureAwait(false);
        }
    }

    private bool IsTarget(nint foreground, nint target) =>
        foreground != 0 && (foreground == target || _native.RootOf(foreground) == target || _native.RootOwnerOf(foreground) == target);

    public async Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default)
    {
        if (pid <= 0) return false;
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var foreground = _native.GetForeground();
            if (_native.IsOurs(foreground))
            {
                Note(HotkeyTrickStatus.Skipped);
                return await _native.AllowSetForegroundAsync((uint)pid).ConfigureAwait(false);
            }
            var granted = false;
            if (foreground == 0 || !_native.IsAboveUs(foreground))
            {
                var trick = await TrickAsync(() => granted = _native.AllowSetForegroundNow((uint)pid), ct).ConfigureAwait(false);
                if (trick == HotkeyTrickResult.Fired && granted) return true;
                if (trick is { } t) _log.Debug($"grant foreground: hotkey trick {t}");
            }
            else Note(HotkeyTrickStatus.Skipped);
            // The lock may be open after all (or the right arrived late). With the trick off this is the only step: the
            // target's own focus call then succeeds or Windows flashes its taskbar button.
            granted = await _native.AllowSetForegroundAsync((uint)pid).ConfigureAwait(false);
            if (!granted) _log.Debug("grant foreground: AllowSetForegroundWindow refused");
            return granted;
        }
        finally { _gate.Release(); }
    }
}

/// <summary>
/// Safe mode: logs one line per call and returns <see cref="ForegroundResult.SafeMode"/> (grants return false). Nothing
/// is focused, restored, or sent. Reads (the foreground window, the last external one) stay real. The trick switches are
/// kept (so settings round-trip) but no key is ever pressed.
/// </summary>
public sealed class SafeModeForegroundService(ILog log, Func<nint>? foreground = null, Func<nint>? lastExternal = null) : IForegroundService, IHotkeyTrickSettings
{
    private readonly ILog _log = log.For("foreground");
    private readonly Func<nint> _foreground = foreground ?? (() => Interop.User32.GetForegroundWindow());
    private readonly Func<nint> _lastExternal = lastExternal ?? (() => 0);
    private int _calls;
    private int _trickKey = (int)VirtualKey.F22;

    /// <summary>How many writes were requested (and not performed).</summary>
    public int RequestedWrites => Volatile.Read(ref _calls);

    public SafeModeForegroundService(ForegroundTracker tracker, ILog log) : this(log, null, () => tracker.LastExternal) { }

    public bool HotkeyTrickEnabled { get; set; } = true;

    public VirtualKey HotkeyTrickKey
    {
        get => (VirtualKey)Volatile.Read(ref _trickKey);
        set
        {
            if (!FunctionKeys.IsF13ToF24(value)) throw new ArgumentOutOfRangeException(nameof(value), value, "The focus trick key must be F13–F24.");
            Volatile.Write(ref _trickKey, (int)value);
        }
    }

    /// <summary>Always <see cref="HotkeyTrickStatus.NotTried"/>: safe mode never presses a key.</summary>
    public HotkeyTrickStatus LastTrick => HotkeyTrickStatus.NotTried;

    public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Interlocked.Increment(ref _calls);
        _log.Info($"[safe mode] would bring window 0x{hwnd:X} to the front");
        return Task.FromResult(ForegroundResult.SafeMode);
    }

    public async Task<ForegroundOutcome> BringToFrontDetailedAsync(nint hwnd, CancellationToken ct = default) =>
        new(await BringToFrontAsync(hwnd, ct).ConfigureAwait(false), ForegroundRung.None, hwnd, TimeSpan.Zero);

    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Interlocked.Increment(ref _calls);
        _log.Info($"[safe mode] would allow process {pid} to take the foreground");
        return Task.FromResult(false);
    }

    public nint GetForeground() => _foreground();

    public nint LastExternalForeground => _lastExternal();
}
