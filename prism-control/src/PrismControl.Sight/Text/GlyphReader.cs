using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrismControl.Sight.Text;

/// <summary>One glyph template: coverage in a normalized cell (see <see cref="GlyphSet.CellOf"/>).</summary>
public sealed record GlyphTemplate(char Char, float[] Cell, double Aspect, string Source, int Holes = -1);

/// <summary>
/// Glyph templates for a HUD font. A glyph is normalized into a 20×24 cell: the text line (digit height) spans 16 px,
/// the cell covers 0.25 line above and below, and the glyph is centered horizontally. Templates come from Windows fonts
/// (<see cref="Default"/>: a generic reader for common sans/mono fonts) or are harvested from labeled frames of the game
/// itself (the robust path: a fixed HUD font then reads at near 100%).
/// </summary>
public sealed class GlyphSet
{
    public const int CellW = 20;
    public const int CellH = 24;
    private const double PxPerLine = 16;

    public GlyphSet(string name, IEnumerable<GlyphTemplate> templates, bool calibrated)
    {
        Name = name;
        Templates = templates.ToList();
        Calibrated = calibrated;
        Units = Templates.Select(t => Normalize(t.Cell)).ToArray();
    }

    /// <summary>Each template's cell, zero-mean and unit-length: NCC with a normalized cell is one dot product.</summary>
    internal float[]?[] Units { get; }

    /// <summary>Zero-mean, unit-length copy of a cell (null when flat).</summary>
    internal static float[]? Normalize(float[] cell)
    {
        double m = 0;
        foreach (var v in cell) m += v;
        m /= cell.Length;
        var u = new float[cell.Length];
        double n = 0;
        for (var i = 0; i < cell.Length; i++) { u[i] = (float)(cell[i] - m); n += u[i] * (double)u[i]; }
        if (n < 1e-9) return null;
        var k = (float)(1 / Math.Sqrt(n));
        for (var i = 0; i < u.Length; i++) u[i] *= k;
        return u;
    }

    public string Name { get; }
    public IReadOnlyList<GlyphTemplate> Templates { get; }
    /// <summary>True for sets harvested from the game's own frames.</summary>
    public bool Calibrated { get; }

    private static readonly Lazy<GlyphSet> DefaultSet = new(BuildDefault);

    /// <summary>Digits and number punctuation from Segoe UI, Arial, Bahnschrift, Tahoma, Calibri and Consolas, regular and bold.</summary>
    public static GlyphSet Default => DefaultSet.Value;

    private static Task? _warm;

    /// <summary>
    /// Builds <see cref="Default"/> on the thread pool (once; ~0.5–1 s of GDI rendering) and completes when it is ready.
    /// The service starts it with a game, and a closed loop awaits it BEFORE its read budget starts, so a cold build
    /// never eats the first push's reads.
    /// </summary>
    public static Task WarmDefaultAsync() => DefaultSet.IsValueCreated ? Task.CompletedTask : LazyInitializer.EnsureInitialized(ref _warm, () => Task.Run(() => { _ = DefaultSet.Value; }));

    public const string DefaultChars = "0123456789+-%:/,.";

    /// <summary>The normalized cell for a glyph box of a prepared line.</summary>
    public static float[] CellOf(PreparedText t, InkBlob g)
    {
        var cell = new float[CellW * CellH];
        var lh = Math.Max(1, t.LineHeight);
        var s = lh / PxPerLine;                         // source px per cell px
        var cx = (g.X0 + g.X1 + 1) / 2.0;
        var top = t.LineTop - 0.25 * lh;
        for (var y = 0; y < CellH; y++)
            for (var x = 0; x < CellW; x++)
            {
                // 3×3 supersampling: area-correct when the line is much taller than 16 px.
                float sum = 0;
                for (var sy = 0; sy < 3; sy++)
                    for (var sx = 0; sx < 3; sx++)
                    {
                        var px = cx + ((x + (sx + 0.5) / 3.0) - CellW / 2.0) * s - 0.5;
                        var py = top + (y + (sy + 0.5) / 3.0) * s - 0.5;
                        if (px < g.X0 - 0.5 || px > g.X1 + 0.5) continue;   // only this glyph's ink
                        sum += t.InkAt(px, py);
                    }
                cell[y * CellW + x] = sum / 9f;
            }
        return cell;
    }

    /// <summary>
    /// Enclosed background areas inside a glyph (0: 1 2 3 5 7, 1: 0 4 6 9, 2: 8): a topology feature that separates the
    /// shapes plain correlation confuses at small sizes (5/6, 3/8, 0/8). Holes smaller than 1% of the box are noise.
    /// </summary>
    public static int Holes(PreparedText t, InkBlob g)
    {
        int x0 = Math.Max(0, g.X0 - 1), y0 = Math.Max(0, g.Y0 - 1), x1 = Math.Min(t.Width - 1, g.X1 + 1), y1 = Math.Min(t.Height - 1, g.Y1 + 1);
        int w = x1 - x0 + 1, h = y1 - y0 + 1;
        var ink = new bool[w * h];
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
                ink[y * w + x] = t.Ink[(y0 + y) * t.Width + x0 + x] >= 0.5f;
        return CountHoles(ink, w, h);
    }

    internal static int CountHoles(bool[] ink, int w, int h)
    {
        var seen = new bool[w * h];
        var stack = new Stack<int>();
        void Fill(int start)
        {
            stack.Push(start);
            seen[start] = true;
            while (stack.Count > 0)
            {
                var p = stack.Pop();
                int x = p % w, y = p / w;
                if (x > 0) Push(p - 1); if (x < w - 1) Push(p + 1); if (y > 0) Push(p - w); if (y < h - 1) Push(p + w);
            }
        }
        void Push(int q) { if (!ink[q] && !seen[q]) { seen[q] = true; stack.Push(q); } }
        for (var x = 0; x < w; x++) { if (!ink[x] && !seen[x]) Fill(x); var b = (h - 1) * w + x; if (!ink[b] && !seen[b]) Fill(b); }
        for (var y = 0; y < h; y++) { var l = y * w; if (!ink[l] && !seen[l]) Fill(l); var r = y * w + w - 1; if (!ink[r] && !seen[r]) Fill(r); }
        var holes = 0;
        var minArea = Math.Max(2, (int)(w * h * 0.01));
        for (var i = 0; i < w * h; i++)
        {
            if (ink[i] || seen[i]) continue;
            var before = Count(seen);
            Fill(i);
            if (Count(seen) - before >= minArea) holes++;
        }
        return holes;

        static int Count(bool[] a) { var n = 0; foreach (var v in a) if (v) n++; return n; }
    }

    /// <summary>Zero-mean normalized cross-correlation of two cells (−1..1; 0 when either is flat).</summary>
    public static double Ncc(float[] a, float[] b)
    {
        double ma = 0, mb = 0;
        for (var i = 0; i < a.Length; i++) { ma += a[i]; mb += b[i]; }
        ma /= a.Length; mb /= b.Length;
        double num = 0, da = 0, db = 0;
        for (var i = 0; i < a.Length; i++)
        {
            var x = a[i] - ma;
            var y = b[i] - mb;
            num += x * y; da += x * x; db += y * y;
        }
        return da < 1e-9 || db < 1e-9 ? 0 : num / Math.Sqrt(da * db);
    }

    // ------------------------------------------------------------------ persistence

    private sealed class Dto
    {
        public int V { get; set; } = 1;
        public string Name { get; set; } = "";
        public bool Calibrated { get; set; }
        public int CellW { get; set; } = GlyphSet.CellW;
        public int CellH { get; set; } = GlyphSet.CellH;
        public List<GlyphDto> Glyphs { get; set; } = [];
    }

    private sealed class GlyphDto
    {
        [JsonPropertyName("ch")] public string Ch { get; set; } = "";
        public double Aspect { get; set; }
        public string Source { get; set; } = "";
        public int Holes { get; set; } = -1;
        /// <summary>Coverage ×255, base64 of CellW×CellH bytes.</summary>
        public string Cell { get; set; } = "";
    }

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    public string ToJson()
    {
        var dto = new Dto
        {
            Name = Name,
            Calibrated = Calibrated,
            Glyphs = Templates.Select(t => new GlyphDto
            {
                Ch = t.Char.ToString(), Aspect = Math.Round(t.Aspect, 4), Source = t.Source, Holes = t.Holes,
                Cell = Convert.ToBase64String(t.Cell.Select(v => (byte)Math.Clamp(Math.Round(v * 255), 0, 255)).ToArray()),
            }).ToList(),
        };
        return JsonSerializer.Serialize(dto, Json);
    }

    public static GlyphSet FromJson(string json)
    {
        var dto = JsonSerializer.Deserialize<Dto>(json, Json) ?? throw new FormatException("empty glyph set");
        if (dto.V != 1 || dto.CellW != CellW || dto.CellH != CellH) throw new FormatException("unsupported glyph set version or cell size");
        var list = new List<GlyphTemplate>();
        foreach (var g in dto.Glyphs)
        {
            if (g.Ch.Length != 1) throw new FormatException($"glyph '{g.Ch}' must be one character");
            var bytes = Convert.FromBase64String(g.Cell);
            if (bytes.Length != CellW * CellH) throw new FormatException($"glyph '{g.Ch}' has a bad cell");
            list.Add(new GlyphTemplate(g.Ch[0], bytes.Select(b => b / 255f).ToArray(), g.Aspect, g.Source, g.Holes));
        }
        return new GlyphSet(dto.Name, list, dto.Calibrated);
    }

    // ------------------------------------------------------------------ building

    private static GlyphSet BuildDefault()
    {
        (string Face, int Weight)[] fonts =
        [
            ("Segoe UI", 400), ("Segoe UI", 700), ("Arial", 400), ("Arial", 700), ("Bahnschrift", 400), ("Bahnschrift", 700),
            ("Tahoma", 400), ("Calibri", 400), ("Calibri", 700), ("Consolas", 400),
        ];
        var list = new List<GlyphTemplate>();
        foreach (var (face, weight) in fonts)
            foreach (var em in new[] { 15, 22, 32, 48 })
            {
                try { list.AddRange(FromFont(face, weight, DefaultChars, em)); }
                catch (Exception) { /* a missing font is skipped */ }
            }
        return new GlyphSet("windows-fonts", list, calibrated: false);
    }

    /// <summary>Templates for <paramref name="chars"/> rendered from a Windows font (each placed on the font's digit line).</summary>
    public static IEnumerable<GlyphTemplate> FromFont(string face, int weight, string chars, int emPx = 48)
    {
        var zero = GdiText.Render("0", face, emPx, weight);
        var zeroBox = InkBox(zero);
        if (zeroBox is null) yield break;
        var (_, zTop, _, zBottom) = zeroBox.Value;
        foreach (var ch in chars)
        {
            var m = GdiText.Render(ch.ToString(), face, emPx, weight);
            var box = InkBox(m);
            if (box is null) continue;
            var (x0, y0, x1, y1) = box.Value;
            // Same origin as "0" (same pad and ascent), so the digit line from "0" applies.
            var t = new PreparedText
            {
                Width = m.Width, Height = m.Height, Ink = m.Coverage,
                Glyphs = [new InkBlob(x0, y0, x1, y1, 0)], LineTop = zTop, LineBottom = zBottom,
            };
            var g = t.Glyphs[0];
            yield return new GlyphTemplate(ch, CellOf(t, g), (double)g.W / t.LineHeight, $"{face} {weight} {emPx}px", Holes(t, g));
        }
    }

    private static (int X0, int Y0, int X1, int Y1)? InkBox(GdiText.Mask m)
    {
        int x0 = m.Width, y0 = m.Height, x1 = -1, y1 = -1;
        for (var y = 0; y < m.Height; y++)
            for (var x = 0; x < m.Width; x++)
                if (m.Coverage[y * m.Width + x] > 0.5f) { x0 = Math.Min(x0, x); x1 = Math.Max(x1, x); y0 = Math.Min(y0, y); y1 = Math.Max(y1, y); }
        return x1 < 0 ? null : (x0, y0, x1, y1);
    }

    /// <summary>
    /// Builds a calibrated set from prepared lines whose true text is known (labeled frames). A sample is used only when
    /// its glyph count equals the character count (spaces ignored); several samples per character are kept (up to 4).
    /// </summary>
    public static GlyphSet Harvest(string name, IEnumerable<(PreparedText Text, string Truth)> samples)
    {
        var byChar = new Dictionary<char, List<GlyphTemplate>>();
        foreach (var (t, truth) in samples)
        {
            var chars = truth.Where(c => !char.IsWhiteSpace(c)).ToList();
            if (t.StrippedSuperscript && chars.Count > 0 && chars[^1] is '°' or '²' or '³') chars.RemoveAt(chars.Count - 1);
            if (chars.Count != t.Glyphs.Count) continue;
            for (var i = 0; i < chars.Count; i++)
            {
                var g = t.Glyphs[i];
                var tpl = new GlyphTemplate(chars[i], CellOf(t, g), (double)g.W / Math.Max(1, t.LineHeight), "harvested", Holes(t, g));
                if (!byChar.TryGetValue(chars[i], out var list)) byChar[chars[i]] = list = [];
                // Keep distinct variants only.
                if (list.Count < 4 && list.All(o => Ncc(o.Cell, tpl.Cell) < 0.97)) list.Add(tpl);
            }
        }
        return new GlyphSet(name, byChar.Values.SelectMany(v => v), calibrated: true);
    }
}

/// <summary>The result of reading a line with glyph templates.</summary>
public sealed record GlyphRead(string Text, double Score, double Margin, int Unknown, IReadOnlyList<double>? Scores = null)
{
    /// <summary>Glyphs read at least this well are taken as real digits, never as a misread unit.</summary>
    public const double SureDigit = 0.8;

    /// <summary>
    /// The read without a trailing unit (letters or unknown glyphs after the last digit, e.g. "12.5 m"), scored only
    /// over the glyphs that remain: the unit's glyphs are not in a digit set and must not sink the number's confidence.
    /// A value is never shortened: digits read confidently after the gap ("1 250", a spaced thousands group; "1 5", wide
    /// tracking) are part of the number and stay (the parse joins a thousands group or fails, Unknown; never "1"), and
    /// so does a tail with more glyphs than <paramref name="unit"/> could produce.
    /// </summary>
    public GlyphRead WithoutUnit(string? unit = null)
    {
        if (Scores is null) return this;
        // Only a unit set off by a space ("21.5 m", "12 km/h") is cut: an unknown "m" may be read as weak digit-like
        // parts, so the tail is judged by its scores. Anything attached to the number (an unread "?") stays, so a fused
        // "0°" can never turn "30" into "3".
        var firstDigit = -1;
        for (var i = 0; i < Text.Length; i++) if (char.IsDigit(Text[i])) { firstDigit = i; break; }
        var space = firstDigit < 0 ? -1 : Text.IndexOf(' ', firstDigit);
        if (space <= 0) return this;
        var tailDigits = Enumerable.Range(space + 1, Text.Length - space - 1).Where(i => char.IsDigit(Text[i])).ToList();
        if (tailDigits.Count > 0 && !Text[space..].Contains('?') && tailDigits.All(i => i < Scores.Count && Scores[i] >= SureDigit)) return this;
        var unitGlyphs = unit?.Count(c => !char.IsWhiteSpace(c)) ?? 0;
        if (unitGlyphs > 0 && Text[(space + 1)..].Count(c => c != ' ') > unitGlyphs + 1) return this;
        var last = space - 1;
        var keep = Text[..(last + 1)];
        var scores = Scores.Take(last + 1).ToList();
        return new GlyphRead(keep, scores.Count == 0 ? 0 : scores.Min(), Margin, keep.Count(c => c == '?'), scores);
    }
}

/// <summary>
/// Reads a prepared text line glyph by glyph: punctuation by geometry (".", ",", "-", "°"), everything else by
/// normalized cross-correlation against the set's templates (restricted to the whitelist), weighted by the aspect and
/// hole count (topology). A blob that reads badly and is wide is split at its thinnest column (touching glyphs at
/// small sizes). Gaps wider than half the line height become spaces. Score = the weakest glyph; Margin = the smallest
/// best-vs-runner-up gap.
/// </summary>
public static class GlyphReader
{
    public static GlyphRead Read(PreparedText t, GlyphSet set, string? whitelist = null, double minScore = 0.55)
    {
        if (t.IsEmpty) return new GlyphRead("", 0, 0, 0);
        var lh = (double)t.LineHeight;
        var sb = new StringBuilder();
        var scores = new List<double>();
        double worst = 1, margin = 1;
        var unknown = 0;
        InkBlob? prev = null;
        foreach (var g in t.Glyphs)
        {
            if (prev is not null && g.X0 - prev.X1 - 1 > lh * 0.5) { sb.Append(' '); scores.Add(1); }
            prev = g;
            foreach (var (c, score, m) in ReadBlob(t, g, set, whitelist, lh, depth: 0))
            {
                if (c == '?' || score < minScore) { sb.Append('?'); scores.Add(Math.Max(0, score)); unknown++; worst = Math.Min(worst, Math.Max(0, score)); continue; }
                sb.Append(c);
                scores.Add(score);
                worst = Math.Min(worst, score);
                margin = Math.Min(margin, m);
            }
        }
        return new GlyphRead(sb.ToString(), Math.Max(0, worst), Math.Max(0, margin), unknown, scores);
    }

    private static List<(char C, double Score, double Margin)> ReadBlob(PreparedText t, InkBlob g, GlyphSet set, string? whitelist, double lh, int depth)
    {
        var geo = Geometric(t, g, lh);
        if (geo is { } gc && (whitelist is null || whitelist.Contains(gc) || gc == '°')) return [(gc, 1, 1)];
        var (c, best, second) = Classify(t, g, set, whitelist, lh);
        var single = new List<(char, double, double)> { (c, best, best - Math.Max(0, second)) };
        // Touching glyphs: try a split when the read is weak and the blob is wider than one glyph usually is.
        if (depth < 2 && best < 0.72 && g.W > lh * 0.75 && g.Parts == 1)   // only one connected blob can be touching glyphs
        {
            var cut = ThinnestColumn(t, g);
            if (cut > g.X0 + 1 && cut < g.X1 - 1)
            {
                var left = Shrink(t, new InkBlob(g.X0, g.Y0, cut - 1, g.Y1, 0));
                var right = Shrink(t, new InkBlob(cut + 1, g.Y0, g.X1, g.Y1, 0));
                // Both halves must look like whole glyphs (tall enough, not slivers) and read clearly better.
                // ...and, unless the blob is clearly two glyphs wide, the cut must not cross a hole (a "0" split down the
                // middle is not "13"; touching glyphs may enclose an extra gap, which is fine).
                var clearlyTwo = g.W >= lh * 1.1;
                // A small ring fused to the top right of a digit ("0°" at small sizes) is a superscript: allowed to be short.
                var superscript = right is not null && right.Y1 < t.LineTop + lh * 0.6 && right.H < lh * 0.6;
                if (left is not null && right is not null && left.W >= lh * 0.25 && left.H >= lh * 0.5
                    && (superscript || (right.W >= lh * 0.25 && right.H >= lh * 0.5))
                    && (clearlyTwo || superscript || GlyphSet.Holes(t, left) + GlyphSet.Holes(t, right) == GlyphSet.Holes(t, g)))
                {
                    var parts = ReadBlob(t, left, set, whitelist, lh, depth + 1);
                    parts.AddRange(ReadBlob(t, right, set, whitelist, lh, depth + 1));
                    if (parts.All(p => p.Item1 != (char)63) && parts.Min(p => p.Item2) >= Math.Max(best + 0.1, 0.6)) return parts;
                }
            }
        }
        return single;
    }

    private static (char C, double Best, double Second) Classify(PreparedText t, InkBlob g, GlyphSet set, string? whitelist, double lh)
    {
        var cell = GlyphSet.Normalize(GlyphSet.CellOf(t, g));
        if (cell is null) return ('?', 0, 0);
        var aspect = g.W / lh;
        var holes = GlyphSet.Holes(t, g);
        var bestByChar = new Dictionary<char, double>();
        for (var ti = 0; ti < set.Templates.Count; ti++)
        {
            var tpl = set.Templates[ti];
            if (whitelist is not null && !whitelist.Contains(tpl.Char)) continue;
            var unit = set.Units[ti];
            if (unit is null) continue;
            var dot = 0f;
            for (var i = 0; i < unit.Length; i++) dot += unit[i] * cell[i];
            var s = dot * Math.Exp(-Math.Abs(aspect - tpl.Aspect) * 1.5);
            if (tpl.Holes >= 0 && tpl.Holes != holes) s *= 0.72;
            if (!bestByChar.TryGetValue(tpl.Char, out var cur) || s > cur) bestByChar[tpl.Char] = s;
        }
        if (bestByChar.Count == 0) return ('?', 0, 0);
        var ordered = bestByChar.OrderByDescending(kv => kv.Value).ToList();
        return (ordered[0].Key, ordered[0].Value, ordered.Count > 1 ? ordered[1].Value : 0);
    }

    /// <summary>The column with the least ink in the middle 60% of the blob (where touching glyphs meet).</summary>
    private static int ThinnestColumn(PreparedText t, InkBlob g)
    {
        int from = g.X0 + (int)(g.W * 0.2), to = g.X1 - (int)(g.W * 0.2);
        var best = int.MaxValue;
        var at = -1;
        for (var x = from; x <= to; x++)
        {
            var sum = 0;
            for (var y = g.Y0; y <= g.Y1; y++) if (t.Ink[y * t.Width + x] >= 0.5f) sum++;
            if (sum < best) { best = sum; at = x; }
        }
        return at;
    }

    /// <summary>The tight box of the ink inside <paramref name="b"/> (null when empty).</summary>
    private static InkBlob? Shrink(PreparedText t, InkBlob b)
    {
        int x0 = int.MaxValue, y0 = int.MaxValue, x1 = -1, y1 = -1, n = 0;
        for (var y = b.Y0; y <= b.Y1; y++)
            for (var x = b.X0; x <= b.X1; x++)
                if (t.Ink[y * t.Width + x] >= 0.5f) { n++; x0 = Math.Min(x0, x); x1 = Math.Max(x1, x); y0 = Math.Min(y0, y); y1 = Math.Max(y1, y); }
        return n < 3 ? null : new InkBlob(x0, y0, x1, y1, n);
    }

    /// <summary>Small marks by shape and position relative to the digit line.</summary>
    private static char? Geometric(PreparedText t, InkBlob g, double lh)
    {
        double h = g.H, w = g.W;
        var top = g.Y0 - t.LineTop;
        var bottom = g.Y1 - t.LineTop;
        var cy = (top + bottom) / 2.0;
        // Minus: flat bar around the middle.
        if (h <= lh * 0.22 && w >= lh * 0.18 && w > h * 1.8 && cy > lh * 0.28 && cy < lh * 0.75) return '-';
        // Dot / comma: small, at the baseline.
        if (h <= lh * 0.32 && w <= lh * 0.32 && top >= lh * 0.6)
            return bottom > lh * 1.08 ? ',' : '.';
        // Degree: small ring high up.
        if (bottom < lh * 0.55 && h < lh * 0.55 && w < lh * 0.55) return '°';
        return null;
    }
}
