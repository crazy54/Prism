using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>
/// Safe mode on every write path (authoring-actions.md § Safe mode): browser commands, foreground changes, keystrokes
/// (F24, arrow keys), file opens and HostInstaller. Reads stay real; the safe sink updates the in-memory state so the
/// keys still respond, and logs one line per command without titles or URLs.
/// </summary>
public class SafeModeTests
{
    [Test]
    public async Task Every_key_press_in_safe_mode_reaches_only_the_logging_sink()
    {
        await using var rig = Rig.Create(safeMode: true, caps: new Protocol.BrowserCaps { Tabs = true, Downloads = true, TabGroups = true, Sessions = true, AllUrls = true, Split = true });
        var sink = rig.SafeSink!;
        Assert.True(sink.IsSafeMode);
        var g = TestDevices.Galleon;
        await using var tab = await H.Key<TabKeyAction>(rig, g, new TabKeySettings { Index = 3 }, null, "k1");
        await using var media = await H.Key<MediaKeyAction>(rig, g, null, null, "k2");
        await using var nav = await H.Key<NavKeyAction>(rig, g, new NavKeySettings { Command = "reload" }, null, "k3");
        await using var reopen = await H.Key<ReopenKeyAction>(rig, g, null, null, "k4");
        await using var group = await H.Key<GroupKeyAction>(rig, g, null, null, "k5");
        await using var split = await H.Key<SplitKeyAction>(rig, g, null, null, "k6");
        await using var site = await H.Key<SiteKeyAction>(rig, g, new SiteKeySettings { Site = "mail.example" }, null, "k7");
        await using var dl = await H.Key<DownloadKeyAction>(rig, g, null, null, "k8");
        await using var panic = await H.Key<PanicKeyAction>(rig, g, null, null, "k9");

        await tab.PressAsync(); await H.Done(tab);
        Assert.True(rig.Store.Current.Find(Fx.ChromeKey)!.Tabs[13].Active, "the fake write updated the model: the tab is active now");
        await tab.PressAsync(TimeSpan.FromMilliseconds(700)); await H.Done(tab);
        Assert.False(rig.Store.Current.Find(Fx.ChromeKey)!.Tabs.ContainsKey(13), "fake close");
        await tab.PressAsync(); await H.Done(tab);
        Assert.True(rig.Store.Current.Find(Fx.ChromeKey)!.Tabs.ContainsKey(13), "fake undo");

        await media.PressAsync(); await H.Done(media);
        Assert.Equal("paused", rig.Store.Current.Find(Fx.ChromeKey)!.Media["12:0"].State);
        await media.PressAsync(TimeSpan.FromMilliseconds(700)); await H.Done(media);   // PiP
        await nav.PressAsync(); await nav.PressAsync(TimeSpan.FromMilliseconds(700)); await H.Done(nav);
        await reopen.PressAsync(); await H.Done(reopen);
        await group.PressAsync(); await H.Done(group);
        Assert.True(rig.Store.Current.Find(Fx.ChromeKey)!.Groups[7].Collapsed);
        await split.PressAsync(); await H.Done(split);
        await site.PressAsync(); await H.Done(site);
        await dl.PressAsync(); await dl.PressAsync(TimeSpan.FromMilliseconds(700)); await H.Done(dl);
        await panic.PressAsync(); await H.Done(panic);

        Assert.True(sink.Suppressed.Count >= 12, "every command was suppressed: " + sink.Suppressed.Count);
        foreach (var op in new[] { Wire.Op.TabFocus, Wire.Op.TabClose, Wire.Op.SessionRestore, Wire.Op.MediaToggle, Wire.Op.MediaPip, Wire.Op.TabReload, Wire.Op.GroupUpdate, Wire.Op.SplitCreate, Wire.Op.DownloadShow, Wire.Op.DownloadPause, Wire.Op.Panic })
            Assert.True(sink.Count(op) >= 1, op + " went to the safe sink");
        Assert.Empty(rig.Foreground.Grants, "no foreground grant");
        Assert.Empty(rig.Foreground.Raises, "no raise");
        Assert.Empty(rig.Input.Keys, "no F24, no keystroke");
        Assert.Empty(rig.Shell.Opened, "nothing opened");
        Assert.Contains("[safe mode] would send tab.focus (tabId=13, raise=true)", rig.Log.All);
        foreach (var secret in new[] { "Example Mail", "Night Drive", "https://", "Quarterly" }) Assert.DoesNotContain(secret, rig.Log.All);
        tab.AssertFramesAreDeckSafe();
        media.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Every_dial_turn_and_push_in_safe_mode_reaches_only_the_logging_sink()
    {
        await using var rig = Rig.Create(safeMode: true, caps: new Protocol.BrowserCaps { Tabs = true, AllUrls = true });
        var p = TestDevices.Plus;
        await using var tabs = await H.Dial<TabsDialAction>(rig, p, null, new(0, 0), "d1");
        await using var scrub = await H.Dial<ScrubDialAction>(rig, p, null, new(1, 0), "d2");
        await using var speed = await H.Dial<SpeedDialAction>(rig, p, null, new(2, 0), "d3");
        await using var page = await H.Dial<PageDialAction>(rig, p, null, new(3, 0), "d4");
        await using var preview = await H.Dial<PreviewDialAction>(rig, TestDevices.Galleon, null, new(1, 1), "d5");
        await tabs.RotateAsync(1); await tabs.DialPressAsync(); await tabs.TapAsync(10, 10, hold: true); await H.Done(tabs);
        await scrub.RotateAsync(2); await scrub.DialPressAsync(); await scrub.TapAsync(10, 10); await H.Done(scrub);
        await speed.RotateAsync(1); await speed.DialPressAsync(); await speed.RotateAsync(-1); await speed.DialPressAsync(TimeSpan.FromMilliseconds(700)); await H.Done(speed);
        await page.RotateAsync(3); await page.DialPressAsync(); await page.RotateAsync(1); await H.Done(page);
        await preview.DialPressAsync(); await H.Done(preview);
        var sink = rig.SafeSink!;
        foreach (var op in new[] { Wire.Op.TabFocus, Wire.Op.TabClose, Wire.Op.MediaSeek, Wire.Op.MediaToggle, Wire.Op.MediaPip, Wire.Op.MediaRate, Wire.Op.MediaVolume, Wire.Op.TabMute, Wire.Op.PageScroll, Wire.Op.PageZoom, Wire.Op.PreviewSubscribe })
            Assert.True(sink.Count(op) >= 1, op + " went to the safe sink");
        Assert.Empty(rig.Foreground.Grants);
        Assert.Empty(rig.Input.Keys);
        Assert.Equal(1.25, rig.Store.Current.Find(Fx.ChromeKey)!.Media["12:0"].Rate, "the fake rate stuck, so the dial shows it");
        tabs.AssertFramesAreDeckSafe(); scrub.AssertFramesAreDeckSafe(); speed.AssertFramesAreDeckSafe(); page.AssertFramesAreDeckSafe(); preview.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Safe_mode_ports_never_grant_raise_type_or_open()
    {
        var fg = new SafeModeForeground();
        Assert.False(await fg.GrantForegroundAsync(4242));
        Assert.Equal(RaiseResult.SafeMode, await fg.BringToFrontAsync(0x1234));
        var input = new SafeModeInput();
        Assert.False(await input.SendKeyAsync(VirtualKeys.F24));
        Assert.Equal(VirtualKeys.F24, Assert.Single(input.Keys));
        var shell = new SafeModeShell();
        Assert.False(shell.Open(@"C:\Users\Example\Downloads\example.exe"));
        var relay = new SafeModeRelay(@"C:\Users\Example\AppData\Roaming\Prism\control\relay\prism-relay.exe");
        Assert.Equal(relay.ExpectedPath, await relay.EnsureAsync());
    }

    [Test]
    public async Task Hub_flows_report_safe_mode_instead_of_acting()
    {
        await using var rig = Rig.Create(safeMode: true);
        Assert.Equal(FocusOutcome.SafeMode, await rig.Hub.FocusTabAsync(Fx.ChromeKey, 12, raise: true));
        var media = rig.Store.Current.Find(Fx.ChromeKey)!.Media["12:0"];
        Assert.Equal(PipOutcome.SafeMode, await rig.Hub.TogglePipAsync(Fx.ChromeKey, media));
        var dl = new Protocol.DownloadItem { Id = 1, State = "complete", Danger = "safe", Name = "a.zip" };
        Assert.Equal(OpenOutcome.SafeMode, await rig.Hub.OpenDownloadAsync(Fx.ChromeKey, dl, confirmed: true));
        rig.Foreground.Foreground = 0x2001;   // the browser is in front: arrow keys would be sent outside safe mode
        Assert.True(await rig.Hub.ScrollWithKeysAsync(Fx.ChromeKey, 2));
        Assert.Empty(rig.Input.Keys, "even with a live input port, safe mode sends no keys");
        Assert.Empty(rig.Foreground.Grants);
        Assert.Empty(rig.Shell.Opened);
    }

    [Test]
    public async Task Safe_mode_HostInstaller_and_the_PI_write_nothing()
    {
        await using var rig = Rig.Create(safeMode: true, withInstaller: true);
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Galleon);
        var plan = await h.PiMessageAsync("browser.connect.plan", null, requestId: 1);
        Assert.True(plan!["data"]!["safeMode"]!.GetValue<bool>());
        var apply = await h.PiMessageAsync("browser.connect.apply", new { planId = plan["data"]!["planId"]!.GetValue<string>(), consent = true }, requestId: 2);
        Assert.False(apply!["data"]!["ok"]!.GetValue<bool>());
        Assert.False(Directory.Exists(Path.Combine(rig.TempDir!, "modules")), "no file was written");
        var open = await h.PiMessageAsync("browser.openExtensionFolder", null, requestId: 3);
        Assert.False(open!["data"]!["ok"]!.GetValue<bool>());
        var state = await h.PiMessageAsync("browser.status", null, requestId: 4);
        Assert.True(state!["data"]!["safeMode"]!.GetValue<bool>());
        Assert.Contains("safe mode", state["data"]!["detail"]!.GetValue<string>());
    }
}
