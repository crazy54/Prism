namespace PrismControl.Core.Data;

/// <summary>
/// Commands for whichever module publishes <c>/v1/now-playing</c> (Spotify today), so another module (Kaleidoscope's
/// volume and seek dials) can drive playback without referencing that module. The publisher registers one in the
/// service registry; absent means read-only now-playing. Every write goes through the publisher's own rules: its update
/// coalescing, rate limits and safe mode (in safe mode nothing reaches the player).
/// </summary>
public interface INowPlayingControl
{
    /// <summary>Who answers, the same as the now-playing envelope's <c>source</c> (e.g. "spotify").</summary>
    string Source { get; }

    /// <summary>The player's own volume, 0–100. Latest-wins: a fast spin sends only the newest value.</summary>
    NowPlayingCommandResult SetVolume(int percent);

    /// <summary>Volume by a signed step (e.g. dial ticks × step).</summary>
    NowPlayingCommandResult AdjustVolume(int delta);

    /// <summary>Mute (remembering the level) or restore it.</summary>
    NowPlayingCommandResult ToggleMute();

    /// <summary>Moves the position by a signed delta; ticks accumulate and one seek goes out after the dial stops.</summary>
    NowPlayingCommandResult SeekBy(TimeSpan delta);

    // Transport (2026-10-18). Unlike volume and seek, these follow the session /v1/now-playing shows right now, which can
    // be another app than Source (the envelope then says source "smtc" and app "Chrome", for example). The command goes
    // out in the background; Fail means the shown session can't take it (nothing is shown, or the app has no such
    // control). The default bodies keep older implementations compiling: they answer "not supported".

    /// <summary>Play or pause the shown session.</summary>
    NowPlayingCommandResult PlayPause() => NowPlayingCommandResult.Fail("Play/pause isn't supported here");

    /// <summary>Skip to the next item in the shown session.</summary>
    NowPlayingCommandResult Next() => NowPlayingCommandResult.Fail("Skipping isn't supported here");

    /// <summary>Go to the previous item (or restart the current one, as the player decides) in the shown session.</summary>
    NowPlayingCommandResult Previous() => NowPlayingCommandResult.Fail("Skipping back isn't supported here");
}

/// <summary>A command's outcome. <see cref="Message"/> is a short, user-facing reason when it failed (e.g. "Connect Spotify").</summary>
public readonly record struct NowPlayingCommandResult(bool Ok, string? Message = null)
{
    public static NowPlayingCommandResult Success => new(true);
    public static NowPlayingCommandResult Fail(string message) => new(false, message);
}
