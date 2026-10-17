using PrismControl.Desktop.Sight;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Recipes;

namespace PrismControl.Sight.Service;

/// <summary>The game window Sight is reading.</summary>
public sealed record SightTarget(nint Hwnd, int Pid, string ProcessName, string? ExePath, string WindowClass, CompiledRecipe Recipe, SightGameAccess Access);

/// <summary>
/// What the control layer needs from the running reader: the target, its engine, fresh frames on demand and a temporary
/// frame-rate boost. Implemented by <see cref="SightService"/>; faked in tests.
/// </summary>
public interface ISightLive
{
    SightTarget? Target { get; }
    SightEngine? Engine { get; }

    /// <summary>
    /// Forces <paramref name="regions"/> to be read and waits until a frame containing them has been processed (from WGC
    /// or, on a static screen, from the cached last frame). False on timeout or when nothing is running.
    /// </summary>
    Task<bool> FreshAsync(IReadOnlyCollection<int> regions, TimeSpan timeout, CancellationToken ct);

    /// <summary>Faster capture while an action runs; dispose to restore.</summary>
    IDisposable Boost();

    /// <summary>The window currently in front (0 = none). Sight acts only when it is the target.</summary>
    nint ForegroundWindow();

    /// <summary>
    /// False while nothing can deliver frames (no target, capture paused or failed): read loops give up at once instead of
    /// spinning until their budget runs out.
    /// </summary>
    bool CanRead => Target is not null && Engine is not null;

    /// <summary>A point in the target's content (client-area) pixels → absolute virtual-desktop pixels.</summary>
    bool ContentToScreen(double x, double y, out PrismControl.Desktop.PointI screen);
}
