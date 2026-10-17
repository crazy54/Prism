using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Infrastructure;

namespace PrismControl.Eq.Sonar;

/// <summary>
/// A request-specific HTTP error from Sonar on a write (400 schema mismatch, 403, 404 for a missing id). Server errors
/// (5xx) and failed reads are not this: they surface as <see cref="EqUnavailableException"/>.
/// </summary>
public sealed class SonarHttpException(HttpStatusCode status, string method, string path, string? body)
    : Exception($"Sonar {method} {path} → {(int)status} {status}{(string.IsNullOrWhiteSpace(body) ? "" : ": " + (body.Length > 200 ? body[..200] : body))}")
{
    public HttpStatusCode Status { get; } = status;
}

/// <summary>The JSON shape a GET must return; any other reply counts as a Sonar error.</summary>
public enum SonarReply { Any, Object, Array }

/// <summary>
/// The one shared connection to the local Sonar server (plain HTTP on a random loopback port, no auth). It owns
/// discovery, a 3 s timeout, re-discovery on connection failures, a retry backoff while Sonar is down
/// (1 s, 2 s, 4 s … 30 s), and the availability every Sonar-backed action shows. Thread-safe.
/// <para>
/// A Sonar that answers badly (a 5xx, a read that isn't JSON or isn't the expected shape, or no answer within the
/// timeout) is a transient <see cref="EqAvailabilityCode.ServerError"/> for every action: the address is kept (Sonar is
/// there, so no re-discovery), requests fail fast without I/O during a backoff (1 s, 2 s … 30 s; it keeps growing while
/// errors come back within <see cref="FaultMemory"/>), the first request after it is the probe, and any good reply
/// clears the error and raises <see cref="AvailabilityChanged"/>, so actions reload by themselves.
/// </para>
/// <para>Safe mode (<see cref="EqWriteGate"/>): every request except GET is suppressed here, before any I/O, and
/// returns null; the EQ backend and the mixer keep their in-memory state as if Sonar had taken the write.</para>
/// <para>Safety: this class only issues what callers ask for; the EQ and mixer code never call the endpoints research
/// eq.md §4.10 forbids (mode, redirections, audioInitialization, onboarding, DELETE, export, audioSamples, analytics).</para>
/// </summary>
public sealed class SonarClient : IDisposable
{
    /// <summary>A Sonar error this soon after the previous one keeps growing the backoff (so a flapping route settles at 30 s).</summary>
    public static readonly TimeSpan FaultMemory = TimeSpan.FromSeconds(60);

    private readonly SonarDiscovery _discovery;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly HttpClient _http;
    private readonly TimeSpan _timeout;
    private readonly EqWriteGate _writes;
    private readonly SemaphoreSlim _discoverLock = new(1, 1);
    private readonly object _gate = new();
    private FileSystemWatcher? _watcher;
    private Uri? _base;
    private EqAvailability _availability = EqAvailability.Unknown;
    private long _nextAttemptAt;
    private int _failures;
    private bool _faulted;   // a ServerError with the address kept: back off until _nextAttemptAt, then probe
    private int _faults;
    private long _lastFaultAt;

    /// <param name="timeout">The whole exchange (default 3 s). Connecting gets at most 2 s of it, so a dead port (Windows takes
    /// about 2 s to refuse a loopback connection) is told apart from a hung Sonar.</param>
    /// <param name="writes">The safe-mode gate for every non-GET request (default: safe when PRISM_CONTROL_SAFE_MODE is on).</param>
    public SonarClient(SonarDiscovery discovery, ILog log, TimeProvider time, HttpMessageHandler? sonarHandler = null, TimeSpan? timeout = null, EqWriteGate? writes = null)
    {
        _discovery = discovery;
        _log = log;
        _time = time;
        _writes = writes ?? EqWriteGate.FromEnvironment(log);
        _timeout = timeout ?? TimeSpan.FromSeconds(3);
        var connect = TimeSpan.FromTicks(Math.Min(TimeSpan.FromSeconds(2).Ticks, _timeout.Ticks / 2));
        // The deadline is ours (ExchangeAsync), not HttpClient.Timeout, so a timeout says which phase it hit.
        _http = new HttpClient(sonarHandler ?? new SocketsHttpHandler { UseProxy = false, AllowAutoRedirect = false, ConnectTimeout = connect }, disposeHandler: true)
        {
            Timeout = System.Threading.Timeout.InfiniteTimeSpan,
        };
    }

    /// <summary>Sonar accepted the connection but didn't answer within the deadline.</summary>
    private sealed class HungException(Exception inner) : Exception("Sonar didn't answer in time.", inner);

    /// <summary>
    /// One HTTP exchange under the client's deadline (real time). Throws <see cref="HungException"/> when the deadline
    /// passes (a hung Sonar); a failed connect (refused, or its own shorter timeout) surfaces as the usual connectivity
    /// exceptions; the caller's cancellation passes through.
    /// </summary>
    private async Task<(HttpStatusCode Status, string Text)> ExchangeAsync(HttpMethod method, Uri uri, string? body, CancellationToken ct)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(_timeout);
        try
        {
            using var req = new HttpRequestMessage(method, uri);
            if (body is not null) req.Content = new StringContent(body, Encoding.UTF8, "application/json");
            Interlocked.Increment(ref _requests);
            using var resp = await _http.SendAsync(req, deadline.Token).ConfigureAwait(false);
            return (resp.StatusCode, await resp.Content.ReadAsStringAsync(deadline.Token).ConfigureAwait(false));
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested && deadline.IsCancellationRequested)
        {
            throw new HungException(ex);
        }
    }

    public EqAvailability Availability { get { lock (_gate) return _availability; } }
    public Uri? BaseUri { get { lock (_gate) return _base; } }
    private int _requests;
    /// <summary>Requests sent so far (diagnostics).</summary>
    public int RequestCount => Volatile.Read(ref _requests);

    /// <summary>Safe mode: nothing but GETs reaches Sonar (<see cref="Writes"/> counts the rest).</summary>
    public bool SafeMode => _writes.SafeMode;
    /// <summary>The safe-mode gate; its counters say what would have been written.</summary>
    public EqWriteGate Writes => _writes;

    public event EventHandler<EqAvailability>? AvailabilityChanged;

    /// <summary>The delay before the next poll: normal cadence when connected, the backoff while not.</summary>
    public TimeSpan RetryDelay
    {
        get
        {
            lock (_gate)
            {
                if (_availability.Available) return TimeSpan.FromSeconds(2);
                var wait = _nextAttemptAt - _time.GetTimestamp();
                return wait <= 0 ? TimeSpan.FromSeconds(1) : _time.GetElapsedTime(0, wait);
            }
        }
    }

    /// <summary>Re-discovers when GG rewrites its discovery file (ports change on every GG/Sonar start).</summary>
    public void WatchDiscoveryFile()
    {
        if (_watcher is not null) return;
        var path = _discovery.CorePropsPaths.FirstOrDefault();
        var dir = path is null ? null : Path.GetDirectoryName(path);
        if (dir is null || !Directory.Exists(dir)) return;
        try
        {
            _watcher = new FileSystemWatcher(dir, Path.GetFileName(path!)) { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime };
            FileSystemEventHandler onChange = (_, _) => Invalidate("the GG discovery file changed");
            _watcher.Changed += onChange;
            _watcher.Created += onChange;
            _watcher.Renamed += (_, _) => Invalidate("the GG discovery file changed");
            _watcher.EnableRaisingEvents = true;
        }
        catch (Exception ex) when (ex is IOException or ArgumentException or UnauthorizedAccessException)
        {
            _log.Debug($"Sonar: cannot watch {dir}: {ex.Message}");
        }
    }

    /// <summary>Forgets the current address; the next call re-discovers right away.</summary>
    public void Invalidate(string why)
    {
        lock (_gate)
        {
            if (_base is null && _nextAttemptAt == 0) return;
            _base = null;
            _nextAttemptAt = 0;
            _faulted = false;
        }
        _log.Debug($"Sonar: re-discovering ({why}).");
    }

    /// <summary>Connects if needed (respecting the backoff) and returns the availability.</summary>
    public async Task<EqAvailability> EnsureAsync(CancellationToken ct, bool force = false)
    {
        lock (_gate)
        {
            if (_base is not null) return _availability;
            if (!force && _nextAttemptAt != 0 && _time.GetTimestamp() < _nextAttemptAt) return _availability;
        }
        await _discoverLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            lock (_gate) if (_base is not null) return _availability;
            var r = await _discovery.DiscoverAsync(ct).ConfigureAwait(false);
            if (r.BaseUri is { } uri)
            {
                // A cheap liveness check, so a stale port from GG surfaces now rather than on the first edit.
                try
                {
                    var (status, _) = await ExchangeAsync(HttpMethod.Get, new Uri(uri, "v1/status"), null, ct).ConfigureAwait(false);
                    var code = (int)status;
                    if (code >= 500)
                        r = SonarDiscoveryResult.Fail(EqAvailabilityCode.ServerError, ErrorReason($"Sonar answered with an error (HTTP {code})."), $"HTTP {code} · retrying");
                    else if (code is < 200 or > 299 && status != HttpStatusCode.NotFound)
                        r = SonarDiscoveryResult.Fail(EqAvailabilityCode.Starting, "Sonar is starting…", $"GET /v1/status → {code}");
                }
                catch (Exception ex) when (ex is HungException || IsConnectivity(ex, ct))
                {
                    r = SonarDiscoveryResult.Fail(EqAvailabilityCode.Unreachable, "Sonar isn't answering.", ex.Message);
                }
            }
            SetResult(r);
            return r.Availability;
        }
        finally { _discoverLock.Release(); }
    }

    private void SetResult(SonarDiscoveryResult r)
    {
        bool changed;
        lock (_gate)
        {
            changed = _availability.Code != r.Availability.Code || _availability.Reason != r.Availability.Reason;
            _availability = r.Availability;
            _faulted = false;
            if (r.BaseUri is { } uri && r.Availability.Available)
            {
                _base = uri;
                _failures = 0;
                _nextAttemptAt = 0;
            }
            else
            {
                _base = null;
                _failures++;
                var backoff = TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(5, _failures - 1))));
                _nextAttemptAt = _time.GetTimestamp() + (long)(backoff.TotalSeconds * _time.TimestampFrequency);
            }
        }
        if (changed)
        {
            if (r.Availability.Available) _log.Info("Sonar connected.");
            else _log.Info($"Sonar unavailable: {r.Availability.Reason} {r.Availability.Detail}");
            AvailabilityChanged?.Invoke(this, r.Availability);
        }
    }

    private void MarkUnreachable(Exception ex)
    {
        SetResult(SonarDiscoveryResult.Fail(EqAvailabilityCode.Unreachable, "Sonar isn't answering.", ex.Message));
    }

    private static string ErrorReason(string what) => what + " Prism Control retries by itself.";

    /// <summary>Sonar answered badly: a transient error for every action, with a growing backoff (no re-discovery: the address is right).</summary>
    private EqUnavailableException Fault(string reason, string detail, string request)
    {
        var a = new EqAvailability(EqAvailabilityCode.ServerError, ErrorReason(reason), detail);
        bool changed;
        TimeSpan backoff;
        lock (_gate)
        {
            var now = _time.GetTimestamp();
            if (_lastFaultAt == 0 || _time.GetElapsedTime(_lastFaultAt) > FaultMemory) _faults = 0;
            _faults++;
            _lastFaultAt = now;
            backoff = TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(5, _faults - 1))));
            _nextAttemptAt = now + (long)(backoff.TotalSeconds * _time.TimestampFrequency);
            _faulted = _base is not null; // if the address was dropped meanwhile, discovery (and its backoff) takes over
            changed = _availability.Code != a.Code || _availability.Reason != a.Reason;
            _availability = a;
        }
        var line = $"Sonar error: {request}: {reason} Backing off {backoff.TotalSeconds.ToString("0", CultureInfo.InvariantCulture)} s.";
        if (changed)
        {
            _log.Warn(line);
            AvailabilityChanged?.Invoke(this, a);
        }
        else _log.Debug(line);
        return new EqUnavailableException(a);
    }

    /// <summary>A good reply: clears a Sonar error (actions reload on the event).</summary>
    private void MarkHealthy()
    {
        lock (_gate)
        {
            if (!_faulted) return;
            _faulted = false;
            _nextAttemptAt = 0;
            _availability = EqAvailability.Ok;
        }
        _log.Info("Sonar is answering again.");
        AvailabilityChanged?.Invoke(this, EqAvailability.Ok);
    }

    /// <summary>GET; <paramref name="expect"/> is the JSON shape the caller needs (anything else is a Sonar error).</summary>
    public Task<JsonNode?> GetAsync(string path, CancellationToken ct, SonarReply expect = SonarReply.Any) => SendAsync(HttpMethod.Get, path, null, ct, expect);

    /// <summary>PUT with an optional JSON body (most Sonar writes carry the value in the path and have no body). Null in safe mode.</summary>
    public Task<JsonNode?> PutAsync(string path, string? jsonBody, CancellationToken ct) => SendAsync(HttpMethod.Put, path, jsonBody, ct);

    private SonarStatus? _status;
    private long _statusAt;

    /// <summary>The last status (no I/O).</summary>
    public SonarStatus? LastStatus { get { lock (_gate) return _status; } }

    /// <summary>
    /// <c>GET /v1/status</c> (about 2 KB): mode, and per channel the selected config and whether it is enabled.
    /// Shared by the EQ backend and the mixer, so it is fetched once per <paramref name="maxAge"/> whoever asks.
    /// </summary>
    public async Task<SonarStatus> GetStatusAsync(TimeSpan maxAge, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_status is not null && _base is not null && _time.GetElapsedTime(_statusAt) < maxAge) return _status;
        }
        var node = await GetAsync("/v1/status", ct, SonarReply.Object).ConfigureAwait(false);
        var status = SonarStatus.Parse(node);
        lock (_gate)
        {
            _status = status;
            _statusAt = _time.GetTimestamp();
        }
        return status;
    }

    /// <summary>
    /// Sends one request. In safe mode anything but GET returns null without I/O. Connectivity failures re-discover once
    /// (the port may have moved) and then throw <see cref="EqUnavailableException"/>; so do server errors (5xx, a read
    /// that isn't JSON or isn't <paramref name="expect"/>, a timeout: <see cref="EqAvailabilityCode.ServerError"/>, with a
    /// backoff) and refused reads (4xx). A refused write (4xx) throws <see cref="SonarHttpException"/>.
    /// </summary>
    public async Task<JsonNode?> SendAsync(HttpMethod method, string path, string? body, CancellationToken ct, SonarReply expect = SonarReply.Any)
    {
        var read = method == HttpMethod.Get;
        var request = method.Method + " " + path;
        if (!read && !_writes.Allow(request)) return null; // safe mode: no write leaves the process
        for (var attempt = 0; ; attempt++)
        {
            await EnsureAsync(ct, force: attempt > 0).ConfigureAwait(false);
            EqAvailability av;
            Uri? baseUri;
            lock (_gate)
            {
                av = _availability;
                baseUri = _base;
                // While Sonar is failing, requests wait out the backoff without I/O; the first one after it is the probe.
                if (_faulted ? _time.GetTimestamp() < _nextAttemptAt : !av.Available) baseUri = null;
            }
            if (baseUri is null) throw new EqUnavailableException(av);
            HttpStatusCode status;
            string text;
            try { (status, text) = await ExchangeAsync(method, new Uri(baseUri, path.TrimStart('/')), body, ct).ConfigureAwait(false); }
            catch (HungException)
            {
                // It accepted the connection and then hung: back off on the same address rather than re-discovering it.
                throw Fault("Sonar didn't answer in time.", "No answer in time · retrying", request);
            }
            catch (Exception ex) when (IsConnectivity(ex, ct))
            {
                // Refused, reset, or the connect itself timed out: the port may have moved.
                if (attempt == 0) { Invalidate(ex.Message); continue; }
                MarkUnreachable(ex);
                throw new EqUnavailableException(Availability);
            }
            var code = (int)status;
            if (code is < 200 or > 299)
            {
                // A 404 on the cheap status route means this port is no longer Sonar: re-discover.
                if (status == HttpStatusCode.NotFound && path.StartsWith("/v1/status", StringComparison.Ordinal) && attempt == 0)
                {
                    Invalidate("404 on /v1/status");
                    continue;
                }
                if (code >= 500) throw Fault($"Sonar answered with an error (HTTP {code}).", $"HTTP {code} · retrying", request);
                if (read) throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Error, $"Sonar refused a read (HTTP {code}).", $"GET {path} → {code}"));
                throw new SonarHttpException(status, method.Method, path, text);
            }
            JsonNode? node = null;
            if (!string.IsNullOrWhiteSpace(text))
            {
                try { node = JsonNode.Parse(text); }
                catch (JsonException) when (read) { throw Fault("Sonar sent a reply that isn't JSON.", "Reply wasn't JSON · retrying", request); }
                catch (JsonException) { /* a write Sonar accepted (2xx) with an odd body: the status is what counts */ }
            }
            if (read && !Matches(node, expect))
                throw Fault("Sonar sent an unexpected reply.", "Unexpected reply · retrying", $"{request} ({node?.GetValueKind().ToString() ?? "empty"})");
            MarkHealthy();
            return node;
        }
    }

    private static bool Matches(JsonNode? node, SonarReply expect) => expect switch
    {
        SonarReply.Object => node is JsonObject,
        SonarReply.Array => node is JsonArray,
        _ => true,
    };

    /// <summary>The connection failed: refused, reset, or the handler's connect timeout (a cancellation the caller didn't ask for).</summary>
    private static bool IsConnectivity(Exception ex, CancellationToken ct) =>
        ex is HttpRequestException or IOException or SocketException or TimeoutException || (ex is OperationCanceledException && !ct.IsCancellationRequested);

    /// <summary>Invariant number formatting for path values ("0,5" does not bind in Sonar).</summary>
    public static string Num(double v) => Math.Round(v, 4).ToString("0.####", CultureInfo.InvariantCulture);

    public void Dispose()
    {
        _watcher?.Dispose();
        _http.Dispose();
        _discovery.Dispose();
        _discoverLock.Dispose();
    }
}

/// <summary>One channel in <c>GET /v1/status</c>.</summary>
public sealed record SonarChannelStatus(string Vad, bool IsEnabled, string? ConfigId, string? ConfigName, string? EndpointId);

/// <summary>The parsed <c>GET /v1/status</c>.</summary>
public sealed record SonarStatus(string Mode, bool IsEnabled, IReadOnlyDictionary<string, SonarChannelStatus> Channels)
{
    public bool IsStreamer => Mode.Equals("stream", StringComparison.OrdinalIgnoreCase);

    public static SonarStatus Parse(JsonNode? node)
    {
        var mode = SonarConfig.Str(node?["mode"]) ?? "classic";
        var channels = new Dictionary<string, SonarChannelStatus>();
        if (node?["devices"] is JsonArray devices)
        {
            foreach (var d in devices.OfType<JsonObject>())
            {
                var vad = SonarConfig.Str(d["virtualAudioDevice"]);
                if (!SonarChannels.IsKnown(vad)) continue;
                var flow = SonarConfig.Str(d["dataFlow"]);
                // The mic appears twice (its render-side monitor and the capture endpoint): prefer the capture entry.
                var preferred = vad == SonarChannels.Mic ? flow == "capture" : flow != "capture";
                if (channels.ContainsKey(vad!) && !preferred) continue;
                channels[vad!] = new SonarChannelStatus(vad!, SonarConfig.Bool(d["isChannelEnabled"]) ?? true,
                    SonarConfig.Str(d["config"]?["id"]), SonarConfig.Str(d["config"]?["name"]), SonarConfig.Str(d["id"]));
            }
        }
        return new SonarStatus(mode, SonarConfig.Bool(node?["isEnabled"]) ?? true, channels);
    }
}
