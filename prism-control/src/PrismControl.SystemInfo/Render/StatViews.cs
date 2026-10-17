using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Render;

/// <summary>What one metric shows: label, big value, a sub line, and its history. Built from a frame; rendered by keys and dials.</summary>
public sealed record StatView
{
    public string Label { get; init; } = "";
    public Reading Value { get; init; } = Reading.Missing;
    public string? Sub { get; init; }
    /// <summary>A shorter sub line for the 144 px key when <see cref="Sub"/> does not fit.</summary>
    public string? SubShort { get; init; }
    /// <summary>Right side of the dial's value row (e.g. "PEAK 87%").</summary>
    public string? Aux { get; init; }
    public double[] Series { get; init; } = [];
    public double Min { get; init; }
    public double Max { get; init; } = 100;
    /// <summary>When set (and there is no series), a meter is drawn instead of the chart (e.g. disk space).</summary>
    public double? Fraction { get; init; }
    public int Hue { get; init; }
    public Level Level { get; init; }
    /// <summary>A second value + series (network: upload next to download).</summary>
    public Reading? Value2 { get; init; }
    public double[]? Series2 { get; init; }
    public int Hue2 { get; init; }
    public string? Glyph1 { get; init; }
    public string? Glyph2 { get; init; }
}

/// <summary>Builds <see cref="StatView"/>s. Unknown values stay "—" (never invented); the iGPU is labeled IGPU, never CPU.</summary>
public static class StatViews
{
    public const string Down = "↓", Up = "↑";

    public static string SystemDrive { get; } = (Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\").TrimEnd('\\').ToUpperInvariant();

    // ------------------------------------------------------------------ CPU

    public static StatView Cpu(TelemetryFrame? f, TelemetryHistory h, string? metric, bool showTemp, int window)
    {
        var c = f?.Cpu;
        var temp = showTemp ? TempText(c) : null;
        var level = c?.TempC is { } tc ? tc >= 95 ? Level.Crit : tc >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        switch (Norm(metric))
        {
            case "clock":
            {
                var s = h.Last(Series.CpuClock, window);
                var (lo, hi) = StatArt.AutoRange(s, 600, floor: 0);
                return new StatView { Label = "CPU CLOCK", Value = Fmt.Clock(c?.ClockMhz), Sub = Fmt.Join(Fmt.Percent(c?.UsagePct).Text, temp), Series = s, Min = lo, Max = hi, Hue = SystemHues.Cpu, Level = level, Aux = Peak(s, v => Fmt.Clock(v)) };
            }
            case "temp":
            {
                var s = h.Last(Series.CpuTemp, window);
                var (lo, hi) = StatArt.AutoRange(s, 12);
                var missing = c?.TempC is null;
                // The source is part of the reading: "iCUE · 42%" says where the number came from.
                var via = TempSourceLabel(c?.TempSource);
                return new StatView
                {
                    Label = "CPU TEMP",
                    Value = Fmt.Temp(c?.TempC),
                    Sub = missing ? "LHM / HWiNFO / iCUE" : Fmt.Join(via, Fmt.Percent(c?.UsagePct).Text, Fmt.Clock(c?.ClockMhz).Text),
                    SubShort = missing ? "LHM / HWiNFO" : Fmt.Join(via, Fmt.Percent(c?.UsagePct).Text), // the 144 px key's 16 px line
                    Aux = missing ? "NEEDS LHM, HWiNFO OR iCUE" : Peak(s, v => Fmt.Temp(v)),
                    Series = s, Min = lo, Max = hi, Hue = SystemHues.Cpu, Level = level,
                };
            }
            default:
            {
                var s = h.Last(Series.CpuUsage, window);
                return new StatView { Label = "CPU", Value = Fmt.Percent(c?.UsagePct), Sub = Fmt.Join(Fmt.Clock(c?.ClockMhz) is { IsMissing: false } k ? k.Text : null, temp), Series = s, Min = 0, Max = 100, Hue = SystemHues.Cpu, Level = level, Aux = Peak(s, v => Fmt.Percent(v)) };
            }
        }
    }

    /// <summary>The short name of where a CPU temperature came from ("LHM", "HWiNFO", "iCUE"; null when unknown).</summary>
    public static string? TempSourceLabel(string? provider) => provider switch
    {
        null or "" => null,
        CpuTemp.CpuTempMonitor.LhmName => "LHM",
        CpuTemp.CpuTempMonitor.HwInfoName => "HWiNFO",
        CpuTemp.CpuTempMonitor.IcueName => "iCUE",
        _ => provider,
    };

    /// <summary>"61°C", or "—°C" when the temperature is wanted but no provider runs.</summary>
    private static string? TempText(CpuFrame? c) => c is null ? null : c.TempC is { } t ? Fmt.Temp(t).Text : Reading.Dash + "°C";

    // ------------------------------------------------------------------ GPU

    public static string GpuLabel(TelemetryFrame f, GpuFrame g) =>
        g.Integrated ? "IGPU" : f.Gpus.Count(x => !x.Integrated) > 1 ? $"GPU {g.Index + 1}" : "GPU";

    public static (double Warn, double Crit) GpuTempLimits(GpuFrame g) => g.TempWarnC is { } w and > 40 ? (w, w + 6) : (85, 92);

    public static StatView Gpu(TelemetryFrame? f, TelemetryHistory h, string? gpuId, string? metric, int window)
    {
        var g = f?.FindGpu(gpuId);
        if (f is null || g is null)
            return new StatView { Label = "GPU", Value = Reading.Missing, Sub = f is null ? null : "NO GPU", Hue = SystemHues.Gpu };
        var label = GpuLabel(f, g);
        var (warn, crit) = GpuTempLimits(g);
        var level = g.TempC is { } tc ? tc >= crit ? Level.Crit : tc >= warn ? Level.Warn : Level.Normal : Level.Normal;
        string Key(string m) => Series.Gpu(g.Id, m);
        switch (Norm(metric))
        {
            case "temp":
            {
                var s = h.Last(Key("temp"), window);
                var (lo, hi) = StatArt.AutoRange(s, 12);
                return new StatView { Label = label + " TEMP", Value = Fmt.Temp(g.TempC), Sub = Fmt.Join(Fmt.Percent(g.UsagePct).Text, NonMissing(Fmt.Power(g.PowerW))), Series = s, Min = lo, Max = hi, Hue = SystemHues.Gpu, Level = level, Aux = Peak(s, v => Fmt.Temp(v)) };
            }
            case "power":
            {
                var s = h.Last(Key("power"), window);
                var max = g.PowerLimitW is { } lim and > 0 ? lim : Math.Max(50, StatArt.MaxOf(s) * 1.2);
                return new StatView
                {
                    Label = label + " POWER", Value = Fmt.Power(g.PowerW),
                    Sub = g.PowerLimitW is { } l ? "LIMIT " + Fmt.Power(l).Text : NonMissing(Fmt.Percent(g.UsagePct)),
                    Series = s, Min = 0, Max = double.IsFinite(max) ? max : 100, Hue = SystemHues.Gpu, Level = level, Aux = Peak(s, v => Fmt.Power(v)),
                };
            }
            case "vram":
            {
                var s = h.Last(Key("vram"), window);
                var total = g.VramTotalMiB is { } t and > 0 ? t : Math.Max(1024, StatArt.MaxOf(s) * 1.2);
                return new StatView
                {
                    Label = g.Integrated ? "IGPU VRAM" : "VRAM", Value = Fmt.MiBAsGiB(g.VramUsedMiB),
                    Sub = g.VramTotalMiB is { } tt ? "OF " + Fmt.MiBAsGiB(tt).Text : null,
                    Series = s, Min = 0, Max = double.IsFinite(total) ? total : 1024, Hue = SystemHues.Gpu, Level = level,
                    Aux = g.VramUsedMiB is { } u && g.VramTotalMiB is { } tot && tot > 0 ? Fmt.Percent(u / tot * 100).Text + " USED" : null,
                };
            }
            case "clock":
            {
                var s = h.Last(Key("clock"), window);
                var (lo, hi) = StatArt.AutoRange(s, 400, floor: 0);
                return new StatView { Label = label + " CLOCK", Value = Fmt.Clock(g.ClockMhz), Sub = g.MemClockMhz is { } mc ? "MEM " + Fmt.Clock(mc).Text : null, Series = s, Min = lo, Max = hi, Hue = SystemHues.Gpu, Level = level, Aux = Peak(s, v => Fmt.Clock(v)) };
            }
            default:
            {
                var s = h.Last(Key("usage"), window);
                return new StatView { Label = label, Value = Fmt.Percent(g.UsagePct), Sub = Fmt.Join(NonMissing(Fmt.Temp(g.TempC)), NonMissing(Fmt.Power(g.PowerW))), Series = s, Min = 0, Max = 100, Hue = SystemHues.Gpu, Level = level, Aux = Peak(s, v => Fmt.Percent(v)) };
            }
        }
    }

    // ------------------------------------------------------------------ RAM

    public static StatView Ram(TelemetryFrame? f, TelemetryHistory h, string? metric, int window)
    {
        var m = f?.Memory;
        var level = m?.UsagePct is { } p ? p >= 95 ? Level.Crit : p >= 90 ? Level.Warn : Level.Normal : Level.Normal;
        var used = Fmt.MiBAsGiB(m?.UsedMiB);
        var total = Fmt.MiBAsGiB(m?.TotalMiB);
        if (Norm(metric) == "used")
        {
            var s = h.Last(Series.MemUsed, window);
            return new StatView { Label = "RAM", Value = used, Sub = total.IsMissing ? null : "OF " + total.Text, Series = s, Min = 0, Max = m?.TotalMiB ?? 1, Hue = SystemHues.Ram, Level = level, Aux = NonMissing(Fmt.Percent(m?.UsagePct)) };
        }
        var su = h.Last(Series.MemUsage, window);
        var shortSub = m?.UsedMiB is { } u && m.TotalMiB is { } tm && tm >= 10240 && used.Unit == "GiB" && total.Unit == "GiB"
            ? $"{Math.Round(u / 1024):0} / {Math.Round(tm / 1024):0} GiB" : null;
        return new StatView { Label = "RAM", Value = Fmt.Percent(m?.UsagePct), Sub = m is null ? null : Fmt.UsedOfTotal(used, total), SubShort = shortSub, Series = su, Min = 0, Max = 100, Hue = SystemHues.Ram, Level = level, Aux = Peak(su, v => Fmt.Percent(v)) };
    }

    // ------------------------------------------------------------------ Disk

    /// <summary>The drive a setting means: "" → the system drive, "*" → all drives (null), else the letter ("C:").</summary>
    public static string? ResolveDrive(string? setting)
    {
        if (string.IsNullOrWhiteSpace(setting)) return SystemDrive;
        var s = setting.Trim();
        if (s == "*") return null;
        return s.Length >= 1 && char.IsAsciiLetter(s[0]) ? char.ToUpperInvariant(s[0]) + ":" : SystemDrive;
    }

    public static StatView Disk(TelemetryFrame? f, TelemetryHistory h, string? drive, string? metric, int window)
    {
        var name = ResolveDrive(drive);
        double? active, read, write, free, total;
        string label;
        string sActive, sRead, sWrite;
        if (name is null)
        {
            label = "DISKS";
            active = f?.DiskTotal?.ActivePct;
            read = f?.DiskTotal?.ReadBps;
            write = f?.DiskTotal?.WriteBps;
            free = f is { Disks.Count: > 0 } ? f.Disks.Sum(d => d.FreeGiB ?? 0) : null;
            total = f is { Disks.Count: > 0 } ? f.Disks.Sum(d => d.TotalGiB ?? 0) : null;
            (sActive, sRead, sWrite) = (Series.DiskActive, Series.DiskRead, Series.DiskWrite);
        }
        else
        {
            var d = f?.FindDisk(name);
            label = "DISK " + name;
            (active, read, write, free, total) = (d?.ActivePct, d?.ReadBps, d?.WriteBps, d?.FreeGiB, d?.TotalGiB);
            (sActive, sRead, sWrite) = (Series.Disk(name, "active"), Series.Disk(name, "read"), Series.Disk(name, "write"));
        }
        var freePct = free is { } fr && total is { } tt && tt > 0 ? fr / tt * 100 : (double?)null;
        var level = freePct is { } fp ? fp < 5 ? Level.Crit : fp < 10 ? Level.Warn : Level.Normal : Level.Normal;
        var freeText = free is { } ff ? Fmt.GiB(ff).Text + " FREE" : null;
        switch (Norm(metric))
        {
            case "free":
                return new StatView
                {
                    Label = name is null ? "FREE" : name + " FREE", Value = Fmt.GiB(free), Sub = total is { } t2 ? "OF " + Fmt.GiB(t2).Text : null,
                    Fraction = freePct is { } p ? 1 - p / 100 : null, Hue = SystemHues.Disk, Level = level,
                    Aux = freePct is { } p2 ? Fmt.Percent(100 - p2).Text + " USED" : null,
                };
            case "throughput":
            {
                var r = h.Last(sRead, window);
                var w = h.Last(sWrite, window);
                var sum = new double[Math.Max(r.Length, w.Length)];
                for (var i = 0; i < sum.Length; i++)
                {
                    var ri = i - (sum.Length - r.Length);
                    var wi = i - (sum.Length - w.Length);
                    var rv = ri >= 0 ? r[ri] : double.NaN;
                    var wv = wi >= 0 ? w[wi] : double.NaN;
                    sum[i] = double.IsFinite(rv) || double.IsFinite(wv) ? (double.IsFinite(rv) ? rv : 0) + (double.IsFinite(wv) ? wv : 0) : double.NaN;
                }
                var (_, hi) = StatArt.AutoRange(sum, 1_000_000, fixedMin: 0);
                double? both = read is null && write is null ? null : (read ?? 0) + (write ?? 0);
                return new StatView
                {
                    Label = label, Value = Fmt.Rate(both), Sub = read is null ? null : $"R {Fmt.Rate(read).Text} · W {Fmt.Rate(write).Text}",
                    SubShort = read is null ? null : Fmt.RatePair(read, write) is var (pr, pw, _) ? $"R {pr} · W {pw}" : null,
                    Series = sum, Min = 0, Max = hi, Hue = SystemHues.Disk, Level = level, Aux = Peak(sum, v => Fmt.Rate(v)),
                };
            }
            default:
            {
                var s = h.Last(sActive, window);
                return new StatView { Label = label, Value = Fmt.Percent(active), Sub = freeText, Series = s, Min = 0, Max = 100, Hue = SystemHues.Disk, Level = level, Aux = Peak(s, v => Fmt.Percent(v)) };
            }
        }
    }

    // ------------------------------------------------------------------ Network

    public static StatView Net(TelemetryFrame? f, TelemetryHistory h, string? adapterId, string? metric, bool bits, int window)
    {
        NetAdapterFrame? a;
        var offline = false;
        if (string.IsNullOrEmpty(adapterId)) a = f?.FindAdapter(null);
        else
        {
            a = f?.Network?.Adapters.FirstOrDefault(x => x.Id == adapterId);
            offline = f?.Network is not null && a is null;
        }
        var label = a is null ? "NET" : ShortName(a.Name);
        var key = a?.Id ?? (string.IsNullOrEmpty(adapterId) ? null : adapterId);
        var rx = h.Last(key is null ? Series.NetRx : Series.Net(key, "rx"), window);
        var tx = h.Last(key is null ? Series.NetTx : Series.Net(key, "tx"), window);
        var mx = Math.Max(StatArt.MaxOf(rx) is var m1 && double.IsFinite(m1) ? m1 : 0, StatArt.MaxOf(tx) is var m2 && double.IsFinite(m2) ? m2 : 0);
        var max = Math.Max(64_000, mx * 1.15);
        var rxv = Fmt.Rate(a?.RxBps, bits);
        var txv = Fmt.Rate(a?.TxBps, bits);
        var sub = offline ? "OFFLINE" : a is null ? (f?.Network is null ? null : "NO ADAPTER") : a.Up ? null : "OFFLINE";
        switch (Norm(metric))
        {
            case "down":
                return new StatView { Label = label, Value = rxv, Sub = sub ?? $"{Up} {txv.Text}", Series = rx, Min = 0, Max = max, Hue = SystemHues.Net, Glyph1 = Down, Aux = Peak(rx, v => Fmt.Rate(v, bits)) };
            case "up":
                return new StatView { Label = label, Value = txv, Sub = sub ?? $"{Down} {rxv.Text}", Series = tx, Min = 0, Max = max, Hue = SystemHues.NetUp, Glyph1 = Up, Aux = Peak(tx, v => Fmt.Rate(v, bits)) };
            default:
                return new StatView
                {
                    Label = label, Value = rxv, Value2 = txv, Sub = sub, Series = rx, Series2 = tx, Min = 0, Max = max,
                    Hue = SystemHues.Net, Hue2 = SystemHues.NetUp, Glyph1 = Down, Glyph2 = Up,
                    Aux = a?.LinkMbps is { } link ? LinkText(link) : null,
                };
        }
    }

    public static string LinkText(double mbps) => mbps >= 1000
        ? (mbps / 1000).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture) + " Gbit/s"
        : mbps.ToString("0", System.Globalization.CultureInfo.InvariantCulture) + " Mbit/s";

    /// <summary>"Ethernet 2" → "ETHERNET 2"; "vEthernet (Default Switch)" → "VETHERNET".</summary>
    public static string ShortName(string alias)
    {
        var s = alias;
        var paren = s.IndexOf(" (", StringComparison.Ordinal);
        if (paren > 0) s = s[..paren];
        return s.Trim().ToUpperInvariant();
    }

    // ------------------------------------------------------------------ helpers

    private static string Norm(string? metric) => (metric ?? "").Trim().ToLowerInvariant();

    private static string? NonMissing(Reading r) => r.IsMissing ? null : r.Text;

    private static string? Peak(double[] series, Func<double, Reading> format)
    {
        var m = StatArt.MaxOf(series);
        return double.IsFinite(m) ? "PEAK " + format(m).Text : null;
    }
}
