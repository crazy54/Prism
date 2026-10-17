using System.Collections.Concurrent;
using PrismControl.Core.Hosting;

namespace PrismControl.WinShell.Display;

/// <summary>Safe-mode writers expose what they "applied", so the in-memory model responds as if it worked.</summary>
public interface IDisplayOverlay
{
    bool? HdrOverride(DisplayTarget target);
    DisplayMode? ModeOverride(string gdiName);
}

public interface IDdcOverlay
{
    bool TryGet(string monitorId, byte code, out uint value);
}

/// <summary>
/// Safe mode: HDR and mode changes are logged and remembered, never applied. TestMode does not even call CDS_TEST
/// (it accepts any mode the reader listed), so nothing reaches the driver.
/// </summary>
public sealed class SafeDisplayWriter(ILog log) : IDisplayWriter, IDisplayOverlay
{
    private readonly ConcurrentDictionary<DisplayTarget, bool> _hdr = new();
    private readonly ConcurrentDictionary<string, DisplayMode> _modes = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentQueue<string> _writes = new();

    public IReadOnlyList<string> Writes => [.. _writes];

    public int SetHdr(DisplayTarget target, bool on, bool useHdrStateApi)
    {
        _hdr[target] = on;
        Record($"would turn HDR {(on ? "on" : "off")} (type {(useHdrStateApi ? 16 : 10)})");
        return 0;
    }

    public ModeChangeResult TestMode(string gdiName, DisplayMode mode)
    {
        Record($"would test {mode}");
        return ModeChangeResult.Successful;
    }

    public ModeChangeResult ApplyMode(string gdiName, DisplayMode mode, bool persist)
    {
        _modes[gdiName] = mode;
        Record($"would apply {mode}{(persist ? " and save it" : "")}");
        return ModeChangeResult.Successful;
    }

    public bool? HdrOverride(DisplayTarget target) => _hdr.TryGetValue(target, out var on) ? on : null;
    public DisplayMode? ModeOverride(string gdiName) => _modes.TryGetValue(gdiName, out var m) ? m : null;

    private void Record(string what)
    {
        _writes.Enqueue(what);
        log.Info("[safe mode] " + what);
    }
}

/// <summary>Safe mode: DDC/CI SETs are logged and remembered (keys and dials show the value), never sent to a monitor.</summary>
public sealed class SafeDdcWriter(ILog log) : IDdcWriter, IDdcOverlay
{
    private readonly ConcurrentDictionary<(string, byte), uint> _values = new();
    private readonly ConcurrentQueue<string> _writes = new();

    public IReadOnlyList<string> Writes => [.. _writes];

    public bool Set(DdcHandle handle, byte code, uint value, out int error)
    {
        error = 0;
        _values[(handle.MonitorId, code)] = value;
        _writes.Enqueue($"{Vcp.Name(code)}={value}");
        log.Info($"[safe mode] would set {Vcp.Name(code)} to {value}");
        return true;
    }

    public bool TryGet(string monitorId, byte code, out uint value) => _values.TryGetValue((monitorId, code), out value);
}
