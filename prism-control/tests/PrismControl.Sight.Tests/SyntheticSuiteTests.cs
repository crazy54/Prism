using PrismControl.Desktop.Sight;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

/// <summary>
/// End to end on synthetic HUD frames with known values: the full recipe (contexts, readouts, controls) at 16:9 and
/// 21:9, several HUD scales, SDR and simulated HDR (the FP16 scRGB path, with the right and the wrong paper white).
/// </summary>
public class SyntheticSuiteTests
{
    public enum Light { Sdr, HdrSdrGame, HdrGame }

    private static readonly (int W, int H)[] Resolutions = [(1920, 1080), (2560, 1440), (3440, 1440), (2560, 1080)];
    private static readonly double[] Scales = [0.8, 1.0, 1.25];

    /// <summary>The frame as the detectors would see it after capture: SDR as is; HDR through FP16 scRGB and back.</summary>
    public static SightImage Through(SightImage sdr, Light light, double? decodePaperWhite = null)
    {
        if (light == Light.Sdr) return sdr;
        var pw = light == Light.HdrSdrGame ? 284 / 80.0 : 200 / 80.0;   // monitor SDR white 284 nits; an HDR game's UI at 200 nits
        var hdr = ColorPipeline.ImageToScRgb(sdr, pw);
        return ColorPipeline.ScRgbToImage(hdr, sdr.Width, sdr.Height, sdr.Width * 8, decodePaperWhite ?? pw);
    }

    private static async Task<FrameReport> Read(HudState s, int w, int h, double scale, Light light, ITextRecognizer? ocr = null, CompiledRecipe? recipe = null)
    {
        recipe ??= SyntheticHud.Recipe().Recipe;
        var frame = Through(SyntheticHud.Render(w, h, scale, s), light);
        return await RecipeRunner.RunAsync(recipe, frame, ocr, hudScale: scale);
    }

    private static void Expect(FrameReport r, string id, double value, double tol, string where)
    {
        var ro = r.Readouts[id];
        Assert.Equal(SightConfidence.Observed, ro.Confidence, $"{where} {id} ({RecipeRunner.Show(ro)})");
        Assert.Near(value, ro.Number ?? double.NaN, tol, $"{where} {id}");
    }

    [Test(TimeoutMs = 300_000)]
    public async Task Builder_readouts_match_at_16_9_and_21_9_every_hud_scale_sdr_and_hdr()
    {
        var recipe = SyntheticHud.Recipe().Recipe;
        (double Bank, double Pitch, double Len)[] values = [(-45, -15, 12.5), (0, 0, 7.5), (45, 30, 31.0)];
        var n = 0;
        foreach (var (w, h) in Resolutions)
            foreach (var scale in Scales)
                foreach (var light in Enum.GetValues<Light>())
                {
                    var v = values[n++ % values.Length];
                    var s = new HudState { Bank = v.Bank, Pitch = v.Pitch, Length = v.Len, Seed = n };
                    var r = await Read(s, w, h, scale, light, recipe: recipe);
                    var where = $"{w}x{h} hud {scale} {light}:";
                    Assert.Equal("coasterBuilder", r.Context.Id, where + " context");
                    Expect(r, "bankAngle", v.Bank, 0, where);
                    Expect(r, "pitchAngle", v.Pitch, 0, where);
                    Expect(r, "pieceLength", v.Len, 0.001, where);
                    Assert.Equal("coaster", r.Readouts["tool"].Text, where + " tool");
                    Assert.Equal(true, r.Readouts["builderOpen"].Flag, where + " builder");
                    Assert.True(r.Controls["syn.builder.bankControl"].Located, where + " bank control located");
                    Assert.True(r.Controls["syn.builder.btn.test"].Located, where + " test button located");
                }
    }

    [Test(TimeoutMs = 120_000)]
    public async Task Small_720p_huds_read_exactly_or_not_at_all_never_wrongly()
    {
        // 1280x720 at HUD scale 1 puts the values at ~17 px: degree signs fuse with the last digit, units with spaces
        // read as junk. Values must stay exact (or unknown), never a shortened number.
        var recipe = SyntheticHud.Recipe().Recipe;
        foreach (var scale in new[] { 1.0, 1.25 })
            foreach (var bank in new[] { -45.0, -30, 0, 15, 30, 90, -180 })
            {
                var r = await Read(new HudState { Bank = bank, Length = 21.5, Seed = (int)bank }, 1280, 720, scale, Light.HdrSdrGame, recipe: recipe);
                var ro = r.Readouts["bankAngle"];
                Assert.True(ro.Confidence != SightConfidence.Observed || ro.Number == bank, $"720p hud {scale}: bank {bank} read as {RecipeRunner.Show(ro)}");
                Assert.Equal(SightConfidence.Observed, ro.Confidence, $"720p hud {scale}: bank {bank} should read ({RecipeRunner.Show(ro)})");
                Expect(r, "pieceLength", 21.5, 0.001, $"720p hud {scale}");
            }
    }

    [Test(TimeoutMs = 300_000)]
    public async Task Test_ride_bars_read_within_a_tenth_everywhere()
    {
        var recipe = SyntheticHud.Recipe().Recipe;
        var rng = new Random(11);
        foreach (var (w, h) in Resolutions)
            foreach (var scale in Scales)
            {
                var s = new HudState { Results = true, Excitement = Math.Round(rng.NextDouble() * 10, 1), Fear = Math.Round(rng.NextDouble() * 10, 1), Nausea = Math.Round(rng.NextDouble() * 10, 1), Seed = w + (int)(scale * 10) };
                foreach (var light in Enum.GetValues<Light>())
                {
                    var r = await Read(s, w, h, scale, light, recipe: recipe);
                    var where = $"{w}x{h} hud {scale} {light}:";
                    Assert.Equal("testResults", r.Context.Id, where + " context");
                    Expect(r, "excitement", s.Excitement, 0.1, where);
                    Expect(r, "fear", s.Fear, 0.1, where);
                    Expect(r, "nausea", s.Nausea, 0.1, where);
                }
            }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Contexts_follow_the_tool_and_the_pause_banner()
    {
        var terrain = await Read(new HudState { Tool = "terrain", BuilderOpen = false }, 3440, 1440, 1, Light.Sdr);
        Assert.Equal("terrain", terrain.Context.Id);
        Assert.Equal("terrain", terrain.Readouts["tool"].Text);
        Assert.Equal(SightConfidence.Unknown, terrain.Readouts["bankAngle"].Confidence, "bank is gated to the builder context");
        var paused = await Read(new HudState { Paused = true }, 2560, 1440, 1, Light.HdrSdrGame);
        Assert.Equal("paused", paused.Context.Id);
        Assert.Contains("paused", string.Join(",", paused.Context.Active));
        var scenery = await Read(new HudState { Tool = "scenery", BuilderOpen = false }, 1920, 1080, 1.25, Light.Sdr);
        Assert.Null(scenery.Context.Id);
        Assert.Equal("scenery", scenery.Readouts["tool"].Text);
        var noButton = await Read(new HudState { TestButton = false, BankControl = false }, 1920, 1080, 1, Light.Sdr);
        Assert.False(noButton.Controls["syn.builder.btn.test"].Located, "absent button is not located");
        Assert.False(noButton.Controls["syn.builder.bankControl"].Located, "absent stepper is not located");
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Hdr_paper_white_errors_never_produce_wrong_values_and_the_white_reference_fixes_them()
    {
        var sdr = SyntheticHud.Render(3440, 1440, 1, new HudState { Bank = -30 });
        var recipe = SyntheticHud.Recipe().Recipe;
        // A 30% paper-white error (HUD at 200 nits decoded as 284): colors shift a little, everything still reads.
        var mild = await RecipeRunner.RunAsync(recipe, Through(sdr, Light.HdrGame, decodePaperWhite: 284 / 80.0), null);
        Assert.Equal("coasterBuilder", mild.Context.Id, "30% error");
        Expect(mild, "bankAngle", -30, 0, "30% error");
        // A 2x error (an HDR UI at 600 nits decoded with the 284-nit SDR white): the panel color no longer matches.
        var hdr600 = ColorPipeline.ImageToScRgb(sdr, 600 / 80.0);
        var wrong = ColorPipeline.ScRgbToImage(hdr600, 3440, 1440, 3440 * 8, 284 / 80.0);
        var bad = await RecipeRunner.RunAsync(recipe, wrong, null);
        Assert.NotEqual("coasterBuilder", bad.Context.Id, "the context must not be claimed on wrong colors");
        var ro = bad.Readouts["bankAngle"];
        Assert.True(ro.Confidence == SightConfidence.Unknown || ro.Number == -30, $"never a wrong value: {RecipeRunner.Show(ro)}");
        // Measuring paper white from white HUD text (the panel header label) restores it.
        var g = HudGeometry.For(3440, 1440, recipe.Hud);
        var label = g.Resolve(Anchor.Right, -380, -318, 200, 32).ClampTo(3440, 1440);
        var crop = new byte[label.W * label.H * 8];
        for (var y = 0; y < label.H; y++) Buffer.BlockCopy(hdr600, ((label.Y + y) * 3440 + label.X) * 8, crop, y * label.W * 8, label.W * 8);
        var est = ColorPipeline.EstimatePaperWhite(crop, label.W * label.H, SyntheticHud.Ink.Luma);
        Assert.Near(600 / 80.0, est!.Value, 0.4);
        var good = await RecipeRunner.RunAsync(recipe, ColorPipeline.ScRgbToImage(hdr600, 3440, 1440, 3440 * 8, est.Value), null);
        Assert.Equal("coasterBuilder", good.Context.Id);
        Expect(good, "bankAngle", -30, 0, "after paper-white measurement");
    }

    [Test(Category = "ocr", TimeoutMs = 300_000)]
    public async Task With_windows_ocr_in_the_loop_values_stay_exact()
    {
        using var ocr = new WindowsOcrRecognizer();
        if (!ocr.IsAvailable) Assert.Skip("no OCR language installed");
        var recipe = SyntheticHud.Recipe().Recipe;
        foreach (var font in new[] { "Bahnschrift", "Segoe UI", "Arial" })
            foreach (var (bank, len) in new[] { (-45.0, 12.5), (0.0, 7.5), (45.0, 120.5), (-5.0, 3.0) })
            {
                var r = await Read(new HudState { Bank = bank, Length = len, Font = font }, 3440, 1440, 1, Light.HdrSdrGame, ocr, recipe);
                Expect(r, "bankAngle", bank, 0, font);
                Expect(r, "pieceLength", len, 0.001, font);
            }
    }

    [Test(TimeoutMs = 180_000)]
    public async Task A_calibrated_glyph_set_reads_an_unusual_hud_font()
    {
        // The HUD uses Verdana Bold (not in the default set): harvest glyphs from labeled frames, then read new values.
        var font = new HudState { Font = "Verdana", FontWeight = 700 };
        var (plain, _) = SyntheticHud.Recipe();
        var samples = new List<(PreparedText, string)>();
        foreach (var (b, p, l) in new[] { (-123.0, 45.0, 67.8), (90.0, -9.0, 0.5), (12.0, 34.0, 56.0), (-7.0, 8.0, 19.5) })
        {
            var f = SyntheticHud.Render(1920, 1080, 1, new HudState { Font = font.Font, FontWeight = 700, Bank = b, Pitch = p, Length = l });
            samples.Add((RecipeRunner.PrepareText(plain, f, "bankText")!, $"{b:0}"));
            samples.Add((RecipeRunner.PrepareText(plain, f, "pitchText")!, $"{p:0}"));
            samples.Add((RecipeRunner.PrepareText(plain, f, "lengthText")!, $"{l:0.0}"));
        }
        var glyphs = GlyphSet.Harvest("verdana-bold-hud", samples);
        var (recipe, _) = SyntheticHud.Recipe(glyphs);
        foreach (var (bank, pitch) in new[] { (-45.0, 15.0), (0.0, -30.0), (180.0, 5.0) })
        {
            var r = await Read(new HudState { Font = "Verdana", FontWeight = 700, Bank = bank, Pitch = pitch }, 2560, 1440, 1.1, Light.HdrSdrGame, recipe: recipe);
            Expect(r, "bankAngle", bank, 0, "verdana");
            Expect(r, "pitchAngle", pitch, 0, "verdana");
        }
    }
}

public class EngineTests
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);

    private static (SightEngine Engine, SightImage Frame) Make(HudState s, int w = 1920, int h = 1080)
    {
        var (recipe, _) = SyntheticHud.Recipe();
        return (new SightEngine(recipe, new SightEngineOptions()), SyntheticHud.Render(w, h, 1, s));
    }

    private static async Task Step(SightEngine e, SightImage frame, DateTimeOffset at)
    {
        var plan = e.Plan(frame.Width, frame.Height, at);
        await e.ProcessAsync(new RegionFrame { At = at, ContentWidth = frame.Width, ContentHeight = frame.Height, Regions = plan.ToDictionary(c => c.Region, c => frame.Crop(c.Rect)) });
    }

    [Test(TimeoutMs = 180_000)]
    public void Regions_are_planned_at_their_own_rates()
    {
        var (e, f) = Make(new HudState());
        var counts = new Dictionary<int, int>();
        for (var ms = 0; ms < 3000; ms += 20)
        {
            var at = T0 + TimeSpan.FromMilliseconds(ms);
            foreach (var c in e.Plan(f.Width, f.Height, at)) counts[c.Region] = counts.GetValueOrDefault(c.Region) + 1;
            // Mark them processed (the plan only advances when a frame is processed).
            e.ProcessAsync(new RegionFrame { At = at, ContentWidth = f.Width, ContentHeight = f.Height, Regions = e.Plan(f.Width, f.Height, at).ToDictionary(c => c.Region, c => f.Crop(c.Rect)) }).GetAwaiter().GetResult();
        }
        var r = e.Recipe;
        Assert.InRange(counts[r.Region("syn.builder.header")!.Index], 28, 31);    // 10 Hz over 3 s
        Assert.InRange(counts[r.Region("syn.builder.bankValue")!.Index], 9, 10);  // 3 Hz
        Assert.InRange(counts[r.Region("syn.tool")!.Index], 15, 16);              // 5 Hz
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Unchanged_regions_skip_their_detectors_but_stay_observed()
    {
        var (e, f) = Make(new HudState { Bank = 15 });
        for (var i = 0; i < 10; i++) await Step(e, f, T0 + TimeSpan.FromMilliseconds(400 * i));
        Assert.True(e.RegionsSkipped > 20, $"skipped {e.RegionsSkipped}");
        var (_, ro, _, _) = e.State();
        Assert.Equal(SightConfidence.Observed, ro["bankAngle"].Confidence);
        Assert.Equal(15.0, ro["bankAngle"].Number);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task A_new_value_is_inferred_until_confirmed_then_observed()
    {
        var (e, f) = Make(new HudState { Bank = 0 });
        var t = T0;
        for (var i = 0; i < 3; i++, t += TimeSpan.FromMilliseconds(400)) await Step(e, f, t);
        Assert.Equal(0.0, e.State().Readouts["bankAngle"].Number);
        var f2 = SyntheticHud.Render(1920, 1080, 1, new HudState { Bank = 30 });
        await Step(e, f2, t);
        var once = e.State().Readouts["bankAngle"];
        Assert.Equal(30.0, once.Number);
        Assert.Equal(SightConfidence.Inferred, once.Confidence, "OCR readouts confirm on the second identical read");
        await Step(e, f2, t + TimeSpan.FromMilliseconds(400));
        Assert.Equal(SightConfidence.Observed, e.State().Readouts["bankAngle"].Confidence);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Values_go_stale_without_reads_and_when_paused()
    {
        var (e, f) = Make(new HudState { Bank = -15 });
        for (var i = 0; i < 3; i++) await Step(e, f, T0 + TimeSpan.FromMilliseconds(400 * i));
        e.Tick(T0 + TimeSpan.FromMilliseconds(800 + 1000));
        Assert.Equal(SightConfidence.Observed, e.State().Readouts["bankAngle"].Confidence);
        e.Tick(T0 + TimeSpan.FromMilliseconds(800 + 1600));
        var stale = e.State().Readouts["bankAngle"];
        Assert.Equal(SightConfidence.Stale, stale.Confidence);
        Assert.Equal(-15.0, stale.Number, "a stale value keeps its last reading");
        await Step(e, f, T0 + TimeSpan.FromSeconds(3));
        Assert.Equal(SightConfidence.Observed, e.State().Readouts["bankAngle"].Confidence);
        e.SetPaused(true, "window minimized", T0 + TimeSpan.FromSeconds(3.1));
        var (ctx, ro, _, reason) = e.State();
        Assert.Equal(SightConfidence.Stale, ro["bankAngle"].Confidence);
        Assert.Equal(SightConfidence.Stale, ctx.Confidence);
        Assert.Equal("window minimized", reason);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Context_hysteresis_needs_the_rule_to_hold_long_enough()
    {
        var (e, open) = Make(new HudState { BuilderOpen = true });
        var closed = SyntheticHud.Render(1920, 1080, 1, new HudState { BuilderOpen = false });
        var events = new List<SightEvent>();
        e.EventRaised += events.Add;
        await Step(e, open, T0);
        Assert.Null(e.State().Context.Id, "not yet: enterMs 150");
        await Step(e, open, T0 + TimeSpan.FromMilliseconds(200));
        Assert.Equal("coasterBuilder", e.State().Context.Id);
        // A one-frame glitch (panel hidden for 100 ms) does not leave the context.
        await Step(e, closed, T0 + TimeSpan.FromMilliseconds(300));
        await Step(e, open, T0 + TimeSpan.FromMilliseconds(400));
        Assert.Equal("coasterBuilder", e.State().Context.Id);
        await Step(e, closed, T0 + TimeSpan.FromMilliseconds(500));
        await Step(e, closed, T0 + TimeSpan.FromMilliseconds(900));
        Assert.Null(e.State().Context.Id);
        Assert.Equal(2, events.Count(x => x.Type == "context"));
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Out_of_range_values_are_never_shown()
    {
        var (e, _) = Make(new HudState());
        var f = SyntheticHud.Render(1920, 1080, 1, new HudState { Bank = 270 });   // beyond the readout's ±180
        for (var i = 0; i < 4; i++) await Step(e, f, T0 + TimeSpan.FromMilliseconds(400 * i));
        var ro = e.State().Readouts["bankAngle"];
        Assert.Equal(SightConfidence.Unknown, ro.Confidence);
        Assert.Null(ro.Number);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task A_resolution_change_resets_to_unknown()
    {
        var (e, f) = Make(new HudState { Bank = 45 });
        for (var i = 0; i < 3; i++) await Step(e, f, T0 + TimeSpan.FromMilliseconds(400 * i));
        Assert.Equal(45.0, e.State().Readouts["bankAngle"].Number);
        var big = SyntheticHud.Render(2560, 1440, 1, new HudState { Bank = 45 });
        e.Plan(big.Width, big.Height, T0 + TimeSpan.FromSeconds(2));
        Assert.Equal(SightConfidence.Unknown, e.State().Readouts["bankAngle"].Confidence);
    }

    [Test(TimeoutMs = 180_000)]
    public async Task Forced_reads_ignore_the_rate()
    {
        var (e, f) = Make(new HudState());
        await Step(e, f, T0);
        var bank = e.Recipe.Region("syn.builder.bankValue")!.Index;
        Assert.False(e.Plan(f.Width, f.Height, T0 + TimeSpan.FromMilliseconds(50)).Any(c => c.Region == bank));
        e.RequestNow([bank]);
        Assert.True(e.Plan(f.Width, f.Height, T0 + TimeSpan.FromMilliseconds(50)).Any(c => c.Region == bank));
    }
}
