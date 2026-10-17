using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Shared;

/// <summary>Everything that only READS the PC (stays real in safe mode).</summary>
public sealed record WinShellReaders(
    IDisplayReader Display,
    IDdcBus Ddc,
    IWindowGeometryReader Geometry,
    IVirtualDesktopReader Desktops,
    IGameStateReader Game,
    IThumbnailSource Thumbnails)
{
    public static WinShellReaders Real(ILog log) => new(new Win32DisplayReader(), new Win32DdcBus(), new Win32WindowGeometry(),
        new RegistryVirtualDesktopReader(), new Win32GameStateReader(), new WgcThumbnailSource(log));
}

/// <summary>Every writer that changes the PC (windows.md §1.5). Safe mode swaps all of them in one place.</summary>
public sealed record WinShellWriters(IDisplayWriter Display, IDdcWriter Ddc, IWindowWriter Window)
{
    public static WinShellWriters Real() => new(new Win32DisplayWriter(), new Win32DdcWriter(), new Win32WindowWriter());
    public static WinShellWriters Safe(ILog log) => new(new SafeDisplayWriter(log), new SafeDdcWriter(log), new SafeWindowWriter(log));
}

/// <summary>
/// The windows module's service graph (W1). Built once in <see cref="WinShellModule.Initialize"/>, registered in the
/// service registry so actions (and W2's features) find them, disposed on shutdown (an unconfirmed display mode is
/// reverted first).
/// </summary>
public sealed class WinShellServices : IAsyncDisposable
{
    private WinShellServices(PlatformServices platform, WinShellOptions options, WinShellWriters writers, WindowList windows, GameModeService game,
        ThumbnailService thumbnails, VirtualDesktopService desktops, DisplayService display, DdcService ddc, PlacementService placement, bool safeMode)
    {
        Platform = platform;
        Options = options;
        Writers = writers;
        Windows = windows;
        Game = game;
        Thumbnails = thumbnails;
        Desktops = desktops;
        Display = display;
        Ddc = ddc;
        Placement = placement;
        SafeMode = safeMode;
    }

    public PlatformServices Platform { get; }
    public WinShellOptions Options { get; }
    public WinShellWriters Writers { get; }
    public WindowList Windows { get; }
    public GameModeService Game { get; }
    public ThumbnailService Thumbnails { get; }
    public VirtualDesktopService Desktops { get; }
    public DisplayService Display { get; }
    public DdcService Ddc { get; }
    public PlacementService Placement { get; }
    public bool SafeMode { get; }

    /// <summary>
    /// Wires the graph. With <paramref name="safeMode"/> the real writers are never constructed (<paramref name="realWriters"/>
    /// is not called) and the platform's foreground/input writers are wrapped in their logging fakes if they aren't already.
    /// </summary>
    public static WinShellServices Build(PlatformServices platform, WinShellOptions options, bool safeMode, TimeProvider time, ILog log,
        WinShellReaders readers, Func<WinShellWriters> realWriters)
    {
        var writers = safeMode ? WinShellWriters.Safe(log) : realWriters();
        if (safeMode) platform = platform.WithSafeWriters(log);
        var windows = new WindowList(platform.Catalog, platform.Foreground, time);
        var game = new GameModeService(readers.Game, time);
        var thumbnails = new ThumbnailService(readers.Thumbnails, options, game);
        var desktops = new VirtualDesktopService(readers.Desktops, platform.Input, time, log, simulated: safeMode);
        var display = new DisplayService(readers.Display, writers.Display, time, log);
        var ddc = new DdcService(readers.Ddc, writers.Ddc, display, time, log);
        var placement = new PlacementService(readers.Geometry, writers.Window, display, platform.Foreground, time, log);
        return new WinShellServices(platform, options, writers, windows, game, thumbnails, desktops, display, ddc, placement, safeMode);
    }

    /// <summary>Registers every service (and the Desktop interfaces, for W2) in <paramref name="registry"/>.</summary>
    public void Register(IServiceRegistry registry)
    {
        registry.Add(this);
        registry.Add(Platform);
        // Desktop registers its own interfaces (DesktopServices.GetOrCreate); only fill the gaps (the local adapters).
        if (!registry.TryGet<IWindowCatalog>(out _)) registry.Add(Platform.Catalog);
        if (!registry.TryGet<IForegroundService>(out _)) registry.Add(Platform.Foreground);
        if (!registry.TryGet<IInputSender>(out _)) registry.Add(Platform.Input);
        if (!registry.TryGet<IIconProvider>(out _)) registry.Add(Platform.Icons);
        registry.Add(Options);
        registry.Add(Windows);
        registry.Add(Game);
        registry.Add(Thumbnails);
        registry.Add(Desktops);
        registry.Add(Display);
        registry.Add(Ddc);
        registry.Add(Placement);
    }

    public async ValueTask DisposeAsync()
    {
        Thumbnails.Dispose();
        Display.Dispose(); // reverts any unconfirmed refresh-rate change
        await Ddc.DisposeAsync().ConfigureAwait(false);
        Game.Dispose();
        Windows.Dispose();
        Platform.Dispose();
    }
}
