using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Merging by identity, the agent list as ground truth for the hooks' blind spots, timeouts, crashes and slots.</summary>
public class TrackerTests
{
    internal static AgentListEntry Entry(string id, string? status, string? waitingFor = null, int? pid = 4242, long startedAt = 1_792_141_200_000,
        string cwd = @"C:\Users\example\projects\aurora", string? title = null) => new()
    {
        SessionId = id, Status = status, WaitingFor = waitingFor, Pid = pid, Kind = "interactive", StartedAtMs = startedAt,
        CwdHash = Privacy.CwdHash(cwd), CwdName = Privacy.CwdName(cwd), Title = title,
    };

    internal static void List(TestRig rig, params AgentListEntry[] entries) =>
        rig.Sessions.ApplyAgentList(new AgentListSnapshot(entries, rig.Time.GetUtcNow(), TimeSpan.FromSeconds(6), "", true));

    private static SessionView V(TestRig rig, string id = TestRig.Sessions1, AgentKind a = AgentKind.Claude) =>
        Assert.NotNull(rig.Sessions.Find(new SessionKey(a, id), PrivacyMode.Private));

    [Test]
    public void Agent_list_seeds_sessions_with_reported_confidence()
    {
        using var rig = new TestRig();
        List(rig, Entry(TestRig.Sessions1, "busy"), Entry(TestRig.Sessions2, "waiting", "permission prompt", pid: 4343));
        var a = V(rig);
        Assert.Equal(SessionState.Working, a.State.Value);
        Assert.Equal(Confidence.Reported, a.State.Confidence);
        Assert.Equal(FactSource.AgentList, a.State.Source);
        Assert.Equal(Confidence.Inferred, a.Since.Confidence, "we don't know when a seeded state began: \"at least since\"");
        Assert.Equal(SessionState.NeedsPermission, V(rig, TestRig.Sessions2).State.Value);
        Assert.Equal(1, a.Slot);
        Assert.Equal(2, V(rig, TestRig.Sessions2).Slot);
    }

    [Test]
    public void Esc_mid_turn_is_closed_by_the_agent_list()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        Assert.Equal(SessionState.Working, V(rig).State.Value);
        // The user pressed Esc: no Stop hook. The next agent-list poll (well after the last hook) says idle.
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        List(rig, Entry(TestRig.Sessions1, "idle"));
        Assert.Equal(SessionState.Done, V(rig).State.Value);
        Assert.Equal(FactSource.AgentList, V(rig).State.Source);
    }

    [Test]
    public void A_terminal_deny_is_closed_by_the_agent_list()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest");
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        List(rig, Entry(TestRig.Sessions1, "idle"));
        Assert.Equal(SessionState.Done, V(rig).State.Value);
    }

    [Test]
    public void A_fresher_hook_beats_a_lagging_agent_list()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest");
        // A snapshot taken right after the hook (the list lags by its poll): the hook wins.
        rig.Time.Advance(TimeSpan.FromMilliseconds(500));
        List(rig, Entry(TestRig.Sessions1, "busy"));
        Assert.Equal(SessionState.NeedsPermission, V(rig).State.Value);
        Assert.Equal(Confidence.Observed, V(rig).State.Confidence);
    }

    [Test]
    public void A_pending_prism_request_keeps_needs_permission_against_the_list()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest");
        rig.Sessions.SetPendingRequest(new SessionKey(AgentKind.Claude, TestRig.Sessions1), "req-1");
        rig.Time.Advance(TimeSpan.FromSeconds(10));
        // While our hook holds, Claude may not have drawn its dialog yet: the list says busy. Keep NeedsPermission.
        List(rig, Entry(TestRig.Sessions1, "busy"));
        Assert.Equal(SessionState.NeedsPermission, V(rig).State.Value);
    }

    [Test]
    public void Agreeing_sources_keep_the_higher_confidence_fact()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Time.Advance(TimeSpan.FromSeconds(5));
        List(rig, Entry(TestRig.Sessions1, "busy"));
        Assert.Equal(Confidence.Observed, V(rig).State.Confidence, "observed beats reported; sources never average");
        Assert.Equal(FactSource.Hook, V(rig).State.Source);
    }

    [Test]
    public void Precedence_rule_picks_confidence_then_freshness()
    {
        var now = DateTimeOffset.UnixEpoch.AddDays(20000);
        var hook = Fact<SessionState>.Observed(SessionState.Working, FactSource.Hook, now.AddMinutes(-1), TimeSpan.FromMinutes(15));
        var list = Fact<SessionState>.Reported(SessionState.Done, FactSource.AgentList, now, TimeSpan.FromSeconds(6));
        Assert.Equal(SessionState.Working, Facts.Pick(hook, list, now).Value);
        var expiredHook = hook with { ObservedAt = now.AddMinutes(-20) };
        Assert.Equal(Confidence.Stale, expiredHook.At(now));
        Assert.Equal(SessionState.Done, Facts.Pick(expiredHook, list, now).Value, "a stale fact loses to a fresh reported one");
        var unknown = Fact<SessionState>.Unknown;
        Assert.Equal(SessionState.Done, Facts.Pick(unknown, list, now).Value, "unknown never beats a known value");
    }

    [Test]
    public void Working_with_no_signal_for_10_minutes_turns_stale_inferred_then_is_removed()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Time.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));
        rig.Sessions.Tick();
        var v = V(rig);
        Assert.Equal(SessionState.Stale, v.State.Value);
        Assert.Equal(Confidence.Inferred, v.State.Confidence, "a heuristic never becomes observed");
        Assert.Equal(FactSource.Heuristic, v.State.Source);
        rig.Time.Advance(TimeSpan.FromMinutes(61));
        rig.Sessions.Tick();
        Assert.Null(rig.Sessions.Find(new SessionKey(AgentKind.Claude, TestRig.Sessions1), PrivacyMode.Private));
    }

    [Test]
    public void Working_listed_by_the_agent_list_never_turns_stale()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        for (var i = 0; i < 12; i++)
        {
            rig.Time.Advance(TimeSpan.FromMinutes(1));
            List(rig, Entry(TestRig.Sessions1, "busy"));
            rig.Sessions.Tick();
        }
        Assert.Equal(SessionState.Working, V(rig).State.Value);
    }

    [Test]
    public void Needs_permission_is_kept_while_the_process_lives()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest");
        rig.Time.Advance(TimeSpan.FromHours(2));
        rig.Sessions.Tick();
        Assert.Equal(SessionState.NeedsPermission, V(rig).State.Value);
    }

    [Test]
    public void Done_fades_to_idle_after_10_minutes()
    {
        using var rig = new TestRig();
        rig.Hook("Stop");
        rig.Time.Advance(TimeSpan.FromMinutes(9));
        rig.Sessions.Tick();
        Assert.Equal(SessionState.Done, V(rig).State.Value);
        rig.Time.Advance(TimeSpan.FromMinutes(2));
        rig.Sessions.Tick();
        Assert.Equal(SessionState.Idle, V(rig).State.Value);
        Assert.Equal(Confidence.Inferred, V(rig).State.Confidence);
    }

    [Test]
    public void Ended_is_removed_after_30_seconds()
    {
        using var rig = new TestRig();
        rig.Hook("SessionEnd");
        rig.Time.Advance(TimeSpan.FromSeconds(29));
        rig.Sessions.Tick();
        Assert.NotNull(rig.Sessions.Find(new SessionKey(AgentKind.Claude, TestRig.Sessions1), PrivacyMode.Private));
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        rig.Sessions.Tick();
        Assert.Null(rig.Sessions.Find(new SessionKey(AgentKind.Claude, TestRig.Sessions1), PrivacyMode.Private));
    }

    [Test]
    public void Process_exit_without_session_end_is_dead_when_hooks_were_active()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        Assert.Single(rig.Watcher.Watched);
        rig.Watcher.Exit(rig.Agent, rig.Time.GetUtcNow());
        var v = V(rig);
        Assert.Equal(SessionState.Dead, v.State.Value);
        Assert.Equal(Confidence.Observed, v.State.Confidence);
        Assert.Equal(FactSource.Process, v.State.Source);
        rig.Time.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));
        rig.Sessions.Tick();
        Assert.Null(rig.Sessions.Find(new SessionKey(AgentKind.Claude, TestRig.Sessions1), PrivacyMode.Private), "dead is removed after 10 min");
    }

    [Test]
    public void Process_exit_of_a_list_only_session_is_a_normal_end()
    {
        using var rig = new TestRig();
        List(rig, Entry(TestRig.Sessions1, "idle", pid: TestRig.AgentPid));
        rig.Watcher.Exit(rig.Agent, rig.Time.GetUtcNow());
        Assert.Equal(SessionState.Ended, V(rig).State.Value, "Tier 0 can't tell a crash from an exit: never cry crash");
    }

    [Test]
    public void Pid_reuse_is_not_the_same_process()
    {
        var a = new ProcessIdentity(100, 1_000_000, "claude.exe");
        var reused = new ProcessIdentity(100, 5_000_000, "notepad.exe");
        Assert.False(a.SameAs(reused));
        Assert.True(a.SameAs(a with { StartedAtMs = 1_000_500 }), "rounding between readers stays the same process");

        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Watcher.Exit(new ProcessIdentity(TestRig.AgentPid, 9_999_999_999_999, "claude.exe"), rig.Time.GetUtcNow());
        Assert.Equal(SessionState.Working, V(rig).State.Value, "an exit of a different process with the same pid changes nothing");
    }

    [Test]
    public void A_watcher_refuses_a_pid_whose_start_time_differs()
    {
        var tree = new FakeProcessTree();
        tree.Add(10, "claude.exe", 1_000_000);
        var w = new FakeProcessWatcher(tree);
        Assert.Null(w.Watch(10, 9_000_000, "claude.exe"));
        Assert.True(w.Watch(10, 1_000_200, "claude.exe") is not null);
    }

    [Test]
    public void Sessions_absent_from_the_list_end_only_without_hooks()
    {
        using var rig = new TestRig();
        List(rig, Entry(TestRig.Sessions1, "idle", pid: null), Entry(TestRig.Sessions2, "idle", pid: null));
        rig.Hook("UserPromptSubmit", session: TestRig.Sessions2);   // S2 now has hooks and a watched process
        rig.Time.Advance(TimeSpan.FromSeconds(4));
        List(rig);
        Assert.Equal(SessionState.Ended, V(rig).State.Value);
        Assert.Equal(SessionState.Working, V(rig, TestRig.Sessions2).State.Value, "with hooks + a watched process, the exit watch decides");
    }

    [Test]
    public void A_failed_poll_means_nothing()
    {
        using var rig = new TestRig();
        List(rig, Entry(TestRig.Sessions1, "busy"));
        rig.Sessions.ApplyAgentList(new AgentListSnapshot([], rig.Time.GetUtcNow(), TimeSpan.FromSeconds(6), "", Ok: false));
        Assert.Equal(SessionState.Working, V(rig).State.Value);
    }

    [Test]
    public void Background_sessions_map_their_state()
    {
        using var rig = new TestRig();
        rig.Sessions.ApplyAgentList(new AgentListSnapshot(
        [
            new AgentListEntry { Id = "bg-1", Kind = "background", BackgroundState = "blocked", WaitingFor = "permission prompt", StartedAtMs = 1 },
            new AgentListEntry { Id = "bg-2", Kind = "background", BackgroundState = "failed", StartedAtMs = 2 },
            new AgentListEntry { Id = "bg-3", Kind = "background", BackgroundState = "working", StartedAtMs = 3 },
        ], rig.Time.GetUtcNow(), TimeSpan.FromSeconds(6), "", true));
        Assert.Equal(SessionState.NeedsPermission, V(rig, "bg-1").State.Value);
        Assert.Equal(SessionState.Error, V(rig, "bg-2").State.Value);
        Assert.Equal(SessionState.Working, V(rig, "bg-3").State.Value);
    }

    [Test]
    public void Slots_are_stable_pins_win_and_offline_slots_are_held_for_10_minutes()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", session: "s-a");
        rig.Hook("UserPromptSubmit", session: "s-b");
        rig.Hook("UserPromptSubmit", session: "s-c");
        Assert.Equal(2, V(rig, "s-b").Slot);
        rig.Hook("SessionEnd", session: "s-b");
        rig.Time.Advance(TimeSpan.FromMinutes(1));
        rig.Sessions.Tick();
        rig.Hook("UserPromptSubmit", session: "s-d");
        Assert.Equal(4, V(rig, "s-d").Slot, "slot 2 is still held for s-b");
        rig.Time.Advance(TimeSpan.FromMinutes(10));
        rig.Sessions.Tick();
        rig.Hook("UserPromptSubmit", session: "s-e");
        Assert.Equal(2, V(rig, "s-e").Slot, "released after 10 minutes offline");

        // Pin s-c to slot 3 → toggling again unpins.
        Assert.Equal(true, rig.Sessions.TogglePin(3));
        Assert.True(V(rig, "s-c").Pinned);
        Assert.Equal(false, rig.Sessions.TogglePin(3));
        Assert.Null(rig.Sessions.TogglePin(20), "an empty slot has nothing to pin");
    }

    [Test]
    public void A_resumed_session_returns_to_its_slot()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", session: "s-a");
        rig.Hook("UserPromptSubmit", session: "s-b");
        rig.Hook("SessionEnd", session: "s-b");
        rig.Time.Advance(TimeSpan.FromSeconds(40));
        rig.Sessions.Tick();   // s-b removed from the table, its slot held
        rig.Hook("SessionStart", session: "s-b", fields: new() { ["hook_event_name"] = "SessionStart", ["source"] = "resume" });
        Assert.Equal(2, V(rig, "s-b").Slot);
    }

    [Test]
    public void Next_needs_me_orders_permission_then_input_then_error_oldest_first()
    {
        using var rig = new TestRig();
        rig.Hook("StopFailure", session: "s-err", fields: new() { ["hook_event_name"] = "StopFailure", ["error"] = "overloaded" });
        rig.Time.Advance(TimeSpan.FromSeconds(1));
        rig.Hook("Notification", session: "s-input", fields: new() { ["hook_event_name"] = "Notification", ["notification_type"] = "elicitation_dialog" });
        rig.Time.Advance(TimeSpan.FromSeconds(1));
        rig.Hook("PermissionRequest", session: "s-perm-new");
        rig.Time.Advance(TimeSpan.FromSeconds(1));
        rig.Hook("UserPromptSubmit", session: "s-work");
        Assert.Equal("s-perm-new", rig.Sessions.NextNeedsMe(PrivacyMode.Private)!.Key.Id);
        rig.Hook("PostToolUse", session: "s-perm-new");
        Assert.Equal("s-input", rig.Sessions.NextNeedsMe(PrivacyMode.Private)!.Key.Id);
        rig.Hook("ElicitationResult", session: "s-input");
        Assert.Equal("s-err", rig.Sessions.NextNeedsMe(PrivacyMode.Private)!.Key.Id);
    }

    [Test]
    public void Transitions_report_into_needs_you()
    {
        using var rig = new TestRig();
        var seen = new List<SessionTransition>();
        rig.Sessions.Changed += u => seen.AddRange(u.Transitions);
        rig.Hook("UserPromptSubmit");
        rig.Hook("PermissionRequest");
        rig.Hook("Notification", fields: new() { ["hook_event_name"] = "Notification", ["notification_type"] = "permission_prompt" });
        Assert.Equal(1, seen.Count(t => t.IntoNeedsYou), "a confirming notification is not a second alert");
    }

    [Test]
    public void Orca_only_enriches_and_never_creates_or_changes_state()
    {
        using var rig = new TestRig();
        var ps = OrcaParser.ParseWorktrees(File.ReadAllText(TempDirs.Fixture("orca-worktree-ps.json")))!;
        var terms = OrcaParser.ParseTerminals(File.ReadAllText(TempDirs.Fixture("orca-terminal-list.json")))!;
        rig.Sessions.ApplyOrca(new OrcaSnapshot(ps, terms, rig.Time.GetUtcNow()));
        Assert.Empty(rig.Sessions.Snapshot(PrivacyMode.Private), "Orca never creates a session");

        // A hook event carrying the relay's ORCA_PANE_KEY joins exactly.
        var json = TestRig.EventJson("UserPromptSubmit", TestRig.Sessions1, agentProcess: rig.Agent,
            env: new() { ["ORCA_PANE_KEY"] = "tab-1:leaf-1", ["ORCA_WORKTREE_ID"] = "wt-aurora" });
        rig.Sessions.ApplyHook(Ingress.HookEventParser.TryParseEvent(json, rig.Time.GetUtcNow(), out _)!, true);
        rig.Sessions.ApplyOrca(new OrcaSnapshot(ps, terms, rig.Time.GetUtcNow()));
        var v = V(rig);
        Assert.Equal("term_aaa111", v.Orca?.TerminalHandle);
        Assert.Equal(Confidence.Observed, v.Orca!.Confidence);
        Assert.Equal(SessionState.Working, v.State.Value);
        Assert.Equal(FactSource.Hook, v.State.Source, "Orca's 'working' never becomes the state");
    }

    [Test]
    public void Orca_cwd_join_is_inferred_and_only_when_unique()
    {
        using var rig = new TestRig();
        List(rig, Entry(TestRig.Sessions1, "busy", cwd: @"C:\Users\example\projects\aurora"));
        var ps = OrcaParser.ParseWorktrees(File.ReadAllText(TempDirs.Fixture("orca-worktree-ps.json")))!;
        var terms = OrcaParser.ParseTerminals(File.ReadAllText(TempDirs.Fixture("orca-terminal-list.json")))!;
        rig.Sessions.ApplyOrca(new OrcaSnapshot(ps, terms, rig.Time.GetUtcNow()));
        Assert.Equal(Confidence.Inferred, V(rig).Orca?.Confidence);
        Assert.Equal("term_aaa111", V(rig).Orca?.TerminalHandle);

        using var rig2 = new TestRig();
        List(rig2, Entry("x1", "busy", cwd: @"C:\Users\example\projects\aurora"), Entry("x2", "busy", pid: 9, cwd: @"C:\Users\example\projects\aurora"));
        rig2.Sessions.ApplyOrca(new OrcaSnapshot(ps, terms, rig2.Time.GetUtcNow()));
        Assert.Null(rig2.Sessions.Find(new SessionKey(AgentKind.Claude, "x1"), PrivacyMode.Private)!.Orca, "two candidates: no guess");
    }

    [Test]
    public void Cwd_hash_matches_the_relay_and_git_bash_forms()
    {
        Assert.Equal(PrismControl.Desktop.CwdHash.Compute(@"C:\Users\example\projects\cassini"), Privacy.CwdHash("/c/Users/example/projects/cassini"));
        Assert.Equal(Privacy.CwdHash(@"C:\Users\Example\Projects\Cassini\"), Privacy.CwdHash(@"c:\users\example\projects\cassini"));
        Assert.Equal(16, Privacy.CwdHash(@"C:\")!.Length);
        Assert.Null(Privacy.CwdHash(""));
        Assert.Equal("cassini", Privacy.CwdName("/c/Users/example/projects/cassini/"));
    }
}
