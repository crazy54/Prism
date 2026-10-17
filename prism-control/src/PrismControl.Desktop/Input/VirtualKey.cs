namespace PrismControl.Desktop;

/// <summary>
/// Windows virtual-key codes (VK_*). Named <c>VirtualKey</c> per the platform contract; if you also import
/// <c>Windows.System</c> (which has its own VirtualKey), alias one: <c>using VirtualKey = PrismControl.Desktop.VirtualKey;</c>.
/// </summary>
public enum VirtualKey : ushort
{
    None = 0,
    Back = 0x08, Tab = 0x09, Clear = 0x0C, Enter = 0x0D,
    Shift = 0x10, Control = 0x11, Alt = 0x12, Pause = 0x13, CapsLock = 0x14,
    Escape = 0x1B, Space = 0x20, PageUp = 0x21, PageDown = 0x22, End = 0x23, Home = 0x24,
    Left = 0x25, Up = 0x26, Right = 0x27, Down = 0x28,
    Select = 0x29, Print = 0x2A, Execute = 0x2B, PrintScreen = 0x2C, Insert = 0x2D, Delete = 0x2E, Help = 0x2F,
    D0 = 0x30, D1, D2, D3, D4, D5, D6, D7, D8, D9,
    A = 0x41, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
    LeftWindows = 0x5B, RightWindows = 0x5C, Apps = 0x5D, Sleep = 0x5F,
    NumPad0 = 0x60, NumPad1, NumPad2, NumPad3, NumPad4, NumPad5, NumPad6, NumPad7, NumPad8, NumPad9,
    Multiply = 0x6A, Add = 0x6B, Separator = 0x6C, Subtract = 0x6D, Decimal = 0x6E, Divide = 0x6F,
    F1 = 0x70, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24,
    NumLock = 0x90, ScrollLock = 0x91,
    LeftShift = 0xA0, RightShift = 0xA1, LeftControl = 0xA2, RightControl = 0xA3, LeftAlt = 0xA4, RightAlt = 0xA5,
    BrowserBack = 0xA6, BrowserForward = 0xA7, BrowserRefresh = 0xA8, BrowserStop = 0xA9, BrowserSearch = 0xAA,
    BrowserFavorites = 0xAB, BrowserHome = 0xAC,
    VolumeMute = 0xAD, VolumeDown = 0xAE, VolumeUp = 0xAF,
    MediaNextTrack = 0xB0, MediaPreviousTrack = 0xB1, MediaStop = 0xB2, MediaPlayPause = 0xB3,
    LaunchMail = 0xB4, LaunchMediaSelect = 0xB5, LaunchApp1 = 0xB6, LaunchApp2 = 0xB7,
    /// <summary>;: on US layouts.</summary>
    Oem1 = 0xBA,
    OemPlus = 0xBB, OemComma = 0xBC, OemMinus = 0xBD, OemPeriod = 0xBE,
    /// <summary>/? on US layouts.</summary>
    Oem2 = 0xBF,
    /// <summary>`~ on US layouts.</summary>
    Oem3 = 0xC0,
    /// <summary>[{ on US layouts.</summary>
    Oem4 = 0xDB,
    /// <summary>\| on US layouts.</summary>
    Oem5 = 0xDC,
    /// <summary>]} on US layouts.</summary>
    Oem6 = 0xDD,
    /// <summary>'" on US layouts.</summary>
    Oem7 = 0xDE,
    Oem8 = 0xDF,
    /// <summary>The extra key on 102-key layouts (&lt;&gt; or \|).</summary>
    Oem102 = 0xE2,
}

public static class VirtualKeys
{
    /// <summary>
    /// Keys that need KEYEVENTF_EXTENDEDKEY (E0-prefixed scan codes). Without the flag Windows maps them to their numpad
    /// twins (Delete becomes NumPad Decimal, arrows become NumPad 2/4/6/8 with NumLock off).
    /// </summary>
    public static bool IsExtended(VirtualKey k) => k is VirtualKey.RightControl or VirtualKey.RightAlt
        or VirtualKey.Insert or VirtualKey.Delete or VirtualKey.Home or VirtualKey.End or VirtualKey.PageUp or VirtualKey.PageDown
        or VirtualKey.Left or VirtualKey.Up or VirtualKey.Right or VirtualKey.Down
        or VirtualKey.NumLock or VirtualKey.Divide or VirtualKey.PrintScreen
        or VirtualKey.LeftWindows or VirtualKey.RightWindows or VirtualKey.Apps
        or (>= VirtualKey.BrowserBack and <= VirtualKey.LaunchApp2);

    /// <summary>True for Shift, Control, Alt and Windows (either side or generic).</summary>
    public static bool IsModifier(VirtualKey k) => k is VirtualKey.Shift or VirtualKey.Control or VirtualKey.Alt
        or VirtualKey.LeftShift or VirtualKey.RightShift or VirtualKey.LeftControl or VirtualKey.RightControl
        or VirtualKey.LeftAlt or VirtualKey.RightAlt or VirtualKey.LeftWindows or VirtualKey.RightWindows;
}
