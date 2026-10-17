using PrismControl.Ai.Actions;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Apps.Actions;
using PrismControl.Ai.Art;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.Actions;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Every AI2 action on the Galleon and the Stream Deck + (keys also on Standard and Mini), every frame linted.</summary>
public class AI2ActionTests
{
    private static readonly DeviceInfo[] DialDevices = [TestDevices.Galleon, TestDevices.Plus];
    private static readonly DeviceInfo[] KeyDevices = [TestDevices.Galleon, TestDevices.Plus, TestDevices.StreamDeck, TestDevices.Mini];

    private static string SourceDir()
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                var candidate = Path.Combine(dir.FullName, "src", "PrismControl.Ai");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
        }
        return Path.Combine("E:", "Development Workspaces", "Prism-control", "prism-control", "src", "PrismControl.Ai");
    }

    [Test]
    public void AI2_actions_pass_discovery_and_are_exactly_the_seven()
    {
        var scan = ActionValidator.Scan(typeof(AiModule).Assembly);
        Assert.Empty(scan.Errors);
        var ai1 = new[] { AiIds.Approve, AiIds.Deny, AiIds.Fleet, AiIds.Next, AiIds.Privacy, AiIds.Request, AiIds.Session };
        var mine = scan.Actions.Select(a => a.Uuid).Except(ai1).OrderBy(x => x).ToList();
        Assert.Equal(string.Join(",", Ai2Ids.All.OrderBy(x => x)), string.Join(",", mine));
        Assert.Equal(mine.Count, mine.Distinct().Count());
        Assert.False(((StreamDeckActionAttribute)typeof(DictateAction).GetCustomAttributes(typeof(StreamDeckActionAttribute), false).Single()).SupportedInMultiActions,
            "a held Ctrl+I must not be chained");
    }

    [Test]
    public void Every_AI2_action_has_its_icon_and_key_image()
    {
        var imgs = Path.Combine(SourceDir(), "plugin", "imgs", "actions", "ai");
        foreach (var id in Ai2Ids.Short)
            foreach (var f in new[] { "icon.svg", "key.svg" })
            {
                var file = Path.Combine(imgs, id, f);
                Assert.True(File.Exists(file), file);
                var errors = SvgLint.Check(File.ReadAllText(file), f == "key.svg" ? SvgCanvas.Key : SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).ToList();
                Assert.Empty(errors.Select(e => $"{id}/{f}: {e}"));
            }
    }

    [Test]
    public async Task Health_key_on_every_deck_shows_word_component_and_opens_the_page()
    {
        foreach (var device in KeyDevices)
        {
            var rig = new Ai2Rig();
            rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Ok(AI2Fixtures.AnthropicSummary("degraded_performance"));
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<HealthKeyAction>(device, new(0, 0), settings: new HealthKeySettings { Provider = "claude" });
            Assert.True(text.Has("CLAUDE") && text.Has("DEGRADED") && text.Has("Claude Code"), text.All);
            Assert.Equal(UpdatePriority.Background, h.CallsOf("setImage").Last().Priority);
            await h.PressAsync();
            Assert.Equal("https://status.claude.com", rig.Opened.Single());
            Assert.True(text.Has("OPENED"), text.All);
            text.Clear();
            await h.PressAsync(TimeSpan.FromMilliseconds(600));   // hold: details
            Assert.True(text.Has("Console") && text.Has("claude.ai"), text.All);
            await h.AdvanceAsync(TimeSpan.FromMinutes(7));          // no fetch (no scheduler in tests): stale
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Health_key_goes_stale_with_a_badge_and_unknown_is_a_dash()
    {
        var rig = new Ai2Rig();
        rig.Http.ByHost["status.cursor.com"] = _ => FakeHttp.Status(0);
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<HealthKeyAction>(TestDevices.Galleon, new(0, 0), settings: new HealthKeySettings { Provider = "cursor" });
        Assert.True(text.Has("—") && text.Has("NO DATA"), "never a fake OK: " + text.All);
        var fresh = new Ai2Rig();
        await using var g = await fresh.AppearAsync<HealthKeyAction>(TestDevices.Galleon, new(0, 0), settings: new HealthKeySettings { Provider = "github" });
        var before = g.LastSvg!;
        await g.AdvanceAsync(TimeSpan.FromMinutes(7));
        Assert.NotEqual(before, g.LastSvg!, "stale frame differs (40 % ink + clock badge)");
        Assert.Contains("opacity=\"0.4\"", g.LastSvg!);
        g.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Health_strip_turns_wrap_push_opens_and_plus_taps_open_cells()
    {
        foreach (var device in DialDevices)
        {
            var rig = new Ai2Rig();
            await using var h = await rig.AppearAsync<HealthStripAction>(device, new(0, 0), Controller.Encoder);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            Assert.True(rig.Http.Requests.Count >= 7, "all sources demanded at once");
            await h.RotateAsync(device.IsGalleon ? 12 : 1);   // Galleon: 12 ticks wrap 8 providers → index 4
            await h.DialPressAsync();
            Assert.Equal(device.IsGalleon ? "https://status.cursor.com" : "https://status.openai.com", rig.Opened.Last());
            await h.RotateAsync(-13);   // a big spin wraps: Galleon 4 → 7, Plus 1 → 4
            await h.DialPressAsync();
            Assert.Equal(device.IsGalleon ? "https://status.cloud.google.com" : "https://status.cursor.com", rig.Opened.Last());
            if (!device.IsGalleon)
            {
                await h.TapAsync(150, 80);   // the 2×2 window now shows 4–7; bottom-right = index 7 (Vertex)
                Assert.Equal("https://status.cloud.google.com", rig.Opened.Last());
            }
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Usage_dial_codex_turns_switch_window_push_reloads_and_keys_toggle()
    {
        foreach (var device in DialDevices)
        {
            var rig = new Ai2Rig();
            rig.S.Codex.Observe(new CodexRateLimits("t", [new(42, 300, rig.Time.GetUtcNow().AddHours(2)), new(18, 10080, rig.Time.GetUtcNow().AddDays(3))], rig.Time.GetUtcNow()));
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<UsageAction>(device, new(1, 0), Controller.Encoder, new UsageSettings { Provider = "codex" });
            Assert.True(text.Has("42%") && text.Has("RESETS 2H 0M"), text.All);
            await h.RotateAsync(12);
            Assert.Equal(10080, h.LastSettingsAs<UsageSettings>().Window);
            Assert.True(text.Has("18%") && text.Has("CODEX · WEEKLY"), text.All);
            await h.DialPressAsync();
            await h.AdvanceAsync(TimeSpan.FromSeconds(1));
            h.AssertFramesAreDeckSafe();
        }
        var keyRig = new Ai2Rig();
        keyRig.S.Codex.Observe(new CodexRateLimits("t", [new(91, 300, keyRig.Time.GetUtcNow().AddMinutes(20))], keyRig.Time.GetUtcNow()));
        await using var k = await keyRig.AppearAsync<UsageAction>(TestDevices.StreamDeck, new(0, 0), settings: new UsageSettings { Provider = "codex" });
        await k.PressAsync();
        Assert.Equal(10080, k.LastSettingsAs<UsageSettings>().Window);
        k.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Usage_dial_bedrock_is_off_until_the_PI_turns_it_on()
    {
        var rig = new Ai2Rig();
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<UsageAction>(TestDevices.Galleon, new(0, 1), Controller.Encoder, new UsageSettings { Provider = "bedrock" });
        Assert.True(text.Has("BEDROCK USAGE IS OFF"), text.All);
        await h.DialPressAsync();
        Assert.Empty(rig.Aws.Calls);

        var r = await h.PiMessageAsync("bedrock.enable");
        Assert.Contains("profile name first", PiReply.Message(r));
        Assert.False(rig.Settings.BedrockUsageEnabled);

        rig.Configure(s => s.AwsProfile = "PrismReadOnly");
        r = await h.PiMessageAsync("bedrock.enable");
        Assert.True(rig.Settings.BedrockUsageEnabled);
        Assert.Contains("aws cloudwatch get-metric-data", PiReply.Message(r));
        await h.DialPressAsync();
        Assert.Single(rig.Aws.Calls);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(2, h.LastSettingsAs<UsageSettings>().View);
        await h.PiMessageAsync("bedrock.disable");
        Assert.False(rig.Settings.BedrockUsageEnabled);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Usage_admin_key_is_pasted_from_the_clipboard_and_never_shown_or_logged()
    {
        var rig = new Ai2Rig();
        rig.Http.ByHost["api.anthropic.com"] = q => FakeHttp.Ok(q.Url.AbsolutePath.Contains("cost_report") ? AI2Fixtures.AnthropicCost : AI2Fixtures.AnthropicUsage);
        await using var h = await rig.AppearAsync<UsageAction>(TestDevices.Plus, new(2, 0), Controller.Encoder, new UsageSettings { Provider = "anthropic" });
        rig.Clipboard.Text = "not a key";
        var r = await h.PiMessageAsync("admin.anthropic.saveKey");
        Assert.Contains("doesn't hold", PiReply.Message(r));
        rig.Clipboard.Text = AI2AdminTests.AnthropicKey;
        r = await h.PiMessageAsync("admin.anthropic.saveKey");
        Assert.Contains("Saved ••••abcd", PiReply.Message(r));
        Assert.DoesNotContain("EXAMPLEEXAMPLE", r?.ToJsonString());
        await h.PiMessageAsync("admin.anthropic.enable");
        Assert.True(rig.Settings.AnthropicAdminEnabled);
        using var text = AiText.Record();
        await h.DialPressAsync();
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.True(text.Has("$3.42") && text.Has("NOT REAL-TIME"), text.All);
        Assert.DoesNotContain(AI2AdminTests.AnthropicKey, rig.Log.All);
        Assert.False(h.Calls.Any(c => c.Payload?.ToJsonString().Contains("EXAMPLEEXAMPLE", StringComparison.Ordinal) == true), "never in any frame, settings or PI message");
        await h.PiMessageAsync("admin.anthropic.forget");
        Assert.False(rig.Settings.AnthropicAdminEnabled);
        Assert.Empty(rig.Vault.Items);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Ops_widget_selects_with_turns_opens_with_push_and_plus_taps_pills()
    {
        foreach (var device in DialDevices)
        {
            var rig = new Ai2Rig();
            rig.S.Codex.Observe(new CodexRateLimits("t", [new(42, 300, rig.Time.GetUtcNow().AddHours(2)), new(18, 10080, rig.Time.GetUtcNow().AddDays(3))], rig.Time.GetUtcNow()));
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<OpsAction>(device, new(1, 1), Controller.Encoder);
            Assert.True(text.Has("AI OPS") && text.Has("ALL OK") && text.Has("CODEX 5H"), text.All);
            await h.RotateAsync(device.IsGalleon ? 12 : 3);
            await h.DialPressAsync();
            Assert.Equal(device.IsGalleon ? "https://status.cursor.com" : "https://www.githubstatus.com", rig.Opened.Last());
            if (!device.IsGalleon)
            {
                await h.TapAsync(8 + 23 * 5 + 10, 30);   // the 6th pill: Bedrock
                Assert.Equal("https://health.aws.amazon.com/health/status", rig.Opened.Last());
            }
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task App_key_shows_running_front_and_voice_and_launches_or_focuses()
    {
        foreach (var device in KeyDevices)
        {
            var rig = new Ai2Rig();
            rig.TypicalProcesses();
            rig.Voice.Pids = [2002];
            rig.Windows.Add(0x7801, 2001, "claude.exe", @"C:\Program Files\WindowsApps\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\app\claude.exe");
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<AppKeyAction>(device, new(0, 0), settings: new AppKeySettings { App = "claude-desktop" });
            Assert.True(text.Has("RUNNING") && text.Has("~MIC LIVE"), text.All);
            await h.PressAsync();
            Assert.Equal((nint)0x7801, rig.Foreground.Raised.Last());
            Assert.True(text.Has("FOCUSED"), text.All);
            await h.PressAsync(TimeSpan.FromMilliseconds(600));
            Assert.Equal("claude://claude.ai/new", rig.Opened.Last());
            await h.AdvanceAsync(TimeSpan.FromSeconds(3));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Ask_key_and_dial_prefill_and_never_draw_the_selection()
    {
        var rig = new Ai2Rig { Selection = "a confidential example selection" };
        using var text = AiText.Record();
        await using var k = await rig.AppearAsync<AskAction>(TestDevices.Galleon, new(0, 3), settings: new AskSettings { Target = "chatgpt", Template = "Explain: {selection}" });
        await k.PressAsync();
        Assert.Equal("Explain: a confidential example selection", Uri.UnescapeDataString(rig.Opened.Single()["codex://new?prompt=".Length..]));
        Assert.True(text.Has("OPENED") && text.Has("NOT SENT"), text.All);
        Assert.False(text.Has("confidential"), "the selection never reaches a key");
        k.AssertFramesAreDeckSafe();

        foreach (var device in DialDevices)
        {
            var r2 = new Ai2Rig();
            await using var d = await r2.AppearAsync<AskAction>(device, new(0, 0), Controller.Encoder, new AskSettings { Target = "claude-desktop" });
            await d.RotateAsync(1);
            await d.DialPressAsync();
            Assert.True(r2.Opened.Single().StartsWith("claude://code/new?q=", StringComparison.Ordinal), r2.Opened.Single());
            if (!device.IsGalleon)
            {
                await d.TapAsync(100, 50);
                Assert.Equal(2, r2.Opened.Count);
            }
            d.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Dictate_key_holds_ctrl_i_in_vs_code_and_releases_on_up_or_disappear()
    {
        var rig = new Ai2Rig();
        rig.ForegroundProbe.Value = (901, "Code.exe");
        var h = await rig.AppearAsync<DictateAction>(TestDevices.Galleon, new(1, 3));
        await h.KeyDownAsync();
        Assert.Equal("down:Control+I", string.Join(",", rig.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")));
        await h.KeyUpAsync();
        Assert.Equal("down:Control+I,up:Control+I", string.Join(",", rig.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")));
        await h.KeyDownAsync();
        await h.DisappearAsync();   // a held key is always released
        Assert.Equal("up:Control+I", $"{rig.Input.Calls.Last().Kind}:{rig.Input.Calls.Last().Keys}");
        h.AssertFramesAreDeckSafe();

        foreach (var device in DialDevices)
        {
            var r2 = new Ai2Rig();
            r2.ForegroundProbe.Value = (900, "notepad.exe");
            await using var d = await r2.AppearAsync<DictateAction>(device, new(0, 1), Controller.Encoder);
            await d.DialPressAsync();
            Assert.Equal("chord:LeftWindows+H", string.Join(",", r2.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")));
            await d.RotateAsync(12);
            Assert.Equal("windows", d.LastSettingsAs<DictateSettings>().Mode);
            d.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Safe_mode_actions_never_launch_type_copy_or_open()
    {
        var rig = new Ai2Rig(safeMode: true);
        rig.TypicalProcesses();
        rig.ForegroundProbe.Value = (901, "Code.exe");
        rig.Windows.Add(0x7801, 2001, "claude.exe", null);
        using var text = AiText.Record();
        await using (var a = await rig.AppearAsync<AppKeyAction>(TestDevices.Galleon, new(0, 0), context: "a")) { await a.PressAsync(); await a.PressAsync(TimeSpan.FromMilliseconds(600)); }
        await using (var s = await rig.AppearAsync<AskAction>(TestDevices.Galleon, new(1, 0), context: "s")) await s.PressAsync();
        await using (var d = await rig.AppearAsync<DictateAction>(TestDevices.Galleon, new(2, 0), context: "d")) { await d.KeyDownAsync(); await d.KeyUpAsync(); }
        await using (var k = await rig.AppearAsync<HealthKeyAction>(TestDevices.Galleon, new(0, 1), context: "k")) await k.PressAsync();
        await using (var u = await rig.AppearAsync<UsageAction>(TestDevices.Galleon, new(0, 0), Controller.Encoder, new UsageSettings { Provider = "bedrock" }, context: "u"))
        {
            rig.Configure(x => x.AwsProfile = "PrismReadOnly");
            var r = await u.PiMessageAsync("bedrock.enable");
            Assert.Contains("Safe mode", PiReply.Message(r));
            await u.DialPressAsync();
        }
        Assert.Empty(rig.Input.Calls);
        Assert.Empty(rig.Foreground.Raised);
        Assert.Empty(rig.Started);
        Assert.Empty(rig.Opened);
        Assert.Empty(rig.Aws.Calls);
        Assert.Equal(0, rig.Clipboard.Snapshots + rig.Clipboard.Reads + rig.Clipboard.Restores);
        Assert.True(text.Has("SAFE MODE"), text.All);
    }

    [Test]
    public async Task Without_the_services_every_action_draws_an_offline_face()
    {
        await using (var a = await ActionHarness<AppKeyAction>.AppearAsync(TestDevices.Galleon, new(0, 0))) { await a.PressAsync(); a.AssertFramesAreDeckSafe(); }
        await using (var b = await ActionHarness<HealthStripAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder)) { await b.RotateAsync(1); b.AssertFramesAreDeckSafe(); }
        await using (var c = await ActionHarness<UsageAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder)) { await c.DialPressAsync(); c.AssertFramesAreDeckSafe(); }
        await using (var d = await ActionHarness<OpsAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder)) d.AssertFramesAreDeckSafe();
        await using (var e = await ActionHarness<AskAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder)) { await e.DialPressAsync(); e.AssertFramesAreDeckSafe(); }
        await using (var f = await ActionHarness<DictateAction>.AppearAsync(TestDevices.Galleon, new(0, 0))) { await f.KeyDownAsync(); await f.KeyUpAsync(); f.AssertFramesAreDeckSafe(); }
        await using (var g = await ActionHarness<HealthKeyAction>.AppearAsync(TestDevices.Mini, new(0, 0))) g.AssertFramesAreDeckSafe();
    }
}

internal static class PiReply
{
    /// <summary>The message of a PI reply (pi.state or pi.response), decoded (JSON escapes ' and •).</summary>
    public static string Message(System.Text.Json.Nodes.JsonNode? n) =>
        n?["data"]?["message"]?.GetValue<string>() ?? n?["message"]?.GetValue<string>() ?? n?["payload"]?["message"]?.GetValue<string>() ?? n?.ToJsonString() ?? "";
}
