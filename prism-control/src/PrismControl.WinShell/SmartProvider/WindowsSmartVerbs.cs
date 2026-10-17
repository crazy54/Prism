// SD2 (team Prism Play): the windows module's verbs and readouts for the Prism Smart Deck, published through SD1's
// IVerbRegistry (Desktop). Additive: this folder plus one registration line in WinShellModule.Initialize. It only CALLS
// W1's services (the same ones the 13 actions use), so safe mode, refusals (admin, hung, fullscreen windows), the HDR
// resync and the refresh-rate auto-revert all apply unchanged. Builds without Desktop too (the registration is a no-op).
using PrismControl.Core.Hosting;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.SmartProvider;

/// <summary>Registers the windows module's Smart Deck verbs (W1's part of the composite <c>windows</c> provider).</summary>
public static class WindowsSmartVerbs
{
    /// <summary>Called once from <see cref="WinShellModule.Initialize"/>, after the services are registered.</summary>
    public static void Register(IModuleContext context, WinShellServices services)
    {
#if PRISM_DESKTOP
        var registry = PrismControl.Desktop.VerbRegistry.GetOrCreate(context.Services);
        var provider = WindowsVerbProvider.GetOrRegister(registry, context.Time);
        var part = new W1VerbPart(services, context.Time, context.OpenUrl);
        provider.Add(part);
        context.ShutdownToken.Register(() => { provider.Remove(part); part.Dispose(); });
#endif
    }
}
