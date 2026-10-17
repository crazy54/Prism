using System.Globalization;
using System.Text.Json;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Tests;

/// <summary>
/// The calibration CLI (modes of the test host). Everything works on PNG files the user or the recorder provided;
/// nothing is captured here.
/// </summary>
public static class Tools
{
    private static string? Opt(string[] a, string name) { var i = Array.IndexOf(a, name); return i >= 0 && i + 1 < a.Length ? a[i + 1] : null; }
    private static double? HudScale(string[] a) => Opt(a, "--hud-scale") is { } s ? double.Parse(s, CultureInfo.InvariantCulture) : null;

    private static CompiledRecipe LoadRecipe(string path)
    {
        if (path == "synthetic") return SyntheticHud.Recipe().Recipe;
        if (path.StartsWith("builtin:", StringComparison.Ordinal))
        {
            var (_, json) = RecipeLoader.BuiltinJson().First(b => b.Name == path["builtin:".Length..]);
            return RecipeLoader.FromJson(json, new EmbeddedAssets(), path);
        }
        return RecipeLoader.Load(path);
    }

    /// <summary>run-recipe &lt;recipe.json|synthetic|builtin:name&gt; &lt;framesDir|frame.png&gt; [--hud-scale x] [--json] [--ocr]</summary>
    public static async Task<int> RunRecipeAsync(string[] a)
    {
        if (a.Length < 2) { Console.Error.WriteLine("run-recipe <recipe.json> <framesDir|frame.png> [--hud-scale x] [--json] [--ocr]"); return 2; }
        var recipe = LoadRecipe(a[0]);
        var files = File.Exists(a[1]) ? [a[1]] : Directory.EnumerateFiles(a[1], "*.png", SearchOption.AllDirectories).Order(StringComparer.Ordinal).ToArray();
        using var ocr = a.Contains("--no-ocr") ? null : new WindowsOcrRecognizer();
        var json = a.Contains("--json");
        var all = new List<object>();
        foreach (var f in files)
        {
            var frame = PngCodec.Load(f);
            var r = await RecipeRunner.RunAsync(recipe, frame, ocr, HudScale(a), Path.GetFileName(f));
            if (json) all.Add(new { file = f, context = r.Context.Id, readouts = r.Readouts.ToDictionary(k => k.Key, k => new { k.Value.Number, k.Value.Text, k.Value.Flag, confidence = k.Value.Confidence.ToString(), k.Value.Score }), controls = r.Controls });
            else Console.Write(RecipeRunner.Format(r));
        }
        if (json) Console.WriteLine(JsonSerializer.Serialize(all, new JsonSerializerOptions { WriteIndented = true }));
        return 0;
    }

    /// <summary>inspect &lt;recipe.json&gt; &lt;frame.png&gt; &lt;out.png&gt; [--hud-scale x]: regions, anchors and readouts drawn over the frame.</summary>
    public static int Inspect(string[] a)
    {
        if (a.Length < 3) { Console.Error.WriteLine("inspect <recipe.json> <frame.png> <out.png> [--hud-scale x]"); return 2; }
        var recipe = LoadRecipe(a[0]);
        var frame = PngCodec.Load(a[1]);
        var report = RecipeRunner.RunAsync(recipe, frame, null, HudScale(a)).GetAwaiter().GetResult();
        var img = RegionInspector.Render(recipe, frame, HudScale(a), report);
        File.WriteAllBytes(a[2], PngCodec.Encode(img));
        Console.WriteLine($"wrote {a[2]} ({img.Width}x{img.Height})");
        return 0;
    }

    /// <summary>check-labeled &lt;recipe.json&gt; &lt;dir&gt; [--all]: every verified labeled frame must match (exit 1 otherwise).</summary>
    public static async Task<int> CheckLabeledAsync(string[] a)
    {
        if (a.Length < 2) { Console.Error.WriteLine("check-labeled <recipe.json> <dir> [--all] [--no-ocr]"); return 2; }
        var recipe = LoadRecipe(a[0]);
        using var ocr = a.Contains("--no-ocr") ? null : new WindowsOcrRecognizer();
        var (passed, failed, skipped) = (0, 0, 0);
        foreach (var lf in LabeledFrames.Discover(a[1]))
        {
            if (!lf.Expected.Verified && !a.Contains("--all")) { skipped++; continue; }
            var r = await RecipeRunner.RunAsync(recipe, PngCodec.Load(lf.FramePath), ocr, lf.Expected.HudScale, lf.Name);
            var errors = RecipeRunner.Compare(r, lf.Expected);
            if (errors.Count == 0) { passed++; Console.WriteLine($"PASS {lf.Name}"); }
            else { failed++; Console.WriteLine($"FAIL {lf.Name}\n     " + string.Join("\n     ", errors)); }
        }
        Console.WriteLine($"{passed} passed, {failed} failed, {skipped} unverified (skipped)");
        return failed == 0 ? 0 : 1;
    }

    /// <summary>harvest-glyphs &lt;recipe.json&gt; &lt;dir&gt; &lt;detectorId&gt; &lt;out.json&gt;: glyph templates from labeled frames' texts.</summary>
    public static int HarvestGlyphs(string[] a)
    {
        if (a.Length < 4) { Console.Error.WriteLine("harvest-glyphs <recipe.json> <dir> <detectorId> <out.json>"); return 2; }
        var recipe = LoadRecipe(a[0]);
        var samples = new List<(PreparedText, string)>();
        foreach (var lf in LabeledFrames.Discover(a[1]))
        {
            var truth = lf.Expected.Texts?.GetValueOrDefault(a[2]);
            if (truth is null) continue;
            if (RecipeRunner.PrepareText(recipe, PngCodec.Load(lf.FramePath), a[2], lf.Expected.HudScale) is { } p) samples.Add((p, truth));
        }
        var set = GlyphSet.Harvest(Path.GetFileNameWithoutExtension(a[3]), samples);
        File.WriteAllText(a[3], set.ToJson());
        Console.WriteLine($"{samples.Count} samples → {set.Templates.Count} templates for [{string.Concat(set.Templates.Select(t => t.Char).Distinct().Order())}] → {a[3]}");
        return set.Templates.Count > 0 ? 0 : 1;
    }

    /// <summary>synth &lt;outDir&gt;: synthetic labeled frames (format examples and a regression set for the synthetic recipe).</summary>
    public static int Synth(string[] a)
    {
        var dir = a.Length > 0 ? a[0] : Path.Combine(Fx.ScratchDir, "synthetic-frames");
        var n = WriteSynthetic(dir);
        Console.WriteLine($"wrote {n} labeled frames to {dir}");
        return 0;
    }

    public static int WriteSynthetic(string dir, int max = int.MaxValue)
    {
        Directory.CreateDirectory(dir);
        var cases = new List<(string Name, int W, int H, double Scale, HudState S, string Ctx)>
        {
            ("bank-minus45_3440x1440", 3440, 1440, 1.0, new HudState { Bank = -45, Pitch = 10, Length = 12.5 }, "coasterBuilder"),
            ("bank-0_3440x1440", 3440, 1440, 1.0, new HudState { Bank = 0, Pitch = 0, Length = 7.5 }, "coasterBuilder"),
            ("bank-plus45_3440x1440_hud1.25", 3440, 1440, 1.25, new HudState { Bank = 45, Pitch = -20, Length = 31 }, "coasterBuilder"),
            ("bank-30_1920x1080_hud0.8", 1920, 1080, 0.8, new HudState { Bank = 30, Pitch = 5, Length = 3 }, "coasterBuilder"),
            ("test-results_2560x1440", 2560, 1440, 1.0, new HudState { Results = true, Excitement = 6.4, Fear = 3.1, Nausea = 1.9 }, "testResults"),
            ("terrain_3440x1440", 3440, 1440, 1.0, new HudState { Tool = "terrain", BuilderOpen = false }, "terrain"),
            ("paused_2560x1080", 2560, 1080, 1.0, new HudState { Paused = true }, "paused"),
        };
        var written = 0;
        foreach (var c in cases.Take(max))
        {
            var d = Path.Combine(dir, c.Name);
            Directory.CreateDirectory(d);
            File.WriteAllBytes(Path.Combine(d, "frame.png"), PngCodec.Encode(SyntheticHud.Render(c.W, c.H, c.Scale, c.S)));
            var e = new ExpectedFrame { Recipe = "synthetic-coaster", Game = "syncoaster", HudScale = c.Scale, Context = c.Ctx, Verified = true, Notes = "synthetic (tests)" };
            if (c.Ctx == "coasterBuilder")
            {
                e.Readouts["bankAngle"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Bank) };
                e.Readouts["pitchAngle"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Pitch) };
                e.Readouts["pieceLength"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Length), Tolerance = 0.01 };
                e.Texts = new() { ["bankText"] = $"{c.S.Bank:0}°", ["pitchText"] = $"{c.S.Pitch:0}°", ["lengthText"] = $"{c.S.Length:0.0}" };
                e.Controls = new() { ["syn.builder.bankControl"] = true, ["syn.builder.btn.test"] = true };
            }
            if (c.Ctx == "testResults")
            {
                e.Readouts["excitement"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Excitement), Tolerance = 0.1 };
                e.Readouts["fear"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Fear), Tolerance = 0.1 };
                e.Readouts["nausea"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Nausea), Tolerance = 0.1 };
            }
            e.Readouts["tool"] = new ExpectedReadout { Value = LabeledFrames.Value(c.S.Tool) };
            File.WriteAllText(Path.Combine(d, "expected.json"), LabeledFrames.Serialize(e));
            written++;
        }
        return written;
    }
}
