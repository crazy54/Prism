using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Eq;

public sealed class EqToggleKeySettings : EqActionSettings
{
    /// <summary>"eq" (the EQ switch, default) or "all" (every effect on the channel; Sonar only).</summary>
    public string Scope { get; set; } = "eq";
}

/// <summary>
/// EQ on/off for one channel. Press toggles Sonar's EQ switch (and the linked boosts, as Sonar's UI does) or, with
/// scope "all", the channel's whole effects bypass. On APO it toggles the device's block in prism-control.txt.
/// While the channel can't be read (Sonar failing, the channel missing) a press only alerts: it never toggles blind.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.toggle", Name = "EQ On/Off",
    Icon = "imgs/actions/eq/toggle/icon", KeyImage = "imgs/actions/eq/toggle/key",
    Controllers = Controllers.Keypad,
    Tooltip = "Press to turn a channel's EQ (or all its effects) on or off.")]
public sealed class EqToggleKey : KeyAction<EqToggleKeySettings>
{
    private EqService? _svc;
    private EqLink? _link;
    private EqChannel? _channel;
    private EqState? _state;
    private EqAvailability? _problem;
    private CancellationTokenSource _cts = new();
    private readonly EqPiSync _pi = new();

    private EqToggleScope Scope => Settings.Scope == "all" && _svc?.BackendId == EqService.Sonar ? EqToggleScope.AllEffects : EqToggleScope.Eq;
    internal EqAvailability? Problem => _problem;
    public bool IsOn => _state is { } s && (Scope == EqToggleScope.AllEffects ? s.EffectsEnabled : s.Enabled);

    protected override async Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (_cts.IsCancellationRequested) _cts = new CancellationTokenSource();
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
        _cts.Cancel();
        if (_svc is not null) _ = _svc.Backend.FlushAsync(CancellationToken.None);
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_svc is null) { ShowAlert(); return; }
        if (_channel is null || _problem is not null || _state is null) await ReloadAsync(TimeSpan.Zero);
        else
        {
            try { _state = await _svc.Backend.GetStateAsync(_channel.Id, TimeSpan.FromSeconds(1), _cts.Token); }
            catch (EqUnavailableException ex) { _problem = ex.Availability; }
        }
        if (_channel is null || _problem is not null || _state is null) { ShowAlert(); Render(); return; }
        try
        {
            _state = _svc.Backend.SetEnabled(_channel.Id, Scope, !IsOn);
            _ = _svc.Backend.FlushAsync(CancellationToken.None); // a press, not a spin: write now
        }
        catch (EqUnavailableException ex) { _problem = ex.Availability; ShowAlert(); }
        Render();
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
        catch (EqUnavailableException ex) { _problem = ex.Availability; }
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { return; }
        Render();
        SyncPi();
    }

    private async Task OnChangedAsync(EqChangedEventArgs e)
    {
        if (_channel is null || !string.Equals(e.ChannelId, _channel.Id, StringComparison.OrdinalIgnoreCase)) return;
        if (e.State is { } s)
        {
            if (_state is not null && s.Version <= _state.Version) return;
            _state = s;
            _problem = null;
            Render();
        }
        else await ReloadAsync(TimeSpan.FromSeconds(5));
    }

    private void Render()
    {
        var what = Scope == EqToggleScope.AllEffects ? "FX" : "EQ";
        var channel = _channel?.ShortName ?? "";
        if (_problem is not null || _state is null)
        {
            SetImage(EqArt.ToggleKey(Theme, channel, what, false, null, (_problem ?? EqAvailability.Unknown).ShortText));
            return;
        }
        SetImage(EqArt.ToggleKey(Theme, channel, what, IsOn, _state));
    }

    // ------------------------------------------------------------------ property inspector

    /// <summary>Keeps an open PI current (Core's refresh API): the form on a backend switch, else the status line.</summary>
    private void SyncPi() => _pi.Sync(this, _svc, Settings.Channel, DescribeState());

    protected override PiForm? DescribeForm()
    {
        var f = EqPi.Head(new PiForm());
        if (_svc?.BackendId != EqService.Apo)
            f.Select("scope", "Switches", [("eq", "The EQ only"), ("all", "All of the channel's effects")]);
        return EqPi.Tail(f, _svc);
    }

    protected override object? DescribeState() => new
    {
        status = EqPi.Status(_svc, _problem, _problem is null && _state is not null ? $"The {(Scope == EqToggleScope.AllEffects ? "effects are" : "EQ is")} {(IsOn ? "on" : "off")}." : null),
    };

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _pi.Opened(_svc, Settings.Channel);
        return Task.CompletedTask;
    }

    protected override async Task OnSettingsChangedAsync(EqToggleKeySettings settings)
    {
        if (_svc is null) return;
        await ReloadAsync(TimeSpan.FromSeconds(2));
    }

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (_svc is null) return null;
        var (handled, result) = await EqPi.HandleAsync(_svc, type, Settings.Channel, _cts.Token);
        if (handled && type.StartsWith("eq.apo.", StringComparison.Ordinal)) await ReloadAsync(TimeSpan.Zero);
        return result;
    }
}
