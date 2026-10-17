using PrismControl.Core.Hosting;

namespace PrismControl.WinShell.Display;

public enum DdcStatus
{
    /// <summary>Not read yet (a GET takes 54–121 ms).</summary>
    Unknown,
    Ok,
    /// <summary>A write is queued or in flight (debounced).</summary>
    Writing,
    /// <summary>The monitor answered but did not apply the last write (HDR often locks brightness).</summary>
    Locked,
    /// <summary>The monitor does not answer this VCP code (or DDC/CI is off in its menu).</summary>
    Unsupported,
}

/// <summary>What a key or dial shows for one VCP code of one monitor.</summary>
public sealed record VcpView(uint Current, uint Max, DdcStatus Status, uint? Target)
{
    public uint Shown => Target ?? Current;
    public double Fraction => Max == 0 ? 0 : Math.Clamp((double)Shown / Max, 0, 1);
}

public enum InputSwitchOutcome { Switched, SwitchedUnverified, AlreadyActive, NotApplied, Failed, NoMonitor, Unsupported }

/// <summary>
/// DDC/CI for every action: one I2C conversation at a time per monitor, GET results cached, writes debounced (the first
/// write goes out at once, then at most one per <see cref="Debounce"/>, and the final value always), and verified with a
/// GET afterwards so a write the monitor ignored shows as <see cref="DdcStatus.Locked"/> (true state, principle 2).
/// Capabilities (1.3–3.7 s) are read once per monitor per run.
/// </summary>
public sealed class DdcService : IAsyncDisposable
{
    public static readonly TimeSpan Debounce = TimeSpan.FromMilliseconds(150);
    public static readonly TimeSpan VerifyDelay = TimeSpan.FromMilliseconds(300);
    public static readonly TimeSpan InputVerifyDelay = TimeSpan.FromMilliseconds(1500);

    private sealed class Value
    {
        public uint Current, Max;
        public DdcStatus Status = DdcStatus.Unknown;
        public uint? Target;
        public long LastWriteAt;
        public bool Pumping;
        public Task? Reading;
        public long ReadAt;
    }

    private sealed class Channel(string monitorId)
    {
        public readonly string MonitorId = monitorId;
        public readonly SemaphoreSlim Bus = new(1, 1);
        public DdcHandle? Handle;
        public readonly Dictionary<byte, Value> Values = [];
        public Task<DdcCapabilities?>? Caps;
    }

    private readonly IDdcBus _bus;
    private readonly IDdcWriter _writer;
    private readonly DisplayService _display;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly Dictionary<string, Channel> _channels = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Task> _work = [];
    private bool _disposed;

    public DdcService(IDdcBus bus, IDdcWriter writer, DisplayService display, TimeProvider time, ILog log)
    {
        _bus = bus;
        _writer = writer;
        _display = display;
        _time = time;
        _log = log;
    }

    public IDdcWriter Writer => _writer;

    /// <summary>A value, status or capability changed for a monitor (raised on a worker thread; actions Post a redraw).</summary>
    public event Action<string>? Changed;

    // ---------------------------------------------------------------- reads

    /// <summary>How often a visible control re-reads a value so changes made on the monitor's own menu show up (true state).</summary>
    public static readonly TimeSpan RefreshEvery = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan RetryUnsupported = TimeSpan.FromSeconds(15);

    /// <summary>The cached view (null = not read yet). Starts a background GET when unknown or stale.</summary>
    public VcpView? Peek(string monitorId, byte code, bool refresh = true)
    {
        lock (_gate)
        {
            var ch = ChannelFor(monitorId);
            if (!ch.Values.TryGetValue(code, out var v)) ch.Values[code] = v = new Value();
            if (refresh && !_disposed && v.Reading is null or { IsCompleted: true } && !v.Pumping && v.Target is null)
            {
                var age = v.ReadAt == 0 ? TimeSpan.MaxValue : _time.GetElapsedTime(v.ReadAt);
                var due = v.Status switch
                {
                    DdcStatus.Unknown => v.ReadAt == 0,
                    DdcStatus.Unsupported => age > RetryUnsupported,
                    _ => age > RefreshEvery,
                };
                if (due) v.Reading = ReadAsync(monitorId, code);
            }
            if (v.Status is DdcStatus.Unknown) return null;
            return new VcpView(v.Current, v.Max, v.Status, v.Target);
        }
    }

    /// <summary>Reads one VCP code now (through the monitor's queue). Null when the monitor does not answer.</summary>
    public Task<VcpReading?> ReadAsync(string monitorId, byte code) => Track(ReadCoreAsync(monitorId, code));

    private async Task<VcpReading?> ReadCoreAsync(string monitorId, byte code)
    {
        Channel ch;
        Value v;
        lock (_gate)
        {
            ch = ChannelFor(monitorId);
            if (!ch.Values.TryGetValue(code, out v!)) ch.Values[code] = v = new Value();
            v.ReadAt = _time.GetTimestamp();
        }
        var reading = await OnBusAsync(ch, h => _bus.Get(h, code, out _)).ConfigureAwait(false);
        lock (_gate)
        {
            v.ReadAt = _time.GetTimestamp();
            if (v.Pumping || v.Target is not null) { /* a write is in progress: its verify step owns the value */ }
            else if (reading is { } r)
            {
                v.Current = Overlaid(monitorId, code, r.Current);
                v.Max = r.Max;
                // True state: a fresh read replaces an earlier "locked" alert (it was a brief alert, not a mode).
                v.Status = DdcStatus.Ok;
            }
            else if (v.Status is DdcStatus.Unknown) v.Status = DdcStatus.Unsupported;
        }
        Changed?.Invoke(monitorId);
        // Safe mode: what the fake writer "applied" is the value the model reports.
        return reading is { } rd ? new VcpReading(Overlaid(monitorId, code, rd.Current), rd.Max) : null;
    }

    private uint Overlaid(string monitorId, byte code, uint real) =>
        _writer is IDdcOverlay o && o.TryGet(monitorId, code, out var fake) ? fake : real;

    /// <summary>The parsed capabilities string (read once per monitor; 1.3–3.7 s on this PC).</summary>
    public Task<DdcCapabilities?> CapabilitiesAsync(string monitorId)
    {
        Channel ch;
        lock (_gate)
        {
            ch = ChannelFor(monitorId);
            ch.Caps ??= Track(ReadCapsAsync(ch));
            return ch.Caps;
        }
    }

    public DdcCapabilities? CachedCapabilities(string monitorId)
    {
        lock (_gate) return ChannelFor(monitorId).Caps is { IsCompletedSuccessfully: true } t ? t.Result : null;
    }

    private async Task<DdcCapabilities?> ReadCapsAsync(Channel ch)
    {
        var s = await OnBusAsync(ch, h => _bus.Capabilities(h, out _)).ConfigureAwait(false);
        var caps = s is null ? null : DdcCapabilities.Parse(s);
        Changed?.Invoke(ch.MonitorId);
        return caps;
    }

    // ---------------------------------------------------------------- writes

    /// <summary>Moves a value by <paramref name="delta"/> (from the pending target, else the last read), clamped to 0..max.</summary>
    public bool Adjust(string monitorId, byte code, int delta)
    {
        uint next;
        lock (_gate)
        {
            var ch = ChannelFor(monitorId);
            if (!ch.Values.TryGetValue(code, out var v) || v.Status is DdcStatus.Unknown or DdcStatus.Unsupported || v.Max == 0) return false;
            var from = (long)(v.Target ?? v.Current);
            next = (uint)Math.Clamp(from + delta, 0, v.Max);
            if (next == (v.Target ?? v.Current)) return false;
        }
        Set(monitorId, code, next);
        return true;
    }

    /// <summary>Requests a value. The model shows it at once as the target; the bus write is debounced and verified.</summary>
    public void Set(string monitorId, byte code, uint value)
    {
        bool start;
        lock (_gate)
        {
            var ch = ChannelFor(monitorId);
            if (!ch.Values.TryGetValue(code, out var v)) ch.Values[code] = v = new Value { Max = 100 };
            if (v.Max > 0) value = Math.Min(value, v.Max);
            v.Target = value;
            v.Status = DdcStatus.Writing;
            start = !v.Pumping;
            v.Pumping = true;
            if (start) _ = Track(PumpAsync(ch, code, v));
        }
        Changed?.Invoke(monitorId);
    }

    private async Task PumpAsync(Channel ch, byte code, Value v)
    {
        // Dedupe only within this run: a later run (the same value again after an ignored write, or after the user changed
        // it on the monitor's own menu) always writes.
        uint? lastWritten = null;
        try
        {
            while (true)
            {
                long wait;
                uint target;
                lock (_gate)
                {
                    if (_disposed || v.Target is not { } t) return;
                    target = t;
                    wait = v.LastWriteAt == 0 ? 0 : (long)(Debounce.TotalMilliseconds - _time.GetElapsedTime(v.LastWriteAt).TotalMilliseconds);
                }
                if (wait > 0)
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(wait), _time).ConfigureAwait(false);
                    continue; // pick up the newest target
                }
                var ok = true;
                if (target != lastWritten)
                {
                    ok = await OnBusAsync(ch, h => _writer.Set(h, code, target, out _)).ConfigureAwait(false);
                    lastWritten = target;
                    lock (_gate) v.LastWriteAt = _time.GetTimestamp();
                }
                if (!ok)
                {
                    lock (_gate)
                    {
                        if (v.Target != target) continue; // a newer value arrived meanwhile: try that one
                        v.Status = DdcStatus.Locked;
                        v.Target = null;
                    }
                    Changed?.Invoke(ch.MonitorId);
                    return;
                }
                lock (_gate)
                {
                    if (v.Target != target) continue; // the user kept turning: write the newer value next
                }
                // Quiet: verify with a GET once the monitor has had time to apply it.
                await Task.Delay(VerifyDelay, _time).ConfigureAwait(false);
                lock (_gate)
                {
                    if (v.Target != target) continue;
                }
                var read = await OnBusAsync(ch, h => _bus.Get(h, code, out _)).ConfigureAwait(false);
                lock (_gate)
                {
                    if (v.Target != target) continue;
                    var actual = read is { } r ? Overlaid(ch.MonitorId, code, r.Current) : target;
                    if (read is { } rr) v.Max = rr.Max;
                    v.Current = actual;
                    v.Target = null;
                    v.ReadAt = _time.GetTimestamp();
                    v.Status = actual == target ? DdcStatus.Ok : DdcStatus.Locked;
                    if (v.Status == DdcStatus.Locked) _log.Info($"{Vcp.Name(code)} write was not applied by the monitor (reads {actual}, asked {target})");
                }
                Changed?.Invoke(ch.MonitorId);
                return;
            }
        }
        finally
        {
            // Hand over atomically: a Set that arrives while we finish either sees Pumping (and leaves the value to the
            // follow-up run started here) or starts its own run after Pumping went false. Never two runs at once.
            bool again;
            lock (_gate)
            {
                again = !_disposed && v.Target is not null;
                v.Pumping = again;
            }
            if (again) _ = Track(PumpAsync(ch, code, v));
        }
    }

    /// <summary>
    /// Switches the monitor's input (VCP 60). Disruptive and one-way (this PC's picture may disappear), so callers confirm
    /// first. Verified with a GET after 1.5 s; a monitor that stops answering counts as switched-unverified.
    /// </summary>
    public async Task<InputSwitchOutcome> SwitchInputAsync(string monitorId, uint input)
    {
        var current = await ReadAsync(monitorId, Vcp.InputSource).ConfigureAwait(false);
        if (current is { } c && (c.Current & 0xFF) == (input & 0xFF)) return InputSwitchOutcome.AlreadyActive;
        Channel ch;
        lock (_gate) ch = ChannelFor(monitorId);
        var ok = await OnBusAsync(ch, h => _writer.Set(h, Vcp.InputSource, input, out _)).ConfigureAwait(false);
        if (!ok) return InputSwitchOutcome.Failed;
        await Task.Delay(InputVerifyDelay, _time).ConfigureAwait(false);
        var after = await ReadAsync(monitorId, Vcp.InputSource).ConfigureAwait(false);
        if (after is null) return InputSwitchOutcome.SwitchedUnverified;
        return (after.Value.Current & 0xFF) == (input & 0xFF) ? InputSwitchOutcome.Switched : InputSwitchOutcome.NotApplied;
    }

    // ---------------------------------------------------------------- plumbing

    private Channel ChannelFor(string monitorId)
    {
        if (!_channels.TryGetValue(monitorId, out var ch)) _channels[monitorId] = ch = new Channel(monitorId);
        return ch;
    }

    /// <summary>Runs one bus operation on the thread pool, serialized per monitor, opening (or reopening) the handle.</summary>
    private async Task<T?> OnBusAsync<T>(Channel ch, Func<DdcHandle, T?> op)
    {
        await ch.Bus.WaitAsync().ConfigureAwait(false);
        try
        {
            return await Task.Run(() =>
            {
                lock (_gate) if (_disposed) return default;
                var m = _display.Find(ch.MonitorId);
                if (m is null) return default;
                if (ch.Handle is { } h && (h.Closed || h.HMonitor != m.Handle))
                {
                    _bus.Close(h);
                    ch.Handle = null;
                }
                ch.Handle ??= _bus.Open(m);
                return ch.Handle is { } handle ? op(handle) : default;
            }).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.Warn($"DDC/CI call failed", ex);
            return default;
        }
        finally { ch.Bus.Release(); }
    }

    private Task Track(Task t)
    {
        lock (_work)
        {
            _work.RemoveAll(x => x.IsCompleted);
            _work.Add(t);
        }
        return t;
    }

    private Task<T> Track<T>(Task<T> t)
    {
        Track((Task)t);
        return t;
    }

    /// <summary>Tests: waits for queued bus work (does not advance a manual clock).</summary>
    public async Task WhenIdleAsync(TimeSpan timeout)
    {
        var until = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < until)
        {
            Task[] pending;
            lock (_work) pending = _work.Where(t => !t.IsCompleted).ToArray();
            if (pending.Length == 0) return;
            await Task.WhenAny(Task.WhenAll(pending), Task.Delay(20)).ConfigureAwait(false);
        }
    }

    public int PendingWork { get { lock (_work) return _work.Count(t => !t.IsCompleted); } }

    public async ValueTask DisposeAsync()
    {
        lock (_gate) _disposed = true;
        // A capabilities read can take 3.7 s; new bus work is refused from here on.
        await WhenIdleAsync(TimeSpan.FromSeconds(5)).ConfigureAwait(false);
        Channel[] channels;
        lock (_gate) channels = [.. _channels.Values];
        foreach (var ch in channels)
        {
            // Close a handle only while holding its bus: never destroy it under an I2C call still in flight.
            if (!await ch.Bus.WaitAsync(TimeSpan.FromSeconds(4)).ConfigureAwait(false)) { _log.Warn("DDC/CI: a call is still running at shutdown; leaving its handle"); continue; }
            try
            {
                if (ch.Handle is { } h) { try { _bus.Close(h); } catch { /* shutting down */ } ch.Handle = null; }
            }
            finally { ch.Bus.Release(); }
        }
    }
}
