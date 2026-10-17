using PrismControl.Core.Hosting;

namespace PrismControl.WinShell.Shared;

public static class ServiceExtensions
{
    /// <summary>The registered service, or null when the module did not register it (a failed init, or a test).</summary>
    public static T? Find<T>(this IServiceRegistry services) where T : class => services.TryGet<T>(out var v) ? v : null;
}
