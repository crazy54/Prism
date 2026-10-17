using PrismControl.Ai.Approvals;
using PrismControl.Ai.Hooks;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Sessions.Jump;
using PrismControl.Ai.Status;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai;

/// <summary>
/// Everything the AI actions share, registered once by <see cref="AiModule"/> (actions: <c>Services.Get&lt;AiServices&gt;()</c>).
/// Tests build one from fakes. Thread-safe members only.
/// </summary>
public sealed class AiServices
{
    private int _visibleActions;

    public required SessionTracker Sessions { get; init; }
    public required ApprovalBroker Approvals { get; init; }
    public required DeckPresence Presence { get; init; }
    public required AiSettingsService Settings { get; init; }
    public required Jumper Jumper { get; init; }
    public required HookInstaller Hooks { get; init; }
    public required AiStatusHub Status { get; init; }
    public required TimeProvider Time { get; init; }
    public required ILog Log { get; init; }
    public bool SafeMode { get; init; }
    public AiIngress? Ingress { get; init; }
    public AgentListPoller? AgentList { get; init; }
    public OrcaEnricher? Orca { get; init; }
    public RolloutTailer? Rollout { get; init; }

    public PrivacyMode Privacy => Settings.Current.Mode;

    /// <summary>True while any AI action is visible (the pollers run only then).</summary>
    public bool Demanded => Volatile.Read(ref _visibleActions) > 0;

    public void ActionAppeared()
    {
        if (Interlocked.Increment(ref _visibleActions) == 1) AgentList?.Nudge();
    }

    public void ActionDisappeared()
    {
        if (Interlocked.Decrement(ref _visibleActions) < 0) Interlocked.Exchange(ref _visibleActions, 0);
    }

    /// <summary>The newest request time seen (for "LAST 4M AGO" on an idle card).</summary>
    public DateTimeOffset? LastRequestAt { get; set; }
}
