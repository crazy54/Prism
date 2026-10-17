using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Sight;

namespace PrismControl.Sight.GameLink;

/// <summary>
/// Where Prism Deck's Game Link listener is, the companion token, and the listener's process id (all from
/// gamelink.json; <see cref="Pid"/> is null while the listener is not running).
/// </summary>
public sealed record GameLinkEndpoint(int Port, string Token, int? Pid = null)
{
    /// <summary>Always loopback: the host is never taken from a file.</summary>
    public Uri CompanionUri => new($"http://127.0.0.1:{Port}/v1/companion");
    public override string ToString() => $"127.0.0.1:{Port} (token …{Token[^4..]})";
}

/// <summary>Reads <c>%APPDATA%\Prism\deck\gamelink.json</c> as strictly as Prism Deck's own parseGameLinkFile.</summary>
public static partial class GameLinkFile
{
    public const string Plugin = "com.jeremyfhall.prism";

    [GeneratedRegex("^[0-9a-f]{64}$")] private static partial Regex Hex64();

    /// <summary>PRISM_DECK_GAMELINK_DIR, else %APPDATA%\Prism\deck.</summary>
    public static string DefaultPath
    {
        get
        {
            var dir = Environment.GetEnvironmentVariable("PRISM_DECK_GAMELINK_DIR");
            if (string.IsNullOrWhiteSpace(dir)) dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Prism", "deck");
            return Path.Combine(dir, "gamelink.json");
        }
    }

    public static GameLinkEndpoint? TryRead(string path)
    {
        try { return File.Exists(path) ? Parse(File.ReadAllText(path)) : null; }
        catch (Exception) { return null; }
    }

    public static GameLinkEndpoint? Parse(string json)
    {
        try
        {
            var j = JsonNode.Parse(json) as JsonObject;
            if (j is null || j["v"]?.GetValueKind() != JsonValueKind.Number || j["v"]!.GetValue<double>() != 1) return null;
            if (j["plugin"]?.GetValueKind() != JsonValueKind.String || j["plugin"]!.GetValue<string>() != Plugin) return null;
            if (j["tokens"] is not JsonObject tokens) return null;
            var companion = tokens["companion"]?.GetValueKind() == JsonValueKind.String ? tokens["companion"]!.GetValue<string>() : null;
            var cs2 = tokens["cs2"]?.GetValueKind() == JsonValueKind.String ? tokens["cs2"]!.GetValue<string>() : null;
            if (companion is null || cs2 is null || !Hex64().IsMatch(companion) || !Hex64().IsMatch(cs2)) return null;
            if (j["port"]?.GetValueKind() != JsonValueKind.Number) return null;
            var p = j["port"]!.GetValue<double>();
            if (p != Math.Floor(p) || p < 1024 || p > 65535) return null;
            int? pid = j["pid"]?.GetValueKind() == JsonValueKind.Number && j["pid"]!.GetValue<double>() is var d && d == Math.Floor(d) && d > 0 && d <= int.MaxValue ? (int)d : null;
            return new GameLinkEndpoint((int)p, companion, pid);
        }
        catch (Exception) { return null; }
    }
}

public sealed class GameLinkForwarderOptions
{
    public string FilePath { get; init; } = GameLinkFile.DefaultPath;
    /// <summary>Tests inject a handler; production uses a loopback SocketsHttpHandler without proxy.</summary>
    public HttpMessageHandler? Handler { get; init; }
    public TimeProvider Time { get; init; } = TimeProvider.System;
    public ILog Log { get; init; } = NullLog.Instance;
    /// <summary>Snapshots are coalesced to at most one per this interval (default 250 ms = 4/s). Events go at once.</summary>
    public TimeSpan MinSnapshotInterval { get; init; } = TimeSpan.FromMilliseconds(250);
    /// <summary>An unchanged state is re-posted this often so the deck never shows "waiting" (its stale limit is 15 s).</summary>
    public TimeSpan Heartbeat { get; init; } = TimeSpan.FromSeconds(5);
    /// <summary>Safe mode: build the posts, never send them (a POST changes another app's state).</summary>
    public bool SafeMode { get; init; }
    /// <summary>The PIDs listening on 127.0.0.1:port (tests fake it; production reads the OS TCP table).</summary>
    public Func<int, IReadOnlyCollection<int>>? ListenerPids { get; init; }
}

/// <summary>
/// Forwards Sight's state to Prism Deck's Game Link listener as a companion: <c>POST http://127.0.0.1:&lt;port&gt;/v1/companion</c>
/// with <c>Authorization: Bearer &lt;tokens.companion&gt;</c> (port and token from gamelink.json). Snapshots at most 4/s and only
/// when something changed (plus a 5 s heartbeat); events (context changes, pause, REC) at once. Loopback only, by
/// construction; nothing else in Sight opens a socket. The token is never logged, and it is sent only when the port is
/// held by the process gamelink.json names (Prism Deck's pid): never to another program that took the port.
/// </summary>
public sealed class GameLinkForwarder : IAsyncDisposable
{
    private readonly GameLinkForwarderOptions _o;
    private readonly HttpClient _http;
    private readonly Channel<int> _wake = Channel.CreateBounded<int>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly object _gate = new();
    private readonly List<SightEvent> _events = [];
    private readonly CancellationTokenSource _stop = new();
    private readonly string _session = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
    private SightSnapshot? _latest;
    private string? _lastStateJson;
    private string? _lastGame;
    private DateTimeOffset _lastSnapshotPost = DateTimeOffset.MinValue;
    private DateTimeOffset _lastPost = DateTimeOffset.MinValue;
    private DateTimeOffset _nextAttempt = DateTimeOffset.MinValue;
    private GameLinkEndpoint? _endpoint;
    private long _seq;
    private Task? _loop;
    private bool _safeLogged, _foreignLogged;

    public GameLinkForwarder(GameLinkForwarderOptions? options = null)
    {
        _o = options ?? new GameLinkForwarderOptions();
        _http = new HttpClient(_o.Handler ?? new SocketsHttpHandler
        {
            UseProxy = false,
            ConnectTimeout = TimeSpan.FromSeconds(1),
            PooledConnectionIdleTimeout = TimeSpan.FromSeconds(20),
            AllowAutoRedirect = false,
        }, disposeHandler: true) { Timeout = TimeSpan.FromSeconds(2) };
    }

    public long Posted { get; private set; }
    public long Failed { get; private set; }
    public HttpStatusCode? LastStatus { get; private set; }
    public string? LastError { get; private set; }
    /// <summary>The bodies handed to the network (safe mode: the bodies that would have been). For tests and diagnostics.</summary>
    public IReadOnlyList<string> RecentBodies { get { lock (_gate) return [.. _recent]; } }
    private readonly Queue<string> _recent = new();

    public void Start(ISightService sight) => Start(sight.Subscribe(OnSnapshot, OnEvent));

    private IDisposable? _subscription;

    private void Start(IDisposable subscription)
    {
        _subscription = subscription;
        _loop ??= Task.Run(() => LoopAsync(_stop.Token));
    }

    /// <summary>Starts the loop without a service (tests feed <see cref="OnSnapshot"/> / <see cref="OnEvent"/> directly).</summary>
    public void Start() => _loop ??= Task.Run(() => LoopAsync(_stop.Token));

    public void OnSnapshot(SightSnapshot s)
    {
        lock (_gate) _latest = s;
        _wake.Writer.TryWrite(0);
    }

    public void OnEvent(SightEvent e)
    {
        lock (_gate) { if (_events.Count < 32) _events.Add(e); }
        _wake.Writer.TryWrite(1);
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var tick = new CancellationTokenSource(TimeSpan.FromMilliseconds(250));
                using var both = CancellationTokenSource.CreateLinkedTokenSource(ct, tick.Token);
                try { await _wake.Reader.ReadAsync(both.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { /* periodic */ }
                await PumpAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex) { _o.Log.Warn("sight: game link loop: " + ex.GetType().Name); }
        }
    }

    /// <summary>One pass: post pending events at once, a changed snapshot when the interval allows, or a heartbeat.</summary>
    internal async Task PumpAsync(CancellationToken ct)
    {
        var now = _o.Time.GetUtcNow();
        SightSnapshot? snap;
        List<SightEvent> events;
        lock (_gate)
        {
            snap = _latest;
            events = [.. _events];
        }
        if (snap is null || snap.GameId is null || snap.State is not (SightRunState.Running or SightRunState.Paused))
        {
            lock (_gate) _events.Clear();   // nothing to attach them to
            return;
        }
        var state = BuildState(snap);
        var stateJson = state.ToJsonString();
        var changed = stateJson != _lastStateJson || snap.GameId != _lastGame;
        var due = events.Count > 0
                  || (changed && now - _lastSnapshotPost >= _o.MinSnapshotInterval)
                  || now - _lastPost >= _o.Heartbeat;
        if (!due || now < _nextAttempt) return;
        // The first post of a game (or after a failure) must carry the state; later ones only when it changed.
        var includeState = changed || _lastStateJson is null || events.Count == 0;
        var body = new JsonObject
        {
            ["v"] = 1, ["source"] = "prism-sight", ["game"] = snap.GameId, ["session"] = _session, ["seq"] = Interlocked.Increment(ref _seq),
            ["sentAt"] = now.ToUnixTimeMilliseconds(),
        };
        if (includeState) body["state"] = state;
        if (events.Count > 0) body["events"] = new JsonArray(events.Select(EventJson).ToArray<JsonNode?>());
        var ok = await PostAsync(body.ToJsonString(), ct).ConfigureAwait(false);
        if (ok)
        {
            lock (_gate) _events.RemoveRange(0, Math.Min(events.Count, _events.Count));
            if (includeState) { _lastStateJson = stateJson; _lastSnapshotPost = now; }
            _lastGame = snap.GameId;
            _lastPost = now;
        }
        else
        {
            // Listener down or not enabled: back off, re-read gamelink.json next time, resend the full state.
            _lastStateJson = null;
            _nextAttempt = now + TimeSpan.FromSeconds(2);
            lock (_gate) { if (_events.Count > 16) _events.RemoveRange(0, _events.Count - 16); }
        }
    }

    private async Task<bool> PostAsync(string body, CancellationToken ct)
    {
        lock (_gate)
        {
            _recent.Enqueue(body);
            while (_recent.Count > 64) _recent.Dequeue();
        }
        if (_o.SafeMode)
        {
            if (!_safeLogged) { _o.Log.Info("sight: [safe mode] Game Link posts are built, not sent"); _safeLogged = true; }
            Posted++;
            return true;
        }
        var ep = _endpoint ??= GameLinkFile.TryRead(_o.FilePath);
        if (ep is null) { LastError = "gamelink.json missing or invalid"; return false; }
        if (ep.Pid is not { } deckPid)
        {
            LastError = "Prism Deck's Game Link listener is not running (no pid in gamelink.json)";
            _endpoint = null;
            return false;
        }
        IReadOnlyCollection<int> owners;
        try { owners = (_o.ListenerPids ?? LoopbackListeners.OwnersOf)(ep.Port); }
        catch (Exception) { owners = []; }
        if (owners.Count == 0 || owners.Any(o => o != deckPid))
        {
            // Whoever holds the port is not the Prism Deck that wrote gamelink.json: the bearer token stays here.
            LastError = owners.Count == 0 ? "nothing listens on the Game Link port" : "the Game Link port is held by another process: not sent";
            if (owners.Count > 0 && !_foreignLogged) { _o.Log.Warn("sight: the Game Link port is held by a process other than Prism Deck; the token is not sent"); _foreignLogged = true; }
            Failed++;
            _endpoint = null;
            return false;
        }
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, ep.CompanionUri) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ep.Token);
            using var res = await _http.SendAsync(req, ct).ConfigureAwait(false);
            LastStatus = res.StatusCode;
            if (res.IsSuccessStatusCode) { Posted++; LastError = null; return true; }
            Failed++;
            LastError = $"HTTP {(int)res.StatusCode}";
            // 401: the token rotated; any other failure: the port may have moved. Re-read next time.
            _endpoint = null;
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            Failed++;
            LastError = ex.GetType().Name;
            _endpoint = null;
            return false;
        }
    }

    /// <summary>The companion v1 state: neutral fields null (Sight reads no vitals), everything in detail.</summary>
    internal static JsonObject BuildState(SightSnapshot s)
    {
        var readouts = new JsonObject();
        foreach (var (id, r) in s.Readouts.OrderBy(kv => kv.Key, StringComparer.Ordinal).Take(48))
        {
            var o = new JsonObject { ["c"] = Conf(r.Confidence) };
            if (r.Confidence != SightConfidence.Unknown)
            {
                if (r.Number is { } n) o["v"] = Math.Round(n, 4);
                else if (r.Flag is { } f) o["v"] = f;
                else if (r.Text is { } t) o["v"] = t.Length > 64 ? t[..64] : t;
                else o["v"] = null;
            }
            else o["v"] = null;
            if (r.Unit is { } u) o["u"] = u.Length > 16 ? u[..16] : u;
            readouts[id] = o;
        }
        var detail = new JsonObject
        {
            ["recipe"] = s.RecipeId,
            ["context"] = s.Context.Id,
            ["contextConf"] = Conf(s.Context.Confidence),
            ["rec"] = s.Recording,
            ["paused"] = s.State == SightRunState.Paused,
            ["readouts"] = readouts,
        };
        return new JsonObject
        {
            ["status"] = s.State == SightRunState.Paused ? "paused" : "live",
            ["player"] = null, ["weapon"] = null, ["stats"] = null, ["round"] = null, ["match"] = null,
            ["detail"] = detail,
        };
    }

    private static string Conf(SightConfidence c) => c switch
    {
        SightConfidence.Observed => "observed", SightConfidence.Inferred => "inferred", SightConfidence.Stale => "stale", _ => "unknown",
    };

    private static JsonObject EventJson(SightEvent e)
    {
        var o = new JsonObject { ["type"] = e.Type, ["at"] = e.At.ToUnixTimeMilliseconds() };
        foreach (var (k, v) in e.Fields.Take(8))
        {
            if (!Regex.IsMatch(k, "^[a-z][a-zA-Z0-9]{0,31}$")) continue;
            o[k] = v switch
            {
                null => null, bool b => b, string str => str.Length > 64 ? str[..64] : str, double d => Math.Round(d, 4), int i => i, long l => l,
                _ => v.ToString(),
            };
        }
        return o;
    }

    public async ValueTask DisposeAsync()
    {
        _subscription?.Dispose();
        _stop.Cancel();
        if (_loop is not null) { try { await _loop.ConfigureAwait(false); } catch (Exception) { } }
        _http.Dispose();
        _stop.Dispose();
    }
}
