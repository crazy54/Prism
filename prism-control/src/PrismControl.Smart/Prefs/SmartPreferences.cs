namespace PrismControl.Smart.Prefs;

/// <summary>
/// The user's Smart Deck preferences: global settings section <c>"smart"</c>. Plain data (it travels with the app's
/// global settings): no secrets, no window titles. Edited in the Smart PI and (SD2) by the MCP preference tools.
/// </summary>
public sealed class SmartPreferences
{
    public const string Section = "smart";

    /// <summary>Master switch: off = smart slots show an idle face and run nothing.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary><c>none</c> (icon only) · <c>small</c> · <c>normal</c> · <c>large</c>.</summary>
    public string LabelSize { get; set; } = "normal";

    /// <summary>Bigger glyphs ("big icons").</summary>
    public bool BigIcons { get; set; }

    /// <summary>Streamer-safe: readouts marked streamer-hide (window titles, names) never show; keys keep their labels.</summary>
    public bool StreamerSafe { get; set; }

    /// <summary><c>more-key</c> (overflow verbs on pages behind a MORE key) or <c>none</c> (only page 1, no MORE key).</summary>
    public string Paging { get; set; } = "more-key";

    /// <summary>Dial assignment per category, e.g. <c>{ "camera": "left" }</c>: <c>left</c>, <c>right</c> or a dial index <c>0</c>–<c>3</c>. Beats a pack's proposal.</summary>
    public Dictionary<string, string> DialCategories { get; set; } = new(StringComparer.Ordinal);

    /// <summary>Per app (pack id): pinned verbs and hidden verbs.</summary>
    public Dictionary<string, AppPreferences> Apps { get; set; } = new(StringComparer.Ordinal);

    /// <summary>Global debounce for app switches, 0–2000 ms.</summary>
    public int AppDebounceMs { get; set; } = 150;

    /// <summary>When the app in front has no pack, keep the last pack's layout (dimmed) instead of blanking the deck.</summary>
    public bool KeepLastWhenNoMatch { get; set; } = true;

    /// <summary>On decks without screens, put readouts on spare keys (only when every verb fits on page 1).</summary>
    public bool ReadoutKeys { get; set; } = true;

    /// <summary>
    /// The plugin's write counter (review B5). The plugin is the only writer of this section; a copy of it with a lower
    /// revision that comes back from the Stream Deck app (a property inspector re-sent its stale copy of the whole object
    /// while saving another section) is stale and is not applied. Never set by patches.
    /// </summary>
    public long Rev { get; set; }

    public AppPreferences For(string packId) => Apps.TryGetValue(packId, out var a) && a is not null ? a : AppPreferences.Empty;

    public bool IsPagingOn => !string.Equals(Paging, "none", StringComparison.OrdinalIgnoreCase);

    /// <summary>A deep copy (the engine keeps an immutable snapshot).</summary>
    public SmartPreferences Clone() => new()
    {
        Enabled = Enabled,
        LabelSize = LabelSize,
        BigIcons = BigIcons,
        StreamerSafe = StreamerSafe,
        Paging = Paging,
        DialCategories = new Dictionary<string, string>(DialCategories ?? [], StringComparer.Ordinal),
        Apps = (Apps ?? []).Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value.Clone(), StringComparer.Ordinal),
        AppDebounceMs = Math.Clamp(AppDebounceMs, 0, 2000),
        KeepLastWhenNoMatch = KeepLastWhenNoMatch,
        ReadoutKeys = ReadoutKeys,
        Rev = Rev,
    };
}

public sealed class AppPreferences
{
    public static readonly AppPreferences Empty = new();

    /// <summary>Verbs (keys) and controls (dials) the user pinned to a slot of a device kind.</summary>
    public List<SlotPin> Pins { get; set; } = [];

    /// <summary>Verb and control ids never placed for this app.</summary>
    public List<string> Hidden { get; set; } = [];

    public AppPreferences Clone() => new()
    {
        Pins = [.. (Pins ?? []).Where(p => p is not null).Select(p => new SlotPin { Device = p.Device, Kind = p.Kind, X = p.X, Y = p.Y, Item = p.Item })],
        Hidden = [.. (Hidden ?? []).Where(h => !string.IsNullOrEmpty(h)).Distinct(StringComparer.Ordinal)],
    };
}

/// <summary>
/// One pin: <see cref="Kind"/> <c>key</c> = verb <see cref="Item"/> on key (<see cref="X"/>, <see cref="Y"/>); <c>dial</c> =
/// control <see cref="Item"/> on dial <see cref="X"/>, layer <see cref="Y"/>. <see cref="Device"/> is a device kind
/// (<c>galleon-100-sd</c>, <c>stream-deck-plus</c>, <c>stream-deck-xl</c>, …).
/// </summary>
public sealed class SlotPin
{
    public string Device { get; set; } = "";
    public string Kind { get; set; } = "key";
    public int X { get; set; }
    public int Y { get; set; }
    public string Item { get; set; } = "";
}
