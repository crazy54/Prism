using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Hub;

/// <summary>
/// Dial streams (research §9.4): seek, zoom, volume and rate are latest-wins at 20 Hz; scroll and relative seeks are
/// accumulated, never dropped. <see cref="Post"/> returns immediately (never blocks a mailbox); a timer flushes due
/// streams through the command sink. Results are reported to the newest poster's callback.
/// </summary>
public sealed class CommandCoalescer : IDisposable
{
    private sealed class Stream
    {
        public required string Browser;
        public required string Op;
        public JsonObject? Pending;
        public Action<CommandResult>? OnResult;
        public long LastSent;
        public bool InFlight;
    }

    private readonly IBrowserCommandSink _sink;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly TimeSpan _interval;
    private readonly object _gate = new();
    private readonly Dictionary<string, Stream> _streams = new(StringComparer.Ordinal);
    private ITimer? _timer;
    private bool _disposed;

    public CommandCoalescer(IBrowserCommandSink sink, TimeProvider time, ILog log, TimeSpan? interval = null)
    {
        _sink = sink;
        _time = time;
        _log = log;
        _interval = interval ?? Protocol.Wire.Limits.DialStreamInterval;
    }

    /// <summary>
    /// Queues a command on stream <paramref name="streamKey"/>. <paramref name="merge"/> receives the args still pending
    /// (null if none) and returns the args to send: return the new value for latest-wins, or add to the pending value
    /// to accumulate.
    /// </summary>
    public void Post(string browserKey, string op, string streamKey, Func<JsonObject?, JsonObject> merge, Action<CommandResult>? onResult = null)
    {
        var id = browserKey + "|" + op + "|" + streamKey;
        var sendNow = false;
        Stream s;
        lock (_gate)
        {
            if (_disposed) return;
            if (!_streams.TryGetValue(id, out s!)) _streams[id] = s = new Stream { Browser = browserKey, Op = op };
            s.Pending = merge(s.Pending);
            s.OnResult = onResult ?? s.OnResult;
            // The first event of a burst goes out at once; the rest wait for the 50 ms slot.
            if (!s.InFlight && (s.LastSent == 0 || _time.GetElapsedTime(s.LastSent) >= _interval)) sendNow = true;
            else EnsureTimer();
        }
        if (sendNow) _ = FlushAsync(s);
    }

    /// <summary>Pending args of a stream (tests and the actions' optimistic display).</summary>
    public JsonObject? PendingOf(string browserKey, string op, string streamKey)
    {
        lock (_gate) return _streams.TryGetValue(browserKey + "|" + op + "|" + streamKey, out var s) ? s.Pending?.DeepClone() as JsonObject : null;
    }

    private void EnsureTimer()
    {
        _timer ??= _time.CreateTimer(_ => Tick(), null, _interval, _interval);
    }

    private void Tick()
    {
        List<Stream> due = [];
        lock (_gate)
        {
            foreach (var s in _streams.Values)
                if (s.Pending is not null && !s.InFlight && _time.GetElapsedTime(s.LastSent) >= _interval) due.Add(s);
            if (due.Count == 0 && _streams.Values.All(s => s.Pending is null && !s.InFlight))
            {
                _timer?.Dispose();
                _timer = null;
            }
        }
        foreach (var s in due) _ = FlushAsync(s);
    }

    private async Task FlushAsync(Stream s)
    {
        JsonObject? args;
        Action<CommandResult>? cb;
        lock (_gate)
        {
            if (s.InFlight || s.Pending is null) return;
            args = s.Pending;
            s.Pending = null;
            s.InFlight = true;
            s.LastSent = _time.GetTimestamp();
            cb = s.OnResult;
        }
        CommandResult r;
        try { r = await _sink.SendAsync(s.Browser, s.Op, args).ConfigureAwait(false); }
        catch (Exception ex)
        {
            _log.Debug($"{s.Op} stream failed: {ex.GetType().Name}");
            r = CommandResult.Fail(Protocol.Wire.Err.Disconnected);
        }
        lock (_gate)
        {
            s.InFlight = false;
            if (s.Pending is not null) EnsureTimer();
        }
        try { cb?.Invoke(r); }
        catch (Exception ex) { _log.Debug("stream callback failed: " + ex.GetType().Name); }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _disposed = true;
            _timer?.Dispose();
            _timer = null;
            _streams.Clear();
        }
    }
}
