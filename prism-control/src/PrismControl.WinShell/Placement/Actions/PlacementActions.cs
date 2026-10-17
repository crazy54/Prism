using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Placement;

/// <summary>Shared plumbing for the placement keys: the target window's app name and running a move off the mailbox.</summary>
internal static class PlacementKit
{
    /// <summary>The friendly name of the window a placement action would move (null = none).</summary>
    public static string? TargetApp(PlacementService? placement, PlatformServices? platform)
    {
        if (placement is null) return null;
        var h = placement.Target;
        if (h == 0) return null;
        if (platform?.Catalog.Get(h) is { } w) return AppNames.For(w.ProcessName, w.ExePath);
        return placement.TargetGeometry() is { IsShellSurface: false } g ? WindowSlots.AppName(g.ProcessName) : null;
    }

    /// <summary>Runs <paramref name="move"/> on the thread pool and Posts the outcome back to the action.</summary>
    public static void Run(ActionBase owner, Func<Task<PlaceResult>> move, Action<PlaceResult> done)
    {
        _ = Task.Run(async () =>
        {
            PlaceResult r;
            try { r = await move().ConfigureAwait(false); }
            catch { r = new PlaceResult(PlaceOutcome.Failed); }
            owner.Post(() => done(r));
        });
    }

    public static (IReadOnlyList<PixelRect> Bounds, IReadOnlyList<PixelRect> Work) Rects(IReadOnlyList<MonitorInfo> monitors) =>
        (monitors.Select(m => m.Bounds).ToList(), monitors.Select(m => m.WorkArea).ToList());
}

public sealed class PlacerSettings
{
    /// <summary>The zones per monitor: "halves", "thirds", "quadrants" or "all".</summary>
    public string Zones { get; set; } = "halves";
}

/// <summary>
/// Flagship 4, the widget: the deck as a miniature of your monitors. Turn to pick a zone (every monitor's zones in a row,
/// left to right, so any monitor is reachable with turn + push), push (or touch) to throw the last window you used there.
/// Elevated, hung and exclusive-fullscreen windows are refused with a clear message.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.placer",
    Name = "Window Placer",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to pick a zone on any monitor; push to move your last window there.",
    Icon = "imgs/actions/windows/placer/icon",
    KeyImage = "imgs/actions/windows/placer/key",
    EncoderIcon = "imgs/actions/windows/placer/dial",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Pick a zone",
    TriggerPush = "Move the window there",
    TriggerTouch = "Move the window there")]
public sealed class PlacerDial : DialAction<PlacerSettings>
{
    private DisplayService? _display;
    private PlacementService? _placement;
    private PlatformServices? _platform;
    private Flash? _flash;
    private Action? _onDisplay;
    private int _index;
    private bool _moving;

    internal bool Moving => _moving;
    internal int Index => _index;
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        _display = Services.Find<DisplayService>();
        _placement = Services.Find<PlacementService>();
        _platform = Services.Find<PlatformServices>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2));
        _onDisplay = () => Post(Render);
        if (_display is not null) _display.Changed += _onDisplay;
        SetFeedbackLayout(Layouts.Canvas.Path);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(200));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_display is not null && _onDisplay is not null) _display.Changed -= _onDisplay;
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(PlacerSettings settings) { _index = 0; Render(); return Task.CompletedTask; }

    /// <summary>Every (monitor, zone) pair in turn order.</summary>
    internal IReadOnlyList<(int Monitor, ZoneId Zone)> Items(IReadOnlyList<MonitorInfo> monitors)
    {
        var zones = Zones.Set(Settings.Zones);
        return [.. Enumerable.Range(0, monitors.Count).SelectMany(m => zones.Select(z => (m, z)))];
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var items = Items(_display?.Monitors() ?? []);
        if (items.Count == 0 || e.Ticks == 0) return Task.CompletedTask;
        _index = Math.Clamp(_index + e.Ticks, 0, items.Count - 1);
        _flash?.Clear();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => Throw();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => Throw();

    private Task Throw()
    {
        if (_placement is not { } placement || _display is null || _moving) return Task.CompletedTask;
        var monitors = _display.Monitors();
        var items = Items(monitors);
        if (items.Count == 0) return Task.CompletedTask;
        var (mi, zone) = items[Math.Clamp(_index, 0, items.Count - 1)];
        var monitor = monitors[mi];
        _moving = true;
        PlacementKit.Run(this, () => placement.ThrowAsync(monitor, zone), r =>
        {
            _moving = false;
            _flash?.Show(r.Message, alert: r.Blocked || r.Outcome == PlaceOutcome.Failed);
            Render();
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var monitors = _display?.Monitors() ?? [];
        var items = Items(monitors);
        var (bounds, work) = PlacementKit.Rects(monitors);
        if (items.Count == 0)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, PlacementArt.PlacerDial(Theme, bounds, work, 0, ZoneId.Maximize, "", null, IsInteractive)));
            return;
        }
        var (mi, zone) = items[Math.Clamp(_index, 0, items.Count - 1)];
        var flash = _moving ? "MOVING…" : _flash?.Text;
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, PlacementArt.PlacerDial(Theme, bounds, work, mi, zone, monitors[mi].ShortName,
            PlacementKit.TargetApp(_placement, _platform), IsInteractive, flash, _flash?.IsAlert ?? false)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Window placer")
        .Select("zones", "Zones per monitor", [("halves", "Maximize, halves, center"), ("thirds", "Maximize, thirds"), ("quadrants", "Maximize, quarters"), ("all", "All zones")])
        .Info("Which window", "The last window you used (the deck never counts as one). Admin and fullscreen-game windows can't be moved.");
}

public sealed class ZoneSettings
{
    public string Monitor { get; set; } = "";
    public string Zone { get; set; } = "left-half";
}

/// <summary>Flagship 4, on a key: throws the last window you used into one zone of one monitor (the key draws that zone).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.zone",
    Name = "Window Zone",
    Controllers = Controllers.Keypad,
    Tooltip = "Moves your last window into a zone of a monitor (half, third, quarter, maximize).",
    Icon = "imgs/actions/windows/zone/icon",
    KeyImage = "imgs/actions/windows/zone/key")]
public sealed class ZoneKey : KeyAction<ZoneSettings>
{
    private DisplayService? _display;
    private PlacementService? _placement;
    private PlatformServices? _platform;
    private Flash? _flash;
    private bool _blocked;
    private bool _moving;

    internal bool Moving => _moving;
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _display = Services.Find<DisplayService>();
        _placement = Services.Find<PlacementService>();
        _platform = Services.Find<PlatformServices>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2));
        StartRenderLoop(Render, TimeSpan.FromSeconds(2));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { _flash?.Dispose(); return Task.CompletedTask; }

    protected override Task OnSettingsChangedAsync(ZoneSettings settings) { Render(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_placement is not { } placement || _display?.Find(Settings.Monitor) is not { } monitor || _moving)
        {
            if (_display?.Find(Settings.Monitor) is null) _flash?.Show("NO DISPLAY", alert: true);
            return Task.CompletedTask;
        }
        var zone = Zones.Parse(Settings.Zone);
        _moving = true;
        PlacementKit.Run(this, () => placement.ThrowAsync(monitor, zone), r =>
        {
            _moving = false;
            _blocked = r.Blocked;
            if (r.Outcome is not (PlaceOutcome.Moved or PlaceOutcome.Maximized) || !r.Exact) _flash?.Show(r.ShortMessage, alert: r.Blocked || r.Outcome == PlaceOutcome.Failed);
            Render();
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var monitors = _display?.Monitors() ?? [];
        var m = _display?.Find(Settings.Monitor);
        var (bounds, work) = PlacementKit.Rects(monitors);
        var idx = m is null ? 0 : monitors.ToList().FindIndex(x => x.Id == m.Id);
        var blocked = _blocked && _flash?.IsAlert == true;
        SetImage(PlacementArt.ZoneKey(Theme, bounds, work, Math.Max(0, idx), Zones.Parse(Settings.Zone), m?.ShortName ?? "NO DISPLAY",
            _moving ? "MOVING…" : _flash?.Text, _flash?.IsAlert ?? false, PlacementKit.TargetApp(_placement, _platform), blocked));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Window zone")
        .Select("monitor", "Monitor", optionsFrom: "monitors.list")
        .Select("zone", "Zone", Zones.All.Select(z => (Zones.Key(z), Zones.Name(z))))
        .Info("Which window", "The last window you used. Admin and fullscreen-game windows can't be moved.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult<object?>(type == "monitors.list" ? MonitorPicker.Options(_display, includeAll: false) : null);
}

public sealed class NextMonitorSettings
{
    /// <summary>"next" (left to right) or "previous".</summary>
    public string Direction { get; set; } = "next";
}

/// <summary>Moves the last window you used to the next monitor, keeping its relative size and position (and maximized state).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.next-monitor",
    Name = "Next Monitor",
    Controllers = Controllers.Keypad,
    Tooltip = "Moves your last window to the next monitor.",
    Icon = "imgs/actions/windows/next-monitor/icon",
    KeyImage = "imgs/actions/windows/next-monitor/key")]
public sealed class NextMonitorKey : KeyAction<NextMonitorSettings>
{
    private PlacementService? _placement;
    private PlatformServices? _platform;
    private Flash? _flash;
    private bool _blocked;
    private bool _moving;

    internal bool Moving => _moving;
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _placement = Services.Find<PlacementService>();
        _platform = Services.Find<PlatformServices>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2));
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { _flash?.Dispose(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_placement is not { } placement || _moving) return Task.CompletedTask;
        _moving = true;
        var dir = string.Equals(Settings.Direction, "previous", StringComparison.OrdinalIgnoreCase) ? -1 : 1;
        PlacementKit.Run(this, () => placement.NextMonitorAsync(direction: dir), r =>
        {
            _moving = false;
            _blocked = r.Blocked;
            if (r.Outcome != PlaceOutcome.Moved) _flash?.Show(r.ShortMessage, alert: r.Blocked || r.Outcome == PlaceOutcome.Failed);
            Render();
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var app = PlacementKit.TargetApp(_placement, _platform);
        var label = string.Equals(Settings.Direction, "previous", StringComparison.OrdinalIgnoreCase) ? "PREV SCREEN" : "NEXT SCREEN";
        if (_blocked && _flash?.IsAlert == true) label = "CAN'T MOVE";
        var d = WinArt.GlyphKey(Theme, WinGlyphs.NextMonitor, label, false, _moving ? "MOVING…" : _flash?.Text ?? app ?? "NO WINDOW");
        if (_flash?.IsAlert == true) WinArt.AlertMarks(d, Theme);
        SetImage(d);
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Next monitor")
        .Select("direction", "Direction", [("next", "Next (left to right)"), ("previous", "Previous")]);
}

/// <summary>Maximize ⇄ restore the last window you used; the key shows its TRUE state (IsZoomed), re-read every second.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.maximize",
    Name = "Maximize / Restore",
    Controllers = Controllers.Keypad,
    Tooltip = "Maximizes or restores your last window.",
    Icon = "imgs/actions/windows/maximize/icon",
    KeyImage = "imgs/actions/windows/maximize/key")]
public sealed class MaximizeKey : KeyAction
{
    private PlacementService? _placement;
    private PlatformServices? _platform;
    private Flash? _flash;
    private bool _blocked;
    private bool _busy;

    internal bool Busy => _busy;
    internal bool LastOn { get; private set; }
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _placement = Services.Find<PlacementService>();
        _platform = Services.Find<PlatformServices>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2));
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { _flash?.Dispose(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_placement is not { } placement || _busy) return Task.CompletedTask;
        _busy = true;
        PlacementKit.Run(this, () => placement.ToggleMaximizeAsync(), r =>
        {
            _busy = false;
            _blocked = r.Blocked;
            if (r.Outcome is not (PlaceOutcome.Maximized or PlaceOutcome.Restored)) _flash?.Show(r.ShortMessage, alert: r.Blocked || r.Outcome == PlaceOutcome.Failed);
            Render();
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var h = _placement?.Target ?? 0;
        var max = h != 0 && _placement!.IsMaximized(h) == true;
        LastOn = max;
        var app = PlacementKit.TargetApp(_placement, _platform);
        var label = app is null ? "NO WINDOW" : _blocked && _flash?.IsAlert == true ? "CAN'T MOVE" : max ? "MAXIMIZED" : "RESTORED";
        var d = WinArt.GlyphKey(Theme, WinGlyphs.Maximize, label, max, _flash?.Text ?? app ?? "");
        if (_flash?.IsAlert == true) WinArt.AlertMarks(d, Theme);
        SetImage(d);
    }
}

/// <summary>
/// Always-on-top for the last window you used, with the TRUE state (WS_EX_TOPMOST read back after every change). Admin
/// windows can't be changed from here and say so. PowerToys' AlwaysOnTop draws its own border; this key uses plain
/// SetWindowPos(HWND_TOPMOST), so both agree on the state.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.topmost",
    Name = "Always on Top",
    Controllers = Controllers.Keypad,
    Tooltip = "Pins your last window above the others (or unpins it).",
    Icon = "imgs/actions/windows/topmost/icon",
    KeyImage = "imgs/actions/windows/topmost/key")]
public sealed class TopmostKey : KeyAction
{
    private PlacementService? _placement;
    private PlatformServices? _platform;
    private Flash? _flash;
    private bool _blocked;
    private bool _busy;

    internal bool Busy => _busy;
    internal bool LastOn { get; private set; }
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _placement = Services.Find<PlacementService>();
        _platform = Services.Find<PlatformServices>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2));
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { _flash?.Dispose(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_placement is not { } placement || _busy) return Task.CompletedTask;
        _busy = true;
        PlacementKit.Run(this, () => placement.ToggleTopmostAsync(), r =>
        {
            _busy = false;
            _blocked = r.Blocked;
            if (r.Outcome is not (PlaceOutcome.TopmostOn or PlaceOutcome.TopmostOff)) _flash?.Show(r.ShortMessage, alert: r.Blocked || r.Outcome == PlaceOutcome.Failed);
            Render();
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var h = _placement?.Target ?? 0;
        var on = h != 0 && _placement!.IsTopmost(h) == true;
        LastOn = on;
        var app = PlacementKit.TargetApp(_placement, _platform);
        var label = app is null ? "NO WINDOW" : _blocked && _flash?.IsAlert == true ? "CAN'T CHANGE" : on ? "ON TOP" : "NOT ON TOP";
        var d = WinArt.GlyphKey(Theme, WinGlyphs.Topmost, label, on, _flash?.Text ?? app ?? "");
        if (_flash?.IsAlert == true) WinArt.AlertMarks(d, Theme);
        SetImage(d);
    }
}
