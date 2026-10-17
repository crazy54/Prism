namespace PrismControl.Spotify.Smtc;

/// <summary>What changed in a media-session update.</summary>
[Flags]
public enum SmtcChange
{
    None = 0,
    /// <summary>The followed session appeared, vanished or switched apps.</summary>
    Session = 1,
    /// <summary>Title, artist, album or thumbnail.</summary>
    Media = 2,
    /// <summary>Play/pause, shuffle, repeat or enabled controls.</summary>
    Playback = 4,
    /// <summary>Position/duration (Spotify pushes one about every 4.5 s while playing).</summary>
    Timeline = 8,
}

/// <summary>One read of the followed Windows media session (no login needed).</summary>
public sealed record SmtcSnapshot
{
    /// <summary>The session's AppUserModelId, e.g. "Spotify.exe".</summary>
    public required string AppId { get; init; }
    public bool IsSpotify { get; init; }
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
    /// <summary>The thumbnail exactly as the session returned it (Spotify: a 300×300 PNG).</summary>
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

/// <summary>
/// The Windows media session (SMTC) for the Spotify desktop app: the no-login source of now playing and local
/// transport, and the fast change signal for the Web API poller. <see cref="Changed"/> is raised on thread-pool threads;
/// actions must marshal with <c>Post</c>.
/// </summary>
public interface IMediaSessionSource : IAsyncDisposable
{
    SmtcSnapshot? Current { get; }

    /// <summary>When true and no Spotify session exists, follow Windows' current media session (any app).</summary>
    bool FollowAnyApp { get; set; }

    event EventHandler<SmtcChange>? Changed;

    Task StartAsync(CancellationToken cancellationToken);

    /// <summary>Re-enumerates sessions now (e.g. Spotify.exe launched or quit).</summary>
    void Rebind();

    Task<bool> TogglePlayPauseAsync();
    Task<bool> PlayAsync();
    Task<bool> PauseAsync();
    Task<bool> NextAsync();
    Task<bool> PreviousAsync();
    Task<bool> SeekAsync(TimeSpan position);
    Task<bool> SetShuffleAsync(bool on);
    Task<bool> SetRepeatAsync(RepeatMode mode);
}
