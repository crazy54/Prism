using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Eq.Sonar;

namespace PrismControl.Eq;

public sealed class SonarVolumeSettings
{
    /// <summary>"master", "game", "chatRender", "media", "aux", "chatCapture" or "chatMix". Empty = master; anything else shows "CHANNEL MISSING".</summary>
    public string Channel { get; set; } = SonarMixer.Master;
    /// <summary>Percent per tick (1..10).</summary>
    public double Step { get; set; } = 2;
    /// <summary>Streamer mode only: "monitoring" (what you hear, default) or "streaming" (what the stream gets).</summary>
    public string Mix { get; set; } = "monitoring";
}

/// <summary>
/// A Sonar channel's volume, or ChatMix, on a dial. Works whichever EQ backend is chosen (it needs Sonar running).
/// Volume: turn changes it (step % per tick, Galleon flicks capped at ±6 ticks), push toggles mute.
/// ChatMix: turn moves the balance, push centers it, but only when Sonar allows software ChatMix; with a headset
/// ChatMix wheel (Sonar state "finiteWheel") the dial is read-only and says so. While Sonar is failing the dial keeps
/// its last value, marked "SONAR ERROR", and changes nothing.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.sonar-volume", Name = "Sonar Volume / ChatMix",
    Icon = "imgs/actions/eq/sonar-volume/icon", KeyImage = "imgs/actions/eq/sonar-volume/key", EncoderIcon = "imgs/actions/eq/sonar-volume/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to change a Sonar channel's volume (or ChatMix). Push to mute (ChatMix: center).",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Volume", TriggerPush = "Mute", TriggerTouch = "Mute")]
public sealed class SonarVolumeDial : DialAction<SonarVolumeSettings>
{
    private EqService? _svc;
    private SonarMixer? _mixer;
    private IDisposable? _lease, _chatLease;
    private EventHandler<string>? _changed;
    private EventHandler<EqAvailability>? _availability;
    private SonarVolume? _volume;
    private SonarChatMix? _chatMix;
    private EqAvailability? _problem;
    private string? _note;
    private ITimer? _settle;
    private CancellationTokenSource _cts = new();

    internal EqAvailability? Problem => _problem;
    internal SonarVolume? Volume => _volume;
    internal SonarChatMix? ChatMix => _chatMix;

    /// <summary>The setting, or master when it is empty; null when it names no Sonar channel (never another one).</summary>
    private string? Channel
    {
        get
        {
            var c = Settings.Channel.Trim();
            if (c.Length == 0) return SonarMixer.Master;
            return SonarMixer.VolumeChannels.Concat([SonarMixer.ChatMixId]).FirstOrDefault(k => string.Equals(k, c, StringComparison.OrdinalIgnoreCase));
        }
    }

    private bool IsChatMix => Channel == SonarMixer.ChatMixId;
    private string Mix => Settings.Mix == "streaming" ? "streaming" : "monitoring";

    private static readonly EqAvailability Missing = new(EqAvailabilityCode.ChannelMissing,
        "This dial's channel isn't a Sonar channel. Pick one in its settings.", "Pick one in its settings.");

    protected override async Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (_cts.IsCancellationRequested) _cts = new CancellationTokenSource();
        SetFeedbackLayout(Layouts.Canvas.Path);
        _svc = Services.TryGet<EqService>(out var found) ? found : null;
        if (_svc?.Mixer is null)
        {
            _problem = new EqAvailability(EqAvailabilityCode.Error, "The EQ module didn't start.");
            Render();
            return;
        }
        _mixer = _svc.Mixer;
        _changed ??= (_, ch) => Post(() => OnMixerChangedAsync(ch));
        _availability ??= (_, _) => Post(() => ReloadAsync(TimeSpan.Zero));
        _svc.MixerChanged += _changed;
        _svc.MixerAvailabilityChanged += _availability;
        _lease ??= _svc.WatchMixer();
        if (IsChatMix) _chatLease ??= _mixer.WatchChatMix();
        await ReloadAsync(TimeSpan.FromSeconds(1));
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_svc is not null)
        {
            if (_changed is not null) _svc.MixerChanged -= _changed;
            if (_availability is not null) _svc.MixerAvailabilityChanged -= _availability;
        }
        _lease?.Dispose();
        _chatLease?.Dispose();
        _lease = _chatLease = null;
        _settle?.Dispose();
        _cts.Cancel();
        _ = _mixer?.FlushAsync();
        return Task.CompletedTask;
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (_mixer is null || e.Ticks == 0) return;
        if (!await EnsureLoadedAsync()) return;
        var ticks = Math.Clamp(e.Ticks, -EqMath.MaxTicksPerEvent, EqMath.MaxTicksPerEvent);
        var step = Math.Clamp(Settings.Step, 1, 10) / 100;
        try
        {
            if (IsChatMix)
            {
                if (_chatMix!.CanWrite) _chatMix = _mixer.SetChatMix(_chatMix.Balance + ticks * step * 2);
                else _note = NoteFor(_chatMix);
            }
            else _volume = _mixer.SetVolume(Channel!, Mix, _volume!.Volume + ticks * step);
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; }
        Render();
        ArmSettle();
    }

    protected override async Task OnDialPressAsync(DialUpEvent e) => await PushAsync();
    protected override async Task OnTouchTapAsync(TouchTapEvent e) => await PushAsync();

    private async Task PushAsync()
    {
        if (_mixer is null) return;
        if (!await EnsureLoadedAsync()) return;
        try
        {
            if (IsChatMix)
            {
                if (_chatMix!.CanWrite) _chatMix = _mixer.SetChatMix(0);
                else _note = NoteFor(_chatMix);
            }
            else _volume = _mixer.SetMuted(Channel!, Mix, !_volume!.Muted);
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; }
        Render();
        ArmSettle();
    }

    /// <summary>Loads the value if there is a problem or none yet. False while there is still a problem: then nothing changes.</summary>
    private async Task<bool> EnsureLoadedAsync()
    {
        if (_problem is not null || (IsChatMix ? _chatMix is null : _volume?.Channel != Channel)) await ReloadAsync(TimeSpan.Zero);
        return _problem is null && (IsChatMix ? _chatMix is not null : _volume is not null && _volume.Channel == Channel);
    }

    private async Task ReloadAsync(TimeSpan maxAge)
    {
        if (_mixer is null) return;
        try
        {
            if (Channel is not { } channel) _problem = Missing;
            else
            {
                if (IsChatMix) _chatMix = await _mixer.GetChatMixAsync(maxAge, _cts.Token);
                else _volume = await _mixer.GetVolumeAsync(channel, Mix, maxAge, _cts.Token);
                _problem = null;
            }
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; } // keeps the last value for a passing Sonar error
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { return; }
        Render();
        if (IsPropertyInspectorVisible) SendToPropertyInspector("pi.state", DescribeState());
    }

    private Task OnMixerChangedAsync(string channel)
    {
        if (_mixer is null || Channel is not { } mine) return Task.CompletedTask;
        if (IsChatMix && channel == SonarMixer.ChatMixId) _chatMix = _mixer.CachedChatMix ?? _chatMix;
        else if (!IsChatMix && channel == mine) _volume = _mixer.Cached(mine, Mix) ?? _volume;
        else return Task.CompletedTask;
        _problem = null;
        Render();
        return Task.CompletedTask;
    }

    private static string? NoteFor(SonarChatMix cm) => cm.OnHardwareWheel ? "ON HEADSET" : cm.CanWrite ? null : "UNAVAILABLE";

    private void ArmSettle()
    {
        _settle?.Dispose();
        _settle = Time.CreateTimer(_ => Post(() => { _note = null; Render(); }), null, ActiveWindow + TimeSpan.FromMilliseconds(100), Timeout.InfiniteTimeSpan);
    }

    private void Render()
    {
        var name = Channel is { } c ? SonarMixer.ChannelName(c) : "CHANNEL";
        var mark = EqPi.TransientMark(_problem);
        var hasValue = IsChatMix ? _chatMix is not null : _volume is not null && _volume.Channel == Channel;
        if ((_problem is not null && mark is null) || !hasValue)
        {
            var p = _problem ?? EqAvailability.Unknown;
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.OfflineDial(Theme, "SONAR · " + name, p.ShortText, p.Detail ?? p.Reason)));
            return;
        }
        // A passing Sonar error keeps the last value on the dial, marked.
        if (IsChatMix)
        {
            // The note chip beside "CHATMIX" is short: "ERROR" (this is a Sonar dial) rather than an ellipsized "SONAR ERR…".
            var note = (mark is null ? null : "ERROR") ?? _note ?? (_chatMix!.CanWrite ? null : NoteFor(_chatMix));
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.ChatMixDial(Theme, _chatMix!, IsInteractive && mark is null, note)));
            return;
        }
        var footer = mark ?? (_volume!.Streamer ? (Mix == "streaming" ? "Stream mix" : "Monitor mix") : null);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.VolumeDial(Theme, name, _volume!.Volume, _volume.Muted, IsInteractive && mark is null, footer)));
    }

    // ------------------------------------------------------------------ property inspector

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Sonar")
        .Select("channel", "Channel", [(SonarMixer.Master, "Master"), (SonarChannels.Game, "Game"), (SonarChannels.Chat, "Chat"), (SonarChannels.Media, "Media"),
            (SonarChannels.Aux, "Aux"), (SonarChannels.Mic, "Mic"), (SonarMixer.ChatMixId, "ChatMix (game ↔ chat)")])
        .Range("step", "Step per tick", 1, 10, 1, "%")
        .Select("mix", "Streamer mode mix", [("monitoring", "Monitoring (what you hear)"), ("streaming", "Streaming (what the stream gets)")])
        .Info("ChatMix", "Sonar only lets apps change ChatMix when the headset has no ChatMix wheel. With a wheel, this dial shows the balance and the wheel stays in charge.")
        .Info("Status", stateKey: "status");

    protected override object? DescribeState() => new
    {
        status = _problem is { } p ? p.Reason : _mixer is null ? "The EQ module didn't start." : "SteelSeries Sonar: connected." + (_mixer.IsStreamer ? " Streamer mode." : " Classic mode."),
    };

    protected override async Task OnSettingsChangedAsync(SonarVolumeSettings settings)
    {
        if (_mixer is null) return;
        if (IsChatMix) _chatLease ??= _mixer.WatchChatMix();
        else { _chatLease?.Dispose(); _chatLease = null; }
        await ReloadAsync(TimeSpan.FromSeconds(1));
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _svc?.PollSoon();
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(null);
}
