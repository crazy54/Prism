using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Cooling.Art;

/// <summary>What a cooling key shows. The bottom row is a sparkline, member columns, a stats line, or nothing.</summary>
public sealed record KeyModel
{
    public required string Label { get; init; }
    public required string Value { get; init; }
    /// <summary>The line under the value: unit and context ("RPM", "RPM · 40°C", "AVG RPM") or why there is no value.</summary>
    public required string Sub { get; init; }
    public CoolingGlyph Glyph { get; init; } = CoolingGlyph.Fan;
    public required Color Hue { get; init; }
    /// <summary>0..1 of full scale (drives the glyph's spin arcs).</summary>
    public double Level { get; init; }
    public IReadOnlyList<HistoryPoint> History { get; init; } = [];
    public long T0 { get; init; }
    public long T1 { get; init; }
    /// <summary>The sparkline's fixed top (full-scale RPM), so the line's height IS the level.</summary>
    public double ScaleMax { get; init; }
    public IReadOnlyList<(double Value, Color Color, bool Strong)>? Columns { get; init; }
    /// <summary>Replaces the sparkline, e.g. "↓1460  ↑1490".</summary>
    public string? Stats { get; init; }
    /// <summary>Dim the value (stale or missing data).</summary>
    public bool Muted { get; init; }
}

/// <summary>One small-multiple lane of the dial's "dent" view.</summary>
public sealed record LaneModel
{
    public required string Label { get; init; }
    public required string Value { get; init; }
    public required Color Color { get; init; }
    public IReadOnlyList<HistoryPoint> Points { get; init; } = [];
    /// <summary>Smallest y-span (°C or RPM) so sensor noise is not blown up into hills.</summary>
    public double MinSpan { get; init; } = 1;
    /// <summary>Detail mode: "58–67" over the window.</summary>
    public string? RangeText { get; init; }
    /// <summary>Detail mode: a second series on the SAME axis and unit (coolant under the CPU line).</summary>
    public IReadOnlyList<HistoryPoint>? Overlay { get; init; }
    public string? OverlayLabel { get; init; }
}

public sealed record OverviewRow(string Label, string Value, Color Color);

public sealed record FanBar(string Name, double? Rpm, CoolingRole Role);

/// <summary>Pure frame builders for the cooling keys and dial views (also used by tests and the preview page).</summary>
public static class CoolingFrames
{
    private const double K = Refraction.Deck.KeySize;

    // ================================================================== keys (144-unit square)

    public static SvgDocument Key(RefractionPalette t, KeyModel m)
    {
        var d = KeyArt.Base(t);
        var surface = t.KeyMaterial[1].Color;

        // Label: one line, full width.
        var labelSize = StrokeFont.FitSize(m.Label, K - 32, Refraction.Deck.LabelSize - 2, 16);
        var label = StrokeFont.Ellipsize(m.Label, K - 32, labelSize);
        d.Text(label, K / 2, 34, labelSize, t.KeyMuted, TextAlign.Middle);

        // Value: the hero, full width.
        var vSize = StrokeFont.FitSize(m.Value, K - 28, 42, 24, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
        d.Text(m.Value, K / 2, 62, vSize, m.Muted ? t.Faint : t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);

        // Unit / context.
        var subSize = StrokeFont.FitSize(m.Sub, K - 32, Refraction.Deck.MicroSize, 14, FontWeight.Semibold, 0.04, TextCase.Upper);
        d.Text(StrokeFont.Ellipsize(m.Sub, K - 32, subSize, FontWeight.Semibold, 0.04, TextCase.Upper), K / 2, 93, subSize, t.KeyMuted,
            TextAlign.Middle, FontWeight.Semibold, tracking: 0.04, textCase: TextCase.Upper);

        // Bottom row: glyph at the left, then the sparkline / columns / stats.
        const double gy = 111, gr = 9;
        var level = Math.Clamp(m.Level, 0, 1);
        switch (m.Glyph)
        {
            case CoolingGlyph.Pump: CoolingGlyphs.Pump(d, 25, gy, gr, m.Hue, level); break;
            case CoolingGlyph.Group:
                // A fan with a second one peeking out behind it: legible at 72 px, unlike three tiny fans.
                CoolingGlyphs.Fan(d, 29, gy - 3, gr * 0.62, m.Hue.Mix(t.KeyMaterial[1].Color, 0.45), 0, rotation: 30);
                CoolingGlyphs.Fan(d, 23, gy + 2, gr * 0.85, m.Hue, level);
                break;
            default: CoolingGlyphs.Fan(d, 25, gy, gr, m.Hue, level); break;
        }
        var box = new PlotBox(42, 101, K - 16, 121);
        if (m.Stats is { } stats)
        {
            var size = StrokeFont.FitSize(stats, box.W, 18, 14);
            d.Text(stats, box.X0 + box.W / 2, gy, size, t.KeyInk, TextAlign.Middle, baseline: TextBaseline.Middle);
        }
        else if (m.Columns is { Count: > 0 } cols)
        {
            var max = m.ScaleMax > 0 ? m.ScaleMax : cols.Max(c => c.Value);
            CoolingCharts.Columns(d, cols, box, max, 10);
        }
        else if (m.History.Count > 0 && m.ScaleMax > 0)
        {
            d.Line(box.X0, box.Y1, box.X1, box.Y1, t.Line, 1);
            var segs = CoolingCharts.Project(m.History, box, m.T0, m.T1, 0, m.ScaleMax);
            var end = CoolingCharts.Series(d, segs, box, m.Hue, 2.5, 0.16);
            if (end is { } e) CoolingCharts.EndDot(d, e, m.Hue, surface, 3);
        }
        KeyArt.HueIndex(d, CoolingColors.Index(t), on: false);
        return d;
    }

    // ================================================================== dial views (200×100; Galleon shows it at ~360×180)

    private const double W = 200, H = 100;
    private const double LabelSize = 12, ValueSize = 17;

    private static SvgDocument DialBase(RefractionPalette t, bool active) => DialArt.Base(t, CoolingColors.Index(t), active);

    /// <summary>Which of the views is showing: small dots at the top-right edge (turning the dial cycles them).</summary>
    private static void PageDots(SvgDocument d, RefractionPalette t, int page, int pages)
    {
        if (pages <= 1) return;
        var on = new PathBuilder();
        var off = new PathBuilder();
        for (var i = 0; i < pages; i++)
        {
            var x = W - 10 - (pages - 1 - i) * 6;
            (i == page ? on : off).Circle(x, 5.5, 1.6);
        }
        d.Path(off, new Style { Fill = t.Faint });
        d.Path(on, new Style { Fill = t.KeyInk });
    }

    private static void Caps(SvgDocument d, string text, double x, double y, double size, Color color, TextAlign align = TextAlign.Start) =>
        d.Text(text, x, y, size, color, align, FontWeight.Semibold, tracking: 0.08, textCase: TextCase.Upper);

    private static double FitCaps(string text, double width, double max, double min) =>
        StrokeFont.FitSize(text, width, max, min, FontWeight.Semibold, 0.08, TextCase.Upper);

    /// <summary>A small caps annotation on a chip of the surface color, so it stays legible over a line (detail mode).</summary>
    private static void Chip(SvgDocument d, RefractionPalette t, string text, double x, double baseline, double size, Color ink)
    {
        var w = StrokeFont.Measure(text, size, FontWeight.Semibold, 0.08, TextCase.Upper);
        var cap = StrokeFont.CapHeight(size);
        d.Rect(x - 2, baseline - cap - 2, w + 4, cap + 4, t.KeyMaterial[1].Color.WithOpacity(0.86), rx: 2);
        Caps(d, text, x, baseline, size, ink);
    }

    /// <summary>
    /// "What makes the largest dent in CPU temps": CPU temperature, pump RPM and radiator-fan RPM as small multiples on ONE
    /// shared time axis (each lane its own y-scale; never two scales on one plot). Cause and effect line up vertically.
    /// </summary>
    public static SvgDocument Dent(RefractionPalette t, IReadOnlyList<LaneModel> lanes, long t0, long t1, TimeSpan window, bool detail, bool active, int page, int pages)
    {
        var d = DialBase(t, active);
        var surface = t.KeyMaterial[1].Color;
        const double px0 = 82, px1 = 190, top = 10, axisY = 88;
        var n = Math.Max(1, lanes.Count);
        const double gap = 3;
        var laneH = (axisY - top - gap * (n - 1)) / n;

        // Shared time grid: a hairline per minute through every lane (or every 5 minutes on long windows).
        var minutes = Math.Max(1, (int)Math.Round(window.TotalMinutes));
        var step = minutes > 6 ? 5 : 1;
        var grid = new PathBuilder();
        for (var k = step; k < minutes; k += step)
        {
            var x = px1 - k / (double)minutes * (px1 - px0);
            grid.MoveTo(x, top).LineTo(x, axisY);
        }
        if (!grid.IsEmpty) d.Path(grid, Style.Stroked(t.Line, 1, LineCap.Butt));

        for (var i = 0; i < lanes.Count; i++)
        {
            var lane = lanes[i];
            var y0 = top + i * (laneH + gap);
            var box = new PlotBox(px0, y0 + 2, px1, y0 + laneH);
            d.Line(px0, box.Y1, px1, box.Y1, t.Line, 1, LineCap.Butt);

            // Left column: a swatch in the series color, the label, and the current value under it.
            d.Rect(10, y0 + 2.2, 5.5, 5.5, lane.Color, rx: 1.5);
            var ls = Math.Min(10.5, FitCaps(lane.Label, px0 - 30, 10.5, 8.5));
            Caps(d, lane.Label, 19.5, y0 + 7.8, ls, t.KeyMuted);
            var vs = StrokeFont.FitSize(lane.Value, px0 - 18, 15.5, 11);
            d.Text(lane.Value, 10, y0 + laneH - 0.5, vs, t.KeyInk);

            var values = lane.Points.Select(p => p.Value);
            if (detail && lane.Overlay is { Count: > 0 } ov) values = values.Concat(ov.Select(p => p.Value));
            var (lo, hi) = CoolingCharts.Range(values, lane.MinSpan);
            if (detail && lane.Overlay is { Count: > 0 } overlay)
            {
                var osegs = CoolingCharts.Project(overlay, box, t0, t1, lo, hi);
                CoolingCharts.Series(d, osegs, box, CoolingColors.Neutral(t), 1.5, 0);
            }
            var segs = CoolingCharts.Project(lane.Points, box, t0, t1, lo, hi);
            var end = CoolingCharts.Series(d, segs, box, lane.Color, 2, detail ? 0 : 0.12);
            if (end is { } e) CoolingCharts.EndDot(d, e, lane.Color, surface, 2.6);
            else Caps(d, "no data yet", (px0 + px1) / 2, y0 + laneH / 2 + 4, 10, t.Dim, TextAlign.Middle);
            // Details sit on chips over the oldest part of the lane (the "now" end stays clear).
            if (detail && lane.RangeText is { Length: > 0 } r) Chip(d, t, r, px0 + 2, box.Y0 + 7.5, 8.5, t.KeyMuted);
            if (detail && lane.Overlay is { Count: > 0 } && lane.OverlayLabel is { } ol) Chip(d, t, ol, px0 + 2, box.Y1 - 2.5, 8.5, t.KeyMuted);
        }

        Caps(d, CoolingFormat.Window(window), px0, 97, 10.5, t.Dim);
        Caps(d, "now", px1, 97, 10.5, t.Dim, TextAlign.End);
        PageDots(d, t, page, pages);
        return d;
    }

    /// <summary>CPU temperature as the hero, with liquid, pump and fan groups beside it.</summary>
    public static SvgDocument Overview(RefractionPalette t, string cpuValue, string cpuSource, IReadOnlyList<HistoryPoint> cpuHistory, long t0, long t1,
        IReadOnlyList<OverviewRow> rows, string? footer, bool active, int page, int pages)
    {
        var d = DialBase(t, active);
        var surface = t.KeyMaterial[1].Color;
        Caps(d, "cpu", 10, 20, LabelSize, t.KeyMuted);
        if (cpuSource.Length > 0) Caps(d, cpuSource, 10 + StrokeFont.Measure("CPU", LabelSize, FontWeight.Semibold, 0.08, TextCase.Upper) + 6, 20, 10, t.Dim);
        var size = StrokeFont.FitSize(cpuValue, 86, 34, 20);
        d.Text(cpuValue, 10, 52, size, t.KeyInk);
        var box = new PlotBox(10, 62, 94, 84);
        d.Line(box.X0, box.Y1, box.X1, box.Y1, t.Line, 1, LineCap.Butt);
        var (lo, hi) = CoolingCharts.Range(cpuHistory.Select(p => p.Value), 8);
        var end = CoolingCharts.Series(d, CoolingCharts.Project(cpuHistory, box, t0, t1, lo, hi), box, CoolingColors.Cpu, 2, 0.12);
        if (end is { } e) CoolingCharts.EndDot(d, e, CoolingColors.Cpu, surface, 2.6);

        d.Line(100, 14, 100, 86, t.Line, 1, LineCap.Butt);
        var rowY = 27.0;
        var rowStep = rows.Count >= 4 ? 18.5 : 22;
        foreach (var r in rows.Take(4))
        {
            d.Rect(106, rowY - 7.2, 5.5, 5.5, r.Color, rx: 1.5);
            Caps(d, r.Label, 115, rowY - 1, FitCaps(r.Label, 36, 10, 8), t.KeyMuted);
            var vs = StrokeFont.FitSize(r.Value, 40, 14.5, 10);
            d.Text(r.Value, 191, rowY, vs, t.KeyInk, TextAlign.End);
            rowY += rowStep;
        }
        if (footer is not null) Caps(d, StrokeFont.Ellipsize(footer, 180, 10, FontWeight.Semibold, 0.08, TextCase.Upper), 10, 96, 10, t.Dim);
        PageDots(d, t, page, pages);
        return d;
    }

    /// <summary>Every fan as a column (full scale = <paramref name="scaleMax"/>), grouped by role with labels under each group.</summary>
    public static SvgDocument Fans(RefractionPalette t, IReadOnlyList<FanBar> fans, double scaleMax, string headerRight, bool detail, bool active, int page, int pages)
    {
        var d = DialBase(t, active);
        Caps(d, $"fans · {fans.Count}", 10, 19, LabelSize, t.KeyMuted);
        if (headerRight.Length > 0) d.Text(headerRight, 190, 20, 13, t.KeyInk, TextAlign.End);
        PageDots(d, t, page, pages);
        if (fans.Count == 0)
        {
            Caps(d, "no fans", W / 2, 58, 13, t.Dim, TextAlign.Middle);
            return d;
        }
        var groups = fans.GroupBy(f => f.Role switch { CoolingRole.Radiator => 0, CoolingRole.Case => 1, CoolingRole.Pump => 3, _ => 2 })
            .OrderBy(g => g.Key).Select(g => g.ToList()).ToList();
        const double x0 = 10, x1 = 190, top = 28, bottom = 82, gap = 2, groupGap = 8;
        var bars = fans.Count;
        var avail = x1 - x0 - groupGap * (groups.Count - 1) - gap * (bars - groups.Count);
        var bw = Math.Clamp(avail / bars, 3, 16);
        var total = bw * bars + gap * (bars - groups.Count) + groupGap * (groups.Count - 1);
        var x = x0 + (x1 - x0 - total) / 2;
        var max = scaleMax > 0 ? scaleMax : Math.Max(1, fans.Max(f => f.Rpm ?? 0));
        d.Line(x0, bottom, x1, bottom, t.Line, 1, LineCap.Butt);
        var peak = fans.Where(f => f.Rpm is not null).OrderByDescending(f => f.Rpm).FirstOrDefault();
        var low = fans.Where(f => f.Rpm is not null).OrderBy(f => f.Rpm).FirstOrDefault();
        foreach (var g in groups)
        {
            var gx = x;
            var p = new PathBuilder();
            var color = CoolingColors.ForGroupMember(t, g[0].Role);
            foreach (var f in g)
            {
                var h = f.Rpm is { } rpm ? Math.Max(1.5, Math.Clamp(rpm / max, 0, 1) * (bottom - top)) : 1.5;
                CoolingCharts.TopRounded(p, x, bottom - h, bw, h, Math.Min(2, bw / 2));
                if (detail && (ReferenceEquals(f, peak) || ReferenceEquals(f, low)) && f.Rpm is { } v)
                    d.Text(CoolingFormat.Rpm(v), x + bw / 2, bottom - h - 3, 9, t.KeyInk, TextAlign.Middle);
                x += bw + gap;
            }
            x += groupGap - gap;
            d.Path(p, new Style { Fill = color });
            var label = g[0].Role switch { CoolingRole.Radiator => "rad", CoolingRole.Case => "case", CoolingRole.Pump => "pump", _ => "other" };
            var gw = x - groupGap - gx + gap;
            Caps(d, label, gx + gw / 2, 94, 10.5, t.KeyMuted, TextAlign.Middle);
        }
        return d;
    }

    /// <summary>The pump hero with its RPM lane above a coolant lane (shared time axis), plus CPU and ΔT.</summary>
    public static SvgDocument Pump(RefractionPalette t, string name, string rpm, string sub, IReadOnlyList<HistoryPoint> pump, IReadOnlyList<HistoryPoint> coolant,
        long t0, long t1, TimeSpan window, IReadOnlyList<OverviewRow> rows, bool active, int page, int pages)
    {
        var d = DialBase(t, active);
        var surface = t.KeyMaterial[1].Color;
        Caps(d, StrokeFont.Ellipsize(name, 84, LabelSize, FontWeight.Semibold, 0.08, TextCase.Upper), 10, 20, LabelSize, t.KeyMuted);
        var size = StrokeFont.FitSize(rpm, 84, 30, 18);
        d.Text(rpm, 10, 48, size, t.KeyInk);
        Caps(d, StrokeFont.Ellipsize(sub, 88, FitCaps(sub, 88, 10.5, 8), FontWeight.Semibold, 0.08, TextCase.Upper), 10, 60, FitCaps(sub, 88, 10.5, 8), t.Dim);
        var y = 76.0;
        foreach (var r in rows.Take(2))
        {
            d.Rect(10, y - 6.8, 5.5, 5.5, r.Color, rx: 1.5);
            Caps(d, r.Label, 19, y - 0.8, FitCaps(r.Label, 40, 10, 8), t.KeyMuted);
            d.Text(r.Value, 96, y, StrokeFont.FitSize(r.Value, 34, 13, 10), t.KeyInk, TextAlign.End);
            y += 16;
        }

        const double px0 = 106, px1 = 190;
        var pbox = new PlotBox(px0, 12, px1, 46);
        var cbox = new PlotBox(px0, 58, px1, 84);
        foreach (var (box, pts, color, span) in new[] { (pbox, pump, CoolingColors.Pump, 150.0), (cbox, coolant, CoolingColors.Neutral(t), 2.0) })
        {
            d.Line(box.X0, box.Y1, box.X1, box.Y1, t.Line, 1, LineCap.Butt);
            var (lo, hi) = CoolingCharts.Range(pts.Select(p => p.Value), span);
            var end = CoolingCharts.Series(d, CoolingCharts.Project(pts, box, t0, t1, lo, hi), box, color, 2, 0.12);
            if (end is { } e) CoolingCharts.EndDot(d, e, color, surface, 2.6);
        }
        Caps(d, "liquid", px0, 55, 8.5, t.Dim);
        Caps(d, CoolingFormat.Window(window), px0, 97, 10.5, t.Dim);
        Caps(d, "now", px1, 97, 10.5, t.Dim, TextAlign.End);
        PageDots(d, t, page, pages);
        return d;
    }

    /// <summary>A status card: why there is nothing to show yet, and what to do about it.</summary>
    public static SvgDocument Message(RefractionPalette t, string title, string line1, string? line2, bool active, int page, int pages, string? line3 = null)
    {
        var d = DialBase(t, active);
        CoolingGlyphs.Fan(d, 26, 50, 12, t.Faint, 0);
        Caps(d, title, 48, 30, LabelSize, t.KeyMuted);
        var s1 = StrokeFont.FitSize(line1, 142, 16, 11);
        d.Text(StrokeFont.Ellipsize(line1, 142, s1), 48, 52, s1, t.KeyInk);
        var y = 69.0;
        foreach (var line in new[] { line2, line3 })
        {
            if (line is null) continue;
            var s = StrokeFont.FitSize(line, 142, 12, 10);
            d.Text(StrokeFont.Ellipsize(line, 142, s), 48, y, s, t.KeyMuted);
            y += 15;
        }
        PageDots(d, t, page, pages);
        return d;
    }
}
