namespace PrismControl.Spotify;

public enum PlayState { None, Stopped, Paused, Playing }

/// <summary>Spotify's repeat cycle: off → context → track → off.</summary>
public enum RepeatMode { Off, Context, Track }

/// <summary>Where the current now-playing data came from.</summary>
public enum SnapshotSource { None, Smtc, WebApi }

/// <summary>
/// Album/playlist art. <see cref="Original"/> holds the bytes exactly as Spotify (or the Windows media session) returned
/// them, for the data API. <see cref="Display"/> is a resized copy for embedding in frames (resizing is allowed; cropping,
/// masking, tinting and overlays are not).
/// </summary>
public sealed class ArtImage
{
    public required byte[] Original { get; init; }
    public required string Mime { get; init; }
    /// <summary>First 16 hex chars of the SHA-256 of <see cref="Original"/>.</summary>
    public required string Hash { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }
    /// <summary>Bytes to embed (a downscaled JPEG, or the original when scaling is not needed or failed).</summary>
    public required byte[] Display { get; init; }
    /// <summary>CDN URL for Web API art; null for SMTC thumbnails.</summary>
    public string? SourceUrl { get; init; }
}

/// <summary>The merged player state the actions draw (SMTC + Web API). Immutable; compare with <see cref="Signature"/>.</summary>
public sealed record PlayerSnapshot
{
    public static readonly PlayerSnapshot Empty = new();

    public SnapshotSource Source { get; init; }
    /// <summary>"Spotify", or the shown media app's friendly name ("Chrome", "Edge"): text only, never a path.</summary>
    public string? AppName { get; init; }
    public bool IsSpotify { get; init; } = true;
    /// <summary>The other app's Windows media session this snapshot shows (its commands go there). Null for Spotify.</summary>
    public string? SessionKey { get; init; }
    /// <summary>
    /// Streamer-safe hid this other app's title, artist, album and art (a browser tab title can be private). The app
    /// name, state and position stay.
    /// </summary>
    public bool Private { get; init; }
    /// <summary>What the shown session accepts (Windows' control flags for other apps; always true for Spotify).</summary>
    public bool CanPlayPause { get; init; } = true;
    public bool CanSkipNext { get; init; } = true;
    public bool CanSkipPrevious { get; init; } = true;
    public PlayState State { get; init; }
    /// <summary>"track", "episode", "ad" or "unknown" (null for SMTC).</summary>
    public string? ItemType { get; init; }
    public string? Title { get; init; }
    public IReadOnlyList<string> Artists { get; init; } = [];
    public string? Album { get; init; }
    /// <summary>spotify:track:… (Web API only).</summary>
    public string? Uri { get; init; }
    /// <summary>Link back (https://open.spotify.com/…), Web API only.</summary>
    public string? Url { get; init; }
    public bool IsLocalFile { get; init; }
    public long? DurationMs { get; init; }
    public long? PositionMs { get; init; }
    public DateTimeOffset? PositionAt { get; init; }
    public bool? Shuffle { get; init; }
    public RepeatMode? Repeat { get; init; }
    /// <summary>Null = unknown (signed out, SMTC only, or not checked yet).</summary>
    public bool? Liked { get; init; }
    public int? VolumePct { get; init; }
    public bool SupportsVolume { get; init; }
    public string? ContextUri { get; init; }
    public string? ContextName { get; init; }
    public string? DeviceId { get; init; }
    public string? DeviceName { get; init; }
    public bool DeviceIsLocal { get; init; }
    /// <summary>The device accepts no Web API commands.</summary>
    public bool DeviceRestricted { get; init; }
    public ArtImage? Art { get; init; }

    public bool HasItem => !string.IsNullOrEmpty(Title);
    /// <summary>Another app's session is shown (not Spotify).</summary>
    public bool IsOtherApp => !IsSpotify && SessionKey is not null;
    public bool IsPlaying => State == PlayState.Playing;
    public string ArtistLine => string.Join(", ", Artists);

    /// <summary>Like is possible for Spotify tracks and episodes (not local files, ads or SMTC-only data).</summary>
    public bool CanLike => Uri is { } u && !IsLocalFile && (u.StartsWith("spotify:track:", StringComparison.Ordinal) || u.StartsWith("spotify:episode:", StringComparison.Ordinal));

    /// <summary>Position interpolated to <paramref name="now"/> while playing, clamped to the duration.</summary>
    public long? PositionNow(DateTimeOffset now)
    {
        if (PositionMs is not { } p) return null;
        var pos = p;
        if (IsPlaying && PositionAt is { } at)
        {
            var delta = (now - at).TotalMilliseconds;
            if (delta > 0) pos += (long)delta;
        }
        if (DurationMs is { } d && d > 0) pos = Math.Min(pos, d);
        return Math.Max(0, pos);
    }

    /// <summary>A stable identity of everything drawn except the moving position (used to skip identical publishes).</summary>
    public string Signature => string.Join('|', Source, AppName, State, Title, ArtistLine, Album, Uri, DurationMs, Shuffle, Repeat, Liked, VolumePct,
        SupportsVolume, ContextUri, ContextName, DeviceId, DeviceRestricted, Art?.Hash, IsLocalFile, ItemType, SessionKey, Private);
}

public enum AuthState { SignedOut, Connecting, Connected, NeedsReconnect }

/// <summary>Connection and API health, shown in the property inspector and as hints on keys.</summary>
public sealed record SpotifyStatus
{
    public AuthState Auth { get; init; }
    /// <summary>The connected account's display name.</summary>
    public string? Account { get; init; }
    /// <summary>"••••cdef" (last 4 characters only) when a Client ID is saved.</summary>
    public string? ClientIdHint { get; init; }
    /// <summary>A lasting problem, e.g. Premium required or account not allowlisted.</summary>
    public string? Problem { get; init; }
    /// <summary>The last auth-flow message (e.g. "Sign-in timed out").</summary>
    public string? AuthMessage { get; init; }
    /// <summary>A short-lived notice ("Starting Spotify…"), shown until <see cref="NoticeUntil"/>.</summary>
    public string? Notice { get; init; }
    public DateTimeOffset? NoticeUntil { get; init; }
    /// <summary>Rate limited (429): no requests until then.</summary>
    public DateTimeOffset? BusyUntil { get; init; }
    /// <summary>Quota exceeded: SMTC-only ("basic") mode until then.</summary>
    public DateTimeOffset? BasicModeUntil { get; init; }
    public DateTimeOffset? AuthorizedAt { get; init; }
    /// <summary>True when the last connect had to use a fallback port (needs the optional portless redirect URI).</summary>
    public bool UsedFallbackPort { get; init; }
    public bool MissingScopes { get; init; }

    public bool IsConnected => Auth == AuthState.Connected;
    public bool IsBasicMode(DateTimeOffset now) => BasicModeUntil is { } u && u > now;
    public bool IsBusy(DateTimeOffset now) => BusyUntil is { } u && u > now;
}

/// <summary>Result of a user command (play, like, ...). Failed commands carry a short user-facing message.</summary>
public readonly record struct CommandResult(bool Ok, string? Message = null)
{
    public static CommandResult Success => new(true);
    public static CommandResult Fail(string message) => new(false, message);
}
