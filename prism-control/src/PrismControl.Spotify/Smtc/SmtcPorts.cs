namespace PrismControl.Spotify.Smtc;

/// <summary>A session's media properties, as Windows returned them (no policy, no cleanup beyond trimming).</summary>
public sealed record SmtcMediaRead
{
    public string? Title { get; init; }
    public string? Artist { get; init; }
    public string? AlbumTitle { get; init; }
    public string? AlbumArtist { get; init; }
    /// <summary>The thumbnail bytes exactly as the session gave them (null when it has none).</summary>
    public byte[]? Thumbnail { get; init; }
    public string? ThumbnailMime { get; init; }
}

/// <summary>A session's playback info: state, shuffle/repeat and which controls it accepts.</summary>
public sealed record SmtcPlaybackRead
{
    public PlayState State { get; init; }
    public bool? Shuffle { get; init; }
    public RepeatMode? Repeat { get; init; }
    public bool CanPlay { get; init; }
    public bool CanPause { get; init; }
    public bool CanNext { get; init; }
    public bool CanPrevious { get; init; }
    public bool CanSeek { get; init; }
    public bool CanShuffle { get; init; }
    public bool CanRepeat { get; init; }
}

/// <summary>A session's timeline (Windows freezes it between timeline events; interpolate while playing).</summary>
public sealed record SmtcTimelineRead(TimeSpan Start, TimeSpan End, TimeSpan Position, DateTimeOffset LastUpdated);

/// <summary>
/// One Windows media session (<c>GlobalSystemMediaTransportControlsSession</c>), behind a port so the follow policy can
/// be tested with fakes. Reads never change playback; only the Try* commands do. Events fire on thread-pool threads.
/// </summary>
public interface ISmtcSessionPort
{
    /// <summary>The AppUserModelId, e.g. "Spotify.exe", "Chrome", "MSEdge".</summary>
    string AppId { get; }
    /// <summary>The app's friendly name ("Chrome", "Edge"): never a process path.</summary>
    string AppName { get; }

    Task<SmtcMediaRead> ReadMediaAsync();
    SmtcPlaybackRead ReadPlayback();
    SmtcTimelineRead ReadTimeline();

    event EventHandler? MediaChanged;
    event EventHandler? PlaybackChanged;
    event EventHandler? TimelineChanged;

    Task<bool> TogglePlayPauseAsync();
    Task<bool> PlayAsync();
    Task<bool> PauseAsync();
    Task<bool> NextAsync();
    Task<bool> PreviousAsync();
    Task<bool> SeekAsync(TimeSpan position);
    Task<bool> SetShuffleAsync(bool on);
    Task<bool> SetRepeatAsync(RepeatMode mode);
}

/// <summary>The Windows media session manager (<c>GlobalSystemMediaTransportControlsSessionManager</c>) behind a port.</summary>
public interface ISmtcManagerPort
{
    IReadOnlyList<ISmtcSessionPort> GetSessions();
    /// <summary>Windows' own "current" session (what the volume flyout shows), or null.</summary>
    ISmtcSessionPort? GetCurrentSession();
    event EventHandler? SessionsChanged;
    event EventHandler? CurrentSessionChanged;
}
