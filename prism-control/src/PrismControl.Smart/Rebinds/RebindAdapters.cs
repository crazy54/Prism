using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;
using PrismControl.Smart.Packs;

namespace PrismControl.Smart.Rebinds;

/// <summary>What the user's own config says about one app action: a new binding, or "no key" (unbound).</summary>
public sealed record RebindEntry(Binding? Binding, string Source)
{
    public bool IsUnbound => Binding is null;
}

/// <summary>The user's rebinds for one app, read from its own config file (never written).</summary>
public sealed class RebindSet
{
    /// <summary>appAction → the user's binding (or unbound).</summary>
    public Dictionary<string, RebindEntry> ByAction { get; } = new(StringComparer.Ordinal);
    /// <summary>Chords the user explicitly unbound (Windows Terminal <c>{ "keys": …, "id": null }</c>): verbs whose default is one of them lose their key.</summary>
    public HashSet<string> UnboundChords { get; } = new(StringComparer.Ordinal);
    /// <summary>
    /// chord → the command the user's file gives it (unconditional binds only), so a pack verb whose DEFAULT chord the user
    /// gave to another command is seen as "key taken" (review E9). Includes ids no pack verb knows (Windows Terminal
    /// <c>User.*</c> actions).
    /// </summary>
    public Dictionary<string, string> ChordOwners { get; } = new(StringComparer.Ordinal);
    public int Count => ByAction.Count + UnboundChords.Count;
}

/// <summary>Reads one app's rebind file format. Implementations are pure (text in, set out) and never throw on bad input.</summary>
public interface IRebindAdapter
{
    string Format { get; }
    /// <summary>True when this adapter reads files like <paramref name="path"/> for <paramref name="pack"/>.</summary>
    bool Handles(ContextPack pack, string path);
    /// <summary>Parses the file text. Returns null (with <paramref name="error"/>) when it can't be parsed: the defaults stay.</summary>
    RebindSet? Parse(string text, out string? error);
}

/// <summary>Key names used by VS Code keybindings.json and Windows Terminal settings.json → pack chords.</summary>
internal static class AppKeyNames
{
    private static readonly Dictionary<string, string> Keys = new(StringComparer.OrdinalIgnoreCase)
    {
        ["plus"] = "Equal", ["="] = "Equal", ["equal"] = "Equal", ["-"] = "Minus", ["minus"] = "Minus", [","] = "Comma", ["comma"] = "Comma",
        ["."] = "Period", ["period"] = "Period", ["/"] = "Slash", ["slash"] = "Slash", [";"] = "Semicolon", ["semicolon"] = "Semicolon",
        ["'"] = "Quote", ["quote"] = "Quote", ["`"] = "Backquote", ["backtick"] = "Backquote", ["["] = "BracketLeft", ["]"] = "BracketRight",
        ["\\"] = "Backslash", ["backslash"] = "Backslash", ["sc(41)"] = "Backquote", ["oem_102"] = "IntlBackslash",
        ["pgup"] = "PageUp", ["pageup"] = "PageUp", ["pgdn"] = "PageDown", ["pagedown"] = "PageDown", ["app"] = "ContextMenu", ["menu"] = "ContextMenu",
        ["esc"] = "Esc", ["escape"] = "Esc", ["enter"] = "Enter", ["return"] = "Enter", ["tab"] = "Tab", ["space"] = "Space", ["backspace"] = "Backspace",
        ["delete"] = "Delete", ["del"] = "Delete", ["insert"] = "Insert", ["home"] = "Home", ["end"] = "End", ["up"] = "Up", ["down"] = "Down", ["left"] = "Left",
        ["right"] = "Right", ["capslock"] = "CapsLock", ["pausebreak"] = "Pause", ["pause"] = "Pause", ["printscreen"] = "PrintScreen", ["scrolllock"] = "ScrollLock",
        ["numpad_plus"] = "NumpadAdd", ["numpad_add"] = "NumpadAdd", ["numpad_minus"] = "NumpadSubtract", ["numpad_subtract"] = "NumpadSubtract",
        ["numpad_multiply"] = "NumpadMultiply", ["numpad_divide"] = "NumpadDivide", ["numpad_period"] = "NumpadDecimal", ["numpad_decimal"] = "NumpadDecimal",
        ["numpad_enter"] = "NumpadEnter",
    };

    private static readonly Dictionary<string, string> Mods = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ctrl"] = "Ctrl", ["control"] = "Ctrl", ["shift"] = "Shift", ["alt"] = "Alt", ["win"] = "Win", ["meta"] = "Win", ["cmd"] = "Win",
    };

    /// <summary>One chord like <c>ctrl+shift+p</c> (any modifier order, any case).</summary>
    public static Chord? Chord(string text)
    {
        var parts = text.Trim().Split('+', StringSplitOptions.TrimEntries);
        // "ctrl++" (plus key) splits into an empty last part.
        if (parts.Length >= 2 && parts[^1].Length == 0) parts = [.. parts[..^2], "plus"];
        if (parts.Length == 0 || parts.Any(p => p.Length == 0)) return null;
        var mods = new List<string>();
        foreach (var p in parts[..^1])
        {
            if (!Mods.TryGetValue(p, out var m)) return null;
            mods.Add(m);
        }
        var key = Key(parts[^1]);
        if (key is null) return null;
        return Packs.Chord.TryFromParts(mods, key, out var c) ? c : null;
    }

    /// <summary>A binding: one chord, or a space-separated chord sequence (<c>ctrl+k ctrl+s</c>).</summary>
    public static Binding? Binding(string text)
    {
        var steps = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (steps.Length == 0 || steps.Length > 6) return null;
        var chords = new List<Chord>();
        foreach (var s in steps)
        {
            if (Chord(s) is not { } c) return null;
            chords.Add(c);
        }
        return chords.Count == 1 ? new ChordBinding(chords[0]) : new SequenceBinding(chords, 40);
    }

    private static string? Key(string k)
    {
        if (Keys.TryGetValue(k, out var mapped)) return mapped;
        if (k.Length == 1 && char.IsAsciiLetter(k[0])) return k.ToUpperInvariant();
        if (k.Length == 1 && char.IsAsciiDigit(k[0])) return k;
        if (k.Length is 2 or 3 && (k[0] is 'f' or 'F') && int.TryParse(k[1..], out var f) && f is >= 1 and <= 24) return "F" + f;
        if (k.StartsWith("numpad", StringComparison.OrdinalIgnoreCase))
        {
            var rest = k["numpad".Length..].TrimStart('_');
            if (rest.Length == 1 && char.IsAsciiDigit(rest[0])) return "Numpad" + rest;
        }
        // VS Code scan-code syntax: [KeyA], [Digit1], [Minus] …
        if (k.Length > 2 && k[0] == '[' && k[^1] == ']')
        {
            var code = k[1..^1];
            if (code.StartsWith("Key", StringComparison.Ordinal) && code.Length == 4) return code[3..];
            if (code.StartsWith("Digit", StringComparison.Ordinal) && code.Length == 6) return code[5..];
            if (code.StartsWith("Arrow", StringComparison.Ordinal)) return code[5..];
            return KeyNames.TryGet(code, out _) ? code : null;
        }
        return null;
    }
}

/// <summary>JSONC → JSON: strips // and /* */ comments outside strings and trailing commas (System.Text.Json also tolerates both; this keeps hand-edited files with odd comments readable).</summary>
internal static class Jsonc
{
    public static JsonNode? Parse(string text) => JsonNode.Parse(text, PackParser.NodeOptions, PackParser.JsonOptions);
}

/// <summary>VS Code <c>%APPDATA%\Code\User\keybindings.json</c>: <c>[{ key, command, when?, args? }]</c>; <c>-command</c> removes a default.</summary>
public sealed class VsCodeKeybindingsAdapter : IRebindAdapter
{
    public string Format => "vscode-keybindings";

    public bool Handles(ContextPack pack, string path) => Path.GetFileName(path).Equals("keybindings.json", StringComparison.OrdinalIgnoreCase);

    public RebindSet? Parse(string text, out string? error)
    {
        error = null;
        JsonNode? root;
        try { root = Jsonc.Parse(text); }
        catch (JsonException ex) { error = "not valid JSON: " + ex.Message; return null; }
        if (root is not JsonArray arr) { error = "the top level must be an array"; return null; }
        var positive = new Dictionary<string, (Binding Binding, bool HasWhen)>(StringComparer.Ordinal);
        var removed = new HashSet<string>(StringComparer.Ordinal);
        var owners = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var n in arr)
        {
            if (n is not JsonObject o) continue;
            var command = PackParser.Str(o, "command");
            var key = PackParser.Str(o, "key");
            if (string.IsNullOrEmpty(command)) continue;
            if (command.StartsWith('-'))
            {
                removed.Add(command[1..]);
                continue;
            }
            if (key is null || AppKeyNames.Binding(key) is not { } b) continue;
            var hasWhen = !string.IsNullOrWhiteSpace(PackParser.Str(o, "when"));
            // An unconditional bind takes its key (the first chord of a sequence) away from whatever had it by default.
            if (!hasWhen && FirstChord(b) is { } owned) owners[owned] = command;
            // Later entries win, but an unconditional binding beats a when-clause one (it works everywhere).
            if (!positive.TryGetValue(command, out var cur) || !hasWhen || cur.HasWhen) positive[command] = (b, hasWhen);
        }
        var set = new RebindSet();
        foreach (var (cmd, p) in positive) set.ByAction[cmd] = new RebindEntry(p.Binding, "keybindings.json");
        foreach (var cmd in removed.Where(c => !positive.ContainsKey(c))) set.ByAction[cmd] = new RebindEntry(null, "keybindings.json");
        foreach (var (chord, cmd) in owners) set.ChordOwners[chord] = cmd;
        return set;
    }

    internal static string? FirstChord(Binding b) => b switch { ChordBinding c => c.Chord.ToString(), SequenceBinding s => s.Steps[0].ToString(), _ => null };
}

/// <summary>
/// Windows Terminal <c>settings.json</c> (1.21+): <c>keybindings[] = { keys, id }</c> joins on the verb's appAction
/// (<c>Terminal.*</c>); <c>id: null</c> or <c>"unbound"</c> removes that key from its default action. Legacy
/// <c>actions[] = { command, keys }</c> entries without an id are not mapped (we don't read defaults.json).
/// </summary>
public sealed class WindowsTerminalSettingsAdapter : IRebindAdapter
{
    public string Format => "windows-terminal-settings";

    public bool Handles(ContextPack pack, string path) =>
        Path.GetFileName(path).Equals("settings.json", StringComparison.OrdinalIgnoreCase) && pack.Id.Contains("terminal", StringComparison.Ordinal);

    public RebindSet? Parse(string text, out string? error)
    {
        error = null;
        JsonNode? root;
        try { root = Jsonc.Parse(text); }
        catch (JsonException ex) { error = "not valid JSON: " + ex.Message; return null; }
        if (root is not JsonObject o) { error = "the top level must be an object"; return null; }
        var set = new RebindSet();
        void Add(JsonObject entry)
        {
            var keys = entry["keys"] switch
            {
                JsonValue v when v.TryGetValue<string>(out var s) => [s],
                JsonArray a => a.OfType<JsonValue>().Select(x => x.TryGetValue<string>(out var s) ? s : null).Where(s => s is not null).Cast<string>().ToList(),
                _ => new List<string>(),
            };
            if (keys.Count == 0) return;
            var idNode = entry["id"];
            var id = idNode is JsonValue iv && iv.TryGetValue<string>(out var ids) ? ids : null;
            if (idNode is null && entry.ContainsKey("id") || id is "unbound")
            {
                foreach (var k in keys)
                    if (AppKeyNames.Chord(k) is { } c) set.UnboundChords.Add(c.ToString());
                return;
            }
            if (id is null) return;
            // Every key of the entry now runs that id, whatever it did by default (also User.* actions no pack knows).
            foreach (var k in keys)
                if (AppKeyNames.Binding(k) is { } kb && VsCodeKeybindingsAdapter.FirstChord(kb) is { } owned) set.ChordOwners[owned] = id;
            // The first key of the list is the one we press.
            if (AppKeyNames.Binding(keys[0]) is { } b) set.ByAction[id] = new RebindEntry(b, "settings.json");
        }
        foreach (var (e, _) in PackParser.Items(o, "keybindings")) Add(e);
        // actions[] entries that carry both an id and keys (some fragments and hand edits do).
        foreach (var (e, _) in PackParser.Items(o, "actions"))
            if (e.ContainsKey("keys") && PackParser.Str(e, "id") is not null) Add(e);
        return set;
    }
}

/// <summary>
/// Frontier games (Planet Coaster 2): <c>Controls_remote.config.xml</c> → <c>&lt;ControlBindings&gt;</c>. The element shape is
/// inferred (the pack's userBindings.verify): any element holding a <c>Name</c> and a <c>Binding</c> with
/// <c>DeviceType</c> keyboard, <c>Key</c> and optional <c>Modifier</c>s. Key names drop the <c>Input_KB_Key_</c> prefix.
/// Empty <c>&lt;ControlBindings/&gt;</c> (this PC) = all defaults.
/// </summary>
public sealed class FrontierControlsAdapter : IRebindAdapter
{
    public string Format => "frontier-controls-xml";

    public bool Handles(ContextPack pack, string path) => Path.GetFileName(path).Equals("Controls_remote.config.xml", StringComparison.OrdinalIgnoreCase);

    private static readonly Dictionary<string, string> KeyMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Equals"] = "Equal", ["Grave"] = "Backquote", ["LeftBracket"] = "BracketLeft", ["RightBracket"] = "BracketRight", ["Apostrophe"] = "Quote",
        ["Escape"] = "Esc", ["Return"] = "Enter", ["Spacebar"] = "Space", ["LeftShift"] = "LShift", ["RightShift"] = "RShift",
        ["LeftControl"] = "LCtrl", ["LeftCtrl"] = "LCtrl", ["RightControl"] = "RCtrl", ["RightCtrl"] = "RCtrl", ["LeftAlt"] = "LAlt", ["RightAlt"] = "RAlt",
        ["PgUp"] = "PageUp", ["PgDn"] = "PageDown", ["UpArrow"] = "Up", ["DownArrow"] = "Down", ["LeftArrow"] = "Left", ["RightArrow"] = "Right",
        ["Back"] = "Backspace", ["NumPadPlus"] = "NumpadAdd", ["NumPadMinus"] = "NumpadSubtract", ["NumPadEnter"] = "NumpadEnter",
        ["NumPadStar"] = "NumpadMultiply", ["NumPadSlash"] = "NumpadDivide", ["NumPadPeriod"] = "NumpadDecimal",
    };

    public RebindSet? Parse(string text, out string? error)
    {
        error = null;
        var doc = new XmlDocument { XmlResolver = null };
        try
        {
            using var reader = XmlReader.Create(new StringReader(text), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 4_000_000 });
            doc.Load(reader);
        }
        catch (XmlException ex) { error = "not valid XML: " + ex.Message; return null; }
        var set = new RebindSet();
        var bindingsRoot = doc.GetElementsByTagName("ControlBindings").OfType<XmlElement>().FirstOrDefault();
        if (bindingsRoot is null) return set;
        foreach (var el in bindingsRoot.GetElementsByTagName("*").OfType<XmlElement>())
        {
            var name = Child(el, "Name") ?? el.GetAttribute("Name");
            if (string.IsNullOrEmpty(name)) continue;
            var bindings = el.ChildNodes.OfType<XmlElement>().Where(c => c.LocalName == "Binding").ToList();
            if (bindings.Count == 0) continue;
            foreach (var b in bindings)
            {
                var device = Child(b, "DeviceType") ?? b.GetAttribute("DeviceType");
                if (!string.IsNullOrEmpty(device) && !device.Contains("Keyboard", StringComparison.OrdinalIgnoreCase)) continue;
                var keyRaw = Child(b, "Key") ?? b.GetAttribute("Key");
                if (string.IsNullOrEmpty(keyRaw)) continue;
                var key = MapKey(keyRaw);
                var mods = b.ChildNodes.OfType<XmlElement>().Where(c => c.LocalName == "Modifier").Select(c => MapModifier(c.InnerText.Trim()))
                    .Concat((b.GetAttribute("Modifier") ?? "").Split(['+', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(MapModifier))
                    .Where(m => m is not null).Cast<string>().ToList();
                if (key is not null && Chord.TryFromParts(mods, key, out var chord))
                {
                    set.ByAction[name] = new RebindEntry(new ChordBinding(chord), "Controls_remote.config.xml");
                    set.ChordOwners[chord.ToString()] = name;
                    break;
                }
            }
        }
        return set;
    }

    private static string? Child(XmlElement e, string name) => e.ChildNodes.OfType<XmlElement>().FirstOrDefault(c => c.LocalName == name)?.InnerText.Trim();

    private static string? MapKey(string raw)
    {
        var k = raw.Trim();
        if (k.StartsWith("Input_KB_Key_", StringComparison.Ordinal)) k = k["Input_KB_Key_".Length..];
        if (KeyMap.TryGetValue(k, out var m)) return m;
        if (k.Length == 1 && char.IsAsciiLetter(k[0])) return k.ToUpperInvariant();
        if (k.Length == 1 && char.IsAsciiDigit(k[0])) return k;
        if (k.StartsWith("NumPad", StringComparison.OrdinalIgnoreCase) && k.Length == 7 && char.IsAsciiDigit(k[6])) return "Numpad" + k[6];
        return KeyNames.TryGet(k, out _) ? k : null;
    }

    private static string? MapModifier(string m) => m.ToLowerInvariant() switch
    {
        "shift" or "leftshift" or "lshift" => "Shift",
        "ctrl" or "control" or "leftcontrol" or "leftctrl" or "lctrl" => "Ctrl",
        "alt" or "leftalt" or "lalt" => "Alt",
        "rightshift" or "rshift" => "RShift",
        "rightcontrol" or "rightctrl" or "rctrl" => "RCtrl",
        "rightalt" or "ralt" => "RAlt",
        _ => null,
    };
}

public static class RebindAdapters
{
    public static IReadOnlyList<IRebindAdapter> All { get; } = [new VsCodeKeybindingsAdapter(), new WindowsTerminalSettingsAdapter(), new FrontierControlsAdapter()];

    public static IRebindAdapter? For(ContextPack pack, string path) => All.FirstOrDefault(a => a.Handles(pack, path));

    /// <summary>Applies a rebind set to a pack: verbs whose appAction the user rebound press the user's key instead.</summary>
    public static ContextPack Apply(ContextPack pack, RebindSet set, out int applied)
    {
        var count = 0;
        var verbs = pack.Verbs.Select(v =>
        {
            if (v.AppAction is { } act && set.ByAction.TryGetValue(act, out var e))
            {
                count++;
                var nb = e.Binding ?? new UnboundBinding("no-default", v.Binding is ChordBinding cb ? cb.Chord : null, "You removed this key in the app's settings.");
                if (PackValidator.BindingProblem(pack, nb) is not null) return v;
                return v with { Binding = nb, ReboundFrom = v.Binding.Describe() };
            }
            if (v.Binding is ChordBinding c && set.UnboundChords.Contains(c.Chord.ToString()))
            {
                count++;
                return v with { Binding = new UnboundBinding("no-default", c.Chord, "You removed this key in the app's settings."), ReboundFrom = v.Binding.Describe() };
            }
            // E9: the user gave this verb's default key to another command: pressing it would run that one.
            // (Only for verbs that name their app command: without one we can't tell the user's own re-bind of the same action.)
            if (v.AppAction is not null && VsCodeKeybindingsAdapter.FirstChord(v.Binding) is { } mine && set.ChordOwners.TryGetValue(mine, out var owner) && owner != v.AppAction)
            {
                count++;
                return v with
                {
                    Binding = new UnboundBinding("key-taken", null, $"Your own binds give {mine} to {Short(owner)}; bind {v.Label} to another key in the app."),
                    ReboundFrom = v.Binding.Describe(),
                };
            }
            return v;
        }).ToList();
        applied = count;
        return count == 0 ? pack : pack with { Verbs = verbs };
    }

    private static string Short(string s) => s.Length <= 48 ? s : s[..48] + "…";
}
