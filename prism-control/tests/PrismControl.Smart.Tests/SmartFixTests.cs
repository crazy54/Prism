using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Context;
using PrismControl.Smart.Control;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;
using PrismControl.Smart.Rebinds;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>
/// Smart fix (review-smart/REPORT.md): one regression test per finding E1–E16, B1–B5 and the B LOWs, the lead's
/// decisions 2 and 4 for Smart's own input paths, and the polish follow-ups (PC1 builder widgets, PC2 one DELETE).
/// Fakes only (Rig): nothing is typed, clicked or focused.
/// </summary>
internal static class Fix
{
    public static DeckGesture Down(Rig rig, string ctx) => DeckGesture.FromDeckEvent(new KeyDownEvent(ctx, "com.jeremyfhall.prismcontrol.smart.key", "dev", new(0, 0), 0, null, false), rig.Time);
    public static DeckGesture Up(Rig rig, string ctx) => DeckGesture.FromDeckEvent(new KeyUpEvent(ctx, "com.jeremyfhall.prismcontrol.smart.key", "dev", new(0, 0), 0, null, false), rig.Time);
    public static DeckGesture Rot(Rig rig, int ticks, string ctx = "d") => DeckGesture.FromDeckEvent(new DialRotateEvent(ctx, "com.jeremyfhall.prismcontrol.smart.dial", "dev", new(0, 0), ticks, false), rig.Time);
    public static DeckGesture Push(Rig rig, string ctx = "d") => DeckGesture.FromDeckEvent(new DialUpEvent(ctx, "com.jeremyfhall.prismcontrol.smart.dial", "dev", new(0, 0)), rig.Time);

    public static List<SmartSlot> Keys(Rig rig, DeviceInfo dev)
    {
        var list = new List<SmartSlot>();
        for (var y = 0; y < dev.Rows; y++)
            for (var x = 0; x < dev.Columns; x++)
                list.Add(rig.Engine.Attach($"{dev.Id}-k{x}{y}", dev, Controller.Keypad, new(x, y), () => { }));
        return list;
    }

    public static List<SmartSlot> Dials(Rig rig, DeviceInfo dev, int dials, int layers)
    {
        var list = new List<SmartSlot>();
        for (var l = 0; l < layers; l++)
            for (var d = 0; d < dials; d++)
                list.Add(rig.Engine.Attach($"{dev.Id}-d{d}{l}", dev, Controller.Encoder, new(d, l), () => { }));
        return list;
    }

    public static SmartSlot Key(Rig rig, IEnumerable<SmartSlot> slots, string verbId) =>
        slots.FirstOrDefault(s => rig.Engine.LayoutFor(s.Device.Id).KeyAt(s.Key) is VerbKey vk && vk.Verb.Id == verbId)
        ?? throw new AssertException($"{verbId} is not on a key: {rig.Engine.LayoutFor(slots.First().Device.Id).Describe()}");

    public static SmartSlot Dial(Rig rig, IEnumerable<SmartSlot> slots, string controlId) =>
        slots.FirstOrDefault(s => rig.Engine.LayoutFor(s.Device.Id).DialAt(s.Dial).Control?.Id == controlId)
        ?? throw new AssertException($"{controlId} is not on a dial: {rig.Engine.LayoutFor(slots.First().Device.Id).Describe()}");

    public static async Task WaitForRecordsAsync(Rig rig, int n)
    {
        for (var i = 0; i < 4000 && rig.Input.Records.Count < n; i++) { rig.Time.Advance(TimeSpan.FromMilliseconds(5)); await Task.Delay(1); }
    }

    /// <summary>A fictional app with a clamped dial whose value comes from a module readout (fake.vol, 0–100, 5 per press).</summary>
    public static ContextPack VolumePack()
    {
        var j = TestPacks.Minimal();
        j["controls"] = new JsonArray(new JsonObject
        {
            ["id"] = "vol", ["label"] = "VOLUME", ["category"] = "tool", ["priority"] = 80, ["contexts"] = new JsonArray("*"), ["readout"] = "vol",
            ["turn"] = new JsonObject
            {
                ["left"] = new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+Minus" }, ["right"] = new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+Equal" },
                ["step"] = new JsonObject { ["perPress"] = 5, ["unit"] = "%" }, ["clamp"] = new JsonObject { ["min"] = 0, ["max"] = 100 },
            },
        });
        j["readouts"] = new JsonArray(new JsonObject { ["id"] = "vol", ["label"] = "VOL", ["contexts"] = new JsonArray("*"), ["unit"] = "%", ["source"] = new JsonObject { ["kind"] = "module", ["field"] = "fake.vol" } });
        return TestPacks.Parse(j);
    }

    public static readonly ForegroundApp ExampleApp = new(0x7001, 4701, "ExampleApp.exe", @"C:\Example\ExampleApp.exe", "Example", null, "Example", false);
}

public class EngineFixTests
{
    // ------------------------------------------------------------------ E1
    [Test]
    public void E1_the_clamp_needs_a_known_value_and_only_limits_the_direction_of_travel()
    {
        var zoom = TestPacks.Get("chromium-browser").FindControl("zoom")!;          // 25..500, no step size (a ladder)
        Assert.Equal(1, TurnPlanner.Plan(zoom, -1, null)!.Presses, "unknown value: never clamped");
        Assert.Equal(1, TurnPlanner.Plan(zoom, +1, null)!.Presses);
        Assert.Equal(1, TurnPlanner.Plan(zoom, +1, 0)!.Presses, "a known value below the minimum still turns UP");
        Assert.Equal(0, TurnPlanner.Plan(zoom, +1, 500)!.Presses, "at the top: no more presses up");
        Assert.Equal(1, TurnPlanner.Plan(zoom, -1, 500)!.Presses);
        var vol = TestPacks.Get("chromium-browser").FindControl("tabVolume")!;      // 0..100, 5 per press
        Assert.Equal(1, TurnPlanner.Plan(vol, -1, null)!.Presses, "first use: volume can turn down");
        Assert.Equal(0, TurnPlanner.Plan(vol, -1, 0)!.Presses, "known 0: not below the minimum");
        Assert.Equal(2, TurnPlanner.Plan(vol, -2, 50)!.Presses);
        Assert.Equal(1, TurnPlanner.Plan(vol, +3, 95)!.Presses, "clamped at 100 on the way up");
    }

    [Test]
    public async Task E1_the_engine_seeds_the_clamp_from_the_readout_and_never_counts_from_zero()
    {
        var pack = Fix.VolumePack();
        using var rig = new Rig([pack]);
        var mod = new FakeVerbProvider("fake");
        rig.Verbs.Register(mod);
        mod.Set("fake.vol", new ReadoutValue { Number = 0, At = rig.Time.GetUtcNow() });
        await rig.FrontAsync(Fix.ExampleApp);
        var dials = Fix.Dials(rig, TestDevices.Plus, 4, 1);
        await rig.AdvanceAsync(200);
        var dial = Fix.Dial(rig, dials, "vol");
        Assert.Equal(100, pack.FindControl("vol")!.Turn.ClampMax);
        rig.Engine.DialRotate(dial, -1, Fix.Rot(rig, -1, dial.Context));
        await rig.IdleAsync();
        Assert.Empty(rig.KeysSent(), "the readout says 0: nothing below it");
        rig.Engine.DialRotate(dial, +1, Fix.Rot(rig, +1, dial.Context));
        await rig.IdleAsync();
        Assert.Equal("Control+OemPlus", Assert.Single(rig.KeysSent()));
        mod.Set("fake.vol", new ReadoutValue { Number = 50, At = rig.Time.GetUtcNow() });
        rig.Input.Clear();
        await rig.AdvanceAsync(600);
        rig.Engine.DialRotate(dial, -1, Fix.Rot(rig, -1, dial.Context));
        await rig.IdleAsync();
        Assert.Equal("Control+OemMinus", Assert.Single(rig.KeysSent()), "a fresh reading of 50 turns down");
    }

    [Test]
    public async Task E1_the_chrome_zoom_dial_turns_both_ways_without_a_reading()
    {
        var prefs = new SmartPreferences();
        prefs.Apps["chromium-browser"] = new AppPreferences { Pins = [new SlotPin { Device = "stream-deck-plus", Kind = "dial", X = 0, Y = 0, Item = "zoom" }] };
        using var rig = new Rig(prefs: prefs);
        await rig.FrontAsync(Apps.Chrome);
        var dials = Fix.Dials(rig, TestDevices.Plus, 4, 1);
        await rig.AdvanceAsync(200);
        var zoom = Fix.Dial(rig, dials, "zoom");
        for (var i = 0; i < 3; i++) { rig.Engine.DialRotate(zoom, -1, Fix.Rot(rig, -1, zoom.Context)); await rig.AdvanceAsync(100); }
        for (var i = 0; i < 3; i++) { rig.Engine.DialRotate(zoom, +1, Fix.Rot(rig, +1, zoom.Context)); await rig.AdvanceAsync(100); }
        await rig.IdleAsync();
        AssertExtra.Equal(["Control+OemMinus", "Control+OemMinus", "Control+OemMinus", "Control+OemPlus", "Control+OemPlus", "Control+OemPlus"], rig.KeysSent());
    }

    // ------------------------------------------------------------------ E2
    [Test]
    public void E2_queued_notches_are_planned_one_by_one()
    {
        var bank = TestPacks.Get("planet-coaster-2").FindControl("bank")!;   // rows 1→1, 4→2, 8→3
        Assert.Equal(7, TurnPlanner.PlanBatch(bank, [1, 1, 1, 1, 1, 1, 1], null)!.Presses, "seven slow notches = seven presses");
        Assert.Equal(14, TurnPlanner.Plan(bank, 7, null)!.Presses, "one 7-tick spin accelerates");
        Assert.Equal(0, TurnPlanner.PlanBatch(bank, [1, -1], null)!.Presses, "opposite notches cancel");
        var vol = TestPacks.Get("chromium-browser").FindControl("tabVolume")!;
        Assert.Equal(1, TurnPlanner.PlanBatch(vol, [1, 1, 1], 95)!.Presses, "the clamp carries from event to event");
    }

    [Test]
    public async Task E2_slow_notches_queued_behind_a_running_turn_press_once_each()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.SightFake.Visible.Add("pc2.terrain.panel");
        rig.SightFake.Publish();
        await rig.AdvanceAsync(700);
        var dials = Fix.Dials(rig, TestDevices.Galleon, 2, 2);
        await rig.AdvanceAsync(200);
        var size = Fix.Dial(rig, dials, "brush.size");
        rig.Input.Clear();
        rig.Engine.DialRotate(size, 1, Fix.Rot(rig, 1, size.Context));
        for (var i = 0; i < 2000 && rig.Input.Records.Count == 0; i++) await Task.Delay(1);
        for (var i = 0; i < 7; i++)
        {
            rig.Engine.DialRotate(size, 1, Fix.Rot(rig, 1, size.Context));
            rig.Time.Advance(TimeSpan.FromMilliseconds(5));
            await Task.Delay(1);
        }
        await rig.IdleAsync();
        Assert.Equal(8, rig.KeysSent().Count(k => k.StartsWith("down:", StringComparison.Ordinal)));
    }

    // ------------------------------------------------------------------ E3 + E16
    [Test]
    public async Task E3_a_dial_turn_and_a_key_press_never_overlap_their_keys()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.SightFake.Visible.Add("pc2.terrain.panel");
        rig.SightFake.Publish();
        await rig.AdvanceAsync(700);
        var keys = Fix.Keys(rig, TestDevices.Galleon);
        var dials = Fix.Dials(rig, TestDevices.Galleon, 2, 2);
        await rig.AdvanceAsync(200);
        var undo = Fix.Key(rig, keys, "edit.undo");
        var size = Fix.Dial(rig, dials, "brush.size");
        rig.Input.Clear();
        rig.Engine.DialRotate(size, 4, Fix.Rot(rig, 4, size.Context));
        for (var i = 0; i < 2000 && rig.Input.Records.Count == 0; i++) await Task.Delay(1);
        rig.Engine.KeyDown(undo, Fix.Down(rig, undo.Context));
        rig.Engine.KeyUp(undo, Fix.Up(rig, undo.Context));
        await rig.IdleAsync();
        var downs = 0;
        foreach (var r in rig.Input.Records)
        {
            if (r.Kind == InputRecordKind.KeysDown) { downs++; Assert.Equal(1, downs, "two taps down at once: " + string.Join(", ", rig.KeysSent())); }
            if (r.Kind == InputRecordKind.KeysUp) downs--;
        }
        Assert.True(rig.KeysSent().Contains("down:Control+Z/sc"), string.Join(", ", rig.KeysSent()));
        Assert.Empty(rig.Input.HeldKeys);
    }

    [Test]
    public async Task E16_one_slots_release_never_drops_a_key_another_slot_still_holds()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var x = Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig));
        var h = (HoldBinding)Exec.Bind("""{ "kind": "hold", "chord": "Q", "mode": "whilePressed" }""");
        object slotA = new(), slotB = new();
        Assert.True((await rig.Engine.Executor.HoldDownAsync(h, x, slotA)).Ok);
        Assert.True((await rig.Engine.Executor.HoldDownAsync(h, x, slotB)).Ok);
        await rig.Engine.Executor.HoldUpAsync(h, slotA);
        Assert.Equal(VirtualKey.Q, Assert.Single(rig.Input.HeldKeys), "slot B still holds Q");
        await rig.Engine.Executor.HoldUpAsync(h, slotB);
        Assert.Empty(rig.Input.HeldKeys);
    }

    // ------------------------------------------------------------------ E4
    [Test]
    public async Task E4_a_confirm_hold_never_fires_into_the_page_that_is_replacing_it()
    {
        using var rig = new Rig();
        var github = Apps.Chrome with { Title = "Crash on start · Issue #12 · example/demo · GitHub - Google Chrome" };
        await rig.FrontAsync(github);
        var keys = Fix.Keys(rig, TestDevices.XL);
        await rig.AdvanceAsync(200);
        var comment = Fix.Key(rig, keys, "gh.comment");
        rig.Engine.KeyDown(comment, Fix.Down(rig, comment.Context));
        await rig.AdvanceAsync(200);
        rig.Foreground.Set(Apps.Chrome with { Title = "Inbox (3) - someone@example.com - Gmail - Google Chrome" });
        await rig.AdvanceAsync(300);
        Assert.True(rig.Engine.Context.PendingTarget is not null, "a switch to Gmail waits for the hold");
        rig.Engine.KeyHoldReached(comment, Fix.Down(rig, comment.Context));
        await rig.IdleAsync();
        Assert.Empty(rig.KeysSent());
        Assert.Equal("PAGE CHANGED", rig.Engine.View(comment).Flash);
        rig.Engine.KeyUp(comment, Fix.Up(rig, comment.Context));
        await rig.AdvanceAsync(300);

        // Without a page change the same hold fires.
        await rig.FrontAsync(github);
        await rig.AdvanceAsync(300);
        comment = Fix.Key(rig, keys, "gh.comment");
        rig.Engine.KeyDown(comment, Fix.Down(rig, comment.Context));
        await rig.AdvanceAsync(700);
        rig.Engine.KeyHoldReached(comment, Fix.Down(rig, comment.Context));
        await rig.IdleAsync();
        Assert.Equal("Control+Enter", Assert.Single(rig.KeysSent()));
        rig.Engine.KeyUp(comment, Fix.Up(rig, comment.Context));
    }

    // ------------------------------------------------------------------ E5
    [Test]
    public async Task E5_a_held_key_goes_up_as_soon_as_its_app_leaves_the_front()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        var keys = Fix.Keys(rig, TestDevices.XL);
        await rig.AdvanceAsync(200);
        var rotate = Fix.Key(rig, keys, "camera.rotateLeft");
        rig.Engine.KeyDown(rotate, Fix.Down(rig, rotate.Context));
        await rig.AdvanceAsync(100);
        Assert.Equal(VirtualKey.Q, Assert.Single(rig.Input.HeldKeys));
        rig.Foreground.InFront = false;
        rig.Foreground.Set(Apps.Notepad);
        await rig.AdvanceAsync(50);
        Assert.Empty(rig.Input.HeldKeys);
        Assert.Equal("WINDOW CHANGED", rig.Engine.View(rotate).Flash);
        rig.Engine.KeyUp(rotate, Fix.Up(rig, rotate.Context));
        await rig.IdleAsync();
        Assert.Empty(rig.Input.HeldKeys);
    }

    // ------------------------------------------------------------------ E6
    [Test]
    public async Task E6_a_module_verbs_own_confirm_safety_wins()
    {
        var json = TestPacks.Minimal();
        ((JsonObject)json["verbs"]![0]!)["binding"] = new JsonObject { ["kind"] = "module", ["verb"] = "fakepower.shutdown", ["status"] = "exists" };
        var pack = TestPacks.Parse(json);
        using var rig = new Rig([pack]);
        var prov = new FakeVerbProvider("fakepower");
        prov.VerbList.Add(new VerbDescriptor { Id = "fakepower.shutdown", Label = "SHUT DOWN", Safety = "confirm" });
        rig.Verbs.Register(prov);
        await rig.FrontAsync(Fix.ExampleApp);
        var keys = Fix.Keys(rig, TestDevices.Galleon);
        await rig.AdvanceAsync(200);
        var k = Fix.Key(rig, keys, "app.save");
        Assert.Equal(Safety.Confirm, rig.Engine.View(k).Safety);
        rig.Engine.KeyDown(k, Fix.Down(rig, k.Context));
        await rig.IdleAsync();
        Assert.Empty(prov.Invocations);
        await rig.AdvanceAsync(700);
        rig.Engine.KeyHoldReached(k, Fix.Down(rig, k.Context));
        await rig.IdleAsync();
        Assert.Single(prov.Invocations);
        rig.Engine.KeyUp(k, Fix.Up(rig, k.Context));
    }

    // ------------------------------------------------------------------ E7
    [Test]
    public void E7_an_unknown_safety_fails_closed_to_confirm_with_an_error()
    {
        var json = TestPacks.Minimal();
        ((JsonObject)json["verbs"]![0]!)["safety"] = "confirmed";
        ((JsonObject)json["verbs"]![1]!)["safety"] = "never_auto";
        var problems = new List<PackProblem>();
        var pack = TestPacks.Parse(json, problems);
        Assert.Equal(Safety.Confirm, pack.Verbs[0].Safety);
        Assert.Equal(Safety.Confirm, pack.Verbs[1].Safety);
        Assert.Equal(2, problems.Count(p => p.Severity == ProblemSeverity.Error && p.Message.Contains("unknown safety")));
        Assert.Equal(Safety.Safe, TestPacks.Parse(TestPacks.Minimal()).Verbs[0].Safety, "a pack that says safe stays safe");
    }

    // ------------------------------------------------------------------ E8
    [Test]
    public void E8_file_readouts_respect_neverRead_and_take_bare_file_names_only()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-smart-fix-e8", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dir, "config"));
        try
        {
            File.WriteAllText(Path.Combine(dir, "secret.xml"), "<root><Token>fictional-token-0000</Token></root>");
            File.WriteAllText(Path.Combine(dir, "config", "game.xml"), "<root><Size>7</Size></root>");
            JsonObject Pack(bool neverRead) => new()
            {
                ["storage"] = "file", ["summary"] = "x", ["neverRead"] = neverRead, ["confidence"] = "official",
                ["locations"] = new JsonArray(new JsonObject { ["path"] = Path.Combine(dir, "config", "settings.json"), ["format"] = "json" }),
            };
            var json = TestPacks.Minimal();
            json["userBindings"] = Pack(neverRead: false);
            var open = TestPacks.Parse(json);
            json["userBindings"] = Pack(neverRead: true);
            var secret = TestPacks.Parse(json);
            var reader = new FileFieldReader(new RebindPaths());
            Assert.Equal("7", reader.Read(open, "game.xml Size", DateTimeOffset.UtcNow).Text, "a bare name next to the rebind file is read");
            Assert.Equal(ReadoutConfidence.Unknown, reader.Read(secret, "game.xml Size", DateTimeOffset.UtcNow).Confidence, "neverRead: never opened");
            foreach (var spec in new[] { @"..\secret.xml Token", "../secret.xml Token", Path.Combine(dir, "secret.xml") + " Token", @"sub\game.xml Size", "game.xml:alt Size" })
                Assert.Equal(ReadoutConfidence.Unknown, reader.Read(open, spec, DateTimeOffset.UtcNow).Confidence, spec);
            Assert.True(FileFieldReader.IsBareFileName("Game_remote.config.xml"));
            Assert.False(FileFieldReader.IsBareFileName(".."));
        }
        finally { try { Directory.Delete(dir, true); } catch { /* best effort */ } }
    }

    // ------------------------------------------------------------------ E9
    [Test]
    public void E9_a_user_bind_that_takes_another_commands_key_marks_it_key_taken()
    {
        var vscode = TestPacks.Get("vscode");
        var victim = vscode.FindVerb("general.commandPalette")!;
        var set = new VsCodeKeybindingsAdapter().Parse("""[ { "key": "ctrl+shift+p", "command": "workbench.action.closeAllEditors" } ]""", out _)!;
        var after = RebindAdapters.Apply(vscode, set, out _).FindVerb(victim.Id)!;
        Assert.True(after.Binding is UnboundBinding { Reason: "key-taken" }, after.Binding.Describe());
        // A when-clause bind takes the key only somewhere: not marked.
        var when = new VsCodeKeybindingsAdapter().Parse("""[ { "key": "ctrl+shift+p", "command": "x.y", "when": "editorFocus" } ]""", out _)!;
        Assert.Equal(victim.Binding.Describe(), RebindAdapters.Apply(vscode, when, out _).FindVerb(victim.Id)!.Binding.Describe());
        // Re-binding the same command to its own default key is not "taken".
        var same = new VsCodeKeybindingsAdapter().Parse("""[ { "key": "ctrl+shift+p", "command": "workbench.action.showCommands" } ]""", out _)!;
        Assert.False(RebindAdapters.Apply(vscode, same, out _).FindVerb(victim.Id)!.Binding is UnboundBinding);

        var wt = TestPacks.Get("windows-terminal");
        var tab = wt.FindVerb("tab.new")!;
        var wset = new WindowsTerminalSettingsAdapter().Parse("""{ "keybindings": [ { "keys": "ctrl+shift+t", "id": "User.myScript" } ] }""", out _)!;
        Assert.True(RebindAdapters.Apply(wt, wset, out _).FindVerb(tab.Id)!.Binding is UnboundBinding { Reason: "key-taken" }, "Windows Terminal User.* ids take keys too");
    }

    [Test]
    public async Task E9_a_taken_key_shows_KEY_TAKEN_and_sends_nothing_or_its_own_fallback()
    {
        var vscode = TestPacks.Get("vscode");
        var set = new VsCodeKeybindingsAdapter().Parse("""[ { "key": "ctrl+p", "command": "workbench.action.closeAllEditors" }, { "key": "ctrl+shift+p", "command": "workbench.action.closeAllEditors" } ]""", out _)!;
        using var rig = new Rig([.. TestPacks.All.Where(p => p.Id != "vscode"), RebindAdapters.Apply(vscode, set, out _)]);
        await rig.FrontAsync(Apps.VsCode);
        var keys = Fix.Keys(rig, TestDevices.XL);
        await rig.AdvanceAsync(200);
        var open = Fix.Key(rig, keys, "general.quickOpen");
        Assert.Equal("KEY TAKEN", rig.Engine.View(open).Availability.Label);
        rig.Engine.KeyDown(open, Fix.Down(rig, open.Context));
        rig.Engine.KeyUp(open, Fix.Up(rig, open.Context));
        await rig.IdleAsync();
        Assert.Empty(rig.KeysSent(), "Ctrl+P now closes every editor: never pressed");
        // COMMANDS has its own alternative (F1): it presses that, never the taken Ctrl+Shift+P.
        var palette = Fix.Key(rig, keys, "general.commandPalette");
        rig.Engine.KeyDown(palette, Fix.Down(rig, palette.Context));
        rig.Engine.KeyUp(palette, Fix.Up(rig, palette.Context));
        await rig.IdleAsync();
        Assert.Equal("F1", Assert.Single(rig.KeysSent()));
    }

    // ------------------------------------------------------------------ E10
    [Test]
    public async Task E10_a_macro_stops_after_a_sight_step_it_could_not_verify()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        rig.SightFake.Located.Add("pc2.builder.tab.testing");
        rig.SightFake.Unverified.Add("pc2.builder.tab.testing");
        var macro = Exec.Bind("""{ "kind": "macro", "gapMs": 50, "steps": [ { "kind": "sightClick", "sight": "pc2.builder.tab.testing" }, { "kind": "chord", "chord": "Enter" } ] }""");
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(macro, Exec.For(rig, "planet-coaster-2", Fix.Down(rig, "k"))));
        Assert.Equal(ExecOutcome.NotVerified, r.Outcome, r.Message);
        Assert.Equal("NOT VERIFIED", r.Flash);
        Assert.Empty(rig.KeysSent());
        // As the LAST step it is fine (nothing comes after it).
        var last = Exec.Bind("""{ "kind": "macro", "gapMs": 50, "steps": [ { "kind": "chord", "chord": "Enter" }, { "kind": "sightClick", "sight": "pc2.builder.tab.testing" } ] }""");
        Assert.True((await rig.Pump(rig.Engine.Executor.RunAsync(last, Exec.For(rig, "planet-coaster-2", Fix.Down(rig, "k2"))))).Ok);
    }

    // ------------------------------------------------------------------ E11
    [Test]
    public async Task E11_a_queued_turn_is_never_sent_into_another_window_of_the_app()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.SightFake.Visible.Add("pc2.terrain.panel");
        rig.SightFake.Publish();
        await rig.AdvanceAsync(700);
        var dials = Fix.Dials(rig, TestDevices.Galleon, 2, 2);
        await rig.AdvanceAsync(200);
        var size = Fix.Dial(rig, dials, "brush.size");
        rig.Input.Clear();
        rig.Engine.DialRotate(size, 1, Fix.Rot(rig, 1, size.Context));
        for (var i = 0; i < 2000 && rig.Input.Records.Count == 0; i++) await Task.Delay(1);
        for (var i = 0; i < 3; i++) rig.Engine.DialRotate(size, 1, Fix.Rot(rig, 1, size.Context));
        // A second window of the same game comes to the front (the deck follows it silently: same pack and context).
        rig.Foreground.Set(Apps.PlanetCoaster2 with { Hwnd = 0x1002, Title = "Planet Coaster 2 (2)" });
        await rig.IdleAsync();
        Assert.Equal(1, rig.KeysSent().Count(k => k.StartsWith("down:", StringComparison.Ordinal)), string.Join(", ", rig.KeysSent()));
    }

    // ------------------------------------------------------------------ E13
    [Test]
    public async Task E13_no_base_layer_keys_under_a_display_only_pack()
    {
        var shown = TestPacks.Parse(TestPacks.Minimal(input: "display-only"));
        using var rig = new Rig([shown, TestPacks.Get("windows-shell")]);
        await rig.FrontAsync(Fix.ExampleApp);
        var keys = Fix.Keys(rig, TestDevices.Galleon);
        await rig.AdvanceAsync(200);
        Assert.Equal("example-app", rig.Engine.Context.Current.Pack?.Id);
        var layout = rig.Engine.LayoutFor(TestDevices.Galleon.Id);
        Assert.False(layout.Keys.Values.OfType<VerbKey>().Any(v => v.From is not null), layout.Describe());
        // The layout rule and the engine both refuse it (a stale layout can't send through the base layer either).
        Assert.False(SmartEngine.UnderlayAllowed(shown));
        Assert.True(SmartEngine.UnderlayAllowed(TestPacks.Get("vscode")));
    }

    // ------------------------------------------------------------------ E14
    [Test]
    public async Task E14_a_global_verb_runs_every_step_with_the_app_in_the_background()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Chrome);
        rig.Foreground.InFront = false;
        var seq = Exec.Bind("""{ "kind": "sequence", "steps": [ "Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3" ], "gapMs": 40 }""");
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(seq, Exec.For(rig, "chromium-browser", Fix.Down(rig, "k"), global: true)));
        Assert.True(r.Ok, r.Message);
        Assert.Equal(3, rig.KeysSent().Count);
    }

    // ------------------------------------------------------------------ E15
    [Test]
    public void E15_the_users_own_files_win_over_the_ai_file_whatever_their_names()
    {
        var lib = new PackLibrary(() => PackLibrary.Embedded().Concat(
        [
            new PackSourceFile("user:a-mine.json", PackOrigin.User, """{ "id": "vscode", "verbs": [ { "id": "general.quickOpen", "label": "MINE" } ] }"""),
            new PackSourceFile("user:vscode.ai.json", PackOrigin.User, """{ "id": "vscode", "verbs": [ { "id": "general.quickOpen", "label": "AI" } ] }"""),
        ]));
        lib.Reload();
        Assert.Equal("MINE", lib.Find("vscode")!.FindVerb("general.quickOpen")!.Label);
    }

    // ------------------------------------------------------------------ decision 4
    [Test]
    public async Task D4_every_press_rechecks_the_window_and_stops_with_WINDOW_CHANGED()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Chrome);
        var rep = Exec.Bind("""{ "kind": "repeat", "chord": "Ctrl+Tab", "count": 5, "intervalMs": 40 }""");
        var run = rig.Engine.Executor.RunAsync(rep, Exec.For(rig, "chromium-browser", Fix.Down(rig, "k")));
        await Fix.WaitForRecordsAsync(rig, 2);
        // Another Chrome window (same process) comes to the front between two presses.
        rig.Foreground.Set(Apps.Chrome with { Hwnd = 0x2002 });
        var r = await rig.Pump(run);
        Assert.Equal(ExecOutcome.WindowChanged, r.Outcome);
        Assert.Equal("WINDOW CHANGED", r.Flash);
        Assert.Equal(2, rig.KeysSent().Count);

        // A whilePressed hold-down and a scancode tap are re-checked too.
        rig.Input.Clear();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var x = Exec.For(rig, "planet-coaster-2", Fix.Down(rig, "k3"));
        rig.Foreground.InFront = false;
        var h = (HoldBinding)Exec.Bind("""{ "kind": "hold", "chord": "Q", "mode": "whilePressed" }""");
        Assert.Equal(ExecOutcome.NotInFront, (await rig.Engine.Executor.HoldDownAsync(h, x, new object())).Outcome);
        Assert.Empty(rig.Input.Records);
    }

    [Test]
    public async Task D4_a_wheel_turn_rechecks_the_window_before_every_notch()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Chrome);
        var wheel = Exec.Bind("""{ "kind": "mouse", "button": "wheelDown" }""");
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(wheel, Exec.For(rig, "chromium-browser", Fix.Down(rig, "k")), times: 4));
        Assert.True(r.Ok, r.Message);
        Assert.Equal(4, rig.Mouse.Records.Count, "one call per notch");
    }
}

public class AiFixTests
{
    private const string Vs = "vscode";

    private static object Verb(string id, object set) => new { pack = Vs, items = new[] { new { type = "verb", id, set } } };

    // ------------------------------------------------------------------ B1
    [Test]
    public async Task B1_strictness_ranks_safe_never_auto_confirm_and_only_goes_up()
    {
        Assert.True(SafetyRules.Rank(Safety.Safe) < SafetyRules.Rank(Safety.NeverAuto) && SafetyRules.Rank(Safety.NeverAuto) < SafetyRules.Rank(Safety.Confirm));
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        var close = ai.Library.Find("chromium-browser")!.FindVerb("window.close")!;
        Assert.Equal(Safety.Confirm, close.Safety);
        Assert.Equal("not_allowed", ai.Refused("override", new { pack = "chromium-browser", items = new[] { new { type = "verb", id = "window.close", set = new { safety = "never-auto" } } } }).Code, "confirm → never-auto loosens");
        Assert.Equal("not_allowed", ai.Refused("override", new { pack = "chromium-browser", items = new[] { new { type = "verb", id = "window.close", set = new { safety = "safe" } } } }).Code);
        ai.Call("override", Verb("general.quickOpen", new { safety = "never-auto" }));
        Assert.Equal(Safety.NeverAuto, ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.Safety);
        Assert.Equal("not_allowed", ai.Refused("override", Verb("general.quickOpen", new { safety = "safe" })).Code);
        ai.Call("override", Verb("general.quickOpen", new { safety = "confirm" }));
        Assert.Equal(Safety.Confirm, ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.Safety);
        var undone = ai.Call("undo", new { steps = 2 });
        Assert.Equal(Safety.Confirm, ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.Safety, "an undo never loosens safety");
        Assert.Contains("safety", undone["kept"]!.ToJsonString());
    }

    [Test]
    public async Task B1_never_auto_runs_once_per_deliberate_press_never_from_a_turn_or_a_repeat()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Chrome);
        var x = Exec.For(rig, "chromium-browser", Fix.Down(rig, "k")) with { Safety = Safety.NeverAuto };
        var rep = Exec.Bind("""{ "kind": "repeat", "chord": "Ctrl+W", "count": 3, "intervalMs": 40 }""");
        Assert.True((await rig.Pump(rig.Engine.Executor.RunAsync(rep, x))).Ok);
        Assert.Equal(1, rig.KeysSent().Count, "no repeats");
        var turn = x with { Kind = VerbGestureKind.DialTurn };
        Assert.Equal(ExecOutcome.PolicyBlocked, (await rig.Engine.Executor.RunAsync(rep, turn)).Outcome, "never from a dial turn");
        Assert.Equal(ExecOutcome.PolicyBlocked, (await rig.Engine.Executor.RunAsync(rep, x with { Gesture = null })).Outcome, "never without a deck gesture (another verb, a macro, a module)");

        // On the deck: a second press of a never-auto key within the gap is ignored.
        var json = TestPacks.Minimal();
        ((JsonObject)json["verbs"]![0]!)["safety"] = "never-auto";
        using var deckRig = new Rig([TestPacks.Parse(json)]);
        await deckRig.FrontAsync(Fix.ExampleApp);
        var keys = Fix.Keys(deckRig, TestDevices.Galleon);
        await deckRig.AdvanceAsync(200);
        var save = Fix.Key(deckRig, keys, "app.save");
        for (var i = 0; i < 2; i++)
        {
            deckRig.Engine.KeyDown(save, Fix.Down(deckRig, save.Context));
            deckRig.Engine.KeyUp(save, Fix.Up(deckRig, save.Context));
            await deckRig.AdvanceAsync(100);
        }
        await deckRig.IdleAsync();
        Assert.Equal("Control+S", Assert.Single(deckRig.KeysSent()));
        await deckRig.AdvanceAsync(600);
        deckRig.Engine.KeyDown(save, Fix.Down(deckRig, save.Context));
        deckRig.Engine.KeyUp(save, Fix.Up(deckRig, save.Context));
        await deckRig.IdleAsync();
        Assert.Equal(2, deckRig.KeysSent().Count, "a later, deliberate press runs again");
    }

    // ------------------------------------------------------------------ B2
    [Test]
    public void B2_the_denylist()
    {
        foreach (var c in new[] { "Alt+F4", "LAlt+F4", "Ctrl+Alt+F4", "Win+L", "Win+R", "Win+X", "Win+D", "LWin", "Win+Shift+S", "Ctrl+Alt+Delete", "Ctrl+Alt+End",
                     "Ctrl+Alt+Tab", "Ctrl+Alt+Left", "Ctrl+Shift+Esc", "Ctrl+Esc", "PrintScreen", "Alt+PrintScreen", "Ctrl+PrintScreen", "Alt+Tab", "Alt+Esc", "Alt+Space" })
            Assert.NotNull(ChordPolicy.AiForbidden(Chord.Parse(c)), c + " must be refused");
        foreach (var c in new[] { "Ctrl+Alt+F12", "Ctrl+Shift+P", "Ctrl+Z", "F5", "Alt+F", "Ctrl+Alt+Z", "Shift+F4" })
            Assert.Null(ChordPolicy.AiForbidden(Chord.Parse(c)), c + " is fine");
    }

    [Test]
    public async Task B2_an_ai_binding_is_a_proposal_until_the_user_holds_its_REVIEW_key_on_a_physical_deck()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        await ai.Rig.FrontAsync(Apps.VsCode);
        ai.Call("pin", new { app = Vs, device = "galleon-100-sd", kind = "key", x = 2, y = 1, item = "general.quickOpen" });
        var r = ai.Call("override", Verb("general.quickOpen", new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F12" } }));
        Assert.Equal(SmartOps.PendingStatus, (string?)r["pending"]![0]!["status"]);
        await ai.Rig.AdvanceAsync(300);
        var key = ai.Keys[1 * 3 + 2];
        var slot = Deck.SlotOf(key.Action);
        Assert.Equal("Ctrl+Alt+F12", ai.Rig.Engine.View(slot).Review, "REVIEW: the face shows the proposal");
        key.AssertFramesAreDeckSafe();

        // A tap sends nothing (neither the old key nor the new one) and says how to approve.
        var n = ai.Rig.KeysSent().Count;
        await key.PressAsync(TimeSpan.FromMilliseconds(80));
        await ai.Rig.IdleAsync();
        Assert.Equal(n, ai.Rig.KeysSent().Count);
        Assert.Equal("HOLD TO OK", ai.Rig.Engine.View(slot).Flash);

        // The hold shows the new key and approves it.
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(800));
        Assert.InRange(ai.Rig.Engine.View(slot).ReviewProgress ?? -1, 0.4, 0.7);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(900));
        await key.KeyUpAsync();
        await ai.Rig.AdvanceAsync(300);
        Assert.Equal(n, ai.Rig.KeysSent().Count, "approving sends nothing");
        var v = ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!;
        Assert.Null(v.PendingBinding);
        Assert.Equal("Ctrl+Alt+F12", v.Binding.Describe());
        Assert.Equal(Safety.Confirm, v.Safety, "an AI-rebound verb is confirm for good");
        Assert.True(v.AiBound);
        var view = ai.Rig.Engine.View(slot);
        Assert.True(view.AiBound && view.Review is null && view.Safety == Safety.Confirm);
        Assert.Contains("review.approve", string.Join(",", ai.Log.RecentAudit(5).Select(e => (string?)e["kind"])));

        // Now a tap does nothing (confirm) and a 700 ms hold sends the approved key.
        await key.PressAsync(TimeSpan.FromMilliseconds(80));
        await ai.Rig.IdleAsync();
        Assert.Equal(n, ai.Rig.KeysSent().Count);
        await key.PressAsync(TimeSpan.FromMilliseconds(800));
        await ai.Rig.IdleAsync();
        Assert.Equal("Control+Alt+F12", ai.Rig.KeysSent()[^1]);
        // The user's own pack file can still say otherwise (aiBound: false); the assistant can't.
        Assert.Equal("not_allowed", ai.Refused("override", Verb("general.quickOpen", new { safety = "safe" })).Code);
    }

    [Test]
    public async Task B2_a_virtual_deck_never_approves_and_the_PI_approves_or_rejects()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        await ai.Rig.FrontAsync(Apps.VsCode);
        var mcp = await ai.KeyAsync(AiRig.McpDeck, 0, 0);
        await ai.Rig.AdvanceAsync(300);
        // Whatever keyboard verb the MCP Deck's key shows gets a proposal.
        var onMcp = (ai.Rig.Engine.LayoutFor(AiRig.McpDeck.Id).KeyAt(new KeySlot(0, 0)) as VerbKey)?.Verb ?? throw new AssertException("no verb on the MCP Deck key");
        Assert.True(onMcp.Binding is ChordBinding, onMcp.Id);
        ai.Call("override", Verb(onMcp.Id, new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F8" } }));
        await ai.Rig.AdvanceAsync(300);
        Assert.Equal("Ctrl+Alt+F8", ai.Rig.Engine.View(Deck.SlotOf(mcp.Action)).Review);
        await mcp.KeyDownAsync();
        await mcp.AdvanceAsync(TimeSpan.FromSeconds(3));
        await mcp.KeyUpAsync();
        Assert.NotNull(ai.Library.Find(Vs)!.FindVerb(onMcp.Id)!.PendingBinding, "an AI can press the MCP Deck itself: it never approves");
        Assert.Equal("REVIEW IN PI", ai.Rig.Engine.View(Deck.SlotOf(mcp.Action)).Flash);
        Assert.Null(ai.Ops.RejectReview(Vs, onMcp.Id, "property inspector"));
        ai.Call("override", Verb("general.quickOpen", new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F11" } }));

        // The PI lists it, and Reject removes it (the old key stays).
        var reviews = ai.Ops.PendingReviews();
        Assert.Equal("Ctrl+Alt+F11", Assert.Single(reviews).Chord);
        Assert.Null(ai.Ops.RejectReview(Vs, "general.quickOpen", "property inspector"));
        Assert.Null(ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.PendingBinding);
        Assert.Equal("Ctrl+P", ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.Binding.Describe());
        Assert.Empty(ai.Ops.PendingReviews());
        // Approve from the PI.
        ai.Call("override", Verb("general.quickOpen", new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F11" } }));
        Assert.Null(ai.Ops.ApproveReview(Vs, "general.quickOpen", "property inspector"));
        Assert.Equal("Ctrl+Alt+F11", ai.Library.Find(Vs)!.FindVerb("general.quickOpen")!.Binding.Describe());
        Assert.NotNull(ai.Ops.ApproveReview(Vs, "general.quickOpen", "property inspector"), "nothing left to approve");
        // The pipe has no operation for any of it.
        Assert.False(SmartOps.Operations.Any(o => o.Contains("review") || o.Contains("approve")));
    }

    [Test]
    public async Task B2_denylisted_chords_global_hotkeys_and_streamer_safe_off_are_refused()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        foreach (var chord in new[] { "Alt+F4", "Win+R", "Win+L", "Win+X", "Ctrl+Shift+Esc", "Ctrl+Alt+Delete", "PrintScreen" })
        {
            var e = ai.Refused("override", Verb("general.quickOpen", new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord } }));
            Assert.Equal("not_allowed", e.Code, chord);
            Assert.True((bool)e.Detail!["denylisted"]!, chord);
        }
        Assert.False(File.Exists(Path.Combine(ai.UserPacks, Vs + ".ai.json")), "nothing was written");
        // A verb that is the app's own system-wide hotkey can't get an AI key.
        Directory.CreateDirectory(ai.UserPacks);
        var json = TestPacks.Minimal();
        ((JsonObject)json["verbs"]![0]!)["scope"] = "global";
        File.WriteAllText(Path.Combine(ai.UserPacks, "example-app.json"), json.ToJsonString());
        ai.Library.Reload();
        Assert.Equal("not_allowed", ai.Refused("override", new { pack = "example-app", items = new[] { new { type = "verb", id = "app.save", set = new Dictionary<string, object> { ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F9" } } } } }).Code);
        // Streamer-safe: on yes, off never (the user can, in the PI).
        ai.Call("prefs.set", new { patch = new { streamerSafe = true } });
        var off = ai.Refused("prefs.set", new { patch = new { streamerSafe = false } });
        Assert.Equal("not_allowed", off.Code);
        Assert.True(ai.Rig.Engine.Preferences.StreamerSafe);
        var mixed = ai.Call("prefs.set", new { patch = new { streamerSafe = false, bigIcons = true } });
        Assert.Contains("streamerSafe", mixed["refused"]!.ToJsonString());
        Assert.True(ai.Rig.Engine.Preferences.StreamerSafe && ai.Rig.Engine.Preferences.BigIcons);
    }

    // ------------------------------------------------------------------ B3
    [Test]
    public async Task B3_every_operation_needs_this_pairings_secret()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        await ai.PairAsync(key);
        var other = Assert.Throws<OpException>(() => ai.Ops.Handle("prefs.set", new JsonObject { ["patch"] = new JsonObject { ["labelSize"] = "large" } }, "Some Other Process"));
        Assert.Equal("not_paired", other.Code, "a client without the secret is not served");
        var wrong = Assert.Throws<OpException>(() => ai.Ops.Handle("prefs.get", new JsonObject { ["pairingSecret"] = new string('0', 64) }, "x"));
        Assert.Equal("not_paired", wrong.Code);
        Assert.Equal("normal", ai.Rig.Engine.Preferences.LabelSize);
        ai.Call("prefs.get");
        // A second poll never hands the secret out again.
        var pairs = ai.Log.RecentAudit(10);
        Assert.False(pairs.Any(e => e.ToJsonString().Contains(ai.Secret!)), "the secret is never audited");
        // Revoked: the old secret is dead; a new pairing makes a new one.
        var old = ai.Secret;
        ai.Pairing.Revoke("revoked in the property inspector");
        Assert.Equal("not_paired", ai.Refused("prefs.get").Code);
        await key.AdvanceAsync(TimeSpan.FromSeconds(4));
        ai.Secret = null;
        await ai.PairAsync(key);
        Assert.NotEqual(old, ai.Secret);
        ai.Call("prefs.get");
        Assert.Equal("not_paired", Assert.Throws<OpException>(() => ai.Ops.Handle("prefs.get", new JsonObject { ["pairingSecret"] = old }, "x")).Code);
    }

    // ------------------------------------------------------------------ B4
    [Test]
    public async Task B4_undo_puts_back_only_the_fields_it_changed()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        ai.Call("prefs.set", new { patch = new { labelSize = "large" } });
        var verb = ai.Library.Find(Vs)!.Verbs[0].Id;
        ai.Rig.Engine.EditPreferences(p => { p.StreamerSafe = true; p.Apps[Vs] = new AppPreferences { Pins = [new() { Device = "galleon-100-sd", Kind = "key", X = 2, Y = 2, Item = verb }] }; });
        ai.Call("undo");
        var p2 = ai.Rig.Engine.Preferences;
        Assert.Equal("normal", p2.LabelSize);
        Assert.True(p2.StreamerSafe, "the user's later edit stays");
        Assert.Single(p2.For(Vs).Pins);
        // Overrides: the user's own later edit of another field of the same file is kept too.
        ai.Call("override", Verb(verb, new { label = "AI LABEL" }));
        var file = Path.Combine(ai.UserPacks, Vs + ".ai.json");
        var j = JsonNode.Parse(File.ReadAllText(file))!.AsObject();
        ((JsonObject)j["verbs"]![0]!)["glyph"] = "star";
        File.WriteAllText(file, j.ToJsonString());
        ai.Call("undo");
        var after = JsonNode.Parse(File.ReadAllText(file))!.AsObject();
        Assert.Null(after["verbs"]![0]!["label"]);
        Assert.Equal("star", (string?)after["verbs"]![0]!["glyph"]);
    }

    // ------------------------------------------------------------------ B5
    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task B5_a_stale_copy_of_the_smart_section_is_never_applied_and_switching_ai_off_rewrites_the_fresh_object()
    {
        var root = Path.Combine(Path.GetTempPath(), "prism-smart-fix-b5", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var saved = Environment.GetEnvironmentVariable(DesktopPaths.DirEnv);
        Environment.SetEnvironmentVariable(DesktopPaths.DirEnv, Path.Combine(root, "control"));
        using var cts = new CancellationTokenSource();
        var module = new SmartModule();
        var globals = new TestGlobalSettings(new JsonObject { ["smartai"] = new JsonObject { ["allowAi"] = true } });
        try
        {
            var ctx = new FixModuleContext(root, globals, cts.Token);
            module.Initialize(ctx);
            var engine = ctx.Services.Get<SmartEngine>();
            engine.EditPreferences(p => p.LabelSize = "large");   // the plugin writes (a pin, a PI field): rev 1
            var mine = globals.Snapshot();
            Assert.Equal(1, (long)mine["smart"]!["rev"]!);

            // A property inspector saves another section from its OLD copy of the whole object (smart rev 0, small labels).
            var stale = (JsonObject)mine.DeepClone();
            stale["smart"] = new JsonObject { ["labelSize"] = "small", ["rev"] = 0 };
            stale["eq"] = new JsonObject { ["backend"] = "example" };
            globals.ReceiveFromStreamDeck(stale);
            Assert.Equal("large", engine.Preferences.LabelSize, "the stale section is not applied");
            var healed = globals.Snapshot();
            Assert.Equal("large", (string?)healed["smart"]!["labelSize"], "ours was written back over it");
            Assert.Equal("example", (string?)healed["eq"]!["backend"], "the other section from the app stays");

            // The user switches "Allow AI preferences" off: the plugin re-sends the fresh object at once (a write of the
            // plugin that raced the switch can't bring "on" back), and it never writes "smartai" as on by itself.
            var off = globals.Snapshot();
            off["smartai"] = new JsonObject { ["allowAi"] = false };
            var before = (long)off["smart"]!["rev"]!;
            globals.ReceiveFromStreamDeck(off);
            var now = globals.Snapshot();
            Assert.True((long)now["smart"]!["rev"]! > before, "re-sent");
            Assert.False((bool)now["smartai"]!["allowAi"]!);
        }
        finally
        {
            await module.DisposeAsync();
            cts.Cancel();
            Environment.SetEnvironmentVariable(DesktopPaths.DirEnv, saved);
            try { Directory.Delete(root, true); } catch { /* best effort */ }
        }
    }

    private sealed class FixModuleContext(string root, TestGlobalSettings globals, CancellationToken shutdown) : IModuleContext
    {
        public ILog Log { get; } = NullLog.Instance;
        public PrismControl.Core.Data.IDataRegistry Data => throw new NotSupportedException();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings => globals;
        public IPluginEvents Events { get; } = new NoEvents();
        public IDeviceDirectory Devices { get; } = new NoDevices();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => shutdown;
        public string PluginDirectory => Path.Combine(root, "plugin");
        public string DataDirectory => Path.Combine(root, "control", "modules", "smart");
        public void OpenUrl(string url) => throw new InvalidOperationException();
        public bool SafeMode => true;
    }

    private sealed class NoEvents : IPluginEvents
    {
        public event EventHandler<DeviceInfo>? DeviceConnected { add { } remove { } }
        public event EventHandler<string>? DeviceDisconnected { add { } remove { } }
        public event EventHandler? SystemWokeUp { add { } remove { } }
        public event EventHandler<string>? ApplicationLaunched { add { } remove { } }
        public event EventHandler<string>? ApplicationTerminated { add { } remove { } }
        public event EventHandler<string>? DeepLinkReceived { add { } remove { } }
        public event EventHandler? Connected { add { } remove { } }
        public event EventHandler? Disconnected { add { } remove { } }
    }

    private sealed class NoDevices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [];
        public DeviceInfo? Find(string deviceId) => null;
    }

    // ------------------------------------------------------------------ B LOWs
    [Test]
    public async Task BLow_a_second_pair_request_never_replaces_a_waiting_one_or_cancels_the_hold()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        ai.Call("pair");
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(2600));
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        Assert.Equal("pairing_pending", Assert.Throws<OpException>(() => ai.Ops.Handle("pair", null, "Spammer")).Code);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(1100));
        await key.KeyUpAsync();
        Assert.True(ai.Pairing.IsPaired);
        Assert.Equal("Test Assistant", ai.Pairing.PairedClient);
    }

    [Test]
    public async Task BLow_the_400_ms_guard_counts_from_when_a_key_became_the_prompt()
    {
        await using var ai = new AiRig();
        var first = await ai.GalleonAsync();
        ai.Call("pair");
        await first.AdvanceAsync(TimeSpan.FromSeconds(5));
        await first.DisappearAsync();
        var next = ai.Keys[1];
        Assert.True(ai.Pairing.IsPrompt(next.Context));
        Assert.False(ai.Pairing.HoldBegin(next.Context, next.Device), "the prompt only just moved here");
        await next.AdvanceAsync(TimeSpan.FromMilliseconds(450));
        Assert.True(ai.Pairing.HoldBegin(next.Context, next.Device));
    }

    [Test]
    public async Task BLow_a_revoked_pairing_polls_revoked_and_status_tells_unpaired_callers_nothing()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        await ai.Rig.FrontAsync(Apps.VsCode);
        var r = ai.Call("pair");
        var unpaired = ai.Ops.Handle("status", null, "Snooper").ToJsonString();
        foreach (var leak in new[] { (string)r["code"]!, (string)r["pairingId"]!, "Code.exe", "vscode", "Galleon" })
            Assert.DoesNotContain(leak, unpaired);
        Assert.Contains("\"pairingPending\":true", unpaired);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(1600));
        await key.KeyUpAsync();
        Assert.Equal("approved", (string?)ai.Call("pair", new { pairingId = (string)r["pairingId"]! })["status"]);
        Assert.Contains("vscode", ai.Call("status").ToJsonString(), "the paired client sees the engine");
        ai.Pairing.Revoke("revoked in the property inspector");
        Assert.Equal("revoked", (string?)ai.Call("pair", new { pairingId = (string)r["pairingId"]! })["status"]);
    }

    [Test]
    public async Task BLow_a_multi_step_undo_that_stops_early_audits_what_it_did()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        ai.Call("prefs.set", new { patch = new { appDebounceMs = 200 } });   // A
        ai.Call("prefs.set", new { patch = new { bigIcons = true } });        // B
        ai.Rig.Engine.EditPreferences(p => p.AppDebounceMs = 444);            // the user changes A's field
        var before = ai.Log.RecentAudit(200).Count;
        var e = ai.Refused("undo", new { steps = 2 });
        Assert.Equal("changed_since", e.Code);
        Assert.False(ai.Rig.Engine.Preferences.BigIcons, "B was undone");
        Assert.Equal(1, ai.Log.UndoDepth);
        var line = ai.Log.RecentAudit(1)[0];
        Assert.Equal(before + 1, ai.Log.RecentAudit(200).Count);
        Assert.Equal("undo", (string?)line["kind"]);
        Assert.Equal(1, (int)line["detail"]!["steps"]!);
    }

    [Test]
    public async Task BLow_partial_overrides_of_inherited_items_patch_them()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        ai.Call("override", new { pack = "site-github", items = new[] { new { type = "verb", id = "tab.close", set = new { priority = 99, label = "CLOSE IT" } } } });
        var v = ai.Library.Find("site-github")!.FindVerb("tab.close")!;
        Assert.Equal(99, v.Priority);
        Assert.Equal("CLOSE IT", v.Label);
        Assert.Equal(Safety.Confirm, v.Safety, "everything else is inherited");
        Assert.Equal(2, v.AltBindings.Count);
        // A complete redefinition still replaces (YouTube's own media.playPause is not a global hotkey like Chrome's).
        Assert.False(ai.Library.Find("site-youtube")!.FindVerb("media.playPause")!.IsGlobal);
    }

    [Test]
    public async Task BLow_the_audit_never_holds_secrets_tokens_or_window_titles()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        await ai.Rig.FrontAsync(Apps.VsCode);
        ai.Call("prefs.set", new { patch = new { labelSize = "large" } });
        ai.Call("override", Verb("general.quickOpen", new Dictionary<string, object> { ["label"] = "OPEN", ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F10" } }));
        ai.Call("explain", new { deviceId = TestDevices.Galleon.Id, kind = "key", x = 0, y = 0 });
        ai.Ops.ApproveReview(Vs, "general.quickOpen", "property inspector");
        Assert.Equal("changed_since", ai.Refused("undo").Code, "the user approved the proposal since");
        ai.Call("undo", new { force = true });
        var audit = File.ReadAllText(Path.Combine(ai.Dir, "audit.jsonl"));
        Assert.DoesNotContain(ai.Secret!, audit);
        Assert.DoesNotContain("pairingSecret", audit);
        Assert.DoesNotContain(Apps.VsCode.Title, audit);
        Assert.DoesNotContain("main.example.ts", audit);
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task BLow_the_rate_limit_is_for_the_whole_channel_not_per_connection()
    {
        await using var ai = new AiRig();
        await ai.GalleonAsync();
        var discovery = Path.Combine(ai.Dir, "ingress.json");
        await using var channel = new SmartControlChannel(ai.Ops, ai.Pairing, ai.Log, ai.Rig.Time, discovery);
        await channel.SetEnabledAsync(true);
        var d = DiscoveryFile.Read(discovery)!;
        var limited = 0;
        for (var c = 0; c < 3; c++)
        {
            // A new connection per call batch, like the MCP server: the bucket does not refill.
            using var pipe = new System.IO.Pipes.NamedPipeClientStream(".", (string)d["pipe"]!, System.IO.Pipes.PipeDirection.InOut, System.IO.Pipes.PipeOptions.Asynchronous | System.IO.Pipes.PipeOptions.CurrentUserOnly);
            await pipe.ConnectAsync(2000);
            await pipe.WriteAsync(PipeFraming.Encode(new JsonObject { ["v"] = 1, ["token"] = (string)d["token"]!, ["client"] = "x" }));
            for (var i = 0; i < 15; i++)
            {
                await pipe.WriteAsync(PipeFraming.Encode(new JsonObject { ["id"] = i, ["op"] = "status" }));
                var head = new byte[4];
                await pipe.ReadExactlyAsync(head);
                var body = new byte[BitConverter.ToInt32(head)];
                await pipe.ReadExactlyAsync(body);
                if (System.Text.Encoding.UTF8.GetString(body).Contains("rate_limited")) limited++;
            }
        }
        Assert.Equal(45 - SmartControlChannel.RequestBurst, limited, "3 connections × 15 calls share one burst of 40");
    }
}

public class PolishFixTests
{
    private static DeckLayout Gen(string pack, string ctx, DeviceGeometry geo, int page = 0) =>
        LayoutGenerator.Generate(new LayoutRequest(TestPacks.Get(pack), ctx, geo, [.. geo.AllKeys()], [.. geo.AllDials()], new SmartPreferences(), page,
            TestPacks.All.FirstOrDefault(p => p.Layer == PackLayer.Base)));

    [Test]
    public void PC1_builder_widgets_show_their_own_dials_and_ratings_have_their_own_key()
    {
        foreach (var geo in new[] { DeviceGeometry.Galleon, DeviceGeometry.Plus })
        {
            var l = Gen("planet-coaster", "trackBuilder", geo);
            foreach (var (slot, d) in l.Dials)
                if (d.Control is { Readout: { } own } && d.Readout is { } shown)
                    Assert.Equal(own, shown.Id, $"{geo.Kind} {slot}: the {d.Control.Label} widget shows another value");
            var ratings = l.Keys.Values.OfType<VerbKey>().SingleOrDefault(v => v.Verb.Id == "builder.ratings");
            Assert.NotNull(ratings, geo.Kind + ": a RATINGS key");
            Assert.Equal(VerbCategory.Readout, ratings!.Verb.Category);
            Assert.Equal("rideRatings", ratings.Verb.StateReadout);
        }
        // The same rule holds for PC2 (the polish fix) on both builder contexts.
        foreach (var ctx in new[] { "trackBuilder", "trackEditMode" })
            foreach (var (_, d) in Gen("planet-coaster-2", ctx, DeviceGeometry.Galleon).Dials)
                if (d.Control is { Readout: { } own } && d.Readout is { } shown) Assert.Equal(own, shown.Id, "PC2 " + ctx);
    }

    [Test]
    public void PC2_trackBuilder_on_the_XL_shows_one_DELETE()
    {
        var geo = DeviceGeometry.For(TestDevices.XL);
        var first = Gen("planet-coaster-2", "trackBuilder", geo);
        var all = Enumerable.Range(0, first.PageCount).SelectMany(p => Gen("planet-coaster-2", "trackBuilder", geo, p).Keys.Values.OfType<VerbKey>()).ToList();
        Assert.Equal(1, all.Count(v => v.Verb.Binding is ChordBinding { Chord: var c } && c.ToString() == "Delete"), string.Join(", ", all.Select(v => v.Verb.Id)));
        Assert.True(all.Any(v => v.Verb.Id == "builder.delete"), "the builder's own DELETE stays");
        // A user pin keeps the park DELETE on purpose.
        var prefs = new SmartPreferences();
        prefs.Apps["planet-coaster-2"] = new AppPreferences { Pins = [new SlotPin { Device = geo.Kind, Kind = "key", X = 0, Y = 3, Item = "edit.deleteSelected" }] };
        var pinned = LayoutGenerator.Generate(new LayoutRequest(TestPacks.Get("planet-coaster-2"), "trackBuilder", geo, [.. geo.AllKeys()], [.. geo.AllDials()], prefs, 0, null));
        Assert.Equal("edit.deleteSelected", (pinned.KeyAt(new KeySlot(0, 3)) as VerbKey)?.Verb.Id);
    }
}

/// <summary>Integration M1: the manifest validator checks every action image's size (Elgato's imageDimensions).</summary>
public class ManifestImageTests
{
    [Test]
    public void M1_every_smart_action_image_has_the_size_the_manifest_validator_expects()
    {
        var plugin = Path.Combine(Repo.RequireRoot(), "src", "PrismControl.Smart", "plugin");
        var checkedImages = 0;
        foreach (var type in new[] { typeof(Actions.SmartKeyAction), typeof(Actions.SmartDialAction) })
        {
            var a = (StreamDeckActionAttribute)Attribute.GetCustomAttribute(type, typeof(StreamDeckActionAttribute))!;
            Check(a.Uuid, "Icon", a.Icon, 20, 20);
            Check(a.Uuid, "KeyImage", a.KeyImage, 72, 72);
            Check(a.Uuid, "KeyImageAlt", a.KeyImageAlt, 72, 72);
            Check(a.Uuid, "EncoderIcon", a.EncoderIcon, 72, 72);
            Check(a.Uuid, "EncoderBackground", a.EncoderBackground, 200, 100);
        }
        Assert.True(checkedImages >= 5, "both actions' icons and key images, and the dial background, were checked");

        void Check(string uuid, string what, string? rel, int w, int h)
        {
            if (rel is null) return;
            var found = false;
            foreach (var ext in new[] { ".svg", ".png" })
            {
                var file = Path.Combine(plugin, rel.Replace('/', Path.DirectorySeparatorChar) + ext);
                if (!File.Exists(file)) continue;
                found = true;
                checkedImages++;
                var (iw, ih) = ImageSize(file);
                // The validator's rule: an SVG has the right aspect and is 1x or @2x wide; a PNG is exact (and its @2x twice that).
                var ok = ext == ".svg" ? Math.Abs(iw / ih - (double)w / h) < 0.01 && (iw == w || iw == w * 2) : iw == w && ih == h;
                Assert.True(ok, $"{uuid} {what} {rel}{ext} is {iw}x{ih}, the manifest expects {w}x{h} (or @2x)");
            }
            Assert.True(found, $"{uuid} {what}: {rel}.svg/.png does not exist");
        }
    }

    private static (double W, double H) ImageSize(string file)
    {
        var bytes = File.ReadAllBytes(file);
        if (bytes.Length > 24 && bytes[0] == 0x89 && bytes[1] == 0x50)
            return (System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16)), System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20)));
        var root = System.Text.RegularExpressions.Regex.Match(System.Text.Encoding.UTF8.GetString(bytes), @"<svg\b[^>]*>").Value;
        double Attr(string n) => double.Parse(System.Text.RegularExpressions.Regex.Match(root, $@"\s{n}=""([0-9.]+)").Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
        return (Attr("width"), Attr("height"));
    }
}
