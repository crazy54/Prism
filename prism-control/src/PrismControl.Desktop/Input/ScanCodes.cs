namespace PrismControl.Desktop;

/// <summary>How keys are injected.</summary>
public enum KeyMode
{
    /// <summary>The virtual key (wVk) plus its scan code from the active layout. The default; right for apps and most games.</summary>
    VirtualKey,
    /// <summary>
    /// KEYEVENTF_SCANCODE only (wVk = 0), from a fixed US physical-position table (<see cref="UsScanCodes"/>), with
    /// KEYEVENTF_EXTENDEDKEY for E0-prefixed keys. For games that read raw keys (packs with keyMode "scancode").
    /// The key is the physical position: on an AZERTY keyboard VirtualKey.A sends the key where Q is printed.
    /// </summary>
    Scancode,
}

/// <summary>
/// US (set 1) make codes by physical position, keyed by the US virtual key. 0xE0xx = extended (E0 prefix). Generic
/// modifiers map to the left key. Pause (E1-prefixed) has no single scan code and is not supported in scancode mode.
/// Same table as Macros' StandardScanCodes (copied, not referenced), completed for every <see cref="VirtualKey"/>.
/// </summary>
public static class UsScanCodes
{
    private static readonly Dictionary<VirtualKey, ushort> Map = Build();

    /// <summary>The make code (0xE0xx for extended keys), or false when the key has no scan code in scancode mode.</summary>
    public static bool TryGet(VirtualKey key, out ushort scan) => Map.TryGetValue(key, out scan);

    private static Dictionary<VirtualKey, ushort> Build()
    {
        var m = new Dictionary<VirtualKey, ushort>();
        ushort[] letters = [0x1E, 0x30, 0x2E, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1F, 0x14, 0x16, 0x2F, 0x11, 0x2D, 0x15, 0x2C];
        for (var i = 0; i < 26; i++) m[(VirtualKey)('A' + i)] = letters[i];
        m[VirtualKey.D0] = 0x0B;
        for (var d = 1; d <= 9; d++) m[(VirtualKey)('0' + d)] = (ushort)(0x01 + d);
        ushort[] f = [0x3B, 0x3C, 0x3D, 0x3E, 0x3F, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x76];
        for (var i = 0; i < f.Length; i++) m[(VirtualKey)((int)VirtualKey.F1 + i)] = f[i];
        (VirtualKey, ushort)[] rest =
        [
            (VirtualKey.Escape, 0x01), (VirtualKey.Back, 0x0E), (VirtualKey.Tab, 0x0F), (VirtualKey.Enter, 0x1C), (VirtualKey.Space, 0x39),
            (VirtualKey.CapsLock, 0x3A), (VirtualKey.NumLock, 0xE045), (VirtualKey.ScrollLock, 0x46), (VirtualKey.PrintScreen, 0xE037),
            (VirtualKey.Insert, 0xE052), (VirtualKey.Delete, 0xE053), (VirtualKey.Home, 0xE047), (VirtualKey.End, 0xE04F),
            (VirtualKey.PageUp, 0xE049), (VirtualKey.PageDown, 0xE051), (VirtualKey.Left, 0xE04B), (VirtualKey.Up, 0xE048),
            (VirtualKey.Right, 0xE04D), (VirtualKey.Down, 0xE050), (VirtualKey.Apps, 0xE05D),
            (VirtualKey.NumPad0, 0x52), (VirtualKey.NumPad1, 0x4F), (VirtualKey.NumPad2, 0x50), (VirtualKey.NumPad3, 0x51), (VirtualKey.NumPad4, 0x4B),
            (VirtualKey.NumPad5, 0x4C), (VirtualKey.NumPad6, 0x4D), (VirtualKey.NumPad7, 0x47), (VirtualKey.NumPad8, 0x48), (VirtualKey.NumPad9, 0x49),
            (VirtualKey.Multiply, 0x37), (VirtualKey.Add, 0x4E), (VirtualKey.Subtract, 0x4A), (VirtualKey.Decimal, 0x53), (VirtualKey.Divide, 0xE035),
            (VirtualKey.Oem1, 0x27), (VirtualKey.OemPlus, 0x0D), (VirtualKey.OemComma, 0x33), (VirtualKey.OemMinus, 0x0C), (VirtualKey.OemPeriod, 0x34),
            (VirtualKey.Oem2, 0x35), (VirtualKey.Oem3, 0x29), (VirtualKey.Oem4, 0x1A), (VirtualKey.Oem5, 0x2B), (VirtualKey.Oem6, 0x1B),
            (VirtualKey.Oem7, 0x28), (VirtualKey.Oem102, 0x56),
            (VirtualKey.Shift, 0x2A), (VirtualKey.LeftShift, 0x2A), (VirtualKey.RightShift, 0x36),
            (VirtualKey.Control, 0x1D), (VirtualKey.LeftControl, 0x1D), (VirtualKey.RightControl, 0xE01D),
            (VirtualKey.Alt, 0x38), (VirtualKey.LeftAlt, 0x38), (VirtualKey.RightAlt, 0xE038),
            (VirtualKey.LeftWindows, 0xE05B), (VirtualKey.RightWindows, 0xE05C), (VirtualKey.Sleep, 0xE05F),
            (VirtualKey.MediaPlayPause, 0xE022), (VirtualKey.MediaNextTrack, 0xE019), (VirtualKey.MediaPreviousTrack, 0xE010), (VirtualKey.MediaStop, 0xE024),
            (VirtualKey.VolumeMute, 0xE020), (VirtualKey.VolumeDown, 0xE02E), (VirtualKey.VolumeUp, 0xE030),
            (VirtualKey.BrowserBack, 0xE06A), (VirtualKey.BrowserForward, 0xE069), (VirtualKey.BrowserRefresh, 0xE067), (VirtualKey.BrowserStop, 0xE068),
            (VirtualKey.BrowserSearch, 0xE065), (VirtualKey.BrowserFavorites, 0xE066), (VirtualKey.BrowserHome, 0xE032),
            (VirtualKey.LaunchMail, 0xE06C), (VirtualKey.LaunchMediaSelect, 0xE06D), (VirtualKey.LaunchApp1, 0xE06B), (VirtualKey.LaunchApp2, 0xE021),
        ];
        foreach (var (k, s) in rest) m[k] = s;
        return m;
    }
}
