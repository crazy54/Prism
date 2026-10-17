using PrismControl.Sight.Imaging;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Detectors;

public enum DetectorKind { Color, Bar, Template, Ocr, Change }

/// <summary>
/// One detector's verdict on one region image. <see cref="Score"/> (0..1) is how sure the detector is of THIS verdict
/// (present or absent); readouts and contexts turn it into observed / inferred. <see cref="Box"/> is in region pixels.
/// </summary>
public sealed record DetectorResult(bool Present, double Score, string? Label = null, double? Number = null, string? Text = null,
    PixelRect? Box = null, string? Note = null)
{
    public static DetectorResult Absent(double score, string note) => new(false, score, Note: note) { FullConfidence = false };

    /// <summary>
    /// The value was read with full confidence, so a closed loop may act on it (lead decision 3). OCR: a calibrated glyph
    /// read with no unknown glyph, or the glyph reader and Windows OCR agreeing on this very read; never an "earned trust"
    /// shortcut, a single uncalibrated engine or a disagreement. Pixel detectors (color, bar, template, change) measure,
    /// they do not drop characters: true.
    /// </summary>
    public bool FullConfidence { get; init; } = true;
}

/// <summary>What a detector needs besides its region image.</summary>
public sealed class DetectContext
{
    /// <summary>One HUD unit in pixels for this frame (templates are scaled by it).</summary>
    public required double Unit { get; init; }
    public ITextRecognizer? Ocr { get; init; }
    /// <summary>A closed loop is reading this region: OCR skips its "earned trust" shortcut and cross-checks every read.</summary>
    public bool Strict { get; init; }
    /// <summary>The previous image of the same region (change detection).</summary>
    public SightImage? Previous { get; init; }
    public CancellationToken Cancellation { get; init; }
}

/// <summary>A compiled detector: stateless across frames (caches only derived data such as scaled templates).</summary>
public abstract class Detector
{
    protected Detector(string id, int regionIndex, double? rateHz)
    {
        Id = id;
        RegionIndex = regionIndex;
        RateHz = rateHz ?? DefaultRateHz;
    }

    public string Id { get; }
    public int Index { get; internal set; }
    public int RegionIndex { get; }
    public double RateHz { get; }
    public abstract DetectorKind Kind { get; }
    protected abstract double DefaultRateHz { get; }

    public abstract ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx);

    /// <summary>Default sampling rates (per second) by kind: bars and colors 10, templates 5, OCR 3, change 10.</summary>
    public static double DefaultRateFor(DetectorKind k) => k switch { DetectorKind.Template => 5, DetectorKind.Ocr => 3, _ => 10 };
}

/// <summary>Pixel/color sampling: the fraction of pixels within a per-channel tolerance of a color.</summary>
public sealed class ColorDetector(string id, int regionIndex, double? rateHz, Bgra color, int tolerance, double minFraction) : Detector(id, regionIndex, rateHz)
{
    public Bgra Color { get; } = color;
    public int Tolerance { get; } = tolerance;
    public double MinFraction { get; } = minFraction;
    public override DetectorKind Kind => DetectorKind.Color;
    protected override double DefaultRateHz => 10;

    public override ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx)
    {
        // At most ~4096 samples on a grid: cost is independent of region size.
        var step = Math.Max(1, (int)Math.Sqrt(region.Width * region.Height / 4096.0));
        int hit = 0, n = 0;
        for (var y = step / 2; y < region.Height; y += step)
            for (var x = step / 2; x < region.Width; x += step)
            {
                n++;
                if (region.Get(x, y).MaxChannelDistance(Color) <= Tolerance) hit++;
            }
        var f = n == 0 ? 0 : (double)hit / n;
        var present = f >= MinFraction;
        var span = present ? 1 - MinFraction : MinFraction;
        var score = Math.Clamp(Math.Abs(f - MinFraction) / Math.Max(0.05, span) * 1.5, 0, 1);
        return ValueTask.FromResult(new DetectorResult(present, score, Number: f, Note: $"{f:P0} match"));
    }
}

public enum BarDirection { Right, Left, Up, Down }

/// <summary>
/// Bar fill %: a per-column (or per-row) fill profile across a center band, then the cut that misclassifies the fewest
/// columns (robust to noise and to text drawn over the bar), refined by the boundary column's partial coverage.
/// </summary>
public sealed class BarDetector(string id, int regionIndex, double? rateHz, BarDirection direction, Bgra? fill, int tolerance,
    double brightThreshold, double band, double min, double max) : Detector(id, regionIndex, rateHz)
{
    public BarDirection Direction { get; } = direction;
    public override DetectorKind Kind => DetectorKind.Bar;
    protected override double DefaultRateHz => 10;

    public override ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx)
    {
        var horizontal = Direction is BarDirection.Right or BarDirection.Left;
        var len = horizontal ? region.Width : region.Height;
        var cross = horizontal ? region.Height : region.Width;
        var half = Math.Max(1, (int)Math.Round(cross * Math.Clamp(band, 0.05, 1) / 2));
        int c0 = Math.Max(0, cross / 2 - half), c1 = Math.Min(cross, cross / 2 + half);
        var p = new double[len];
        var pix = region.Pixels;
        var w = region.Width;
        var useColor = fill is not null;
        var f = fill ?? default;
        var lumaMin = brightThreshold * 255;
        for (var i = 0; i < len; i++)
        {
            var at = Direction is BarDirection.Left or BarDirection.Up ? len - 1 - i : i;
            int hit = 0;
            for (var c = c0; c < c1; c++)
            {
                var o = (horizontal ? c * w + at : at * w + c) * 4;
                int b = pix[o], g = pix[o + 1], r = pix[o + 2];
                var isFill = useColor
                    ? Math.Max(Math.Abs(r - f.R), Math.Max(Math.Abs(g - f.G), Math.Abs(b - f.B))) <= tolerance
                    : 0.2126 * r + 0.7152 * g + 0.0722 * b >= lumaMin;
                if (isFill) hit++;
            }
            p[i] = (double)hit / Math.Max(1, c1 - c0);
        }
        // Cut c: columns [0, c) are fill, [c, len) empty. cost(c) = Σ_{<c}(1-p) + Σ_{≥c} p.
        var suffix = 0.0;
        for (var i = 0; i < len; i++) suffix += p[i];
        double prefixMiss = 0, best = suffix;
        var cut = 0;
        for (var c = 1; c <= len; c++)
        {
            prefixMiss += 1 - p[c - 1];
            suffix -= p[c - 1];
            var cost = prefixMiss + suffix;
            if (cost < best - 1e-9) { best = cost; cut = c; }
        }
        // Sub-pixel: the partially covered boundary column.
        var frac = cut;
        double refined = frac;
        if (cut < len && p[cut] > 0 && p[cut] < 1) refined = cut + p[cut];
        else if (cut > 0 && p[cut - 1] > 0 && p[cut - 1] < 1) refined = cut - 1 + p[cut - 1];
        var fraction = Math.Clamp(refined / len, 0, 1);
        var clean = 1 - best / Math.Max(1, len);          // 1 = every column clearly fill or empty
        var score = Math.Clamp((clean - 0.75) / 0.2, 0, 1);
        var value = min + fraction * (max - min);
        return ValueTask.FromResult(new DetectorResult(true, score, Number: value, Note: $"fill {fraction:P1}, clean {clean:P0}"));
    }
}

/// <summary>A labeled grayscale template (at reference size: referenceHeight with HUD scale 1).</summary>
public sealed record TemplateImage(string Label, GrayImage Image);

/// <summary>
/// Normalized cross-correlation template matching (zero-mean, so brightness/contrast-invariant): coarse search at half
/// resolution, then refinement at full resolution. Several templates = "which one is showing" (active tool icons).
/// The best score must reach <see cref="Threshold"/> for "present"; the box is where it was found.
/// </summary>
public sealed class TemplateDetector(string id, int regionIndex, double? rateHz, IReadOnlyList<TemplateImage> templates, double threshold)
    : Detector(id, regionIndex, rateHz)
{
    private readonly Dictionary<(string, int), GrayImage> _scaled = new();
    private readonly object _gate = new();

    public IReadOnlyList<TemplateImage> Templates { get; } = templates;
    public double Threshold { get; } = threshold;
    public override DetectorKind Kind => DetectorKind.Template;
    protected override double DefaultRateHz => 5;

    public override ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx)
    {
        var gray = region.ToGray();
        double best = -1, second = -1;
        string? label = null;
        PixelRect box = default;
        foreach (var t in Templates)
        {
            var tpl = Scaled(t, ctx.Unit);
            if (tpl.Width > gray.Width || tpl.Height > gray.Height) continue;
            var (score, x, y) = Match(gray, tpl);
            if (score > best)
            {
                if (label != t.Label) second = best;
                best = score; label = t.Label; box = new PixelRect(x, y, tpl.Width, tpl.Height);
            }
            else if (score > second && label != t.Label) second = score;
        }
        if (label is null) return ValueTask.FromResult(DetectorResult.Absent(0.5, "template larger than region"));
        var present = best >= Threshold;
        // Confidence: distance from the threshold, and (with several templates) the margin over the runner-up.
        var score01 = present
            ? Math.Clamp((best - Threshold) / Math.Max(0.05, 1 - Threshold) * 0.7 + 0.3, 0, 1) * (Templates.Count > 1 ? Math.Clamp((best - Math.Max(0, second)) / 0.15, 0.3, 1) : 1)
            : Math.Clamp((Threshold - best) / Math.Max(0.05, Threshold) * 2, 0, 1);
        return ValueTask.FromResult(new DetectorResult(present, score01, Label: present ? label : null, Number: best, Box: box, Note: $"{label} ncc {best:F3}"));
    }

    private GrayImage Scaled(TemplateImage t, double unit)
    {
        var key = (t.Label, (int)Math.Round(unit * 1000));
        lock (_gate)
        {
            if (_scaled.TryGetValue(key, out var g)) return g;
            var w = Math.Max(3, (int)Math.Round(t.Image.Width * unit));
            var h = Math.Max(3, (int)Math.Round(t.Image.Height * unit));
            g = t.Image.Resize(w, h);
            if (_scaled.Count > 64) _scaled.Clear();
            _scaled[key] = g;
            return g;
        }
    }

    /// <summary>Best NCC position of <paramref name="tpl"/> inside <paramref name="img"/>.</summary>
    public static (double Score, int X, int Y) Match(GrayImage img, GrayImage tpl)
    {
        int rangeX = img.Width - tpl.Width, rangeY = img.Height - tpl.Height;
        if (rangeX < 0 || rangeY < 0) return (-1, 0, 0);
        var positions = (rangeX + 1) * (rangeY + 1);
        // Small searches: exhaustive at full resolution.
        if (positions * tpl.Width * tpl.Height <= 150_000 || tpl.Width < 12 || tpl.Height < 12)
            return Exhaustive(img, tpl, 0, rangeX, 0, rangeY);
        // Pyramid: exhaustive at the coarsest level (template still >= 12 px), then refine +-3 px at each finer level.
        var levels = 0;
        while (levels < 2 && tpl.Width >> (levels + 1) >= 12 && tpl.Height >> (levels + 1) >= 12) levels++;
        var factor = 1 << levels;
        var ci = img.Resize(Math.Max(1, img.Width / factor), Math.Max(1, img.Height / factor));
        var ct = tpl.Resize(Math.Max(1, tpl.Width / factor), Math.Max(1, tpl.Height / factor));
        var (_, x, y) = Exhaustive(ci, ct, 0, Math.Max(0, ci.Width - ct.Width), 0, Math.Max(0, ci.Height - ct.Height));
        for (var level = levels - 1; level >= 0; level--)
        {
            var f = 1 << level;
            var li = level == 0 ? img : img.Resize(Math.Max(1, img.Width / f), Math.Max(1, img.Height / f));
            var lt = level == 0 ? tpl : tpl.Resize(Math.Max(1, tpl.Width / f), Math.Max(1, tpl.Height / f));
            int rx = li.Width - lt.Width, ry = li.Height - lt.Height;
            if (rx < 0 || ry < 0) return (-1, 0, 0);
            var best = Exhaustive(li, lt, Math.Clamp(x * 2 - 3, 0, rx), Math.Clamp(x * 2 + 3, 0, rx), Math.Clamp(y * 2 - 3, 0, ry), Math.Clamp(y * 2 + 3, 0, ry));
            if (level == 0) return best;
            (_, x, y) = best;
        }
        return Exhaustive(img, tpl, 0, rangeX, 0, rangeY);
    }

    private static (double, int, int) Exhaustive(GrayImage img, GrayImage tpl, int x0, int x1, int y0, int y1)
    {
        int tw = tpl.Width, th = tpl.Height, n = tw * th;
        double tm = 0;
        for (var i = 0; i < n; i++) tm += tpl.Data[i];
        tm /= n;
        var tz = new float[n];
        double tv = 0;
        for (var i = 0; i < n; i++) { tz[i] = (float)(tpl.Data[i] - tm); tv += tz[i] * (double)tz[i]; }
        double best = -2;
        int bx = x0, by = y0;
        for (var y = y0; y <= y1; y++)
            for (var x = x0; x <= x1; x++)
            {
                double sum = 0, sumSq = 0, cross = 0;
                for (var ty = 0; ty < th; ty++)
                {
                    var row = (y + ty) * img.Width + x;
                    var trow = ty * tw;
                    for (var tx = 0; tx < tw; tx++)
                    {
                        double v = img.Data[row + tx];
                        sum += v; sumSq += v * v; cross += v * tz[trow + tx];
                    }
                }
                var iv = sumSq - sum * sum / n;
                // A flat patch never matches a textured template (and a flat template matches nothing).
                var s = iv < 1e-6 || tv < 1e-6 ? 0 : cross / Math.Sqrt(iv * tv);
                if (s > best) { best = s; bx = x; by = y; }
            }
        return (best, bx, by);
    }
}

public enum OcrEngineMode { Auto, Windows, Glyphs }

/// <summary>
/// Text and numbers: binarize + glyph boxes (<see cref="TextPreprocessor"/>), then the glyph reader and/or Windows OCR,
/// whitelist mapping and the parse rule (<see cref="TextParser"/>). In auto mode a calibrated glyph set decides alone when
/// it is sure; otherwise both engines run and agreement raises the score, disagreement halves it.
/// </summary>
public sealed class OcrDetector(string id, int regionIndex, double? rateHz, OcrEngineMode engine, TextPolarity polarity, string? whitelist,
    bool stripSuperscript, ParseSpec parse, GlyphSet? glyphs, double minGlyphScore) : Detector(id, regionIndex, rateHz)
{
    public OcrEngineMode Engine { get; } = engine;
    public TextPolarity Polarity { get; } = polarity;
    public string? Whitelist { get; } = whitelist;
    public bool StripSuperscript { get; } = stripSuperscript;
    public ParseSpec Parse { get; } = parse;
    public GlyphSet? Glyphs { get; } = glyphs;
    public override DetectorKind Kind => DetectorKind.Ocr;
    protected override double DefaultRateHz => 3;

    /// <summary>Consecutive reads where the glyph reader and Windows OCR agreed (auto mode, default glyph set).</summary>
    private int _agreements;
    private int _sinceCheck;
    /// <summary>After this many agreements, Windows OCR only spot-checks (every SpotCheck-th read) confident glyph reads.</summary>
    public const int TrustAfter = 8, SpotCheck = 8;

    public override async ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx)
    {
        var prep = TextPreprocessor.Prepare(region, Polarity, StripSuperscript);
        if (prep.IsEmpty) return DetectorResult.Absent(Math.Clamp(prep.Contrast * 2, 0.3, 1), "no text");
        var contrast = Math.Clamp((prep.Contrast - 0.35) / 0.4, 0.2, 1);

        GlyphRead? g = null;
        ParsedText gp = default;
        if (Engine != OcrEngineMode.Windows)
        {
            g = GlyphReader.Read(prep, Glyphs ?? GlyphSet.Default, GlyphWhitelist(), minGlyphScore);
            if (Parse.Unit is not null && Parse.Type is not (ParseType.Text or ParseType.Enum)) g = g.WithoutUnit(Parse.Unit);
            // An unreadable glyph inside the value makes the whole read unusable (never drop it and keep the rest).
            gp = g.Text.Contains('?') ? ParsedText.Fail(g.Text, "an unreadable glyph") : TextParser.Parse(g.Text, Parse, Whitelist, prep.StrippedSuperscript);
        }
        var calibratedSure = Glyphs is { Calibrated: true } && g is { Unknown: 0 } && g.Score >= 0.8 && gp.Ok;
        // Earned trust: once both engines agreed TrustAfter times in a row, a confident glyph read skips Windows OCR
        // except for a spot check every SpotCheck-th read (a disagreement resets the trust).
        // A closed loop (ctx.Strict) never takes the shortcut: it needs this read cross-checked.
        var trusted = !calibratedSure && !ctx.Strict && Engine == OcrEngineMode.Auto && gp.Ok && g is { Unknown: 0 } && g.Score >= 0.75
                      && Volatile.Read(ref _agreements) >= TrustAfter && Interlocked.Increment(ref _sinceCheck) % SpotCheck != 0;
        if (trusted) return Make(gp, Math.Max(0.85, g!.Score * gp.Quality), "glyphs (trusted)", full: false);
        string? w = null;
        ParsedText wp = default;
        if (Engine == OcrEngineMode.Windows || (Engine == OcrEngineMode.Auto && !calibratedSure))
        {
            if (ctx.Ocr is { IsAvailable: true } ocr)
            {
                w = await ocr.RecognizeAsync(prep.ToOcrImage(), ctx.Cancellation).ConfigureAwait(false);
                // The OCR image is the prepared one: a stripped superscript is gone, so a trailing "o" is no ring.
                if (w is not null) wp = TextParser.Parse(w, Parse, Whitelist, prep.StrippedSuperscript);
            }
        }

        DetectorResult Make(ParsedText p, double score, string engineName, bool full) =>
            new(true, Math.Clamp(score * contrast, 0, 1), Label: p.Label, Number: p.Number, Text: p.Text, Note: engineName) { FullConfidence = full };

        if (Engine == OcrEngineMode.Glyphs || calibratedSure)
            return gp.Ok
                ? Make(gp, g!.Score * gp.Quality * (Glyphs?.Calibrated == true ? 1 : 0.85), "glyphs", full: Glyphs?.Calibrated == true && g.Unknown == 0 && g.Score >= 0.8)
                : DetectorResult.Absent(0.6, $"glyphs: '{g?.Text}' {gp.Error}");
        // One uncalibrated engine alone is never full confidence: readable, but a closed loop will not act on it.
        if (Engine == OcrEngineMode.Windows)
            return wp.Ok ? Make(wp, 0.8 * wp.Quality, "windows", full: false) : DetectorResult.Absent(0.6, $"windows: '{w}' {wp.Error}");

        // Auto: cross-check.
        var glyphScore = g is null || !gp.Ok ? 0 : g.Score * gp.Quality * (Glyphs?.Calibrated == true ? 1 : 0.85);
        var winScore = wp.Ok ? 0.75 * wp.Quality : 0;
        if (gp.Ok && wp.Ok)
        {
            var agree = gp.Number is { } a && wp.Number is { } b ? Math.Abs(a - b) < 1e-9 : string.Equals(gp.Label ?? gp.Text, wp.Label ?? wp.Text, StringComparison.OrdinalIgnoreCase);
            if (agree) { Interlocked.Increment(ref _agreements); return Make(gp, Math.Max(0.92, Math.Max(glyphScore, winScore)), "glyphs+windows", full: true); }
            Volatile.Write(ref _agreements, 0);
            return glyphScore >= winScore ? Make(gp, glyphScore * 0.5, "glyphs (windows disagrees)", full: false) : Make(wp, winScore * 0.5, "windows (glyphs disagree)", full: false);
        }
        if (gp.Ok) return Make(gp, glyphScore, "glyphs", full: false);
        if (wp.Ok) return Make(wp, winScore, "windows", full: false);
        return DetectorResult.Absent(0.5, $"unreadable (glyphs '{g?.Text}', windows '{w}')");
    }

    private string? GlyphWhitelist()
    {
        if (Whitelist is null) return null;
        // The unit may be drawn even when it is not part of the value.
        return Parse.Unit is { } u ? Whitelist + u : Whitelist;
    }
}

/// <summary>Change detection: mean absolute luma difference against the previous image of the region (32×16 thumbnail).</summary>
public sealed class ChangeDetector(string id, int regionIndex, double? rateHz, double threshold) : Detector(id, regionIndex, rateHz)
{
    public double Threshold { get; } = threshold;
    public override DetectorKind Kind => DetectorKind.Change;
    protected override double DefaultRateHz => 10;

    public override ValueTask<DetectorResult> RunAsync(SightImage region, DetectContext ctx)
    {
        if (ctx.Previous is null || ctx.Previous.Width != region.Width || ctx.Previous.Height != region.Height)
            return ValueTask.FromResult(new DetectorResult(false, 0.3, Number: 0, Note: "first frame"));
        var d = RegionSignature.Difference(RegionSignature.Of(ctx.Previous), RegionSignature.Of(region));
        var present = d > Threshold;
        var score = Math.Clamp(Math.Abs(d - Threshold) / Math.Max(0.005, Threshold) * 0.5 + 0.5, 0, 1);
        return ValueTask.FromResult(new DetectorResult(present, score, Number: d, Note: $"Δ {d:F4}"));
    }
}

/// <summary>A cheap region fingerprint: a 32×16 luma thumbnail. Used to skip detectors on regions that did not change.</summary>
public static class RegionSignature
{
    public const int W = 32, H = 16;

    public static float[] Of(SightImage img)
    {
        // 32x16 cells, 3x3 samples each (a changed digit always moves at least one cell): ~4.6k reads per region.
        var t = new float[W * H];
        var p = img.Pixels;
        int iw = img.Width, ih = img.Height;
        for (var ty = 0; ty < H; ty++)
        {
            int y0 = ty * ih / H, y1 = Math.Max(y0 + 1, (ty + 1) * ih / H);
            for (var tx = 0; tx < W; tx++)
            {
                int x0 = tx * iw / W, x1 = Math.Max(x0 + 1, (tx + 1) * iw / W);
                var sum = 0;
                for (var sy = 0; sy < 3; sy++)
                {
                    var y = Math.Min(ih - 1, y0 + (y1 - y0) * (2 * sy + 1) / 6);
                    for (var sx = 0; sx < 3; sx++)
                    {
                        var x = Math.Min(iw - 1, x0 + (x1 - x0) * (2 * sx + 1) / 6);
                        var i = (y * iw + x) * 4;
                        sum += 18 * p[i] + 183 * p[i + 1] + 54 * p[i + 2];   // luma x 255, fixed point
                    }
                }
                t[ty * W + tx] = sum / (9f * 255f * 255f);
            }
        }
        return t;
    }

    /// <summary>Mean absolute difference, 0..1.</summary>
    public static double Difference(float[] a, float[] b)
    {
        double s = 0;
        for (var i = 0; i < a.Length; i++) s += Math.Abs(a[i] - b[i]);
        return s / a.Length;
    }

    /// <summary>The largest single-cell difference, 0..1 (a changed digit moves one cell a lot, the mean only a little).</summary>
    public static double MaxDifference(float[] a, float[] b)
    {
        double m = 0;
        for (var i = 0; i < a.Length; i++) m = Math.Max(m, Math.Abs(a[i] - b[i]));
        return m;
    }
}
