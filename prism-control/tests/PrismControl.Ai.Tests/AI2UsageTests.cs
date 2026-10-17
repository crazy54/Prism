using System.Text;
using PrismControl.Ai.Art;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Codex 5 h / weekly limits from fictional rollout lines (keys only; content never decoded).</summary>
public class AI2CodexTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
    private static long Unix(DateTimeOffset t) => t.ToUnixTimeSeconds();

    [Test]
    public void Newest_record_wins_per_window_and_windows_are_labeled_by_minutes()
    {
        var time = new ManualTimeProvider(Now);
        var codex = new CodexLimitsService("unused", time, new CapturingLog());
        codex.Observe(new CodexRateLimits("t1", [new(42, 300, Now.AddHours(2)), new(18, 10080, Now.AddDays(3))], Now.AddMinutes(-10)));
        codex.Observe(new CodexRateLimits("t2", [new(55, 300, Now.AddHours(2))], Now.AddMinutes(-5)));
        codex.Observe(new CodexRateLimits("t3", [new(10, 300, Now.AddHours(2))], Now.AddMinutes(-30)));   // older: ignored
        var w = codex.Windows(Now);
        Assert.Equal("5H,WEEK", string.Join(",", w.Select(x => x.Label)));
        Assert.Equal(55, w[0].UsedPercent.Value);
        Assert.Equal(18, w[1].UsedPercent.Value, "a newer record of another window doesn't erase this one");
        Assert.Equal(Confidence.Reported, w[0].UsedPercent.At(Now));
        Assert.Equal(FactSource.Rollout, w[0].UsedPercent.Source);
        Assert.Equal("RESETS 2H 0M", w[0].ResetText(Now));
        Assert.Equal(Now.AddMinutes(-5), codex.LastRecordAt);
    }

    [Test]
    public void After_the_reset_the_window_reads_as_an_inferred_zero()
    {
        var codex = new CodexLimitsService("unused", new ManualTimeProvider(Now), new CapturingLog());
        codex.Observe(new CodexRateLimits("t", [new(97, 300, Now.AddMinutes(30))], Now.AddHours(-4)));
        var before = codex.Window(300, Now)!;
        Assert.Equal(97, before.UsedPercent.Value);
        Assert.False(before.ResetPassed);
        var after = codex.Window(300, Now.AddMinutes(31))!;
        Assert.True(after.ResetPassed);
        Assert.Equal(0, after.UsedPercent.Value);
        Assert.Equal(Confidence.Inferred, after.UsedPercent.At(Now.AddMinutes(31)), "drawn hollow with ~");
        Assert.Equal("RESET", after.ResetText(Now.AddMinutes(31)));
    }

    [Test]
    public void Labels_and_countdowns()
    {
        Assert.Equal("5H", CodexLimitsService.Label(300));
        Assert.Equal("WEEK", CodexLimitsService.Label(10080));
        Assert.Equal("2H", CodexLimitsService.Label(120));
        Assert.Equal("1D", CodexLimitsService.Label(1440));
        Assert.Equal("45M", CodexLimitsService.Label(45));
        Assert.Equal("2H 14M", CodexLimitsService.Countdown(TimeSpan.FromMinutes(134)));
        Assert.Equal("3D 4H", CodexLimitsService.Countdown(TimeSpan.FromHours(76)));
        Assert.Equal("<1M", CodexLimitsService.Countdown(TimeSpan.FromSeconds(20)));
        Assert.Equal("NOW", CodexLimitsService.Countdown(TimeSpan.FromSeconds(-5)));
    }

    [Test]
    public async Task Seeding_reads_the_newest_files_tail_and_never_the_content()
    {
        var root = TempDirs.New("codex-seed");
        try
        {
            var time = new ManualTimeProvider(Now);
            var today = Now.ToLocalTime().Date;
            var old = AI2Fixtures.WriteRollout(root, today.AddDays(-1), "0199aa11-2222-7333-8444-000000000001",
                AI2Fixtures.RolloutLines(10, 5, Unix(Now.AddHours(1)), Unix(Now.AddDays(2)), "2026-10-15T11:00:00.000Z"), DateTime.UtcNow.AddHours(-20));
            var newest = AI2Fixtures.WriteRollout(root, today, "0199aa11-2222-7333-8444-000000000002",
                AI2Fixtures.RolloutLines(42, 18, Unix(Now.AddHours(2).AddMinutes(14)), Unix(Now.AddDays(3)), "2026-10-16T11:00:00.000Z"), DateTime.UtcNow);
            // Outside the 8-day window: never even listed.
            AI2Fixtures.WriteRollout(root, today.AddDays(-20), "0199aa11-2222-7333-8444-000000000003",
                AI2Fixtures.RolloutLines(99, 99, Unix(Now.AddHours(1)), Unix(Now.AddDays(1)), "2026-10-16T11:30:00.000Z"));
            var log = new CapturingLog();
            var codex = new CodexLimitsService(root, time, log);
            Assert.True(await codex.SeedAsync(CancellationToken.None));
            var w = codex.Windows(Now);
            Assert.Equal(42, w.Single(x => x.WindowMinutes == 300).UsedPercent.Value);
            Assert.Equal(18, w.Single(x => x.WindowMinutes == 10080).UsedPercent.Value);
            Assert.Equal("RESETS 2H 14M", w[0].ResetText(Now));
            Assert.DoesNotContain(AI2Fixtures.SecretPrompt, log.All);
            Assert.DoesNotContain(AI2Fixtures.SecretPrompt, string.Join("|", w));
            Assert.True(File.Exists(old) && File.Exists(newest));
        }
        finally { TempDirs.Delete(root); }
    }

    [Test]
    public void Content_lines_are_skipped_undecoded_and_a_cut_first_line_is_a_fragment()
    {
        // AI1's reader stops at the type of a response_item line: nothing is materialized.
        var content = Encoding.UTF8.GetBytes(AI2Fixtures.RolloutLines(1, 1, 0, 0)[1]);
        var (ev, limits) = RolloutLineReader.TryRead(content, "t", Now);
        Assert.Null(ev);
        Assert.Null(limits);

        var root = TempDirs.New("codex-fragment");
        try
        {
            var today = Now.ToLocalTime().Date;
            var big = "{\"timestamp\":\"2026-10-16T10:00:00.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"content\":\"" + new string('a', 300_000) + "\"}}";
            var lines = new List<string> { AI2Fixtures.RolloutLines(77, 7, Unix(Now.AddHours(1)), Unix(Now.AddDays(1)))[3], big, AI2Fixtures.RolloutLines(33, 3, Unix(Now.AddHours(1)), Unix(Now.AddDays(1)))[3] };
            var path = AI2Fixtures.WriteRollout(root, today, "0199aa11-2222-7333-8444-000000000004", lines);
            var hit = CodexLimitsService.LastLimitsIn(path, "t", Now);
            Assert.Equal(33, Assert.NotNull(hit).Windows.Single(x => x.WindowMinutes == 300).UsedPercent, "the newest line in the tail");

            var only = AI2Fixtures.WriteRollout(root, today, "0199aa11-2222-7333-8444-000000000005",
                [AI2Fixtures.RolloutLines(77, 7, Unix(Now.AddHours(1)), Unix(Now.AddDays(1)))[3] + new string(' ', 10) , big]);
            Assert.Null(CodexLimitsService.LastLimitsIn(only, "t", Now), "limits only before the 256 KB window: not read");
        }
        finally { TempDirs.Delete(root); }
    }

    [Test]
    public void Legacy_resets_in_seconds_is_accepted()
    {
        var line = "{\"timestamp\":\"2026-10-16T11:00:00.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"rate_limits\":{\"primary\":{\"used_percent\":12.5,\"window_minutes\":300,\"resets_in_seconds\":3600}}}}";
        var (_, limits) = RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(line), "t", Now);
        var w = Assert.Single(Assert.NotNull(limits).Windows);
        Assert.Equal(new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero), w.ResetsAt);
        Assert.Equal(12.5, w.UsedPercent);
    }

    [Test]
    public void The_live_tail_feeds_the_service_and_the_first_demand_seeds_once()
    {
        var sink = new AI2PollerTests.RecordingSink();
        var codex = new CodexLimitsService(Path.Combine(TempDirs.Root, "absent"), new ManualTimeProvider(Now), new CapturingLog(), sink);
        var runs = 0;
        codex.Runner = w => { runs++; return w(); };
        sink.Raise(new CodexRateLimits("t", [new(64, 300, Now.AddHours(1))], Now));
        Assert.Equal(64, codex.Window(300, Now)!.UsedPercent.Value);
        using (codex.Demand()) { }
        Assert.Equal(1, runs);
        // A missing sessions folder seeds "nothing", then no reseed on later demands.
        using (codex.Demand()) { }
        Assert.True(runs <= 2);
    }
}

/// <summary>Bedrock usage: opt-in gating, the exact read-only command, the 5-minute floor, sign-in states (fake CLI only).</summary>
public class AI2BedrockTests
{
    private static Ai2Rig Rig(bool enabled, string profile = "", bool safe = false) =>
        new(safeMode: safe, settings: new Ai2Settings { BedrockUsageEnabled = enabled, AwsProfile = profile, AwsRegion = "us-east-2" });

    [Test]
    public async Task Off_by_default_nothing_runs()
    {
        var rig = new Ai2Rig();
        using var lease = rig.S.Bedrock.Demand();
        for (var i = 0; i < 12; i++)
        {
            rig.Time.Advance(TimeSpan.FromMinutes(5));
            await rig.S.Bedrock.TickAsync(CancellationToken.None);
        }
        Assert.Empty(rig.Aws.Calls);
        Assert.Equal(BedrockState.Off, rig.S.Bedrock.Snapshot().State);
        Assert.False(new Ai2Settings().BedrockUsageEnabled, "the default is OFF");
    }

    [Test]
    public async Task Enabled_without_a_profile_does_nothing()
    {
        var rig = Rig(enabled: true);
        using var lease = rig.S.Bedrock.Demand();
        await rig.S.Bedrock.TickAsync(CancellationToken.None);
        Assert.Empty(rig.Aws.Calls);
        Assert.Equal(BedrockState.NeedsProfile, rig.S.Bedrock.Snapshot().State);
    }

    [Test]
    public async Task Opted_in_it_runs_exactly_the_read_only_command_at_most_every_5_minutes()
    {
        var rig = Rig(enabled: true, profile: "PrismReadOnly");
        using var lease = rig.S.Bedrock.Demand();
        var args = Assert.Single(rig.Aws.Calls);
        Assert.Equal("cloudwatch get-metric-data", $"{args[0]} {args[1]}");
        var joined = string.Join(" ", args);
        Assert.Contains("--profile PrismReadOnly", joined);
        Assert.Contains("--region us-east-2", joined);
        Assert.Contains("--output json", joined);
        Assert.Contains("--no-cli-pager", joined);
        foreach (var m in BedrockUsageService.Metrics) Assert.Contains($"\"MetricName\":\"{m}\"", joined);
        Assert.Contains("\"Namespace\":\"AWS/Bedrock\"", joined);
        foreach (var forbidden in new[] { "sso", "login", "configure", "credentials", "export", "sts" })
            Assert.False(args.Any(a => a.Equals(forbidden, StringComparison.OrdinalIgnoreCase)), forbidden);

        for (var i = 0; i < 9; i++)
        {
            rig.Time.Advance(TimeSpan.FromSeconds(30));
            await rig.S.Bedrock.TickAsync(CancellationToken.None);
        }
        Assert.Single(rig.Aws.Calls);
        Assert.False(rig.S.Bedrock.RequestRefresh(), "a push within 5 minutes is refused");
        rig.Time.Advance(TimeSpan.FromSeconds(31));
        await rig.S.Bedrock.TickAsync(CancellationToken.None);
        Assert.Equal(2, rig.Aws.Calls.Count);

        var snap = rig.S.Bedrock.Snapshot();
        Assert.Equal(BedrockState.Ok, snap.State);
        Assert.Equal(FactSource.CloudWatch, snap.Series.Source);
        Assert.Equal(12_400, snap.Series.Value!.LatestInput);
        Assert.DoesNotContain("PrismReadOnly", rig.Log.All);
    }

    [Test]
    public async Task Nothing_runs_while_nothing_shows_it()
    {
        var rig = Rig(enabled: true, profile: "PrismReadOnly");
        for (var i = 0; i < 6; i++)
        {
            rig.Time.Advance(TimeSpan.FromMinutes(6));
            await rig.S.Bedrock.TickAsync(CancellationToken.None);
        }
        Assert.Empty(rig.Aws.Calls);
    }

    [Test]
    public void An_expired_sso_session_says_sign_in_and_never_prompts()
    {
        var rig = Rig(enabled: true, profile: "PrismReadOnly");
        rig.Aws.Respond = _ => new AwsCliResult(true, 255, "", AwsCliProblem.SignInNeeded, false);
        using var lease = rig.S.Bedrock.Demand();
        Assert.Equal(BedrockState.SignInNeeded, rig.S.Bedrock.Snapshot().State);
        using var text = AiText.Record();
        UsageArt.BedrockDial(Refraction.Night, rig.S.Bedrock.Snapshot(), 0, rig.Time.GetUtcNow());
        UsageArt.BedrockKey(Refraction.Night, rig.S.Bedrock.Snapshot(), rig.Time.GetUtcNow());
        Assert.True(text.Has("SIGN IN WITH"), text.All);
        Assert.True(text.Has("AWS SSO LOGIN"), text.All);
        Assert.Single(rig.Aws.Calls);
        Assert.False(rig.Aws.Calls.SelectMany(a => a).Any(a => a.Contains("sso", StringComparison.OrdinalIgnoreCase)));
    }

    [Test]
    public void Cli_errors_are_classified_from_the_text_which_is_then_dropped()
    {
        Assert.Equal(AwsCliProblem.SignInNeeded, AwsCliRunner.Classify("Error when retrieving token from sso: Token has expired and refresh failed", 255));
        Assert.Equal(AwsCliProblem.SignInNeeded, AwsCliRunner.Classify("The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws sso login", 255));
        Assert.Equal(AwsCliProblem.SignInNeeded, AwsCliRunner.Classify("Unable to locate credentials. You can configure credentials by running \"aws configure\".", 253));
        Assert.Equal(AwsCliProblem.ProfileNotFound, AwsCliRunner.Classify("The config profile (example-profile) could not be found", 255));
        Assert.Equal(AwsCliProblem.AccessDenied, AwsCliRunner.Classify("An error occurred (AccessDenied) when calling the GetMetricData operation: User: arn:aws:sts::000000000000:assumed-role/x is not authorized to perform: cloudwatch:GetMetricData", 254));
        Assert.Equal(AwsCliProblem.Throttled, AwsCliRunner.Classify("An error occurred (Throttling) when calling the GetMetricData operation: Rate exceeded", 254));
        Assert.Equal(AwsCliProblem.Other, AwsCliRunner.Classify("something else", 1));
    }

    [Test]
    public void No_cli_and_safe_mode_never_start_anything()
    {
        var noCli = Rig(enabled: true, profile: "PrismReadOnly");
        noCli.Aws.Installed = false;
        using (noCli.S.Bedrock.Demand()) { }
        Assert.Empty(noCli.Aws.Calls);
        Assert.Equal(BedrockState.NoCli, noCli.S.Bedrock.Snapshot().State);

        var safe = Rig(enabled: true, profile: "PrismReadOnly", safe: true);
        using (safe.S.Bedrock.Demand()) { }
        safe.S.Bedrock.RequestRefresh();
        Assert.Empty(safe.Aws.Calls);
        Assert.Equal(BedrockState.SafeMode, safe.S.Bedrock.Snapshot().State);
    }

    [Test]
    public void A_new_profile_or_region_starts_over()
    {
        var rig = Rig(enabled: true, profile: "PrismReadOnly");
        using var lease = rig.S.Bedrock.Demand();
        Assert.Single(rig.Aws.Calls);
        rig.Configure(s => s.AwsRegion = "us-west-2");
        Assert.False(rig.S.Bedrock.Snapshot().Series.IsKnown, "old numbers belonged to another region");
        Assert.True(rig.S.Bedrock.RequestRefresh());
        Assert.Equal(2, rig.Aws.Calls.Count);
        Assert.Contains("--region us-west-2", string.Join(" ", rig.Aws.Calls[1]));
    }

    [Test]
    public void Metric_data_parses_and_garbage_is_refused()
    {
        var s = Assert.NotNull(BedrockUsageService.Parse(AI2Fixtures.MetricData(throttles: 3)));
        Assert.Equal(5, s.InputTokens.Count);
        Assert.True(s.InputTokens.Zip(s.InputTokens.Skip(1)).All(p => p.First.At < p.Second.At), "sorted by time");
        Assert.Equal(3, s.ThrottleSum);
        Assert.Null(BedrockUsageService.Parse("not json"));
        Assert.Null(BedrockUsageService.Parse("{\"x\":1}"));
    }

    [Test]
    public void The_explanation_names_the_command_cadence_cost_scope_and_sign_in()
    {
        var text = BedrockUsageService.Explain(new Ai2Settings { AwsProfile = "PrismReadOnly", AwsRegion = "us-east-1" });
        foreach (var part in new[] { "aws cloudwatch get-metric-data", "--profile PrismReadOnly", "--region us-east-1", "every 5 minutes", "only while", "cloudwatch:GetMetricData", "$0.01", "account- and region-wide", "never reads or stores AWS credentials", "aws sso login" })
            Assert.Contains(part, text);
    }
}

/// <summary>Anthropic / OpenAI admin usage: opt-in, keys in the vault (DPAPI in production), never logged, header-only.</summary>
public class AI2AdminTests
{
    public const string AnthropicKey = "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLEEXAMPLE-abcd";
    public const string OpenAiKey = "sk-admin-EXAMPLEEXAMPLEEXAMPLEEXAMPLE-wxyz";

    private static Ai2Rig Rig(bool anthropic = false, bool openai = false, bool safe = false)
    {
        var rig = new Ai2Rig(safeMode: safe, settings: new Ai2Settings { AnthropicAdminEnabled = anthropic, OpenAiAdminEnabled = openai });
        rig.Http.ByHost["api.anthropic.com"] = r => FakeHttp.Ok(r.Url.AbsolutePath.Contains("cost_report") ? AI2Fixtures.AnthropicCost : AI2Fixtures.AnthropicUsage);
        rig.Http.ByHost["api.openai.com"] = r => FakeHttp.Ok(r.Url.AbsolutePath.Contains("costs") ? AI2Fixtures.OpenAiCost : AI2Fixtures.OpenAiUsage);
        return rig;
    }

    [Test]
    public void Only_admin_keys_are_accepted_and_only_the_last_4_are_shown()
    {
        var rig = Rig();
        Assert.Null(rig.S.Admin.SaveKey(AdminProvider.Anthropic, "sk-ant-api03-EXAMPLEEXAMPLEEXAMPLE"), "a normal API key is refused");
        Assert.Null(rig.S.Admin.SaveKey(AdminProvider.Anthropic, "not a key at all"));
        Assert.Null(rig.S.Admin.SaveKey(AdminProvider.OpenAi, AnthropicKey), "wrong provider");
        Assert.Equal("••••abcd", rig.S.Admin.SaveKey(AdminProvider.Anthropic, "  " + AnthropicKey + "\r\n"));
        Assert.Equal(AnthropicKey, rig.Vault.Items["anthropic-admin"]);
        Assert.Equal("••••abcd", rig.S.Admin.KeyHint(AdminProvider.Anthropic));
        Assert.DoesNotContain(AnthropicKey, rig.Log.All);
        Assert.DoesNotContain("EXAMPLEEXAMPLE", rig.Log.All);
        rig.S.Admin.ForgetKey(AdminProvider.Anthropic);
        Assert.False(rig.Vault.Items.ContainsKey("anthropic-admin"));
    }

    [Test]
    public void Off_by_default_no_api_call_even_with_a_key()
    {
        var rig = Rig();
        rig.S.Admin.SaveKey(AdminProvider.Anthropic, AnthropicKey);
        using var lease = rig.S.Admin.Demand(AdminProvider.Anthropic);
        Assert.Equal(0, rig.Http.Count("api.anthropic.com"));
        Assert.Equal(AdminState.Off, rig.S.Admin.Snapshot(AdminProvider.Anthropic).State);
    }

    [Test]
    public void Anthropic_cost_is_cents_to_dollars_with_the_key_only_in_a_header()
    {
        var rig = Rig(anthropic: true);
        rig.S.Admin.SaveKey(AdminProvider.Anthropic, AnthropicKey);
        using var lease = rig.S.Admin.Demand(AdminProvider.Anthropic);
        Assert.Equal(2, rig.Http.Count("api.anthropic.com"));
        foreach (var r in rig.Http.Requests.Where(r => r.Url.Host == "api.anthropic.com"))
        {
            Assert.Equal(AnthropicKey, r.Headers!["x-api-key"]);
            Assert.Equal("2023-06-01", r.Headers["anthropic-version"]);
            Assert.DoesNotContain(AnthropicKey, r.Url.ToString());
            Assert.Equal("https", r.Url.Scheme);
        }
        var snap = rig.S.Admin.Snapshot(AdminProvider.Anthropic);
        Assert.Equal(AdminState.Ok, snap.State);
        Assert.Equal(3.42m, snap.MonthCost.Value!.Amount);
        Assert.Equal("$3.42", Ai2Palette.Money(snap.MonthCost.Value));
        Assert.Equal(2000, snap.Tokens24h.Value);
        Assert.Equal(FactSource.AdminApi, snap.MonthCost.Source);
        Assert.Contains("not real-time", snap.MonthCost.Value.Scope);
        Assert.DoesNotContain(AnthropicKey, rig.Log.All);
    }

    [Test]
    public void OpenAi_uses_a_bearer_header_and_dollars()
    {
        var rig = Rig(openai: true);
        rig.S.Admin.SaveKey(AdminProvider.OpenAi, OpenAiKey);
        using var lease = rig.S.Admin.Demand(AdminProvider.OpenAi);
        var r = rig.Http.Last("api.openai.com");
        Assert.Equal("Bearer " + OpenAiKey, r.Headers!["Authorization"]);
        var snap = rig.S.Admin.Snapshot(AdminProvider.OpenAi);
        Assert.Equal(1.75m, snap.MonthCost.Value!.Amount);
        Assert.Equal(2300, snap.Tokens24h.Value);
    }

    [Test]
    public async Task A_refused_key_says_so_and_refreshes_respect_the_floor_and_cadence()
    {
        var rig = Rig(anthropic: true);
        rig.S.Admin.SaveKey(AdminProvider.Anthropic, AnthropicKey);
        rig.Http.ByHost["api.anthropic.com"] = _ => FakeHttp.Status(401);
        using var lease = rig.S.Admin.Demand(AdminProvider.Anthropic);
        Assert.Equal(AdminState.Unauthorized, rig.S.Admin.Snapshot(AdminProvider.Anthropic).State);
        Assert.False(rig.S.Admin.RequestRefresh(AdminProvider.Anthropic));
        rig.Time.Advance(TimeSpan.FromMinutes(14));
        await rig.S.Admin.TickAsync(AdminProvider.Anthropic, CancellationToken.None);
        Assert.Equal(2, rig.Http.Count("api.anthropic.com"), "still the first pair: cadence 15 min");
        rig.Time.Advance(TimeSpan.FromMinutes(1.1));
        await rig.S.Admin.TickAsync(AdminProvider.Anthropic, CancellationToken.None);
        Assert.Equal(4, rig.Http.Count("api.anthropic.com"));
    }

    [Test]
    public void Safe_mode_saves_no_key_and_calls_no_api()
    {
        var rig = Rig(anthropic: true, safe: true);
        Assert.Null(rig.S.Admin.SaveKey(AdminProvider.Anthropic, AnthropicKey));
        rig.Vault.Items["anthropic-admin"] = AnthropicKey;
        using var lease = rig.S.Admin.Demand(AdminProvider.Anthropic);
        Assert.Equal(0, rig.Http.Count("api.anthropic.com"));
        Assert.Equal(AdminState.SafeMode, rig.S.Admin.Snapshot(AdminProvider.Anthropic).State);
    }

    [Test]
    public void Parsers_refuse_other_shapes()
    {
        Assert.Null(AdminUsageService.ParseAnthropicCost(Encoding.UTF8.GetBytes("{\"error\":{}}")));
        Assert.Null(AdminUsageService.ParseOpenAiTokens(Encoding.UTF8.GetBytes("nope")));
        Assert.Equal(0m, AdminUsageService.ParseOpenAiCost(Encoding.UTF8.GetBytes("{\"data\":[]}"))!.Amount);
    }
}
