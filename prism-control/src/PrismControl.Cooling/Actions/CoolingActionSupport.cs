using PrismControl.Core.Hosting;

namespace PrismControl.Cooling.Actions;

/// <summary>
/// Shared plumbing for the cooling actions: the sampling lease (sampling runs only while something shows cooling data),
/// PI option lists, and the PI status line. One per action instance; used only from the instance's mailbox.
/// </summary>
internal sealed class CoolingBinding : IDisposable
{
    private IDisposable? _lease;
    private string? _lastPiState;

    public CoolingService? Service { get; private set; }

    public bool Bind(IServiceRegistry services)
    {
        if (Service is null && services.TryGet<CoolingService>(out var s)) Service = s;
        if (Service is not null) _lease ??= Service.Acquire();
        return Service is not null;
    }

    public CoolingSnapshot Snapshot => Service?.Current ?? CoolingSnapshot.Empty;

    public void Release()
    {
        _lease?.Dispose();
        _lease = null;
    }

    public void Dispose() => Release();

    /// <summary>Returns the state object to push to the PI when it changed since the last push (null = nothing new).</summary>
    public object? PiStateIfChanged(object state)
    {
        var key = System.Text.Json.JsonSerializer.Serialize(state, state.GetType());
        if (key == _lastPiState) return null;
        _lastPiState = key;
        return state;
    }

    public void ResetPiState() => _lastPiState = null;

    /// <summary>Replaces an old sensor id (an alias) with the sensor's current id. True when it changed.</summary>
    public static bool Canonicalize(CoolingSnapshot snap, string? id, Action<string> set)
    {
        if (string.IsNullOrEmpty(id) || snap.Find(id) is not { } s || s.Id == id) return false;
        set(s.Id);
        return true;
    }

    // ------------------------------------------------------------------ PI option lists

    public static List<object> SensorOptions(CoolingSnapshot snap, Func<CoolingSensor, bool> filter, string? autoLabel, string? current)
    {
        var list = new List<object>();
        if (autoLabel is not null) list.Add(new { value = "", label = autoLabel });
        var matches = snap.Sensors.Where(filter).ToList();
        foreach (var s in matches) list.Add(new { value = s.Id, label = Describe(s) });
        current = snap.Find(current)?.Id ?? current;
        if (!string.IsNullOrEmpty(current) && matches.All(s => s.Id != current))
            list.Add(new { value = current, label = "(not connected right now)" });
        if (matches.Count == 0 && autoLabel is null)
            list.Add(new { value = "", label = snap.Status == CoolingStatus.Idle ? "(starting…)" : "(no sensors: " + snap.StatusText + ")" });
        return list;
    }

    public static string Describe(CoolingSensor s)
    {
        var value = s.HasValue ? (s.IsRpm ? $"{Math.Round(s.Value!.Value):0} RPM" : $"{s.Value:0.0} °C") : "no signal";
        var device = s.Device.Length > 30 ? s.Device[..29] + "…" : s.Device;
        var role = s.Kind == SensorKind.Fan ? " · " + Roles.Label(s.Role).ToLowerInvariant() : "";
        var src = s.Source == "lhm" ? " · LHM" : "";
        return $"{s.Name} — {device}{src} ({value}{role})";
    }

    public static string Reading(CoolingSensor? s) => s is null
        ? "–"
        : $"{s.OriginalName} · {s.Device} · {(s.Source == "icue" ? "iCUE" : "LibreHardwareMonitor")} · {(s.RoleIsUser ? "role set by you" : "role: " + Roles.Label(s.Role).ToLowerInvariant() + " (automatic)")}";
}

/// <summary>
/// Bridges the PI's per-action fields to the SHARED, plugin-wide sensor name and role (stored by
/// <see cref="CoolingService"/> in the "cooling" global settings section). When the selected sensor changes, the
/// fields are reloaded from the shared values; when the user edits them, the shared values are updated.
/// </summary>
internal sealed class SharedSensorEditor
{
    private string? _id;
    private bool _loaded;

    /// <summary>Loads the shared name/role of <paramref name="id"/> into the fields. Returns true if the fields changed.</summary>
    public bool Load(CoolingService svc, string? id, Func<string?> getName, Action<string?> setName, Func<string?> getRole, Action<string?> setRole)
    {
        _id = id;
        _loaded = true;
        var name = id is null ? "" : svc.CustomName(id) ?? "";
        var role = svc.RoleOverride(id);
        var changed = (getName() ?? "") != name || (getRole() ?? Roles.Auto) != role;
        setName(name);
        setRole(role);
        return changed;
    }

    /// <summary>Applies a settings change. Returns true when the fields were reloaded (the caller should save settings).</summary>
    public bool OnSettingsChanged(CoolingService svc, string? id, Func<string?> getName, Action<string?> setName, Func<string?> getRole, Action<string?> setRole)
    {
        if (!_loaded || !string.Equals(id, _id, StringComparison.Ordinal))
            return Load(svc, id, getName, setName, getRole, setRole);
        if (id is null) return false;
        var name = (getName() ?? "").Trim();
        if (name != (svc.CustomName(id) ?? "")) svc.SetName(id, name);
        var role = Roles.Parse(getRole()) is { } r ? Roles.Wire(r) : Roles.Auto;
        if (role != svc.RoleOverride(id)) svc.SetRole(id, role);
        return false;
    }
}

/// <summary>Bridges per-action PI fields to the shared source options (CPU temperature source, LHM on/off and port).</summary>
internal sealed class SourceOptionsEditor
{
    private bool _loaded;

    public bool Load(CoolingService svc, IHasSourceOptions s)
    {
        _loaded = true;
        var g = svc.Settings;
        var changed = s.CpuTempSource != g.CpuTempSource || s.UseLhm != g.UseLhm || s.LhmPort != g.LhmPort;
        s.CpuTempSource = g.CpuTempSource;
        s.UseLhm = g.UseLhm;
        s.LhmPort = g.LhmPort;
        return changed;
    }

    public void OnSettingsChanged(CoolingService svc, IHasSourceOptions s)
    {
        if (!_loaded) { Load(svc, s); return; }
        var g = svc.Settings;
        if (CpuSources.Normalize(s.CpuTempSource) != g.CpuTempSource) svc.SetCpuTempSource(s.CpuTempSource);
        if (s.UseLhm != g.UseLhm) svc.SetUseLhm(s.UseLhm);
        if (s.LhmPort != g.LhmPort && s.LhmPort > 0) svc.SetLhmPort(s.LhmPort);
    }
}

/// <summary>Settings classes that carry the shared source options.</summary>
public interface IHasSourceOptions
{
    string CpuTempSource { get; set; }
    bool UseLhm { get; set; }
    int LhmPort { get; set; }
}
