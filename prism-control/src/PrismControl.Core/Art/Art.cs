using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Core.Art;

// OWNER: visual designer. These are starting-point helpers that follow the deck grammar in tokens.json
// (material fill, lit top edge, hue index bar, value/label type sizes). Replace freely; keep the signatures
// or update the callers in the domain sample actions.

/// <summary>
/// Each domain owns one position on the Refraction spectrum, the way each Prism surface and gallery owns one hue.
/// <para>
/// Six domains, six hue families, every pair at least two stops apart (0 · 2 · 4 · 6 · 9 · 11 of the 12-stop ramp):
/// violet, azure, cyan, jade, amber, rose read as purple, blue, teal, green, orange and pink on a key, Night and Day.
/// Citrine (8) and coral (10) stay free because they are the warn and neg status colors (alerts, mute).
/// Rose sits next to crit, so alerts never rely on color: they always add the ring and the corner notch.
/// The exe's own actions (core) and unknown domains wear "white light" (unrefracted, like Prism's app pages: D65).
/// </para>
/// assets/src/build-icons.mjs reads <see cref="Index"/> from this file, so the manifest key images match the runtime art.
/// </summary>
public static class Hues
{
    public static SpectrumColor For(RefractionPalette t, string domain) => Index(domain) is { } i ? t.Spectrum[i] : White(t);

    /// <summary>The spectrum stop a domain owns, or null for white light.</summary>
    public static int? Index(string domain) => domain switch
    {
        "macros" => 0,   // violet λ 436: Prism's home violet, the do-anything domain
        "cooling" => 2,  // azure λ 479: cold blue
        "audio" => 4,    // cyan λ 492
        "system" => 6,   // jade λ 554
        "eq" => 9,       // amber λ 585
        "spotify" => 11, // rose λ 494c: the heart of the music keys, and far from any brand green
        _ => null,       // core (diagnostics) and anything unmapped
    };

    /// <summary>White light: each mode's unrefracted ink, labeled with its illuminant (D65) instead of a λ.</summary>
    public static SpectrumColor White(RefractionPalette t) => t.IsDark ? NightWhite : DayWhite;

    private static readonly SpectrumColor NightWhite = new("white", 0, "D65", new Color(0xf0, 0xf0, 0xf5), new Color(0xf6, 0xf3, 0xff),
        Paint.Solid(new Color(0xf6, 0xf3, 0xff), 0.1), null);
    private static readonly SpectrumColor DayWhite = new("white", 0, "D65", new Color(0x20, 0x20, 0x2e), new Color(0x55, 0x55, 0x6a),
        Paint.Solid(new Color(0xec, 0xeb, 0xf3)), null);
}

/// <summary>Key art on the 144-unit square canvas.</summary>
public static class KeyArt
{
    public const double Size = Refraction.Deck.KeySize;

    /// <summary>The key body: material radial fill (lit from the top center) and the 2 px lit top edge.</summary>
    public static SvgDocument Base(RefractionPalette t, SpectrumColor? hue = null, bool on = false)
    {
        var d = SvgDocument.Key();
        var fill = d.RadialGradient(Size / 2, 0, Size * 1.2, t.KeyMaterial, userSpace: true,
            transform: Transform.Translate(Size / 2, 0).Scale2(1).Then(Transform.Scale(1, 0.75)).Then(Transform.Translate(-Size / 2, 0)));
        d.Rect(0, 0, Size, Size, fill);
        if (on && hue is not null)
        {
            // On: a hue wash rising from the bottom (22%) and a 3 px inner ring in the hue.
            var wash = d.RadialGradient(Size / 2, Size, Size * 0.7, [(0, hue.Vivid, 0.22), (1, hue.Vivid, 0)], userSpace: true);
            d.Rect(0, 0, Size, Size, wash);
            d.Rect(1.5, 1.5, Size - 3, Size - 3, new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 3 }, rx: 6);
        }
        d.Rect(0, 0, Size, 2, t.KeyEdge);
        return d;
    }

    /// <summary>The spectral index: a 4×32 bar centered 12 units above the bottom (45% when off, full + glow when on).</summary>
    public static void HueIndex(SvgDocument d, SpectrumColor hue, bool on)
    {
        const double w = 32, h = 4;
        var x = (Size - w) / 2;
        var y = Size - 12 - h / 2;
        if (on)
        {
            var glow = d.Glow(3);
            d.Rect(x, y, w, h, new Style { Fill = hue.Vivid, Filter = glow }, rx: h / 2);
        }
        else d.Rect(x, y, w, h, hue.Vivid.WithOpacity(0.45), rx: h / 2);
    }

    /// <summary>A label + big value key (stats, levels). <paramref name="fraction"/> draws a thin meter above the index.</summary>
    public static SvgDocument Value(RefractionPalette t, string label, string value, SpectrumColor hue, double? fraction = null, bool on = false)
    {
        var d = Base(t, hue, on);
        var labelSize = StrokeFont.FitSize(label, Size - 32, Refraction.Deck.LabelSize, 16, FontWeight.Semibold);
        d.Text(label, Size / 2, 38, labelSize, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold);
        var valueSize = StrokeFont.FitSize(value, Size - 28, Refraction.Deck.ValueSize, 24, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
        d.Text(value, Size / 2, 80, valueSize, on ? hue.Ink : t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        if (fraction is { } f)
        {
            const double mx = 24, mw = Size - 48, my = 108;
            d.Rect(mx, my, mw, 4, t.Panel2, rx: 2);
            d.Rect(mx, my, Math.Max(4, mw * Math.Clamp(f, 0, 1)), 4, hue.Vivid, rx: 2);
        }
        HueIndex(d, hue, on);
        return d;
    }

    /// <summary>
    /// A key wearing a glyph of the icon family (<see cref="Icons"/>, e.g. "spotify.like"). Without a label it is exactly
    /// the action's manifest key image (72-unit glyph box, optically centered); with a label the glyph shrinks to 56 units
    /// and the label sits above the index.
    /// </summary>
    public static SvgDocument Icon(RefractionPalette t, string iconId, SpectrumColor hue, string? label = null, bool on = false)
    {
        var d = Base(t, hue, on);
        var glyph = Icons.Get(iconId);
        if (label is null) Icons.DrawOnKey(d, glyph, t, hue, 36, 30, 72, on);
        else
        {
            Icons.DrawOnKey(d, glyph, t, hue, 44, 20, 56, on);
            var size = StrokeFont.FitSize(label, Size - 32, Refraction.Deck.LabelSize, 16);
            d.Text(label, Size / 2, 108, size, t.KeyMuted, TextAlign.Middle);
        }
        HueIndex(d, hue, on);
        return d;
    }

    /// <summary>A glyph key: a centered icon path (drawn in a 64-unit box) plus an optional label.</summary>
    public static SvgDocument Glyph(RefractionPalette t, Action<SvgDocument, Color> drawGlyph, string? label, SpectrumColor hue, bool on = false)
    {
        var d = Base(t, hue, on);
        using (d.Group(Transform.Translate(40, label is null ? 34 : 24)))
            drawGlyph(d, on ? hue.Ink : t.KeyInk);
        if (label is not null)
        {
            var size = StrokeFont.FitSize(label, Size - 32, Refraction.Deck.LabelSize, 16);
            d.Text(label, Size / 2, 114, size, t.KeyMuted, TextAlign.Middle);
        }
        HueIndex(d, hue, on);
        return d;
    }
}

/// <summary>Dial / Galleon widget art on the 200×100 canvas.</summary>
public static class DialArt
{
    public const double W = Refraction.Deck.DialWidth;
    public const double H = Refraction.Deck.DialHeight;

    public static SvgDocument Base(RefractionPalette t, SpectrumColor? hue = null, bool active = false)
    {
        var d = SvgDocument.Dial();
        var fill = d.LinearGradient(0, 0, 0, H, [(0, t.KeyMaterial[0].Color), (1, t.KeyMaterial[^1].Color)], userSpace: true);
        d.Rect(0, 0, W, H, fill);
        if (active && hue is not null)
        {
            var wash = d.RadialGradient(W / 2, H, W * 0.6, [(0, hue.Vivid, 0.18), (1, hue.Vivid, 0)], userSpace: true);
            d.Rect(0, 0, W, H, wash);
        }
        d.Rect(0, 0, W, 2, t.KeyEdge);
        return d;
    }

    /// <summary>Label (top-left), value (left, large) and a horizontal meter with the hue.</summary>
    public static SvgDocument Meter(RefractionPalette t, string label, string value, double fraction, SpectrumColor hue, bool active = false)
    {
        var d = Base(t, hue, active);
        d.Text(label, 16, 24, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        var size = StrokeFont.FitSize(value, W - 32, Refraction.Deck.DialValueSize, 18);
        d.Text(value, 16, 64, size, active ? hue.Ink : t.KeyInk, TextAlign.Start, FontWeight.Semibold);
        const double mx = 16, mw = W - 32, my = 80, mh = 6;
        d.Rect(mx, my, mw, mh, t.Panel2, rx: mh / 2);
        var f = Math.Clamp(fraction, 0, 1);
        if (f > 0)
        {
            var grad = d.LinearGradient(mx, 0, mx + mw, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true);
            var style = new Style { Fill = grad, Filter = active ? d.Glow(2.5) : null };
            d.Rect(mx, my, Math.Max(mh, mw * f), mh, style, rx: mh / 2);
        }
        return d;
    }
}

/// <summary>Simple vector glyphs drawn in a 64-unit box (no trademarked logos).</summary>
public static class Glyphs
{
    /// <summary>A generic beamed music note (never the Spotify logo).</summary>
    public static void MusicNote(SvgDocument d, Color color)
    {
        var p = new PathBuilder()
            .MoveTo(22, 46).LineTo(22, 10).LineTo(54, 4).LineTo(54, 40);
        d.Path(p, Style.Stroked(color, 5) with { LineJoin = LineJoin.Round });
        d.Ellipse(15, 47, 8.5, 7, new Style { Fill = color, Transform = Transform.Rotate(-18, 15, 47) });
        d.Ellipse(47, 41, 8.5, 7, new Style { Fill = color, Transform = Transform.Rotate(-18, 47, 41) });
    }

    public static void Speaker(SvgDocument d, Color color, int waves = 2)
    {
        var body = new PathBuilder().MoveTo(6, 24).LineTo(18, 24).LineTo(32, 10).LineTo(32, 54).LineTo(18, 40).LineTo(6, 40).Close();
        d.Path(body, new Style { Fill = color });
        var arcs = new PathBuilder();
        for (var i = 0; i < waves; i++) arcs.Arc(32, 32, 12 + i * 10, -40, 40);
        d.Path(arcs, Style.Stroked(color, 4.5));
    }

    public static void Sliders(SvgDocument d, Color color)
    {
        var p = new PathBuilder();
        foreach (var x in new[] { 14.0, 32, 50 }) p.MoveTo(x, 6).LineTo(x, 58);
        d.Path(p, Style.Stroked(color, 4) with { Opacity = 0.5 });
        var knobs = new PathBuilder().Circle(14, 40, 6).Circle(32, 20, 6).Circle(50, 34, 6);
        d.Path(knobs, new Style { Fill = color });
    }

    public static void Bolt(SvgDocument d, Color color)
    {
        var p = new PathBuilder().MoveTo(36, 4).LineTo(12, 36).LineTo(30, 36).LineTo(26, 60).LineTo(52, 26).LineTo(34, 26).Close();
        d.Path(p, new Style { Fill = color });
    }
}
