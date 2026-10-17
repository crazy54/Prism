using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using PrismControl.Core.Render;
using PrismControl.FakeHost;
using PrismControl.Testing;
using PrismControl.Tools;

namespace PrismControl.Tests;

/// <summary>
/// End-to-end: the PUBLISHED single-file exe against the fake Stream Deck app (category "e2e").
/// Exe: PRISM_CONTROL_EXE or dist/com.jeremyfhall.prismcontrol.sdPlugin/bin/PrismControl.exe; the plugin folder is the
/// exe's .sdPlugin when it sits in one (so a packed copy outside dist/ is tested as a whole).
/// Each test gets its own user folder (PRISM_CONTROL_DIR) and kills its plugin process on exit.
/// SAFETY: every launch runs in safe mode (FakeStreamDeck.Launch forces PRISM_CONTROL_SAFE_MODE=1 and
/// PRISM_CONTROL_MACROS_DRY_RUN=1, and StartAsync checks /v1/health says so before anything is placed), and only the
/// sample and diagnostics actions may be placed unless a test allows a UUID explicitly.
/// </summary>
public sealed class EndToEndTests : IAsyncDisposable
{
    private const string Diagnostics = "com.jeremyfhall.prismcontrol.core.diagnostics";
    private const string Level = "com.jeremyfhall.prismcontrol.audio.sample-level";
    private const string Band = "com.jeremyfhall.prismcontrol.eq.sample-band";
    private const string Counter = "com.jeremyfhall.prismcontrol.macros.sample-counter";
    private const string Memory = "com.jeremyfhall.prismcontrol.system.sample-memory";
    private const string NowPlaying = "com.jeremyfhall.prismcontrol.spotify.sample-now-playing";
    private const string Hotkey = "com.jeremyfhall.prismcontrol.macros.hotkey";

    private readonly string _userDir = Path.Combine(Path.GetTempPath(), "prismcontrol-e2e-" + Guid.NewGuid().ToString("N")[..8]);
    private FakeStreamDeck? _host;

    private static string DistPluginDir => Path.Combine(Repo.Root, "dist", Packer.PluginUuid + ".sdPlugin");

    /// <summary>The .sdPlugin folder holding <see cref="Exe"/> (bin/PrismControl.exe), else dist/.</summary>
    public static string PluginDir
    {
        get
        {
            var bin = Path.GetDirectoryName(Path.GetFullPath(Exe));
            var dir = bin is null ? null : Path.GetDirectoryName(bin);
            return dir is not null && dir.EndsWith(".sdPlugin", StringComparison.OrdinalIgnoreCase) && File.Exists(Path.Combine(dir, "manifest.json")) ? dir : DistPluginDir;
        }
    }

    public static string Exe
    {
        get
        {
            var exe = Environment.GetEnvironmentVariable("PRISM_CONTROL_EXE") ?? Path.Combine(DistPluginDir, "bin", "PrismControl.exe");
            if (!File.Exists(exe))
            {
                if (Environment.GetEnvironmentVariable("PRISM_CONTROL_REQUIRE_E2E") == "1") Assert.Fail("published exe not found: " + exe);
                Assert.Skip("published exe not found (run tools/build.ps1): " + exe);
            }
            return exe;
        }
    }

    private async Task<FakeStreamDeck> StartAsync(bool demo = false, JsonObject? globals = null, IReadOnlyList<FakeDevice>? devices = null,
        IReadOnlyCollection<string>? allowRealActions = null)
    {
        var exe = Exe;
        _host = await FakeStreamDeck.StartAsync(new FakeHostOptions
        {
            Devices = devices ?? [FakeDevice.Galleon(), FakeDevice.Plus()],
            GlobalSettings = globals ?? new JsonObject(),
            AllowRealActions = allowRealActions ?? [],
        });
        _host.Launch(exe, new Dictionary<string, string?>
        {
            ["PRISM_CONTROL_DIR"] = _userDir,
            ["PRISM_CONTROL_DEMO_DATA"] = demo ? "1" : null,
            ["PRISM_CONTROL_RECONNECT_SECONDS"] = "8",
            ["PRISM_CONTROL_LOG_LEVEL"] = "debug",
        });
        Assert.True(await _host.WaitForRegistrationAsync(TimeSpan.FromSeconds(20)), "the plugin did not register within 20 s" + LogTail());
        await _host.WaitForAsync(m => m.Event == "getGlobalSettings", TimeSpan.FromSeconds(5));
        // Nothing is placed before the plugin confirms safe mode: module writes are no-ops and Macros sends no input.
        var (safeMode, dryRun) = await FakeHostCli.ReadSafetyAsync(_userDir);
        Assert.True(safeMode == true, "the plugin must report safeMode: true in /v1/health under the fake host" + LogTail());
        Assert.True(dryRun == true, "the plugin must report macrosDryRun: true in /v1/health under the fake host" + LogTail());
        return _host;
    }

    private async Task<string> WaitForLogAsync(string text, TimeSpan timeout)
    {
        var sw = Stopwatch.StartNew();
        while (true)
        {
            var log = ReadLog();
            if (log.Contains(text, StringComparison.Ordinal)) return log;
            if (sw.Elapsed > timeout) { Assert.Fail($"log never contained \"{text}\"" + LogTail()); return log; }
            await Task.Delay(100);
        }
    }

    private string ReadLog()
    {
        var log = Path.Combine(_userDir, "logs", "prismcontrol.log");
        try
        {
            if (!File.Exists(log)) return "";
            using var fs = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            return new StreamReader(fs).ReadToEnd();
        }
        catch (IOException) { return ""; }
    }

    private string LogTail()
    {
        var log = Path.Combine(_userDir, "logs", "prismcontrol.log");
        try
        {
            if (!File.Exists(log)) return "";
            using var fs = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var lines = new StreamReader(fs).ReadToEnd().Split('\n');
            return "\n--- plugin log ---\n" + string.Join("\n", lines.TakeLast(30));
        }
        catch (IOException ex) { return "\n(log unreadable: " + ex.Message + ")"; }
    }

    private static void AssertSvgFrame(ReceivedMessage m, SvgCanvas canvas)
    {
        string? uri = m.Event == "setImage" ? m.Payload?["image"]?.GetValue<string>() : null;
        if (m.Event == "setFeedback")
            foreach (var (_, v) in m.Payload!)
                if (v is JsonValue jv && jv.TryGetValue<string>(out var s) && s.StartsWith("data:", StringComparison.Ordinal)) uri = s;
        if (uri is null) return;
        Assert.True(uri.StartsWith("data:image/svg+xml,", StringComparison.Ordinal), "frames must be data:image/svg+xml URLs");
        var errors = SvgLint.Check(uri, canvas).Where(i => i.Severity == LintSeverity.Error).ToList();
        Assert.Empty(errors, $"{m.Event} for {m.Context}");
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Galleon_profile_appears_renders_and_takes_input()
    {
        var host = await StartAsync(allowRealActions: ["com.jeremyfhall.prismcontrol.does-not-exist"]);
        var g = host.Options.Devices[0];
        string[] keyActions = [Counter, Memory, NowPlaying, Level, Diagnostics, Counter, Memory, NowPlaying, Level, Diagnostics, Counter, Memory];
        var keys = new List<string>();
        for (var i = 0; i < 12; i++) keys.Add(await host.AppearAsync(g, keyActions[i], i % 3, i / 3));
        var widgets = new Dictionary<string, string>
        {
            ["0,0"] = await host.AppearAsync(g, Level, 0, 0, encoder: true),
            ["0,1"] = await host.AppearAsync(g, Band, 0, 1, encoder: true),
            ["1,0"] = await host.AppearAsync(g, Diagnostics, 1, 0, encoder: true),
            ["1,1"] = await host.AppearAsync(g, Band, 1, 1, encoder: true),
        };
        foreach (var k in keys) await host.WaitForAsync(m => m.Context == k && m.Event == "setImage", TimeSpan.FromSeconds(10));
        foreach (var (pos, w) in widgets)
        {
            await host.WaitForAsync(m => m.Context == w && m.Event == "setFeedbackLayout", TimeSpan.FromSeconds(10));
            await host.WaitForAsync(m => m.Context == w && m.Event == "setFeedback", TimeSpan.FromSeconds(10));
        }
        foreach (var m in host.Received.Where(m => m.Event == "setImage")) AssertSvgFrame(m, SvgCanvas.Key);
        foreach (var m in host.Received.Where(m => m.Event == "setFeedback")) AssertSvgFrame(m, SvgCanvas.Dial);

        // Layout before feedback, per widget.
        foreach (var w in widgets.Values)
        {
            var seq = host.ReceivedFor(w).Where(m => m.IsRenderUpdate).Select(m => m.Event).ToList();
            Assert.Equal("setFeedbackLayout", seq[0], "first update for " + w);
        }

        // Key press on the counter: settings persisted (camelCase) and a new image.
        var counter = keys[0];
        var mark = host.NowMs;
        await host.PressAsync(counter);
        await host.WaitForAsync(m => m.Context == counter && m.Event == "setSettings" && m.Payload?["count"]?.GetValue<int>() == 1, TimeSpan.FromSeconds(5), mark);
        await host.WaitForAsync(m => m.Context == counter && m.Event == "setImage", TimeSpan.FromSeconds(5), mark);
        Assert.Equal(1, host.StoredSettings(counter)!["count"]!.GetValue<int>());

        // Galleon spins arrive aggregated (±12): the EQ band moves 6 dB and redraws.
        var band = widgets["0,1"];
        mark = host.NowMs;
        await host.DialRotateAsync(band, 12);
        await host.WaitForAsync(m => m.Context == band && m.Event == "setSettings" && Math.Abs(m.Payload!["gainDb"]!.GetValue<double>() - 6) < 0.01, TimeSpan.FromSeconds(5), mark);
        await host.WaitForAsync(m => m.Context == band && m.Event == "setFeedback", TimeSpan.FromSeconds(5), mark);

        // A short dial press works on Galleon (reset to 0 dB).
        mark = host.NowMs;
        await host.DialDownAsync(band);
        await Task.Delay(80);
        await host.DialUpAsync(band);
        await host.WaitForAsync(m => m.Context == band && m.Event == "setSettings" && m.Payload!["gainDb"]!.GetValue<double>() == 0, TimeSpan.FromSeconds(5), mark);

        // Unknown action: ignored, plugin keeps working.
        await host.AppearAsync(g, "com.jeremyfhall.prismcontrol.does-not-exist", 0, 0);
        mark = host.NowMs;
        await host.PressAsync(counter);
        await host.WaitForAsync(m => m.Context == counter && m.Event == "setSettings", TimeSpan.FromSeconds(5), mark);

        // willDisappear stops rendering for that context.
        await host.DisappearAsync(keys[1]);
        await Task.Delay(1500);
        var after = host.NowMs;
        await Task.Delay(1500);
        Assert.Empty(host.ReceivedFor(keys[1]).Where(m => m.Ms > after && m.IsRenderUpdate));
        Assert.False(host.Process!.HasExited, "plugin crashed" + LogTail());
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Plus_dials_touch_and_keys()
    {
        var host = await StartAsync(devices: [FakeDevice.Plus()]);
        var p = host.Options.Devices[0];
        var keys = new List<string>();
        for (var i = 0; i < 8; i++) keys.Add(await host.AppearAsync(p, i % 2 == 0 ? Level : Counter, i % 4, i / 4));
        var dials = new List<string>();
        for (var i = 0; i < 4; i++) dials.Add(await host.AppearAsync(p, i % 2 == 0 ? Level : Band, i, 0, encoder: true));
        foreach (var d in dials) await host.WaitForAsync(m => m.Context == d && m.Event == "setFeedback", TimeSpan.FromSeconds(10));
        foreach (var k in keys) await host.WaitForAsync(m => m.Context == k && m.Event == "setImage", TimeSpan.FromSeconds(10));

        // Touch at x=150 of 200 sets the sample level to 75%; the value layout shows it.
        var level = dials[0];
        var mark = host.NowMs;
        await host.TouchTapAsync(level, 150, 50);
        var fb = await host.WaitForAsync(m => m.Context == level && m.Event == "setFeedback" && m.Payload?["value"] is not null, TimeSpan.FromSeconds(5), mark);
        Assert.Contains("75%", fb.Payload!["value"]!.ToJsonString());
        Assert.Equal(75, host.StoredSettings(level)!["level"]!.GetValue<int>());

        // ±1 ticks.
        mark = host.NowMs;
        await host.DialRotateAsync(level, -1);
        await host.WaitForAsync(m => m.Context == level && m.Event == "setSettings" && m.Payload!["level"]!.GetValue<int>() == 73, TimeSpan.FromSeconds(5), mark);

        // Dial press toggles mute (shown as MUTED).
        mark = host.NowMs;
        await host.DialDownAsync(level);
        await Task.Delay(60);
        await host.DialUpAsync(level);
        var muted = await host.WaitForAsync(m => m.Context == level && m.Event == "setFeedback" && (m.Payload?["value"]?.ToJsonString().Contains("MUTED") ?? false), TimeSpan.FromSeconds(5), mark);
        Assert.NotNull(muted);
        Assert.False(host.Process!.HasExited, "plugin crashed" + LogTail());
    }

    [Test(Category = "e2e", TimeoutMs = 90_000)]
    public async Task Update_budget_holds_under_a_stress_flood_and_follows_global_settings()
    {
        var host = await StartAsync();
        var stress = new JsonObject { ["stressFps"] = 60 };
        var contexts = new List<string>();
        foreach (var d in host.Options.Devices)
        {
            for (var i = 0; i < d.Columns * d.Rows; i++) contexts.Add(await host.AppearAsync(d, Diagnostics, i % d.Columns, i / d.Columns, settings: stress));
            var slots = d.Type == 12 ? new[] { (0, 0), (0, 1), (1, 0), (1, 1) } : [(0, 0), (1, 0), (2, 0), (3, 0)];
            foreach (var (c, r) in slots) contexts.Add(await host.AppearAsync(d, Diagnostics, c, r, encoder: true, settings: stress));
        }
        // 28 contexts asking for 60 frames/s each = 1,680 frames/s requested.
        var start = host.NowMs;
        await Task.Delay(5000);
        var rate = host.RenderRate(start + 2000, host.NowMs);
        Assert.True(rate.MaxInAnyOneSecond <= 62, $"budget 60/s exceeded: worst 1 s window {rate.MaxInAnyOneSecond}");
        Assert.True(rate.AveragePerSecond >= 45, $"budget underused: {rate.AveragePerSecond:0.0}/s");
        var served = host.Received.Where(m => m.IsRenderUpdate && m.Ms > start).Select(m => m.Context).Distinct().Count();
        Assert.True(served >= contexts.Count - 1, $"only {served}/{contexts.Count} contexts got frames (fairness)");

        // The PI changes core.updateBudget to 30.
        await host.GlobalSettingsFromPropertyInspectorAsync(new JsonObject { ["core"] = new JsonObject { ["updateBudget"] = 30 } });
        var start2 = host.NowMs;
        await Task.Delay(4000);
        var rate2 = host.RenderRate(start2 + 1500, host.NowMs);
        Assert.True(rate2.MaxInAnyOneSecond <= 32, $"budget 30/s exceeded: {rate2.MaxInAnyOneSecond}");
        Assert.True(rate2.AveragePerSecond >= 22, $"30/s budget underused: {rate2.AveragePerSecond:0.0}");
        Assert.False(host.Process!.HasExited, "plugin crashed" + LogTail());
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Property_inspector_round_trip()
    {
        var host = await StartAsync();
        var g = host.Options.Devices[0];
        var ctx = await host.AppearAsync(g, Diagnostics, 0, 0);
        await host.PropertyInspectorDidAppearAsync(ctx);
        await host.SendToPluginAsync(ctx, new JsonObject { ["type"] = "pi.ready" });
        var hello = await host.WaitForAsync(m => m.Context == ctx && m.Event == "sendToPropertyInspector" && m.Payload?["type"]?.GetValue<string>() == "pi.hello", TimeSpan.FromSeconds(5));
        Assert.Equal(Diagnostics, hello.Raw["action"]!.GetValue<string>());
        var data = hello.Payload!["data"]!;
        Assert.True(data["device"]!["isGalleon"]!.GetValue<bool>());
        Assert.True(data["form"]!["fields"]!.AsArray().Count >= 2);
        // PI edits settings: the plugin follows (stress on -> frames keep coming).
        await host.SettingsFromPropertyInspectorAsync(ctx, new JsonObject { ["stressFps"] = 10 });
        var mark = host.NowMs;
        await Task.Delay(1500);
        Assert.True(host.ReceivedFor(ctx, "setImage").Count(m => m.Ms > mark) >= 5, "stress setting from the PI did not apply");
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Reconnects_after_a_dropped_socket()
    {
        var host = await StartAsync();
        var g = host.Options.Devices[0];
        await host.AppearAsync(g, Counter, 0, 0);
        host.AbortConnection();
        Assert.True(await host.WaitForRegistrationAsync(TimeSpan.FromSeconds(10)), "no re-registration after a drop" + LogTail());
        Assert.Equal(2, host.Registrations);
        await host.WaitForAsync(m => m.Event == "getGlobalSettings" && m.Ms > 0, TimeSpan.FromSeconds(5));
        var ctx = await host.AppearAsync(g, Counter, 0, 0);
        await host.WaitForAsync(m => m.Context == ctx && m.Event == "setImage", TimeSpan.FromSeconds(10));
        Assert.False(host.Process!.HasExited);
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Normal_close_exits_cleanly_and_removes_the_control_file()
    {
        var host = await StartAsync();
        var control = Path.Combine(_userDir, "control.json");
        var o = JsonNode.Parse(File.ReadAllText(control))!;
        Assert.Equal(host.Process!.Id, o["pid"]!.GetValue<int>());
        Assert.Equal(64, o["token"]!.GetValue<string>().Length);
        await host.CloseNormallyAsync();
        Assert.True(await host.WaitForExitAsync(TimeSpan.FromSeconds(8)), "plugin did not exit after the app closed the socket" + LogTail());
        Assert.Equal(0, host.Process.ExitCode);
        Assert.False(File.Exists(control), "control.json must be deleted on exit");
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Data_api_serves_every_endpoint_with_the_auth_handshake()
    {
        await StartAsync(demo: true);
        var control = JsonNode.Parse(File.ReadAllText(Path.Combine(_userDir, "control.json")))!;
        var baseUrl = control["baseUrl"]!.GetValue<string>();
        var token = control["token"]!.GetValue<string>();
        using var http = new HttpClient();
        async Task<(int, JsonNode?, HttpResponseMessage)> Get(string path, bool auth = true, string? origin = null)
        {
            var r = new HttpRequestMessage(HttpMethod.Get, baseUrl + path);
            if (auth) r.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (origin is not null) r.Headers.Add("Origin", origin);
            var resp = await http.SendAsync(r);
            var body = resp.Content.Headers.ContentType?.MediaType == "application/json" ? JsonNode.Parse(await resp.Content.ReadAsStringAsync()) : null;
            return ((int)resp.StatusCode, body, resp);
        }
        await Task.Delay(1500); // demo + systeminfo publish at 1 Hz
        var (hs, health, _) = await Get("/v1/health");
        Assert.Equal(200, hs);
        Assert.Equal("ok", health!["status"]!.GetValue<string>());
        Assert.True(health["streamDeck"]!["connected"]!.GetValue<bool>());
        Assert.Equal(2, health["streamDeck"]!["devices"]!.AsArray().Count);
        var (ss, sys, _) = await Get("/v1/system");
        Assert.Equal(200, ss);
        Assert.Equal("systeminfo", sys!["source"]!.GetValue<string>()); // the real provider replaces the demo one
        Assert.True(sys["data"]!["memory"]!["totalMiB"]!.GetValue<double>() > 0);
        // The real Spotify claim replaces the demo one too, so the payload depends on what this PC is playing.
        var (ns, np, _) = await Get("/v1/now-playing?art=dataUrl");
        Assert.True(ns is 200 or 503, $"now-playing answered {ns}");
        if (ns == 200)
        {
            Assert.Equal("spotify", np!["source"]!.GetValue<string>());
            Assert.False(np["demo"]!.GetValue<bool>());
        }
        var (arts, _, artResp) = await Get("/v1/now-playing/art");
        Assert.True(arts is 200 or 404 or 503, $"now-playing/art answered {arts}");
        if (arts == 200) Assert.True(artResp.Content.Headers.ContentType!.MediaType is "image/jpeg" or "image/png");
        await Get("/v1/cooling"); // demand-driven: the first request may answer 503 while iCUE connects
        await Task.Delay(300);
        var (cs, cooling, _) = await Get("/v1/cooling");
        Assert.True(cs is 200 or 503, $"cooling answered {cs}");
        if (cs == 200) Assert.Equal("cooling", cooling!["source"]!.GetValue<string>());
        await Get("/v1/audio/levels"); // first request starts demand-driven metering
        await Task.Delay(200);
        Assert.Equal(200, (await Get("/v1/audio/levels")).Item1);
        Assert.Equal(200, (await Get("/v1/audio/devices")).Item1);
        Assert.Equal(200, (await Get("/v1/mic")).Item1);
        Assert.Equal(401, (await Get("/v1/health", auth: false)).Item1);
        Assert.Equal(403, (await Get("/v1/health", origin: "https://evil.example")).Item1);

        // Node's fetch (what the sibling plugin uses) must be accepted (it sends sec-fetch-mode but no Origin).
        var node = FindNode();
        if (node is not null)
        {
            var script = $"fetch('{baseUrl}/v1/health',{{headers:{{authorization:'Bearer {token}'}}}}).then(r=>{{console.log(r.status);process.exit(r.status===200?0:1)}}).catch(e=>{{console.error(e);process.exit(2)}})";
            var psi = new ProcessStartInfo(node) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
            psi.ArgumentList.Add("-e");
            psi.ArgumentList.Add(script);
            using var p = Process.Start(psi)!;
            var output = await p.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(15_000)) { p.Kill(true); Assert.Fail("node fetch timed out"); }
            Assert.Equal(0, p.ExitCode, "node fetch got " + output.Trim());
        }
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Selftest_passes_on_the_published_exe()
    {
        var psi = new ProcessStartInfo(Exe) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        psi.ArgumentList.Add("--selftest");
        psi.Environment["PRISM_CONTROL_DIR"] = _userDir;
        using var p = Process.Start(psi)!;
        var stdout = await p.StandardOutput.ReadToEndAsync();
        if (!p.WaitForExit(30_000)) { p.Kill(true); Assert.Fail("selftest timed out"); }
        var report = JsonNode.Parse(stdout)!;
        var failed = report["checks"]!.AsArray().Where(c => !c!["ok"]!.GetValue<bool>()).Select(c => c!.ToJsonString()).ToList();
        Assert.Empty(failed);
        Assert.Equal(0, p.ExitCode);
        Assert.True(report["singleFile"]!.GetValue<bool>(), "expected the single-file publish");
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Packed_plugin_and_bundle_are_valid()
    {
        _ = Exe;
        Assert.Empty(PluginValidator.ValidatePlugin(PluginDir));
        var bundle = Path.Combine(Path.GetDirectoryName(PluginDir)!, Packer.PluginUuid + ".streamDeckPlugin");
        using var zip = ZipFile.OpenRead(bundle);
        var names = zip.Entries.Select(e => e.FullName.Replace('\\', '/')).ToList();
        Assert.True(names.All(n => n.StartsWith(Packer.PluginUuid + ".sdPlugin/", StringComparison.Ordinal)), "zip root must be the .sdPlugin folder");
        foreach (var required in new[] { "manifest.json", "bin/PrismControl.exe", "layouts/prism-canvas.json", "pi/default.html", "pi/lib/prism-pi.js", "imgs/plugin/icon.png" })
            Assert.True(names.Contains(Packer.PluginUuid + ".sdPlugin/" + required), required);

        // The packed manifest is exactly what the shipped exe generates, plus the Profiles the packer merges in from
        // src/*/plugin/profiles/profiles.manifest.json (each one's .streamDeckProfile is checked by the validator above).
        var tmp = Path.Combine(_userDir, "emitted.json");
        Directory.CreateDirectory(_userDir);
        var packed = JsonNode.Parse(File.ReadAllText(Path.Combine(PluginDir, "manifest.json")))!;
        if (packed["Profiles"] is JsonArray profiles)
        {
            foreach (var profile in profiles)
                Assert.True(names.Contains(Packer.PluginUuid + ".sdPlugin/" + profile!["Name"]!.GetValue<string>() + ".streamDeckProfile"), "bundled profile " + profile["Name"]);
            packed.AsObject().Remove("Profiles");
        }
        var psi = new ProcessStartInfo(Exe) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
        foreach (var a in new[] { "--emit-manifest", tmp, "--version", packed["Version"]!.GetValue<string>() }) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        await p.StandardOutput.ReadToEndAsync();
        p.WaitForExit(30_000);
        Assert.Equal(packed.ToJsonString(), JsonNode.Parse(File.ReadAllText(tmp))!.ToJsonString());
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Health_reports_safe_mode_and_the_log_says_so_loudly()
    {
        await StartAsync();
        var control = JsonNode.Parse(File.ReadAllText(Path.Combine(_userDir, "control.json")))!;
        using var http = new HttpClient();
        using var req = new HttpRequestMessage(HttpMethod.Get, control["baseUrl"]!.GetValue<string>() + "/v1/health");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", control["token"]!.GetValue<string>());
        using var resp = await http.SendAsync(req);
        var health = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.True(health["safeMode"]!.GetValue<bool>());
        Assert.True(health["macrosDryRun"]!.GetValue<bool>());
        await WaitForLogAsync("SAFE MODE ON", TimeSpan.FromSeconds(5));
    }

    [Test(Category = "e2e", TimeoutMs = 60_000)]
    public async Task Macros_send_nothing_under_the_dry_run()
    {
        var host = await StartAsync(allowRealActions: [Hotkey]);
        // The engine was built with the logging sink and launcher before anything can be pressed.
        await WaitForLogAsync("Macro engine ready (DRY RUN", TimeSpan.FromSeconds(10));
        var g = host.Options.Devices[0];
        var ctx = await host.AppearAsync(g, Hotkey, 0, 0, settings: new JsonObject { ["chord"] = "F24", ["label"] = "E2E" });
        await host.WaitForAsync(m => m.Context == ctx && m.Event == "setImage", TimeSpan.FromSeconds(10));
        await host.PressAsync(ctx);
        // Either the dry-run sink logged what it would have sent, or the engine refused (an elevated foreground window):
        // in both cases nothing reached SendInput.
        var sw = Stopwatch.StartNew();
        string log;
        do
        {
            await Task.Delay(100);
            log = ReadLog();
        } while (!log.Contains("[dry run] would send", StringComparison.Ordinal) && !log.Contains("not sent:", StringComparison.Ordinal) && sw.Elapsed < TimeSpan.FromSeconds(10));
        Assert.True(log.Contains("[dry run] would send", StringComparison.Ordinal) || log.Contains("not sent:", StringComparison.Ordinal), "the hotkey never ran" + LogTail());
        Assert.DoesNotContain("Macro engine ready (live)", log);
        Assert.False(host.Process!.HasExited, "plugin crashed" + LogTail());
    }

    [Test(Category = "e2e", TimeoutMs = 90_000)]
    public async Task Fake_host_cli_refuses_real_actions_and_runs_the_safe_set_in_safe_mode()
    {
        var exe = Exe;
        var refusedOut = new StringWriter();
        var refusedErr = new StringWriter();
        var refused = await FakeHostCli.RunAsync(new FakeHostCliOptions { Exe = exe, Actions = ["com.jeremyfhall.prismcontrol.example.ungated"], Seconds = 1 }, refusedOut, refusedErr);
        Assert.Equal(2, refused.ExitCode);
        Assert.Contains("--allow-real-actions", refusedErr.ToString());
        Assert.Empty(refused.PlacedActions);
        Assert.DoesNotContain("registered", refusedOut.ToString()); // the plugin was never started

        var stdout = new StringWriter();
        var run = await FakeHostCli.RunAsync(new FakeHostCliOptions { Exe = exe, Device = "galleon", Seconds = 2, UserDir = _userDir }, stdout, new StringWriter());
        Assert.Equal(0, run.ExitCode, stdout.ToString() + LogTail());
        Assert.True(run.SafeMode == true && run.MacrosDryRun == true, stdout.ToString());
        Assert.True(run.PlacedActions.Count >= 12, $"placed {run.PlacedActions.Count}");
        Assert.True(run.PlacedActions.All(FakeHostSafety.IsSafe), "placed: " + string.Join(", ", run.PlacedActions.Distinct()));
        Assert.Contains("plugin safe mode: on", stdout.ToString());
    }

    private static string? FindNode()
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var candidate = Path.Combine(dir, "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    public async ValueTask DisposeAsync()
    {
        if (_host is not null) await _host.DisposeAsync();
        try { if (Directory.Exists(_userDir)) Directory.Delete(_userDir, true); } catch { }
    }
}
