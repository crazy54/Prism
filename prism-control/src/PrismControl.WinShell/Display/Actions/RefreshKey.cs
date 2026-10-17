using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

public sealed class RefreshSettings
{
    public string Monitor { get; set; } = "";
    /// <summary>Preset A in Hz (0 = the monitor's highest rate at its current resolution).</summary>
    public int RateA { get; set; }
    /// <summary>Preset B in Hz (0 = 120 if available, else the next rate below A).</summary>
    public int RateB { get; set; }
}

/// <summary>
/// Flagship 3: refresh-rate presets (e.g. 240 ⇄ 120). A press asks the driver first (CDS_TEST), applies the other preset
/// without saving it, and shows "KEEP? 15": press again within 15 s to keep it, or it reverts by itself (spec principle 4;
/// the revert timer lives in the display service, so it fires even if this key disappears). Mode lists are cached.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.refresh",
    Name = "Refresh Rate",
    Controllers = Controllers.Keypad,
    Tooltip = "Switches between two refresh rates. Press again within 15 s to keep the new rate; otherwise it reverts.",
    Icon = "imgs/actions/windows/refresh/icon",
    KeyImage = "imgs/actions/windows/refresh/key")]
public sealed class RefreshKey : KeyAction<RefreshSettings>
{
    private DisplayService? _display;
    private Flash? _flash;
    private Action? _onChanged;
    private bool _busy;
    private string? _pendingFor;
    private Task _work = Task.CompletedTask;

    internal bool Busy => _busy;
    /// <summary>The last press's off-mailbox work; it ends after posting its outcome (tests await it instead of moving the clock).</summary>
    internal Task Work => _work;
    internal int? LastSeconds { get; private set; }
    internal int? LastHz { get; private set; }
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
        if (_display is not null)
        {
            _display.Changed += _onChanged;
            if (_display.Find(Settings.Monitor) is { } m) _ = _display.ModesAsync(m).ContinueWith(_ => Post(Render), TaskScheduler.Default);
        }
        StartRenderLoop(Render, TimeSpan.FromMilliseconds(500));
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_display is not null && _onChanged is not null) _display.Changed -= _onChanged;
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(RefreshSettings settings) { Render(); return Task.CompletedTask; }

    /// <summary>The two presets for this monitor, resolved against its cached mode list.</summary>
    internal (int A, int B)? Presets(MonitorInfo m)
    {
        if (_display?.CachedModes(m) is not { } modes || m.Mode is not { } cur) return null;
        var rates = DisplayService.RatesAtResolution(modes, cur);
        if (rates.Count == 0) return null;
        var a = Settings.RateA > 0 ? Settings.RateA : rates[0];
        var b = Settings.RateB > 0 ? Settings.RateB : rates.Contains(120) && a != 120 ? 120 : rates.FirstOrDefault(r => r < a, rates.Last());
        return (a, b);
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_display is not { } display || _busy) return Task.CompletedTask;
        var m = display.Find(Settings.Monitor);
        if (m is null) { _flash?.Show("NO DISPLAY", alert: true); return Task.CompletedTask; }
        if (display.Pending(m.Id) is not null)
        {
            // KEEP: saving runs ChangeDisplaySettingsEx, so it goes off the mailbox; the outcome comes back by Post.
            _busy = true;
            var keepId = m.Id;
            _work = Task.Run(async () =>
            {
                bool? ok;
                try { ok = await display.KeepAsync(keepId).ConfigureAwait(false); }
                catch { ok = false; }
                Post(() =>
                {
                    _busy = false;
                    if (ok == true) _flash?.Show("KEPT");
                    else if (ok == false) _flash?.Show("NOT SAVED", alert: true);
                    Render();
                });
            });
            return Task.CompletedTask;
        }
        if (Presets(m) is not { } p) { _flash?.Show("READING MODES"); _ = display.ModesAsync(m); return Task.CompletedTask; }
        var target = m.Mode?.Hz == p.A ? p.B : p.A;
        _busy = true;
        var id = m.Id;
        _work = Task.Run(async () =>
        {
            ModeOutcome r;
            try { r = await display.ChangeRefreshAsync(id, target).ConfigureAwait(false); }
            catch { r = ModeOutcome.Failed; }
            Post(() =>
            {
                _busy = false;
                switch (r)
                {
                    case ModeOutcome.Pending: _pendingFor = id; break;
                    case ModeOutcome.Unsupported: _flash?.Show($"NO {target} HZ HERE", alert: true); break;
                    case ModeOutcome.Rejected: _flash?.Show("DRIVER SAID NO", alert: true); break;
                    case ModeOutcome.Failed: _flash?.Show("FAILED", alert: true); break;
                    case ModeOutcome.AlreadySet: _flash?.Show($"ALREADY {target} HZ"); break;
                    case ModeOutcome.Busy: _flash?.Show("WAITING FOR KEEP"); break;
                    case ModeOutcome.NoMonitor: _flash?.Show("NO DISPLAY", alert: true); break;
                }
                Render();
            });
        });
        return Task.CompletedTask;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var m = _display?.Find(Settings.Monitor);
        if (m is null) { SetImage(DisplayArt.RefreshKey(Theme, "MONITOR", null, null, null, _flash?.Text ?? "NO DISPLAY", true)); return; }
        var pending = _display!.Pending(m.Id);
        if (pending is null && _pendingFor == m.Id && !_busy)
        {
            // It ended. The display service knows how, whichever key or deck ended it.
            _pendingFor = null;
            switch (_display.LastEnd(m.Id)?.Kind)
            {
                case ModeEnd.Reverted: _flash?.Show("REVERTED"); break;
                case ModeEnd.Kept when _flash?.Text is null: _flash?.Show("KEPT"); break;
                case ModeEnd.NotSaved when _flash?.Text is null: _flash?.Show("NOT SAVED", alert: true); break;
            }
        }
        if (pending is not null) _pendingFor = m.Id;
        var p = Presets(m);
        int? next = p is { } pr ? (m.Mode?.Hz == pr.A ? pr.B : pr.A) : null;
        int? secs = pending is null ? null : Math.Max(1, (int)Math.Ceiling(_display.Remaining(pending).TotalSeconds));
        LastSeconds = secs;
        LastHz = m.Mode?.Hz;
        SetImage(DisplayArt.RefreshKey(Theme, m.ShortName, m.Mode?.Hz, next, secs, _flash?.Text, _flash?.IsAlert ?? false));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Refresh rate presets")
        .Select("monitor", "Monitor", optionsFrom: "monitors.list")
        .Select("rateA", "Preset A", optionsFrom: "rates.list")
        .Select("rateB", "Preset B", optionsFrom: "rates.list")
        .Info("Safety", "After a switch the key shows KEEP? with a 15 s countdown. Press to keep; otherwise the old rate comes back by itself.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (_display is null) return null;
        if (type == "monitors.list") return MonitorPicker.Options(_display, includeAll: false);
        if (type != "rates.list") return null;
        var m = _display.Find(Settings.Monitor);
        if (m?.Mode is not { } cur) return new[] { new { value = "0", label = "Automatic" } };
        var modes = await _display.ModesAsync(m).ConfigureAwait(false);
        var list = new List<object> { new { value = "0", label = "Automatic" } };
        list.AddRange(DisplayService.RatesAtResolution(modes, cur).Select(r => (object)new { value = r.ToString(System.Globalization.CultureInfo.InvariantCulture), label = $"{r} Hz" }));
        return list;
    }
}
