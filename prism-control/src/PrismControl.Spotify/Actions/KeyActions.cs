using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Theming;
using PrismControl.Spotify.Render;

namespace PrismControl.Spotify.Actions;

/// <summary>
/// Shared plumbing for the Spotify key actions: binding to the service, redraw on change, a 2.5 s hint after a failed
/// press (plus showAlert), and the Connect PI. Abstract, so discovery skips it.
/// </summary>
public abstract class SpotifyKeyBase : KeyAction, IDisposable
{
    private SpotifyBinding? _b;
    private Flash _flash;
    private IDisposable? _lookWatch;

    protected SpotifyService? Svc => _b?.Service;

    /// <summary>The palette to draw with: Spotify's app look when a Kaleidoscope deck shows Spotify, else Prism (core.theme).</summary>
    protected RefractionPalette Look => AppTheming.For(Services, Device.Id, Theme)?.Palette ?? Theme;
    protected abstract SpotifyView View { get; }
    /// <summary>
    /// True for keys that always draw and control Spotify (like, shuffle, repeat), whatever app the deck shows; false for
    /// the transport keys, which follow the shown session (YouTube in a browser, any player).
    /// </summary>
    protected virtual bool SpotifyOnly => false;
    protected abstract Task<CommandResult> ExecuteAsync(SpotifyService svc);
    /// <summary>Draws the key. <paramref name="hint"/> is a short failure label to show (or null).</summary>
    protected abstract SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot snap, string? hint);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = SpotifyBinding.Attach(this, Services, GlobalSettings, View, Render);
        _lookWatch?.Dispose();
        _lookWatch = AppTheming.Watch(Services, Device.Id, () => Post(Render));
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Svc is not { } svc) { ShowAlert(); return; }
        var r = await ExecuteAsync(svc);
        if (!r.Ok)
        {
            // A Spotify-only key pressed while another app is in front stays calm: the hint says why, no alert.
            if (!(SpotifyOnly && OtherApp(svc))) ShowAlert();
            if (r.Message is { } m) _flash.Set(Time, m, true, TimeSpan.FromSeconds(2.5));
        }
        else _flash.Clear();
        Render();
    }

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => SpotifyBinding.PiState(Svc, GlobalSettings);

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _b?.PushPiState(force: true);
        return Task.CompletedTask;
    }

    protected void Render()
    {
        if (!IsVisible) return;
        var hint = _flash.Get(Time) is { } f ? SpotifyText.KeyHint(f.Text) : null;
        var svc = Svc;
        SetImage(Draw(Look, svc, svc is null ? PlayerSnapshot.Empty : SpotifyOnly ? svc.SpotifyCurrent : svc.Current, hint));
    }

    /// <summary>The calm label a Spotify-only key wears while another app is shown: it still controls Spotify.</summary>
    protected const string SpotifyLabel = "SPOTIFY";

    /// <summary>Another app is in front (the Spotify-only keys then say "SPOTIFY", never an error).</summary>
    protected static bool OtherApp(SpotifyService? svc) => svc?.OtherAppShown ?? false;

    /// <summary>The shown app's name on a transport key while it isn't Spotify ("CHROME"); text only, no logos.</summary>
    protected static string? AppLabel(PlayerSnapshot s) => s.IsOtherApp && s.AppName is { Length: > 0 } a ? a.ToUpperInvariant() : null;

    /// <summary>"SIGN IN" / "RECONNECT" for Web-API-only keys when not connected.</summary>
    protected static string? SignInLabel(SpotifyService? svc) => svc is null ? "UNAVAILABLE" : svc.Status.Auth switch
    {
        AuthState.Connected => null,
        AuthState.NeedsReconnect => "RECONNECT",
        AuthState.Connecting => "SIGNING IN",
        _ => "SIGN IN",
    };

    protected static bool CanTransport(SpotifyService? svc, PlayerSnapshot s) =>
        svc is not null && (s.HasItem || s.Private || svc.IsConnected || svc.Smtc.Current is not null || svc.Smtc.Spotify is not null);

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
        _lookWatch?.Dispose();
        _lookWatch = null;
    }
}

/// <summary>
/// Play / pause on what Now Playing shows: Spotify (SMTC for the desktop app on this PC, the Web API for other devices),
/// or another app's media session (YouTube in a browser, any player), whose name then shows under the glyph.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.play-pause", Name = "Play / Pause",
    Icon = "imgs/actions/spotify/play-pause/icon", KeyImage = "imgs/actions/spotify/play-pause/key",
    Tooltip = "Play or pause what Now Playing shows: Spotify, or another app such as YouTube in a browser. No sign-in needed on this PC.",
    PropertyInspector = SpotifyBinding.PiPage)]
public sealed class PlayPauseAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.TogglePlayPauseAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, s.IsPlaying, CanTransport(svc, s) && s.CanPlayPause, AppLabel(s))
        : SpotifyArt.GlyphKey(t, s.IsPlaying ? SpotifyGlyphs.Pause : SpotifyGlyphs.Play, hint, on: false);
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.next", Name = "Next Track",
    Icon = "imgs/actions/spotify/next/icon", KeyImage = "imgs/actions/spotify/next/key",
    Tooltip = "Skip to the next track in what Now Playing shows (Spotify or another app).", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class NextAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.NextAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.Next, s.IsPlaying, CanTransport(svc, s) && s.CanSkipNext, AppLabel(s))
        : SpotifyArt.GlyphKey(t, SpotifyGlyphs.Next, hint, on: false);
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.previous", Name = "Previous Track",
    Icon = "imgs/actions/spotify/previous/icon", KeyImage = "imgs/actions/spotify/previous/key",
    Tooltip = "Go back to the previous track in what Now Playing shows (the player decides between restarting and the previous one).",
    PropertyInspector = SpotifyBinding.PiPage)]
public sealed class PreviousAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.PreviousAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.Previous, s.IsPlaying, CanTransport(svc, s) && s.CanSkipPrevious, AppLabel(s))
        : SpotifyArt.GlyphKey(t, SpotifyGlyphs.Previous, hint, on: false);
}

/// <summary>The heart: filled when the current track is in Liked Songs. Needs Connect (Web API library endpoints).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.like", Name = "Like",
    Icon = "imgs/actions/spotify/like/icon", KeyImage = "imgs/actions/spotify/like/key",
    Tooltip = "Add the current track to Liked Songs, or remove it. Needs Connect.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class LikeAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Like;
    protected override bool SpotifyOnly => true;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.ToggleLikeAsync();

    /// <summary>Spotify's track (the snapshot is <see cref="SpotifyService.SpotifyCurrent"/>), with "SPOTIFY" while another app is shown.</summary>
    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var connected = svc?.IsConnected ?? false;
        return SpotifyArt.LikeKey(t, connected ? s.Liked : null, connected && s.CanLike, hint ?? SignInLabel(svc) ?? (OtherApp(svc) ? SpotifyLabel : null));
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.shuffle", Name = "Shuffle",
    Icon = "imgs/actions/spotify/shuffle/icon", KeyImage = "imgs/actions/spotify/shuffle/key",
    Tooltip = "Turn shuffle on or off.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class ShuffleAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override bool SpotifyOnly => true;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.ToggleShuffleAsync();

    /// <summary>Spotify's shuffle (Web API, or Spotify's own session), with "SPOTIFY" while another app is shown.</summary>
    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var enabled = svc is not null && (svc.IsConnected || svc.Smtc.Spotify is { CanShuffle: true });
        return SpotifyArt.ShuffleKey(t, s.Shuffle, enabled, hint ?? (enabled ? OtherApp(svc) ? SpotifyLabel : null : SignInLabel(svc)));
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.repeat", Name = "Repeat",
    Icon = "imgs/actions/spotify/repeat/icon", KeyImage = "imgs/actions/spotify/repeat/key",
    Tooltip = "Cycle repeat: off, playlist or album, this track.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class RepeatAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override bool SpotifyOnly => true;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.CycleRepeatAsync();

    /// <summary>Spotify's repeat (Web API, or Spotify's own session), with "SPOTIFY" while another app is shown.</summary>
    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var enabled = svc is not null && (svc.IsConnected || svc.Smtc.Spotify is { CanRepeat: true });
        return SpotifyArt.RepeatKey(t, s.Repeat, enabled, hint ?? (enabled ? OtherApp(svc) ? SpotifyLabel : null : SignInLabel(svc)));
    }
}
