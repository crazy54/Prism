using System.Text.Json.Nodes;

namespace PrismControl.Smart.Profiles;

/// <summary>One pinned slot of the setup: an existing Prism Control action, fixed in that slot.</summary>
public sealed record ProfilePin(ProfileSlot Slot, PinnableAction Action, string? App = null);

/// <summary>
/// The user's setup choice for one device: which slots are pinned and to what. Every other slot becomes a Smart Key or
/// Smart Dial. Built from defaults or from untrusted JSON (the PI wizard) with <see cref="Parse"/>, which validates every pin.
/// </summary>
public sealed record ProfileSetup(ProfileDevice Device, IReadOnlyList<ProfilePin> Pins)
{
    public ProfilePin? PinAt(ProfileSlot s) => Pins.FirstOrDefault(p => p.Slot == s);

    public IReadOnlyList<ProfileSlot> SmartKeys => [.. Device.AllSlots().Where(s => s.IsKey && PinAt(s) is null)];
    public IReadOnlyList<ProfileSlot> SmartDials => [.. Device.AllSlots().Where(s => !s.IsKey && PinAt(s) is null)];

    /// <summary>
    /// The defaults (the user's words: "headphones vol/mic"): headphone volume on the left dial (top layer on the Galleon;
    /// push = mute) and a mic mute key in the bottom-left corner. Decks without dials get the mic key and a headphone
    /// mute key next to it (the Mini only the mic key: it has six keys).
    /// </summary>
    public static ProfileSetup Default(ProfileDevice d)
    {
        var bottom = d.Rows - 1;
        var pins = new List<ProfilePin> { new(ProfileSlot.Key(0, bottom), PinCatalog.MicMute) };
        if (d.HasDials) pins.Insert(0, new ProfilePin(ProfileSlot.Dial(0, 0), PinCatalog.Volume));
        else if (d.KeyCount > 6) pins.Add(new ProfilePin(ProfileSlot.Key(1, bottom), PinCatalog.Volume));
        return new ProfileSetup(d, pins);
    }

    public JsonObject ToJson() => new()
    {
        ["device"] = Device.Kind,
        ["pins"] = new JsonArray([.. Pins.OrderBy(p => p.Slot).Select(p =>
        {
            var o = new JsonObject { ["slot"] = p.Slot.ToString(), ["action"] = p.Action.Id };
            if (p.App is not null) o["app"] = p.App;
            return (JsonNode)o;
        })]),
    };

    /// <summary>
    /// Parses <c>{ device, pins: [ { slot: "key:0,3" | "dial:0,0", action: "mic-mute", app? } ] }</c>. Problems are
    /// returned, never thrown: an unknown device, slot, action, a slot outside the grid, an action that can't run on
    /// that controller, a slot pinned twice, an App Volume pin without a valid exe name, or no Smart Key left over.
    /// </summary>
    public static ProfileSetup? Parse(JsonNode? json, List<string> problems)
    {
        if (json is not JsonObject o) { problems.Add("The setup must be an object { device, pins }."); return null; }
        var device = ProfileDevices.Find(o["device"] is JsonValue dv && dv.TryGetValue<string>(out var ds) ? ds : null);
        if (device is null) { problems.Add($"Unknown device. Choose one of: {string.Join(", ", ProfileDevices.All.Select(d => d.Kind))}."); return null; }
        var pins = new List<ProfilePin>();
        var arr = o["pins"] as JsonArray ?? [];
        if (arr.Count > device.KeyCount + device.EncoderSlots) { problems.Add("Too many pins."); return null; }
        foreach (var n in arr)
        {
            if (n is not JsonObject p) { problems.Add("A pin must be an object { slot, action }."); continue; }
            var slotText = p["slot"] is JsonValue sv && sv.TryGetValue<string>(out var st) ? st : null;
            if (!ProfileSlot.TryParse(slotText, out var slot)) { problems.Add($"Bad slot \"{Short(slotText)}\": use key:<column>,<row> or dial:<dial>,<layer>."); continue; }
            if (!device.Contains(slot)) { problems.Add($"{slot} is not on the {device.Name}."); continue; }
            var actionId = p["action"] is JsonValue av && av.TryGetValue<string>(out var at) ? at : null;
            if (string.IsNullOrEmpty(actionId) || actionId is "smart") continue; // "smart" = leave it to Prism
            var action = PinCatalog.Find(actionId);
            if (action is null) { problems.Add($"Unknown action \"{Short(actionId)}\"."); continue; }
            if (!action.Supports(slot)) { problems.Add($"{action.Label} can't go on a {(slot.IsKey ? "key" : "dial")}."); continue; }
            if (pins.Any(q => q.Slot == slot)) { problems.Add($"{slot} is pinned twice."); continue; }
            string? app = null;
            if (action.NeedsApp)
            {
                app = p["app"] is JsonValue pv && pv.TryGetValue<string>(out var ps) ? ps.Trim() : null;
                if (!PinCatalog.IsValidApp(app)) { problems.Add($"{action.Label} on {slot} needs an app's exe name, for example Discord.exe."); continue; }
            }
            pins.Add(new ProfilePin(slot, action, app));
        }
        var setup = new ProfileSetup(device, pins);
        if (setup.SmartKeys.Count == 0) problems.Add("Leave at least one key for Prism to draw (a Smart Key).");
        return setup;
    }

    private static string Short(string? s) => s is null ? "" : s.Length <= 40 ? s : s[..40] + "…";
}
