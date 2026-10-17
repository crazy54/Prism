using PrismControl.Spotify.Smtc;

namespace PrismControl.Spotify.SafeMode;

/// <summary>
/// Safe mode's Windows media session: reads, events and re-binds go to the real session, but every Try* command
/// (play, pause, skip, seek, shuffle, repeat) is suppressed and only changes a local overlay on top of what the session
/// reports, so the keys still respond. The overlay is dropped when the session moves to another track.
/// </summary>
public sealed class SafeModeMediaSession : IMediaSessionSource
{
    private readonly IMediaSessionSource _inner;
    private readonly SafeModeWrites _writes;
    private readonly TimeProvider _time;
    private readonly object _lock = new();
    private string? _overlayFor;   // AppId + title the overlay belongs to
    private PlayState? _state;
    private (TimeSpan Position, DateTimeOffset At)? _position;
    private bool? _shuffle;
    private RepeatMode? _repeat;

    public SafeModeMediaSession(IMediaSessionSource inner, SafeModeWrites writes, TimeProvider time)
    {
        _inner = inner;
        _writes = writes;
        _time = time;
        _inner.Changed += OnInnerChanged;
    }

    public event EventHandler<SmtcChange>? Changed;

    public SmtcSnapshot? Current
    {
        get
        {
            var s = _inner.Current;
            if (s is null) return null;
            lock (_lock)
            {
                if (_overlayFor is null) return s;
                if (_overlayFor != Key(s)) { ClearOverlay(); return s; }
                return s with
                {
                    State = _state ?? s.State,
                    Position = _position?.Position ?? s.Position,
                    PositionAt = _position?.At ?? s.PositionAt,
                    Shuffle = _shuffle ?? s.Shuffle,
                    Repeat = _repeat ?? s.Repeat,
                };
            }
        }
    }

    public bool FollowAnyApp
    {
        get => _inner.FollowAnyApp;
        set => _inner.FollowAnyApp = value;
    }

    public Task StartAsync(CancellationToken cancellationToken) => _inner.StartAsync(cancellationToken);
    public void Rebind() => _inner.Rebind();

    private static string Key(SmtcSnapshot s) => s.AppId + "\n" + s.Title;

    private void ClearOverlay()
    {
        _overlayFor = null;
        _state = null;
        _position = null;
        _shuffle = null;
        _repeat = null;
    }

    private void OnInnerChanged(object? sender, SmtcChange what) => Changed?.Invoke(this, what);

    /// <summary>Applies a suppressed command to the overlay. False (like the real call) when there is no session.</summary>
    private Task<bool> Fake(string kind, SmtcChange what, Action<SmtcSnapshot> apply)
    {
        var s = Current;
        _writes.Suppressed("smtc " + kind);
        if (s is null) return Task.FromResult(false);
        lock (_lock)
        {
            if (_overlayFor != Key(s)) ClearOverlay();
            _overlayFor = Key(s);
            apply(s);
        }
        Changed?.Invoke(this, what);
        return Task.FromResult(true);
    }

    /// <summary>Freezes or restarts the interpolated position at a play-state change.</summary>
    private void SetState(SmtcSnapshot s, PlayState next)
    {
        var now = _time.GetUtcNow();
        var pos = s.Position ?? TimeSpan.Zero;
        if (s.State == PlayState.Playing && s.PositionAt is { } at && now > at) pos += now - at;
        if (s.Duration is { } d && pos > d) pos = d;
        _position = (pos, now);
        _state = next;
    }

    public Task<bool> TogglePlayPauseAsync() => Fake("toggle", SmtcChange.Playback | SmtcChange.Timeline,
        s => SetState(s, s.State == PlayState.Playing ? PlayState.Paused : PlayState.Playing));

    public Task<bool> PlayAsync() => Fake("play", SmtcChange.Playback | SmtcChange.Timeline, s => SetState(s, PlayState.Playing));
    public Task<bool> PauseAsync() => Fake("pause", SmtcChange.Playback | SmtcChange.Timeline, s => SetState(s, PlayState.Paused));

    /// <summary>A fake skip cannot change the track; it restarts the current one so the press is visible.</summary>
    public Task<bool> NextAsync() => Fake("next", SmtcChange.Timeline, _ => _position = (TimeSpan.Zero, _time.GetUtcNow()));
    public Task<bool> PreviousAsync() => Fake("previous", SmtcChange.Timeline, _ => _position = (TimeSpan.Zero, _time.GetUtcNow()));

    public Task<bool> SeekAsync(TimeSpan position) => Fake("seek", SmtcChange.Timeline,
        _ => _position = (position < TimeSpan.Zero ? TimeSpan.Zero : position, _time.GetUtcNow()));

    public Task<bool> SetShuffleAsync(bool on) => Fake("shuffle", SmtcChange.Playback, _ => _shuffle = on);
    public Task<bool> SetRepeatAsync(RepeatMode mode) => Fake("repeat", SmtcChange.Playback, _ => _repeat = mode);

    public async ValueTask DisposeAsync()
    {
        _inner.Changed -= OnInnerChanged;
        await _inner.DisposeAsync().ConfigureAwait(false);
    }
}
