using System.Collections.Concurrent;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace PrismControl.Spotify.Smtc;

/// <summary>
/// <see cref="ISmtcManagerPort"/> over the real <c>GlobalSystemMediaTransportControlsSessionManager</c> (research
/// §5.1). One adapter per WinRT session object, kept while Windows lists it, so subscriptions stay on the same object.
/// </summary>
public sealed class WinRtSmtcManager : ISmtcManagerPort
{
    private readonly GlobalSystemMediaTransportControlsSessionManager _manager;
    private readonly object _lock = new();
    private readonly Dictionary<GlobalSystemMediaTransportControlsSession, WinRtSmtcSession> _adapters = new(ReferenceEqualityComparer.Instance);
    private EventHandler? _sessionsChanged;
    private EventHandler? _currentChanged;

    private WinRtSmtcManager(GlobalSystemMediaTransportControlsSessionManager manager) => _manager = manager;

    /// <summary>Took 38–48 ms on this PC (research §5.1). Call once and keep it alive.</summary>
    public static async Task<ISmtcManagerPort> RequestAsync(CancellationToken cancellationToken)
    {
        var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask(cancellationToken).ConfigureAwait(false);
        return new WinRtSmtcManager(manager);
    }

    public IReadOnlyList<ISmtcSessionPort> GetSessions()
    {
        var sessions = _manager.GetSessions();
        lock (_lock)
        {
            var seen = new HashSet<GlobalSystemMediaTransportControlsSession>(ReferenceEqualityComparer.Instance);
            var list = new List<ISmtcSessionPort>(sessions.Count);
            foreach (var s in sessions)
            {
                if (s is null || !seen.Add(s)) continue;
                list.Add(AdapterFor(s));
            }
            foreach (var gone in _adapters.Keys.Where(k => !seen.Contains(k)).ToList()) _adapters.Remove(gone);
            return list;
        }
    }

    public ISmtcSessionPort? GetCurrentSession()
    {
        var s = _manager.GetCurrentSession();
        if (s is null) return null;
        lock (_lock) return AdapterFor(s);
    }

    private WinRtSmtcSession AdapterFor(GlobalSystemMediaTransportControlsSession s)
    {
        if (!_adapters.TryGetValue(s, out var a)) _adapters[s] = a = new WinRtSmtcSession(s);
        return a;
    }

    public event EventHandler? SessionsChanged
    {
        add { lock (_lock) { if (_sessionsChanged is null) _manager.SessionsChanged += OnSessions; _sessionsChanged += value; } }
        remove { lock (_lock) { _sessionsChanged -= value; if (_sessionsChanged is null) _manager.SessionsChanged -= OnSessions; } }
    }

    public event EventHandler? CurrentSessionChanged
    {
        add { lock (_lock) { if (_currentChanged is null) _manager.CurrentSessionChanged += OnCurrent; _currentChanged += value; } }
        remove { lock (_lock) { _currentChanged -= value; if (_currentChanged is null) _manager.CurrentSessionChanged -= OnCurrent; } }
    }

    private void OnSessions(GlobalSystemMediaTransportControlsSessionManager sender, SessionsChangedEventArgs args) => _sessionsChanged?.Invoke(this, EventArgs.Empty);
    private void OnCurrent(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args) => _currentChanged?.Invoke(this, EventArgs.Empty);
}

/// <summary><see cref="ISmtcSessionPort"/> over one WinRT session. WinRT events are attached only while someone listens.</summary>
public sealed class WinRtSmtcSession : ISmtcSessionPort
{
    private const int MaxThumbnailBytes = 4 * 1024 * 1024;

    private readonly GlobalSystemMediaTransportControlsSession _s;
    private readonly object _lock = new();
    private EventHandler? _media, _playback, _timeline;

    public WinRtSmtcSession(GlobalSystemMediaTransportControlsSession session)
    {
        _s = session;
        try { AppId = session.SourceAppUserModelId ?? ""; }
        catch { AppId = ""; }
        AppName = MediaAppNames.Resolve(AppId);
    }

    public string AppId { get; }
    public string AppName { get; }

    public async Task<SmtcMediaRead> ReadMediaAsync()
    {
        var p = await _s.TryGetMediaPropertiesAsync();
        byte[]? thumb = null;
        string? mime = null;
        if (p.Thumbnail is { } reference)
        {
            try { (thumb, mime) = await ReadThumbnailAsync(reference).ConfigureAwait(false); }
            catch (Exception) { thumb = null; mime = null; }   // ads, podcasts without art, a vanished stream: no art
        }
        return new SmtcMediaRead { Title = p.Title, Artist = p.Artist, AlbumTitle = p.AlbumTitle, AlbumArtist = p.AlbumArtist, Thumbnail = thumb, ThumbnailMime = mime };
    }

    /// <summary>Opens the stream once, copies it as is (no re-encode: the bytes are what the app gave Windows).</summary>
    private static async Task<(byte[] Bytes, string Mime)> ReadThumbnailAsync(IRandomAccessStreamReference reference)
    {
        using IRandomAccessStreamWithContentType stream = await reference.OpenReadAsync();
        using var ms = new MemoryStream();
        using (var s = stream.AsStreamForRead())
        {
            var buffer = new byte[81920];
            int n;
            while ((n = await s.ReadAsync(buffer).ConfigureAwait(false)) > 0)
            {
                ms.Write(buffer, 0, n);
                if (ms.Length > MaxThumbnailBytes) throw new InvalidDataException("thumbnail too large");
            }
        }
        var bytes = ms.ToArray();
        var probed = Core.Render.ImageInfo.Probe(bytes)?.Mime;
        return (bytes, probed ?? (string.IsNullOrEmpty(stream.ContentType) ? "image/png" : stream.ContentType));
    }

    public SmtcPlaybackRead ReadPlayback()
    {
        var info = _s.GetPlaybackInfo();
        var c = info.Controls;
        return new SmtcPlaybackRead
        {
            State = info.PlaybackStatus switch
            {
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => PlayState.Playing,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => PlayState.Paused,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => PlayState.Stopped,
                _ => PlayState.None,
            },
            Shuffle = info.IsShuffleActive,
            Repeat = info.AutoRepeatMode switch
            {
                MediaPlaybackAutoRepeatMode.List => RepeatMode.Context,
                MediaPlaybackAutoRepeatMode.Track => RepeatMode.Track,
                MediaPlaybackAutoRepeatMode.None => RepeatMode.Off,
                _ => null,
            },
            CanPlay = c.IsPlayEnabled,
            CanPause = c.IsPauseEnabled,
            CanNext = c.IsNextEnabled,
            CanPrevious = c.IsPreviousEnabled,
            CanSeek = c.IsPlaybackPositionEnabled,
            CanShuffle = c.IsShuffleEnabled,
            CanRepeat = c.IsRepeatEnabled,
        };
    }

    public SmtcTimelineRead ReadTimeline()
    {
        var t = _s.GetTimelineProperties();
        return new SmtcTimelineRead(t.StartTime, t.EndTime, t.Position, t.LastUpdatedTime);
    }

    public event EventHandler? MediaChanged
    {
        add { lock (_lock) { if (_media is null) _s.MediaPropertiesChanged += OnMedia; _media += value; } }
        remove { lock (_lock) { _media -= value; if (_media is null) _s.MediaPropertiesChanged -= OnMedia; } }
    }

    public event EventHandler? PlaybackChanged
    {
        add { lock (_lock) { if (_playback is null) _s.PlaybackInfoChanged += OnPlayback; _playback += value; } }
        remove { lock (_lock) { _playback -= value; if (_playback is null) _s.PlaybackInfoChanged -= OnPlayback; } }
    }

    public event EventHandler? TimelineChanged
    {
        add { lock (_lock) { if (_timeline is null) _s.TimelinePropertiesChanged += OnTimeline; _timeline += value; } }
        remove { lock (_lock) { _timeline -= value; if (_timeline is null) _s.TimelinePropertiesChanged -= OnTimeline; } }
    }

    private void OnMedia(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args) => _media?.Invoke(this, EventArgs.Empty);
    private void OnPlayback(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args) => _playback?.Invoke(this, EventArgs.Empty);
    private void OnTimeline(GlobalSystemMediaTransportControlsSession sender, TimelinePropertiesChangedEventArgs args) => _timeline?.Invoke(this, EventArgs.Empty);

    // ------------------------------------------------------------------ commands (these DO change playback)

    public Task<bool> TogglePlayPauseAsync() => _s.TryTogglePlayPauseAsync().AsTask();
    public Task<bool> PlayAsync() => _s.TryPlayAsync().AsTask();
    public Task<bool> PauseAsync() => _s.TryPauseAsync().AsTask();
    public Task<bool> NextAsync() => _s.TrySkipNextAsync().AsTask();
    public Task<bool> PreviousAsync() => _s.TrySkipPreviousAsync().AsTask();
    public Task<bool> SeekAsync(TimeSpan position) => _s.TryChangePlaybackPositionAsync(Math.Max(0, position.Ticks)).AsTask();
    public Task<bool> SetShuffleAsync(bool on) => _s.TryChangeShuffleActiveAsync(on).AsTask();

    public Task<bool> SetRepeatAsync(RepeatMode mode) => _s.TryChangeAutoRepeatModeAsync(mode switch
    {
        RepeatMode.Context => MediaPlaybackAutoRepeatMode.List,
        RepeatMode.Track => MediaPlaybackAutoRepeatMode.Track,
        _ => MediaPlaybackAutoRepeatMode.None,
    }).AsTask();
}

/// <summary>
/// Friendly app names from media-session AppUserModelIds: text only (no logos), and never a process path. Packaged apps
/// ask Windows for their display name (a read); everything else uses a small table, then the id itself, cleaned up.
/// </summary>
public static class MediaAppNames
{
    private static readonly ConcurrentDictionary<string, string> s_cache = new(StringComparer.OrdinalIgnoreCase);

    // Lowercase id fragments (letters and digits only) → display name. Checked in order; the first match wins.
    private static readonly (string Fragment, string Name)[] s_known =
    [
        ("spotify", "Spotify"),
        ("msedge", "Edge"),
        ("microsoftedge", "Edge"),
        ("chrome", "Chrome"),
        ("firefox", "Firefox"),
        ("308046b0af4a39cb", "Firefox"),
        ("brave", "Brave"),
        ("vivaldi", "Vivaldi"),
        ("opera", "Opera"),
        ("zunemusic", "Media Player"),
        ("zunevideo", "Movies & TV"),
        ("wmplayer", "Windows Media Player"),
        ("vlc", "VLC"),
        ("applemusic", "Apple Music"),
        ("itunes", "iTunes"),
        ("amazonmusic", "Amazon Music"),
        ("tidal", "TIDAL"),
        ("deezer", "Deezer"),
        ("discord", "Discord"),
        ("foobar2000", "foobar2000"),
        ("musicbee", "MusicBee"),
        ("aimp", "AIMP"),
        ("plex", "Plex"),
        ("netflix", "Netflix"),
        ("youtubemusic", "YouTube Music"),
    ];

    /// <summary>The display name, asking Windows for packaged apps (cached; any failure falls back to <see cref="FromId"/>).</summary>
    public static string Resolve(string appId) => s_cache.GetOrAdd(appId ?? "", static id =>
    {
        var fallback = FromId(id);
        if (fallback != "Media" && Known(id) is not null) return fallback;   // the table beats a store listing name
        if (!id.Contains('!')) return fallback;
        try
        {
            var name = Windows.ApplicationModel.AppInfo.GetFromAppUserModelId(id)?.DisplayInfo?.DisplayName;
            return Clean(name) ?? fallback;
        }
        catch (Exception) { return fallback; }
    });

    private static string? Known(string appId)
    {
        var flat = new string(appId.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
        foreach (var (fragment, name) in s_known)
            if (flat.Contains(fragment, StringComparison.Ordinal)) return name;
        return null;
    }

    /// <summary>
    /// A short name from the id alone: "Spotify.exe" → "Spotify", "MSEdge" → "Edge", "C:\…\vlc.exe" → "VLC",
    /// "Contoso.Player_8wek…!App" → "Player". Pure (no Windows calls).
    /// </summary>
    public static string FromId(string? appId)
    {
        if (string.IsNullOrWhiteSpace(appId)) return "Media";
        var s = appId.Trim();
        // A path (some Win32 apps register their exe path): keep the file name only.
        var slash = s.LastIndexOfAny(['\\', '/']);
        if (slash >= 0) s = s[(slash + 1)..];
        if (Known(s) is { } known) return known;
        var bang = s.IndexOf('!');
        if (bang > 0) s = s[..bang];
        var underscore = s.IndexOf('_');
        if (underscore > 0) s = s[..underscore];
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s[..^4];
        var dot = s.LastIndexOf('.');
        if (dot >= 0 && dot < s.Length - 1) s = s[(dot + 1)..];
        return Clean(s) is { } c ? char.ToUpperInvariant(c[0]) + c[1..] : "Media";
    }

    private static string? Clean(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var t = name.Trim();
        if (t.IndexOfAny(['\\', '/', ':']) >= 0) return null;   // never show anything path-like
        return t.Length > 40 ? t[..40] : t;
    }
}
