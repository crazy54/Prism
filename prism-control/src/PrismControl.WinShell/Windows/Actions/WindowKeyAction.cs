using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;
using PrismControl.Desktop;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

public sealed class WindowKeySettings
{
    /// <summary>"zorder" (Alt+Tab order), "recent" (most recently activated) or "pinned" (always one app).</summary>
    public string Mode { get; set; } = "zorder";
    /// <summary>1-based slot (for pinned: which of that app's windows).</summary>
    public int Slot { get; set; } = 1;
    /// <summary>Pinned mode: the app's exe name, e.g. "Discord.exe".</summary>
    public string App { get; set; } = "";
    /// <summary>False = this key shows the app icon only (no capture).</summary>
    public bool Live { get; set; } = true;
}

/// <summary>
/// Flagship 1: one of your open windows, live (Windows.Graphics.Capture, borderless, ≤ 2 fps), with the app icon badge
/// and the title (the app name in streamer-safe mode). Press = bring it to the front through Desktop's foreground helper,
/// restoring it if minimized (minimized windows show their icon and "MINIMIZED"). Admin windows carry an ADMIN badge.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.window",
    Name = "Live Window",
    Controllers = Controllers.Keypad,
    Tooltip = "One of your open windows, live. Press to bring it to the front.",
    Icon = "imgs/actions/windows/window/icon",
    KeyImage = "imgs/actions/windows/window/key")]
public sealed class WindowKeyAction : KeyAction<WindowKeySettings>
{
    private WindowList? _list;
    private ThumbnailService? _thumbs;
    private PlatformServices? _platform;
    private WinShellOptions _options = new();
    private WindowInfo? _win;
    private IThumbnailLease? _lease;
    private byte[]? _icon;
    private string? _iconKey;
    private Flash? _flash;
    private Action? _onList, _onOptions, _onFrame;

    internal WindowInfo? Current => _win;
    internal IThumbnailLease? Lease => _lease;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { _shown = null; if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Refresh(); return Task.CompletedTask; }
        _started = true;
        DefaultPriority = UpdatePriority.Background;
        _list = Services.Find<WindowList>();
        _thumbs = Services.Find<ThumbnailService>();
        _platform = Services.Find<PlatformServices>();
        _options = WinShellOptions.From(Services);
        _flash = new Flash(this, Time, Render);
        _onList = () => Post(Refresh);
        _onOptions = () => Post(() => { DropLease(); Refresh(); });
        _onFrame = () => Post(Render);
        if (_list is not null) _list.Changed += _onList;
        _options.Changed += _onOptions;
        StartRenderLoop(Refresh, TimeSpan.FromSeconds(1));
        Refresh();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_list is not null && _onList is not null) _list.Changed -= _onList;
        if (_onOptions is not null) _options.Changed -= _onOptions;
        DropLease();
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(WindowKeySettings settings)
    {
        DropLease();
        _win = null;
        Refresh();
        return Task.CompletedTask;
    }

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_platform is null) return;
        if (_win is null)
        {
            _flash?.Show(WindowSlots.ParseMode(Settings.Mode) == SlotMode.Pinned ? "NOT RUNNING" : "NO WINDOW", alert: true);
            return;
        }
        var r = await _platform.Foreground.BringToFrontAsync(_win.Hwnd).ConfigureAwait(false);
        switch (r)
        {
            case ForegroundResult.Refused: _flash?.Show("CAN'T FOCUS", alert: true); break;
            case ForegroundResult.Elevated: _flash?.Show("ADMIN APP", alert: true); break;
            case ForegroundResult.NoWindow: _flash?.Show("CLOSED", alert: true); break;
            case ForegroundResult.SafeMode: _flash?.Show("SAFE MODE"); break;
        }
        _list?.Invalidate();
        Refresh();
    }

    private void Refresh()
    {
        if (!IsVisible) return;
        var mode = WindowSlots.ParseMode(Settings.Mode);
        WindowInfo? w = null;
        if (_list is not null)
        {
            var z = _list.Current();
            var recent = mode == SlotMode.ZOrder ? z : _list.MostRecent();
            w = WindowSlots.Pick(mode, Math.Clamp(Settings.Slot, 1, 50), Settings.App, z, recent);
        }
        if (w?.Hwnd != _win?.Hwnd) DropLease();
        _win = w;
        if (w is not null && _lease is null && Settings.Live && _thumbs is not null)
        {
            _lease = _thumbs.ForKey(w.Hwnd);
            if (_onFrame is not null) _lease.Updated += _onFrame;
        }
        if (w is not null && _platform is not null)
        {
            var key = (w.ExePath ?? w.ProcessName) + "|" + w.AppUserModelId;
            if (key != _iconKey)
            {
                _iconKey = key;
                _icon = null;
                _ = LoadIconAsync(w, key);
            }
        }
        Render();
    }

    private async Task LoadIconAsync(WindowInfo w, string key)
    {
        try
        {
            var png = await _platform!.Icons.GetAppIconPngAsync(w, 64).ConfigureAwait(false);
            Post(() =>
            {
                if (_iconKey != key) return;
                _icon = png;
                Render();
            });
        }
        catch { /* no icon: the glyph stands in */ }
    }

    private void DropLease()
    {
        if (_lease is null) return;
        if (_onFrame is not null) _lease.Updated -= _onFrame;
        _lease.Dispose();
        _lease = null;
    }

    internal WindowKeyModel Model()
    {
        var mode = WindowSlots.ParseMode(Settings.Mode);
        if (_list is null) return new WindowKeyModel { Empty = true, EmptyLabel = "UNAVAILABLE", Slot = Settings.Slot };
        if (_win is not { } w)
        {
            var pinned = mode == SlotMode.Pinned;
            return new WindowKeyModel
            {
                Empty = true,
                Slot = Settings.Slot,
                EmptyLabel = pinned ? (string.IsNullOrWhiteSpace(Settings.App) ? "PICK AN APP" : "NOT RUNNING") : "NO WINDOW",
                Caption = pinned && !string.IsNullOrWhiteSpace(Settings.App) ? WindowSlots.AppName(Settings.App) : null,
                Flash = _flash?.Text,
                FlashAlert = _flash?.IsAlert ?? false,
            };
        }
        var app = AppNames.For(w.ProcessName, w.ExePath);
        var caption = _options.StreamerSafe || string.IsNullOrWhiteSpace(w.Title) ? app : w.Title;
        return new WindowKeyModel
        {
            Caption = caption,
            AppName = app,
            Thumbnail = _lease?.Latest,
            Icon = _icon,
            Minimized = w.IsMinimized,
            Elevated = w.IsElevated,
            Foreground = _list.Foreground == w.Hwnd,
            Flash = _flash?.Text,
            FlashAlert = _flash?.IsAlert ?? false,
            Slot = Settings.Slot,
        };
    }

    private WindowKeyModel? _shown;
    private string? _shownTheme;

    private void Render()
    {
        if (!IsVisible) return;
        var m = Model();
        // The 1 s refresh mostly finds nothing new: skip building (and base64-encoding) an identical frame.
        if (m == _shown && Theme.Name == _shownTheme) return;
        _shown = m;
        _shownTheme = Theme.Name;
        SetImage(WindowArt.Key(Theme, m));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Window")
        .Select("mode", "Which window", [("zorder", "Alt+Tab order"), ("recent", "Most recently used"), ("pinned", "Always one app")])
        .Number("slot", "Position", 1, 20, 1)
        .Select("app", "App (pinned)", optionsFrom: "apps.list")
        .Checkbox("live", "Live thumbnail")
        .Heading("All window keys")
        .Checkbox(PiForm.Global(WinShellOptions.Section, "streamerSafe"), "Streamer-safe (app names, no titles)")
        .Checkbox(PiForm.Global(WinShellOptions.Section, "liveThumbnails"), "Live thumbnails")
        .Info("Privacy", "Thumbnails stay in memory: nothing is saved or logged.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data)
    {
        if (type != "apps.list" || _list is null) return Task.FromResult<object?>(null);
        var apps = _list.MostRecent()
            .GroupBy(w => w.ProcessName, StringComparer.OrdinalIgnoreCase)
            .Select(g => new { value = g.Key, label = AppNames.For(g.Key, g.First().ExePath) })
            .OrderBy(a => a.label, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return Task.FromResult<object?>(apps);
    }
}
