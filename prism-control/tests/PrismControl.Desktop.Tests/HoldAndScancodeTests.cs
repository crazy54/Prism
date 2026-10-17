using PrismControl.Desktop.Interop;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

public class KeyHoldTests
{
    private static (SendInputSender S, FakeInjector K, RecordingLog L, ManualTimeProvider T) Make(TimeSpan? maxHold = null)
    {
        var k = new FakeInjector();
        var log = new RecordingLog();
        var clock = new ManualTimeProvider();
        return (new SendInputSender(k, log, maxHold, clock), k, log, clock);
    }

    private static string D(IEnumerable<KeyEvent> events) => string.Join(" ", events.Select(e => (e.IsUp ? "-" : "+") + e.Vk.ToString("X2")));

    [Test]
    public async Task Down_holds_and_up_releases_newest_first()
    {
        var (s, k, _, _) = Make();
        Assert.True(await s.SendKeysDownAsync([VirtualKey.Shift, VirtualKey.W]));
        Assert.Equal("Shift,W", string.Join(",", s.HeldKeys));
        Assert.Equal("+10 +57", D(k.Batches[0]));
        Assert.True(await s.SendKeysDownAsync([VirtualKey.W, VirtualKey.A]), "W is already held: only A goes down");
        Assert.Equal("+41", D(k.Batches[1]));
        Assert.True(await s.SendKeysUpAsync([VirtualKey.Shift, VirtualKey.A]));
        Assert.Equal("-41 -10", D(k.Batches[2]));
        Assert.Equal("W", string.Join(",", s.HeldKeys));
        Assert.True(await s.SendKeysUpAsync([VirtualKey.Q]), "a key we do not hold is never touched");
        Assert.Equal(3, k.Batches.Count);
        await s.ReleaseAllAsync();
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Chords_tap_around_held_keys()
    {
        var (s, k, _, _) = Make();
        await s.SendKeysDownAsync([VirtualKey.Shift]);
        Assert.True(await s.SendChordAsync([VirtualKey.Shift, VirtualKey.A]));
        Assert.Equal("+41 -41", D(k.Batches[1]), "the held Shift is not released by the chord");
        Assert.Equal("Shift", string.Join(",", s.HeldKeys));
        Assert.True(await s.SendChordAsync([VirtualKey.Shift]), "nothing left to tap");
        Assert.Equal(2, k.Batches.Count);
        s.Dispose();
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task The_watchdog_releases_keys_held_too_long()
    {
        var (s, k, log, clock) = Make(TimeSpan.FromSeconds(3));
        Assert.Equal(TimeSpan.FromSeconds(3), s.MaxHold);
        await s.SendKeysDownAsync([VirtualKey.W]);
        clock.Advance(TimeSpan.FromSeconds(2));
        await s.SendKeysDownAsync([VirtualKey.Space]);
        clock.Advance(TimeSpan.FromSeconds(1.5));
        Assert.Equal("Space", string.Join(",", s.HeldKeys), "W passed 3 s and was released; Space has not");
        Assert.Contains("stuck-key watchdog", log.Text);
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
        Assert.Equal(SendInputSender.MaxHoldLimit, Make(TimeSpan.FromMinutes(5)).S.MaxHold, "never more than 10 s");
    }

    [Test]
    public async Task Any_failure_releases_everything_held()
    {
        var (s, k, log, _) = Make();
        await s.SendKeysDownAsync([VirtualKey.Control]);
        k.Script.Enqueue(1); // of Shift + A only Shift goes down
        Assert.False(await s.SendKeysDownAsync([VirtualKey.Shift, VirtualKey.A]));
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
        Assert.Equal("-10 -11", D(k.Batches[^1]), "released newest first");
        await s.SendKeysDownAsync([VirtualKey.Alt]);
        k.Script.Enqueue(-2);
        Assert.False(await s.SendKeysDownAsync([VirtualKey.B]));
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
        Assert.Contains("released everything", log.Text);
    }

    [Test]
    public async Task A_failed_release_falls_back_to_releasing_all()
    {
        var (s, k, _, _) = Make();
        await s.SendKeysDownAsync([VirtualKey.A, VirtualKey.C]);
        k.Script.Enqueue(0);
        k.Script.Enqueue(0); // the release of A and its retry are refused
        Assert.False(await s.SendKeysUpAsync([VirtualKey.A]));
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Holds_are_refused_for_elevated_apps_invalid_keys_and_after_dispose()
    {
        var (s, k, _, _) = Make();
        k.Elevated.Add(k.ForegroundWindow);
        Assert.False(await s.SendKeysDownAsync([VirtualKey.W]));
        k.Elevated.Clear();
        Assert.False(await s.SendKeysDownAsync([]));
        Assert.False(await s.SendKeysDownAsync([VirtualKey.W, VirtualKey.W]));
        s.Dispose();
        Assert.False(await s.SendKeysDownAsync([VirtualKey.W]));
        Assert.Empty(k.Batches);
        await Assert.ThrowsAsync<ArgumentNullException>(() => s.SendKeysUpAsync(null!));
    }

    [Test]
    public async Task Recording_fake_tracks_holds()
    {
        var log = new RecordingLog();
        var r = new RecordingInputSender(log, _ => false);
        Assert.True(await r.SendKeysDownAsync([VirtualKey.W], KeyMode.Scancode));
        Assert.Equal("W", string.Join(",", r.HeldKeys));
        Assert.Contains("[safe mode] would hold W (scancode)", log.Text);
        await r.ReleaseAllAsync();
        Assert.Empty(r.HeldKeys);
        Assert.Equal(InputRecordKind.KeysUp, r.Records[^1].Kind);
        Assert.Equal(KeyMode.Scancode, r.Records[0].Mode);
        Assert.True(await r.SendChordAsync([VirtualKey.Control, VirtualKey.Z], KeyMode.Scancode));
        Assert.Contains("would press Control+Z (scancode)", log.Text);
    }

    [Test]
    public async Task Interface_defaults_refuse_new_features_on_old_fakes()
    {
        IInputSender old = new OldFake();
        Assert.False(await old.SendKeysDownAsync([VirtualKey.A]));
        Assert.False(await old.SendKeysUpAsync([VirtualKey.A]));
        Assert.False(await old.SendChordAsync([VirtualKey.A], KeyMode.Scancode));
        Assert.True(await old.SendChordAsync([VirtualKey.A], KeyMode.VirtualKey), "VK mode falls back to the old method");
        Assert.Empty(old.HeldKeys);
        await old.ReleaseAllAsync();
    }

    private sealed class OldFake : IInputSender
    {
        public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => Task.FromResult(true);
        public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => Task.FromResult(true);
        public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Task.FromResult(true);
        public bool TargetIsElevated(nint hwnd) => false;
    }
}

public class ScancodeModeTests
{
    private static (SendInputSender S, FakeInjector K) Make() { var k = new FakeInjector(); return (new SendInputSender(k, new RecordingLog()), k); }

    [Test]
    public async Task Scancode_mode_sends_physical_positions_without_virtual_keys()
    {
        var (s, k) = Make();
        Assert.True(await s.SendChordAsync([VirtualKey.Control, VirtualKey.Z], KeyMode.Scancode));
        var b = k.Batches[0];
        Assert.True(b.All(e => e.Vk == 0 && (e.Flags & User32.KEYEVENTF_SCANCODE) != 0), "wVk = 0, KEYEVENTF_SCANCODE");
        Assert.Equal("1D 2C 2C 1D", string.Join(" ", b.Select(e => e.Scan.ToString("X2"))));
        Assert.Equal("False False True True", string.Join(" ", b.Select(e => e.IsUp)));
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Extended_keys_carry_the_extended_flag_in_scancode_mode()
    {
        var (s, k) = Make();
        Assert.True(await s.SendKeyAsync(VirtualKey.Up, KeyMode.Scancode));
        Assert.Equal((ushort)0x48, k.Batches[0][0].Scan);
        Assert.True((k.Batches[0][0].Flags & User32.KEYEVENTF_EXTENDEDKEY) != 0);
        Assert.True(await s.SendKeyAsync(VirtualKey.NumPad8, KeyMode.Scancode));
        Assert.Equal((ushort)0x48, k.Batches[1][0].Scan, "same position…");
        Assert.True((k.Batches[1][0].Flags & User32.KEYEVENTF_EXTENDEDKEY) == 0, "…but not extended: NumPad 8, not Up");
        Assert.True(await s.SendKeysDownAsync([VirtualKey.RightControl], KeyMode.Scancode));
        Assert.True((k.Batches[2][0].Flags & User32.KEYEVENTF_EXTENDEDKEY) != 0);
        Assert.True(await s.SendKeysUpAsync([VirtualKey.RightControl]));
        Assert.Equal(k.Batches[2][0].Scan, k.Batches[3][0].Scan, "released the same way it was pressed");
        Assert.True((k.Batches[3][0].Flags & (User32.KEYEVENTF_SCANCODE | User32.KEYEVENTF_EXTENDEDKEY | User32.KEYEVENTF_KEYUP)) == (User32.KEYEVENTF_SCANCODE | User32.KEYEVENTF_EXTENDEDKEY | User32.KEYEVENTF_KEYUP));
    }

    [Test]
    public async Task Keys_without_a_scan_code_are_refused()
    {
        var (s, k) = Make();
        Assert.False(await s.SendKeyAsync(VirtualKey.Pause, KeyMode.Scancode), "Pause is E1-prefixed");
        Assert.False(await s.SendKeysDownAsync([VirtualKey.W, VirtualKey.Pause], KeyMode.Scancode));
        Assert.Empty(k.Batches);
        Assert.True(await s.SendKeyAsync(VirtualKey.Pause), "VK mode still sends it");
    }

    [Test]
    public void The_US_table_covers_the_keyboard()
    {
        var missing = Enum.GetValues<VirtualKey>().Distinct()
            .Where(k => k is not (VirtualKey.None or VirtualKey.Pause or VirtualKey.Clear or VirtualKey.Select or VirtualKey.Print or VirtualKey.Execute or VirtualKey.Help or VirtualKey.Separator or VirtualKey.Oem8))
            .Where(k => !UsScanCodes.TryGet(k, out _)).ToList();
        Assert.Empty(missing);
        Assert.True(UsScanCodes.TryGet(VirtualKey.A, out var a) && a == 0x1E);
        Assert.True(UsScanCodes.TryGet(VirtualKey.F13, out var f13) && f13 == 0x64);
        Assert.True(UsScanCodes.TryGet(VirtualKey.LeftWindows, out var win) && win == 0xE05B);
        Assert.True(UsScanCodes.TryGet(VirtualKey.Shift, out var sh) && UsScanCodes.TryGet(VirtualKey.LeftShift, out var lsh) && sh == lsh);
    }
}
