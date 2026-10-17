using PrismControl.Core.Hosting;

namespace PrismControl.Core.Data;

/// <summary>A CPU temperature that a module measured itself, with where and when it came from.</summary>
/// <param name="TempC">Degrees Celsius (convert °F sources).</param>
/// <param name="Source">A lowercase source id: <see cref="CpuTemperature.Lhm"/>, <see cref="CpuTemperature.HwInfo"/>, <see cref="CpuTemperature.Icue"/>, ...</param>
/// <param name="At">When the sensor was read (the provider's clock, <see cref="IModuleContext.Time"/>).</param>
public readonly record struct CpuTemperatureReading(double TempC, string Source, DateTimeOffset At)
{
    /// <summary>True when the reading is at most <paramref name="maxAge"/> (default <see cref="CpuTemperature.MaxAge"/>) old at <paramref name="now"/>.</summary>
    public bool IsFresh(DateTimeOffset now, TimeSpan? maxAge = null)
    {
        var age = now - At;
        return age <= (maxAge ?? CpuTemperature.MaxAge) && age >= -CpuTemperature.ClockSkew;
    }
}

/// <summary>
/// The shared CPU-temperature contract between modules. Windows has no non-admin CPU sensor, so whichever module can
/// read one (Cooling, from iCUE's CPU package sensor) registers it and others (SystemInfo, for <c>/v1/system</c>
/// <c>cpu.tempC</c>) use it when their own providers are absent.
/// <list type="bullet">
/// <item>Provide: <c>ctx.Services.Add&lt;ICpuTemperatureSource&gt;(myService)</c> in Initialize. Publish only readings you
/// measured yourself, never one you got from another <see cref="ICpuTemperatureSource"/>; return null when you have none.</item>
/// <item>Consume: look it up at read time, not in Initialize (module order is not defined):
/// <c>CpuTemperature.ReadShared(services, time.GetUtcNow())</c>.</item>
/// <item>Order of preference for a CPU temperature: LibreHardwareMonitor (<c>lhm</c>), then HWiNFO shared memory
/// (<c>hwinfo</c>), then the shared source (<c>icue</c> today), then null. Never fake a value.</item>
/// </list>
/// </summary>
public interface ICpuTemperatureSource
{
    /// <summary>
    /// The latest reading, or null (not connected, no CPU sensor, the user turned it off). Must be cheap and
    /// thread-safe with no I/O: consumers call it on their stats tick. Consumers ignore readings older than
    /// <see cref="CpuTemperature.MaxAge"/>, so a stalled provider never shows a stale value.
    /// </summary>
    CpuTemperatureReading? Latest { get; }
}

/// <summary>Helpers and source ids for <see cref="ICpuTemperatureSource"/>.</summary>
public static class CpuTemperature
{
    public const string Lhm = "lhm";
    public const string HwInfo = "hwinfo";
    public const string Icue = "icue";

    /// <summary>A reading older than this is treated as no reading.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(10);

    /// <summary>How far in the future a reading may be stamped before it is distrusted.</summary>
    public static readonly TimeSpan ClockSkew = TimeSpan.FromSeconds(5);

    /// <summary>The registered source's latest fresh reading, or null when there is no source or no fresh reading.</summary>
    public static CpuTemperatureReading? ReadShared(IServiceRegistry services, DateTimeOffset now, TimeSpan? maxAge = null)
    {
        if (!services.TryGet<ICpuTemperatureSource>(out var source)) return null;
        CpuTemperatureReading? reading;
        try { reading = source.Latest; }
        catch (Exception) { return null; } // a broken provider must never break the consumer's stats tick
        return reading is { } r && double.IsFinite(r.TempC) && r.IsFresh(now, maxAge) ? r : null;
    }
}
