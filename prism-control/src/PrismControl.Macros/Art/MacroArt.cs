using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Macros.Engine;

namespace PrismControl.Macros.Art;

/// <summary>Why a key shows <see cref="MacroArt.Notice"/> instead of its normal face.</summary>
public enum NoticeKind
{
    /// <summary>A launch step is not trusted on this PC yet.</summary>
    Review,
    /// <summary>A step cannot run as saved (an imported value is missing or invalid).</summary>
    Fix,
    /// <summary>A launch that always asks first: the next press within the window runs it.</summary>
    Confirm,
}

/// <summary>
/// Key and dial faces for the macro actions, built on the designer's KeyArt/DialArt grammar (material, lit edge, hue index).
/// Placeholder layout for wave 1; the designer restyles it in wave 2 (keep the method signatures or update the callers).
/// </summary>
public static class MacroArt
{
    private const double S = KeyArt.Size;

    public static SpectrumColor Hue(RefractionPalette t) => Hues.For(t, "macros");

    /// <summary>A glyph (64-unit box) with a label under it. <paramref name="dim"/> = not set up yet.</summary>
    public static SvgDocument GlyphKey(RefractionPalette t, Action<SvgDocument, Color> glyph, string? label, bool on = false, bool dim = false)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on);
        var ink = dim ? t.KeyMuted : on ? hue.Ink : t.KeyInk;
        using (d.Group(Transform.Translate(40, label is null ? 34 : 22), opacity: dim ? 0.55 : null))
            glyph(d, ink);
        if (label is not null) Label(d, t, label, 112, t.KeyMuted);
        KeyArt.HueIndex(d, hue, on);
        return d;
    }

    /// <summary>A hotkey: the modifiers on a small line, the key large under them ("CTRL+SHIFT" / "T").</summary>
    public static SvgDocument ChordKey(RefractionPalette t, KeyChord chord, string? label)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue);
        var mods = chord.ModifiersText.ToUpperInvariant();
        var key = chord.Key?.Name.ToUpperInvariant() ?? "";
        if (key.Length == 0)
        {
            // Modifiers only ("WIN"): they become the big text.
            key = mods;
            mods = "";
        }
        double modsY = 46, keyY = 86, keyMax = Refraction.Deck.ValueSize;
        if (!string.IsNullOrWhiteSpace(label))
        {
            Label(d, t, label, 28, t.KeyMuted, size: 18);
            modsY = 60;
            keyY = 94;
            keyMax = 36;
        }
        if (mods.Length > 0)
        {
            var ms = StrokeFont.FitSize(mods, S - 28, Refraction.Deck.LabelSize, 16);
            d.Text(StrokeFont.Ellipsize(mods, S - 28, ms), S / 2, modsY, ms, t.KeyMuted, TextAlign.Middle, textCase: TextCase.Upper);
        }
        else keyY -= 8;
        var ks = StrokeFont.FitSize(key, S - 24, keyMax, 18, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm, TextCase.Upper);
        d.Text(StrokeFont.Ellipsize(key, S - 24, ks, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm, TextCase.Upper), S / 2, keyY, ks, t.KeyInk, TextAlign.Middle, FontWeight.Semibold,
            TextBaseline.Middle, Refraction.Deck.ValueTrackingEm, TextCase.Upper);
        KeyArt.HueIndex(d, hue, false);
        return d;
    }

    /// <summary>
    /// The running face: lit material, step "2/5", a progress bar, and the hue index pulsing with <paramref name="beat"/>.
    /// </summary>
    public static SvgDocument Running(RefractionPalette t, string label, int stepIndex, int stepCount, bool beat)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on: true);
        Label(d, t, label, 38, t.KeyMuted);
        var step = Math.Clamp(stepIndex + 1, 1, Math.Max(1, stepCount));
        var value = stepCount > 1 ? string.Create(CultureInfo.InvariantCulture, $"{step}/{stepCount}") : "RUN";
        var vs = StrokeFont.FitSize(value, S - 28, Refraction.Deck.ValueSize, 24);
        d.Text(value, S / 2, 78, vs, hue.Ink, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        const double mx = 28, mw = S - 56, my = 106;
        d.Rect(mx, my, mw, 4, t.Panel2, rx: 2);
        var f = stepCount > 0 ? (double)step / stepCount : 1;
        d.Rect(mx, my, Math.Max(4, mw * f), 4, hue.Vivid, rx: 2);
        KeyArt.HueIndex(d, hue, beat);
        return d;
    }

    /// <summary>
    /// A key that needs the user before it runs, drawn once (no animation): <see cref="NoticeKind.Review"/> "REVIEW / IN
    /// SETTINGS" (a launch step not trusted on this PC), <see cref="NoticeKind.Fix"/> "FIX / IN SETTINGS" (a step that cannot
    /// run as saved), <see cref="NoticeKind.Confirm"/> "PRESS AGAIN" (a launch that always asks first; <paramref name="detail"/>
    /// names it).
    /// </summary>
    public static SvgDocument Notice(RefractionPalette t, NoticeKind kind, string? detail = null)
    {
        var hue = Hue(t);
        var confirm = kind == NoticeKind.Confirm;
        var d = KeyArt.Base(t, hue, on: confirm);
        var ink = confirm ? hue.Ink : t.Warn;
        Action<SvgDocument, Color> glyph = kind switch
        {
            NoticeKind.Review => MacroGlyphs.Shield,
            NoticeKind.Fix => MacroGlyphs.Caution,
            _ => MacroGlyphs.Launch,
        };
        using (d.Group(Transform.Translate(50, 12).Then(Transform.Scale(44.0 / 64))))
            glyph(d, ink);
        var (big, small) = kind switch
        {
            NoticeKind.Review => ("REVIEW", "IN SETTINGS"),
            NoticeKind.Fix => ("FIX", "IN SETTINGS"),
            _ => ("PRESS AGAIN", string.IsNullOrWhiteSpace(detail) ? "TO RUN IT" : detail),
        };
        var bs = StrokeFont.FitSize(big, S - 28, 30, 18, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm, TextCase.Upper);
        d.Text(StrokeFont.Ellipsize(big, S - 28, bs, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm, TextCase.Upper), S / 2, 80, bs, confirm ? hue.Ink : t.KeyInk,
            TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm, TextCase.Upper);
        Label(d, t, small, 110, t.KeyMuted, size: 18);
        KeyArt.HueIndex(d, hue, confirm);
        return d;
    }

    /// <summary>
    /// The macro dial (200×100, the same frame on the Stream Deck + strip and a Galleon widget): label, what a turn right
    /// and left does, and what a push does. <paramref name="lastDirection"/> lights the row that just ran.
    /// </summary>
    public static SvgDocument Dial(RefractionPalette t, string label, string? right, string? left, string? push, int lastDirection, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        const double x0 = 16, w = DialArt.W - 32;
        d.Text(StrokeFont.Ellipsize(label.ToUpperInvariant(), w, Refraction.Deck.DialLabelSize, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper),
            x0, 22, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        if (right is null && left is null && push is null)
        {
            d.Text("SET UP IN THE EDITOR", DialArt.W / 2, 62, 16, t.KeyMuted, TextAlign.Middle, textCase: TextCase.Upper);
            return d;
        }
        Row(d, t, hue, "→", right, 46, lastDirection > 0 && active);
        Row(d, t, hue, "←", left, 68, lastDirection < 0 && active);
        Row(d, t, hue, "PUSH", push, 90, false);
        return d;
    }

    private static void Row(SvgDocument d, RefractionPalette t, SpectrumColor hue, string tag, string? text, double y, bool lit)
    {
        const double x0 = 16, textX = 62, maxW = DialArt.W - textX - 14;
        var tagSize = tag.Length > 1 ? 13 : 18;
        d.Text(tag, x0, y, tagSize, lit ? hue.Ink : t.KeyMuted, TextAlign.Start, FontWeight.Semibold, textCase: TextCase.Upper);
        var value = string.IsNullOrWhiteSpace(text) ? "–" : text.ToUpperInvariant();
        var size = StrokeFont.FitSize(value, maxW, 17, 12, FontWeight.Semibold, 0, TextCase.Upper);
        d.Text(StrokeFont.Ellipsize(value, maxW, size, textCase: TextCase.Upper), textX, y, size, lit ? hue.Ink : t.KeyInk, TextAlign.Start, FontWeight.Semibold,
            textCase: TextCase.Upper, filter: lit ? d.Glow(1.5) : null);
    }

    private static void Label(SvgDocument d, RefractionPalette t, string label, double y, Color color, double size = Refraction.Deck.LabelSize)
    {
        var text = label.Trim().ToUpperInvariant();
        if (text.Length == 0) return;
        var fs = StrokeFont.FitSize(text, S - 32, size, 16, FontWeight.Semibold);
        d.Text(StrokeFont.Ellipsize(text, S - 32, fs), S / 2, y, fs, color, TextAlign.Middle, FontWeight.Semibold);
    }
}

/// <summary>Glyphs in a 64-unit box (no logos). Candidates for the designer's Core/Art Glyphs.</summary>
public static class MacroGlyphs
{
    /// <summary>A step list with a play triangle (Macro key).</summary>
    public static void Macro(SvgDocument d, Color c)
    {
        var lines = new PathBuilder().MoveTo(6, 14).LineTo(34, 14).MoveTo(6, 32).LineTo(28, 32).MoveTo(6, 50).LineTo(34, 50);
        d.Path(lines, Style.Stroked(c, 5));
        d.Path(new PathBuilder().MoveTo(40, 18).LineTo(60, 32).LineTo(40, 46).Close(), new Style { Fill = c, LineJoin = LineJoin.Round });
    }

    /// <summary>A keycap (Hotkey, not set up yet).</summary>
    public static void Keycap(SvgDocument d, Color c)
    {
        d.Path(new PathBuilder().RoundedRect(6, 8, 52, 48, 9), Style.Stroked(c, 4.5));
        d.Path(new PathBuilder().MoveTo(20, 42).LineTo(44, 42), Style.Stroked(c, 4.5));
    }

    /// <summary>A capital T and a text caret (Type text).</summary>
    public static void Text(SvgDocument d, Color c)
    {
        d.Path(new PathBuilder().MoveTo(6, 12).LineTo(42, 12).MoveTo(24, 12).LineTo(24, 54), Style.Stroked(c, 6));
        d.Path(new PathBuilder().MoveTo(54, 8).LineTo(54, 58).MoveTo(48, 8).LineTo(60, 8).MoveTo(48, 58).LineTo(60, 58), Style.Stroked(c, 3.5));
    }

    /// <summary>An arrow leaving a box (Launch app / open URL).</summary>
    public static void Launch(SvgDocument d, Color c)
    {
        var box = new PathBuilder().MoveTo(28, 10).LineTo(14, 10).QuadTo(8, 10, 8, 16).LineTo(8, 50).QuadTo(8, 56, 14, 56)
            .LineTo(48, 56).QuadTo(54, 56, 54, 50).LineTo(54, 36);
        d.Path(box, Style.Stroked(c, 4.5) with { LineJoin = LineJoin.Round });
        d.Path(new PathBuilder().MoveTo(30, 34).LineTo(56, 8).MoveTo(38, 8).LineTo(56, 8).LineTo(56, 26), Style.Stroked(c, 4.5) with { LineJoin = LineJoin.Round });
    }

    /// <summary>A shield with an exclamation mark (a launch to review before it may run).</summary>
    public static void Shield(SvgDocument d, Color c)
    {
        var shield = new PathBuilder().MoveTo(32, 4).LineTo(56, 13).LineTo(56, 30).CubicTo(56, 45, 46, 55, 32, 60).CubicTo(18, 55, 8, 45, 8, 30).LineTo(8, 13).Close();
        d.Path(shield, Style.Stroked(c, 4.5) with { LineJoin = LineJoin.Round });
        d.Path(new PathBuilder().MoveTo(32, 20).LineTo(32, 36), Style.Stroked(c, 5));
        d.Circle(32, 46, 3.2, c);
    }

    /// <summary>A warning triangle (a step that cannot run as saved).</summary>
    public static void Caution(SvgDocument d, Color c)
    {
        d.Path(new PathBuilder().MoveTo(32, 6).LineTo(60, 56).LineTo(4, 56).Close(), Style.Stroked(c, 4.5) with { LineJoin = LineJoin.Round });
        d.Path(new PathBuilder().MoveTo(32, 24).LineTo(32, 38), Style.Stroked(c, 5));
        d.Circle(32, 47, 3.2, c);
    }

    public static void Media(SvgDocument d, Color c, MediaKey key)
    {
        var fill = new Style { Fill = c, LineJoin = LineJoin.Round };
        switch (key)
        {
            case MediaKey.PlayPause:
                d.Path(new PathBuilder().MoveTo(6, 12).LineTo(32, 32).LineTo(6, 52).Close(), fill);
                d.Path(new PathBuilder().Rect(40, 14, 6, 36).Rect(52, 14, 6, 36), fill);
                break;
            case MediaKey.Next:
                d.Path(new PathBuilder().MoveTo(4, 14).LineTo(26, 32).LineTo(4, 50).Close().MoveTo(26, 14).LineTo(48, 32).LineTo(26, 50).Close().Rect(50, 14, 6, 36), fill);
                break;
            case MediaKey.Previous:
                d.Path(new PathBuilder().MoveTo(60, 14).LineTo(38, 32).LineTo(60, 50).Close().MoveTo(38, 14).LineTo(16, 32).LineTo(38, 50).Close().Rect(8, 14, 6, 36), fill);
                break;
            case MediaKey.Stop:
                d.Path(new PathBuilder().RoundedRect(14, 14, 36, 36, 4), fill);
                break;
            default:
                Speaker(d, c);
                var mark = key switch
                {
                    MediaKey.VolumeUp => new PathBuilder().MoveTo(42, 32).LineTo(60, 32).MoveTo(51, 23).LineTo(51, 41),
                    MediaKey.VolumeDown => new PathBuilder().MoveTo(42, 32).LineTo(60, 32),
                    _ => new PathBuilder().MoveTo(43, 24).LineTo(59, 40).MoveTo(59, 24).LineTo(43, 40),
                };
                d.Path(mark, Style.Stroked(c, 4.5));
                break;
        }
    }

    private static void Speaker(SvgDocument d, Color c) =>
        d.Path(new PathBuilder().MoveTo(4, 24).LineTo(14, 24).LineTo(30, 10).LineTo(30, 54).LineTo(14, 40).LineTo(4, 40).Close(), new Style { Fill = c, LineJoin = LineJoin.Round });
}
