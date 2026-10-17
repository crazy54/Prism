namespace PrismControl.Cooling;

/// <summary>
/// The plugin-wide "cooling" section of the global settings: user renames and roles keyed by sensor id (shared by every
/// key and dial), and the source options. Plain text that travels with exported profiles: ids are opaque hashes or LHM
/// sensor paths, never serial numbers.
/// </summary>
public sealed class CoolingGlobalSettings
{
    /// <summary>sensor id → the user's name.</summary>
    public Dictionary<string, string> Names { get; set; } = [];
    /// <summary>sensor id → "radiator" | "case" | "pump" | "gpu" | "ignore" (missing = automatic).</summary>
    public Dictionary<string, string> Roles { get; set; } = [];
    /// <summary>"auto" (iCUE's CPU package sensor, else LibreHardwareMonitor) | "icue" | "lhm" | "off".</summary>
    public string CpuTempSource { get; set; } = CpuSources.Auto;
    /// <summary>LibreHardwareMonitor Remote Web Server port.</summary>
    public int LhmPort { get; set; } = Lhm.LhmOptions.DefaultPort;
    /// <summary>Use LibreHardwareMonitor at all (fallback fans and CPU temperature).</summary>
    public bool UseLhm { get; set; } = true;

    public CoolingGlobalSettings Clone() => new()
    {
        Names = new Dictionary<string, string>(Names, StringComparer.Ordinal),
        Roles = new Dictionary<string, string>(Roles, StringComparer.Ordinal),
        CpuTempSource = CpuTempSource,
        LhmPort = LhmPort,
        UseLhm = UseLhm,
    };
}

public static class CpuSources
{
    public const string Auto = "auto", Icue = "icue", Lhm = "lhm", Off = "off";

    public static string Normalize(string? s) => s?.Trim().ToLowerInvariant() switch
    {
        Icue => Icue,
        Lhm => Lhm,
        Off => Off,
        _ => Auto,
    };

    public static readonly (string Value, string Label)[] Options =
    [
        (Auto, "Auto (iCUE, else LibreHardwareMonitor)"),
        (Icue, "iCUE (CPU package sensor)"),
        (Lhm, "LibreHardwareMonitor (Tctl/Tdie or Package)"),
        (Off, "Off"),
    ];
}

/// <summary>Role names on the wire, in settings and in the PI.</summary>
public static class Roles
{
    public const string Auto = "auto";

    public static string Wire(CoolingRole r) => r switch
    {
        CoolingRole.Radiator => "radiator",
        CoolingRole.Case => "case",
        CoolingRole.Pump => "pump",
        CoolingRole.Gpu => "gpu",
        CoolingRole.Ignore => "ignore",
        _ => "unassigned",
    };

    /// <summary>Parses a role override; null = automatic.</summary>
    public static CoolingRole? Parse(string? s) => s?.Trim().ToLowerInvariant() switch
    {
        "radiator" or "rad" => CoolingRole.Radiator,
        "case" => CoolingRole.Case,
        "pump" => CoolingRole.Pump,
        "gpu" => CoolingRole.Gpu,
        "ignore" => CoolingRole.Ignore,
        "unassigned" => CoolingRole.Unassigned,
        _ => null,
    };

    public static string Label(CoolingRole r) => r switch
    {
        CoolingRole.Radiator => "CPU radiator fan",
        CoolingRole.Case => "Case fan",
        CoolingRole.Pump => "Pump",
        CoolingRole.Gpu => "GPU fan",
        CoolingRole.Ignore => "Ignored",
        _ => "Unassigned",
    };

    public static readonly (string Value, string Label)[] Options =
    [
        (Auto, "Automatic"),
        ("radiator", "CPU radiator fan"),
        ("case", "Case fan"),
        ("pump", "Pump"),
        ("gpu", "GPU fan"),
        ("ignore", "Ignore (exclude from groups)"),
    ];
}

public static class FanGroups
{
    public const string Auto = "auto";

    public static string Wire(FanGroup g) => g switch
    {
        FanGroup.Radiator => "radiator",
        FanGroup.Case => "case",
        FanGroup.Unassigned => "unassigned",
        FanGroup.AllFans => "allFans",
        FanGroup.Pump => "pump",
        _ => "gpu",
    };

    /// <summary>Null = automatic (radiator fans when assigned, else all fans).</summary>
    public static FanGroup? Parse(string? s) => s?.Trim().ToLowerInvariant() switch
    {
        "radiator" or "rad" => FanGroup.Radiator,
        "case" => FanGroup.Case,
        "unassigned" => FanGroup.Unassigned,
        "allfans" or "all" => FanGroup.AllFans,
        "pump" or "pumps" => FanGroup.Pump,
        "gpu" => FanGroup.Gpu,
        _ => null,
    };

    /// <summary>Key/dial label, uppercase-friendly.</summary>
    public static string Label(FanGroup g) => g switch
    {
        FanGroup.Radiator => "RAD FANS",
        FanGroup.Case => "CASE FANS",
        FanGroup.Unassigned => "OTHER FANS",
        FanGroup.AllFans => "FANS",
        FanGroup.Pump => "PUMP",
        _ => "GPU FANS",
    };

    public static readonly (string Value, string Label)[] Options =
    [
        (Auto, "Automatic (radiator fans, else all fans)"),
        ("radiator", "CPU radiator fans"),
        ("case", "Case fans"),
        ("unassigned", "Unassigned fans"),
        ("allFans", "All fans (not GPU)"),
        ("pump", "Pumps"),
        ("gpu", "GPU fans"),
    ];
}
