using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Actions;

internal static class TempForm
{
    public const string Explanation =
        "Windows has no CPU temperature reading that apps can use without administrator rights. Prism Control reads it from " +
        "LibreHardwareMonitor (Options > Remote Web Server > Run; port 8085 by default) or HWiNFO (Settings > Shared Memory Support). " +
        "In Automatic, when neither runs, it uses iCUE's CPU package sensor through the Cooling module, and says so. " +
        "Without any of them the temperature shows a dash. The integrated GPU's sensor is never shown as the CPU's.";

    public static PiForm Add(PiForm form) => form
        .Heading("CPU temperature")
        .Select("cpuTempSource", "Source", [("auto", "Automatic (LibreHardwareMonitor, then HWiNFO, then iCUE)"), ("lhm", "LibreHardwareMonitor"), ("hwinfo", "HWiNFO"), ("off", "Off")])
        .Number("lhmPort", "LHM web server port", 1, 65535, 1)
        .Info("Status", stateKey: "tempStatus")
        .Info("How it works", text: Explanation);

    public static object State(ITelemetry? t) => new { tempStatus = t?.CpuTemp.Message ?? "Telemetry is not running." };
}

/// <summary>CPU usage (Task Manager's number), effective clock and, when a provider runs, temperature. Press: per-core bars.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.cpu", Name = "CPU",
    Icon = "imgs/actions/system/cpu/icon", KeyImage = "imgs/actions/system/cpu/key",
    Tooltip = "CPU usage, clock and temperature with a history sparkline. Press for per-core bars.")]
public sealed class CpuKey : StatKeyAction<CpuSettings>
{
    protected override string UnavailableLabel => "CPU";
    protected override int HueIndex => SystemHues.Cpu;

    private bool WantsTemp => Settings.ShowTemp || string.Equals(Settings.Metric, "temp", StringComparison.OrdinalIgnoreCase);

    protected override TelemetryNeeds Needs(TelemetryFrame? latest) =>
        TelemetryNeeds.Cpu | (WantsTemp ? TelemetryNeeds.CpuTemp : 0) | (Views.IsDetail(Settings.View) ? TelemetryNeeds.PerCore : 0);

    protected override SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history) =>
        Views.IsDetail(Settings.View)
            ? KeyFrames.CpuCores(t, frame?.Cpu)
            : KeyFrames.History(t, StatViews.Cpu(frame, history, Settings.Metric, WantsTemp, KeyFrames.Window));

    protected override PiForm? DescribeForm() => TempForm.Add(new PiForm()
        .Heading("CPU")
        .Select("metric", "Show", [("usage", "Usage %"), ("clock", "Clock speed"), ("temp", "Temperature")])
        .Select("view", "View (press toggles)", [(Views.History, "Value + history"), (Views.Detail, "Per-core bars")])
        .Checkbox("showTemp", "Show the temperature")
        .Checkbox("fastRefresh", "Refresh twice a second"));

    protected override object? PiState() => TempForm.State(Telemetry);
}

/// <summary>GPU load, temperature, power, VRAM or clock (NVML on NVIDIA, D3DKMT + PDH elsewhere). Press: all four numbers.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.gpu", Name = "GPU",
    Icon = "imgs/actions/system/gpu/icon", KeyImage = "imgs/actions/system/gpu/key",
    Tooltip = "GPU load, temperature, power, VRAM or clock with a history sparkline. Press for all of them.")]
public sealed class GpuKey : StatKeyAction<GpuSettings>
{
    protected override string UnavailableLabel => "GPU";
    protected override int HueIndex => SystemHues.Gpu;

    protected override TelemetryNeeds Needs(TelemetryFrame? latest) =>
        TelemetryNeeds.Gpu | (latest?.FindGpu(Settings.Gpu) is { Source: "d3dkmt" } ? TelemetryNeeds.GpuEngines : 0);

    protected override SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history) =>
        Views.IsDetail(Settings.View)
            ? KeyFrames.GpuDetail(t, frame, Settings.Gpu)
            : KeyFrames.History(t, StatViews.Gpu(frame, history, Settings.Gpu, Settings.Metric, KeyFrames.Window));

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("GPU")
        .Select("gpu", "GPU", optionsFrom: PiOptions.Gpus)
        .Select("metric", "Show", [("usage", "Load %"), ("temp", "Temperature"), ("power", "Power"), ("vram", "VRAM used"), ("clock", "Core clock")])
        .Select("view", "View (press toggles)", [(Views.History, "Value + history"), (Views.Detail, "Load, temperature, power and VRAM")])
        .Checkbox("fastRefresh", "Refresh twice a second")
        .Info("Note", text: "NVIDIA GPUs report through NVML. Other GPUs report through Windows (D3DKMT and performance counters), which has no power reading.");
}

/// <summary>Physical memory in use (% or GiB). Press: used/total and commit charge.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.ram", Name = "RAM",
    Icon = "imgs/actions/system/ram/icon", KeyImage = "imgs/actions/system/ram/key",
    Tooltip = "Memory in use with a history sparkline. Press for used, total and commit charge.")]
public sealed class RamKey : StatKeyAction<RamSettings>
{
    protected override string UnavailableLabel => "RAM";
    protected override int HueIndex => SystemHues.Ram;

    protected override TelemetryNeeds Needs(TelemetryFrame? latest) => TelemetryNeeds.Memory;

    protected override SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history) =>
        Views.IsDetail(Settings.View)
            ? KeyFrames.RamDetail(t, frame?.Memory)
            : KeyFrames.History(t, StatViews.Ram(frame, history, Settings.Metric, KeyFrames.Window));

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Memory")
        .Select("metric", "Show", [("usage", "Usage %"), ("used", "Used (GiB)")])
        .Select("view", "View (press toggles)", [(Views.History, "Value + history"), (Views.Detail, "Used, total and commit")])
        .Checkbox("fastRefresh", "Refresh twice a second");
}

/// <summary>Disk activity (busy time), free space or throughput, per drive. Press: every drive's free space.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.disk", Name = "Disk",
    Icon = "imgs/actions/system/disk/icon", KeyImage = "imgs/actions/system/disk/key",
    Tooltip = "Disk activity, free space or throughput for a drive. Press to see every drive's free space.")]
public sealed class DiskKey : StatKeyAction<DiskSettings>
{
    protected override string UnavailableLabel => "DISK";
    protected override int HueIndex => SystemHues.Disk;

    protected override TelemetryNeeds Needs(TelemetryFrame? latest) => TelemetryNeeds.Disk;

    protected override SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history) =>
        Views.IsDetail(Settings.View)
            ? KeyFrames.DiskDetail(t, frame, Settings.Drive)
            : KeyFrames.History(t, StatViews.Disk(frame, history, Settings.Drive, Settings.Metric, KeyFrames.Window));

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Disk")
        .Select("drive", "Drive", optionsFrom: PiOptions.Drives)
        .Select("metric", "Show", [("activity", "Activity (busy time)"), ("free", "Free space"), ("throughput", "Read + write speed")])
        .Select("view", "View (press toggles)", [(Views.History, "Value + history"), (Views.Detail, "Free space on every drive")])
        .Checkbox("fastRefresh", "Refresh twice a second");
}

/// <summary>Network download/upload throughput for the default-route adapter (or a chosen one). Press: adapter and link.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.network", Name = "Network",
    Icon = "imgs/actions/system/network/icon", KeyImage = "imgs/actions/system/network/key",
    Tooltip = "Download and upload speed with history. Press for the adapter and its link speed.")]
public sealed class NetworkKey : StatKeyAction<NetworkSettings>
{
    protected override string UnavailableLabel => "NET";
    protected override int HueIndex => SystemHues.Net;

    protected override TelemetryNeeds Needs(TelemetryFrame? latest) => TelemetryNeeds.Network;

    private bool Bits => string.Equals(Settings.Units, "bits", StringComparison.OrdinalIgnoreCase);

    protected override SvgDocument Draw(RefractionPalette t, TelemetryFrame? frame, TelemetryHistory history)
    {
        if (Views.IsDetail(Settings.View))
        {
            var both = StatViews.Net(frame, history, Settings.Adapter, "both", Bits, KeyFrames.Window);
            return KeyFrames.NetDetail(t, both, frame?.FindAdapter(Settings.Adapter)?.LinkMbps);
        }
        return KeyFrames.History(t, StatViews.Net(frame, history, Settings.Adapter, Settings.Metric, Bits, KeyFrames.Window));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Network")
        .Select("adapter", "Adapter", optionsFrom: PiOptions.Adapters)
        .Select("metric", "Show", [("both", "Download and upload"), ("down", "Download"), ("up", "Upload")])
        .Select("units", "Units", [("bytes", "Bytes (MB/s)"), ("bits", "Bits (Mb/s)")])
        .Select("view", "View (press toggles)", [(Views.History, "Speed + history"), (Views.Detail, "Adapter and link speed")])
        .Checkbox("fastRefresh", "Refresh twice a second");
}
