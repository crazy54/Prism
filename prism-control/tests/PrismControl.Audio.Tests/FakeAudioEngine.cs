using PrismControl.Audio;
using PrismControl.Audio.Spectrum;

namespace PrismControl.Audio.Tests;

/// <summary>
/// An in-memory <see cref="IAudioEngine"/>: every write is recorded and applied to the fake state (never to Windows),
/// and tests simulate external changes (another app, a headset button) with <see cref="External"/> and friends.
/// Change events are raised synchronously, like the real engine raises them on its worker.
/// Loopback capture (the spectrum) comes from <see cref="Loopback"/>: synthetic signals, never real audio.
/// </summary>
public sealed class FakeAudioEngine : IAudioEngine, ILoopbackSource
{
    public const string Speakers = "{0.0.0.00000000}.{example-out-speakers}";
    public const string MixerChat = "{0.0.0.00000000}.{example-out-mixer-chat}";
    public const string Headset = "{0.0.0.00000000}.{example-out-headset}";
    public const string FixedOut = "{0.0.0.00000000}.{example-out-fixed}";
    public const string UsbMic = "{0.0.1.00000000}.{example-in-usb}";
    public const string MixerMic = "{0.0.1.00000000}.{example-in-mixer}";

    private readonly object _gate = new();
    private readonly List<AudioDevice> _devices = [];
    private readonly Dictionary<(AudioFlow, AudioRole), string?> _defaults = new();
    private readonly List<SessionInfo> _sessions = [];
    private readonly Dictionary<string, MeterReading> _meters = new();

    public bool IsAvailable { get; set; } = true;
    public bool CanSetDefault { get; set; } = true;
    public bool FailWrites { get; set; }
    public bool? CaptureInUse { get; set; } = true;
    public event Action<AudioChange>? Changed;

    public List<string> Writes { get; } = [];
    public int SessionWatchers { get; private set; }
    public int OpenMeters { get; private set; }
    public List<string> MeteredDevices { get; } = [];

    /// <summary>What loopback capture "hears" per device (nothing until a test says so).</summary>
    internal FakeLoopbackSource Loopback { get; } = new();

    ILoopbackStream ILoopbackSource.OpenLoopback(string deviceId) => Loopback.OpenLoopback(deviceId);
    IDisposable ILoopbackSource.StartFrames(TimeSpan interval, Action frame) => Loopback.StartFrames(interval, frame);

    /// <summary>Two outputs plus a headset and a fixed-volume output; two inputs. Defaults: speakers and the USB mic.</summary>
    public static FakeAudioEngine Standard()
    {
        var f = new FakeAudioEngine();
        f.AddDevice(new AudioDevice(Speakers, AudioFlow.Render, "Speakers (Example USB Audio)") { Title = "Example USB Audio", Subtitle = "Speakers", Volume = 0.42f });
        f.AddDevice(new AudioDevice(MixerChat, AudioFlow.Render, "Example Mixer - Chat (Example Mixer Virtual Audio Device)") { Title = "Mixer - Chat", Subtitle = "Example Mixer Virtual Audio Device", Volume = 0.67f, IsVirtual = true });
        f.AddDevice(new AudioDevice(Headset, AudioFlow.Render, "Headphones (The Example Ensemble Headset)") { Title = "The Example Ensemble Headset", Subtitle = "Headphones", Volume = 1f });
        f.AddDevice(new AudioDevice(FixedOut, AudioFlow.Render, "Speakers (Example Voice Filter)") { Title = "Example Voice Filter", Subtitle = "Speakers", Volume = 1f, HasVolume = false });
        f.AddDevice(new AudioDevice(UsbMic, AudioFlow.Capture, "Microphone (Example USB Audio)") { Title = "Example USB Audio", Subtitle = "Microphone", Volume = 0.8f });
        f.AddDevice(new AudioDevice(MixerMic, AudioFlow.Capture, "Example Mixer - Microphone (Example Mixer Virtual Audio Device)") { Title = "Mixer - Microphone", Subtitle = "Example Mixer Virtual Audio Device", Volume = 1f });
        foreach (var r in Enum.GetValues<AudioRole>())
        {
            f._defaults[(AudioFlow.Render, r)] = Speakers;
            f._defaults[(AudioFlow.Capture, r)] = UsbMic;
        }
        return f;
    }

    /// <summary>Standard() plus three apps on the speakers and one on the headset.</summary>
    public static FakeAudioEngine WithApps()
    {
        var f = Standard();
        f.AddSession("music.exe", "Example Music", Speakers, 0.5f, active: true);
        f.AddSession("browser.exe", "Example Browser", Speakers, 0.8f);
        f.AddSession("chat.exe", "Example Chat", Speakers, 1f, active: true);
        f.AddSession("chat.exe", "Example Chat", Headset, 0.3f);
        f.AddSession(AppNames.SystemSoundsKey, "System Sounds", Speakers, 1f, system: true);
        return f;
    }

    public void AddDevice(AudioDevice d)
    {
        lock (_gate) _devices.Add(d);
    }

    public void RemoveDevice(string id)
    {
        lock (_gate) _devices.RemoveAll(d => d.Id == id);
        Raise(new AudioChange(AudioChangeKind.Devices));
    }

    public void AddSession(string appKey, string name, string deviceId, float volume, bool active = false, bool muted = false, bool system = false, bool raise = false)
    {
        lock (_gate) _sessions.Add(new SessionInfo($"{deviceId}|{appKey}|{_sessions.Count}", deviceId, appKey, name, system, active, volume, muted));
        if (raise) Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    public void RemoveApp(string appKey)
    {
        lock (_gate) _sessions.RemoveAll(s => s.AppKey == appKey);
        Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    /// <summary>Someone else changed the endpoint (Windows mixer, Wave Link, a headset button).</summary>
    public void External(string id, float? volume = null, bool? muted = null)
    {
        lock (_gate)
        {
            var i = _devices.FindIndex(d => d.Id == id);
            _devices[i] = _devices[i] with { Volume = volume ?? _devices[i].Volume, Muted = muted ?? _devices[i].Muted };
        }
        Raise(new AudioChange(AudioChangeKind.Endpoint, id));
    }

    public void ExternalDefault(AudioFlow flow, string id, params AudioRole[] roles)
    {
        lock (_gate)
            foreach (var r in roles.Length == 0 ? Enum.GetValues<AudioRole>() : roles)
                _defaults[(flow, r)] = id;
        Raise(new AudioChange(AudioChangeKind.Defaults, id, flow));
    }

    /// <summary>The flow has no default device (every role).</summary>
    public void NoDefault(AudioFlow flow)
    {
        lock (_gate)
            foreach (var r in Enum.GetValues<AudioRole>())
                _defaults[(flow, r)] = null;
        Raise(new AudioChange(AudioChangeKind.Defaults, null, flow));
    }

    public void ExternalAppVolume(string appKey, float volume, bool muted)
    {
        lock (_gate)
            for (var i = 0; i < _sessions.Count; i++)
                if (_sessions[i].AppKey == appKey) _sessions[i] = _sessions[i] with { Volume = volume, Muted = muted };
        Raise(new AudioChange(AudioChangeKind.Sessions));
    }

    public void SetMeter(string id, float peak, params float[] channels)
    {
        lock (_gate) _meters[id] = new MeterReading(peak, channels);
    }

    public void Raise(AudioChange c) => Changed?.Invoke(c);

    // ---------------------------------------------------------------- IAudioEngine

    public IReadOnlyList<AudioDevice> GetDevices(AudioFlow flow)
    {
        lock (_gate) return _devices.Where(d => d.Flow == flow).OrderBy(d => d.Title, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public AudioDevice? GetDevice(string id)
    {
        lock (_gate) return _devices.FirstOrDefault(d => d.Id == id);
    }

    public string? GetDefaultId(AudioFlow flow, AudioRole role)
    {
        lock (_gate) return _defaults.GetValueOrDefault((flow, role));
    }

    public Task SetVolumeAsync(string deviceId, float volume)
    {
        Writes.Add($"volume {deviceId} {volume:0.00}");
        if (FailWrites) return Task.FromException(new InvalidOperationException("fake failure"));
        lock (_gate)
        {
            var i = _devices.FindIndex(d => d.Id == deviceId);
            _devices[i] = _devices[i] with { Volume = Math.Clamp(volume, 0, 1) };
        }
        Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return Task.CompletedTask;
    }

    public Task SetMuteAsync(string deviceId, bool muted)
    {
        Writes.Add($"mute {deviceId} {muted}");
        if (FailWrites) return Task.FromException(new InvalidOperationException("fake failure"));
        lock (_gate)
        {
            var i = _devices.FindIndex(d => d.Id == deviceId);
            _devices[i] = _devices[i] with { Muted = muted };
        }
        Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return Task.CompletedTask;
    }

    public Task SetDefaultAsync(string deviceId, DefaultRoles roles)
    {
        Writes.Add($"default {deviceId} {roles}");
        if (FailWrites || !CanSetDefault) return Task.FromException(new InvalidOperationException("fake failure"));
        AudioFlow flow;
        lock (_gate)
        {
            flow = _devices.First(d => d.Id == deviceId).Flow;
            if (roles.HasFlag(DefaultRoles.Console)) _defaults[(flow, AudioRole.Console)] = deviceId;
            if (roles.HasFlag(DefaultRoles.Multimedia)) _defaults[(flow, AudioRole.Multimedia)] = deviceId;
            if (roles.HasFlag(DefaultRoles.Communications)) _defaults[(flow, AudioRole.Communications)] = deviceId;
        }
        Raise(new AudioChange(AudioChangeKind.Defaults, deviceId, flow));
        return Task.CompletedTask;
    }

    public IDisposable WatchSessions()
    {
        SessionWatchers++;
        return new Release(() => SessionWatchers--);
    }

    public IReadOnlyList<AudioApp> GetApps(string? deviceId = null)
    {
        lock (_gate) return SessionGrouping.Group([.. _sessions], deviceId, _defaults.GetValueOrDefault((AudioFlow.Render, AudioRole.Console)));
    }

    public Task SetAppVolumeAsync(string appKey, string? deviceId, float volume)
    {
        Writes.Add($"appvolume {appKey} {deviceId ?? "*"} {volume:0.00}");
        return UpdateApp(appKey, deviceId, s => s with { Volume = volume });
    }

    public Task SetAppMuteAsync(string appKey, string? deviceId, bool muted)
    {
        Writes.Add($"appmute {appKey} {deviceId ?? "*"} {muted}");
        return UpdateApp(appKey, deviceId, s => s with { Muted = muted });
    }

    private Task UpdateApp(string appKey, string? deviceId, Func<SessionInfo, SessionInfo> update)
    {
        if (FailWrites) return Task.FromException(new InvalidOperationException("fake failure"));
        lock (_gate)
            for (var i = 0; i < _sessions.Count; i++)
                if (_sessions[i].AppKey == appKey && (deviceId is null || _sessions[i].DeviceId == deviceId)) _sessions[i] = update(_sessions[i]);
        Raise(new AudioChange(AudioChangeKind.Sessions));
        return Task.CompletedTask;
    }

    public IAudioMeter OpenMeter(string deviceId)
    {
        OpenMeters++;
        MeteredDevices.Add(deviceId);
        return new Meter(this, deviceId);
    }

    public Task<bool?> IsCaptureInUseAsync(string deviceId) => Task.FromResult(CaptureInUse);

    private sealed class Meter(FakeAudioEngine engine, string deviceId) : IAudioMeter
    {
        private bool _disposed;
        public string DeviceId { get; } = deviceId;

        public MeterReading Take()
        {
            lock (engine._gate) return engine._meters.GetValueOrDefault(DeviceId, MeterReading.Silent);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            engine.OpenMeters--;
        }
    }

    private sealed class Release(Action release) : IDisposable
    {
        private Action? _release = release;
        public void Dispose() => Interlocked.Exchange(ref _release, null)?.Invoke();
    }
}
