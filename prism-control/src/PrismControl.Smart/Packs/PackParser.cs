using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.Smart.Packs;

public enum ProblemSeverity { Warning, Error }

/// <summary>One finding while loading a pack. Errors on an item drop that item; errors on the pack drop the pack.</summary>
public sealed record PackProblem(ProblemSeverity Severity, string Where, string Message)
{
    public override string ToString() => $"{(Severity == ProblemSeverity.Error ? "error" : "warn")}: {Where}: {Message}";
}

/// <summary>
/// JSON → <see cref="ContextPack"/>. Lenient where it can be (a bad verb is dropped with an error, the rest of the pack
/// loads), strict where it must be (no id, policy, match or contexts = no pack). Cross-checks live in <see cref="PackValidator"/>.
/// </summary>
public static class PackParser
{
    public static readonly JsonDocumentOptions JsonOptions = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true, MaxDepth = 64 };
    public static readonly JsonNodeOptions NodeOptions = new() { PropertyNameCaseInsensitive = false };

    /// <summary>Parses text (JSON or JSONC) into an object, or null with an error.</summary>
    public static JsonObject? ParseObject(string text, string where, List<PackProblem> problems)
    {
        try
        {
            if (JsonNode.Parse(text, NodeOptions, JsonOptions) is JsonObject o) return o;
            problems.Add(new(ProblemSeverity.Error, where, "the top level must be a JSON object"));
        }
        catch (JsonException ex)
        {
            problems.Add(new(ProblemSeverity.Error, where, $"not valid JSON ({ex.Message})"));
        }
        return null;
    }

    public static ContextPack? Parse(JsonObject o, List<PackProblem> problems, PackOrigin origin = PackOrigin.Shipped, IReadOnlyList<string>? files = null)
    {
        var id = Str(o, "id");
        var where = "pack " + (id ?? "?");
        void E(string w, string m) => problems.Add(new(ProblemSeverity.Error, w, m));
        void W(string w, string m) => problems.Add(new(ProblemSeverity.Warning, w, m));

        if (o["schemaVersion"] is JsonValue sv && sv.TryGetValue<int>(out var ver) && ver != 1) { E(where, $"schemaVersion {ver} is not supported (1)"); return null; }
        if (string.IsNullOrEmpty(id)) { E(where, "missing id"); return null; }
        var name = Str(o, "name") ?? id;
        var kind = Enum(o, "kind", ParseKind);
        if (kind is null) { E(where, "missing or unknown kind"); return null; }
        var policy = ParsePolicy(o["policy"] as JsonObject);
        if (policy is null) { E(where, "missing or invalid policy (class, input, sight, closedLoop)"); return null; }
        var keyMode = Str(o, "keyMode") switch { "vk" => PackKeyMode.Vk, "scancode" => PackKeyMode.Scancode, _ => (PackKeyMode?)null };
        if (keyMode is null) { E(where, "missing keyMode (vk | scancode)"); return null; }
        var match = ParseMatch(o["match"] as JsonObject, where, problems);
        if (match is null) return null;

        var contexts = new List<PackContext>();
        foreach (var (c, i) in Items(o, "contexts"))
        {
            var ctx = ParseContext(c, $"{where} context[{i}]", problems);
            if (ctx is not null) contexts.Add(ctx);
        }
        if (contexts.Count == 0) { E(where, "no usable contexts"); return null; }

        var verbs = new List<PackVerb>();
        foreach (var (v, i) in Items(o, "verbs"))
        {
            var verb = ParseVerb(v, i, $"{where} verb[{i}] {Str(v, "id")}", problems);
            if (verb is not null) verbs.Add(verb);
        }
        var controls = new List<PackControl>();
        foreach (var (c, i) in Items(o, "controls"))
        {
            var ctl = ParseControl(c, i, $"{where} control[{i}] {Str(c, "id")}", problems);
            if (ctl is not null) controls.Add(ctl);
        }
        var readouts = new List<PackReadout>();
        foreach (var (r, i) in Items(o, "readouts"))
        {
            var ro = ParseReadout(r, i, $"{where} readout[{i}] {Str(r, "id")}", problems);
            if (ro is not null) readouts.Add(ro);
        }
        var regions = Items(o, "sightRegions").Select(t => new SightRegionInfo(Str(t.Item1, "id") ?? "", Str(t.Item1, "what") ?? "", Str(t.Item1, "valueType")))
            .Where(r => r.Id.Length > 0).ToList();
        var layouts = new List<LayoutProposal>();
        foreach (var (l, i) in Items(o, "layouts"))
        {
            var lp = ParseLayout(l, $"{where} layout[{i}]", problems);
            if (lp is not null) layouts.Add(lp);
        }
        var ub = o["userBindings"] as JsonObject;
        var userBindings = new UserBindingsInfo(Str(ub, "storage") ?? "unknown", Str(ub, "summary") ?? "",
            Items(ub, "locations").Select(t => new RebindLocation(Str(t.Item1, "path") ?? "", Str(t.Item1, "format") ?? "other", Str(t.Item1, "note")))
                .Where(l => l.Path.Length > 0).ToList(),
            Str(ub, "keyNameMap"), Str(ub, "confidence") ?? "unverified") { NeverRead = Bool(ub, "neverRead") ?? false };
        if (ub is null) W(where, "no userBindings (rebinds are not read)");

        var va = o["verifiedAgainst"] as JsonObject;
        return new ContextPack
        {
            Id = id,
            Name = name,
            Vendor = Str(o, "vendor"),
            Kind = kind.Value,
            PackVersion = Str(o, "packVersion") ?? "0.0.0",
            Extends = Strings(o["extends"]),
            Layer = Str(o, "layer") switch { "base" => PackLayer.Base, "overlay" => PackLayer.Overlay, _ => PackLayer.App },
            Activation = Str(o, "activation") ?? "foreground",
            Policy = policy,
            KeyMode = keyMode.Value,
            KeyHoldMs = Math.Clamp(Int(o, "keyHoldMs") ?? (keyMode.Value == PackKeyMode.Scancode ? 50 : 0), 0, 500),
            Match = match,
            Contexts = contexts,
            Verbs = verbs,
            Controls = controls,
            Readouts = readouts,
            SightRegions = regions,
            UserBindings = userBindings,
            Layouts = layouts,
            Confidence = Str(o, "confidence") ?? "medium",
            VerifiedVersion = Str(va, "version") ?? "unknown",
            Origin = origin,
            Files = files ?? [],
        };
    }

    // ------------------------------------------------------------------ pieces

    private static PackKind? ParseKind(string s) => s switch
    {
        "game" => PackKind.Game, "app" => PackKind.App, "browser" => PackKind.Browser, "site" => PackKind.Site, "shell" => PackKind.Shell, _ => null,
    };

    private static PackPolicy? ParsePolicy(JsonObject? p)
    {
        if (p is null) return null;
        PolicyClass? cls = Str(p, "class") switch
        {
            "safe-offline" => PolicyClass.SafeOffline, "desktop-app" => PolicyClass.DesktopApp, "online-competitive" => PolicyClass.OnlineCompetitive, _ => null,
        };
        var input = Str(p, "input");
        var sight = Str(p, "sight");
        var loop = Str(p, "closedLoop");
        if (cls is null || input is not ("allowed" or "display-only") || sight is not ("allowed" or "forbidden") || loop is not ("allowed" or "forbidden")) return null;
        return new PackPolicy(cls.Value, input == "allowed", sight == "allowed", loop == "allowed", Str(p, "reason"));
    }

    private static PackMatch? ParseMatch(JsonObject? m, string where, List<PackProblem> problems)
    {
        if (m is null) { problems.Add(new(ProblemSeverity.Error, where, "missing match")); return null; }
        var any = Items(m, "any").Select(t => ParseRule(t.Item1)).Where(r => r is not null).Cast<MatchRule>().ToList();
        var exclude = Items(m, "exclude").Select(t => ParseRule(t.Item1)).Where(r => r is not null).Cast<MatchRule>().ToList();
        if (any.Count == 0) { problems.Add(new(ProblemSeverity.Error, where, "match.any has no usable rule")); return null; }
        foreach (var r in any.Concat(exclude))
            foreach (var rx in new[] { r.ProcessPathRegex, r.TitleRegex, r.Site?.PathRegex })
                if (rx is not null && !RegexOk(rx)) { problems.Add(new(ProblemSeverity.Error, where, $"bad regex \"{rx}\"")); return null; }
        return new PackMatch(any, exclude);
    }

    private static MatchRule? ParseRule(JsonObject r)
    {
        SiteRule? site = r["site"] is JsonObject s ? new SiteRule(Str(s, "host"), Str(s, "hostSuffix"), Str(s, "pathRegex")) : null;
        var rule = new MatchRule(Str(r, "process"), Str(r, "processPathRegex"), Str(r, "aumid"), Str(r, "windowClass"), Str(r, "titleRegex"),
            r["steamAppId"] is JsonValue v && v.TryGetValue<long>(out var sid) ? sid : null, site, Str(r, "titleFlags"));
        // A rule with nothing observable (steamAppId alone can't be seen from a window) would match every app: drop it.
        return rule.Specificity == 0 ? null : rule;
    }

    private static PackContext? ParseContext(JsonObject c, string where, List<PackProblem> problems)
    {
        var id = Str(c, "id");
        if (string.IsNullOrEmpty(id)) { problems.Add(new(ProblemSeverity.Error, where, "context without id")); return null; }
        var detect = ParseDetect(c["detect"] as JsonObject, $"{where} {id}", problems);
        if (detect is null) return null;
        return new PackContext(id, Str(c, "label") ?? id, Str(c, "parent"), Bool(c, "default") ?? false, Int(c, "priority") ?? 0,
            Math.Clamp(Int(c, "hysteresisMs") ?? 0, 0, 5000), detect);
    }

    internal static DetectGroup? ParseDetect(JsonObject? d, string where, List<PackProblem> problems)
    {
        if (d is null) { problems.Add(new(ProblemSeverity.Error, where, "missing detect")); return null; }
        var all = d["all"] is JsonArray;
        var arr = (d["all"] ?? d["any"]) as JsonArray;
        if (arr is null || arr.Count == 0) { problems.Add(new(ProblemSeverity.Error, where, "detect needs a non-empty all or any")); return null; }
        var list = new List<Detector>();
        foreach (var n in arr)
        {
            if (n is not JsonObject x) continue;
            DetectorType? type = Str(x, "type") switch
            {
                "always" => DetectorType.Always, "windowTitle" => DetectorType.WindowTitle, "process" => DetectorType.Process,
                "sight" => DetectorType.Sight, "extension" => DetectorType.Extension, "gameLink" => DetectorType.GameLink,
                "module" => DetectorType.Module, "focusedControl" => DetectorType.FocusedControl, "windowClass" => DetectorType.WindowClass, _ => null,
            };
            if (type is null) { problems.Add(new(ProblemSeverity.Error, where, $"unknown detector type \"{Str(x, "type")}\"")); return null; }
            var rx = Str(x, "regex");
            if (rx is not null && !RegexOk(rx)) { problems.Add(new(ProblemSeverity.Error, where, $"bad regex \"{rx}\"")); return null; }
            SightState? st = Str(x, "state") switch { "visible" => SightState.Visible, "hidden" => SightState.Hidden, "value" => SightState.Value, _ => null };
            list.Add(new Detector(type.Value, rx, Str(x, "region"), st, Str(x, "field"), x["equals"]?.DeepClone(), Bool(x, "exists"), Bool(x, "negate") ?? false, Str(x, "flags")));
        }
        return list.Count == 0 ? null : new DetectGroup(all, list);
    }

    private static PackVerb? ParseVerb(JsonObject v, int order, string where, List<PackProblem> problems)
    {
        var id = Str(v, "id");
        var label = Str(v, "label");
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(label)) { problems.Add(new(ProblemSeverity.Error, where, "verb needs id and label")); return null; }
        if (label.Length > 12) problems.Add(new(ProblemSeverity.Warning, where, "label longer than 12 characters (it is shrunk to fit)"));
        var category = ParseCategory(Str(v, "category"));
        if (category is null) { problems.Add(new(ProblemSeverity.Error, where, "missing or unknown category")); return null; }
        var binding = ParseBinding(v["binding"] as JsonObject, where, problems);
        if (binding is null) return null;
        var alts = new List<Binding>();
        foreach (var (a, _) in Items(v, "altBindings"))
            if (ParseBinding(a, where + " altBinding", problems) is { } ab) alts.Add(ab);
        var contexts = Strings(v["contexts"]);
        if (contexts.Count == 0) { problems.Add(new(ProblemSeverity.Error, where, "verb needs contexts")); return null; }
        var safety = ParseSafety(Str(v, "safety"), where, problems);
        // An approved AI binding is confirm, permanently (lead decision 2); the "AI" badge says where it came from.
        var aiBound = Bool(v, "aiBound") ?? false;
        if (aiBound) safety = Safety.Confirm;
        // An AI proposal that waits for the user's approval (REVIEW): a keyboard chord only, never run until approved.
        Binding? pending = null;
        var pb = v["pendingBinding"] as JsonObject;
        if (pb is not null)
        {
            var pbProblems = new List<PackProblem>();
            pending = ParseBinding(pb, where + " pendingBinding", pbProblems);
            if (pending is not ChordBinding)
            {
                problems.Add(new(ProblemSeverity.Error, where, "pendingBinding must be a keyboard chord (ignored)"));
                pending = null;
            }
        }
        return new PackVerb(id, label, Str(v, "longLabel"), Str(v, "glyph") ?? "", Str(v, "monogram"), category.Value,
            Math.Clamp(Int(v, "priority") ?? 50, 0, 100), contexts, binding, alts, Str(v, "appAction"), safety,
            Str(v, "stateReadout"), ParseUnavailable(v["unavailable"] as JsonObject, label), Str(v, "confidence") ?? "unverified", Str(v, "verify"), order)
        {
            IsGlobal = Str(v, "scope") == "global",
            AiBound = aiBound,
            PendingBinding = pending,
            PendingClient = pending is null ? null : Str(pb, "client"),
            PendingAt = pending is null ? null : Str(pb, "at"),
        };
    }

    private static PackControl? ParseControl(JsonObject c, int order, string where, List<PackProblem> problems)
    {
        var id = Str(c, "id");
        var label = Str(c, "label");
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(label)) { problems.Add(new(ProblemSeverity.Error, where, "control needs id and label")); return null; }
        var category = ParseCategory(Str(c, "category")) ?? VerbCategory.Tool;
        if (c["turn"] is not JsonObject t) { problems.Add(new(ProblemSeverity.Error, where, "control needs turn")); return null; }
        var left = ParseBinding(t["left"] as JsonObject, where + " turn.left", problems);
        var right = ParseBinding(t["right"] as JsonObject, where + " turn.right", problems);
        if (left is null || right is null) return null;
        var step = t["step"] as JsonObject;
        var modSteps = new Dictionary<string, double>(StringComparer.Ordinal);
        if (step?["modifierSteps"] is JsonObject ms)
            foreach (var (k, n) in ms)
                if (n is JsonValue nv && nv.TryGetValue<double>(out var d)) modSteps[k] = d;
        var turnStep = new TurnStep(Num(step, "perPress"), Str(step, "unit") ?? "step", modSteps);
        var acc = Acceleration.Default;
        if (t["acceleration"] is JsonObject a)
        {
            var rows = Items(a, "curve").Select(r => new AccelerationRow(Math.Clamp(Int(r.Item1, "minTicks") ?? 1, 1, 12), Math.Clamp(Num(r.Item1, "pressesPerTick") ?? 1, 0.01, 10)))
                .OrderBy(r => r.MinTicks).ToList();
            if (rows.Count == 0) rows.Add(new(1, 1));
            acc = new Acceleration(rows, Math.Clamp(Int(a, "maxPressesPerEvent") ?? 24, 1, 60), Math.Clamp(Int(a, "minIntervalMs") ?? 25, 0, 500));
        }
        var clamp = t["clamp"] as JsonObject;
        var turn = new TurnSpec(left, right, turnStep, acc, Num(clamp, "min"), Num(clamp, "max"), Bool(t, "invert") ?? false);
        var contexts = Strings(c["contexts"]);
        if (contexts.Count == 0) { problems.Add(new(ProblemSeverity.Error, where, "control needs contexts")); return null; }
        return new PackControl(id, label, Str(c, "glyph") ?? "", category, Math.Clamp(Int(c, "priority") ?? 50, 0, 100), contexts, turn,
            Str(c["push"] as JsonObject, "verb"), Str(c, "readout"), ParseSafety(Str(c, "safety"), where, problems), ParseUnavailable(c["unavailable"] as JsonObject, label),
            Str(c, "confidence") ?? "unverified", order) { Monogram = Str(c, "monogram") };
    }

    private static PackReadout? ParseReadout(JsonObject r, int order, string where, List<PackProblem> problems)
    {
        var id = Str(r, "id");
        var label = Str(r, "label");
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(label)) { problems.Add(new(ProblemSeverity.Error, where, "readout needs id and label")); return null; }
        if (r["source"] is not JsonObject s) { problems.Add(new(ProblemSeverity.Error, where, "readout needs source")); return null; }
        ReadoutSourceKind? kind = Str(s, "kind") switch
        {
            "sight" => ReadoutSourceKind.Sight, "gameLink" => ReadoutSourceKind.GameLink, "extension" => ReadoutSourceKind.Extension,
            "module" => ReadoutSourceKind.Module, "counted" => ReadoutSourceKind.Counted, "window" => ReadoutSourceKind.Window, "file" => ReadoutSourceKind.File, _ => null,
        };
        if (kind is null) { problems.Add(new(ProblemSeverity.Error, where, "unknown readout source kind")); return null; }
        var src = new ReadoutSource(kind.Value, Str(s, "region"), Str(s, "field"), Str(s, "topic"), Str(s, "control"), ParseModuleStatus(Str(s, "status")));
        double? lo = null, hi = null;
        if (r["range"] is JsonArray range && range.Count == 2 && range[0] is JsonValue a && a.TryGetValue<double>(out var av) && range[1] is JsonValue b && b.TryGetValue<double>(out var bv))
            (lo, hi) = (av, bv);
        var contexts = Strings(r["contexts"]);
        if (contexts.Count == 0) contexts = ["*"];
        return new PackReadout(id, label, contexts, src, Str(r, "unit"), Str(r, "format"), lo, hi, Str(r, "widget") ?? "text",
            Str(r, "privacy") == "streamer-hide", Num(r, "refreshHz"), r["unavailable"] is JsonObject u ? ParseUnavailable(u, label) : null, order);
    }

    private static LayoutProposal? ParseLayout(JsonObject l, string where, List<PackProblem> problems)
    {
        var device = Str(l, "device");
        var context = Str(l, "context");
        if (device is null || context is null) { problems.Add(new(ProblemSeverity.Error, where, "layout needs device and context")); return null; }
        var keys = Items(l, "keys").Select(k => new LayoutKey(Int(k.Item1, "x") ?? -1, Int(k.Item1, "y") ?? -1, Str(k.Item1, "verb") ?? "")).ToList();
        var dials = Items(l, "dials").Select(k => new LayoutDial(Int(k.Item1, "dial") ?? -1, Int(k.Item1, "layer") ?? 0, Str(k.Item1, "control") ?? "")).ToList();
        var screen = Items(l, "screen").Select(k => new LayoutScreen(Str(k.Item1, "slot") ?? "", Str(k.Item1, "readout") ?? "")).ToList();
        return new LayoutProposal(device, context, keys, dials, screen, Str(l, "rationale") ?? "");
    }

    internal static Binding? ParseBinding(JsonObject? b, string where, List<PackProblem> problems)
    {
        void E(string m) => problems.Add(new(ProblemSeverity.Error, where, m));
        if (b is null) { E("missing binding"); return null; }
        Chord? C(string prop)
        {
            var s = Str(b, prop);
            if (Chord.TryParse(s, out var c, out var err)) return c;
            E($"binding {prop} \"{s}\": {err}");
            return null;
        }
        switch (Str(b, "kind"))
        {
            case "chord":
                return C("chord") is { } ch ? new ChordBinding(ch) : null;
            case "sequence":
            {
                var steps = new List<Chord>();
                foreach (var s in Strings(b["steps"]))
                {
                    if (!Chord.TryParse(s, out var c, out var err)) { E($"sequence step \"{s}\": {err}"); return null; }
                    steps.Add(c);
                }
                if (steps.Count < 2 || steps.Count > 6) { E("a sequence needs 2 to 6 steps"); return null; }
                return new SequenceBinding(steps, Math.Clamp(Int(b, "gapMs") ?? 40, 0, 1000));
            }
            case "repeat":
                return C("chord") is { } rc ? new RepeatBinding(rc, Math.Clamp(Int(b, "count") ?? 2, 2, 50), Math.Clamp(Int(b, "intervalMs") ?? 40, 0, 1000)) : null;
            case "hold":
            {
                var hc = C("chord");
                if (hc is null) return null;
                var mode = Str(b, "mode") == "timed" ? HoldMode.Timed : HoldMode.WhilePressed;
                return new HoldBinding(hc, mode, Math.Clamp(Int(b, "durationMs") ?? 200, 50, 10_000));
            }
            case "mouse":
            {
                PackMouseButton? btn = Str(b, "button") switch
                {
                    "left" => PackMouseButton.Left, "right" => PackMouseButton.Right, "middle" => PackMouseButton.Middle, "x1" => PackMouseButton.X1,
                    "x2" => PackMouseButton.X2, "wheelUp" => PackMouseButton.WheelUp, "wheelDown" => PackMouseButton.WheelDown,
                    "wheelLeft" => PackMouseButton.WheelLeft, "wheelRight" => PackMouseButton.WheelRight, _ => null,
                };
                if (btn is null) { E("unknown mouse button"); return null; }
                var mods = (Str(b, "mods") ?? "").Split('+', StringSplitOptions.RemoveEmptyEntries);
                if (mods.Any(m => Chord.ModifierRank(m) < 0)) { E($"bad mouse mods \"{Str(b, "mods")}\""); return null; }
                var mmode = Str(b, "mode") switch { "whilePressed" => MouseMode.WhilePressed, "timed" => MouseMode.Timed, _ => MouseMode.Click };
                return new MouseBinding(btn.Value, mods, Math.Clamp(Int(b, "clicks") ?? 1, 1, 3), mmode, Math.Clamp(Int(b, "durationMs") ?? 200, 50, 10_000));
            }
            case "macro":
            {
                var steps = new List<Binding>();
                foreach (var (st, i) in Items(b, "steps"))
                {
                    if (Str(st, "kind") == "macro") { E("a macro step can't be another macro"); return null; }
                    var sb = ParseBinding(st, $"{where} macro step {i}", problems);
                    if (sb is null) return null;
                    steps.Add(sb);
                }
                if (steps.Count < 2 || steps.Count > 8) { E("a macro needs 2 to 8 steps"); return null; }
                if (steps.Count(s => s.UsesSight) > 4) { E("a macro may hold at most 4 Sight steps (each needs its own gesture token, all within 1 s of the press)"); return null; }
                return new MacroBinding(steps, Math.Clamp(Int(b, "gapMs") ?? 150, 0, 2000));
            }
            case "text":
            {
                var text = Str(b, "text");
                if (string.IsNullOrEmpty(text) || text.Length > 200) { E("text binding needs 1 to 200 characters"); return null; }
                return new TextBinding(text);
            }
            case "module":
            {
                var verb = Str(b, "verb");
                if (string.IsNullOrEmpty(verb) || !verb.Contains('.')) { E("module binding needs a module-prefixed verb"); return null; }
                return new ModuleBinding(verb, b["args"] as JsonObject is { } args ? (JsonObject)args.DeepClone() : null, ParseModuleStatus(Str(b, "status")) ?? ModuleVerbStatus.Planned, Str(b, "action"));
            }
            case "closedLoop":
            {
                var sight = Str(b, "sight");
                var step = Num(b, "step");
                var target = Num(b, "target");
                if (sight is null || step is not > 0 || target is null) { E("closedLoop needs sight, target and a positive step"); return null; }
                Chord? inc = null, dec = null;
                if (b["stepChord"] is JsonObject sc)
                {
                    if (!Chord.TryParse(Str(sc, "increase"), out inc, out var e1) || !Chord.TryParse(Str(sc, "decrease"), out dec, out var e2))
                    { E("closedLoop stepChord needs valid increase and decrease chords"); return null; }
                }
                var stepSight = Str(b, "stepSight");
                if (inc is null && stepSight is null) { E("closedLoop needs stepChord or stepSight"); return null; }
                return new ClosedLoopBinding(sight, target.Value, inc, dec, stepSight, step.Value, Str(b, "unit"), Math.Max(0, Num(b, "tolerance") ?? 0),
                    Math.Clamp(Int(b, "maxSteps") ?? 24, 1, 100), Math.Clamp(Int(b, "settleMs") ?? 60, 0, 2000), Str(b, "fallback") == "counted" ? "counted" : "refuse");
            }
            case "sightClick":
            {
                var sight = Str(b, "sight");
                if (sight is null) { E("sightClick needs sight"); return null; }
                return new SightClickBinding(sight, Str(b, "button") == "right" ? "right" : "left");
            }
            case "sightAdjust":
            {
                var sight = Str(b, "sight");
                var dir = Str(b, "direction");
                if (sight is null || dir is not ("increase" or "decrease")) { E("sightAdjust needs sight and direction"); return null; }
                return new SightAdjustBinding(sight, dir == "increase" ? 1 : -1, Math.Clamp(Int(b, "steps") ?? 1, 1, 50), Str(b, "method") ?? "auto");
            }
            case "unbound":
            {
                Chord? suggest = null;
                if (Str(b, "suggest") is { } s && !Chord.TryParse(s, out suggest, out _)) suggest = null;
                return new UnboundBinding(Str(b, "reason") ?? "unknown", suggest, Str(b, "note"));
            }
            default:
                E($"unknown binding kind \"{Str(b, "kind")}\"");
                return null;
        }
    }

    internal static Unavailable ParseUnavailable(JsonObject? u, string fallbackLabel)
    {
        if (u is null) return Unavailable.Generic(fallbackLabel);
        return new Unavailable(Str(u, "label") ?? fallbackLabel, Str(u, "hint") ?? "Not available right now.", Strings(u["when"]), Str(u, "style") ?? "dim");
    }

    internal static VerbCategory? ParseCategory(string? s) => s switch
    {
        "primary" => VerbCategory.Primary, "tool" => VerbCategory.Tool, "mode" => VerbCategory.Mode, "nav" => VerbCategory.Nav,
        "camera" => VerbCategory.Camera, "system" => VerbCategory.System, "toggle" => VerbCategory.Toggle, "readout" => VerbCategory.Readout, _ => null,
    };

    /// <summary>
    /// A pack's safety string. Missing = <c>safe</c>. Anything unknown fails CLOSED (review E7): <c>confirm</c>, plus an
    /// error, so a typo such as "confirmed" or "never_auto" can never turn a guarded verb into a one-tap one.
    /// </summary>
    internal static Safety ParseSafety(string? s, string where, List<PackProblem> problems)
    {
        if (s is null) return Safety.Safe;
        if (SafetyRules.Parse(s) is { } known) return known;
        problems.Add(new(ProblemSeverity.Error, where, $"unknown safety \"{s}\" (safe, confirm or never-auto): treated as confirm"));
        return Safety.Confirm;
    }

    private static ModuleVerbStatus? ParseModuleStatus(string? s) => s switch
    {
        "exists" => ModuleVerbStatus.Exists, "in-progress" => ModuleVerbStatus.InProgress, "planned" => ModuleVerbStatus.Planned, _ => null,
    };

    private static bool RegexOk(string rx)
    {
        try { _ = new System.Text.RegularExpressions.Regex(rx, System.Text.RegularExpressions.RegexOptions.None, TimeSpan.FromMilliseconds(50)); return true; }
        catch (ArgumentException) { return false; }
    }

    // ------------------------------------------------------------------ JSON helpers

    internal static string? Str(JsonObject? o, string key) => o?[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
    internal static bool? Bool(JsonObject? o, string key) => o?[key] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;

    internal static int? Int(JsonObject? o, string key)
    {
        if (o?[key] is not JsonValue v) return null;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<double>(out var d) && Math.Abs(d) < int.MaxValue) return (int)Math.Round(d);
        return v.TryGetValue<string>(out var s) && int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var p) ? p : null;
    }

    internal static double? Num(JsonObject? o, string key)
    {
        if (o?[key] is not JsonValue v) return null;
        if (v.TryGetValue<double>(out var d) && double.IsFinite(d)) return d;
        // Values built in code (not parsed from text) hold their CLR type: an int is a number too.
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<long>(out var l)) return l;
        return v.TryGetValue<string>(out var s) && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var p) && double.IsFinite(p) ? p : null;
    }

    internal static List<string> Strings(JsonNode? n) => n is JsonArray a
        ? [.. a.OfType<JsonValue>().Select(v => v.TryGetValue<string>(out var s) ? s : null).Where(s => !string.IsNullOrEmpty(s)).Cast<string>()]
        : [];

    internal static IEnumerable<(JsonObject, int)> Items(JsonObject? o, string key)
    {
        if (o?[key] is not JsonArray a) yield break;
        for (var i = 0; i < a.Count; i++)
            if (a[i] is JsonObject x) yield return (x, i);
    }

    private static T? Enum<T>(JsonObject o, string key, Func<string, T?> f) where T : struct => Str(o, key) is { } s ? f(s) : null;
}
