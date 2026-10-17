namespace PrismControl.Cooling;

/// <summary>What a cooling sensor measures.</summary>
public enum SensorKind
{
    /// <summary>A fan, in RPM.</summary>
    Fan,
    /// <summary>An AIO / loop pump, in RPM.</summary>
    Pump,
    /// <summary>Coolant (liquid) temperature, °C.</summary>
    Coolant,
    /// <summary>CPU package temperature, °C.</summary>
    Cpu,
    /// <summary>Air temperature at a fan (iCUE LINK QX fans carry a probe), °C.</summary>
    Air,
}

/// <summary>The job a sensor does in the cooling loop. Auto-classified where the data allows; the user can override it in the PI.</summary>
public enum CoolingRole
{
    /// <summary>Not known (iCUE LINK fans all hang off one hub, so placement cannot be inferred). Assign it in the PI.</summary>
    Unassigned,
    /// <summary>Fans on the CPU radiator (or the CPU cooler's fans).</summary>
    Radiator,
    /// <summary>Case intake/exhaust fans.</summary>
    Case,
    Pump,
    Gpu,
    /// <summary>Excluded from every group (for example a motherboard header that mirrors the pump).</summary>
    Ignore,
}

/// <summary>The aggregates the Fan group key and the Cooling dial show.</summary>
public enum FanGroup
{
    Radiator,
    Case,
    Unassigned,
    /// <summary>Every fan except GPU and ignored ones.</summary>
    AllFans,
    Pump,
    Gpu,
}

/// <summary>Where a provider stands right now.</summary>
public enum ProviderState
{
    /// <summary>Not started (nothing consumes cooling data).</summary>
    Off,
    /// <summary>Started but not needed (LHM while iCUE supplies everything).</summary>
    Standby,
    Connecting,
    Connected,
    /// <summary>The source is not there (iCUE not running, LHM web server off).</summary>
    NotRunning,
    Error,
    /// <summary>Turned off in the settings.</summary>
    Disabled,
}

/// <summary>Raw reading kinds a provider reports.</summary>
public enum RawSensorType { Fan, Pump, Temperature }

/// <summary>One sensor as a provider sees it (before classification, renames and roles).</summary>
public sealed record RawSensor
{
    /// <summary>Stable id, prefixed by the provider ("icue-…", "lhm/…"). Lowercase.</summary>
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string Device { get; init; } = "";
    public required RawSensorType Type { get; init; }
    /// <summary>Provider sub-kind: "package" (CPU package temp), "coolant", "air", "default".</summary>
    public string Kind { get; init; } = "default";
    /// <summary>RPM for fans/pumps, °C for temperatures. Null when unknown.</summary>
    public double? Value { get; init; }
    /// <summary>Duty in percent when the source knows it (LHM "Control" sensors). Null otherwise.</summary>
    public double? Pct { get; init; }
    public bool Connected { get; init; } = true;
    public DateTimeOffset? UpdatedAt { get; init; }
    /// <summary>Provider hint: a motherboard fan header (LHM can't tell "unplugged" from "stopped").</summary>
    public bool IsBoardHeader { get; init; }
    /// <summary>
    /// Earlier ids of this same sensor: its id on the other iCUE pipe, or its id before the device was renamed in iCUE.
    /// Names, roles and keys saved under one of them follow the sensor (see <see cref="CoolingSnapshot.Find"/>).
    /// </summary>
    public IReadOnlyList<string> Aliases { get; init; } = [];
}

/// <summary>What one provider currently has.</summary>
public sealed record ProviderReading(ProviderState State, string Detail, IReadOnlyList<RawSensor> Sensors)
{
    public static ProviderReading Off { get; } = new(ProviderState.Off, "Off", []);
}

/// <summary>A provider's status for the PI and /v1/cooling.</summary>
public sealed record ProviderStatus(string Name, ProviderState State, string Detail, int SensorCount);

/// <summary>One classified sensor in a snapshot.</summary>
public sealed record CoolingSensor
{
    public required string Id { get; init; }
    /// <summary>"icue" or "lhm".</summary>
    public required string Source { get; init; }
    public required SensorKind Kind { get; init; }
    /// <summary>What to show: the user's name if set, else <see cref="ShortName"/>.</summary>
    public required string Name { get; init; }
    /// <summary>A compact version of the source name ("iCUE LINK RX RGB #1: Fan" → "RX RGB #1").</summary>
    public required string ShortName { get; init; }
    /// <summary>The name exactly as the source reports it.</summary>
    public required string OriginalName { get; init; }
    public string? CustomName { get; init; }
    public string Device { get; init; } = "";
    /// <summary>The effective role (user override, else auto-classified).</summary>
    public CoolingRole Role { get; init; }
    public bool RoleIsUser { get; init; }
    /// <summary>RPM for fans/pumps, °C for temperatures.</summary>
    public double? Value { get; init; }
    public double? Pct { get; init; }
    public bool Connected { get; init; } = true;
    public DateTimeOffset? UpdatedAt { get; init; }
    /// <summary>Earlier ids that now mean this sensor (<see cref="RawSensor.Aliases"/>).</summary>
    public IReadOnlyList<string> Aliases { get; init; } = [];

    public bool IsRpm => Kind is SensorKind.Fan or SensorKind.Pump;
    public bool HasValue => Connected && Value is not null;
}

/// <summary>Average/min/max over the members of a <see cref="FanGroup"/> that currently have a value.</summary>
public sealed record GroupStats(FanGroup Group, IReadOnlyList<CoolingSensor> Members, double? Avg, double? Min, double? Max)
{
    public int Count => Members.Count;
}

public enum CoolingStatus
{
    /// <summary>Nothing is consuming cooling data, so nothing is sampled.</summary>
    Idle,
    Connecting,
    /// <summary>Fans/pumps and a CPU temperature are available.</summary>
    Ok,
    /// <summary>Some data (for example LHM only, or no CPU temperature).</summary>
    Partial,
    /// <summary>No provider is delivering anything.</summary>
    Unavailable,
}

/// <summary>An immutable picture of the cooling system at one sample. Thread-safe to share.</summary>
public sealed class CoolingSnapshot
{
    private readonly Dictionary<FanGroup, GroupStats> _groups;
    private readonly Dictionary<string, CoolingSensor> _byId;

    public CoolingSnapshot(DateTimeOffset at, IReadOnlyList<CoolingSensor> sensors, CoolingSensor? cpu, CoolingSensor? coolant,
        IReadOnlyList<ProviderStatus> providers, CoolingStatus status, string statusText)
    {
        At = at;
        Sensors = sensors;
        Cpu = cpu;
        Coolant = coolant;
        Providers = providers;
        Status = status;
        StatusText = statusText;
        _byId = new Dictionary<string, CoolingSensor>(StringComparer.Ordinal);
        foreach (var s in sensors) _byId.TryAdd(s.Id, s);
        foreach (var s in sensors)
            foreach (var a in s.Aliases) _byId.TryAdd(a, s); // a current id always wins over an old one
        _groups = Enum.GetValues<FanGroup>().ToDictionary(g => g, g => Compute(g, sensors));
    }

    public static CoolingSnapshot Empty { get; } = new(DateTimeOffset.UnixEpoch, [], null, null, [], CoolingStatus.Idle, "Idle");

    public DateTimeOffset At { get; }
    public IReadOnlyList<CoolingSensor> Sensors { get; }
    /// <summary>The CPU package temperature chosen by the "CPU temp source" setting (null if none).</summary>
    public CoolingSensor? Cpu { get; }
    /// <summary>The coolant temperature (the first one; null if no AIO reports it).</summary>
    public CoolingSensor? Coolant { get; }
    public IReadOnlyList<ProviderStatus> Providers { get; }
    public CoolingStatus Status { get; }
    /// <summary>"iCUE connected · 14 sensors", or why not.</summary>
    public string StatusText { get; }

    /// <summary>The sensor with this id, or the sensor that had it before (another iCUE pipe, a rename in iCUE).</summary>
    public CoolingSensor? Find(string? id) => id is not null && _byId.TryGetValue(id, out var s) ? s : null;
    public GroupStats Group(FanGroup group) => _groups[group];
    public IEnumerable<CoolingSensor> OfKind(SensorKind kind) => Sensors.Where(s => s.Kind == kind);

    /// <summary>The radiator group when it has members, else every fan (the dent view's default).</summary>
    public FanGroup DefaultFanGroup => _groups[FanGroup.Radiator].Count > 0 ? FanGroup.Radiator : FanGroup.AllFans;

    public static bool IsMember(FanGroup group, CoolingSensor s)
    {
        if (s.Role == CoolingRole.Ignore) return false;
        return group switch
        {
            FanGroup.Radiator => s.Kind == SensorKind.Fan && s.Role == CoolingRole.Radiator,
            FanGroup.Case => s.Kind == SensorKind.Fan && s.Role == CoolingRole.Case,
            FanGroup.Unassigned => s.Kind == SensorKind.Fan && s.Role == CoolingRole.Unassigned,
            FanGroup.AllFans => s.Kind == SensorKind.Fan && s.Role is CoolingRole.Radiator or CoolingRole.Case or CoolingRole.Unassigned,
            FanGroup.Pump => s.IsRpm && (s.Kind == SensorKind.Pump ? s.Role is CoolingRole.Pump or CoolingRole.Unassigned : s.Role == CoolingRole.Pump),
            FanGroup.Gpu => s.Kind == SensorKind.Fan && s.Role == CoolingRole.Gpu,
            _ => false,
        };
    }

    private static GroupStats Compute(FanGroup g, IReadOnlyList<CoolingSensor> sensors)
    {
        var members = sensors.Where(s => s.HasValue && IsMember(g, s)).ToList();
        if (members.Count == 0) return new GroupStats(g, members, null, null, null);
        var values = members.Select(m => m.Value!.Value).ToList();
        return new GroupStats(g, members, Math.Round(values.Average(), 1), values.Min(), values.Max());
    }
}
