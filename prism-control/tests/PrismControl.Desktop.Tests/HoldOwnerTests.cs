using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

/// <summary>
/// Review E16 (Smart fix): holds are counted per owner. A key two owners hold goes up only when the last one lets go;
/// the plain SendKeysDown/Up calls keep their exact behavior (one anonymous owner); the window-checked hold refuses when
/// another window is in front (lead decision 4).
/// </summary>
public class HoldOwnerTests
{
    private static (SendInputSender S, FakeInjector K) Make()
    {
        var k = new FakeInjector();
        return (new SendInputSender(k, new RecordingLog(), null, new ManualTimeProvider()), k);
    }

    private static string D(IEnumerable<KeyEvent> events) => string.Join(" ", events.Select(e => (e.IsUp ? "-" : "+") + e.Vk.ToString("X2")));

    [Test]
    public async Task A_key_two_owners_hold_goes_up_only_when_the_last_one_lets_go()
    {
        var (s, k) = Make();
        object slotA = new(), slotB = new();
        Assert.True(await s.HoldKeysAsync(slotA, 0, [VirtualKey.Shift]));
        Assert.True(await s.HoldKeysAsync(slotB, 0, [VirtualKey.Shift, VirtualKey.W]));
        Assert.Equal("+10", D(k.Batches[0]));
        Assert.Equal("+57", D(k.Batches[1]), "Shift is already down: only W goes down");
        Assert.True(await s.ReleaseKeysAsync(slotA, [VirtualKey.Shift]));
        Assert.Equal("Shift,W", string.Join(",", s.HeldKeys), "slot B still holds Shift: nothing went up");
        Assert.Equal(2, k.Batches.Count);
        Assert.True(await s.ReleaseKeysAsync(slotB, [VirtualKey.Shift, VirtualKey.W]));
        Assert.Equal("-57 -10", D(k.Batches[2]), "the last owner let go: newest first");
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task An_owner_release_never_drops_keys_it_does_not_hold_and_release_owner_drops_all_of_its_own()
    {
        var (s, k) = Make();
        object a = new(), b = new();
        await s.HoldKeysAsync(a, 0, [VirtualKey.Control]);
        await s.HoldKeysAsync(b, 0, [VirtualKey.A]);
        Assert.True(await s.ReleaseKeysAsync(a, [VirtualKey.A]), "a never held A");
        Assert.Equal("Control,A", string.Join(",", s.HeldKeys));
        await s.ReleaseOwnerAsync(b);
        Assert.Equal("Control", string.Join(",", s.HeldKeys));
        await s.ReleaseOwnerAsync(a);
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task The_plain_calls_are_one_anonymous_owner_and_never_drop_an_owned_hold()
    {
        var (s, k) = Make();
        object slot = new();
        await s.HoldKeysAsync(slot, 0, [VirtualKey.Shift]);
        // Sight's scancode step: down Shift+A, up Shift+A (the anonymous owner). The slot's Shift must stay down.
        Assert.True(await s.SendKeysDownAsync([VirtualKey.Shift, VirtualKey.A]));
        Assert.True(await s.SendKeysUpAsync([VirtualKey.Shift, VirtualKey.A]));
        Assert.Equal("Shift", string.Join(",", s.HeldKeys));
        Assert.Equal("-41", D(k.Batches[^1]));
        // Without other owners the plain calls behave exactly as before.
        await s.ReleaseOwnerAsync(slot);
        Assert.True(await s.SendKeysDownAsync([VirtualKey.Shift, VirtualKey.W]));
        Assert.True(await s.SendKeysUpAsync([VirtualKey.Shift]));
        Assert.Equal("W", string.Join(",", s.HeldKeys));
        await s.ReleaseAllAsync();
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task A_window_checked_hold_refuses_when_another_window_is_in_front_or_it_is_elevated()
    {
        var (s, k) = Make();
        k.ForegroundWindow = 0x2000;
        Assert.False(await s.HoldKeysAsync(new object(), 0x1000, [VirtualKey.W]), "WINDOW CHANGED: nothing goes down");
        Assert.Empty(k.Batches);
        k.ForegroundWindow = 0x1000;
        Assert.True(await s.HoldKeysAsync(new object(), 0x1000, [VirtualKey.W]));
        k.Elevated.Add(0x1000);
        Assert.False(await s.HoldKeysAsync(new object(), 0x1000, [VirtualKey.A]), "an elevated window never gets input");
        await s.ReleaseAllAsync();
        Assert.Empty(s.HeldKeys);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task The_recording_sender_counts_owners_and_checks_the_window_the_same_way()
    {
        nint front = 0x1000;
        var r = new RecordingInputSender(null, _ => false, () => front);
        object a = new(), b = new();
        await r.HoldKeysAsync(a, 0x1000, [VirtualKey.Shift]);
        await r.HoldKeysAsync(b, 0x1000, [VirtualKey.Shift, VirtualKey.Z]);
        await r.ReleaseKeysAsync(a, [VirtualKey.Shift]);
        Assert.Equal("Shift,Z", string.Join(",", r.HeldKeys));
        front = 0x2000;
        Assert.False(await r.HoldKeysAsync(a, 0x1000, [VirtualKey.Q]), "another window is in front");
        Assert.True(await r.ReleaseKeysAsync(b, [VirtualKey.Shift, VirtualKey.Z]), "releasing is never window-checked");
        Assert.Empty(r.HeldKeys);
    }
}
