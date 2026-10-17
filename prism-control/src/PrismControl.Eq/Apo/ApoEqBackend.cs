using System.Text.Json;
using System.Text.Json.Serialization;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Infrastructure;

namespace PrismControl.Eq.Apo;

/// <summary>
/// The Equalizer APO backend (the alternative). APO has no API: the state (bands per device, presets) is
/// plugin-owned JSON in the module's data folder, and every change regenerates <c>prism-control.txt</c> in APO's
/// config folder through the coalescer (100 ms trailing / 250 ms max wait, at most ~10 writes/s, nothing written
/// when nothing changed). <c>config.txt</c> is only touched by an explicit Attach / Detach (research eq.md §6.4).
/// A <see cref="FileSystemWatcher"/> on config.txt notices when another app drops our include ("Detached"); we never
/// silently re-insert it.
/// <para>
/// Safe mode (<see cref="EqWriteGate"/>): config.txt, prism-control.txt and apo-state.json (which lives in the user's real
/// data folder) are never written, and the data folder is not even created. Attach/Detach, edits, presets and imports
/// change the in-memory state only (the attachment is simulated), so keys and dials respond. Reads stay real.
/// </para>
/// </summary>
public sealed class ApoEqBackend : IEqBackend
{
    internal sealed class BandDto
    {
        public int Index { get; set; }
        public bool Enabled { get; set; } = true;
        public EqFilterType Type { get; set; }
        public double Hz { get; set; }
        public double Gain { get; set; }
        public double Q { get; set; } = 1.41;

        public EqBand ToBand() => new(Index, Enabled, Type, Hz, Gain, Q);
        public static BandDto From(EqBand b) => new() { Index = b.Index, Enabled = b.Enabled, Type = b.Type, Hz = b.FrequencyHz, Gain = b.GainDb, Q = b.Q };
    }

    internal sealed class DeviceDto
    {
        public bool Enabled { get; set; } = true;
        public string PresetId { get; set; } = ApoPresets.FlatId;
        public bool AutoPreamp { get; set; } = true;
        public double PreampDb { get; set; }
        public List<BandDto> Bands { get; set; } = ApoPresets.Grid().Select(BandDto.From).ToList();

        public DeviceDto Clone() => new()
        {
            Enabled = Enabled, PresetId = PresetId, AutoPreamp = AutoPreamp, PreampDb = PreampDb,
            Bands = Bands.Select(b => new BandDto { Index = b.Index, Enabled = b.Enabled, Type = b.Type, Hz = b.Hz, Gain = b.Gain, Q = b.Q }).ToList(),
        };
    }

    internal sealed class PresetDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public List<BandDto> Bands { get; set; } = [];
    }

    internal sealed class StateFile
    {
        public int Version { get; set; } = 1;
        /// <summary>The user pressed Attach (APO editing is opt-in).</summary>
        public bool Attached { get; set; }
        public Dictionary<string, DeviceDto> Devices { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public List<PresetDto> Presets { get; set; } = [];
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public const string StateFileName = "apo-state.json";

    private readonly IApoEnvironment _env;
    private readonly string _dataDir;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly EqWriteGate _writes;
    private readonly object _gate = new();
    private readonly WriteCoalescer<string> _writer;
    /// <summary>Safe mode: the simulated attachment (null until Attach/Detach is pressed; then config.txt is not consulted).</summary>
    private bool? _safeAttached;
    private readonly Dictionary<string, DeviceDto> _snapshots = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, long> _versions = new(StringComparer.OrdinalIgnoreCase);
    private StateFile _state;
    private ApoInstall? _install;
    private IReadOnlyList<ApoDevice> _devices = [];
    private EqAvailability _availability = EqAvailability.Unknown;
    private bool _fileAttached;
    private long _probedAt;
    private bool _probed;
    private long _versionSeed;
    private FileSystemWatcher? _watcher;
    private string? _watchedDir;
    private ITimer? _recheck;

    /// <param name="writes">The safe-mode gate for the three files (default: safe when PRISM_CONTROL_SAFE_MODE is on).</param>
    public ApoEqBackend(IApoEnvironment env, string dataDirectory, ILog log, TimeProvider time, EqWriteGate? writes = null)
    {
        _env = env;
        _dataDir = dataDirectory;
        _log = log;
        _time = time;
        _writes = writes ?? EqWriteGate.FromEnvironment(log);
        _state = LoadState();
        _writer = new WriteCoalescer<string>(time, WriteAsync, (_, ex) => _log.Warn($"Equalizer APO write failed: {ex.Message}"),
            debounce: TimeSpan.FromMilliseconds(100), maxWait: TimeSpan.FromMilliseconds(250), minGap: TimeSpan.FromMilliseconds(100));
    }

    public string Id => "apo";
    public string DisplayName => "Equalizer APO";
    public EqCapabilities Capabilities =>
        EqCapabilities.GainBands | EqCapabilities.ParametricBands | EqCapabilities.BandEnable | EqCapabilities.Presets |
        EqCapabilities.MultipleChannels | EqCapabilities.Preamp | EqCapabilities.ResetToDefault | EqCapabilities.EqBypass | EqCapabilities.ExternalChanges;
    public EqAvailability Availability { get { lock (_gate) return _availability; } }
    public TimeSpan NextPollDelay => TimeSpan.FromSeconds(5);
    public ApoInstall? Install { get { lock (_gate) return _install; } }
    public bool AttachRequested { get { lock (_gate) return _state.Attached; } }
    public int WritesStarted => _writer.WritesStarted;
    /// <summary>The safe-mode gate; its counters say what would have been written.</summary>
    public EqWriteGate Writes => _writes;

    public event EventHandler<EqChangedEventArgs>? Changed;
    public event EventHandler<EqAvailability>? AvailabilityChanged;

    // ------------------------------------------------------------------ availability

    public Task<EqAvailability> ProbeAsync(CancellationToken ct) => Task.Run(Probe, ct);

    private EqAvailability Probe()
    {
        var install = _env.FindInstall();
        var devices = install is null ? [] : _env.ListDevices();
        bool? simulated;
        lock (_gate) simulated = _safeAttached;
        var fileAttached = install is not null && (simulated ?? SafeIsAttached(install.ConfigPath));
        EqAvailability a;
        bool changed;
        lock (_gate)
        {
            _install = install;
            _devices = devices;
            _fileAttached = fileAttached;
            _probed = true;
            _probedAt = _time.GetTimestamp();
            a = Compute();
            changed = a.Code != _availability.Code;
            _availability = a;
        }
        if (install is not null) EnsureWatcher(install.ConfigPath);
        if (changed) AvailabilityChanged?.Invoke(this, a);
        return a;
    }

    private EqAvailability Compute()
    {
        if (_install is null) return new(EqAvailabilityCode.NotInstalled, "Equalizer APO isn't installed. Install it, or switch the backend to SteelSeries Sonar.");
        if (_devices.Count == 0) return new(EqAvailabilityCode.NoDevices, "Equalizer APO isn't set up on any device. Run its Configurator (needs admin), then restart the device.");
        if (!Directory.Exists(_install.ConfigPath)) return new(EqAvailabilityCode.Error, "Equalizer APO's config folder is missing.", _install.ConfigPath);
        if (!_state.Attached) return new(EqAvailabilityCode.NotAttached, "Not attached yet. Press “Attach Equalizer APO”: Prism Control adds one Include line to config.txt and edits only its own prism-control.txt.");
        if (!_fileAttached) return new(EqAvailabilityCode.Detached, "Detached: config.txt no longer includes prism-control.txt (another app may have rewritten it). Press “Attach Equalizer APO” to re-attach.");
        return EqAvailability.Ok;
    }

    private bool SafeIsAttached(string dir)
    {
        try { return ApoConfigFiles.IsAttached(dir); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { _log.Debug($"APO: cannot read config.txt: {ex.Message}"); return false; }
    }

    private void EnsureWatcher(string dir)
    {
        lock (_gate)
        {
            if (_watchedDir == dir || !Directory.Exists(dir)) return;
            _watcher?.Dispose();
            _watchedDir = dir;
            try
            {
                var w = new FileSystemWatcher(dir, ApoConfigFiles.MainFile) { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size };
                FileSystemEventHandler h = (_, _) => ScheduleRecheck();
                w.Changed += h;
                w.Created += h;
                w.Deleted += h;
                w.Renamed += (_, _) => ScheduleRecheck();
                w.EnableRaisingEvents = true;
                _watcher = w;
            }
            catch (Exception ex) when (ex is IOException or ArgumentException or UnauthorizedAccessException)
            {
                _log.Debug($"APO: cannot watch {dir}: {ex.Message}");
            }
        }
    }

    private void ScheduleRecheck()
    {
        lock (_gate)
        {
            _recheck ??= _time.CreateTimer(_ => { try { Probe(); } catch (Exception ex) { _log.Debug($"APO re-check failed: {ex.Message}"); } }, null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            _recheck.Change(TimeSpan.FromMilliseconds(200), Timeout.InfiniteTimeSpan);
        }
    }

    /// <summary>Opt-in: writes prism-control.txt, then prepends our two lines to config.txt (once). Simulated in safe mode.</summary>
    public Task<EqAvailability> AttachAsync(CancellationToken ct) => Task.Run(() =>
    {
        var install = _env.FindInstall() ?? throw new EqUnavailableException(new(EqAvailabilityCode.NotInstalled, "Equalizer APO isn't installed."));
        string include;
        lock (_gate)
        {
            _state.Attached = true;
            include = IncludeContentLocked();
        }
        if (_writes.Allow("write prism-control.txt")) ApoConfigFiles.WriteInclude(install.ConfigPath, include);
        if (_writes.Allow("attach config.txt"))
        {
            var added = ApoConfigFiles.Attach(install.ConfigPath);
            _log.Info(added ? "Equalizer APO attached: added the Prism Control include to config.txt." : "Equalizer APO: config.txt already includes prism-control.txt.");
        }
        else lock (_gate) _safeAttached = true;
        SaveState();
        return Probe();
    }, ct);

    /// <summary>Removes only our two lines from config.txt (prism-control.txt stays, unused). Simulated in safe mode.</summary>
    public Task<EqAvailability> DetachAsync(CancellationToken ct) => Task.Run(() =>
    {
        var install = _env.FindInstall();
        if (!_writes.Allow("detach config.txt")) lock (_gate) _safeAttached = false;
        else
        {
            if (install is not null) ApoConfigFiles.Detach(install.ConfigPath);
            _log.Info("Equalizer APO detached.");
        }
        lock (_gate) _state.Attached = false;
        SaveState();
        return Probe();
    }, ct);

    private async Task EnsureProbedAsync(CancellationToken ct)
    {
        bool stale;
        lock (_gate) stale = !_probed || _time.GetElapsedTime(_probedAt) > TimeSpan.FromSeconds(5);
        if (stale) await ProbeAsync(ct).ConfigureAwait(false);
    }

    // ------------------------------------------------------------------ channels, state, presets

    public async Task<IReadOnlyList<EqChannel>> GetChannelsAsync(CancellationToken ct)
    {
        await EnsureProbedAsync(ct).ConfigureAwait(false);
        lock (_gate)
            return _devices.OrderByDescending(d => d.IsActive).ThenBy(d => d.Kind).ThenBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                .Select(d => new EqChannel(d.Guid, d.Name, d.Kind, d.IsActive, d.EndpointId)).ToList();
    }

    public EqState? TryGetCachedState(string channelId)
    {
        lock (_gate) return _availability.Available && _devices.Any(d => Same(d.Guid, channelId)) ? StateOf(channelId) : null;
    }

    public async Task<EqState> GetStateAsync(string channelId, TimeSpan maxAge, CancellationToken ct)
    {
        await EnsureProbedAsync(ct).ConfigureAwait(false);
        lock (_gate)
        {
            if (!_availability.Available) throw new EqUnavailableException(_availability);
            if (!_devices.Any(d => Same(d.Guid, channelId)))
                throw new EqUnavailableException(new(EqAvailabilityCode.ChannelMissing, "That device doesn't have Equalizer APO (or is gone). Pick another channel.", "Pick another in its settings."));
            return StateOf(channelId);
        }
    }

    public Task<IReadOnlyList<EqPreset>> GetPresetsAsync(string channelId, TimeSpan maxAge, CancellationToken ct)
    {
        lock (_gate)
        {
            IReadOnlyList<EqPreset> list = [.. ApoPresets.BuiltIn.Select((p, i) => p.ToEqPreset(i)), .. _state.Presets.Select(p => new EqPreset(p.Id, p.Name, false, -1, false))];
            return Task.FromResult(list);
        }
    }

    public async Task<EqState> SelectPresetAsync(string channelId, string presetId, CancellationToken ct)
    {
        await GetStateAsync(channelId, TimeSpan.Zero, ct).ConfigureAwait(false);
        var preset = FindPreset(presetId) ?? throw new EqPresetMissingException(channelId, presetId);
        return Edit(channelId, d =>
        {
            d.Bands = preset.Bands.Select(BandDto.From).ToList();
            d.PresetId = preset.Id;
        });
    }

    public EqState SetGain(string channelId, EqTarget target, double gainDb) => Edit(channelId, d =>
    {
        var l = EqLimits.Apo;
        if (target.Knob == EqKnob.Preamp) { d.AutoPreamp = false; d.PreampDb = Math.Round(Math.Clamp(gainDb, l.MinGainDb, l.MaxGainDb), 2); return; }
        if (target.Knob is not null) throw new InvalidOperationException("Equalizer APO has no tone knobs; use a band.");
        var b = d.Bands.FirstOrDefault(x => x.Index == target.Band) ?? throw new ArgumentOutOfRangeException(nameof(target), $"Band {target.Band} does not exist.");
        b.Gain = Math.Round(Math.Clamp(gainDb, l.MinGainDb, l.MaxGainDb), 2);
    });

    public EqState SetBand(string channelId, int bandIndex, EqBandPatch p) => Edit(channelId, d =>
    {
        var l = EqLimits.Apo;
        var b = d.Bands.FirstOrDefault(x => x.Index == bandIndex) ?? throw new ArgumentOutOfRangeException(nameof(bandIndex));
        if (p.Enabled is { } en) b.Enabled = en;
        if (p.Type is { } t) b.Type = t;
        if (p.FrequencyHz is { } hz) b.Hz = Math.Round(Math.Clamp(hz, l.MinHz, l.MaxHz), 2);
        if (p.GainDb is { } g) b.Gain = Math.Round(Math.Clamp(g, l.MinGainDb, l.MaxGainDb), 2);
        if (p.Q is { } q) b.Q = Math.Round(Math.Clamp(q, l.MinQ, l.MaxQ), 3);
    });

    public EqState SetEnabled(string channelId, EqToggleScope scope, bool enabled) => Edit(channelId, d => d.Enabled = enabled);

    public EqState Reset(string channelId, EqResetScope scope, EqTarget target) => Edit(channelId, d =>
    {
        var preset = FindPreset(d.PresetId) ?? ApoPresets.BuiltIn[0];
        switch (scope)
        {
            case EqResetScope.Gain or EqResetScope.Band when target.Knob is not null:
                d.AutoPreamp = true;
                break;
            case EqResetScope.Gain:
            {
                var b = d.Bands.FirstOrDefault(x => x.Index == target.Band);
                if (b is not null) b.Gain = preset.Bands.FirstOrDefault(x => x.Index == target.Band)?.GainDb ?? 0;
                break;
            }
            case EqResetScope.Band:
            {
                var i = d.Bands.FindIndex(x => x.Index == target.Band);
                var pb = preset.Bands.FirstOrDefault(x => x.Index == target.Band);
                if (i >= 0) d.Bands[i] = pb is null ? new BandDto { Index = target.Band, Enabled = d.Bands[i].Enabled, Type = d.Bands[i].Type, Hz = d.Bands[i].Hz, Q = d.Bands[i].Q } : BandDto.From(pb);
                break;
            }
            case EqResetScope.AllBands:
                d.Bands = preset.Bands.Select(BandDto.From).ToList();
                break;
            case EqResetScope.Knobs:
                d.AutoPreamp = true;
                break;
            case EqResetScope.Everything:
                d.Bands = preset.Bands.Select(BandDto.From).ToList();
                d.AutoPreamp = true;
                d.Enabled = true;
                break;
        }
    });

    public async Task<bool> RevertSessionAsync(string channelId, CancellationToken ct)
    {
        EqState state;
        lock (_gate)
        {
            if (!_snapshots.Remove(channelId, out var snap)) return false;
            _state.Devices[channelId] = snap;
            _versions[channelId] = ++_versionSeed;
            state = StateOf(channelId);
        }
        _writer.Schedule("apo");
        await _writer.FlushAsync(ct).ConfigureAwait(false);
        Changed?.Invoke(this, new EqChangedEventArgs(channelId, state, External: false));
        return true;
    }

    /// <summary>Saves the device's current bands as a named plugin-side preset (and makes it the active one).</summary>
    public EqPreset SaveUserPreset(string channelId, string name)
    {
        EqPreset p;
        lock (_gate)
        {
            var d = Device(channelId);
            var dto = new PresetDto { Id = "user:" + Guid.NewGuid().ToString("N")[..12], Name = Clean(name, "My preset"), Bands = d.Clone().Bands };
            _state.Presets.Add(dto);
            d.PresetId = dto.Id;
            _versions[channelId] = ++_versionSeed;
            p = new EqPreset(dto.Id, dto.Name, false, -1, false);
        }
        _writer.Schedule("apo");
        return p;
    }

    /// <summary>Imports an AutoEQ / REW "ParametricEQ.txt" as a plugin-side preset. Returns null when no filter line was found.</summary>
    public EqPreset? ImportPreset(string name, string parametricText)
    {
        var (bands, _) = ApoPresets.ParseParametric(parametricText, EqLimits.Apo.MaxBands);
        if (bands.Count == 0) return null;
        PresetDto dto;
        lock (_gate)
        {
            dto = new PresetDto { Id = "user:" + Guid.NewGuid().ToString("N")[..12], Name = Clean(name, "Imported"), Bands = bands.Select(BandDto.From).ToList() };
            _state.Presets.Add(dto);
        }
        _writer.Schedule("apo");
        return new EqPreset(dto.Id, dto.Name, false, -1, false);
    }

    public Task FlushAsync(CancellationToken ct) => _writer.FlushAsync(ct);
    public Task WhenWritesIdleAsync(CancellationToken ct = default) => _writer.WhenIdleAsync(ct);

    public async Task PollAsync(CancellationToken ct)
    {
        var before = Availability.Code;
        var a = await ProbeAsync(ct).ConfigureAwait(false);
        if (a.Code != before && a.Available)
        {
            string[] ids;
            lock (_gate) ids = _devices.Select(d => d.Guid).ToArray();
            foreach (var id in ids) Changed?.Invoke(this, new EqChangedEventArgs(id, TryGetCachedState(id), External: true));
        }
    }

    // ------------------------------------------------------------------ internals

    private EqState Edit(string channelId, Action<DeviceDto> edit)
    {
        EqState state;
        lock (_gate)
        {
            if (!_availability.Available) throw new EqUnavailableException(_availability);
            var d = Device(channelId);
            if (!_snapshots.ContainsKey(channelId)) _snapshots[channelId] = d.Clone();
            edit(d);
            _versions[channelId] = ++_versionSeed;
            state = StateOf(channelId);
        }
        _writer.Schedule("apo");
        Changed?.Invoke(this, new EqChangedEventArgs(channelId, state, External: false));
        return state;
    }

    private DeviceDto Device(string channelId)
    {
        if (!_state.Devices.TryGetValue(channelId, out var d)) _state.Devices[channelId] = d = new DeviceDto();
        return d;
    }

    private ApoPreset? FindPreset(string? id)
    {
        if (id is null) return null;
        var b = ApoPresets.BuiltIn.FirstOrDefault(p => p.Id == id);
        if (b is not null) return b;
        lock (_gate)
        {
            var u = _state.Presets.FirstOrDefault(p => p.Id == id);
            return u is null ? null : new ApoPreset(u.Id, u.Name, u.Bands.Select(x => x.ToBand()).ToList(), false);
        }
    }

    private EqState StateOf(string channelId)
    {
        var d = Device(channelId);
        var bands = d.Bands.Select(b => b.ToBand()).ToList();
        var preset = FindPreset(d.PresetId);
        var modified = preset is null || !SameBands(bands, preset.Bands);
        var draft = new EqState(channelId, d.Enabled, d.Enabled, bands, new Dictionary<EqKnob, double>(), preset?.ToEqPreset(0), modified, EqLimits.Apo, _versions.GetValueOrDefault(channelId));
        var preamp = d.AutoPreamp ? AutoPreamp(draft) : d.PreampDb;
        return draft with { Knobs = new Dictionary<EqKnob, double> { [EqKnob.Preamp] = preamp } };
    }

    /// <summary>Headroom: minus the curve's highest point (0 when nothing boosts).</summary>
    public static double AutoPreamp(EqState state)
    {
        var peak = EqMath.PeakDb(state);
        return peak > 0.05 ? -Math.Ceiling(peak * 10) / 10 : 0;
    }

    private static bool SameBands(IReadOnlyList<EqBand> a, IReadOnlyList<EqBand> b) =>
        a.Count == b.Count && a.Zip(b).All(p => p.First.Index == p.Second.Index && p.First.Enabled == p.Second.Enabled && p.First.Type == p.Second.Type &&
            Math.Abs(p.First.FrequencyHz - p.Second.FrequencyHz) < 0.01 && Math.Abs(p.First.GainDb - p.Second.GainDb) < 0.01 && Math.Abs(p.First.Q - p.Second.Q) < 0.001);

    private string IncludeContentLocked()
    {
        var blocks = new List<ApoConfigFiles.DeviceBlock>();
        foreach (var dev in _devices)
        {
            if (!_state.Devices.ContainsKey(dev.Guid)) continue; // never touched: nothing to emit
            var s = StateOf(dev.Guid);
            blocks.Add(new ApoConfigFiles.DeviceBlock(dev.Guid, dev.Name, s.Enabled, s.Knobs[EqKnob.Preamp], s.Bands));
        }
        return ApoConfigFiles.Generate(blocks);
    }

    private Task WriteAsync(string _, CancellationToken ct)
    {
        string stateJson;
        string? include = null;
        string? dir = null;
        lock (_gate)
        {
            stateJson = JsonSerializer.Serialize(_state, Json);
            if (_state.Attached && _fileAttached && _install is not null)
            {
                include = IncludeContentLocked();
                dir = _install.ConfigPath;
            }
        }
        return Task.Run(() =>
        {
            SaveStateJson(stateJson);
            if (include is not null && dir is not null && _writes.Allow("write prism-control.txt") && ApoConfigFiles.WriteInclude(dir, include))
                _log.Debug("Equalizer APO: prism-control.txt rewritten.");
        }, ct);
    }

    private StateFile LoadState()
    {
        try
        {
            var path = Path.Combine(_dataDir, StateFileName);
            if (!File.Exists(path)) return new StateFile();
            var s = JsonSerializer.Deserialize<StateFile>(File.ReadAllText(path), Json) ?? new StateFile();
            s.Devices = new Dictionary<string, DeviceDto>(s.Devices, StringComparer.OrdinalIgnoreCase);
            return s;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            _log.Warn($"Equalizer APO: could not read {StateFileName} ({ex.Message}); starting fresh.");
            return new StateFile();
        }
    }

    private void SaveState()
    {
        string json;
        lock (_gate) json = JsonSerializer.Serialize(_state, Json);
        SaveStateJson(json);
    }

    private void SaveStateJson(string json)
    {
        if (!_writes.Allow("write apo-state.json")) return; // safe mode: the real data folder is left alone
        Directory.CreateDirectory(_dataDir);
        ApoConfigFiles.WriteAtomic(Path.Combine(_dataDir, StateFileName), System.Text.Encoding.UTF8.GetBytes(json));
    }

    private static string Clean(string? name, string fallback)
    {
        var n = new string((name ?? "").Where(c => !char.IsControl(c)).ToArray()).Trim();
        return n.Length == 0 ? fallback : n.Length > 40 ? n[..40] : n;
    }

    private static bool Same(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    public async ValueTask DisposeAsync()
    {
        await _writer.DisposeAsync().ConfigureAwait(false);
        lock (_gate)
        {
            _watcher?.Dispose();
            _watcher = null;
            _recheck?.Dispose();
        }
    }
}
