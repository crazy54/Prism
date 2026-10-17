namespace PrismControl.SystemInfo.Actions;

// Per-action settings (camelCase on the wire, stored by the app, exported with profiles): no secrets, no personal data.
// Choices are strings (lenient: an unknown value falls back to the default instead of breaking the whole object).

/// <summary>What every stats action shares.</summary>
public interface IStatSettings
{
    /// <summary>"history" (value + sparkline) or "detail" (per-core / all numbers). A press toggles it.</summary>
    string View { get; set; }
    /// <summary>Refresh twice a second instead of once.</summary>
    bool FastRefresh { get; set; }
}

/// <summary>Shared by the actions that can show a CPU temperature (the source itself is plugin-wide).</summary>
public interface ICpuTempSettings
{
    bool ShowTemp { get; set; }
    /// <summary>"auto" | "lhm" | "hwinfo" | "off" (mirrors the global "systeminfo" section).</summary>
    string CpuTempSource { get; set; }
    int LhmPort { get; set; }
}

public static class Views
{
    public const string History = "history";
    public const string Detail = "detail";

    public static bool IsDetail(string? view) => string.Equals(view, Detail, StringComparison.OrdinalIgnoreCase) || string.Equals(view, "cores", StringComparison.OrdinalIgnoreCase);
    public static string Toggle(string? view) => IsDetail(view) ? History : Detail;
}

public sealed class CpuSettings : IStatSettings, ICpuTempSettings
{
    /// <summary>"usage" | "clock" | "temp".</summary>
    public string Metric { get; set; } = "usage";
    public string View { get; set; } = Views.History;
    public bool ShowTemp { get; set; } = true;
    public bool FastRefresh { get; set; }
    public string CpuTempSource { get; set; } = "auto";
    public int LhmPort { get; set; } = 8085;
}

public sealed class GpuSettings : IStatSettings
{
    /// <summary>A GPU id ("nvml:0", "d3d:1002:13c0:0"); empty = the first GPU (discrete first).</summary>
    public string Gpu { get; set; } = "";
    /// <summary>"usage" | "temp" | "power" | "vram" | "clock".</summary>
    public string Metric { get; set; } = "usage";
    public string View { get; set; } = Views.History;
    public bool FastRefresh { get; set; }
}

public sealed class RamSettings : IStatSettings
{
    /// <summary>"usage" (%) | "used" (GiB).</summary>
    public string Metric { get; set; } = "usage";
    public string View { get; set; } = Views.History;
    public bool FastRefresh { get; set; }
}

public sealed class DiskSettings : IStatSettings
{
    /// <summary>"C:"…; empty = the system drive; "*" = all drives.</summary>
    public string Drive { get; set; } = "";
    /// <summary>"activity" | "free" | "throughput".</summary>
    public string Metric { get; set; } = "activity";
    public string View { get; set; } = Views.History;
    public bool FastRefresh { get; set; }
}

public sealed class NetworkSettings : IStatSettings
{
    /// <summary>An interface GUID; empty = the adapter with the default route (re-picked every ~10 s).</summary>
    public string Adapter { get; set; } = "";
    /// <summary>"both" | "down" | "up".</summary>
    public string Metric { get; set; } = "both";
    /// <summary>"bytes" (MB/s) | "bits" (Mb/s).</summary>
    public string Units { get; set; } = "bytes";
    public string View { get; set; } = Views.History;
    public bool FastRefresh { get; set; }
}

public sealed class SystemDialSettings : IStatSettings, ICpuTempSettings
{
    /// <summary>"cpu" | "gpu" | "ram" | "disk" | "net"; empty = by placement (a Galleon dashboard: CPU, GPU, RAM, network).</summary>
    public string Metric { get; set; } = "";
    public string View { get; set; } = Views.History;
    public string Gpu { get; set; } = "";
    public string Drive { get; set; } = "";
    public string Adapter { get; set; } = "";
    public string Units { get; set; } = "bytes";
    public bool ShowTemp { get; set; } = true;
    public bool FastRefresh { get; set; }
    public string CpuTempSource { get; set; } = "auto";
    public int LhmPort { get; set; } = 8085;
}
