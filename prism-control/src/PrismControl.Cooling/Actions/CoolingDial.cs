using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Scheduling;
using PrismControl.Cooling.Art;

namespace PrismControl.Cooling.Actions;

public sealed class CoolingDialSettings : IHasSourceOptions
{
    /// <summary>"dent" | "overview" | "fans" | "pump" (turning the dial cycles them).</summary>
    public string View { get; set; } = CoolingDial.Dent;
    /// <summary>Details on (a dial push toggles it).</summary>
    public bool Detail { get; set; }
    /// <summary>The shared time axis in minutes (2-15).</summary>
    public int WindowMin { get; set; } = 5;
    /// <summary>The fan lane: "auto" (radiator fans when assigned, else all fans) or a group.</summary>
    public string FanGroup { get; set; } = FanGroups.Auto;

    public string? EditSensorId { get; set; }
    public string? EditName { get; set; }
    public string? EditRole { get; set; } = Roles.Auto;
    public string CpuTempSource { get; set; } = CpuSources.Auto;
    public bool UseLhm { get; set; } = true;
    public int LhmPort { get; set; } = Lhm.LhmOptions.DefaultPort;
}

/// <summary>
/// The cooling dashboard on a dial: Stream Deck + strip segment (200×100) or a Galleon screen widget (~360×180; four of
/// them fill the 720×384 screen). Turn: next/previous view. Push: details. (Plus extras: tap = details, long touch = next view.)
/// Views: <b>dent</b> (CPU °C, pump RPM and radiator-fan RPM on one shared time axis: which one moves the CPU line),
/// <b>overview</b>, <b>fans</b> (every fan as a column, grouped by role) and <b>pump</b> (pump + coolant).
/// 1 Hz at Background priority; redraws immediately on input.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.cooling.dial", Name = "Cooling Dashboard",
    Icon = "imgs/actions/cooling/dial/icon", KeyImage = "imgs/actions/cooling/dial/key", EncoderIcon = "imgs/actions/cooling/dial/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "CPU temperature against pump and radiator-fan speed on one time axis, plus fan and pump views. Turn: view. Push: details.",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Next view", TriggerPush = "Details", TriggerTouch = "Details", TriggerLongTouch = "Next view")]
public sealed class CoolingDial : DialAction<CoolingDialSettings>, IDisposable
{
    public const string Dent = "dent", Overview = "overview", FansView = "fans", PumpView = "pump";
    public static readonly string[] Views = [Dent, Overview, FansView, PumpView];

    private readonly CoolingBinding _binding = new();
    private readonly SharedSensorEditor _editor = new();
    private readonly SourceOptionsEditor _sources = new();

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        if (_binding.Bind(Services)) _sources.Load(_binding.Service!, Settings);
        SetFeedbackLayout(Layouts.Canvas.Path);
        StartRenderLoop(Render, idleInterval: TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _binding.Release();
        return Task.CompletedTask;
    }

    public void Dispose() => _binding.Dispose();

    /// <summary>One step per event whatever the tick count (Galleon aggregates fast spins up to ±12 ticks; skipping views would feel random).</summary>
    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (e.Ticks == 0) return Task.CompletedTask;
        Step(Math.Sign(e.Ticks));
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        ToggleDetail();
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        if (e.Hold) Step(1); else ToggleDetail();
        return Task.CompletedTask;
    }

    private void Step(int dir)
    {
        var i = Array.IndexOf(Views, NormalizeView(Settings.View));
        Settings.View = Views[((i + dir) % Views.Length + Views.Length) % Views.Length];
        SaveSettings();
        Render();
    }

    private void ToggleDetail()
    {
        Settings.Detail = !Settings.Detail;
        SaveSettings();
        Render();
    }

    public static string NormalizeView(string? v) => Views.Contains(v?.Trim().ToLowerInvariant()) ? v!.Trim().ToLowerInvariant() : Dent;

    protected override Task OnSettingsChangedAsync(CoolingDialSettings settings)
    {
        if (_binding.Service is { } svc)
        {
            _sources.OnSettingsChanged(svc, Settings);
            var id = string.IsNullOrEmpty(Settings.EditSensorId) ? null : Settings.EditSensorId;
            if (_editor.OnSettingsChanged(svc, id, () => Settings.EditName, v => Settings.EditName = v, () => Settings.EditRole, v => Settings.EditRole = v))
                SaveSettings();
        }
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _binding.ResetPiState();
        if (_binding.Service is { } svc)
        {
            var changed = _sources.Load(svc, Settings);
            changed |= CoolingBinding.Canonicalize(_binding.Snapshot, Settings.EditSensorId, v => Settings.EditSensorId = v);
            var id = string.IsNullOrEmpty(Settings.EditSensorId) ? null : Settings.EditSensorId;
            changed |= _editor.Load(svc, id, () => Settings.EditName, v => Settings.EditName = v, () => Settings.EditRole, v => Settings.EditRole = v);
            if (changed) SaveSettings();
        }
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => CoolingForms.Sources(CoolingForms.Editor(new PiForm()
        .Heading("Cooling dashboard")
        .Select("view", "View (turn the dial)", [(Dent, "CPU vs pump vs radiator fans"), (Overview, "Overview"), (FansView, "Every fan"), (PumpView, "Pump and coolant")])
        .Checkbox("detail", "Details (push the dial)")
        .Range("windowMin", "Time axis", 2, 15, 1, " min")
        .Select("fanGroup", "Fan lane", FanGroups.Options)
        .Info("Status", stateKey: "status")));

    protected override object? DescribeState() => PiState(_binding.Snapshot);

    private object PiState(CoolingSnapshot snap) => new { status = snap.StatusText, reading = CoolingBinding.Reading(snap.Find(Settings.EditSensorId)) };

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult<object?>(type == CoolingForms.SensorsRequest ? CoolingBinding.SensorOptions(_binding.Snapshot, _ => true, null, Settings.EditSensorId) : null);

    private void Render()
    {
        var frame = Frame(Theme, _binding.Service, Settings, IsInteractive);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, frame));
        if (IsPropertyInspectorVisible && _binding.PiStateIfChanged(PiState(_binding.Snapshot)) is { } st) SendToPropertyInspector("pi.state", st);
    }

    /// <summary>Builds the current view's 200×100 frame (public for tests and previews).</summary>
    public static SvgDocument Frame(Core.Render.Tokens.RefractionPalette t, CoolingService? svc, CoolingDialSettings s, bool active)
    {
        var view = NormalizeView(s.View);
        var page = Array.IndexOf(Views, view);
        if (svc is null) return CoolingFrames.Message(t, "cooling", "Cooling is not available", "The module did not start (see the plugin log).", active, page, Views.Length);
        var snap = svc.Current;
        var window = TimeSpan.FromMinutes(Math.Clamp(s.WindowMin, 2, 15));
        var t1 = snap.At.ToUnixTimeMilliseconds();
        var t0 = (snap.At - window).ToUnixTimeMilliseconds();
        var h = svc.History;
        var hasData = snap.Sensors.Any(x => x.HasValue);
        if (!hasData)
        {
            var icue = snap.Providers.FirstOrDefault(p => p.Name == Icue.IcueProvider.ProviderName);
            var (line1, line2, line3) = snap.Status switch
            {
                CoolingStatus.Idle or CoolingStatus.Connecting => ("Connecting…", "Reading iCUE sensors", "(read-only)"),
                _ when icue is { State: ProviderState.NotRunning } => ("iCUE is not running", "Start iCUE, or LHM with", "Remote Web Server on"),
                _ when icue is { State: ProviderState.Error } => ("iCUE did not answer", icue.Detail, "Retrying…"),
                _ => ("No cooling sensors", snap.StatusText, null),
            };
            return CoolingFrames.Message(t, "cooling", line1, line2, active, page, Views.Length, line3);
        }

        var fanGroup = FanGroups.Parse(s.FanGroup) ?? snap.DefaultFanGroup;
        var fans = snap.Group(fanGroup);
        var pumps = snap.Group(FanGroup.Pump);
        string Range(string key, Func<double?, string> fmt) => h.Stats(key, window, snap.At) is { } st ? $"↓{fmt(st.Min)} ↑{fmt(st.Max)}" : "";

        switch (view)
        {
            case Overview:
            {
                var rows = new List<OverviewRow>();
                if (snap.Coolant is { } c) rows.Add(new OverviewRow("liquid", CoolingFormat.Temp(c.Value), CoolingColors.Neutral(t)));
                if (pumps.Count > 0) rows.Add(new OverviewRow("pump", CoolingFormat.Rpm(pumps.Avg), CoolingColors.Pump));
                if (fans.Count > 0) rows.Add(new OverviewRow(fanGroup == FanGroup.Radiator ? "rad" : "fans", CoolingFormat.Rpm(fans.Avg), CoolingColors.ForGroup(t, fanGroup)));
                var cases = snap.Group(FanGroup.Case);
                if (cases.Count > 0 && fanGroup != FanGroup.Case) rows.Add(new OverviewRow("case", CoolingFormat.Rpm(cases.Avg), CoolingColors.Case));
                var cpuSrc = snap.Cpu is { } cpu ? (cpu.Source == "lhm" ? "lhm" : "icue") : "";
                return CoolingFrames.Overview(t, CoolingFormat.Temp(snap.Cpu?.Value), cpuSrc, h.Get(CoolingHistory.CpuKey, window, snap.At), t0, t1, rows,
                    s.Detail ? snap.StatusText : null, active, page, Views.Length);
            }
            case FansView:
            {
                var all = snap.Group(FanGroup.AllFans).Members.Select(f => new FanBar(f.Name, f.Value, f.Role)).ToList();
                var peak = all.Count == 0 ? 0 : all.Max(f => f.Rpm ?? 0);
                var scale = peak <= 0 ? 0 : Math.Ceiling(peak * 1.15 / 250) * 250;
                var right = s.Detail ? $"{CoolingFormat.Rpm(snap.Group(FanGroup.AllFans).Min)}–{CoolingFormat.Rpm(snap.Group(FanGroup.AllFans).Max)}" : $"avg {CoolingFormat.Rpm(snap.Group(FanGroup.AllFans).Avg)}";
                return CoolingFrames.Fans(t, all, scale, right, s.Detail, active, page, Views.Length);
            }
            case PumpView:
            {
                var pump = pumps.Members.FirstOrDefault();
                if (pump is null) return CoolingFrames.Message(t, "pump", "No pump found", "Set a sensor's role to Pump in the PI.", active, page, Views.Length);
                var rows = new List<OverviewRow>
                {
                    new("liquid", CoolingFormat.Temp(snap.Coolant?.Value), CoolingColors.Neutral(t)),
                    s.Detail && snap.Cpu?.Value is { } cv && snap.Coolant?.Value is { } lv
                        ? new OverviewRow("cpu−liq", CoolingFormat.Temp(cv - lv), CoolingColors.Cpu)
                        : new OverviewRow("cpu", CoolingFormat.Temp(snap.Cpu?.Value), CoolingColors.Cpu),
                };
                var sub = s.Detail ? Range(pump.Id, CoolingFormat.Rpm) + " rpm" : "rpm";
                return CoolingFrames.Pump(t, pump.CustomName ?? "pump", CoolingFormat.Rpm(pump.Value), sub, h.Get(pump.Id, window, snap.At),
                    h.Get(CoolingHistory.CoolantKey, window, snap.At), t0, t1, window, rows, active, page, Views.Length);
            }
            default:
            {
                var lanes = new List<LaneModel>
                {
                    new()
                    {
                        Label = "cpu",
                        Value = CoolingFormat.Temp(snap.Cpu?.Value),
                        Color = CoolingColors.Cpu,
                        Points = h.Get(CoolingHistory.CpuKey, window, snap.At),
                        MinSpan = 6,
                        RangeText = Range(CoolingHistory.CpuKey, CoolingFormat.TempWhole),
                        Overlay = snap.Coolant is not null ? h.Get(CoolingHistory.CoolantKey, window, snap.At) : null,
                        OverlayLabel = snap.Coolant?.Value is { } lq ? "liquid " + CoolingFormat.Temp(lq) : null,
                    },
                };
                if (pumps.Count > 0)
                    lanes.Add(new LaneModel
                    {
                        Label = "pump", Value = CoolingFormat.Rpm(pumps.Avg), Color = CoolingColors.Pump, MinSpan = 150,
                        Points = h.Get(CoolingHistory.GroupKey(FanGroup.Pump), window, snap.At),
                        RangeText = Range(CoolingHistory.GroupKey(FanGroup.Pump), CoolingFormat.Rpm),
                    });
                if (fans.Count > 0)
                    lanes.Add(new LaneModel
                    {
                        Label = fanGroup switch { FanGroup.Radiator => "rad fans", FanGroup.Case => "case fans", FanGroup.AllFans => "fans", _ => FanGroups.Label(fanGroup) },
                        Value = CoolingFormat.Rpm(fans.Avg), Color = CoolingColors.ForGroup(t, fanGroup), MinSpan = 150,
                        Points = h.Get(CoolingHistory.GroupKey(fanGroup), window, snap.At),
                        RangeText = Range(CoolingHistory.GroupKey(fanGroup), CoolingFormat.Rpm),
                    });
                return CoolingFrames.Dent(t, lanes, t0, t1, window, s.Detail, active, page, Views.Length);
            }
        }
    }
}
