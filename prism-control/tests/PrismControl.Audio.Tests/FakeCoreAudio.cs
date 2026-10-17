using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;
using PrismControl.Audio.Interop;

namespace PrismControl.Audio.Tests;

/// <summary>
/// A fake Windows audio service for the real <see cref="AudioEngine"/>: managed COM objects ([GeneratedComClass]) behind
/// real COM wrappers, so the engine's RCWs, callbacks, reference counts and HRESULT handling run for real while nothing
/// on this PC is read or written. <see cref="Stop"/> and <see cref="Restart"/> simulate the audio service going away:
/// every object handed out before a restart keeps answering AUDCLNT_E_SERVICE_NOT_RUNNING, like the real ones.
/// </summary>
internal sealed class FakeAudioService
{
    public static readonly StrategyBasedComWrappers Com = new();
    private static readonly Guid IidCollection = new("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E");
    private static readonly Guid IidDevice = new("D666063F-1587-4E43-81F1-B948E807363F");
    private static readonly Guid IidPropertyStore = new("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    private static readonly Guid IidSessionEnumerator = new("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8");
    private static readonly Guid IidSessionControl = new("F4B1A599-7266-4319-A8CA-E70ACB11E8CD");

    public const int E_NOTIMPL = unchecked((int)0x80004001);
    public const int E_NOINTERFACE = unchecked((int)0x80004002);
    public const int Down = HResults.AUDCLNT_E_SERVICE_NOT_RUNNING;

    private readonly object _gate = new();
    private readonly List<FakeEndpoint> _endpoints = [];
    private readonly Dictionary<(EDataFlow, ERole), string> _defaults = new();
    private readonly List<object> _handedOut = [];
    private readonly List<long> _attempts = [];
    private volatile bool _down;
    private int _generation, _setters, _failNextCreates;

    public FakeEnumerator? Enumerator { get; private set; }
    public int EnumeratorsCreated { get; private set; }
    public List<FakePolicy> Policies { get; } = [];

    /// <summary>Every Set* call that reached a fake object (volume, mute, app volume and mute, default device). Safe mode keeps it at 0.</summary>
    public int Setters => Volatile.Read(ref _setters);
    public int Generation => Volatile.Read(ref _generation);

    /// <summary>When each connection attempt (CreateEnumerator) happened, in Stopwatch ticks.</summary>
    public IReadOnlyList<long> Attempts { get { lock (_gate) return [.. _attempts]; } }

    public static FakeAudioService Standard()
    {
        var s = new FakeAudioService();
        s.Add(new FakeEndpoint("{fake}.speakers", EDataFlow.eRender, "Speakers (Example USB Audio)", "Speakers", "Example USB Audio") { Volume = 0.42f });
        s.Add(new FakeEndpoint("{fake}.headset", EDataFlow.eRender, "Headphones (Example Headset)", "Headphones", "Example Headset") { Volume = 0.8f });
        s.Add(new FakeEndpoint("{fake}.mic", EDataFlow.eCapture, "Microphone (Example USB Audio)", "Microphone", "Example USB Audio") { Volume = 0.7f });
        foreach (var r in new[] { ERole.eConsole, ERole.eMultimedia, ERole.eCommunications })
        {
            s._defaults[(EDataFlow.eRender, r)] = "{fake}.speakers";
            s._defaults[(EDataFlow.eCapture, r)] = "{fake}.mic";
        }
        s.Find("{fake}.speakers")!.Sessions.Add(new FakeSessionModel("music.exe", "Example Music", 0.5f, active: true));
        s.Find("{fake}.speakers")!.Sessions.Add(new FakeSessionModel("chat.exe", "Example Chat", 1f));
        s.Find("{fake}.headset")!.Sessions.Add(new FakeSessionModel("chat.exe", "Example Chat", 0.3f));
        return s;
    }

    /// <summary>Engine options wired to this service, with short timers.</summary>
    public AudioEngineOptions Options(bool safeMode = false, int probeMs = 40, int firstRetryMs = 30, int maxRetryMs = 200) => new()
    {
        EventContext = Guid.NewGuid(),
        SafeMode = safeMode,
        CreateEnumerator = CreateEnumerator,
        CreatePolicy = CreatePolicy,
        ProbeInterval = TimeSpan.FromMilliseconds(probeMs),
        FirstRetry = TimeSpan.FromMilliseconds(firstRetryMs),
        MaxRetry = TimeSpan.FromMilliseconds(maxRetryMs),
    };

    public void Add(FakeEndpoint ep)
    {
        lock (_gate) _endpoints.Add(ep);
    }

    public FakeEndpoint? Find(string id)
    {
        lock (_gate) return _endpoints.FirstOrDefault(e => e.Id == id);
    }

    public List<FakeEndpoint> Active(EDataFlow flow)
    {
        lock (_gate) return _endpoints.Where(e => e.Flow == flow).ToList();
    }

    public string? DefaultOf(EDataFlow flow, ERole role)
    {
        lock (_gate) return _defaults.GetValueOrDefault((flow, role));
    }

    public void SetDefault(EDataFlow flow, ERole role, string id)
    {
        lock (_gate) _defaults[(flow, role)] = id;
    }

    public bool IsDead(int generation) => _down || generation != Volatile.Read(ref _generation);

    /// <summary>The audio service stops: every call fails, new connections fail.</summary>
    public void Stop() => _down = true;

    /// <summary>The audio service is back: new connections work; objects from before stay dead.</summary>
    public void Restart()
    {
        Interlocked.Increment(ref _generation);
        _down = false;
    }

    /// <summary>The next <paramref name="n"/> connection attempts fail (an audio service that is still starting).</summary>
    public void FailNextConnects(int n) => Volatile.Write(ref _failNextCreates, n);

    public void CountSetter() => Interlocked.Increment(ref _setters);

    private (int Hr, nint Enumerator) CreateEnumerator()
    {
        lock (_gate) _attempts.Add(System.Diagnostics.Stopwatch.GetTimestamp());
        if (_down) return (Down, 0);
        if (Interlocked.Decrement(ref _failNextCreates) >= 0) return (unchecked((int)0x80040154), 0); // REGDB_E_CLASSNOTREG
        var e = new FakeEnumerator(this, Generation);
        Enumerator = e;
        EnumeratorsCreated++;
        return (0, Out(e, Iids.IMMDeviceEnumerator));
    }

    private (IDefaultEndpointSetter? Setter, int Hr) CreatePolicy()
    {
        var p = new FakePolicy(this, Generation);
        lock (_gate) Policies.Add(p);
        return (p, 0);
    }

    /// <summary>An owned interface pointer for <paramref name="o"/> (what a COM method returns through an out parameter).</summary>
    public nint Out(object o, Guid iid)
    {
        lock (_gate) if (!_handedOut.Contains(o)) _handedOut.Add(o);
        var unk = Com.GetOrCreateComInterfaceForObject(o, CreateComInterfaceFlags.None);
        try
        {
            var hr = Marshal.QueryInterface(unk, in iid, out var p);
            if (hr != 0) throw new InvalidOperationException($"{o.GetType().Name} does not implement {iid} (0x{hr:X8})");
            return p;
        }
        finally { Marshal.Release(unk); }
    }

    public nint OutDevice(FakeEndpoint ep, int generation) => Out(ep.ObjectsFor(this, generation).Device, IidDevice);
    public nint OutCollection(List<FakeEndpoint> list, int generation) => Out(new FakeCollection(this, generation, list), IidCollection);
    public nint OutStore(FakeEndpoint ep) => Out(new FakePropertyStore(ep), IidPropertyStore);
    public nint OutSessionEnumerator(List<FakeSession> sessions) => Out(new FakeSessionEnumerator(this, sessions), IidSessionEnumerator);
    public nint OutSession(FakeSession s) => Out(s, IidSessionControl);

    /// <summary>References other code holds on <paramref name="o"/>'s COM wrapper (0 once the engine let go).</summary>
    public static int Refs(object o)
    {
        var unk = Com.GetOrCreateComInterfaceForObject(o, CreateComInterfaceFlags.None);
        return Marshal.Release(unk);
    }

    /// <summary>The objects handed to the engine that it still holds references on.</summary>
    public List<(object Object, int Refs)> Outstanding()
    {
        object[] all;
        lock (_gate) all = [.. _handedOut];
        return all.Select(o => (o, Refs(o))).Where(x => x.Item2 > 0).ToList();
    }

    // ---------------------------------------------------------------- things that happen outside the plugin

    /// <summary>A device is unplugged: it leaves the list and the registered clients hear about it.</summary>
    public void Unplug(string id)
    {
        lock (_gate) _endpoints.RemoveAll(e => e.Id == id);
        foreach (var c in Enumerator?.ClientsSnapshot() ?? []) c.OnDeviceRemoved(0);
    }

    /// <summary>Every live session reports DisconnectReasonServerShutdown (the service is stopping).</summary>
    public void SessionsReportShutdown()
    {
        foreach (var ep in Active(EDataFlow.eRender))
            foreach (var s in ep.LiveSessions())
                foreach (var cb in s.EventsSnapshot())
                    cb.OnSessionDisconnected(1);
    }

    public void NotifyDefault(EDataFlow flow, ERole role, string id)
    {
        var p = Marshal.StringToHGlobalUni(id);
        try
        {
            foreach (var c in Enumerator?.ClientsSnapshot() ?? []) c.OnDefaultDeviceChanged(flow, role, p);
        }
        finally { Marshal.FreeHGlobal(p); }
    }
}

/// <summary>One endpoint's state (shared by every generation of COM objects that represent it).</summary>
internal sealed class FakeEndpoint(string id, EDataFlow flow, string friendly, string description, string adapter)
{
    private readonly Dictionary<int, FakeEndpointObjects> _objects = [];

    public string Id { get; } = id;
    public EDataFlow Flow { get; } = flow;
    public string FriendlyName { get; } = friendly;
    public string Description { get; } = description;
    public string Adapter { get; } = adapter;
    public float Volume { get; set; }
    public bool Muted { get; set; }
    public float Peak { get; set; }
    public List<FakeSessionModel> Sessions { get; } = [];

    /// <summary>The COM objects of one service generation (the engine asks for them again after a restart).</summary>
    public FakeEndpointObjects ObjectsFor(FakeAudioService svc, int generation)
    {
        lock (_objects)
        {
            if (!_objects.TryGetValue(generation, out var o)) _objects[generation] = o = new FakeEndpointObjects(svc, this, generation);
            return o;
        }
    }

    public IEnumerable<FakeEndpointObjects> AllObjects()
    {
        lock (_objects) return [.. _objects.Values];
    }

    public IEnumerable<FakeSession> LiveSessions() => AllObjects().SelectMany(o => o.SessionObjects());
}

internal sealed class FakeEndpointObjects
{
    private readonly FakeAudioService _svc;
    private readonly Dictionary<FakeSessionModel, FakeSession> _sessions = [];

    public FakeEndpointObjects(FakeAudioService svc, FakeEndpoint ep, int generation)
    {
        _svc = svc;
        Endpoint = ep;
        Generation = generation;
        Device = new FakeDevice(svc, ep, generation);
        Volume = new FakeEndpointVolume(svc, ep, generation);
        Meter = new FakeMeter(svc, ep, generation);
        SessionManager = new FakeSessionManager(svc, ep, generation, this);
    }

    public FakeEndpoint Endpoint { get; }
    public int Generation { get; }
    public FakeDevice Device { get; }
    public FakeEndpointVolume Volume { get; }
    public FakeMeter Meter { get; }
    public FakeSessionManager SessionManager { get; }

    public FakeSession SessionFor(FakeSessionModel m)
    {
        lock (_sessions)
        {
            if (!_sessions.TryGetValue(m, out var s)) _sessions[m] = s = new FakeSession(_svc, Endpoint, m, Generation);
            return s;
        }
    }

    public IEnumerable<FakeSession> SessionObjects()
    {
        lock (_sessions) return [.. _sessions.Values];
    }

    /// <summary>Every object of this generation that the engine may hold.</summary>
    public IEnumerable<object> All() => new object[] { Device, Volume, Meter, SessionManager }.Concat(SessionObjects());
}

internal sealed class FakeSessionModel(string app, string name, float volume, bool active = false)
{
    private static int s_next;
    public string App { get; } = app;
    public string Name { get; } = name;
    public float Volume { get; set; } = volume;
    public bool Muted { get; set; }
    public bool Active { get; set; } = active;
    public int Instance { get; } = Interlocked.Increment(ref s_next);
}

[GeneratedComClass]
internal sealed partial class FakeEnumerator(FakeAudioService svc, int generation) : IMMDeviceEnumerator
{
    private readonly List<IMMNotificationClient> _clients = [];
    public int Registered, Unregistered;

    public IMMNotificationClient[] ClientsSnapshot()
    {
        lock (_clients) return [.. _clients];
    }

    public int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out nint ppDevices)
    {
        ppDevices = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        ppDevices = svc.OutCollection(svc.Active(dataFlow), generation);
        return 0;
    }

    public int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out nint ppEndpoint)
    {
        ppEndpoint = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        if (svc.DefaultOf(dataFlow, role) is not { } id || svc.Find(id) is not { } ep) return HResults.E_NOTFOUND;
        ppEndpoint = svc.OutDevice(ep, generation);
        return 0;
    }

    public int GetDevice(string pwstrId, out nint ppDevice)
    {
        ppDevice = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        if (svc.Find(pwstrId) is not { } ep) return HResults.E_NOTFOUND;
        ppDevice = svc.OutDevice(ep, generation);
        return 0;
    }

    public int RegisterEndpointNotificationCallback(IMMNotificationClient pClient)
    {
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        lock (_clients) _clients.Add(pClient);
        Interlocked.Increment(ref Registered);
        return 0;
    }

    public int UnregisterEndpointNotificationCallback(IMMNotificationClient pClient)
    {
        lock (_clients) _clients.Remove(pClient);
        Interlocked.Increment(ref Unregistered);
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakeCollection(FakeAudioService svc, int generation, List<FakeEndpoint> endpoints) : IMMDeviceCollection
{
    public int GetCount(out uint count)
    {
        count = (uint)endpoints.Count;
        return svc.IsDead(generation) ? FakeAudioService.Down : 0;
    }

    public int Item(uint nDevice, out nint device)
    {
        device = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        if (nDevice >= endpoints.Count) return unchecked((int)0x80070057);
        device = svc.OutDevice(endpoints[(int)nDevice], generation);
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakeDevice(FakeAudioService svc, FakeEndpoint ep, int generation) : IMMDevice
{
    public int Activate(in Guid iid, uint dwClsCtx, nint pActivationParams, out nint ppInterface)
    {
        ppInterface = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        var objects = ep.ObjectsFor(svc, generation);
        object? o = iid == Iids.IAudioEndpointVolume ? objects.Volume
            : iid == Iids.IAudioMeterInformation ? objects.Meter
            : iid == Iids.IAudioSessionManager2 ? objects.SessionManager
            : null;
        if (o is null) return FakeAudioService.E_NOINTERFACE;
        ppInterface = svc.Out(o, iid);
        return 0;
    }

    public int OpenPropertyStore(uint stgmAccess, out nint store)
    {
        store = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        store = svc.OutStore(ep);
        return 0;
    }

    public int GetId(out string? id)
    {
        id = ep.Id;
        return 0;
    }

    public int GetState(out uint state)
    {
        state = DeviceState.Active;
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakePropertyStore(FakeEndpoint ep) : IPropertyStore
{
    public int GetCount(out uint count)
    {
        count = 3;
        return 0;
    }

    public int GetAt(uint iProp, out PROPERTYKEY key)
    {
        key = default;
        return FakeAudioService.E_NOTIMPL;
    }

    public int GetValue(in PROPERTYKEY key, out PROPVARIANT pv)
    {
        pv = default;
        var text = key.Is(PKeys.Device_FriendlyName) ? ep.FriendlyName
            : key.Is(PKeys.Device_DeviceDesc) ? ep.Description
            : key.Is(PKeys.DeviceInterface_FriendlyName) ? ep.Adapter
            : null;
        if (text is null) return 0; // VT_EMPTY
        pv.vt = 31;
        pv.p = Marshal.StringToCoTaskMemUni(text); // freed by the caller's PropVariantClear
        return 0;
    }

    public int SetValue(in PROPERTYKEY key, in PROPVARIANT propvar) => FakeAudioService.E_NOTIMPL;
    public int Commit() => FakeAudioService.E_NOTIMPL;
}

[GeneratedComClass]
internal sealed partial class FakeEndpointVolume(FakeAudioService svc, FakeEndpoint ep, int generation) : IAudioEndpointVolume
{
    private readonly List<IAudioEndpointVolumeCallback> _callbacks = [];
    public int Registered, Unregistered, Reads;

    public int Callbacks
    {
        get { lock (_callbacks) return _callbacks.Count; }
    }

    private int Dead => svc.IsDead(generation) ? FakeAudioService.Down : 0;

    public int RegisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify)
    {
        if (Dead != 0) return Dead;
        lock (_callbacks) _callbacks.Add(pNotify);
        Interlocked.Increment(ref Registered);
        return 0;
    }

    public int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify)
    {
        lock (_callbacks) _callbacks.Remove(pNotify);
        Interlocked.Increment(ref Unregistered);
        return 0;
    }

    public int GetChannelCount(out uint pnChannelCount)
    {
        pnChannelCount = 2;
        return Dead;
    }

    public int SetMasterVolumeLevel(float fLevelDB, in Guid pguidEventContext) => FakeAudioService.E_NOTIMPL;

    public int SetMasterVolumeLevelScalar(float fLevel, in Guid pguidEventContext)
    {
        if (Dead != 0) return Dead;
        svc.CountSetter();
        ep.Volume = fLevel;
        return 0;
    }

    public int GetMasterVolumeLevel(out float pfLevelDB)
    {
        pfLevelDB = 0;
        return FakeAudioService.E_NOTIMPL;
    }

    public int GetMasterVolumeLevelScalar(out float pfLevel)
    {
        pfLevel = ep.Volume;
        Interlocked.Increment(ref Reads);
        return Dead;
    }

    public int SetChannelVolumeLevel(uint nChannel, float fLevelDB, in Guid pguidEventContext) => FakeAudioService.E_NOTIMPL;
    public int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, in Guid pguidEventContext) => FakeAudioService.E_NOTIMPL;

    public int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB)
    {
        pfLevelDB = 0;
        return FakeAudioService.E_NOTIMPL;
    }

    public int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel)
    {
        pfLevel = 0;
        return FakeAudioService.E_NOTIMPL;
    }

    public int SetMute(int bMute, in Guid pguidEventContext)
    {
        if (Dead != 0) return Dead;
        svc.CountSetter();
        ep.Muted = bMute != 0;
        return 0;
    }

    public int GetMute(out int pbMute)
    {
        pbMute = ep.Muted ? 1 : 0;
        Interlocked.Increment(ref Reads);
        return Dead;
    }

    public int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount)
    {
        pnStep = pnStepCount = 0;
        return FakeAudioService.E_NOTIMPL;
    }

    public int VolumeStepUp(in Guid pguidEventContext) => FakeAudioService.E_NOTIMPL;
    public int VolumeStepDown(in Guid pguidEventContext) => FakeAudioService.E_NOTIMPL;

    public int QueryHardwareSupport(out uint pdwHardwareSupportMask)
    {
        pdwHardwareSupportMask = 0;
        return 0;
    }

    public int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB)
    {
        pflVolumeMindB = -65.25f;
        pflVolumeMaxdB = 0;
        pflVolumeIncrementdB = 0.75f;
        return Dead;
    }
}

[GeneratedComClass]
internal sealed unsafe partial class FakeMeter(FakeAudioService svc, FakeEndpoint ep, int generation) : IAudioMeterInformation
{
    public int GetPeakValue(out float pfPeak)
    {
        pfPeak = ep.Peak;
        return svc.IsDead(generation) ? FakeAudioService.Down : 0;
    }

    public int GetMeteringChannelCount(out uint pnChannelCount)
    {
        pnChannelCount = 2;
        return 0;
    }

    public int GetChannelsPeakValues(uint u32ChannelCount, float* afPeakValues)
    {
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        for (var i = 0; i < u32ChannelCount; i++) afPeakValues[i] = ep.Peak;
        return 0;
    }

    public int QueryHardwareSupport(out uint pdwHardwareSupportMask)
    {
        pdwHardwareSupportMask = 0;
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakeSessionManager(FakeAudioService svc, FakeEndpoint ep, int generation, FakeEndpointObjects objects) : IAudioSessionManager2
{
    private readonly List<IAudioSessionNotification> _notifications = [];
    public int Registered, Unregistered;

    public int Notifications
    {
        get { lock (_notifications) return _notifications.Count; }
    }

    public int GetAudioSessionControl(nint audioSessionGuid, uint streamFlags, out IAudioSessionControl? sessionControl)
    {
        sessionControl = null;
        return FakeAudioService.E_NOTIMPL;
    }

    public int GetSimpleAudioVolume(nint audioSessionGuid, uint crossProcessSession, out ISimpleAudioVolume? audioVolume)
    {
        audioVolume = null;
        return FakeAudioService.E_NOTIMPL;
    }

    public int GetSessionEnumerator(out nint sessionEnum)
    {
        sessionEnum = 0;
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        List<FakeSessionModel> models;
        lock (ep.Sessions) models = [.. ep.Sessions];
        sessionEnum = svc.OutSessionEnumerator(models.Select(objects.SessionFor).ToList());
        return 0;
    }

    public int RegisterSessionNotification(IAudioSessionNotification sessionNotification)
    {
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        lock (_notifications) _notifications.Add(sessionNotification);
        Interlocked.Increment(ref Registered);
        return 0;
    }

    public int UnregisterSessionNotification(IAudioSessionNotification sessionNotification)
    {
        lock (_notifications) _notifications.Remove(sessionNotification);
        Interlocked.Increment(ref Unregistered);
        return 0;
    }

    public int RegisterDuckNotification(string sessionId, nint duckNotification) => FakeAudioService.E_NOTIMPL;
    public int UnregisterDuckNotification(nint duckNotification) => FakeAudioService.E_NOTIMPL;
}

[GeneratedComClass]
internal sealed partial class FakeSessionEnumerator(FakeAudioService svc, List<FakeSession> sessions) : IAudioSessionEnumerator
{
    public int GetCount(out int sessionCount)
    {
        sessionCount = sessions.Count;
        return 0;
    }

    public int GetSession(int sessionIndex, out nint session)
    {
        session = 0;
        if (sessionIndex < 0 || sessionIndex >= sessions.Count) return unchecked((int)0x80070057);
        session = svc.OutSession(sessions[sessionIndex]);
        return 0;
    }
}

[GeneratedComClass]
internal sealed partial class FakeSession(FakeAudioService svc, FakeEndpoint ep, FakeSessionModel model, int generation) : IAudioSessionControl2, ISimpleAudioVolume
{
    private readonly List<IAudioSessionEvents> _events = [];
    public int Registered, Unregistered;

    public FakeSessionModel Model => model;

    public IAudioSessionEvents[] EventsSnapshot()
    {
        lock (_events) return [.. _events];
    }

    private int Dead => svc.IsDead(generation) ? FakeAudioService.Down : 0;

    public int GetState(out int state)
    {
        state = model.Active ? 1 : 0;
        return Dead;
    }

    public int GetDisplayName(out string? name)
    {
        name = model.Name;
        return Dead;
    }

    public int SetDisplayName(string value, in Guid eventContext) => FakeAudioService.E_NOTIMPL;

    public int GetIconPath(out string? path)
    {
        path = null;
        return FakeAudioService.E_NOTIMPL;
    }

    public int SetIconPath(string value, in Guid eventContext) => FakeAudioService.E_NOTIMPL;

    public int GetGroupingParam(out Guid groupingParam)
    {
        groupingParam = Guid.Empty;
        return FakeAudioService.E_NOTIMPL;
    }

    public int SetGroupingParam(in Guid groupingParam, in Guid eventContext) => FakeAudioService.E_NOTIMPL;

    public int RegisterAudioSessionNotification(IAudioSessionEvents newNotifications)
    {
        if (Dead != 0) return Dead;
        lock (_events) _events.Add(newNotifications);
        Interlocked.Increment(ref Registered);
        return 0;
    }

    public int UnregisterAudioSessionNotification(IAudioSessionEvents newNotifications)
    {
        lock (_events) _events.Remove(newNotifications);
        Interlocked.Increment(ref Unregistered);
        return 0;
    }

    public int GetSessionIdentifier(out string? id)
    {
        id = $"{ep.Id}|\\Device\\HarddiskVolume1\\Program Files\\Example\\{model.App}%b{{00000000-0000-0000-0000-000000000000}}";
        return Dead;
    }

    public int GetSessionInstanceIdentifier(out string? id)
    {
        id = $"{ep.Id}|\\Device\\HarddiskVolume1\\Program Files\\Example\\{model.App}%b{{00000000-0000-0000-0000-000000000000}}|{model.Instance}";
        return Dead;
    }

    public int GetProcessId(out uint pid)
    {
        pid = 0; // never a real process: the engine falls back to the session identifier's path
        return Dead;
    }

    public int IsSystemSoundsSession() => HResults.S_FALSE;
    public int SetDuckingPreference(int optOut) => 0;

    public int SetMasterVolume(float fLevel, in Guid eventContext)
    {
        if (Dead != 0) return Dead;
        svc.CountSetter();
        model.Volume = fLevel;
        return 0;
    }

    public int GetMasterVolume(out float pfLevel)
    {
        pfLevel = model.Volume;
        return Dead;
    }

    public int SetMute(int bMute, in Guid eventContext)
    {
        if (Dead != 0) return Dead;
        svc.CountSetter();
        model.Muted = bMute != 0;
        return 0;
    }

    public int GetMute(out int pbMute)
    {
        pbMute = model.Muted ? 1 : 0;
        return Dead;
    }
}

/// <summary>The default-device setter (IPolicyConfig) of the fake service.</summary>
internal sealed class FakePolicy(FakeAudioService svc, int generation) : IDefaultEndpointSetter
{
    public bool Disposed { get; private set; }

    public int SetDefaultEndpoint(string deviceId, ERole role)
    {
        if (svc.IsDead(generation)) return FakeAudioService.Down;
        if (svc.Find(deviceId) is not { } ep) return HResults.E_NOTFOUND;
        svc.CountSetter();
        svc.SetDefault(ep.Flow, role, deviceId);
        svc.NotifyDefault(ep.Flow, role, deviceId);
        return 0;
    }

    public void Dispose() => Disposed = true;
}
