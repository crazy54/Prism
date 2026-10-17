using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class LevelMeterTests
{
    private static MeterView V(ActionHarness<LevelMeterAction> h) => (MeterView)h.Action.LastView!;

    [Test]
    public async Task Meters_only_while_visible_and_releases_the_lease()
    {
        var f = Standard();
        f.SetMeter(Speakers, 0.5f, 0.5f, 0.25f);
        var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(300));
        Assert.Equal(1, f.OpenMeters);
        Assert.Equal(2, V(h).Levels.Length);
        Assert.Near(AudioArt.MeterPosition(0.5), V(h).Levels[0], 0.001);
        Assert.True(V(h).Levels[1] < V(h).Levels[0]);
        Assert.Equal("−6 dB", V(h).DbText);
        h.AssertFramesAreDeckSafe();
        await h.DisappearAsync();
        Assert.Equal(0, f.OpenMeters);
        var frames = h.Count("setImage");
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(frames, h.Count("setImage"));
    }

    [Test]
    public async Task With_signal_it_renders_at_10_hz_normal_priority()
    {
        var f = Standard();
        f.SetMeter(Speakers, 0.4f, 0.4f, 0.4f);
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Galleon, new(1, 2), Controller.Keypad, configureServices: H.With(f));
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
        var before = h.Count("setImage");
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.InRange(h.Count("setImage") - before, 9, 11);
        Assert.Equal(UpdatePriority.Normal, h.CallsOf("setImage").Last().Priority);
    }

    [Test]
    public async Task Silence_drops_to_1_hz_background()
    {
        var f = Standard();
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Plus, new(1, 1), Controller.Keypad, configureServices: H.With(f));
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(LevelMeterAction.IdleInterval, h.Action.Loop!.IdleInterval);
        Assert.Equal(UpdatePriority.Background, h.CallsOf("setImage").Last().Priority);
        var before = h.Count("setImage");
        await h.AdvanceAsync(TimeSpan.FromSeconds(4));
        Assert.InRange(h.Count("setImage") - before, 3, 5);
        Assert.Equal("– dB", V(h).DbText);
    }

    [Test]
    public async Task Galleon_dial_turn_picks_the_source_and_push_resets_the_hold()
    {
        var f = Standard();
        f.SetMeter(UsbMic, 0.3f, 0.3f);
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder, configureServices: H.With(f));
        Assert.True(V(h).IsOutput);
        await h.RotateAsync(1);
        Assert.Equal(DeviceRef.DefaultInput, h.LastSettingsAs<LevelMeterSettings>().Source);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
        Assert.False(V(h).IsOutput);
        Assert.True(f.MeteredDevices.Contains(UsbMic));
        Assert.Equal(1, f.OpenMeters);
        await h.RotateAsync(1); // then each endpoint by id
        Assert.Equal(Speakers, h.LastSettingsAs<LevelMeterSettings>().Source);
        await h.DialPressAsync();
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Key_press_swaps_default_output_and_input()
    {
        var f = Standard();
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        await h.PressAsync();
        Assert.Equal(DeviceRef.DefaultInput, h.LastSettingsAs<LevelMeterSettings>().Source);
        await h.PressAsync();
        Assert.Equal("", h.LastSettingsAs<LevelMeterSettings>().Source);
    }

    [Test]
    public async Task Follows_the_default_output_when_it_changes()
    {
        var f = Standard();
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        f.ExternalDefault(AudioFlow.Render, Headset);
        await h.SettleAsync();
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        Assert.Equal(Headset, f.MeteredDevices.Last());
        Assert.Equal(1, f.OpenMeters);
        Assert.Equal("The Example Ensemble Headset", V(h).Device);
        h.AssertFramesAreDeckSafe();
    }
}
