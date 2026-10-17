using System.Text.Json.Nodes;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Hooks;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Sessions.Jump;
using PrismControl.Ai.Status;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>A log that keeps every line (tests assert nothing secret is ever written).</summary>
public sealed class CapturingLog : ILog
{
    private readonly List<string> _lines = [];
    public IReadOnlyList<string> Lines { get { lock (_lines) return [.. _lines]; } }
    public string All => string.Join("\n", Lines);
    public void Write(LogLevel level, string message, Exception? exception = null) { lock (_lines) _lines.Add($"{level}: {message}{(exception is null ? "" : " " + exception.GetType().Name)}"); }
    public ILog For(string category) => this;
    public bool IsEnabled(LogLevel level) => true;
}

/// <summary>A process table the test controls. Pids that are "alive" have a creation time.</summary>
public sealed class FakeProcessTree : IProcessTree
{
    public readonly Dictionary<int, ProcessIdentity> Alive = new();
    public readonly Dictionary<int, List<ProcessIdentity>> Parents = new();
    public bool CodexRunning;

    public ProcessIdentity Add(int pid, string image, long startedAtMs = 1_792_141_000_000)
    {
        var id = new ProcessIdentity(pid, startedAtMs, image);
        Alive[pid] = id;
        return id;
    }

    public ProcessIdentity? Identity(int pid) => Alive.TryGetValue(pid, out var id) ? id : null;
    public IReadOnlyList<ProcessIdentity> Ancestors(int pid, int max = 16) => Parents.TryGetValue(pid, out var p) ? p.Take(max).ToList() : [];
    public bool AnyRunning(string imageName) => imageName == "codex.exe" ? CodexRunning : Alive.Values.Any(a => a.Image == imageName);
}

/// <summary>Watches nothing real: <see cref="Exit"/> simulates a process exit.</summary>
public sealed class FakeProcessWatcher(FakeProcessTree tree) : IProcessWatcher
{
    public readonly List<ProcessIdentity> Watched = [];
    public event Action<ProcessIdentity, DateTimeOffset>? Exited;

    public ProcessIdentity? Watch(int pid, long expectedStartMs, string image)
    {
        if (tree.Identity(pid) is not { } id) return null;
        if (expectedStartMs != 0 && Math.Abs(id.StartedAtMs - expectedStartMs) > 1000) return null;
        if (!Watched.Any(w => w.SameAs(id))) Watched.Add(id);
        return id;
    }

    public void Exit(ProcessIdentity id, DateTimeOffset at)
    {
        tree.Alive.Remove(id.Pid);
        Exited?.Invoke(id, at);
    }

    public void Dispose() { }
}

/// <summary>Answers CLI calls from canned outputs; records every call (and never runs anything).</summary>
public sealed class FakeCommandRunner : ICommandRunner
{
    public readonly List<CommandSpec> Calls = [];
    public Func<CommandSpec, CommandResult> Respond = _ => CommandResult.NotStarted;
    public Dictionary<string, string> Installed = new(StringComparer.OrdinalIgnoreCase) { ["claude.exe"] = @"C:\fake\claude.exe" };

    public Task<CommandResult> RunAsync(CommandSpec spec, CancellationToken ct)
    {
        lock (Calls) Calls.Add(spec);
        return Task.FromResult(Respond(spec));
    }

    public string? Find(string exeName) => Installed.TryGetValue(exeName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? exeName : exeName + ".exe", out var p) ? p : null;

    public static CommandResult Ok(string stdout) => new(true, 0, stdout, false);
}

/// <summary>Windows the test invents. <see cref="Focused"/> records focus requests; nothing real is touched.</summary>
public sealed class FakeWindowHost : IWindowHost
{
    public readonly Dictionary<int, List<nint>> WindowsByPid = new();
    public readonly Dictionary<nint, string> Classes = new();
    public readonly Dictionary<nint, nint> Owners = new();
    public readonly List<nint> Focused = [];
    public FocusResult NextResult = FocusResult.Focused;

    public Task<FocusResult> FocusAsync(nint hwnd, CancellationToken ct)
    {
        Focused.Add(hwnd);
        return Task.FromResult(NextResult);
    }

    public IReadOnlyList<nint> TopLevelWindows(int pid) => WindowsByPid.TryGetValue(pid, out var w) ? w : [];
    public nint RootOwner(nint hwnd) => Owners.TryGetValue(hwnd, out var o) ? o : hwnd;
    public bool IsWindow(nint hwnd) => hwnd != 0 && (Classes.ContainsKey(hwnd) || Owners.ContainsKey(hwnd) || WindowsByPid.Values.Any(l => l.Contains(hwnd)));
    public int ProcessOf(nint hwnd) => WindowsByPid.FirstOrDefault(kv => kv.Value.Contains(hwnd)).Key;
    public string ClassName(nint hwnd) => Classes.TryGetValue(hwnd, out var c) ? c : "";
}

public sealed class FakeTabSelector : ITerminalTabSelector
{
    public readonly List<(nint Window, string Title)> Calls = [];
    public TabSelectResult Result = TabSelectResult.Selected;
    public Task<TabSelectResult> TrySelectAsync(nint terminalWindow, string title, CancellationToken ct)
    {
        Calls.Add((terminalWindow, title));
        return Task.FromResult(Result);
    }
}

public sealed class FakeUriOpener : IUriOpener
{
    public readonly List<string> Opened = [];
    public void Open(string uri) => Opened.Add(uri);
}

public sealed class FakeRelayProvider(string relayPath) : IRelayProvider
{
    public int Ensured;
    public bool EnsureSucceeds = true;
    public string RelayPath { get; } = relayPath;
    public string? RelaySha256() => "ab".PadRight(64, 'c');
    public Task<bool> EnsureAsync(CancellationToken ct) { Ensured++; return Task.FromResult(EnsureSucceeds); }
}

/// <summary>
/// One AI module wired from fakes on a shared manual clock. Hook files live in a fresh temporary home (deleted on Dispose):
/// never the user's real ~/.claude or ~/.codex.
/// </summary>
public sealed class TestRig : IDisposable
{
    public const int AgentPid = 4242;
    public const int RelayPid = 5151;
    public const string Device = "dev-galleon";

    public ManualTimeProvider Time { get; } = new();
    public CapturingLog Log { get; } = new();
    public FakeProcessTree Tree { get; } = new();
    public FakeProcessWatcher Watcher { get; }
    public FakeCommandRunner Runner { get; } = new();
    public FakeWindowHost Windows { get; } = new();
    public FakeTabSelector Tabs { get; } = new();
    public FakeUriOpener Uris { get; } = new();
    public TestGlobalSettings Globals { get; }
    public AiSettingsService Settings { get; }
    public SessionTracker Sessions { get; }
    public DeckPresence Presence { get; }
    public ApprovalBroker Broker { get; }
    public Jumper Jumper { get; }
    public HookInstaller Hooks { get; }
    public FakeRelayProvider Relay { get; }
    public AiServices Services { get; }
    public AiIngress Ingress { get; }
    public string Home { get; }
    public bool SafeMode { get; }
    public ProcessIdentity Agent { get; }
    public string? TitleForJump = "Example session";

    public TestRig(bool safeMode = false, AiSettings? settings = null, string? home = null)
    {
        SafeMode = safeMode;
        Home = home ?? TempDirs.New("home");
        Watcher = new FakeProcessWatcher(Tree);
        var s = settings ?? new AiSettings { Privacy = "reveal" };
        Globals = new TestGlobalSettings(new JsonObject { [AiSettings.Section] = ActionJson.ToNode(s) });
        Settings = new AiSettingsService(Globals);
        Sessions = new SessionTracker(Time, Log, new SlotTable(), Watcher, Tree) { RetainTitles = !Settings.Current.IsPrivate };
        Settings.Changed += x => Sessions.RetainTitles = !x.IsPrivate;
        Presence = new DeckPresence([TestDevices.Galleon, TestDevices.Plus, TestDevices.StreamDeck]);
        Broker = new ApprovalBroker(Time, Log, Presence, Settings, Sessions, safeMode);
        Jumper = new Jumper(Windows, Tabs, Uris, Runner, Tree, () => Settings.Current, () => null, (_, _) => Task.FromResult<string?>(TitleForJump), Log, safeMode);
        Relay = new FakeRelayProvider(Path.Combine(Home, "AppData", "Roaming", "Prism", "control", "relay", "prism-relay.exe"));
        var relayRoot = Path.Combine(Home, "AppData", "Roaming", "Prism", "control") + "\\";
        Hooks = new HookInstaller(HookHome.At(Home), Relay,
            c => c is not null && c.Trim('"').Replace('/', '\\').StartsWith(relayRoot, StringComparison.OrdinalIgnoreCase) && c.EndsWith("prism-relay.exe", StringComparison.OrdinalIgnoreCase),
            Log, safeMode, Time);
        Ingress = new AiIngress(Sessions, Broker, Tree, Time, Log, img => img == TrustedClientImage);
        Services = new AiServices
        {
            Sessions = Sessions,
            Approvals = Broker,
            Presence = Presence,
            Settings = Settings,
            Jumper = Jumper,
            Hooks = Hooks,
            Status = new AiStatusHub(Sessions, () => Settings.Current.Mode, Time),
            Time = Time,
            Log = Log,
            SafeMode = safeMode,
            Ingress = Ingress,
        };
        // The agent and its relay: the relay's real ancestry contains the agent (what the ingress verifies).
        Agent = Tree.Add(AgentPid, "claude.exe");
        Tree.Add(RelayPid, "prism-relay.exe");
        Tree.Parents[RelayPid] = [Agent, Tree.Add(77, "WindowsTerminal.exe", 1_792_140_000_000)];
    }

    public const string TrustedClientImage = @"C:\Users\example\AppData\Roaming\Prism\control\relay\prism-relay.exe";

    public Task<ActionHarness<T>> AppearAsync<T>(DeviceInfo device, Coordinates c, Controller controller = Controller.Keypad, object? settings = null,
        string context = "ctx-test", bool inMultiAction = false) where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(device, c, controller, settings, configureServices: r => r.Add(Services), time: Time, safeMode: SafeMode,
            globals: Globals, context: context, inMultiAction: inMultiAction);

    public void Update(Action<AiSettings> change) => Settings.Update(x => { change(x); return x; });

    /// <summary>A relay event object (platform/USAGE.md shape), parsed by the real parser.</summary>
    public static JsonObject EventJson(string name, string session, string agent = "claude", string? tool = null, JsonObject? fields = null,
        ProcessIdentity? agentProcess = null, JsonObject? env = null, string hostKind = "windows-terminal", long? atMs = null, int version = 2)
    {
        var tl = tool ?? agent;
        var e = new JsonObject
        {
            ["v"] = version,
            ["name"] = name,
            ["agent"] = agent,
            ["tool"] = tl,
            ["origin"] = tl == agent ? agent : $"{tl}-via-{agent}-hooks",
            // The relay's receive time (the module orders a session's events by it, clamped: review M4). Default: the rig clock's start.
            ["at"] = atMs ?? new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(),
            ["sessionId"] = session,
            ["fields"] = fields ?? new JsonObject { ["hook_event_name"] = name, ["session_id"] = session, ["permission_mode"] = "default" },
            ["host"] = new JsonObject { ["kind"] = hostKind, ["pid"] = 77, ["exe"] = "WindowsTerminal.exe", ["startedAt"] = 1792140000000, ["consoleHwnd"] = 0 },
            ["env"] = env ?? new JsonObject { ["WT_SESSION"] = "00000000-0000-4000-8000-000000000077" },
            ["stdin"] = new JsonObject { ["bytes"] = 512, ["truncated"] = false, ["parsed"] = true },
        };
        if (agentProcess is { } p)
        {
            var proc = new JsonObject { ["pid"] = p.Pid, ["exe"] = p.Image, ["startedAt"] = p.StartedAtMs };
            e["agentProcess"] = proc;
            e["parent"] = proc.DeepClone();
            e["chain"] = new JsonArray(proc.DeepClone());
        }
        return e;
    }

    public HookEvent Event(string name, string session, string agent = "claude", string? tool = null, JsonObject? fields = null, bool withProcess = true,
        Action<JsonObject>? edit = null)
    {
        var json = EventJson(name, session, agent, tool, fields, withProcess ? Agent with { Image = agent == "codex" ? "codex.exe" : Agent.Image } : null,
            atMs: Time.GetUtcNow().ToUnixTimeMilliseconds());
        edit?.Invoke(json);
        // An edit that moved the agent process keeps the default one-element chain consistent (the relay's parent is the agent).
        if (json["agentProcess"] is JsonObject ap && json["chain"] is JsonArray { Count: 1 } ch && ch[0]?["pid"]?.GetValue<int>() != ap["pid"]?.GetValue<int>())
        {
            json["chain"] = new JsonArray(ap.DeepClone());
            json["parent"] = ap.DeepClone();
        }
        return HookEventParser.TryParseEvent(json, Time.GetUtcNow(), out var why) ?? throw new InvalidOperationException("fixture event rejected: " + why);
    }

    /// <summary>A protocol-v2 reveal frame (what the relay sends after reveal:true) for a shell command.</summary>
    public static JsonObject Reveal(string tool, string command) => RevealOf(new JsonObject { ["tool"] = tool, ["input"] = "complete", ["command"] = command });

    /// <summary>A protocol-v2 reveal frame around <paramref name="summary"/>.</summary>
    public static JsonObject RevealOf(JsonObject summary) => new() { ["v"] = 2, ["t"] = "reveal", ["summary"] = summary };

    /// <summary>Applies a hook event as a verified one (its process is the relay's ancestor).</summary>
    public HookEvent Hook(string name, string session = Sessions1, string agent = "claude", string? tool = null, JsonObject? fields = null, bool verified = true)
    {
        var e = Event(name, session, agent, tool, fields);
        Sessions.ApplyHook(e, verified);
        return e;
    }

    public const string Sessions1 = "5e55a000-0000-4000-8000-000000000001";
    public const string Sessions2 = "5e55a000-0000-4000-8000-000000000002";

    /// <summary>Registers a details surface showing the selected request on <paramref name="device"/>, as a card would.</summary>
    public void ShowDetails(string device = Device, string context = "card")
    {
        Presence.Register(context, SurfaceKind.Details, device, inMultiAction: false);
        var r = Broker.Selected();
        // As the real card does: complete only when the display plan has no lock and the text fits the card (measured).
        var (_, _, _, shown) = PrismControl.Ai.Actions.CardText.Lay(r);
        Broker.ReportShown(context, device, r?.Id, shown == DetailsLock.None, shown);
    }

    public void Dispose()
    {
        Broker.Dispose();
        TempDirs.Delete(Home);
    }
}

/// <summary>Temporary folders under %TEMP%\prism-ai-tests (never the user's profile).</summary>
public static class TempDirs
{
    public static string Root => Path.Combine(Path.GetTempPath(), "prism-ai-tests");

    public static string New(string prefix)
    {
        var dir = Path.Combine(Root, prefix + "-" + Guid.NewGuid().ToString("N")[..12]);
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static void Delete(string dir)
    {
        try
        {
            if (Path.GetFullPath(dir).StartsWith(Path.GetFullPath(Root), StringComparison.OrdinalIgnoreCase) && Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    /// <summary>Copies a fixture folder into a fresh temp dir.</summary>
    public static string CopyFixture(string name)
    {
        var src = Path.Combine(AppContext.BaseDirectory, "Fixtures", name);
        var dst = New(name);
        foreach (var file in Directory.EnumerateFiles(src, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(src, file);
            var target = Path.Combine(dst, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target);
        }
        return dst;
    }

    public static string Fixture(string relative) => Path.Combine(AppContext.BaseDirectory, "Fixtures", relative);
}
