using System.Diagnostics.CodeAnalysis;
using PrismControl.Desktop;

namespace PrismControl.Smart.Packs;

/// <summary>One key of a chord: the pack's key name, its virtual key, and its US-layout set-1 scan code (for scancode packs).</summary>
public sealed record KeySpec(string Name, VirtualKey Vk, ushort Scan, bool Extended, bool IsModifier)
{
    public override string ToString() => Name;
}

/// <summary>
/// A pack chord: modifiers in canonical order Win, Ctrl, Alt, Shift (side-specific allowed), then one key
/// (<c>Ctrl+Shift+T</c>, <c>RCtrl+RShift+G</c>, <c>LShift</c>). Pressed down in order, released in reverse.
/// </summary>
public sealed class Chord : IEquatable<Chord>
{
    private Chord(IReadOnlyList<KeySpec> keys) => Keys = keys;

    /// <summary>Modifiers first, then the key (the key itself may be a modifier, e.g. <c>LShift</c>).</summary>
    public IReadOnlyList<KeySpec> Keys { get; }

    public IReadOnlyList<VirtualKey> VirtualKeys => [.. Keys.Select(k => k.Vk)];

    /// <summary>The main key (last).</summary>
    public KeySpec Key => Keys[^1];

    public override string ToString() => string.Join("+", Keys.Select(k => k.Name));

    public bool Equals(Chord? other) => other is not null && ToString() == other.ToString();
    public override bool Equals(object? obj) => obj is Chord c && Equals(c);
    public override int GetHashCode() => StringComparer.Ordinal.GetHashCode(ToString());

    public static Chord Parse(string text) =>
        TryParse(text, out var c, out var error) ? c : throw new FormatException($"Bad chord \"{text}\": {error}");

    /// <summary>Parses the pack grammar strictly (canonical modifier order, known key names).</summary>
    public static bool TryParse(string? text, [NotNullWhen(true)] out Chord? chord, out string? error)
    {
        chord = null;
        error = null;
        if (string.IsNullOrWhiteSpace(text)) { error = "empty"; return false; }
        var parts = text.Split('+');
        if (parts.Any(p => p.Length == 0)) { error = "empty part"; return false; }
        var keys = new List<KeySpec>(parts.Length);
        var lastRank = -1;
        for (var i = 0; i < parts.Length; i++)
        {
            var name = parts[i];
            var isLast = i == parts.Length - 1;
            if (!isLast)
            {
                var rank = ModifierRank(name);
                if (rank < 0) { error = $"\"{name}\" is not a modifier (Win, Ctrl, Alt, Shift, optionally L/R)"; return false; }
                if (rank <= lastRank) { error = "modifiers must be in the order Win, Ctrl, Alt, Shift"; return false; }
                lastRank = rank;
            }
            if (!KeyNames.TryGet(name, out var spec)) { error = $"unknown key \"{name}\""; return false; }
            if (keys.Any(k => k.Vk == spec.Vk && k.Scan == spec.Scan)) { error = $"\"{name}\" twice"; return false; }
            keys.Add(spec);
        }
        if (keys.Count > 8) { error = "more than 8 keys"; return false; }
        chord = new Chord(keys);
        return true;
    }

    /// <summary>Builds a chord from loose parts in any modifier order (rebind adapters); normalizes to canonical order.</summary>
    public static bool TryFromParts(IEnumerable<string> modifiers, string key, [NotNullWhen(true)] out Chord? chord)
    {
        chord = null;
        var mods = modifiers.Where(m => !string.IsNullOrWhiteSpace(m)).Distinct(StringComparer.Ordinal)
            .OrderBy(ModifierRank).ToList();
        if (mods.Any(m => ModifierRank(m) < 0)) return false;
        // Two spellings of one modifier family (Ctrl and RCtrl) cannot be combined.
        if (mods.Select(m => ModifierRank(m)).Distinct().Count() != mods.Count) return false;
        return TryParse(string.Join("+", mods.Append(key)), out chord, out _);
    }

    /// <summary>0 Win, 1 Ctrl, 2 Alt, 3 Shift; -1 when not a modifier.</summary>
    internal static int ModifierRank(string name) => name switch
    {
        "Win" or "LWin" or "RWin" => 0,
        "Ctrl" or "LCtrl" or "RCtrl" => 1,
        "Alt" or "LAlt" or "RAlt" => 2,
        "Shift" or "LShift" or "RShift" => 3,
        _ => -1,
    };
}

/// <summary>The pack key-name vocabulary (README § Binding kinds) → virtual key + US scan code.</summary>
public static class KeyNames
{
    private static readonly Dictionary<string, KeySpec> Map = Build();

    public static IReadOnlyCollection<string> All => Map.Keys;

    public static bool TryGet(string name, [NotNullWhen(true)] out KeySpec? spec) => Map.TryGetValue(name, out spec);

    private static Dictionary<string, KeySpec> Build()
    {
        var m = new Dictionary<string, KeySpec>(StringComparer.Ordinal);
        void K(string name, VirtualKey vk, ushort scan, bool ext = false, bool mod = false) => m[name] = new KeySpec(name, vk, scan, ext, mod);

        // Letters (US positions).
        ushort[] letterScan = [0x1E, 0x30, 0x2E, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1F, 0x14, 0x16, 0x2F, 0x11, 0x2D, 0x15, 0x2C];
        for (var i = 0; i < 26; i++) K(((char)('A' + i)).ToString(), (VirtualKey)((int)VirtualKey.A + i), letterScan[i]);
        // Digit row: 1..9 = 0x02..0x0A, 0 = 0x0B.
        for (var i = 0; i <= 9; i++) K(i.ToString(), (VirtualKey)((int)VirtualKey.D0 + i), (ushort)(i == 0 ? 0x0B : 0x01 + i));
        // F keys.
        ushort[] fScan = [0x3B, 0x3C, 0x3D, 0x3E, 0x3F, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x76];
        for (var i = 1; i <= 24; i++) K("F" + i, (VirtualKey)((int)VirtualKey.F1 + i - 1), fScan[i - 1]);

        K("Esc", VirtualKey.Escape, 0x01);
        K("Tab", VirtualKey.Tab, 0x0F);
        K("Enter", VirtualKey.Enter, 0x1C);
        K("Space", VirtualKey.Space, 0x39);
        K("Backspace", VirtualKey.Back, 0x0E);
        K("Delete", VirtualKey.Delete, 0x53, ext: true);
        K("Insert", VirtualKey.Insert, 0x52, ext: true);
        K("Home", VirtualKey.Home, 0x47, ext: true);
        K("End", VirtualKey.End, 0x4F, ext: true);
        K("PageUp", VirtualKey.PageUp, 0x49, ext: true);
        K("PageDown", VirtualKey.PageDown, 0x51, ext: true);
        K("Up", VirtualKey.Up, 0x48, ext: true);
        K("Down", VirtualKey.Down, 0x50, ext: true);
        K("Left", VirtualKey.Left, 0x4B, ext: true);
        K("Right", VirtualKey.Right, 0x4D, ext: true);
        K("CapsLock", VirtualKey.CapsLock, 0x3A);
        K("PrintScreen", VirtualKey.PrintScreen, 0x37, ext: true);
        K("ScrollLock", VirtualKey.ScrollLock, 0x46);
        K("Pause", VirtualKey.Pause, 0x45);
        K("ContextMenu", VirtualKey.Apps, 0x5D, ext: true);
        ushort[] padScan = [0x52, 0x4F, 0x50, 0x51, 0x4B, 0x4C, 0x4D, 0x47, 0x48, 0x49];
        for (var i = 0; i <= 9; i++) K("Numpad" + i, (VirtualKey)((int)VirtualKey.NumPad0 + i), padScan[i]);
        K("NumpadAdd", VirtualKey.Add, 0x4E);
        K("NumpadSubtract", VirtualKey.Subtract, 0x4A);
        K("NumpadMultiply", VirtualKey.Multiply, 0x37);
        K("NumpadDivide", VirtualKey.Divide, 0x35, ext: true);
        K("NumpadDecimal", VirtualKey.Decimal, 0x53);
        K("NumpadEnter", VirtualKey.Enter, 0x1C, ext: true);
        K("Minus", VirtualKey.OemMinus, 0x0C);
        K("Equal", VirtualKey.OemPlus, 0x0D);
        K("BracketLeft", VirtualKey.Oem4, 0x1A);
        K("BracketRight", VirtualKey.Oem6, 0x1B);
        K("Backslash", VirtualKey.Oem5, 0x2B);
        K("Semicolon", VirtualKey.Oem1, 0x27);
        K("Quote", VirtualKey.Oem7, 0x28);
        K("Comma", VirtualKey.OemComma, 0x33);
        K("Period", VirtualKey.OemPeriod, 0x34);
        K("Slash", VirtualKey.Oem2, 0x35);
        K("Backquote", VirtualKey.Oem3, 0x29);
        K("IntlBackslash", VirtualKey.Oem102, 0x56);
        K("MediaPlayPause", VirtualKey.MediaPlayPause, 0x22, ext: true);
        K("MediaNext", VirtualKey.MediaNextTrack, 0x19, ext: true);
        K("MediaPrev", VirtualKey.MediaPreviousTrack, 0x10, ext: true);
        K("MediaStop", VirtualKey.MediaStop, 0x24, ext: true);
        K("VolumeUp", VirtualKey.VolumeUp, 0x30, ext: true);
        K("VolumeDown", VirtualKey.VolumeDown, 0x2E, ext: true);
        K("VolumeMute", VirtualKey.VolumeMute, 0x20, ext: true);
        K("BrowserBack", VirtualKey.BrowserBack, 0x6A, ext: true);
        K("BrowserForward", VirtualKey.BrowserForward, 0x69, ext: true);
        // Modifiers (also valid as the main key: "LShift" taps Shift).
        K("Ctrl", VirtualKey.Control, 0x1D, mod: true);
        K("LCtrl", VirtualKey.LeftControl, 0x1D, mod: true);
        K("RCtrl", VirtualKey.RightControl, 0x1D, ext: true, mod: true);
        K("Alt", VirtualKey.Alt, 0x38, mod: true);
        K("LAlt", VirtualKey.LeftAlt, 0x38, mod: true);
        K("RAlt", VirtualKey.RightAlt, 0x38, ext: true, mod: true);
        K("Shift", VirtualKey.Shift, 0x2A, mod: true);
        K("LShift", VirtualKey.LeftShift, 0x2A, mod: true);
        K("RShift", VirtualKey.RightShift, 0x36, mod: true);
        K("Win", VirtualKey.LeftWindows, 0x5B, ext: true, mod: true);
        K("LWin", VirtualKey.LeftWindows, 0x5B, ext: true, mod: true);
        K("RWin", VirtualKey.RightWindows, 0x5C, ext: true, mod: true);
        return m;
    }
}
