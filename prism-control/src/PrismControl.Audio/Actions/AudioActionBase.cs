using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;

namespace PrismControl.Audio;

/// <summary>
/// Shared plumbing for the audio actions: finds the engine (wrapped in <see cref="SafeAudioEngine"/> in safe mode), follows its changes (posted into the mailbox),
/// draws dials on the full-canvas layout, answers the device/app pickers of the property inspector, and pushes a
/// status line to an open PI.
/// </summary>
public abstract class AudioActionBase<TSettings> : DialAction<TSettings>, IDisposable where TSettings : class, new()
{
    private IAudioEngine? _engine;
    private bool _listening;
    private ITimer? _settleTimer;
    private string? _lastState;

    /// <summary>The engine, or null when the audio module is not loaded.</summary>
    protected IAudioEngine? Engine => _engine;

    /// <summary>The last view rendered (tests assert on it: text is drawn as paths).</summary>
    internal object? LastView { get; private set; }

    protected override async Task OnWillAppearAsync(WillAppearEvent e)
    {
        // Safe mode: writes go to SafeAudioEngine's overlay, never to Windows (the module's engine already is one; a
        // test or host that hands us a plain engine with SafeMode on gets the same protection).
        if (_engine is null && Services.TryGet<IAudioEngine>(out var engine)) _engine = SafeMode ? SafeAudioEngine.For(engine, Log) : engine;
        if (_engine is not null && !_listening)
        {
            _engine.Changed += OnEngineChanged;
            _listening = true;
        }
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        await OnAppearAsync(e).ConfigureAwait(false);
        Render();
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        StopListening();
        OnDisappear();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(TSettings settings)
    {
        OnSettingsApplied();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _lastState = null;
        return Task.CompletedTask;
    }

    /// <summary>After willAppear bookkeeping (engine bound, layout set); the base renders right after.</summary>
    protected virtual Task OnAppearAsync(WillAppearEvent e) => Task.CompletedTask;
    protected virtual void OnDisappear() { }
    protected virtual void OnSettingsApplied() { }

    /// <summary>Filter for engine changes (called on the engine thread: read only immutable/atomic fields).</summary>
    protected virtual bool IsRelevant(AudioChange change) => change.Kind != AudioChangeKind.Sessions;

    /// <summary>An engine change arrived (already in the mailbox).</summary>
    protected virtual void OnAudioChanged(AudioChange change) => Render();

    protected abstract void Render();

    private void OnEngineChanged(AudioChange change)
    {
        if (IsRelevant(change)) Post(() => OnAudioChanged(change));
    }

    private void StopListening()
    {
        if (_listening && _engine is not null) _engine.Changed -= OnEngineChanged;
        _listening = false;
    }

    // ---------------------------------------------------------------- frames

    protected void ShowKey(object view, SvgDocument frame)
    {
        LastView = view;
        SetImage(frame);
        PushState();
    }

    protected void ShowDial(object view, SvgDocument frame)
    {
        LastView = view;
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, frame));
        PushState();
    }

    /// <summary>Re-renders once the interactive window is over, so the "active" wash of a dial goes away.</summary>
    protected void SettleLater()
    {
        _settleTimer?.Dispose();
        _settleTimer = Time.CreateTimer(_ => Post(Render), null, ActiveWindow + TimeSpan.FromMilliseconds(100), Timeout.InfiniteTimeSpan);
    }

    private void PushState()
    {
        if (!IsPropertyInspectorVisible) return;
        var state = DescribeState();
        if (state is null) return;
        var json = JsonSerializer.Serialize(state, state.GetType(), ActionJson.Options);
        if (json == _lastState) return;
        _lastState = json;
        SendToPropertyInspector("pi.state", state);
    }

    // ---------------------------------------------------------------- engine writes

    /// <summary>Awaits an engine write; on failure logs it and shows the alert triangle.</summary>
    protected async Task RunAsync(Task write, string what)
    {
        try { await write.ConfigureAwait(false); }
        catch (Exception ex)
        {
            Log.Warn($"{ActionUuid}: {what} failed: {ex.Message}");
            ShowAlert();
            Render();
        }
    }

    protected static int ListStep(int ticks) => DialSteps.ListStep(ticks);

    protected static int ClampStep(int step) => DialSteps.ClampStep(step);

    // ---------------------------------------------------------------- property inspector

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) => type switch
    {
        "audio.outputs" => DeviceOptions(AudioFlow.Render, DeviceRef.DefaultOutput, DeviceRef.CommsOutput),
        "audio.inputs" => DeviceOptions(AudioFlow.Capture, DeviceRef.DefaultInput, DeviceRef.CommsInput),
        "audio.endpoints" => DeviceOptions(AudioFlow.Render, DeviceRef.DefaultOutput, DeviceRef.CommsOutput)
            .Concat(DeviceOptions(AudioFlow.Capture, DeviceRef.DefaultInput, DeviceRef.CommsInput).Skip(1)).ToList(),
        _ => await OnAudioPiMessageAsync(type, data).ConfigureAwait(false),
    };

    protected virtual Task<object?> OnAudioPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(null);

    /// <summary>The empty value means "the action's default"; it is listed first.</summary>
    protected virtual string EmptyOptionLabel(AudioFlow flow) => flow == AudioFlow.Render ? "Default output" : "Default input";

    /// <summary>The <see cref="DeviceRef"/> token an empty device setting stands for (not listed twice).</summary>
    protected virtual string DefaultRef => DeviceRef.DefaultOutput;

    /// <summary>Picker options: the action default, the follow-the-default tokens, then every active endpoint (full Windows name).</summary>
    protected List<PiOption> DeviceOptions(AudioFlow flow, params string[] tokens)
    {
        var list = new List<PiOption> { new("", EmptyOptionLabel(flow)) };
        foreach (var t in tokens.Where(t => t != DefaultRef)) list.Add(new(t, DeviceRef.Describe(t)));
        if (_engine is null) return list;
        var defaultId = _engine.GetDefaultId(flow, AudioRole.Console);
        foreach (var d in _engine.GetDevices(flow))
            list.Add(new(d.Id, d.FriendlyName + (d.Id == defaultId ? " · default" : "")));
        return list;
    }

    /// <summary>Keeps a configured but currently missing device selectable, so the PI does not silently clear it.</summary>
    protected List<PiOption> WithMissing(List<PiOption> options, params string?[] configured)
    {
        foreach (var c in configured)
            if (!string.IsNullOrWhiteSpace(c) && options.All(o => o.Value != c))
                options.Add(new(c, "(not connected) " + (c.Length > 24 ? c[..24] + "…" : c)));
        return options;
    }

    // ---------------------------------------------------------------- cleanup

    public void Dispose()
    {
        StopListening();
        _settleTimer?.Dispose();
        _settleTimer = null;
        DisposeCore();
        GC.SuppressFinalize(this);
    }

    protected virtual void DisposeCore() { }
}

/// <summary>How dial ticks turn into steps.</summary>
internal static class DialSteps
{
    /// <summary>List movement for a dial event: ±1 per Stream Deck + tick; Galleon's aggregated spins (up to ±12) move up to 3.</summary>
    public static int ListStep(int ticks) => ticks == 0 ? 0 : Math.Sign(ticks) * (1 + (Math.Abs(ticks) - 1) / 4);

    /// <summary>A volume step setting, kept sane (1-25 % per tick).</summary>
    public static int ClampStep(int step) => Math.Clamp(step, 1, 25);
}

/// <summary>One option of a PI select.</summary>
public sealed record PiOption(string Value, string Label);

/// <summary>Holds one meter lease and follows the device it should meter (reopening when the default moves).</summary>
internal sealed class MeterBinding(IAudioEngine engine) : IDisposable
{
    private IAudioMeter? _lease;

    public string? DeviceId => _lease?.DeviceId;

    public MeterReading Read(string? deviceId)
    {
        if (deviceId is null)
        {
            Close();
            return MeterReading.Silent;
        }
        if (_lease?.DeviceId != deviceId)
        {
            Close();
            _lease = engine.OpenMeter(deviceId);
        }
        return _lease.Take();
    }

    public void Close()
    {
        _lease?.Dispose();
        _lease = null;
    }

    public void Dispose() => Close();
}

/// <summary>Meter ballistics: fast attack, smooth fall, and a peak hold that drops after a moment.</summary>
internal sealed class MeterBallistics
{
    private float[] _level = [];
    private float[] _hold = [];
    private double[] _holdAge = [];
    private double _silentFor;

    public static readonly TimeSpan HoldTime = TimeSpan.FromSeconds(1.2);
    /// <summary>Meter positions per second when falling.</summary>
    public const double FallRate = 1.6;

    public float[] Levels => _level;
    public float[] Holds => _hold;
    /// <summary>No signal for a while: callers drop to a slow, background cadence.</summary>
    public bool IsIdle => _silentFor >= 2;

    public void Update(MeterReading reading, TimeSpan elapsed)
    {
        var dt = Math.Clamp(elapsed.TotalSeconds, 0, 1);
        var values = reading.Channels.Length > 0 ? reading.Channels : [reading.Peak];
        var n = Math.Min(values.Length, 2);
        if (_level.Length != n)
        {
            _level = new float[n];
            _hold = new float[n];
            _holdAge = new double[n];
        }
        var loud = false;
        for (var i = 0; i < n; i++)
        {
            var target = (float)Art.AudioArt.MeterPosition(values[i]);
            _level[i] = target >= _level[i] ? target : (float)Math.Max(target, _level[i] - FallRate * dt);
            if (target >= _hold[i]) { _hold[i] = target; _holdAge[i] = 0; }
            else
            {
                _holdAge[i] += dt;
                if (_holdAge[i] > HoldTime.TotalSeconds) _hold[i] = (float)Math.Max(_level[i], _hold[i] - FallRate * 0.5 * dt);
            }
            if (target > 0.01f || _level[i] > 0.01f) loud = true;
        }
        _silentFor = loud ? 0 : _silentFor + dt;
    }

    public void ResetHold()
    {
        for (var i = 0; i < _hold.Length; i++) { _hold[i] = _level[i]; _holdAge[i] = 0; }
    }
}
