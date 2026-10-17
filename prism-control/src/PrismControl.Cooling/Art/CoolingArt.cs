using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Cooling.Art;

/// <summary>
/// Series colors for cooling charts, in fixed order by entity (never by rank): CPU temperature, pump, radiator fans,
/// case fans. They are the Refraction spectrum's Day "vivid" steps (coral, periwinkle, cyan, citrine) and pass the
/// dataviz validator (lightness band, chroma floor, adjacent CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, ≥ 3:1 contrast) on
/// BOTH the Night key surface (#0b0d14) and the Day one (#f4f3f8), so one set serves both themes. Coolant and
/// unassigned fans are neutral (muted ink). Lanes are small multiples with text labels, so color is never the only cue.
/// </summary>
public static class CoolingColors
{
    public static Color Cpu => Refraction.Day.Spectrum[10].Vivid;      // coral  #de6448
    public static Color Pump => Refraction.Day.Spectrum[1].Vivid;      // periwinkle #6783ec
    public static Color Radiator => Refraction.Day.Spectrum[4].Vivid;  // cyan   #009995
    public static Color Case => Refraction.Day.Spectrum[8].Vivid;      // citrine #ac8300

    public static Color Neutral(RefractionPalette t) => t.KeyMuted;

    /// <summary>The hue of a single-series key for a role (unassigned fans use the radiator cyan: "a fan").</summary>
    public static Color ForRole(CoolingRole role) => role switch
    {
        CoolingRole.Case => Case,
        CoolingRole.Pump => Pump,
        _ => Radiator,
    };

    /// <summary>Color in multi-series views: unassigned/GPU fans stay neutral so they never read as radiator fans.</summary>
    public static Color ForGroupMember(RefractionPalette t, CoolingRole role) => role switch
    {
        CoolingRole.Radiator => Radiator,
        CoolingRole.Case => Case,
        CoolingRole.Pump => Pump,
        _ => Neutral(t),
    };

    public static Color ForGroup(RefractionPalette t, FanGroup g) => g switch
    {
        FanGroup.Radiator => Radiator,
        FanGroup.Case => Case,
        FanGroup.Pump => Pump,
        FanGroup.AllFans => Radiator,
        _ => Neutral(t),
    };

    /// <summary>The spectral index hue for cooling keys (the designer maps "cooling" in Hues.For).</summary>
    public static SpectrumColor Index(RefractionPalette t) => Hues.For(t, "cooling");
}

public enum CoolingGlyph { Fan, Pump, Group }

/// <summary>Vector glyphs (no logos): a 4-blade fan and a pump impeller, with "spin" arcs whose count shows the level.</summary>
public static class CoolingGlyphs
{
    /// <summary>A 4-blade fan centered at (cx, cy), blade radius r. <paramref name="level"/> (0..1) adds 0-3 spin arcs.</summary>
    public static void Fan(SvgDocument d, double cx, double cy, double r, Color color, double level, double rotation = 0)
    {
        var blades = new PathBuilder();
        for (var i = 0; i < 4; i++)
        {
            var a = rotation + i * 90;
            var p0 = P(cx, cy, r * 0.24, a - 26);
            var c1 = P(cx, cy, r * 0.78, a - 38);
            var c2 = P(cx, cy, r * 1.06, a + 2);
            var p1 = P(cx, cy, r * 0.97, a + 26);
            var c3 = P(cx, cy, r * 0.72, a + 40);
            var c4 = P(cx, cy, r * 0.44, a + 34);
            var p2 = P(cx, cy, r * 0.24, a + 30);
            blades.MoveTo(p0.X, p0.Y).CubicTo(c1.X, c1.Y, c2.X, c2.Y, p1.X, p1.Y).CubicTo(c3.X, c3.Y, c4.X, c4.Y, p2.X, p2.Y).Close();
        }
        blades.Circle(cx, cy, r * 0.27);
        d.Path(blades, new Style { Fill = color });
        Spin(d, cx, cy, r * 1.3, r * 0.14, color, level);
    }

    /// <summary>A pump: a housing ring with a 6-vane impeller.</summary>
    public static void Pump(SvgDocument d, double cx, double cy, double r, Color color, double level)
    {
        d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = r * 0.16 });
        var vanes = new PathBuilder();
        for (var i = 0; i < 6; i++)
        {
            var a = i * 60;
            var s = P(cx, cy, r * 0.22, a);
            var c = P(cx, cy, r * 0.62, a + 8);
            var e = P(cx, cy, r * 0.72, a + 42);
            vanes.MoveTo(s.X, s.Y).QuadTo(c.X, c.Y, e.X, e.Y);
        }
        d.Path(vanes, Style.Stroked(color, r * 0.13));
        d.Circle(cx, cy, r * 0.2, color);
        Spin(d, cx, cy, r * 1.32, r * 0.14, color, level);
    }

    /// <summary>Three small fans in a row (the group key).</summary>
    public static void Group(SvgDocument d, double cx, double cy, double r, Color color, double level)
    {
        var s = r * 0.52;
        var blades = new PathBuilder();
        foreach (var ox in new[] { -1.9, 0, 1.9 })
        {
            var x = cx + ox * s;
            for (var i = 0; i < 4; i++)
            {
                var a = i * 90 + 20;
                var p0 = P(x, cy, s * 0.2, a - 26);
                var c1 = P(x, cy, s * 0.8, a - 36);
                var p1 = P(x, cy, s * 0.95, a + 22);
                var c2 = P(x, cy, s * 0.55, a + 38);
                var p2 = P(x, cy, s * 0.2, a + 30);
                blades.MoveTo(p0.X, p0.Y).QuadTo(c1.X, c1.Y, p1.X, p1.Y).QuadTo(c2.X, c2.Y, p2.X, p2.Y).Close();
            }
        }
        d.Path(blades, new Style { Fill = color });
        var under = new PathBuilder().MoveTo(cx - 2.5 * s, cy + s * 1.45).LineTo(cx + 2.5 * s, cy + s * 1.45);
        var arcs = Math.Clamp(level, 0, 1);
        d.Path(under, Style.Stroked(color, s * 0.24) with { Opacity = 0.35 + 0.65 * arcs });
    }

    /// <summary>0-3 arcs outside the glyph: none when stopped, more as it spins faster.</summary>
    private static void Spin(SvgDocument d, double cx, double cy, double r, double w, Color color, double level)
    {
        var n = level <= 0.02 ? 0 : level < 0.34 ? 1 : level < 0.67 ? 2 : 3;
        if (n == 0) return;
        var p = new PathBuilder();
        for (var i = 0; i < n; i++)
        {
            var start = -70 + i * 120;
            p.Arc(cx, cy, r, start, start + 46);
        }
        d.Path(p, Style.Stroked(color, w) with { Opacity = 0.75 });
    }

    private static (double X, double Y) P(double cx, double cy, double r, double deg) => PathBuilder.Polar(cx, cy, r, deg);
}

/// <summary>A plot rectangle: left, top, right, bottom.</summary>
public readonly record struct PlotBox(double X0, double Y0, double X1, double Y1)
{
    public double W => X1 - X0;
    public double H => Y1 - Y0;
}

/// <summary>Line/area charts on a time axis, following the dataviz mark specs (2 px lines with round joins, ~12 % area
/// wash, end-dot with a surface ring, recessive solid hairline grid).</summary>
public static class CoolingCharts
{
    /// <summary>Samples further apart than this are a gap (the service was not sampling): the line breaks.</summary>
    public const long GapMs = 3500;

    /// <summary>A y-range covering the values, at least <paramref name="minSpan"/> tall, padded, optionally clamped at <paramref name="floor"/>.</summary>
    public static (double Lo, double Hi) Range(IEnumerable<double> values, double minSpan, double? floor = null, double pad = 0.12)
    {
        var list = values.Where(double.IsFinite).ToList();
        if (list.Count == 0) return (0, Math.Max(1, minSpan));
        double lo = list.Min(), hi = list.Max();
        var span = hi - lo;
        if (span < minSpan)
        {
            var mid = (hi + lo) / 2;
            lo = mid - minSpan / 2;
            hi = mid + minSpan / 2;
            span = minSpan;
        }
        lo -= span * pad;
        hi += span * pad;
        if (floor is { } f && lo < f) { hi += f - lo; lo = f; }
        return (lo, hi);
    }

    /// <summary>Projects points into the box, averaging into ~1-unit buckets and breaking at gaps.</summary>
    public static List<List<(double X, double Y)>> Project(IReadOnlyList<HistoryPoint> pts, PlotBox box, long t0, long t1, double lo, double hi)
    {
        var segments = new List<List<(double X, double Y)>>();
        if (pts.Count == 0 || t1 <= t0 || hi <= lo) return segments;
        List<(double X, double Y)>? seg = null;
        long lastT = long.MinValue;
        int bucket = int.MinValue;
        double sum = 0;
        int n = 0;
        void Flush()
        {
            if (seg is null || n == 0) return;
            var v = sum / n;
            var x = box.X0 + (double)bucket / Math.Max(1, (int)Math.Round(box.W)) * box.W;
            var y = box.Y1 - (Math.Clamp(v, lo, hi) - lo) / (hi - lo) * box.H;
            seg.Add((Math.Min(box.X1, x), y));
            sum = 0;
            n = 0;
        }
        var buckets = Math.Max(1, (int)Math.Round(box.W));
        foreach (var p in pts)
        {
            if (p.UnixMs < t0 || p.UnixMs > t1) continue;
            var b = (int)Math.Round((double)(p.UnixMs - t0) / (t1 - t0) * buckets);
            if (seg is null || p.UnixMs - lastT > GapMs)
            {
                Flush();
                seg = [];
                segments.Add(seg);
                bucket = b;
            }
            else if (b != bucket)
            {
                Flush();
                bucket = b;
            }
            sum += p.Value;
            n++;
            lastT = p.UnixMs;
        }
        Flush();
        segments.RemoveAll(s => s.Count == 0);
        return segments;
    }

    /// <summary>Draws the segments as a line (and an area wash down to the box bottom). Returns the last point.</summary>
    public static (double X, double Y)? Series(SvgDocument d, List<List<(double X, double Y)>> segments, PlotBox box, Color color,
        double width, double areaOpacity = 0.12, double opacity = 1)
    {
        if (segments.Count == 0) return null;
        if (areaOpacity > 0)
        {
            var area = new PathBuilder();
            foreach (var s in segments)
            {
                if (s.Count < 2) continue;
                area.MoveTo(s[0].X, box.Y1);
                foreach (var (x, y) in s) area.LineTo(x, y);
                area.LineTo(s[^1].X, box.Y1).Close();
            }
            if (!area.IsEmpty) d.Path(area, new Style { Fill = color.WithOpacity(areaOpacity * opacity) });
        }
        var line = new PathBuilder();
        foreach (var s in segments)
        {
            if (s.Count == 1) { line.MoveTo(s[0].X - 0.5, s[0].Y).LineTo(s[0].X + 0.5, s[0].Y); continue; }
            line.Polyline(s);
        }
        d.Path(line, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = width, LineCap = LineCap.Round, LineJoin = LineJoin.Round, Opacity = opacity < 1 ? opacity : null });
        return segments[^1][^1];
    }

    /// <summary>The "now" marker: a dot in the series color with a ring in the surface color.</summary>
    public static void EndDot(SvgDocument d, (double X, double Y) at, Color color, Color surface, double r)
    {
        d.Circle(at.X, at.Y, r, new Style { Fill = color, Stroke = surface, StrokeWidth = r * 0.55 });
    }

    /// <summary>Columns from a baseline (rounded data end, square at the baseline), 2-unit surface gaps.</summary>
    public static void Columns(SvgDocument d, IReadOnlyList<(double Value, Color Color, bool Strong)> cols, PlotBox box, double max, double maxWidth, double gap = 2)
    {
        if (cols.Count == 0 || max <= 0) return;
        var w = Math.Min(maxWidth, (box.W - gap * (cols.Count - 1)) / cols.Count);
        var total = w * cols.Count + gap * (cols.Count - 1);
        var x = box.X0 + (box.W - total) / 2;
        var byStyle = new Dictionary<(Color, bool), PathBuilder>();
        foreach (var (v, c, strong) in cols)
        {
            var h = Math.Max(1.5, Math.Clamp(v / max, 0, 1) * box.H);
            if (!byStyle.TryGetValue((c, strong), out var p)) byStyle[(c, strong)] = p = new PathBuilder();
            TopRounded(p, x, box.Y1 - h, w, h, Math.Min(2, w / 2));
            x += w + gap;
        }
        foreach (var ((c, strong), p) in byStyle) d.Path(p, new Style { Fill = c.WithOpacity(strong ? 1 : 0.62) });
    }

    public static void TopRounded(PathBuilder p, double x, double y, double w, double h, double r)
    {
        r = Math.Min(r, Math.Min(w / 2, h));
        p.MoveTo(x, y + h).LineTo(x, y + r).ArcTo(r, r, 0, false, true, x + r, y).LineTo(x + w - r, y).ArcTo(r, r, 0, false, true, x + w, y + r).LineTo(x + w, y + h).Close();
    }
}

/// <summary>Number formatting for keys and dials (invariant culture, en dash for "no value").</summary>
public static class CoolingFormat
{
    public const string NoValue = "–";

    public static string Rpm(double? v) => v is { } x ? Math.Round(x).ToString("0", CultureInfo.InvariantCulture) : NoValue;

    /// <summary>"62.8°" (one decimal below 100), "104°".</summary>
    public static string Temp(double? v, bool unit = false) =>
        v is { } x ? (Math.Abs(x) < 100 ? x.ToString("0.0", CultureInfo.InvariantCulture) : Math.Round(x).ToString("0", CultureInfo.InvariantCulture)) + (unit ? "°C" : "°") : NoValue;

    public static string TempWhole(double? v) => v is { } x ? Math.Round(x).ToString("0", CultureInfo.InvariantCulture) + "°" : NoValue;

    public static string Window(TimeSpan w) => w.TotalMinutes >= 1 ? $"−{Math.Round(w.TotalMinutes):0} MIN" : $"−{Math.Round(w.TotalSeconds):0} S";
}
