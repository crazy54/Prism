using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>
/// The global-settings section <c>"desktop"</c> (shared by every Prism Control module that brings windows to the front).
/// <see cref="DesktopServices.GetOrCreate"/> applies it to the foreground service once the settings load and on every change.
/// </summary>
public sealed class DesktopGlobalSettings
{
    public const string Section = "desktop";

    /// <summary>
    /// Use the hotkey trick (a real key press of <see cref="FocusTrickKey"/>, registered as our own hotkey first) to gain
    /// the foreground right. False: no key is ever pressed; Windows decides, and the target's taskbar button may flash instead.
    /// </summary>
    public bool FocusTrick { get; set; } = true;

    /// <summary>The key the trick registers and presses: F13–F24 (default F22, Chromium's choice).</summary>
    public string FocusTrickKey { get; set; } = "F22";
}

/// <summary>What the last hotkey-trick attempt did (diagnostics, PI status).</summary>
public enum HotkeyTrickStatus
{
    /// <summary>No foreground request needed the trick yet.</summary>
    NotTried,
    /// <summary>WM_HOTKEY arrived: the right was gained.</summary>
    Fired,
    /// <summary>The key was sent but no WM_HOTKEY arrived in time.</summary>
    TimedOut,
    /// <summary>Another app registered the key as a global hotkey: it was not sent.</summary>
    KeyInUse,
    /// <summary>The trick is turned off (<see cref="DesktopGlobalSettings.FocusTrick"/>): nothing was sent.</summary>
    Disabled,
    /// <summary>Not needed or not possible this time (we already own the foreground, or an elevated app is in front).</summary>
    Skipped,
    /// <summary>SendInput or RegisterHotKey failed for another reason.</summary>
    Failed,
}

/// <summary>The hotkey-trick switches of a foreground service (real: <see cref="ForegroundService"/>; safe mode: <see cref="SafeModeForegroundService"/>).</summary>
public interface IHotkeyTrickSettings
{
    /// <summary>False: the trick is never used (no key press); see <see cref="DesktopGlobalSettings.FocusTrick"/>.</summary>
    bool HotkeyTrickEnabled { get; set; }

    /// <summary>The trick key, F13–F24 only (<see cref="ArgumentOutOfRangeException"/> otherwise). Default F22.</summary>
    VirtualKey HotkeyTrickKey { get; set; }

    HotkeyTrickStatus LastTrick { get; }
}

/// <summary>Checks whether a key is free to be pressed without triggering another app's global hotkey.</summary>
public interface IHotkeyProbe
{
    /// <summary>
    /// RegisterHotKey(<paramref name="key"/>, no modifiers) on the shell window, then UnregisterHotKey at once.
    /// true = no app holds it as a RegisterHotKey hotkey (hook-based hotkeys, e.g. some OBS/Discord/AutoHotkey setups,
    /// cannot be detected); false = another app registered it; null = it could not be checked.
    /// </summary>
    Task<bool?> IsFreeAsync(VirtualKey key, CancellationToken ct = default);
}

/// <summary>F13–F24 names and checks (the keys the hotkey trick and picture-in-picture may use).</summary>
public static class FunctionKeys
{
    /// <summary>"F13"…"F24" (case-insensitive, trimmed) → the key; anything else → null.</summary>
    public static VirtualKey? Parse(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var s = name.Trim();
        if (s.Length is < 3 or > 3 || (s[0] != 'F' && s[0] != 'f')) return null;
        if (!int.TryParse(s.AsSpan(1), System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var n) || n is < 13 or > 24) return null;
        return (VirtualKey)((int)VirtualKey.F13 + (n - 13));
    }

    /// <summary>"F13"…"F24" for those keys; the enum name otherwise.</summary>
    public static string Name(VirtualKey k) => IsF13ToF24(k) ? "F" + (13 + (k - VirtualKey.F13)).ToString(System.Globalization.CultureInfo.InvariantCulture) : k.ToString();

    public static bool IsF13ToF24(VirtualKey k) => k >= VirtualKey.F13 && k <= VirtualKey.F24;
}

/// <summary>The real probe: a momentary RegisterHotKey on the shell thread's hidden window (no input is sent).</summary>
internal sealed class ShellHotkeyProbe(ShellThread shell, ILog log) : IHotkeyProbe
{
    /// <summary>A hotkey id distinct from the trick's (<see cref="Win32ForegroundNative.HotkeyId"/>).</summary>
    internal const int ProbeId = 0xBABB;
    private readonly ILog _log = log.For("hotkeys");

    public async Task<bool?> IsFreeAsync(VirtualKey key, CancellationToken ct = default)
    {
        if (key == 0) return null;
        try
        {
            return await shell.InvokeAsync<bool?>(() =>
            {
                if (shell.TryRegisterHotkey(ProbeId, 0, (uint)key, static () => { }, out var error))
                {
                    shell.UnregisterHotkey(ProbeId);
                    return true;
                }
                return error == Kernel32.ERROR_HOTKEY_ALREADY_REGISTERED ? false : null;
            }, ct).ConfigureAwait(false);
        }
        catch (ObjectDisposedException) { return null; }
        catch (InvalidOperationException ex)
        {
            _log.Debug("hotkey probe failed: " + ex.Message);
            return null;
        }
    }
}
