namespace PrismControl.Spotify.Web;

/// <summary>Who is asking. Commands go first, then user-initiated reads; polls are dropped (never queued) when there is no budget.</summary>
public enum RequestPriority { Poll = 0, Read = 1, Command = 2 }

public sealed class GateOptions
{
    /// <summary>Sustained requests per second (research §4.3: 1/s).</summary>
    public double RatePerSecond { get; init; } = 1;
    /// <summary>Bucket size (research: burst 8).</summary>
    public int Burst { get; init; } = 8;
    /// <summary>Hard cap per rolling 60 s (research: 60).</summary>
    public int MaxPerMinute { get; init; } = 60;
    /// <summary>
    /// The longest a read or command may wait for a slot (token bucket, rolling minute, 429 pause) before it fails with
    /// <see cref="ApiFailure.RateLimited"/>. Keeps key mailboxes responsive and stops presses from firing minutes later.
    /// </summary>
    public TimeSpan MaxWait { get; init; } = TimeSpan.FromSeconds(2);
}

/// <summary>
/// The client-side limiter in front of every api.spotify.com request: a token bucket (1/s, burst 8), a hard cap of 60
/// per rolling minute, and a global pause after a 429 (Retry-After). Polls are dropped when there is no slot; reads and
/// commands wait at most <see cref="GateOptions.MaxWait"/> and otherwise fail fast (nothing is queued for later).
/// Thread-safe; deterministic with a manual TimeProvider.
/// </summary>
public sealed class RequestGate
{
    private readonly TimeProvider _time;
    private readonly GateOptions _o;
    private readonly object _lock = new();
    private readonly Queue<long> _window = new();
    private double _tokens;
    private long _lastRefill;
    private DateTimeOffset? _pausedUntil;
    private bool _pauseIsQuota;
    private int _waitingCommands;

    public RequestGate(TimeProvider time, GateOptions? options = null)
    {
        _time = time;
        _o = options ?? new GateOptions();
        _tokens = _o.Burst;
        _lastRefill = time.GetTimestamp();
    }

    public DateTimeOffset? PausedUntil { get { lock (_lock) return _pausedUntil is { } p && p > _time.GetUtcNow() ? p : null; } }

    /// <summary>See <see cref="GateOptions.MaxWait"/>.</summary>
    public TimeSpan MaxWait => _o.MaxWait;

    /// <summary>True while a pause longer than <see cref="MaxWait"/> is in force (requests fail fast until it ends).</summary>
    public bool IsPausedBeyondMaxWait(DateTimeOffset now)
    {
        lock (_lock) return _pausedUntil is { } p && p - now > _o.MaxWait;
    }

    /// <summary>Requests granted in the last 60 s.</summary>
    public int RecentCount { get { lock (_lock) { Prune(_time.GetTimestamp()); return _window.Count; } } }

    /// <summary>
    /// Stops all requests until <paramref name="until"/> (only ever extends an existing pause). <paramref name="quota"/>
    /// marks a Development Mode quota pause (basic mode), so fast failures say so.
    /// </summary>
    public void PauseUntil(DateTimeOffset until, bool quota = false)
    {
        lock (_lock)
        {
            if (_pausedUntil is not { } p || until > p)
            {
                _pausedUntil = until;
                _pauseIsQuota = quota;
            }
        }
    }

    public void Resume()
    {
        lock (_lock)
        {
            _pausedUntil = null;
            _pauseIsQuota = false;
        }
    }

    /// <summary>
    /// Takes one request slot. Polls return false at once if none is free. Reads and commands (commands ahead of reads)
    /// wait up to <paramref name="maxWait"/> (default <see cref="MaxWait"/>); if the slot is further away than that they
    /// throw <see cref="SpotifyApiException"/> (<see cref="ApiFailure.RateLimited"/>, or <see cref="ApiFailure.Quota"/> in a
    /// quota pause) carrying the time until a slot would be free in <see cref="SpotifyApiException.RetryAfter"/>.
    /// </summary>
    public async ValueTask<bool> AcquireAsync(RequestPriority priority, CancellationToken cancellationToken = default, TimeSpan? maxWait = null)
    {
        if (priority == RequestPriority.Poll) return TryTake(priority, out _, out _);
        var budget = maxWait is { } m ? (m < TimeSpan.Zero ? TimeSpan.Zero : m) : _o.MaxWait;
        var started = _time.GetTimestamp();
        if (priority == RequestPriority.Command) Interlocked.Increment(ref _waitingCommands);
        try
        {
            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (TryTake(priority, out var wait, out var quota)) return true;
                var left = budget - _time.GetElapsedTime(started);
                if (wait > left)
                {
                    throw new SpotifyApiException(quota ? ApiFailure.Quota : ApiFailure.RateLimited, 0, "client",
                        quota ? "Spotify quota reached (basic mode)." : "Spotify is busy (client-side limit).", wait);
                }
                await Task.Delay(wait, _time, cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            if (priority == RequestPriority.Command) Interlocked.Decrement(ref _waitingCommands);
        }
    }

    private bool TryTake(RequestPriority priority, out TimeSpan wait, out bool quota)
    {
        lock (_lock)
        {
            quota = false;
            var nowTs = _time.GetTimestamp();
            var now = _time.GetUtcNow();
            Refill(nowTs);
            Prune(nowTs);
            if (_pausedUntil is { } p && p > now)
            {
                wait = Clamp(p - now);
                quota = _pauseIsQuota;
                return false;
            }
            // Commands ahead of reads and polls: a waiting command takes the next token.
            if (priority != RequestPriority.Command && Volatile.Read(ref _waitingCommands) > 0)
            {
                wait = TimeSpan.FromMilliseconds(50);
                return false;
            }
            if (_tokens < 1)
            {
                wait = Clamp(TimeSpan.FromSeconds((1 - _tokens) / _o.RatePerSecond));
                return false;
            }
            if (_window.Count >= _o.MaxPerMinute)
            {
                var oldest = _window.Peek();
                wait = Clamp(TimeSpan.FromMinutes(1) - _time.GetElapsedTime(oldest, nowTs));
                return false;
            }
            _tokens -= 1;
            _window.Enqueue(nowTs);
            wait = TimeSpan.Zero;
            return true;
        }
    }

    private void Refill(long nowTs)
    {
        var elapsed = _time.GetElapsedTime(_lastRefill, nowTs).TotalSeconds;
        if (elapsed > 0) _tokens = Math.Min(_o.Burst, _tokens + elapsed * _o.RatePerSecond);
        _lastRefill = nowTs;
    }

    private void Prune(long nowTs)
    {
        while (_window.Count > 0 && _time.GetElapsedTime(_window.Peek(), nowTs) >= TimeSpan.FromMinutes(1)) _window.Dequeue();
    }

    private static TimeSpan Clamp(TimeSpan t) => t < TimeSpan.FromMilliseconds(10) ? TimeSpan.FromMilliseconds(10) : t;
}
