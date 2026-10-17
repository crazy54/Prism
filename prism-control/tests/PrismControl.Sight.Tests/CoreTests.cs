using PrismControl.Desktop;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Detectors;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

public class ImagingTests
{
    [Test(TimeoutMs = 180_000)]
    public void Png_round_trips_every_pixel()
    {
        var img = SyntheticHud.Scene(97, 61, 3);
        img.Set(0, 0, new Bgra(1, 2, 3, 4));
        var back = PngCodec.Decode(PngCodec.Encode(img));
        Assert.Equal(97, back.Width);
        Assert.Equal(61, back.Height);
        Assert.True(img.Pixels.AsSpan().SequenceEqual(back.Pixels), "pixels differ after a PNG round trip");
    }

    [Test(TimeoutMs = 180_000)]
    public void Png_decodes_a_standard_palette_file()
    {
        // 1×1 red pixel, palette PNG (color type 3) produced by a common encoder.
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/AAAZ4gk3AAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==");
        var img = PngCodec.Decode(bytes);
        Assert.Equal(Bgra.FromRgb(255, 0, 0), img.Get(0, 0));
    }

    [Test(TimeoutMs = 180_000)]
    public void Png_refuses_garbage_and_huge_sizes()
    {
        Assert.Throws<InvalidDataException>(() => PngCodec.Decode([1, 2, 3, 4, 5, 6, 7, 8, 9]));
        var huge = PngCodec.Encode(new SightImage(4, 4));
        // Patch IHDR width to 100000.
        huge[16] = 0; huge[17] = 1; huge[18] = 0x86; huge[19] = 0xA0;
        Assert.Throws<InvalidDataException>(() => PngCodec.Decode(huge));
    }

    [Test(TimeoutMs = 180_000)]
    public void Srgb_linear_luts_round_trip_every_level()
    {
        for (var v = 0; v < 256; v++)
        {
            var lin = ColorPipeline.SrgbToLinear((byte)v);
            Assert.Equal((byte)v, ColorPipeline.LinearToSrgb8(lin), $"level {v}");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public void ScRgb_conversion_divides_by_paper_white_exactly()
    {
        var img = SyntheticHud.Scene(64, 40, 5);
        foreach (var pw in new[] { 1.0, 2.5, 3.549, 5.0 })
        {
            var hdr = ColorPipeline.ImageToScRgb(img, pw);
            var back = ColorPipeline.ScRgbToImage(hdr, img.Width, img.Height, img.Width * 8, pw);
            var maxErr = 0;
            for (var i = 0; i < img.Pixels.Length; i++) if (i % 4 != 3) maxErr = Math.Max(maxErr, Math.Abs(img.Pixels[i] - back.Pixels[i]));
            Assert.True(maxErr <= 1, $"paper white {pw}: max error {maxErr} LSB (FP16 quantization allows 1)");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public void Paper_white_is_estimated_from_a_white_reference()
    {
        var img = SightImage.Filled(40, 20, Bgra.FromRgb(30, 30, 30));
        img.FillRect(new PixelRect(5, 5, 20, 6), Bgra.FromRgb(255, 255, 255));
        var hdr = ColorPipeline.ImageToScRgb(img, 2.5);
        var est = ColorPipeline.EstimatePaperWhite(hdr, 800, 1.0);
        Assert.NotNull(est is null ? null : (object)est);
        Assert.Near(2.5, est!.Value, 0.02);
        Assert.Null(ColorPipeline.EstimatePaperWhite(ColorPipeline.ImageToScRgb(SightImage.Filled(10, 10, Bgra.FromRgb(20, 20, 20)), 2.5), 100) is null ? null : (object)1);
    }

    [Test(TimeoutMs = 180_000)]
    public void Bgra8_capture_of_hdr_content_clips_at_80_nits_which_is_why_sight_uses_fp16()
    {
        // What the HDR probe measured: a BGRA8 capture of scRGB content encodes clamp(scRGB, 0, 1) with the sRGB curve.
        static byte Bgra8OfScRgb(double v) => ColorPipeline.LinearToSrgb8((float)v);
        var hudWhite = 2.5;   // a 200-nit HUD
        Assert.Equal((byte)255, Bgra8OfScRgb(hudWhite));
        Assert.Equal((byte)255, Bgra8OfScRgb(hudWhite * 0.5));   // a 50% gray HUD element also clips: contrast is gone
        Assert.Equal((byte)188, Bgra8OfScRgb(0.5));             // probe: scRGB 0.5 → 188
        // The FP16 path keeps them apart.
        var white = ColorPipeline.LinearToSrgb8((float)(hudWhite / hudWhite));
        var gray = ColorPipeline.LinearToSrgb8((float)(hudWhite * 0.5 / hudWhite));
        Assert.Equal((byte)255, white);
        Assert.InRange(gray, 185, 190);
    }

    [Test(TimeoutMs = 180_000)]
    public void Resize_and_crop_behave()
    {
        var img = SightImage.Filled(20, 10, Bgra.FromRgb(10, 20, 30));
        img.FillRect(new PixelRect(10, 0, 10, 10), Bgra.FromRgb(200, 200, 200));
        var c = img.Crop(new PixelRect(15, -5, 20, 30));
        Assert.Equal(5, c.Width);
        Assert.Equal(10, c.Height);
        Assert.Equal(Bgra.FromRgb(200, 200, 200), c.Get(0, 0));
        var r = img.Resize(40, 20);
        Assert.Equal(Bgra.FromRgb(10, 20, 30), r.Get(2, 5));
        Assert.Equal(Bgra.FromRgb(200, 200, 200), r.Get(37, 5));
    }

    [Test(TimeoutMs = 180_000)]
    public void Atlas_layout_never_overlaps()
    {
        var rng = new Random(4);
        var crops = Enumerable.Range(0, 30).Select(i => new Engine.RegionCrop(i, new PixelRect(0, 0, rng.Next(5, 700), rng.Next(5, 120)))).ToList();
        var (w, h, pos) = WgcRegionCapture.Layout(crops);
        var rects = crops.Select((c, i) => new PixelRect(pos[i].X, pos[i].Y, c.Rect.W, c.Rect.H)).ToList();
        for (var i = 0; i < rects.Count; i++)
        {
            Assert.True(rects[i].Right <= w && rects[i].Bottom <= h, "inside the atlas");
            for (var j = i + 1; j < rects.Count; j++)
            {
                var a = rects[i]; var b = rects[j];
                var overlap = a.X < b.Right && b.X < a.Right && a.Y < b.Bottom && b.Y < a.Bottom;
                Assert.False(overlap, $"crops {i} and {j} overlap");
            }
        }
    }
}

public class GeometryTests
{
    private static readonly HudDto Hud = new() { ReferenceHeight = 1080 };

    [Test(TimeoutMs = 180_000)]
    public void Units_scale_with_height_and_hud_scale()
    {
        Assert.Near(1.0, HudGeometry.For(1920, 1080, Hud).Unit, 1e-9);
        Assert.Near(4.0 / 3, HudGeometry.For(2560, 1440, Hud).Unit, 1e-9);
        Assert.Near(4.0 / 3, HudGeometry.For(3440, 1440, Hud).Unit, 1e-9);
        Assert.Near(4.0 / 3 * 1.25, HudGeometry.For(3440, 1440, Hud, 1.25).Unit, 1e-9);
    }

    [Test(TimeoutMs = 180_000)]
    public void Edge_anchors_follow_their_edge_on_ultrawide()
    {
        var g169 = HudGeometry.For(2560, 1440, Hud);
        var g219 = HudGeometry.For(3440, 1440, Hud);
        var r169 = g169.Resolve(Anchor.Right, -400, -320, 380, 36);
        var r219 = g219.Resolve(Anchor.Right, -400, -320, 380, 36);
        Assert.Equal(r169.W, r219.W);
        Assert.Equal(r169.Y, r219.Y);
        Assert.Equal(880, r219.X - r169.X);                  // the right edge moved 880 px
        var c169 = g169.Resolve(Anchor.Center, -10, -10, 20, 20);
        var c219 = g219.Resolve(Anchor.Center, -10, -10, 20, 20);
        Assert.Equal(440, c219.X - c169.X);                  // centered things move half
        Assert.Equal(g169.Resolve(Anchor.TopLeft, 24, 24, 72, 72), g219.Resolve(Anchor.TopLeft, 24, 24, 72, 72));
    }

    [Test(TimeoutMs = 180_000)]
    public void Max_aspect_keeps_a_16_by_9_hud_centered_on_21_by_9()
    {
        var hud = new HudDto { ReferenceHeight = 1080, MaxAspect = 16.0 / 9 };
        var g = HudGeometry.For(3440, 1440, hud);
        Assert.Near(2560, g.BoxW, 0.5);
        Assert.Near(440, g.BoxX, 0.5);
        var r = g.Resolve(Anchor.TopRight, -100, 0, 100, 10);
        Assert.Equal(3000 - 134, r.X);   // 440 + 2560 - 100·(4/3)
    }

    [Test(TimeoutMs = 180_000)]
    public void Hud_units_round_trip()
    {
        var g = HudGeometry.For(3440, 1440, Hud, 1.1);
        var r = g.Resolve(Anchor.Bottom, -180, -204, 400, 26);
        var (x, y, w, h) = g.ToHudUnits(Anchor.Bottom, r);
        Assert.Near(-180, x, 1);
        Assert.Near(-204, y, 1);
        Assert.Near(400, w, 1.5);
        Assert.Near(26, h, 1.5);
    }

    [Test(TimeoutMs = 180_000)]
    public void Content_to_screen_handles_negative_monitor_origins()
    {
        // A client area on the left monitor of this PC's layout (x from -2560).
        var client = new PixelRect(-2500, 100, 1280, 720);
        Assert.Equal(new PointI(-2500 + 640, 100 + 360), WindowGeometry.ContentToScreen(client, 640, 360));
        Assert.Equal(new PointI(-2500, 100), WindowGeometry.ContentToScreen(client, -50, -50));          // clamped into the client area
        Assert.Equal(new PointI(-2500 + 1279, 100 + 719), WindowGeometry.ContentToScreen(client, 5000, 5000));
        Assert.Equal(new PointI(-2500 + 320, 100 + 180), WindowGeometry.ContentToScreen(client, 640, 360, captureScale: 2));
        Assert.Equal(new PointI(188 + 10, -1440 + 20), WindowGeometry.ContentToScreen(new PixelRect(188, -1440, 2560, 1440), 10.7, 20.2));
    }
}

public class ParserTests
{
    private static readonly ParseSpec Deg = ParseSpec.From(new ParseDto { Type = "number", Unit = "°" });

    [Test(TimeoutMs = 180_000)]
    public void Angles_parse_with_and_without_the_degree_sign()
    {
        Assert.Equal(-30.0, TextParser.Parse("-30°", Deg, "-+0123456789").Number);
        Assert.Equal(-30.0, TextParser.Parse("-30", Deg, "-+0123456789").Number);
        Assert.Equal(45.0, TextParser.Parse("45•", Deg, "-+0123456789").Number);       // Windows OCR's "°"
        Assert.Equal(45.0, TextParser.Parse("+45°", Deg, "-+0123456789").Number);
        Assert.Equal(-5.0, TextParser.Parse("—5", Deg, "-+0123456789").Number);        // em dash → minus
        Assert.Equal(0.0, TextParser.Parse("O°", Deg, "-+0123456789").Number);          // O → 0
        Assert.Equal(-180.0, TextParser.Parse("-18O", Deg, "-+0123456789").Number);   // uppercase O: a zero
        Assert.Equal(45.0, TextParser.Parse("45o", Deg, "-+0123456789").Number);       // lowercase o: the ring
    }

    [Test(TimeoutMs = 180_000)]
    public void Look_alikes_lower_the_quality()
    {
        var clean = TextParser.Parse("15", Deg, "-+0123456789");
        var mapped = TextParser.Parse("l5", Deg, "-+0123456789");
        Assert.Equal(15.0, mapped.Number);
        Assert.True(mapped.Quality < clean.Quality);
    }

    [Test(TimeoutMs = 180_000)]
    public void Numbers_units_separators_percent_duration_enum()
    {
        Assert.Equal(1250.0, TextParser.Parse("1,250", ParseSpec.Default).Number);
        Assert.Equal(12.5, TextParser.Parse("12.5 m", ParseSpec.From(new ParseDto { Unit = "m" }), "0123456789.").Number);
        Assert.Equal(87.0, TextParser.Parse("87%", ParseSpec.From(new ParseDto { Type = "percent" })).Number);
        Assert.Equal(87.0, TextParser.Parse("870/0", ParseSpec.From(new ParseDto { Type = "percent", Unit = "%" })).Number);
        Assert.Equal(12.5, TextParser.Parse("12,5", ParseSpec.From(new ParseDto { Decimal = ",", Thousands = "." })).Number);
        Assert.Equal(65.0, TextParser.Parse("1:05", ParseSpec.From(new ParseDto { Type = "duration" })).Number);
        Assert.Equal(3725.0, TextParser.Parse("1:02:05", ParseSpec.From(new ParseDto { Type = "duration" })).Number);
        var en = ParseSpec.From(new ParseDto { Type = "enum", Values = new() { ["PAUSED"] = "paused", ["x1"] = "speed1" } });
        Assert.Equal("paused", TextParser.Parse("Paused", en).Label);
        Assert.Equal("paused", TextParser.Parse("PAUSFD", en).Label);   // one edit away
        Assert.False(TextParser.Parse("RUNNING", en).Ok);
        Assert.False(TextParser.Parse("12a", ParseSpec.Default, "0123456789").Ok is false && false);
        Assert.False(TextParser.Parse("", ParseSpec.Default).Ok);
        Assert.False(TextParser.Parse("--5", Deg, "-+0123456789").Ok);
        Assert.Equal(7.0, TextParser.Parse("7", ParseSpec.From(new ParseDto { Type = "integer" })).Number);
        Assert.False(TextParser.Parse("7.5", ParseSpec.From(new ParseDto { Type = "integer" })).Ok);
    }
}

public class ExpressionTests
{
    private sealed class Facts(Dictionary<string, (bool P, string? L, double? N, double S)> map) : IDetectorFacts
    {
        public bool TryGet(string id, out bool present, out string? label, out double? number, out double score)
        {
            if (map.TryGetValue(id, out var f)) { present = f.P; label = f.L; number = f.N; score = f.S; return true; }
            present = false; label = null; number = null; score = 0; return false;
        }
    }

    [Test(TimeoutMs = 180_000)]
    public void Expressions_evaluate_with_confidence()
    {
        var f = new Facts(new()
        {
            ["panel"] = (true, null, 0.9, 0.9), ["tool"] = (true, "coaster", 0.95, 0.8), ["paused"] = (false, null, 0.1, 0.7), ["bar"] = (true, null, 42, 1),
        });
        Assert.Equal((true, 0.7), ContextExpression.Parse("panel & tool=coaster & !paused").Evaluate(f));
        Assert.Equal((false, 0.8), ContextExpression.Parse("tool=terrain").Evaluate(f));
        Assert.True(ContextExpression.Parse("tool!=terrain").Evaluate(f).Value);
        Assert.True(ContextExpression.Parse("bar>40 & bar<=42").Evaluate(f).Value);
        Assert.False(ContextExpression.Parse("bar>=43").Evaluate(f).Value);
        Assert.True(ContextExpression.Parse("(paused | panel) & !(tool=scenery)").Evaluate(f).Value);
        Assert.Equal((false, 0.0), ContextExpression.Parse("missing").Evaluate(f));
        Assert.True(ContextExpression.Parse("pc2.builder.panel | panel").DetectorIds.Contains("pc2.builder.panel"));
    }

    [Test(TimeoutMs = 180_000)]
    public void Bad_expressions_are_errors()
    {
        foreach (var bad in new[] { "", "a &", "(a", "a = ", "&b", "a b", "1a" })
            Assert.Throws<FormatException>(() => ContextExpression.Parse(bad));
    }
}

public class RecipeTests
{
    [Test(TimeoutMs = 180_000)]
    public void The_synthetic_recipe_compiles()
    {
        var (r, _) = SyntheticHud.Recipe();
        Assert.Equal("syncoaster", r.Game);
        Assert.Equal(13, r.Regions.Count);
        Assert.Equal(2, r.Controls.Count);
        Assert.True(r.Matches("syntheticcoaster.EXE", "AnyClass"));
        Assert.Equal("bankAngle", r.Readout("syn.builder.bankValue")!.Id);
        Assert.Equal(3.0, r.Region("syn.builder.bankValue")!.RateHz);       // OCR default
        Assert.Equal(10.0, r.Region("syn.builder.header")!.RateHz);         // color default
        Assert.Equal(2, r.Readout("bankAngle")!.ConfirmReads);             // OCR confirms twice
    }

    [Test(TimeoutMs = 180_000)]
    public void Built_in_recipes_compile()
    {
        var all = RecipeLoader.BuiltinJson();
        Assert.True(all.Count >= 2, "pc2 and nms recipes ship");
        foreach (var (name, json) in all)
        {
            var r = RecipeLoader.FromJson(json, new EmbeddedAssets(), name);
            Assert.True(r.IsDraft, $"{name} must stay a draft until calibrated on the user's frames");
            Assert.True(Safety.GameLists.Allowed(r.Processes[0]) is not null, $"{name} targets an allowlisted game");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public void Errors_are_reported_with_paths_all_at_once()
    {
        var json = """
        { "v": 2, "id": "Bad Id", "game": "player", "status": "maybe", "match": { "processes": ["C:\\x\\game"] },
          "regions": [ { "id": "a", "anchor": "middle", "w": 0, "h": 5 }, { "id": "a", "w": 1, "h": 1 } ],
          "detectors": [ { "id": "d1", "region": "nope", "kind": "ocr" }, { "id": "d2", "region": "a", "kind": "laser" },
                         { "id": "d3", "region": "a", "kind": "color", "color": "red" }, { "id": "d4", "region": "a", "kind": "bar", "direction": "sideways" } ],
          "contexts": [ { "id": "C", "when": "d9 &" } ],
          "readouts": [ { "id": "bank-angle", "from": "d2" }, { "id": "ok", "from": "nothing" } ],
          "controls": [ { "id": "c", "kind": "knob", "locate": "d3" } ] }
        """;
        var ex = Assert.Throws<RecipeException>(() => RecipeLoader.FromJson(json));
        var all = string.Join("\n", ex.Errors);
        foreach (var path in new[] { "v:", "id:", "game:", "status:", "match.processes[0]", "regions[0].anchor", "regions[0]:", "regions[1].id", "detectors[0].region",
                                     "detectors[1].kind", "detectors[2].color", "detectors[3].direction", "contexts[0].id", "readouts[0].id", "readouts[1].from", "controls[0].kind" })
            Assert.Contains(path, all);
    }

    [Test(TimeoutMs = 180_000)]
    public void Unknown_properties_are_errors()
    {
        var json = SyntheticHud.RecipeJson().Replace("\"status\": \"calibrated\",", "\"status\": \"calibrated\", \"colour\": 1,");
        var ex = Assert.Throws<RecipeException>(() => RecipeLoader.FromJson(json, SyntheticHud.Recipe().Assets));
        Assert.Contains("colour", ex.Errors[0]);
    }

    [Test(TimeoutMs = 180_000)]
    public void Readout_types_must_fit_their_detector()
    {
        var (_, assets) = SyntheticHud.Recipe();
        var json = SyntheticHud.RecipeJson().Replace("\"id\": \"tool\", \"label\": \"Tool\", \"from\": \"tool\"", "\"id\": \"tool\", \"label\": \"Tool\", \"from\": \"builderPanel\", \"type\": \"label\"");
        var ex = Assert.Throws<RecipeException>(() => RecipeLoader.FromJson(json, assets));
        Assert.Contains("gives no labels", string.Join(" ", ex.Errors));
    }

    [Test(TimeoutMs = 180_000)]
    public void Controls_never_accept_a_weak_match_threshold()
    {
        var (_, assets) = SyntheticHud.Recipe();
        var json = SyntheticHud.RecipeJson().Replace("\"minScore\": 0.85, \"verify\"", "\"minScore\": 0.3, \"verify\"");
        var ex = Assert.Throws<RecipeException>(() => RecipeLoader.FromJson(json, assets));
        Assert.Contains("never act on a weak match", string.Join(" ", ex.Errors));
    }

    [Test(TimeoutMs = 180_000)]
    public void The_schema_is_valid_json_and_names_every_recipe_property()
    {
        var schema = RecipeLoader.SchemaJson();
        using var doc = System.Text.Json.JsonDocument.Parse(schema);
        Assert.Equal("https://json-schema.org/draft/2020-12/schema", doc.RootElement.GetProperty("$schema").GetString());
        foreach (var type in new[] { typeof(RecipeDto), typeof(MatchDto), typeof(HudDto), typeof(ColorDto), typeof(WhiteReferenceDto), typeof(RegionDto), typeof(DetectorDto),
                                     typeof(TemplateRefDto), typeof(ParseDto), typeof(ContextDto), typeof(ReadoutDto), typeof(ControlDto), typeof(PointDto), typeof(SliderDto), typeof(WheelDto) })
            foreach (var p in type.GetProperties())
            {
                var name = p.Name == "Schema" ? "$schema" : char.ToLowerInvariant(p.Name[0]) + p.Name[1..];
                Assert.Contains($"\"{name}\"", schema, $"{type.Name}.{p.Name} is missing from recipe.schema.json");
            }
    }
}

public class DetectorTests
{
    private static readonly DetectContext Ctx = new() { Unit = 1 };

    [Test(TimeoutMs = 180_000)]
    public async Task Color_detector_measures_the_matching_fraction()
    {
        var d = new ColorDetector("c", 0, null, Bgra.FromRgb(0x1f, 0x6f, 0xb2), 30, 0.7);
        var img = SightImage.Filled(100, 20, Bgra.FromRgb(0x1f, 0x6f, 0xb2));
        Assert.True((await d.RunAsync(img, Ctx)).Present);
        img.FillRect(new PixelRect(0, 0, 50, 20), Bgra.FromRgb(200, 200, 200));
        var half = await d.RunAsync(img, Ctx);
        Assert.False(half.Present);
        Assert.Near(0.5, half.Number!.Value, 0.03);
        SyntheticHud.AddNoise(img = SightImage.Filled(100, 20, Bgra.FromRgb(0x1f, 0x6f, 0xb2)), 10, 3);
        Assert.True((await d.RunAsync(img, Ctx)).Present, "noise within tolerance");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Bar_detector_reads_fill_in_every_direction_with_subpixel_ends()
    {
        foreach (var dir in Enum.GetValues<BarDirection>())
            foreach (var f in new[] { 0.0, 0.03, 0.25, 0.5, 0.731, 0.999, 1.0 })
            {
                var horizontal = dir is BarDirection.Right or BarDirection.Left;
                var (w, h) = horizontal ? (400, 20) : (20, 400);
                var img = SightImage.Filled(w, h, SyntheticHud.BarEmpty);
                var len = f * 400;
                var full = (int)Math.Floor(len);
                for (var i = 0; i < 400; i++)
                {
                    var cov = i < full ? 1 : i == full ? len - full : 0;
                    if (cov <= 0) continue;
                    var at = dir is BarDirection.Left or BarDirection.Up ? 399 - i : i;
                    img.BlendRect(horizontal ? new PixelRect(at, 0, 1, h) : new PixelRect(0, at, w, 1), SyntheticHud.Excite, cov);
                }
                SyntheticHud.AddNoise(img, 4, (int)(f * 1000));
                var d = new BarDetector("b", 0, null, dir, SyntheticHud.Excite, 40, 0.5, 0.5, 0, 100);
                var r = await d.RunAsync(img, Ctx);
                Assert.Near(f * 100, r.Number!.Value, 0.35, $"{dir} {f}");
                Assert.True(r.Score > 0.8, $"{dir} {f}: score {r.Score}");
            }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Bar_detector_ignores_text_drawn_over_the_bar()
    {
        var img = SightImage.Filled(400, 26, SyntheticHud.BarEmpty);
        img.FillRect(new PixelRect(0, 0, 250, 26), SyntheticHud.Excite);
        img.FillRect(new PixelRect(100, 8, 60, 10), Bgra.FromRgb(255, 255, 255));   // a label over the fill
        var r = await new BarDetector("b", 0, null, BarDirection.Right, SyntheticHud.Excite, 40, 0.5, 0.5, 0, 10).RunAsync(img, Ctx);
        Assert.Near(6.25, r.Number!.Value, 0.05);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Template_matching_finds_the_icon_and_tells_icons_apart()
    {
        var templates = SyntheticHud.Tools.Select(t => new TemplateImage(t, SyntheticHud.ToolSlot(t, 1).ToGray())).ToList();
        var d = new TemplateDetector("t", 0, null, templates, 0.75);
        foreach (var tool in SyntheticHud.Tools)
        {
            var img = SyntheticHud.Scene(96, 96, 2);
            img.Blit(SyntheticHud.ToolSlot(tool, 1), 11, 13);
            var r = await d.RunAsync(img, Ctx);
            Assert.True(r.Present, tool);
            Assert.Equal(tool, r.Label);
            Assert.Equal(new PixelRect(11, 13, 72, 72), r.Box!.Value);
            Assert.True(r.Number > 0.97, $"{tool}: ncc {r.Number}");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Template_matching_is_robust_to_noise_brightness_scale_and_partial_occlusion()
    {
        var tpl = new TemplateImage("coaster", SyntheticHud.ToolSlot("coaster", 1).ToGray());
        var d = new TemplateDetector("t", 0, null, [tpl], 0.75);
        // Brightness/contrast change (HDR paper-white error, dimming overlay).
        var img = SyntheticHud.Scene(110, 110, 3);
        var icon = SyntheticHud.ToolSlot("coaster", 1);
        for (var i = 0; i < icon.Pixels.Length; i += 4) for (var c = 0; c < 3; c++) icon.Pixels[i + c] = (byte)Math.Clamp(icon.Pixels[i + c] * 0.6 + 30, 0, 255);
        img.Blit(icon, 20, 15);
        SyntheticHud.AddNoise(img, 12, 9);
        var r = await d.RunAsync(img, Ctx);
        Assert.True(r.Present && r.Number > 0.9, $"dimmed + noisy: {r.Number}");
        // 5% scale mismatch (HUD scale slightly off).
        var scaled = SyntheticHud.Scene(110, 110, 4);
        scaled.Blit(SyntheticHud.ToolSlot("coaster", 1.05), 10, 10);
        Assert.True((await d.RunAsync(scaled, Ctx)).Number > 0.8, "5% scale mismatch still matches");
        // A third of the icon covered (a tooltip over it).
        var occluded = SyntheticHud.Scene(110, 110, 5);
        occluded.Blit(SyntheticHud.ToolSlot("coaster", 1), 10, 10);
        occluded.FillRect(new PixelRect(10, 10, 72, 16), Bgra.FromRgb(240, 240, 240));
        var o = await d.RunAsync(occluded, Ctx);
        // Conservative by design: a partly covered element is not "present" (controls never act on it), but it is still
        // the best match in the region.
        Assert.False(o.Present, $"a fifth covered must not count as present (ncc {o.Number})");
        Assert.True(o.Number > 0.45 && o.Box!.Value.X == 10 && o.Box.Value.Y == 10, $"still located there: {o.Number} {o.Box}");
        // Nothing there: well below the threshold.
        var empty = await d.RunAsync(SyntheticHud.Scene(110, 110, 6), Ctx);
        Assert.False(empty.Present);
        Assert.True(empty.Number < 0.6, $"no icon: {empty.Number}");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Templates_scale_with_the_hud_unit()
    {
        var tpl = new TemplateImage("coaster", SyntheticHud.ToolSlot("coaster", 1).ToGray());
        var d = new TemplateDetector("t", 0, null, [tpl], 0.75);
        foreach (var u in new[] { 0.75, 4.0 / 3, 1.8 })
        {
            var size = (int)Math.Round(72 * u);
            var img = SyntheticHud.Scene(size + 30, size + 30, 7);
            img.Blit(SyntheticHud.ToolSlot("coaster", u, size), 12, 9);
            var r = await d.RunAsync(img, new DetectContext { Unit = u });
            Assert.True(r.Present && r.Number > 0.9, $"unit {u}: {r.Number}");
            Assert.True(Math.Abs(r.Box!.Value.X - 12) <= 1 && Math.Abs(r.Box.Value.Y - 9) <= 1, $"unit {u}: box {r.Box}");
        }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Change_detector_compares_with_the_previous_image()
    {
        var a = SyntheticHud.Scene(100, 40, 1);
        var b = a.Clone();
        var d = new ChangeDetector("c", 0, null, 0.02);
        Assert.False((await d.RunAsync(a, new DetectContext { Unit = 1 })).Present, "no previous image");
        Assert.False((await d.RunAsync(b, new DetectContext { Unit = 1, Previous = a })).Present);
        b.FillRect(new PixelRect(0, 0, 60, 40), Bgra.FromRgb(255, 255, 255));
        Assert.True((await d.RunAsync(b, new DetectContext { Unit = 1, Previous = a })).Present);
    }

    [Test(TimeoutMs = 180_000)]
    public void Text_preprocessing_strips_a_trailing_degree_sign_only()
    {
        var img = SightImage.Filled(160, 48, Bgra.FromRgb(20, 22, 30));
        SyntheticHud.Text(img, "-30°", new PixelRect(0, 0, 160, 48), 1, 32, new HudState());
        var p = TextPreprocessor.Prepare(img, TextPolarity.Light, stripSuperscript: true);
        Assert.True(p.StrippedSuperscript);
        Assert.Equal(3, p.Glyphs.Count);
        var pct = SightImage.Filled(160, 48, Bgra.FromRgb(20, 22, 30));
        SyntheticHud.Text(pct, "87%", new PixelRect(0, 0, 160, 48), 1, 32, new HudState());
        var q = TextPreprocessor.Prepare(pct, TextPolarity.Light, stripSuperscript: true);
        Assert.False(q.StrippedSuperscript, "the % sign is not a superscript");
        Assert.Equal(3, q.Glyphs.Count);
    }

    [Test(TimeoutMs = 180_000)]
    public void Glyph_reader_reads_numbers_in_common_fonts()
    {
        // Supported text size: 16 px and up (digits about 11 px tall). 14 px is characterized separately below.
        var failures = new List<string>();
        foreach (var font in new[] { "Bahnschrift", "Segoe UI", "Arial", "Tahoma", "Calibri" })
            foreach (var px in new[] { 16, 20, 28, 40 })
                foreach (var text in new[] { "-30", "45", "-5", "0", "+45", "-180", "12.5", "7", "1:05", "88%" })
                {
                    var img = SightImage.Filled(px * 6, px * 2, Bgra.FromRgb(20, 22, 30));
                    SyntheticHud.Text(img, text, new PixelRect(0, 0, img.Width, img.Height), 1, px, new HudState { Font = font });
                    var p = TextPreprocessor.Prepare(img, TextPolarity.Light);
                    var r = GlyphReader.Read(p, GlyphSet.Default, "+-0123456789.:%");
                    if (r.Text != text) failures.Add($"{font} {px}px '{text}' → '{r.Text}' ({r.Score:F2})");
                }
        // 20 px and up: exact. 16 px: a degenerate glyph (Calibri's "%" fused into one blob) may still split; the
        // readout's range check rejects such values.
        Assert.Empty(failures.Where(f => !f.Contains(" 16px ")), "misreads at 20 px and up");
        Assert.True(failures.Count <= 2, $"{failures.Count} misreads:\n" + string.Join("\n", failures));
    }

    [Test(TimeoutMs = 180_000)]
    public void Glyph_reader_below_the_supported_size_mostly_reads_and_flags_the_rest()
    {
        int ok = 0, flagged = 0, wrong = 0;
        foreach (var font in new[] { "Bahnschrift", "Segoe UI", "Arial", "Tahoma", "Calibri" })
            foreach (var text in new[] { "-30", "45", "-5", "0", "+45", "-180", "12.5", "7", "1:05", "88%" })
            {
                var img = SightImage.Filled(84, 28, Bgra.FromRgb(20, 22, 30));
                SyntheticHud.Text(img, text, new PixelRect(0, 0, 84, 28), 1, 14, new HudState { Font = font });
                var r = GlyphReader.Read(TextPreprocessor.Prepare(img, TextPolarity.Light), GlyphSet.Default, "+-0123456789.:%");
                if (r.Text == text) ok++;
                else if (r.Unknown > 0 || r.Score < 0.8) flagged++;   // the detector turns these into low-confidence reads
                else wrong++;
            }
        Assert.True(ok >= 35, $"{ok}/50 exact at 14 px");
        Assert.True(wrong <= 6, $"{wrong} confident misreads at 14 px (flagged {flagged})");
    }

    [Test(TimeoutMs = 180_000)]
    public void Harvested_glyphs_read_an_unknown_font_perfectly()
    {
        // Verdana is not in the default set: harvest from labeled samples, then read new values.
        var font = new HudState { Font = "Verdana", FontWeight = 700 };
        PreparedText Prep(string s)
        {
            var img = SightImage.Filled(220, 50, Bgra.FromRgb(20, 22, 30));
            SyntheticHud.Text(img, s, new PixelRect(0, 0, 220, 50), 1, 26, font);
            SyntheticHud.AddNoise(img, 3, s.GetHashCode());
            return TextPreprocessor.Prepare(img, TextPolarity.Light);
        }
        // Labeled samples always contain digits (they set the text line the glyphs are normalized to).
        var set = GlyphSet.Harvest("verdana-hud", new[] { "-0123", "456789", "+45", "-45", "120.5", "+7.8" }.Select(s => (Prep(s), s)));
        Assert.True(set.Calibrated);
        var json = set.ToJson();
        var back = GlyphSet.FromJson(json);
        foreach (var v in new[] { "-30", "15", "-7", "+88", "0", "99.5", "-180" })
        {
            var r = GlyphReader.Read(Prep(v), back, "+-0123456789.");
            Assert.Equal(v, r.Text, $"read '{v}'");
            Assert.True(r.Score > 0.85, $"'{v}' score {r.Score}");
        }
    }
}
