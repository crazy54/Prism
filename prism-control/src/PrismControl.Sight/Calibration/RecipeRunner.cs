using System.Globalization;
using System.Text.Json;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Calibration;

/// <summary>What a recipe reads on one frame.</summary>
public sealed record FrameReport(string Name, int Width, int Height, double Unit, SightContext Context, IReadOnlyDictionary<string, SightReadout> Readouts,
    IReadOnlyDictionary<string, SightControlState> Controls, IReadOnlyDictionary<string, DetectorSample?> Detectors);

/// <summary>
/// Runs a recipe on still frames, with the same engine the live capture uses: every region is cropped from the frame,
/// processed in a few passes (so confirmation and context hysteresis settle) and reported. Used by the CLI
/// (run-recipe, check-labeled), the synthetic test suite and the labeled-frame regression.
/// </summary>
public static class RecipeRunner
{
    public static async Task<FrameReport> RunAsync(CompiledRecipe recipe, SightImage frame, ITextRecognizer? ocr, double? hudScale = null, string name = "", CancellationToken ct = default)
    {
        var engine = new SightEngine(recipe, new SightEngineOptions { Ocr = ocr, HudScale = hudScale });
        var t = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var maxHold = recipe.Contexts.Count == 0 ? 0 : recipe.Contexts.Max(c => Math.Max(c.EnterMs, c.ExitMs));
        var minRate = recipe.Regions.Where(r => r.Detectors.Count > 0).Select(r => r.RateHz).DefaultIfEmpty(10).Min();
        var step = TimeSpan.FromMilliseconds(Math.Max(maxHold, 1000 / minRate) + 10);
        var passes = Math.Max(3, recipe.Readouts.Count == 0 ? 1 : recipe.Readouts.Max(r => r.ConfirmReads) + 1);
        for (var pass = 0; pass < passes; pass++, t += step)
        {
            var crops = engine.Plan(frame.Width, frame.Height, t);
            var images = crops.ToDictionary(c => c.Region, c => frame.Crop(c.Rect));
            await engine.ProcessAsync(new RegionFrame { At = t, ContentWidth = frame.Width, ContentHeight = frame.Height, Regions = images }, ct);
        }
        var (ctx, readouts, controls, _) = engine.State();
        var samples = recipe.Detectors.ToDictionary(d => d.Id, d => engine.Latest(d.Index), StringComparer.Ordinal);
        return new FrameReport(name, frame.Width, frame.Height, engine.Geometry(frame.Width, frame.Height).Unit, ctx, readouts, controls, samples);
    }

    /// <summary>Differences between a report and the expected labels (empty = pass).</summary>
    public static IReadOnlyList<string> Compare(FrameReport r, ExpectedFrame e)
    {
        var errors = new List<string>();
        if (e.Context is not null)
        {
            var want = e.Context.Length == 0 ? null : e.Context;
            if (r.Context.Id != want) errors.Add($"context: expected {want ?? "(none)"} but got {r.Context.Id ?? "(none)"}");
        }
        foreach (var (id, exp) in e.Readouts)
        {
            if (!r.Readouts.TryGetValue(id, out var got)) { errors.Add($"{id}: no such readout"); continue; }
            var v = exp.Value;
            if (v is null || v.Value.ValueKind == JsonValueKind.Null)
            {
                if (got.Confidence is SightConfidence.Observed && got.HasValue) errors.Add($"{id}: expected no value but read {Show(got)}");
                continue;
            }
            if (got.Confidence != SightConfidence.Observed) { errors.Add($"{id}: expected {v.Value} but it is {got.Confidence} ({Show(got)})"); continue; }
            switch (v.Value.ValueKind)
            {
                case JsonValueKind.Number:
                    var want = v.Value.GetDouble();
                    var tol = exp.Tolerance ?? 0;
                    if (got.Number is not { } n || Math.Abs(n - want) > tol + 1e-9) errors.Add($"{id}: expected {want.ToString(CultureInfo.InvariantCulture)} ± {tol} but read {Show(got)}");
                    break;
                case JsonValueKind.True or JsonValueKind.False:
                    if (got.Flag != v.Value.GetBoolean()) errors.Add($"{id}: expected {v.Value.GetBoolean()} but read {Show(got)}");
                    break;
                case JsonValueKind.String:
                    if (!string.Equals(got.Text, v.Value.GetString(), StringComparison.OrdinalIgnoreCase)) errors.Add($"{id}: expected \"{v.Value.GetString()}\" but read {Show(got)}");
                    break;
            }
        }
        foreach (var (id, want) in e.Controls ?? new())
        {
            if (!r.Controls.TryGetValue(id, out var c)) { errors.Add($"control {id}: no such control"); continue; }
            if (c.Located != want) errors.Add($"control {id}: expected {(want ? "located" : "not located")} (score {c.Score:F3})");
        }
        return errors;
    }

    public static string Show(SightReadout r) =>
        (r.Number?.ToString("0.####", CultureInfo.InvariantCulture) ?? r.Text ?? r.Flag?.ToString() ?? "—") + (r.Unit is { } u && r.Number is not null ? " " + u : "") + $" [{r.Confidence.ToString().ToLowerInvariant()} {r.Score:F2}]";

    /// <summary>One line per readout for the CLI.</summary>
    public static string Format(FrameReport r)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"{r.Name}  {r.Width}x{r.Height}  unit {r.Unit:F3}px  context {r.Context.Id ?? "(none)"} [{r.Context.Confidence.ToString().ToLowerInvariant()}] active [{string.Join(", ", r.Context.Active)}]");
        foreach (var (id, ro) in r.Readouts) sb.AppendLine($"  {id,-22} {Show(ro)}");
        foreach (var (id, c) in r.Controls) sb.AppendLine($"  control {id,-30} {(c.Located ? "located" : "not found")} {c.Score:F3}");
        foreach (var (id, s) in r.Detectors)
            sb.AppendLine($"    det {id,-24} {(s is null ? "(not run)" : $"{(s.Result.Present ? "present" : "absent ")} {s.Result.Score:F2} {s.Result.Note}")}");
        return sb.ToString();
    }

    /// <summary>The prepared text line of an OCR detector on a frame (glyph harvesting).</summary>
    public static PreparedText? PrepareText(CompiledRecipe recipe, SightImage frame, string detectorId, double? hudScale = null)
    {
        if (recipe.Detector(detectorId) is not OcrDetector det) return null;
        var g = HudGeometry.For(frame.Width, frame.Height, recipe.Hud, hudScale);
        var rect = recipe.Regions[det.RegionIndex].Resolve(g).ClampTo(frame.Width, frame.Height);
        return rect.IsEmpty ? null : TextPreprocessor.Prepare(frame.Crop(rect), det.Polarity, det.StripSuperscript);
    }
}

/// <summary>
/// Draws a recipe's regions over a frame (overlay-free: nothing is shown on screen; the result is an image for review):
/// the HUD box, every region outlined in its detector kind's color with its id, located control boxes, and readouts.
/// </summary>
public static class RegionInspector
{
    private static readonly Dictionary<DetectorKind, Bgra> KindColors = new()
    {
        [DetectorKind.Color] = Bgra.FromRgb(0xff, 0xc4, 0x3d), [DetectorKind.Bar] = Bgra.FromRgb(0x3d, 0xd6, 0x8c), [DetectorKind.Template] = Bgra.FromRgb(0x4d, 0xa3, 0xff),
        [DetectorKind.Ocr] = Bgra.FromRgb(0xff, 0x5c, 0xc8), [DetectorKind.Change] = Bgra.FromRgb(0xb0, 0xb0, 0xb0),
    };

    public static SightImage Render(CompiledRecipe recipe, SightImage frame, double? hudScale = null, FrameReport? report = null)
    {
        var img = frame.Clone();
        var g = HudGeometry.For(frame.Width, frame.Height, recipe.Hud, hudScale);
        var thick = Math.Max(2, (int)Math.Round(g.Unit * 1.5));
        Outline(img, new PixelRect((int)g.BoxX, (int)g.BoxY, (int)g.BoxW, (int)g.BoxH), Bgra.FromRgb(255, 255, 255), 1);
        var labelPx = Math.Clamp((int)Math.Round(13 * g.Unit), 11, 28);
        foreach (var r in recipe.Regions)
        {
            var rect = r.Resolve(g);
            var kind = r.Detectors.Count == 0 ? DetectorKind.Change : recipe.Detectors[r.Detectors[0]].Kind;
            var color = KindColors[kind];
            Outline(img, rect, color, thick);
            var (ax, ay) = g.AnchorPoint(r.Anchor);
            img.FillRect(new PixelRect((int)ax - thick, (int)ay - thick, thick * 2, thick * 2), color);
            var label = r.Id;
            if (report is not null)
            {
                var ro = report.Readouts.Values.FirstOrDefault(x => x.Region == r.Id);
                if (ro is not null) label += "  " + RecipeRunner.Show(ro);
            }
            Label(img, label, rect.X, Math.Max(0, rect.Y - labelPx - 4), labelPx, color);
        }
        if (report is not null)
            foreach (var (id, s) in report.Detectors)
                if (s?.ContentBox is { } box && s.Result.Present) Outline(img, box, Bgra.FromRgb(255, 255, 255), 1);
        return img;
    }

    private static void Outline(SightImage img, PixelRect r, Bgra c, int t)
    {
        img.FillRect(new PixelRect(r.X - t, r.Y - t, r.W + 2 * t, t), c);
        img.FillRect(new PixelRect(r.X - t, r.Bottom, r.W + 2 * t, t), c);
        img.FillRect(new PixelRect(r.X - t, r.Y, t, r.H), c);
        img.FillRect(new PixelRect(r.Right, r.Y, t, r.H), c);
    }

    /// <summary>Text on a dark plate (GDI-rendered coverage blended in memory).</summary>
    public static void Label(SightImage img, string text, int x, int y, int px, Bgra color)
    {
        var m = GdiText.Render(text, "Segoe UI", px, 600);
        img.BlendRect(new PixelRect(x, y, m.Width, m.Height), Bgra.FromRgb(0, 0, 0), 0.6);
        for (var yy = 0; yy < m.Height; yy++)
        {
            var dy = y + yy;
            if (dy < 0 || dy >= img.Height) continue;
            for (var xx = 0; xx < m.Width; xx++)
            {
                var dx = x + xx;
                if (dx < 0 || dx >= img.Width) continue;
                var a = m.Coverage[yy * m.Width + xx];
                if (a <= 0) continue;
                var o = img.Get(dx, dy);
                img.Set(dx, dy, new Bgra((byte)(o.B + (color.B - o.B) * a), (byte)(o.G + (color.G - o.G) * a), (byte)(o.R + (color.R - o.R) * a)));
            }
        }
    }
}
