using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using PrismControl.Sight.Recipes;

namespace PrismControl.Sight.Text;

public enum ParseType { Number, Integer, Percent, Text, Enum, Duration }

/// <summary>A compiled parse rule (from <see cref="ParseDto"/>).</summary>
public sealed record ParseSpec(ParseType Type, string? Unit, char Decimal, char? Thousands, IReadOnlyDictionary<string, string> Values, double Scale)
{
    public static ParseSpec Default { get; } = new(ParseType.Number, null, '.', ',', new Dictionary<string, string>(), 1);

    public static ParseSpec From(ParseDto? dto)
    {
        if (dto is null) return Default;
        var type = dto.Type?.ToLowerInvariant() switch
        {
            "integer" => ParseType.Integer, "percent" => ParseType.Percent, "text" => ParseType.Text,
            "enum" => ParseType.Enum, "duration" => ParseType.Duration, _ => ParseType.Number,
        };
        var values = (dto.Values ?? new()).ToDictionary(kv => Normalize(kv.Key), kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        return new ParseSpec(type, string.IsNullOrEmpty(dto.Unit) ? null : dto.Unit, string.IsNullOrEmpty(dto.Decimal) ? '.' : dto.Decimal[0],
            string.IsNullOrEmpty(dto.Thousands) ? null : dto.Thousands[0], values, dto.Scale ?? 1);
    }

    internal static string Normalize(string s) => Regex.Replace(s.Trim(), @"\s+", " ").ToUpperInvariant();
}

/// <summary>The outcome of parsing recognized text.</summary>
public readonly record struct ParsedText(bool Ok, double? Number, string? Label, string Text, double Quality, string? Error = null)
{
    public static ParsedText Fail(string text, string error) => new(false, null, null, text, 0, error);
}

/// <summary>
/// Turns OCR output into values. A value is NEVER shortened: the read either matches the full expected pattern or fails
/// (Unknown). Look-alike characters are mapped into a numeric whitelist only inside a digit run (O→0, l→1, S→5, B→8, …:
/// "-18O" → -180, but "BOB" is not a number); punctuation look-alikes (—→-, ·→.) map anywhere; ANY other character
/// outside the whitelist fails the read ("-1,5" with a "." decimal is not -15, "1:25" is not 125). The unit suffix is
/// stripped and the value is parsed with the recipe's decimal and thousands separators: "-30°" → -30, "1,250" → 1250,
/// "12.5 m" → 12.5, "87%" → 87, "1:05" → 65 s. Quality is 1 when nothing had to be mapped and drops for every mapped
/// character.
/// </summary>
public static class TextParser
{
    private static readonly Dictionary<char, char> DigitLookalikes = new()
    {
        ['O'] = '0', ['o'] = '0', ['Q'] = '0', ['D'] = '0', ['ø'] = '0', ['Ø'] = '0', ['U'] = '0',
        ['I'] = '1', ['l'] = '1', ['|'] = '1', ['!'] = '1', ['i'] = '1', ['j'] = '1', ['J'] = '1', [']'] = '1', ['['] = '1',
        ['Z'] = '2', ['z'] = '2',
        ['S'] = '5', ['s'] = '5', ['$'] = '5',
        ['B'] = '8',
        ['G'] = '6', ['b'] = '6',
        ['g'] = '9', ['q'] = '9',
        ['T'] = '7',
        ['A'] = '4',
        ['—'] = '-', ['–'] = '-', ['¯'] = '-', ['_'] = '-', ['~'] = '-', ['−'] = '-',
        ['·'] = '.',
    };

    private static readonly char[] DegreeLike = ['°', 'º', '•', '˚', '◦'];

    /// <summary>
    /// Maps look-alikes into <paramref name="whitelist"/> and counts every other character outside it as dropped (Parse
    /// fails a read with any drop). Null whitelist = keep all. <paramref name="superscriptStripped"/>: the preprocessor
    /// already removed a raised ring, so a trailing "o" cannot be the degree sign (it is a look-alike, or nothing).
    /// </summary>
    public static (string Text, int Mapped, int Dropped) ApplyWhitelist(string raw, string? whitelist, string? unit, bool superscriptStripped = false)
    {
        raw ??= "";
        var s = raw.Trim();
        // A unit glyph the OCR misread at the end ("45•", "45o" for "45°") is the unit, not a digit.
        if (unit == "°" && s.Length > 1)
        {
            var last = s[^1];
            // Lowercase 'o' is a raised ring read as a letter; uppercase 'O' is far more often a misread zero. After a
            // superscript strip there is no ring left to misread.
            if (DegreeLike.Contains(last) || (!superscriptStripped && last == 'o' && char.IsDigit(s[^2]) && (whitelist is null || !whitelist.Contains(last))))
                s = s[..^1] + "°";
        }
        if (unit == "%" && s.EndsWith("0/0", StringComparison.Ordinal)) s = s[..^3] + "%";
        if (whitelist is null) return (s, 0, 0);
        var sb = new StringBuilder(s.Length);
        int mapped = 0, dropped = 0;
        var numeric = whitelist.Any(char.IsDigit) && !whitelist.Any(char.IsLetter);
        var digitRun = numeric ? DigitRuns(s, whitelist) : null;
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            if (whitelist.Contains(c) || c == ' ' || (unit is not null && unit.Contains(c))) { sb.Append(c); continue; }
            // Digit look-alikes only inside a digit run; punctuation look-alikes (dashes, a middle dot) anywhere.
            if (numeric && DigitLookalikes.TryGetValue(c, out var m) && whitelist.Contains(m) && (!char.IsDigit(m) || digitRun![i])) { sb.Append(m); mapped++; continue; }
            if (!whitelist.Contains(char.ToUpperInvariant(c)) && whitelist.Contains(char.ToLowerInvariant(c))) { sb.Append(char.ToLowerInvariant(c)); continue; }
            if (whitelist.Contains(char.ToUpperInvariant(c))) { sb.Append(char.ToUpperInvariant(c)); continue; }
            dropped++;
        }
        return (sb.ToString().Trim(), mapped, dropped);
    }

    /// <summary>
    /// For each position: is it inside a digit run? A run is a maximal stretch of digits, digit look-alikes and the
    /// whitelist's separators. It counts when it holds at least one real digit, or when it is one lone look-alike (a
    /// one-glyph value such as "O°" for 0°). "BOB" has no real digit and three look-alikes: not a number.
    /// </summary>
    private static bool[] DigitRuns(string s, string whitelist)
    {
        bool Part(char c) => char.IsDigit(c) || (DigitLookalikes.TryGetValue(c, out var m) && char.IsDigit(m)) || ((c == '.' || c == ',') && whitelist.Contains(c));
        var inRun = new bool[s.Length];
        var i = 0;
        while (i < s.Length)
        {
            if (!Part(s[i])) { i++; continue; }
            var start = i;
            var real = false;
            while (i < s.Length && Part(s[i])) { real |= char.IsDigit(s[i]); i++; }
            if (real || i - start == 1)
                for (var k = start; k < i; k++) inRun[k] = true;
        }
        return inRun;
    }

    public static ParsedText Parse(string raw, ParseSpec spec, string? whitelist = null, bool superscriptStripped = false)
    {
        var (text, mapped, dropped) = ApplyWhitelist(raw ?? "", whitelist, spec.Unit, superscriptStripped);
        var quality = Math.Max(0.4, 1.0 - 0.12 * mapped);
        if (text.Length == 0) return ParsedText.Fail(text, "empty");
        // Never shorten a value: a character the whitelist cannot explain makes the whole read Unknown.
        if (dropped > 0) return ParsedText.Fail(text, $"{dropped} character(s) outside the whitelist: a value is never shortened");
        switch (spec.Type)
        {
            case ParseType.Text:
                return new ParsedText(true, null, text, text, quality);
            case ParseType.Enum:
            {
                var key = ParseSpec.Normalize(text);
                if (spec.Values.TryGetValue(key, out var label)) return new ParsedText(true, null, label, text, quality);
                // One edit away (for keys of 4+ characters) still counts, at lower quality.
                foreach (var (k, val) in spec.Values)
                    if (k.Length >= 4 && Levenshtein(k, key) <= 1) return new ParsedText(true, null, val, text, quality * 0.8);
                return ParsedText.Fail(text, "not a known value");
            }
            case ParseType.Duration:
            {
                var m = Regex.Match(text.Replace(" ", ""), @"^(?:(\d+):)?(\d{1,2}):(\d{2})$");
                if (!m.Success) return ParsedText.Fail(text, "not a duration");
                var h = m.Groups[1].Success ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : 0;
                var secs = h * 3600 + int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) * 60 + int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);
                return new ParsedText(true, secs * spec.Scale, null, text, quality);
            }
        }
        var t = text.Trim();
        var unit = spec.Unit ?? (spec.Type == ParseType.Percent ? "%" : null);
        if (unit is not null)
        {
            var u = unit.Replace(" ", "");
            if (t.EndsWith(u, StringComparison.OrdinalIgnoreCase)) t = t[..^u.Length].TrimEnd();
        }
        if (spec.Type == ParseType.Percent && t.EndsWith('%')) t = t[..^1].TrimEnd();
        if (t.EndsWith('°')) t = t[..^1].TrimEnd();
        // Spaces: after a sign ("- 30"), or as a thousands group ("1 250"). Any other space splits the read in two
        // ("12.5 8" is a misread unit, "1 5" two glyphs far apart): Unknown, never merged into one made-up number.
        t = Regex.Replace(t, @"^([+-]) +", "$1");
        t = Regex.Replace(t, @"(?<=\d) (?=\d{3}(?:[^\d]|$))", "");
        if (t.Contains(' ')) return ParsedText.Fail(text, "a space inside the number");
        // Separators: thousands only when followed by exactly three digits.
        if (spec.Thousands is { } th)
            t = Regex.Replace(t, Regex.Escape(th.ToString()) + @"(?=\d{3}(?:\D|$))", "");
        if (spec.Decimal != '.') t = t.Replace(spec.Decimal, '.');
        var pattern = spec.Type == ParseType.Integer ? @"^[+-]?\d+$" : @"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$";
        if (!Regex.IsMatch(t, pattern)) return ParsedText.Fail(text, "not a number");
        var v = double.Parse(t, NumberStyles.Float, CultureInfo.InvariantCulture) * spec.Scale;
        return new ParsedText(true, v, null, text, quality);
    }

    public static int Levenshtein(string a, string b)
    {
        var d = new int[a.Length + 1, b.Length + 1];
        for (var i = 0; i <= a.Length; i++) d[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) d[0, j] = j;
        for (var i = 1; i <= a.Length; i++)
            for (var j = 1; j <= b.Length; j++)
                d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
        return d[a.Length, b.Length];
    }
}
