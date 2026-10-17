namespace PrismControl.Ai.Sessions;

/// <summary>
/// One row of <c>claude agents --json</c>, already minimized: the cwd is a hash + basename, and the title is only kept when
/// the user chose Reveal. Field names verified on this PC: pid, cwd, kind, startedAt, sessionId, name, status, waitingFor
/// (+ id/state for background sessions, per the docs).
/// </summary>
public sealed record AgentListEntry
{
    public int? Pid { get; init; }
    public string? SessionId { get; init; }
    /// <summary>Background sessions: the job id.</summary>
    public string? Id { get; init; }
    /// <summary>busy | waiting | idle (present while the process lives).</summary>
    public string? Status { get; init; }
    /// <summary>"permission prompt", "input needed", "dialog open", "sandbox request", "worker request".</summary>
    public string? WaitingFor { get; init; }
    /// <summary>interactive | background.</summary>
    public string? Kind { get; init; }
    /// <summary>Background sessions: working | blocked | done | failed | stopped.</summary>
    public string? BackgroundState { get; init; }
    public long? StartedAtMs { get; init; }
    public string? CwdHash { get; init; }
    public string? CwdName { get; init; }
    /// <summary>The session name (a title: content). Null unless Reveal mode is on.</summary>
    public string? Title { get; init; }

    public string? KeyId => SessionId ?? Id;
    public bool IsBackground => string.Equals(Kind, "background", StringComparison.OrdinalIgnoreCase);
}

/// <summary>One poll of one config directory. <see cref="Ok"/> false = the CLI failed: absences mean nothing.</summary>
public sealed record AgentListSnapshot(IReadOnlyList<AgentListEntry> Entries, DateTimeOffset ObservedAt, TimeSpan Ttl, string ConfigDir, bool Ok);

public enum RolloutKind { SessionMeta, TaskStarted, TaskComplete, TurnAborted }

/// <summary>A Codex rollout line reduced to keys and state (never message content).</summary>
public sealed record RolloutEvent(string ThreadId, RolloutKind Kind, DateTimeOffset At, string? Originator = null, string? CwdHash = null,
    string? CwdName = null, bool HasError = false);

/// <summary>An Orca agent row without its content fields (prompt, lastAssistantMessage, toolInput, preview are never parsed).</summary>
public sealed record OrcaAgent(string PaneKey, string? State, DateTimeOffset? StateStartedAt, string? AgentType, string? ToolName,
    string? WorktreeId, string? WorktreePathHash);

public sealed record OrcaTerminal(string Handle, string? TabId, string? LeafId, string? WorktreeId)
{
    public string? PaneKey => TabId is null || LeafId is null ? null : $"{TabId}:{LeafId}";
}

/// <summary>Optional enrichment only: Orca never creates a session and never sets its state.</summary>
public sealed record OrcaSnapshot(IReadOnlyList<OrcaAgent> Agents, IReadOnlyList<OrcaTerminal> Terminals, DateTimeOffset ObservedAt);
