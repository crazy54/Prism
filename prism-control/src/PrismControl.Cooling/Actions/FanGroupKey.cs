using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.Cooling.Art;

namespace PrismControl.Cooling.Actions;

public sealed class FanGroupSettings : IHasSourceOptions
{
    /// <summary>"auto" (radiator fans when assigned, else all fans), "radiator", "case", "unassigned", "allFans", "pump", "gpu".</summary>
    public string Group { get; set; } = FanGroups.Auto;
    /// <summary>"avg" | "min" | "max" (a key press cycles it).</summary>
    public string Stat { get; set; } = "avg";
    public int MaxRpm { get; set; }

    // The shared sensor editor (name + role of any sensor) and source options, bridged to the plugin-wide settings.
    public string? EditSensorId { get; set; }
    public string? EditName { get; set; }
    public string? EditRole { get; set; } = Roles.Auto;
    public string CpuTempSource { get; set; } = CpuSources.Auto;
    public bool UseLhm { get; set; } = true;
    public int LhmPort { get; set; } = Lhm.LhmOptions.DefaultPort;
}

/// <summary>
/// The average, minimum or maximum RPM of a fan group (radiator fans, case fans, pumps…), with one column per member so
/// the spread is visible. Press cycles avg → min → max. Its PI is also where roles and names of any sensor are set.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.cooling.fan-group", Name = "Fan Group",
    Icon = "imgs/actions/cooling/fan-group/icon", KeyImage = "imgs/actions/cooling/fan-group/key",
    Tooltip = "Average / min / max RPM of a fan group (e.g. the CPU radiator fans). Press: avg → min → max.")]
public sealed class FanGroupKey : KeyAction<FanGroupSettings>, IDisposable
{
    private static readonly string[] StatCycle = ["avg", "min", "max"];
    private readonly CoolingBinding _binding = new();
    private readonly SharedSensorEditor _editor = new();
    private readonly SourceOptionsEditor _sources = new();
    private RenderLoop? _loop;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        if (_binding.Bind(Services)) _sources.Load(_binding.Service!, Settings);
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
        var i = Array.IndexOf(StatCycle, NormalizeStat(Settings.Stat));
        Settings.Stat = StatCycle[(i + 1) % StatCycle.Length];
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(FanGroupSettings settings)
    {
        if (_binding.Service is { } svc)
        {
            _sources.OnSettingsChanged(svc, Settings);
            var id = string.IsNullOrEmpty(Settings.EditSensorId) ? null : Settings.EditSensorId;
            if (_editor.OnSettingsChanged(svc, id, () => Settings.EditName, v => Settings.EditName = v, () => Settings.EditRole, v => Settings.EditRole = v))
                SaveSettings();
        }
        _loop?.Invalidate();
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
        .Heading("Fan group")
        .Select("group", "Group", FanGroups.Options)
        .Select("stat", "Show", [("avg", "Average RPM"), ("min", "Slowest fan"), ("max", "Fastest fan")])
        .Number("maxRpm", "Full scale RPM (0 = auto)", 0, 6000, 100)
        .Info("Members", stateKey: "members")
        .Info("Status", stateKey: "status")));

    protected override object? DescribeState() => PiState(_binding.Snapshot);

    private object PiState(CoolingSnapshot snap)
    {
        var g = snap.Group(GroupOf(snap));
        return new
        {
            status = snap.StatusText,
            members = g.Count == 0 ? "none: assign roles below" : string.Join(", ", g.Members.Select(m => m.Name)),
            reading = CoolingBinding.Reading(snap.Find(Settings.EditSensorId)),
        };
    }

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult<object?>(type == CoolingForms.SensorsRequest ? CoolingBinding.SensorOptions(_binding.Snapshot, _ => true, null, Settings.EditSensorId) : null);

    private FanGroup GroupOf(CoolingSnapshot snap) => FanGroups.Parse(Settings.Group) ?? snap.DefaultFanGroup;

    private static string NormalizeStat(string? s) => s?.Trim().ToLowerInvariant() is "min" or "max" ? s.Trim().ToLowerInvariant() : "avg";

    private void Render()
    {
        var t = Theme;
        var snap = _binding.Snapshot;
        var g = GroupOf(snap);
        var stats = snap.Group(g);
        var stat = NormalizeStat(Settings.Stat);
        var value = stat switch { "min" => stats.Min, "max" => stats.Max, _ => stats.Avg };
        var peak = stats.Members.Count == 0 ? 0 : stats.Members.Max(m => m.Value ?? 0);
        var scale = Settings.MaxRpm > 0 ? Settings.MaxRpm : peak <= 0 ? 0 : Math.Ceiling(peak * 1.2 / 250) * 250;
        var hue = CoolingColors.ForGroup(t, g);
        var strongIndex = stat == "min" ? IndexOf(stats.Members, stats.Min) : stat == "max" ? IndexOf(stats.Members, stats.Max) : -1;
        var cols = stats.Members.Select((m, i) => (
            Value: m.Value ?? 0,
            Color: g == FanGroup.AllFans ? CoolingColors.ForGroupMember(t, m.Role) : hue,
            Strong: strongIndex < 0 || i == strongIndex)).ToList();
        var model = new KeyModel
        {
            Label = FanGroups.Label(g),
            Value = CoolingFormat.Rpm(value),
            Sub = stats.Count == 0 ? (_binding.Service is null ? "COOLING OFF" : snap.Sensors.Count == 0 ? SensorKeyBase.WhyNot(snap) : "NO MEMBERS") : $"{stat} RPM",
            Glyph = g == FanGroup.Pump ? CoolingGlyph.Pump : CoolingGlyph.Group,
            Hue = hue,
            Level = value is { } v && scale > 0 ? v / scale : 0,
            Columns = cols,
            ScaleMax = scale,
            Muted = value is null,
        };
        LastModel = model;
        SetImage(CoolingFrames.Key(t, model));
        if (IsPropertyInspectorVisible && _binding.PiStateIfChanged(PiState(snap)) is { } st) SendToPropertyInspector("pi.state", st);
    }

    /// <summary>What the last frame showed (tests).</summary>
    internal KeyModel? LastModel { get; private set; }

    private static int IndexOf(IReadOnlyList<CoolingSensor> members, double? value)
    {
        if (value is null) return -1;
        for (var i = 0; i < members.Count; i++) if (members[i].Value == value) return i;
        return -1;
    }
}

/// <summary>PI form pieces shared by the multi-sensor actions.</summary>
internal static class CoolingForms
{
    public const string SensorsRequest = "cooling.sensors";

    /// <summary>"Name and role of any sensor": pick it, rename it, assign its role (shared by every key and dial).</summary>
    public static PiForm Editor(PiForm f) => f
        .Heading("Sensor names and roles (shared)")
        .Select("editSensorId", "Sensor", optionsFrom: SensorsRequest)
        .Text("editName", "Name", placeholder: "the name iCUE uses")
        .Select("editRole", "Role", Roles.Options)
        .Info("Sensor", stateKey: "reading");

    public static PiForm Sources(PiForm f) => f
        .Heading("Sources (shared)")
        .Select("cpuTempSource", "CPU temperature", CpuSources.Options)
        .Checkbox("useLhm", "Use LibreHardwareMonitor (fallback and CPU temperature)")
        .Number("lhmPort", "LibreHardwareMonitor web server port", 1, 65535, 1);
}
