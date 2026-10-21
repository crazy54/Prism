using System.Net;
using System.Net.Http.Headers;
using System.Text;
using PrismControl.Core.Hosting;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Smtc;

namespace PrismControl.Spotify.Tests;

/// <summary>One request the fake HTTP stack saw.</summary>
public sealed record SeenRequest(HttpMethod Method, Uri Uri, string? Authorization, string? Body, string? IfNoneMatch)
{
    public string Path => Uri.AbsolutePath;
    public string Query => Uri.Query;
    public string Host => Uri.Host;
    public override string ToString() => $"{Method} {Uri.PathAndQuery}";
}

/// <summary>
/// A scripted HTTP handler for api.spotify.com, accounts.spotify.com and the image CDNs. Routes match method + path
/// (exact or prefix). Every request is recorded. Nothing ever leaves the process.
/// </summary>
public sealed class FakeHttp : HttpMessageHandler
{
    private readonly List<SeenRequest> _seen = [];
    private readonly List<(HttpMethod? Method, string Path, bool Prefix, Func<SeenRequest, HttpResponseMessage> Respond)> _routes = [];

    public IReadOnlyList<SeenRequest> Seen { get { lock (_seen) return [.. _seen]; } }
    public IEnumerable<SeenRequest> Api => Seen.Where(r => r.Host == "api.spotify.com");
    public int Count(HttpMethod method, string path) => Seen.Count(r => r.Method == method && r.Path == path);
    public void ClearSeen() { lock (_seen) _seen.Clear(); }

    /// <summary>Adds a route; later routes win over earlier ones.</summary>
    public FakeHttp On(HttpMethod? method, string path, Func<SeenRequest, HttpResponseMessage> respond, bool prefix = false)
    {
        lock (_routes) _routes.Insert(0, (method, path, prefix, respond));
        return this;
    }

    public FakeHttp OnJson(HttpMethod method, string path, Func<SeenRequest, string> json, bool prefix = false) =>
        On(method, path, r => Json(json(r)), prefix);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        var seen = new SeenRequest(request.Method, request.RequestUri!, request.Headers.Authorization?.ToString(), body,
            request.Headers.TryGetValues("If-None-Match", out var inm) ? string.Join(",", inm) : null);
        lock (_seen) _seen.Add(seen);
        Func<SeenRequest, HttpResponseMessage>? respond = null;
        lock (_routes)
        {
            foreach (var r in _routes)
            {
                if (r.Method is not null && r.Method != request.Method) continue;
                var target = request.RequestUri!.Host + request.RequestUri.AbsolutePath;
                if (r.Prefix ? target.StartsWith(r.Path, StringComparison.Ordinal) : target == r.Path) { respond = r.Respond; break; }
            }
        }
        var resp = respond?.Invoke(seen) ?? new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("{\"error\":{\"status\":404,\"message\":\"no fake route\"}}") };
        resp.RequestMessage = request;
        return resp;
    }

    public static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    public static HttpResponseMessage Status(HttpStatusCode status) => new(status) { Content = new ByteArrayContent([]) };

    public static HttpResponseMessage Error(HttpStatusCode status, string message, string? reason = null) =>
        Json($"{{\"error\":{{\"status\":{(int)status},\"message\":\"{message}\"{(reason is null ? "" : $",\"reason\":\"{reason}\"")}}}}}", status);

    public static HttpResponseMessage Image(byte[] bytes, string mime = "image/jpeg")
    {
        var c = new ByteArrayContent(bytes);
        c.Headers.ContentType = new MediaTypeHeaderValue(mime);
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = c };
    }
}

/// <summary>
/// A scripted media-session source (what <see cref="SmtcSource"/> would report after its policy ran). Records every
/// command; never touches the real system. Commands to Spotify's session record "toggle"; to another app's,
/// "toggle@chrome.exe".
/// </summary>
public sealed class FakeSmtc : IMediaSessionSource
{
    private SmtcSnapshot? _current;
    private SmtcSnapshot? _spotify;
    public readonly List<string> Commands = [];

    public SmtcSnapshot? Current => _current;
    public SmtcSnapshot? Spotify => _spotify;
    public IReadOnlyList<SmtcSessionInfo> Sessions =>
        [.. new[] { _current, _spotify }.Where(s => s is not null).Distinct().Select(s => new SmtcSessionInfo(s!.Key, s.AppId, s.AppName, s.IsSpotify, s.State, ReferenceEquals(s, _current), false))];
    public MediaFollow Follow { get; set; } = MediaFollow.SpotifyFirst;
    public PlayState? SpotifyRemote { get; set; }
    public bool CommandResult { get; set; } = true;
    public event EventHandler<SmtcChange>? Changed;

    /// <summary>Shows <paramref name="s"/>. A Spotify snapshot is also Spotify's own; null clears Spotify too if it was shown.</summary>
    public void Set(SmtcSnapshot? s, SmtcChange what = SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline)
    {
        if (s is { IsSpotify: true } || (s is null && _current is { IsSpotify: true })) _spotify = s;
        _current = s;
        Changed?.Invoke(this, what);
    }

    /// <summary>Shows <paramref name="shown"/> while Spotify's own session is <paramref name="spotify"/> (in the background).</summary>
    public void Set(SmtcSnapshot? shown, SmtcSnapshot? spotify, SmtcChange what = SmtcChange.Media | SmtcChange.Playback | SmtcChange.Timeline | SmtcChange.Background)
    {
        _spotify = spotify;
        _current = shown;
        Changed?.Invoke(this, what);
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public void Rebind() { }

    private Task<bool> Cmd(string name, string key)
    {
        lock (Commands) Commands.Add(SmtcSource.IsSpotifyApp(key) ? name : name + "@" + key);
        return Task.FromResult(CommandResult);
    }

    public Task<bool> TogglePlayPauseAsync(string sessionKey) => Cmd("toggle", sessionKey);
    public Task<bool> PlayAsync(string sessionKey) => Cmd("play", sessionKey);
    public Task<bool> PauseAsync(string sessionKey) => Cmd("pause", sessionKey);
    public Task<bool> NextAsync(string sessionKey) => Cmd("next", sessionKey);
    public Task<bool> PreviousAsync(string sessionKey) => Cmd("previous", sessionKey);
    public Task<bool> SeekAsync(string sessionKey, TimeSpan position) => Cmd("seek:" + (long)position.TotalMilliseconds, sessionKey);
    public Task<bool> SetShuffleAsync(string sessionKey, bool on) => Cmd("shuffle:" + on, sessionKey);
    public Task<bool> SetRepeatAsync(string sessionKey, PrismControl.Spotify.RepeatMode mode) => Cmd("repeat:" + mode, sessionKey);
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

public sealed class MemoryVault : ISecretVault
{
    private readonly Dictionary<string, string> _d = new();
    private int _inSave;
    private int _maxConcurrentSaves;
    private int _writes;

    /// <summary>Runs inside every Save before the value is stored (tests use it to hold a save open).</summary>
    public Action<string>? BeforeSave { get; set; }
    /// <summary>The most Save calls that were ever running at the same time.</summary>
    public int MaxConcurrentSaves => Volatile.Read(ref _maxConcurrentSaves);
    /// <summary>Saves plus deletes.</summary>
    public int Writes => Volatile.Read(ref _writes);

    public void Save(string name, string value)
    {
        var now = Interlocked.Increment(ref _inSave);
        int max;
        while ((max = Volatile.Read(ref _maxConcurrentSaves)) < now && Interlocked.CompareExchange(ref _maxConcurrentSaves, now, max) != max) { }
        try
        {
            BeforeSave?.Invoke(name);
            lock (_d) _d[name] = value;
            Interlocked.Increment(ref _writes);
        }
        finally { Interlocked.Decrement(ref _inSave); }
    }

    public string? Load(string name) { lock (_d) return _d.GetValueOrDefault(name); }
    public void Delete(string name) { lock (_d) _d.Remove(name); Interlocked.Increment(ref _writes); }
    public IReadOnlyDictionary<string, string> All { get { lock (_d) return new Dictionary<string, string>(_d); } }
}

/// <summary>Captures every log line (to prove tokens never reach the log).</summary>
public sealed class CaptureLog : ILog
{
    private readonly List<string> _lines = [];
    private readonly string _prefix;
    private readonly CaptureLog? _root;

    public CaptureLog() : this(null, "") { }
    private CaptureLog(CaptureLog? root, string prefix) { _root = root; _prefix = prefix; }

    public IReadOnlyList<string> Lines { get { var r = _root ?? this; lock (r._lines) return [.. r._lines]; } }
    public string All => string.Join("\n", Lines);

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        var r = _root ?? this;
        lock (r._lines) r._lines.Add($"{level} {_prefix}{message}{(exception is null ? "" : " | " + exception)}");
    }

    public ILog For(string category) => new CaptureLog(_root ?? this, _prefix + category + ": ");
    public bool IsEnabled(LogLevel level) => true;
}
