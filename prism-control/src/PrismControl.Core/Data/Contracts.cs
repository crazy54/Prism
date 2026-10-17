using System.Text.Json.Serialization;

namespace PrismControl.Core.Data;

// These types ARE the data API v1 payloads (docs/api.md). Serialized camelCase; every property is always present
// (null = unknown/unsupported on this PC). Adding properties is a compatible change; renaming/removing is not (v2).
// Units are in the property names: Pct = 0..100, C = °C, W = watts, MiB/GiB = binary units, Bps = bytes per second,
// Mhz, Ms = milliseconds, Sec = seconds, Peak = linear 0..1, Db = dBFS.

public static class DataPaths
{
    public const string Index = "/v1";
    public const string Health = "/v1/health";
    public const string System = "/v1/system";
    public const string NowPlaying = "/v1/now-playing";
    public const string NowPlayingArt = "/v1/now-playing/art";
    public const string AudioLevels = "/v1/audio/levels";
    public const string AudioDevices = "/v1/audio/devices";
    public const string Mic = "/v1/mic";
}

// ---------------------------------------------------------------- /v1/system

public sealed class SystemSnapshot
{
    public CpuStats? Cpu { get; set; }
    public List<GpuStats> Gpus { get; set; } = [];
    public MemoryStats? Memory { get; set; }
    public List<DiskStats> Disks { get; set; } = [];
    public NetworkStats? Network { get; set; }
    public double? UptimeSec { get; set; }
}

public sealed class CpuStats
{
    public string? Name { get; set; }
    public double? UsagePct { get; set; }
    public List<double>? PerCorePct { get; set; }
    public double? ClockMhz { get; set; }
    public double? TempC { get; set; }
    /// <summary>Where <see cref="TempC"/> came from: "lhm", "hwinfo", "icue" (via the Cooling module) or another lowercase id; null with no reading.</summary>
    public string? TempSource { get; set; }
    public int? Cores { get; set; }
    public int? Threads { get; set; }
}

public sealed class GpuStats
{
    public int Index { get; set; }
    public string? Name { get; set; }
    /// <summary>"nvidia" | "amd" | "intel" | "other".</summary>
    public string? Vendor { get; set; }
    public double? UsagePct { get; set; }
    public double? TempC { get; set; }
    public double? PowerW { get; set; }
    public double? PowerLimitW { get; set; }
    public double? VramUsedMiB { get; set; }
    public double? VramTotalMiB { get; set; }
    public double? ClockMhz { get; set; }
    public double? MemClockMhz { get; set; }
    public double? FanPct { get; set; }
}

public sealed class MemoryStats
{
    public double? UsedMiB { get; set; }
    public double? TotalMiB { get; set; }
    public double? UsagePct { get; set; }
    public double? CommitUsedMiB { get; set; }
    public double? CommitLimitMiB { get; set; }
}

public sealed class DiskStats
{
    /// <summary>Volume, e.g. "C:".</summary>
    public string Name { get; set; } = "";
    public string? Label { get; set; }
    public double? UsedGiB { get; set; }
    public double? TotalGiB { get; set; }
    public double? UsagePct { get; set; }
    public double? ReadBps { get; set; }
    public double? WriteBps { get; set; }
    public double? ActivePct { get; set; }
}

public sealed class NetworkStats
{
    /// <summary>Sum over adapters that are up.</summary>
    public double? RxBps { get; set; }
    public double? TxBps { get; set; }
    public List<NetAdapterStats> Adapters { get; set; } = [];
}

public sealed class NetAdapterStats
{
    public string Name { get; set; } = "";
    public double? RxBps { get; set; }
    public double? TxBps { get; set; }
    public double? LinkMbps { get; set; }
    public bool Up { get; set; }
}

// ---------------------------------------------------------------- /v1/now-playing

public sealed class NowPlayingSnapshot
{
    /// <summary>"spotify" (Web API) | "smtc" (Windows media session) | "demo".</summary>
    public string Source { get; set; } = "smtc";
    /// <summary>Player app display name, e.g. "Spotify".</summary>
    public string? App { get; set; }
    /// <summary>"playing" | "paused" | "stopped" | "none" (nothing is loaded).</summary>
    public string State { get; set; } = "none";
    public TrackInfo? Track { get; set; }
    /// <summary>Playback position at <see cref="PositionAt"/>; clients extrapolate while playing.</summary>
    public long? PositionMs { get; set; }
    public DateTimeOffset? PositionAt { get; set; }
    public bool? Shuffle { get; set; }
    /// <summary>"off" | "context" | "track".</summary>
    public string? Repeat { get; set; }
    public bool? Liked { get; set; }
    public double? VolumePct { get; set; }
    public string? ContextName { get; set; }
    public ArtInfo? Art { get; set; }
}

public sealed class TrackInfo
{
    public string Title { get; set; } = "";
    public List<string> Artists { get; set; } = [];
    public string? Album { get; set; }
    public long? DurationMs { get; set; }
    /// <summary>e.g. "spotify:track:…" (null for SMTC).</summary>
    public string? Uri { get; set; }
    /// <summary>Link back to the item (Spotify requires one near album art).</summary>
    public string? Url { get; set; }
}

public sealed class ArtInfo
{
    /// <summary>Always "/v1/now-playing/art" (same host, same token).</summary>
    public string Url { get; set; } = DataPaths.NowPlayingArt;
    /// <summary>Changes when the image changes; send it as If-None-Match.</summary>
    public string Etag { get; set; } = "";
    public string Mime { get; set; } = "image/jpeg";
    public int? Width { get; set; }
    public int? Height { get; set; }
    /// <summary>Only with <c>?art=dataUrl</c>: the image as a data: URL.</summary>
    public string? DataUrl { get; set; }
}

// ---------------------------------------------------------------- /v1/audio/levels

public sealed class AudioLevelsSnapshot
{
    public LevelInfo? Output { get; set; }
    public LevelInfo? Input { get; set; }
    /// <summary>The metering interval in ms while the endpoint is being polled.</summary>
    public int IntervalMs { get; set; } = 33;
}

public sealed class LevelInfo
{
    public string? DeviceId { get; set; }
    public string? DeviceName { get; set; }
    /// <summary>Linear peak 0..1 over the last interval.</summary>
    public double Peak { get; set; }
    /// <summary>dBFS of <see cref="Peak"/> (null when silent).</summary>
    public double? PeakDb { get; set; }
    /// <summary>Per-channel linear peaks 0..1 (L, R, …).</summary>
    public List<double>? Channels { get; set; }
}

// ---------------------------------------------------------------- /v1/audio/devices

public sealed class AudioDevicesSnapshot
{
    public AudioDeviceList Output { get; set; } = new();
    public AudioDeviceList Input { get; set; } = new();
}

public sealed class AudioDeviceList
{
    public string? DefaultId { get; set; }
    public string? DefaultCommunicationsId { get; set; }
    public List<AudioDeviceInfo> Devices { get; set; } = [];
}

public sealed class AudioDeviceInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
    public bool IsDefaultCommunications { get; set; }
    public double? VolumePct { get; set; }
    public bool? Muted { get; set; }
    /// <summary>"active" | "disabled" | "unplugged" | "notpresent".</summary>
    public string State { get; set; } = "active";
}

// ---------------------------------------------------------------- /v1/mic

public sealed class MicSnapshot
{
    public string? DeviceId { get; set; }
    public string? Name { get; set; }
    public bool Muted { get; set; }
    public double? VolumePct { get; set; }
    /// <summary>Linear peak 0..1 (null unless metering is running).</summary>
    public double? Peak { get; set; }
    /// <summary>Whether any app is capturing from the mic (null if unknown).</summary>
    public bool? InUse { get; set; }
}

/// <summary>Timestamps on the wire: UTC, millisecond precision, e.g. "2026-10-16T13:00:00.123Z".</summary>
public sealed class UtcMillisecondsConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options) =>
        DateTimeOffset.Parse(reader.GetString()!, System.Globalization.CultureInfo.InvariantCulture);

    public override void Write(System.Text.Json.Utf8JsonWriter writer, DateTimeOffset value, System.Text.Json.JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture));
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    WriteIndented = false,
    Converters = [typeof(UtcMillisecondsConverter)])]
[JsonSerializable(typeof(SystemSnapshot))]
[JsonSerializable(typeof(NowPlayingSnapshot))]
[JsonSerializable(typeof(AudioLevelsSnapshot))]
[JsonSerializable(typeof(AudioDevicesSnapshot))]
[JsonSerializable(typeof(MicSnapshot))]
public sealed partial class DataJsonContext : JsonSerializerContext
{
    /// <summary>The wire context: camelCase, nulls written, UTC-ms timestamps, no HTML-safe escaping ("+", quotes stay readable).</summary>
    public static DataJsonContext Wire { get; } = new(new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new UtcMillisecondsConverter() },
    });
}
