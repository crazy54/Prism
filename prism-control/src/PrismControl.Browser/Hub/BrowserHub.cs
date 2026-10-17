using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Smtc;
using PrismControl.Browser.State;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Hub;

public sealed class BrowserHubOptions
{
    public ILog Log { get; init; } = NullLog.Instance;
    public TimeProvider Time { get; init; } = TimeProvider.System;
    public bool SafeMode { get; init; }
    /// <summary>The pipe endpoint; null when the platform is unavailable (the keys then say so).</summary>
    public IFrameEndpoint? Endpoint { get; init; }
    public IForegroundPort Foreground { get; init; } = UnavailableForeground.Instance;
    public IInputPort Input { get; init; } = UnavailableInput.Instance;
    public IWindowPort Windows { get; init; } = NoWindows.Instance;
    public IShellPort? Shell { get; init; }
    public IImageScaler Scaler { get; init; } = PassThroughScaler.Instance;
    public ArtFetcher? ArtFetcher { get; init; }
    public ISmtcReader Smtc { get; init; } = NoSmtc.Instance;
    public IRelayVerifier Verifier { get; init; } = AcceptAnyRelay.Instance;
    public IReadOnlyList<string> AllowedOrigins { get; init; } = Wire.AllowedOrigins;
    public string PluginVersion { get; init; } = "0.1.0";
    /// <summary>How long a lost browser's tabs stay (dimmed) before they are removed.</summary>
    public TimeSpan LostGrace { get; init; } = TimeSpan.FromSeconds(5);
    /// <summary>A command sink to use instead of the real one (tests).</summary>
    public IBrowserCommandSink? CommandSinkOverride { get; init; }
    /// <summary>Each profile's own privacy choices, for the SMTC lite tier (null = a fresh in-memory one).</summary>
    public PrivacyMemory? PrivacyMemory { get; init; }
}

/// <summary>How a "focus this tab" press ended.</summary>
public enum FocusOutcome { Focused, Switched, SafeMode, NoBrowser, NotFound, Elevated, Refused, Failed }

public enum PipOutcome { Entered, Exited, Pending, SafeMode, NeedsPermission, Elevated, NoBrowser, Unsupported, Failed, KeyInUse }

public enum OpenOutcome { Opened, ConfirmNeeded, NotReady, Dangerous, PrivacyBlocked, NoPermission, SafeMode, NoBrowser, Failed }

/// <summary>Live status for the property inspector.</summary>
public sealed record HubStatus(bool SafeMode, bool Listening, int Connected, IReadOnlyList<string> Browsers, string? LastRejection, bool SmtcActive);

/// <summary>
/// The browser module's service: the pipe sessions, the merged <see cref="BrowserStore"/>, the command sink (real, or the
/// safe-mode logger), images (LRU 8 MB), guarded artwork fetching, the SMTC lite tier, and the multi-step flows actions
/// need (focus + raise, PiP via F24, opening downloads). Actions get it from the service registry and subscribe through
/// <see cref="Actions.BrowserBinding"/>; nothing here ever blocks an action mailbox.
/// </summary>
public sealed class BrowserHub : ISessionHost, IAsyncDisposable
{
    private readonly BrowserHubOptions _o;
    private readonly ConcurrentDictionary<string, BrowserSession> _sessionsByKey = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<BrowserSession, byte> _sessions = new();
    private readonly ConcurrentDictionary<string, long> _imageAsked = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, HashSet<string>> _imageWanted = new(StringComparer.Ordinal);
    private readonly CancellationTokenSource _cts = new();
    private readonly List<ITimer> _timers = [];
    private string _settingPrivacy = Wire.Privacy.Full;
    private bool _autoStreamerSafe = true;
    private bool _fetchArt = true;
    private string _pipKey = Wire.PipKeys.Default;
    private readonly PrivacyMemory _memory;
    private readonly object _liteGate = new();
    private string? _lastRejection;
    private int _rejections;
    private Func<IFrameConnection, Task>? _onConnection;
    private IFrameEndpoint? _endpoint;

    public BrowserHub(BrowserHubOptions options)
    {
        _o = options;
        Log = options.Log;
        Store = new BrowserStore(options.Log, options.Time);
        Images = new ImageStore();
        Previews = new PreviewStore();
        Commands = options.CommandSinkOverride ?? (options.SafeMode ? new SafeModeCommandSink(Store, options.Log) : new SessionCommandSink(SessionFor));
        Streams = new CommandCoalescer(Commands, options.Time, options.Log);
        _memory = options.PrivacyMemory ?? new PrivacyMemory(null, options.Log);
        if (options.SafeMode) Log.Info("Safe mode: browser commands, focus changes, keystrokes, file opens and HostInstaller writes are logged, not applied.");
    }

    public ILog Log { get; }
    public BrowserStore Store { get; }
    public ImageStore Images { get; }
    public PreviewStore Previews { get; }
    public IBrowserCommandSink Commands { get; }
    public CommandCoalescer Streams { get; }
    public bool SafeMode => _o.SafeMode;
    public TimeProvider Time => _o.Time;
    public IForegroundPort Foreground => _o.Foreground;
    public IInputPort Input => _o.Input;
    public bool PlatformAvailable => Volatile.Read(ref _endpoint) is not null;
    public int Rejections => Volatile.Read(ref _rejections);
    public string? LastRejection => _lastRejection;

    /// <summary>Discrete browser events (focusChanged, pipChanged, gesture.needed, …), raised on the session's thread.</summary>
    public event Action<BrowserEvent>? EventReceived;

    // ------------------------------------------------------------------ start / stop

    /// <summary>Starts the hub on <paramref name="endpoint"/> (or the options' endpoint); null = no pipe (keys say so).</summary>
    public void Start(IFrameEndpoint? endpoint = null)
    {
        endpoint ??= _o.Endpoint;
        Volatile.Write(ref _endpoint, endpoint);
        if (endpoint is { } ep)
        {
            _onConnection = conn =>
            {
                var session = new BrowserSession(conn, this);
                _sessions[session] = 0;
                return session.RunAsync(_cts.Token);
            };
            ep.ConnectionOpened += _onConnection;
            Log.Info("browser pipe listening (the endpoint publishes ingress.json for the relay)");
        }
        else Log.Warn("browser pipe unavailable (the Desktop platform is missing): browser keys show \"No browser connected\"");
        _o.Smtc.Changed += OnSmtcChanged;
        _ = Task.Run(async () =>
        {
            try { await _o.Smtc.StartAsync(_cts.Token).ConfigureAwait(false); OnSmtcChanged(this, EventArgs.Empty); }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Log.Debug("SMTC lite tier unavailable: " + ex.GetType().Name); }
        });
    }

    /// <summary>The endpoint passed to <see cref="Start"/> failed to start: keys then say the bridge is unavailable.</summary>
    public void MarkPlatformUnavailable()
    {
        var ep = Interlocked.Exchange(ref _endpoint, null);
        if (ep is not null && _onConnection is not null) ep.ConnectionOpened -= _onConnection;
        Store.Touch(BrowserChange.Browsers);
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_endpoint is { } ep && _onConnection is not null) ep.ConnectionOpened -= _onConnection;
        _o.Smtc.Changed -= OnSmtcChanged;
        lock (_timers) { foreach (var t in _timers) t.Dispose(); _timers.Clear(); }
        Streams.Dispose();
        try { await _o.Smtc.DisposeAsync().ConfigureAwait(false); } catch (Exception) { }
        _o.ArtFetcher?.Dispose();
    }

    /// <summary>Accepts a connection directly (tests without a pipe, or a custom endpoint).</summary>
    internal Task AcceptAsync(IFrameConnection conn)
    {
        var session = new BrowserSession(conn, this);
        _sessions[session] = 0;
        return session.RunAsync(_cts.Token);
    }

    // ------------------------------------------------------------------ ISessionHost

    string ISessionHost.Token => TestToken ?? _endpoint?.Token ?? "";
    /// <summary>The token accepted when no endpoint exists (tests that feed connections directly).</summary>
    internal string? TestToken { get; set; }
    IReadOnlyList<string> ISessionHost.AllowedOrigins => _o.AllowedOrigins;
    IRelayVerifier ISessionHost.Verifier => _o.Verifier;
    string ISessionHost.PluginVersion => _o.PluginVersion;
    public string RequestedPrivacy => Store.Current.RequestedPrivacy;
    int ISessionHost.PreviewFps => 0;
    bool ISessionHost.StreamingActive => StreamingActive;

    void ISessionHost.OnPrivacySettings(string browserKey, PrivacySettings settings)
    {
        if (_memory.Remember(browserKey, settings)) RefreshLite();
    }

    void ISessionHost.OnRejected(Rejection why)
    {
        Interlocked.Increment(ref _rejections);
        _lastRejection = why.ToString();
    }

    void ISessionHost.OnEvent(BrowserEvent e)
    {
        try { EventReceived?.Invoke(e); }
        catch (Exception ex) { Log.Debug("browser event subscriber failed: " + ex.GetType().Name); }
    }

    void ISessionHost.OnMediaChanged(string browserKey, IEnumerable<MediaItem> upserts)
    {
        if (!_fetchArt || _o.ArtFetcher is not { } fetcher) return;
        foreach (var m in upserts)
        {
            if (m.Art is not { Url: { } url } art) continue;
            if (art.Img is { } img && Images.Contains(img)) continue;
            var id = ArtFetcher.IdFor(url);
            if (Images.Contains(id)) continue;
            _ = Task.Run(async () =>
            {
                var r = await fetcher.FetchAsync(url, _cts.Token).ConfigureAwait(false);
                if (!r.Ok) return;
                var scaled = await _o.Scaler.ScaleAsync(r.Bytes!, 288, _cts.Token).ConfigureAwait(false);
                if (scaled is null || PrismControl.Core.Render.ImageInfo.Probe(scaled) is not { } info) return;
                if (scaled.Length > Wire.Limits.ArtMaxBytes * 2) return;
                // Privacy may have tightened while we fetched.
                if (Wire.Privacy.Rank(Store.Current.Find(browserKey)?.Privacy) >= 2) return;
                Images.Put(new StoredImage(id, info.Mime, info.Width, info.Height, scaled));
                Store.Touch(BrowserChange.Images, browserKey);
            });
        }
    }

    void ISessionHost.OnSessionEnded(BrowserSession session)
    {
        _sessions.TryRemove(session, out _);
        if (session.BrowserKey is not { } key) return;
        _sessionsByKey.TryRemove(new KeyValuePair<string, BrowserSession>(key, session));
        var now = Store.NowMs;
        Store.UpdateBrowser(key, b => b.SessionId == session.SessionId ? b with { Connected = false, LostAt = now } : b, BrowserChange.Browsers);
        Previews.Clear(key);
        Log.Info($"browser disconnected (session {session.SessionId})");
        ITimer? timer = null;
        timer = _o.Time.CreateTimer(_ =>
        {
            Store.Mutate(s =>
            {
                var b = s.Find(key);
                return b is not null && !b.Connected && b.SessionId == session.SessionId ? s with { Browsers = s.Browsers.Remove(b) } : s;
            }, BrowserChange.All, key);
            lock (_timers) { if (timer is not null) { _timers.Remove(timer); timer.Dispose(); } }
        }, null, _o.LostGrace, Timeout.InfiniteTimeSpan);
        lock (_timers) _timers.Add(timer);
    }

    /// <summary>The live session for a browser key (registered once its hello arrived).</summary>
    public BrowserSession? SessionFor(string key)
    {
        if (_sessionsByKey.TryGetValue(key, out var s) && s.IsOpen) return s;
        // Late registration: sessions learn their key during the handshake.
        foreach (var candidate in _sessions.Keys)
        {
            if (candidate.BrowserKey == key && candidate.IsOpen && Store.Current.Find(key)?.SessionId == candidate.SessionId)
            {
                _sessionsByKey[key] = candidate;
                return candidate;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ settings and privacy

    /// <summary>Applies the global "browser" section.</summary>
    public void ApplySettings(BrowserGlobalSettings g)
    {
        var wasActive = StreamingActive;
        _settingPrivacy = Wire.Privacy.IsValid(g.Privacy) ? g.Privacy : Wire.Privacy.Full;
        _autoStreamerSafe = g.AutoStreamerSafe;
        _fetchArt = g.FetchArt;
        _pipKey = Wire.PipKeys.Normalize(g.PipKey);
        if (StreamingActive != wasActive) SendStreamingToAll();
        RecomputePrivacy();
    }

    /// <summary>The key the picture-in-picture flow presses (global <c>browser.pipKey</c>, F13–F24, default F24).</summary>
    public string PipKey => _pipKey;

    public bool AutoStreamerSafe => _autoStreamerSafe;

    /// <summary>
    /// What the extensions are told (<c>streaming.active</c>, <c>welcome.streaming</c>): a streaming app runs AND the deck's
    /// "turn on by itself while OBS runs" is on. With it off, OBS changes nothing anywhere (MED 8).
    /// </summary>
    public bool StreamingActive => Store.Current.StreamingDetected && _autoStreamerSafe;

    /// <summary>
    /// A streaming app (OBS) started or stopped. When auto streamer-safe is on, tell every extension (PROTOCOL.md §3.2
    /// <c>streaming {active, app}</c>; it applies the user's "while streaming" level) and ask for "domain" ourselves too.
    /// </summary>
    public void SetStreamingDetected(bool on, string? app = null)
    {
        if (Store.Current.StreamingDetected == on) return;
        var wasActive = StreamingActive;
        _streamingApp = on ? app : null;
        Store.Mutate(s => s with { StreamingDetected = on }, BrowserChange.Privacy);
        Log.Info(on ? (_autoStreamerSafe ? "streaming app detected: streamer-safe applies" : "streaming app detected (auto streamer-safe is off)") : "streaming app closed");
        if (StreamingActive != wasActive) SendStreamingToAll();
        RecomputePrivacy();
    }

    private void SendStreamingToAll()
    {
        foreach (var b in Store.Current.Browsers.Where(b => b.Connected))
            if (SessionFor(b.Key) is { } s) _ = SafeSend(s, Wire.T.Streaming, StreamingData());
    }

    private string? _streamingApp;

    internal JsonObject StreamingData()
    {
        var active = StreamingActive;
        var o = new JsonObject { ["active"] = active };
        if (active && _streamingApp is { Length: > 0 and <= 64 } app) o["app"] = app;
        return o;
    }

    /// <summary>Panic: mute every tab, force "hidden", minimize browser windows (the extension does all three).</summary>
    public async Task PanicAsync()
    {
        Store.Mutate(s => s with { Panic = true }, BrowserChange.Privacy);
        RecomputePrivacy();
        var tasks = Store.Current.Browsers.Where(b => b.Connected).Select(b => Commands.SendAsync(b.Key, Wire.Op.Panic, new JsonObject())).ToList();
        await Task.WhenAll(tasks).ConfigureAwait(false);
        Log.Info($"panic: sent to {tasks.Count} browser(s)");
    }

    public void ReleasePanic()
    {
        if (!Store.Current.Panic) return;
        Store.Mutate(s => s with { Panic = false }, BrowserChange.Privacy);
        RecomputePrivacy();
    }

    /// <summary>The level the deck asks for: panic → hidden; else the stricter of the setting and streaming auto mode.</summary>
    public string ComputeRequestedPrivacy(BrowserSnapshot s) =>
        s.Panic ? Wire.Privacy.Hidden : Wire.Privacy.Stricter(_settingPrivacy, _autoStreamerSafe && s.StreamingDetected ? Wire.Privacy.Domain : Wire.Privacy.Full);

    /// <summary>Sets the deck's privacy setting (the streamer-safe key). Returns the new requested level.</summary>
    public string SetPrivacySetting(string level)
    {
        _settingPrivacy = Wire.Privacy.Normalize(level);
        RecomputePrivacy();
        return RequestedPrivacy;
    }

    public string PrivacySetting => _settingPrivacy;

    /// <summary>
    /// What the keys actually show: the stricter of the deck's request and every connected browser's effective level
    /// (an extension's own setting can be stricter than the deck's, MED 8).
    /// </summary>
    public string EffectivePrivacy(BrowserSnapshot? s = null)
    {
        s ??= Store.Current;
        var level = s.RequestedPrivacy;
        foreach (var b in s.Browsers.Where(b => b.Connected)) level = Wire.Privacy.Stricter(level, b.Privacy);
        return level;
    }

    /// <summary>The level the SMTC lite tier is filtered at: the deck's request and every remembered profile's own floor.</summary>
    public string LiteLevel => Wire.Privacy.Stricter(Store.Current.RequestedPrivacy, _memory.Floor(StreamingActive));

    private void RecomputePrivacy()
    {
        try { RecomputeRequested(); }
        finally { RefreshLite(); }
    }

    private void RecomputeRequested()
    {
        var before = Store.Current.RequestedPrivacy;
        var level = ComputeRequestedPrivacy(Store.Current);
        if (level == before) return;
        var stricter = Wire.Privacy.Rank(level) > Wire.Privacy.Rank(before);
        Store.Mutate(s =>
        {
            var browsers = s.Browsers;
            if (stricter)
                browsers = [.. browsers.Select(b => Wire.Privacy.Rank(b.Privacy) < Wire.Privacy.Rank(level) ? PrivacyFilter.Apply(b, level) : b)];
            return s with { RequestedPrivacy = level, Browsers = browsers };
        }, BrowserChange.Privacy | BrowserChange.All);
        if (stricter) Previews.Clear();
        Log.Info($"browser privacy requested: {level}");
        foreach (var b in Store.Current.Browsers.Where(b => b.Connected))
        {
            var key = b.Key;
            _ = Task.Run(async () =>
            {
                var r = await Commands.SendAsync(key, Wire.Op.PrivacySet, new JsonObject { ["level"] = level }).ConfigureAwait(false);
                if (r.Ok && !stricter && SessionFor(key) is { } s) await SafeSend(s, Wire.T.Resync, new JsonObject()).ConfigureAwait(false);
            });
        }
    }

    private async Task SafeSend(BrowserSession s, string type, JsonObject data)
    {
        try { await s.SendRawAsync(type, data).ConfigureAwait(false); }
        catch (Exception ex) { Log.Debug($"{type} not sent: {ex.GetType().Name}"); }
    }

    /// <summary>
    /// Asks a browser to send an image again (our LRU evicted it): img.get {ids}, batched, at most once per id per 30 s.
    /// It changes nothing in the browser, so it goes straight to the session (also in safe mode).
    /// </summary>
    public void RequestImage(string browserKey, string id)
    {
        var now = Store.NowMs;
        var stamp = browserKey + "|" + id;
        if (_imageAsked.TryGetValue(stamp, out var at) && now - at < 30_000) return;
        _imageAsked[stamp] = now;
        if (_imageAsked.Count > 4096) _imageAsked.Clear();
        var set = _imageWanted.GetOrAdd(browserKey, _ => new HashSet<string>(StringComparer.Ordinal));
        bool first;
        lock (set) { first = set.Count == 0; set.Add(id); }
        if (!first) return;
        _ = Task.Run(() => DrainImageRequestsAsync(browserKey, set));
    }

    /// <summary>
    /// Sends the wanted ids in batches of 32 (the protocol's cap) until none are left (LOW 17: the rest used to be dropped,
    /// and then throttled for 30 s). Batches are ≥ 250 ms apart (the extension allows img.get 4/s). A batch that fails
    /// forgets its throttle stamps so the next render asks again.
    /// </summary>
    private async Task DrainImageRequestsAsync(string browserKey, HashSet<string> set)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMilliseconds(100), _o.Time, _cts.Token).ConfigureAwait(false);
            while (!_cts.IsCancellationRequested)
            {
                string[] ids;
                lock (set) { ids = [.. set.Take(32)]; foreach (var x in ids) set.Remove(x); }
                if (ids.Length == 0) return;
                if (SessionFor(browserKey) is not { } s)
                {
                    lock (set) set.Clear();
                    foreach (var x in ids) _imageAsked.TryRemove(browserKey + "|" + x, out _);
                    return;
                }
                var r = await s.SendCommandAsync(Wire.Op.ImgGet, new JsonObject { ["ids"] = new JsonArray([.. ids.Select(x => (JsonNode)JsonValue.Create(x)!)]) }).ConfigureAwait(false);
                if (!r.Ok)
                {
                    Log.Debug("img.get failed: " + r.Code);
                    foreach (var x in ids) _imageAsked.TryRemove(browserKey + "|" + x, out _);
                }
                bool more;
                lock (set) more = set.Count > 0;
                if (!more) return;
                await Task.Delay(TimeSpan.FromMilliseconds(250), _o.Time, _cts.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { Log.Debug("img.get batching failed: " + ex.GetType().Name); }
    }

    // ------------------------------------------------------------------ SMTC lite tier

    private void OnSmtcChanged(object? sender, EventArgs e) => RefreshLite();

    /// <summary>
    /// THE choke point for the SMTC lite tier (HIGH 1): the only code that reads the raw Windows media session. What it
    /// stores in <see cref="BrowserSnapshot.Smtc"/> is already filtered at <see cref="LiteLevel"/> (the deck's request,
    /// panic, streaming, and every remembered profile's own level and always-hidden sites); the thumbnail is stored and
    /// referenced only at <c>full</c>. It re-runs on every SMTC change and every privacy change, so tightening the level
    /// replaces what keys can see at once. Keys use it only while no browser is known at all (not during a reconnect).
    /// </summary>
    private void RefreshLite()
    {
        lock (_liteGate)
        {
            var cur = _o.Smtc.Current;
            var level = LiteLevel;
            SmtcMedia? media = null;
            if (cur is not null && (cur.Title is not null || cur.State != "none"))
            {
                string? thumbId = null;
                if (Wire.Privacy.Rank(level) == 0 && cur.Thumbnail is { } bytes && cur.ThumbnailHash is { } hash)
                {
                    thumbId = "art:smtc-" + hash;
                    if (!Images.Contains(thumbId) && PrismControl.Core.Render.ImageInfo.Probe(bytes) is { } info)
                    {
                        if (bytes.Length > Wire.Limits.ArtMaxBytes)
                        {
                            // Downscale off the event thread, then publish, unless privacy tightened meanwhile.
                            var id = thumbId;
                            _ = Task.Run(async () =>
                            {
                                var scaled = await _o.Scaler.ScaleAsync(bytes, 288).ConfigureAwait(false);
                                if (scaled is not null && PrismControl.Core.Render.ImageInfo.Probe(scaled) is { } si && scaled.Length <= Wire.Limits.ArtMaxBytes * 2
                                    && Wire.Privacy.Rank(LiteLevel) == 0)
                                {
                                    Images.Put(new StoredImage(id, si.Mime, si.Width, si.Height, scaled));
                                    Store.Touch(BrowserChange.Smtc);
                                }
                            });
                        }
                        else if (info.Mime is "image/png" or "image/jpeg") Images.Put(new StoredImage(thumbId, info.Mime, info.Width, info.Height, bytes));
                    }
                }
                var raw = new MediaItem
                {
                    Key = "smtc",
                    State = cur.State,
                    Title = cur.Title,
                    Artist = cur.Artist,
                    Album = cur.Album,
                    DurationMs = cur.DurationMs,
                    PositionMs = cur.PositionMs,
                    PositionAt = cur.PositionAt?.ToUnixTimeMilliseconds(),
                    Rate = cur.Rate,
                    Source = "smtc",
                    Art = thumbId is null ? null : new MediaArt(null, thumbId),
                };
                media = new SmtcMedia(cur.AppId, cur.Brand, PrivacyFilter.Lite(raw, level), thumbId, level);
            }
            Store.Mutate(s => s.Smtc == media ? s : s with { Smtc = media }, BrowserChange.Smtc);
        }
    }

    // ------------------------------------------------------------------ status

    public HubStatus Status()
    {
        var s = Store.Current;
        return new HubStatus(SafeMode, PlatformAvailable, s.Browsers.Count(b => b.Connected),
            [.. s.Browsers.Where(b => b.Connected).Select(b => $"{b.DisplayName} · extension {b.ExtVersion} · privacy {b.Privacy}")],
            _lastRejection, s.Smtc is not null);
    }

    // ------------------------------------------------------------------ flows used by actions

    /// <summary>
    /// Focus a tab and (optionally) raise its window from a deck press, which is not a Windows input event
    /// (research §3.1): gain foreground rights and AllowSetForegroundWindow(browser pid) first, then tab.focus; if the
    /// window still is not in front, raise it ourselves (matching the window's bounds among the browser's frames).
    /// </summary>
    public async Task<FocusOutcome> FocusTabAsync(string browserKey, int tabId, bool raise, CancellationToken ct = default)
    {
        var b = Store.Current.Find(browserKey);
        if (b is null || !b.Connected) return FocusOutcome.NoBrowser;
        if (!b.Tabs.TryGetValue(tabId, out var tab)) return FocusOutcome.NotFound;
        var args = new JsonObject { ["tabId"] = tabId, ["raise"] = raise };
        if (SafeMode)
        {
            await Commands.SendAsync(browserKey, Wire.Op.TabFocus, args, ct).ConfigureAwait(false);
            return FocusOutcome.SafeMode;
        }
        var elevatedInFront = false;
        if (raise)
        {
            var fg = _o.Foreground.GetForeground();
            elevatedInFront = fg != 0 && _o.Input.TargetIsElevated(fg) && _o.Windows.ProcessIdOf(fg) != b.Pid;
            if (!elevatedInFront && b.Pid > 0)
            {
                try { await _o.Foreground.GrantForegroundAsync(b.Pid, ct).ConfigureAwait(false); }
                catch (Exception ex) { Log.Debug("foreground grant failed: " + ex.GetType().Name); }
            }
        }
        var r = await Commands.SendAsync(browserKey, Wire.Op.TabFocus, args, ct).ConfigureAwait(false);
        if (!r.Ok) return r.Code switch
        {
            Wire.Err.NotFound => FocusOutcome.NotFound,
            Wire.Err.NoBrowser or Wire.Err.Disconnected => FocusOutcome.NoBrowser,
            _ => FocusOutcome.Failed,
        };
        if (!raise) return FocusOutcome.Switched;
        if (elevatedInFront) return FocusOutcome.Elevated;
        if (r.Data is { } d && WireParser.Bool(d, "focused") == true) return FocusOutcome.Focused;

        // The extension could not confirm focus within its 300 ms wait: raise the frame ourselves.
        var now = Store.Current.Find(browserKey) ?? b;
        var win = now.Windows.GetValueOrDefault(tab.WindowId);
        var bounds = r.Data?["bounds"] as JsonObject;
        var target = bounds is not null
            ? new Bounds(WireParser.Int(bounds, "left") ?? 0, WireParser.Int(bounds, "top") ?? 0, WireParser.Int(bounds, "width") ?? 0, WireParser.Int(bounds, "height") ?? 0)
            : new Bounds(win?.Left ?? 0, win?.Top ?? 0, win?.Width ?? 0, win?.Height ?? 0);
        var hwnd = PickFrame(now, tab.WindowId, target, now.Tabs.GetValueOrDefault(tabId)?.Title ?? tab.Title, _o.Windows.WindowsOf(b.Pid));
        if (hwnd == 0) return FocusOutcome.Refused;
        var raised = await _o.Foreground.BringToFrontAsync(hwnd, ct).ConfigureAwait(false);
        return raised switch
        {
            RaiseResult.Focused or RaiseResult.AlreadyFocused or RaiseResult.Restored => FocusOutcome.Focused,
            RaiseResult.Elevated => FocusOutcome.Elevated,
            RaiseResult.SafeMode => FocusOutcome.SafeMode,
            _ => FocusOutcome.Refused,
        };
    }

    internal readonly record struct Bounds(int Left, int Top, int Width, int Height);

    /// <summary>Display scale factors Windows offers: Chrome reports window bounds in DIPs, DWM in physical pixels (LOW 13).</summary>
    private static readonly double[] Scales = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5];

    /// <summary>How far a frame is from a browser window's bounds, at the best-fitting display scale (size weighs more than
    /// position, because Chrome's DIP origin on a second monitor is not a plain multiple).</summary>
    private static double Distance(TopWindow f, Bounds w)
    {
        if (w.Width <= 0 || w.Height <= 0) return double.MaxValue;
        var best = double.MaxValue;
        foreach (var s in Scales)
        {
            var d = Math.Abs(f.Width - w.Width * s) + Math.Abs(f.Height - w.Height * s) + (Math.Abs(f.Left - w.Left * s) + Math.Abs(f.Top - w.Top * s)) / 2;
            if (d < best) best = d;
        }
        return best;
    }

    /// <summary>
    /// The browser frame that shows <paramref name="windowId"/> (R3): the nearest bounds at any display scale; frames that
    /// tie (two maximized windows) are told apart by the frame title (it starts with the active tab's title, known at
    /// level full only), else by activation order: Windows lists a process's frames front-first in the order they were
    /// activated, and the extension reports which window had the focus when.
    /// </summary>
    internal static nint PickFrame(BrowserInstance b, int windowId, Bounds target, string? activeTitle, IReadOnlyList<TopWindow> frames)
    {
        const double Tie = 12;
        var visible = frames.Where(f => !f.Minimized).ToList();
        if (visible.Count == 0) visible = [.. frames];
        if (visible.Count == 0) return 0;
        var scored = visible.Select(f => (Frame: f, D: Distance(f, target))).ToList();
        var bestD = scored.Min(x => x.D);
        var tied = scored.Where(x => x.D <= bestD + Tie).Select(x => x.Frame).ToList();   // z-order kept (front first)
        if (tied.Count == 1) return tied[0].Hwnd;
        if (activeTitle is { Length: > 0 })
        {
            var byTitle = tied.Where(f => f.Title is { } t && t.StartsWith(activeTitle, StringComparison.Ordinal)).ToList();
            if (byTitle.Count == 1) return byTitle[0].Hwnd;
        }
        // Browser windows whose bounds tie with the target's, most recently focused first; the target's rank among them is
        // its frame's rank among the tied frames.
        var twins = b.Windows.Values
            .Where(w => w.Id == windowId || (w.State != "minimized" && Math.Abs(w.Left - target.Left) + Math.Abs(w.Top - target.Top) + Math.Abs(w.Width - target.Width) + Math.Abs(w.Height - target.Height) <= Tie))
            .OrderByDescending(w => w.Id == b.FocusedWindowId ? long.MaxValue : w.Id == b.LastFocusedWindowId ? long.MaxValue - 1 : w.FocusedAt)
            .ThenBy(w => w.Id)
            .Select(w => w.Id).ToList();
        var rank = twins.IndexOf(windowId);
        return tied[Math.Clamp(rank, 0, tied.Count - 1)].Hwnd;
    }

    /// <summary>
    /// Picture-in-picture (research §3.6). Exiting and the no-gesture paths (already in PiP, a Media Session token,
    /// auto-PiP) are the extension's; when it answers gesture_required we raise the tab and send F24, whose keydown
    /// grants user activation to the content script that is armed to call requestPictureInPicture().
    /// </summary>
    public async Task<PipOutcome> TogglePipAsync(string browserKey, MediaItem media, CancellationToken ct = default)
    {
        var b = Store.Current.Find(browserKey);
        if (b is null || !b.Connected) return PipOutcome.NoBrowser;
        if (media.NeedsPermission) return PipOutcome.NeedsPermission;
        if (media.Pip)
        {
            var exit = await Commands.SendAsync(browserKey, Wire.Op.MediaPip, new JsonObject { ["key"] = media.Key, ["mode"] = "exit" }, ct).ConfigureAwait(false);
            return SafeMode ? PipOutcome.SafeMode : exit.Ok ? PipOutcome.Exited : PipOutcome.Failed;
        }
        // 1. The paths that need no gesture: the document is already in PiP, or the page may enter it now.
        var first = await Commands.SendAsync(browserKey, Wire.Op.MediaPip, new JsonObject { ["key"] = media.Key, ["mode"] = "enter" }, ct).ConfigureAwait(false);
        if (SafeMode) return PipOutcome.SafeMode;
        if (first.Ok) return first.Data is { } fd && WireParser.Bool(fd, "pip") == true ? PipOutcome.Entered : PipOutcome.Pending;
        if (first.Code is Wire.Err.NoHostPermission) return PipOutcome.NeedsPermission;
        if (first.Code is Wire.Err.Unsupported or Wire.Err.NotFound) return PipOutcome.Unsupported;
        if (first.Code != Wire.Err.GestureRequired) return PipOutcome.Failed;

        // 2. A real key press grants user activation: arm the frame's one-shot listener for the PiP key (3 s), bring the
        //    tab to the front, press the key. UIPI drops our input while an elevated window is in front, so check that
        //    first. The key is a GLOBAL keystroke (MED 6): if another app registered it as a hotkey, refuse instead of
        //    firing that app's hotkey ("F24 IN USE"; the key is configurable).
        var fg = _o.Foreground.GetForeground();
        if (fg != 0 && _o.Input.TargetIsElevated(fg)) return PipOutcome.Elevated;
        var keyName = _pipKey;
        var vk = Wire.PipKeys.Vk(keyName) ?? VirtualKeys.F24;
        if (await _o.Input.IsGlobalKeyFreeAsync(vk, ct).ConfigureAwait(false) == false)
        {
            Log.Info($"picture-in-picture: {keyName} is registered by another app as a global hotkey; not pressed (pick another key in the browser settings)");
            return PipOutcome.KeyInUse;
        }
        var arm = await Commands.SendAsync(browserKey, Wire.Op.MediaPip, new JsonObject { ["key"] = media.Key, ["mode"] = "enter", ["via"] = "gesture", ["pipKey"] = keyName }, ct).ConfigureAwait(false);
        if (!arm.Ok) return arm.Code == Wire.Err.NoHostPermission ? PipOutcome.NeedsPermission : PipOutcome.Failed;
        if (arm.Data is not { } ad || WireParser.Bool(ad, "armed") != true) return PipOutcome.Failed;
        // An older extension arms F24 whatever we ask: press the key it says it armed.
        if (WireParser.Str(ad, "key", 8, clean: false) is { } armedKey && Wire.PipKeys.Vk(armedKey) is { } armedVk && armedVk != vk)
        {
            if (await _o.Input.IsGlobalKeyFreeAsync(armedVk, ct).ConfigureAwait(false) == false) return PipOutcome.KeyInUse;
            vk = armedVk;
        }
        var focus = await FocusTabAsync(browserKey, media.TabId, raise: true, ct).ConfigureAwait(false);
        if (focus is FocusOutcome.Elevated) return PipOutcome.Elevated;
        if (focus is not (FocusOutcome.Focused or FocusOutcome.Switched)) return PipOutcome.Failed;
        var frame = FramePrefix(media.Key);
        var outcome = WaitForEventAsync(browserKey, e => e.Kind is "pipChanged" or "gesture.needed" && (WireParser.Str(e.Data, "key", 40, clean: false) is not { } k || k == frame),
            TimeSpan.FromSeconds(2), ct);
        var sent = await _o.Input.SendKeyAsync(vk, ct).ConfigureAwait(false);
        if (!sent) return PipOutcome.Failed;
        var e = await outcome.ConfigureAwait(false);
        return e is null ? PipOutcome.Pending : e.Kind == "pipChanged" && WireParser.Bool(e.Data, "ok") != false ? PipOutcome.Entered : PipOutcome.Failed;
    }

    /// <summary>"tab:frame" of a media key "tab:frame[:n]" (what the extension's pip events carry).</summary>
    public static string FramePrefix(string mediaKey)
    {
        var parts = mediaKey.Split(':');
        return parts.Length >= 2 ? parts[0] + ":" + parts[1] : mediaKey;
    }

    /// <summary>The first matching browser event, or null after the timeout. Never blocks a thread.</summary>
    public async Task<BrowserEvent?> WaitForEventAsync(string browserKey, Func<BrowserEvent, bool> match, TimeSpan timeout, CancellationToken ct = default)
    {
        var tcs = new TaskCompletionSource<BrowserEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        void Handler(BrowserEvent e)
        {
            if (e.BrowserKey == browserKey && match(e)) tcs.TrySetResult(e);
        }
        EventReceived += Handler;
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var delay = Task.Delay(timeout, _o.Time, cts.Token);
            var done = await Task.WhenAny(tcs.Task, delay).ConfigureAwait(false);
            cts.Cancel();
            return done == tcs.Task ? await tcs.Task.ConfigureAwait(false) : null;
        }
        catch (OperationCanceledException) { return null; }
        finally { EventReceived -= Handler; }
    }

    /// <summary>
    /// The scroll fallback for sites without host access: arrow keys, but only while that browser is the foreground
    /// window (never into another app) and not elevated. At most 12 keys per call.
    /// </summary>
    public async Task<bool> ScrollWithKeysAsync(string browserKey, int lines, CancellationToken ct = default)
    {
        var b = Store.Current.Find(browserKey);
        if (b is null || !b.Connected || lines == 0) return false;
        if (SafeMode)
        {
            Log.Info($"[safe mode] would press {(lines > 0 ? "down" : "up")} {Math.Min(Math.Abs(lines), 12)} time(s) to scroll");
            return true;
        }
        var fg = _o.Foreground.GetForeground();
        if (fg == 0 || _o.Windows.ProcessIdOf(fg) != b.Pid || _o.Input.TargetIsElevated(fg)) return false;
        var vk = (ushort)(lines > 0 ? 0x28 : 0x26);   // VK_DOWN / VK_UP
        for (var i = 0; i < Math.Min(Math.Abs(lines), 12); i++)
            if (!await _o.Input.SendKeyAsync(vk, ct).ConfigureAwait(false)) return false;
        return true;
    }

    /// <summary>Executables, scripts, shortcuts and installers need a second press within 3 s (the Macros trust rule).</summary>
    public static bool NeedsConfirmation(string? fileName)
    {
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        return ext.Length == 0 || ConfirmExtensions.Contains(ext);
    }

    /// <summary>
    /// File types that run code, install something, change settings or open a remote session when opened (the Macros
    /// trust rule): programs and installers, scripts, shortcuts, help files, certificates, themes and the like (LOW 16
    /// added .msp .mst .rdp .jnlp .chm .appinstaller .diagcab .theme .cer and .website, among others).
    /// </summary>
    private static readonly HashSet<string> ConfirmExtensions = new(StringComparer.Ordinal)
    {
        ".exe", ".com", ".pif", ".scr", ".cpl", ".msc", ".dll", ".ocx", ".sys", ".drv",
        ".msi", ".msp", ".mst", ".msix", ".msixbundle", ".appx", ".appxbundle", ".appinstaller", ".application", ".appref-ms", ".xbap",
        ".bat", ".cmd", ".ps1", ".psm1", ".psd1", ".ps1xml", ".ps2", ".ps2xml", ".psc1", ".psc2", ".vb", ".vbs", ".vbe", ".js", ".jse",
        ".wsf", ".wsh", ".ws", ".wsc", ".sct", ".hta", ".msh", ".msh1", ".msh2", ".mshxml", ".msh1xml", ".msh2xml",
        ".lnk", ".url", ".website", ".scf", ".shb", ".shs", ".library-ms", ".search-ms", ".searchconnector-ms", ".settingcontent-ms",
        ".reg", ".inf", ".ins", ".isp", ".jar", ".jnlp", ".py", ".pyw", ".pyz",
        ".chm", ".hlp", ".rdp", ".diagcab", ".diagcfg", ".diagpkg", ".theme", ".themepack", ".deskthemepack",
        ".cer", ".crt", ".der", ".p7b", ".p7c", ".pfx", ".p12", ".sst", ".stl",
        ".iso", ".img", ".vhd", ".vhdx", ".cab", ".gadget", ".xll", ".ade", ".adp", ".mde", ".mdb", ".accde",
    };

    /// <summary>A path we will hand to the shell: absolute, local (no UNC / device path), no ".." segment.</summary>
    internal static bool IsSafeLocalPath([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] string? path)
    {
        if (string.IsNullOrEmpty(path) || !Path.IsPathFullyQualified(path)) return false;
        if (path.StartsWith(@"\\", StringComparison.Ordinal) || path.StartsWith("//", StringComparison.Ordinal)) return false;
        foreach (var segment in path.Split('\\', '/'))
            if (segment is "." or "..") return false;
        try { return string.Equals(Path.GetFullPath(path), path, StringComparison.OrdinalIgnoreCase); }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException) { return false; }
    }

    /// <summary>
    /// Opens a finished download with the shell (Chrome's downloads.open needs a gesture we cannot give). Only when it is
    /// complete and Chrome's danger verdict is safe or accepted; never in safe mode.
    /// </summary>
    public async Task<OpenOutcome> OpenDownloadAsync(string browserKey, DownloadItem d, bool confirmed, CancellationToken ct = default)
    {
        var b = Store.Current.Find(browserKey);
        if (b is null || !b.Connected) return OpenOutcome.NoBrowser;
        if (d.State != "complete") return OpenOutcome.NotReady;
        if (d.Danger is not ("safe" or "accepted")) return OpenOutcome.Dangerous;
        if (SafeMode)
        {
            await Commands.SendAsync(browserKey, Wire.Op.DownloadPath, new JsonObject { ["id"] = d.Id }, ct).ConfigureAwait(false);
            return OpenOutcome.SafeMode;
        }
        var r = await Commands.SendAsync(browserKey, Wire.Op.DownloadPath, new JsonObject { ["id"] = d.Id }, ct).ConfigureAwait(false);
        if (!r.Ok) return r.Code switch
        {
            Wire.Err.PrivacyBlocked => OpenOutcome.PrivacyBlocked,
            Wire.Err.NoPermission => OpenOutcome.NoPermission,
            _ => OpenOutcome.Failed,
        };
        // The answer is fresher than our copy of the download (LOW 16): its state, existence and danger verdict decide.
        var data = r.Data;
        var path = data is null ? null : WireParser.Str(data, "path", 1024, clean: false);
        if (data is not null && WireParser.Str(data, "state", 16, clean: false) is { } state && state != "complete") return OpenOutcome.NotReady;
        if (data is not null && WireParser.Bool(data, "exists") == false) return OpenOutcome.NotReady;
        if (data is not null && WireParser.Str(data, "danger", 32, clean: false) is { } danger && danger is not ("safe" or "accepted")) return OpenOutcome.Dangerous;
        if (!IsSafeLocalPath(path)) return OpenOutcome.Failed;
        if (!File.Exists(path)) return OpenOutcome.NotReady;
        if (NeedsConfirmation(path) && !confirmed) return OpenOutcome.ConfirmNeeded;
        return _o.Shell?.Open(path) == true ? OpenOutcome.Opened : OpenOutcome.Failed;
    }
}

/// <summary>Global settings section "browser" (no secrets; travels with the app's global settings).</summary>
public sealed class BrowserGlobalSettings
{
    public const string Section = "browser";
    /// <summary>full, domain or hidden: what the deck asks every extension for.</summary>
    public string Privacy { get; set; } = Wire.Privacy.Full;
    /// <summary>Switch to "domain" while OBS runs.</summary>
    public bool AutoStreamerSafe { get; set; } = true;
    /// <summary>Fetch https artwork for media keys (SSRF-guarded; skipped when Windows has a proxy for that URL).</summary>
    public bool FetchArt { get; set; } = true;
    /// <summary>The real key the picture-in-picture flow presses: F13–F24 (default F24). A global keystroke: pick one no other app uses.</summary>
    public string PipKey { get; set; } = Wire.PipKeys.Default;
}
