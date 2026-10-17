using PrismControl.Ai.Status;

namespace PrismControl.Ai.Services.StatusPages;

/// <summary>One component of a status page, as parsed (Health null = a status word we don't know: ignored, never guessed).</summary>
public sealed record PageComponent(string Id, string Name, Status.Health? Health);

/// <summary>An open incident or event: public text only (its name or summary), never the long body.</summary>
public sealed record PageIncident(string Name, Status.Health Severity, IReadOnlyList<string> Affected);

/// <summary>
/// A status source after parsing: components, the page-wide indicator (Statuspage only) and open incidents.
/// Every parser is lenient: unknown fields are skipped, a broken document yields null (the cache is kept, the fetch counts as an error).
/// </summary>
public sealed record ParsedPage(IReadOnlyList<PageComponent> Components, Status.Health? Indicator, IReadOnlyList<PageIncident> Incidents);

/// <summary>What one provider shows, projected from its source: the components that matter, the worst of them, one incident line.</summary>
public sealed record ProviderReading(Status.Health Health, IReadOnlyList<ServiceComponent> Components, string? Incident);

public enum HealthFetchState
{
    /// <summary>Nothing fetched yet (no surface asked for it, or the first fetch is in flight).</summary>
    NeverFetched,
    Ok,
    /// <summary>The last attempt failed; the cached reading (if any) is shown and goes stale after its TTL.</summary>
    Errored,
}

/// <summary>Everything a key, strip or readout needs for one provider. Health is a Fact (reported by the status page; stale after its TTL).</summary>
public sealed record ProviderHealthView(
    string Id,
    string Name,
    string Short,
    string PageUrl,
    Fact<Status.Health> Health,
    IReadOnlyList<ServiceComponent> Components,
    string? Incident,
    HealthFetchState State,
    DateTimeOffset? LastAttempt)
{
    /// <summary>Components that are not operational.</summary>
    public int Affected => Components.Count(c => c.Health != Status.Health.Operational);

    /// <summary>The name of the worst component (null when all are operational or unknown).</summary>
    public string? Worst => Components.Where(c => c.Health != Status.Health.Operational).OrderByDescending(c => HealthLevels.Severity(c.Health)).FirstOrDefault()?.Name;
}

/// <summary>Severity order and the words the deck draws.</summary>
public static class HealthLevels
{
    /// <summary>0 operational · 1 maintenance · 2 degraded · 3 partial outage · 4 major outage.</summary>
    public static int Severity(Status.Health h) => h switch
    {
        Status.Health.Operational => 0,
        Status.Health.Maintenance => 1,
        Status.Health.Degraded => 2,
        Status.Health.PartialOutage => 3,
        Status.Health.MajorOutage => 4,
        _ => 0,
    };

    public static Status.Health Worst(IEnumerable<Status.Health> levels, Status.Health whenEmpty = Status.Health.Operational)
    {
        var any = false;
        var worst = Status.Health.Operational;
        foreach (var h in levels)
        {
            any = true;
            if (Severity(h) > Severity(worst)) worst = h;
        }
        return any ? worst : whenEmpty;
    }

    /// <summary>The key's status word.</summary>
    public static string Word(Status.Health h) => h switch
    {
        Status.Health.Operational => "OK",
        Status.Health.Maintenance => "MAINT",
        Status.Health.Degraded => "DEGRADED",
        Status.Health.PartialOutage => "PARTIAL",
        Status.Health.MajorOutage => "OUTAGE",
        _ => "—",
    };

    /// <summary>Statuspage component status words.</summary>
    public static Status.Health? FromStatuspage(string? status) => status switch
    {
        "operational" => Status.Health.Operational,
        "degraded_performance" => Status.Health.Degraded,
        "partial_outage" => Status.Health.PartialOutage,
        "major_outage" => Status.Health.MajorOutage,
        "under_maintenance" => Status.Health.Maintenance,
        _ => null,
    };

    /// <summary>Statuspage page indicator.</summary>
    public static Status.Health? FromIndicator(string? indicator) => indicator switch
    {
        "none" => Status.Health.Operational,
        "minor" => Status.Health.Degraded,
        "major" => Status.Health.PartialOutage,
        "critical" => Status.Health.MajorOutage,
        "maintenance" => Status.Health.Maintenance,
        _ => null,
    };

    /// <summary>Google incident severity (low / medium / high).</summary>
    public static Status.Health FromGoogleSeverity(string? severity) => severity switch
    {
        "high" => Status.Health.MajorOutage,
        "medium" => Status.Health.PartialOutage,
        _ => Status.Health.Degraded,
    };

    /// <summary>
    /// AWS Health dashboard status digits. Undocumented ([L]); our reading of the public feed: 0 resolved, 1 informational,
    /// 2 degraded, 3 disruption. Null = resolved (not shown).
    /// </summary>
    public static Status.Health? FromAws(string? status) => status?.Trim() switch
    {
        "0" or "" or null => null,
        "1" => Status.Health.Degraded,
        "2" => Status.Health.PartialOutage,
        "3" => Status.Health.MajorOutage,
        _ => Status.Health.Degraded,
    };
}
