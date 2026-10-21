using PrismControl.Core.Hosting;
using PrismControl.Macros.Engine;

[assembly: PrismModule(typeof(PrismControl.Macros.MacrosModule))]

namespace PrismControl.Macros;

/// <summary>
/// The macro engine: key chords, typed text, media keys, launch app/URL and delays (see Engine/*.cs).
/// Registers one <see cref="MacroEngine"/> service that sends real input (SendInput) and launches through
/// Core.Hosting.ProcessLauncher, except in a dry run: in safe mode (<see cref="IModuleContext.SafeMode"/>; the fake host
/// and E2E) or when <c>PRISM_CONTROL_MACROS_DRY_RUN</c> has any value but "0"/"false", the engine logs and counts instead of
/// typing, launching, opening URLs or focusing windows. Launch steps run only once trusted on this PC (launch-trust.json in
/// the module's DataDirectory; never in action settings, so never in exported profiles).
/// </summary>
public sealed class MacrosModule : IPrismModule, IAsyncDisposable
{
    public const string DryRunVariable = SafeModeEnvironment.MacrosDryRunVariable;

    private MacroEngine? _engine;

    public string Name => "macros";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log; // already scoped to "macros" by the host
        var safeMode = context.SafeMode;
        var dryRun = DryRun.IsOn(safeMode, Environment.GetEnvironmentVariable(DryRunVariable));
        var foreground = new Win32ForegroundInspector();
        // In a dry run the real sink and launcher are never even built: the engine uses its own dry-run effects.
        IInputSink? sink = dryRun ? null : new SendInputSink();
        IAppLauncher? launcher = dryRun ? null : new ShellAppLauncher(log);
        // Safe mode reads the trust list but never writes it: a fake host pressing at random must not trust anything for later.
        var trust = new LaunchTrustStore(context.DataDirectory, log, persist: !safeMode, time: context.Time);
        _engine = new MacroEngine(sink, foreground, launcher, new Win32ScanCodeMap(), log, shutdown: context.ShutdownToken, trust: trust, dryRun: dryRun)
        {
            // The plugin-wide input gate (registered by the Desktop stack), looked up per send: it may register after us.
            InputGate = () => context.Services.TryGet<IInputGate>(out var gate) ? gate : null,
        };
        context.Services.Add(_engine);
        var mode = !dryRun ? "live"
            : safeMode ? "DRY RUN: safe mode; no input is sent, nothing is launched, opened or focused"
            : $"DRY RUN: {DryRunVariable} is set; no input is sent, nothing is launched, opened or focused";
        log.Info($"Macro engine ready ({mode}); plugin integrity {ForegroundInfo.IntegrityName(foreground.OwnIntegrity)}; " +
                 $"{MacroStepRegistry.Default.Types.Count} step types; launch trust {(trust.Persists ? "saved on this PC" : "for this session only")}.");
    }

    public ValueTask DisposeAsync() => _engine?.DisposeAsync() ?? ValueTask.CompletedTask;
}
