using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

public class MacroDialTests
{
    private static MacroDialSettings Zoom(int ticksPerStep = 1) => new()
    {
        Label = "Zoom",
        Right = new ChordStep("Ctrl+Plus"),
        Left = new ChordStep("Ctrl+Minus"),
        Push = MacroScript.Of(new ChordStep("Ctrl+0")),
        TicksPerStep = ticksPerStep,
    };

    private static ushort KeyOf(KeyInput[] chordBatch) => chordBatch[1].Vk; // [Ctrl down, key down, key up, Ctrl up]

    [Test]
    public async Task Galleon_spin_runs_one_chord_per_tick_and_push_runs_the_push_macro()
    {
        foreach (var at in new[] { new Coordinates(0, 0), new Coordinates(0, 1), new Coordinates(1, 0), new Coordinates(1, 1) })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, at, Zoom(), Controller.Encoder);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            await h.RotateAsync(12); // a fast Galleon spin arrives as one event of 12 ticks
            await Drive.ToIdleAsync(h);
            Assert.Equal(12, rig.Sink.Count, at.ToString());
            Assert.True(rig.Sink.Batches.All(b => KeyOf(b) == 0xBB && b.Length == 4), "Ctrl+Plus each time");
            await h.RotateAsync(-3);
            await Drive.ToIdleAsync(h);
            Assert.Equal(15, rig.Sink.Count);
            Assert.True(rig.Sink.Batches.Skip(12).All(b => KeyOf(b) == 0xBD), "Ctrl+Minus");
            await h.DialPressAsync(TimeSpan.FromSeconds(5)); // a Galleon "hold" is still just a press for us
            await Drive.ToIdleAsync(h);
            Assert.Equal((ushort)'0', KeyOf(rig.Sink.Batches[^1]));
            Assert.Equal(16, rig.Sink.Count);
            Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Plus_ticks_and_strip_tap()
    {
        foreach (var theme in new[] { "night", "day" })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Plus, new(2, 0), Zoom(), Controller.Encoder, theme);
            for (var i = 0; i < 3; i++) await h.RotateAsync(1);
            await Drive.ToIdleAsync(h);
            Assert.Equal(3, rig.Sink.Count);
            await h.TapAsync(100, 50); // touch is an extra on the +: same as a push
            await Drive.ToIdleAsync(h);
            Assert.Equal((ushort)'0', KeyOf(rig.Sink.Batches[^1]));
            await h.DialPressAsync();
            await Drive.ToIdleAsync(h);
            Assert.Equal(5, rig.Sink.Count);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Ticks_per_step_tames_fast_spins()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(1, 0), Zoom(ticksPerStep: 3), Controller.Encoder);
        await h.RotateAsync(7);
        await Drive.ToIdleAsync(h);
        Assert.Equal(2, rig.Sink.Count, "7 ticks = 2 steps, 1 left over");
        await h.RotateAsync(2);
        await Drive.ToIdleAsync(h);
        Assert.Equal(3, rig.Sink.Count, "the leftover tick counts");
        await h.RotateAsync(-2);
        await Drive.ToIdleAsync(h);
        Assert.Equal(3, rig.Sink.Count, "a direction change starts counting again");
    }

    [Test]
    public async Task Pending_steps_are_capped_and_turning_back_drops_them()
    {
        var rig = new TestRig();
        using var gate = new ManualResetEventSlim(false);
        rig.Sink.Gate = gate; // hold the lane inside its first SendInput
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0), Zoom(), Controller.Encoder);
        await h.RotateAsync(12);
        await Drive.UntilAsync(() => rig.Sink.Entered == 1, "the first step in flight");
        for (var i = 0; i < 4; i++) await h.RotateAsync(12);
        gate.Set();
        await Drive.ToIdleAsync(h);
        Assert.Equal(1 + MacroDial.MaxPendingSteps, rig.Sink.Count, "60 ticks queued, but at most 24 wait behind the one in flight");

        var rig2 = new TestRig();
        using var gate2 = new ManualResetEventSlim(false);
        rig2.Sink.Gate = gate2;
        await using var h2 = await rig2.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0), Zoom(), Controller.Encoder);
        await h2.RotateAsync(12);
        await Drive.UntilAsync(() => rig2.Sink.Entered == 1, "the first step in flight");
        await h2.RotateAsync(-1);
        gate2.Set();
        await Drive.ToIdleAsync(h2);
        Assert.Equal(2, rig2.Sink.Count, "the step in flight, then one Ctrl+Minus: the other 11 Ctrl+Plus were dropped");
        Assert.Equal(0xBD, KeyOf(rig2.Sink.Batches[1]));
    }

    [Test]
    public async Task Blocked_dial_alerts_once_and_drops_the_rest()
    {
        var rig = new TestRig();
        rig.Foreground.Current = FakeForeground.Elevated();
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(1, 1), Zoom(), Controller.Encoder);
        await h.RotateAsync(5);
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Contains("administrator", h.Action.Status);
    }

    [Test]
    public async Task One_direction_can_be_left_empty()
    {
        var rig = new TestRig();
        var s = Zoom();
        s.Left = null;
        s.Push = new MacroScript();
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Plus, new(0, 0), s, Controller.Encoder);
        await h.RotateAsync(-1);
        await h.DialPressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(0, h.Count("showAlert"), "an unset direction is a no-op, not an error");
        await h.RotateAsync(1);
        await Drive.ToIdleAsync(h);
        Assert.Equal(1, rig.Sink.Count);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Turning_lights_the_row_then_the_dial_goes_quiet()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Plus, new(1, 0), Zoom(), Controller.Encoder);
        await h.AdvanceAsync(TimeSpan.FromSeconds(1)); // start away from t=0 (Core fixed its "input at t=0" bug; this keeps the idle frame unlit)
        var idle = h.FeedbackSvg(Layouts.Canvas.Frame);
        await h.RotateAsync(1);
        var lit = h.FeedbackSvg(Layouts.Canvas.Frame);
        Assert.NotEqual(idle, lit, "the turned direction lights up");
        await Drive.ToIdleAsync(h);
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(idle, h.FeedbackSvg(Layouts.Canvas.Frame), "back to the idle frame after the interaction window");
        var before = h.CallsOf("setFeedback").Count;
        await h.AdvanceAsync(TimeSpan.FromMinutes(5));
        Assert.Equal(before, h.CallsOf("setFeedback").Count, "no frames while idle");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Media_volume_preset_works_on_the_dial()
    {
        var preset = DialPresets.All.Single(p => p.Id == "volume");
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 1),
            new MacroDialSettings { Label = preset.Short, Right = preset.Right, Left = preset.Left, Push = preset.Push }, Controller.Encoder);
        await h.RotateAsync(2);
        await h.DialPressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal("AF,AF,AD", string.Join(",", rig.Sink.Batches.Select(b => b[0].Vk.ToString("X2"))));
        h.AssertFramesAreDeckSafe();
    }
}
