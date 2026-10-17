using System.Globalization;
using System.Text.Json;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Services.Usage;

public enum BedrockState
{
    /// <summary>Not opted in (the default). Nothing runs.</summary>
    Off,
    /// <summary>Safe mode: the CLI is never started.</summary>
    SafeMode,
    /// <summary>aws.exe not found.</summary>
    NoCli,
    /// <summary>Opted in, but no valid profile name yet.</summary>
    NeedsProfile,
    /// <summary>Opted in and configured; nothing fetched yet (no visible surface, or the first call is running).</summary>
    Waiting,
    Ok,
    /// <summary>The SSO session expired (or no credentials): the user runs <c>aws sso login</c> themselves. Prism never prompts.</summary>
    SignInNeeded,
    ProfileNotFound,
    AccessDenied,
    Throttled,
    Error,
}

/// <summary>Per-minute sums from CloudWatch AWS/Bedrock (account- and region-wide).</summary>
public sealed record BedrockSeries(IReadOnlyList<UsagePoint> InputTokens, IReadOnlyList<UsagePoint> OutputTokens,
    IReadOnlyList<UsagePoint> Invocations, IReadOnlyList<UsagePoint> Throttles)
{
    public DateTimeOffset? LatestAt => InputTokens.Concat(OutputTokens).Concat(Invocations).Select(p => (DateTimeOffset?)p.At).DefaultIfEmpty(null).Max();
    public double? LatestInput => InputTokens.Count > 0 ? InputTokens[^1].Value : null;
    public double? LatestOutput => OutputTokens.Count > 0 ? OutputTokens[^1].Value : null;
    public double ThrottleSum => Throttles.Sum(p => p.Value);
    public double InvocationSum => Invocations.Sum(p => p.Value);
    public bool IsEmpty => InputTokens.Count == 0 && OutputTokens.Count == 0 && Invocations.Count == 0 && Throttles.Count == 0;
}

public sealed record BedrockSnapshot(BedrockState State, string Region, string? Profile, Fact<BedrockSeries> Series, DateTimeOffset? LastAttempt, DateTimeOffset? NextAllowed);

/// <summary>
/// Bedrock usage through CloudWatch, OPT-IN ONLY (default off), via the user's own AWS CLI and a read-only profile
/// (ai-status.md §3.2). Exactly one command ever runs (see <see cref="Command"/>): <c>aws cloudwatch get-metric-data</c>,
/// at most once every 5 minutes and only while a Bedrock surface is visible (or a Smart readout asked in the last 5 minutes).
/// No AWS credentials are read or stored. Sign-in problems show "sign in with aws sso login"; the plugin never prompts and never
/// runs <c>aws sso login</c> itself. Safe mode never starts the CLI.
/// </summary>
public sealed class BedrockUsageService
{
    public static readonly TimeSpan Floor = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(30);
    public static readonly TimeSpan CliTimeout = TimeSpan.FromSeconds(30);
    public static readonly string[] Metrics = ["InputTokenCount", "OutputTokenCount", "Invocations", "InvocationThrottles"];

    private readonly IAwsCli _cli;
    private readonly Func<Ai2Settings> _settings;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly bool _safeMode;
    private readonly object _gate = new();
    private BedrockState _state = BedrockState.Waiting;
    private Fact<BedrockSeries> _series = Fact<BedrockSeries>.Unknown;
    private DateTimeOffset? _lastAttempt;
    private (string? Profile, string Region) _config;
    private DateTimeOffset _touchedUntil;
    private int _leases;
    private int _running;
    private bool _forced;

    public BedrockUsageService(IAwsCli cli, Func<Ai2Settings> settings, TimeProvider time, ILog log, bool safeMode)
    {
        _cli = cli;
        _settings = settings;
        _time = time;
        _log = log;
        _safeMode = safeMode;
        var s = settings();
        _config = (s.Profile, s.Region);
    }

    public event Action? Changed;

    public Action<Func<Task>> Kicker { get; set; } = work => _ = work();

    public IDisposable Demand()
    {
        Interlocked.Increment(ref _leases);
        Kicker(() => TickAsync(CancellationToken.None));
        return new Lease(this);
    }

    public void Touch()
    {
        lock (_gate) _touchedUntil = _time.GetUtcNow() + TimeSpan.FromMinutes(5);
    }

    public bool Demanded
    {
        get
        {
            if (Volatile.Read(ref _leases) > 0) return true;
            lock (_gate) return _time.GetUtcNow() < _touchedUntil;
        }
    }

    /// <summary>The exact read-only command (shown in the PI before the user opts in, and the one that runs).</summary>
    public static IReadOnlyList<string> Command(string profile, string region, DateTimeOffset end)
    {
        var e = new DateTimeOffset(end.Year, end.Month, end.Day, end.Hour, end.Minute, 0, TimeSpan.Zero);
        var s = e - Window;
        var queries = "[" + string.Join(",", Metrics.Select((m, i) =>
            $"{{\"Id\":\"m{i}\",\"MetricStat\":{{\"Metric\":{{\"Namespace\":\"AWS/Bedrock\",\"MetricName\":\"{m}\"}},\"Period\":60,\"Stat\":\"Sum\"}},\"ReturnData\":true}}")) + "]";
        return
        [
            "cloudwatch", "get-metric-data",
            "--profile", profile,
            "--region", region,
            "--start-time", s.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
            "--end-time", e.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
            "--metric-data-queries", queries,
            "--output", "json",
            "--no-cli-pager",
        ];
    }

    /// <summary>What the PI shows before (and after) the opt-in.</summary>
    public static string Explain(Ai2Settings s) =>
        $"Runs exactly one read-only command: aws cloudwatch get-metric-data --profile {s.Profile ?? "<profile>"} --region {s.Region} " +
        "(4 metrics of AWS/Bedrock: InputTokenCount, OutputTokenCount, Invocations, InvocationThrottles; per-minute sums over the last 30 minutes). " +
        $"At most once every {(int)s.BedrockCadence.TotalMinutes} minutes, and only while a Bedrock usage dial or the AI OPS widget is visible. " +
        "Needs only cloudwatch:GetMetricData. AWS bills about $0.01 per 1,000 metrics: at most about 1,150 metrics a day (about $0.01). " +
        "The numbers are account- and region-wide (every app and person on the account). Prism never reads or stores AWS credentials: " +
        $"your AWS CLI uses its own SSO session. If it has expired, run aws sso login --profile {s.Profile ?? "<profile>"} in a terminal.";

    public BedrockSnapshot Snapshot()
    {
        var s = _settings();
        var now = _time.GetUtcNow();
        lock (_gate)
        {
            SyncConfig(s);
            var state = !s.BedrockUsageEnabled ? BedrockState.Off
                : _safeMode ? BedrockState.SafeMode
                : s.Profile is null ? BedrockState.NeedsProfile
                : _state;
            DateTimeOffset? next = _lastAttempt is { } l ? l + Max(Floor, s.BedrockCadence) : null;
            return new BedrockSnapshot(state, s.Region, s.Profile, _series, _lastAttempt, next is { } n && n > now ? n : null);
        }
    }

    /// <summary>A dial push. False (with the time it becomes allowed) when the 5-minute floor forbids it.</summary>
    public bool RequestRefresh()
    {
        lock (_gate)
        {
            var now = _time.GetUtcNow();
            if (_lastAttempt is { } l && now - l < Floor) return false;
            _forced = true;
        }
        Kicker(() => TickAsync(CancellationToken.None));
        return true;
    }

    /// <summary>Runs the command when opted in, configured, demanded and due. Never in safe mode. Never concurrently.</summary>
    public async Task TickAsync(CancellationToken ct)
    {
        var s = _settings();
        if (!s.BedrockUsageEnabled || _safeMode || s.Profile is not { } profile) return;
        var now = _time.GetUtcNow();
        lock (_gate)
        {
            SyncConfig(s);
            if (!_forced && !Demanded) return;
            if (_lastAttempt is { } l && now - l < Max(Floor, _forced ? Floor : s.BedrockCadence)) return;
        }
        if (Interlocked.Exchange(ref _running, 1) == 1) return;
        // The account and region this run reads: its result is kept only if they are still the configured ones when it lands.
        var run = ((string?)profile, s.Region);
        try
        {
            lock (_gate) { _forced = false; _lastAttempt = now; }
            if (_cli.Locate() is null)
            {
                Set(BedrockState.NoCli, null, now, run);
                return;
            }
            var r = await _cli.RunAsync(Command(profile, s.Region, now), CliTimeout, ct).ConfigureAwait(false);
            if (!r.Started) { Set(BedrockState.NoCli, null, now, run); return; }
            if (r.TimedOut) { Set(BedrockState.Error, null, now, run); _log.Info("Bedrock usage: the AWS CLI timed out"); return; }
            if (!r.Ok)
            {
                var state = r.Problem switch
                {
                    AwsCliProblem.SignInNeeded => BedrockState.SignInNeeded,
                    AwsCliProblem.ProfileNotFound => BedrockState.ProfileNotFound,
                    AwsCliProblem.AccessDenied => BedrockState.AccessDenied,
                    AwsCliProblem.Throttled => BedrockState.Throttled,
                    _ => BedrockState.Error,
                };
                _log.Info($"Bedrock usage: the AWS CLI failed ({state})");
                Set(state, null, now, run);
                return;
            }
            var series = Parse(r.StdOut);
            if (series is null) { Set(BedrockState.Error, null, now, run); _log.Info("Bedrock usage: unreadable CloudWatch answer"); return; }
            Set(BedrockState.Ok, series, now, run);
        }
        finally { Volatile.Write(ref _running, 0); }
    }

    private void Set(BedrockState state, BedrockSeries? series, DateTimeOffset now, (string? Profile, string Region) run)
    {
        lock (_gate)
        {
            // The profile or region changed while the CLI ran: this answer belongs to the old account/region. Drop it (the
            // config change already started the new one over), so another account's numbers never show under the new name.
            SyncConfig(_settings());
            if (run != _config)
            {
                _log.Debug("Bedrock usage: dropped a result for a profile or region that is no longer selected");
                return;
            }
            _state = state;
            if (series is not null)
                _series = Fact<BedrockSeries>.Reported(series, FactSource.CloudWatch, now, TimeSpan.FromTicks(Max(Floor, _settings().BedrockCadence).Ticks * 3));
        }
        try { Changed?.Invoke(); } catch (Exception ex) { _log.Warn("a Bedrock listener failed", ex); }
    }

    /// <summary>A new profile or region starts over: the old numbers belong to another account or region.</summary>
    private void SyncConfig(Ai2Settings s)
    {
        var cfg = (s.Profile, s.Region);
        if (cfg == _config) return;
        _config = cfg;
        _series = Fact<BedrockSeries>.Unknown;
        _state = BedrockState.Waiting;
        _lastAttempt = null;
    }

    /// <summary>Parses <c>get-metric-data</c> JSON (MetricDataResults[].{Id, Timestamps, Values}). Null when it isn't that shape.</summary>
    public static BedrockSeries? Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("MetricDataResults", out var results) || results.ValueKind != JsonValueKind.Array) return null;
            var byId = new Dictionary<string, List<UsagePoint>>(StringComparer.Ordinal);
            foreach (var r in results.EnumerateArray())
            {
                if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("Id", out var idEl) || idEl.GetString() is not { } id) continue;
                var pts = new List<UsagePoint>();
                if (r.TryGetProperty("Timestamps", out var ts) && r.TryGetProperty("Values", out var vs) && ts.ValueKind == JsonValueKind.Array && vs.ValueKind == JsonValueKind.Array)
                {
                    var tl = ts.EnumerateArray().ToList();
                    var vl = vs.EnumerateArray().ToList();
                    for (var i = 0; i < Math.Min(tl.Count, vl.Count); i++)
                        if (tl[i].ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(tl[i].GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at)
                            && vl[i].ValueKind == JsonValueKind.Number && vl[i].TryGetDouble(out var v) && double.IsFinite(v) && v >= 0)
                            pts.Add(new UsagePoint(at, v));
                }
                byId[id] = [.. pts.OrderBy(p => p.At)];
            }
            List<UsagePoint> Get(int i) => byId.TryGetValue("m" + i, out var l) ? l : [];
            return new BedrockSeries(Get(0), Get(1), Get(2), Get(3));
        }
        catch (JsonException) { return null; }
    }

    private static TimeSpan Max(TimeSpan a, TimeSpan b) => a > b ? a : b;

    private void Release() => Interlocked.Decrement(ref _leases);

    private sealed class Lease(BedrockUsageService owner) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(); }
    }
}
