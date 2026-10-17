using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

public sealed class MonitorSettings
{
    /// <summary>Monitor id (its device path); empty = the primary monitor.</summary>
    public string Monitor { get; set; } = "";
}

/// <summary>
/// Flagship 3: HDR on/off for one monitor with the TRUE state (DisplayConfig ADVANCED_COLOR_INFO_2, re-read every second
/// and after every toggle). A toggle shows a 2 s "resyncing" state while the monitor blanks, then re-reads; a toggle that
/// did not take shows the real state plus an alert. Monitors without HDR say so.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.hdr",
    Name = "HDR",
    Controllers = Controllers.Keypad,
    Tooltip = "Turns HDR on or off for one monitor, showing what Windows really reports.",
    Icon = "imgs/actions/windows/hdr/icon",
    KeyImage = "imgs/actions/windows/hdr/key")]
public sealed class HdrKey : KeyAction<MonitorSettings>
{
    private DisplayService? _display;
    private Flash? _flash;
    private Action? _onChanged;
    private bool _toggling;
    private long _toggleStarted;

    internal bool Toggling => _toggling;
    internal HdrView LastView { get; private set; }
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
        _flash = new Flash(this, Time, Render, TimeSpan.FromSeconds(2.5));
        _onChanged = () => Post(Render);
        if (_display is not null) _display.Changed += _onChanged;
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(250));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_display is not null && _onChanged is not null) _display.Changed -= _onChanged;
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(MonitorSettings settings) { Render(); return Task.CompletedTask; }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_display is not { } display || _toggling) return Task.CompletedTask;
        _toggling = true;
        _toggleStarted = Time.GetTimestamp();
        var id = Settings.Monitor;
        _ = Task.Run(async () =>
        {
            HdrOutcome r;
            try { r = await display.ToggleHdrAsync(id).ConfigureAwait(false); }
            catch { r = HdrOutcome.Failed; }
            Post(() =>
            {
                _toggling = false;
                switch (r)
                {
                    case HdrOutcome.DidNotTake: _flash?.Show("DIDN'T TAKE", alert: true); break;
                    case HdrOutcome.Failed: _flash?.Show("FAILED", alert: true); break;
                    case HdrOutcome.Unsupported: _flash?.Show("NO HDR HERE", alert: true); break;
                    case HdrOutcome.NoMonitor: _flash?.Show("NO DISPLAY", alert: true); break;
                }
                Render();
            });
        });
        Render();
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var m = _display?.Find(Settings.Monitor);
        var name = m?.ShortName ?? "MONITOR";
        HdrView view;
        var progress = 0.0;
        if (m is null) view = HdrView.NoMonitor;
        else if (_toggling || _display!.IsResyncing(m.Id))
        {
            view = HdrView.Resyncing;
            progress = Math.Clamp(Time.GetElapsedTime(_toggleStarted).TotalSeconds / DisplayService.HdrResync.TotalSeconds, 0, 1);
        }
        else if (!m.Hdr.Supported) view = HdrView.Unsupported;
        else view = m.Hdr.On ? HdrView.On : HdrView.Off;
        LastView = view;
        SetImage(DisplayArt.HdrKey(Theme, name, view, progress, _flash?.Text, _flash?.IsAlert ?? false));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("HDR")
        .Select("monitor", "Monitor", optionsFrom: "monitors.list")
        .Info("Note", "The monitor blanks for 1–2 s while it switches. The key always shows what Windows reports.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        Task.FromResult<object?>(type == "monitors.list" ? MonitorPicker.Options(_display, includeAll: false) : null);
}
