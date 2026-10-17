using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Render;

/// <summary>
/// System dial widgets on the 200×100 canvas: a Stream Deck + strip segment at 1×, a Galleon screen widget at ~1.8×
/// (four of them make the 720×384 dashboard). Header row (hue chip, label, detail) · value row (big value, peak) ·
/// history chart across the bottom. Detail views: per-core bars, a GPU 2×2 grid, memory meters, drives, both directions.
/// </summary>
public static class DialFrames
{
    private const double X0 = 16, X1 = 184, Wd = X1 - X0;
    public const int Window = 60;
    private const double LabelSize = Refraction.Deck.DialLabelSize, LabelTracking = Refraction.Deck.DialLabelTrackingEm;

    /// <summary>The header: a hue chip, the label (uppercase, tracked) and right-aligned detail text.</summary>
    private static void Header(SvgDocument d, RefractionPalette t, SpectrumColor hue, string label, string? right)
    {
        d.Rect(X0, 11, 4, 13, hue.Vivid, rx: 2);
        var lw = StatArt.FitText(d, label, X0 + 10, 23, LabelSize, 12, 96, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, LabelTracking, TextCase.Upper);
        if (!string.IsNullOrEmpty(right))
            StatArt.FitText(d, right, X1, 23, LabelSize, 12, Wd - 10 - lw - 12, t.KeyMuted, TextAlign.End);
    }

    private static SvgDocument Frame(RefractionPalette t, SpectrumColor hue, bool active, Level level)
    {
        var d = DialArt.Base(t, hue, active);
        StatArt.DialAlert(d, t, level);
        return d;
    }

    /// <summary>The default view: value + peak + a 60-sample history chart.</summary>
    public static SvgDocument History(RefractionPalette t, StatView v, bool active)
    {
        var hue = SystemHues.Of(t, v.Hue);
        var d = Frame(t, hue, active, v.Level);
        var ink = active ? hue.Ink : t.KeyInk;
        const double cy = 64, ch = 26;
        if (v.Value2 is { } second && v.Sub is null)
        {
            var hue2 = SystemHues.Of(t, v.Hue2);
            Header(d, t, hue, v.Label, v.Aux);
            d.Text(v.Glyph1 ?? StatViews.Down, X0, 55, 22, hue.Vivid);
            StatArt.ValueUnit(d, v.Value, X0 + 18, 55, 28, 66, ink, t.KeyMuted, TextAlign.Start, unitRatio: 0.5, minSize: 16);
            d.Text(v.Glyph2 ?? StatViews.Up, 104, 55, 22, hue2.Vivid);
            StatArt.ValueUnit(d, second, 122, 55, 28, X1 - 122, ink, t.KeyMuted, TextAlign.Start, unitRatio: 0.5, minSize: 16);
            Chart(d, t, v.Series, v.Min, v.Max, hue, cy, ch, area: true);
            if (v.Series2 is { } s2) Chart(d, t, s2, v.Min, v.Max, hue2, cy, ch, area: false);
            return d;
        }
        Header(d, t, hue, v.Glyph1 is { } g ? $"{g} {v.Label}" : v.Label, v.Sub);
        var vw = StatArt.ValueUnit(d, v.Value, X0, 56, Refraction.Deck.DialValueSize, 116, ink, t.KeyMuted, TextAlign.Start, unitRatio: 0.47, minSize: 20);
        if (!string.IsNullOrEmpty(v.Aux)) StatArt.FitText(d, v.Aux, X1, 56, 13, 12, Wd - vw - 12, t.KeyMuted, TextAlign.End);
        if (v.Fraction is { } f && v.Series.Length == 0)
            StatArt.Meter(d, X0, 76, Wd, 8, f, t.Panel2, v.Level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, v.Level));
        else Chart(d, t, v.Series, v.Min, v.Max, hue, cy, ch, area: true);
        return d;
    }

    private static void Chart(SvgDocument d, RefractionPalette t, double[] series, double min, double max, SpectrumColor hue, double y, double h, bool area)
    {
        if (area) StatArt.Baseline(d, t, X0, y + h, Wd);
        StatArt.Sparkline(d, series, Window, X0, y, Wd, h, min, max, hue.Vivid, 2, t.IsDark ? 0.36 : 0.24, area ? hue.Ink : null, area);
    }

    // ------------------------------------------------------------------ detail views (push toggles)

    public static SvgDocument CpuCores(RefractionPalette t, CpuFrame? c, bool showTemp, bool active)
    {
        var hue = SystemHues.Of(t, SystemHues.Cpu);
        var level = c?.TempC is { } tc ? tc >= 95 ? Level.Crit : tc >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        var d = Frame(t, hue, active, level);
        var temp = showTemp && c is not null ? (c.TempC is { } x ? Fmt.Temp(x).Text : Reading.Dash + "°C") : null;
        Header(d, t, hue, "CORES", Fmt.Join(Fmt.Percent(c?.UsagePct).Text, temp ?? (Fmt.Clock(c?.ClockMhz) is { IsMissing: false } k ? k.Text : null)));
        var cores = c?.PerCorePct;
        var f = cores is { Count: > 0 } ? KeyFrames.Downsample(cores, 32) : new double[Math.Clamp(c?.Threads ?? 16, 1, 32)];
        StatArt.Bars(d, f, X0, 32, Wd, 58, t.Panel2, hue.Vivid);
        return d;
    }

    public static SvgDocument GpuDetail(RefractionPalette t, TelemetryFrame? f, string? gpuId, bool active)
    {
        var hue = SystemHues.Of(t, SystemHues.Gpu);
        var g = f?.FindGpu(gpuId);
        var level = Level.Normal;
        if (g?.TempC is { } tc)
        {
            var (warn, crit) = StatViews.GpuTempLimits(g);
            level = tc >= crit ? Level.Crit : tc >= warn ? Level.Warn : Level.Normal;
        }
        var d = Frame(t, hue, active, level);
        Header(d, t, hue, f is not null && g is not null ? StatViews.GpuLabel(f, g) : "GPU", ShortGpuName(g?.Name));
        var ink = active ? hue.Ink : t.KeyInk;
        Cell(d, t, "LOAD", Fmt.Percent(g?.UsagePct), g?.UsagePct / 100, X0, 46, hue.Vivid, ink);
        Cell(d, t, "TEMP", Fmt.Temp(g?.TempC), g?.TempC is { } c ? (c - 25) / 70 : null, 106, 46, level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, level), ink);
        Cell(d, t, "POWER", Fmt.Power(g?.PowerW), g?.PowerW is { } p && g.PowerLimitW is { } l && l > 0 ? p / l : null, X0, 78, hue.Vivid, ink);
        Cell(d, t, "VRAM", Fmt.MiBAsGiB(g?.VramUsedMiB), g?.VramUsedMiB is { } u && g.VramTotalMiB is { } tt && tt > 0 ? u / tt : null, 106, 78, hue.Vivid, ink);
        return d;
    }

    /// <summary>"NVIDIA GeForce RTX 4070 Ti" → "RTX 4070 Ti"; "AMD Radeon(TM) Graphics" → "Radeon Graphics".</summary>
    public static string? ShortGpuName(string? name)
    {
        if (name is null) return null;
        var s = name.Replace("(TM)", "", StringComparison.OrdinalIgnoreCase).Replace("(R)", "", StringComparison.OrdinalIgnoreCase);
        foreach (var prefix in new[] { "NVIDIA GeForce ", "NVIDIA ", "AMD ", "Intel(R) ", "Intel " })
            if (s.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) { s = s[prefix.Length..]; break; }
        return string.Join(' ', s.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static void Cell(SvgDocument d, RefractionPalette t, string label, Reading value, double? fraction, double x, double baseline, Color fill, Color ink)
    {
        const double w = 78;
        var lw = StatArt.FitText(d, label, x, baseline, 13, 12, 44, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, LabelTracking, TextCase.Upper);
        StatArt.ValueUnit(d, value, x + w, baseline, 20, w - lw - 4, ink, t.KeyMuted, TextAlign.End, unitRatio: 0.6, minSize: 13);
        StatArt.Meter(d, x, baseline + 6, w, 4, fraction, t.Panel2, fill);
    }

    public static SvgDocument RamDetail(RefractionPalette t, MemoryFrame? m, bool active)
    {
        var hue = SystemHues.Of(t, SystemHues.Ram);
        var level = m?.UsagePct is { } p ? p >= 95 ? Level.Crit : p >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        var d = Frame(t, hue, active, level);
        Header(d, t, hue, "MEMORY", Fmt.Percent(m?.UsagePct).Text + " USED");
        var used = Fmt.MiBAsGiB(m?.UsedMiB);
        var total = Fmt.MiBAsGiB(m?.TotalMiB);
        var r = used.IsMissing || total.IsMissing ? Reading.Missing : used.Unit == total.Unit ? new Reading($"{used.Number} / {total.Number}", total.Unit) : new Reading(used.Text + " / " + total.Number, total.Unit);
        StatArt.ValueUnit(d, r, X0, 52, 26, Wd, active ? hue.Ink : t.KeyInk, t.KeyMuted, TextAlign.Start, unitRatio: 0.55, minSize: 16);
        StatArt.Meter(d, X0, 59, Wd, 6, m?.UsagePct / 100, t.Panel2, level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, level));
        var commit = m?.CommitUsedMiB is { } cu && m.CommitLimitMiB is { } cl && cl > 0 ? (cu, cl) : ((double, double)?)null;
        StatArt.FitText(d, "COMMIT", X0, 82, 13, 12, 60, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, LabelTracking, TextCase.Upper);
        if (commit is { } c)
            StatArt.FitText(d, Fmt.UsedOfTotal(Fmt.MiBAsGiB(c.Item1), Fmt.MiBAsGiB(c.Item2)), X1, 82, 13, 12, Wd - 70, t.KeyMuted, TextAlign.End);
        StatArt.Meter(d, X0, 87, Wd, 4, commit is { } c2 ? c2.Item1 / c2.Item2 : null, t.Panel2, hue.Vivid);
        return d;
    }

    public static SvgDocument DiskDetail(RefractionPalette t, TelemetryFrame? f, string? drive, bool active)
    {
        var hue = SystemHues.Of(t, SystemHues.Disk);
        var disks = KeyFrames.OrderDisks(f, drive).Take(3).ToList();
        var worst = Level.Normal;
        var rows = new List<(DiskFrame Disk, Level Level)>();
        foreach (var k in disks)
        {
            var freePct = k.FreeGiB is { } fr && k.TotalGiB is { } tt && tt > 0 ? fr / tt * 100 : (double?)null;
            var level = freePct is { } fp ? fp < 5 ? Level.Crit : fp < 10 ? Level.Warn : Level.Normal : Level.Normal;
            if (level > worst) worst = level;
            rows.Add((k, level));
        }
        var d = Frame(t, hue, active, worst);
        var tot = f?.DiskTotal;
        Header(d, t, hue, "DISKS", tot is null || (tot.ReadBps is null && tot.WriteBps is null) ? null : "R+W " + Fmt.Rate((tot.ReadBps ?? 0) + (tot.WriteBps ?? 0)).Text);
        for (var i = 0; i < rows.Count; i++)
        {
            var (k, level) = rows[i];
            var y = 45 + i * 21;
            d.Text(k.Name, X0, y, 14, active ? hue.Ink : t.KeyInk, TextAlign.Start);
            StatArt.Meter(d, 44, y - 6, 84, 6, k.UsagePct / 100, t.Panel2, level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, level));
            StatArt.FitText(d, Fmt.GiB(k.FreeGiB).Text, X1, y, 13, 12, X1 - 136, t.KeyMuted, TextAlign.End);
        }
        if (rows.Count == 0) StatArt.ValueUnit(d, Reading.Missing, X0, 56, 34, 100, t.KeyInk, t.KeyMuted, TextAlign.Start);
        return d;
    }

    public static SvgDocument NetDetail(RefractionPalette t, StatView v, TelemetryHistory h, string? seriesKey, bool active)
    {
        var hue = SystemHues.Of(t, SystemHues.Net);
        var hue2 = SystemHues.Of(t, SystemHues.NetUp);
        var d = Frame(t, hue, active, Level.Normal);
        Header(d, t, hue, v.Label, v.Sub ?? v.Aux);
        var ink = active ? hue.Ink : t.KeyInk;
        // Each direction on its own scale (the values are printed; upload would otherwise flatten against download).
        Column(d, t, StatViews.Down + " DOWN", v.Value, v.Series, hue, X0, ink);
        Column(d, t, StatViews.Up + " UP", v.Value2 ?? Reading.Missing, v.Series2 ?? [], hue2, 106, ink);
        return d;
    }

    private static void Column(SvgDocument d, RefractionPalette t, string label, Reading value, double[] series, SpectrumColor hue, double x, Color ink)
    {
        const double w = 78;
        var (_, max) = StatArt.AutoRange(series, 64_000, fixedMin: 0);
        StatArt.FitText(d, label, x, 40, 13, 12, w, hue.Vivid, TextAlign.Start, FontWeight.Semibold, LabelTracking, TextCase.Upper);
        StatArt.ValueUnit(d, value, x, 62, 24, w, ink, t.KeyMuted, TextAlign.Start, unitRatio: 0.5, minSize: 14);
        StatArt.Baseline(d, t, x, 90, w);
        StatArt.Sparkline(d, series, 30, x, 70, w, 20, 0, max, hue.Vivid, 1.75, t.IsDark ? 0.34 : 0.22, hue.Ink);
    }

    public static SvgDocument Unavailable(RefractionPalette t, string label, int hueIndex)
    {
        var hue = SystemHues.Of(t, hueIndex);
        var d = DialArt.Base(t, hue);
        Header(d, t, hue, label, "NO DATA");
        StatArt.ValueUnit(d, Reading.Missing, X0, 56, Refraction.Deck.DialValueSize, 100, t.KeyInk, t.KeyMuted, TextAlign.Start);
        StatArt.Baseline(d, t, X0, 90, Wd);
        return d;
    }
}
