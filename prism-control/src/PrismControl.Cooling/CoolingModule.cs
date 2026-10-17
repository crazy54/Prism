using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Cooling.Api;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Lhm;

[assembly: PrismModule(typeof(PrismControl.Cooling.CoolingModule))]

namespace PrismControl.Cooling;

/// <summary>
/// Cooling telemetry: fan, AIO pump and radiator-fan speeds, coolant and CPU package temperatures. READ-ONLY, from
/// Corsair iCUE's local sensor pipes (primary) with LibreHardwareMonitor's web server as the fallback and CPU-temp source.
/// Registers <see cref="CoolingService"/>, the shared <see cref="ICpuTemperatureSource"/> (so SystemInfo can show iCUE's
/// CPU package temperature when it has no provider of its own) and the <c>/v1/cooling</c> data endpoint. Nothing is
/// sampled until a cooling key/dial is visible, the endpoint is polled or the shared CPU temperature is read.
/// No safe-mode gate is needed: nothing here writes to the system (iCUE is read through allowlisted getters only).
/// </summary>
public sealed class CoolingModule : IPrismModule, IAsyncDisposable
{
    private CoolingService? _service;
    private IGlobalSettings? _globals;
    private EventHandler<GlobalSettingsChangedEventArgs>? _onSettings;
    private DataPublisher<CoolingPayload>? _publisher;
    private EventHandler? _onDemand;

    public string Name => "cooling";

    public void Initialize(IModuleContext context)
    {
        var log = context.Log.For("cooling");
        var icue = new IcueProvider(log.For("icue"), context.Time);
        var lhm = new LhmProvider(log.For("lhm"), context.Time);
        var service = _service = new CoolingService([icue, lhm], context.GlobalSettings, context.Time, log);
        context.Services.Add(service);
        context.Services.Add<ICpuTemperatureSource>(service);
        // Our own SetSection calls are already applied; only the app's copy (initial load, a PI edit) needs a reload.
        _globals = context.GlobalSettings;
        _onSettings = (_, e) => { if (e.FromStreamDeck) service.ReloadSettings(); };
        _globals.Changed += _onSettings;

        try
        {
            var topic = context.Data.Custom(CoolingApi.Path, CoolingJsonContext.Wire.CoolingPayload, TimeSpan.FromSeconds(1));
            var publisher = topic.Claim("cooling", TimeSpan.FromSeconds(1));
            if (publisher is not null)
            {
                // Demand-driven: polling the endpoint starts sampling; it stops 15 s after the last request (and the last visible key).
                _publisher = publisher;
                service.AddDemand(() => publisher.IsDemanded);
                _onDemand = (_, _) => service.Wake();
                publisher.DemandStarted += _onDemand;
                service.Updated += snap => publisher.Publish(CoolingApi.Map(snap));
                service.Stopped += publisher.Clear;
            }
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            log.Warn("Cooling: the /v1/cooling endpoint could not be registered", ex);
        }
        log.Info("Cooling module ready (iCUE primary, LibreHardwareMonitor fallback; read-only).");
    }

    public async ValueTask DisposeAsync()
    {
        if (_globals is not null && _onSettings is not null) _globals.Changed -= _onSettings;
        if (_publisher is not null && _onDemand is not null) _publisher.DemandStarted -= _onDemand;
        _onSettings = null;
        _onDemand = null;
        if (_service is not null) await _service.DisposeAsync().ConfigureAwait(false);
    }
}
