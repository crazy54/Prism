using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Smtc;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

internal static class H
{
    public static Task<ActionHarness<T>> Key<T>(Rig rig, DeviceInfo dev, object? settings = null, Coordinates? at = null, string context = "ctx-test") where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(dev, at ?? new(0, 0), Controller.Keypad, settings, configureServices: rig.Services, time: rig.Time, safeMode: rig.Hub.SafeMode, context: context);

    public static Task<ActionHarness<T>> Dial<T>(Rig rig, DeviceInfo dev, object? settings = null, Coordinates? at = null, string context = "ctx-test") where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(dev, at ?? new(0, 0), Controller.Encoder, settings, configureServices: rig.Services, time: rig.Time, safeMode: rig.Hub.SafeMode, context: context);

    /// <summary>Waits for an action's background commands, then for its mailbox.</summary>
    public static async Task Done<T>(ActionHarness<T> h) where T : ActionBase, new()
    {
        for (var i = 0; i < 3; i++)
        {
            switch (h.Action)
            {
                case TabKeyAction a: await a.PendingAsync(); break;
                case TabsDialAction a: await a.PendingAsync(); break;
                case MediaKeyAction a: await a.PendingAsync(); break;
                case ScrubDialAction a: await a.PendingAsync(); break;
                case SpeedDialAction a: await a.PendingAsync(); break;
                case PreviewDialAction a: await a.PendingAsync(); break;
                case PageDialAction a: await a.PendingAsync(); break;
                case NavKeyAction a: await a.PendingAsync(); break;
                case ReopenKeyAction a: await a.PendingAsync(); break;
                case SplitKeyAction a: await a.PendingAsync(); break;
                case GroupKeyAction a: await a.PendingAsync(); break;
                case SiteKeyAction a: await a.PendingAsync(); break;
                case DownloadKeyAction a: await a.PendingAsync(); break;
                case PrivacyKeyAction a: await a.PendingAsync(); break;
                case PanicKeyAction a: await a.PendingAsync(); break;
                case MeetKeyAction a: await a.PendingAsync(); break;
            }
            await Task.Delay(10);
            await h.SettleAsync();
        }
    }

    public static readonly (DeviceInfo Dev, Coordinates At)[] KeyPlacements = [(TestDevices.Galleon, new(2, 1)), (TestDevices.Plus, new(3, 0))];
    public static readonly (DeviceInfo Dev, Coordinates At)[] DialPlacements = [(TestDevices.Galleon, new(0, 0)), (TestDevices.Galleon, new(1, 1)), (TestDevices.Plus, new(2, 0))];

    public static string B64(byte[] png) => Convert.ToBase64String(png);
}

public class TabActionTests
{
    [Test]
    public async Task Tab_key_shows_the_favicon_as_is_on_Galleon_and_Plus_and_presses_focus_and_raise()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<TabKeyAction>(rig, dev, new TabKeySettings { Slot = "order", Index = 2 }, at);
            Assert.Contains(H.B64(Fx.FavBlue), h.LastSvg, "the favicon bytes are embedded unchanged");
            await h.PressAsync();
            await H.Done(h);
            var focus = Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus));
            Assert.Equal(12, focus.Args["tabId"]!.GetValue<int>());
            Assert.True(focus.Args["raise"]!.GetValue<bool>());
            Assert.Equal(4242, Assert.Single(rig.Foreground.Grants), "AllowSetForegroundWindow(browser pid) first");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task When_Windows_refuses_the_browser_we_raise_the_matching_frame_ourselves()
    {
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, _) => op == Wire.Op.TabFocus
            ? new CommandResult(true, new JsonObject { ["focused"] = false, ["bounds"] = new JsonObject { ["left"] = 100, ["top"] = 100, ["width"] = 1280, ["height"] = 800 } })
            : CommandResult.Success;
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Galleon, new TabKeySettings { Index = 1 });
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal((nint)0x2002, Assert.Single(rig.Foreground.Raises), "the HWND whose bounds match");

        rig.Foreground.RaiseResult = RaiseResult.Refused;
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal(1, h.Count("showAlert"));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task An_elevated_window_in_front_is_reported_and_no_input_is_wasted()
    {
        await using var rig = Rig.Create();
        rig.Input.Elevated = true;
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Plus, new TabKeySettings { Index = 3 });
        var before = h.LastSvg;
        await h.PressAsync();
        await H.Done(h);
        Assert.Empty(rig.Foreground.Grants);
        Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus), "the tab still switches");
        Assert.NotEqual(before, h.LastSvg, "the key shows ADMIN APP IN FRONT");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Hold_closes_and_a_press_within_5_s_undoes()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<TabKeyAction>(rig, dev, new TabKeySettings { Index = 3 }, at);
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Equal(13, Assert.Single(rig.Sink!.Of(Wire.Op.TabClose)).Args["tabId"]!.GetValue<int>());
            Assert.Empty(rig.Sink.Of(Wire.Op.TabFocus), "a hold is not also a press");
            var undo = h.LastSvg;
            await h.AdvanceAsync(TimeSpan.FromSeconds(2));
            await h.PressAsync();
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.SessionRestore));
            Assert.NotEqual(undo, h.LastSvg);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task After_the_undo_window_a_press_focuses_again()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Galleon, new TabKeySettings { Index = 3 });
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        await h.AdvanceAsync(TimeSpan.FromSeconds(6));
        await h.PressAsync();
        await H.Done(h);
        Assert.Empty(rig.Sink!.Of(Wire.Op.SessionRestore));
        Assert.Single(rig.Sink.Of(Wire.Op.TabFocus));
    }

    [Test]
    public async Task No_browser_empty_slot_and_reconnecting_faces()
    {
        await using (var none = Rig.Create(seedChrome: false))
        {
            await using var h = await H.Key<TabKeyAction>(none, TestDevices.Galleon);
            var noBrowser = Render.BrowserArt.MessageKey(Core.Render.Tokens.Refraction.Night, Render.BrowserGlyphs.Plug, "NO BROWSER", "OPEN SETTINGS", Render.Tone.Warn).ToDataUri();
            Assert.Equal(noBrowser, h.LastImage);
            await h.PressAsync();
            Assert.Equal(1, h.Count("showAlert"));
            h.AssertFramesAreDeckSafe();
        }
        await using var rig = Rig.Create();
        await using var empty = await H.Key<TabKeyAction>(rig, TestDevices.Plus, new TabKeySettings { Index = 9 });
        var emptyFace = empty.LastSvg;
        rig.Update(b => b with { Connected = false, LostAt = 5 });
        await empty.SettleAsync();
        await using var stale = await H.Key<TabKeyAction>(rig, TestDevices.Plus, new TabKeySettings { Index = 1 });
        Assert.Contains("opacity=\"0.45\"", stale.LastSvg, "a lost browser's tab dims");
        empty.AssertFramesAreDeckSafe();
        stale.AssertFramesAreDeckSafe();
        _ = emptyFace;
    }

    [Test]
    public async Task Tab_key_redraws_on_store_changes_through_the_mailbox()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Galleon, new TabKeySettings { Index = 1 });
        var before = h.CallsOf("setImage").Count;
        rig.Update(b => b with { Tabs = b.Tabs.SetItem(11, b.Tabs[11] with { Unread = 12 }) });
        await h.SettleAsync();
        Assert.True(h.CallsOf("setImage").Count > before);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Tab_browser_dial_turns_accelerate_push_focuses_row_zero_switches_scope()
    {
        foreach (var (dev, at) in H.DialPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Dial<TabsDialAction>(rig, dev, new TabsDialSettings(), at);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            await h.RotateAsync(1);
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Equal(13, Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus)).Args["tabId"]!.GetValue<int>(), "one row down from the active tab");
            await h.RotateAsync(-12);   // fast spin: clamps at row 0 (the scope switch)
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Equal("all", h.LastSettingsAs<TabsDialSettings>().Scope);
            await h.RotateAsync(dev.IsGalleon ? 5 : 1);
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Equal(2, rig.Sink.Of(Wire.Op.TabFocus).Count);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Tab_browser_plus_touch_extras_close_and_focus()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Dial<TabsDialAction>(rig, TestDevices.Plus, new TabsDialSettings(), new(0, 0));
        await h.TapAsync(100, 50);
        await H.Done(h);
        Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus));
        await h.TapAsync(100, 50, hold: true);
        await H.Done(h);
        Assert.Single(rig.Sink.Of(Wire.Op.TabClose));
        await h.DialPressAsync(TimeSpan.FromMilliseconds(700));   // dial long-press (Stream Deck + only)
        await H.Done(h);
        Assert.Equal(2, rig.Sink.Of(Wire.Op.TabClose).Count);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task On_Galleon_a_long_dial_push_is_just_a_push()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Dial<TabsDialAction>(rig, TestDevices.Galleon, new TabsDialSettings(), new(0, 0));
        await h.DialPressAsync(TimeSpan.FromSeconds(5));
        await H.Done(h);
        Assert.Empty(rig.Sink!.Of(Wire.Op.TabClose));
        Assert.Single(rig.Sink.Of(Wire.Op.TabFocus));
    }
}

public class MediaActionTests
{
    [Test]
    public async Task Media_key_shows_art_whole_and_toggles_on_press()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<MediaKeyAction>(rig, dev, null, at);
            Assert.Contains(H.B64(Fx.ArtA), h.LastSvg, "artwork bytes unchanged");
            Assert.DoesNotContain("mask=", h.LastSvg, "never masked or cropped");
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal("12:0", Assert.Single(rig.Sink!.Of(Wire.Op.MediaToggle)).Args["key"]!.GetValue<string>());
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Hold_enters_picture_in_picture_through_F24()
    {
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, a) => op switch
        {
            Wire.Op.MediaPip when a["via"] is null => CommandResult.Fail(Wire.Err.GestureRequired),
            Wire.Op.MediaPip => new CommandResult(true, new JsonObject { ["armed"] = true, ["key"] = "F24", ["expiresInMs"] = 3000 }),
            Wire.Op.TabFocus => new CommandResult(true, new JsonObject { ["focused"] = true }),
            _ => CommandResult.Success,
        };
        rig.Input.OnKey = vk =>
        {
            if (vk == VirtualKeys.F24) ((ISessionHost)rig.Hub).OnEvent(new BrowserEvent(Fx.ChromeKey, "pipChanged", new JsonObject { ["key"] = "12:0", ["ok"] = true }));
        };
        await using var h = await H.Key<MediaKeyAction>(rig, TestDevices.Galleon);
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        var pips = rig.Sink.Of(Wire.Op.MediaPip);
        Assert.Equal(2, pips.Count);
        Assert.Equal("gesture", pips[1].Args["via"]!.GetValue<string>());
        Assert.Equal(VirtualKeys.F24, Assert.Single(rig.Input.Keys));
        Assert.Single(rig.Sink.Of(Wire.Op.TabFocus), "the tab is raised before F24");
        Assert.Empty(rig.Sink.Of(Wire.Op.MediaToggle), "a hold is not a press");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task PiP_with_an_admin_window_in_front_sends_no_key()
    {
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, a) => op == Wire.Op.MediaPip ? CommandResult.Fail(Wire.Err.GestureRequired) : CommandResult.Success;
        rig.Input.Elevated = true;
        await using var h = await H.Key<MediaKeyAction>(rig, TestDevices.Plus);
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        Assert.Empty(rig.Input.Keys);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Site_needs_permission_press_to_allow_and_hold_mutes_with_zero_permissions()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with
        {
            Media = b.Media.Clear(),
            Tabs = b.Tabs.SetItem(14, b.Tabs[14] with { Audible = true, Access = "none", LastAccessed = 1_792_299_999_999 }),
        });
        rig.Sink!.Respond = (op, _) => op == Wire.Op.PermHostRequest ? new CommandResult(true, new JsonObject { ["via"] = "toolbar" }) : CommandResult.Success;
        foreach (var (dev, at) in H.KeyPlacements)
        {
            rig.Sink.Clear();
            await using var h = await H.Key<MediaKeyAction>(rig, dev, null, at);
            Assert.Contains(H.B64(Fx.FavAmber), h.LastSvg, "the site's favicon, as-is");
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal(14, Assert.Single(rig.Sink.Of(Wire.Op.PermHostRequest)).Args["tabId"]!.GetValue<int>());
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Equal(14, Assert.Single(rig.Sink.Of(Wire.Op.TabMute)).Args["tabId"]!.GetValue<int>());
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Browser_pages_that_cannot_be_scripted_still_mute_from_every_media_control()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with
        {
            Media = b.Media.Clear(),
            Tabs = b.Tabs.SetItem(12, b.Tabs[12] with { Access = "blocked" }),
        });
        await using var key = await H.Key<MediaKeyAction>(rig, TestDevices.Galleon);
        await key.PressAsync();
        await H.Done(key);
        Assert.Empty(rig.Sink!.Of(Wire.Op.PermHostRequest), "a blocked page is never offered the grant");
        Assert.Single(rig.Sink.Of(Wire.Op.TabMute));
        await using var scrub = await H.Dial<ScrubDialAction>(rig, TestDevices.Galleon, null, new(1, 0), "s");
        await scrub.DialPressAsync();
        await H.Done(scrub);
        Assert.Equal(2, rig.Sink.Of(Wire.Op.TabMute).Count);
        await using var speed = await H.Dial<SpeedDialAction>(rig, TestDevices.Plus, null, new(3, 0), "v");
        await speed.RotateAsync(-1);
        await H.Done(speed);
        Assert.True(rig.Sink.Of(Wire.Op.TabMute)[^1].Args["muted"]!.GetValue<bool>(), "turning down mutes");
        key.AssertFramesAreDeckSafe(); scrub.AssertFramesAreDeckSafe(); speed.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task With_no_extension_the_SMTC_lite_tier_is_shown_read_only()
    {
        await using var rig = Rig.Create(seedChrome: false);
        rig.Smtc.Set(new SmtcBrowserSession { AppId = "Chrome", Brand = "Chrome", Title = "Lo-fi Example Mix", Artist = "Example Channel", State = "playing", DurationMs = 3_600_000, PositionMs = 60_000, PositionAt = rig.Time.GetUtcNow(), Thumbnail = Fx.ArtB, ThumbnailHash = Fx.Hash(Fx.ArtB) });
        await using var key = await H.Key<MediaKeyAction>(rig, TestDevices.Galleon);
        Assert.Contains(H.B64(Fx.ArtB), key.LastSvg);
        await key.PressAsync();
        await key.PressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(key);
        await using var dial = await H.Dial<ScrubDialAction>(rig, TestDevices.Plus);
        await dial.RotateAsync(3);
        await dial.DialPressAsync();
        await H.Done(dial);
        Assert.Empty(rig.Sink!.Sent, "read-only: nothing is sent anywhere");
        key.AssertFramesAreDeckSafe();
        dial.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Scrub_dial_seeks_with_acceleration_and_push_plays()
    {
        foreach (var (dev, at) in H.DialPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Dial<ScrubDialAction>(rig, dev, new ScrubDialSettings(), at);
            await h.RotateAsync(3);
            await H.Done(h);
            Assert.Equal(15_000, rig.Sink!.Of(Wire.Op.MediaSeek)[0].Args["deltaMs"]!.GetValue<long>());
            if (dev.IsGalleon)
            {
                await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
                await h.RotateAsync(12);   // a fast spin: 12 ticks × 2 × 5 s
                await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
                await H.Done(h);
                Assert.Equal(120_000, rig.Sink.Of(Wire.Op.MediaSeek)[^1].Args["deltaMs"]!.GetValue<long>());
            }
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.MediaToggle));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Scrub_ticks_inside_one_50_ms_slot_are_summed_not_dropped()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Dial<ScrubDialAction>(rig, TestDevices.Plus);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(60));
        await H.Done(h);
        var seeks = rig.Sink!.Of(Wire.Op.MediaSeek);
        Assert.Equal(15_000, seeks.Sum(s => s.Args["deltaMs"]!.GetValue<long>()));
        Assert.Equal(2, seeks.Count, "the first goes out at once, the rest coalesce into one");
    }

    [Test]
    public async Task Scrub_plus_extras_tap_pip_and_hold_next()
    {
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, a) => op == Wire.Op.MediaPip ? new CommandResult(true, new JsonObject { ["pip"] = true }) : CommandResult.Success;
        await using var h = await H.Dial<ScrubDialAction>(rig, TestDevices.Plus);
        await h.TapAsync(50, 50);
        await H.Done(h);
        Assert.Single(rig.Sink.Of(Wire.Op.MediaPip));
        await h.TapAsync(50, 50, hold: true);
        await H.Done(h);
        Assert.Equal("nexttrack", Assert.Single(rig.Sink.Of(Wire.Op.MediaAction)).Args["action"]!.GetValue<string>());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Skip_mode_turns_once_per_burst()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Dial<ScrubDialAction>(rig, TestDevices.Galleon, new ScrubDialSettings { Rotate = "skip" });
        await h.RotateAsync(12);
        await h.RotateAsync(12);
        await H.Done(h);
        Assert.Single(rig.Sink!.Of(Wire.Op.MediaAction));
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        await h.RotateAsync(-2);
        await H.Done(h);
        Assert.Equal("previoustrack", rig.Sink.Of(Wire.Op.MediaAction)[^1].Args["action"]!.GetValue<string>());
    }

    [Test]
    public async Task Speed_dial_walks_the_ladder_push_switches_to_volume_and_mute_below_zero()
    {
        foreach (var (dev, at) in H.DialPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Dial<SpeedDialAction>(rig, dev, new SpeedDialSettings(), at);
            await h.RotateAsync(1);
            await H.Done(h);
            Assert.Equal(1.25, rig.Sink!.Of(Wire.Op.MediaRate)[^1].Args["rate"]!.GetValue<double>());
            if (dev.IsGalleon)
            {
                await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
                await h.RotateAsync(8);   // fast: two steps
                await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
                await H.Done(h);
                Assert.Equal(1.75, rig.Sink.Of(Wire.Op.MediaRate)[^1].Args["rate"]!.GetValue<double>());
            }
            await h.DialPressAsync();
            Assert.True(h.Action.VolumeMode);
            await h.RotateAsync(-2);
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
            await H.Done(h);
            Assert.Equal(0.7, rig.Sink.Of(Wire.Op.MediaVolume)[^1].Args["volume"]!.GetValue<double>(), "0.8 − 2 × 5 %");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Speed_dial_turning_below_zero_mutes_the_tab_and_plus_extras_reset_and_mute()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with { Media = b.Media.SetItem("12:0", b.Media["12:0"] with { Volume = 0 }) });
        await using var h = await H.Dial<SpeedDialAction>(rig, TestDevices.Plus, new SpeedDialSettings { Start = "volume" });
        await h.RotateAsync(-1);
        await H.Done(h);
        Assert.True(Assert.Single(rig.Sink!.Of(Wire.Op.TabMute)).Args["muted"]!.GetValue<bool>());
        await h.TapAsync(10, 10);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(60));   // inside the 50 ms stream slot: latest-wins on the next tick
        await H.Done(h);
        Assert.Equal(0.5, rig.Sink.Of(Wire.Op.MediaVolume)[^1].Args["volume"]!.GetValue<double>());
        await h.DialPressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        Assert.Equal(2, rig.Sink.Of(Wire.Op.TabMute).Count);
        h.AssertFramesAreDeckSafe();
    }
}
