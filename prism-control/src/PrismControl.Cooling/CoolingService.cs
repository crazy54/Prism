using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Cooling.Lhm;

namespace PrismControl.Cooling;

public sealed class CoolingServiceOptions
{
    /// <summary>The sampler's cadence (~1 Hz).</summary>
    public TimeSpan SampleInterval { get; init; } = TimeSpan.FromSeconds(1);
    /// <summary>How long the sampler keeps running after the last consumer left (a page flip should not reconnect).</summary>
    public TimeSpan IdleGrace { get; init; } = TimeSpan.FromSeconds(15);
    /// <summary>false = no background loop; call <see cref="CoolingService.SampleNow"/> yourself (tests).</summary>
    public bool AutoSample { get; init; } = true;
    public int HistoryCapacity { get; init; } = 900;
}

/// <summary>
/// The Cooling module's shared service: merges the providers (iCUE first, LibreHardwareMonitor as fallback and CPU
/// temperature), classifies sensors, applies the user's renames and roles, keeps the 1 Hz history and publishes
/// <see cref="CoolingSnapshot"/>s. It samples only while something consumes it: an action holding a
/// <see cref="Acquire"/> lease, a demand source (the /v1/cooling endpoint being polled), or a module reading the shared
/// CPU temperature (<see cref="ICpuTemperatureSource"/>: SystemInfo when LibreHardwareMonitor and HWiNFO are absent).
/// Thread-safe.
/// </summary>
public sealed class CoolingService : IAsyncDisposable, ICpuTemperatureSource
{
    public const string SettingsSection = "cooling";

    /// <summary>One read of the shared CPU temperature keeps the sampler running this long (consumers read it at ~1 Hz).</summary>
    public static readonly TimeSpan SharedReadDemand = TimeSpan.FromSeconds(5);

    private readonly List<ICoolingProvider> _providers;
    private readonly IGlobalSettings? _globals;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly CoolingServiceOptions _o;
    private readonly object _gate = new();
    private readonly List<Func<bool>> _demand = [];
    private readonly HashSet<string> _everSpun = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _wake = new(0, 1);
    private readonly CancellationTokenSource _cts = new();
    private readonly Task? _loop;
    private CoolingGlobalSettings _settings;
    private volatile CoolingSnapshot _current = CoolingSnapshot.Empty;
    private int _leases;
    private volatile bool _sampling;
    private long _sharedReadAt;   // timestamp of the last ICpuTemperatureSource.Latest read (0 = never)
    private int _sampleErrors;

    public CoolingService(IEnumerable<ICoolingProvider> providers, IGlobalSettings? globalSettings = null, TimeProvider? time = null,
        ILog? log = null, CoolingServiceOptions? options = null)
    {
        _providers = providers.ToList();
        _globals = globalSettings;
        _time = time ?? TimeProvider.System;
        _log = log ?? NullLog.Instance;
        _o = options ?? new CoolingServiceOptions();
        History = new CoolingHistory(_o.HistoryCapacity);
        _settings = ReadSettings();
        ApplyProviderSettings();
        if (_o.AutoSample) _loop = Task.Run(() => RunAsync(_cts.Token));
    }

    public CoolingSnapshot Current => _current;
    public CoolingHistory History { get; }
    public bool IsSampling => _sampling;
    public IReadOnlyList<ICoolingProvider> Providers => _providers;
    public TimeProvider Time => _time;

    /// <summary>Raised after every sample (on the sampler's thread). Handlers must be quick and thread-safe.</summary>
    public event Action<CoolingSnapshot>? Updated;
    /// <summary>Raised when sampling stops (nothing consumes any more).</summary>
    public event Action? Stopped;

    public CoolingGlobalSettings Settings { get { lock (_gate) return _settings.Clone(); } }

    // ------------------------------------------------------------------ demand

    /// <summary>Starts sampling (if needed) until the returned lease is disposed. Actions take one while visible.</summary>
    public IDisposable Acquire()
    {
        Interlocked.Increment(ref _leases);
        Wake();
        return new Lease(this);
    }

    /// <summary>Adds a demand source (e.g. <c>() =&gt; publisher.IsDemanded</c>); call <see cref="Wake"/> when it turns true.</summary>
    public void AddDemand(Func<bool> isDemanded)
    {
        lock (_gate) _demand.Add(isDemanded);
    }

    public void Wake()
    {
        try { if (_wake.CurrentCount == 0) _wake.Release(); } catch (SemaphoreFullException) { } catch (ObjectDisposedException) { }
    }

    public bool IsDemanded
    {
        get
        {
            if (Volatile.Read(ref _leases) > 0) return true;
            var read = Volatile.Read(ref _sharedReadAt);
            if (read != 0 && _time.GetElapsedTime(read) < SharedReadDemand) return true;
            Func<bool>[] d;
            lock (_gate) d = [.. _demand];
            return d.Any(f => { try { return f(); } catch { return false; } });
        }
    }

    /// <summary>
    /// The shared CPU temperature (Core contract): the CPU package sensor this service chose (iCUE, or LibreHardwareMonitor
    /// per the "CPU temp source" setting), stamped with when the provider read it; null when there is none or the user
    /// turned it off. Cheap, no I/O: a read only notes the demand (and wakes the sampler when it sleeps).
    /// </summary>
    CpuTemperatureReading? ICpuTemperatureSource.Latest
    {
        get
        {
            Volatile.Write(ref _sharedReadAt, _time.GetTimestamp());
            if (!_sampling) Wake();
            var snap = _current;
            if (snap.Cpu is not { HasValue: true, Value: { } c } cpu) return null;
            return new CpuTemperatureReading(c, cpu.Source == "lhm" ? CpuTemperature.Lhm : CpuTemperature.Icue, cpu.UpdatedAt ?? snap.At);
        }
    }

    private sealed class Lease(CoolingService owner) : IDisposable
    {
        private int _done;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _done, 1) == 0) Interlocked.Decrement(ref owner._leases);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!IsDemanded)
                {
                    await _wake.WaitAsync(ct).ConfigureAwait(false);
                    continue;
                }
                _sampling = true;
                foreach (var p in _providers)
                {
                    try { p.Start(); }
                    catch (Exception ex) { _log.Error($"Cooling: starting {p.Name} failed", ex); }
                }
                _log.Info("Cooling: sampling started.");
                TrySample();
                long? idleSince = null;
                using var timer = new PeriodicTimer(_o.SampleInterval, _time);
                while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
                {
                    // A bad sample (one odd sensor, a provider bug) skips this tick; it never stops and restarts the providers.
                    TrySample();
                    if (IsDemanded) idleSince = null;
                    else if (idleSince is null) idleSince = _time.GetTimestamp();
                    else if (_time.GetElapsedTime(idleSince.Value) >= _o.IdleGrace) break;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _log.Error("Cooling sampler failed; restarting it", ex);
                try { await Task.Delay(TimeSpan.FromSeconds(2), _time, ct).ConfigureAwait(false); } catch (OperationCanceledException) { break; }
            }
            if (_sampling) await StopSamplingAsync().ConfigureAwait(false);
        }
        if (_sampling) await StopSamplingAsync().ConfigureAwait(false);
    }

    private void TrySample()
    {
        try { SampleNow(); }
        catch (Exception ex)
        {
            if (Interlocked.Increment(ref _sampleErrors) <= 5) _log.Error("Cooling: a sample failed; skipping it", ex);
        }
    }

    private async Task StopSamplingAsync()
    {
        _sampling = false;
        foreach (var p in _providers)
        {
            try { await p.StopAsync().ConfigureAwait(false); }
            catch (Exception ex) { _log.Warn($"Cooling: stopping {p.Name} failed", ex); }
        }
        _current = CoolingSnapshot.Empty;
        _log.Info("Cooling: sampling stopped (nothing consumes cooling data).");
        try { Stopped?.Invoke(); } catch (Exception ex) { _log.Warn("Cooling: Stopped handler failed", ex); }
    }

    // ------------------------------------------------------------------ one sample

    /// <summary>Builds a snapshot from the providers' current readings, appends it to the history and raises <see cref="Updated"/>.</summary>
    public CoolingSnapshot SampleNow()
    {
        lock (_sampleGate) return SampleCore();
    }

    private readonly object _sampleGate = new();
    private long? _icueWaitingSince;

    /// <summary>iCUE gets this long to connect before LibreHardwareMonitor is probed as the fallback.</summary>
    public static readonly TimeSpan IcueHeadStart = TimeSpan.FromSeconds(5);

    private CoolingSnapshot SampleCore()
    {
        CoolingGlobalSettings s;
        lock (_gate) s = _settings;
        var now = _time.GetUtcNow();
        var icueP = _providers.FirstOrDefault(p => p.Name == Icue.IcueProvider.ProviderName);
        var lhmP = _providers.FirstOrDefault(p => p.Name == LhmProvider.ProviderName);
        var icue = Read(icueP);
        var lhm = Read(lhmP);

        var icueOk = icue.State == ProviderState.Connected;
        var icueCooling = icueOk && icue.Sensors.Any(x => x.Type is RawSensorType.Fan or RawSensorType.Pump);
        var icueCpu = icueOk && icue.Sensors.Any(x => x.Type == RawSensorType.Temperature && x.Kind == "package");
        var source = CpuSources.Normalize(s.CpuTempSource);
        // Give iCUE a head start before probing LHM (its first connect takes ~0.1 s; LHM's refused connect costs up to 0.4 s).
        if (icue.State is ProviderState.Connecting or ProviderState.Off) _icueWaitingSince ??= _time.GetTimestamp();
        else _icueWaitingSince = null;
        var icueSettled = icueP is null || _icueWaitingSince is null || _time.GetElapsedTime(_icueWaitingSince.Value) >= IcueHeadStart;
        if (lhmP is not null)
        {
            var wanted = s.UseLhm && icueSettled && (!icueCooling || source == CpuSources.Lhm || (source == CpuSources.Auto && !icueCpu));
            try { lhmP.Wanted = wanted; } catch (Exception ex) { ReportOnce("lhm.wanted", "Cooling: LHM provider rejected Wanted", ex); }
        }

        // One pass that classifies each sensor on its own: a sensor that breaks the classifier is skipped (and logged
        // once), never the whole sample.
        var raws = new List<(RawSensor Raw, string Source, SensorKind Kind)>();
        void Take(RawSensor r, string src)
        {
            try { if (r.Id is not null && r.Device is not null && SensorClassifier.KindOf(r) is { } kind) raws.Add((r, src, kind)); }
            catch (Exception ex) { ReportOnce("sensor:" + IdOf(r), $"Cooling: skipping a {src} sensor the classifier cannot read", ex); }
        }
        if (icueOk) foreach (var r in icue.Sensors) Take(r, "icue");
        if (lhm.State == ProviderState.Connected && s.UseLhm)
        {
            foreach (var r in lhm.Sensors)
            {
                var isCpu = r.Type == RawSensorType.Temperature && r.Kind == "package";
                if (isCpu || !icueCooling) Take(r, "lhm");
            }
        }
        if (MigrateAliases(raws, s)) lock (_gate) s = _settings;

        var pumpPrefixes = raws.Where(x => x.Kind == SensorKind.Pump)
            .Select(x => SensorClassifier.Prefix(x.Raw.Name)).OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
        var sensors = new List<CoolingSensor>(raws.Count);
        foreach (var (raw, src, kind) in raws)
        {
            try { sensors.Add(Classify(raw, src, kind, s, pumpPrefixes)); }
            catch (Exception ex) { ReportOnce("sensor:" + raw.Id, $"Cooling: skipping a {src} sensor the classifier cannot read", ex); }
        }
        try { sensors.Sort(CompareSensors); }
        catch (InvalidOperationException ex)
        {
            ReportOnce("sort", "Cooling: the sensor order failed; using id order", ex);
            sensors.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));
        }

        CoolingSensor? Cpu(string src) => sensors.FirstOrDefault(x => x.Kind == SensorKind.Cpu && x.Source == src && x.HasValue);
        var cpu = source switch
        {
            CpuSources.Icue => Cpu("icue"),
            CpuSources.Lhm => Cpu("lhm"),
            CpuSources.Off => null,
            _ => Cpu("icue") ?? Cpu("lhm"),
        };
        var coolant = sensors.FirstOrDefault(x => x.Kind == SensorKind.Coolant && x.HasValue && x.Role != CoolingRole.Ignore);

        var icueCount = sensors.Count(x => x.Source == "icue");
        var lhmCount = sensors.Count(x => x.Source == "lhm");
        var providers = new List<ProviderStatus>();
        if (icueP is not null) providers.Add(new ProviderStatus(icueP.Name, icue.State, icue.Detail, icueCount));
        if (lhmP is not null)
            providers.Add(s.UseLhm
                ? new ProviderStatus(lhmP.Name, lhm.State, lhm.Detail, lhmCount)
                : new ProviderStatus(lhmP.Name, ProviderState.Disabled, "Turned off in the Cooling settings", 0));

        var hasCooling = sensors.Any(x => x.IsRpm && x.HasValue);
        var status = !hasCooling && cpu is null
            ? (icue.State == ProviderState.Connecting || lhm.State == ProviderState.Connecting ? CoolingStatus.Connecting : CoolingStatus.Unavailable)
            : hasCooling && (cpu is not null || source == CpuSources.Off) ? CoolingStatus.Ok : CoolingStatus.Partial;
        var text = StatusText(icue, lhm, icueCount, lhmCount, cpu, source, s.UseLhm, lhmP?.Wanted == true);

        var snap = new CoolingSnapshot(now, sensors, cpu, coolant, providers, status, text);
        History.Append(snap);
        _current = snap;
        try { Updated?.Invoke(snap); } catch (Exception ex) { _log.Warn("Cooling: Updated handler failed", ex); }
        return snap;
    }

    /// <summary>A provider's reading; a provider that throws counts as an error and never breaks the sample.</summary>
    private ProviderReading Read(ICoolingProvider? p)
    {
        if (p is null) return ProviderReading.Off;
        try
        {
            var r = p.Current ?? ProviderReading.Off;
            return r.Sensors.Any(x => x is null) ? r with { Sensors = [.. r.Sensors.Where(x => x is not null)] } : r;
        }
        catch (Exception ex)
        {
            ReportOnce("provider:" + p.Name, $"Cooling: reading {p.Name} failed", ex);
            return new ProviderReading(ProviderState.Error, $"{p.Name}: unexpected error (see log)", []);
        }
    }

    private static string IdOf(RawSensor? r) => r is null ? "(null)" : r.Id ?? "(no id)";

    private readonly HashSet<string> _reported = new(StringComparer.Ordinal);

    /// <summary>Logs a problem once per key (a bad sensor would otherwise log every second).</summary>
    private void ReportOnce(string key, string message, Exception ex)
    {
        lock (_reported)
        {
            if (_reported.Count >= 200 || !_reported.Add(key)) return;
        }
        _log.Warn(message, ex);
    }

    private CoolingSensor Classify(RawSensor raw, string src, SensorKind kind, CoolingGlobalSettings s, IReadOnlyCollection<string> pumpPrefixes)
    {
        var connected = raw.Connected;
        if (raw.IsBoardHeader && kind == SensorKind.Fan)
        {
            // LHM lists every motherboard header; one that has never spun this session has no fan on it.
            if (raw.Value > 0) _everSpun.Add(raw.Id);
            if (!_everSpun.Contains(raw.Id)) connected = false;
        }
        var custom = s.Names.TryGetValue(raw.Id, out var n) && !string.IsNullOrWhiteSpace(n) ? n.Trim() : null;
        var userRole = s.Roles.TryGetValue(raw.Id, out var r) ? Roles.Parse(r) : null;
        var shortName = SensorClassifier.ShortName(raw.Name, raw.Device, kind);
        return new CoolingSensor
        {
            Id = raw.Id,
            Source = src,
            Kind = kind,
            Name = custom ?? shortName,
            ShortName = shortName,
            OriginalName = raw.Name,
            CustomName = custom,
            Device = raw.Device,
            Role = userRole ?? SensorClassifier.AutoRole(kind, raw.Name, raw.Device, pumpPrefixes),
            RoleIsUser = userRole is not null,
            Value = raw.Value,
            Pct = raw.Pct,
            Connected = connected,
            UpdatedAt = raw.UpdatedAt,
            Aliases = raw.Aliases ?? [],
        };
    }

    /// <summary>
    /// A sensor that changed id (pipe switch, rename in iCUE) brings its user name and role along: settings saved under
    /// an alias move to the current id (unless the current id has its own). Saved once; returns true if anything moved.
    /// </summary>
    private bool MigrateAliases(List<(RawSensor Raw, string Source, SensorKind Kind)> raws, CoolingGlobalSettings s)
    {
        List<(string From, string To)>? moves = null;
        foreach (var (raw, _, _) in raws)
        {
            if (raw.Aliases is not { Count: > 0 } aliases) continue;
            foreach (var a in aliases)
                if (a != raw.Id && (s.Names.ContainsKey(a) || s.Roles.ContainsKey(a))) (moves ??= []).Add((a, raw.Id));
        }
        if (moves is null) return false;
        // An alias that is some other sensor's current id is not free to move.
        var current = new HashSet<string>(raws.Select(x => x.Raw.Id), StringComparer.Ordinal);
        moves.RemoveAll(m => current.Contains(m.From));
        if (moves.Count == 0) return false;
        var moved = false;
        Update(copy =>
        {
            var changed = false;
            foreach (var (from, to) in moves)
            {
                if (copy.Names.Remove(from, out var name)) { copy.Names.TryAdd(to, name); changed = true; }
                if (copy.Roles.Remove(from, out var role)) { copy.Roles.TryAdd(to, role); changed = true; }
            }
            return moved = changed;
        });
        if (moved) _log.Info($"Cooling: {moves.Count} sensor setting(s) followed their sensor to a new id.");
        return moved;
    }

    /// <summary>The current id for <paramref name="id"/> (an alias resolves to the sensor that has it now).</summary>
    private string Canonical(string id) => _current.Find(id)?.Id ?? id;

    private static int CompareSensors(CoolingSensor a, CoolingSensor b)
    {
        static int Rank(CoolingSensor s) => s.Kind switch
        {
            SensorKind.Cpu => 0,
            SensorKind.Coolant => 1,
            SensorKind.Pump => 2,
            SensorKind.Fan => s.Role switch { CoolingRole.Radiator => 3, CoolingRole.Case => 4, CoolingRole.Unassigned => 5, CoolingRole.Pump => 2, CoolingRole.Gpu => 6, _ => 7 },
            _ => 8,
        };
        var c = Rank(a).CompareTo(Rank(b));
        if (c != 0) return c;
        c = string.CompareOrdinal(a.Source, b.Source);
        return c != 0 ? c : NaturalCompare(a.Name, b.Name);
    }

    /// <summary>
    /// "RX RGB #2" before "RX RGB #10". Only ASCII digit runs compare as numbers, and without parsing (any length; a
    /// fullwidth "１" in a user's name is plain text: char.IsDigit accepts it but long.Parse does not). Total: never 0
    /// for different strings, never throws.
    /// </summary>
    internal static int NaturalCompare(string a, string b)
    {
        int i = 0, j = 0;
        while (i < a.Length && j < b.Length)
        {
            if (char.IsAsciiDigit(a[i]) && char.IsAsciiDigit(b[j]))
            {
                int si = i, sj = j;
                while (i < a.Length && char.IsAsciiDigit(a[i])) i++;
                while (j < b.Length && char.IsAsciiDigit(b[j])) j++;
                var x = a.AsSpan(si, i - si).TrimStart('0');
                var y = b.AsSpan(sj, j - sj).TrimStart('0');
                var c = x.Length != y.Length ? x.Length.CompareTo(y.Length) : x.SequenceCompareTo(y);
                if (c != 0) return c;
            }
            else
            {
                var c = char.ToUpperInvariant(a[i]).CompareTo(char.ToUpperInvariant(b[j]));
                if (c != 0) return c;
                i++;
                j++;
            }
        }
        var rest = (a.Length - i).CompareTo(b.Length - j);
        return rest != 0 ? rest : string.CompareOrdinal(a, b);
    }

    private static string StatusText(ProviderReading icue, ProviderReading lhm, int icueCount, int lhmCount, CoolingSensor? cpu, string source, bool useLhm, bool lhmWanted)
    {
        var parts = new List<string>();
        switch (icue.State)
        {
            case ProviderState.Connected: parts.Add($"iCUE connected · {icueCount} sensors"); break;
            case ProviderState.NotRunning: parts.Add("iCUE not running"); break;
            case ProviderState.Connecting: parts.Add("Connecting to iCUE…"); break;
            case ProviderState.Off: break;
            default: parts.Add(icue.Detail); break;
        }
        if (useLhm && lhmWanted)
        {
            switch (lhm.State)
            {
                case ProviderState.Connected: parts.Add($"LibreHardwareMonitor · {lhmCount} sensors"); break;
                case ProviderState.NotRunning: parts.Add("LibreHardwareMonitor web server off"); break;
                case ProviderState.Connecting: parts.Add("looking for LibreHardwareMonitor"); break;
            }
        }
        if (cpu is null && source != CpuSources.Off && icue.State != ProviderState.Off) parts.Add("no CPU temperature");
        else if (cpu is { Source: "lhm" } && icue.State == ProviderState.Connected) parts.Add("CPU via LHM");
        return parts.Count == 0 ? "Idle" : string.Join(" · ", parts);
    }

    // ------------------------------------------------------------------ settings (renames, roles, sources)

    public string? CustomName(string? id)
    {
        if (id is null) return null;
        id = Canonical(id);
        lock (_gate) return _settings.Names.TryGetValue(id, out var n) ? n : null;
    }

    /// <summary>The user's role override as a wire string, or "auto".</summary>
    public string RoleOverride(string? id)
    {
        if (id is null) return Roles.Auto;
        id = Canonical(id);
        lock (_gate) return _settings.Roles.TryGetValue(id, out var r) && Roles.Parse(r) is { } role ? Roles.Wire(role) : Roles.Auto;
    }

    /// <summary>Renames a sensor everywhere (null/empty restores the source name).</summary>
    public void SetName(string id, string? name)
    {
        id = Canonical(id);
        name = string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        if (name is { Length: > 40 }) name = name[..40];
        Update(s =>
        {
            if (name is null) return s.Names.Remove(id);
            if (s.Names.TryGetValue(id, out var old) && old == name) return false;
            s.Names[id] = name;
            return true;
        });
    }

    /// <summary>Assigns a role everywhere ("auto"/null removes the override).</summary>
    public void SetRole(string id, string? role)
    {
        id = Canonical(id);
        var parsed = Roles.Parse(role);
        Update(s =>
        {
            if (parsed is null || parsed == CoolingRole.Unassigned) return s.Roles.Remove(id);
            var wire = Roles.Wire(parsed.Value);
            if (s.Roles.TryGetValue(id, out var old) && old == wire) return false;
            s.Roles[id] = wire;
            return true;
        });
    }

    public void SetCpuTempSource(string? source)
    {
        var v = CpuSources.Normalize(source);
        Update(s => { if (s.CpuTempSource == v) return false; s.CpuTempSource = v; return true; });
    }

    public void SetLhmPort(int port)
    {
        var v = port is > 0 and < 65536 ? port : LhmOptions.DefaultPort;
        Update(s => { if (s.LhmPort == v) return false; s.LhmPort = v; return true; });
    }

    public void SetUseLhm(bool use) => Update(s => { if (s.UseLhm == use) return false; s.UseLhm = use; return true; });

    /// <summary>Re-reads the "cooling" section (call on GlobalSettings.Changed).</summary>
    public void ReloadSettings()
    {
        var fresh = ReadSettings();
        lock (_gate) _settings = fresh;
        ApplyProviderSettings();
    }

    private readonly object _saveGate = new();

    private void Update(Func<CoolingGlobalSettings, bool> change)
    {
        // Serialized end to end, so two keys editing at once can never persist an older copy last.
        lock (_saveGate)
        {
            CoolingGlobalSettings copy;
            lock (_gate)
            {
                copy = _settings.Clone();
                if (!change(copy)) return;
                _settings = copy;
            }
            ApplyProviderSettings();
            try { _globals?.SetSection(SettingsSection, copy.Clone()); }
            catch (Exception ex) { _log.Warn("Cooling: saving the global settings failed", ex); }
        }
    }

    private CoolingGlobalSettings ReadSettings()
    {
        try
        {
            var s = _globals?.GetSection<CoolingGlobalSettings>(SettingsSection) ?? new CoolingGlobalSettings();
            s.Names ??= [];
            s.Roles ??= [];
            s.CpuTempSource = CpuSources.Normalize(s.CpuTempSource);
            return s.Clone();
        }
        catch (Exception ex)
        {
            _log.Warn("Cooling: the global settings could not be read; using defaults", ex);
            return new CoolingGlobalSettings();
        }
    }

    private void ApplyProviderSettings()
    {
        int port;
        lock (_gate) port = _settings.LhmPort;
        foreach (var p in _providers.OfType<LhmProvider>()) p.Port = port;
    }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync().ConfigureAwait(false);
        if (_loop is not null) { try { await _loop.ConfigureAwait(false); } catch (OperationCanceledException) { } }
        foreach (var p in _providers)
        {
            try { await p.DisposeAsync().ConfigureAwait(false); } catch (Exception ex) { _log.Warn($"Cooling: disposing {p.Name} failed", ex); }
        }
        _cts.Dispose();
        _wake.Dispose();
    }
}
