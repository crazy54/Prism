using System.Net;
using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Actions;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Control;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Engine;
using PrismControl.Sight.GameLink;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Service;
using PrismControl.Sight.Text;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

// Regression tests for the review of 2026-10-17 (aaa-prism-play/review-smart/REPORT.md § Sight), one per finding. Each
// one fails on the code before the fix (see aaa-prism-play/sight-fix/NOTES.md). Fakes only: no real input, no capture.

/// <summary>Keyboard input goes to whatever window is in front (like Windows), and it ignores the expected window: so only
/// SightControl's own per-press re-check can keep chords out of another app.</summary>
internal sealed class FlipKeyboard(SimGame game, SimLive live, int flipAfter) : IInputSender
{
    public int ToGame, ToOther;
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendChordAsync(keys, KeyMode.VirtualKey, ct);
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default)
    {
        if (live.Foreground == SimLive.Hwnd) { game.OnChord(keys); if (++ToGame >= flipAfter) live.Foreground = 0x9999; }   // the user alt-tabs
        else ToOther++;
        return Task.FromResult(true);
    }
    public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) => SendChordAsync(keys, mode, ct);
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendChordAsync([key], ct);
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Task.FromResult(false);
    public bool TargetIsElevated(nint hwnd) => false;
}

/// <summary>Windows OCR stand-in: returns <see cref="Text"/> for every image.</summary>
internal sealed class FixedOcr(Func<string?> text) : ITextRecognizer
{
    public string Name => "fixed";
    public bool IsAvailable => true;
    public ValueTask<string?> RecognizeAsync(GrayImage darkOnLight, CancellationToken ct = default) => ValueTask.FromResult(text());
}

public class ReviewFixTests
{
    private static readonly SightChordSteps EQ = new([VirtualKey.E], [VirtualKey.Q], IntervalMs: 10);

    private static async Task Until(SimLive live, Func<bool> done)
    {
        var all = Enumerable.Range(0, live.Engine!.Recipe.Regions.Count).ToList();
        for (var i = 0; i < 200 && !done(); i++) await live.FreshAsync(all, TimeSpan.FromMilliseconds(100), default);
        Assert.True(done(), "the simulated game reached the state");
    }

    private static async Task Warm(SimLive live)
    {
        var all = Enumerable.Range(0, live.Engine!.Recipe.Regions.Count).ToList();
        for (var i = 0; i < 15; i++) await live.FreshAsync(all, TimeSpan.FromMilliseconds(100), default);
    }

    // ------------------------------------------------------------------ A-H1 / decision 4

    [Test(TimeoutMs = 180_000)]
    public async Task AH1_a_drive_stops_with_WINDOW_CHANGED_at_the_first_alt_tab_and_never_types_into_the_next_app()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        game.State.Bank = -60;
        var live = new SimLive(game, t);
        await Warm(live);
        var kb = new FlipKeyboard(game, live, flipAfter: 1);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var r = await c.DriveToAsync("bankAngle", 0, EQ, new SightDriveOptions(StepSize: 15), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.WindowChanged, r.Status, r.Reason);
        Assert.Contains("WINDOW CHANGED", r.Reason);
        Assert.Equal(1, kb.ToGame);
        Assert.Equal(0, kb.ToOther, "before the fix: 13 chords went to the other window");
        Assert.Equal(1, r.StepsSent);
        // One Galleon spin (12 ticks) of chord steps: the same.
        live.Foreground = SimLive.Hwnd;
        var kb2 = new FlipKeyboard(game, live, flipAfter: 1);
        var c2 = new SightControl(live, kb2, new SimMouse(game), new GestureGuard(t), false, null, t);
        var s = await c2.StepAsync(EQ, SightAdjustDirection.Increase, 12, Gestures.Turn(t, 12));
        Assert.Equal(SightActStatus.WindowChanged, s.Status);
        Assert.Equal(1, s.Steps);
        Assert.Equal(0, kb2.ToOther, "before the fix: 11 of 12");
    }

    private sealed class FlipMouse(SimGame game, SimLive live, int flipAfter) : IMouseSender
    {
        public int Clicks;
        public Task<MouseResult> MoveAsync(PointI to, MouseOptions? options = null, CancellationToken ct = default) => Task.FromResult(MouseResult.Sent);
        public Task<MouseResult> ClickAsync(PointI? at, MouseButton button, int count = 1, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default)
        {
            Assert.True(options?.RequireForeground == true, "Sight asks the sender to re-check the foreground too");
            game.OnClick(at!.Value);
            if (++Clicks >= flipAfter) live.Foreground = 0x9999;
            return Task.FromResult(MouseResult.Sent);
        }
        public Task<MouseResult> DragAsync(PointI from, PointI to, TimeSpan duration, int steps, MouseButton button = MouseButton.Left, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default) => Task.FromResult(MouseResult.Sent);
        public Task<MouseResult> WheelAsync(int notches, ModifierKeys mods = ModifierKeys.None, PointI? at = null, MouseOptions? options = null, CancellationToken ct = default) => Task.FromResult(MouseResult.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH1_button_steps_re_check_the_foreground_before_every_click_and_book_only_what_went_out()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t);
        var mouse = new FlipMouse(game, live, flipAfter: 2);
        var c = new SightControl(live, new SimKeyboard(game), mouse, new GestureGuard(t), false, null, t);
        var r = await c.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 5, SightAdjustMethod.Buttons, Gestures.Turn(t, 5));
        Assert.Equal(SightActStatus.WindowChanged, r.Status, r.Reason);
        Assert.Equal(2, mouse.Clicks);
        Assert.Equal(2, r.Steps);
        Assert.Equal(2, c.Counted("syn.builder.bankControl"), "the ledger books the two clicks that went out");
    }

    private sealed class ScriptedKeyboard : IKeyboardInjector
    {
        public nint Front = 0x5150;
        public readonly HashSet<nint> Elevated = [];
        public int Sent;
        public int Send(ReadOnlySpan<KeyEvent> events) { Sent += events.Length; return events.Length; }
        public ushort ScanCode(ushort vk) => 0x12;
        public nint Foreground() => Front;
        public bool IsAboveUs(nint hwnd) => Elevated.Contains(hwnd);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH1_the_real_sender_refuses_a_chord_for_a_window_that_is_no_longer_in_front()
    {
        var inj = new ScriptedKeyboard();
        using var sender = new SendInputSender(inj, NullLog.Instance);
        Assert.True(await sender.SendChordToAsync(0x5150, [VirtualKey.E]));
        Assert.Equal(2, inj.Sent);
        inj.Front = 0x9999;   // alt-tab between two presses
        Assert.False(await sender.SendChordToAsync(0x5150, [VirtualKey.E]), "WINDOW CHANGED: nothing is sent");
        Assert.Equal(2, inj.Sent);
        inj.Front = 0x5150;
        inj.Elevated.Add(0x5150);
        Assert.False(await sender.SendChordToAsync(0x5150, [VirtualKey.E]), "elevated: refused");
        Assert.False(await sender.SendChordToAsync(0, [VirtualKey.E]), "no target: refused");
        Assert.Equal(2, inj.Sent);
        // A fake that cannot check the foreground refuses by default instead of pretending.
        Assert.False(await ((IInputSender)new NoForegroundFake()).SendChordToAsync(0x5150, [VirtualKey.E]));
    }

    private sealed class NoForegroundFake : IInputSender
    {
        public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => Task.FromResult(true);
        public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => Task.FromResult(true);
        public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Task.FromResult(true);
        public bool TargetIsElevated(nint hwnd) => false;
    }

    // ------------------------------------------------------------------ M9 (wheel notches)

    private sealed class ScriptedMouse : IMouseNative
    {
        public nint Under = 0x5150, Front = 0x5150;
        public Action<int>? AfterSend;
        public int Notches, Sends;
        public RectI VirtualScreen() => new(-2560, -1440, 3440, 1440);
        public PointI? CursorPos() => new(100, 100);
        public nint WindowAt(PointI p) => Under;
        public nint RootOf(nint hwnd) => hwnd;
        public bool IsWindow(nint hwnd) => hwnd != 0;
        public bool IsAboveUs(nint hwnd) => false;
        public nint Foreground() => Front;
        public ushort ScanCode(ushort vk) => 0;
        public int Send(ReadOnlySpan<MouseEvt> events)
        {
            foreach (var e in events) if ((e.Flags & MouseEvt.Wheel) != 0) Notches++;
            AfterSend?.Invoke(++Sends);
            return events.Length;
        }
        public Task DelayAsync(TimeSpan delay, CancellationToken ct) => Task.CompletedTask;
    }

    [Test(TimeoutMs = 180_000)]
    public async Task M9_every_wheel_notch_re_checks_the_window_under_the_point_and_the_foreground()
    {
        var native = new ScriptedMouse();
        var mouse = new SendInputMouseSender(native, NullLog.Instance);
        native.AfterSend = n => { if (n == 2) native.Under = 0x9999; };   // something covers the game after the 2nd notch
        var r = await mouse.WheelAsync(6, ModifierKeys.None, new PointI(100, 100), new MouseOptions { ExpectedHwnd = 0x5150 });
        Assert.Equal(MouseResult.WrongWindow, r);
        Assert.Equal(2, native.Notches, "before the fix all 6 notches went out");
        var fg = new ScriptedMouse();
        var mouse2 = new SendInputMouseSender(fg, NullLog.Instance);
        fg.AfterSend = n => { if (n == 3) fg.Front = 0x7777; };   // the user alt-tabs (the game stays visible under the cursor)
        var r2 = await mouse2.WheelAsync(-6, ModifierKeys.None, new PointI(100, 100), new MouseOptions { ExpectedHwnd = 0x5150, RequireForeground = true });
        Assert.Equal(MouseResult.WrongWindow, r2);
        Assert.Equal(3, fg.Notches);
        // RequireForeground with an unknown foreground (a fake without one) refuses.
        Assert.Equal(MouseResult.WrongWindow, await new SendInputMouseSender(new ScriptedMouse { Front = 0 }, NullLog.Instance)
            .WheelAsync(1, ModifierKeys.None, new PointI(100, 100), new MouseOptions { ExpectedHwnd = 0x5150, RequireForeground = true }));
    }

    // ------------------------------------------------------------------ A-H2 / decision 3 (closed-loop safety)

    private sealed class TraceKeyboard(SimGame game) : IInputSender
    {
        public readonly List<double> Trace = [];
        public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendChordAsync(keys, KeyMode.VirtualKey, ct);
        public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default)
        {
            game.OnChord(keys);
            lock (Trace) Trace.Add(game.State.Bank);
            return Task.FromResult(true);
        }
        public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) => SendChordAsync(keys, mode, ct);
        public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendChordAsync([key], ct);
        public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Task.FromResult(false);
        public bool TargetIsElevated(nint hwnd) => false;
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH2_a_stale_learned_step_is_probed_rejected_and_never_runs_away()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame { StepDeg = 5 };
        game.State.Bank = -30;
        var live = new SimLive(game, t);
        var kb = new TraceKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var a = await c.DriveToAsync("bankAngle", 0, EQ, 0.5, Gestures.Push(t));
        Assert.Equal(SightDriveStatus.Converged, a.Status, a.Reason);
        Assert.Equal(6, a.StepsSent);
        Assert.Equal(5.0, Assert.Single(c.LearnedSteps.Values), "a confirmed step is learned");
        game.StepDeg = 45;   // the game's step changed (snap, another piece type)
        game.State.Bank = 90;
        kb.Trace.Clear();
        var b = await c.DriveToAsync("bankAngle", 0, EQ, 0.5, Gestures.Push(t));
        Assert.Equal(SightDriveStatus.Converged, b.Status, b.Reason + " trace " + string.Join(" ", kb.Trace));
        Assert.Equal(0.0, b.Final);
        Assert.True(b.StepsSent <= 4, $"before the fix: 48 presses swinging -180..180; now {b.StepsSent}: {string.Join(" ", kb.Trace)}");
        Assert.True(kb.Trace.All(v => Math.Abs(v) <= 90), "it never went past the start distance: " + string.Join(" ", kb.Trace));
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH2_the_first_batch_is_a_probe_of_at_most_three_presses_and_a_wrong_estimate_is_rejected()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();   // 15° per press
        game.State.Bank = -60;
        var live = new SimLive(game, t);
        var kb = new TraceKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        // The pack says 2°/press: 30 presses "needed". The probe sends 3, sees 15°/press (> 50% off) and re-plans.
        var r = await c.DriveToAsync("bankAngle", 0, EQ, new SightDriveOptions(StepSize: 2), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.Converged, r.Status, r.Reason);
        Assert.Equal(-15.0, kb.Trace[2], "the probe: 3 presses, then a read");
        Assert.Equal(4, r.StepsSent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH2_a_growing_error_stops_the_drive_where_it_is()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame { StepDeg = 45 };
        game.State.Bank = -20;
        var live = new SimLive(game, t);
        var c = new SightControl(live, new SimKeyboard(game), new SimMouse(game), new GestureGuard(t), false, null, t);
        var r = await c.DriveToAsync("bankAngle", 0, EQ, 0.5, Gestures.Push(t));
        Assert.Equal(SightDriveStatus.Overshot, r.Status, r.Reason);
        Assert.Equal(1, r.StepsSent, "one press made it worse (|-20| → |25|): stop, no swinging back and forth");
        Assert.Equal(25.0, r.Final);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH2_presses_are_bounded_by_the_expected_distance_plus_a_margin()
    {
        var t = new ManualTimeProvider();
        // Each press moves a little less than the one before (never more than 50% off between two reads): the target
        // keeps moving away from what the presses deliver.
        var game = new SimGame { StepAt = n => Math.Max(1, Math.Round(10 * Math.Pow(0.93, n - 1))) };
        game.State.Bank = -150;
        var live = new SimLive(game, t);
        var c = new SightControl(live, new SimKeyboard(game), new SimMouse(game), new GestureGuard(t), false, null, t);
        var r = await c.DriveToAsync("bankAngle", 150, EQ, new SightDriveOptions(MaxSteps: 96, TimeoutMs: 60_000), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.Timeout, r.Status, $"{r.Status} {r.Reason} final {r.Final}");
        Assert.Contains("press budget", r.Reason);
        Assert.True(r.StepsSent < 96, $"bounded by the expected distance plus a margin, not the 96-press cap: {r.StepsSent}");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH2_learned_steps_and_the_ledger_are_cleared_on_a_game_or_recipe_change()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        game.State.Bank = -30;
        var live = new SimLive(game, t);
        var c = new SightControl(live, new SimKeyboard(game), new SimMouse(game), new GestureGuard(t), false, null, t);
        Assert.Equal(SightDriveStatus.Converged, (await c.DriveToAsync("bankAngle", 0, EQ, 0.5, Gestures.Push(t))).Status);
        await c.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 2, SightAdjustMethod.Buttons, Gestures.Turn(t, 2));
        Assert.True(c.LearnedSteps.Count == 1 && c.Counted("syn.builder.bankControl") == 2);
        // Another game window (or another recipe) comes in.
        live.Target = live.Target! with { Hwnd = 0x6160, Pid = 777 };
        live.Foreground = 0x6160;
        await c.StepAsync(EQ, SightAdjustDirection.Decrease, 1, Gestures.Turn(t, -1));
        Assert.Empty(c.LearnedSteps);
        Assert.Equal(0, c.Counted("syn.builder.bankControl"));
    }

    // ------------------------------------------------------------------ A-H3 (OCR never shortens a value)

    [Test(TimeoutMs = 180_000)]
    public void AH3_a_read_that_drops_any_character_is_unknown_never_a_shorter_number()
    {
        var spec = new ParseSpec(ParseType.Number, "°", '.', ',', new Dictionary<string, string>(), 1);
        const string wl = "-+0123456789.";   // the PC2 bank whitelist
        foreach (var raw in new[] { "-1,5", "1:25", "12'5", "ON", "BOB", "1 5", "-3x" })
            Assert.False(TextParser.Parse(raw, spec, wl).Ok, $"'{raw}' must be Unknown, got {TextParser.Parse(raw, spec, wl).Number}");
        Assert.Equal(-1.5, TextParser.Parse("-1.5", spec, wl).Number);
        Assert.Equal(-30.0, TextParser.Parse("-3O", spec, wl).Number, "a look-alike inside a digit run maps");
        Assert.Equal(-180.0, TextParser.Parse("-18O", spec, wl).Number);
        Assert.Equal(0.0, TextParser.Parse("O°", spec, wl).Number, "a lone look-alike glyph is a one-digit value");
        // "o" is the degree ring only when the preprocessor did NOT strip a superscript: after a strip it is a zero.
        Assert.Equal(-3.0, TextParser.Parse("-3o", spec, wl).Number);
        Assert.Equal(-30.0, TextParser.Parse("-3o", spec, wl, superscriptStripped: true).Number, "before the fix: -3 (a shortened -30)");
        Assert.Equal(1250.0, TextParser.Parse("1 250", ParseSpec.Default, "0123456789").Number, "a spaced thousands group");
        Assert.False(TextParser.Parse("12.5 8", ParseSpec.From(new ParseDto { Unit = "m" }), "0123456789.").Ok, "a misread unit is never merged into the number");
        Assert.Equal(12.5, TextParser.Parse("12.5 m", ParseSpec.From(new ParseDto { Unit = "m" }), "0123456789.").Number);
    }

    [Test(TimeoutMs = 180_000)]
    public void AH3_the_glyph_reader_never_cuts_confident_digits_after_a_gap()
    {
        Assert.Equal("1 250", new GlyphRead("1 250", 0.95, 0.3, 0, [0.95, 1, 0.95, 0.95, 0.95]).WithoutUnit().Text, "before the fix: '1'");
        Assert.Equal("1 5", new GlyphRead("1 5", 0.95, 0.3, 0, [0.95, 1, 0.95]).WithoutUnit().Text, "wide tracking: kept (the parse makes it Unknown)");
        // An unknown unit glyph read as weak digit-like parts is still cut ("12.5 m" → "12.5").
        Assert.Equal("12.5", new GlyphRead("12.5 11", 0.6, 0.1, 0, [0.95, 0.95, 1, 0.95, 1, 0.6, 0.62]).WithoutUnit("m").Text);
        Assert.Equal("12.5", new GlyphRead("12.5 ?", 0.3, 0.1, 1, [0.95, 0.95, 1, 0.95, 1, 0.3]).WithoutUnit("m").Text);
        // More glyphs than the unit can produce: not a unit.
        Assert.Equal("12.5 1111", new GlyphRead("12.5 1111", 0.6, 0.1, 0, [0.95, 0.95, 1, 0.95, 1, 0.6, 0.6, 0.6, 0.6]).WithoutUnit("m").Text);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH3_the_reviewer_s_windows_ocr_dash_one_comma_five_is_not_a_reading()
    {
        var spec = new ParseSpec(ParseType.Number, "°", '.', ',', new Dictionary<string, string>(), 1);
        const string wl = "-+0123456789.";
        var img = SightImage.Filled(130, 44, Bgra.FromRgb(0x14, 0x18, 0x21));
        var ink = Bgra.FromRgb(0xf2, 0xf4, 0xf8);
        img.FillRect(new PixelRect(10, 20, 10, 3), ink);
        img.FillRect(new PixelRect(26, 8, 5, 28), ink);
        img.FillRect(new PixelRect(36, 32, 4, 6), ink);
        img.FillRect(new PixelRect(46, 8, 14, 28), ink);
        foreach (var (mode, thr) in new[] { (OcrEngineMode.Windows, 0.55), (OcrEngineMode.Auto, 0.55), (OcrEngineMode.Auto, 0.99) })
        {
            var det = new OcrDetector("bankText", 0, null, mode, TextPolarity.Light, wl, true, spec, null, thr);
            var res = await det.RunAsync(img, new DetectContext { Unit = 1, Ocr = new FixedOcr(() => "-1,5") });
            Assert.False(res.Present && res.Number == -15, $"{mode}/{thr}: before the fix -15 at 0.64-0.68");
            Assert.False(res.FullConfidence && res.Present, $"{mode}/{thr}: never full confidence");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task AH3_a_closed_loop_needs_a_calibrated_read_or_both_engines_agreeing()
    {
        var plain = SyntheticHud.Recipe().Recipe;   // the default glyph set: not calibrated
        foreach (var (ocr, expect) in new (ITextRecognizer?, SightDriveStatus)[] { (null, SightDriveStatus.NoReading), (new FixedOcr(() => "7"), SightDriveStatus.NoReading) })
        {
            var t = new ManualTimeProvider();
            var game = new SimGame();
            game.State.Bank = -30;
            var live = new SimLive(game, t, plain, ocr: ocr);
            await Warm(live);
            if (ocr is null) Assert.Equal(SightConfidence.Observed, live.Engine!.State().Readouts["bankAngle"].Confidence, "the DISPLAY still reads it");
            var kb = new SimKeyboard(game);
            var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
            var r = await c.DriveToAsync("bankAngle", 0, EQ, new SightDriveOptions(StepSize: 15), Gestures.Push(t));
            Assert.Equal(expect, r.Status, r.Reason);
            Assert.Contains("full confidence", r.Reason);
            Assert.Empty(kb.Sent);
        }
        // Windows OCR agreeing with the glyph reader on every read: the loop may act.
        {
            var t = new ManualTimeProvider();
            var game = new SimGame();
            game.State.Bank = -30;
            var live = new SimLive(game, t, plain, ocr: new FixedOcr(() => $"{game.State.Bank:0}°"));
            await Warm(live);
            var c = new SightControl(live, new SimKeyboard(game), new SimMouse(game), new GestureGuard(t), false, null, t);
            var r = await c.DriveToAsync("bankAngle", 0, EQ, new SightDriveOptions(StepSize: 15), Gestures.Push(t));
            Assert.Equal(SightDriveStatus.Converged, r.Status, r.Reason);
        }
    }

    // ------------------------------------------------------------------ M4 (the Sight Dial's mailbox)

    private sealed class BlockingControl : ISightControl
    {
        public readonly TaskCompletionSource Gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly List<string> Log = [];
        public CancellationToken DriveToken;
        public async Task<SightDriveResult> DriveToAsync(string readoutId, double target, SightStepVia stepVia, SightDriveOptions options, GestureToken gesture, CancellationToken ct = default)
        {
            DriveToken = ct;
            lock (Log) Log.Add($"drive minted {gesture.At:ss.fff}");
            try { await Gate.Task.WaitAsync(ct); }
            catch (OperationCanceledException) { return new SightDriveResult(SightDriveStatus.Cancelled, null, null, 0, null, TimeSpan.Zero); }
            return new SightDriveResult(SightDriveStatus.Converged, 0, 0, 1, null, TimeSpan.Zero);
        }
        public Task<SightActResult> StepAsync(SightChordSteps chords, SightAdjustDirection direction, int steps, GestureToken gesture, CancellationToken ct = default)
        {
            lock (Log) Log.Add($"turn minted {gesture.At:ss.fff} arrived {gesture.ArrivedAt:ss.fff}");
            return Task.FromResult(new SightActResult(SightActStatus.Done, null, steps));
        }
        public Task<SightActResult> ClickAsync(string controlId, GestureToken gesture, CancellationToken ct = default) => Task.FromResult(new SightActResult(SightActStatus.Done));
        public Task<SightActResult> AdjustAsync(string controlId, SightAdjustDirection direction, int steps, SightAdjustMethod method, GestureToken gesture, CancellationToken ct = default) => StepAsync(new SightChordSteps([], []), direction, steps, gesture, ct);
        public void ResetLedger(string? controlId = null) { }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task M4_a_turn_during_a_push_drive_is_handled_at_once_and_cancels_the_drive()
    {
        var t = new ManualTimeProvider(new DateTimeOffset(2026, 10, 17, 12, 0, 0, TimeSpan.Zero));
        var fake = new BlockingControl();
        await using var h = await ActionHarness<SightDialAction>.AppearAsync(TestDevices.Galleon, controller: Controller.Encoder,
            settings: new SightDialSettings { Readout = "bankAngle", IncreaseChord = "E", DecreaseChord = "Q" },
            configureServices: s => s.Add<ISightControl>(fake), time: t);
        await h.DialDownAsync();
        await h.DialUpAsync();   // returns: the drive runs off the mailbox (before the fix this blocked for the whole drive)
        Assert.False(fake.DriveToken.IsCancellationRequested);
        t.Advance(TimeSpan.FromMilliseconds(200));
        await h.RotateAsync(3);
        Assert.True(fake.DriveToken.IsCancellationRequested, "the turn cancels the drive");
        Assert.Contains("turn minted 00.200 arrived 00.200", string.Join("|", fake.Log), "minted when the user turned, not seconds later");
        await h.SettleAsync();
        Assert.True(typeof(SightDialAction).GetCustomAttribute<StreamDeckActionAttribute>()!.SupportedInMultiActions is false, "LOW: not in multi-actions");
        Assert.True(typeof(SightStatusAction).GetCustomAttribute<StreamDeckActionAttribute>()!.SupportedInMultiActions is false);
    }

    // ------------------------------------------------------------------ M6 / M7

    [Test(TimeoutMs = 180_000)]
    public async Task M6_the_drive_respects_the_readout_s_contexts()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        game.State.Bank = -30;
        game.State.Tool = "terrain";   // bankAngle is only valid in coasterBuilder
        var live = new SimLive(game, t);
        await Warm(live);
        var kb = new SimKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var r = await c.DriveToAsync("bankAngle", 0, EQ, new SightDriveOptions(StepSize: 15), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.NoReading, r.Status, "before the fix: Converged with 2 chords");
        Assert.Contains("out of its context", r.Reason);
        Assert.Empty(kb.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task M7_the_ledger_resets_at_a_context_change_so_the_counted_fallback_never_undoes_another_piece()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t);
        await Warm(live);
        var c = new SightControl(live, new SimKeyboard(game), new SimMouse(game), new GestureGuard(t), false, null, t);
        await c.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 3, SightAdjustMethod.Buttons, Gestures.Turn(t, 3));
        Assert.Equal(3, c.Counted("syn.builder.bankControl"));
        // The builder closes and opens again (a new piece): the context changed.
        var first = live.Engine!.MainContext();
        Assert.Equal("coasterBuilder", first.Id);
        game.State.Tool = "terrain";
        await Until(live, () => live.Engine.MainContext().Id == "terrain");
        game.State.Tool = "coaster";
        await Until(live, () => live.Engine.MainContext().Id == "coasterBuilder");
        Assert.NotEqual(first.Since, live.Engine.MainContext().Since);
        game.State.AngleFormat = "";   // no value to read: the drive would fall back to counting
        var bankBefore = game.State.Bank;
        var r = await c.DriveToAsync("bankAngle", 0, new SightControlSteps("syn.builder.bankControl", SightAdjustMethod.Buttons), new SightDriveOptions(Fallback: SightDriveFallback.Counted), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.NoReading, r.Status, "nothing counted for this piece: nothing undone");
        Assert.Equal(0, c.Counted("syn.builder.bankControl"));
        Assert.Equal(bankBefore, game.State.Bank);
    }

    // ------------------------------------------------------------------ M8 / M10 / M11 (the service)

    private sealed class NoProbe : IPolicyProbe
    {
        public List<string> Running { get; } = [];
        public IReadOnlyCollection<string> RunningProcessNames() => Running;
        public IReadOnlyCollection<string> ListFolder(string folder) => [];
    }

    private sealed class ThrowingCapture(Action onDispose, Exception error) : ICaptureSource
    {
        public void Start() => throw error;
        public bool PollCached(TimeSpan quietFor) => false;
        public bool SetMinUpdateInterval(TimeSpan interval) => false;
        public CapturePixelFormat Format => CapturePixelFormat.Bgra8;
        public double PaperWhite => 1;
        public CaptureStats Stats { get; } = new();
        public event Action? Closed { add { } remove { } }
        public void Dispose() => onDispose();
    }

    private static SightService Service(ManualTimeProvider t, CaptureFactory factory, Func<nint> fg, Func<nint, WindowIdentity?> identify, NoProbe? probe = null, SightSettings? settings = null, bool draft = false)
    {
        var json = SyntheticHud.RecipeJson();
        if (draft) json = json.Replace("\"status\": \"calibrated\"", "\"status\": \"draft\"");
        var recipe = RecipeLoader.FromJson(json, SyntheticHud.Recipe().Assets);
        var policy = new GamePolicy(new UserGames(null), probe ?? new NoProbe(), t) { ExtraAllowlist = [new KnownGame("syncoaster", "Synthetic coaster", ["SyntheticCoaster.exe"])] };
        return new SightService(new SightServiceOptions
        {
            Recipes = [recipe], Policy = policy, Time = t, CaptureFactory = factory, Foreground = fg, Identify = identify,
            Visibility = _ => WindowVisibility.Visible, Settings = settings ?? new SightSettings(),
        });
    }

    private static WindowIdentity? Ids(nint h) => h switch
    {
        0x7001 => new WindowIdentity(4321, "SyntheticCoaster.exe", @"D:\Games\Example\SyntheticCoaster.exe", "SynWindow"),
        0x8801 => new WindowIdentity(5555, "Overwatch.exe", @"D:\Games\Example\Overwatch\Overwatch.exe", "TankWindowClass"),
        _ => new WindowIdentity(1, "explorer.exe", @"C:\Windows\explorer.exe", "Shell"),
    };

    [Test(TimeoutMs = 180_000)]
    public async Task M8_a_failing_capture_start_is_disposed_backed_off_and_never_posts_resumed()
    {
        var t = new ManualTimeProvider();
        int created = 0, disposed = 0;
        var svc = Service(t, (h, o, p, s) => { created++; return new ThrowingCapture(() => disposed++, new System.Runtime.InteropServices.COMException("simulated", unchecked((int)0x80070005))); }, () => 0x7001, Ids);
        var events = new List<SightEvent>();
        svc.Subscribe(_ => { }, e => { lock (events) events.Add(e); });
        for (var i = 0; i < 8; i++) { t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick(); }
        svc.DrainForTests();
        Assert.Equal(SightRunState.Error, svc.Current.State);
        Assert.True(created <= 2, $"before the fix: 9 sessions in 2 s; now {created}");
        Assert.Equal(created, disposed, "every half-started session is released");
        Assert.Empty(events.Where(e => e.Type == "resumed"), "nothing resumed");
        Assert.False(svc.CanRead);
        await svc.DisposeAsync();
    }

    [Test(TimeoutMs = 180_000)]
    public async Task M11_no_window_capture_means_sight_is_off_for_that_game_with_a_clear_message()
    {
        var t = new ManualTimeProvider();
        var svc = Service(t, (h, o, p, s) => new ThrowingCapture(() => { }, new SightCaptureUnavailableException("window capture is not available for this game (0x80070005): Sight is off for it (it never captures the whole screen)")), () => 0x7001, Ids);
        t.Advance(TimeSpan.FromMilliseconds(250));
        svc.Tick();
        Assert.Equal(SightRunState.Error, svc.Current.State);
        Assert.Contains("never captures the whole screen", svc.Current.Reason);
        Assert.Null(typeof(CaptureOptions).GetProperty("ForceMonitor"), "the monitor fallback option is gone");
        await svc.DisposeAsync();
    }

    private sealed class CountingCapture(Action onDispose) : ICaptureSource
    {
        public bool Changed;
        public void Start() { }
        public bool PollCached(TimeSpan quietFor) => false;
        public bool SetMinUpdateInterval(TimeSpan interval) => true;
        public CapturePixelFormat Format => CapturePixelFormat.Bgra8;
        public double PaperWhite => 1;
        public CaptureStats Stats { get; } = new();
        public event Action? Closed { add { } remove { } }
        public bool DisplayChanged() { var c = Changed; Changed = false; return c; }
        public void Dispose() => onDispose();
    }

    [Test(TimeoutMs = 180_000)]
    public async Task M10_an_online_competitive_game_in_front_pauses_all_capture_and_vgc_counts_as_anti_cheat()
    {
        var t = new ManualTimeProvider();
        var fg = (nint)0x7001;
        var caps = new List<CountingCapture>();
        var disposed = 0;
        var svc = Service(t, (h, o, p, s) => { var c = new CountingCapture(() => disposed++); caps.Add(c); return c; }, () => fg, Ids);
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(SightRunState.Running, svc.Current.State);
        fg = 0x8801;   // Overwatch comes to the front; the coaster stays visible behind it
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(SightRunState.Paused, svc.Current.State, "before the fix: still Running (capturing in the background)");
        Assert.Contains("Overwatch", svc.Current.Reason);
        Assert.Equal(1, disposed, "the capture session is stopped");
        fg = 0x7001;
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(SightRunState.Running, svc.Current.State);
        Assert.Equal(2, caps.Count);
        await svc.DisposeAsync();
        Assert.Contains("vgc.exe", string.Join(",", GameLists.RunningAntiCheat));
        // A running Vanguard service blocks reading within ~3 s (the cache), not ~20 s.
        var probe = new NoProbe();
        var t2 = new ManualTimeProvider();
        var svc2 = Service(t2, (h, o, p, s) => new CountingCapture(() => { }), () => 0x7001, Ids, probe);
        t2.Advance(TimeSpan.FromMilliseconds(250)); svc2.Tick();
        Assert.Equal(SightRunState.Running, svc2.Current.State);
        probe.Running.Add("vgc.exe");
        for (var i = 0; i < 13; i++) { t2.Advance(TimeSpan.FromMilliseconds(250)); svc2.Tick(); }
        Assert.Equal(SightRunState.Blocked, svc2.Current.State, "LOW: the policy is re-checked every tick");
        Assert.Contains("vgc.exe", svc2.Current.Reason);
        await svc2.DisposeAsync();
    }

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_a_display_change_restarts_the_capture_and_drafts_off_stops_a_running_draft()
    {
        var t = new ManualTimeProvider();
        var caps = new List<CountingCapture>();
        var disposed = 0;
        var settings = new SightSettings { AllowDraftRecipes = true };
        var svc = Service(t, (h, o, p, s) => { var c = new CountingCapture(() => disposed++); caps.Add(c); return c; }, () => 0x7001, Ids, settings: settings, draft: true);
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(SightRunState.Running, svc.Current.State);
        caps[0].Changed = true;   // HDR switched on (or the SDR white level / the monitor changed)
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(2, caps.Count, "a new session with the new format and paper white");
        Assert.Equal(1, disposed);
        settings.AllowDraftRecipes = false;
        t.Advance(TimeSpan.FromMilliseconds(250)); svc.Tick();
        Assert.Equal(SightRunState.Idle, svc.Current.State, "before the fix the running draft kept reading");
        Assert.Equal(2, disposed);
        await svc.DisposeAsync();
        // The white reference: never outside 80–1000 nits, whatever the frames say.
        var pw = 2.5;
        for (var i = 0; i < 500; i++) pw = WgcRegionCapture.SmoothPaperWhite(pw, 1000);
        Assert.True(pw <= WgcRegionCapture.MaxPaperWhite + 1e-9, $"{pw}");
        for (var i = 0; i < 500; i++) pw = WgcRegionCapture.SmoothPaperWhite(pw, 0.01);
        Assert.True(pw >= WgcRegionCapture.MinPaperWhite - 1e-9, $"{pw}");
    }

    // ------------------------------------------------------------------ M12

    [Test(TimeoutMs = 180_000)]
    public async Task M12_wheel_steps_are_capped_to_what_one_call_sends_and_the_ledger_books_exactly_that()
    {
        var t = new ManualTimeProvider();
        var json = SyntheticHud.RecipeJson().Replace("\"notchesPerStep\": 1", "\"notchesPerStep\": 5");
        var recipe = RecipeLoader.FromJson(json, SyntheticHud.Recipe().Assets);
        var game = new SimGame();
        var live = new SimLive(game, t, recipe);
        var mouse = new SimMouse(game);
        var c = new SightControl(live, new SimKeyboard(game), mouse, new GestureGuard(t), false, null, t);
        var r = await c.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 12, SightAdjustMethod.Wheel, Gestures.Turn(t, 12));
        Assert.True(r.Acted, r.Reason);
        Assert.Equal("wheel 50 at (-272,610)", Assert.Single(mouse.Sent));
        Assert.Equal(10, r.Steps);
        Assert.Equal(10, c.Counted("syn.builder.bankControl"), "before the fix: 12 booked for 10 sent");
    }

    // ------------------------------------------------------------------ the 12 LOWs not covered above

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_a_drive_that_ended_a_moment_ago_never_costs_the_next_turn()
    {
        // The race: a turn read _currentDrive, the drive finished and disposed its source, the turn's Cancel threw.
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t);
        var kb = new SimKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var gone = new CancellationTokenSource();
        gone.Dispose();
        typeof(SightControl).GetField("_currentDrive", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(c, gone);
        var r = await c.StepAsync(EQ, SightAdjustDirection.Increase, 2, Gestures.Turn(t, 2));
        Assert.Equal(SightActStatus.Done, r.Status, "before the fix: ObjectDisposedException, the turn was lost");
        Assert.Equal(2, kb.Sent.Count);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_read_loops_give_up_at_once_while_nothing_can_be_read()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t) { Reading = false };
        var kb = new SimKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = await c.DriveToAsync("bankAngle", 0, EQ, 0.5, Gestures.Push(t));
        Assert.Equal(SightDriveStatus.NoReading, r.Status);
        Assert.Contains("not reading", r.Reason);
        Assert.Equal(0, live.FreshCalls, "before the fix the loop spun ~1.2 s of FreshAsync calls");
        Assert.True(sw.ElapsedMilliseconds < 1000, $"{sw.ElapsedMilliseconds} ms");
        Assert.Empty(kb.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_scancode_chord_steps_hold_each_press_like_the_pack_s_keyHoldMs()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t);
        var kb = new SimKeyboard(game);
        var c = new SightControl(live, kb, new SimMouse(game), new GestureGuard(t), false, null, t);
        var scancode = new SightChordSteps([VirtualKey.E], [VirtualKey.Q], KeyMode.Scancode, IntervalMs: 10);
        Assert.Equal(50, scancode.EffectiveHoldMs);
        Assert.Equal(0, EQ.EffectiveHoldMs);
        Assert.Equal(120, (scancode with { HoldMs = 120 }).EffectiveHoldMs);
        var r = await c.StepAsync(scancode, SightAdjustDirection.Increase, 3, Gestures.Turn(t, 3));
        Assert.Equal(SightActStatus.Done, r.Status, r.Reason);
        Assert.Equal(3, kb.Holds.Count, "three held presses (down, 50 ms, up), not three instant taps");
        Assert.Equal(3, kb.Releases);
        Assert.Empty(kb.HeldKeys);
        Assert.Equal(45.0, game.State.Bank);
    }

    private sealed class VersionProbe(ExeVersionInfo? info) : IPolicyProbe
    {
        public IReadOnlyCollection<string> RunningProcessNames() => [];
        public IReadOnlyCollection<string> ListFolder(string folder) => [];
        public ExeVersionInfo? VersionInfo(string exePath) => info;
    }

    [Test(TimeoutMs = 180_000)]
    public void LOW_a_renamed_exe_is_not_the_allowlisted_game_and_the_status_never_promises_a_pi_switch()
    {
        var path = @"E:\Games\Example\PlanetCoaster2.exe";
        GamePolicy P(ExeVersionInfo? v) => new(new UserGames(null), new VersionProbe(v), new ManualTimeProvider());
        Assert.Equal("Allowlisted", P(new ExeVersionInfo("Planet Coaster 2", null, null, "Planet Coaster 2", "Frontier Developments")).Evaluate("PlanetCoaster2.exe", path).Verdict);
        Assert.Equal("Allowlisted", P(null).Evaluate("PlanetCoaster2.exe", path).Verdict, "no version info: name rules as before");
        var renamed = P(new ExeVersionInfo("VALORANT", "VALORANT.exe", "VALORANT", "VALORANT", "Riot Games")).Evaluate("PlanetCoaster2.exe", path);
        Assert.Equal("Denied", renamed.Verdict, "a denylisted game under an allowlisted name");
        var other = P(new ExeVersionInfo("Some Tool", "tool.exe", null, null, null)).Evaluate("PlanetCoaster2.exe", path);
        Assert.False(other.ReadAllowed || other.InputAllowed, other.Reason);
        Assert.Contains("renamed", other.Reason);
        // NMS.exe's version resource says "NoMansSky.exe" (verified on this PC): matched by product name, not file name.
        Assert.True(P(new ExeVersionInfo("No Man's Sky", "NoMansSky.exe", "NoMansSky", null, "Hello Games")).Evaluate("NMS.exe", @"E:\Games\Example\NMS.exe").InputAllowed);
        Assert.DoesNotContain("property inspector", P(null).Evaluate("Mystery.exe").Reason, "nothing calls TryEnable from the PI");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_the_game_link_token_goes_only_to_the_pid_gamelink_json_names()
    {
        var dir = Fx.TempDir("gl-pid");
        var token = new string('3', 64);
        var file = Path.Combine(dir, "gamelink.json");
        File.WriteAllText(file, $$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": 38150, "tokens": { "cs2": "{{new string('1', 64)}}", "companion": "{{token}}" }, "pid": 4242 }""");
        Assert.Equal(4242, GameLinkFile.TryRead(file)!.Pid);
        var rec = new RecordingHandler();
        var t = new ManualTimeProvider();
        var squatter = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = file, Handler = rec, Time = t, ListenerPids = _ => [9999] });
        squatter.OnSnapshot(Snap());
        await squatter.PumpAsync(default);
        Assert.Equal(0, rec.Count, "before the fix the bearer token went to whoever held the port");
        Assert.Contains("another process", squatter.LastError);
        await squatter.DisposeAsync();
        var deck = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = file, Handler = rec, Time = t, ListenerPids = _ => [4242] });
        deck.OnSnapshot(Snap());
        await deck.PumpAsync(default);
        Assert.Equal(1, rec.Count);
        await deck.DisposeAsync();
        // No pid (the listener is not running): nothing is sent.
        File.WriteAllText(file, $$"""{ "v": 1, "plugin": "com.jeremyfhall.prism", "port": 38150, "tokens": { "cs2": "{{new string('1', 64)}}", "companion": "{{token}}" }, "pid": null }""");
        var down = new GameLinkForwarder(new GameLinkForwarderOptions { FilePath = file, Handler = rec, Time = t, ListenerPids = _ => [4242] });
        down.OnSnapshot(Snap());
        await down.PumpAsync(default);
        Assert.Equal(1, rec.Count);
        await down.DisposeAsync();
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int Count;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Count);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") });
        }
    }

    private static SightSnapshot Snap() => new(1, DateTimeOffset.UnixEpoch, SightRunState.Running, "syncoaster", "synthetic-coaster", "SyntheticCoaster.exe",
        new SightContext("coasterBuilder", "Coaster builder", SightConfidence.Observed, null, ["coasterBuilder"]),
        new Dictionary<string, SightReadout>(), new Dictionary<string, SightControlState>(), false, null);

    [Test(TimeoutMs = 180_000)]
    public void LOW_an_unreadable_recipe_file_or_folder_never_crashes_LoadRecipes()
    {
        var root = Fx.TempDir("recipes-denied");
        var ctx = new SightTestContext(root, safe: true);
        var dir = Path.Combine(ctx.DataDirectory, "recipes");
        Directory.CreateDirectory(dir);
        var denied = Path.Combine(dir, "locked.json");
        File.WriteAllText(denied, SyntheticHud.RecipeJson());
        var info = new FileInfo(denied);
        var acl = info.GetAccessControl();
        var me = System.Security.Principal.WindowsIdentity.GetCurrent().User!;
        var rule = new System.Security.AccessControl.FileSystemAccessRule(me, System.Security.AccessControl.FileSystemRights.ReadData, System.Security.AccessControl.AccessControlType.Deny);
        acl.AddAccessRule(rule);
        info.SetAccessControl(acl);
        try
        {
            Assert.Throws<UnauthorizedAccessException>(() => File.ReadAllText(denied));
            var recipes = SightModule.LoadRecipes(ctx, ctx.Log);   // before the fix: UnauthorizedAccessException
            Assert.True(recipes.Count >= 2, "the built-ins still load");
            Assert.Contains("locked.json skipped", ctx.MemLog.All);
        }
        finally
        {
            acl.RemoveAccessRule(rule);
            info.SetAccessControl(acl);
            File.Delete(denied);
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task LOW_the_default_glyph_set_is_warmed_outside_the_read_budget()
    {
        await GlyphSet.WarmDefaultAsync().WaitAsync(TimeSpan.FromSeconds(30));
        Assert.True(GlyphSet.WarmDefaultAsync().IsCompleted, "built once, then free");
        Assert.True(GlyphSet.Default.Templates.Count > 0);
    }
}
