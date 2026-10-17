using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.GameLink;
using PrismControl.Sight.Safety;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

public class PolicyTests
{
    private sealed class FakeProbe : IPolicyProbe
    {
        public Dictionary<string, string[]> Folders { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<string> Running { get; } = [];
        public List<string> Listed { get; } = [];
        public IReadOnlyCollection<string> RunningProcessNames() => Running;
        public IReadOnlyCollection<string> ListFolder(string folder) { Listed.Add(folder); return Folders.TryGetValue(folder, out var f) ? f : []; }
    }

    private static (GamePolicy Policy, FakeProbe Probe, UserGames User) Make(string? file = null)
    {
        var probe = new FakeProbe();
        var user = new UserGames(file);
        return (new GamePolicy(user, probe, new ManualTimeProvider()), probe, user);
    }

    [Test]
    public void Allowlisted_games_may_be_read_and_driven()
    {
        var (p, _, _) = Make();
        foreach (var exe in new[] { "PlanetCoaster2.exe", "PlanetCoaster.exe", "NMS.exe", "factorio.exe", "FactoryGame-Win64-Shipping.exe" })
        {
            var a = p.Evaluate(exe, $@"D:\Games\X\{exe}");
            Assert.True(a.ReadAllowed && a.InputAllowed, $"{exe}: {a.Reason}");
            Assert.Equal("Allowlisted", a.Verdict);
        }
        Assert.Equal("pc2", p.Evaluate("planetcoaster2.EXE").GameId);
    }

    [Test]
    public void Online_competitive_games_are_hard_denied_and_cannot_be_enabled()
    {
        var (p, _, user) = Make();
        foreach (var (exe, path) in new[] { ("Overwatch.exe", (string?)null), ("bf6.exe", null), ("VALORANT-Win64-Shipping.exe", null), ("cs2.exe", null),
                                            ("Renamed.exe", @"C:\Riot Games\VALORANT\live\Renamed.exe"), ("Game.exe", @"D:\Battlefield 6\Game.exe") })
        {
            var a = p.Evaluate(exe, path);
            Assert.False(a.ReadAllowed || a.InputAllowed, exe);
            Assert.Equal("Denied", a.Verdict, exe);
            Assert.False(user.TryEnable(exe, warningAcknowledged: true, p, path, out var why), $"{exe} must never be enableable");
            Assert.Contains("never", why);
            Assert.Equal("Denied", p.Evaluate(exe, path).Verdict);
        }
    }

    [Test]
    public void Anti_cheat_next_to_the_game_or_running_blocks_even_allowlisted_names()
    {
        var (p, probe, user) = Make();
        probe.Folders[@"D:\Games\Shooter\Binaries\Win64"] = ["Shooter.exe", "EasyAntiCheat", "x.dll"];
        var a = p.Evaluate("Shooter.exe", @"D:\Games\Shooter\Binaries\Win64\Shooter.exe");
        Assert.Equal("AntiCheat", a.Verdict);
        Assert.Contains("EasyAntiCheat", a.Reason);
        Assert.False(user.TryEnable("Shooter.exe", true, p, @"D:\Games\Shooter\Binaries\Win64\Shooter.exe", out _));
        // A renamed exe with an allowlisted name in a protected folder is still refused.
        probe.Folders[@"D:\Games\Fake"] = ["BattlEye", "PlanetCoaster2.exe"];
        Assert.Equal("AntiCheat", p.Evaluate("PlanetCoaster2.exe", @"D:\Games\Fake\PlanetCoaster2.exe").Verdict);
        // A protected game running in the background pauses Sight everywhere.
        var (p2, probe2, _) = Make();
        probe2.Running.Add("BEService.exe");
        var pc2 = p2.Evaluate("PlanetCoaster2.exe", @"E:\SteamLibrary\steamapps\common\Planet Coaster 2\PlanetCoaster2.exe");
        Assert.Equal("AntiCheat", pc2.Verdict);
        Assert.False(pc2.InputAllowed);
    }

    [Test]
    public void The_marker_scan_never_lists_a_library_root()
    {
        var (p, probe, _) = Make();
        p.Evaluate("PlanetCoaster2.exe", @"E:\SteamLibrary\steamapps\common\Planet Coaster 2\PlanetCoaster2.exe");
        Assert.Single(probe.Listed);
        Assert.Equal(@"E:\SteamLibrary\steamapps\common\Planet Coaster 2", probe.Listed[0]);
        probe.Listed.Clear();
        p.Evaluate("NMS.exe", @"C:\Program Files (x86)\Steam\steamapps\common\No Man's Sky\Binaries\NMS.exe");
        Assert.Equal(2, probe.Listed.Count);
        Assert.True(probe.Listed.All(f => !f.EndsWith("common", StringComparison.OrdinalIgnoreCase) && !f.EndsWith("Program Files (x86)", StringComparison.OrdinalIgnoreCase)));
    }

    [Test]
    public void Unknown_games_are_off_until_enabled_with_the_warning_and_then_read_only()
    {
        var file = Path.Combine(Fx.TempDir("games"), "games.json");
        var (p, _, user) = Make(file);
        Assert.Equal("Unknown", p.Evaluate("Indie.exe", @"D:\Indie\Indie.exe").Verdict);
        Assert.False(p.Evaluate("Indie.exe").ReadAllowed);
        Assert.False(user.TryEnable("Indie.exe", warningAcknowledged: false, p, null, out var why));
        Assert.Contains("warning", why);
        Assert.True(user.TryEnable("Indie.exe", warningAcknowledged: true, p, @"D:\Indie\Indie.exe", out _));
        var a = p.Evaluate("Indie.exe");
        Assert.Equal("UserEnabled", a.Verdict);
        Assert.True(a.ReadAllowed);
        Assert.False(a.InputAllowed, "input is never sent to games outside the allowlist");
        // Persisted, and re-read by a new instance.
        var again = new GamePolicy(new UserGames(file), new FakeProbe(), new ManualTimeProvider());
        Assert.Equal("UserEnabled", again.Evaluate("Indie.exe").Verdict);
        user.Disable("Indie.exe");
        Assert.Equal("Unknown", p.Evaluate("Indie.exe").Verdict);
        // Allowlisted games can be switched off and on.
        user.Disable("NMS.exe");
        Assert.Equal("UserDisabled", p.Evaluate("NMS.exe").Verdict);
        Assert.True(user.TryEnable("NMS.exe", true, p, null, out _));
        Assert.Equal("Allowlisted", p.Evaluate("NMS.exe").Verdict);
        Assert.Contains("never saved or uploaded", UserGames.Warning);
    }

    [Test]
    public void A_denylisted_entry_planted_in_games_json_is_ignored()
    {
        var dir = Fx.TempDir("games");
        var file = Path.Combine(dir, "games.json");
        File.WriteAllText(file, """{ "v": 1, "enabled": ["Overwatch.exe", "Indie.exe"], "disabled": [] }""");
        var p = new GamePolicy(new UserGames(file), new FakeProbe(), new ManualTimeProvider());
        Assert.Equal("Denied", p.Evaluate("Overwatch.exe").Verdict);
        Assert.Equal("UserEnabled", p.Evaluate("Indie.exe").Verdict);
    }

    [Test(Category = "integration")]
    public void Installed_games_on_this_pc_classify_as_expected_read_only()
    {
        var p = new GamePolicy(new UserGames(null));
        var pc2 = @"E:\SteamLibrary\steamapps\common\Planet Coaster 2\PlanetCoaster2.exe";
        if (!File.Exists(pc2)) Assert.Skip("Planet Coaster 2 is not installed here");
        Assert.Null(p.AntiCheatMarker(pc2), "PC2 ships no anti-cheat");
        var nms = @"C:\Program Files (x86)\Steam\steamapps\common\No Man's Sky\Binaries\NMS.exe";
        if (File.Exists(nms)) Assert.Null(p.AntiCheatMarker(nms), "NMS ships no anti-cheat");
        var df = @"E:\SteamLibrary\steamapps\common\Delta Force\Game\DeltaForce\Binaries\Win64\AnyName.exe";
        if (Directory.Exists(Path.GetDirectoryName(df))) Assert.Equal("AntiCheatExpert", p.AntiCheatMarker(df), "Delta Force's ACE folder is detected");
    }
}

public class GameLinkTests
{
    private const string T1 = "1111111111111111111111111111111111111111111111111111111111111111";
    private const string T2 = "2222222222222222222222222222222222222222222222222222222222222222";

    private static string File_(string dir, int port, string companion) =>
        File_(dir, $$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "api": 1, "port": {{port}}, "baseUrl": "http://127.0.0.1:{{port}}", "tokens": { "cs2": "{{T1}}", "companion": "{{companion}}" }, "pid": {{Environment.ProcessId}}, "version": "0.8.0.0", "startedAt": null }""");

    /// <summary>The fake OS table: Prism Deck (this test's pid, as gamelink.json says) holds the port.</summary>
    private static IReadOnlyCollection<int> Deck(int port) => [Environment.ProcessId];

    private static string File_(string dir, string json)
    {
        var p = Path.Combine(dir, "gamelink.json");
        File.WriteAllText(p, json);
        return p;
    }

    [Test]
    public void Gamelink_json_is_parsed_strictly()
    {
        Assert.Equal(38140, GameLinkFile.Parse($$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": 38140, "tokens": { "cs2": "{{T1}}", "companion": "{{T2}}" } }""")!.Port);
        Assert.Null(GameLinkFile.Parse($$"""{ "v": 2, "plugin": "com.jeremyfhall.prism", "port": 38140, "tokens": { "cs2": "{{T1}}", "companion": "{{T2}}" } }"""));
        Assert.Null(GameLinkFile.Parse($$"""{ "v": 1, "plugin": "evil", "port": 38140, "tokens": { "cs2": "{{T1}}", "companion": "{{T2}}" } }"""));
        Assert.Null(GameLinkFile.Parse($$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": 80, "tokens": { "cs2": "{{T1}}", "companion": "{{T2}}" } }"""));
        Assert.Null(GameLinkFile.Parse($$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": 38140, "tokens": { "cs2": "{{T1}}", "companion": "SHORT" } }"""));
        Assert.Null(GameLinkFile.Parse($$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": "38140", "tokens": { "cs2": "{{T1}}", "companion": "{{T2}}" } }"""));
        Assert.Null(GameLinkFile.Parse("not json"));
    }

    private static SightSnapshot Snap(double bank, SightRunState state = SightRunState.Running, string? ctx = "coasterBuilder", bool rec = false) =>
        new(1, DateTimeOffset.UnixEpoch, state, "syncoaster", "synthetic-coaster", "SyntheticCoaster.exe",
            new SightContext(ctx, "Coaster builder", SightConfidence.Observed, null, ctx is null ? [] : [ctx]),
            new Dictionary<string, SightReadout>
            {
                ["bankAngle"] = new("bankAngle", "Bank", SightValueKind.Number, bank, null, null, "deg", SightConfidence.Observed, 0.97, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, "syn.builder.bankValue"),
                ["builderOpen"] = new("builderOpen", "Builder", SightValueKind.Bool, null, null, true, null, SightConfidence.Observed, 1, null, DateTimeOffset.UnixEpoch, null),
                ["tool"] = new("tool", "Tool", SightValueKind.Label, null, "coaster", null, null, SightConfidence.Inferred, 0.7, null, DateTimeOffset.UnixEpoch, null),
            },
            new Dictionary<string, SightControlState>(), rec, null);

    [Test]
    public void The_state_is_the_companion_v1_shape()
    {
        var s = GameLinkForwarder.BuildState(Snap(-30, rec: true));
        Assert.Equal("live", s["status"]!.GetValue<string>());
        foreach (var k in new[] { "player", "weapon", "stats", "round", "match" }) Assert.True(s.ContainsKey(k) && s[k] is null, k);
        var d = s["detail"]!.AsObject();
        Assert.Equal("coasterBuilder", d["context"]!.GetValue<string>());
        Assert.True(d["rec"]!.GetValue<bool>());
        var bank = d["readouts"]!["bankAngle"]!;
        Assert.Equal(-30.0, bank["v"]!.GetValue<double>());
        Assert.Equal("observed", bank["c"]!.GetValue<string>());
        Assert.Equal("deg", bank["u"]!.GetValue<string>());
        Assert.True(d["readouts"]!["builderOpen"]!["v"]!.GetValue<bool>());
        Assert.Equal("coaster", d["readouts"]!["tool"]!["v"]!.GetValue<string>());
        // plainDetail rules (gamelink-companion.js): keys /^[a-z][a-zA-Z0-9]{0,31}$/, depth ≤ 3.
        void Walk(JsonNode? n, int depth)
        {
            if (n is JsonObject o)
            {
                Assert.True(depth < 3, "depth");
                foreach (var (k, v) in o)
                {
                    Assert.True(System.Text.RegularExpressions.Regex.IsMatch(k, "^[a-z][a-zA-Z0-9]{0,31}$"), $"key {k}");
                    Walk(v, depth + 1);
                }
            }
        }
        Walk(d, 0);
        Assert.Equal("paused", GameLinkForwarder.BuildState(Snap(0, SightRunState.Paused))["status"]!.GetValue<string>());
    }

    private sealed class Recorder : HttpMessageHandler
    {
        public readonly List<(HttpRequestMessage Req, string Body)> Requests = [];
        public HttpStatusCode Status = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            lock (Requests) Requests.Add((request, body));
            return new HttpResponseMessage(Status) { Content = new StringContent("{}") };
        }
    }

    [Test]
    public async Task Posts_carry_the_bearer_to_loopback_snapshots_are_coalesced_and_events_go_at_once()
    {
        var dir = Fx.TempDir("gl");
        var time = new ManualTimeProvider();
        var rec = new Recorder();
        await using var f = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = File_(dir, 38141, T2), Handler = rec, Time = time, ListenerPids = Deck });
        f.OnSnapshot(Snap(-30));
        await f.PumpAsync(default);
        var first = Assert.Single(rec.Requests);
        Assert.Equal("http://127.0.0.1:38141/v1/companion", first.Req.RequestUri!.ToString());
        Assert.Equal("Bearer", first.Req.Headers.Authorization!.Scheme);
        Assert.Equal(T2, first.Req.Headers.Authorization.Parameter);
        Assert.Equal("application/json", first.Req.Content!.Headers.ContentType!.MediaType);
        var body = JsonNode.Parse(first.Body)!;
        Assert.Equal(1, body["v"]!.GetValue<int>());
        Assert.Equal("prism-sight", body["source"]!.GetValue<string>());
        Assert.Equal("syncoaster", body["game"]!.GetValue<string>());
        Assert.NotNull(body["state"]);
        // 40 changes in one second → at most 4 more posts (≤ 4/s).
        for (var i = 0; i < 40; i++)
        {
            time.Advance(TimeSpan.FromMilliseconds(25));
            f.OnSnapshot(Snap(i));
            await f.PumpAsync(default);
        }
        Assert.InRange(rec.Requests.Count - 1, 3, 4);
        // An event goes out at once, even right after a snapshot.
        var before = rec.Requests.Count;
        f.OnEvent(new SightEvent("context", time.GetUtcNow(), new Dictionary<string, object?> { ["value"] = "testResults", ["from"] = "coasterBuilder" }));
        await f.PumpAsync(default);
        Assert.Equal(before + 1, rec.Requests.Count);
        var ev = JsonNode.Parse(rec.Requests[^1].Body)!["events"]![0]!;
        Assert.Equal("context", ev["type"]!.GetValue<string>());
        Assert.Equal("testResults", ev["value"]!.GetValue<string>());
        // Sequence numbers rise; the session is constant.
        var seqs = rec.Requests.Select(r => JsonNode.Parse(r.Body)!["seq"]!.GetValue<long>()).ToList();
        Assert.True(seqs.SequenceEqual(seqs.Order()) && seqs.Distinct().Count() == seqs.Count);
        Assert.Single(rec.Requests.Select(r => JsonNode.Parse(r.Body)!["session"]!.GetValue<string>()).Distinct());
    }

    [Test]
    public async Task An_unchanged_state_is_only_re_sent_as_a_heartbeat()
    {
        var dir = Fx.TempDir("gl");
        var time = new ManualTimeProvider();
        var rec = new Recorder();
        await using var f = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = File_(dir, 38142, T2), Handler = rec, Time = time, ListenerPids = Deck });
        f.OnSnapshot(Snap(10));
        await f.PumpAsync(default);
        for (var i = 0; i < 18; i++) { time.Advance(TimeSpan.FromMilliseconds(250)); f.OnSnapshot(Snap(10)); await f.PumpAsync(default); }
        Assert.Equal(1, rec.Requests.Count, "4.5 s of identical state: no posts");
        time.Advance(TimeSpan.FromMilliseconds(600));
        await f.PumpAsync(default);
        Assert.Equal(2, rec.Requests.Count, "the 5 s heartbeat");
    }

    [Test]
    public async Task A_401_rereads_the_rotated_token_and_idle_states_are_never_posted()
    {
        var dir = Fx.TempDir("gl");
        var time = new ManualTimeProvider();
        var rec = new Recorder { Status = HttpStatusCode.Unauthorized };
        var file = File_(dir, 38143, T2);
        await using var f = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = file, Handler = rec, Time = time, ListenerPids = Deck });
        f.OnSnapshot(Snap(5));
        await f.PumpAsync(default);
        Assert.Equal(HttpStatusCode.Unauthorized, f.LastStatus);
        File_(dir, 38144, T1);   // Prism Deck rotated the token and moved the port
        rec.Status = HttpStatusCode.OK;
        time.Advance(TimeSpan.FromSeconds(3));
        await f.PumpAsync(default);
        var last = rec.Requests[^1];
        Assert.Equal(T1, last.Req.Headers.Authorization!.Parameter);
        Assert.Equal(38144, last.Req.RequestUri!.Port);
        Assert.NotNull(JsonNode.Parse(last.Body)!["state"], "after a failure the full state is sent again");
        var n = rec.Requests.Count;
        f.OnSnapshot(Snap(5, SightRunState.Idle));
        time.Advance(TimeSpan.FromSeconds(10));
        await f.PumpAsync(default);
        Assert.Equal(n, rec.Requests.Count, "nothing is posted without a game");
    }

    [Test]
    public async Task Safe_mode_builds_posts_but_never_sends_them()
    {
        var rec = new Recorder();
        var time = new ManualTimeProvider();
        await using var f = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = File_(Fx.TempDir("gl"), 38145, T2), Handler = rec, Time = time, ListenerPids = Deck, SafeMode = true });
        f.OnSnapshot(Snap(1));
        await f.PumpAsync(default);
        Assert.Empty(rec.Requests);
        Assert.Single(f.RecentBodies);
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task A_real_loopback_listener_gets_exact_host_no_origin_and_a_body_prism_deck_accepts()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var dir = Fx.TempDir("gl");
        var serve = Task.Run(async () =>
        {
            using var c = await listener.AcceptTcpClientAsync();
            using var s = c.GetStream();
            var buf = new byte[65536];
            var got = new StringBuilder();
            while (!got.ToString().Contains("\r\n\r\n")) { var n = await s.ReadAsync(buf); if (n == 0) break; got.Append(Encoding.UTF8.GetString(buf, 0, n)); }
            var head = got.ToString();
            var len = int.Parse(head.Split("\r\n").First(l => l.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)).Split(':')[1].Trim());
            var bodyStart = head.IndexOf("\r\n\r\n", StringComparison.Ordinal) + 4;
            while (Encoding.UTF8.GetByteCount(head[bodyStart..]) < len) { var n = await s.ReadAsync(buf); head += Encoding.UTF8.GetString(buf, 0, n); }
            await s.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"));
            return head;
        });
        await using (var f = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = File_(dir, port, T2) }))
        {
            f.OnSnapshot(Snap(-30));
            await f.PumpAsync(default);
            Assert.Equal(1, f.Posted, f.LastError);
        }
        var request = await serve;
        listener.Stop();
        Assert.Contains($"Host: 127.0.0.1:{port}\r\n", request);
        Assert.DoesNotContain("Origin:", request);
        Assert.Contains($"Authorization: Bearer {T2}", request);
        Assert.Contains("POST /v1/companion HTTP/1.1", request);
        // Feed the body to Prism Deck's own pure normalizer (read-only use of its source) when Node is available.
        var body = request[(request.IndexOf("\r\n\r\n", StringComparison.Ordinal) + 4)..];
        var companion = @"E:\Development Workspaces\Prism-ds\prism-deck\src\apps\sources\gamelink-companion.js";
        if (!File.Exists(companion)) return;
        var bodyFile = Path.Combine(dir, "body.json");
        File.WriteAllText(bodyFile, body);
        var script = Path.Combine(dir, "check.mjs");
        File.WriteAllText(script, $$"""
            import { normalizeCompanion } from '{{new Uri(companion).AbsoluteUri}}';
            import fs from 'node:fs';
            const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
            const r = normalizeCompanion(body, null, { nowMs: 1000 });
            if (r.error) { console.log('ERROR ' + r.error); process.exit(1); }
            console.log('OK ' + JSON.stringify({ game: r.state.game, status: r.state.status, ctx: r.state[r.state.game].context, bank: r.state[r.state.game].readouts.bankAngle }));
            """);
        var psi = new ProcessStartInfo("node", $"\"{script}\" \"{bodyFile}\"") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        Process? p;
        try { p = Process.Start(psi); }
        catch (System.ComponentModel.Win32Exception) { return; }   // no Node: the C# shape test above still holds
        using (p)
        {
            var output = await p!.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(20_000)) { p.Kill(true); Assert.Fail("node did not finish"); }
            Assert.Equal(0, p.ExitCode, output + await p.StandardError.ReadToEndAsync());
            Assert.Contains("\"game\":\"syncoaster\"", output);
            Assert.Contains("\"ctx\":\"coasterBuilder\"", output);
            Assert.Contains("\"bank\":{\"c\":\"observed\",\"v\":-30,\"u\":\"deg\"}", output);
        }
    }
}
