using System.Text.Json.Nodes;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.Actions;
using PrismControl.Ai.Services.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Scheduling;

namespace PrismControl.Ai.Apps.Actions;

public sealed class AppKeySettings
{
    /// <summary>claude-desktop · chatgpt · copilot · vscode · cursor · gemini.</summary>
    public string App { get; set; } = "claude-desktop";
}

/// <summary>
/// A desktop AI app on a key: running dot, a ring while it is in front, a hollow mic while it holds an open microphone (voice
/// mode, inferred), and the agent tasks it hosts (Codex in ChatGPT, Claude Code in Claude Desktop). Whether a chat app is
/// generating is unknown (no supported signal) and never drawn. Press = focus it or open it. Hold = a new chat (documented links only).
/// </summary>
[StreamDeckAction(Ai2Ids.App, Name = "AI App", Controllers = Controllers.Keypad,
    Tooltip = "Claude Desktop, ChatGPT, Copilot, VS Code, Cursor or Gemini: live status. Press to focus or open; hold for a new chat.",
    Icon = "imgs/actions/ai/app/icon", KeyImage = "imgs/actions/ai/app/key")]
public sealed class AppKeyAction : KeyAction<AppKeySettings>, IDisposable
{
    private Ai2Binding? _b;

    public string AppId => AppCatalog.Find(Settings.App)?.Id ?? "claude-desktop";

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) _b.Lease(_b.S!.Apps.Demand());
        StartRenderLoop(Render, TimeSpan.FromSeconds(1));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(AppKeySettings settings)
    {
        Render();
        return Task.CompletedTask;
    }

    public static string LaunchText(LaunchResult r) => r switch
    {
        LaunchResult.Focused => "FOCUSED",
        LaunchResult.AlreadyFocused => "IN FRONT",
        LaunchResult.Launched => "OPENING",
        LaunchResult.OpenedNewChat => "NEW CHAT",
        LaunchResult.NotInstalled => "NOT INSTALLED",
        LaunchResult.Elevated => "ADMIN APP",
        LaunchResult.Refused => "REFUSED",
        LaunchResult.SafeMode => "SAFE MODE",
        _ => "DIDN'T START",
    };

    private static bool Bad(LaunchResult r) => r is not (LaunchResult.Focused or LaunchResult.AlreadyFocused or LaunchResult.Launched or LaunchResult.OpenedNewChat);

    protected override async Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var r = await s.Launcher.FocusOrLaunchAsync(s.Apps.Get(AppId), CancellationToken.None).ConfigureAwait(false);
        Post(() => { _b?.SetFlash(LaunchText(r), Bad(r)); Render(); });
    }

    protected override async Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var r = await s.Launcher.NewChatAsync(s.Apps.Get(AppId), CancellationToken.None).ConfigureAwait(false);
        Post(() => { _b?.SetFlash(LaunchText(r), Bad(r)); Render(); });
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("App")
        .Select("app", "App", optionsFrom: "apps.list")
        .Info("Shows", "Running, in front, and a hollow mic (~) while the app holds an open microphone (its voice mode; inferred, not proof of talking). Whether a chat app is generating has no supported signal, so it is never shown.")
        .Info("Keys", "Press: focus the app, or open it. Hold: a new chat (Claude Desktop: claude://claude.ai/new, ChatGPT: codex://new); other apps just open.");

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => Ai2Pi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s) { SetImage(Ai2Binding.OfflineKey(Theme)); return; }
        _b.Expire();
        SetImage(AppArt.Key(Theme, s.Apps.Get(AppId), Time.GetUtcNow(), _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

public sealed class AskSettings
{
    public string Target { get; set; } = "claude-desktop";
    /// <summary>The prompt; <c>{selection}</c> is replaced (without it the selection is appended). Plain text: no secrets.</summary>
    public string Template { get; set; } = "{selection}";
    /// <summary>At most this many characters of the selection (also capped by the target: 5,000 for claude-cli, 2,000 for web).</summary>
    public int MaxChars { get; set; } = 2000;
}

/// <summary>
/// "Ask AI about this": copies the selection in the app in front and opens the chosen AI app or site with it PRE-FILLED. It never
/// sends. Documented deep links first; web prefills and Copilot's link are labeled undocumented / unofficial. The text is never
/// logged or drawn. Key: press = ask. Dial: turn = pick a target (installed apps with documented links, plus this key's own), push = ask.
/// </summary>
[StreamDeckAction(Ai2Ids.Ask, Name = "Ask AI About This", Controllers = Controllers.Keypad | Controllers.Encoder,
    Tooltip = "Copies your selection and opens Claude, ChatGPT, VS Code, Cursor… with it pre-filled. Never sends.",
    Icon = "imgs/actions/ai/ask/icon", KeyImage = "imgs/actions/ai/ask/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Pick the AI", TriggerPush = "Ask about the selection", TriggerTouch = "Ask about the selection")]
public sealed class AskAction : DialAction<AskSettings>, IDisposable
{
    private Ai2Binding? _b;
    private int _selected;

    public AskTarget Configured => AskTargets.Find(Settings.Target) ?? AskTargets.All[0];

    /// <summary>The dial's rotation: installed documented app targets, plus this key's configured target (even a web one).</summary>
    public IReadOnlyList<AskTarget> Rotation(Ai2Services s)
    {
        var list = AskTargets.All.Where(t => t.Kind == AskLinkKind.Documented && s.Ask.TargetAvailable(t)).ToList();
        if (!list.Contains(Configured)) list.Insert(0, Configured);
        return list;
    }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        _b = new Ai2Binding(this, Render);
        if (_b.Bind(Services)) _selected = Math.Max(0, Rotation(_b.S!).ToList().IndexOf(Configured));
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(AskSettings settings)
    {
        if (_b?.S is { } s) _selected = Math.Max(0, Rotation(s).ToList().IndexOf(Configured));
        RefreshPropertyInspectorForm();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        if (_b?.S is not { } s) return Task.CompletedTask;
        var n = Rotation(s).Count;
        _selected = ((_selected + e.Ticks) % n + n) % n;
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e) => AskAsync(Configured);

    protected override Task OnDialPressAsync(DialUpEvent e) => AskSelectedAsync();

    protected override Task OnTouchTapAsync(TouchTapEvent e) => AskSelectedAsync();

    private Task AskSelectedAsync()
    {
        if (_b?.S is not { } s) return AskAsync(Configured);
        var rot = Rotation(s);
        return AskAsync(rot[Math.Clamp(_selected, 0, rot.Count - 1)]);
    }

    private async Task AskAsync(AskTarget target)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var (r, _) = await s.Ask.AskAsync(target, Settings.Template, Settings.MaxChars, CancellationToken.None).ConfigureAwait(false);
        Post(() => { _b?.SetFlash(AskArt.ResultText(r), r != AskResult.Opened, TimeSpan.FromSeconds(2.5)); Render(); });
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Ask AI about this")
        .Select("target", "Ask", optionsFrom: "ask.targets")
        .Info("This target", stateKey: "targetNote")
        .TextArea("template", "Prompt ({selection} = the selected text)", "Explain this:\n{selection}", 3)
        .Range("maxChars", "At most", 100, 14000, 100, "chars")
        .Checkbox(PiForm.Global(Ai2Settings.Section, "restoreClipboard"), "Put my clipboard back afterwards")
        .Checkbox(PiForm.Global(Ai2Settings.Section, "webTargetsOnAir"), "Allow web targets while ON AIR")
        .Info("Privacy", "Prism presses Ctrl+C in the app in front, reads the text, puts your clipboard back and opens the AI with the text PRE-FILLED. It never sends it. The text is never logged or shown on a key. App links hand it to that app only; web links also put it in the browser's address bar and history. While ON AIR, web targets are blocked unless you allow them.")
        .Info("Clipboard history", "The selection passes through the clipboard like any copy, so Windows clipboard history (Win+V) and the cloud clipboard (if you turned them on) may keep a copy of it. Prism's own restore of your clipboard is marked to stay out of both. If your clipboard changes again before Prism can put it back, Prism leaves the newer content alone.")
        .Info("Terminals", "Ask AI never presses Ctrl+C in a terminal (Windows Terminal, the console, mintty…) or in VS Code's terminal: there it would interrupt the running program. Select the text in an editor or a browser instead.");

    protected override object? DescribeState() => new { targetNote = Configured.Note };

    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) => Ai2Pi.HandleAsync(_b?.S, type, data);

    private void Render()
    {
        if (_b?.S is not { } s)
        {
            if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Ai2Binding.OfflineDial(Theme)));
            else SetImage(Ai2Binding.OfflineKey(Theme));
            return;
        }
        _b.Expire();
        if (IsDial)
        {
            var rot = Rotation(s);
            SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, AskArt.Dial(Theme, rot, Math.Clamp(_selected, 0, rot.Count - 1), s.Ask.TargetAvailable, _b.Flash, _b.FlashBad)));
        }
        else SetImage(AskArt.Key(Theme, Configured, s.Ask.TargetAvailable(Configured), _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}

public sealed class DictateSettings
{
    /// <summary>auto (VS Code in front → hold Ctrl+I, else Win+H) · windows (Win+H) · vscode (Ctrl+I only into VS Code).</summary>
    public string Mode { get; set; } = "auto";
}

/// <summary>
/// The dictation key. Win+H toggles Windows voice typing anywhere; with VS Code in front, holding the key holds Ctrl+I (VS Code
/// chat's push-to-talk). Dial: push = toggle (a Ctrl+I tap in VS Code, else Win+H), turn = mode. Not in multi-actions (holds).
/// A held Ctrl+I is always released: on key up, on disappear, and by Desktop's 10-second hold watchdog.
/// </summary>
[StreamDeckAction(Ai2Ids.Dictate, Name = "AI Dictation", Controllers = Controllers.Keypad | Controllers.Encoder, SupportedInMultiActions = false,
    Tooltip = "Talk instead of typing: Win+H voice typing, or hold for VS Code chat's push-to-talk (Ctrl+I).",
    Icon = "imgs/actions/ai/dictate/icon", KeyImage = "imgs/actions/ai/dictate/key", Layout = Layouts.Canvas.Path,
    TriggerRotate = "Mode", TriggerPush = "Start / stop dictation", TriggerTouch = "Start / stop dictation")]
public sealed class DictateAction : DialAction<DictateSettings>, IDisposable
{
    private static readonly string[] Modes = ["auto", "windows", "vscode"];
    private Ai2Binding? _b;
    private bool _holding;

    public DictateMode Mode => Settings.Mode?.Trim().ToLowerInvariant() switch { "windows" => DictateMode.Windows, "vscode" => DictateMode.VsCode, _ => DictateMode.Auto };

    public static string ModeLabel(DictateMode m) => m switch { DictateMode.Windows => "WINDOWS VOICE TYPING", DictateMode.VsCode => "VS CODE CHAT ONLY", _ => "AUTO: WIN+H OR VS CODE" };

    public static string KeyModeLabel(DictateMode m) => m switch { DictateMode.Windows => "VOICE TYPING", DictateMode.VsCode => "VS CODE ONLY", _ => "AUTO" };

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Canvas.Path);
        _b = new Ai2Binding(this, Render);
        _b.Bind(Services);
        StartRenderLoop(Render, TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(100));
        Render();
        return Task.CompletedTask;
    }

    protected override async Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        if (_b?.S is { } s && (_holding || s.Dictation.Holding)) await s.Dictation.KeyUpAsync(CancellationToken.None).ConfigureAwait(false);
        _holding = false;
        Dispose();
    }

    protected override async Task OnKeyDownAsync(KeyDownEvent e)
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var r = await s.Dictation.KeyDownAsync(Mode, CancellationToken.None).ConfigureAwait(false);
        // Set synchronously, inside this handler: the mailbox runs the key-up only after this returns, so a quick tap's key-up
        // always sees the hold (a Post hop here used to run AFTER the key-up and left Ctrl+I held until the 10 s watchdog).
        _holding = r == DictateResult.Holding;
        if (!_holding) _b?.SetFlash(DictateArt.ResultText(r), r != DictateResult.Toggled);
        Render();
    }

    protected override async Task OnKeyUpAsync(KeyUpEvent e)
    {
        if (_b?.S is not { } s) return;
        // Release whatever the service still holds for a dictation key, even if this instance missed the hold.
        if (!_holding && !s.Dictation.Holding) return;
        _holding = false;
        var r = await s.Dictation.KeyUpAsync(CancellationToken.None).ConfigureAwait(false);
        if (r == DictateResult.Failed) _b?.SetFlash("DIDN'T RELEASE", true);
        Render();
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ToggleAsync();

    protected override Task OnTouchTapAsync(TouchTapEvent e) => ToggleAsync();

    private async Task ToggleAsync()
    {
        if (_b?.S is not { } s) { ShowAlert(); return; }
        var r = await s.Dictation.ToggleAsync(Mode, CancellationToken.None).ConfigureAwait(false);
        Post(() => { _b?.SetFlash(DictateArt.ResultText(r), r != DictateResult.Toggled); Render(); });
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        var dir = Math.Sign(e.Ticks);
        if (dir == 0) return Task.CompletedTask;
        var i = Array.IndexOf(Modes, Modes[(int)Mode]);
        Settings.Mode = Modes[((i + dir) % Modes.Length + Modes.Length) % Modes.Length];
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Dictation")
        .Select("mode", "Mode", [("auto", "Auto: VS Code chat when VS Code is in front, else Win+H"), ("windows", "Windows voice typing (Win+H)"), ("vscode", "VS Code chat only (hold Ctrl+I)")])
        .Info("How it works", "Win+H toggles Windows voice typing in any app. In VS Code, holding Ctrl+I in the chat input is push-to-talk: hold the key while you talk (at most 10 s per hold). Claude Code's own voice mode isn't available on Bedrock, and Claude Desktop has no voice hotkey on Windows.");

    private void Render()
    {
        if (_b?.S is not { } s)
        {
            if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Ai2Binding.OfflineDial(Theme)));
            else SetImage(Ai2Binding.OfflineKey(Theme));
            return;
        }
        _b.Expire();
        var hint = s.SafeMode ? "SAFE MODE" : s.Dictation.Hint(Mode);
        if (IsDial) SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, DictateArt.Dial(Theme, hint, ModeLabel(Mode), _b.Flash, _b.FlashBad)));
        else SetImage(DictateArt.Key(Theme, hint, KeyModeLabel(Mode), _holding, _b.Flash, _b.FlashBad));
    }

    public void Dispose()
    {
        _b?.Dispose();
        _b = null;
    }
}
