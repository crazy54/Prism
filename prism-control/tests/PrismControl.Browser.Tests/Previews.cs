using System.Collections.Immutable;
using System.Text;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Render;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>
/// <c>-- --render-previews &lt;dir&gt;</c>: every key and widget state (Night and Day) as SVG, plus pages that show keys at
/// 72/96/120/144/160 px and widgets at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget), and two device
/// mock-ups built from the real actions (Galleon "Browser" profile, research §5.1; Stream Deck +, §5.2).
/// Everything is fictional: .example sites, generated abstract favicons and artwork.
/// </summary>
public static class Previews
{
    private static readonly List<(string Name, string Svg)> Keys = [];
    private static readonly List<(string Name, string Svg)> Dials = [];

    public static async Task<int> WriteAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        Keys.Clear();
        Dials.Clear();
        foreach (var t in new[] { Refraction.Night, Refraction.Day }) Catalog(t);
        foreach (var (name, svg) in Keys) File.WriteAllText(Path.Combine(dir, $"key-{name}.svg"), svg);
        foreach (var (name, svg) in Dials) File.WriteAllText(Path.Combine(dir, $"dial-{name}.svg"), svg);
        foreach (var theme in new[] { "night", "day" })
        {
            File.WriteAllText(Path.Combine(dir, $"keys-{theme}.html"), KeysPage(theme));
            File.WriteAllText(Path.Combine(dir, $"dials-{theme}.html"), DialsPage(theme));
        }
        await DevicePagesAsync(dir);
        Console.WriteLine($"wrote {Keys.Count} keys, {Dials.Count} dials, keys-/dials-night|day.html, galleon.html, galleon-page2.html and plus.html to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static StoredImage Img(string id, byte[] png) => Fx.Stored(id, png);

    private static void K(RefractionPalette t, string name, SvgDocument d) => Keys.Add(($"{t.Name}-{name}", d.ToSvg()));
    private static void D(RefractionPalette t, string name, SvgDocument d) => Dials.Add(($"{t.Name}-{name}", d.ToSvg()));

    private static void Catalog(RefractionPalette t)
    {
        var red = Img("fav:r", Fx.FavRed);
        var blue = Img("fav:b", Fx.FavBlue);
        var green = Img("fav:g", Fx.FavGreen);
        var amber = Img("fav:a", Fx.FavAmber);
        var art = Img("art:a", Fx.ArtA);
        var art2 = Img("art:b", Fx.ArtB);

        // ---- tab keys
        K(t, "tab-mail-unread", BrowserArt.TabKey(t, new TabKeyView(red, "Inbox (3) - Example Mail", 3, false, false, false, null, false)));
        K(t, "tab-active-audible-group", BrowserArt.TabKey(t, new TabKeyView(blue, "Night Drive - Example Video", null, true, false, true, "blue", false)));
        K(t, "tab-muted", BrowserArt.TabKey(t, new TabKeyView(green, "Lecture 4: Optics", null, false, true, false, "green", false)));
        K(t, "tab-dot-badge", BrowserArt.TabKey(t, new TabKeyView(amber, "Example Chat", -1, false, false, false, null, false)));
        K(t, "tab-1234-badge", BrowserArt.TabKey(t, new TabKeyView(red, "Example Mail", 1234, false, false, false, null, false)));
        K(t, "tab-no-favicon", BrowserArt.TabKey(t, new TabKeyView(null, "docs.example", null, false, false, false, "purple", false)));
        K(t, "tab-streamer-safe-domain", BrowserArt.TabKey(t, new TabKeyView(blue, "video.example", null, true, false, true, null, false)));
        K(t, "tab-reconnecting", BrowserArt.TabKey(t, new TabKeyView(red, "Inbox (3) - Example Mail", 3, false, false, false, null, true, new Notice("RECONNECTING", Tone.Warn))));
        K(t, "tab-flash-safe-mode", BrowserArt.TabKey(t, new TabKeyView(green, "Plan", null, false, false, false, null, false, new Notice("SAFE MODE", Tone.Warn, "NOT SENT"))));
        K(t, "tab-flash-admin", BrowserArt.TabKey(t, new TabKeyView(green, "Plan", null, false, false, false, null, false, new Notice("ADMIN APP", Tone.Warn, "IN FRONT"))));
        K(t, "tab-empty-slot", BrowserArt.GlyphKey(t, BrowserGlyphs.Tab, "TAB 6", enabled: false, micro: "EMPTY"));
        K(t, "tab-undo", BrowserArt.UndoKey(t, 4));

        // ---- status keys
        K(t, "status-no-browser", BrowserArt.MessageKey(t, BrowserGlyphs.Plug, "NO BROWSER", "OPEN SETTINGS", Tone.Warn));
        K(t, "status-reconnecting", BrowserArt.MessageKey(t, BrowserGlyphs.Plug, "RECONNECTING", "CHROME", Tone.Warn));
        K(t, "status-unavailable", BrowserArt.MessageKey(t, BrowserGlyphs.Plug, "UNAVAILABLE", "SEE PLUGIN LOG", Tone.Error));

        // ---- media
        K(t, "media-playing", BrowserArt.MediaKey(t, new MediaKeyView(art, "Night Drive", 0.37, true, false, false, 1)));
        K(t, "media-paused", BrowserArt.MediaKey(t, new MediaKeyView(art2, "A Much Longer Example Title (Live at the Example Hall)", 0.8, false, false, false, 1)));
        K(t, "media-live", BrowserArt.MediaKey(t, new MediaKeyView(null, "Example Live Stream", null, true, true, false, 1)));
        K(t, "media-pip-rate", BrowserArt.MediaKey(t, new MediaKeyView(art, "Night Drive", 0.62, true, false, true, 1.5)));
        K(t, "media-allow-site", BrowserArt.MediaKey(t, new MediaKeyView(amber, "radio.example", null, true, false, false, 1, new Notice("PRESS TO ALLOW", Tone.Warn))));
        K(t, "media-flash-click-allow", BrowserArt.MediaKey(t, new MediaKeyView(amber, "radio.example", null, true, false, false, 1, new Notice("CLICK ALLOW", Tone.Good, "IN THE TOOLBAR"))));
        K(t, "media-mute-only", BrowserArt.MediaKey(t, new MediaKeyView(null, "Settings", null, true, false, false, 1, new Notice("MUTE ONLY", Tone.Normal))));
        K(t, "media-lite-tier", BrowserArt.MediaKey(t, new MediaKeyView(art2, "Lo-fi Example Mix", 0.2, true, false, false, 1, new Notice("READ ONLY", Tone.Warn))));
        K(t, "media-not-playing", BrowserArt.GlyphKey(t, BrowserGlyphs.Media, "NOT PLAYING", enabled: false));

        // ---- downloads, site, nav, reopen, group, split
        K(t, "download-active", BrowserArt.DownloadKey(t, new DownloadKeyView(0.42, "active", "example-report.zip")));
        K(t, "download-paused", BrowserArt.DownloadKey(t, new DownloadKeyView(0.42, "paused", "PAUSED")));
        K(t, "download-done", BrowserArt.DownloadKey(t, new DownloadKeyView(1, "done", "example-report.zip")));
        K(t, "download-failed", BrowserArt.DownloadKey(t, new DownloadKeyView(0.3, "failed", "FAILED")));
        K(t, "download-none", BrowserArt.DownloadKey(t, new DownloadKeyView(null, "none", "NO DOWNLOADS")));
        K(t, "download-allow", BrowserArt.DownloadKey(t, new DownloadKeyView(null, "none", "DOWNLOADS", new Notice("PRESS TO ALLOW", Tone.Warn))));
        K(t, "download-confirm", BrowserArt.DownloadKey(t, new DownloadKeyView(1, "done", "setup.exe", new Notice("PRESS AGAIN", Tone.Warn))));
        K(t, "site-3", BrowserArt.SiteKey(t, new SiteKeyView(red, "mail.example", 3, true)));
        K(t, "site-new", BrowserArt.SiteKey(t, new SiteKeyView(amber, "chat.example", -1, true)));
        K(t, "site-zero", BrowserArt.SiteKey(t, new SiteKeyView(red, "mail.example", null, true)));
        K(t, "site-closed", BrowserArt.SiteKey(t, new SiteKeyView(null, "tickets.example", null, false)));
        K(t, "site-unset", BrowserArt.SiteKey(t, new SiteKeyView(null, "SITE", null, false, new Notice("SET A SITE", Tone.Warn, "IN SETTINGS"))));
        K(t, "nav-back", BrowserArt.GlyphKey(t, BrowserGlyphs.Back, "BACK"));
        K(t, "nav-forward", BrowserArt.GlyphKey(t, BrowserGlyphs.Forward, "FORWARD"));
        K(t, "nav-reload", BrowserArt.GlyphKey(t, BrowserGlyphs.Reload, "RELOAD", micro: "HOLD = HARD"));
        K(t, "reopen", BrowserArt.GlyphKey(t, BrowserGlyphs.Reopen, "REOPEN"));
        K(t, "reopen-allow", BrowserArt.GlyphKey(t, BrowserGlyphs.Reopen, "REOPEN", micro: "PRESS TO ALLOW", microTone: Tone.Warn));
        K(t, "group-blue", BrowserArt.GroupKey(t, new GroupKeyView("blue", "Research", 4, false)));
        K(t, "group-red-collapsed", BrowserArt.GroupKey(t, new GroupKeyView("red", "Taxes 2026", 7, true)));
        K(t, "group-green", BrowserArt.GroupKey(t, new GroupKeyView("green", "GROUP 3", 1, false)));
        K(t, "group-allow", BrowserArt.GroupKey(t, new GroupKeyView("grey", "GROUPS", 0, true, new Notice("PRESS TO ALLOW", Tone.Warn, "TAB GROUPS"))));
        K(t, "split", BrowserArt.GlyphKey(t, BrowserGlyphs.Split, "SPLIT"));
        K(t, "split-unsplit", BrowserArt.GlyphKey(t, BrowserGlyphs.Split, "UNSPLIT", on: true));
        K(t, "split-chrome-only", BrowserArt.GlyphKey(t, BrowserGlyphs.Split, "SPLIT", enabled: false, micro: "CHROME ONLY"));

        // ---- privacy, panic, meetings
        K(t, "privacy-off", BrowserArt.PrivacyKey(t, "full", false, false));
        K(t, "privacy-domain", BrowserArt.PrivacyKey(t, "domain", false, false));
        K(t, "privacy-domain-auto", BrowserArt.PrivacyKey(t, "domain", true, false));
        K(t, "privacy-hidden-panic", BrowserArt.PrivacyKey(t, "hidden", false, true));
        K(t, "panic-off", BrowserArt.PanicKey(t, false));
        K(t, "panic-on", BrowserArt.PanicKey(t, true));
        K(t, "meet-mic-on", BrowserArt.MeetKey(t, "mic", true, true));
        K(t, "meet-mic-muted", BrowserArt.MeetKey(t, "mic", false, true));
        K(t, "meet-cam-on", BrowserArt.MeetKey(t, "camera", true, true));
        K(t, "meet-cam-off", BrowserArt.MeetKey(t, "camera", false, true));
        K(t, "meet-hangup", BrowserArt.MeetKey(t, "hangup", null, true));
        K(t, "meet-none", BrowserArt.MeetKey(t, "mic", null, false));

        // ---- dials
        var rows = new List<TabRow>
        {
            new(null, "Show all 2 windows", "Push to switch the list", false, false, false, null, true),
            new(red, "Inbox (3) - Example Mail", "mail.example · Pinned", false, false, false, 3),
            new(blue, "Night Drive - Example Video", "video.example", true, true, false, null),
            new(green, "Quarterly Plan Draft - Example Docs", "docs.example", false, false, false, null),
            new(amber, "Example News: Local Team Wins", "news.example", false, false, true, null),
        };
        D(t, "tabs", BrowserArt.TabsDial(t, new TabsDialView("Chrome · this window", "2/4", rows, 2, 0.5), true));
        D(t, "tabs-idle", BrowserArt.TabsDial(t, new TabsDialView("Chrome · this window", "2/4", rows, 2, 0.5), false));
        D(t, "tabs-badge", BrowserArt.TabsDial(t, new TabsDialView("Chrome · this window", "1/4", rows, 1, 0.25), true));
        D(t, "tabs-scope-row", BrowserArt.TabsDial(t, new TabsDialView("Chrome · this window", "4 tabs", rows, 0, 0), true));
        D(t, "tabs-muted", BrowserArt.TabsDial(t, new TabsDialView("Edge · all windows", "4/4", rows, 4, 1), true));
        D(t, "tabs-notice", BrowserArt.TabsDial(t, new TabsDialView("Chrome · this window", "3/4", rows, 3, 0.75, new Notice("Admin app in front: can't raise", Tone.Warn)), true));
        D(t, "now-playing", BrowserArt.NowPlayingDial(t, new NowPlayingView(art, "Chrome · video.example", "Night Drive", "The Example Ensemble", 81_000, 221_000, true, false, 1, false), false));
        D(t, "now-playing-active-rate-pip", BrowserArt.NowPlayingDial(t, new NowPlayingView(art2, "Edge · music.example", "A Much Longer Example Title (Extended)", "Example Artist", 30_000, 3_725_000, true, false, 1.5, true), true));
        D(t, "now-playing-paused", BrowserArt.NowPlayingDial(t, new NowPlayingView(art, "Chrome · video.example", "Night Drive", "The Example Ensemble", 120_000, 221_000, false, false, 1, false), false));
        D(t, "now-playing-live", BrowserArt.NowPlayingDial(t, new NowPlayingView(null, "Chrome · live.example", "Example Live Stream", "Example Channel", 5_400_000, null, true, true, 1, false), false));
        D(t, "now-playing-allow", BrowserArt.NowPlayingDial(t, new NowPlayingView(amber, "Chrome · radio.example", "Playing sound", null, null, null, true, false, 1, false, new Notice("Push to allow", Tone.Warn)), false));
        D(t, "now-playing-lite", BrowserArt.NowPlayingDial(t, new NowPlayingView(art2, "Windows media · Chrome", "Lo-fi Example Mix", "Example Channel", 600_000, 3_600_000, true, false, 1, false, new Notice("Connect for controls", Tone.Warn)), false));
        D(t, "now-playing-safe-mode", BrowserArt.NowPlayingDial(t, new NowPlayingView(art, "Chrome · video.example", "Night Drive", "The Example Ensemble", 81_000, 221_000, true, false, 1, false, new Notice("Safe mode: nothing is sent", Tone.Warn)), true));
        D(t, "nothing-playing", BrowserArt.MessageDial(t, BrowserGlyphs.Media, "Chrome · media", "Nothing playing", "Play a video or song in any tab", false, Tone.Normal));
        D(t, "speed", BrowserArt.SpeedDial(t, new SpeedView(false, 1.5, 0.8, false, "video.example"), true));
        D(t, "speed-idle-1x", BrowserArt.SpeedDial(t, new SpeedView(false, 1, 0.8, false, "video.example"), false));
        D(t, "volume", BrowserArt.SpeedDial(t, new SpeedView(true, 1, 0.62, false, "video.example"), true));
        D(t, "volume-muted", BrowserArt.SpeedDial(t, new SpeedView(true, 1, 0, true, "video.example"), false));
        D(t, "volume-tab-mute-only", BrowserArt.SpeedDial(t, new SpeedView(true, 1, null, false, "radio.example", new Notice("Tab mute only", Tone.Normal)), false));
        D(t, "page-scroll", BrowserArt.PageDial(t, new PageView(false, 1, "docs.example"), false));
        D(t, "page-zoom", BrowserArt.PageDial(t, new PageView(true, 1.25, "docs.example"), true));
        D(t, "page-keys-fallback", BrowserArt.PageDial(t, new PageView(false, 1, "news.example", new Notice("No site access: arrow keys", Tone.Warn)), true));
        D(t, "preview", BrowserArt.PreviewDial(t, new PreviewView(Img("preview:1", Fx.PreviewFrame()), "Live · Chrome · window 1/2", true), false));
        D(t, "preview-waiting", BrowserArt.PreviewDial(t, new PreviewView(null, "Live · Chrome", false), false));
        D(t, "preview-streamer-safe", BrowserArt.PreviewDial(t, new PreviewView(null, "Live · Chrome", false, new Notice("Off in streamer-safe", Tone.Warn)), false));
        D(t, "preview-allow", BrowserArt.PreviewDial(t, new PreviewView(null, "Live · Chrome", false, new Notice("Push to allow the preview", Tone.Warn, "Asked once")), false));
        D(t, "status-no-browser", BrowserArt.MessageDial(t, BrowserGlyphs.Plug, "Tabs", "No browser connected", "Fix: Connect browsers in settings", false));
        D(t, "status-reconnecting", BrowserArt.MessageDial(t, BrowserGlyphs.Plug, "Now playing", "Chrome disconnected", "Reconnecting…", false));
        D(t, "status-needs-permission", BrowserArt.MessageDial(t, BrowserGlyphs.Lock, "Chrome · radio.example", "Site needs permission", "Push to allow it", true));
    }

    // ------------------------------------------------------------------ device mock-ups from the real actions

    private static async Task DevicePagesAsync(string dir)
    {
        await using var rig = Rig.Create(caps: new BrowserCaps { Tabs = true, Favicon = true, Downloads = true, TabGroups = true, Sessions = true, AllUrls = true, Split = true, HostAccessRequest = true });
        // A richer window 1: six tabs, a second group, a meeting tab.
        rig.Update(b => b with
        {
            Tabs = b.Tabs
                .SetItem(15, WireParser.MergeTab(null, Fx.Tab(15, 1, 4, "Example Chat • 2 unread", "chat.example", unread: -1, icon: "fav:" + Fx.Hash(Fx.FavAmber)))!)
                .SetItem(16, WireParser.MergeTab(null, Fx.Tab(16, 1, 5, "Standup - Example Meet", "meet.example", audible: true, group: 9, icon: "fav:" + Fx.Hash(Fx.FavGreen)))!),
            Groups = b.Groups.SetItem(9, WireParser.MergeGroup(null, Fx.Group(9, 1, "Team", "orange"))!).SetItem(8, WireParser.MergeGroup(null, Fx.Group(8, 1, "Taxes 2026", "red", collapsed: true))!),
            Media = b.Media.SetItem("16:0", new MediaItem { Key = "16:0", TabId = 16, Kind = "session-only", State = "playing", Mic = false, Camera = true, Actions = ["togglemicrophone", "togglecamera", "hangup"], Seen = 1 }),
        });
        rig.Hub.Previews.Put(Fx.ChromeKey, 1, Fx.Stored("preview:1", Fx.PreviewFrame()), rig.Store.NowMs);

        async Task<string> KeyOf<T>(DeviceInfo dev, object? settings) where T : ActionBase, new()
        {
            await using var h = await H.Key<T>(rig, dev, settings, new(0, 0));
            h.AssertFramesAreDeckSafe();
            return h.LastSvg ?? "";
        }
        async Task<string> DialOf<T>(DeviceInfo dev, Coordinates at, object? settings, Func<ActionHarness<T>, Task>? drive = null) where T : ActionBase, new()
        {
            await using var h = await H.Dial<T>(rig, dev, settings, at);
            if (drive is not null) await drive(h);
            h.AssertFramesAreDeckSafe();
            return h.FeedbackSvg(Layouts.Canvas.Frame) ?? "";
        }

        var g = TestDevices.Galleon;
        var galleonKeys = new List<string>
        {
            await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 1 }), await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 2 }), await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 3 }),
            await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 4 }), await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 5 }), await KeyOf<MediaKeyAction>(g, null),
            await KeyOf<NavKeyAction>(g, new NavKeySettings { Command = "back" }), await KeyOf<NavKeyAction>(g, new NavKeySettings { Command = "reload" }), await KeyOf<NavKeyAction>(g, new NavKeySettings { Command = "forward" }),
            await KeyOf<ReopenKeyAction>(g, null), await KeyOf<DownloadKeyAction>(g, null), await KeyOf<SiteKeyAction>(g, new SiteKeySettings { Site = "mail.example" }),
        };
        var galleonDials = new List<string>
        {
            await DialOf<TabsDialAction>(g, new(0, 0), null, async h => await h.RotateAsync(1)),
            await DialOf<ScrubDialAction>(g, new(1, 0), null),
            await DialOf<PageDialAction>(g, new(0, 1), null),
            await DialOf<SpeedDialAction>(g, new(1, 1), null, async h => await h.RotateAsync(2)),
        };
        var page2Keys = new List<string>
        {
            await KeyOf<GroupKeyAction>(g, new GroupKeySettings { Index = 1 }), await KeyOf<GroupKeyAction>(g, new GroupKeySettings { Index = 2 }), await KeyOf<GroupKeyAction>(g, new GroupKeySettings { Index = 3 }),
            await KeyOf<SplitKeyAction>(g, null), await KeyOf<PrivacyKeyAction>(g, null), await KeyOf<PanicKeyAction>(g, null),
            await KeyOf<MeetKeyAction>(g, new MeetKeySettings { Control = "mic" }), await KeyOf<MeetKeyAction>(g, new MeetKeySettings { Control = "camera" }), await KeyOf<MeetKeyAction>(g, new MeetKeySettings { Control = "hangup" }),
            await KeyOf<TabKeyAction>(g, new TabKeySettings { Slot = "audible", Index = 1 }), await KeyOf<TabKeyAction>(g, new TabKeySettings { Index = 6 }), await KeyOf<TabKeyAction>(g, new TabKeySettings { Slot = "pinned", Index = 1, Label = "domain" }),
        };
        var page2Dials = new List<string>
        {
            await DialOf<PreviewDialAction>(g, new(0, 0), null, async h => { rig.Store.Touch(BrowserChange.Preview); await h.AdvanceAsync(TimeSpan.FromMilliseconds(600)); }),
            await DialOf<ScrubDialAction>(g, new(1, 0), new ScrubDialSettings { Rotate = "skip" }),
            await DialOf<TabsDialAction>(g, new(0, 1), new TabsDialSettings { Scope = "all" }),
            await DialOf<SpeedDialAction>(g, new(1, 1), new SpeedDialSettings { Start = "volume" }),
        };
        File.WriteAllText(Path.Combine(dir, "galleon.html"), GalleonPage("Corsair Galleon 100 SD · Browser profile (research §5.1)", galleonKeys, galleonDials));
        File.WriteAllText(Path.Combine(dir, "galleon-page2.html"), GalleonPage("Corsair Galleon 100 SD · page 2: groups, split, streamer-safe, panic, meeting, preview", page2Keys, page2Dials));

        var p = TestDevices.Plus;
        var plusKeys = new List<string>
        {
            await KeyOf<TabKeyAction>(p, new TabKeySettings { Index = 1 }), await KeyOf<TabKeyAction>(p, new TabKeySettings { Index = 2 }), await KeyOf<TabKeyAction>(p, new TabKeySettings { Index = 3 }), await KeyOf<MediaKeyAction>(p, null),
            await KeyOf<NavKeyAction>(p, new NavKeySettings { Command = "back" }), await KeyOf<NavKeyAction>(p, new NavKeySettings { Command = "reload" }), await KeyOf<DownloadKeyAction>(p, null), await KeyOf<SiteKeyAction>(p, new SiteKeySettings { Site = "mail.example" }),
        };
        var plusDials = new List<string>
        {
            await DialOf<TabsDialAction>(p, new(0, 0), null, async h => await h.RotateAsync(-1)),
            await DialOf<PageDialAction>(p, new(1, 0), new PageDialSettings { Start = "zoom" }),
            await DialOf<ScrubDialAction>(p, new(2, 0), null),
            await DialOf<SpeedDialAction>(p, new(3, 0), null),
        };
        File.WriteAllText(Path.Combine(dir, "plus.html"), PlusPage(plusKeys, plusDials));

        await using var none = Rig.Create(seedChrome: false);
        string noneKey, noneDial;
        await using (var hk = await H.Key<TabKeyAction>(none, g, null)) noneKey = hk.LastSvg ?? "";
        await using (var hd = await H.Dial<TabsDialAction>(none, g, null)) noneDial = hd.FeedbackSvg(Layouts.Canvas.Frame) ?? "";
        File.WriteAllText(Path.Combine(dir, "key-actual-no-browser.svg"), noneKey);
        File.WriteAllText(Path.Combine(dir, "dial-actual-no-browser.svg"), noneDial);
    }

    private static string Data(string svg) => "data:image/svg+xml;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes(svg));

    private static string GalleonPage(string title, List<string> keys, List<string> dials)
    {
        var sb = new StringBuilder(Head(title, "#000"));
        sb.Append("<div style=\"display:flex;gap:28px;align-items:flex-start\"><div style=\"display:grid;grid-template-columns:repeat(3,160px);gap:12px;padding:16px;background:#111318;border-radius:14px\">");
        foreach (var k in keys) sb.Append($"<img src=\"{Data(k)}\" width=\"160\" height=\"160\" style=\"border-radius:10px\">");
        sb.Append("</div><div style=\"display:grid;grid-template-columns:repeat(2,360px);gap:0;padding:12px;background:#111318;border-radius:14px\">");
        foreach (var i in new[] { 0, 1, 2, 3 }) sb.Append($"<img src=\"{Data(dials[i])}\" width=\"360\" height=\"180\" style=\"outline:1px solid #2a2d38\">");
        sb.Append("</div></div><p>Keys 3 wide × 4 tall at 160 px. Screen 720×384 as four 360×180 widgets: TL dial L layer 0, TR dial R layer 0, BL dial L layer 1, BR dial R layer 1.</p></body></html>");
        return sb.ToString();
    }

    private static string PlusPage(List<string> keys, List<string> dials)
    {
        var sb = new StringBuilder(Head("Stream Deck + · Browser profile (research §5.2)", "#000"));
        sb.Append("<div style=\"display:inline-block;padding:16px;background:#111318;border-radius:14px\"><div style=\"display:grid;grid-template-columns:repeat(4,120px);gap:16px 32px;margin-bottom:18px\">");
        foreach (var k in keys) sb.Append($"<img src=\"{Data(k)}\" width=\"120\" height=\"120\" style=\"border-radius:10px\">");
        sb.Append("</div><div style=\"display:flex;gap:0\">");
        foreach (var d in dials) sb.Append($"<img src=\"{Data(d)}\" width=\"200\" height=\"100\">");
        sb.Append("</div></div><p>Keys 4×2 at 120 px; touch strip 800×100 as four 200×100 segments.</p></body></html>");
        return sb.ToString();
    }

    private static string Head(string title, string bg) =>
        $"<!doctype html><html><head><meta charset=\"utf-8\"><style>body{{margin:16px;background:{bg};color:#a2a4b4;font:12px Segoe UI,sans-serif}}h2{{font-size:14px;margin:4px 0 12px}}" +
        ".grid{display:flex;flex-wrap:wrap;gap:14px 26px}.item{display:flex;gap:8px;align-items:flex-end}figure{margin:0;text-align:center}figcaption{margin-top:2px;font-size:10px}img{display:block}</style></head>" +
        $"<body><h2>{title}</h2>";

    private static string KeysPage(string theme)
    {
        var bg = theme == "night" ? "#000" : "#dcdbe6";
        var sb = new StringBuilder(Head($"Browser keys ({theme}) at 72 / 96 / 120 / 144 / 160 px", bg)).Append("<div class=\"grid\">");
        foreach (var (name, _) in Keys.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
        {
            sb.Append("<div class=\"item\">");
            foreach (var px in new[] { 72, 96, 120, 144, 160 })
                sb.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{(px == 160 ? name[(theme.Length + 1)..] : px.ToString(System.Globalization.CultureInfo.InvariantCulture))}</figcaption></figure>");
            sb.Append("</div>");
        }
        return sb.Append("</div></body></html>").ToString();
    }

    private static string DialsPage(string theme)
    {
        var bg = theme == "night" ? "#000" : "#dcdbe6";
        var sb = new StringBuilder(Head($"Browser widgets ({theme}) at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget)", bg)).Append("<div class=\"grid\">");
        foreach (var (name, _) in Dials.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
            sb.Append($"<div class=\"item\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name[(theme.Length + 1)..]}</figcaption></figure>")
              .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"><figcaption>360×180</figcaption></figure></div>");
        return sb.Append("</div></body></html>").ToString();
    }
}
