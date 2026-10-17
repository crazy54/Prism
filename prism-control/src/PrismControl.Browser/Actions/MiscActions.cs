using System.Globalization;
using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Render;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Browser.Actions;

public sealed class DownloadKeySettings : BrowserSettingsBase;

/// <summary>
/// The download ring: live progress of the newest download (the extension polls bytes at 1 Hz). Press = show it in
/// its folder (Chrome does that); hold = open a finished, safe download with the shell. Programs, scripts and
/// installers need a second press within 3 s. Needs the extension's optional "downloads" permission.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.download", Name = "Download Ring",
    Icon = "imgs/actions/browser/download/icon", KeyImage = "imgs/actions/browser/download/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Progress of your newest download. Press to show it in its folder; hold to open it.")]
public sealed class DownloadKeyAction : BrowserKeyBase<DownloadKeySettings>
{
    public static readonly TimeSpan ConfirmWindow = TimeSpan.FromSeconds(3);
    private (int Id, long At)? _confirm;

    private protected override BrowserChange Watches => BrowserChange.Downloads;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (!b.Caps.Downloads && !hub.SafeMode)
        {
            Send(hub, b.Key, Wire.Op.PermOpenOptions, new JsonObject { ["section"] = Wire.OptionsSection.Features }, _ => new Notice("ALLOW IT", Tone.Good, "IN THE BROWSER"));
            return Task.CompletedTask;
        }
        if (Selectors.Download(b) is not { } d) { ShowAlert(); return Task.CompletedTask; }
        if (_confirm is { } c && c.Id == d.Id && Time.GetElapsedTime(c.At) < ConfirmWindow)
        {
            _confirm = null;
            return Open(hub, b.Key, d, confirmed: true);
        }
        Send(hub, b.Key, Wire.Op.DownloadShow, new JsonObject { ["id"] = d.Id });
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        if (Selectors.Download(b) is not { } d) { ShowAlert(); return Task.CompletedTask; }
        if (d.State == "in_progress")
        {
            Send(hub, b.Key, d.Paused ? Wire.Op.DownloadResume : Wire.Op.DownloadPause, new JsonObject { ["id"] = d.Id }, _ => new Notice(d.Paused ? "RESUMED" : "PAUSED", Tone.Good));
            return Task.CompletedTask;
        }
        return Open(hub, b.Key, d, confirmed: false);
    }

    private Task Open(BrowserHub hub, string key, DownloadItem d, bool confirmed)
    {
        Track(Task.Run(async () =>
        {
            var o = await hub.OpenDownloadAsync(key, d, confirmed);
            Post(() =>
            {
                Notice? n = o switch
                {
                    OpenOutcome.Opened => new Notice("OPENED", Tone.Good),
                    OpenOutcome.ConfirmNeeded => new Notice("PRESS AGAIN", Tone.Warn, "TO RUN IT"),
                    OpenOutcome.NotReady => new Notice("NOT READY", Tone.Warn),
                    OpenOutcome.Dangerous => new Notice("BLOCKED", Tone.Error, "CHECK CHROME"),
                    OpenOutcome.PrivacyBlocked => new Notice("STREAMER SAFE", Tone.Warn, "BLOCKED"),
                    OpenOutcome.NoPermission => new Notice("ALLOW IT", Tone.Warn, "IN EXTENSION"),
                    OpenOutcome.SafeMode => new Notice("SAFE MODE", Tone.Warn, "NOT OPENED"),
                    OpenOutcome.NoBrowser => new Notice("NO BROWSER", Tone.Warn),
                    _ => new Notice("FAILED", Tone.Error),
                };
                if (o == OpenOutcome.ConfirmNeeded) _confirm = (d.Id, Time.GetTimestamp());
                if (o is not (OpenOutcome.Opened or OpenOutcome.ConfirmNeeded or OpenOutcome.SafeMode)) ShowAlert();
                FlashState.Set(Time, n, o == OpenOutcome.ConfirmNeeded ? ConfirmWindow : null);
                Render();
            });
        }));
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var flash = FlashState.Get(Time);
        if (!b!.Caps.Downloads)
        {
            SetImage(BrowserArt.DownloadKey(Theme, new DownloadKeyView(null, "none", "DOWNLOADS", flash ?? new Notice("PRESS TO ALLOW", Tone.Warn))));
            return;
        }
        if (Selectors.Download(b) is not { } d)
        {
            SetImage(BrowserArt.DownloadKey(Theme, new DownloadKeyView(null, "none", "NO DOWNLOADS", flash)));
            return;
        }
        var state = d.State switch
        {
            "complete" => "done",
            "interrupted" => "failed",
            _ => d.Paused ? "paused" : "active",
        };
        var label = state switch
        {
            "paused" => "PAUSED",
            "failed" => d.Error == "USER_CANCELED" ? "CANCELED" : "FAILED",
            _ => d.Name is { Length: > 0 } name && Core.Render.StrokeFont.Supports(name) ? name : state == "done" ? "DONE" : "DOWNLOADING",
        };
        SetImage(BrowserArt.DownloadKey(Theme, new DownloadKeyView(state == "done" ? 1 : d.Fraction, state, label, flash)));
    }
}

public sealed class PrivacyKeySettings : BrowserSettingsBase
{
    /// <summary>What a press toggles to from "off": domain (default) or hidden. Hold always goes to hidden.</summary>
    public string Level { get; set; } = "domain";
}

/// <summary>
/// Streamer-safe: what the browsers may show on the deck. Press toggles off ⇄ domains (or hidden); hold = hidden.
/// It turns on by itself while OBS runs (setting). Enforced in the extension, so hidden titles never leave the browser.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.privacy", Name = "Streamer Safe",
    Icon = "imgs/actions/browser/privacy/icon", KeyImage = "imgs/actions/browser/privacy/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Hide tab titles (domains only) or everything while you stream. Press to toggle; hold to hide everything.")]
public sealed class PrivacyKeyAction : BrowserKeyBase<PrivacyKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Privacy;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (B?.Hub is not { } hub) { ShowAlert(); return Task.CompletedTask; }
        var current = hub.PrivacySetting;
        var next = current == Wire.Privacy.Full ? (Settings.Level == Wire.Privacy.Hidden ? Wire.Privacy.Hidden : Wire.Privacy.Domain) : Wire.Privacy.Full;
        Apply(hub, next);
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (B?.Hub is not { } hub) return Task.CompletedTask;
        Apply(hub, Wire.Privacy.Hidden);
        return Task.CompletedTask;
    }

    private void Apply(BrowserHub hub, string level)
    {
        hub.SetPrivacySetting(level);
        // Keep it across restarts: the global "browser" section owns the level.
        var g = GlobalSettings.GetSection<BrowserGlobalSettings>(BrowserGlobalSettings.Section);
        g.Privacy = level;
        GlobalSettings.SetSection(BrowserGlobalSettings.Section, g);
        Render();
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        if (B.Hub is not { } hub)
        {
            SetImage(BrowserArt.MessageKey(Theme, BrowserGlyphs.Plug, "UNAVAILABLE", "SEE PLUGIN LOG", Tone.Error));
            return;
        }
        var s = hub.Store.Current;
        // MED 8: show what the keys really get: the deck's request or a stricter level an extension applies by itself
        // (its own setting, or its "while streaming" level). AUTO only when the deck's own auto mode is what turned it on.
        var effective = hub.EffectivePrivacy(s);
        var auto = hub.StreamingActive && hub.PrivacySetting == Wire.Privacy.Full && s.RequestedPrivacy != Wire.Privacy.Full;
        SetImage(BrowserArt.PrivacyKey(Theme, effective, auto, s.Panic));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Select("level", "Press turns on", [("domain", "Domains only (titles hidden)"), ("hidden", "Hide everything")])
        .Checkbox(PiForm.Global(BrowserGlobalSettings.Section, "autoStreamerSafe"), "Turn on by itself while OBS runs");
}

public sealed class PanicKeySettings : BrowserSettingsBase;

/// <summary>Panic (for streamers): one press mutes every tab, hides everything and minimizes the browsers. Press again to end (tabs stay muted).</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.panic", Name = "Browser Panic",
    Icon = "imgs/actions/browser/panic/icon", KeyImage = "imgs/actions/browser/panic/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Mutes every tab, hides all titles and minimizes the browsers at once. Press again to end.")]
public sealed class PanicKeyAction : BrowserKeyBase<PanicKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Privacy;

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (B?.Hub is not { } hub) { ShowAlert(); return Task.CompletedTask; }
        if (hub.Store.Current.Panic) { hub.ReleasePanic(); Render(); return Task.CompletedTask; }
        Track(Task.Run(async () =>
        {
            await hub.PanicAsync();
            Post(() => { if (hub.SafeMode) FlashState.Set(Time, new Notice("SAFE MODE", Tone.Warn)); Render(); });
        }));
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var active = B.Hub?.Store.Current.Panic == true;
        var flash = FlashState.Get(Time);
        if (flash is not null)
        {
            SetImage(BrowserArt.GlyphKey(Theme, BrowserGlyphs.Panic, active ? "PANIC ON" : "PANIC", on: active, micro: flash.Text, microTone: flash.Tone, hue: active ? Theme.Spectrum[10] : null));
            return;
        }
        SetImage(BrowserArt.PanicKey(Theme, active));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Info("Panic", "One press mutes every tab in every connected browser, hides titles (streamer-safe: hidden) and minimizes the browser windows. Press again to end it; tabs stay muted.");
}

public sealed class MeetKeySettings : BrowserSettingsBase
{
    /// <summary>mic | camera | hangup.</summary>
    public string Control { get; set; } = "mic";
}

/// <summary>
/// Web meeting keys: live mic and camera state with toggles, and hang up (hold, so a stray press never ends a call).
/// Works where the meeting site registers the Media Session mic/camera/hang-up handlers.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.meet", Name = "Web Meeting",
    Icon = "imgs/actions/browser/meet/icon", KeyImage = "imgs/actions/browser/meet/key",
    Controllers = Controllers.Keypad, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "Mic, camera or hang-up for a meeting in a browser tab. Hang-up needs a hold.")]
public sealed class MeetKeyAction : BrowserKeyBase<MeetKeySettings>
{
    private protected override BrowserChange Watches => BrowserChange.Media;

    private string Action => Settings.Control switch { "camera" => "togglecamera", "hangup" => "hangup", _ => "togglemicrophone" };

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        var m = Selectors.Meeting(b);
        if (m is null || !m.Has(Action)) { ShowAlert(); FlashState.Set(Time, new Notice("NO MEETING", Tone.Warn)); Render(); return Task.CompletedTask; }
        if (Settings.Control == "hangup") { FlashState.Set(Time, new Notice("HOLD TO END", Tone.Warn), TimeSpan.FromSeconds(1.5)); Render(); return Task.CompletedTask; }
        Send(hub, b.Key, Wire.Op.MediaAction, new JsonObject { ["key"] = m.Key, ["action"] = Action });
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (Connected(out var hub) is not { } b) return Task.CompletedTask;
        var m = Selectors.Meeting(b);
        if (m is null || !m.Has(Action)) { ShowAlert(); return Task.CompletedTask; }
        Send(hub, b.Key, Wire.Op.MediaAction, new JsonObject { ["key"] = m.Key, ["action"] = Action }, _ => Settings.Control == "hangup" ? new Notice("ENDED", Tone.Good) : null);
        return Task.CompletedTask;
    }

    internal override void Render()
    {
        if (!IsVisible || B is null) return;
        var b = B.Target(Settings.Browser);
        if (DrawProblem(b)) return;
        var m = Selectors.Meeting(b!);
        var available = m is not null && m.Has(Action);
        bool? state = Settings.Control switch { "camera" => m?.Camera, "hangup" => null, _ => m?.Mic };
        SetImage(BrowserArt.MeetKey(Theme, Settings.Control, state, available, FlashState.Get(Time)));
    }

    protected override PiForm? DescribeForm() => base.DescribeForm()!
        .Select("control", "Key", [("mic", "Microphone (press to toggle)"), ("camera", "Camera (press to toggle)"), ("hangup", "Hang up (hold)")]);
}

public sealed class PreviewDialSettings : BrowserSettingsBase;

/// <summary>
/// The live tab preview widget: the active tab of a browser window, captured at ≤ 2 fps while the widget is visible.
/// Turn = pick another window; push = bring that window to the front. Needs the extension's "all sites" permission
/// (asked once from the extension's options); off while streamer-safe is on.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.browser.preview", Name = "Live Tab Preview",
    Icon = "imgs/actions/browser/preview/icon", KeyImage = "imgs/actions/browser/preview/key", EncoderIcon = "imgs/actions/browser/preview/dial",
    Controllers = Controllers.Encoder, Layout = Layouts.Canvas.Path, PropertyInspector = BrowserBinding.PiPage,
    Tooltip = "A live view of the active tab (up to 2 frames a second). Turn to pick a window, push to bring it up.",
    TriggerRotate = "Pick window", TriggerPush = "Bring to front", TriggerTouch = "Bring to front")]
public sealed class PreviewDialAction : DialAction<PreviewDialSettings>, IDisposable
{
    public static readonly TimeSpan Resubscribe = TimeSpan.FromSeconds(18);   // the extension expires a subscription after 30 s; renew within 20 s
    private BrowserBinding? _b;
    private Flash _flash;
    private RenderLoop? _loop;
    private int _windowIndex;
    private (string Browser, int Window, long At)? _subscribed;
    private readonly List<Task> _pending = [];

    internal Task PendingAsync() { lock (_pending) return Task.WhenAll([.. _pending]); }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = BrowserBinding.Attach(this, Services, BrowserChange.Preview | BrowserChange.Windows | BrowserChange.Tabs, () => _loop?.Invalidate());
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Pick window", "Bring to front", "Bring to front");
        else SetTriggerDescription("Pick window", "Bring to front");
        _loop = StartRenderLoop(Tick, TimeSpan.FromMilliseconds(500));
        Tick();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Unsubscribe();
        Dispose();
        return Task.CompletedTask;
    }

    private (BrowserInstance? B, BrowserWindowInfo? W) Target()
    {
        var b = _b?.Target(Settings.Browser);
        if (b is not { Connected: true }) return (b, null);
        var windows = b.Windows.Values.Where(w => w.Type == "normal").OrderByDescending(w => w.Id == b.CurrentWindowId).ThenBy(w => w.Id).ToList();
        if (windows.Count == 0) return (b, null);
        return (b, windows[((_windowIndex % windows.Count) + windows.Count) % windows.Count]);
    }

    private bool CanPreview(BrowserInstance b) => b.Caps.AllUrls && Wire.Privacy.Rank(b.Privacy) == 0;

    private void Tick()
    {
        var (b, w) = Target();
        if (_b?.Hub is { } hub && b is { Connected: true } && w is not null && CanPreview(b))
        {
            var due = _subscribed is not { } s || s.Browser != b.Key || s.Window != w.Id || Time.GetElapsedTime(s.At) > Resubscribe;
            if (due)
            {
                if (_subscribed is { } old && (old.Browser != b.Key || old.Window != w.Id)) Unsubscribe();
                _subscribed = (b.Key, w.Id, Time.GetTimestamp());
                var key = b.Key;
                var win = w.Id;
                lock (_pending) _pending.Add(Task.Run(() => hub.Commands.SendAsync(key, Wire.Op.PreviewSubscribe, new JsonObject { ["windowId"] = win, ["fps"] = 2, ["w"] = 360, ["h"] = 180 })));
            }
        }
        Render();
    }

    private void Unsubscribe()
    {
        if (_subscribed is not { } s || _b?.Hub is not { } hub) return;
        _subscribed = null;
        lock (_pending) _pending.Add(Task.Run(() => hub.Commands.SendAsync(s.Browser, Wire.Op.PreviewSubscribe, new JsonObject { ["windowId"] = s.Window, ["fps"] = 0 })));
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (e.Ticks == 0) return Task.CompletedTask;
        _windowIndex += Math.Sign(e.Ticks);
        _loop?.Invalidate();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => Activate();
    protected override Task OnTouchTapAsync(TouchTapEvent e) => Activate();

    private Task Activate()
    {
        var (b, w) = Target();
        if (_b?.Hub is not { } hub || b is not { Connected: true }) { ShowAlert(); return Task.CompletedTask; }
        if (!b.Caps.AllUrls && !hub.SafeMode)
        {
            var key = b.Key;
            lock (_pending)
            {
                _pending.Add(Task.Run(async () =>
                {
                    var r = await hub.Commands.SendAsync(key, Wire.Op.PermOpenOptions, new JsonObject { ["section"] = Wire.OptionsSection.Features });
                    Post(() => { _flash.Set(Time, r.Ok ? new Notice("Allow it in the page that opened", Tone.Good) : BrowserBinding.DialNoticeFor(r, false)); _loop?.Invalidate(); });
                }));
            }
            return Task.CompletedTask;
        }
        var tab = w is null ? null : b.ActiveTab(w.Id);
        if (tab is null) { ShowAlert(); return Task.CompletedTask; }
        lock (_pending)
        {
            _pending.Add(Task.Run(async () =>
            {
                var o = await hub.FocusTabAsync(b.Key, tab.Id, raise: true);
                Post(() => { if (BrowserBinding.DialNoticeFor(o) is { } n) _flash.Set(Time, n); _loop?.Invalidate(); });
            }));
        }
        return Task.CompletedTask;
    }

    internal void Render()
    {
        if (!IsVisible || _b is null) return;
        var t = Theme;
        var (b, w) = Target();
        if (_b.ProblemFor(b) is { } p)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.MessageDial(t, p.Glyph, "Live preview", p.DialLine1, p.DialLine2, IsInteractive, p.Tone)));
            return;
        }
        var flash = _flash.Get(Time);
        var count = b!.Windows.Values.Count(x => x.Type == "normal");
        var caption = $"Live · {b.Brand}" + (count > 1 && w is not null ? $" · window {(((_windowIndex % count) + count) % count) + 1}/{count}" : "");
        if (Wire.Privacy.Rank(b.Privacy) > 0 || Wire.Privacy.Rank(_b.Snapshot.RequestedPrivacy) > 0)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.PreviewDial(t, new PreviewView(null, caption, false,
                new Notice("Off in streamer-safe", Tone.Warn)), IsInteractive)));
            return;
        }
        if (!b.Caps.AllUrls)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.PreviewDial(t, new PreviewView(null, caption, false,
                flash ?? new Notice("Push to allow the preview", Tone.Warn, "Asked once")), IsInteractive)));
            return;
        }
        if (w is null)
        {
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.PreviewDial(t, new PreviewView(null, caption, false, new Notice("No browser window", Tone.Normal)), IsInteractive)));
            return;
        }
        // LOW 15: never show a frame while the window's active tab is hidden in any way (an always-hidden site).
        var frame = b.ActiveTab(w.Id) is { Hidden: null } ? _b.Hub!.Previews.Get(b.Key, w.Id) : null;
        var fresh = frame is { } f && _b.Hub!.Store.NowMs - f.At < 3000;
        var notice = flash ?? (w.State == "minimized" ? new Notice("The window is minimized", Tone.Normal, "Push to bring it up") : null);
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, BrowserArt.PreviewDial(t, new PreviewView(frame?.Frame, caption, fresh, notice), IsInteractive)));
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Live tab preview")
        .Select("browser", "Browser", optionsFrom: "browser.list")
        .Info("About", "Shows the active tab of a browser window at up to 2 frames a second while the widget is on screen. It needs the extension's \"all sites\" permission and is off while streamer-safe is on.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => _b?.PiState();
    protected override Task OnPropertyInspectorAppearedAsync() { _b?.PushPiState(force: true); return Task.CompletedTask; }

    public void Dispose() { _b?.Dispose(); _b = null; }
}
