using System.Text.Json.Nodes;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Every row of the hook state machine in research/ai-status.md §1.2 (Claude, Codex, Copilot, Gemini, Cursor).</summary>
public class StateMachineTests
{
    private static SessionView View(TestRig rig, AgentKind agent = AgentKind.Claude, string id = TestRig.Sessions1) =>
        Assert.NotNull(rig.Sessions.Find(new SessionKey(agent, id), PrivacyMode.Private));

    private static JsonObject F(string name, params (string Key, JsonNode? Value)[] extra)
    {
        var o = new JsonObject { ["hook_event_name"] = name, ["session_id"] = TestRig.Sessions1, ["permission_mode"] = "default" };
        foreach (var (k, v) in extra) o[k] = v;
        return o;
    }

    [Test]
    public void Claude_turn_lifecycle()
    {
        using var rig = new TestRig();
        rig.Hook("SessionStart", fields: F("SessionStart", ("source", "startup"), ("model", "example-model")));
        Assert.Equal(SessionState.Idle, View(rig).State.Value);
        Assert.Equal(Confidence.Observed, View(rig).State.Confidence);
        Assert.Equal(FactSource.Hook, View(rig).State.Source);

        rig.Hook("UserPromptSubmit");
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        var turnStart = View(rig).Since.Value;

        rig.Time.Advance(TimeSpan.FromSeconds(5));
        rig.Hook("PreToolUse", fields: F("PreToolUse", ("tool_name", "Bash")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        Assert.Equal(ToolCategory.Bash, View(rig).Tool.Value);
        Assert.Equal(turnStart, View(rig).Since.Value, "a tool call does not restart the turn clock");

        rig.Hook("PermissionRequest", fields: F("PermissionRequest", ("tool_name", "Bash")));
        Assert.Equal(SessionState.NeedsPermission, View(rig).State.Value);
        Assert.Equal(rig.Time.GetUtcNow(), View(rig).Since.Value, "pendingSince = now");

        rig.Hook("PostToolUse", fields: F("PostToolUse", ("tool_name", "Bash")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);

        rig.Hook("Stop");
        Assert.Equal(SessionState.Done, View(rig).State.Value);

        rig.Hook("SessionEnd", fields: F("SessionEnd", ("reason", "prompt_input_exit")));
        Assert.Equal(SessionState.Ended, View(rig).State.Value);
    }

    [Test]
    public void Ask_and_plan_tools_need_input()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Hook("PreToolUse", fields: F("PreToolUse", ("tool_name", "AskUserQuestion")));
        Assert.Equal(SessionState.NeedsInput, View(rig).State.Value);
        rig.Hook("PostToolUse", fields: F("PostToolUse", ("tool_name", "AskUserQuestion")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        rig.Hook("PreToolUse", fields: F("PreToolUse", ("tool_name", "ExitPlanMode")));
        Assert.Equal(SessionState.NeedsInput, View(rig).State.Value);
    }

    [Test]
    public void Interrupted_tool_failure_is_done_and_plain_failure_keeps_working()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Hook("PostToolUseFailure", fields: F("PostToolUseFailure", ("tool_name", "Bash"), ("is_interrupt", false), ("error_category", "failed")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        rig.Hook("PostToolUseFailure", fields: F("PostToolUseFailure", ("tool_name", "Bash"), ("is_interrupt", true)));
        Assert.Equal(SessionState.Done, View(rig).State.Value);
    }

    [Test]
    public void Permission_denied_in_auto_mode_returns_to_working()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest", fields: F("PermissionRequest", ("tool_name", "Edit")));
        rig.Hook("PermissionDenied", fields: F("PermissionDenied", ("tool_name", "Edit")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);
    }

    [Test]
    public void Notifications_map_to_states()
    {
        using var rig = new TestRig();
        (string Type, SessionState Expected)[] cases =
        [
            ("permission_prompt", SessionState.NeedsPermission),
            ("idle_prompt", SessionState.Done),
            ("elicitation_dialog", SessionState.NeedsInput),
            ("elicitation_complete", SessionState.Working),
            ("elicitation_url_dialog", SessionState.NeedsInput),
            ("elicitation_response", SessionState.Working),
            ("agent_needs_input", SessionState.NeedsInput),
            ("agent_completed", SessionState.Done),
        ];
        foreach (var (type, expected) in cases)
        {
            rig.Hook("Notification", fields: F("Notification", ("notification_type", type)));
            Assert.Equal(expected, View(rig).State.Value, type);
        }
        rig.Hook("Notification", fields: F("Notification", ("notification_type", "auth_success")));
        Assert.Equal(SessionState.Done, View(rig).State.Value, "an unrelated notification changes nothing");
    }

    [Test]
    public void Stop_failure_is_an_error_with_its_kind()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Hook("StopFailure", fields: F("StopFailure", ("error", "rate_limit")));
        Assert.Equal(SessionState.Error, View(rig).State.Value);
        Assert.Equal("rate_limit", View(rig).ErrorKind);
        rig.Hook("UserPromptSubmit");
        Assert.Null(View(rig).ErrorKind, "the error clears with the next turn");
    }

    [Test]
    public void Stop_failure_drops_a_non_enum_error()
    {
        using var rig = new TestRig();
        rig.Hook("StopFailure", fields: F("StopFailure", ("error", "Rate limit hit for org EXAMPLE-ORG at 12:00")));
        Assert.Equal("error", View(rig).ErrorKind, "free text never crosses: only an enum token is kept");
    }

    [Test]
    public void Subagents_count_without_changing_the_state()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Hook("SubagentStart", fields: F("SubagentStart", ("agent_id", "agent-1"), ("agent_type", "general-purpose")));
        rig.Hook("SubagentStart", fields: F("SubagentStart", ("agent_id", "agent-2")));
        Assert.Equal(2, View(rig).Subagents.Value);
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        rig.Hook("SubagentStop", fields: F("SubagentStop", ("agent_id", "agent-1")));
        rig.Hook("SubagentStop", fields: F("SubagentStop", ("agent_id", "agent-2")));
        rig.Hook("SubagentStop", fields: F("SubagentStop", ("agent_id", "agent-3")));
        Assert.Equal(0, View(rig).Subagents.Value, "never negative");
        Assert.Single(rig.Sessions.Snapshot(PrivacyMode.Private), "subagents roll up into the parent: never a session of their own");
    }

    [Test]
    public void Compaction_returns_to_where_it_started()
    {
        using var rig = new TestRig();
        rig.Hook("Stop");
        rig.Hook("PreCompact");
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        Assert.Equal(ToolCategory.Compact, View(rig).Tool.Value);
        rig.Hook("PostCompact");
        Assert.Equal(SessionState.Done, View(rig).State.Value, "a manual /compact at rest returns to rest");

        rig.Hook("UserPromptSubmit");
        rig.Hook("PreCompact");
        rig.Hook("PostCompact");
        Assert.Equal(SessionState.Working, View(rig).State.Value, "an auto-compaction mid-turn keeps working");
    }

    [Test]
    public void Session_start_resume_keeps_the_state_and_startup_resets_it()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit");
        rig.Hook("SessionStart", fields: F("SessionStart", ("source", "resume")));
        Assert.Equal(SessionState.Working, View(rig).State.Value);
        rig.Hook("SessionStart", fields: F("SessionStart", ("source", "startup")));
        Assert.Equal(SessionState.Idle, View(rig).State.Value);
    }

    [Test]
    public void Codex_events_including_interrupt()
    {
        using var rig = new TestRig();
        rig.Hook("SessionStart", agent: "codex");
        var key = new SessionKey(AgentKind.Codex, TestRig.Sessions1);
        SessionState S() => rig.Sessions.Find(key, PrivacyMode.Private)!.State.Value;
        Assert.Equal(SessionState.Idle, S());
        rig.Hook("UserPromptSubmit", agent: "codex");
        Assert.Equal(SessionState.Working, S());
        rig.Hook("PermissionRequest", agent: "codex", fields: F("PermissionRequest", ("tool_name", "shell")));
        Assert.Equal(SessionState.NeedsPermission, S());
        rig.Hook("PostToolUse", agent: "codex", fields: F("PostToolUse", ("tool_name", "shell")));
        Assert.Equal(SessionState.Working, S());
        rig.Hook("Interrupt", agent: "codex");
        Assert.Equal(SessionState.Done, S());
        rig.Hook("SessionEnd", agent: "codex");
        Assert.Equal(SessionState.Ended, S());
    }

    [Test]
    public void Copilot_gemini_and_cursor_event_names_normalize()
    {
        Assert.Equal(HookKind.UserPromptSubmit, HookEventParser.KindOf("userPromptSubmitted"));
        Assert.Equal(HookKind.PreToolUse, HookEventParser.KindOf("preToolUse"));
        Assert.Equal(HookKind.PermissionRequest, HookEventParser.KindOf("permissionRequest"));
        Assert.Equal(HookKind.Stop, HookEventParser.KindOf("agentStop"));
        Assert.Equal(HookKind.StopFailure, HookEventParser.KindOf("errorOccurred"));
        Assert.Equal(HookKind.UserPromptSubmit, HookEventParser.KindOf("BeforeAgent"));
        Assert.Equal(HookKind.PreToolUse, HookEventParser.KindOf("BeforeTool"));
        Assert.Equal(HookKind.Stop, HookEventParser.KindOf("AfterAgent"));
        Assert.Equal(HookKind.UserPromptSubmit, HookEventParser.KindOf("beforeSubmitPrompt"));
        Assert.Equal(HookKind.Stop, HookEventParser.KindOf("stop"));
        Assert.Equal("permission_prompt", HookEventParser.NormalizeNotification("ToolPermission"));
        Assert.Equal("idle_prompt", HookEventParser.NormalizeNotification("agent_idle"));
        Assert.Equal(HookKind.Unknown, HookEventParser.KindOf("DeleteEverything"));
    }

    [Test]
    public void Gemini_tool_permission_is_observe_only()
    {
        using var rig = new TestRig();
        var e = rig.Event("Notification", TestRig.Sessions1, agent: "claude", tool: "gemini",
            fields: F("Notification", ("notification_type", "ToolPermission")));
        rig.Sessions.ApplyHook(e, true);
        Assert.Equal(SessionState.NeedsPermission, rig.Sessions.Find(new SessionKey(AgentKind.Gemini, TestRig.Sessions1), PrivacyMode.Private)!.State.Value);
        Assert.False(e.CanBeDecided, "a Gemini permission prompt can never be decided from the deck");
    }

    [Test]
    public void Cross_talk_events_are_filed_under_the_real_tool()
    {
        using var rig = new TestRig();
        // Cursor imports Claude's user hooks: the relay tags tool=cursor, origin cursor-via-claude-hooks.
        var e = rig.Event("PreToolUse", "cursor-conv-1", agent: "claude", tool: "cursor", fields: F("PreToolUse", ("tool_name", "Shell")));
        Assert.True(e.IsCrossTalk);
        Assert.Equal("cursor-via-claude-hooks", e.Origin);
        rig.Sessions.ApplyHook(e, true);
        var v = Assert.NotNull(rig.Sessions.Find(new SessionKey(AgentKind.Cursor, "cursor-conv-1"), PrivacyMode.Private));
        Assert.Equal("cursor-via-claude-hooks", v.Origin);
        Assert.Null(rig.Sessions.Find(new SessionKey(AgentKind.Claude, "cursor-conv-1"), PrivacyMode.Private), "never filed under Claude");

        var p = rig.Event("PermissionRequest", "copilot-1", agent: "claude", tool: "copilot");
        Assert.False(p.CanBeDecided, "cross-talk permission requests are never held");
    }

    [Test]
    public void Origin_tag_is_recomputed_not_trusted()
    {
        var json = TestRig.EventJson("Stop", TestRig.Sessions1, agent: "claude", tool: "cursor");
        json["origin"] = "claude";   // a lying relay
        var e = Assert.NotNull(HookEventParser.TryParseEvent(json, DateTimeOffset.UtcNow, out _));
        Assert.Equal("cursor-via-claude-hooks", e.Origin);
    }
}
