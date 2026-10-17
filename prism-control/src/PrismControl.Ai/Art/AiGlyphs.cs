using PrismControl.Core.Render;

namespace PrismControl.Ai.Art;

/// <summary>One path of an AI glyph in the 24-unit grid. <see cref="Fill"/> parts are solid; the rest are strokes.</summary>
public sealed record GlyphPart(string D, bool Fill = false, bool Accent = false);

/// <summary>
/// The AI module's glyphs, drawn in Prism Control's icon grammar (24-unit grid, round caps and joins). Generic shapes only:
/// a spark for "agent", a terminal, a shield, a bubble. No vendor logos (brief rule).
/// </summary>
public static class AiGlyphs
{
    public static readonly GlyphPart[] Spark = [new("M12 2.5C12.7 8.2 15.8 11.3 21.5 12C15.8 12.7 12.7 15.8 12 21.5C11.3 15.8 8.2 12.7 2.5 12C8.2 11.3 11.3 8.2 12 2.5Z")];
    public static readonly GlyphPart[] Working = [new("M12 4A8 8 0 1 1 4 12"), new("M12 4A8 8 0 0 0 6.3 6.3", Accent: true)];
    public static readonly GlyphPart[] Permission = [new("M12 3L19 6V11.5C19 15.8 16 19.2 12 21C8 19.2 5 15.8 5 11.5V6Z"), new("M12 8.3V12.9M12 16V16.1", Accent: true)];
    public static readonly GlyphPart[] Input = [new("M5 5H19A2 2 0 0 1 21 7V15A2 2 0 0 1 19 17H11L7 20.5V17H5A2 2 0 0 1 3 15V7A2 2 0 0 1 5 5Z"),
        new("M9.7 9.1A2.3 2.3 0 1 1 13.2 11.1C12.4 11.6 12 12 12 12.9M12 14.9V15", Accent: true)];
    public static readonly GlyphPart[] Done = [new("M5 12.5L10 17.5L19 7.5")];
    public static readonly GlyphPart[] Error = [new("M12 3.5L21.5 20H2.5Z"), new("M12 9.5V14M12 16.9V17", Accent: true)];
    public static readonly GlyphPart[] Idle = [new("M12 8A4 4 0 1 1 11.99 8Z")];
    public static readonly GlyphPart[] Ended = [new("M7 12H17")];
    public static readonly GlyphPart[] Dead = [new("M12 4A8 8 0 1 1 11.99 4Z"), new("M9.2 9.2L14.8 14.8M14.8 9.2L9.2 14.8", Accent: true)];
    public static readonly GlyphPart[] Stale = [new("M12 4A8 8 0 1 1 11.99 4Z"), new("M12 7.5V12L15 14", Accent: true)];
    public static readonly GlyphPart[] Lock = [new("M7 11H17A1.5 1.5 0 0 1 18.5 12.5V18.5A1.5 1.5 0 0 1 17 20H7A1.5 1.5 0 0 1 5.5 18.5V12.5A1.5 1.5 0 0 1 7 11Z"), new("M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11")];
    public static readonly GlyphPart[] Approve = [new("M12 3A9 9 0 1 1 11.99 3Z"), new("M7.8 12.3L10.8 15.2L16.4 9.2", Accent: true)];
    public static readonly GlyphPart[] Deny = [new("M12 3A9 9 0 1 1 11.99 3Z"), new("M9 9L15 15M15 9L9 15", Accent: true)];
    public static readonly GlyphPart[] Next = [new("M4.5 12H18.5M13.5 7L18.5 12L13.5 17", Accent: true), new("M21 5V19")];
    public static readonly GlyphPart[] Eye = [new("M2.5 12C5 7.5 8.5 5.5 12 5.5C15.5 5.5 19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5C8.5 18.5 5 16.5 2.5 12Z"), new("M12 9A3 3 0 1 1 11.99 9Z", Accent: true)];
    public static readonly GlyphPart[] EyeOff = [new("M2.5 12C5 7.5 8.5 5.5 12 5.5C15.5 5.5 19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5C8.5 18.5 5 16.5 2.5 12Z"), new("M4 4L20 20", Accent: true)];
    public static readonly GlyphPart[] Terminal = [new("M5 5H19A2 2 0 0 1 21 7V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17V7A2 2 0 0 1 5 5Z"), new("M7 10L10 12.5L7 15M12.5 15H16.5", Accent: true)];
    public static readonly GlyphPart[] Fleet = [new("M4 5H10V11H4ZM14 5H20V11H14ZM4 13H10V19H4Z"), new("M14 13H20V19H14Z", Accent: true)];
    public static readonly GlyphPart[] Card = [new("M4 4H20A1.5 1.5 0 0 1 21.5 5.5V18.5A1.5 1.5 0 0 1 20 20H4A1.5 1.5 0 0 1 2.5 18.5V5.5A1.5 1.5 0 0 1 4 4Z"), new("M6 9H18M6 13H14", Accent: true), new("M6 16.5H10")];
    public static readonly GlyphPart[] OnAir = [new("M5.5 6.5A9 9 0 0 0 5.5 17.5M18.5 6.5A9 9 0 0 1 18.5 17.5M8.3 9.2A5 5 0 0 0 8.3 14.8M15.7 9.2A5 5 0 0 1 15.7 14.8"), new("M12 10.4A1.6 1.6 0 1 1 11.99 10.4Z", Fill: true, Accent: true)];

    /// <summary>
    /// Draws <paramref name="glyph"/> with its grid's top-left at (x, y), <paramref name="size"/> units wide. Hollow (inferred)
    /// glyphs draw fills as outlines and dim the accent.
    /// </summary>
    public static void Draw(SvgDocument d, GlyphPart[] glyph, double x, double y, double size, Color ink, Color accent,
        double strokeGrid = 1.75, bool hollow = false, double opacity = 1)
    {
        var scale = size / 24.0;
        using (d.Group(new Style { Transform = Transform.Translate(x, y).Scale2(scale), Opacity = opacity < 1 ? opacity : null }))
        {
            foreach (var p in glyph)
            {
                var color = p.Accent ? accent : ink;
                if (p.Fill && !hollow) d.Path(p.D, new Style { Fill = color });
                else d.Path(p.D, new Style
                {
                    Fill = Paint.None,
                    Stroke = color,
                    StrokeWidth = strokeGrid,
                    LineCap = LineCap.Round,
                    LineJoin = LineJoin.Round,
                    Opacity = hollow && p.Accent ? 0.6 : null,
                    Dash = hollow && !p.Accent ? [2.2, 1.6] : null,
                });
            }
        }
    }

    /// <summary>The 20×20 action-list icon (white strokes on transparent), as the manifest expects.</summary>
    public static string ActionIcon(GlyphPart[] glyph)
    {
        var parts = string.Concat(glyph.Select(p => p.Fill
            ? $"<path d=\"{p.D}\" fill=\"#ffffff\" stroke=\"none\"/>"
            : $"<path d=\"{p.D}\" stroke=\"#ffffff\"/>"));
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 24 24\">" +
               "<g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\">" + parts + "</g></svg>";
    }
}
