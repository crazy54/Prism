using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Macros.Art;
using PrismControl.Macros.Engine;

namespace PrismControl.Macros.Actions;

public sealed class MacroDialSettings
{
    public string? Label { get; set; }
    /// <summary>Runs once per step when the dial turns right (clockwise).</summary>
    [JsonConverter(typeof(MacroStepJsonConverter))]
    public MacroStep? Right { get; set; }
    /// <summary>Runs once per step when the dial turns left.</summary>
    [JsonConverter(typeof(MacroStepJsonConverter))]
    public MacroStep? Left { get; set; }
    /// <summary>Runs on a short push (and a tap on the Stream Deck + strip).</summary>
    public MacroScript Push { get; set; } = new();
    /// <summary>Ticks per step (1-12). The Galleon reports a fast spin as up to ±12 ticks at once; 2-3 tames it.</summary>
    public int TicksPerStep { get; set; } = 1;
}

/// <summary>
/// A dial for the Galleon 100 SD and the Stream Deck +: turning repeats a step per tick (Ctrl+Plus / Ctrl+Minus, arrows,
/// media volume...), a short push runs a macro. Everything is reachable with rotate + short push; the Plus strip tap is an
/// extra that does the same as a push. No long-press (the Galleon never sends one).
/// <para>
/// <b>Overlap rule for dials:</b> ticks are not dropped like key presses; they coalesce into a signed count of pending steps
/// (capped at ±<see cref="MaxPendingSteps"/>, so a wild spin cannot queue a minute of input) that one background lane drains
/// in order. Turning back drops the steps still pending the other way. A push is queued once (a push while one is pending is ignored) and runs after the pending turn steps.
/// </para>
/// <para>
/// Launch steps follow the keys' trust rules: untrusted ones never run ("REVIEW IN SETTINGS" in the frame), and one that
/// always asks first runs from a push only, after a second push within <see cref="LaunchTrust.ConfirmWindow"/>
/// (a turn is never a confirmation).
/// </para>
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.dial", Name = "Macro Dial",
    Icon = "imgs/actions/macros/dial/icon", KeyImage = "imgs/actions/macros/dial/key", EncoderIcon = "imgs/actions/macros/dial/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path,
    Tooltip = "Turn to repeat a step per tick (zoom, arrows, volume...). Push to run a macro.",
    TriggerRotate = "Repeat a step per tick", TriggerPush = "Run the push macro", TriggerTouch = "Run the push macro",
    PropertyInspector = MacroPi.Page)]
public sealed class MacroDial : DialAction<MacroDialSettings>, IMacroRunHost, IAsyncDisposable
{
    public const int MaxPendingSteps = 24;
    public const int MaxTicksPerStep = 12;
    private static readonly TimeSpan Parked = TimeSpan.FromHours(1);
    private static readonly TimeSpan Turning = TimeSpan.FromMilliseconds(250);

    private readonly object _gate = new();
    private readonly LaunchEdits _edits = new();
    private int _pendingSteps, _tickRemainder;
    private MacroStep? _right, _left;
    private MacroScript? _pushQueued;
    private bool _pushQueuedConfirmed;
    private bool _draining;
    private Task _drain = Task.CompletedTask;
    private CancellationTokenSource? _cts;
    private RenderLoop? _loop;
    private int _lastDirection;
    private bool _pushArmed;
    private long _pushArmedAt;
    private string _status = "Ready.";

    internal string Status => _status;
    /// <summary>What the frame shows besides the rows: idle, confirm, fix or review (for tests).</summary>
    internal string Face { get; private set; } = "";

    public bool IsRunning { get { lock (_gate) return _draining; } }

    public Task WhenIdleAsync()
    {
        Task t;
        lock (_gate) t = _drain;
        return t.ContinueWith(_ => { }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
    }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _edits.Observe(Scripts()); // launch steps that came with the profile are not trusted by being there
        SetFeedbackLayout(Layouts.Canvas.Path);
        // Redraws right away on input, at 4 Hz while being turned (frames only change when the lit row does), parked when idle.
        _loop = StartRenderLoop(Render, Parked, Turning);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        CancelLane();
        _pushArmed = false;
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        _edits.Observe(Scripts());
        var tps = Math.Clamp(Settings.TicksPerStep, 1, MaxTicksPerStep);
        int steps;
        lock (_gate)
        {
            _right = Settings.Right;
            _left = Settings.Left;
            if (Math.Sign(_tickRemainder) != 0 && Math.Sign(_tickRemainder) != Math.Sign(e.Ticks)) _tickRemainder = 0;
            _tickRemainder += e.Ticks;
            steps = _tickRemainder / tps;
            _tickRemainder -= steps * tps;
            if (steps != 0)
            {
                if (Math.Sign(_pendingSteps) != 0 && Math.Sign(_pendingSteps) != Math.Sign(steps)) _pendingSteps = 0; // turned back: drop the rest
                _pendingSteps = Math.Clamp(_pendingSteps + steps, -MaxPendingSteps, MaxPendingSteps);
            }
        }
        if (steps != 0)
        {
            _lastDirection = Math.Sign(steps);
            Pump();
        }
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        QueuePush();
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        QueuePush();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(MacroDialSettings settings)
    {
        // From this PC's property inspector: launch steps added or changed there are trusted as saved (see MacroKeyBase).
        if (Services.TryGet<MacroEngine>(out var engine))
        {
            var n = _edits.TrustNew(engine, Scripts());
            if (n > 0) Log.Info($"{ActionUuid}: trusted {n} launch step(s) edited in this PC's settings.");
        }
        else _edits.Observe(Scripts());
        _pushArmed = false;
        Render();
        PushState();
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult(type == "macros.trust" ? TrustFromPi(data) : MacroPi.Handle(type, data));

    protected override object? DescribeState()
    {
        var o = new JsonObject
        {
            ["right"] = Settings.Right is { } r ? MacroStep.SafeDescribe(r) : null,
            ["left"] = Settings.Left is { } l ? MacroStep.SafeDescribe(l) : null,
            ["push"] = Settings.Push.Describe(),
        };
        return MacroPi.LaunchState(o, _status, LaunchChecks());
    }

    /// <summary>Every macro the dial can run: turn right, turn left (one step each) and push.</summary>
    private List<MacroScript> Scripts()
    {
        var s = Settings;
        var list = new List<MacroScript>(3);
        if (s.Right is { } r) list.Add(MacroScript.Of(r));
        if (s.Left is { } l) list.Add(MacroScript.Of(l));
        list.Add(s.Push);
        return list;
    }

    private List<LaunchCheck> LaunchChecks() =>
        Services.TryGet<MacroEngine>(out var engine) ? Scripts().SelectMany(engine.CheckLaunches).ToList() : [];

    private void QueuePush()
    {
        _edits.Observe(Scripts());
        // A second push within the window confirms a launch that always asks first; a turn never does.
        var confirmed = _pushArmed && Time.GetElapsedTime(_pushArmedAt) < LaunchTrust.ConfirmWindow;
        lock (_gate)
        {
            if (_pushQueued is not null) return;
            _pushQueued = Settings.Push;
            _pushQueuedConfirmed = confirmed;
        }
        _pushArmed = false;
        Pump();
    }

    private void Pump()
    {
        if (!Services.TryGet<MacroEngine>(out var engine))
        {
            lock (_gate) { _pendingSteps = 0; _pushQueued = null; }
            _status = "The macro engine is not running (see the plugin log).";
            ShowAlert();
            return;
        }
        var safeMode = SafeMode; // safe mode: the lane's runs use the engine's dry-run effects
        lock (_gate)
        {
            if (_draining) return; // the running lane picks the new work up
            _draining = true;
            _cts?.Dispose();
            _cts = new CancellationTokenSource();
            var token = _cts.Token;
            var time = Time;
            _drain = Task.Run(() => DrainAsync(engine, time, safeMode, token));
        }
    }

    private async Task DrainAsync(MacroEngine engine, TimeProvider time, bool safeMode, CancellationToken ct)
    {
        var finished = false;
        try
        {
            while (true)
            {
                MacroScript? script;
                string gesture;
                var confirmed = false;
                lock (_gate)
                {
                    if (ct.IsCancellationRequested) { _pendingSteps = 0; _pushQueued = null; }
                    if (_pendingSteps != 0)
                    {
                        var dir = Math.Sign(_pendingSteps);
                        _pendingSteps -= dir;
                        var step = dir > 0 ? _right : _left;
                        script = step is null ? new MacroScript() : MacroScript.Of(step);
                        gesture = dir > 0 ? "turn right" : "turn left";
                    }
                    else if (_pushQueued is { } push)
                    {
                        _pushQueued = null;
                        script = push;
                        gesture = "push";
                        confirmed = _pushQueuedConfirmed;
                        _pushQueuedConfirmed = false;
                    }
                    else
                    {
                        _draining = false;
                        finished = true;
                        return;
                    }
                }
                if (!script.HasSteps) continue; // nothing set for that direction or push: a no-op, not an error
                var result = await engine.RunAsync(script, new MacroRunOptions { Time = time, Source = "dial " + gesture, SafeMode = safeMode, Confirmed = confirmed }, ct)
                    .ConfigureAwait(false);
                if (result.Status == MacroRunStatus.Completed) continue;
                // Blocked or failing: drop what is pending (do not keep typing into the wrong window) and say why once.
                lock (_gate) { _pendingSteps = 0; _tickRemainder = 0; }
                if (result.Status == MacroRunStatus.Cancelled) continue;
                var g = gesture;
                Post(() => Report(result, g));
            }
        }
        catch (Exception ex)
        {
            Post(() => Report(new MacroRunResult(MacroRunStatus.Failed, 0, 0, null, $"Unexpected error ({ex.GetType().Name})."), "?"));
        }
        finally
        {
            // However the lane ends, it can start again: a dial must never go deaf.
            if (!finished)
                lock (_gate) { _draining = false; _pendingSteps = 0; _pushQueued = null; }
        }
    }

    private void Report(MacroRunResult r, string gesture)
    {
        _status = r.Describe();
        if (r.Status == MacroRunStatus.NeedsConfirmation)
        {
            if (gesture == "push")
            {
                // Not an error: the next push within the window runs it.
                _pushArmed = true;
                _pushArmedAt = Time.GetTimestamp();
                _status += string.Create(CultureInfo.InvariantCulture, $" Push again within {LaunchTrust.ConfirmWindow.TotalSeconds:0} s to run it.");
                Render();
                PushState();
                return;
            }
            _status += " Turning the dial cannot confirm it: put it on the push list or on a key.";
        }
        ShowAlert();
        Render();
        PushState();
    }

    private void Render()
    {
        var s = Settings;
        var configured = s.Right is not null || s.Left is not null || s.Push.HasSteps;
        var label = !string.IsNullOrWhiteSpace(s.Label) ? s.Label! : "Macro dial";
        Face = "idle";
        if (_pushArmed && Time.GetElapsedTime(_pushArmedAt) >= LaunchTrust.ConfirmWindow) _pushArmed = false;
        if (_pushArmed)
        {
            Face = "confirm";
            label = "Push again to run";
        }
        else if (configured)
        {
            var scripts = Scripts();
            if (scripts.Any(x => x.HasSteps && x.Validate().Count > 0))
            {
                Face = "fix";
                label = "Fix in settings";
            }
            else if (LaunchChecks().Any(c => !c.Trusted))
            {
                Face = "review";
                label = "Review in settings";
            }
        }
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, configured
            ? MacroArt.Dial(Theme, label, Describe(s.Right), Describe(s.Left), s.Push.HasSteps ? s.Push.Describe() : null, _lastDirection, IsInteractive)
            : MacroArt.Dial(Theme, label, null, null, null, 0, false)));
        if (_loop is { } loop)
        {
            var idle = _pushArmed ? LaunchTrust.ConfirmWindow - Time.GetElapsedTime(_pushArmedAt) : Parked;
            if (idle <= TimeSpan.Zero) idle = Parked;
            if (loop.IdleInterval != idle) loop.IdleInterval = idle;
        }
    }

    private static string? Describe(MacroStep? step) => step is null ? null : MacroStep.SafeDescribe(step);

    private object? TrustFromPi(JsonNode? data)
    {
        var n = Services.TryGet<MacroEngine>(out var engine) ? LaunchEdits.TrustShown(engine, Scripts(), data) : 0;
        if (n > 0)
        {
            Log.Info($"{ActionUuid}: trusted {n} launch step(s) with the Trust button.");
            _status = "Trusted on this PC.";
        }
        Render();
        PushState();
        return DescribeState();
    }

    private void PushState()
    {
        if (IsPropertyInspectorVisible) SendToPropertyInspector("pi.state", DescribeState());
    }

    private void CancelLane()
    {
        lock (_gate)
        {
            _pendingSteps = 0;
            _pushQueued = null;
            try { _cts?.Cancel(); }
            catch (ObjectDisposedException) { }
        }
    }

    public async ValueTask DisposeAsync()
    {
        CancelLane();
        try { await WhenIdleAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (TimeoutException) { }
    }
}
