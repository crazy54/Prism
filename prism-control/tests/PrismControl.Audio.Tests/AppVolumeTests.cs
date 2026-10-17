using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class AppVolumeTests
{
    private static VolumeView V(ActionHarness<AppVolumeAction> h) => (VolumeView)h.Action.LastView!;

    [Test]
    public async Task Key_bound_to_a_program_mutes_that_app_everywhere()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Plus, new(2, 1), Controller.Keypad,
            new AppVolumeSettings { App = "chat.exe" }, H.With(f));
        Assert.Equal("Example Chat", V(h).Label);
        Assert.Equal(100, V(h).Pct); // the playing session on the default output is the primary one
        await h.PressAsync();
        Assert.Equal("appmute chat.exe * True", f.Writes.Last());
        Assert.True(V(h).Muted);
        Assert.Equal(1, f.SessionWatchers);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Not_running_until_the_app_starts_and_then_it_works()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad,
            new AppVolumeSettings { App = "C:\\Program Files\\Example\\Player.exe" }, H.With(f));
        Assert.Equal("NOT RUNNING", V(h).Note);
        Assert.Equal("Player", V(h).Label);
        await h.PressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        f.AddSession("player.exe", "Example Player", Headset, 0.4f, active: true, raise: true);
        await h.SettleAsync();
        Assert.Equal("Example Player", V(h).Label);
        Assert.Equal("40%", V(h).Value);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Galleon_dial_turn_sets_volume_and_push_mutes()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder,
            new AppVolumeSettings { App = "music.exe", Step = 1 }, H.With(f));
        await h.RotateAsync(12);
        Assert.Equal("appvolume music.exe * 0.62", f.Writes.Last());
        await h.DialPressAsync();
        Assert.Equal("appmute music.exe * True", f.Writes.Last());
        await h.RotateAsync(1); // turning up unmutes
        Assert.Contains("appmute music.exe * False", string.Join("\n", f.Writes));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Key_can_step_the_volume_and_external_changes_show_live()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new AppVolumeSettings { App = "music.exe", KeyPress = "down", Step = 10 }, H.With(f));
        await h.PressAsync();
        Assert.Equal("appvolume music.exe * 0.40", f.Writes.Last());
        f.ExternalAppVolume("music.exe", 0.75f, false);
        await h.SettleAsync();
        Assert.Equal(75, V(h).Pct);
    }

    [Test]
    public async Task The_app_picker_lists_running_apps_and_keeps_the_bound_one()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new AppVolumeSettings { App = "player.exe" }, H.With(f));
        var reply = await h.PiMessageAsync("audio.apps", null, requestId: 3);
        var values = reply!["data"]!.AsArray().Select(o => o!["value"]!.GetValue<string>()).ToList();
        Assert.True(values.Contains("music.exe") && values.Contains("chat.exe") && values.Contains(AppNames.SystemSoundsKey), string.Join(", ", values));
        Assert.Equal("player.exe", values.Last());
    }

    [Test]
    public async Task No_app_chosen_asks_for_one()
    {
        var f = WithApps();
        await using var h = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal("PICK AN APP", V(h).Note);
        await h.RotateAsync(1);
        Assert.Empty(f.Writes);
        h.AssertFramesAreDeckSafe();
    }
}
