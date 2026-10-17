using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Core.Devices;

namespace PrismControl.Smart.Profiles;

/// <summary>
/// One device the one-profile generator writes for. <see cref="Kind"/> is the Smart Deck device kind (the same string
/// <see cref="Layout.DeviceGeometry"/> uses and pins store), <see cref="Model"/> the profile <c>Device.Model</c> string
/// (formats.md §5.5, read off the app's own profiles), <see cref="DeviceType"/> the manifest <c>Profiles[].DeviceType</c>.
/// Galleon encoders are "dial,layer" (2 × 2); every other encoder device has one layer.
/// </summary>
public sealed record ProfileDevice(string Kind, string Name, string Model, int DeviceType, int Columns, int Rows, int Dials, int Layers, string Stem)
{
    public int KeyCount => Columns * Rows;
    public bool HasDials => Dials > 0;
    public int EncoderSlots => Dials * Layers;

    /// <summary>"Prism Smart · Galleon 100 SD": the profile's name in the app.</summary>
    public string ProfileName => "Prism Smart · " + Name;

    /// <summary>"Prism Smart - Galleon 100 SD.streamDeckProfile": the file the setup wizard writes.</summary>
    public string FileName => "Prism Smart - " + Name + ".streamDeckProfile";

    /// <summary>"profiles/prism-smart-galleon": the bundled profile's manifest name (path without extension).</summary>
    public string BundledName => "profiles/prism-smart-" + Stem;

    public bool Contains(ProfileSlot s) => s.IsKey
        ? s.X >= 0 && s.X < Columns && s.Y >= 0 && s.Y < Rows
        : s.X >= 0 && s.X < Dials && s.Y >= 0 && s.Y < Layers;

    /// <summary>Every key in reading order, then every encoder slot (layer 0 first).</summary>
    public IReadOnlyList<ProfileSlot> AllSlots()
    {
        var list = new List<ProfileSlot>(KeyCount + EncoderSlots);
        for (var y = 0; y < Rows; y++)
            for (var x = 0; x < Columns; x++) list.Add(ProfileSlot.Key(x, y));
        for (var l = 0; l < Layers && Dials > 0; l++)
            for (var d = 0; d < Dials; d++) list.Add(ProfileSlot.Dial(d, l));
        return list;
    }
}

/// <summary>A slot of a profile page: a key (column, row) or an encoder (dial, layer).</summary>
public readonly partial record struct ProfileSlot(bool IsKey, int X, int Y) : IComparable<ProfileSlot>
{
    public static ProfileSlot Key(int x, int y) => new(true, x, y);
    public static ProfileSlot Dial(int dial, int layer = 0) => new(false, dial, layer);

    /// <summary>The profile's controller coordinate: "column,row" for keys, "dial,layer" for encoders.</summary>
    public string Coordinate => $"{X},{Y}";

    /// <summary>"key:0,3" / "dial:1,0" (what the PI and the tests write).</summary>
    public override string ToString() => (IsKey ? "key:" : "dial:") + Coordinate;

    public int CompareTo(ProfileSlot o) => IsKey != o.IsKey ? (IsKey ? -1 : 1) : Y != o.Y ? Y.CompareTo(o.Y) : X.CompareTo(o.X);

    [GeneratedRegex(@"^(key|dial):(\d{1,2}),(\d{1,2})$")]
    private static partial Regex Pattern();

    public static bool TryParse(string? s, out ProfileSlot slot)
    {
        slot = default;
        var m = Pattern().Match(s?.Trim() ?? "");
        if (!m.Success) return false;
        slot = new ProfileSlot(m.Groups[1].Value == "key", int.Parse(m.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture), int.Parse(m.Groups[3].Value, System.Globalization.CultureInfo.InvariantCulture));
        return true;
    }
}

public static class ProfileDevices
{
    // Models: formats.md §5.5 (the app's own profiles on this PC) and the Prism Deck profiles that were installed and
    // switched on the owner's Galleon and Stream Deck + (aaa-prism-ds/hardware-lab RESULTS.md §1–§2).
    public static readonly ProfileDevice Galleon = new("galleon-100-sd", "Galleon 100 SD", "GRETSCH", 12, 3, 4, 2, 2, "galleon");
    public static readonly ProfileDevice Plus = new("stream-deck-plus", "Stream Deck +", "20GBD9901", 7, 4, 2, 4, 1, "plus");
    public static readonly ProfileDevice PlusXL = new("stream-deck-plus-xl", "Stream Deck + XL", "20GBX9901", 13, 9, 4, 6, 1, "plusxl");
    public static readonly ProfileDevice MK2 = new("stream-deck", "Stream Deck MK.2", "20GBA9901", 0, 5, 3, 0, 1, "mk2");
    public static readonly ProfileDevice XL = new("stream-deck-xl", "Stream Deck XL", "20GAT9902", 2, 8, 4, 0, 1, "xl");
    public static readonly ProfileDevice Mini = new("stream-deck-mini", "Stream Deck Mini", "20GAI9902", 1, 3, 2, 0, 1, "mini");
    public static readonly ProfileDevice Neo = new("stream-deck-neo", "Stream Deck Neo", "20GBJ9901", 9, 4, 2, 0, 1, "neo");

    /// <summary>Galleon and Stream Deck + first (first-class on this PC), then the rest.</summary>
    public static IReadOnlyList<ProfileDevice> All { get; } = [Galleon, Plus, PlusXL, MK2, XL, Mini, Neo];

    public static ProfileDevice? Find(string? kind) => All.FirstOrDefault(d => string.Equals(d.Kind, kind?.Trim(), StringComparison.OrdinalIgnoreCase))
        ?? All.FirstOrDefault(d => string.Equals(d.Stem, kind?.Trim(), StringComparison.OrdinalIgnoreCase));

    public static ProfileDevice? ForModel(string? model) => All.FirstOrDefault(d => d.Model == model);

    /// <summary>The profile device for a connected deck (null for decks without a generated profile: Mobile, Pedal, …).</summary>
    public static ProfileDevice? For(DeviceInfo device) => device.Type switch
    {
        PrismControl.Core.Devices.DeviceType.Galleon100SD => Galleon,
        PrismControl.Core.Devices.DeviceType.Plus => Plus,
        PrismControl.Core.Devices.DeviceType.PlusXL => PlusXL,
        PrismControl.Core.Devices.DeviceType.StreamDeck when device.Columns == 5 && device.Rows == 3 => MK2,
        PrismControl.Core.Devices.DeviceType.XL => XL,
        PrismControl.Core.Devices.DeviceType.Mini => Mini,
        PrismControl.Core.Devices.DeviceType.Neo => Neo,
        _ => null,
    };
}

/// <summary>Which controllers an action runs on.</summary>
[Flags]
public enum SlotControllers { Key = 1, Dial = 2, Both = Key | Dial }

/// <summary>
/// An action the user can pin to a slot of the one profile: Prism Control's existing actions, referenced by UUID (read
/// from their <c>[StreamDeckAction]</c> attributes; a test checks each UUID and its controllers against the module source).
/// <see cref="Settings"/> are the action instance settings written into the profile ({} = the action's own defaults).
/// </summary>
public sealed record PinnableAction(string Id, string Label, string Uuid, string ActionName, SlotControllers Controllers, string Description, string Module)
{
    /// <summary>The action needs an app (App Volume): the PI asks for an exe name.</summary>
    public bool NeedsApp { get; init; }
    public Func<string?, JsonObject> Settings { get; init; } = _ => [];

    public bool Supports(ProfileSlot s) => Controllers.HasFlag(s.IsKey ? SlotControllers.Key : SlotControllers.Dial);
}

public static partial class PinCatalog
{
    public const string PluginUuid = "com.jeremyfhall.prismcontrol";
    public const string PluginName = "Prism Control";
    public const string SmartKeyUuid = "com.jeremyfhall.prismcontrol.smart.key";
    public const string SmartDialUuid = "com.jeremyfhall.prismcontrol.smart.dial";
    public const string SmartKeyName = "Smart Key";
    public const string SmartDialName = "Smart Dial";

    // Audio (owned by prism-cb; used by UUID only): src/PrismControl.Audio/Actions/*.cs.
    public static readonly PinnableAction Volume = new("volume", "Headphone volume", "com.jeremyfhall.prismcontrol.audio.volume", "Volume", SlotControllers.Both,
        "Volume of your default output (your headphones). Dial: turn = volume, push = mute. Key: press = mute, shows the level.", "audio");
    public static readonly PinnableAction MicMute = new("mic-mute", "Mic mute", "com.jeremyfhall.prismcontrol.audio.mic-mute", "Mic Mute", SlotControllers.Both,
        "Mutes your default microphone; the key turns red while muted. Dial: push = mute, turn = mic level.", "audio");
    public static readonly PinnableAction OutputDevice = new("output-device", "Output switch", "com.jeremyfhall.prismcontrol.audio.output-device", "Output Device", SlotControllers.Both,
        "Switches the default output (speakers ⇄ headphones). Dial: turn to browse, push to set.", "audio");
    public static readonly PinnableAction InputDevice = new("input-device", "Mic switch", "com.jeremyfhall.prismcontrol.audio.input-device", "Input Device", SlotControllers.Both,
        "Switches the default microphone. Dial: turn to browse, push to set.", "audio");
    public static readonly PinnableAction LevelMeter = new("level-meter", "Level meter", "com.jeremyfhall.prismcontrol.audio.level-meter", "Level Meter", SlotControllers.Both,
        "A live output level meter.", "audio");
    public static readonly PinnableAction Mixer = new("mixer", "App mixer", "com.jeremyfhall.prismcontrol.audio.mixer", "App Mixer", SlotControllers.Dial,
        "Turn to pick an app, push to adjust its volume.", "audio");
    public static readonly PinnableAction AppVolume = new("app-volume", "App volume", "com.jeremyfhall.prismcontrol.audio.app-volume", "App Volume", SlotControllers.Both,
        "Volume and mute for one app (for example Discord.exe).", "audio")
    {
        NeedsApp = true,
        Settings = app => new JsonObject { ["app"] = app ?? "" },
    };
    // Smart (this module): a fixed lock-page key.
    public static readonly PinnableAction SmartLock = new("smart-lock", "Lock page", SmartKeyUuid, SmartKeyName, SlotControllers.Key,
        "Freezes the deck on the page it shows; press again to follow the screen.", "smart")
    {
        Settings = _ => new JsonObject { ["role"] = "lock" },
    };

    public static IReadOnlyList<PinnableAction> All { get; } = [Volume, MicMute, OutputDevice, InputDevice, LevelMeter, Mixer, AppVolume, SmartLock];

    public static PinnableAction? Find(string? id) => All.FirstOrDefault(a => string.Equals(a.Id, id?.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>Every UUID a generated profile may contain.</summary>
    public static IReadOnlySet<string> KnownUuids { get; } = new HashSet<string>([SmartKeyUuid, SmartDialUuid, .. All.Select(a => a.Uuid)], StringComparer.Ordinal);

    [GeneratedRegex(@"^(#system|[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,62}\.exe)$", RegexOptions.IgnoreCase)]
    private static partial Regex AppPattern();

    /// <summary>An exe name the App Volume action can bind to ("Discord.exe", "#system").</summary>
    public static bool IsValidApp(string? app) => app is not null && AppPattern().IsMatch(app.Trim());
}
