using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Eq.Sonar;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>Every action on Galleon and Stream Deck + placements, against the fake Sonar (no real EQ is touched).</summary>
public class BandDialTests
{
    [Test]
    public async Task Galleon_spin_changes_gain_coalesced_and_push_resets_to_the_preset_value()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game", Band = "2", Step = 0.5 }, configureServices: s => s.Add(rig.Service));
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        Assert.Null(h.Action.Problem);
        Assert.Equal(6.0, h.Action.CurrentState!.Band(2)!.GainDb);

        await h.RotateAsync(-12);                                  // a Galleon flick: capped at 6 ticks = -3 dB
        Assert.Equal(3.0, h.Action.CurrentState!.Band(2)!.GainDb);
        await h.RotateAsync(-12);                                  // crossing 0 dB stops there (soft detent)
        Assert.Equal(0.0, h.Action.CurrentState!.Band(2)!.GainDb);
        await rig.SettleWritesAsync();
        Assert.Equal(0.0, rig.Sonar.FilterGain("game", 2));
        Assert.InRange(rig.Sonar.Puts("/configs").Count, 1, 2);

        await h.DialPressAsync(TimeSpan.FromSeconds(5));           // a long Galleon hold is just a press for us
        Assert.Equal(2.0, h.Action.CurrentState!.Band(2)!.GainDb); // defaultData filter2
        await rig.SettleWritesAsync();
        Assert.Equal(2.0, rig.Sonar.FilterGain("game", 2));
        Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
        h.AssertFramesAreDeckSafe();
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task Plus_ticks_tap_and_bypass_push()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "chatRender", Band = "6", Step = 1, Push = "bypass" }, configureServices: s => s.Add(rig.Service));
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(2.0, h.Action.CurrentState!.Band(6)!.GainDb);
        await h.DialPressAsync();
        Assert.False(h.Action.CurrentState!.Band(6)!.Enabled);
        await h.TapAsync(100, 50);                                 // tap = push on the Stream Deck +
        Assert.True(h.Action.CurrentState!.Band(6)!.Enabled);
        await rig.SettleWritesAsync();
        Assert.Equal(2.0, rig.Sonar.FilterGain("chatRender", 6));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Tone_knob_targets_work_on_game_and_render_on_both_devices()
    {
        await using var rig = await SonarRig.StartAsync();
        foreach (var (dev, at) in new[] { (TestDevices.Galleon, new Coordinates(1, 1)), (TestDevices.Plus, new Coordinates(0, 0)) })
        {
            await using var h = await ActionHarness<EqBandDial>.AppearAsync(dev, at, Controller.Encoder,
                settings: new EqBandDialSettings { Channel = "game", Band = "treble", Step = 0.5 }, configureServices: s => s.Add(rig.Service));
            await h.RotateAsync(2);
            Assert.Equal(1.0, h.Action.CurrentState!.Knobs[EqKnob.TrebleBoost]);
            await h.DialPressAsync();
            Assert.Equal(0.0, h.Action.CurrentState!.Knobs[EqKnob.TrebleBoost]);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Sonar_not_running_shows_an_offline_frame_and_recovers()
    {
        await using var rig = await SonarRig.StartAsync();
        var gg = rig.Gg.Http.Authority;
        rig.WriteCoreProps("127.0.0.1:9");                         // GG is not running
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game" }, configureServices: s => s.Add(rig.Service));
        Assert.Equal(EqAvailabilityCode.NotRunning, h.Action.Problem?.Code);
        Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
        await h.RotateAsync(3);                                     // no crash, no write
        Assert.Empty(rig.Sonar.Puts("/configs"));

        rig.WriteCoreProps(gg);
        rig.Time.Advance(TimeSpan.FromSeconds(2));                 // past the retry backoff
        await h.RotateAsync(1);
        Assert.Null(h.Action.Problem);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Pi_lists_channels_bands_and_explains_spotify()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game" }, configureServices: s => s.Add(rig.Service));
        var hello = await h.PiMessageAsync("pi.ready");
        var form = hello?["data"]?["form"]?.ToJsonString() ?? "";
        Assert.Contains("Spotify offers no API for it", form);
        Assert.Contains("eq.bands", form);
        Assert.Contains("\"setting\":\"global:eq.backend\"", form);       // the picker edits the global section (PiForm.Global)

        var channels = (await h.PiMessageAsync("eq.channels", null, 1))?["data"] as JsonArray;
        Assert.Equal(5, channels?.Count);
        Assert.Contains("(off in Sonar)", channels!.ToJsonString());

        var bands = (await h.PiMessageAsync("eq.bands", null, 2))?["data"] as JsonArray;
        Assert.Equal(14, bands?.Count);                              // 10 filters + bass, voice, treble, gain
        Assert.True(bands!.Any(o => o?["label"]?.GetValue<string>() == "Band 10 · 10 kHz (off)"), "disabled filters are marked");

        var presets = (await h.PiMessageAsync("eq.presets", null, 3))?["data"] as JsonArray;
        Assert.Equal("★ Example Favorite One", presets?[0]?["label"]?.GetValue<string>());
        Assert.Equal("★ Example Arena", presets?[1]?["label"]?.GetValue<string>());
    }

    [Test]
    public async Task Choosing_apo_in_the_pis_global_field_switches_the_backend_and_refreshes_the_form()
    {
        using var apo = new FakeApoEnvironment("Preamp: -1 dB\r\n");   // disposed last: the rig's shutdown flush still writes into it
        await using var rig = await SonarRig.StartAsync();
        rig.ApoEnv = apo;
        var globals = new TestGlobalSettings(new JsonObject { ["eq"] = new JsonObject { ["backend"] = "sonar" } });
        using var follow = EqModule.FollowBackendSetting(globals, rig.Service, NullLog.Instance); // what EqModule wires
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game" }, configureServices: s => s.Add(rig.Service), globals: globals);
        await h.PropertyInspectorAppearAsync();
        var hello = await h.PiMessageAsync("pi.ready");
        Assert.Contains("\"setting\":\"global:eq.backend\"", hello?["data"]?["form"]?.ToJsonString());
        Assert.Null(h.LastSettings, "the backend is no longer mirrored into each action's settings");

        globals.ReceiveFromStreamDeck(new JsonObject { ["eq"] = new JsonObject { ["backend"] = "apo" } }); // the PI's global:eq.backend field
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.Equal("apo", rig.Service.BackendId);
        Assert.Equal(EqAvailabilityCode.NotAttached, h.Action.Problem?.Code); // opt-in: nothing written yet
        var form = h.CallsOf("sendToPropertyInspector").LastOrDefault(c => c.Payload?["type"]?.GetValue<string>() == "pi.hello");
        Assert.Contains("eq.apo.attach", form?.Payload?["data"]?["form"]?.ToJsonString()); // RefreshPropertyInspectorForm: the APO fields appear
        Assert.Equal("Preamp: -1 dB\r\n", File.ReadAllText(apo.MainPath));

        await h.PiMessageAsync("eq.apo.attach", null, 7);
        Assert.Equal(EqAvailabilityCode.ChannelMissing, h.Action.Problem?.Code); // "game" is not an APO device: never another one
        await h.RotateAsync(2);
        await ((PrismControl.Eq.Apo.ApoEqBackend)rig.Service.Backend).FlushAsync(CancellationToken.None);
        Assert.DoesNotContain("Device: {", File.ReadAllText(apo.IncludePath));

        var headset = apo.Devices[1].Guid;                                     // the user picks a device
        await h.SettingsFromPropertyInspectorAsync(new EqBandDialSettings { Channel = headset });
        Assert.Null(h.Action.Problem);
        var refresh = h.CallsOf("sendToPropertyInspector").LastOrDefault(c => c.Payload?["type"]?.GetValue<string>() == "pi.refresh");
        Assert.Equal("[\"eq.bands\"]", refresh?.Payload?["data"]?["lists"]?.ToJsonString()); // RefreshPropertyInspectorOptions, not a re-sent hello
        await h.RotateAsync(2);
        await ((PrismControl.Eq.Apo.ApoEqBackend)rig.Service.Backend).FlushAsync(CancellationToken.None);
        Assert.Contains($"Device: {headset}", File.ReadAllText(apo.IncludePath));
        Assert.Contains("Filter 1: ON LSC Fc 31 Hz Gain 1.0 dB Q 0.71", File.ReadAllText(apo.IncludePath));
        h.AssertFramesAreDeckSafe();
    }
}

public class BandBrowserTests
{
    [Test]
    public async Task Turn_picks_push_adjusts_turn_changes_gain_push_returns()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder,
            settings: new EqBandBrowserSettings { Channel = "aux", Step = 0.5 }, configureServices: s => s.Add(rig.Service));
        // Aux: 5 enabled filters (35, 120, 1000, 6000, 18000 Hz) + bass, voice, treble.
        Assert.Equal(EqTarget.ForBand(1), h.Action.Picked);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(EqTarget.ForBand(3), h.Action.Picked);
        await h.RotateAsync(12);                                     // a fast flick moves up to 3 items
        Assert.Equal(EqTarget.ForKnob(EqKnob.BassBoost), h.Action.Picked);
        await h.RotateAsync(-2);
        Assert.Equal(EqTarget.ForBand(5), h.Action.Picked);
        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Puts("/configs"));                    // picking writes nothing

        await h.DialPressAsync();
        Assert.True(h.Action.IsAdjusting);
        await h.RotateAsync(4);
        Assert.Equal(2.0, h.Action.CurrentState!.Band(5)!.GainDb);
        await h.DialPressAsync();
        Assert.False(h.Action.IsAdjusting);
        await rig.SettleWritesAsync();
        Assert.Equal(2.0, rig.Sonar.FilterGain("aux", 5));
        await h.RotateAsync(-1);                                     // back to picking
        Assert.Equal(EqTarget.ForBand(4), h.Action.Picked);
        Assert.Equal("5", h.LastSettingsAs<EqBandBrowserSettings>().Band);
        h.AssertFramesAreDeckSafe();
    }

    /// <summary>Review A #8: the adjusted band was disabled elsewhere; the cursor moved to a neighbour but stayed in adjust mode.</summary>
    [Test]
    public async Task A_band_disabled_elsewhere_while_adjusting_goes_back_to_pick_mode_and_writes_no_other_band()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder,
            settings: new EqBandBrowserSettings { Channel = "aux", Step = 0.5 }, configureServices: s => s.Add(rig.Service));
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(EqTarget.ForBand(3), h.Action.Picked);          // 1 kHz, between 120 Hz and 6 kHz
        await h.DialPressAsync();
        Assert.True(h.Action.IsAdjusting);

        // The next gesture re-reads the config and finds band 3 switched off (in GG).
        rig.Sonar.Edit("aux", c => c["data"]!["parametricEQ"]!["filter3"]!["enabled"] = false);
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        await h.RotateAsync(4);
        Assert.False(h.Action.IsAdjusting, "back to picking: the band on the dial is not the one being adjusted");
        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Puts("/configs"));
        foreach (var b in new[] { 1, 2, 4, 5 }) Assert.Equal(0.0, rig.Sonar.FilterGain("aux", b), $"band {b} untouched");

        // Same when a poll brings the change in (no gesture in between): adjust band 4, then it is switched off.
        for (var i = 0; i < 10; i++) await h.RotateAsync(-1);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal(EqTarget.ForBand(4), h.Action.Picked);          // the list is now 1, 2, 4, 5 + knobs
        await h.DialPressAsync();
        Assert.True(h.Action.IsAdjusting);
        rig.Sonar.Edit("aux", c => c["data"]!["parametricEQ"]!["filter4"]!["enabled"] = false);
        rig.Time.Advance(TimeSpan.FromSeconds(9));
        await rig.Backend.PollAsync(CancellationToken.None);
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.False(h.Action.IsAdjusting);
        await h.RotateAsync(2);
        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Puts("/configs"));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Works_on_the_plus_with_tap_as_push()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Plus, new(3, 0), Controller.Encoder,
            settings: new EqBandBrowserSettings { Channel = "chatCapture", Step = 0.25 }, configureServices: s => s.Add(rig.Service));
        await h.RotateAsync(1);
        await h.TapAsync(20, 80);
        Assert.True(h.Action.IsAdjusting);
        await h.RotateAsync(-1);
        Assert.Equal(-0.25, h.Action.CurrentState!.Band(2)!.GainDb);
        await h.TapAsync(20, 80);
        await rig.SettleWritesAsync();
        Assert.Equal(-0.25, rig.Sonar.FilterGain("chatCapture", 2));
        var sent = JsonNode.Parse(rig.Sonar.Puts("/configs")[^1].Body)!;
        Assert.Equal(6.0, SonarConfig.Num(sent["schemaVersion"])); // the mic's schema, sent back as read
        h.AssertFramesAreDeckSafe();
    }
}

public class PresetAndToggleKeyTests
{
    [Test]
    public async Task Preset_key_selects_lights_and_reports_a_deleted_preset()
    {
        await using var rig = await SonarRig.StartAsync();
        foreach (var dev in new[] { TestDevices.Galleon, TestDevices.Plus })
        {
            await using var h = await ActionHarness<EqPresetKey>.AppearAsync(dev, new(1, 1), Controller.Keypad,
                settings: new EqPresetKeySettings { Channel = "game", PresetId = SonarFixtures.Id(3), PresetName = "Example Flat" }, configureServices: s => s.Add(rig.Service));
            Assert.False(h.Action.IsActive);
            await h.PressAsync();
            Assert.True(h.Action.IsActive);
            Assert.Equal(1, h.Count("showOk"));
            Assert.Equal(SonarFixtures.Id(3), rig.Sonar.Selected["game"]);
            Assert.Contains("viewBox=\"0 0 144 144\"", h.LastSvg);
            h.AssertFramesAreDeckSafe();
            rig.Sonar.Selected["game"] = SonarFixtures.Id(1); // back for the next device
            await rig.Backend.GetStateAsync("game", TimeSpan.Zero, CancellationToken.None);
        }

        rig.Sonar.Configs.Remove(SonarFixtures.Id(2));
        rig.Sonar.PresetOrder["game"].Remove(SonarFixtures.Id(2));
        await using var gone = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Plus, new(0, 1), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = "game", PresetId = SonarFixtures.Id(2), PresetName = "Example Favorite One" }, configureServices: s => s.Add(rig.Service));
        rig.Time.Advance(TimeSpan.FromSeconds(31));                  // past the preset-list cache
        await gone.PressAsync();
        Assert.True(gone.Action.IsMissing);
        Assert.Equal(1, gone.Count("showAlert"));
        gone.AssertFramesAreDeckSafe();
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task Preset_key_lights_when_the_preset_is_switched_in_gg()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Galleon, new(2, 3), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = "chatRender", PresetId = SonarFixtures.Id(11), PresetName = "Example Broadcast" }, configureServices: s => s.Add(rig.Service));
        Assert.False(h.Action.IsActive);
        rig.Sonar.Selected["chatRender"] = SonarFixtures.Id(11);
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        await rig.Backend.PollAsync(CancellationToken.None);
        await h.SettleAsync();
        await Task.Delay(50);
        await h.SettleAsync();
        Assert.True(h.Action.IsActive);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Toggle_key_switches_the_eq_and_the_effects_bypass()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Plus, new(3, 1), Controller.Keypad,
            settings: new EqToggleKeySettings { Channel = "game" }, configureServices: s => s.Add(rig.Service));
        Assert.True(h.Action.IsOn);
        await h.PressAsync();
        Assert.False(h.Action.IsOn);
        await rig.SettleWritesAsync();
        Assert.Equal(false, rig.Sonar.SelectedConfig("game")["data"]!["parametricEQ"]!["enabled"]!.GetValue<bool>());
        await h.PressAsync();
        await rig.SettleWritesAsync();
        Assert.Equal(true, rig.Sonar.SelectedConfig("game")["data"]!["parametricEQ"]!["enabled"]!.GetValue<bool>());
        h.AssertFramesAreDeckSafe();

        await using var fx = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Galleon, new(0, 3), Controller.Keypad,
            settings: new EqToggleKeySettings { Channel = "chatRender", Scope = "all" }, configureServices: s => s.Add(rig.Service));
        await fx.PressAsync();
        await rig.SettleWritesAsync();
        Assert.Equal(false, rig.Sonar.SelectedConfig("chatRender")["data"]!["globalEnableState"]!.GetValue<bool>());
        fx.AssertFramesAreDeckSafe();
    }
}

public class SonarVolumeDialTests
{
    [Test]
    public async Task Volume_turns_and_push_mutes_on_galleon_and_plus()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var g = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new SonarVolumeSettings { Channel = "chatRender", Step = 2 }, configureServices: s => s.Add(rig.Service));
        Assert.Equal(0.67, g.Action.Volume?.Volume);
        await g.RotateAsync(12);                                       // capped at 6 ticks × 2 %
        Assert.Near(0.79, g.Action.Volume!.Volume, 0.0001);
        await g.DialPressAsync();
        Assert.True(g.Action.Volume!.Muted);
        await rig.SettleWritesAsync();
        Assert.Near(0.79, rig.Sonar.Volumes["chatRender"].Volume, 0.0001);
        Assert.True(rig.Sonar.Volumes["chatRender"].Muted);
        g.AssertFramesAreDeckSafe();

        await using var p = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder,
            settings: new SonarVolumeSettings { Channel = "master", Step = 5 }, configureServices: s => s.Add(rig.Service));
        await p.RotateAsync(-1);
        await p.TapAsync(10, 10);
        await rig.SettleWritesAsync();
        Assert.Near(0.95, rig.Sonar.Volumes[SonarMixer.Master].Volume, 0.0001);
        Assert.True(rig.Sonar.Volumes[SonarMixer.Master].Muted);
        p.AssertFramesAreDeckSafe();
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task Chatmix_dial_is_read_only_on_a_headset_wheel()
    {
        await using var rig = await SonarRig.StartAsync();
        rig.Sonar.ChatBalance = 0.4;
        await using var h = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder,
            settings: new SonarVolumeSettings { Channel = "chatMix" }, configureServices: s => s.Add(rig.Service));
        Assert.True(h.Action.ChatMix!.OnHardwareWheel);
        await h.RotateAsync(5);
        await h.DialPressAsync();
        await rig.SettleWritesAsync();
        Assert.Equal(0.4, rig.Sonar.ChatBalance);
        Assert.Empty(rig.Sonar.Requests.Where(r => r.Method == "PUT"));
        h.AssertFramesAreDeckSafe();
    }
}
