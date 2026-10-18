using System.Net.WebSockets;
using System.Text;
using System.Threading.Channels;
using PrismControl.Core.Hosting;

namespace PrismControl.Protocol;

public sealed record ConnectionOptions
{
    /// <summary>Keep trying to reconnect this long after an unexpected drop, then give up (the app relaunches plugins).</summary>
    public TimeSpan ReconnectWindow { get; init; } = TimeSpan.FromSeconds(10);
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromSeconds(5);
    /// <summary>A single frame that cannot be written within this time means the socket is wedged: abort and reconnect.</summary>
    public TimeSpan SendTimeout { get; init; } = TimeSpan.FromSeconds(5);
    /// <summary>Ceiling for unscheduled commands (setSettings, showOk, ...) so a buggy loop cannot flood the app.</summary>
    public double CommandsPerSecond { get; init; } = 100;
    public double LogMessagesPerSecond { get; init; } = 10;
    public int MaxQueuedFrames { get; init; } = 1024;
    public int MaxMessageBytes { get; init; } = 16 * 1024 * 1024;
    /// <summary>The host clock that stamps every received frame (ActionEvent.ReceivedTimestamp); the same one actions use.</summary>
    public TimeProvider Time { get; init; } = TimeProvider.System;
}

public enum DisconnectReason { ClosedByApp, Lost, GaveUp, Shutdown }

/// <summary>
/// The WebSocket to the Stream Deck app (ClientWebSocket, ws://127.0.0.1:port).
/// <list type="bullet">
/// <item>The receive loop only reads and hands text to <see cref="MessageReceived"/> (which must not block), so pings are always answered.</item>
/// <item>One writer task drains a bounded queue; each frame has a send timeout (a wedged socket is aborted, not waited on).</item>
/// <item>Unscheduled commands are rate-limited; render updates come pre-budgeted from the update scheduler.</item>
/// <item>Unexpected drops reconnect and re-register within <see cref="ConnectionOptions.ReconnectWindow"/>; a normal close from the app ends the run.</item>
/// </list>
/// </summary>
public sealed class StreamDeckConnection : IAsyncDisposable
{
    private readonly LaunchArgs _args;
    private readonly ILog _log;
    private readonly ConnectionOptions _options;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TokenBucket _commandBucket;
    private readonly TokenBucket _logBucket;
    private Session? _session;
    private long _framesSent, _bytesSent, _framesReceived, _dropped, _reconnects;

    public StreamDeckConnection(LaunchArgs args, ILog log, ConnectionOptions? options = null)
    {
        _args = args;
        _log = log;
        _options = options ?? new ConnectionOptions();
        _commandBucket = new TokenBucket(_options.CommandsPerSecond, _options.CommandsPerSecond * 2);
        _logBucket = new TokenBucket(_options.LogMessagesPerSecond, _options.LogMessagesPerSecond * 2);
    }

    /// <summary>Raised on the receive loop with each text message. Handlers must be fast and non-blocking.</summary>
    /// <summary>A complete text frame, with the host-clock timestamp taken the moment its last fragment arrived.</summary>
    public event Action<string, long>? MessageReceived;
    /// <summary>Raised after (re)registration.</summary>
    public event Action? Registered;
    public event Action<DisconnectReason>? Disconnected;

    public bool IsConnected => _session is { IsOpen: true };
    public long FramesSent => Interlocked.Read(ref _framesSent);
    public long FramesReceived => Interlocked.Read(ref _framesReceived);
    public long BytesSent => Interlocked.Read(ref _bytesSent);
    public long Dropped => Interlocked.Read(ref _dropped);
    public long Reconnects => Interlocked.Read(ref _reconnects);

    /// <summary>Connects, registers and processes messages until the app closes the socket, reconnecting after drops.</summary>
    public async Task<DisconnectReason> RunAsync(CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _shutdown.Token);
        var ct = linked.Token;
        DateTimeOffset? lostAt = null;
        var backoff = TimeSpan.FromMilliseconds(250);
        var everConnected = false;
        while (!ct.IsCancellationRequested)
        {
            var session = new Session(this);
            try
            {
                await session.ConnectAsync(ct).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or TimeoutException or System.Net.Sockets.SocketException)
            {
                session.Dispose();
                if (ct.IsCancellationRequested) return DisconnectReason.Shutdown;
                lostAt ??= DateTimeOffset.UtcNow;
                if (DateTimeOffset.UtcNow - lostAt > _options.ReconnectWindow)
                {
                    _log.Error($"Could not {(everConnected ? "reconnect" : "connect")} to the Stream Deck app on port {_args.Port}: {ex.Message}. Giving up.");
                    Disconnected?.Invoke(DisconnectReason.GaveUp);
                    return DisconnectReason.GaveUp;
                }
                _log.Warn($"Connect to ws://127.0.0.1:{_args.Port} failed ({ex.Message}); retrying in {backoff.TotalMilliseconds:0} ms.");
                try { await Task.Delay(backoff, ct).ConfigureAwait(false); } catch (OperationCanceledException) { return DisconnectReason.Shutdown; }
                backoff = TimeSpan.FromMilliseconds(Math.Min(backoff.TotalMilliseconds * 2, 2000));
                continue;
            }

            if (everConnected) Interlocked.Increment(ref _reconnects);
            everConnected = true;
            lostAt = null;
            backoff = TimeSpan.FromMilliseconds(250);
            _session = session;
            _log.Info($"Registered with the Stream Deck app on port {_args.Port}.");
            try { Registered?.Invoke(); } catch (Exception ex) { _log.Error("Registered handler failed", ex); }

            var reason = await session.RunAsync(ct).ConfigureAwait(false);
            _session = null;
            session.Dispose();
            if (ct.IsCancellationRequested) reason = DisconnectReason.Shutdown;
            try { Disconnected?.Invoke(reason); } catch (Exception ex) { _log.Error("Disconnected handler failed", ex); }
            if (reason is DisconnectReason.ClosedByApp or DisconnectReason.Shutdown)
            {
                _log.Info(reason == DisconnectReason.ClosedByApp ? "The Stream Deck app closed the connection." : "Connection closed for shutdown.");
                return reason;
            }
            _log.Warn("Connection to the Stream Deck app was lost; reconnecting.");
            lostAt = DateTimeOffset.UtcNow;
        }
        return DisconnectReason.Shutdown;
    }

    /// <summary>Queues an unscheduled command (rate-limited). Returns false if dropped (not connected, over the limit, or queue full).</summary>
    public bool TrySend(string json, bool isLog = false)
    {
        var s = _session;
        if (s is null || !s.IsOpen) { Interlocked.Increment(ref _dropped); return false; }
        if (!(isLog ? _logBucket : _commandBucket).TryTake())
        {
            Interlocked.Increment(ref _dropped);
            return false;
        }
        if (s.Queue.Writer.TryWrite(json)) return true;
        Interlocked.Increment(ref _dropped);
        return false;
    }

    /// <summary>Queues a scheduled render update, waiting for queue space (back-pressure for the update pump).</summary>
    public async ValueTask<bool> SendAsync(string json, CancellationToken ct)
    {
        var s = _session;
        if (s is null || !s.IsOpen) return false;
        try
        {
            await s.Queue.Writer.WriteAsync(json, ct).ConfigureAwait(false);
            return true;
        }
        catch (ChannelClosedException) { return false; }
    }

    /// <summary>Graceful close (NormalClosure) with a short timeout.</summary>
    public async Task CloseAsync()
    {
        _shutdown.Cancel();
        var s = _session;
        if (s is not null) await s.CloseAsync().ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        await CloseAsync().ConfigureAwait(false);
        _shutdown.Dispose();
    }

    /// <summary>One connected socket and its writer.</summary>
    private sealed class Session(StreamDeckConnection owner) : IDisposable
    {
        private readonly ClientWebSocket _ws = new();
        private readonly CancellationTokenSource _cts = new();
        public Channel<string> Queue { get; } = Channel.CreateBounded<string>(new BoundedChannelOptions(owner._options.MaxQueuedFrames)
        {
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait,
        });

        public bool IsOpen => _ws.State == WebSocketState.Open && !_cts.IsCancellationRequested;

        public async Task ConnectAsync(CancellationToken ct)
        {
            _ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(owner._options.ConnectTimeout);
            await _ws.ConnectAsync(new Uri($"ws://127.0.0.1:{owner._args.Port}"), timeout.Token).ConfigureAwait(false);
            var reg = Encoding.UTF8.GetBytes(Outbound.Register(owner._args.RegisterEvent, owner._args.PluginUuid));
            await _ws.SendAsync(reg, WebSocketMessageType.Text, true, timeout.Token).ConfigureAwait(false);
        }

        public async Task<DisconnectReason> RunAsync(CancellationToken ct)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _cts.Token);
            var writer = Task.Run(() => WriteLoopAsync(linked.Token));
            DisconnectReason reason;
            try { reason = await ReadLoopAsync(linked.Token).ConfigureAwait(false); }
            finally
            {
                Queue.Writer.TryComplete();
                _cts.Cancel();
            }
            try { await writer.ConfigureAwait(false); } catch { /* writer errors already logged */ }
            return reason;
        }

        private async Task<DisconnectReason> ReadLoopAsync(CancellationToken ct)
        {
            var buffer = new byte[64 * 1024];
            var message = new MemoryStream();
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    var r = await _ws.ReceiveAsync(buffer, ct).ConfigureAwait(false);
                    if (r.MessageType == WebSocketMessageType.Close)
                    {
                        // The app closing the socket (any status) means "stop"; only drops without a close frame reconnect.
                        try { await _ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None).ConfigureAwait(false); } catch { }
                        return DisconnectReason.ClosedByApp;
                    }
                    message.Write(buffer, 0, r.Count);
                    if (message.Length > owner._options.MaxMessageBytes)
                    {
                        owner._log.Warn("Dropping an oversized message from the app.");
                        message.SetLength(0);
                        continue;
                    }
                    if (!r.EndOfMessage) continue;
                    if (r.MessageType == WebSocketMessageType.Text)
                    {
                        var receivedAt = owner._options.Time.GetTimestamp();
                        var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                        Interlocked.Increment(ref owner._framesReceived);
                        try { owner.MessageReceived?.Invoke(text, receivedAt); }
                        catch (Exception ex) { owner._log.Error("Message handler failed", ex); }
                    }
                    message.SetLength(0);
                }
                return DisconnectReason.Shutdown;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return _cts.IsCancellationRequested && !owner._shutdown.IsCancellationRequested ? DisconnectReason.Lost : DisconnectReason.Shutdown;
            }
            catch (WebSocketException ex)
            {
                owner._log.Warn($"WebSocket receive failed: {ex.Message}");
                return DisconnectReason.Lost;
            }
        }

        private async Task WriteLoopAsync(CancellationToken ct)
        {
            try
            {
                await foreach (var json in Queue.Reader.ReadAllAsync(ct).ConfigureAwait(false))
                {
                    var bytes = Encoding.UTF8.GetBytes(json);
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    timeout.CancelAfter(owner._options.SendTimeout);
                    try
                    {
                        await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, timeout.Token).ConfigureAwait(false);
                        Interlocked.Increment(ref owner._framesSent);
                        Interlocked.Add(ref owner._bytesSent, bytes.Length);
                    }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                    {
                        owner._log.Error($"A frame could not be sent within {owner._options.SendTimeout.TotalSeconds:0} s; the socket looks wedged. Aborting it.");
                        _ws.Abort();
                        _cts.Cancel();
                        return;
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException ex)
            {
                owner._log.Warn($"WebSocket send failed: {ex.Message}");
                _ws.Abort();
                _cts.Cancel();
            }
        }

        public async Task CloseAsync()
        {
            Queue.Writer.TryComplete();
            if (_ws.State == WebSocketState.Open)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                try { await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "plugin shutting down", timeout.Token).ConfigureAwait(false); }
                catch { _ws.Abort(); }
            }
            _cts.Cancel();
        }

        public void Dispose()
        {
            _cts.Cancel();
            _ws.Dispose();
            _cts.Dispose();
        }
    }
}

/// <summary>A thread-safe token bucket.</summary>
internal sealed class TokenBucket(double ratePerSecond, double capacity)
{
    private readonly object _gate = new();
    private readonly double _capacity = capacity;
    private double _tokens = capacity;
    private long _last = System.Diagnostics.Stopwatch.GetTimestamp();

    public bool TryTake()
    {
        lock (_gate)
        {
            var now = System.Diagnostics.Stopwatch.GetTimestamp();
            _tokens = Math.Min(_capacity, _tokens + System.Diagnostics.Stopwatch.GetElapsedTime(_last, now).TotalSeconds * ratePerSecond);
            _last = now;
            if (_tokens < 1) return false;
            _tokens -= 1;
            return true;
        }
    }
}
