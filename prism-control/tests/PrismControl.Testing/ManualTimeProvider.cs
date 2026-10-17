namespace PrismControl.Testing;

/// <summary>
/// A deterministic clock for tests: time only moves when you call <see cref="Advance"/>, which fires due timers
/// in order. Pass it to <see cref="ActionHarness{TAction}"/> to test long-presses and render-loop cadences without sleeping.
/// <para>
/// Timestamps start at <see cref="StartTimestamp"/> (one day), not 0, like a real Stopwatch on a PC that has been up a
/// while: code that treats a 0 timestamp as "never" works the same in tests and in production.
/// </para>
/// </summary>
public sealed class ManualTimeProvider : TimeProvider
{
    /// <summary>The first <see cref="GetTimestamp"/> value (one day of ticks).</summary>
    public static readonly long StartTimestamp = TimeSpan.FromDays(1).Ticks;

    private readonly object _gate = new();
    private readonly List<ManualTimer> _timers = [];
    private long _ticks = StartTimestamp;
    private DateTimeOffset _utc;

    public ManualTimeProvider() : this(new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero)) { }

    /// <summary>A clock whose wall time starts at <paramref name="utcNow"/>.</summary>
    public ManualTimeProvider(DateTimeOffset utcNow) => _utc = utcNow;

    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() { lock (_gate) return _ticks; }
    public override DateTimeOffset GetUtcNow() { lock (_gate) return _utc; }

    /// <summary>How far the clock has been advanced since it was created.</summary>
    public TimeSpan Elapsed { get { lock (_gate) return TimeSpan.FromTicks(_ticks - StartTimestamp); } }

    /// <summary>Time until the earliest armed timer fires (null if none).</summary>
    public TimeSpan? UntilNextTimer
    {
        get
        {
            lock (_gate)
            {
                var due = _timers.Where(t => t.DueAt is not null).Select(t => t.DueAt!.Value).DefaultIfEmpty(long.MaxValue).Min();
                return due == long.MaxValue ? null : TimeSpan.FromTicks(Math.Max(0, due - _ticks));
            }
        }
    }

    /// <summary>Moves time forward, firing every timer that comes due (repeatedly, in time order).</summary>
    public void Advance(TimeSpan by)
    {
        long target;
        lock (_gate) target = _ticks + by.Ticks;
        while (true)
        {
            ManualTimer? next;
            lock (_gate)
            {
                next = _timers.Where(t => t.DueAt is { } d && d <= target).OrderBy(t => t.DueAt).FirstOrDefault();
                if (next is null)
                {
                    _utc += TimeSpan.FromTicks(target - _ticks);
                    _ticks = target;
                    return;
                }
                var due = next.DueAt!.Value;
                if (due > _ticks)
                {
                    _utc += TimeSpan.FromTicks(due - _ticks);
                    _ticks = due;
                }
                next.DueAt = next.Period is { } p && p > 0 ? _ticks + p : null;
            }
            next.Fire();
        }
    }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var t = new ManualTimer(this, callback, state);
        lock (_gate) _timers.Add(t);
        t.Change(dueTime, period);
        return t;
    }

    private sealed class ManualTimer(ManualTimeProvider owner, TimerCallback callback, object? state) : ITimer
    {
        public long? DueAt;
        public long? Period;

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            lock (owner._gate)
            {
                DueAt = dueTime == Timeout.InfiniteTimeSpan ? null : owner._ticks + Math.Max(0, dueTime.Ticks);
                Period = period == Timeout.InfiniteTimeSpan || period == TimeSpan.Zero ? null : period.Ticks;
            }
            return true;
        }

        public void Fire() => callback(state);

        public void Dispose()
        {
            lock (owner._gate)
            {
                DueAt = null;
                owner._timers.Remove(this);
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
