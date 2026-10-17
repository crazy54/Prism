using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class MicTests
{
    private static MicView V(ActionHarness<MicMuteAction> h) => (MicView)h.Action.LastView!;

    [Test]
    public async Task Key_toggles_the_default_communications_mic_and_turns_red()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 1), Controller.Keypad, configureServices: H.With(f));
        Assert.Equal("LIVE", V(h).Value);
        Assert.DoesNotContain(Refraction.Night.Neg.Hex, h.LastSvg);
        await h.PressAsync();
        Assert.Equal($"mute {UsbMic} True", f.Writes.Last());
        Assert.Equal("MUTED", V(h).Value);
        Assert.Contains(Refraction.Night.Neg.Hex, h.LastSvg, "muted = the whole key in the negative color");
        await h.PressAsync();
        Assert.Equal($"mute {UsbMic} False", f.Writes.Last());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Day_theme_muted_key_uses_the_day_negative()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(1, 2), Controller.Keypad, configureServices: H.With(f),
            globalSettings: new System.Text.Json.Nodes.JsonObject { ["core"] = new System.Text.Json.Nodes.JsonObject { ["theme"] = "day" } });
        Assert.Contains(Refraction.Day.Neg.Hex, h.LastSvg);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_mute_made_elsewhere_shows_live()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        f.External(UsbMic, muted: true); // headset button, Wave Link, Windows settings
        await h.SettleAsync();
        Assert.True(V(h).Muted);
        f.External(UsbMic, muted: false);
        await h.SettleAsync();
        Assert.False(V(h).Muted);
        Assert.Empty(f.Writes);
    }

    [Test]
    public async Task Hold_to_talk_unmutes_only_while_held()
    {
        var f = Standard();
        f.External(UsbMic, muted: true);
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new MicSettings { Mode = "ptt" }, H.With(f));
        await h.KeyDownAsync();
        Assert.False(V(h).Muted);
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        await h.KeyUpAsync();
        Assert.True(V(h).Muted);
        Assert.Equal($"mute {UsbMic} False|mute {UsbMic} True", string.Join("|", f.Writes));
    }

    [Test]
    public async Task Hold_to_mute_mutes_only_while_held()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new MicSettings { Mode = "ptm" }, H.With(f));
        await h.KeyDownAsync();
        Assert.True(V(h).Muted);
        await h.KeyUpAsync();
        Assert.False(V(h).Muted);
    }

    [Test]
    public async Task Galleon_dial_push_mutes_and_turn_sets_the_mic_level()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder,
            new MicSettings { Step = 1 }, H.With(f));
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        await h.RotateAsync(-12);
        Assert.Equal($"volume {UsbMic} 0.68", f.Writes.Last());
        await h.DialPressAsync();
        Assert.True(V(h).Muted);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_dial_touch_toggles_mute()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder, configureServices: H.With(f));
        await h.TapAsync(20, 20);
        Assert.True(V(h).Muted);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Follows_the_default_input_like_v1_mic_by_default()
    {
        // One story with /v1/mic (api.md): the key mutes the console default input, not the communications one.
        var f = Standard();
        f.ExternalDefault(AudioFlow.Capture, MixerMic, AudioRole.Communications);
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        Assert.Equal("Example USB Audio", V(h).Device);
        await h.PressAsync();
        Assert.Equal($"mute {UsbMic} True", f.Writes.Last());
        f.ExternalDefault(AudioFlow.Capture, MixerMic, AudioRole.Console);
        await h.SettleAsync();
        Assert.Equal("Mixer - Microphone", V(h).Device, "follows the default input when it moves");
    }

    [Test]
    public async Task The_communications_role_option_follows_the_communications_input()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new MicSettings { DeviceId = DeviceRef.CommsInput }, H.With(f));
        f.ExternalDefault(AudioFlow.Capture, MixerMic, AudioRole.Communications);
        await h.SettleAsync();
        Assert.Equal("Mixer - Microphone", V(h).Device);
        await h.PressAsync();
        Assert.Equal($"mute {MixerMic} True", f.Writes.Last());
        var reply = await h.PiMessageAsync("audio.inputs", null, requestId: 1);
        var options = reply!["data"]!.AsArray().Select(o => (o!["value"]!.GetValue<string>(), o["label"]!.GetValue<string>())).ToList();
        Assert.Equal(("", "Default input"), options[0]);
        Assert.Equal((DeviceRef.CommsInput, "Default communications input"), options[1]);
        Assert.False(options.Any(o => o.Item1 == DeviceRef.DefaultInput), "the empty choice already is the default input");
    }

    [Test]
    public async Task Audio_unavailable_shows_no_audio_rather_than_no_mic()
    {
        var f = Standard();
        f.IsAvailable = false;
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        Assert.Equal("NO AUDIO", V(h).Value);
        await using var d = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal("NO AUDIO", ((MicView)d.Action.LastView!).Value);
        f.IsAvailable = true;
        f.Raise(new AudioChange(AudioChangeKind.Availability));
        await h.SettleAsync();
        Assert.Equal("LIVE", V(h).Value, "back as soon as audio is");
        h.AssertFramesAreDeckSafe();
        d.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task The_meter_runs_only_while_the_mic_is_open()
    {
        var f = Standard();
        f.SetMeter(UsbMic, 0.5f, 0.5f);
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new MicSettings { ShowMeter = true }, H.With(f));
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(300));
        Assert.Equal(1, f.OpenMeters);
        Assert.True(V(h).Level > 0.5, "a level shows while live");
        await h.PressAsync(); // mute
        Assert.Equal(0, f.OpenMeters);
        Assert.Null(V(h).Level);
        await h.PressAsync(); // unmute
        Assert.Equal(1, f.OpenMeters);
        await h.DisappearAsync();
        Assert.Equal(0, f.OpenMeters);
    }

    [Test]
    public async Task A_silent_meter_drops_to_background_priority()
    {
        var f = Standard();
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad,
            new MicSettings { ShowMeter = true }, H.With(f));
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(UpdatePriority.Background, h.CallsOf("setImage").Last().Priority);
        var before = h.Count("setImage");
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.InRange(h.Count("setImage") - before, 2, 4); // about 1 Hz in silence
        f.SetMeter(UsbMic, 0.6f, 0.6f);
        await h.AdvanceAsync(TimeSpan.FromSeconds(1.2));
        Assert.Equal(UpdatePriority.Normal, h.CallsOf("setImage").Last().Priority);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task No_mic_shows_an_alert_and_a_safe_frame()
    {
        var f = Standard();
        f.RemoveDevice(UsbMic);
        f.RemoveDevice(MixerMic);
        await using var h = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        await h.PressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.True(V(h).Unavailable);
        h.AssertFramesAreDeckSafe();
    }
}
