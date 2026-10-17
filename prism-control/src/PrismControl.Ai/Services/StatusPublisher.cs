using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Status;

namespace PrismControl.Ai.Services;

/// <summary>
/// Projects AI2's layers into AI1's unified model (<see cref="IAiStatusSink"/>): Apps (running / foreground / voice / generating =
/// unknown / agent tasks) and Services (health + components from status pages, Codex limits, Bedrock usage, admin cost). Every value
/// keeps its Fact (source, confidence, observedAt, TTL); nothing is averaged or invented.
/// </summary>
public sealed class StatusPublisher
{
    private readonly Ai2Services _s;
    private readonly IAiStatusSink? _sink;

    public StatusPublisher(Ai2Services services, IAiStatusSink? sink)
    {
        _s = services;
        _sink = sink;
        services.Health.Changed += PublishServices;
        services.Codex.Changed += PublishServices;
        services.Bedrock.Changed += PublishServices;
        services.Admin.Changed += PublishServices;
        services.Apps.Changed += PublishApps;
        services.Health.Changed += services.RaiseChanged;
        services.Codex.Changed += services.RaiseChanged;
        services.Bedrock.Changed += services.RaiseChanged;
        services.Admin.Changed += services.RaiseChanged;
        services.Apps.Changed += services.RaiseChanged;
        services.Settings.Changed += _ => { PublishServices(); services.RaiseChanged(); };
    }

    public void PublishApps()
    {
        if (_sink is null) return;
        _sink.PublishApps(Apps());
    }

    public IReadOnlyList<AppStatus> Apps() => _s.Apps.All().Where(a => a.Installed || a.IsRunning).Select(a => new AppStatus
    {
        Id = a.Def.Id,
        Name = a.Def.Name,
        Running = a.Running,
        Foreground = a.Foreground,
        VoiceLive = a.VoiceLive,
        Attention = Fact<bool>.Unknown,
        Generating = Fact<bool>.Unknown,
        AgentTasks = a.AgentTasks,
    }).ToList();

    public void PublishServices()
    {
        if (_sink is null) return;
        _sink.PublishServices(Services());
    }

    public IReadOnlyList<ServiceStatus> Services()
    {
        var now = _s.Time.GetUtcNow();
        var list = new List<ServiceStatus>();
        foreach (var h in _s.Health.All(now))
        {
            var status = new ServiceStatus
            {
                Provider = h.Id,
                Name = h.Name,
                Health = h.Health,
                Components = h.Health.IsKnown
                    ? new Fact<IReadOnlyList<ServiceComponent>>(h.Components, h.Health.Source, h.Health.Confidence, h.Health.ObservedAt, h.Health.Ttl)
                    : Fact<IReadOnlyList<ServiceComponent>>.Unknown,
            };
            if (h.Id == "codex") status = status with { Limits = CodexLimits(now) };
            if (h.Id == "bedrock") status = status with { Usage = BedrockUsage() };
            if (h.Id == "claude" && Cost(AdminProvider.Anthropic) is { IsKnown: true } ac) status = status with { Cost = ac };
            if (h.Id == "openai" && Cost(AdminProvider.OpenAi) is { IsKnown: true } oc) status = status with { Cost = oc };
            list.Add(status);
        }
        return list;
    }

    private Fact<IReadOnlyList<LimitWindow>> CodexLimits(DateTimeOffset now)
    {
        var windows = _s.Codex.Windows(now);
        if (windows.Count == 0) return Fact<IReadOnlyList<LimitWindow>>.Unknown;
        var newest = windows.OrderByDescending(w => w.UsedPercent.ObservedAt).First().UsedPercent;
        IReadOnlyList<LimitWindow> list = windows.Select(w => new LimitWindow(w.Label, w.UsedPercent.Value, w.ResetsAt, "plan")).ToList();
        return new Fact<IReadOnlyList<LimitWindow>>(list, FactSource.Rollout, windows.Min(w => w.UsedPercent.Confidence), newest.ObservedAt, windows.Min(w => w.UsedPercent.Ttl));
    }

    private Fact<UsageSeries> BedrockUsage()
    {
        var b = _s.Bedrock.Snapshot();
        if (!b.Series.IsKnown || b.Series.Value is not { } series) return Fact<UsageSeries>.Unknown;
        var total = series.InputTokens.Concat(series.OutputTokens).GroupBy(p => p.At).OrderBy(g => g.Key).Select(g => new UsagePoint(g.Key, g.Sum(p => p.Value))).ToList();
        return new Fact<UsageSeries>(new UsageSeries("tokens per minute", "tokens", total, $"account-wide · {b.Region}"), b.Series.Source, b.Series.Confidence, b.Series.ObservedAt, b.Series.Ttl);
    }

    private Fact<CostSummary> Cost(AdminProvider p)
    {
        var a = _s.Admin.Snapshot(p);
        return a.State == AdminState.Ok ? a.MonthCost : Fact<CostSummary>.Unknown;
    }
}
