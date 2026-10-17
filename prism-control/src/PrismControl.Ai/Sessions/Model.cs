using PrismControl.Ai.Status;

namespace PrismControl.Ai.Sessions;

/// <summary>Which coding agent a session belongs to (the "tool" tag: Cursor and Copilot can fire Claude-format hooks).</summary>
public enum AgentKind { Unknown, Claude, Codex, Copilot, Gemini, Cursor }

/// <summary>
/// Unified session state (research/ai-status.md §1.2). Display priority when several sessions compete:
/// NeedsPermission > NeedsInput > Error > Working > Done > Idle > Stale > Ended/Dead.
/// </summary>
public enum SessionState
{
    Idle,
    Working,
    NeedsPermission,
    NeedsInput,
    /// <summary>The turn finished: your turn. Fades to Idle after 10 minutes.</summary>
    Done,
    Error,
    /// <summary>SessionEnd arrived (or the process exited normally); removed after 30 s.</summary>
    Ended,
    /// <summary>The process is gone without SessionEnd while hooks were active: "ended unexpectedly". Removed after 10 min.</summary>
    Dead,
    /// <summary>No signal for too long (inferred). Removed after 60 min.</summary>
    Stale,
}

/// <summary>A tool's category: the only tool detail shown in Private mode.</summary>
public enum ToolCategory { None, Bash, Edit, Read, Web, Mcp, Agent, Ask, Plan, Compact, Other }

/// <summary>Where the session's terminal or UI lives (from the relay's host classification or the process tree).</summary>
public enum HostKind { Unknown, WindowsTerminal, VsCode, Cursor, JetBrains, Orca, ChatGpt, ClaudeDesktop, Console }

/// <summary>The primary key: (agent, sessionId). Claude session_id = claude agents sessionId; Codex session_id = thread id.</summary>
public readonly record struct SessionKey(AgentKind Agent, string Id)
{
    public override string ToString() => $"{Agent}:{Hash6}";
    /// <summary>A 6-hex hash of the id: the only form a session id may take in logs.</summary>
    public string Hash6 => Privacy.Hash6(Id);
}

/// <summary>A process identity that survives pid reuse: pid + creation time (UTC ms) + image name.</summary>
public readonly record struct ProcessIdentity(int Pid, long StartedAtMs, string Image)
{
    /// <summary>Creation times read by different processes can differ by rounding; 1 s is far below pid-reuse gaps.</summary>
    public bool SameAs(ProcessIdentity other) => Pid == other.Pid && (StartedAtMs == 0 || other.StartedAtMs == 0 || Math.Abs(StartedAtMs - other.StartedAtMs) <= 1000);
    public override string ToString() => $"{Image}#{Pid}";
}

/// <summary>The session's host: what the relay classified, plus the markers needed to jump to it. No titles, no paths.</summary>
public sealed record HostInfo(HostKind Kind, ProcessIdentity? Process, nint ConsoleWindow, bool HasWtSession, string? Entrypoint, string? TermProgram)
{
    public static readonly HostInfo Unknown = new(HostKind.Unknown, null, 0, false, null, null);
    /// <summary>A Claude Code session hosted by the VS Code extension (not a CLI in VS Code's terminal).</summary>
    public bool IsVsCodeExtension => Entrypoint is { } e && e.Contains("vscode", StringComparison.OrdinalIgnoreCase);
}

/// <summary>Optional Orca enrichment (never the source of a state): ids from the relay environment or Orca's own CLI.</summary>
public sealed record OrcaLink(string? PaneKey, string? TerminalHandle, string? WorktreeId, string? TabId, Confidence Confidence);

/// <summary>
/// An immutable, privacy-projected view of one session for actions and the status model. In Private mode
/// <see cref="Title"/> and <see cref="Workspace"/> are null and <see cref="Alias"/> is "Agent n".
/// </summary>
public sealed record SessionView
{
    public required SessionKey Key { get; init; }
    /// <summary>"claude", "codex", "cursor-via-claude-hooks", … (the relay's origin tag).</summary>
    public required string Origin { get; init; }
    public required int Slot { get; init; }
    public required string Alias { get; init; }
    public bool Pinned { get; init; }
    public required Fact<SessionState> State { get; init; }
    /// <summary>When the current state began (inferred = "at least since").</summary>
    public required Fact<DateTimeOffset> Since { get; init; }
    public required Fact<ToolCategory> Tool { get; init; }
    public required Fact<int> Subagents { get; init; }
    public string? PermissionMode { get; init; }
    public string? ErrorKind { get; init; }
    public string? WaitingFor { get; init; }
    public ProcessIdentity? Process { get; init; }
    public HostInfo Host { get; init; } = HostInfo.Unknown;
    public OrcaLink? Orca { get; init; }
    /// <summary>The session title (claude agents "name"): Reveal mode only.</summary>
    public string? Title { get; init; }
    /// <summary>The workspace folder's basename: Reveal mode only.</summary>
    public string? Workspace { get; init; }
    public string? CwdHash { get; init; }
    public required DateTimeOffset FirstSeen { get; init; }
    public required DateTimeOffset LastSignal { get; init; }
    /// <summary>A live source vouches for this session right now (agent list, or a verified hook process that is still alive).</summary>
    public bool KnownLive { get; init; }
    /// <summary>Hooks have been seen for this session (Tier 1 is active for it).</summary>
    public bool HooksActive { get; init; }
    /// <summary>A Prism approval request is pending for this session.</summary>
    public string? PendingRequestId { get; init; }

    public bool NeedsYou => State.Value is SessionState.NeedsPermission or SessionState.NeedsInput or SessionState.Error;
    /// <summary>bypassPermissions / dontAsk: the deck can't protect it (tinted red on the board).</summary>
    public bool Unprotected => PermissionMode is "bypassPermissions" or "dontAsk";
    public bool Offline => State.Value is SessionState.Ended or SessionState.Dead;

    /// <summary>Ordering for "Next needs me": permission, then input, then error; oldest first within a kind.</summary>
    public int NeedsYouRank => State.Value switch
    {
        SessionState.NeedsPermission => 0,
        SessionState.NeedsInput => 1,
        SessionState.Error => 2,
        _ => 9,
    };
}

/// <summary>One state transition (for alerts: the "needs you" pulse, the Galleon banner, the done flash).</summary>
public sealed record SessionTransition(SessionKey Key, int Slot, SessionState? From, SessionState To, DateTimeOffset At)
{
    public bool IntoNeedsYou => To is SessionState.NeedsPermission or SessionState.NeedsInput or SessionState.Error
        && From is not (SessionState.NeedsPermission or SessionState.NeedsInput or SessionState.Error);
}

public static class SessionStates
{
    /// <summary>Display priority (lower = more urgent).</summary>
    public static int Priority(SessionState s) => s switch
    {
        SessionState.NeedsPermission => 0,
        SessionState.NeedsInput => 1,
        SessionState.Error => 2,
        SessionState.Working => 3,
        SessionState.Done => 4,
        SessionState.Idle => 5,
        SessionState.Stale => 6,
        SessionState.Dead => 7,
        _ => 8,
    };

    public static string Label(SessionState s) => s switch
    {
        SessionState.Idle => "IDLE",
        SessionState.Working => "WORKING",
        SessionState.NeedsPermission => "PERMISSION",
        SessionState.NeedsInput => "INPUT",
        SessionState.Done => "DONE",
        SessionState.Error => "ERROR",
        SessionState.Ended => "ENDED",
        SessionState.Dead => "CRASHED",
        SessionState.Stale => "NO SIGNAL",
        _ => "—",
    };

    public static string AgentLabel(AgentKind a) => a switch
    {
        AgentKind.Claude => "CLAUDE",
        AgentKind.Codex => "CODEX",
        AgentKind.Copilot => "COPILOT",
        AgentKind.Gemini => "GEMINI",
        AgentKind.Cursor => "CURSOR",
        _ => "AGENT",
    };

    public static AgentKind ParseAgent(string? tool) => tool?.Trim().ToLowerInvariant() switch
    {
        "claude" => AgentKind.Claude,
        "codex" => AgentKind.Codex,
        "copilot" => AgentKind.Copilot,
        "gemini" => AgentKind.Gemini,
        "cursor" => AgentKind.Cursor,
        _ => AgentKind.Unknown,
    };

    /// <summary>Maps a tool name to its category. Unknown tools are Other; MCP tools are Mcp.</summary>
    public static ToolCategory Categorize(string? toolName, string? mcpServer = null)
    {
        if (!string.IsNullOrEmpty(mcpServer)) return ToolCategory.Mcp;
        if (string.IsNullOrEmpty(toolName)) return ToolCategory.None;
        if (toolName.StartsWith("mcp__", StringComparison.OrdinalIgnoreCase)) return ToolCategory.Mcp;
        return toolName.ToLowerInvariant() switch
        {
            "bash" or "powershell" or "shell" or "local_shell" or "exec_command" or "unified_exec" or "run_shell_command" or "terminal" => ToolCategory.Bash,
            "edit" or "write" or "multiedit" or "notebookedit" or "apply_patch" or "write_file" or "replace" or "str_replace" => ToolCategory.Edit,
            "read" or "glob" or "grep" or "ls" or "read_file" or "list_directory" or "search" or "view" => ToolCategory.Read,
            "webfetch" or "websearch" or "web_search" or "web_fetch" or "fetch" => ToolCategory.Web,
            "task" or "agent" or "spawn_agent" => ToolCategory.Agent,
            "askuserquestion" => ToolCategory.Ask,
            "exitplanmode" => ToolCategory.Plan,
            _ => ToolCategory.Other,
        };
    }

    public static string ToolLabel(ToolCategory c) => c switch
    {
        ToolCategory.Bash => "BASH",
        ToolCategory.Edit => "EDIT",
        ToolCategory.Read => "READ",
        ToolCategory.Web => "WEB",
        ToolCategory.Mcp => "MCP",
        ToolCategory.Agent => "AGENT",
        ToolCategory.Ask => "ASK",
        ToolCategory.Plan => "PLAN",
        ToolCategory.Compact => "COMPACT",
        ToolCategory.Other => "TOOL",
        _ => "",
    };
}
