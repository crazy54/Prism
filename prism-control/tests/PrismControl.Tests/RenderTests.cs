using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Tests;

public class ColorTests
{
    [Test]
    public void Hex_round_trips_and_short_form_expands()
    {
        Assert.Equal("#b8a2f2", Color.FromHex("#B8A2F2").Hex);
        Assert.Equal("#ffffff", Color.FromHex("#fff").Hex);
        Assert.Equal("#0a0c12", Color.FromHex("0a0c12").Hex);
    }

    [Test]
    public void Alpha_forms_become_hex_plus_opacity_never_rgba()
    {
        var p = Paint.Parse("rgba(184,162,242,.12)");
        Assert.Equal("#b8a2f2", p.AttributeValue);
        Assert.Near(0.12, p.Opacity, 0.001);
        var h8 = Paint.Parse("#b8a2f280");
        Assert.Equal("#b8a2f2", h8.AttributeValue);
        Assert.Near(0.502, h8.Opacity, 0.002);
        Assert.Equal(0.0, Paint.Parse("transparent").Opacity);
    }

    [Test]
    public void Hsl_is_rejected()
    {
        Assert.Throws<FormatException>(() => Paint.Parse("hsl(270, 50%, 50%)"));
        Assert.Throws<FormatException>(() => Color.FromHex("#b8a2f280"));
    }

    [Test]
    public void Contrast_matches_wcag_reference()
    {
        Assert.Near(21, Color.Contrast(Color.White, Color.Black), 0.01);
        Assert.True(Color.Contrast(Refraction.Night.Ink, Refraction.Night.Bg) > 15);
    }
}

public class SvgDocumentTests
{
    [Test]
    public void Key_has_square_viewbox_and_dial_is_200x100()
    {
        var k = SvgDocument.Key().Rect(0, 0, 144, 144, Refraction.Night.Bg).ToSvg();
        Assert.Contains("width=\"144\" height=\"144\" viewBox=\"0 0 144 144\"", k);
        var d = SvgDocument.Dial().Rect(0, 0, 200, 100, Refraction.Night.Bg).ToSvg();
        Assert.Contains("viewBox=\"0 0 200 100\"", d);
        Assert.Empty(SvgLint.Check(k, SvgCanvas.Key).Where(i => i.Severity == LintSeverity.Error));
        Assert.Empty(SvgLint.Check(d, SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error));
    }

    [Test]
    public void Translucent_paint_uses_opacity_attributes()
    {
        var svg = SvgDocument.Key().Rect(0, 0, 10, 10, Paint.Parse("rgba(255,255,255,.08)")).ToSvg();
        Assert.Contains("fill=\"#ffffff\" fill-opacity=\"0.08\"", svg);
        Assert.DoesNotContain("rgba", svg);
    }

    [Test]
    public void Gradients_masks_and_glows_use_the_safe_forms()
    {
        var d = SvgDocument.Key();
        var g = d.LinearGradient(0, 0, 1, 0, [(0, Refraction.Night.Accent, 0.5), (1, Refraction.Night.Accent2)]);
        var m = d.MaskRoundedRect(8, 8, 128, 128, 16);
        var glow = d.Glow(4);
        d.Rect(0, 0, 144, 144, new Style { Fill = g, Mask = m, Filter = glow });
        var svg = d.ToSvg();
        Assert.Contains("<mask id=", svg);
        Assert.Contains("stop-opacity=\"0.5\"", svg);
        Assert.Contains("color-interpolation-filters=\"sRGB\"", svg);
        Assert.Contains("feGaussianBlur", svg);
        Assert.DoesNotContain("clipPath", svg);
        Assert.DoesNotContain("mask-type", svg);
        Assert.Empty(SvgLint.Check(svg, SvgCanvas.Key));
    }

    [Test]
    public void Text_is_one_stroked_path_never_a_text_element()
    {
        var d = SvgDocument.Key().Text("CPU 42%", 72, 80, 44, Refraction.Night.Ink, TextAlign.Middle);
        Assert.Equal(1, d.ElementCount);
        var svg = d.ToSvg();
        Assert.DoesNotContain("<text", svg);
        Assert.Contains("stroke-linecap=\"round\"", svg);
        Assert.Contains("fill=\"none\"", svg);
    }

    [Test]
    public void Element_budget_is_enforced()
    {
        var d = SvgDocument.Key();
        for (var i = 0; i < 301; i++) d.Rect(i % 144, 0, 1, 1, Color.White);
        Assert.Throws<SvgBudgetExceededException>(() => d.ToSvg());
        var ok = SvgDocument.Key();
        for (var i = 0; i < 300; i++) ok.Rect(i % 144, 0, 1, 1, Color.White);
        Assert.Equal(300, ok.ElementCount);
        _ = ok.ToSvg();
    }

    [Test]
    public void Numbers_are_invariant_under_a_comma_culture()
    {
        var saved = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("de-DE");
            var svg = SvgDocument.Key().Rect(1.5, 2.25, 10.125, 3, Color.White).ToSvg();
            Assert.Contains("x=\"1.5\" y=\"2.25\" width=\"10.13\"", svg);
        }
        finally { CultureInfo.CurrentCulture = saved; }
    }

    [Test]
    public void Unclosed_group_is_an_error()
    {
        var d = SvgDocument.Key();
        _ = d.Group(Transform.Translate(1, 1));
        Assert.Throws<InvalidOperationException>(() => d.ToSvg());
    }

    [Test]
    public void Data_uri_is_percent_encoded_svg_and_decodes_back()
    {
        var svg = SvgDocument.Key().Text("Grüße é", 10, 50, 22, Color.White).ToSvg();
        var uri = DataUri.Svg(svg);
        Assert.True(uri.StartsWith("data:image/svg+xml,%3Csvg", StringComparison.Ordinal), uri[..40]);
        Assert.True(DataUri.TryDecodeSvg(uri, out var back));
        Assert.Equal(svg, back);
    }

    [Test]
    public void Image_contain_keeps_aspect_and_cover_masks_the_overflow()
    {
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DwnwECGAAz5gP9p/QW4QAAAABJRU5ErkJggg==");
        var info = ImageInfo.Probe(png)!;
        Assert.Equal(2, info.Width);
        Assert.Equal(1, info.Height);
        var contain = SvgDocument.Key().Image(png, 0, 0, 144, 144, ImageFit.Contain).ToSvg();
        Assert.Contains("y=\"36\" width=\"144\" height=\"72\"", contain);
        Assert.DoesNotContain("<mask", contain);
        var cover = SvgDocument.Key().Image(png, 0, 0, 144, 144, ImageFit.Cover).ToSvg();
        Assert.Contains("<mask", cover);
        Assert.Contains("width=\"288\" height=\"144\"", cover);
        Assert.Empty(SvgLint.Check(cover, SvgCanvas.Key).Where(i => i.Severity == LintSeverity.Error));
    }

    [Test]
    public void Jpeg_and_gif_headers_are_probed()
    {
        // Minimal SOF0 segment: FF D8, FF C0 len=17 precision 8 height=0x012C width=0x0258
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x2C, 0x02, 0x58, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var j = ImageInfo.Probe(jpeg)!;
        Assert.Equal(("image/jpeg", 600, 300), (j.Mime, j.Width, j.Height));
        byte[] gif = [(byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a', 72, 0, 144, 0];
        var g = ImageInfo.Probe(gif)!;
        Assert.Equal((72, 144), (g.Width, g.Height));
    }
}

public class SvgLintTests
{
    private static List<string> Rules(string svg, SvgCanvas canvas = SvgCanvas.Any) =>
        SvgLint.Check(svg, canvas).Where(i => i.Severity == LintSeverity.Error).Select(i => i.Rule).ToList();

    private const string Root = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"144\" height=\"144\" viewBox=\"0 0 144 144\">";

    [Test]
    public void Flags_every_known_breaker()
    {
        Assert.Contains("color-rgba", string.Join(",", Rules(Root + "<rect fill=\"rgba(0,0,0,.5)\"/></svg>")));
        Assert.Contains("color-hsl", string.Join(",", Rules(Root + "<rect fill=\"hsl(1,2%,3%)\"/></svg>")));
        Assert.Contains("color-hex-alpha", string.Join(",", Rules(Root + "<rect fill=\"#ff000080\"/></svg>")));
        Assert.Contains("clip-path", string.Join(",", Rules(Root + "<clipPath id=\"a\"/></svg>")));
        Assert.Contains("mask-type-alpha", string.Join(",", Rules(Root + "<mask mask-type=\"alpha\"/></svg>")));
        Assert.Contains("unsupported-filter", string.Join(",", Rules(Root + "<filter><feDropShadow/></filter></svg>")));
        Assert.Contains("nested-svg", string.Join(",", Rules(Root + "<svg/></svg>")));
        Assert.Contains("foreign-object", string.Join(",", Rules(Root + "<foreignObject/></svg>")));
        Assert.Contains("css-transform", string.Join(",", Rules(Root + "<rect style=\"transform: rotate(4deg)\"/></svg>")));
        Assert.Contains("external-href", string.Join(",", Rules(Root + "<image href=\"https://example.com/a.png\"/></svg>")));
    }

    [Test]
    public void Flags_non_square_key_and_live_text_warning()
    {
        var wide = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"100\" viewBox=\"0 0 200 100\"></svg>";
        Assert.Contains("viewbox-aspect", string.Join(",", Rules(wide, SvgCanvas.Key)));
        Assert.Empty(Rules(wide, SvgCanvas.Dial));
        var text = SvgLint.Check(Root + "<text>hi</text></svg>");
        Assert.True(text.Any(i => i.Rule == "live-text" && i.Severity == LintSeverity.Warning));
    }

    [Test]
    public void Url_references_to_ids_are_not_mistaken_for_hex_alpha()
    {
        Assert.Empty(Rules(Root + "<rect fill=\"url(#face)\"/></svg>"));
    }

    [Test]
    public void All_art_helpers_produce_clean_frames_in_both_themes()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            var hue = Hues.For(t, "audio");
            foreach (var on in new[] { false, true })
            {
                Assert.Empty(SvgLint.Check(KeyArt.Value(t, "LEVEL", "42%", hue, 0.42, on).ToSvg(), SvgCanvas.Key), $"KeyArt.Value {t.Name} on={on}");
                Assert.Empty(SvgLint.Check(KeyArt.Glyph(t, Glyphs.MusicNote, "NOW PLAYING", hue, on).ToSvg(), SvgCanvas.Key), $"KeyArt.Glyph {t.Name}");
                Assert.Empty(SvgLint.Check(DialArt.Meter(t, "VOLUME", "42%", 0.42, hue, on).ToSvg(), SvgCanvas.Dial), $"DialArt.Meter {t.Name}");
            }
        }
    }
}

public class StrokeFontTests
{
    [Test]
    public void Digits_are_tabular()
    {
        var w = StrokeFont.Measure("0", 44);
        foreach (var d in "123456789") Assert.Near(w, StrokeFont.Measure(d.ToString(), 44), 0.001, $"digit {d}");
        Assert.Near(StrokeFont.Measure("11", 44), StrokeFont.Measure("88", 44), 0.001);
    }

    [Test]
    public void Covers_the_label_alphabet()
    {
        Assert.True(StrokeFont.Supports("ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 %.,:;-+/°!?'\"()[]#&*<>=_|^~·•…↑↓←→×$µ"));
        Assert.True(StrokeFont.Supports("volume café Grüße Ñandú øre"));
        Assert.False(StrokeFont.Supports("音楽"));
    }

    [Test]
    public void Measure_scales_with_size_and_weight()
    {
        var a = StrokeFont.Measure("PRISM", 22);
        var b = StrokeFont.Measure("PRISM", 44);
        Assert.True(b > a * 1.9 && b < a * 2.1, $"{a} vs {b}");
        Assert.True(StrokeFont.Measure("PRISM", 22, FontWeight.Bold) > StrokeFont.Measure("PRISM", 22, FontWeight.Light));
    }

    [Test]
    public void Middle_alignment_centers_the_ink()
    {
        var d = StrokeFont.PathData("HI", 72, 80, 44, align: TextAlign.Middle);
        var xs = System.Text.RegularExpressions.Regex.Matches(d, @"[ML](-?[0-9.]+) ").Select(m => double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture)).ToList();
        var ink = StrokeFont.StrokeWidth(44, FontWeight.Semibold) / 2;
        Assert.Near(72, (xs.Min() - ink + xs.Max() + ink) / 2, 0.6);
    }

    // Fictional strings that carry the characters a scan of real device, app and track names needed (wave 2).
    [Test]
    public void Covers_the_characters_real_names_use()
    {
        Assert.True(StrokeFont.Supports("@handle {Live} `01` ∞ “Quote” ‘x’ „Gänse“ ‚x‘ «A» ‹B› ¡Hola! ¿Qué? ´"));
        Assert.True(StrokeFont.Supports("© ® ™ € £ ¥ ¢ § † ± ÷ ≈ ≠ ≤ ≥ ¬ ½ ¼ ¾ x² H₂O № ′ ″"));
        Assert.True(StrokeFont.Supports("♥ ❤️ ♪ ♫ ♭ ♯ ★ ☆ ✓ ✔ ✗ ● ○ ■ □ ▲ ▼ ▶ ◀ ► ↔ ‐ ‒ ―"));
        Assert.True(StrokeFont.Supports("Łódź Đà Nẵng Þór Ħal İstanbul Şımarık ș ț ą ę ż ő ű ă ơ ư ạ ể ẞ ð þ"));
        Assert.True(StrokeFont.Supports("Ελληνικά ΑΒΓΔΘΛΞΠΣΦΨΩ σς ά ΐ"));
        Assert.True(StrokeFont.Supports("Динамики Микрофон Гучномовці Ёлка Йошкар Џ Љ Њ Ђ Ћ Ґ Є Ї Ў Ѓ Ќ"));
        Assert.True(StrokeFont.Supports("ＡＢＣ１２３ ﬁ ① Ⅻ ℃")); // compatibility forms draw as their plain letters
    }

    [Test]
    public void Unsupported_scripts_and_emoji_become_one_visible_box_per_grapheme()
    {
        Assert.Equal("🔥|夜|に|강", string.Join("|", StrokeFont.Unsupported("Fire 🔥 夜に 강")));
        Assert.Single(StrokeFont.Unsupported("👨‍👩‍👧")); // a ZWJ sequence is one grapheme, one box
        Assert.Single(StrokeFont.Unsupported("a\u0334")); // an unknown mark is never dropped silently
        Assert.Empty(StrokeFont.Unsupported("ABC"));
        var box = StrokeFont.Measure("夜", 22);
        Assert.True(box > 0);
        Assert.Near(box, StrokeFont.Measure("🔥", 22), 1e-9);
        Assert.True(StrokeFont.PathData("A夜B", 0, 30, 22).Length > StrokeFont.PathData("AB", 0, 30, 22).Length, "the box is drawn");
    }

    [Test]
    public void Never_throws_on_emoji_or_broken_utf16_and_skips_invisible_characters()
    {
        foreach (var s in new[] { "Lo-fi 📚", "\uD83D", "A\uDC00B", "\uFE0F", "🎉🎉" })
        {
            _ = StrokeFont.PathData(s, 0, 30, 22);
            _ = StrokeFont.Ellipsize(s + " a long tail of words", 60, 22);
        }
        Assert.Single(StrokeFont.Unsupported("\uD83D"));
        var ab = StrokeFont.Measure("AB", 22);
        foreach (var hidden in new[] { "\u200B", "\u200D", "\u00AD", "\u200E", "\uFEFF" })
            Assert.Near(ab, StrokeFont.Measure("A" + hidden + "B", 22), 1e-9, $"U+{(int)hidden[0]:X4}");
    }

    [Test]
    public void Stacked_and_attached_marks_are_drawn()
    {
        Assert.True(StrokeFont.PathData("ể", 0, 30, 44).Length > StrokeFont.PathData("ê", 0, 30, 44).Length);
        Assert.True(StrokeFont.PathData("ơ", 0, 30, 44).Length > StrokeFont.PathData("o", 0, 30, 44).Length);
        Assert.True(StrokeFont.PathData("ą", 0, 30, 44).Length > StrokeFont.PathData("a", 0, 30, 44).Length);
        Assert.Near(StrokeFont.Measure("ą", 44), StrokeFont.Measure("a", 44), 1e-9); // marks never change the advance
    }

    [Test]
    public void Fit_and_ellipsize_respect_the_width()
    {
        var size = StrokeFont.FitSize("SPEAKERS", 112, 22, 12);
        Assert.True(StrokeFont.Measure("SPEAKERS", size) <= 112.01);
        var cut = StrokeFont.Ellipsize("A VERY LONG PLAYLIST NAME", 100, 16);
        Assert.True(cut.EndsWith('…'));
        Assert.True(StrokeFont.Measure(cut, 16) <= 100.01);
    }
}
