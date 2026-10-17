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

/// <summary>Shared plumbing for simple keys: a binding, a flash, background work that reports back through Post.</summary>
public abstract class BrowserKeyBase<TSettings> : KeyAction<TSettings>, IDisposable where TSettings : BrowserSettingsBase, new()
{
    private protected BrowserBinding? B;
    private protected Flash FlashState;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    /// <summary>What store changes re-render this key.</summary>
    private protected abstract BrowserChange Watches { get; }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        B?.Dispose();
        B = BrowserBinding.Attach(this, Services, Watches, Render);
        DefaultPriority = UpdatePriority.Background;
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    protected override Task OnSettingsChangedAsync(TSettings settings) { Render(); return Task.CompletedTask; }

    /// <summary>The connected target browser, or null after flashing why not.</summary>
    private protected BrowserInstance? Connected(out BrowserHub hub)
    {
        hub = B?.Hub!;
        var b = B?.Target(Settings.Browser);
        if (hub is null || b is not { Connected: true })
        {
            ShowAlert();
            FlashState.Set(Time, new Notice("NO BROWSER", Tone.Warn, "OPEN SETTINGS"));
            Render();
            return null;
        }
        return b;
    }

    /// <summary>Sends one command off the mailbox; failures (and safe mode) flash on the key.</summary>
    private protected void Send(BrowserHub hub, string browserKey, string op, JsonObject args, Func<CommandResult, Notice?>? onOk = null)
    {
        var task = Task.Run(async () =>
        {
            var r = await hub.Commands.SendAsync(browserKey, op, args);
            Post(() =>
            {
                if (!r.Ok)
                {
                    ShowAlert();
                    FlashState.Set(Time, BrowserBinding.NoticeFor(r, false));
                }
                else if (hub.SafeMode) FlashState.Set(Time, new Notice("SAFE MODE", Tone.Warn, "NOT SENT"), TimeSpan.FromSeconds(1.2));
                else if (onOk?.Invoke(r) is { } n) FlashState.Set(Time, n);
                Render();
            });
        });
        lock (_pending) { _pending.RemoveAll(x => x.IsCompleted); _pending.Add(task); }
    }

    private protected void Track(Task t) { lock (_pending) { _pending.RemoveAll(x => x.IsCompleted); _pending.Add(t); } }

    /// <summary>The problem face (no browser, reconnecting, unavailable), drawn; true when drawn.</summary>
    private protected bool DrawProblem(BrowserInstance? b)
    {
        if (B?.ProblemFor(b) is not { } p) return false;
        SetImage(BrowserArt.MessageKey(Theme, p.Glyph, p.KeyLine1, p.KeyLine2, p.Tone));
        return true;
    }

    internal abstract void Render();

    protected override PiForm? DescribeForm() => new PiForm()
        .Select("browser", "Browser", optionsFrom: "browser.list");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        B is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => B?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { B?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { B?.Dispose(); B = null; }
}

public sealed class NavKeySettings : BrowserSettingsBase
{
    /// <summary>back | forward | reload.</summary>
    public string Command { get; set; } = "back";
}

/// <summary>Back, forward or reload on the active tab (no permission needed). Reload: hold = hard reload (bypass cache).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.nav", Name = "Back / Forward / Reload",
    Icon = "imgs/actions/browser/nav/icon", KeyImage = "imgs/actions/browser/nav/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Back, forward or reload the active tab. Reload: hold for a hard reload.")]
public sealed class NavKeyAction : BrowserKeyBase<NavKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Tabs | BrowserChange.Windows;

    protected override Task OnKeyPressAsync(KeyUpEvent e) => Do(hard: false);

    protected override Task OnKeyLongPressAsync(KeyDownEvent e) => Do(hard: Settings.Command == "reload");

    private Task Do(bool hard)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (b.ActiveTab() is not { } tab) { ShowAlert(); return Task.CompletedTask; }
        var (op, args) = Settings.Command switch
        {
            "forward" => (Wire.Op.TabForward, new JsonObject { ["tabId"] = tab.Id }),
            "reload" => (Wire.Op.TabReload, new JsonObject { ["tabId"] = tab.Id, ["bypassCache"] = hard }),
            _ => (Wire.Op.TabBack, new JsonObject { ["tabId"] = tab.Id }),
        };
        Send(hub, b.Key, op, args, _ => hard ? new Notice("HARD RELOAD", Tone.Good) : null);
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var (glyph, label) = Settings.Command switch
        {
            "forward" => (BrowserGlyphs.Forward, "FORWARD"),
            "reload" => (BrowserGlyphs.Reload, "RELOAD"),
            _ => (BrowserGlyphs.Back, "BACK"),
        };
        var flash = FlashState.Get(Time);
        SetImage(BrowserArt.GlyphKey(Theme, glyph, flash?.Text ?? label, micro: flash?.Sub ?? (Settings.Command == "reload" ? "HOLD = HARD" : null),
            microTone: flash?.Tone ?? Tone.Normal));
    }

    protected override PiForm? DescribeForm() => base.DescribeForm()!
        .Select("command", "Does", [("back", "Back"), ("forward", "Forward"), ("reload", "Reload (hold: hard reload)")]);
}

public sealed class ReopenKeySettings : BrowserSettingsBase;

/// <summary>Reopen the last closed tab or window (sessions.restore; needs the extension's optional "sessions" permission).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.reopen", Name = "Reopen Closed Tab",
    Icon = "imgs/actions/browser/reopen/icon", KeyImage = "imgs/actions/browser/reopen/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Reopens the tab (or window) you closed last.")]
public sealed class ReopenKeyAction : BrowserKeyBase<ReopenKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Browsers;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (!b.Caps.Sessions && !hub.SafeMode)
        {
            Send(hub, b.Key, Wire.Op.PermOpenOptions, new JsonObject { ["section"] = Wire.OptionsSection.Features }, _ => new Notice("ALLOW IT", Tone.Good, "IN THE BROWSER"));
            return Task.CompletedTask;
        }
        Send(hub, b.Key, Wire.Op.SessionRestore, new JsonObject());
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var flash = FlashState.Get(Time);
        if (!b!.Caps.Sessions && flash is null)
        {
            SetImage(BrowserArt.GlyphKey(Theme, BrowserGlyphs.Reopen, "REOPEN", micro: "PRESS TO ALLOW", microTone: Tone.Warn));
            return;
        }
        SetImage(BrowserArt.GlyphKey(Theme, BrowserGlyphs.Reopen, flash?.Text ?? "REOPEN", micro: flash?.Sub, microTone: flash?.Tone ?? Tone.Normal));
    }
}

public sealed class SplitKeySettings : BrowserSettingsBase;

/// <summary>Split view (Chrome 155+): split the active tab with the one you used before it, or unsplit.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.split", Name = "Split View",
    Icon = "imgs/actions/browser/split/icon", KeyImage = "imgs/actions/browser/split/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Splits the active tab with the previous one, or unsplits it (Chrome).")]
public sealed class SplitKeyAction : BrowserKeyBase<SplitKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Tabs | BrowserChange.Windows;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (b.ActiveTab() is not { } tab) { ShowAlert(); return Task.CompletedTask; }
        if (tab.Split >= 0)
        {
            Send(hub, b.Key, Wire.Op.SplitRemove, new JsonObject { ["splitViewId"] = tab.Split });
            return Task.CompletedTask;
        }
        var previous = b.TabsInWindow(tab.WindowId).Where(t => t.Id != tab.Id && t.Split < 0).OrderByDescending(t => t.LastAccessed ?? 0).FirstOrDefault();
        if (previous is null) { ShowAlert(); FlashState.Set(Time, new Notice("ONE TAB", Tone.Warn, "NOTHING TO SPLIT")); Render(); return Task.CompletedTask; }
        Send(hub, b.Key, Wire.Op.SplitCreate, new JsonObject { ["tabIds"] = new JsonArray(previous.Id, tab.Id) });
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var flash = FlashState.Get(Time);
        var split = b!.ActiveTab() is { Split: >= 0 };
        if (!b.Exe.Equals("chrome.exe", StringComparison.OrdinalIgnoreCase) && !b.Caps.Split && flash is null)
        {
            SetImage(BrowserArt.GlyphKey(Theme, BrowserGlyphs.Split, "SPLIT", enabled: false, micro: "CHROME ONLY"));
            return;
        }
        SetImage(BrowserArt.GlyphKey(Theme, BrowserGlyphs.Split, flash?.Text ?? (split ? "UNSPLIT" : "SPLIT"), on: split, micro: flash?.Sub, microTone: flash?.Tone ?? Tone.Normal));
    }
}

public sealed class GroupKeySettings : BrowserSettingsBase
{
    /// <summary>1-based: the Nth tab group of the current window, in strip order.</summary>
    public int Index { get; set; } = 1;
}

/// <summary>A tab group: its color, name and tab count. Press = collapse/expand; hold = switch to its first tab.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.group", Name = "Tab Group",
    Icon = "imgs/actions/browser/group/icon", KeyImage = "imgs/actions/browser/group/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "A tab group in its color. Press to collapse or expand; hold to switch to its first tab.")]
public sealed class GroupKeyAction : BrowserKeyBase<GroupKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Groups | BrowserChange.Tabs | BrowserChange.Windows;

    private (TabGroupInfo Group, int Tabs)? Resolve(BrowserInstance b)
    {
        var groups = Selectors.Groups(b);
        var i = Math.Max(1, Settings.Index) - 1;
        return i < groups.Count ? groups[i] : null;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (!b.Caps.TabGroups && !hub.SafeMode)
        {
            Send(hub, b.Key, Wire.Op.PermOpenOptions, new JsonObject { ["section"] = Wire.OptionsSection.Features }, _ => new Notice("ALLOW IT", Tone.Good, "IN THE BROWSER"));
            return Task.CompletedTask;
        }
        if (Resolve(b) is not { } g) { ShowAlert(); return Task.CompletedTask; }
        Send(hub, b.Key, Wire.Op.GroupUpdate, new JsonObject { ["groupId"] = g.Group.Id, ["collapsed"] = !g.Group.Collapsed });
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (Resolve(b) is not { } g) { ShowAlert(); return Task.CompletedTask; }
        var first = b.Tabs.Values.Where(t => t.Group == g.Group.Id).OrderBy(t => t.Index).FirstOrDefault();
        if (first is null) return Task.CompletedTask;
        Track(Task.Run(async () =>
        {
            if (g.Group.Collapsed) await hub.Commands.SendAsync(b.Key, Wire.Op.GroupUpdate, new JsonObject { ["groupId"] = g.Group.Id, ["collapsed"] = false });
            var o = await hub.FocusTabAsync(b.Key, first.Id, raise: true);
            Post(() => { if (BrowserBinding.NoticeFor(o) is { } n) FlashState.Set(Time, n); Render(); });
        }));
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var flash = FlashState.Get(Time);
        if (!b!.Caps.TabGroups)
        {
            SetImage(BrowserArt.GroupKey(Theme, new GroupKeyView("grey", "GROUPS", 0, true, flash ?? new Notice("PRESS TO ALLOW", Tone.Warn, "TAB GROUPS"))));
            return;
        }
        if (Resolve(b) is not { } g)
        {
            SetImage(BrowserArt.GroupKey(Theme, new GroupKeyView("grey", $"GROUP {Settings.Index.ToString(CultureInfo.InvariantCulture)}", 0, true, flash ?? new Notice($"NO GROUP {Settings.Index}", Tone.Normal))));
            return;
        }
        var label = g.Group.Title is { Length: > 0 } title && Core.Render.StrokeFont.Supports(title) ? title : $"GROUP {Settings.Index.ToString(CultureInfo.InvariantCulture)}";
        SetImage(BrowserArt.GroupKey(Theme, new GroupKeyView(g.Group.Color, label, g.Tabs, g.Group.Collapsed, flash)));
    }

    protected override PiForm? DescribeForm() => base.DescribeForm()!.Number("index", "Group number (left to right)", 1, 20, 1);
}

public sealed class SiteKeySettings : BrowserSettingsBase
{
    /// <summary>The site to watch, e.g. mail.example.</summary>
    public string Site { get; set; } = "";
    /// <summary>Opened when no tab of the site is open (https only); empty = https://&lt;site&gt;.</summary>
    public string? OpenUrl { get; set; }
}

/// <summary>
/// Watch a site: its unread count from the tab title ("(3) Inbox"), parsed by the extension. Press = switch to that
/// tab (or open the site); hold = reload it.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.site", Name = "Site Watch",
    Icon = "imgs/actions/browser/site/icon", KeyImage = "imgs/actions/browser/site/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Unread count for a site you keep open (mail, chat). Press to switch to it; hold to reload it.")]
public sealed class SiteKeyAction : BrowserKeyBase<SiteKeySettings>
{
    private int? _lastTabId;

    private protected override BrowserChange Watches => BrowserChange.Tabs | BrowserChange.Images;

    private string SiteHost => WireParser.Host(Settings.Site.Trim().Replace("https://", "", StringComparison.OrdinalIgnoreCase).Replace("http://", "", StringComparison.OrdinalIgnoreCase).Split('/')[0]) ?? "";

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (SiteHost.Length == 0) { ShowAlert(); FlashState.Set(Time, new Notice("SET A SITE", Tone.Warn, "IN SETTINGS")); Render(); return Task.CompletedTask; }
        if (Selectors.SiteTab(b, SiteHost, _lastTabId) is { } tab)
        {
            Track(Task.Run(async () =>
            {
                var o = await hub.FocusTabAsync(b.Key, tab.Id, raise: true);
                Post(() => { if (BrowserBinding.NoticeFor(o) is { } n) FlashState.Set(Time, n); Render(); });
            }));
            return Task.CompletedTask;
        }
        var url = WireParser.HttpsOnly(Settings.OpenUrl?.Trim()) ?? "https://" + SiteHost + "/";
        Send(hub, b.Key, Wire.Op.TabCreate, new JsonObject { ["url"] = url }, _ => new Notice("OPENED", Tone.Good));
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (Selectors.SiteTab(b, SiteHost, _lastTabId) is not { } tab) { ShowAlert(); return Task.CompletedTask; }
        Send(hub, b.Key, Wire.Op.TabReload, new JsonObject { ["tabId"] = tab.Id, ["bypassCache"] = false }, _ => new Notice("RELOADED", Tone.Good));
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var host = SiteHost;
        var flash = FlashState.Get(Time);
        if (host.Length == 0)
        {
            SetImage(BrowserArt.SiteKey(Theme, new SiteKeyView(null, "SITE", null, false, flash ?? new Notice("SET A SITE", Tone.Warn, "IN SETTINGS"))));
            return;
        }
        var tab = Selectors.SiteTab(b!, host, _lastTabId);
        _lastTabId = tab?.Id ?? _lastTabId;
        // Streamer-safe "hidden" drops the domain: the label is then generic too.
        var label = Wire.Privacy.Rank(b!.Privacy) >= 2 ? "SITE" : Selectors.StripWww(host);
        SetImage(BrowserArt.SiteKey(Theme, new SiteKeyView(tab is null ? null : Selectors.Image(B.Hub, b.Key, tab.Icon), label, tab?.Unread, tab is not null, flash)));
    }

    protected override PiForm? DescribeForm() => base.DescribeForm()!
        .Text("site", "Site", "mail.example")
        .Text("openUrl", "Open if closed", "https://mail.example/ (optional)");
}

public sealed class PageDialSettings : BrowserSettingsBase
{
    /// <summary>scroll (default) | zoom: the mode the dial starts in.</summary>
    public string Start { get; set; } = "scroll";
    /// <summary>Pixels per tick.</summary>
    public int ScrollStep { get; set; } = 48;
}

/// <summary>
/// The page dial: turn = smooth scroll (ticks accumulate, never dropped; fast spins go further), push = switch to zoom,
/// where turning walks Chrome's zoom ladder. Stream Deck + extras: tap = 100 %, touch-hold / dial hold = top of the page.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.page", Name = "Page Scroll / Zoom",
    Icon = "imgs/actions/browser/page/icon", KeyImage = "imgs/actions/browser/page/key", EncoderIcon = "imgs/actions/browser/page/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Turn to scroll the page; push to switch to zoom.",
    TriggerRotate = "Scroll / zoom", TriggerPush = "Switch mode", TriggerTouch = "Zoom 100%", TriggerLongTouch = "Top of page")]
public sealed class PageDialAction : DialAction<PageDialSettings>, IDisposable
{
    private BrowserBinding? _b;
    private readonly TurnAccel _accel = new();
    private Flash _flash;
    private RenderLoop? _loop;
    private bool _zoomMode;
    private double? _pendingZoom;
    private long _pendingAt;
    private readonly List<Task> _pending = [];

    internal bool ZoomMode => _zoomMode;
    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Tabs | BrowserChange.Windows, () => _loop?.Invalidate());
        _zoomMode = Settings.Start == "zoom";
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Scroll / zoom", "Switch mode", "Zoom 100%", "Top of page");
        else SetTriggerDescription("Scroll / zoom", "Switch mode");
        _loop = StartRenderLoop(Render, TimeSpan.FromSeconds(2), TimeSpan.FromMilliseconds(50));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private (BrowserHub? Hub, BrowserInstance? B, BrowserTab? Tab) Target()
    {
        var b = _b?.Target(Settings.Browser);
        return (_b?.Hub, b, b is { Connected: true } ? b.ActiveTab() : null);
    }

    private int? _keysTab;
    /// <summary>The zoom the browser last reported for a tab (page.zoom results), when no zoom event told us.</summary>
    private (int Tab, double Factor)? _knownZoom;

    private double? ZoomOf(BrowserTab tab) => tab.Zoom ?? (_knownZoom is { } k && k.Tab == tab.Id ? k.Factor : null);

    private void OnScrollResult(CommandResult r)
    {
        if (r.Ok) return;
        Post(() =>
        {
            // PROTOCOL.md §10.3: without host access (or with no script in the page: an older extension answers not_found
            // on pages without media, HIGH 3), fall back to arrow keys, only while the browser is in front.
            if (r.Code is Wire.Err.NoHostPermission or Wire.Err.NotFound && Target().Tab is { } t)
            {
                _keysTab = t.Id;
                _flash.Set(Time, new Notice(r.Code == Wire.Err.NoHostPermission ? "No site access: arrow keys" : "Scrolling with arrow keys", Tone.Warn));
            }
            else _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false));
            _loop?.Invalidate();
        });
    }

    private void OnZoomResult(int tabId, CommandResult r)
    {
        Post(() =>
        {
            if (r.Ok)
            {
                if (r.Data is { } d && WireParser.Double(d, "factor", 0.25, 5) is { } f) _knownZoom = (tabId, f);
                return;
            }
            _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false));
            _loop?.Invalidate();
        });
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var (hub, b, tab) = Target();
        if (hub is null || b is null || tab is null || e.Ticks == 0) { if (e.Ticks != 0) ShowAlert(); return Task.CompletedTask; }
        if (!_zoomMode && _keysTab == tab.Id)
        {
            var lines = _accel.Rows(e.Ticks, this, Time);
            var key = b.Key;
            var t = Task.Run(async () =>
            {
                if (!await hub.ScrollWithKeysAsync(key, lines))
                    Post(() => { _flash.Set(Time, new Notice("Bring the browser to the front", Tone.Warn)); _loop?.Invalidate(); });
            });
            lock (_pending) { _pending.RemoveAll(x => x.IsCompleted); _pending.Add(t); }
        }
        else if (!_zoomMode)
        {
            var dy = _accel.Rows(e.Ticks, this, Time) * Math.Clamp(Settings.ScrollStep, 8, 400);
            hub.Streams.Post(b.Key, Wire.Op.PageScroll, tab.Id.ToString(CultureInfo.InvariantCulture), prev =>
            {
                // Accumulated, never dropped (clamped to what page.scroll accepts in one command).
                var sum = Math.Clamp((prev is null ? 0 : WireParser.Long(prev, "dy") ?? 0) + dy, -Wire.Limits.ScrollMax, Wire.Limits.ScrollMax);
                return new JsonObject { ["tabId"] = tab.Id, ["dy"] = sum, ["smooth"] = true };
            }, OnScrollResult);
        }
        else
        {
            // MED 5: the plugin rarely knows a tab's zoom (tab views carry none), so it sends relative ladder steps
            // (accumulated, never dropped) and the extension steps from tabs.getZoom. The face shows an optimistic guess.
            var steps = _accel.Steps(e.Ticks, this, Time);
            var fresh = Time.GetElapsedTime(_pendingAt) < TimeSpan.FromSeconds(1.5) && _pendingZoom is not null;
            var basis = fresh ? _pendingZoom : ZoomOf(tab);
            _pendingZoom = basis is { } z0 ? Selectors.LadderStep(Wire.ZoomLadder, z0, steps) : null;
            _pendingAt = Time.GetTimestamp();
            var tabId = tab.Id;
            hub.Streams.Post(b.Key, Wire.Op.PageZoom, tab.Id.ToString(CultureInfo.InvariantCulture), prev =>
            {
                // A reset still waiting to be sent fixes the basis at 100 %: from there an absolute factor is exact.
                if (prev is not null && WireParser.Bool(prev, "reset") == true)
                    return new JsonObject { ["tabId"] = tabId, ["factor"] = Selectors.LadderStep(Wire.ZoomLadder, 1, steps) };
                if (prev is not null && WireParser.Double(prev, "factor", 0.25, 5) is { } f)
                    return new JsonObject { ["tabId"] = tabId, ["factor"] = Selectors.LadderStep(Wire.ZoomLadder, f, steps) };
                var sum = Math.Clamp((prev is null ? 0 : WireParser.Int(prev, "step") ?? 0) + steps, -Wire.Limits.ZoomStepMax, Wire.Limits.ZoomStepMax);
                return new JsonObject { ["tabId"] = tabId, ["step"] = sum };
            }, r => OnZoomResult(tabId, r));
        }
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        _zoomMode = !_zoomMode;
        _flash.Clear();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e) => e.Hold ? Top() : ResetZoom();
    protected override Task OnDialLongPressAsync(DialDownEvent e) => Top();

    private Task ResetZoom()
    {
        var (hub, b, tab) = Target();
        if (hub is null || b is null || tab is null) { ShowAlert(); return Task.CompletedTask; }
        _pendingZoom = 1;
        _pendingAt = Time.GetTimestamp();
        var tabId = tab.Id;
        // A reset replaces any steps still pending on the stream (latest wins).
        hub.Streams.Post(b.Key, Wire.Op.PageZoom, tab.Id.ToString(CultureInfo.InvariantCulture), _ => new JsonObject { ["tabId"] = tabId, ["reset"] = true }, r => OnZoomResult(tabId, r));
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    private Task Top()
    {
        var (hub, b, tab) = Target();
        if (hub is null || b is null || tab is null) { ShowAlert(); return Task.CompletedTask; }
        hub.Streams.Post(b.Key, Wire.Op.PageScroll, tab.Id.ToString(CultureInfo.InvariantCulture) + ":top", _ => new JsonObject { ["tabId"] = tab.Id, ["dy"] = -Wire.Limits.ScrollMax, ["smooth"] = true }, OnScrollResult);
        return Task.CompletedTask;
    }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var (_, b, tab) = Target();
        if (_b.ProblemFor(b) is { } p)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(Theme, p.Glyph, "Page", p.DialLine1, p.DialLine2, IsInteractive, p.Tone)));
            return;
        }
        var zoom = Time.GetElapsedTime(_pendingAt) < TimeSpan.FromSeconds(1.5) && _pendingZoom is { } pz ? pz : (tab is null ? null : ZoomOf(tab)) ?? 1;
        var caption = tab is null ? b!.Brand : Wire.Privacy.Rank(b!.Privacy) >= 2 ? b.Brand : Selectors.StripWww(tab.Domain ?? b.Brand);
        var notice = _flash.Get(Time) ?? (tab is null ? new Notice("No active tab", Tone.Warn) : _b.SafeMode && IsInteractive ? new Notice("Safe mode", Tone.Warn) : null);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.PageDial(Theme, new PageView(_zoomMode, zoom, caption, notice), IsInteractive)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Page scroll / zoom")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Select("start", "Starts in", [("scroll", "Scroll"), ("zoom", "Zoom")])
        .Range("scrollStep", "Pixels per tick", 16, 200, 8)
        .Info("How to use", "Turn to scroll the active tab, push to switch to zoom. Scrolling a site the extension can't reach yet asks for permission once.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}
