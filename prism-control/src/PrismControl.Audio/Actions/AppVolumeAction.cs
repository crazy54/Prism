using System.Text.Json.Nodes;
using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Audio;

public sealed class AppVolumeSettings
{
    /// <summary>The app's program, e.g. "music.exe" (survives app restarts; "#system" = System Sounds).</summary>
    public string? App { get; set; }
    public int Step { get; set; } = 2;
    /// <summary>What a key press does: "mute", "up" or "down".</summary>
    public string KeyPress { get; set; } = "mute";
}

/// <summary>
/// Volume and mute for one app, bound by its program name so it keeps working across restarts. It acts on every
/// session of that app on any output. Key: press = mute (or step up/down). Dial: turn = volume, push = mute.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.app-volume", Name = "App Volume",
    Icon = "imgs/actions/audio/app-volume/icon", KeyImage = "imgs/actions/audio/app-volume/key", EncoderIcon = "imgs/actions/audio/app-volume/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Volume and mute for one app. Pick the app once; it keeps working after the app restarts.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Volume", TriggerPush = "Mute", TriggerTouch = "Mute")]
public sealed class AppVolumeAction : AudioActionBase<AppVolumeSettings>
{
    private IDisposable? _watch;

    protected override bool IsRelevant(AudioChange c) => c.Kind is AudioChangeKind.Sessions or AudioChangeKind.Availability;

    protected override Task OnAppearAsync(WillAppearEvent e)
    {
        _watch ??= Engine?.WatchSessions();
        return Task.CompletedTask;
    }

    private string? Key => string.IsNullOrWhiteSpace(Settings.App) ? null : AppNames.KeyFor(Settings.App);

    internal AudioApp? Current()
    {
        if (Key is not { } key || Engine is not { IsAvailable: true } e) return null;
        return e.GetApps().FirstOrDefault(a => a.Key == key);
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
        var app = Current();
        if (app is null || ticks == 0)
        {
            if (app is null) ShowAlert();
            Render();
            return;
        }
        var e = Engine!;
        var unmute = ticks > 0 && app.Muted ? e.SetAppMuteAsync(app.Key, null, false) : Task.CompletedTask;
        var set = e.SetAppVolumeAsync(app.Key, null, Math.Clamp(app.VolumePct + ticks * ClampStep(Settings.Step), 0, 100) / 100f);
        Render();
        await RunAsync(Task.WhenAll(unmute, set), "set app volume").ConfigureAwait(false);
    }

    private async Task ToggleMuteAsync()
    {
        var app = Current();
        if (app is null)
        {
            ShowAlert();
            Render();
            return;
        }
        var write = Engine!.SetAppMuteAsync(app.Key, null, !app.Muted);
        Render();
        if (IsDial) SettleLater();
        await RunAsync(write, "toggle app mute").ConfigureAwait(false);
    }

    protected override void Render()
    {
        var view = View();
        if (IsDial) ShowDial(view, AudioArt.VolumeDial(Theme, view, IsInteractive));
        else ShowKey(view, AudioArt.VolumeKey(Theme, view));
    }

    internal VolumeView View()
    {
        if (Engine is not { IsAvailable: true }) return new VolumeView(LevelKind.App, "NO AUDIO", 0, false, Unavailable: true);
        if (Key is not { } key) return new VolumeView(LevelKind.App, "APP", 0, false, Unavailable: true, Note: "PICK AN APP");
        var app = Current();
        if (app is null) return new VolumeView(LevelKind.App, AppNames.FromKey(key), 0, false, Unavailable: true, Note: "NOT RUNNING");
        return new VolumeView(LevelKind.App, TextFit.Readable(app.Name, AppNames.FromKey(app.Key)), app.VolumePct, app.Muted);
    }

    protected override void OnDisappear()
    {
        _watch?.Dispose();
        _watch = null;
    }

    protected override void DisposeCore() => OnDisappear();

    protected override Task<object?> OnAudioPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(type switch
    {
        "audio.apps" => AppOptions(),
        _ => null,
    });

    internal List<PiOption> AppOptions()
    {
        var list = new List<PiOption> { new("", "(pick an app that is playing)") };
        if (Engine is { IsAvailable: true } e)
            list.AddRange(e.GetApps().Select(a => new PiOption(a.Key, a.IsSystemSounds ? a.Name : $"{a.Name} ({a.Key})")));
        if (Key is { } key && list.All(o => o.Value != key)) list.Add(new(key, $"{AppNames.FromKey(key)} ({key}, not running)"));
        return list;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("App")
        .Select("app", "App", optionsFrom: "audio.apps")
        .Range("step", "Step per tick", 1, 10, 1, "%")
        .Select("keyPress", "Key press", [("mute", "Mute / unmute"), ("up", "Volume up"), ("down", "Volume down")])
        .Info("Tip", "Apps appear here while they have audio open. The choice is the program, so it survives restarts.")
        .Info("Now", stateKey: "status");

    protected override object? DescribeState()
    {
        var app = Current();
        return new { status = Key is null ? "No app chosen" : app is null ? "Not running" : $"{app.Name}: {app.VolumePct}%{(app.Muted ? ", muted" : "")}" };
    }
}
