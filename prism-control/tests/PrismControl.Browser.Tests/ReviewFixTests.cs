using System.Net;
using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Install;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>Regressions for the browser review (aaa-prism-play/review-browser/REPORT.md); each name says the finding.</summary>
public class ReviewFixTests
{
    // ------------------------------------------------------------------ HIGH 2: Site Watch and sub-domains

    private static JsonObject ChatTab(bool withHost, string? url = "https://app.chat.example/c/1", string? title = "(5) Team Chat") => new()
    {
        ["id"] = 31, ["win"] = 1, ["idx"] = 4, ["active"] = false, ["title"] = title, ["url"] = url,
        ["domain"] = "chat.example", ["host"] = withHost ? "app.chat.example" : null, ["unread"] = 5, ["icon"] = "glyph:globe", ["access"] = "none",
    };

    [Test]
    public async Task High2_site_watch_matches_a_subdomain_site_by_host_and_focuses_it_instead_of_opening_a_duplicate()
    {
        await using var rig = Rig.Create();
        rig.Update(b => b with { Tabs = b.Tabs.SetItem(31, WireParser.MergeTab(null, ChatTab(withHost: true))!) });
        var b0 = rig.Store.Current.Find(Fx.ChromeKey)!;
        Assert.Equal(31, Selectors.SiteTab(b0, "app.chat.example", null)?.Id, "Tab.host matches the setting");
        Assert.Null(Selectors.SiteTab(b0, "other.chat.example", null), "a sibling sub-domain is not this site");
        await using var h = await H.Key<SiteKeyAction>(rig, TestDevices.Galleon, new SiteKeySettings { Site = "app.chat.example" });
        await h.PressAsync();
        await H.Done(h);
        Assert.Equal(31, Assert.Single(rig.Sink!.Of(Wire.Op.TabFocus)).Args["tabId"]!.GetValue<int>());
        Assert.Empty(rig.Sink.Of(Wire.Op.TabCreate), "no duplicate tab");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public void High2_an_older_extension_without_host_matches_through_the_url_and_domain_level_through_the_registrable_domain()
    {
        var b = Fx.Instance();
        var old = b with { Tabs = b.Tabs.SetItem(31, WireParser.MergeTab(null, ChatTab(withHost: false))!) };
        Assert.Equal(31, Selectors.SiteTab(old, "app.chat.example", null)?.Id, "the URL's host at level full");
        // Streamer-safe "domain": no title, URL or host; the registrable domain still finds the tab, and the tab matched
        // before is preferred.
        var domainTab = PrivacyFilter.Apply(WireParser.MergeTab(null, ChatTab(withHost: true))!, Wire.Privacy.Domain);
        Assert.Null(domainTab.Host);
        Assert.Null(domainTab.Url);
        var atDomain = b with { Tabs = b.Tabs.SetItem(31, domainTab).SetItem(32, domainTab with { Id = 32, Unread = 9 }) };
        Assert.Equal(32, Selectors.SiteTab(atDomain, "app.chat.example", null)?.Id, "most unread first");
        Assert.Equal(31, Selectors.SiteTab(atDomain, "app.chat.example", 31)?.Id, "the tab matched before wins");
    }

    // ------------------------------------------------------------------ R3 / LOW 13: the focus fallback

    private static BrowserInstance TwoMaximized(int focused)
    {
        var b = Fx.Instance();
        var w1 = b.Windows[1] with { Left = 0, Top = 0, Width = 1280, Height = 800, Focused = focused == 1 };
        var w2 = b.Windows[2] with { Left = 0, Top = 0, Width = 1280, Height = 800, Focused = focused == 2 };
        return b with { Windows = b.Windows.SetItem(1, w1).SetItem(2, w2), FocusedWindowId = focused, LastFocusedWindowId = focused };
    }

    [Test]
    public void R3_two_maximized_windows_are_told_apart_by_activation_order_and_by_title()
    {
        TopWindow[] frames = [new(0x3001, 4242, 0, 0, 1280, 800, false, false), new(0x3002, 4242, 0, 0, 1280, 800, false, false)];
        var b = TwoMaximized(focused: 1);
        Assert.Equal((nint)0x3002, BrowserHub.PickFrame(b, 2, new(0, 0, 1280, 800), null, frames), "window 1 is in front (focused last), so window 2 is the second frame");
        Assert.Equal((nint)0x3001, BrowserHub.PickFrame(b, 1, new(0, 0, 1280, 800), null, frames));
        TopWindow[] titled = [frames[0] with { Title = "Other Page - Example Browser" }, frames[1] with { Title = "Recipes for Rainy Days - Example Browser" }];
        Assert.Equal((nint)0x3002, BrowserHub.PickFrame(TwoMaximized(2), 2, new(0, 0, 1280, 800), "Recipes for Rainy Days", titled), "the title decides first (level full)");
    }

    [Test]
    public void Low13_chrome_dip_bounds_match_physical_frames_at_150_percent_scaling()
    {
        // Chrome reports DIPs; DWM physical pixels. At 150 % a 1280×800 DIP window at (100,100) is 1920×1200 at (150,150).
        TopWindow[] frames = [new(0x4001, 4242, 0, 0, 1280, 800, false, false), new(0x4002, 4242, 150, 150, 1920, 1200, false, false)];
        Assert.Equal((nint)0x4002, BrowserHub.PickFrame(Fx.Instance(), 2, new(100, 100, 1280, 800), null, frames));
    }

    [Test]
    public async Task R3_the_hub_raises_the_frame_of_the_tabs_own_window()
    {
        await using var rig = Rig.Create();
        rig.Windows.Windows.Clear();
        rig.Windows.Windows.Add(new TopWindow(0x3001, 4242, 0, 0, 1280, 800, false, false));
        rig.Windows.Windows.Add(new TopWindow(0x3002, 4242, 0, 0, 1280, 800, false, false));
        rig.Update(b => TwoMaximized(1) with { Tabs = b.Tabs });
        rig.Sink!.Respond = (op, _) => op == Wire.Op.TabFocus
            ? new CommandResult(true, new JsonObject { ["focused"] = false, ["bounds"] = new JsonObject { ["left"] = 0, ["top"] = 0, ["width"] = 1280, ["height"] = 800 } })
            : CommandResult.Success;
        await rig.Hub.FocusTabAsync(Fx.ChromeKey, 21, raise: true);   // tab 21 is in window 2
        Assert.Equal((nint)0x3002, Assert.Single(rig.Foreground.Raises));
    }

    // ------------------------------------------------------------------ MED 6: the PiP key

    private static async Task<(Rig Rig, MediaItem Media)> PipRig()
    {
        var rig = Rig.Create();
        rig.Sink!.Respond = (op, args) => op switch
        {
            Wire.Op.MediaPip when args["via"] is null => CommandResult.Fail(Wire.Err.GestureRequired),
            Wire.Op.MediaPip => new CommandResult(true, new JsonObject { ["armed"] = true, ["key"] = args["pipKey"]?.GetValue<string>() ?? "F24", ["expiresInMs"] = 3000 }),
            Wire.Op.TabFocus => new CommandResult(true, new JsonObject { ["focused"] = true }),
            _ => CommandResult.Success,
        };
        await Task.CompletedTask;
        return (rig, rig.Store.Current.Find(Fx.ChromeKey)!.Media["12:0"]);
    }

    [Test]
    public async Task Med6_a_pip_key_another_app_registered_is_never_pressed()
    {
        var (rig, media) = await PipRig();
        await using var _ = rig;
        rig.Input.FreeKeys = k => k != 0x87;   // F24 is someone's global hotkey
        Assert.Equal(PipOutcome.KeyInUse, await rig.Hub.TogglePipAsync(Fx.ChromeKey, media));
        Assert.Empty(rig.Input.Keys, "no keystroke");
        Assert.Contains("F24 is registered by another app", rig.Log.All);
        Assert.Equal("F24 IN USE", MediaFlows.PipNotice(PipOutcome.KeyInUse, dial: false, "F24")!.Text);
    }

    [Test]
    public async Task Med6_the_configured_pip_key_is_armed_and_pressed()
    {
        var (rig, media) = await PipRig();
        await using var _ = rig;
        rig.Hub.ApplySettings(new BrowserGlobalSettings { PipKey = "F21" });
        rig.Input.FreeKeys = k => k != 0x87;   // F24 taken, F21 free
        var pending = rig.Hub.TogglePipAsync(Fx.ChromeKey, media);
        await SessionRig.WaitAsync(() => rig.Input.Keys.Count > 0);
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        await pending;
        Assert.Equal("F21", rig.Sink!.Of(Wire.Op.MediaPip).Last().Args["pipKey"]!.GetValue<string>());
        Assert.Equal((ushort)0x84, Assert.Single(rig.Input.Keys), "VK_F21");
        rig.Hub.ApplySettings(new BrowserGlobalSettings { PipKey = "F5" });
        Assert.Equal("F24", rig.Hub.PipKey, "only F13–F24");
    }

    // ------------------------------------------------------------------ MED 7: refreshing the copies after an update

    [Test]
    public async Task Med7_start_up_refreshes_the_relay_and_extension_copies_only_after_a_connect()
    {
        using var rig = new InstallRig();
        Assert.Empty(await rig.Installer.RefreshAsync(), "never connected: nothing is copied");
        Assert.Equal(0, rig.Relay.Ensures);
        Assert.True((await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id)).Ok);
        File.WriteAllText(Path.Combine(rig.ExtensionSource, "manifest.json"), "{\"manifest_version\":3,\"name\":\"Fixture\",\"version\":\"0.2.0\"}");
        File.WriteAllText(Path.Combine(rig.ExtensionSource, "sw.js"), "// fixture v2");
        var done = await rig.Installer.RefreshAsync();
        Assert.Equal(2, rig.Relay.Ensures, "the relay copy is checked (it copies only when its hash differs)");
        Assert.True(done.Any(d => d.StartsWith("extension ", StringComparison.Ordinal)), "the extension copy was replaced");
        Assert.Equal("// fixture v2", File.ReadAllText(Path.Combine(rig.Installer.ExtensionFolder, "sw.js")));
        Assert.True(File.Exists(Path.Combine(rig.Installer.ExtensionFolder, HostInstaller.MarkerFile)));
        Assert.Equal("0.2.0", rig.Installer.PackagedExtensionVersion);
        Assert.False((await rig.Installer.RefreshAsync()).Any(d => d.StartsWith("extension ", StringComparison.Ordinal)), "unchanged: not copied again");
        using var safe = new InstallRig(safeMode: true);
        Assert.Empty(await safe.Installer.RefreshAsync());
    }

    [Test]
    public async Task Med7_the_pi_says_when_a_running_extension_is_older_than_the_packaged_one()
    {
        await using var rig = Rig.Create();
        using var install = new InstallRig();
        File.WriteAllText(Path.Combine(install.ExtensionSource, "manifest.json"), "{\"manifest_version\":3,\"version\":\"0.2.0\"}");
        await using var h = await ActionHarness<TabKeyAction>.AppearAsync(TestDevices.Galleon, new(0, 0), PrismControl.Core.Devices.Controller.Keypad, null,
            configureServices: s => { rig.Services(s); s.Add(install.Installer); }, time: rig.Time);
        var status = await h.PiMessageAsync("browser.status", requestId: 1);
        Assert.Contains("Extension update ready (0.2.0)", status!.ToJsonString());
    }

    // ------------------------------------------------------------------ MED 8: auto streamer-safe off

    [Test]
    public async Task Med8_with_auto_streamer_safe_off_OBS_changes_nothing_and_turning_it_on_tells_the_extensions()
    {
        await using var rig = new SessionRig();
        rig.Hub.ApplySettings(new BrowserGlobalSettings { AutoStreamerSafe = false });
        var chrome = await rig.ConnectAsync("p1");
        chrome.Drain();
        rig.Hub.SetStreamingDetected(true, "obs64.exe");
        await Task.Delay(100);
        Assert.False(chrome.Drain().Any(f => f["t"]!.GetValue<string>() == "streaming"), "OBS with auto off sends nothing");
        Assert.Equal(Wire.Privacy.Full, rig.Hub.RequestedPrivacy);
        rig.Hub.ApplySettings(new BrowserGlobalSettings { AutoStreamerSafe = true });
        var frames = new List<JsonObject>();
        await SessionRig.WaitAsync(() => { frames.AddRange(chrome.Drain()); return frames.Any(f => f["t"]!.GetValue<string>() == "streaming"); });
        Assert.True(frames.First(f => f["t"]!.GetValue<string>() == "streaming")["data"]!["active"]!.GetValue<bool>());
        Assert.Equal(Wire.Privacy.Domain, rig.Hub.RequestedPrivacy);
    }

    [Test]
    public async Task Med8_the_privacy_key_shows_a_stricter_level_an_extension_applies_by_itself()
    {
        await using var rig = Rig.Create(privacy: Wire.Privacy.Hidden);   // the extension's own setting: hidden
        await using var off = await H.Key<PrivacyKeyAction>(rig, TestDevices.Galleon);
        await H.Done(off);
        await using var rig2 = Rig.Create();
        rig2.Hub.SetPrivacySetting(Wire.Privacy.Hidden);
        await using var on = await H.Key<PrivacyKeyAction>(rig2, TestDevices.Galleon);
        await H.Done(on);
        Assert.Equal(on.LastSvg, off.LastSvg, "the key says hidden although the deck asks for full");
        Assert.Equal(Wire.Privacy.Hidden, rig.Hub.EffectivePrivacy());
    }

    // ------------------------------------------------------------------ MED 9: more than 2000 tabs

    [Test]
    public async Task Med9_a_profile_with_2500_tabs_is_held_whole()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync(full: false);
        var full = Fx.StateFull();
        full["data"]!["tabs"] = new JsonArray([.. Enumerable.Range(0, 2500).Select(i => (JsonNode)Fx.Tab(1000 + i, 1, i, "T", "many.example"))]);
        conn.Send(full);
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")?.Tabs.Count == 2500, 5000);
        Assert.DoesNotContain("the rest are not shown", rig.Log.All);
    }

    // ------------------------------------------------------------------ LOW 14: artwork fetcher network edges

    [Test]
    public void Low14_nat64_of_a_public_address_is_public_and_of_a_private_one_is_not()
    {
        Assert.True(NetGuard.IsPublic(IPAddress.Parse("64:ff9b::808:808")), "8.8.8.8 via NAT64");
        Assert.False(NetGuard.IsPublic(IPAddress.Parse("64:ff9b::a00:1")), "10.0.0.1 via NAT64");
        Assert.False(NetGuard.IsPublic(IPAddress.Parse("64:ff9b:1::808:808")), "the local-use NAT64 prefix stays refused");
        Assert.False(NetGuard.IsPublic(IPAddress.Parse("::808:808")), "IPv4-compatible stays refused");
    }

    [Test]
    public async Task Low14_a_url_windows_would_proxy_is_not_fetched_directly()
    {
        var http = new FakeArtHttp();
        using var f = new ArtFetcher(new RecordingLog(), new FakeResolver(new() { ["cdn.example"] = [IPAddress.Parse("192.0.2.10")] }), http,
            new ArtFetcherOptions { AllowDocumentationRanges = true }) { ProxyFor = _ => true };
        var r = await f.FetchAsync("https://cdn.example/art.png");
        Assert.Equal(FetchFailure.Proxied, r.Failure);
        Assert.Empty(http.Seen, "nothing left this PC");
    }

    // ------------------------------------------------------------------ LOW 16: opening downloads

    [Test]
    public async Task Low16_opening_uses_the_fresh_path_answer_and_a_double_dot_name_is_fine()
    {
        await using var rig = Rig.Create();
        var dir = Path.Combine(Path.GetTempPath(), "prism-browser-tests", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        try
        {
            var file = Path.Combine(dir, "report..final.pdf");
            File.WriteAllText(file, "fixture");
            var item = rig.Store.Current.Find(Fx.ChromeKey)!.Downloads[501] with { State = "complete" };
            JsonObject answer = new() { ["id"] = 501, ["path"] = file, ["state"] = "complete", ["exists"] = true, ["danger"] = "safe" };
            rig.Sink!.Respond = (op, _) => op == Wire.Op.DownloadPath ? new CommandResult(true, (JsonObject)answer.DeepClone()) : CommandResult.Success;
            Assert.Equal(OpenOutcome.Opened, await rig.Hub.OpenDownloadAsync(Fx.ChromeKey, item, confirmed: false), "\"..\" inside a file name is not a path segment");
            answer["danger"] = "uncommon";
            Assert.Equal(OpenOutcome.Dangerous, await rig.Hub.OpenDownloadAsync(Fx.ChromeKey, item, confirmed: false), "the fresh verdict wins over our stale \"safe\"");
            answer["danger"] = "safe"; answer["exists"] = false;
            Assert.Equal(OpenOutcome.NotReady, await rig.Hub.OpenDownloadAsync(Fx.ChromeKey, item, confirmed: false));
            answer["exists"] = true; answer["path"] = Path.Combine(dir, "..", Path.GetFileName(dir), "report..final.pdf");
            Assert.Equal(OpenOutcome.Failed, await rig.Hub.OpenDownloadAsync(Fx.ChromeKey, item, confirmed: false), "a \"..\" segment is refused");
            Assert.Single(rig.Shell.Opened);
        }
        finally { Directory.Delete(dir, recursive: true); }
        foreach (var ext in new[] { ".msp", ".mst", ".rdp", ".jnlp", ".chm", ".appinstaller", ".diagcab", ".theme", ".cer", ".website", ".settingcontent-ms" })
            Assert.True(BrowserHub.NeedsConfirmation("example" + ext), ext);
        Assert.False(BrowserHub.NeedsConfirmation("example.pdf"));
    }

    // ------------------------------------------------------------------ LOW 17: img.get batching

    [Test]
    public async Task Low17_forty_evicted_images_are_all_asked_for_in_batches_of_32()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        conn.Drain();
        var ids = Enumerable.Range(0, 40).Select(i => $"fav:{i:x16}").ToList();
        foreach (var id in ids) rig.Hub.RequestImage("chrome:p1", id);
        var asked = new List<string>();
        for (var batch = 0; batch < 2; batch++)
        {
            var cmd = await SessionRig.AnswerAsync(conn, new JsonObject { ["sent"] = 0, ["missing"] = new JsonArray() });
            Assert.Equal("img.get", cmd["op"]!.GetValue<string>());
            asked.AddRange(cmd["args"]!["ids"]!.AsArray().Select(x => x!.GetValue<string>()));
        }
        Assert.Equal(40, asked.Distinct().Count(), "no id is dropped");
    }

    // ------------------------------------------------------------------ LOW 18 + 19: installer

    [Test]
    public async Task Low18_reconnect_swaps_the_extension_copy_and_leaves_no_temporary_folders()
    {
        using var rig = new InstallRig();
        Directory.CreateDirectory(rig.Installer.ExtensionFolder + ".tmp-0123abcd");   // an interrupted earlier copy
        Directory.CreateDirectory(rig.Installer.ExtensionFolder + ".notours");
        Assert.True((await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id)).Ok);
        File.WriteAllText(Path.Combine(rig.ExtensionSource, "sw.js"), "// fixture v2");
        Assert.True((await rig.Installer.ApplyAsync(true, rig.Installer.PlanConnect().Id)).Ok);
        Assert.Equal("// fixture v2", File.ReadAllText(Path.Combine(rig.Installer.ExtensionFolder, "sw.js")));
        var parent = Path.GetDirectoryName(rig.Installer.ExtensionFolder)!;
        var left = Directory.GetDirectories(parent).Select(Path.GetFileName).Where(n => n!.StartsWith("extension", StringComparison.Ordinal)).OrderBy(n => n).ToList();
        Assert.Equal("extension,extension.notours", string.Join(",", left), "only our leftovers are cleaned");
    }

    [Test]
    public async Task Low19_plan_ids_are_random_single_use_and_expire()
    {
        var time = new ManualTimeProvider();
        using var rig = new InstallRig();
        var installer = new HostInstaller(new HostInstallerOptions
        {
            Registry = rig.Registry, Relay = rig.Relay, DataDirectory = Path.Combine(rig.Root, "control", "modules", "browser"),
            ExtensionSource = rig.ExtensionSource, Log = rig.Log, Time = time,
        });
        var a = installer.PlanConnect();
        var b = installer.PlanConnect();
        Assert.NotEqual(a.Id, b.Id, "not a predictable hash of the steps");
        time.Advance(HostInstaller.PlanLifetime + TimeSpan.FromSeconds(1));
        var expired = await installer.ApplyAsync(true, a.Id);
        Assert.False(expired.Ok);
        Assert.Contains("Review the steps again", expired.Message + " " + (await installer.ApplyAsync(true, b.Id)).Message);
        var fresh = installer.PlanConnect();
        Assert.True((await installer.ApplyAsync(true, fresh.Id)).Ok);
        Assert.False((await installer.ApplyAsync(true, fresh.Id)).Ok, "used once");
    }

    // ------------------------------------------------------------------ LOW 20: endpoint subscribe-before-publish

    [Test(Category = "integration")]
    public async Task Low20_ingress_json_appears_only_after_the_hub_subscribed_and_a_relay_connecting_at_once_is_served()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-browser-pipe-tests", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        var discovery = Path.Combine(dir, "ingress.json");
        var log = new RecordingLog();
        await using var hub = new BrowserHub(new BrowserHubOptions { Log = log, Verifier = AcceptAnyRelay.Instance });
        var ep = DesktopFrameEndpoint.Create(DesktopFrameEndpoint.Options(discovery), log);
        try
        {
            Assert.False(File.Exists(discovery), "not published before listening");
            Assert.Equal(Wire.Limits.MaxConnections, ep.MaxSessions, "LOW 25: room for many profiles");
            hub.Start(ep);
            await ep.StartAsync();
            await using var c = await FakeRelayClient.ConnectAsync(discovery);
            await c.SendAsync(Fx.Preamble(c.Token));
            await c.SendAsync(Fx.Hello("p1"));
            Assert.NotNull(await c.ReadUntilAsync("welcome"));
        }
        finally
        {
            await ep.DisposeAsync();
            try { Directory.Delete(dir, recursive: true); } catch (Exception) { }
        }
    }

    // ------------------------------------------------------------------ LOW 21: the command budget includes the write

    private sealed class StallingConnection(MemoryConnection inner) : IFrameConnection
    {
        public volatile bool Stall;
        public JsonObject? Preamble => inner.Preamble;
        public int? ClientPid => inner.ClientPid;
        public string? ClientImagePath => inner.ClientImagePath;
        public Task<JsonNode?> ReadAsync(CancellationToken ct) => inner.ReadAsync(ct);
        public async Task WriteAsync(JsonNode frame, CancellationToken ct)
        {
            if (Stall) await Task.Delay(Timeout.Infinite, ct);
            await inner.WriteAsync(frame, ct);
        }
        public ValueTask DisposeAsync() => inner.DisposeAsync();
    }

    [Test]
    public async Task Low21_a_stalled_pipe_write_still_times_out_at_2_s()
    {
        var time = new ManualTimeProvider();
        await using var rig = new SessionRig(time);
        var mem = new MemoryConnection();
        var conn = new StallingConnection(mem);
        rig.Runs.Add(rig.Hub.AcceptAsync(conn));
        mem.Send(Fx.Preamble("test-token-0123"));
        mem.Send(Fx.Hello("p1"));
        Assert.Equal("welcome", (await mem.NextAsync())["t"]!.GetValue<string>());
        conn.Stall = true;
        var pending = rig.Hub.SessionFor("chrome:p1")!.SendCommandAsync(Wire.Op.TabReload, new JsonObject { ["tabId"] = 1 });
        await Task.Delay(50);
        time.Advance(TimeSpan.FromSeconds(2.1));
        var r = await pending.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(Wire.Err.Timeout, r.Code);
    }

    // ------------------------------------------------------------------ LOW 23: undo after a dial / touch hold closes a tab

    [Test]
    public async Task Low23_a_dial_hold_close_can_be_undone_with_a_push_within_5_s()
    {
        foreach (var hold in new[] { "touch", "dial" })
        {
            await using var rig = Rig.Create();
            await using var h = await H.Dial<TabsDialAction>(rig, TestDevices.Plus, new TabsDialSettings(), new(0, 0));
            if (hold == "touch") await h.TapAsync(100, 50, hold: true);
            else await h.DialPressAsync(TimeSpan.FromMilliseconds(700));
            await H.Done(h);
            Assert.Single(rig.Sink!.Of(Wire.Op.TabClose));
            await h.AdvanceAsync(TimeSpan.FromSeconds(2));
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.SessionRestore), hold + ": the push undid the close");
            Assert.Empty(rig.Sink.Of(Wire.Op.TabFocus), "and did not switch tabs");
            // After the window, a push switches again.
            await h.TapAsync(100, 50, hold: true);
            await H.Done(h);
            await h.AdvanceAsync(TimeSpan.FromSeconds(6));
            await h.DialPressAsync();
            await H.Done(h);
            Assert.Single(rig.Sink.Of(Wire.Op.TabFocus));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Low24_undo_without_sessions_reopens_the_tab_where_it_was()
    {
        await using var rig = Rig.Create(caps: new BrowserCaps { Tabs = true, Sessions = false });
        await using var h = await H.Key<TabKeyAction>(rig, TestDevices.Galleon, new TabKeySettings { Index = 3 });
        await h.PressAsync(TimeSpan.FromMilliseconds(700));
        await H.Done(h);
        await h.PressAsync();
        await H.Done(h);
        var create = Assert.Single(rig.Sink!.Of(Wire.Op.TabCreate)).Args;
        Assert.Equal(1, create["windowId"]!.GetValue<int>());
        Assert.Equal(2, create["index"]!.GetValue<int>(), "its old position");
    }
}
