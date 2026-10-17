namespace PrismControl.Smart.Packs;

/// <summary>
/// The hard denylist of chords an AI assistant can never set (lead decision 2): Alt+F4, any Windows-key combination
/// (Win+L / Win+R / Win+X and every other), Ctrl+Alt+Del and the system Ctrl+Alt shortcuts, Ctrl+Shift+Esc, every
/// Print Screen variant, and the other window-manager shortcuts (Alt+Tab, Alt+Esc, Ctrl+Esc, Alt+Space). Side-specific
/// modifiers count the same as the plain ones. Pure.
/// </summary>
public static class ChordPolicy
{
    /// <summary>Ctrl+Alt + one of these is a system shortcut (secure attention, Remote Desktop, display rotation…).</summary>
    private static readonly HashSet<string> SystemCtrlAltKeys = new(StringComparer.Ordinal)
    {
        "Delete", "NumpadDecimal", "End", "Tab", "Pause", "Home", "Up", "Down", "Left", "Right", "Esc", "Insert", "Backspace",
        "NumpadAdd", "NumpadSubtract", "Space", "F4",
    };

    /// <summary>Why an AI may never set <paramref name="chord"/>, or null when it may.</summary>
    public static string? AiForbidden(Chord chord)
    {
        var names = chord.Keys.Select(k => k.Name).ToList();
        bool Has(int rank) => names.Any(n => Chord.ModifierRank(n) == rank);
        var key = chord.Key.Name;
        var win = Has(0);
        var ctrl = Has(1);
        var alt = Has(2);
        var shift = Has(3);
        if (win) return "Windows-key shortcuts (Win+L, Win+R, Win+X …) control the system";
        if (key == "PrintScreen") return "Print Screen captures the screen";
        if (alt && key == "F4") return "Alt+F4 closes windows";
        if (ctrl && alt && SystemCtrlAltKeys.Contains(key)) return $"Ctrl+Alt+{key} is a system shortcut";
        if (ctrl && shift && key == "Esc") return "Ctrl+Shift+Esc opens Task Manager";
        if (ctrl && !alt && key == "Esc") return "Ctrl+Esc opens the Start menu";
        if (alt && key is "Tab" or "Esc" or "Space") return $"Alt+{key} is a window-manager shortcut";
        return null;
    }
}
