using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Desktop;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

// AI2 test doubles. Nothing here touches the network, the AWS CLI, the clipboard, input, windows or processes of this PC.

/// <summary>Answers GETs from recorded fixtures; records every request (URL, validators, header NAMES only).</summary>
public sealed class FakeHttp : IHttpFetcher
{
    public readonly List<HttpFetchRequest> Requests = [];
    public Func<HttpFetchRequest, HttpFetchResult> Respond = _ => HttpFetchResult.Failed;
    public readonly Dictionary<string, Func<HttpFetchRequest, HttpFetchResult>> ByHost = new(StringComparer.OrdinalIgnoreCase);

    public Task<HttpFetchResult> GetAsync(HttpFetchRequest request, CancellationToken ct)
    {
        lock (Requests) Requests.Add(request);
        foreach (var (host, f) in ByHost)
            if (request.Url.Host.Equals(host, StringComparison.OrdinalIgnoreCase)) return Task.FromResult(f(request));
        return Task.FromResult(Respond(request));
    }

    public int Count(string host) { lock (Requests) return Requests.Count(r => r.Url.Host.Equals(host, StringComparison.OrdinalIgnoreCase)); }

    public HttpFetchRequest Last(string host) { lock (Requests) return Requests.Last(r => r.Url.Host.Equals(host, StringComparison.OrdinalIgnoreCase)); }

    public static HttpFetchResult Ok(string body, string? etag = null, string? lastModified = null, string contentType = "application/json") =>
        new(200, Encoding.UTF8.GetBytes(body), etag, lastModified, null, contentType);

    public static HttpFetchResult Bytes(byte[] body, string contentType) => new(200, body, null, null, null, contentType);
    public static HttpFetchResult NotModified(string? etag = null) => new(304, [], etag, null, null, "application/json");
    public static HttpFetchResult Status(int code, TimeSpan? retryAfter = null) => new(code, [], null, null, retryAfter, "text/html");

    /// <summary>Every public status endpoint answered from the fictional fixtures (all operational unless overridden).</summary>
    public static FakeHttp AllHealthy()
    {
        var h = new FakeHttp();
        h.ByHost["status.claude.com"] = _ => Ok(AI2Fixtures.AnthropicSummary(), "W/\"a1\"");
        h.ByHost["status.openai.com"] = _ => Ok(AI2Fixtures.OpenAiComponents());
        h.ByHost["www.githubstatus.com"] = _ => Ok(AI2Fixtures.StatuspageSummary(("pjmpxvq2cmr2", "Copilot", "operational")), "W/\"g1\"");
        h.ByHost["status.cursor.com"] = _ => Ok(AI2Fixtures.StatuspageSummary(("rflc60xp5jp2", "IDE", "operational"), ("vsny1qv7v86c", "CLI", "operational")), "W/\"c1\"");
        h.ByHost["health.aws.amazon.com"] = _ => Bytes(AI2Fixtures.AwsCurrentEvents("[]"), "application/json;charset=utf-16");
        h.ByHost["www.google.com"] = _ => Ok("[]", lastModified: "Fri, 16 Oct 2026 10:00:00 GMT");
        h.ByHost["status.cloud.google.com"] = _ => Ok("[]", lastModified: "Fri, 16 Oct 2026 10:00:00 GMT");
        return h;
    }
}

/// <summary>An AWS CLI that never runs: records argument lists and answers from a script.</summary>
public sealed class FakeAwsCli : IAwsCli
{
    public readonly List<IReadOnlyList<string>> Calls = [];
    public bool Installed = true;
    public Func<IReadOnlyList<string>, AwsCliResult> Respond = _ => new AwsCliResult(true, 0, AI2Fixtures.MetricData(), AwsCliProblem.None, false);
    public string? Locate() => Installed ? @"C:\fake\aws.exe" : null;
    public Task<AwsCliResult> RunAsync(IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct)
    {
        lock (Calls) Calls.Add(args);
        return Task.FromResult(Respond(args));
    }
}

public sealed class FakeVault : ISecretVault
{
    public readonly Dictionary<string, string> Items = new(StringComparer.Ordinal);
    public string? Load(string name) => Items.TryGetValue(name, out var v) ? v : null;
    public void Save(string name, string secret) => Items[name] = secret;
    public void Delete(string name) => Items.Remove(name);
}

/// <summary>A clipboard in memory. <see cref="Copy"/> is what the fake Ctrl+C does.</summary>
public sealed class FakeClipboard : IClipboard
{
    public uint Seq = 100;
    public string? Text = "original clipboard text";
    public bool SnapshotFails;
    public int Snapshots, Restores, Reads;
    public string? RestoredText;

    public uint SequenceNumber() => Seq;
    public Task<ClipboardSnapshot?> SnapshotAsync(CancellationToken ct)
    {
        Snapshots++;
        return Task.FromResult(SnapshotFails ? null : ClipboardSnapshot.Of((13, Encoding.Unicode.GetBytes((Text ?? "") + "\0"))));
    }
    public Task<bool> RestoreAsync(ClipboardSnapshot snapshot, CancellationToken ct)
    {
        Restores++;
        var bytes = snapshot.IsEmpty ? [] : snapshot.Items[0].Data;
        RestoredText = Encoding.Unicode.GetString(bytes).TrimEnd('\0');
        Text = RestoredText;
        Seq++;
        return Task.FromResult(true);
    }
    /// <summary>Runs right after a read returns (a test's "the user copied something else just now").</summary>
    public Action? AfterRead;
    public Task<string?> ReadTextAsync(CancellationToken ct) { Reads++; var t = Text; AfterRead?.Invoke(); return Task.FromResult(t); }
    public int Clears;
    public Task<bool> ClearAsync(CancellationToken ct) { Clears++; Text = null; Seq++; return Task.FromResult(true); }
    public void Copy(string? selection) { if (selection is null) return; Text = selection; Seq++; }
}

/// <summary>What kind of window is in front, as the terminal probe would read it (exe + class; UIA focus for editors).</summary>
public sealed class FakeTerminalProbe : ITerminalProbe
{
    public string Exe = "notepad.exe";
    public string Class = "Notepad";
    public bool? FocusInTerminal = false;
    public int FocusChecks;
    public (string Exe, string Class) Describe(nint hwnd) => (Exe, Class);
    public Task<bool?> FocusInTerminalAsync(CancellationToken ct) { FocusChecks++; return Task.FromResult(FocusInTerminal); }
}

/// <summary>Records every input call. Ctrl+C runs <see cref="OnCopy"/> (the fake clipboard's copy).</summary>
public sealed class FakeInput : IInputSender
{
    public readonly List<(string Kind, string Keys)> Calls = [];
    public Action? OnCopy;
    public bool Elevated;
    public bool Result = true;

    private void Add(string kind, IEnumerable<VirtualKey> keys) { lock (Calls) Calls.Add((kind, string.Join("+", keys))); }

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        Add("chord", keys);
        if (keys.SequenceEqual([VirtualKey.Control, VirtualKey.C])) OnCopy?.Invoke();
        return Task.FromResult(Result);
    }
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) { Add("key", [key]); return Task.FromResult(Result); }
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) { lock (Calls) Calls.Add(("text", $"{text.Length} chars")); return Task.FromResult(Result); }
    public bool TargetIsElevated(nint hwnd) => Elevated;
    public Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) { Add("down", keys); return Task.FromResult(Result); }
    public Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) { Add("up", keys); return Task.FromResult(Result); }
}

public sealed class FakeForegroundService : IForegroundService
{
    public nint Foreground = 0x5001;
    public nint External = 0x5001;
    public readonly List<nint> Raised = [];
    public ForegroundResult Next = ForegroundResult.Focused;
    public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) { Raised.Add(hwnd); Foreground = hwnd; return Task.FromResult(Next); }
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) => Task.FromResult(false);
    public nint GetForeground() => Foreground;
    public nint LastExternalForeground => External;
}

public sealed class FakeWindows : IWindowCatalog
{
    public readonly List<WindowInfo> Windows = [];
    public IReadOnlyList<WindowInfo> AltTabWindows() => [.. Windows];
    public WindowInfo? Get(nint hwnd) => Windows.FirstOrDefault(w => w.Hwnd == hwnd);
    public event Action<WindowEvent>? Changed { add { } remove { } }
    public void Add(nint hwnd, int pid, string exe, string? path) =>
        Windows.Add(new WindowInfo(hwnd, pid, exe, path, "(title never read)", null, false, false, false, false, 0, new RectI(0, 0, 100, 100)));
}

public sealed class FakeScanner : IProcessScanner
{
    public List<ProcInfo> Procs = [];
    public int Scans;
    public IReadOnlyList<ProcInfo> Scan() { Scans++; return [.. Procs]; }
}

public sealed class FakeForegroundProbe : IForegroundProbe
{
    public (int Pid, string Exe) Value = (0, "");
    public (int Pid, string Exe) Foreground() => Value;
}

public sealed class FakeVoice : IVoiceProbe
{
    public HashSet<int> Pids = [];
    public IReadOnlySet<int> ActiveCapturePids() => Pids;
}

public sealed class FakeAppProbe : IAppProbe
{
    public HashSet<string> Installed = new(StringComparer.OrdinalIgnoreCase) { "claude-desktop", "chatgpt", "copilot", "vscode" };
    public HashSet<string> Schemes = new(StringComparer.OrdinalIgnoreCase) { "claude", "claude-cli", "codex", "vscode", "ms-copilot" };
    public bool IsInstalled(AppDef app) => Installed.Contains(app.Id);
    public bool SchemeRegistered(string scheme) => Schemes.Contains(scheme);
}

/// <summary>
/// AI2's services wired from fakes on one manual clock and one settings store. Opened links, launches and logs are recorded.
/// </summary>
public sealed class Ai2Rig
{
    public ManualTimeProvider Time { get; }
    public CapturingLog Log { get; } = new();
    public TestGlobalSettings Globals { get; }
    public FakeHttp Http { get; }
    public FakeAwsCli Aws { get; } = new();
    public FakeVault Vault { get; } = new();
    public FakeClipboard Clipboard { get; } = new();
    public FakeInput Input { get; } = new();
    public FakeForegroundService Foreground { get; } = new();
    public FakeWindows Windows { get; } = new();
    public FakeScanner Scanner { get; } = new();
    public FakeForegroundProbe ForegroundProbe { get; } = new();
    public FakeVoice Voice { get; } = new();
    public FakeAppProbe Probe { get; } = new();
    public FakeTerminalProbe Terminals { get; } = new();
    public List<string> Opened { get; } = [];
    public List<(string Target, string? Args)> Started { get; } = [];
    public Ai2Services S { get; }
    public bool SafeMode { get; }
    public bool OnAir;
    public List<Sessions.SessionView> Sessions { get; } = [];
    public string CodexRoot { get; }

    public Ai2Rig(bool safeMode = false, Ai2Settings? settings = null, FakeHttp? http = null, ManualTimeProvider? time = null, string? codexRoot = null)
    {
        SafeMode = safeMode;
        Time = time ?? new ManualTimeProvider();
        Http = http ?? FakeHttp.AllHealthy();
        Globals = new TestGlobalSettings(new JsonObject { [Ai2Settings.Section] = ActionJson.ToNode(settings ?? new Ai2Settings()) });
        var cfg = new Ai2SettingsService(Globals);
        CodexRoot = codexRoot ?? Path.Combine(TempDirs.Root, "no-codex-" + Guid.NewGuid().ToString("N")[..8]);
        Input.OnCopy = () => Clipboard.Copy(Selection);
        var health = new HealthService(Http, Time, Log, () => cfg.Current, () => 0.5);
        var codex = new CodexLimitsService(CodexRoot, Time, Log);
        var bedrock = new BedrockUsageService(Aws, () => cfg.Current, Time, Log, safeMode);
        var admin = new AdminUsageService(Http, Vault, () => cfg.Current, Time, Log, safeMode);
        var apps = new AppMonitor(Scanner, ForegroundProbe, Voice, Probe, Time, Log, () => Sessions);
        var launcher = new DesktopAppLauncher(Foreground, Windows, Opened.Add, safeMode, Log, (t, a) => { Started.Add((t, a)); return true; });
        var ask = new AskService(Foreground, Input, Clipboard, Probe, Opened.Add,
            () => new Ai2SettingsView(OnAir, cfg.Current.WebTargetsOnAir, cfg.Current.RestoreClipboard), Log, safeMode,
            (t, _) => { Time.Advance(t); return Task.CompletedTask; }, Terminals);
        var dictation = new DictationService(Input, ForegroundProbe, Log, safeMode);
        S = new Ai2Services
        {
            Settings = cfg, Health = health, Codex = codex, Bedrock = bedrock, Admin = admin, Apps = apps, Launcher = launcher, Ask = ask,
            Dictation = dictation, Time = Time, Log = Log, SafeMode = safeMode, AwsCli = Aws, Clipboard = Clipboard, OnAir = () => OnAir, OpenUrl = Opened.Add,
        };
        _ = new StatusPublisher(S, null);
    }

    /// <summary>What the fake Ctrl+C copies (null = nothing selected: the clipboard doesn't change).</summary>
    public string? Selection = "the selected example text";

    public Ai2Settings Settings => S.Settings.Current;

    public void Configure(Action<Ai2Settings> change) => S.Settings.Update(change);

    public Task<ActionHarness<T>> AppearAsync<T>(DeviceInfo device, Coordinates c, Controller controller = Controller.Keypad, object? settings = null,
        string context = "ctx-ai2", Action<Core.Hosting.ServiceRegistry>? extra = null) where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(device, c, controller, settings, configureServices: r => { r.Add(S); extra?.Invoke(r); }, time: Time, safeMode: SafeMode,
            globals: Globals, context: context);

    /// <summary>The processes of a PC with Claude Desktop, ChatGPT (with a Codex child), Copilot and the Claude Code CLI running.</summary>
    public void TypicalProcesses()
    {
        Scanner.Procs =
        [
            new(100, 4, "explorer.exe", null),
            new(2001, 100, "claude.exe", @"C:\Program Files\WindowsApps\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\app\claude.exe"),
            new(2002, 2001, "claude.exe", @"C:\Program Files\WindowsApps\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\app\claude.exe"),
            new(3001, 100, "ChatGPT.exe", @"C:\Program Files\WindowsApps\OpenAI.Codex_26.1013.3656.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe"),
            new(3002, 3001, "ChatGPT.exe", @"C:\Program Files\WindowsApps\OpenAI.Codex_26.1013.3656.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe"),
            new(3003, 3001, "codex.exe", null),
            new(4001, 100, "mscopilot.exe", @"C:\Program Files (x86)\Microsoft\Copilot\Application\mscopilot.exe"),
            new(4002, 4001, "msedgewebview2.exe", null),
            new(5001, 100, "claude.exe", @"C:\Users\example\.local\bin\claude.exe"),
        ];
    }
}

/// <summary>Fictional fixtures modeled on the shapes confirmed by one live fetch per endpoint (2026-10-16). Product names are public; everything else is made up.</summary>
public static class AI2Fixtures
{
    public static string StatuspageSummary(params (string Id, string Name, string Status)[] components) => StatuspageSummaryWith("none", [], components);

    public static string StatuspageSummaryWith(string indicator, IEnumerable<string> incidentJson, params (string Id, string Name, string Status)[] components)
    {
        var comps = string.Join(",", components.Select(c => $"{{\"id\":\"{c.Id}\",\"name\":\"{c.Name}\",\"status\":\"{c.Status}\",\"group\":false,\"group_id\":null}}"));
        return $"{{\"page\":{{\"id\":\"examplepage\",\"name\":\"Example\"}},\"components\":[{comps},{{\"id\":\"grp1\",\"name\":\"A group\",\"status\":\"major_outage\",\"group\":true}}]," +
               $"\"incidents\":[{string.Join(",", incidentJson)}],\"scheduled_maintenances\":[],\"status\":{{\"indicator\":\"{indicator}\",\"description\":\"Example\"}}}}";
    }

    public static string AnthropicSummary(string claudeCode = "operational", string api = "operational", params string[] incidents) =>
        StatuspageSummaryWith(claudeCode == "operational" && api == "operational" ? "none" : "minor", incidents,
            ("rwppv331jlwc", "claude.ai", "operational"),
            ("0qbwn08sd68x", "Claude Console (platform.claude.com)", "operational"),
            ("k8w3r06qmzrp", "Claude API (api.anthropic.com)", api),
            ("yyzkbfz2thpt", "Claude Code", claudeCode),
            ("bpp5gb3hpjcl", "Claude Cowork", "major_outage"));   // doesn't matter to this user: ignored

    public static string Incident(string name, string impact, params string[] componentIds) =>
        $"{{\"id\":\"inc1\",\"name\":\"{name}\",\"status\":\"investigating\",\"impact\":\"{impact}\",\"components\":[{string.Join(",", componentIds.Select(i => $"{{\"id\":\"{i}\",\"name\":\"x\"}}"))}],\"incident_updates\":[{{\"body\":\"LONG BODY NEVER READ\"}}]}}";

    public static string OpenAiComponents(string codexCli = "operational", string chat = "operational") =>
        "{\"components\":[" + string.Join(",", new[]
        {
            ("01JMXBRMFE6N2NNT7DG6XZQ6PW", "Chat Completions", chat),
            ("01JP8CD9JR3HR6Y7G4Q75N4DVW", "Responses", "operational"),
            ("01JMXBNJXGV1T5GT2M9XA83XNG", "Conversations", "operational"),
            ("01JMXBNJXGGT5SR5DB9J7GYY48", "Voice mode", "operational"),
            ("01JSM5RTJWHRWDTS6Q604VEW3B", "Login", "major_outage"),
            ("01KMKFAMWKQ81YWSE1Z18R6VHR", "Codex in ChatGPT Desktop", "operational"),
            ("01KMKFAMWKNQ84Z1766MV08ZDE", "CLI", codexCli),
            ("01KMP3KP5MGE23B80K1EK4S8PV", "Codex API", "operational"),
            ("01JVCV8YSWZFRSM1G5CVP253SK", "Codex Web", "operational"),
            ("01KMP3KP5M8X0EBTVW6KN327EE", "VS Code extension", "operational"),
        }.Select(c => $"{{\"id\":\"{c.Item1}\",\"name\":\"{c.Item2}\",\"status\":\"{c.Item3}\",\"position\":1,\"page_id\":\"p\"}}")) + "]}";

    public static string GoogleIncident(string product, string severity, string? end, string desc = "Example service disruption") =>
        $"{{\"id\":\"g1\",\"number\":\"1\",\"begin\":\"2026-10-16T09:00:00+00:00\",\"end\":{(end is null ? "null" : $"\"{end}\"")},\"severity\":\"{severity}\"," +
        $"\"external_desc\":\"{desc}\",\"service_name\":\"{product}\",\"affected_products\":[{{\"title\":\"{product}\",\"id\":\"x\"}}],\"updates\":[{{\"text\":\"LONG TEXT NEVER READ\"}}],\"most_recent_update\":{{\"text\":\"x\"}}}}";

    /// <summary>The AWS feed: UTF-16 big-endian with a BOM, like the real one.</summary>
    public static byte[] AwsCurrentEvents(string json) => [0xFE, 0xFF, .. Encoding.BigEndianUnicode.GetBytes(json)];

    public static string AwsEvent(string service, string status, string summary, params (string Key, string Current)[] impacted) =>
        $"{{\"date\":\"1792140000\",\"arn\":\"arn:aws:health:example::event/X\",\"region_name\":\"Example\",\"status\":\"{status}\",\"service\":\"{service}\"," +
        $"\"service_name\":\"Example\",\"summary\":\"{summary}\",\"event_log\":[{{\"summary\":\"s\",\"message\":\"LONG MESSAGE NEVER READ\",\"status\":\"{status}\",\"timestamp\":1792140000}}]," +
        $"\"impacted_services\":{{{string.Join(",", impacted.Select(i => $"\"{i.Key}\":{{\"service_name\":\"Amazon Bedrock\",\"current\":\"{i.Current}\",\"max\":\"3\"}}"))}}},\"impacted_service_status_changes\":[]}}";

    /// <summary>A get-metric-data answer: m0 input, m1 output, m2 invocations, m3 throttles (per minute, newest last).</summary>
    public static string MetricData(DateTimeOffset? end = null, double input = 12_400, double output = 3_100, double throttles = 0)
    {
        var e = end ?? new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
        string Series(string id, Func<int, double> v) =>
            $"{{\"Id\":\"{id}\",\"Label\":\"x\",\"Timestamps\":[{string.Join(",", Enumerable.Range(1, 5).Select(i => $"\"{(e - TimeSpan.FromMinutes(i)).UtcDateTime:yyyy-MM-ddTHH:mm:ssZ}\""))}]," +
            $"\"Values\":[{string.Join(",", Enumerable.Range(1, 5).Select(i => v(i).ToString(System.Globalization.CultureInfo.InvariantCulture)))}],\"StatusCode\":\"Complete\"}}";
        return $"{{\"MetricDataResults\":[{Series("m0", i => input / i)},{Series("m1", i => output / i)},{Series("m2", i => 10.0 / i)},{Series("m3", i => i == 2 ? throttles : 0)}],\"Messages\":[]}}";
    }

    public const string AnthropicCost = "{\"data\":[{\"starting_at\":\"2026-10-01T00:00:00Z\",\"ending_at\":\"2026-10-02T00:00:00Z\",\"results\":[{\"currency\":\"USD\",\"amount\":\"123.50\"},{\"currency\":\"USD\",\"amount\":\"218.50\"}]},{\"starting_at\":\"2026-10-02T00:00:00Z\",\"results\":[]}],\"has_more\":false}";
    public const string AnthropicUsage = "{\"data\":[{\"starting_at\":\"2026-10-16T11:00:00Z\",\"results\":[{\"uncached_input_tokens\":1000,\"cache_read_input_tokens\":500,\"cache_creation\":{\"ephemeral_5m_input_tokens\":100,\"ephemeral_1h_input_tokens\":0},\"output_tokens\":400}]}],\"has_more\":false}";
    public const string OpenAiCost = "{\"object\":\"page\",\"data\":[{\"object\":\"bucket\",\"start_time\":1791849600,\"results\":[{\"object\":\"organization.costs.result\",\"amount\":{\"value\":1.25,\"currency\":\"usd\"}},{\"object\":\"organization.costs.result\",\"amount\":{\"value\":0.5,\"currency\":\"usd\"}}]}],\"has_more\":false}";
    public const string OpenAiUsage = "{\"object\":\"page\",\"data\":[{\"object\":\"bucket\",\"results\":[{\"input_tokens\":2000,\"output_tokens\":300,\"input_cached_tokens\":1500}]}]}";

    public const string SecretPrompt = "PROMPT-TEXT-THAT-MUST-NEVER-LEAK";

    /// <summary>Rollout lines (fictional thread): a session_meta, message content (must never be decoded), and token_count limits.</summary>
    public static string[] RolloutLines(double fiveHour, double week, long resets5h, long resetsWeek, string at = "2026-10-16T11:00:00.000Z") =>
    [
        "{\"timestamp\":\"2026-10-16T10:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"0199aa11-2222-7333-8444-000000000aa2\",\"cwd\":\"C:\\\\Users\\\\example\\\\projects\\\\aurora\",\"originator\":\"codex-tui\",\"instructions\":\"" + SecretPrompt + "\"}}",
        "{\"timestamp\":\"2026-10-16T10:01:00.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"" + SecretPrompt + "\"}]}}",
        "{\"timestamp\":\"2026-10-16T10:02:00.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"last_agent_message\":\"" + SecretPrompt + "\",\"error\":null}}",
        "{\"timestamp\":\"" + at + "\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":1}},\"rate_limits\":{\"limit_id\":\"codex\",\"primary\":{\"used_percent\":" + fiveHour.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"window_minutes\":300,\"resets_at\":" + resets5h + "},\"secondary\":{\"used_percent\":" + week.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"window_minutes\":10080,\"resets_at\":" + resetsWeek + "},\"plan_type\":\"example\"}}}",
        "{\"timestamp\":\"2026-10-16T11:00:05.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"" + SecretPrompt + "\"}]}}",
    ];

    /// <summary>Writes a rollout file in the Codex layout (sessions/YYYY/MM/DD) for <paramref name="localDay"/> and returns its path.</summary>
    public static string WriteRollout(string root, DateTime localDay, string threadId, IEnumerable<string> lines, DateTime? lastWriteUtc = null)
    {
        var dir = Path.Combine(root, localDay.ToString("yyyy"), localDay.ToString("MM"), localDay.ToString("dd"));
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"rollout-{localDay:yyyy-MM-dd}T09-00-00-{threadId}.jsonl");
        File.WriteAllText(path, string.Join("\n", lines) + "\n");
        if (lastWriteUtc is { } w) File.SetLastWriteTimeUtc(path, w);
        return path;
    }
}
