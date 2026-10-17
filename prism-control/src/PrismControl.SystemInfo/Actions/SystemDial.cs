using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Actions;

/// <summary>
/// The system monitor dial: turn to cycle CPU → GPU → RAM → disk → network, push to switch between the history view
/// and the detail view (per-core bars, the GPU grid, memory meters, drives, both directions). Every function works with
/// rotate + a short push, so it is complete on the Galleon (no touch, no dial long-press); a tap on the Stream Deck +
/// strip does what a push does. Unset, the metric follows the placement, so four dials on the Galleon form a
/// CPU / GPU / RAM / network dashboard and four on the Stream Deck + do the same across the strip.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.dial", Name = "System Monitor",
    Icon = "imgs/actions/system/dial/icon", KeyImage = "imgs/actions/system/dial/key", EncoderIcon = "imgs/actions/system/dial/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "CPU, GPU, RAM, disk and network on a dial. Turn to change the metric, push for detail.",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Next / previous metric", TriggerPush = "History / detail", TriggerTouch = "History / detail")]
public sealed class SystemDial : DialAction<SystemDialSettings>, IDisposable
{
    public static readonly string[] Metrics = ["cpu", "gpu", "ram", "disk", "net"];

    private ITelemetry? _telemetry;
    private ITelemetryLease? _lease;
    private RenderLoop? _loop;
    private string? _lastPiState;
    private readonly TempSettingsSync _tempSync = new();

    /// <summary>The metric shown: the setting, or by placement when unset (Galleon TL CPU, TR GPU, BL RAM, BR network).</summary>
    public string Metric => Metrics.Contains(Settings.Metric?.Trim().ToLowerInvariant()) ? Settings.Metric!.Trim().ToLowerInvariant() : DefaultMetric(Encoder);

    public static string DefaultMetric(EncoderPlacement? where) => where switch
    {
        { Quadrant: ScreenQuadrant.TopLeft } => "cpu",
        { Quadrant: ScreenQuadrant.TopRight } => "gpu",
        { Quadrant: ScreenQuadrant.BottomLeft } => "ram",
        { Quadrant: ScreenQuadrant.BottomRight } => "net",
        { StripSegment: { } s } => s switch { 0 => "cpu", 1 => "gpu", 2 => "ram", _ => "net" },
        _ => "cpu",
    };

    private bool Detail => Views.IsDetail(Settings.View);
    private bool Bits => string.Equals(Settings.Units, "bits", StringComparison.OrdinalIgnoreCase);
    private TimeSpan Interval => Settings.FastRefresh ? TelemetryService.FastInterval : TelemetryService.Interval;

    private TelemetryNeeds CurrentNeeds
    {
        get
        {
            var n = Metric switch
            {
                "gpu" => TelemetryNeeds.Gpu | (_telemetry?.Latest?.FindGpu(Settings.Gpu) is { Source: "d3dkmt" } ? TelemetryNeeds.GpuEngines : 0),
                "ram" => TelemetryNeeds.Memory,
                "disk" => TelemetryNeeds.Disk,
                "net" => TelemetryNeeds.Network,
                _ => TelemetryNeeds.Cpu | (Settings.ShowTemp ? TelemetryNeeds.CpuTemp : 0) | (Detail ? TelemetryNeeds.PerCore : 0),
            };
            if (Settings.FastRefresh) n |= TelemetryNeeds.Fast;
            if (IsPropertyInspectorVisible) n |= TelemetryNeeds.Gpu | TelemetryNeeds.Disk | TelemetryNeeds.Network | TelemetryNeeds.CpuTemp;
            return n;
        }
    }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        SetFeedbackLayout(Layouts.Canvas.Path);
        _telemetry = Services.TryGet<ITelemetry>(out var t) ? t : null;
        if (_telemetry is not null) _tempSync.OnAppear(_telemetry, Settings);
        _lease?.Dispose();
        _lease = _telemetry?.Acquire(CurrentNeeds);
        _loop = StartRenderLoop(Render, Interval);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Release();
        return Task.CompletedTask;
    }

    /// <summary>One metric per rotate event in its direction (a Galleon spin of ±12 ticks is still one step, so the dial never skips past).</summary>
    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (e.Ticks == 0) return Task.CompletedTask;
        var i = Array.IndexOf(Metrics, Metric);
        Settings.Metric = Metrics[(i + Math.Sign(e.Ticks) + Metrics.Length) % Metrics.Length];
        SaveSettings();
        Refresh();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ToggleView();

    /// <summary>Stream Deck + only: a tap does what a push does.</summary>
    protected override Task OnTouchTapAsync(TouchTapEvent e) => ToggleView();

    private Task ToggleView()
    {
        Settings.View = Views.Toggle(Settings.View);
        SaveSettings();
        Refresh();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(SystemDialSettings settings)
    {
        if (_telemetry is not null) _tempSync.OnSettingsChanged(_telemetry, GlobalSettings, settings);
        Refresh();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        if (_telemetry is not null) _tempSync.OnAppear(_telemetry, Settings); // show the current plugin-wide source
        _lease?.Update(CurrentNeeds);
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorDisappearedAsync()
    {
        _lease?.Update(CurrentNeeds);
        return Task.CompletedTask;
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        PiOptions.AnswerAsync(type, _telemetry, () => _lease?.Update(CurrentNeeds | TelemetryNeeds.Gpu | TelemetryNeeds.Disk | TelemetryNeeds.Network));

    protected override object? DescribeState() => TempForm.State(_telemetry);

    protected override PiForm? DescribeForm() => TempForm.Add(new PiForm()
        .Heading("System Monitor")
        .Select("metric", "Showing (turn to change)", [("", "By position (dashboard)"), ("cpu", "CPU"), ("gpu", "GPU"), ("ram", "Memory"), ("disk", "Disk"), ("net", "Network")])
        .Select("view", "View (push toggles)", [(Views.History, "Value + history"), (Views.Detail, "Detail")])
        .Select("gpu", "GPU", optionsFrom: PiOptions.Gpus)
        .Select("drive", "Drive", optionsFrom: PiOptions.Drives)
        .Select("adapter", "Network adapter", optionsFrom: PiOptions.Adapters)
        .Select("units", "Network units", [("bytes", "Bytes (MB/s)"), ("bits", "Bits (Mb/s)")])
        .Checkbox("showTemp", "Show the CPU temperature")
        .Checkbox("fastRefresh", "Refresh twice a second")
        .Info("Controls", text: "Turn: next or previous metric. Push: history or detail. On the Galleon, four of these fill the screen as a dashboard (CPU, GPU, RAM and network by position)."));

    private void Refresh()
    {
        _lease?.Update(CurrentNeeds);
        if (_loop is not null) _loop.IdleInterval = Interval;
        Render();
        if (_telemetry is { } t)
            _ = Task.Run(async () =>
            {
                await t.NextFrameAsync(TimeSpan.FromSeconds(1.5)).ConfigureAwait(false);
                Post(Render);
            });
    }

    private void Render()
    {
        var t = Theme;
        if (_telemetry is not { } tel)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, DialFrames.Unavailable(t, Label(Metric), HueOf(Metric))));
            return;
        }
        _lease?.Update(CurrentNeeds);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Draw(t, tel.Latest, tel.History, IsInteractive)));
        PushPiState();
    }

    /// <summary>The frame for the current metric and view (public for previews).</summary>
    public SvgDocument Draw(RefractionPalette t, TelemetryFrame? f, TelemetryHistory h, bool active) => Frame(t, f, h, Metric, Detail, Settings, active);

    public static SvgDocument Frame(RefractionPalette t, TelemetryFrame? f, TelemetryHistory h, string metric, bool detail, SystemDialSettings s, bool active)
    {
        var bits = string.Equals(s.Units, "bits", StringComparison.OrdinalIgnoreCase);
        const int w = DialFrames.Window;
        return metric switch
        {
            "gpu" => detail ? DialFrames.GpuDetail(t, f, s.Gpu, active) : DialFrames.History(t, StatViews.Gpu(f, h, s.Gpu, "usage", w), active),
            "ram" => detail ? DialFrames.RamDetail(t, f?.Memory, active) : DialFrames.History(t, StatViews.Ram(f, h, "usage", w), active),
            "disk" => detail ? DialFrames.DiskDetail(t, f, s.Drive, active) : DialFrames.History(t, StatViews.Disk(f, h, s.Drive, "activity", w), active),
            "net" => detail
                ? DialFrames.NetDetail(t, StatViews.Net(f, h, s.Adapter, "both", bits, 30), h, s.Adapter, active)
                : DialFrames.History(t, StatViews.Net(f, h, s.Adapter, "both", bits, w), active),
            _ => detail ? DialFrames.CpuCores(t, f?.Cpu, s.ShowTemp, active) : DialFrames.History(t, StatViews.Cpu(f, h, "usage", s.ShowTemp, w), active),
        };
    }

    private static string Label(string metric) => metric switch { "gpu" => "GPU", "ram" => "RAM", "disk" => "DISK", "net" => "NET", _ => "CPU" };

    private static int HueOf(string metric) => metric switch
    {
        "gpu" => SystemHues.Gpu,
        "ram" => SystemHues.Ram,
        "disk" => SystemHues.Disk,
        "net" => SystemHues.Net,
        _ => SystemHues.Cpu,
    };

    private void PushPiState()
    {
        if (!IsPropertyInspectorVisible) return;
        var state = TempForm.State(_telemetry);
        var json = JsonSerializer.Serialize(state, state.GetType());
        if (json == _lastPiState) return;
        _lastPiState = json;
        SendToPropertyInspector("pi.state", state);
    }

    private void Release()
    {
        _lease?.Dispose();
        _lease = null;
    }

    public void Dispose() => Release();
}
