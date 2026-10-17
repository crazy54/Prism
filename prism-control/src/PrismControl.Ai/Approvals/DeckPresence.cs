using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Approvals;

/// <summary>What kind of approval-related surface an action instance is.</summary>
public enum SurfaceKind { Approve, Deny, Details }

/// <summary>
/// Which approval surfaces are visible on which connected device, and whether the Stream Deck app is connected at all
/// (ai-apps.md §6.5: no hold without a visible Approve key on a connected device). Instances inside multi-actions never
/// register. Thread-safe.
/// </summary>
public sealed class DeckPresence
{
    private readonly object _gate = new();
    private readonly Dictionary<string, (SurfaceKind Kind, string DeviceId)> _surfaces = new(StringComparer.Ordinal);
    private readonly HashSet<string> _devices = new(StringComparer.Ordinal);
    private bool _connected = true;

    public DeckPresence(IEnumerable<DeviceInfo>? initialDevices = null)
    {
        foreach (var d in initialDevices ?? []) _devices.Add(d.Id);
    }

    public event Action? Changed;

    /// <summary>Wires plugin events: device connect/disconnect, the app connection.</summary>
    public void Attach(IPluginEvents events)
    {
        events.DeviceConnected += (_, d) => { lock (_gate) _devices.Add(d.Id); Changed?.Invoke(); };
        events.DeviceDisconnected += (_, id) => { lock (_gate) _devices.Remove(id); Changed?.Invoke(); };
        events.Connected += (_, _) => SetConnected(true);
        events.Disconnected += (_, _) => SetConnected(false);
    }

    public void SetConnected(bool connected)
    {
        lock (_gate) _connected = connected;
        Changed?.Invoke();
    }

    public void DeviceConnected(string deviceId) { lock (_gate) _devices.Add(deviceId); Changed?.Invoke(); }
    public void DeviceDisconnected(string deviceId) { lock (_gate) _devices.Remove(deviceId); Changed?.Invoke(); }

    /// <summary>Registers a visible surface (willAppear). Multi-action instances are refused.</summary>
    public void Register(string context, SurfaceKind kind, string deviceId, bool inMultiAction)
    {
        if (inMultiAction) return;
        lock (_gate)
        {
            _surfaces[context] = (kind, deviceId);
            // A device the plugin sees an action on is connected (the -info list may be empty in tests or after a reconnect).
            _devices.Add(deviceId);
        }
        Changed?.Invoke();
    }

    public void Unregister(string context)
    {
        bool removed;
        lock (_gate) removed = _surfaces.Remove(context);
        if (removed) Changed?.Invoke();
    }

    public bool AppConnected { get { lock (_gate) return _connected; } }

    public bool IsDeviceConnected(string deviceId) { lock (_gate) return _connected && _devices.Contains(deviceId); }

    /// <summary>Connected devices that show at least one surface of <paramref name="kind"/>.</summary>
    public IReadOnlySet<string> DevicesWith(SurfaceKind kind)
    {
        lock (_gate)
        {
            if (!_connected) return new HashSet<string>();
            return _surfaces.Values.Where(s => s.Kind == kind && _devices.Contains(s.DeviceId)).Select(s => s.DeviceId).ToHashSet(StringComparer.Ordinal);
        }
    }

    public bool AnyVisible(SurfaceKind kind) => DevicesWith(kind).Count > 0;

    private DateTimeOffset? _lastInput;

    /// <summary>The last key / dial / touch on an AI action (review M5: deck use counts as "somebody is here").</summary>
    public DateTimeOffset? LastInput { get { lock (_gate) return _lastInput; } }

    /// <summary>An AI action saw a physical input.</summary>
    public void NoteInput(DateTimeOffset at)
    {
        lock (_gate) if (_lastInput is not { } l || at > l) _lastInput = at;
    }
}
