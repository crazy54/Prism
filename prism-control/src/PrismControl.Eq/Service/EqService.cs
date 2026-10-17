using PrismControl.Core.Hosting;
using PrismControl.Core.PropertyInspector;
using PrismControl.Eq.Apo;
using PrismControl.Eq.Infrastructure;
using PrismControl.Eq.Sonar;

namespace PrismControl.Eq;

/// <summary>The "eq" global-settings section (owned by this module).</summary>
public sealed class EqGlobalSettings
{
    public const string Section = "eq";

    /// <summary>The PI field that edits <see cref="Backend"/> directly in the global section ("global:eq.backend").</summary>
    public static string BackendField => PiForm.Global(Section, "backend");

    /// <summary>"sonar" (default) or "apo".</summary>
    public string Backend { get; set; } = EqService.Sonar;
}

/// <summary>
/// The one EQ service every action shares (registered by <see cref="EqModule"/>; actions use
/// <c>Services.Get&lt;EqService&gt;()</c>). It owns the backend choice (the "eq" global-settings section), one demand-driven
/// poll loop for the whole plugin (it runs only while an EQ action is visible), and re-raises backend events.
/// Thread-safe. Event handlers run on thread-pool threads: actions must <c>Post</c> back to their mailbox.
/// </summary>
public sealed class EqService : IAsyncDisposable
{
    public const string Sonar = "sonar", Apo = "apo";

    private readonly object _gate = new();
    private readonly Func<string, IEqBackend> _factory;
    private readonly Dictionary<string, IEqBackend> _backends = new();
    private readonly ILog _log;
    private readonly DemandLoop _eqLoop;
    private readonly DemandLoop? _mixerLoop;
    private IEqBackend _current;

    /// <param name="factory">Creates a backend for "sonar" or "apo" (called at most once per id).</param>
    /// <param name="mixer">The Sonar mixer (volume/ChatMix); null when Sonar is not wired (tests).</param>
    /// <param name="writes">The safe-mode gate the backends were built with (default: from PRISM_CONTROL_SAFE_MODE).</param>
    public EqService(Func<string, IEqBackend> factory, ILog log, TimeProvider time, string? initialBackend = null, SonarMixer? mixer = null, CancellationToken shutdown = default,
        EqWriteGate? writes = null)
    {
        _factory = factory;
        _log = log;
        Mixer = mixer;
        Time = time;
        Writes = writes ?? EqWriteGate.FromEnvironment(log);
        _current = Create(Normalize(initialBackend));
        _eqLoop = new DemandLoop("EQ", time, ct => Backend.PollAsync(ct), () => Backend.NextPollDelay, log, shutdown);
        if (mixer is not null)
        {
            _mixerLoop = new DemandLoop("Sonar mixer", time, mixer.PollAsync, () => mixer.NextPollDelay, log, shutdown);
            mixer.Changed += (_, ch) => MixerChanged?.Invoke(this, ch);
            mixer.Client.AvailabilityChanged += (_, a) => MixerAvailabilityChanged?.Invoke(this, a);
        }
    }

    public TimeProvider Time { get; }
    /// <summary>Safe mode for every EQ write (Sonar and APO); its counters say what would have been written.</summary>
    public EqWriteGate Writes { get; }
    public IEqBackend Backend { get { lock (_gate) return _current; } }
    public string BackendId => Backend.Id;
    public SonarMixer? Mixer { get; }

    /// <summary>A channel changed (state may be null when only its on/off status is known).</summary>
    public event EventHandler<EqChangedEventArgs>? Changed;
    public event EventHandler<EqAvailability>? AvailabilityChanged;
    /// <summary>The user switched between Sonar and Equalizer APO.</summary>
    public event EventHandler? BackendChanged;
    public event EventHandler<string>? MixerChanged;
    public event EventHandler<EqAvailability>? MixerAvailabilityChanged;

    public static string Normalize(string? id) => (id ?? "").Trim().ToLowerInvariant() switch
    {
        "apo" or "equalizerapo" or "equalizer apo" => Apo,
        _ => Sonar,
    };

    public static string DisplayName(string id) => Normalize(id) == Apo ? "Equalizer APO" : "SteelSeries Sonar";

    /// <summary>Switches the backend (idempotent). Pending edits of the old backend are flushed in the background.</summary>
    public void SelectBackend(string? id)
    {
        var target = Normalize(id);
        IEqBackend old;
        lock (_gate)
        {
            if (_current.Id == target) return;
            old = _current;
            _current = Create(target);
        }
        _log.Info($"EQ backend: {DisplayName(target)}.");
        _ = old.FlushAsync(CancellationToken.None).ContinueWith(t => _log.Debug($"EQ flush on switch: {t.Exception?.GetBaseException().Message}"), TaskContinuationOptions.OnlyOnFaulted);
        _eqLoop.WakeNow();
        BackendChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>The APO backend, created on demand (for the PI's Attach/Detach buttons even before switching).</summary>
    public ApoEqBackend? ApoBackend { get { lock (_gate) return Create(Apo) as ApoEqBackend; } }

    /// <summary>Keeps the poll loop running while held (an EQ action is visible). Dispose to release.</summary>
    public IDisposable Watch() => _eqLoop.Acquire();

    /// <summary>Keeps the 1 Hz Sonar volume poll running while held.</summary>
    public IDisposable WatchMixer() => _mixerLoop?.Acquire() ?? new NoLease();

    /// <summary>Polls now instead of waiting (PI opened, an action appeared).</summary>
    public void PollSoon()
    {
        _eqLoop.WakeNow();
        _mixerLoop?.WakeNow();
    }

    /// <summary>
    /// The channel an action should use: an empty setting means the first active one; a set one must exist on the
    /// current backend. A channel that is gone (an unplugged APO device, a Sonar id on APO) is never swapped for another:
    /// that throws <see cref="EqUnavailableException"/> with <see cref="EqAvailabilityCode.ChannelMissing"/> (or the
    /// backend's own problem when it is down). Null when the backend lists no channel at all.
    /// </summary>
    public async Task<EqChannel?> ResolveChannelAsync(string? setting, CancellationToken ct)
    {
        var backend = Backend;
        var channels = await backend.GetChannelsAsync(ct).ConfigureAwait(false);
        if (channels.Count == 0) return null;
        if (string.IsNullOrWhiteSpace(setting)) return channels.FirstOrDefault(c => c.IsActive) ?? channels[0];
        if (channels.FirstOrDefault(c => string.Equals(c.Id, setting.Trim(), StringComparison.OrdinalIgnoreCase)) is { } match) return match;
        var a = backend.Availability;
        throw new EqUnavailableException(a.Available || a.IsTransient
            ? new EqAvailability(EqAvailabilityCode.ChannelMissing, $"This action's channel isn't available in {DisplayName(backend.Id)}. Pick another channel in its settings.",
                "Pick another in its settings.")
            : a);
    }

    private IEqBackend Create(string id)
    {
        lock (_gate)
        {
            if (_backends.TryGetValue(id, out var b)) return b;
            b = _factory(id);
            b.Changed += (s, e) => { if (ReferenceEquals(s, Backend)) Changed?.Invoke(this, e); };
            b.AvailabilityChanged += (s, a) => { if (ReferenceEquals(s, Backend)) AvailabilityChanged?.Invoke(this, a); };
            _backends[id] = b;
            return b;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _eqLoop.DisposeAsync().ConfigureAwait(false);
        if (_mixerLoop is not null) await _mixerLoop.DisposeAsync().ConfigureAwait(false);
        IEqBackend[] all;
        lock (_gate) all = [.. _backends.Values];
        foreach (var b in all)
        {
            try { await b.DisposeAsync().ConfigureAwait(false); }
            catch (Exception ex) { _log.Warn($"EQ backend {b.Id} dispose failed: {ex.Message}"); }
        }
        if (Mixer is not null) await Mixer.DisposeAsync().ConfigureAwait(false);
    }

    private sealed class NoLease : IDisposable { public void Dispose() { } }
}
