using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Render;

/// <summary>
/// Stats keys on the 144-unit canvas (@2x; the 72 px render is a straight downsample). Grammar from tokens.json:
/// label 22, value 44 (unit small), micro 16 minimum, text inside 16 px, the spectral index 12 px above the bottom.
/// Rhythm: label 16-32 · value 48-80 · sub 88-99 · history 106-126 · index 130-134.
/// </summary>
public static class KeyFrames
{
    private const double S = KeyArt.Size;
    private const double Pad = Refraction.Deck.SafeText;   // 16
    private const double W = S - 2 * Pad;                   // 112
    public const int Window = 40;                           // samples across a key's sparkline

    /// <summary>Value + label + a small history sparkline (the default view of every stats key).</summary>
    public static SvgDocument History(RefractionPalette t, StatView v)
    {
        var hue = SystemHues.Of(t, v.Hue);
        var d = KeyArt.Base(t, hue);
        StatArt.KeyAlert(d, t, v.Level);
        var label = v.Glyph1 is { } g && v.Value2 is null ? $"{g} {v.Label}" : v.Label;
        StatArt.FitText(d, label, S / 2, 32, Refraction.Deck.LabelSize, 16, W, t.KeyMuted, TextAlign.Middle);

        const double cy = 106, ch = 20;
        if (v.Value2 is { } second && v.Sub is null)
        {
            var hue2 = SystemHues.Of(t, v.Hue2);
            Row(d, t, v.Glyph1 ?? StatViews.Down, hue.Vivid, v.Value, 63);
            Row(d, t, v.Glyph2 ?? StatViews.Up, hue2.Vivid, second, 94);
            Chart(d, t, v.Series, v.Min, v.Max, hue, cy, ch, area: true);
            if (v.Series2 is { } s2) Chart(d, t, s2, v.Min, v.Max, hue2, cy, ch, area: false);
        }
        else
        {
            StatArt.ValueUnit(d, v.Value, S / 2, 80, Refraction.Deck.ValueSize, W, t.KeyInk, t.KeyMuted, TextAlign.Middle);
            SubLine(d, t, v, 99);
            if (v.Fraction is { } f && v.Series.Length == 0)
                StatArt.Meter(d, Pad, cy + ch - 8, W, 6, f, t.Panel2, v.Level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, v.Level));
            else Chart(d, t, v.Series, v.Min, v.Max, hue, cy, ch, area: true);
        }
        StatArt.Index(d, t, hue, v.Level);
        return d;
    }

    /// <summary>
    /// The 16 px sub line: the full text if it fits, else the short variant, else a two-part "a · b" split to the left and
    /// right edges, else ellipsized. Never below 16 px (tokens: nothing below 16 @144).
    /// </summary>
    internal static void SubLine(SvgDocument d, RefractionPalette t, StatView v, double baseline)
    {
        const double size = Refraction.Deck.MicroSize;
        if (string.IsNullOrEmpty(v.Sub)) return;
        foreach (var text in new[] { v.Sub, v.SubShort })
        {
            if (text is null || StrokeFont.Measure(text, size) > W) continue;
            d.Text(text, S / 2, baseline, size, t.KeyMuted, TextAlign.Middle);
            return;
        }
        var parts = (v.SubShort ?? v.Sub).Split(" · ");
        if (parts.Length == 2 && StrokeFont.Measure(parts[0], size) + StrokeFont.Measure(parts[1], size) + 10 <= W)
        {
            d.Text(parts[0], Pad, baseline, size, t.KeyMuted, TextAlign.Start);
            d.Text(parts[1], S - Pad, baseline, size, t.KeyMuted, TextAlign.End);
            return;
        }
        StatArt.FitText(d, v.SubShort ?? v.Sub, S / 2, baseline, size, size, W, t.KeyMuted, TextAlign.Middle);
    }

    private static void Row(SvgDocument d, RefractionPalette t, string glyph, Color glyphColor, Reading r, double baseline)
    {
        d.Text(glyph, Pad, baseline, 26, glyphColor, TextAlign.Start, FontWeight.Semibold);
        StatArt.ValueUnit(d, r, Pad + 22, baseline, 32, W - 22, t.KeyInk, t.KeyMuted, TextAlign.Start, unitRatio: 0.5, minSize: 18);
    }

    private static void Chart(SvgDocument d, RefractionPalette t, double[] series, double min, double max, SpectrumColor hue, double y, double h, bool area)
    {
        if (area) StatArt.Baseline(d, t, Pad, y + h, W);
        StatArt.Sparkline(d, series, Window, Pad, y, W, h, min, max, hue.Vivid, 2.5, t.IsDark ? 0.34 : 0.22, area ? hue.Ink : null, area);
    }

    // ------------------------------------------------------------------ detail views (a press toggles)

    /// <summary>Per-core load bars, with the total top-right (only rendered while visible: per-core is sampled only then).</summary>
    public static SvgDocument CpuCores(RefractionPalette t, CpuFrame? c)
    {
        var hue = SystemHues.Of(t, SystemHues.Cpu);
        var d = KeyArt.Base(t, hue);
        var level = c?.TempC is { } tc ? tc >= 95 ? Level.Crit : tc >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        StatArt.KeyAlert(d, t, level);
        d.Text("CPU", Pad, 32, Refraction.Deck.LabelSize, t.KeyMuted, TextAlign.Start);
        StatArt.ValueUnit(d, Fmt.Percent(c?.UsagePct), S - Pad, 33, 28, 64, t.KeyInk, t.KeyMuted, TextAlign.End, unitRatio: 0.55);
        var cores = c?.PerCorePct;
        if (cores is { Count: > 0 })
        {
            var f = Downsample(cores, 32);
            StatArt.Bars(d, f, Pad, 44, W, 76, t.Panel2, hue.Vivid);
        }
        else
        {
            StatArt.Bars(d, new double[Math.Clamp(c?.Threads ?? 16, 1, 32)], Pad, 44, W, 76, t.Panel2, hue.Vivid);
        }
        StatArt.Index(d, t, hue, level);
        return d;
    }

    /// <summary>Per-core values as 0..1 fractions; above <paramref name="max"/> bars, neighbors are averaged.</summary>
    internal static double[] Downsample(IReadOnlyList<double> pct, int max)
    {
        var groups = (int)Math.Ceiling(pct.Count / (double)max);
        var n = (int)Math.Ceiling(pct.Count / (double)groups);
        var result = new double[n];
        for (var i = 0; i < n; i++)
        {
            double sum = 0;
            var k = 0;
            for (var j = i * groups; j < Math.Min(pct.Count, (i + 1) * groups); j++, k++) sum += pct[j];
            result[i] = k == 0 ? 0 : sum / k / 100;
        }
        return result;
    }

    /// <summary>Every GPU number at once: load, temperature, power, VRAM.</summary>
    public static SvgDocument GpuDetail(RefractionPalette t, TelemetryFrame? f, string? gpuId)
    {
        var hue = SystemHues.Of(t, SystemHues.Gpu);
        var d = KeyArt.Base(t, hue);
        var g = f?.FindGpu(gpuId);
        var level = Level.Normal;
        if (g is not null && g.TempC is { } tc)
        {
            var (warn, crit) = StatViews.GpuTempLimits(g);
            level = tc >= crit ? Level.Crit : tc >= warn ? Level.Warn : Level.Normal;
        }
        StatArt.KeyAlert(d, t, level);
        StatArt.FitText(d, f is not null && g is not null ? StatViews.GpuLabel(f, g) : "GPU", S / 2, 30, 20, 16, W, t.KeyMuted, TextAlign.Middle);
        DetailRow(d, t, "LOAD", Fmt.Percent(g?.UsagePct), 56);
        DetailRow(d, t, "TEMP", Fmt.Temp(g?.TempC), 78);
        DetailRow(d, t, "POWER", Fmt.Power(g?.PowerW), 100);
        DetailRow(d, t, "VRAM", Fmt.MiBAsGiB(g?.VramUsedMiB), 122);
        StatArt.Index(d, t, hue, level);
        return d;
    }

    private static void DetailRow(SvgDocument d, RefractionPalette t, string label, Reading value, double baseline)
    {
        var lw = StatArt.FitText(d, label, Pad, baseline, 16, 16, 60, t.KeyMuted, TextAlign.Start);
        StatArt.ValueUnit(d, value, S - Pad, baseline, 21, W - lw - 6, t.KeyInk, t.KeyMuted, TextAlign.End, unitRatio: 0.6, minSize: 16);
    }

    /// <summary>Used / total and commit charge.</summary>
    public static SvgDocument RamDetail(RefractionPalette t, MemoryFrame? m)
    {
        var hue = SystemHues.Of(t, SystemHues.Ram);
        var d = KeyArt.Base(t, hue);
        var level = m?.UsagePct is { } p ? p >= 95 ? Level.Crit : p >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        StatArt.KeyAlert(d, t, level);
        StatArt.FitText(d, "MEMORY", S / 2, 32, 20, 16, W, t.KeyMuted, TextAlign.Middle);
        StatArt.ValueUnit(d, Fmt.MiBAsGiB(m?.UsedMiB), S / 2, 70, 38, W, t.KeyInk, t.KeyMuted, TextAlign.Middle);
        var total = Fmt.MiBAsGiB(m?.TotalMiB);
        if (!total.IsMissing) StatArt.FitText(d, "OF " + total.Text, S / 2, 90, 16, 16, W, t.KeyMuted, TextAlign.Middle);
        StatArt.Meter(d, Pad, 98, W, 6, m?.UsagePct / 100, t.Panel2, level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, level));
        if (m?.CommitUsedMiB is { } cu && m.CommitLimitMiB is { } cl && cl > 0)
            StatArt.FitText(d, "COMMIT " + Fmt.Percent(cu / cl * 100).Text, S / 2, 122, 16, 16, W, t.KeyMuted, TextAlign.Middle);
        StatArt.Index(d, t, hue, level);
        return d;
    }

    /// <summary>Up to three drives: name, free space and a used meter (the chosen drive first).</summary>
    public static SvgDocument DiskDetail(RefractionPalette t, TelemetryFrame? f, string? drive)
    {
        var hue = SystemHues.Of(t, SystemHues.Disk);
        var d = KeyArt.Base(t, hue);
        var disks = OrderDisks(f, drive).Take(3).ToList();
        var worst = Level.Normal;
        for (var i = 0; i < disks.Count; i++)
        {
            var k = disks[i];
            var y = 36 + i * 36;
            var freePct = k.FreeGiB is { } fr && k.TotalGiB is { } tt && tt > 0 ? fr / tt * 100 : (double?)null;
            var level = freePct is { } fp ? fp < 5 ? Level.Crit : fp < 10 ? Level.Warn : Level.Normal : Level.Normal;
            if (level > worst) worst = level;
            d.Text(k.Name, Pad, y, 20, t.KeyInk, TextAlign.Start);
            StatArt.FitText(d, Fmt.GiB(k.FreeGiB).Text, S - Pad, y, 16, 16, 70, t.KeyMuted, TextAlign.End);
            StatArt.Meter(d, Pad, y + 7, W, 5, k.UsagePct / 100, t.Panel2, level == Level.Normal ? hue.Vivid : StatArt.LevelColor(t, level));
        }
        if (disks.Count == 0) StatArt.ValueUnit(d, Reading.Missing, S / 2, 80, 44, W, t.KeyInk, t.KeyMuted);
        StatArt.KeyAlert(d, t, worst);
        StatArt.Index(d, t, hue, worst);
        return d;
    }

    internal static IEnumerable<DiskFrame> OrderDisks(TelemetryFrame? f, string? drive)
    {
        if (f is null) return [];
        var first = StatViews.ResolveDrive(drive);
        return f.Disks.OrderByDescending(x => first is not null && string.Equals(x.Name, first, StringComparison.OrdinalIgnoreCase))
            .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Adapter name, both directions and the link speed.</summary>
    public static SvgDocument NetDetail(RefractionPalette t, StatView v, double? linkMbps)
    {
        var hue = SystemHues.Of(t, v.Hue);
        var hue2 = SystemHues.Of(t, v.Hue2 == 0 ? SystemHues.NetUp : v.Hue2);
        var d = KeyArt.Base(t, hue);
        StatArt.FitText(d, v.Label, S / 2, 30, 20, 16, W, t.KeyMuted, TextAlign.Middle);
        Row(d, t, StatViews.Down, hue.Vivid, v.Value, 64);
        Row(d, t, StatViews.Up, hue2.Vivid, v.Value2 ?? Reading.Missing, 96);
        var link = v.Sub ?? (linkMbps is { } l ? StatViews.LinkText(l) + " LINK" : null);
        if (link is not null) StatArt.FitText(d, link, S / 2, 120, 16, 16, W, t.KeyMuted, TextAlign.Middle);
        KeyArt.HueIndex(d, hue, on: false);
        return d;
    }

    /// <summary>No telemetry service (the module failed to start): say so instead of showing numbers.</summary>
    public static SvgDocument Unavailable(RefractionPalette t, string label, int hueIndex)
    {
        var hue = SystemHues.Of(t, hueIndex);
        var d = KeyArt.Base(t, hue);
        StatArt.FitText(d, label, S / 2, 32, Refraction.Deck.LabelSize, 16, W, t.KeyMuted, TextAlign.Middle);
        StatArt.ValueUnit(d, Reading.Missing, S / 2, 80, Refraction.Deck.ValueSize, W, t.KeyInk, t.KeyMuted);
        StatArt.FitText(d, "NO DATA", S / 2, 99, 16, 16, W, t.KeyMuted, TextAlign.Middle);
        KeyArt.HueIndex(d, hue, on: false);
        return d;
    }
}
