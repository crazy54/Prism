using System.Globalization;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

/// <summary>The DisplayConfig address of a monitor path's target (adapter LUID + target id).</summary>
public readonly record struct DisplayTarget(uint AdapterLow, int AdapterHigh, uint TargetId);

/// <summary>True HDR state from DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2 (24H2+) or _INFO (older builds).</summary>
public sealed record HdrState(bool Supported, bool On, bool LimitedByPolicy = false)
{
    public static readonly HdrState Unknown = new(false, false);
}

/// <summary>A display mode (32 bpp). <see cref="Hz"/> is DEVMODE's integer frequency (239.984 Hz reads as 240).</summary>
public sealed record DisplayMode(int Width, int Height, int Hz, int Bpp = 32)
{
    public override string ToString() => string.Create(CultureInfo.InvariantCulture, $"{Width}x{Height} @ {Hz} Hz");
}

/// <summary>One active monitor, read on a per-monitor-v2 thread (physical pixels).</summary>
public sealed record MonitorInfo(
    string Id,
    string Name,
    string GdiName,
    nint Handle,
    PixelRect Bounds,
    PixelRect WorkArea,
    bool IsPrimary,
    int Dpi,
    DisplayTarget? Target,
    HdrState Hdr,
    DisplayMode? Mode)
{
    /// <summary>A short model name for keys: the last token with a digit ("ROG Swift PG34WCDM" → "PG34WCDM").</summary>
    public string ShortName => ShortModel(Name, GdiName);

    public int ScalePercent => Dpi <= 0 ? 100 : Dpi * 100 / 96;

    public static string ShortModel(string name, string gdiName)
    {
        var tokens = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        for (var i = tokens.Length - 1; i >= 0; i--)
            if (tokens[i].Any(char.IsDigit) && tokens[i].Length >= 3) return tokens[i];
        if (!string.IsNullOrWhiteSpace(name) && name.Length <= 12) return name;
        var n = gdiName.Replace(@"\\.\", "", StringComparison.Ordinal);
        return n.StartsWith("DISPLAY", StringComparison.OrdinalIgnoreCase) ? "Display " + n[7..] : n;
    }
}

/// <summary>ChangeDisplaySettingsEx results (DISP_CHANGE_*).</summary>
public enum ModeChangeResult
{
    Successful = 0,
    Restart = 1,
    Failed = -1,
    BadMode = -2,
    NotUpdated = -3,
    BadFlags = -4,
    BadParam = -5,
    BadDualView = -6,
    /// <summary>Safe mode: nothing was changed.</summary>
    SafeMode = 100,
}

/// <summary>Monitor reads: topology, HDR, current mode (cheap, &lt; 2 ms) and the mode list (130–195 ms: cache it).</summary>
public interface IDisplayReader
{
    IReadOnlyList<MonitorInfo> Monitors();
    IReadOnlyList<DisplayMode> Modes(string gdiName);
    DisplayMode? CurrentMode(string gdiName);
    HdrState ReadHdr(DisplayTarget target);
    /// <summary>True on Windows 11 24H2+ (build 26100), where SET_HDR_STATE (16) exists.</summary>
    bool HasHdrStateApi { get; }
}

/// <summary>Display writes. Gated: in safe mode the module uses <see cref="SafeDisplayWriter"/>.</summary>
public interface IDisplayWriter
{
    /// <summary>DisplayConfigSetDeviceInfo SET_HDR_STATE (16) on 24H2+, else SET_ADVANCED_COLOR_STATE (10). Returns a Win32 status (0 = ok).</summary>
    int SetHdr(DisplayTarget target, bool on, bool useHdrStateApi);
    /// <summary>ChangeDisplaySettingsEx with CDS_TEST: asks the driver, changes nothing.</summary>
    ModeChangeResult TestMode(string gdiName, DisplayMode mode);
    /// <summary>Applies a mode. <paramref name="persist"/> = CDS_UPDATEREGISTRY (only after the user pressed Keep).</summary>
    ModeChangeResult ApplyMode(string gdiName, DisplayMode mode, bool persist);
}
