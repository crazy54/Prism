using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Smart.Actions;
using PrismControl.Smart.Context;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>A whole device of smart slots, each a real action instance in an ActionHarness sharing the rig's engine and clock.</summary>
public sealed class Deck : IAsyncDisposable
{
    public Dictionary<KeySlot, ActionHarness<SmartKeyAction>> Keys { get; } = [];
    public Dictionary<DialSlot, ActionHarness<SmartDialAction>> Dials { get; } = [];
    public DeviceInfo Device { get; }
    private readonly Rig _rig;

    private Deck(Rig rig, DeviceInfo device) { _rig = rig; Device = device; }

    public static async Task<Deck> CreateAsync(Rig rig, DeviceInfo device, IEnumerable<KeySlot>? keys = null, bool dials = true)
    {
        var deck = new Deck(rig, device);
        var geo = DeviceGeometry.For(device);
        foreach (var k in keys ?? geo.AllKeys())
            deck.Keys[k] = await ActionHarness<SmartKeyAction>.AppearAsync(device, new Coordinates(k.X, k.Y), Controller.Keypad,
                configureServices: s => s.Add(rig.Engine), time: rig.Time, context: $"{device.Id}-k{k.X}{k.Y}");
        if (dials)
            foreach (var d in geo.AllDials())
                deck.Dials[d] = await ActionHarness<SmartDialAction>.AppearAsync(device, geo.Layers > 1 ? new Coordinates(d.Dial, d.Layer) : new Coordinates(d.Dial, 0),
                    Controller.Encoder, configureServices: s => s.Add(rig.Engine), time: rig.Time, context: $"{device.Id}-d{d.Dial}{d.Layer}");
        await rig.AdvanceAsync(120);
        return deck;
    }

    public SlotView View(KeySlot k) => _rig.Engine.View(SlotOf(Keys[k].Action));
    public SlotView View(DialSlot d) => _rig.Engine.View(SlotOf(Dials[d].Action));
    public static SmartSlot SlotOf(ActionBase a) => (SmartSlot)a.GetType().GetField("_slot", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(a)!;

    public string Labels() => string.Join(" | ", Keys.OrderBy(k => k.Key).Select(k => $"{k.Key}={View(k.Key).Label}"));

    public void AssertDeckSafe()
    {
        foreach (var h in Keys.Values) h.AssertFramesAreDeckSafe();
        foreach (var h in Dials.Values) h.AssertFramesAreDeckSafe();
    }

    public async Task SettleAsync()
    {
        foreach (var h in Keys.Values) await h.SettleAsync();
        foreach (var h in Dials.Values) await h.SettleAsync();
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var h in Keys.Values) await h.DisposeAsync();
        foreach (var h in Dials.Values) await h.DisposeAsync();
    }
}

public class SmartActionTests
{
    [Test]
    public void Actions_pass_the_host_discovery_rules()
    {
        var scan = ActionValidator.Scan(typeof(SmartKeyAction).Assembly);
        Assert.Empty(scan.Errors);
        Assert.True(scan.Actions.Any(a => a.Uuid == "com.jeremyfhall.prismcontrol.smart.key"));
        Assert.True(scan.Actions.Any(a => a.Uuid == "com.jeremyfhall.prismcontrol.smart.dial"));
    }

    [Test]
    public async Task Galleon_keys_draw_the_terminal_and_a_press_sends_the_chord()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon);
        Assert.Equal("NEW TAB", deck.View(new KeySlot(0, 0)).Label);
        Assert.Equal(SlotKind.More, deck.View(new KeySlot(2, 3)).Kind);
        await deck.Keys[new KeySlot(0, 0)].PressAsync();
        await rig.IdleAsync();
        Assert.Equal("Control+Shift+T", Assert.Single(rig.KeysSent()));
        Assert.NotNull(deck.Keys[new KeySlot(0, 0)].LastSvg);
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task Confirm_keys_fire_only_after_the_hold()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon, dials: false);
        var close = deck.Keys.Single(k => deck.View(k.Key).ItemId == "pane.close");
        Assert.Equal(Safety.Confirm, deck.View(close.Key).Safety);
        await close.Value.PressAsync(TimeSpan.FromMilliseconds(200));
        await rig.IdleAsync();
        Assert.Empty(rig.Input.Records);
        Assert.Equal("HOLD", deck.View(close.Key).Flash);
        await close.Value.KeyDownAsync();
        await close.Value.AdvanceAsync(TimeSpan.FromMilliseconds(400));
        Assert.True(deck.View(close.Key).HoldProgress is > 0.4 and < 0.8, "the ring fills while held");
        await close.Value.AdvanceAsync(TimeSpan.FromMilliseconds(400));
        await rig.IdleAsync();
        Assert.Equal("Control+Shift+W", Assert.Single(rig.KeysSent()));
        await close.Value.KeyUpAsync();
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task Not_in_front_dims_the_keys_and_a_press_says_so()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon, dials: false);
        rig.Foreground.InFront = false;
        var v = deck.View(new KeySlot(0, 0));
        Assert.False(v.Availability.Ready);
        Assert.Equal("notForeground", v.Availability.Reason);
        await deck.Keys[new KeySlot(0, 0)].PressAsync();
        await rig.IdleAsync();
        Assert.Empty(rig.Input.Records);
        Assert.Equal("NOT IN FRONT", deck.View(new KeySlot(0, 0)).Flash);
        rig.Foreground.InFront = true;
        rig.Foreground.Elevated = true;
        Assert.Equal("elevated", deck.View(new KeySlot(1, 0)).Availability.Reason);
        await deck.Keys[new KeySlot(1, 0)].PressAsync();
        await rig.IdleAsync();
        Assert.Equal("ADMIN APP", deck.View(new KeySlot(1, 0)).Flash);
        Assert.Empty(rig.Input.Records);
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task More_pages_on_press_and_locks_on_hold()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon, dials: false);
        var more = deck.Keys[new KeySlot(2, 3)];
        var page1 = deck.Labels();
        await more.PressAsync();
        await rig.AdvanceAsync(20);
        Assert.Equal(1, rig.Engine.LayoutFor(TestDevices.Galleon.Id).Page);
        Assert.NotEqual(page1, deck.Labels());
        await more.KeyDownAsync();
        await more.AdvanceAsync(TimeSpan.FromMilliseconds(800));
        await more.KeyUpAsync();
        Assert.True(rig.Engine.Context.IsLocked);
        Assert.Equal(1, rig.Engine.LayoutFor(TestDevices.Galleon.Id).Page, "a hold locks, it doesn't page");
        await rig.FrontAsync(Apps.PlanetCoaster2);
        Assert.Equal("windows-terminal", rig.Engine.Context.Current.Pack!.Id, "locked");
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task A_lock_role_key_is_never_filled_and_toggles_the_lock()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var lockKey = await ActionHarness<SmartKeyAction>.AppearAsync(TestDevices.Galleon, new Coordinates(0, 0), Controller.Keypad,
            settings: new SmartSlotSettings { Role = "lock" }, configureServices: s => s.Add(rig.Engine), time: rig.Time, context: "lock");
        await rig.AdvanceAsync(100);
        Assert.False(rig.Engine.LayoutFor(TestDevices.Galleon.Id).Keys.ContainsKey(new KeySlot(0, 0)));
        await lockKey.PressAsync();
        Assert.True(rig.Engine.Context.IsLocked);
        await lockKey.PressAsync();
        Assert.False(rig.Engine.Context.IsLocked);
        lockKey.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_dials_turn_and_touch_push_with_strip_feedback()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Plus);
        var tabs = deck.Dials[new DialSlot(0, 0)];
        Assert.Equal("TABS", deck.View(new DialSlot(0, 0)).Label);
        await tabs.RotateAsync(+1);
        await rig.IdleAsync();
        await tabs.RotateAsync(-1);
        await rig.IdleAsync();
        AssertExtra.Equal(["Control+Tab", "Control+Shift+Tab"], rig.KeysSent());
        rig.Input.Clear();
        await tabs.TapAsync(100, 50);
        await rig.IdleAsync();
        Assert.Equal("Control+Shift+T", Assert.Single(rig.KeysSent()), "touch = push = NEW TAB");
        Assert.Equal(Layouts.Canvas.Path, tabs.LastLayout);
        Assert.NotNull(tabs.FeedbackSvg(Layouts.Canvas.Frame));
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task Galleon_confirm_pushes_arm_then_fire()
    {
        var j = TestPacks.Minimal();
        ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.reset", "RESET", "system", 30, new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+R" }, safety: "confirm"));
        j["controls"] = JsonNode.Parse("""
            [ { "id": "zoom", "label": "ZOOM", "glyph": "search", "category": "tool", "priority": 90, "contexts": ["*"],
                "turn": { "left": { "kind": "chord", "chord": "Ctrl+Minus" }, "right": { "kind": "chord", "chord": "Ctrl+Equal" }, "step": { "perPress": 1, "unit": "step" } },
                "push": { "verb": "app.reset" }, "safety": "safe", "unavailable": { "label": "ZOOM", "hint": "x" }, "confidence": "official", "sources": ["S1"] } ]
            """);
        var pack = TestPacks.Parse(j);
        using var rig = new Rig([pack]);
        var app = Apps.Notepad with { ProcessName = "ExampleApp.exe" };
        await rig.FrontAsync(app);
        await using var dial = await ActionHarness<SmartDialAction>.AppearAsync(TestDevices.Galleon, new Coordinates(0, 0), Controller.Encoder,
            configureServices: s => s.Add(rig.Engine), time: rig.Time, context: "d00");
        await rig.AdvanceAsync(100);
        await dial.DialPressAsync();
        await rig.IdleAsync();
        Assert.Empty(rig.Input.Records);
        Assert.True(rig.Engine.View(Deck.SlotOf(dial.Action)).Armed);
        await dial.AdvanceAsync(TimeSpan.FromSeconds(1));
        await dial.DialPressAsync();
        await rig.IdleAsync();
        Assert.Equal("Control+R", Assert.Single(rig.KeysSent()));
        // An arm expires after 3 s.
        rig.Input.Clear();
        await dial.DialPressAsync();
        await dial.AdvanceAsync(TimeSpan.FromSeconds(4));
        await dial.DialPressAsync();
        await rig.IdleAsync();
        Assert.Empty(rig.Input.Records);
        dial.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task The_inspector_explains_the_slot_and_pins_and_hides_per_app()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon, dials: false);
        var h = deck.Keys[new KeySlot(1, 1)];
        var reply = await h.PiMessageAsync("smart.inspect", null, requestId: 1);
        var data = reply!["data"]!;
        Assert.Equal("windows-terminal", data["pack"]!["id"]!.GetValue<string>());
        Assert.Equal("terminal", data["context"]!["id"]!.GetValue<string>());
        Assert.Contains("pack layout for galleon-100-sd/terminal", data["item"]!["why"]!.GetValue<string>());
        var verb = data["item"]!["id"]!.GetValue<string>();

        await h.PiMessageAsync("smart.pin", null, requestId: 2);
        Assert.True(rig.Saved!.Apps["windows-terminal"].Pins.Any(p => p.Item == verb && p.X == 1 && p.Y == 1));
        await h.PiMessageAsync("smart.hide", null, requestId: 3);
        await rig.AdvanceAsync(20);
        Assert.True(rig.Saved!.Apps["windows-terminal"].Hidden.Contains(verb));
        Assert.NotEqual(verb, deck.View(new KeySlot(1, 1)).ItemId);
        var hidden = await h.PiMessageAsync("smart.hidden", null, requestId: 4);
        Assert.Contains(verb, hidden!["data"]!.ToJsonString());
        await h.PiMessageAsync("smart.unhide", new { id = verb }, requestId: 5);
        Assert.False(rig.Saved!.Apps["windows-terminal"].Hidden.Contains(verb));

        var prefs = await h.PiMessageAsync("smart.prefs.set", new { labelSize = "large", streamerSafe = true, bogus = 1, dialCategories = new { camera = "left", nope = "left" } }, requestId: 6);
        Assert.Equal("large", rig.Saved!.LabelSize);
        Assert.True(rig.Saved.StreamerSafe);
        Assert.Equal("left", rig.Saved.DialCategories["camera"]);
        Assert.False(rig.Saved.DialCategories.ContainsKey("nope"));
        var status = await h.PiMessageAsync("smart.status", null, requestId: 7);
        Assert.Equal("windows-terminal", status!["data"]!["pack"]!.GetValue<string>());
        deck.AssertDeckSafe();
    }

    [Test]
    public async Task Without_an_engine_the_action_shows_an_honest_face()
    {
        await using var h = await ActionHarness<SmartKeyAction>.AppearAsync(TestDevices.Galleon, new Coordinates(0, 0));
        Assert.NotNull(h.LastSvg);
        await h.PressAsync();
        h.AssertFramesAreDeckSafe();
    }
}
