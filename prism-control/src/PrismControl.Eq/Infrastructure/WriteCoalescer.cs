namespace PrismControl.Eq.Infrastructure;

/// <summary>
/// Coalesces bursts of edits into few writes (research eq.md §8, "the coalescer"). Per key: latest wins, a trailing
/// debounce (default 100 ms) re-armed by each edit, but never later than max wait (250 ms) after the first pending edit.
/// Across all keys: one write in flight at a time and a minimum gap between write starts (Sonar keys its rate warning
/// on "METHOD path", and every EQ write is the same <c>PUT /configs</c>).
/// <para>
/// The write delegate reads the latest state itself when it runs, so a key is just "dirty". Thread-safe; timers come
/// from the <see cref="TimeProvider"/>, so tests drive it with a manual clock.
/// </para>
/// </summary>
public sealed class WriteCoalescer<TKey> : IAsyncDisposable where TKey : notnull
{
    private sealed class Entry
    {
        public bool Dirty;
        public long FirstPendingAt;
        public long LastEditAt;
        public bool Urgent;
    }

    private readonly object _gate = new();
    private readonly Dictionary<TKey, Entry> _entries = new();
    private readonly TimeProvider _time;
    private readonly Func<TKey, CancellationToken, Task> _write;
    private readonly Action<TKey, Exception>? _onError;
    private readonly ITimer _timer;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<TaskCompletionSource> _idleWaiters = [];
    private bool _running;
    private TKey? _inFlight;
    private bool _hasInFlight;
    private long _lastWriteStart = long.MinValue;
    private bool _disposed;

    public TimeSpan Debounce { get; }
    public TimeSpan MaxWait { get; }
    public TimeSpan MinGap { get; }
    /// <summary>Writes started so far (diagnostics and tests).</summary>
    public int WritesStarted { get; private set; }

    public WriteCoalescer(TimeProvider time, Func<TKey, CancellationToken, Task> write, Action<TKey, Exception>? onError = null,
        TimeSpan? debounce = null, TimeSpan? maxWait = null, TimeSpan? minGap = null)
    {
        _time = time;
        _write = write;
        _onError = onError;
        Debounce = debounce ?? TimeSpan.FromMilliseconds(100);
        MaxWait = maxWait ?? TimeSpan.FromMilliseconds(250);
        MinGap = minGap ?? TimeSpan.FromMilliseconds(180);
        _timer = time.CreateTimer(_ => Kick(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Marks <paramref name="key"/> dirty; its write runs after the debounce (or max wait).</summary>
    public void Schedule(TKey key)
    {
        lock (_gate)
        {
            if (_disposed) return;
            var now = _time.GetTimestamp();
            if (!_entries.TryGetValue(key, out var e)) _entries[key] = e = new Entry();
            if (!e.Dirty) { e.Dirty = true; e.FirstPendingAt = now; }
            e.LastEditAt = now;
        }
        Kick();
    }

    /// <summary>A write for <paramref name="key"/> is pending or in flight.</summary>
    public bool IsBusy(TKey key)
    {
        lock (_gate) return (_entries.TryGetValue(key, out var e) && e.Dirty) || (_hasInFlight && EqualityComparer<TKey>.Default.Equals(_inFlight, key));
    }

    public bool IsIdle { get { lock (_gate) return !_hasInFlight && !_entries.Values.Any(e => e.Dirty); } }

    /// <summary>Drops a pending (not yet started) write.</summary>
    public void Cancel(TKey key)
    {
        lock (_gate) { if (_entries.TryGetValue(key, out var e)) e.Dirty = false; }
        Kick();
    }

    /// <summary>Starts every pending write now (ignoring debounce and gap), and waits until all are done.</summary>
    public Task FlushAsync(CancellationToken ct = default)
    {
        lock (_gate) foreach (var e in _entries.Values) if (e.Dirty) e.Urgent = true;
        Kick();
        return WhenIdleAsync(ct);
    }

    /// <summary>Completes when nothing is pending or in flight.</summary>
    public Task WhenIdleAsync(CancellationToken ct = default)
    {
        TaskCompletionSource tcs;
        lock (_gate)
        {
            if (!_hasInFlight && !_entries.Values.Any(e => e.Dirty)) return Task.CompletedTask;
            tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _idleWaiters.Add(tcs);
        }
        return ct.CanBeCanceled ? tcs.Task.WaitAsync(ct) : tcs.Task;
    }

    private void Kick()
    {
        lock (_gate)
        {
            if (_running || _disposed) return;
            _running = true;
        }
        _ = PumpAsync();
    }

    private async Task PumpAsync()
    {
        while (true)
        {
            TKey key;
            lock (_gate)
            {
                var now = _time.GetTimestamp();
                if (!TryPickDue(now, out key, out var wait))
                {
                    _running = false;
                    if (wait is { } w) _timer.Change(w, Timeout.InfiniteTimeSpan);
                    else if (!_hasInFlight) ReleaseIdleWaiters();
                    return;
                }
                var e = _entries[key];
                e.Dirty = false;
                e.Urgent = false;
                _inFlight = key;
                _hasInFlight = true;
                _lastWriteStart = now;
                WritesStarted++;
            }
            try { await _write(key, _cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) when (_cts.IsCancellationRequested) { }
            catch (Exception ex) { try { _onError?.Invoke(key, ex); } catch { /* never let a logger break the pump */ } }
            finally
            {
                lock (_gate) { _hasInFlight = false; _inFlight = default; }
            }
        }
    }

    /// <summary>Under the lock: the next key whose write is due now, or how long until one is.</summary>
    private bool TryPickDue(long now, out TKey key, out TimeSpan? wait)
    {
        key = default!;
        wait = null;
        long best = long.MaxValue;
        var found = false;
        foreach (var (k, e) in _entries)
        {
            if (!e.Dirty) continue;
            long due;
            if (e.Urgent) due = now;
            else
            {
                var trailing = e.LastEditAt + Ticks(Debounce);
                var cap = e.FirstPendingAt + Ticks(MaxWait);
                due = Math.Min(trailing, cap);
                if (_lastWriteStart != long.MinValue) due = Math.Max(due, _lastWriteStart + Ticks(MinGap));
            }
            if (due < best) { best = due; key = k; found = true; }
        }
        if (!found) return false;
        if (best <= now) return true;
        wait = TimeSpan.FromTicks((long)((best - now) * (double)TimeSpan.TicksPerSecond / _time.TimestampFrequency));
        if (wait < TimeSpan.FromMilliseconds(1)) wait = TimeSpan.FromMilliseconds(1);
        return false;
    }

    private long Ticks(TimeSpan span) => (long)(span.TotalSeconds * _time.TimestampFrequency);

    private void ReleaseIdleWaiters()
    {
        foreach (var w in _idleWaiters) w.TrySetResult();
        _idleWaiters.Clear();
    }

    public async ValueTask DisposeAsync()
    {
        try { await FlushAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); }
        catch (TimeoutException) { }
        lock (_gate)
        {
            _disposed = true;
            ReleaseIdleWaiters();
        }
        _cts.Cancel();
        _timer.Dispose();
        _cts.Dispose();
    }
}
