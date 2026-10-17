using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Sources;

// The sampler's inputs. Real implementations wrap PDH / GlobalMemoryStatusEx / IP Helper / DriveInfo / NVML / D3DKMT;
// tests pass fakes. Every source is called only from the sampler thread unless noted.

/// <summary>Static CPU facts (read once).</summary>
public sealed record CpuInfo(string? Name, int? Cores, int? Threads);

/// <summary>Per-volume activity from PDH LogicalDisk(*).</summary>
public readonly record struct VolumeActivity(double? ActivePct, double? ReadBps, double? WriteBps);

public sealed record CpuDiskReading
{
    public double? UsagePct { get; init; }
    public double? ClockMhz { get; init; }
    public IReadOnlyList<double>? PerCorePct { get; init; }
    public DiskTotals? DiskTotal { get; init; }
    public IReadOnlyDictionary<string, VolumeActivity> Volumes { get; init; } = new Dictionary<string, VolumeActivity>();
}

/// <summary>CPU total + per-core + disk counters in ONE PDH query (one PdhCollectQueryData per tick).</summary>
public interface ICpuDiskSource : IDisposable
{
    CpuInfo Info { get; }
    /// <summary>Collects once to start the rate counters (they need two collections).</summary>
    void Prime(bool perCore);
    CpuDiskReading Collect(bool perCore);
}

public interface IMemorySource
{
    MemoryFrame? Read();
}

public interface INetworkSource : IDisposable
{
    /// <summary>Takes a byte-counter baseline (after a pause) without reporting rates.</summary>
    void Prime();
    NetworkFrame? Read();
}

public sealed record DriveSpace(string Name, string? Label, string? Format, double TotalGiB, double FreeGiB);

/// <summary>Free space per fixed drive. Refreshed in the background (DriveInfo costs ~1 ms and can stall on virtual drives).</summary>
public interface IDriveSource
{
    IReadOnlyList<DriveSpace> Current { get; }
    /// <summary>Starts a background refresh if the last one is older than <paramref name="maxAge"/>. Never blocks.</summary>
    void RefreshIfOlderThan(TimeSpan maxAge);
}

public interface IGpuSource : IDisposable
{
    void Prime(bool engines);
    /// <summary><paramref name="fan"/>: also read fan speed (slow on NVML). <paramref name="engines"/>: PDH utilization for non-NVIDIA GPUs.</summary>
    IReadOnlyList<GpuFrame> Read(bool fan, bool engines);
    /// <summary>Re-enumerate adapters (after wake / driver reset).</summary>
    void Reset();
}

public interface ICpuTempProvider
{
    CpuTempStatus Status { get; }
    /// <summary>The latest reading if it is fresh (null when there is none or it is stale).</summary>
    (double TempC, string Provider)? Current { get; }
    void SetWanted(bool wanted);
    void Configure(CpuTempSource source, int lhmPort);
    /// <summary>Look for a provider again right away (settings changed, system woke up).</summary>
    void Redetect();
}

/// <summary>Everything the sampler reads from.</summary>
public sealed record TelemetrySources(
    ICpuDiskSource CpuDisk,
    IMemorySource Memory,
    INetworkSource Network,
    IDriveSource Drives,
    IGpuSource Gpu,
    ICpuTempProvider CpuTemp) : IDisposable
{
    public void Dispose()
    {
        CpuDisk.Dispose();
        Network.Dispose();
        Gpu.Dispose();
        (CpuTemp as IDisposable)?.Dispose();
    }
}
