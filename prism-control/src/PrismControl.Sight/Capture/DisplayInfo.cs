using System.Runtime.InteropServices;

namespace PrismControl.Sight.Capture;

/// <summary>A monitor's color state, read-only (QueryDisplayConfig + DisplayConfigGetDeviceInfo; nothing is ever set).</summary>
public sealed record MonitorColor(string GdiName, bool AdvancedColorSupported, bool AdvancedColorEnabled, double SdrWhiteNits, int BitsPerColor)
{
    /// <summary>scRGB value of SDR white on this output (1.0 when advanced color is off).</summary>
    public double SdrWhiteScRgb => AdvancedColorEnabled ? SdrWhiteNits / 80.0 : 1.0;
}

/// <summary>
/// HDR state per monitor. Cheap (QueryDisplayConfig ≈ 0.6 ms, each GET &lt; 0.1 ms on this PC), so it is re-read when the
/// target window changes monitor and every few seconds, never per frame.
/// </summary>
public static unsafe partial class DisplayInfo
{
    private const uint QDC_ONLY_ACTIVE_PATHS = 2;
    private const int PathSize = 72, ModeSize = 64;

    /// <summary>The color state of the monitor <paramref name="hmonitor"/>, or null if it cannot be read.</summary>
    public static MonitorColor? ForMonitor(nint hmonitor)
    {
        var name = GdiName(hmonitor);
        return name is null ? null : All().FirstOrDefault(m => string.Equals(m.GdiName, name, StringComparison.OrdinalIgnoreCase));
    }

    public static MonitorColor? ForWindow(nint hwnd) => ForMonitor(MonitorFromWindow(hwnd, 2 /* NEAREST */));

    public static IReadOnlyList<MonitorColor> All()
    {
        var list = new List<MonitorColor>();
        if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out var np, out var nm) != 0) return list;
        var paths = new byte[np * PathSize];
        var modes = new byte[nm * ModeSize];
        var src = stackalloc byte[84];   // DISPLAYCONFIG_SOURCE_DEVICE_NAME
        var ac = stackalloc byte[32];    // DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO
        var sw = stackalloc byte[24];    // DISPLAYCONFIG_SDR_WHITE_LEVEL
        fixed (byte* pp = paths, pm = modes)
        {
            if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref np, pp, ref nm, pm, 0) != 0) return list;
            for (var i = 0; i < np; i++)
            {
                var path = pp + i * PathSize;
                // DISPLAYCONFIG_PATH_SOURCE_INFO { LUID adapterId; UINT32 id; ... } at 0; TARGET_INFO { LUID; UINT32 id; ... } at 20.
                var srcLuid = *(long*)path;
                var srcId = *(uint*)(path + 8);
                var tgtLuid = *(long*)(path + 20);
                var tgtId = *(uint*)(path + 28);

                new Span<byte>(src, 84).Clear();
                *(int*)src = 1; *(int*)(src + 4) = 84; *(long*)(src + 8) = srcLuid; *(uint*)(src + 16) = srcId;
                if (DisplayConfigGetDeviceInfo(src) != 0) continue;
                var gdi = new string((char*)(src + 20)).TrimEnd('\0');

                new Span<byte>(ac, 32).Clear();
                *(int*)ac = 9; *(int*)(ac + 4) = 32; *(long*)(ac + 8) = tgtLuid; *(uint*)(ac + 16) = tgtId;
                bool supported = false, enabled = false;
                var bpc = 8;
                if (DisplayConfigGetDeviceInfo(ac) == 0)
                {
                    var bits = *(uint*)(ac + 20);
                    supported = (bits & 1) != 0;
                    enabled = (bits & 2) != 0 && (bits & 8) == 0;   // enabled and not force-disabled
                    bpc = (int)*(uint*)(ac + 28);
                }
                new Span<byte>(sw, 24).Clear();
                *(int*)sw = 11; *(int*)(sw + 4) = 24; *(long*)(sw + 8) = tgtLuid; *(uint*)(sw + 16) = tgtId;
                var nits = 80.0;
                if (DisplayConfigGetDeviceInfo(sw) == 0) nits = *(uint*)(sw + 20) / 1000.0 * 80.0;
                list.Add(new MonitorColor(gdi, supported, enabled, nits, bpc));
            }
        }
        return list;
    }

    private static string? GdiName(nint hmonitor)
    {
        var mi = stackalloc byte[104];   // MONITORINFOEXW
        new Span<byte>(mi, 104).Clear();
        *(int*)mi = 104;
        if (GetMonitorInfoW(hmonitor, mi) == 0) return null;
        return new string((char*)(mi + 40)).TrimEnd('\0');
    }

    [LibraryImport("user32.dll")] private static partial int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [LibraryImport("user32.dll")] private static partial int QueryDisplayConfig(uint flags, ref uint paths, byte* pathArray, ref uint modes, byte* modeArray, nint topology);
    [LibraryImport("user32.dll")] private static partial int DisplayConfigGetDeviceInfo(byte* packet);
    [LibraryImport("user32.dll")] private static partial int GetMonitorInfoW(nint hmonitor, byte* info);
    [LibraryImport("user32.dll")] internal static partial nint MonitorFromWindow(nint hwnd, uint flags);
}
