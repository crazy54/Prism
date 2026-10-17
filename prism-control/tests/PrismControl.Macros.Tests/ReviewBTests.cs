using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Art;
using PrismControl.Macros.Engine;
using PrismControl.Testing;
using static PrismControl.Macros.Tests.K;

namespace PrismControl.Macros.Tests;

/// <summary>
/// Review B (wave 3) regressions. Each test failed on the wave-2 code. Fakes only: the recording sink and the fake launcher
/// stand in for SendInput and ShellExecute, so nothing is typed or started.
/// </summary>
public class ReviewBRegressionTests
{
    // ------------------------------------------------------------------ #3 dry run fails closed, safe mode forces it

    [Test]
    public async Task Dry_run_variable_fails_closed()
    {
        // Only an explicit "0"/"false" (or unset) means live; any other value, in any case, means dry run.
        foreach (var value in new[] { "True", "TRUE", "yes", "on", "2", "no", " ", "dry" })
        {
            using var env = new EnvScope(MacrosModule.DryRunVariable, value);
            using var dir = new TempDir();
            var ctx = new FakeModuleContext(dir.Path, safeMode: false);
            var module = new MacrosModule();
            module.Initialize(ctx);
            var engine = ctx.Services.Get<MacroEngine>();
            Assert.False(engine.Input is SendInputSink, $"\"{value}\" must mean dry run (no SendInput)");
            Assert.False(engine.Launcher is ShellAppLauncher, $"\"{value}\" must mean dry run (no ShellExecute, no SetForegroundWindow)");
            await module.DisposeAsync();
        }
    }

    [Test]
    public async Task Safe_mode_forces_the_dry_run()
    {
        using var env = new EnvScope(MacrosModule.DryRunVariable, null);
        using var dir = new TempDir();
        var ctx = new FakeModuleContext(dir.Path, safeMode: true);
        var module = new MacrosModule();
        module.Initialize(ctx);
        var engine = ctx.Services.Get<MacroEngine>();
        Assert.False(engine.Input is SendInputSink, "safe mode: no SendInput");
        Assert.False(engine.Launcher is ShellAppLauncher, "safe mode: no launches, URLs or focus changes");
        Assert.Contains("DRY RUN", ctx.RecordingLog.Text);
        await module.DisposeAsync();
    }

    // ------------------------------------------------------------------ #2 launch steps from a shared profile

    [Test]
    public async Task An_imported_launch_does_not_run_on_a_press()
    {
        foreach (var (target, args) in new (string, string?)[]
        {
            ("cmd.exe", "/c echo The Example Ensemble"), (@"\\fileserver.example\share\tool.exe", null), ("mshta.exe", "https://example.com/x.hta"),
            (@"C:\Tools\Example\example.exe", "--profile demo"),
        })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 0), new LaunchSettings { Target = target, Arguments = args });
            await h.PressAsync();
            await Drive.ToIdleAsync(h);
            Assert.Empty(rig.Launcher.Launched, target);
            Assert.Empty(rig.Launcher.FocusAttempts, target);
            Assert.Equal(1, h.Count("showAlert"), target);
        }

        var macroRig = new TestRig();
        var imported = new MacroKeySettings { Macro = MacroScript.Of(new ChordStep("Ctrl+C"), new LaunchStep { Target = "powershell.exe", Arguments = "-c exit" }) };
        await using var m = await macroRig.AppearAsync<MacroKey>(TestDevices.Plus, new(0, 0), imported);
        await m.PressAsync();
        await Drive.ToIdleAsync(m);
        Assert.Empty(macroRig.Launcher.Launched);
        Assert.Equal(0, macroRig.Sink.Count, "nothing of the macro runs, not even the steps before the launch");
    }

    // ------------------------------------------------------------------ #5 nulls and throwing steps

    [Test]
    public async Task A_step_whose_validate_throws_is_reported_not_thrown()
    {
        var registry = MacroStepRegistry.Default.With(typeof(ThrowingStep));
        var rig = new TestRig(registry);
        var script = MacroJson.ReadScript(JsonNode.Parse("""{"version":1,"steps":[{"type":"chord","keys":"Ctrl+C"},{"type":"test-throws"}]}"""), registry);
        var r = await rig.Engine.RunAsync(script);
        Assert.Equal(MacroRunStatus.Invalid, r.Status);
        Assert.Contains("Step 2", r.Message);
        Assert.Equal(0, rig.Sink.Count);
        Assert.NotNull(script.Describe());
        Assert.True(MacroPi.DescribeScript(script)["problems"]!.AsArray().Count > 0);
    }

    [Test]
    public async Task An_imported_null_shows_fix_in_settings_once_and_never_loops()
    {
        var rig = new TestRig();
        var raw = JsonNode.Parse("""{"label":"Ship","macro":{"version":1,"steps":[{"type":"chord","keys":"Ctrl+C"},{"type":"text","text":null}]}}""");
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(1, 1), raw);
        var ready = MacroArt.GlyphKey(Themes.Resolve("night"), MacroGlyphs.Macro, "Ship").ToDataUri();
        Assert.NotNull(h.LastImage);
        Assert.NotEqual(ready, h.LastImage, "a malformed macro must not look ready");
        Assert.Equal("fix", h.Action.Face);
        var described = (await h.PiMessageAsync("macros.describe", new { scripts = new { macro = raw!["macro"] } }, requestId: 1))!["data"]!["scripts"]!["macro"]!;
        Assert.Equal("Type text: fix in settings", described["steps"]![1]!["summary"]!.GetValue<string>());
        Assert.Contains("\"text\" value is missing or invalid", described["problems"]![0]!.GetValue<string>());
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Contains("Fix it in settings", h.Action.Status);
        Assert.Equal("fix", h.Action.Face);
        var frames = h.CallsOf("setImage").Count;
        await h.AdvanceAsync(TimeSpan.FromSeconds(30));
        Assert.Equal(frames, h.CallsOf("setImage").Count, "no redraw loop");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_run_that_breaks_the_log_still_finishes_and_parks_the_key()
    {
        var rig = new TestRig(log: new ThrowingLog());
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), new MacroKeySettings { Macro = MacroScript.Of(new ChordStep("Ctrl+C")) });
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.NotEqual("Ready.", h.Action.Status, "the run finished and said so");
        var frames = h.CallsOf("setImage").Count;
        await h.AdvanceAsync(TimeSpan.FromSeconds(30));
        Assert.Equal(frames, h.CallsOf("setImage").Count, "the beat stopped: no 2 Hz redraw loop");
    }

    [Test]
    public async Task The_dial_lane_survives_a_run_that_breaks()
    {
        var rig = new TestRig(log: new ThrowingLog(throws: 1));
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0),
            new MacroDialSettings { Right = new ChordStep("Ctrl+Plus"), Left = new ChordStep("Ctrl+Minus") }, Core.Devices.Controller.Encoder);
        await h.RotateAsync(1);
        await Drive.ToIdleAsync(h);
        await h.RotateAsync(1);
        await Drive.ToIdleAsync(h);
        Assert.Equal(2, rig.Sink.Count, "the second turn still runs");
    }

    // ------------------------------------------------------------------ #6 keys never stay down

    [Test]
    public async Task A_held_chord_releases_exactly_what_went_down()
    {
        // Windows accepts 1 of the 3 key-downs: only Ctrl went down, so only Ctrl goes up.
        var rig = new TestRig();
        rig.Sink.AcceptNext = 1;
        var r = await Drive.RunAsync(rig.Engine, MacroScript.Of(new ChordStep("Ctrl+Shift+A") { HoldMs = 500 }));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        Assert.Contains("accepted 1 of 3", r.Message);
        Assert.Equal(2, rig.Sink.Count);
        K.SequenceEqual([Down(0xA2, 0x1D)], rig.Sink.Batches[0]);
        K.SequenceEqual([Up(0xA2, 0x1D)], rig.Sink.Batches[1], "only the key that went down is released");
    }

    [Test]
    public async Task A_partial_release_is_retried()
    {
        var rig = new TestRig();
        rig.Sink.AcceptPlan.Enqueue(3); // all three downs
        rig.Sink.AcceptPlan.Enqueue(1); // then only the first up
        var r = await Drive.RunAsync(rig.Engine, MacroScript.Of(new ChordStep("Ctrl+Shift+A") { HoldMs = 30 }));
        Assert.Equal(3, rig.Sink.Count, r.Describe());
        K.SequenceEqual([Up(0x41, 0x1E)], rig.Sink.Batches[1]);
        K.SequenceEqual([Up(0xA0, 0x2A), Up(0xA2, 0x1D)], rig.Sink.Batches[2], "the rest, still in reverse order");
    }

    [Test]
    public async Task A_sink_that_throws_mid_chord_releases_every_key_that_may_be_down()
    {
        var rig = new TestRig();
        rig.Sink.ThrowNext = new InvalidOperationException("input desktop changed (test)");
        var r = await Drive.RunAsync(rig.Engine, MacroScript.Of(new ChordStep("Ctrl+Shift+A") { HoldMs = 200 }));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        K.SequenceEqual([Up(0x41, 0x1E), Up(0xA0, 0x2A), Up(0xA2, 0x1D)], Assert.Single(rig.Sink.Batches), "reverse order");
    }

    [Test]
    public async Task A_partial_text_batch_releases_only_the_character_that_went_down()
    {
        var rig = new TestRig();
        rig.Sink.AcceptNext = 1; // "a" went down, its up and "b" did not go out
        var r = await rig.Engine.RunAsync(MacroScript.Of(new TextStep("ab")));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        K.SequenceEqual([new KeyInput(0, 'a', KeyFlags.Unicode | KeyFlags.KeyUp)], rig.Sink.Batches[1]);
    }

    // ------------------------------------------------------------------ Finish race: never stuck on "running"

    [Test]
    public async Task Runs_that_show_the_running_face_always_return_to_idle()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0),
            new MacroKeySettings { Label = "Slow", Macro = MacroScript.Of(new ChordStep("A"), new DelayStep(300)) });
        var idle = h.LastImage;
        for (var i = 0; i < 40; i++)
        {
            await h.PressAsync();
            await Drive.ToIdleAsync(h);
            Assert.Equal(idle, h.LastImage, $"run {i + 1} left the key on another face");
        }
    }
}
