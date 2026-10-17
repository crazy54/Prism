using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Eq;

public sealed class EqBandBrowserSettings : EqActionSettings
{
    /// <summary>dB per tick while adjusting.</summary>
    public double Step { get; set; } = 0.5;
    /// <summary>The last band picked (restored when the dial appears).</summary>
    public string Band { get; set; } = "";
}

/// <summary>
/// One dial edits the whole EQ. Turn: pick a band (the enabled filters left to right by frequency, then the tone
/// knobs on Game/Media/Aux); nothing is written while picking. Push: adjust that band; turn changes its gain (same
/// step, cap and 0 dB detent as the band dial); push again: back to picking. Tap on Stream Deck + = push.
/// <para>
/// The dial only ever writes the band it shows: if the band being adjusted goes away (switched off or made a pass
/// filter in Sonar, a preset switch), it drops back to picking on the nearest band, and the turn that found out is not
/// applied to anything.
/// </para>
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.band-browser", Name = "EQ Band Browser",
    Icon = "imgs/actions/eq/band-browser/icon", KeyImage = "imgs/actions/eq/band-browser/key", EncoderIcon = "imgs/actions/eq/band-browser/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to pick a band, push to adjust it, turn to change its gain, push again to pick another.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Pick band / gain", TriggerPush = "Adjust / done", TriggerTouch = "Adjust / done")]
public sealed class EqBandBrowserDial : DialAction<EqBandBrowserSettings>
{
    private EqService? _svc;
    private EqLink? _link;
    private EqChannel? _channel;
    private EqState? _state;
    private EqAvailability? _problem;
    private List<EqTarget> _items = [];
    private int _cursor;
    private bool _adjusting;
    private ITimer? _settle;
    private CancellationTokenSource _cts = new();
    private readonly EqPiSync _pi = new();

    internal EqAvailability? Problem => _problem;
    internal EqState? CurrentState => _state;

    /// <summary>For tests: the mode and the picked target.</summary>
    public bool IsAdjusting => _adjusting;
    public EqTarget? Picked => _items.Count == 0 ? null : _items[Math.Clamp(_cursor, 0, _items.Count - 1)];

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
        var wasAdjusting = _adjusting;
        if (!await EnsureStateAsync()) return;
        if (_items.Count == 0) { Render(); return; }
        if (!_adjusting)
        {
            // A turn meant for a band that just went away (adjusting → picking) moves nothing: the user sees where they are first.
            if (!wasAdjusting) _cursor = Math.Clamp(_cursor + EqMath.BrowseSteps(e.Ticks), 0, _items.Count - 1);
        }
        else
        {
            var target = _items[_cursor];
            var current = _state!.Gain(target) ?? 0;
            var (min, max) = _state.GainRange(target);
            var next = EqMath.StepGain(current, e.Ticks, Settings.Step, min, max);
            if (next != current)
            {
                try { _state = _svc.Backend.SetGain(_channel!.Id, target, next); }
                catch (EqUnavailableException ex) { _problem = ex.Availability; }
            }
        }
        Render();
        ArmSettle();
    }

    protected override async Task OnDialPressAsync(DialUpEvent e) => await ToggleModeAsync();

    protected override async Task OnTouchTapAsync(TouchTapEvent e) => await ToggleModeAsync();

    private async Task ToggleModeAsync()
    {
        if (_svc is null) return;
        var wasAdjusting = _adjusting;
        if (!await EnsureStateAsync() || _items.Count == 0) return;
        if (wasAdjusting && !_adjusting) { Render(); return; } // the band went away: already back to picking
        _adjusting = !_adjusting;
        if (!_adjusting) _ = _svc.Backend.FlushAsync(CancellationToken.None);
        Settings.Band = _items[_cursor].SettingValue;
        SaveSettings();
        Render();
        ArmSettle();
    }

    /// <summary>Loads or re-reads the channel (rebuilding the list). False while there is any problem: then nothing is edited.</summary>
    private async Task<bool> EnsureStateAsync()
    {
        if (_problem is not null || _state is null || _channel is null) await ReloadAsync(TimeSpan.Zero);
        else
        {
            try
            {
                _state = await _svc!.Backend.GetStateAsync(_channel.Id, TimeSpan.FromSeconds(1), _cts.Token);
                Rebuild();
            }
            catch (EqUnavailableException ex) { _problem = ex.Availability; }
        }
        if (_problem is not null || _state is null || _channel is null) { Render(); return false; }
        return true;
    }

    private async Task ReloadAsync(TimeSpan maxAge)
    {
        if (_svc is null) return;
        try
        {
            var channel = await _svc.ResolveChannelAsync(Settings.Channel, _cts.Token);
            if (channel is null || _channel is null || !string.Equals(channel.Id, _channel.Id, StringComparison.OrdinalIgnoreCase))
            {
                _items = []; // another channel: its own list, starting from the saved band
                _adjusting = false;
            }
            _channel = channel;
            if (_channel is null)
            {
                _problem = _svc.Backend.Availability.Available ? new EqAvailability(EqAvailabilityCode.NoDevices, "No EQ channel is available.") : _svc.Backend.Availability;
                _state = null;
            }
            else
            {
                _state = await _svc.Backend.GetStateAsync(_channel.Id, maxAge, _cts.Token);
                _problem = null;
                Rebuild();
            }
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; } // keeps the last good state for a passing Sonar error
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { return; }
        Render();
        SyncPi();
    }

    /// <summary>
    /// The browsable list: enabled filters by frequency, then the tone knobs. Keeps the cursor on the same target; if
    /// that target is gone, lands on the nearest frequency and leaves adjust mode (never edit a band that isn't shown).
    /// </summary>
    private void Rebuild()
    {
        if (_state is null) return;
        var keep = _items.Count > 0 ? _items[Math.Clamp(_cursor, 0, _items.Count - 1)] : EqTarget.Parse(Settings.Band, EqTarget.ForBand(0));
        _items = BrowseList(_state);
        var i = _items.IndexOf(keep);
        if (i < 0)
        {
            _adjusting = false;
            if (!keep.IsKnob && keep.Band > 0 && _state.Band(keep.Band) is { } b)
            {
                // The kept band was disabled meanwhile: land on the nearest frequency.
                i = _items.Select((t, idx) => (idx, d: t.IsKnob ? double.MaxValue : Math.Abs(Math.Log(_state.Band(t.Band)!.FrequencyHz / b.FrequencyHz)))).OrderBy(x => x.d).Select(x => x.idx).DefaultIfEmpty(0).First();
            }
        }
        _cursor = Math.Clamp(i < 0 ? 0 : i, 0, Math.Max(0, _items.Count - 1));
        if (_items.Count == 0) _adjusting = false;
    }

    public static List<EqTarget> BrowseList(EqState s)
    {
        var list = s.Bands.Where(b => b.Enabled && b.HasGain).OrderBy(b => b.FrequencyHz).ThenBy(b => b.Index).Select(b => EqTarget.ForBand(b.Index)).ToList();
        foreach (var k in new[] { EqKnob.BassBoost, EqKnob.VoiceClarity, EqKnob.TrebleBoost })
            if (s.Knobs.ContainsKey(k)) list.Add(EqTarget.ForKnob(k));
        return list;
    }

    private async Task OnChangedAsync(EqChangedEventArgs e)
    {
        if (_channel is null || !string.Equals(e.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase)) return;
        if (e.State is { } s)
        {
            if (_state is not null && s.Version <= _state.Version) return;
            _state = s;
            _problem = null;
            Rebuild();
            Render();
        }
        else await ReloadAsync(TimeSpan.FromSeconds(5));
    }

    private void ArmSettle()
    {
        _settle?.Dispose();
        _settle = Time.CreateTimer(_ => Post(Render), null, ActiveWindow + TimeSpan.FromMilliseconds(100), Timeout.InfiniteTimeSpan);
    }

    private void Render()
    {
        var mark = EqPi.TransientMark(_problem);
        var keep = mark is not null && _state is not null && _channel is not null && _items.Count > 0 && string.Equals(_state.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase);
        if (!keep && (_problem is not null || _state is null || _channel is null))
        {
            var p = _problem ?? EqAvailability.Unknown;
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.OfflineDial(Theme, "EQ · " + (_channel?.ShortName ?? "BANDS"), p.ShortText, p.Detail ?? p.Reason)));
            return;
        }
        if (_items.Count == 0)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.OfflineDial(Theme, "EQ · " + _channel!.ShortName, "NO BANDS ON", "Turn a band on in " + EqService.DisplayName(_svc!.BackendId) + ".")));
            return;
        }
        var target = _items[_cursor];
        var chip = _adjusting ? "ADJUST" : $"PICK {(_cursor + 1).ToString(CultureInfo.InvariantCulture)}/{_items.Count.ToString(CultureInfo.InvariantCulture)}";
        var warn = mark ?? (_channel!.IsActive ? null : _svc?.BackendId == EqService.Sonar ? "CH OFF" : "ABSENT");
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, EqArt.BandDial(Theme,
            new BandFrame(_channel!.ShortName, _state!, target, _adjusting ? BandMark.Adjust : BandMark.Pick, IsInteractive && _adjusting, chip, ChipFilled: _adjusting, Warning: warn))));
    }

    // ------------------------------------------------------------------ property inspector

    /// <summary>Keeps an open PI current (Core's refresh API): the form on a backend switch, else the status line.</summary>
    private void SyncPi() => _pi.Sync(this, _svc, Settings.Channel, DescribeState());

    protected override PiForm? DescribeForm() => EqPi.Tail(EqPi.Head(new PiForm())
            .Select("step", "Step per tick", [("0.1", "0.1 dB"), ("0.25", "0.25 dB"), ("0.5", "0.5 dB"), ("1", "1 dB")])
            .Info("How to use", "Turn to pick a band. Push to adjust it, turn to change its gain, push again to pick another. Nothing changes while picking.")
            .Button("eq.revert", "Undo my edits on this channel (this session)")
            .Info("Editing", _svc?.BackendId == EqService.Apo ? "Edits are saved by Prism Control and written to prism-control.txt." : EqPi.SonarEditNote), _svc);

    protected override object? DescribeState() => new { status = EqPi.Status(_svc, _problem, _problem is null && _channel is not null ? $"Channel: {_channel.Name}." : null) };

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _pi.Opened(_svc, Settings.Channel);
        _svc?.PollSoon();
        return Task.CompletedTask;
    }

    protected override async Task OnSettingsChangedAsync(EqBandBrowserSettings settings)
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
