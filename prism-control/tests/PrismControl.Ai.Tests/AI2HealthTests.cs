using System.Text;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Status;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Status-page parsers and projections, on fictional fixtures shaped like the live feeds.</summary>
public class AI2ParserTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
    private static ParsedPage Page(SourceKind k, string json) => Assert.NotNull(StatusParsers.Parse(k, Encoding.UTF8.GetBytes(json), "application/json", Now));
    private static ProviderReading Read(string provider, ParsedPage page, params string[] regions) =>
        Assert.NotNull(HealthCatalog.Project(HealthCatalog.Find(provider)!, page, regions.Length == 0 ? ["us-east-1"] : regions));

    [Test]
    public void Statuspage_components_that_matter_drive_the_health_and_others_are_ignored()
    {
        var ok = Read("claude", Page(SourceKind.Statuspage, AI2Fixtures.AnthropicSummary()));
        Assert.Equal(Health.Operational, ok.Health, "Claude Cowork's outage doesn't matter to this user");
        Assert.Equal(4, ok.Components.Count);

        var bad = Read("claude", Page(SourceKind.Statuspage, AI2Fixtures.AnthropicSummary("partial_outage", "degraded_performance",
            AI2Fixtures.Incident("Elevated errors on an example feature", "major", "yyzkbfz2thpt"))));
        Assert.Equal(Health.PartialOutage, bad.Health);
        Assert.Equal("Elevated errors on an example feature", bad.Incident);
        Assert.Equal(2, bad.Components.Count(c => c.Health != Health.Operational));
        Assert.Equal("Claude Code", bad.Components.OrderByDescending(c => HealthLevels.Severity(c.Health)).First().Name);
    }

    [Test]
    public void Groups_are_skipped_and_unknown_status_words_are_never_guessed()
    {
        var page = Page(SourceKind.Statuspage, AI2Fixtures.StatuspageSummary(("pjmpxvq2cmr2", "Copilot", "a_new_word")));
        Assert.False(page.Components.Any(c => c.Id == "grp1"), "group rows are aggregates");
        Assert.Null(page.Components.Single().Health);
        // The only component that matters has an unknown word → fall back to the page indicator (none → operational).
        Assert.Equal(Health.Operational, Read("github", page).Health);
    }

    [Test]
    public void Pinned_ids_first_then_unique_names_then_the_indicator_else_unknown()
    {
        // Renumbered page: same names, new ids → names still match.
        var renamed = Page(SourceKind.Statuspage, AI2Fixtures.StatuspageSummaryWith("minor", [], ("newid1", "IDE", "degraded_performance"), ("newid2", "CLI", "operational")));
        var r = Read("cursor", renamed);
        Assert.Equal(Health.Degraded, r.Health);
        Assert.Equal("newid1", r.Components.First(c => c.Name == "Cursor IDE").Id);

        // Nothing matches: the page indicator is used, with no components.
        var other = Page(SourceKind.Statuspage, AI2Fixtures.StatuspageSummaryWith("major", [], ("zzz", "Something else", "operational")));
        var ind = Read("cursor", other);
        Assert.Equal(Health.PartialOutage, ind.Health);
        Assert.Empty(ind.Components);

        // OpenAI's components.json has no indicator: no match → unknown, never "OK".
        var none = Page(SourceKind.Statuspage, "{\"components\":[{\"id\":\"x\",\"name\":\"Other\",\"status\":\"operational\"}]}");
        Assert.Null(HealthCatalog.Project(HealthCatalog.Find("codex")!, none, ["us-east-1"]));
    }

    [Test]
    public void OpenAi_components_split_into_OpenAI_and_Codex_rows_by_pinned_id()
    {
        var page = Page(SourceKind.Statuspage, AI2Fixtures.OpenAiComponents(codexCli: "major_outage"));
        var openai = Read("openai", page);
        var codex = Read("codex", page);
        Assert.Equal(Health.Operational, openai.Health, "the Login outage is in neither row");
        Assert.Equal(Health.MajorOutage, codex.Health);
        Assert.Equal("Codex CLI", codex.Components.Single(c => c.Health == Health.MajorOutage).Name);
        Assert.Equal(5, codex.Components.Count);
    }

    [Test]
    public void Google_feeds_count_only_open_incidents_for_the_product()
    {
        var json = "[" + AI2Fixtures.GoogleIncident("Gemini", "medium", null, "Example disruption of chats") + "," +
                   AI2Fixtures.GoogleIncident("Gemini", "high", "2026-10-16T10:00:00+00:00") + "," +
                   AI2Fixtures.GoogleIncident("Vertex Gemini API", "high", null) + "]";
        var page = Page(SourceKind.GoogleIncidents, json);
        var gemini = Read("gemini", page);
        Assert.Equal(Health.PartialOutage, gemini.Health, "the closed high-severity incident doesn't count");
        Assert.Equal("Example disruption of chats", gemini.Incident);
        Assert.Equal(Health.MajorOutage, Read("vertex", page).Health);
        Assert.Equal(Health.Operational, Read("gemini", Page(SourceKind.GoogleIncidents, "[]")).Health);
        // An end time in the future is still open.
        var future = Page(SourceKind.GoogleIncidents, "[" + AI2Fixtures.GoogleIncident("Gemini", "low", "2026-10-16T18:00:00+00:00") + "]");
        Assert.Equal(Health.Degraded, Read("gemini", future).Health);
    }

    [Test]
    public void Aws_feed_is_utf16_big_endian_and_bedrock_follows_the_users_regions()
    {
        var json = "[" + AI2Fixtures.AwsEvent("multipleservices-us-west-2", "2", "Example connectivity issue", ("bedrock-us-west-2", "2"), ("s3-us-west-2", "3")) + "," +
                   AI2Fixtures.AwsEvent("bedrock-eu-west-1", "3", "Example Bedrock errors") + "]";
        var page = Assert.NotNull(StatusParsers.Parse(SourceKind.AwsCurrentEvents, AI2Fixtures.AwsCurrentEvents(json), "application/json;charset=utf-16", Now));
        // Only us-east-1 watched: healthy. With the US cross-region set, us-west-2 counts.
        Assert.Equal(Health.Operational, Read("bedrock", page, "us-east-1").Health);
        var us = Read("bedrock", page, "us-east-1", "us-east-2", "us-west-2");
        Assert.Equal(Health.PartialOutage, us.Health);
        Assert.Equal("Example connectivity issue", us.Incident);
        Assert.Equal(Health.MajorOutage, Read("bedrock", page, "eu-west-1").Health);
        // Resolved ("0") entries are not shown.
        var resolved = Assert.NotNull(StatusParsers.Parse(SourceKind.AwsCurrentEvents,
            AI2Fixtures.AwsCurrentEvents("[" + AI2Fixtures.AwsEvent("multipleservices-us-east-1", "0", "Over", ("bedrock-us-east-1", "0")) + "]"), null, Now));
        Assert.Equal(Health.Operational, Read("bedrock", resolved, "us-east-1").Health);
    }

    [Test]
    public void Settings_regions_add_the_US_cross_region_set()
    {
        Assert.Equal("us-east-1,us-east-2,us-west-2", string.Join(",", new Ai2Settings { AwsRegion = "us-east-1" }.BedrockRegions));
        Assert.Equal("us-west-2,us-east-1,us-east-2", string.Join(",", new Ai2Settings { AwsRegion = "us-west-2" }.BedrockRegions));
        Assert.Equal("eu-west-1", string.Join(",", new Ai2Settings { AwsRegion = "eu-west-1" }.BedrockRegions));
        Assert.Equal("us-east-1", string.Join(",", new Ai2Settings { AwsRegion = "us-east-1", WatchUsCrossRegion = false }.BedrockRegions));
        Assert.True(Ai2Settings.IsRegion("ap-southeast-2"));
        Assert.False(Ai2Settings.IsRegion("us-east-1; rm -rf"));
        Assert.NotEqual("not a region", new Ai2Settings { AwsRegion = "not a region" }.Region);
        Assert.True(Ai2Settings.IsRegion(new Ai2Settings { AwsRegion = "not a region" }.Region), "falls back to a valid region");
        Assert.Null(new Ai2Settings { AwsProfile = "a profile with spaces" }.Profile);
        Assert.Equal("PrismReadOnly", new Ai2Settings { AwsProfile = " PrismReadOnly " }.Profile);
    }

    [Test]
    public void Broken_or_wrong_documents_return_null()
    {
        Assert.Null(StatusParsers.Parse(SourceKind.Statuspage, Encoding.UTF8.GetBytes("<html>maintenance</html>"), "text/html", Now));
        Assert.Null(StatusParsers.Parse(SourceKind.Statuspage, Encoding.UTF8.GetBytes("[]"), null, Now));
        Assert.Null(StatusParsers.Parse(SourceKind.GoogleIncidents, Encoding.UTF8.GetBytes("{}"), null, Now));
        Assert.Null(StatusParsers.Parse(SourceKind.AwsCurrentEvents, [], null, Now));
        Assert.Null(StatusParsers.Parse(SourceKind.Statuspage, Encoding.UTF8.GetBytes("{\"components\":[{\"id\":"), null, Now));
    }

    [Test]
    public void Incident_names_are_capped_and_cleaned_and_long_bodies_never_read()
    {
        var name = new string('x', 300) + "\\u0007";   // a JSON escape: the parser decodes it to BEL, then strips it
        var page = Page(SourceKind.Statuspage, AI2Fixtures.StatuspageSummaryWith("minor", [AI2Fixtures.Incident(name, "minor")], ("pjmpxvq2cmr2", "Copilot", "degraded_performance")));
        var inc = Assert.Single(page.Incidents);
        Assert.True(inc.Name.Length <= StatusParsers.MaxIncidentName);
        Assert.False(inc.Name.Any(char.IsControl));
        Assert.DoesNotContain("LONG BODY", string.Join("|", page.Incidents.Select(i => i.Name)));
    }

    [Test]
    public void Text_decoding_handles_boms_and_charsets()
    {
        Assert.Equal("[1]", HttpText.Decode(AI2Fixtures.AwsCurrentEvents("[1]")));
        Assert.Equal("[1]", HttpText.Decode([0xFF, 0xFE, .. Encoding.Unicode.GetBytes("[1]")]));
        Assert.Equal("[1]", HttpText.Decode(Encoding.BigEndianUnicode.GetBytes("[1]"), "application/json;charset=utf-16"));
        Assert.Equal("[1]", HttpText.Decode(Encoding.Unicode.GetBytes("[1]"), "application/json; charset=UTF-16"));
        Assert.Equal("[1]", HttpText.Decode([0xEF, 0xBB, 0xBF, .. Encoding.UTF8.GetBytes("[1]")]));
    }

    [Test]
    public void The_user_agent_names_the_widget()
    {
        Assert.Contains("PrismControl/", HttpClientFetcher.UserAgent);
        Assert.Contains("(status widget)", HttpClientFetcher.UserAgent);
    }
}

/// <summary>Poller etiquette (ai-status.md §3.1): demand-driven, floors, conditional GETs, jitter, backoff, Retry-After, staleness.</summary>
public class AI2PollerTests
{
    private static HealthService Service(Ai2Rig rig) => rig.S.Health;

    [Test]
    public async Task Nothing_is_fetched_before_any_demand()
    {
        var rig = new Ai2Rig();
        for (var i = 0; i < 20; i++)
        {
            rig.Time.Advance(TimeSpan.FromMinutes(5));
            await Service(rig).TickAsync(CancellationToken.None);
        }
        Assert.Empty(rig.Http.Requests);
        Assert.False(Service(rig).EverDemanded);
    }

    [Test]
    public async Task A_demand_fetches_at_once_and_then_every_cadence_with_validators()
    {
        var rig = new Ai2Rig();
        using var lease = Service(rig).Demand(["claude"]);
        Assert.Equal(1, rig.Http.Count("status.claude.com"));
        Assert.Null(rig.Http.Last("status.claude.com").ETag, "first fetch is unconditional");
        Assert.Equal(0, rig.Http.Count("www.githubstatus.com"), "only the demanded provider's source");

        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.NotModified("W/\"a1\"");
        rig.Time.Advance(TimeSpan.FromSeconds(119));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(1, rig.Http.Count("status.claude.com"), "jitter 0.5 → factor 1.0: due at 120 s");
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("status.claude.com"));
        Assert.Equal("W/\"a1\"", rig.Http.Last("status.claude.com").ETag, "If-None-Match from the last 200");

        // A 304 keeps the cached reading and counts as fresh.
        var v = Service(rig).Get("claude", rig.Time.GetUtcNow())!;
        Assert.Equal(Health.Operational, v.Health.Value);
        Assert.Equal(Confidence.Reported, v.Health.At(rig.Time.GetUtcNow()));
        Assert.Equal(rig.Time.GetUtcNow(), v.Health.ObservedAt);
    }

    [Test]
    public async Task Openai_and_codex_share_one_fetch()
    {
        var rig = new Ai2Rig();
        using var lease = Service(rig).Demand(["openai", "codex"]);
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(1, rig.Http.Count("status.openai.com"));
        Assert.True(Service(rig).Get("codex", rig.Time.GetUtcNow())!.Health.IsKnown);
    }

    [Test]
    public async Task Errors_back_off_exponentially_to_15_minutes_and_recover()
    {
        var rig = new Ai2Rig();
        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Status(503);
        using var lease = Service(rig).Demand(["claude"]);
        var gaps = new List<double>();
        var last = rig.Time.GetUtcNow();
        var count = 1;
        for (var minute = 0; minute < 90; minute++)
        {
            rig.Time.Advance(TimeSpan.FromSeconds(30));
            await Service(rig).TickAsync(CancellationToken.None);
            if (rig.Http.Count("status.claude.com") > count)
            {
                count = rig.Http.Count("status.claude.com");
                gaps.Add((rig.Time.GetUtcNow() - last).TotalMinutes);
                last = rig.Time.GetUtcNow();
            }
        }
        // 2 → 4 → 8 → 15 → 15 … minutes (cadence 2 min × 2^(n-1), capped).
        Assert.Equal("2,4,8,15,15", string.Join(",", gaps.Take(5).Select(g => Math.Round(g).ToString(System.Globalization.CultureInfo.InvariantCulture))));
        Assert.Equal(HealthFetchState.Errored, Service(rig).Get("claude", rig.Time.GetUtcNow())!.State);
        Assert.Equal(1, rig.Log.Lines.Count(l => l.Contains("status page anthropic", StringComparison.Ordinal)), "one log line per error streak");

        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Ok(AI2Fixtures.AnthropicSummary());
        rig.Time.Advance(TimeSpan.FromMinutes(16));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(HealthFetchState.Ok, Service(rig).Get("claude", rig.Time.GetUtcNow())!.State);
    }

    [Test]
    public async Task Retry_after_is_honored()
    {
        var rig = new Ai2Rig();
        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Status(429, TimeSpan.FromMinutes(7));
        using var lease = Service(rig).Demand(["claude"]);
        rig.Time.Advance(TimeSpan.FromMinutes(6.5));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(1, rig.Http.Count("status.claude.com"), "the 2-minute backoff is overridden by Retry-After 7 min");
        rig.Time.Advance(TimeSpan.FromMinutes(1));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("status.claude.com"));
    }

    [Test]
    public async Task Floors_hold_for_user_refreshes_and_aws_polls_at_most_every_5_minutes()
    {
        var rig = new Ai2Rig(settings: new Ai2Settings { HealthPollSeconds = 10 });   // clamped to 60
        using var lease = Service(rig).Demand(["claude", "bedrock"]);
        Assert.False(Service(rig).RequestRefresh("claude"), "just fetched");
        rig.Time.Advance(TimeSpan.FromSeconds(59));
        Assert.False(Service(rig).RequestRefresh("claude"));
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        Assert.True(Service(rig).RequestRefresh("claude"));
        Assert.Equal(2, rig.Http.Count("status.claude.com"));

        for (var i = 0; i < 7; i++)
        {
            rig.Time.Advance(TimeSpan.FromSeconds(30));
            await Service(rig).TickAsync(CancellationToken.None);
        }
        Assert.Equal(1, rig.Http.Count("health.aws.amazon.com"), "4.5 minutes later: still the first AWS fetch");
        rig.Time.Advance(TimeSpan.FromSeconds(30));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("health.aws.amazon.com"));
        Assert.True(rig.Http.Count("status.claude.com") >= 5, "claude at its 60 s floor meanwhile");
    }

    [Test]
    public async Task Jitter_stays_within_20_percent()
    {
        foreach (var (rnd, expectSeconds) in new[] { (0.0, 96.0), (1.0, 144.0) })
        {
            var rig = new Ai2Rig();
            var health = new HealthService(rig.Http, rig.Time, rig.Log, () => rig.Settings, () => rnd);
            using var lease = health.Demand(["github"]);
            var due = health.NextDueFor("github")!.Value;
            Assert.Near(expectSeconds, (due - rig.Time.GetUtcNow()).TotalSeconds, 0.5);
            await Task.CompletedTask;
        }
    }

    [Test]
    public async Task Readings_go_stale_after_their_ttl_and_background_polling_is_slow()
    {
        var rig = new Ai2Rig();
        var lease = Service(rig).Demand(["github"]);
        lease.Dispose();   // shown once, then hidden
        rig.Http.ByHost["www.githubstatus.com"] = _ => FakeHttp.Status(0);
        rig.Time.Advance(TimeSpan.FromMinutes(7));
        Assert.Equal(Confidence.Stale, Service(rig).Get("github", rig.Time.GetUtcNow())!.Health.At(rig.Time.GetUtcNow()), "TTL 6 min");
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(1, rig.Http.Count("www.githubstatus.com"), "background cadence is 10 minutes");
        rig.Time.Advance(TimeSpan.FromMinutes(3.5));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("www.githubstatus.com"));
        Assert.Equal(0, rig.Http.Count("status.claude.com"), "never-shown providers are never fetched");
    }

    [Test]
    public async Task Background_polling_can_be_switched_off()
    {
        var rig = new Ai2Rig(settings: new Ai2Settings { BackgroundHealth = false });
        Service(rig).Demand(["github"]).Dispose();
        for (var i = 0; i < 10; i++)
        {
            rig.Time.Advance(TimeSpan.FromMinutes(10));
            await Service(rig).TickAsync(CancellationToken.None);
        }
        Assert.Equal(1, rig.Http.Count("www.githubstatus.com"));
    }

    [Test]
    public async Task A_readout_touch_counts_as_demand_for_five_minutes()
    {
        var rig = new Ai2Rig(settings: new Ai2Settings { BackgroundHealth = false });
        Service(rig).Touch("cursor");
        Assert.Equal(1, rig.Http.Count("status.cursor.com"));
        rig.Time.Advance(TimeSpan.FromMinutes(2.1));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("status.cursor.com"));
        rig.Time.Advance(TimeSpan.FromMinutes(6));
        await Service(rig).TickAsync(CancellationToken.None);
        rig.Time.Advance(TimeSpan.FromMinutes(6));
        await Service(rig).TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("status.cursor.com"), "the touch window ran out");
    }

    [Test]
    public async Task An_unreadable_200_keeps_the_cache_and_counts_as_an_error()
    {
        var rig = new Ai2Rig();
        using var lease = Service(rig).Demand(["claude"]);
        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Ok("<html>oops</html>", contentType: "text/html");
        rig.Time.Advance(TimeSpan.FromMinutes(3));
        await Service(rig).TickAsync(CancellationToken.None);
        var v = Service(rig).Get("claude", rig.Time.GetUtcNow())!;
        Assert.Equal(HealthFetchState.Errored, v.State);
        Assert.Equal(Health.Operational, v.Health.Value, "the last good reading stays (it goes stale on its own)");
    }

    [Test]
    public void Statuses_publish_into_the_unified_model()
    {
        var sink = new RecordingSink();
        var rig = new Ai2Rig();
        var publisher = new StatusPublisher(rig.S, sink);
        using var lease = Service(rig).Demand(["claude", "codex"]);
        publisher.PublishServices();
        var claude = sink.Services.Single(s => s.Provider == "claude");
        Assert.Equal(FactSource.StatusPage, claude.Health.Source);
        Assert.Equal(Confidence.Reported, claude.Health.Confidence);
        Assert.Equal(4, claude.Components.Value!.Count);
        Assert.False(sink.Services.Single(s => s.Provider == "cursor").Health.IsKnown, "never fetched → unknown, not OK");
    }

    public sealed class RecordingSink : IAiStatusSink
    {
        public IReadOnlyList<ServiceStatus> Services = [];
        public IReadOnlyList<AppStatus> Apps = [];
        public void PublishApps(IReadOnlyList<AppStatus> apps) => Apps = apps;
        public void PublishServices(IReadOnlyList<ServiceStatus> services) => Services = services;
        public event Action<Sessions.CodexRateLimits>? CodexLimitsObserved;
        public void Raise(Sessions.CodexRateLimits l) => CodexLimitsObserved?.Invoke(l);
    }
}
