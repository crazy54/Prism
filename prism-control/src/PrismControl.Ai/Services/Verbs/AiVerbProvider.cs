using PrismControl.Desktop;

namespace PrismControl.Ai.Services.Verbs;

/// <summary>One slice of the <c>ai</c> module's verbs and readouts (AI2's apps + services today; AI1 can add a part later).</summary>
public interface IAiVerbPart
{
    IReadOnlyList<VerbDescriptor> Verbs { get; }
    IReadOnlyList<ReadoutDescriptor> Readouts { get; }
    /// <summary>Null when the id isn't this part's.</summary>
    VerbStatus? GetStatus(string verbId);
    bool TryReadReadout(string readoutId, out ReadoutValue value);
    /// <summary>Null when the id isn't this part's.</summary>
    Task<VerbResult>? InvokeAsync(VerbInvocation invocation, CancellationToken ct);
    event Action? Changed;
}

/// <summary>
/// The single <c>ai</c> provider in SD1's process-wide <see cref="IVerbRegistry"/> (one provider per module name; a second
/// registration would replace this one). It is a composite: AI2 adds its part in ServicesFeatures; AI1's future verbs join with
/// <see cref="Add"/> rather than registering their own <c>ai</c> provider (lead decision). <see cref="Changed"/> is coalesced to ≤ 10 Hz.
/// </summary>
public sealed class AiVerbProvider : IVerbProvider
{
    public static readonly TimeSpan Coalesce = TimeSpan.FromMilliseconds(100);
    private readonly object _gate = new();
    private readonly List<IAiVerbPart> _parts = [];
    private readonly TimeProvider _time;
    private ITimer? _pending;

    public AiVerbProvider(TimeProvider time) => _time = time;

    public string Module => "ai";

    public event Action? Changed;

    /// <summary>The provider already in the registry (when AI1 or AI2 registered first), or a new registered one.</summary>
    public static AiVerbProvider GetOrRegister(IVerbRegistry registry, TimeProvider time)
    {
        lock (registry)
        {
            if (registry.Providers.FirstOrDefault(p => p.Module == "ai") is AiVerbProvider existing) return existing;
            var p = new AiVerbProvider(time);
            registry.Register(p);
            return p;
        }
    }

    public void Add(IAiVerbPart part)
    {
        lock (_gate)
        {
            if (_parts.Contains(part)) return;
            _parts.Add(part);
        }
        part.Changed += Raise;
        Raise();
    }

    private IAiVerbPart[] Parts { get { lock (_gate) return [.. _parts]; } }

    public IReadOnlyList<VerbDescriptor> Verbs => Parts.SelectMany(p => p.Verbs).ToList();
    public IReadOnlyList<ReadoutDescriptor> Readouts => Parts.SelectMany(p => p.Readouts).ToList();

    public VerbStatus GetStatus(string verbId)
    {
        foreach (var p in Parts)
            if (p.GetStatus(verbId) is { } s) return s;
        return new VerbStatus(VerbAvailability.Unavailable, "unknown verb");
    }

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        foreach (var p in Parts)
            if (p.TryReadReadout(readoutId, out value)) return true;
        value = ReadoutValue.Unknown;
        return false;
    }

    public Task<VerbResult> InvokeAsync(VerbInvocation invocation, CancellationToken ct = default)
    {
        foreach (var p in Parts)
            if (p.InvokeAsync(invocation, ct) is { } t) return t;
        return Task.FromResult(VerbResult.Failed("unknown verb"));
    }

    /// <summary>Coalesces bursts (a status fetch, an app tick) into at most one Changed per 100 ms.</summary>
    private void Raise()
    {
        lock (_gate)
        {
            if (_pending is not null) return;
            _pending = _time.CreateTimer(_ =>
            {
                lock (_gate) { _pending?.Dispose(); _pending = null; }
                Changed?.Invoke();
            }, null, Coalesce, Timeout.InfiniteTimeSpan);
        }
    }
}
