using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Eq.Sonar;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>
/// docs/authoring-actions.md § Safe mode: with <c>safeMode: true</c> every EQ write is suppressed at the lowest layer
/// (the Sonar client, the APO files, apo-state.json), the in-memory model still changes so keys and dials respond, and
/// the gate counts what would have been written. Asserted against the fake Sonar's request log and state, and the fake
/// APO folder's bytes.
/// </summary>
public class SafeModeTests
{
    /// <summary>Everything the fake Sonar would change on a write, as one comparable string.</summary>
    private static string SonarState(FakeSonar s) =>
        new JsonObject
        {
            ["configs"] = new JsonObject(s.Configs.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)kv.Value.DeepClone()))),
            ["selected"] = new JsonObject(s.Selected.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)kv.Value))),
            ["volumes"] = new JsonObject(s.Volumes.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => KeyValuePair.Create(kv.Key, (JsonNode?)$"{kv.Value.Volume}|{kv.Value.Muted}"))),
            ["chat"] = s.ChatBalance,
        }.ToJsonString();

    [Test]
    public async Task In_safe_mode_presses_and_turns_send_nothing_to_sonar_but_every_action_still_responds()
    {
        await using var rig = await SonarRig.StartAsync(safeMode: true);
        rig.Sonar.ChatState = "enabled";                              // software ChatMix would be allowed
        var before = SonarState(rig.Sonar);
        Assert.True(rig.Client.SafeMode);

        await using (var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = "game", Band = "2" }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            Assert.True(h.Action.SafeMode);
            await h.RotateAsync(-4);
            Assert.Equal(4.0, h.Action.CurrentState!.Band(2)!.GainDb); // the dial responds
            await h.DialPressAsync();
            Assert.Equal(2.0, h.Action.CurrentState!.Band(2)!.GainDb); // reset to the preset's value
            await rig.SettleWritesAsync();
            rig.Time.Advance(TimeSpan.FromSeconds(10));                 // past the hold window and the 8 s refresh
            await rig.Backend.PollAsync(CancellationToken.None);
            Assert.Equal(2.0, rig.Backend.TryGetCachedState("game")!.Band(2)!.GainDb, "Sonar's unchanged copy doesn't undo the simulated edit");
            await h.PiMessageAsync("eq.revert");
            Assert.Equal(6.0, h.Action.CurrentState!.Band(2)!.GainDb); // undo, simulated too
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder,
            settings: new EqBandBrowserSettings { Channel = "aux", Step = 1 }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            await h.RotateAsync(1);
            await h.DialPressAsync();
            await h.RotateAsync(3);
            Assert.Equal(3.0, h.Action.CurrentState!.Band(2)!.GainDb);
            await h.DialPressAsync();
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Keypad,
            settings: new EqToggleKeySettings { Channel = "chatRender", Scope = "all" }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            await h.PressAsync();
            Assert.False(h.Action.IsOn);
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = "game", PresetId = SonarFixtures.Id(3), PresetName = "Example Flat" }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            await h.PressAsync();
            Assert.True(h.Action.IsActive, "the key lights as if Sonar had switched");
            Assert.Equal(1, h.Count("showOk"));
            rig.Time.Advance(TimeSpan.FromSeconds(10));
            await rig.Backend.PollAsync(CancellationToken.None);
            Assert.True(h.Action.IsActive);
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder,
            settings: new SonarVolumeSettings { Channel = "chatRender", Step = 2 }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            await h.RotateAsync(3);
            Assert.Near(0.73, h.Action.Volume!.Volume, 0.0001);
            await h.DialPressAsync();
            Assert.True(h.Action.Volume!.Muted);
            await rig.SettleWritesAsync();
            rig.Time.Advance(TimeSpan.FromSeconds(5));
            await rig.Mixer.PollAsync(CancellationToken.None);
            Assert.Near(0.73, rig.Mixer.Cached("chatRender", "monitoring")!.Volume, 0.0001);
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<SonarVolumeDial>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder,
            settings: new SonarVolumeSettings { Channel = "chatMix", Step = 5 }, configureServices: s => s.Add(rig.Service), safeMode: true))
        {
            await h.RotateAsync(-2);
            Assert.Equal(-0.2, h.Action.ChatMix!.Balance);
            h.AssertFramesAreDeckSafe();
        }

        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Writes, "safe mode sent no write to Sonar");
        Assert.Equal(before, SonarState(rig.Sonar));
        var would = rig.Writes.Recent;
        Assert.True(rig.Writes.Suppressed >= 8, $"{rig.Writes.Suppressed} suppressed");
        Assert.True(would.Contains("PUT /configs"), string.Join(", ", would));
        Assert.True(would.Contains($"PUT /configs/{SonarFixtures.Id(3)}/select"));
        Assert.True(would.Any(w => w.StartsWith("PUT /volumeSettings/classic/chatRender/Volume/", StringComparison.Ordinal)));
        Assert.True(would.Contains("PUT /volumeSettings/classic/chatRender/Mute/true"));
        Assert.True(would.Any(w => w.StartsWith("PUT /v1/chatMix?balance=", StringComparison.Ordinal)));
        Assert.True(rig.Sonar.Requests.Any(r => r.Method == "GET"), "reads stay real");
        rig.AssertNoForbiddenCalls();
    }

    [Test]
    public async Task In_safe_mode_apo_attach_edits_presets_import_and_detach_write_no_file()
    {
        using var apo = new FakeApoEnvironment("Preamp: -1 dB\r\nInclude: my-room.txt\r\n"); // disposed after the rig
        await using var rig = await SonarRig.StartAsync(safeMode: true);
        rig.ApoEnv = apo;
        rig.Service.SelectBackend(EqService.Apo);
        var config = File.ReadAllBytes(apo.MainPath);
        var device = apo.Devices[0].Guid;
        var import = Path.Combine(apo.Root, "Example ParametricEQ.txt");
        File.WriteAllText(import, "Filter 1: ON PK Fc 100 Hz Gain 2 dB Q 1\n");

        await using var dial = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = device, Band = "1" }, configureServices: s => s.Add(rig.Service), safeMode: true);
        Assert.Equal(EqAvailabilityCode.NotAttached, dial.Action.Problem?.Code);
        await dial.PiMessageAsync("eq.apo.attach");
        Assert.Null(dial.Action.Problem);                             // the attachment is simulated: the dial works
        await dial.RotateAsync(4);
        Assert.Equal(2.0, dial.Action.CurrentState!.Band(1)!.GainDb);
        await dial.DialPressAsync();

        await using var key = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = device, NewPresetName = "Example desk", ImportPath = import }, configureServices: s => s.Add(rig.Service), safeMode: true);
        await key.PiMessageAsync("eq.apo.savePreset");
        Assert.Equal("Example desk", key.LastSettingsAs<EqPresetKeySettings>().PresetName);
        await key.PiMessageAsync("eq.apo.import");                     // the import path is still set: imported, and cleared
        Assert.Equal("Example ParametricEQ", key.LastSettingsAs<EqPresetKeySettings>().PresetName);
        Assert.Equal("", key.LastSettingsAs<EqPresetKeySettings>().ImportPath);
        await key.PressAsync();
        Assert.True(key.Action.IsActive);
        await using var toggle = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Keypad,
            settings: new EqToggleKeySettings { Channel = device }, configureServices: s => s.Add(rig.Service), safeMode: true);
        await toggle.PressAsync();
        Assert.False(toggle.Action.IsOn);
        await dial.PiMessageAsync("eq.apo.detach");
        Assert.Equal(EqAvailabilityCode.NotAttached, dial.Action.Problem?.Code);
        await rig.Service.Backend.FlushAsync(CancellationToken.None);

        Assert.True(config.AsSpan().SequenceEqual(File.ReadAllBytes(apo.MainPath)), "config.txt is byte for byte the user's");
        Assert.False(File.Exists(apo.IncludePath), "no prism-control.txt");
        Assert.False(Directory.Exists(apo.DataDir), "no apo-state.json, not even its folder");
        Assert.Empty(Directory.GetFiles(apo.ConfigDir, "*.tmp"));
        var would = rig.Writes.Recent;
        foreach (var w in new[] { "attach config.txt", "write prism-control.txt", "write apo-state.json", "detach config.txt" })
            Assert.True(would.Contains(w), $"{w} missing from: {string.Join(", ", would)}");
        Assert.True(would.All(w => !w.Contains(apo.Root, StringComparison.OrdinalIgnoreCase)), "the log of would-be writes carries no paths");
        dial.AssertFramesAreDeckSafe();
        key.AssertFramesAreDeckSafe();
        toggle.AssertFramesAreDeckSafe();
    }

    [Test]
    public void The_gate_lets_writes_through_outside_safe_mode_and_counts_them_inside()
    {
        var live = new Infrastructure.EqWriteGate(false, PrismControl.Core.Hosting.NullLog.Instance);
        Assert.True(live.Allow("PUT /configs"));
        Assert.Equal(0, live.Suppressed);
        var safe = new Infrastructure.EqWriteGate(true, PrismControl.Core.Hosting.NullLog.Instance);
        for (var i = 0; i < 100; i++) Assert.False(safe.Allow("PUT /configs"));
        Assert.Equal(100, safe.Suppressed);
        Assert.InRange(safe.Recent.Count, 1, 64);
    }
}
