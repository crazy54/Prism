using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.CpuTemp;

public enum ProviderOutcome { Ok, Unreachable, NoCpuSensor, Inactive, Error }

public sealed record ProviderRead(ProviderOutcome Outcome, CpuTempReading? Reading = null, string? Detail = null);

/// <summary>LibreHardwareMonitor's web server (abstracted for tests).</summary>
public interface ILhmEndpoint
{
    Task<ProviderRead> ReadAsync(int port, CancellationToken cancellationToken);
    /// <summary>Whether LibreHardwareMonitor.exe runs (for a precise hint). Costs ~10-20 ms: call rarely.</summary>
    bool IsAppRunning();
}

/// <summary>HWiNFO's shared memory (abstracted for tests).</summary>
public interface IHwInfoEndpoint
{
    ProviderRead Read();
}

/// <summary>
/// CPU temperature from an external provider, honestly (research §2.7): Windows has no non-admin CPU sensor, so we
/// read LibreHardwareMonitor's web server or HWiNFO's shared memory, or report nothing. Detection runs on its own
/// background task (never on the stats tick), only while some consumer wants a CPU temperature, every 30 s with
/// backoff to 2 min, with a short connect timeout (a refused loopback connect otherwise costs ~2 s on Windows).
/// <para>
/// In Auto, when neither has a reading, the shared Core source (<see cref="ICpuTemperatureSource"/>, registered by the
/// Cooling module: iCUE's CPU package sensor) is used, labelled as such. Order: LibreHardwareMonitor, HWiNFO, shared.
/// </para>
/// </summary>
public sealed class CpuTempMonitor : ICpuTempProvider, IDisposable
{
    public static readonly TimeSpan DetectInterval = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan MaxDetectInterval = TimeSpan.FromMinutes(2);
    public static readonly TimeSpan LhmPollInterval = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan HwInfoPollInterval = TimeSpan.FromSeconds(1);
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan AppCheckInterval = TimeSpan.FromMinutes(2);

    public const string LhmName = "LibreHardwareMonitor";
    public const string HwInfoName = "HWiNFO";
    public const string IcueName = "iCUE";
    private const string NoTemperature = "No CPU temperature. ";

    private readonly ILhmEndpoint _lhm;
    private readonly IHwInfoEndpoint _hwinfo;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly IServiceRegistry? _services;
    private readonly object _gate = new();
    private CpuTempSource _source = CpuTempSource.Auto;
    private int _port = 8085;
    private bool _wanted;
    private string? _active;
    private int _readFailures, _detectFailures;
    private long? _lastAppCheck;
    private bool _lhmAppRunning;
    private (double TempC, string Provider, long At)? _reading;
    private CpuTempStatus _status = CpuTempStatus.Idle;
    private TaskCompletionSource _signal = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private CancellationTokenSource? _cts;
    private Task? _loop;

    /// <param name="services">Where another module's shared CPU temperature is looked up (at read time, as module order is not defined).</param>
    public CpuTempMonitor(ILhmEndpoint lhm, IHwInfoEndpoint hwinfo, TimeProvider time, ILog log, IServiceRegistry? services = null)
    {
        _lhm = lhm;
        _hwinfo = hwinfo;
        _time = time;
        _log = log;
        _services = services;
    }

    /// <summary>What the PI shows: our own provider's state, or the shared reading and why our own has none.</summary>
    public CpuTempStatus Status
    {
        get
        {
            CpuTempStatus own;
            bool tryShared;
            lock (_gate)
            {
                own = _status;
                tryShared = _wanted && _source == CpuTempSource.Auto && !OwnFresh();
            }
            if (!tryShared || Shared() is not { } s) return own;
            var name = SharedName(s.Source);
            var why = own.Message.StartsWith(NoTemperature, StringComparison.Ordinal) ? " LibreHardwareMonitor or HWiNFO take over when they run: " + own.Message[NoTemperature.Length..] : "";
            return new CpuTempStatus(name, s.TempC, $"{name}: CPU package, shared by the Cooling module.{why}");
        }
    }

    public (double TempC, string Provider)? Current
    {
        get
        {
            bool tryShared;
            lock (_gate)
            {
                if (OwnFresh()) return (_reading!.Value.TempC, _reading.Value.Provider);
                tryShared = _source == CpuTempSource.Auto;
            }
            // Only when neither LibreHardwareMonitor nor HWiNFO has a reading (Core order: lhm > hwinfo > shared).
            return tryShared && Shared() is { } s ? (s.TempC, SharedName(s.Source)) : null;
        }
    }

    private bool OwnFresh() => _reading is { } r && _time.GetElapsedTime(r.At) <= MaxAge;

    /// <summary>The shared reading (null when no module provides one, it is stale, or it fails).</summary>
    private CpuTemperatureReading? Shared() => _services is null ? null : CpuTemperature.ReadShared(_services, _time.GetUtcNow());

    private static string SharedName(string source) => source switch
    {
        CpuTemperature.Icue => IcueName,
        CpuTemperature.Lhm => LhmName,
        CpuTemperature.HwInfo => HwInfoName,
        _ => source,
    };

    public CpuTempSource Source { get { lock (_gate) return _source; } }
    public int Port { get { lock (_gate) return _port; } }

    public void Configure(CpuTempSource source, int lhmPort)
    {
        var port = lhmPort is > 0 and < 65536 ? lhmPort : 8085;
        lock (_gate)
        {
            if (_source == source && _port == port) return;
            _source = source;
            _port = port;
            _active = null;
            _reading = null;
            _detectFailures = 0;
        }
        Wake();
    }

    public void SetWanted(bool wanted)
    {
        lock (_gate)
        {
            if (_wanted == wanted) return;
            _wanted = wanted;
        }
        if (wanted) Wake();
    }

    public void Redetect()
    {
        lock (_gate)
        {
            _detectFailures = 0;
            if (_active is null) _lastAppCheck = null;
        }
        Wake();
    }

    /// <summary>Starts the background loop (idempotent).</summary>
    public void Start(CancellationToken shutdown)
    {
        if (_loop is not null) return;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
        var ct = _cts.Token;
        _loop = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                // Capture the signal BEFORE the step reads its state: a Configure / SetWanted / Redetect during the step
                // completes it, so the wait returns at once (review B #7: the change used to wait out the backoff, or
                // forever while idle).
                var signal = Signal();
                TimeSpan? delay;
                try { delay = await StepAsync(ct).ConfigureAwait(false); }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch (Exception ex)
                {
                    _log.Warn("CPU temperature provider step failed", ex);
                    delay = DetectInterval;
                }
                try { await WaitAsync(signal, delay, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        }, ct);
    }

    /// <summary>
    /// One step of the state machine; returns how long to wait before the next one (null = until woken).
    /// Public for deterministic tests.
    /// </summary>
    public async Task<TimeSpan?> StepAsync(CancellationToken ct)
    {
        CpuTempSource source;
        int port;
        string? active;
        lock (_gate)
        {
            source = _source;
            port = _port;
            active = _active;
            if (source == CpuTempSource.Off)
            {
                _reading = null;
                _active = null;
                _status = new CpuTempStatus(null, null, "Off. Choose a source to show the CPU temperature.");
                return null;
            }
            if (!_wanted)
            {
                if (_active is null) _status = CpuTempStatus.Idle;
                return null;
            }
        }

        if (active is not null)
        {
            var r = await ReadAsync(active, port, ct).ConfigureAwait(false);
            lock (_gate)
            {
                if (_active != active) return TimeSpan.Zero; // reconfigured meanwhile
                if (r.Outcome == ProviderOutcome.Ok && r.Reading is { } reading)
                {
                    _readFailures = 0;
                    _reading = (reading.TempC, active, _time.GetTimestamp());
                    _status = new CpuTempStatus(active, reading.TempC, $"{active}: {reading.SensorName}");
                }
                else if (++_readFailures >= 3)
                {
                    _log.Info($"CPU temperature: {active} stopped answering ({r.Outcome}).");
                    _active = null;
                    _reading = null;
                    _readFailures = 0;
                    _status = new CpuTempStatus(null, null, $"{active} stopped answering; looking again.");
                    return TimeSpan.Zero;
                }
            }
            return active == LhmName ? LhmPollInterval : HwInfoPollInterval;
        }

        // Detection: LibreHardwareMonitor first (this user already runs it), then HWiNFO.
        var order = source switch
        {
            CpuTempSource.LibreHardwareMonitor => new[] { LhmName },
            CpuTempSource.HWiNFO => new[] { HwInfoName },
            _ => new[] { LhmName, HwInfoName },
        };
        var outcomes = new Dictionary<string, ProviderRead>();
        foreach (var p in order)
        {
            var r = await ReadAsync(p, port, ct).ConfigureAwait(false);
            outcomes[p] = r;
            if (r.Outcome == ProviderOutcome.Ok && r.Reading is { } reading)
            {
                lock (_gate)
                {
                    if (_source != source || _port != port) return TimeSpan.Zero;
                    _active = p;
                    _detectFailures = 0;
                    _readFailures = 0;
                    _reading = (reading.TempC, p, _time.GetTimestamp());
                    _status = new CpuTempStatus(p, reading.TempC, $"{p}: {reading.SensorName}");
                }
                _log.Info($"CPU temperature: using {p} ({reading.SensorName}).");
                return p == LhmName ? LhmPollInterval : HwInfoPollInterval;
            }
        }

        // Nothing found: a precise hint, then back off (30 s, 60 s, then every 2 min).
        var checkApp = false;
        lock (_gate)
        {
            if (outcomes.TryGetValue(LhmName, out var lr) && lr.Outcome == ProviderOutcome.Unreachable &&
                (_lastAppCheck is not { } last || _time.GetElapsedTime(last) >= AppCheckInterval))
            {
                checkApp = true;
                _lastAppCheck = _time.GetTimestamp();
            }
        }
        if (checkApp)
        {
            var running = false;
            try { running = _lhm.IsAppRunning(); } catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception) { }
            lock (_gate) _lhmAppRunning = running;
        }
        lock (_gate)
        {
            _reading = null;
            _status = new CpuTempStatus(null, null, Hint(source, port, outcomes, _lhmAppRunning));
            var step = Math.Min(_detectFailures++ / 2, 2);
            var delay = TimeSpan.FromTicks(DetectInterval.Ticks << step);
            return delay > MaxDetectInterval ? MaxDetectInterval : delay;
        }
    }

    internal static string Hint(CpuTempSource source, int port, IReadOnlyDictionary<string, ProviderRead> outcomes, bool lhmRunning)
    {
        var parts = new List<string>();
        if (outcomes.TryGetValue(LhmName, out var l))
        {
            parts.Add(l.Outcome switch
            {
                ProviderOutcome.NoCpuSensor => "LibreHardwareMonitor answers but reports no CPU temperature (run it as administrator).",
                ProviderOutcome.Unreachable when lhmRunning => $"LibreHardwareMonitor is running, but its web server is off: Options > Remote Web Server > Run (port {port}).",
                ProviderOutcome.Unreachable => $"LibreHardwareMonitor is not answering on port {port}.",
                _ => $"LibreHardwareMonitor: {l.Detail ?? "unexpected answer"}.",
            });
        }
        if (outcomes.TryGetValue(HwInfoName, out var h))
        {
            parts.Add(h.Outcome switch
            {
                ProviderOutcome.Inactive => "HWiNFO's shared memory is off (Settings > Shared Memory Support; the free version turns it off after 12 hours).",
                ProviderOutcome.NoCpuSensor => "HWiNFO reports no CPU temperature.",
                ProviderOutcome.Unreachable => "HWiNFO is not running.",
                _ => $"HWiNFO: {h.Detail ?? "unexpected data"}.",
            });
        }
        // The generic "how" only when nothing above already says what to do.
        var actionable = (l?.Outcome is ProviderOutcome.NoCpuSensor || (l?.Outcome == ProviderOutcome.Unreachable && lhmRunning)) ||
                         h?.Outcome is ProviderOutcome.Inactive or ProviderOutcome.NoCpuSensor;
        if (!actionable)
            parts.Add(source switch
            {
                CpuTempSource.LibreHardwareMonitor => "Run LibreHardwareMonitor with Options > Remote Web Server > Run.",
                CpuTempSource.HWiNFO => "Run HWiNFO with Shared Memory Support on.",
                _ => "Run LibreHardwareMonitor (web server on) or HWiNFO (shared memory on).",
            });
        return "No CPU temperature. " + string.Join(" ", parts);
    }

    private async Task<ProviderRead> ReadAsync(string provider, int port, CancellationToken ct)
    {
        try
        {
            return provider == LhmName ? await _lhm.ReadAsync(port, ct).ConfigureAwait(false) : _hwinfo.Read();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            return new ProviderRead(ProviderOutcome.Error, null, ex.GetType().Name);
        }
    }

    private void Wake()
    {
        TaskCompletionSource old;
        lock (_gate) old = Interlocked.Exchange(ref _signal, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        old.TrySetResult();
    }

    private Task Signal()
    {
        lock (_gate) return _signal.Task;
    }

    private async Task WaitAsync(Task signal, TimeSpan? delay, CancellationToken ct)
    {
        if (delay is { } d && d <= TimeSpan.Zero) return;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var wait = delay is { } dd ? Task.Delay(dd, _time, cts.Token) : Task.Delay(Timeout.InfiniteTimeSpan, cts.Token);
        await Task.WhenAny(signal, wait).ConfigureAwait(false);
        cts.Cancel();
        ct.ThrowIfCancellationRequested();
    }

    public void Dispose()
    {
        _cts?.Cancel();
        try { _loop?.Wait(TimeSpan.FromSeconds(2)); } catch (AggregateException) { }
        _cts?.Dispose();
        (_lhm as IDisposable)?.Dispose();
        (_hwinfo as IDisposable)?.Dispose();
    }
}
