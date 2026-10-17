using System.Globalization;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Control;
using PrismControl.Sight.Service;

namespace PrismControl.Sight.Actions;

public sealed class SightStatusSettings
{
    public bool ShowContext { get; set; } = true;
}

/// <summary>
/// What Sight is reading (game, context, paused/blocked) with a REC mark during calibration capture. Hold the key to
/// start or stop a calibration capture: the explicit, user-started way frames are ever saved.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.sight.status",
    Name = "Sight Status",
    Controllers = Controllers.Keypad,
    Tooltip = "What Prism Sight is reading. Hold to start or stop a calibration capture.",
    Icon = "imgs/actions/sight-status/icon",
    KeyImage = "imgs/actions/sight-status/key",
    SupportedInMultiActions = false)]
public sealed class SightStatusAction : KeyAction<SightStatusSettings>
{
    private IDisposable? _sub;
    private SightSnapshot _snap = SightSnapshot.Empty;
    private string? _flash;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        if (Services.TryGet<ISightService>(out var sight)) _sub = sight.Subscribe(s => Post(() => { _snap = s; Render(); }));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _sub?.Dispose();
        _sub = null;
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        // The hold is its own gesture: it arrives now (the key is still down), not at the key-down.
        var gesture = Gestures.BeginHold(e, Time);
        if (!Services.TryGet<SightService>(out var sight)) { ShowAlert(); return Task.CompletedTask; }
        if (sight.Recorder?.IsRecording == true)
        {
            sight.StopCalibration();
            ShowOk();
            return Task.CompletedTask;
        }
        if (sight.StartCalibration(Gestures.Mint(gesture.Id), out var reason)) ShowOk();
        else { _flash = reason.Contains("safe mode") ? "SAFE" : "NO GAME"; ShowAlert(); Render(); }
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        _ = Gestures.Begin(e, Time);
        _flash = null;
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Prism Sight")
        .Checkbox(PiForm.Global(SightSettings.Section, "enabled"), "Read supported games (offline games only)")
        .Checkbox("showContext", "Show the mode (context) on the key")
        .Info("Status", stateKey: "status")
        .Info("Calibration", "Hold this key to start or stop a calibration capture (PNG frames into Pictures\\Prism Sight).");

    protected override object? DescribeState() => new { status = SightArt.StatusLine(_snap) };

    private void Render() => SetImage(SightArt.StatusKey(Theme, _snap, Settings.ShowContext, _flash));
}

public sealed class SightDialSettings
{
    /// <summary>The Sight control to step (an on-screen slider or ± buttons), e.g. "pc2.builder.bankControl". Empty = use chords.</summary>
    public string Control { get; set; } = "";
    /// <summary>Keyboard chords instead of an on-screen control ("E", "Ctrl+Right").</summary>
    public string IncreaseChord { get; set; } = "";
    public string DecreaseChord { get; set; } = "";
    /// <summary>The readout shown and driven on push, e.g. "bankAngle".</summary>
    public string Readout { get; set; } = "";
    public double Target { get; set; }
    public double Tolerance { get; set; } = 0.5;
    /// <summary>Known change per step (null = learned by Sight).</summary>
    public double? StepSize { get; set; }
    public string Label { get; set; } = "";
    /// <summary>Scancode mode for games that read raw keys.</summary>
    public bool Scancode { get; set; }
    /// <summary>How long each step key is held (ms, 0–500; null = 50 in scancode mode, else a tap).</summary>
    public int? KeyHoldMs { get; set; }
}

/// <summary>
/// A dial that steps a game value and levels it on push (the Coaster Console's BANK): turn = step the on-screen control
/// (or press the step chords) once per tick; push = drive the readout to the target with a closed loop (read, step,
/// re-read). Every action carries a gesture token minted from the gesture recorded on the handler's first line; Sight
/// refuses anything else. The closed loop runs OFF this action's mailbox (M4): the handler returns at once, so a turn
/// made during a drive is handled (and minted) when it happens, and it cancels the drive.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.sight.dial",
    Name = "Sight Dial",
    Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Turn to step a game value; push to level it (Prism Sight reads the screen to verify).",
    Icon = "imgs/actions/sight-dial/icon",
    KeyImage = "imgs/actions/sight-dial/key",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Step", TriggerPush = "Level",
    SupportedInMultiActions = false)]
public sealed class SightDialAction : DialAction<SightDialSettings>
{
    private IDisposable? _sub;
    private SightSnapshot _snap = SightSnapshot.Empty;
    private string? _status;
    private CancellationTokenSource? _drive;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        if (Services.TryGet<ISightService>(out var sight)) _sub = sight.Subscribe(s => Post(() => { _snap = s; Render(); }));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        _sub?.Dispose();
        _sub = null;
        CancelDrive();
        return Task.CompletedTask;
    }

    protected override async Task OnDialRotateAsync(DialRotateEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        if (e.Ticks == 0 || !Services.TryGet<ISightControl>(out var control)) return;
        // A turn during a drive means "stop, I'm correcting": cancel our own closed loop (Sight cancels it too).
        CancelDrive();
        var dir = e.Ticks > 0 ? SightAdjustDirection.Increase : SightAdjustDirection.Decrease;
        var steps = Math.Abs(e.Ticks);
        var token = Gestures.Mint(gesture.Id);
        SightActResult r;
        if (token is null) r = new SightActResult(SightActStatus.Refused, "the turn is too old");
        else if (!string.IsNullOrWhiteSpace(Settings.Control)) r = await control.AdjustAsync(Settings.Control, dir, steps, SightAdjustMethod.Auto, token);
        else if (ChordSteps() is { } chords) r = await control.StepAsync(chords, dir, steps, token);
        else r = new SightActResult(SightActStatus.Refused, "no control or chords set");
        Show(Label(r.Status), r.Acted || r.Status == SightActStatus.SafeMode);
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        Level(gesture);
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        var gesture = Gestures.Begin(e, Time);
        Level(gesture);
        return Task.CompletedTask;
    }

    /// <summary>Starts the closed loop and returns at once; the result is shown when it ends (posted to the mailbox).</summary>
    private void Level(Gesture gesture)
    {
        if (!Services.TryGet<ISightControl>(out var control) || string.IsNullOrWhiteSpace(Settings.Readout)) { ShowAlert(); return; }
        SightStepVia? via = !string.IsNullOrWhiteSpace(Settings.Control) ? new SightControlSteps(Settings.Control) : ChordSteps();
        if (via is null) { Show("Refused", false); return; }
        if (Gestures.Mint(gesture.Id) is not { } token) { Show("Refused", false); return; }
        CancelDrive();
        var cts = new CancellationTokenSource();
        _drive = cts;
        Task<SightDriveResult> drive;
        try
        {
            // Called here, so the token is checked (and the drive registered with Sight) while the push is fresh.
            drive = control.DriveToAsync(Settings.Readout, Settings.Target, via,
                new SightDriveOptions(Tolerance: Settings.Tolerance, StepSize: Settings.StepSize, Fallback: SightDriveFallback.Counted), token, cts.Token);
        }
        catch (Exception)
        {
            _drive = null;
            cts.Dispose();
            Show("Failed", false);
            return;
        }
        _ = FinishAsync(drive, cts);
    }

    private async Task FinishAsync(Task<SightDriveResult> drive, CancellationTokenSource cts)
    {
        SightDriveResult? r = null;
        try { r = await drive.ConfigureAwait(false); }
        catch (OperationCanceledException) { }
        catch (Exception) { }
        Post(() =>
        {
            var current = ReferenceEquals(_drive, cts);
            if (current) _drive = null;
            cts.Dispose();
            // Superseded by a newer gesture (a turn or another push): that gesture shows its own status.
            if (!current && (r is null || r.Status == SightDriveStatus.Cancelled)) return;
            if (r is null) { Show("Cancelled", false); return; }
            Show(Label(r.Status), r.Succeeded || r.Status is SightDriveStatus.SafeMode or SightDriveStatus.CountedFallback);
        });
    }

    private void CancelDrive()
    {
        var d = _drive;
        _drive = null;
        if (d is null) return;
        try { d.Cancel(); } catch (ObjectDisposedException) { }
    }

    /// <summary>The status line under the value: "WINDOW CHANGED" when the game lost the foreground mid-action.</summary>
    private static string Label(SightActStatus s) => s == SightActStatus.WindowChanged ? "WINDOW CHANGED" : s.ToString();

    private static string Label(SightDriveStatus s) => s == SightDriveStatus.WindowChanged ? "WINDOW CHANGED" : s.ToString();

    private SightChordSteps? ChordSteps() =>
        Chords.TryParse(Settings.IncreaseChord, out var inc) && Chords.TryParse(Settings.DecreaseChord, out var dec)
            ? new SightChordSteps(inc, dec, Settings.Scancode ? KeyMode.Scancode : KeyMode.VirtualKey, HoldMs: Settings.KeyHoldMs)
            : null;

    private void Show(string status, bool ok)
    {
        _status = status;
        if (!ok) ShowAlert();
        Render();
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("What to step")
        .Text("control", "Sight control (on-screen slider or ± buttons)", "pc2.builder.bankControl")
        .Text("increaseChord", "…or the increase chord", "E")
        .Text("decreaseChord", "…and the decrease chord", "Q")
        .Checkbox("scancode", "Send physical keys (scancode mode)")
        .Heading("What to read")
        .Text("readout", "Readout", "bankAngle")
        .Number("target", "Push drives it to")
        .Number("tolerance", "Tolerance")
        .Text("label", "Label", "BANK")
        .Info("Status", stateKey: "status");

    protected override object? DescribeState() => new { status = _status ?? SightArt.StatusLine(_snap) };

    private void Render()
    {
        var label = string.IsNullOrWhiteSpace(Settings.Label) ? (string.IsNullOrWhiteSpace(Settings.Readout) ? "SIGHT" : Settings.Readout) : Settings.Label;
        var ro = string.IsNullOrWhiteSpace(Settings.Readout) ? null : _snap.Readout(Settings.Readout);
        var located = string.IsNullOrWhiteSpace(Settings.Control) || (_snap.Controls.TryGetValue(Settings.Control, out var c) && c.Located);
        if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, SightArt.Dial(Theme, label, ro, located, _snap.State, _status)));
        else SetImage(SightArt.ValueKey(Theme, label, ro, located, _snap.State));
    }
}

/// <summary>Sight's deck art (Refraction look, stroke font, hex colors only, few elements).</summary>
public static class SightArt
{
    private static readonly Color Rec = new(0xff, 0x45, 0x45);

    public static SpectrumColor Hue(RefractionPalette t) => t.Spectrum[7];

    public static string StatusLine(SightSnapshot s) => s.State switch
    {
        SightRunState.Running => $"Reading {s.ProcessName} ({s.RecipeId}); mode: {s.Context.Label ?? "none"}{(s.Recording ? "; REC" : "")}",
        SightRunState.Paused => $"Paused: {s.Reason}",
        SightRunState.Blocked => $"Not reading {s.ProcessName}: {s.Reason}",
        SightRunState.Off => "Off",
        SightRunState.Error => $"Error: {s.Reason}",
        _ => "Waiting for a supported game",
    };

    public static string Value(SightReadout? r) => r is null || !r.HasValue ? "—" :
        r.Number is { } n ? n.ToString(Math.Abs(n) >= 100 || n == Math.Round(n) ? "0" : "0.#", CultureInfo.InvariantCulture) + (r.Unit is "deg" or "°" ? "°" : "")
        : r.Flag is { } f ? (f ? "ON" : "OFF") : (r.Text ?? "—");

    private static double Opacity(SightConfidence c) => c switch { SightConfidence.Observed => 1, SightConfidence.Inferred => 0.75, SightConfidence.Stale => 0.45, _ => 0.35 };

    public static SvgDocument StatusKey(RefractionPalette t, SightSnapshot s, bool showContext, string? flash)
    {
        var hue = Hue(t);
        var value = flash ?? s.State switch
        {
            SightRunState.Running => showContext ? (s.Context.Label ?? s.GameId?.ToUpperInvariant() ?? "LIVE") : (s.GameId?.ToUpperInvariant() ?? "LIVE"),
            SightRunState.Paused => "PAUSED",
            SightRunState.Blocked => "BLOCKED",
            SightRunState.Off => "OFF",
            SightRunState.Error => "ERROR",
            _ => "IDLE",
        };
        var d = KeyArt.Value(t, "SIGHT", value, hue, on: s.State == SightRunState.Running);
        Eye(d, 18, 16, s.State == SightRunState.Running ? hue.Vivid : t.KeyMuted);
        if (s.Recording)
        {
            d.Circle(118, 22, 7, Rec);
            d.Text("REC", 118, 42, 16, Rec, TextAlign.Middle, FontWeight.Semibold);
        }
        return d;
    }

    public static SvgDocument ValueKey(RefractionPalette t, string label, SightReadout? r, bool located, SightRunState state)
    {
        var hue = Hue(t);
        var d = KeyArt.Value(t, label.ToUpperInvariant(), located ? Value(r) : "LOST", hue, on: state == SightRunState.Running && r?.Confidence == SightConfidence.Observed);
        ConfidenceDot(d, 126, 18, r?.Confidence ?? SightConfidence.Unknown, hue, t);
        return d;
    }

    public static SvgDocument Dial(RefractionPalette t, string label, SightReadout? r, bool located, SightRunState state, string? status)
    {
        var hue = Hue(t);
        var active = state == SightRunState.Running && r?.Confidence == SightConfidence.Observed;
        var d = DialArt.Base(t, hue, active);
        d.Text(label.ToUpperInvariant(), 16, 24, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, textCase: TextCase.Upper);
        var value = located ? Value(r) : "LOST";
        var size = StrokeFont.FitSize(value, 120, Refraction.Deck.DialValueSize, 18);
        d.Text(value, 16, 66, size, active ? hue.Ink : t.KeyInk.WithOpacity(Opacity(r?.Confidence ?? SightConfidence.Unknown)), TextAlign.Start, FontWeight.Semibold);
        // Horizon: a tilted line for angle readouts (bank), level when 0.
        if (r?.Number is { } n && r.Unit is "deg" or "°")
        {
            var a = Math.Clamp(n, -90, 90) * Math.PI / 180;
            double cx = 160, cy = 54, len = 26;
            d.Line(cx - len * Math.Cos(a), cy + len * Math.Sin(a), cx + len * Math.Cos(a), cy - len * Math.Sin(a), hue.Vivid, 4);
            d.Line(cx - 30, cy, cx + 30, cy, t.KeyMuted, 1.5, opacity: 0.5);
        }
        ConfidenceDot(d, 184, 18, r?.Confidence ?? SightConfidence.Unknown, hue, t);
        if (status is not null) d.Text(status.ToUpperInvariant(), 16, 90, 14, t.KeyMuted, TextAlign.Start, FontWeight.Semibold);
        return d;
    }

    private static void ConfidenceDot(SvgDocument d, double x, double y, SightConfidence c, SpectrumColor hue, RefractionPalette t)
    {
        switch (c)
        {
            case SightConfidence.Observed: d.Circle(x, y, 5, hue.Vivid); break;
            case SightConfidence.Inferred: d.Circle(x, y, 5, new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 2 }); break;
            case SightConfidence.Stale: d.Circle(x, y, 5, t.KeyMuted.WithOpacity(0.6)); break;
            default: d.Circle(x, y, 5, new Style { Fill = Paint.None, Stroke = t.KeyMuted, StrokeWidth = 1.5 }); break;
        }
    }

    /// <summary>A small eye glyph (generic, no logo).</summary>
    private static void Eye(SvgDocument d, double x, double y, Paint color)
    {
        var p = new PathBuilder().MoveTo(x, y + 8).QuadTo(x + 12, y - 4, x + 24, y + 8).QuadTo(x + 12, y + 20, x, y + 8).Close();
        d.Path(p, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = 2.5 });
        d.Circle(x + 12, y + 8, 3.5, color);
    }
}
