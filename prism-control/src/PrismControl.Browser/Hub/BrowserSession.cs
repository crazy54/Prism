using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Hub;

/// <summary>A command's outcome. <see cref="Code"/> is a protocol error code (or a plugin-local one) when not ok.</summary>
public sealed record CommandResult(bool Ok, JsonObject? Data = null, string? Code = null, string? Message = null)
{
    public static readonly CommandResult Success = new(true);
    public static CommandResult Fail(string code, string? message = null) => new(false, null, code, message);
}

/// <summary>A discrete event from a browser (focusChanged, zoom, permissionAdded, pipChanged, gesture.needed, …).</summary>
public sealed record BrowserEvent(string BrowserKey, string Kind, JsonObject Data);

/// <summary>Why a pipe connection was refused (counted for diagnostics and tests).</summary>
public enum Rejection { None, NoPreamble, BadToken, BadOrigin, RelayIdentity, ExtensionMismatch, ProtocolMismatch, HelloTimeout }

/// <summary>Checks that the pipe client is our relay (cheap same-user impersonation mitigation, research §8.1).</summary>
public interface IRelayVerifier
{
    bool Verify(int? clientPid, string? clientImagePath, RelayInfo relay);
}

/// <summary>
/// Accepts a client whose image is prism-relay.exe (or a running older copy renamed aside by RelayInstaller).
/// An unknown pid or unreadable image path is accepted and logged: same-user impersonation is out of scope anyway.
/// </summary>
public sealed class RelayImageVerifier(ILog log, IProcessInfo? processes = null) : IRelayVerifier
{
    public bool Verify(int? clientPid, string? clientImagePath, RelayInfo relay)
    {
        var path = clientImagePath ?? (clientPid is { } pid ? processes?.ImagePathOf(pid) : null);
        if (path is null) { log.Debug("relay image path unknown; identity not checked"); return true; }
        return IsRelayImage(path);
    }

    /// <summary>prism-relay.exe, or a running older copy RelayInstaller renamed aside (prism-relay.old-&lt;utc&gt;-&lt;rand&gt;.exe).</summary>
    public static bool IsRelayImage(string path)
    {
        var name = Path.GetFileName(path);
        return name.Equals("prism-relay.exe", StringComparison.OrdinalIgnoreCase)
            || (name.StartsWith("prism-relay.old-", StringComparison.OrdinalIgnoreCase) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase));
    }
}

public sealed class AcceptAnyRelay : IRelayVerifier
{
    public static readonly AcceptAnyRelay Instance = new();
    public bool Verify(int? clientPid, string? clientImagePath, RelayInfo relay) => true;
}

/// <summary>What a session needs from the hub.</summary>
internal interface ISessionHost
{
    BrowserStore Store { get; }
    ImageStore Images { get; }
    PreviewStore Previews { get; }
    ILog Log { get; }
    /// <summary>The token to check when the connection was not authenticated by its endpoint ("" = refuse such connections).</summary>
    string Token { get; }
    IReadOnlyList<string> AllowedOrigins { get; }
    IRelayVerifier Verifier { get; }
    string PluginVersion { get; }
    string RequestedPrivacy { get; }
    int PreviewFps { get; }
    /// <summary>What welcome.streaming says: a streaming app runs and the deck's auto streamer-safe is on.</summary>
    bool StreamingActive { get; }
    /// <summary>A profile reported its own privacy choices (hello / state.full privacySettings).</summary>
    void OnPrivacySettings(string browserKey, PrivacySettings settings);
    void OnRejected(Rejection why);
    void OnEvent(BrowserEvent e);
    void OnMediaChanged(string browserKey, IEnumerable<MediaItem> upserts);
    void OnSessionEnded(BrowserSession session);
}

/// <summary>
/// One relay connection = one browser profile with the extension. Protocol: relay preamble (token, origin, browser pid
/// and exe) → hello → our welcome → state.full → deltas, images, events and command results. Every frame is untrusted;
/// a bad frame is dropped, never fatal. Commands are rate limited (60/s) and time out after 2 s.
/// </summary>
public sealed class BrowserSession
{
    private static int _nextSession;

    private readonly IFrameConnection _conn;
    private readonly ISessionHost _host;
    private readonly ILog _log;
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private readonly ConcurrentDictionary<int, TaskCompletionSource<CommandResult>> _pending = new();
    private readonly object _rateGate = new();
    private double _tokens = Wire.Limits.CommandsPerSecond;
    private long _tokensAt;
    private int _nextId;
    private int _seq;
    private volatile bool _closed;

    internal BrowserSession(IFrameConnection connection, ISessionHost host)
    {
        _conn = connection;
        _host = host;
        _log = host.Log;
        SessionId = "s" + Interlocked.Increment(ref _nextSession).ToString(System.Globalization.CultureInfo.InvariantCulture);
        _tokensAt = host.Store.Time.GetTimestamp();
    }

    public string SessionId { get; }
    /// <summary>Set after a valid hello ("chrome:&lt;profile uid&gt;").</summary>
    public string? BrowserKey { get; private set; }
    public RelayInfo? Relay { get; private set; }
    public bool IsOpen => !_closed && BrowserKey is not null;
    internal int DroppedFrames { get; private set; }

    private BrowserStore Store => _host.Store;

    // ------------------------------------------------------------------ run loop

    internal async Task RunAsync(CancellationToken ct)
    {
        try
        {
            var why = await HandshakeAsync(ct).ConfigureAwait(false);
            if (why != Rejection.None)
            {
                _host.OnRejected(why);
                if (why == Rejection.ProtocolMismatch)
                {
                    // Keep the pipe open (and quiet) so the extension keeps showing "Update needed" instead of a
                    // reconnect loop through relay.down; frames are read and discarded until the browser closes it.
                    while (!ct.IsCancellationRequested && await _conn.ReadAsync(ct).ConfigureAwait(false) is not null) DroppedFrames++;
                }
                return;
            }
            while (!ct.IsCancellationRequested)
            {
                var frame = await _conn.ReadAsync(ct).ConfigureAwait(false);
                if (frame is null) break;   // EOF: the browser closed the port
                try { Dispatch(frame); }
                catch (Exception ex)
                {
                    DroppedFrames++;
                    _log.Debug($"browser frame dropped ({ex.GetType().Name})");
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _log.Debug($"browser session {SessionId} ended: {ex.GetType().Name}"); }
        finally
        {
            _closed = true;
            foreach (var (_, tcs) in _pending) tcs.TrySetResult(CommandResult.Fail(Wire.Err.Disconnected, "The browser disconnected."));
            _pending.Clear();
            try { await _conn.DisposeAsync().ConfigureAwait(false); } catch (Exception) { }
            _host.OnSessionEnded(this);
        }
    }

    private async Task<Rejection> HandshakeAsync(CancellationToken ct)
    {
        // 1. The relay preamble, first and only once. Desktop's endpoint has already checked (and removed) its token.
        using (var first = CancellationTokenSource.CreateLinkedTokenSource(ct))
        {
            first.CancelAfter(TimeSpan.FromSeconds(5));
            JsonNode? pre = _conn.Preamble;
            var authenticated = pre is not null;
            if (pre is null)
            {
                try { pre = await _conn.ReadAsync(first.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return Rejection.NoPreamble; }
            }
            if (pre is not JsonObject po || WireParser.TypeOf(po, requireVersion: false) != Wire.T.Relay) return Rejection.NoPreamble;
            if (WireParser.Int(po, "v") is not { } rv || rv < Wire.RelayPreambleMin || rv > Wire.RelayPreamble)
            {
                _log.Warn($"browser pipe: relay preamble version {WireParser.Int(po, "v")} is not supported ({Wire.RelayPreambleMin}..{Wire.RelayPreamble}); refused");
                return Rejection.NoPreamble;
            }
            var relay = WireParser.ParseRelay(po, out var token);
            if (relay is null) return Rejection.NoPreamble;
            if (!authenticated && !TokenEquals(token, _host.Token))
            {
                _log.Warn("browser pipe: a client sent a wrong token; refused");
                return Rejection.BadToken;
            }
            if (!_host.AllowedOrigins.Contains(relay.Origin, StringComparer.Ordinal))
            {
                _log.Warn($"browser pipe: origin {WireParser.Redact(relay.Origin)} is not our extension; refused");
                return Rejection.BadOrigin;
            }
            if (!_host.Verifier.Verify(_conn.ClientPid, _conn.ClientImagePath, relay))
            {
                _log.Warn("browser pipe: the client is not prism-relay.exe; refused");
                return Rejection.RelayIdentity;
            }
            Relay = relay;
        }

        // 2. hello within 10 s (the service worker may be starting).
        using var helloCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        helloCts.CancelAfter(Wire.Limits.HelloTimeout);
        while (true)
        {
            JsonNode? frame;
            try { frame = await _conn.ReadAsync(helloCts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return Rejection.HelloTimeout; }
            if (frame is null) return Rejection.HelloTimeout;
            if (WireParser.Depth(frame) > Wire.Limits.MaxDepth) { DroppedFrames++; continue; }
            if (WireParser.TypeOf(frame, requireVersion: false) != Wire.T.Hello) { DroppedFrames++; continue; }
            var hello = WireParser.ParseHello(WireParser.Data(frame));
            if (hello is null) { DroppedFrames++; continue; }
            if (hello.ExtId.Length > 0 && Wire.OriginFor(hello.ExtId) != Relay!.Origin)
            {
                _log.Warn("browser pipe: the hello's extension id does not match the relay's origin; refused");
                return Rejection.ExtensionMismatch;
            }
            if (hello.Proto != Wire.Proto || WireParser.Int((JsonObject)frame, "v") != Wire.Proto)
            {
                // Answer with our version so the extension shows "update Prism Control / the extension", then stay quiet.
                await SendWelcomeAsync(ct).ConfigureAwait(false);
                _log.Warn($"browser pipe: protocol {hello.Proto} is not supported (we speak {Wire.Proto}); the extension shows a version message");
                return Rejection.ProtocolMismatch;
            }
            if (hello.ProfileUid.Length == 0)
            {
                // MED 10: an extension that has not loaded its settings yet (no profile uid) must not open a session with
                // default privacy. It retries hello; the next one, with its uid, is answered.
                DroppedFrames++;
                _log.Debug("browser pipe: a hello without a profile uid was ignored");
                continue;
            }
            Register(hello, (JsonObject)frame);
            await SendWelcomeAsync(ct).ConfigureAwait(false);
            return Rejection.None;
        }
    }

    private static bool TokenEquals(string? a, string b)
    {
        if (a is null || b.Length == 0) return false;
        var x = Encoding.UTF8.GetBytes(a);
        var y = Encoding.UTF8.GetBytes(b);
        return x.Length == y.Length && CryptographicOperations.FixedTimeEquals(x, y);
    }

    private void Register(WireParser.Hello hello, JsonObject frame)
    {
        var exe = Relay!.BrowserExe.ToLowerInvariant();
        var stem = exe.EndsWith(".exe", StringComparison.Ordinal) ? exe[..^4] : exe.Length > 0 ? exe : "browser";
        var key = $"{stem}:{hello.ProfileUid}";
        var now = Store.NowMs;
        var offset = WireParser.Long(frame, "at") is { } at ? at - Store.WallMs : 0;
        if (Math.Abs(offset) < 2000) offset = 0;   // same PC, same clock: ignore transport latency
        var level = Wire.Privacy.Stricter(hello.Privacy, _host.RequestedPrivacy);
        // LOW 20: a repeated hello (service-worker restart, relay.up) or a quick reconnect used to replace the instance
        // with an empty one, blanking every key until state.full arrived. Keep what we hold (re-filtered at the new
        // level, marked not synced); the coming state.full replaces it all.
        var prev = Store.Current.Find(key);
        var instance = new BrowserInstance
        {
            Key = key,
            SessionId = SessionId,
            Brand = BrandFor(exe, hello.Brand),
            Exe = exe,
            Pid = Relay.BrowserPid,
            Major = hello.Major,
            ProfileUid = hello.ProfileUid,
            ProfileLabel = hello.ProfileLabel,
            ExtVersion = hello.ExtVersion,
            Caps = hello.Caps,
            Privacy = level,
            Settings = hello.Settings ?? prev?.Settings,
            Connected = true,
            ConnectedAt = now,
            FocusedAt = prev?.FocusedAt ?? 0,
            ClockOffsetMs = offset,
        };
        if (prev is not null)
        {
            instance = PrivacyFilter.Apply(instance with
            {
                Tabs = prev.Tabs, Windows = prev.Windows, Groups = prev.Groups, Media = prev.Media, Downloads = prev.Downloads,
                FocusedWindowId = prev.FocusedWindowId, LastFocusedWindowId = prev.LastFocusedWindowId, Synced = false,
            }, Wire.Privacy.Stricter(level, prev.Privacy));
            instance = instance with { Privacy = level };
        }
        BrowserKey = key;
        if (hello.Settings is { } settings) _host.OnPrivacySettings(key, settings);
        Store.Upsert(instance);
        _log.Info($"browser connected: {instance.Brand} {hello.Major} (session {SessionId}, extension {hello.ExtVersion}, privacy {level})");
    }

    /// <summary>The brand comes from the relay's parent exe (authoritative); the hello's brand is only a fallback.</summary>
    public static string BrandFor(string exe, string? helloBrand) => exe.ToLowerInvariant() switch
    {
        "chrome.exe" => "Chrome",
        "msedge.exe" => "Edge",
        "brave.exe" => "Brave",
        "vivaldi.exe" => "Vivaldi",
        "opera.exe" => "Opera",
        _ => string.IsNullOrWhiteSpace(helloBrand) ? "Browser" : WireParser.Truncate(helloBrand!, 24),
    };

    private Task SendWelcomeAsync(CancellationToken ct) => WriteAsync(Envelope(Wire.T.Welcome, new JsonObject
    {
        ["proto"] = Wire.Proto,
        ["plugin"] = new JsonObject { ["version"] = _host.PluginVersion },
        ["privacy"] = _host.RequestedPrivacy,
        ["streaming"] = _host.StreamingActive,
        ["want"] = new JsonObject
        {
            ["tabs"] = true,
            ["media"] = true,
            ["downloads"] = true,
            ["groups"] = true,
            ["faviconPx"] = 32,
            ["artMaxPx"] = 288,
            ["previewFps"] = _host.PreviewFps,
        },
    }), ct);

    private JsonObject Envelope(string type, JsonObject? data) => new()
    {
        ["v"] = Wire.Proto,
        ["t"] = type,
        ["seq"] = Interlocked.Increment(ref _seq),
        ["at"] = Store.WallMs,
        ["data"] = data ?? new JsonObject(),
    };

    // ------------------------------------------------------------------ writes

    internal async Task WriteAsync(JsonNode frame, CancellationToken ct = default)
    {
        if (_closed) throw new InvalidOperationException("session closed");
        if (WireParser.Utf8Length(frame) > Wire.Limits.OutboundMaxBytes) throw new InvalidOperationException("outbound frame too large");
        await _writeGate.WaitAsync(ct).ConfigureAwait(false);
        try { await _conn.WriteAsync(frame, ct).ConfigureAwait(false); }
        finally { _writeGate.Release(); }
    }

    public Task SendRawAsync(string type, JsonObject? data, CancellationToken ct = default) => WriteAsync(Envelope(type, data), ct);

    /// <summary>Sends <c>{t:"cmd", id, op, args}</c> and awaits its result (2 s). Excess beyond 60/s is refused locally.</summary>
    public async Task<CommandResult> SendCommandAsync(string op, JsonObject args, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        if (!IsOpen) return CommandResult.Fail(Wire.Err.Disconnected, "The browser disconnected.");
        if (!TakeToken()) return CommandResult.Fail(Wire.Err.RateLimited, "Too many commands; slow down.");
        var id = Interlocked.Increment(ref _nextId);
        var tcs = new TaskCompletionSource<CommandResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = tcs;
        // LOW 21: the 2 s budget starts BEFORE the write, so a slow pipe write counts against it too.
        using var timer = new CancellationTokenSource();
        var wait = timeout ?? Wire.Limits.CommandTimeout;
        var delay = Task.Delay(wait, Store.Time, timer.Token);
        try
        {
            var frame = new JsonObject { ["v"] = Wire.Proto, ["t"] = Wire.T.Cmd, ["id"] = id, ["op"] = op, ["args"] = args };
            var write = WriteAsync(frame, ct);
            if (await Task.WhenAny(write, delay).ConfigureAwait(false) != write)
            {
                _ = write.ContinueWith(t => _ = t.Exception, TaskScheduler.Default);
                return CommandResult.Fail(Wire.Err.Timeout, "The browser did not answer.");
            }
            await write.ConfigureAwait(false);
            var done = await Task.WhenAny(tcs.Task, delay).ConfigureAwait(false);
            return done == tcs.Task ? await tcs.Task.ConfigureAwait(false) : CommandResult.Fail(Wire.Err.Timeout, "The browser did not answer.");
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or ObjectDisposedException)
        {
            return CommandResult.Fail(Wire.Err.Disconnected, "The browser disconnected.");
        }
        finally
        {
            timer.Cancel();
            _pending.TryRemove(id, out _);
        }
    }

    private bool TakeToken()
    {
        lock (_rateGate)
        {
            var now = Store.Time.GetTimestamp();
            var elapsed = Store.Time.GetElapsedTime(_tokensAt, now).TotalSeconds;
            _tokensAt = now;
            _tokens = Math.Min(Wire.Limits.CommandsPerSecond, _tokens + elapsed * Wire.Limits.CommandsPerSecond);
            if (_tokens < 1) return false;
            _tokens -= 1;
            return true;
        }
    }

    // ------------------------------------------------------------------ reads

    private void Dispatch(JsonNode frame)
    {
        if (WireParser.Depth(frame) > Wire.Limits.MaxDepth) { DroppedFrames++; return; }
        var type = WireParser.TypeOf(frame);
        if (type is null || frame is not JsonObject o) { DroppedFrames++; return; }
        if (BrowserKey is not { } key) return;
        // A newer connection of the same profile replaced us: ignore stale frames (results still complete).
        var mine = Store.Current.Find(key) is { } b && b.SessionId == SessionId;
        var data = WireParser.Data(o);
        switch (type)
        {
            case Wire.T.Result:
                if (WireParser.ParseResult(o) is { } r && _pending.TryRemove(r.Id, out var tcs))
                    tcs.TrySetResult(new CommandResult(r.Ok, r.Data, r.ErrorCode, r.ErrorMessage));
                return;
            case Wire.T.Ping:
                return;
        }
        if (!mine || data is null) { DroppedFrames++; return; }
        switch (type)
        {
            case Wire.T.StateFull: ApplyFull(key, data); break;
            case Wire.T.TabsDelta: ApplyTabsDelta(key, data); break;
            case Wire.T.MediaUpdate: ApplyMedia(key, data); break;
            case Wire.T.DownloadsUpdate: ApplyDownloads(key, data); break;
            case Wire.T.Img: ApplyImage(key, data); break;
            case Wire.T.PreviewFrame: ApplyPreview(key, data); break;
            case Wire.T.Event: ApplyEvent(key, data); break;
            case Wire.T.Hello:
                // PROTOCOL.md §3.1: a hello on an established session means the extension restarted its session (its
                // service worker restarted, or relay.up arrived). Drop everything held for this pipe session and answer
                // with a fresh welcome; images, then a new state.full, follow.
                if (WireParser.ParseHello(data) is { Proto: Wire.Proto, ProfileUid.Length: > 0 } h && (h.ExtId.Length == 0 || Wire.OriginFor(h.ExtId) == Relay!.Origin))
                {
                    var old = BrowserKey;
                    Register(h, o);
                    if (old is not null && old != BrowserKey)
                        Store.Mutate(s => s.Find(old) is { } prev && prev.SessionId == SessionId ? s with { Browsers = s.Browsers.Remove(prev) } : s, BrowserChange.All, old);
                    _ = SendWelcomeAsync(CancellationToken.None).ContinueWith(_ => { }, TaskScheduler.Default);
                }
                else DroppedFrames++;
                break;
            default:
                DroppedFrames++;
                break;
        }
    }

    private string LevelFor(BrowserInstance b, JsonObject data)
    {
        var reported = WireParser.Str(data, "privacy", 16, clean: false);
        var level = Wire.Privacy.IsValid(reported) ? Wire.Privacy.Stricter(reported, _host.RequestedPrivacy) : Wire.Privacy.Stricter(b.Privacy, _host.RequestedPrivacy);
        return level;
    }

    private bool _warnedTabCap;

    private void WarnTabCap()
    {
        if (_warnedTabCap) return;
        _warnedTabCap = true;
        _log.Warn($"browser session {SessionId}: more than {Wire.Limits.MaxTabs} tabs; the rest are not shown on keys");
    }

    private void ApplyFull(string key, JsonObject d)
    {
        var mediaUpserts = new List<MediaItem>();
        var settings = WireParser.ParsePrivacySettings(d["privacySettings"] as JsonObject);
        // The lite-tier floor learns the profile's settings before anything else can observe them in the store.
        if (settings is not null) _host.OnPrivacySettings(key, settings);
        Store.UpdateBrowser(key, b =>
        {
            var level = LevelFor(b, d);
            var tabs = ImmutableDictionary.CreateBuilder<int, BrowserTab>();
            if (d["tabs"] is JsonArray all && all.Count > Wire.Limits.MaxTabs) WarnTabCap();
            foreach (var o in Objects(d["tabs"], Wire.Limits.MaxTabs))
                if (WireParser.MergeTab(null, o) is { } t) tabs[t.Id] = PrivacyFilter.Apply(t, level);
            var windows = ImmutableDictionary.CreateBuilder<int, BrowserWindowInfo>();
            foreach (var o in Objects(d["windows"], Wire.Limits.MaxWindows))
                if (WireParser.MergeWindow(b.Windows.GetValueOrDefault(WireParser.Int(o, "id") ?? int.MinValue) is { } known ? new BrowserWindowInfo { Id = known.Id, FocusedAt = known.FocusedAt } : null, o) is { } w) windows[w.Id] = w;
            var groups = ImmutableDictionary.CreateBuilder<int, TabGroupInfo>();
            foreach (var o in Objects(d["groups"], Wire.Limits.MaxGroups))
                if (WireParser.MergeGroup(null, o) is { } g) groups[g.Id] = PrivacyFilter.Apply(g, level);
            var media = ImmutableDictionary.CreateBuilder<string, MediaItem>(StringComparer.Ordinal);
            foreach (var o in Objects(d["media"], Wire.Limits.MaxMedia))
                if (WireParser.MergeMedia(null, o) is { } m) { var mm = PrivacyFilter.Apply(m, level) with { Seen = Store.NowMs }; media[m.Key] = mm; mediaUpserts.Add(mm); }
            var downloads = ImmutableDictionary.CreateBuilder<int, DownloadItem>();
            foreach (var o in Objects(d["downloads"], Wire.Limits.MaxDownloads))
                if (WireParser.MergeDownload(null, o) is { } x) downloads[x.Id] = PrivacyFilter.Apply(x, level);
            int? focused = WireParser.Int(d, "focusedWindow") is { } fw ? (fw >= 0 && windows.ContainsKey(fw) ? fw : null) : windows.Values.FirstOrDefault(w => w.Focused)?.Id;
            if (focused is { } fid && windows.TryGetValue(fid, out var fwin)) windows[fid] = fwin with { FocusedAt = Store.NowMs };
            ApplyActive(tabs, d["activeByWindow"] as JsonObject);
            return b with
            {
                Privacy = level,
                Settings = settings ?? b.Settings,
                Synced = true,
                Caps = WireParser.ParseCaps(d["caps"] as JsonObject, b.Caps),
                Tabs = tabs.ToImmutable(),
                Windows = windows.ToImmutable(),
                Groups = groups.ToImmutable(),
                Media = media.ToImmutable(),
                Downloads = downloads.ToImmutable(),
                FocusedWindowId = focused,
                LastFocusedWindowId = focused ?? b.LastFocusedWindowId,
                FocusedAt = focused is null ? b.FocusedAt : Store.NowMs,
            };
        }, BrowserChange.All);
        if (mediaUpserts.Count > 0) _host.OnMediaChanged(key, mediaUpserts);
    }

    private void ApplyTabsDelta(string key, JsonObject d)
    {
        var change = BrowserChange.Tabs;
        Store.UpdateBrowser(key, b =>
        {
            var level = LevelFor(b, d);
            var tabs = b.Tabs.ToBuilder();
            foreach (var o in Objects(d["upsert"], Wire.Limits.MaxTabs))
            {
                var id = WireParser.Int(o, "id");
                if (id is null) continue;
                if (!tabs.ContainsKey(id.Value) && tabs.Count >= Wire.Limits.MaxTabs) { WarnTabCap(); continue; }
                tabs.TryGetValue(id.Value, out var prev);
                if (WireParser.MergeTab(prev, o) is { } t) tabs[t.Id] = PrivacyFilter.Apply(t, level);
            }
            foreach (var id in Ints(d["remove"])) tabs.Remove(id);
            ApplyActive(tabs, d["activeByWindow"] as JsonObject);
            var windows = b.Windows;
            if (d["windows"] is JsonObject wd)
            {
                var wb = windows.ToBuilder();
                foreach (var o in Objects(wd["upsert"], Wire.Limits.MaxWindows))
                {
                    if (WireParser.Int(o, "id") is not { } wid) continue;
                    wb.TryGetValue(wid, out var prev);
                    if (WireParser.MergeWindow(prev, o) is { } w) wb[w.Id] = w;
                }
                foreach (var id in Ints(wd["remove"]))
                {
                    wb.Remove(id);
                    foreach (var t in tabs.Values.Where(t => t.WindowId == id).ToList()) tabs.Remove(t.Id);
                }
                windows = wb.ToImmutable();
                change |= BrowserChange.Windows;
            }
            var groups = b.Groups;
            if (d["groups"] is JsonObject gd)
            {
                var gb = groups.ToBuilder();
                foreach (var o in Objects(gd["upsert"], Wire.Limits.MaxGroups))
                {
                    if (WireParser.Int(o, "id") is not { } gid) continue;
                    gb.TryGetValue(gid, out var prev);
                    if (WireParser.MergeGroup(prev, o) is { } g) gb[g.Id] = PrivacyFilter.Apply(g, level);
                }
                foreach (var id in Ints(gd["remove"])) gb.Remove(id);
                groups = gb.ToImmutable();
                change |= BrowserChange.Groups;
            }
            var nb = b with { Privacy = level, Tabs = tabs.ToImmutable(), Windows = windows, Groups = groups };
            if (WireParser.Has(d, "focusedWindow"))
            {
                int? focused = WireParser.Int(d, "focusedWindow") is { } fw && fw >= 0 ? fw : null;
                nb = nb with
                {
                    FocusedWindowId = focused,
                    LastFocusedWindowId = focused ?? b.LastFocusedWindowId,
                    FocusedAt = focused is null ? b.FocusedAt : Store.NowMs,
                    Windows = Refocus(nb.Windows, focused),
                };
            }
            if (d["caps"] is JsonObject caps) nb = nb with { Caps = WireParser.ParseCaps(caps, b.Caps) };
            return nb;
        }, BrowserChange.Tabs | BrowserChange.Windows | BrowserChange.Groups);
        _ = change;
    }

    /// <summary>Marks the focused window (and stamps when it got the focus, for telling tied frames apart).</summary>
    private ImmutableDictionary<int, BrowserWindowInfo> Refocus(ImmutableDictionary<int, BrowserWindowInfo> windows, int? focused)
    {
        var now = Store.NowMs;
        return windows.ToImmutableDictionary(kv => kv.Key, kv =>
        {
            var w = kv.Value;
            var isFocused = kv.Key == focused;
            if (isFocused && !w.Focused) return w with { Focused = true, FocusedAt = now };
            return w.Focused == isFocused ? w : w with { Focused = isFocused };
        });
    }

    /// <summary>activeByWindow {winId: tabId} (-1 = none): exactly one active tab per listed window.</summary>
    private static void ApplyActive(ImmutableDictionary<int, BrowserTab>.Builder tabs, JsonObject? act)
    {
        if (act is null) return;
        foreach (var (winText, v) in act)
        {
            if (!int.TryParse(winText, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var win) || v is not JsonValue jv || !jv.TryGetValue<int>(out var activeId)) continue;
            foreach (var t in tabs.Values.Where(t => t.WindowId == win && t.Active != (t.Id == activeId)).ToList())
                tabs[t.Id] = t with { Active = t.Id == activeId };
        }
    }

    private void ApplyMedia(string key, JsonObject d)
    {
        var upserts = new List<MediaItem>();
        Store.UpdateBrowser(key, b =>
        {
            var level = LevelFor(b, d);
            var media = b.Media.ToBuilder();
            foreach (var o in Objects(d["upsert"], Wire.Limits.MaxMedia))
            {
                var k = WireParser.Str(o, "key", 40, clean: false);
                if (k is null) continue;
                if (!media.ContainsKey(k) && media.Count >= Wire.Limits.MaxMedia) continue;
                media.TryGetValue(k, out var prev);
                if (WireParser.MergeMedia(prev, o) is { } m) { var mm = PrivacyFilter.Apply(m, level) with { Seen = Store.NowMs }; media[m.Key] = mm; upserts.Add(mm); }
            }
            foreach (var n in Strings(d["remove"])) media.Remove(n);
            return b with { Media = media.ToImmutable() };
        }, BrowserChange.Media);
        if (upserts.Count > 0) _host.OnMediaChanged(key, upserts);
    }

    private void ApplyDownloads(string key, JsonObject d) =>
        Store.UpdateBrowser(key, b =>
        {
            var level = LevelFor(b, d);
            var downloads = b.Downloads.ToBuilder();
            foreach (var o in Objects(d["upsert"], Wire.Limits.MaxDownloads))
            {
                if (WireParser.Int(o, "id") is not { } id) continue;
                if (!downloads.ContainsKey(id) && downloads.Count >= Wire.Limits.MaxDownloads)
                {
                    // keep the newest: drop the oldest finished one
                    var oldest = downloads.Values.Where(x => x.State != "in_progress").OrderBy(x => x.StartedAt ?? 0).ThenBy(x => x.Id).FirstOrDefault();
                    if (oldest is null) continue;
                    downloads.Remove(oldest.Id);
                }
                downloads.TryGetValue(id, out var prev);
                if (WireParser.MergeDownload(prev, o) is { } x) downloads[x.Id] = PrivacyFilter.Apply(x, level);
            }
            foreach (var id in Ints(d["remove"])) downloads.Remove(id);
            var caps = d["caps"] is JsonObject c ? WireParser.ParseCaps(c, b.Caps) : b.Caps;
            return b with { Downloads = downloads.ToImmutable(), Caps = caps };
        }, BrowserChange.Downloads);

    private void ApplyImage(string key, JsonObject d)
    {
        var id = WireParser.Str(d, "id", 80, clean: false) ?? "";
        var max = id.StartsWith("art:", StringComparison.Ordinal) ? Wire.Limits.ArtMaxBytes : Wire.Limits.FavMaxBytes;
        var img = WireParser.ParseImage(d, max);
        if (img is null) { DroppedFrames++; return; }
        if (Wire.Privacy.Rank(Store.Current.Find(key)?.Privacy) >= 2 && img.Id.StartsWith("art:", StringComparison.Ordinal)) return;
        _host.Images.Put(new StoredImage(img.Id, img.Mime, img.Width, img.Height, img.Bytes));
        Store.Touch(BrowserChange.Images, key);
    }

    private void ApplyPreview(string key, JsonObject d)
    {
        var b = Store.Current.Find(key);
        if (b is null || Wire.Privacy.Rank(b.Privacy) > 0 || Wire.Privacy.Rank(_host.RequestedPrivacy) > 0) return;   // never keep previews unless privacy is "full"
        if (WireParser.Int(d, "windowId") is not { } win) { DroppedFrames++; return; }
        // LOW 15: a frame is kept only if it shows a tab we know as that window's active tab and nothing about the tab is
        // hidden (an always-hidden site arrives with hidden "all" even at full). A frame without a tab id is not kept.
        if (WireParser.Int(d, "tabId") is not { } tabId || !b.Tabs.TryGetValue(tabId, out var shown) || shown.WindowId != win || !shown.Active || shown.Hidden is not null)
        {
            DroppedFrames++;
            return;
        }
        var img = WireParser.ParseImage(d, Wire.Limits.PreviewMaxBytes, requireId: false);
        if (img is null || img.Mime != "image/jpeg" || img.Width > 360 || img.Height > 180) { DroppedFrames++; return; }
        _host.Previews.Put(key, win, new StoredImage($"preview:{win}", img.Mime, img.Width, img.Height, img.Bytes), Store.NowMs);
        Store.Touch(BrowserChange.Preview, key);
    }

    private void ApplyEvent(string key, JsonObject d)
    {
        var kind = WireParser.Str(d, "kind", 32, clean: false);
        if (kind is null) { DroppedFrames++; return; }
        switch (kind)
        {
            case "focusChanged":
            {
                var win = WireParser.Int(d, "windowId");
                Store.UpdateBrowser(key, b =>
                {
                    var focused = win is >= 0 ? win : null;
                    var windows = Refocus(b.Windows, focused);
                    return b with
                    {
                        FocusedWindowId = focused,
                        LastFocusedWindowId = focused ?? b.LastFocusedWindowId,
                        FocusedAt = focused is null ? b.FocusedAt : Store.NowMs,
                        Windows = windows,
                    };
                }, BrowserChange.Windows | BrowserChange.Browsers);
                break;
            }
            case "zoom":
            {
                if (WireParser.Int(d, "tabId") is { } tab && WireParser.Double(d, "factor", 0.25, 5) is { } factor)
                    Store.UpdateBrowser(key, b => b.Tabs.TryGetValue(tab, out var t) ? b with { Tabs = b.Tabs.SetItem(tab, t with { Zoom = factor }) } : b, BrowserChange.Tabs);
                break;
            }
            case "permissionAdded":
            case "permissionRemoved":
            case "caps":
            {
                var caps = d["caps"] as JsonObject;
                Store.UpdateBrowser(key, b =>
                {
                    var c = WireParser.ParseCaps(caps, b.Caps);
                    if (caps is null && d["origins"] is JsonArray origins)
                    {
                        var list = origins.Take(64).Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) && s.Length <= 256 ? s : null).Where(s => s is not null).Cast<string>();
                        c = kind == "permissionAdded"
                            ? c with { GrantedOrigins = [.. c.GrantedOrigins.Union(list)] }
                            : c with { GrantedOrigins = [.. c.GrantedOrigins.Except(list)] };
                    }
                    return b with { Caps = c };
                }, BrowserChange.Browsers | BrowserChange.Media);
                break;
            }
            case "pipChanged":
            case "gesture.needed":
                // The PiP outcome of an F24 press (ok / code); the pip state itself arrives in media.update.
                break;
            case "profile":
            {
                if (d["profile"] is JsonObject p)
                {
                    var label = WireParser.Str(p, "label", Wire.Limits.ProfileLabel) ?? "";
                    Store.UpdateBrowser(key, b => b with { ProfileLabel = label }, BrowserChange.Browsers);
                }
                break;
            }
            case "privacy":
            {
                var level = WireParser.Str(d, "level", 16, clean: false);
                if (Wire.Privacy.IsValid(level))
                    Store.UpdateBrowser(key, b => PrivacyFilter.Apply(b, Wire.Privacy.Stricter(level, _host.RequestedPrivacy)), BrowserChange.Privacy | BrowserChange.All);
                break;
            }
        }
        _host.OnEvent(new BrowserEvent(key, kind, (JsonObject)d.DeepClone()));
    }

    // ------------------------------------------------------------------ helpers

    private static IEnumerable<JsonObject> Objects(JsonNode? node, int max) =>
        node is JsonArray a ? a.Take(max).OfType<JsonObject>() : [];

    private static IEnumerable<int> Ints(JsonNode? node) =>
        node is JsonArray a ? a.Take(Wire.Limits.MaxTabs).Select(n => n is JsonValue v && v.TryGetValue<int>(out var i) ? (int?)i : null).Where(i => i is not null).Select(i => i!.Value) : [];

    private static IEnumerable<string> Strings(JsonNode? node) =>
        node is JsonArray a ? a.Take(Wire.Limits.MaxMedia * 4).Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) && s.Length <= 40 ? s : null).Where(s => s is not null).Cast<string>() : [];
}
