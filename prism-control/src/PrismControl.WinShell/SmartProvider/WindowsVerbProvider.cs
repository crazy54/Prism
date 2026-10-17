#if PRISM_DESKTOP
using PrismControl.Desktop;

namespace PrismControl.WinShell.SmartProvider;

/// <summary>One slice of the <c>windows</c> module's Smart Deck verbs and readouts (W1's today; W2 adds its own part).</summary>
public interface IWindowsVerbPart
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
/// The single <c>windows</c> provider in the process-wide <see cref="IVerbRegistry"/> (one provider per module name; a
/// second registration would replace this one). A composite, the AI module's pattern (AiVerbProvider): W1's part is
/// added by <see cref="WindowsSmartVerbs.Register"/>; W2's verbs (power, toggles, capture, kill app, notifications)
/// join with <see cref="Add"/> instead of registering their own <c>windows</c> provider. Changed is coalesced to ≤ 10 Hz.
/// </summary>
public sealed class WindowsVerbProvider(TimeProvider time) : IVerbProvider
{
    public static readonly TimeSpan Coalesce = TimeSpan.FromMilliseconds(100);
    private readonly object _gate = new();
    private readonly List<IWindowsVerbPart> _parts = [];
    private ITimer? _pending;

    public string Module => WinShellModule.ModuleName;

    public event Action? Changed;

    /// <summary>The provider already registered (by W1 or W2, whoever came first), or a new registered one.</summary>
    public static WindowsVerbProvider GetOrRegister(IVerbRegistry registry, TimeProvider time)
    {
        lock (registry)
        {
            if (registry.Providers.FirstOrDefault(p => p.Module == WinShellModule.ModuleName) is WindowsVerbProvider existing) return existing;
            var p = new WindowsVerbProvider(time);
            registry.Register(p);
            return p;
        }
    }

    public void Add(IWindowsVerbPart part)
    {
        lock (_gate)
        {
            if (_parts.Contains(part)) return;
            _parts.Add(part);
        }
        part.Changed += Raise;
        Raise();
    }

    public void Remove(IWindowsVerbPart part)
    {
        lock (_gate) if (!_parts.Remove(part)) return;
        part.Changed -= Raise;
        Raise();
    }

    private IWindowsVerbPart[] Parts { get { lock (_gate) return [.. _parts]; } }

    public IReadOnlyList<VerbDescriptor> Verbs => [.. Parts.SelectMany(p => p.Verbs)];
    public IReadOnlyList<ReadoutDescriptor> Readouts => [.. Parts.SelectMany(p => p.Readouts)];

    public VerbStatus GetStatus(string verbId)
    {
        foreach (var p in Parts)
            if (p.GetStatus(verbId) is { } s) return s;
        return new VerbStatus(VerbAvailability.ModuleMissing, "not built yet");
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

    private void Raise()
    {
        lock (_gate)
        {
            if (_pending is not null) return;
            _pending = time.CreateTimer(_ =>
            {
                lock (_gate) { _pending?.Dispose(); _pending = null; }
                Changed?.Invoke();
            }, null, Coalesce, Timeout.InfiniteTimeSpan);
        }
    }
}
#endif
