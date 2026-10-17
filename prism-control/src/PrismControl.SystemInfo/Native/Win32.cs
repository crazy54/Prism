// P/Invoke declarations for system telemetry (LibraryImport = source-generated, trim/AOT safe).
// Every call here is READ-ONLY and works without admin rights (research/windows.md §2).
using System.Runtime.InteropServices;

namespace PrismControl.SystemInfo.Native;

[StructLayout(LayoutKind.Sequential)]
internal struct MEMORYSTATUSEX // 64 bytes
{
    public uint dwLength, dwMemoryLoad;
    public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
}

[StructLayout(LayoutKind.Explicit, Size = 16)]
internal struct PDH_FMT_COUNTERVALUE
{
    [FieldOffset(0)] public uint CStatus;
    [FieldOffset(8)] public double doubleValue;
}

[StructLayout(LayoutKind.Sequential)]
internal struct PDH_FMT_COUNTERVALUE_ITEM_W // 24 bytes
{
    public nint szName;
    public PDH_FMT_COUNTERVALUE FmtValue;
}

/// <summary>netioapi.h MIB_IF_ROW2: 1352 bytes on x64, InOctets at offset 1208 (asserted by a test).</summary>
[StructLayout(LayoutKind.Sequential)]
internal unsafe struct MIB_IF_ROW2
{
    public ulong InterfaceLuid;
    public uint InterfaceIndex;
    public Guid InterfaceGuid;
    public fixed char Alias[257];
    public fixed char Description[257];
    public uint PhysicalAddressLength;
    public fixed byte PhysicalAddress[32];
    public fixed byte PermanentPhysicalAddress[32];
    public uint Mtu;
    /// <summary>IFTYPE: 6 ethernet, 71 wifi, 24 loopback, 131 tunnel, 53 proprietary virtual.</summary>
    public uint Type;
    public int TunnelType, MediaType, PhysicalMediumType, AccessType, DirectionType;
    /// <summary>bit0 HardwareInterface, bit1 FilterInterface, bit2 ConnectorPresent, ...</summary>
    public byte InterfaceAndOperStatusFlags;
    /// <summary>1 = IfOperStatusUp.</summary>
    public int OperStatus;
    public int AdminStatus, MediaConnectState;
    public Guid NetworkGuid;
    public int ConnectionType;
    public ulong TransmitLinkSpeed, ReceiveLinkSpeed;
    public ulong InOctets, InUcastPkts, InNUcastPkts, InDiscards, InErrors, InUnknownProtos, InUcastOctets, InMulticastOctets, InBroadcastOctets;
    public ulong OutOctets, OutUcastPkts, OutNUcastPkts, OutDiscards, OutErrors, OutUcastOctets, OutMulticastOctets, OutBroadcastOctets, OutQLen;
}

[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_ADAPTERINFO // 20 bytes
{
    public uint hAdapter;
    public uint LuidLow;
    public int LuidHigh;
    public uint NumOfSources;
    public int bPrecisePresentRegionsPreferred;
}

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct D3DKMT_ENUMADAPTERS2 { public uint NumAdapters; public D3DKMT_ADAPTERINFO* pAdapters; }

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct D3DKMT_QUERYADAPTERINFO { public uint hAdapter; public int Type; public void* pPrivateDriverData; public uint PrivateDriverDataSize; }

/// <summary>KMTQAITYPE_ADAPTERPERFDATA = 62 (64 bytes).</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_ADAPTER_PERFDATA
{
    public uint PhysicalAdapterIndex;
    public ulong MemoryFrequency, MaxMemoryFrequency, MaxMemoryFrequencyOC, MemoryBandwidth, PCIEBandwidth;
    public uint FanRPM;
    /// <summary>Tenths of a percent of max. Does not track NVML watts (research §2.6), so it is never reported.</summary>
    public uint Power;
    /// <summary>Deci-Celsius.</summary>
    public uint Temperature;
    public byte PowerStateOverride;
}

/// <summary>KMTQAITYPE_ADAPTERPERFDATA_CAPS = 63.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_ADAPTER_PERFDATACAPS
{
    public uint PhysicalAdapterIndex;
    public ulong MaxMemoryBandwidth, MaxPCIEBandwidth;
    public uint MaxFanRPM, TemperatureMax, TemperatureWarning;
}

/// <summary>KMTQAITYPE_NODEPERFDATA = 61 (56 bytes).</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_NODE_PERFDATA
{
    public uint NodeOrdinal, PhysicalAdapterIndex;
    public ulong Frequency, MaxFrequency, MaxFrequencyOC;
    public uint Voltage, VoltageMax, VoltageMaxOC;
    public ulong MaxTransitionLatency;
}

/// <summary>KMTQAITYPE_PHYSICALADAPTERDEVICEIDS = 31.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_QUERY_DEVICE_IDS
{
    public uint PhysicalAdapterIndex;
    public uint VendorID, DeviceID, SubVendorID, SubSystemID, RevisionID, BusType;
}

/// <summary>KMTQAITYPE_GETSEGMENTSIZE = 3.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct D3DKMT_SEGMENTSIZEINFO
{
    public ulong DedicatedVideoMemorySize, DedicatedSystemMemorySize, SharedSystemMemorySize;
}

[StructLayout(LayoutKind.Sequential)]
internal struct MEMORY_BASIC_INFORMATION // 48 bytes on x64
{
    public nint BaseAddress;
    public nint AllocationBase;
    public uint AllocationProtect;
    public ushort PartitionId;
    public nuint RegionSize;
    public uint State;
    public uint Protect;
    public uint Type;
}

internal static unsafe partial class Win32
{
    // ------------------------------------------------------------------ kernel32
    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX m);

    public const ushort ALL_PROCESSOR_GROUPS = 0xffff;

    [LibraryImport("kernel32.dll")]
    public static partial uint GetActiveProcessorCount(ushort groupNumber);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetLogicalProcessorInformationEx(int relationship, void* buffer, ref uint returnedLength);

    public const uint FILE_MAP_READ = 0x0004;

    [LibraryImport("kernel32.dll", EntryPoint = "OpenFileMappingW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint OpenFileMapping(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, string name);

    [LibraryImport("kernel32.dll", EntryPoint = "CreateFileMappingW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint CreateFileMapping(nint file, nint attributes, uint protect, uint sizeHigh, uint sizeLow, string? name);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    public static partial void* MapViewOfFile(nint mapping, uint access, uint offsetHigh, uint offsetLow, nuint bytes);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool UnmapViewOfFile(void* address);

    [LibraryImport("kernel32.dll")]
    public static partial nuint VirtualQuery(void* address, MEMORY_BASIC_INFORMATION* buffer, nuint length);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(nint handle);

    // ------------------------------------------------------------------ PDH
    public const uint PDH_FMT_DOUBLE = 0x200, PDH_FMT_NOCAP100 = 0x8000;
    public const int PDH_MORE_DATA = unchecked((int)0x800007D2);
    public const uint PDH_CSTATUS_VALID_DATA = 0, PDH_CSTATUS_NEW_DATA = 1;

    [LibraryImport("pdh.dll", EntryPoint = "PdhOpenQueryW", StringMarshalling = StringMarshalling.Utf16)]
    public static partial int PdhOpenQuery(string? dataSource, nint userData, out nint query);

    [LibraryImport("pdh.dll", EntryPoint = "PdhAddEnglishCounterW", StringMarshalling = StringMarshalling.Utf16)]
    public static partial int PdhAddEnglishCounter(nint query, string path, nint userData, out nint counter);

    [LibraryImport("pdh.dll")]
    public static partial int PdhRemoveCounter(nint counter);

    [LibraryImport("pdh.dll")]
    public static partial int PdhCollectQueryData(nint query);

    [LibraryImport("pdh.dll")]
    public static partial int PdhGetFormattedCounterValue(nint counter, uint format, out uint type, out PDH_FMT_COUNTERVALUE value);

    [LibraryImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterArrayW")]
    public static partial int PdhGetFormattedCounterArray(nint counter, uint format, ref uint bufferSize, out uint itemCount, void* items);

    [LibraryImport("pdh.dll")]
    public static partial int PdhCloseQuery(nint query);

    // ------------------------------------------------------------------ IP Helper
    [LibraryImport("iphlpapi.dll")]
    public static partial int GetIfTable2(out nint table);

    [LibraryImport("iphlpapi.dll")]
    public static partial void FreeMibTable(nint table);

    [LibraryImport("iphlpapi.dll")]
    public static partial int GetIfEntry2(MIB_IF_ROW2* row);

    /// <summary>Routing-table lookup only; sends no packets.</summary>
    [LibraryImport("iphlpapi.dll")]
    public static partial int GetBestInterface(uint destAddrNetworkOrder, out uint bestIfIndex);

    /// <summary>For IPv6-only networks: <paramref name="sockaddr"/> is a SOCKADDR_IN6.</summary>
    [LibraryImport("iphlpapi.dll")]
    public static partial int GetBestInterfaceEx(void* sockaddr, out uint bestIfIndex);

    // ------------------------------------------------------------------ D3DKMT (gdi32, no admin)
    public const int KMTQAITYPE_GETSEGMENTSIZE = 3, KMTQAITYPE_ADAPTERREGISTRYINFO = 8, KMTQAITYPE_ADAPTERTYPE = 15,
        KMTQAITYPE_PHYSICALADAPTERDEVICEIDS = 31, KMTQAITYPE_ADAPTERREGISTRYINFO_RENDER = 54,
        KMTQAITYPE_NODEPERFDATA = 61, KMTQAITYPE_ADAPTERPERFDATA = 62, KMTQAITYPE_ADAPTERPERFDATA_CAPS = 63;

    [LibraryImport("gdi32.dll")]
    public static partial int D3DKMTEnumAdapters2(D3DKMT_ENUMADAPTERS2* p);

    [LibraryImport("gdi32.dll")]
    public static partial int D3DKMTQueryAdapterInfo(D3DKMT_QUERYADAPTERINFO* p);

    /// <summary>D3DKMT_CLOSEADAPTER is { D3DKMT_HANDLE hAdapter; }.</summary>
    [LibraryImport("gdi32.dll")]
    public static partial int D3DKMTCloseAdapter(uint* hAdapter);

    public static int QueryAdapter(uint hAdapter, int type, void* data, uint size)
    {
        var q = new D3DKMT_QUERYADAPTERINFO { hAdapter = hAdapter, Type = type, pPrivateDriverData = data, PrivateDriverDataSize = size };
        return D3DKMTQueryAdapterInfo(&q);
    }
}
