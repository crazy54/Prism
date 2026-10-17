using PrismControl.Core.Actions;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Macros.Art;
using PrismControl.Macros.Engine;

namespace PrismControl.Macros.Actions;

// ------------------------------------------------------------------ Macro key

public sealed class MacroKeySettings
{
    public string? Label { get; set; }
    /// <summary>Runs on a press.</summary>
    public MacroScript Macro { get; set; } = new();
    /// <summary>Optional: runs when the key is held 0.5 s. Empty = holding is just a press.</summary>
    public MacroScript LongMacro { get; set; } = new();
}

/// <summary>
/// Runs a step list. Without a long-press list it runs on key down; with one, a short press runs <c>macro</c> on release and
/// a 0.5 s hold runs <c>longMacro</c> (key holds work on every device, Galleon included). Shows a progress beat while running,
/// then the app's check mark or alert.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.macro", Name = "Macro",
    Icon = "imgs/actions/macros/macro/icon", KeyImage = "imgs/actions/macros/macro/key",
    Tooltip = "Runs a list of steps: key chords, text, media keys, apps, URLs and delays. Hold for an optional second list.",
    PropertyInspector = MacroPi.Page)]
public sealed class MacroKey : MacroKeyBase<MacroKeySettings>
{
    protected override string Source => "macro";
    protected override bool ShowOkWhenDone => true;
    protected override string RunningLabel => Label;
    protected override MacroScript PressScript() => Settings.Macro;
    protected override IEnumerable<MacroScript> Scripts() => [Settings.Macro, Settings.LongMacro];

    private bool HasLong => Settings.LongMacro.HasSteps;

    private string Label => !string.IsNullOrWhiteSpace(Settings.Label) ? Settings.Label!
        : Settings.Macro.Steps.Count == 1 ? MacroStep.SafeDescribe(Settings.Macro.Steps[0])
        : Settings.Macro.HasSteps ? $"{Settings.Macro.Steps.Count} steps" : "Macro";

    protected override Task OnKeyDownAsync(KeyDownEvent e)
    {
        if (!HasLong) Run(Settings.Macro, "press");
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (HasLong) Run(Settings.Macro, "press");
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        if (HasLong) Run(Settings.LongMacro, "long press");
        return Task.CompletedTask;
    }

    protected override object? DescribeState() => PiState(new()
    {
        ["summary"] = Settings.Macro.Describe(),
        ["longSummary"] = HasLong ? Settings.LongMacro.Describe() : "Holding the key is a normal press.",
    });

    protected override SvgDocument IdleFace() => Settings.Macro.HasSteps || HasLong
        ? MacroArt.GlyphKey(Theme, MacroGlyphs.Macro, Label)
        : MacroArt.GlyphKey(Theme, MacroGlyphs.Macro, "Set up", dim: true);
}

// ------------------------------------------------------------------ Hotkey

public sealed class HotkeySettings
{
    public string? Label { get; set; }
    /// <summary>"Ctrl+Shift+T" (see KeyChord for names).</summary>
    public string? Chord { get; set; }
    public bool ScanMode { get; set; }
}

/// <summary>Sends one key chord on key down: the simplest macro.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.hotkey", Name = "Hotkey",
    Icon = "imgs/actions/macros/hotkey/icon", KeyImage = "imgs/actions/macros/hotkey/key",
    Tooltip = "Sends one key chord, such as Ctrl+Shift+T or Win+Left.",
    PropertyInspector = MacroPi.Page)]
public sealed class HotkeyKey : MacroKeyBase<HotkeySettings>
{
    protected override string Source => "hotkey";

    protected override MacroScript PressScript() => string.IsNullOrWhiteSpace(Settings.Chord)
        ? new MacroScript()
        : MacroScript.Of(new ChordStep(Settings.Chord!) { ScanMode = Settings.ScanMode });

    protected override SvgDocument IdleFace()
    {
        if (KeyChord.TryParse(Settings.Chord, out var chord, out _) && !chord.IsEmpty)
            return MacroArt.ChordKey(Theme, chord, Settings.Label);
        return MacroArt.GlyphKey(Theme, MacroGlyphs.Keycap, string.IsNullOrWhiteSpace(Settings.Chord) ? "Set up" : "Check keys", dim: true);
    }

    /// <summary>A chord that cannot be sent (unknown key, reserved by Windows) keeps the hotkey's own "Check keys" face.</summary>
    protected override SvgDocument FixFace() => MacroArt.GlyphKey(Theme, MacroGlyphs.Keycap, "Check keys", dim: true);
}

// ------------------------------------------------------------------ Type text

public sealed class TypeTextSettings
{
    public string? Label { get; set; }
    public string? Text { get; set; }
    public int CharDelayMs { get; set; }
}

/// <summary>Types text as Unicode (layout-independent; new lines press Enter).</summary>
/// <remarks>Uses the default property inspector: the text is a <see cref="PiForm.TextArea"/>.</remarks>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.type-text", Name = "Type Text",
    Icon = "imgs/actions/macros/type-text/icon", KeyImage = "imgs/actions/macros/type-text/key",
    Tooltip = "Types text into the app in front. Stored in plain text: never use it for passwords.")]
public sealed class TypeTextKey : MacroKeyBase<TypeTextSettings>
{
    protected override string Source => "type text";
    protected override string RunningLabel => "Typing";

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Text to type")
        .TextArea("text", "Text", "Hello from the Stream Deck", rows: 5)
        .Number("charDelayMs", "Delay per char (ms)", 0, TextStep.MaxCharDelayMs, 5)
        .Text("label", "Key label", "optional, shown on the key")
        .Info("Last run", stateKey: "status")
        .Info("Note", "Stored in plain text and exported with profiles: never put passwords here. New lines press Enter.");

    protected override MacroScript PressScript() => string.IsNullOrEmpty(Settings.Text)
        ? new MacroScript()
        : MacroScript.Of(new TextStep(Settings.Text!) { CharDelayMs = Settings.CharDelayMs });

    protected override SvgDocument IdleFace()
    {
        if (string.IsNullOrEmpty(Settings.Text)) return MacroArt.GlyphKey(Theme, MacroGlyphs.Text, "Set up", dim: true);
        var label = !string.IsNullOrWhiteSpace(Settings.Label) ? Settings.Label! : Preview(Settings.Text!);
        return MacroArt.GlyphKey(Theme, MacroGlyphs.Text, label);
    }

    private static string Preview(string text)
    {
        var line = text.Replace("\r", "").Split('\n').FirstOrDefault(l => l.Trim().Length > 0)?.Trim() ?? "Text";
        return line.Length > 10 ? line[..9] + "…" : line;
    }
}

// ------------------------------------------------------------------ Launch

public sealed class LaunchSettings
{
    public string? Label { get; set; }
    /// <summary>A program, file, folder, app link (ms-settings:sound) or an http(s) URL.</summary>
    public string? Target { get; set; }
    public string? Arguments { get; set; }
    public string? WorkingDirectory { get; set; }
    /// <summary>Bring the running app to the front instead of starting another one (programs only).</summary>
    public bool FocusIfRunning { get; set; }
}

/// <summary>Starts an app (optionally focusing it when it already runs) or opens an http(s) URL.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.launch", Name = "Launch",
    Icon = "imgs/actions/macros/launch/icon", KeyImage = "imgs/actions/macros/launch/key",
    Tooltip = "Starts an app, file or folder, or opens a web address. Can focus the app when it is already running.")]
public sealed class LaunchKey : MacroKeyBase<LaunchSettings>
{
    protected override string Source => "launch";
    protected override string RunningLabel => "Opening";

    private bool IsUrl => LaunchPolicy.IsWebUrl(Settings.Target);

    protected override MacroScript PressScript()
    {
        if (string.IsNullOrWhiteSpace(Settings.Target)) return new MacroScript();
        if (IsUrl) return MacroScript.Of(new OpenUrlStep(Settings.Target!));
        return MacroScript.Of(new LaunchStep
        {
            Target = Settings.Target!,
            Arguments = Settings.Arguments,
            WorkingDirectory = Settings.WorkingDirectory,
            FocusIfRunning = Settings.FocusIfRunning,
        });
    }

    /// <summary>What a press will open, shown before anything runs: the scheme and host of a URL, or the file name.</summary>
    internal string Opens()
    {
        var target = Settings.Target;
        if (string.IsNullOrWhiteSpace(target)) return "Nothing yet.";
        if (IsUrl) return UrlPolicy.TryParse(target, out var uri, out var error) ? UrlPolicy.Describe(uri) : error;
        if (LaunchPolicy.Validate(target, Settings.Arguments, Settings.WorkingDirectory) is [var problem, ..]) return problem;
        return LaunchPolicy.ShortName(Environment.ExpandEnvironmentVariables(target)) + (Settings.FocusIfRunning ? " (focus if running)" : "");
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Open")
        .Text("target", "Target", @"C:\Windows\notepad.exe, ms-settings:sound or https://example.com")
        .Text("arguments", "Arguments", "optional")
        .Text("workingDirectory", "Start in", "optional folder")
        .Checkbox("focusIfRunning", "Focus if running")
        .Text("label", "Key label", "optional")
        .Info("Opens", stateKey: "opens")
        .Heading("On this PC")
        .Info("Would run", stateKey: "wouldRun")
        .Info("Trust", stateKey: "review")
        .Button("macros.trust", "Trust on this PC")
        .Info("Last run", stateKey: "status");

    protected override object? DescribeState() => PiState(new() { ["opens"] = Opens() });

    protected override SvgDocument IdleFace()
    {
        if (string.IsNullOrWhiteSpace(Settings.Target)) return MacroArt.GlyphKey(Theme, MacroGlyphs.Launch, "Set up", dim: true);
        string label;
        if (!string.IsNullOrWhiteSpace(Settings.Label)) label = Settings.Label!;
        else if (IsUrl && UrlPolicy.TryParse(Settings.Target, out var uri, out _)) label = uri.IdnHost.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.IdnHost[4..] : uri.IdnHost;
        else label = Path.GetFileNameWithoutExtension(LaunchPolicy.ShortName(Environment.ExpandEnvironmentVariables(Settings.Target!))) is { Length: > 0 } n ? n : "Launch";
        return MacroArt.GlyphKey(Theme, MacroGlyphs.Launch, label);
    }
}

// ------------------------------------------------------------------ Media key

public sealed class MediaKeySettings
{
    public string? Label { get; set; }
    /// <summary>playPause, next, previous, stop, volumeUp, volumeDown or mute. Empty = not set up (so a fresh key does nothing).</summary>
    public string? Key { get; set; }
}

/// <summary>Sends a media key (play/pause, next, previous, stop, volume up/down, mute) to whatever app handles media.</summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.media", Name = "Media Key",
    Icon = "imgs/actions/macros/media/icon", KeyImage = "imgs/actions/macros/media/key",
    Tooltip = "Sends a media key: play/pause, next, previous, stop, volume up/down or mute.")]
public sealed class MediaKeyAction : MacroKeyBase<MediaKeySettings>
{
    protected override string Source => "media key";

    private MediaKey? Key => MediaKeys.TryParse(Settings.Key, out var k) ? k : null;

    protected override MacroScript PressScript() => Key is { } k ? MacroScript.Of(new MediaKeyStep(k)) : new MacroScript();

    protected override PiForm? DescribeForm() => new PiForm()
        .Select("key", "Media key", [("", "Choose…"), .. Enum.GetValues<MediaKey>().Select(k => (MediaKeys.Value(k), MediaKeys.Label(k)))])
        .Text("label", "Key label", "optional")
        .Info("Last run", stateKey: "status");

    protected override SvgDocument IdleFace()
    {
        if (Key is not { } k) return MacroArt.GlyphKey(Theme, (d, c) => MacroGlyphs.Media(d, c, MediaKey.PlayPause), "Set up", dim: true);
        var label = !string.IsNullOrWhiteSpace(Settings.Label) ? Settings.Label! : MediaKeys.ShortLabel(k);
        return MacroArt.GlyphKey(Theme, (d, c) => MacroGlyphs.Media(d, c, k), label);
    }
}
