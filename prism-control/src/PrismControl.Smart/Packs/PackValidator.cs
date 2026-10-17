namespace PrismControl.Smart.Packs;

/// <summary>
/// The runtime half of packs/tools/validate.mjs: reference checks, the input policy and layout fit. Items that would be
/// unsafe or broken are DROPPED (with an error) so the rest of the pack still works; a pack that breaks the hard
/// policy rule (online-competitive with Sight or closed-loop allowed) is rejected outright.
/// </summary>
public static class PackValidator
{
    /// <summary>Device ids a layout proposal may name, with their key grid and dial facts.</summary>
    internal static readonly Dictionary<string, (int Cols, int Rows, int Dials, int Layers, string[] Screen)> ProposalDevices = new(StringComparer.Ordinal)
    {
        ["galleon-100-sd"] = (3, 4, 2, 2, ["TL", "TR", "BL", "BR"]),
        ["stream-deck-plus"] = (4, 2, 4, 1, ["0", "1", "2", "3"]),
        ["stream-deck-xl"] = (8, 4, 0, 1, []),
        ["stream-deck"] = (5, 3, 0, 1, []),
        ["stream-deck-mini"] = (3, 2, 0, 1, []),
        ["stream-deck-neo"] = (4, 2, 0, 1, []),
    };

    public static ContextPack? Validate(ContextPack pack, List<PackProblem> problems)
    {
        var where = "pack " + pack.Id;
        void E(string w, string m) => problems.Add(new(ProblemSeverity.Error, w, m));
        void W(string w, string m) => problems.Add(new(ProblemSeverity.Warning, w, m));

        // ---- the hard rule (DECISIONS.md, games scope): online-competitive = display only, never Sight.
        if (pack.Policy.Class == PolicyClass.OnlineCompetitive && (pack.Policy.SightAllowed || pack.Policy.ClosedLoopAllowed))
        {
            E(where, "online-competitive packs must forbid Sight and closed-loop; pack rejected");
            return null;
        }
        if (pack.Policy.ClosedLoopAllowed && !pack.Policy.SightAllowed)
            W(where, "closedLoop is allowed but Sight is forbidden: closed-loop verbs cannot run");

        // ---- contexts
        var contexts = Dedupe(pack.Contexts, c => c.Id, "context", where, problems);
        var ctxIds = contexts.Select(c => c.Id).ToHashSet(StringComparer.Ordinal);
        var defaults = contexts.Where(c => c.IsDefault).ToList();
        if (defaults.Count == 0)
        {
            W(where, $"no default context; \"{contexts[0].Id}\" is used");
            contexts[0] = contexts[0] with { IsDefault = true };
        }
        else if (defaults.Count > 1)
        {
            W(where, $"{defaults.Count} default contexts; \"{defaults[0].Id}\" wins");
            for (var i = 0; i < contexts.Count; i++)
                if (contexts[i].IsDefault && contexts[i].Id != defaults[0].Id) contexts[i] = contexts[i] with { IsDefault = false };
        }
        for (var i = 0; i < contexts.Count; i++)
        {
            var c = contexts[i];
            if (c.Parent is not null && !ctxIds.Contains(c.Parent))
            {
                E($"{where} context {c.Id}", $"parent \"{c.Parent}\" not found (ignored)");
                contexts[i] = c = c with { Parent = null };
            }
            // Sight detectors only where the policy allows Sight.
            if (!pack.Policy.SightAllowed && c.Detect.Detectors.Any(d => d.Type == DetectorType.Sight))
            {
                E($"{where} context {c.Id}", "Sight detectors in a pack whose policy forbids Sight (removed)");
                var kept = c.Detect.Detectors.Where(d => d.Type != DetectorType.Sight).ToList();
                contexts[i] = c with { Detect = kept.Count > 0 ? c.Detect with { Detectors = kept } : new DetectGroup(false, [new Detector(DetectorType.Always, null, null, null, null, null, null, Negate: true)]) };
            }
        }
        bool CtxOk(string c) => c == "*" || ctxIds.Contains(c);

        // ---- readouts first (verbs reference them)
        var readouts = new List<PackReadout>();
        foreach (var r in Dedupe(pack.Readouts, r => r.Id, "readout", where, problems))
        {
            var w = $"{where} readout {r.Id}";
            if (r.Contexts.FirstOrDefault(c => !CtxOk(c)) is { } bad) { E(w, $"context \"{bad}\" not found (readout dropped)"); continue; }
            if (r.Source.Kind == ReadoutSourceKind.Sight && !pack.Policy.SightAllowed) { E(w, "Sight readout in a pack whose policy forbids Sight (dropped)"); continue; }
            if (r.Source.Kind == ReadoutSourceKind.Sight && r.Source.Region is null) { E(w, "Sight readout without a region (dropped)"); continue; }
            readouts.Add(r);
        }
        var readoutIds = readouts.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);

        // ---- verbs
        var regionIds = pack.SightRegions.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        var verbs = new List<PackVerb>();
        foreach (var v in Dedupe(pack.Verbs, v => v.Id, "verb", where, problems))
        {
            var w = $"{where} verb {v.Id}";
            if (v.Contexts.FirstOrDefault(c => !CtxOk(c)) is { } bad) { E(w, $"context \"{bad}\" not found (verb dropped)"); continue; }
            if (BindingProblem(pack, v.Binding) is { } bp) { E(w, bp + " (verb dropped)"); continue; }
            var alts = v.AltBindings.Where(b => BindingProblem(pack, b) is null).ToList();
            if (alts.Count != v.AltBindings.Count) W(w, "an alternative binding breaks the policy and was dropped");
            var stateReadout = v.StateReadout;
            if (stateReadout is not null && !readoutIds.Contains(stateReadout)) { W(w, $"stateReadout \"{stateReadout}\" not found (state shown as unknown)"); stateReadout = null; }
            if (v.Category == VerbCategory.Toggle && stateReadout is null) W(w, "toggle without stateReadout (state will be a guess)");
            foreach (var region in SightRegionsOf(v.Binding))
                if (!regionIds.Contains(region)) W(w, $"Sight region \"{region}\" is not declared in sightRegions");
            verbs.Add(v with { AltBindings = alts, StateReadout = stateReadout });
        }
        var verbIds = verbs.Select(v => v.Id).ToHashSet(StringComparer.Ordinal);

        // ---- controls
        var controls = new List<PackControl>();
        foreach (var c in Dedupe(pack.Controls, c => c.Id, "control", where, problems))
        {
            var w = $"{where} control {c.Id}";
            if (c.Contexts.FirstOrDefault(x => !CtxOk(x)) is { } bad) { E(w, $"context \"{bad}\" not found (control dropped)"); continue; }
            if ((BindingProblem(pack, c.Turn.Left) ?? BindingProblem(pack, c.Turn.Right)) is { } bp) { E(w, bp + " (control dropped)"); continue; }
            var push = c.PushVerb;
            if (push is not null && !verbIds.Contains(push)) { E(w, $"push verb \"{push}\" not found (push disabled)"); push = null; }
            var ro = c.Readout;
            if (ro is not null && !readoutIds.Contains(ro)) { W(w, $"readout \"{ro}\" not found"); ro = null; }
            controls.Add(c with { PushVerb = push, Readout = ro });
        }
        var controlIds = controls.Select(c => c.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var r in readouts.Where(r => r.Source.Kind == ReadoutSourceKind.Counted && r.Source.Control is { } ctl && !controlIds.Contains(ctl)))
            W($"{where} readout {r.Id}", $"counted control \"{r.Source.Control}\" not found");

        // ---- layout proposals
        var effective = pack with { Contexts = contexts, Verbs = verbs, Controls = controls, Readouts = readouts };
        var proposals = new List<LayoutProposal>();
        foreach (var l in pack.Layouts)
        {
            var w = $"{where} layout {l.Device}/{l.Context}";
            var err = LayoutProblem(effective, l);
            if (err is not null) { E(w, err + " (proposal dropped; the generator lays this context out by zones)"); continue; }
            if (proposals.Any(p => p.Device == l.Device && p.Context == l.Context)) { W(w, "duplicate proposal (later wins)"); proposals.RemoveAll(p => p.Device == l.Device && p.Context == l.Context); }
            proposals.Add(l);
        }
        return effective with { Layouts = proposals };
    }

    /// <summary>Why a binding may not exist in this pack (policy), or null.</summary>
    internal static string? BindingProblem(ContextPack pack, Binding b)
    {
        if (b is MacroBinding m) return m.Steps.Select(s => BindingProblem(pack, s)).FirstOrDefault(p => p is not null);
        if (pack.IsDisplayOnly && b.SendsInput) return $"{b.Kind} sends input in a display-only pack";
        if (b is ClosedLoopBinding && !pack.Policy.AllowsClosedLoop) return "closedLoop needs a safe-offline pack that allows Sight and closed-loop";
        if (b is SightClickBinding or SightAdjustBinding && !pack.Policy.AllowsClosedLoop) return $"{b.Kind} needs a safe-offline pack that allows Sight and closed-loop";
        return null;
    }

    internal static IEnumerable<string> SightRegionsOf(Binding b) => b switch
    {
        ClosedLoopBinding c => c.StepSight is null ? [c.Sight] : [c.Sight, c.StepSight],
        SightClickBinding s => [s.Sight],
        SightAdjustBinding s => [s.Sight],
        MacroBinding m => m.Steps.SelectMany(SightRegionsOf),
        _ => [],
    };

    private static string? LayoutProblem(ContextPack pack, LayoutProposal l)
    {
        if (!ProposalDevices.TryGetValue(l.Device, out var dev)) return $"unknown device \"{l.Device}\"";
        if (l.Context != "*" && pack.FindContext(l.Context) is null) return $"context \"{l.Context}\" not found";
        var seen = new HashSet<(int, int)>();
        foreach (var k in l.Keys)
        {
            if (k.X < 0 || k.X >= dev.Cols || k.Y < 0 || k.Y >= dev.Rows) return $"key {k.X},{k.Y} is outside the {dev.Cols}×{dev.Rows} grid";
            if (!seen.Add((k.X, k.Y))) return $"two verbs on key {k.X},{k.Y}";
            var v = pack.FindVerb(k.Verb);
            if (v is null) return $"verb \"{k.Verb}\" not found";
            if (l.Context != "*" && pack.ValidityTier(v.Contexts, l.Context) < 0) return $"verb \"{k.Verb}\" is not available in context \"{l.Context}\"";
        }
        var dials = new HashSet<(int, int)>();
        foreach (var d in l.Dials)
        {
            if (d.Dial < 0 || d.Dial >= dev.Dials) return $"dial {d.Dial} does not exist on {l.Device}";
            if (d.Layer < 0 || d.Layer >= dev.Layers) return $"dial layer {d.Layer} does not exist on {l.Device}";
            if (!dials.Add((d.Dial, d.Layer))) return $"two controls on dial {d.Dial} layer {d.Layer}";
            var c = pack.FindControl(d.Control);
            if (c is null) return $"control \"{d.Control}\" not found";
            if (l.Context != "*" && pack.ValidityTier(c.Contexts, l.Context) < 0) return $"control \"{d.Control}\" is not available in context \"{l.Context}\"";
        }
        var slots = new HashSet<string>(StringComparer.Ordinal);
        foreach (var s in l.Screen)
        {
            if (!dev.Screen.Contains(s.Slot)) return $"screen slot \"{s.Slot}\" does not exist on {l.Device}";
            if (!slots.Add(s.Slot)) return $"two readouts on screen slot {s.Slot}";
            if (pack.FindReadout(s.Readout) is null) return $"readout \"{s.Readout}\" not found";
        }
        return null;
    }

    private static List<T> Dedupe<T>(IEnumerable<T> items, Func<T, string> id, string what, string where, List<PackProblem> problems)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var list = new List<T>();
        foreach (var x in items)
        {
            if (seen.Add(id(x))) list.Add(x);
            else problems.Add(new(ProblemSeverity.Error, where, $"duplicate {what} id \"{id(x)}\" (the first one is used)"));
        }
        return list;
    }
}
