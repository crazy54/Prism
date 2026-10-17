using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Text;

public enum TextPolarity { Auto, Light, Dark }

/// <summary>One connected blob of ink (8-connected), in the coordinates of <see cref="PreparedText"/>.</summary>
public sealed record InkBlob(int X0, int Y0, int X1, int Y1, int Pixels, int Parts = 1)
{
    public int W => X1 - X0 + 1;
    public int H => Y1 - Y0 + 1;
    /// <summary>Stacked parts of one glyph (%, :, i): never split again later.</summary>
    public InkBlob Merge(InkBlob o) => new(Math.Min(X0, o.X0), Math.Min(Y0, o.Y0), Math.Max(X1, o.X1), Math.Max(Y1, o.Y1), Pixels + o.Pixels, Parts + o.Parts);
}

/// <summary>A text region after binarization: the ink mask, its glyph boxes and line metrics.</summary>
public sealed class PreparedText
{
    public required int Width { get; init; }
    public required int Height { get; init; }
    /// <summary>Soft ink coverage 0..1 (anti-aliased edges kept), row-major.</summary>
    public required float[] Ink { get; init; }
    /// <summary>Glyph boxes left to right (vertically stacked parts merged).</summary>
    public required IReadOnlyList<InkBlob> Glyphs { get; init; }
    public required int LineTop { get; init; }
    public required int LineBottom { get; init; }
    public int LineHeight => LineBottom - LineTop + 1;
    /// <summary>True when a trailing superscript (°, ²) was removed.</summary>
    public bool StrippedSuperscript { get; init; }
    /// <summary>Otsu separation 0..1: how cleanly ink and background split (low = noisy, unreliable).</summary>
    public double Contrast { get; init; }
    public bool IsEmpty => Glyphs.Count == 0;

    public float InkAt(double x, double y)
    {
        // Bilinear sample of the coverage, 0 outside.
        var x0 = (int)Math.Floor(x);
        var y0 = (int)Math.Floor(y);
        float fx = (float)(x - x0), fy = (float)(y - y0);
        float S(int xx, int yy) => xx < 0 || yy < 0 || xx >= Width || yy >= Height ? 0f : Ink[yy * Width + xx];
        return S(x0, y0) * (1 - fx) * (1 - fy) + S(x0 + 1, y0) * fx * (1 - fy) + S(x0, y0 + 1) * (1 - fx) * fy + S(x0 + 1, y0 + 1) * fx * fy;
    }

    /// <summary>
    /// The text as Windows OCR likes it: dark ink on white, the line scaled to <paramref name="lineHeight"/> px, padded.
    /// </summary>
    public GrayImage ToOcrImage(int lineHeight = 40, int pad = 24)
    {
        if (IsEmpty) return new GrayImage(8, 8, Enumerable.Repeat(1f, 64).ToArray());
        int x0 = Glyphs.Min(g => g.X0), x1 = Glyphs.Max(g => g.X1);
        int y0 = Math.Min(LineTop, Glyphs.Min(g => g.Y0)), y1 = Math.Max(LineBottom, Glyphs.Max(g => g.Y1));
        var s = (double)lineHeight / Math.Max(1, LineHeight);
        var w = (int)Math.Round((x1 - x0 + 1) * s) + 2 * pad;
        var h = (int)Math.Round((y1 - y0 + 1) * s) + 2 * pad;
        var img = new GrayImage(w, h);
        Array.Fill(img.Data, 1f);
        for (var y = 0; y < h - 2 * pad; y++)
            for (var x = 0; x < w - 2 * pad; x++)
                img.Data[(y + pad) * w + x + pad] = 1f - InkAt(x0 + (x + 0.5) / s - 0.5, y0 + (y + 0.5) / s - 0.5);
        return img;
    }
}

/// <summary>
/// Binarizes a HUD text region (Otsu on luma; text = the minority class unless the polarity is given), finds glyph
/// boxes by connected components, measures the text line, and optionally removes a trailing superscript (the "°" of
/// "-30°" reads as "0" in Windows OCR otherwise). Small regions are upscaled first so thin strokes survive.
/// </summary>
public static class TextPreprocessor
{
    public static PreparedText Prepare(SightImage region, TextPolarity polarity = TextPolarity.Auto, bool stripSuperscript = false)
    {
        var gray = region.ToGray();
        // Upscale so small text has room (48+ px of region height): dots and thin strokes survive binarization.
        var k = gray.Height >= 48 ? 1 : (int)Math.Ceiling(48.0 / gray.Height);
        if (k > 1) gray = gray.Resize(gray.Width * k, gray.Height * k);
        int w = gray.Width, h = gray.Height, n = w * h;
        var (thr, separation) = Otsu(gray.Data, n);
        bool textBright;
        if (polarity == TextPolarity.Auto)
        {
            var above = 0;
            for (var i = 0; i < n; i++) if (gray.Data[i] > thr) above++;
            textBright = above < n / 2;
        }
        else textBright = polarity == TextPolarity.Light;

        // Soft coverage around the threshold keeps anti-aliasing (±0.12 luma ramp), hard mask for components.
        var ink = new float[n];
        var hard = new bool[n];
        const float ramp = 0.12f;
        for (var i = 0; i < n; i++)
        {
            var d = textBright ? gray.Data[i] - thr : thr - gray.Data[i];
            ink[i] = Math.Clamp(0.5f + d / (2 * ramp), 0f, 1f);
            hard[i] = d > 0;
        }

        var blobs = Components(hard, w, h, out var labels);
        // Drop noise and frame-like blobs (panel borders that span the region).
        var maxH = blobs.Count == 0 ? 0 : blobs.Max(b => b.H);
        var kept = new List<(InkBlob Blob, int Label)>();
        for (var i = 0; i < blobs.Count; i++)
        {
            var b = blobs[i];
            // A blob spanning the width that is a thin line or a sparse outline is a panel edge, never a glyph.
            var border = b.W >= w * 0.95 && (b.H <= h * 0.25 || b.Pixels < b.W * b.H * 0.3);
            var noise = b.Pixels < Math.Max(3, maxH * maxH * 0.0025);
            if (border || noise) Erase(ink, labels, i + 1, b, w);
            else kept.Add((b, i + 1));
        }
        if (kept.Count == 0)
            return new PreparedText { Width = w, Height = h, Ink = ink, Glyphs = [], LineTop = 0, LineBottom = 0, Contrast = separation };

        var tallest = kept.Max(b => b.Blob.H);
        var tall = kept.Where(b => b.Blob.H >= tallest * 0.6).ToList();
        int top = tall.Min(b => b.Blob.Y0), bottom = tall.Max(b => b.Blob.Y1);
        var stripped = false;
        if (stripSuperscript && kept.Count >= 2)
        {
            var right = kept.OrderByDescending(b => b.Blob.X1).First();
            var lh = bottom - top + 1.0;
            if (right.Blob.Y1 < top + lh * 0.6 && right.Blob.H < lh * 0.65 && right.Blob.X0 > kept.Where(b => b != right).Max(b => b.Blob.X1) - 1)
            {
                Erase(ink, labels, right.Label, right.Blob, w);
                kept.Remove(right);
                stripped = true;
                tall = kept.Where(b => b.Blob.H >= tallest * 0.6).ToList();
                if (tall.Count > 0) { top = tall.Min(b => b.Blob.Y0); bottom = tall.Max(b => b.Blob.Y1); }
            }
        }

        // Merge vertically stacked parts (i, :, %, ÷) into glyphs.
        var sorted = kept.Select(b => b.Blob).OrderBy(b => b.X0).ToList();
        var glyphs = new List<InkBlob>();
        foreach (var b in sorted)
        {
            if (glyphs.Count > 0)
            {
                var last = glyphs[^1];
                var overlap = Math.Min(last.X1, b.X1) - Math.Max(last.X0, b.X0) + 1;
                var lineH = bottom - top + 1;
                var smallMark = b.W < lineH * 0.45 && b.H < lineH * 0.45;   // a dot or ring that belongs to the glyph it overlaps (%, ÷)
                if (overlap >= Math.Min(last.W, b.W) * 0.3 || (smallMark && overlap > 0)) { glyphs[^1] = last.Merge(b); continue; }
            }
            glyphs.Add(b);
        }
        return new PreparedText { Width = w, Height = h, Ink = ink, Glyphs = glyphs, LineTop = top, LineBottom = bottom, StrippedSuperscript = stripped, Contrast = separation };
    }

    private static void Erase(float[] ink, int[] labels, int label, InkBlob b, int w)
    {
        // Clear the blob and its soft fringe (1 px around it) so OCR does not see a ghost.
        for (var y = b.Y0; y <= b.Y1; y++)
            for (var x = b.X0; x <= b.X1; x++)
                if (labels[y * w + x] == label) ink[y * w + x] = 0;
        var hgt = ink.Length / w;
        for (var y = Math.Max(0, b.Y0 - 1); y <= Math.Min(hgt - 1, b.Y1 + 1); y++)
            for (var x = Math.Max(0, b.X0 - 1); x <= Math.Min(w - 1, b.X1 + 1); x++)
                if (labels[y * w + x] == 0 && ink[y * w + x] < 0.5f) ink[y * w + x] = 0;
    }

    /// <summary>Otsu's threshold on 0..1 data (256 bins) and the normalized between-class separation (0..1).</summary>
    public static (float Threshold, double Separation) Otsu(float[] data, int n)
    {
        var hist = new int[256];
        for (var i = 0; i < n; i++) hist[Math.Clamp((int)(data[i] * 255), 0, 255)]++;
        double sum = 0, sumSq = 0;
        for (var i = 0; i < 256; i++) { sum += i * (double)hist[i]; sumSq += i * (double)i * hist[i]; }
        double sumB = 0, best = -1;
        int wB = 0, thr = 127;
        for (var i = 0; i < 256; i++)
        {
            wB += hist[i];
            if (wB == 0) continue;
            var wF = n - wB;
            if (wF == 0) break;
            sumB += i * (double)hist[i];
            double mB = sumB / wB, mF = (sum - sumB) / wF;
            var between = (double)wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; thr = i; }
        }
        var mean = sum / n;
        var total = sumSq / n - mean * mean;   // total variance × n² normalization below
        var separation = total <= 1e-9 ? 0 : Math.Clamp(best / ((double)n * n) / total, 0, 1);
        return ((thr + 0.5f) / 255f, separation);
    }

    /// <summary>8-connected components of a mask; labels are 1-based indexes into the returned list.</summary>
    public static List<InkBlob> Components(bool[] mask, int w, int h, out int[] labels)
    {
        labels = new int[w * h];
        var blobs = new List<InkBlob>();
        var stack = new Stack<int>();
        for (var i = 0; i < w * h; i++)
        {
            if (!mask[i] || labels[i] != 0) continue;
            var id = blobs.Count + 1;
            int x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
            labels[i] = id;
            stack.Push(i);
            while (stack.Count > 0)
            {
                var p = stack.Pop();
                count++;
                int x = p % w, y = p / w;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                for (var dy = -1; dy <= 1; dy++)
                {
                    var ny = y + dy;
                    if (ny < 0 || ny >= h) continue;
                    for (var dx = -1; dx <= 1; dx++)
                    {
                        var nx = x + dx;
                        if (nx < 0 || nx >= w) continue;
                        var q = ny * w + nx;
                        if (mask[q] && labels[q] == 0) { labels[q] = id; stack.Push(q); }
                    }
                }
            }
            blobs.Add(new InkBlob(x0, y0, x1, y1, count));
        }
        return blobs;
    }
}
