using PrismControl.Core.Data;

namespace PrismControl.SystemInfo.Telemetry;

// One immutable sample of the whole machine. Sections are null when nobody asked for them (or the source failed);
// fields are null when the value is unknown on this PC. Nothing is ever invented.

public sealed record TelemetryFrame
{
    public long Seq { get; init; }
    public DateTimeOffset At { get; init; }
    public CpuFrame? Cpu { get; init; }
    public IReadOnlyList<GpuFrame> Gpus { get; init; } = [];
    public MemoryFrame? Memory { get; init; }
    public DiskTotals? DiskTotal { get; init; }
    public IReadOnlyList<DiskFrame> Disks { get; init; } = [];
    public NetworkFrame? Network { get; init; }
    public double? UptimeSec { get; init; }

    public GpuFrame? FindGpu(string? id) =>
        string.IsNullOrEmpty(id) ? (Gpus.Count > 0 ? Gpus[0] : null) : Gpus.FirstOrDefault(g => g.Id == id) ?? (Gpus.Count > 0 ? Gpus[0] : null);

    public DiskFrame? FindDisk(string? name) =>
        Disks.FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase));

    /// <summary>The adapter with <paramref name="id"/>, or the default-route adapter when <paramref name="id"/> is empty or gone.</summary>
    public NetAdapterFrame? FindAdapter(string? id)
    {
        if (Network is not { } n) return null;
        if (!string.IsNullOrEmpty(id) && n.Adapters.FirstOrDefault(a => a.Id == id) is { } chosen) return chosen;
        return n.Adapters.FirstOrDefault(a => a.IsDefaultRoute) ?? n.Adapters.FirstOrDefault(a => a.Up);
    }

    /// <summary>The data API payload (docs/api.md §4.3): every field we know, null for the rest.</summary>
    public SystemSnapshot ToSnapshot() => new()
    {
        Cpu = Cpu is { } c ? new CpuStats
        {
            Name = c.Name,
            UsagePct = R1(c.UsagePct),
            PerCorePct = c.PerCorePct?.Select(v => Math.Round(v, 1)).ToList(),
            ClockMhz = R0(c.ClockMhz),
            TempC = R1(c.TempC),
            TempSource = c.TempC is null ? null : ApiTempSource(c.TempSource),
            Cores = c.Cores,
            Threads = c.Threads,
        } : null,
        Gpus = Gpus.Select(g => new GpuStats
        {
            Index = g.Index,
            Name = g.Name,
            Vendor = g.Vendor,
            UsagePct = R1(g.UsagePct),
            TempC = R1(g.TempC),
            PowerW = R1(g.PowerW),
            PowerLimitW = R1(g.PowerLimitW),
            VramUsedMiB = R0(g.VramUsedMiB),
            VramTotalMiB = R0(g.VramTotalMiB),
            ClockMhz = R0(g.ClockMhz),
            MemClockMhz = R0(g.MemClockMhz),
            FanPct = R0(g.FanPct),
        }).ToList(),
        Memory = Memory is { } m ? new MemoryStats
        {
            UsedMiB = R0(m.UsedMiB),
            TotalMiB = R0(m.TotalMiB),
            UsagePct = R1(m.UsagePct),
            CommitUsedMiB = R0(m.CommitUsedMiB),
            CommitLimitMiB = R0(m.CommitLimitMiB),
        } : null,
        Disks = Disks.Select(d => new DiskStats
        {
            Name = d.Name,
            Label = d.Label,
            UsedGiB = R1(d.UsedGiB),
            TotalGiB = R1(d.TotalGiB),
            UsagePct = R1(d.UsagePct),
            ReadBps = R0(d.ReadBps),
            WriteBps = R0(d.WriteBps),
            ActivePct = R1(d.ActivePct),
        }).ToList(),
        Network = Network is { } n ? new NetworkStats
        {
            RxBps = R0(n.RxBps),
            TxBps = R0(n.TxBps),
            Adapters = n.Adapters.Select(a => new NetAdapterStats
            {
                Name = a.Name,
                RxBps = R0(a.RxBps),
                TxBps = R0(a.TxBps),
                LinkMbps = R0(a.LinkMbps),
                Up = a.Up,
            }).ToList(),
        } : null,
        UptimeSec = UptimeSec,
    };

    private static double? R0(double? v) => v is { } x && double.IsFinite(x) ? Math.Round(x) : null;
    private static double? R1(double? v) => v is { } x && double.IsFinite(x) ? Math.Round(x, 1) : null;

    /// <summary>The provider's display name ("LibreHardwareMonitor", "HWiNFO", "iCUE") as the API's stable lowercase id.</summary>
    internal static string? ApiTempSource(string? provider) => provider?.Trim().ToLowerInvariant() switch
    {
        null or "" => null,
        var p when p.Contains("libre") || p == "lhm" => "lhm",
        var p when p.Contains("hwinfo") => "hwinfo",
        var p when p.Contains("icue") => "icue",
        var p => new string(p.Where(char.IsAsciiLetterOrDigit).ToArray()),
    };
}

public sealed record CpuFrame
{
    public string? Name { get; init; }
    /// <summary>PDH "% Processor Utility" (Task Manager's number), clamped to 0-100.</summary>
    public double? UsagePct { get; init; }
    /// <summary>Per logical processor, 0-100 (null unless a per-core view is visible).</summary>
    public IReadOnlyList<double>? PerCorePct { get; init; }
    /// <summary>Effective clock: % Processor Performance × Processor Frequency.</summary>
    public double? ClockMhz { get; init; }
    /// <summary>From an external provider only (LibreHardwareMonitor / HWiNFO, else another module's shared reading such as
    /// iCUE's CPU package sensor); null otherwise. Never the iGPU sensor.</summary>
    public double? TempC { get; init; }
    /// <summary>Where <see cref="TempC"/> came from: "LibreHardwareMonitor", "HWiNFO" or "iCUE" (null without a reading).</summary>
    public string? TempSource { get; init; }
    public int? Cores { get; init; }
    public int? Threads { get; init; }
}

public sealed record GpuFrame
{
    public int Index { get; init; }
    /// <summary>Stable id for settings: "nvml:0", or "d3d:1002:13c0:0".</summary>
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    /// <summary>"nvidia" | "amd" | "intel" | "other".</summary>
    public string Vendor { get; init; } = "other";
    /// <summary>"nvml" | "d3dkmt".</summary>
    public string Source { get; init; } = "";
    public bool Integrated { get; init; }
    public double? UsagePct { get; init; }
    public double? TempC { get; init; }
    /// <summary>Driver's warning temperature when known (D3DKMT caps), for the alert state.</summary>
    public double? TempWarnC { get; init; }
    public double? PowerW { get; init; }
    public double? PowerLimitW { get; init; }
    public double? VramUsedMiB { get; init; }
    public double? VramTotalMiB { get; init; }
    public double? ClockMhz { get; init; }
    public double? MemClockMhz { get; init; }
    public double? FanPct { get; init; }
}

public sealed record MemoryFrame
{
    public double? UsedMiB { get; init; }
    public double? TotalMiB { get; init; }
    public double? UsagePct { get; init; }
    public double? CommitUsedMiB { get; init; }
    public double? CommitLimitMiB { get; init; }
}

/// <summary>PhysicalDisk(_Total): average busy time over all physical disks, summed throughput.</summary>
public sealed record DiskTotals(double? ActivePct, double? ReadBps, double? WriteBps);

public sealed record DiskFrame
{
    /// <summary>"C:".</summary>
    public string Name { get; init; } = "";
    public string? Label { get; init; }
    public string? Format { get; init; }
    public double? TotalGiB { get; init; }
    public double? FreeGiB { get; init; }
    public double? UsedGiB { get; init; }
    public double? UsagePct { get; init; }
    public double? ReadBps { get; init; }
    public double? WriteBps { get; init; }
    public double? ActivePct { get; init; }
}

public sealed record NetworkFrame
{
    /// <summary>Summed over hardware adapters that are up (virtual switches would double count).</summary>
    public double? RxBps { get; init; }
    public double? TxBps { get; init; }
    public IReadOnlyList<NetAdapterFrame> Adapters { get; init; } = [];
}

public sealed record NetAdapterFrame
{
    /// <summary>The interface GUID (stable across reboots), used in settings.</summary>
    public string Id { get; init; } = "";
    /// <summary>The interface alias, e.g. "Ethernet".</summary>
    public string Name { get; init; } = "";
    public string? Description { get; init; }
    public double? RxBps { get; init; }
    public double? TxBps { get; init; }
    public double? LinkMbps { get; init; }
    public bool Up { get; init; }
    public bool Hardware { get; init; }
    public bool IsDefaultRoute { get; init; }
}
