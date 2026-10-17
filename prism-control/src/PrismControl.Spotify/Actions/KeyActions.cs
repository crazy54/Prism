using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
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

    protected SpotifyService? Svc => _b?.Service;
    protected abstract SpotifyView View { get; }
    protected abstract Task<CommandResult> ExecuteAsync(SpotifyService svc);
    /// <summary>Draws the key. <paramref name="hint"/> is a short failure label to show (or null).</summary>
    protected abstract SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot snap, string? hint);

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = SpotifyBinding.Attach(this, Services, GlobalSettings, View, Render);
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
            ShowAlert();
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
        SetImage(Draw(Theme, Svc, Svc?.Current ?? PlayerSnapshot.Empty, hint));
    }

    /// <summary>"SIGN IN" / "RECONNECT" for Web-API-only keys when not connected.</summary>
    protected static string? SignInLabel(SpotifyService? svc) => svc is null ? "UNAVAILABLE" : svc.Status.Auth switch
    {
        AuthState.Connected => null,
        AuthState.NeedsReconnect => "RECONNECT",
        AuthState.Connecting => "SIGNING IN",
        _ => "SIGN IN",
    };

    protected static bool CanTransport(SpotifyService? svc, PlayerSnapshot s) =>
        svc is not null && (s.HasItem || svc.IsConnected || svc.Smtc.Current is not null);

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

/// <summary>Play / pause (SMTC for the desktop app on this PC, the Web API for other devices).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.play-pause", Name = "Play / Pause",
    Icon = "imgs/actions/spotify/play-pause/icon", KeyImage = "imgs/actions/spotify/play-pause/key",
    Tooltip = "Play or pause Spotify. Works without connecting for the Spotify app on this PC.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class PlayPauseAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.TogglePlayPauseAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, s.IsPlaying, CanTransport(svc, s))
        : SpotifyArt.GlyphKey(t, s.IsPlaying ? SpotifyGlyphs.Pause : SpotifyGlyphs.Play, hint, on: false);
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.next", Name = "Next Track",
    Icon = "imgs/actions/spotify/next/icon", KeyImage = "imgs/actions/spotify/next/key",
    Tooltip = "Skip to the next track in Spotify.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class NextAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.NextAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.Next, s.IsPlaying, CanTransport(svc, s))
        : SpotifyArt.GlyphKey(t, SpotifyGlyphs.Next, hint, on: false);
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.previous", Name = "Previous Track",
    Icon = "imgs/actions/spotify/previous/icon", KeyImage = "imgs/actions/spotify/previous/key",
    Tooltip = "Go back to the previous track (Spotify decides between restarting and the previous one).", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class PreviousAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.PreviousAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint) => hint is null
        ? SpotifyArt.TransportKey(t, TransportGlyph.Previous, s.IsPlaying, CanTransport(svc, s))
        : SpotifyArt.GlyphKey(t, SpotifyGlyphs.Previous, hint, on: false);
}

/// <summary>The heart: filled when the current track is in Liked Songs. Needs Connect (Web API library endpoints).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.like", Name = "Like",
    Icon = "imgs/actions/spotify/like/icon", KeyImage = "imgs/actions/spotify/like/key",
    Tooltip = "Add the current track to Liked Songs, or remove it. Needs Connect.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class LikeAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Like;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.ToggleLikeAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var connected = svc?.IsConnected ?? false;
        return SpotifyArt.LikeKey(t, connected ? s.Liked : null, connected && s.CanLike, hint ?? SignInLabel(svc));
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.shuffle", Name = "Shuffle",
    Icon = "imgs/actions/spotify/shuffle/icon", KeyImage = "imgs/actions/spotify/shuffle/key",
    Tooltip = "Turn shuffle on or off.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class ShuffleAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.ToggleShuffleAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var enabled = svc is not null && (svc.IsConnected || svc.Smtc.Current is { CanShuffle: true });
        return SpotifyArt.ShuffleKey(t, s.Shuffle, enabled, hint ?? (enabled ? null : SignInLabel(svc)));
    }
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.repeat", Name = "Repeat",
    Icon = "imgs/actions/spotify/repeat/icon", KeyImage = "imgs/actions/spotify/repeat/key",
    Tooltip = "Cycle repeat: off, playlist or album, this track.", PropertyInspector = SpotifyBinding.PiPage)]
public sealed class RepeatAction : SpotifyKeyBase
{
    protected override SpotifyView View => SpotifyView.Transport;
    protected override Task<CommandResult> ExecuteAsync(SpotifyService svc) => svc.CycleRepeatAsync();

    protected override SvgDocument Draw(RefractionPalette t, SpotifyService? svc, PlayerSnapshot s, string? hint)
    {
        var enabled = svc is not null && (svc.IsConnected || svc.Smtc.Current is { CanRepeat: true });
        return SpotifyArt.RepeatKey(t, s.Repeat, enabled, hint ?? (enabled ? null : SignInLabel(svc)));
    }
}
