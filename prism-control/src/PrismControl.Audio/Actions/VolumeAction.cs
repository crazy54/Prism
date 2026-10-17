using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Audio;

public sealed class VolumeSettings
{
    /// <summary>Empty = the default output; a <see cref="DeviceRef"/> token or an endpoint id.</summary>
    public string? DeviceId { get; set; }
    /// <summary>Percent per dial tick (Galleon spins carry up to 12 ticks per event).</summary>
    public int Step { get; set; } = 2;
    /// <summary>What a key press does: "mute", "up" or "down".</summary>
    public string KeyPress { get; set; } = "mute";
}

/// <summary>
/// Master volume of the default output or any endpoint. Dial: turn = volume (ticks × step; turning up unmutes),
/// push = mute. Key: press = mute (or step up/down), shows the level and mute state live. Stream Deck + touch = mute.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.volume", Name = "Volume",
    Icon = "imgs/actions/audio/volume/icon", KeyImage = "imgs/actions/audio/volume/key", EncoderIcon = "imgs/actions/audio/volume/dial",
    Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Turn to change the volume, push or press to mute. Follows the default output, or pick a device.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Volume", TriggerPush = "Mute", TriggerTouch = "Mute")]
public sealed class VolumeAction : AudioActionBase<VolumeSettings>
{
    private volatile string? _deviceId;

    protected override bool IsRelevant(AudioChange c) => c.Kind switch
    {
        AudioChangeKind.Sessions => false,
        AudioChangeKind.Endpoint => c.DeviceId == _deviceId,
        _ => true,
    };

    private AudioDevice? Current()
    {
        if (Engine is not { IsAvailable: true } e) return null;
        var id = DeviceRef.Resolve(e, Settings.DeviceId, DeviceRef.DefaultOutput);
        _deviceId = id;
        return id is null ? null : e.GetDevice(id);
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        await ChangeAsync(e.Ticks).ConfigureAwait(false);
        SettleLater();
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ToggleMuteAsync();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => ToggleMuteAsync();

    protected override Task OnKeyPressAsync(KeyUpEvent e) => Settings.KeyPress?.ToLowerInvariant() switch
    {
        "up" => ChangeAsync(+1),
        "down" => ChangeAsync(-1),
        _ => ToggleMuteAsync(),
    };

    private async Task ChangeAsync(int ticks)
    {
        var d = Current();
        if (d is null || !d.HasVolume || ticks == 0)
        {
            Render();
            return;
        }
        var pct = Math.Clamp(d.VolumePct + ticks * ClampStep(Settings.Step), 0, 100);
        var e = Engine!;
        // Like the Windows volume keys: turning up unmutes.
        var unmute = ticks > 0 && d.Muted ? e.SetMuteAsync(d.Id, false) : Task.CompletedTask;
        var set = e.SetVolumeAsync(d.Id, pct / 100f);
        Render();
        await RunAsync(Task.WhenAll(unmute, set), "set volume").ConfigureAwait(false);
    }

    private async Task ToggleMuteAsync()
    {
        var d = Current();
        if (d is null)
        {
            ShowAlert();
            Render();
            return;
        }
        var write = Engine!.SetMuteAsync(d.Id, !d.Muted);
        Render();
        if (IsDial) SettleLater();
        await RunAsync(write, "toggle mute").ConfigureAwait(false);
    }

    protected override void Render()
    {
        var view = View();
        if (IsDial) ShowDial(view, AudioArt.VolumeDial(Theme, view, IsInteractive));
        else ShowKey(view, AudioArt.VolumeKey(Theme, view));
    }

    internal VolumeView View()
    {
        if (Engine is not { IsAvailable: true }) return new VolumeView(LevelKind.Output, "NO AUDIO", 0, false, Unavailable: true);
        var d = Current();
        var kind = DeviceRef.FlowOf(Settings.DeviceId) == AudioFlow.Capture || d?.Flow == AudioFlow.Capture ? LevelKind.Input : LevelKind.Output;
        if (d is null) return new VolumeView(kind, "NO DEVICE", 0, false, Unavailable: true);
        return new VolumeView(kind, d.Title, d.VolumePct, d.Muted, Fixed: !d.HasVolume);
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Device")
        .Select("deviceId", "Device", optionsFrom: "audio.endpoints")
        .Range("step", "Step per tick", 1, 10, 1, "%")
        .Select("keyPress", "Key press", [("mute", "Mute / unmute"), ("up", "Volume up"), ("down", "Volume down")])
        .Info("Now", stateKey: "status");

    protected override object? DescribeState()
    {
        var d = Current();
        return new { status = d is null ? "No device" : $"{d.FriendlyName}: {(d.HasVolume ? d.VolumePct + "%" : "fixed volume")}{(d.Muted ? ", muted" : "")}" };
    }
}
