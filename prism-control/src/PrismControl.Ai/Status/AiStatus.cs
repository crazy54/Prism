using PrismControl.Ai.Sessions;

namespace PrismControl.Ai.Status;

// The unified "AI Status" model (research/ai-status.md §4): AiStatus = Sessions + Apps + Services, every value a Fact<T>
// with source + confidence. AI1 fills Sessions (SessionTracker). AI2 fills Apps and Services through IAiStatusSink.
// Rendering rules for every consumer: observed/reported solid; inferred hollow with "~"; stale at 40 % ink + clock badge;
// unknown as "—" (never 0). Show the scope with a number ("account-wide", "est.", "as of yesterday").

/// <summary>A native desktop AI app (Claude Desktop, ChatGPT, Copilot, Gemini, VS Code, Cursor). Owned by AI2.</summary>
public sealed record AppStatus
{
    /// <summary>A stable id, e.g. "claude-desktop", "chatgpt", "copilot", "gemini", "vscode", "cursor".</summary>
    public required string Id { get; init; }
    /// <summary>Display name as text only (no logos).</summary>
    public required string Name { get; init; }
    public Fact<bool> Running { get; init; } = Fact<bool>.Unknown;
    public Fact<bool> Foreground { get; init; } = Fact<bool>.Unknown;
    public Fact<bool> VoiceLive { get; init; } = Fact<bool>.Unknown;
    public Fact<bool> Attention { get; init; } = Fact<bool>.Unknown;
    /// <summary>Always unknown for chat apps: there is no supported "generating" signal, and the deck never guesses.</summary>
    public Fact<bool> Generating { get; init; } = Fact<bool>.Unknown;
    /// <summary>Codex tasks working inside the ChatGPT app (from the session table).</summary>
    public Fact<int> AgentTasks { get; init; } = Fact<int>.Unknown;
}

public enum Health { Operational, Degraded, PartialOutage, MajorOutage, Maintenance }

public sealed record ServiceComponent(string Id, string Name, Health Health);

/// <summary>A limit window (label by window minutes: 300 → "5H", 10080 → "WEEK").</summary>
public sealed record LimitWindow(string Label, double UsedPercent, DateTimeOffset? ResetsAt, string Scope);

public sealed record UsagePoint(DateTimeOffset At, double Value);

public sealed record UsageSeries(string Metric, string Unit, IReadOnlyList<UsagePoint> Points, string Scope);

public sealed record CostSummary(decimal Amount, string Currency, string Period, string Scope);

/// <summary>A provider: health from public status pages, usage/limits/cost from official APIs (opt-in). Owned by AI2.</summary>
public sealed record ServiceStatus
{
    /// <summary>"anthropic", "openai", "github", "cursor", "google", "aws-bedrock".</summary>
    public required string Provider { get; init; }
    public required string Name { get; init; }
    public Fact<Health> Health { get; init; } = Fact<Health>.Unknown;
    public Fact<IReadOnlyList<ServiceComponent>> Components { get; init; } = Fact<IReadOnlyList<ServiceComponent>>.Unknown;
    public Fact<IReadOnlyList<LimitWindow>> Limits { get; init; } = Fact<IReadOnlyList<LimitWindow>>.Unknown;
    public Fact<UsageSeries> Usage { get; init; } = Fact<UsageSeries>.Unknown;
    public Fact<CostSummary> Cost { get; init; } = Fact<CostSummary>.Unknown;
}

/// <summary>One immutable snapshot of everything (privacy-projected sessions).</summary>
public sealed record AiStatus(IReadOnlyList<SessionView> Sessions, IReadOnlyList<AppStatus> Apps, IReadOnlyList<ServiceStatus> Services, DateTimeOffset At);

/// <summary>Read side, for actions (keys, dials, widgets) and a future redacted /v1/ai/status topic.</summary>
public interface IAiStatus
{
    AiStatus Snapshot();
    /// <summary>Raised when any layer changed (outside locks, on any thread: Post to your mailbox).</summary>
    event Action? Changed;
}

/// <summary>Write side for AI2's Apps + Services features. Each call replaces that layer's list (latest wins).</summary>
public interface IAiStatusSink
{
    void PublishApps(IReadOnlyList<AppStatus> apps);
    void PublishServices(IReadOnlyList<ServiceStatus> services);
    /// <summary>Passive Codex limits from the rollout tail (token_count), for AI2's usage dials.</summary>
    event Action<CodexRateLimits>? CodexLimitsObserved;
}

/// <summary>The one hub: Sessions from <see cref="SessionTracker"/>, Apps + Services from AI2. Thread-safe.</summary>
public sealed class AiStatusHub : IAiStatus, IAiStatusSink
{
    private readonly SessionTracker _sessions;
    private readonly Func<PrivacyMode> _privacy;
    private readonly TimeProvider _time;
    private IReadOnlyList<AppStatus> _apps = [];
    private IReadOnlyList<ServiceStatus> _services = [];

    public AiStatusHub(SessionTracker sessions, Func<PrivacyMode> privacy, TimeProvider time)
    {
        _sessions = sessions;
        _privacy = privacy;
        _time = time;
        _sessions.Changed += _ => Changed?.Invoke();
    }

    public event Action? Changed;
    public event Action<CodexRateLimits>? CodexLimitsObserved;

    public AiStatus Snapshot() => new(_sessions.Snapshot(_privacy()), Volatile.Read(ref _apps), Volatile.Read(ref _services), _time.GetUtcNow());

    public void PublishApps(IReadOnlyList<AppStatus> apps)
    {
        Volatile.Write(ref _apps, apps.ToList());
        Changed?.Invoke();
    }

    public void PublishServices(IReadOnlyList<ServiceStatus> services)
    {
        Volatile.Write(ref _services, services.ToList());
        Changed?.Invoke();
    }

    /// <summary>The rollout tailer reports Codex limits here; AI2 listens on <see cref="IAiStatusSink.CodexLimitsObserved"/>.</summary>
    internal void ReportCodexLimits(CodexRateLimits limits) => CodexLimitsObserved?.Invoke(limits);
}
