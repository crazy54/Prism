using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Render;
using PrismControl.Core.Devices;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>
/// A stand-in for prism-relay.exe inside this test process: reads the discovery file, connects to the real per-user
/// pipe with CurrentUserOnly, and speaks the u32-LE framing. Nothing outside this process is involved.
/// </summary>
public sealed class FakeRelayClient : IAsyncDisposable
{
    private readonly NamedPipeClientStream _pipe;
    public string Token { get; }

    private FakeRelayClient(NamedPipeClientStream pipe, string token) { _pipe = pipe; Token = token; }

    public static async Task<FakeRelayClient> ConnectAsync(string discoveryFile)
    {
        var o = JsonNode.Parse(await File.ReadAllTextAsync(discoveryFile))!.AsObject();
        var pipe = new NamedPipeClientStream(".", o["pipe"]!.GetValue<string>(), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync(2000);
        return new FakeRelayClient(pipe, o["token"]!.GetValue<string>());
    }

    public Task SendAsync(JsonNode frame) => SendRawAsync(Encoding.UTF8.GetBytes(frame.ToJsonString()));

    public async Task SendRawAsync(byte[] body)
    {
        var len = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(len, (uint)body.Length);
        await _pipe.WriteAsync(len);
        await _pipe.WriteAsync(body);
        await _pipe.FlushAsync();
    }

    /// <summary>The next frame, or null at end of stream.</summary>
    public async Task<JsonObject?> ReadAsync(int timeoutMs = 4000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        var len = new byte[4];
        if (!await ReadExactly(len, cts.Token)) return null;
        var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(len)];
        if (!await ReadExactly(body, cts.Token)) return null;
        return JsonNode.Parse(body)!.AsObject();
    }

    /// <summary>Reads frames until one of type <paramref name="t"/> (null if the pipe closed first).</summary>
    public async Task<JsonObject?> ReadUntilAsync(string t, int timeoutMs = 4000)
    {
        var until = Environment.TickCount64 + timeoutMs;
        while (Environment.TickCount64 < until)
        {
            var f = await ReadAsync((int)Math.Max(100, until - Environment.TickCount64));
            if (f is null) return null;
            if (f["t"]?.GetValue<string>() == t) return f;
        }
        throw new AssertException("timed out waiting for " + t);
    }

    private async Task<bool> ReadExactly(byte[] buf, CancellationToken ct)
    {
        var got = 0;
        while (got < buf.Length)
        {
            var n = await _pipe.ReadAsync(buf.AsMemory(got), ct);
            if (n == 0) return false;
            got += n;
        }
        return true;
    }

    /// <summary>True when the server closed the pipe (end of stream within the timeout).</summary>
    public async Task<bool> ClosedAsync(int timeoutMs = 3000)
    {
        try { return await ReadAsync(timeoutMs) is null; }
        catch (IOException) { return true; }
        catch (OperationCanceledException) { return false; }
    }

    public async ValueTask DisposeAsync() => await _pipe.DisposeAsync();
}

/// <summary>A hub on a real Desktop PipeEndpoint, with its discovery file in a temp folder.</summary>
public sealed class PipeRig : IAsyncDisposable
{
    public required BrowserHub Hub { get; init; }
    public required DesktopFrameEndpoint Endpoint { get; init; }
    public required string Dir { get; init; }
    public required RecordingLog Log { get; init; }
    public string Discovery => Path.Combine(Dir, "ingress.json");

    public static async Task<PipeRig> StartAsync()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-browser-pipe-tests", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        var log = new RecordingLog();
        var hub = new BrowserHub(new BrowserHubOptions { Log = log, Verifier = AcceptAnyRelay.Instance, LostGrace = TimeSpan.FromMilliseconds(300) });
        var ep = await DesktopFrameEndpoint.StartAsync(DesktopFrameEndpoint.Options(Path.Combine(dir, "ingress.json")), log);
        hub.Start(ep);
        return new PipeRig { Hub = hub, Endpoint = ep, Dir = dir, Log = log };
    }

    /// <summary>Connects a fake relay + extension through hello/welcome (+ images and state.full).</summary>
    public async Task<FakeRelayClient> ConnectBrowserAsync(string uid = "p1", string exe = "chrome.exe", string privacy = "full", JsonObject? full = null)
    {
        var c = await FakeRelayClient.ConnectAsync(Discovery);
        await c.SendAsync(Fx.Preamble(c.Token, exe: exe));
        await c.SendAsync(Fx.Hello(uid, privacy: privacy));
        Assert.NotNull(await c.ReadUntilAsync("welcome"));
        foreach (var img in Fx.StandardImages()) await c.SendAsync(img);
        await c.SendAsync(full ?? Fx.StateFull(privacy));
        await SessionRig.WaitAsync(() => Hub.Store.Current.Browsers.Any(b => b.ProfileUid == uid && b.Synced && b.Connected));
        return c;
    }

    public async ValueTask DisposeAsync()
    {
        await Hub.DisposeAsync();
        await Endpoint.DisposeAsync();
        try { Directory.Delete(Dir, recursive: true); } catch (Exception) { }
    }
}

public class PipeTests
{
    [Test(Category = "integration")]
    public async Task Discovery_file_is_published_and_removed_on_dispose()
    {
        var rig = await PipeRig.StartAsync();
        var o = JsonNode.Parse(File.ReadAllText(rig.Discovery))!.AsObject();
        Assert.Contains("prism-control-browser-", o["pipe"]!.GetValue<string>());
        Assert.Equal(64, o["token"]!.GetValue<string>().Length);
        var path = rig.Discovery;
        await rig.Hub.DisposeAsync();
        await rig.Endpoint.DisposeAsync();
        Assert.False(File.Exists(path), "deleted on a clean exit");
        try { Directory.Delete(rig.Dir, true); } catch (Exception) { }
    }

    [Test(Category = "integration")]
    public async Task Hello_snapshot_deltas_and_a_command_round_trip_over_the_pipe()
    {
        await using var rig = await PipeRig.StartAsync();
        await using var relay = await rig.ConnectBrowserAsync();
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.Equal(5, b.Tabs.Count);
        Assert.True(rig.Hub.Images.Contains("art:" + Fx.Hash(Fx.ArtA)));

        await relay.SendAsync(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 11, ["unread"] = 8 }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[11].Unread == 8);

        var pending = rig.Hub.Commands.SendAsync("chrome:p1", Wire.Op.TabMute, new JsonObject { ["tabId"] = 12, ["muted"] = true });
        var cmd = (await relay.ReadUntilAsync("cmd"))!;
        Assert.Equal("tab.mute", cmd["op"]!.GetValue<string>());
        await relay.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "result", ["id"] = cmd["id"]!.GetValue<int>(), ["ok"] = true, ["data"] = new JsonObject { ["muted"] = true } });
        var r = await pending.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(r.Ok);
    }

    [Test(Category = "integration")]
    public async Task Wrong_token_is_dropped_by_the_endpoint_and_wrong_origin_by_the_session()
    {
        await using var rig = await PipeRig.StartAsync();
        await using (var bad = await FakeRelayClient.ConnectAsync(rig.Discovery))
        {
            await bad.SendAsync(Fx.Preamble("0000000000000000000000000000000000000000000000000000000000000000"));
            Assert.True(await bad.ClosedAsync(), "closed unseen");
        }
        Assert.True(rig.Endpoint.RejectedClients >= 1);
        await using (var other = await FakeRelayClient.ConnectAsync(rig.Discovery))
        {
            await other.SendAsync(Fx.Preamble(other.Token, origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"));
            try { await other.SendAsync(Fx.Hello()); } catch (IOException) { /* already refused and closed */ }
            Assert.True(await other.ClosedAsync(), "another extension's origin is refused");
        }
        Assert.Equal("BadOrigin", rig.Hub.LastRejection);
        Assert.Empty(rig.Hub.Store.Current.Browsers);
    }

    [Test(Category = "integration")]
    public async Task Oversize_and_malformed_frames_close_that_session_and_the_browser_reconnects()
    {
        await using var rig = await PipeRig.StartAsync();
        var relay = await rig.ConnectBrowserAsync();
        // 600 KB > the 512 KB inbound cap: the endpoint closes the session.
        try { await relay.SendRawAsync(Encoding.UTF8.GetBytes("{\"v\":1,\"t\":\"tabs.delta\",\"data\":{\"pad\":\"" + new string('x', 600 * 1024) + "\"}}")); }
        catch (IOException) { /* the server hung up after reading the length header: that is the point */ }
        Assert.True(await relay.ClosedAsync());
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1") is { Connected: false } or null);
        await relay.DisposeAsync();

        relay = await rig.ConnectBrowserAsync();
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected, "reconnected after the oversize frame");
        try { await relay.SendRawAsync(Encoding.UTF8.GetBytes("{ this is not json")); }
        catch (IOException) { }
        Assert.True(await relay.ClosedAsync());
        await relay.DisposeAsync();

        await using var again = await rig.ConnectBrowserAsync();
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected, "and again after malformed JSON");
    }

    [Test(Category = "integration")]
    public async Task Chrome_and_Edge_at_once_over_the_pipe()
    {
        await using var rig = await PipeRig.StartAsync();
        await using var chrome = await rig.ConnectBrowserAsync("p1", "chrome.exe");
        await using var edge = await rig.ConnectBrowserAsync("p2", "msedge.exe");
        var s = rig.Hub.Store.Current;
        Assert.Equal(2, s.Browsers.Count(b => b.Connected));
        var mutes = new[] { ("chrome:p1", chrome), ("msedge:p2", edge) };
        foreach (var (key, client) in mutes)
        {
            var pending = rig.Hub.Commands.SendAsync(key, Wire.Op.TabReload, new JsonObject { ["tabId"] = 13 });
            var cmd = (await client.ReadUntilAsync("cmd"))!;
            await client.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "result", ["id"] = cmd["id"]!.GetValue<int>(), ["ok"] = true, ["data"] = new JsonObject() });
            Assert.True((await pending.WaitAsync(TimeSpan.FromSeconds(3))).Ok, key + " got its own command");
        }
    }

    [Test(Category = "integration")]
    public async Task Reconnect_after_the_relay_drops_restores_the_browser()
    {
        await using var rig = await PipeRig.StartAsync();
        var relay = await rig.ConnectBrowserAsync();
        await relay.DisposeAsync();
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1") is { Connected: false } or null);
        await using var back = await rig.ConnectBrowserAsync();
        Assert.True(rig.Hub.Store.Current.Find("chrome:p1")!.Connected);
        Assert.Equal(5, rig.Hub.Store.Current.Find("chrome:p1")!.Tabs.Count);
    }

    /// <summary>
    /// Streamer-safe, end to end: a (buggy or hostile) sender that still includes titles while it reports "domain" can't
    /// get a title onto a key or into the log. The key draws exactly the domain-label frame.
    /// </summary>
    [Test(Category = "integration")]
    public async Task Streamer_safe_no_title_is_rendered_or_logged()
    {
        await using var rig = await PipeRig.StartAsync();
        var hostile = Fx.StateFull("full");
        hostile["data"]!["privacy"] = "domain";   // claims domain, still sends titles and URLs
        await using var relay = await rig.ConnectBrowserAsync(privacy: "domain", full: hostile);
        await relay.SendAsync(Fx.Envelope("tabs.delta", new JsonObject
        {
            ["upsert"] = new JsonArray(new JsonObject { ["id"] = 12, ["title"] = "Secret Surprise Party Plans", ["url"] = "https://video.example/secret" }),
            ["remove"] = new JsonArray(),
        }));
        await Task.Delay(100);
        var b = rig.Hub.Store.Current.Find("chrome:p1")!;
        Assert.True(b.Tabs.Values.All(t => t.Title is null && t.Url is null), "titles and URLs are dropped on ingest");

        var tab = b.Tabs[12];
        await using var h = await ActionHarness<TabKeyAction>.AppearAsync(TestDevices.Galleon, new(1, 0), settings: new TabKeySettings { Index = 2 },
            configureServices: s => s.Add(rig.Hub));
        var expected = BrowserArt.TabKey(Refraction.Night, new TabKeyView(rig.Hub.Images.Get(tab.Icon), "video.example", tab.Unread, tab.Audible, tab.Muted, true, "blue", false)).ToDataUri();
        Assert.Equal(expected, h.LastImage, "the key shows the domain frame, exactly");
        h.AssertFramesAreDeckSafe();
        foreach (var secret in new[] { "Night Drive - Example Video", "Secret Surprise", "Inbox (3)", "https://", "Quarterly Plan", "video.example/secret" })
            Assert.DoesNotContain(secret, rig.Log.All);
    }
}
