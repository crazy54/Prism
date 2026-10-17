using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Sessions.Jump;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Every AI action on the Galleon and the Stream Deck + (and keys-only decks), with every frame linted.</summary>
public class ActionTests
{
    private static readonly DeviceInfo[] Devices = [TestDevices.Galleon, TestDevices.Plus];

    private static void Fleet(TestRig rig)
    {
        rig.Hook("UserPromptSubmit", "s-1");
        rig.Hook("PermissionRequest", "s-2", fields: new() { ["hook_event_name"] = "PermissionRequest", ["tool_name"] = "Bash" });
        rig.Hook("Notification", "s-3", fields: new() { ["hook_event_name"] = "Notification", ["notification_type"] = "elicitation_dialog" });
        rig.Hook("Stop", "s-4");
        rig.Hook("StopFailure", "s-5", fields: new() { ["hook_event_name"] = "StopFailure", ["error"] = "overloaded" });
        rig.Hook("SessionStart", "s-6");
        rig.Hook("UserPromptSubmit", "s-7", agent: "codex");
        rig.Hook("SubagentStart", "s-1", fields: new() { ["hook_event_name"] = "SubagentStart", ["agent_id"] = "a1" });
    }

    [Test]
    public async Task Session_keys_show_every_state_and_stay_deck_safe()
    {
        foreach (var device in Devices.Append(TestDevices.StreamDeck).Append(TestDevices.Mini))
        {
            using var rig = new TestRig();
            Fleet(rig);
            for (var slot = 1; slot <= 8; slot++)
            {
                await using var h = await rig.AppearAsync<SessionKeyAction>(device, new(0, 0), settings: new SessionKeySettings { Slot = slot }, context: $"k{slot}");
                Assert.NotNull(h.LastSvg, $"{device.Name} slot {slot}");
                Assert.Equal(UpdatePriority.Background, h.CallsOf("setImage").Last().Priority, "stats keys are background tier");
                await h.AdvanceAsync(TimeSpan.FromSeconds(2));
                h.AssertFramesAreDeckSafe();
            }
        }
    }

    [Test]
    public async Task Session_key_shows_alias_state_agent_and_elapsed()
    {
        using var rig = new TestRig(settings: new AiSettings());   // private
        rig.Hook("UserPromptSubmit", "s-1");
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 });
        await h.AdvanceAsync(TimeSpan.FromSeconds(65));
        Assert.True(text.Has("AGENT 1"), text.All);
        Assert.True(text.Has("WORKING"), text.All);
        Assert.True(text.Has("CLAUDE 1:05"), text.All);
    }

    [Test]
    public async Task Needs_you_pulses_at_2_hz()
    {
        using var rig = new TestRig();
        rig.Hook("PermissionRequest", "s-1");
        await using var h = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 });
        var frames = new HashSet<string?>();
        for (var i = 0; i < 4; i++)
        {
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(500));
            frames.Add(h.LastImage);
        }
        Assert.True(frames.Count >= 2, "the ring alternates");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Press_jumps_and_long_press_pins()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", "s-1");
        rig.Windows.WindowsByPid[77] = [(nint)0x1234];
        rig.Windows.Classes[0x1234] = Jumper.TerminalWindowClass;
        await using var h = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0), settings: new SessionKeySettings { Slot = 1 });
        await h.PressAsync();
        Assert.Equal((nint)0x1234, Assert.Single(rig.Windows.Focused));
        Assert.Equal("Example session", Assert.Single(rig.Tabs.Calls).Title, "the tab match uses the session's own name");
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        Assert.True(rig.Sessions.BySlot(1, PrivacyMode.Private)!.Pinned);
        Assert.Equal(1, h.Count("showOk"));
        Assert.Single(rig.Windows.Focused);   // the long-press did not also jump
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        Assert.False(rig.Sessions.BySlot(1, PrivacyMode.Private)!.Pinned);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Empty_slot_press_alerts_and_does_nothing()
    {
        using var rig = new TestRig();
        await using var h = await rig.AppearAsync<SessionKeyAction>(TestDevices.Plus, new(0, 0), settings: new SessionKeySettings { Slot = 5 });
        await h.PressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Empty(rig.Windows.Focused);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Next_needs_me_counts_and_jumps_to_the_oldest_permission()
    {
        foreach (var device in Devices)
        {
            using var rig = new TestRig();
            Fleet(rig);
            rig.Windows.WindowsByPid[77] = [(nint)0x77];
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<NextNeedsMeAction>(device, new(0, 2));
            Assert.True(text.Has("3"), "permission + input + error: " + text.All);
            Assert.True(text.Has("PERMISSION"), text.All);
            await h.PressAsync();
            Assert.Single(rig.Windows.Focused);
            h.AssertFramesAreDeckSafe();
        }
        using var empty = new TestRig();
        await using var e = await empty.AppearAsync<NextNeedsMeAction>(TestDevices.Galleon, new(0, 2));
        await e.PressAsync();
        Assert.Empty(empty.Windows.Focused);
        e.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Fleet_widget_galleon_12_cells_plus_8_cells()
    {
        foreach (var device in Devices)
        {
            using var rig = new TestRig();
            Fleet(rig);
            await using var h = await rig.AppearAsync<FleetDialAction>(device, new(0, 0), Controller.Encoder);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            Assert.Equal(device.IsGalleon ? 12 : 8, h.Action.Cells);
            var svg = Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
            Assert.True(svg.Length > 1000);
            await h.RotateAsync(+12);   // a Galleon fast spin
            await h.RotateAsync(-1);
            await h.AdvanceAsync(TimeSpan.FromSeconds(2));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Fleet_header_counts_and_banner()
    {
        using var rig = new TestRig();
        rig.Hook("UserPromptSubmit", "s-1");
        rig.Hook("Stop", "s-2");
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<FleetDialAction>(TestDevices.Galleon, new(0, 0), Controller.Encoder);
        Assert.True(text.Has("1 WORKING · 0 NEEDS YOU · 1 DONE"), text.All);
        text.Clear();
        rig.Hook("PermissionRequest", "s-1");
        await h.SettleAsync();
        Assert.True(text.Has("NEEDS PERMISSION"), "the 4 s banner: " + text.All);
        await h.AdvanceAsync(TimeSpan.FromSeconds(4.5));
        text.Clear();
        await h.AdvanceAsync(TimeSpan.FromSeconds(0.6));
        Assert.False(text.Has("NEEDS PERMISSION"), "the banner is gone after 4 s");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Fleet_push_jumps_to_the_selected_cell_and_plus_tap_jumps_to_the_tapped_one()
    {
        using var rig = new TestRig();
        Fleet(rig);
        rig.Windows.WindowsByPid[77] = [(nint)0x77];
        await using var g = await rig.AppearAsync<FleetDialAction>(TestDevices.Galleon, new(0, 0), Controller.Encoder);
        await g.RotateAsync(+1);
        await g.DialPressAsync();
        Assert.Single(rig.Windows.Focused);
        await g.DialPressAsync(TimeSpan.FromSeconds(5));   // a Galleon hold is just a press for us (the layer switch never reaches plugins)
        Assert.Equal(2, rig.Windows.Focused.Count);

        await using var p = await rig.AppearAsync<FleetDialAction>(TestDevices.Plus, new(0, 0), Controller.Encoder, context: "plus");
        await p.TapAsync(180, 80);   // slot 8: empty
        Assert.Equal(1, p.Count("showAlert"));
        await p.TapAsync(10, 10);    // slot 1
        Assert.Equal(3, rig.Windows.Focused.Count);
        p.AssertFramesAreDeckSafe();
        g.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Approval_card_on_galleon_plus_and_as_a_details_key()
    {
        foreach (var (device, controller) in new[] { (TestDevices.Galleon, Controller.Encoder), (TestDevices.Plus, Controller.Encoder), (TestDevices.StreamDeck, Controller.Keypad), (TestDevices.Galleon, Controller.Keypad) })
        {
            await using var deck = await Deck.OnAsync(new TestRig(), device, cardController: controller);
            var c = deck.Card!;
            if (controller == Controller.Encoder) Assert.Equal(AiIds.CardLayout, c.LastLayout);
            using var text = AiText.Record();
            await deck.RequestAsync(command: "npm test -- --watch=false");
            await deck.ReadAsync();
            if (controller == Controller.Encoder)
            {
                Assert.Equal("npm test -- --watch=false", c.FeedbackText("line1"), "native text keeps the real case");
                Assert.True(text.Has("HOLD APPROVE · PRESS DENY"), text.All);
                Assert.True(text.Has("· BASH ·"), text.All);
            }
            else Assert.True(text.Has("BASH"), text.All);
            await deck.RequestAsync(TestRig.Sessions2, command: "git status");
            await c.AdvanceAsync(TimeSpan.FromSeconds(31));
            c.AssertFramesAreDeckSafe();
            deck.Approve.AssertFramesAreDeckSafe();
            deck.Deny.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Card_native_text_follows_the_theme()
    {
        var rig = new TestRig();
        rig.Globals.SetSection("core", new Core.Hosting.CoreSettings { Theme = "day" });
        await using var deck = await Deck.OnAsync(rig);
        await deck.RequestAsync(command: "npm test");
        await deck.ReadAsync();
        var line1 = deck.Card!.Feedback["line1"]!.AsObject();
        Assert.Equal("npm test", line1["value"]!.GetValue<string>());
        Assert.Equal(Core.Render.Tokens.Refraction.Day.KeyInk.Hex, line1["color"]!.GetValue<string>(), "legible on Day, not Night's fixed ink");
    }

    [Test]
    public async Task Card_push_reviews_in_the_terminal()
    {
        var rig = new TestRig();
        rig.Windows.WindowsByPid[77] = [(nint)0x77];
        await using var deck = await Deck.OnAsync(rig);
        var (_, decision, _) = await deck.RequestAsync();
        await deck.Card!.DialPressAsync();
        Assert.Equal(Approvals.DecisionKind.None, decision.Result.Kind, "no decision: the terminal prompt takes over at once");
        Assert.Single(rig.Windows.Focused);
    }

    [Test]
    public async Task Card_with_nothing_pending()
    {
        foreach (var device in Devices)
        {
            using var rig = new TestRig();
            using var text = AiText.Record();
            await using var h = await rig.AppearAsync<RequestCardAction>(device, new(1, 0), Controller.Encoder);
            Assert.True(text.Has("NO REQUESTS"), text.All);
            Assert.Equal("", h.FeedbackText("line1"));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Approve_key_faces()
    {
        using var rig = new TestRig();
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<ApproveKeyAction>(TestDevices.Galleon, new(1, 2));
        Assert.True(text.Has("NO REQUEST"), text.All);
        await h.PressAsync(TimeSpan.FromSeconds(2));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Privacy_key_toggles_on_air_only()
    {
        using var rig = new TestRig();
        using var text = AiText.Record();
        await using var h = await rig.AppearAsync<PrivacyKeyAction>(TestDevices.Galleon, new(2, 3));
        Assert.True(text.Has("REVEAL"), text.All);
        await h.PressAsync();
        Assert.True(rig.Settings.Current.OnAir);
        Assert.True(rig.Settings.Current.IsPrivate);
        Assert.True(text.Has("ON AIR"), text.All);
        Assert.Equal("reveal", rig.Settings.Current.Privacy, "the key never changes the Reveal choice itself");
        Assert.True(rig.Globals.Snapshot()[AiSettings.Section]!["onAir"]!.GetValue<bool>(), "persisted in the ai section");
        await h.PressAsync();
        Assert.False(rig.Settings.Current.OnAir);
        await h.PressAsync(TimeSpan.FromSeconds(2));   // a long press toggles too: it only ever tightens or restores
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Without_the_module_every_key_says_offline()
    {
        await using var a = await ActionHarness<SessionKeyAction>.AppearAsync(TestDevices.Galleon);
        await using var b = await ActionHarness<ApproveKeyAction>.AppearAsync(TestDevices.Galleon);
        await b.PressAsync(TimeSpan.FromSeconds(2));
        Assert.NotNull(a.LastSvg);
        a.AssertFramesAreDeckSafe();
        b.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Multi_action_instances_never_render_or_register()
    {
        using var rig = new TestRig();
        await using var h = await rig.AppearAsync<ApproveKeyAction>(TestDevices.Galleon, new(1, 2), inMultiAction: true);
        Assert.Equal(0, h.Count("setImage"));
        Assert.False(rig.Presence.AnyVisible(Approvals.SurfaceKind.Approve));
        Assert.False(rig.Services.Demanded, "a multi-action copy does not keep the pollers running");
    }

    [Test]
    public async Task Visible_actions_drive_demand()
    {
        using var rig = new TestRig();
        Assert.False(rig.Services.Demanded);
        var h = await rig.AppearAsync<NextNeedsMeAction>(TestDevices.Galleon, new(0, 0));
        Assert.True(rig.Services.Demanded);
        await h.DisposeAsync();
        Assert.False(rig.Services.Demanded);
    }

    [Test]
    public async Task Pi_messages_answer_status_and_never_throw()
    {
        using var rig = new TestRig();
        await using var h = await rig.AppearAsync<SessionKeyAction>(TestDevices.Galleon, new(0, 0));
        var reply = await h.PiMessageAsync("hooks.status", null, requestId: 7);
        Assert.Equal(true, reply?["ok"]?.GetValue<bool>());
        Assert.Equal(false, reply?["data"]?["installed"]?.GetValue<bool>());
        var unknown = await h.PiMessageAsync("something.else", new JsonObject(), requestId: 8);
        Assert.Equal(true, unknown?["ok"]?.GetValue<bool>());
    }
}
