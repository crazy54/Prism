using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Smart.Control;

namespace PrismControl.Smart.Art;

/// <summary>
/// The pairing prompt on the top-left Smart Key (SD2): a glowing warn-hue ring, "ALLOW AI?", the 4-digit code, "HOLD TO
/// ALLOW" and the hold ring filling over 1.5 s. It never shows the name the assistant gave itself (the PI quotes it).
/// Qt-safe like the rest of Smart Art: SvgDocument, stroke-font text, hex colors.
/// </summary>
public static class PairArt
{
    private const double S = Refraction.Deck.KeySize;

    public static SvgDocument Key(RefractionPalette t, PairPrompt p)
    {
        var d = KeyArt.Base(t);
        // A warm wash rising from the bottom: the key reads as "asking", not as one of the app's verbs.
        var wash = d.RadialGradient(S / 2, S, S * 0.8, [(0, t.Warn, 0.2), (1, t.Warn, 0)], userSpace: true);
        d.Rect(0, 0, S, S, wash);
        const double inset = 5, r = 10, side = S - 2 * inset;
        var len = 4 * (side - 2 * r) + 2 * Math.PI * r;
        // The glow: the warn ring, always on while the prompt is up.
        d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.Warn, 0.85), StrokeWidth = 4, Filter = d.Glow(3) }, rx: r);
        if (p.Progress > 0.001)
            d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = t.Pos, StrokeWidth = 6, Dash = [Math.Max(0.1, len * p.Progress), len], LineCap = LineCap.Round, Filter = d.Glow(2) }, rx: r);
        d.Text("ALLOW AI?", S / 2, 29, Refraction.Deck.MicroSize, t.Warn, TextAlign.Middle, FontWeight.Bold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        var code = p.Code.Length == 4 ? p.Code : "----";
        d.Text(code, S / 2, 76, 40, t.KeyInk, TextAlign.Middle, FontWeight.Bold, baseline: TextBaseline.Middle, tracking: 0.06);
        var bottom = p.Progress > 0.001 ? "KEEP HOLDING" : "HOLD TO ALLOW";
        var bs = StrokeFont.FitSize(bottom, S - 26, Refraction.Deck.MicroSize, 11, FontWeight.Semibold, Refraction.Deck.MicroTrackingEm, TextCase.Upper);
        d.Text(bottom, S / 2, 112, bs, p.Progress > 0.001 ? t.Pos : t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        var secs = ((int)Math.Ceiling(p.SecondsLeft)).ToString(CultureInfo.InvariantCulture) + " S";
        d.Text(secs, S / 2, 129, 12, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        return d;
    }
}
