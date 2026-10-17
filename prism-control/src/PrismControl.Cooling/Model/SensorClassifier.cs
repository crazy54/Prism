using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace PrismControl.Cooling;

/// <summary>
/// Turns raw provider readings into kinds, roles and short names. The heuristics only use what the sources say
/// (device and sensor names); where they cannot tell (every iCUE LINK fan reports the same "iCUE LINK System Hub"
/// device), the role stays <see cref="CoolingRole.Unassigned"/> and the user assigns it in the property inspector.
/// </summary>
public static partial class SensorClassifier
{
    public static SensorKind? KindOf(RawSensor s) => s.Type switch
    {
        RawSensorType.Pump => SensorKind.Pump,
        RawSensorType.Fan => PumpName().IsMatch(s.Name) ? SensorKind.Pump : SensorKind.Fan,
        RawSensorType.Temperature when s.Kind == "package" => SensorKind.Cpu,
        RawSensorType.Temperature when s.Kind == "coolant" || CoolantName().IsMatch(s.Name) => SensorKind.Coolant,
        RawSensorType.Temperature when s.Kind == "air" => SensorKind.Air,
        _ => null,
    };

    /// <summary>
    /// The automatic role. <paramref name="pumpPrefixes"/> are the "Device:" prefixes of pump names in the same
    /// reading (a fan named like its AIO, e.g. "H150i ELITE: Fan #1", is on that AIO's radiator).
    /// </summary>
    public static CoolingRole AutoRole(SensorKind kind, string name, string device, IReadOnlyCollection<string>? pumpPrefixes = null)
    {
        switch (kind)
        {
            case SensorKind.Pump: return CoolingRole.Pump;
            case SensorKind.Fan:
                if (GpuDevice().IsMatch(device) || GpuName().IsMatch(name)) return CoolingRole.Gpu;
                if (RadiatorName().IsMatch(name)) return CoolingRole.Radiator;
                if (pumpPrefixes is { Count: > 0 } && Prefix(name) is { } p && pumpPrefixes.Contains(p, StringComparer.OrdinalIgnoreCase)) return CoolingRole.Radiator;
                if (CoolerDevice().IsMatch(device) && !HubDevice().IsMatch(device)) return CoolingRole.Radiator;
                if (CaseName().IsMatch(name)) return CoolingRole.Case;
                return CoolingRole.Unassigned;
            default:
                return CoolingRole.Unassigned;
        }
    }

    /// <summary>The part of "Device name: Sensor" before the colon (null if there is none).</summary>
    public static string? Prefix(string name)
    {
        var i = name.LastIndexOf(':');
        return i > 0 ? name[..i].Trim() : null;
    }

    /// <summary>"iCUE LINK RX RGB #1: Fan" → "RX RGB #1"; "Fan #2" on a GPU → "GPU fan 2"; "AIO Pump" stays.</summary>
    public static string ShortName(string name, string device, SensorKind kind)
    {
        var n = name.Trim();
        foreach (var p in new[] { "iCUE LINK ", "iCUE " })
            if (n.StartsWith(p, StringComparison.OrdinalIgnoreCase) && n.Length > p.Length) { n = n[p.Length..]; break; }
        n = SuffixRe().Replace(n, "").Trim();
        var m = NumberedFan().Match(n);
        if (m.Success && kind == SensorKind.Fan)
        {
            if (GpuDevice().IsMatch(device)) return "GPU fan " + m.Groups[1].Value;
            if (BoardDevice().IsMatch(device)) return "Board fan " + m.Groups[1].Value;
        }
        if (kind == SensorKind.Cpu && n.Equals("Package", StringComparison.OrdinalIgnoreCase)) return "CPU package";
        return n.Length == 0 ? name.Trim() : n;
    }

    /// <summary>A stable, opaque id for an iCUE sensor: "icue-" + 10 hex chars of SHA-256(device|name|type|kind).
    /// Never contains iCUE's runtime GUIDs or any serial number.</summary>
    public static string IcueId(string device, string name, RawSensorType type, string kind)
    {
        var key = string.Join('|', device.Trim(), name.Trim(), type.ToString(), kind).ToLowerInvariant();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return "icue-" + Convert.ToHexString(hash, 0, 5).ToLowerInvariant();
    }

    /// <summary>
    /// What kind of device a name belongs to: "link" (the iCUE LINK hub), "gpu", "board", "cpu", "memory" or "other".
    /// Works on iCUE's real device names ("AMD Ryzen 7 9800X3D") and on the automation pipe's generic labels ("CPU",
    /// "GPU #2"), so the same sensor can be matched across the two pipes.
    /// </summary>
    public static string DeviceClass(string device)
    {
        var d = device.Trim();
        if (d.Equals(Icue.IcueProvider.LinkHubDevice, StringComparison.OrdinalIgnoreCase)) return "link";
        if (GpuDevice().IsMatch(d)) return "gpu";
        if (BoardDevice().IsMatch(d)) return "board";
        if (CpuDevice().IsMatch(d)) return "cpu";
        if (MemoryDevice().IsMatch(d)) return "memory";
        return "other";
    }

    /// <summary>Parses "1470.00", "2364 RPM", "61.1 °C", "61,1 °C" (culture-formatted LHM), "-" → null.</summary>
    public static double? ParseNumber(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var m = NumberRe().Match(text);
        if (!m.Success) return null;
        var s = m.Value;
        if (s.Contains(',') && !s.Contains('.')) s = s.Replace(',', '.');
        else s = s.Replace(",", "");
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && double.IsFinite(v) ? v : null;
    }

    /// <summary>True when a unit string is Fahrenheit (iCUE can be switched to °F).</summary>
    public static bool IsFahrenheit(string? unit) => unit is not null && unit.Trim().EndsWith('F') && unit.Contains('°');

    public static double ToCelsius(double f) => Math.Round((f - 32) * 5 / 9, 2);

    [GeneratedRegex(@"\bpump\b|w_?pump|aio_?pump", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex PumpName();
    [GeneratedRegex(@"coolant|liquid|water", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CoolantName();
    [GeneratedRegex(@"nvidia|geforce|radeon|\brtx\b|\bgtx\b|intel\s+arc|\bgpu\b|graphics", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex GpuDevice();
    [GeneratedRegex(@"^gpu\b|\bgpu fan", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex GpuName();
    [GeneratedRegex(@"radiator|\brad\b|\baio\b|cpu[ _]?fan|cpu[ _]?opt|cpu cooler", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex RadiatorName();
    [GeneratedRegex(@"\bh\d{2,3}i\b|capellix|elite|\btitan\b|nautilus|hydro|kraken|liquid freezer|\baio\b|cooler", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CoolerDevice();
    [GeneratedRegex(@"system hub|commander|lighting node|fan controller", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex HubDevice();
    [GeneratedRegex(@"chassis|\bcase\b|sys(tem)?[ _]?fan|cha[ _]?fan|rear|front|\btop\b|bottom|side|exhaust|intake", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CaseName();
    [GeneratedRegex(@"asus|asustek|\bmsi\b|micro-star|gigabyte|asrock|biostar|evga|motherboard|mainboard|nuvoton|ite it|\bnct\d", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex BoardDevice();
    [GeneratedRegex(@"ryzen|threadripper|epyc|athlon|\bcore\s*(i\d|ultra)|xeon|pentium|celeron|\bcpu\b|processor", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex CpuDevice();
    [GeneratedRegex(@"dominator|vengeance|\bddr\d?\b|memory|\bdimm\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex MemoryDevice();
    [GeneratedRegex(@":\s*(fan|pump|temp|temperature|coolant temp(erature)?)\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex SuffixRe();
    [GeneratedRegex(@"^fan\s*#?\s*(\d+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)] private static partial Regex NumberedFan();
    [GeneratedRegex(@"-?\d[\d.,]*|-?\.\d+", RegexOptions.CultureInvariant)] private static partial Regex NumberRe();
}
