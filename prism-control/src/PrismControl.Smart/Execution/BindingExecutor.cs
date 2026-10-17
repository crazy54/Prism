using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Smart.Packs;
using DesktopKeyMode = PrismControl.Desktop.KeyMode;

namespace PrismControl.Smart.Execution;

public enum ExecOutcome
{
    Done,
    /// <summary>The matched app is not the window in front: nothing was sent.</summary>
    NotInFront,
    /// <summary>The app runs as administrator: Windows would drop our input, so nothing was sent.</summary>
    Elevated,
    /// <summary>The pack's policy forbids this (display-only, or Sight/closed-loop outside safe-offline games).</summary>
    PolicyBlocked,
    /// <summary>The binding needs Prism Sight, which isn't running.</summary>
    SightMissing,
    /// <summary>Sight couldn't find or read what it needs on screen.</summary>
    SightLost,
    /// <summary>The gesture token was too old or already used (a late dial backlog): nothing was sent.</summary>
    TooLate,
    /// <summary>Sight could not find the element (a macro step's tab, button or slider) in a fresh frame: nothing more was sent.</summary>
    NotFound,
    ModuleMissing,
    Unbound,
    /// <summary>This Prism Control build can't do it (e.g. horizontal wheel).</summary>
    Unsupported,
    Failed,
    /// <summary>
    /// WINDOW CHANGED (lead decision 4): the window in front is no longer the one the press started in (Alt-Tab, a popup,
    /// another window of the app) or it became elevated, checked right before every chord, hold-down and notch. The rest
    /// was not sent.
    /// </summary>
    WindowChanged,
    /// <summary>A Sight step of a macro could not confirm it worked, so the steps after it were not sent (review E10).</summary>
    NotVerified,
    /// <summary>A Sight closed loop stopped because the error grew (the step was larger than the distance).</summary>
    Overshot,
}

public sealed record ExecResult(ExecOutcome Outcome, string Message, int Steps = 0)
{
    public bool Ok => Outcome == ExecOutcome.Done;
    /// <summary>Done, but Sight could not verify it (a NotVerified Sight step).</summary>
    public bool Unverified { get; init; }
    public static ExecResult Done(string message = "done", int steps = 0) => new(ExecOutcome.Done, message, steps);

    /// <summary>The short flash a key shows for this outcome (null = no flash).</summary>
    public string? Flash => Outcome switch
    {
        ExecOutcome.Done => null,
        ExecOutcome.NotInFront => "NOT IN FRONT",
        ExecOutcome.Elevated => "ADMIN APP",
        ExecOutcome.PolicyBlocked => "BLOCKED",
        ExecOutcome.SightMissing => "NO SIGHT",
        ExecOutcome.SightLost => "SIGHT LOST",
        ExecOutcome.TooLate => "TOO LATE",
        ExecOutcome.NotFound => "NOT FOUND",
        ExecOutcome.ModuleMissing => "NO MODULE",
        ExecOutcome.Unbound => "BIND ME",
        ExecOutcome.Unsupported => "NOT YET",
        ExecOutcome.WindowChanged => "WINDOW CHANGED",
        ExecOutcome.NotVerified => "NOT VERIFIED",
        ExecOutcome.Overshot => "OVERSHOT",
        _ => "DIDN'T WORK",
    };
}

/// <summary>Who pressed what: the pack, the app the context matched, and the deck gesture behind it.</summary>
/// <param name="Global">The verb is the app's own global hotkey (scope: global): it may run while the app is in the background.</param>
public sealed record ExecContext(ContextPack Pack, ForegroundApp? App, DeckGesture? Gesture, VerbGestureKind Kind, bool Global = false)
{
    /// <summary>The verb's effective safety (the stricter of the pack's and its module's). <c>never-auto</c> runs only from a deliberate press.</summary>
    public Safety Safety { get; init; } = Safety.Safe;
    /// <summary>The window the press started in (captured once, before the first key). Every later send must still go to it.</summary>
    public nint Target { get; init; }
}

/// <summary>
/// Runs bindings. Every input path checks, in order: the pack policy, that the matched app is the window in front, that
/// it isn't elevated; Sight paths also need a fresh deck gesture token (≤ 1 s, minted from the gesture the handler
/// recorded) and a safe-offline pack that allows Sight and closed-loop. Then, right before EVERY chord, hold-down, click,
/// wheel notch and Sight call, the window in front is re-verified (it must still be the window the press started in, not
/// elevated) or the rest stops with WINDOW CHANGED (lead decision 4). All of it runs under ONE engine-wide input lock, a
/// tap or hold-down at a time, so two slots can never interleave their modifiers (review E3). Readings never call this:
/// only key/dial handlers do.
/// </summary>
public sealed class BindingExecutor
{
    /// <summary>Gesture tokens older than this are refused here before Sight sees them (Sight's own limit is about 1 s).</summary>
    public static readonly TimeSpan GestureMaxAge = TimeSpan.FromMilliseconds(1000);

    private readonly IInputSender _input;
    private readonly IMouseSender _mouse;
    private readonly IForegroundSource _foreground;
    private readonly ISmartSight _sight;
    private readonly IVerbRegistry _verbs;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    /// <summary>The engine-wide input lock: one tap (down…up), hold-down, click, notch or Sight call at a time (E3).</summary>
    private readonly SemaphoreSlim _inputGate = new(1, 1);

    public BindingExecutor(IInputSender input, IMouseSender mouse, IForegroundSource foreground, ISmartSight sight, IVerbRegistry verbs, TimeProvider time, ILog? log = null)
    {
        _input = input;
        _mouse = mouse;
        _foreground = foreground;
        _sight = sight;
        _verbs = verbs;
        _time = time;
        _log = (log ?? NullLog.Instance).For("exec");
    }

    private static DesktopKeyMode Mode(ContextPack p) => p.KeyMode == PackKeyMode.Scancode ? DesktopKeyMode.Scancode : DesktopKeyMode.VirtualKey;

    /// <summary>A <c>never-auto</c> verb runs only from the deliberate press of its own key or dial push, never from a turn or anything automatic.</summary>
    public static bool IsDeliberate(ExecContext x) => x.Gesture is not null && x.Kind is VerbGestureKind.KeyPress or VerbGestureKind.KeyHold or VerbGestureKind.DialPush;

    /// <summary>The checks every input path makes. Null = go.</summary>
    public ExecResult? Precheck(Binding b, ExecContext x)
    {
        if (b is UnboundBinding u) return new(ExecOutcome.Unbound, u.Suggest is null ? "This function has no key in the app." : $"No key in the app. Bind it (suggested: {u.Suggest}) in the app's settings.");
        if (x.Safety == Safety.NeverAuto && !IsDeliberate(x)) return new(ExecOutcome.PolicyBlocked, "A never-auto verb runs only from a direct press of its own key.");
        if (x.Pack.IsDisplayOnly && b.SendsInput) return new(ExecOutcome.PolicyBlocked, "This pack is display-only: it never sends input.");
        if (b.UsesSight && !x.Pack.Policy.AllowsClosedLoop) return new(ExecOutcome.PolicyBlocked, "Sight input only runs for safe-offline games that allow it.");
        if (b is ModuleBinding) return null;   // modules act through their own APIs, on the window the context matched
        if (b is MacroBinding mb) return mb.Steps.Select(s => Precheck(s, x)).FirstOrDefault(r => r is not null);
        if (x.Global && !b.UsesSight) return null;   // the app's own global hotkey; Desktop's sender still refuses an elevated window in front
        if (x.App is null || !_foreground.IsInFront(x.App)) return new(ExecOutcome.NotInFront, $"{x.Pack.Name} isn't the window in front, so nothing was sent.");
        if (_foreground.IsElevated(x.App)) return new(ExecOutcome.Elevated, $"{x.Pack.Name} runs as administrator; Windows drops input from Prism Control into it.");
        if (b.UsesSight)
        {
            if (x.Gesture is null || _time.GetUtcNow() - x.Gesture.At > GestureMaxAge) return new(ExecOutcome.TooLate, "The press was too long ago; nothing was sent.");
            if (_sight.Control is null || !_sight.IsAvailable) return new(ExecOutcome.SightMissing, "Needs Prism Sight on this game.");
        }
        return null;
    }

    /// <summary>Records the window in front as the press's target (once; nested macro steps keep the first one).</summary>
    private ExecContext Bind(ExecContext x)
    {
        if (x.Target != 0 || x.Global) return x;
        var fg = _foreground.ForegroundWindow;
        return x with { Target = fg != 0 ? fg : x.App?.Hwnd ?? 0 };
    }

    /// <summary>
    /// Decision 4: right before a send, the target window must still be in front (the same window the press started in)
    /// and not elevated. Null = go. Global hotkeys skip it (they work with the app in the background).
    /// </summary>
    private ExecResult? Guard(ExecContext x)
    {
        if (x.Global) return null;
        if (x.App is null || !_foreground.IsInFront(x.App)) return Changed(x, $"{x.Pack.Name} is no longer in front");
        var fg = _foreground.ForegroundWindow;
        if (x.Target != 0 && fg != 0 && fg != x.Target) return Changed(x, "another window came to the front");
        if (_foreground.IsElevated(x.App)) return Changed(x, $"{x.Pack.Name} now runs as administrator");
        return null;
    }

    private static ExecResult Changed(ExecContext x, string why) => new(ExecOutcome.WindowChanged, $"WINDOW CHANGED: {why}; the rest wasn't sent.");

    /// <summary>One input step under the engine-wide lock, after the window re-check.</summary>
    private async Task<ExecResult?> Exclusive(ExecContext x, Func<Task<ExecResult?>> send, CancellationToken ct)
    {
        await _inputGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (Guard(x) is { } changed) return changed;
            return await send().ConfigureAwait(false);
        }
        finally { _inputGate.Release(); }
    }

    /// <summary>A key press / dial push (taps, sequences, repeats, timed holds, mouse, text, modules, Sight).</summary>
    public async Task<ExecResult> RunAsync(Binding b, ExecContext x, int times = 1, int intervalMs = 25, CancellationToken ct = default)
    {
        if (Precheck(b, x) is { } refused) return refused;
        x = Bind(x);
        times = Math.Max(1, times);
        // never-auto: one deliberate action per press (no repeats).
        if (x.Safety == Safety.NeverAuto) times = 1;
        try
        {
            switch (b)
            {
                case ChordBinding c:
                    for (var i = 0; i < times; i++)
                    {
                        if (i > 0 && !await GapAsync(intervalMs, x, ct)) return Moved(x, i);
                        if (await TapAsync(c.Chord, x, ct) is { } stop) return stop with { Steps = i };
                    }
                    return ExecResult.Done(c.Chord.ToString(), times);
                case SequenceBinding s:
                    for (var i = 0; i < times; i++)
                        for (var j = 0; j < s.Steps.Count; j++)
                        {
                            if ((i > 0 || j > 0) && !await GapAsync(j == 0 ? intervalMs : s.GapMs, x, ct)) return Moved(x, i);
                            if (await TapAsync(s.Steps[j], x, ct) is { } stop) return stop with { Steps = i };
                        }
                    return ExecResult.Done(s.Describe(), times);
                case RepeatBinding r:
                {
                    var count = x.Safety == Safety.NeverAuto ? 1 : times * r.Count;
                    for (var i = 0; i < count; i++)
                    {
                        if (i > 0 && !await GapAsync(r.IntervalMs, x, ct)) return Moved(x, i);
                        if (await TapAsync(r.Chord, x, ct) is { } stop) return stop with { Steps = i };
                    }
                    return ExecResult.Done(r.Describe(), count);
                }
                case HoldBinding h:
                {
                    // A press of a whilePressed hold from a dial or a pushed key: a short timed hold.
                    var ms = h.Mode == HoldMode.Timed ? h.DurationMs : 120;
                    return await TimedHoldAsync(h.Chord, Math.Min(ms * times, 9_000), x, ct);
                }
                case MouseBinding m:
                    return await MouseAsync(m, times, x, ct);
                case TextBinding t:
                    return await Exclusive(x, async () => await _input.SendTextAsync(t.Text, ct) ? null : Fail("Typing stopped (the window changed or Windows refused)."), ct)
                        ?? ExecResult.Done(t.Describe());
                case ModuleBinding mb:
                    return await ModuleAsync(mb, x, times, ct);
                case SightClickBinding sc:
                {
                    ExecResult? result = null;
                    var stop = await Exclusive(x, async () =>
                    {
                        if (Token(x) is not { } token) return TooLate();
                        result = FromAct(await _sight.Control!.ClickAsync(sc.Sight, token, ct), "click " + sc.Sight);
                        return null;
                    }, ct);
                    return stop ?? result!;
                }
                case SightAdjustBinding sa:
                {
                    ExecResult? result = null;
                    var stop = await Exclusive(x, async () =>
                    {
                        if (Token(x) is not { } token) return TooLate();
                        result = FromAct(await _sight.Control!.AdjustAsync(sa.Sight, sa.Direction > 0 ? SightAdjustDirection.Increase : SightAdjustDirection.Decrease,
                            Math.Clamp(sa.Steps * times, 1, 60), ParseMethod(sa.Method), token, ct), $"adjust {sa.Sight}");
                        return null;
                    }, ct);
                    return stop ?? result!;
                }
                case ClosedLoopBinding cl:
                    return await ClosedLoopAsync(cl, x, ct);
                case MacroBinding m:
                {
                    var steps = 0;
                    for (var i = 0; i < m.Steps.Count; i++)
                    {
                        if (i > 0 && !await GapAsync(m.GapMs, x, ct)) return Moved(x, steps);
                        var r = await RunAsync(m.Steps[i], x, 1, intervalMs, ct);
                        if (!r.Ok) return r with { Message = $"step {i + 1} of {m.Steps.Count}: {r.Message}", Steps = steps };
                        steps += Math.Max(1, r.Steps);
                        // A Sight step that could not confirm it worked stops the macro (the next step would act on a guess).
                        if (r.Unverified && i < m.Steps.Count - 1)
                            return new(ExecOutcome.NotVerified, $"step {i + 1} of {m.Steps.Count} could not be verified, so the rest wasn't sent.", steps);
                    }
                    return ExecResult.Done(m.Describe(), steps);
                }
                default:
                    return new(ExecOutcome.Unsupported, $"{b.Kind} isn't supported here.");
            }
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _log.Warn($"{x.Pack.Id}: {b.Kind} failed", ex);
            return Fail(ex.GetType().Name);
        }
    }

    /// <summary>
    /// Key down of a whilePressed hold: press and keep holding for <paramref name="owner"/> (the slot), released by
    /// <see cref="HoldUpAsync"/>. Holds are counted per owner (E16); Desktop's watchdog caps any hold at 10 s.
    /// </summary>
    public async Task<ExecResult> HoldDownAsync(HoldBinding h, ExecContext x, object owner, CancellationToken ct = default)
    {
        if (Precheck(h, x) is { } refused) return refused;
        x = Bind(x);
        return await Exclusive(x, async () => await _input.HoldKeysAsync(owner, x.Global ? 0 : x.Target, h.Chord.VirtualKeys, Mode(x.Pack), ct)
                ? null
                : Guard(x) ?? Fail("Windows didn't take the keys."), ct)
            ?? ExecResult.Done("hold " + h.Chord);
    }

    /// <summary>Key up of a whilePressed hold. Always releases this owner's hold (no checks: releasing is always safe).</summary>
    public async Task<ExecResult> HoldUpAsync(HoldBinding h, object owner, CancellationToken ct = default) =>
        await _input.ReleaseKeysAsync(owner, h.Chord.VirtualKeys, ct) ? ExecResult.Done("release " + h.Chord) : Fail("release failed");

    /// <summary>Releases everything <paramref name="owner"/> holds (its slot went away, or its app left the front).</summary>
    public Task ReleaseOwnerAsync(object owner) => _input.ReleaseOwnerAsync(owner);

    public Task ReleaseAllAsync() => _input.ReleaseAllAsync();

    /// <summary>A dial event, already planned (acceleration, cap, clamp).</summary>
    public async Task<ExecResult> TurnAsync(TurnPlan plan, ExecContext x, CancellationToken ct = default)
    {
        if (plan.Presses <= 0) return ExecResult.Done("at the clamp");
        if (Precheck(plan.Binding, x) is { } refused) return refused;
        return plan.Binding switch
        {
            HoldBinding h => await TimedHoldAsync(h.Chord, Math.Min((h.Mode == HoldMode.Timed ? h.DurationMs : 80) * plan.Presses, 9_000), Bind(x), ct, plan.Presses),
            MouseBinding { IsWheel: true } m => await MouseAsync(m, plan.Presses, Bind(x), ct),
            ModuleBinding mb => await ModuleAsync(mb, x with { Kind = VerbGestureKind.DialTurn }, plan.Presses * plan.Direction, ct),
            _ => await RunAsync(plan.Binding, x, plan.Presses, Math.Max(plan.IntervalMs, 0), ct),
        };
    }

    /// <summary>
    /// One tap under the input lock, re-checked first. Packs with <see cref="ContextPack.KeyHoldMs"/> &gt; 0 (Cobra games)
    /// hold the keys that long, down then up (the lock covers the whole tap, so another slot's modifiers can't mix in);
    /// everything else is one SendInput batch to the target window. Null = sent.
    /// </summary>
    private Task<ExecResult?> TapAsync(Chord chord, ExecContext x, CancellationToken ct) => Exclusive(x, async () =>
    {
        var keys = chord.VirtualKeys;
        var mode = Mode(x.Pack);
        if (x.Pack.KeyHoldMs <= 0)
        {
            var sent = x.Global ? await _input.SendChordAsync(keys, mode, ct) : await _input.SendChordToAsync(x.Target, keys, mode, ct);
            return sent ? null : Guard(x) ?? Fail("Windows didn't take the keys.");
        }
        var owner = new object();
        if (!await _input.HoldKeysAsync(owner, x.Global ? 0 : x.Target, keys, mode, ct)) return Guard(x) ?? Fail("Windows didn't take the keys.");
        try { await Task.Delay(TimeSpan.FromMilliseconds(x.Pack.KeyHoldMs), _time, ct); }
        finally { await _input.ReleaseKeysAsync(owner, keys, CancellationToken.None); }
        return null;
    }, ct);

    private async Task<ExecResult> TimedHoldAsync(Chord chord, int ms, ExecContext x, CancellationToken ct, int steps = 1) =>
        await Exclusive(x, async () =>
        {
            var owner = new object();
            if (!await _input.HoldKeysAsync(owner, x.Global ? 0 : x.Target, chord.VirtualKeys, Mode(x.Pack), ct)) return Guard(x) ?? Fail("Windows didn't take the keys.");
            try { await Task.Delay(TimeSpan.FromMilliseconds(ms), _time, ct); }
            finally { await _input.ReleaseKeysAsync(owner, chord.VirtualKeys, CancellationToken.None); }
            return null;
        }, ct) ?? ExecResult.Done($"held {chord} {ms} ms", steps);

    private async Task<ExecResult> MouseAsync(MouseBinding m, int times, ExecContext x, CancellationToken ct)
    {
        var mods = ModifierKeys.None;
        foreach (var mod in m.Mods)
            mods |= Chord.ModifierRank(mod) switch { 0 => ModifierKeys.Windows, 1 => ModifierKeys.Control, 2 => ModifierKeys.Alt, _ => ModifierKeys.Shift };
        if (m.Mode != MouseMode.Click && !m.IsWheel)
            return new(ExecOutcome.Unsupported, "Holding a mouse button needs a newer Prism Control (mouse down/up).");
        var options = new MouseOptions { ExpectedHwnd = x.Global ? 0 : x.Target, RestoreCursor = true };
        switch (m.Button)
        {
            case PackMouseButton.WheelUp or PackMouseButton.WheelDown:
            {
                // One notch at a time: the window is re-checked before every notch (decision 4).
                var notches = Math.Clamp(times, 1, 50);
                var sign = m.Button == PackMouseButton.WheelUp ? 1 : -1;
                for (var i = 0; i < notches; i++)
                {
                    MouseResult r = MouseResult.Sent;
                    var stop = await Exclusive(x, async () => (r = await _mouse.WheelAsync(sign, mods, null, options, ct)) == MouseResult.Sent ? null : Guard(x), ct);
                    if (stop is not null) return stop with { Steps = i };
                    if (r != MouseResult.Sent) return FromMouse(r, x, m) with { Steps = i };
                }
                return ExecResult.Done(m.Describe(), notches);
            }
            case PackMouseButton.WheelLeft or PackMouseButton.WheelRight:
                return new(ExecOutcome.Unsupported, "Horizontal wheel isn't supported yet.");
            default:
            {
                var button = m.Button switch
                {
                    PackMouseButton.Right => MouseButton.Right, PackMouseButton.Middle => MouseButton.Middle,
                    PackMouseButton.X1 => MouseButton.X1, PackMouseButton.X2 => MouseButton.X2, _ => MouseButton.Left,
                };
                MouseResult r = MouseResult.Sent;
                var stop = await Exclusive(x, async () => (r = await _mouse.ClickAsync(null, button, Math.Clamp(m.Clicks, 1, 3), mods, options, ct)) == MouseResult.Sent ? null : Guard(x), ct);
                return stop ?? FromMouse(r, x, m) with { Steps = r == MouseResult.Sent ? times : 0 };
            }
        }
    }

    private ExecResult FromMouse(MouseResult r, ExecContext x, MouseBinding m) => r switch
    {
        MouseResult.Sent => ExecResult.Done(m.Describe()),
        MouseResult.Elevated => new(ExecOutcome.Elevated, "The window under the cursor runs as administrator."),
        MouseResult.WrongWindow => new(ExecOutcome.NotInFront, $"The cursor isn't over {x.Pack.Name}: nothing was clicked."),
        MouseResult.NoWindow => new(ExecOutcome.NotInFront, "No window under the cursor."),
        _ => Fail("Windows didn't take the click."),
    };

    private async Task<ExecResult> ModuleAsync(ModuleBinding mb, ExecContext x, int ticks, CancellationToken ct)
    {
        if (mb.Status == ModuleVerbStatus.Planned && !_verbs.TryResolveVerb(mb.Verb, out _, out _)) return new(ExecOutcome.ModuleMissing, $"{mb.Verb} isn't built yet.");
        if (!_verbs.TryResolveVerb(mb.Verb, out var provider, out _)) return new(ExecOutcome.ModuleMissing, $"Needs the Prism Control {mb.Verb.Split('.')[0]} module.");
        var status = provider.GetStatus(mb.Verb);
        if (!status.IsReady)
            return new(status.Availability is VerbAvailability.ModuleMissing ? ExecOutcome.ModuleMissing : ExecOutcome.Failed, status.Hint ?? status.Availability.ToString());
        var result = await provider.InvokeAsync(new VerbInvocation
        {
            VerbId = mb.Verb,
            Args = mb.Args?.DeepClone() as System.Text.Json.Nodes.JsonObject,
            Gesture = x.Kind,
            Ticks = x.Kind == VerbGestureKind.DialTurn ? ticks : 0,
            DirectGesture = x.Gesture is not null,
            TargetWindow = x.App?.Hwnd ?? 0,
        }, ct);
        return result.Ok ? ExecResult.Done(mb.Verb) : Fail(result.Message ?? "the module refused");
    }

    private async Task<ExecResult> ClosedLoopAsync(ClosedLoopBinding cl, ExecContext x, CancellationToken ct)
    {
        SightStepVia via = cl.StepSight is { } stepSight
            ? new SightControlSteps(stepSight)
            : new SightChordSteps(cl.Increase!.VirtualKeys, cl.Decrease!.VirtualKeys, Mode(x.Pack), Math.Max(cl.SettleMs, 25), HoldMs: x.Pack.KeyHoldMs);
        var options = new SightDriveOptions(Tolerance: cl.Tolerance, StepSize: cl.Step, MaxSteps: cl.MaxSteps, SettleMs: cl.SettleMs,
            Fallback: cl.Fallback == "counted" ? SightDriveFallback.Counted : SightDriveFallback.Refuse);
        SightDriveResult? drive = null;
        var stop = await Exclusive(x, async () =>
        {
            if (Token(x) is not { } token) return TooLate();
            drive = await _sight.Control!.DriveToAsync(cl.Sight, cl.Target, via, options, token, ct);
            return null;
        }, ct);
        if (stop is not null) return stop;
        var r = drive!;
        return r.Status switch
        {
            SightDriveStatus.Converged or SightDriveStatus.AlreadyThere => ExecResult.Done($"{cl.Sight}: {r.Start:0.#} → {r.Final:0.#}", r.StepsSent),
            SightDriveStatus.CountedFallback => ExecResult.Done("undid our counted steps (no reading)", r.StepsSent),
            SightDriveStatus.SafeMode => ExecResult.Done("safe mode: logged, not sent", r.StepsSent),
            SightDriveStatus.NoReading => new(ExecOutcome.SightLost, r.Reason ?? "Sight can't read it right now."),
            SightDriveStatus.NotFound => new(ExecOutcome.NotFound, r.Reason ?? "Sight can't find the control on screen."),
            SightDriveStatus.Refused => new(ExecOutcome.PolicyBlocked, r.Reason ?? "Sight refused."),
            SightDriveStatus.WindowChanged => new(ExecOutcome.WindowChanged, r.Reason ?? "WINDOW CHANGED: the game left the front; the rest wasn't sent.", r.StepsSent),
            SightDriveStatus.Overshot => new(ExecOutcome.Overshot, r.Reason ?? "The value moved past the target; Sight stopped there.", r.StepsSent),
            SightDriveStatus.Cancelled => new(ExecOutcome.Failed, "cancelled"),
            _ => new(ExecOutcome.Failed, $"{r.Status}: {r.Reason}", r.StepsSent),
        };
    }

    private static ExecResult FromAct(SightActResult r, string what) => r.Status switch
    {
        SightActStatus.Verified or SightActStatus.Done or SightActStatus.SafeMode => ExecResult.Done(what, r.Steps),
        SightActStatus.NotVerified => ExecResult.Done(what + " (not verified)", r.Steps) with { Unverified = true },
        SightActStatus.NotFound => new(ExecOutcome.NotFound, r.Reason ?? "Sight can't find it on screen."),
        SightActStatus.Refused => new(ExecOutcome.PolicyBlocked, r.Reason ?? "Sight refused."),
        SightActStatus.WindowChanged => new(ExecOutcome.WindowChanged, r.Reason ?? "WINDOW CHANGED: the game left the front; the rest wasn't sent.", r.Steps),
        SightActStatus.Cancelled => new(ExecOutcome.Failed, "cancelled"),
        _ => new(ExecOutcome.Failed, r.Reason ?? r.Status.ToString()),
    };

    private static SightAdjustMethod ParseMethod(string m) => m switch
    {
        "buttons" => SightAdjustMethod.Buttons, "drag" => SightAdjustMethod.Drag, "wheel" => SightAdjustMethod.Wheel, _ => SightAdjustMethod.Auto,
    };

    /// <summary>Waits between presses and checks the app is still in front (false = stop: the user switched away). Global hotkeys don't need the front (E14).</summary>
    private async Task<bool> GapAsync(int ms, ExecContext x, CancellationToken ct)
    {
        if (ms > 0) await Task.Delay(TimeSpan.FromMilliseconds(ms), _time, ct);
        return x.Global || (x.App is not null && _foreground.IsInFront(x.App));
    }

    /// <summary>A one-shot Sight token from the user's gesture (null when it is older than <see cref="GestureMaxAge"/>).</summary>
    private static GestureToken? Token(ExecContext x) => x.Gesture?.Mint(GestureMaxAge);

    private static ExecResult TooLate() => new(ExecOutcome.TooLate, "The press was too long ago for Prism Sight; nothing was sent.");

    private static ExecResult Moved(ExecContext x, int steps) => new(ExecOutcome.WindowChanged, $"WINDOW CHANGED: {x.Pack.Name} left the front midway; the rest wasn't sent.", steps);
    private static ExecResult Fail(string why) => new(ExecOutcome.Failed, why);
}
