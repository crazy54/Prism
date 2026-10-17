using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Macros.Art;
using PrismControl.Macros.Engine;

namespace PrismControl.Macros.Actions;

/// <summary>Lets tests wait for an action's background macro work.</summary>
internal interface IMacroRunHost
{
    bool IsRunning { get; }
    Task WhenIdleAsync();
}

/// <summary>
/// Shared behavior of the macro keys: run a macro on the engine's background task when pressed (key down, so there is no
/// added latency), never overlapping itself (<see cref="MacroRunner"/>: presses while it runs are ignored), a progress beat
/// on the key while a run takes longer than a moment, an alert (and the reason in the log and the PI) when it could not run.
/// <para>
/// Faces, in order: running (the beat), "press again" (a launch that always asks first, for <see cref="LaunchTrust.ConfirmWindow"/>),
/// "fix in settings" (a step that cannot run as saved), "review in settings" (a launch step not trusted on this PC), then the
/// key's own face. Each is drawn once; the render loop is parked except while running or waiting for the second press.
/// </para>
/// </summary>
public abstract class MacroKeyBase<TSettings> : KeyAction<TSettings>, IMacroRunHost, IAsyncDisposable where TSettings : class, new()
{
    private static readonly TimeSpan Parked = TimeSpan.FromHours(1);
    /// <summary>The beat: the running face alternates its hue index twice a second (well inside the 10 Hz per-key cap).</summary>
    internal static readonly TimeSpan BeatInterval = TimeSpan.FromMilliseconds(500);
    /// <summary>Runs shorter than this never show the running face (a hotkey takes about a millisecond).</summary>
    internal static readonly TimeSpan RunningFaceDelay = TimeSpan.FromMilliseconds(150);

    private readonly LaunchEdits _edits = new();
    private MacroRunner? _runner;
    private RenderLoop? _loop;
    private MacroProgress _progress;
    private long _runStarted;
    // Owned by the mailbox: set when a run starts, cleared by its Finish. Never inferred from the runner task (its completion
    // races with Finish, which used to leave the key on the running face for up to an hour).
    private bool _running;
    private int _runId;
    private string? _armedGesture, _armedName;
    private long _armedAt;
    private bool _renderFailed;
    private string _status = "Ready.";

    internal MacroRunner Runner => _runner ??= new MacroRunner();
    bool IMacroRunHost.IsRunning => Runner.IsRunning;
    Task IMacroRunHost.WhenIdleAsync() => Runner.WhenIdleAsync();

    /// <summary>The last run's outcome, as the PI shows it.</summary>
    internal string Status => _status;
    /// <summary>The face on the key: idle, running, confirm, fix or review (for tests).</summary>
    internal string Face { get; private set; } = "";

    /// <summary>For the log ("hotkey", "macro").</summary>
    protected abstract string Source { get; }
    /// <summary>The macro a press runs (empty = not set up yet).</summary>
    protected abstract MacroScript PressScript();
    /// <summary>Every macro the key can run: the trust check and the "fix in settings" face cover all of them.</summary>
    protected virtual IEnumerable<MacroScript> Scripts() => [PressScript()];
    protected abstract SvgDocument IdleFace();
    /// <summary>The face for a macro that cannot run as saved (default: "FIX IN SETTINGS").</summary>
    protected virtual SvgDocument FixFace() => MacroArt.Notice(Theme, NoticeKind.Fix);
    /// <summary>The label on the running face.</summary>
    protected virtual string RunningLabel => Source;
    /// <summary>Show the app's check mark after a successful run (the Macro key does; a hotkey would be noisy).</summary>
    protected virtual bool ShowOkWhenDone => false;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // Launch steps that arrive with the profile are not trusted by being there; only edits made in this PC's PI are.
        _edits.Observe(SafeScripts());
        // One long-lived loop per key: parked (hourly) while idle, the beat interval while a macro runs. Its first tick draws now.
        _loop = StartRenderLoop(RenderFace, Parked, Parked);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Runner.Cancel();
        _armedGesture = null;
        return Task.CompletedTask;
    }

    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        Run(PressScript(), "press");
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(TSettings settings)
    {
        // didReceiveSettings comes from the property inspector on this PC: launch steps added or changed there are the
        // user's own, so they are trusted as saved. Unchanged ones (an imported profile re-saved) are not.
        TrustEditedLaunches();
        _armedGesture = null;
        RenderFace();
        PushState();
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult(type == "macros.trust" ? TrustFromPi(data) : MacroPi.Handle(type, data));

    protected override object? DescribeState() => PiState(new JsonObject { ["summary"] = PressScript().Describe() });

    /// <summary>The PI state every macro key shares (status, launches and trust), plus the key's own fields.</summary>
    protected JsonObject PiState(JsonObject own) => MacroPi.LaunchState(own, _status, LaunchChecks());

    /// <summary>Starts <paramref name="script"/> unless this key's macro is already running (then the press is ignored).</summary>
    protected void Run(MacroScript script, string gesture)
    {
        _edits.Observe(SafeScripts()); // settings that came with this event (not from the PI) are not trusted by it
        if (!Services.TryGet<MacroEngine>(out var engine))
        {
            _status = "The macro engine is not running (see the plugin log).";
            Log.Error($"{ActionUuid}: no MacroEngine service; did the macros module fail to start?");
            ShowAlert();
            PushState();
            return;
        }
        var time = Time;
        var source = $"{Source} {gesture}";
        // The second press of the same gesture within the window confirms a launch that always asks first.
        var confirmed = _armedGesture == gesture && time.GetElapsedTime(_armedAt) < LaunchTrust.ConfirmWindow;
        var safeMode = SafeMode; // safe mode: this run uses the engine's dry-run effects, whatever the engine was built with
        var id = _runId + 1;
        var started = Runner.TryStart(async ct =>
        {
            MacroRunResult result;
            try
            {
                result = await engine.RunAsync(script, new MacroRunOptions
                {
                    Time = time,
                    Source = source,
                    SafeMode = safeMode,
                    Confirmed = confirmed,
                    Progress = p => Post(() => { if (id == _runId) _progress = p; }),
                }, ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                result = new MacroRunResult(MacroRunStatus.Failed, 0, script.Steps.Count, null, $"Unexpected error ({ex.GetType().Name}).");
            }
            // Always report back, however the run ended: Finish is what parks the loop and redraws the idle face.
            Post(() => Finish(result, id, gesture, script));
        });
        if (!started)
        {
            Log.Debug($"{source}: ignored, the previous run is still going.");
            return;
        }
        _armedGesture = null;
        _runId = id;
        _running = true;
        _runStarted = time.GetTimestamp();
        _progress = new MacroProgress(0, script.Steps.Count, "");
        SetCadence();
    }

    private void Finish(MacroRunResult r, int id, string gesture, MacroScript script)
    {
        if (id == _runId) _running = false;
        _status = r.Describe();
        switch (r.Status)
        {
            case MacroRunStatus.Completed:
                if (ShowOkWhenDone) ShowOk();
                break;
            case MacroRunStatus.Cancelled or MacroRunStatus.Busy:
                break;
            case MacroRunStatus.NeedsConfirmation:
                // Not an error: the next press of the same gesture within the window runs it.
                _armedGesture = gesture;
                _armedAt = Time.GetTimestamp();
                _armedName = r.FailedStep is int i && i < script.Steps.Count && script.Steps[i] is ILaunchStep ls ? SafeName(ls) : null;
                _status = r.Describe() + string.Create(CultureInfo.InvariantCulture, $" Press again within {LaunchTrust.ConfirmWindow.TotalSeconds:0} s to run it.");
                break;
            default:
                ShowAlert();
                break;
        }
        RenderFace();
        PushState();
    }

    private void RenderFace()
    {
        SvgDocument face;
        try { face = CurrentFace(); }
        catch (Exception ex)
        {
            // A null or odd value in imported settings must never break the key: show "fix in settings" instead.
            if (!_renderFailed) Log.Warn($"{ActionUuid}: the key face could not be drawn ({ex.GetType().Name}); showing \"fix in settings\".");
            _renderFailed = true;
            Face = "fix";
            face = MacroArt.Notice(Theme, NoticeKind.Fix);
        }
        SetImage(face);
        SetCadence();
    }

    private SvgDocument CurrentFace()
    {
        if (_running && Time.GetElapsedTime(_runStarted) >= RunningFaceDelay)
        {
            Face = "running";
            var beat = Time.GetElapsedTime(_runStarted).Ticks / BeatInterval.Ticks % 2 == 1;
            return MacroArt.Running(Theme, RunningLabel, _progress.StepIndex, _progress.StepCount, beat);
        }
        if (_armedGesture is not null)
        {
            if (Time.GetElapsedTime(_armedAt) < LaunchTrust.ConfirmWindow)
            {
                Face = "confirm";
                return MacroArt.Notice(Theme, NoticeKind.Confirm, _armedName);
            }
            _armedGesture = null; // the window passed: the next press asks again
        }
        switch (Readiness())
        {
            case NoticeKind.Fix:
                Face = "fix";
                return FixFace();
            case NoticeKind.Review:
                Face = "review";
                return MacroArt.Notice(Theme, NoticeKind.Review);
            default:
                Face = "idle";
                return IdleFace();
        }
    }

    /// <summary>Fix when a configured macro cannot run as saved; Review when a launch step is not trusted here; else null.</summary>
    private NoticeKind? Readiness()
    {
        var scripts = SafeScripts();
        if (scripts.Any(s => s.HasSteps && s.Validate().Count > 0)) return NoticeKind.Fix;
        if (LaunchChecks(scripts).Any(c => !c.Trusted)) return NoticeKind.Review;
        return null;
    }

    private void SetCadence()
    {
        if (_loop is not { } loop) return;
        TimeSpan interval;
        if (_running) interval = BeatInterval;
        else if (_armedGesture is not null && LaunchTrust.ConfirmWindow - Time.GetElapsedTime(_armedAt) is var left && left > TimeSpan.Zero) interval = left;
        else interval = Parked;
        if (loop.IdleInterval != interval) loop.IdleInterval = interval;
        if (loop.ActiveInterval != interval) loop.ActiveInterval = interval;
    }

    private List<MacroScript> SafeScripts()
    {
        try { return Scripts().ToList(); }
        catch (Exception) { return []; }
    }

    private List<LaunchCheck> LaunchChecks(IEnumerable<MacroScript>? scripts = null) =>
        Services.TryGet<MacroEngine>(out var engine) ? (scripts ?? SafeScripts()).SelectMany(engine.CheckLaunches).ToList() : [];

    private void TrustEditedLaunches()
    {
        if (!Services.TryGet<MacroEngine>(out var engine))
        {
            _edits.Observe(SafeScripts());
            return;
        }
        var n = _edits.TrustNew(engine, SafeScripts());
        if (n > 0) Log.Info($"{ActionUuid}: trusted {n} launch step(s) edited in this PC's settings.");
    }

    private object? TrustFromPi(JsonNode? data)
    {
        var n = Services.TryGet<MacroEngine>(out var engine) ? LaunchEdits.TrustShown(engine, SafeScripts(), data) : 0;
        if (n > 0)
        {
            Log.Info($"{ActionUuid}: trusted {n} launch step(s) with the Trust button.");
            _status = "Trusted on this PC.";
        }
        RenderFace();
        PushState();
        return DescribeState();
    }

    private static string? SafeName(ILaunchStep step)
    {
        try { return step.ResolveSpec().DisplayName; }
        catch (Exception) { return null; }
    }

    private void PushState()
    {
        if (IsPropertyInspectorVisible) SendToPropertyInspector("pi.state", DescribeState());
    }

    public async ValueTask DisposeAsync()
    {
        Runner.Cancel();
        try { await Runner.WhenIdleAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (TimeoutException) { }
    }
}

/// <summary>
/// Which launch steps an action's settings held when it last looked, so the launches added or changed by a save in this PC's
/// property inspector can be told apart from those that came with the profile.
/// </summary>
internal sealed class LaunchEdits
{
    private HashSet<string> _seen = new(StringComparer.Ordinal);

    /// <summary>Remembers the current launch steps without trusting them.</summary>
    public void Observe(IEnumerable<MacroScript> scripts) => _seen = Ids(scripts);

    /// <summary>Trusts the launch steps that were not there before (edited in the PI), then remembers the current ones.</summary>
    public int TrustNew(MacroEngine engine, IEnumerable<MacroScript> scripts)
    {
        var list = scripts.ToList();
        var n = 0;
        foreach (var c in list.SelectMany(s => LaunchTrust.Check(LaunchTrust.None, s)))
            if (!_seen.Contains(c.Id) && engine.Trust.Trust(c.Spec)) n++;
        _seen = Ids(list);
        return n;
    }

    /// <summary>The Trust button: trusts the launch steps the PI showed (<c>{ ids: [...] }</c>; all current ones without ids).</summary>
    public static int TrustShown(MacroEngine engine, IEnumerable<MacroScript> scripts, JsonNode? data)
    {
        HashSet<string>? ids = data?["ids"] is JsonArray a
            ? a.Select(x => x is JsonValue v && v.TryGetValue<string>(out var s) ? s : null).OfType<string>().ToHashSet(StringComparer.Ordinal)
            : null;
        var n = 0;
        foreach (var c in scripts.SelectMany(engine.CheckLaunches))
            if ((ids is null || ids.Contains(c.Id)) && engine.Trust.Trust(c.Spec)) n++;
        return n;
    }

    private static HashSet<string> Ids(IEnumerable<MacroScript> scripts) =>
        scripts.SelectMany(s => LaunchTrust.Check(LaunchTrust.None, s)).Select(c => c.Id).ToHashSet(StringComparer.Ordinal);
}
