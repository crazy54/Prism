using PrismControl.Core.Data;

namespace PrismControl.Spotify;

/// <summary>
/// Spotify's answer to Core's <see cref="INowPlayingControl"/>, for other modules' dials (Kaleidoscope). It forwards to
/// the shared <see cref="SpotifyService"/>, so the same coalescing, 429 handling and safe mode apply as on Spotify's own
/// keys. Registered only while Spotify owns <c>/v1/now-playing</c>.
/// </summary>
public sealed class SpotifyNowPlayingControl(SpotifyService service) : INowPlayingControl
{
    public string Source => "spotify";

    public NowPlayingCommandResult SetVolume(int percent) => Map(service.SetVolume(percent));
    public NowPlayingCommandResult AdjustVolume(int delta) => Map(service.AdjustVolume(delta));
    public NowPlayingCommandResult ToggleMute() => Map(service.ToggleMute());
    public NowPlayingCommandResult SeekBy(TimeSpan delta) => Map(service.SeekBy(delta));

    private static NowPlayingCommandResult Map(CommandResult r) => r.Ok ? NowPlayingCommandResult.Success : NowPlayingCommandResult.Fail(r.Message ?? "Spotify couldn't do that");
}
