using PrismControl.Core.Hosting;
using PrismControl.WinShell.Shared;

[assembly: PrismModule(typeof(PrismControl.WinShell.WinShellModule))]

namespace PrismControl.WinShell;

/// <summary>
/// The "windows" module (team Prism Play): live window switcher and browser, monitor control over DDC/CI, HDR and
/// refresh-rate presets, the window placer, the virtual desktop pager and game-mode detection (W1), plus system health,
/// firmware, toggles, clipboard, power and capture keys (W2, via <see cref="SystemFeatures.Register"/>).
/// <para>
/// Principles (lead/SPEC-windows.md): every effect comes from a deliberate press; keys show the TRUE state, re-read after
/// every change; disruptive actions confirm; display mode changes auto-revert; streamer-safe hides titles; titles,
/// clipboard text and pixels are never logged; safe mode swaps every writer here, once, and reads stay real.
/// </para>
/// </summary>
public sealed class WinShellModule : IPrismModule, IAsyncDisposable
{
    public const string ModuleName = "windows";

    private WinShellServices? _services;
    private IDisposable? _options;

    public string Name => ModuleName;

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For(ModuleName);
        var safe = context.SafeMode;
        var options = new WinShellOptions();
        _options = options.Bind(context.GlobalSettings);
        var platform = PlatformServices.ForModule(context, log);
        _services = WinShellServices.Build(platform, options, safe, context.Time, log, WinShellReaders.Real(log), WinShellWriters.Real);
        _services.Register(context.Services);
        SmartProvider.WindowsSmartVerbs.Register(context, _services); // SD2: verbs + readouts for the Prism Smart Deck
        if (safe) log.Info("Safe mode: window focus and moves, HDR, refresh rate, DDC/CI, desktop switches and input are logged, not applied.");

        // W2's features (System/, Firmware/, Clipboard/, Capture/). They find W1's services in context.Services.
        SystemFeatures.Register(context);
    }

    public async ValueTask DisposeAsync()
    {
        await SystemFeatures.DisposeAsync().ConfigureAwait(false);
        _options?.Dispose();
        if (_services is not null) await _services.DisposeAsync().ConfigureAwait(false);
        _services = null;
    }
}
