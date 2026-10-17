using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Smart.Art;
using PrismControl.Smart.Profiles;
using PrismControl.Smart.Runtime;

namespace PrismControl.Smart.Tests;

/// <summary>
/// <c>--render-profiles &lt;dir&gt;</c>: what each generated "Prism Smart · &lt;device&gt;" profile puts where, drawn from the
/// generated file itself (the page manifest read back out of the ZIP): pinned slots wear their action's own key / dial
/// image (Audio's art), Smart slots their idle Smart face (Prism fills them from the screen). Galleon, Stream Deck + and
/// XL first, then every other device and a custom Galleon setup.
/// </summary>
public static class ProfilePreviews
{
    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        var root = Repo.Root;
        if (root is null) Console.Error.WriteLine("warning: run from prism-control/: the pinned actions' key art is read from the repository");
        var t = Refraction.Night;
        var sb = new StringBuilder(Head(t));
        sb.Append("<h1>Prism Smart · the one profile</h1><p class=note>Read back from each generated .streamDeckProfile. " +
                  "Outlined = pinned: the user's fixed controls (Prism Control's own Audio actions, by UUID); every other slot is a Smart Key / Smart Dial that Prism draws from what is on screen.</p>");
        var custom = ProfileSetup.Parse(JsonNode.Parse("""
            { "device": "galleon-100-sd", "pins": [ { "slot": "dial:0,0", "action": "volume" }, { "slot": "dial:1,1", "action": "app-volume", "app": "Example Chat.exe" },
              { "slot": "key:2,3", "action": "mic-mute" }, { "slot": "key:0,3", "action": "smart-lock" } ] }
            """), [])!;
        var sections = new List<(string Title, ProfileSetup Setup)>
        {
            ("Corsair Galleon 100 SD · defaults", ProfileSetup.Default(ProfileDevices.Galleon)),
            ("Stream Deck + · defaults", ProfileSetup.Default(ProfileDevices.Plus)),
            ("Stream Deck XL · defaults", ProfileSetup.Default(ProfileDevices.XL)),
            ("Galleon 100 SD · a custom setup (lock key, App Volume on the bottom-right widget)", custom),
            ("Stream Deck + XL · defaults", ProfileSetup.Default(ProfileDevices.PlusXL)),
            ("Stream Deck MK.2 · defaults", ProfileSetup.Default(ProfileDevices.MK2)),
            ("Stream Deck Mini · defaults", ProfileSetup.Default(ProfileDevices.Mini)),
            ("Stream Deck Neo · defaults", ProfileSetup.Default(ProfileDevices.Neo)),
        };
        var i = 0;
        foreach (var (title, setup) in sections)
        {
            if (i == 3) sb.Append("<div class=break></div>");
            sb.Append(Device(title, ProfileGenerator.Build(setup), root, t));
            i++;
        }
        sb.Append("</body></html>");
        var file = Path.Combine(dir, "index.html");
        File.WriteAllText(file, sb.ToString());
        Console.WriteLine(Path.GetFullPath(file));
        // What the PI wizard receives for smart.setup.info (the PI preview's fake socket answers with it).
        var info = new ProfileWizard(ProfileWizard.DefaultOutputDirectory, safeMode: true, TimeProvider.System).Describe(ProfileDevices.Galleon.Kind);
        File.WriteAllText(Path.Combine(dir, "setup-info.json"), System.Text.Json.JsonSerializer.Serialize(info, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        // The pairing prompt face, at key size, mid-hold (for the PI preview and for looking at it).
        File.WriteAllText(Path.Combine(dir, "pair-prompt.svg"), PairArt.Key(t, new Control.PairPrompt("4821", 0.55, 96)).ToSvg());
        File.WriteAllText(Path.Combine(dir, "pair-prompt-idle.svg"), PairArt.Key(t, new Control.PairPrompt("4821", 0, 118)).ToSvg());
        return 0;
    }

    private static string Device(string title, GeneratedProfile p, string? root, RefractionPalette t)
    {
        var d = p.Device;
        var page = (JsonObject)JsonNode.Parse(ProfileChecker.Read(p.Zip)[$"Profiles/{p.ProfileId}.sdProfile/Profiles/{p.PageId.ToUpperInvariant()}/manifest.json"]!)!;
        var controllers = ((JsonArray)page["Controllers"]!).OfType<JsonObject>().ToDictionary(c => (string)c["Type"]!, c => (JsonObject)c["Actions"]!);
        var keyPx = d.Columns > 5 ? 76 : 92;
        var sb = new StringBuilder($"<section class=dev><h2>{WebUtility.HtmlEncode(title)}</h2><p class=sub>\"{WebUtility.HtmlEncode(p.Name)}\" · model {d.Model} · {p.SmartKeys} Smart Keys" +
                                   (d.HasDials ? $" · {p.SmartDials} Smart Dials" : "") + $" · problems: {ProfileChecker.Check(p.Zip).Count}</p><div class=devbody>");
        string Encoders()
        {
            if (!d.HasDials) return "";
            var e = new StringBuilder();
            var order = d.Layers > 1 ? new[] { (0, 0), (1, 0), (0, 1), (1, 1) } : Enumerable.Range(0, d.Dials).Select(x => (x, 0)).ToArray();
            var w = d.Layers > 1 ? 240 : 200;
            e.Append(d.Layers > 1 ? "<div class=screen>" : "<div class=strip>");
            foreach (var (dial, layer) in order)
            {
                var a = controllers["Encoder"][$"{dial},{layer}"]!;
                e.Append(Widget(a, w, root, t, d.Layers > 1 ? $"{(dial == 0 ? "L" : "R")} dial · layer {layer + 1}" : $"dial {dial + 1}"));
            }
            if (d.Layers > 1) e.Append("<div class=cap>screen widgets: top row = layer 1 of the left / right dial, bottom row = layer 2 (hold a dial ~4 s to switch)</div>");
            e.Append("</div>");
            return e.ToString();
        }
        if (d.Layers > 1) sb.Append($"<div class=col>{Encoders()}");
        sb.Append($"<div class=keys style=\"grid-template-columns:repeat({d.Columns},{keyPx}px)\">");
        for (var y = 0; y < d.Rows; y++)
            for (var x = 0; x < d.Columns; x++)
                sb.Append(KeyCell(controllers["Keypad"][$"{x},{y}"]!, keyPx, root, t, $"{x},{y}"));
        sb.Append("</div>");
        if (d.Layers > 1) sb.Append("</div>");
        else if (d.HasDials) sb.Append(Encoders());
        sb.Append("</div></section>");
        return sb.ToString();
    }

    private static PinnableAction? Pinned(JsonNode a)
    {
        var uuid = (string?)a["UUID"];
        if (uuid == PinCatalog.SmartKeyUuid) return (string?)a["Settings"]?["role"] == "lock" ? PinCatalog.SmartLock : null;
        return PinCatalog.All.FirstOrDefault(x => x.Uuid == uuid);
    }

    private static string KeyCell(JsonNode a, int px, string? root, RefractionPalette t, string coord)
    {
        var pin = Pinned(a);
        string src;
        string cap;
        if (pin is null)
        {
            src = SmartArt.Key(t, new SlotView { Kind = SlotKind.Idle, Label = "SMART", Why = "" }).ToDataUri();
            cap = "Smart Key";
        }
        else
        {
            src = pin == PinCatalog.SmartLock
                ? SmartArt.Key(t, new SlotView { Kind = SlotKind.Lock, Label = "LOCK", Glyph = "lock", Hue = 3 }).ToDataUri()
                : Image(root, pin, "key") ?? "";
            cap = pin.Label;
        }
        return $"<figure class={(pin is null ? "smart" : "pin")}><img width={px} height={px} src=\"{src}\" title=\"key {coord}\"><figcaption>{WebUtility.HtmlEncode(cap)}</figcaption></figure>";
    }

    private static string Widget(JsonNode a, int w, string? root, RefractionPalette t, string where)
    {
        var pin = Pinned(a);
        var h = w / 2;
        if (pin is null)
        {
            var svg = SmartArt.Dial(t, new SlotView { Kind = SlotKind.Idle, Label = "SMART DIAL", Why = "" });
            return $"<figure class=smartw style=\"width:{w}px\"><img width={w} height={h} src=\"{svg.ToDataUri()}\"><figcaption>{WebUtility.HtmlEncode(where)} · Smart Dial</figcaption></figure>";
        }
        var app = (string?)a["Settings"]?["app"];
        return $"<figure class=pinw style=\"width:{w}px\"><div class=panel style=\"height:{h}px\"><img width={h - 34} height={h - 34} src=\"{Image(root, pin, "dial") ?? Image(root, pin, "key")}\">" +
               $"<div><b>{WebUtility.HtmlEncode(pin.Label.ToUpperInvariant())}</b><span>{WebUtility.HtmlEncode(app ?? pin.ActionName)}</span><span class=hint>{WebUtility.HtmlEncode(Trigger(pin))}</span></div></div>" +
               $"<figcaption>{WebUtility.HtmlEncode(where)} · PINNED</figcaption></figure>";
    }

    private static string Trigger(PinnableAction p) => p.Id switch
    {
        "volume" or "app-volume" => "turn = volume · push = mute",
        "mic-mute" => "push = mute · turn = mic level",
        "mixer" => "turn = pick app · push = adjust",
        _ => "turn = browse · push = set",
    };

    private static string? Image(string? root, PinnableAction p, string which)
    {
        if (root is null) return null;
        var folder = p.Module == "smart" ? Path.Combine(root, "src", "PrismControl.Smart", "plugin", "imgs", "actions", "smart", "key")
            : Path.Combine(root, "src", "PrismControl.Audio", "plugin", "imgs", "actions", "audio", p.Uuid.Split('.').Last());
        var f = Path.Combine(folder, which + ".svg");
        return File.Exists(f) ? "data:image/svg+xml;base64," + Convert.ToBase64String(File.ReadAllBytes(f)) : null;
    }

    private static string Head(RefractionPalette t) => $$"""
        <!doctype html><html><head><meta charset="utf-8"><title>Prism Smart · generated profiles</title><style>
        body { background: {{t.Bg.Hex}}; color: {{t.Ink.Hex}}; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; margin: 24px; display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
        h1 { font-size: 20px; margin: 0; flex-basis: 100%; } .note { color: {{t.Muted.Hex}}; margin: -14px 0 0; flex-basis: 100%; }
        .break { flex-basis: 100%; height: 0; }
        .dev { background: {{t.Panel.Hex}}; border: 1px solid {{t.Line.Hex}}; border-radius: 14px; padding: 14px 16px; }
        h2 { font-size: 15px; margin: 0; } .sub { color: {{t.Muted.Hex}}; font-size: 12px; margin: 2px 0 12px; }
        .devbody { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; } .col { display: flex; flex-direction: column; gap: 10px; align-items: center; }
        .keys { display: grid; gap: 8px; }
        figure { margin: 0; } figure img { display: block; border-radius: 10px; }
        figcaption { color: {{t.Muted.Hex}}; font-size: 10px; margin-top: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        figure.pin img { outline: 2px solid {{t.Accent.Hex}}; outline-offset: 2px; } figure.pin figcaption, .pinw figcaption { color: {{t.Accent.Hex}}; }
        .screen { display: grid; grid-template-columns: repeat(2, auto); gap: 6px; background: #000000; padding: 8px; border-radius: 8px; }
        .strip { display: flex; gap: 4px; background: #000000; padding: 6px; border-radius: 6px; width: fit-content; }
        .screen img, .strip img { border-radius: 4px; }
        .cap { grid-column: span 2; color: #8a8a99; font-size: 11px; }
        .panel { display: flex; gap: 10px; align-items: center; background: #0b0d14; border: 2px solid {{t.Accent.Hex}}; border-radius: 6px; padding: 0 10px; box-sizing: border-box; }
        .panel img { border-radius: 8px; flex: none; } .panel div { display: flex; flex-direction: column; min-width: 0; } .panel b { font-size: 12px; letter-spacing: .05em; line-height: 1.15; }
        .panel span { color: #b9bccb; font-size: 10.5px; } .panel .hint { color: #8a8a99; }
        .knobs { display: flex; gap: 60px; color: {{t.Muted.Hex}}; font-size: 11px; }
        </style></head><body>
        """;
}
