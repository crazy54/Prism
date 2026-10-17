using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Eq;

public sealed class EqBandDialSettings : EqActionSettings
{
    /// <summary>"1".."10" (a filter), or "bass", "voice", "treble", "preamp" (Sonar tone knobs / gain; APO preamp).</summary>
    public string Band { get; set; } = "1";
    /// <summary>dB per tick: 0.1, 0.25, 0.5 (default) or 1.</summary>
    public double Step { get; set; } = 0.5;
    /// <summary>What a push does: "reset" (the gain goes back to the preset's value, default) or "bypass" (the band turns off/on).</summary>
    public string Push { get; set; } = "reset";
}

/// <summary>
/// One EQ band on a dial. Turn: gain (step per tick; a Galleon flick of up to ±12 ticks counts as at most ±6; a soft
/// detent stops at 0 dB). Push (or tap on Stream Deck +): reset the band's gain to the preset's value (Sonar's own
/// defaults), or, with Push = bypass, switch the band off/on (tone knobs always reset). Frames are drawn on the full
/// canvas: the channel's summed curve with this band lit. Writes go through the backend's coalescer, so a fast spin
/// sends a few PUTs, not dozens. While Sonar is failing the dial keeps its last good curve, marked "SONAR ERROR", and
/// edits nothing until Sonar answers again.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.band", Name = "EQ Band",
    Icon = "imgs/actions/eq/band/icon", KeyImage = "imgs/actions/eq/band/key", EncoderIcon = "imgs/actions/eq/band/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to change one EQ band's gain. Push to reset it to the preset's value (or to bypass it).",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Gain", TriggerPush = "Reset band", TriggerTouch = "Reset band")]
public sealed class EqBandDial : DialAction<EqBandDialSettings>
{
    private EqService? _svc;
    private EqLink? _link;
    private EqChannel? _channel;
    private EqState? _state;
    private EqAvailability? _problem;
    private ITimer? _settle;
    private CancellationTokenSource _cts = new();
    private readonly EqPiSync _pi = new();

    internal EqAvailability? Problem => _problem;
    internal EqState? CurrentState => _state;

    private EqTarget Target => EqTarget.Parse(Settings.Band, EqTarget.ForBand(1));

    protected override async Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (_cts.IsCancellationRequested) _cts = new CancellationTokenSource();
        SetFeedbackLayout(Layouts.Canvas.Path);
        _svc = Services.TryGet<EqService>(out var found) ? found : null;
        if (_svc is null)
        {
            _problem = new EqAvailability(EqAvailabilityCode.Error, "The EQ module didn't start.");
            Render();
            return;
        }
        _link ??= new EqLink(this, _svc, OnChangedAsync, () => ReloadAsync(TimeSpan.Zero));
        await ReloadAsync(TimeSpan.FromSeconds(2));
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _link?.Dispose();
        _link = null;
        _settle?.Dispose();
        _cts.Cancel();
        if (_svc is not null) _ = _svc.Backend.FlushAsync(CancellationToken.None);
        return Task.CompletedTask;
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (_svc is null || e.Ticks == 0) return;
        if (!await EnsureStateAsync()) return;
        var target = Target;
        var state = _state!;
        if (!state.Supports(target))
        {
            _problem = new EqAvailability(EqAvailabilityCode.Error, "This channel has no such band.", "Pick another band in the settings.");
            Render();
            return;
        }
        var current = state.Gain(target) ?? 0;
        var (min, max) = state.GainRange(target);
        var next = EqMath.StepGain(current, e.Ticks, Settings.Step, min, max);
        if (next != current) Apply(() => _svc.Backend.SetGain(_channel!.Id, target, next));
        Render();
        ArmSettle();
    }

    protected override async Task OnDialPressAsync(DialUpEvent e) => await PushAsync();

    protected override async Task OnTouchTapAsync(TouchTapEvent e) => await PushAsync();

    private async Task PushAsync()
    {
        if (_svc is null) return;
        if (!await EnsureStateAsync()) return;
        var target = Target;
        var state = _state!;
        if (!state.Supports(target)) return;
        if (Settings.Push == "bypass" && !target.IsKnob && state.Band(target.Band) is { } band)
            Apply(() => _svc.Backend.SetBand(_channel!.Id, target.Band, new EqBandPatch(Enabled: !band.Enabled)));
        else
            Apply(() => _svc.Backend.Reset(_channel!.Id, EqResetScope.Gain, target));
        Render();
        ArmSettle();
    }

    /// <summary>
    /// Loads (or re-reads, if the copy is older than 1 s at the start of a gesture) the channel's state. False while
    /// there is any problem (Sonar failing, the channel missing): then nothing is edited.
    /// </summary>
    private async Task<bool> EnsureStateAsync()
    {
        if (_problem is not null || _state is null || _channel is null) await ReloadAsync(TimeSpan.Zero);
        else
        {
            try { _state = await _svc!.Backend.GetStateAsync(_channel.Id, TimeSpan.FromSeconds(1), _cts.Token); }
            catch (EqUnavailableException ex) { _problem = ex.Availability; }
        }
        if (_problem is not null || _state is null || _channel is null) { Render(); return false; }
        return true;
    }

    private void Apply(Func<EqState> edit)
    {
        try { _state = edit(); }
        catch (EqUnavailableException ex) { _problem = ex.Availability; }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            Log.Warn($"EQ band edit failed: {ex.Message}");
            ShowAlert();
        }
    }

    private async Task ReloadAsync(TimeSpan maxAge)
    {
        if (_svc is null) return;
        try
        {
            _channel = await _svc.ResolveChannelAsync(Settings.Channel, _cts.Token);
            if (_channel is null)
            {
                _problem = _svc.Backend.Availability.Available ? new EqAvailability(EqAvailabilityCode.NoDevices, "No EQ channel is available.") : _svc.Backend.Availability;
                _state = null;
            }
            else
            {
                _state = await _svc.Backend.GetStateAsync(_channel.Id, maxAge, _cts.Token);
                _problem = null;
            }
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; } // keeps the last good state for a passing Sonar error
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { return; }
        Render();
        SyncPi();
    }

    private async Task OnChangedAsync(EqChangedEventArgs e)
    {
        if (_channel is null || !string.Equals(e.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase)) return;
        if (e.State is { } s)
        {
            if (_state is not null && s.Version <= _state.Version) return; // our own edit, already drawn
            _state = s;
            _problem = null;
            Render();
        }
        else await ReloadAsync(TimeSpan.FromSeconds(5)); // only the channel's on/off status changed
    }

    private void ArmSettle()
    {
        // Redraw once the interaction window ends, so the frame drops its "active" glow.
        _settle?.Dispose();
        _settle = Time.CreateTimer(_ => Post(Render), null, ActiveWindow + TimeSpan.FromMilliseconds(100), Timeout.InfiniteTimeSpan);
    }

    private void Render()
    {
        var mark = EqPi.TransientMark(_problem);
        var keep = mark is not null && _state is not null && _channel is not null && string.Equals(_state.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase);
        if (!keep && (_problem is not null || _state is null || _channel is null))
        {
            var p = _problem ?? EqAvailability.Unknown;
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.OfflineDial(Theme, "EQ · " + (_channel?.ShortName ?? "BAND"), p.ShortText, p.Detail ?? Shorten(p.Reason))));
            return;
        }
        // A passing Sonar error keeps the last good curve, marked; it takes the place of the channel-off note.
        var warn = mark ?? (_channel!.IsActive ? null : _svc?.BackendId == EqService.Sonar ? "CH OFF" : "ABSENT");
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame,
            EqArt.BandDial(Theme, new BandFrame(_channel!.ShortName, _state!, Target, BandMark.Lit, IsInteractive, Warning: warn))));
    }

    private static string Shorten(string reason) => reason.Length <= 60 ? reason : reason[..57] + "…";

    // ------------------------------------------------------------------ property inspector

    /// <summary>Keeps an open PI current (Core's refresh API): the form on a backend switch, the band list on a channel change, else the status.</summary>
    private void SyncPi() => _pi.Sync(this, _svc, Settings.Channel, DescribeState(), "eq.bands");

    protected override PiForm? DescribeForm() => EqPi.Tail(EqPi.Head(new PiForm())
            .Select("band", "Band", optionsFrom: "eq.bands")
            .Select("step", "Step per tick", [("0.1", "0.1 dB"), ("0.25", "0.25 dB"), ("0.5", "0.5 dB"), ("1", "1 dB")])
            .Select("push", "Push", [("reset", "Reset the band to the preset's value"), ("bypass", "Bypass the band (off / on)")])
            .Button("eq.revert", "Undo my edits on this channel (this session)")
            .Info("Editing", _svc?.BackendId == EqService.Apo ? "Edits are saved by Prism Control and written to prism-control.txt." : EqPi.SonarEditNote), _svc);

    protected override object? DescribeState() => new { status = EqPi.Status(_svc, _problem, _problem is null && _channel is not null ? $"Channel: {_channel.Name}." : null) };

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _pi.Opened(_svc, Settings.Channel);
        _svc?.PollSoon();
        return Task.CompletedTask;
    }

    protected override async Task OnSettingsChangedAsync(EqBandDialSettings settings)
    {
        if (_svc is null) return;
        await ReloadAsync(TimeSpan.FromSeconds(2));
    }

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (_svc is null) return null;
        if (type == "eq.revert")
        {
            if (await EqPi.RevertAsync(_svc, _problem is null ? _channel : null, _cts.Token, p => _problem = p)) await ReloadAsync(TimeSpan.Zero);
            else { Render(); SyncPi(); }
            return null;
        }
        var (handled, result) = await EqPi.HandleAsync(_svc, type, Settings.Channel, _cts.Token);
        if (handled && type.StartsWith("eq.apo.", StringComparison.Ordinal)) await ReloadAsync(TimeSpan.Zero);
        return result;
    }
}
