using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;

namespace PrismControl.Core.Hosting;

public enum LogLevel { Debug = 0, Info = 1, Warn = 2, Error = 3 }

/// <summary>Plugin log (file under %APPDATA%\Prism\control\logs; warnings and errors also go to the Stream Deck app log).
/// Never log tokens, secrets or personal data.</summary>
public interface ILog
{
    void Write(LogLevel level, string message, Exception? exception = null);
    /// <summary>A child log whose lines are prefixed with <paramref name="category"/>.</summary>
    ILog For(string category);
    bool IsEnabled(LogLevel level);
}

public static class LogExtensions
{
    public static void Debug(this ILog log, string message) { if (log.IsEnabled(LogLevel.Debug)) log.Write(LogLevel.Debug, message); }
    public static void Info(this ILog log, string message) => log.Write(LogLevel.Info, message);
    public static void Warn(this ILog log, string message, Exception? ex = null) => log.Write(LogLevel.Warn, message, ex);
    public static void Error(this ILog log, string message, Exception? ex = null) => log.Write(LogLevel.Error, message, ex);
}

/// <summary>A log that discards everything (tests, tools).</summary>
public sealed class NullLog : ILog
{
    public static readonly NullLog Instance = new();
    public void Write(LogLevel level, string message, Exception? exception = null) { }
    public ILog For(string category) => this;
    public bool IsEnabled(LogLevel level) => false;
}

/// <summary>Shared singletons (one Spotify client, one audio engine...). Modules add; actions get.</summary>
public interface IServiceRegistry
{
    void Add<T>(T instance) where T : class;
    T Get<T>() where T : class;
    bool TryGet<T>(out T instance) where T : class;
}

public sealed class ServiceRegistry : IServiceRegistry
{
    private readonly Dictionary<Type, object> _map = new();
    private readonly object _gate = new();

    public void Add<T>(T instance) where T : class
    {
        ArgumentNullException.ThrowIfNull(instance);
        lock (_gate) _map[typeof(T)] = instance;
    }

    public T Get<T>() where T : class =>
        TryGet<T>(out var v) ? v : throw new InvalidOperationException($"Service {typeof(T).Name} is not registered (did its module fail to initialize?).");

    public bool TryGet<T>(out T instance) where T : class
    {
        lock (_gate)
        {
            if (_map.TryGetValue(typeof(T), out var o)) { instance = (T)o; return true; }
        }
        instance = null!;
        return false;
    }
}

/// <summary>Plugin-wide settings owned by the core (section "core" of the global settings).</summary>
public sealed class CoreSettings
{
    /// <summary>Total setImage/setFeedback/setFeedbackLayout/setTitle per second across all devices (5-240, default 60).</summary>
    public double UpdateBudget { get; set; } = 60;
    /// <summary>"night" (default for LCD keys) or "day".</summary>
    public string Theme { get; set; } = "night";
    /// <summary>No looping animations when true.</summary>
    public bool ReducedMotion { get; set; }
}

public sealed class GlobalSettingsChangedEventArgs(JsonObject settings, bool fromPropertyInspector) : EventArgs
{
    public JsonObject Settings { get; } = settings;
    /// <summary>True when the change came from didReceiveGlobalSettings (a PI edit or the initial load), false for local SetSection calls.</summary>
    public bool FromStreamDeck { get; } = fromPropertyInspector;
}

/// <summary>
/// The plugin's global settings: one JSON object stored by the Stream Deck app, split into sections
/// ("core", "audio", "spotify", "eq", "macros", ...). Each module owns its section. Do not store secrets here
/// (they are plain text in the app's store); use <see cref="Security.SecretStore"/> (DPAPI).
/// </summary>
public interface IGlobalSettings
{
    bool IsLoaded { get; }
    /// <summary>Completes when the first didReceiveGlobalSettings arrived (or the timeout elapsed).</summary>
    Task WaitForLoadAsync(TimeSpan timeout);
    JsonObject Snapshot();
    T GetSection<T>(string section) where T : class, new();
    /// <summary>Replaces one section and sends the merged object with setGlobalSettings.</summary>
    void SetSection<T>(string section, T value) where T : class;
    CoreSettings Core { get; }
    event EventHandler<GlobalSettingsChangedEventArgs>? Changed;
}

/// <summary>Plugin-level events for modules.</summary>
public interface IPluginEvents
{
    event EventHandler<DeviceInfo>? DeviceConnected;
    event EventHandler<string>? DeviceDisconnected;
    event EventHandler? SystemWokeUp;
    /// <summary>An application listed in a module's MonitorApplications launched (payload: the exe name).</summary>
    event EventHandler<string>? ApplicationLaunched;
    event EventHandler<string>? ApplicationTerminated;
    /// <summary>streamdeck://plugins/message/com.jeremyfhall.prismcontrol/... (payload: the URL).</summary>
    event EventHandler<string>? DeepLinkReceived;
    /// <summary>The Stream Deck connection (re)registered.</summary>
    event EventHandler? Connected;
    event EventHandler? Disconnected;
}

public interface IDeviceDirectory
{
    IReadOnlyCollection<DeviceInfo> All { get; }
    DeviceInfo? Find(string deviceId);
}

/// <summary>What a module gets at start-up.</summary>
public interface IModuleContext
{
    ILog Log { get; }
    IDataRegistry Data { get; }
    IServiceRegistry Services { get; }
    IGlobalSettings GlobalSettings { get; }
    IPluginEvents Events { get; }
    IDeviceDirectory Devices { get; }
    TimeProvider Time { get; }
    /// <summary>Cancelled when the plugin shuts down. Background loops must observe it.</summary>
    CancellationToken ShutdownToken { get; }
    /// <summary>The .sdPlugin folder (read-only at runtime; never read manifest.json).</summary>
    string PluginDirectory { get; }
    /// <summary>A per-user, per-module writable folder: %APPDATA%\Prism\control\modules\&lt;name&gt;.</summary>
    string DataDirectory { get; }
    /// <summary>Opens a URL or URI in the default handler via the Stream Deck app (openUrl).</summary>
    void OpenUrl(string url);

    /// <summary>
    /// Safe mode (<c>PRISM_CONTROL_SAFE_MODE=1</c>; the fake host and the E2E suite always set it). While it is true, every
    /// write path that changes this PC must be a no-op or a fake; reads stay real. Read it once in Initialize and hand it
    /// to your services. The default implementation reads the environment, so test contexts need not implement it.
    /// </summary>
    bool SafeMode => SafeModeEnvironment.FromEnvironment();
}

/// <summary>
/// A domain module (Audio, SystemInfo, Spotify, Eq, Macros). Declared with
/// <c>[assembly: PrismModule(typeof(MyModule))]</c>; constructed once with a public parameterless constructor.
/// Initialize must be quick: start background work as tasks that observe <see cref="IModuleContext.ShutdownToken"/>.
/// Implement <see cref="IAsyncDisposable"/> to clean up on shutdown.
/// </summary>
public interface IPrismModule
{
    string Name { get; }
    void Initialize(IModuleContext context);
}

[AttributeUsage(AttributeTargets.Assembly, AllowMultiple = false)]
public sealed class PrismModuleAttribute(Type moduleType) : Attribute
{
    public Type ModuleType { get; } = moduleType;
    /// <summary>Windows executables to monitor (manifest ApplicationsToMonitor), e.g. "Spotify.exe".</summary>
    public string[] MonitorApplications { get; set; } = [];
}
