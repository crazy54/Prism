namespace PrismControl.Ai.Ingress;

/// <summary>A token bucket on a <see cref="TimeProvider"/> timestamp clock. Thread-safe.</summary>
public sealed class TokenBucket
{
    private readonly object _gate = new();
    private readonly TimeProvider time;
    private readonly double ratePerSecond, burst;
    private double _tokens;
    private long _last;

    public TokenBucket(TimeProvider time, double ratePerSecond, double burst)
    {
        this.time = time;
        this.ratePerSecond = ratePerSecond;
        this.burst = burst;
        _tokens = burst;
        _last = time.GetTimestamp();
    }

    public bool TryTake()
    {
        lock (_gate)
        {
            var now = time.GetTimestamp();
            _tokens = Math.Min(burst, _tokens + time.GetElapsedTime(_last, now).TotalSeconds * ratePerSecond);
            _last = now;
            if (_tokens < 1) return false;
            _tokens -= 1;
            return true;
        }
    }
}

/// <summary>Ingress limits (ai-apps.md §5.5): 100 frames/s overall, 20/s per session (bounded table of sessions).</summary>
public sealed class IngressLimits(TimeProvider time, double globalPerSecond = 100, double perSessionPerSecond = 20)
{
    private const int MaxTrackedSessions = 512;
    private readonly TokenBucket _global = new(time, globalPerSecond, globalPerSecond);
    private readonly Dictionary<string, TokenBucket> _sessions = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    public bool AllowGlobal() => _global.TryTake();

    public bool AllowSession(string? sessionId)
    {
        if (sessionId is null) return true;
        TokenBucket bucket;
        lock (_gate)
        {
            if (!_sessions.TryGetValue(sessionId, out bucket!))
            {
                if (_sessions.Count >= MaxTrackedSessions) _sessions.Clear();
                bucket = new TokenBucket(time, perSessionPerSecond, perSessionPerSecond);
                _sessions[sessionId] = bucket;
            }
        }
        return bucket.TryTake();
    }
}
