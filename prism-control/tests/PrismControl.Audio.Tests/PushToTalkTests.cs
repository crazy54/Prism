using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

/// <summary>
/// Review A #3 (privacy): a held hold-to-talk key unmutes the mic and only its keyUp muted it again, so a key that went
/// away while held left the mic live. Every way a held key can go away now puts the mic back.
/// </summary>
public class PushToTalkTests
{
    private static MicView V(ActionHarness<MicMuteAction> h) => (MicView)h.Action.LastView!;
    private static bool Muted(FakeAudioEngine f, string id) => f.GetDevice(id)!.Muted;

    private static Task<ActionHarness<MicMuteAction>> PttAsync(FakeAudioEngine f, string mode = "ptt", Action<PrismControl.Core.Hosting.ServiceRegistry>? services = null,
        DeviceInfo? deck = null, string? mic = null, string context = "ctx-test") =>
        ActionHarness<MicMuteAction>.AppearAsync(deck ?? TestDevices.Plus, new(0, 0), Controller.Keypad,
            new MicSettings { Mode = mode, DeviceId = mic }, services ?? H.With(f), context: context);

    [Test]
    public async Task Hold_to_talk_mutes_again_when_the_key_disappears_while_held()
    {
        // The reviewer's repro: hold, then a page or profile switch sends willDisappear; keyUp never comes.
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        var h = await PttAsync(f, services: rig.Services);
        await h.KeyDownAsync();
        Assert.False(Muted(f, UsbMic), "live while held");
        await h.DisappearAsync();
        Assert.True(Muted(f, UsbMic), "muted again when the key went away");
        Assert.Equal($"mute {UsbMic} False|mute {UsbMic} True", string.Join("|", f.Writes));
        Assert.True(rig.Context.Lines.Lines.Any(l => l.Contains("disappeared while held", StringComparison.Ordinal)), "restored by willDisappear itself (not only by the dispose after it)");
    }

    [Test]
    public async Task Hold_to_mute_stays_muted_when_the_key_disappears_while_held()
    {
        // The owner's choice (2026-10-17): an abandoned hold never puts a mic live unexpectedly.
        var f = Standard();
        await using var rig = ModuleRig.Start(f);
        var h = await PttAsync(f, "ptm", rig.Services);
        await h.KeyDownAsync();
        Assert.True(Muted(f, UsbMic));
        await h.DisappearAsync();
        Assert.True(Muted(f, UsbMic), "an abandoned hold-to-mute stays muted");
        Assert.True(rig.Context.Lines.Lines.All(l => !l.Contains("Mic unmuted again", StringComparison.Ordinal)));
    }

    [Test]
    public async Task Hold_to_mute_goes_live_again_on_a_real_release()
    {
        var f = Standard();
        await using var rig = ModuleRig.Start(f);
        await using var h = await PttAsync(f, "ptm", rig.Services);
        await h.KeyDownAsync();
        Assert.True(Muted(f, UsbMic));
        await h.KeyUpAsync();
        Assert.False(Muted(f, UsbMic), "a real keyUp returns hold-to-mute to its resting state (live)");
    }

    [Test]
    public async Task A_deck_disconnect_or_shutdown_leaves_a_held_hold_to_mute_muted()
    {
        var f = Standard();
        var guard = new MicHoldGuard(f, PrismControl.Core.Hosting.NullLog.Instance);
        var hold = guard.Hold("ctx-1", "deck-1", UsbMic, restingMuted: false);   // hold-to-mute: live at rest
        await f.SetMuteAsync(UsbMic, true);
        await guard.ReleaseDeckAsync("deck-1", "lost its Stream Deck while held");
        Assert.True(Muted(f, UsbMic), "deck disconnect = abandoned");

        var hold2 = guard.Hold("ctx-2", "deck-1", UsbMic, restingMuted: false);
        await guard.ReleaseAllAsync("was held while the plugin shut down");
        Assert.True(Muted(f, UsbMic), "shutdown = abandoned");
        _ = hold; _ = hold2;
        guard.Dispose();
    }

    [Test]
    public async Task A_held_key_that_is_disposed_without_willDisappear_mutes_the_mic()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        await using var h = await PttAsync(f, services: rig.Services);
        await h.KeyDownAsync();
        ((IDisposable)h.Action).Dispose(); // e.g. the host tearing instances down
        Assert.True(Muted(f, UsbMic));
        Assert.True(rig.Context.Lines.Lines.Any(l => l.Contains("was removed while held", StringComparison.Ordinal)));
    }

    [Test]
    public async Task The_release_restores_the_mic_from_key_down_even_after_a_settings_change()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var h = await PttAsync(f);
        await h.KeyDownAsync();
        // While held, the PI switches the key to hold-to-mute and to another mic.
        await h.SettingsFromPropertyInspectorAsync(new MicSettings { Mode = "ptm", DeviceId = MixerMic });
        await h.KeyUpAsync();
        Assert.True(Muted(f, UsbMic), "the mic that went live is the one muted again");
        Assert.False(Muted(f, MixerMic), "the other mic is untouched");
        Assert.Null(h.Action.Hold);
    }

    [Test]
    public async Task A_stream_deck_disconnect_mutes_the_keys_held_on_that_deck_only()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        f.External(MixerMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        await using var plus = await PttAsync(f, services: rig.Services, deck: TestDevices.Plus, mic: UsbMic, context: "ctx-plus");
        await using var galleon = await PttAsync(f, services: rig.Services, deck: TestDevices.Galleon, mic: MixerMic, context: "ctx-galleon");
        await plus.KeyDownAsync();
        await galleon.KeyDownAsync();
        Assert.Equal(2, rig.Module.Holds!.HeldCount);

        rig.Events.RaiseDeviceDisconnected(TestDevices.Plus.Id); // the Plus is unplugged with the key down
        await plus.SettleAsync();
        Assert.True(Muted(f, UsbMic), "the Plus key's mic is muted");
        Assert.False(Muted(f, MixerMic), "the Galleon key is still held");
        Assert.Equal(1, rig.Module.Holds.HeldCount);

        var writes = f.Writes.Count;
        await plus.KeyUpAsync(); // a late keyUp after reconnecting changes nothing more
        Assert.Equal(writes, f.Writes.Count);
    }

    [Test]
    public async Task Waking_from_sleep_mutes_a_key_that_was_held()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        await using var h = await PttAsync(f, services: rig.Services);
        await h.KeyDownAsync();
        rig.Events.RaiseSystemWokeUp();
        await h.SettleAsync();
        Assert.True(Muted(f, UsbMic));
    }

    [Test]
    public async Task Plugin_shutdown_mutes_a_held_key_before_the_engine_goes()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        var rig = ModuleRig.Start(f);
        await using var h = await PttAsync(f, services: rig.Services);
        await h.KeyDownAsync();
        Assert.False(Muted(f, UsbMic));
        await rig.ShutDownAsync();
        Assert.True(Muted(f, UsbMic), "muted during module shutdown");
        Assert.Equal(0, rig.Events.Listeners, "the module unsubscribed from host events");
        Assert.True(rig.Context.Lines.Lines.Any(l => l.Contains("plugin shut down", StringComparison.Ordinal)), "the restore is logged");
    }

    [Test]
    public async Task A_release_while_audio_is_unavailable_is_applied_when_audio_returns()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        await using var h = await PttAsync(f, services: rig.Services);
        await h.KeyDownAsync();
        f.IsAvailable = false; // the audio service restarts while the key is held
        f.Raise(new AudioChange(AudioChangeKind.Availability));
        await h.KeyUpAsync();
        Assert.False(Muted(f, UsbMic), "nothing could be written yet");
        Assert.Equal(1, h.Count("showAlert"), "the key says the release did not take");
        Assert.Equal(1, rig.Module.Holds!.PendingCount);
        f.IsAvailable = true;
        f.Raise(new AudioChange(AudioChangeKind.Availability));
        await h.SettleAsync();
        Assert.True(Muted(f, UsbMic), "muted as soon as audio is back");
        Assert.Equal(0, rig.Module.Holds.PendingCount);
    }

    [Test]
    public async Task A_mic_unplugged_while_held_is_muted_when_it_comes_back()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var h = await PttAsync(f, mic: UsbMic);
        await h.KeyDownAsync();
        var live = f.GetDevice(UsbMic)!;
        f.RemoveDevice(UsbMic);
        await h.KeyUpAsync();
        f.AddDevice(live); // plugged back in, still live (Windows keeps an endpoint's mute)
        f.Raise(new AudioChange(AudioChangeKind.Devices));
        await h.SettleAsync();
        Assert.True(Muted(f, UsbMic));
    }

    [Test]
    public async Task Two_keys_holding_the_same_mic_keep_it_live_until_the_last_one_lets_go()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var rig = ModuleRig.Start(f);
        await using var a = await PttAsync(f, services: rig.Services, deck: TestDevices.Plus, context: "ctx-a");
        await using var b = await PttAsync(f, services: rig.Services, deck: TestDevices.Galleon, context: "ctx-b");
        await a.KeyDownAsync();
        await b.KeyDownAsync();
        await a.KeyUpAsync();
        Assert.False(Muted(f, UsbMic), "still held on the other key");
        await b.DisappearAsync();
        Assert.True(Muted(f, UsbMic), "muted once nothing holds it");
    }

    [Test]
    public async Task Toggle_mode_keys_are_never_tracked()
    {
        var f = Standard();
        await using var h = await PttAsync(f, "toggle");
        await h.KeyDownAsync();
        Assert.Null(h.Action.Hold);
        await h.DisappearAsync();
        Assert.Empty(f.Writes);
    }
}
