namespace PrismControl.Cooling;

/// <summary>
/// A read-only source of cooling sensors (iCUE, LibreHardwareMonitor). Providers do their own connecting, retrying
/// and polling on a background task between <see cref="Start"/> and <see cref="StopAsync"/>; the service's 1 Hz
/// sampler only reads <see cref="Current"/>, which never blocks. So detection and reconnects never stall a tick.
/// </summary>
public interface ICoolingProvider : IAsyncDisposable
{
    /// <summary>"icue" or "lhm".</summary>
    string Name { get; }
    /// <summary>The latest readings and state (cheap; called by the sampler every second).</summary>
    ProviderReading Current { get; }
    /// <summary>
    /// Whether the service needs this provider right now. Providers that are expensive to poll (LHM) idle while
    /// false; iCUE ignores it.
    /// </summary>
    bool Wanted { get; set; }
    /// <summary>Starts background work. Idempotent.</summary>
    void Start();
    /// <summary>Stops background work and closes connections. Idempotent.</summary>
    Task StopAsync();
}
