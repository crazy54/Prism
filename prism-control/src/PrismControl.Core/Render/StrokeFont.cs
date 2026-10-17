using System.Globalization;
using System.Text;

namespace PrismControl.Core.Render;

/// <summary>
/// Prism Control's built-in geometric monoline stroke font, hand-drawn for this project.
/// Text becomes ONE stroked &lt;path&gt; per run, so it renders identically in Chrome and in the Stream Deck
/// app (whose live text falls back to one sans with RGB fringes, and ignores letter-spacing and dominant-baseline).
/// <para>
/// Glyph space: capital height 100 units, y down, baseline at y = 100. Covers 0-9, A-Z (lowercase renders as
/// small caps), Latin letters with diacritics (via decomposition, stacked marks for Vietnamese, plus Ł Đ Þ Ħ ı ß Æ Œ Ø),
/// Greek and Cyrillic capitals (lowercase as small caps), punctuation and quotes, brackets and braces, @ and the backtick,
/// currency, ©®™, math (± ÷ ≈ ≠ ≤ ≥ ∞), fractions, super/subscript digits, arrows, music and a few shapes.
/// Digits are tabular (all the same advance), so live numbers do not jitter.
/// </para>
/// <para>
/// <b>Everything else</b> (CJK, kana, Hangul, Arabic, Hebrew, Indic, Thai, emoji, unknown combining marks) is never
/// dropped: each grapheme becomes one visible replacement box, the same width as a letter. <see cref="Supports"/> is
/// false for such text and <see cref="Unsupported"/> lists the graphemes, so callers can choose another presentation.
/// Invisible format characters (zero-width joiners, direction marks, variation selectors, soft hyphens) are skipped.
/// </para>
/// <para>Sizes are CSS-like font sizes: capital height = 0.72 × size (close to Inter), so token sizes (value 44, label 22) carry over.</para>
/// </summary>
public static class StrokeFont
{
    public const double CapHeightRatio = 0.72;
    private const double VisualGapUnits = 18;
    private const double DigitBox = 58;
    private const double SmallCapScale = 0.78;

    private sealed record Glyph(double Width, Cmd[] Commands);
    private readonly record struct Cmd(char Op, double[] Args);
    private enum Anchor { Center, Right }
    private sealed record Mark(Cmd[] Commands, Anchor Anchor = Anchor.Center, bool Above = true);
    private readonly record struct Item(Glyph Glyph, double Scale, Mark[]? Marks, string? Missing = null);

    // Order matters: Tofu and the marks are used while the glyph table is built.
    private static readonly Glyph Tofu = G(50, "M0 0 L50 0 L50 100 L0 100 Z");
    private static readonly Dictionary<char, Glyph> Glyphs = BuildGlyphs();
    private static readonly Dictionary<char, char> Aliases = BuildAliases();

    /// <summary>Above-marks after the first stack upward by this much (Vietnamese ế, ể).</summary>
    private const double MarkStackUnits = 15;

    /// <summary>Stroke width in glyph units for a weight.</summary>
    public static double StrokeUnits(FontWeight weight) => weight switch
    {
        FontWeight.Light => 7,
        FontWeight.Regular => 9,
        FontWeight.Medium => 10.5,
        FontWeight.Semibold => 12,
        FontWeight.Bold => 14.5,
        _ => 12,
    };

    public static double CapHeight(double size) => size * CapHeightRatio;

    /// <summary>Stroke width in pixels for <paramref name="size"/> and <paramref name="weight"/>.</summary>
    public static double StrokeWidth(double size, FontWeight weight) => CapHeight(size) / 100 * StrokeUnits(weight);

    /// <summary>True when every grapheme has a real glyph (no replacement box).</summary>
    public static bool Supports(string text) => Expand(text, TextCase.SmallCaps).All(p => p.Glyph != Tofu);

    /// <summary>The graphemes of <paramref name="text"/> that render as replacement boxes, in order (empty when <see cref="Supports"/>).</summary>
    public static IReadOnlyList<string> Unsupported(string text) =>
        Expand(text, TextCase.SmallCaps).Where(p => p.Glyph == Tofu).Select(p => p.Missing ?? "\uFFFD").ToList();

    /// <summary>The width of the ink (including stroke overhang) in pixels.</summary>
    public static double Measure(string text, double size, FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        var items = Expand(text, textCase);
        if (items.Count == 0) return 0;
        var s = CapHeight(size) / 100;
        var w = StrokeUnits(weight);
        double units = 0;
        for (var i = 0; i < items.Count; i++)
        {
            units += items[i].Glyph.Width * items[i].Scale;
            if (i < items.Count - 1) units += VisualGapUnits + w;
        }
        return (units + w) * s + tracking * size * (items.Count - 1);
    }

    /// <summary>The largest size ≤ <paramref name="maxSize"/> (and ≥ <paramref name="minSize"/>) at which the text fits <paramref name="maxWidth"/>.</summary>
    public static double FitSize(string text, double maxWidth, double maxSize, double minSize, FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        var at = Measure(text, maxSize, weight, tracking, textCase);
        if (at <= maxWidth || at == 0) return maxSize;
        var size = maxSize * maxWidth / at; // width is linear in size
        return Math.Max(minSize, Math.Floor(size * 4) / 4);
    }

    /// <summary>Shortens <paramref name="text"/> with an ellipsis until it fits <paramref name="maxWidth"/> at <paramref name="size"/>.</summary>
    public static string Ellipsize(string text, double maxWidth, double size, FontWeight weight = FontWeight.Semibold, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        if (Measure(text, size, weight, tracking, textCase) <= maxWidth) return text;
        var info = StringInfo.GetTextElementEnumerator(text);
        var elements = new List<string>();
        while (info.MoveNext()) elements.Add((string)info.Current);
        for (var n = elements.Count - 1; n > 0; n--)
        {
            var candidate = string.Concat(elements.Take(n)).TrimEnd() + "…";
            if (Measure(candidate, size, weight, tracking, textCase) <= maxWidth) return candidate;
        }
        return "…";
    }

    /// <summary>
    /// Path data (absolute) for <paramref name="text"/> positioned at (<paramref name="x"/>, <paramref name="y"/>).
    /// Stroke it with <see cref="StrokeWidth"/>, round caps and round joins, and fill none.
    /// </summary>
    public static string PathData(string text, double x, double y, double size, FontWeight weight = FontWeight.Semibold,
        TextAlign align = TextAlign.Start, TextBaseline baseline = TextBaseline.Alphabetic, double tracking = 0, TextCase textCase = TextCase.SmallCaps)
    {
        var items = Expand(text, textCase);
        if (items.Count == 0) return "";
        var s = CapHeight(size) / 100;
        var w = StrokeUnits(weight);
        var inkWidth = Measure(text, size, weight, tracking, textCase);
        var inkLeft = align switch
        {
            TextAlign.Middle => x - inkWidth / 2,
            TextAlign.End => x - inkWidth,
            _ => x,
        };
        var baseY = baseline switch
        {
            TextBaseline.Middle => y + CapHeight(size) / 2,
            TextBaseline.Top => y + CapHeight(size) + w * s / 2,
            _ => y,
        };
        var sb = new StringBuilder(items.Count * 48);
        var penUnits = w / 2; // first glyph's ink starts at inkLeft
        for (var i = 0; i < items.Count; i++)
        {
            var (glyph, scale, marks, _) = items[i];
            var ox = inkLeft + penUnits * s + tracking * size * i;
            var gs = s * scale;
            var oy = baseY - 100 * gs; // glyph top (cap or small-cap height)
            Emit(sb, glyph.Commands, ox, oy, gs);
            if (marks is not null)
            {
                var above = 0;
                foreach (var mark in marks)
                {
                    var mx = ox + (mark.Anchor == Anchor.Right ? glyph.Width : glyph.Width / 2) * gs;
                    var my = oy - (mark.Above ? MarkStackUnits * above++ : 0) * gs;
                    Emit(sb, mark.Commands, mx, my, gs);
                }
            }
            penUnits += glyph.Width * scale + VisualGapUnits + w;
        }
        return sb.ToString();
    }

    private static void Emit(StringBuilder sb, Cmd[] cmds, double ox, double oy, double s)
    {
        foreach (var c in cmds)
        {
            sb.Append(c.Op);
            switch (c.Op)
            {
                case 'A':
                    sb.Append(SvgFormat.N(c.Args[0] * s)).Append(' ').Append(SvgFormat.N(c.Args[1] * s)).Append(' ')
                      .Append(SvgFormat.N(c.Args[2])).Append(' ').Append(c.Args[3] != 0 ? '1' : '0').Append(' ').Append(c.Args[4] != 0 ? '1' : '0').Append(' ')
                      .Append(SvgFormat.N(ox + c.Args[5] * s)).Append(' ').Append(SvgFormat.N(oy + c.Args[6] * s));
                    break;
                case 'Z':
                    break;
                default:
                    for (var i = 0; i < c.Args.Length; i += 2)
                    {
                        if (i > 0) sb.Append(' ');
                        sb.Append(SvgFormat.N(ox + c.Args[i] * s)).Append(' ').Append(SvgFormat.N(oy + c.Args[i + 1] * s));
                    }
                    break;
            }
        }
    }

    private static List<Item> Expand(string text, TextCase textCase)
    {
        var list = new List<Item>(text.Length);
        if (string.IsNullOrEmpty(text)) return list;
        var e = StringInfo.GetTextElementEnumerator(Normalize(text));
        while (e.MoveNext()) AddElement(list, (string)e.Current, textCase);
        return list;
    }

    // NFC, with lone surrogates (invalid UTF-16, which Normalize rejects) replaced by U+FFFD so they become one box.
    private static string Normalize(string text)
    {
        try { return text.Normalize(NormalizationForm.FormC); }
        catch (ArgumentException)
        {
            var sb = new StringBuilder(text.Length);
            for (var i = 0; i < text.Length; i++)
            {
                if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { sb.Append(text[i]).Append(text[++i]); continue; }
                sb.Append(char.IsSurrogate(text[i]) ? '\uFFFD' : text[i]);
            }
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }
    }

    private static void AddElement(List<Item> list, string element, TextCase textCase)
    {
        if (element is "\n" or "\r" or "\r\n") return;
        if (element == "\t") { list.Add(new Item(Glyphs[' '], 1, null)); return; }
        if (element.EnumerateRunes().All(IsIgnorable)) return; // ZWJ, ZWSP, LRM/RLM, BOM, soft hyphen, a lone variation selector
        var first = Rune.GetRuneAt(element, 0);
        if (Rune.GetUnicodeCategory(first) == UnicodeCategory.SpaceSeparator) { list.Add(new Item(Glyphs[' '], 1, null)); return; }

        // A character with its own glyph wins over its decomposition (≠ is "=" plus an overlay mark in NFD).
        var visible = element.EnumerateRunes().Where(r => !IsIgnorable(r)).ToList();
        if (visible is [{ IsBmp: true } only] && Lookup((char)only.Value) is { } direct)
        {
            list.Add(new Item(direct, 1, null));
            return;
        }

        var runes = element.Normalize(NormalizationForm.FormD).EnumerateRunes().ToList();
        var baseRune = runes[0];
        List<Mark>? marks = null;
        for (var i = 1; i < runes.Count; i++)
        {
            if (IsIgnorable(runes[i])) continue;
            if (runes[i].IsBmp && Marks.TryGetValue((char)runes[i].Value, out var m)) { (marks ??= []).Add(m); continue; }
            Missing(); // dropping an unknown mark would change the meaning: draw the whole grapheme as a box
            return;
        }
        if (!baseRune.IsBmp) { Missing(); return; } // emoji and other astral-plane symbols
        var c = (char)baseRune.Value;

        // Letters drawn as two capitals, or a capital plus a stroke.
        switch (c)
        {
            case 'ß': Plain("SS", textCase == TextCase.SmallCaps); return;
            case 'ẞ': Plain("SS", false); return;
            case 'æ' or 'Æ': Plain("AE", c == 'æ' && textCase == TextCase.SmallCaps); return;
            case 'œ' or 'Œ': Plain("OE", c == 'œ' && textCase == TextCase.SmallCaps); return;
            case 'ø' or 'Ø':
                (marks ??= []).Insert(0, Slash);
                list.Add(new Item(Glyphs['O'], c == 'ø' && textCase == TextCase.SmallCaps ? SmallCapScale : 1, [.. marks]));
                return;
        }
        if (Resolve(c, textCase) is { } r)
        {
            list.Add(new Item(r.Glyph, r.Small ? SmallCapScale : 1, marks?.ToArray()));
            return;
        }
        // Compatibility forms (fullwidth letters, ligatures like ﬁ, circled and Roman numerals, ℃) draw as their plain
        // characters when every one of them has a glyph.
        if (marks is null)
        {
            var compat = element.Normalize(NormalizationForm.FormKC);
            if (compat != element && compat.Length <= 4 && compat.All(ch => Resolve(ch, textCase) is not null))
            {
                foreach (var ch in compat)
                {
                    var g = Resolve(ch, textCase)!.Value;
                    list.Add(new Item(g.Glyph, g.Small ? SmallCapScale : 1, null));
                }
                return;
            }
        }
        Missing();

        void Missing() => list.Add(new Item(Tofu, 1, null, element));

        void Plain(string s, bool small)
        {
            for (var i = 0; i < s.Length; i++)
                list.Add(new Item(Glyphs[s[i]], small ? SmallCapScale : 1, i == 0 ? marks?.ToArray() : null));
        }
    }

    // The glyph for one character: exact, an alias (Cyrillic/Greek letters shaped like Latin ones, symbol variants), or
    // the capital of a lowercase letter (drawn as a small capital in TextCase.SmallCaps).
    private static (Glyph Glyph, bool Small)? Resolve(char c, TextCase textCase)
    {
        if (Lookup(c) is { } exact) return (exact, false);
        if (!char.IsLetter(c)) return null;
        var upper = char.ToUpperInvariant(c);
        if (upper == c && LowerAliases.TryGetValue(c, out var u)) upper = u; // ı, whose invariant upper case is itself
        if (upper == c) return null;
        return Lookup(upper) is { } g ? (g, char.IsLower(c) && textCase == TextCase.SmallCaps) : null;
    }

    private static Glyph? Lookup(char c)
    {
        if (Glyphs.TryGetValue(c, out var g)) return g;
        return Aliases.TryGetValue(c, out var a) && Glyphs.TryGetValue(a, out var ag) ? ag : null;
    }

    private static bool IsIgnorable(Rune r) =>
        r.Value is >= 0xFE00 and <= 0xFE0F or >= 0xE0100 and <= 0xE01EF // variation selectors
        || Rune.GetUnicodeCategory(r) is UnicodeCategory.Format or UnicodeCategory.Control;

    // Lowercase letters whose capital the invariant culture does not map.
    private static readonly Dictionary<char, char> LowerAliases = new() { ['ı'] = 'I', ['ĸ'] = 'K', ['ſ'] = 'S', ['ς'] = 'Σ' };

    private static readonly Mark Slash = new(Parse("M-34 104 L34 -4"), Anchor.Center, Above: false);

    // Combining marks, drawn relative to the glyph's horizontal center (or right edge) and the glyph top (y = 0).
    private static readonly Dictionary<char, Mark> Marks = new()
    {
        ['\u0301'] = new(Parse("M-7 -9 L9 -25")),                                     // acute (also Greek tonos)
        ['\u0300'] = new(Parse("M7 -9 L-9 -25")),                                     // grave
        ['\u0302'] = new(Parse("M-15 -9 L0 -25 L15 -9")),                             // circumflex
        ['\u030C'] = new(Parse("M-15 -25 L0 -9 L15 -25")),                            // caron
        ['\u0303'] = new(Parse("M-17 -12 C-11 -25 -5 -23 0 -17 C5 -11 11 -9 17 -22")),// tilde
        ['\u0308'] = new(Parse("M-13 -17.75 L-13 -16.25 M13 -17.75 L13 -16.25")),      // diaeresis
        ['\u030A'] = new(Parse("M-8 -18 A8 8 0 1 1 8 -18 A8 8 0 1 1 -8 -18 Z")),      // ring
        ['\u0304'] = new(Parse("M-15 -16 L15 -16")),                                  // macron
        ['\u0306'] = new(Parse("M-14 -24 C-12 -12 12 -12 14 -24")),                   // breve (ă ğ й ў)
        ['\u0307'] = new(Parse("M0 -17.75 L0 -16.25")),                               // dot above (ż ė İ)
        ['\u030B'] = new(Parse("M-13 -9 L-3 -25 M5 -9 L15 -25")),                     // double acute (ő ű)
        ['\u0309'] = new(Parse("M-7 -21 C-5 -27 7 -28 7 -20 C7 -15 0 -15 0 -9")),     // hook above (ả ể)
        ['\u031B'] = new(Parse("M-3 6 C5 4 9 -2 7 -11"), Anchor.Right),               // horn (ơ ư)
        ['\u0327'] = new(Parse("M0 100 L4 110 L-4 117"), Above: false),               // cedilla
        ['\u0328'] = new(Parse("M-6 100 C-14 106 -13 116 -3 118"), Anchor.Right, Above: false), // ogonek (ą ę)
        ['\u0323'] = new(Parse("M0 115.25 L0 116.75"), Above: false),                 // dot below (ạ ệ)
        ['\u0326'] = new(Parse("M2 108 L-2 120"), Above: false),                      // comma below (ș ț)
    };

    private static Glyph G(double width, string d) => new(width, Parse(d));

    private static Cmd[] Parse(string d)
    {
        var cmds = new List<Cmd>();
        var tokens = Tokenize(d);
        var i = 0;
        while (i < tokens.Count)
        {
            var op = tokens[i++][0];
            var argc = op switch { 'M' or 'L' => 2, 'C' => 6, 'Q' => 4, 'A' => 7, 'Z' => 0, _ => throw new FormatException($"glyph op {op}") };
            if (argc == 0) { cmds.Add(new Cmd('Z', [])); continue; }
            do
            {
                var args = new double[argc];
                for (var k = 0; k < argc; k++) args[k] = double.Parse(tokens[i++], CultureInfo.InvariantCulture);
                cmds.Add(new Cmd(op, args));
                if (op == 'M') op = 'L';
            } while (i < tokens.Count && !char.IsLetter(tokens[i][0]));
        }
        return cmds.ToArray();
    }

    private static List<string> Tokenize(string d)
    {
        var list = new List<string>();
        var sb = new StringBuilder();
        void Flush() { if (sb.Length > 0) { list.Add(sb.ToString()); sb.Clear(); } }
        foreach (var ch in d)
        {
            if (char.IsLetter(ch)) { Flush(); list.Add(ch.ToString()); }
            else if (ch is ' ' or ',') Flush();
            else if (ch == '-' && sb.Length > 0) { Flush(); sb.Append(ch); }
            else sb.Append(ch);
        }
        Flush();
        return list;
    }

    private static Dictionary<char, Glyph> BuildGlyphs()
    {
        var g = new Dictionary<char, Glyph>
        {
            // Digits: tabular, drawn inside a 58-unit box.
            ['0'] = G(DigitBox, "M0 29 A29 29 0 0 1 58 29 L58 71 A29 29 0 0 1 0 71 Z"),
            ['1'] = G(DigitBox, "M13 21 L35 0 L35 100"),
            ['2'] = G(DigitBox, "M2 27 A27 27 0 1 1 49.7 44.4 L1 100 L58 100"),
            ['3'] = G(DigitBox, "M5 0 L54 0 L27 38 A31 31 0 1 1 1.6 86.8"),
            ['4'] = G(DigitBox, "M43 100 L43 0 L0 70 L58 70"),
            ['5'] = G(DigitBox, "M53 0 L11 0 L7 44 A31 31 0 1 1 1.6 86.8"),
            ['6'] = G(DigitBox, "M42 0 L8.5 50.5 M0 71 A29 29 0 1 1 58 71 A29 29 0 1 1 0 71 Z"),
            ['7'] = G(DigitBox, "M2 0 L58 0 L18 100"),
            ['8'] = G(DigitBox, "M29 46 A23 23 0 1 1 29 0 A23 23 0 1 1 29 46 Z M29 46 A27 27 0 1 0 29 100 A27 27 0 1 0 29 46 Z"),
            ['9'] = G(DigitBox, "M58 29 A29 29 0 1 1 0 29 A29 29 0 1 1 58 29 Z M49.5 49.5 L16 100"),

            ['A'] = G(62, "M0 100 L31 0 L62 100 M11.2 64 L50.8 64"),
            ['B'] = G(56, "M0 0 L0 100 L30 100 A26 26 0 0 0 30 48 L0 48 M0 0 L28 0 A24 24 0 0 1 28 48"),
            ['C'] = G(56, "M52.2 14 A28 28 0 0 0 0 28 L0 72 A28 28 0 0 0 52.2 86"),
            ['D'] = G(56, "M0 0 L0 100 L24 100 A32 32 0 0 0 56 68 L56 32 A32 32 0 0 0 24 0 Z"),
            ['E'] = G(50, "M50 0 L0 0 L0 100 L50 100 M0 50 L42 50"),
            ['F'] = G(48, "M48 0 L0 0 L0 100 M0 50 L40 50"),
            ['G'] = G(56, "M52.2 14 A28 28 0 0 0 0 28 L0 72 A28 28 0 0 0 56 72 L56 54 L30 54"),
            ['H'] = G(54, "M0 0 L0 100 M54 0 L54 100 M0 50 L54 50"),
            ['I'] = G(0, "M0 0 L0 100"),
            ['J'] = G(44, "M44 0 L44 78 A22 22 0 0 1 0 78"),
            ['K'] = G(52, "M0 0 L0 100 M50 0 L0 60 M17 39.6 L54 100"),
            ['L'] = G(46, "M0 0 L0 100 L46 100"),
            ['M'] = G(70, "M0 100 L0 0 L35 62 L70 0 L70 100"),
            ['N'] = G(56, "M0 100 L0 0 L56 100 L56 0"),
            ['O'] = G(60, "M0 30 A30 30 0 0 1 60 30 L60 70 A30 30 0 0 1 0 70 Z"),
            ['P'] = G(54, "M0 100 L0 0 L28 0 A26 26 0 0 1 28 52 L0 52"),
            ['Q'] = G(60, "M0 30 A30 30 0 0 1 60 30 L60 70 A30 30 0 0 1 0 70 Z M38 74 L62 102"),
            ['R'] = G(54, "M0 100 L0 0 L28 0 A26 26 0 0 1 28 52 L0 52 M28 52 L54 100"),
            ['S'] = G(54, "M49.7 14.4 A25 25 0 1 0 27 50 A25 25 0 1 1 4.3 85.6"),
            ['T'] = G(56, "M0 0 L56 0 M28 0 L28 100"),
            ['U'] = G(56, "M0 0 L0 72 A28 28 0 0 0 56 72 L56 0"),
            ['V'] = G(60, "M0 0 L30 100 L60 0"),
            ['W'] = G(84, "M0 0 L20 100 L42 28 L64 100 L84 0"),
            ['X'] = G(56, "M0 0 L56 100 M56 0 L0 100"),
            ['Y'] = G(58, "M0 0 L29 52 L58 0 M29 52 L29 100"),
            ['Z'] = G(54, "M0 0 L54 0 L0 100 L54 100"),

            [' '] = new Glyph(30, []),
            [' '] = new Glyph(30, []),
            ['.'] = G(0, "M0 98.5 L0 100"),
            [','] = G(6, "M4 96 L0 110"),
            [':'] = G(0, "M0 33.5 L0 35 M0 98.5 L0 100"),
            [';'] = G(6, "M4 33.5 L4 35 M4 96 L0 110"),
            ['-'] = G(30, "M0 58 L30 58"),
            ['–'] = G(46, "M0 58 L46 58"),
            ['—'] = G(70, "M0 58 L70 58"),
            ['−'] = G(46, "M0 56 L46 56"),
            ['+'] = G(46, "M0 56 L46 56 M23 33 L23 79"),
            ['='] = G(46, "M0 44 L46 44 M0 68 L46 68"),
            ['/'] = G(40, "M40 0 L0 100"),
            ['\\'] = G(40, "M0 0 L40 100"),
            ['%'] = G(66, "M1 14 A11 11 0 1 1 23 14 A11 11 0 1 1 1 14 Z M43 86 A11 11 0 1 1 65 86 A11 11 0 1 1 43 86 Z M60 0 L6 100"),
            ['°'] = G(26, "M0 13 A13 13 0 1 1 26 13 A13 13 0 1 1 0 13 Z"),
            ['('] = G(20, "M20 -6 A80 80 0 0 0 20 106"),
            [')'] = G(20, "M0 -6 A80 80 0 0 1 0 106"),
            ['['] = G(18, "M18 -6 L0 -6 L0 106 L18 106"),
            [']'] = G(18, "M0 -6 L18 -6 L18 106 L0 106"),
            ['!'] = G(0, "M0 0 L0 66 M0 98.5 L0 100"),
            ['?'] = G(48, "M0 24 A24 24 0 1 1 34 45.7 L24 54 L24 70 M24 98.5 L24 100"),
            ['\''] = G(0, "M0 0 L0 26"),
            ['’'] = G(6, "M6 0 L2 26"),
            ['‘'] = G(6, "M2 0 L6 26"),
            ['"'] = G(16, "M0 0 L0 26 M16 0 L16 26"),
            ['#'] = G(58, "M20 0 L14 100 M46 0 L40 100 M3 33 L58 33 M0 67 L55 67"),
            ['&'] = G(62, "M60 100 L14.6 34.4 A19 19 0 1 1 37.5 37.5 L10 62 A21 21 0 0 0 26 100 C40 100 50 90 56 72"),
            ['*'] = G(40, "M20 8 L20 52 M1 19 L39 41 M39 19 L1 41"),
            ['<'] = G(44, "M44 28 L0 56 L44 84"),
            ['>'] = G(44, "M0 28 L44 56 L0 84"),
            ['_'] = G(54, "M0 108 L54 108"),
            ['|'] = G(0, "M0 -8 L0 108"),
            ['^'] = G(44, "M0 30 L22 0 L44 30"),
            ['~'] = G(56, "M0 60 C8 46 18 46 28 56 C38 66 48 66 56 52"),
            ['·'] = G(0, "M0 55.25 L0 56.75"),
            ['•'] = G(14, "M7 49 L7 63"),
            ['…'] = G(48, "M0 98.5 L0 100 M24 98.5 L24 100 M48 98.5 L48 100"),
            ['↑'] = G(44, "M22 100 L22 2 M0 24 L22 2 L44 24"),
            ['↓'] = G(44, "M22 0 L22 98 M0 76 L22 98 L44 76"),
            ['←'] = G(60, "M60 56 L2 56 M24 34 L2 56 L24 78"),
            ['→'] = G(60, "M0 56 L58 56 M36 34 L58 56 L36 78"),
            ['×'] = G(40, "M0 36 L40 76 M40 36 L0 76"),
            ['$'] = G(54, "M49.7 14.4 A25 25 0 1 0 27 50 A25 25 0 1 1 4.3 85.6 M27 -8 L27 108"),
            ['µ'] = G(56, "M0 0 L0 108 M0 72 A28 28 0 0 0 56 72 L56 0"),

            // Wave 2: what device, app and track names use (measured on real strings; see docs/authoring-actions.md §3.1).
            ['@'] = G(72, "M48 54 A14 14 0 1 1 20 54 A14 14 0 1 1 48 54 Z M48 40 L48 60 A12 12 0 0 0 72 60 L72 54 A36 36 0 1 0 61.46 79.46"),
            ['`'] = G(12, "M0 2 L12 22"),
            ['´'] = G(12, "M12 2 L0 22"),
            ['{'] = G(24, "M24 -6 C14 -6 12 0 12 10 L12 38 C12 46 8 50 0 50 C8 50 12 54 12 62 L12 90 C12 100 14 106 24 106"),
            ['}'] = G(24, "M0 -6 C10 -6 12 0 12 10 L12 38 C12 46 16 50 24 50 C16 50 12 54 12 62 L12 90 C12 100 10 106 0 106"),
            ['∞'] = G(72, "M36 56 C27 36 0 36 0 56 C0 76 27 76 36 56 C45 36 72 36 72 56 C72 76 45 76 36 56 Z"),
            ['“'] = G(20, "M2 0 L6 26 M16 0 L20 26"),
            ['”'] = G(20, "M6 0 L2 26 M20 0 L16 26"),
            ['„'] = G(18, "M4 92 L0 110 M18 92 L14 110"),
            ['‹'] = G(22, "M22 34 L0 56 L22 78"),
            ['›'] = G(22, "M0 34 L22 56 L0 78"),
            ['«'] = G(48, "M22 34 L0 56 L22 78 M48 34 L26 56 L48 78"),
            ['»'] = G(48, "M0 34 L22 56 L0 78 M26 34 L48 56 L26 78"),
            ['′'] = G(4, "M4 0 L0 26"),
            ['″'] = G(16, "M4 0 L0 26 M16 0 L12 26"),
            ['¡'] = G(0, "M0 0 L0 1.5 M0 34 L0 100"),
            ['¿'] = G(48, "M48 76 A24 24 0 1 1 14 54.3 L24 46 L24 30 M24 1.5 L24 0"),
            ['†'] = G(40, "M20 0 L20 100 M0 26 L40 26"),
            ['§'] = G(40, "M36 10 C32 2 26 0 20 0 C10 0 4 6 4 14 C4 30 36 30 36 46 C36 54 30 58 22 60 M18 40 C10 42 4 46 4 54 C4 70 36 70 36 86 C36 94 30 100 20 100 C14 100 6 98 2 90"),
            ['©'] = G(70, "M70 50 A35 35 0 1 1 0 50 A35 35 0 1 1 70 50 Z M45.6 39.4 A15 15 0 1 0 45.6 60.6"),
            ['®'] = G(70, "M70 50 A35 35 0 1 1 0 50 A35 35 0 1 1 70 50 Z M27 68 L27 32 L38 32 A9 9 0 0 1 38 50 L27 50 M38 50 L46 68"),
            ['™'] = G(62, "M0 0 L24 0 M12 0 L12 38 M34 38 L34 0 L48 24 L62 0 L62 38"),
            ['€'] = G(60, "M58.2 14 A28 28 0 0 0 6 28 L6 72 A28 28 0 0 0 58.2 86 M0 40 L38 40 M0 60 L38 60"),
            ['£'] = G(54, "M50 10 C45 3 38 0 31 0 C19 0 12 8 12 22 L12 100 M0 100 L54 100 M0 54 L38 54"),
            ['¥'] = G(58, "M0 0 L29 50 L58 0 M29 50 L29 100 M10 62 L48 62 M10 80 L48 80"),
            ['¢'] = G(44, "M41.6 34.4 A22 22 0 1 0 41.6 65.6 M26 18 L26 82"),
            ['÷'] = G(46, "M0 56 L46 56 M23 32 L23 33.5 M23 78.5 L23 80"),
            ['±'] = G(46, "M0 46 L46 46 M23 23 L23 69 M0 92 L46 92"),
            ['≈'] = G(56, "M0 46 C8 32 18 32 28 42 C38 52 48 52 56 38 M0 74 C8 60 18 60 28 70 C38 80 48 80 56 66"),
            ['≠'] = G(46, "M0 44 L46 44 M0 68 L46 68 M36 24 L10 88"),
            ['≤'] = G(44, "M44 22 L0 44 L44 66 M0 86 L44 86"),
            ['≥'] = G(44, "M0 22 L44 44 L0 66 M0 86 L44 86"),
            ['¬'] = G(46, "M0 50 L46 50 L46 70"),
            ['№'] = G(90, "M0 100 L0 0 L56 100 L56 0 M66 44 A12 14 0 1 1 90 44 A12 14 0 1 1 66 44 Z M66 72 L90 72"),
            ['♥'] = G(60, "M30 94 L8 64 C-2 50 4 24 18 24 C24 24 28 28 30 34 C32 28 36 24 42 24 C56 24 62 50 52 64 Z"),
            ['♪'] = G(40, "M22 84 A11 9 0 1 1 0 84 A11 9 0 1 1 22 84 Z M22 84 L22 6 C26 20 40 22 40 40"),
            ['♫'] = G(64, "M18 86 A9 8 0 1 1 0 86 A9 8 0 1 1 18 86 Z M64 78 A9 8 0 1 1 46 78 A9 8 0 1 1 64 78 Z M18 86 L18 14 L64 4 L64 78 M18 30 L64 20"),
            ['♭'] = G(34, "M0 0 L0 100 C20 90 34 80 34 66 C34 54 20 50 0 64"),
            ['♯'] = G(44, "M14 4 L14 100 M30 0 L30 96 M0 40 L44 32 M0 70 L44 62"),
            ['★'] = G(66, "M33 20 L41.23 42.67 L65.34 43.49 L46.31 58.33 L52.98 81.51 L33 68 L13.02 81.51 L19.69 58.33 L0.66 43.49 L24.77 42.67 Z"),
            ['✓'] = G(56, "M0 56 L20 80 L56 22"),
            ['✗'] = G(48, "M0 24 L48 84 M48 24 L0 84"),
            ['●'] = G(36, "M36 56 A18 18 0 1 1 0 56 A18 18 0 1 1 36 56 Z M24 56 A6 6 0 1 1 12 56 A6 6 0 1 1 24 56 Z"),
            ['○'] = G(36, "M36 56 A18 18 0 1 1 0 56 A18 18 0 1 1 36 56 Z"),
            ['■'] = G(36, "M0 38 L36 38 L36 74 L0 74 Z M12 50 L24 50 L24 62 L12 62 Z"),
            ['□'] = G(36, "M0 38 L36 38 L36 74 L0 74 Z"),
            ['▲'] = G(44, "M0 82 L22 30 L44 82 Z"),
            ['▼'] = G(44, "M0 30 L22 82 L44 30 Z"),
            ['▶'] = G(40, "M0 34 L40 56 L0 78 Z"),
            ['◀'] = G(40, "M40 34 L0 56 L40 78 Z"),
            ['↔'] = G(72, "M2 56 L70 56 M24 34 L2 56 L24 78 M48 34 L70 56 L48 78"),

            // Latin letters without a decomposition.
            ['Ł'] = G(56, "M12 0 L12 100 L56 100 M0 64 L26 42"),
            ['Đ'] = G(64, "M8 0 L8 100 L32 100 A32 32 0 0 0 64 68 L64 32 A32 32 0 0 0 32 0 Z M0 50 L26 50"),
            ['Þ'] = G(54, "M0 0 L0 100 M0 20 L28 20 A26 26 0 0 1 28 72 L0 72"),
            ['Ħ'] = G(66, "M6 0 L6 100 M60 0 L60 100 M6 50 L60 50 M0 24 L66 24"),

            // Cyrillic capitals (those shaped like Latin letters are aliases, see BuildAliases).
            ['Б'] = G(56, "M50 0 L0 0 L0 100 L30 100 A26 26 0 0 0 30 48 L0 48"),
            ['Г'] = G(46, "M46 0 L0 0 L0 100"),
            ['Ґ'] = G(46, "M0 100 L0 0 L46 0 L46 -18"),
            ['Д'] = G(66, "M0 116 L0 100 L66 100 L66 116 M8 100 L22 0 L56 0 L56 100"),
            ['Є'] = G(56, "M52.2 14 A28 28 0 0 0 0 28 L0 72 A28 28 0 0 0 52.2 86 M0 50 L38 50"),
            ['Ж'] = G(76, "M38 0 L38 100 M0 0 L38 52 L0 100 M76 0 L38 52 L76 100"),
            ['З'] = G(52, "M2 12 C10 2 20 0 26 0 C40 0 48 10 48 24 C48 38 38 48 22 48 C40 48 52 58 52 74 C52 90 40 100 26 100 C16 100 6 96 0 86"),
            ['И'] = G(56, "M0 0 L0 100 L56 0 L56 100"),
            ['Л'] = G(56, "M0 100 L14 0 L56 0 L56 100"),
            ['П'] = G(54, "M0 100 L0 0 L54 0 L54 100"),
            ['У'] = G(60, "M0 0 L37.96 58 M60 0 L22 100"),
            ['Ф'] = G(68, "M34 0 L34 100 M34 16 C14 16 0 30 0 50 C0 70 14 84 34 84 C54 84 68 70 68 50 C68 30 54 16 34 16 Z"),
            ['Ц'] = G(62, "M0 0 L0 100 L52 100 L52 0 M52 100 L62 100 L62 116"),
            ['Ч'] = G(52, "M0 0 L0 28 C0 44 10 54 26 54 L52 54 M52 0 L52 100"),
            ['Ш'] = G(78, "M0 0 L0 100 L78 100 L78 0 M39 0 L39 100"),
            ['Щ'] = G(88, "M0 0 L0 100 L78 100 L78 0 M39 0 L39 100 M78 100 L88 100 L88 116"),
            ['Ъ'] = G(66, "M0 0 L14 0 L14 100 L40 100 A26 26 0 0 0 40 48 L14 48"),
            ['Ы'] = G(72, "M0 0 L0 100 L24 100 A26 26 0 0 0 24 48 L0 48 M72 0 L72 100"),
            ['Ь'] = G(50, "M0 0 L0 100 L24 100 A26 26 0 0 0 24 48 L0 48"),
            ['Э'] = G(56, "M3.8 14 A28 28 0 0 1 56 28 L56 72 A28 28 0 0 1 3.8 86 M18 50 L56 50"),
            ['Ю'] = G(74, "M0 0 L0 100 M0 50 L22 50 M22 26 A26 26 0 0 1 74 26 L74 74 A26 26 0 0 1 22 74 Z"),
            ['Я'] = G(54, "M54 100 L54 0 L26 0 A26 26 0 0 0 26 52 L54 52 M26 52 L0 100"),
            ['Ђ'] = G(56, "M0 0 L44 0 M14 0 L14 100 M14 44 L34 44 C48 44 56 54 56 68 L56 84 C56 96 48 104 36 104"),
            ['Ћ'] = G(56, "M0 0 L44 0 M14 0 L14 100 M14 44 L34 44 C48 44 56 54 56 68 L56 100"),
            ['Љ'] = G(92, "M0 100 L12 0 L44 0 L44 100 L66 100 A26 26 0 0 0 66 48 L44 48"),
            ['Њ'] = G(92, "M0 0 L0 100 M44 0 L44 100 L66 100 A26 26 0 0 0 66 48 L0 48"),
            ['Џ'] = G(54, "M0 0 L0 100 L54 100 L54 0 M27 100 L27 116"),

            // Greek capitals (the Latin-shaped ones are aliases).
            ['Δ'] = G(62, "M0 100 L31 0 L62 100 Z"),
            ['Θ'] = G(60, "M0 30 A30 30 0 0 1 60 30 L60 70 A30 30 0 0 1 0 70 Z M16 50 L44 50"),
            ['Λ'] = G(62, "M0 100 L31 0 L62 100"),
            ['Ξ'] = G(54, "M0 0 L54 0 M8 50 L46 50 M0 100 L54 100"),
            ['Σ'] = G(54, "M54 0 L0 0 L30 50 L0 100 L54 100"),
            ['Ψ'] = G(64, "M0 0 L0 30 C0 50 14 60 32 60 C50 60 64 50 64 30 L64 0 M32 0 L32 100"),
            ['Ω'] = G(60, "M0 100 L18 100 A30 52.2 0 1 1 42 100 L60 100"),
        };

        // Fractions and super/subscript digits, built from the digits.
        Cmd[] D(char digit, double scale, double dx, double dy) => Transform(g[digit].Commands, scale, dx, dy);
        const double Small = 0.46;
        g['½'] = new Glyph(70, [.. D('1', Small, 0, 0), .. Parse("M62 2 L8 98"), .. D('2', Small, 43.3, 54)]);
        g['¼'] = new Glyph(70, [.. D('1', Small, 0, 0), .. Parse("M62 2 L8 98"), .. D('4', Small, 43.3, 54)]);
        g['¾'] = new Glyph(70, [.. D('3', Small, 0, 0), .. Parse("M62 2 L8 98"), .. D('4', Small, 43.3, 54)]);
        var superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";
        var subscripts = "₀₁₂₃₄₅₆₇₈₉";
        for (var i = 0; i < 10; i++)
        {
            g[superscripts[i]] = new Glyph(DigitBox * 0.5, D((char)('0' + i), 0.5, 0, 0));
            g[subscripts[i]] = new Glyph(DigitBox * 0.5, D((char)('0' + i), 0.5, 0, 58));
        }
        return g;
    }

    // Characters drawn with another character's glyph: Cyrillic and Greek letters shaped like Latin capitals, and
    // symbol variants (dashes, quotes, hearts, stars, checks).
    private static Dictionary<char, char> BuildAliases()
    {
        var a = new Dictionary<char, char>
        {
            // Cyrillic
            ['А'] = 'A', ['В'] = 'B', ['Е'] = 'E', ['Ѕ'] = 'S', ['І'] = 'I', ['Ј'] = 'J', ['К'] = 'K', ['М'] = 'M', ['Н'] = 'H',
            ['О'] = 'O', ['Р'] = 'P', ['С'] = 'C', ['Т'] = 'T', ['Х'] = 'X', ['Ү'] = 'Y', ['Һ'] = 'H', ['Ӏ'] = 'I', ['Ө'] = 'Θ',
            // Greek
            ['Α'] = 'A', ['Β'] = 'B', ['Γ'] = 'Г', ['Ε'] = 'E', ['Ζ'] = 'Z', ['Η'] = 'H', ['Ι'] = 'I', ['Κ'] = 'K', ['Μ'] = 'M',
            ['Ν'] = 'N', ['Ο'] = 'O', ['Π'] = 'П', ['Ρ'] = 'P', ['Τ'] = 'T', ['Υ'] = 'Y', ['Φ'] = 'Ф', ['Χ'] = 'X', ['ϴ'] = 'Θ',
            // Latin
            ['Ð'] = 'Đ',
            // Punctuation and symbols
            ['‐'] = '-', ['‑'] = '-', ['‒'] = '–', ['―'] = '—', ['⁄'] = '/', ['∕'] = '/', ['∗'] = '*', ['∙'] = '·', ['‧'] = '·',
            ['‚'] = ',', ['ʼ'] = '’', ['‛'] = '‘', ['‟'] = '“', ['❛'] = '‘', ['❜'] = '’', ['❝'] = '“', ['❞'] = '”',
            ['＂'] = '"', ['❤'] = '♥', ['♡'] = '♥', ['♬'] = '♫', ['♩'] = '♪', ['☆'] = '★', ['✦'] = '★', ['✔'] = '✓', ['✘'] = '✗',
            ['✕'] = '×', ['✖'] = '×', ['⋅'] = '·', ['◦'] = '○', ['◯'] = '○', ['▪'] = '■', ['▫'] = '□', ['►'] = '▶', ['◄'] = '◀',
            ['▸'] = '▶', ['◂'] = '◀', ['△'] = '▲', ['▽'] = '▼', ['⇒'] = '→', ['⟶'] = '→', ['⇐'] = '←', ['⟵'] = '←',
        };
        return a;
    }

    private static Cmd[] Transform(Cmd[] cmds, double s, double dx, double dy) =>
        cmds.Select(c => c.Op switch
        {
            'A' => new Cmd('A', [c.Args[0] * s, c.Args[1] * s, c.Args[2], c.Args[3], c.Args[4], c.Args[5] * s + dx, c.Args[6] * s + dy]),
            'Z' => c,
            _ => new Cmd(c.Op, c.Args.Select((v, i) => i % 2 == 0 ? v * s + dx : v * s + dy).ToArray()),
        }).ToArray();
}
