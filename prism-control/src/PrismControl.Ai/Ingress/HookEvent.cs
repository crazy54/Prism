using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Ai.Sessions;

namespace PrismControl.Ai.Ingress;

/// <summary>Normalized hook event kinds across Claude Code, Codex, Copilot CLI, Gemini CLI and Cursor.</summary>
public enum HookKind
{
    Unknown,
    SessionStart,
    UserPromptSubmit,
    PreToolUse,
    PermissionRequest,
    PermissionDenied,
    PostToolUse,
    PostToolUseFailure,
    Notification,
    SubagentStart,
    SubagentStop,
    Stop,
    StopFailure,
    PreCompact,
    PostCompact,
    SessionEnd,
    Interrupt,
    Elicitation,
    ElicitationResult,
    /// <summary>A known event that changes no state (TeammateIdle, ConfigChange, …): it still counts as a signal.</summary>
    Other,
}

/// <summary>The allow-listed fields of one event (platform/USAGE.md "fields"). Nothing else is ever read.</summary>
public sealed record HookFields
{
    public string? HookEventName { get; init; }
    public string? PermissionMode { get; init; }
    public string? AgentId { get; init; }
    public string? AgentType { get; init; }
    public string? CwdHash { get; init; }
    public string? CwdName { get; init; }
    public string? ToolName { get; init; }
    public string? McpServer { get; init; }
    public bool? IsInterrupt { get; init; }
    public string? ErrorCategory { get; init; }
    public string? NotificationType { get; init; }
    public string? Error { get; init; }
    public string? Source { get; init; }
    public string? Model { get; init; }
    public string? Reason { get; init; }
}

/// <summary>The relay's host classification (platform/USAGE.md host.kind).</summary>
public sealed record RelayHost(HostKind Kind, ProcessIdentity? Process, nint ConsoleHwnd);

/// <summary>One minimized hook event, as the relay sent it and as this module re-validated it.</summary>
public sealed record HookEvent
{
    /// <summary>The event name from argv (e.g. "PermissionRequest"), validated against the allow-list.</summary>
    public required string Name { get; init; }
    public required HookKind Kind { get; init; }
    /// <summary>Which hook file fired (argv[1]): "claude" or "codex".</summary>
    public required string Family { get; init; }
    /// <summary>Who really invoked the relay (the cross-talk tag).</summary>
    public required AgentKind Tool { get; init; }
    /// <summary>"claude", or "cursor-via-claude-hooks" etc.</summary>
    public required string Origin { get; init; }
    public string? SessionId { get; init; }
    public required HookFields Fields { get; init; }
    public ProcessIdentity? AgentProcess { get; init; }
    public ProcessIdentity? Parent { get; init; }
    public IReadOnlyList<ProcessIdentity> Chain { get; init; } = [];
    public RelayHost? Host { get; init; }
    public IReadOnlyDictionary<string, string> Env { get; init; } = new Dictionary<string, string>();
    /// <summary>
    /// When the event happened: the relay's receive time (<c>at</c>), clamped to [receive − <see cref="HookEventParser.MaxRelayLag"/>,
    /// receive] so a bogus clock can neither reorder far nor block later events (review M4: per-session ordering uses this).
    /// </summary>
    public required DateTimeOffset At { get; init; }
    /// <summary>Our receive time.</summary>
    public DateTimeOffset ReceivedAt { get; init; }
    /// <summary>The relay read stdin whole and it parsed (frame 1's stdin: !truncated &amp;&amp; parsed). Review H1: else never approvable.</summary>
    public bool InputComplete { get; init; } = true;
    /// <summary>False when the relay skipped its ancestry walk (high-frequency status events, review L10): no process facts.</summary>
    public bool AncestryWalked { get; init; } = true;
    /// <summary>The frame's protocol version (1 = a relay from before reviews M6/H1).</summary>
    public int ProtocolVersion { get; init; } = 1;
    /// <summary>
    /// The first process between the relay and the agent that is not a plain shell (e.g. "python.exe"), or null. A hook spawned
    /// by the agent itself has none; a relay started by a tool command the agent ran may (review L14: shown on the card).
    /// </summary>
    public string? Intermediary { get; init; }

    /// <summary>Cross-talk: the tool is not the family whose hook file fired (Cursor or Copilot reading Claude's hooks).</summary>
    public bool IsCrossTalk => !string.Equals(SessionStates.AgentLabel(Tool), Family, StringComparison.OrdinalIgnoreCase);

    /// <summary>Only Claude Code and Codex honor a PermissionRequest decision from a hook, and only from their own hook files.</summary>
    public bool CanBeDecided => Kind == HookKind.PermissionRequest && !IsCrossTalk && Tool is AgentKind.Claude or AgentKind.Codex;

    public string? Env1(string name) => Env.TryGetValue(name, out var v) ? v : null;
}

/// <summary>
/// Parses and re-validates the relay's event object (defense in depth: the ingress applies the same allow-list as the
/// relay, so a rogue local client cannot push prompt text, paths or commands into Prism's memory).
/// </summary>
public static partial class HookEventParser
{
    /// <summary>Environment markers the relay may forward (platform/USAGE.md env allow-list).</summary>
    public static readonly IReadOnlySet<string> EnvAllowList = new HashSet<string>(StringComparer.Ordinal)
    {
        "WT_SESSION", "WT_PROFILE_ID", "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "VSCODE_INJECTION", "CLAUDECODE",
        "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_PID", "TERMINAL_EMULATOR", "TERM_SESSION_ID", "CURSOR_VERSION", "GEMINI_SESSION_ID",
        "ORCA_TERMINAL_HANDLE", "ORCA_PANE_KEY", "ORCA_TAB_ID", "ORCA_WORKTREE_ID", "ORCA_WORKSPACE_ID",
    };

    private static readonly Dictionary<string, HookKind> Names = new(StringComparer.OrdinalIgnoreCase)
    {
        // Claude Code + Codex (PascalCase); Copilot CLI and Cursor use the same words in camelCase (case-insensitive).
        ["SessionStart"] = HookKind.SessionStart,
        ["UserPromptSubmit"] = HookKind.UserPromptSubmit,
        ["PreToolUse"] = HookKind.PreToolUse,
        ["PermissionRequest"] = HookKind.PermissionRequest,
        ["PermissionDenied"] = HookKind.PermissionDenied,
        ["PostToolUse"] = HookKind.PostToolUse,
        ["PostToolUseFailure"] = HookKind.PostToolUseFailure,
        ["Notification"] = HookKind.Notification,
        ["SubagentStart"] = HookKind.SubagentStart,
        ["SubagentStop"] = HookKind.SubagentStop,
        ["Stop"] = HookKind.Stop,
        ["StopFailure"] = HookKind.StopFailure,
        ["PreCompact"] = HookKind.PreCompact,
        ["PostCompact"] = HookKind.PostCompact,
        ["SessionEnd"] = HookKind.SessionEnd,
        ["Interrupt"] = HookKind.Interrupt,
        ["Elicitation"] = HookKind.Elicitation,
        ["ElicitationResult"] = HookKind.ElicitationResult,
        // Copilot CLI
        ["userPromptSubmitted"] = HookKind.UserPromptSubmit,
        ["agentStop"] = HookKind.Stop,
        ["errorOccurred"] = HookKind.StopFailure,
        // Gemini CLI
        ["BeforeAgent"] = HookKind.UserPromptSubmit,
        ["AfterAgent"] = HookKind.Stop,
        ["BeforeTool"] = HookKind.PreToolUse,
        ["AfterTool"] = HookKind.PostToolUse,
        ["PreCompress"] = HookKind.PreCompact,
        // Cursor
        ["beforeSubmitPrompt"] = HookKind.UserPromptSubmit,
        ["beforeShellExecution"] = HookKind.PreToolUse,
        ["beforeMCPExecution"] = HookKind.PreToolUse,
        // Known, no state change
        ["Setup"] = HookKind.Other,
        ["TeammateIdle"] = HookKind.Other,
        ["PostToolBatch"] = HookKind.Other,
        ["TaskCreated"] = HookKind.Other,
        ["TaskCompleted"] = HookKind.Other,
        ["InstructionsLoaded"] = HookKind.Other,
        ["ConfigChange"] = HookKind.Other,
        ["CwdChanged"] = HookKind.Other,
        ["DirectoryAdded"] = HookKind.Other,
        ["FileChanged"] = HookKind.Other,
        ["WorktreeCreate"] = HookKind.Other,
        ["WorktreeRemove"] = HookKind.Other,
        ["PreModelSwitch"] = HookKind.Other,
        ["PostModelSwitch"] = HookKind.Other,
        ["MessageDisplay"] = HookKind.Other,
        ["UserPromptExpansion"] = HookKind.Other,
        ["afterAgentResponse"] = HookKind.Other,
        ["afterAgentThought"] = HookKind.Other,
        ["afterFileEdit"] = HookKind.Other,
        ["afterShellExecution"] = HookKind.Other,
        ["afterMCPExecution"] = HookKind.Other,
    };

    private static readonly HashSet<string> Families = new(StringComparer.OrdinalIgnoreCase) { "claude", "codex", "copilot", "gemini", "cursor" };

    [GeneratedRegex("^[A-Za-z]{1,40}$")]
    private static partial Regex EventNameRegex();

    [GeneratedRegex("^[a-z_]{1,48}$")]
    private static partial Regex EnumToken();

    [GeneratedRegex("^[0-9a-f]{16}$")]
    private static partial Regex CwdHashRegex();

    public static HookKind KindOf(string? name) => name is not null && Names.TryGetValue(name, out var k) ? k : HookKind.Unknown;

    public static bool IsAllowedName(string? name) => name is not null && EventNameRegex().IsMatch(name) && Names.ContainsKey(name);

    /// <summary>
    /// Reads the Hello frame <c>{ "v":1, "event":{…} }</c> (the token was already checked and stripped by the endpoint).
    /// Returns null with a reason for anything outside the schema; never throws for bad input.
    /// </summary>
    public static HookEvent? TryParseHello(JsonNode? hello, DateTimeOffset now, out string? reject)
    {
        reject = null;
        if (hello is not JsonObject h) { reject = "not an object"; return null; }
        // The current protocol and the previous one (review M6): a relay copy that was not refreshed yet still reports states.
        if (Int(h["v"]) is not (1 or 2)) { reject = "unsupported version"; return null; }
        return TryParseEvent(h["event"], now, out reject);
    }

    public static HookEvent? TryParseEvent(JsonNode? node, DateTimeOffset now, out string? reject)
    {
        reject = null;
        if (node is not JsonObject e) { reject = "no event"; return null; }
        var version = e["v"] is null ? 1 : Int(e["v"]) ?? 0;
        if (version is not (1 or 2)) { reject = "unsupported event version"; return null; }
        var name = Str(e["name"], 40);
        if (!IsAllowedName(name)) { reject = "event name not allowed"; return null; }
        var family = Str(e["agent"], 16)?.ToLowerInvariant();
        if (family is null || !Families.Contains(family)) { reject = "unknown hook family"; return null; }
        var tool = SessionStates.ParseAgent(Str(e["tool"], 16));
        if (tool == AgentKind.Unknown) tool = SessionStates.ParseAgent(family);
        var origin = Str(e["origin"], 64);
        var expectedOrigin = string.Equals(SessionStates.AgentLabel(tool), family, StringComparison.OrdinalIgnoreCase)
            ? family
            : $"{SessionStates.AgentLabel(tool).ToLowerInvariant()}-via-{family}-hooks";
        if (origin is null || !string.Equals(origin, expectedOrigin, StringComparison.Ordinal)) origin = expectedOrigin;

        var f = e["fields"] as JsonObject ?? new JsonObject();
        var kind = KindOf(name);
        var fields = new HookFields
        {
            HookEventName = Str(f["hook_event_name"], 64),
            PermissionMode = Str(f["permission_mode"], 32),
            AgentId = Str(f["agent_id"], 128),
            AgentType = Str(f["agent_type"], 64),
            CwdHash = Str(f["cwd_hash"], 16) is { } ch && CwdHashRegex().IsMatch(ch) ? ch : null,
            CwdName = Str(f["cwd_name"], 128),
            ToolName = kind is HookKind.PreToolUse or HookKind.PostToolUse or HookKind.PostToolUseFailure or HookKind.PermissionRequest ? Str(f["tool_name"], 128) : null,
            McpServer = kind is HookKind.PreToolUse or HookKind.PostToolUse or HookKind.PostToolUseFailure or HookKind.PermissionRequest ? Str(f["mcp_server"], 64) : null,
            IsInterrupt = kind == HookKind.PostToolUseFailure ? Bool(f["is_interrupt"]) : null,
            ErrorCategory = kind == HookKind.PostToolUseFailure && Str(f["error_category"], 32) is { } ec && EnumToken().IsMatch(ec) ? ec : null,
            NotificationType = kind == HookKind.Notification ? Str(f["notification_type"], 64) : null,
            Error = kind == HookKind.StopFailure && Str(f["error"], 48) is { } err && EnumToken().IsMatch(err) ? err : null,
            Source = kind == HookKind.SessionStart ? Str(f["source"], 32) : null,
            Model = kind == HookKind.SessionStart ? Str(f["model"], 96) : null,
            Reason = kind == HookKind.SessionEnd ? Str(f["reason"], 32) : null,
        };
        var sessionId = Str(e["sessionId"], 128) ?? Str(f["session_id"], 128);
        if (sessionId is { Length: 0 }) sessionId = null;

        var env = new Dictionary<string, string>(StringComparer.Ordinal);
        if (e["env"] is JsonObject envObj)
            foreach (var (k, v) in envObj)
                if (EnvAllowList.Contains(k) && EnvValue(k, Str(v, 512)) is { } val) env[k] = val;

        var chain = new List<ProcessIdentity>();
        if (e["chain"] is JsonArray arr)
            foreach (var item in arr.Take(16))
                if (Proc(item) is { } p) chain.Add(p);

        var agentProcess = Proc(e["agentProcess"]);
        var stdin = e["stdin"] as JsonObject;
        return new HookEvent
        {
            Name = name!,
            Kind = kind,
            Family = family,
            Tool = tool,
            Origin = origin,
            SessionId = sessionId,
            Fields = fields,
            AgentProcess = agentProcess,
            Parent = Proc(e["parent"]),
            Chain = chain,
            Host = HostOf(e["host"]),
            Env = env,
            At = ClampRelayTime(Long(e["at"]), now),
            ReceivedAt = now,
            // Missing stdin facts count as incomplete: only a relay that read everything and parsed it can make a request approvable.
            InputComplete = stdin is not null && Bool(stdin["truncated"]) == false && Bool(stdin["parsed"]) == true,
            AncestryWalked = Bool(e["ancestry"]) != false,
            ProtocolVersion = version,
            Intermediary = IntermediaryOf(chain, agentProcess),
        };
    }

    /// <summary>How far the relay's clock may lag our receive time before it is clamped (review M4).</summary>
    public static readonly TimeSpan MaxRelayLag = TimeSpan.FromSeconds(10);

    /// <summary>The relay's <c>at</c> (UTC ms), clamped to [now − <see cref="MaxRelayLag"/>, now]; now when absent.</summary>
    internal static DateTimeOffset ClampRelayTime(long? atMs, DateTimeOffset now)
    {
        if (atMs is not { } ms || ms <= 0 || ms > 253402300799000) return now;
        var at = DateTimeOffset.FromUnixTimeMilliseconds(ms);
        if (at > now) return now;
        return at < now - MaxRelayLag ? now - MaxRelayLag : at;
    }

    private static readonly HashSet<string> Shells = new(StringComparer.OrdinalIgnoreCase)
    {
        "cmd.exe", "bash.exe", "sh.exe", "pwsh.exe", "powershell.exe", "wsl.exe", "conhost.exe", "OpenConsole.exe", "env.exe",
    };

    /// <summary>The first chain entry before the agent process that is not a plain shell (review L14), as a short image name.</summary>
    internal static string? IntermediaryOf(IReadOnlyList<ProcessIdentity> chain, ProcessIdentity? agent)
    {
        if (agent is not { } a) return null;
        foreach (var p in chain)
        {
            if (p.SameAs(a)) return null;
            if (!Shells.Contains(p.Image))
                return p.Image.Length is > 0 and <= 32 && p.Image.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_') ? p.Image : "another program";
        }
        return null;
    }

    /// <summary>
    /// The same rule as the relay (review L3): Orca worktree/workspace ids lose everything after "::" (a path), handle/pane/tab
    /// ids must be <c>^[A-Za-z0-9:_-]{1,128}$</c> without a leading '-' (they are passed to <c>orca terminal switch</c>).
    /// </summary>
    internal static string? EnvValue(string name, string? v)
    {
        if (string.IsNullOrEmpty(v)) return null;
        switch (name)
        {
            case "ORCA_WORKTREE_ID" or "ORCA_WORKSPACE_ID":
            {
                var cut = v.IndexOf("::", StringComparison.Ordinal);
                if (cut >= 0) v = v[..cut];
                return IsIdToken(v) ? v : null;
            }
            case "ORCA_TERMINAL_HANDLE" or "ORCA_PANE_KEY" or "ORCA_TAB_ID":
                return IsIdToken(v) ? v : null;
            default:
                return v.Length <= 128 ? v : v[..128];
        }
    }

    /// <summary><c>^[A-Za-z0-9:_-]{1,128}$</c> and not starting with '-'.</summary>
    public static bool IsIdToken(string? s) =>
        s is { Length: >= 1 and <= 128 } && s[0] != '-' && s.All(c => char.IsAsciiLetterOrDigit(c) || c is ':' or '_' or '-');

    /// <summary>Normalizes notification types across agents (Gemini "ToolPermission", Copilot "agent_idle").</summary>
    public static string? NormalizeNotification(string? type) => type?.Trim() switch
    {
        null => null,
        var t when t.Equals("ToolPermission", StringComparison.OrdinalIgnoreCase) => "permission_prompt",
        var t when t.Equals("agent_idle", StringComparison.OrdinalIgnoreCase) => "idle_prompt",
        var t => t.ToLowerInvariant(),
    };

    private static ProcessIdentity? Proc(JsonNode? n)
    {
        if (n is not JsonObject o) return null;
        var pid = Int(o["pid"]);
        if (pid is null or <= 0) return null;
        var exe = Str(o["exe"], 64) ?? "";
        var started = Long(o["startedAt"]) ?? 0;
        return new ProcessIdentity(pid.Value, started, exe);
    }

    private static RelayHost? HostOf(JsonNode? n)
    {
        if (n is not JsonObject o) return null;
        var kind = Str(o["kind"], 32) switch
        {
            "windows-terminal" => HostKind.WindowsTerminal,
            "vscode" => HostKind.VsCode,
            "cursor" => HostKind.Cursor,
            "jetbrains" => HostKind.JetBrains,
            "orca" => HostKind.Orca,
            "chatgpt" => HostKind.ChatGpt,
            "claude-desktop" => HostKind.ClaudeDesktop,
            "console" => HostKind.Console,
            _ => HostKind.Unknown,
        };
        var hwnd = Long(o["consoleHwnd"]) ?? 0;
        return new RelayHost(kind, Proc(o), (nint)hwnd);
    }

    internal static string? Str(JsonNode? n, int max) =>
        n is JsonValue v && v.TryGetValue<string>(out var s) ? Privacy.Clean(s, max) : null;

    internal static int? Int(JsonNode? n) => Long(n) is { } l && l is >= int.MinValue and <= int.MaxValue ? (int)l : null;

    /// <summary>Any JSON integer (parsed nodes convert freely; nodes built in code keep their CLR type, so try each).</summary>
    internal static long? Long(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<uint>(out var u)) return u;
        if (v.TryGetValue<short>(out var sh)) return sh;
        if (v.TryGetValue<ulong>(out var ul) && ul <= long.MaxValue) return (long)ul;
        if (v.TryGetValue<double>(out var d) && double.IsFinite(d) && d == Math.Floor(d) && Math.Abs(d) < 9e15) return (long)d;
        if (v.TryGetValue<decimal>(out var m) && m == decimal.Floor(m) && Math.Abs(m) < 9e15m) return (long)m;
        return null;
    }

    internal static bool? Bool(JsonNode? n) => n is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;
}
