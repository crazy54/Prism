using PrismControl.Spotify.Smtc;

namespace PrismControl.Spotify.SafeMode;

/// <summary>
/// Safe mode's Windows media session: reads, events, re-binds and the follow policy run on the real sessions, but every
/// command (play, pause, skip, seek, shuffle, repeat) to <b>any</b> session (Spotify's, or another app's such as a browser)
/// is suppressed and only changes a local overlay on top of what that session reports, so the keys still respond. Each
/// session has its own overlay, dropped when that session moves to another track.
/// </summary>
public sealed class SafeModeMediaSession : IMediaSessionSource
{
    private sealed class Overlay
    {
        public string? For;   // the title the overlay belongs to
        public PlayState? State;
        public (TimeSpan Position, DateTimeOffset At)? Position;
        public bool? Shuffle;
        public RepeatMode? Repeat;
    }

    private readonly IMediaSessionSource _inner;
    private readonly SafeModeWrites _writes;
    private readonly TimeProvider _time;
    private readonly object _lock = new();
    private readonly Dictionary<string, Overlay> _overlays = new(StringComparer.Ordinal);

    public SafeModeMediaSession(IMediaSessionSource inner, SafeModeWrites writes, TimeProvider time)
    {
        _inner = inner;
        _writes = writes;
        _time = time;
        _inner.Changed += OnInnerChanged;
    }

    public event EventHandler<SmtcChange>? Changed;

    public SmtcSnapshot? Current => Apply(_inner.Current);
    public SmtcSnapshot? Spotify => Apply(_inner.Spotify);

    public IReadOnlyList<SmtcSessionInfo> Sessions
    {
        get
        {
            var list = _inner.Sessions;
            lock (_lock)
            {
                if (_overlays.Count == 0) return list;
                return [.. list.Select(i => _overlays.TryGetValue(i.Key, out var o) && o.State is { } st ? i with { State = st } : i)];
            }
        }
    }

    public MediaFollow Follow
    {
        get => _inner.Follow;
        set => _inner.Follow = value;
    }

    public PlayState? SpotifyRemote
    {
        get => _inner.SpotifyRemote;
        set => _inner.SpotifyRemote = value;
    }

    public Task StartAsync(CancellationToken cancellationToken) => _inner.StartAsync(cancellationToken);
    public void Rebind() => _inner.Rebind();

    private SmtcSnapshot? Apply(SmtcSnapshot? s)
    {
        if (s is null) return null;
        lock (_lock)
        {
            if (!_overlays.TryGetValue(s.Key, out var o)) return s;
            if (o.For != s.Title)
            {
                _overlays.Remove(s.Key);
                return s;
            }
            return s with
            {
                State = o.State ?? s.State,
                Position = o.Position?.Position ?? s.Position,
                PositionAt = o.Position?.At ?? s.PositionAt,
                Shuffle = o.Shuffle ?? s.Shuffle,
                Repeat = o.Repeat ?? s.Repeat,
            };
        }
    }

    private void OnInnerChanged(object? sender, SmtcChange what) => Changed?.Invoke(this, what);

    /// <summary>The session <paramref name="key"/> as the keys see it (with its overlay), or null when it is not followed.</summary>
    private SmtcSnapshot? Find(string key) => Current is { } c && c.Key == key ? c : Spotify is { } s && s.Key == key ? s : null;

    /// <summary>Applies a suppressed command to the session's overlay. False (like the real call) when there is no such session.</summary>
    private Task<bool> Fake(string kind, string key, SmtcChange what, Action<Overlay, SmtcSnapshot> apply)
    {
        var s = Find(key);
        _writes.Suppressed("smtc " + kind);
        if (s is null) return Task.FromResult(false);
        lock (_lock)
        {
            if (!_overlays.TryGetValue(key, out var o) || o.For != s.Title) _overlays[key] = o = new Overlay { For = s.Title };
            apply(o, s);
        }
        Changed?.Invoke(this, what);
        return Task.FromResult(true);
    }

    /// <summary>Freezes or restarts the interpolated position at a play-state change.</summary>
    private void SetState(Overlay o, SmtcSnapshot s, PlayState next)
    {
        var now = _time.GetUtcNow();
        var pos = s.Position ?? TimeSpan.Zero;
        if (s.State == PlayState.Playing && s.PositionAt is { } at && now > at) pos += now - at;
        if (s.Duration is { } d && pos > d) pos = d;
        o.Position = (pos, now);
        o.State = next;
    }

    public Task<bool> TogglePlayPauseAsync(string sessionKey) => Fake("toggle", sessionKey, SmtcChange.Playback | SmtcChange.Timeline,
        (o, s) => SetState(o, s, s.State == PlayState.Playing ? PlayState.Paused : PlayState.Playing));

    public Task<bool> PlayAsync(string sessionKey) => Fake("play", sessionKey, SmtcChange.Playback | SmtcChange.Timeline, (o, s) => SetState(o, s, PlayState.Playing));
    public Task<bool> PauseAsync(string sessionKey) => Fake("pause", sessionKey, SmtcChange.Playback | SmtcChange.Timeline, (o, s) => SetState(o, s, PlayState.Paused));

    /// <summary>A fake skip cannot change the track; it restarts the current one so the press is visible.</summary>
    public Task<bool> NextAsync(string sessionKey) => Fake("next", sessionKey, SmtcChange.Timeline, (o, _) => o.Position = (TimeSpan.Zero, _time.GetUtcNow()));
    public Task<bool> PreviousAsync(string sessionKey) => Fake("previous", sessionKey, SmtcChange.Timeline, (o, _) => o.Position = (TimeSpan.Zero, _time.GetUtcNow()));

    public Task<bool> SeekAsync(string sessionKey, TimeSpan position) => Fake("seek", sessionKey, SmtcChange.Timeline,
        (o, _) => o.Position = (position < TimeSpan.Zero ? TimeSpan.Zero : position, _time.GetUtcNow()));

    public Task<bool> SetShuffleAsync(string sessionKey, bool on) => Fake("shuffle", sessionKey, SmtcChange.Playback, (o, _) => o.Shuffle = on);
    public Task<bool> SetRepeatAsync(string sessionKey, RepeatMode mode) => Fake("repeat", sessionKey, SmtcChange.Playback, (o, _) => o.Repeat = mode);

    public async ValueTask DisposeAsync()
    {
        _inner.Changed -= OnInnerChanged;
        await _inner.DisposeAsync().ConfigureAwait(false);
    }
}
