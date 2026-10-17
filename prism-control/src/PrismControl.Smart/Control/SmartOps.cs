using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Core.Devices;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;
using PrismControl.Smart.Profiles;
using PrismControl.Smart.Runtime;

namespace PrismControl.Smart.Control;

/// <summary>A refused operation: a stable code, a message for the assistant, optional data.</summary>
public sealed class OpException(string code, string message, JsonObject? data = null) : Exception(message)
{
    public string Code { get; } = code;
    public JsonObject? Detail { get; } = data;
}

/// <summary>Everything the AI preferences operations reach. The module passes the real pieces; tests pass fakes and temp folders.</summary>
public sealed record SmartOpsParts
{
    public required SmartEngine Engine { get; init; }
    public required PackLibrary Library { get; init; }
    /// <summary>Every pack source the library loads (shipped, plugin, user), for validating an override before it is written.</summary>
    public required Func<IEnumerable<PackSourceFile>> Sources { get; init; }
    /// <summary>Re-reads the packs (and rebinds) after an override file changed.</summary>
    public required Action Reload { get; init; }
    /// <summary>%APPDATA%\Prism\control\packs (the user override folder).</summary>
    public required string UserPackDirectory { get; init; }
    public required PairingService Pairing { get; init; }
    public required ChangeLog Log { get; init; }
    /// <summary>The user's "Allow AI preferences" switch (global section smartai).</summary>
    public required Func<bool> AllowAi { get; init; }
    public required TimeProvider Time { get; init; }
    public bool SafeMode { get; init; }
}

/// <summary>
/// The operations behind the "smart" pipe (and the MCP <c>smart_*</c> tools): status, pairing, preferences, pins,
/// "why is this here", listings, validated user pack overrides and undo. Rules:
/// <list type="bullet">
/// <item>only <c>status</c> and <c>pair</c> work before the user approved the assistant on the deck; everything else needs
/// "Allow AI preferences" on AND the per-pairing secret the approval created (<c>args.pairingSecret</c>, review B3);</item>
/// <item>an AI can only make things stricter: safety only up (safe &lt; never-auto &lt; confirm), streamer-safe never off;</item>
/// <item>an AI binding change is only a PROPOSAL (pending, REVIEW on the deck): it applies after the user approves it
/// locally, becomes confirm for good, and can never be a denylisted chord (Alt+F4, Win+…, Ctrl+Alt+Del …; decision 2);</item>
/// <item>every change is undoable field by field (50 steps) and audited (no secrets);</item>
/// <item>nothing here sends input, presses keys, runs verbs, installs anything or touches another plugin: it edits the
/// Smart Deck's own preferences and the user's own pack override files.</item>
/// </list>
/// </summary>
public sealed partial class SmartOps
{
    public const int Api = 1;
    public const string PendingStatus = "pending your approval on the deck";
    private static readonly JsonSerializerOptions Camel = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static readonly string[] Ops = ["status", "pair", "prefs.get", "prefs.set", "pin", "explain", "list", "override", "undo"];
    private readonly SmartOpsParts p;
    private readonly object _writeGate = new();

    public SmartOps(SmartOpsParts parts)
    {
        p = parts;
        // Every pairing event (pending, approved, denied, expired, revoked) is audited, whoever triggered it (pipe, deck, PI).
        p.Pairing.Changed += (what, req) => p.Log.Record("pair", req?.Client ?? p.Pairing.PairedClient, new JsonObject { ["status"] = what });
    }

    public static IReadOnlyList<string> Operations => Ops;

    /// <summary>Runs one operation for <paramref name="client"/> (the sanitized hello name). Throws <see cref="OpException"/>.</summary>
    public JsonNode Handle(string op, JsonObject? args, string client)
    {
        args ??= [];
        switch (op)
        {
            case "status": return Status(args);
            case "pair": return Pair(args, client);
        }
        if (!Ops.Contains(op)) throw new OpException("unknown_op", $"Unknown operation \"{Short(op)}\". Operations: {string.Join(", ", Ops)}.");
        RequirePaired(args);
        return op switch
        {
            "prefs.get" => PrefsGet(),
            "prefs.set" => Write(() => PrefsSet(args, client)),
            "pin" => Write(() => Pin(args, client)),
            "explain" => Explain(args),
            "list" => List(args),
            "override" => Write(() => Override(args, client)),
            "undo" => Write(() => Undo(args, client)),
            _ => throw new OpException("unknown_op", "Unknown operation."),
        };
    }

    private JsonNode Write(Func<JsonNode> f) { lock (_writeGate) return f(); }

    private bool HoldsPairing(JsonObject args) => p.AllowAi() && p.Pairing.IsValidSecret(Str(args["pairingSecret"]));

    private void RequirePaired(JsonObject args)
    {
        if (!p.AllowAi()) throw new OpException("ai_off", "\"Allow AI preferences\" is off in the Smart Key settings. Only the user can switch it on.");
        if (!p.Pairing.IsValidSecret(Str(args["pairingSecret"])))
            throw new OpException("not_paired", "Not paired (or this client doesn't hold the pairing secret). Call pair, tell the user the 4-digit code, and wait until they press and hold the glowing Smart Key for 1.5 s; the approved poll returns the secret to send with every call.");
    }

    // ================================================================== status + pairing

    /// <summary>
    /// Unpaired callers learn only whether the channel is on and whether a prompt is waiting: never its code or id, the
    /// app in front, packs or device names (review B LOW). The paired client (valid secret) gets the full picture.
    /// </summary>
    public JsonObject Status(JsonObject? args = null)
    {
        var paired = HoldsPairing(args ?? []);
        var pending = p.Pairing.Pending;
        var result = new JsonObject
        {
            ["api"] = Api,
            ["allowAi"] = p.AllowAi(),
            ["paired"] = paired,
            ["pairingPending"] = pending is not null,
            ["operations"] = new JsonArray([.. Ops.Select(o => (JsonNode)o)]),
            ["safeMode"] = p.SafeMode,
        };
        if (!paired) return result;
        var st = p.Engine.Context.Current;
        result["client"] = p.Pairing.PairedClient;
        result["engine"] = new JsonObject
        {
            ["enabled"] = p.Engine.Preferences.Enabled,
            ["app"] = st.App?.ProcessName,
            ["pack"] = st.Pack?.Id,
            ["context"] = st.Context?.Id,
            ["locked"] = p.Engine.Context.IsLocked,
        };
        result["devices"] = Devices();
        result["undoDepth"] = p.Log.UndoDepth;
        result["pendingApprovals"] = new JsonArray([.. PendingReviews().Select(r => (JsonNode)new JsonObject
        {
            ["pack"] = r.Pack, ["verb"] = r.Verb, ["chord"] = r.Chord, ["status"] = PendingStatus,
        })]);
        return result;
    }

    private JsonArray Devices() => new([.. p.Engine.Slots.GroupBy(s => s.Device.Id).Select(g =>
    {
        var d = g.First().Device;
        return (JsonNode)new JsonObject
        {
            ["id"] = d.Id, ["name"] = d.Name, ["kind"] = DeviceGeometry.For(d).Kind, ["type"] = (int)d.Type,
            ["physical"] = PairingService.IsPhysical(d), ["canApprove"] = PairingService.IsPhysical(d) && g.Any(s => s.IsKey),
            ["smartKeys"] = g.Count(s => s.IsKey), ["smartDials"] = g.Count(s => !s.IsKey),
        };
    })]);

    private JsonObject Pair(JsonObject args, string client)
    {
        if (!p.AllowAi()) throw new OpException("ai_off", "\"Allow AI preferences\" is off in the Smart Key settings. Only the user can switch it on.");
        if (Str(args["pairingId"]) is { } id)
        {
            var r = p.Pairing.Find(id) ?? throw new OpException("unknown_pairing", "No such pairing.");
            var poll = new JsonObject { ["pairingId"] = r.Id, ["status"] = r.Status.ToString().ToLowerInvariant(), ["code"] = r.Code, ["expiresAt"] = Iso(r.ExpiresAt) };
            // The per-pairing secret goes out ONCE, to this first poll after the approval; every later call must carry it.
            if (p.Pairing.TakeSecret(r) is { } secret) poll["pairingSecret"] = secret;
            return poll;
        }
        if (HoldsPairing(args)) return new JsonObject { ["status"] = "approved", ["note"] = "already paired" };
        var (req, error, retry) = p.Pairing.Start(Str(args["client"]) ?? client);
        switch (error)
        {
            case PairStartError.NoPhysicalKey:
                throw new OpException("no_physical_key", "No Smart Key is visible on a physical deck. Ask the user to show a page with a Smart Key on a real device (Stream Deck Mobile, the Virtual Stream Deck and the MCP Deck can never approve).");
            case PairStartError.RateLimited:
                throw new OpException("rate_limited", "One pairing request every few seconds.", new JsonObject { ["retryAfterMs"] = (int)Math.Ceiling(retry.TotalMilliseconds) });
            case PairStartError.Pending:
                throw new OpException("pairing_pending", "Another pairing request is waiting for the user. Wait until it is approved, denied or expires (2 min), or ask the user to Deny it in the Smart Key settings.",
                    new JsonObject { ["retryAfterMs"] = (int)Math.Ceiling(retry.TotalMilliseconds) });
        }
        if (req is null) throw new OpException("internal", "Pairing could not start.");
        return new JsonObject
        {
            ["pairingId"] = req.Id, ["status"] = "pending", ["code"] = req.Code, ["expiresAt"] = Iso(req.ExpiresAt),
            ["instructions"] = $"Ask the user to press and hold (1.5 s, until its ring is full) the glowing Smart Key that shows {req.Code} on their deck, within {(int)PairingService.Ttl.TotalSeconds} s. Then poll with {{ pairingId }}: the approved answer carries pairingSecret, which every later call must send.",
        };
    }

    // ================================================================== preferences

    private JsonObject PrefsGet() => new()
    {
        ["prefs"] = JsonSerializer.SerializeToNode(p.Engine.Preferences, Camel),
        ["labelSizes"] = new JsonArray([.. PreferencesPatch.LabelSizes.Select(x => (JsonNode)x)]),
        ["paging"] = new JsonArray([.. PreferencesPatch.PagingModes.Select(x => (JsonNode)x)]),
        ["dialChoices"] = new JsonArray("left", "right", "0", "1", "2", "3"),
        ["categories"] = new JsonArray([.. Enum.GetNames<VerbCategory>().Select(c => (JsonNode)c.ToLowerInvariant())]),
    };

    private static readonly string[] PatchKeys = ["enabled", "labelSize", "bigIcons", "streamerSafe", "paging", "appDebounceMs", "keepLastWhenNoMatch", "readoutKeys", "dialCategories"];

    private JsonObject PrefsSet(JsonObject args, string client)
    {
        var before = p.Engine.Preferences;
        var next = before.Clone();
        var ignored = new List<string>();
        var refused = new JsonArray();
        if (args["patch"] is JsonObject patch)
        {
            var rest = new JsonObject();
            foreach (var (k, v) in patch)
            {
                if (k == "dialCategories")
                {
                    if (v is not JsonObject map) { ignored.Add(k); continue; }
                    foreach (var (cat, where) in map)
                    {
                        if (PackParser.ParseCategory(cat) is null) { ignored.Add("dialCategories." + cat); continue; }
                        if (where is null || (Str(where) is "" or "auto")) { next.DialCategories.Remove(cat); continue; }
                        if (Str(where) is not { } w || !PreferencesPatch.ValidDial(w)) { ignored.Add("dialCategories." + cat); continue; }
                        next.DialCategories[cat] = w;
                    }
                    continue;
                }
                if (!PatchKeys.Contains(k)) { ignored.Add(k); continue; }
                // Lead decision 2: an assistant can turn streamer-safe ON, never off (only the user can, in the PI).
                if (k == "streamerSafe" && before.StreamerSafe && v is JsonValue sv && sv.TryGetValue<bool>(out var on) && !on)
                {
                    refused.Add(new JsonObject { ["field"] = k, ["why"] = "Only the user can turn streamer-safe off." });
                    continue;
                }
                rest[k] = v?.DeepClone();
            }
            ignored.AddRange(PreferencesPatch.Apply(next, rest));
        }
        if (args["hidden"] is JsonObject hidden)
        {
            var app = Str(hidden["app"]) ?? throw new OpException("invalid_argument", "hidden.app (a pack id from list packs) is required.");
            var pack = p.Library.Find(app) ?? throw new OpException("unknown_pack", $"No pack \"{Short(app)}\". Use list {{ what: \"packs\" }}.");
            if (!next.Apps.TryGetValue(app, out var a) || a is null) next.Apps[app] = a = new AppPreferences();
            foreach (var id in Strings(hidden["hide"]))
            {
                if (pack.FindVerb(id) is null && pack.FindControl(id) is null) throw new OpException("unknown_item", $"{pack.Name} has no verb or control \"{Short(id)}\".");
                if (!a.Hidden.Contains(id)) a.Hidden.Add(id);
                a.Pins.RemoveAll(x => x.Item == id);
            }
            foreach (var id in Strings(hidden["unhide"])) a.Hidden.RemoveAll(h => h == id);
        }
        var changes = FieldPatches.Diff(before, next);
        var beforeJson = JsonSerializer.SerializeToNode(before, Camel)!;
        var afterJson = JsonSerializer.SerializeToNode(next, Camel)!;
        var changedKeys = ((JsonObject)afterJson).Select(kv => kv.Key).Where(k => !JsonNode.DeepEquals(beforeJson[k], afterJson[k])).ToList();
        if (changes.Count == 0)
        {
            if (refused.Count > 0) throw new OpException("not_allowed", "Only the user can turn streamer-safe off.", new JsonObject { ["refused"] = refused });
            if (ignored.Count > 0) throw new OpException("invalid_argument", $"Nothing valid to change. Ignored: {string.Join(", ", ignored)}.", new JsonObject { ["ignored"] = Arr(ignored) });
            return new JsonObject { ["changed"] = new JsonArray(), ["ignored"] = Arr(ignored), ["prefs"] = beforeJson, ["undoDepth"] = p.Log.UndoDepth };
        }
        if (args["dryRun"] is JsonValue dr && dr.TryGetValue<bool>(out var dry) && dry)
            return new JsonObject { ["dryRun"] = true, ["changed"] = Arr(changedKeys), ["ignored"] = Arr(ignored), ["refused"] = refused, ["prefs"] = afterJson };
        Apply(next);
        var summary = "prefs: " + string.Join(", ", changedKeys);
        p.Log.Push(new PrefsUndo("prefs.set", summary, p.Time.GetUtcNow(), changes));
        p.Log.Record("prefs.set", client, new JsonObject { ["changed"] = Arr(changedKeys), ["ignored"] = Arr(ignored), ["refused"] = Arr(refused.Select(r => (string)r!["field"]!)) });
        return new JsonObject { ["changed"] = Arr(changedKeys), ["ignored"] = Arr(ignored), ["refused"] = refused, ["prefs"] = afterJson, ["undoDepth"] = p.Log.UndoDepth };
    }

    private void Apply(SmartPreferences prefs) => p.Engine.UpdatePreferences(prefs, save: true);

    // ================================================================== pins

    private JsonObject Pin(JsonObject args, string client)
    {
        var app = Str(args["app"]) ?? throw new OpException("invalid_argument", "app (a pack id from list packs) is required.");
        var pack = p.Library.Find(app) ?? throw new OpException("unknown_pack", $"No pack \"{Short(app)}\". Use list {{ what: \"packs\" }}.");
        var (kind, device) = DeviceKind(Str(args["device"]) ?? Str(args["deviceId"]));
        var slotKind = Str(args["kind"]) ?? "key";
        if (slotKind is not ("key" or "dial")) throw new OpException("invalid_argument", "kind must be \"key\" or \"dial\".");
        var x = Int(args["x"]) ?? throw new OpException("invalid_argument", slotKind == "key" ? "x (column) is required." : "x (dial index) is required.");
        var y = Int(args["y"]) ?? 0;
        var slot = new ProfileSlot(slotKind == "key", x, y);
        if (!device.Contains(slot)) throw new OpException("invalid_slot", $"{slot} is not on a {device.Name} ({device.Columns}×{device.Rows} keys{(device.HasDials ? $", {device.Dials} dials × {device.Layers} layer(s)" : ", no dials")}).");
        var unpin = args["unpin"] is JsonValue uv && uv.TryGetValue<bool>(out var u) && u;
        var before = p.Engine.Preferences;
        var next = before.Clone();
        if (!next.Apps.TryGetValue(app, out var a) || a is null) next.Apps[app] = a = new AppPreferences();
        string? item = null;
        if (unpin)
        {
            var removed = a.Pins.RemoveAll(q => q.Device == kind && q.Kind == slotKind && q.X == x && q.Y == y);
            if (removed == 0) throw new OpException("nothing_pinned", $"Nothing is pinned to {slot} on {device.Name} for {pack.Name}.");
        }
        else
        {
            item = Str(args["item"]) ?? throw new OpException("invalid_argument", "item (a verb id for a key, a control id for a dial) is required.");
            IReadOnlyList<string> contexts;
            if (slotKind == "key") contexts = (pack.FindVerb(item) ?? throw new OpException("unknown_item", $"{pack.Name} has no verb \"{Short(item)}\" (list verbs).")).Contexts;
            else contexts = (pack.FindControl(item) ?? throw new OpException("unknown_item", $"{pack.Name} has no dial control \"{Short(item)}\" (list controls).")).Contexts;
            if (Str(args["context"]) is { } ctx)
            {
                if (pack.FindContext(ctx) is null) throw new OpException("unknown_context", $"{pack.Name} has no context \"{Short(ctx)}\".");
                if (pack.ValidityTier(contexts, ctx) < 0) throw new OpException("not_in_context", $"{item} isn't available in {ctx}; it exists in: {string.Join(", ", contexts)}.");
            }
            if (a.Hidden.Contains(item)) a.Hidden.Remove(item);
            a.Pins.RemoveAll(q => q.Device == kind && q.Kind == slotKind && ((q.X == x && q.Y == y) || q.Item == item));
            a.Pins.Add(new SlotPin { Device = kind, Kind = slotKind, X = x, Y = y, Item = item });
        }
        if (args["dryRun"] is JsonValue dr && dr.TryGetValue<bool>(out var dry) && dry)
            return new JsonObject { ["dryRun"] = true, ["pins"] = PinsJson(next, app, kind) };
        Apply(next);
        var summary = unpin ? $"unpin {app} {kind} {slot}" : $"pin {item} → {app} {kind} {slot}";
        p.Log.Push(new PrefsUndo(unpin ? "unpin" : "pin", summary, p.Time.GetUtcNow(), FieldPatches.Diff(before, next)));
        p.Log.Record(unpin ? "unpin" : "pin", client, new JsonObject { ["app"] = app, ["device"] = kind, ["slot"] = slot.ToString(), ["item"] = item });
        return new JsonObject
        {
            ["pins"] = PinsJson(next, app, kind),
            ["note"] = "A pin keeps that verb in that slot for this app in every context where the verb exists, on every deck of this kind. Pins on slots that hold one of your fixed (pinned) profile actions are ignored.",
            ["undoDepth"] = p.Log.UndoDepth,
        };
    }

    private static JsonArray PinsJson(SmartPreferences prefs, string app, string kind) =>
        new([.. prefs.For(app).Pins.Where(q => q.Device == kind).Select(q => (JsonNode)new JsonObject { ["kind"] = q.Kind, ["x"] = q.X, ["y"] = q.Y, ["item"] = q.Item })]);

    /// <summary>A device kind or the id of a connected deck → (kind, geometry for slot checks).</summary>
    private (string Kind, ProfileDevice Device) DeviceKind(string? deviceOrId)
    {
        if (string.IsNullOrWhiteSpace(deviceOrId)) throw new OpException("invalid_argument", $"device is required: a kind ({string.Join(", ", ProfileDevices.All.Select(d => d.Kind))}) or a deviceId from status.");
        var connected = p.Engine.Slots.Select(s => s.Device).FirstOrDefault(d => d.Id == deviceOrId);
        if (connected is not null)
        {
            var pd = ProfileDevices.For(connected) ?? throw new OpException("unknown_device", $"{connected.Name} has no Smart Deck layout.");
            return (pd.Kind, pd);
        }
        var byKind = ProfileDevices.Find(deviceOrId) ?? throw new OpException("unknown_device", $"Unknown device \"{Short(deviceOrId)}\". Use a kind ({string.Join(", ", ProfileDevices.All.Select(d => d.Kind))}) or a deviceId from status.");
        return (byKind.Kind, byKind);
    }

    // ================================================================== explain

    private JsonObject Explain(JsonObject args)
    {
        var slotKind = Str(args["kind"]) ?? "key";
        var x = Int(args["x"]) ?? throw new OpException("invalid_argument", "x is required.");
        var y = Int(args["y"]) ?? 0;
        var slots = p.Engine.Slots;
        var deviceArg = Str(args["deviceId"]) ?? Str(args["device"]);
        var candidates = slots.Where(s => deviceArg is null || s.Device.Id == deviceArg || DeviceGeometry.For(s.Device).Kind == deviceArg).ToList();
        if (candidates.Count == 0) throw new OpException("unknown_device", "No deck with Smart slots matches. Use a deviceId from status.");
        if (candidates.Select(s => s.Device.Id).Distinct().Count() > 1) throw new OpException("ambiguous_device", "Several decks match; pass a deviceId from status.");
        var device = candidates[0].Device;
        var slot = candidates.FirstOrDefault(s => s.IsKey == (slotKind == "key") && (s.IsKey ? s.Key.X == x && s.Key.Y == y : s.Dial.Dial == x && s.Dial.Layer == y));
        if (slot is null)
            return new JsonObject
            {
                ["device"] = device.Name,
                ["slot"] = $"{slotKind}:{x},{y}",
                ["smart"] = false,
                ["why"] = $"There is no Smart {(slotKind == "key" ? "Key" : "Dial")} at {slotKind}:{x},{y} on the {device.Name}: it holds one of the user's fixed (pinned) profile actions, another plugin's action, or nothing. Prism never changes those.",
            };
        var inspect = JsonSerializer.SerializeToNode(p.Engine.Inspect(slot), Camel) as JsonObject ?? [];
        inspect["smart"] = true;
        inspect["deviceName"] = device.Name;
        return inspect;
    }

    // ================================================================== list

    private JsonObject List(JsonObject args)
    {
        var what = Str(args["what"]) ?? "packs";
        ContextPack Pack() => Str(args["pack"]) is { } id ? p.Library.Find(id) ?? throw new OpException("unknown_pack", $"No pack \"{Short(id)}\".")
            : throw new OpException("invalid_argument", "pack is required for " + what + ".");
        var prefs = p.Engine.Preferences;
        switch (what)
        {
            case "packs":
                return new JsonObject
                {
                    ["packs"] = new JsonArray([.. p.Library.Packs.Select(k => (JsonNode)new JsonObject
                    {
                        ["id"] = k.Id, ["name"] = k.Name, ["kind"] = k.Kind.ToString().ToLowerInvariant(), ["layer"] = k.Layer.ToString().ToLowerInvariant(),
                        ["policy"] = k.Policy.Class.ToString(), ["displayOnly"] = k.IsDisplayOnly, ["origin"] = k.Origin.ToString().ToLowerInvariant(),
                        ["contexts"] = k.Contexts.Count, ["verbs"] = k.Verbs.Count, ["controls"] = k.Controls.Count,
                    })]),
                };
            case "contexts":
            {
                var k = Pack();
                return new JsonObject { ["pack"] = k.Id, ["contexts"] = new JsonArray([.. k.Contexts.Select(c => (JsonNode)new JsonObject { ["id"] = c.Id, ["label"] = c.Label, ["default"] = c.IsDefault, ["parent"] = c.Parent })]) };
            }
            case "verbs":
            {
                var k = Pack();
                var ctx = Str(args["context"]);
                var hidden = prefs.For(k.Id).Hidden;
                return new JsonObject
                {
                    ["pack"] = k.Id,
                    ["verbs"] = new JsonArray([.. k.Verbs.Where(v => ctx is null || k.ValidityTier(v.Contexts, ctx) >= 0).Select(v => (JsonNode)new JsonObject
                    {
                        ["id"] = v.Id, ["label"] = v.Label, ["longLabel"] = v.LongLabel, ["category"] = v.Category.ToString().ToLowerInvariant(), ["priority"] = v.Priority,
                        ["safety"] = SafetyRules.Name(p.Engine.EffectiveSafety(v)), ["binding"] = p.Engine.Effective(v).Describe(), ["contexts"] = Arr(v.Contexts), ["hidden"] = hidden.Contains(v.Id),
                        ["aiBound"] = v.AiBound, ["pendingBinding"] = v.PendingBinding?.Describe(), ["pending"] = v.PendingBinding is null ? null : PendingStatus,
                    })]),
                };
            }
            case "controls":
            {
                var k = Pack();
                var ctx = Str(args["context"]);
                return new JsonObject
                {
                    ["pack"] = k.Id,
                    ["controls"] = new JsonArray([.. k.Controls.Where(c => ctx is null || k.ValidityTier(c.Contexts, ctx) >= 0).Select(c => (JsonNode)new JsonObject
                    {
                        ["id"] = c.Id, ["label"] = c.Label, ["category"] = c.Category.ToString().ToLowerInvariant(), ["priority"] = c.Priority,
                        ["push"] = c.PushVerb, ["turn"] = $"{c.Turn.Left.Describe()} / {c.Turn.Right.Describe()}", ["contexts"] = Arr(c.Contexts),
                    })]),
                };
            }
            case "devices":
                return new JsonObject { ["devices"] = Devices(), ["kinds"] = new JsonArray([.. ProfileDevices.All.Select(d => (JsonNode)new JsonObject { ["kind"] = d.Kind, ["name"] = d.Name, ["columns"] = d.Columns, ["rows"] = d.Rows, ["dials"] = d.Dials, ["layers"] = d.Layers })]) };
            case "pins":
                return new JsonObject { ["apps"] = JsonSerializer.SerializeToNode(prefs.Apps, Camel) };
            case "history":
                return new JsonObject { ["undo"] = new JsonArray([.. p.Log.Entries.Reverse().Select(e => (JsonNode)new JsonObject { ["kind"] = e.Kind, ["summary"] = e.Summary, ["at"] = Iso(e.At) })]) };
            default:
                throw new OpException("invalid_argument", "what must be one of: packs, contexts, verbs, controls, devices, pins, history.");
        }
    }

    // ================================================================== overrides

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,47}$")]
    private static partial Regex GlyphPattern();

    [GeneratedRegex("^[A-Za-z0-9+&#]{1,3}$")]
    private static partial Regex MonogramPattern();

    /// <summary>The file an override for <paramref name="packId"/> lives in. It loads before every hand-written file of the user, so their own edits win.</summary>
    public string OverrideFile(string packId) => Path.Combine(p.UserPackDirectory, packId + ".ai.json");

    private JsonObject Override(JsonObject args, string client)
    {
        var packId = Str(args["pack"]) ?? throw new OpException("invalid_argument", "pack is required.");
        var pack = p.Library.Find(packId) ?? throw new OpException("unknown_pack", $"No pack \"{Short(packId)}\".");
        if (args["items"] is not JsonArray items || items.Count is 0 or > 32) throw new OpException("invalid_argument", "items must hold 1–32 { type, id, set } changes.");
        var verbs = new JsonArray();
        var controls = new JsonArray();
        var changes = new JsonArray();
        var pending = new JsonArray();
        var at = Iso(p.Time.GetUtcNow());
        foreach (var n in items)
        {
            if (n is not JsonObject it) throw new OpException("invalid_argument", "Each item is { type: \"verb\" | \"control\", id, set: { … } }.");
            var type = Str(it["type"]) ?? "verb";
            var id = Str(it["id"]) ?? throw new OpException("invalid_argument", "item.id is required.");
            if (it["set"] is not JsonObject set || set.Count == 0) throw new OpException("invalid_argument", $"{id}: set must name at least one field.");
            var patch = new JsonObject { ["id"] = id };
            if (type == "verb")
            {
                var v = pack.FindVerb(id) ?? throw new OpException("unknown_item", $"{pack.Name} has no verb \"{Short(id)}\" (list verbs).");
                var safety = p.Engine.EffectiveSafety(v);
                foreach (var (k, val) in set)
                {
                    if (k == "binding")
                    {
                        // Lead decision 2: never applied directly. It waits (REVIEW) for the user's approval on the deck or in the PI.
                        var chord = AiChord(pack, v, val);
                        patch["pendingBinding"] = new JsonObject { ["kind"] = "chord", ["chord"] = chord.ToString(), ["client"] = client, ["at"] = at };
                        pending.Add(new JsonObject { ["id"] = id, ["chord"] = chord.ToString(), ["status"] = PendingStatus });
                    }
                    else patch[k] = CommonField(id, k, val, allowSafety: true, current: safety);
                }
                verbs.Add(patch);
            }
            else if (type == "control")
            {
                var c = pack.FindControl(id) ?? throw new OpException("unknown_item", $"{pack.Name} has no control \"{Short(id)}\" (list controls).");
                foreach (var (k, val) in set) patch[k] = CommonField(id, k, val, allowSafety: false, current: c.Safety);
                controls.Add(patch);
            }
            else throw new OpException("invalid_argument", $"{id}: type must be \"verb\" or \"control\".");
            var shown = (JsonObject)patch.DeepClone();
            if (shown["pendingBinding"] is JsonObject pb) shown["pendingBinding"] = pb["chord"]?.DeepClone();
            changes.Add(shown);
        }

        // Merge into this pack's existing AI override file (property by property, per item id: the library's own rules).
        var file = OverrideFile(pack.Id);
        var existing = ReadOverride(file, pack.Id);
        var delta = new JsonObject { ["id"] = pack.Id };
        if (verbs.Count > 0) delta["verbs"] = verbs;
        if (controls.Count > 0) delta["controls"] = controls;
        var merged = PackMerger.MergeOverride(existing, delta);
        merged["id"] = pack.Id;
        var text = merged.ToJsonString(Indented) + "\n";

        // Validate the way the library loads it: every source + this file in place of the old one.
        var (problems, after) = Trial(pack.Id, text);
        if (after is null) throw new OpException("invalid_override", "The pack would not load with this override; nothing was written.", new JsonObject { ["problems"] = Arr(problems) });
        foreach (var change in changes.OfType<JsonObject>())
        {
            var id = (string)change["id"]!;
            if (verbs.Any(x => (string?)x!["id"] == id) && after.FindVerb(id) is { } nv)
            {
                if (change["label"] is JsonValue l && nv.Label != l.GetValue<string>()) problems.Add($"{id}: label did not take");
                if (change["pendingBinding"] is not null && nv.PendingBinding is not ChordBinding) problems.Add($"{id}: the proposed binding did not take");
            }
        }
        var beforeErrors = p.Library.Status.FirstOrDefault(s => s.Id == pack.Id)?.Errors ?? 0;
        var newErrors = problems.Count(x => x.StartsWith("error", StringComparison.Ordinal)) - beforeErrors;
        if (newErrors > 0 || problems.Any(x => x.Contains("did not take", StringComparison.Ordinal)))
            throw new OpException("invalid_override", "The override has problems; nothing was written.", new JsonObject { ["problems"] = Arr(problems) });
        if (args["dryRun"] is JsonValue dr && dr.TryGetValue<bool>(out var dry) && dry)
            return new JsonObject { ["dryRun"] = true, ["valid"] = true, ["file"] = Display(file), ["changes"] = changes, ["pending"] = pending };
        if (p.SafeMode) throw new OpException("safe_mode", "Safe mode: override files are never written (dryRun works).");
        Directory.CreateDirectory(p.UserPackDirectory);
        WriteAtomic(file, text);
        p.Reload();
        var fieldChanges = FieldPatches.Diff(FieldPatches.Flatten(existing), FieldPatches.Flatten(merged));
        p.Log.Push(new FileUndo("override", $"override {pack.Id}: {string.Join(", ", changes.Select(c => (string?)c!["id"]))}", p.Time.GetUtcNow(), file, pack.Id, fieldChanges));
        p.Log.Record("override", client, new JsonObject
        {
            ["pack"] = pack.Id,
            ["items"] = new JsonArray([.. changes.Select(c => (JsonNode)new JsonObject { ["id"] = (string?)c!["id"], ["fields"] = Arr(((JsonObject)c).Select(kv => kv.Key).Where(k => k != "id")) })]),
            ["pending"] = pending.Count,
        });
        var result = new JsonObject { ["written"] = true, ["file"] = Display(file), ["changes"] = changes, ["undoDepth"] = p.Log.UndoDepth, ["pending"] = pending };
        if (pending.Count > 0)
            result["note"] = "Binding changes are proposals: they are " + PendingStatus + ". The Smart Key shows REVIEW; the user holds it (on a physical deck) or presses Approve in the Smart Key settings. Until then the old key runs. An approved AI binding is always hold-to-confirm.";
        return result;
    }

    /// <summary>The chord an AI may propose for <paramref name="v"/>, or a refusal (kind, denylist, display-only, global hotkeys).</summary>
    private static Chord AiChord(ContextPack pack, PackVerb v, JsonNode? val)
    {
        if (pack.IsDisplayOnly) throw new OpException("not_allowed", $"{pack.Name} is display-only: its verbs never send input.");
        if (val is not JsonObject b || Str(b["kind"]) != "chord" || Str(b["chord"]) is not { } chordText)
            throw new OpException("not_allowed", $"{v.Id}: only {{ \"kind\": \"chord\", \"chord\": \"Ctrl+Alt+Z\" }} bindings can be proposed (no text, macros, mouse, module or Sight bindings).");
        if (!Chord.TryParse(chordText, out var chord, out var error)) throw new OpException("invalid_chord", $"{v.Id}: \"{Short(chordText)}\" is not a chord ({error}).");
        if (ChordPolicy.AiForbidden(chord) is { } why) throw new OpException("not_allowed", $"{v.Id}: {chord} can never be set by an assistant ({why}).", new JsonObject { ["chord"] = chord.ToString(), ["denylisted"] = true });
        if (v.Binding is not (ChordBinding or UnboundBinding or SequenceBinding or RepeatBinding))
            throw new OpException("not_allowed", $"{v.Id} is a {v.Binding.Kind} binding; only keyboard shortcuts can be rebound here.");
        if (v.IsGlobal) throw new OpException("not_allowed", $"{v.Id} is the app's own system-wide hotkey; its key can't be changed here.");
        return chord;
    }

    private static JsonNode? CommonField(string id, string key, JsonNode? val, bool allowSafety, Safety current)
    {
        switch (key)
        {
            case "label":
                return Str(val) is { Length: >= 1 and <= 12 } l ? l : throw new OpException("invalid_argument", $"{id}: label must be 1–12 characters (it has to fit a key).");
            case "longLabel":
                return Str(val) is { Length: >= 1 and <= 60 } ll ? ll : throw new OpException("invalid_argument", $"{id}: longLabel must be 1–60 characters.");
            case "glyph":
                return Str(val) is { } g && GlyphPattern().IsMatch(g) ? g : throw new OpException("invalid_argument", $"{id}: glyph must be a glyph name like \"camera\" (list them in the PI).");
            case "monogram":
                return Str(val) is { } m && MonogramPattern().IsMatch(m) ? m : throw new OpException("invalid_argument", $"{id}: monogram must be 1–3 letters.");
            case "priority":
                return Int(val) is { } pr and >= 0 and <= 100 ? pr : throw new OpException("invalid_argument", $"{id}: priority must be 0–100.");
            case "category":
                return Str(val) is { } c && PackParser.ParseCategory(c) is not null ? c : throw new OpException("invalid_argument", $"{id}: unknown category (primary, tool, mode, nav, camera, system, toggle, readout).");
            case "safety" when allowSafety:
            {
                var s = Str(val);
                var next = SafetyRules.Parse(s) ?? throw new OpException("invalid_argument", $"{id}: safety is safe, confirm or never-auto.");
                // B1: strictness ranks safe < never-auto < confirm, and an assistant may only move it UP.
                if (SafetyRules.Rank(next) < SafetyRules.Rank(current))
                    throw new OpException("not_allowed", $"{id}: safety can only be made stricter (safe < never-auto < confirm): {SafetyRules.Name(current)} → {s} would loosen it.");
                return s;
            }
            default:
                throw new OpException("not_allowed", $"{id}: \"{Short(key)}\" can't be overridden here. Allowed: label, longLabel, glyph, monogram, priority, category" + (allowSafety ? ", safety (stricter only), binding (a chord, proposed for the user's approval)." : "."));
        }
    }

    /// <summary>Loads every pack with <paramref name="text"/> as the pack's AI override file. Returns the problems for that pack and the result.</summary>
    private (List<string> Problems, ContextPack? Pack) Trial(string packId, string? text)
    {
        var name = "user:" + packId + ".ai.json";
        var sources = p.Sources().Where(f => f.Name != name);
        if (text is not null) sources = sources.Append(new PackSourceFile(name, PackOrigin.User, text));
        var lib = new PackLibrary(() => sources);
        lib.Reload();
        var st = lib.Status.FirstOrDefault(s => s.Id == packId);
        var problems = st?.Problems.Select(x => x.ToString()).ToList() ?? ["error: the pack vanished"];
        return (problems, lib.Find(packId));
    }

    private static JsonObject ReadOverride(string file, string packId)
    {
        if (!File.Exists(file)) return new JsonObject { ["id"] = packId };
        try { return JsonNode.Parse(File.ReadAllText(file)) as JsonObject ?? new JsonObject { ["id"] = packId }; }
        catch (JsonException) { return new JsonObject { ["id"] = packId }; }
    }

    // ================================================================== AI proposals waiting for the user (REVIEW)

    /// <summary>One AI binding proposal waiting for the user.</summary>
    public sealed record PendingReview(string Pack, string Verb, string Label, string Current, string Chord, string? Client, string? At);

    /// <summary>Every proposal in the user's AI override files (the file's own pack; inherited copies are not repeated).</summary>
    public IReadOnlyList<PendingReview> PendingReviews()
    {
        var list = new List<PendingReview>();
        if (!Directory.Exists(p.UserPackDirectory)) return list;
        foreach (var f in Directory.GetFiles(p.UserPackDirectory, "*.ai.json").Order(StringComparer.OrdinalIgnoreCase))
        {
            var packId = Path.GetFileName(f)[..^".ai.json".Length];
            var json = ReadOverride(f, packId);
            if (json["verbs"] is not JsonArray verbs) continue;
            var pack = p.Library.Find(packId);
            foreach (var v in verbs.OfType<JsonObject>())
            {
                if (Str(v["id"]) is not { } id || v["pendingBinding"] is not JsonObject pb || Str(pb["chord"]) is not { } chord) continue;
                var verb = pack?.FindVerb(id);
                list.Add(new PendingReview(packId, id, verb?.Label ?? id, verb is null ? "?" : p.Engine.Effective(verb).Describe(), chord, Str(pb["client"]), Str(pb["at"])));
            }
        }
        return list;
    }

    /// <summary>
    /// The USER approves an AI proposal (the PI button, or a hold on the REVIEW key of a physical deck): the chord becomes
    /// the verb's binding, the verb becomes confirm for good and is badged "AI". Never reachable from the pipe. Returns an
    /// error message, or null when it was applied. Not on the AI's undo stack (it is the user's own decision).
    /// </summary>
    public string? ApproveReview(string packId, string verbId, string by) => Review(packId, verbId, by, approve: true);

    /// <summary>The user rejects an AI proposal: it is removed; the verb keeps its key.</summary>
    public string? RejectReview(string packId, string verbId, string by) => Review(packId, verbId, by, approve: false);

    private string? Review(string packId, string verbId, string by, bool approve)
    {
        lock (_writeGate)
        {
            // The proposal lives in the file of the pack it was made for: this one or a parent it extends.
            var file = PackAndParents(packId).Select(OverrideFile).FirstOrDefault(f => ReadOverride(f, packId)["verbs"] is JsonArray arr
                && arr.OfType<JsonObject>().Any(o => Str(o["id"]) == verbId && o["pendingBinding"] is JsonObject));
            if (file is null) return "no proposal is waiting for this key";
            var ownerPack = Path.GetFileName(file)[..^".ai.json".Length];
            var json = ReadOverride(file, ownerPack);
            var item = ((JsonArray)json["verbs"]!).OfType<JsonObject>().First(o => Str(o["id"]) == verbId);
            var pb = (JsonObject)item["pendingBinding"]!;
            var chordText = Str(pb["chord"]) ?? "";
            var client = Str(pb["client"]);
            item.Remove("pendingBinding");
            if (approve)
            {
                // Checked again: the denylist, a keyboard verb, not display-only.
                if (!Chord.TryParse(chordText, out var chord, out _)) return "the proposal is not a valid chord";
                if (ChordPolicy.AiForbidden(chord) is { } why) return why;
                var pack = p.Library.Find(ownerPack);
                var verb = pack?.FindVerb(verbId);
                if (pack is null || verb is null) return "the verb is gone";
                if (pack.IsDisplayOnly || verb.IsGlobal || verb.Binding is not (ChordBinding or UnboundBinding or SequenceBinding or RepeatBinding)) return "this verb's key can't be changed";
                item["binding"] = new JsonObject { ["kind"] = "chord", ["chord"] = chord.ToString() };
                item["safety"] = "confirm";
                item["aiBound"] = true;
            }
            if (item.Count <= 1) ((JsonArray)json["verbs"]!).Remove(item);
            var text = json.ToJsonString(Indented) + "\n";
            var (problems, after) = Trial(ownerPack, text);
            if (after is null) return "the pack would not load: " + string.Join("; ", problems.Take(2));
            if (p.SafeMode) return "safe mode: override files are never written";
            WriteAtomic(file, text);
            p.Reload();
            p.Log.Record(approve ? "review.approve" : "review.reject", client, new JsonObject { ["pack"] = ownerPack, ["verb"] = verbId, ["chord"] = chordText, ["by"] = by });
            return null;
        }
    }

    private IEnumerable<string> PackAndParents(string packId)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>([packId]);
        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            if (!seen.Add(id)) continue;
            yield return id;
            foreach (var parent in p.Library.Find(id)?.Extends ?? []) queue.Enqueue(parent);
        }
    }

    // ================================================================== undo

    /// <summary>Fields an undo never puts back, because that would LOOSEN something (an AI only ever tightens; decision 2).</summary>
    private static string? Kept(FieldChange c) => c.Path switch
    {
        "s:streamerSafe" when c.Before is JsonValue b && b.TryGetValue<bool>(out var was) && !was => "streamer-safe stays on: only you can turn it off",
        var path when path.EndsWith("|safety", StringComparison.Ordinal) => "safety stays as strict as it is: only you can loosen it",
        _ => null,
    };

    private JsonObject Undo(JsonObject args, string client)
    {
        var steps = Math.Clamp(Int(args["steps"]) ?? 1, 1, ChangeLog.Depth);
        var force = args["force"] is JsonValue fv && fv.TryGetValue<bool>(out var f) && f;
        var undone = new JsonArray();
        var kept = new JsonArray();
        try
        {
            for (var i = 0; i < steps; i++)
            {
                var e = p.Log.Peek();
                if (e is null) break;
                var apply = e.Changes.Where(c => Kept(c) is null).ToList();
                foreach (var c in e.Changes.Where(c => Kept(c) is not null)) kept.Add($"{c.Path}: {Kept(c)}");
                switch (e)
                {
                    case PrefsUndo:
                    {
                        var prefs = p.Engine.Preferences;
                        var conflicts = FieldPatches.Conflicts(apply, FieldPatches.Flatten(prefs));
                        if (!force && conflicts.Count > 0)
                            throw new OpException("changed_since", $"The user changed {string.Join(", ", conflicts.Select(c => c.Path[2..]))} after \"{e.Summary}\". Undo with force: true to put back the values from before that change anyway (nothing else is touched).",
                                new JsonObject { ["undone"] = undone.DeepClone(), ["fields"] = Arr(conflicts.Select(c => c.Path)) });
                        foreach (var c in apply) FieldPatches.Set(prefs, c.Path, c.Before);
                        Apply(prefs);
                        break;
                    }
                    case FileUndo fu:
                    {
                        var json = ReadOverride(fu.Path, fu.PackId);
                        var conflicts = FieldPatches.Conflicts(apply, FieldPatches.Flatten(json));
                        if (!force && conflicts.Count > 0)
                            throw new OpException("changed_since", $"{Display(fu.Path)} changed since \"{fu.Summary}\" ({string.Join(", ", conflicts.Select(c => c.Path[2..]))}: edited by hand, or a proposal the user approved or rejected). Undo with force: true to put back those fields anyway.",
                                new JsonObject { ["undone"] = undone.DeepClone(), ["fields"] = Arr(conflicts.Select(c => c.Path)) });
                        if (p.SafeMode) throw new OpException("safe_mode", "Safe mode: override files are never written.", new JsonObject { ["undone"] = undone.DeepClone() });
                        foreach (var c in apply) FieldPatches.Set(json, c.Path, c.Before);
                        if (json.Count <= 1) { if (File.Exists(fu.Path)) File.Delete(fu.Path); }
                        else WriteAtomic(fu.Path, json.ToJsonString(Indented) + "\n");
                        p.Reload();
                        break;
                    }
                }
                p.Log.Pop(e);
                undone.Add(e.Summary);
            }
        }
        finally
        {
            // Steps already undone are audited even when a later step stopped the call (review B LOW).
            if (undone.Count > 0) p.Log.Record("undo", client, new JsonObject { ["steps"] = undone.Count, ["undone"] = undone.DeepClone(), ["kept"] = kept.Count });
        }
        if (undone.Count == 0) throw new OpException("nothing_to_undo", "There are no AI changes left to undo.");
        var result = new JsonObject { ["undone"] = undone, ["remaining"] = p.Log.UndoDepth };
        if (kept.Count > 0) result["kept"] = kept;
        return result;
    }

    // ================================================================== helpers

    private static void WriteAtomic(string file, string text)
    {
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, text);
        File.Move(tmp, file, overwrite: true);
    }

    /// <summary>A path as shown to the assistant: relative to the per-user Prism folder or the user's home, never the user name.</summary>
    public static string Display(string path)
    {
        var prism = PrismControl.Desktop.DesktopPaths.UserDirectory;
        if (path.StartsWith(prism + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return @"%APPDATA%\Prism\control\" + path[(prism.Length + 1)..];
        return ProfileWizard.Display(path);
    }

    private static string Iso(DateTimeOffset t) => t.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture);
    private static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
    private static int? Int(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<double>(out var d) && d == Math.Floor(d) && Math.Abs(d) < 1e6) return (int)d;
        return null;
    }
    private static IEnumerable<string> Strings(JsonNode? n) => n is JsonArray a ? a.Select(Str).Where(s => !string.IsNullOrEmpty(s)).Select(s => s!) : Str(n) is { } one ? [one] : [];
    private static JsonArray Arr(IEnumerable<string> items) => new([.. items.Select(x => (JsonNode)x)]);
    private static string Short(string? s) => s is null ? "" : s.Length <= 40 ? s : s[..40] + "…";
}
