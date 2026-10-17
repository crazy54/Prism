using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Render;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Browser.Actions;

/// <summary>Undo for a tab the deck closed: sessions.restore when allowed, else re-create it by URL at its old place.</summary>
internal static class TabUndo
{
    public static readonly TimeSpan Window = TimeSpan.FromSeconds(5);

    public static Task<CommandResult> RestoreAsync(BrowserHub hub, string browserKey, BrowserTab tab)
    {
        var b = hub.Store.Current.Find(browserKey);
        if (b?.Caps.Sessions == true || hub.SafeMode) return hub.Commands.SendAsync(browserKey, Wire.Op.SessionRestore, new JsonObject());
        // LOW 24: windowId + index put it back where it was (the extension honors index since this fix).
        if (tab.Url is { } url) return hub.Commands.SendAsync(browserKey, Wire.Op.TabCreate, new JsonObject { ["url"] = url, ["windowId"] = tab.WindowId, ["index"] = tab.Index });
        return Task.FromResult(CommandResult.Fail(Wire.Err.NoPermission, "Allow Reopen closed tabs in the extension to undo."));
    }
}

public sealed class TabKeySettings : BrowserSettingsBase
{
    /// <summary>order | pinned | recent | audible.</summary>
    public string Slot { get; set; } = "order";
    /// <summary>1-based position within the slot kind.</summary>
    public int Index { get; set; } = 1;
    /// <summary>Bring the browser window to the front (off = switch tabs without raising, e.g. over a fullscreen game).</summary>
    public bool Raise { get; set; } = true;
    /// <summary>title | domain.</summary>
    public string Label { get; set; } = "title";
}

/// <summary>
/// A live tab slot key: favicon as-is, title (or domain when streamer-safe or the title can't be drawn), sound and unread
/// badge, lit when it is the active tab. Press = focus it and raise its window; hold (500 ms) = close it, then a press
/// within 5 s brings it back.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.tab", Name = "Browser Tab",
    Icon = "imgs/actions/browser/tab/icon", KeyImage = "imgs/actions/browser/tab/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "A live browser tab. Press to switch to it; hold to close it (press again within 5 s to undo).")]
public sealed class TabKeyAction : KeyAction<TabKeySettings>, IDisposable
{
    public static readonly TimeSpan UndoWindow = TabUndo.Window;

    private BrowserBinding? _b;
    private Flash _flash;
    private (string Browser, BrowserTab Tab, long At)? _closed;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Tabs | BrowserChange.Windows | BrowserChange.Groups | BrowserChange.Images, Render);
        DefaultPriority = UpdatePriority.Background;
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private (BrowserInstance? B, BrowserTab? Tab) Resolve()
    {
        var b = _b?.Target(Settings.Browser);
        return (b, b is null ? null : Selectors.Slot(b, Settings.Slot, Settings.Index));
    }

    private bool UndoActive => _closed is { } c && Time.GetElapsedTime(c.At) < UndoWindow;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.Hub is not { } hub) { ShowAlert(); return Task.CompletedTask; }
        if (UndoActive) return Track(UndoAsync(hub));
        var (b, tab) = Resolve();
        if (b is null || !b.Connected || tab is null)
        {
            ShowAlert();
            _flash.Set(Time, b is null || !b.Connected ? new Notice("NO BROWSER", Tone.Warn, "OPEN SETTINGS") : new Notice("NO TAB", Tone.Warn));
            Render();
            return Task.CompletedTask;
        }
        return Track(FocusAsync(hub, b.Key, tab.Id));
    }

    private async Task FocusAsync(BrowserHub hub, string key, int tabId)
    {
        var outcome = await hub.FocusTabAsync(key, tabId, Settings.Raise);
        Post(() =>
        {
            if (BrowserBinding.NoticeFor(outcome) is { } n)
            {
                if (outcome != FocusOutcome.SafeMode) ShowAlert();
                _flash.Set(Time, n);
            }
            Render();
        });
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (_b?.Hub is not { } hub) return Task.CompletedTask;
        var (b, tab) = Resolve();
        if (b is null || !b.Connected || tab is null) { ShowAlert(); return Task.CompletedTask; }
        _closed = (b.Key, tab, Time.GetTimestamp());
        Render();
        return Track(CloseAsync(hub, b.Key, tab.Id));
    }

    private async Task CloseAsync(BrowserHub hub, string key, int tabId)
    {
        var r = await hub.Commands.SendAsync(key, Wire.Op.TabClose, new JsonObject { ["tabId"] = tabId });
        Post(() =>
        {
            if (!r.Ok)
            {
                _closed = null;
                ShowAlert();
                _flash.Set(Time, BrowserBinding.NoticeFor(r, false));
            }
            else if (hub.SafeMode) _flash.Set(Time, new Notice("SAFE MODE", Tone.Warn, "NOT SENT"), TimeSpan.FromSeconds(1));
            Render();
        });
    }

    private async Task UndoAsync(BrowserHub hub)
    {
        var (key, tab, _) = _closed!.Value;
        _closed = null;
        var r = await TabUndo.RestoreAsync(hub, key, tab);
        Post(() =>
        {
            if (!r.Ok)
            {
                ShowAlert();
                _flash.Set(Time, r.Code == Wire.Err.NoPermission ? new Notice("CAN'T UNDO", Tone.Warn, "ALLOW REOPEN") : BrowserBinding.NoticeFor(r, false));
            }
            Render();
        });
    }

    private Task Track(Task t)
    {
        lock (_pending) { _pending.RemoveAll(x => x.IsCompleted); _pending.Add(t); }
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(TabKeySettings settings) { Render(); return Task.CompletedTask; }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        if (UndoActive)
        {
            var left = (int)Math.Ceiling((UndoWindow - Time.GetElapsedTime(_closed!.Value.At)).TotalSeconds);
            SetImage(BrowserArt.UndoKey(t, left));
            return;
        }
        _closed = null;
        var (b, tab) = Resolve();
        if (_b.ProblemFor(b) is { } p && !(b is { Connected: false } && tab is not null))
        {
            SetImage(BrowserArt.MessageKey(t, p.Glyph, p.KeyLine1, p.KeyLine2, p.Tone));
            return;
        }
        if (b is null || tab is null)
        {
            SetImage(BrowserArt.GlyphKey(t, BrowserGlyphs.Tab, $"TAB {Settings.Index.ToString(CultureInfo.InvariantCulture)}", enabled: false, micro: SlotWord(Settings.Slot)));
            return;
        }
        var group = tab.Group >= 0 && b.Groups.TryGetValue(tab.Group, out var g) ? g.Color : null;
        var label = Selectors.Label(tab, Settings.Label == "domain", $"TAB {Settings.Index}");
        var notice = _flash.Get(Time) ?? (b.Connected ? null : new Notice("RECONNECTING", Tone.Warn));
        SetImage(BrowserArt.TabKey(t, new TabKeyView(Selectors.Image(_b.Hub, b.Key, tab.Icon), label, tab.Unread, tab.Audible, tab.Muted,
            tab.Active && b.FocusedWindowId == tab.WindowId, group, !b.Connected, notice)));
    }

    private static string SlotWord(string slot) => slot switch { "pinned" => "PINNED", "recent" => "RECENT", "audible" => "PLAYING", _ => "EMPTY" };

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Tab")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Select("slot", "Which tab", [("order", "Nth tab in the window"), ("pinned", "Nth pinned tab"), ("recent", "Nth most recent tab"), ("audible", "Nth tab playing sound")])
        .Number("index", "N", 1, 50, 1)
        .Select("label", "Show", [("title", "Title (domain when streamer-safe)"), ("domain", "Domain only")])
        .Checkbox("raise", "Bring the browser to the front");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();

    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}

public sealed class TabsDialSettings : BrowserSettingsBase
{
    /// <summary>window (the current window) | all (every window).</summary>
    public string Scope { get; set; } = "window";
    public bool Raise { get; set; } = true;
}

/// <summary>
/// The tab browser dial (Galleon widget / Stream Deck + segment): turn to browse the tabs (±12-tick Galleon spins
/// accelerate), push to switch to the highlighted tab. Row 0 switches between this window and every window.
/// Stream Deck + extras: tap = switch, touch-hold or dial hold = close the highlighted tab. After 15 s without input
/// the highlight returns to the active tab.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.tabs", Name = "Tab Browser",
    Icon = "imgs/actions/browser/tabs/icon", KeyImage = "imgs/actions/browser/tabs/key", EncoderIcon = "imgs/actions/browser/tabs/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Turn to browse your tabs, push to switch to one.",
    TriggerRotate = "Browse tabs", TriggerPush = "Switch to tab", TriggerTouch = "Switch to tab", TriggerLongTouch = "Close tab")]
public sealed class TabsDialAction : DialAction<TabsDialSettings>, IDisposable
{
    public static readonly TimeSpan IdleReturn = TimeSpan.FromSeconds(15);

    private BrowserBinding? _b;
    private readonly TurnAccel _accel = new();
    private Flash _flash;
    private int? _highlightTab;   // tab id; null = row 0 (scope switch) or follow the active tab
    private bool _onScopeRow;
    private long _lastInput;
    private RenderLoop? _loop;
    private (string Browser, BrowserTab Tab, long At)? _closed;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    /// <summary>LOW 23: a dial/touch hold closes the highlighted tab; a push or tap within 5 s brings it back.</summary>
    private bool UndoActive => _closed is { } c && Time.GetElapsedTime(c.At) < TabUndo.Window;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Tabs | BrowserChange.Windows | BrowserChange.Images, () => _loop?.Invalidate());
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Browse tabs", "Switch to tab", "Switch to tab", "Close tab");
        else SetTriggerDescription("Browse tabs", "Switch to tab");
        _loop = StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(33));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private List<BrowserTab> Tabs(BrowserInstance b) =>
        Settings.Scope == "all" ? [.. b.AllTabsOrdered()] : b.CurrentWindowId is { } w ? [.. b.TabsInWindow(w)] : [];

    /// <summary>Rows: 0 = scope switch, 1.. = tabs. Returns the highlighted row index.</summary>
    private int HighlightRow(BrowserInstance b, List<BrowserTab> tabs)
    {
        if (_onScopeRow) return 0;
        if (_highlightTab is { } id && Time.GetElapsedTime(_lastInput) < IdleReturn)
        {
            var i = tabs.FindIndex(t => t.Id == id);
            if (i >= 0) return i + 1;
        }
        var active = b.ActiveTab();
        var ai = active is null ? -1 : tabs.FindIndex(t => t.Id == active.Id);
        return ai >= 0 ? ai + 1 : (tabs.Count > 0 ? 1 : 0);
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        _lastInput = Time.GetTimestamp();
        var b = _b?.Target(Settings.Browser);
        if (b is null || !b.Connected) { Render(); return Task.CompletedTask; }
        var tabs = Tabs(b);
        var row = HighlightRow(b, tabs);
        var next = Math.Clamp(row + _accel.Rows(e.Ticks, this, Time), 0, tabs.Count);
        _onScopeRow = next == 0;
        _highlightTab = next == 0 ? null : tabs[next - 1].Id;
        _flash.Clear();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => Activate();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => e.Hold ? CloseHighlighted() : Activate();
    protected override Task OnDialLongPressAsync(DialDownEvent e) => CloseHighlighted();

    private Task Activate()
    {
        _lastInput = Time.GetTimestamp();
        if (_b?.Hub is not { } hub) { ShowAlert(); return Task.CompletedTask; }
        if (UndoActive)
        {
            var (key, closedTab, _) = _closed!.Value;
            _closed = null;
            lock (_pending)
            {
                _pending.Add(Task.Run(async () =>
                {
                    var r = await TabUndo.RestoreAsync(hub, key, closedTab);
                    Post(() =>
                    {
                        _flash.Set(Time, r.Ok
                            ? (hub.SafeMode ? new Notice("Safe mode: nothing was sent", Tone.Warn) : new Notice("Tab reopened", Tone.Good))
                            : r.Code == Wire.Err.NoPermission ? new Notice("Can't undo: allow Reopen closed tabs", Tone.Warn) : BrowserBinding.DialNoticeFor(r, false), TimeSpan.FromSeconds(1.5));
                        _loop?.Invalidate();
                    });
                }));
            }
            return Task.CompletedTask;
        }
        var b = _b.Target(Settings.Browser);
        if (b is null || !b.Connected) { ShowAlert(); return Task.CompletedTask; }
        var tabs = Tabs(b);
        var row = HighlightRow(b, tabs);
        if (row == 0)
        {
            Settings.Scope = Settings.Scope == "all" ? "window" : "all";
            SaveSettings();
            _onScopeRow = true;
            _loop?.Invalidate();
            return Task.CompletedTask;
        }
        var tab = tabs[row - 1];
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var outcome = await hub.FocusTabAsync(b.Key, tab.Id, Settings.Raise);
                Post(() =>
                {
                    if (BrowserBinding.DialNoticeFor(outcome) is { } n) _flash.Set(Time, n);
                    _highlightTab = null;   // follow the (new) active tab
                    _loop?.Invalidate();
                });
            }));
        }
        return Task.CompletedTask;
    }

    private Task CloseHighlighted()
    {
        _lastInput = Time.GetTimestamp();
        if (_b?.Hub is not { } hub) return Task.CompletedTask;
        var b = _b.Target(Settings.Browser);
        if (b is null || !b.Connected) return Task.CompletedTask;
        var tabs = Tabs(b);
        var row = HighlightRow(b, tabs);
        if (row == 0) return Task.CompletedTask;
        var tab = tabs[row - 1];
        var key = b.Key;
        _closed = (key, tab, Time.GetTimestamp());
        _highlightTab = null;
        _loop?.Invalidate();
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var r = await hub.Commands.SendAsync(key, Wire.Op.TabClose, new JsonObject { ["tabId"] = tab.Id });
                Post(() =>
                {
                    if (!r.Ok)
                    {
                        _closed = null;
                        _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false), TimeSpan.FromSeconds(1.5));
                    }
                    _loop?.Invalidate();
                });
            }));
        }
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(TabsDialSettings settings) { _loop?.Invalidate(); return Task.CompletedTask; }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        var b = _b.Target(Settings.Browser);
        if (_b.ProblemFor(b) is { } p)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, p.Glyph, "Tabs", p.DialLine1, p.DialLine2, IsInteractive, p.Tone)));
            return;
        }
        if (_onScopeRow && Time.GetElapsedTime(_lastInput) >= IdleReturn) _onScopeRow = false;
        var tabs = Tabs(b!);
        var row = HighlightRow(b!, tabs);
        var all = Settings.Scope == "all";
        var windows = b!.Windows.Count;
        var rows = new List<TabRow>
        {
            new(null, all ? "Show this window only" : windows > 1 ? $"Show all {windows} windows" : "Show all windows", "Push to switch the list", false, false, false, null, IsCommand: true),
        };
        foreach (var tab in tabs)
        {
            var meta = Selectors.StripWww(tab.Domain ?? "");
            if (tab.Pinned) meta = meta.Length == 0 ? "Pinned" : meta + " · Pinned";
            rows.Add(new TabRow(Selectors.Image(_b.Hub, b.Key, tab.Icon), Selectors.Label(tab, false, "Tab"), meta.Length == 0 ? null : meta,
                tab.Active, tab.Audible, tab.Muted, tab.Unread));
        }
        var caption = $"{b.Brand} · {(all ? "all windows" : "this window")}";
        var position = row == 0 ? $"{tabs.Count} tabs" : $"{row}/{tabs.Count}";
        Notice? undo = null;
        if (UndoActive)
        {
            var left = (int)Math.Ceiling((TabUndo.Window - Time.GetElapsedTime(_closed!.Value.At)).TotalSeconds);
            undo = new Notice($"Closed · push to undo ({left.ToString(CultureInfo.InvariantCulture)} s)", Tone.Warn);
        }
        else _closed = null;
        var notice = _flash.Get(Time) ?? undo ?? (_b.SafeMode && IsInteractive ? new Notice("Safe mode: nothing is sent", Tone.Warn) : null);
        var view = new TabsDialView(caption, position, rows, row, rows.Count <= 1 ? 0 : (double)row / (rows.Count - 1), notice);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.TabsDial(t, view, IsInteractive)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Tab browser")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Select("scope", "List", [("window", "Tabs of the current window"), ("all", "Tabs of every window")])
        .Checkbox("raise", "Bring the browser to the front")
        .Info("How to use", "Turn to browse, push to switch to the highlighted tab. The first row switches between this window and every window. Stream Deck +: tap to switch, hold to close.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}
