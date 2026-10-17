using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

public sealed class MonitorDialSettings
{
    /// <summary>"brightness", "contrast" or "volume" (the monitor's speakers).</summary>
    public string Feature { get; set; } = "brightness";
    /// <summary>Monitor id; empty = primary; "all" = every monitor in sync (brightness and contrast).</summary>
    public string Monitor { get; set; } = "";
    /// <summary>Units per tick (Galleon spins arrive as up to ±12 ticks).</summary>
    public int Step { get; set; } = 2;
    /// <summary>Key press: "cycle" (through <see cref="Presets"/>), "up" or "down" (by 5 × <see cref="Step"/>).</summary>
    public string KeyAction { get; set; } = "cycle";
    public string Presets { get; set; } = "0,25,50,75,100";
}

/// <summary>
/// Flagship 2: monitor control over DDC/CI. Turn = brightness / contrast / speaker volume; push (or touch) = next monitor,
/// then "all monitors" (brightness sync). Writes are debounced (≥ 150 ms, final value always) and verified: a monitor that
/// ignores a write (many lock brightness in HDR) shows the real value and "LOCKED IN HDR". On a key: press cycles presets
/// or steps up/down.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.monitor",
    Name = "Monitor Control",
    Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Brightness, contrast or speaker volume of your monitors over DDC/CI.",
    Icon = "imgs/actions/windows/monitor/icon",
    KeyImage = "imgs/actions/windows/monitor/key",
    EncoderIcon = "imgs/actions/windows/monitor/dial",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Adjust",
    TriggerPush = "Next monitor",
    TriggerTouch = "Next monitor")]
public sealed class MonitorDial : DialAction<MonitorDialSettings>
{
    private DisplayService? _display;
    private DdcService? _ddc;
    private Flash? _flash;
    private Action<string>? _onDdc;
    private Action? _onDisplay;

    internal VcpView? LastValue { get; private set; }
    internal string? LastStatus { get; private set; }
    internal string LastMonitor { get; private set; } = "";
    internal string? FlashText => _flash?.Text;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        if (IsKey) DefaultPriority = UpdatePriority.Background;
        _display = Services.Find<DisplayService>();
        _ddc = Services.Find<DdcService>();
        _flash = new Flash(this, Time, Render);
        _onDdc = _ => Post(Render);
        _onDisplay = () => Post(Render);
        if (_ddc is not null) _ddc.Changed += _onDdc;
        if (_display is not null) _display.Changed += _onDisplay;
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(100));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_ddc is not null && _onDdc is not null) _ddc.Changed -= _onDdc;
        if (_display is not null && _onDisplay is not null) _display.Changed -= _onDisplay;
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(MonitorDialSettings settings) { Render(); return Task.CompletedTask; }

    internal byte Code => Settings.Feature?.Trim().ToLowerInvariant() switch
    {
        "contrast" => Vcp.Contrast,
        "volume" => Vcp.Volume,
        _ => Vcp.Brightness,
    };

    private bool AllowsAll => Code is Vcp.Brightness or Vcp.Contrast;
    private bool IsAll => AllowsAll && string.Equals(Settings.Monitor, MonitorPicker.All, StringComparison.OrdinalIgnoreCase);
    private int Step => Math.Clamp(Settings.Step, 1, 10);

    /// <summary>The monitors this control writes to.</summary>
    internal IReadOnlyList<MonitorInfo> Targets()
    {
        if (_display is null) return [];
        if (IsAll) return _display.Monitors();
        return _display.Find(Settings.Monitor) is { } m ? [m] : [];
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (_ddc is null || e.Ticks == 0) return Task.CompletedTask;
        Apply(e.Ticks * Step);
        return Task.CompletedTask;
    }

    private void Apply(int delta)
    {
        var targets = Targets();
        if (targets.Count == 0 || _ddc is null) return;
        if (targets.Count == 1)
        {
            if (!_ddc.Adjust(targets[0].Id, Code, delta) && _ddc.Peek(targets[0].Id, Code) is null) _flash?.Show("READING…");
            Render();
            return;
        }
        // All monitors in sync: one value (from the first monitor that answers), written to every monitor.
        var lead = targets.Select(m => _ddc.Peek(m.Id, Code)).FirstOrDefault(v => v is { Status: not DdcStatus.Unsupported });
        if (lead is null) { _flash?.Show("READING…"); Render(); return; }
        var value = (uint)Math.Clamp((long)lead.Shown + delta, 0, lead.Max);
        SetAll(targets, value, lead.Max);
        Render();
    }

    private void SetAll(IReadOnlyList<MonitorInfo> targets, uint value, uint leadMax)
    {
        foreach (var m in targets)
        {
            var v = _ddc!.Peek(m.Id, Code);
            if (v is null or { Status: DdcStatus.Unsupported }) continue;
            // Same percentage on monitors with a different range (PG279Q contrast is 0–150).
            var scaled = leadMax == v.Max || leadMax == 0 ? value : (uint)Math.Round((double)value / leadMax * v.Max);
            _ddc.Set(m.Id, Code, scaled);
        }
    }

    protected override Task OnDialPressAsync(DialUpEvent e) { NextMonitor(); return Task.CompletedTask; }
    protected override Task OnTouchTapAsync(TouchTapEvent e) { NextMonitor(); return Task.CompletedTask; }

    private void NextMonitor()
    {
        if (_display is null) return;
        Settings.Monitor = MonitorPicker.Next(_display.Monitors(), Settings.Monitor, AllowsAll, _display);
        SaveSettings();
        Render();
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        var targets = Targets();
        if (_ddc is null || targets.Count == 0) { _flash?.Show("NO DISPLAY", alert: true); return Task.CompletedTask; }
        var lead = targets.Select(m => _ddc.Peek(m.Id, Code)).FirstOrDefault(v => v is { Status: not DdcStatus.Unsupported });
        if (lead is null) { _flash?.Show("READING…"); return Task.CompletedTask; }
        var action = Settings.KeyAction?.Trim().ToLowerInvariant();
        if (action is "up" or "down")
        {
            Apply((action == "up" ? 1 : -1) * Step * 5);
            return Task.CompletedTask;
        }
        var presets = ParsePresets(Settings.Presets);
        if (presets.Count == 0) return Task.CompletedTask;
        var pct = lead.Max == 0 ? 0 : lead.Shown * 100.0 / lead.Max;
        var next = presets.FirstOrDefault(p => p > pct + 0.5, presets[0]);
        var value = (uint)Math.Round(next / 100.0 * lead.Max);
        if (targets.Count == 1) _ddc.Set(targets[0].Id, Code, value);
        else SetAll(targets, value, lead.Max);
        Render();
        return Task.CompletedTask;
    }

    internal static List<int> ParsePresets(string? s) =>
        (s ?? "").Split([',', ' ', ';'], StringSplitOptions.RemoveEmptyEntries)
            .Select(x => int.TryParse(x, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? (int?)Math.Clamp(v, 0, 100) : null)
            .Where(v => v is not null).Select(v => v!.Value).Distinct().Order().ToList();

    private void Render()
    {
        if (!IsVisible) return;
        var feature = Vcp.Name(Code);
        var targets = Targets();
        string monitorName;
        VcpView? v = null;
        string? status;
        var hdrOn = false;
        if (targets.Count == 0 || _ddc is null) { monitorName = "NO DISPLAY"; status = _ddc is null ? "UNAVAILABLE" : "NO DISPLAY"; }
        else
        {
            var views = targets.Select(m => (m, v: _ddc.Peek(m.Id, Code))).ToList();
            var lead = views.FirstOrDefault(x => x.v is { Status: not DdcStatus.Unsupported });
            v = lead.v ?? views[0].v;
            hdrOn = (lead.m ?? views[0].m).Hdr.On;
            if (IsAll)
            {
                var answering = views.Count(x => x.v is { Status: not DdcStatus.Unsupported });
                monitorName = "ALL";
                var locked = views.Any(x => x.v?.Status == DdcStatus.Locked);
                status = locked ? "ONE IS LOCKED (HDR?)" : $"{answering} OF {views.Count} MONITORS";
                if (locked) v = v! with { Status = DdcStatus.Locked };
            }
            else
            {
                monitorName = targets[0].ShortName;
                status = v is null ? "READING…" : DisplayArt.StatusText(v.Status, hdrOn);
            }
        }
        LastValue = v;
        LastStatus = status;
        LastMonitor = monitorName;
        if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, DisplayArt.MonitorDial(Theme, feature, monitorName, v, status, IsInteractive, _flash?.Text, _flash?.IsAlert ?? false)));
        else SetImage(DisplayArt.MonitorKey(Theme, feature, monitorName, v, status, _flash?.Text, _flash?.IsAlert ?? false));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Monitor control (DDC/CI)")
        .Select("feature", "Control", [("brightness", "Brightness"), ("contrast", "Contrast"), ("volume", "Speaker volume")])
        .Select("monitor", "Monitor", optionsFrom: "monitors.list")
        .Range("step", "Step per tick", 1, 10, 1)
        .Select("keyAction", "Key press", [("cycle", "Cycle presets"), ("up", "Step up"), ("down", "Step down")])
        .Text("presets", "Presets (%)", "0,25,50,75,100")
        .Info("Note", "Changes are sent at most every 150 ms to spare the monitor. If a monitor ignores a change (HDR often locks brightness), the control shows the real value.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult<object?>(type == "monitors.list" ? MonitorPicker.Options(_display, includeAll: AllowsAll) : null);
}
