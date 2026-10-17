using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Service;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

/// <summary>
/// A simulated game for closed-loop tests: keys and clicks change its HUD state the way a coaster builder would, and
/// every read renders a real synthetic frame through the real engine and detectors. No window, no real input.
/// </summary>
public sealed class SimGame
{
    public HudState State { get; } = new();
    public int Width { get; init; } = 2560;
    public int Height { get; init; } = 1440;
    public double HudScale { get; init; } = 1.0;
    /// <summary>Where the game's client area is on the virtual desktop (left monitor: negative x).</summary>
    public PixelRect Client { get; init; } = new(-2560, 0, 2560, 1440);
    public double StepDeg { get; set; } = SyntheticHud.BankStep;
    public bool InputRegisters { get; set; } = true;
    public bool Reversed { get; set; }
    public double MinBank { get; set; } = -180;
    public double MaxBank { get; set; } = 180;
    public int Chords { get; private set; }
    public int Clicks { get; private set; }
    public int Wheels { get; private set; }
    public int Drags { get; private set; }

    private string? _cachedKey;
    private SightImage? _cached;

    /// <summary>The current frame (re-rendered only when the HUD state changed: rendering is the slow part of the tests).</summary>
    public SightImage Frame()
    {
        lock (State)
        {
            var key = $"{State.Bank}|{State.Pitch}|{State.Length}|{State.Tool}|{State.BuilderOpen}|{State.BankControl}|{State.TestButton}|{State.Results}|{State.Excitement}|{State.Fear}|{State.Nausea}|{State.Paused}|{State.Font}|{State.AngleFormat}|{State.Seed}";
            if (key != _cachedKey || _cached is null) { _cached = SyntheticHud.Render(Width, Height, HudScale, State); _cachedKey = key; }
            return _cached;
        }
    }

    private HudGeometry Geo => HudGeometry.For(Width, Height, new HudDto { ReferenceHeight = 1080 }, HudScale);

    private void Bank(double delta)
    {
        if (!InputRegisters) return;
        if (Reversed) delta = -delta;
        lock (State) State.Bank = Math.Clamp(State.Bank + delta, MinBank, MaxBank);
    }

    /// <summary>When set: the degrees press number n (1-based) moves the bank, instead of <see cref="StepDeg"/>.</summary>
    public Func<int, double>? StepAt { get; set; }

    public void OnChord(IReadOnlyList<VirtualKey> keys)
    {
        Chords++;
        var step = StepAt?.Invoke(Chords) ?? StepDeg;
        if (keys.Count == 1 && keys[0] == VirtualKey.E) Bank(step);
        if (keys.Count == 1 && keys[0] == VirtualKey.Q) Bank(-step);
    }

    private (double X, double Y) ToContent(PointI p) => (p.X - Client.X + 0.5, p.Y - Client.Y + 0.5);

    private bool Inside(PointI p, Anchor a, double x, double y, double w, double h)
    {
        var r = Geo.Resolve(a, x, y, w, h);
        var (cx, cy) = ToContent(p);
        return cx >= r.X && cx < r.Right && cy >= r.Y && cy < r.Bottom;
    }

    public void OnClick(PointI p)
    {
        Clicks++;
        if (!State.BuilderOpen) return;
        if (State.BankControl && Inside(p, Anchor.Right, -384, -100, 36, 36)) Bank(-StepDeg);
        else if (State.BankControl && Inside(p, Anchor.Right, -92, -100, 36, 36)) Bank(StepDeg);
        else if (State.TestButton && Inside(p, Anchor.Right, -384, 260, 160, 44) && InputRegisters) State.Results = true;
    }

    public void OnWheel(int notches, PointI p)
    {
        Wheels++;
        if (State.BankControl && Inside(p, Anchor.Right, -396, -110, 356, 56)) Bank(notches * StepDeg);
    }

    public void OnDrag(PointI from, PointI to)
    {
        Drags++;
        var pos = Math.Clamp((State.Bank + 90) / 180, 0, 1);
        if (!State.BankControl || !Inside(from, Anchor.Right, -340 + pos * 240 - 14, -96, 28, 28)) return;
        var degPerPx = 180 / (240 * Geo.Unit);
        var delta = (to.X - from.X) * degPerPx;
        Bank(Math.Round(delta / StepDeg) * StepDeg);   // the slider snaps to steps
    }
}

public sealed class SimKeyboard(SimGame game) : IInputSender
{
    /// <summary>One entry per press (a chord tap, or a held press when the key goes down).</summary>
    public List<(IReadOnlyList<VirtualKey> Keys, KeyMode Mode)> Sent { get; } = [];
    /// <summary>Held presses: (keys, mode, down at) in order; the matching release is in <see cref="Releases"/>.</summary>
    public List<(IReadOnlyList<VirtualKey> Keys, KeyMode Mode)> Holds { get; } = [];
    public int Releases { get; private set; }
    public bool Elevated { get; set; }
    /// <summary>The window in front, as the real sender would read it inside SendChordToAsync (null: accept).</summary>
    public Func<nint>? Foreground { get; set; }
    public int RefusedWindowChanged { get; private set; }
    private readonly List<VirtualKey> _held = [];
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendChordAsync(keys, KeyMode.VirtualKey, ct);
    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default)
    {
        lock (Sent) Sent.Add(([.. keys], mode));
        game.OnChord(keys);
        return Task.FromResult(true);
    }
    public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        if (Foreground is { } fg && fg() != expectedHwnd) { RefusedWindowChanged++; return Task.FromResult(false); }
        if (Elevated) return Task.FromResult(false);
        return SendChordAsync(keys, mode, ct);
    }
    public Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        lock (Sent)
        {
            Sent.Add(([.. keys], mode));
            Holds.Add(([.. keys], mode));
            _held.AddRange(keys);
        }
        game.OnChord(keys);
        return Task.FromResult(true);
    }
    public Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        lock (Sent) { if (_held.RemoveAll(keys.Contains) > 0) Releases++; }
        return Task.FromResult(true);
    }
    public IReadOnlyList<VirtualKey> HeldKeys { get { lock (Sent) return [.. _held]; } }
    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendChordAsync([key], ct);
    public Task<bool> SendTextAsync(string text, CancellationToken ct = default) => Task.FromResult(false);
    public bool TargetIsElevated(nint hwnd) => Elevated;
}

public sealed class SimMouse(SimGame game) : IMouseSender
{
    public List<string> Sent { get; } = [];
    public List<nint> ExpectedWindows { get; } = [];
    public MouseResult Result { get; set; } = MouseResult.Sent;
    private Task<MouseResult> Done(string what, MouseOptions? o) { lock (Sent) { Sent.Add(what); ExpectedWindows.Add(o?.ExpectedHwnd ?? 0); } return Task.FromResult(Result); }
    public Task<MouseResult> MoveAsync(PointI to, MouseOptions? options = null, CancellationToken ct = default) => Done($"move {to}", options);
    public Task<MouseResult> ClickAsync(PointI? at, MouseButton button, int count = 1, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (Result == MouseResult.Sent && at is { } p) for (var i = 0; i < count; i++) game.OnClick(p);
        return Done($"click {at}", options);
    }
    public Task<MouseResult> DragAsync(PointI from, PointI to, TimeSpan duration, int steps, MouseButton button = MouseButton.Left, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (Result == MouseResult.Sent) game.OnDrag(from, to);
        return Done($"drag {from}->{to}", options);
    }
    public Task<MouseResult> WheelAsync(int notches, ModifierKeys mods = ModifierKeys.None, PointI? at = null, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (Result == MouseResult.Sent && at is { } p) game.OnWheel(notches, p);
        return Done($"wheel {notches} at {at}", options);
    }
}

/// <summary>The control layer's view of a running reader, backed by <see cref="SimGame"/> and a real engine.</summary>
public sealed class SimLive : ISightLive
{
    private readonly SimGame _game;
    private readonly ManualTimeProvider _time;
    private readonly object _gate = new();

    /// <summary>
    /// <paramref name="recipe"/> null: the synthetic recipe with a glyph set harvested from the synthetic HUD (what
    /// calibration produces), so its OCR reads are full confidence and closed loops may act on them (decision 3).
    /// </summary>
    public SimLive(SimGame game, ManualTimeProvider time, CompiledRecipe? recipe = null, string process = "SyntheticCoaster.exe", SightGameAccess? access = null, Text.ITextRecognizer? ocr = null)
    {
        _game = game;
        _time = time;
        var r = recipe ?? SyntheticHud.CalibratedRecipe();
        Engine = new SightEngine(r, new SightEngineOptions { HudScale = game.HudScale, Ocr = ocr });
        Target = new SightTarget(Hwnd, 4242, process, null, "SynWindow", r, access ?? new SightGameAccess(process, "syncoaster", true, true, "Allowlisted", "test"));
        Foreground = Hwnd;
    }

    public static readonly nint Hwnd = 0x5150;
    public SightTarget? Target { get; set; }
    public SightEngine? Engine { get; }
    public nint Foreground { get; set; }
    public int Frames { get; private set; }
    public int Boosts { get; private set; }

    public int FreshCalls { get; private set; }

    public async Task<bool> FreshAsync(IReadOnlyCollection<int> regions, TimeSpan timeout, CancellationToken ct)
    {
        FreshCalls++;
        if (Engine is null || !Reading) return false;
        // Each "frame" is 20 ms of game time later.
        _time.Advance(TimeSpan.FromMilliseconds(20));
        var at = _time.GetUtcNow();
        var frame = _game.Frame();
        Engine.RequestNow(regions);
        var plan = Engine.Plan(frame.Width, frame.Height, at);
        await Engine.ProcessAsync(new RegionFrame { At = at, ContentWidth = frame.Width, ContentHeight = frame.Height, Regions = plan.ToDictionary(c => c.Region, c => frame.Crop(c.Rect)) }, ct);
        Frames++;
        return true;
    }

    public IDisposable Boost() { Boosts++; return new Noop(); }
    public nint ForegroundWindow() => Foreground;
    /// <summary>False simulates a paused or failed capture.</summary>
    public bool Reading { get; set; } = true;
    public bool CanRead => Reading && Target is not null && Engine is not null;

    public bool ContentToScreen(double x, double y, out PointI screen)
    {
        screen = Capture.WindowGeometry.ContentToScreen(_game.Client, x, y);
        return true;
    }

    private sealed class Noop : IDisposable { public void Dispose() { } }
}

/// <summary>
/// Deck gestures for tests, made the only way there is: a Core action event goes through the registry
/// (<see cref="Desktop.Sight.Gestures.Begin"/>, what every handler's first line does), and the token is minted from the
/// gesture id.
/// </summary>
public static class Gestures
{
    private const string Uuid = "com.jeremyfhall.prismcontrol.sight.dial";

    public static GestureToken From(ActionEvent e, TimeProvider t) => Desktop.Sight.Gestures.Mint(Desktop.Sight.Gestures.Begin(e, t).Id)!;
    public static GestureToken Press(TimeProvider t, string ctx = "ctx-1") => From(new KeyUpEvent(ctx, Uuid, "dev", new Core.Devices.Coordinates(0, 0), 0, null, false), t);
    public static GestureToken KeyDown(TimeProvider t, string ctx = "ctx-1") => From(new KeyDownEvent(ctx, Uuid, "dev", new Core.Devices.Coordinates(0, 0), 0, null, false), t);
    public static GestureToken Push(TimeProvider t, string ctx = "ctx-1") => From(new DialUpEvent(ctx, Uuid, "dev", new Core.Devices.Coordinates(0, 0)), t);
    public static GestureToken Turn(TimeProvider t, int ticks, string ctx = "ctx-1") => From(new DialRotateEvent(ctx, Uuid, "dev", new Core.Devices.Coordinates(0, 0), ticks, false), t);
}
