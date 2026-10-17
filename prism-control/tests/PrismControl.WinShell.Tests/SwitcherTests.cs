using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Scheduling;
using PrismControl.Desktop;
using PrismControl.Testing;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

public class WindowSlotTests
{
    private static readonly WindowInfo A = Samples.Window(1, "editor.exe", "a"), B = Samples.Window(2, "browser.exe", "b"), C = Samples.Window(3, "Browser.EXE", "c");

    [Test]
    public void Zorder_recent_and_pinned_pick_the_right_window()
    {
        IReadOnlyList<WindowInfo> z = [A, B, C], recent = [C, A, B];
        Assert.Equal((nint)1, WindowSlots.Pick(SlotMode.ZOrder, 1, null, z, recent)!.Hwnd);
        Assert.Equal((nint)3, WindowSlots.Pick(SlotMode.ZOrder, 3, null, z, recent)!.Hwnd);
        Assert.Null(WindowSlots.Pick(SlotMode.ZOrder, 4, null, z, recent));
        Assert.Null(WindowSlots.Pick(SlotMode.ZOrder, 0, null, z, recent));
        Assert.Equal((nint)3, WindowSlots.Pick(SlotMode.Recent, 1, null, z, recent)!.Hwnd);
        // Pinned: case-insensitive, ".exe" optional, the app's most recent window first; slot 2 = its second window.
        Assert.Equal((nint)3, WindowSlots.Pick(SlotMode.Pinned, 1, "browser", z, recent)!.Hwnd);
        Assert.Equal((nint)2, WindowSlots.Pick(SlotMode.Pinned, 2, "BROWSER.exe", z, recent)!.Hwnd);
        Assert.Equal((nint)3, WindowSlots.Pick(SlotMode.Pinned, 9, "browser.exe", z, recent)!.Hwnd, "a missing slot falls back to the first");
        Assert.Null(WindowSlots.Pick(SlotMode.Pinned, 1, "missing.exe", z, recent));
        Assert.Null(WindowSlots.Pick(SlotMode.Pinned, 1, " ", z, recent));
        Assert.Equal(SlotMode.Recent, WindowSlots.ParseMode("MRU"));
        Assert.Equal(SlotMode.ZOrder, WindowSlots.ParseMode(null));
        Assert.Equal("Editor", WindowSlots.AppName("editor.exe"));
        Assert.Equal("App", WindowSlots.AppName("?"));
    }

    [Test]
    public async Task Window_list_skips_cloaked_windows_and_tracks_most_recent_use()
    {
        await using var rig = new Rig().WithWindows();
        rig.Catalog.Windows.Add(Samples.Window(0x1009, "other.exe", "on desktop 2", cloaked: true));
        var list = rig.Services.Windows;
        Assert.Equal(3, list.Current().Count, "the cloaked (other desktop) window is left out");
        Assert.Equal((nint)0x1001, list.MostRecent()[0].Hwnd);
        rig.Foreground.Foreground = 0x1003;
        rig.Catalog.Raise(WindowEventKind.Foreground, 0x1003);
        Assert.Equal((nint)0x1003, list.MostRecent()[0].Hwnd);
        rig.Foreground.Foreground = 0x1002;
        rig.Catalog.Raise(WindowEventKind.Foreground, 0x1002);
        Assert.Equal("1002,1003,1001", string.Join(",", list.MostRecent().Select(w => w.Hwnd.ToString("X"))));
        Assert.Equal("1001,1002,1003", string.Join(",", list.Current().Select(w => w.Hwnd.ToString("X"))), "z-order is the catalog's");
        // Changes are coalesced: one Changed per 100 ms burst.
        var changed = 0;
        list.Changed += () => changed++;
        for (var i = 0; i < 5; i++) rig.Catalog.Raise();
        rig.Time.Advance(TimeSpan.FromMilliseconds(120));
        Assert.Equal(0, changed, "re-reads wait for the 300 ms minimum interval");
        rig.Time.Advance(TimeSpan.FromMilliseconds(250));
        Assert.Equal(1, changed);
        var n = list.Enumerations;
        for (var i = 0; i < 50; i++) { list.Current(); list.MostRecent(); }
        Assert.Equal(n, list.Enumerations, "13 controls asking every second share one read");
    }
}

public class WindowKeyTests
{
    [Test]
    public async Task Shows_the_slot_window_live_with_icon_and_title_at_two_fps_background()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig().WithWindows();
            await using var h = await rig.AppearAsync<WindowKeyAction>(device, at, settings: new WindowKeySettings { Slot = 1 });
            var m = h.Action.Model();
            Assert.Equal("notes.example — Example Editor", m.Caption, device.Name);
            Assert.Equal("Editor", m.AppName);
            Assert.True(m.Foreground, "slot 1 is the window in front");
            Assert.NotNull(m.Icon, "the app icon badge");
            var lease = Assert.Single(rig.Thumbs.Live);
            Assert.Equal((nint)0x1001, lease.Hwnd);
            Assert.Equal(ThumbnailService.KeyWidth, lease.Request.MaxWidth);
            Assert.True(lease.Request.Interval >= TimeSpan.FromMilliseconds(500), "≤ 2 fps per key");
            rig.Thumbs.Emit(0x1001);
            await h.SettleAsync();
            Assert.NotNull(h.Action.Model().Thumbnail);
            Assert.Contains("data:image/jpeg;base64,", h.LastSvg);
            Assert.Contains("data:image/png;base64,", h.LastSvg);
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background), "thumbnail keys never compete with dials");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Minimized_window_shows_its_icon_not_a_thumbnail()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Galleon, new(1, 0), settings: new WindowKeySettings { Slot = 3 });
        rig.Thumbs.Emit(0x1003);
        await h.SettleAsync();
        var m = h.Action.Model();
        Assert.True(m.Minimized);
        Assert.NotNull(m.Icon);
        Assert.DoesNotContain("data:image/jpeg", h.LastSvg, "a minimized window has no live frames (WGC sends 0), so the icon stands in");
        Assert.Contains("data:image/png", h.LastSvg);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Streamer_safe_shows_the_app_name_instead_of_the_title()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Plus, new(0, 0), settings: new WindowKeySettings { Slot = 2 });
        Assert.Equal("The Example Ensemble — tour dates", h.Action.Model().Caption);
        rig.Options.Apply(new WinShellGlobalSettings { StreamerSafe = true });
        await h.SettleAsync();
        Assert.Equal("Browser", h.Action.Model().Caption);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Press_brings_the_window_to_front_and_explains_refusals()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Galleon, new(0, 1), settings: new WindowKeySettings { Slot = 2 });
        await h.PressAsync();
        Assert.Equal((nint)0x1002, rig.Foreground.Calls.Single());
        Assert.Null(h.Action.Model().Flash, "a successful focus needs no message");
        rig.Foreground.Results[0x1002] = ForegroundResult.Elevated;
        rig.Foreground.Foreground = 0x1001;
        await h.PressAsync();
        Assert.Equal("ADMIN APP", h.Action.Model().Flash);
        Assert.True(h.Action.Model().FlashAlert);
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Null(h.Action.Model().Flash, "the message clears");
        rig.Foreground.Results[0x1002] = ForegroundResult.Refused;
        await h.PressAsync();
        Assert.Equal("CAN'T FOCUS", h.Action.Model().Flash);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Pinned_app_follows_its_window_and_says_when_it_is_not_running()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.XL, new(0, 0), settings: new WindowKeySettings { Mode = "pinned", App = "chat.exe" });
        Assert.Equal((nint)0x1003, h.Action.Current!.Hwnd);
        await h.SettingsFromPropertyInspectorAsync(new WindowKeySettings { Mode = "pinned", App = "music.exe" });
        var m = h.Action.Model();
        Assert.True(m.Empty);
        Assert.Equal("NOT RUNNING", m.EmptyLabel);
        Assert.Equal("Music", m.Caption);
        await h.PressAsync();
        Assert.Empty(rig.Foreground.Calls);
        Assert.Equal("NOT RUNNING", h.Action.Model().Flash);
        // The app starts: the key picks it up on the next list change.
        rig.Catalog.Windows.Add(Samples.Window(0x1010, "music.exe", "Example Player"));
        rig.Catalog.Raise(WindowEventKind.Created, 0x1010);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(350));
        Assert.Equal((nint)0x1010, h.Action.Current?.Hwnd);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Recent_mode_reorders_on_focus_changes_and_admin_windows_are_badged()
    {
        await using var rig = new Rig().WithWindows();
        rig.Catalog.Windows.Add(Samples.Window(0x1004, "monitor-tool.exe", "Sensors", elevated: true));
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Mini, new(0, 0), settings: new WindowKeySettings { Mode = "recent", Slot = 1 });
        Assert.Equal((nint)0x1001, h.Action.Current!.Hwnd);
        rig.Foreground.Foreground = 0x1004;
        rig.Catalog.Raise(WindowEventKind.Foreground, 0x1004);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(350));
        Assert.Equal((nint)0x1004, h.Action.Current!.Hwnd);
        Assert.True(h.Action.Model().Elevated);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Thumbnails_follow_the_global_switch_and_calm_down_while_gaming()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Galleon, new(0, 0));
        var lease = Assert.Single(rig.Thumbs.Live);
        Assert.Equal(TimeSpan.FromMilliseconds(500), lease.Request.Interval);
        rig.Game.State = new GameState(3, -1, false);
        rig.Time.Advance(GameModeService.Poll);
        rig.Services.Game.Current(TimeSpan.Zero);
        Assert.Equal(ThumbnailService.GamingKeyInterval, lease.Request.Interval, "0.25 fps during a game");
        rig.Game.State = GameState.Idle;
        rig.Services.Game.Current(TimeSpan.Zero);
        Assert.Equal(TimeSpan.FromMilliseconds(500), lease.Request.Interval);
        rig.Options.Apply(new WinShellGlobalSettings { ThumbnailFps = 1 });
        Assert.Equal(TimeSpan.FromSeconds(1), lease.Request.Interval);
        rig.Options.Apply(new WinShellGlobalSettings { ThumbnailFps = 30 });
        Assert.Equal(TimeSpan.FromMilliseconds(500), lease.Request.Interval, "never faster than 2 fps");
        rig.Options.Apply(new WinShellGlobalSettings { LiveThumbnails = false });
        await h.SettleAsync();
        Assert.Empty(rig.Thumbs.Live);
        Assert.NotNull(h.Action.Model().Icon, "icons only");
        await h.SettingsFromPropertyInspectorAsync(new WindowKeySettings { Live = false });
        Assert.Empty(rig.Thumbs.Live);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Empty_slot_and_missing_services_render_an_honest_key()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<WindowKeyAction>(TestDevices.Galleon, new(2, 0), settings: new WindowKeySettings { Slot = 9 });
        Assert.True(h.Action.Model().Empty);
        Assert.Equal("NO WINDOW", h.Action.Model().EmptyLabel);
        h.AssertFramesAreDeckSafe();
        await using var bare = await PrismControl.Testing.ActionHarness<WindowKeyAction>.AppearAsync(TestDevices.Plus, new(0, 0));
        Assert.Equal("UNAVAILABLE", bare.Action.Model().EmptyLabel);
        await bare.PressAsync();
        bare.AssertFramesAreDeckSafe();
    }
}

public class BrowserDialTests
{
    [Test]
    public async Task Galleon_spin_browses_with_a_focused_ten_fps_preview_and_push_focuses()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<BrowserDial>(TestDevices.Galleon, new(0, 0), Core.Devices.Controller.Encoder);
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        Assert.Equal((nint)0x1001, h.Action.Selected, "idle: the window in front");
        Assert.Equal(TimeSpan.FromMilliseconds(500), rig.Thumbs.Live.Single().Request.Interval, "idle widget: 2 fps");
        await h.RotateAsync(+12);
        Assert.Equal((nint)0x1003, h.Action.Selected, "±12 ticks clamp to the end of the list");
        var lease = rig.Thumbs.Live.Single();
        Assert.Equal((nint)0x1003, lease.Hwnd);
        Assert.Equal(ThumbnailService.WidgetWidth, lease.Request.MaxWidth);
        Assert.Equal(ThumbnailService.FocusedInterval, lease.Request.Interval, "the focused widget: ≤ 10 fps");
        await h.RotateAsync(-1);
        Assert.Equal((nint)0x1002, h.Action.Selected);
        rig.Thumbs.Emit(0x1002, Samples.WideJpeg, 224, 94);
        await h.SettleAsync();
        Assert.NotNull(h.Action.Model().Thumbnail);
        Assert.Contains("data:image/jpeg", h.FeedbackSvg(Layouts.Canvas.Frame));
        await h.DialPressAsync();
        Assert.Equal((nint)0x1002, rig.Foreground.Calls.Single());
        Assert.Equal("IN FRONT", h.Action.Model().Flash);
        await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(10, 10));
        // Idle for 10 s: back to 2 fps, and the selection follows the window in front.
        await h.AdvanceAsync(TimeSpan.FromSeconds(11));
        Assert.False(h.Action.IsFocusedWidget);
        Assert.Equal(TimeSpan.FromMilliseconds(500), rig.Thumbs.Live.Single().Request.Interval);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_turns_one_window_per_tick_and_touch_focuses()
    {
        await using var rig = new Rig().WithWindows();
        await using var h = await rig.AppearAsync<BrowserDial>(TestDevices.Plus, new(0, 0), Core.Devices.Controller.Encoder, new BrowserSettings { Order = "zorder" });
        await h.RotateAsync(1);
        Assert.Equal((nint)0x1002, h.Action.Selected);
        await h.TapAsync(100, 50);
        Assert.Equal((nint)0x1002, rig.Foreground.Calls.Single());
        await h.RotateAsync(-5);
        Assert.Equal((nint)0x1001, h.Action.Selected, "clamped at the start");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Only_one_widget_is_focused_at_a_time()
    {
        await using var rig = new Rig().WithWindows();
        await using var a = await rig.AppearAsync<BrowserDial>(TestDevices.Galleon, new(0, 0), Core.Devices.Controller.Encoder, context: "a");
        await using var b = await rig.AppearAsync<BrowserDial>(TestDevices.Plus, new(1, 0), Core.Devices.Controller.Encoder, context: "b");
        await a.RotateAsync(1);
        await b.RotateAsync(2);
        var fast = rig.Thumbs.Live.Count(l => l.Request.Interval == ThumbnailService.FocusedInterval);
        Assert.Equal(1, fast);
        Assert.True(rig.Services.Thumbnails.IsFocused(b.Action.Lease!));
        a.AssertFramesAreDeckSafe();
        b.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Every_widget_placement_renders_deck_safe_frames()
    {
        foreach (var (device, at) in Placements.Dials())
        {
            await using var rig = new Rig().WithWindows();
            rig.Options.Apply(new WinShellGlobalSettings { StreamerSafe = device.IsPlus });
            await using var h = await rig.AppearAsync<BrowserDial>(device, at, Core.Devices.Controller.Encoder);
            rig.Thumbs.Emit(0x1001, Samples.WideJpeg, 224, 94);
            await h.SettleAsync();
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            await h.DialPressAsync();
            if (device.IsPlus) await h.TapAsync(20, 20);
            if (device.IsPlus) Assert.Null(h.Action.Model().Title, "streamer-safe: no title overlay");
            else Assert.NotNull(h.Action.Model().Title);
            h.AssertFramesAreDeckSafe();
        }
        await using var empty = new Rig();
        await using var e = await empty.AppearAsync<BrowserDial>(TestDevices.Galleon, new(1, 1), Core.Devices.Controller.Encoder);
        await e.RotateAsync(3);
        await e.DialPressAsync();
        Assert.Equal("NO WINDOW", e.Action.Model().Flash ?? "NO WINDOW");
        e.AssertFramesAreDeckSafe();
    }
}

public class DesktopsTests
{
    [Test]
    public async Task Key_steps_with_win_ctrl_arrows_and_verifies_with_the_registry()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<DesktopsAction>(TestDevices.Galleon, new(1, 1));
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal("5B+11+27", rig.Input.Chords.Single(), "Win+Ctrl+Right");
        Assert.Equal(1, rig.Desktops.Current);
        Assert.Null(h.Action.FlashText);
        await h.SettingsFromPropertyInspectorAsync(new DesktopsSettings { Action = "goto", Target = 3 });
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal(2, rig.Desktops.Current);
        Assert.Equal(2, rig.Input.Chords.Count);
        // Next from the last wraps to the first (two lefts).
        await h.SettingsFromPropertyInspectorAsync(new DesktopsSettings { Action = "next" });
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal(0, rig.Desktops.Current);
        Assert.Equal("5B+11+25", rig.Input.Chords[^1]);
        await h.SettingsFromPropertyInspectorAsync(new DesktopsSettings { Action = "goto", Target = 7 });
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal("NO DESKTOP 7", h.Action.FlashText);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_switch_Explorer_did_not_make_shows_the_real_desktop_and_an_alert()
    {
        await using var rig = new Rig();
        rig.Input.Desktops = null; // input "sent" but nothing moved
        await using var h = await rig.AppearAsync<DesktopsAction>(TestDevices.Plus, new(3, 0));
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal("NOT CONFIRMED", h.Action.FlashText);
        Assert.True(h.Action.FlashAlert);
        Assert.Equal(0, rig.Services.Desktops.Current(TimeSpan.Zero).Current);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Dial_turn_is_one_step_per_event_however_fast_the_spin()
    {
        foreach (var (device, at) in Placements.Dials())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<DesktopsAction>(device, at, Core.Devices.Controller.Encoder);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            await rig.Until(h, () => !h.Action.Switching);
            Assert.Equal(1, rig.Desktops.Current, device.Name);
            await h.RotateAsync(device.IsGalleon ? -12 : -1);
            await rig.Until(h, () => !h.Action.Switching);
            Assert.Equal(0, rig.Desktops.Current, "turning back stops at the first desktop (no wrap on a dial)");
            await h.RotateAsync(-1);
            await rig.Until(h, () => !h.Action.Switching);
            Assert.Equal(0, rig.Desktops.Current);
            await h.DialPressAsync();
            await rig.Until(h, () => !h.Action.Switching);
            Assert.Equal(1, rig.Desktops.Current, "push = next");
            if (device.IsPlus) { await h.TapAsync(10, 10); await rig.Until(h, () => !h.Action.Switching); Assert.Equal(2, rig.Desktops.Current); }
            h.AssertFramesAreDeckSafe();
        }
    }
}

public class GameModeTests
{
    [Test]
    public void Game_state_rules()
    {
        Assert.True(new GameState(3, -1, false).IsGaming, "D3D exclusive fullscreen");
        Assert.True(new GameState(5, 5, false).IsGaming, "Game Mode power mode");
        Assert.True(new GameState(2, 4, true).IsGaming, "borderless app covering the monitor");
        Assert.False(new GameState(2, 4, false).IsGaming, "busy but windowed (a presentation)");
        Assert.False(GameState.Idle.IsGaming);
        Assert.Equal("Fullscreen game", new GameState(3, -1, false).Describe());
    }

    [Test]
    public async Task Key_lights_while_gaming_and_opens_settings()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<GameModeKey>(device, at);
            Assert.False(h.Action.LastOn);
            rig.Game.State = new GameState(3, 5, false);
            await h.AdvanceAsync(GameModeService.Poll + TimeSpan.FromMilliseconds(10));
            Assert.True(h.Action.LastOn, device.Name);
            await h.PressAsync();
            Assert.Equal("ms-settings:gaming-gamemode", h.CallsOf("openUrl").Single().Payload!["url"]!.GetValue<string>());
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background));
            h.AssertFramesAreDeckSafe();
        }
    }
}
