using System.Collections.Immutable;
using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

public class PageActionTests
{
    [Test]
    public async Task Page_dial_scrolls_accumulated_then_zooms_along_the_ladder()
    {
        foreach (var (dev, at) in H.DialPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Dial<PageDialAction>(rig, dev, new PageDialSettings(), at);
            await h.RotateAsync(2);
            await h.RotateAsync(2);
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(60));
            await H.Done(h);
            var scrolls = rig.Sink!.Of(Wire.Op.PageScroll);
            Assert.Equal(4L * 48, scrolls.Sum(s => WireParser.Long(s.Args, "dy") ?? 0), "every tick lands");
            Assert.Equal(12, scrolls[0].Args["tabId"]!.GetValue<int>(), "the active tab");
            await h.DialPressAsync();
            Assert.True(h.Action.ZoomMode);
            await h.RotateAsync(1);
            await H.Done(h);
            // MED 5: the plugin does not know the tab's zoom, so it sends a relative ladder step (the extension reads tabs.getZoom).
            var zoom = rig.Sink.Of(Wire.Op.PageZoom)[^1].Args;
            Assert.Equal(1, zoom["step"]!.GetValue<int>());
            Assert.True(zoom["factor"] is null, "never an absolute factor computed from an unknown zoom");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Zoom_steps_accumulate_and_a_tab_at_150_percent_zooms_in_not_out()
    {
        // R2 regression: a tab really at 150 % (the extension knows; we don't) must go UP on a zoom-in turn.
        await using var rig = Rig.Create();
        var actual = 1.5;
        rig.Sink!.Respond = (op, args) =>
        {
            if (op != Wire.Op.PageZoom) return CommandResult.Success;
            actual = args["step"] is { } s ? Selectors.LadderStep(Wire.ZoomLadder, actual, s.GetValue<int>()) : args["factor"]!.GetValue<double>();
            return new CommandResult(true, new JsonObject { ["factor"] = actual });
        };
        await using var h = await H.Dial<PageDialAction>(rig, TestDevices.Galleon, new PageDialSettings { Start = "zoom" });
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(60));
        await H.Done(h);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(60));
        await H.Done(h);
        var sent = rig.Sink.Of(Wire.Op.PageZoom);
        Assert.Equal(3, sent.Sum(s => s.Args["step"]!.GetValue<int>()), "every tick lands as a step, accumulated");
        Assert.Equal(2.5, actual, "150 % + 3 steps on the ladder (175, 200, 250) = 250 %");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Page_dial_on_a_page_without_a_script_falls_back_to_arrow_keys()
    {
        // HIGH 3 (plugin side): an older extension answers not_found for a granted page without media.
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, _) => op == Wire.Op.PageScroll ? CommandResult.Fail(Wire.Err.NotFound) : CommandResult.Success;
        rig.Foreground.Foreground = 0x2001;
        await using var h = await H.Dial<PageDialAction>(rig, TestDevices.Galleon);
        await h.RotateAsync(1);
        await H.Done(h);
        await h.RotateAsync(2);
        await H.Done(h);
        Assert.Equal(2, rig.Input.Keys.Count(k => k == 0x28), "the next turn scrolls with arrow keys instead of saying \"It's gone\"");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Page_dial_without_site_permission_falls_back_to_arrow_keys_only_when_the_browser_is_in_front()
    {
        await using var rig = Rig.Create();
        rig.Sink!.Respond = (op, _) => op == Wire.Op.PageScroll ? CommandResult.Fail(Wire.Err.NoHostPermission) : CommandResult.Success;
        await using var h = await H.Dial<PageDialAction>(rig, TestDevices.Galleon);
        await h.RotateAsync(2);
        await H.Done(h);
        rig.Foreground.Foreground = 0x2001;   // a frame of the browser (pid 4242)
        await h.RotateAsync(3);
        await H.Done(h);
        Assert.Equal(3, rig.Input.Keys.Count(k => k == 0x28), "three arrow-down presses");
        rig.Foreground.Foreground = 0x9999;   // another app in front: never type into it
        await h.RotateAsync(3);
        await H.Done(h);
        Assert.Equal(3, rig.Input.Keys.Count);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Page_plus_extras_reset_zoom_and_scroll_to_top()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Dial<PageDialAction>(rig, TestDevices.Plus);
        await h.TapAsync(10, 10);
        await H.Done(h);
        Assert.True(rig.Sink!.Of(Wire.Op.PageZoom)[^1].Args["reset"]!.GetValue<bool>());
        await h.DialPressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        Assert.Equal((long)-Wire.Limits.ScrollMax, WireParser.Long(rig.Sink.Of(Wire.Op.PageScroll)[^1].Args, "dy"));
    }

    [Test]
    public async Task Nav_keys_back_forward_reload_and_hard_reload()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var back = await H.Key<NavKeyAction>(rig, dev, new NavKeySettings { Command = "back" }, at);
            await using var fwd = await H.Key<NavKeyAction>(rig, dev, new NavKeySettings { Command = "forward" }, at, "c2");
            await using var reload = await H.Key<NavKeyAction>(rig, dev, new NavKeySettings { Command = "reload" }, at, "c3");
            // Each press sends its command off the mailbox (thread pool), so two presses microseconds apart (only a test does
            // that) can arrive in either order: wait for each one's command before the next press when the order is asserted.
            await back.PressAsync(); await H.Done(back);
            await fwd.PressAsync(); await H.Done(fwd);
            await reload.PressAsync(); await H.Done(reload);
            await reload.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(reload);
            Assert.Equal(12, Assert.Single(rig.Sink!.Of(Wire.Op.TabBack)).Args["tabId"]!.GetValue<int>());
            Assert.Single(rig.Sink.Of(Wire.Op.TabForward));
            var reloads = rig.Sink.Of(Wire.Op.TabReload);
            Assert.Equal(2, reloads.Count);
            Assert.False(reloads[0].Args["bypassCache"]!.GetValue<bool>());
            Assert.True(reloads[1].Args["bypassCache"]!.GetValue<bool>());
            back.AssertFramesAreDeckSafe(); fwd.AssertFramesAreDeckSafe(); reload.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Reopen_restores_or_asks_for_the_permission()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Key<ReopenKeyAction>(rig, TestDevices.Galleon);
        await h.PressAsync();
        await H.Done(h);
        Assert.Single(rig.Sink!.Of(Wire.Op.SessionRestore));
        rig.Update(b => b with { Caps = b.Caps with { Sessions = false } });
        await h.SettleAsync();
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal(Wire.OptionsSection.Features, Assert.Single(rig.Sink.Of(Wire.Op.PermOpenOptions)).Args["section"]!.GetValue<string>());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Group_key_collapses_and_hold_focuses_its_first_tab()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<GroupKeyAction>(rig, dev, new GroupKeySettings { Index = 1 }, at);
            await h.PressAsync();
            await H.Done(h);
            var u = Assert.Single(rig.Sink!.Of(Wire.Op.GroupUpdate));
            Assert.Equal(7, u.Args["groupId"]!.GetValue<int>());
            Assert.True(u.Args["collapsed"]!.GetValue<bool>());
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Equal(12, Assert.Single(rig.Sink.Of(Wire.Op.TabFocus)).Args["tabId"]!.GetValue<int>());
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Split_key_splits_with_the_previous_tab_and_unsplits()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Key<SplitKeyAction>(rig, TestDevices.Plus);
        await h.PressAsync();
        await H.Done(h);
        var ids = Assert.Single(rig.Sink!.Of(Wire.Op.SplitCreate)).Args["tabIds"]!.AsArray();
        Assert.Equal(12, ids[1]!.GetValue<int>(), "the active tab second");
        rig.Update(b => b with { Tabs = b.Tabs.SetItem(12, b.Tabs[12] with { Split = 31 }) });
        await h.SettleAsync();
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal(31, Assert.Single(rig.Sink.Of(Wire.Op.SplitRemove)).Args["splitViewId"]!.GetValue<int>());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Site_watch_shows_the_count_presses_focus_holds_reload_and_opens_when_closed()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<SiteKeyAction>(rig, dev, new SiteKeySettings { Site = "mail.example" }, at);
            Assert.Contains(H.B64(Fx.FavRed), h.LastSvg);
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal(11, Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus)).Args["tabId"]!.GetValue<int>());
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.TabReload));
            h.AssertFramesAreDeckSafe();
        }
        await using var rig2 = Rig.Create();
        await using var closed = await H.Key<SiteKeyAction>(rig2, TestDevices.Galleon, new SiteKeySettings { Site = "chat.example" });
        await closed.PressAsync();
        await H.Done(closed);
        Assert.Equal("https://chat.example/", Assert.Single(rig2.Sink!.Of(Wire.Op.TabCreate)).Args["url"]!.GetValue<string>());
    }
}

public class MiscActionTests
{
    [Test]
    public async Task Download_ring_shows_progress_press_shows_hold_pauses()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<DownloadKeyAction>(rig, dev, null, at);
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal(501, Assert.Single(rig.Sink!.Of(Wire.Op.DownloadShow)).Args["id"]!.GetValue<int>());
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.DownloadPause));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Opening_a_finished_program_needs_a_second_press_and_dangerous_files_never_open()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-browser-dl", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        var exe = Path.Combine(dir, "example-setup.exe");
        File.WriteAllText(exe, "fixture");
        try
        {
            await using var rig = Rig.Create();
            rig.Update(b => b with { Downloads = ImmutableDictionary<int, DownloadItem>.Empty.Add(601, new DownloadItem { Id = 601, State = "complete", Name = "example-setup.exe", Bytes = 10, Total = 10 }) });
            rig.Sink!.Respond = (op, _) => op == Wire.Op.DownloadPath ? new CommandResult(true, new JsonObject { ["id"] = 601, ["path"] = exe, ["state"] = "complete", ["exists"] = true, ["danger"] = "safe" }) : CommandResult.Success;
            await using var h = await H.Key<DownloadKeyAction>(rig, TestDevices.Galleon);
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Empty(rig.Shell.Opened, "a program needs a second press");
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal("open " + exe, Assert.Single(rig.Shell.Opened));

            rig.Update(b => b with { Downloads = b.Downloads.SetItem(601, b.Downloads[601] with { Danger = "uncommon" }) });
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Single(rig.Shell.Opened, "Chrome's danger verdict blocks it");
            h.AssertFramesAreDeckSafe();
        }
        finally { Directory.Delete(dir, true); }
    }

    [Test]
    public async Task Download_ring_without_the_permission_opens_the_options()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with { Caps = b.Caps with { Downloads = false } });
        await using var h = await H.Key<DownloadKeyAction>(rig, TestDevices.Plus);
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal("features", Assert.Single(rig.Sink!.Of(Wire.Op.PermOpenOptions)).Args["section"]!.GetValue<string>());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Streamer_safe_key_toggles_domain_and_hold_hides_everything()
    {
        foreach (var (dev, at) in H.KeyPlacements)
        {
            await using var rig = Rig.Create();
            await using var h = await H.Key<PrivacyKeyAction>(rig, dev, new PrivacyKeySettings(), at);
            var off = h.LastSvg;
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal("domain", rig.Store.Current.RequestedPrivacy);
            Assert.Equal("domain", h.GlobalSettings.GetSection<BrowserGlobalSettings>("browser").Privacy, "kept in the global section");
            await SessionRig.WaitAsync(() => rig.Sink!.Of(Wire.Op.PrivacySet).Count > 0);
            Assert.Null(rig.Store.Current.Find(Fx.ChromeKey)!.Tabs[12].Title, "titles drop at once");
            Assert.NotEqual(off, h.LastSvg);
            await h.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Equal("hidden", rig.Store.Current.RequestedPrivacy);
            await h.PressAsync();
            await H.Done(h);
            Assert.Equal("full", rig.Store.Current.RequestedPrivacy);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Panic_mutes_hides_and_a_second_press_ends_it()
    {
        await using var rig = Rig.Create();
        await using var h = await H.Key<PanicKeyAction>(rig, TestDevices.Galleon);
        await h.PressAsync();
        await H.Done(h);
        Assert.Single(rig.Sink!.Of(Wire.Op.Panic));
        Assert.True(rig.Store.Current.Panic);
        Assert.Equal("hidden", rig.Store.Current.RequestedPrivacy);
        await h.PressAsync();
        await H.Done(h);
        Assert.False(rig.Store.Current.Panic);
        Assert.Equal("full", rig.Store.Current.RequestedPrivacy);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Meeting_keys_toggle_mic_and_camera_and_hang_up_needs_a_hold()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with
        {
            Media = b.Media.SetItem("21:0", new MediaItem { Key = "21:0", TabId = 21, Kind = "session-only", State = "playing", Mic = true, Camera = false, Actions = ["togglemicrophone", "togglecamera", "hangup"], Seen = 99 }),
        });
        foreach (var (dev, at) in H.KeyPlacements)
        {
            rig.Sink!.Clear();
            await using var mic = await H.Key<MeetKeyAction>(rig, dev, new MeetKeySettings { Control = "mic" }, at);
            await using var cam = await H.Key<MeetKeyAction>(rig, dev, new MeetKeySettings { Control = "camera" }, at, "c2");
            await using var end = await H.Key<MeetKeyAction>(rig, dev, new MeetKeySettings { Control = "hangup" }, at, "c3");
            // One key's command at a time: each is sent off the mailbox, so back-to-back presses could arrive in either order.
            await mic.PressAsync(); await H.Done(mic);
            await cam.PressAsync(); await H.Done(cam);
            await end.PressAsync(); await H.Done(end);
            var actions = rig.Sink.Of(Wire.Op.MediaAction).Select(x => x.Args["action"]!.GetValue<string>()).ToList();
            Assert.Equal("togglemicrophone,togglecamera", string.Join(",", actions), "a press never hangs up");
            await end.PressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(end);
            Assert.Equal("hangup", rig.Sink.Of(Wire.Op.MediaAction)[^1].Args["action"]!.GetValue<string>());
            mic.AssertFramesAreDeckSafe(); cam.AssertFramesAreDeckSafe(); end.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Preview_widget_subscribes_while_visible_switches_windows_and_unsubscribes()
    {
        foreach (var (dev, at) in H.DialPlacements)
        {
            await using var rig = Rig.Create(caps: new BrowserCaps { Tabs = true, AllUrls = true, Split = true });
            await using var h = await H.Dial<PreviewDialAction>(rig, dev, null, at);
            await H.Done(h);
            var sub = Assert.Single(rig.Sink!.Of(Wire.Op.PreviewSubscribe));
            Assert.Equal(1, sub.Args["windowId"]!.GetValue<int>());
            Assert.Equal(2, sub.Args["fps"]!.GetValue<int>());
            rig.Hub.Previews.Put(Fx.ChromeKey, 1, Fx.Stored("preview:1", Fx.PreviewFrame()), rig.Store.NowMs);
            rig.Store.Touch(BrowserChange.Preview, Fx.ChromeKey);
            await h.SettleAsync();
            Assert.Contains(H.B64(Fx.PreviewFrame()), h.FeedbackSvg(Core.Layouts.Layouts.Canvas.Frame));
            await h.AdvanceAsync(TimeSpan.FromSeconds(21));
            await H.Done(h);
            Assert.True(rig.Sink.Of(Wire.Op.PreviewSubscribe).Count >= 2, "renewed before the 30 s expiry");
            await h.RotateAsync(1);
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(600));
            await H.Done(h);
            var subs = rig.Sink.Of(Wire.Op.PreviewSubscribe);
            Assert.True(subs.Any(s => s.Args["windowId"]!.GetValue<int>() == 2 && s.Args["fps"]!.GetValue<int>() == 2));
            Assert.True(subs.Any(s => s.Args["windowId"]!.GetValue<int>() == 1 && s.Args["fps"]!.GetValue<int>() == 0), "the old window is released");
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Equal(21, rig.Sink.Of(Wire.Op.TabFocus)[^1].Args["tabId"]!.GetValue<int>());
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Preview_is_off_while_streamer_safe_and_asks_for_the_permission_without_all_sites()
    {
        await using var rig = Rig.Create(privacy: "domain", caps: new BrowserCaps { Tabs = true, AllUrls = true });
        await using var h = await H.Dial<PreviewDialAction>(rig, TestDevices.Galleon);
        await H.Done(h);
        Assert.Empty(rig.Sink!.Of(Wire.Op.PreviewSubscribe), "never captured while streamer-safe");
        h.AssertFramesAreDeckSafe();
        await using var rig2 = Rig.Create(caps: new BrowserCaps { Tabs = true, AllUrls = false });
        await using var h2 = await H.Dial<PreviewDialAction>(rig2, TestDevices.Plus);
        await h2.DialPressAsync();
        await H.Done(h2);
        Assert.Single(rig2.Sink!.Of(Wire.Op.PermOpenOptions));
        h2.AssertFramesAreDeckSafe();
    }
}
