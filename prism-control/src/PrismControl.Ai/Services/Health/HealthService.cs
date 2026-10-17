using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Services.StatusPages;

/// <summary>
/// Polls the public status feeds with the etiquette of research/ai-status.md §3.1:
/// <list type="bullet">
/// <item>only on demand: a source is fetched while a surface showing one of its providers is visible (every
/// <see cref="Ai2Settings.HealthCadence"/>, default 2 min), or, once something was shown in this run, every 10 minutes in the
/// background (<see cref="Ai2Settings.BackgroundHealth"/>), for the sources that were shown only. Nothing is ever fetched before the first demand;</item>
/// <item>never more often than the source's floor (60 s; AWS 5 min; Google 2 min), user refreshes included;</item>
/// <item>conditional GETs (If-None-Match / If-Modified-Since: a 304 keeps the cache and counts as fresh), ±20 % jitter,
/// exponential backoff to 15 min on errors, and Retry-After honored (capped at 30 min);</item>
/// <item>the parsed page is cached in memory; a reading older than its TTL (3 × the visible cadence, at least 6 min) reads as
/// stale on the deck (40 % ink + a clock badge), never as fresh.</item>
/// </list>
/// Thread-safe. <see cref="Changed"/> fires on a thread-pool thread after each completed fetch.
/// </summary>
public sealed class HealthService : IDisposable
{
    public static readonly TimeSpan BackgroundCadence = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan TouchWindow = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan MaxRetryAfter = TimeSpan.FromMinutes(30);
    public static readonly TimeSpan MinTtl = TimeSpan.FromMinutes(6);
    public const double JitterLow = 0.8, JitterHigh = 1.2;
    /// <summary>
    /// The longest one fetch may take, on this service's clock (the fetcher has its own 20 s deadline too). A fetch that never
    /// returns frees its source here, so it can never keep that source (or, as before, every other source) from polling.
    /// </summary>
    public static readonly TimeSpan FetchDeadline = TimeSpan.FromSeconds(25);

    private sealed class SourceState(StatusSource def)
    {
        public readonly StatusSource Def = def;
        public string? ETag;
        public string? LastModified;
        public ParsedPage? Page;
        public DateTimeOffset? LastSuccess;
        /// <summary>When the last fetch STARTED: the floors, cadence, backoff and user refreshes all count from here.</summary>
        public DateTimeOffset? LastAttempt;
        /// <summary>When the last fetch finished (what the faces and the PI call "checked").</summary>
        public DateTimeOffset? LastFinished;
        public int Errors;
        public double Jitter = 1;
        public DateTimeOffset? RetryAfterUntil;
        public bool InFlight;
        public bool Forced;
    }

    private readonly IHttpFetcher _http;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly Func<Ai2Settings> _settings;
    private readonly Func<double> _random;
    private readonly object _gate = new();
    private readonly Dictionary<string, SourceState> _sources;
    private readonly Dictionary<string, int> _leases = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DateTimeOffset> _touched = new(StringComparer.Ordinal);
    /// <summary>Sources a surface or readout asked for in this run: only these get the slow background poll.</summary>
    private readonly HashSet<string> _shownSources = new(StringComparer.Ordinal);
    private bool _everDemanded;
    private ITimer? _timer;
    private CancellationToken _shutdown;

    public HealthService(IHttpFetcher http, TimeProvider time, ILog log, Func<Ai2Settings> settings, Func<double>? random = null)
    {
        _http = http;
        _time = time;
        _log = log;
        _settings = settings;
        _random = random ?? Random.Shared.NextDouble;
        _sources = HealthCatalog.Sources.ToDictionary(s => s.Id, s => new SourceState(s), StringComparer.Ordinal);
    }

    /// <summary>Raised after a fetch completed (any thread). Post to your mailbox.</summary>
    public event Action? Changed;

    /// <summary>How fetches started by a new demand run: inline by default (tests); production hands them to the thread pool.</summary>
    public Action<Func<Task>> Kicker { get; set; } = work => _ = work();

    public bool EverDemanded { get { lock (_gate) return _everDemanded; } }

    /// <summary>Starts the 5-second scheduler tick (it only fetches what is due).</summary>
    public void Start(CancellationToken shutdown)
    {
        _shutdown = shutdown;
        _timer = _time.CreateTimer(_ => { _ = TickAsync(_shutdown); }, null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        shutdown.Register(Dispose);
    }

    /// <summary>A visible surface wants these providers. Dispose the lease when it disappears. A new demand fetches at once when allowed.</summary>
    public IDisposable Demand(IEnumerable<string> providerIds)
    {
        var ids = providerIds.Where(id => HealthCatalog.Find(id) is not null).Select(id => HealthCatalog.Find(id)!.Id).Distinct().ToList();
        lock (_gate)
        {
            foreach (var id in ids)
            {
                _leases[id] = _leases.GetValueOrDefault(id) + 1;
                _shownSources.Add(HealthCatalog.Find(id)!.SourceId);
            }
            if (ids.Count > 0) _everDemanded = true;
        }
        if (ids.Count > 0) Kick();
        return new Lease(this, ids);
    }

    /// <summary>A Smart Deck readout read: counts as demand for <see cref="TouchWindow"/>.</summary>
    public void Touch(string providerId)
    {
        if (HealthCatalog.Find(providerId) is not { } p) return;
        bool fresh;
        lock (_gate)
        {
            fresh = !_touched.TryGetValue(p.Id, out var until) || until <= _time.GetUtcNow();
            _touched[p.Id] = _time.GetUtcNow() + TouchWindow;
            _shownSources.Add(p.SourceId);
            _everDemanded = true;
        }
        if (fresh) Kick();
    }

    private void Release(IReadOnlyList<string> ids)
    {
        lock (_gate)
            foreach (var id in ids)
                if (_leases.TryGetValue(id, out var n)) { if (n <= 1) _leases.Remove(id); else _leases[id] = n - 1; }
    }

    private void Kick() => Kicker(() => TickAsync(_shutdown));

    /// <summary>
    /// A user push: refetch the provider's source now, unless that would be impolite. Refused (false; the face says "UP TO DATE")
    /// while a fetch of that source is in flight, while the server's Retry-After is running, and within the source's floor since
    /// the last attempt STARTED (60 s; AWS 5 min; doubled while the source is failing, so pushes can't defeat the backoff).
    /// </summary>
    public bool RequestRefresh(string providerId)
    {
        if (HealthCatalog.Find(providerId) is not { } p) return false;
        lock (_gate)
        {
            var s = _sources[p.SourceId];
            if (!CanRefreshLocked(s, _time.GetUtcNow())) return false;
            s.Forced = true;
            _shownSources.Add(s.Def.Id);
            _everDemanded = true;
        }
        Kick();
        return true;
    }

    /// <summary>Whether a user refresh of this provider's source would be accepted now (no side effects).</summary>
    public bool CanRefresh(string providerId)
    {
        if (HealthCatalog.Find(providerId) is not { } p) return false;
        lock (_gate) return CanRefreshLocked(_sources[p.SourceId], _time.GetUtcNow());
    }

    private static bool CanRefreshLocked(SourceState s, DateTimeOffset now)
    {
        if (s.InFlight) return false;
        if (s.RetryAfterUntil is { } ra && now < ra) return false;
        var floor = s.Errors > 0 ? s.Def.MinInterval * 2 : s.Def.MinInterval;
        return s.LastAttempt is not { } last || now - last >= floor;
    }

    /// <summary>
    /// Starts every source that is demanded and due, and completes when those fetches finish (or hit <see cref="FetchDeadline"/>).
    /// Safe to call often and concurrently: a source that is in flight is skipped, so one slow or stalled source never delays
    /// another (there is no global "ticking" gate any more).
    /// </summary>
    public Task TickAsync(CancellationToken ct)
    {
        var now = _time.GetUtcNow();
        var due = new List<SourceState>();
        lock (_gate)
        {
            foreach (var s in _sources.Values)
            {
                if (s.InFlight) continue;
                var demanded = IsDemanded(s.Def.Id, now);
                // Background: only sources something showed in this run, every 10 minutes, if the user keeps it on.
                if (!s.Forced && !demanded && !(_shownSources.Contains(s.Def.Id) && _settings().BackgroundHealth)) continue;
                if (!s.Forced && NextDue(s, demanded) > now) continue;
                s.InFlight = true;
                s.Forced = false;
                s.LastAttempt = now;   // at the START: a push during this fetch is measured from here
                due.Add(s);
            }
        }
        return due.Count == 0 ? Task.CompletedTask : Task.WhenAll(due.Select(s => FetchAsync(s, ct)));
    }

    private bool IsDemanded(string sourceId, DateTimeOffset now)
    {
        foreach (var p in HealthCatalog.Providers)
        {
            if (p.SourceId != sourceId) continue;
            if (_leases.GetValueOrDefault(p.Id) > 0) return true;
            if (_touched.TryGetValue(p.Id, out var until) && until > now) return true;
        }
        return false;
    }

    /// <summary>When the source is next due (for tests and the PI): last attempt + cadence (or backoff) × jitter, floored, after Retry-After.</summary>
    private DateTimeOffset NextDue(SourceState s, bool demanded)
    {
        if (s.LastAttempt is not { } last) return DateTimeOffset.MinValue;
        var floor = s.Def.MinInterval;
        var cadence = Max(demanded ? _settings().HealthCadence : BackgroundCadence, floor);
        var delay = s.Errors == 0 ? cadence : Min(MaxBackoff, TimeSpan.FromTicks(cadence.Ticks * (1L << Math.Min(s.Errors - 1, 10))));
        delay = Max(floor, TimeSpan.FromTicks((long)(delay.Ticks * s.Jitter)));
        var due = last + delay;
        if (s.RetryAfterUntil is { } ra && ra > due) due = ra;
        return due;
    }

    public DateTimeOffset? NextDueFor(string sourceId)
    {
        lock (_gate)
        {
            var s = _sources[sourceId];
            return s.LastAttempt is null ? null : NextDue(s, IsDemanded(sourceId, _time.GetUtcNow()));
        }
    }

    private async Task FetchAsync(SourceState s, CancellationToken ct)
    {
        string? etag, lastModified;
        lock (_gate) { etag = s.ETag; lastModified = s.LastModified; }
        HttpFetchResult r;
        // Our own deadline on this service's clock, whatever the fetcher does: a source never stays in flight forever.
        using var deadline = new CancellationTokenSource(FetchDeadline, _time);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, deadline.Token);
        try
        {
            var fetch = _http.GetAsync(new HttpFetchRequest(s.Def.Url, etag, lastModified), linked.Token);
            r = await fetch.WaitAsync(linked.Token).ConfigureAwait(false);
        }
        catch (Exception) { r = HttpFetchResult.Failed; }
        var now = _time.GetUtcNow();
        ParsedPage? page = r.Ok ? StatusParsers.Parse(s.Def.Kind, r.Body, r.ContentType, now) : null;
        bool recovered = false, firstError = false;
        lock (_gate)
        {
            s.LastFinished = now;
            s.Jitter = JitterLow + (JitterHigh - JitterLow) * Math.Clamp(_random(), 0, 1);
            if (r.NotModified && s.Page is not null)
            {
                recovered = s.Errors > 0;
                s.Errors = 0;
                s.LastSuccess = now;
                s.RetryAfterUntil = null;
            }
            else if (r.Ok && page is not null)
            {
                recovered = s.Errors > 0;
                s.Errors = 0;
                s.Page = page;
                s.LastSuccess = now;
                s.ETag = r.ETag;
                s.LastModified = r.LastModified;
                s.RetryAfterUntil = null;
            }
            else
            {
                firstError = s.Errors == 0;
                s.Errors++;
                if (r.NotModified) { s.ETag = null; s.LastModified = null; }   // a 304 we can't use: ask for the full page next time
                if (r.RetryAfter is { } ra && ra > TimeSpan.Zero) s.RetryAfterUntil = now + Min(ra, MaxRetryAfter);
            }
            s.InFlight = false;
        }
        if (firstError) _log.Info($"status page {s.Def.Id}: {(r.NetworkError ? "network error" : r.Ok ? "unreadable answer" : "HTTP " + r.Status)}; backing off");
        else if (recovered) _log.Debug($"status page {s.Def.Id}: back");
        try { Changed?.Invoke(); } catch (Exception ex) { _log.Warn("a health listener failed", ex); }
    }

    public IReadOnlyList<ProviderHealthView> All(DateTimeOffset now) => HealthCatalog.Providers.Select(p => Get(p.Id, now)!).ToList();

    /// <summary>The provider's current view (null for an unknown id). Cheap: no I/O.</summary>
    public ProviderHealthView? Get(string providerId, DateTimeOffset now)
    {
        if (HealthCatalog.Find(providerId) is not { } p) return null;
        ParsedPage? page;
        DateTimeOffset? success, attempt;
        int errors;
        StatusSource def;
        lock (_gate)
        {
            var s = _sources[p.SourceId];
            page = s.Page;
            success = s.LastSuccess;
            attempt = s.LastFinished;
            errors = s.Errors;
            def = s.Def;
        }
        var state = attempt is null ? HealthFetchState.NeverFetched : errors > 0 ? HealthFetchState.Errored : HealthFetchState.Ok;
        var reading = page is null ? null : HealthCatalog.Project(p, page, _settings().BedrockRegions);
        if (reading is null || success is null)
            return new ProviderHealthView(p.Id, p.Name, p.Short, p.PageUrl, Fact<Health>.Unknown, [], null, state, attempt);
        var ttl = Max(MinTtl, TimeSpan.FromTicks(Max(_settings().HealthCadence, def.MinInterval).Ticks * 3));
        return new ProviderHealthView(p.Id, p.Name, p.Short, p.PageUrl, Fact<Health>.Reported(reading.Health, FactSource.StatusPage, success.Value, ttl),
            reading.Components, reading.Incident, state, attempt);
    }

    private static TimeSpan Max(TimeSpan a, TimeSpan b) => a > b ? a : b;
    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    public void Dispose()
    {
        _timer?.Dispose();
        _timer = null;
    }

    private sealed class Lease(HealthService owner, IReadOnlyList<string> ids) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) owner.Release(ids); }
    }
}
