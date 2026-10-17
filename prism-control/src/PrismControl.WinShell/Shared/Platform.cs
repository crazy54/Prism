using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.WinShell.Shared;

/// <summary>
/// The Desktop services this module uses (CONTRACT-platform.md §1), built once in <see cref="WinShellModule.Initialize"/>
/// and registered in the service registry (W2's features get them from there too). With PrismControl.Desktop referenced
/// (PRISM_DESKTOP) they are Desktop's process-wide <c>DesktopServices</c>; otherwise the temporary local adapters in
/// Shared/DesktopShim. In safe mode the two writers (foreground, input) are logging fakes; catalog, icons and reads stay real.
/// </summary>
public sealed class PlatformServices : IDisposable
{
    private readonly IDisposable[] _owned;

    public PlatformServices(IWindowCatalog catalog, IForegroundService foreground, IInputSender input, IIconProvider icons, bool writersAreSafe, params IDisposable[] owned)
    {
        Catalog = catalog;
        Foreground = foreground;
        Input = input;
        Icons = icons;
        WritersAreSafe = writersAreSafe;
        _owned = owned;
    }

    public IWindowCatalog Catalog { get; }
    public IForegroundService Foreground { get; }
    public IInputSender Input { get; }
    public IIconProvider Icons { get; }
    /// <summary>True when <see cref="Foreground"/> and <see cref="Input"/> are safe-mode fakes (they change nothing).</summary>
    public bool WritersAreSafe { get; }

    /// <summary>The module's platform: Desktop's shared instance for this plugin process (safe mode from the context).</summary>
    public static PlatformServices ForModule(IModuleContext context, ILog log)
    {
#if PRISM_DESKTOP
        // Desktop owns its lifetime (it disposes on ctx.ShutdownToken) and registers its interfaces in ctx.Services.
        var d = DesktopServices.GetOrCreate(context);
        return new PlatformServices(d.Windows, d.Foreground, d.Input, d.Icons, d.SafeMode);
#else
        return Standalone(context.SafeMode, log);
#endif
    }

    /// <summary>A private instance (tests, the thumbnail benchmark). Disposing it disposes everything it created.</summary>
    public static PlatformServices Standalone(bool safeMode, ILog log)
    {
#if PRISM_DESKTOP
        var d = DesktopServices.Create(safeMode, log);
        return new PlatformServices(d.Windows, d.Foreground, d.Input, d.Icons, d.SafeMode, d);
#else
        var shell = new StaPump();
        var catalog = new DesktopShim.LocalWindowCatalog(shell);
        IForegroundService fg = new DesktopShim.LocalForegroundService(catalog, log);
        IInputSender input = new DesktopShim.LocalInputSender();
        if (safeMode)
        {
            fg = new SafeModeForeground(fg, log);
            input = new SafeModeInput(input, log);
        }
        return new PlatformServices(catalog, fg, input, new DesktopShim.LocalIconProvider(shell), safeMode, catalog, shell);
#endif
    }

    /// <summary>The same platform with logging fakes in place of the two writers (reads delegate to the originals).</summary>
    public PlatformServices WithSafeWriters(ILog log) => WritersAreSafe ? this
        : new PlatformServices(Catalog, new SafeModeForeground(Foreground, log), new SafeModeInput(Input, log), Icons, true, this);

    public void Dispose()
    {
        foreach (var d in _owned)
        {
            try { d.Dispose(); }
            catch { /* shutting down */ }
        }
    }
}

/// <summary>Safe mode: never changes the foreground window. Reads (GetForeground, LastExternalForeground) stay real.</summary>
public sealed class SafeModeForeground(IForegroundService reads, ILog log) : IForegroundService
{
    public int Calls { get; private set; }
    public nint GetForeground() => reads.GetForeground();
    public nint LastExternalForeground => reads.LastExternalForeground;

    public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default)
    {
        Calls++;
        log.Info("[safe mode] would bring a window to the front");
        return Task.FromResult(ForegroundResult.SafeMode);
    }

    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default)
    {
        Calls++;
        log.Info("[safe mode] would grant the foreground to another process");
        return Task.FromResult(true);
    }
}

/// <summary>Safe mode: records chords instead of sending them (the in-memory model still updates).</summary>
public sealed class SafeModeInput(IInputSender reads, ILog log) : IInputSender
{
    private readonly List<string> _sent = [];

    public IReadOnlyList<string> Sent { get { lock (_sent) return [.. _sent]; } }

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => Record(string.Join("+", keys.Select(k => $"0x{(ushort)k:X2}")));
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => Record($"0x{(ushort)key:X2}");
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Record($"text({text.Length} chars)");
    public bool TargetIsElevated(nint hwnd) => reads.TargetIsElevated(hwnd);

    private Task<bool> Record(string what)
    {
        lock (_sent) _sent.Add(what);
        log.Info($"[safe mode] would send input {what}");
        return Task.FromResult(true);
    }
}

/// <summary>Raw virtual-key codes, cast so the code works with whatever names the Desktop enum uses.</summary>
public static class VkCodes
{
    public static VirtualKey Win => (VirtualKey)0x5B;
    public static VirtualKey Ctrl => (VirtualKey)0x11;
    public static VirtualKey Left => (VirtualKey)0x25;
    public static VirtualKey Right => (VirtualKey)0x27;
}
