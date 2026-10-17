using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Core.Scheduling;
using PrismControl.Hosting;

namespace PrismControl.Diagnostics;

public sealed class DiagnosticsSettings
{
    /// <summary>When > 0, redraw this many times per second (load test the update budget on real hardware).</summary>
    public int StressFps { get; set; }
}

/// <summary>
/// Shows the update scheduler live (sent/s against the budget). With a stress rate it animates every frame, which
/// the fake-host E2E test uses to prove the global budget holds. Key press cycles the stress rate (0/10/30/60);
/// on a dial, turn to change it and press to stop.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.core.diagnostics", Name = "Diagnostics",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Prism Control update budget and connection health. Press to cycle a stress test.",
    Icon = "imgs/actions/core/diagnostics/icon", KeyImage = "imgs/actions/core/diagnostics/key", EncoderIcon = "imgs/actions/core/diagnostics/dial",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Stress rate", TriggerPush = "Stop stress")]
public sealed class DiagnosticsAction : DialAction<DiagnosticsSettings>
{
    private static readonly int[] Steps = [0, 10, 30, 60];
    private RenderLoop? _loop;
    private long _frame;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        _loop = StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        ApplyRate();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        var i = Array.IndexOf(Steps, Settings.StressFps);
        Settings.StressFps = Steps[(i + 1) % Steps.Length];
        SaveSettings();
        ApplyRate();
        ShowOk();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        Settings.StressFps = Math.Clamp(Settings.StressFps + e.Ticks * 5, 0, 60);
        SaveSettings();
        ApplyRate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        Settings.StressFps = 0;
        SaveSettings();
        ApplyRate();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(DiagnosticsSettings settings)
    {
        ApplyRate();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Update budget")
        .Range("stressFps", "Stress (frames/s)", 0, 60, 5)
        .Info("Sent per second", stateKey: "sentLastSecond")
        .Info("Budget per second", stateKey: "budget")
        .Info("Safe mode", stateKey: "safeMode");

    protected override object? DescribeState()
    {
        var s = Stats();
        return new { sentLastSecond = s?.SentLastSecond, budget = s?.BudgetPerSecond, safeMode = SafeMode ? "on (writes are no-ops)" : "off" };
    }

    private void ApplyRate()
    {
        if (_loop is null) return;
        var fps = Math.Clamp(Settings.StressFps, 0, 60);
        DefaultPriority = fps > 0 ? UpdatePriority.Normal : UpdatePriority.Background;
        _loop.IdleInterval = _loop.ActiveInterval = fps > 0 ? TimeSpan.FromSeconds(1.0 / fps) : TimeSpan.FromSeconds(1);
        _loop.Invalidate();
    }

    private SchedulerStats? Stats() => Services.TryGet<IPluginDiagnostics>(out var d) ? d.Scheduler : null;

    private Task Render(CancellationToken ct)
    {
        _frame++;
        var stats = Stats();
        var sent = stats?.SentLastSecond ?? 0;
        var budget = stats?.BudgetPerSecond ?? 60;
        var hue = Hues.For(Theme, "core");
        var stress = Settings.StressFps;
        if (IsDial)
        {
            var d = DialArt.Meter(Theme, stress > 0 ? $"STRESS {stress}/S" : "UPDATES / S", $"{sent} / {budget:0}", sent / budget, hue, active: stress > 0);
            if (stress > 0) d.Circle(16 + (_frame * 6 % 168), 92, 2.5, hue.Ink);
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, d));
        }
        else
        {
            var d = KeyArt.Value(Theme, stress > 0 ? $"STRESS {stress}" : "UPD/S", sent.ToString(System.Globalization.CultureInfo.InvariantCulture), hue, sent / budget, on: stress > 0);
            if (stress > 0) d.Circle(24 + (_frame * 4 % 96), 124, 2.5, hue.Ink);
            SetImage(d);
        }
        return Task.CompletedTask;
    }
}
