using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Theming;
using PrismControl.Spotify.Render;

namespace PrismControl.Spotify.Actions;

public sealed class SpotifyVolumeSettings
{
    /// <summary>Percent per tick (a Galleon spin sends up to ±12 ticks at once).</summary>
    public int Step { get; set; } = 2;
}

/// <summary>
/// Spotify's own device volume (Web API, the active Spotify Connect device; not the Windows mixer).
/// Dial: turn = volume, push = mute / restore; Stream Deck + touch = jump to the tapped level. Key: press = mute / restore.
/// Changes are optimistic and coalesced (latest value at most every 200 ms).
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.volume", Name = "Spotify Volume",
    Icon = "imgs/actions/spotify/volume/icon", KeyImage = "imgs/actions/spotify/volume/key", EncoderIcon = "imgs/actions/spotify/volume/dial",
    Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Spotify's own volume on the active device. Turn to change, push to mute. Needs Connect.",
    Layout = Layouts.Canvas.Path, PropertyInspector = SpotifyBinding.PiPage,
    TriggerRotate = "Volume", TriggerPush = "Mute / Restore", TriggerTouch = "Set volume")]
public sealed class VolumeAction : DialAction<SpotifyVolumeSettings>, IDisposable
{
    private SpotifyBinding? _b;
    private IDisposable? _lookWatch;

    /// <summary>The palette to draw with: Spotify's app look when a Kaleidoscope deck shows Spotify, else Prism (core.theme).</summary>
    private RefractionPalette Look => AppTheming.For(Services, Device.Id, Theme)?.Palette ?? Theme;
    private Flash _flash;
    private EventHandler<string>? _onFailed;

    private SpotifyService? Svc => _b?.Service;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = SpotifyBinding.Attach(this, Services, GlobalSettings, SpotifyView.Volume, Render);
        _lookWatch?.Dispose();
        _lookWatch = AppTheming.Watch(Services, Device.Id, () => Post(Render));
        if (Svc is { } svc)
        {
            _onFailed = (_, message) => Post(() => { _flash.Set(Time, message, true, TimeSpan.FromSeconds(2.5)); Render(); });
            svc.VolumeFailed += _onFailed;
        }
        if (IsDial)
        {
            SetFeedbackLayout(Layouts.Canvas.Path);
            if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Volume", "Mute / Restore", "Set volume");
            else SetTriggerDescription("Volume", "Mute / Restore");
        }
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(33));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (Svc is not { } svc) return Task.CompletedTask;
        Apply(svc.AdjustVolume(e.Ticks * Math.Clamp(Settings.Step, 1, 25)));
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => Mute();
    protected override Task OnKeyPressAsync(KeyUpEvent e) => Mute();

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        if (Svc is { } svc) Apply(svc.SetVolume((int)Math.Round(Math.Clamp((e.X - 16) / 168.0, 0, 1) * 100)));
        return Task.CompletedTask;
    }

    private Task Mute()
    {
        if (Svc is { } svc) Apply(svc.ToggleMute());
        else ShowAlert();
        return Task.CompletedTask;
    }

    private void Apply(CommandResult r)
    {
        if (!r.Ok)
        {
            ShowAlert();
            if (r.Message is { } m) _flash.Set(Time, m, true, TimeSpan.FromSeconds(2.5));
        }
        Render();
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Spotify Volume")
        .Range("step", "Percent per tick", 1, 10, 1, "%")
        .Info("Note", "This is Spotify's own volume on the playing device, not the Windows mixer.");

    protected override Task OnSettingsChangedAsync(SpotifyVolumeSettings settings)
    {
        Render();
        return Task.CompletedTask;
    }

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => SpotifyBinding.PiState(Svc, GlobalSettings);

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _b?.PushPiState(force: true);
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var svc = Svc;
        var snap = svc?.Current ?? PlayerSnapshot.Empty;
        var connected = svc?.IsConnected ?? false;
        var flash = _flash.Get(Time);
        var percent = connected ? snap.VolumePct : null;
        if (IsDial)
        {
            var notice = flash ?? (!connected ? new FrameNotice(svc is null ? "Unavailable" : svc.Status.Auth == AuthState.NeedsReconnect ? "Reconnect in settings" : "Connect in settings", false)
                : snap.DeviceId is null ? new FrameNotice("No active device", false) : null);
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, SpotifyArt.VolumeDial(Look, percent, connected ? snap.DeviceName : null, IsInteractive, notice)));
        }
        else
        {
            var label = flash is { } f ? SpotifyText.KeyHint(f.Text) : !connected ? (svc?.Status.Auth == AuthState.NeedsReconnect ? "RECONNECT" : "SIGN IN") : null;
            SetImage(label is not null ? SpotifyArt.VolumeKey(Look, null, connected, label) : SpotifyArt.VolumeKey(Look, percent, connected));
        }
    }

    public void Dispose()
    {
        if (Svc is { } svc && _onFailed is not null) svc.VolumeFailed -= _onFailed;
        _onFailed = null;
        _b?.Dispose();
        _b = null;
        _lookWatch?.Dispose();
        _lookWatch = null;
    }
}
