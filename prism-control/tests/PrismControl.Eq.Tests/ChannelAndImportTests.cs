using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>Review A, Low: a missing channel silently targeted another one; a failed preset import kept a user path in settings.</summary>
public class MissingChannelTests
{
    private const string NotASonarChannel = "{12121212-3434-5656-7878-909090909090}";

    [Test]
    public async Task A_missing_sonar_channel_shows_channel_missing_and_edits_nothing()
    {
        await using var rig = await SonarRig.StartAsync();
        await using (var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = NotASonarChannel, Band = "1" }, configureServices: s => s.Add(rig.Service)))
        {
            Assert.Equal("CHANNEL MISSING", h.Action.Problem?.ShortText);
            Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
            await h.RotateAsync(4);
            await h.DialPressAsync();
            Assert.Contains("channel", SonarFaultTests.Status(await h.PiMessageAsync("pi.ready")));
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqBandBrowserDial>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder,
            settings: new EqBandBrowserSettings { Channel = NotASonarChannel }, configureServices: s => s.Add(rig.Service)))
        {
            Assert.Equal("CHANNEL MISSING", h.Action.Problem?.ShortText);
            await h.DialPressAsync();
            await h.RotateAsync(3);
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqToggleKey>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Keypad,
            settings: new EqToggleKeySettings { Channel = NotASonarChannel }, configureServices: s => s.Add(rig.Service)))
        {
            Assert.Equal("CHANNEL MISSING", h.Action.Problem?.ShortText);
            await h.PressAsync();
            Assert.Equal(1, h.Count("showAlert"));
            h.AssertFramesAreDeckSafe();
        }
        await using (var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = NotASonarChannel, PresetId = SonarFixtures.Id(3), PresetName = "Example Flat" }, configureServices: s => s.Add(rig.Service)))
        {
            Assert.Equal("CHANNEL MISSING", h.Action.Problem?.ShortText);
            await h.PressAsync();
            Assert.Equal(1, h.Count("showAlert"));
            h.AssertFramesAreDeckSafe();
        }
        await rig.SettleWritesAsync();
        Assert.Empty(rig.Sonar.Writes, "no other channel was edited or switched");
    }

    [Test]
    public async Task An_unset_channel_still_means_the_first_active_one()
    {
        await using var rig = await SonarRig.StartAsync();
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Band = "2" }, configureServices: s => s.Add(rig.Service));
        Assert.Null(h.Action.Problem);
        await h.RotateAsync(1);
        await rig.SettleWritesAsync();
        Assert.Equal(6.5, rig.Sonar.FilterGain("game", 2));
    }

    [Test]
    public async Task An_apo_device_that_disappears_shows_channel_missing_instead_of_editing_the_other_device()
    {
        using var apo = new FakeApoEnvironment("Preamp: -1 dB\r\n");   // disposed last: the rig's shutdown flush still writes into it
        await using var rig = await SonarRig.StartAsync();
        rig.ApoEnv = apo;
        rig.Service.SelectBackend(EqService.Apo);
        var backend = rig.Service.ApoBackend!;
        await backend.AttachAsync(CancellationToken.None);
        var (speakers, headset) = (apo.Devices[0].Guid, apo.Devices[1].Guid);
        await using var h = await ActionHarness<EqBandDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new EqBandDialSettings { Channel = speakers, Band = "1" }, configureServices: s => s.Add(rig.Service));
        Assert.Null(h.Action.Problem);
        await h.RotateAsync(2);
        await backend.FlushAsync(CancellationToken.None);
        Assert.Contains($"Device: {speakers}", File.ReadAllText(apo.IncludePath));

        apo.Devices.RemoveAt(0);                                     // the speakers' APO install is gone
        rig.Time.Advance(TimeSpan.FromSeconds(6));                   // past the 5 s probe cache
        await h.RotateAsync(2);
        Assert.Equal("CHANNEL MISSING", h.Action.Problem?.ShortText);
        await h.RotateAsync(2);
        await h.DialPressAsync();
        await backend.FlushAsync(CancellationToken.None);
        Assert.DoesNotContain($"Device: {headset}", File.ReadAllText(apo.IncludePath));
        h.AssertFramesAreDeckSafe();
    }
}

public class PresetImportTests
{
    private static async Task<(SonarRig Rig, FakeApoEnvironment Apo)> ApoRigAsync()
    {
        var rig = await SonarRig.StartAsync();
        var apo = new FakeApoEnvironment("Preamp: -1 dB\r\n");
        rig.ApoEnv = apo;
        rig.Service.SelectBackend(EqService.Apo);
        await rig.Service.ApoBackend!.AttachAsync(CancellationToken.None);
        return (rig, apo);
    }

    [Test]
    public async Task A_failed_import_leaves_no_user_path_in_the_settings()
    {
        var (rig, apo) = await ApoRigAsync();
        using var __ = apo;          // disposed after the rig, whose shutdown flush still writes into it
        await using var _ = rig;
        var device = apo.Devices[0].Guid;
        var missing = Path.Combine(apo.Root, "Downloads", "ParametricEQ.txt"); // stands in for C:\Users\<name>\Downloads\…
        await using var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = device, ImportPath = missing }, configureServices: s => s.Add(rig.Service));

        await h.PiMessageAsync("eq.apo.import");
        Assert.NotNull(h.LastSettings, "the settings were saved without the path");
        Assert.Equal("", h.LastSettingsAs<EqPresetKeySettings>().ImportPath);
        var status = h.CallsOf("sendToPropertyInspector").Select(c => c.Payload?.ToJsonString() ?? "").LastOrDefault(p => p.Contains("pi.state")) ?? "";
        Assert.DoesNotContain(apo.Root.Replace("\\", "\\\\"), status, "the status line does not echo the path");
        Assert.DoesNotContain("Downloads", status);

        // A file without filter lines fails too: the path goes as well.
        var noFilters = Path.Combine(apo.Root, "notes.txt");
        File.WriteAllText(noFilters, "Example notes, no filters here.\r\n");
        await h.SettingsFromPropertyInspectorAsync(new EqPresetKeySettings { Channel = device, ImportPath = noFilters });
        var saves = h.Count("setSettings");
        await h.PiMessageAsync("eq.apo.import");
        Assert.True(h.Count("setSettings") > saves);
        Assert.Equal("", h.LastSettingsAs<EqPresetKeySettings>().ImportPath);

        // A path typed but never imported is dropped when the key goes away (settings travel with exported profiles).
        await h.SettingsFromPropertyInspectorAsync(new EqPresetKeySettings { Channel = device, ImportPath = missing });
        await h.DisappearAsync();
        Assert.Equal("", h.LastSettingsAs<EqPresetKeySettings>().ImportPath);
    }

    [Test]
    public async Task A_good_import_becomes_the_keys_preset_and_clears_the_path()
    {
        var (rig, apo) = await ApoRigAsync();
        using var __ = apo;          // disposed after the rig, whose shutdown flush still writes into it
        await using var _ = rig;
        var device = apo.Devices[1].Guid;
        var file = Path.Combine(apo.Root, "Example Headphone ParametricEQ.txt");
        File.WriteAllText(file, "Preamp: -4 dB\nFilter 1: ON PK Fc 100 Hz Gain 2 dB Q 1\nFilter 2: ON HSC Fc 9000 Hz Gain -2 dB Q 0.7\n");
        await using var h = await ActionHarness<EqPresetKey>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            settings: new EqPresetKeySettings { Channel = device, ImportPath = file }, configureServices: s => s.Add(rig.Service));
        await h.PiMessageAsync("eq.apo.import");
        var saved = h.LastSettingsAs<EqPresetKeySettings>();
        Assert.Equal("", saved.ImportPath);
        Assert.Equal("Example Headphone ParametricEQ", saved.PresetName);
        Assert.True(saved.PresetId.StartsWith("user:", StringComparison.Ordinal));
        await h.PressAsync();
        Assert.True(h.Action.IsActive);
        h.AssertFramesAreDeckSafe();
    }
}
