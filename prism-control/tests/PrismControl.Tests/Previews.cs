using System.Text;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.Tests -- --render-previews &lt;dir&gt;</c> writes sample key and dial frames
/// as SVG plus index.html showing keys at 72/96/120/144 px and dials at 200×100 (strip) and 360×180 (Galleon widget).
/// Snapshot it with headless Chrome (aaa-prism-deck-team/lead/tools/snap.mjs) and look at it.
/// </summary>
public static class Previews
{
    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        var keys = new List<(string Name, SvgDocument Svg)>();
        var dials = new List<(string Name, SvgDocument Svg)>();
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            keys.Add(($"{t.Name}-cpu", KeyArt.Value(t, "CPU", "42%", Hues.For(t, "system"), 0.42)));
            keys.Add(($"{t.Name}-volume-on", KeyArt.Value(t, "VOLUME", "73", Hues.For(t, "audio"), 0.73, on: true)));
            keys.Add(($"{t.Name}-now-playing", KeyArt.Glyph(t, Glyphs.MusicNote, "NOW PLAYING", Hues.For(t, "spotify"), on: t.IsDark)));
            keys.Add(($"{t.Name}-gpu-temp", KeyArt.Value(t, "GPU", "62°C", Hues.For(t, "eq"))));
            dials.Add(($"{t.Name}-volume", DialArt.Meter(t, "VOLUME", "42%", 0.42, Hues.For(t, "audio"))));
            dials.Add(($"{t.Name}-eq-active", Eq.SampleBandDial.Frame(t, "1 kHz", 4.5, active: true)));
        }
        dials.Add(("night-eq-cut", Eq.SampleBandDial.Frame(Refraction.Night, "120 Hz", -7.5, active: false)));

        var specimen = new SvgDocument(640, 300) { MaxElements = 50 };
        specimen.Rect(0, 0, 640, 300, Refraction.Night.Bg);
        specimen.Text("ABCDEFGHIJKLM", 20, 60, 44, Refraction.Night.Ink);
        specimen.Text("NOPQRSTUVWXYZ", 20, 120, 44, Refraction.Night.Ink);
        specimen.Text("0123456789 %°.,:-+/()!?&#", 20, 180, 44, Refraction.Night.Accent);
        specimen.Text("Small caps: Volume, Café, Grüße · ↑↓ ←→ ×", 20, 230, 26, Refraction.Night.Muted, weight: FontWeight.Medium);
        specimen.Text("Light", 20, 280, 26, Refraction.Night.Ink, weight: FontWeight.Light);
        specimen.Text("Regular", 120, 280, 26, Refraction.Night.Ink, weight: FontWeight.Regular);
        specimen.Text("Semibold", 270, 280, 26, Refraction.Night.Ink, weight: FontWeight.Semibold);
        specimen.Text("Bold", 450, 280, 26, Refraction.Night.Ink, weight: FontWeight.Bold);

        // Wave 2 coverage: symbols, Latin extras, Cyrillic, Greek, and the replacement box for scripts the font does not draw.
        var coverage = new SvgDocument(980, 640) { MaxElements = 50 };
        coverage.Rect(0, 0, 980, 640, Refraction.Night.Bg);
        string[] lines =
        [
            "@ ` { } ∞ “ ” „ « » ‹ › ¡ ¿ † § © ® ™ ´",
            "€ £ ¥ ¢ ± ÷ ≈ ≠ ≤ ≥ ¬ ½ ¼ ¾ X² H₂O № ′ ″",
            "♥ ♪ ♫ ♭ ♯ ★ ✓ ✗ ● ○ ■ □ ▲ ▼ ▶ ◀ ↔",
            "ŁÓDŹ ĐÀ NẴNG ÞÓR İSTANBUL ŞIMARIK ȘȚ ĄĘŻ ŐŰ ĂƠƯẠỂ Ħ",
            "Small caps: Łódź Đà Nẵng Þór Şımarık ąęż ơư ể",
            "ДИНАМИКИ БГДЖЗИЛПУФЦЧШЩЪЫЬЭЮЯ ЂЋЉЊЏҐЄЇЎЙЁ",
            "Small caps: Динамики Микрофон Гучномовці",
            "ΕΛΛΗΝΙΚΆ ΓΔΘΛΞΠΣΦΨΩ · Ελληνικά σς",
            "Replacement boxes: 夜に 강남 🔥 ❤️ (heart is drawn)",
        ];
        for (var i = 0; i < lines.Length; i++)
            coverage.Text(lines[i], 20, 58 + i * 68, 34, i == lines.Length - 1 ? Refraction.Night.Muted : Refraction.Night.Ink);

        foreach (var (name, svg) in keys) Save(dir, "key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Save(dir, "dial-" + name, svg, SvgCanvas.Dial);
        Save(dir, "font-specimen", specimen, SvgCanvas.Any);
        Save(dir, "font-coverage", coverage, SvgCanvas.Any);

        var html = new StringBuilder();
        html.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:24px;background:#000;color:#a2a4b4;font:13px Segoe UI,sans-serif}")
            .Append("h2{color:#f0f0f5;font-size:14px;margin:18px 0 8px}.row{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}")
            .Append("figure{margin:0;text-align:center}figcaption{margin-top:4px}img{display:block}</style></head><body>");
        html.Append("<h2>Keys at 72 / 96 / 120 / 144 px (Stream Deck, XL, Stream Deck +, @2x)</h2>");
        foreach (var (name, _) in keys)
        {
            html.Append("<div class=\"row\">");
            foreach (var px in new[] { 72, 96, 120, 144 })
                html.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{name} {px}</figcaption></figure>");
            html.Append("</div>");
        }
        html.Append("<h2>Dials at 200×100 (Stream Deck + strip segment) and 360×180 (Galleon widget)</h2>");
        foreach (var (name, _) in dials)
            html.Append($"<div class=\"row\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name} 200×100</figcaption></figure>")
                .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"><figcaption>{name} 360×180</figcaption></figure></div>");
        html.Append("<h2>Stroke font specimen</h2><img src=\"font-specimen.svg\" width=\"640\" height=\"300\">");
        html.Append("<h2>Stroke font coverage (wave 2)</h2><img src=\"font-coverage.svg\" width=\"980\" height=\"640\"></body></html>");
        File.WriteAllText(Path.Combine(dir, "index.html"), html.ToString());
        Console.WriteLine($"wrote {keys.Count} keys, {dials.Count} dials and index.html to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static void Save(string dir, string name, SvgDocument svg, SvgCanvas canvas)
    {
        var markup = svg.ToSvg();
        var errors = SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        File.WriteAllText(Path.Combine(dir, name + ".svg"), markup);
    }
}
