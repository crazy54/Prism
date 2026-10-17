using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class MixerTests
{
    private static MixerView V(ActionHarness<MixerAction> h) => (MixerView)h.Action.LastView!;

    [Test]
    public async Task Galleon_turn_picks_push_adjusts_turn_sets_push_returns()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        // Apps on the default output, by name, System Sounds last.
        Assert.Equal("Example Browser", V(h).Name);
        Assert.Equal(4, V(h).Count);
        await h.RotateAsync(1);
        Assert.Equal("Example Chat", V(h).Name);
        Assert.False(V(h).Adjusting);
        Assert.Empty(f.Writes);

        await h.DialPressAsync();
        Assert.True(V(h).Adjusting);
        await h.RotateAsync(-3);
        Assert.Equal($"appvolume chat.exe {Speakers} 0.94", f.Writes.Last());
        Assert.Equal(94, V(h).Pct);

        await h.DialPressAsync();
        Assert.False(V(h).Adjusting);
        await h.RotateAsync(1);
        Assert.Equal("Example Music", V(h).Name);
        Assert.Single(f.Writes);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_fast_galleon_spin_moves_up_to_three_apps_and_stops_at_the_ends()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(12);
        Assert.Equal(3, V(h).Index);
        Assert.Equal("System Sounds", V(h).Name);
        await h.RotateAsync(12);
        Assert.Equal(3, V(h).Index);
        await h.RotateAsync(-5);
        Assert.Equal(1, V(h).Index);
    }

    [Test]
    public async Task Plus_ticks_move_one_app_each()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal("Example Music", V(h).Name);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Turning_below_zero_mutes_and_turning_up_unmutes()
    {
        var f = Standard();
        f.AddSession("music.exe", "Example Music", Speakers, 0.02f, active: true);
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.DialPressAsync();
        await h.RotateAsync(-1);
        Assert.Equal($"appvolume music.exe {Speakers} 0.00", f.Writes.Last());
        await h.RotateAsync(-1);
        Assert.Equal($"appmute music.exe {Speakers} True", f.Writes.Last());
        Assert.Equal("MUTED", V(h).Value);
        await h.RotateAsync(-4);
        Assert.Equal(2, f.Writes.Count); // already muted at 0%: nothing more to do
        await h.RotateAsync(1);
        Assert.Equal($"appmute music.exe {Speakers} False", f.Writes.Last());
        Assert.False(V(h).Muted);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Adjust_mode_returns_to_the_list_after_a_pause()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Encoder,
            new MixerSettings { ReturnAfter = 8 }, H.With(f));
        await h.DialPressAsync();
        await h.AdvanceAsync(TimeSpan.FromSeconds(5));
        await h.RotateAsync(1); // input restarts the timer
        await h.AdvanceAsync(TimeSpan.FromSeconds(5));
        Assert.True(V(h).Adjusting);
        await h.AdvanceAsync(TimeSpan.FromSeconds(4));
        Assert.False(V(h).Adjusting);
    }

    [Test]
    public async Task Scope_all_groups_an_app_across_outputs_and_writes_everywhere()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder,
            new MixerSettings { Scope = "all" }, H.With(f));
        Assert.Equal(4, V(h).Count);
        await h.RotateAsync(1);
        await h.DialPressAsync();
        await h.RotateAsync(-1);
        Assert.Equal("appvolume chat.exe * 0.98", f.Writes.Last());
    }

    [Test]
    public async Task The_selection_follows_the_app_when_the_list_changes()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal("Example Music", V(h).Name);
        f.RemoveApp("browser.exe");
        await h.SettleAsync();
        Assert.Equal("Example Music", V(h).Name);
        Assert.Equal(1, V(h).Index);
        f.RemoveApp("music.exe");
        await h.SettleAsync();
        Assert.Equal("Example Chat", V(h).Name);
        f.ExternalAppVolume("chat.exe", 0.25f, true);
        await h.SettleAsync();
        Assert.Equal("MUTED", V(h).Value);
    }

    [Test]
    public async Task No_apps_shows_an_empty_mixer_and_push_does_nothing()
    {
        var f = Standard();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder, configureServices: H.With(f));
        Assert.True(V(h).Empty);
        await h.DialPressAsync();
        await h.RotateAsync(3);
        Assert.False(V(h).Adjusting);
        Assert.Empty(f.Writes);
        f.AddSession("music.exe", "Example Music", Speakers, 0.5f, raise: true);
        await h.SettleAsync();
        Assert.Equal("Example Music", V(h).Name);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Sessions_are_watched_only_while_the_mixer_is_visible()
    {
        var f = WithApps();
        var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal(1, f.SessionWatchers);
        await h.DisappearAsync();
        Assert.Equal(0, f.SessionWatchers);
    }

    [Test]
    public async Task Plus_touch_toggles_the_shown_apps_mute()
    {
        var f = WithApps();
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(3, 0), Controller.Encoder, configureServices: H.With(f));
        await h.TapAsync(100, 50);
        Assert.Equal($"appmute browser.exe {Speakers} True", f.Writes.Last());
        Assert.True(V(h).Muted);
    }

    [Test]
    public async Task Routing_apps_are_hidden_by_default_and_shown_when_asked()
    {
        // Sonar, Wave Link, RTX Voice, Voicemeeter... carry other apps' sound; turning one down turns everything down.
        var f = WithApps();
        f.AddSession("steelseriessonar.exe", "Example Router", Speakers, 1f, active: true);
        f.AddSession("voicemeeter8x64.exe", "Example Virtual Mixer", Speakers, 1f, active: true);
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal(4, V(h).Count, "the two routing tools are left out");
        Assert.False(h.Action.Apps().Any(a => RoutingApps.IsRouting(a.Key)));
        await h.SettingsFromPropertyInspectorAsync(new MixerSettings { HideRouting = false });
        Assert.Equal(6, V(h).Count);
        Assert.True(h.Action.Apps().Any(a => a.Key == "steelseriessonar.exe"));
        var hello = await h.PiMessageAsync("pi.ready");
        Assert.True(hello!["data"]!["form"]!["fields"]!.AsArray().Any(x => x!["setting"]?.GetValue<string>() == "hideRouting" && x["kind"]!.GetValue<string>() == "checkbox"),
            "the PI has the toggle");
        Assert.True(new MixerSettings().HideRouting, "on by default");
    }

    [Test]
    public async Task An_app_name_the_font_cannot_draw_shows_its_program_name()
    {
        var f = Standard();
        f.AddSession("cloudmusic.exe", "网易云音乐", Speakers, 0.5f, active: true);
        await using var h = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        Assert.Equal("Cloudmusic", V(h).Name);
        h.AssertFramesAreDeckSafe();
    }
}
