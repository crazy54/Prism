namespace PrismControl.Spotify.Smtc;

/// <summary>What changed in a media-session update.</summary>
[Flags]
public enum SmtcChange
{
    None = 0,
    /// <summary>The shown session appeared, vanished or switched to another session.</summary>
    Session = 1,
    /// <summary>Title, artist, album or thumbnail.</summary>
    Media = 2,
    /// <summary>Play/pause, shuffle, repeat or enabled controls.</summary>
    Playback = 4,
    /// <summary>Position/duration (Spotify pushes one about every 4.5 s while playing).</summary>
    Timeline = 8,
    /// <summary>Something not shown changed: Spotify's own session while another app is shown, or the session list.</summary>
    Background = 16,
}

/// <summary>One read of a Windows media session (no login needed).</summary>
public sealed record SmtcSnapshot
{
    /// <summary>The session's AppUserModelId, e.g. "Spotify.exe".</summary>
    public required string AppId { get; init; }
    /// <summary>Identifies the session for commands: the AppUserModelId, plus "#2", "#3" when an app has several sessions.</summary>
    public string? SessionKey { get; init; }
    public string Key => SessionKey ?? AppId;
    public bool IsSpotify { get; init; }
    /// <summary>The app's friendly name ("Spotify", "Chrome"): text only, never a path.</summary>
    public string AppName { get; init; } = "";
    public PlayState State { get; init; }
    public string? Title { get; init; }
    /// <summary>SMTC exposes one artist string (Spotify joins multiple artists with ", ").</summary>
    public string? Artist { get; init; }
    public string? Album { get; init; }
    public TimeSpan? Duration { get; init; }
    /// <summary>Position at <see cref="PositionAt"/> (it is frozen between timeline events; interpolate while playing).</summary>
    public TimeSpan? Position { get; init; }
    public DateTimeOffset? PositionAt { get; init; }
    public bool? Shuffle { get; init; }
    public RepeatMode? Repeat { get; init; }
    /// <summary>The thumbnail exactly as the session returned it (Spotify: a 300×300 PNG; browsers: the page's artwork).</summary>
    public byte[]? Thumbnail { get; init; }
    public string? ThumbnailMime { get; init; }
    public string? ThumbnailHash { get; init; }
    public bool CanPlay { get; init; }
    public bool CanPause { get; init; }
    public bool CanNext { get; init; }
    public bool CanPrevious { get; init; }
    public bool CanSeek { get; init; }
    public bool CanShuffle { get; init; }
    public bool CanRepeat { get; init; }

    public bool HasMedia => !string.IsNullOrEmpty(Title);
}

/// <summary>A row of the session list (the PI and the read-only probe): names and states only, no titles.</summary>
public sealed record SmtcSessionInfo(string Key, string AppId, string AppName, bool IsSpotify, PlayState State, bool IsShown, bool IsWindowsCurrent);

/// <summary>
/// The Windows media sessions (SMTC): the no-login source of now playing and local transport, and the fast change signal
/// for the Web API poller. Every session is tracked; <see cref="Follow"/> picks the one the deck shows
/// (<see cref="SessionPolicy"/>), while <see cref="Spotify"/> always stays Spotify's own. Commands name the session they
/// are for, so a switch between a press and its command never redirects it. <see cref="Changed"/> is raised on
/// thread-pool threads; actions must marshal with <c>Post</c>.
/// </summary>
public interface IMediaSessionSource : IAsyncDisposable
{
    /// <summary>The session the deck shows (null: none, or Spotify with no local session, e.g. playing on a phone).</summary>
    SmtcSnapshot? Current { get; }

    /// <summary>Spotify's own session, whatever is shown (null when the Spotify app has none).</summary>
    SmtcSnapshot? Spotify { get; }

    /// <summary>Every session Windows lists right now.</summary>
    IReadOnlyList<SmtcSessionInfo> Sessions { get; }

    /// <summary>Which session the deck follows.</summary>
    MediaFollow Follow { get; set; }

    /// <summary>
    /// Spotify playback the Web API sees on another device (null = none). <see cref="MediaFollow.SpotifyFirst"/> counts
    /// Playing as "Spotify is playing", so a phone or speaker still wins over a browser.
    /// </summary>
    PlayState? SpotifyRemote { get; set; }

    event EventHandler<SmtcChange>? Changed;

    Task StartAsync(CancellationToken cancellationToken);

    /// <summary>Re-enumerates sessions now (e.g. Spotify.exe launched or quit).</summary>
    void Rebind();

    // Commands for one session (SmtcSnapshot.Key). False when it is gone, refuses, or throws.
    Task<bool> TogglePlayPauseAsync(string sessionKey);
    Task<bool> PlayAsync(string sessionKey);
    Task<bool> PauseAsync(string sessionKey);
    Task<bool> NextAsync(string sessionKey);
    Task<bool> PreviousAsync(string sessionKey);
    Task<bool> SeekAsync(string sessionKey, TimeSpan position);
    Task<bool> SetShuffleAsync(string sessionKey, bool on);
    Task<bool> SetRepeatAsync(string sessionKey, RepeatMode mode);
}
