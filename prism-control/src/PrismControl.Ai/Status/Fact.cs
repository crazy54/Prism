namespace PrismControl.Ai.Status;

/// <summary>How sure we are of a value (research/ai-status.md §4). Ordered: a higher value wins a disagreement.</summary>
public enum Confidence
{
    /// <summary>No source can tell us (for example "ChatGPT is generating"). Drawn as "—", never as 0.</summary>
    Unknown = 0,
    /// <summary>Was observed or reported, but is older than its TTL. Drawn at 40 % ink with a clock badge.</summary>
    Stale = 1,
    /// <summary>Derived by a rule (a timeout, a cwd join, "voice live" from an audio session). Drawn hollow with a "~".</summary>
    Inferred = 2,
    /// <summary>An authoritative source told us (agent list, status page, CloudWatch datapoint).</summary>
    Reported = 3,
    /// <summary>Seen directly just now (a hook event, a process exit, our own API call).</summary>
    Observed = 4,
}

/// <summary>Where a value came from. Never averaged across sources.</summary>
public enum FactSource
{
    None,
    Hook,
    AgentList,
    Process,
    Rollout,
    AppServer,
    Otel,
    StatusLine,
    StatusPage,
    CloudWatch,
    CostExplorer,
    AdminApi,
    WinEvent,
    CoreAudio,
    Orca,
    Heuristic,
}

/// <summary>
/// One value with its provenance: <c>Fact&lt;T&gt; { value, source, confidence, observedAt, ttl }</c>.
/// <see cref="At"/> gives the confidence as of a moment (an expired fact reads as <see cref="Confidence.Stale"/>).
/// </summary>
public readonly record struct Fact<T>(T? Value, FactSource Source, Confidence Confidence, DateTimeOffset ObservedAt, TimeSpan Ttl)
{
    public static Fact<T> Unknown => new(default, FactSource.None, Confidence.Unknown, DateTimeOffset.MinValue, TimeSpan.Zero);

    public bool IsKnown => Confidence != Confidence.Unknown;

    public static Fact<T> Observed(T value, FactSource source, DateTimeOffset at, TimeSpan ttl) => new(value, source, Confidence.Observed, at, ttl);
    public static Fact<T> Reported(T value, FactSource source, DateTimeOffset at, TimeSpan ttl) => new(value, source, Confidence.Reported, at, ttl);
    public static Fact<T> Inferred(T value, FactSource source, DateTimeOffset at, TimeSpan ttl) => new(value, source, Confidence.Inferred, at, ttl);

    /// <summary>The confidence as of <paramref name="now"/>: past its TTL, a known fact is <see cref="Confidence.Stale"/>. A zero/infinite TTL never expires.</summary>
    public Confidence At(DateTimeOffset now)
    {
        if (Confidence is Confidence.Unknown or Confidence.Stale) return Confidence;
        if (Ttl <= TimeSpan.Zero || Ttl == Timeout.InfiniteTimeSpan) return Confidence;
        return now - ObservedAt > Ttl ? Confidence.Stale : Confidence;
    }

    public TimeSpan Age(DateTimeOffset now) => ObservedAt == DateTimeOffset.MinValue ? TimeSpan.Zero : now - ObservedAt;

    public Fact<T> With(T value, DateTimeOffset at) => this with { Value = value, ObservedAt = at };

    public override string ToString() => $"{Value} ({Source}, {Confidence}, {ObservedAt:HH:mm:ss})";
}

public static class Facts
{
    /// <summary>
    /// Precedence (ai-status.md §4 rule 1): the higher-confidence fact as of <paramref name="now"/> wins; on a tie the fresher
    /// one wins. Sources never average. Unknown never beats a known value.
    /// </summary>
    public static Fact<T> Pick<T>(Fact<T> a, Fact<T> b, DateTimeOffset now)
    {
        var ca = a.At(now);
        var cb = b.At(now);
        if (ca != cb) return ca > cb ? a : b;
        return b.ObservedAt > a.ObservedAt ? b : a;
    }
}
