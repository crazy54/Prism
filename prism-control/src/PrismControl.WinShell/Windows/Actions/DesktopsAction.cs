using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

public sealed class DesktopsSettings
{
    /// <summary>Key press: "next" (wraps), "previous" (wraps) or "goto" (<see cref="Target"/>).</summary>
    public string Action { get; set; } = "next";
    /// <summary>1-based desktop for "goto".</summary>
    public int Target { get; set; } = 1;
}

/// <summary>
/// Feature 9: the virtual desktop pager. Shows how many desktops there are, which one is current and its name (read from
/// Explorer's registry, re-read every second, so keyboard switches show up too). Press = next / previous / go to N via
/// Win+Ctrl+←/→. On a dial: turn = previous/next (one step per turn event), push = next.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.desktops",
    Name = "Virtual Desktops",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Shows your virtual desktops; press to switch.",
    Icon = "imgs/actions/windows/desktops/icon",
    KeyImage = "imgs/actions/windows/desktops/key",
    EncoderIcon = "imgs/actions/windows/desktops/dial",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Previous / next desktop",
    TriggerPush = "Next desktop",
    TriggerTouch = "Next desktop")]
public sealed class DesktopsAction : DialAction<DesktopsSettings>
{
    public static readonly TimeSpan TurnGap = TimeSpan.FromMilliseconds(300);

    private VirtualDesktopService? _svc;
    private Flash? _flash;
    private Action? _onChanged;
    private long _lastTurn;
    private bool _switching;
    private Task _work = Task.CompletedTask;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _svc = Services.Find<VirtualDesktopService>();
        _flash = new Flash(this, Time, Render);
        _onChanged = () => Post(Render);
        if (_svc is not null) _svc.Changed += _onChanged;
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_svc is not null && _onChanged is not null) _svc.Changed -= _onChanged;
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(DesktopsSettings settings) { Render(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e) => Settings.Action?.Trim().ToLowerInvariant() switch
    {
        "previous" or "prev" => SwitchAsync(svc => svc.StepAsync(-1)),
        "goto" => SwitchAsync(svc => svc.GoToAsync(Math.Max(1, Settings.Target) - 1)),
        _ => SwitchAsync(svc => svc.StepAsync(+1)),
    };

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (e.Ticks == 0) return Task.CompletedTask;
        // One desktop per turn event, at most every 300 ms: a fast Galleon spin (±12 ticks) is still one step.
        if (_lastTurn != 0 && Time.GetElapsedTime(_lastTurn) < TurnGap) return Task.CompletedTask;
        _lastTurn = Time.GetTimestamp();
        return SwitchAsync(svc => svc.StepAsync(Math.Sign(e.Ticks), wrap: false));
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => SwitchAsync(svc => svc.StepAsync(+1));
    protected override Task OnTouchTapAsync(TouchTapEvent e) => SwitchAsync(svc => svc.StepAsync(+1));

    /// <summary>Runs the switch off the mailbox (it waits for Explorer to confirm) and shows the outcome when it is done.</summary>
    private Task SwitchAsync(Func<VirtualDesktopService, Task<DesktopSwitchOutcome>> go)
    {
        if (_svc is not { } svc || _switching) return Task.CompletedTask;
        _switching = true;
        _work = Task.Run(async () =>
        {
            DesktopSwitchOutcome r;
            try { r = await go(svc).ConfigureAwait(false); }
            catch { r = DesktopSwitchOutcome.Failed; }
            Post(() =>
            {
                _switching = false;
                switch (r)
                {
                    case DesktopSwitchOutcome.NotConfirmed: _flash?.Show("NOT CONFIRMED", alert: true); break;
                    case DesktopSwitchOutcome.Failed: _flash?.Show("COULDN'T SWITCH", alert: true); break;
                    case DesktopSwitchOutcome.NoSuchDesktop: _flash?.Show($"NO DESKTOP {Settings.Target}", alert: true); break;
                    case DesktopSwitchOutcome.Simulated: _flash?.Show("SAFE MODE"); break;
                    case DesktopSwitchOutcome.AlreadyThere: _flash?.Show("ALREADY HERE"); break;
                }
                Render();
            });
        });
        return Task.CompletedTask;
    }

    internal bool Switching => _switching;
    /// <summary>The last switch's off-mailbox work; it ends after posting its outcome (tests await it instead of moving the clock).</summary>
    internal Task Work => _work;
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private void Render()
    {
        if (!IsVisible) return;
        var s = _svc?.Current() ?? DesktopsState.Single;
        if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, PagerArt.DesktopsDial(Theme, s, IsInteractive, _flash?.Text, _flash?.IsAlert ?? false)));
        else SetImage(PagerArt.DesktopsKey(Theme, s, _flash?.Text, _flash?.IsAlert ?? false));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Virtual desktops")
        .Select("action", "Key press", [("next", "Next desktop"), ("previous", "Previous desktop"), ("goto", "Go to desktop")])
        .Number("target", "Desktop number (go to)", 1, 20, 1)
        .Info("How", "Switching presses Win+Ctrl+Left/Right for you. Windows has no supported way to move another app's window to a desktop, so this key doesn't offer that.");
}
