namespace PrismControl.SystemInfo.Telemetry;

/// <summary>What a consumer wants sampled. The sampler only reads what at least one consumer needs.</summary>
[Flags]
public enum TelemetryNeeds
{
    None = 0,
    Cpu = 1,
    /// <summary>The per-core array (0.25-0.38 ms): only while a per-core view is visible.</summary>
    PerCore = 2,
    /// <summary>Starts the external CPU temperature provider (LibreHardwareMonitor / HWiNFO detection and reads).</summary>
    CpuTemp = 4,
    Gpu = 8,
    /// <summary>PDH GPU Engine utilization + VRAM for non-NVIDIA GPUs (1.3-1.8 ms, at most 1 Hz).</summary>
    GpuEngines = 16,
    Memory = 32,
    Disk = 64,
    Network = 128,
    /// <summary>Sample at 2 Hz instead of 1 Hz.</summary>
    Fast = 256,

    /// <summary>What the data API serves (everything except the per-core array and the fast rate).</summary>
    Api = Cpu | CpuTemp | Gpu | GpuEngines | Memory | Disk | Network,
}

/// <summary>A consumer's registration with the sampler. Dispose it when the consumer disappears.</summary>
public interface ITelemetryLease : IDisposable
{
    TelemetryNeeds Needs { get; }
    void Update(TelemetryNeeds needs);
}

public enum CpuTempSource { Auto, LibreHardwareMonitor, HWiNFO, Off }

/// <summary>Where the CPU temperature comes from right now, in words the user can act on.</summary>
public sealed record CpuTempStatus(string? Provider, double? TempC, string Message)
{
    public static CpuTempStatus Idle { get; } = new(null, null, "Not needed right now.");
}

/// <summary>The shared telemetry service as actions see it (fake it in tests).</summary>
public interface ITelemetry
{
    /// <summary>The most recent sample (null until the first one).</summary>
    TelemetryFrame? Latest { get; }
    TelemetryHistory History { get; }
    CpuTempStatus CpuTemp { get; }
    CpuTempSource CpuTempSource { get; }
    int LhmPort { get; }
    ITelemetryLease Acquire(TelemetryNeeds needs);
    /// <summary>Waits (without blocking) for a sample newer than the current one, up to <paramref name="timeout"/>.</summary>
    Task<TelemetryFrame?> NextFrameAsync(TimeSpan timeout, CancellationToken cancellationToken = default);
    void ConfigureCpuTemp(CpuTempSource source, int lhmPort);
}
