using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

/// <summary>MCCS VCP codes used here.</summary>
public static class Vcp
{
    public const byte Brightness = 0x10;
    public const byte Contrast = 0x12;
    public const byte InputSource = 0x60;
    public const byte Volume = 0x62;
    public const byte Power = 0xD6;

    public static string Name(byte code) => code switch
    {
        Brightness => "Brightness",
        Contrast => "Contrast",
        InputSource => "Input",
        Volume => "Volume",
        Power => "Power",
        _ => $"VCP {code:X2}",
    };

    /// <summary>MCCS 2.2 input-source values (VCP 60), low byte. Unknown values show as "Input 0x1A".</summary>
    public static string InputName(uint value) => (value & 0xFF) switch
    {
        0x01 => "VGA 1", 0x02 => "VGA 2", 0x03 => "DVI 1", 0x04 => "DVI 2",
        0x05 => "Composite 1", 0x06 => "Composite 2", 0x07 => "S-Video 1", 0x08 => "S-Video 2",
        0x09 => "Tuner 1", 0x0A => "Tuner 2", 0x0B => "Tuner 3",
        0x0C => "Component 1", 0x0D => "Component 2", 0x0E => "Component 3",
        0x0F => "DisplayPort 1", 0x10 => "DisplayPort 2", 0x11 => "HDMI 1", 0x12 => "HDMI 2",
        0x1B => "USB-C",
        var v => string.Create(CultureInfo.InvariantCulture, $"Input 0x{v:X2}"),
    };

    /// <summary>A short form for keys ("DP 1", "HDMI 2").</summary>
    public static string InputShort(uint value) => (value & 0xFF) switch
    {
        >= 0x01 and <= 0x12 or 0x1B => InputName(value).Replace("DisplayPort", "DP", StringComparison.Ordinal).Replace("Component", "Comp", StringComparison.Ordinal).Replace("Composite", "Comp", StringComparison.Ordinal),
        var v => string.Create(CultureInfo.InvariantCulture, $"IN {v:X2}"),
    };
}

public readonly record struct VcpReading(uint Current, uint Max);

/// <summary>One physical monitor (dxva2 handle) behind an HMONITOR. Owned by the bus; closed on topology change.</summary>
public sealed class DdcHandle(string monitorId, nint hmonitor, nint physical, string description)
{
    public string MonitorId { get; } = monitorId;
    public nint HMonitor { get; } = hmonitor;
    public nint Physical { get; } = physical;
    public string Description { get; } = description;
    public bool Closed { get; internal set; }
}

/// <summary>DDC/CI reads (GET and the capabilities request). Each call is a 54–121 ms I2C round trip on this PC.</summary>
public interface IDdcBus
{
    DdcHandle? Open(MonitorInfo monitor);
    void Close(DdcHandle handle);
    VcpReading? Get(DdcHandle handle, byte code, out int error);
    string? Capabilities(DdcHandle handle, out int error);
}

/// <summary>DDC/CI writes (SetVCPFeature). Gated: safe mode uses <see cref="SafeDdcWriter"/>.</summary>
public interface IDdcWriter
{
    bool Set(DdcHandle handle, byte code, uint value, out int error);
}

/// <summary>Parsed MCCS capabilities string: supported VCP codes and the input-source list.</summary>
public sealed record DdcCapabilities(string? Model, IReadOnlySet<byte> Codes, IReadOnlyList<uint> Inputs, string? MccsVersion)
{
    public bool Supports(byte code) => Codes.Contains(code);

    public static DdcCapabilities Parse(string caps)
    {
        string? model = Group(caps, "model(");
        string? mccs = Group(caps, "mccs_ver(");
        var codes = new HashSet<byte>();
        var inputs = new List<uint>();
        var vcp = Group(caps, "vcp(");
        if (vcp is not null)
        {
            var i = 0;
            byte? last = null;
            while (i < vcp.Length)
            {
                var c = vcp[i];
                if (c == '(')
                {
                    var depth = 1;
                    var start = i + 1;
                    i++;
                    while (i < vcp.Length && depth > 0)
                    {
                        if (vcp[i] == '(') depth++;
                        else if (vcp[i] == ')') depth--;
                        i++;
                    }
                    if (last == Vcp.InputSource)
                    {
                        var inner = vcp[start..Math.Max(start, i - 1)];
                        foreach (var tok in inner.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                            if (uint.TryParse(tok, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var v) && !inputs.Contains(v)) inputs.Add(v);
                    }
                    continue;
                }
                if (Uri.IsHexDigit(c))
                {
                    var start = i;
                    while (i < vcp.Length && Uri.IsHexDigit(vcp[i])) i++;
                    if (byte.TryParse(vcp.AsSpan(start, i - start), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var code))
                    {
                        codes.Add(code);
                        last = code;
                    }
                    continue;
                }
                i++;
            }
        }
        return new DdcCapabilities(model, codes, inputs, mccs);
    }

    /// <summary>The balanced-parenthesis group after <paramref name="tag"/> (e.g. "vcp(").</summary>
    private static string? Group(string s, string tag)
    {
        var i = s.IndexOf(tag, StringComparison.OrdinalIgnoreCase);
        if (i < 0) return null;
        var start = i + tag.Length;
        var depth = 1;
        for (var j = start; j < s.Length; j++)
        {
            if (s[j] == '(') depth++;
            else if (s[j] == ')' && --depth == 0) return s[start..j];
        }
        return s[start..];
    }
}

/// <summary>The real dxva2 bus. Verified read-only on this PC: all three monitors answer GETs (probe "ddc").</summary>
internal sealed unsafe class Win32DdcBus : IDdcBus
{
    public DdcHandle? Open(MonitorInfo monitor)
    {
        if (Native.GetNumberOfPhysicalMonitorsFromHMONITOR(monitor.Handle, out var n) == 0 || n == 0) return null;
        var arr = stackalloc PHYSICAL_MONITOR[(int)Math.Min(n, 8)];
        if (Native.GetPhysicalMonitorsFromHMONITOR(monitor.Handle, Math.Min(n, 8), arr) == 0) return null;
        // One physical monitor per HMONITOR in practice; keep the first, release the rest.
        for (var i = 1; i < Math.Min(n, 8); i++) Native.DestroyPhysicalMonitors(1, &arr[i]);
        return new DdcHandle(monitor.Id, monitor.Handle, arr[0].hPhysicalMonitor, new string(arr[0].szPhysicalMonitorDescription));
    }

    public void Close(DdcHandle handle)
    {
        if (handle.Closed) return;
        handle.Closed = true;
        var pm = new PHYSICAL_MONITOR { hPhysicalMonitor = handle.Physical };
        Native.DestroyPhysicalMonitors(1, &pm);
    }

    public VcpReading? Get(DdcHandle handle, byte code, out int error)
    {
        error = 0;
        if (handle.Closed) { error = -1; return null; }
        if (Native.GetVCPFeatureAndVCPFeatureReply(handle.Physical, code, out _, out var cur, out var max) != 0) return new VcpReading(cur, max);
        error = Marshal.GetLastPInvokeError();
        return null;
    }

    public string? Capabilities(DdcHandle handle, out int error)
    {
        error = 0;
        if (handle.Closed) { error = -1; return null; }
        if (Native.GetCapabilitiesStringLength(handle.Physical, out var len) == 0 || len == 0 || len > 16384)
        {
            error = Marshal.GetLastPInvokeError();
            return null;
        }
        var buf = new byte[len];
        fixed (byte* b = buf)
        {
            if (Native.CapabilitiesRequestAndCapabilitiesReply(handle.Physical, b, len) == 0)
            {
                error = Marshal.GetLastPInvokeError();
                return null;
            }
        }
        return Encoding.ASCII.GetString(buf).TrimEnd('\0');
    }
}

/// <summary>The real DDC writer (SetVCPFeature). Never constructed in safe mode.</summary>
internal sealed class Win32DdcWriter : IDdcWriter
{
    public bool Set(DdcHandle handle, byte code, uint value, out int error)
    {
        error = 0;
        if (handle.Closed) { error = -1; return false; }
        if (Native.SetVCPFeature(handle.Physical, code, value) != 0) return true;
        error = Marshal.GetLastPInvokeError();
        return false;
    }
}
