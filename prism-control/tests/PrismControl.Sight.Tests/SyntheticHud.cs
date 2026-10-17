using System.Globalization;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Tests;

/// <summary>The values a synthetic HUD frame shows.</summary>
public sealed class HudState
{
    public double Bank { get; set; }
    public double Pitch { get; set; }
    public double Length { get; set; } = 12.5;
    public string Tool { get; set; } = "coaster";
    public bool BuilderOpen { get; set; } = true;
    public bool BankControl { get; set; } = true;
    public bool TestButton { get; set; } = true;
    public bool Results { get; set; }
    public double Excitement { get; set; } = 6.4;
    public double Fear { get; set; } = 3.1;
    public double Nausea { get; set; } = 1.9;
    public bool Paused { get; set; }
    public string Font { get; set; } = "Bahnschrift";
    public int FontWeight { get; set; } = 600;
    /// <summary>Background scene variation (deterministic).</summary>
    public int Seed { get; set; } = 1;
    /// <summary>Gaussian-ish noise amplitude (0..255) over the whole frame (sensor/compression-like).</summary>
    public double Noise { get; set; } = 3;
    /// <summary>How the angle values are printed (string.Format with the value, e.g. "{0:0}°").</summary>
    public string AngleFormat { get; set; } = "{0:0}°";

    public HudState Clone() => (HudState)MemberwiseClone();
}

/// <summary>
/// Draws a Planet-Coaster-like builder HUD with known values, using the same geometry a recipe uses (anchors + HUD
/// units), so a frame at any resolution (16:9, 21:9), HUD scale and font can be read back by <see cref="Recipe"/>.
/// Everything is in memory.
/// </summary>
public static class SyntheticHud
{
    public static readonly Bgra PanelColor = Bgra.FromRgb(0x14, 0x18, 0x21);
    public static readonly Bgra HeaderColor = Bgra.FromRgb(0x1f, 0x6f, 0xb2);
    public static readonly Bgra ResultsHeader = Bgra.FromRgb(0x8a, 0x3f, 0xd1);
    public static readonly Bgra Ink = Bgra.FromRgb(0xf2, 0xf4, 0xf8);
    public static readonly Bgra Excite = Bgra.FromRgb(0xf2, 0xb3, 0x3d);
    public static readonly Bgra FearC = Bgra.FromRgb(0xe5, 0x48, 0x4d);
    public static readonly Bgra NauseaC = Bgra.FromRgb(0x3d, 0xd6, 0x8c);
    public static readonly Bgra BarEmpty = Bgra.FromRgb(0x2a, 0x2f, 0x3a);
    public static readonly Bgra Banner = Bgra.FromRgb(0x08, 0x08, 0x0a);

    private static readonly HudDto Hud = new() { ReferenceHeight = 1080, Scale = 1, MinScale = 0.5, MaxScale = 2 };

    public static readonly string[] Tools = ["coaster", "terrain", "scenery"];

    // ------------------------------------------------------------------ the recipe

    public static string RecipeJson(string? glyphs = null) => $$"""
    {
      "v": 1, "id": "synthetic-coaster", "game": "syncoaster", "title": "Synthetic coaster builder", "status": "calibrated",
      "match": { "processes": ["SyntheticCoaster.exe"] },
      "hud": { "referenceHeight": 1080, "scale": 1, "minScale": 0.5, "maxScale": 2 },
      "regions": [
        { "id": "syn.tool", "anchor": "top-left", "x": 12, "y": 12, "w": 96, "h": 96 },
        { "id": "syn.builder.header", "anchor": "right", "x": -390, "y": -314, "w": 200, "h": 24 },
        { "id": "syn.builder.bankValue", "anchor": "right", "x": -250, "y": -282, "w": 130, "h": 44 },
        { "id": "syn.builder.pitchValue", "anchor": "right", "x": -250, "y": -222, "w": 130, "h": 44 },
        { "id": "syn.builder.lengthValue", "anchor": "right", "x": -250, "y": -162, "w": 150, "h": 44 },
        { "id": "syn.builder.bankControl", "anchor": "right", "x": -396, "y": -110, "w": 356, "h": 56 },
        { "id": "syn.builder.bankHandle", "anchor": "right", "x": -352, "y": -108, "w": 264, "h": 52 },
        { "id": "syn.builder.btn.test", "anchor": "right", "x": -396, "y": 248, "w": 184, "h": 68 },
        { "id": "syn.results.header", "anchor": "bottom", "x": -290, "y": -254, "w": 200, "h": 24 },
        { "id": "syn.results.excitement", "anchor": "bottom", "x": -180, "y": -204, "w": 400, "h": 26 },
        { "id": "syn.results.fear", "anchor": "bottom", "x": -180, "y": -154, "w": 400, "h": 26 },
        { "id": "syn.results.nausea", "anchor": "bottom", "x": -180, "y": -104, "w": 400, "h": 26 },
        { "id": "syn.pause", "anchor": "center", "x": -196, "y": -36, "w": 40, "h": 72 }
      ],
      "detectors": [
        { "id": "tool", "region": "syn.tool", "kind": "template", "threshold": 0.75, "templates": [
          { "label": "coaster", "file": "tool-coaster.png" }, { "label": "terrain", "file": "tool-terrain.png" }, { "label": "scenery", "file": "tool-scenery.png" } ] },
        { "id": "builderPanel", "region": "syn.builder.header", "kind": "color", "color": "{{HeaderColor.ToHex()}}", "tolerance": 30, "minFraction": 0.7 },
        { "id": "bankText", "region": "syn.builder.bankValue", "kind": "ocr", "text": "light", "whitelist": "-+0123456789", "parse": { "type": "number", "unit": "°" }{{(glyphs is null ? "" : $", \"glyphs\": \"{glyphs}\"")}} },
        { "id": "pitchText", "region": "syn.builder.pitchValue", "kind": "ocr", "text": "light", "whitelist": "-+0123456789", "parse": { "type": "number", "unit": "°" }{{(glyphs is null ? "" : $", \"glyphs\": \"{glyphs}\"")}} },
        { "id": "lengthText", "region": "syn.builder.lengthValue", "kind": "ocr", "text": "light", "whitelist": "0123456789.", "parse": { "type": "number", "unit": "m" }{{(glyphs is null ? "" : $", \"glyphs\": \"{glyphs}\"")}} },
        { "id": "bankStepper", "region": "syn.builder.bankControl", "kind": "template", "threshold": 0.8, "templates": [ { "label": "minus", "file": "btn-minus.png" } ] },
        { "id": "bankKnob", "region": "syn.builder.bankHandle", "kind": "template", "threshold": 0.8, "templates": [ { "label": "knob", "file": "knob.png" } ] },
        { "id": "testButton", "region": "syn.builder.btn.test", "kind": "template", "threshold": 0.8, "templates": [ { "label": "test", "file": "btn-test.png" } ] },
        { "id": "resultsPanel", "region": "syn.results.header", "kind": "color", "color": "{{ResultsHeader.ToHex()}}", "tolerance": 30, "minFraction": 0.7 },
        { "id": "excitementBar", "region": "syn.results.excitement", "kind": "bar", "direction": "right", "color": "{{Excite.ToHex()}}", "tolerance": 40, "min": 0, "max": 10 },
        { "id": "fearBar", "region": "syn.results.fear", "kind": "bar", "direction": "right", "color": "{{FearC.ToHex()}}", "tolerance": 40, "min": 0, "max": 10 },
        { "id": "nauseaBar", "region": "syn.results.nausea", "kind": "bar", "direction": "right", "color": "{{NauseaC.ToHex()}}", "tolerance": 40, "min": 0, "max": 10 },
        { "id": "paused", "region": "syn.pause", "kind": "color", "color": "{{Banner.ToHex()}}", "tolerance": 20, "minFraction": 0.8 }
      ],
      "contexts": [
        { "id": "paused", "label": "Paused", "when": "paused", "priority": 100, "enterMs": 100, "exitMs": 100 },
        { "id": "testResults", "label": "Test results", "when": "resultsPanel & !paused", "priority": 60, "enterMs": 100, "exitMs": 200 },
        { "id": "coasterBuilder", "label": "Coaster builder", "when": "builderPanel & tool=coaster & !paused", "priority": 50, "enterMs": 150, "exitMs": 300 },
        { "id": "terrain", "label": "Terrain", "when": "tool=terrain & !paused", "priority": 40, "enterMs": 150, "exitMs": 300 }
      ],
      "readouts": [
        { "id": "bankAngle", "label": "Bank", "from": "bankText", "unit": "deg", "min": -180, "max": 180, "contexts": ["coasterBuilder"] },
        { "id": "pitchAngle", "label": "Pitch", "from": "pitchText", "unit": "deg", "min": -90, "max": 90, "contexts": ["coasterBuilder"] },
        { "id": "pieceLength", "label": "Length", "from": "lengthText", "unit": "m", "min": 0, "max": 200, "contexts": ["coasterBuilder"] },
        { "id": "excitement", "label": "Excitement", "from": "excitementBar", "min": 0, "max": 10, "precision": 1, "contexts": ["testResults"] },
        { "id": "fear", "label": "Fear", "from": "fearBar", "min": 0, "max": 10, "precision": 1, "contexts": ["testResults"] },
        { "id": "nausea", "label": "Nausea", "from": "nauseaBar", "min": 0, "max": 10, "precision": 1, "contexts": ["testResults"] },
        { "id": "tool", "label": "Tool", "from": "tool" },
        { "id": "builderOpen", "label": "Builder", "from": "builderPanel" }
      ],
      "controls": [
        { "id": "syn.builder.bankControl", "label": "Bank", "kind": "stepper", "locate": "bankStepper", "minScore": 0.85,
          "decrease": { "x": 0.5, "y": 0.5 }, "increase": { "x": {{(BtnPlusX - BtnMinusX + 18) / 36.0:0.####}}, "y": 0.5 },
          "slider": { "orientation": "horizontal", "increaseTowards": "right", "handle": "bankKnob", "stepUnits": {{TrackW / 180.0 * BankStep:0.####}} },
          "wheel": { "notchesPerStep": 1, "increase": "up", "point": { "x": 5, "y": 0.5 } },
          "readout": "bankAngle", "settleMs": 10, "intervalMs": 10 },
        { "id": "syn.builder.btn.test", "label": "Test", "kind": "button", "locate": "testButton", "minScore": 0.85, "verify": "resultsPanel", "settleMs": 10 }
      ]
    }
    """;

    /// <summary>Bank degrees per stepper step.</summary>
    public const double BankStep = 15;
    private const double BtnMinusX = -384, BtnPlusX = -92, BtnY = -100, BtnS = 36, TrackX = -340, TrackW = 240, TrackY = -88;

    /// <summary>The compiled synthetic recipe and its templates (drawn at reference size).</summary>
    public static (CompiledRecipe Recipe, MemoryAssets Assets) Recipe(GlyphSet? glyphs = null)
    {
        var assets = new MemoryAssets();
        foreach (var t in Tools) assets.Add($"tool-{t}.png", PngCodec.Encode(ToolSlot(t, 1)));
        assets.Add("btn-minus.png", PngCodec.Encode(Button("−", 36, 1)));
        assets.Add("knob.png", PngCodec.Encode(Knob(1)));
        // The button's icon part only: text re-renders differently at other UI scales, icons scale cleanly.
        assets.Add("btn-test.png", PngCodec.Encode(TestButtonImage(1).Crop(new PixelRect(0, 0, 44, 44))));
        if (glyphs is not null) assets.Add("glyphs.json", System.Text.Encoding.UTF8.GetBytes(glyphs.ToJson()));
        return (RecipeLoader.FromJson(RecipeJson(glyphs is null ? null : "glyphs.json"), assets), assets);
    }

    private static readonly Lazy<GlyphSet> Calibrated = new(HarvestCalibrated);
    private static readonly Lazy<CompiledRecipe> CalibratedCompiled = new(() => Recipe(Calibrated.Value).Recipe);

    /// <summary>
    /// The synthetic HUD font harvested from labeled synthetic frames (what a calibration does for a real game): with
    /// it, OCR reads are "calibrated" and a closed loop may act on them (lead decision 3).
    /// </summary>
    public static GlyphSet CalibratedGlyphs => Calibrated.Value;

    /// <summary>The synthetic recipe reading with <see cref="CalibratedGlyphs"/> (compiled once).</summary>
    public static CompiledRecipe CalibratedRecipe() => CalibratedCompiled.Value;

    private static GlyphSet HarvestCalibrated()
    {
        var (plain, _) = Recipe();
        var samples = new List<(PreparedText, string)>();
        // Every digit, the minus and a few widths, at the SimGame resolution (harvesting is the slow part: keep it small).
        foreach (var (w, h) in new[] { (2560, 1440) })
            foreach (var b in new[] { -123.0, 45, 67, -8, 90, 0 })
            {
                var f = Render(w, h, 1, new HudState { Bank = b, Pitch = Math.Round(-b / 3) });
                if (Calibration.RecipeRunner.PrepareText(plain, f, "bankText") is { } bank) samples.Add((bank, string.Format(CultureInfo.InvariantCulture, "{0:0}", b)));
                if (Calibration.RecipeRunner.PrepareText(plain, f, "pitchText") is { } pitch) samples.Add((pitch, string.Format(CultureInfo.InvariantCulture, "{0:0}", Math.Round(-b / 3))));
            }
        return GlyphSet.Harvest("synthetic-hud", samples);
    }

    // ------------------------------------------------------------------ rendering

    public static SightImage Render(int width, int height, double hudScale, HudState s)
    {
        var img = Scene(width, height, s.Seed);
        var g = HudGeometry.For(width, height, Hud, hudScale);
        var u = g.Unit;
        PixelRect R(Anchor a, double x, double y, double w, double h) => g.Resolve(a, x, y, w, h);

        // Tool slot (top-left).
        var slot = R(Anchor.TopLeft, 24, 24, 72, 72);
        img.Blit(ToolSlot(s.Tool, u, slot.W), slot.X, slot.Y);

        if (s.BuilderOpen)
        {
            img.BlendRect(R(Anchor.Right, -400, -320, 380, 640), PanelColor, 0.9);
            img.FillRect(R(Anchor.Right, -400, -320, 380, 36), HeaderColor);
            Text(img, "EDIT TRACK", R(Anchor.Right, -380, -318, 200, 32), u, 18, s);
            Row(img, g, "BANK", -270, string.Format(CultureInfo.InvariantCulture, s.AngleFormat, s.Bank), s);
            Row(img, g, "PITCH", -210, string.Format(CultureInfo.InvariantCulture, s.AngleFormat, s.Pitch), s);
            Row(img, g, "LENGTH", -150, s.Length.ToString("0.0", CultureInfo.InvariantCulture) + " m", s);
            if (s.BankControl)
            {
                var minus = R(Anchor.Right, BtnMinusX, BtnY, BtnS, BtnS);
                img.Blit(Button("−", BtnS, u, minus.W), minus.X, minus.Y);
                var plus = R(Anchor.Right, BtnPlusX, BtnY, BtnS, BtnS);
                img.Blit(Button("+", BtnS, u, plus.W), plus.X, plus.Y);
                img.FillRect(R(Anchor.Right, TrackX, TrackY, TrackW, 12), BarEmpty);
                var pos = Math.Clamp((s.Bank + 90) / 180, 0, 1);
                var knob = Knob(u);
                var kx = R(Anchor.Right, TrackX + pos * TrackW - 12, TrackY - 6, 24, 24);
                img.Blit(knob, kx.X, kx.Y);
            }
            if (s.TestButton)
            {
                var tb = R(Anchor.Right, -384, 260, 160, 44);
                img.Blit(TestButtonImage(u, tb.W), tb.X, tb.Y);
            }
        }
        if (s.Results)
        {
            img.BlendRect(R(Anchor.Bottom, -300, -260, 600, 220), PanelColor, 0.92);
            img.FillRect(R(Anchor.Bottom, -300, -260, 600, 36), ResultsHeader);
            Bar(img, g, "EXCITEMENT", -200, s.Excitement, Excite, s);
            Bar(img, g, "FEAR", -150, s.Fear, FearC, s);
            Bar(img, g, "NAUSEA", -100, s.Nausea, NauseaC, s);
        }
        if (s.Paused)
        {
            img.BlendRect(new PixelRect(0, 0, width, height), Bgra.FromRgb(0, 0, 0), 0.35);
            img.FillRect(R(Anchor.Center, -200, -40, 400, 80), Banner);
            Text(img, "PAUSED", R(Anchor.Center, -100, -30, 220, 60), u, 40, s);
        }
        if (s.Noise > 0) AddNoise(img, s.Noise, s.Seed);
        return img;
    }

    private static void Row(SightImage img, HudGeometry g, string label, double y, string value, HudState s)
    {
        Text(img, label, g.Resolve(Anchor.Right, -384, y - 6, 120, 36), g.Unit, 20, s, muted: true);
        Text(img, value, g.Resolve(Anchor.Right, -246, y - 8, 124, 40), g.Unit, 26, s);
    }

    private static void Bar(SightImage img, HudGeometry g, string label, double y, double value, Bgra fill, HudState s)
    {
        Text(img, label, g.Resolve(Anchor.Bottom, -290, y - 6, 110, 30), g.Unit, 16, s, muted: true);
        var track = g.Resolve(Anchor.Bottom, -180, y, 400, 14);
        img.FillRect(track, BarEmpty);
        var w = Math.Clamp(value / 10, 0, 1) * 400 * g.Unit;
        var full = (int)Math.Floor(w);
        img.FillRect(track with { W = full }, fill);
        // Anti-aliased end column, like a real renderer.
        var frac = w - full;
        if (frac > 0) img.BlendRect(new PixelRect(track.X + full, track.Y, 1, track.H), fill, frac);
    }

    /// <summary>Text drawn with GDI (grayscale AA) into <paramref name="box"/>, left-aligned, vertically centered.</summary>
    public static void Text(SightImage img, string text, PixelRect box, double u, double sizeUnits, HudState s, bool muted = false)
    {
        var m = GdiText.Render(text, s.Font, Math.Max(6, (int)Math.Round(sizeUnits * u)), s.FontWeight);
        int x0 = m.Width, y0 = m.Height, x1 = -1, y1 = -1;
        for (var y = 0; y < m.Height; y++)
            for (var x = 0; x < m.Width; x++)
                if (m.Coverage[y * m.Width + x] > 0.05f) { x0 = Math.Min(x0, x); x1 = Math.Max(x1, x); y0 = Math.Min(y0, y); y1 = Math.Max(y1, y); }
        if (x1 < 0) return;
        var ox = box.X + (int)Math.Round(4 * u) - x0;
        var oy = box.Y + (box.H - (y1 - y0 + 1)) / 2 - y0;
        var c = muted ? Bgra.FromRgb(0x9a, 0xa3, 0xb5) : Ink;
        for (var y = y0; y <= y1; y++)
            for (var x = x0; x <= x1; x++)
            {
                var a = m.Coverage[y * m.Width + x];
                if (a <= 0) continue;
                int dx = ox + x, dy = oy + y;
                if (dx < 0 || dy < 0 || dx >= img.Width || dy >= img.Height) continue;
                var o = img.Get(dx, dy);
                img.Set(dx, dy, new Bgra((byte)(o.B + (c.B - o.B) * a), (byte)(o.G + (c.G - o.G) * a), (byte)(o.R + (c.R - o.R) * a)));
            }
    }

    /// <summary>A sky-to-ground gradient with deterministic shapes (a stand-in for the 3D world behind the HUD).</summary>
    public static SightImage Scene(int w, int h, int seed)
    {
        var img = new SightImage(w, h);
        var rng = new Random(seed);
        for (var y = 0; y < h; y++)
        {
            var t = (double)y / h;
            var c = t < 0.55 ? Lerp(Bgra.FromRgb(0x5b, 0x8f, 0xc9), Bgra.FromRgb(0xb9, 0xd3, 0xe8), t / 0.55) : Lerp(Bgra.FromRgb(0x4f, 0x7a, 0x3a), Bgra.FromRgb(0x2c, 0x4a, 0x22), (t - 0.55) / 0.45);
            img.FillRect(new PixelRect(0, y, w, 1), c);
        }
        for (var i = 0; i < 40; i++)
        {
            var rw = rng.Next(w / 40, w / 6);
            var rh = rng.Next(h / 30, h / 5);
            var col = Bgra.FromRgb((byte)rng.Next(40, 220), (byte)rng.Next(40, 220), (byte)rng.Next(40, 220));
            img.BlendRect(new PixelRect(rng.Next(0, w), rng.Next(h / 3, h), rw, rh), col, 0.6);
        }
        return img;
    }

    private static Bgra Lerp(Bgra a, Bgra b, double t) =>
        Bgra.FromRgb((byte)(a.R + (b.R - a.R) * t), (byte)(a.G + (b.G - a.G) * t), (byte)(a.B + (b.B - a.B) * t));

    public static void AddNoise(SightImage img, double amp, int seed)
    {
        var rng = new Random(seed * 7919 + 13);
        var p = img.Pixels;
        for (var i = 0; i < p.Length; i += 4)
        {
            var n = (rng.NextDouble() + rng.NextDouble() - 1) * amp;
            for (var c = 0; c < 3; c++) p[i + c] = (byte)Math.Clamp(p[i + c] + n, 0, 255);
        }
    }

    // ------------------------------------------------------------------ widgets (also the templates, at u = 1)

    /// <summary>The tool slot: a dark rounded square with the tool's icon (72 units).</summary>
    public static SightImage ToolSlot(string tool, double u, int? size = null)
    {
        var n = size ?? Math.Max(8, (int)Math.Round(72 * u));
        var img = SightImage.Filled(n, n, Bgra.FromRgb(0x1b, 0x20, 0x2b));
        var k = n / 72.0;
        var white = Ink;
        switch (tool)
        {
            case "coaster":
                for (var i = 0; i < 3 * n; i++)
                {
                    var x = i / 3.0;
                    var y = n * 0.5 + Math.Sin(x / n * Math.PI * 2) * n * 0.22;
                    Raster.Disc(img, x, y, 4 * k, white);
                }
                for (var j = 0; j < 4; j++) Raster.Rect(img, 10 * k + j * 16 * k, n * 0.62, 3 * k, n * 0.3, white);
                break;
            case "terrain":
                Raster.Triangle(img, (8 * k, 60 * k), (32 * k, 14 * k), (56 * k, 60 * k), white);
                Raster.Triangle(img, (36 * k, 60 * k), (52 * k, 30 * k), (66 * k, 60 * k), white);
                break;
            default:
                Raster.Disc(img, 36 * k, 28 * k, 18 * k, white);
                Raster.Rect(img, 32 * k, 40 * k, 8 * k, 24 * k, white);
                break;
        }
        return img;
    }

    /// <summary>A ± button (rounded square with a glyph), <paramref name="units"/> HUD units square.</summary>
    public static SightImage Button(string glyph, double units, double u, int? size = null)
    {
        var n = size ?? Math.Max(6, (int)Math.Round(units * u));
        var img = SightImage.Filled(n, n, Bgra.FromRgb(0x2d, 0x5f, 0x9a));
        var k = n / 36.0;
        Raster.Rect(img, 9 * k, 16 * k, 18 * k, 4 * k, Ink);
        if (glyph == "+") Raster.Rect(img, 16 * k, 9 * k, 4 * k, 18 * k, Ink);
        // Darker frame.
        Raster.Rect(img, 0, 0, n, 2 * k, Bgra.FromRgb(0x5d, 0x8f, 0xca));
        return img;
    }

    public static SightImage Knob(double u)
    {
        var n = Math.Max(6, (int)Math.Round(24 * u));
        var img = SightImage.Filled(n, n, BarEmpty);
        Raster.Disc(img, n / 2.0, n / 2.0, n * 0.46, Bgra.FromRgb(0xe8, 0xec, 0xf2));
        Raster.Disc(img, n / 2.0, n / 2.0, n * 0.18, Bgra.FromRgb(0x2d, 0x5f, 0x9a));
        return img;
    }

    public static SightImage TestButtonImage(double u, int? width = null)
    {
        var w = width ?? Math.Max(10, (int)Math.Round(160 * u));
        var h = Math.Max(6, (int)Math.Round(44 * u * w / Math.Max(1, 160 * u)));
        var img = SightImage.Filled(w, h, Bgra.FromRgb(0x2f, 0x9e, 0x6a));
        var k = w / 160.0;
        Raster.Rect(img, 0, 0, w, Math.Max(1, 3 * k), Bgra.FromRgb(0x6f, 0xd6, 0xa4));
        Raster.Triangle(img, (12 * k, 10 * k), (34 * k, 22 * k), (12 * k, 34 * k), Ink);   // a "play" icon
        Text(img, "TEST", new PixelRect((int)(48 * k), 0, (int)(110 * k), h), k, 26, new HudState());
        return img;
    }
}

/// <summary>Anti-aliased primitives (coverage by 4×4 supersampling) for the synthetic HUD.</summary>
public static class Raster
{
    public static void Disc(SightImage img, double cx, double cy, double r, Bgra c) =>
        Shape(img, (int)(cx - r - 1), (int)(cy - r - 1), (int)(cx + r + 2), (int)(cy + r + 2), (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r, c);

    public static void Rect(SightImage img, double x, double y, double w, double h, Bgra c) =>
        Shape(img, (int)x - 1, (int)y - 1, (int)(x + w) + 2, (int)(y + h) + 2, (px, py) => px >= x && px < x + w && py >= y && py < y + h, c);

    public static void Triangle(SightImage img, (double X, double Y) a, (double X, double Y) b, (double X, double Y) c, Bgra col)
    {
        static double E((double X, double Y) p, (double X, double Y) q, double x, double y) => (q.X - p.X) * (y - p.Y) - (q.Y - p.Y) * (x - p.X);
        var minX = (int)Math.Min(a.X, Math.Min(b.X, c.X)) - 1; var maxX = (int)Math.Max(a.X, Math.Max(b.X, c.X)) + 2;
        var minY = (int)Math.Min(a.Y, Math.Min(b.Y, c.Y)) - 1; var maxY = (int)Math.Max(a.Y, Math.Max(b.Y, c.Y)) + 2;
        Shape(img, minX, minY, maxX, maxY, (x, y) =>
        {
            var e0 = E(a, b, x, y); var e1 = E(b, c, x, y); var e2 = E(c, a, x, y);
            return (e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0);
        }, col);
    }

    private static void Shape(SightImage img, int x0, int y0, int x1, int y1, Func<double, double, bool> inside, Bgra c)
    {
        for (var y = Math.Max(0, y0); y < Math.Min(img.Height, y1); y++)
            for (var x = Math.Max(0, x0); x < Math.Min(img.Width, x1); x++)
            {
                var hits = 0;
                for (var sy = 0; sy < 4; sy++)
                    for (var sx = 0; sx < 4; sx++)
                        if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
                if (hits == 0) continue;
                var a = hits / 16.0;
                var o = img.Get(x, y);
                img.Set(x, y, new Bgra((byte)Math.Round(o.B + (c.B - o.B) * a), (byte)Math.Round(o.G + (c.G - o.G) * a), (byte)Math.Round(o.R + (c.R - o.R) * a)));
            }
    }
}
