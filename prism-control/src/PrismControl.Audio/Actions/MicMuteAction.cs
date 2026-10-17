using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Audio;

public sealed class MicSettings
{
    /// <summary>
    /// Empty = the default input (the same mic /v1/mic reports); "@comms-input" follows the default communications
    /// input instead (the role calls use); or an endpoint id.
    /// </summary>
    public string? DeviceId { get; set; }
    /// <summary>Key behavior: "toggle", "ptt" (hold to talk) or "ptm" (hold to mute).</summary>
    public string Mode { get; set; } = "toggle";
    /// <summary>Show a live input level while the mic is open.</summary>
    public bool ShowMeter { get; set; }
    /// <summary>Percent per dial tick for the mic level.</summary>
    public int Step { get; set; } = 2;
}

/// <summary>
/// Mic mute. Key: press toggles (or hold-to-talk / hold-to-mute); the whole key turns red while muted, and the state
/// follows Windows live (Wave Link, a headset button, Windows settings). Dial: push = mute, turn = mic level.
/// A held key is tracked by <see cref="MicHoldGuard"/>: if it goes away while held (page or profile switch, the Stream
/// Deck disconnecting, sleep, shutdown), the mic goes back to its resting state instead of staying live.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.mic-mute", Name = "Mic Mute",
    Icon = "imgs/actions/audio/mic-mute/icon", KeyImage = "imgs/actions/audio/mic-mute/key", EncoderIcon = "imgs/actions/audio/mic-mute/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Press to mute or unmute your microphone. The key turns red while muted and follows changes made elsewhere.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Mic level", TriggerPush = "Mute", TriggerTouch = "Mute")]
public sealed class MicMuteAction : AudioActionBase<MicSettings>
{
    private volatile string? _deviceId;
    private MicHold? _hold;
    private MicHoldGuard? _guard, _ownGuard;
    private RenderLoop? _loop;
    private MeterBinding? _meter;
    private readonly MeterBallistics _ballistics = new();
    private long _lastTick;

    protected override bool IsRelevant(AudioChange c) => c.Kind switch
    {
        AudioChangeKind.Sessions => false,
        AudioChangeKind.Endpoint => c.DeviceId == _deviceId,
        AudioChangeKind.Defaults => c.Flow is null or AudioFlow.Capture,
        _ => true,
    };

    private AudioDevice? Current()
    {
        if (Engine is not { IsAvailable: true } e) return null;
        var id = DeviceRef.Resolve(e, Settings.DeviceId, DeviceRef.DefaultInput);
        _deviceId = id;
        return id is null ? null : e.GetDevice(id);
    }

    /// <summary>The key held right now (tests).</summary>
    internal MicHold? Hold => _hold;

    /// <summary>The module's guard when it serves the same engine; otherwise one of our own (disappear and dispose still restore).</summary>
    private MicHoldGuard? Guard
    {
        get
        {
            if (_guard is not null || Engine is null) return _guard;
            if (Services.TryGet<MicHoldGuard>(out var shared) && ReferenceEquals(shared.Engine, Engine)) return _guard = shared;
            return _guard = _ownGuard = new MicHoldGuard(Engine, Log);
        }
    }

    private string Mode => Settings.Mode?.ToLowerInvariant() switch { "ptt" => "ptt", "ptm" => "ptm", _ => "toggle" };

    protected override Task OnAppearAsync(WillAppearEvent e)
    {
        UpdateMeterLoop();
        return Task.CompletedTask;
    }

    protected override void OnSettingsApplied() => UpdateMeterLoop();

    protected override void OnAudioChanged(AudioChange change)
    {
        UpdateMeterLoop();
        Render();
    }

    protected override async Task OnKeyDownAsync(KeyDownEvent e)
    {
        if (Mode == "toggle") return;
        var mutedWhileHeld = Mode == "ptm";
        var d = Current();
        if (d is null || Guard is not { } guard)
        {
            await NoMicAsync().ConfigureAwait(false);
            return;
        }
        if (_hold is { } earlier)
        {
            // A second keyDown without a keyUp: finish the first hold before starting again.
            _hold = null;
            await guard.ReleaseAsync(earlier, "was pressed again before its release arrived").ConfigureAwait(false);
        }
        // Registered before the mic changes, so there is no moment where it is live and untracked.
        _hold = guard.Hold(Context, Device.Id, d.Id, restingMuted: !mutedWhileHeld);
        await WriteMuteAsync(d, mutedWhileHeld).ConfigureAwait(false);
    }

    protected override async Task OnKeyUpAsync(KeyUpEvent e)
    {
        // The hold remembers the mic and its resting state from keyDown (a PI change in between does not matter).
        if (_hold is not { } hold) return;
        _hold = null;
        if (!await Guard!.ReleaseAsync(hold, "was released").ConfigureAwait(false)) ShowAlert();
        UpdateMeterLoop();
        Render();
    }

    /// <summary>The key goes away while held: put the mic back now, because its keyUp will never come.</summary>
    private void EndHold(string why)
    {
        if (_hold is not { } hold) return;
        _hold = null;
        _ = Guard?.ReleaseAsync(hold, why);
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e) => Mode == "toggle" ? ToggleAsync() : Task.CompletedTask;
    protected override Task OnDialPressAsync(DialUpEvent e) => ToggleAsync();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => ToggleAsync();

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        var d = Current();
        if (d is not null && d.HasVolume && e.Ticks != 0)
        {
            var pct = Math.Clamp(d.VolumePct + e.Ticks * ClampStep(Settings.Step), 0, 100);
            var write = Engine!.SetVolumeAsync(d.Id, pct / 100f);
            Render();
            await RunAsync(write, "set mic level").ConfigureAwait(false);
        }
        else Render();
        SettleLater();
    }

    private Task ToggleAsync()
    {
        var d = Current();
        return d is null ? NoMicAsync() : SetMutedAsync(d, !d.Muted);
    }

    private Task NoMicAsync()
    {
        ShowAlert();
        Render();
        return Task.CompletedTask;
    }

    private Task SetMutedAsync(AudioDevice d, bool muted)
    {
        Guard?.Supersede(d.Id); // the user's own choice replaces a restore still waiting for this mic
        return WriteMuteAsync(d, muted);
    }

    private async Task WriteMuteAsync(AudioDevice d, bool muted)
    {
        if (d.Muted == muted)
        {
            Render();
            return;
        }
        var write = Engine!.SetMuteAsync(d.Id, muted);
        UpdateMeterLoop();
        Render();
        await RunAsync(write, muted ? "mute mic" : "unmute mic").ConfigureAwait(false);
    }

    /// <summary>The meter runs only while it is wanted, the mic is open and the key is visible.</summary>
    private void UpdateMeterLoop()
    {
        var d = Current();
        var want = Settings.ShowMeter && IsVisible && d is { Muted: false };
        if (want && _loop is null)
        {
            _meter ??= new MeterBinding(Engine!);
            _lastTick = Time.GetTimestamp();
            _loop = StartRenderLoop(MeterTick, TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(33));
        }
        else if (!want && _loop is not null)
        {
            _loop.Stop();
            _loop = null;
            _meter?.Close();
            DefaultPriority = UpdatePriority.Normal;
        }
    }

    private void MeterTick()
    {
        if (_meter is null) return;
        var now = Time.GetTimestamp();
        _ballistics.Update(_meter.Read(_deviceId), Time.GetElapsedTime(_lastTick, now));
        _lastTick = now;
        // Silence: slow down and get out of the way of interactive frames.
        if (_loop is not null) _loop.IdleInterval = _ballistics.IsIdle ? TimeSpan.FromSeconds(1) : TimeSpan.FromMilliseconds(100);
        DefaultPriority = _ballistics.IsIdle ? UpdatePriority.Background : UpdatePriority.Normal;
        Render();
    }

    protected override void Render()
    {
        var view = View();
        if (IsDial) ShowDial(view, AudioArt.MicDial(Theme, view, IsInteractive));
        else ShowKey(view, AudioArt.MicKey(Theme, view));
    }

    internal MicView View()
    {
        if (Engine is not { IsAvailable: true }) return new MicView("Audio service", false, 0, null, Unavailable: true, NoAudio: true);
        var d = Current();
        if (d is null) return new MicView("No microphone", false, 0, null, Unavailable: true);
        double? level = _loop is not null && _ballistics.Levels.Length > 0 ? _ballistics.Levels.Max() : null;
        return new MicView(d.Title, d.Muted, d.VolumePct, level);
    }

    protected override void OnDisappear()
    {
        EndHold("disappeared while held (page or profile switch)");
        _loop = null;
        _meter?.Close();
    }

    protected override void DisposeCore()
    {
        EndHold("was removed while held");
        _meter?.Dispose();
        _ownGuard?.Dispose();
    }

    protected override string EmptyOptionLabel(AudioFlow flow) => "Default input";

    protected override string DefaultRef => DeviceRef.DefaultInput;

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Microphone")
        .Select("deviceId", "Device", optionsFrom: "audio.inputs")
        .Select("mode", "Key press", [("toggle", "Toggle mute"), ("ptt", "Hold to talk"), ("ptm", "Hold to mute")])
        .Checkbox("showMeter", "Show input level")
        .Range("step", "Dial step", 1, 10, 1, "%")
        .Info("Tip", "Default input is the mic Windows records from (the one /v1/mic reports). Pick the communications input to follow the mic your calls use.")
        .Info("Now", stateKey: "status");

    protected override object? DescribeState()
    {
        if (Engine is not { IsAvailable: true }) return new { status = "Audio unavailable" };
        var d = Current();
        return new { status = d is null ? "No microphone" : $"{d.FriendlyName}: {(d.Muted ? "muted" : "live")}" };
    }
}
