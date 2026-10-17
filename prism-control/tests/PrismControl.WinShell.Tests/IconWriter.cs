using System.Globalization;
using System.Reflection;
using System.Text;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// <c>-- --write-icons src/PrismControl.WinShell/plugin/imgs/actions/windows</c>: writes every action's manifest images
/// from the same glyph paths the runtime art uses: icon.svg (20×20 white hairline for the actions list), key.svg (the
/// Night key with the glyph) and dial.svg (encoders: the glyph inside a dial arc).
/// </summary>
public static class IconWriter
{
    public static IReadOnlyList<(string Id, IconGlyph Glyph, bool Encoder)> Actions()
    {
        var list = new List<(string, IconGlyph, bool)>();
        foreach (var t in typeof(WinShellModule).Assembly.GetTypes())
        {
            if (t.GetCustomAttribute<StreamDeckActionAttribute>() is not { } a || !a.Uuid.StartsWith("com.jeremyfhall.prismcontrol.windows.", StringComparison.Ordinal)) continue;
            var id = a.Uuid["com.jeremyfhall.prismcontrol.windows.".Length..];
            var glyph = AllGlyphs().FirstOrDefault(g => g.Id == "windows." + id) ?? throw new InvalidOperationException($"no glyph for {id}");
            list.Add((id, glyph, a.Controllers.HasFlag(Controllers.Encoder)));
        }
        return list.OrderBy(x => x.Item1, StringComparer.Ordinal).ToList();
    }

    /// <summary>
    /// W1's glyphs plus W2's (<c>PrismControl.WinShell.Sys.SysGlyphs.All</c>, a static property or field). W2's type is found by
    /// reflection, so this builds before and after W2's System/SysGlyphs.cs lands; once it exists the effect is exactly
    /// <c>WinGlyphs.All.Concat(SysGlyphs.All)</c>.
    /// </summary>
    public static IEnumerable<IconGlyph> AllGlyphs()
    {
        var sys = typeof(WinShellModule).Assembly.GetType("PrismControl.WinShell.Sys.SysGlyphs");
        const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
        var extra = (sys?.GetProperty("All", flags)?.GetValue(null) ?? sys?.GetField("All", flags)?.GetValue(null)) as IEnumerable<IconGlyph>;
        return WinGlyphs.All.Concat(extra ?? []);
    }

    public static int Write(string dir)
    {
        foreach (var (id, glyph, encoder) in Actions())
        {
            var folder = Path.Combine(dir, id);
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "icon.svg"), ListIcon(glyph));
            File.WriteAllText(Path.Combine(folder, "key.svg"), WinArt.GlyphKey(Refraction.Night, glyph).ToSvg());
            if (encoder) File.WriteAllText(Path.Combine(folder, "dial.svg"), DialIcon(glyph).ToSvg());
            Console.WriteLine($"  {id}: icon, key{(encoder ? ", dial" : "")}");
        }
        Console.WriteLine($"wrote the manifest images to {Path.GetFullPath(dir)}");
        return 0;
    }

    /// <summary>The 20×20 actions-list icon: white strokes on transparent, facets dropped.</summary>
    public static string ListIcon(IconGlyph g)
    {
        var sb = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\"><g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\">");
        foreach (var p in g.Parts)
        {
            var op = p.Opacity < 1 ? $" stroke-opacity=\"{p.Opacity.ToString("0.##", CultureInfo.InvariantCulture)}\"" : "";
            switch (p.Ink)
            {
                case IconInk.Stroke or IconInk.Accent: sb.Append($"<path d=\"{p.PathData}\" stroke=\"#ffffff\"{op}/>"); break;
                case IconInk.Solid or IconInk.AccentSolid: sb.Append($"<path d=\"{p.PathData}\" fill=\"#ffffff\" stroke=\"none\"/>"); break;
            }
        }
        return sb.Append("</g></svg>").ToString();
    }

    /// <summary>The encoder icon: the glyph inside a 270° dial arc lit in the hue.</summary>
    public static SvgDocument DialIcon(IconGlyph g)
    {
        var t = Refraction.Night;
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue);
        const double c = 72, r = 57;
        d.Path(new PathBuilder().Arc(c, c, r, 135, 405), new Style { Fill = Paint.None, Stroke = t.KeyMuted, StrokeWidth = 4, Opacity = 0.3, LineCap = LineCap.Round });
        d.Path(new PathBuilder().Arc(c, c, r, 135, 315), new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 4, LineCap = LineCap.Round });
        var (kx, ky) = PathBuilder.Polar(c, c, r, 315);
        d.Circle(kx, ky, 6, hue.Ink);
        Icons.DrawOnKey(d, g, t, hue, 42, 42, 60);
        return d;
    }
}
