using System.Runtime.InteropServices;
using PrismControl.Macros.Engine;
using PrismControl.Testing;
using static PrismControl.Macros.Tests.K;

namespace PrismControl.Macros.Tests;

public class KeyChordTests
{
    [Test]
    public void Parses_to_canonical_text()
    {
        Assert.Equal("Ctrl+Shift+T", KeyChord.Parse("ctrl+shift+t").ToString());
        Assert.Equal("Ctrl+Shift+T", KeyChord.Parse("Shift + Ctrl + T").ToString(), "modifier order is canonical");
        Assert.Equal("Ctrl+Alt+Shift+Win+F13", KeyChord.Parse("win+shift+alt+control+f13").ToString());
        Assert.Equal("Ctrl+Delete", KeyChord.Parse("Control+Del").ToString());
        Assert.Equal("Ctrl+Plus", KeyChord.Parse("Ctrl++").ToString());
        Assert.Equal("Ctrl+Plus", KeyChord.Parse("Ctrl+=").ToString());
        Assert.Equal("Plus", KeyChord.Parse("+").ToString());
        Assert.Equal("Win+Left", KeyChord.Parse("Meta+ArrowLeft").ToString());
        Assert.Equal("RAlt+E", KeyChord.Parse("AltGr+e").ToString());
        Assert.Equal("Win", KeyChord.Parse("Win").ToString(), "modifiers only");
        Assert.Equal("F13", KeyChord.Parse("0x7C").ToString(), "raw virtual-key codes map to names");
        Assert.Equal("Ctrl+A", KeyChord.Parse("Ctrl+0x41").ToString());
        Assert.Equal("Apps", KeyChord.Parse("Menu").ToString());
        Assert.Equal("NumpadEnter", KeyChord.Parse("NumpadEnter").ToString());
    }

    [Test]
    public void Every_named_key_round_trips()
    {
        foreach (var k in KeyNames.All)
        {
            var c = KeyChord.Parse("Ctrl+" + k.Name);
            Assert.Equal(k, c.Key, k.Name);
            Assert.Equal("Ctrl+" + k.Name, c.ToString());
        }
    }

    [Test]
    public void Rejects_bad_chords_with_a_reason()
    {
        foreach (var (text, expect) in new[]
        {
            ("", "Enter a key"), ("   ", "Enter a key"), ("Ctrl+", "empty key"), ("Ctrl+Bogus", "Unknown key \"Bogus\""),
            ("A+B", "one key besides the modifiers"), ("Ctrl+Shift+T+U", "one key besides"),
        })
        {
            Assert.False(KeyChord.TryParse(text, out _, out var error), text);
            Assert.Contains(expect, error, text);
        }
    }

    [Test]
    public void Windows_reserved_chords_are_refused()
    {
        Assert.Contains("Ctrl+Alt+Delete", KeyChord.Parse("Ctrl+Alt+Del").ReservedReason());
        Assert.Contains("Win+L", KeyChord.Parse("Win+L").ReservedReason());
        Assert.Null(KeyChord.Parse("Ctrl+Alt+T").ReservedReason());
        Assert.Contains("reserves", new ChordStep("Win+L").Validate().FirstOrDefault());
    }
}

public class InputTranslationTests
{
    private static readonly StandardScanCodes Map = StandardScanCodes.Instance;

    [Test]
    public void Chord_is_modifiers_down_in_order_key_then_up_in_reverse()
    {
        Sequence("Ctrl+Shift+T",
        [
            Down(0xA2, 0x1D), Down(0xA0, 0x2A), Down(0x54, 0x14),
            Up(0x54, 0x14), Up(0xA0, 0x2A), Up(0xA2, 0x1D),
        ]);
    }

    [Test]
    public void All_four_modifiers_keep_canonical_order()
    {
        Sequence("Win+Shift+Alt+Ctrl+F13",
        [
            Down(0xA2, 0x1D), Down(0xA4, 0x38), Down(0xA0, 0x2A), Down(0x5B, 0x5B, KeyFlags.ExtendedKey), Down(0x7C, 0x64),
            Up(0x7C, 0x64), Up(0x5B, 0x5B, KeyFlags.ExtendedKey), Up(0xA0, 0x2A), Up(0xA4, 0x38), Up(0xA2, 0x1D),
        ]);
    }

    [Test]
    public void Extended_keys_carry_the_flag()
    {
        // Win (E05B) and the arrow cluster (Microsoft lists it as extended; MapVirtualKey reports 0x4B without E0).
        Sequence("Win+Left",
        [
            Down(0x5B, 0x5B, KeyFlags.ExtendedKey), Down(0x25, 0x4B, KeyFlags.ExtendedKey),
            Up(0x25, 0x4B, KeyFlags.ExtendedKey), Up(0x5B, 0x5B, KeyFlags.ExtendedKey),
        ]);
        Sequence("RAlt+E", [Down(0xA5, 0x38, KeyFlags.ExtendedKey), Down(0x45, 0x12), Up(0x45, 0x12), Up(0xA5, 0x38, KeyFlags.ExtendedKey)]);
        Sequence("NumpadEnter", [Down(0x0D, 0x1C, KeyFlags.ExtendedKey), Up(0x0D, 0x1C, KeyFlags.ExtendedKey)]);
        Sequence("Enter", [Down(0x0D, 0x1C), Up(0x0D, 0x1C)]);
        Sequence("Shift+Delete", [Down(0xA0, 0x2A), Down(0x2E, 0x53, KeyFlags.ExtendedKey), Up(0x2E, 0x53, KeyFlags.ExtendedKey), Up(0xA0, 0x2A)]);
        Sequence("Ctrl+Plus", [Down(0xA2, 0x1D), Down(0xBB, 0x0D), Up(0xBB, 0x0D), Up(0xA2, 0x1D)]);
        Sequence("Win", [Down(0x5B, 0x5B, KeyFlags.ExtendedKey), Up(0x5B, 0x5B, KeyFlags.ExtendedKey)]);
    }

    [Test]
    public void Scan_code_mode_sends_scan_codes_only()
    {
        var seq = InputBuilder.Chord(KeyChord.Parse("Ctrl+W"), Map, scanMode: true);
        K.SequenceEqual(
        [
            Down(0, 0x1D, KeyFlags.ScanCode), Down(0, 0x11, KeyFlags.ScanCode),
            Up(0, 0x11, KeyFlags.ScanCode), Up(0, 0x1D, KeyFlags.ScanCode),
        ], seq);
        var win = InputBuilder.Chord(KeyChord.Parse("Win+D"), Map, scanMode: true);
        Assert.Equal(Down(0, 0x5B, KeyFlags.ScanCode | KeyFlags.ExtendedKey), win[0]);
    }

    [Test]
    public void Media_keys_are_extended_taps()
    {
        K.SequenceEqual([Down(0xB3, 0x22, KeyFlags.ExtendedKey), Up(0xB3, 0x22, KeyFlags.ExtendedKey)], InputBuilder.Tap(MediaKeys.KeyFor(MediaKey.PlayPause), Map));
        (MediaKey Key, ushort Vk, ushort Scan)[] table =
        [
            (MediaKey.Next, 0xB0, 0x19), (MediaKey.Previous, 0xB1, 0x10), (MediaKey.Stop, 0xB2, 0x24),
            (MediaKey.Mute, 0xAD, 0x20), (MediaKey.VolumeDown, 0xAE, 0x2E), (MediaKey.VolumeUp, 0xAF, 0x30),
        ];
        foreach (var (key, vk, scan) in table)
            K.SequenceEqual([Down(vk, scan, KeyFlags.ExtendedKey), Up(vk, scan, KeyFlags.ExtendedKey)], InputBuilder.Tap(MediaKeys.KeyFor(key), Map), key.ToString());
    }

    [Test]
    public void Text_is_unicode_pairs_with_surrogates_and_newlines()
    {
        var u = KeyFlags.Unicode;
        var events = InputBuilder.Text("aé😀\r\n\tz", Map);
        K.SequenceEqual(
        [
            Down(0, 'a', u), Up(0, 'a', u),
            Down(0, 0xE9, u), Up(0, 0xE9, u),
            Down(0, 0xD83D, u), Up(0, 0xD83D, u), Down(0, 0xDE00, u), Up(0, 0xDE00, u), // U+1F600 as two UTF-16 units
            Down(0x0D, 0x1C), Up(0x0D, 0x1C),                                         // \r\n is one Enter
            Down(0x09, 0x0F), Up(0x09, 0x0F),                                         // \t is Tab
            Down(0, 'z', u), Up(0, 'z', u),
        ], events);
        Assert.Equal(4, InputBuilder.Text("\r\r", Map).Count, "a lone \\r is Enter too");
        Assert.Empty(InputBuilder.Text("\u0007\u0000", Map), "other control characters are skipped");
    }

    [Test]
    public void Text_batches_never_split_a_down_from_its_up()
    {
        var events = InputBuilder.Text(new string('x', 70), Map);
        var batches = InputBuilder.Batches(events, TextStep.BatchEvents).ToList();
        Assert.Equal(3, batches.Count);
        Assert.Equal(64, batches[0].Length);
        Assert.Equal(12, batches[2].Length);
        Assert.True(batches.All(b => b.Length % 2 == 0 && !b[0].IsUp && b[^1].IsUp));
        Assert.Equal(1, InputBuilder.Batches(events, 1).First().Length / 2, "a batch holds at least one pair");
    }

    [Test]
    public void Native_INPUT_layout_matches_x64()
    {
        Assert.Equal(40, Marshal.SizeOf<NativeInput.INPUT>());
        Assert.Equal(8, (int)Marshal.OffsetOf<NativeInput.INPUT>("u"));
        Assert.Equal(24, Marshal.SizeOf<NativeInput.KEYBDINPUT>());
        Assert.Equal(32, Marshal.SizeOf<NativeInput.MOUSEINPUT>());
        Assert.Equal(8, Marshal.SizeOf<NativeInput.HARDWAREINPUT>());
        unsafe { Assert.Equal(40, sizeof(NativeInput.INPUT)); }
    }

    [Test]
    public unsafe void KeyInput_maps_to_KEYBDINPUT_fields()
    {
        var native = NativeInput.ToNative(new KeyInput(0x5B, 0x5B, KeyFlags.ExtendedKey | KeyFlags.KeyUp));
        var bytes = new byte[sizeof(NativeInput.INPUT)];
        fixed (byte* p = bytes) *(NativeInput.INPUT*)p = native;
        Assert.Equal(1u, BitConverter.ToUInt32(bytes, 0), "type = INPUT_KEYBOARD");
        Assert.Equal((ushort)0x5B, BitConverter.ToUInt16(bytes, 8), "wVk at +8");
        Assert.Equal((ushort)0x5B, BitConverter.ToUInt16(bytes, 10), "wScan at +10");
        Assert.Equal(0x3u, BitConverter.ToUInt32(bytes, 12), "dwFlags at +12");
        Assert.Equal(0u, BitConverter.ToUInt32(bytes, 16), "time at +16");
        Assert.Equal((long)NativeInput.ExtraInfoMarker, BitConverter.ToInt64(bytes, 24), "dwExtraInfo at +24");
    }

    private static void Sequence(string chord, KeyInput[] expected) =>
        K.SequenceEqual(expected, InputBuilder.Chord(KeyChord.Parse(chord), Map), chord);
}
