using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Telemetry;

[assembly: PrismModule(typeof(PrismControl.SystemInfo.SystemInfoModule))]

namespace PrismControl.SystemInfo;

/// <summary>Plugin-wide SystemInfo settings (global settings section "systeminfo"). No secrets.</summary>
public sealed class SystemInfoGlobalSettings
{
    /// <summary>"auto" | "lhm" | "hwinfo" | "off".</summary>
    public string CpuTempSource { get; set; } = "auto";
    /// <summary>LibreHardwareMonitor's Remote Web Server port.</summary>
    public int LhmPort { get; set; } = 8085;
}

/// <summary>
/// System telemetry: CPU (PDH), GPU (NVML, D3DKMT/PDH fallback), RAM, disk, network, and CPU temperature from
/// LibreHardwareMonitor or HWiNFO when one runs, else from the shared Core source (the Cooling module: iCUE's CPU
/// package sensor). One <see cref="TelemetryService"/> samples for every action and the data API (/v1/system), only
/// while something consumes it. READ-ONLY: no safe-mode gate is needed (it reads counters, NVML, D3DKMT, HWiNFO's
/// shared memory read-only, and GETs 127.0.0.1).
/// </summary>
public sealed class SystemInfoModule : IPrismModule, IAsyncDisposable
{
    public const string Section = "systeminfo";

    private TelemetryService? _service;
    private IModuleContext? _context;
    private EventHandler<GlobalSettingsChangedEventArgs>? _onSettings;
    private EventHandler? _onWake;

    public string Name => "systeminfo";

    public void Initialize(IModuleContext context)
    {
        var memory = new MemorySampler();
        context.Services.Add(memory); // SampleMemoryKey (kept for the core E2E suite)

        var service = TelemetryService.CreateDefault(context.Log.For("systeminfo"), context.Time, memory, context.Services);
        _service = service;
        _context = context;
        context.Services.Add(service);
        context.Services.Add<ITelemetry>(service);
        service.AttachPublisher(context.Data.System.Claim("systeminfo", TimeSpan.FromSeconds(1)));

        Apply(service, context.GlobalSettings.GetSection<SystemInfoGlobalSettings>(Section));
        _onSettings = (_, _) => Apply(service, context.GlobalSettings.GetSection<SystemInfoGlobalSettings>(Section));
        _onWake = (_, _) => service.OnSystemWake();
        context.GlobalSettings.Changed += _onSettings;
        context.Events.SystemWokeUp += _onWake;
        service.Start(context.ShutdownToken);
    }

    private static void Apply(ITelemetry service, SystemInfoGlobalSettings s) =>
        service.ConfigureCpuTemp(TempSources.Parse(s.CpuTempSource), s.LhmPort);

    public async ValueTask DisposeAsync()
    {
        if (_context is { } ctx)
        {
            if (_onSettings is not null) ctx.GlobalSettings.Changed -= _onSettings;
            if (_onWake is not null) ctx.Events.SystemWokeUp -= _onWake;
        }
        _onSettings = null;
        _onWake = null;
        if (_service is not null) await _service.DisposeAsync().ConfigureAwait(false);
    }
}

/// <summary>Setting strings for <see cref="CpuTempSource"/>.</summary>
public static class TempSources
{
    public static CpuTempSource Parse(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "lhm" or "librehardwaremonitor" => CpuTempSource.LibreHardwareMonitor,
        "hwinfo" => CpuTempSource.HWiNFO,
        "off" or "none" => CpuTempSource.Off,
        _ => CpuTempSource.Auto,
    };

    public static string Name(CpuTempSource source) => source switch
    {
        CpuTempSource.LibreHardwareMonitor => "lhm",
        CpuTempSource.HWiNFO => "hwinfo",
        CpuTempSource.Off => "off",
        _ => "auto",
    };
}
