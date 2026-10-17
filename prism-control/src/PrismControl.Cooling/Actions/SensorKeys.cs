using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.Cooling.Art;

namespace PrismControl.Cooling.Actions;

/// <summary>Per-key settings of the Fan and Pump keys. No secrets; ids are opaque.</summary>
public sealed class SensorKeySettings
{
    /// <summary>The sensor to show; empty = automatic (first radiator fan / first pump).</summary>
    public string? SensorId { get; set; }
    /// <summary>PI field bridged to the SHARED name of the sensor (every key shows it).</summary>
    public string? Name { get; set; }
    /// <summary>PI field bridged to the SHARED role of the sensor ("auto", "radiator", "case", "pump", "gpu", "ignore").</summary>
    public string? Role { get; set; } = Roles.Auto;
    /// <summary>Sparkline / stats window in minutes (1-15).</summary>
    public int WindowMin { get; set; } = 2;
    /// <summary>Full-scale RPM for the level and sparkline; 0 = automatic.</summary>
    public int MaxRpm { get; set; }
    /// <summary>Show min/max over the window instead of the sparkline (a key press toggles it).</summary>
    public bool ShowStats { get; set; }
}

/// <summary>
/// One fan or pump on a key: the RPM, a fan/pump glyph whose spin arcs show the level, and a 1 Hz history sparkline
/// scaled 0..full-scale (so the line's height IS the level). Press toggles sparkline ↔ min/max. Background priority, 1 Hz.
/// </summary>
public abstract class SensorKeyBase : KeyAction<SensorKeySettings>, IDisposable
{
    private readonly CoolingBinding _binding = new();
    private readonly SharedSensorEditor _editor = new();
    private RenderLoop? _loop;

    protected abstract SensorKind Kind { get; }
    protected abstract string DefaultLabel { get; }
    protected abstract string OptionsRequest { get; }

    protected CoolingService? Service => _binding.Service;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        _binding.Bind(Services);
        _loop = StartRenderLoop(Render, idleInterval: TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _binding.Release();
        return Task.CompletedTask;
    }

    public void Dispose() => _binding.Dispose();

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        Settings.ShowStats = !Settings.ShowStats;
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(SensorKeySettings settings)
    {
        if (Service is { } svc && _editor.OnSettingsChanged(svc, EditId(svc.Current), () => Settings.Name, v => Settings.Name = v, () => Settings.Role, v => Settings.Role = v))
            SaveSettings();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _binding.ResetPiState();
        if (Service is { } svc && _editor.Load(svc, EditId(svc.Current), () => Settings.Name, v => Settings.Name = v, () => Settings.Role, v => Settings.Role = v))
            SaveSettings();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading(DefaultLabel)
        .Select("sensorId", "Sensor", optionsFrom: OptionsRequest)
        .Text("name", "Name (shared by every key)", placeholder: "the name iCUE uses")
        .Select("role", "Role (shared)", Roles.Options)
        .Range("windowMin", "History", 1, 15, 1, " min")
        .Number("maxRpm", "Full scale RPM (0 = auto)", 0, 6000, 100)
        .Checkbox("showStats", "Show min / max instead of history (key press toggles)")
        .Info("Status", stateKey: "status")
        .Info("Sensor", stateKey: "reading");

    protected override object? DescribeState() => PiState(_binding.Snapshot);

    private object PiState(CoolingSnapshot snap) => new { status = snap.StatusText, reading = CoolingBinding.Reading(Resolve(snap)) };

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        var snap = _binding.Snapshot;
        object? result = type == OptionsRequest
            ? CoolingBinding.SensorOptions(snap, Matches, AutoLabel, Settings.SensorId)
            : null;
        return Task.FromResult(result);
    }

    protected abstract string AutoLabel { get; }

    protected virtual bool Matches(CoolingSensor s) => s.Kind == Kind;

    /// <summary>The configured sensor, or the automatic choice when none is set.</summary>
    protected CoolingSensor? Resolve(CoolingSnapshot snap)
    {
        if (!string.IsNullOrEmpty(Settings.SensorId)) return snap.Find(Settings.SensorId);
        return AutoPick(snap);
    }

    protected abstract CoolingSensor? AutoPick(CoolingSnapshot snap);

    /// <summary>The sensor the PI's name/role fields edit: the configured id even while it is offline, else the automatic pick.</summary>
    private string? EditId(CoolingSnapshot snap) => !string.IsNullOrEmpty(Settings.SensorId) ? Settings.SensorId : AutoPick(snap)?.Id;

    /// <summary>Extra context for the line under the value (pump: the coolant temperature).</summary>
    protected virtual string SubText(CoolingSnapshot snap, CoolingSensor s) =>
        s.Pct is { } pct ? $"RPM · {Math.Round(pct):0}%" : "RPM";

    private void Render()
    {
        var t = Theme;
        var svc = Service;
        var snap = _binding.Snapshot;
        var s = Resolve(snap);
        // Found under an old id (the other iCUE pipe, a rename in iCUE): keep the current one, so the key survives a restart.
        if (s is not null && CoolingBinding.Canonicalize(snap, Settings.SensorId, v => Settings.SensorId = v)) SaveSettings();
        var window = TimeSpan.FromMinutes(Math.Clamp(Settings.WindowMin, 1, 15));
        KeyModel model;
        if (svc is null)
        {
            model = new KeyModel { Label = DefaultLabel, Value = CoolingFormat.NoValue, Sub = "COOLING OFF", Hue = CoolingColors.Radiator, Glyph = GlyphFor, Muted = true };
        }
        else if (s is null)
        {
            model = new KeyModel { Label = DefaultLabel, Value = CoolingFormat.NoValue, Sub = WhyNot(snap), Hue = CoolingColors.ForRole(Kind == SensorKind.Pump ? CoolingRole.Pump : CoolingRole.Radiator), Glyph = GlyphFor, Muted = true };
        }
        else
        {
            var hue = CoolingColors.ForRole(s.Kind == SensorKind.Pump ? CoolingRole.Pump : s.Role);
            var hist = svc.History.Get(s.Id, window, snap.At);
            var scale = FullScale(s, svc.History.Stats(s.Id, TimeSpan.FromMinutes(15), snap.At)?.Max);
            var stats = Settings.ShowStats ? svc.History.Stats(s.Id, window, snap.At) : null;
            var label = Kind == SensorKind.Pump ? s.CustomName ?? DefaultLabel : s.Name;
            model = new KeyModel
            {
                Label = label,
                Value = s.HasValue ? CoolingFormat.Rpm(s.Value) : CoolingFormat.NoValue,
                Sub = s.HasValue ? SubText(snap, s) : "NO SIGNAL",
                Glyph = GlyphFor,
                Hue = hue,
                Level = s.HasValue && scale > 0 ? s.Value!.Value / scale : 0,
                History = hist,
                T0 = (snap.At - window).ToUnixTimeMilliseconds(),
                T1 = snap.At.ToUnixTimeMilliseconds(),
                ScaleMax = scale,
                Stats = Settings.ShowStats ? (stats is { } st ? $"↓{CoolingFormat.Rpm(st.Min)}  ↑{CoolingFormat.Rpm(st.Max)}" : CoolingFormat.NoValue) : null,
                Muted = !s.HasValue,
            };
        }
        LastModel = model;
        SetImage(CoolingFrames.Key(t, model));
        if (IsPropertyInspectorVisible && _binding.PiStateIfChanged(PiState(snap)) is { } st2) SendToPropertyInspector("pi.state", st2);
    }

    /// <summary>What the last frame showed (tests).</summary>
    internal KeyModel? LastModel { get; private set; }

    private CoolingGlyph GlyphFor =>Kind == SensorKind.Pump ? CoolingGlyph.Pump : CoolingGlyph.Fan;

    /// <summary>Full scale: the user's value, else 125 % of the highest reading in the last 15 minutes, rounded up to 250 RPM.</summary>
    private double FullScale(CoolingSensor s, double? recentMax)
    {
        if (Settings.MaxRpm > 0) return Settings.MaxRpm;
        var peak = Math.Max(recentMax ?? 0, s.Value ?? 0);
        if (peak <= 0) return 0;
        return Math.Ceiling(peak * 1.25 / 250) * 250;
    }

    internal static string WhyNot(CoolingSnapshot snap) => snap.Status switch
    {
        CoolingStatus.Idle or CoolingStatus.Connecting => "CONNECTING",
        _ when snap.Providers.FirstOrDefault(p => p.Name == "icue") is { State: ProviderState.NotRunning } && snap.Sensors.Count == 0 => "ICUE OFF",
        _ => "NO SENSOR",
    };
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.cooling.fan", Name = "Fan Speed",
    Icon = "imgs/actions/cooling/fan/icon", KeyImage = "imgs/actions/cooling/fan/key",
    Tooltip = "Live RPM of one fan (iCUE or LibreHardwareMonitor) with a history sparkline. Press: min/max.")]
public sealed class FanKey : SensorKeyBase
{
    protected override SensorKind Kind => SensorKind.Fan;
    protected override string DefaultLabel => "Fan";
    protected override string OptionsRequest => "cooling.fans";
    protected override string AutoLabel => "Automatic (first radiator fan)";

    protected override CoolingSensor? AutoPick(CoolingSnapshot snap) =>
        snap.Group(FanGroup.Radiator).Members.FirstOrDefault() ?? snap.Group(FanGroup.AllFans).Members.FirstOrDefault() ?? snap.OfKind(SensorKind.Fan).FirstOrDefault();
}

[StreamDeckAction("com.jeremyfhall.prismcontrol.cooling.pump", Name = "Pump Speed",
    Icon = "imgs/actions/cooling/pump/icon", KeyImage = "imgs/actions/cooling/pump/key",
    Tooltip = "Live AIO pump RPM with the coolant temperature and a history sparkline. Press: min/max.")]
public sealed class PumpKey : SensorKeyBase
{
    protected override SensorKind Kind => SensorKind.Pump;
    protected override string DefaultLabel => "Pump";
    protected override string OptionsRequest => "cooling.pumps";
    protected override string AutoLabel => "Automatic (first pump)";

    protected override bool Matches(CoolingSensor s) => s.Kind == SensorKind.Pump || (s.Kind == SensorKind.Fan && s.Role == CoolingRole.Pump);

    protected override CoolingSensor? AutoPick(CoolingSnapshot snap) => snap.Group(FanGroup.Pump).Members.FirstOrDefault() ?? snap.OfKind(SensorKind.Pump).FirstOrDefault();

    protected override string SubText(CoolingSnapshot snap, CoolingSensor s) =>
        snap.Coolant?.Value is { } c ? $"RPM · {CoolingFormat.TempWhole(c)}C" : base.SubText(snap, s);
}
