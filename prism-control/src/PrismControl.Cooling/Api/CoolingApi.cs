using System.Text.Json.Serialization;
using PrismControl.Core.Data;

namespace PrismControl.Cooling.Api;

// GET /v1/cooling payload (docs/api.md §4.9). Every property is always present; unknown values are null.
// Units are in the names: Rpm = revolutions per minute, Pct = 0..100, C = °C. Timestamps: UTC, ms ("…T19:22:49.547Z").

public sealed class CoolingPayload
{
    /// <summary>"ok" | "partial" | "connecting" | "unavailable" | "idle".</summary>
    public string Status { get; set; } = "idle";
    /// <summary>Human-readable, e.g. "iCUE connected · 21 sensors".</summary>
    public string StatusText { get; set; } = "";
    /// <summary>When this sample was taken.</summary>
    public DateTimeOffset SampledAt { get; set; }
    /// <summary>The CPU package temperature picked by the "CPU temp source" setting (null when there is none).</summary>
    public CoolingTempInfo? Cpu { get; set; }
    /// <summary>The AIO coolant (liquid) temperature (null when no cooler reports one).</summary>
    public CoolingTempInfo? Coolant { get; set; }
    /// <summary>One entry per group, always all six, in this order: radiator, case, unassigned, allFans, pump, gpu.</summary>
    public List<CoolingGroupInfo> Groups { get; set; } = [];
    public List<CoolingSensorInfo> Sensors { get; set; } = [];
    public List<CoolingProviderInfo> Providers { get; set; } = [];
}

public sealed class CoolingTempInfo
{
    public double? TempC { get; set; }
    /// <summary>"icue" | "lhm".</summary>
    public string Source { get; set; } = "";
    public string SensorId { get; set; } = "";
    public string Name { get; set; } = "";
}

public sealed class CoolingGroupInfo
{
    /// <summary>"radiator" | "case" | "unassigned" | "allFans" | "pump" | "gpu".</summary>
    public string Group { get; set; } = "";
    public int Count { get; set; }
    public double? AvgRpm { get; set; }
    public double? MinRpm { get; set; }
    public double? MaxRpm { get; set; }
    public List<string> SensorIds { get; set; } = [];
}

public sealed class CoolingSensorInfo
{
    /// <summary>Stable: "icue-" + 10 hex (hash of device, name, type) or "lhm/…" (LHM's sensor path).</summary>
    public string Id { get; set; } = "";
    /// <summary>"fan" | "pump" | "coolant" | "cpu" | "air".</summary>
    public string Kind { get; set; } = "";
    /// <summary>"radiator" | "case" | "pump" | "gpu" | "unassigned" | "ignore".</summary>
    public string Role { get; set; } = "";
    /// <summary>"auto" (classified from the names) | "user" (assigned in a property inspector).</summary>
    public string RoleSource { get; set; } = "auto";
    /// <summary>The user's name if set, else a compact form of the source name.</summary>
    public string Name { get; set; } = "";
    /// <summary>The name exactly as iCUE / LHM reports it.</summary>
    public string OriginalName { get; set; } = "";
    public string? CustomName { get; set; }
    public string Device { get; set; } = "";
    /// <summary>"icue" | "lhm".</summary>
    public string Source { get; set; } = "";
    /// <summary>Fans and pumps; null for temperatures or when unknown.</summary>
    public double? Rpm { get; set; }
    /// <summary>Fan duty 0..100 when the source knows it (LHM "Control" sensors); null otherwise (iCUE does not expose it).</summary>
    public double? Pct { get; set; }
    /// <summary>Temperatures; null for fans/pumps.</summary>
    public double? TempC { get; set; }
    public bool Connected { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class CoolingProviderInfo
{
    /// <summary>"icue" | "lhm".</summary>
    public string Name { get; set; } = "";
    /// <summary>"off" | "standby" | "connecting" | "connected" | "notRunning" | "error" | "disabled".</summary>
    public string State { get; set; } = "";
    public string Detail { get; set; } = "";
    public int SensorCount { get; set; }
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    WriteIndented = false,
    Converters = [typeof(UtcMillisecondsConverter)])]
[JsonSerializable(typeof(CoolingPayload))]
public sealed partial class CoolingJsonContext : JsonSerializerContext
{
    /// <summary>The wire context, matching DataJsonContext.Wire: camelCase, nulls written, UTC-ms timestamps, no HTML escaping.</summary>
    public static CoolingJsonContext Wire { get; } = new(new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new UtcMillisecondsConverter() },
    });
}

public static class CoolingApi
{
    public const string Path = "/v1/cooling";

    public static CoolingPayload Map(CoolingSnapshot s) => new()
    {
        Status = s.Status switch
        {
            CoolingStatus.Ok => "ok",
            CoolingStatus.Partial => "partial",
            CoolingStatus.Connecting => "connecting",
            CoolingStatus.Unavailable => "unavailable",
            _ => "idle",
        },
        StatusText = s.StatusText,
        SampledAt = s.At,
        Cpu = Temp(s.Cpu),
        Coolant = Temp(s.Coolant),
        Groups = [.. new[] { FanGroup.Radiator, FanGroup.Case, FanGroup.Unassigned, FanGroup.AllFans, FanGroup.Pump, FanGroup.Gpu }.Select(g =>
        {
            var st = s.Group(g);
            return new CoolingGroupInfo
            {
                Group = FanGroups.Wire(g), Count = st.Count, AvgRpm = st.Avg, MinRpm = st.Min, MaxRpm = st.Max,
                SensorIds = [.. st.Members.Select(m => m.Id)],
            };
        })],
        Sensors = [.. s.Sensors.Select(x => new CoolingSensorInfo
        {
            Id = x.Id,
            Kind = x.Kind switch { SensorKind.Fan => "fan", SensorKind.Pump => "pump", SensorKind.Coolant => "coolant", SensorKind.Cpu => "cpu", _ => "air" },
            Role = Roles.Wire(x.Role),
            RoleSource = x.RoleIsUser ? "user" : "auto",
            Name = x.Name,
            OriginalName = x.OriginalName,
            CustomName = x.CustomName,
            Device = x.Device,
            Source = x.Source,
            Rpm = x.IsRpm && x.Connected ? x.Value : null,
            Pct = x.Pct,
            TempC = !x.IsRpm && x.Connected ? x.Value : null,
            Connected = x.Connected,
            UpdatedAt = x.UpdatedAt,
        })],
        Providers = [.. s.Providers.Select(p => new CoolingProviderInfo
        {
            Name = p.Name,
            State = p.State switch
            {
                ProviderState.Off => "off",
                ProviderState.Standby => "standby",
                ProviderState.Connecting => "connecting",
                ProviderState.Connected => "connected",
                ProviderState.NotRunning => "notRunning",
                ProviderState.Error => "error",
                _ => "disabled",
            },
            Detail = p.Detail,
            SensorCount = p.SensorCount,
        })],
    };

    private static CoolingTempInfo? Temp(CoolingSensor? s) => s is null ? null : new CoolingTempInfo
    {
        TempC = s.Value, Source = s.Source, SensorId = s.Id, Name = s.Name,
    };
}
