using System.Globalization;
using System.Runtime.CompilerServices;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// Safe mode for audio (docs/authoring-actions.md § Safe mode). Reads come from the real engine; writes only change an
/// in-memory overlay that the reads then show, so keys and dials respond under the fake host while Windows is never
/// touched: no volume, mute, default-device or app change reaches Core Audio.
/// <para>
/// The module puts one in front of the engine it registers; an action whose <c>SafeMode</c> is on wraps whatever
/// engine it found (<see cref="For"/> hands out one wrapper per engine, so every key and dial sees the same fake state).
/// </para>
/// </summary>
internal sealed class SafeAudioEngine : IAudioEngine
{
    private const int MaxLog = 500;
    private static readonly ConditionalWeakTable<IAudioEngine, SafeAudioEngine> Shared = new();

    private readonly IAudioEngine _inner;
    private readonly ILog _log;
    private readonly object _gate = new();
    private readonly Dictionary<string, float> _volume = new(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _mute = new(StringComparer.Ordinal);
    private readonly Dictionary<(AudioFlow, AudioRole), string> _defaults = new();
    private readonly Dictionary<string, float> _appVolume = new(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _appMute = new(StringComparer.Ordinal);
    private readonly List<string> _suppressed = [];
    private int _suppressedCount;

    private SafeAudioEngine(IAudioEngine inner, ILog log)
    {
        _inner = inner;
        _log = log;
        inner.Changed += Raise;
    }

    /// <summary>The safe wrapper of <paramref name="engine"/> (itself when it already is one). One wrapper per engine.</summary>
    public static IAudioEngine For(IAudioEngine engine, ILog log) =>
        engine is SafeAudioEngine ? engine : Shared.GetValue(engine, e => new SafeAudioEngine(e, log));

    /// <summary>The engine whose reads this one shows.</summary>
    public IAudioEngine Inner => _inner;

    /// <summary>
    /// The writes that would have happened, oldest first, in the fake engine's format ("volume &lt;id&gt; 0.42",
    /// "mute &lt;id&gt; True", "default &lt;id&gt; All", "appvolume &lt;app&gt; &lt;device|*&gt; 0.50", "appmute ...").
    /// Keeps the last 500.
    /// </summary>
    public IReadOnlyList<string> WouldHaveWritten
    {
        get { lock (_gate) return [.. _suppressed]; }
    }

    /// <summary>How many writes were suppressed in total.</summary>
    public int SuppressedCount => Volatile.Read(ref _suppressedCount);

    public bool IsAvailable => _inner.IsAvailable;
    public bool CanSetDefault => _inner.CanSetDefault;
    public event Action<AudioChange>? Changed;

    // ---------------------------------------------------------------- reads (the real ones, with the overlay on top)

    public IReadOnlyList<AudioDevice> GetDevices(AudioFlow flow) => _inner.GetDevices(flow).Select(Apply).ToList();

    public AudioDevice? GetDevice(string id) => _inner.GetDevice(id) is { } d ? Apply(d) : null;

    public string? GetDefaultId(AudioFlow flow, AudioRole role)
    {
        lock (_gate)
            if (_defaults.TryGetValue((flow, role), out var id) && _inner.GetDevice(id) is not null) return id;
        return _inner.GetDefaultId(flow, role);
    }

    public IReadOnlyList<AudioApp> GetApps(string? deviceId = null) => _inner.GetApps(deviceId).Select(Apply).ToList();

    public IDisposable WatchSessions() => _inner.WatchSessions();
    public IAudioMeter OpenMeter(string deviceId) => _inner.OpenMeter(deviceId);
    public Task<bool?> IsCaptureInUseAsync(string deviceId) => _inner.IsCaptureInUseAsync(deviceId);

    private AudioDevice Apply(AudioDevice d)
    {
        lock (_gate)
        {
            if (_volume.TryGetValue(d.Id, out var v)) d = d with { Volume = v };
            if (_mute.TryGetValue(d.Id, out var m)) d = d with { Muted = m };
            return d;
        }
    }

    private AudioApp Apply(AudioApp a)
    {
        lock (_gate)
        {
            if (_appVolume.TryGetValue(a.Key, out var v)) a = a with { Volume = v };
            if (_appMute.TryGetValue(a.Key, out var m)) a = a with { Muted = m };
            return a;
        }
    }

    // ---------------------------------------------------------------- writes (overlay only)

    public Task SetVolumeAsync(string deviceId, float volume)
    {
        if (GetDevice(deviceId) is not { } d) return Task.FromException(new InvalidOperationException("That audio device is not available."));
        if (!d.HasVolume) return Task.CompletedTask;
        volume = Math.Clamp(volume, 0f, 1f);
        lock (_gate) _volume[deviceId] = volume;
        Record(string.Create(CultureInfo.InvariantCulture, $"volume {deviceId} {volume:0.00}"),
            $"would set {(d.Flow == AudioFlow.Render ? "an output" : "an input")} volume to {Pct(volume)}%");
        Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return Task.CompletedTask;
    }

    public Task SetMuteAsync(string deviceId, bool muted)
    {
        if (GetDevice(deviceId) is not { } d) return Task.FromException(new InvalidOperationException("That audio device is not available."));
        lock (_gate) _mute[deviceId] = muted;
        Record($"mute {deviceId} {muted}", $"would {(muted ? "mute" : "unmute")} {(d.Flow == AudioFlow.Render ? "an output" : "a microphone")}");
        Raise(new AudioChange(AudioChangeKind.Endpoint, deviceId));
        return Task.CompletedTask;
    }

    public Task SetDefaultAsync(string deviceId, DefaultRoles roles)
    {
        if (!CanSetDefault) return Task.FromException(new NotSupportedException("Default-device switching is not available on this Windows build."));
        if (GetDevice(deviceId) is not { } d) return Task.FromException(new InvalidOperationException("That audio device is not available."));
        if (roles == DefaultRoles.None) return Task.CompletedTask;
        lock (_gate)
        {
            if (roles.HasFlag(DefaultRoles.Console)) _defaults[(d.Flow, AudioRole.Console)] = deviceId;
            if (roles.HasFlag(DefaultRoles.Multimedia)) _defaults[(d.Flow, AudioRole.Multimedia)] = deviceId;
            if (roles.HasFlag(DefaultRoles.Communications)) _defaults[(d.Flow, AudioRole.Communications)] = deviceId;
        }
        Record($"default {deviceId} {roles}", $"would switch the default {(d.Flow == AudioFlow.Render ? "output" : "input")} ({roles})");
        Raise(new AudioChange(AudioChangeKind.Defaults, deviceId, d.Flow));
        return Task.CompletedTask;
    }

    public Task SetAppVolumeAsync(string appKey, string? deviceId, float volume)
    {
        volume = Math.Clamp(volume, 0f, 1f);
        lock (_gate) _appVolume[appKey] = volume;
        Record(string.Create(CultureInfo.InvariantCulture, $"appvolume {appKey} {deviceId ?? "*"} {volume:0.00}"), $"would set an app's volume to {Pct(volume)}%");
        Raise(new AudioChange(AudioChangeKind.Sessions));
        return Task.CompletedTask;
    }

    public Task SetAppMuteAsync(string appKey, string? deviceId, bool muted)
    {
        lock (_gate) _appMute[appKey] = muted;
        Record($"appmute {appKey} {deviceId ?? "*"} {muted}", $"would {(muted ? "mute" : "unmute")} an app");
        Raise(new AudioChange(AudioChangeKind.Sessions));
        return Task.CompletedTask;
    }

    private void Record(string entry, string what)
    {
        Interlocked.Increment(ref _suppressedCount);
        lock (_gate)
        {
            _suppressed.Add(entry);
            if (_suppressed.Count > MaxLog) _suppressed.RemoveRange(0, _suppressed.Count - MaxLog);
        }
        SafeModeLog.Suppressed(_log, what);
    }

    private void Raise(AudioChange change)
    {
        if (Changed is not { } handlers) return;
        foreach (var h in handlers.GetInvocationList().Cast<Action<AudioChange>>())
        {
            try { h(change); }
            catch (Exception ex) { _log.Warn("audio change handler failed", ex); }
        }
    }

    private static int Pct(float v) => (int)Math.Round(v * 100, MidpointRounding.AwayFromZero);
}

/// <summary>Logs the first suppressed audio write of the process at Info, the rest at Debug (never device names or ids).</summary>
internal static class SafeModeLog
{
    private static int s_logged;

    public static void Suppressed(ILog log, string what)
    {
        if (Interlocked.Exchange(ref s_logged, 1) == 0)
            log.Info($"[safe mode] Audio changes are simulated, not applied to Windows (first: {what}). Logged once; the rest go to the debug log.");
        else log.Debug($"[safe mode] {what}");
    }

    /// <summary>Tests: start over, so "logged once" can be asserted.</summary>
    internal static void ResetForTests() => Volatile.Write(ref s_logged, 0);
}
