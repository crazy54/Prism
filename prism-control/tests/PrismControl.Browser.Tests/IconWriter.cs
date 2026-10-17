using System.Text;
using PrismControl.Browser.Render;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Browser.Tests;

/// <summary>
/// <c>-- --write-icons &lt;imgs dir&gt;</c>: writes plugin/imgs/actions/browser/&lt;id&gt;/{icon,key,dial}.svg from
/// <see cref="BrowserGlyphs"/>, in the family's three forms (like assets/src/build-icons.mjs does for the core icons):
/// the 20 px action-list icon (white hairlines on transparent), the 144 key (material, glyph, hue index) and the
/// dial icon (material, a 3/4 gauge arc, glyph).
/// </summary>
public static class IconWriter
{
    public static readonly (string Id, IconGlyph Glyph, bool Dial)[] Actions =
    [
        ("tab", BrowserGlyphs.Tab, false), ("tabs", BrowserGlyphs.Tabs, true), ("media", BrowserGlyphs.Media, false),
        ("scrub", BrowserGlyphs.Scrub, true), ("speed", BrowserGlyphs.Speed, true), ("page", BrowserGlyphs.Page, true),
        ("download", BrowserGlyphs.Download, false), ("site", BrowserGlyphs.Site, false), ("nav", BrowserGlyphs.Nav, false),
        ("reopen", BrowserGlyphs.Reopen, false), ("group", BrowserGlyphs.Group, false), ("split", BrowserGlyphs.Split, false),
        ("privacy", BrowserGlyphs.Privacy, false), ("panic", BrowserGlyphs.Panic, false), ("meet", BrowserGlyphs.Meet, false),
        ("preview", BrowserGlyphs.Preview, true),
    ];

    public static int Write(string imgsDir)
    {
        var count = 0;
        foreach (var (id, glyph, dial) in Actions)
        {
            var dir = Path.Combine(imgsDir, "actions", "browser", id);
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, "icon.svg"), ListIcon(glyph));
            File.WriteAllText(Path.Combine(dir, "key.svg"), KeyIcon(glyph));
            count += 2;
            // Every action gets a dial image path only if it is an encoder action; keys never reference dial.svg.
            if (dial) { File.WriteAllText(Path.Combine(dir, "dial.svg"), DialIcon(glyph)); count++; }
        }
        Console.WriteLine($"wrote {count} icons to {Path.GetFullPath(imgsDir)}");
        return 0;
    }

    /// <summary>The action-list icon: white strokes (accents too), solid parts filled white, no facets.</summary>
    public static string ListIcon(IconGlyph g)
    {
        var sb = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\"><g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\">");
        foreach (var p in g.Parts)
        {
            switch (p.Ink)
            {
                case IconInk.Stroke or IconInk.Accent:
                    sb.Append("<path d=\"").Append(p.PathData).Append("\" stroke=\"#ffffff\"");
                    if (p.Opacity < 1) sb.Append(" stroke-opacity=\"").Append(Math.Round(p.Opacity, 3).ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)).Append('"');
                    sb.Append("/>");
                    break;
                case IconInk.Solid or IconInk.AccentSolid:
                    sb.Append("<path d=\"").Append(p.PathData).Append("\" fill=\"#ffffff\" stroke=\"none\"/>");
                    break;
            }
        }
        return sb.Append("</g></svg>").ToString();
    }

    public static string KeyIcon(IconGlyph g)
    {
        var t = Refraction.Night;
        var hue = BrowserArt.Hue(t);
        var d = KeyArt.Base(t, hue);
        Icons.DrawOnKey(d, g, t, hue, 36, 30, 72);
        KeyArt.HueIndex(d, hue, false);
        return d.ToSvg();
    }

    public static string DialIcon(IconGlyph g)
    {
        var t = Refraction.Night;
        var hue = BrowserArt.Hue(t);
        var d = KeyArt.Base(t, hue);
        d.Path(new PathBuilder().Arc(72, 72, 57, 135, 405), new Style { Fill = Paint.None, Stroke = t.KeyMuted.WithOpacity(0.3), StrokeWidth = 4, LineCap = LineCap.Round });
        d.Path(new PathBuilder().Arc(72, 72, 57, 135, 300), new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 4, LineCap = LineCap.Round });
        var (kx, ky) = PathBuilder.Polar(72, 72, 57, 300);
        d.Circle(kx, ky, 6, hue.Ink);
        Icons.DrawOnKey(d, g, t, hue, 42, 42, 60);
        return d.ToSvg();
    }
}
