using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;

namespace PrismControl.Hosting;

/// <summary>The plugin's global settings (one JSON object in the app, split into per-module sections).</summary>
internal sealed class GlobalSettingsStore : IGlobalSettings
{
    private readonly object _gate = new();
    private readonly TaskCompletionSource _loaded = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Action<JsonObject> _send;
    private readonly ILog _log;
    private JsonObject _settings = new();
    private CoreSettings _core = new();

    public GlobalSettingsStore(Action<JsonObject> send, ILog log)
    {
        _send = send;
        _log = log;
    }

    public event EventHandler<GlobalSettingsChangedEventArgs>? Changed;

    public bool IsLoaded => _loaded.Task.IsCompleted;
    public CoreSettings Core { get { lock (_gate) return _core; } }

    public Task WaitForLoadAsync(TimeSpan timeout) => Task.WhenAny(_loaded.Task, Task.Delay(timeout));

    public JsonObject Snapshot()
    {
        lock (_gate) return (JsonObject)_settings.DeepClone();
    }

    public T GetSection<T>(string section) where T : class, new()
    {
        JsonNode? node;
        lock (_gate) node = _settings[section]?.DeepClone();
        if (node is null) return new T();
        var problems = new List<string>();
        var value = ActionJson.ReadOrDefault<T>(node, problems);
        if (problems.Count > 0) _log.Warn($"Global settings section '{section}': invalid values ignored, using defaults for: {string.Join("; ", problems)}");
        return value;
    }

    public void SetSection<T>(string section, T value) where T : class
    {
        JsonObject copy;
        lock (_gate)
        {
            _settings[section] = ActionJson.ToNode(value);
            if (section == "core") _core = ParseCore(_settings);
            copy = (JsonObject)_settings.DeepClone();
        }
        _send(copy);
        Raise(copy, fromStreamDeck: false);
    }

    /// <summary>didReceiveGlobalSettings.</summary>
    public void OnReceived(JsonObject settings)
    {
        JsonObject copy;
        lock (_gate)
        {
            _settings = (JsonObject)settings.DeepClone();
            _core = ParseCore(_settings);
            copy = (JsonObject)_settings.DeepClone();
        }
        _loaded.TrySetResult();
        Raise(copy, fromStreamDeck: true);
    }

    private CoreSettings ParseCore(JsonObject s)
    {
        return s["core"] is JsonObject c ? ActionJson.ReadOrDefault<CoreSettings>(c) : new CoreSettings();
    }

    private void Raise(JsonObject copy, bool fromStreamDeck)
    {
        try { Changed?.Invoke(this, new GlobalSettingsChangedEventArgs(copy, fromStreamDeck)); }
        catch (Exception ex) { _log.Error("A global settings handler failed", ex); }
    }
}

internal sealed class DeviceDirectory : IDeviceDirectory
{
    private readonly ConcurrentDictionary<string, DeviceInfo> _devices = new(StringComparer.Ordinal);

    public DeviceDirectory(IEnumerable<DeviceInfo> initial)
    {
        foreach (var d in initial) _devices[d.Id] = d;
    }

    public IReadOnlyCollection<DeviceInfo> All => _devices.Values.ToArray();
    public DeviceInfo? Find(string deviceId) => _devices.TryGetValue(deviceId, out var d) ? d : null;
    public DeviceInfo GetOrUnknown(string deviceId) => Find(deviceId) ?? DeviceInfo.Unknown(deviceId);
    public void Upsert(DeviceInfo d) => _devices[d.Id] = d;
    public void Remove(string id) => _devices.TryRemove(id, out _);
}

internal sealed class PluginEvents : IPluginEvents
{
    public event EventHandler<DeviceInfo>? DeviceConnected;
    public event EventHandler<string>? DeviceDisconnected;
    public event EventHandler? SystemWokeUp;
    public event EventHandler<string>? ApplicationLaunched;
    public event EventHandler<string>? ApplicationTerminated;
    public event EventHandler<string>? DeepLinkReceived;
    public event EventHandler? Connected;
    public event EventHandler? Disconnected;

    public ILog? Log { get; set; }

    public void RaiseDeviceConnected(DeviceInfo d) => Safe(() => DeviceConnected?.Invoke(this, d));
    public void RaiseDeviceDisconnected(string id) => Safe(() => DeviceDisconnected?.Invoke(this, id));
    public void RaiseSystemWokeUp() => Safe(() => SystemWokeUp?.Invoke(this, EventArgs.Empty));
    public void RaiseApplication(string app, bool launched) => Safe(() => (launched ? ApplicationLaunched : ApplicationTerminated)?.Invoke(this, app));
    public void RaiseDeepLink(string url) => Safe(() => DeepLinkReceived?.Invoke(this, url));
    public void RaiseConnected() => Safe(() => Connected?.Invoke(this, EventArgs.Empty));
    public void RaiseDisconnected() => Safe(() => Disconnected?.Invoke(this, EventArgs.Empty));

    // Module handlers run in order on one serial queue, off the receive loop, so a slow module never blocks it.
    private readonly ActionMailbox _queue;

    public PluginEvents() => _queue = new ActionMailbox(ex => Log?.Error("A plugin event handler failed", ex));

    private void Safe(Action a) => _queue.Post(() => { a(); return Task.CompletedTask; });
}

internal sealed class ModuleContext(
    string name, ILog log, IDataRegistry data, IServiceRegistry services, IGlobalSettings globalSettings,
    IPluginEvents events, IDeviceDirectory devices, TimeProvider time, CancellationToken shutdown, Action<string> openUrl, bool safeMode) : IModuleContext
{
    public bool SafeMode { get; } = safeMode;
    public ILog Log { get; } = log;
    public IDataRegistry Data { get; } = data;
    public IServiceRegistry Services { get; } = services;
    public IGlobalSettings GlobalSettings { get; } = globalSettings;
    public IPluginEvents Events { get; } = events;
    public IDeviceDirectory Devices { get; } = devices;
    public TimeProvider Time { get; } = time;
    public CancellationToken ShutdownToken { get; } = shutdown;
    public string PluginDirectory => PluginPaths.PluginDirectory;
    public string DataDirectory
    {
        get
        {
            var dir = PluginPaths.ModuleDirectory(name);
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public void OpenUrl(string url) => openUrl(url);
}

/// <summary>Live numbers for the diagnostics action and /v1/health.</summary>
public interface IPluginDiagnostics
{
    Core.Scheduling.SchedulerStats Scheduler { get; }
    long FramesSent { get; }
    long FramesReceived { get; }
    long Dropped { get; }
    long Reconnects { get; }
    bool Connected { get; }
    int ActionInstances { get; }
    TimeSpan Uptime { get; }
    /// <summary>PRISM_CONTROL_SAFE_MODE=1 (fake host, E2E): module writes are no-ops or fakes.</summary>
    bool SafeMode { get; }
}
