using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

public sealed class InputSourceSettings
{
    public string Monitor { get; set; } = "";
    /// <summary>The VCP 60 value to switch to (from the monitor's capabilities list); 0 = not set.</summary>
    public int Input { get; set; }
}

/// <summary>
/// Flagship 2: monitor input switching over DDC/CI (VCP 60). It is disruptive and one-way (this PC's picture may leave
/// that monitor), so it always confirms, naming the target: on a key, hold 1.5 s while the ring fills; on a dial (Galleon
/// dials never deliver holds) turn to pick an input from the monitor's capabilities list, push to arm, push again within 3 s.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.input-source",
    Name = "Monitor Input",
    Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Switches a monitor's input (HDMI, DisplayPort…). Hold the key, or push the dial twice, to confirm.",
    Icon = "imgs/actions/windows/input-source/icon",
    KeyImage = "imgs/actions/windows/input-source/key",
    EncoderIcon = "imgs/actions/windows/input-source/dial",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Choose input",
    TriggerPush = "Push twice to switch",
    TriggerTouch = "Push twice to switch")]
public sealed class InputSourceAction : DialAction<InputSourceSettings>
{
    private DisplayService? _display;
    private DdcService? _ddc;
    private HoldConfirm? _hold;
    private ArmConfirm? _arm;
    private Flash? _flash;
    private Action<string>? _onDdc;
    private int _selected;
    private bool _switching;

    internal bool Switching => _switching;
    internal HoldConfirm? Hold => _hold;
    internal ArmConfirm? Arm => _arm;
    internal int SelectedIndex => _selected;
    internal string? FlashText => _flash?.Text;
    internal bool FlashAlert => _flash?.IsAlert ?? false;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Render(); return Task.CompletedTask; }
        _started = true;
        if (IsKey) DefaultPriority = UpdatePriority.Background;
        _display = Services.Find<DisplayService>();
        _ddc = Services.Find<DdcService>();
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2.5));
        _hold = new HoldConfirm(this, Time, Render, () => { StartSwitch((uint)Settings.Input); return Task.CompletedTask; });
        _arm = new ArmConfirm(this, Time, Render);
        _onDdc = _ => Post(Render);
        if (_ddc is not null) _ddc.Changed += _onDdc;
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        LoadCapabilities();
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(250));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_ddc is not null && _onDdc is not null) _ddc.Changed -= _onDdc;
        _hold?.Dispose();
        _arm?.Dispose();
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(InputSourceSettings settings)
    {
        _arm?.Disarm();
        LoadCapabilities();
        Render();
        return Task.CompletedTask;
    }

    private MonitorInfo? Monitor => _display?.Find(Settings.Monitor);

    private void LoadCapabilities()
    {
        if (_ddc is null || Monitor is not { } m) return;
        _ = _ddc.CapabilitiesAsync(m.Id).ContinueWith(_ => Post(() =>
        {
            var inputs = Inputs();
            var i = inputs.ToList().FindIndex(x => (x & 0xFF) == (uint)(Settings.Input & 0xFF));
            if (i >= 0) _selected = i;
            Render();
        }), TaskScheduler.Default);
    }

    internal IReadOnlyList<uint> Inputs() =>
        _ddc is not null && Monitor is { } m && _ddc.CachedCapabilities(m.Id) is { } caps ? caps.Inputs : [];

    private uint? CurrentInput() =>
        _ddc is not null && Monitor is { } m && _ddc.Peek(m.Id, Vcp.InputSource) is { Status: not DdcStatus.Unsupported } v ? v.Current : null;

    // ---------------------------------------------------------------- key: hold to confirm

    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        if (Settings.Input <= 0) { _flash?.Show("PICK AN INPUT", alert: true); return Task.CompletedTask; }
        if (CurrentInput() is { } c && (c & 0xFF) == (uint)(Settings.Input & 0xFF)) { _flash?.Show("ALREADY ACTIVE"); return Task.CompletedTask; }
        if (!_switching) _hold?.Down();
        return Task.CompletedTask;
    }

    protected override Task OnKeyUpAsync(KeyUpEvent e)
    {
        if (_hold is { IsHolding: true } h && !h.Fired) _flash?.Show("HOLD TO SWITCH");
        _hold?.Up();
        return Task.CompletedTask;
    }

    // ---------------------------------------------------------------- dial: turn to pick, push twice to switch

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var inputs = Inputs();
        if (inputs.Count == 0 || e.Ticks == 0) return Task.CompletedTask;
        _arm?.Disarm();
        _selected = Math.Clamp(_selected + Math.Sign(e.Ticks) * Math.Min(Math.Abs(e.Ticks), 2), 0, inputs.Count - 1);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => Push();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => Push();

    private Task Push()
    {
        var inputs = Inputs();
        if (inputs.Count == 0 || _switching) { Render(); return Task.CompletedTask; }
        var target = inputs[Math.Clamp(_selected, 0, inputs.Count - 1)];
        if (CurrentInput() is { } c && (c & 0xFF) == (target & 0xFF)) { _flash?.Show("ALREADY ACTIVE"); return Task.CompletedTask; }
        if (_arm?.Push() == true) StartSwitch(target);
        Render();
        return Task.CompletedTask;
    }

    // ---------------------------------------------------------------- the switch

    private void StartSwitch(uint input)
    {
        if (_ddc is not { } ddc || Monitor is not { } m || _switching || input == 0) return;
        _switching = true;
        var id = m.Id;
        _ = Task.Run(async () =>
        {
            InputSwitchOutcome r;
            try { r = await ddc.SwitchInputAsync(id, input).ConfigureAwait(false); }
            catch { r = InputSwitchOutcome.Failed; }
            Post(() =>
            {
                _switching = false;
                switch (r)
                {
                    case InputSwitchOutcome.Switched: _flash?.Show("SWITCHED"); break;
                    case InputSwitchOutcome.SwitchedUnverified: _flash?.Show("SENT (NO REPLY)"); break;
                    case InputSwitchOutcome.AlreadyActive: _flash?.Show("ALREADY ACTIVE"); break;
                    case InputSwitchOutcome.NotApplied: _flash?.Show("MONITOR SAID NO", alert: true); break;
                    default: _flash?.Show("FAILED", alert: true); break;
                }
                Render();
            });
        });
        Render();
    }

    private void Render()
    {
        if (!IsVisible) return;
        var m = Monitor;
        var name = m?.ShortName ?? "MONITOR";
        var current = CurrentInput();
        var flash = _switching ? "SWITCHING…" : _flash?.Text;
        var alert = _flash?.IsAlert ?? false;
        if (IsDial)
        {
            var inputs = Inputs();
            TimeSpan? armed = _arm is { IsArmed: true } a ? a.Remaining : null;
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, DisplayArt.InputDial(Theme, name, inputs, Math.Clamp(_selected, 0, Math.Max(0, inputs.Count - 1)), current, IsInteractive, armed, flash, alert)));
        }
        else
        {
            var input = Settings.Input > 0 ? Vcp.InputShort((uint)Settings.Input) : "NOT SET";
            var active = Settings.Input > 0 && current is { } c && (c & 0xFF) == (uint)(Settings.Input & 0xFF);
            SetImage(DisplayArt.InputKey(Theme, name, input, active, _hold?.IsHolding == true ? _hold.Progress : 0, flash, alert, Settings.Input > 0 ? null : "OPEN SETTINGS"));
        }
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Monitor input")
        .Select("monitor", "Monitor", optionsFrom: "monitors.list")
        .Select("input", "Switch to", optionsFrom: "inputs.list")
        .Info("Careful", "Switching can take this PC's picture off that monitor; you come back with the monitor's buttons or another key. The key needs a 1.5 s hold, a dial needs two pushes.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (type == "monitors.list") return MonitorPicker.Options(_display, includeAll: false);
        if (type != "inputs.list" || _ddc is null || Monitor is not { } m) return null;
        var caps = await _ddc.CapabilitiesAsync(m.Id).ConfigureAwait(false);
        var inputs = caps?.Inputs ?? [];
        var list = new List<object> { new { value = "0", label = inputs.Count == 0 ? "No inputs listed by this monitor" : "Choose…" } };
        list.AddRange(inputs.Select(i => (object)new { value = i.ToString(CultureInfo.InvariantCulture), label = Vcp.InputName(i) }));
        return list;
    }
}
