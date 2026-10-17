using System.Globalization;

namespace PrismControl.SystemInfo.Render;

/// <summary>A formatted value split into the number (drawn big) and its unit (drawn small). "—" when unknown.</summary>
public readonly record struct Reading(string Number, string Unit)
{
    public const string Dash = "—";
    public static Reading Missing => new(Dash, "");
    public bool IsMissing => Number == Dash;

    /// <summary>"42%", "61°C", "5.31 GHz", "12.4 MB/s", "—".</summary>
    public string Text => IsMissing || Unit.Length == 0 ? Number : Unit is "%" or "°C" ? Number + Unit : Number + " " + Unit;

    public override string ToString() => Text;
}

/// <summary>Clean unit formatting: %, °C, MHz/GHz, W, GiB/TiB, B/s…GB/s (or bits). Invariant culture; never invents a value.</summary>
public static class Fmt
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public static Reading Percent(double? v) => v is { } x && double.IsFinite(x) ? new(Math.Round(Math.Clamp(x, 0, 100)).ToString("0", Inv), "%") : Reading.Missing;

    public static Reading Temp(double? c) => c is { } x && double.IsFinite(x) ? new(Math.Round(x).ToString("0", Inv), "°C") : Reading.Missing;

    public static Reading Clock(double? mhz)
    {
        if (mhz is not { } m || !double.IsFinite(m) || m <= 0) return Reading.Missing;
        return m >= 1000 ? new((m / 1000).ToString("0.00", Inv), "GHz") : new(m.ToString("0", Inv), "MHz");
    }

    public static Reading Power(double? w)
    {
        if (w is not { } x || !double.IsFinite(x) || x < 0) return Reading.Missing;
        return new(x < 10 ? x.ToString("0.0", Inv) : Math.Round(x).ToString("0", Inv), "W");
    }

    public static Reading GiB(double? gib)
    {
        if (gib is not { } g || !double.IsFinite(g) || g < 0) return Reading.Missing;
        if (g >= 999.5) return new(Sig3(g / 1024), "TiB");
        return new(g < 99.95 ? g.ToString("0.0", Inv) : Math.Round(g).ToString("0", Inv), "GiB");
    }

    public static Reading MiBAsGiB(double? mib) => mib is { } m ? GiB(m / 1024) : Reading.Missing;

    /// <summary>Bytes per second as B/s, KB/s, MB/s, GB/s (decimal), or bits per second when <paramref name="bits"/>.</summary>
    public static Reading Rate(double? bytesPerSec, bool bits = false)
    {
        if (bytesPerSec is not { } b || !double.IsFinite(b) || b < 0) return Reading.Missing;
        var v = bits ? b * 8 : b;
        // Bits spell out "bit": the stroke font has no lowercase, so "Mb/s" would read like "MB/s".
        string[] units = bits ? ["bit/s", "Kbit/s", "Mbit/s", "Gbit/s"] : ["B/s", "KB/s", "MB/s", "GB/s"];
        var i = 0;
        while (v >= 999.5 && i < units.Length - 1)
        {
            v /= 1000;
            i++;
        }
        return new(i == 0 ? Math.Round(v).ToString("0", Inv) : Sig3(v), units[i]);
    }

    /// <summary>Two rates in one unit (the larger one's), e.g. ("1.58", "0.35", "MB/s"), so "R 1.58 · W 0.35" reads consistently.</summary>
    public static (string A, string B, string Unit) RatePair(double? a, double? b, bool bits = false)
    {
        var big = Rate(Math.Max(a ?? 0, b ?? 0), bits);
        if (big.IsMissing || (a is null && b is null)) return (Reading.Dash, Reading.Dash, "");
        var scale = big.Unit[0] switch { 'K' => 1e3, 'M' => 1e6, 'G' => 1e9, _ => 1.0 } / (bits ? 8 : 1);
        string N(double? v) => v is { } x && double.IsFinite(x) ? (scale == 1 ? Math.Round(x * (bits ? 8 : 1)).ToString("0", Inv) : Sig3(x / scale)) : Reading.Dash;
        return (N(a), N(b), big.Unit);
    }

    /// <summary>3 significant digits: 1.23, 12.3, 123.</summary>
    private static string Sig3(double v) => v < 9.995 ? v.ToString("0.00", Inv) : v < 99.95 ? v.ToString("0.0", Inv) : Math.Round(v).ToString("0", Inv);

    /// <summary>"51.1 / 93.6 GiB" (one unit for both when they share it).</summary>
    public static string UsedOfTotal(Reading used, Reading total) =>
        used.IsMissing || total.IsMissing ? Reading.Dash : used.Unit == total.Unit ? $"{used.Number} / {total.Number} {total.Unit}" : $"{used.Text} / {total.Text}";

    /// <summary>Joins the non-empty parts with a middle dot: "5.31 GHz · 61°C".</summary>
    public static string Join(params string?[] parts) => string.Join(" · ", parts.Where(p => !string.IsNullOrEmpty(p)));
}
