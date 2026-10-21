using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Core.Theming;

// App themes: the look of the app in front, for a module's OWN keys and dials on a Kaleidoscope deck (Spotify keys,
// browser tab tiles, Steam/OBS/Docker/AWS keys). The Smart module provides them through IAppThemeSource; every
// other face, the pins (volume, mic) and Audio always stay Prism Refraction. Pictures are content and are never
// tinted (album art, thumbnails, favicons, library art).
//
// Adopting it in an action (one line in Render, plus a re-render on Changed):
//     var look = AppTheming.For(Services, Device.Id, Theme);       // null = Prism
//     var t = look?.Palette ?? Theme;                              // hand t to KeyArt/DialArt as usual
//     var accent = look is null ? Hues.For(Theme, "spotify") : AppTheming.Hue(look);

public enum AppLabelCase { Upper, Title, Sentence }

public enum AppEdge { Lit, Flat, Line, Bevel, Glow }

public enum AppTexture { None, Scanlines, Grid, Dots, Diagonal }

/// <summary>
/// The app look a face should wear. Immutable and value-equal, so compare it with the last one to skip a re-render
/// (<see cref="Palette"/> compares by reference: the provider builds each palette once per look and reuses it).
/// </summary>
public sealed record AppThemePalette
{
    /// <summary>Shown in diagnostics, e.g. "Spotify (evoked)".</summary>
    public required string Name { get; init; }

    /// <summary>Same look = same key, e.g. "spotify:player:dark".</summary>
    public required string Key { get; init; }

    public required Color Background { get; init; }
    public required Color Surface { get; init; }
    public required Color Raised { get; init; }
    public required Color Line { get; init; }
    public required Color Text { get; init; }
    public required Color Dim { get; init; }
    public required Color Accent { get; init; }
    /// <summary>Accent used for text (the pack's accentText, else <see cref="Accent"/>).</summary>
    public required Color AccentText { get; init; }
    public required Color Accent2 { get; init; }
    public required Color Ok { get; init; }
    public required Color Warn { get; init; }
    public required Color Bad { get; init; }
    /// <summary>Black or white, whichever contrasts more with <see cref="Accent"/>.</summary>
    public required Color OnAccent { get; init; }

    /// <summary>Corner radius on the 144 key, 0–24. Prism's own is <see cref="PrismRadius"/>.</summary>
    public double Radius { get; init; } = PrismRadius;
    public AppLabelCase LabelCase { get; init; } = AppLabelCase.Upper;
    public FontWeight Weight { get; init; } = FontWeight.Semibold;
    public AppEdge Edge { get; init; } = AppEdge.Lit;
    public AppTexture Texture { get; init; } = AppTexture.None;

    /// <summary>The same palette the Smart module draws with: hand it to KeyArt/DialArt as is.</summary>
    public required RefractionPalette Palette { get; init; }

    /// <summary>Background luminance below 0.18 (the palette's own flag).</summary>
    public bool IsDark => Palette.IsDark;

    /// <summary>Prism Refraction's key corner radius on the 144 key.</summary>
    public const double PrismRadius = 8;

    /// <summary>A label in this look's case (<see cref="AppTheming.ApplyCase"/>: acronyms, digits and units survive).</summary>
    public string Case(string label) => AppTheming.ApplyCase(label, LabelCase);

    /// <summary>The radius to draw where Prism art would use <paramref name="prismRadius"/>, scaled to this look (0–24).</summary>
    public double R(double prismRadius) => Math.Clamp(prismRadius * Radius / PrismRadius, 0, 24);
}

/// <summary>
/// Registered in the service registry by the Smart module; absent means no app themes (everything stays Prism).
/// </summary>
public interface IAppThemeSource
{
    /// <summary>
    /// The look for a face on <paramref name="deviceId"/> now, or null for Prism Refraction (no theme for the app in
    /// front, an illegible theme, or app themes turned off). <paramref name="userTheme"/> is the action's own Theme
    /// (core.theme Night/Day): apps with both looks follow it, single-look apps ignore it.
    /// </summary>
    AppThemePalette? For(string deviceId, RefractionPalette userTheme);

    /// <summary>
    /// The look changed on a device (argument: its id). Raised after that device's new layout exists, in the same
    /// batch as the Kaleidoscope slots' redraw, never before it, so a re-render costs no extra frames.
    /// </summary>
    event Action<string>? Changed;
}

public static partial class AppTheming
{
    /// <summary>
    /// Re-cases an authored (uppercase) label for a look, the one rule set Smart and modules share. Upper keeps the label
    /// as authored. Title and Sentence lowercase plain all-caps words (title case keeps small words like "to" lower);
    /// acronyms (CPU, AWS, OBS…), words with digits or symbols (EC2, 4K), mixed-case words and single letters stay as
    /// authored; units after a number go lowercase (10S → 10s, 2X → 2x, MS → ms); PLAY/PAUSE cases each part.
    /// </summary>
    public static string ApplyCase(string label, AppLabelCase c)
    {
        if (c == AppLabelCase.Upper || label.Length == 0) return label;
        var words = label.Split(' ');
        var first = true;
        for (var i = 0; i < words.Length; i++)
        {
            var w = words[i];
            if (w.Length == 0) continue;
            if (w == "MS") { words[i] = "ms"; first = false; continue; }
            if (UnitRe().Match(w) is { Success: true } u) { words[i] = u.Groups[1].Value + u.Groups[2].Value.ToLowerInvariant(); first = false; continue; }
            if (w.Contains('/') && w.All(ch => char.IsLetter(ch) || ch == '/'))
            {
                var parts = w.Split('/');
                for (var p = 0; p < parts.Length; p++) parts[p] = CaseWord(parts[p], first && p == 0, c);
                words[i] = string.Join('/', parts);
                first = false;
                continue;
            }
            words[i] = CaseWord(w, first, c);
            first = false;
        }
        return string.Join(' ', words);
    }

    private static string CaseWord(string w, bool first, AppLabelCase c)
    {
        if (w.Length <= 1 || Acronyms.Contains(w) || !w.All(char.IsLetter) || w.Any(char.IsLower)) return w;
        var lower = w.ToLowerInvariant();
        var capital = first || (c == AppLabelCase.Title && !SmallWords.Contains(w));
        return capital ? char.ToUpperInvariant(lower[0]) + lower[1..] : lower;
    }

    [System.Text.RegularExpressions.GeneratedRegex("^([0-9]+)(S|X|MS|H|M|P)$")]
    private static partial System.Text.RegularExpressions.Regex UnitRe();

    private static readonly HashSet<string> Acronyms = new(StringComparer.Ordinal)
    {
        "AI", "UI", "PR", "DM", "VC", "OK", "LS", "TV", "PC", "ID", "HP", "XP", "VR", "FX", "EQ", "GG", "QR", "CC", "VS", "PIP", "PTT", "BCC", "CFN",
        "DDB", "AWS", "OBS", "CPU", "GPU", "RAM", "URL", "PDF", "HDR", "FPS", "SSO", "ECS", "EKS", "RDS", "IAM", "SSH", "API", "CLI", "NPC", "HUD", "DLC",
        "RGB", "LED", "USB", "DND", "AFK", "VOD", "NMS", "PGM", "PVW", "CSS", "HTML", "JSON", "XML", "SQL", "VPN", "DNS", "IDE", "GIF", "PNG", "JPG", "RSS",
    };

    private static readonly HashSet<string> SmallWords = new(StringComparer.Ordinal)
    {
        "TO", "OF", "IN", "ON", "UP", "BY", "AT", "AS", "OR", "AN", "IS", "IT", "GO", "DO", "NO", "MY", "ME", "WE", "BE", "IF", "SO", "US", "AM", "AD",
    };

    // Each look's palette remembers its look, so art that takes only a palette (Hues.For, KeyArt, DialArt) can wear the
    // app's accent without new parameters. The provider builds one palette instance per look (see Palette), and only
    // faces that asked For() a look ever hold an app palette, so pins and Audio stay Prism.
    private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<RefractionPalette, AppThemePalette> Looks = new();

    /// <summary>The app look for a face on <paramref name="deviceId"/>, or null (Prism) when no source is registered.</summary>
    public static AppThemePalette? For(IServiceRegistry services, string deviceId, RefractionPalette userTheme)
    {
        var look = services.TryGet<IAppThemeSource>(out var source) ? source.For(deviceId, userTheme) : null;
        if (look is null) return null;
        // A look must own its palette: tagging Prism's shared Night/Day would turn every Prism face (pins, Audio) into the app.
        if (ReferenceEquals(look.Palette, Refraction.Night) || ReferenceEquals(look.Palette, Refraction.Day)) return null;
        Looks.AddOrUpdate(look.Palette, look);
        return look;
    }

    /// <summary>The app look a palette came from (it was handed out by <see cref="For"/>), or null for a Prism palette.</summary>
    public static AppThemePalette? LookOf(RefractionPalette palette) => Looks.TryGetValue(palette, out var look) ? look : null;

    /// <summary>
    /// Calls <paramref name="changed"/> when the look changes on <paramref name="deviceId"/> (marshal it with Post).
    /// Dispose the result on willDisappear. Without a source it does nothing.
    /// </summary>
    public static IDisposable Watch(IServiceRegistry services, string deviceId, Action changed)
    {
        if (!services.TryGet<IAppThemeSource>(out var source)) return NoWatch.Instance;
        void OnChanged(string id) { if (id == deviceId) changed(); }
        source.Changed += OnChanged;
        return new Unsubscribe(() => source.Changed -= OnChanged);
    }

    private sealed class Unsubscribe(Action undo) : IDisposable
    {
        private Action? _undo = undo;
        public void Dispose() => Interlocked.Exchange(ref _undo, null)?.Invoke();
    }

    private sealed class NoWatch : IDisposable
    {
        public static readonly NoWatch Instance = new();
        public void Dispose() { }
    }

    /// <summary>
    /// The look's accent as a spectrum color, for art helpers that take a hue (KeyArt.Value/Icon, DialArt):
    /// ink and vivid are the accent, the wash is the accent at 18% opacity, and there is no sheen.
    /// </summary>
    public static SpectrumColor Hue(AppThemePalette look)
        => new($"app:{look.Key}", 0, "", look.AccentText, look.Accent, Paint.Solid(look.Accent, 0.18), null);
}
