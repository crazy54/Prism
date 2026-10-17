using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Sources;

/// <summary>
/// CPU total, per-core (only while wanted) and disk counters in ONE PDH query (research §2.1, §2.3, §2.8):
/// <list type="bullet">
/// <item><c>Processor Information(_Total)\% Processor Utility</c>: Task Manager's number (frequency-scaled, NOCAP100, clamped).</item>
/// <item><c>% Processor Performance × Processor Frequency</c>: the live effective clock.</item>
/// <item><c>PhysicalDisk(_Total)</c> and <c>LogicalDisk(*)</c>: active % = 100 − % Idle Time, read/write bytes/s.</item>
/// </list>
/// English counter paths, so it works in any UI language.
/// </summary>
internal sealed unsafe class PdhCpuDiskSource : ICpuDiskSource
{
    private const uint Fmt = Win32.PDH_FMT_DOUBLE | Win32.PDH_FMT_NOCAP100;
    private static readonly TimeSpan PerCoreLinger = TimeSpan.FromSeconds(10);

    private readonly ILog _log;
    private nint _query;
    private nint _util, _perf, _freq, _diskIdle, _diskRead, _diskWrite, _volIdle, _volRead, _volWrite, _perCore;
    private bool _opened;
    private long _perCoreLastWanted;
    private bool _perCoreNew;
    private byte* _buf;
    private uint _bufSize;
    private CpuInfo? _info;

    public PdhCpuDiskSource(ILog log) => _log = log;

    public CpuInfo Info => _info ??= CpuInfoReader.Read();

    public void Prime(bool perCore)
    {
        if (!EnsureOpen()) return;
        UpdatePerCore(perCore);
        Win32.PdhCollectQueryData(_query);
        _perCoreNew = false;
    }

    public CpuDiskReading Collect(bool perCore)
    {
        if (!EnsureOpen()) return new CpuDiskReading();
        UpdatePerCore(perCore);
        Win32.PdhCollectQueryData(_query);
        var util = Value(_util);
        var perf = Value(_perf);
        var freq = Value(_freq);
        var idle = Value(_diskIdle);
        IReadOnlyList<double>? cores = null;
        if (perCore && _perCore != 0 && !_perCoreNew) cores = ReadPerCore();
        _perCoreNew = false;
        return new CpuDiskReading
        {
            UsagePct = util is { } u ? Math.Clamp(u, 0, 100) : null,
            ClockMhz = perf is { } p && freq is { } f && f > 0 ? p / 100 * f : null,
            PerCorePct = cores,
            DiskTotal = new DiskTotals(idle is { } i ? Math.Clamp(100 - i, 0, 100) : null, NonNegative(Value(_diskRead)), NonNegative(Value(_diskWrite))),
            Volumes = ReadVolumes(),
        };
    }

    private bool EnsureOpen()
    {
        if (_opened) return _query != 0;
        _opened = true;
        var rc = Win32.PdhOpenQuery(null, 0, out _query);
        if (rc != 0)
        {
            _log.Warn($"PdhOpenQuery failed (0x{rc:X8}); CPU and disk stats are unavailable.");
            _query = 0;
            return false;
        }
        _util = Add(@"\Processor Information(_Total)\% Processor Utility");
        _perf = Add(@"\Processor Information(_Total)\% Processor Performance");
        _freq = Add(@"\Processor Information(_Total)\Processor Frequency");
        _diskIdle = Add(@"\PhysicalDisk(_Total)\% Idle Time");
        _diskRead = Add(@"\PhysicalDisk(_Total)\Disk Read Bytes/sec");
        _diskWrite = Add(@"\PhysicalDisk(_Total)\Disk Write Bytes/sec");
        _volIdle = Add(@"\LogicalDisk(*)\% Idle Time");
        _volRead = Add(@"\LogicalDisk(*)\Disk Read Bytes/sec");
        _volWrite = Add(@"\LogicalDisk(*)\Disk Write Bytes/sec");
        return true;
    }

    private nint Add(string path)
    {
        var rc = Win32.PdhAddEnglishCounter(_query, path, 0, out var counter);
        if (rc == 0) return counter;
        _log.Info($"PDH counter '{path}' is not available (0x{rc:X8}).");
        return 0;
    }

    private void UpdatePerCore(bool wanted)
    {
        var now = Environment.TickCount64;
        if (wanted)
        {
            _perCoreLastWanted = now;
            if (_perCore == 0)
            {
                _perCore = Add(@"\Processor Information(*)\% Processor Utility");
                _perCoreNew = _perCore != 0; // a rate counter has no value until its second collection
            }
        }
        else if (_perCore != 0 && now - _perCoreLastWanted > PerCoreLinger.TotalMilliseconds)
        {
            Win32.PdhRemoveCounter(_perCore);
            _perCore = 0;
        }
    }

    private static double? Value(nint counter)
    {
        if (counter == 0) return null;
        if (Win32.PdhGetFormattedCounterValue(counter, Fmt, out _, out var v) != 0) return null;
        if (v.CStatus is not (Win32.PDH_CSTATUS_VALID_DATA or Win32.PDH_CSTATUS_NEW_DATA)) return null;
        return double.IsFinite(v.doubleValue) ? v.doubleValue : null;
    }

    private static double? NonNegative(double? v) => v is { } x ? Math.Max(0, x) : null;

    /// <summary>Reads a wildcard counter into the reused buffer; returns the item count (0 on failure).</summary>
    private uint ReadArray(nint counter)
    {
        if (counter == 0) return 0;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var size = _bufSize;
            var rc = Win32.PdhGetFormattedCounterArray(counter, Fmt, ref size, out var count, _buf);
            if (rc == 0) return count;
            if (rc != Win32.PDH_MORE_DATA) return 0;
            if (_buf != null) NativeMemory.Free(_buf);
            _bufSize = Math.Max(size, 4096) * 2;
            _buf = (byte*)NativeMemory.Alloc(_bufSize);
        }
        return 0;
    }

    private IReadOnlyList<double>? ReadPerCore()
    {
        var count = ReadArray(_perCore);
        if (count == 0) return null;
        var items = (PDH_FMT_COUNTERVALUE_ITEM_W*)_buf;
        var list = new List<(int Key, double Value)>((int)count);
        for (var i = 0; i < count; i++)
        {
            var name = new ReadOnlySpan<char>((char*)items[i].szName, StrLen((char*)items[i].szName));
            if (!InstanceNames.TryParseProcessor(name, out var key)) continue; // skips "_Total" and "0,_Total"
            var v = items[i].FmtValue;
            var ok = (v.CStatus is Win32.PDH_CSTATUS_VALID_DATA or Win32.PDH_CSTATUS_NEW_DATA) && double.IsFinite(v.doubleValue);
            list.Add((key, ok ? Math.Clamp(v.doubleValue, 0, 100) : 0));
        }
        if (list.Count == 0) return null;
        list.Sort((a, b) => a.Key.CompareTo(b.Key));
        return list.Select(x => x.Value).ToArray();
    }

    private Dictionary<string, VolumeActivity> ReadVolumes()
    {
        var result = new Dictionary<string, VolumeActivity>(StringComparer.OrdinalIgnoreCase);
        Merge(_volIdle, (a, v) => a with { ActivePct = Math.Clamp(100 - v, 0, 100) });
        Merge(_volRead, (a, v) => a with { ReadBps = Math.Max(0, v) });
        Merge(_volWrite, (a, v) => a with { WriteBps = Math.Max(0, v) });
        return result;

        void Merge(nint counter, Func<VolumeActivity, double, VolumeActivity> set)
        {
            var count = ReadArray(counter);
            var items = (PDH_FMT_COUNTERVALUE_ITEM_W*)_buf;
            for (var i = 0; i < count; i++)
            {
                var name = new ReadOnlySpan<char>((char*)items[i].szName, StrLen((char*)items[i].szName));
                if (!InstanceNames.IsDriveLetter(name)) continue; // skips _Total and HarddiskVolumeN (no letter)
                var v = items[i].FmtValue;
                if (v.CStatus is not (Win32.PDH_CSTATUS_VALID_DATA or Win32.PDH_CSTATUS_NEW_DATA) || !double.IsFinite(v.doubleValue)) continue;
                var key = char.ToUpperInvariant(name[0]) + ":";
                result[key] = set(result.GetValueOrDefault(key), v.doubleValue);
            }
        }
    }

    private static int StrLen(char* s)
    {
        if (s == null) return 0;
        var n = 0;
        while (s[n] != '\0' && n < 1024) n++;
        return n;
    }

    public void Dispose()
    {
        if (_query != 0) Win32.PdhCloseQuery(_query);
        _query = 0;
        if (_buf != null) NativeMemory.Free(_buf);
        _buf = null;
        _bufSize = 0;
    }
}

/// <summary>PDH instance-name parsing (pure, unit-tested).</summary>
internal static class InstanceNames
{
    /// <summary>"0,15" → group 0, number 15 (sortable key). False for "_Total" and "0,_Total".</summary>
    public static bool TryParseProcessor(ReadOnlySpan<char> name, out int key)
    {
        key = 0;
        var comma = name.IndexOf(',');
        if (comma <= 0) return false;
        if (!int.TryParse(name[..comma], System.Globalization.NumberStyles.None, null, out var group)) return false;
        if (!int.TryParse(name[(comma + 1)..], System.Globalization.NumberStyles.None, null, out var number)) return false;
        key = group * 4096 + number;
        return true;
    }

    /// <summary>"C:" (a lettered volume). False for "_Total" and "HarddiskVolume3".</summary>
    public static bool IsDriveLetter(ReadOnlySpan<char> name) => name.Length == 2 && char.IsAsciiLetter(name[0]) && name[1] == ':';
}

/// <summary>CPU name / cores / threads, read once.</summary>
internal static unsafe class CpuInfoReader
{
    public static CpuInfo Read()
    {
        string? name = null;
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
            name = (key?.GetValue("ProcessorNameString") as string)?.Trim();
            if (string.IsNullOrEmpty(name)) name = null;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or IOException or UnauthorizedAccessException) { }
        var threads = (int)Win32.GetActiveProcessorCount(Win32.ALL_PROCESSOR_GROUPS);
        return new CpuInfo(name, CountCores(), threads > 0 ? threads : Environment.ProcessorCount);
    }

    private static int? CountCores()
    {
        uint len = 0;
        Win32.GetLogicalProcessorInformationEx(0 /* RelationProcessorCore */, null, ref len);
        if (len == 0) return null;
        var buf = (byte*)NativeMemory.Alloc(len);
        try
        {
            if (!Win32.GetLogicalProcessorInformationEx(0, buf, ref len)) return null;
            int cores = 0;
            for (uint off = 0; off + 8 <= len;)
            {
                var size = *(uint*)(buf + off + 4);  // { int Relationship; uint Size; ... }
                if (size == 0) break;
                if (*(int*)(buf + off) == 0) cores++;
                off += size;
            }
            return cores > 0 ? cores : null;
        }
        finally { NativeMemory.Free(buf); }
    }
}
