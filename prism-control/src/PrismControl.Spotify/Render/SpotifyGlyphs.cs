using PrismControl.Core.Render;

namespace PrismControl.Spotify.Render;

/// <summary>Transport and state glyphs in a 64-unit box (like Core.Art.Glyphs). Generic shapes only: no Spotify marks.</summary>
public static class SpotifyGlyphs
{
    private static Style Stroke(Color c, double w = 5) => Style.Stroked(c, w) with { LineJoin = LineJoin.Round };

    public static void Play(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().MoveTo(20, 10).LineTo(52, 32).LineTo(20, 54).Close(), new Style { Fill = c, Stroke = c, StrokeWidth = 4, LineJoin = LineJoin.Round });

    public static void Pause(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().RoundedRect(14, 10, 12, 44, 3).RoundedRect(38, 10, 12, 44, 3), new Style { Fill = c });

    public static void Next(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().MoveTo(12, 12).LineTo(40, 32).LineTo(12, 52).Close().RoundedRect(43, 12, 8, 40, 2),
            new Style { Fill = c, Stroke = c, StrokeWidth = 3, LineJoin = LineJoin.Round });

    public static void Previous(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().MoveTo(52, 12).LineTo(24, 32).LineTo(52, 52).Close().RoundedRect(13, 12, 8, 40, 2),
            new Style { Fill = c, Stroke = c, StrokeWidth = 3, LineJoin = LineJoin.Round });

    public static void Heart(SvgDocument d, Color c, bool filled)
    {
        var p = new PathBuilder().MoveTo(32, 54)
            .CubicTo(12, 40, 5, 29, 11, 19).CubicTo(17, 9, 28, 10, 32, 19)
            .CubicTo(36, 10, 47, 9, 53, 19).CubicTo(59, 29, 52, 40, 32, 54).Close();
        d.Path(p, filled ? new Style { Fill = c, Stroke = c, StrokeWidth = 3, LineJoin = LineJoin.Round } : Stroke(c, 4.5));
    }

    public static void Shuffle(SvgDocument d, Color c)
    {
        var p = new PathBuilder()
            .MoveTo(8, 18).LineTo(17, 18).CubicTo(30, 18, 32, 46, 46, 46).LineTo(55, 46)
            .MoveTo(8, 46).LineTo(17, 46).CubicTo(30, 46, 32, 18, 46, 18).LineTo(55, 18)
            .MoveTo(48, 11).LineTo(55, 18).LineTo(48, 25)
            .MoveTo(48, 39).LineTo(55, 46).LineTo(48, 53);
        d.Path(p, Stroke(c, 4.5));
    }

    /// <summary>The repeat loop; <paramref name="one"/> adds the "1" badge (repeat track).</summary>
    public static void Repeat(SvgDocument d, Color c, bool one, Color badgeInk)
    {
        var p = new PathBuilder()
            .MoveTo(10, 36).LineTo(10, 28).CubicTo(10, 21, 15, 17, 22, 17).LineTo(52, 17)
            .MoveTo(46, 10).LineTo(53, 17).LineTo(46, 24)
            .MoveTo(54, 28).LineTo(54, 36).CubicTo(54, 43, 49, 47, 42, 47).LineTo(12, 47)
            .MoveTo(18, 40).LineTo(11, 47).LineTo(18, 54);
        d.Path(p, Stroke(c, 4.5));
        if (one)
        {
            d.Circle(32, 32, 9.5, c);
            d.Text("1", 32, 32, 18, badgeInk, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle);
        }
    }

    /// <summary>A left chevron ("‹ Back").</summary>
    public static void Back(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().MoveTo(40, 12).LineTo(20, 32).LineTo(40, 52), Stroke(c, 6));

    /// <summary>A small play triangle for list rows.</summary>
    public static void PlaySmall(SvgDocument d, Color c, double x, double y, double size)
    {
        d.Path(new PathBuilder().MoveTo(x, y).LineTo(x + size * 0.86, y + size / 2).LineTo(x, y + size).Close(),
            new Style { Fill = c, Stroke = c, StrokeWidth = size * 0.12, LineJoin = LineJoin.Round });
    }
}
