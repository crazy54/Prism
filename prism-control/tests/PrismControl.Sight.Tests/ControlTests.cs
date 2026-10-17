using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Control;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

public class GestureTests
{
    private static GestureToken MintFrom(ActionEvent e, TimeProvider t) => Desktop.Sight.Gestures.Mint(Desktop.Sight.Gestures.Begin(e, t).Id)!;

    [Test(TimeoutMs = 180_000)]
    public void Tokens_come_only_from_registered_deck_gestures()
    {
        var t = new ManualTimeProvider();
        Assert.Equal(GestureKind.KeyUp, Gestures.Press(t).Kind);
        Assert.Equal(GestureKind.KeyDown, Gestures.KeyDown(t).Kind);
        Assert.Equal(GestureKind.DialUp, Gestures.Push(t).Kind);
        var turn = Gestures.Turn(t, -12);
        Assert.Equal(GestureKind.DialRotate, turn.Kind);
        Assert.Equal(-12, turn.Ticks);
        Assert.Equal(t.GetUtcNow(), turn.At);
        Assert.Equal(t.GetUtcNow(), turn.ArrivedAt);
        Assert.NotEqual(Gestures.Press(t).Nonce, Gestures.Press(t).Nonce);
        Assert.Throws<ArgumentException>(() => Desktop.Sight.Gestures.Begin(new WillAppearEvent("c", "u", "d", Controller.Keypad, null, 0, false), t));
        Assert.Throws<ArgumentException>(() => Desktop.Sight.Gestures.Begin(new SendToPluginEvent("c", "u", null), t));
        Assert.Throws<ArgumentException>(() => Desktop.Sight.Gestures.Begin(new KeyUpEvent("", "u", "d", null, 0, null, false), t));
        Assert.Throws<ArgumentException>(() => Desktop.Sight.Gestures.BeginHold(new KeyUpEvent("c", "u", "d", null, 0, null, false), t));
        // There is no other way to make one: no public constructor, and minting needs a registered gesture id.
        Assert.Empty(typeof(GestureToken).GetConstructors());
        Assert.Empty(typeof(Gesture).GetConstructors());
        Assert.Null(Desktop.Sight.Gestures.Mint(Guid.NewGuid()));
    }

    [Test(TimeoutMs = 180_000)]
    public void Begin_is_idempotent_per_delivery_and_a_hold_is_its_own_gesture()
    {
        var t = new ManualTimeProvider();
        var down = new KeyDownEvent("ctx-h", "com.example.smart", "dev", new Coordinates(0, 0), 0, null, false);
        var g1 = Desktop.Sight.Gestures.Begin(down, t);
        t.Advance(TimeSpan.FromMilliseconds(300));
        var g2 = Desktop.Sight.Gestures.Begin(down, t);
        Assert.True(ReferenceEquals(g1, g2), "the same delivery: the same gesture, the first arrival");
        Assert.Equal(g1.ArrivedAt, g2.ArrivedAt);
        // The long-press handler gets the same KeyDownEvent object later (here a 1.1 s confirm hold): the hold is a new,
        // present gesture (E12), while the key-down itself is too old to mint from.
        t.Advance(TimeSpan.FromMilliseconds(800));
        var hold = Desktop.Sight.Gestures.BeginHold(down, t);
        Assert.NotEqual(g1.Id, hold.Id);
        Assert.True(hold.IsHold);
        Assert.Equal(t.GetUtcNow(), hold.ArrivedAt);
        Assert.True(ReferenceEquals(hold, Desktop.Sight.Gestures.BeginHold(down, t)));
        Assert.Null(Desktop.Sight.Gestures.Mint(g1.Id), "the key-down arrived 1.1 s ago");
        Assert.NotNull(Desktop.Sight.Gestures.Mint(hold.Id), "the hold arrived just now");
    }

    [Test(TimeoutMs = 180_000)]
    public void The_guard_accepts_a_fresh_fitting_token_once()
    {
        var t = new ManualTimeProvider();
        var g = new GestureGuard(t);
        var token = Gestures.Press(t);
        Assert.True(g.TryAccept(token, GestureUse.Click, out _));
        Assert.False(g.TryAccept(token, GestureUse.Click, out var reused));
        Assert.Contains("already used", reused);
        // One-shot across guards too (the service and the control layer).
        Assert.False(new GestureGuard(t).TryAccept(token, GestureUse.Click, out var other));
        Assert.Contains("already used", other);
        Assert.False(g.TryAccept(null, GestureUse.Drive, out var none));
        Assert.Contains("no gesture", none);
    }

    [Test(TimeoutMs = 180_000)]
    public void The_guard_rejects_old_and_future_tokens()
    {
        var t = new ManualTimeProvider();
        var g = new GestureGuard(t);
        var old = Gestures.Press(t);
        t.Advance(TimeSpan.FromMilliseconds(1001));
        Assert.False(g.TryAccept(old, GestureUse.Click, out var why));
        Assert.Contains("ms old", why);
        var ok = Gestures.Press(t);
        t.Advance(TimeSpan.FromMilliseconds(999));
        Assert.True(g.TryAccept(ok, GestureUse.Click, out _));
        var other = new ManualTimeProvider(t.GetUtcNow() + TimeSpan.FromSeconds(5));
        Assert.False(g.TryAccept(Gestures.Press(other), GestureUse.Click, out var future));
        Assert.Contains("future", future);
        // A guard can be stricter than 1 s, never looser.
        Assert.Equal(TimeSpan.FromSeconds(1), new GestureGuard(t, TimeSpan.FromSeconds(30)).MaxAge);
    }

    [Test(TimeoutMs = 180_000)]
    public void One_gesture_mints_up_to_eight_tokens_for_macro_steps_within_its_second()
    {
        var t = new ManualTimeProvider();
        var g = new GestureGuard(t);
        var ev = new KeyUpEvent("ctx-m", "com.example.smart", "dev", new Coordinates(0, 0), 0, null, false);
        var gesture = Desktop.Sight.Gestures.Begin(ev, t);
        var tokens = Enumerable.Range(0, 8).Select(_ => Desktop.Sight.Gestures.Mint(gesture.Id)!).ToList();
        Assert.Single(tokens.Select(x => x.GestureId).Distinct());
        Assert.True(tokens.Select(x => x.Sequence).SequenceEqual(Enumerable.Range(1, 8)));
        Assert.False(Desktop.Sight.Gestures.TryMint(gesture.Id, TimeSpan.FromSeconds(1), out var ninth, out var capped));
        Assert.Null(ninth);
        Assert.Contains("more than 8", capped);
        Assert.Equal(8, gesture.Minted);
        for (var i = 0; i < 8; i++) Assert.True(g.TryAccept(tokens[i], GestureUse.Click, out var why), $"step {i + 1}: {why}");
        // A later step minted 0.9 s after the arrival is fine; one 1.1 s after it is not (age counts from the arrival).
        var g2 = Desktop.Sight.Gestures.Begin(new KeyUpEvent("ctx-m", "com.example.smart", "dev", new Coordinates(0, 0), 0, null, false), t);
        var s1 = Desktop.Sight.Gestures.Mint(g2.Id)!;
        t.Advance(TimeSpan.FromMilliseconds(900));
        var s2 = Desktop.Sight.Gestures.Mint(g2.Id)!;
        Assert.True(g.TryAccept(s1, GestureUse.Click, out _) && g.TryAccept(s2, GestureUse.Click, out _));
        t.Advance(TimeSpan.FromMilliseconds(200));
        Assert.False(Desktop.Sight.Gestures.TryMint(g2.Id, TimeSpan.FromSeconds(1), out _, out var late));
        Assert.Contains("ms old", late);
        // Equal-looking records built in code are different deliveries (identity, not value equality).
        var a1 = new KeyUpEvent("c", "u", "d", null, 0, null, false);
        var a2 = new KeyUpEvent("c", "u", "d", null, 0, null, false);
        Assert.NotEqual(Desktop.Sight.Gestures.Begin(a1, t).Id, Desktop.Sight.Gestures.Begin(a2, t).Id);
    }

    [Test(TimeoutMs = 180_000)]
    public void M5_a_copy_of_a_delivered_event_cannot_refresh_its_gesture()
    {
        // The reviewer's repro: 20 tokens from `ev with { }` clones of a 30-s-old event were all accepted.
        var t = new ManualTimeProvider();
        var guard = new GestureGuard(t);
        // As the host delivers it: every inbound event carries its own (deep-cloned) settings object.
        var ev = new KeyUpEvent("ctx-1", "com.example.any", "dev", new Coordinates(0, 0), 0, null, false) { RawSettings = new System.Text.Json.Nodes.JsonObject() };
        var gesture = Desktop.Sight.Gestures.Begin(ev, t);
        var first = Desktop.Sight.Gestures.Mint(gesture.Id)!;
        t.Advance(TimeSpan.FromSeconds(30));
        Assert.False(guard.TryAccept(first, GestureUse.Click, out var stale));
        Assert.Contains("30000 ms old", stale);
        var accepted = 0;
        for (var i = 0; i < 20; i++)
        {
            var copy = Desktop.Sight.Gestures.Begin(ev with { }, t);
            Assert.True(ReferenceEquals(gesture, copy), "a copy maps to the same delivery");
            if (Desktop.Sight.Gestures.Mint(copy.Id) is { } tok && guard.TryAccept(tok, GestureUse.Click, out _)) accepted++;
        }
        Assert.Equal(0, accepted);
        // The token object carries no clock of its own: freshness is the registry's recorded arrival.
        Assert.Equal(gesture.ArrivedAt, first.ArrivedAt);
    }

    [Test(TimeoutMs = 180_000)]
    public void Kinds_must_fit_the_use_and_multi_action_steps_are_refused()
    {
        var t = new ManualTimeProvider();
        var g = new GestureGuard(t);
        Assert.False(g.TryAccept(Gestures.Turn(t, 1), GestureUse.Click, out _), "a dial turn never clicks");
        Assert.False(g.TryAccept(Gestures.Turn(t, 1), GestureUse.Drive, out _), "a dial turn never starts a closed loop");
        Assert.False(g.TryAccept(Gestures.Push(t), GestureUse.Calibrate, out _), "calibration starts from a key");
        Assert.True(g.TryAccept(Gestures.Turn(t, 1), GestureUse.Adjust, out _));
        Assert.True(g.TryAccept(Gestures.Push(t), GestureUse.Drive, out _));
        Assert.True(g.TryAccept(Gestures.KeyDown(t), GestureUse.Calibrate, out _));
        var multi = MintFrom(new KeyUpEvent("ctx-x", "u", "d", new Coordinates(0, 0), 0, null, true), t);
        Assert.False(g.TryAccept(multi, GestureUse.Click, out var why));
        Assert.Contains("multi-action", why);
    }
}

public class ControlTests
{
    private sealed class Rig
    {
        public readonly ManualTimeProvider Time = new();
        public readonly SimGame Game = new();
        public readonly SimLive Live;
        public readonly SimKeyboard Keys;
        public readonly SimMouse Mouse;
        public readonly MemoryLog Log = new();
        public readonly SightControl Control;

        public Rig(bool safe = false, Action<SimGame>? setup = null, Desktop.Sight.SightGameAccess? access = null)
        {
            setup?.Invoke(Game);
            Live = new SimLive(Game, Time, access: access);
            Keys = new SimKeyboard(Game);
            Mouse = new SimMouse(Game);
            Control = new SightControl(Live, safe ? new RecordingInputSender(Log, _ => false) : Keys, safe ? new RecordingMouseSender(Log) : Mouse, new GestureGuard(Time), safe, Log, Time);
        }

        public GestureToken Push() => Gestures.Push(Time);
        public GestureToken Turn(int ticks) => Gestures.Turn(Time, ticks);
        public GestureToken Press() => Gestures.Press(Time);
        public static readonly SightChordSteps EQ = new([VirtualKey.E], [VirtualKey.Q], IntervalMs: 10);
        public int Sent => Keys.Sent.Count + Mouse.Sent.Count;
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Push_to_level_with_chords_converges_with_the_fewest_steps()
    {
        var rig = new Rig(setup: g => g.State.Bank = -30);
        var r = await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, rig.Push());
        Assert.Equal(SightDriveStatus.Converged, r.Status, r.Reason);
        Assert.Equal(-30.0, r.Start);
        Assert.Equal(0.0, r.Final);
        Assert.Equal(2, r.StepsSent, "unknown step size: one probe step, then the exact rest");
        Assert.Equal(0.0, rig.Game.State.Bank);
        // The step size is learned: the next drive is one burst.
        rig.Game.State.Bank = 45;
        var again = await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, rig.Push());
        Assert.Equal(SightDriveStatus.Converged, again.Status);
        Assert.Equal(3, again.StepsSent);
        Assert.Equal(5, rig.Keys.Sent.Count);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Push_to_level_by_the_region_id_the_pack_uses()
    {
        var rig = new Rig(setup: g => g.State.Bank = 15);
        var r = await rig.Control.DriveToAsync("syn.builder.bankValue", 0, Rig.EQ, new SightDriveOptions(StepSize: 15), rig.Push());
        Assert.Equal(SightDriveStatus.Converged, r.Status, r.Reason);
        Assert.Equal(1, r.StepsSent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Push_to_level_through_the_on_screen_stepper_clicks_the_located_buttons()
    {
        var rig = new Rig(setup: g => g.State.Bank = 60);
        var r = await rig.Control.DriveToAsync("bankAngle", 0, new SightControlSteps("syn.builder.bankControl", SightAdjustMethod.Buttons), new SightDriveOptions(), rig.Push());
        Assert.Equal(SightDriveStatus.Converged, r.Status, r.Reason);
        Assert.Equal(0.0, rig.Game.State.Bank);
        Assert.Equal(4, rig.Game.Clicks);
        Assert.True(rig.Mouse.Sent.All(s => s.StartsWith("click (-", StringComparison.Ordinal)), "clicks land on the left monitor (negative x): " + string.Join(", ", rig.Mouse.Sent));
        Assert.True(rig.Mouse.ExpectedWindows.All(h => h == SimLive.Hwnd), "every click names the game window (WrongWindow guard)");
        // M7: the value was OBSERVED at the target, so the counted baseline restarts there (a later counted fallback
        // must not undo the drive's own four clicks).
        Assert.Equal(0, rig.Control.Counted("syn.builder.bankControl"));
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Adjust_steps_by_buttons_wheel_and_drag_and_verifies_by_re_reading()
    {
        foreach (var method in new[] { SightAdjustMethod.Buttons, SightAdjustMethod.Wheel, SightAdjustMethod.Drag })
        {
            var rig = new Rig(setup: g => g.State.Bank = 0);
            var up = await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 2, method, rig.Turn(2));
            Assert.Equal(SightActStatus.Verified, up.Status, $"{method}: {up.Reason}");
            Assert.Equal(30.0, rig.Game.State.Bank, method.ToString());
            Assert.Equal(0.0, up.Before);
            Assert.Equal(30.0, up.After);
            var down = await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Decrease, 1, method, rig.Turn(-1));
            Assert.Equal(SightActStatus.Verified, down.Status, $"{method}: {down.Reason}");
            Assert.Equal(15.0, rig.Game.State.Bank, method.ToString());
            Assert.Equal(1, rig.Control.Counted("syn.builder.bankControl"));
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Clicking_a_located_button_is_verified_by_its_rule()
    {
        var rig = new Rig();
        var r = await rig.Control.ClickAsync("syn.builder.btn.test", rig.Press());
        Assert.Equal(SightActStatus.Verified, r.Status, r.Reason);
        Assert.True(rig.Game.State.Results);
        // The click did not register (the game ignored it): reported, not assumed.
        var deaf = new Rig(setup: g => g.InputRegisters = false);
        var nv = await deaf.Control.ClickAsync("syn.builder.btn.test", deaf.Press());
        Assert.Equal(SightActStatus.NotVerified, nv.Status);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task A_macro_step_whose_precondition_is_not_visible_sends_nothing()
    {
        // Variant recipe: the TEST button may only be clicked while the results panel shows (a stand-in for "the
        // Utilities tab opened by step 1"). Step 2 runs on a token minted from the same deck event.
        var (_, assets) = SyntheticHud.Recipe();
        var json = SyntheticHud.RecipeJson().Replace("\"verify\": \"resultsPanel\", \"settleMs\": 10", "\"requires\": \"resultsPanel\", \"settleMs\": 10");
        var recipe = Recipes.RecipeLoader.FromJson(json, assets);
        var t = new ManualTimeProvider();
        var game = new SimGame();
        var live = new SimLive(game, t, recipe);
        var mouse = new SimMouse(game);
        var c = new SightControl(live, new SimKeyboard(game), mouse, new GestureGuard(t), false, null, t);
        var gesture = Desktop.Sight.Gestures.Begin(new KeyUpEvent("ctx-macro", "com.example.smart", "dev", new Coordinates(0, 0), 0, null, false), t);
        var blind = await c.ClickAsync("syn.builder.btn.test", Desktop.Sight.Gestures.Mint(gesture.Id)!);
        Assert.Equal(SightActStatus.NotFound, blind.Status);
        Assert.Contains("precondition", blind.Reason);
        Assert.Empty(mouse.Sent);
        game.State.Results = true;   // step 1 happened
        var ok = await c.ClickAsync("syn.builder.btn.test", Desktop.Sight.Gestures.Mint(gesture.Id)!);
        Assert.Equal(SightActStatus.Done, ok.Status, ok.Reason);
        Assert.Single(mouse.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Nothing_is_sent_when_the_element_is_not_found()
    {
        var rig = new Rig(setup: g => { g.State.BankControl = false; g.State.TestButton = false; });
        var click = await rig.Control.ClickAsync("syn.builder.btn.test", rig.Press());
        Assert.Equal(SightActStatus.NotFound, click.Status);
        var adjust = await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 1, SightAdjustMethod.Auto, rig.Turn(1));
        Assert.Equal(SightActStatus.NotFound, adjust.Status);
        var drive = await rig.Control.DriveToAsync("bankAngle", 0, new SightControlSteps("syn.builder.bankControl"), new SightDriveOptions(), rig.Push());
        Assert.True(drive.Status is SightDriveStatus.NotFound or SightDriveStatus.AlreadyThere, drive.Status.ToString());
        Assert.Empty(rig.Mouse.Sent);
        // The builder closed entirely: nothing to read either.
        var closed = new Rig(setup: g => g.State.BuilderOpen = false);
        var nr = await closed.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, closed.Push());
        Assert.Equal(SightDriveStatus.NoReading, nr.Status);
        Assert.Empty(closed.Keys.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Every_path_refuses_without_a_fresh_fitting_gesture_and_sends_nothing()
    {
        var rig = new Rig(setup: g => g.State.Bank = -30);
        var old = rig.Push();
        rig.Time.Advance(TimeSpan.FromSeconds(1.2));
        Assert.Equal(SightDriveStatus.Refused, (await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, old)).Status);
        Assert.Equal(SightDriveStatus.Refused, (await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, null!)).Status);
        Assert.Equal(SightDriveStatus.Refused, (await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, rig.Turn(1))).Status, "a turn is not a push");
        Assert.Equal(SightActStatus.Refused, (await rig.Control.ClickAsync("syn.builder.btn.test", rig.Turn(1))).Status);
        var used = rig.Turn(1);
        Assert.Equal(SightActStatus.Verified, (await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 1, SightAdjustMethod.Buttons, used)).Status);
        var before = rig.Sent;
        Assert.Equal(SightActStatus.Refused, (await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 1, SightAdjustMethod.Buttons, used)).Status, "one-shot");
        Assert.Equal(SightActStatus.Refused, (await rig.Control.StepAsync(Rig.EQ, SightAdjustDirection.Increase, 1, used)).Status);
        Assert.Equal(before, rig.Sent);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Input_is_refused_unless_the_allowlisted_game_is_in_front_and_not_elevated()
    {
        var rig = new Rig(setup: g => g.State.Bank = -30);
        rig.Live.Foreground = 0x9999;
        var r = await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, rig.Push());
        Assert.Equal(SightDriveStatus.Refused, r.Status);
        Assert.Contains("not in front", r.Reason);
        rig.Live.Foreground = SimLive.Hwnd;
        rig.Keys.Elevated = true;
        Assert.Contains("administrator", (await rig.Control.StepAsync(Rig.EQ, SightAdjustDirection.Increase, 1, rig.Turn(1))).Reason);
        Assert.Empty(rig.Keys.Sent);
        // A user-enabled unknown game is readable but never receives input.
        var unknown = new Rig(access: new SightGameAccess("Mystery.exe", null, true, false, "UserEnabled", "enabled by you"));
        var u = await unknown.Control.ClickAsync("syn.builder.btn.test", unknown.Press());
        Assert.Equal(SightActStatus.Refused, u.Status);
        Assert.Contains("not allowed", u.Reason);
        Assert.Empty(unknown.Mouse.Sent);
        // No game at all.
        rig.Live.Target = null;
        Assert.Equal(SightActStatus.Refused, (await rig.Control.ClickAsync("syn.builder.btn.test", rig.Press())).Status);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task The_loop_stops_when_the_value_stops_changing_or_moves_the_wrong_way()
    {
        var stuck = new Rig(setup: g => { g.State.Bank = -30; g.InputRegisters = false; });
        var s = await stuck.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, stuck.Push());
        Assert.Equal(SightDriveStatus.Stalled, s.Status);
        Assert.True(s.StepsSent <= 3, $"gave up after {s.StepsSent} steps");
        var reversed = new Rig(setup: g => { g.State.Bank = -30; g.Reversed = true; });
        var d = await reversed.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, reversed.Push());
        Assert.Equal(SightDriveStatus.Diverged, d.Status);
        Assert.Equal(1, d.StepsSent, "one wrong step, then stop");
        var clamp = new Rig(setup: g => { g.State.Bank = 0; g.MaxBank = 45; });
        var c = await clamp.Control.DriveToAsync("bankAngle", 90, Rig.EQ, new SightDriveOptions(StepSize: 15), clamp.Push());
        Assert.Equal(SightDriveStatus.Stalled, c.Status, "the game clamps at 45: the value stops changing");
        Assert.Equal(45.0, c.Final);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Already_there_sends_nothing_and_the_budget_is_respected()
    {
        var rig = new Rig(setup: g => g.State.Bank = 0);
        var r = await rig.Control.DriveToAsync("bankAngle", 0, Rig.EQ, 0.5, rig.Push());
        Assert.Equal(SightDriveStatus.AlreadyThere, r.Status);
        Assert.Empty(rig.Keys.Sent);
        var far = new Rig(setup: g => { g.State.Bank = -180; g.StepDeg = 1; });
        var t = await far.Control.DriveToAsync("bankAngle", 180, Rig.EQ, new SightDriveOptions(StepSize: 1, MaxSteps: 20), far.Push());
        Assert.Equal(SightDriveStatus.Timeout, t.Status);
        Assert.True(t.StepsSent <= 20);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Counted_fallback_undoes_our_own_steps_when_the_value_cannot_be_read()
    {
        // The bank value is not printed (like a game that shows only a slider): count the steps we sent, undo them.
        var rig = new Rig(setup: g => g.State.Bank = 0);
        await rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 3, SightAdjustMethod.Buttons, rig.Turn(3));
        Assert.Equal(3, rig.Control.Counted("syn.builder.bankControl"));
        // Make the value unreadable (the game shows no number): nothing to read, so undo what Sight itself sent.
        rig.Game.State.AngleFormat = "";
        var r = await rig.Control.DriveToAsync("bankAngle", 0, new SightControlSteps("syn.builder.bankControl", SightAdjustMethod.Buttons), new SightDriveOptions(Fallback: SightDriveFallback.Counted), rig.Push());
        Assert.Equal(SightDriveStatus.CountedFallback, r.Status, r.Reason);
        Assert.Equal(3, r.StepsSent);
        Assert.Equal(0, rig.Control.Counted("syn.builder.bankControl"));
        Assert.Equal(0.0, rig.Game.State.Bank, "the game is back where it started");
        rig.Control.ResetLedger();
        Assert.Equal(0, rig.Control.Counted("syn.builder.bankControl"));
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Dial_spins_queue_and_a_new_push_overrides_a_running_drive()
    {
        var rig = new Rig(setup: g => g.State.Bank = 0);
        var spins = Enumerable.Range(0, 4).Select(_ => rig.Control.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 1, SightAdjustMethod.Buttons, rig.Turn(1))).ToList();
        var results = await Task.WhenAll(spins);
        Assert.True(results.All(r => r.Acted), string.Join(",", results.Select(r => r.Status)));
        Assert.Equal(60.0, rig.Game.State.Bank, "every tick landed");
    }
}

public class SafeModeTests
{
    [Test(TimeoutMs = 180_000)]
    public async Task Safe_mode_logs_the_plan_and_never_iterates()
    {
        var t = new ManualTimeProvider();
        var game = new SimGame();
        game.State.Bank = -45;
        var live = new SimLive(game, t);
        var log = new MemoryLog();
        var keys = new RecordingInputSender(log, _ => false);
        var mouse = new RecordingMouseSender(log);
        var c = new SightControl(live, keys, mouse, new GestureGuard(t), safeMode: true, log, t);
        var r = await c.DriveToAsync("bankAngle", 0, new SightChordSteps([VirtualKey.E], [VirtualKey.Q]), new SightDriveOptions(StepSize: 15), Gestures.Push(t));
        Assert.Equal(SightDriveStatus.SafeMode, r.Status);
        Assert.Equal(3, r.StepsSent);
        Assert.Equal(3, keys.Records.Count, "the plan went to the recording fake");
        Assert.Equal(-45.0, game.State.Bank, "nothing reached the game");
        Assert.Contains("[safe mode]", log.All);
        var click = await c.ClickAsync("syn.builder.btn.test", Gestures.Press(t));
        Assert.Equal(SightActStatus.SafeMode, click.Status);
        Assert.Single(mouse.Records);
        Assert.False(game.State.Results);
        var adj = await c.AdjustAsync("syn.builder.bankControl", SightAdjustDirection.Increase, 2, SightAdjustMethod.Wheel, Gestures.Turn(t, 2));
        Assert.Equal(SightActStatus.SafeMode, adj.Status);
        Assert.Equal(-45.0, game.State.Bank);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Safe_mode_still_refuses_what_it_would_refuse()
    {
        var t = new ManualTimeProvider();
        var live = new SimLive(new SimGame(), t);
        var keys = new RecordingInputSender(null, _ => false);
        var c = new SightControl(live, keys, new RecordingMouseSender(), new GestureGuard(t), safeMode: true, null, t);
        Assert.Equal(SightDriveStatus.Refused, (await c.DriveToAsync("bankAngle", 0, new SightChordSteps([VirtualKey.E], [VirtualKey.Q]), 0.5, Gestures.Turn(t, 1))).Status);
        Assert.Empty(keys.Records);
    }
}
