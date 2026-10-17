using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo;

/// <summary>
/// Physical memory and commit charge via GlobalMemoryStatusEx (0.6 µs, read-only). Thread-safe: every
/// <see cref="Sample"/> publishes one immutable reading. Also used by the sample key (SampleMemoryKey).
/// </summary>
public sealed class MemorySampler : IMemorySource
{
    private Reading _last = new(0, 0, 0, null, null);

    private sealed record Reading(double UsedMiB, double TotalMiB, double UsagePct, double? CommitUsedMiB, double? CommitLimitMiB);

    public double UsedMiB => Volatile.Read(ref _last).UsedMiB;
    public double TotalMiB => Volatile.Read(ref _last).TotalMiB;
    public double UsagePct => Volatile.Read(ref _last).UsagePct;

    /// <summary>Reads the current values (cheap; safe from any thread).</summary>
    public void Sample()
    {
        var s = new MEMORYSTATUSEX { dwLength = (uint)System.Runtime.CompilerServices.Unsafe.SizeOf<MEMORYSTATUSEX>() };
        if (!Win32.GlobalMemoryStatusEx(ref s) || s.ullTotalPhys == 0) return;
        var total = s.ullTotalPhys / 1048576.0;
        var used = (s.ullTotalPhys - s.ullAvailPhys) / 1048576.0;
        double? commitLimit = s.ullTotalPageFile > 0 ? s.ullTotalPageFile / 1048576.0 : null;
        double? commitUsed = s.ullTotalPageFile >= s.ullAvailPageFile && s.ullTotalPageFile > 0 ? (s.ullTotalPageFile - s.ullAvailPageFile) / 1048576.0 : null;
        Volatile.Write(ref _last, new Reading(Math.Round(used), Math.Round(total), Math.Round(used / total * 100, 1), commitUsed, commitLimit));
    }

    public MemoryFrame? Read()
    {
        Sample();
        var r = Volatile.Read(ref _last);
        if (r.TotalMiB <= 0) return null;
        return new MemoryFrame
        {
            UsedMiB = r.UsedMiB,
            TotalMiB = r.TotalMiB,
            UsagePct = r.UsagePct,
            CommitUsedMiB = r.CommitUsedMiB,
            CommitLimitMiB = r.CommitLimitMiB,
        };
    }
}
