using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Sessions;
using PrismControl.Desktop;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>This test process playing prism-relay over the real per-user pipe (u32 LE framing; platform/USAGE.md frames).</summary>
public sealed class FakeRelay : IAsyncDisposable
{
    private readonly NamedPipeClientStream _pipe;
    public string Token { get; }

    private FakeRelay(NamedPipeClientStream pipe, string token)
    {
        _pipe = pipe;
        Token = token;
    }

    public static async Task<FakeRelay> ConnectAsync(string discoveryFile, string? tokenOverride = null)
    {
        var d = DiscoveryFile.Read(discoveryFile) ?? throw new InvalidOperationException("no discovery file");
        var pipe = new NamedPipeClientStream(".", d["pipe"]!.GetValue<string>(), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync(2000);
        return new FakeRelay(pipe, tokenOverride ?? d["token"]!.GetValue<string>());
    }

    public Task SendRawAsync(byte[] bytes) => _pipe.WriteAsync(bytes).AsTask();

    public async Task SendAsync(JsonNode frame)
    {
        await _pipe.WriteAsync(PipeFraming.Encode(frame));
        await _pipe.FlushAsync();
    }

    public Task HelloAsync(JsonObject evt) => SendAsync(new JsonObject { ["v"] = 1, ["token"] = Token, ["event"] = evt });

    /// <summary>The next frame; null on EOF or after <paramref name="timeoutMs"/>.</summary>
    public async Task<JsonNode?> ReadAsync(int timeoutMs = 3000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            var header = new byte[4];
            if (!await FillAsync(header, cts.Token)) return null;
            var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(header)];
            if (!await FillAsync(body, cts.Token)) return null;
            return JsonNode.Parse(body);
        }
        catch (OperationCanceledException) { return null; }
        catch (IOException) { return null; }
    }

    private async Task<bool> FillAsync(byte[] buf, CancellationToken ct)
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

    public async ValueTask DisposeAsync() => await _pipe.DisposeAsync();
}

/// <summary>A pipe endpoint + ingress on a temp discovery file, with this process as the trusted "relay".</summary>
public sealed class PipeRig : IAsyncDisposable
{
    public TestRig Rig { get; }
    public DesktopIngressEndpoint Endpoint { get; }
    public AiIngress Ingress { get; }
    public string Dir { get; }
    public string DiscoveryPath => Path.Combine(Dir, "ingress.json");
    public bool TrustClient = true;

    private PipeRig(TestRig rig, string dir)
    {
        Rig = rig;
        Dir = dir;
        // The relay is this test process: its "ancestry" contains the fake agent process.
        rig.Tree.Parents[Environment.ProcessId] = [rig.Agent];
        Ingress = new AiIngress(rig.Sessions, rig.Broker, rig.Tree, rig.Time, rig.Log,
            img => TrustClient && string.Equals(img, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase));
        Endpoint = new DesktopIngressEndpoint(DiscoveryPath, rig.Log);
        Endpoint.ConnectionOpened += c => Ingress.HandleAsync(c, CancellationToken.None);
    }

    public static async Task<PipeRig> StartAsync(TestRig? rig = null)
    {
        var p = new PipeRig(rig ?? new TestRig(), TempDirs.New("pipe"));
        await p.Endpoint.StartAsync(CancellationToken.None);
        return p;
    }

    public JsonObject Event(string name, string session = TestRig.Sessions1, string agent = "claude", JsonObject? fields = null) =>
        TestRig.EventJson(name, session, agent, fields: fields, agentProcess: Rig.Agent);

    /// <summary>Sends one non-blocking event and waits for its ack.</summary>
    public async Task<JsonNode?> SendEventAsync(JsonObject evt)
    {
        await using var r = await FakeRelay.ConnectAsync(DiscoveryPath);
        await r.HelloAsync(evt);
        return await r.ReadAsync();
    }

    /// <summary>Makes the deck able to hold: an approve key + a details card on the Galleon, and a known session.</summary>
    public async Task ReadyToHoldAsync()
    {
        Rig.Presence.Register("approve", SurfaceKind.Approve, TestRig.Device, false);
        Rig.Presence.Register("deny", SurfaceKind.Deny, TestRig.Device, false);
        Rig.Presence.Register("card", SurfaceKind.Details, TestRig.Device, false);
        Assert.Equal(true, (await SendEventAsync(Event("SessionStart")))?["ok"]?.GetValue<bool>());
    }

    public async ValueTask DisposeAsync()
    {
        await Endpoint.DisposeAsync();
        Rig.Dispose();
        TempDirs.Delete(Dir);
    }
}

public class IngressPipeTests
{
    private static async Task WaitUntil(Func<bool> condition, int ms = 3000)
    {
        var until = Environment.TickCount64 + ms;
        while (!condition())
        {
            if (Environment.TickCount64 > until) throw new AssertException("condition not met in time");
            await Task.Delay(10);
        }
    }

    [Test(Category = "integration")]
    public async Task Discovery_file_is_written_after_listening_and_removed_on_exit()
    {
        var p = await PipeRig.StartAsync();
        var d = Assert.NotNull(DiscoveryFile.Read(p.DiscoveryPath));
        Assert.Equal(1, d["v"]!.GetValue<int>());
        Assert.Contains("prism-control-ai-", d["pipe"]!.GetValue<string>());
        Assert.Equal(32, d["pipe"]!.GetValue<string>().Length - "prism-control-ai-".Length, "128-bit random name");
        Assert.Equal(64, d["token"]!.GetValue<string>().Length, "256-bit token");
        Assert.Equal(Environment.ProcessId, d["pid"]!.GetValue<int>());
        await p.DisposeAsync();
        Assert.False(File.Exists(p.DiscoveryPath));
    }

    [Test(Category = "integration")]
    public async Task A_wrong_token_is_dropped_unseen()
    {
        await using var p = await PipeRig.StartAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath, tokenOverride: new string('0', 64));
        await r.HelloAsync(p.Event("UserPromptSubmit"));
        Assert.Null(await r.ReadAsync(1500), "no reply, no oracle");
        Assert.Empty(p.Rig.Sessions.Snapshot(PrivacyMode.Private));
        Assert.Equal(0, p.Ingress.Stats.Events);
    }

    [Test(Category = "integration")]
    public async Task An_event_is_acked_and_applied()
    {
        await using var p = await PipeRig.StartAsync();
        var ack = await p.SendEventAsync(p.Event("UserPromptSubmit"));
        Assert.Equal(true, ack?["ok"]?.GetValue<bool>());
        var v = Assert.Single(p.Rig.Sessions.Snapshot(PrivacyMode.Private));
        Assert.Equal(SessionState.Working, v.State.Value);
        Assert.True(v.KnownLive, "verified: the agent process is in the relay's ancestry");
        Assert.Equal(1, p.Ingress.Stats.Verified);
    }

    [Test(Category = "integration")]
    public async Task Events_outside_the_schema_are_rejected()
    {
        await using var p = await PipeRig.StartAsync();
        var bad = p.Event("DeleteEverything");
        Assert.Equal(false, (await p.SendEventAsync(bad))?["ok"]?.GetValue<bool>());
        var badFamily = p.Event("Stop");
        badFamily["agent"] = "evil";
        Assert.Equal(false, (await p.SendEventAsync(badFamily))?["ok"]?.GetValue<bool>());
        Assert.Empty(p.Rig.Sessions.Snapshot(PrivacyMode.Private));
        Assert.Equal(2, p.Ingress.Stats.Rejected);
    }

    [Test(Category = "integration")]
    public async Task Content_fields_never_get_past_the_ingress()
    {
        await using var p = await PipeRig.StartAsync();
        var evt = p.Event("UserPromptSubmit");
        // A rogue client stuffs content in: prompt text, a transcript path, tool input, an unknown env var.
        evt["fields"]!["prompt"] = "PROMPT-MARKER";
        evt["fields"]!["transcript_path"] = @"C:\Users\example\TRANSCRIPT-MARKER.jsonl";
        evt["fields"]!["tool_input"] = new JsonObject { ["command"] = "COMMAND-MARKER" };
        evt["env"]!["AWS_SECRET_ACCESS_KEY"] = "SECRET-MARKER";
        evt["prompt"] = "PROMPT-MARKER";
        await p.SendEventAsync(evt);
        var dump = string.Join(" | ", p.Rig.Sessions.Snapshot(PrivacyMode.Reveal).Select(v => v.ToString())) + p.Rig.Log.All;
        foreach (var m in new[] { "PROMPT-MARKER", "TRANSCRIPT-MARKER", "COMMAND-MARKER", "SECRET-MARKER" }) Assert.DoesNotContain(m, dump);
        Assert.Single(p.Rig.Sessions.Snapshot(PrivacyMode.Private));
    }

    [Test(Category = "integration")]
    public async Task An_oversize_frame_closes_the_connection()
    {
        await using var p = await PipeRig.StartAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        var evt = p.Event("UserPromptSubmit");
        evt["fields"]!["padding"] = new string('x', 70 * 1024);
        try { await r.HelloAsync(evt); }
        catch (IOException) { /* the endpoint may close mid-write: that is the point */ }
        Assert.Null(await r.ReadAsync(2000));
        Assert.Empty(p.Rig.Sessions.Snapshot(PrivacyMode.Private));
    }

    [Test(Category = "integration")]
    public async Task Per_session_rate_limit_holds()
    {
        await using var p = await PipeRig.StartAsync();
        for (var i = 0; i < 24; i++) await p.SendEventAsync(p.Event("PreToolUse", fields: new() { ["tool_name"] = "Read" }));
        Assert.Equal(20, p.Ingress.Stats.Events, "20/s per session (the manual clock never refills)");
        Assert.Equal(4, p.Ingress.Stats.RateLimited);
    }

    [Test(Category = "integration")]
    public async Task No_approve_key_means_no_hold()
    {
        await using var p = await PipeRig.StartAsync();
        var ack = await p.SendEventAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        Assert.Equal(false, ack?["hold"]?.GetValue<bool>());
        Assert.Equal(0, p.Rig.Broker.PendingCount);
    }

    [Test(Category = "integration")]
    public async Task Full_hold_protocol_ends_in_an_allow_only_after_a_held_approve_key()
    {
        await using var p = await PipeRig.StartAsync();
        await p.ReadyToHoldAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash", ["permission_mode"] = "default" }));
        var ack = Assert.NotNull(await r.ReadAsync());
        Assert.Equal(true, ack["hold"]!.GetValue<bool>());
        Assert.Equal(true, ack["reveal"]!.GetValue<bool>());
        Assert.Equal(30000, ack["deadlineMs"]!.GetValue<int>());
        await r.SendAsync(new JsonObject { ["v"] = 2, ["t"] = "reveal", ["summary"] = new JsonObject { ["tool"] = "Bash", ["input"] = "complete", ["command"] = "npm test -- --watch=false" } });
        await WaitUntil(() => p.Rig.Broker.Selected()?.DetailsComplete == true);
        var req = p.Rig.Broker.Selected()!;
        Assert.True(req.Known);
        Assert.Equal("npm test -- --watch=false", req.Summary!.Command);

        p.Rig.Broker.ReportShown("card", TestRig.Device, req.Id, true);
        p.Rig.Time.Advance(ApprovalBroker.MinVisible + ApprovalBroker.DisplayLatency);
        var (ticket, block) = p.Rig.Broker.BeginApproveHold("approve", TestRig.Device, inMultiAction: false);
        Assert.Equal(ApproveBlock.None, block);
        p.Rig.Time.Advance(TimeSpan.FromSeconds(1.2));
        Assert.Equal(ApproveBlock.None, p.Rig.Broker.CompleteApproveHold(ticket!));
        var decision = Assert.NotNull(await r.ReadAsync());
        Assert.Equal("allow", decision["decision"]!.GetValue<string>());
        Assert.Equal(1, decision.AsObject().Count, "an allow carries nothing else: no updatedPermissions, no updatedInput");
    }

    [Test(Category = "integration")]
    public async Task A_relay_cannot_decide_anything_itself()
    {
        await using var p = await PipeRig.StartAsync();
        await p.ReadyToHoldAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        await r.ReadAsync();
        await r.SendAsync(new JsonObject { ["v"] = 2, ["t"] = "reveal", ["summary"] = new JsonObject { ["tool"] = "Bash", ["input"] = "complete", ["command"] = "ls" } });
        await WaitUntil(() => p.Rig.Broker.Selected()?.DetailsComplete == true);
        // The ingress has no "decide" method: a decision frame from the client withdraws the request.
        await r.SendAsync(new JsonObject { ["decision"] = "allow" });
        var reply = Assert.NotNull(await r.ReadAsync());
        Assert.Equal("none", reply["decision"]!.GetValue<string>());
        Assert.Equal(0, p.Rig.Broker.PendingCount);
    }

    [Test(Category = "integration")]
    public async Task A_second_connection_cannot_answer_anothers_request()
    {
        await using var p = await PipeRig.StartAsync();
        await p.ReadyToHoldAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        await r.ReadAsync();
        await r.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "ls" } });
        await WaitUntil(() => p.Rig.Broker.PendingCount == 1);
        var id = p.Rig.Broker.Selected()!.Id;
        await using var rogue = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await rogue.HelloAsync(new JsonObject { ["v"] = 1, ["event"] = p.Event("Stop"), ["decision"] = "allow", ["requestId"] = id });
        await rogue.ReadAsync();
        Assert.Equal(1, p.Rig.Broker.PendingCount, "still pending: decisions only flow Prism → the relay that asked");
    }

    [Test(Category = "integration")]
    public async Task A_relay_that_goes_away_withdraws_its_request()
    {
        await using var p = await PipeRig.StartAsync();
        await p.ReadyToHoldAsync();
        var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        await r.ReadAsync();
        await r.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "ls" } });
        await WaitUntil(() => p.Rig.Broker.PendingCount == 1);
        await r.DisposeAsync();   // Claude cancelled the hook: the user answered in the terminal
        await WaitUntil(() => p.Rig.Broker.PendingCount == 0);
    }

    [Test(Category = "integration")]
    public async Task No_reveal_frame_means_fall_through_now()
    {
        await using var p = await PipeRig.StartAsync();
        await p.ReadyToHoldAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        await r.ReadAsync();
        var reply = Assert.NotNull(await r.ReadAsync(4000));
        Assert.Equal("none", reply["decision"]!.GetValue<string>());
        Assert.Equal(0, p.Rig.Broker.PendingCount);
    }

    [Test(Category = "integration")]
    public async Task Timeout_gives_no_decision_and_away_mode_denies()
    {
        foreach (var away in new[] { false, true })
        {
            await using var p = await PipeRig.StartAsync();
            p.Rig.Update(s => s.AwayDenyOnTimeout = away);
            await p.ReadyToHoldAsync();
            await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
            await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
            await r.ReadAsync();
            await r.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "ls" } });
            await WaitUntil(() => p.Rig.Broker.Selected()?.DetailsComplete == true);
            p.Rig.Time.Advance(TimeSpan.FromSeconds(30));
            var reply = Assert.NotNull(await r.ReadAsync());
            Assert.Equal(away ? "deny" : "none", reply["decision"]!.GetValue<string>());
            Assert.False(reply.AsObject().ContainsKey("interrupt"));
        }
    }

    [Test(Category = "integration")]
    public async Task An_untrusted_client_is_display_only()
    {
        await using var p = await PipeRig.StartAsync();
        p.TrustClient = false;
        await p.ReadyToHoldAsync();
        await using var r = await FakeRelay.ConnectAsync(p.DiscoveryPath);
        await r.HelloAsync(p.Event("PermissionRequest", fields: new() { ["tool_name"] = "Bash" }));
        Assert.Equal(true, (await r.ReadAsync())?["hold"]?.GetValue<bool>());
        await r.SendAsync(new JsonObject { ["v"] = 1, ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "ls" } });
        await WaitUntil(() => p.Rig.Broker.PendingCount == 1);
        Assert.False(p.Rig.Broker.Selected()!.Known, "not our relay binary: UNKNOWN SESSION, approve locked");
        Assert.Equal(ApproveBlock.UnknownSession, p.Rig.Broker.ApproveState(TestRig.Device));
    }
}
