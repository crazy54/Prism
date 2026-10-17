using System.Globalization;

namespace PrismControl.Macros.Engine;

/// <summary>
/// A key the engine can press: its Windows virtual-key code and whether it is an "extended" key (an E0-prefixed scan
/// code on a real keyboard). Microsoft's list of extended keys: right Ctrl/Alt, Win, Menu, the Insert/Delete/Home/End/
/// PageUp/PageDown block, the arrow cluster, NumLock, PrintScreen, numpad Divide and numpad Enter, plus the media and
/// browser keys. Without the flag Windows treats arrow-cluster keys as their numpad twins (Shift+Left then fails to select).
/// </summary>
public sealed record KeyDef(string Name, ushort Vk, bool Extended = false);

/// <summary>Modifier keys of a chord. The plain names mean the left-hand key; Right* are the right-hand keys (RAlt = AltGr).</summary>
[Flags]
public enum ModifierKeys : ushort
{
    None = 0,
    Ctrl = 1,
    Alt = 2,
    Shift = 4,
    Win = 8,
    RightCtrl = 16,
    RightAlt = 32,
    RightShift = 64,
    RightWin = 128,
}

/// <summary>The key-name table: canonical names, aliases and raw "0x41" virtual-key codes.</summary>
public static class KeyNames
{
    /// <summary>Modifiers in canonical order (chords press them down in this order and release them in reverse).</summary>
    public static readonly IReadOnlyList<(ModifierKeys Flag, KeyDef Key)> Modifiers =
    [
        (ModifierKeys.Ctrl, new KeyDef("Ctrl", 0xA2)),
        (ModifierKeys.RightCtrl, new KeyDef("RCtrl", 0xA3, true)),
        (ModifierKeys.Alt, new KeyDef("Alt", 0xA4)),
        (ModifierKeys.RightAlt, new KeyDef("RAlt", 0xA5, true)),
        (ModifierKeys.Shift, new KeyDef("Shift", 0xA0)),
        (ModifierKeys.RightShift, new KeyDef("RShift", 0xA1)),
        (ModifierKeys.Win, new KeyDef("Win", 0x5B, true)),
        (ModifierKeys.RightWin, new KeyDef("RWin", 0x5C, true)),
    ];

    private static readonly Dictionary<string, ModifierKeys> ModifierAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ctrl"] = ModifierKeys.Ctrl, ["control"] = ModifierKeys.Ctrl, ["ctl"] = ModifierKeys.Ctrl, ["lctrl"] = ModifierKeys.Ctrl, ["lcontrol"] = ModifierKeys.Ctrl,
        ["rctrl"] = ModifierKeys.RightCtrl, ["rcontrol"] = ModifierKeys.RightCtrl,
        ["alt"] = ModifierKeys.Alt, ["lalt"] = ModifierKeys.Alt, ["option"] = ModifierKeys.Alt,
        ["ralt"] = ModifierKeys.RightAlt, ["altgr"] = ModifierKeys.RightAlt,
        ["shift"] = ModifierKeys.Shift, ["lshift"] = ModifierKeys.Shift,
        ["rshift"] = ModifierKeys.RightShift,
        ["win"] = ModifierKeys.Win, ["lwin"] = ModifierKeys.Win, ["windows"] = ModifierKeys.Win, ["meta"] = ModifierKeys.Win, ["super"] = ModifierKeys.Win, ["cmd"] = ModifierKeys.Win,
        ["rwin"] = ModifierKeys.RightWin,
    };

    private static readonly List<KeyDef> Table = BuildTable();
    private static readonly Dictionary<string, KeyDef> ByName = BuildIndex();

    /// <summary>Every named key, in a stable order (for the property inspector's key list).</summary>
    public static IReadOnlyList<KeyDef> All => Table;

    public static bool TryModifier(string token, out ModifierKeys modifier) => ModifierAliases.TryGetValue(token.Trim(), out modifier);

    /// <summary>A key by name or alias (case-insensitive), or a raw virtual-key code written as 0x41.</summary>
    public static KeyDef? Find(string token)
    {
        var t = token.Trim();
        if (t.Length == 0) return null;
        if (ByName.TryGetValue(t, out var k)) return k;
        if (t.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            && ushort.TryParse(t.AsSpan(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var vk) && vk is > 0 and < 0xFF)
            return FromVk(vk) ?? new KeyDef("0x" + vk.ToString("X2", CultureInfo.InvariantCulture), vk);
        return null;
    }

    /// <summary>The canonical key for a virtual-key code (the non-extended twin when several share it, e.g. Enter vs NumpadEnter).</summary>
    public static KeyDef? FromVk(ushort vk) => Table.FirstOrDefault(k => k.Vk == vk);

    private static List<KeyDef> BuildTable()
    {
        var t = new List<KeyDef>();
        for (var c = 'A'; c <= 'Z'; c++) t.Add(new(c.ToString(), c));
        for (var c = '0'; c <= '9'; c++) t.Add(new(c.ToString(), c));
        for (var i = 1; i <= 24; i++) t.Add(new("F" + i.ToString(CultureInfo.InvariantCulture), (ushort)(0x6F + i)));
        t.AddRange(
        [
            new("Enter", 0x0D), new("Tab", 0x09), new("Space", 0x20), new("Backspace", 0x08), new("Esc", 0x1B),
            new("Insert", 0x2D, true), new("Delete", 0x2E, true), new("Home", 0x24, true), new("End", 0x23, true),
            new("PageUp", 0x21, true), new("PageDown", 0x22, true),
            new("Left", 0x25, true), new("Up", 0x26, true), new("Right", 0x27, true), new("Down", 0x28, true),
            new("PrintScreen", 0x2C, true), new("Pause", 0x13), new("CapsLock", 0x14), new("NumLock", 0x90, true), new("ScrollLock", 0x91),
            new("Apps", 0x5D, true),
        ]);
        for (var i = 0; i <= 9; i++) t.Add(new("Numpad" + i.ToString(CultureInfo.InvariantCulture), (ushort)(0x60 + i)));
        t.AddRange(
        [
            new("NumpadMultiply", 0x6A), new("NumpadAdd", 0x6B), new("NumpadSubtract", 0x6D), new("NumpadDecimal", 0x6E),
            new("NumpadDivide", 0x6F, true), new("NumpadEnter", 0x0D, true),
            new("Plus", 0xBB), new("Minus", 0xBD), new("Comma", 0xBC), new("Period", 0xBE), new("Semicolon", 0xBA), new("Slash", 0xBF),
            new("Backquote", 0xC0), new("BracketLeft", 0xDB), new("Backslash", 0xDC), new("BracketRight", 0xDD), new("Quote", 0xDE),
            new("IntlBackslash", 0xE2),
            new("PlayPause", 0xB3, true), new("NextTrack", 0xB0, true), new("PrevTrack", 0xB1, true), new("MediaStop", 0xB2, true),
            new("VolumeMute", 0xAD, true), new("VolumeDown", 0xAE, true), new("VolumeUp", 0xAF, true),
            new("BrowserBack", 0xA6, true), new("BrowserForward", 0xA7, true), new("BrowserRefresh", 0xA8, true), new("BrowserHome", 0xAC, true),
        ]);
        return t;
    }

    private static Dictionary<string, KeyDef> BuildIndex()
    {
        var map = new Dictionary<string, KeyDef>(StringComparer.OrdinalIgnoreCase);
        foreach (var k in Table) map[k.Name] = k;
        void Alias(string alias, string name) => map[alias] = map[name];
        Alias("Return", "Enter"); Alias("Spacebar", "Space"); Alias("Back", "Backspace"); Alias("Escape", "Esc");
        Alias("Ins", "Insert"); Alias("Del", "Delete"); Alias("PgUp", "PageUp"); Alias("Prior", "PageUp"); Alias("PgDn", "PageDown"); Alias("Next", "PageDown");
        Alias("ArrowLeft", "Left"); Alias("ArrowUp", "Up"); Alias("ArrowRight", "Right"); Alias("ArrowDown", "Down");
        Alias("PrtSc", "PrintScreen"); Alias("PrintScrn", "PrintScreen"); Alias("Snapshot", "PrintScreen"); Alias("Break", "Pause");
        Alias("ContextMenu", "Apps"); Alias("Menu", "Apps");
        Alias("Equal", "Plus"); Alias("Equals", "Plus"); Alias("=", "Plus");
        Alias("-", "Minus"); Alias("Dash", "Minus"); Alias("Hyphen", "Minus");
        Alias(",", "Comma"); Alias(".", "Period"); Alias("Dot", "Period"); Alias(";", "Semicolon"); Alias("/", "Slash");
        Alias("`", "Backquote"); Alias("Grave", "Backquote"); Alias("Tilde", "Backquote");
        Alias("[", "BracketLeft"); Alias("\\", "Backslash"); Alias("]", "BracketRight"); Alias("'", "Quote"); Alias("Apostrophe", "Quote");
        Alias("MediaPlayPause", "PlayPause"); Alias("MediaNext", "NextTrack"); Alias("MediaTrackNext", "NextTrack");
        Alias("MediaPrev", "PrevTrack"); Alias("MediaPrevious", "PrevTrack"); Alias("MediaTrackPrevious", "PrevTrack");
        Alias("Mute", "VolumeMute"); Alias("AudioVolumeMute", "VolumeMute"); Alias("AudioVolumeDown", "VolumeDown"); Alias("AudioVolumeUp", "VolumeUp");
        Alias("NumpadPlus", "NumpadAdd"); Alias("NumpadMinus", "NumpadSubtract");
        return map;
    }
}

/// <summary>
/// A key chord: modifiers plus at most one other key ("Ctrl+Shift+T", "Win+Left", "Ctrl+Plus", "F13", or modifiers only: "Win").
/// The canonical text form is what settings store; parsing is case-insensitive and accepts aliases ("Control+Del", "Ctrl++").
/// </summary>
public sealed record KeyChord(ModifierKeys Modifiers, KeyDef? Key)
{
    public bool IsEmpty => Modifiers == ModifierKeys.None && Key is null;

    /// <summary>The modifier keys in press order.</summary>
    public IEnumerable<KeyDef> ModifierKeyDefs => KeyNames.Modifiers.Where(m => Modifiers.HasFlag(m.Flag)).Select(m => m.Key);

    /// <summary>"Ctrl+Shift" (empty when there are no modifiers).</summary>
    public string ModifiersText => string.Join("+", ModifierKeyDefs.Select(k => k.Name));

    public override string ToString()
    {
        var mods = ModifiersText;
        if (Key is null) return mods;
        return mods.Length == 0 ? Key.Name : mods + "+" + Key.Name;
    }

    public static KeyChord Parse(string text) =>
        TryParse(text, out var chord, out var error) ? chord : throw new FormatException(error);

    public static bool TryParse(string? text, out KeyChord chord, out string error)
    {
        chord = new KeyChord(ModifierKeys.None, null);
        error = "";
        var s = (text ?? "").Trim();
        if (s.Length == 0)
        {
            error = "Enter a key, for example Ctrl+Shift+T.";
            return false;
        }
        // The plus key itself: "+", "Ctrl++".
        if (s == "+") s = "Plus";
        else if (s.EndsWith("++", StringComparison.Ordinal)) s = s[..^1] + "Plus";

        var mods = ModifierKeys.None;
        KeyDef? key = null;
        foreach (var raw in s.Split('+'))
        {
            var token = raw.Trim();
            if (token.Length == 0)
            {
                error = $"\"{text}\" has an empty key between two +.";
                return false;
            }
            if (KeyNames.TryModifier(token, out var m))
            {
                mods |= m;
                continue;
            }
            var k = KeyNames.Find(token);
            if (k is null)
            {
                error = $"Unknown key \"{token}\".";
                return false;
            }
            if (key is not null && key != k)
            {
                error = $"A chord has one key besides the modifiers (got {key.Name} and {k.Name}). Use two steps.";
                return false;
            }
            key = k;
        }
        chord = new KeyChord(mods, key);
        return true;
    }

    /// <summary>Chords Windows keeps for itself: apps cannot synthesize them (null when the chord is fine).</summary>
    public string? ReservedReason()
    {
        var ctrl = (Modifiers & (ModifierKeys.Ctrl | ModifierKeys.RightCtrl)) != 0;
        var alt = (Modifiers & (ModifierKeys.Alt | ModifierKeys.RightAlt)) != 0;
        var win = (Modifiers & (ModifierKeys.Win | ModifierKeys.RightWin)) != 0;
        if (ctrl && alt && Key?.Vk == 0x2E) return "Windows reserves Ctrl+Alt+Delete; apps can't send it.";
        if (win && Key?.Vk == 'L') return "Windows reserves Win+L (lock); apps can't send it.";
        return null;
    }
}
