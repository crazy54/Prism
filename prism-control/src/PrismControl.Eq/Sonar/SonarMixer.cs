using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Infrastructure;

namespace PrismControl.Eq.Sonar;

/// <summary>A Sonar channel volume (0..1) and mute, in the mode and mix it was read from.</summary>
public sealed record SonarVolume(string Channel, double Volume, bool Muted, bool Streamer, string Mix);

/// <summary>Sonar ChatMix: balance -1 (all game) … +1 (all chat). Software writes only work when <see cref="State"/> is "enabled".</summary>
public sealed record SonarChatMix(double Balance, string State)
{
    public bool CanWrite => State.Equals("enabled", StringComparison.OrdinalIgnoreCase);
    /// <summary>The headset has a hardware ChatMix wheel; Sonar refuses software changes.</summary>
    public bool OnHardwareWheel => State.Equals("finiteWheel", StringComparison.OrdinalIgnoreCase);
    public double GamePercent => Balance <= 0 ? 100 : Math.Round((1 - Balance) * 100);
    public double ChatPercent => Balance >= 0 ? 100 : Math.Round((1 + Balance) * 100);
}

/// <summary>
/// Sonar channel volume, mute and ChatMix (research eq.md §4.3–4.4). The value travels in the path
/// (<c>PUT /volumeSettings/classic/game/Volume/0.5</c>, invariant culture), so writes rarely collide; they are still
/// coalesced (latest wins, 100 ms / 250 ms) so a fast spin sends a few requests, not dozens. Classic and Streamer modes
/// are both handled (Streamer: the monitoring or streaming mix). This class never switches mode, devices or routing.
/// <para>Safe mode (the client's <see cref="SonarClient.SafeMode"/>): the PUTs are suppressed by the client, and a value
/// changed that way keeps its local copy (polls don't put Sonar's unchanged value back), so the dial responds.</para>
/// </summary>
public sealed class SonarMixer : IAsyncDisposable
{
    public const string Master = "master", ChatMixId = "chatMix";
    public static readonly IReadOnlyList<string> VolumeChannels = [Master, SonarChannels.Game, SonarChannels.Chat, SonarChannels.Media, SonarChannels.Aux, SonarChannels.Mic];
    public static readonly TimeSpan HoldWindow = TimeSpan.FromSeconds(1.5);

    private readonly SonarClient _client;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly WriteCoalescer<string> _writer;
    private readonly Dictionary<string, SonarVolume> _volumes = new();
    private readonly Dictionary<string, long> _editedAt = new();
    private readonly Dictionary<string, Func<CancellationToken, Task>> _pending = new();
    private readonly HashSet<string> _safePinned = new(); // safe mode: values with simulated writes
    private bool _chatMixSafePinned;
    private SonarChatMix? _chatMix;
    private long _chatMixEditedAt;
    private long _volumesAt;
    private bool _streamer;
    private int _chatMixWatchers;

    public SonarMixer(SonarClient client, ILog log, TimeProvider time)
    {
        _client = client;
        _log = log;
        _time = time;
        _writer = new WriteCoalescer<string>(time, RunPendingAsync, (k, ex) => OnWriteFailed(k, ex),
            debounce: TimeSpan.FromMilliseconds(100), maxWait: TimeSpan.FromMilliseconds(250), minGap: TimeSpan.FromMilliseconds(60));
    }

    public SonarClient Client => _client;
    public EqAvailability Availability => _client.Availability;
    public TimeSpan NextPollDelay => _client.Availability.Available ? TimeSpan.FromSeconds(1) : _client.RetryDelay;

    /// <summary>A volume or ChatMix value changed (locally or in Sonar). The payload is the channel id or "chatMix".</summary>
    public event EventHandler<string>? Changed;

    public static string ChannelName(string channel) => channel switch
    {
        Master => "Master",
        ChatMixId => "ChatMix",
        _ => SonarChannels.Name(channel),
    };

    public static bool IsKnown(string? channel) => channel is not null && (VolumeChannels.Contains(channel) || channel == ChatMixId);

    public IDisposable WatchChatMix()
    {
        Interlocked.Increment(ref _chatMixWatchers);
        return new Release(() => Interlocked.Decrement(ref _chatMixWatchers));
    }

    public SonarVolume? Cached(string channel, string mix)
    {
        lock (_gate) return _volumes.GetValueOrDefault(Key(channel, mix));
    }

    /// <summary>Sonar is in Streamer mode (two mixes) as of the last read.</summary>
    public bool IsStreamer { get { lock (_gate) return _streamer; } }

    public SonarChatMix? CachedChatMix { get { lock (_gate) return _chatMix; } }

    /// <summary>Reads volumes (and ChatMix while a ChatMix dial is visible). One shared poll for every dial.</summary>
    public async Task PollAsync(CancellationToken ct)
    {
        var a = await _client.EnsureAsync(ct).ConfigureAwait(false);
        // A Sonar error is transient: keep polling (the client fails fast during its backoff; after it, this is the probe).
        if (!a.Available && !a.IsTransient) return;
        try
        {
            await RefreshVolumesAsync(ct).ConfigureAwait(false);
            if (Volatile.Read(ref _chatMixWatchers) > 0) await RefreshChatMixAsync(ct).ConfigureAwait(false);
        }
        catch (EqUnavailableException) { /* the availability event tells the dials */ }
    }

    public async Task<SonarVolume> GetVolumeAsync(string channel, string mix, TimeSpan maxAge, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_volumes.TryGetValue(Key(channel, mix), out var v) && _time.GetElapsedTime(_volumesAt) < maxAge) return v;
        }
        await RefreshVolumesAsync(ct).ConfigureAwait(false);
        lock (_gate)
        {
            return _volumes.TryGetValue(Key(channel, mix), out var v)
                ? v
                : throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Error, $"Sonar reported no volume for {ChannelName(channel)}."));
        }
    }

    public async Task<SonarChatMix> GetChatMixAsync(TimeSpan maxAge, CancellationToken ct)
    {
        lock (_gate) if (_chatMix is not null && _time.GetElapsedTime(_chatMixAt) < maxAge) return _chatMix;
        await RefreshChatMixAsync(ct).ConfigureAwait(false);
        lock (_gate) return _chatMix ?? new SonarChatMix(0, "noDeviceSelected");
    }

    private long _chatMixAt;

    /// <summary>Optimistic: returns the new value at once and queues a coalesced PUT.</summary>
    public SonarVolume SetVolume(string channel, string mix, double volume)
    {
        SonarVolume v;
        string key;
        lock (_gate)
        {
            key = Key(channel, mix);
            var old = _volumes.GetValueOrDefault(key) ?? throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Unknown, "Loading Sonar…"));
            v = old with { Volume = Math.Round(Math.Clamp(volume, 0, 1), 3) };
            _volumes[key] = v;
            _editedAt[key] = _time.GetTimestamp();
            if (_client.SafeMode) _safePinned.Add(key);
            var path = VolumePath(v.Streamer, v.Mix, channel, "volume", SonarClient.Num(v.Volume));
            _pending["vol|" + key] = ct => _client.PutAsync(path, null, ct);
        }
        _writer.Schedule("vol|" + key);
        Changed?.Invoke(this, channel);
        return v;
    }

    /// <summary>Mute is a press, not a spin: written right away.</summary>
    public SonarVolume SetMuted(string channel, string mix, bool muted)
    {
        SonarVolume v;
        string key;
        lock (_gate)
        {
            key = Key(channel, mix);
            var old = _volumes.GetValueOrDefault(key) ?? throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Unknown, "Loading Sonar…"));
            v = old with { Muted = muted };
            _volumes[key] = v;
            _editedAt[key] = _time.GetTimestamp();
            if (_client.SafeMode) _safePinned.Add(key);
            var path = VolumePath(v.Streamer, v.Mix, channel, "mute", muted ? "true" : "false");
            _pending["mute|" + key] = ct => _client.PutAsync(path, null, ct);
        }
        _writer.Schedule("mute|" + key);
        _ = _writer.FlushAsync();
        Changed?.Invoke(this, channel);
        return v;
    }

    /// <summary>Only when Sonar allows software ChatMix (state "enabled"); otherwise returns the current value unchanged.</summary>
    public SonarChatMix SetChatMix(double balance)
    {
        SonarChatMix cm;
        lock (_gate)
        {
            var old = _chatMix ?? throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Unknown, "Loading Sonar…"));
            if (!old.CanWrite) return old;
            cm = old with { Balance = Math.Round(Math.Clamp(balance, -1, 1), 2) };
            _chatMix = cm;
            _chatMixEditedAt = _time.GetTimestamp();
            if (_client.SafeMode) _chatMixSafePinned = true;
            var path = "/v1/chatMix?balance=" + SonarClient.Num(cm.Balance);
            _pending["chatmix"] = ct => _client.PutAsync(path, null, ct);
        }
        _writer.Schedule("chatmix");
        Changed?.Invoke(this, ChatMixId);
        return cm;
    }

    public Task FlushAsync(CancellationToken ct = default) => _writer.FlushAsync(ct);
    public Task WhenWritesIdleAsync(CancellationToken ct = default) => _writer.WhenIdleAsync(ct);

    /// <summary>
    /// Classic: <c>/volumeSettings/classic/{Master|role}/{Volume|Mute}/{v}</c>.
    /// Streamer: <c>/volumeSettings/streamer/{streaming|monitoring}/{master|role}/{volume|isMuted}/{v}</c>.
    /// </summary>
    public static string VolumePath(bool streamer, string mix, string channel, string what, string value)
    {
        if (!VolumeChannels.Contains(channel)) throw new ArgumentException($"'{channel}' is not a Sonar volume channel.", nameof(channel));
        if (!streamer)
        {
            var role = channel == Master ? "Master" : channel;
            return $"/volumeSettings/classic/{role}/{(what == "mute" ? "Mute" : "Volume")}/{value}";
        }
        var m = mix == "streaming" ? "streaming" : "monitoring";
        return $"/volumeSettings/streamer/{m}/{channel}/{(what == "mute" ? "isMuted" : "volume")}/{value}";
    }

    private async Task RefreshVolumesAsync(CancellationToken ct)
    {
        var status = await _client.GetStatusAsync(TimeSpan.FromSeconds(5), ct).ConfigureAwait(false);
        var streamer = status.IsStreamer;
        var node = await _client.GetAsync(streamer ? "/volumeSettings/streamer" : "/volumeSettings/classic", ct, SonarReply.Object).ConfigureAwait(false);
        var changed = new List<string>();
        lock (_gate)
        {
            if (_streamer != streamer) { _volumes.Clear(); _safePinned.Clear(); _streamer = streamer; }
            foreach (var channel in VolumeChannels)
            {
                var src = channel == Master ? node?["masters"] : node?["devices"]?[channel];
                foreach (var mix in streamer ? new[] { "monitoring", "streaming" } : ["classic"])
                {
                    var o = streamer ? src?["stream"]?[mix] : src?["classic"];
                    if (o is null || SonarConfig.Num(o["volume"]) is not { } vol) continue;
                    var key = Key(channel, streamer ? mix : "monitoring");
                    if (_safePinned.Contains(key)) continue;
                    if (_editedAt.TryGetValue(key, out var at) && (_time.GetElapsedTime(at) < HoldWindow || _writer.IsBusy("vol|" + key) || _writer.IsBusy("mute|" + key))) continue;
                    var v = new SonarVolume(channel, vol, SonarConfig.Bool(o["muted"]) ?? SonarConfig.Bool(o["isMuted"]) ?? false, streamer, streamer ? mix : "classic");
                    if (!_volumes.TryGetValue(key, out var old) || Math.Abs(old.Volume - v.Volume) > 0.0005 || old.Muted != v.Muted)
                        changed.Add(channel);
                    _volumes[key] = v;
                }
            }
            _volumesAt = _time.GetTimestamp();
        }
        foreach (var c in changed.Distinct()) Changed?.Invoke(this, c);
    }

    private async Task RefreshChatMixAsync(CancellationToken ct)
    {
        var node = await _client.GetAsync("/v1/chatMix", ct, SonarReply.Object).ConfigureAwait(false);
        var cm = new SonarChatMix(SonarConfig.Num(node?["balance"]) ?? 0, SonarConfig.Str(node?["state"]) ?? "noDeviceSelected");
        bool changed;
        lock (_gate)
        {
            if (_chatMixSafePinned && _chatMix is not null) { _chatMixAt = _time.GetTimestamp(); return; }
            if (_chatMixEditedAt != 0 && (_time.GetElapsedTime(_chatMixEditedAt) < HoldWindow || _writer.IsBusy("chatmix"))) return;
            changed = _chatMix is null || Math.Abs(_chatMix.Balance - cm.Balance) > 0.005 || _chatMix.State != cm.State;
            _chatMix = cm with { Balance = Math.Round(cm.Balance, 2) };
            _chatMixAt = _time.GetTimestamp();
        }
        if (changed) Changed?.Invoke(this, ChatMixId);
    }

    /// <summary>Volumes are keyed per mix; Classic mode uses one mix (stored under "monitoring").</summary>
    private string Key(string channel, string mix) => channel + "|" + (_streamer && mix == "streaming" ? "streaming" : "monitoring");

    private async Task RunPendingAsync(string key, CancellationToken ct)
    {
        Func<CancellationToken, Task>? work;
        lock (_gate) { if (_pending.Remove(key, out work) is false) return; }
        await work!(ct).ConfigureAwait(false);
    }

    private void OnWriteFailed(string key, Exception ex)
    {
        if (ex is SonarHttpException { Status: System.Net.HttpStatusCode.Forbidden } && key == "chatmix")
        {
            _log.Info("Sonar refused the ChatMix change (the headset's ChatMix wheel is in charge).");
            lock (_gate) _chatMixEditedAt = 0;
            return;
        }
        _log.Warn($"Sonar mixer write {key} failed: {ex.Message}");
        lock (_gate) _editedAt.Clear();
    }

    public async ValueTask DisposeAsync() => await _writer.DisposeAsync().ConfigureAwait(false);

    private sealed class Release(Action release) : IDisposable
    {
        private int _done;
        public void Dispose() { if (Interlocked.Exchange(ref _done, 1) == 0) release(); }
    }
}
