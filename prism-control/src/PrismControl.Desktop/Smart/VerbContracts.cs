using System.Text.Json.Nodes;

namespace PrismControl.Desktop;

// Smart Deck contract (owned by SD1, team Prism Play). Additive: nothing else in Desktop depends on it.
// Modules publish verbs (things a Smart key can run) and readouts (values a Smart key/widget can show) through an
// IVerbProvider registered in the process-wide IVerbRegistry; context packs reference them with
// { "kind": "module", "verb": "<module>.<…>" } bindings and { "kind": "module", "field": "<module>.<…>" } readouts and
// detectors. See aaa-prism-play/sd1/NOTES.md § IVerbRegistry.

/// <summary>A verb a module can run for the Smart Deck (one key's worth of behavior).</summary>
public sealed record VerbDescriptor
{
    /// <summary>Module-prefixed dotted camelCase, stable forever: <c>browser.media.toggle</c>, <c>windows.window.topmost</c>.</summary>
    public required string Id { get; init; }
    /// <summary>At most 12 characters (fits a key).</summary>
    public required string Label { get; init; }
    public string? LongLabel { get; init; }
    /// <summary>A Prism Deck glyph id (e.g. <c>play-pause</c>); unknown names render as a lettered tile.</summary>
    public string Glyph { get; init; } = "";
    /// <summary>1–3 letters for the lettered tile.</summary>
    public string? Monogram { get; init; }
    /// <summary>Pack vocabulary: primary · tool · mode · nav · camera · system · toggle · readout.</summary>
    public string Category { get; init; } = "primary";
    /// <summary>0–100; small decks keep the highest.</summary>
    public int Priority { get; init; } = 50;
    /// <summary><c>safe</c> · <c>confirm</c> (hold / arm-then-push) · <c>never-auto</c> (only a direct press runs it).</summary>
    public string Safety { get; init; } = "safe";
    /// <summary>For toggles: the readout id (of this provider) that reports the true state.</summary>
    public string? StateReadout { get; init; }
}

/// <summary>A value a module can show on a Smart key or screen widget.</summary>
public sealed record ReadoutDescriptor
{
    /// <summary>Module-prefixed dotted id: <c>browser.site.host</c>, <c>windows.window.topmost</c>.</summary>
    public required string Id { get; init; }
    public required string Label { get; init; }
    public string? Unit { get; init; }
    /// <summary>Optional format like <c>{value}°</c>.</summary>
    public string? Format { get; init; }
    /// <summary>number · gauge · horizon · bar · meter · text · list · art · badge · state · graph.</summary>
    public string Widget { get; init; } = "text";
    /// <summary><c>public</c> or <c>streamer-hide</c> (hidden in streamer-safe mode).</summary>
    public string Privacy { get; init; } = "public";
    public double? RangeMin { get; init; }
    public double? RangeMax { get; init; }
}

/// <summary>How much a value can be trusted (drawn differently on the deck).</summary>
public enum ReadoutConfidence
{
    /// <summary>Measured just now from the source.</summary>
    Observed,
    /// <summary>Derived or counted (our own steps, a file the app writes on save).</summary>
    Inferred,
    /// <summary>Was observed, but too long ago.</summary>
    Stale,
    /// <summary>No value.</summary>
    Unknown,
}

/// <summary>One readout value. Exactly one of Number / Text / State is usually set; Fields carries multi-value readouts (E/F/N).</summary>
public sealed record ReadoutValue
{
    public double? Number { get; init; }
    public string? Text { get; init; }
    public bool? State { get; init; }
    /// <summary>Named parts of a multi-value readout (e.g. excitement/fear/nausea), as strings.</summary>
    public IReadOnlyDictionary<string, string>? Fields { get; init; }
    public ReadoutConfidence Confidence { get; init; } = ReadoutConfidence.Observed;
    /// <summary>When it was observed (UTC).</summary>
    public DateTimeOffset At { get; init; }

    public static ReadoutValue Unknown { get; } = new() { Confidence = ReadoutConfidence.Unknown };
}

/// <summary>Why a verb can't run right now (pack vocabulary for the unavailable face).</summary>
public enum VerbAvailability { Ready, ModuleMissing, NotConnected, NothingSelected, PermissionNeeded, Busy, Unavailable }

public sealed record VerbStatus(VerbAvailability Availability, string? Hint = null)
{
    public static VerbStatus Ready { get; } = new(VerbAvailability.Ready);
    public bool IsReady => Availability == VerbAvailability.Ready;
}

/// <summary>The deck gesture behind an invocation.</summary>
public enum VerbGestureKind { KeyPress, KeyHold, DialPush, DialTurn }

/// <summary>
/// One call of a verb. Smart Deck only invokes verbs in direct response to the user's own key/dial gesture, so
/// <see cref="DirectGesture"/> is true for every call it makes; a provider must refuse <c>never-auto</c> verbs otherwise.
/// </summary>
public sealed record VerbInvocation
{
    public required string VerbId { get; init; }
    public JsonObject? Args { get; init; }
    public VerbGestureKind Gesture { get; init; } = VerbGestureKind.KeyPress;
    /// <summary>Signed dial ticks for <see cref="VerbGestureKind.DialTurn"/>.</summary>
    public int Ticks { get; init; }
    public bool DirectGesture { get; init; } = true;
    /// <summary>The window the Smart context matched (0 when none): act on this, not on whatever is in front.</summary>
    public nint TargetWindow { get; init; }
}

public sealed record VerbResult(bool Ok, string? Message = null)
{
    public static VerbResult Done { get; } = new(true);
    public static VerbResult Failed(string message) => new(false, message);
}

/// <summary>
/// A module's verbs and readouts for the Smart Deck. Implementations must be thread-safe; <see cref="GetStatus"/> and
/// <see cref="TryReadReadout"/> are called on render paths, so they must be cheap (no I/O, no blocking).
/// </summary>
public interface IVerbProvider
{
    /// <summary>The module name, also the id prefix of every verb and readout (<c>browser</c>, <c>windows</c>, <c>ai</c>).</summary>
    string Module { get; }
    IReadOnlyList<VerbDescriptor> Verbs { get; }
    IReadOnlyList<ReadoutDescriptor> Readouts { get; }
    VerbStatus GetStatus(string verbId);
    /// <summary>A readout value or a detector field (<c>browser.site.host</c>); false when the id is unknown.</summary>
    bool TryReadReadout(string readoutId, out ReadoutValue value);
    Task<VerbResult> InvokeAsync(VerbInvocation invocation, CancellationToken ct = default);
    /// <summary>Raised (on any thread) when verbs, statuses or readout values changed. Coalesce: at most ~10 Hz.</summary>
    event Action? Changed;
}

/// <summary>The process-wide registry of verb providers. Get it with <see cref="VerbRegistry.GetOrCreate"/>.</summary>
public interface IVerbRegistry
{
    /// <summary>Adds a provider, replacing any provider of the same <see cref="IVerbProvider.Module"/>.</summary>
    void Register(IVerbProvider provider);
    void Unregister(IVerbProvider provider);
    IReadOnlyList<IVerbProvider> Providers { get; }
    /// <summary>Finds the provider of a module-prefixed verb id (the prefix before the first dot names the module).</summary>
    bool TryResolveVerb(string verbId, out IVerbProvider provider, out VerbDescriptor descriptor);
    /// <summary>Reads a module-prefixed readout or field.</summary>
    bool TryReadReadout(string readoutId, out ReadoutValue value);
    /// <summary>A provider was added/removed, or one raised Changed (any thread).</summary>
    event Action? Changed;
}

/// <summary>Thread-safe <see cref="IVerbRegistry"/>. One per plugin process, shared through IModuleContext.Services.</summary>
public sealed class VerbRegistry : IVerbRegistry
{
    private static readonly object Gate = new();
    private readonly object _lock = new();
    private readonly Dictionary<string, IVerbProvider> _byModule = new(StringComparer.Ordinal);
    private readonly Dictionary<IVerbProvider, Action> _relays = [];

    /// <summary>
    /// The process-wide registry: created by whichever module asks first (module order is not defined) and registered in
    /// <paramref name="services"/> as both <see cref="VerbRegistry"/> and <see cref="IVerbRegistry"/>.
    /// </summary>
    public static IVerbRegistry GetOrCreate(PrismControl.Core.Hosting.IServiceRegistry services)
    {
        ArgumentNullException.ThrowIfNull(services);
        lock (Gate)
        {
            if (services.TryGet<IVerbRegistry>(out var existing)) return existing;
            var r = new VerbRegistry();
            services.Add(r);
            services.Add<IVerbRegistry>(r);
            return r;
        }
    }

    public event Action? Changed;

    public IReadOnlyList<IVerbProvider> Providers
    {
        get { lock (_lock) return [.. _byModule.Values.OrderBy(p => p.Module, StringComparer.Ordinal)]; }
    }

    public void Register(IVerbProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);
        if (string.IsNullOrWhiteSpace(provider.Module) || provider.Module.Contains('.'))
            throw new ArgumentException("A provider's Module must be a non-empty name without dots.", nameof(provider));
        lock (_lock)
        {
            if (_byModule.TryGetValue(provider.Module, out var old) && !ReferenceEquals(old, provider)) Detach(old);
            _byModule[provider.Module] = provider;
            if (!_relays.ContainsKey(provider))
            {
                Action relay = () => Changed?.Invoke();
                _relays[provider] = relay;
                provider.Changed += relay;
            }
        }
        Changed?.Invoke();
    }

    public void Unregister(IVerbProvider provider)
    {
        lock (_lock)
        {
            if (!_byModule.TryGetValue(provider.Module, out var cur) || !ReferenceEquals(cur, provider)) return;
            _byModule.Remove(provider.Module);
            Detach(provider);
        }
        Changed?.Invoke();
    }

    private void Detach(IVerbProvider p)
    {
        if (_relays.Remove(p, out var relay)) p.Changed -= relay;
    }

    public bool TryResolveVerb(string verbId, out IVerbProvider provider, out VerbDescriptor descriptor)
    {
        provider = null!;
        descriptor = null!;
        if (!TryProvider(verbId, out var p)) return false;
        foreach (var v in p.Verbs)
        {
            if (string.Equals(v.Id, verbId, StringComparison.Ordinal))
            {
                provider = p;
                descriptor = v;
                return true;
            }
        }
        return false;
    }

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        value = ReadoutValue.Unknown;
        if (!TryProvider(readoutId, out var p)) return false;
        try { return p.TryReadReadout(readoutId, out value); }
        catch { value = ReadoutValue.Unknown; return false; }
    }

    private bool TryProvider(string id, out IVerbProvider provider)
    {
        provider = null!;
        if (string.IsNullOrEmpty(id)) return false;
        var dot = id.IndexOf('.');
        if (dot <= 0) return false;
        lock (_lock) return _byModule.TryGetValue(id[..dot], out provider!);
    }
}
