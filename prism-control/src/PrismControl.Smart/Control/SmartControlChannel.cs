using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Smart.Control;

/// <summary>Global settings section <c>"smartai"</c>: the user's "Allow AI preferences" switch (off by default).</summary>
public sealed class SmartAiSettings
{
    public const string Section = "smartai";

    /// <summary>On = the "smart" pipe listens and an assistant may ask to pair. Only the PI sets it; no pipe operation can.</summary>
    public bool AllowAi { get; set; }
}

/// <summary>
/// The token-protected named-pipe endpoint "smart" (Desktop's <see cref="PipeEndpoint"/>: per-user DACL, NETWORK denied,
/// remote clients rejected, a fresh 128-bit pipe name and 256-bit token per start, the token checked in constant time in
/// the first frame; discovery file <c>%APPDATA%\Prism\control\modules\smart\ingress.json</c>, user-only ACL). It exists
/// only while "Allow AI preferences" is on: switching it off closes the pipe, deletes the discovery file and revokes the
/// pairing.
/// <para>
/// Wire format: u32 little-endian length + UTF-8 JSON. Hello <c>{ "v": 1, "token": "…", "client": "name" }</c>, then
/// requests <c>{ "id": n, "op": "status", "args": { … } }</c> answered by <c>{ "id": n, "ok": true, "result": … }</c> or
/// <c>{ "id": n, "ok": false, "error": { "code", "message", "data" } }</c>. 20 requests/s for the whole channel (burst 40), at most
/// 4 sessions, 256 KB frames.
/// </para>
/// </summary>
public sealed class SmartControlChannel : IAsyncDisposable
{
    public const string EndpointName = "smart";
    public const int MaxFrameBytes = 256 * 1024;
    public const double RequestsPerSecond = 20;
    public const int RequestBurst = 40;

    private readonly SmartOps _ops;
    private readonly PairingService _pairing;
    private readonly ChangeLog _log;
    private readonly ILog _logger;
    private readonly TimeProvider _time;
    private readonly string? _discoveryFile;
    private readonly SemaphoreSlim _lifecycle = new(1, 1);
    private PipeEndpoint? _endpoint;
    private CancellationTokenSource? _stop;
    private bool _disposed;
    /// <summary>One rate limit for the whole channel, not per connection: the MCP server reconnects for every call (review B LOW).</summary>
    private readonly TokenBucket _bucket;

    public SmartControlChannel(SmartOps ops, PairingService pairing, ChangeLog log, TimeProvider time, string? discoveryFile, ILog? logger = null)
    {
        _ops = ops;
        _pairing = pairing;
        _log = log;
        _time = time;
        _discoveryFile = discoveryFile;
        _logger = (logger ?? NullLog.Instance).For("smart-ai");
        _bucket = new TokenBucket(RequestsPerSecond, RequestBurst, time);
    }

    public bool Running => _endpoint is not null;

    /// <summary>The pipe name (no \\.\pipe\ prefix) while running; tests connect with it.</summary>
    public string? PipeName => _endpoint?.PipeName;


    public int ActiveSessions => _endpoint?.ActiveSessions ?? 0;
    public int RejectedClients => _endpoint?.RejectedClients ?? 0;

    /// <summary>Starts (on) or stops (off) the endpoint. Idempotent. Off also revokes the pairing.</summary>
    public async Task SetEnabledAsync(bool on, CancellationToken ct = default)
    {
        await _lifecycle.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            if (on && _endpoint is null)
            {
                var ep = new PipeEndpoint(new PipeEndpointOptions
                {
                    Name = EndpointName,
                    MaxInstances = 4,
                    MaxFrameBytes = MaxFrameBytes,
                    ReadTimeout = TimeSpan.FromSeconds(2),
                    DiscoveryFile = _discoveryFile,
                }, _logger);
                _stop = new CancellationTokenSource();
                ep.SessionOpened += session => ServeAsync(session, _stop.Token);
                await ep.StartAsync(ct).ConfigureAwait(false);
                _endpoint = ep;
                _log.Record("channel", null, new JsonObject { ["state"] = "started" });
                _logger.Info("AI preferences: the smart pipe is listening (an assistant still needs the user's approval on the deck).");
            }
            else if (!on && _endpoint is not null)
            {
                await StopCoreAsync("AI preferences switched off").ConfigureAwait(false);
            }
            if (!on) _pairing.Revoke("AI preferences switched off");
        }
        finally { _lifecycle.Release(); }
    }

    private async Task StopCoreAsync(string reason)
    {
        var ep = _endpoint;
        _endpoint = null;
        _stop?.Cancel();
        if (ep is not null) await ep.DisposeAsync().ConfigureAwait(false);
        _log.Record("channel", null, new JsonObject { ["state"] = "stopped", ["reason"] = reason });
    }

    private async Task ServeAsync(PipeSession session, CancellationToken stop)
    {
        var client = PairingService.SanitizeClient(session.Hello["client"] is JsonValue cv && cv.TryGetValue<string>(out var cs) ? cs : null);
        if (session.Hello["v"] is not JsonValue vv || !vv.TryGetValue<int>(out var v) || v != SmartOps.Api)
        {
            await TryWrite(session, Error(null, "bad_version", $"This is API v{SmartOps.Api}; send {{ \"v\": {SmartOps.Api}, \"token\", \"client\" }} first."), stop).ConfigureAwait(false);
            return;
        }
        var bucket = _bucket;
        while (!stop.IsCancellationRequested)
        {
            JsonNode? frame;
            try { frame = await session.ReadAsync(stop).ConfigureAwait(false); }
            catch (PipeFrameException) { return; }
            catch (OperationCanceledException) { return; }
            if (frame is null) return;
            JsonNode response;
            if (frame is not JsonObject req || req["op"] is not JsonValue opv || !opv.TryGetValue<string>(out var op))
                response = Error(IdOf(frame), "bad_request", "Each request is { \"id\": n, \"op\": \"…\", \"args\": { … } }.");
            else if (!bucket.TryTake())
                response = Error(IdOf(req), "rate_limited", "Too many requests; slow down.", new JsonObject { ["retryAfterMs"] = bucket.WaitMs() });
            else
            {
                try { response = new JsonObject { ["id"] = IdOf(req), ["ok"] = true, ["result"] = _ops.Handle(op, req["args"] as JsonObject, client) }; }
                catch (OpException ex) { response = Error(IdOf(req), ex.Code, ex.Message, ex.Detail); }
                catch (Exception ex)
                {
                    _logger.Warn($"smart op {op} failed: {ex.GetType().Name}", ex);
                    response = Error(IdOf(req), "internal", "Internal error.");
                }
            }
            if (!await TryWrite(session, response, stop).ConfigureAwait(false)) return;
        }
    }

    private static JsonNode? IdOf(JsonNode? frame) => frame is JsonObject o && o["id"] is JsonValue id ? id.DeepClone() : null;

    private static JsonObject Error(JsonNode? id, string code, string message, JsonObject? data = null)
    {
        var e = new JsonObject { ["code"] = code, ["message"] = message };
        if (data is not null) e["data"] = data.DeepClone();
        return new JsonObject { ["id"] = id?.DeepClone(), ["ok"] = false, ["error"] = e };
    }

    private async Task<bool> TryWrite(PipeSession session, JsonNode frame, CancellationToken ct)
    {
        try
        {
            await session.WriteAsync(frame, ct).ConfigureAwait(false);
            return true;
        }
        catch (PipeFrameException)
        {
            try { await session.WriteAsync(Error(IdOf(frame), "too_large", "The answer is too large; narrow the request (a pack, a context)."), ct).ConfigureAwait(false); return true; }
            catch (Exception) { return false; }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException) { return false; }
    }

    public async ValueTask DisposeAsync()
    {
        await _lifecycle.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            _disposed = true;
            if (_endpoint is not null) await StopCoreAsync("shutting down").ConfigureAwait(false);
        }
        finally { _lifecycle.Release(); }
    }

    /// <summary>A small token bucket on the channel's clock (shared by every session: thread-safe).</summary>
    private sealed class TokenBucket(double rate, int burst, TimeProvider time)
    {
        private readonly object _gate = new();
        private double _tokens = burst;
        private long _at = time.GetTimestamp();

        private void Refill()
        {
            var now = time.GetTimestamp();
            _tokens = Math.Min(burst, _tokens + time.GetElapsedTime(_at, now).TotalSeconds * rate);
            _at = now;
        }

        public bool TryTake()
        {
            lock (_gate)
            {
                Refill();
                if (_tokens < 1) return false;
                _tokens -= 1;
                return true;
            }
        }

        public int WaitMs()
        {
            lock (_gate)
            {
                Refill();
                return _tokens >= 1 ? 0 : (int)Math.Ceiling((1 - _tokens) / rate * 1000);
            }
        }
    }
}
