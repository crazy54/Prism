using PrismControl.Core.Render;

namespace PrismControl.Audio.Art;

/// <summary>Fitting, ellipsizing and wrapping for the stroke font.</summary>
internal static class TextFit
{
    /// <summary>
    /// The text to draw for a name. The stroke font now draws every character: "@", the backtick and braces have real
    /// glyphs, and what it cannot draw (CJK, emoji, other scripts; see <see cref="StrokeFont.Unsupported"/>) becomes one
    /// visible box per character. So nothing is dropped or remapped any more; only runs of spaces collapse to one.
    /// </summary>
    public static string Safe(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("  ", StringComparison.Ordinal)) return text;
        return string.Join(' ', text.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>
    /// <paramref name="name"/>, unless the font would draw part of it as boxes (<see cref="StrokeFont.Unsupported"/>)
    /// and <paramref name="fallback"/> draws fully: an app named in another script then shows its program name
    /// ("Cloudmusic") instead of a row of boxes. The property inspector still shows the real name.
    /// </summary>
    public static string Readable(string name, string? fallback) =>
        StrokeFont.Unsupported(name).Count > 0 && !string.IsNullOrWhiteSpace(fallback) && StrokeFont.Unsupported(fallback).Count == 0 ? fallback : name;

    /// <summary>The largest size in [min, max] at which the text fits; if even <paramref name="minSize"/> is too big, the text is ellipsized.</summary>
    public static (string Text, double Size) Fit(string text, double maxWidth, double maxSize, double minSize,
        FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        text = Safe(text);
        var size = StrokeFont.FitSize(text, maxWidth, maxSize, minSize, weight, tracking, textCase);
        if (StrokeFont.Measure(text, size, weight, tracking, textCase) > maxWidth)
            text = StrokeFont.Ellipsize(text, maxWidth, size, weight, tracking, textCase);
        return (text, size);
    }

    /// <summary>
    /// Wraps into at most <paramref name="maxLines"/> lines at one size in [min, max]. One line wins while it fits at
    /// 85% of the max size or more. Breaks prefer " - " ("Mixer - Chat" → "Mixer" / "Chat"), then spaces; the last line
    /// is ellipsized if needed.
    /// </summary>
    public static (IReadOnlyList<string> Lines, double Size) Wrap(string text, double maxWidth, double maxSize, double minSize, int maxLines,
        FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        text = Safe(text.Trim());
        if (text.Length == 0) return ([], maxSize);
        var (one, oneSize) = Fit(text, maxWidth, maxSize, minSize, weight, tracking, textCase);
        if (maxLines <= 1 || !text.Contains(' ') || (one == text && oneSize >= maxSize * 0.85)) return ([one], oneSize);
        // A " - " separator is the natural break ("Vendor Product - Channel"); it wins unless it costs a lot of size.
        double W(string s, double size) => StrokeFont.Measure(s, size, weight, tracking, textCase);
        var dash = text.IndexOf(" - ", StringComparison.Ordinal);
        double? dashSize = null;
        if (dash > 0)
        {
            var (a, b) = (text[..dash].Trim(), text[(dash + 3)..].Trim());
            var fit = Math.Min(StrokeFont.FitSize(a, maxWidth, maxSize, minSize, weight, tracking, textCase), StrokeFont.FitSize(b, maxWidth, maxSize, minSize, weight, tracking, textCase));
            if (W(a, fit) <= maxWidth && W(b, fit) <= maxWidth) dashSize = fit;
        }
        for (var size = maxSize; size >= minSize; size -= 1)
        {
            if (dashSize is { } ds && ds >= size * 0.75) return ([text[..dash].Trim(), text[(dash + 3)..].Trim()], ds);
            var lines = Break(text, maxWidth, size, maxLines, weight, tracking, textCase, out var fits);
            if (fits) return (lines, size);
        }
        if (dashSize is { } last) return ([text[..dash].Trim(), text[(dash + 3)..].Trim()], last);
        return (Break(text, maxWidth, minSize, maxLines, weight, tracking, textCase, out _), minSize);
    }

    private static List<string> Break(string text, double maxWidth, double size, int maxLines, FontWeight weight, double tracking, TextCase textCase, out bool fits)
    {
        double W(string s) => StrokeFont.Measure(s, size, weight, tracking, textCase);
        string Clip(string s, ref bool ok)
        {
            if (W(s) <= maxWidth) return s;
            ok = false;
            return StrokeFont.Ellipsize(s, maxWidth, size, weight, tracking, textCase);
        }

        fits = true;
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        var current = "";
        for (var i = 0; i < words.Length; i++)
        {
            var candidate = current.Length == 0 ? words[i] : current + " " + words[i];
            if (W(candidate) <= maxWidth) { current = candidate; continue; }
            if (current.Length > 0)
            {
                lines.Add(current);
                current = "";
            }
            if (lines.Count == maxLines - 1)
            {
                lines.Add(Clip(string.Join(' ', words[i..]), ref fits));
                return lines;
            }
            if (W(words[i]) > maxWidth)
            {
                lines.Add(Clip(words[i], ref fits));
                if (lines.Count == maxLines)
                {
                    if (i < words.Length - 1) fits = false;
                    return lines;
                }
                continue;
            }
            current = words[i];
        }
        if (current.Length > 0) lines.Add(current);
        return lines;
    }
}
