using PrismControl.Core.Data;

namespace PrismControl.Spotify;

/// <summary>
/// Spotify's answer to Core's <see cref="INowPlayingControl"/>, for other modules' dials (Kaleidoscope). It forwards to
/// the shared <see cref="SpotifyService"/>, so the same coalescing, 429 handling and safe mode apply as on Spotify's own
/// keys. Registered only while Spotify owns <c>/v1/now-playing</c>.
/// <list type="bullet">
/// <item>Play/pause, next and previous follow the session /v1/now-playing shows (Spotify, or another app such as
/// YouTube in a browser), through the same routing as the deck's keys: SMTC, or the Web API for Spotify on another
/// device. A session that can't do it answers with a clear failure; otherwise the command is sent in the background.</item>
/// <item>Volume and seek stay Spotify-only (Spotify's device volume; seeking fails while another app is shown).</item>
/// </list>
/// </summary>
public sealed class SpotifyNowPlayingControl(SpotifyService service) : INowPlayingControl
{
    public string Source => "spotify";

    public NowPlayingCommandResult SetVolume(int percent) => Map(service.SetVolume(percent));
    public NowPlayingCommandResult AdjustVolume(int delta) => Map(service.AdjustVolume(delta));
    public NowPlayingCommandResult ToggleMute() => Map(service.ToggleMute());
    public NowPlayingCommandResult SeekBy(TimeSpan delta) => Map(service.SeekBy(delta));

    public NowPlayingCommandResult PlayPause() => Map(service.StartTransport(SpotifyService.Transport.PlayPause));
    public NowPlayingCommandResult Next() => Map(service.StartTransport(SpotifyService.Transport.Next));
    public NowPlayingCommandResult Previous() => Map(service.StartTransport(SpotifyService.Transport.Previous));

    private static NowPlayingCommandResult Map(CommandResult r) => r.Ok ? NowPlayingCommandResult.Success : NowPlayingCommandResult.Fail(r.Message ?? "Spotify couldn't do that");
}
