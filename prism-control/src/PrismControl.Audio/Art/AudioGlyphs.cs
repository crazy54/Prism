using PrismControl.Core.Render;

namespace PrismControl.Audio.Art;

/// <summary>Audio glyphs drawn in a 64-unit box (scale/translate with a group). Few elements each.</summary>
internal static class AudioGlyphs
{
    /// <summary>A speaker with 0-3 sound waves.</summary>
    public static void Speaker(SvgDocument d, Color color, int waves = 2)
    {
        var body = new PathBuilder().MoveTo(6, 24).LineTo(18, 24).LineTo(32, 10).LineTo(32, 54).LineTo(18, 40).LineTo(6, 40).Close();
        d.Path(body, new Style { Fill = color, LineJoin = LineJoin.Round });
        if (waves <= 0) return;
        var arcs = new PathBuilder();
        for (var i = 0; i < Math.Min(waves, 3); i++) arcs.Arc(32, 32, 10 + i * 9, -42, 42);
        d.Path(arcs, Style.Stroked(color, 4.5));
    }

    /// <summary>A speaker with an X: muted output.</summary>
    public static void SpeakerMuted(SvgDocument d, Color color)
    {
        Speaker(d, color, 0);
        var x = new PathBuilder().MoveTo(41, 23).LineTo(58, 41).MoveTo(58, 23).LineTo(41, 41);
        d.Path(x, Style.Stroked(color, 5));
    }

    /// <summary>A capsule microphone on a stand.</summary>
    public static void Mic(SvgDocument d, Color color)
    {
        d.Rect(22, 4, 20, 36, color, rx: 10);
        var stand = new PathBuilder().Arc(32, 28, 17, 0, 180).MoveTo(32, 45).LineTo(32, 56).MoveTo(22, 58).LineTo(42, 58);
        d.Path(stand, Style.Stroked(color, 4.5) with { LineJoin = LineJoin.Round });
    }

    /// <summary>A microphone with a slash; <paramref name="cut"/> is the background color that separates the slash from the mic.</summary>
    public static void MicMuted(SvgDocument d, Color color, Color cut)
    {
        Mic(d, color);
        d.Line(9, 7, 55, 59, cut, 11);
        d.Line(9, 7, 55, 59, color, 5);
    }

    /// <summary>Three mixer sliders.</summary>
    public static void Sliders(SvgDocument d, Color color)
    {
        var rails = new PathBuilder();
        foreach (var x in new[] { 14.0, 32, 50 }) rails.MoveTo(x, 8).LineTo(x, 56);
        d.Path(rails, Style.Stroked(color, 4) with { Opacity = 0.45 });
        var knobs = new PathBuilder().RoundedRect(6, 34, 16, 9, 3).RoundedRect(24, 16, 16, 9, 3).RoundedRect(42, 28, 16, 9, 3);
        d.Path(knobs, new Style { Fill = color });
    }

    /// <summary>A level-meter glyph (three bars).</summary>
    public static void Bars(SvgDocument d, Color color)
    {
        var p = new PathBuilder().RoundedRect(8, 30, 12, 26, 3).RoundedRect(26, 14, 12, 42, 3).RoundedRect(44, 36, 12, 20, 3);
        d.Path(p, new Style { Fill = color });
    }

    /// <summary>Draws a glyph into a box at (x, y) with side <paramref name="size"/>.</summary>
    public static void At(SvgDocument d, double x, double y, double size, Action<SvgDocument> draw)
    {
        using (d.Group(Transform.Translate(x, y).Then(Transform.Scale(size / 64.0))))
            draw(d);
    }

    /// <summary>A small chevron pointing left (dir -1) or right (dir +1), centered at (cx, cy).</summary>
    public static void Chevron(SvgDocument d, double cx, double cy, double h, int dir, Paint color, double width = 3)
    {
        var w = h * 0.55 * dir;
        var p = new PathBuilder().MoveTo(cx - w / 2, cy - h / 2).LineTo(cx + w / 2, cy).LineTo(cx - w / 2, cy + h / 2);
        d.Path(p, Style.Stroked(color, width) with { LineJoin = LineJoin.Round });
    }
}
