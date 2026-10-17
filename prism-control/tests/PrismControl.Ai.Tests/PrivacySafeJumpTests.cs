using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Art;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Sessions.Jump;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Streamer-safe by default: no prompts, paths, commands or titles reach a key unless the user picks Reveal.</summary>
public class PrivacyTests
{
    private const string Marker = "TITLE-MARKER";

    private static async Task<string> RenderEverything(TestRig rig)
    {
        TrackerTests.List(rig, TrackerTests.Entry(TestRig.Sessions1, "busy", title: Marker + " secret plan", cwd: @"C:\Users\example\projects\WORKSPACE-MARKER"));
        rig.Presence.Register("a", Approvals.SurfaceKind.Approve, TestRig.Device, false);
        rig.Presence.Register("d", Approvals.SurfaceKind.Deny, TestRig.Device, false);
        using var text = AiText.Record();
        var parts = new List<string>();
        await using (var k = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 }, context: "k"))
        await using (var f = await rig.AppearAsync<FleetDialAction>(TestDevices.Galleon, new(0, 0), Controller.Encoder, context: "f"))
        await using (var c = await rig.AppearAsync<RequestCardAction>(TestDevices.Galleon, new(1, 0), Controller.Encoder, context: "c"))
        await using (var n = await rig.AppearAsync<NextNeedsMeAction>(TestDevices.Galleon, new(0, 2), context: "n"))
        {
            rig.Hook("SessionStart", TestRig.Sessions1);
            var offer = rig.Broker.Offer(rig.Event("PermissionRequest", TestRig.Sessions1, fields: new() { ["tool_name"] = "Bash" }), true);
            if (offer.Hold && offer.Reveal)
                rig.Broker.AttachSummary(offer.RequestId!, TestRig.Reveal("Bash", "COMMAND-MARKER --force"));
            foreach (var h in new ActionBase[] { k.Action, f.Action, c.Action, n.Action }) { }
            await k.AdvanceAsync(TimeSpan.FromSeconds(1));
            await f.SettleAsync();
            await c.SettleAsync();
            await n.SettleAsync();
            parts.Add(c.FeedbackText("line1") ?? "");
            parts.Add(c.FeedbackText("line2") ?? "");
            foreach (var h in new IEnumerable<ChannelCall>[] { k.Calls, f.Calls, c.Calls, n.Calls })
                parts.AddRange(h.Select(x => x.Payload?.ToJsonString() ?? ""));
        }
        parts.Add(text.All);
        return string.Join("\n", parts);
    }

    [Test]
    public async Task Private_by_default_shows_no_titles_paths_or_commands()
    {
        Assert.True(new AiSettings().IsPrivate, "the default is Private");
        using var rig = new TestRig(settings: new AiSettings());
        var all = await RenderEverything(rig);
        Assert.DoesNotContain(Marker, all);
        Assert.DoesNotContain("WORKSPACE-MARKER", all);
        Assert.DoesNotContain("COMMAND-MARKER", all);
        Assert.DoesNotContain(@"C:\\Users", all);
        Assert.Contains("AGENT 1", all);
    }

    [Test]
    public async Task On_air_forces_private_even_in_reveal()
    {
        using var rig = new TestRig(settings: new AiSettings { Privacy = "reveal", OnAir = true });
        var all = await RenderEverything(rig);
        Assert.DoesNotContain(Marker, all);
        Assert.DoesNotContain("WORKSPACE-MARKER", all);
        Assert.DoesNotContain("COMMAND-MARKER", all);
    }

    [Test]
    public async Task Reveal_shows_the_alias_and_a_bounded_summary_but_never_a_path()
    {
        using var rig = new TestRig(settings: new AiSettings { Privacy = "reveal" });
        var all = await RenderEverything(rig);
        Assert.Contains(Marker, all, "the session name is the alias in Reveal");
        Assert.Contains("COMMAND-MARKER --force", all.Replace("COMMAND-MARKER\n--force", "COMMAND-MARKER --force"), "the summary (laid out over the card's lines)");
        Assert.DoesNotContain(@"C:\\Users", all);
        Assert.DoesNotContain(@"projects\\WORKSPACE", all, "a basename at most");
    }

    [Test]
    public void Approval_views_hide_summaries_when_private()
    {
        using var rig = new TestRig(settings: new AiSettings { Privacy = "reveal" });
        rig.Presence.Register("a", Approvals.SurfaceKind.Approve, TestRig.Device, false);
        rig.Presence.Register("c", Approvals.SurfaceKind.Details, TestRig.Device, false);
        rig.Hook("SessionStart");
        var offer = rig.Broker.Offer(rig.Event("PermissionRequest", TestRig.Sessions1, fields: new() { ["tool_name"] = "mcp__example__query" }), true);
        rig.Broker.AttachSummary(offer.RequestId!, new JsonObject { ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "SELECT 1" } });
        Assert.Equal("SELECT 1", rig.Broker.Selected()!.Summary!.Command);
        Assert.Equal("mcp__example__query", rig.Broker.Selected()!.ToolName);
        rig.Update(s => s.OnAir = true);
        var v = rig.Broker.Selected()!;
        Assert.Null(v.Summary);
        Assert.Null(v.ToolName, "in Private only the tool category is shown");
        Assert.Equal(ToolCategory.Mcp, v.Category);
        Assert.False(v.DetailsComplete);
    }
}

/// <summary>Safe mode (fake host, E2E): no holds, no focus, no links, no CLI UI commands, no hook writes, no input.</summary>
public class SafeModeTests
{
    [Test]
    public async Task Safe_mode_never_holds_a_request()
    {
        await using var deck = await Deck.OnAsync(new TestRig(safeMode: true));
        var (_, decision, offer) = await deck.RequestAsync();
        Assert.False(offer.Hold);
        Assert.Equal("safe mode", offer.Reason);
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        await deck.Deny.PressAsync();
        Assert.Equal(Approvals.DecisionKind.None, decision.Result.Kind);
        Assert.Equal(Approvals.ApproveBlock.SafeMode, deck.Rig.Broker.ApproveState(TestRig.Device));
    }

    [Test]
    public async Task Safe_mode_never_focuses_opens_or_switches()
    {
        using var rig = new TestRig(safeMode: true);
        rig.Runner.Installed["orca.exe"] = @"C:\fake\orca.exe";
        rig.Hook("UserPromptSubmit", "s-1");
        rig.Windows.WindowsByPid[77] = [(nint)0x77];
        await using var key = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 });
        await key.PressAsync();
        await using var fleet = await rig.AppearAsync<FleetDialAction>(TestDevices.Plus, new(0, 0), Controller.Encoder, context: "f");
        await fleet.DialPressAsync();
        await fleet.TapAsync(10, 10);
        await using var next = await rig.AppearAsync<NextNeedsMeAction>(TestDevices.Galleon, new(1, 0), context: "n");
        await next.PressAsync();
        Assert.Empty(rig.Windows.Focused);
        Assert.Empty(rig.Uris.Opened);
        Assert.Empty(rig.Tabs.Calls);
        Assert.Empty(rig.Runner.Calls);
        Assert.Contains("[safe mode] would jump", rig.Log.All);
        Assert.Equal(0, key.Count("openUrl"));
        key.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Safe_mode_adapters_are_fakes()
    {
        var log = new CapturingLog();
        var opener = new AppUriOpener(_ => throw new InvalidOperationException("must not open"), safeMode: true, log);
        opener.Open("vscode://anthropic.claude-code/open?session=x");
        Assert.Contains("[safe mode] would open a vscode: link", log.All);
        Assert.Equal(TabSelectResult.SafeMode, await new UiaTabSelector(log, safeMode: true).TrySelectAsync(1, "x", CancellationToken.None));
    }

    [Test]
    public void Safe_mode_never_saves_pins()
    {
        // AiModule uses MemoryPinStore in safe mode; FilePinStore round-trips in a temp dir otherwise.
        var dir = TempDirs.New("pins");
        try
        {
            var store = new FilePinStore(dir, new CapturingLog());
            store.Save(new Dictionary<SessionKey, int> { [new SessionKey(AgentKind.Claude, "s-1")] = 3 });
            Assert.Equal(3, new FilePinStore(dir, new CapturingLog()).Load()[new SessionKey(AgentKind.Claude, "s-1")]);
            var mem = new MemoryPinStore();
            new SlotTable(mem).Pin(new SessionKey(AgentKind.Claude, "s-2"), 4);
            Assert.Equal(4, mem.Load().Single().Value);
        }
        finally { TempDirs.Delete(dir); }
    }
}

/// <summary>Press-to-jump without Orca (research/ai-status.md §1.7), all on fake windows.</summary>
public class JumpTests
{
    private static SessionView Session(TestRig rig, string id = "s-1") => rig.Sessions.Find(new SessionKey(AgentKind.Claude, id), PrivacyMode.Private)!;

    [Test]
    public async Task Vscode_extension_sessions_open_the_vscode_link()
    {
        using var rig = new TestRig();
        var json = TestRig.EventJson("UserPromptSubmit", "s-1", agentProcess: rig.Agent, hostKind: "vscode", env: new() { ["CLAUDE_CODE_ENTRYPOINT"] = "claude-vscode" });
        rig.Sessions.ApplyHook(Ingress.HookEventParser.TryParseEvent(json, rig.Time.GetUtcNow(), out _)!, true);
        var r = await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None);
        Assert.Equal(JumpOutcome.OpenedLink, r.Outcome);
        Assert.Equal("vscode://anthropic.claude-code/open?session=s-1", Assert.Single(rig.Uris.Opened));
        Assert.Empty(rig.Windows.Focused);
    }

    [Test]
    public async Task Codex_threads_in_the_chatgpt_app_open_the_codex_link()
    {
        using var rig = new TestRig();
        rig.Sessions.ApplyRollout(new RolloutEvent("0199aa11-2222-7333-8444-555566667777", RolloutKind.SessionMeta, rig.Time.GetUtcNow(), "codex_work_desktop"));
        var s = rig.Sessions.Find(new SessionKey(AgentKind.Codex, "0199aa11-2222-7333-8444-555566667777"), PrivacyMode.Private)!;
        var r = await rig.Jumper.JumpAsync(s, CancellationToken.None);
        Assert.Equal(JumpOutcome.OpenedLink, r.Outcome);
        Assert.Equal("codex://threads/0199aa11-2222-7333-8444-555566667777", Assert.Single(rig.Uris.Opened));
    }

    [Test]
    public async Task Terminal_sessions_focus_the_console_root_owner_then_try_the_tab()
    {
        using var rig = new TestRig();
        var json = TestRig.EventJson("UserPromptSubmit", "s-1", agentProcess: rig.Agent);
        json["host"]!["consoleHwnd"] = 0x5005;
        rig.Windows.Owners[0x5005] = 0x6006;
        rig.Windows.Classes[0x6006] = Jumper.TerminalWindowClass;
        rig.Sessions.ApplyHook(Ingress.HookEventParser.TryParseEvent(json, rig.Time.GetUtcNow(), out _)!, true);
        var r = await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None);
        Assert.Equal(JumpOutcome.TabSelected, r.Outcome);
        Assert.Equal((nint)0x6006, Assert.Single(rig.Windows.Focused));
        Assert.Equal(((nint)0x6006, "Example session"), Assert.Single(rig.Tabs.Calls));

        rig.Tabs.Result = TabSelectResult.Ambiguous;
        Assert.Equal("FIND THE TAB", (await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Label, "labeled best effort");
        rig.TitleForJump = null;
        Assert.Equal(JumpOutcome.FocusedFindTab, (await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Outcome);
        rig.Update(s => s.SelectTerminalTab = false);
        rig.TitleForJump = "Example session";
        var calls = rig.Tabs.Calls.Count;
        Assert.Equal(JumpOutcome.FocusedFindTab, (await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Outcome);
        Assert.Equal(calls, rig.Tabs.Calls.Count, "tab selection is opt-out");
    }

    [Test]
    public async Task Falls_back_to_the_host_process_then_the_ancestors()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", "s-1");
        rig.Windows.WindowsByPid[77] = [(nint)0x7000, (nint)0x7001];
        rig.Windows.Classes[0x7001] = Jumper.TerminalWindowClass;
        Assert.Equal((nint)0x7001, rig.Jumper.HostWindow(Session(rig)), "the WT hosting window is preferred");

        using var rig2 = new TestRig();
        var json = TestRig.EventJson("UserPromptSubmit", "s-1", agentProcess: rig2.Agent, hostKind: "unknown");
        json.Remove("host");
        rig2.Sessions.ApplyHook(Ingress.HookEventParser.TryParseEvent(json, rig2.Time.GetUtcNow(), out _)!, true);
        rig2.Tree.Parents[TestRig.AgentPid] = [rig2.Tree.Add(300, "pwsh.exe"), rig2.Tree.Add(301, "Code.exe")];
        rig2.Windows.WindowsByPid[301] = [(nint)0x3010];
        Assert.Equal((nint)0x3010, rig2.Jumper.HostWindow(Session(rig2)), "the first ancestor that owns a window (VS Code)");
        var r = await rig2.Jumper.JumpAsync(Session(rig2), CancellationToken.None);
        Assert.Equal(JumpOutcome.Focused, r.Outcome, "not a terminal window: no tab hunt");
    }

    [Test]
    public async Task Refusals_are_reported_not_hidden()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", "s-1");
        Assert.Equal(JumpOutcome.NoWindow, (await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Outcome);
        rig.Windows.WindowsByPid[77] = [(nint)0x77];
        rig.Windows.NextResult = FocusResult.Elevated;
        Assert.Equal("ADMIN WINDOW", (await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Label);
        rig.Windows.NextResult = FocusResult.Refused;
        Assert.False((await rig.Jumper.JumpAsync(Session(rig), CancellationToken.None)).Succeeded);
        Assert.Equal(JumpOutcome.NoSession, (await rig.Jumper.JumpAsync(null, CancellationToken.None)).Outcome);
    }

    [Test]
    public async Task Orca_is_used_only_when_present_and_enabled()
    {
        using var rig = new TestRig();
        var jumper = new Jumper(rig.Windows, rig.Tabs, rig.Uris, rig.Runner, rig.Tree, () => rig.Settings.Current, () => @"C:\fake\orca.exe",
            (_, _) => Task.FromResult<string?>(null), rig.Log, safeMode: false);
        var json = TestRig.EventJson("UserPromptSubmit", "s-1", agentProcess: rig.Agent, hostKind: "orca",
            env: new() { ["ORCA_TERMINAL_HANDLE"] = "term_aaa111", ["ORCA_PANE_KEY"] = "tab-1:leaf-1" });
        rig.Sessions.ApplyHook(Ingress.HookEventParser.TryParseEvent(json, rig.Time.GetUtcNow(), out _)!, true);
        rig.Runner.Respond = _ => FakeCommandRunner.Ok("{}");
        rig.Windows.WindowsByPid[77] = [(nint)0x0ca];
        var r = await jumper.JumpAsync(Session(rig), CancellationToken.None);
        Assert.Equal(JumpOutcome.OrcaPane, r.Outcome);
        Assert.Equal("terminal switch --terminal term_aaa111", string.Join(' ', Assert.Single(rig.Runner.Calls).Args));
        rig.Update(s => s.OrcaEnrichment = false);
        var r2 = await jumper.JumpAsync(Session(rig), CancellationToken.None);
        Assert.Single(rig.Runner.Calls);
        Assert.Equal(JumpOutcome.Focused, r2.Outcome, "Orca off: plain window focus");
    }

    [Test]
    public void Tab_title_matching_is_strict()
    {
        Assert.Equal(1, TabTitleMatcher.Pick(["pwsh", "✳ Example session", "Other"], "Example session"));
        Assert.Equal(0, TabTitleMatcher.Pick(["  example SESSION "], "Example session"));
        Assert.Equal(TabTitleMatcher.Ambiguous, TabTitleMatcher.Pick(["Example session", "⠂ Example session"], "Example session"));
        Assert.Equal(TabTitleMatcher.NoMatch, TabTitleMatcher.Pick(["Example session 2"], "Example session"));
        Assert.Equal(TabTitleMatcher.NoMatch, TabTitleMatcher.Pick(["x"], "  "));
    }
}
