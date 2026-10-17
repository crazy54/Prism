using PrismControl.Core.Hosting;

namespace PrismControl.Browser.State;

/// <summary>A store change: the new snapshot and what changed.</summary>
public sealed record BrowserChangedEventArgs(BrowserSnapshot Snapshot, BrowserChange Change, string? BrowserKey);

/// <summary>
/// The merged state of every browser session. Writers (sessions, the SMTC reader, the safe-mode simulator) swap an
/// immutable <see cref="BrowserSnapshot"/> under a lock; readers take <see cref="Current"/> without locking.
/// <see cref="Changed"/> runs synchronously on the writer's thread, outside the lock: subscribers must only post to a
/// mailbox (see <see cref="Actions.BrowserBinding"/>), never block. A throwing subscriber is logged and skipped.
/// </summary>
public sealed class BrowserStore
{
    private readonly object _gate = new();
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly long _epoch;
    private BrowserSnapshot _current = BrowserSnapshot.Empty;

    public BrowserStore(ILog? log = null, TimeProvider? time = null)
    {
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
        _epoch = _time.GetTimestamp();
    }

    public BrowserSnapshot Current => Volatile.Read(ref _current);

    public TimeProvider Time => _time;

    /// <summary>Monotonic milliseconds since the store was created (for focus ordering and loss timestamps).</summary>
    public long NowMs => (long)_time.GetElapsedTime(_epoch).TotalMilliseconds;

    /// <summary>Wall clock (UTC ms) for media position extrapolation.</summary>
    public long WallMs => _time.GetUtcNow().ToUnixTimeMilliseconds();

    public event EventHandler<BrowserChangedEventArgs>? Changed;

    /// <summary>Applies <paramref name="update"/> atomically. Returns the new snapshot. No event when nothing changed.</summary>
    public BrowserSnapshot Mutate(Func<BrowserSnapshot, BrowserSnapshot> update, BrowserChange change, string? browserKey = null)
    {
        BrowserSnapshot next;
        lock (_gate)
        {
            var before = _current;
            next = update(before);
            if (ReferenceEquals(next, before)) return before;
            next = next with { Version = before.Version + 1 };
            Volatile.Write(ref _current, next);
        }
        Raise(new BrowserChangedEventArgs(next, change, browserKey));
        return next;
    }

    /// <summary>Updates one browser instance (no-op when it is gone).</summary>
    public BrowserSnapshot UpdateBrowser(string key, Func<BrowserInstance, BrowserInstance> update, BrowserChange change) =>
        Mutate(s =>
        {
            var i = IndexOf(s, key);
            if (i < 0) return s;
            var b = s.Browsers[i];
            var nb = update(b);
            return ReferenceEquals(nb, b) ? s : s with { Browsers = s.Browsers.SetItem(i, nb) };
        }, change, key);

    /// <summary>Adds or replaces the instance with the same key.</summary>
    public BrowserSnapshot Upsert(BrowserInstance instance, BrowserChange change = BrowserChange.All) =>
        Mutate(s =>
        {
            var i = IndexOf(s, instance.Key);
            return s with { Browsers = i < 0 ? s.Browsers.Add(instance) : s.Browsers.SetItem(i, instance) };
        }, change, instance.Key);

    public BrowserSnapshot Remove(string key) =>
        Mutate(s =>
        {
            var i = IndexOf(s, key);
            return i < 0 ? s : s with { Browsers = s.Browsers.RemoveAt(i) };
        }, BrowserChange.All, key);

    /// <summary>Signals a change that lives outside the snapshot (images, preview frames) so keys re-render.</summary>
    public void Touch(BrowserChange change, string? browserKey = null) => Raise(new BrowserChangedEventArgs(Current, change, browserKey));

    private static int IndexOf(BrowserSnapshot s, string key)
    {
        for (var i = 0; i < s.Browsers.Length; i++) if (s.Browsers[i].Key == key) return i;
        return -1;
    }

    private void Raise(BrowserChangedEventArgs e)
    {
        var handlers = Changed;
        if (handlers is null) return;
        foreach (var d in handlers.GetInvocationList())
        {
            try { ((EventHandler<BrowserChangedEventArgs>)d)(this, e); }
            catch (Exception ex) { _log.Warn("browser state subscriber failed", ex); }
        }
    }
}
