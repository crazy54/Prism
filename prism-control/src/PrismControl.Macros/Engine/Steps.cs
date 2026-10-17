using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace PrismControl.Macros.Engine;

/// <summary>
/// Declares a step type. Adding a step type is one class: derive <see cref="MacroStep"/>, add this attribute and mark its
/// settings with <see cref="StepFieldAttribute"/>. The registry, the JSON format and the property-inspector editor pick it up.
/// </summary>
[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class MacroStepAttribute(string id, string label) : Attribute
{
    /// <summary>The "type" in JSON. Lowercase; never change it after release (saved macros reference it).</summary>
    public string Id { get; } = id;
    public string Label { get; } = label;
    public string? Help { get; set; }
    /// <summary>Position in the editor's "Add step" list.</summary>
    public int Order { get; set; }
}

/// <summary>A step setting the editor shows. The kind is inferred (string: text, number, bool: checkbox, enum: select) unless set.</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class StepFieldAttribute(string label) : Attribute
{
    public string Label { get; } = label;
    /// <summary>text, textarea, chord, path, url, number, checkbox or select.</summary>
    public string? Kind { get; set; }
    public double Min { get; set; } = double.NaN;
    public double Max { get; set; } = double.NaN;
    public string? Placeholder { get; set; }
    public string? Help { get; set; }
}

/// <summary>
/// One step of a macro. Steps are plain settings objects (camelCase JSON, no secrets) plus behavior. The engine runs them
/// in order on a background task; <see cref="ExecuteAsync"/> must observe <see cref="MacroContext.Cancellation"/> and send
/// input only through <see cref="MacroContext.SendAsync"/> (which refuses to type into elevated windows).
/// </summary>
public abstract class MacroStep
{
    /// <summary>Properties this version does not know (written by a newer one): kept so saving never loses them.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }

    /// <summary>A short summary for keys, dials and the editor: "Ctrl+Shift+T", "Wait 250 ms".</summary>
    public abstract string Describe();

    /// <summary>Problems that stop the macro from running (empty = fine).</summary>
    public virtual IEnumerable<string> Validate() => [];

    public abstract Task ExecuteAsync(MacroContext ctx);

    /// <summary>
    /// <see cref="Describe"/> that never throws: settings come from imported profiles, so a step type with a bug (or a value
    /// it did not expect) must not break every render of its key.
    /// </summary>
    public static string SafeDescribe(MacroStep step)
    {
        try { return step.Describe() ?? "(step)"; }
        catch (Exception) { return "Unreadable step"; }
    }

    /// <summary><see cref="Validate"/> that never throws: a step that cannot be checked is reported as a problem (it does not run).</summary>
    public static List<string> SafeValidate(MacroStep step)
    {
        try { return step.Validate().ToList(); }
        catch (Exception ex) { return [$"This step could not be checked ({ex.GetType().Name}): fix it in settings."]; }
    }
}

[MacroStep("chord", "Key chord", Order = 0, Help = "Presses modifiers and a key together, then releases them in reverse order.")]
public sealed class ChordStep : MacroStep
{
    public const int MaxHoldMs = 2000;

    [StepField("Keys", Kind = "chord", Placeholder = "Ctrl+Shift+T")]
    public string Keys { get; set; } = "";

    [StepField("Hold (ms)", Min = 0, Max = MaxHoldMs, Help = "Keep the keys down this long (some games need 20-50 ms). 0 sends the chord at once.")]
    public int HoldMs { get; set; }

    [StepField("Scan-code mode (games)", Help = "Sends hardware scan codes instead of virtual keys, for games that read raw keys.")]
    public bool ScanMode { get; set; }

    public ChordStep() { }
    public ChordStep(string keys) => Keys = keys;

    [JsonIgnore]
    public KeyChord? Chord => KeyChord.TryParse(Keys, out var c, out _) ? c : null;

    public override string Describe() => Chord?.ToString() ?? (string.IsNullOrWhiteSpace(Keys) ? "(no keys)" : Keys.Trim());

    public override IEnumerable<string> Validate()
    {
        if (!KeyChord.TryParse(Keys, out var chord, out var error)) yield return error;
        else if (chord.ReservedReason() is { } reserved) yield return reserved;
        if (HoldMs is < 0 or > MaxHoldMs) yield return $"Hold must be 0-{MaxHoldMs} ms.";
    }

    public override async Task ExecuteAsync(MacroContext ctx)
    {
        var chord = KeyChord.Parse(Keys);
        var (down, up) = InputBuilder.ChordHalves(chord, ctx.ScanCodes, ScanMode);
        if (HoldMs <= 0)
        {
            await ctx.SendAsync([.. down, .. up]).ConfigureAwait(false);
            return;
        }
        try
        {
            await ctx.SendAsync(down).ConfigureAwait(false);
            await ctx.DelayAsync(TimeSpan.FromMilliseconds(HoldMs)).ConfigureAwait(false);
        }
        finally
        {
            // Always let go, whatever happened (a partial send, cancellation, an exception): exactly the keys that went
            // down, in reverse order. Never leave Ctrl stuck down.
            ctx.ReleaseHeld();
        }
    }
}

[MacroStep("text", "Type text", Order = 1, Help = "Types the text as Unicode characters, whatever the keyboard layout. New lines press Enter.")]
public sealed class TextStep : MacroStep
{
    public const int MaxLength = 5000;
    public const int MaxCharDelayMs = 500;
    /// <summary>Events per SendInput call when there is no per-character delay (32 characters).</summary>
    public const int BatchEvents = 64;

    [StepField("Text", Kind = "textarea", Placeholder = "Hello from the Stream Deck", Help = "Stored in plain text and exported with profiles: never put passwords here.")]
    public string Text { get; set; } = "";

    [StepField("Delay per character (ms)", Min = 0, Max = MaxCharDelayMs, Help = "Slow typing down for apps that drop fast input.")]
    public int CharDelayMs { get; set; }

    public TextStep() { }
    public TextStep(string text) => Text = text;

    public override string Describe()
    {
        var oneLine = Text.Replace("\r", "").Replace('\n', ' ').Trim();
        return oneLine.Length == 0 ? "Type (nothing)" : $"Type \u201C{(oneLine.Length > 24 ? oneLine[..23] + "\u2026" : oneLine)}\u201D";
    }

    public override IEnumerable<string> Validate()
    {
        if (string.IsNullOrEmpty(Text)) yield return "Enter the text to type.";
        if (Text.Length > MaxLength) yield return $"The text is longer than {MaxLength} characters.";
        if (CharDelayMs is < 0 or > MaxCharDelayMs) yield return $"Delay per character must be 0-{MaxCharDelayMs} ms.";
    }

    public override async Task ExecuteAsync(MacroContext ctx)
    {
        var events = InputBuilder.Text(Text, ctx.ScanCodes);
        var perBatch = CharDelayMs > 0 ? 2 : BatchEvents;
        foreach (var batch in InputBuilder.Batches(events, perBatch))
        {
            ctx.Cancellation.ThrowIfCancellationRequested();
            await ctx.SendAsync(batch).ConfigureAwait(false);
            if (CharDelayMs > 0) await ctx.DelayAsync(TimeSpan.FromMilliseconds(CharDelayMs)).ConfigureAwait(false);
        }
    }
}

public enum MediaKey
{
    [Description("Play / pause")] PlayPause,
    [Description("Next track")] Next,
    [Description("Previous track")] Previous,
    [Description("Stop")] Stop,
    [Description("Volume up")] VolumeUp,
    [Description("Volume down")] VolumeDown,
    [Description("Mute")] Mute,
}

public static class MediaKeys
{
    public static KeyDef KeyFor(MediaKey key) => KeyNames.Find(key switch
    {
        MediaKey.PlayPause => "PlayPause",
        MediaKey.Next => "NextTrack",
        MediaKey.Previous => "PrevTrack",
        MediaKey.Stop => "MediaStop",
        MediaKey.VolumeUp => "VolumeUp",
        MediaKey.VolumeDown => "VolumeDown",
        _ => "VolumeMute",
    })!;

    public static string Label(MediaKey key) =>
        typeof(MediaKey).GetField(key.ToString())?.GetCustomAttributes(typeof(DescriptionAttribute), false).OfType<DescriptionAttribute>().FirstOrDefault()?.Description ?? key.ToString();

    /// <summary>A key-face label that fits a key ("Previous", "Volume +").</summary>
    public static string ShortLabel(MediaKey key) => key switch
    {
        MediaKey.PlayPause => "Play/Pause",
        MediaKey.Next => "Next",
        MediaKey.Previous => "Previous",
        MediaKey.Stop => "Stop",
        MediaKey.VolumeUp => "Volume +",
        MediaKey.VolumeDown => "Volume -",
        _ => "Mute",
    };

    /// <summary>The JSON value ("playPause").</summary>
    public static string Value(MediaKey key) => JsonNamingPolicy.CamelCase.ConvertName(key.ToString());

    /// <summary>Accepts "playPause", "PlayPause" or "play-pause"; null/empty/unknown → false.</summary>
    public static bool TryParse(string? text, out MediaKey key)
    {
        key = MediaKey.PlayPause;
        var t = (text ?? "").Replace("-", "").Replace("_", "").Trim();
        return t.Length > 0 && !int.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out _) && Enum.TryParse(t, ignoreCase: true, out key) && Enum.IsDefined(key);
    }
}

[MacroStep("media", "Media key", Order = 2, Help = "Play/pause, next, previous, stop and volume keys. They act on whatever app handles media.")]
public sealed class MediaKeyStep : MacroStep
{
    [StepField("Key")]
    public MediaKey Key { get; set; } = MediaKey.PlayPause;

    public MediaKeyStep() { }
    public MediaKeyStep(MediaKey key) => Key = key;

    public override string Describe() => MediaKeys.Label(Key);

    public override IEnumerable<string> Validate()
    {
        if (!Enum.IsDefined(Key)) yield return "Choose a media key.";
    }

    public override Task ExecuteAsync(MacroContext ctx) => ctx.SendAsync(InputBuilder.Tap(MediaKeys.KeyFor(Key), ctx.ScanCodes));
}

[MacroStep("launch", "Launch app", Order = 3, Help = "Starts a program, opens a file or folder, or an app link such as ms-settings:sound. A launch from an imported profile runs only after you trust it on this PC.")]
public sealed class LaunchStep : MacroStep, ILaunchStep
{
    [StepField("Program or file", Kind = "path", Placeholder = @"C:\Windows\notepad.exe")]
    public string Target { get; set; } = "";

    [StepField("Arguments", Placeholder = "optional")]
    public string? Arguments { get; set; }

    [StepField("Start in", Kind = "path", Placeholder = "optional folder")]
    public string? WorkingDirectory { get; set; }

    [StepField("Focus it if it's already running")]
    public bool FocusIfRunning { get; set; }

    public override string Describe() => string.IsNullOrWhiteSpace(Target) ? "Launch (nothing)" : "Open " + LaunchPolicy.ShortName(Environment.ExpandEnvironmentVariables(Target));

    public override IEnumerable<string> Validate() => LaunchPolicy.Validate(Target, Arguments, WorkingDirectory);

    public LaunchSpec ResolveSpec() => LaunchPolicy.Resolve(Target, Arguments, WorkingDirectory);

    public override Task ExecuteAsync(MacroContext ctx)
    {
        var spec = ResolveSpec();
        ctx.EnsureLaunchAllowed(spec); // the engine checked before the run; check the exact spec again right before it starts
        if (FocusIfRunning && ctx.Launcher.TryFocusRunning(spec)) return Task.CompletedTask;
        ctx.Launcher.Launch(spec);
        return Task.CompletedTask;
    }
}

[MacroStep("url", "Open URL", Order = 4, Help = "Opens an http or https address in the default browser.")]
public sealed class OpenUrlStep : MacroStep
{
    [StepField("URL", Kind = "url", Placeholder = "https://example.com")]
    public string Url { get; set; } = "";

    public OpenUrlStep() { }
    public OpenUrlStep(string url) => Url = url;

    public override string Describe() => UrlPolicy.TryParse(Url, out var u, out _) ? "Open " + u.IdnHost : "Open URL";

    public override IEnumerable<string> Validate()
    {
        if (!UrlPolicy.TryParse(Url, out _, out var error)) yield return error;
    }

    public override Task ExecuteAsync(MacroContext ctx)
    {
        if (!UrlPolicy.TryParse(Url, out var uri, out var error)) throw new MacroStepException(error);
        ctx.Launcher.OpenUrl(uri);
        return Task.CompletedTask;
    }
}

[MacroStep("delay", "Delay", Order = 5, Help = "Waits before the next step (give an app time to open or a menu time to appear).")]
public sealed class DelayStep : MacroStep
{
    public const int MaxMs = 60_000;

    [StepField("Wait (ms)", Min = 0, Max = MaxMs)]
    public int Ms { get; set; } = 250;

    public DelayStep() { }
    public DelayStep(int ms) => Ms = ms;

    public override string Describe() => Ms >= 1000 && Ms % 100 == 0
        ? string.Create(CultureInfo.InvariantCulture, $"Wait {Ms / 1000.0:0.#} s")
        : string.Create(CultureInfo.InvariantCulture, $"Wait {Ms} ms");

    public override IEnumerable<string> Validate()
    {
        if (Ms is < 0 or > MaxMs) yield return $"A delay must be 0-{MaxMs / 1000} s.";
    }

    public override Task ExecuteAsync(MacroContext ctx) => ctx.DelayAsync(TimeSpan.FromMilliseconds(Math.Clamp(Ms, 0, MaxMs)));
}

/// <summary>
/// A step whose type this version does not know (saved by a newer Prism Control) or whose JSON could not be read.
/// Its JSON is kept exactly, so saving the macro never loses it; a macro containing it does not run.
/// </summary>
public sealed class UnknownStep(JsonObject raw, string reason, string? knownLabel = null) : MacroStep
{
    [JsonIgnore] public JsonObject Raw { get; } = raw;
    [JsonIgnore] public string Reason { get; } = reason;
    [JsonIgnore] public string? TypeName => Raw["type"] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
    /// <summary>Set when the type is known but this step's values could not be read (e.g. an imported <c>"text": null</c>).</summary>
    [JsonIgnore] public string? KnownLabel { get; } = knownLabel;

    public override string Describe() => KnownLabel is { } label ? $"{label}: fix in settings"
        : TypeName is { } t ? $"Unknown step \"{t}\"" : "Unreadable step";

    public override IEnumerable<string> Validate() { yield return Reason; }

    public override Task ExecuteAsync(MacroContext ctx) => throw new MacroStepException(Reason);
}
