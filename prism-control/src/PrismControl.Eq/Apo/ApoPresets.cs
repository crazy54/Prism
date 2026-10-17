using System.Globalization;
using System.Text.RegularExpressions;

namespace PrismControl.Eq.Apo;

/// <summary>A plugin-side APO preset: a named band set (APO itself has no preset concept).</summary>
public sealed record ApoPreset(string Id, string Name, IReadOnlyList<EqBand> Bands, bool IsBuiltIn)
{
    public EqPreset ToEqPreset(int position) => new(Id, Name, IsFavorite: IsBuiltIn, FavoritePosition: IsBuiltIn ? position : -1, IsBuiltIn);
}

/// <summary>Built-in band sets, and the importer for AutoEQ / REW "ParametricEQ.txt" files (already APO syntax).</summary>
public static partial class ApoPresets
{
    public const string FlatId = "builtin:flat";

    /// <summary>Ten bands an octave apart, shelves at the ends (the same grid as Sonar's default "Custom").</summary>
    public static IReadOnlyList<EqBand> Grid(params double[] gains)
    {
        double[] hz = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        return hz.Select((f, i) => new EqBand(i + 1, true,
            i == 0 ? EqFilterType.LowShelf : i == hz.Length - 1 ? EqFilterType.HighShelf : EqFilterType.Peaking,
            f, i < gains.Length ? gains[i] : 0, i == 0 || i == hz.Length - 1 ? 0.71 : 1.41)).ToList();
    }

    public static readonly IReadOnlyList<ApoPreset> BuiltIn =
    [
        new(FlatId, "Flat", Grid(), true),
        new("builtin:bass", "Bass boost", Grid(5, 4, 2.5, 1), true),
        new("builtin:treble", "Treble boost", Grid(0, 0, 0, 0, 0, 0, 1, 2.5, 4, 5), true),
        new("builtin:vocal", "Vocal presence", Grid(-2, -1.5, -1, 0, 1, 2.5, 3, 2, 0, -1), true),
        new("builtin:loudness", "Loudness", Grid(4.5, 3.5, 2, 0, -1, -1, 0, 1.5, 3, 4), true),
        new("builtin:night", "Night (soft lows)", Grid(-5, -3.5, -2, -1, 0, 0, 0.5, 0.5, 0, -1), true),
    ];

    [GeneratedRegex(@"^\s*Filter\s*\d*\s*:\s*(?<on>ON|OFF)\s+(?<type>PK|PEQ|LSC|HSC|LS|HS|LP|LPQ|HP|HPQ|NO|BP|AP)\b(?<rest>.*)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FilterRegex();

    [GeneratedRegex(@"Fc\s+(?<v>[-+0-9.]+)\s*Hz", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FcRegex();

    [GeneratedRegex(@"Gain\s+(?<v>[-+0-9.]+)\s*dB", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex GainRegex();

    [GeneratedRegex(@"\bQ\s+(?<v>[-+0-9.]+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex QRegex();

    [GeneratedRegex(@"^\s*Preamp\s*:\s*(?<v>[-+0-9.]+)\s*dB", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PreampRegex();

    /// <summary>
    /// Parses "Filter N: ON PK Fc 105 Hz Gain 4.0 dB Q 0.71" lines (AutoEQ / REW / APO). Lines it does not understand
    /// are skipped. Returns the bands (1-based, in file order, at most <paramref name="maxBands"/>) and the preamp.
    /// </summary>
    public static (IReadOnlyList<EqBand> Bands, double? PreampDb) ParseParametric(string text, int maxBands = 32)
    {
        var bands = new List<EqBand>();
        double? preamp = null;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith('#') || line.Length == 0) continue;
            if (PreampRegex().Match(line) is { Success: true } pm && Num(pm.Groups["v"].Value) is { } pv) { preamp = pv; continue; }
            var m = FilterRegex().Match(line);
            if (!m.Success || bands.Count >= maxBands) continue;
            var rest = m.Groups["rest"].Value;
            if (Num(FcRegex().Match(rest).Groups["v"].Value) is not { } fc) continue;
            var gain = Num(GainRegex().Match(rest).Groups["v"].Value) ?? 0;
            var type = m.Groups["type"].Value.ToUpperInvariant() switch
            {
                "LSC" or "LS" => EqFilterType.LowShelf,
                "HSC" or "HS" => EqFilterType.HighShelf,
                "LP" or "LPQ" => EqFilterType.LowPass,
                "HP" or "HPQ" => EqFilterType.HighPass,
                "NO" => EqFilterType.Notch,
                "BP" => EqFilterType.BandPass,
                "AP" => EqFilterType.AllPass,
                _ => EqFilterType.Peaking,
            };
            var q = Num(QRegex().Match(rest).Groups["v"].Value) ?? (type is EqFilterType.LowShelf or EqFilterType.HighShelf ? 0.71 : 1.41);
            var l = EqLimits.Apo;
            bands.Add(new EqBand(bands.Count + 1, m.Groups["on"].Value.Equals("ON", StringComparison.OrdinalIgnoreCase), type,
                Math.Clamp(fc, l.MinHz, l.MaxHz), Math.Clamp(gain, l.MinGainDb, l.MaxGainDb), Math.Clamp(q, l.MinQ, l.MaxQ)));
        }
        return (bands, preamp);
    }

    private static double? Num(string s) => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && double.IsFinite(v) ? v : null;
}
