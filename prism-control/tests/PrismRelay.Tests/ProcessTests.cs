using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Testing;
using PrismRelay.Hook;

namespace PrismRelay.Tests;

internal static class Req
{
    public static void Exe()
    {
        if (RelayProcess.Exe is null) Assert.Skip("prism-relay.exe not built next to the tests and PRISM_RELAY_EXE not set");
    }

    /// <summary>True when the exe under test is self-contained native code (no prism-relay.dll next to it).</summary>
    public static bool IsAot => RelayProcess.Exe is { } e && !File.Exists(Path.ChangeExtension(e, ".dll"));

    public static string Kind => IsAot ? "NativeAOT" : "JIT apphost";

    public static byte[] Payload(string ev, string extra = "") =>
        Encoding.UTF8.GetBytes("{\"session_id\":\"sess-1\",\"cwd\":\"C:\\\\Users\\\\Example\\\\Repo\",\"hook_event_name\":\"" + ev + "\",\"permission_mode\":\"default\"" + extra + "}");

    public static double Median(List<double> xs) { xs = [.. xs]; xs.Sort(); return xs.Count % 2 == 1 ? xs[xs.Count / 2] : (xs[xs.Count / 2 - 1] + xs[xs.Count / 2]) / 2; }

    /// <summary>One run of cmd.exe /d /c exit (Process.Start to exit, stdout redirected): this PC's process-creation floor right now.</summary>
    public static async Task<double> BaselineAsync()
    {
        var sw = Stopwatch.StartNew();
        using var p = Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), "/d /c exit") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardInput = true, RedirectStandardError = true })!;
        p.StandardInput.Close();
        await p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync();
        return sw.Elapsed.TotalMilliseconds;
    }
}

public class HookProcessTests
{
    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Silent_exit_when_nothing_is_listening_is_fast()
    {
        Req.Exe();
        using var root = new TempRoot();
        var warm = await RelayProcess.RunHookAsync(root.Path, "claude", "PreToolUse", Req.Payload("PreToolUse")); // first run: OS file cache
        var times = new List<double>();
        var baseline = new List<double>();
        for (var i = 0; i < 10; i++)
        {
            var (code, stdout, stderr, ms) = await RelayProcess.RunHookAsync(root.Path, "claude", "PreToolUse", Req.Payload("PreToolUse"));
            Assert.Equal(0, code);
            Assert.Equal("", stdout);
            Assert.Equal("", stderr);
            times.Add(ms);
            baseline.Add(await Req.BaselineAsync()); // interleaved, so both see the same machine load
        }
        var (median, floor) = (Req.Median(times), Req.Median(baseline));
        Console.WriteLine($"     silent exit ({Req.Kind}): median {median:F0} ms, max {times.Max():F0} ms over 10 runs (process start to exit; first run {warm.Ms:F0} ms); cmd.exe /c exit baseline median {floor:F0} ms");
        // Target: < 250 ms for the shipped NativeAOT exe (the JIT apphost pays ~100 ms more runtime start-up). On a loaded PC,
        // process creation alone can exceed that, so the bar is 250 ms or the interleaved baseline + 150 ms, whichever is larger.
        var budget = Req.IsAot ? 250 : 400;
        Assert.True(median < Math.Max(budget, floor + budget - 100), $"median {median:F0} ms (baseline {floor:F0} ms)");
    }

    [Test(Category = "integration", TimeoutMs = 120_000)]
    public async Task Stale_discovery_files_exit_silently_and_fast()
    {
        Req.Exe();
        using var root = new TempRoot();
        var ingress = root.Ingress("ai");
        Directory.CreateDirectory(Path.GetDirectoryName(ingress)!);
        // A dead plugin pid.
        using var gone = Process.Start(new ProcessStartInfo("cmd.exe", "/c exit") { UseShellExecute = false, CreateNoWindow = true })!;
        await gone.WaitForExitAsync();
        // The yardstick is the same exe with NO discovery file (its quickest path), run in the same rounds, interleaved: a stale
        // file must cost no more than that. (It used to be one run per case against a cmd.exe baseline taken afterwards, with a
        // fixed 200 ms slack: on a loaded PC one slow process start failed it, and load scales start-up times, it doesn't add a
        // constant.) Whether a stale path can wait out a timeout at all is proven without a stopwatch race in
        // Stale_discovery_paths_never_wait_out_a_timeout below.
        var cases = new (string Name, Action Arrange)[]
        {
            ("no file", () => File.Delete(ingress)),
            ("dead pid", () => FakePipeServer.WriteDiscovery(ingress, "prism-control-ai-" + Guid.NewGuid().ToString("N"), new string('a', 64), gone.Id)),
            // A live pid but a pipe that does not exist (WaitNamedPipe fails at once).
            ("missing pipe", () => FakePipeServer.WriteDiscovery(ingress, "prism-control-ai-" + Guid.NewGuid().ToString("N"), new string('a', 64), Environment.ProcessId)),
            ("garbage file", () => File.WriteAllText(ingress, "{garbage")),
        };
        var ms = cases.ToDictionary(c => c.Name, _ => new List<double>());
        for (var round = 0; round < 5; round++)
        {
            foreach (var (name, arrange) in cases)
            {
                arrange();
                var r = await RelayProcess.RunHookAsync(root.Path, "claude", "Stop", Req.Payload("Stop"));
                Assert.Equal((0, "", ""), (r.Code, r.Stdout, r.Stderr), name);
                ms[name].Add(r.Ms);
            }
        }
        var yardstick = Req.Median(ms["no file"]);
        Console.WriteLine($"     stale ({Req.Kind}, medians of 5): " + string.Join(", ", cases.Select(c => $"{c.Name} {Req.Median(ms[c.Name]):F0} ms")));
        // Waiting out the relay's shortest timeout (connect, 150 ms) would add 150 ms to every run of a case.
        var slack = Math.Max(100, yardstick * 0.25);
        foreach (var name in new[] { "dead pid", "missing pipe", "garbage file" })
            Assert.True(Req.Median(ms[name]) < yardstick + slack, $"{name}: median {Req.Median(ms[name]):F0} ms, with no discovery file {yardstick:F0} ms");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Stale_discovery_paths_never_wait_out_a_timeout()
    {
        // In-process (no process start-up in the numbers) and with every timeout at 10 s: a stale path that waited one out
        // would take 10 s; each one takes milliseconds. The bound sits far from both, so load cannot flip the verdict.
        using var root = new TempRoot();
        var ingress = root.Ingress("ai");
        using var gone = Process.Start(new ProcessStartInfo("cmd.exe", "/c exit") { UseShellExecute = false, CreateNoWindow = true })!;
        await gone.WaitForExitAsync();
        var slow = new HookOptions { ConnectTimeout = TimeSpan.FromSeconds(10), StdinTimeout = TimeSpan.FromSeconds(10), QuietDrain = TimeSpan.FromSeconds(10), AckTimeout = TimeSpan.FromSeconds(10) };
        var cases = new (string Outcome, Action Arrange)[]
        {
            ("stale", () => FakePipeServer.WriteDiscovery(ingress, "prism-control-ai-" + Guid.NewGuid().ToString("N"), new string('a', 64), gone.Id)),
            ("no-connect", () => FakePipeServer.WriteDiscovery(ingress, "prism-control-ai-" + Guid.NewGuid().ToString("N"), new string('a', 64), Environment.ProcessId)),
            ("no-listener", () => File.WriteAllText(ingress, "{garbage")),
        };
        foreach (var (outcome, arrange) in cases)
        {
            arrange();
            var stdout = new MemoryStream();
            var relay = new HookRelay("claude", "Stop", new MemoryStream(Req.Payload("Stop")), stdout, _ => null, ingress, slow);
            var sw = Stopwatch.StartNew();
            await relay.RunAsync();
            Assert.Equal(outcome, relay.Outcome);
            Assert.Equal(0L, stdout.Length, outcome);
            Assert.True(sw.Elapsed < TimeSpan.FromSeconds(5), $"{outcome}: {sw.ElapsedMilliseconds} ms, so it waited out a 10 s timeout");
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task A_listener_that_never_acks_costs_only_the_ack_timeout()
    {
        Req.Exe();
        using var root = new TempRoot();
        await using var server = new FakePipeServer("ai", root.Ingress("ai"), async c => { await c.ReadAsync(); await Task.Delay(5000); });
        var r = await RelayProcess.RunHookAsync(root.Path, "claude", "PreToolUse", Req.Payload("PreToolUse"));
        Assert.Equal((0, "", ""), (r.Code, r.Stdout, r.Stderr));
        // Structural, not a stopwatch race (it was flaky under load): the relay waited for the ack (≥ its 300 ms timeout, minus
        // timer slack) and gave up long before its 3 s watchdog would have killed it.
        Assert.InRange(r.Ms, 250, 2900);
        Console.WriteLine($"     no ack: exit after {r.Ms:F0} ms");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task An_acked_event_reaches_the_module_minimized_with_token_and_identity()
    {
        Req.Exe();
        using var root = new TempRoot();
        string? frame = null;
        await using var server = new FakePipeServer("ai", root.Ingress("ai"), async c => { frame = await c.ReadAsync(); await c.SendAsync("{\"ok\":true}"); });
        var r = await RelayProcess.RunHookAsync(root.Path, "claude", "UserPromptSubmit", Req.Payload("UserPromptSubmit", ",\"prompt\":\"TOP SECRET PROMPT\""));
        Assert.Equal((0, "", ""), (r.Code, r.Stdout, r.Stderr));
        var o = JsonNode.Parse(Assert.NotNull(frame))!.AsObject();
        Assert.Equal(server.Token, o["token"]!.GetValue<string>());
        var e = o["event"]!.AsObject();
        Assert.Equal("UserPromptSubmit", e["name"]!.GetValue<string>());
        Assert.Equal("sess-1", e["sessionId"]!.GetValue<string>());
        Assert.Equal(Environment.ProcessId, e["parent"]!["pid"]!.GetValue<int>(), "the relay's parent is this test process");
        Assert.True(e["parent"]!["startedAt"]!.GetValue<long>() > 0);
        Assert.DoesNotContain("TOP SECRET", frame);
        Assert.DoesNotContain("Example\\\\Repo", frame);
        Assert.Equal("Repo", e["fields"]!["cwd_name"]!.GetValue<string>());
    }

    private static async Task<(string Stdout, string? Reveal, double Ms)> PermissionAsync(string ack, string? decision, string agent = "claude", string extra = "", int decideAfterMs = 50)
    {
        using var root = new TempRoot();
        string? reveal = null;
        await using var server = new FakePipeServer("ai", root.Ingress("ai"), async c =>
        {
            await c.ReadAsync();
            await c.SendAsync(ack);
            if (ack.Contains("\"reveal\":true")) reveal = await c.ReadAsync();
            await Task.Delay(decideAfterMs);
            if (decision is not null) await c.SendAsync(decision);
            await Task.Delay(2000);
        });
        var r = await RelayProcess.RunHookAsync(root.Path, agent, "PermissionRequest", Req.Payload("PermissionRequest", ",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git push --force https://user:hunter2@git.example.com/r.git\"}" + extra));
        Assert.Equal(0, r.Code);
        Assert.Equal("", r.Stderr);
        return (r.Stdout, reveal, r.Ms);
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task PermissionRequest_allow_deny_and_none_output_shapes()
    {
        Req.Exe();
        const string hold = "{\"hold\":true,\"reveal\":false,\"deadlineMs\":5000}";
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}""", (await PermissionAsync(hold, "{\"decision\":\"allow\"}")).Stdout);
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from Stream Deck"}}}""", (await PermissionAsync(hold, "{\"decision\":\"deny\"}")).Stdout);
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Not now","interrupt":true}}}""", (await PermissionAsync(hold, "{\"decision\":\"deny\",\"message\":\"Not now\",\"interrupt\":true}")).Stdout);
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}""", (await PermissionAsync(hold, "{\"decision\":\"allow\"}", agent: "codex")).Stdout, "Codex uses the same shape");
        Assert.Equal("", (await PermissionAsync(hold, "{\"decision\":\"none\"}")).Stdout, "none → the agent's own prompt");
        Assert.Equal("", (await PermissionAsync(hold, "{\"decision\":\"allow\"}", extra: ",\"cursor_version\":\"1.0\"")).Stdout, "never decide for Cursor cross-talk");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task PermissionRequest_without_a_hold_or_past_the_deadline_prints_nothing()
    {
        Req.Exe();
        Assert.Equal("", (await PermissionAsync("{\"hold\":false}", "{\"decision\":\"allow\"}")).Stdout);
        Assert.Equal("", (await PermissionAsync("{\"decision\":\"allow\"}", null)).Stdout, "a decision in the ack (no hold) is ignored");
        var late = await PermissionAsync("{\"hold\":true,\"deadlineMs\":300}", "{\"decision\":\"allow\"}", decideAfterMs: 3000);
        Assert.Equal("", late.Stdout, "too late: fall through");
        // Structural: it honored the 300 ms deadline (not earlier) and left before the decision would have arrived (3 s later).
        Assert.InRange(late.Ms, 300, 2900);
        Console.WriteLine($"     hold timeout (300 ms deadline): exit after {late.Ms:F0} ms");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Reveal_sends_a_bounded_scrubbed_summary_only_when_asked()
    {
        Req.Exe();
        var (stdout, reveal, _) = await PermissionAsync("{\"hold\":true,\"reveal\":true,\"deadlineMs\":5000}", "{\"decision\":\"deny\"}");
        Assert.Contains("deny", stdout);
        var r = JsonNode.Parse(Assert.NotNull(reveal))!.AsObject();
        Assert.Equal("reveal", r["t"]!.GetValue<string>());
        var cmd = r["summary"]!["command"]!.GetValue<string>();
        Assert.Contains("git push --force https://•••@git.example.com", cmd);
        Assert.DoesNotContain("hunter2", reveal);
        var (_, none, _) = await PermissionAsync("{\"hold\":true,\"reveal\":false,\"deadlineMs\":5000}", "{\"decision\":\"none\"}");
        Assert.Null(none);
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Stdin_is_capped_at_1_MB_and_the_rest_drained()
    {
        Req.Exe();
        using var root = new TempRoot();
        string? frame = null;
        await using var server = new FakePipeServer("ai", root.Ingress("ai"), async c => { frame = await c.ReadAsync(); await c.SendAsync("{}"); });
        var big = new StringBuilder("{\"session_id\":\"sess-big\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Write\",\"tool_input\":{\"content\":\"");
        big.Append('x', 3 * 1024 * 1024).Append("\"}}");
        var r = await RelayProcess.RunHookAsync(root.Path, "claude", "PostToolUse", Encoding.UTF8.GetBytes(big.ToString()));
        Assert.Equal((0, "", ""), (r.Code, r.Stdout, r.Stderr));
        var e = JsonNode.Parse(Assert.NotNull(frame))!["event"]!.AsObject();
        Assert.Equal(1024 * 1024, e["stdin"]!["bytes"]!.GetValue<int>());
        Assert.True(e["stdin"]!["truncated"]!.GetValue<bool>());
        Assert.Equal("sess-big", e["sessionId"]!.GetValue<string>(), "fields before the cut survive");
        Assert.Equal("Write", e["fields"]!["tool_name"]!.GetValue<string>());
        Assert.True(frame!.Length < 8 * 1024, "the content itself never leaves the relay");
        Console.WriteLine($"     3 MB stdin: {r.Ms:F0} ms");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Bad_arguments_and_unknown_modes_are_silent()
    {
        Req.Exe();
        using var root = new TempRoot();
        foreach (var args in new[] { new[] { "hook" }, ["hook", "claude"], ["hook", "Bad Agent", "Stop"], ["hook", "claude", "Not-An-Event"], ["whatever"], [] })
        {
            using var p = new RelayProcess(root.Path, args);
            p.Stdin.Close();
            var stdout = await new StreamReader(p.Stdout).ReadToEndAsync();
            Assert.Equal(0, await p.WaitAsync());
            Assert.Equal("", stdout, string.Join(" ", args));
            Assert.Equal("", await p.StderrAsync());
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Works_against_the_real_PipeEndpoint()
    {
        Req.Exe();
        using var root = new TempRoot();
        var hello = new TaskCompletionSource<JsonObject>();
        await using var ep = await PrismControl.Desktop.PipeEndpoint.StartAsync(
            new PrismControl.Desktop.PipeEndpointOptions { Name = "ai", MaxFrameBytes = 64 * 1024, DiscoveryFile = root.Ingress("ai") },
            async s =>
            {
                hello.TrySetResult(s.Hello);
                await s.WriteAsync(new JsonObject { ["hold"] = true, ["reveal"] = false, ["deadlineMs"] = 2000 }, CancellationToken.None);
                await s.WriteAsync(new JsonObject { ["decision"] = "allow" }, CancellationToken.None);
                await s.ReadAsync(CancellationToken.None);
            });
        var r = await RelayProcess.RunHookAsync(root.Path, "claude", "PermissionRequest", Req.Payload("PermissionRequest", ",\"tool_name\":\"Edit\""));
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}""", r.Stdout);
        var h = await hello.Task.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Null(h["token"], "stripped by the endpoint");
        Assert.Equal("Edit", h["event"]!["fields"]!["tool_name"]!.GetValue<string>());
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Otel_headers_prints_the_bearer_or_an_empty_object()
    {
        Req.Exe();
        using var root = new TempRoot();
        async Task<string> Run() { using var p = new RelayProcess(root.Path, "otel-headers"); var s = await new StreamReader(p.Stdout).ReadToEndAsync(); await p.WaitAsync(); return s; }
        Assert.Equal("{}", await Run());
        FakePipeServer.WriteDiscovery(root.Ingress("ai"), "prism-control-ai-" + new string('a', 32), new string('b', 64), 1);
        // Review L12: the pipe token is never handed to the OTLP exporter.
        Assert.Equal("{}", await Run(), "no dedicated otelToken: no header");
        File.WriteAllText(root.Ingress("ai"), "{\"pipe\":\"prism-control-ai-" + new string('a', 32) + "\",\"token\":\"" + new string('b', 64) + "\",\"otelToken\":\"" + new string('c', 64) + "\"}");
        Assert.Equal("{\"Authorization\":\"Bearer " + new string('c', 64) + "\"}", await Run());
    }
}

public class NativeHostProcessTests
{
    private const string Origin = "chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/"; // the Prism extension id (PROTOCOL.md)
    private const string Up = "{\"t\":\"relay.up\"}", Down = "{\"t\":\"relay.down\"}";

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Preamble_then_verbatim_pumping_both_ways()
    {
        Req.Exe();
        using var root = new TempRoot();
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c =>
        {
            await c.ReadAsync();                    // preamble
            await c.SendAsync("{ \"t\" : \"welcome\" ,\"n\":1 }"); // odd spacing: proves bytes are not re-serialized
            await c.ReadAsync();                    // from the extension
            await Task.Delay(5000);
        });
        using var relay = new RelayProcess(root.Path, Origin, "--parent-window=0");
        var conn = await server.WaitForConnectionAsync();
        Assert.Equal(Up, await relay.ReadFrameAsync(), "relay.up comes first, after the preamble");
        Assert.Equal("{ \"t\" : \"welcome\" ,\"n\":1 }", await relay.ReadFrameAsync());
        await relay.WriteFrameAsync("{\"t\":\"hello\",\"proto\":1}");
        await Task.Delay(300);
        lock (conn.Received)
        {
            var pre = JsonNode.Parse(conn.Received[0])!.AsObject();
            Assert.Equal("relay", pre["t"]!.GetValue<string>());
            Assert.Equal(1, pre["v"]!.GetValue<int>());
            Assert.Equal(server.Token, pre["token"]!.GetValue<string>());
            Assert.Equal(Origin, pre["origin"]!.GetValue<string>());
            Assert.Equal(Environment.ProcessId, pre["browserPid"]!.GetValue<int>(), "the relay's parent stands in for the browser");
            Assert.True(string.Equals(Path.GetFileName(Environment.ProcessPath), pre["browserExe"]!.GetValue<string>(), StringComparison.OrdinalIgnoreCase), "browserExe");
            Assert.Equal("0.1.0", pre["relayVersion"]!.GetValue<string>());
            Assert.Equal(0, pre["parentWindow"]!.GetValue<int>());
            Assert.Equal("{\"t\":\"hello\",\"proto\":1}", conn.Received[1]);
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Frames_over_1_MB_are_dropped_in_both_directions()
    {
        Req.Exe();
        using var root = new TempRoot();
        var exactly1MB = "\"" + new string('a', 1024 * 1024 - 2) + "\"";
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c =>
        {
            await c.ReadAsync();
            await c.SendRawAsync(new byte[1024 * 1024 + 1]);  // too big for Chrome: dropped
            await c.SendAsync("{\"after\":1}");
            await c.SendAsync(exactly1MB);                      // exactly 1 MB: allowed
            while (await c.ReadAsync(5000) is not null) { }     // keep collecting what the relay forwards
        });
        using var relay = new RelayProcess(root.Path, Origin);
        Assert.Equal(Up, await relay.ReadFrameAsync());
        Assert.Equal("{\"after\":1}", await relay.ReadFrameAsync(), "the oversize frame was drained and dropped");
        Assert.Equal(exactly1MB.Length, (await relay.ReadFrameAsync())!.Length);
        await relay.WriteFrameAsync(Encoding.UTF8.GetBytes("\"" + new string('b', 1024 * 1024) + "\"")); // > 1 MB toward the pipe
        await relay.WriteFrameAsync("{\"small\":true}");
        var conn = await server.WaitForConnectionAsync();
        await Task.Delay(500);
        lock (conn.Received)
        {
            Assert.Equal(2, conn.Received.Count, "preamble + the small frame only");
            Assert.Equal("{\"small\":true}", conn.Received[1]);
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Pipe_loss_sends_relay_down_then_relay_up_after_reconnecting_with_the_new_discovery_file()
    {
        Req.Exe();
        using var root = new TempRoot();
        var first = new FakePipeServer("browser", root.Ingress("browser"), async c => { await c.ReadAsync(); await c.SendAsync("{\"t\":\"welcome\"}"); await Task.Delay(300); c.Stream.Dispose(); });
        using var relay = new RelayProcess(root.Path, Origin);
        Assert.Equal(Up, await relay.ReadFrameAsync());
        Assert.Equal("{\"t\":\"welcome\"}", await relay.ReadFrameAsync());
        Assert.Equal(Down, await relay.ReadFrameAsync());
        await first.DisposeAsync();
        var sw = Stopwatch.StartNew();
        string? preamble = null;
        await using var second = new FakePipeServer("browser", root.Ingress("browser"), async c => { preamble = await c.ReadAsync(); await c.SendAsync("{\"t\":\"welcome\",\"n\":2}"); await Task.Delay(5000); });
        Assert.Equal(Up, await relay.ReadFrameAsync(5000), "relay.up again after the reconnect");
        Assert.Equal("{\"t\":\"welcome\",\"n\":2}", await relay.ReadFrameAsync(5000));
        Console.WriteLine($"     reconnected {sw.ElapsedMilliseconds} ms after the new discovery file");
        Assert.True(sw.ElapsedMilliseconds < 2500);
        Assert.Equal(second.Token, JsonNode.Parse(preamble!)!["token"]!.GetValue<string>(), "re-read the rotated token");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task No_listener_at_start_says_relay_down_once_and_keeps_trying()
    {
        Req.Exe();
        using var root = new TempRoot();
        using var relay = new RelayProcess(root.Path, Origin);
        Assert.Equal(Down, await relay.ReadFrameAsync());
        await relay.WriteFrameAsync("{\"t\":\"hello\"}"); // dropped while down: no crash
        Assert.Null(await relay.ReadFrameAsync(1500), "relay.down is sent once, not every retry");
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c => { await c.ReadAsync(); await c.SendAsync("{\"t\":\"welcome\"}"); await Task.Delay(5000); });
        Assert.Equal(Up, await relay.ReadFrameAsync(5000));
        Assert.Equal("{\"t\":\"welcome\"}", await relay.ReadFrameAsync(5000));
        Assert.False(relay.P.HasExited);
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Stdin_eof_exits_promptly()
    {
        Req.Exe();
        using var root = new TempRoot();
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c => { await c.ReadAsync(); await Task.Delay(10_000); });
        using var relay = new RelayProcess(root.Path, Origin);
        await server.WaitForConnectionAsync();
        var sw = Stopwatch.StartNew();
        relay.Stdin.Close();
        Assert.Equal(0, await relay.WaitAsync(5000));
        Console.WriteLine($"     EOF → exit in {sw.ElapsedMilliseconds} ms");
        Assert.True(sw.ElapsedMilliseconds < 1500);
        Assert.Equal("", await relay.StderrAsync());
    }
}

public class StartupTests
{
    private static async Task<double> TimeAsync(string exe, string args, string? expect = null)
    {
        var sw = Stopwatch.StartNew();
        using var p = Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true })!;
        var output = await p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync();
        var ms = sw.Elapsed.TotalMilliseconds;
        if (expect is not null) Assert.Equal(expect, output);
        return ms;
    }

    [Test(Category = "integration", TimeoutMs = 120_000)]
    public async Task Cold_start_median_of_20()
    {
        Req.Exe();
        var cmd = Path.Combine(Environment.SystemDirectory, "cmd.exe");
        var relay = new List<double>();
        var baseline = new List<double>();
        for (var i = 0; i < 20; i++)
        {
            // Interleaved, so machine load affects both the same way. Process.Start to exit, stdout redirected.
            relay.Add(await TimeAsync(RelayProcess.Exe!, "--version", "0.1.0\n"));
            baseline.Add(await TimeAsync(cmd, "/d /c exit"));
        }
        var size = new FileInfo(RelayProcess.Exe!).Length;
        Console.WriteLine($"     start-up ({Req.Kind}): median {Req.Median(relay):F1} ms (min {relay.Min():F1}, max {relay.Max():F1}) over 20 runs; baseline cmd.exe /c exit median {Req.Median(baseline):F1} ms; exe {size / 1024.0 / 1024.0:F2} MiB ({size} bytes)");
        var self = new List<double>();
        for (var i = 0; i < 20; i++)
        {
            using var sp = Process.Start(new ProcessStartInfo(RelayProcess.Exe!, "--self-time") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true })!;
            self.Add(double.Parse(await sp.StandardOutput.ReadToEndAsync(), System.Globalization.CultureInfo.InvariantCulture));
            await sp.WaitForExitAsync();
        }
        Console.WriteLine($"     self-measured creation → Main ({Req.Kind}): median {Req.Median(self):F0} ms, min {self.Min():F0}, max {self.Max():F0}");
        // Relative to the interleaved baseline: process creation dominates on this machine.
        Assert.True(Req.Median(relay) < Req.Median(baseline) * 1.5 + (Req.IsAot ? 30 : 250), $"median {Req.Median(relay):F1} ms vs baseline {Req.Median(baseline):F1} ms");
    }
}
