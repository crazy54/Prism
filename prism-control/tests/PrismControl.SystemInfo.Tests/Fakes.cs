using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Tests;

// Fictional machine for tests and previews: "Example CPU", "Example GPU", ".example" names. Nothing touches the real system.

public sealed class FakeCpuDisk : ICpuDiskSource
{
    public CpuInfo Info { get; set; } = new("Example CPU 8-Core Processor", 8, 16);
    public double? Usage { get; set; } = 42;
    public double? Clock { get; set; } = 5310;
    public double[] PerCore { get; set; } = [12, 40, 88, 23, 5, 61, 34, 77, 9, 15, 52, 70, 3, 28, 46, 91];
    public DiskTotals Total { get; set; } = new(3, 1_200_000, 350_000);
    public Dictionary<string, VolumeActivity> Volumes { get; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["C:"] = new(4, 900_000, 300_000),
        ["D:"] = new(0, 0, 50_000),
    };
    public int Primes, Collects;
    public bool LastPerCore;

    public void Prime(bool perCore) => Primes++;

    public CpuDiskReading Collect(bool perCore)
    {
        Collects++;
        LastPerCore = perCore;
        return new CpuDiskReading { UsagePct = Usage, ClockMhz = Clock, PerCorePct = perCore ? PerCore : null, DiskTotal = Total, Volumes = Volumes };
    }

    public void Dispose() { }
}

public sealed class FakeMemory : IMemorySource
{
    public MemoryFrame? Frame { get; set; } = new() { UsedMiB = 52_300, TotalMiB = 95_891, UsagePct = 54.5, CommitUsedMiB = 103_100, CommitLimitMiB = 165_500 };
    public int Reads;
    public MemoryFrame? Read() { Reads++; return Frame; }
}

public sealed class FakeNetwork : INetworkSource
{
    public List<NetAdapterFrame> Adapters { get; } =
    [
        new() { Id = "11111111-1111-1111-1111-111111111111", Name = "Ethernet", Description = "Example 5GbE Controller", RxBps = 12_400_000, TxBps = 1_020_000, LinkMbps = 1000, Up = true, Hardware = true, IsDefaultRoute = true },
        new() { Id = "22222222-2222-2222-2222-222222222222", Name = "Example VPN", Description = "Example Tunnel", RxBps = 0, TxBps = 0, LinkMbps = 100_000, Up = true, Hardware = false },
    ];
    public int Reads, Primes;
    public void Prime() => Primes++;
    public NetworkFrame? Read()
    {
        Reads++;
        var (rx, tx) = NetworkMath.Totals(Adapters);
        return new NetworkFrame { RxBps = rx, TxBps = tx, Adapters = Adapters.ToList() };
    }
    public void Dispose() { }
}

public sealed class FakeDrives : IDriveSource
{
    public IReadOnlyList<DriveSpace> Current { get; set; } =
    [
        new("C:", "System", "NTFS", 931, 66),
        new("D:", "Data", "NTFS", 1863, 310),
        new("E:", null, "NTFS", 3353, 123),
    ];
    public int Refreshes;
    public void RefreshIfOlderThan(TimeSpan maxAge) => Refreshes++;
}

public sealed class FakeGpu : IGpuSource
{
    public List<GpuFrame> Gpus { get; } =
    [
        new() { Index = 0, Id = "nvml:0", Name = "Example GPU 12GB", Vendor = "nvidia", Source = "nvml", UsagePct = 96, TempC = 49, PowerW = 153.8, PowerLimitW = 285, VramUsedMiB = 7447, VramTotalMiB = 12282, ClockMhz = 2850, MemClockMhz = 10501, FanPct = 66 },
        new() { Index = 1, Id = "d3d:1002:13c0:0", Name = "Example Graphics", Vendor = "amd", Source = "d3dkmt", Integrated = true, UsagePct = 2, TempC = 41, VramUsedMiB = 32, VramTotalMiB = 2022, ClockMhz = 600, MemClockMhz = 1800 },
    ];
    public int Reads;
    public bool LastEngines, LastFan;
    public void Prime(bool engines) { }
    public IReadOnlyList<GpuFrame> Read(bool fan, bool engines)
    {
        Reads++;
        LastEngines = engines;
        LastFan = fan;
        return Gpus.ToList();
    }
    public void Reset() { }
    public void Dispose() { }
}

public sealed class FakeCpuTemp : ICpuTempProvider
{
    public CpuTempStatus Status { get; set; } = new(null, null, "No CPU temperature. Run LibreHardwareMonitor (web server on) or HWiNFO (shared memory on).");
    public (double TempC, string Provider)? Current { get; set; }
    public bool Wanted;
    public CpuTempSource Source = CpuTempSource.Auto;
    public int Port = 8085, Configures, Redetects;
    /// <summary>Runs inside SetWanted: the sampler calls it right after its needs check (lets tests interleave there).</summary>
    public Action<bool>? OnSetWanted;
    public void SetWanted(bool wanted) { Wanted = wanted; OnSetWanted?.Invoke(wanted); }
    public void Configure(CpuTempSource source, int lhmPort) { Source = source; Port = lhmPort; Configures++; }
    public void Redetect() => Redetects++;
}

public sealed class FakeMachine
{
    public FakeCpuDisk Cpu { get; } = new();
    public FakeMemory Memory { get; } = new();
    public FakeNetwork Network { get; } = new();
    public FakeDrives Drives { get; } = new();
    public FakeGpu Gpu { get; } = new();
    public FakeCpuTemp Temp { get; } = new();

    public TelemetrySources Sources => new(Cpu, Memory, Network, Drives, Gpu, Temp);

    /// <summary>A real <see cref="TelemetryService"/> over the fakes (its loop is not started; tests call SampleNow).</summary>
    public TelemetryService Service(TimeProvider? time = null) => new(Sources, time ?? TimeProvider.System, NullLog.Instance);

    /// <summary>A service with some history: <paramref name="ticks"/> samples of a gently moving machine.</summary>
    public TelemetryService ServiceWithHistory(int ticks = 60, TelemetryNeeds needs = TelemetryNeeds.Api)
    {
        var svc = Service();
        var baseUsage = Cpu.Usage ?? 40;
        for (var i = 0; i < ticks; i++)
        {
            var w = Math.Sin(i / 6.0);
            Cpu.Usage = Math.Clamp(baseUsage + 22 * w + 9 * Math.Sin(i * 1.7), 0, 100);
            Cpu.Clock = 5100 + 220 * Math.Cos(i / 5.0);
            Memory.Frame = Memory.Frame! with { UsagePct = 54 + 3 * Math.Sin(i / 9.0), UsedMiB = 95_891 * (54 + 3 * Math.Sin(i / 9.0)) / 100 };
            Network.Adapters[0] = Network.Adapters[0] with { RxBps = 6_000_000 + 5_500_000 * Math.Abs(Math.Sin(i / 4.0)), TxBps = 600_000 + 450_000 * Math.Abs(Math.Cos(i / 3.0)) };
            Gpu.Gpus[0] = Gpu.Gpus[0] with { UsagePct = Math.Clamp(80 + 18 * Math.Sin(i / 3.0), 0, 100), TempC = 47 + 3 * Math.Sin(i / 10.0), PowerW = 140 + 30 * Math.Sin(i / 3.0) };
            Cpu.Total = Cpu.Total with { ActivePct = Math.Abs(12 * Math.Sin(i / 2.5)), ReadBps = 900_000 + 800_000 * Math.Abs(Math.Sin(i / 3.0)) };
            Cpu.Volumes["C:"] = new(Math.Abs(10 * Math.Sin(i / 2.5)), 800_000 * Math.Abs(Math.Sin(i / 3.0)), 300_000);
            svc.SampleNow(needs);
        }
        Cpu.Usage = baseUsage;
        return svc;
    }
}
