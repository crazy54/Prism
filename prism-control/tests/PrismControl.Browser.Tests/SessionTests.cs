using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>A hub fed through in-memory connections (the session logic without a pipe).</summary>
public sealed class SessionRig : IAsyncDisposable
{
    public BrowserHub Hub { get; }
    public RecordingLog Log { get; } = new();
    public List<Task> Runs { get; } = [];

    public SessionRig(TimeProvider? time = null, bool safeMode = false, IRelayVerifier? verifier = null)
    {
        Hub = new BrowserHub(new BrowserHubOptions { Log = Log, Time = time ?? TimeProvider.System, SafeMode = safeMode, Verifier = verifier ?? AcceptAnyRelay.Instance, LostGrace = TimeSpan.FromMilliseconds(200) });
        Hub.TestToken = "test-token-0123";
        Hub.Start(new NullEndpoint());
    }

    /// <summary>Connects a fake browser: preamble (unless pre-authenticated), hello, and reads the welcome.</summary>
    public async Task<MemoryConnection> ConnectAsync(string uid = "p1", string exe = "chrome.exe", string privacy = "full", bool authenticated = false, bool full = true, JsonObject? hello = null)
    {
        var conn = new MemoryConnection(authenticated ? Strip(Fx.Preamble(null, exe: exe)) : null);
        Runs.Add(Hub.AcceptAsync(conn));
        if (!authenticated) conn.Send(Fx.Preamble("test-token-0123", exe: exe));
        conn.Send(hello ?? Fx.Hello(uid, privacy: privacy));
        var welcome = await conn.NextAsync();
        Assert.Equal("welcome", welcome["t"]!.GetValue<string>());
        if (full)
        {
            foreach (var img in Fx.StandardImages()) conn.Send(img);
            conn.Send(Fx.StateFull(privacy));
            await WaitAsync(() => Hub.Store.Current.Browsers.Any(b => b.ProfileUid == uid && b.Synced));
        }
        return conn;
    }

    private static JsonObject Strip(JsonObject o) { o.Remove("token"); return o; }

    public static async Task WaitAsync(Func<bool> cond, int ms = 3000, Func<string>? why = null)
    {
        var until = Environment.TickCount64 + ms;
        while (!cond())
        {
            if (Environment.TickCount64 > until) throw new AssertException("timed out waiting for a condition" + (why is null ? "" : ": " + why()));
            await Task.Delay(5);
        }
    }

    /// <summary>Answers the next cmd frame on <paramref name="conn"/> with ok + data.</summary>
    public static async Task<JsonObject> AnswerAsync(MemoryConnection conn, JsonObject? data = null, bool ok = true, string? code = null)
    {
        JsonObject cmd;
        do cmd = await conn.NextAsync(); while (cmd["t"]!.GetValue<string>() != "cmd");
        var id = cmd["id"]!.GetValue<int>();
        var r = new JsonObject { ["v"] = 1, ["t"] = "result", ["id"] = id, ["ok"] = ok };
        if (ok) r["data"] = data ?? new JsonObject();
        else r["error"] = new JsonObject { ["code"] = code ?? "busy", ["message"] = "fixture" };
        conn.Send(r);
        return cmd;
    }

    public async ValueTask DisposeAsync()
    {
        await Hub.DisposeAsync();
        try { await Task.WhenAll(Runs).WaitAsync(TimeSpan.FromSeconds(2)); } catch (Exception) { }
    }
}

public class SessionTests
{
    [Test]
    public async Task Hello_welcome_snapshot_and_deltas_build_the_store()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.Equal("Chrome", b.Brand, "the relay's exe is authoritative");
        Assert.Equal(5, b.Tabs.Count);
        Assert.Equal(1, b.FocusedWindowId);
        Assert.True(b.Tabs[12].Active);
        Assert.True(rig.Hub.Images.Contains("fav:" + Fx.Hash(Fx.FavRed)), "images arrive before the snapshot that references them");

        conn.Send(Fx.Envelope("tabs.delta", new JsonObject
        {
            ["upsert"] = new JsonArray(new JsonObject { ["id"] = 11, ["title"] = "Inbox (4) - Example Mail", ["unread"] = 4 }, Fx.Tab(15, 1, 4, "New Tab Example", "start.example")),
            ["remove"] = new JsonArray(14),
            ["activeByWindow"] = new JsonObject { ["1"] = 15 },
            ["focusedWindow"] = -1,
        }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.ContainsKey(15), why: () => rig.Log.All);
        b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.Equal(4, b.Tabs[11].Unread);
        Assert.Equal("mail.example", b.Tabs[11].Domain, "unchanged fields survive a partial upsert");
        Assert.False(b.Tabs.ContainsKey(14));
        Assert.True(b.Tabs[15].Active);
        Assert.False(b.Tabs[12].Active);
        Assert.Null(b.FocusedWindowId, "focusedWindow -1 = the browser lost focus");
        Assert.Equal(1, b.LastFocusedWindowId);

        conn.Send(Fx.Envelope("media.update", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["key"] = "12:0", ["state"] = "paused" }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Media["12:0"].State == "paused");
        Assert.Equal("Night Drive", rig.Hub.Store.Current.Find("chrome:p1")!.Media["12:0"].Title);

        conn.Send(Fx.Envelope("downloads.update", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 501, ["bytes"] = 9_000_000 }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Downloads[501].Bytes == 9_000_000);
        Assert.Near(0.9, rig.Hub.Store.Current.Find("chrome:p1")!.Downloads[501].Fraction!.Value, 0.001);
    }

    [Test]
    public async Task Welcome_carries_protocol_privacy_streaming_and_wants()
    {
        await using var rig = new SessionRig();
        rig.Hub.SetStreamingDetected(true, "obs64.exe");
        var conn = new MemoryConnection();
        rig.Runs.Add(rig.Hub.AcceptAsync(conn));
        conn.Send(Fx.Preamble("test-token-0123"));
        conn.Send(Fx.Hello());
        var w = await conn.NextAsync();
        Assert.Equal(1, w["v"]!.GetValue<int>());
        var d = w["data"]!.AsObject();
        Assert.Equal(1, d["proto"]!.GetValue<int>());
        Assert.Equal("domain", d["privacy"]!.GetValue<string>(), "auto streamer-safe asks for domain while OBS runs");
        Assert.True(d["streaming"]!.GetValue<bool>());
        Assert.Equal(32, d["want"]!["faviconPx"]!.GetValue<int>());
    }

    [Test]
    public async Task Wrong_token_wrong_origin_and_mismatched_extension_are_refused()
    {
        await using var rig = new SessionRig();
        var bad = new MemoryConnection();
        var run = rig.Hub.AcceptAsync(bad);
        bad.Send(Fx.Preamble("wrong-token"));
        await run.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(bad.Disposed, "closed");
        Assert.Equal("BadToken", rig.Hub.LastRejection);

        var other = new MemoryConnection();
        run = rig.Hub.AcceptAsync(other);
        other.Send(Fx.Preamble("test-token-0123", origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"));
        await run.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal("BadOrigin", rig.Hub.LastRejection);

        var spoof = new MemoryConnection();
        run = rig.Hub.AcceptAsync(spoof);
        spoof.Send(Fx.Preamble("test-token-0123"));
        spoof.Send(Fx.Hello(extId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        await run.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal("ExtensionMismatch", rig.Hub.LastRejection);
        Assert.Empty(rig.Hub.Store.Current.Browsers, "nothing was registered");
        Assert.Equal(3, rig.Hub.Rejections);
    }

    [Test]
    public async Task Relay_identity_check_rejects_other_executables()
    {
        await using var rig = new SessionRig(verifier: new RelayImageVerifier(new RecordingLog()));
        var conn = new MemoryConnection(image: @"C:\Users\Example\Downloads\impostor.exe");
        var run = rig.Hub.AcceptAsync(conn);
        conn.Send(Fx.Preamble("test-token-0123"));
        await run.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal("RelayIdentity", rig.Hub.LastRejection);
    }

    [Test]
    public async Task Preamble_versions_previous_and_current_are_accepted_others_refused()
    {
        await using var rig = new SessionRig();
        var future = new MemoryConnection();
        var run = rig.Hub.AcceptAsync(future);
        future.Send(Fx.Preamble("test-token-0123", v: Wire.RelayPreamble + 1));
        await run.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal("NoPreamble", rig.Hub.LastRejection);
        var ok = new MemoryConnection();
        rig.Runs.Add(rig.Hub.AcceptAsync(ok));
        ok.Send(Fx.Preamble("test-token-0123", v: Wire.RelayPreambleMin));
        ok.Send(Fx.Hello());
        Assert.Equal("welcome", (await ok.NextAsync())["t"]!.GetValue<string>());
    }

    [Test]
    public async Task Pre_authenticated_preambles_from_the_desktop_endpoint_skip_the_token()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync(authenticated: true);
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected);
        _ = conn;
    }

    [Test]
    public async Task Protocol_mismatch_answers_welcome_and_registers_nothing()
    {
        await using var rig = new SessionRig();
        var conn = new MemoryConnection();
        var run = rig.Hub.AcceptAsync(conn);
        conn.Send(Fx.Preamble("test-token-0123"));
        var hello = Fx.Hello();
        hello["data"]!["proto"] = 2;
        conn.Send(hello);
        var w = await conn.NextAsync();
        Assert.Equal(1, w["data"]!["proto"]!.GetValue<int>(), "the extension shows Update needed");
        await SessionRig.WaitAsync(() => rig.Hub.LastRejection == "ProtocolMismatch");
        conn.Send(Fx.StateFull());
        await Task.Delay(50);
        Assert.Empty(rig.Hub.Store.Current.Browsers);
        Assert.False(conn.Disposed, "the pipe stays open and quiet (no reconnect loop)");
        conn.Eof();
        await run.WaitAsync(TimeSpan.FromSeconds(3));
    }

    [Test]
    public async Task Malformed_and_hostile_frames_are_dropped_not_fatal()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        conn.Send(JsonValue.Create("just a string")!);
        conn.Send(new JsonObject { ["t"] = "tabs.delta" });                       // no v
        conn.Send(Fx.Envelope("tabs.delta", null));                              // no upsert
        conn.Send(Fx.Envelope("weird.type", new JsonObject()));
        JsonNode deep = new JsonObject(); var cur = (JsonObject)deep;
        for (var i = 0; i < 30; i++) { var n = new JsonObject(); cur["d"] = n; cur = n; }
        conn.Send(Fx.Envelope("tabs.delta", (JsonObject)deep));
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = "11", ["title"] = 5 }), ["remove"] = new JsonArray("x") }));
        conn.Send(Fx.Envelope("img", new JsonObject { ["id"] = "fav:zz", ["b64"] = "not base64" }));
        // still alive: a valid delta applies
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 13, ["unread"] = 9 }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[13].Unread == 9);
        Assert.Equal(5, rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.Count);
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected);
    }

    [Test]
    public async Task Commands_round_trip_and_time_out()
    {
        var time = new ManualTimeProvider();
        await using var rig = new SessionRig(time);
        var conn = await rig.ConnectAsync();
        var session = rig.Hub.SessionFor("chrome:p1")!;
        var pending = session.SendCommandAsync(Wire.Op.TabFocus, new JsonObject { ["tabId"] = 13 });
        var cmd = await SessionRig.AnswerAsync(conn, new JsonObject { ["tabId"] = 13, ["focused"] = true });
        Assert.Equal("tab.focus", cmd["op"]!.GetValue<string>());
        Assert.Equal(13, cmd["args"]!["tabId"]!.GetValue<int>());
        var r = await pending;
        Assert.True(r.Ok);
        Assert.Equal(true, r.Data!["focused"]!.GetValue<bool>());

        var timeout = session.SendCommandAsync(Wire.Op.TabReload, new JsonObject { ["tabId"] = 13 });
        await conn.NextAsync();
        time.Advance(TimeSpan.FromSeconds(3));
        var tr = await timeout.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(tr.Ok);
        Assert.Equal(Wire.Err.Timeout, tr.Code);

        var err = session.SendCommandAsync(Wire.Op.MediaSeek, new JsonObject { ["key"] = "12:0", ["deltaMs"] = 5000 });
        await SessionRig.AnswerAsync(conn, ok: false, code: "no_host_permission");
        Assert.Equal("no_host_permission", (await err).Code);
    }

    [Test]
    public async Task Commands_are_rate_limited_locally_at_60_per_second()
    {
        var time = new ManualTimeProvider();
        await using var rig = new SessionRig(time);
        var conn = await rig.ConnectAsync();
        var session = rig.Hub.SessionFor("chrome:p1")!;
        var tasks = Enumerable.Range(0, 70).Select(_ => session.SendCommandAsync(Wire.Op.TabReload, new JsonObject { ["tabId"] = 13 })).ToList();
        await Task.Delay(50);
        var limited = tasks.Count(t => t.IsCompleted && t.Result.Code == Wire.Err.RateLimited);
        Assert.Equal(10, limited);
        time.Advance(TimeSpan.FromSeconds(3));   // the rest time out; nothing hangs
        await Task.WhenAll(tasks).WaitAsync(TimeSpan.FromSeconds(3));
        _ = conn;
    }

    [Test]
    public async Task Disconnect_marks_the_browser_lost_then_removes_it_and_fails_pending_commands()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        var session = rig.Hub.SessionFor("chrome:p1")!;
        var pending = session.SendCommandAsync(Wire.Op.TabReload, new JsonObject { ["tabId"] = 13 });
        await conn.NextAsync();
        conn.Eof();
        var r = await pending.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(Wire.Err.Disconnected, r.Code);
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1") is { Connected: false });
        Assert.Equal(5, rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.Count, "tabs stay (dimmed) during the grace period");
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1") is null, 3000);
    }

    [Test]
    public async Task Reconnect_replaces_the_lost_session_and_old_frames_are_ignored()
    {
        await using var rig = new SessionRig();
        var first = await rig.ConnectAsync();
        var firstSession = rig.Hub.Store.Current.Find("chrome:p1")!.SessionId;
        var second = await rig.ConnectAsync();
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.NotEqual(firstSession, b.SessionId);
        first.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 13, ["unread"] = 77 }), ["remove"] = new JsonArray() }));
        second.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 13, ["unread"] = 5 }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[13].Unread == 5);
        await Task.Delay(50);
        Assert.Equal(5, rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[13].Unread, "the replaced session's frames are ignored");
        first.Eof();
        await Task.Delay(100);
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected, "the old session ending does not drop the new one");
    }

    [Test]
    public async Task A_repeated_hello_restarts_the_session_with_a_fresh_welcome()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        Assert.Equal(5, rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.Count);
        conn.Send(Fx.Hello(privacy: "domain"));
        var w = await conn.NextAsync();
        Assert.Equal("welcome", w["t"]!.GetValue<string>());
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Synced == false);
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        // LOW 20: keys are not blanked while the new snapshot is on its way; what is kept is re-filtered at the new level.
        Assert.Equal(5, b.Tabs.Count, "what we held stays until the new state.full replaces it");
        Assert.Equal("domain", b.Privacy);
        Assert.True(b.Tabs.Values.All(t => t.Title is null), "kept tabs are filtered at the (stricter) new level");
        var replacement = Fx.StateFull("domain");
        replacement["data"]!["tabs"] = new JsonArray(Fx.Tab(31, 1, 0, "Replacement Example", "new.example", active: true));
        conn.Send(replacement);
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.Count == 1);
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Synced);
    }

    [Test]
    public async Task A_hello_without_a_profile_uid_is_ignored_until_a_proper_one_arrives()
    {
        // MED 10: an extension that hasn't loaded its settings yet must not open a session with default privacy.
        await using var rig = new SessionRig();
        var conn = new MemoryConnection();
        rig.Runs.Add(rig.Hub.AcceptAsync(conn));
        conn.Send(Fx.Preamble("test-token-0123"));
        var early = Fx.Hello(uid: "");
        early["data"]!["privacy"] = "full";
        conn.Send(early);
        var missing = Fx.Hello();
        missing["data"]!["profile"]!.AsObject().Remove("uid");
        conn.Send(missing);
        await Task.Delay(100);
        Assert.False(conn.TryNext(out _), "no welcome for a hello without a uid");
        Assert.Empty(rig.Hub.Store.Current.Browsers);
        conn.Send(Fx.Hello("p9", privacy: "hidden"));
        var w = await conn.NextAsync();
        Assert.Equal("welcome", w["t"]!.GetValue<string>());
        Assert.Equal("hidden", rig.Hub.Store.Current.Find("chrome:p9")!.Privacy);
    }

    [Test]
    public async Task Two_browsers_at_once_keep_separate_state_and_auto_follows_focus()
    {
        await using var rig = new SessionRig();
        var chrome = await rig.ConnectAsync("p1", "chrome.exe");
        var edge = await rig.ConnectAsync("p2", "msedge.exe");
        var s = rig.Hub.Store.Current;
        Assert.Equal(2, s.Browsers.Length);
        Assert.Equal("Edge", s.Find("msedge:p2")!.Brand);
        Assert.Equal("Chrome", s.Target("chrome")!.Brand);
        Assert.Equal("Edge", s.Target("edge")!.Brand);
        chrome.Send(Fx.Envelope("event", new JsonObject { ["kind"] = "focusChanged", ["windowId"] = 2 }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Target("auto")!.Brand == "Chrome");
        edge.Send(Fx.Envelope("event", new JsonObject { ["kind"] = "focusChanged", ["windowId"] = 1 }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Target("auto")!.Brand == "Edge");
        Assert.Equal(2, rig.Hub.Store.Current.Find("chrome:p1")!.FocusedWindowId);
    }

    [Test]
    public async Task Snapshots_split_by_the_extension_continue_as_deltas()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync(full: false);
        var head = Fx.StateFull();
        var tabs = head["data"]!["tabs"]!.AsArray();
        var rest = new JsonArray(tabs.Skip(2).Select(t => t!.DeepClone()).ToArray());
        head["data"]!["tabs"] = new JsonArray(tabs.Take(2).Select(t => t!.DeepClone()).ToArray());
        head["data"]!["more"] = true;
        conn.Send(head);
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = rest, ["remove"] = new JsonArray(), ["more"] = false }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")?.Tabs.Count == 5);
    }

    [Test]
    public async Task Events_update_zoom_caps_and_profile()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        conn.Send(Fx.Envelope("event", new JsonObject { ["kind"] = "zoom", ["tabId"] = 12, ["factor"] = 1.25 }));
        conn.Send(Fx.Envelope("event", new JsonObject { ["kind"] = "permissionRemoved", ["caps"] = new JsonObject { ["downloads"] = false } }));
        conn.Send(Fx.Envelope("event", new JsonObject { ["kind"] = "profile", ["profile"] = new JsonObject { ["uid"] = "p1", ["label"] = "Personal" } }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.ProfileLabel == "Personal");
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.Equal(1.25, b.Tabs[12].Zoom);
        Assert.False(b.Caps.Downloads);
    }

    [Test]
    public async Task Streaming_and_privacy_changes_go_to_every_connected_browser()
    {
        await using var rig = new SessionRig();
        var chrome = await rig.ConnectAsync("p1", "chrome.exe");
        var edge = await rig.ConnectAsync("p2", "msedge.exe");
        chrome.Drain(); edge.Drain();
        rig.Hub.SetStreamingDetected(true, "obs64.exe");
        var frames = new List<JsonObject>();
        await SessionRig.WaitAsync(() => { frames.AddRange(chrome.Drain()); return frames.Any(f => f["t"]!.GetValue<string>() == "streaming") && frames.Any(f => f["op"]?.GetValue<string>() == "privacy.set"); });
        var streaming = frames.First(f => f["t"]!.GetValue<string>() == "streaming");
        Assert.True(streaming["data"]!["active"]!.GetValue<bool>());
        Assert.Equal("obs64.exe", streaming["data"]!["app"]!.GetValue<string>());
        Assert.Equal("domain", frames.First(f => f["op"]?.GetValue<string>() == "privacy.set")["args"]!["level"]!.GetValue<string>());
        await SessionRig.WaitAsync(() => edge.Drain().Any(f => f["t"]!.GetValue<string>() == "streaming"));
        Assert.Null(rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[12].Title, "titles already held are dropped at once when the level tightens");
    }
}
