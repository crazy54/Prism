using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Placement;

public enum PlaceOutcome
{
    Moved,
    Maximized,
    Restored,
    TopmostOn,
    TopmostOff,
    /// <summary>Safe mode: the move was logged, nothing changed.</summary>
    Simulated,
    NoWindow,
    /// <summary>The window runs as administrator: Windows blocks a non-admin app from moving it (UIPI).</summary>
    Elevated,
    /// <summary>A Direct3D exclusive-fullscreen app: moving it would break the game's display mode.</summary>
    Fullscreen,
    /// <summary>The app is not responding.</summary>
    Hung,
    /// <summary>The taskbar or the desktop, never a target.</summary>
    ShellSurface,
    Failed,
}

public sealed record PlaceResult(PlaceOutcome Outcome, string? App = null, bool Exact = true)
{
    public bool Blocked => Outcome is PlaceOutcome.Elevated or PlaceOutcome.Fullscreen or PlaceOutcome.Hung or PlaceOutcome.ShellSurface or PlaceOutcome.NoWindow;

    /// <summary>The reason alone, for keys (their big label then says "CAN'T MOVE").</summary>
    public string ShortMessage => Outcome switch
    {
        PlaceOutcome.Elevated => "ADMIN APP",
        PlaceOutcome.Fullscreen => "FULLSCREEN GAME",
        PlaceOutcome.Hung => "NOT RESPONDING",
        PlaceOutcome.NoWindow or PlaceOutcome.ShellSurface => "NO WINDOW",
        PlaceOutcome.Moved when !Exact => "APP LIMITS SIZE",
        PlaceOutcome.Simulated => "SAFE MODE",
        PlaceOutcome.Failed => "DIDN'T TAKE",
        _ => Message,
    };

    /// <summary>What a widget shows afterwards ("CAN'T MOVE: ADMIN APP" style).</summary>
    public string Message => Outcome switch
    {
        PlaceOutcome.Moved => Exact ? "MOVED" : "MOVED (APP LIMITS SIZE)",
        PlaceOutcome.Maximized => "MAXIMIZED",
        PlaceOutcome.Restored => "RESTORED",
        PlaceOutcome.TopmostOn => "ON TOP",
        PlaceOutcome.TopmostOff => "NOT ON TOP",
        PlaceOutcome.Simulated => "SAFE MODE",
        PlaceOutcome.NoWindow => "NO WINDOW",
        PlaceOutcome.Elevated => "CAN'T MOVE: ADMIN APP",
        PlaceOutcome.Fullscreen => "CAN'T MOVE: FULLSCREEN",
        PlaceOutcome.Hung => "APP NOT RESPONDING",
        PlaceOutcome.ShellSurface => "NO WINDOW",
        _ => "COULDN'T MOVE",
    };
}

/// <summary>
/// The deck as a miniature of the monitors: throws the last external foreground window (Desktop's
/// LastExternalForeground: by the time a key is pressed the "active window" is never the Stream Deck app) into zones, to
/// the next monitor, maximized/restored, or always-on-top. Geometry is per-monitor-v2 with DWM frame compensation; every
/// move is re-read and re-applied once when a DPI change resized the window on arrival. Elevated, hung and exclusive
/// fullscreen windows are refused up front with a clear message.
/// </summary>
public sealed class PlacementService
{
    public static readonly TimeSpan Settle = TimeSpan.FromMilliseconds(120);

    private readonly IWindowGeometryReader _reader;
    private readonly IWindowWriter _writer;
    private readonly DisplayService _display;
    private readonly IForegroundService _foreground;
    private readonly TimeProvider _time;
    private readonly ILog _log;

    public PlacementService(IWindowGeometryReader reader, IWindowWriter writer, DisplayService display, IForegroundService foreground, TimeProvider time, ILog log)
    {
        _reader = reader;
        _writer = writer;
        _display = display;
        _foreground = foreground;
        _time = time;
        _log = log;
    }

    public IWindowWriter Writer => _writer;
    private bool Simulated => _writer is IWindowOverlay;

    /// <summary>The window a placement key acts on.</summary>
    public nint Target => _foreground.LastExternalForeground;

    public WindowGeometry? TargetGeometry() => _reader.Read(Target);

    public bool? IsTopmost(nint hwnd)
    {
        if (_writer is IWindowOverlay o && o.TopmostOverride(hwnd) is { } on) return on;
        return _reader.Read(hwnd)?.Topmost;
    }

    public bool? IsMaximized(nint hwnd)
    {
        if (_writer is IWindowOverlay o && o.MaximizedOverride(hwnd) is { } on) return on;
        return _reader.Read(hwnd)?.Maximized;
    }

    private PlaceResult? Refuse(WindowGeometry? g, nint hwnd)
    {
        if (g is null) return new(PlaceOutcome.NoWindow);
        if (g.IsShellSurface) return new(PlaceOutcome.ShellSurface);
        if (g.Elevated) return new(PlaceOutcome.Elevated, g.ProcessName);
        if (g.Hung) return new(PlaceOutcome.Hung, g.ProcessName);
        if (_reader.IsExclusiveFullscreen(hwnd)) return new(PlaceOutcome.Fullscreen, g.ProcessName);
        return null;
    }

    private Task SettleAsync() => Simulated ? Task.CompletedTask : Task.Delay(Settle, _time);

    /// <summary>Throws the target window into <paramref name="zone"/> of <paramref name="monitor"/>.</summary>
    public async Task<PlaceResult> ThrowAsync(MonitorInfo monitor, ZoneId zone, nint? hwnd = null)
    {
        var h = hwnd ?? Target;
        var g = _reader.Read(h);
        if (Refuse(g, h) is { } refused) return refused;
        var monitors = _display.Monitors();
        var from = monitors.ElementAtOrDefault(PlacementMath.MonitorIndexOf(g!.Frame, monitors.Select(m => m.Bounds).ToList()));

        if (zone == ZoneId.Maximize)
        {
            if (from?.Id != monitor.Id)
            {
                if (g.Maximized || g.Minimized) { _writer.Restore(h); await SettleAsync().ConfigureAwait(false); g = _reader.Read(h) ?? g; }
                var mapped = PlacementMath.MapToWorkArea(g.Frame, from?.WorkArea ?? monitor.WorkArea, monitor.WorkArea);
                _writer.SetBounds(h, PlacementMath.WindowRectForFrame(mapped, g.WindowRect, g.Frame));
                await SettleAsync().ConfigureAwait(false);
            }
            _writer.Maximize(h);
            if (Simulated) return new(PlaceOutcome.Simulated, g.ProcessName);
            await SettleAsync().ConfigureAwait(false);
            var after = _reader.Read(h);
            return after is { Maximized: true } ? new(PlaceOutcome.Maximized, g.ProcessName) : new(PlaceOutcome.Failed, g.ProcessName);
        }

        if (g.Maximized || g.Minimized)
        {
            _writer.Restore(h);
            await SettleAsync().ConfigureAwait(false);
            g = _reader.Read(h) ?? g;
        }
        var wanted = Zones.Rect(zone, monitor.WorkArea);
        _writer.SetBounds(h, PlacementMath.WindowRectForFrame(wanted, g.WindowRect, g.Frame));
        if (Simulated) return new(PlaceOutcome.Simulated, g.ProcessName);
        await SettleAsync().ConfigureAwait(false);
        var g2 = _reader.Read(h);
        if (g2 is null) return new(PlaceOutcome.NoWindow);
        if (!PlacementMath.Near(g2.Frame, wanted))
        {
            // Arriving on a monitor with another DPI makes the window rescale itself (WM_DPICHANGED) and its invisible
            // borders change: measure again and apply once more.
            _writer.SetBounds(h, PlacementMath.WindowRectForFrame(wanted, g2.WindowRect, g2.Frame));
            await SettleAsync().ConfigureAwait(false);
            g2 = _reader.Read(h) ?? g2;
        }
        var exact = PlacementMath.Near(g2.Frame, wanted, 12);
        var moved = exact || Math.Abs(g2.Frame.Left - wanted.Left) <= 12 && Math.Abs(g2.Frame.Top - wanted.Top) <= 12;
        if (!moved) _log.Info($"placement: {g.ProcessName} ended at {g2.Frame}, wanted {wanted}");
        return new(moved ? PlaceOutcome.Moved : PlaceOutcome.Failed, g.ProcessName, exact);
    }

    /// <summary>Moves the target window to the next monitor (left to right, wrapping), keeping its relative size and position.</summary>
    public async Task<PlaceResult> NextMonitorAsync(nint? hwnd = null, int direction = 1)
    {
        var h = hwnd ?? Target;
        var g = _reader.Read(h);
        if (Refuse(g, h) is { } refused) return refused;
        var monitors = _display.Monitors();
        if (monitors.Count < 2) return new(PlaceOutcome.Failed, g!.ProcessName);
        var i = PlacementMath.MonitorIndexOf(g!.Frame, monitors.Select(m => m.Bounds).ToList());
        var from = monitors[Math.Max(0, i)];
        var to = monitors[((Math.Max(0, i) + direction) % monitors.Count + monitors.Count) % monitors.Count];
        var wasMax = g.Maximized;
        if (wasMax || g.Minimized) { _writer.Restore(h); await SettleAsync().ConfigureAwait(false); g = _reader.Read(h) ?? g; }
        var mapped = PlacementMath.MapToWorkArea(g.Frame, from.WorkArea, to.WorkArea);
        _writer.SetBounds(h, PlacementMath.WindowRectForFrame(mapped, g.WindowRect, g.Frame));
        await SettleAsync().ConfigureAwait(false);
        if (!Simulated && _reader.Read(h) is { } g2 && !PlacementMath.Near(g2.Frame, mapped))
        {
            _writer.SetBounds(h, PlacementMath.WindowRectForFrame(mapped, g2.WindowRect, g2.Frame));
            await SettleAsync().ConfigureAwait(false);
        }
        if (wasMax) _writer.Maximize(h);
        if (Simulated) return new(PlaceOutcome.Simulated, g.ProcessName);
        await SettleAsync().ConfigureAwait(false);
        var final = _reader.Read(h);
        var at = final is null ? -1 : PlacementMath.MonitorIndexOf(final.Frame, monitors.Select(m => m.Bounds).ToList());
        return at >= 0 && monitors[at].Id == to.Id ? new(PlaceOutcome.Moved, g.ProcessName) : new(PlaceOutcome.Failed, g.ProcessName);
    }

    /// <summary>Maximize ⇄ restore, verified by re-reading IsZoomed.</summary>
    public async Task<PlaceResult> ToggleMaximizeAsync(nint? hwnd = null)
    {
        var h = hwnd ?? Target;
        var g = _reader.Read(h);
        if (Refuse(g, h) is { } refused) return refused;
        var max = IsMaximized(h) ?? g!.Maximized;
        if (max) _writer.Restore(h); else _writer.Maximize(h);
        if (Simulated) return new(max ? PlaceOutcome.Restored : PlaceOutcome.Maximized, g!.ProcessName);
        await SettleAsync().ConfigureAwait(false);
        var now = _reader.Read(h);
        if (now is null) return new(PlaceOutcome.NoWindow);
        if (now.Maximized == max) return new(PlaceOutcome.Failed, g!.ProcessName);
        return new(now.Maximized ? PlaceOutcome.Maximized : PlaceOutcome.Restored, g!.ProcessName);
    }

    /// <summary>Always-on-top toggle; the result is the TRUE state read back from WS_EX_TOPMOST.</summary>
    public async Task<PlaceResult> ToggleTopmostAsync(nint? hwnd = null)
    {
        var h = hwnd ?? Target;
        var g = _reader.Read(h);
        if (g is null) return new(PlaceOutcome.NoWindow);
        if (g.IsShellSurface) return new(PlaceOutcome.ShellSurface);
        if (g.Elevated) return new(PlaceOutcome.Elevated, g.ProcessName);
        var on = IsTopmost(h) ?? g.Topmost;
        _writer.SetTopmost(h, !on);
        if (Simulated) return new(!on ? PlaceOutcome.TopmostOn : PlaceOutcome.TopmostOff, g.ProcessName);
        await SettleAsync().ConfigureAwait(false);
        var after = _reader.Read(h);
        if (after is null) return new(PlaceOutcome.NoWindow);
        if (after.Topmost == on) return new(PlaceOutcome.Failed, g.ProcessName);
        return new(after.Topmost ? PlaceOutcome.TopmostOn : PlaceOutcome.TopmostOff, g.ProcessName);
    }
}
