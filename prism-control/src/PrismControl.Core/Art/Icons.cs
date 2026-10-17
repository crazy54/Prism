using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Core.Art;

// OWNER: visual designer. The glyph table (Icons.g.cs) is generated from assets/src/icons.src.mjs by
// `node assets/src/build-icons.mjs`, which also writes every action icon, default key image and dial icon from the same
// geometry. Use these glyphs on keys so runtime art and the manifest images are one family.

/// <summary>How a glyph part is painted.</summary>
public enum IconInk
{
    /// <summary>A stroke in the ink color.</summary>
    Stroke,
    /// <summary>A stroke in the accent (the domain hue on keys; white in the action list).</summary>
    Accent,
    /// <summary>A "glass facet": a hue wash under the strokes (keys only).</summary>
    Facet,
    /// <summary>A solid fill in the ink color.</summary>
    Solid,
    /// <summary>A solid fill in the accent.</summary>
    AccentSolid,
}

/// <summary>One path of a glyph, in 24-unit grid coordinates.</summary>
public sealed record IconPart(IconInk Ink, string PathData, double Opacity = 1);

/// <summary>A glyph of the Prism Control icon family: "&lt;domain&gt;.&lt;action id&gt;" (or "prism-control", "audio.mic-off").</summary>
public sealed record IconGlyph(string Id, IconPart[] Parts);

/// <summary>
/// Prism Control's hairline icon family, drawn in Prism's Refraction grammar: 24-unit grid, 1.5 stroke, round caps and
/// joins, live area about 3–21. At rest the glyph is ink; its accent parts and glass facets take the domain hue.
/// </summary>
public static partial class Icons
{
    public const double Grid = 24;
    public const double Stroke = 1.5;

    // Lazy: static initializers of a partial class run in file order, and Generated lives in Icons.g.cs.
    private static Dictionary<string, IconGlyph>? _byId;
    private static Dictionary<string, IconGlyph> ById => _byId ??= Generated.ToDictionary(g => g.Id, StringComparer.Ordinal);

    public static IReadOnlyList<IconGlyph> All => Generated;

    public static IconGlyph Get(string id) =>
        ById.TryGetValue(id, out var g) ? g : throw new KeyNotFoundException($"No icon '{id}' (see assets/src/icons.src.mjs).");

    public static bool TryGet(string id, out IconGlyph glyph) => ById.TryGetValue(id, out glyph!);

    /// <summary>
    /// Draws <paramref name="glyph"/> with its 24-unit grid's top-left at (<paramref name="x"/>, <paramref name="y"/>),
    /// <paramref name="size"/> units wide. Ink parts use <paramref name="ink"/>, accent parts <paramref name="accent"/>,
    /// facets <paramref name="facet"/> (pass null for none). One element per part, inside one group.
    /// </summary>
    public static void Draw(SvgDocument d, IconGlyph glyph, double x, double y, double size, Color ink, Color accent, Paint? facet = null,
        double strokeWidth = Stroke)
    {
        var group = new Style
        {
            Fill = Paint.None,
            StrokeWidth = strokeWidth,
            LineCap = LineCap.Round,
            LineJoin = LineJoin.Round,
            Transform = Transform.Translate(x, y).Scale2(size / Grid),
        };
        using (d.Group(group))
        {
            if (facet is { } f)
                foreach (var p in glyph.Parts)
                    if (p.Ink == IconInk.Facet) d.Path(p.PathData, new Style { Fill = f.Fade(p.Opacity), Stroke = Paint.None });
            foreach (var p in glyph.Parts)
            {
                switch (p.Ink)
                {
                    case IconInk.Stroke or IconInk.Accent:
                        d.Path(p.PathData, new Style { Stroke = Paint.Solid(p.Ink == IconInk.Accent ? accent : ink, p.Opacity) });
                        break;
                    case IconInk.Solid or IconInk.AccentSolid:
                        d.Path(p.PathData, new Style { Fill = Paint.Solid(p.Ink == IconInk.AccentSolid ? accent : ink, p.Opacity), Stroke = Paint.None });
                        break;
                }
            }
        }
    }

    /// <summary>Key colors for a glyph: ink at rest (hue ink when on), the hue for accents, a hue-glass facet.</summary>
    public static void DrawOnKey(SvgDocument d, IconGlyph glyph, RefractionPalette t, SpectrumColor hue, double x, double y, double size, bool on = false)
    {
        var facet = hue.Vivid.WithOpacity((t.IsDark ? 0.22 : 0.18) * (on ? 1.4 : 1));
        Draw(d, glyph, x, y, size, on ? hue.Ink : t.KeyInk, hue.Ink, facet);
    }
}
