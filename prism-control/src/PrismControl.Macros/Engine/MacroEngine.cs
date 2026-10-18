using System.Diagnostics;
using System.Globalization;
using PrismControl.Core.Hosting;

namespace PrismControl.Macros.Engine;

/// <summary>A step failed for a reason the user should see (shown in the property inspector, logged, alert on the key).</summary>
public class MacroStepException(string message) : Exception(message);

/// <summary>The foreground app would silently drop our input (UIPI), or nothing has focus.</summary>
public sealed class InputBlockedException(ForegroundInfo foreground) : MacroStepException(foreground.Describe())
{
    public ForegroundInfo Foreground { get; } = foreground;
}

/// <summary>A launch step that is not trusted on this PC reached execution (the engine checks before a run; this is the backstop).</summary>
public sealed class LaunchNotTrustedException(LaunchSpec spec)
    : MacroStepException($"{spec.DisplayName} isn't trusted on this PC yet: review it in the key's settings.");

public enum MacroRunStatus
{
    Completed,
    /// <summary>Stopped by cancellation (the key went away, the plugin is shutting down).</summary>
    Cancelled,
    /// <summary>Not sent: the app in front runs as administrator (or nothing has focus). Nothing was typed into it.</summary>
    Blocked,
    Failed,
    /// <summary>The macro has problems (unknown step, bad chord...), so nothing ran.</summary>
    Invalid,
    /// <summary>No steps: nothing to do.</summary>
    Empty,
    /// <summary>The same macro is already running (presses while it runs are ignored, not queued).</summary>
    Busy,
    /// <summary>A launch step is not trusted on this PC (an imported profile, or its target changed), so nothing ran.</summary>
    NeedsReview,
    /// <summary>A trusted launch that always asks first (a shell, a script, a network path) needs a confirming second press. Nothing ran.</summary>
    NeedsConfirmation,
}

public sealed record MacroRunResult(MacroRunStatus Status, int StepsCompleted, int StepCount, int? FailedStep = null, string? Message = null, ForegroundInfo? Foreground = null)
{
    public bool Succeeded => Status == MacroRunStatus.Completed;

    /// <summary>One line for the property inspector.</summary>
    public string Describe() => Status switch
    {
        MacroRunStatus.Completed => StepCount == 1 ? "Done." : string.Create(CultureInfo.InvariantCulture, $"Done: {StepCount} steps."),
        MacroRunStatus.Cancelled => string.Create(CultureInfo.InvariantCulture, $"Stopped after {StepsCompleted} of {StepCount} steps."),
        MacroRunStatus.Blocked => "Not sent. " + Message,
        MacroRunStatus.Failed => string.Create(CultureInfo.InvariantCulture, $"Step {FailedStep + 1} failed: {Message}"),
        MacroRunStatus.Invalid => "Not run: " + Message,
        MacroRunStatus.Empty => "Nothing to run yet: set it up in the editor.",
        MacroRunStatus.Busy => "Still running; that press was ignored.",
        MacroRunStatus.NeedsReview => "Not run: " + Message,
        MacroRunStatus.NeedsConfirmation => "Not run yet: " + Message,
        _ => Status.ToString(),
    };
}

public readonly record struct MacroProgress(int StepIndex, int StepCount, string Summary);

public sealed class MacroRunOptions
{
    /// <summary>Delays use this clock (the action's, so tests can drive it).</summary>
    public TimeProvider Time { get; init; } = TimeProvider.System;
    /// <summary>Called before each step, on the engine's task (Post back to the mailbox before touching action state).</summary>
    public Action<MacroProgress>? Progress { get; init; }
    /// <summary>For the log: which action ran the macro.</summary>
    public string? Source { get; init; }
    /// <summary>The action that started the run is in safe mode: this run uses the dry-run effects, whatever the engine was built with.</summary>
    public bool SafeMode { get; init; }
    /// <summary>The user confirmed with a second press: launches that always ask first (<see cref="LaunchTrust.ConfirmReason"/>) may run.</summary>
    public bool Confirmed { get; init; }
}

/// <summary>
/// What a running step can use. Input goes through <see cref="SendAsync"/>, which checks the foreground window first and
/// tracks every key that went down, so <see cref="ReleaseHeld"/> can let go of exactly those keys whatever happens.
/// </summary>
public sealed class MacroContext
{
    private static readonly TimeSpan NoWindowRetry = TimeSpan.FromMilliseconds(100);
    private readonly MacroEngine _engine;
    private readonly bool _confirmed;
    // Keys we pressed and have not released yet, in the order they went down.
    private readonly List<KeyInput> _down = [];

    internal MacroContext(MacroEngine engine, TimeProvider time, CancellationToken cancellation, bool dryRun = false, bool confirmed = false)
    {
        _engine = engine;
        Time = time;
        Cancellation = cancellation;
        IsDryRun = dryRun;
        _confirmed = confirmed;
    }

    public TimeProvider Time { get; }
    public CancellationToken Cancellation { get; }
    /// <summary>True when this run sends nothing and starts nothing (safe mode or the dry-run switch).</summary>
    public bool IsDryRun { get; }
    public IScanCodeMap ScanCodes => _engine.ScanCodes;
    /// <summary>The launcher for this run: the dry-run one in safe mode.</summary>
    public IAppLauncher Launcher => IsDryRun ? _engine.Dry.Launcher : _engine.Launcher;
    public ILog Log => _engine.Log;

    private IInputSink Input => IsDryRun ? _engine.Dry.Input : _engine.Input;

    /// <summary>
    /// Sends one batch in one SendInput call, after checking that the foreground app can receive it (UIPI: input into an
    /// elevated window is dropped without any error, so we refuse and say why instead). When Windows takes only part of the
    /// batch, or the sink throws, the keys that went down are released at once (reverse order) and the step fails.
    /// </summary>
    public async Task SendAsync(KeyInput[] batch)
    {
        Cancellation.ThrowIfCancellationRequested();
        // The plugin-wide gate covers the foreground check and the send together, so no other module's input can land
        // between them. A dry run sends nothing and needs no gate.
        var gate = IsDryRun ? null : _engine.InputGate?.Invoke();
        await using var held = gate is null ? null : await gate.AcquireAsync("macros", Cancellation).ConfigureAwait(false);
        await EnsureInputAllowedAsync().ConfigureAwait(false);
        int sent;
        try { sent = Input.Send(batch); }
        catch
        {
            // We cannot tell how much went out: every key this batch presses may be down now.
            foreach (var k in batch)
                if (!k.IsUp) MarkDown(k);
            ReleaseHeld();
            throw;
        }
        sent = Math.Clamp(sent, 0, batch.Length);
        Track(batch.AsSpan(0, sent));
        if (sent < batch.Length)
        {
            ReleaseHeld();
            throw new MacroStepException(string.Create(CultureInfo.InvariantCulture,
                $"Windows accepted {sent} of {batch.Length} key events (another program may be blocking input)."));
        }
    }

    /// <summary>
    /// Releases exactly the keys that went down and are still down, in reverse order. Runs even when the macro is being
    /// cancelled (no foreground check). A partial release is retried once. Never throws.
    /// </summary>
    public void ReleaseHeld()
    {
        if (_down.Count == 0) return;
        var ups = new KeyInput[_down.Count];
        for (var i = 0; i < ups.Length; i++)
        {
            var k = _down[_down.Count - 1 - i];
            ups[i] = k with { Flags = k.Flags | KeyFlags.KeyUp };
        }
        _down.Clear();
        var remaining = ups;
        for (var attempt = 0; attempt < 2 && remaining.Length > 0; attempt++)
        {
            int sent;
            try { sent = Math.Clamp(Input.Send(remaining), 0, remaining.Length); }
            catch (Exception ex)
            {
                SafeLog.Warn(Log, $"Releasing {remaining.Length} keys failed ({ex.GetType().Name}); press and release them to reset.");
                return;
            }
            remaining = remaining[sent..];
        }
        if (remaining.Length > 0)
            SafeLog.Warn(Log, string.Create(CultureInfo.InvariantCulture, $"Windows did not accept {remaining.Length} key releases; press and release those keys to reset them."));
    }

    /// <summary>Throws unless <paramref name="spec"/> is trusted on this PC (and confirmed, if it always asks first).</summary>
    public void EnsureLaunchAllowed(LaunchSpec spec)
    {
        if (!_engine.Trust.IsTrusted(spec)) throw new LaunchNotTrustedException(spec);
        if (!_confirmed && LaunchTrust.ConfirmReason(spec) is { } why)
            throw new MacroStepException($"{spec.DisplayName} always asks first ({why}): press again to run it.");
    }

    public Task DelayAsync(TimeSpan delay) => delay <= TimeSpan.Zero ? Task.CompletedTask : Task.Delay(delay, Time, Cancellation);

    private void Track(ReadOnlySpan<KeyInput> accepted)
    {
        foreach (var k in accepted)
        {
            if (!k.IsUp) MarkDown(k);
            else if (IndexOfDown(k) is var i and >= 0) _down.RemoveAt(i);
        }
    }

    private void MarkDown(KeyInput k)
    {
        if (IndexOfDown(k) < 0) _down.Add(k with { Flags = k.Flags & ~KeyFlags.KeyUp });
    }

    private int IndexOfDown(KeyInput k)
    {
        var flags = k.Flags & ~KeyFlags.KeyUp;
        for (var i = _down.Count - 1; i >= 0; i--)
            if (_down[i].Vk == k.Vk && _down[i].Scan == k.Scan && _down[i].Flags == flags) return i;
        return -1;
    }

    private async Task EnsureInputAllowedAsync()
    {
        var f = _engine.Foreground.Inspect();
        if (f.Verdict == ForegroundVerdict.NoWindow)
        {
            // Focus can be in flight for a moment (an app just opened); look once more before giving up.
            await DelayAsync(NoWindowRetry).ConfigureAwait(false);
            f = _engine.Foreground.Inspect();
        }
        if (f.Verdict != ForegroundVerdict.Allowed) throw new InputBlockedException(f);
    }
}

/// <summary>
/// Runs macros. One shared instance (a service registered by <see cref="MacrosModule"/>); per-key overlap rules live in
/// <see cref="MacroRunner"/>. All dependencies are interfaces, so tests run it with a recording sink and a fake launcher.
/// <para>
/// Safety: built with <c>dryRun</c> (safe mode or the dry-run switch) it never uses the real sink or launcher; a run whose
/// options say <see cref="MacroRunOptions.SafeMode"/> uses <see cref="Dry"/> too. Launch steps run only when trusted on
/// this PC (<see cref="Trust"/>; none without one), and those that always ask first only in a confirmed run.
/// </para>
/// </summary>
public sealed class MacroEngine : IAsyncDisposable
{
    private readonly CancellationTokenSource _shutdown = new();
    private readonly CancellationTokenRegistration _hostShutdown;

    /// <param name="input">The real sink (ignored, and may be null, with <paramref name="dryRun"/>).</param>
    /// <param name="launcher">The real launcher (ignored, and may be null, with <paramref name="dryRun"/>).</param>
    public MacroEngine(IInputSink? input, IForegroundInspector foreground, IAppLauncher? launcher, IScanCodeMap? scanCodes = null,
        ILog? log = null, MacroStepRegistry? registry = null, CancellationToken shutdown = default, ILaunchTrust? trust = null, bool dryRun = false)
    {
        Log = log ?? NullLog.Instance;
        Dry = new DryRunEffects(Log);
        IsDryRun = dryRun;
        Input = dryRun ? Dry.Input : input ?? throw new ArgumentNullException(nameof(input));
        Launcher = dryRun ? Dry.Launcher : launcher ?? throw new ArgumentNullException(nameof(launcher));
        Foreground = foreground;
        ScanCodes = scanCodes ?? StandardScanCodes.Instance;
        Registry = registry ?? MacroStepRegistry.Default;
        Trust = trust ?? LaunchTrust.None;
        _hostShutdown = shutdown.Register(() => _shutdown.Cancel());
    }

    public IInputSink Input { get; }
    public IForegroundInspector Foreground { get; }
    public IAppLauncher Launcher { get; }

    /// <summary>
    /// Finds the plugin-wide input gate (Core <see cref="IInputGate"/>), asked at every send because the module that
    /// provides it may initialize after Macros. Null or a null result means no gate (tests, or no provider).
    /// </summary>
    public Func<IInputGate?>? InputGate { get; set; }
    public IScanCodeMap ScanCodes { get; }
    public ILog Log { get; }
    public MacroStepRegistry Registry { get; }
    /// <summary>The launch steps trusted on this PC.</summary>
    public ILaunchTrust Trust { get; }
    /// <summary>True when the engine was built for a dry run: <see cref="Input"/> and <see cref="Launcher"/> are <see cref="Dry"/>'s.</summary>
    public bool IsDryRun { get; }
    /// <summary>The dry-run effects and their "would have" counters (used by dry-run engines and safe-mode runs).</summary>
    public DryRunEffects Dry { get; }

    /// <summary>The launch steps of <paramref name="script"/> and whether each is trusted on this PC.</summary>
    public List<LaunchCheck> CheckLaunches(MacroScript script) => LaunchTrust.Check(Trust, script);

    /// <summary>Runs every step in order. Never throws: the result says what happened.</summary>
    public async Task<MacroRunResult> RunAsync(MacroScript script, MacroRunOptions? options = null, CancellationToken cancellation = default)
    {
        options ??= new MacroRunOptions();
        try
        {
            return await RunCoreAsync(script, options, cancellation).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            if (ex is OperationCanceledException && (cancellation.IsCancellationRequested || _shutdown.IsCancellationRequested))
                return new MacroRunResult(MacroRunStatus.Cancelled, 0, script.Steps.Count);
            SafeLog.Error(Log, $"Macro from {options.Source ?? "?"} failed unexpectedly ({ex.GetType().Name}).");
            return new MacroRunResult(MacroRunStatus.Failed, 0, script.Steps.Count, null, $"Unexpected error ({ex.GetType().Name}); see the plugin log.");
        }
    }

    private async Task<MacroRunResult> RunCoreAsync(MacroScript script, MacroRunOptions options, CancellationToken cancellation)
    {
        var count = script.Steps.Count;
        var problems = script.Validate(Registry);
        if (problems.Count > 0) return Report(new MacroRunResult(MacroRunStatus.Invalid, 0, count, null, problems[0]), options);
        if (count == 0) return new MacroRunResult(MacroRunStatus.Empty, 0, 0);

        // Trust on first use: nothing of the macro runs while one of its launch steps is untrusted or unconfirmed.
        var launches = CheckLaunches(script);
        if (launches.FirstOrDefault(l => !l.Trusted) is { } untrusted)
            return Report(new MacroRunResult(MacroRunStatus.NeedsReview, 0, count, untrusted.StepIndex, string.Create(CultureInfo.InvariantCulture,
                $"step {untrusted.StepIndex + 1} starts {untrusted.Spec.DisplayName}, which isn't trusted on this PC yet. Review it in the key's settings.")), options);
        if (!options.Confirmed && launches.FirstOrDefault(l => l.NeedsConfirmation) is { } risky)
            return Report(new MacroRunResult(MacroRunStatus.NeedsConfirmation, 0, count, risky.StepIndex,
                $"{risky.Spec.DisplayName} always asks first ({risky.ConfirmReason})."), options);

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, _shutdown.Token);
        var ctx = new MacroContext(this, options.Time, linked.Token, IsDryRun || options.SafeMode, options.Confirmed);
        var sw = Stopwatch.StartNew();
        try
        {
            for (var i = 0; i < count; i++)
            {
                var step = script.Steps[i];
                try
                {
                    linked.Token.ThrowIfCancellationRequested();
                    options.Progress?.Invoke(new MacroProgress(i, count, MacroStep.SafeDescribe(step)));
                    await step.ExecuteAsync(ctx).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (linked.IsCancellationRequested)
                {
                    return Report(new MacroRunResult(MacroRunStatus.Cancelled, i, count), options);
                }
                catch (InputBlockedException ex)
                {
                    return Report(new MacroRunResult(MacroRunStatus.Blocked, i, count, i, ex.Message, ex.Foreground), options);
                }
                catch (MacroStepException ex)
                {
                    return Report(new MacroRunResult(MacroRunStatus.Failed, i, count, i, ex.Message), options);
                }
                catch (Exception ex)
                {
                    // The type and stack only: exception messages can carry paths or typed text (settings are the user's data).
                    SafeLog.Error(Log, $"Macro step {i + 1} ({step.GetType().Name}) threw {ex.GetType().Name}.{Environment.NewLine}{ex.StackTrace}");
                    return Report(new MacroRunResult(MacroRunStatus.Failed, i, count, i, $"Unexpected error ({ex.GetType().Name})."), options);
                }
            }
        }
        finally
        {
            ctx.ReleaseHeld(); // a step that pressed keys and stopped early never leaves them down
        }
        SafeLog.Debug(Log, string.Create(CultureInfo.InvariantCulture, $"Macro from {options.Source ?? "?"}: {count} steps in {sw.ElapsedMilliseconds} ms."));
        return new MacroRunResult(MacroRunStatus.Completed, count, count);
    }

    private MacroRunResult Report(MacroRunResult r, MacroRunOptions o)
    {
        // Messages never contain typed text, full paths or URL queries (only file names, schemes and hosts), so they are safe to log.
        switch (r.Status)
        {
            case MacroRunStatus.Blocked:
                var f = r.Foreground;
                SafeLog.Warn(Log, $"Macro from {o.Source ?? "?"} not sent: {r.Message} (foreground {f?.ProcessName ?? "?"}, integrity {ForegroundInfo.IntegrityName(f?.Integrity ?? -1)}, ours {ForegroundInfo.IntegrityName(f?.OwnIntegrity ?? -1)}).");
                break;
            case MacroRunStatus.Failed or MacroRunStatus.Invalid or MacroRunStatus.NeedsReview:
                SafeLog.Warn(Log, $"Macro from {o.Source ?? "?"}: {r.Describe()}");
                break;
            case MacroRunStatus.Cancelled or MacroRunStatus.NeedsConfirmation:
                SafeLog.Debug(Log, $"Macro from {o.Source ?? "?"}: {r.Describe()}");
                break;
        }
        return r;
    }

    public ValueTask DisposeAsync()
    {
        _hostShutdown.Dispose();
        _shutdown.Cancel();
        _shutdown.Dispose();
        return ValueTask.CompletedTask;
    }
}

/// <summary>
/// One action instance's macro lane. <b>Overlap rule: a macro never overlaps itself; a start while it runs is ignored
/// (not queued).</b> Queuing would replay a burst of presses (typing the same text five times) long after the user stopped,
/// and a macro is bounded (≤ 100 steps, delays ≤ 60 s), so "press again once it finished" is the predictable choice.
/// Different keys run independently; every chord is still one atomic SendInput call.
/// </summary>
public sealed class MacroRunner
{
    private readonly object _gate = new();
    private Task _current = Task.CompletedTask;
    private CancellationTokenSource? _cts;

    public bool IsRunning { get { lock (_gate) return !_current.IsCompleted; } }

    /// <summary>Starts <paramref name="body"/> on the thread pool unless a run is in progress (then returns false).</summary>
    public bool TryStart(Func<CancellationToken, Task> body)
    {
        lock (_gate)
        {
            if (!_current.IsCompleted) return false;
            _cts?.Dispose();
            var cts = _cts = new CancellationTokenSource();
            _current = Task.Run(() => body(cts.Token));
            return true;
        }
    }

    public void Cancel()
    {
        lock (_gate)
        {
            try { _cts?.Cancel(); }
            catch (ObjectDisposedException) { }
        }
    }

    /// <summary>Completes when the current run (if any) finished. Never throws.</summary>
    public Task WhenIdleAsync()
    {
        Task t;
        lock (_gate) t = _current;
        return t.ContinueWith(_ => { }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
    }
}
