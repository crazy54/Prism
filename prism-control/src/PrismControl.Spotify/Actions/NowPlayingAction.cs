using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Spotify.Render;

namespace PrismControl.Spotify.Actions;

public sealed class NowPlayingSettings
{
    /// <summary>"seek" (default) or "skip": what turning the dial does.</summary>
    public string Rotate { get; set; } = "seek";
    /// <summary>Seconds per tick when seeking.</summary>
    public int SeekSeconds { get; set; } = 5;
}

/// <summary>
/// Now playing: album art and title on a key; art left with title, artist, progress and times on a dial / strip
/// segment / Galleon widget. Works without login (Windows media session) and gets richer after Connect.
/// Key: press = play/pause, hold = open the track in Spotify (the link back Spotify requires near art).
/// Dial: turn = seek (or skip), push = play/pause; Stream Deck + touch = play/pause, long touch = open in Spotify.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.now-playing", Name = "Now Playing",
    Icon = "imgs/actions/spotify/now-playing/icon", KeyImage = "imgs/actions/spotify/now-playing/key", EncoderIcon = "imgs/actions/spotify/now-playing/dial",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Album art and the current track. Press to play or pause; hold to open it in Spotify.",
    Layout = Layouts.Canvas.Path, PropertyInspector = SpotifyBinding.PiPage,
    TriggerRotate = "Seek", TriggerPush = "Play / Pause", TriggerTouch = "Play / Pause", TriggerLongTouch = "Open in Spotify")]
public sealed class NowPlayingAction : DialAction<NowPlayingSettings>, IDisposable
{
    private SpotifyBinding? _b;
    private Flash _flash;
    private long _lastSkip;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = SpotifyBinding.Attach(this, Services, GlobalSettings, SpotifyView.NowPlaying, Render);
        LongPressThreshold = TimeSpan.FromMilliseconds(600);
        if (IsDial)
        {
            SetFeedbackLayout(Layouts.Canvas.Path);
            UpdateTriggers();
        }
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(100));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    private SpotifyService? Svc => _b?.Service;

    private void UpdateTriggers()
    {
        var rotate = Settings.Rotate == "skip" ? "Next / Previous" : "Seek";
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription(rotate, "Play / Pause", "Play / Pause", "Open in Spotify");
        else SetTriggerDescription(rotate, "Play / Pause");
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e) => PlayPauseAsync();
    protected override Task OnDialPressAsync(DialUpEvent e) => PlayPauseAsync();

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        OpenInSpotify();
        return Task.CompletedTask;
    }

    protected override Task OnDialLongPressAsync(DialDownEvent e)
    {
        OpenInSpotify();   // Stream Deck + only; Galleon uses the key hold or touch-free key actions
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        if (e.Hold)
        {
            OpenInSpotify();
            return Task.CompletedTask;
        }
        return PlayPauseAsync();
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (Svc is not { } svc || e.Ticks == 0) return;
        CommandResult r;
        if (Settings.Rotate == "skip")
        {
            // One skip per turn burst: ignore further events for 400 ms (Galleon aggregates spins anyway).
            if (Time.GetElapsedTime(_lastSkip) < TimeSpan.FromMilliseconds(400) && _lastSkip != 0) return;
            _lastSkip = Time.GetTimestamp();
            r = e.Ticks > 0 ? await svc.NextAsync() : await svc.PreviousAsync();
        }
        else r = svc.SeekBy(TimeSpan.FromSeconds(e.Ticks * Math.Clamp(Settings.SeekSeconds, 1, 60)));
        if (!r.Ok && r.Message is { } m) _flash.Set(Time, m, true, TimeSpan.FromSeconds(2));
        Render();
    }

    private async Task PlayPauseAsync()
    {
        if (Svc is not { } svc) { ShowAlert(); return; }
        var r = await svc.TogglePlayPauseAsync();
        if (!r.Ok)
        {
            ShowAlert();
            if (r.Message is { } m) _flash.Set(Time, m, true, TimeSpan.FromSeconds(2.5));
        }
        Render();
    }

    private void OpenInSpotify()
    {
        var link = Svc?.LinkBack();
        OpenUrl(link ?? "spotify:");
    }

    protected override Task OnSettingsChangedAsync(NowPlayingSettings settings)
    {
        if (IsDial) UpdateTriggers();
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Now Playing")
        .Select("rotate", "Turning the dial", [("seek", "Seeks (5 s per tick)"), ("skip", "Skips to the next / previous track")])
        .Number("seekSeconds", "Seconds per tick", 1, 60, 1);

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
        var now = Time.GetUtcNow();
        var snap = Svc?.Current ?? PlayerSnapshot.Empty;
        var flash = _flash.Get(Time);
        if (IsDial)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame,
                Svc is null
                    ? SpotifyArt.MessageDial(Theme, "Spotify", "Spotify is unavailable", "See the plugin log", IsInteractive, warn: true)
                    : SpotifyArt.NowPlayingDial(Theme, snap, now, IsInteractive, flash ?? StatusNotice())));
        }
        else
        {
            var hint = flash is { } f ? SpotifyText.KeyHint(f.Text) : null;
            if (!snap.HasItem) hint ??= Svc is null ? "UNAVAILABLE" : Svc.Status.Auth == AuthState.NeedsReconnect ? "RECONNECT" : null;
            SetImage(SpotifyArt.NowPlayingKey(Theme, snap, now, hint));
        }
    }

    private FrameNotice? StatusNotice()
    {
        if (Svc is not { } svc) return null;
        var s = svc.Status;
        var now = svc.Time.GetUtcNow();
        if (s.Notice is { } n && s.NoticeUntil is { } u && u > now) return new FrameNotice(n, n != "Starting Spotify…");
        if (s.IsBasicMode(now)) return new FrameNotice(SpotifyText.BasicMode, true);
        if (s.IsBusy(now)) return new FrameNotice(SpotifyText.Busy(s.BusyUntil!.Value, now), true);
        return null;
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
