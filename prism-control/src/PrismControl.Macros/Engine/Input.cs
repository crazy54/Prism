using System.Globalization;

namespace PrismControl.Macros.Engine;

/// <summary>KEYBDINPUT.dwFlags (KEYEVENTF_*).</summary>
[Flags]
public enum KeyFlags : uint
{
    None = 0,
    ExtendedKey = 0x1,
    KeyUp = 0x2,
    Unicode = 0x4,
    ScanCode = 0x8,
}

/// <summary>One keyboard event, exactly the fields of a KEYBDINPUT the engine fills (time = 0, dwExtraInfo = our marker).</summary>
public readonly record struct KeyInput(ushort Vk, ushort Scan, KeyFlags Flags)
{
    public bool IsUp => (Flags & KeyFlags.KeyUp) != 0;

    public override string ToString() =>
        string.Create(CultureInfo.InvariantCulture, $"{(IsUp ? "up" : "down")} vk=0x{Vk:X2} scan=0x{Scan:X2} flags={Flags}");
}

/// <summary>Where keyboard events go. The real one calls SendInput; tests use a recording fake.</summary>
public interface IInputSink
{
    /// <summary>Sends one batch atomically (one SendInput call, so real typing cannot interleave). Returns how many events Windows accepted.</summary>
    int Send(ReadOnlySpan<KeyInput> inputs);
}

/// <summary>Virtual-key to scan code, in MAPVK_VK_TO_VSC_EX form: 0xE0xx for E0-prefixed keys, 0 when unknown.</summary>
public interface IScanCodeMap
{
    ushort ToScanCode(ushort vk);
}

/// <summary>
/// A fixed US set-1 table. It matches MapVirtualKeyW(MAPVK_VK_TO_VSC_EX) on this PC (research/windows.md §3.1: Left 0x4B,
/// Delete 0x53, Win 0xE05B, RAlt 0xE038, media keys 0xE0xx). Tests use it for deterministic INPUT sequences; the real map
/// falls back to it when Windows returns 0.
/// </summary>
public sealed class StandardScanCodes : IScanCodeMap
{
    public static readonly StandardScanCodes Instance = new();

    private static readonly Dictionary<ushort, ushort> Map = Build();

    public ushort ToScanCode(ushort vk) => Map.GetValueOrDefault(vk);

    private static Dictionary<ushort, ushort> Build()
    {
        var m = new Dictionary<ushort, ushort>();
        const string letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        ushort[] letterScans = [0x1E, 0x30, 0x2E, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1F, 0x14, 0x16, 0x2F, 0x11, 0x2D, 0x15, 0x2C];
        for (var i = 0; i < letters.Length; i++) m[letters[i]] = letterScans[i];
        m['0'] = 0x0B;
        for (var d = 1; d <= 9; d++) m[(ushort)('0' + d)] = (ushort)(0x01 + d);
        ushort[] fkeys = [0x3B, 0x3C, 0x3D, 0x3E, 0x3F, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x76];
        for (var i = 0; i < fkeys.Length; i++) m[(ushort)(0x70 + i)] = fkeys[i];
        (ushort Vk, ushort Scan)[] rest =
        [
            (0x1B, 0x01), (0x08, 0x0E), (0x09, 0x0F), (0x0D, 0x1C), (0x20, 0x39), (0x14, 0x3A), (0x90, 0xE045), (0x91, 0x46), (0x13, 0xE11D),
            (0x2C, 0xE037), (0x2D, 0x52), (0x2E, 0x53), (0x24, 0x47), (0x23, 0x4F), (0x21, 0x49), (0x22, 0x51),
            (0x25, 0x4B), (0x26, 0x48), (0x27, 0x4D), (0x28, 0x50), (0x5D, 0xE05D),
            (0x60, 0x52), (0x61, 0x4F), (0x62, 0x50), (0x63, 0x51), (0x64, 0x4B), (0x65, 0x4C), (0x66, 0x4D), (0x67, 0x47), (0x68, 0x48), (0x69, 0x49),
            (0x6A, 0x37), (0x6B, 0x4E), (0x6D, 0x4A), (0x6E, 0x53), (0x6F, 0xE035),
            (0xBA, 0x27), (0xBB, 0x0D), (0xBC, 0x33), (0xBD, 0x0C), (0xBE, 0x34), (0xBF, 0x35), (0xC0, 0x29), (0xDB, 0x1A), (0xDC, 0x2B), (0xDD, 0x1B), (0xDE, 0x28), (0xE2, 0x56),
            (0xA0, 0x2A), (0xA1, 0x36), (0xA2, 0x1D), (0xA3, 0xE01D), (0xA4, 0x38), (0xA5, 0xE038), (0x5B, 0xE05B), (0x5C, 0xE05C),
            (0xB3, 0xE022), (0xB0, 0xE019), (0xB1, 0xE010), (0xB2, 0xE024), (0xAD, 0xE020), (0xAE, 0xE02E), (0xAF, 0xE030),
            (0xA6, 0xE06A), (0xA7, 0xE069), (0xA8, 0xE067), (0xAC, 0xE032),
        ];
        foreach (var (vk, scan) in rest) m[vk] = scan;
        return m;
    }
}

/// <summary>Turns chords, text and media keys into KEYBDINPUT sequences. Pure: no Windows calls.</summary>
public static class InputBuilder
{
    /// <summary>One key event. Scan-code mode (KEYEVENTF_SCANCODE, for games that read scan codes) drops the virtual key.</summary>
    public static KeyInput Key(KeyDef key, IScanCodeMap map, bool up, bool scanMode = false)
    {
        var sc = map.ToScanCode(key.Vk);
        var extended = key.Extended || (sc >> 8) == 0xE0;
        var scan = (ushort)(sc & 0xFF);
        var flags = extended ? KeyFlags.ExtendedKey : KeyFlags.None;
        if (up) flags |= KeyFlags.KeyUp;
        if (scanMode && scan != 0) return new KeyInput(0, scan, flags | KeyFlags.ScanCode);
        return new KeyInput(key.Vk, scan, flags);
    }

    /// <summary>Modifiers down (in order), key down / key up, modifiers up (in reverse).</summary>
    public static (KeyInput[] Down, KeyInput[] Up) ChordHalves(KeyChord chord, IScanCodeMap map, bool scanMode = false)
    {
        var keys = chord.ModifierKeyDefs.ToList();
        if (chord.Key is { } k) keys.Add(k);
        var down = keys.Select(x => Key(x, map, up: false, scanMode)).ToArray();
        var up = Enumerable.Reverse(keys).Select(x => Key(x, map, up: true, scanMode)).ToArray();
        return (down, up);
    }

    /// <summary>The whole chord as one batch (sent in one SendInput call).</summary>
    public static KeyInput[] Chord(KeyChord chord, IScanCodeMap map, bool scanMode = false)
    {
        var (down, up) = ChordHalves(chord, map, scanMode);
        return [.. down, .. up];
    }

    /// <summary>A tap of one key (down + up), e.g. a media key.</summary>
    public static KeyInput[] Tap(KeyDef key, IScanCodeMap map) => [Key(key, map, false), Key(key, map, true)];

    /// <summary>
    /// Text as KEYEVENTF_UNICODE events: wVk = 0, wScan = the UTF-16 code unit, a down + up pair per unit (a surrogate pair is
    /// two units). Layout-independent. \n and \r\n press Enter, \t presses Tab; other control characters are skipped.
    /// </summary>
    public static List<KeyInput> Text(string text, IScanCodeMap map)
    {
        var list = new List<KeyInput>(text.Length * 2);
        var enter = KeyNames.Find("Enter")!;
        var tab = KeyNames.Find("Tab")!;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (c == '\r')
            {
                if (i + 1 < text.Length && text[i + 1] == '\n') continue;
                c = '\n';
            }
            if (c == '\n') { list.AddRange(Tap(enter, map)); continue; }
            if (c == '\t') { list.AddRange(Tap(tab, map)); continue; }
            if (char.IsControl(c)) continue;
            list.Add(new KeyInput(0, c, KeyFlags.Unicode));
            list.Add(new KeyInput(0, c, KeyFlags.Unicode | KeyFlags.KeyUp));
        }
        return list;
    }

    /// <summary>Splits text events into batches of at most <paramref name="maxEvents"/>, never between a down and its up.</summary>
    public static IEnumerable<KeyInput[]> Batches(IReadOnlyList<KeyInput> events, int maxEvents)
    {
        maxEvents = Math.Max(2, maxEvents - maxEvents % 2);
        for (var i = 0; i < events.Count; i += maxEvents)
            yield return events.Skip(i).Take(maxEvents).ToArray();
    }
}
