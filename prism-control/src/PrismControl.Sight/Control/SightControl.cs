using System.Collections.Concurrent;
using System.Diagnostics;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Service;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Control;

/// <summary>
/// The ONLY place in Sight that sends input (keyboard through <see cref="IInputSender"/>, mouse through
/// <see cref="IMouseSender"/>), and only from a fresh, unused deck <see cref="GestureToken"/> of a fitting kind, for an
/// allowlisted game that is in front and not elevated. Nothing in Sight calls it on its own: readings never act (the
/// architecture test proves no other type touches the senders). Elements must be located with high confidence first
/// ("not found" otherwise), and every action re-reads to verify. Before EVERY chord, click and wheel notch the game must
/// still be the foreground window and not elevated, or the call stops with <see cref="SightActStatus.WindowChanged"/>
/// (lead decision 4). Closed loops act only on full-confidence reads inside the readout's contexts, probe the step size
/// first and bound their presses (decision 3). Safe mode: the senders are the recording fakes, and closed loops log
/// their plan without iterating.
/// </summary>
public sealed class SightControl : ISightControl, IDisposable
{
    /// <summary>How long one read may take (the time provider's clock; frames in tests). A wall-clock cap guards hangs.</summary>
    internal static readonly TimeSpan ReadBudget = TimeSpan.FromMilliseconds(1200);
    private static readonly TimeSpan VerifyBudget = TimeSpan.FromMilliseconds(800);
    private static readonly TimeSpan WallCap = TimeSpan.FromSeconds(20);
    /// <summary>The most presses a closed loop sends between two reads once its step size is confirmed.</summary>
    internal const int MaxBatch = 12;

    private readonly ISightLive _live;
    private readonly IInputSender _input;
    private readonly IMouseSender? _mouse;
    private readonly GestureGuard _guard;
    private readonly bool _safe;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _one = new(1, 1);
    private readonly ConcurrentDictionary<string, int> _ledger = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, double> _learnedStep = new(StringComparer.Ordinal);
    private readonly object _boundary = new();
    private (nint Hwnd, int Pid, string Recipe)? _lastTarget;
    private (string? Id, DateTimeOffset? Since)? _lastContext;
    private CancellationTokenSource? _currentDrive;

    public SightControl(ISightLive live, IInputSender input, IMouseSender? mouse, GestureGuard guard, bool safeMode, ILog? log = null, TimeProvider? time = null)
    {
        _live = live;
        _input = input;
        _mouse = mouse;
        _guard = guard;
        _safe = safeMode;
        _log = (log ?? NullLog.Instance).For("sight.control");
        _time = time ?? TimeProvider.System;
    }

    /// <summary>Net steps Sight sent to a control since its ledger was reset (+ = increase).</summary>
    public int Counted(string controlId) => _ledger.TryGetValue(controlId, out var n) ? n : 0;

    public IReadOnlyDictionary<string, int> Ledger => new Dictionary<string, int>(_ledger);

    /// <summary>Step sizes confirmed by earlier drives (key: recipe|readout|step method). Cleared on a game or recipe change.</summary>
    public IReadOnlyDictionary<string, double> LearnedSteps => new Dictionary<string, double>(_learnedStep);

    public event Action? LedgerChanged;

    public void ResetLedger(string? controlId = null)
    {
        if (controlId is null) _ledger.Clear();
        else _ledger.TryRemove(controlId, out _);
        LedgerChanged?.Invoke();
    }

    // ------------------------------------------------------------------ preconditions

    private (bool Ok, SightTarget? Target, SightEngine? Engine, string Reason) Check(GestureToken? gesture, GestureUse use)
    {
        if (!_guard.TryAccept(gesture, use, out var why)) return (false, null, null, why);
        var t = _live.Target;
        var e = _live.Engine;
        if (t is null || e is null) return (false, null, null, "no supported game is being read");
        if (!t.Access.InputAllowed) return (false, t, e, $"input is not allowed for {t.ProcessName}: {t.Access.Reason}");
        if (WindowCheck(t) is { } notInFront) return (false, t, e, notInFront);
        Boundaries(t, e);
        return (true, t, e, "ok");
    }

    /// <summary>
    /// Null when input may go to the game right now: it is the foreground window and not elevated. Called before every
    /// chord, click and wheel step (lead decision 4), not just once per action.
    /// </summary>
    private string? WindowCheck(SightTarget t)
    {
        if (!SameTopLevel(_live.ForegroundWindow(), t.Hwnd)) return "the game is not in front";
        if (_input.TargetIsElevated(t.Hwnd)) return "the game runs as administrator: Windows drops input from Prism";
        return null;
    }

    private static string Changed(string why) => "WINDOW CHANGED: " + why + " (stopped before the next press)";

    /// <summary>
    /// The ledger and the learned step sizes belong to one game window, recipe and context (M7). A different target
    /// clears both; a change of the active context (a new piece, a menu, another tool) clears the ledger, so the counted
    /// fallback never undoes steps that belong to something else. A first context after "nothing known yet" is not a change.
    /// </summary>
    private void Boundaries(SightTarget t, SightEngine e)
    {
        var target = (t.Hwnd, t.Pid, t.Recipe.Id);
        var ctx = e.MainContext();
        bool resetLedger = false, clearSteps = false;
        lock (_boundary)
        {
            if (_lastTarget != target)
            {
                resetLedger = clearSteps = _lastTarget is not null;
                _lastTarget = target;
            }
            else if (_lastContext is { Id: not null } prev && prev != ctx) resetLedger = true;
            _lastContext = ctx;
        }
        if (clearSteps && !_learnedStep.IsEmpty)
        {
            _learnedStep.Clear();
            _log.Info("another game or recipe: learned step sizes cleared");
        }
        if (resetLedger && !_ledger.IsEmpty)
        {
            _log.Info($"counted steps reset ({(clearSteps ? "another game or recipe" : $"the context changed to {ctx.Id ?? "none"}")})");
            ResetLedger();
        }
    }

    private static bool SameTopLevel(nint a, nint b) => a != 0 && b != 0 && (a == b || Root(a) == Root(b));

    private static nint Root(nint h) => WindowGeometry.RootOf(h);

    private static void TryCancel(CancellationTokenSource? cts)
    {
        if (cts is null) return;
        // The drive may have finished (and disposed its source) a moment ago: that is not an error, and never loses the
        // new gesture.
        try { cts.Cancel(); }
        catch (ObjectDisposedException) { }
    }

    private async Task<T> Exclusive<T>(bool isDrive, Func<CancellationToken, Task<T>> body, Func<T> cancelled, CancellationToken ct)
    {
        // A new gesture overrides a running closed loop; other actions queue (a dial spin's steps all land).
        var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (isDrive) TryCancel(Interlocked.Exchange(ref _currentDrive, cts));
        else TryCancel(Volatile.Read(ref _currentDrive));
        try
        {
            await _one.WaitAsync(cts.Token).ConfigureAwait(false);
            try
            {
                using (_live.Boost()) return await body(cts.Token).ConfigureAwait(false);
            }
            finally { _one.Release(); }
        }
        catch (OperationCanceledException) { return cancelled(); }
        finally
        {
            if (isDrive) Interlocked.CompareExchange(ref _currentDrive, null, cts);
            cts.Dispose();
        }
    }

    // ------------------------------------------------------------------ click

    public async Task<SightActResult> ClickAsync(string controlId, GestureToken gesture, CancellationToken ct = default)
    {
        var (ok, t, e, reason) = Check(gesture, GestureUse.Click);
        if (!ok) return Refuse(reason);
        var control = t!.Recipe.Control(controlId) ?? t.Recipe.Controls.FirstOrDefault(c => c.RegionId == controlId);
        if (control is null) return Refuse($"unknown control '{controlId}'");
        if (_mouse is null) return new SightActResult(SightActStatus.Failed, "no mouse sender");
        return await Exclusive(false, async token =>
        {
            if (await RequiresAsync(e!, control, token).ConfigureAwait(false) is { } unmet) return new SightActResult(SightActStatus.NotFound, unmet);
            var loc = await LocateAsync(e!, t, control, token).ConfigureAwait(false);
            if (loc.Box is not { } box) return new SightActResult(SightActStatus.NotFound, $"'{control.Id}' not found (score {loc.Score:F2} < {control.MinScore:F2}): nothing was clicked");
            if (!ToScreen(t, box, control.Point, out var pt)) return new SightActResult(SightActStatus.Failed, "the game window has no client area");
            if (WindowCheck(t) is { } moved) return new SightActResult(SightActStatus.WindowChanged, Changed(moved), Method: "click");
            var r = await _mouse.ClickAsync(pt, MouseButton.Left, 1, ModifierKeys.None, Options(t), token).ConfigureAwait(false);
            if (r != MouseResult.Sent)
                return WindowCheck(t) is { } after
                    ? new SightActResult(SightActStatus.WindowChanged, Changed(after), Method: "click")
                    : new SightActResult(SightActStatus.Failed, $"the click was refused ({r})", Method: "click");
            _log.Info($"click '{control.Id}' at {pt}{(_safe ? " [safe mode: recorded, not sent]" : "")}");
            if (_safe) return new SightActResult(SightActStatus.SafeMode, "safe mode: logged, not sent", 1, Method: "click");
            if (control.Verify is null) return new SightActResult(SightActStatus.Done, null, 1, Method: "click");
            var verified = await VerifyAsync(e!, control, token).ConfigureAwait(false);
            return new SightActResult(verified ? SightActStatus.Verified : SightActStatus.NotVerified, verified ? null : "the expected change did not appear", 1, Method: "click");
        }, () => new SightActResult(SightActStatus.Cancelled), ct).ConfigureAwait(false);
    }

    /// <summary>The control's precondition in a fresh frame: null when met (or none), else why not.</summary>
    private async Task<string?> RequiresAsync(SightEngine e, CompiledControl control, CancellationToken ct)
    {
        if (control.Requires is null) return null;
        var regions = control.Requires.DetectorIds.Select(id => e.Recipe.Detector(id)?.RegionIndex ?? -1).Where(i => i >= 0).Distinct().ToList();
        if (!_live.CanRead || !await _live.FreshAsync(regions, TimeSpan.FromMilliseconds(400), ct).ConfigureAwait(false)) return $"'{control.Id}': no fresh frame to check its precondition";
        return control.Requires.Evaluate(e) is (true, >= 0.5) ? null : $"'{control.Id}': its precondition does not hold (the previous step did not happen?): nothing was sent";
    }

    private async Task<bool> VerifyAsync(SightEngine e, CompiledControl control, CancellationToken ct)
    {
        await Task.Delay(control.SettleMs, ct).ConfigureAwait(false);
        var regions = control.Verify!.DetectorIds.Select(id => e.Recipe.Detector(id)?.RegionIndex ?? -1).Where(i => i >= 0).Distinct().ToList();
        var start = _time.GetUtcNow();
        var wall = Stopwatch.StartNew();
        while (_time.GetUtcNow() - start < VerifyBudget && wall.Elapsed < WallCap)
        {
            if (!_live.CanRead) return false;
            if (!await _live.FreshAsync(regions, TimeSpan.FromMilliseconds(250), ct).ConfigureAwait(false)) { await Task.Delay(15, ct).ConfigureAwait(false); continue; }
            if (control.Verify.Evaluate(e) is (true, >= 0.5)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ adjust

    public async Task<SightActResult> AdjustAsync(string controlId, SightAdjustDirection direction, int steps, SightAdjustMethod method, GestureToken gesture, CancellationToken ct = default)
    {
        var (ok, t, e, reason) = Check(gesture, GestureUse.Adjust);
        if (!ok) return Refuse(reason);
        var control = t!.Recipe.Control(controlId) ?? t.Recipe.Controls.FirstOrDefault(c => c.RegionId == controlId);
        if (control is null) return Refuse($"unknown control '{controlId}'");
        if (control.Kind == ControlKind.Button) return Refuse($"'{control.Id}' is a button: use ClickAsync");
        steps = Math.Clamp(steps, 1, 48);
        return await Exclusive(false, async token =>
        {
            var readout = control.Readout is null ? null : t.Recipe.Readout(control.Readout);
            // Read the value fresh before acting, so the re-read can verify the change.
            var before = readout is null ? null : (await FreshNumberAsync(e!, readout, _time.GetUtcNow(), token).ConfigureAwait(false)).Value;
            var r = await AdjustCoreAsync(t, e!, control, direction, steps, method, token).ConfigureAwait(false);
            if (r.Status != SightActStatus.Done || _safe) return r with { Status = _safe && r.Status == SightActStatus.Done ? SightActStatus.SafeMode : r.Status };
            if (readout is null || before is null) return r;
            await Task.Delay(control.SettleMs, token).ConfigureAwait(false);
            var after = (await FreshNumberAsync(e!, readout, _time.GetUtcNow(), token).ConfigureAwait(false)).Value;
            var moved = after is { } a && (direction == SightAdjustDirection.Increase ? a > before : a < before);
            return r with { Status = moved ? SightActStatus.Verified : SightActStatus.NotVerified, Before = before, After = after,
                Reason = moved ? null : "the value did not move the expected way" };
        }, () => new SightActResult(SightActStatus.Cancelled), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Locate, then step by the chosen method, re-checking the foreground before every click and wheel step. No gesture
    /// check here: callers did it. The ledger books exactly the steps that went out.
    /// </summary>
    private async Task<SightActResult> AdjustCoreAsync(SightTarget t, SightEngine e, CompiledControl control, SightAdjustDirection direction, int steps, SightAdjustMethod requested, CancellationToken ct)
    {
        if (_mouse is null) return new SightActResult(SightActStatus.Failed, "no mouse sender");
        var methods = requested == SightAdjustMethod.Auto ? control.Methods : control.Methods.Where(m => m == Map(requested)).ToList();
        if (methods.Count == 0) return Refuse($"'{control.Id}' cannot be adjusted with {requested}");
        var method = methods[0];
        if (await RequiresAsync(e, control, ct).ConfigureAwait(false) is { } unmet) return new SightActResult(SightActStatus.NotFound, unmet);
        var loc = await LocateAsync(e, t, control, ct).ConfigureAwait(false);
        if (loc.Box is not { } box) return new SightActResult(SightActStatus.NotFound, $"'{control.Id}' not found (score {loc.Score:F2} < {control.MinScore:F2}): nothing was sent");
        var inc = direction == SightAdjustDirection.Increase;
        var opts = Options(t, control.IntervalMs);
        MouseResult r = MouseResult.Sent;
        var name = method.ToString().ToLowerInvariant();
        var done = 0;
        string? changed = null;
        var unknownPartial = false;
        switch (method)
        {
            case AdjustMethod.Buttons:
            {
                if (!ToScreen(t, box, inc ? control.Increase! : control.Decrease!, out var pt)) return new SightActResult(SightActStatus.Failed, "no client area");
                for (var i = 0; i < steps; i++)
                {
                    if (i > 0) await Task.Delay(control.IntervalMs, ct).ConfigureAwait(false);
                    if (WindowCheck(t) is { } w) { changed = w; break; }
                    r = await _mouse.ClickAsync(pt, MouseButton.Left, 1, ModifierKeys.None, opts, ct).ConfigureAwait(false);
                    if (r != MouseResult.Sent) break;
                    done++;
                }
                break;
            }
            case AdjustMethod.Wheel:
            {
                var w = control.Wheel!;
                if (!ToScreen(t, box, w.Point, out var pt)) return new SightActResult(SightActStatus.Failed, "no client area");
                // M12: never ask for more notches than one call sends (50), and book only the steps that fit.
                var fit = Math.Clamp(steps, 1, Math.Max(1, SendInputMouseSender.MaxNotches / Math.Max(1, w.NotchesPerStep)));
                if (WindowCheck(t) is { } before) { changed = before; break; }
                // One call (the cursor moves once); the sender re-checks the window and the foreground before EVERY notch.
                r = await _mouse.WheelAsync(fit * w.NotchesPerStep * (inc == w.UpIncreases ? 1 : -1), ModifierKeys.None, pt, opts, ct).ConfigureAwait(false);
                if (r == MouseResult.Sent) done = fit;
                else unknownPartial = fit * w.NotchesPerStep > 1;   // some notches may have gone out before the refusal
                break;
            }
            case AdjustMethod.Drag:
            {
                var s = control.Slider!;
                var handle = box;
                if (s.HandleDetector is { } hd)
                {
                    var hs = e.Latest(hd);
                    if (hs?.ContentBox is not { } hb || (hs.Result.Number ?? 0) < control.MinScore) return new SightActResult(SightActStatus.NotFound, "slider handle not found: nothing was sent");
                    handle = hb;
                }
                var cx = handle.X + handle.W / 2.0;
                var cy = handle.Y + handle.H / 2.0;
                var unit = e.CurrentUnit;
                var dist = steps * s.StepUnits * unit * (inc == s.IncreaseTowardsEnd ? 1 : -1);
                var (tx, ty) = s.Horizontal ? (cx + dist, cy) : (cx, cy - dist);   // "end" of a vertical slider is up
                if (!_live.ContentToScreen(cx, cy, out var from) || !_live.ContentToScreen(tx, ty, out var to))
                    return new SightActResult(SightActStatus.Failed, "no client area");
                if (WindowCheck(t) is { } before) { changed = before; break; }
                r = await _mouse.DragAsync(from, to, TimeSpan.FromMilliseconds(120 + 10 * steps), 10, MouseButton.Left, ModifierKeys.None, opts, ct).ConfigureAwait(false);
                if (r == MouseResult.Sent) done = steps;
                else unknownPartial = true;
                break;
            }
        }
        if (done != 0)
        {
            _ledger.AddOrUpdate(control.Id, inc ? done : -done, (_, n) => n + (inc ? done : -done));
            LedgerChanged?.Invoke();
        }
        if (unknownPartial)
        {
            // How far it moved is unknown: the counted fallback must not undo a guess.
            ResetLedger(control.Id);
        }
        if (changed is null && r != MouseResult.Sent && WindowCheck(t) is { } after) changed = after;
        if (changed is not null)
        {
            _log.Info($"adjust '{control.Id}': {Changed(changed)} after {done} of {steps} step(s)");
            return new SightActResult(SightActStatus.WindowChanged, Changed(changed), done, Method: name);
        }
        if (r != MouseResult.Sent) return new SightActResult(SightActStatus.Failed, $"the {name} input was refused ({r})", done, Method: name);
        _log.Info($"adjust '{control.Id}' {direction} ×{done} by {name}{(_safe ? " [safe mode: recorded, not sent]" : "")}");
        return new SightActResult(SightActStatus.Done, null, done, Method: name);
    }

    // ------------------------------------------------------------------ chord steps

    public async Task<SightActResult> StepAsync(SightChordSteps chords, SightAdjustDirection direction, int steps, GestureToken gesture, CancellationToken ct = default)
    {
        var (ok, t, _, reason) = Check(gesture, GestureUse.Adjust);
        if (!ok) return Refuse(reason);
        steps = Math.Clamp(steps, 1, 48);
        return await Exclusive(false, async token =>
        {
            var (sent, status, why) = await ChordStepsAsync(t!, chords, direction == SightAdjustDirection.Increase, steps, token).ConfigureAwait(false);
            if (status != SightActStatus.Done) return new SightActResult(status, why, sent, Method: "chord");
            return new SightActResult(_safe ? SightActStatus.SafeMode : SightActStatus.Done, _safe ? "safe mode: logged, not sent" : null, sent, Method: "chord");
        }, () => new SightActResult(SightActStatus.Cancelled), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Presses the step chord <paramref name="steps"/> times. Before EVERY press the game must still be in front and not
    /// elevated (WindowChanged otherwise), and the sender re-checks the same thing inside its lock right before SendInput.
    /// Presses are held <see cref="SightChordSteps.EffectiveHoldMs"/> when set (scancode games drop instant taps).
    /// </summary>
    private async Task<(int Sent, SightActStatus Status, string? Reason)> ChordStepsAsync(SightTarget t, SightChordSteps chords, bool increase, int steps, CancellationToken ct)
    {
        var keys = increase ? chords.Increase : chords.Decrease;
        if (keys.Count == 0) return (0, SightActStatus.Failed, "no chord is set for that direction");
        var hold = chords.EffectiveHoldMs;
        var interval = Math.Clamp(chords.IntervalMs, 10, 1000);
        for (var i = 0; i < steps; i++)
        {
            if (i > 0) await Task.Delay(interval, ct).ConfigureAwait(false);
            if (WindowCheck(t) is { } moved)
            {
                _log.Info($"chord steps: {Changed(moved)} after {i} of {steps}");
                return (i, SightActStatus.WindowChanged, Changed(moved));
            }
            var ok = hold > 0
                ? await HoldPressAsync(keys, chords.Mode, hold, ct).ConfigureAwait(false)
                : await _input.SendChordToAsync(t.Hwnd, keys, chords.Mode, ct).ConfigureAwait(false);
            if (!ok)
                return WindowCheck(t) is { } after ? (i, SightActStatus.WindowChanged, Changed(after)) : (i, SightActStatus.Failed, "a key press was refused");
        }
        return (steps, SightActStatus.Done, null);
    }

    /// <summary>Down, hold, up: the release always goes out (cancellation and failures included).</summary>
    private async Task<bool> HoldPressAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, int holdMs, CancellationToken ct)
    {
        if (!await _input.SendKeysDownAsync(keys, mode, ct).ConfigureAwait(false))
        {
            await _input.SendKeysUpAsync(keys, CancellationToken.None).ConfigureAwait(false);
            return false;
        }
        try { await Task.Delay(holdMs, ct).ConfigureAwait(false); }
        finally { await _input.SendKeysUpAsync(keys, CancellationToken.None).ConfigureAwait(false); }
        return true;
    }

    // ------------------------------------------------------------------ closed loop

    public async Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightStepVia stepVia, SightDriveOptions options, GestureToken gesture, CancellationToken ct = default)
    {
        var t0 = _time.GetUtcNow();
        TimeSpan Elapsed() => _time.GetUtcNow() - t0;
        var (ok, t, e, reason) = Check(gesture, GestureUse.Drive);
        if (!ok) return new SightDriveResult(SightDriveStatus.Refused, null, null, 0, reason, Elapsed());
        var readout = t!.Recipe.Readout(readoutId);
        if (readout is null || readout.Kind is not (ReadoutKind.Number or ReadoutKind.Percent))
            return new SightDriveResult(SightDriveStatus.Refused, null, null, 0, $"'{readoutId}' is not a numeric readout of {t.Recipe.Id}", Elapsed());
        CompiledControl? control = null;
        if (stepVia is SightControlSteps cs)
        {
            control = t.Recipe.Control(cs.ControlId) ?? t.Recipe.Controls.FirstOrDefault(c => c.RegionId == cs.ControlId);
            if (control is null || control.Kind == ControlKind.Button)
                return new SightDriveResult(SightDriveStatus.Refused, null, null, 0, $"'{cs.ControlId}' is not an adjustable control", Elapsed());
        }
        var tol = Math.Max(0, options.Tolerance);
        var maxSteps = Math.Clamp(options.MaxSteps, 1, 96);
        var timeout = TimeSpan.FromMilliseconds(Math.Clamp(options.TimeoutMs, 100, 60_000));
        var learnKey = LearnKey(t, readout, stepVia);
        return await Exclusive(true, async token =>
        {
            var wall = Stopwatch.StartNew();
            var (start, noRead) = await FreshNumberAsync(e!, readout, _time.GetUtcNow(), token).ConfigureAwait(false);
            if (start is not { } cur)
            {
                if (options.Fallback == SightDriveFallback.Counted && control is not null && Counted(control.Id) is var n && n != 0)
                {
                    var dirUndo = n > 0 ? SightAdjustDirection.Decrease : SightAdjustDirection.Increase;
                    var undo = await AdjustCoreAsync(t, e!, control, dirUndo, Math.Min(Math.Abs(n), maxSteps), MethodOf(stepVia), token).ConfigureAwait(false);
                    var status = undo.Status switch
                    {
                        SightActStatus.Done => SightDriveStatus.CountedFallback,
                        SightActStatus.NotFound => SightDriveStatus.NotFound,
                        SightActStatus.WindowChanged => SightDriveStatus.WindowChanged,
                        _ => SightDriveStatus.InputFailed,
                    };
                    return new SightDriveResult(status, null, null, undo.Steps, status == SightDriveStatus.CountedFallback
                        ? $"no reading: undid {undo.Steps} counted step(s) (inferred, not observed)" : undo.Reason, Elapsed());
                }
                return new SightDriveResult(SightDriveStatus.NoReading, null, null, 0, noRead, Elapsed());
            }
            var startValue = cur;
            if (Math.Abs(target - cur) <= tol)
            {
                if (control is not null) ResetLedger(control.Id);   // observed at the target: the counted baseline restarts here
                return new SightDriveResult(SightDriveStatus.AlreadyThere, startValue, cur, 0, null, Elapsed());
            }
            // The prior step size: given, else confirmed by an earlier drive. Neither is trusted until THIS drive's probe
            // agrees with it within 50% (A-H2: a stale estimate once sent 24 presses blind).
            var prior = options.StepSize is > 0 ? options.StepSize : _learnedStep.TryGetValue(learnKey, out var learned) ? learned : (double?)null;
            if (_safe)
            {
                var plan = prior is > 0 ? (int)Math.Clamp(Math.Round(Math.Abs(target - cur) / prior.Value), 1, maxSteps) : 1;
                var dirPlan = target > cur ? 1 : -1;
                await StepOnceAsync(t, e!, stepVia, control, dirPlan, plan, token).ConfigureAwait(false);
                _log.Info($"[safe mode] drive '{readout.Id}' {cur} → {target}: would send {plan} step(s); logged, not sent");
                return new SightDriveResult(SightDriveStatus.SafeMode, startValue, null, plan, "safe mode: the planned steps were logged, not sent", Elapsed());
            }
            double? step = prior;
            var confirmed = false;
            int sent = 0, stalls = 0, flips = 0, lastDir = 0, budget = maxSteps;
            SightDriveResult Stop(SightDriveStatus s, double? final, string? why) => new(s, startValue, final, sent, why, Elapsed());
            while (true)
            {
                var err = target - cur;
                if (Math.Abs(err) <= tol)
                {
                    if (confirmed && step is { } ok1) _learnedStep[learnKey] = ok1;
                    if (control is not null) ResetLedger(control.Id);
                    return Stop(SightDriveStatus.Converged, cur, null);
                }
                if (Elapsed() > timeout || wall.Elapsed > timeout + WallCap) return Stop(SightDriveStatus.Timeout, cur, "timed out");
                if (sent >= budget)
                    return Stop(SightDriveStatus.Timeout, cur, budget < maxSteps ? $"press budget used up ({budget}: the expected distance plus a margin)" : $"step budget ({maxSteps}) used up");
                var dir = err > 0 ? 1 : -1;
                if (lastDir != 0 && dir != lastDir && ++flips > 2) return Stop(SightDriveStatus.Stalled, cur, "oscillating around the target (step larger than the tolerance?)");
                var needed = step is > 0 ? Math.Max(1, (int)Math.Round(Math.Abs(err) / step.Value)) : 1;
                // Probe first: until this drive confirmed the step size, 1–3 presses and never more than half the
                // estimated distance; then at most MaxBatch presses between two reads.
                var n = confirmed ? Math.Min(needed, MaxBatch) : step is > 0 ? Math.Clamp(needed / 2, 1, 3) : 1;
                n = Math.Max(1, Math.Min(n, budget - sent));
                var stepped = await StepOnceAsync(t, e!, stepVia, control, dir, n, token).ConfigureAwait(false);
                sent += stepped.Steps;
                switch (stepped.Status)
                {
                    case SightActStatus.WindowChanged: return Stop(SightDriveStatus.WindowChanged, cur, stepped.Reason);
                    case SightActStatus.NotFound: return Stop(SightDriveStatus.NotFound, cur, stepped.Reason);
                    case SightActStatus.Done when stepped.Steps > 0: break;
                    default: return Stop(SightDriveStatus.InputFailed, cur, stepped.Reason ?? "input refused");
                }
                lastDir = dir;
                await Task.Delay(Math.Clamp(options.SettleMs, 0, 2000), token).ConfigureAwait(false);
                var (next, lost) = await FreshNumberAsync(e!, readout, _time.GetUtcNow(), token).ConfigureAwait(false);
                if (next is not { } nv) return Stop(SightDriveStatus.NoReading, cur, "lost the reading after stepping: " + lost);
                var delta = nv - cur;
                if (Math.Abs(delta) < 1e-9)
                {
                    if (++stalls >= 2) return Stop(SightDriveStatus.Stalled, cur, "the value stopped changing");
                    continue;
                }
                stalls = 0;
                if (Math.Sign(delta) != dir) return Stop(SightDriveStatus.Diverged, nv, "the value moved the wrong way: stopped");
                var newErr = target - nv;
                var observed = Math.Abs(delta) / stepped.Steps;
                // Stop when the error grows (decision 3): never keep pressing past the target.
                if (Math.Abs(newErr) > Math.Abs(err) + 1e-9)
                    return Stop(SightDriveStatus.Overshot, nv, $"the error grew ({Math.Abs(err):0.##} → {Math.Abs(newErr):0.##}): one step ({observed:0.##}) is larger than the distance; stopped");
                if (step is > 0 && Math.Abs(observed - step.Value) > 0.5 * step.Value)
                {
                    _log.Info($"drive '{readout.Id}': the step estimate {step.Value:0.##} is off by more than 50% (observed {observed:0.##}): rejected, probing again");
                    _learnedStep.TryRemove(learnKey, out _);
                    step = observed;
                    confirmed = false;   // probe again; the press budget never grows back
                }
                else if (step is > 0)
                {
                    step = confirmed ? step.Value * 0.5 + observed * 0.5 : observed;
                    if (!confirmed)
                    {
                        confirmed = true;
                        // Bound the presses: the expected distance from the start plus a margin (only ever tightened).
                        var expected = (int)Math.Ceiling(Math.Abs(target - startValue) / step.Value - 1e-9);
                        budget = Math.Min(budget, Math.Max(sent + 1, expected + Math.Max(2, (int)Math.Ceiling(expected * 0.25))));
                    }
                    _learnedStep[learnKey] = step.Value;
                }
                else step = observed;
                cur = nv;
            }
        }, () => new SightDriveResult(SightDriveStatus.Cancelled, null, null, 0, "cancelled by a newer gesture", Elapsed()), ct).ConfigureAwait(false);
    }

    /// <summary>Learned step sizes are per recipe, readout and the way of stepping (chords vs a control).</summary>
    private static string LearnKey(SightTarget t, CompiledReadout r, SightStepVia via) => $"{t.Recipe.Id}|{r.Id}|" + via switch
    {
        SightChordSteps c => $"chords:{string.Join("+", c.Increase)}/{string.Join("+", c.Decrease)}:{c.Mode}",
        SightControlSteps s => $"control:{s.ControlId}:{s.Method}",
        _ => "?",
    };

    private static AdjustMethod Map(SightAdjustMethod m) => m switch
    {
        SightAdjustMethod.Buttons => AdjustMethod.Buttons, SightAdjustMethod.Drag => AdjustMethod.Drag, SightAdjustMethod.Wheel => AdjustMethod.Wheel, _ => AdjustMethod.Auto,
    };

    /// <summary>The chord form of the contract (also a default member of <see cref="ISightControl"/>).</summary>
    public Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightChordSteps stepChords, double tolerance, GestureToken gesture, CancellationToken ct = default)
        => DriveToAsync(readoutId, target, stepChords, new SightDriveOptions(Tolerance: tolerance), gesture, ct);

    private static SightAdjustMethod MethodOf(SightStepVia via) => via is SightControlSteps c ? c.Method : SightAdjustMethod.Auto;

    private async Task<SightActResult> StepOnceAsync(SightTarget t, SightEngine e, SightStepVia via, CompiledControl? control, int dir, int n, CancellationToken ct)
    {
        if (via is SightChordSteps chords)
        {
            var (sent, status, why) = await ChordStepsAsync(t, chords, dir > 0, n, ct).ConfigureAwait(false);
            return new SightActResult(status, why, sent, Method: "chord");
        }
        return await AdjustCoreAsync(t, e, control!, dir > 0 ? SightAdjustDirection.Increase : SightAdjustDirection.Decrease, n, MethodOf(via), ct).ConfigureAwait(false);
    }

    // ------------------------------------------------------------------ reading helpers

    private async Task<(Imaging.PixelRect? Box, double Score)> LocateAsync(SightEngine e, SightTarget t, CompiledControl control, CancellationToken ct)
    {
        var region = t.Recipe.Region(control.RegionId)!.Index;
        // A slider's handle lives in its own region: read it fresh too (it moves with every step).
        IReadOnlyCollection<int> regions = control.Slider?.HandleDetector is { } hd ? [region, e.Recipe.Detectors[hd].RegionIndex] : [region];
        var since = _time.GetUtcNow();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            if (!_live.CanRead) break;
            if (!await _live.FreshAsync(regions, TimeSpan.FromMilliseconds(400), ct).ConfigureAwait(false)) { await Task.Delay(15, ct).ConfigureAwait(false); continue; }
            var s = e.Latest(control.LocateDetector);
            if (s is null || s.At < since) continue;
            var score = s.Result.Number ?? 0;
            return score >= control.MinScore && s.ContentBox is { } box ? (box, score) : (null, score);
        }
        return (null, 0);
    }

    /// <summary>
    /// A reading taken after <paramref name="notBefore"/> that a closed loop may act on (lead decision 3): the readout's
    /// context is active (M6), the detector reports full confidence (no dropped character; a calibrated read or both OCR
    /// engines agreeing, cross-checked on every read while this runs), score ≥ 0.6, inside the readout's range, and for
    /// OCR confirmed by a second identical read. Otherwise null and why.
    /// </summary>
    private async Task<(double? Value, string Why)> FreshNumberAsync(SightEngine e, CompiledReadout r, DateTimeOffset notBefore, CancellationToken ct)
    {
        var det = e.Recipe.Detectors[r.Detector];
        // A cold default glyph set builds first, outside the read budget.
        if (det is OcrDetector { Engine: not OcrEngineMode.Windows, Glyphs: null }) await GlyphSet.WarmDefaultAsync().WaitAsync(ct).ConfigureAwait(false);
        var needed = det.Kind == DetectorKind.Ocr ? 2 : 1;
        double? last = null;
        var count = 0;
        var after = notBefore;
        var why = $"no fresh, confident reading of '{r.Id}'";
        using var strict = e.Strict([det.RegionIndex]);
        var start = _time.GetUtcNow();
        var wall = Stopwatch.StartNew();
        while (_time.GetUtcNow() - start < ReadBudget && wall.Elapsed < WallCap)
        {
            if (!_live.CanRead) return (null, $"no reading of '{r.Id}': Sight is not reading the game right now (paused or no capture)");
            if (!await _live.FreshAsync([det.RegionIndex], TimeSpan.FromMilliseconds(300), ct).ConfigureAwait(false)) { await Task.Delay(15, ct).ConfigureAwait(false); continue; }
            var s = e.Latest(r.Detector);
            if (s is null || s.At < after) continue;
            after = s.At + TimeSpan.FromTicks(1);
            if (!e.InContext(r))
            {
                count = 0;
                last = null;
                why = $"'{r.Id}' is out of its context ({string.Join(", ", r.Contexts)} is not active): not read";
                continue;
            }
            var res = s.Result;
            double? v = res is { Present: true, Number: { } num } && res.Score >= 0.6 && res.FullConfidence ? num : null;
            if (v is null && res is { Present: true, Number: not null } && !res.FullConfidence)
                why = $"'{r.Id}' was read with less than full confidence ({res.Note}): a closed loop needs a calibrated read or both OCR engines agreeing";
            if (v is { } d && r.Precision is { } p) v = Math.Round(d, p, MidpointRounding.AwayFromZero);
            if (v is { } dv && ((r.Min is { } mn && dv < mn) || (r.Max is { } mx && dv > mx))) v = null;
            if (v is null) { count = 0; last = null; continue; }
            if (last is { } l && Math.Abs(l - v.Value) < 1e-9) count++;
            else { last = v; count = 1; }
            if (count >= needed) return (v, "ok");
        }
        return (null, why);
    }

    private static MouseOptions Options(SightTarget t, int intervalMs = 40) =>
        new() { ExpectedHwnd = t.Hwnd, RequireForeground = true, RestoreCursor = true, MinInterval = TimeSpan.FromMilliseconds(Math.Clamp(intervalMs, 10, 1000)) };

    private bool ToScreen(SightTarget t, Imaging.PixelRect box, ControlPoint p, out PointI pt) =>
        _live.ContentToScreen(box.X + p.X * box.W, box.Y + p.Y * box.H, out pt);

    private SightActResult Refuse(string reason)
    {
        _log.Info("refused: " + reason);
        return new SightActResult(SightActStatus.Refused, reason);
    }

    public void Dispose()
    {
        TryCancel(Interlocked.Exchange(ref _currentDrive, null));
        _one.Dispose();
    }
}
