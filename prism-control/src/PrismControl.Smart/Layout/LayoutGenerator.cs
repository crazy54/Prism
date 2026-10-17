using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;

namespace PrismControl.Smart.Layout;

/// <summary>What one smart key is on the current page.</summary>
public abstract record KeyAssignment(string Why);
public sealed record VerbKey(PackVerb Verb, string Why) : KeyAssignment(Why)
{
    /// <summary>The pack the verb comes from when it isn't the layout's own (the base-layer underlay).</summary>
    public ContextPack? From { get; init; }
}
public sealed record MoreKey(int Page, int PageCount) : KeyAssignment("overflow: the verbs that don't fit are on more pages");
public sealed record ReadoutKey(PackReadout Readout, string Why) : KeyAssignment(Why);
public sealed record EmptyKey(string Why) : KeyAssignment(Why);

/// <summary>What one smart dial (and its Galleon widget / Stream Deck + strip segment) is.</summary>
public sealed record DialAssignment(PackControl? Control, PackReadout? Readout, string Why);

/// <summary>A generated deck for one device, pack, context and page. Immutable; equal inputs give an equal layout.</summary>
public sealed record DeckLayout(string PackId, string ContextId, string DeviceKind, int Page, int PageCount,
    IReadOnlyDictionary<KeySlot, KeyAssignment> Keys, IReadOnlyDictionary<DialSlot, DialAssignment> Dials)
{
    public static DeckLayout Empty(string deviceKind) => new("", "", deviceKind, 0, 1, new Dictionary<KeySlot, KeyAssignment>(), new Dictionary<DialSlot, DialAssignment>());

    public KeyAssignment KeyAt(KeySlot s) => Keys.TryGetValue(s, out var a) ? a : new EmptyKey("not a smart slot");
    public DialAssignment DialAt(DialSlot s) => Dials.TryGetValue(s, out var a) ? a : new DialAssignment(null, null, "not a smart slot");

    /// <summary>A stable text form (tests compare layouts with it; the PI shows it).</summary>
    public string Describe() =>
        string.Join(" | ", Keys.OrderBy(k => k.Key).Select(k => $"{k.Key}={Name(k.Value)}"))
        + " || " + string.Join(" | ", Dials.OrderBy(d => d.Key.Layer).ThenBy(d => d.Key.Dial).Select(d => $"{d.Key}={d.Value.Control?.Id ?? "-"}/{d.Value.Readout?.Id ?? "-"}"));

    private static string Name(KeyAssignment a) => a switch
    {
        VerbKey v => v.Verb.Id,
        MoreKey m => $"MORE {m.Page + 1}/{m.PageCount}",
        ReadoutKey r => "readout:" + r.Readout.Id,
        _ => "-",
    };
}

/// <param name="Underlay">The base-layer pack (windows-shell): its always-valid verbs fill keys the app leaves empty on page 1.</param>
public sealed record LayoutRequest(ContextPack Pack, string ContextId, DeviceGeometry Geometry, IReadOnlyCollection<KeySlot> SmartKeys,
    IReadOnlyCollection<DialSlot> SmartDials, SmartPreferences Prefs, int Page = 0, ContextPack? Underlay = null);

/// <summary>
/// Deterministic, stable layouts (muscle memory): the same pack + context + device + smart slots + preferences always
/// produce the same verbs in the same slots. Order of authority on page 1: the user's pins, then the pack's proposal for
/// this device and context, then zones by category (primary top row, tool/mode/toggle/camera middle, nav/system bottom).
/// Slots that are not smart (the user's own pinned actions) are never touched. Overflow goes to pages behind a MORE key
/// in the last smart slot; page 1 always keeps the highest-priority verbs.
/// </summary>
public static class LayoutGenerator
{
    public static DeckLayout Generate(LayoutRequest req)
    {
        var pack = req.Pack;
        var ctx = pack.FindContext(req.ContextId)?.Id ?? pack.DefaultContext.Id;
        var geo = req.Geometry;
        var app = req.Prefs.For(pack.Id);
        var hidden = app.Hidden.ToHashSet(StringComparer.Ordinal);

        // ---- verbs valid here, ranked (priority, then direct/* before parent-inherited, then pack order)
        var valid = pack.Verbs
            .Select(v => (Verb: v, Tier: pack.ValidityTier(v.Contexts, ctx)))
            .Where(t => t.Tier >= 0 && !hidden.Contains(t.Verb.Id))
            .ToList();
        // A verb inherited from the parent context that does exactly what one of this context's own verbs does (PC2's park
        // DELETE inside the track builder, which has its own DELETE) is left out: one function, one key. A pin keeps it.
        var direct = valid.Where(t => t.Tier == 0).Select(t => FunctionKey(t.Verb)).OfType<string>().ToHashSet(StringComparer.Ordinal);
        var pinnedHere = app.Pins.Where(p => p.Kind == "key" && p.Device == geo.Kind).Select(p => p.Item).ToHashSet(StringComparer.Ordinal);
        var ranked = valid
            .Where(t => t.Tier == 0 || pinnedHere.Contains(t.Verb.Id) || FunctionKey(t.Verb) is not { } fk || !direct.Contains(fk))
            .OrderByDescending(t => t.Verb.Priority).ThenBy(t => t.Tier).ThenBy(t => t.Verb.Order)
            .Select(t => t.Verb).ToList();
        var rank = ranked.Select((v, i) => (v.Id, i)).ToDictionary(t => t.Id, t => t.i, StringComparer.Ordinal);

        var free = req.SmartKeys.Where(geo.Contains).Distinct().Order().ToList();
        var keys = new SortedDictionary<KeySlot, KeyAssignment>();
        var pageCount = 1;

        if (free.Count > 0)
        {
            // ---- 1. user pins (persist on every page)
            var userPinned = new Dictionary<KeySlot, PackVerb>();
            foreach (var pin in app.Pins.Where(p => p.Kind == "key" && p.Device == geo.Kind))
            {
                var slot = new KeySlot(pin.X, pin.Y);
                if (!free.Contains(slot) || userPinned.ContainsKey(slot)) continue;
                var v = ranked.FirstOrDefault(x => x.Id == pin.Item);
                if (v is null || userPinned.ContainsValue(v)) continue;
                userPinned[slot] = v;
            }
            var remaining = ranked.Where(v => !userPinned.ContainsValue(v)).ToList();
            var open = free.Where(s => !userPinned.ContainsKey(s)).ToList();

            // ---- 2. the MORE key: the last open slot, when paging is on and the verbs don't fit
            KeySlot? moreSlot = null;
            if (req.Prefs.IsPagingOn && open.Count >= 2 && remaining.Count > open.Count)
            {
                moreSlot = open[^1];
                open.RemoveAt(open.Count - 1);
            }

            // ---- 3. page 1: the proposal, with displaced proposal verbs swapping in for lower-ranked ones
            var page1 = new Dictionary<KeySlot, (PackVerb Verb, string Why)>();
            var proposal = FindProposal(pack, geo.Kind, ctx);
            if (proposal is not null)
            {
                var why = $"pack layout for {geo.Kind}/{proposal.Context}";
                var displaced = new List<PackVerb>();
                foreach (var k in proposal.Keys)
                {
                    var v = remaining.FirstOrDefault(x => x.Id == k.Verb);
                    if (v is null) continue;   // hidden, pinned elsewhere, or not valid
                    var slot = new KeySlot(k.X, k.Y);
                    if (open.Contains(slot) && !page1.ContainsKey(slot)) page1[slot] = (v, why);
                    else displaced.Add(v);
                }
                foreach (var d in displaced.OrderBy(v => rank[v.Id]))
                {
                    var weakest = page1.Where(p => p.Value.Why == why).OrderByDescending(p => rank[p.Value.Verb.Id]).Select(p => (KeyValuePair<KeySlot, (PackVerb Verb, string Why)>?)p).FirstOrDefault();
                    if (weakest is { } w && rank[w.Value.Verb.Id] > rank[d.Id])
                        page1[w.Key] = (d, $"{why} (moved: its own slot is taken)");
                }
            }
            var placed = page1.Values.Select(p => p.Verb).ToHashSet();
            var rest = remaining.Where(v => !placed.Contains(v)).ToList();
            var openLeft = open.Where(s => !page1.ContainsKey(s)).ToList();
            var take = rest.Take(openLeft.Count).ToList();
            foreach (var (slot, v) in Zone(take, openLeft)) page1[slot] = (v, ZoneWhy(v, rank, ranked.Count));
            var overflow = rest.Skip(take.Count).ToList();

            // ---- 4. pages: the overflow, page by page, laid out by zones in the open slots
            var capacity = open.Count;
            if (moreSlot is not null && capacity > 0) pageCount = 1 + (overflow.Count + capacity - 1) / capacity;
            var page = Math.Clamp(req.Page, 0, pageCount - 1);

            foreach (var (slot, v) in userPinned) keys[slot] = new VerbKey(v, "pinned by you");
            if (page == 0)
            {
                foreach (var (slot, p) in page1) keys[slot] = new VerbKey(p.Verb, p.Why);
                // Spare keys: the base layer's always-on verbs (the app's own verbs all fit). Never under a display-only or
                // online-competitive pack: those send no input at all, the base layer's neither (review E13).
                if (overflow.Count == 0 && req.Underlay is { } under && under.Id != pack.Id && !pack.IsDisplayOnly && pack.Policy.Class != PolicyClass.OnlineCompetitive)
                {
                    var spareKeys = open.Where(s => !page1.ContainsKey(s)).ToList();
                    var uHidden = req.Prefs.For(under.Id).Hidden.ToHashSet(StringComparer.Ordinal);
                    var have = page1.Values.Select(p => p.Verb.Id).Concat(userPinned.Values.Select(v => v.Id)).ToHashSet(StringComparer.Ordinal);
                    var extra = under.Verbs.Where(v => v.Contexts.Contains("*") && !uHidden.Contains(v.Id) && !have.Contains(v.Id))
                        .OrderByDescending(v => v.Priority).ThenBy(v => v.Order).Take(spareKeys.Count).ToList();
                    foreach (var (slot, v) in Zone(extra, spareKeys))
                    {
                        keys[slot] = new VerbKey(v, $"spare key: {under.Name} (base layer), priority {v.Priority}") { From = under };
                        page1[slot] = (v, "underlay");
                    }
                }
                // Spare keys on decks without screens: readouts.
                if (!geo.HasScreens && req.Prefs.ReadoutKeys && overflow.Count == 0)
                {
                    var spare = open.Where(s => !page1.ContainsKey(s)).ToList();
                    var readouts = pack.Readouts.Where(r => pack.ValidityTier(r.Contexts, ctx) >= 0 && !(r.StreamerHide && req.Prefs.StreamerSafe) && !hidden.Contains(r.Id))
                        .OrderBy(r => r.Order).Take(spare.Count).ToList();
                    for (var i = 0; i < readouts.Count; i++) keys[spare[i]] = new ReadoutKey(readouts[i], "spare key: a live readout");
                }
            }
            else
            {
                var chunk = overflow.Skip((page - 1) * capacity).Take(capacity).ToList();
                foreach (var (slot, v) in Zone(chunk, open)) keys[slot] = new VerbKey(v, $"page {page + 1} of {pageCount}: " + ZoneWhy(v, rank, ranked.Count));
            }
            foreach (var s in free.Where(s => !keys.ContainsKey(s) && s != moreSlot)) keys[s] = new EmptyKey("nothing else fits this context");
            if (moreSlot is { } ms) keys[ms] = new MoreKey(page, pageCount);
        }

        return new DeckLayout(pack.Id, ctx, geo.Kind, pageCount == 1 ? 0 : Math.Clamp(req.Page, 0, pageCount - 1), pageCount,
            keys, Dials(req, ctx, hidden));
    }

    /// <summary>What a verb does, for de-duplication: its binding (the keys it sends, the module verb + args). Null = never deduped.</summary>
    internal static string? FunctionKey(PackVerb v) => v.Binding switch
    {
        UnboundBinding => null,
        ModuleBinding m => "module:" + m.Verb + (m.Args is null ? "" : m.Args.ToJsonString()),
        var b => b.Kind + ":" + b.Describe(),
    };

    private static LayoutProposal? FindProposal(ContextPack pack, string device, string ctx) =>
        pack.Layouts.FirstOrDefault(l => l.Device == device && l.Context == ctx)
        ?? pack.Layouts.FirstOrDefault(l => l.Device == device && l.Context == "*");

    private static int ZoneOf(VerbCategory c) => c switch
    {
        VerbCategory.Primary => 0,
        VerbCategory.Nav or VerbCategory.System => 2,
        _ => 1,
    };

    private static int CategoryOrder(VerbCategory c) => c switch
    {
        VerbCategory.Primary => 0, VerbCategory.Tool => 1, VerbCategory.Mode => 2, VerbCategory.Toggle => 3, VerbCategory.Camera => 4,
        VerbCategory.Readout => 5, VerbCategory.Nav => 6, VerbCategory.System => 7, _ => 8,
    };

    /// <summary>
    /// Places verbs (already the ones for this page) into slots: primary from the top, nav/system from the bottom (system
    /// last, in the bottom-right corner), everything else in between, grouped by category, each group in rank order.
    /// </summary>
    private static IEnumerable<(KeySlot, PackVerb)> Zone(List<PackVerb> verbs, List<KeySlot> slots)
    {
        var n = Math.Min(verbs.Count, slots.Count);
        if (n == 0) yield break;
        var ordered = verbs.Take(n).Select((v, i) => (v, i)).OrderBy(t => ZoneOf(t.v.Category)).ThenBy(t => CategoryOrder(t.v.Category)).ThenBy(t => t.i).Select(t => t.v).ToList();
        var top = ordered.Where(v => ZoneOf(v.Category) == 0).ToList();
        var mid = ordered.Where(v => ZoneOf(v.Category) == 1).ToList();
        var bottom = ordered.Where(v => ZoneOf(v.Category) == 2).ToList();
        // When there are fewer verbs than slots, bottom-zone verbs still sit in the last slots (the bottom row).
        var used = new PackVerb?[slots.Count];
        var i0 = 0;
        foreach (var v in top) { used[i0] = v; i0++; }
        var j = slots.Count - bottom.Count;
        foreach (var v in bottom) { used[j] = v; j++; }
        var k = i0;
        foreach (var v in mid)
        {
            while (k < slots.Count && used[k] is not null) k++;
            if (k >= slots.Count) break;
            used[k] = v;
        }
        for (var s = 0; s < slots.Count; s++)
            if (used[s] is { } v) yield return (slots[s], v);
    }

    private static string ZoneWhy(PackVerb v, Dictionary<string, int> rank, int total)
    {
        var zone = ZoneOf(v.Category) switch { 0 => "top (primary)", 2 => "bottom (nav/system)", _ => "middle" };
        return $"{zone} zone, {v.Category.ToString().ToLowerInvariant()}, priority {v.Priority} (rank {rank[v.Id] + 1} of {total})";
    }

    // ------------------------------------------------------------------ dials and screens

    private static IReadOnlyDictionary<DialSlot, DialAssignment> Dials(LayoutRequest req, string ctx, HashSet<string> hidden)
    {
        var pack = req.Pack;
        var geo = req.Geometry;
        var result = new SortedDictionary<DialSlot, DialAssignment>(Comparer<DialSlot>.Create((a, b) => a.Layer != b.Layer ? a.Layer.CompareTo(b.Layer) : a.Dial.CompareTo(b.Dial)));
        var free = req.SmartDials.Where(geo.Contains).Distinct().OrderBy(d => d.Layer).ThenBy(d => d.Dial).ToList();
        if (free.Count == 0) return result;
        var app = req.Prefs.For(pack.Id);
        var controls = pack.Controls
            .Select(c => (Control: c, Tier: pack.ValidityTier(c.Contexts, ctx)))
            .Where(t => t.Tier >= 0 && !hidden.Contains(t.Control.Id))
            .OrderByDescending(t => t.Control.Priority).ThenBy(t => t.Tier).ThenBy(t => t.Control.Order)
            .Select(t => t.Control).ToList();
        var placed = new Dictionary<DialSlot, (PackControl Control, string Why)>();
        bool Used(PackControl c) => placed.Values.Any(p => p.Control == c);

        // 1. user pins
        foreach (var pin in app.Pins.Where(p => p.Kind == "dial" && p.Device == geo.Kind))
        {
            var slot = new DialSlot(pin.X, pin.Y);
            var c = controls.FirstOrDefault(x => x.Id == pin.Item);
            if (c is null || !free.Contains(slot) || placed.ContainsKey(slot) || Used(c)) continue;
            placed[slot] = (c, "pinned by you");
        }
        // 2. dial preferences per category ("camera on the left dial")
        foreach (var (category, where) in req.Prefs.DialCategories.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            if (PackParser.ParseCategory(category) is not { } cat || geo.DialFor(where) is not { } dial) continue;
            foreach (var c in controls.Where(c => c.Category == cat && !Used(c)))
            {
                var slot = free.Where(s => s.Dial == dial && !placed.ContainsKey(s)).Select(s => (DialSlot?)s).FirstOrDefault();
                if (slot is null) break;
                placed[slot.Value] = (c, $"your preference: {category} on the {where} dial");
            }
        }
        // 3. the pack's proposal
        var proposal = FindProposal(pack, geo.Kind, ctx);
        if (proposal is not null)
            foreach (var d in proposal.Dials)
            {
                var slot = new DialSlot(d.Dial, geo.Layers > 1 ? d.Layer : 0);
                var c = controls.FirstOrDefault(x => x.Id == d.Control);
                if (c is null || !free.Contains(slot) || placed.ContainsKey(slot) || Used(c)) continue;
                placed[slot] = (c, $"pack layout for {geo.Kind}/{proposal.Context}");
            }
        // 4. the rest by rank, layer 0 first
        foreach (var slot in free.Where(s => !placed.ContainsKey(s)))
        {
            var c = controls.FirstOrDefault(x => !Used(x));
            if (c is null) break;
            placed[slot] = (c, $"{c.Category.ToString().ToLowerInvariant()} control, priority {c.Priority}");
        }

        // Readouts per encoder slot (its Galleon widget / Stream Deck + strip segment).
        bool Shown(PackReadout r) => pack.ValidityTier(r.Contexts, ctx) >= 0 && !(r.StreamerHide && req.Prefs.StreamerSafe) && !hidden.Contains(r.Id);
        var usedReadouts = new HashSet<string>(StringComparer.Ordinal);
        var readoutFor = new Dictionary<DialSlot, (PackReadout, string)>();
        if (proposal is not null)
            foreach (var s in proposal.Screen)
            {
                var slot = free.FirstOrDefault(f => geo.ScreenSlot(f) == s.Slot, new DialSlot(-1, -1));
                if (slot.Dial < 0 || pack.FindReadout(s.Readout) is not { } r || !Shown(r) || usedReadouts.Contains(r.Id)) continue;
                readoutFor[slot] = (r, $"pack layout screen {s.Slot}");
                usedReadouts.Add(r.Id);
            }
        foreach (var (slot, p) in placed)
        {
            if (readoutFor.ContainsKey(slot) || p.Control.Readout is not { } rid || pack.FindReadout(rid) is not { } r || !Shown(r) || usedReadouts.Contains(r.Id)) continue;
            readoutFor[slot] = (r, "the control's own readout");
            usedReadouts.Add(r.Id);
        }
        var spareReadouts = pack.Readouts.Where(r => Shown(r) && !usedReadouts.Contains(r.Id) && r.Source.Kind != ReadoutSourceKind.Counted).OrderBy(r => r.Order).ToList();
        foreach (var slot in free.Where(s => !placed.ContainsKey(s) && !readoutFor.ContainsKey(s)))
        {
            if (spareReadouts.Count == 0) break;
            readoutFor[slot] = (spareReadouts[0], "spare widget: a live readout");
            spareReadouts.RemoveAt(0);
        }

        foreach (var slot in free)
        {
            var hasC = placed.TryGetValue(slot, out var pc);
            var hasR = readoutFor.TryGetValue(slot, out var pr);
            var why = hasC ? pc.Why : hasR ? pr.Item2 : "nothing to turn in this context";
            if (hasC && hasR && pr.Item2 != "the control's own readout") why += "; screen: " + pr.Item2;
            result[slot] = new DialAssignment(hasC ? pc.Control : null, hasR ? pr.Item1 : null, why);
        }
        return result;
    }
}
