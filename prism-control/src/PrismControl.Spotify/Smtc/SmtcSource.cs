using System.Security.Cryptography;
using PrismControl.Core.Hosting;

namespace PrismControl.Spotify.Smtc;

/// <summary>
/// <see cref="IMediaSessionSource"/> over the Windows media session manager (research §5), through
/// <see cref="ISmtcManagerPort"/> (WinRT in the plugin, fakes in tests). Tracks <b>every</b> session: playback state is
/// read for all of them (cheap, synchronous), while title, art and timeline are read only for the shown session and
/// Spotify's (the thumbnail read costs 13–32 ms). Keeps strong references to the manager and the subscribed sessions,
/// re-binds on SessionsChanged / CurrentSessionChanged, debounces the duplicate MediaPropertiesChanged burst on a track
/// change (150 ms), and runs everything in one serialized async pass that ends with <see cref="SessionPolicy"/>.
/// Reads never change playback; only the command methods do.
/// </summary>
public sealed class SmtcSource : IMediaSessionSource
{
    /// <summary>Playing runs closer than this are one run (a track change, a buffering stall).</summary>
    internal static readonly TimeSpan RunGap = TimeSpan.FromSeconds(2);

    private const SmtcChange AllParts = SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline;

    private sealed class Entry(string key, ISmtcSessionPort port)
    {
        public string Key { get; } = key;
        public ISmtcSessionPort Port { get; set; } = port;
        public SmtcSnapshot Snap { get; set; } = new()
        {
            AppId = SafeAppId(port), SessionKey = key, IsSpotify = IsSpotifyApp(SafeAppId(port)), AppName = SafeAppName(port),
        };
        /// <summary>Parts to re-read (guarded by the owner's _sync; events set them on pool threads).</summary>
        public SmtcChange Dirty = AllParts;
        public bool MediaKnown;
        public bool TimelineKnown;
        public DateTimeOffset? PlayingSince;
        public DateTimeOffset? LastRunStart;
        public DateTimeOffset? LastPlayingAt;
        public EventHandler? OnMedia, OnPlayback, OnTimeline;
        public bool IsSpotify => Snap.IsSpotify;
    }

    private sealed record Target(ISmtcSessionPort Port, PlayState State, bool IsSpotify);

    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly Func<CancellationToken, Task<ISmtcManagerPort>> _connect;
    private readonly SessionPolicy _policy;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _sync = new();
    private List<Entry> _entries = [];   // under _gate only
    private string? _windowsCurrentKey;  // under _gate only
    private string? _lastShownLog;       // under _gate only
    private string? _lastAppsLog;        // under _gate only
    private ISmtcManagerPort? _manager;
    private ITimer? _timer;
    private long? _dueAt;
    private bool _pendingRebind;
    private (string Key, DateTimeOffset At)? _pendingUserPlay;
    private PlayState? _spotifyRemote;
    private int _follow = (int)MediaFollow.SpotifyFirst;
    private volatile SmtcSnapshot? _current;
    private volatile SmtcSnapshot? _spotify;
    private volatile IReadOnlyList<SmtcSessionInfo> _sessions = [];
    private volatile IReadOnlyDictionary<string, Target> _targets = new Dictionary<string, Target>();
    private CancellationToken _shutdown;
    private bool _disposed;

    /// <param name="connect">Opens the session manager (default: WinRT's).</param>
    /// <param name="hold">The policy's switch hysteresis (default 1.5 s).</param>
    public SmtcSource(ILog log, TimeProvider? time = null, Func<CancellationToken, Task<ISmtcManagerPort>>? connect = null, TimeSpan? hold = null)
    {
        _log = log;
        _time = time ?? TimeProvider.System;
        _connect = connect ?? WinRtSmtcManager.RequestAsync;
        _policy = new SessionPolicy(hold);
    }

    public SmtcSnapshot? Current => _current;
    public SmtcSnapshot? Spotify => _spotify;
    public IReadOnlyList<SmtcSessionInfo> Sessions => _sessions;

    public MediaFollow Follow
    {
        get => (MediaFollow)Volatile.Read(ref _follow);
        set
        {
            if (Interlocked.Exchange(ref _follow, (int)value) == (int)value) return;
            _log.Info($"Now playing follows: {MediaFollowModes.Wire(value)}.");
            Arm(TimeSpan.Zero);
        }
    }

    public PlayState? SpotifyRemote
    {
        get { lock (_sync) return _spotifyRemote; }
        set
        {
            lock (_sync)
            {
                if (_spotifyRemote == value) return;
                _spotifyRemote = value;
            }
            Arm(TimeSpan.Zero);
        }
    }

    public event EventHandler<SmtcChange>? Changed;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _shutdown = cancellationToken;
        var manager = await _connect(cancellationToken).ConfigureAwait(false);
        lock (_sync)
        {
            if (_disposed) return;
            _manager = manager;
            _pendingRebind = true;
        }
        manager.SessionsChanged += OnManagerChanged;
        manager.CurrentSessionChanged += OnManagerChanged;
        await RefreshAsync().ConfigureAwait(false);
    }

    public void Rebind()
    {
        lock (_sync) _pendingRebind = true;
        Arm(TimeSpan.Zero);
    }

    // ------------------------------------------------------------------ events (thread-pool threads)

    private void OnManagerChanged(object? sender, EventArgs e) => Rebind();

    private void Subscribe(Entry e)
    {
        e.OnMedia = (_, _) => MarkDirty(e, SmtcChange.Media, TimeSpan.FromMilliseconds(150));   // two events 2 ms apart on a track change
        e.OnPlayback = (_, _) => MarkDirty(e, SmtcChange.Playback, TimeSpan.FromMilliseconds(30));
        e.OnTimeline = (_, _) => MarkDirty(e, SmtcChange.Timeline, TimeSpan.FromMilliseconds(30));
        try
        {
            e.Port.MediaChanged += e.OnMedia;
            e.Port.PlaybackChanged += e.OnPlayback;
            e.Port.TimelineChanged += e.OnTimeline;
        }
        catch (Exception ex) { _log.Debug("SMTC subscribe failed: " + ex.Message); }
    }

    private void Unsubscribe(Entry e)
    {
        try
        {
            e.Port.MediaChanged -= e.OnMedia;
            e.Port.PlaybackChanged -= e.OnPlayback;
            e.Port.TimelineChanged -= e.OnTimeline;
        }
        catch (Exception ex) { _log.Debug("SMTC unsubscribe failed: " + ex.Message); }
    }

    private void MarkDirty(Entry e, SmtcChange what, TimeSpan delay)
    {
        lock (_sync)
        {
            if (_disposed) return;
            e.Dirty |= what;
        }
        Arm(delay);
    }

    /// <summary>Runs a refresh after <paramref name="delay"/>; an earlier pending refresh is kept (it reads everything pending).</summary>
    private void Arm(TimeSpan delay)
    {
        lock (_sync)
        {
            if (_disposed || _manager is null) return;
            var due = _time.GetTimestamp() + (long)(Math.Max(0, delay.TotalSeconds) * _time.TimestampFrequency);
            if (_dueAt is { } armed && armed <= due) return;
            _dueAt = due;
            _timer ??= _time.CreateTimer(_ => Fire(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            _timer.Change(delay < TimeSpan.Zero ? TimeSpan.Zero : delay, Timeout.InfiniteTimeSpan);
        }
    }

    private void Fire()
    {
        lock (_sync) _dueAt = null;
        _ = DrainAsync();
    }

    private async Task DrainAsync()
    {
        try { await RefreshAsync().ConfigureAwait(false); }
        catch (OperationCanceledException) { }   // shutting down
        catch (Exception ex) { _log.Warn("SMTC refresh failed", ex); }
    }

    // ------------------------------------------------------------------ the refresh pass

    private async Task RefreshAsync()
    {
        await _gate.WaitAsync(_shutdown).ConfigureAwait(false);
        SmtcChange changed;
        try
        {
            ISmtcManagerPort? manager;
            bool rebind;
            (string Key, DateTimeOffset At)? userPlay;
            PlayState? remote;
            lock (_sync)
            {
                if (_disposed) return;
                manager = _manager;
                rebind = _pendingRebind;
                _pendingRebind = false;
                userPlay = _pendingUserPlay;
                _pendingUserPlay = null;
                remote = _spotifyRemote;
            }
            if (manager is null) return;
            var now = _time.GetUtcNow();
            if (rebind) Enumerate(manager);

            foreach (var e in _entries)
            {
                SmtcChange dirty;
                lock (_sync)
                {
                    dirty = e.Dirty;
                    e.Dirty = SmtcChange.None;
                }
                if (dirty.HasFlag(SmtcChange.Media)) e.MediaKnown = false;
                if (dirty.HasFlag(SmtcChange.Timeline)) e.TimelineKnown = false;
                if (dirty.HasFlag(SmtcChange.Playback)) ReadPlayback(e, now);
                if (e.Snap.State == PlayState.Playing) e.LastPlayingAt = now;
            }

            if (userPlay is { } up && _entries.FirstOrDefault(x => x.Key == up.Key) is { } pressed)
                _policy.NoteUserPlay(pressed.IsSpotify ? SessionPolicy.SpotifyKey : pressed.Key, up.At);
            var spotifyEntry = _entries.Where(x => x.IsSpotify).OrderByDescending(x => x.Snap.State == PlayState.Playing).FirstOrDefault();
            var decision = _policy.Decide(Follow, PolicyInput(spotifyEntry, remote, now), now);
            var shownEntry = decision.Shown == SessionPolicy.SpotifyKey ? spotifyEntry : _entries.FirstOrDefault(x => x.Key == decision.Shown);

            if (shownEntry is not null) await CompleteAsync(shownEntry).ConfigureAwait(false);
            if (spotifyEntry is not null && !ReferenceEquals(spotifyEntry, shownEntry)) await CompleteAsync(spotifyEntry).ConfigureAwait(false);

            var nextCurrent = shownEntry?.Snap;
            var nextSpotify = spotifyEntry?.Snap;
            var nextSessions = _entries.Select(x => new SmtcSessionInfo(x.Key, x.Snap.AppId, x.Snap.AppName, x.IsSpotify, x.Snap.State,
                ReferenceEquals(x, shownEntry), x.Key == _windowsCurrentKey)).ToList();
            changed = Diff(_current, nextCurrent);
            if (!ReferenceEquals(spotifyEntry, shownEntry) && Diff(_spotify, nextSpotify) != SmtcChange.None) changed |= SmtcChange.Background;
            if (!_sessions.SequenceEqual(nextSessions)) changed |= SmtcChange.Background;
            _current = nextCurrent;
            _spotify = nextSpotify;
            _sessions = nextSessions;
            _targets = _entries.ToDictionary(x => x.Key, x => new Target(x.Port, x.Snap.State, x.IsSpotify), StringComparer.Ordinal);
            LogShown(decision.Shown, shownEntry);
            if (decision.RecheckAt is { } at) Arm(at - now);
        }
        finally { _gate.Release(); }
        if (changed != SmtcChange.None) Changed?.Invoke(this, changed);
    }

    private List<PolicySession> PolicyInput(Entry? spotify, PlayState? remote, DateTimeOffset now)
    {
        var list = new List<PolicySession>(_entries.Count + 1);
        if (spotify is not null || remote is not null)
        {
            var remotePlaying = remote == PlayState.Playing;
            var local = spotify?.Snap.State ?? PlayState.None;
            list.Add(new PolicySession(SessionPolicy.SpotifyKey, true,
                local == PlayState.Playing || remotePlaying ? PlayState.Playing : spotify is not null ? local : remote!.Value,
                spotify?.PlayingSince ?? (remotePlaying ? now : null),
                spotify?.LastPlayingAt ?? (remotePlaying ? now : null),
                _entries.Any(x => x.IsSpotify && x.Key == _windowsCurrentKey)));
        }
        foreach (var e in _entries)
        {
            if (e.IsSpotify) continue;
            list.Add(new PolicySession(e.Key, false, e.Snap.State, e.PlayingSince, e.LastPlayingAt, e.Key == _windowsCurrentKey));
        }
        return list;
    }

    private void LogShown(string target, Entry? shown)
    {
        var name = shown?.Snap.AppName ?? (target == SessionPolicy.SpotifyKey ? "Spotify" : "nothing");
        if (name == _lastShownLog) return;
        _lastShownLog = name;
        _log.Info($"Now playing shows: {name}.");
    }

    /// <summary>Matches Windows' sessions to tracked entries: same object first, then the same app. Under _gate.</summary>
    private void Enumerate(ISmtcManagerPort manager)
    {
        IReadOnlyList<ISmtcSessionPort> ports;
        ISmtcSessionPort? current;
        try
        {
            ports = manager.GetSessions();
            current = manager.GetCurrentSession();
        }
        catch (Exception ex)
        {
            _log.Warn("SMTC session enumeration failed", ex);
            return;
        }
        var old = new List<Entry>(_entries);
        var next = new Entry?[ports.Count];
        for (var i = 0; i < ports.Count; i++)
        {
            var hit = old.FirstOrDefault(e => ReferenceEquals(e.Port, ports[i]));
            if (hit is null) continue;
            old.Remove(hit);
            next[i] = hit;
        }
        for (var i = 0; i < ports.Count; i++)
        {
            if (next[i] is not null) continue;
            var p = ports[i];
            var appId = SafeAppId(p);
            var hit = old.FirstOrDefault(e => e.Snap.AppId == appId);
            if (hit is not null)
            {
                // WinRT may hand out a new wrapper for the same session: keep its history, read it again.
                old.Remove(hit);
                Unsubscribe(hit);
                hit.Port = p;
                lock (_sync) hit.Dirty = AllParts;
                Subscribe(hit);
                next[i] = hit;
                continue;
            }
            var taken = next.Where(x => x is not null).Select(x => x!.Key).Concat(old.Select(x => x.Key)).ToHashSet(StringComparer.Ordinal);
            var key = appId.Length == 0 ? "session" : appId;
            for (var n = 2; taken.Contains(key); n++) key = (appId.Length == 0 ? "session" : appId) + "#" + n;
            var entry = new Entry(key, p);
            Subscribe(entry);
            next[i] = entry;
        }
        foreach (var gone in old) Unsubscribe(gone);
        _entries = [.. next.Select(x => x!)];
        _windowsCurrentKey = current is null ? null
            : _entries.FirstOrDefault(e => ReferenceEquals(e.Port, current))?.Key ?? _entries.FirstOrDefault(e => e.Snap.AppId == SafeAppId(current))?.Key;
        var apps = string.Join(", ", _entries.Select(e => e.Snap.AppName));
        if (apps != _lastAppsLog)
        {
            _lastAppsLog = apps;
            _log.Info(_entries.Count == 0 ? "No media sessions." : $"Media sessions: {apps}.");
        }
    }

    private void ReadPlayback(Entry e, DateTimeOffset now)
    {
        SmtcPlaybackRead p;
        try { p = e.Port.ReadPlayback(); }
        catch (Exception ex)
        {
            // The session can vanish between enumeration and read (the app quit). Re-bind on the next tick.
            _log.Debug("SMTC read failed: " + ex.Message);
            ScheduleRebind();
            return;
        }
        var wasPlaying = e.Snap.State == PlayState.Playing;
        e.Snap = e.Snap with
        {
            State = p.State,
            Shuffle = p.Shuffle,
            Repeat = p.Repeat,
            CanPlay = p.CanPlay,
            CanPause = p.CanPause,
            CanNext = p.CanNext,
            CanPrevious = p.CanPrevious,
            CanSeek = p.CanSeek,
            CanShuffle = p.CanShuffle,
            CanRepeat = p.CanRepeat,
        };
        var playing = p.State == PlayState.Playing;
        if (playing && !wasPlaying)
        {
            var continues = e.LastPlayingAt is { } last && now - last <= RunGap && e.LastRunStart is not null;
            e.PlayingSince = continues ? e.LastRunStart : now;
            e.LastRunStart = e.PlayingSince;
        }
        else if (!playing && wasPlaying)
        {
            e.LastPlayingAt = now;
            e.PlayingSince = null;
        }
    }

    /// <summary>Reads what a shown (or Spotify's) session still lacks: title, art and timeline.</summary>
    private async Task CompleteAsync(Entry e)
    {
        try
        {
            if (!e.MediaKnown)
            {
                var m = await e.Port.ReadMediaAsync().ConfigureAwait(false);
                e.Snap = e.Snap with
                {
                    Title = NullIfEmpty(m.Title),
                    Artist = NullIfEmpty(m.Artist) ?? NullIfEmpty(m.AlbumArtist),
                    Album = NullIfEmpty(m.AlbumTitle),
                    Thumbnail = m.Thumbnail,
                    ThumbnailMime = m.Thumbnail is null ? null : m.ThumbnailMime ?? Core.Render.ImageInfo.Probe(m.Thumbnail)?.Mime ?? "image/png",
                    ThumbnailHash = m.Thumbnail is null ? null : Hash(m.Thumbnail),
                };
                e.MediaKnown = true;
            }
            if (!e.TimelineKnown)
            {
                var t = e.Port.ReadTimeline();
                var duration = t.End - t.Start;
                e.Snap = e.Snap with
                {
                    Duration = duration > TimeSpan.Zero ? duration : null,
                    Position = t.Position - t.Start,
                    PositionAt = t.LastUpdated.Year > 2000 ? t.LastUpdated : _time.GetUtcNow(),
                };
                e.TimelineKnown = true;
            }
        }
        catch (Exception ex)
        {
            _log.Debug("SMTC read failed: " + ex.Message);
            ScheduleRebind();
        }
    }

    private void ScheduleRebind()
    {
        lock (_sync) _pendingRebind = true;
        Arm(TimeSpan.FromMilliseconds(250));
    }

    private static SmtcChange Diff(SmtcSnapshot? a, SmtcSnapshot? b)
    {
        if (a is null && b is null) return SmtcChange.None;
        if (a is null || b is null || a.Key != b.Key) return SmtcChange.Session | AllParts;
        var c = SmtcChange.None;
        if (a.Title != b.Title || a.Artist != b.Artist || a.Album != b.Album || a.ThumbnailHash != b.ThumbnailHash) c |= SmtcChange.Media;
        if (a.State != b.State || a.Shuffle != b.Shuffle || a.Repeat != b.Repeat || a.CanPlay != b.CanPlay || a.CanPause != b.CanPause
            || a.CanNext != b.CanNext || a.CanPrevious != b.CanPrevious || a.CanSeek != b.CanSeek) c |= SmtcChange.Playback;
        if (a.Position != b.Position || a.Duration != b.Duration || a.PositionAt != b.PositionAt) c |= SmtcChange.Timeline;
        return c;
    }

    // ------------------------------------------------------------------ commands (these DO change playback)

    public Task<bool> TogglePlayPauseAsync(string sessionKey) => Run(sessionKey, p => p.TogglePlayPauseAsync(), startsPlay: s => s != PlayState.Playing);
    public Task<bool> PlayAsync(string sessionKey) => Run(sessionKey, p => p.PlayAsync(), startsPlay: _ => true);
    public Task<bool> PauseAsync(string sessionKey) => Run(sessionKey, p => p.PauseAsync());
    public Task<bool> NextAsync(string sessionKey) => Run(sessionKey, p => p.NextAsync());
    public Task<bool> PreviousAsync(string sessionKey) => Run(sessionKey, p => p.PreviousAsync());
    public Task<bool> SeekAsync(string sessionKey, TimeSpan position) => Run(sessionKey, p => p.SeekAsync(position < TimeSpan.Zero ? TimeSpan.Zero : position));
    public Task<bool> SetShuffleAsync(string sessionKey, bool on) => Run(sessionKey, p => p.SetShuffleAsync(on));
    public Task<bool> SetRepeatAsync(string sessionKey, RepeatMode mode) => Run(sessionKey, p => p.SetRepeatAsync(mode));

    private async Task<bool> Run(string sessionKey, Func<ISmtcSessionPort, Task<bool>> command, Func<PlayState, bool>? startsPlay = null)
    {
        if (!_targets.TryGetValue(sessionKey, out var target)) return false;
        try
        {
            var ok = await command(target.Port).ConfigureAwait(false);
            if (ok && startsPlay?.Invoke(target.State) == true)
            {
                // "Prefer the session the user last pressed play on": the policy keeps it while that playing run lasts.
                lock (_sync) _pendingUserPlay = (sessionKey, _time.GetUtcNow());
                Arm(TimeSpan.Zero);
            }
            return ok;
        }
        catch (Exception ex)
        {
            _log.Warn("SMTC command failed", ex);
            Rebind();
            return false;
        }
    }

    // ------------------------------------------------------------------ helpers

    public static bool IsSpotifyApp(string? appId) => appId is not null && appId.Contains("spotify", StringComparison.OrdinalIgnoreCase);

    /// <summary>A short display name from an AppUserModelId ("Spotify.exe" → "Spotify", "MSEdge" → "Edge"). See <see cref="MediaAppNames"/>.</summary>
    public static string AppNameFor(string appId) => MediaAppNames.FromId(appId);

    public static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes))[..16].ToLowerInvariant();

    private static string SafeAppId(ISmtcSessionPort s)
    {
        try { return s.AppId ?? ""; }
        catch { return ""; }
    }

    private static string SafeAppName(ISmtcSessionPort s)
    {
        try { return IsSpotifyApp(s.AppId) ? "Spotify" : string.IsNullOrWhiteSpace(s.AppName) ? MediaAppNames.FromId(s.AppId) : s.AppName; }
        catch { return "Media"; }
    }

    private static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    public async ValueTask DisposeAsync()
    {
        ISmtcManagerPort? manager;
        lock (_sync)
        {
            if (_disposed) return;
            _disposed = true;
            _timer?.Dispose();
            _timer = null;
            manager = _manager;
            _manager = null;
        }
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (manager is not null)
            {
                manager.SessionsChanged -= OnManagerChanged;
                manager.CurrentSessionChanged -= OnManagerChanged;
            }
            foreach (var e in _entries) Unsubscribe(e);
            _entries = [];
            _targets = new Dictionary<string, Target>();
        }
        catch (Exception ex) { _log.Debug("SMTC dispose: " + ex.Message); }
        finally { _gate.Release(); }
    }
}
