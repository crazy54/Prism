using PrismControl.Ai.Ingress;
using PrismControl.Ai.Status;

namespace PrismControl.Ai.Sessions;

/// <summary>
/// The hook-derived state machine (research/ai-status.md §1.2), shared by Claude Code, Codex, Copilot CLI, Gemini CLI and
/// Cursor after <see cref="HookEventParser"/> normalized their event names. Every hook fact is <see cref="Confidence.Observed"/>.
/// <code>
///  SessionStart(startup|clear) → idle        SessionStart(resume|compact) → keep
///  UserPromptSubmit → working (turn starts)  PreToolUse → working(tool); AskUserQuestion/ExitPlanMode → needsInput
///  PermissionRequest → needsPermission       PermissionDenied, PostToolUse → working
///  PostToolUseFailure → working; is_interrupt → done (the user aborted)
///  Notification permission_prompt → needsPermission · idle_prompt / agent_completed → done
///               elicitation_dialog / elicitation_url_dialog / agent_needs_input → needsInput
///               elicitation_complete / elicitation_response → working
///  Elicitation → needsInput   ElicitationResult → working
///  Stop → done   Interrupt (Codex) → done   StopFailure(error) → error(kind)
///  SubagentStart/Stop → subagents ±1 (state unchanged)
///  PreCompact → working(compact)   PostCompact → back to idle/done if the compaction started there, else working
///  SessionEnd → ended (removed after 30 s)
/// </code>
/// Blind spots (Esc mid-turn: no Stop; a permission denied in the terminal: no PostToolUse) are closed by the agent list
/// and the timeouts in <see cref="SessionTracker"/>.
/// </summary>
internal static class HookStateMachine
{
    /// <summary>
    /// Events that end a pending permission request (review M4): while Prism holds a request for the session, NeedsPermission is
    /// sticky until one of these arrives (a parallel or late PreToolUse, a Notification, an Elicitation never clear it).
    /// </summary>
    internal static bool EndsPermission(HookKind k, string? source) => k switch
    {
        HookKind.PostToolUse or HookKind.PostToolUseFailure or HookKind.PermissionDenied or HookKind.PermissionRequest or HookKind.Stop
            or HookKind.StopFailure or HookKind.SessionEnd or HookKind.Interrupt or HookKind.UserPromptSubmit => true,
        HookKind.SessionStart => source is null or "startup" or "clear",
        _ => false,
    };

    /// <param name="stale">The event is older than the newest one applied to this session (review M4): only the subagent count,
    /// which is order-independent, still changes.</param>
    public static void Apply(SessionRecord r, HookEvent e, bool created, SessionTracker t, List<SessionTransition> tr, bool stale = false)
    {
        var at = e.At;
        void Set(SessionState s) => t.SetState(r, s, Confidence.Observed, FactSource.Hook, at, TimeSpan.Zero, tr);
        void Tool(ToolCategory c) => r.Tool = Fact<ToolCategory>.Observed(c, FactSource.Hook, at, TimeSpan.Zero);

        var sticky = r.PendingRequestId is not null && r.State.Value == SessionState.NeedsPermission && !EndsPermission(e.Kind, e.Fields.Source);
        if (stale || sticky)
        {
            if (e.Kind == HookKind.SubagentStart) r.Subagents++;
            else if (e.Kind == HookKind.SubagentStop) r.Subagents = Math.Max(0, r.Subagents - 1);
            if (r.Created) Set(SessionState.Idle);
            return;
        }

        switch (e.Kind)
        {
            case HookKind.SessionStart:
                if (created || e.Fields.Source is null or "startup" or "clear")
                {
                    Set(SessionState.Idle);
                    Tool(ToolCategory.None);
                    r.Subagents = 0;
                }
                break;

            case HookKind.UserPromptSubmit:
                Set(SessionState.Working);
                Tool(ToolCategory.None);
                break;

            case HookKind.PreToolUse:
            {
                var cat = SessionStates.Categorize(e.Fields.ToolName, e.Fields.McpServer);
                Tool(cat);
                Set(cat is ToolCategory.Ask or ToolCategory.Plan ? SessionState.NeedsInput : SessionState.Working);
                break;
            }

            case HookKind.PermissionRequest:
                Tool(SessionStates.Categorize(e.Fields.ToolName, e.Fields.McpServer));
                Set(SessionState.NeedsPermission);
                break;

            case HookKind.PermissionDenied:
            case HookKind.PostToolUse:
            case HookKind.ElicitationResult:
                Set(SessionState.Working);
                break;

            case HookKind.PostToolUseFailure:
                Set(e.Fields.IsInterrupt == true ? SessionState.Done : SessionState.Working);
                break;

            case HookKind.Notification:
                switch (HookEventParser.NormalizeNotification(e.Fields.NotificationType))
                {
                    case "permission_prompt":
                        Set(SessionState.NeedsPermission);
                        break;
                    case "idle_prompt":
                    case "agent_completed":
                        Set(SessionState.Done);
                        break;
                    case "elicitation_dialog":
                    case "elicitation_url_dialog":
                    case "agent_needs_input":
                        Set(SessionState.NeedsInput);
                        break;
                    case "elicitation_complete":
                    case "elicitation_response":
                        Set(SessionState.Working);
                        break;
                    // Other notification types (auth_success, …) change nothing.
                }
                break;

            case HookKind.Elicitation:
                Set(SessionState.NeedsInput);
                break;

            case HookKind.Stop:
            case HookKind.Interrupt:
                Set(SessionState.Done);
                Tool(ToolCategory.None);
                break;

            case HookKind.StopFailure:
                Set(SessionState.Error);
                r.ErrorKind = e.Fields.Error ?? "error";
                break;

            case HookKind.SubagentStart:
                r.Subagents++;
                if (created) Set(SessionState.Working);
                break;

            case HookKind.SubagentStop:
                r.Subagents = Math.Max(0, r.Subagents - 1);
                break;

            case HookKind.PreCompact:
                r.BeforeCompact = r.State.Value;
                Tool(ToolCategory.Compact);
                Set(SessionState.Working);
                break;

            case HookKind.PostCompact:
                Tool(ToolCategory.None);
                Set(r.BeforeCompact is SessionState.Idle or SessionState.Done ? r.BeforeCompact.Value : SessionState.Working);
                r.BeforeCompact = null;
                break;

            case HookKind.SessionEnd:
                Set(SessionState.Ended);
                break;

            default:
                // Known but stateless (TeammateIdle, ConfigChange, …): a signal only. A brand-new record starts idle.
                if (created) Set(SessionState.Idle);
                break;
        }
        // A record created by a stateless event (or SubagentStop) still needs a state.
        if (r.Created) Set(SessionState.Idle);
    }
}
