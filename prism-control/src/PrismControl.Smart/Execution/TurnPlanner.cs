using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Execution;

/// <summary>One planned dial event: which side, how many presses (after acceleration, the cap and the clamp).</summary>
public sealed record TurnPlan(int Direction, int Presses, Binding Binding, int IntervalMs, string Why);

/// <summary>
/// Dial step semantics (README § Controls): one tick = one press at the slow end; for an event of |ticks| (the Galleon
/// aggregates fast spins up to ±12), the highest acceleration row with minTicks ≤ |ticks| sets presses per tick, capped by
/// maxPressesPerEvent. The clamp (review E1) applies only when the control's value is KNOWN (seeded from an observed or
/// inferred readout, or our own count of a counted control), and only in the direction of travel: a known value below
/// the minimum still turns up, and an unknown value is never clamped. Pure.
/// </summary>
public static class TurnPlanner
{
    /// <param name="current">The control's known value in the clamp's units, or null when it is not known (no clamp).</param>
    public static TurnPlan? Plan(PackControl control, int ticks, double? current)
    {
        if (ticks == 0) return null;
        var t = control.Turn;
        var dir = Math.Sign(ticks) * (t.Invert ? -1 : 1);
        var mag = Math.Abs(ticks);
        var row = t.Acceleration.Curve.Where(r => r.MinTicks <= mag).OrderByDescending(r => r.MinTicks).FirstOrDefault() ?? new AccelerationRow(1, 1);
        var presses = (int)Math.Round(mag * row.PressesPerTick, MidpointRounding.AwayFromZero);
        presses = Math.Clamp(presses, 1, t.Acceleration.MaxPressesPerEvent);
        var why = $"{ticks:+#;-#} tick(s) × {row.PressesPerTick:0.##} (row ≥{row.MinTicks})";
        if (presses == t.Acceleration.MaxPressesPerEvent && mag * row.PressesPerTick > presses) why += $", capped at {presses}";
        if (current is { } value && (t.ClampMin is not null || t.ClampMax is not null))
        {
            var lo = t.ClampMin ?? double.NegativeInfinity;
            var hi = t.ClampMax ?? double.PositiveInfinity;
            // Only the bound we are moving towards limits the turn.
            var room = dir > 0 ? hi - value : value - lo;
            if (t.Step.PerPress is { } unit and > 0)
            {
                var fit = (int)Math.Floor(room / unit + 1e-9);
                if (fit < presses)
                {
                    presses = Math.Max(0, fit);
                    why += ", clamped";
                }
            }
            else if (room <= 1e-9)
            {
                // No known step size (Chromium's zoom ladder): only "already at the end" can be known.
                presses = 0;
            }
            if (presses <= 0) return new TurnPlan(dir, 0, dir > 0 ? t.Right : t.Left, t.Acceleration.MinIntervalMs, "at the clamp");
        }
        return new TurnPlan(dir, presses, dir > 0 ? t.Right : t.Left, t.Acceleration.MinIntervalMs, why);
    }

    /// <summary>
    /// Several queued dial events (notches that arrived while a turn was still running), each planned with ITS OWN
    /// magnitude (review E2: eight slow notches are eight slow presses, not one 8-tick spin), the clamp carried from event
    /// to event, and the presses summed (opposite directions cancel). Null when nothing is left to press.
    /// </summary>
    public static TurnPlan? PlanBatch(PackControl control, IReadOnlyList<int> events, double? current)
    {
        var net = 0;
        var value = current;
        var unit = control.Turn.Step.PerPress;
        var parts = new List<string>();
        foreach (var ticks in events)
        {
            var p = Plan(control, ticks, value);
            if (p is null) continue;
            net += p.Direction * p.Presses;
            parts.Add(p.Presses == 0 ? "clamp" : $"{p.Direction * p.Presses:+#;-#}");
            if (value is { } v) value = unit is { } u && u > 0 ? v + p.Direction * p.Presses * u : (p.Presses > 0 ? null : v);
        }
        if (parts.Count == 0) return null;
        var t = control.Turn;
        var dir = Math.Sign(net);
        var why = events.Count == 1 ? null : $"{events.Count} events planned one by one ({string.Join(" ", parts)})";
        if (dir == 0) return new TurnPlan(events.Sum() >= 0 ? 1 : -1, 0, t.Right, t.Acceleration.MinIntervalMs, why ?? "at the clamp");
        var single = events.Count == 1 ? Plan(control, events[0], current) : null;
        return new TurnPlan(dir, Math.Abs(net), dir > 0 ? t.Right : t.Left, t.Acceleration.MinIntervalMs, why ?? single!.Why);
    }
}

/// <summary>Our own step counts per control (the <c>counted</c> readout source). Thread-safe.</summary>
public sealed class CountedSteps
{
    private readonly Dictionary<string, double> _values = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    private static string Key(string packId, string controlId) => packId + "/" + controlId;

    public double Get(string packId, string controlId) { lock (_gate) return _values.GetValueOrDefault(Key(packId, controlId)); }

    public void Add(string packId, string controlId, double delta) { lock (_gate) _values[Key(packId, controlId)] = _values.GetValueOrDefault(Key(packId, controlId)) + delta; }

    public void Reset(string packId, string controlId) { lock (_gate) _values.Remove(Key(packId, controlId)); }
}

/// <summary>
/// The last KNOWN value of each clamped control for the clamp (review E1): seeded from an observed/inferred readout and
/// carried forward by our own presses while no fresh reading comes in. A control that was never seeded has no value
/// (null), so it is never clamped. A push (reset/level) forgets it. Thread-safe.
/// </summary>
public sealed class KnownValues
{
    private readonly Dictionary<string, double> _values = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    private static string Key(string packId, string controlId) => packId + "/" + controlId;

    public double? Get(string packId, string controlId) { lock (_gate) return _values.TryGetValue(Key(packId, controlId), out var v) ? v : null; }

    public void Set(string packId, string controlId, double? value)
    {
        lock (_gate)
        {
            if (value is { } v && double.IsFinite(v)) _values[Key(packId, controlId)] = v;
            else _values.Remove(Key(packId, controlId));
        }
    }
}
