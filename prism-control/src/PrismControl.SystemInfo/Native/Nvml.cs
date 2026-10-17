// NVML via NativeLibrary + unmanaged function pointers: no DllImport resolution at start-up, a missing driver or
// missing export degrades to "no NVIDIA data" instead of crashing, and it is trim/AOT safe (research/windows.md §2.5).
using System.Runtime.InteropServices;

namespace PrismControl.SystemInfo.Native;

[StructLayout(LayoutKind.Sequential)] internal struct NvmlUtilization { public uint Gpu, Memory; }
[StructLayout(LayoutKind.Sequential)] internal struct NvmlMemory { public ulong Total, Free, Used; }
[StructLayout(LayoutKind.Sequential)] internal struct NvmlMemoryV2 { public uint Version; public ulong Total, Reserved, Free, Used; }

/// <summary>A loaded and initialized nvml.dll. All calls are cdecl and read-only. Not thread-safe: call from the sampler thread.</summary>
internal sealed unsafe class NvmlApi : IDisposable
{
    public const int Success = 0, ErrorUninitialized = 1, ErrorNotSupported = 3, ErrorGpuIsLost = 15;
    public const int ClockGraphics = 0, ClockMem = 2;

    private nint _lib;
    private delegate* unmanaged[Cdecl]<int> _shutdown;
    private delegate* unmanaged[Cdecl]<uint*, int> _count;
    private delegate* unmanaged[Cdecl]<uint, nint*, int> _handle;
    private delegate* unmanaged[Cdecl]<nint, byte*, uint, int> _name;
    private delegate* unmanaged[Cdecl]<nint, NvmlUtilization*, int> _util;
    private delegate* unmanaged[Cdecl]<nint, int, uint*, int> _temp;
    private delegate* unmanaged[Cdecl]<nint, uint*, int> _power;
    private delegate* unmanaged[Cdecl]<nint, uint*, int> _powerLimit;
    private delegate* unmanaged[Cdecl]<nint, NvmlMemory*, int> _mem;
    private delegate* unmanaged[Cdecl]<nint, NvmlMemoryV2*, int> _memV2;
    private delegate* unmanaged[Cdecl]<nint, int, uint*, int> _clock;
    private delegate* unmanaged[Cdecl]<nint, uint*, int> _fan;

    public string LoadedFrom { get; private set; } = "";

    private NvmlApi() { }

    /// <summary>Loads nvml.dll (System32 first, then the DriverStore, then the legacy NVSMI folder) and calls nvmlInit_v2.</summary>
    public static NvmlApi? TryLoad(out string error)
    {
        var candidates = new List<string> { Path.Combine(Environment.SystemDirectory, "nvml.dll") };
        try
        {
            var store = Path.Combine(Environment.SystemDirectory, "DriverStore", "FileRepository");
            if (Directory.Exists(store))
                candidates.AddRange(Directory.EnumerateDirectories(store, "nv_dispi.inf_amd64_*").Select(d => Path.Combine(d, "nvml.dll")));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        candidates.Add(@"C:\Program Files\NVIDIA Corporation\NVSMI\nvml.dll");

        foreach (var path in candidates)
        {
            if (!File.Exists(path) || !NativeLibrary.TryLoad(path, out var lib)) continue;
            var api = new NvmlApi { _lib = lib, LoadedFrom = path };
            if (!api.Resolve())
            {
                NativeLibrary.Free(lib);
                continue;
            }
            var init = (delegate* unmanaged[Cdecl]<int>)NativeLibrary.GetExport(lib, "nvmlInit_v2");
            var rc = init();
            if (rc != Success)
            {
                NativeLibrary.Free(lib);
                error = $"nvmlInit_v2 returned {rc}";
                return null;
            }
            error = "";
            return api;
        }
        error = "nvml.dll not found (no NVIDIA driver)";
        return null;
    }

    private bool Resolve()
    {
        nint F(string name) => NativeLibrary.TryGetExport(_lib, name, out var p) ? p : 0;
        if (F("nvmlInit_v2") == 0 || F("nvmlDeviceGetCount_v2") == 0 || F("nvmlDeviceGetHandleByIndex_v2") == 0) return false;
        _shutdown = (delegate* unmanaged[Cdecl]<int>)F("nvmlShutdown");
        _count = (delegate* unmanaged[Cdecl]<uint*, int>)F("nvmlDeviceGetCount_v2");
        _handle = (delegate* unmanaged[Cdecl]<uint, nint*, int>)F("nvmlDeviceGetHandleByIndex_v2");
        _name = (delegate* unmanaged[Cdecl]<nint, byte*, uint, int>)F("nvmlDeviceGetName");
        _util = (delegate* unmanaged[Cdecl]<nint, NvmlUtilization*, int>)F("nvmlDeviceGetUtilizationRates");
        _temp = (delegate* unmanaged[Cdecl]<nint, int, uint*, int>)F("nvmlDeviceGetTemperature");
        _power = (delegate* unmanaged[Cdecl]<nint, uint*, int>)F("nvmlDeviceGetPowerUsage");
        _powerLimit = (delegate* unmanaged[Cdecl]<nint, uint*, int>)F("nvmlDeviceGetEnforcedPowerLimit");
        _mem = (delegate* unmanaged[Cdecl]<nint, NvmlMemory*, int>)F("nvmlDeviceGetMemoryInfo");
        _memV2 = (delegate* unmanaged[Cdecl]<nint, NvmlMemoryV2*, int>)F("nvmlDeviceGetMemoryInfo_v2");
        _clock = (delegate* unmanaged[Cdecl]<nint, int, uint*, int>)F("nvmlDeviceGetClockInfo");
        _fan = (delegate* unmanaged[Cdecl]<nint, uint*, int>)F("nvmlDeviceGetFanSpeed");
        return true;
    }

    public int DeviceCount()
    {
        uint n;
        return _count(&n) == Success ? (int)n : 0;
    }

    public nint Handle(int index)
    {
        nint h;
        return _handle((uint)index, &h) == Success ? h : 0;
    }

    public string? Name(nint dev)
    {
        if (_name == null) return null;
        byte* b = stackalloc byte[96]; // NVML_DEVICE_NAME_V2_BUFFER_SIZE
        return _name(dev, b, 96) == Success ? Marshal.PtrToStringUTF8((nint)b) : null;
    }

    public double? Utilization(nint dev)
    {
        if (_util == null) return null;
        NvmlUtilization u;
        return _util(dev, &u) == Success ? u.Gpu : null;
    }

    public double? TemperatureC(nint dev)
    {
        if (_temp == null) return null;
        uint c;
        return _temp(dev, 0 /* NVML_TEMPERATURE_GPU */, &c) == Success ? c : null;
    }

    public double? PowerW(nint dev) => Milliwatts(_power, dev);
    public double? PowerLimitW(nint dev) => Milliwatts(_powerLimit, dev);

    private static double? Milliwatts(delegate* unmanaged[Cdecl]<nint, uint*, int> f, nint dev)
    {
        if (f == null) return null;
        uint mw;
        return f(dev, &mw) == Success ? Math.Round(mw / 1000.0, 1) : null;
    }

    /// <summary>(used, total) in bytes. v2 "used" excludes the driver reservation and matches Task Manager more closely.</summary>
    public (ulong Used, ulong Total)? Memory(nint dev)
    {
        if (_memV2 != null)
        {
            var m2 = new NvmlMemoryV2 { Version = (uint)sizeof(NvmlMemoryV2) | (2u << 24) };
            if (_memV2(dev, &m2) == Success && m2.Total > 0) return (m2.Used, m2.Total);
        }
        if (_mem == null) return null;
        NvmlMemory m;
        return _mem(dev, &m) == Success && m.Total > 0 ? (m.Used, m.Total) : null;
    }

    public double? ClockMhz(nint dev, int type)
    {
        if (_clock == null) return null;
        uint mhz;
        return _clock(dev, type, &mhz) == Success && mhz > 0 ? mhz : null;
    }

    /// <summary>Fan % (0-100+). Costs 260-300 µs (it goes to the hardware): poll every 5 s.</summary>
    public double? FanPct(nint dev)
    {
        if (_fan == null) return null;
        uint pct;
        return _fan(dev, &pct) == Success ? Math.Min(100, pct) : null;
    }

    public void Dispose()
    {
        if (_lib == 0) return;
        if (_shutdown != null) _shutdown();
        NativeLibrary.Free(_lib);
        _lib = 0;
    }
}
