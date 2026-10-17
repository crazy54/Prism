using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Packs;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

internal static class Exec
{
    public static DeckGesture KeyUp(Rig rig) => PrismControl.Smart.Execution.DeckGesture.FromDeckEvent(new KeyUpEvent("ctx", "com.jeremyfhall.prismcontrol.smart.key", "dev", new(0, 0), 0, null, false), rig.Time);
    public static DeckGesture Rotate(Rig rig, int ticks) => PrismControl.Smart.Execution.DeckGesture.FromDeckEvent(new DialRotateEvent("ctx", "com.jeremyfhall.prismcontrol.smart.dial", "dev", new(0, 0), ticks, false), rig.Time);
    public static DeckGesture Push(Rig rig) => PrismControl.Smart.Execution.DeckGesture.FromDeckEvent(new DialUpEvent("ctx", "com.jeremyfhall.prismcontrol.smart.dial", "dev", new(0, 0)), rig.Time);

    public static ExecContext For(Rig rig, string packId, DeckGesture? token = null, VerbGestureKind kind = VerbGestureKind.KeyPress, bool global = false) =>
        new(TestPacks.Get(packId), rig.Foreground.Current, token, kind, global);

    /// <summary>Runs a task that waits on the manual clock (inter-press gaps, timed holds) to completion.</summary>
    public static async Task<T> Pump<T>(this Rig rig, Task<T> task, int maxMs = 20_000)
    {
        for (var t = 0; !task.IsCompleted && t < maxMs; t += 5)
        {
            await Task.Delay(1);
            if (task.IsCompleted) break;
            rig.Time.Advance(TimeSpan.FromMilliseconds(5));
        }
        return await task;
    }

    public static Binding Bind(string json) => PackParser.ParseBinding(JsonNode.Parse(json)!.AsObject(), "test", []) ?? throw new AssertException("bad binding " + json);
}

public class BindingExecutionTests
{
    [Test]
    public async Task Chords_use_vk_for_apps_and_scancodes_for_games()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Terminal);
        var r = await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "chord", "chord": "Ctrl+Shift+T" }"""), Exec.For(rig, "windows-terminal"));
        Assert.True(r.Ok, r.Message);
        Assert.Equal("Control+Shift+T", Assert.Single(rig.KeysSent()));
        rig.Input.Clear();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        r = await rig.Pump(rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "chord", "chord": "Ctrl+Z" }"""), Exec.For(rig, "planet-coaster-2")));
        Assert.True(r.Ok, r.Message);
        AssertExtra.Equal(["down:Control+Z/sc", "up:Control+Z"], rig.KeysSent());
    }

    [Test]
    public async Task Cobra_packs_hold_each_tap_for_the_pack_hold_time()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "chord", "chord": "Z" }"""), Exec.For(rig, "planet-coaster-2"), times: 2, intervalMs: 40));
        Assert.True(r.Ok, r.Message);
        var s = rig.Stamped.Stamps;
        AssertExtra.Equal(["down", "up", "down", "up"], s.Select(x => x.What));
        Assert.True(s[1].At - s[0].At >= TimeSpan.FromMilliseconds(50), "held 50 ms (keyHoldMs default for scancode packs)");
        Assert.True(s[2].At - s[1].At >= TimeSpan.FromMilliseconds(40), "then the interval");
        // An app pack taps in one batch; a pack can set its own hold time.
        rig.Stamped.Stamps.Clear();
        rig.Foreground.Set(Apps.Terminal);
        await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "chord", "chord": "Ctrl+Shift+T" }"""), Exec.For(rig, "windows-terminal"));
        Assert.Equal("chord", Assert.Single(rig.Stamped.Stamps).What);
        var j = TestPacks.Minimal();
        j["keyHoldMs"] = 80;
        Assert.Equal(80, TestPacks.Parse(j).KeyHoldMs);
        j["keyMode"] = "scancode";
        j.Remove("keyHoldMs");
        Assert.Equal(50, TestPacks.Parse(j).KeyHoldMs);
    }

    [Test]
    public async Task Sequences_repeats_and_macros_press_in_order_with_their_gaps()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.VsCode);
        var x = Exec.For(rig, "vscode");
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "sequence", "steps": ["Ctrl+K", "Ctrl+S"], "gapMs": 40 }"""), x));
        Assert.True(r.Ok, r.Message);
        AssertExtra.Equal(["Control+K", "Control+S"], rig.KeysSent());
        rig.Input.Clear();
        r = await rig.Pump(rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "repeat", "chord": "Z", "count": 3, "intervalMs": 40 }"""), x));
        Assert.Equal(3, r.Steps);
        AssertExtra.Equal(["Z", "Z", "Z"], rig.KeysSent());
        rig.Input.Clear();
        var macro = TestPacks.Get("site-gmail").FindVerb("gm.toggleShortcuts")!.Binding;
        rig.Foreground.Set(Apps.Chrome);
        var start = rig.Time.GetUtcNow();
        r = await rig.Pump(rig.Engine.Executor.RunAsync(macro, Exec.For(rig, "site-gmail")));
        Assert.True(r.Ok, r.Message);
        AssertExtra.Equal(["Shift+Oem2", "Tab", "Enter"], rig.KeysSent());
        Assert.True(rig.Time.GetUtcNow() - start >= TimeSpan.FromMilliseconds(800), "two 400 ms gaps");
    }

    [Test]
    public async Task Holds_press_and_release_timed_and_while_pressed()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var x = Exec.For(rig, "planet-coaster-2");
        var r = await rig.Pump(rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "hold", "chord": "E", "mode": "timed", "durationMs": 300 }"""), x));
        Assert.True(r.Ok, r.Message);
        AssertExtra.Equal(["down:E/sc", "up:E"], rig.KeysSent());
        rig.Input.Clear();
        var h = (HoldBinding)Exec.Bind("""{ "kind": "hold", "chord": "LAlt", "mode": "whilePressed" }""");
        Assert.True((await rig.Engine.Executor.HoldDownAsync(h, x, this)).Ok);
        Assert.Equal(VirtualKey.LeftAlt, Assert.Single(rig.Input.HeldKeys));
        Assert.True((await rig.Engine.Executor.HoldUpAsync(h, this)).Ok);
        Assert.Empty(rig.Input.HeldKeys);
    }

    [Test]
    public async Task Mouse_clicks_at_the_cursor_with_modifiers_into_the_matched_window_only()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var x = Exec.For(rig, "planet-coaster-2");
        var r = await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "mouse", "button": "left", "mods": "Shift" }"""), x);
        Assert.True(r.Ok, r.Message);
        var m = Assert.Single(rig.Mouse.Records);
        Assert.Equal(MouseRecordKind.Click, m.Kind);
        Assert.Null(m.At);
        Assert.Equal(ModifierKeys.Shift, m.Mods);
        Assert.Equal(Apps.PlanetCoaster2.Hwnd, m.Options.ExpectedHwnd);
        r = await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "mouse", "button": "wheelUp", "mods": "Ctrl" }"""), x);
        Assert.True(r.Ok);
        Assert.Equal(1, rig.Mouse.Records[^1].Notches);
        Assert.Equal(ExecOutcome.Unsupported, (await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "mouse", "button": "wheelLeft" }"""), x)).Outcome);
        rig.Mouse.Result = MouseResult.WrongWindow;
        Assert.Equal(ExecOutcome.NotInFront, (await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "mouse", "button": "left" }"""), x)).Outcome);
    }

    [Test]
    public async Task Text_module_and_unbound_bindings()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Terminal);
        var x = Exec.For(rig, "windows-terminal", Exec.KeyUp(rig));
        Assert.True((await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "text", "text": "/help " }"""), x)).Ok);
        Assert.Equal("text:/help ", Assert.Single(rig.KeysSent()));

        var moduleBinding = Exec.Bind("""{ "kind": "module", "verb": "windows.window.topmost", "status": "in-progress" }""");
        Assert.Equal(ExecOutcome.ModuleMissing, (await rig.Engine.Executor.RunAsync(moduleBinding, x)).Outcome);
        var windows = new FakeVerbProvider("windows");
        windows.VerbList.Add(new VerbDescriptor { Id = "windows.window.topmost", Label = "ON TOP", Category = "toggle" });
        rig.Verbs.Register(windows);
        Assert.True((await rig.Engine.Executor.RunAsync(moduleBinding, x)).Ok);
        var inv = Assert.Single(windows.Invocations);
        Assert.True(inv.DirectGesture);
        Assert.Equal(Apps.Terminal.Hwnd, inv.TargetWindow);
        windows.Statuses["windows.window.topmost"] = new VerbStatus(VerbAvailability.NotConnected, "offline");
        Assert.False((await rig.Engine.Executor.RunAsync(moduleBinding, x)).Ok);

        rig.Input.Clear();
        var unbound = TestPacks.Get("windows-terminal").FindVerb("pane.zoom")!.Binding;
        var u = await rig.Engine.Executor.RunAsync(unbound, x);
        Assert.Equal(ExecOutcome.Unbound, u.Outcome);
        Assert.Contains("Ctrl+Alt+Shift+Z", u.Message);
        Assert.Empty(rig.Input.Records);
    }

    [Test]
    public async Task Sight_bindings_go_through_sight_control_with_the_deck_token()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        rig.SightFake.Located.UnionWith(["pc2.builder.btn.test", "pc2.builder.bankControl"]);
        rig.SightFake.Values["pc2.builder.bankValue"] = 30;
        rig.SightFake.Moves["pc2.builder.bankControl"] = ("pc2.builder.bankValue", 15);
        rig.SightFake.Publish();
        var pc2 = TestPacks.Get("planet-coaster-2");
        var build = pc2.FindVerb("builder.build")!.Binding;
        var bankRight = (SightAdjustBinding)pc2.FindVerb("builder.bank.right")!.Binding;
        var level = (ClosedLoopBinding)pc2.FindVerb("builder.bank.level")!.Binding;
        rig.SightFake.Located.UnionWith(PackValidator.SightRegionsOf(build));
        rig.SightFake.Located.Add(bankRight.Sight);
        rig.SightFake.Values[level.Sight] = 30;
        rig.SightFake.Moves[bankRight.Sight] = (level.Sight, 15);
        rig.SightFake.Publish();
        Assert.True((await rig.Engine.Executor.RunAsync(build, Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig)))).Ok);
        Assert.True((await rig.Engine.Executor.RunAsync(bankRight, Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig)))).Ok);
        var lv = await rig.Engine.Executor.RunAsync(level, Exec.For(rig, "planet-coaster-2", Exec.Push(rig), VerbGestureKind.DialPush));
        Assert.True(lv.Ok, lv.Message);
        AssertExtra.Equal([$"click {PackValidator.SightRegionsOf(build).Single()}", $"adjust {bankRight.Sight} +1", $"drive {level.Sight} -> 0 via control {level.StepSight}"], rig.SightFake.Calls);
        Assert.Equal(0, rig.SightFake.Values[level.Sight]);
        Assert.Empty(rig.Input.Records);   // Sight sends the input itself, after its own checks

        var chordLoop = Exec.Bind("""{ "kind": "closedLoop", "sight": "pc2.builder.bankValue", "target": 0, "stepChord": { "increase": "Ctrl+Period", "decrease": "Ctrl+Comma" }, "step": 15, "tolerance": 0.5 }""");
        rig.SightFake.Values["pc2.builder.bankValue"] = -45;
        Assert.True((await rig.Engine.Executor.RunAsync(chordLoop, Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig)))).Ok);
        Assert.Contains("via chords Control+OemPeriod/Control+OemComma Scancode", rig.SightFake.Calls[^1]);
    }

    [Test]
    public async Task Nothing_is_sent_when_the_app_is_not_in_front_or_runs_elevated()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var pc2 = TestPacks.Get("planet-coaster-2");
        rig.SightFake.Located.UnionWith(pc2.SightRegions.Select(r => r.Id));
        rig.SightFake.Publish();
        var kinds = new[] { pc2.FindVerb("edit.undo")!.Binding, pc2.FindVerb("path.place")!.Binding, pc2.FindVerb("builder.testRide")!.Binding, pc2.FindVerb("builder.build")!.Binding, Exec.Bind("""{ "kind": "text", "text": "x" }""") };
        rig.Foreground.InFront = false;
        foreach (var b in kinds) Assert.Equal(ExecOutcome.NotInFront, (await rig.Engine.Executor.RunAsync(b, Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig)))).Outcome, b.Kind);
        rig.Foreground.InFront = true;
        rig.Foreground.Elevated = true;
        foreach (var b in kinds) Assert.Equal(ExecOutcome.Elevated, (await rig.Engine.Executor.RunAsync(b, Exec.For(rig, "planet-coaster-2", Exec.KeyUp(rig)))).Outcome, b.Kind);
        Assert.Empty(rig.Input.Records);
        Assert.Empty(rig.Mouse.Records);
        Assert.Empty(rig.SightFake.Calls);
    }

    [Test]
    public async Task Global_hotkeys_run_with_the_app_in_the_background()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Chrome);
        rig.Foreground.InFront = false;
        var r = await rig.Engine.Executor.RunAsync(Exec.Bind("""{ "kind": "chord", "chord": "Ctrl+Shift+Space" }"""), Exec.For(rig, "chromium-browser", global: true));
        Assert.True(r.Ok, r.Message);
        Assert.Single(rig.Input.Records);
    }

    [Test]
    public void Turn_planner_applies_the_galleon_acceleration_curve_and_cap()
    {
        var bank = TestPacks.Get("planet-coaster-2").FindControl("bank")!;   // rows 1→1, 4→2, 8→3, cap 24
        Assert.Equal(1, TurnPlanner.Plan(bank, 1, 0)!.Presses);
        Assert.Equal(3, TurnPlanner.Plan(bank, 3, 0)!.Presses, "below 4 ticks: one press per tick");
        Assert.Equal(8, TurnPlanner.Plan(bank, 4, 0)!.Presses);
        Assert.Equal(10, TurnPlanner.Plan(bank, 5, 0)!.Presses);
        Assert.Equal(24, TurnPlanner.Plan(bank, 12, 0)!.Presses, "12 × 3 = 36, capped at 24");
        var left = TurnPlanner.Plan(bank, -2, 0)!;
        Assert.Equal(-1, left.Direction);
        Assert.True(left.Binding is SightAdjustBinding { Direction: -1 });
        var tabs = TestPacks.Get("windows-terminal").FindControl("tabs")!;   // no acceleration, cap 6
        Assert.Equal(6, TurnPlanner.Plan(tabs, 12, 0)!.Presses);
        var font = TestPacks.Get("windows-terminal").FindControl("fontSize")!;   // clamp -20..40 on counted points
        Assert.Equal(1, TurnPlanner.Plan(font, 3, 39)!.Presses);
        Assert.Equal(0, TurnPlanner.Plan(font, 3, 40)!.Presses);
        Assert.Null(TurnPlanner.Plan(font, 0, 0));
    }
}

public class PolicyTests
{
    [Test]
    public void Online_competitive_packs_that_allow_sight_are_rejected_outright()
    {
        var j = TestPacks.Minimal("example-shooter", "online-competitive", sight: true);
        var problems = new List<PackProblem>();
        var parsed = PackParser.Parse(j, problems)!;
        Assert.Null(PackValidator.Validate(parsed, problems));
        Assert.True(problems.Any(p => p.Message.Contains("online-competitive")));
    }

    [Test]
    public void Sight_input_is_stripped_from_every_pack_that_is_not_safe_offline()
    {
        foreach (var cls in new[] { "online-competitive", "desktop-app" })
        {
            var j = TestPacks.Minimal("example-" + cls, cls);
            ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.level", "LEVEL", "tool", 50, JsonNode.Parse("""{ "kind": "closedLoop", "sight": "a.value", "target": 0, "stepSight": "a.control", "step": 1 }""")!.AsObject()));
            ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.click", "CLICK", "tool", 50, JsonNode.Parse("""{ "kind": "sightClick", "sight": "a.button" }""")!.AsObject()));
            ((JsonArray)j["contexts"]!).Add(JsonNode.Parse("""{ "id": "seen", "label": "Seen", "priority": 50, "detect": { "any": [ { "type": "sight", "region": "a.panel", "state": "visible" } ] }, "confidence": "unverified", "verify": "x" }"""));
            var problems = new List<PackProblem>();
            var p = TestPacks.Parse(j, problems);
            Assert.Null(p.FindVerb("app.level"), cls);
            Assert.Null(p.FindVerb("app.click"), cls);
            Assert.True(p.FindContext("seen")!.Detect.Detectors.All(d => d.Type != DetectorType.Sight), cls + ": Sight detectors removed");
        }
    }

    [Test]
    public async Task The_executor_refuses_sight_for_a_non_safe_offline_pack_even_if_one_slips_through()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.Terminal);
        // Built by hand, bypassing the validator.
        var wt = TestPacks.Get("windows-terminal");
        var r = await rig.Engine.Executor.RunAsync(new SightClickBinding("a.button", "left"), new ExecContext(wt, Apps.Terminal, Exec.KeyUp(rig), VerbGestureKind.KeyPress));
        Assert.Equal(ExecOutcome.PolicyBlocked, r.Outcome);
        var competitive = wt with { Policy = new PackPolicy(PolicyClass.OnlineCompetitive, false, false, false, null) };
        r = await rig.Engine.Executor.RunAsync(new ClosedLoopBinding("a.v", 0, null, null, "a.c", 1, null, 0.5, 10, 50, "refuse"), new ExecContext(competitive, Apps.Terminal, Exec.KeyUp(rig), VerbGestureKind.KeyPress));
        Assert.Equal(ExecOutcome.PolicyBlocked, r.Outcome);
        r = await rig.Engine.Executor.RunAsync(new ChordBinding(Chord.Parse("Ctrl+S")), new ExecContext(competitive, Apps.Terminal, Exec.KeyUp(rig), VerbGestureKind.KeyPress));
        Assert.Equal(ExecOutcome.PolicyBlocked, r.Outcome, "display-only: no input at all");
        Assert.Empty(rig.SightFake.Calls);
        Assert.Empty(rig.Input.Records);
    }

    [Test]
    public async Task Stale_or_missing_gesture_tokens_never_reach_sight()
    {
        using var rig = new Rig();
        rig.Foreground.Set(Apps.PlanetCoaster2);
        var pc2 = TestPacks.Get("planet-coaster-2");
        rig.SightFake.Located.UnionWith(pc2.SightRegions.Select(r => r.Id));
        rig.SightFake.Publish();
        var test = pc2.FindVerb("builder.testRide")!.Binding;   // a two-click macro
        var token = Exec.KeyUp(rig);
        rig.Time.Advance(TimeSpan.FromMilliseconds(1500));
        Assert.Equal(ExecOutcome.TooLate, (await rig.Engine.Executor.RunAsync(test, Exec.For(rig, "planet-coaster-2", token))).Outcome);
        Assert.Equal(ExecOutcome.TooLate, (await rig.Engine.Executor.RunAsync(test, Exec.For(rig, "planet-coaster-2", null))).Outcome);
        Assert.Empty(rig.SightFake.Calls);
        // A fresh gesture gives each click its own one-shot token...
        var fresh = Exec.KeyUp(rig);
        Assert.True((await rig.Pump(rig.Engine.Executor.RunAsync(test, Exec.For(rig, "planet-coaster-2", fresh)))).Ok);
        Assert.Equal(2, fresh.Minted);
        Assert.Equal(2, rig.SightFake.Tokens.Select(t => t.Nonce).Distinct().Count());
        // ...at most 8 per gesture, and none once the press is older than 1 s.
        for (var i = 0; i < 6; i++) Assert.NotNull(fresh.Mint(TimeSpan.FromSeconds(1)));
        Assert.Null(fresh.Mint(TimeSpan.FromSeconds(1)));
        var late = Exec.KeyUp(rig);
        rig.Time.Advance(TimeSpan.FromMilliseconds(1100));
        Assert.Null(late.Mint(TimeSpan.FromSeconds(1)));
    }

    [Test]
    public async Task Sight_readings_never_send_input_on_their_own()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        foreach (var c in new[] { 0, 1, 2 }) rig.Engine.Attach("k" + c, TestDevices.Galleon, PrismControl.Core.Devices.Controller.Keypad, new(c, 0), () => { });
        rig.Engine.Attach("d", TestDevices.Galleon, PrismControl.Core.Devices.Controller.Encoder, new(0, 0), () => { });
        var regions = new[] { "pc2.builder.editPanel", "pc2.terrain.panel", "pc2.menu.fullscreen", "pc2.rideCam.overlay" };
        for (var i = 0; i < 40; i++)
        {
            rig.SightFake.Visible.Clear();
            rig.SightFake.Visible.Add(regions[i % regions.Length]);
            rig.SightFake.Located.Add("pc2.builder.bankControl");
            rig.SightFake.Values["pc2.builder.bankValue"] = (i * 7) % 90 - 45;
            rig.SightFake.Publish();
            await rig.AdvanceAsync(i % 3 == 0 ? 600 : 120);
        }
        Assert.True(rig.Events.Count(e => e.Kind == ContextEventKind.Switched) >= 5, "the context followed the screen");
        Assert.Empty(rig.Input.Records);
        Assert.Empty(rig.Mouse.Records);
        Assert.Empty(rig.SightFake.Calls);
    }
}
