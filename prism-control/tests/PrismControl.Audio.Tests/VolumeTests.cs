using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

internal static class H
{
    public static Action<ServiceRegistry> With(IAudioEngine engine) => s => s.Add<IAudioEngine>(engine);
}

public class VolumeTests
{
    private static VolumeView V(ActionHarness<VolumeAction> h) => (VolumeView)h.Action.LastView!;

    [Test]
    public async Task Galleon_spin_moves_the_volume_by_ticks_times_step()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder,
            new VolumeSettings { Step = 2 }, H.With(f));
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        Assert.Equal("42%", V(h).Value);
        await h.RotateAsync(12); // one aggregated Galleon spin
        Assert.Equal($"volume {Speakers} 0.66", f.Writes.Last());
        Assert.Equal(66, V(h).Pct);
        await h.RotateAsync(-3);
        Assert.Equal(60, V(h).Pct);
        Assert.Equal("Example USB Audio", V(h).Label);
        Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_ticks_move_one_step_and_clamp_at_100()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder,
            new VolumeSettings { Step = 5 }, H.With(f));
        await h.RotateAsync(1);
        Assert.Equal(47, V(h).Pct);
        for (var i = 0; i < 20; i++) await h.RotateAsync(1);
        Assert.Equal(100, V(h).Pct);
        Assert.Equal($"volume {Speakers} 1.00", f.Writes.Last());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Dial_push_mutes_and_an_external_unmute_shows_live()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder, configureServices: H.With(f));
        await h.DialPressAsync(TimeSpan.FromSeconds(5)); // a Galleon "hold" is still a press for us
        Assert.Equal($"mute {Speakers} True", f.Writes.Last());
        Assert.Equal("MUTED", V(h).Value);
        var frames = h.Count("setFeedback");
        f.External(Speakers, muted: false); // e.g. the Windows volume flyout
        await h.SettleAsync();
        Assert.False(V(h).Muted);
        Assert.True(h.Count("setFeedback") > frames, "an external change re-renders");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Turning_up_unmutes_like_the_windows_volume_keys()
    {
        var f = Standard();
        f.External(Speakers, muted: true);
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(-1);
        Assert.True(V(h).Muted, "turning down keeps the mute");
        await h.RotateAsync(1);
        Assert.Contains($"mute {Speakers} False", string.Join("\n", f.Writes));
        Assert.False(V(h).Muted);
    }

    [Test]
    public async Task Key_press_mutes_and_can_step_instead()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(1, 1), Controller.Keypad, configureServices: H.With(f));
        await h.PressAsync();
        Assert.True(V(h).Muted);
        Assert.Contains(Refraction.Night.Neg.Hex, h.LastSvg, "the muted key uses the negative color");
        await h.SettingsFromPropertyInspectorAsync(new VolumeSettings { KeyPress = "up", Step = 4 });
        await h.PressAsync();
        Assert.Equal($"volume {Speakers} 0.46", f.Writes.Last());
        await h.SettingsFromPropertyInspectorAsync(new VolumeSettings { KeyPress = "down", Step = 4 });
        await h.PressAsync();
        Assert.Equal($"volume {Speakers} 0.42", f.Writes.Last());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Key_on_galleon_renders_level_and_mute_state()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(2, 3), Controller.Keypad, configureServices: H.With(f));
        Assert.Equal("42%", V(h).Value);
        f.External(Speakers, volume: 0.9f);
        await h.SettleAsync();
        Assert.Equal("90%", V(h).Value);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Touch_tap_mutes_on_plus()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(3, 0), Controller.Encoder, configureServices: H.With(f));
        await h.TapAsync(150, 50);
        Assert.True(V(h).Muted);
    }

    [Test]
    public async Task Follows_the_default_output_when_no_device_is_chosen()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        f.ExternalDefault(AudioFlow.Render, Headset);
        await h.SettleAsync();
        Assert.Equal("The Example Ensemble Headset", V(h).Label);
        await h.RotateAsync(-1);
        Assert.Equal($"volume {Headset} 0.98", f.Writes.Last());
    }

    [Test]
    public async Task A_chosen_device_stays_put_and_input_devices_work_too()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            new VolumeSettings { DeviceId = MixerChat }, H.With(f));
        f.ExternalDefault(AudioFlow.Render, Headset);
        await h.SettleAsync();
        await h.RotateAsync(1);
        Assert.Equal($"volume {MixerChat} 0.69", f.Writes.Last());
        await h.SettingsFromPropertyInspectorAsync(new VolumeSettings { DeviceId = DeviceRef.DefaultInput });
        Assert.Equal(LevelKind.Input, V(h).Kind);
        await h.RotateAsync(-2);
        Assert.Equal($"volume {UsbMic} 0.76", f.Writes.Last());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_fixed_volume_device_is_never_written()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder,
            new VolumeSettings { DeviceId = FixedOut }, H.With(f));
        await h.RotateAsync(1);
        Assert.Empty(f.Writes);
        Assert.Equal("FIXED", V(h).Value);
    }

    [Test]
    public async Task Without_the_engine_it_says_no_audio_and_stays_deck_safe()
    {
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder);
        await h.RotateAsync(5);
        await h.DialPressAsync();
        Assert.True(V(h).Unavailable);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_failed_write_shows_the_alert()
    {
        var f = Standard();
        f.FailWrites = true;
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(1);
        Assert.Equal(1, h.Count("showAlert"));
    }

    [Test]
    public async Task The_device_picker_lists_defaults_and_every_endpoint()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        var reply = await h.PiMessageAsync("audio.endpoints", null, requestId: 7);
        Assert.NotNull(reply);
        Assert.Equal("pi.response", reply!["type"]!.GetValue<string>());
        var options = reply["data"]!.AsArray();
        Assert.Equal("", options[0]!["value"]!.GetValue<string>());
        var values = options.Select(o => o!["value"]!.GetValue<string>()).ToList();
        Assert.True(values.Contains(DeviceRef.DefaultInput) && values.Contains(MixerChat) && values.Contains(UsbMic), string.Join(", ", values));
        Assert.Contains("· default", options.First(o => o!["value"]!.GetValue<string>() == Speakers)!["label"]!.GetValue<string>());
    }

    [Test]
    public async Task Galleon_hold_does_not_need_long_press_and_settles_back_to_idle_art()
    {
        var f = Standard();
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.AdvanceAsync(TimeSpan.FromSeconds(1)); // the manual clock starts at timestamp 0, which reads as "no input yet"
        await h.RotateAsync(2);
        var active = h.FeedbackSvg(Layouts.Canvas.Frame);
        Assert.Equal(AudioArt.VolumeDial(Refraction.Night, V(h), active: true).ToSvg(), active);
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        var idle = h.FeedbackSvg(Layouts.Canvas.Frame);
        Assert.NotEqual(active, idle);
        Assert.Equal(AudioArt.VolumeDial(Refraction.Night, V(h), active: false).ToSvg(), idle);
    }
}
