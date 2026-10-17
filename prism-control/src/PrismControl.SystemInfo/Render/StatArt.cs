using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.SystemInfo.Render;

/// <summary>Warn / critical states draw a ring + a corner notch (never color alone; tokens.json deck.states.alert).</summary>
public enum Level { Normal, Warn, Crit }

/// <summary>Metric hues for the system module (placeholders on the Refraction spectrum; the designer may retune).</summary>
public static class SystemHues
{
    public const int Cpu = 5;    // mint (the system domain hue)
    public const int Gpu = 7;    // lime
    public const int Ram = 2;    // azure
    public const int Disk = 9;   // amber
    public const int Net = 1;    // periwinkle
    public const int NetUp = 11; // rose (the upload line next to the download line)

    public static SpectrumColor Of(RefractionPalette t, int index) => t.Spectrum[Math.Clamp(index, 0, t.Spectrum.Count - 1)];
}

/// <summary>Drawing primitives shared by the stat keys (144 canvas) and the dial widgets (200×100). Path text only.</summary>
public static class StatArt
{
    /// <summary>Draws text fitted to <paramref name="maxWidth"/> (shrinks to <paramref name="minSize"/>, then ellipsizes).</summary>
    public static double FitText(SvgDocument d, string text, double x, double y, double size, double minSize, double maxWidth, Paint color,
        TextAlign align = TextAlign.Start, FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps,
        TextBaseline baseline = TextBaseline.Alphabetic)
    {
        if (string.IsNullOrEmpty(text) || maxWidth <= 4) return 0;
        var s = StrokeFont.FitSize(text, maxWidth, size, minSize, weight, tracking, textCase);
        var shown = StrokeFont.Measure(text, s, weight, tracking, textCase) > maxWidth ? StrokeFont.Ellipsize(text, maxWidth, s, weight, tracking, textCase) : text;
        d.Text(shown, x, y, s, color, align, weight, baseline, tracking, textCase);
        return StrokeFont.Measure(shown, s, weight, tracking, textCase);
    }

    /// <summary>
    /// A big number with a small unit on the same baseline (e.g. "42" + "%"), shrunk until both fit <paramref name="maxWidth"/>.
    /// <paramref name="x"/> is the left edge, the center or the right edge per <paramref name="align"/>. Returns the drawn width.
    /// </summary>
    public static double ValueUnit(SvgDocument d, Reading r, double x, double baselineY, double size, double maxWidth, Color ink, Color unitInk,
        TextAlign align = TextAlign.Middle, double unitRatio = 0.46, double minSize = 18)
    {
        const double tracking = Refraction.Deck.ValueTrackingEm;
        var number = r.Number;
        var unit = r.IsMissing ? "" : r.Unit;
        // "%" and "°C" hug the number; word units ("GHz", "MB/s") get a little air.
        var wordUnit = unit.Length > 0 && char.IsLetter(unit[0]);
        double Width(double s)
        {
            var w = StrokeFont.Measure(number, s, FontWeight.Semibold, tracking);
            if (unit.Length > 0) w += Gap(s) + StrokeFont.Measure(unit, s * unitRatio, FontWeight.Semibold);
            return w;
        }
        double Gap(double s) => wordUnit ? Math.Max(2.5, s * 0.15) : Math.Max(1.5, s * 0.05);
        var size2 = size;
        while (size2 > minSize && Width(size2) > maxWidth) size2 = Math.Max(minSize, size2 - 1);
        var total = Width(size2);
        var left = align switch { TextAlign.Middle => x - total / 2, TextAlign.End => x - total, _ => x };
        var color = r.IsMissing ? unitInk : ink;
        d.Text(number, left, baselineY, size2, color, TextAlign.Start, FontWeight.Semibold, TextBaseline.Alphabetic, tracking);
        if (unit.Length > 0)
        {
            var nw = StrokeFont.Measure(number, size2, FontWeight.Semibold, tracking);
            d.Text(unit, left + nw + Gap(size2), baselineY, size2 * unitRatio, unitInk, TextAlign.Start, FontWeight.Semibold);
        }
        return total;
    }

    /// <summary>
    /// A history sparkline: a soft area (hue fading to transparent) under a hue line, breaking at gaps (NaN), with the
    /// newest point marked. <paramref name="window"/> is the number of slots across the width; the newest sample is at the
    /// right edge, so a fresh history grows in from the right. 4-6 elements.
    /// </summary>
    public static void Sparkline(SvgDocument d, ReadOnlySpan<double> values, int window, double x, double y, double w, double h,
        double min, double max, Color stroke, double strokeWidth, double areaOpacity, Color? dot = null, bool area = true)
    {
        if (window < 2) window = 2;
        var n = Math.Min(values.Length, window);
        values = values[^n..];
        var span = max - min;
        if (!(span > 0)) span = 1;
        var step = w / (window - 1);
        var x0 = x + w - step * (n - 1);
        double Y(double v) => y + h - Math.Clamp((v - min) / span, 0, 1) * h;

        var line = new PathBuilder();
        var fill = new PathBuilder();
        int valid = 0, runStart = -1;
        double lastX = 0, lastY = 0;
        for (var i = 0; i <= n; i++)
        {
            var ok = i < n && double.IsFinite(values[i]);
            if (ok)
            {
                var px = x0 + step * i;
                var py = Y(values[i]);
                if (runStart < 0)
                {
                    runStart = i;
                    line.MoveTo(px, py);
                    fill.MoveTo(px, y + h).LineTo(px, py);
                }
                else
                {
                    line.LineTo(px, py);
                    fill.LineTo(px, py);
                }
                lastX = px;
                lastY = py;
                valid++;
            }
            else if (runStart >= 0)
            {
                fill.LineTo(lastX, y + h).Close();
                runStart = -1;
            }
        }
        if (valid < 2) return;
        if (area && areaOpacity > 0)
        {
            var grad = d.LinearGradient(0, y, 0, y + h, [(0, stroke, areaOpacity), (1, stroke, 0)], userSpace: true);
            d.Path(fill, new Style { Fill = grad });
        }
        d.Path(line, Style.Stroked(stroke, strokeWidth) with { LineJoin = LineJoin.Round, Fill = Paint.None });
        if (dot is { } dc) d.Circle(lastX, lastY, strokeWidth * 1.15, dc);
    }

    /// <summary>A faint baseline under a chart (structure when the history is still empty).</summary>
    public static void Baseline(SvgDocument d, RefractionPalette t, double x, double y, double w) =>
        d.Line(x, y, x + w, y, t.Line, 1, LineCap.Round, t.IsDark ? 0.9 : 1);

    /// <summary>Vertical bars (per-core load), one track path and one fill path. <paramref name="fractions"/> are 0..1.</summary>
    public static void Bars(SvgDocument d, ReadOnlySpan<double> fractions, double x, double y, double w, double h, Paint track, Color fill)
    {
        var n = fractions.Length;
        if (n == 0) return;
        var gap = Math.Clamp(w / n * 0.28, 1, 3);
        var bw = (w - gap * (n - 1)) / n;
        var r = Math.Min(bw / 2, 2);
        var tracks = new PathBuilder();
        var fills = new PathBuilder();
        for (var i = 0; i < n; i++)
        {
            var bx = x + i * (bw + gap);
            tracks.RoundedRect(bx, y, bw, h, r);
            var f = double.IsFinite(fractions[i]) ? Math.Clamp(fractions[i], 0, 1) : 0;
            var bh = Math.Max(r * 2, h * f);
            fills.RoundedRect(bx, y + h - bh, bw, bh, r);
        }
        d.Path(tracks, new Style { Fill = track });
        var grad = d.LinearGradient(0, y, 0, y + h, [(0, fill), (1, fill, 0.6)], userSpace: true);
        d.Path(fills, new Style { Fill = grad });
    }

    /// <summary>A horizontal meter (track + fill, rounded).</summary>
    public static void Meter(SvgDocument d, double x, double y, double w, double h, double? fraction, Paint track, Color fill)
    {
        d.Rect(x, y, w, h, track, rx: h / 2);
        if (fraction is not { } f || !double.IsFinite(f)) return;
        var fw = Math.Max(h, w * Math.Clamp(f, 0, 1));
        d.Rect(x, y, fw, h, fill, rx: h / 2);
    }

    public static Color LevelColor(RefractionPalette t, Level level) => level == Level.Crit ? t.Neg : t.Warn;

    /// <summary>Key alert: a 4 px (2 @72) inner ring and a 24 px (12) corner notch, top-right.</summary>
    public static void KeyAlert(SvgDocument d, RefractionPalette t, Level level)
    {
        if (level == Level.Normal) return;
        var c = LevelColor(t, level);
        const double s = KeyArt.Size;
        d.Rect(2, 2, s - 4, s - 4, new Style { Fill = Paint.None, Stroke = c, StrokeWidth = 4 }, rx: 8);
        d.Path(new PathBuilder().MoveTo(s - 26, 0).LineTo(s, 0).LineTo(s, 26).Close(), new Style { Fill = c });
    }

    /// <summary>Dial alert: a 2 px ring and a 16 px corner notch, top-right of the 200×100 canvas.</summary>
    public static void DialAlert(SvgDocument d, RefractionPalette t, Level level)
    {
        if (level == Level.Normal) return;
        var c = LevelColor(t, level);
        d.Rect(1, 1, 198, 98, new Style { Fill = Paint.None, Stroke = c, StrokeWidth = 2 }, rx: 6);
        d.Path(new PathBuilder().MoveTo(184, 0).LineTo(200, 0).LineTo(200, 16).Close(), new Style { Fill = c });
    }

    /// <summary>The key's spectral index bar, in the alert color when alerting.</summary>
    public static void Index(SvgDocument d, RefractionPalette t, SpectrumColor hue, Level level)
    {
        if (level == Level.Normal)
        {
            KeyArt.HueIndex(d, hue, on: false);
            return;
        }
        const double w = 32, h = 4;
        d.Rect((KeyArt.Size - w) / 2, KeyArt.Size - 12 - h / 2, w, h, LevelColor(t, level), rx: h / 2);
    }

    /// <summary>The chart range for a series: fixed for percentages, padded auto-range otherwise.</summary>
    public static (double Min, double Max) AutoRange(ReadOnlySpan<double> values, double minSpan, double floor = double.NegativeInfinity, double? fixedMin = null)
    {
        double lo = double.PositiveInfinity, hi = double.NegativeInfinity;
        foreach (var v in values)
        {
            if (!double.IsFinite(v)) continue;
            lo = Math.Min(lo, v);
            hi = Math.Max(hi, v);
        }
        if (!double.IsFinite(lo)) return (fixedMin ?? 0, (fixedMin ?? 0) + minSpan);
        if (fixedMin is { } fm)
            return (fm, Math.Max(fm + minSpan, hi + (hi - fm) * 0.12));
        var pad = Math.Max((hi - lo) * 0.15, minSpan / 4);
        lo = Math.Max(floor, lo - pad);
        hi += pad;
        if (hi - lo < minSpan)
        {
            var mid = (hi + lo) / 2;
            lo = Math.Max(floor, mid - minSpan / 2);
            hi = lo + minSpan;
        }
        return (lo, hi);
    }

    public static double MaxOf(ReadOnlySpan<double> values)
    {
        var m = double.NaN;
        foreach (var v in values)
            if (double.IsFinite(v) && !(m >= v)) m = v;
        return m;
    }
}
