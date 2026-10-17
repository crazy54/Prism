using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Infrastructure;

namespace PrismControl.Eq.Sonar;

/// <summary>
/// The SteelSeries Sonar backend (default). Holds each channel's selected config as raw JSON, edits it locally and
/// sends the whole config back with <c>PUT /configs</c>, coalesced (research eq.md §4.8): one write in flight, latest
/// wins, 100 ms trailing / 250 ms max wait, and at least 180 ms between writes so a fast spin stays under Sonar's
/// "3 calls per 500 ms" rate warning. Sonar pushes no event for EQ edits, so external changes are found by polling
/// <c>/v1/status</c> (2 s) and <c>/configs/selected</c> (on a preset switch, or every 8 s).
/// <para>
/// Lost-update guard: while a channel is being edited (a write pending, or an edit in the last 1.5 s) polls never
/// replace its local copy; a new gesture re-reads the config when the copy is older than 1 s.
/// </para>
/// <para>
/// Safe mode (the client's <see cref="SonarClient.SafeMode"/>): edits, preset selects and reverts change only the local
/// copy (the client sends no PUT), and a channel touched that way keeps its local copy from then on, so keys and dials
/// respond as if Sonar had taken the change. Reads stay real.
/// </para>
/// </summary>
public sealed class SonarEqBackend : IEqBackend
{
    private sealed class Slot(string vad)
    {
        public readonly string Vad = vad;
        public JsonObject? Config;
        public long FetchedAt;
        public long LastEditAt;
        public long Version;
        public List<EqPreset>? Presets;
        public long PresetsAt;
        /// <summary>Safe mode only: the local copy holds simulated writes, so Sonar's (unchanged) copy must not replace it.</summary>
        public bool SafePinned;
    }

    public static readonly TimeSpan HoldWindow = TimeSpan.FromSeconds(1.5);
    public static readonly TimeSpan SelectedRefresh = TimeSpan.FromSeconds(8);
    public static readonly TimeSpan StatusMaxAge = TimeSpan.FromSeconds(1.5);

    private readonly SonarClient _client;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly Dictionary<string, Slot> _slots = SonarChannels.All.ToDictionary(v => v, v => new Slot(v));
    private readonly Dictionary<string, JsonObject> _snapshots = new();
    private readonly WriteCoalescer<string> _writer;
    private long _selectedAt;
    private SonarStatus? _lastStatus;
    private long _versionSeed;

    public SonarEqBackend(SonarClient client, ILog log, TimeProvider time)
    {
        _client = client;
        _log = log;
        _time = time;
        _writer = new WriteCoalescer<string>(time, WriteAsync, (vad, ex) => OnWriteFailed(vad, ex),
            debounce: TimeSpan.FromMilliseconds(100), maxWait: TimeSpan.FromMilliseconds(250), minGap: TimeSpan.FromMilliseconds(180));
        _client.AvailabilityChanged += (_, a) => AvailabilityChanged?.Invoke(this, a);
    }

    public string Id => "sonar";
    public string DisplayName => "SteelSeries Sonar";
    public EqCapabilities Capabilities =>
        EqCapabilities.GainBands | EqCapabilities.ParametricBands | EqCapabilities.BandEnable | EqCapabilities.Presets |
        EqCapabilities.PresetFavorites | EqCapabilities.MultipleChannels | EqCapabilities.Preamp | EqCapabilities.ToneKnobs |
        EqCapabilities.ResetToDefault | EqCapabilities.EqBypass | EqCapabilities.ExternalChanges | EqCapabilities.EffectsBypass;
    public EqAvailability Availability => _client.Availability;
    public TimeSpan NextPollDelay => _client.RetryDelay;
    public SonarClient Client => _client;
    /// <summary>PUT /configs requests started (tests and diagnostics).</summary>
    public int WritesStarted => _writer.WritesStarted;

    public event EventHandler<EqChangedEventArgs>? Changed;
    public event EventHandler<EqAvailability>? AvailabilityChanged;

    public async Task<EqAvailability> ProbeAsync(CancellationToken ct)
    {
        var a = await _client.EnsureAsync(ct).ConfigureAwait(false);
        if (!a.Available) return a;
        try { await StatusAsync(StatusMaxAge, ct).ConfigureAwait(false); }
        catch (EqUnavailableException ex) { return ex.Availability; }
        return _client.Availability;
    }

    public async Task<IReadOnlyList<EqChannel>> GetChannelsAsync(CancellationToken ct)
    {
        SonarStatus? status = null;
        try { status = await StatusAsync(TimeSpan.FromSeconds(5), ct).ConfigureAwait(false); }
        catch (EqUnavailableException) { /* list the channels anyway; the PI shows the status line */ }
        return SonarChannels.All.Select(v =>
        {
            var s = status?.Channels.GetValueOrDefault(v);
            return new EqChannel(v, SonarChannels.Name(v), SonarChannels.Kind(v), s?.IsEnabled ?? true, s?.EndpointId);
        }).ToList();
    }

    public EqState? TryGetCachedState(string channelId)
    {
        lock (_gate) return _slots.TryGetValue(channelId, out var s) && s.Config is not null ? StateOf(s) : null;
    }

    public async Task<EqState> GetStateAsync(string channelId, TimeSpan maxAge, CancellationToken ct)
    {
        var slot = SlotFor(channelId);
        lock (_gate)
        {
            if (slot.Config is not null && (IsHeld(slot) || slot.SafePinned || _time.GetElapsedTime(slot.FetchedAt) < maxAge)) return StateOf(slot);
        }
        await RefreshSelectedAsync(ct).ConfigureAwait(false);
        lock (_gate)
        {
            if (slot.Config is null) throw new EqUnavailableException(new EqAvailability(EqAvailabilityCode.Error, $"Sonar has no active config for {SonarChannels.Name(channelId)}."));
            return StateOf(slot);
        }
    }

    public async Task<IReadOnlyList<EqPreset>> GetPresetsAsync(string channelId, TimeSpan maxAge, CancellationToken ct)
    {
        var slot = SlotFor(channelId);
        lock (_gate)
        {
            if (slot.Presets is not null && _time.GetElapsedTime(slot.PresetsAt) < maxAge) return slot.Presets;
        }
        var node = await _client.GetAsync("/presets/" + channelId, ct, SonarReply.Array).ConfigureAwait(false);
        var list = new List<EqPreset>();
        if (node is JsonArray arr)
        {
            foreach (var p in arr.OfType<JsonObject>())
            {
                var id = SonarConfig.Str(p["id"]);
                if (id is null) continue;
                list.Add(new EqPreset(id, SonarConfig.Str(p["name"]) ?? "Untitled", SonarConfig.Bool(p["isFavorite"]) ?? false,
                    (int)(SonarConfig.Num(p["favoritePosition"]) ?? -1), IsBuiltIn: false));
            }
        }
        lock (_gate)
        {
            slot.Presets = list;
            slot.PresetsAt = _time.GetTimestamp();
        }
        return list;
    }

    public async Task<EqState> SelectPresetAsync(string channelId, string presetId, CancellationToken ct)
    {
        var slot = SlotFor(channelId);
        // Only ever select a config that belongs to this channel (an id from another channel would switch that one).
        var presets = await GetPresetsAsync(channelId, TimeSpan.FromSeconds(10), ct).ConfigureAwait(false);
        if (!presets.Any(p => p.Id == presetId))
        {
            presets = await GetPresetsAsync(channelId, TimeSpan.Zero, ct).ConfigureAwait(false);
            if (!presets.Any(p => p.Id == presetId)) throw new EqPresetMissingException(channelId, presetId);
        }
        await _writer.FlushAsync(ct).ConfigureAwait(false); // pending edits belong to the outgoing config
        JsonNode? resp;
        try { resp = await _client.PutAsync("/configs/" + Uri.EscapeDataString(presetId) + "/select", null, ct).ConfigureAwait(false); }
        catch (SonarHttpException ex) when (ex.Status == System.Net.HttpStatusCode.NotFound)
        {
            lock (_gate) slot.Presets = null;
            throw new EqPresetMissingException(channelId, presetId);
        }
        EqState? state = null;
        lock (_gate)
        {
            if (resp is JsonObject cfg && SonarConfig.Vad(cfg) == channelId && SonarConfig.Data(cfg) is not null)
            {
                slot.Config = cfg;
                slot.FetchedAt = _time.GetTimestamp();
                slot.LastEditAt = 0;
                slot.Version = NextVersion();
                state = StateOf(slot);
            }
            else if (resp is null && _client.SafeMode && slot.Config is { } current)
            {
                // Safe mode: nothing was sent. Show the preset as selected (its id and name over the current curve; its
                // full config would cost a read of up to 1 MB) and keep that copy, so the key lights like the real thing.
                var preset = presets.First(p => p.Id == presetId);
                var fake = (JsonObject)current.DeepClone();
                fake["id"] = presetId;
                fake["name"] = preset.Name;
                fake["isFavorite"] = preset.IsFavorite;
                fake["favoritePosition"] = preset.FavoritePosition;
                slot.Config = fake;
                slot.SafePinned = true;
                slot.FetchedAt = _time.GetTimestamp();
                slot.LastEditAt = 0;
                slot.Version = NextVersion();
                state = StateOf(slot);
            }
            else slot.FetchedAt = 0;
        }
        if (state is null) return await GetStateAsync(channelId, TimeSpan.Zero, ct).ConfigureAwait(false);
        Changed?.Invoke(this, new EqChangedEventArgs(channelId, state, External: false));
        return state;
    }

    public EqState SetGain(string channelId, EqTarget target, double gainDb) =>
        Edit(channelId, data => SonarConfig.SetGain(data, target, gainDb));

    public EqState SetBand(string channelId, int bandIndex, EqBandPatch patch) =>
        Edit(channelId, data => SonarConfig.SetBand(data, bandIndex, patch));

    public EqState SetEnabled(string channelId, EqToggleScope scope, bool enabled) =>
        Edit(channelId, data => SonarConfig.SetEnabled(data, scope, enabled));

    public EqState Reset(string channelId, EqResetScope scope, EqTarget target) =>
        Edit(channelId, (data, config) => SonarConfig.Reset(data, SonarConfig.DefaultData(config), scope, target));

    private EqState Edit(string channelId, Action<JsonObject> edit) => Edit(channelId, (d, _) => edit(d));

    private EqState Edit(string channelId, Action<JsonObject, JsonObject> edit)
    {
        var slot = SlotFor(channelId);
        EqState state;
        lock (_gate)
        {
            var config = slot.Config ?? throw new EqUnavailableException(Availability.Available
                ? new EqAvailability(EqAvailabilityCode.Unknown, "Loading Sonar…")
                : Availability);
            var data = SonarConfig.Data(config) ?? throw new InvalidOperationException("This Sonar config has no data.");
            if (SonarConfig.Id(config) is { } id && !_snapshots.ContainsKey(id)) _snapshots[id] = (JsonObject)config.DeepClone();
            edit(data, config);
            slot.LastEditAt = _time.GetTimestamp();
            slot.Version = NextVersion();
            if (_client.SafeMode) slot.SafePinned = true; // the write will be simulated: keep this copy
            state = StateOf(slot);
        }
        _writer.Schedule(channelId);
        Changed?.Invoke(this, new EqChangedEventArgs(channelId, state, External: false));
        return state;
    }

    public async Task<bool> RevertSessionAsync(string channelId, CancellationToken ct)
    {
        var slot = SlotFor(channelId);
        JsonObject? snapshot;
        lock (_gate)
        {
            var id = slot.Config is { } c ? SonarConfig.Id(c) : null;
            snapshot = id is not null && _snapshots.TryGetValue(id, out var s) ? s : null;
        }
        if (snapshot is null) return false;
        _writer.Cancel(channelId);
        await _writer.WhenIdleAsync(ct).ConfigureAwait(false);
        await _client.PutAsync("/configs", snapshot.ToJsonString(), ct).ConfigureAwait(false);
        EqState state;
        lock (_gate)
        {
            slot.Config = (JsonObject)snapshot.DeepClone();
            slot.FetchedAt = _time.GetTimestamp();
            slot.LastEditAt = 0;
            slot.Version = NextVersion();
            if (SonarConfig.Id(snapshot) is { } id) _snapshots.Remove(id);
            state = StateOf(slot);
        }
        Changed?.Invoke(this, new EqChangedEventArgs(channelId, state, External: false));
        return true;
    }

    public bool HasSessionEdits(string channelId)
    {
        lock (_gate) return _slots.TryGetValue(channelId, out var s) && s.Config is { } c && SonarConfig.Id(c) is { } id && _snapshots.ContainsKey(id);
    }

    public Task FlushAsync(CancellationToken ct) => _writer.FlushAsync(ct);

    /// <summary>Completes when no write is pending or in flight (tests).</summary>
    public Task WhenWritesIdleAsync(CancellationToken ct = default) => _writer.WhenIdleAsync(ct);

    public async Task PollAsync(CancellationToken ct)
    {
        var wasAvailable = _client.Availability.Available;
        var a = await _client.EnsureAsync(ct).ConfigureAwait(false);
        // A Sonar error is transient: keep polling (the client fails fast during its backoff; after it, this is the probe).
        if (!a.Available && !a.IsTransient) return;
        SonarStatus status;
        try { status = await StatusAsync(StatusMaxAge, ct).ConfigureAwait(false); }
        catch (EqUnavailableException) { return; }

        var needSelected = !wasAvailable || _time.GetElapsedTime(_selectedAt) >= SelectedRefresh;
        var statusOnly = new List<string>();
        lock (_gate)
        {
            foreach (var (vad, cs) in status.Channels)
            {
                var slot = _slots[vad];
                var prev = _lastStatus?.Channels.GetValueOrDefault(vad);
                if (prev is not null && prev.IsEnabled != cs.IsEnabled) statusOnly.Add(vad);
                if (slot.SafePinned) continue; // simulated edits: Sonar's copy differs on purpose
                var currentId = slot.Config is { } c ? SonarConfig.Id(c) : null;
                if (currentId != cs.ConfigId || (slot.Config is { } c2 && SonarConfig.Name(c2) != cs.ConfigName && !IsHeld(slot))) needSelected = true;
            }
            _lastStatus = status;
        }
        try { if (needSelected) await RefreshSelectedAsync(ct).ConfigureAwait(false); }
        catch (EqUnavailableException) { return; }
        foreach (var vad in statusOnly) Changed?.Invoke(this, new EqChangedEventArgs(vad, TryGetCachedState(vad), External: true));
    }

    /// <summary>The last status from the shared client cache (for channel on/off hints).</summary>
    public SonarChannelStatus? ChannelStatus(string channelId) => _client.LastStatus?.Channels.GetValueOrDefault(channelId);

    private Task<SonarStatus> StatusAsync(TimeSpan maxAge, CancellationToken ct) => _client.GetStatusAsync(maxAge, ct);

    /// <summary><c>GET /configs/selected</c>: the 5 active configs (about 16 KB). Held channels keep their local copy.</summary>
    private async Task RefreshSelectedAsync(CancellationToken ct)
    {
        var node = await _client.GetAsync("/configs/selected", ct, SonarReply.Array).ConfigureAwait(false);
        var changed = new List<EqChangedEventArgs>();
        lock (_gate)
        {
            _selectedAt = _time.GetTimestamp();
            if (node is not JsonArray arr) return;
            foreach (var item in arr.OfType<JsonObject>())
            {
                var vad = SonarConfig.Vad(item);
                if (vad is null || !_slots.TryGetValue(vad, out var slot) || SonarConfig.Data(item) is null) continue;
                if (IsHeld(slot) || slot.SafePinned) continue;
                var old = slot.Config;
                var fresh = (JsonObject)item.DeepClone();
                slot.Config = fresh;
                slot.FetchedAt = _selectedAt;
                if (old is null || !SameContent(old, fresh))
                {
                    slot.Version = NextVersion();
                    changed.Add(new EqChangedEventArgs(vad, StateOf(slot), External: true));
                }
            }
        }
        foreach (var c in changed) Changed?.Invoke(this, c);
    }

    private static bool SameContent(JsonObject a, JsonObject b) =>
        SonarConfig.Id(a) == SonarConfig.Id(b) && SonarConfig.Name(a) == SonarConfig.Name(b) &&
        SonarConfig.Bool(a["isFavorite"]) == SonarConfig.Bool(b["isFavorite"]) &&
        JsonNode.DeepEquals(SonarConfig.Data(a), SonarConfig.Data(b)) && JsonNode.DeepEquals(SonarConfig.DefaultData(a), SonarConfig.DefaultData(b));

    private async Task WriteAsync(string vad, CancellationToken ct)
    {
        string body;
        lock (_gate)
        {
            if (_slots[vad].Config is not { } config) return;
            body = config.ToJsonString();
        }
        await _client.PutAsync("/configs", body, ct).ConfigureAwait(false);
    }

    private void OnWriteFailed(string vad, Exception ex)
    {
        if (ex is EqUnavailableException) _log.Debug($"Sonar EQ write for {vad} skipped: {ex.Message}");
        else _log.Warn($"Sonar EQ write for {vad} failed: {ex.Message}");
        lock (_gate)
        {
            // Let the next read take the server's truth instead of retrying a write Sonar refused.
            var slot = _slots[vad];
            slot.FetchedAt = 0;
            slot.LastEditAt = 0;
        }
    }

    private bool IsHeld(Slot slot) =>
        (slot.LastEditAt != 0 && _time.GetElapsedTime(slot.LastEditAt) < HoldWindow) || _writer.IsBusy(slot.Vad);

    private long NextVersion() => ++_versionSeed;

    private EqState StateOf(Slot slot) => SonarConfig.ToState(slot.Vad, slot.Config!, slot.Version);

    private Slot SlotFor(string channelId) =>
        _slots.TryGetValue(channelId, out var s) ? s : throw new ArgumentException($"'{channelId}' is not a Sonar channel (game, chatRender, media, aux, chatCapture).", nameof(channelId));

    public async ValueTask DisposeAsync() => await _writer.DisposeAsync().ConfigureAwait(false);
}
