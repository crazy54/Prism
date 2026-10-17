using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;

namespace PrismControl.Smart.Context;

/// <summary>
/// The engine's view of Prism Sight. Real: <see cref="SightBridge"/> (resolves Desktop's ISightService / ISightControl from
/// the service registry at use time: the Sight module may initialize after us, or not be installed at all).
/// Readings only ever feed context detection and readouts; nothing here sends input.
/// </summary>
public interface ISmartSight
{
    bool IsAvailable { get; }
    SightSnapshot Current { get; }
    /// <summary>The act side, or null when Sight isn't there. Only the binding executor calls it, with a deck gesture token.</summary>
    ISightControl? Control { get; }
    event Action? Changed;
}

public sealed class SightBridge : ISmartSight, IDisposable
{
    private readonly IServiceRegistry _services;
    private readonly ILog _log;
    private readonly object _gate = new();
    private ISightService? _service;
    private IDisposable? _subscription;
    private volatile SightSnapshot _snapshot = SightSnapshot.Empty;

    public SightBridge(IServiceRegistry services, ILog? log = null)
    {
        _services = services;
        _log = (log ?? NullLog.Instance).For("sight-bridge");
    }

    public event Action? Changed;

    public bool IsAvailable => Service is not null;

    public SightSnapshot Current
    {
        get
        {
            _ = Service;
            return _snapshot;
        }
    }

    public ISightControl? Control => _services.TryGet<ISightControl>(out var c) ? c : null;

    private ISightService? Service
    {
        get
        {
            if (_service is { } s) return s;
            if (!_services.TryGet<ISightService>(out var found)) return null;
            lock (_gate)
            {
                if (_service is not null) return _service;
                _service = found;
                try
                {
                    _subscription = found.Subscribe(snap =>
                    {
                        _snapshot = snap ?? SightSnapshot.Empty;
                        Changed?.Invoke();
                    });
                    _log.Info("Prism Sight found: contexts and readouts follow the screen.");
                }
                catch (Exception ex) { _log.Warn("Subscribing to Prism Sight failed", ex); }
            }
            return found;
        }
    }

    /// <summary>Call now and then (the engine does on every evaluation) so a late-starting Sight module is picked up.</summary>
    public void Poll() => _ = Service;

    public void Dispose()
    {
        lock (_gate) { _subscription?.Dispose(); _subscription = null; }
    }
}

/// <summary>No Sight (tests, or the module isn't installed).</summary>
public sealed class NoSight : ISmartSight
{
    public static readonly NoSight Instance = new();
    public bool IsAvailable => false;
    public SightSnapshot Current => SightSnapshot.Empty;
    public ISightControl? Control => null;
    public event Action? Changed { add { } remove { } }
}

/// <summary>Pack vocabulary over a Sight snapshot: region presence (detectors) and values (readouts).</summary>
public static class SightReader
{
    /// <summary>Region presence: true visible, false hidden, null unknown (no reading, or only stale ones).</summary>
    public static bool? Presence(SightSnapshot s, string region)
    {
        if (s.State != SightRunState.Running) return null;
        if (s.Context.Active.Contains(region, StringComparer.Ordinal)) return true;
        if (s.Controls.TryGetValue(region, out var ctl)) return ctl.Located;
        if (s.Readout(region) is { } r && r.Confidence >= SightConfidence.Inferred)
        {
            if (r.Flag is { } f) return f;
            return r.HasValue;
        }
        // Running, and the region isn't on screen (not reported) = hidden.
        return false;
    }

    /// <summary>A region's value with the deck's confidence vocabulary.</summary>
    public static ReadoutValue Value(SightSnapshot s, string region)
    {
        var r = s.Readout(region);
        if (r is null || !r.HasValue) return ReadoutValue.Unknown;
        var conf = s.State == SightRunState.Running ? Map(r.Confidence) : ReadoutConfidence.Stale;
        return new ReadoutValue { Number = r.Number, Text = r.Text, State = r.Flag, Confidence = conf, At = r.ObservedAt ?? r.UpdatedAt };
    }

    public static ReadoutConfidence Map(SightConfidence c) => c switch
    {
        SightConfidence.Observed => ReadoutConfidence.Observed,
        SightConfidence.Inferred => ReadoutConfidence.Inferred,
        SightConfidence.Stale => ReadoutConfidence.Stale,
        _ => ReadoutConfidence.Unknown,
    };
}
