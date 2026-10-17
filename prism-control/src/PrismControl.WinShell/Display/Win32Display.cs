using System.Runtime.InteropServices;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

/// <summary>
/// The real monitor reader: EnumDisplayMonitors (per-monitor-v2), QueryDisplayConfig + DisplayConfigGetDeviceInfo for names,
/// stable ids (the target's monitor device path) and true HDR state, EnumDisplaySettingsEx for modes. All reads.
/// Verified on this PC by WinPlayProbe "display" (windows-probe-results.md §2): 0.6 ms for the topology, &lt; 0.1 ms per GET.
/// </summary>
internal sealed unsafe class Win32DisplayReader : IDisplayReader
{
    private const uint QDC_ONLY_ACTIVE_PATHS = 2;
    private const int ENUM_CURRENT_SETTINGS = -1;
    private const int PathSize = 72, ModeSize = 64, DevModeSize = 220;

    private sealed record PathEntry(string Gdi, DisplayTarget Target, string Friendly, string DevicePath);

    [ThreadStatic] private static List<(nint H, MONITORINFOEXW Info)>? t_monitors;

    public bool HasHdrStateApi { get; } = Environment.OSVersion.Version.Build >= 26100;

    public IReadOnlyList<MonitorInfo> Monitors()
    {
        using var dpi = ThreadDpi.PerMonitorV2();
        var paths = Paths();
        var mons = t_monitors ??= [];
        mons.Clear();
        Native.EnumDisplayMonitors(0, 0, &MonitorCallback, 0);
        var result = new List<MonitorInfo>(mons.Count);
        foreach (var (h, mi) in mons)
        {
            var info = mi;
            var gdi = new string(info.szDevice);
            Native.GetDpiForMonitor(h, 0 /* MDT_EFFECTIVE_DPI */, out var dpiX, out _);
            var path = paths.FirstOrDefault(p => string.Equals(p.Gdi, gdi, StringComparison.OrdinalIgnoreCase));
            var hdr = path is null ? HdrState.Unknown : ReadHdr(path.Target);
            var id = path is { DevicePath.Length: > 0 } ? path.DevicePath : gdi;
            var name = path is { Friendly.Length: > 0 } ? path.Friendly : gdi.Replace(@"\\.\", "", StringComparison.Ordinal);
            result.Add(new MonitorInfo(id, name, gdi, h, info.rcMonitor.ToPixelRect(), info.rcWork.ToPixelRect(), (info.dwFlags & 1) != 0,
                (int)(dpiX == 0 ? 96 : dpiX), path?.Target, hdr, CurrentMode(gdi)));
        }
        mons.Clear();
        // Left to right, then top to bottom: the order the deck's monitor miniature uses.
        return result.OrderBy(m => m.Bounds.Left).ThenBy(m => m.Bounds.Top).ToList();
    }

    [UnmanagedCallersOnly]
    private static int MonitorCallback(nint h, nint dc, RECT* r, nint data)
    {
        var mi = new MONITORINFOEXW { cbSize = (uint)sizeof(MONITORINFOEXW) };
        if (Native.GetMonitorInfoW(h, &mi) != 0) t_monitors?.Add((h, mi));
        return 1;
    }

    private static List<PathEntry> Paths()
    {
        var list = new List<PathEntry>();
        var src = stackalloc byte[84];
        var tgt = stackalloc byte[420];
        for (var attempt = 0; attempt < 3; attempt++)
        {
            if (Native.GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out var np, out var nm) != 0) return list;
            var paths = new byte[np * PathSize];
            var modes = new byte[nm * ModeSize];
            fixed (byte* p = paths) fixed (byte* m = modes)
            {
                var hr = Native.QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref np, p, ref nm, m, 0);
                if (hr == 122 /* ERROR_INSUFFICIENT_BUFFER: the topology changed in between */) continue;
                if (hr != 0) return list;
                for (var i = 0; i < np; i++)
                {
                    var pi = p + i * PathSize;
                    var srcLo = *(uint*)(pi + 0); var srcHi = *(int*)(pi + 4); var srcId = *(uint*)(pi + 8);
                    var tgtLo = *(uint*)(pi + 20); var tgtHi = *(int*)(pi + 24); var tgtId = *(uint*)(pi + 28);
                    Header(src, 1, 84, srcLo, srcHi, srcId);
                    if (Native.DisplayConfigGetDeviceInfo(src) != 0) continue;
                    var gdi = new string((char*)(src + 20));
                    Header(tgt, 2, 420, tgtLo, tgtHi, tgtId);
                    string friendly = "", devicePath = "";
                    if (Native.DisplayConfigGetDeviceInfo(tgt) == 0)
                    {
                        friendly = new string((char*)(tgt + 36));
                        devicePath = new string((char*)(tgt + 164));
                    }
                    list.Add(new PathEntry(gdi, new DisplayTarget(tgtLo, tgtHi, tgtId), friendly, devicePath));
                }
            }
            return list;
        }
        return list;
    }

    internal static void Header(byte* b, uint type, uint size, uint luidLo, int luidHi, uint id)
    {
        new Span<byte>(b, (int)size).Clear();
        *(uint*)(b + 0) = type; *(uint*)(b + 4) = size; *(uint*)(b + 8) = luidLo; *(int*)(b + 12) = luidHi; *(uint*)(b + 16) = id;
    }

    public HdrState ReadHdr(DisplayTarget t)
    {
        // 24H2+: DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2 (15). Bits: 0 advancedColorSupported, 1 active, 3 limitedByPolicy,
        // 4 highDynamicRangeSupported, 5 highDynamicRangeUserEnabled; activeColorMode at +32 (0 SDR, 1 WCG, 2 HDR).
        var ac2 = stackalloc byte[36];
        Header(ac2, 15, 36, t.AdapterLow, t.AdapterHigh, t.TargetId);
        if (Native.DisplayConfigGetDeviceInfo(ac2) == 0)
        {
            var v = *(uint*)(ac2 + 20);
            var mode = *(uint*)(ac2 + 32);
            return new HdrState((v & 16) != 0, mode == 2, (v & 8) != 0);
        }
        // Older builds: DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO (9): 0 supported, 1 enabled, 2 wideColorEnforced, 3 forceDisabled.
        var ac = stackalloc byte[32];
        Header(ac, 9, 32, t.AdapterLow, t.AdapterHigh, t.TargetId);
        if (Native.DisplayConfigGetDeviceInfo(ac) == 0)
        {
            var v = *(uint*)(ac + 20);
            var enforced = (v & 4) != 0;
            return new HdrState((v & 1) != 0 && !enforced, (v & 2) != 0 && !enforced, (v & 8) != 0);
        }
        return HdrState.Unknown;
    }

    public DisplayMode? CurrentMode(string gdiName)
    {
        var dm = stackalloc byte[DevModeSize];
        return ReadDevMode(gdiName, ENUM_CURRENT_SETTINGS, dm) ? ModeOf(dm) : null;
    }

    public IReadOnlyList<DisplayMode> Modes(string gdiName)
    {
        var set = new HashSet<DisplayMode>();
        var dm = stackalloc byte[DevModeSize];
        for (var i = 0; i < 4096; i++)
        {
            if (!ReadDevMode(gdiName, i, dm)) break;
            var m = ModeOf(dm);
            if (m.Bpp == 32 && m.Hz > 1) set.Add(m);
        }
        return set.OrderByDescending(m => (long)m.Width * m.Height).ThenByDescending(m => m.Width).ThenByDescending(m => m.Hz).ToList();
    }

    internal static bool ReadDevMode(string gdi, int index, byte* dm)
    {
        new Span<byte>(dm, DevModeSize).Clear();
        *(ushort*)(dm + 68) = DevModeSize;
        return Native.EnumDisplaySettingsExW(gdi, index, dm, 0) != 0;
    }

    internal static DisplayMode ModeOf(byte* dm) =>
        new((int)*(uint*)(dm + 172), (int)*(uint*)(dm + 176), (int)*(uint*)(dm + 184), (int)*(uint*)(dm + 168));

}

/// <summary>The real display writer (HDR and modes). Never constructed in safe mode.</summary>
internal sealed unsafe class Win32DisplayWriter : IDisplayWriter
{
    private const uint CDS_UPDATEREGISTRY = 0x1, CDS_TEST = 0x2;
    private const uint DM_BITSPERPEL = 0x40000, DM_PELSWIDTH = 0x80000, DM_PELSHEIGHT = 0x100000, DM_DISPLAYFREQUENCY = 0x400000;

    public int SetHdr(DisplayTarget t, bool on, bool useHdrStateApi)
    {
        var packet = stackalloc byte[24];
        Win32DisplayReader.Header(packet, useHdrStateApi ? 16u : 10u, 24, t.AdapterLow, t.AdapterHigh, t.TargetId);
        *(uint*)(packet + 20) = on ? 1u : 0u;
        return Native.DisplayConfigSetDeviceInfo(packet);
    }

    public ModeChangeResult TestMode(string gdiName, DisplayMode mode) => Change(gdiName, mode, CDS_TEST);

    public ModeChangeResult ApplyMode(string gdiName, DisplayMode mode, bool persist) => Change(gdiName, mode, persist ? CDS_UPDATEREGISTRY : 0);

    private static ModeChangeResult Change(string gdi, DisplayMode mode, uint flags)
    {
        var dm = stackalloc byte[220];
        // Start from the current settings so position, orientation and output stay as they are.
        if (!Win32DisplayReader.ReadDevMode(gdi, -1, dm)) return ModeChangeResult.BadParam;
        *(uint*)(dm + 168) = (uint)mode.Bpp;
        *(uint*)(dm + 172) = (uint)mode.Width;
        *(uint*)(dm + 176) = (uint)mode.Height;
        *(uint*)(dm + 184) = (uint)mode.Hz;
        *(uint*)(dm + 72) = DM_BITSPERPEL | DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;
        return (ModeChangeResult)Native.ChangeDisplaySettingsExW(gdi, dm, 0, flags, 0);
    }
}
