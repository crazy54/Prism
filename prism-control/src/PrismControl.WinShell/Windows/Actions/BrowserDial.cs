using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Desktop;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

public sealed class BrowserSettings
{
    /// <summary>"zorder" or "recent".</summary>
    public string Order { get; set; } = "recent";
}

/// <summary>
/// Flagship 1, the widget: a window browser. Turn to browse your open windows with a big live preview (the one focused
/// widget: ≤ 10 fps while you browse, 2 fps idle), push to bring the selected window to the front. Stream Deck + touch
/// does the same as push. When idle for 10 s the selection follows the window in front again.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.windows.browser",
    Name = "Window Browser",
    Controllers = Controllers.Encoder,
    Tooltip = "Turn to browse your open windows with a live preview; push to bring one to the front.",
    Icon = "imgs/actions/windows/browser/icon",
    KeyImage = "imgs/actions/windows/browser/key",
    EncoderIcon = "imgs/actions/windows/browser/dial",
    Layout = Layouts.Canvas.Path,
    TriggerRotate = "Browse windows",
    TriggerPush = "Bring to front",
    TriggerTouch = "Bring to front")]
public sealed class BrowserDial : DialAction<BrowserSettings>
{
    public static readonly TimeSpan IdleFollow = TimeSpan.FromSeconds(10);

    private WindowList? _list;
    private ThumbnailService? _thumbs;
    private PlatformServices? _platform;
    private WinShellOptions _options = new();
    private IReadOnlyList<WindowInfo> _items = [];
    private nint _selected;
    private IThumbnailLease? _lease;
    private readonly Dictionary<string, byte[]?> _icons = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _loading = new(StringComparer.OrdinalIgnoreCase);
    private Flash? _flash;
    private long _lastInput;
    private bool _focused;
    private Action? _onList, _onFrame, _onOptions;

    internal nint Selected => _selected;
    internal IThumbnailLease? Lease => _lease;
    internal bool IsFocusedWidget => _focused;

    private bool _started;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // A repeated willAppear (re-registration) only re-draws: subscriptions, loops and helpers are set up once.
        if (_started) { _shown = null; if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path); Refresh(); return Task.CompletedTask; }
        _started = true;
        _list = Services.Find<WindowList>();
        _thumbs = Services.Find<ThumbnailService>();
        _platform = Services.Find<PlatformServices>();
        _options = WinShellOptions.From(Services);
        _flash = new Flash(this, Time, Render);
        _onList = () => Post(Refresh);
        _onFrame = () => Post(Render);
        _onOptions = () => Post(() => { DropLease(); Refresh(); });
        if (_list is not null) _list.Changed += _onList;
        _options.Changed += _onOptions;
        SetFeedbackLayout(Layouts.Canvas.Path);
        StartRenderLoop(Tick, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(500));
        Refresh();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_list is not null && _onList is not null) _list.Changed -= _onList;
        if (_onOptions is not null) _options.Changed -= _onOptions;
        Unfocus();
        DropLease();
        _flash?.Dispose();
        return Task.CompletedTask;
    }

    private bool Idle => _lastInput == 0 || Time.GetElapsedTime(_lastInput) > IdleFollow;

    private void Tick()
    {
        if (_focused && Idle) Unfocus();
        Refresh();
    }

    private void Refresh()
    {
        if (!IsVisible) return;
        if (_list is null) { Render(); return; }
        _items = string.Equals(Settings.Order, "zorder", StringComparison.OrdinalIgnoreCase) ? _list.Current() : _list.MostRecent();
        var fg = _list.Foreground;
        if (Idle && _items.Any(w => w.Hwnd == fg)) _selected = fg;
        if (_items.All(w => w.Hwnd != _selected)) _selected = _items.Count > 0 ? _items[0].Hwnd : 0;
        Attach();
        Render();
    }

    private void Attach()
    {
        if (_lease?.Hwnd == _selected) return;
        DropLease();
        if (_selected == 0 || _thumbs is null) return;
        _lease = _thumbs.ForWidget(_selected);
        if (_onFrame is not null) _lease.Updated += _onFrame;
        if (_focused) _thumbs.Focus(_lease);
    }

    private void DropLease()
    {
        if (_lease is null) return;
        if (_onFrame is not null) _lease.Updated -= _onFrame;
        _lease.Dispose();
        _lease = null;
    }

    private void FocusWidget()
    {
        _lastInput = Time.GetTimestamp();
        _focused = true;
        _thumbs?.Focus(_lease);
    }

    private void Unfocus()
    {
        if (!_focused) return;
        _focused = false;
        if (_lease is not null && _thumbs?.IsFocused(_lease) == true) _thumbs.Focus(null);
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (_items.Count == 0 || e.Ticks == 0) { Refresh(); return Task.CompletedTask; }
        var i = Math.Max(0, IndexOfSelected());
        // Galleon spins arrive as up to ±12 ticks: treat them as a magnitude, clamp to the list (no wrap).
        var next = Math.Clamp(i + e.Ticks, 0, _items.Count - 1);
        _selected = _items[next].Hwnd;
        _flash?.Clear();
        FocusWidget();
        Attach();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => BringToFrontAsync();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => BringToFrontAsync();

    private async Task BringToFrontAsync()
    {
        FocusWidget();
        if (_platform is null || _selected == 0) { _flash?.Show("NO WINDOW", alert: true); return; }
        var r = await _platform.Foreground.BringToFrontAsync(_selected).ConfigureAwait(false);
        switch (r)
        {
            case ForegroundResult.Focused or ForegroundResult.Restored or ForegroundResult.AlreadyFocused: _flash?.Show("IN FRONT"); break;
            case ForegroundResult.Elevated: _flash?.Show("ADMIN APP", alert: true); break;
            case ForegroundResult.Refused: _flash?.Show("CAN'T FOCUS", alert: true); break;
            case ForegroundResult.NoWindow: _flash?.Show("CLOSED", alert: true); break;
            case ForegroundResult.SafeMode: _flash?.Show("SAFE MODE"); break;
        }
        _list?.Invalidate();
        Refresh();
    }

    private int IndexOfSelected()
    {
        for (var i = 0; i < _items.Count; i++) if (_items[i].Hwnd == _selected) return i;
        return -1;
    }

    private byte[]? IconFor(WindowInfo w)
    {
        var key = w.ExePath ?? w.ProcessName;
        if (_icons.TryGetValue(key, out var png)) return png;
        if (_platform is not null && _loading.Add(key))
        {
            _ = Task.Run(async () =>
            {
                byte[]? icon = null;
                try { icon = await _platform.Icons.GetAppIconPngAsync(w, 64).ConfigureAwait(false); }
                catch { /* the glyph stands in */ }
                Post(() => { _icons[key] = icon; _loading.Remove(key); Render(); });
            });
        }
        return null;
    }

    internal BrowserModel Model()
    {
        if (_list is null) return new BrowserModel { Unavailable = true };
        var i = IndexOfSelected();
        if (i < 0) return new BrowserModel { Count = 0, Active = IsInteractive };
        var w = _items[i];
        var app = AppNames.For(w.ProcessName, w.ExePath);
        return new BrowserModel
        {
            Index = i,
            Count = _items.Count,
            AppName = app,
            Title = _options.StreamerSafe || string.IsNullOrWhiteSpace(w.Title) ? null : w.Title,
            Thumbnail = _lease?.Latest,
            Icon = IconFor(w),
            Minimized = w.IsMinimized,
            Elevated = w.IsElevated,
            Foreground = _list.Foreground == w.Hwnd,
            Active = IsInteractive,
            Flash = _flash?.Text,
            FlashAlert = _flash?.IsAlert ?? false,
        };
    }

    private BrowserModel? _shown;
    private string? _shownTheme;

    private void Render()
    {
        if (!IsVisible) return;
        var m = Model();
        if (m == _shown && Theme.Name == _shownTheme) return;
        _shown = m;
        _shownTheme = Theme.Name;
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, WindowArt.Browser(Theme, m)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Window browser")
        .Select("order", "Order", [("recent", "Most recently used"), ("zorder", "Alt+Tab order")])
        .Checkbox(PiForm.Global(WinShellOptions.Section, "streamerSafe"), "Streamer-safe (app names, no titles)")
        .Info("How", "Turn to browse, push to bring the window to the front. The preview runs at up to 10 fps while you browse.");
}
