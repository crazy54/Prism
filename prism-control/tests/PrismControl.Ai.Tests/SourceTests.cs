using System.Text;
using System.Text.Json;
using PrismControl.Ai.Platform;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>claude agents --json, the adaptive poller, Codex rollouts and Orca parsing, from fictional fixtures.</summary>
public class SourceTests
{
    private static string AgentsFixture => File.ReadAllText(TempDirs.Fixture("claude-agents.json"));

    [Test]
    public void Agent_list_parses_the_verified_shape()
    {
        var list = Assert.NotNull(AgentListParser.TryParse(AgentsFixture, keepTitles: false));
        Assert.Equal(6, list.Count, "the row without any id is skipped");
        var busy = list[0];
        Assert.Equal(41001, busy.Pid);
        Assert.Equal("busy", busy.Status);
        Assert.Equal("aurora", busy.CwdName);
        Assert.Equal(Privacy.CwdHash(@"C:\Users\example\projects\aurora"), busy.CwdHash);
        Assert.Equal("permission prompt", list[1].WaitingFor);
        Assert.Equal(Privacy.CwdHash(@"C:\Users\example\projects\cassini"), list[2].CwdHash, "Git Bash /c/ paths join");
        Assert.True(list[4].IsBackground);
        Assert.Equal("blocked", list[4].BackgroundState);
        Assert.Equal("bg-0005", list[4].KeyId);
    }

    [Test]
    public void Agent_list_never_keeps_titles_or_paths_in_private_mode()
    {
        var list = AgentListParser.TryParse(AgentsFixture, keepTitles: false)!;
        var dump = JsonSerializer.Serialize(list);
        Assert.DoesNotContain("TITLE-MARKER", dump);
        Assert.DoesNotContain(@"C:\\Users", dump);
        Assert.DoesNotContain("example\\\\projects", dump);
        var reveal = AgentListParser.TryParse(AgentsFixture, keepTitles: true)!;
        Assert.Contains("TITLE-MARKER", reveal[0].Title);
    }

    [Test]
    public void Agent_list_is_lenient()
    {
        Assert.Null(AgentListParser.TryParse("", false));
        Assert.Null(AgentListParser.TryParse("not json", false));
        Assert.Null(AgentListParser.TryParse("{\"x\":1}", false));
        Assert.Empty(AgentListParser.TryParse("[]", false)!);
        var wrapped = AgentListParser.TryParse("{\"sessions\":[{\"sessionId\":\"a\",\"status\":\"idle\",\"pid\":\"oops\"}]}", false)!;
        Assert.Single(wrapped);
        Assert.Null(wrapped[0].Pid, "a wrong type keeps the default");
    }

    [Test]
    public async Task Poller_is_adaptive_and_demand_driven()
    {
        using var rig = new TestRig();
        var demanded = true;
        rig.Runner.Respond = spec => FakeCommandRunner.Ok(AgentsFixture);
        await using var poller = new AgentListPoller(rig.Sessions, rig.Runner, rig.Time, rig.Log, () => demanded, () => false);
        Assert.Equal(AgentListPoller.Slow, poller.CurrentInterval, "nothing active: 10 s");
        await poller.PollOnceAsync(CancellationToken.None);
        var call = Assert.Single(rig.Runner.Calls);
        Assert.Equal(@"C:\fake\claude.exe", call.File);
        Assert.Equal("agents --json", string.Join(' ', call.Args));
        Assert.Equal(AgentListPoller.CommandTimeout, call.Timeout);
        Assert.Equal(6, rig.Sessions.Snapshot(PrivacyMode.Private).Count);
        Assert.Equal(AgentListPoller.Fast, poller.CurrentInterval, "busy sessions and no hooks: 2 s");
        rig.Hook("UserPromptSubmit", session: "1a2b3c4d-0001-4000-8000-00000000a001");
        Assert.Equal(AgentListPoller.ActiveWithHooks, poller.CurrentInterval, "hooks are instant: the list only closes blind spots");
        Assert.Equal("ok", poller.Status);
        _ = demanded;
    }

    [Test]
    public async Task Poller_titles_follow_the_privacy_mode()
    {
        using var rig = new TestRig(settings: new AiSettings());   // private
        rig.Runner.Respond = _ => FakeCommandRunner.Ok(AgentsFixture);
        await using var poller = new AgentListPoller(rig.Sessions, rig.Runner, rig.Time, rig.Log, () => true, () => !rig.Settings.Current.IsPrivate);
        await poller.PollOnceAsync(CancellationToken.None);
        Assert.True(rig.Sessions.Snapshot(PrivacyMode.Reveal).All(s => s.Title is null), "private: titles are never even kept");
        rig.Update(s => s.Privacy = "reveal");
        await poller.PollOnceAsync(CancellationToken.None);
        Assert.Contains("TITLE-MARKER", rig.Sessions.Snapshot(PrivacyMode.Reveal)[0].Title);
        Assert.Null(rig.Sessions.Snapshot(PrivacyMode.Private)[0].Title, "the private projection never shows them");
        rig.Update(s => s.Privacy = "private");
        Assert.True(rig.Sessions.Snapshot(PrivacyMode.Reveal).All(s => s.Title is null), "switching to private drops them at once");
    }

    [Test]
    public async Task Poller_survives_a_missing_cli_and_timeouts()
    {
        using var rig = new TestRig();
        rig.Runner.Installed.Clear();
        await using var poller = new AgentListPoller(rig.Sessions, rig.Runner, rig.Time, rig.Log, () => true, () => false);
        await poller.PollOnceAsync(CancellationToken.None);
        Assert.Empty(rig.Runner.Calls);
        Assert.Equal("Claude Code CLI not found", poller.Status);

        using var rig2 = new TestRig();
        rig2.Runner.Respond = _ => new CommandResult(true, null, "", TimedOut: true);
        await using var p2 = new AgentListPoller(rig2.Sessions, rig2.Runner, rig2.Time, rig2.Log, () => true, () => false);
        await p2.PollOnceAsync(CancellationToken.None);
        Assert.Equal("claude agents timed out", p2.Status);
    }

    [Test]
    public async Task Poller_passes_extra_config_dirs()
    {
        using var rig = new TestRig();
        rig.Runner.Respond = _ => FakeCommandRunner.Ok("[]");
        await using var poller = new AgentListPoller(rig.Sessions, rig.Runner, rig.Time, rig.Log, () => true, () => false, () => [null, @"D:\example\claude-work"]);
        await poller.PollOnceAsync(CancellationToken.None);
        Assert.Equal(2, rig.Runner.Calls.Count);
        Assert.Null(rig.Runner.Calls[0].Environment);
        Assert.Equal(@"D:\example\claude-work", rig.Runner.Calls[1].Environment!["CLAUDE_CONFIG_DIR"]);
    }

    // ------------------------------------------------------------------ Codex rollouts

    [Test]
    public void Rollout_reader_extracts_state_and_never_content()
    {
        var lines = File.ReadAllLines(TempDirs.Fixture(Path.Combine("codex-sessions", "2026", "10", "16", "rollout-2026-10-16T09-00-00-0199aa11-2222-7333-8444-555566667777.jsonl")));
        var now = DateTimeOffset.Parse("2026-10-16T12:00:00Z");
        var events = new List<RolloutEvent>();
        var limits = new List<CodexRateLimits>();
        foreach (var l in lines)
        {
            var (e, lim) = RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(l), "thread", now);
            if (e is not null) events.Add(e);
            if (lim is not null) limits.Add(lim);
        }
        Assert.Equal("SessionMeta,TaskStarted,TaskComplete", string.Join(',', events.Select(e => e.Kind)));
        Assert.Equal("0199aa11-2222-7333-8444-555566667777", events[0].ThreadId);
        Assert.Equal("codex-tui", events[0].Originator);
        Assert.Equal("hydra", events[0].CwdName);
        Assert.False(events[2].HasError);
        var w = Assert.Single(limits).Windows;
        Assert.Equal(2, w.Count);
        Assert.Equal(300, w[0].WindowMinutes);
        Assert.Near(42.5, w[0].UsedPercent, 0.001);
        Assert.Equal(10080, w[1].WindowMinutes);
        var dump = JsonSerializer.Serialize(events) + JsonSerializer.Serialize(limits);
        Assert.DoesNotContain("SECRET-CONTENT-MARKER", dump);
        Assert.DoesNotContain("BRANCH-MARKER", dump);
    }

    [Test]
    public void Rollout_reader_handles_errors_order_and_garbage()
    {
        var now = DateTimeOffset.Parse("2026-10-16T12:00:00Z");
        var err = """{"type":"event_msg","timestamp":"2026-10-16T09:00:00Z","payload":{"error":{"message":"SECRET"},"type":"task_complete"}}""";
        var (e, _) = RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(err), "t", now);
        Assert.True(e!.HasError);
        var payloadFirst = """{"payload":{"type":"turn_aborted","reason":"interrupted"},"type":"event_msg"}""";
        Assert.Equal(RolloutKind.TurnAborted, RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(payloadFirst), "t", now).Event!.Kind);
        Assert.Null(RolloutLineReader.TryRead("{\"type\":\"event_msg\",\"payload\":{\"type\":"u8, "t", now).Event, "a torn line");
        Assert.Null(RolloutLineReader.TryRead("[1,2]"u8, "t", now).Event);
        var future = """{"timestamp":"2099-01-01T00:00:00Z","type":"event_msg","payload":{"type":"task_started"}}""";
        Assert.Equal(now, RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(future), "t", now).Event!.At, "a future timestamp is clamped to now");
        var oldLimits = """{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":5,"window_minutes":300,"resets_in_seconds":60}}}}""";
        Assert.Equal(now + TimeSpan.FromSeconds(60), RolloutLineReader.TryRead(Encoding.UTF8.GetBytes(oldLimits), "t", now).Limits!.Windows[0].ResetsAt);
        Assert.Equal("0199aa11-2222-7333-8444-555566667777",
            RolloutLineReader.ThreadIdFromFileName(@"C:\x\rollout-2026-10-16T09-00-00-0199aa11-2222-7333-8444-555566667777.jsonl"));
        Assert.Null(RolloutLineReader.ThreadIdFromFileName(@"C:\x\rollout-notes.jsonl"));
    }

    [Test]
    public void Rollout_tailer_catches_up_then_follows_appends()
    {
        var root = TempDirs.CopyFixture("codex-sessions");
        try
        {
            using var rig = new TestRig();
            var limits = new List<CodexRateLimits>();
            using var tail = new RolloutTailer(root, rig.Sessions, rig.Time, rig.Log, limits.Add);
            var file = Directory.EnumerateFiles(root, "rollout-*.jsonl", SearchOption.AllDirectories).Single();
            File.SetLastWriteTimeUtc(file, rig.Time.GetUtcNow().UtcDateTime);
            tail.Process(file);
            var key = new SessionKey(AgentKind.Codex, "0199aa11-2222-7333-8444-555566667777");
            var v = Assert.NotNull(rig.Sessions.Find(key, PrivacyMode.Reveal));
            Assert.Equal(SessionState.Done, v.State.Value);
            Assert.Equal(FactSource.Rollout, v.State.Source);
            Assert.Equal("hydra", v.Workspace);
            Assert.Single(limits);

            File.AppendAllText(file, """{"timestamp":"2026-10-16T09:10:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-2"}}""" + "\n");
            File.AppendAllText(file, """{"timestamp":"2026-10-16T09:10:01.000Z","type":"response_item","payload":{"type":"message","content":"SECRET-CONTENT-MARKER"}}""" + "\n");
            File.AppendAllText(file, """{"timestamp":"2026-10-16T09:10:02.000Z","type":"event_msg","payload":{"type":"task_comp""");   // torn write
            tail.Process(file);
            Assert.Equal(SessionState.Working, rig.Sessions.Find(key, PrivacyMode.Private)!.State.Value);
            File.AppendAllText(file, "lete\",\"error\":null}}\n");
            tail.Process(file);
            Assert.Equal(SessionState.Done, rig.Sessions.Find(key, PrivacyMode.Private)!.State.Value, "the torn line completes on the next append");
            Assert.DoesNotContain("SECRET-CONTENT-MARKER", rig.Log.All);
        }
        finally { TempDirs.Delete(root); }
    }

    [Test]
    public void Rollout_only_sessions_go_quiet_after_30_minutes()
    {
        using var rig = new TestRig();
        rig.Sessions.ApplyRollout(new RolloutEvent("t-1", RolloutKind.TaskStarted, rig.Time.GetUtcNow()));
        rig.Time.Advance(TimeSpan.FromMinutes(31));
        rig.Tree.CodexRunning = false;
        rig.Sessions.Tick();
        var v = rig.Sessions.Find(new SessionKey(AgentKind.Codex, "t-1"), PrivacyMode.Private)!;
        Assert.Equal(SessionState.Stale, v.State.Value);
        Assert.Equal(Confidence.Inferred, v.State.Confidence);

        using var rig2 = new TestRig();
        rig2.Sessions.ApplyRollout(new RolloutEvent("t-2", RolloutKind.TaskStarted, rig2.Time.GetUtcNow()));
        rig2.Time.Advance(TimeSpan.FromMinutes(31));
        rig2.Tree.CodexRunning = true;
        rig2.Sessions.Tick();
        Assert.Equal(SessionState.Idle, rig2.Sessions.Find(new SessionKey(AgentKind.Codex, "t-2"), PrivacyMode.Private)!.State.Value);
    }

    [Test]
    public void Desktop_originated_codex_threads_are_hosted_by_the_chatgpt_app()
    {
        using var rig = new TestRig();
        rig.Sessions.ApplyRollout(new RolloutEvent("t-3", RolloutKind.SessionMeta, rig.Time.GetUtcNow(), Originator: "codex_work_desktop"));
        Assert.Equal(HostKind.ChatGpt, rig.Sessions.Find(new SessionKey(AgentKind.Codex, "t-3"), PrivacyMode.Private)!.Host.Kind);
    }

    // ------------------------------------------------------------------ Orca

    [Test]
    public void Orca_parsing_drops_every_content_field()
    {
        var agents = OrcaParser.ParseWorktrees(File.ReadAllText(TempDirs.Fixture("orca-worktree-ps.json")))!;
        var terms = OrcaParser.ParseTerminals(File.ReadAllText(TempDirs.Fixture("orca-terminal-list.json")))!;
        Assert.Equal(2, agents.Count);
        Assert.Equal("Bash", agents[0].ToolName);
        Assert.Equal("term_aaa111", terms[0].Handle);
        Assert.Equal("tab-1:leaf-1", terms[0].PaneKey);
        var dump = JsonSerializer.Serialize(agents) + JsonSerializer.Serialize(terms);
        foreach (var marker in new[] { "PROMPT-MARKER", "CONTENT-MARKER", "COMMAND-MARKER", "PREVIEW-MARKER", "TITLE-MARKER", @"example\\projects" })
            Assert.DoesNotContain(marker, dump);
        Assert.Null(OrcaParser.ParseWorktrees("garbage"));
    }

    [Test]
    public async Task Orca_enricher_is_optional()
    {
        using var rig = new TestRig();
        await using var orca = new OrcaEnricher(rig.Sessions, rig.Runner, rig.Time, rig.Log, () => true);
        orca.Start();
        Assert.False(orca.Present, "no orca.exe: nothing runs and nothing breaks");
        await orca.PollOnceAsync(CancellationToken.None);
        Assert.Empty(rig.Runner.Calls);
    }
}
