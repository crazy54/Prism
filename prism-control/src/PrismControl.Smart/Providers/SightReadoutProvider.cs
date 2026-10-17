using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;

namespace PrismControl.Smart.Providers;

/// <summary>
/// SD2: Prism Sight's own state as readouts for any Smart slot or pack (<c>sight.state</c>, <c>sight.game</c>,
/// <c>sight.context</c>, <c>sight.recording</c>), read from Desktop's <see cref="ISightService"/> through the engine's
/// <see cref="ISmartSight"/> bridge (no reference to the Sight assembly). Read-only: there are no verbs.
/// <para>
/// A <c>sight.calibrate</c> verb is NOT offered: calibration capture starts only from a hold on the Sight Status key
/// (Sight's own gesture rules), and Desktop's <see cref="ISightControl"/> has no calibration call. If the Sight owner adds
/// one (taking a <see cref="GestureToken"/>), it belongs in a <c>sight</c> provider of the Sight module, which would then
/// replace this one (the registry keeps one provider per module name).
/// </para>
/// </summary>
public sealed class SightReadoutProvider(ISmartSight sight, TimeProvider time) : IVerbProvider
{
    public string Module => "sight";

    public IReadOnlyList<VerbDescriptor> Verbs { get; } = [];

    public IReadOnlyList<ReadoutDescriptor> Readouts { get; } =
    [
        new ReadoutDescriptor { Id = "sight.state", Label = "SIGHT", Widget = "badge" },
        new ReadoutDescriptor { Id = "sight.game", Label = "GAME", Widget = "text" },
        new ReadoutDescriptor { Id = "sight.context", Label = "SEES", Widget = "text" },
        new ReadoutDescriptor { Id = "sight.recording", Label = "REC", Widget = "state" },
    ];

    public event Action? Changed { add => sight.Changed += value; remove => sight.Changed -= value; }

    public VerbStatus GetStatus(string verbId) => new(VerbAvailability.Unavailable, "Prism Sight publishes readouts only.");

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        value = ReadoutValue.Unknown;
        if (readoutId is not ("sight.state" or "sight.game" or "sight.context" or "sight.recording")) return false;
        if (!sight.IsAvailable) return true; // known id, no value: "not installed"
        var s = sight.Current;
        var at = s.At == DateTimeOffset.UnixEpoch ? time.GetUtcNow() : s.At;
        value = readoutId switch
        {
            "sight.state" => new ReadoutValue { Text = Word(s.State), Number = (int)s.State, At = at },
            "sight.game" => s.GameId is null ? ReadoutValue.Unknown : new ReadoutValue { Text = s.GameId.ToUpperInvariant(), At = at },
            "sight.context" => s.Context.Id is null ? ReadoutValue.Unknown
                : new ReadoutValue { Text = s.Context.Label ?? s.Context.Id, At = s.Context.Since ?? at, Confidence = Confidence(s.Context.Confidence) },
            _ => new ReadoutValue { State = s.Recording, At = at },
        };
        return true;
    }

    public Task<VerbResult> InvokeAsync(VerbInvocation invocation, CancellationToken ct = default) =>
        Task.FromResult(VerbResult.Failed("Prism Sight publishes readouts only."));

    public static string Word(SightRunState s) => s switch
    {
        SightRunState.Running => "READING",
        SightRunState.Paused => "PAUSED",
        SightRunState.Blocked => "BLOCKED",
        SightRunState.Error => "ERROR",
        SightRunState.Off => "OFF",
        _ => "IDLE",
    };

    private static ReadoutConfidence Confidence(SightConfidence c) => c switch
    {
        SightConfidence.Observed => ReadoutConfidence.Observed,
        SightConfidence.Inferred => ReadoutConfidence.Inferred,
        SightConfidence.Stale => ReadoutConfidence.Stale,
        _ => ReadoutConfidence.Unknown,
    };
}
