using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Sources;

/// <summary>
/// GPUs: NVML for NVIDIA (research §2.5: usage, temperature, power + limit, VRAM, clocks; fan every 5 s), and
/// D3DKMT + PDH for everything else (§2.6: ADAPTERPERFDATA temperature and memory clock, NODEPERFDATA core clock every 5 s,
/// PDH GPU Engine utilization and GPU Adapter Memory VRAM at most 1 Hz). All read-only, no admin.
/// </summary>
internal sealed unsafe class GpuSource(ILog log) : IGpuSource
{
    private static readonly long FanTicks = Stopwatch.Frequency * 5;
    private static readonly long LimitTicks = Stopwatch.Frequency * 30;
    private static readonly long NvmlRetryTicks = Stopwatch.Frequency * 30;

    private NvmlApi? _nvml;
    private long _nvmlRetryAt;
    private readonly List<NvDevice> _nv = [];
    private readonly List<D3dAdapter> _d3d = [];
    private bool _enumerated;
    private long _fanAt, _limitAt;
    private PdhGpuEngines? _engines;

    private sealed class NvDevice
    {
        public int Ordinal;
        public nint Handle;
        public string? Name;
        public double? Fan, Limit;
        public int Failures;
    }

    private sealed record D3dAdapter(uint Handle, long Luid, string Id, string? Name, string Vendor, bool Integrated, double? VramTotalMiB, double? TempWarnC)
    {
        /// <summary>NODEPERFDATA costs ~0.4 ms per adapter (measured), so the core clock is read every 5 s like the fan.</summary>
        public double? CoreClockMhz { get; set; }
    }

    public void Prime(bool engines)
    {
        Enumerate();
        if (engines && HasNonNvml) (_engines ??= new PdhGpuEngines(log)).Collect(force: true);
    }

    private bool HasNonNvml => _d3d.Count > 0;

    public IReadOnlyList<GpuFrame> Read(bool fan, bool engines)
    {
        Enumerate();
        var now = Stopwatch.GetTimestamp();
        var slowDue = now - _fanAt >= FanTicks || _fanAt == 0;
        if (slowDue) _fanAt = now;
        var readFan = fan && slowDue;
        var readLimit = now - _limitAt >= LimitTicks || _limitAt == 0;
        if (readLimit) _limitAt = now;

        var list = new List<GpuFrame>(_nv.Count + _d3d.Count);
        if (_nvml is { } api)
        {
            var lost = false;
            foreach (var d in _nv)
            {
                var usage = api.Utilization(d.Handle);
                var temp = api.TemperatureC(d.Handle);
                d.Failures = usage is null && temp is null ? d.Failures + 1 : 0;
                if (d.Failures >= 5) lost = true;
                if (readLimit) d.Limit = api.PowerLimitW(d.Handle);
                if (readFan) d.Fan = api.FanPct(d.Handle);
                var mem = api.Memory(d.Handle);
                list.Add(new GpuFrame
                {
                    Index = list.Count,
                    Id = $"nvml:{d.Ordinal}",
                    Name = d.Name,
                    Vendor = "nvidia",
                    Source = "nvml",
                    UsagePct = usage,
                    TempC = temp,
                    PowerW = api.PowerW(d.Handle),
                    PowerLimitW = d.Limit,
                    VramUsedMiB = mem is { } m ? m.Used / 1048576.0 : null,
                    VramTotalMiB = mem is { } m2 ? m2.Total / 1048576.0 : null,
                    ClockMhz = api.ClockMhz(d.Handle, NvmlApi.ClockGraphics),
                    MemClockMhz = api.ClockMhz(d.Handle, NvmlApi.ClockMem),
                    FanPct = fan ? d.Fan : null,
                });
            }
            if (lost)
            {
                log.Warn("NVML stopped answering (driver reset?); re-initializing in 30 s.");
                DropNvml();
                _nvmlRetryAt = now + NvmlRetryTicks;
            }
        }

        if (_d3d.Count > 0)
        {
            PdhGpuEngines.Reading? eng = null;
            if (engines) eng = (_engines ??= new PdhGpuEngines(log)).Collect(force: false);
            foreach (var a in _d3d)
            {
                var perf = new D3DKMT_ADAPTER_PERFDATA();
                var okPerf = Win32.QueryAdapter(a.Handle, Win32.KMTQAITYPE_ADAPTERPERFDATA, &perf, (uint)sizeof(D3DKMT_ADAPTER_PERFDATA)) == 0;
                if (slowDue)
                {
                    var node = new D3DKMT_NODE_PERFDATA { NodeOrdinal = 0 };
                    var okNode = Win32.QueryAdapter(a.Handle, Win32.KMTQAITYPE_NODEPERFDATA, &node, (uint)sizeof(D3DKMT_NODE_PERFDATA)) == 0;
                    a.CoreClockMhz = okNode && node.Frequency > 0 ? node.Frequency / 1e6 : null;
                }
                list.Add(new GpuFrame
                {
                    Index = list.Count,
                    Id = a.Id,
                    Name = a.Name,
                    Vendor = a.Vendor,
                    Source = "d3dkmt",
                    Integrated = a.Integrated,
                    UsagePct = eng?.Utilization.TryGetValue(a.Luid, out var u) == true ? Math.Clamp(u, 0, 100) : null,
                    TempC = okPerf && perf.Temperature > 0 ? perf.Temperature / 10.0 : null,
                    TempWarnC = a.TempWarnC,
                    VramUsedMiB = eng?.DedicatedBytes.TryGetValue(a.Luid, out var b) == true ? b / 1048576.0 : null,
                    VramTotalMiB = a.VramTotalMiB,
                    ClockMhz = a.CoreClockMhz,
                    MemClockMhz = okPerf && perf.MemoryFrequency > 0 ? perf.MemoryFrequency / 1e6 : null,
                });
            }
        }
        return list;
    }

    private bool _nvmlTried;

    private void Enumerate()
    {
        var now = Stopwatch.GetTimestamp();
        if (_nvml is null && (!_nvmlTried || (_nvmlRetryAt != 0 && now >= _nvmlRetryAt))) InitNvml();
        if (_enumerated) return;
        _enumerated = true;
        EnumerateD3d();
    }

    private void InitNvml()
    {
        _nvmlTried = true;
        _nvmlRetryAt = 0;
        _nvml = NvmlApi.TryLoad(out var error);
        _nv.Clear();
        if (_nvml is null)
        {
            log.Info($"NVML: {error}; NVIDIA GPUs fall back to D3DKMT.");
            return;
        }
        var count = _nvml.DeviceCount();
        for (var i = 0; i < count; i++)
        {
            var h = _nvml.Handle(i);
            if (h != 0) _nv.Add(new NvDevice { Ordinal = i, Handle = h, Name = _nvml.Name(h) });
        }
        log.Info($"NVML loaded from {_nvml.LoadedFrom}: {_nv.Count} device(s).");
        _enumerated = false; // re-run D3DKMT so NVIDIA adapters are not listed twice
        CloseD3d();
    }

    private void EnumerateD3d()
    {
        CloseD3d();
        var e = new D3DKMT_ENUMADAPTERS2 { NumAdapters = 0, pAdapters = null };
        if (Win32.D3DKMTEnumAdapters2(&e) != 0 || e.NumAdapters == 0) return;
        var adapters = new D3DKMT_ADAPTERINFO[Math.Min(e.NumAdapters, 32)];
        fixed (D3DKMT_ADAPTERINFO* pa = adapters)
        {
            e.NumAdapters = (uint)adapters.Length;
            e.pAdapters = pa;
            if (Win32.D3DKMTEnumAdapters2(&e) != 0) return;
        }
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < e.NumAdapters; i++)
        {
            var info = adapters[i];
            var h = info.hAdapter;
            var keep = false;
            try
            {
                uint type = 0;
                if (Win32.QueryAdapter(h, Win32.KMTQAITYPE_ADAPTERTYPE, &type, 4) == 0 && (type & 4) != 0) continue; // software adapter
                var ids = new D3DKMT_QUERY_DEVICE_IDS();
                var hasIds = Win32.QueryAdapter(h, Win32.KMTQAITYPE_PHYSICALADAPTERDEVICEIDS, &ids, (uint)sizeof(D3DKMT_QUERY_DEVICE_IDS)) == 0;
                var name = RegistryName(h);
                var vendor = GpuVendors.From(hasIds ? ids.VendorID : 0, name);
                if (hasIds && ids.VendorID == 0x1414) continue; // Microsoft Basic Render / Display
                if (vendor == "nvidia" && _nvml is not null && _nv.Count > 0) continue; // NVML covers it
                var seg = new D3DKMT_SEGMENTSIZEINFO();
                double? vram = Win32.QueryAdapter(h, Win32.KMTQAITYPE_GETSEGMENTSIZE, &seg, (uint)sizeof(D3DKMT_SEGMENTSIZEINFO)) == 0 && seg.DedicatedVideoMemorySize > 0
                    ? seg.DedicatedVideoMemorySize / 1048576.0 : null;
                var caps = new D3DKMT_ADAPTER_PERFDATACAPS();
                double? warn = Win32.QueryAdapter(h, Win32.KMTQAITYPE_ADAPTERPERFDATA_CAPS, &caps, (uint)sizeof(D3DKMT_ADAPTER_PERFDATACAPS)) == 0 && caps.TemperatureWarning > 0
                    ? caps.TemperatureWarning / 10.0 : null;
                var baseId = hasIds ? $"d3d:{ids.VendorID:x4}:{ids.DeviceID:x4}" : $"d3d:{(name ?? "gpu").ToLowerInvariant().Replace(' ', '-')}";
                var n = seen.GetValueOrDefault(baseId);
                seen[baseId] = n + 1;
                var luid = ((long)(uint)info.LuidHigh << 32) | info.LuidLow;
                _d3d.Add(new D3dAdapter(h, luid, $"{baseId}:{n}", name, vendor, (type & 0x20) != 0, vram, warn));
                keep = true;
            }
            finally
            {
                if (!keep) Win32.D3DKMTCloseAdapter(&h);
            }
        }
        // Discrete before integrated so "the first GPU" is the one people mean.
        _d3d.Sort((a, b) => a.Integrated.CompareTo(b.Integrated));
    }

    private static string? RegistryName(uint h)
    {
        const int len = 260 * 4; // ADAPTERREGISTRYINFO: AdapterString, BiosString, DacType, ChipType (WCHAR[260] each)
        char* reg = stackalloc char[len];
        foreach (var type in new[] { Win32.KMTQAITYPE_ADAPTERREGISTRYINFO, Win32.KMTQAITYPE_ADAPTERREGISTRYINFO_RENDER })
        {
            new Span<char>(reg, len).Clear();
            if (Win32.QueryAdapter(h, type, reg, len * 2) != 0) continue;
            var s = new string(reg).Trim();
            if (s.Length > 0) return s;
        }
        return null;
    }

    private void CloseD3d()
    {
        foreach (var a in _d3d)
        {
            var h = a.Handle;
            Win32.D3DKMTCloseAdapter(&h);
        }
        _d3d.Clear();
    }

    private void DropNvml()
    {
        _nvml?.Dispose();
        _nvml = null;
        _nv.Clear();
        _enumerated = false;
    }

    public void Reset()
    {
        DropNvml();
        CloseD3d();
        _nvmlTried = false;
        _nvmlRetryAt = 0;
        _engines?.Dispose();
        _engines = null;
    }

    public void Dispose()
    {
        _engines?.Dispose();
        _engines = null;
        CloseD3d();
        _nvml?.Dispose();
        _nvml = null;
    }
}

internal static class GpuVendors
{
    public static string From(uint vendorId, string? name) => vendorId switch
    {
        0x10DE => "nvidia",
        0x1002 or 0x1022 => "amd",
        0x8086 => "intel",
        _ => name switch
        {
            null => "other",
            _ when name.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) => "nvidia",
            _ when name.Contains("Radeon", StringComparison.OrdinalIgnoreCase) || name.StartsWith("AMD", StringComparison.OrdinalIgnoreCase) => "amd",
            _ when name.Contains("Intel", StringComparison.OrdinalIgnoreCase) => "intel",
            _ => "other",
        },
    };
}

/// <summary>
/// PDH <c>GPU Engine(*)\Utilization Percentage</c> + <c>GPU Adapter Memory(*)\Dedicated Usage</c> in their own query
/// (≈1,400 instances, 1.3-1.8 ms; never faster than 1 Hz). Task Manager's per-GPU number is the maximum over engines
/// of the per-engine sum over processes.
/// </summary>
internal sealed unsafe class PdhGpuEngines : IDisposable
{
    private const uint Fmt = Win32.PDH_FMT_DOUBLE | Win32.PDH_FMT_NOCAP100;
    private static readonly long MinGapTicks = Stopwatch.Frequency * 9 / 10;

    private readonly ILog _log;
    private nint _query, _eng, _mem;
    private bool _opened;
    private long _lastAt;
    private Reading _last = new(new Dictionary<long, double>(), new Dictionary<long, double>());
    private byte* _buf;
    private uint _bufSize;
    private readonly Dictionary<(long Luid, int Engine), double> _perEngine = [];

    public sealed record Reading(IReadOnlyDictionary<long, double> Utilization, IReadOnlyDictionary<long, double> DedicatedBytes);

    public PdhGpuEngines(ILog log) => _log = log;

    public Reading Collect(bool force)
    {
        var now = Stopwatch.GetTimestamp();
        if (!force && _lastAt != 0 && now - _lastAt < MinGapTicks) return _last;
        if (!_opened)
        {
            _opened = true;
            if (Win32.PdhOpenQuery(null, 0, out _query) != 0) { _query = 0; return _last; }
            if (Win32.PdhAddEnglishCounter(_query, @"\GPU Engine(*)\Utilization Percentage", 0, out _eng) != 0) _eng = 0;
            if (Win32.PdhAddEnglishCounter(_query, @"\GPU Adapter Memory(*)\Dedicated Usage", 0, out _mem) != 0) _mem = 0;
            if (_eng == 0 && _mem == 0) _log.Info("PDH GPU counters are not available; non-NVIDIA GPU usage is unknown.");
        }
        if (_query == 0) return _last;
        Win32.PdhCollectQueryData(_query);
        _lastAt = now;

        _perEngine.Clear();
        var count = ReadArray(_eng);
        var items = (PDH_FMT_COUNTERVALUE_ITEM_W*)_buf;
        for (var i = 0; i < count; i++)
        {
            var v = items[i].FmtValue;
            if (v.CStatus > 1 || !double.IsFinite(v.doubleValue)) continue;
            var name = MemoryMarshal.CreateReadOnlySpanFromNullTerminated((char*)items[i].szName);
            if (GpuInstanceNames.TryParseEngine(name, out var luid, out var engine))
                _perEngine[(luid, engine)] = _perEngine.GetValueOrDefault((luid, engine)) + v.doubleValue;
        }
        var util = new Dictionary<long, double>();
        foreach (var ((luid, _), sum) in _perEngine)
            util[luid] = Math.Max(util.GetValueOrDefault(luid), Math.Min(100, sum));

        var mem = new Dictionary<long, double>();
        count = ReadArray(_mem);
        items = (PDH_FMT_COUNTERVALUE_ITEM_W*)_buf;
        for (var i = 0; i < count; i++)
        {
            var v = items[i].FmtValue;
            if (v.CStatus > 1 || !double.IsFinite(v.doubleValue)) continue;
            var name = MemoryMarshal.CreateReadOnlySpanFromNullTerminated((char*)items[i].szName);
            if (GpuInstanceNames.TryParseLuid(name, out var luid)) mem[luid] = mem.GetValueOrDefault(luid) + v.doubleValue;
        }
        return _last = new Reading(util, mem);
    }

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
            _bufSize = Math.Max(size, 65536) + size / 4;
            _buf = (byte*)NativeMemory.Alloc(_bufSize);
        }
        return 0;
    }

    public void Dispose()
    {
        if (_query != 0) Win32.PdhCloseQuery(_query);
        _query = 0;
        if (_buf != null) NativeMemory.Free(_buf);
        _buf = null;
    }
}

/// <summary>Allocation-free parsing of PDH GPU instance names (unit-tested).</summary>
internal static class GpuInstanceNames
{
    /// <summary>"pid_1234_luid_0x00000000_0x0000D1A4_phys_0_eng_3_engtype_3D" → LUID (high &lt;&lt; 32 | low), engine 3.</summary>
    public static bool TryParseEngine(ReadOnlySpan<char> name, out long luid, out int engine)
    {
        engine = 0;
        if (!TryParseLuid(name, out luid)) return false;
        var e = name.IndexOf("_eng_", StringComparison.Ordinal);
        if (e < 0) return false;
        var rest = name[(e + 5)..];
        var end = rest.IndexOf('_');
        return int.TryParse(end < 0 ? rest : rest[..end], NumberStyles.None, CultureInfo.InvariantCulture, out engine);
    }

    /// <summary>Finds "luid_0x{high:X8}_0x{low:X8}" anywhere in the name.</summary>
    public static bool TryParseLuid(ReadOnlySpan<char> name, out long luid)
    {
        luid = 0;
        var i = name.IndexOf("luid_0x", StringComparison.OrdinalIgnoreCase);
        if (i < 0 || name.Length < i + 26) return false;
        var high = name.Slice(i + 7, 8);
        if (name[i + 15] != '_' || name[i + 16] != '0' || (name[i + 17] | 0x20) != 'x') return false;
        var low = name.Slice(i + 18, 8);
        if (!uint.TryParse(high, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var h)) return false;
        if (!uint.TryParse(low, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var l)) return false;
        luid = ((long)h << 32) | l;
        return true;
    }
}
