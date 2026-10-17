using PrismControl.Desktop;

namespace PrismControl.Sight.Control;

/// <summary>
/// Parses pack-style chord names ("Ctrl+Shift+T", "RCtrl+RShift+G", "Numpad4", "BracketLeft") into virtual keys.
/// Modifiers first (Win, Ctrl, Alt, Shift, side-specific allowed), then one key.
/// </summary>
public static class Chords
{
    private static readonly Dictionary<string, VirtualKey> Named = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Ctrl"] = VirtualKey.Control, ["Control"] = VirtualKey.Control, ["Shift"] = VirtualKey.Shift, ["Alt"] = VirtualKey.Alt, ["Win"] = VirtualKey.LeftWindows,
        ["LCtrl"] = VirtualKey.LeftControl, ["RCtrl"] = VirtualKey.RightControl, ["LShift"] = VirtualKey.LeftShift, ["RShift"] = VirtualKey.RightShift,
        ["LAlt"] = VirtualKey.LeftAlt, ["RAlt"] = VirtualKey.RightAlt,
        ["Esc"] = VirtualKey.Escape, ["Escape"] = VirtualKey.Escape, ["Enter"] = VirtualKey.Enter, ["Return"] = VirtualKey.Enter, ["Space"] = VirtualKey.Space,
        ["Tab"] = VirtualKey.Tab, ["Backspace"] = VirtualKey.Back, ["Delete"] = VirtualKey.Delete, ["Del"] = VirtualKey.Delete, ["Insert"] = VirtualKey.Insert,
        ["Home"] = VirtualKey.Home, ["End"] = VirtualKey.End, ["PageUp"] = VirtualKey.PageUp, ["PageDown"] = VirtualKey.PageDown,
        ["Up"] = VirtualKey.Up, ["Down"] = VirtualKey.Down, ["Left"] = VirtualKey.Left, ["Right"] = VirtualKey.Right,
        ["Minus"] = VirtualKey.OemMinus, ["Equals"] = VirtualKey.OemPlus, ["Equal"] = VirtualKey.OemPlus, ["Comma"] = VirtualKey.OemComma, ["Period"] = VirtualKey.OemPeriod,
        ["Semicolon"] = VirtualKey.Oem1, ["Slash"] = VirtualKey.Oem2, ["Backquote"] = VirtualKey.Oem3, ["BracketLeft"] = VirtualKey.Oem4,
        ["Backslash"] = VirtualKey.Oem5, ["BracketRight"] = VirtualKey.Oem6, ["Quote"] = VirtualKey.Oem7,
        ["NumpadAdd"] = VirtualKey.Add, ["NumpadSubtract"] = VirtualKey.Subtract, ["NumpadMultiply"] = VirtualKey.Multiply, ["NumpadDivide"] = VirtualKey.Divide,
        ["NumpadDecimal"] = VirtualKey.Decimal, ["CapsLock"] = VirtualKey.CapsLock, ["PrintScreen"] = VirtualKey.PrintScreen,
        ["MediaPlayPause"] = VirtualKey.MediaPlayPause, ["MediaNext"] = VirtualKey.MediaNextTrack, ["MediaPrevious"] = VirtualKey.MediaPreviousTrack,
    };

    public static bool TryParse(string? chord, out IReadOnlyList<VirtualKey> keys)
    {
        keys = [];
        if (string.IsNullOrWhiteSpace(chord)) return false;
        var list = new List<VirtualKey>();
        foreach (var raw in chord.Split('+', StringSplitOptions.TrimEntries))
        {
            if (raw.Length == 0) return false;
            if (!TryKey(raw, out var k) || list.Contains(k)) return false;
            list.Add(k);
        }
        if (list.Count is 0 or > 8) return false;
        keys = list;
        return true;
    }

    private static bool TryKey(string name, out VirtualKey k)
    {
        if (Named.TryGetValue(name, out k)) return true;
        if (name.Length == 1 && char.IsAsciiLetter(name[0])) { k = (VirtualKey)((int)VirtualKey.A + (char.ToUpperInvariant(name[0]) - 'A')); return true; }
        if (name.Length == 1 && char.IsAsciiDigit(name[0])) { k = (VirtualKey)((int)VirtualKey.D0 + (name[0] - '0')); return true; }
        if (name.StartsWith("Numpad", StringComparison.OrdinalIgnoreCase) && name.Length == 7 && char.IsAsciiDigit(name[6])) { k = (VirtualKey)((int)VirtualKey.NumPad0 + (name[6] - '0')); return true; }
        if ((name[0] is 'F' or 'f') && int.TryParse(name[1..], out var f) && f is >= 1 and <= 24) { k = (VirtualKey)((int)VirtualKey.F1 + (f - 1)); return true; }
        k = VirtualKey.None;
        return false;
    }
}
