using PrismControl.Core.Hosting;

namespace PrismControl.WinShell;

/// <summary>
/// OWNER: W2 "System &amp; Firmware" (features 5, 6, 7, 8, 10, 11, 12, 14: system health + firmware, toggles with true
/// state, on-air light, clipboard history, power, kill the frozen app, capture hotkeys, notification count).
/// <para>
/// This is a STUB created by W1 so the module builds today. W2: fill <see cref="Register"/> and <see cref="DisposeAsync"/>,
/// and put your code in System/, Firmware/, Clipboard/ and Capture/. Nothing else in the module calls into W2's code.
/// </para>
/// <para>
/// What W1 has already registered in <c>context.Services</c> when <see cref="Register"/> runs:
/// <list type="bullet">
/// <item><c>Shared.WinShellServices</c> (the whole graph) and its parts;</item>
/// <item>Desktop's <c>IForegroundService</c>, <c>IInputSender</c>, <c>IWindowCatalog</c>, <c>IIconProvider</c> — already the
///   logging fakes in safe mode (paste-into-previous-window: <c>IForegroundService.LastExternalForeground</c>);</item>
/// <item><c>Shared.WinShellOptions</c> (global section "windows": <c>StreamerSafe</c> hides clipboard previews too);</item>
/// <item><c>Switcher.GameModeService</c> (calm down during games).</item>
/// </list>
/// Shared helpers you can use: <c>Shared.HoldConfirm</c> (keys: 1.5 s ring), <c>Shared.ArmConfirm</c> (dials: push twice),
/// <c>Shared.Flash</c>, <c>Shared.WinArt</c> (HoldOverlay, ArmedBanner, AlertMarks, ValueKey, GlyphKey), <c>Shared.Native</c>.
/// Swap your writers on <c>context.SafeMode</c> here, once (authoring-actions.md § Safe mode).
/// </para>
/// </summary>
internal static class SystemFeatures
{
    /// <summary>Called once from <see cref="WinShellModule.Initialize"/>, after W1's services are registered. Keep it fast.</summary>
    public static void Register(IModuleContext context)
    {
        // W2: register System/Firmware/Clipboard/Capture services here.
    }

    /// <summary>Called on shutdown, before W1's services are disposed.</summary>
    public static ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
