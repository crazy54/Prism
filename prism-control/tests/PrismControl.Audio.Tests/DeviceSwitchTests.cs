using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class DeviceSwitchTests
{
    private static DeviceView V<T>(ActionHarness<T> h) where T : DeviceSwitchAction, new() => (DeviceView)h.Action.LastView!;

    [Test]
    public async Task Key_cycles_through_the_chosen_devices_and_wraps()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new DeviceSwitchSettings { Devices = [Speakers, Headset, MixerChat] }, H.With(f));
        Assert.Equal("Example USB Audio", V(h).Title);
        Assert.Equal(3, V(h).Count);
        await h.PressAsync();
        Assert.Equal($"default {Headset} All", f.Writes.Last());
        Assert.Equal("The Example Ensemble Headset", V(h).Title);
        Assert.Equal(1, V(h).Index);
        await h.PressAsync();
        Assert.Equal($"default {MixerChat} All", f.Writes.Last());
        await h.PressAsync();
        Assert.Equal($"default {Speakers} All", f.Writes.Last());
        Assert.Equal(3, h.Count("showOk"));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task With_no_devices_chosen_the_key_cycles_every_output()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        // Sorted by title: Example USB Audio (default), Example Voice Filter, Mixer - Chat, The Example Ensemble Headset.
        await h.PressAsync();
        Assert.Equal($"default {FixedOut} All", f.Writes.Last());
        await h.PressAsync();
        Assert.Equal($"default {MixerChat} All", f.Writes.Last());
        Assert.Equal(0, V(h).Count, "no position dots for the all-devices cycle");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Set_mode_sets_the_first_device_and_lights_while_it_is_the_default()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Keypad,
            new DeviceSwitchSettings { Mode = "set", Devices = [Headset] }, H.With(f));
        Assert.False(V(h).Lit);
        await h.PressAsync();
        Assert.Equal($"default {Headset} All", f.Writes.Last());
        Assert.True(V(h).Lit);
        await h.PressAsync(); // already the default: no write, just OK
        Assert.Single(f.Writes);
        f.ExternalDefault(AudioFlow.Render, Speakers);
        await h.SettleAsync();
        Assert.False(V(h).Lit, "follows a default change made elsewhere");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Roles_can_be_default_only_or_communications_only()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new DeviceSwitchSettings { Mode = "set", Devices = [Headset], Roles = "default" }, H.With(f));
        await h.PressAsync();
        Assert.Equal($"default {Headset} Default", f.Writes.Last());
        await h.SettingsFromPropertyInspectorAsync(new DeviceSwitchSettings { Mode = "set", Devices = [MixerChat], Roles = "communications" });
        await h.PressAsync();
        Assert.Equal($"default {MixerChat} Communications", f.Writes.Last());
        Assert.True(V(h).Lit, "the communications default is what this key shows");
    }

    [Test]
    public async Task Galleon_dial_browses_all_outputs_and_push_sets_the_default()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.True(V(h).IsDefault);
        Assert.Equal(4, V(h).Count);
        await h.RotateAsync(2);
        Assert.Equal("Example Voice Filter", V(h).Title);
        Assert.Equal("PUSH TO SET", V(h).Hint);
        Assert.Empty(f.Writes);
        await h.DialPressAsync();
        Assert.Equal($"default {FixedOut} All", f.Writes.Last());
        Assert.True(V(h).IsDefault);
        await h.RotateAsync(12); // a fast spin moves 3 entries
        Assert.Equal(3, V(h).Index);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task The_dial_cursor_returns_to_the_default_after_a_pause()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(2, V(h).Index);
        await h.AdvanceAsync(TimeSpan.FromSeconds(7));
        Assert.Equal(0, V(h).Index);
        Assert.True(V(h).IsDefault);
    }

    [Test]
    public async Task Plus_touch_sets_the_browsed_device()
    {
        var f = Standard();
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(1);
        await h.TapAsync(100, 50);
        Assert.Equal($"default {FixedOut} All", f.Writes.Last());
    }

    [Test]
    public async Task The_input_switcher_works_on_capture_devices()
    {
        var f = Standard();
        await using var h = await ActionHarness<InputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 1), Controller.Keypad, configureServices: H.With(f));
        Assert.False(V(h).IsOutput);
        await h.PressAsync();
        Assert.Equal($"default {MixerMic} All", f.Writes.Last());
        Assert.Equal("Mixer - Microphone", V(h).Title);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Unavailable_switching_alerts_and_never_writes()
    {
        var f = Standard();
        f.CanSetDefault = false;
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal("UNAVAILABLE", V(h).Hint is null ? "UNAVAILABLE" : V(h).Hint); // default device shown: no hint needed
        await h.RotateAsync(1);
        Assert.Equal("UNAVAILABLE", V(h).Hint);
        await h.DialPressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Empty(f.Writes);
    }

    [Test]
    public async Task A_chosen_device_that_is_unplugged_is_skipped_and_kept_in_the_picker()
    {
        var f = Standard();
        const string gone = "{0.0.0.00000000}.{example-out-unplugged}";
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new DeviceSwitchSettings { Devices = [Speakers, gone, Headset] }, H.With(f));
        await h.PressAsync();
        Assert.Equal($"default {Headset} All", f.Writes.Last());
        var reply = await h.PiMessageAsync("audio.switch.devices", null, requestId: 1);
        var labels = reply!["data"]!.AsArray().Select(o => o!["label"]!.GetValue<string>()).ToList();
        Assert.True(labels.Any(l => l.StartsWith("(not connected)", StringComparison.Ordinal)), string.Join(" | ", labels));
        Assert.True(labels.Contains("Headphones (The Example Ensemble Headset)"));
    }

    [Test]
    public async Task Wave_1_device_pickers_migrate_into_the_ordered_device_list()
    {
        var f = Standard();
        var legacy = new System.Text.Json.Nodes.JsonObject { ["mode"] = "cycle", ["device1"] = Headset, ["device3"] = MixerChat, ["roles"] = "all" };
        await using var h = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, legacy, H.With(f));
        var saved = h.LastSettings!;
        Assert.Equal($"{Headset}|{MixerChat}", string.Join("|", saved["devices"]!.AsArray().Select(d => d!.GetValue<string>())), "kept, in order");
        Assert.Null(saved["device1"], "the old keys are gone from the saved settings");
        Assert.Null(saved["device3"]);
        Assert.Equal(2, V(h).Count);
        await h.PressAsync();
        Assert.Equal($"default {Headset} All", f.Writes.Last());
        await h.PressAsync();
        Assert.Equal($"default {MixerChat} All", f.Writes.Last());
        Assert.Equal(1, h.Count("setSettings"), "migrated once");
    }

    [Test]
    public async Task The_device_list_is_an_ordered_checklist_in_the_property_inspector()
    {
        var f = Standard();
        await using var h = await ActionHarness<InputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f));
        var hello = await h.PiMessageAsync("pi.ready");
        var fields = hello!["data"]!["form"]!["fields"]!.AsArray();
        var devices = fields.Single(x => x!["setting"]?.GetValue<string>() == "devices")!;
        Assert.Equal("multiselect", devices["kind"]!.GetValue<string>());
        Assert.True(devices["ordered"]!.GetValue<bool>());
        Assert.Equal(8, devices["max"]!.GetValue<int>());
        Assert.Equal("audio.switch.devices", devices["optionsFrom"]!.GetValue<string>());
        Assert.False(fields.Any(x => x!["setting"]?.GetValue<string>() is "device1" or "device2" or "device3" or "device4"));
        var reply = await h.PiMessageAsync("audio.switch.devices", null, requestId: 3);
        var values = reply!["data"]!.AsArray().Select(o => o!["value"]!.GetValue<string>()).ToList();
        Assert.Equal($"{UsbMic}|{MixerMic}", string.Join("|", values), "the inputs, with no '(none)' entry");
    }
}
