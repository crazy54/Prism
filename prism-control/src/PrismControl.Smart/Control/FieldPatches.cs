using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Smart.Prefs;

namespace PrismControl.Smart.Control;

/// <summary>One field an AI change touched: where, the value before and the value it set (null = absent).</summary>
public sealed record FieldChange(string Path, JsonNode? Before, JsonNode? After)
{
    public override string ToString() => Path;
}

/// <summary>
/// Field-level inverse patches (review B4). An AI change records only the fields it touched; undo puts back exactly
/// those fields on the CURRENT state, so the user's later, unrelated edits are never wiped, and only a field the user
/// changed again since counts as "changed since". Paths:
/// <list type="bullet">
/// <item>preferences: <c>s:labelSize</c> (scalars), <c>d:camera</c> (dial categories), <c>h:app|verb</c> (hidden),
/// <c>p:app|device|kind|x|y</c> (the item pinned there);</item>
/// <item>an AI override file: <c>v:verb|field</c>, <c>c:control|field</c>.</item>
/// </list>
/// </summary>
public static class FieldPatches
{
    private static readonly string[] Scalars = ["enabled", "labelSize", "bigIcons", "streamerSafe", "paging", "appDebounceMs", "keepLastWhenNoMatch", "readoutKeys"];

    // ================================================================== preferences

    public static Dictionary<string, JsonNode?> Flatten(SmartPreferences p)
    {
        var d = new Dictionary<string, JsonNode?>(StringComparer.Ordinal)
        {
            ["s:enabled"] = p.Enabled,
            ["s:labelSize"] = p.LabelSize,
            ["s:bigIcons"] = p.BigIcons,
            ["s:streamerSafe"] = p.StreamerSafe,
            ["s:paging"] = p.Paging,
            ["s:appDebounceMs"] = p.AppDebounceMs,
            ["s:keepLastWhenNoMatch"] = p.KeepLastWhenNoMatch,
            ["s:readoutKeys"] = p.ReadoutKeys,
        };
        foreach (var (cat, where) in p.DialCategories ?? []) d["d:" + cat] = where;
        foreach (var (app, a) in p.Apps ?? [])
        {
            if (a is null) continue;
            foreach (var h in a.Hidden ?? []) d[$"h:{app}|{h}"] = true;
            foreach (var pin in a.Pins ?? []) d[$"p:{app}|{pin.Device}|{pin.Kind}|{pin.X}|{pin.Y}"] = pin.Item;
        }
        return d;
    }

    public static List<FieldChange> Diff(Dictionary<string, JsonNode?> before, Dictionary<string, JsonNode?> after)
    {
        var changes = new List<FieldChange>();
        foreach (var k in before.Keys.Union(after.Keys).Order(StringComparer.Ordinal))
        {
            var b = before.GetValueOrDefault(k);
            var a = after.GetValueOrDefault(k);
            if (!JsonNode.DeepEquals(b, a)) changes.Add(new FieldChange(k, b?.DeepClone(), a?.DeepClone()));
        }
        return changes;
    }

    public static List<FieldChange> Diff(SmartPreferences before, SmartPreferences after) => Diff(Flatten(before), Flatten(after));

    /// <summary>Sets one preference field (null = remove it), in place.</summary>
    public static void Set(SmartPreferences p, string path, JsonNode? value)
    {
        var kind = path[..2];
        var rest = path[2..];
        switch (kind)
        {
            case "s:":
                if (value is null || !Scalars.Contains(rest)) return;
                PreferencesPatch.Apply(p, new JsonObject { [rest] = value.DeepClone() });
                return;
            case "d:":
                if (value is JsonValue v && v.TryGetValue<string>(out var where)) p.DialCategories[rest] = where;
                else p.DialCategories.Remove(rest);
                return;
            case "h:":
            {
                var (app, id) = Split2(rest);
                var a = AppFor(p, app);
                if (value is null) a.Hidden.RemoveAll(h => h == id);
                else if (!a.Hidden.Contains(id)) a.Hidden.Add(id);
                return;
            }
            case "p:":
            {
                var parts = rest.Split('|');
                if (parts.Length != 5) return;
                var (app, device, slotKind) = (parts[0], parts[1], parts[2]);
                var x = int.Parse(parts[3], CultureInfo.InvariantCulture);
                var y = int.Parse(parts[4], CultureInfo.InvariantCulture);
                var a = AppFor(p, app);
                a.Pins.RemoveAll(q => q.Device == device && q.Kind == slotKind && q.X == x && q.Y == y);
                if (value is JsonValue iv && iv.TryGetValue<string>(out var item))
                {
                    a.Pins.RemoveAll(q => q.Device == device && q.Kind == slotKind && q.Item == item);
                    a.Pins.Add(new SlotPin { Device = device, Kind = slotKind, X = x, Y = y, Item = item });
                }
                return;
            }
        }
    }

    private static AppPreferences AppFor(SmartPreferences p, string app)
    {
        if (!p.Apps.TryGetValue(app, out var a) || a is null) p.Apps[app] = a = new AppPreferences();
        return a;
    }

    private static (string, string) Split2(string s)
    {
        var i = s.IndexOf('|');
        return i < 0 ? (s, "") : (s[..i], s[(i + 1)..]);
    }

    // ================================================================== AI override files

    /// <summary>Every field of every verb/control item of an override file (the id itself excluded).</summary>
    public static Dictionary<string, JsonNode?> Flatten(JsonObject? file)
    {
        var d = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
        if (file is null) return d;
        foreach (var (list, prefix) in new[] { ("verbs", "v:"), ("controls", "c:") })
        {
            if (file[list] is not JsonArray arr) continue;
            foreach (var item in arr.OfType<JsonObject>())
            {
                if (item["id"] is not JsonValue idv || !idv.TryGetValue<string>(out var id)) continue;
                foreach (var (k, v) in item)
                    if (k != "id") d[$"{prefix}{id}|{k}"] = v?.DeepClone();
            }
        }
        return d;
    }

    /// <summary>Sets one field of an override file in place (null = remove it; an item left with only its id goes away).</summary>
    public static void Set(JsonObject file, string path, JsonNode? value)
    {
        var list = path.StartsWith("v:", StringComparison.Ordinal) ? "verbs" : path.StartsWith("c:", StringComparison.Ordinal) ? "controls" : null;
        if (list is null) return;
        var (id, field) = Split2(path[2..]);
        if (file[list] is not JsonArray arr) file[list] = arr = [];
        var item = arr.OfType<JsonObject>().FirstOrDefault(o => o["id"] is JsonValue v && v.TryGetValue<string>(out var s) && s == id);
        if (item is null)
        {
            if (value is null) return;
            arr.Add(item = new JsonObject { ["id"] = id });
        }
        if (value is null) item.Remove(field);
        else item[field] = value.DeepClone();
        if (item.Count <= 1) arr.Remove(item);
        if (arr.Count == 0) file.Remove(list);
    }

    /// <summary>Changes the user made again since the AI's change (the current value is no longer the one it set).</summary>
    public static List<FieldChange> Conflicts(IEnumerable<FieldChange> changes, Dictionary<string, JsonNode?> current) =>
        [.. changes.Where(c => !JsonNode.DeepEquals(current.GetValueOrDefault(c.Path), c.After))];
}
