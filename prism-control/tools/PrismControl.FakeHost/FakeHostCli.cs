using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.FakeHost;

/// <summary>
/// Why the fake host is safe to run on a real PC. It places actions and presses them at random; with the real modules
/// loaded that would change the volume, default devices, Sonar EQ and Spotify playback, and type keys. So:
/// <list type="bullet">
/// <item>every launch sets <see cref="SafeModeVariable"/> and <see cref="MacrosDryRunVariable"/> (the plugin then turns module
/// writes into no-ops or fakes, and Macros only logs);</item>
/// <item>only the <see cref="SafeActions"/> (the samples and diagnostics, which touch nothing) may be placed unless a UUID is
/// explicitly allowed (<see cref="FakeHostOptions.AllowRealActions"/>, the CLI's <c>--action X --allow-real-actions</c>).</item>
/// </list>
/// </summary>
public static class FakeHostSafety
{
    /// <summary>Same as PrismControl.Core.Hosting.SafeModeEnvironment.Variable (the fake host has no dependencies; a test pins them).</summary>
    public const string SafeModeVariable = "PRISM_CONTROL_SAFE_MODE";
    public const string MacrosDryRunVariable = "PRISM_CONTROL_MACROS_DRY_RUN";

    public const string Diagnostics = "com.jeremyfhall.prismcontrol.core.diagnostics";

    /// <summary>Actions that touch nothing on the PC: the five wave-0 samples (hidden from the actions list) and diagnostics.</summary>
    public static readonly IReadOnlySet<string> SafeActions = new HashSet<string>(StringComparer.Ordinal)
    {
        Diagnostics,
        "com.jeremyfhall.prismcontrol.audio.sample-level",
        "com.jeremyfhall.prismcontrol.eq.sample-band",
        "com.jeremyfhall.prismcontrol.macros.sample-counter",
        "com.jeremyfhall.prismcontrol.system.sample-memory",
        "com.jeremyfhall.prismcontrol.spotify.sample-now-playing",
    };

    /// <summary>The variables every plugin launch gets (they override anything the caller passes).</summary>
    public static readonly IReadOnlyDictionary<string, string> LaunchVariables = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [SafeModeVariable] = "1",
        [MacrosDryRunVariable] = "1",
    };

    /// <summary>
    /// Real actions whose modules gate every write on safe mode (wave 3: each module's SafeModeTests prove presses and turns change
    /// nothing real; SystemInfo and Cooling only read). They may be placed with --action or --gated without --allow-real-actions, but
    /// the default run still places <see cref="SafeActions"/> only. Add an action here only when its module's safe-mode tests cover it.
    /// </summary>
    public static readonly IReadOnlySet<string> GatedActions = new HashSet<string>(StringComparer.Ordinal)
    {
        "com.jeremyfhall.prismcontrol.audio.app-volume", "com.jeremyfhall.prismcontrol.audio.input-device", "com.jeremyfhall.prismcontrol.audio.level-meter",
        "com.jeremyfhall.prismcontrol.audio.mic-mute", "com.jeremyfhall.prismcontrol.audio.mixer", "com.jeremyfhall.prismcontrol.audio.output-device",
        "com.jeremyfhall.prismcontrol.audio.volume",
        "com.jeremyfhall.prismcontrol.cooling.dial", "com.jeremyfhall.prismcontrol.cooling.fan", "com.jeremyfhall.prismcontrol.cooling.fan-group",
        "com.jeremyfhall.prismcontrol.cooling.pump",
        "com.jeremyfhall.prismcontrol.eq.band", "com.jeremyfhall.prismcontrol.eq.band-browser", "com.jeremyfhall.prismcontrol.eq.preset",
        "com.jeremyfhall.prismcontrol.eq.sonar-volume", "com.jeremyfhall.prismcontrol.eq.toggle",
        "com.jeremyfhall.prismcontrol.macros.dial", "com.jeremyfhall.prismcontrol.macros.hotkey", "com.jeremyfhall.prismcontrol.macros.launch",
        "com.jeremyfhall.prismcontrol.macros.macro", "com.jeremyfhall.prismcontrol.macros.media", "com.jeremyfhall.prismcontrol.macros.type-text",
        "com.jeremyfhall.prismcontrol.spotify.browser", "com.jeremyfhall.prismcontrol.spotify.like", "com.jeremyfhall.prismcontrol.spotify.next",
        "com.jeremyfhall.prismcontrol.spotify.now-playing", "com.jeremyfhall.prismcontrol.spotify.play-pause", "com.jeremyfhall.prismcontrol.spotify.previous",
        "com.jeremyfhall.prismcontrol.spotify.repeat", "com.jeremyfhall.prismcontrol.spotify.shuffle", "com.jeremyfhall.prismcontrol.spotify.volume",
        "com.jeremyfhall.prismcontrol.system.cpu", "com.jeremyfhall.prismcontrol.system.dial", "com.jeremyfhall.prismcontrol.system.disk",
        "com.jeremyfhall.prismcontrol.system.gpu", "com.jeremyfhall.prismcontrol.system.network", "com.jeremyfhall.prismcontrol.system.ram",
        // Team Prism Play modules (each covered by its module's safe-mode tests; see aaa-prism-play/<role>/NOTES.md).
        // Browser (browser-mod/NOTES.md §3, 16).
        "com.jeremyfhall.prismcontrol.browser.download", "com.jeremyfhall.prismcontrol.browser.group", "com.jeremyfhall.prismcontrol.browser.media",
        "com.jeremyfhall.prismcontrol.browser.meet", "com.jeremyfhall.prismcontrol.browser.nav", "com.jeremyfhall.prismcontrol.browser.page",
        "com.jeremyfhall.prismcontrol.browser.panic", "com.jeremyfhall.prismcontrol.browser.preview", "com.jeremyfhall.prismcontrol.browser.privacy",
        "com.jeremyfhall.prismcontrol.browser.reopen", "com.jeremyfhall.prismcontrol.browser.scrub", "com.jeremyfhall.prismcontrol.browser.site",
        "com.jeremyfhall.prismcontrol.browser.speed", "com.jeremyfhall.prismcontrol.browser.split", "com.jeremyfhall.prismcontrol.browser.tab",
        "com.jeremyfhall.prismcontrol.browser.tabs",
        // Windows / WinShell W1 (w1/NOTES.md §5, 13).
        "com.jeremyfhall.prismcontrol.windows.browser", "com.jeremyfhall.prismcontrol.windows.desktops", "com.jeremyfhall.prismcontrol.windows.game-mode",
        "com.jeremyfhall.prismcontrol.windows.hdr", "com.jeremyfhall.prismcontrol.windows.input-source", "com.jeremyfhall.prismcontrol.windows.maximize",
        "com.jeremyfhall.prismcontrol.windows.monitor", "com.jeremyfhall.prismcontrol.windows.next-monitor", "com.jeremyfhall.prismcontrol.windows.placer",
        "com.jeremyfhall.prismcontrol.windows.refresh", "com.jeremyfhall.prismcontrol.windows.topmost", "com.jeremyfhall.prismcontrol.windows.window",
        "com.jeremyfhall.prismcontrol.windows.zone",
        // AI: AI1 sessions + approvals (ai1/NOTES.md §7, 7) and AI2 apps + services (Ai2Ids.All, 7).
        "com.jeremyfhall.prismcontrol.ai.approve", "com.jeremyfhall.prismcontrol.ai.deny", "com.jeremyfhall.prismcontrol.ai.fleet",
        "com.jeremyfhall.prismcontrol.ai.next", "com.jeremyfhall.prismcontrol.ai.privacy", "com.jeremyfhall.prismcontrol.ai.request",
        "com.jeremyfhall.prismcontrol.ai.session",
        "com.jeremyfhall.prismcontrol.ai.app", "com.jeremyfhall.prismcontrol.ai.ask", "com.jeremyfhall.prismcontrol.ai.dictate",
        "com.jeremyfhall.prismcontrol.ai.health", "com.jeremyfhall.prismcontrol.ai.healthstrip", "com.jeremyfhall.prismcontrol.ai.ops",
        "com.jeremyfhall.prismcontrol.ai.usage",
        // Smart Deck (sd1/NOTES.md §12; SD2 adds no actions) and Prism Sight (sight/NOTES.md §9).
        "com.jeremyfhall.prismcontrol.smart.dial", "com.jeremyfhall.prismcontrol.smart.key",
        "com.jeremyfhall.prismcontrol.sight.dial", "com.jeremyfhall.prismcontrol.sight.status",
    };

    /// <summary>Placeable without --allow-real-actions: the samples and diagnostics, or a real action whose writes are gated on safe mode.</summary>
    public static bool IsSafe(string actionUuid) => SafeActions.Contains(actionUuid) || GatedActions.Contains(actionUuid);

    internal static string RefusalMessage(string uuid) =>
        $"refusing to place {uuid}: it is not a sample, diagnostics or safe-mode-gated action, so random input could act on this PC (volume, " +
        "devices, EQ, Spotify playback, keystrokes) wherever its module does not honor safe mode yet. Pass --allow-real-actions to place it anyway.";
}

/// <summary>An action as the packed manifest declares it.</summary>
public sealed record ManifestAction(string Uuid, bool Keypad, bool Encoder);

/// <summary>What the fake-host CLI will place, or why it refuses.</summary>
public sealed record FakeHostPlan(IReadOnlyList<ManifestAction> Actions, IReadOnlyList<string> Warnings, string? Error)
{
    public bool Refused => Error is not null;

    /// <summary>
    /// Default (no <paramref name="requested"/>): the sample and diagnostics actions only; with <paramref name="gated"/>, every
    /// safe-mode-gated real action in the manifest too. Requested actions outside both sets need <paramref name="allowRealActions"/>,
    /// and each one gets a warning.
    /// </summary>
    public static FakeHostPlan Create(IReadOnlyList<ManifestAction> manifest, IReadOnlyList<string> requested, bool allowRealActions, bool gated = false)
    {
        var warnings = new List<string>();
        if (requested.Count == 0)
        {
            if (allowRealActions) warnings.Add("--allow-real-actions has no effect without --action: placing the sample and diagnostics actions only.");
            var safe = manifest.Where(a => FakeHostSafety.SafeActions.Contains(a.Uuid) || (gated && FakeHostSafety.GatedActions.Contains(a.Uuid))).ToList();
            if (gated) warnings.Add($"--gated: placing {safe.Count(a => FakeHostSafety.GatedActions.Contains(a.Uuid))} real actions in safe mode; their writes are no-ops.");
            if (safe.Count == 0)
            {
                warnings.Add("no manifest.json next to the exe (or no safe actions in it): placing the diagnostics action only.");
                safe.Add(new ManifestAction(FakeHostSafety.Diagnostics, Keypad: true, Encoder: true));
            }
            return new FakeHostPlan(safe, warnings, null);
        }
        var list = new List<ManifestAction>();
        foreach (var uuid in requested.Distinct(StringComparer.Ordinal))
        {
            if (!FakeHostSafety.IsSafe(uuid))
            {
                if (!allowRealActions) return new FakeHostPlan([], warnings, FakeHostSafety.RefusalMessage(uuid));
                warnings.Add($"WARNING: placing the REAL action {uuid} and pressing it at random. The plugin runs in safe mode, but any write " +
                             "path its module does not gate yet acts on this PC. Stop now (Ctrl+C) unless that is intended.");
            }
            list.Add(manifest.FirstOrDefault(a => a.Uuid == uuid) ?? new ManifestAction(uuid, Keypad: true, Encoder: true));
        }
        return new FakeHostPlan(list, warnings, null);
    }

    /// <summary>The actions in a packed manifest.json (empty when the file is missing or unreadable).</summary>
    public static IReadOnlyList<ManifestAction> ReadManifest(string manifestPath)
    {
        if (!File.Exists(manifestPath)) return [];
        try
        {
            var list = new List<ManifestAction>();
            foreach (var a in JsonNode.Parse(File.ReadAllText(manifestPath))?["Actions"]?.AsArray() ?? [])
            {
                var ctl = a?["Controllers"]?.AsArray().Select(c => c?.GetValue<string>()).ToList() ?? ["Keypad"];
                if (a?["UUID"]?.GetValue<string>() is { } uuid) list.Add(new ManifestAction(uuid, ctl.Contains("Keypad"), ctl.Contains("Encoder")));
            }
            return list;
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or IOException) { return []; }
    }
}

public sealed record FakeHostCliOptions
{
    public required string Exe { get; init; }
    /// <summary>galleon, plus or both.</summary>
    public string Device { get; init; } = "both";
    /// <summary>--action (repeatable). Empty = the safe actions.</summary>
    public IReadOnlyList<string> Actions { get; init; } = [];
    public bool AllowRealActions { get; init; }
    /// <summary>--gated: with no --action, also place every safe-mode-gated real action (FakeHostSafety.GatedActions).</summary>
    public bool Gated { get; init; }
    public double Seconds { get; init; } = 5;
    public bool Demo { get; init; }
    /// <summary>PRISM_CONTROL_DIR for the plugin; a temp folder (deleted afterwards) when null.</summary>
    public string? UserDir { get; init; }
}

public sealed record FakeHostRunResult(int ExitCode, IReadOnlyList<string> PlacedActions, bool? SafeMode, bool? MacrosDryRun, RateReport? Rate);

/// <summary><c>prismctl fake-host</c>: runs the plugin against the fake app, drives random input and prints the traffic.</summary>
public static class FakeHostCli
{
    public static async Task<FakeHostRunResult> RunAsync(FakeHostCliOptions o, TextWriter stdout, TextWriter stderr)
    {
        if (!File.Exists(o.Exe))
        {
            await stderr.WriteLineAsync($"exe not found: {o.Exe}");
            return new FakeHostRunResult(2, [], null, null, null);
        }
        var manifest = FakeHostPlan.ReadManifest(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetFullPath(o.Exe))!)!, "manifest.json"));
        var plan = FakeHostPlan.Create(manifest, o.Actions, o.AllowRealActions, o.Gated);
        foreach (var w in plan.Warnings) await stderr.WriteLineAsync(w);
        if (plan.Refused)
        {
            await stderr.WriteLineAsync(plan.Error);
            return new FakeHostRunResult(2, [], null, null, null);
        }
        var real = plan.Actions.Where(a => !FakeHostSafety.IsSafe(a.Uuid)).Select(a => a.Uuid).ToList();
        FakeDevice[] devices = o.Device switch
        {
            "galleon" => [FakeDevice.Galleon()],
            "plus" => [FakeDevice.Plus()],
            _ => [FakeDevice.Galleon(), FakeDevice.Plus()],
        };
        await using var host = await FakeStreamDeck.StartAsync(new FakeHostOptions { Devices = devices, AllowRealActions = real });
        // --user-dir "%APPDATA%\Prism\control" puts control.json where the sibling plugin looks for it.
        var userDir = o.UserDir ?? Path.Combine(Path.GetTempPath(), "prismctl-fakehost-" + Environment.ProcessId + "-" + Guid.NewGuid().ToString("N")[..6]);
        try
        {
            // Launch() always adds PRISM_CONTROL_SAFE_MODE=1 and PRISM_CONTROL_MACROS_DRY_RUN=1; they are listed here too so the CLI path is explicit.
            var env = new Dictionary<string, string?>(StringComparer.Ordinal)
            {
                ["PRISM_CONTROL_DIR"] = userDir,
                ["PRISM_CONTROL_DEMO_DATA"] = o.Demo ? "1" : null,
                [FakeHostSafety.SafeModeVariable] = "1",
                [FakeHostSafety.MacrosDryRunVariable] = "1",
            };
            host.Launch(o.Exe, env);
            if (!await host.WaitForRegistrationAsync(TimeSpan.FromSeconds(15)))
            {
                await stderr.WriteLineAsync("plugin did not register");
                return new FakeHostRunResult(1, [], null, null, null);
            }
            await stdout.WriteLineAsync($"registered on port {host.Port}; user dir {userDir}");

            var (safeMode, dryRun) = await ReadSafetyAsync(userDir);
            await stdout.WriteLineAsync($"plugin safe mode: {Show(safeMode)}; macros dry run: {Show(dryRun)}");
            if (safeMode != true)
            {
                if (real.Count > 0)
                {
                    await stderr.WriteLineAsync("the plugin does not report safe mode (/v1/health safeMode != true): refusing to drive real actions.");
                    await host.CloseNormallyAsync();
                    await host.WaitForExitAsync(TimeSpan.FromSeconds(5));
                    return new FakeHostRunResult(1, [], safeMode, dryRun, null);
                }
                await stderr.WriteLineAsync("warning: the plugin does not report safe mode (an older build?); placing safe actions only.");
            }

            var contexts = new List<(string Ctx, bool Encoder, FakeDevice Device)>();
            var placed = new List<string>();
            foreach (var d in devices)
            {
                var keys = plan.Actions.Where(a => a.Keypad).ToList();
                var dials = plan.Actions.Where(a => a.Encoder).ToList();
                for (var i = 0; i < d.Columns * d.Rows && keys.Count > 0; i++)
                {
                    var uuid = keys[i % keys.Count].Uuid;
                    contexts.Add((await host.AppearAsync(d, uuid, i % d.Columns, i / d.Columns), false, d));
                    placed.Add(uuid);
                }
                (int, int)[] slots = d.Type == 12 ? [(0, 0), (0, 1), (1, 0), (1, 1)] : [(0, 0), (1, 0), (2, 0), (3, 0)];
                for (var i = 0; i < slots.Length && dials.Count > 0; i++)
                {
                    var uuid = dials[i % dials.Count].Uuid;
                    contexts.Add((await host.AppearAsync(d, uuid, slots[i].Item1, slots[i].Item2, encoder: true), true, d));
                    placed.Add(uuid);
                }
            }
            await stdout.WriteLineAsync($"placed {contexts.Count} contexts ({string.Join(", ", placed.Distinct())}); driving input for {o.Seconds:0.#} s");
            var start = host.NowMs;
            var rnd = new Random(7);
            while (contexts.Count > 0 && host.NowMs - start < o.Seconds * 1000)
            {
                var (ctx, enc, dev) = contexts[rnd.Next(contexts.Count)];
                if (enc) await host.DialRotateAsync(ctx, dev.Type == 12 ? rnd.Next(-12, 13) : rnd.Next(2) * 2 - 1);
                else await host.PressAsync(ctx);
                await Task.Delay(150);
            }
            var rate = host.RenderRate(start, host.NowMs);
            var byEvent = host.Received.GroupBy(m => m.Event).OrderBy(g => g.Key, StringComparer.Ordinal).Select(g => $"{g.Key}={g.Count()}");
            await stdout.WriteLineAsync($"received: {string.Join(" ", byEvent)}");
            await stdout.WriteLineAsync($"render updates: {rate.Total} in {rate.Seconds:0.0} s, avg {rate.AveragePerSecond:0.0}/s, worst 1 s window {rate.MaxInAnyOneSecond}");
            await host.CloseNormallyAsync();
            await host.WaitForExitAsync(TimeSpan.FromSeconds(5));
            return new FakeHostRunResult(0, placed, safeMode, dryRun, rate);
        }
        finally
        {
            if (o.UserDir is null) { try { Directory.Delete(userDir, true); } catch { } }
        }
    }

    private static string Show(bool? b) => b switch { true => "on", false => "OFF", null => "unknown" };

    /// <summary>Asks the plugin's /v1/health (via control.json in the user dir) whether safe mode and the Macros dry run are on.</summary>
    public static async Task<(bool? SafeMode, bool? MacrosDryRun)> ReadSafetyAsync(string userDir)
    {
        var control = Path.Combine(userDir, "control.json");
        for (var i = 0; i < 40 && !File.Exists(control); i++) await Task.Delay(50);
        try
        {
            var c = JsonNode.Parse(await File.ReadAllTextAsync(control));
            if (c?["baseUrl"]?.GetValue<string>() is not { } baseUrl || c["token"]?.GetValue<string>() is not { } token) return (null, null);
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/v1/health");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var resp = await http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return (null, null);
            var health = JsonNode.Parse(await resp.Content.ReadAsStringAsync());
            return (Bool(health?["safeMode"]), Bool(health?["macrosDryRun"]));
        }
        catch (Exception ex) when (ex is IOException or JsonException or HttpRequestException or TaskCanceledException or InvalidOperationException or FormatException)
        {
            return (null, null);
        }

        static bool? Bool(JsonNode? n) => n is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;
    }
}
