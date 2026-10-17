using System.Text.Json.Nodes;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Prefs;

/// <summary>
/// Applies a partial, untrusted preferences object (from the PI, later the MCP tools) to <see cref="SmartPreferences"/>.
/// Unknown keys and invalid values are ignored; pins and hidden verbs are edited through their own calls.
/// </summary>
public static class PreferencesPatch
{
    public static readonly string[] LabelSizes = ["none", "small", "normal", "large"];
    public static readonly string[] PagingModes = ["more-key", "none"];

    public static IReadOnlyList<string> Apply(SmartPreferences p, JsonObject patch)
    {
        var ignored = new List<string>();
        foreach (var (key, value) in patch)
        {
            switch (key)
            {
                case "enabled" when Bool(value) is { } b: p.Enabled = b; break;
                case "bigIcons" when Bool(value) is { } b: p.BigIcons = b; break;
                case "streamerSafe" when Bool(value) is { } b: p.StreamerSafe = b; break;
                case "keepLastWhenNoMatch" when Bool(value) is { } b: p.KeepLastWhenNoMatch = b; break;
                case "readoutKeys" when Bool(value) is { } b: p.ReadoutKeys = b; break;
                case "labelSize" when Str(value) is { } s && LabelSizes.Contains(s): p.LabelSize = s; break;
                case "paging" when Str(value) is { } s && PagingModes.Contains(s): p.Paging = s; break;
                case "appDebounceMs" when Int(value) is { } i: p.AppDebounceMs = Math.Clamp(i, 0, 2000); break;
                case "dialCategories" when value is JsonObject o:
                    var map = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var (cat, where) in o)
                    {
                        if (PackParser.ParseCategory(cat) is null || Str(where) is not { } w || !ValidDial(w)) { ignored.Add("dialCategories." + cat); continue; }
                        map[cat] = w;
                    }
                    p.DialCategories = map;
                    break;
                default:
                    ignored.Add(key);
                    break;
            }
        }
        return ignored;
    }

    public static bool ValidDial(string w) => w is "left" or "right" or "0" or "1" or "2" or "3";

    private static bool? Bool(JsonNode? n) => n is JsonValue v && v.TryGetValue<bool>(out var b) ? b
        : n is JsonValue s && s.TryGetValue<string>(out var str) && bool.TryParse(str, out var pb) ? pb : null;

    private static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    private static int? Int(JsonNode? n) => n is JsonValue v && v.TryGetValue<int>(out var i) ? i
        : n is JsonValue d && d.TryGetValue<double>(out var dd) ? (int)dd
        : n is JsonValue s && s.TryGetValue<string>(out var str) && int.TryParse(str, out var pi) ? pi : null;
}
