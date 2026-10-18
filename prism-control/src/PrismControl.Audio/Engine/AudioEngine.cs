using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Audio.Interop;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>Start-up options for <see cref="AudioEngine"/> (tests swap the COM roots for fakes and shorten the timers).</summary>
internal sealed class AudioEngineOptions
{
    /// <summary>The event-context GUID on every Set* call (a second engine with another one sees our writes as external).</summary>
    public Guid EventContext { get; init; } = AudioEngine.EventContext;

    /// <summary>
    /// Safe mode backstop: no Core Audio setter is ever called; writes only change the cache. (The module also puts
    /// <see cref="SafeAudioEngine"/> in front of the engine, so writes normally never reach it.)
    /// </summary>
    public bool SafeMode { get; init; }

    /// <summary>Creates the IMMDeviceEnumerator and returns an owned pointer (CoCreateInstance by default).</summary>
    public Func<(int Hr, nint Enumerator)> CreateEnumerator { get; init; } = CreateMMDeviceEnumerator;

    /// <summary>Creates the default-device setter (IPolicyConfig by default); null when unavailable.</summary>
    public Func<(IDefaultEndpointSetter? Setter, int Hr)> CreatePolicy { get; init; } = () => (PolicyConfigClient.TryCreate(out var hr), hr);

    /// <summary>How often a cheap read checks that the audio service still answers.</summary>
    public TimeSpan ProbeInterval { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>The first wait before reconnecting after the audio service went away; it doubles up to <see cref="MaxRetry"/>.</summary>
    public TimeSpan FirstRetry { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan MaxRetry { get; init; } = TimeSpan.FromSeconds(30);

    private static (int, nint) CreateMMDeviceEnumerator()
    {
        var hr = Native.CoCreateInstance(Iids.CLSID_MMDeviceEnumerator, 0, Native.CLSCTX_ALL, Iids.IMMDeviceEnumerator, out var p);
        return (hr, p);
    }
}

/// <summary>
/// The Windows Core Audio engine (one per plugin, registered as <see cref="IAudioEngine"/>).
/// <list type="bullet">
/// <item>Every COM call runs on one MTA worker thread (<see cref="ComWorker"/>); COM callbacks only post to it.</item>
/// <item>Endpoints, defaults, volumes and mutes live in a cache that <see cref="IMMNotificationClient"/> and one
/// <see cref="IAudioEndpointVolumeCallback"/> per active endpoint keep current, so reads are cheap and never poll.</item>
/// <item>Sessions (the mixer) and peak meters run only while something holds a lease (<see cref="WatchSessions"/>, <see cref="OpenMeter"/>);
/// loopback capture for the spectrum only while a stream is open (AudioEngine.Loopback.cs).</item>
/// <item>Our own writes carry <see cref="EventContext"/>; notifications with it are ignored (no echo loops with dials).</item>
/// <item>Every COM object is a unique RCW released as soon as it is no longer needed, callbacks are unregistered before
/// the objects they live on are released, and nothing waits for the GC.</item>
/// <item>If the audio service goes away (a restart, AUDCLNT_E_SERVICE_NOT_RUNNING, RPC disconnects), the engine reports
/// unavailable (keys show "no audio"), drops every object and reconnects with backoff. A cheap read every few seconds
/// notices an outage nobody is writing during.</item>
/// </list>
/// </summary>
public sealed partial class AudioEngine : IAudioEngine, IAsyncDisposable, IAudioCallbackSink
{
    /// <summary>The event-context GUID on every Set* call this plugin makes.</summary>
    public static readonly Guid EventContext = new("5b0e3f6c-7a3d-4c1e-9d42-8f1a6b2c9e70");

    private static readonly TimeSpan MeterInterval = TimeSpan.FromMilliseconds(33);
    private static readonly TimeSpan SessionLinger = TimeSpan.FromSeconds(5);
    private static readonly uint s_ownPid = (uint)Environment.ProcessId;

    private readonly ILog _log;
    private readonly AudioEngineOptions _options;
    private readonly Guid _eventContext;
    private readonly bool _safeMode;
    private readonly ComWorker _worker;
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly object _gate = new();

    // ---------------------------------------------------------------- cache (guarded by _gate, copy-on-write)
    private Dictionary<string, AudioDevice> _devices = new(StringComparer.Ordinal);
    private IReadOnlyList<AudioDevice> _render = [], _capture = [];
    private readonly string?[,] _defaults = new string?[2, 3];
    private Dictionary<string, SessionInfo> _sessionCache = new(StringComparer.Ordinal);
    private readonly Dictionary<string, float> _pendingVolume = new(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _pendingMute = new(StringComparer.Ordinal);
    private readonly Dictionary<(string App, string? Device), float> _pendingAppVolume = new();
    private readonly List<MeterLease> _meterLeases = [];
    private int _sessionWatchers;
    private volatile bool _available, _canSetDefault, _disposed;

    // ---------------------------------------------------------------- COM state (worker thread only)
    private IMMDeviceEnumerator? _enumerator;
    private DeviceNotifications? _notifications;
    private bool _notificationsRegistered;
    private readonly Dictionary<string, Endpoint> _endpoints = new(StringComparer.Ordinal);
    private IDefaultEndpointSetter? _policy;
    private bool _policyWarned;
    private bool _sessionsRunning;
    private readonly Dictionary<string, DeviceSessions> _sessionManagers = new(StringComparer.Ordinal);
    private readonly Dictionary<string, SessionEntry> _sessions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _descriptions = new(StringComparer.OrdinalIgnoreCase);

    // ---------------------------------------------------------------- recovery (worker thread only, timers under _gate)
    private bool _recovering;
    private TimeSpan _retryDelay;
    private int _retryAttempts;
    private long _downSince;
    private Timer? _retryTimer, _probeTimer;

    private int _refreshQueued, _sampleQueued, _recoveryQueued;
    private readonly HashSet<string> _rescanQueued = new(StringComparer.Ordinal);
    private Timer? _meterTimer, _sessionStopTimer;

    private AudioEngine(ILog log, AudioEngineOptions options)
    {
        _log = log;
        _options = options;
        _eventContext = options.EventContext;
        _safeMode = options.SafeMode;
        _worker = new ComWorker(log);
    }

    /// <summary>Creates the engine and starts initializing it on its worker (returns immediately).</summary>
    public static AudioEngine Start(ILog log) => Start(log, new AudioEngineOptions());

    /// <summary>Tests: a second engine with its own event context sees the first one's writes as external changes.</summary>
    internal static AudioEngine Start(ILog log, Guid eventContext) => Start(log, new AudioEngineOptions { EventContext = eventContext });

    internal static AudioEngine Start(ILog log, AudioEngineOptions options)
    {
        var engine = new AudioEngine(log, options);
        if (!engine._worker.Post(engine.Initialize)) engine._ready.TrySetResult();
        return engine;
    }

    // Raw callback counters (before any filtering), for live verification.
    private int _endpointNotifications, _defaultNotifications, _sessionNotifications, _recoveries, _suppressedWrites;
    internal int EndpointNotifications => Volatile.Read(ref _endpointNotifications);
    internal int DefaultNotifications => Volatile.Read(ref _defaultNotifications);
    internal int SessionNotifications => Volatile.Read(ref _sessionNotifications);
    /// <summary>How many times the engine noticed the audio service was gone and started reconnecting.</summary>
    internal int Recoveries => Volatile.Read(ref _recoveries);
    /// <summary>Safe mode: Core Audio writes that were skipped.</summary>
    internal int SuppressedWrites => Volatile.Read(ref _suppressedWrites);

    /// <summary>How many COM callbacks are registered (all should be): endpoints, volume callbacks, session managers, session event sinks.</summary>
    internal Task<(int Endpoints, int VolumeCallbacks, int SessionManagers, int SessionManagersRegistered, int Sessions, int SessionEvents)> RegistrationsAsync() =>
        _worker.InvokeAsync(() => (_endpoints.Count, _endpoints.Values.Count(e => e.Registered), _sessionManagers.Count,
            _sessionManagers.Values.Count(m => m.Registered), _sessions.Count, _sessions.Values.Count(x => x.Registered)));

    /// <summary>Completes when the first device scan is done (or initialization failed).</summary>
    public Task Ready => _ready.Task;

    public bool IsAvailable => _available;
    public bool CanSetDefault => _canSetDefault;
    public event Action<AudioChange>? Changed;

    // ================================================================ reads

    public IReadOnlyList<AudioDevice> GetDevices(AudioFlow flow)
    {
        lock (_gate) return flow == AudioFlow.Render ? _render : _capture;
    }

    public AudioDevice? GetDevice(string id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        lock (_gate) return _devices.GetValueOrDefault(id);
    }

    public string? GetDefaultId(AudioFlow flow, AudioRole role)
    {
        lock (_gate) return _defaults[(int)flow, (int)role];
    }

    public IReadOnlyList<AudioApp> GetApps(string? deviceId = null)
    {
        SessionInfo[] sessions;
        string? defaultRender;
        lock (_gate)
        {
            sessions = [.. _sessionCache.Values];
            defaultRender = _defaults[0, 0];
        }
        return SessionGrouping.Group(sessions, deviceId, defaultRender);
    }

    // ================================================================ writes

    public Task SetVolumeAsync(string deviceId, float volume)
    {
        volume = Math.Clamp(volume, 0f, 1f);
        bool changed;
        lock (_gate)
        {
            if (!_devices.TryGetValue(deviceId, out var d)) return Task.FromException(new InvalidOperationException("That audio device is not available."));
            if (!d.HasVolume) return Task.CompletedTask;
            changed = Math.Abs(d.Volume - volume) > 0.00001f;
            if (changed) ReplaceDevice(d with { Volume = volume });
            _pendingVolume[deviceId] = volume;
        }
        if (changed) Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return _worker.InvokeAsync(() => FlushVolume(deviceId));
    }

    public Task SetMuteAsync(string deviceId, bool muted)
    {
        bool changed;
        lock (_gate)
        {
            if (!_devices.TryGetValue(deviceId, out var d)) return Task.FromException(new InvalidOperationException("That audio device is not available."));
            changed = d.Muted != muted;
            if (changed) ReplaceDevice(d with { Muted = muted });
            _pendingMute[deviceId] = muted;
        }
        if (changed) Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return _worker.InvokeAsync(() => FlushMute(deviceId));
    }

    public Task SetDefaultAsync(string deviceId, DefaultRoles roles)
    {
        if (!_available) return Task.FromException(new InvalidOperationException("Core Audio is not available right now."));
        if (!_canSetDefault) return Task.FromException(new NotSupportedException("Default-device switching is not available on this Windows build."));
        AudioDevice? d;
        lock (_gate) d = _devices.GetValueOrDefault(deviceId);
        if (d is null) return Task.FromException(new InvalidOperationException("That audio device is not available."));
        if (roles == DefaultRoles.None) return Task.CompletedTask;
        var flow = d.Flow == AudioFlow.Render ? EDataFlow.eRender : EDataFlow.eCapture;
        return _worker.InvokeAsync(() =>
        {
            foreach (var role in RolesOf(roles))
            {
                if (_safeMode)
                {
                    Suppressed($"would make a device the default {(d.Flow == AudioFlow.Render ? "output" : "input")} ({role})");
                    ApplyDefault(flow, role, deviceId);
                    continue;
                }
                if (_policy is null) throw new InvalidOperationException("Core Audio is reconnecting.");
                var hr = _policy.SetDefaultEndpoint(deviceId, role);
                if (hr < 0)
                {
                    CheckHr(hr, "SetDefaultEndpoint");
                    throw new COMException($"SetDefaultEndpoint({role}) failed 0x{hr:X8}", hr);
                }
                ApplyDefault(flow, role, deviceId);
            }
        });
    }

    public Task SetAppVolumeAsync(string appKey, string? deviceId, float volume)
    {
        volume = Math.Clamp(volume, 0f, 1f);
        var changed = UpdateSessions(appKey, deviceId, s => s with { Volume = volume });
        lock (_gate) _pendingAppVolume[(appKey, deviceId)] = volume;
        if (changed) Raise(new AudioChange(AudioChangeKind.Sessions));
        return _worker.InvokeAsync(() =>
        {
            float v;
            lock (_gate)
            {
                if (!_pendingAppVolume.Remove((appKey, deviceId), out v)) return;
            }
            if (_safeMode) Suppressed($"would set an app's volume to {Pct(v)}%");
            foreach (var e in MatchingSessions(appKey, deviceId))
            {
                if (!_safeMode && e.Volume is { } sv && CheckHr(sv.SetMasterVolume(v, _eventContext), "ISimpleAudioVolume::SetMasterVolume")) break;
                e.Info = e.Info with { Volume = v };
            }
            PublishSessions();
        });
    }

    public Task SetAppMuteAsync(string appKey, string? deviceId, bool muted)
    {
        var changed = UpdateSessions(appKey, deviceId, s => s with { Muted = muted });
        if (changed) Raise(new AudioChange(AudioChangeKind.Sessions));
        return _worker.InvokeAsync(() =>
        {
            if (_safeMode) Suppressed($"would {(muted ? "mute" : "unmute")} an app");
            foreach (var e in MatchingSessions(appKey, deviceId))
            {
                if (!_safeMode && e.Volume is { } sv && CheckHr(sv.SetMute(muted ? 1 : 0, _eventContext), "ISimpleAudioVolume::SetMute")) break;
                e.Info = e.Info with { Muted = muted };
            }
            PublishSessions();
        });
    }

    private void Suppressed(string what)
    {
        Interlocked.Increment(ref _suppressedWrites);
        SafeModeLog.Suppressed(_log, what);
    }

    private static int Pct(float v) => (int)Math.Round(v * 100, MidpointRounding.AwayFromZero);

    // ================================================================ leases

    public IDisposable WatchSessions()
    {
        bool start;
        lock (_gate)
        {
            start = ++_sessionWatchers == 1;
            _sessionStopTimer?.Dispose();
            _sessionStopTimer = null;
        }
        if (start) _worker.Post(StartSessions);
        return new Lease(() =>
        {
            lock (_gate)
            {
                if (--_sessionWatchers > 0 || _disposed) return;
                // Linger, so a page switch that hides and shows a mixer does not tear down and rebuild every callback.
                _sessionStopTimer?.Dispose();
                _sessionStopTimer = new Timer(_ =>
                {
                    lock (_gate) { if (_sessionWatchers > 0) return; }
                    _worker.Post(StopSessions);
                }, null, SessionLinger, Timeout.InfiniteTimeSpan);
            }
        });
    }

    public IAudioMeter OpenMeter(string deviceId)
    {
        var lease = new MeterLease(this, deviceId);
        lock (_gate)
        {
            _meterLeases.Add(lease);
            if (_meterLeases.Count == 1 && !_disposed)
                _meterTimer = new Timer(_ => QueueSample(), null, TimeSpan.Zero, MeterInterval);
        }
        return lease;
    }

    private void CloseMeter(MeterLease lease)
    {
        lock (_gate)
        {
            if (!_meterLeases.Remove(lease) || _meterLeases.Count > 0) return;
            _meterTimer?.Dispose();
            _meterTimer = null;
        }
    }

    public Task<bool?> IsCaptureInUseAsync(string deviceId) => _worker.InvokeAsync<bool?>(() =>
    {
        if (!_endpoints.TryGetValue(deviceId, out var ep)) return null;
        var mgr = ep.SessionManager ??= Native.Activate<IAudioSessionManager2>(ep.Device, Iids.IAudioSessionManager2);
        if (mgr is null) return null;
        var hr = mgr.GetSessionEnumerator(out var pe);
        using var se = Native.Own<IAudioSessionEnumerator>(hr, pe);
        if (CheckHr(hr, "GetSessionEnumerator") || se.Value is not { } sessions || sessions.GetCount(out var n) != 0) return null;
        for (var i = 0; i < n; i++)
        {
            hr = sessions.GetSession(i, out var ps);
            using var s = Native.Own<IAudioSessionControl>(hr, ps);
            if (s.Value is { } control && control.GetState(out var st) == 0 && st == 1) return true;
        }
        return false;
    });

    // ================================================================ worker: start-up, health and recovery

    private void Initialize()
    {
        var sw = Stopwatch.StartNew();
        try
        {
            if (StartCore(out var problem))
            {
                int r, c;
                lock (_gate) { r = _render.Count; c = _capture.Count; }
                _log.Info($"Core Audio ready in {sw.ElapsedMilliseconds} ms: {r} outputs, {c} inputs, default switching {(_canSetDefault ? "available" : "unavailable")}" +
                    (_safeMode ? "; safe mode: nothing is written to Windows." : "."));
            }
            else
            {
                _log.Warn($"Core Audio is not available ({problem}); audio actions show 'no audio' and the engine keeps trying to connect.");
                EnterRecovery();
            }
        }
        catch (Exception ex)
        {
            _log.Error("Core Audio initialization failed; the engine keeps trying to connect", ex);
            EnterRecovery();
        }
        finally
        {
            _ready.TrySetResult();
            Raise(new AudioChange(AudioChangeKind.Availability));
        }
    }

    /// <summary>Creates the enumerator, registers for device notifications, scans endpoints and defaults. False (state torn down by the caller) when the service does not answer.</summary>
    private bool StartCore(out string problem)
    {
        var (hr, p) = _options.CreateEnumerator();
        if (hr < 0 || p == 0)
        {
            if (p != 0) Marshal.Release(p);
            problem = $"creating the device enumerator failed 0x{hr:X8}";
            return false;
        }
        _enumerator = Native.Wrap<IMMDeviceEnumerator>(p);
        _notifications = new DeviceNotifications(this);
        hr = _enumerator.RegisterEndpointNotificationCallback(_notifications);
        _notificationsRegistered = hr == 0;
        if (HResults.IsServiceDown(hr))
        {
            problem = $"RegisterEndpointNotificationCallback 0x{hr:X8}";
            return false;
        }
        if (hr != 0) _log.Warn($"RegisterEndpointNotificationCallback failed 0x{hr:X8}; device changes will not show live.");
        hr = RefreshDevices(raise: false);
        if (HResults.IsServiceDown(hr))
        {
            problem = $"listing the endpoints failed 0x{hr:X8}";
            return false;
        }
        RefreshDefaults();
        (_policy, var phr) = _options.CreatePolicy();
        _canSetDefault = _policy is not null;
        if (_policy is null && !_policyWarned)
        {
            _policyWarned = true;
            _log.Warn($"IPolicyConfig is not available (0x{phr:X8}); device switching is disabled.");
        }
        hr = ProbeHr();
        if (HResults.IsServiceDown(hr))
        {
            problem = $"the health check failed 0x{hr:X8}";
            return false;
        }
        _available = true;
        StartProbe();
        problem = "";
        return true;
    }

    private void StartProbe()
    {
        lock (_gate)
        {
            if (_disposed || _probeTimer is not null || _options.ProbeInterval <= TimeSpan.Zero) return;
            _probeTimer = new Timer(_ => _worker.Post(Probe), null, _options.ProbeInterval, _options.ProbeInterval);
        }
    }

    /// <summary>A cheap read through the enumerator and one endpoint (they each hold their own connection to the audio service).</summary>
    private int ProbeHr()
    {
        if (_enumerator is null) return HResults.CO_E_OBJNOTCONNECTED;
        var hr = _enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out var p);
        using (Native.Own<IMMDevice>(hr, p)) { }
        if (HResults.IsServiceDown(hr)) return hr;
        string? id;
        lock (_gate) id = _defaults[0, 0];
        var ep = id is not null && _endpoints.TryGetValue(id, out var d) && d.Volume is not null ? d : _endpoints.Values.FirstOrDefault(e => e.Volume is not null);
        if (ep?.Volume is not { } volume) return 0;
        hr = volume.GetMute(out _);
        if (hr == HResults.AUDCLNT_E_DEVICE_INVALIDATED) MarkStale(ep);
        return hr;
    }

    private void Probe()
    {
        if (_disposed || !_available || _recovering) return;
        try { CheckHr(ProbeHr(), "health check"); }
        catch (Exception ex) { _log.Debug($"audio health check: {ex.Message}"); }
    }

    /// <summary>True (and recovery queued) when <paramref name="hr"/> says the audio service is gone; DEVICE_INVALIDATED marks nothing here (callers know the endpoint).</summary>
    private bool CheckHr(int hr, string what)
    {
        if (!HResults.IsServiceDown(hr)) return false;
        RequestRecovery(what, hr);
        return true;
    }

    /// <summary>Recovery runs as its own work item, so a caller iterating the COM state is never pulled out from under.</summary>
    private void RequestRecovery(string what, int hr)
    {
        if (_disposed || Interlocked.Exchange(ref _recoveryQueued, 1) == 1) return;
        if (!_worker.Post(() => BeginRecovery(what, hr))) Volatile.Write(ref _recoveryQueued, 0);
    }

    private void BeginRecovery(string what, int hr)
    {
        Volatile.Write(ref _recoveryQueued, 0);
        if (_disposed || _recovering) return;
        Interlocked.Increment(ref _recoveries);
        _log.Warn($"Core Audio stopped answering ({what}: 0x{hr:X8}). Audio keys show 'no audio' until the audio service is back; reconnecting.");
        EnterRecovery();
        Raise(new AudioChange(AudioChangeKind.Availability));
        Raise(new AudioChange(AudioChangeKind.Devices));
        Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    private void EnterRecovery()
    {
        _recovering = true;
        _available = false;
        _downSince = Stopwatch.GetTimestamp();
        _retryAttempts = 0;
        Teardown();
        ClearCache();
        _retryDelay = _options.FirstRetry;
        ScheduleRetry();
    }

    private void ScheduleRetry()
    {
        lock (_gate)
        {
            _retryTimer?.Dispose();
            _retryTimer = _disposed ? null : new Timer(_ => _worker.Post(TryReconnect), null, _retryDelay, Timeout.InfiniteTimeSpan);
        }
    }

    private void TryReconnect()
    {
        if (_disposed || !_recovering) return;
        _retryAttempts++;
        bool ok;
        string problem;
        try { ok = StartCore(out problem); }
        catch (Exception ex) { ok = false; problem = ex.Message; }
        if (!ok)
        {
            Teardown();
            ClearCache();
            _retryDelay = TimeSpan.FromTicks(Math.Min(_retryDelay.Ticks * 2, _options.MaxRetry.Ticks));
            _log.Debug($"Core Audio still unavailable ({problem}); next try in {_retryDelay.TotalSeconds:0.#} s.");
            ScheduleRetry();
            return;
        }
        _recovering = false;
        int r, c, watchers;
        lock (_gate) { r = _render.Count; c = _capture.Count; watchers = _sessionWatchers; }
        _log.Info($"Core Audio is back after {Stopwatch.GetElapsedTime(_downSince).TotalSeconds:0.#} s ({_retryAttempts} attempt{(_retryAttempts == 1 ? "" : "s")}): {r} outputs, {c} inputs.");
        if (watchers > 0) StartSessions();
        Raise(new AudioChange(AudioChangeKind.Availability));
        Raise(new AudioChange(AudioChangeKind.Devices));
        Raise(new AudioChange(AudioChangeKind.Defaults));
    }

    /// <summary>Forgets every cached value (the objects they came from are gone).</summary>
    private void ClearCache()
    {
        lock (_gate)
        {
            _devices = new Dictionary<string, AudioDevice>(StringComparer.Ordinal);
            _render = [];
            _capture = [];
            for (var f = 0; f < 2; f++)
                for (var r = 0; r < 3; r++)
                    _defaults[f, r] = null;
            _sessionCache = new Dictionary<string, SessionInfo>(StringComparer.Ordinal);
            _pendingVolume.Clear();
            _pendingMute.Clear();
            _pendingAppVolume.Clear();
        }
    }

    // ================================================================ worker: devices

    /// <summary>Rescans the active endpoints; returns the first service-down HRESULT seen (0 otherwise).</summary>
    private int RefreshDevices(bool raise)
    {
        if (_enumerator is null) return HResults.CO_E_OBJNOTCONNECTED;
        // Endpoints whose objects reported DEVICE_INVALIDATED are rebuilt from scratch.
        foreach (var stale in _endpoints.Values.Where(e => e.Stale).Select(e => e.Id).ToList()) RemoveEndpoint(stale);
        var next = new Dictionary<string, AudioDevice>(StringComparer.Ordinal);
        foreach (var flow in new[] { AudioFlow.Render, AudioFlow.Capture })
        {
            var hr = _enumerator.EnumAudioEndpoints(flow == AudioFlow.Render ? EDataFlow.eRender : EDataFlow.eCapture, DeviceState.Active, out var pc);
            using var coll = Native.Own<IMMDeviceCollection>(hr, pc);
            if (HResults.IsServiceDown(hr)) return hr;
            if (coll.Value is not { } devices || devices.GetCount(out var n) != 0) continue;
            for (uint i = 0; i < n; i++)
            {
                try
                {
                    if (devices.Item(i, out var pd) != 0 || pd == 0) continue;
                    var dev = Native.Wrap<IMMDevice>(pd);
                    if (dev.GetId(out var id) != 0 || id is null)
                    {
                        Native.Release(dev);
                        continue;
                    }
                    if (_endpoints.TryGetValue(id, out var ep)) Native.Release(dev); // the endpoint keeps its own
                    else _endpoints[id] = ep = CreateEndpoint(dev, id, flow);
                    next[id] = Describe(ep);
                }
                catch (Exception ex) { _log.Warn("audio endpoint could not be read", ex); }
            }
        }
        foreach (var gone in _endpoints.Keys.Where(k => !next.ContainsKey(k)).ToList()) RemoveEndpoint(gone);
        lock (_gate)
        {
            _devices = next;
            RebuildLists();
        }
        if (_sessionsRunning) SyncSessionManagers();
        if (raise) Raise(new AudioChange(AudioChangeKind.Devices));
        return 0;
    }

    private Endpoint CreateEndpoint(IMMDevice dev, string id, AudioFlow flow)
    {
        var ep = new Endpoint(id, flow, dev);
        ep.Volume = Native.Activate<IAudioEndpointVolume>(dev, Iids.IAudioEndpointVolume);
        if (ep.Volume is not null)
        {
            ep.Callback = new EndpointVolumeCallback(this, id);
            ep.Registered = ep.Volume.RegisterControlChangeNotify(ep.Callback) == 0;
            if (ep.Volume.GetVolumeRange(out var min, out var max, out _) == 0) ep.HasVolume = max - min > 0.01f;
        }
        return ep;
    }

    private static AudioDevice Describe(Endpoint ep)
    {
        string? friendly = null, desc = null, adapter = null;
        var hr = ep.Device.OpenPropertyStore(0, out var ps);
        using (var store = Native.Own<IPropertyStore>(hr, ps))
        {
            if (store.Value is { } s)
            {
                friendly = Native.GetString(s, PKeys.Device_FriendlyName);
                desc = Native.GetString(s, PKeys.Device_DeviceDesc);
                adapter = Native.GetString(s, PKeys.DeviceInterface_FriendlyName);
            }
        }
        friendly ??= desc ?? adapter ?? "Audio device";
        var (title, subtitle) = DeviceNames.Make(friendly, desc, adapter);
        float vol = 0;
        int mute = 0;
        ep.Volume?.GetMasterVolumeLevelScalar(out vol);
        ep.Volume?.GetMute(out mute);
        return new AudioDevice(ep.Id, ep.Flow, friendly)
        {
            Title = title,
            Subtitle = subtitle,
            Volume = vol,
            Muted = mute != 0,
            HasVolume = ep.Volume is not null && ep.HasVolume,
            IsVirtual = friendly.Contains("virtual", StringComparison.OrdinalIgnoreCase),
        };
    }

    /// <summary>
    /// Drops one endpoint. Order matters (review A #10): the session callbacks registered on its session manager are
    /// unregistered first, then the endpoint's own callback, and only then are the objects released.
    /// </summary>
    private void RemoveEndpoint(string id)
    {
        CloseLoopbacks(id, HResults.AUDCLNT_E_DEVICE_INVALIDATED);
        DropSessions(id);
        if (_endpoints.Remove(id, out var ep)) ReleaseEndpoint(ep);
    }

    private void ReleaseEndpoint(Endpoint ep)
    {
        try
        {
            if (ep.Registered && ep.Volume is not null && ep.Callback is not null) ep.Volume.UnregisterControlChangeNotify(ep.Callback);
        }
        catch (Exception ex) { _log.Debug($"UnregisterControlChangeNotify: {ex.Message}"); }
        ep.Registered = false;
        Native.Release(ep.Volume);
        Native.Release(ep.Meter);
        Native.Release(ep.SessionManager);
        Native.Release(ep.Device);
        ep.Volume = null;
        ep.Meter = null;
        ep.SessionManager = null;
    }

    private void MarkStale(Endpoint ep)
    {
        if (ep.Stale) return;
        ep.Stale = true;
        ((IAudioCallbackSink)this).OnDeviceListChanged();
    }

    private void RefreshDefaults()
    {
        if (_enumerator is null) return;
        var next = new string?[2, 3];
        for (var f = 0; f < 2; f++)
            for (var r = 0; r < 3; r++)
            {
                var hr = _enumerator.GetDefaultAudioEndpoint((EDataFlow)f, (ERole)r, out var p);
                using var d = Native.Own<IMMDevice>(hr, p);
                if (d.Value is { } dev && dev.GetId(out var id) == 0) next[f, r] = id;
            }
        lock (_gate)
            for (var f = 0; f < 2; f++)
                for (var r = 0; r < 3; r++)
                    _defaults[f, r] = next[f, r];
    }

    private void ApplyDefault(EDataFlow flow, ERole role, string? id)
    {
        if (flow is not (EDataFlow.eRender or EDataFlow.eCapture) || (int)role is < 0 or > 2) return;
        lock (_gate)
        {
            // OnDefaultDeviceChanged fires even for a same-value change (windows.md §1.5): de-duplicate.
            if (_defaults[(int)flow, (int)role] == id) return;
            _defaults[(int)flow, (int)role] = id;
        }
        Raise(new AudioChange(AudioChangeKind.Defaults, id, flow == EDataFlow.eRender ? AudioFlow.Render : AudioFlow.Capture));
    }

    private void ApplyEndpoint(string id, bool muted, float volume)
    {
        lock (_gate)
        {
            if (!_devices.TryGetValue(id, out var d)) return;
            if (d.Muted == muted && Math.Abs(d.Volume - volume) < 0.0005f) return;
            ReplaceDevice(d with { Muted = muted, Volume = volume });
        }
        Raise(new AudioChange(AudioChangeKind.Endpoint, id));
    }

    private void FlushVolume(string id)
    {
        float v;
        lock (_gate)
        {
            if (!_pendingVolume.Remove(id, out v)) return; // a later flush already applied the newest value
        }
        if (_safeMode)
        {
            Suppressed($"would set a volume to {Pct(v)}%"); // the cache keeps the new value, as if it worked
            return;
        }
        if (!_endpoints.TryGetValue(id, out var ep) || ep.Volume is null) return;
        var hr = ep.Volume.SetMasterVolumeLevelScalar(v, _eventContext);
        if (hr < 0) Failed(ep, hr, "SetMasterVolumeLevelScalar");
        ReadBack(id, ep);
    }

    private void FlushMute(string id)
    {
        bool m;
        lock (_gate)
        {
            if (!_pendingMute.Remove(id, out m)) return;
        }
        if (_safeMode)
        {
            Suppressed(m ? "would mute a device" : "would unmute a device");
            return;
        }
        if (!_endpoints.TryGetValue(id, out var ep) || ep.Volume is null) return;
        var hr = ep.Volume.SetMute(m ? 1 : 0, _eventContext);
        if (hr < 0) Failed(ep, hr, "SetMute");
        ReadBack(id, ep);
    }

    /// <summary>A write failed: start recovery or a rescan when the HRESULT calls for it, then throw so the key shows an alert.</summary>
    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private void Failed(Endpoint ep, int hr, string what)
    {
        if (hr == HResults.AUDCLNT_E_DEVICE_INVALIDATED) MarkStale(ep);
        else if (!CheckHr(hr, what)) ReadBack(ep.Id, ep); // undo the optimistic cache value
        throw new COMException($"{what} failed 0x{hr:X8}", hr);
    }

    /// <summary>After our own write (whose notification we ignore), read the real value back unless a newer write is queued.</summary>
    private void ReadBack(string id, Endpoint ep)
    {
        lock (_gate)
        {
            if (_pendingVolume.ContainsKey(id) || _pendingMute.ContainsKey(id)) return;
        }
        var hr = ep.Volume!.GetMasterVolumeLevelScalar(out var vol);
        if (CheckHr(hr, "GetMasterVolumeLevelScalar")) return;
        if (hr == 0 && ep.Volume.GetMute(out var mute) == 0) ApplyEndpoint(id, mute != 0, vol);
    }

    private void ReplaceDevice(AudioDevice d)
    {
        // Caller holds _gate.
        var next = new Dictionary<string, AudioDevice>(_devices, StringComparer.Ordinal) { [d.Id] = d };
        _devices = next;
        RebuildLists();
    }

    private void RebuildLists()
    {
        // Caller holds _gate.
        static int Order(AudioDevice a, AudioDevice b)
        {
            var c = string.Compare(a.Title, b.Title, StringComparison.CurrentCultureIgnoreCase);
            return c != 0 ? c : string.Compare(a.FriendlyName, b.FriendlyName, StringComparison.CurrentCultureIgnoreCase);
        }
        var render = _devices.Values.Where(d => d.Flow == AudioFlow.Render).ToList();
        var capture = _devices.Values.Where(d => d.Flow == AudioFlow.Capture).ToList();
        render.Sort(Order);
        capture.Sort(Order);
        _render = render;
        _capture = capture;
    }

    // ================================================================ worker: sessions

    private void StartSessions()
    {
        if (_sessionsRunning || _enumerator is null || !_available) return;
        lock (_gate) { if (_sessionWatchers == 0) return; }
        _sessionsRunning = true;
        SyncSessionManagers();
    }

    private void StopSessions()
    {
        lock (_gate) { if (_sessionWatchers > 0) return; }
        if (!_sessionsRunning) return;
        _sessionsRunning = false;
        foreach (var e in _sessions.Values) ReleaseSession(e);
        _sessions.Clear();
        foreach (var m in _sessionManagers.Values) UnregisterManager(m);
        _sessionManagers.Clear();
        lock (_gate) _sessionCache = new Dictionary<string, SessionInfo>(StringComparer.Ordinal);
        Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    /// <summary>One session manager (with a session-created callback) per active output endpoint.</summary>
    private void SyncSessionManagers()
    {
        var renderIds = _endpoints.Values.Where(e => e.Flow == AudioFlow.Render).Select(e => e.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var gone in _sessionManagers.Keys.Where(k => !renderIds.Contains(k)).ToList()) DropSessions(gone);
        foreach (var id in renderIds)
        {
            if (_sessionManagers.ContainsKey(id)) continue;
            var ep = _endpoints[id];
            var mgr = ep.SessionManager ??= Native.Activate<IAudioSessionManager2>(ep.Device, Iids.IAudioSessionManager2);
            if (mgr is null) continue;
            // GetSessionEnumerator must be called before session-created notifications start (windows.md §1.5).
            var hr = mgr.GetSessionEnumerator(out var pe);
            using (Native.Own<IAudioSessionEnumerator>(hr, pe)) { }
            if (CheckHr(hr, "GetSessionEnumerator")) return;
            var cb = new SessionCreatedCallback(this, id);
            var dm = new DeviceSessions(id, mgr, cb) { Registered = mgr.RegisterSessionNotification(cb) == 0 };
            _sessionManagers[id] = dm;
            ScanSessions(id, raise: false);
        }
        PublishSessions();
    }

    /// <summary>Unregisters and releases the sessions on one output, then its session-created callback (the manager itself belongs to the endpoint).</summary>
    private void DropSessions(string deviceId)
    {
        foreach (var s in _sessions.Values.Where(s => s.DeviceId == deviceId).ToList())
        {
            ReleaseSession(s);
            _sessions.Remove(s.Key);
        }
        if (_sessionManagers.Remove(deviceId, out var dm)) UnregisterManager(dm);
    }

    private void ScanSessions(string deviceId, bool raise)
    {
        lock (_gate) _rescanQueued.Remove(deviceId);
        if (!_sessionsRunning || !_sessionManagers.TryGetValue(deviceId, out var dm)) return;
        var hr = dm.Manager.GetSessionEnumerator(out var pe);
        using var en = Native.Own<IAudioSessionEnumerator>(hr, pe);
        if (CheckHr(hr, "GetSessionEnumerator") || en.Value is not { } se || se.GetCount(out var n) != 0) return;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < n; i++)
        {
            IAudioSessionControl2? c2 = null;
            var keep = false;
            try
            {
                if (se.GetSession(i, out var ps) != 0 || ps == 0) continue;
                c2 = Native.Wrap<IAudioSessionControl2>(ps);
                if (c2.GetSessionInstanceIdentifier(out var instance) != 0 || string.IsNullOrEmpty(instance)) continue;
                var key = deviceId + "|" + instance;
                if (_sessions.TryGetValue(key, out var known))
                {
                    seen.Add(key);
                    RefreshSession(known);
                    continue;
                }
                var entry = CreateSession(key, deviceId, c2);
                if (entry is null) continue;
                keep = true;
                seen.Add(key);
                _sessions[key] = entry;
            }
            catch (Exception ex) { _log.Debug($"audio session skipped: {ex.Message}"); }
            finally
            {
                if (!keep) Native.Release(c2);
            }
        }
        foreach (var gone in _sessions.Values.Where(s => s.DeviceId == deviceId && !seen.Contains(s.Key)).ToList())
        {
            ReleaseSession(gone);
            _sessions.Remove(gone.Key);
        }
        if (raise) PublishSessions();
    }

    private SessionEntry? CreateSession(string key, string deviceId, IAudioSessionControl2 c2)
    {
        if (c2.GetState(out var state) != 0 || state == 2) return null; // expired
        var pidHr = c2.GetProcessId(out var pid);
        var isSystem = c2.IsSystemSoundsSession() == HResults.S_OK;
        string appKey, name;
        if (isSystem)
        {
            appKey = AppNames.SystemSoundsKey;
            c2.GetDisplayName(out var dn);
            var resolved = Native.ResolveIndirect(dn ?? "");
            name = string.IsNullOrWhiteSpace(resolved) || resolved.StartsWith('@') ? "System Sounds" : resolved;
        }
        else
        {
            string? path = null;
            var exists = true;
            // AUDCLNT_S_NO_SINGLE_PROCESS is a success code: the pid is then the session's first process.
            if (pidHr >= 0 && pid != 0) path = Native.ProcessImagePath(pid, out exists);
            if (!exists) return null; // the app already exited
            if (pid == s_ownPid) return null; // our own loopback capture (the spectrum) is not an app to mix
            c2.GetSessionIdentifier(out var sid);
            var idPath = AppNames.PathFromSessionIdentifier(sid);
            var keySource = path ?? idPath;
            if (keySource is null || keySource == "#") return null;
            appKey = AppNames.KeyFor(keySource);
            if (appKey == "audiodg.exe") return null; // Sonar/APO processing, not an app
            c2.GetDisplayName(out var dn);
            name = !string.IsNullOrWhiteSpace(dn) && !dn.StartsWith('@') ? dn.Trim() : DescriptionFor(path) ?? AppNames.FromKey(appKey);
        }
        var vol = c2 as ISimpleAudioVolume; // the same RCW (a QI), released with the control
        float v = 1;
        int m = 0;
        vol?.GetMasterVolume(out v);
        vol?.GetMute(out m);
        var cb = new SessionEventsCallback(this, key);
        var entry = new SessionEntry(key, deviceId, c2, vol, cb)
        {
            Pid = pid,
            Info = new SessionInfo(key, deviceId, appKey, name, isSystem, state == 1, v, m != 0),
        };
        entry.Registered = c2.RegisterAudioSessionNotification(cb) == 0;
        return entry;
    }

    private void RefreshSession(SessionEntry e)
    {
        if (e.Control.GetState(out var st) != 0) return;
        float v = e.Info.Volume;
        int m = e.Info.Muted ? 1 : 0;
        e.Volume?.GetMasterVolume(out v);
        e.Volume?.GetMute(out m);
        e.Info = e.Info with { IsActive = st == 1, Volume = v, Muted = m != 0 };
    }

    private string? DescriptionFor(string? path)
    {
        if (string.IsNullOrEmpty(path)) return null;
        if (_descriptions.TryGetValue(path, out var d)) return d.Length == 0 ? null : d;
        try { d = FileVersionInfo.GetVersionInfo(path).FileDescription?.Trim() ?? ""; }
        catch { d = ""; }
        _descriptions[path] = d;
        return d.Length == 0 ? null : d;
    }

    /// <summary>Unregisters the session's event sink, then releases the session control.</summary>
    private void ReleaseSession(SessionEntry e)
    {
        try { if (e.Registered) e.Control.UnregisterAudioSessionNotification(e.Events); }
        catch (Exception ex) { _log.Debug($"UnregisterAudioSessionNotification: {ex.Message}"); }
        e.Registered = false;
        Native.Release(e.Control);
    }

    private void UnregisterManager(DeviceSessions m)
    {
        try { if (m.Registered) m.Manager.UnregisterSessionNotification(m.Callback); }
        catch (Exception ex) { _log.Debug($"UnregisterSessionNotification: {ex.Message}"); }
        m.Registered = false;
    }

    private void PublishSessions()
    {
        var next = _sessions.Values.ToDictionary(s => s.Key, s => s.Info, StringComparer.Ordinal);
        lock (_gate)
        {
            if (next.Count == _sessionCache.Count && next.All(kv => _sessionCache.TryGetValue(kv.Key, out var old) && old == kv.Value)) return;
            _sessionCache = next;
        }
        Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    private IEnumerable<SessionEntry> MatchingSessions(string appKey, string? deviceId) =>
        _sessions.Values.Where(s => s.Info.AppKey == appKey && (deviceId is null || s.DeviceId == deviceId)).ToList();

    private bool UpdateSessions(string appKey, string? deviceId, Func<SessionInfo, SessionInfo> update)
    {
        lock (_gate)
        {
            var changed = false;
            var next = new Dictionary<string, SessionInfo>(_sessionCache, StringComparer.Ordinal);
            foreach (var (k, s) in _sessionCache)
            {
                if (s.AppKey != appKey || (deviceId is not null && s.DeviceId != deviceId)) continue;
                var u = update(s);
                if (u == s) continue;
                next[k] = u;
                changed = true;
            }
            if (changed) _sessionCache = next;
            return changed;
        }
    }

    // ================================================================ worker: metering

    private void QueueSample()
    {
        if (Interlocked.Exchange(ref _sampleQueued, 1) == 1) return;
        if (!_worker.Post(Sample)) Volatile.Write(ref _sampleQueued, 0);
    }

    private unsafe void Sample()
    {
        Volatile.Write(ref _sampleQueued, 0);
        MeterLease[] leases;
        lock (_gate) leases = [.. _meterLeases];
        if (leases.Length == 0) return;
        Span<float> buf = stackalloc float[8];
        foreach (var group in leases.GroupBy(l => l.DeviceId))
        {
            if (!_endpoints.TryGetValue(group.Key, out var ep))
            {
                foreach (var lease in group) lease.Feed(0, []);
                continue;
            }
            if (ep.Meter is null && !ep.MeterFailed)
            {
                ep.Meter = Native.Activate<IAudioMeterInformation>(ep.Device, Iids.IAudioMeterInformation);
                ep.MeterFailed = ep.Meter is null;
                if (ep.Meter is not null && ep.Meter.GetMeteringChannelCount(out var ch) == 0) ep.MeterChannels = Math.Min(ch, 8u);
            }
            if (ep.Meter is null) continue;
            var hr = ep.Meter.GetPeakValue(out var peak);
            if (hr != 0)
            {
                if (hr == HResults.AUDCLNT_E_DEVICE_INVALIDATED) MarkStale(ep);
                else if (CheckHr(hr, "IAudioMeterInformation::GetPeakValue")) return;
                continue;
            }
            float[] channels = [];
            if (ep.MeterChannels > 0)
            {
                fixed (float* p = buf)
                    if (ep.Meter.GetChannelsPeakValues(ep.MeterChannels, p) == 0) channels = buf[..(int)ep.MeterChannels].ToArray();
            }
            foreach (var lease in group) lease.Feed(peak, channels);
        }
    }

    // ================================================================ callbacks (RPC threads → worker)

    void IAudioCallbackSink.OnDeviceListChanged()
    {
        if (Interlocked.Exchange(ref _refreshQueued, 1) == 1) return;
        // Debounce bursts (a USB device brings several endpoints at once).
        _ = Task.Delay(150).ContinueWith(_ => _worker.Post(() =>
        {
            Volatile.Write(ref _refreshQueued, 0);
            if (_recovering || _enumerator is null) return;
            if (CheckHr(RefreshDevices(raise: true), "EnumAudioEndpoints")) return;
            RefreshDefaults();
            Raise(new AudioChange(AudioChangeKind.Defaults));
        }), TaskScheduler.Default);
    }

    void IAudioCallbackSink.OnDefaultChanged(EDataFlow flow, ERole role, string? deviceId)
    {
        Interlocked.Increment(ref _defaultNotifications);
        _worker.Post(() => { if (!_recovering) ApplyDefault(flow, role, deviceId); });
    }

    void IAudioCallbackSink.OnDevicePropertyChanged(string deviceId, PROPERTYKEY key) => ((IAudioCallbackSink)this).OnDeviceListChanged();

    void IAudioCallbackSink.OnEndpointNotify(string deviceId, Guid context, bool muted, float volume)
    {
        Interlocked.Increment(ref _endpointNotifications);
        if (context == _eventContext) return; // our own write; the cache already has it and ReadBack confirms it
        _worker.Post(() => ApplyEndpoint(deviceId, muted, volume));
    }

    void IAudioCallbackSink.OnSessionCreated(string deviceId)
    {
        lock (_gate) { if (!_rescanQueued.Add(deviceId)) return; }
        _ = Task.Delay(60).ContinueWith(_ => _worker.Post(() => ScanSessions(deviceId, raise: true)), TaskScheduler.Default);
    }

    void IAudioCallbackSink.OnSessionVolume(string sessionKey, float volume, bool muted, Guid context)
    {
        Interlocked.Increment(ref _sessionNotifications);
        if (context == _eventContext) return;
        _worker.Post(() =>
        {
            if (!_sessions.TryGetValue(sessionKey, out var e)) return;
            if (Math.Abs(e.Info.Volume - volume) < 0.0005f && e.Info.Muted == muted) return;
            e.Info = e.Info with { Volume = volume, Muted = muted };
            PublishSessions();
        });
    }

    void IAudioCallbackSink.OnSessionState(string sessionKey, int state) => _worker.Post(() =>
    {
        if (!_sessions.TryGetValue(sessionKey, out var e)) return;
        if (state == 2)
        {
            ReleaseSession(e);
            _sessions.Remove(sessionKey);
        }
        else if (e.Info.IsActive == (state == 1)) return;
        else e.Info = e.Info with { IsActive = state == 1 };
        PublishSessions();
    });

    void IAudioCallbackSink.OnSessionDisconnected(string sessionKey, int reason)
    {
        // DisconnectReasonServerShutdown: the audio service stopped, so every object we hold is dead.
        if (reason == 1) RequestRecovery("a session reported that the audio service shut down", HResults.AUDCLNT_E_SERVICE_NOT_RUNNING);
        else ((IAudioCallbackSink)this).OnSessionState(sessionKey, 2);
    }

    void IAudioCallbackSink.OnSessionNameChanged(string sessionKey) => _worker.Post(() =>
    {
        if (!_sessions.TryGetValue(sessionKey, out var e) || e.Info.IsSystemSounds) return;
        if (e.Control.GetDisplayName(out var dn) == 0 && !string.IsNullOrWhiteSpace(dn) && !dn.StartsWith('@') && dn != e.Info.Name)
        {
            e.Info = e.Info with { Name = dn.Trim() };
            PublishSessions();
        }
    });

    // ================================================================ events and shutdown

    private void Raise(AudioChange change)
    {
        var handlers = Changed;
        if (handlers is null) return;
        foreach (var h in handlers.GetInvocationList().Cast<Action<AudioChange>>())
        {
            try { h(change); }
            catch (Exception ex) { _log.Warn("audio change handler failed", ex); }
        }
    }

    private static IEnumerable<ERole> RolesOf(DefaultRoles roles)
    {
        if (roles.HasFlag(DefaultRoles.Console)) yield return ERole.eConsole;
        if (roles.HasFlag(DefaultRoles.Multimedia)) yield return ERole.eMultimedia;
        if (roles.HasFlag(DefaultRoles.Communications)) yield return ERole.eCommunications;
    }

    public async ValueTask DisposeAsync()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            _meterTimer?.Dispose();
            _sessionStopTimer?.Dispose();
            _probeTimer?.Dispose();
            _retryTimer?.Dispose();
            _meterLeases.Clear();
            _sessionWatchers = 0;
        }
        StopFrameDrivers();
        try { await _worker.InvokeAsync(Teardown).WaitAsync(TimeSpan.FromSeconds(1.5)).ConfigureAwait(false); }
        catch (Exception ex) { _log.Debug($"audio teardown: {ex.Message}"); }
        _worker.Stop(TimeSpan.FromSeconds(1));
        _available = false;
    }

    /// <summary>Unregisters every callback, then releases every COM object (sessions, endpoints, the enumerator, the policy client).</summary>
    private void Teardown()
    {
        CloseLoopbacks(null, HResults.CO_E_OBJNOTCONNECTED);
        foreach (var e in _sessions.Values) ReleaseSession(e);
        _sessions.Clear();
        foreach (var m in _sessionManagers.Values) UnregisterManager(m);
        _sessionManagers.Clear();
        _sessionsRunning = false;
        foreach (var ep in _endpoints.Values) ReleaseEndpoint(ep);
        _endpoints.Clear();
        if (_enumerator is not null && _notifications is not null && _notificationsRegistered)
        {
            try { _enumerator.UnregisterEndpointNotificationCallback(_notifications); }
            catch (Exception ex) { _log.Debug($"UnregisterEndpointNotificationCallback: {ex.Message}"); }
        }
        _notificationsRegistered = false;
        _notifications = null;
        Native.Release(_enumerator);
        _enumerator = null;
        _policy?.Dispose();
        _policy = null;
        _canSetDefault = false;
    }

    // ================================================================ types

    private sealed class Endpoint(string id, AudioFlow flow, IMMDevice device)
    {
        public string Id { get; } = id;
        public AudioFlow Flow { get; } = flow;
        /// <summary>Owned by the endpoint (released in <see cref="ReleaseEndpoint"/>).</summary>
        public IMMDevice Device { get; } = device;
        public IAudioEndpointVolume? Volume { get; set; }
        public EndpointVolumeCallback? Callback { get; set; }
        public bool Registered { get; set; }
        public bool HasVolume { get; set; } = true;
        public IAudioMeterInformation? Meter { get; set; }
        public bool MeterFailed { get; set; }
        public uint MeterChannels { get; set; }
        public IAudioSessionManager2? SessionManager { get; set; }
        /// <summary>An object of this endpoint said AUDCLNT_E_DEVICE_INVALIDATED: rebuild it on the next scan.</summary>
        public bool Stale { get; set; }
    }

    private sealed class DeviceSessions(string deviceId, IAudioSessionManager2 manager, SessionCreatedCallback callback)
    {
        public string DeviceId { get; } = deviceId;
        public IAudioSessionManager2 Manager { get; } = manager;
        public SessionCreatedCallback Callback { get; } = callback;
        public bool Registered { get; set; }
    }

    private sealed class SessionEntry(string key, string deviceId, IAudioSessionControl2 control, ISimpleAudioVolume? volume, SessionEventsCallback events)
    {
        public string Key { get; } = key;
        public string DeviceId { get; } = deviceId;
        public IAudioSessionControl2 Control { get; } = control;
        public ISimpleAudioVolume? Volume { get; } = volume;
        public SessionEventsCallback Events { get; } = events;
        public bool Registered { get; set; }
        public uint Pid { get; init; }
        public required SessionInfo Info { get; set; }
    }

    private sealed class MeterLease(AudioEngine engine, string deviceId) : IAudioMeter
    {
        private readonly object _gate = new();
        private float _max;
        private float[] _channels = [];
        private bool _fresh, _disposed;
        private MeterReading _last = MeterReading.Silent;

        public string DeviceId { get; } = deviceId;

        internal void Feed(float peak, float[] channels)
        {
            lock (_gate)
            {
                _max = Math.Max(_max, peak);
                if (_channels.Length != channels.Length) _channels = new float[channels.Length];
                for (var i = 0; i < channels.Length; i++) _channels[i] = Math.Max(_channels[i], channels[i]);
                _fresh = true;
            }
        }

        public MeterReading Take()
        {
            lock (_gate)
            {
                if (!_fresh) return _last;
                _last = new MeterReading(_max, [.. _channels]);
                _max = 0;
                Array.Clear(_channels);
                _fresh = false;
                return _last;
            }
        }

        public void Dispose()
        {
            lock (_gate)
            {
                if (_disposed) return;
                _disposed = true;
            }
            engine.CloseMeter(this);
        }
    }
}

/// <summary>One session as cached by the engine.</summary>
internal sealed record SessionInfo(string Key, string DeviceId, string AppKey, string Name, bool IsSystemSounds, bool IsActive, float Volume, bool Muted);

/// <summary>Groups sessions into mixer apps (pure, shared by the engine and its tests).</summary>
internal static class SessionGrouping
{
    public static IReadOnlyList<AudioApp> Group(IEnumerable<SessionInfo> sessions, string? deviceId, string? defaultRender)
    {
        var apps = new List<AudioApp>();
        foreach (var g in sessions.Where(s => deviceId is null || s.DeviceId == deviceId).GroupBy(s => s.AppKey))
        {
            var primary = g.OrderByDescending(s => s.IsActive).ThenByDescending(s => s.DeviceId == defaultRender).ThenBy(s => s.Key, StringComparer.Ordinal).First();
            var name = g.Select(s => s.Name).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? AppNames.FromKey(g.Key);
            apps.Add(new AudioApp(g.Key, name)
            {
                Volume = primary.Volume,
                Muted = primary.Muted,
                IsActive = g.Any(s => s.IsActive),
                IsSystemSounds = primary.IsSystemSounds,
                DeviceIds = g.Select(s => s.DeviceId).Distinct().ToList(),
                SessionCount = g.Count(),
            });
        }
        // Stable order for browsing with a dial: by name, System Sounds last.
        return apps.OrderBy(a => a.IsSystemSounds).ThenBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).ThenBy(a => a.Key, StringComparer.Ordinal).ToList();
    }
}

internal sealed class Lease(Action release) : IDisposable
{
    private Action? _release = release;
    public void Dispose() => Interlocked.Exchange(ref _release, null)?.Invoke();
}
