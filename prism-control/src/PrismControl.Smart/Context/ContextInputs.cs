using PrismControl.Desktop;

namespace PrismControl.Smart.Context;

/// <summary>The app the deck follows: the last external foreground window (never the Stream Deck app or us).</summary>
public sealed record ForegroundApp(nint Hwnd, int Pid, string ProcessName, string? ExePath, string Title, string? Aumid, string? WindowClass, bool IsElevated);

/// <summary>Foreground facts. Real: <see cref="DesktopForegroundSource"/>; tests: a fake.</summary>
public interface IForegroundSource
{
    /// <summary>The app the deck follows (Desktop's LastExternalForeground), or null before the first one.</summary>
    ForegroundApp? Current { get; }
    /// <summary>Whether <paramref name="app"/> (its window, or another window of the same process) is really in front right now. Input is only sent then.</summary>
    bool IsInFront(ForegroundApp app);
    /// <summary>Whether the app's process runs elevated (UIPI would drop our input): never send, show "admin app".</summary>
    bool IsElevated(ForegroundApp app);
    /// <summary>
    /// The window in front right now (GetForegroundWindow, never cached), or 0 when unknown. A press records it as its
    /// target and every later send must still find it there (lead decision 4).
    /// </summary>
    nint ForegroundWindow => 0;
    /// <summary>The foreground app or its title changed (any thread).</summary>
    event Action? Changed;
}

/// <summary>Module / extension / Game Link fields for detectors and readouts (module-prefixed ids). Real: the IVerbRegistry.</summary>
public interface IFieldSource
{
    bool TryRead(string field, out ReadoutValue value);
    event Action? Changed;
}

/// <summary>Reads detector fields from the verb registry: <c>extension</c> fields live under <c>browser.</c>, <c>gameLink</c> under <c>gamelink.</c>.</summary>
public sealed class RegistryFieldSource : IFieldSource
{
    private readonly IVerbRegistry _registry;

    public RegistryFieldSource(IVerbRegistry registry)
    {
        _registry = registry;
        _registry.Changed += () => Changed?.Invoke();
    }

    public event Action? Changed;

    public bool TryRead(string field, out ReadoutValue value) => _registry.TryReadReadout(field, out value);
}

/// <summary>No fields (tests, or before any module registered).</summary>
public sealed class NoFields : IFieldSource
{
    public static readonly NoFields Instance = new();
    public bool TryRead(string field, out ReadoutValue value) { value = ReadoutValue.Unknown; return false; }
    public event Action? Changed { add { } remove { } }
}

/// <summary>Detector field names per detector type (README § Sub-contexts): how they map onto registry ids.</summary>
public static class FieldNames
{
    public static string Extension(string field) => field.StartsWith("browser.", StringComparison.Ordinal) ? field : "browser." + field;
    public static string GameLink(string field) => field.StartsWith("gamelink.", StringComparison.Ordinal) ? field : "gamelink." + field;
    public static string FocusedControl(string field) => field.StartsWith("windows.", StringComparison.Ordinal) ? field : "windows.focusedControl." + field;
    public const string SiteHost = "browser.site.host";
    public const string SitePath = "browser.site.path";
}
