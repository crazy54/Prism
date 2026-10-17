using System.Globalization;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>An integer rectangle in physical (per-monitor-DPI-aware) desktop pixels. Right/Bottom are exclusive.</summary>
public readonly record struct RectI(int Left, int Top, int Right, int Bottom)
{
    public int Width => Right - Left;
    public int Height => Bottom - Top;
    public bool IsEmpty => Width <= 0 || Height <= 0;

    public override string ToString() =>
        string.Create(CultureInfo.InvariantCulture, $"({Left},{Top})-({Right},{Bottom}) {Width}x{Height}");

    internal static RectI From(in RECT r) => new(r.Left, r.Top, r.Right, r.Bottom);
}

/// <summary>
/// Runs a block on a thread that is per-monitor DPI aware (v2). Prism Control has no app manifest, so it is DPI-unaware and
/// geometry APIs return virtualized coordinates on scaled monitors (research/windows.md §1.2). Every geometry call in this
/// library goes through a scope; module code that calls GetWindowRect, SetWindowPos or GetMonitorInfo itself should too:
/// <code>using (DpiScope.PerMonitorV2()) { ... }</code>
/// </summary>
public readonly struct DpiScope : IDisposable
{
    private readonly nint _previous;

    private DpiScope(nint previous) => _previous = previous;

    /// <summary>Switches the current thread to PER_MONITOR_AWARE_V2 until disposed (restores the previous context).</summary>
    public static DpiScope PerMonitorV2() => new(User32.SetThreadDpiAwarenessContext(User32.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2));

    public void Dispose()
    {
        if (_previous != 0) User32.SetThreadDpiAwarenessContext(_previous);
    }
}

/// <summary>
/// Per-user paths shared by the plugin, the modules and prism-relay.exe. Mirrors the exe's PluginPaths: the root is
/// <c>%APPDATA%\Prism\control</c>, overridden by <c>PRISM_CONTROL_DIR</c> (tests set it; prism-relay honors it too).
/// </summary>
public static class DesktopPaths
{
    public const string DirEnv = "PRISM_CONTROL_DIR";

    /// <summary>%APPDATA%\Prism\control (or PRISM_CONTROL_DIR).</summary>
    public static string UserDirectory
    {
        get
        {
            var overridden = Environment.GetEnvironmentVariable(DirEnv);
            if (!string.IsNullOrWhiteSpace(overridden)) return Path.GetFullPath(overridden);
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Prism", "control");
        }
    }

    /// <summary>%APPDATA%\Prism\control\modules\&lt;module&gt; (the same folder as IModuleContext.DataDirectory).</summary>
    public static string ModuleDirectory(string module) => Path.Combine(UserDirectory, "modules", module.ToLowerInvariant());

    /// <summary>The discovery file prism-relay reads for a module: modules\&lt;module&gt;\ingress.json.</summary>
    public static string IngressFile(string module) => Path.Combine(ModuleDirectory(module), "ingress.json");

    /// <summary>%APPDATA%\Prism\control\relay (RelayInstaller copies prism-relay.exe into &lt;version&gt;\ here).</summary>
    public static string RelayDirectory => Path.Combine(UserDirectory, "relay");
}
