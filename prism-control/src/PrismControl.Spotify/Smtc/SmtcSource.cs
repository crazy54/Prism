using System.Security.Cryptography;
using PrismControl.Core.Hosting;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace PrismControl.Spotify.Smtc;

/// <summary>
/// <see cref="IMediaSessionSource"/> over <c>GlobalSystemMediaTransportControlsSessionManager</c>
/// (research/spotify.md §5). Keeps strong references to the manager and the followed session, re-binds on
/// SessionsChanged, debounces the duplicate MediaPropertiesChanged burst on a track change (150 ms) and reads everything
/// in one serialized async pass. Reads never change playback; only the Try* command methods do.
/// </summary>
public sealed class SmtcSource : IMediaSessionSource
{
    private const int MaxThumbnailBytes = 4 * 1024 * 1024;

    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _sync = new();
    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private GlobalSystemMediaTransportControlsSession? _session;
    private ITimer? _debounce;
    private int _pending;
    private volatile SmtcSnapshot? _current;
    private volatile bool _followAnyApp;
    private CancellationToken _shutdown;
    private bool _disposed;

    public SmtcSource(ILog log, TimeProvider? time = null)
    {
        _log = log;
        _time = time ?? TimeProvider.System;
    }

    public SmtcSnapshot? Current => _current;

    public bool FollowAnyApp
    {
        get => _followAnyApp;
        set
        {
            if (_followAnyApp == value) return;
            _followAnyApp = value;
            Rebind();
        }
    }

    public event EventHandler<SmtcChange>? Changed;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _shutdown = cancellationToken;
        var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        lock (_sync)
        {
            if (_disposed) return;
            _manager = manager;
            _manager.SessionsChanged += OnSessionsChanged;
            _manager.CurrentSessionChanged += OnCurrentSessionChanged;
        }
        await RefreshAsync(SmtcChange.Session | SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline, rebind: true).ConfigureAwait(false);
    }

    public void Rebind() => Schedule(SmtcChange.Session, TimeSpan.Zero);

    // ------------------------------------------------------------------ events (thread-pool threads)

    private void OnSessionsChanged(GlobalSystemMediaTransportControlsSessionManager sender, SessionsChangedEventArgs args) => Rebind();

    private void OnCurrentSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args)
    {
        if (_followAnyApp) Rebind();
    }

    private void OnMediaProperties(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args) =>
        Schedule(SmtcChange.Media, TimeSpan.FromMilliseconds(150));   // two events 2 ms apart on a track change

    private void OnPlaybackInfo(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args) =>
        Schedule(SmtcChange.Playback, TimeSpan.FromMilliseconds(30));

    private void OnTimeline(GlobalSystemMediaTransportControlsSession sender, TimelinePropertiesChangedEventArgs args) =>
        Schedule(SmtcChange.Timeline, TimeSpan.FromMilliseconds(30));

    private void Schedule(SmtcChange what, TimeSpan delay)
    {
        lock (_sync)
        {
            if (_disposed) return;
            _pending |= (int)what;
            _debounce ??= _time.CreateTimer(_ => _ = DrainAsync(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            _debounce.Change(delay, Timeout.InfiniteTimeSpan);
        }
    }

    private async Task DrainAsync()
    {
        int flags;
        lock (_sync) { flags = _pending; _pending = 0; }
        if (flags == 0) return;
        var what = (SmtcChange)flags;
        try { await RefreshAsync(what, rebind: what.HasFlag(SmtcChange.Session)).ConfigureAwait(false); }
        catch (OperationCanceledException) { }   // shutting down
        catch (Exception ex) { _log.Warn("SMTC refresh failed", ex); }
    }

    // ------------------------------------------------------------------ reads

    private async Task RefreshAsync(SmtcChange what, bool rebind)
    {
        await _gate.WaitAsync(_shutdown).ConfigureAwait(false);
        SmtcChange changed;
        try
        {
            if (rebind && BindSession())
                what |= SmtcChange.Session | SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline;
            var before = _current;
            var next = await ReadAsync(_session, before, what).ConfigureAwait(false);
            changed = Diff(before, next) & (what | SmtcChange.Session);
            _current = next;
        }
        finally { _gate.Release(); }
        if (changed != SmtcChange.None) Changed?.Invoke(this, changed);
    }

    /// <summary>Picks the Spotify session (or the current one in any-app mode). Returns true if the followed session changed.</summary>
    private bool BindSession()
    {
        GlobalSystemMediaTransportControlsSession? next = null;
        var manager = _manager;
        if (manager is null) return false;
        try
        {
            next = manager.GetSessions().FirstOrDefault(s => IsSpotifyApp(SafeAppId(s)));
            if (next is null && _followAnyApp) next = manager.GetCurrentSession();
        }
        catch (Exception ex) { _log.Warn("SMTC session enumeration failed", ex); }

        var current = _session;
        if (current is not null && next is not null && SafeAppId(current) == SafeAppId(next) && ReferenceEquals(current, next)) return false;
        if (current is null && next is null) return false;
        if (current is not null)
        {
            try
            {
                current.MediaPropertiesChanged -= OnMediaProperties;
                current.PlaybackInfoChanged -= OnPlaybackInfo;
                current.TimelinePropertiesChanged -= OnTimeline;
            }
            catch (Exception ex) { _log.Debug("SMTC unsubscribe failed: " + ex.Message); }
        }
        var previousApp = current is null ? null : SafeAppId(current);
        _session = next;
        if (next is not null)
        {
            next.MediaPropertiesChanged += OnMediaProperties;
            next.PlaybackInfoChanged += OnPlaybackInfo;
            next.TimelinePropertiesChanged += OnTimeline;
            // WinRT may hand out a new wrapper for the same session on every enumeration: only an app change is news.
            if (SafeAppId(next) != previousApp) _log.Info($"Following media session '{SafeAppId(next)}'.");
        }
        else _log.Info("No media session to follow.");
        return true;
    }

    private async Task<SmtcSnapshot?> ReadAsync(GlobalSystemMediaTransportControlsSession? s, SmtcSnapshot? before, SmtcChange what)
    {
        if (s is null) return null;
        var appId = SafeAppId(s);
        var sameApp = before is not null && before.AppId == appId;
        var snap = sameApp ? before! : new SmtcSnapshot { AppId = appId, IsSpotify = IsSpotifyApp(appId), AppName = AppNameFor(appId) };
        try
        {
            if (what.HasFlag(SmtcChange.Media) || !sameApp)
            {
                var p = await s.TryGetMediaPropertiesAsync();
                byte[]? thumb = null;
                string? mime = null;
                if (p.Thumbnail is { } reference)
                {
                    try { (thumb, mime) = await ReadThumbnailAsync(reference).ConfigureAwait(false); }
                    catch (Exception ex) { _log.Debug("SMTC thumbnail read failed: " + ex.Message); }
                }
                snap = snap with
                {
                    Title = NullIfEmpty(p.Title),
                    Artist = NullIfEmpty(p.Artist) ?? NullIfEmpty(p.AlbumArtist),
                    Album = NullIfEmpty(p.AlbumTitle),
                    Thumbnail = thumb,
                    ThumbnailMime = mime,
                    ThumbnailHash = thumb is null ? null : Hash(thumb),
                };
            }
            if (what.HasFlag(SmtcChange.Playback) || !sameApp)
            {
                var info = s.GetPlaybackInfo();
                var c = info.Controls;
                snap = snap with
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
            if (what.HasFlag(SmtcChange.Timeline) || !sameApp)
            {
                var t = s.GetTimelineProperties();
                var duration = t.EndTime - t.StartTime;
                snap = snap with
                {
                    Duration = duration > TimeSpan.Zero ? duration : null,
                    Position = t.Position - t.StartTime,
                    PositionAt = t.LastUpdatedTime.Year > 2000 ? t.LastUpdatedTime : _time.GetUtcNow(),
                };
            }
        }
        catch (Exception ex)
        {
            // The session can vanish between enumeration and read (Spotify quit). Re-bind on the next tick.
            _log.Debug("SMTC read failed: " + ex.Message);
            Schedule(SmtcChange.Session, TimeSpan.FromMilliseconds(250));
        }
        return snap;
    }

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

    private static SmtcChange Diff(SmtcSnapshot? a, SmtcSnapshot? b)
    {
        if (a is null && b is null) return SmtcChange.None;
        if (a is null || b is null || a.AppId != b.AppId) return SmtcChange.Session | SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline;
        var c = SmtcChange.None;
        if (a.Title != b.Title || a.Artist != b.Artist || a.Album != b.Album || a.ThumbnailHash != b.ThumbnailHash) c |= SmtcChange.Media;
        if (a.State != b.State || a.Shuffle != b.Shuffle || a.Repeat != b.Repeat || a.CanPlay != b.CanPlay || a.CanPause != b.CanPause
            || a.CanNext != b.CanNext || a.CanPrevious != b.CanPrevious) c |= SmtcChange.Playback;
        if (a.Position != b.Position || a.Duration != b.Duration || a.PositionAt != b.PositionAt) c |= SmtcChange.Timeline;
        return c;
    }

    // ------------------------------------------------------------------ commands (these DO change playback)

    public Task<bool> TogglePlayPauseAsync() => Run(s => s.TryTogglePlayPauseAsync().AsTask());
    public Task<bool> PlayAsync() => Run(s => s.TryPlayAsync().AsTask());
    public Task<bool> PauseAsync() => Run(s => s.TryPauseAsync().AsTask());
    public Task<bool> NextAsync() => Run(s => s.TrySkipNextAsync().AsTask());
    public Task<bool> PreviousAsync() => Run(s => s.TrySkipPreviousAsync().AsTask());
    public Task<bool> SeekAsync(TimeSpan position) => Run(s => s.TryChangePlaybackPositionAsync(Math.Max(0, position.Ticks)).AsTask());
    public Task<bool> SetShuffleAsync(bool on) => Run(s => s.TryChangeShuffleActiveAsync(on).AsTask());

    public Task<bool> SetRepeatAsync(RepeatMode mode) => Run(s => s.TryChangeAutoRepeatModeAsync(mode switch
    {
        RepeatMode.Context => MediaPlaybackAutoRepeatMode.List,
        RepeatMode.Track => MediaPlaybackAutoRepeatMode.Track,
        _ => MediaPlaybackAutoRepeatMode.None,
    }).AsTask());

    private async Task<bool> Run(Func<GlobalSystemMediaTransportControlsSession, Task<bool>> command)
    {
        var s = _session;
        if (s is null) return false;
        try { return await command(s).ConfigureAwait(false); }
        catch (Exception ex)
        {
            _log.Warn("SMTC command failed", ex);
            Rebind();
            return false;
        }
    }

    // ------------------------------------------------------------------ helpers

    public static bool IsSpotifyApp(string? appId) => appId is not null && appId.Contains("spotify", StringComparison.OrdinalIgnoreCase);

    /// <summary>A short display name from an AppUserModelId ("Spotify.exe" → "Spotify", "Microsoft.ZuneMusic_8wek…!App" → "ZuneMusic").</summary>
    public static string AppNameFor(string appId)
    {
        if (IsSpotifyApp(appId)) return "Spotify";
        var s = appId;
        var bang = s.IndexOf('!');
        if (bang > 0) s = s[..bang];
        var underscore = s.IndexOf('_');
        if (underscore > 0) s = s[..underscore];
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s[..^4];
        var dot = s.LastIndexOf('.');
        if (dot >= 0 && dot < s.Length - 1) s = s[(dot + 1)..];
        return s.Length == 0 ? "Media" : char.ToUpperInvariant(s[0]) + s[1..];
    }

    public static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes))[..16].ToLowerInvariant();

    private static string SafeAppId(GlobalSystemMediaTransportControlsSession s)
    {
        try { return s.SourceAppUserModelId ?? ""; }
        catch { return ""; }
    }

    private static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    public async ValueTask DisposeAsync()
    {
        GlobalSystemMediaTransportControlsSessionManager? manager;
        lock (_sync)
        {
            if (_disposed) return;
            _disposed = true;
            _debounce?.Dispose();
            _debounce = null;
            manager = _manager;
            _manager = null;
        }
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (manager is not null)
            {
                manager.SessionsChanged -= OnSessionsChanged;
                manager.CurrentSessionChanged -= OnCurrentSessionChanged;
            }
            if (_session is { } s)
            {
                s.MediaPropertiesChanged -= OnMediaProperties;
                s.PlaybackInfoChanged -= OnPlaybackInfo;
                s.TimelinePropertiesChanged -= OnTimeline;
            }
            _session = null;
        }
        catch (Exception ex) { _log.Debug("SMTC dispose: " + ex.Message); }
        finally { _gate.Release(); }
    }
}
