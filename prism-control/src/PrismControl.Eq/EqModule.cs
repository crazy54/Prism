using PrismControl.Core.Hosting;
using PrismControl.Eq.Apo;
using PrismControl.Eq.Infrastructure;
using PrismControl.Eq.Sonar;

[assembly: PrismModule(typeof(PrismControl.Eq.EqModule))]

namespace PrismControl.Eq;

/// <summary>
/// EQ: SteelSeries Sonar (default) and Equalizer APO backends behind one <see cref="EqService"/>. The backend choice
/// is the "eq" global-settings section (<see cref="EqGlobalSettings"/>), edited by every EQ PI through a
/// <c>global:eq.backend</c> field. No data-API topics.
/// <para>
/// Safe mode (<c>IModuleContext.SafeMode</c>): one <see cref="EqWriteGate"/> goes to the Sonar client and the APO
/// backend, so no Sonar PUT is sent and no APO file or apo-state.json is written; edits stay in memory.
/// </para>
/// </summary>
public sealed class EqModule : IPrismModule, IAsyncDisposable
{
    private EqService? _service;
    private SonarClient? _sonar;
    private IDisposable? _backendSetting;

    public string Name => "eq";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For("eq");
        var writes = new EqWriteGate(context.SafeMode, log);
        if (writes.SafeMode) log.Info("Safe mode: Sonar EQ, presets, volume and ChatMix changes and Equalizer APO attach/edits stay in memory; nothing is sent or written.");
        _sonar = new SonarClient(new SonarDiscovery(SonarDiscovery.DefaultCorePropsPaths(), log), log, context.Time, writes: writes);
        _sonar.WatchDiscoveryFile();
        var sonar = _sonar;
        var mixer = new SonarMixer(sonar, log, context.Time);
        var dataDir = context.DataDirectory;
        var initial = context.GlobalSettings.GetSection<EqGlobalSettings>(EqGlobalSettings.Section).Backend;
        var service = new EqService(id => id == EqService.Apo
                ? new ApoEqBackend(new RegistryApoEnvironment(), dataDir, log.For("apo"), context.Time, writes)
                : new SonarEqBackend(sonar, log.For("sonar"), context.Time),
            log, context.Time, initial, mixer, context.ShutdownToken, writes);
        _service = service;
        context.Services.Add(service);
        _backendSetting = FollowBackendSetting(context.GlobalSettings, service, log);
        log.Info($"EQ module ready (backend: {EqService.DisplayName(initial)}).");
    }

    /// <summary>
    /// Applies the global "eq.backend" to <paramref name="service"/> whenever global settings change (a PI's
    /// <c>global:eq.backend</c> field, another device). Dispose to stop following.
    /// </summary>
    public static IDisposable FollowBackendSetting(IGlobalSettings globals, EqService service, ILog log)
    {
        EventHandler<GlobalSettingsChangedEventArgs> handler = (_, _) =>
        {
            try { service.SelectBackend(globals.GetSection<EqGlobalSettings>(EqGlobalSettings.Section).Backend); }
            catch (Exception ex) { log.Warn("EQ: could not apply the backend setting", ex); }
        };
        globals.Changed += handler;
        return new Unsubscribe(() => globals.Changed -= handler);
    }

    public async ValueTask DisposeAsync()
    {
        _backendSetting?.Dispose();
        if (_service is not null) await _service.DisposeAsync().ConfigureAwait(false); // flushes pending EQ writes
        _sonar?.Dispose();
    }

    private sealed class Unsubscribe(Action undo) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) undo(); }
    }
}
