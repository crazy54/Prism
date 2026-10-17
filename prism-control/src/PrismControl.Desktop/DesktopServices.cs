using PrismControl.Core.Hosting;

namespace PrismControl.Desktop;

/// <summary>
/// The shared desktop services for one plugin process: one shell thread, one foreground tracker, and the real or
/// safe-mode implementations picked once. Modules call <see cref="GetOrCreate"/> in Initialize; the first call creates
/// the set and registers it (and each interface) in <see cref="IModuleContext.Services"/>, later calls (other modules)
/// get the same instance. Disposed when the plugin shuts down.
/// </summary>
public sealed class DesktopServices : IDisposable
{
    private static readonly object Gate = new();
    private readonly ShellThread _shell;
    private readonly ForegroundTracker _tracker;
    private readonly WindowCatalog _catalog;
    private readonly ILog _log;
    private int _disposed;
    private string? _badKeyLogged;
    private IGlobalSettings? _globals;
    private EventHandler<GlobalSettingsChangedEventArgs>? _onGlobals;

    private DesktopServices(bool safeMode, ILog log)
    {
        SafeMode = safeMode;
        _log = log;
        _shell = new ShellThread(log);
        _tracker = new ForegroundTracker(_shell, log);
        _catalog = new WindowCatalog(_shell, log);
        Foreground = safeMode ? new SafeModeForegroundService(_tracker, log) : new ForegroundService(_shell, _tracker, log);
        Input = safeMode ? new RecordingInputSender(log) : new SendInputSender(log);
        Mouse = safeMode ? new RecordingMouseSender(log) : new SendInputMouseSender(log);
        Icons = new IconProvider(_shell, log);
        // A momentary RegisterHotKey/UnregisterHotKey is a read, not input: real in safe mode too.
        Hotkeys = new ShellHotkeyProbe(_shell, log);
        if (safeMode) log.Info("Safe mode: foreground changes, keystrokes and mouse input are logged, not performed.");
    }

    public bool SafeMode { get; }

    /// <summary>The STA shell thread (message pump, broadcasts, COM).</summary>
    public IShellThread Shell => _shell;

    public IForegroundService Foreground { get; }

    public IInputSender Input { get; }

    public IMouseSender Mouse { get; }

    public IWindowCatalog Windows => _catalog;

    public IIconProvider Icons { get; }

    /// <summary>Is a key free of other apps' global hotkeys (before pressing F13–F24 for real)?</summary>
    public IHotkeyProbe Hotkeys { get; }

    /// <summary>
    /// The process-wide instance: created on the first call (safe mode from <paramref name="ctx"/>), registered in
    /// ctx.Services as DesktopServices, IShellThread, IForegroundService, IInputSender, IMouseSender, IWindowCatalog,
    /// IIconProvider and IHotkeyProbe, and disposed when ctx.ShutdownToken fires. The global-settings section
    /// <see cref="DesktopGlobalSettings.Section"/> ("desktop") is applied once the settings load and on every change.
    /// </summary>
    public static DesktopServices GetOrCreate(IModuleContext ctx)
    {
        ArgumentNullException.ThrowIfNull(ctx);
        lock (Gate)
        {
            if (ctx.Services.TryGet<DesktopServices>(out var existing)) return existing;
            var s = new DesktopServices(ctx.SafeMode, ctx.Log.For("desktop"));
            ctx.Services.Add(s);
            ctx.Services.Add(s.Shell);
            ctx.Services.Add(s.Foreground);
            ctx.Services.Add(s.Input);
            ctx.Services.Add(s.Mouse);
            ctx.Services.Add(s.Windows);
            ctx.Services.Add(s.Icons);
            ctx.Services.Add(s.Hotkeys);
            ctx.ShutdownToken.Register(s.Dispose);
            s.FollowGlobalSettings(ctx);
            return s;
        }
    }

    /// <summary>A standalone instance (tools and tests). Prefer <see cref="GetOrCreate"/> in modules.</summary>
    public static DesktopServices Create(bool safeMode, ILog? log = null) => new(safeMode, log ?? NullLog.Instance);

    /// <summary>
    /// Applies the "desktop" section to the foreground service (when it supports <see cref="IHotkeyTrickSettings"/>).
    /// An invalid <see cref="DesktopGlobalSettings.FocusTrickKey"/> keeps the current key (logged once).
    /// </summary>
    public void ApplySettings(DesktopGlobalSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        if (Foreground is not IHotkeyTrickSettings trick) return;
        trick.HotkeyTrickEnabled = settings.FocusTrick;
        if (FunctionKeys.Parse(settings.FocusTrickKey) is { } key) trick.HotkeyTrickKey = key;
        else if (_badKeyLogged != settings.FocusTrickKey)
        {
            _badKeyLogged = settings.FocusTrickKey;
            _log.Warn($"desktop.focusTrickKey must be F13–F24; keeping {FunctionKeys.Name(trick.HotkeyTrickKey)}.");
        }
    }

    /// <summary>Reads the section after the first load and on every change; contexts without global settings are fine.</summary>
    private void FollowGlobalSettings(IModuleContext ctx)
    {
        IGlobalSettings? g;
        try { g = ctx.GlobalSettings; }
        catch (Exception ex) when (ex is NotSupportedException or NotImplementedException or InvalidOperationException) { return; }
        if (g is null) return;
        void Apply()
        {
            if (Volatile.Read(ref _disposed) != 0) return;
            try { ApplySettings(g.GetSection<DesktopGlobalSettings>(DesktopGlobalSettings.Section)); }
            catch (Exception ex) { _log.Debug("desktop global settings unreadable: " + ex.GetType().Name); }
        }
        _globals = g;
        _onGlobals = (_, _) => Apply();
        g.Changed += _onGlobals;
        _ = Task.Run(async () =>
        {
            try { await g.WaitForLoadAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false); }
            catch (Exception) { /* apply what is there */ }
            Apply();
        });
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        if (_globals is { } g && _onGlobals is { } h) g.Changed -= h;
        (Input as IDisposable)?.Dispose(); // releases any key still held
        _catalog.Dispose();
        _tracker.Dispose();
        _shell.Dispose();
    }
}
