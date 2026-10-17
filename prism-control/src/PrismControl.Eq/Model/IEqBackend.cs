namespace PrismControl.Eq;

/// <summary>
/// One EQ backend (research eq.md §8): SteelSeries Sonar (default) or Equalizer APO. Implementations are thread-safe;
/// every action shares the one instance owned by <see cref="EqService"/>.
/// <para>
/// Edits are optimistic: <see cref="SetGain"/>, <see cref="SetBand"/>, <see cref="SetEnabled"/> and <see cref="Reset"/>
/// update the local copy at once (return it for the dial frame) and queue a coalesced write: latest wins, 100 ms trailing,
/// 250 ms max wait, one write in flight. Call <see cref="GetStateAsync"/> first (it loads the channel); the edit methods
/// throw <see cref="EqUnavailableException"/> when nothing is loaded.
/// </para>
/// </summary>
public interface IEqBackend : IAsyncDisposable
{
    /// <summary>"sonar" or "apo".</summary>
    string Id { get; }
    string DisplayName { get; }
    EqCapabilities Capabilities { get; }
    /// <summary>The last known availability (no I/O).</summary>
    EqAvailability Availability { get; }

    /// <summary>Installed? running? attached? Does I/O (respecting a retry backoff while unavailable).</summary>
    Task<EqAvailability> ProbeAsync(CancellationToken ct);

    Task<IReadOnlyList<EqChannel>> GetChannelsAsync(CancellationToken ct);

    /// <summary>The channel's state; refreshes when the cached copy is older than <paramref name="maxAge"/>, unless a local edit is in progress.</summary>
    Task<EqState> GetStateAsync(string channelId, TimeSpan maxAge, CancellationToken ct);

    /// <summary>The cached state, without I/O (null if never loaded).</summary>
    EqState? TryGetCachedState(string channelId);

    Task<IReadOnlyList<EqPreset>> GetPresetsAsync(string channelId, TimeSpan maxAge, CancellationToken ct);

    /// <summary>Switches the channel's preset. Throws <see cref="EqPresetMissingException"/> if it no longer exists.</summary>
    Task<EqState> SelectPresetAsync(string channelId, string presetId, CancellationToken ct);

    EqState SetGain(string channelId, EqTarget target, double gainDb);
    EqState SetBand(string channelId, int bandIndex, EqBandPatch patch);
    EqState SetEnabled(string channelId, EqToggleScope scope, bool enabled);
    /// <summary>Restores values from the preset's defaults (Sonar defaultData; APO the active preset).</summary>
    EqState Reset(string channelId, EqResetScope scope, EqTarget target);

    /// <summary>Puts back the channel exactly as it was before Prism Control's first edit in this session.</summary>
    Task<bool> RevertSessionAsync(string channelId, CancellationToken ct);

    /// <summary>Writes every pending edit now (willDisappear, backend switch, shutdown).</summary>
    Task FlushAsync(CancellationToken ct);

    /// <summary>One refresh step (cheap). Raises <see cref="Changed"/> for changes made outside Prism Control.</summary>
    Task PollAsync(CancellationToken ct);

    /// <summary>How long the service waits before the next <see cref="PollAsync"/> (longer while unavailable).</summary>
    TimeSpan NextPollDelay { get; }

    event EventHandler<EqChangedEventArgs>? Changed;
    event EventHandler<EqAvailability>? AvailabilityChanged;
}
