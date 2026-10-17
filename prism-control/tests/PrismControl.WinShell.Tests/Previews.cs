using System.Text;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// <c>-- --render-previews &lt;dir&gt;</c>: every key and widget state of W1's actions, Night and Day, with SYNTHETIC
/// thumbnails and icons (never real screen content). Keys at 72/96/120/144 px, widgets at 200×100 (Stream Deck + strip)
/// and 360×180 (Galleon), plus the spec's Galleon and Stream Deck + layouts. Snap the pages with snap.mjs.
/// </summary>
public static class Previews
{
    public sealed record Frame(string Name, bool Key, Func<RefractionPalette, SvgDocument> Draw);

    private static ThumbnailFrame Thumb(int w, int h, int seed) => new(Samples.MakeJpeg(w, h, seed), w, h, seed);

    public static List<Frame> All()
    {
        var keyThumb = Thumb(136, 85, 0);
        var keyThumb2 = Thumb(136, 57, 1);   // an ultrawide window
        var keyThumb3 = Thumb(110, 88, 2);   // a tall-ish window
        var wide = Thumb(224, 140, 0);
        var mons = Samples.Monitors();
        var (b, w) = (mons.Select(m => m.Bounds).ToList(), mons.Select(m => m.WorkArea).ToList());
        var icon = Samples.IconPng;
        var icon2 = Samples.IconPng2;
        var desktops = new DesktopsState(3, 1, ["Desktop 1", "Studio", "Desktop 3"]);
        var bright = new VcpView(72, 100, DdcStatus.Ok, null);
        var inputs = new List<uint> { 0x0F, 0x11, 0x12, 0x1A, 0x1B };
        var list = new List<Frame>
        {
            new("window-front", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "notes.example — Example Editor", AppName = "Editor", Thumbnail = keyThumb, Icon = icon, Foreground = true })),
            new("window-ultrawide", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "The Example Ensemble — tour dates", AppName = "Browser", Thumbnail = keyThumb2, Icon = icon2 })),
            new("window-admin", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "Sensors", AppName = "Monitor Tool", Thumbnail = keyThumb3, Icon = icon, Elevated = true })),
            new("window-minimized", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "General · Example Chat", AppName = "Chat", Icon = icon2, Minimized = true })),
            new("window-streamer-safe", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "Browser", AppName = "Browser", Thumbnail = keyThumb, Icon = icon2 })),
            new("window-starting", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "Example Player", AppName = "Player" })),
            new("window-flash", true, t => WindowArt.Key(t, new WindowKeyModel { Caption = "Sensors", Thumbnail = keyThumb3, Icon = icon, Elevated = true, Flash = "ADMIN APP", FlashAlert = true })),
            new("window-empty", true, t => WindowArt.Key(t, new WindowKeyModel { Empty = true, EmptyLabel = "NO WINDOW", Slot = 4 })),
            new("window-not-running", true, t => WindowArt.Key(t, new WindowKeyModel { Empty = true, EmptyLabel = "NOT RUNNING", Caption = "Music" })),
            new("desktops", true, t => PagerArt.DesktopsKey(t, desktops)),
            new("desktops-many", true, t => PagerArt.DesktopsKey(t, new DesktopsState(7, 5, Enumerable.Range(1, 7).Select(i => $"Desktop {i}").ToList()))),
            new("desktops-alert", true, t => PagerArt.DesktopsKey(t, desktops, "NOT CONFIRMED", true)),
            new("game-on", true, t => PagerArt.GameKey(t, new GameState(3, 5, false))),
            new("game-off", true, t => PagerArt.GameKey(t, GameState.Idle)),
            new("hdr-on", true, t => DisplayArt.HdrKey(t, "UW34", HdrView.On)),
            new("hdr-off", true, t => DisplayArt.HdrKey(t, "QH32", HdrView.Off)),
            new("hdr-resyncing", true, t => DisplayArt.HdrKey(t, "UW34", HdrView.Resyncing, 0.45)),
            new("hdr-unsupported", true, t => DisplayArt.HdrKey(t, "QH27", HdrView.Unsupported)),
            new("hdr-didnt-take", true, t => DisplayArt.HdrKey(t, "UW34", HdrView.Off, 0, "DIDN'T TAKE", true)),
            new("refresh", true, t => DisplayArt.RefreshKey(t, "UW34", 240, 120, null)),
            new("refresh-keep", true, t => DisplayArt.RefreshKey(t, "UW34", 120, 240, 12)),
            new("refresh-reverted", true, t => DisplayArt.RefreshKey(t, "UW34", 240, 120, null, "REVERTED")),
            new("refresh-alert", true, t => DisplayArt.RefreshKey(t, "QH32", 165, 75, null, "NO 75 HZ HERE", true)),
            new("monitor-key", true, t => DisplayArt.MonitorKey(t, "Brightness", "UW34", bright, null)),
            new("monitor-key-locked", true, t => DisplayArt.MonitorKey(t, "Brightness", "QH32", new VcpView(100, 100, DdcStatus.Locked, null), "LOCKED IN HDR")),
            new("input-key", true, t => DisplayArt.InputKey(t, "UW34", "HDMI 1", false, 0)),
            new("input-key-active", true, t => DisplayArt.InputKey(t, "UW34", "DP 1", true, 0)),
            new("input-key-hold", true, t => DisplayArt.InputKey(t, "UW34", "HDMI 1", false, 0.6)),
            new("hold-full", true, t => WinArt.HoldKey(t, 1, "UW34", "→ DP 1")),
            new("zone", true, t => PlacementArt.ZoneKey(t, b, w, 1, ZoneId.LeftHalf, "UW34", app: "Editor")),
            new("zone-quarter", true, t => PlacementArt.ZoneKey(t, b, w, 0, ZoneId.TopRight, "QH32", app: "Browser")),
            new("zone-blocked", true, t => PlacementArt.ZoneKey(t, b, w, 1, ZoneId.RightThird, "UW34", "ADMIN APP", true, blocked: true)),
            new("next-monitor-blocked", true, t => { var d = WinArt.GlyphKey(t, WinGlyphs.NextMonitor, "CAN'T MOVE", false, "FULLSCREEN GAME"); WinArt.AlertMarks(d, t); return d; }),
            new("next-monitor", true, t => WinArt.GlyphKey(t, WinGlyphs.NextMonitor, "NEXT SCREEN", false, "Editor")),
            new("maximize-on", true, t => WinArt.GlyphKey(t, WinGlyphs.Maximize, "MAXIMIZED", true, "Browser")),
            new("maximize-off", true, t => WinArt.GlyphKey(t, WinGlyphs.Maximize, "RESTORED", false, "Browser")),
            new("topmost-on", true, t => WinArt.GlyphKey(t, WinGlyphs.Topmost, "ON TOP", true, "Example Player")),
            new("topmost-off", true, t => WinArt.GlyphKey(t, WinGlyphs.Topmost, "NOT ON TOP", false, "Example Player")),

            new("browser", false, t => WindowArt.Browser(t, new BrowserModel { Index = 2, Count = 9, AppName = "Browser", Title = "The Example Ensemble — tour dates", Thumbnail = wide, Icon = icon2, Active = true })),
            new("browser-front", false, t => WindowArt.Browser(t, new BrowserModel { Index = 0, Count = 9, AppName = "Editor", Title = "notes.example", Thumbnail = wide, Icon = icon, Foreground = true })),
            new("browser-minimized", false, t => WindowArt.Browser(t, new BrowserModel { Index = 5, Count = 9, AppName = "Chat", Title = "General", Icon = icon2, Minimized = true })),
            new("browser-admin-safe", false, t => WindowArt.Browser(t, new BrowserModel { Index = 8, Count = 9, AppName = "Monitor Tool", Thumbnail = wide, Icon = icon, Elevated = true, Flash = "ADMIN APP", FlashAlert = true })),
            new("browser-empty", false, t => WindowArt.Browser(t, new BrowserModel { Count = 0 })),
            new("desktops-dial", false, t => PagerArt.DesktopsDial(t, desktops, true)),
            new("monitor-dial", false, t => DisplayArt.MonitorDial(t, "Brightness", "UW34", bright, null, true)),
            new("monitor-dial-locked", false, t => DisplayArt.MonitorDial(t, "Brightness", "QH32", new VcpView(100, 100, DdcStatus.Locked, null), "LOCKED IN HDR", false)),
            new("monitor-dial-all", false, t => DisplayArt.MonitorDial(t, "Brightness", "ALL", new VcpView(64, 100, DdcStatus.Writing, 64), "3 OF 3 MONITORS", true)),
            new("monitor-dial-reading", false, t => DisplayArt.MonitorDial(t, "Volume", "QH27", null, "READING…", false)),
            new("input-dial", false, t => DisplayArt.InputDial(t, "UW34", inputs, 1, 0x0F, true, null)),
            new("input-dial-armed", false, t => DisplayArt.InputDial(t, "UW34", inputs, 1, 0x0F, true, TimeSpan.FromSeconds(2.2))),
            new("input-dial-reading", false, t => DisplayArt.InputDial(t, "QH27", [], 0, null, false, null)),
            new("placer", false, t => PlacementArt.PlacerDial(t, b, w, 1, ZoneId.LeftHalf, "UW34", "Editor", true)),
            new("placer-quarter", false, t => PlacementArt.PlacerDial(t, b, w, 2, ZoneId.BottomRight, "QH27", "Browser", false)),
            new("placer-blocked", false, t => PlacementArt.PlacerDial(t, b, w, 0, ZoneId.Maximize, "QH32", "Monitor Tool", false, "CAN'T MOVE: ADMIN APP", true)),
        };
        return list;
    }

    /// <summary>A dim stand-in for W2's actions in the layout previews.</summary>
    private static SvgDocument W2(RefractionPalette t, string label) => WinArt.ValueKey(t, label, "W2", "SYSTEM", false, false);

    private static SvgDocument W2Dial(RefractionPalette t, string label)
    {
        var d = Core.Art.DialArt.Base(t);
        WinArt.DialLabel(d, t, label, 16, 20, 170);
        WinArt.Text(d, "W2 (system & firmware)", 16, 56, 16, t.KeyMuted, Core.Render.TextAlign.Start, 170);
        return d;
    }

    public static async Task<int> WriteAsync(string dir)
    {
        await Task.Yield();
        Directory.CreateDirectory(dir);
        var frames = All();
        var themes = new[] { Refraction.Night, Refraction.Day };
        var max = 0;
        long maxBytes = 0;
        foreach (var t in themes)
            foreach (var f in frames)
            {
                var svg = f.Draw(t).ToSvg();
                max = Math.Max(max, Elements(svg));
                maxBytes = Math.Max(maxBytes, DataUri.Svg(svg).Length);
                File.WriteAllText(Path.Combine(dir, $"{(f.Key ? "key" : "dial")}-{t.Name}-{f.Name}.svg"), svg);
            }
        // Layout previews (spec SPEC-windows.md § Layouts) with W2's slots as stand-ins.
        foreach (var t in themes)
        {
            var named = frames.ToDictionary(f => f.Name);
            void Save(string name, SvgDocument d) => File.WriteAllText(Path.Combine(dir, $"layout-{t.Name}-{name}.svg"), d.ToSvg());
            Save("darkmode", W2(t, "DARK MODE")); Save("onair", W2(t, "ON AIR")); Save("clipboard", W2(t, "CLIPBOARD")); Save("lock", W2(t, "LOCK"));
            Save("health", W2Dial(t, "SYSTEM HEALTH")); Save("clipdial", W2Dial(t, "CLIPBOARD"));
        }

        const string css = "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:20px;background:#000;color:#a2a4b4;font:12px Segoe UI,sans-serif}" +
            "h2{color:#f0f0f5;font-size:14px;margin:16px 0 8px}.row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px}" +
            "figure{margin:0;text-align:center}figcaption{margin-top:3px;max-width:150px}img{display:block}" +
            ".galleon{display:flex;gap:24px;align-items:flex-start}.keys{display:grid;grid-template-columns:repeat(3,96px);gap:10px}" +
            ".screen{display:grid;grid-template-columns:360px 360px;grid-template-rows:192px 192px;width:720px;height:384px;background:#000;border:1px solid #222}" +
            ".screen div{display:flex;align-items:center;justify-content:center}.plus{display:grid;grid-template-columns:repeat(4,120px);gap:10px}.strip{display:flex;width:800px;height:100px;margin-top:10px}</style></head><body>";
        var pages = new Dictionary<string, StringBuilder>();
        StringBuilder Page(string f) => pages.TryGetValue(f, out var sb) ? sb : pages[f] = new StringBuilder(css);

        foreach (var t in themes)
        {
            var kp = Page($"keys-{t.Name}.html");
            foreach (var px in new[] { 144, 120, 96, 72 })
            {
                kp.Append($"<h2>Keys at {px} px ({t.Name})</h2><div class=\"row\">");
                foreach (var f in frames.Where(f => f.Key))
                    kp.Append($"<figure><img src=\"key-{t.Name}-{f.Name}.svg\" width=\"{px}\" height=\"{px}\">{(px >= 120 ? $"<figcaption>{f.Name}</figcaption>" : "")}</figure>");
                kp.Append("</div>");
            }
            var dp = Page($"dials-{t.Name}.html");
            dp.Append($"<h2>Widgets at 360×180 (Galleon) and 200×100 (Stream Deck +) ({t.Name})</h2><div class=\"row\">");
            foreach (var f in frames.Where(f => !f.Key))
                dp.Append($"<figure><img src=\"dial-{t.Name}-{f.Name}.svg\" width=\"360\" height=\"180\"><img src=\"dial-{t.Name}-{f.Name}.svg\" width=\"200\" height=\"100\" style=\"margin-top:4px\"><figcaption>{f.Name}</figcaption></figure>");
            dp.Append("</div>");

            var lp = Page($"layouts-{t.Name}.html");
            string K(string n) => n.StartsWith("layout:", StringComparison.Ordinal) ? $"layout-{t.Name}-{n[7..]}.svg" : $"key-{t.Name}-{n}.svg";
            string D(string n) => n.StartsWith("layout:", StringComparison.Ordinal) ? $"layout-{t.Name}-{n[7..]}.svg" : $"dial-{t.Name}-{n}.svg";
            lp.Append($"<h2>Galleon 100 SD \"Windows\" profile ({t.Name}): keys 3×4 at 96 px, screen 720×384</h2><div class=\"galleon\"><div class=\"keys\">");
            foreach (var n in new[] { "window-front", "window-ultrawide", "window-minimized", "window-admin", "desktops", "game-off", "hdr-on", "refresh", "layout:darkmode", "layout:onair", "layout:clipboard", "layout:lock" })
                lp.Append($"<img src=\"{K(n)}\" width=\"96\" height=\"96\">");
            lp.Append("</div><div class=\"screen\">");
            foreach (var n in new[] { "browser", "monitor-dial", "placer", "layout:health" })
                lp.Append($"<div><img src=\"{D(n)}\" width=\"360\" height=\"180\"></div>");
            lp.Append("</div></div>");
            lp.Append($"<h2>Stream Deck + ({t.Name}): keys 4×2 at 120 px, strip 800×100</h2><div class=\"plus\">");
            foreach (var n in new[] { "window-front", "window-ultrawide", "window-streamer-safe", "desktops", "hdr-off", "refresh-keep", "layout:onair", "layout:lock" })
                lp.Append($"<img src=\"{K(n)}\" width=\"120\" height=\"120\">");
            lp.Append("</div><div class=\"strip\">");
            foreach (var n in new[] { "browser-front", "monitor-dial-all", "placer-quarter", "layout:clipdial" })
                lp.Append($"<img src=\"{D(n)}\" width=\"200\" height=\"100\">");
            lp.Append("</div>");
        }
        var index = Page("index.html");
        index.Append("<h2>Windows module (W1) previews</h2>");
        foreach (var file in pages.Keys.Where(k => k != "index.html").ToList()) index.Append($"<p><a style=\"color:#b8a2f2\" href=\"{file}\">{file}</a></p>");
        foreach (var (file, sb) in pages) File.WriteAllText(Path.Combine(dir, file), sb.Append("</body></html>").ToString());
        Console.WriteLine($"wrote {frames.Count * 2} frames (max {max} elements, largest data URL {maxBytes / 1024.0:0.0} KB) + layouts to {Path.GetFullPath(dir)}");
        return 0;
    }

    public static int Elements(string svg)
    {
        var n = 0;
        for (var i = 0; i < svg.Length - 1; i++) if (svg[i] == '<' && svg[i + 1] is not '/' and not '!' and not '?') n++;
        return n - 1;
    }
}

public class RenderTests
{
    [Testing.Test]
    public void Every_frame_variant_is_deck_safe_within_budget_in_both_themes()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
            foreach (var f in Previews.All())
            {
                var doc = f.Draw(t);
                var svg = doc.ToSvg();
                var errors = SvgLint.Check(svg, f.Key ? SvgCanvas.Key : SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error).ToList();
                Testing.Assert.Empty(errors.Select(e => $"{f.Name} ({t.Name}): {e}"));
                Testing.Assert.True(doc.ElementCount < 120, $"{f.Name}: {doc.ElementCount} elements (budget 300; we keep well under)");
                Testing.Assert.True(DataUri.Svg(svg).Length < 64 * 1024, $"{f.Name}: {DataUri.Svg(svg).Length / 1024} KB (the lab's comfortable frame size is 64 KB)");
                Testing.Assert.DoesNotContain("<text", svg);
                Testing.Assert.DoesNotContain("rgba(", svg);
                Testing.Assert.DoesNotContain("clipPath", svg);
            }
    }
}
