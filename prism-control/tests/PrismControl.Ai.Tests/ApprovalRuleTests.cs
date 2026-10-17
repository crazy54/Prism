using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Approvals;
using PrismControl.Ai.Hooks;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>A Galleon (or Plus) with the approval surfaces placed, sharing one rig and one manual clock.</summary>
public sealed class Deck : IAsyncDisposable
{
    public required TestRig Rig { get; init; }
    public required ActionHarness<ApproveKeyAction> Approve { get; init; }
    public ActionHarness<RequestCardAction>? Card { get; init; }
    public required ActionHarness<DenyKeyAction> Deny { get; init; }

    public static async Task<Deck> OnAsync(TestRig rig, DeviceInfo? device = null, bool card = true, Controller cardController = Controller.Encoder,
        bool approveInMultiAction = false)
    {
        var dev = device ?? TestDevices.Galleon;
        return new Deck
        {
            Rig = rig,
            Approve = await rig.AppearAsync<ApproveKeyAction>(dev, new(1, 2), context: "ctx-approve", inMultiAction: approveInMultiAction),
            Deny = await rig.AppearAsync<DenyKeyAction>(dev, new(2, 2), context: "ctx-deny"),
            Card = card ? await rig.AppearAsync<RequestCardAction>(dev, cardController == Controller.Encoder ? new(1, 0) : new(0, 2), cardController, context: "ctx-card") : null,
        };
    }

    /// <summary>A known, verified Claude (or Codex) session asks permission; the relay reveals the summary.</summary>
    public async Task<(string Id, Task<ApprovalDecision> Decision, HoldOffer Offer)> RequestAsync(string session = TestRig.Sessions1, string agent = "claude",
        string? command = "npm test", bool known = true, string tool = "Bash", int? agentPid = null)
    {
        if (known) Rig.Hook("SessionStart", session, agent);
        var e = Rig.Event("PermissionRequest", session, agent, fields: new() { ["tool_name"] = tool, ["permission_mode"] = "default" },
            edit: agentPid is { } pid ? j => j["agentProcess"]!["pid"] = pid : null);
        var isKnown = known && Rig.Sessions.IsKnownLive(new SessionKey(e.Tool, session), e.AgentProcess);
        Rig.Sessions.ApplyHook(e, processVerified: known);
        var offer = Rig.Broker.Offer(e, isKnown);
        if (!offer.Hold) return ("", Task.FromResult(ApprovalDecision.NoDecision), offer);
        if (offer.Reveal && command is not null)
            Rig.Broker.AttachSummary(offer.RequestId!, TestRig.Reveal(tool, command));
        await SettleAsync();
        return (offer.RequestId!, offer.Decision, offer);
    }

    public async Task SettleAsync()
    {
        if (Card is not null) await Card.SettleAsync();
        await Approve.SettleAsync();
        await Deny.SettleAsync();
        if (Card is not null) await Card.SettleAsync();
    }

    /// <summary>
    /// Lets the details sit on screen (≥ 600 ms after the frame reached the deck: the report + 200 ms allowance, review L4) before
    /// the user acts; every surface's mailbox is settled after.
    /// </summary>
    public async Task ReadAsync(TimeSpan? t = null)
    {
        await Approve.AdvanceAsync(t ?? TimeSpan.FromMilliseconds(900));
        await SettleAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (Card is not null) await Card.DisposeAsync();
        await Approve.DisposeAsync();
        await Deny.DisposeAsync();
        Rig.Dispose();
    }
}

/// <summary>ai-apps.md §6, one or more tests per rule. "Never auto-approve from anything but a physical keyDown hold."</summary>
public class ApprovalRuleTests
{
    private static ApprovalDecision? Done(Task<ApprovalDecision> t) => t.IsCompletedSuccessfully ? t.Result : null;

    // ---------------------------------------------------------------- 6.1 never auto-approve

    [Test]
    public async Task R6_1_only_a_held_approve_key_allows()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, decision, offer) = await deck.RequestAsync();
        Assert.True(offer.Hold);
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(DecisionKind.Allow, Done(decision)?.Kind, "fires at the threshold while still held");
        await deck.Approve.KeyUpAsync();
        Assert.Equal(1, deck.Approve.Count("showOk"));
        deck.Approve.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task R6_1_silence_never_allows()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, decision, _) = await deck.RequestAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(60));
        Assert.Equal(DecisionKind.None, Done(decision)?.Kind, "a timeout is never a yes");
    }

    [Test]
    public async Task R6_1_dials_and_touch_never_allow()
    {
        foreach (var device in new[] { TestDevices.Galleon, TestDevices.Plus })
        {
            await using var deck = await Deck.OnAsync(new TestRig(), device);
            var (_, decision, _) = await deck.RequestAsync();
            await deck.ReadAsync();
            await deck.Card!.RotateAsync(+12);
            await deck.Card.RotateAsync(-1);
            await deck.Card.DialPressAsync(TimeSpan.FromSeconds(3));   // a long Galleon "hold" is still a press
            if (device.Capabilities.HasTouchStrip) await deck.Card.TapAsync(100, 50, hold: true);
            Assert.NotEqual(DecisionKind.Allow, Done(decision)?.Kind ?? DecisionKind.None);
            Assert.Equal(DecisionKind.None, Done(decision)?.Kind, "a push is 'review in terminal': no decision, the agent's prompt appears");
            deck.Card.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task R6_1_a_multi_action_approve_key_never_allows_and_never_enables_a_hold()
    {
        await using var deck = await Deck.OnAsync(new TestRig(), approveInMultiAction: true);
        var (_, decision, offer) = await deck.RequestAsync();
        Assert.False(offer.Hold, "a multi-action copy is not a visible approve key: no hold at all");
        // Even if a request is held for another reason (a real approve key elsewhere), the multi-action copy refuses.
        deck.Rig.Presence.Register("real-approve", SurfaceKind.Approve, TestRig.Device, inMultiAction: false);
        var (_, d2, o2) = await deck.RequestAsync(TestRig.Sessions2);
        Assert.True(o2.Hold);
        await deck.ReadAsync();
        var (ticket, block) = deck.Rig.Broker.BeginApproveHold("ctx-approve", TestRig.Device, inMultiAction: true);
        Assert.Null(ticket);
        Assert.Equal(ApproveBlock.MultiAction, block);
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(3));
        Assert.Null(Done(d2));
        _ = decision;
    }

    [Test]
    public async Task R6_1_pi_messages_and_deep_links_never_allow()
    {
        var rig = new TestRig();
        var events = new FakePluginEvents();
        rig.Presence.Attach(events);
        await using var deck = await Deck.OnAsync(rig);
        var (_, decision, _) = await deck.RequestAsync();
        await deck.ReadAsync();
        foreach (var type in new[] { "approve", "allow", "decision", "hooks.apply", "pi.approve", "ai.allow" })
        {
            await deck.Approve.PiMessageAsync(type, new { requestId = deck.Rig.Broker.Selected()!.Id, decision = "allow", token = "x" }, requestId: 1);
            await deck.Card!.PiMessageAsync(type, new { decision = "allow" }, requestId: 2);
            await deck.Deny.PiMessageAsync(type, new { decision = "allow" }, requestId: 3);
        }
        events.RaiseDeepLink("streamdeck://plugins/message/com.jeremyfhall.prismcontrol/ai/approve");
        await deck.SettleAsync();
        Assert.Null(Done(decision), "still pending");
        Assert.Equal(1, deck.Rig.Broker.PendingCount);
    }

    [Test]
    public void R6_1_structurally_only_the_approve_key_reaches_the_allow_path()
    {
        var asm = typeof(ApprovalBroker).Assembly;
        var begin = typeof(ApprovalBroker).GetMethod(nameof(ApprovalBroker.BeginApproveHold))!;
        var complete = typeof(ApprovalBroker).GetMethod(nameof(ApprovalBroker.CompleteApproveHold))!;
        Assert.Equal(typeof(ApproveKeyAction), Assert.Single(IlScan.CallersOf(asm, begin)));
        Assert.Equal(typeof(ApproveKeyAction), Assert.Single(IlScan.CallersOf(asm, complete)));
        // The broker has no approve-all and no permission writes: its only allow is inside CompleteApproveHold.
        var publicSurface = typeof(ApprovalBroker).GetMethods().Select(m => m.Name).ToHashSet();
        foreach (var forbidden in new[] { "ApproveAll", "AllowAll", "Allow", "Approve", "AlwaysAllow", "Decide", "SetDecision" })
            Assert.False(publicSurface.Contains(forbidden), forbidden);
        // Deep links: nothing in the module subscribes to them.
        var deepLink = typeof(IPluginEvents).GetEvent(nameof(IPluginEvents.DeepLinkReceived))!.GetAddMethod()!;
        Assert.Empty(IlScan.CallersOf(asm, deepLink));
    }

    [Test]
    public void R6_1_decision_frames_carry_no_permission_writes()
    {
        var allow = new ApprovalDecision(DecisionKind.Allow).ToFrame();
        Assert.Equal("{\"decision\":\"allow\"}", allow.ToJsonString());
        var deny = new ApprovalDecision(DecisionKind.Deny, ApprovalDecision.DeniedMessage, Interrupt: true).ToFrame();
        Assert.Equal("{\"decision\":\"deny\",\"message\":\"Denied from Stream Deck\",\"interrupt\":true}", deny.ToJsonString());
        Assert.Equal("{\"decision\":\"none\"}", ApprovalDecision.NoDecision.ToFrame().ToJsonString());
        foreach (var f in new[] { allow, deny })
        {
            Assert.False(f.ContainsKey("updatedPermissions"));
            Assert.False(f.ContainsKey("updatedInput"));
        }
    }

    // ---------------------------------------------------------------- 6.2 hold-to-approve

    [Test]
    public async Task R6_2_releasing_early_cancels()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, decision, _) = await deck.RequestAsync();
        await deck.ReadAsync();
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(1.1));
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(decision), "released at 1.1 s of 1.2 s: nothing");
        Assert.Equal(1, deck.Rig.Broker.PendingCount);
    }

    [Test]
    public async Task R6_2_the_hold_is_configurable_and_clamped()
    {
        Assert.Equal(TimeSpan.FromSeconds(1.2), new AiSettings().HoldDuration);
        Assert.Equal(TimeSpan.FromSeconds(0.8), new AiSettings { ApproveHoldSeconds = 0.1 }.HoldDuration);
        Assert.Equal(TimeSpan.FromSeconds(3), new AiSettings { ApproveHoldSeconds = 9 }.HoldDuration);
        Assert.Equal(TimeSpan.FromSeconds(1.2), new AiSettings { ApproveHoldSeconds = double.NaN }.HoldDuration);

        await using var deck = await Deck.OnAsync(new TestRig(settings: new AiSettings { Privacy = "reveal", ApproveHoldSeconds = 2.5 }));
        var (_, decision, _) = await deck.RequestAsync();
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(2.4));
        Assert.Null(Done(decision));
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(0.1));
        Assert.Equal(DecisionKind.Allow, Done(decision)?.Kind);
    }

    [Test]
    public async Task R6_2_progress_ring_renders_at_interactive_rate_at_most()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        await deck.RequestAsync();
        await deck.ReadAsync();
        var before = deck.Approve.Count("setImage");
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.1));
        var frames = deck.Approve.Count("setImage") - before;
        Assert.True(frames >= 10, $"the ring animates ({frames} frames)");
        Assert.True(frames <= 1.1 * 30 + 4, $"≤ 30 Hz ({frames} frames in 1.1 s)");
        deck.Approve.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task R6_2_a_new_request_during_the_hold_never_takes_the_shown_ones_place()
    {
        // Review L13: a new request that does not change what is shown (the selection stays) no longer voids the hold; the
        // gesture still binds to the request shown at keyDown and nothing else is ever decided by it.
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(0.5));
        var (_, d2, _) = await deck.RequestAsync(TestRig.Sessions2, command: "git push", agentPid: 4343);
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1));
        await deck.Approve.KeyUpAsync();
        Assert.Equal(DecisionKind.Allow, Done(d1)?.Kind, "the request that was shown at keyDown");
        Assert.Null(Done(d2), "the new one is never decided by a press that began before it");
    }

    [Test]
    public async Task R6_2_a_dial_turn_during_the_hold_aborts_it()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        var (_, d2, _) = await deck.RequestAsync(TestRig.Sessions2, command: "git push");
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(0.5));
        await deck.Card!.RotateAsync(+1);
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.Null(Done(d1));
        Assert.Null(Done(d2));
    }

    [Test]
    public async Task R6_2_an_expiry_during_the_hold_aborts_it()
    {
        await using var deck = await Deck.OnAsync(new TestRig(settings: new AiSettings { Privacy = "reveal", RequestWindowSeconds = 10 }));
        var (_, d1, _) = await deck.RequestAsync();
        await deck.ReadAsync(TimeSpan.FromSeconds(8.7));
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.2));   // the deadline (9.5 s) passes mid-hold
        Assert.Equal(DecisionKind.None, Done(d1)?.Kind);
    }

    [Test]
    public async Task R6_2_a_privacy_switch_during_the_hold_aborts_it()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(0.4));
        deck.Rig.Update(s => s.OnAir = true);
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.Null(Done(d1));
    }

    [Test]
    public async Task R6_2_anti_pop_under_600_ms()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.ReadAsync(TimeSpan.FromMilliseconds(500));   // a request that just popped under the finger
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(3));
        await deck.Approve.KeyUpAsync();
        Assert.Null(Done(d1), "a press that began before 600 ms of visibility never approves, however long");
        await deck.Approve.KeyDownAsync();   // a fresh press after reading
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(DecisionKind.Allow, Done(d1)?.Kind);
    }

    [Test]
    public async Task R6_2_exactly_600_ms_after_the_frame_reached_the_deck_is_enough()
    {
        // Review L4: the card reports what it shows when it ENQUEUES the frame; 600 ms count from 200 ms later.
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.ReadAsync(ApprovalBroker.MinVisible + ApprovalBroker.DisplayLatency - TimeSpan.FromMilliseconds(1));
        Assert.Equal(ApproveBlock.TooSoon, deck.Rig.Broker.ApproveState(TestDevices.Galleon.Id));
        await deck.ReadAsync(TimeSpan.FromMilliseconds(1));
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(DecisionKind.Allow, Done(d1)?.Kind);
    }

    // ---------------------------------------------------------------- 6.3 informed

    [Test]
    public async Task R6_3_no_details_on_this_device_no_approve()
    {
        var rig = new TestRig();
        await using var deck = await Deck.OnAsync(rig, card: false);
        // A card on another device does not count: details must be on the deck the approve key is on.
        await using var plusCard = await rig.AppearAsync<RequestCardAction>(TestDevices.Plus, new(0, 0), Controller.Encoder, context: "ctx-plus-card");
        rig.Presence.Register("ctx-approve-plus", SurfaceKind.Approve, TestDevices.Plus.Id, false);
        var (_, d1, offer) = await deck.RequestAsync();
        Assert.True(offer.Hold, "the Plus has approve + details");
        await plusCard.SettleAsync();
        await deck.ReadAsync();
        Assert.Equal(ApproveBlock.DetailsHidden, rig.Broker.ApproveState(TestDevices.Galleon.Id));
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(d1));
    }

    [Test]
    public async Task R6_3_private_mode_disables_approve_and_deny_still_works()
    {
        await using var deck = await Deck.OnAsync(new TestRig(settings: new AiSettings { Privacy = "private", DenyOnlyInPrivate = true }));
        var (_, d1, offer) = await deck.RequestAsync();
        Assert.True(offer.Hold);
        Assert.False(offer.Reveal, "private: the command never crosses the process boundary");
        Assert.Null(deck.Rig.Broker.Selected()!.Summary);
        using var text = Art.AiText.Record();
        await deck.ReadAsync();
        Assert.Equal(ApproveBlock.PrivateMode, deck.Rig.Broker.ApproveState(TestDevices.Galleon.Id));
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(d1));
        Assert.True(text.Has("DETAILS HIDDEN"), text.All);
        Assert.Equal("", deck.Card!.FeedbackText("line1"), "no command in the native text either");
        await deck.Deny.PressAsync();
        Assert.Equal(DecisionKind.Deny, Done(d1)?.Kind);
        Assert.Equal(ApprovalDecision.DeniedMessage, Done(d1)?.Message);
    }

    [Test]
    public async Task R6_3_an_unknown_session_is_red_and_cannot_be_approved()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, offer) = await deck.RequestAsync(known: false);
        Assert.True(offer.Hold);
        Assert.False(deck.Rig.Broker.Selected()!.Known);
        using var text = Art.AiText.Record();
        await deck.ReadAsync();
        Assert.True(text.Has("UNKNOWN SESSION"), text.All);
        Assert.True(text.Has("APPROVE LOCKED"), text.All);
        Assert.Equal(ApproveBlock.UnknownSession, deck.Rig.Broker.ApproveState(TestDevices.Galleon.Id));
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(d1));
        await deck.Deny.PressAsync();
        Assert.Equal(DecisionKind.Deny, Done(d1)?.Kind, "Deny still works");
    }

    [Test]
    public void R6_3_a_request_never_vouches_for_its_own_session()
    {
        using var rig = new TestRig();
        var key = new SessionKey(AgentKind.Codex, "first-seen");
        Assert.False(rig.Sessions.IsKnownLive(key, rig.Agent), "first event ever = a PermissionRequest: unknown");
        rig.Hook("SessionStart", "first-seen", "codex");
        Assert.True(rig.Sessions.IsKnownLive(key, rig.Agent with { Image = "codex.exe" }));
        Assert.False(rig.Sessions.IsKnownLive(key, new ProcessIdentity(999, 5, "codex.exe")), "another process claiming the session: unknown");
        rig.Watcher.Exit(rig.Agent, rig.Time.GetUtcNow());
        Assert.False(rig.Sessions.IsKnownLive(key, rig.Agent), "its process is gone");
    }

    [Test]
    public async Task R6_3_unverified_events_never_make_a_session_known()
    {
        using var rig = new TestRig();
        rig.Hook("SessionStart", verified: false);
        Assert.False(rig.Sessions.IsKnownLive(new SessionKey(AgentKind.Claude, TestRig.Sessions1), rig.Agent));
        TrackerTests.List(rig, TrackerTests.Entry(TestRig.Sessions1, "busy", pid: TestRig.AgentPid));
        Assert.True(rig.Sessions.IsKnownLive(new SessionKey(AgentKind.Claude, TestRig.Sessions1), rig.Agent), "the agent list vouches for it");
        await Task.CompletedTask;
    }

    [Test]
    public async Task R6_3_a_details_key_must_show_the_whole_summary()
    {
        // Keys-only deck: the details key sits next to Approve. A long command cannot be shown on a key: no approve from here.
        var rig = new TestRig();
        await using var deck = await Deck.OnAsync(rig, TestDevices.StreamDeck, cardController: Controller.Keypad);
        var (_, dLong, _) = await deck.RequestAsync(command: "rm -rf build && npm ci && npm run release -- --tag next");
        await deck.ReadAsync();
        Assert.Equal(ApproveBlock.TooLong, rig.Broker.ApproveState(TestDevices.StreamDeck.Id), "measured in the stroke font: two lines are not enough");
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(dLong));
        await deck.Deny.PressAsync();

        var (_, dShort, _) = await deck.RequestAsync(TestRig.Sessions2, command: "npm test");
        await deck.ReadAsync();
        await deck.Approve.KeyDownAsync();
        await deck.Approve.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(DecisionKind.Allow, Done(dShort)?.Kind);
        deck.Card!.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task R6_3_a_card_command_too_long_for_two_lines_disables_approve()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync(command: "docker compose -f deploy/compose.example.yaml up --build --force-recreate api worker");
        await deck.ReadAsync();
        Assert.Equal(ApproveBlock.TooLong, deck.Rig.Broker.ApproveState(TestDevices.Galleon.Id), "measured: it does not fit the card's three lines");
        await deck.Approve.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Null(Done(d1));
    }

    // ---------------------------------------------------------------- 6.4 deny is easy

    [Test]
    public async Task R6_4_deny_press_and_hold_to_stop_claude_only()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.Deny.PressAsync();
        Assert.Equal(new ApprovalDecision(DecisionKind.Deny, "Denied from Stream Deck", false), Done(d1));

        var (_, d2, _) = await deck.RequestAsync(TestRig.Sessions2);
        await deck.Deny.KeyDownAsync();
        await deck.Deny.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(new ApprovalDecision(DecisionKind.Deny, "Denied from Stream Deck", true), Done(d2));
        await deck.Deny.KeyUpAsync();

        var (_, d3, _) = await deck.RequestAsync("codex-1", agent: "codex", tool: "shell");
        await deck.Deny.KeyDownAsync();
        await deck.Deny.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(false, Done(d3)?.Interrupt, "Codex reserves interrupt: a plain deny");
        await deck.Deny.KeyUpAsync();
        deck.Deny.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task R6_4_deny_is_bound_to_the_request_at_key_down()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync();
        await deck.Deny.KeyDownAsync();
        var (_, d2, _) = await deck.RequestAsync(TestRig.Sessions2, agentPid: 4343);
        await deck.Card!.RotateAsync(+1);   // the user even turns to the new request before letting go
        await deck.Deny.KeyUpAsync();
        // Review L13: a Deny press means the request shown at keyDown; it is never voided while that request is pending.
        Assert.Equal(DecisionKind.Deny, Done(d1)?.Kind, "the request shown at keyDown is denied");
        Assert.Null(Done(d2), "the other one is untouched");
    }

    // ---------------------------------------------------------------- 6.5 timeouts and no-hold cases

    [Test]
    public async Task R6_5_window_is_clamped_below_the_hook_timeout()
    {
        Assert.Equal(TimeSpan.FromSeconds(30), new AiSettings().RequestWindow);
        Assert.Equal(TimeSpan.FromSeconds(10), new AiSettings { RequestWindowSeconds = 1 }.RequestWindow);
        Assert.Equal(TimeSpan.FromSeconds(55), new AiSettings { RequestWindowSeconds = 600 }.RequestWindow);
        var hookTimeout = HookInstaller.Group(HookFileKind.Claude, "PermissionRequest", @"C:\x\prism-relay.exe")["hooks"]![0]!["timeout"]!.GetValue<int>();
        Assert.True(55 < hookTimeout, "the deck window always ends before the hook's own timeout");
        await Task.CompletedTask;
    }

    [Test]
    public async Task R6_5_no_hold_cases()
    {
        // No approve key visible.
        await using (var deck = await Deck.OnAsync(new TestRig()))
        {
            await deck.Approve.DisappearAsync();
            Assert.Equal("no approve key visible", (await deck.RequestAsync()).Offer.Reason);
        }
        // The app (deck) disconnected.
        await using (var deck = await Deck.OnAsync(new TestRig()))
        {
            deck.Rig.Presence.SetConnected(false);
            Assert.Equal("deck disconnected", (await deck.RequestAsync()).Offer.Reason);
        }
        // The device disconnected.
        await using (var deck = await Deck.OnAsync(new TestRig()))
        {
            deck.Rig.Presence.DeviceDisconnected(TestDevices.Galleon.Id);
            Assert.False((await deck.RequestAsync()).Offer.Hold);
        }
        // Safe mode.
        await using (var deck = await Deck.OnAsync(new TestRig(safeMode: true)))
            Assert.Equal("safe mode", (await deck.RequestAsync()).Offer.Reason);
        // Private mode without deny-only.
        await using (var deck = await Deck.OnAsync(new TestRig(settings: new AiSettings())))
            Assert.Equal("private mode", (await deck.RequestAsync()).Offer.Reason);
        // ON AIR forces private.
        await using (var deck = await Deck.OnAsync(new TestRig(settings: new AiSettings { Privacy = "reveal", OnAir = true })))
            Assert.Equal("private mode", (await deck.RequestAsync()).Offer.Reason);
        // No details next to the approve key.
        await using (var deck = await Deck.OnAsync(new TestRig(), card: false))
            Assert.Equal("no details next to approve", (await deck.RequestAsync()).Offer.Reason);
        // Eight already pending.
        await using (var deck = await Deck.OnAsync(new TestRig()))
        {
            for (var i = 0; i < ApprovalBroker.MaxPending; i++) Assert.True((await deck.RequestAsync($"s-{i}", agentPid: 5000 + i)).Offer.Hold);
            Assert.Equal("too many pending", (await deck.RequestAsync("s-9", agentPid: 5099)).Offer.Reason);
        }
        // Not decidable: cross-talk and Gemini.
        await using (var deck = await Deck.OnAsync(new TestRig()))
        {
            var e = deck.Rig.Event("PermissionRequest", "c-1", agent: "claude", tool: "cursor");
            Assert.Equal("not decidable", deck.Rig.Broker.Offer(e, true).Reason);
        }
    }

    // ---------------------------------------------------------------- 6.7 respect the agent's policy

    [Test]
    public async Task R6_7_unprotected_sessions_are_tinted_red()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        deck.Rig.Hook("SessionStart", fields: new() { ["hook_event_name"] = "SessionStart", ["permission_mode"] = "bypassPermissions", ["source"] = "startup" });
        await using var key = await deck.Rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 }, context: "ctx-key");
        var neg = Core.Render.Tokens.Refraction.Night.Neg.Hex;
        Assert.Contains(neg, key.LastSvg);
        Assert.Contains("stroke-dasharray", key.LastSvg);
        key.AssertFramesAreDeckSafe();
    }

    // ---------------------------------------------------------------- 6.8 no secrets anywhere

    [Test]
    public async Task R6_8_logs_carry_hashes_and_decisions_only()
    {
        await using var deck = await Deck.OnAsync(new TestRig());
        var (_, d1, _) = await deck.RequestAsync(command: "curl -H \"Authorization: Bearer sk-test-EXAMPLEEXAMPLEEXAMPLEEXAMPLE\" https://api.example.com/v1");
        await deck.ReadAsync();
        await deck.Deny.PressAsync();
        Assert.Equal(DecisionKind.Deny, Done(d1)?.Kind);
        var log = deck.Rig.Log.All;
        Assert.DoesNotContain(TestRig.Sessions1, log);
        Assert.DoesNotContain("curl", log);
        Assert.DoesNotContain("EXAMPLEEXAMPLE", log);
        Assert.DoesNotContain("api.example.com", log);
        Assert.Contains(new SessionKey(AgentKind.Claude, TestRig.Sessions1).Hash6, log);
        Assert.Contains("deny", log);
    }

    [Test]
    public void R6_8_summaries_are_scrubbed_again_at_the_ingress()
    {
        using var rig = new TestRig();
        rig.Presence.Register("a", SurfaceKind.Approve, TestRig.Device, false);
        rig.Presence.Register("c", SurfaceKind.Details, TestRig.Device, false);
        rig.Hook("SessionStart");
        var offer = rig.Broker.Offer(rig.Event("PermissionRequest", TestRig.Sessions1), true);
        rig.Broker.AttachSummary(offer.RequestId!, new JsonObject
        {
            ["t"] = "reveal",
            ["summary"] = new JsonObject
            {
                ["command"] = "export API_KEY=abc123secretvalue && curl https://user:hunter2@example.com/x?token=0123456789abcdef0123456789abcdef",
                ["file"] = @"C:\Users\example\secret-folder\notes.txt",
                ["host"] = "https://user:pw@api.example.com/path?q=1",
            },
        });
        var s = rig.Broker.Selected()!.Summary!;
        Assert.DoesNotContain("abc123secretvalue", s.Command);
        Assert.DoesNotContain("hunter2", s.Command);
        Assert.DoesNotContain("0123456789abcdef0123456789abcdef", s.Command);
        Assert.True(s.Command!.Length <= 120);
        Assert.Equal("notes.txt", s.File);
        Assert.Equal("api.example.com", s.Host);
        // Frame 3 is refused when the request did not ask for it, and accepted only once.
        Assert.False(rig.Broker.AttachSummary(offer.RequestId!, new JsonObject { ["t"] = "reveal", ["summary"] = new JsonObject { ["command"] = "swap" } }));
    }

    // ---------------------------------------------------------------- 6.10 Codex trust stays human

    [Test]
    public async Task R6_10_codex_trust_and_config_are_never_written()
    {
        var home = TempDirs.CopyFixture("home-orca");
        using var rig = new TestRig(home: home);
        var before = Snapshot(Path.Combine(home, ".codex"));
        var plan = rig.Hooks.Preview();
        Assert.Contains("/hooks", string.Join(" ", plan.Notes));
        Assert.True((await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None)).Ok);
        var after = Snapshot(Path.Combine(home, ".codex"));
        Assert.Equal(before["config.toml"], after["config.toml"], "config.toml (notify, trust_level, features) is byte-identical");
        var changed = after.Keys.Where(k => !before.ContainsKey(k) || before[k] != after[k]).OrderBy(k => k).ToList();
        Assert.True(changed.All(k => k == "hooks.json" || k.StartsWith("hooks.json" + HookInstaller.BackupMarker, StringComparison.Ordinal)),
            "only hooks.json and its backup: " + string.Join(", ", changed));
    }

    private static Dictionary<string, string> Snapshot(string dir) =>
        Directory.EnumerateFiles(dir).ToDictionary(f => Path.GetFileName(f)!, f => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(f))));
}

/// <summary>Plugin events a test can raise (device changes, deep links).</summary>
public sealed class FakePluginEvents : IPluginEvents
{
    public event EventHandler<DeviceInfo>? DeviceConnected;
    public event EventHandler<string>? DeviceDisconnected;
    public event EventHandler? SystemWokeUp;
    public event EventHandler<string>? ApplicationLaunched;
    public event EventHandler<string>? ApplicationTerminated;
    public event EventHandler<string>? DeepLinkReceived;
    public event EventHandler? Connected;
    public event EventHandler? Disconnected;

    public void RaiseDeepLink(string url) => DeepLinkReceived?.Invoke(this, url);
    public void RaiseDisconnected() => Disconnected?.Invoke(this, EventArgs.Empty);
    public void Touch()
    {
        DeviceConnected?.Invoke(this, TestDevices.Galleon);
        DeviceDisconnected?.Invoke(this, "x");
        SystemWokeUp?.Invoke(this, EventArgs.Empty);
        ApplicationLaunched?.Invoke(this, "x");
        ApplicationTerminated?.Invoke(this, "x");
        Connected?.Invoke(this, EventArgs.Empty);
    }
}
