using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// The privacy guard for hold-to-talk and hold-to-mute keys (review A #3). A held key changes the mic and only its
/// keyUp changes it back, but keyUp never comes when the key goes away while held: a page or profile switch
/// (willDisappear), the Stream Deck disconnecting, the PC sleeping, the plugin shutting down. The guard remembers every
/// held key and puts its mic back in the resting state (muted for hold-to-talk) in each of those cases. A restore that
/// cannot happen right away (audio unavailable, the mic unplugged, the write failed) waits and is retried when audio
/// comes back, so a mic is never left live by a key nobody is holding.
/// <para>The module registers one (and wires device, wake and shutdown events); an action without it uses its own.</para>
/// </summary>
internal sealed class MicHoldGuard : IDisposable
{
    private readonly IAudioEngine _engine;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly List<MicHold> _held = [];
    private readonly Dictionary<string, Pending> _pending = new(StringComparer.Ordinal);
    private readonly HashSet<Task> _inflight = [];

    public MicHoldGuard(IAudioEngine engine, ILog log)
    {
        _engine = engine;
        _log = log;
        engine.Changed += OnEngineChanged;
    }

    public IAudioEngine Engine => _engine;

    /// <summary>Keys held right now.</summary>
    public int HeldCount { get { lock (_gate) return _held.Count; } }

    /// <summary>Restores still waiting for their mic (audio unavailable or the mic unplugged).</summary>
    public int PendingCount { get { lock (_gate) return _pending.Count; } }

    /// <summary>A key went down: <paramref name="micId"/> goes back to <paramref name="restingMuted"/> when the hold ends, however it ends.</summary>
    public MicHold Hold(string context, string deckId, string micId, bool restingMuted)
    {
        var hold = new MicHold(context, deckId, micId, restingMuted);
        lock (_gate)
        {
            _held.Add(hold);
            _pending.Remove(micId); // the user is driving this mic again
        }
        return hold;
    }

    /// <summary>
    /// Ends a hold (once; later calls do nothing) and restores its mic's resting state. False when that has to wait
    /// (it is then retried when audio comes back).
    /// </summary>
    public Task<bool> ReleaseAsync(MicHold hold, string why)
    {
        if (!hold.TryEnd()) return Task.FromResult(true);
        lock (_gate)
        {
            _held.Remove(hold);
            // Another key still holds the same mic (two hold-to-talk keys): its own release puts the mic back.
            if (_held.Any(h => h.MicId == hold.MicId)) return Task.FromResult(true);
        }
        return Track(RestoreAsync(hold.MicId, hold.RestingMuted, why));
    }

    /// <summary>Every key held on one Stream Deck (it disconnected).</summary>
    public Task ReleaseDeckAsync(string deckId, string why) => Task.WhenAll(Snapshot(h => h.DeckId == deckId).Select(h => ReleaseAsync(h, why)));

    /// <summary>Every held key (the PC woke from sleep, the plugin shuts down).</summary>
    public Task ReleaseAllAsync(string why) => Task.WhenAll(Snapshot(_ => true).Select(h => ReleaseAsync(h, why)));

    /// <summary>The user set this mic's mute on purpose: a restore still waiting for it no longer applies.</summary>
    public void Supersede(string micId)
    {
        lock (_gate) _pending.Remove(micId);
    }

    /// <summary>Waits (bounded) for restores in flight, so shutdown does not tear the engine down under them.</summary>
    public async Task DrainAsync(TimeSpan timeout)
    {
        Task[] tasks;
        lock (_gate) tasks = [.. _inflight];
        if (tasks.Length == 0) return;
        await Task.WhenAny(Task.WhenAll(tasks), Task.Delay(timeout)).ConfigureAwait(false);
    }

    private List<MicHold> Snapshot(Func<MicHold, bool> which)
    {
        lock (_gate) return _held.Where(which).ToList();
    }

    private Task<bool> Track(Task<bool> t)
    {
        if (t.IsCompleted) return t;
        lock (_gate) _inflight.Add(t);
        _ = t.ContinueWith(done => { lock (_gate) _inflight.Remove(done); }, TaskScheduler.Default);
        return t;
    }

    private async Task<bool> RestoreAsync(string micId, bool muted, string why)
    {
        if (!_engine.IsAvailable || _engine.GetDevice(micId) is not { } mic)
        {
            Wait(micId, muted, why, "the mic is not available right now");
            return false;
        }
        if (mic.Muted == muted)
        {
            lock (_gate) _pending.Remove(micId);
            return true;
        }
        try
        {
            await _engine.SetMuteAsync(micId, muted).ConfigureAwait(false);
            lock (_gate) _pending.Remove(micId);
            _log.Info($"Mic {(muted ? "muted" : "unmuted")} again: a held {(muted ? "hold-to-talk" : "hold-to-mute")} key {why}.");
            return true;
        }
        catch (Exception ex)
        {
            Wait(micId, muted, why, ex.Message);
            return false;
        }
    }

    private void Wait(string micId, bool muted, string why, string reason)
    {
        lock (_gate) _pending[micId] = new Pending(muted, why);
        _log.Warn($"A held {(muted ? "hold-to-talk" : "hold-to-mute")} key {why}, but its mic could not be {(muted ? "muted" : "unmuted")} ({reason}); retrying when audio is back.");
    }

    private void OnEngineChanged(AudioChange c)
    {
        // Only when audio or a device comes back (an endpoint change would retry a failing write in a loop).
        if (c.Kind is not (AudioChangeKind.Availability or AudioChangeKind.Devices) || !_engine.IsAvailable) return;
        List<(string Mic, Pending P)> due;
        lock (_gate)
        {
            if (_pending.Count == 0) return;
            due = _pending.Where(p => _engine.GetDevice(p.Key) is not null).Select(p => (p.Key, p.Value)).ToList();
            foreach (var (mic, _) in due) _pending.Remove(mic);
        }
        foreach (var (mic, p) in due) _ = Track(RestoreAsync(mic, p.Muted, p.Why));
    }

    public void Dispose() => _engine.Changed -= OnEngineChanged;

    private sealed record Pending(bool Muted, string Why);
}

/// <summary>One held key (see <see cref="MicHoldGuard"/>).</summary>
internal sealed class MicHold(string context, string deckId, string micId, bool restingMuted)
{
    private int _ended;

    public string Context { get; } = context;
    /// <summary>The Stream Deck the key is on.</summary>
    public string DeckId { get; } = deckId;
    public string MicId { get; } = micId;
    /// <summary>The mic state to go back to: muted for hold-to-talk, live for hold-to-mute.</summary>
    public bool RestingMuted { get; } = restingMuted;
    public bool Ended => Volatile.Read(ref _ended) == 1;

    internal bool TryEnd() => Interlocked.Exchange(ref _ended, 1) == 0;
}
