#if PRISM_DESKTOP
using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Desktop;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.SmartProvider;

/// <summary>
/// W1's services as Smart Deck verbs and readouts (ids as the windows-shell pack uses them). Everything goes through the
/// same services the 13 actions use, on the window the Smart context matched (<see cref="VerbInvocation.TargetWindow"/>,
/// else the last external foreground window):
/// <list type="table">
/// <item><term>window switcher</term><description><c>windows.window.focus {mode, slot, app}</c>; dial cursor <c>windows.browser.next|prev|focus</c> + <c>windows.browser.preview</c></description></item>
/// <item><term>window toggles</term><description><c>windows.window.maximize|topmost</c> + true state <c>windows.window.maximized|topmost</c></description></item>
/// <item><term>placer</term><description><c>windows.placer.zone {zone, monitor}</c>, <c>windows.placer.nextMonitor {direction}</c>, dial cursor <c>windows.placer.next|prev|throw</c> + <c>windows.placer.zone</c></description></item>
/// <item><term>desktops</term><description><c>windows.desktops.next|prev|goto {index}</c> + <c>windows.desktops.current</c></description></item>
/// <item><term>HDR, refresh</term><description><c>windows.hdr.toggle {monitor}</c> + <c>windows.hdr.state</c>; <c>windows.display.refreshToggle {monitor, rateA, rateB}</c> (press again within 15 s to keep, else it reverts) + <c>windows.display.refreshRate</c></description></item>
/// <item><term>monitors (DDC/CI)</term><description><c>windows.monitor.next|brightnessUp|brightnessDown {step}</c> + <c>windows.monitor.brightness</c>, <c>windows.monitor.current</c></description></item>
/// <item><term>game mode</term><description><c>windows.gameMode.settings</c> + <c>windows.gameMode.active</c>, <c>windows.gameMode.state</c></description></item>
/// </list>
/// Readouts are cheap: cached service state, at most a background DDC/CI read is started. Titles are streamer-hide and
/// never logged.
/// </summary>
public sealed class W1VerbPart : IWindowsVerbPart, IDisposable
{
    public static readonly TimeSpan DesktopStepGap = TimeSpan.FromMilliseconds(300);
    public static readonly TimeSpan BrowserFollowAfter = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan StateCache = TimeSpan.FromMilliseconds(500);

    private readonly WinShellServices _s;
    private readonly TimeProvider _time;
    private readonly Action<string> _openUrl;
    private readonly object _gate = new();
    private readonly Action _changed;
    private readonly Action<string> _ddcChanged;
    private int _browser;            // index into the most-recent window list
    private long _browserAt;         // last browse (0 = follow the window in front)
    private int _placer;             // index into every monitor's zones
    private int _monitor;            // index into the monitors (brightness)
    private long _lastDesktopStep;
    private (nint Hwnd, long At, bool? Max, bool? Top) _state;

    public W1VerbPart(WinShellServices services, TimeProvider time, Action<string> openUrl)
    {
        _s = services;
        _time = time;
        _openUrl = openUrl;
        _changed = () => Changed?.Invoke();
        _ddcChanged = _ => Changed?.Invoke();
        _s.Windows.Changed += _changed;
        _s.Desktops.Changed += _changed;
        _s.Display.Changed += _changed;
        _s.Game.Changed += _changed;
        _s.Options.Changed += _changed;
        _s.Ddc.Changed += _ddcChanged;
    }

    public event Action? Changed;

    private static VerbDescriptor V(string id, string label, string glyph, string category, int priority, string? longLabel = null, string? state = null) =>
        new() { Id = id, Label = label, Glyph = glyph, Category = category, Priority = priority, LongLabel = longLabel, StateReadout = state };

    public IReadOnlyList<VerbDescriptor> Verbs { get; } =
    [
        V("windows.window.focus", "WINDOW", "window", "nav", 70, "Bring a window to the front (args: mode zorder|recent|pinned, slot 1–20, app)"),
        V("windows.window.maximize", "MAXIMIZE", "maximize", "toggle", 60, "Maximize or restore the window", "windows.window.maximized"),
        V("windows.window.topmost", "ON TOP", "pin", "toggle", 55, "Keep the window on top", "windows.window.topmost"),
        V("windows.browser.next", "NEXT WIN", "window", "nav", 40, "Window browser: next window"),
        V("windows.browser.prev", "PREV WIN", "window", "nav", 40, "Window browser: previous window"),
        V("windows.browser.focus", "FOCUS", "window", "nav", 45, "Window browser: bring the selected window to the front"),
        V("windows.desktops.next", "NEXT DESK", "pages", "nav", 50, "Next virtual desktop (wraps)"),
        V("windows.desktops.prev", "PREV DESK", "pages", "nav", 50, "Previous virtual desktop (wraps)"),
        V("windows.desktops.goto", "DESKTOP", "pages", "nav", 45, "Go to virtual desktop N (args: index 1-based)"),
        V("windows.placer.zone", "SNAP", "layout", "tool", 55, "Throw the window into a zone (args: zone leftHalf…, monitor current|primary|id)"),
        V("windows.placer.nextMonitor", "NEXT SCREEN", "layout", "tool", 50, "Move the window to the next monitor (args: direction next|previous)"),
        V("windows.placer.next", "NEXT ZONE", "layout", "tool", 40, "Placer: next zone"),
        V("windows.placer.prev", "PREV ZONE", "layout", "tool", 40, "Placer: previous zone"),
        V("windows.placer.throw", "THROW", "layout", "tool", 45, "Placer: throw the window into the selected zone"),
        V("windows.hdr.toggle", "HDR", "hdr", "toggle", 50, "HDR on/off (args: monitor)", "windows.hdr.state"),
        V("windows.display.refreshToggle", "REFRESH HZ", "refresh", "toggle", 45, "Switch between two refresh rates; press again within 15 s to keep (args: monitor, rateA, rateB)"),
        V("windows.monitor.next", "NEXT MON", "monitor", "nav", 40, "Brightness dial: next monitor"),
        V("windows.monitor.brightnessUp", "BRIGHTER", "bulb", "tool", 45, "Monitor brightness up over DDC/CI (args: step)"),
        V("windows.monitor.brightnessDown", "DIMMER", "bulb", "tool", 45, "Monitor brightness down over DDC/CI (args: step)"),
        V("windows.gameMode.settings", "GAME MODE", "gamepad", "system", 30, "Open Windows' Game Mode settings"),
    ];

    private static ReadoutDescriptor R(string id, string label, string widget, string privacy = "public", string? unit = null, string? format = null, double? min = null, double? max = null) =>
        new() { Id = id, Label = label, Widget = widget, Privacy = privacy, Unit = unit, Format = format, RangeMin = min, RangeMax = max };

    public IReadOnlyList<ReadoutDescriptor> Readouts { get; } =
    [
        R("windows.window.maximized", "MAX", "state"),
        R("windows.window.topmost", "ON TOP", "state"),
        R("windows.browser.preview", "WINDOW", "text", "streamer-hide"),
        R("windows.desktops.current", "DESKTOP", "text", "streamer-hide", format: "{index}/{count}"),
        R("windows.placer.zone", "ZONE", "text"),
        R("windows.hdr.state", "HDR", "state"),
        R("windows.display.refreshRate", "HZ", "number", unit: "Hz", format: "{value} Hz"),
        R("windows.monitor.brightness", "BRIGHT", "gauge", unit: "%", format: "{value} %", min: 0, max: 100),
        R("windows.monitor.current", "MONITOR", "text"),
        R("windows.gameMode.active", "GAME", "state"),
        R("windows.gameMode.state", "GAME", "text"),
    ];

    private bool Mine(string id) => Verbs.Any(v => v.Id == id);

    // ================================================================== status (cheap)

    public VerbStatus? GetStatus(string verbId)
    {
        if (!Mine(verbId)) return null;
        switch (verbId)
        {
            case "windows.hdr.toggle":
                return _s.Display.Monitors().Any(m => m.Hdr.Supported) ? VerbStatus.Ready : new VerbStatus(VerbAvailability.Unavailable, "No HDR display.");
            case "windows.desktops.next" or "windows.desktops.prev" or "windows.desktops.goto":
                return _s.Desktops.Current().Count > 1 ? VerbStatus.Ready : new VerbStatus(VerbAvailability.Unavailable, "Only one virtual desktop.");
            case "windows.placer.nextMonitor" or "windows.monitor.next":
                return _s.Display.Monitors().Count > 1 ? VerbStatus.Ready : new VerbStatus(VerbAvailability.Unavailable, "Only one monitor.");
            default:
                return VerbStatus.Ready;
        }
    }

    // ================================================================== readouts (cheap)

    public bool TryReadReadout(string readoutId, out ReadoutValue value)
    {
        value = ReadoutValue.Unknown;
        if (!readoutId.StartsWith("windows.", StringComparison.Ordinal) || Readouts.All(r => r.Id != readoutId)) return false;
        var now = _time.GetUtcNow();
        switch (readoutId)
        {
            case "windows.window.maximized" or "windows.window.topmost":
            {
                var (max, top) = WindowState(_s.Placement.Target);
                var on = readoutId.EndsWith("maximized", StringComparison.Ordinal) ? max : top;
                if (on is not null) value = new ReadoutValue { State = on, At = now };
                return true;
            }
            case "windows.browser.preview":
            {
                var w = BrowserWindow();
                if (w is not null)
                {
                    var app = WindowSlots.AppName(w.ProcessName);
                    value = new ReadoutValue { Text = _s.Options.StreamerSafe || string.IsNullOrWhiteSpace(w.Title) ? app : $"{app} · {w.Title}", At = now };
                }
                return true;
            }
            case "windows.desktops.current":
            {
                var d = _s.Desktops.Current();
                if (d.Current >= 0)
                    value = new ReadoutValue
                    {
                        Number = d.Current + 1, Text = $"{d.Current + 1}/{d.Count}", At = now,
                        Fields = new Dictionary<string, string>
                        {
                            ["index"] = (d.Current + 1).ToString(CultureInfo.InvariantCulture), ["count"] = d.Count.ToString(CultureInfo.InvariantCulture), ["name"] = d.NameOf(d.Current),
                        },
                    };
                return true;
            }
            case "windows.placer.zone":
            {
                var z = PlacerZones();
                if (z.Count > 0)
                {
                    var (m, zone) = z[Math.Clamp(_placer, 0, z.Count - 1)];
                    value = new ReadoutValue { Text = $"{m.ShortName} · {Zones.Name(zone)}", At = now, Fields = new Dictionary<string, string> { ["monitor"] = m.ShortName, ["zone"] = Zones.Key(zone) } };
                }
                return true;
            }
            case "windows.hdr.state":
            {
                var p = Primary();
                if (p is { Hdr.Supported: true }) value = new ReadoutValue { State = p.Hdr.On, At = now };
                return true;
            }
            case "windows.display.refreshRate":
            {
                if (Primary()?.Mode is { } mode) value = new ReadoutValue { Number = mode.Hz, At = now };
                return true;
            }
            case "windows.monitor.brightness":
            {
                if (BrightnessMonitor() is { } m && _s.Ddc.Peek(m.Id, Vcp.Brightness) is { Status: not DdcStatus.Unsupported } v && v.Max > 0)
                    value = new ReadoutValue
                    {
                        Number = Math.Round(v.Fraction * 100), At = now,
                        Confidence = v.Status == DdcStatus.Ok ? ReadoutConfidence.Observed : ReadoutConfidence.Inferred,
                    };
                return true;
            }
            case "windows.monitor.current":
            {
                if (BrightnessMonitor() is { } m) value = new ReadoutValue { Text = m.ShortName, At = now };
                return true;
            }
            case "windows.gameMode.active":
                value = new ReadoutValue { State = _s.Game.Current().IsGaming, At = now };
                return true;
            case "windows.gameMode.state":
                value = new ReadoutValue { Text = _s.Game.Current().Describe(), At = now };
                return true;
        }
        return false;
    }

    private (bool? Max, bool? Top) WindowState(nint hwnd)
    {
        lock (_gate)
            if (_state.Hwnd == hwnd && _state.At != 0 && _time.GetElapsedTime(_state.At) < StateCache) return (_state.Max, _state.Top);
        var max = _s.Placement.IsMaximized(hwnd);
        var top = _s.Placement.IsTopmost(hwnd);
        lock (_gate) _state = (hwnd, _time.GetTimestamp(), max, top);
        return (max, top);
    }

    private void ForgetWindowState() { lock (_gate) _state = default; }

    private MonitorInfo? Primary() => _s.Display.Find(null);

    // ================================================================== invoke

    public Task<VerbResult>? InvokeAsync(VerbInvocation i, CancellationToken ct)
    {
        if (!Mine(i.VerbId)) return null;
        if (!i.DirectGesture) return Task.FromResult(VerbResult.Failed("Windows verbs run only from a press on the deck."));
        var target = i.TargetWindow != 0 ? i.TargetWindow : _s.Placement.Target;
        var steps = Math.Max(1, Math.Abs(i.Ticks));
        return i.VerbId switch
        {
            "windows.window.focus" => FocusSlotAsync(i.Args),
            "windows.window.maximize" => PlaceAsync(_s.Placement.ToggleMaximizeAsync(target)),
            "windows.window.topmost" => PlaceAsync(_s.Placement.ToggleTopmostAsync(target)),
            "windows.browser.next" => Done(() => MoveBrowser(+steps)),
            "windows.browser.prev" => Done(() => MoveBrowser(-steps)),
            "windows.browser.focus" => FocusBrowserAsync(),
            "windows.desktops.next" => DesktopAsync(+1, null),
            "windows.desktops.prev" => DesktopAsync(-1, null),
            "windows.desktops.goto" => DesktopAsync(0, Int(i.Args?["index"])),
            "windows.placer.zone" => ZoneAsync(i.Args, target),
            "windows.placer.nextMonitor" => PlaceAsync(_s.Placement.NextMonitorAsync(target, Str(i.Args?["direction"]) is "previous" or "prev" ? -1 : 1)),
            "windows.placer.next" => Done(() => MovePlacer(+steps)),
            "windows.placer.prev" => Done(() => MovePlacer(-steps)),
            "windows.placer.throw" => ThrowAsync(target),
            "windows.hdr.toggle" => HdrAsync(Str(i.Args?["monitor"])),
            "windows.display.refreshToggle" => RefreshAsync(Str(i.Args?["monitor"]), Int(i.Args?["rateA"]) ?? 0, Int(i.Args?["rateB"]) ?? 0),
            "windows.monitor.next" => Done(() => MoveMonitor(+1)),
            "windows.monitor.brightnessUp" => Task.FromResult(Brightness(+1, steps, Int(i.Args?["step"]) ?? 5)),
            "windows.monitor.brightnessDown" => Task.FromResult(Brightness(-1, steps, Int(i.Args?["step"]) ?? 5)),
            "windows.gameMode.settings" => Done(() => _openUrl("ms-settings:gaming-gamemode")),
            _ => Task.FromResult(VerbResult.Failed("unknown verb")),
        };
    }

    private Task<VerbResult> Done(Action a)
    {
        a();
        Changed?.Invoke();
        return Task.FromResult(VerbResult.Done);
    }

    private static VerbResult Focus(ForegroundResult r) => r switch
    {
        ForegroundResult.Focused or ForegroundResult.Restored or ForegroundResult.AlreadyFocused or ForegroundResult.SafeMode => VerbResult.Done,
        ForegroundResult.Elevated => VerbResult.Failed("ADMIN APP"),
        ForegroundResult.NoWindow => VerbResult.Failed("CLOSED"),
        _ => VerbResult.Failed("CAN'T FOCUS"),
    };

    private async Task<VerbResult> FocusSlotAsync(JsonObject? args)
    {
        var mode = WindowSlots.ParseMode(Str(args?["mode"]));
        var slot = Math.Clamp(Int(args?["slot"]) ?? 1, 1, 20);
        var w = WindowSlots.Pick(mode, slot, Str(args?["app"]), _s.Windows.Current(), _s.Windows.MostRecent());
        if (w is null) return VerbResult.Failed(mode == SlotMode.Pinned ? "NOT RUNNING" : "NO WINDOW");
        var r = await _s.Platform.Foreground.BringToFrontAsync(w.Hwnd).ConfigureAwait(false);
        _s.Windows.Invalidate();
        ForgetWindowState();
        return Focus(r);
    }

    private async Task<VerbResult> PlaceAsync(Task<PlaceResult> t)
    {
        var r = await t.ConfigureAwait(false);
        ForgetWindowState();
        Changed?.Invoke();
        return r.Outcome switch
        {
            PlaceOutcome.Moved or PlaceOutcome.Maximized or PlaceOutcome.Restored or PlaceOutcome.TopmostOn or PlaceOutcome.TopmostOff or PlaceOutcome.Simulated => VerbResult.Done,
            _ => VerbResult.Failed(r.Blocked ? "CAN'T MOVE: " + r.ShortMessage : r.ShortMessage),
        };
    }

    // ---- window browser (dial cursor)

    private IReadOnlyList<WindowInfo> BrowserList() => _s.Windows.MostRecent();

    private WindowInfo? BrowserWindow()
    {
        var list = BrowserList();
        if (list.Count == 0) return null;
        lock (_gate)
        {
            if (_browserAt == 0 || _time.GetElapsedTime(_browserAt) > BrowserFollowAfter)
            {
                // Idle: the selection follows the window in front (the list's first, most recent).
                var fg = _s.Platform.Foreground.LastExternalForeground;
                var at = list.Select((w, idx) => (w, idx)).FirstOrDefault(x => x.w.Hwnd == fg).idx;
                _browser = Math.Max(0, at);
                _browserAt = 0;
            }
            return list[Math.Clamp(_browser, 0, list.Count - 1)];
        }
    }

    private void MoveBrowser(int delta)
    {
        var list = BrowserList();
        _ = BrowserWindow();
        lock (_gate)
        {
            _browser = Math.Clamp(_browser + delta, 0, Math.Max(0, list.Count - 1));
            _browserAt = _time.GetTimestamp();
        }
    }

    private async Task<VerbResult> FocusBrowserAsync()
    {
        var w = BrowserWindow();
        if (w is null) return VerbResult.Failed("NO WINDOW");
        var r = await _s.Platform.Foreground.BringToFrontAsync(w.Hwnd).ConfigureAwait(false);
        lock (_gate) _browserAt = 0;
        _s.Windows.Invalidate();
        ForgetWindowState();
        Changed?.Invoke();
        return Focus(r);
    }

    // ---- desktops

    private async Task<VerbResult> DesktopAsync(int delta, int? index)
    {
        lock (_gate)
        {
            // One step per turn event, ≥ 300 ms apart (a fast spin can't skip desktops; W1's dial rule).
            if (_lastDesktopStep != 0 && _time.GetElapsedTime(_lastDesktopStep) < DesktopStepGap) return VerbResult.Done;
            _lastDesktopStep = _time.GetTimestamp();
        }
        DesktopSwitchOutcome r;
        try
        {
            if (index is { } n) r = await _s.Desktops.GoToAsync(n - 1).ConfigureAwait(false);
            else r = await _s.Desktops.StepAsync(delta).ConfigureAwait(false);
        }
        finally { lock (_gate) _lastDesktopStep = _time.GetTimestamp(); }   // the gap counts from the end of a switch
        return r switch
        {
            DesktopSwitchOutcome.Switched or DesktopSwitchOutcome.AlreadyThere or DesktopSwitchOutcome.Simulated => VerbResult.Done,
            DesktopSwitchOutcome.NoSuchDesktop => VerbResult.Failed("NO SUCH DESKTOP"),
            DesktopSwitchOutcome.NotConfirmed => VerbResult.Failed("NOT CONFIRMED"),
            _ => VerbResult.Failed("DIDN'T SWITCH"),
        };
    }

    // ---- placer

    /// <summary>"leftHalf", "left-half", "LeftHalf" → the zone (null when unknown: never a silent default).</summary>
    public static ZoneId? ParseZone(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var kebab = string.Concat(s.Trim().Select((c, i) => char.IsUpper(c) ? (i > 0 ? "-" : "") + char.ToLowerInvariant(c) : c.ToString()));
        foreach (var z in Zones.All)
            if (Zones.Key(z) == kebab || string.Equals(Zones.Key(z).Replace("-", "", StringComparison.Ordinal), s.Trim(), StringComparison.OrdinalIgnoreCase)) return z;
        return null;
    }

    private MonitorInfo? MonitorFor(string? which, nint target)
    {
        var monitors = _s.Display.Monitors();
        if (which is null or "" or "current")
        {
            var w = _s.Windows.Get(target);
            if (w is not null)
                return monitors.FirstOrDefault(m => m.Handle == w.Monitor)
                    ?? monitors.ElementAtOrDefault(PlacementMath.MonitorIndexOf(new PixelRect(w.Bounds.Left, w.Bounds.Top, w.Bounds.Right, w.Bounds.Bottom), [.. monitors.Select(m => m.Bounds)]));
            return Primary();
        }
        return _s.Display.Find(which == "primary" ? null : which);
    }

    private async Task<VerbResult> ZoneAsync(JsonObject? args, nint target)
    {
        if (ParseZone(Str(args?["zone"]) ?? "leftHalf") is not { } zone) return VerbResult.Failed("UNKNOWN ZONE");
        if (MonitorFor(Str(args?["monitor"]), target) is not { } m) return VerbResult.Failed("NO DISPLAY");
        return await PlaceAsync(_s.Placement.ThrowAsync(m, zone, target)).ConfigureAwait(false);
    }

    private List<(MonitorInfo Monitor, ZoneId Zone)> PlacerZones() =>
        [.. _s.Display.Monitors().OrderBy(m => m.Bounds.Left).SelectMany(m => Zones.Set("halves").Select(z => (m, z)))];

    private void MovePlacer(int delta)
    {
        var n = PlacerZones().Count;
        lock (_gate) _placer = n == 0 ? 0 : Math.Clamp(_placer + delta, 0, n - 1);
    }

    private async Task<VerbResult> ThrowAsync(nint target)
    {
        var z = PlacerZones();
        if (z.Count == 0) return VerbResult.Failed("NO DISPLAY");
        var (m, zone) = z[Math.Clamp(_placer, 0, z.Count - 1)];
        return await PlaceAsync(_s.Placement.ThrowAsync(m, zone, target)).ConfigureAwait(false);
    }

    // ---- HDR, refresh

    private async Task<VerbResult> HdrAsync(string? monitor)
    {
        var r = await _s.Display.ToggleHdrAsync(monitor is "primary" ? null : monitor).ConfigureAwait(false);
        Changed?.Invoke();
        return r switch
        {
            HdrOutcome.TurnedOn or HdrOutcome.TurnedOff => VerbResult.Done,
            HdrOutcome.Unsupported => VerbResult.Failed("NO HDR"),
            HdrOutcome.NoMonitor => VerbResult.Failed("NO DISPLAY"),
            HdrOutcome.Busy => VerbResult.Failed("RESYNCING"),
            HdrOutcome.DidNotTake => VerbResult.Failed("DIDN'T TAKE"),
            _ => VerbResult.Failed("FAILED"),
        };
    }

    /// <summary>W1's RefreshKey presets: A = rateA or the highest at this resolution; B = rateB or 120 (else the next lower).</summary>
    public static (int A, int B)? Presets(IReadOnlyList<DisplayMode> modes, DisplayMode current, int rateA, int rateB)
    {
        var rates = DisplayService.RatesAtResolution(modes, current);
        if (rates.Count == 0) return null;
        var a = rateA > 0 ? rateA : rates[0];
        var b = rateB > 0 ? rateB : rates.Contains(120) && a != 120 ? 120 : rates.FirstOrDefault(r => r < a, rates.Last());
        return (a, b);
    }

    private async Task<VerbResult> RefreshAsync(string? monitor, int rateA, int rateB)
    {
        var m = _s.Display.Find(monitor is "primary" ? null : monitor);
        if (m is null) return VerbResult.Failed("NO DISPLAY");
        // A change is waiting for its KEEP: this press keeps it (the same rule as the Refresh Rate key).
        if (_s.Display.Pending(m.Id) is not null)
        {
            var kept = await _s.Display.KeepAsync(m.Id).ConfigureAwait(false);
            Changed?.Invoke();
            return kept == false ? VerbResult.Failed("NOT SAVED") : VerbResult.Done;
        }
        if (m.Mode is not { } cur) return VerbResult.Failed("FAILED");
        var modes = await _s.Display.ModesAsync(m).ConfigureAwait(false);
        if (Presets(modes, cur, rateA, rateB) is not { } p) return VerbResult.Failed("NO MODES");
        var target = cur.Hz == p.A ? p.B : p.A;
        var r = await _s.Display.ChangeRefreshAsync(m.Id, target).ConfigureAwait(false);
        Changed?.Invoke();
        return r switch
        {
            ModeOutcome.Pending => new VerbResult(true, $"{target} HZ · PRESS AGAIN TO KEEP"),
            ModeOutcome.AlreadySet => VerbResult.Done,
            ModeOutcome.Unsupported => VerbResult.Failed($"NO {target} HZ HERE"),
            ModeOutcome.Rejected => VerbResult.Failed("DRIVER SAID NO"),
            ModeOutcome.Busy => VerbResult.Failed("WAITING FOR KEEP"),
            ModeOutcome.NoMonitor => VerbResult.Failed("NO DISPLAY"),
            _ => VerbResult.Failed("FAILED"),
        };
    }

    // ---- monitors (DDC/CI)

    private MonitorInfo? BrightnessMonitor()
    {
        var list = _s.Display.Monitors();
        if (list.Count == 0) return null;
        lock (_gate) return list[Math.Clamp(_monitor, 0, list.Count - 1)];
    }

    private void MoveMonitor(int delta)
    {
        var n = _s.Display.Monitors().Count;
        lock (_gate) _monitor = n == 0 ? 0 : ((_monitor + delta) % n + n) % n;
    }

    private VerbResult Brightness(int direction, int steps, int step)
    {
        if (BrightnessMonitor() is not { } m) return VerbResult.Failed("NO DISPLAY");
        var v = _s.Ddc.Peek(m.Id, Vcp.Brightness);
        if (v is null) return VerbResult.Failed("READING");
        if (v.Status == DdcStatus.Unsupported) return VerbResult.Failed("NO DDC/CI");
        _s.Ddc.Adjust(m.Id, Vcp.Brightness, direction * steps * Math.Clamp(step, 1, 20));
        Changed?.Invoke();
        return VerbResult.Done;
    }

    private static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    private static int? Int(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<double>(out var d) && d == Math.Floor(d) && Math.Abs(d) < 1e6) return (int)d;
        if (v.TryGetValue<string>(out var s) && int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var p)) return p;
        return null;
    }

    public void Dispose()
    {
        _s.Windows.Changed -= _changed;
        _s.Desktops.Changed -= _changed;
        _s.Display.Changed -= _changed;
        _s.Game.Changed -= _changed;
        _s.Options.Changed -= _changed;
        _s.Ddc.Changed -= _ddcChanged;
    }
}
#endif
