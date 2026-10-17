using System.Text.Json.Nodes;
using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Audio;

public sealed class MixerSettings
{
    /// <summary>"default": apps playing on the default output; "all": apps on any output.</summary>
    public string Scope { get; set; } = "default";
    /// <summary>Percent per dial tick while adjusting.</summary>
    public int Step { get; set; } = 2;
    /// <summary>Seconds without input before adjust mode goes back to the list (0 = stay).</summary>
    public int ReturnAfter { get; set; } = 8;
    /// <summary>Leave out audio routing tools (Sonar, Wave Link, RTX Voice, Voicemeeter, ...): they carry other apps' sound (<see cref="RoutingApps"/>).</summary>
    public bool HideRouting { get; set; } = true;
}

/// <summary>
/// The app mixer dial. List mode: turn to pick an app (one step per Stream Deck + tick; fast Galleon spins move up to 3).
/// Push: adjust that app; turn to change its volume (turn below 0% to mute, up to unmute); push again for the list.
/// Stream Deck + touch toggles the shown app's mute. Session tracking runs only while a mixer is visible.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.mixer", Name = "App Mixer",
    Icon = "imgs/actions/audio/mixer/icon", KeyImage = "imgs/actions/audio/mixer/key", EncoderIcon = "imgs/actions/audio/mixer/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to pick an app, push to adjust it, turn to set its volume, push again to go back to the list.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Pick app / volume", TriggerPush = "Adjust / back", TriggerTouch = "Mute app")]
public sealed class MixerAction : AudioActionBase<MixerSettings>
{
    private IDisposable? _watch;
    private string? _selected;
    private bool _adjusting;
    private ITimer? _returnTimer;

    internal bool IsAdjusting => _adjusting;
    internal string? SelectedApp => _selected;

    protected override bool IsRelevant(AudioChange c) => c.Kind != AudioChangeKind.Endpoint;

    protected override Task OnAppearAsync(WillAppearEvent e)
    {
        _watch ??= Engine?.WatchSessions();
        return Task.CompletedTask;
    }

    private bool AllOutputs => string.Equals(Settings.Scope, "all", StringComparison.OrdinalIgnoreCase);

    /// <summary>The device the mixer is scoped to (null = every output).</summary>
    private string? ScopeDevice => AllOutputs ? null : Engine?.GetDefaultId(AudioFlow.Render, AudioRole.Console);

    internal IReadOnlyList<AudioApp> Apps()
    {
        if (Engine is not { IsAvailable: true } e) return [];
        if (!AllOutputs && ScopeDevice is null) return [];
        var apps = e.GetApps(ScopeDevice);
        return Settings.HideRouting ? apps.Where(a => !RoutingApps.IsRouting(a.Key)).ToList() : apps;
    }

    private (IReadOnlyList<AudioApp> Apps, int Index) Selection()
    {
        var apps = Apps();
        if (apps.Count == 0) return (apps, -1);
        var i = -1;
        for (var k = 0; k < apps.Count; k++) if (apps[k].Key == _selected) { i = k; break; }
        if (i < 0)
        {
            i = 0;
            _selected = apps[0].Key;
        }
        return (apps, i);
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        var (apps, i) = Selection();
        if (apps.Count == 0)
        {
            _adjusting = false;
            Render();
            return;
        }
        if (!_adjusting)
        {
            _selected = apps[Math.Clamp(i + ListStep(e.Ticks), 0, apps.Count - 1)].Key;
            Render();
            SettleLater();
            return;
        }
        RestartReturnTimer();
        await AdjustAsync(apps[i], e.Ticks).ConfigureAwait(false);
        SettleLater();
    }

    private async Task AdjustAsync(AudioApp app, int ticks)
    {
        var e = Engine!;
        Task write;
        if (ticks > 0 && app.Muted) write = e.SetAppMuteAsync(app.Key, ScopeDevice, false);
        else if (ticks < 0 && app.VolumePct == 0) write = app.Muted ? Task.CompletedTask : e.SetAppMuteAsync(app.Key, ScopeDevice, true);
        else write = e.SetAppVolumeAsync(app.Key, ScopeDevice, Math.Clamp(app.VolumePct + ticks * ClampStep(Settings.Step), 0, 100) / 100f);
        Render();
        await RunAsync(write, "set app volume").ConfigureAwait(false);
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        var (apps, _) = Selection();
        _adjusting = apps.Count > 0 && !_adjusting;
        if (_adjusting) RestartReturnTimer();
        else StopReturnTimer();
        Render();
        SettleLater();
        return Task.CompletedTask;
    }

    protected override async Task OnTouchTapAsync(TouchTapEvent e)
    {
        var (apps, i) = Selection();
        if (i < 0) return;
        var app = apps[i];
        var write = Engine!.SetAppMuteAsync(app.Key, ScopeDevice, !app.Muted);
        Render();
        await RunAsync(write, "toggle app mute").ConfigureAwait(false);
    }

    private void RestartReturnTimer()
    {
        StopReturnTimer();
        if (Settings.ReturnAfter <= 0) return;
        _returnTimer = Time.CreateTimer(_ => Post(() =>
        {
            _adjusting = false;
            Render();
        }), null, TimeSpan.FromSeconds(Math.Clamp(Settings.ReturnAfter, 1, 600)), Timeout.InfiniteTimeSpan);
    }

    private void StopReturnTimer()
    {
        _returnTimer?.Dispose();
        _returnTimer = null;
    }

    protected override void Render()
    {
        var view = View();
        ShowDial(view, AudioArt.MixerDial(Theme, view, IsInteractive));
    }

    internal MixerView View()
    {
        if (Engine is not { IsAvailable: true }) return new MixerView(false, "", 0, false, false, 0, 0, Unavailable: true);
        var (apps, i) = Selection();
        if (i < 0)
        {
            _adjusting = false;
            return new MixerView(false, "", 0, false, false, 0, 0, Empty: true);
        }
        var a = apps[i];
        return new MixerView(_adjusting, TextFit.Readable(a.Name, AppNames.FromKey(a.Key)), a.VolumePct, a.Muted, a.IsActive, i, apps.Count);
    }

    protected override void OnDisappear()
    {
        StopReturnTimer();
        _watch?.Dispose();
        _watch = null;
    }

    protected override void DisposeCore() => OnDisappear();

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Mixer")
        .Select("scope", "Apps on", [("default", "The default output"), ("all", "Any output")])
        .Range("step", "Step per tick", 1, 10, 1, "%")
        .Number("returnAfter", "Back to the list after (s, 0 = never)", 0, 120, 1)
        .Checkbox("hideRouting", "Hide routing apps (Sonar, Wave Link, RTX Voice, Voicemeeter, ...)")
        .Info("Use", "Turn to pick an app, push to adjust it. Turn below 0% to mute; turn up to unmute.")
        .Info("Apps", stateKey: "status");

    protected override object? DescribeState()
    {
        var apps = Apps();
        return new { status = apps.Count == 0 ? "No apps with audio" : string.Join(", ", apps.Select(a => a.Name)) };
    }

    protected override Task<object?> OnAudioPiMessageAsync(string type, JsonNode? data) => Task.FromResult<object?>(null);
}
