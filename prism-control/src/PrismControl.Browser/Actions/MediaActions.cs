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

/// <summary>
/// What the media actions act on: a browser's media item; an audible tab without one (the zero-permission tier:
/// "press to allow" when the site has no host access, tab mute only on browser pages or while the media is being
/// detected); or the SMTC lite tier when no extension is connected.
/// </summary>
internal sealed record MediaTarget(BrowserInstance? Browser, MediaItem? Media, BrowserTab? Tab, bool NeedsPermission, SmtcMedia? Lite)
{
    /// <summary>The page cannot be scripted at all (browser pages): tab mute is all there is.</summary>
    public bool Blocked { get; init; }

    /// <summary>An audible tab we can only mute (blocked page, or granted but no media detected yet).</summary>
    public bool MuteOnly => Media is null && Tab is not null && !NeedsPermission;

    public static MediaTarget Resolve(BrowserBinding b, string? selector)
    {
        var snap = b.Snapshot;
        var browser = snap.Target(selector);
        // HIGH 1: the lite tier (already privacy-filtered by the hub) only while no browser is known at all; a browser in
        // its reconnect grace shows "reconnecting", never the Windows media session in its place.
        if (browser is not { Connected: true })
            return new MediaTarget(browser, null, null, false, snap.LiteTierActive ? snap.Smtc : null);
        var media = Selectors.Media(browser);
        var loud = Selectors.AudibleWithoutMedia(browser);
        // An audible tab with no media item is newer than a paused item: it wins.
        if (loud is not null && (media is null || !media.IsPlaying))
            return new MediaTarget(browser, null, loud, loud.Access is null or "none", null) { Blocked = loud.Access == "blocked" };
        if (media is not null)
        {
            browser.Tabs.TryGetValue(media.TabId, out var tab);
            return new MediaTarget(browser, media, tab, media.NeedsPermission, null);
        }
        return new MediaTarget(browser, null, null, false, null);
    }

    public string Domain => Tab?.Domain is { } d ? Selectors.StripWww(d) : Media?.Domain is { } md ? Selectors.StripWww(md) : Browser?.Brand ?? "Browser";
}

internal static class MediaFlows
{
    /// <summary>The runtime site grant (research §3.5): the extension shows the request in its toolbar menu.</summary>
    public static async Task<Notice> AllowSiteAsync(BrowserHub hub, string browserKey, int tabId, bool dial)
    {
        var r = await hub.Commands.SendAsync(browserKey, Wire.Op.PermHostRequest, new JsonObject { ["tabId"] = tabId });
        if (hub.SafeMode) return dial ? new Notice("Safe mode: nothing was sent", Tone.Warn) : new Notice("SAFE MODE", Tone.Warn, "NOT SENT");
        if (!r.Ok) return dial ? BrowserBinding.DialNoticeFor(r, false) : BrowserBinding.NoticeFor(r, false);
        // {via: toolbar | options | granted | none}: where the user clicks Allow.
        return (r.Data is { } d ? WireParser.Str(d, "via", 16, clean: false) : null) switch
        {
            "options" => dial ? new Notice("Click Allow on the page", Tone.Good) : new Notice("CLICK ALLOW", Tone.Good, "ON THE PAGE"),
            "granted" => dial ? new Notice("Already allowed", Tone.Good) : new Notice("ALLOWED", Tone.Good),
            "none" => dial ? new Notice("Browser page: can't allow", Tone.Warn) : new Notice("CAN'T ALLOW", Tone.Warn, "BROWSER PAGE"),
            _ => dial ? new Notice("Click Allow in the toolbar", Tone.Good) : new Notice("CLICK ALLOW", Tone.Good, "IN THE TOOLBAR"),
        };
    }

    public static Notice? PipNotice(PipOutcome o, bool dial, string pipKey = Wire.PipKeys.Default) => o switch
    {
        PipOutcome.KeyInUse => dial ? new Notice($"{pipKey} is used by another app: pick a key in settings", Tone.Warn) : new Notice($"{pipKey} IN USE", Tone.Warn, "SEE SETTINGS"),
        PipOutcome.Entered => dial ? new Notice("Picture-in-picture on", Tone.Good) : new Notice("PIP ON", Tone.Good),
        PipOutcome.Exited => dial ? new Notice("Picture-in-picture off", Tone.Good) : new Notice("PIP OFF", Tone.Good),
        PipOutcome.Pending => dial ? new Notice("No PiP yet: try again", Tone.Warn) : new Notice("TRY AGAIN", Tone.Warn, "HOLD AGAIN"),
        PipOutcome.SafeMode => dial ? new Notice("Safe mode: nothing was sent", Tone.Warn) : new Notice("SAFE MODE", Tone.Warn, "NOT SENT"),
        PipOutcome.NeedsPermission => dial ? new Notice("Push to allow this site", Tone.Warn) : new Notice("ALLOW SITE", Tone.Warn, "PRESS TO ALLOW"),
        PipOutcome.Elevated => dial ? new Notice("Admin app in front: blocked", Tone.Warn) : new Notice("ADMIN APP", Tone.Warn, "IN FRONT"),
        PipOutcome.Unsupported => dial ? new Notice("No video for PiP here", Tone.Warn) : new Notice("NO VIDEO", Tone.Warn),
        PipOutcome.NoBrowser => dial ? new Notice("No browser connected", Tone.Warn) : new Notice("NO BROWSER", Tone.Warn),
        _ => dial ? new Notice("Picture-in-picture failed", Tone.Error) : new Notice("PIP FAILED", Tone.Error),
    };

    /// <summary>Tab mute: the one media control that needs no permission at all.</summary>
    public static async Task<Notice?> ToggleTabMuteAsync(BrowserHub hub, string browserKey, BrowserTab tab, bool dial)
    {
        var r = await hub.Commands.SendAsync(browserKey, Wire.Op.TabMute, new JsonObject { ["tabId"] = tab.Id, ["muted"] = !tab.Muted });
        if (hub.SafeMode) return dial ? new Notice("Safe mode: nothing was sent", Tone.Warn) : new Notice("SAFE MODE", Tone.Warn, "NOT SENT");
        if (!r.Ok) return dial ? BrowserBinding.DialNoticeFor(r, false) : BrowserBinding.NoticeFor(r, false);
        return null;
    }

    public static Notice LiteTier(bool dial) => dial
        ? new Notice("Connect for controls", Tone.Warn)
        : new Notice("READ ONLY", Tone.Warn, "CONNECT BROWSERS");
}

public sealed class MediaKeySettings : BrowserSettingsBase;

/// <summary>
/// Media in any tab: artwork (whole), title and a progress ring. Press = play/pause; hold = picture-in-picture.
/// A tab playing sound on a site without permission shows "press to allow" (the extension's one-click runtime grant).
/// With no extension connected it shows the browser's Windows media session read-only (the lite tier).
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.media", Name = "Tab Media",
    Icon = "imgs/actions/browser/media/icon", KeyImage = "imgs/actions/browser/media/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Media playing in any browser tab. Press to play or pause; hold for picture-in-picture.")]
public sealed class MediaKeyAction : KeyAction<MediaKeySettings>, IDisposable
{
    private BrowserBinding? _b;
    private Flash _flash;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Media | BrowserChange.Tabs | BrowserChange.Images | BrowserChange.Smtc, Render);
        DefaultPriority = UpdatePriority.Background;
        LongPressThreshold = TimeSpan.FromMilliseconds(500);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private void Run(Func<Task<Notice?>> work)
    {
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var n = await work();
                Post(() => { if (n is not null) _flash.Set(Time, n); Render(); });
            }));
        }
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.Hub is not { } hub) { ShowAlert(); return Task.CompletedTask; }
        var m = MediaTarget.Resolve(_b, Settings.Browser);
        if (m.Lite is not null) { _flash.Set(Time, MediaFlows.LiteTier(false)); Render(); return Task.CompletedTask; }
        if (m.Browser is not { Connected: true } b) { ShowAlert(); _flash.Set(Time, new Notice("NO BROWSER", Tone.Warn, "OPEN SETTINGS")); Render(); return Task.CompletedTask; }
        if (m.NeedsPermission && m.Tab is { } tab) { Run(async () => await MediaFlows.AllowSiteAsync(hub, b.Key, tab.Id, dial: false)); return Task.CompletedTask; }
        if (m.MuteOnly) { Run(() => MediaFlows.ToggleTabMuteAsync(hub, b.Key, m.Tab!, dial: false)); return Task.CompletedTask; }
        if (m.Media is not { } media) { ShowAlert(); return Task.CompletedTask; }
        Run(async () =>
        {
            var r = await hub.Commands.SendAsync(b.Key, Wire.Op.MediaToggle, new JsonObject { ["key"] = media.Key });
            return !r.Ok ? BrowserBinding.NoticeFor(r, false) : hub.SafeMode ? new Notice("SAFE MODE", Tone.Warn, "NOT SENT") : null;
        });
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (_b?.Hub is not { } hub) return Task.CompletedTask;
        var m = MediaTarget.Resolve(_b, Settings.Browser);
        if (m.Lite is not null) { _flash.Set(Time, MediaFlows.LiteTier(false)); Render(); return Task.CompletedTask; }
        if (m.Browser is not { Connected: true } b) { ShowAlert(); return Task.CompletedTask; }
        // Without a media item, the hold mutes the tab: that works with zero permissions.
        if (m.Media is null && m.Tab is { } tab) { Run(() => MediaFlows.ToggleTabMuteAsync(hub, b.Key, tab, dial: false)); return Task.CompletedTask; }
        if (m.Media is not { } media) { ShowAlert(); return Task.CompletedTask; }
        Run(async () => MediaFlows.PipNotice(await hub.TogglePipAsync(b.Key, media), dial: false, hub.PipKey));
        return Task.CompletedTask;
    }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        var m = MediaTarget.Resolve(_b, Settings.Browser);
        var flash = _flash.Get(Time);
        if (m.Lite is { } lite)
        {
            var lm = lite.Media;
            var now = _b.Hub?.Store.WallMs ?? 0;
            var frac = lm.DurationMs is > 0 && lm.PositionNow(now) is { } lp ? (double)lp / lm.DurationMs.Value : (double?)null;
            // lite.Media is filtered by the hub at lite.Level: no title or thumbnail unless the level is full.
            var liteTitle = lm.Title ?? (lite.Level == Wire.Privacy.Full ? lite.Brand : "PLAYING");
            SetImage(BrowserArt.MediaKey(t, new MediaKeyView(_b.Hub?.Images.Get(lite.ThumbnailId), liteTitle, frac, lm.IsPlaying, false, false, lm.Rate, flash)));
            return;
        }
        if (_b.ProblemFor(m.Browser) is { } p)
        {
            SetImage(BrowserArt.MessageKey(t, p.Glyph, p.KeyLine1, p.KeyLine2, p.Tone));
            return;
        }
        var b = m.Browser!;
        if (m.Media is null && m.Tab is { } tab)
        {
            var hint = m.NeedsPermission ? new Notice("PRESS TO ALLOW", Tone.Warn) : m.Blocked ? new Notice("MUTE ONLY", Tone.Normal) : new Notice(tab.Muted ? "MUTED" : "PLAYING", Tone.Normal);
            SetImage(BrowserArt.MediaKey(t, new MediaKeyView(Selectors.Image(_b.Hub, b.Key, tab.Icon), m.Domain, null, !tab.Muted, false, false, 1, flash ?? hint)));
            return;
        }
        if (m.Media is not { } media)
        {
            SetImage(BrowserArt.GlyphKey(t, BrowserGlyphs.Media, "NOT PLAYING", enabled: false, micro: flash?.Text));
            return;
        }
        var nowMs = _b.Hub!.Store.WallMs;
        var pos = media.PositionNow(nowMs, b.ClockOffsetMs);
        var fraction = media.DurationMs is > 0 && pos is { } p2 ? (double)p2 / media.DurationMs.Value : (double?)null;
        var title = media.Title ?? (Wire.Privacy.Rank(b.Privacy) >= 2 ? "PLAYING" : m.Domain);
        SetImage(BrowserArt.MediaKey(t, new MediaKeyView(Selectors.Art(_b.Hub, b.Key, media), title, fraction, media.IsPlaying, media.Live, media.Pip, media.Rate, flash)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Tab media")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Info("How to use", "Follows the newest media playing in a tab. Press to play or pause; hold for picture-in-picture. A new site asks once: press, then click Allow in the browser's toolbar.")
        .Info("Picture-in-picture key", "The browser only opens picture-in-picture after a real key press, so the hold brings the tab to the front and presses F24 (or the key picked under Browsers below). It is a global keystroke: an app with a hotkey on that key (OBS, Discord, AutoHotkey) could react. Prism Control refuses (\"F24 IN USE\") when another app registered the key, but hotkeys made with keyboard hooks can't be detected, so pick a key nothing else uses.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}

public sealed class ScrubDialSettings : BrowserSettingsBase
{
    /// <summary>seek (default) | skip.</summary>
    public string Rotate { get; set; } = "seek";
    public int SeekSeconds { get; set; } = 5;
}

/// <summary>
/// Now playing on a dial: artwork, title, progress. Turn = scrub (±5 s per tick, fast Galleon spins go further) or
/// skip; push = play/pause. Stream Deck + extras: tap = picture-in-picture, touch-hold / dial hold = next track.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.scrub", Name = "Tab Now Playing",
    Icon = "imgs/actions/browser/scrub/icon", KeyImage = "imgs/actions/browser/scrub/key", EncoderIcon = "imgs/actions/browser/scrub/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Media in any tab. Turn to scrub, push to play or pause.",
    TriggerRotate = "Scrub", TriggerPush = "Play / Pause", TriggerTouch = "Picture-in-picture", TriggerLongTouch = "Next")]
public sealed class ScrubDialAction : DialAction<ScrubDialSettings>, IDisposable
{
    private BrowserBinding? _b;
    private readonly TurnAccel _accel = new();
    private Flash _flash;
    private RenderLoop? _loop;
    private long _seekOffsetMs;
    private long _seekAt;
    private long _lastSkip;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Media | BrowserChange.Tabs | BrowserChange.Images | BrowserChange.Smtc, () => _loop?.Invalidate());
        SetFeedbackLayout(Layouts.Canvas.Path);
        UpdateTriggers();
        _loop = StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    private void UpdateTriggers()
    {
        var rotate = Settings.Rotate == "skip" ? "Next / Previous" : "Scrub";
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription(rotate, "Play / Pause", "Picture-in-picture", "Next");
        else SetTriggerDescription(rotate, "Play / Pause");
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private void Run(Func<Task<Notice?>> work)
    {
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var n = await work();
                Post(() => { if (n is not null) _flash.Set(Time, n); _loop?.Invalidate(); });
            }));
        }
    }

    private bool Guard(out BrowserHub hub, out MediaTarget m)
    {
        hub = _b?.Hub!;
        m = _b is null ? new MediaTarget(null, null, null, false, null) : MediaTarget.Resolve(_b, Settings.Browser);
        if (hub is null) return false;
        if (m.Lite is not null) { _flash.Set(Time, MediaFlows.LiteTier(true)); _loop?.Invalidate(); return false; }
        if (m.Browser is not { Connected: true }) { ShowAlert(); return false; }
        if (m.NeedsPermission && m.Tab is { } tab)
        {
            var key = m.Browser.Key;
            var h = hub;
            Run(async () => await MediaFlows.AllowSiteAsync(h, key, tab.Id, dial: true));
            return false;
        }
        return m.Media is not null;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (e.Ticks == 0 || !Guard(out var hub, out var m)) return Task.CompletedTask;
        var b = m.Browser!;
        var media = m.Media!;
        if (Settings.Rotate == "skip")
        {
            if (_lastSkip != 0 && Time.GetElapsedTime(_lastSkip) < TimeSpan.FromMilliseconds(400)) return Task.CompletedTask;
            _lastSkip = Time.GetTimestamp();
            var action = e.Ticks > 0 ? "nexttrack" : "previoustrack";
            if (!media.Has(action)) { _flash.Set(Time, new Notice("No next / previous here", Tone.Warn)); _loop?.Invalidate(); return Task.CompletedTask; }
            Run(async () =>
            {
                var r = await hub.Commands.SendAsync(b.Key, Wire.Op.MediaAction, new JsonObject { ["key"] = media.Key, ["action"] = action });
                return !r.Ok ? BrowserBinding.DialNoticeFor(r, false) : hub.SafeMode ? BrowserBinding.DialNoticeFor(r, true) : null;
            });
            return Task.CompletedTask;
        }
        if (media.Live) { _flash.Set(Time, new Notice("Live: nothing to scrub", Tone.Warn)); _loop?.Invalidate(); return Task.CompletedTask; }
        var delta = (long)_accel.Rows(e.Ticks, this, Time) * Math.Clamp(Settings.SeekSeconds, 1, 60) * 1000;
        if (Time.GetElapsedTime(_seekAt) > TimeSpan.FromSeconds(1.5)) _seekOffsetMs = 0;
        _seekOffsetMs += delta;
        _seekAt = Time.GetTimestamp();
        hub.Streams.Post(b.Key, Wire.Op.MediaSeek, media.Key, prev =>
        {
            var sum = (prev is null ? 0 : WireParser.Long(prev, "deltaMs") ?? 0) + delta;
            return new JsonObject { ["key"] = media.Key, ["deltaMs"] = sum };
        }, r => { if (!r.Ok) Post(() => { _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false)); _loop?.Invalidate(); }); });
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        // An audible tab we can only mute (browser page, or media not detected yet): push mutes it.
        if (_b?.Hub is { } muteHub && MediaTarget.Resolve(_b, Settings.Browser) is { MuteOnly: true, Browser: { Connected: true } mb, Tab: { } mt })
        {
            Run(() => MediaFlows.ToggleTabMuteAsync(muteHub, mb.Key, mt, dial: true));
            return Task.CompletedTask;
        }
        if (!Guard(out var hub, out var m)) return Task.CompletedTask;
        var key = m.Browser!.Key;
        var mk = m.Media!.Key;
        Run(async () =>
        {
            var r = await hub.Commands.SendAsync(key, Wire.Op.MediaToggle, new JsonObject { ["key"] = mk });
            return !r.Ok || hub.SafeMode ? BrowserBinding.DialNoticeFor(r, hub.SafeMode) : null;
        });
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e) => e.Hold ? Next() : Pip();
    protected override Task OnDialLongPressAsync(DialDownEvent e) => Next();

    private Task Pip()
    {
        if (!Guard(out var hub, out var m)) return Task.CompletedTask;
        var key = m.Browser!.Key;
        var media = m.Media!;
        Run(async () => MediaFlows.PipNotice(await hub.TogglePipAsync(key, media), dial: true, hub.PipKey));
        return Task.CompletedTask;
    }

    private Task Next()
    {
        if (!Guard(out var hub, out var m)) return Task.CompletedTask;
        var key = m.Browser!.Key;
        var media = m.Media!;
        if (!media.Has("nexttrack")) { _flash.Set(Time, new Notice("No next track here", Tone.Warn)); _loop?.Invalidate(); return Task.CompletedTask; }
        Run(async () =>
        {
            var r = await hub.Commands.SendAsync(key, Wire.Op.MediaAction, new JsonObject { ["key"] = media.Key, ["action"] = "nexttrack" });
            return !r.Ok || hub.SafeMode ? BrowserBinding.DialNoticeFor(r, hub.SafeMode) : null;
        });
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(ScrubDialSettings settings) { UpdateTriggers(); _loop?.Invalidate(); return Task.CompletedTask; }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        var m = MediaTarget.Resolve(_b, Settings.Browser);
        var flash = _flash.Get(Time);
        var now = _b.Hub?.Store.WallMs ?? 0;
        if (m.Lite is { } lite)
        {
            var lm = lite.Media;
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.NowPlayingDial(t, new NowPlayingView(_b.Hub?.Images.Get(lite.ThumbnailId),
                $"Windows media · {lite.Brand}", lm.Title ?? "Playing", lm.Artist, lm.PositionNow(now), lm.DurationMs, lm.IsPlaying, false, lm.Rate, false,
                flash ?? MediaFlows.LiteTier(true)), IsInteractive)));
            return;
        }
        if (_b.ProblemFor(m.Browser) is { } p)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, p.Glyph, "Now playing", p.DialLine1, p.DialLine2, IsInteractive, p.Tone)));
            return;
        }
        var b = m.Browser!;
        if (m.NeedsPermission && m.Tab is { } tab)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.NowPlayingDial(t, new NowPlayingView(Selectors.Image(_b.Hub, b.Key, tab.Icon),
                $"{b.Brand} · {m.Domain}", "Playing sound", null, null, null, !tab.Muted, false, 1, false,
                flash ?? (m.NeedsPermission ? new Notice("Push to allow", Tone.Warn) : new Notice(tab.Muted ? "Push to unmute" : "Push to mute", Tone.Normal))), IsInteractive)));
            return;
        }
        if (m.Media is not { } media)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, BrowserGlyphs.Media, $"{b.Brand} · media", "Nothing playing",
                flash?.Text ?? "Play a video or song in any tab", IsInteractive, Tone.Normal)));
            return;
        }
        var pos = media.PositionNow(now, b.ClockOffsetMs);
        if (pos is { } p0 && Time.GetElapsedTime(_seekAt) < TimeSpan.FromSeconds(1.5) && _seekOffsetMs != 0)
            pos = Math.Clamp(p0 + _seekOffsetMs, 0, media.DurationMs ?? long.MaxValue);
        var title = media.Title ?? (Wire.Privacy.Rank(b.Privacy) >= 2 ? "Playing" : $"Playing on {m.Domain}");
        var caption = $"{b.Brand} · {(Wire.Privacy.Rank(b.Privacy) >= 2 ? "media" : m.Domain)}";
        var notice = flash ?? (_b.SafeMode && IsInteractive ? new Notice("Safe mode: nothing is sent", Tone.Warn) : null);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.NowPlayingDial(t, new NowPlayingView(Selectors.Art(_b.Hub, b.Key, media), caption, title,
            media.Artist, pos, media.DurationMs, media.IsPlaying, media.Live, media.Rate, media.Pip, notice), IsInteractive)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Tab now playing")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Select("rotate", "Turning the dial", [("seek", "Scrubs"), ("skip", "Skips to the next / previous")])
        .Number("seekSeconds", "Seconds per tick", 1, 60, 1)
        .Info("Picture-in-picture", "Stream Deck +: a tap opens picture-in-picture by pressing F24 (or the key picked under Browsers below), a real global keystroke. If another app registered that key as a hotkey, the dial says so instead of pressing it.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}

public sealed class SpeedDialSettings : BrowserSettingsBase
{
    /// <summary>speed (default) | volume: the mode the dial starts in.</summary>
    public string Start { get; set; } = "speed";
}

/// <summary>
/// Speed and volume for the media in a tab. Speed mode walks the ladder 0.25×–4× (one tick one step, a fast Galleon
/// spin two); volume mode moves 5 % per tick and mutes the tab below 0 %. Push switches mode. Stream Deck + extras:
/// tap = 1× (or 50 %), touch-hold / dial hold = mute the tab.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.speed", Name = "Tab Speed / Volume",
    Icon = "imgs/actions/browser/speed/icon", KeyImage = "imgs/actions/browser/speed/key", EncoderIcon = "imgs/actions/browser/speed/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Playback speed (0.25×–4×) and volume of the media in a tab. Push to switch.",
    TriggerRotate = "Speed / volume", TriggerPush = "Switch mode", TriggerTouch = "Reset", TriggerLongTouch = "Mute tab")]
public sealed class SpeedDialAction : DialAction<SpeedDialSettings>, IDisposable
{
    public const double VolumeStep = 0.05;
    private BrowserBinding? _b;
    private readonly TurnAccel _accel = new();
    private Flash _flash;
    private RenderLoop? _loop;
    private bool _volumeMode;
    private double? _pendingRate, _pendingVolume;
    private long _pendingAt;
    private readonly List<Task> _pending = [];

    internal bool VolumeMode => _volumeMode;
    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Media | BrowserChange.Tabs, () => _loop?.Invalidate());
        _volumeMode = Settings.Start == "volume";
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Speed / volume", "Switch mode", "Reset", "Mute tab");
        else SetTriggerDescription("Speed / volume", "Switch mode");
        _loop = StartRenderLoop(Render, TimeSpan.FromSeconds(2), TimeSpan.FromMilliseconds(50));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e) { Dispose(); return Task.CompletedTask; }

    private bool Fresh => Time.GetElapsedTime(_pendingAt) < TimeSpan.FromSeconds(1.5);

    private bool Guard(out BrowserHub hub, out MediaTarget m)
    {
        hub = _b?.Hub!;
        m = _b is null ? new MediaTarget(null, null, null, false, null) : MediaTarget.Resolve(_b, Settings.Browser);
        if (hub is null) return false;
        if (m.Lite is not null) { _flash.Set(Time, MediaFlows.LiteTier(true)); _loop?.Invalidate(); return false; }
        if (m.Browser is not { Connected: true }) { ShowAlert(); return false; }
        if (m.NeedsPermission && m.Tab is { } tab)
        {
            var key = m.Browser.Key;
            var h = hub;
            lock (_pending) _pending.Add(Task.Run(async () => { var n = await MediaFlows.AllowSiteAsync(h, key, tab.Id, dial: true); Post(() => { _flash.Set(Time, n); _loop?.Invalidate(); }); }));
            return false;
        }
        return m.Media is not null;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        // Zero-permission volume: an audible tab we can only mute. Turning down mutes it, turning up unmutes it.
        if (e.Ticks != 0 && _b?.Hub is { } muteHub && MediaTarget.Resolve(_b, Settings.Browser) is { MuteOnly: true, Browser: { Connected: true } mb, Tab: { } mt })
        {
            muteHub.Streams.Post(mb.Key, Wire.Op.TabMute, mt.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), _ => new JsonObject { ["tabId"] = mt.Id, ["muted"] = e.Ticks < 0 }, OnStreamResult);
            _loop?.Invalidate();
            return Task.CompletedTask;
        }
        if (e.Ticks == 0 || !Guard(out var hub, out var m)) return Task.CompletedTask;
        var b = m.Browser!;
        var media = m.Media!;
        if (!_volumeMode)
        {
            var rate = Selectors.LadderStep(Wire.SpeedLadder, Fresh && _pendingRate is { } pr ? pr : media.Rate, _accel.Steps(e.Ticks, this, Time));
            _pendingRate = rate;
            _pendingAt = Time.GetTimestamp();
            hub.Streams.Post(b.Key, Wire.Op.MediaRate, media.Key, _ => new JsonObject { ["key"] = media.Key, ["rate"] = rate }, OnStreamResult);
        }
        else
        {
            var tab = m.Tab;
            var muted = tab?.Muted == true;
            var current = Fresh && _pendingVolume is { } pv ? pv : media.Volume ?? 1;
            var steps = _accel.Rows(e.Ticks, this, Time);
            if (muted && steps > 0)
            {
                // Unmute first; the next ticks raise the volume.
                if (tab is not null) hub.Streams.Post(b.Key, Wire.Op.TabMute, tab.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), _ => new JsonObject { ["tabId"] = tab.Id, ["muted"] = false }, OnStreamResult);
                if (current <= 0.001) current = VolumeStep;
            }
            else if (!muted && current <= 0.001 && steps < 0)
            {
                if (tab is not null) hub.Streams.Post(b.Key, Wire.Op.TabMute, tab.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), _ => new JsonObject { ["tabId"] = tab.Id, ["muted"] = true }, OnStreamResult);
            }
            else current = Math.Round(Math.Clamp(current + steps * VolumeStep, 0, 1), 2);
            _pendingVolume = current;
            _pendingAt = Time.GetTimestamp();
            if (media.Volume is not null)
                hub.Streams.Post(b.Key, Wire.Op.MediaVolume, media.Key, _ => new JsonObject { ["key"] = media.Key, ["volume"] = current }, OnStreamResult);
        }
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    private void OnStreamResult(CommandResult r)
    {
        if (r.Ok) return;
        Post(() => { _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false)); _loop?.Invalidate(); });
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        if (_b?.Hub is { } hub)
        {
            var m = MediaTarget.Resolve(_b, Settings.Browser);
            if (m.NeedsPermission && m.Tab is { } tab && m.Browser is { Connected: true } b)
            {
                lock (_pending) _pending.Add(Task.Run(async () => { var n = await MediaFlows.AllowSiteAsync(hub, b.Key, tab.Id, dial: true); Post(() => { _flash.Set(Time, n); _loop?.Invalidate(); }); }));
                return Task.CompletedTask;
            }
        }
        _volumeMode = !_volumeMode;
        _flash.Clear();
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e) => e.Hold ? MuteTab() : Reset();
    protected override Task OnDialLongPressAsync(DialDownEvent e) => MuteTab();

    private Task Reset()
    {
        if (!Guard(out var hub, out var m)) return Task.CompletedTask;
        var b = m.Browser!;
        var media = m.Media!;
        _pendingAt = Time.GetTimestamp();
        if (_volumeMode)
        {
            _pendingVolume = 0.5;
            if (media.Volume is not null) hub.Streams.Post(b.Key, Wire.Op.MediaVolume, media.Key, _ => new JsonObject { ["key"] = media.Key, ["volume"] = 0.5 }, OnStreamResult);
        }
        else
        {
            _pendingRate = 1;
            hub.Streams.Post(b.Key, Wire.Op.MediaRate, media.Key, _ => new JsonObject { ["key"] = media.Key, ["rate"] = 1.0 }, OnStreamResult);
        }
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    private Task MuteTab()
    {
        if (!Guard(out var hub, out var m) || m.Tab is not { } tab) return Task.CompletedTask;
        var key = m.Browser!.Key;
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var r = await hub.Commands.SendAsync(key, Wire.Op.TabMute, new JsonObject { ["tabId"] = tab.Id, ["muted"] = !tab.Muted });
                Post(() => { if (!r.Ok) _flash.Set(Time, BrowserBinding.DialNoticeFor(r, false)); _loop?.Invalidate(); });
            }));
        }
        return Task.CompletedTask;
    }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        var m = MediaTarget.Resolve(_b, Settings.Browser);
        var flash = _flash.Get(Time);
        if (m.Lite is not null)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, BrowserGlyphs.Speed, "Speed · volume", "Read-only media", "Connect browsers for speed and volume", IsInteractive, Tone.Warn)));
            return;
        }
        if (_b.ProblemFor(m.Browser) is { } p)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, p.Glyph, "Speed · volume", p.DialLine1, p.DialLine2, IsInteractive, p.Tone)));
            return;
        }
        if (m.NeedsPermission)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, BrowserGlyphs.Lock, $"{m.Browser!.Brand} · {m.Domain}", "Site needs permission",
                flash?.Text ?? "Push to allow it", IsInteractive, Tone.Warn)));
            return;
        }
        if (m.MuteOnly && m.Tab is { } only)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.SpeedDial(t, new SpeedView(true, 1, null, only.Muted, m.Domain,
                flash ?? new Notice(only.Muted ? "Turn up: unmute" : "Turn down: mute", Tone.Normal)), IsInteractive)));
            return;
        }
        if (m.Media is not { } media)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, BrowserGlyphs.Speed, "Speed · volume", "Nothing playing", "Play something in a tab", IsInteractive, Tone.Normal)));
            return;
        }
        var rate = Fresh && _pendingRate is { } pr ? pr : media.Rate;
        var vol = Fresh && _pendingVolume is { } pv ? pv : media.Volume;
        var muted = m.Tab?.Muted == true || media.ElementMuted == true;
        var notice = flash ?? (_b.SafeMode && IsInteractive ? new Notice("Safe mode", Tone.Warn) : null);
        if (_volumeMode && media.Volume is null && notice is null) notice = new Notice("Tab mute only", Tone.Normal);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.SpeedDial(t, new SpeedView(_volumeMode, rate, vol, muted, m.Domain, notice), IsInteractive)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Tab speed / volume")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Select("start", "Starts in", [("speed", "Speed"), ("volume", "Volume")])
        .Info("How to use", "Turn to change the speed (0.25×–4×) or the volume; push to switch. Below 0 % the tab is muted.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}
