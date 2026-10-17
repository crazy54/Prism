using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Hosting;
using PrismControl.Protocol;

namespace PrismControl.DataApi;

public sealed record DataApiOptions
{
    public double RequestsPerSecond { get; init; } = 200;
    public int MaxConnections { get; init; } = 32;
    public int MaxHeaderBytes { get; init; } = 8 * 1024;
    public TimeSpan HeaderTimeout { get; init; } = TimeSpan.FromSeconds(5);
    public TimeSpan KeepAliveTimeout { get; init; } = TimeSpan.FromSeconds(10);
    public int MaxRequestsPerConnection { get; init; } = 1000;
}

/// <summary>
/// Read-only HTTP/1.1 data API for the sibling Prism plugin (docs/api.md). Loopback only, random port, 256-bit bearer token.
/// Refuses: any Origin header (403), a Host other than 127.0.0.1:&lt;port&gt; (421), a missing/wrong token (401),
/// non-GET/HEAD methods (405) and request bodies (400). No CORS headers are ever sent.
/// Raw TcpListener rather than HttpListener: no http.sys URL ACLs, exact control over Host handling.
/// </summary>
internal sealed class DataApiServer : IAsyncDisposable
{
    private readonly IDataRegistry _registry;
    private readonly Func<JsonObject> _health;
    private readonly ILog _log;
    private readonly DataApiOptions _options;
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _slots;
    private readonly TokenBucket _rate;
    private readonly byte[] _tokenBytes;
    private Task? _accept;
    private long _requests, _rejected;

    public DataApiServer(IDataRegistry registry, Func<JsonObject> health, ILog log, DataApiOptions? options = null, string? token = null)
    {
        _registry = registry;
        _health = health;
        _log = log;
        _options = options ?? new DataApiOptions();
        _slots = new SemaphoreSlim(_options.MaxConnections, _options.MaxConnections);
        _rate = new TokenBucket(_options.RequestsPerSecond, _options.RequestsPerSecond * 2);
        Token = token ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        _tokenBytes = Encoding.ASCII.GetBytes(Token);
    }

    /// <summary>64 lowercase hex characters (256 bits). Never log it.</summary>
    public string Token { get; }
    public int Port { get; private set; }
    public long Requests => Interlocked.Read(ref _requests);
    public long Rejected => Interlocked.Read(ref _rejected);
    public string BaseUrl => $"http://127.0.0.1:{Port}";

    public void Start()
    {
        _listener.Server.ExclusiveAddressUse = true;
        _listener.Start(64);
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        _accept = Task.Run(AcceptLoopAsync);
        _log.Info($"Data API listening on 127.0.0.1:{Port}.");
    }

    private async Task AcceptLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException ex)
            {
                _log.Warn($"Data API accept failed: {ex.Message}");
                continue;
            }
            if (!await _slots.WaitAsync(0).ConfigureAwait(false))
            {
                _ = Task.Run(async () =>
                {
                    using (client)
                    {
                        try { await WriteAsync(client.GetStream(), 503, Error("busy", "Too many connections."), close: true, head: false, null, _cts.Token).ConfigureAwait(false); }
                        catch { }
                    }
                });
                continue;
            }
            _ = Task.Run(async () =>
            {
                try { await HandleConnectionAsync(client).ConfigureAwait(false); }
                catch (Exception ex) when (ex is IOException or SocketException or OperationCanceledException or ObjectDisposedException) { }
                catch (Exception ex) { _log.Error("Data API connection failed", ex); }
                finally
                {
                    client.Dispose();
                    _slots.Release();
                }
            });
        }
    }

    private async Task HandleConnectionAsync(TcpClient client)
    {
        client.NoDelay = true;
        var stream = client.GetStream();
        var buffer = new byte[_options.MaxHeaderBytes];
        var filled = 0;
        for (var served = 0; served < _options.MaxRequestsPerConnection; served++)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token);
            timeout.CancelAfter(served == 0 ? _options.HeaderTimeout : _options.KeepAliveTimeout);
            int headerEnd;
            while ((headerEnd = FindHeaderEnd(buffer, filled)) < 0)
            {
                if (filled == buffer.Length)
                {
                    await WriteAsync(stream, 431, Error("headers_too_large", "Request headers are too large."), true, false, null, _cts.Token).ConfigureAwait(false);
                    return;
                }
                int n;
                try { n = await stream.ReadAsync(buffer.AsMemory(filled), timeout.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) { return; }
                if (n == 0) return;
                filled += n;
            }
            var head = Encoding.ASCII.GetString(buffer, 0, headerEnd);
            // Keep any pipelined bytes after the header block.
            var consumed = headerEnd + 4;
            Buffer.BlockCopy(buffer, consumed, buffer, 0, filled - consumed);
            filled -= consumed;

            Interlocked.Increment(ref _requests);
            var request = HttpRequestHead.Parse(head);
            var close = request?.WantsClose ?? true;
            var response = await RespondAsync(request).ConfigureAwait(false);
            if (response.Status >= 400) Interlocked.Increment(ref _rejected);
            close |= response.Close;
            await WriteAsync(stream, response.Status, response.Body, close, request?.Method == "HEAD", response, _cts.Token).ConfigureAwait(false);
            if (close) return;
        }
    }

    private sealed record Response(int Status, byte[] Body, string ContentType = "application/json; charset=utf-8", string? Etag = null,
        bool Close = false, IReadOnlyList<(string, string)>? Headers = null);

    private async Task<Response> RespondAsync(HttpRequestHead? r)
    {
        if (r is null) return new Response(400, Error("bad_request", "Malformed request."), Close: true);
        if (r.HasBody) return new Response(400, Error("body_not_allowed", "This API is read-only; requests must not have a body."), Close: true);
        // DNS-rebinding defense: the Host header must be exactly the loopback address and our port.
        if (r.HostCount != 1 || !string.Equals(r.Host, $"127.0.0.1:{Port}", StringComparison.Ordinal))
            return new Response(421, Error("bad_host", $"Host must be 127.0.0.1:{Port}."), Close: true);
        // Browsers always send Origin on cross-site requests; no legitimate client of this API does.
        if (r.HasOrigin) return new Response(403, Error("origin_refused", "Requests with an Origin header are refused."), Close: true);
        if (r.Method is not ("GET" or "HEAD"))
            return new Response(405, Error("method_not_allowed", "Only GET and HEAD are supported."), Headers: [("Allow", "GET, HEAD")]);
        if (!TokenMatches(r.Authorization))
            return new Response(401, Error("unauthorized", "Missing or wrong bearer token (read control.json)."), Headers: [("WWW-Authenticate", "Bearer")]);
        if (!_rate.TryTake())
            return new Response(429, Error("rate_limited", "Too many requests.", new JsonObject { ["retryAfterMs"] = 100 }), Headers: [("Retry-After", "1")]);

        var path = r.Path;
        if (path == DataPaths.Index) return Json(200, IndexJson());
        if (path == DataPaths.Health) return Json(200, _health());
        if (path == DataPaths.NowPlayingArt)
        {
            var art = _registry.NowPlayingArt;
            var v = await art.ReadAsync(_cts.Token).ConfigureAwait(false);
            if (v is null) return new Response(404, Error("no_art", "Nothing is playing, or the track has no artwork."));
            if (r.IfNoneMatch is { } inm && inm == v.Etag) return new Response(304, [], v.ContentType, v.Etag);
            return new Response(200, v.Body, v.ContentType, v.Etag);
        }
        var topic = _registry.Find(path);
        if (topic is null or BinaryTopic) return new Response(404, Error("not_found", $"No endpoint {path}. See GET /v1."));
        var value = await topic.ReadAsync(_cts.Token).ConfigureAwait(false);
        if (value is null)
            return new Response(503, Error("unavailable", topic.IsClaimed ? "No data yet." : "No provider for this endpoint is running.", new JsonObject { ["retryAfterMs"] = 1000 }), Headers: [("Retry-After", "1")]);

        var etag = value.Etag;
        string? artEtag = null;
        if (path == DataPaths.NowPlaying)
        {
            artEtag = _registry.NowPlayingArt.CurrentEtag;
            etag = $"\"{value.Etag.Trim('"')}-{(artEtag ?? "\"none\"").Trim('"')}{(r.Query.TryGetValue("art", out var mode) && mode == "dataUrl" ? "-d" : "")}\"";
        }
        if (r.IfNoneMatch is { } inm2 && inm2 == etag) return new Response(304, [], Etag: etag);
        var body = Envelope(topic, value, path == DataPaths.NowPlaying ? r.Query : null);
        return new Response(200, body, Etag: etag);
    }

    private byte[] Envelope(DataTopic topic, TopicValue v, IReadOnlyDictionary<string, string>? nowPlayingQuery)
    {
        using var ms = new MemoryStream(v.Body.Length + 256);
        using (var w = new Utf8JsonWriter(ms, new JsonWriterOptions { Encoder = Relaxed.Encoder }))
        {
            w.WriteStartObject();
            w.WriteNumber("api", PluginInfo.ApiVersion);
            w.WriteString("path", topic.Path);
            w.WriteNumber("seq", v.Seq);
            w.WriteString("updatedAt", v.UpdatedAt.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture));
            w.WriteNumber("ageMs", Math.Max(0, (long)(DateTimeOffset.UtcNow - v.UpdatedAt).TotalMilliseconds));
            if (v.Source is null) w.WriteNull("source"); else w.WriteString("source", v.Source);
            w.WriteBoolean("demo", topic.IsDemo);
            w.WritePropertyName("data");
            if (nowPlayingQuery is not null) WriteNowPlaying(w, v.Body, nowPlayingQuery);
            else w.WriteRawValue(v.Body, skipInputValidation: true);
            w.WriteEndObject();
        }
        return ms.ToArray();
    }

    /// <summary>now-playing's "art" always reflects /v1/now-playing/art (so the ETag/size are consistent); ?art=dataUrl inlines it.</summary>
    private void WriteNowPlaying(Utf8JsonWriter w, byte[] body, IReadOnlyDictionary<string, string> query)
    {
        var node = JsonNode.Parse(body) as JsonObject ?? new JsonObject();
        var art = _registry.NowPlayingArt;
        if (art.CurrentEtag is { } etag && art.CurrentInfo is { } info)
        {
            var o = new JsonObject
            {
                ["url"] = DataPaths.NowPlayingArt,
                ["etag"] = etag,
                ["mime"] = info.Mime,
                ["width"] = info.Width,
                ["height"] = info.Height,
                ["dataUrl"] = query.TryGetValue("art", out var mode) && mode == "dataUrl" ? art.CurrentDataUrl() : null,
            };
            node["art"] = o;
        }
        else node["art"] = null;
        node.WriteTo(w);
    }

    private JsonObject IndexJson()
    {
        var eps = new JsonArray();
        eps.Add((JsonNode)new JsonObject { ["path"] = DataPaths.Health, ["available"] = true });
        foreach (var t in _registry.Topics)
        {
            eps.Add((JsonNode)new JsonObject
            {
                ["path"] = t.Path,
                ["available"] = t.HasData,
                ["source"] = t.Source,
                ["demo"] = t.IsDemo,
                ["cadenceMs"] = (long)t.Cadence.TotalMilliseconds,
                ["contentType"] = t is BinaryTopic ? "image/*" : "application/json",
            });
        }
        return new JsonObject { ["api"] = PluginInfo.ApiVersion, ["plugin"] = PluginInfo.Uuid, ["version"] = PluginInfo.ManifestVersion, ["endpoints"] = eps };
    }

    private bool TokenMatches(string? authorization)
    {
        if (authorization is null || !authorization.StartsWith("Bearer ", StringComparison.Ordinal)) return false;
        var given = Encoding.ASCII.GetBytes(authorization[7..].Trim());
        return given.Length == _tokenBytes.Length && CryptographicOperations.FixedTimeEquals(given, _tokenBytes);
    }

    private static readonly JsonSerializerOptions Relaxed = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private static Response Json(int status, JsonNode node) => new(status, Encoding.UTF8.GetBytes(node.ToJsonString(Relaxed)));

    private static byte[] Error(string code, string message, JsonObject? data = null)
    {
        var e = new JsonObject { ["code"] = code, ["message"] = message };
        if (data is not null) e["data"] = data;
        return Encoding.UTF8.GetBytes(new JsonObject { ["error"] = e }.ToJsonString(Relaxed));
    }

    private static async Task WriteAsync(NetworkStream s, int status, byte[] body, bool close, bool head, Response? r, CancellationToken ct)
    {
        var sb = new StringBuilder(256);
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(Reason(status)).Append("\r\n");
        if (status != 304) sb.Append("Content-Type: ").Append(r?.ContentType ?? "application/json; charset=utf-8").Append("\r\n");
        sb.Append("Content-Length: ").Append(status == 304 ? 0 : body.Length).Append("\r\n");
        sb.Append("Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n");
        if (r?.Etag is { } etag) sb.Append("ETag: ").Append(etag).Append("\r\n");
        if (r?.Headers is { } hs) foreach (var (k, v) in hs) sb.Append(k).Append(": ").Append(v).Append("\r\n");
        sb.Append("Connection: ").Append(close ? "close" : "keep-alive").Append("\r\n\r\n");
        var headBytes = Encoding.ASCII.GetBytes(sb.ToString());
        await s.WriteAsync(headBytes, ct).ConfigureAwait(false);
        if (!head && status != 304 && body.Length > 0) await s.WriteAsync(body, ct).ConfigureAwait(false);
    }

    private static string Reason(int status) => status switch
    {
        200 => "OK",
        304 => "Not Modified",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        421 => "Misdirected Request",
        429 => "Too Many Requests",
        431 => "Request Header Fields Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };

    private static int FindHeaderEnd(byte[] b, int len)
    {
        for (var i = 3; i < len; i++)
            if (b[i - 3] == '\r' && b[i - 2] == '\n' && b[i - 1] == '\r' && b[i] == '\n') return i - 3;
        return -1;
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        try { _listener.Stop(); } catch { }
        if (_accept is not null) { try { await _accept.ConfigureAwait(false); } catch { } }
        _cts.Dispose();
    }
}

/// <summary>A parsed request line + headers (no body support by design).</summary>
internal sealed record HttpRequestHead(string Method, string Path, IReadOnlyDictionary<string, string> Query, string Version,
    string? Host, int HostCount, bool HasOrigin, string? Authorization, string? IfNoneMatch, bool HasBody, bool WantsClose)
{
    public static HttpRequestHead? Parse(string head)
    {
        var lines = head.Split("\r\n");
        if (lines.Length == 0) return null;
        var parts = lines[0].Split(' ');
        if (parts.Length != 3 || !parts[2].StartsWith("HTTP/1.", StringComparison.Ordinal)) return null;
        var method = parts[0];
        var target = parts[1];
        if (!target.StartsWith('/')) return null;
        string? host = null, origin = null, auth = null, inm = null, connection = null, te = null, cl = null;
        var hostCount = 0;
        for (var i = 1; i < lines.Length; i++)
        {
            var line = lines[i];
            var colon = line.IndexOf(':');
            if (colon <= 0) return null;
            var name = line[..colon].Trim();
            var value = line[(colon + 1)..].Trim();
            switch (name.ToLowerInvariant())
            {
                case "host": host = value; hostCount++; break;
                case "origin": origin = value; break;
                case "authorization": auth = value; break;
                case "if-none-match": inm = value; break;
                case "connection": connection = value; break;
                case "transfer-encoding": te = value; break;
                case "content-length": cl = value; break;
            }
        }
        var q = target.IndexOf('?');
        var path = q >= 0 ? target[..q] : target;
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (q >= 0)
        {
            foreach (var pair in target[(q + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = pair.IndexOf('=');
                var k = Uri.UnescapeDataString(eq >= 0 ? pair[..eq] : pair);
                var v = eq >= 0 ? Uri.UnescapeDataString(pair[(eq + 1)..]) : "";
                query[k] = v;
            }
        }
        var hasBody = te is not null || (cl is not null && (!long.TryParse(cl, out var len) || len > 0));
        var http10 = parts[2] == "HTTP/1.0";
        var wantsClose = http10
            ? !string.Equals(connection, "keep-alive", StringComparison.OrdinalIgnoreCase)
            : string.Equals(connection, "close", StringComparison.OrdinalIgnoreCase);
        return new HttpRequestHead(method, path, query, parts[2], host, hostCount, origin is not null, auth, inm, hasBody, wantsClose);
    }
}

/// <summary>%APPDATA%\Prism\control\control.json: how the sibling plugin finds and authenticates to the data API.</summary>
internal static class ControlFile
{
    public static void Write(string path, int port, string token)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var o = new JsonObject
        {
            ["v"] = 1,
            ["api"] = PluginInfo.ApiVersion,
            ["plugin"] = PluginInfo.Uuid,
            ["version"] = PluginInfo.ManifestVersion,
            ["port"] = port,
            ["token"] = token,
            ["pid"] = Environment.ProcessId,
            ["baseUrl"] = $"http://127.0.0.1:{port}",
            ["startedAt"] = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture),
        };
        var tmp = path + "." + Environment.ProcessId + ".tmp";
        File.WriteAllText(tmp, o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tmp, path, overwrite: true);
    }

    /// <summary>Deletes the file only if it still describes this process (a newer instance may have replaced it).</summary>
    public static void DeleteIfOurs(string path, string token)
    {
        try
        {
            if (!File.Exists(path)) return;
            var o = JsonNode.Parse(File.ReadAllText(path)) as JsonObject;
            if (o?["token"]?.GetValue<string>() == token) File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException or InvalidOperationException) { }
    }
}
