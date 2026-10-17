using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Eq.Sonar;

namespace PrismControl.Eq;

/// <summary>How the active band is marked on a dial frame.</summary>
public enum BandMark
{
    /// <summary>Band dial: filled marker, the band's own bell washed in the hue.</summary>
    Lit,
    /// <summary>Band browser while picking: a ring only (turning moves it, nothing is written).</summary>
    Pick,
    /// <summary>Band browser while adjusting: like <see cref="Lit"/>.</summary>
    Adjust,
}

/// <summary>Everything a band frame shows.</summary>
public sealed record BandFrame(
    string Channel,
    EqState State,
    EqTarget Target,
    BandMark Mark = BandMark.Lit,
    bool Active = false,
    string? Chip = null,
    bool ChipFilled = false,
    string? Warning = null);

/// <summary>
/// EQ frames in the Refraction look, drawn only through <see cref="SvgDocument"/>: the curve is the RBJ biquad sum of
/// the enabled filters and tone knobs (one path of 72 points), the active band is lit, text is stroked paths.
/// Dials are 200×100 (Stream Deck + strip segment, Galleon widget at ~360×180); keys are 144×144. Every frame stays
/// well under 100 elements.
/// </summary>
public static class EqArt
{
    // Dial curve box.
    private const double X0 = 12, X1 = 188, CurveTop = 31, CurveBottom = 81;
    private const double Mid = (CurveTop + CurveBottom) / 2;
    private const double DbSpan = 13; // ±13 dB fills the box (±12 is the Sonar range)
    private const int Points = 72;

    public static SpectrumColor Hue(RefractionPalette t) => Hues.For(t, "eq");

    // ------------------------------------------------------------------ dials

    public static SvgDocument BandDial(RefractionPalette t, BandFrame f)
    {
        var hue = Hue(t);
        var s = f.State;
        var lit = f.Active || f.Mark == BandMark.Adjust;
        var d = DialArt.Base(t, hue, lit);
        var on = s.Enabled;
        var band = s.Band(f.Target.Band);
        var targetOn = on && (f.Target.IsKnob || band?.Enabled == true);

        DrawGrid(d, t);
        // The active band's own response, washed in the hue (not while just picking).
        var targetHz = EqMath.TargetHz(s, f.Target);
        var tx = X(targetHz);
        if (targetOn && f.Mark != BandMark.Pick && f.Target.Knob != EqKnob.Preamp)
        {
            var wash = new PathBuilder().MoveTo(X0, Mid);
            foreach (var hz in EqMath.LogFrequencies(Points)) wash.LineTo(X(hz), Y(EqMath.TargetDb(s, f.Target, hz)));
            wash.LineTo(X1, Mid).Close();
            d.Path(wash, new Style { Fill = hue.Vivid.WithOpacity(lit ? 0.26 : 0.16) });
        }
        // Guide at the band's frequency.
        if (f.Target.Knob != EqKnob.Preamp)
            d.Line(tx, CurveTop - 2, tx, CurveBottom + 2, hue.Vivid.WithOpacity(f.Mark == BandMark.Pick ? 0.5 : 0.35), 1, LineCap.Butt);

        // The summed curve.
        var curve = new PathBuilder();
        var first = true;
        foreach (var hz in EqMath.LogFrequencies(Points))
        {
            var (x, y) = (X(hz), Y(EqMath.TotalDb(s, hz)));
            if (first) { curve.MoveTo(x, y); first = false; } else curve.LineTo(x, y);
        }
        if (on) d.Path(curve, Style.Stroked(hue.Vivid, 2.4) with { Filter = lit ? d.Glow(1.6) : null });
        else d.Path(curve, Style.Stroked(t.KeyMuted, 1.6) with { Dash = [3, 3], Opacity = 0.7 });

        // Other bands: small dots on the curve (disabled ones are not drawn).
        var dots = new PathBuilder();
        foreach (var b in s.Bands)
        {
            if (!b.Enabled || (!f.Target.IsKnob && b.Index == f.Target.Band)) continue;
            dots.Circle(X(b.FrequencyHz), Y(EqMath.TotalDb(s, b.FrequencyHz)), 2.1);
        }
        if (!dots.IsEmpty) d.Path(dots, new Style { Fill = t.KeyMuted, Opacity = on ? 0.75 : 0.4 });

        // The active marker.
        if (f.Target.Knob != EqKnob.Preamp)
        {
            var ty = Y(EqMath.TotalDb(s, targetHz));
            if (f.Mark == BandMark.Pick)
                d.Circle(tx, ty, 4.6, Style.Stroked(hue.Ink, 2));
            else if (targetOn)
                d.Circle(tx, ty, 4.4, new Style { Fill = hue.Ink, Filter = lit ? d.Glow(2.2) : null });
            else
                d.Circle(tx, ty, 4.2, Style.Stroked(t.KeyMuted, 1.6));
        }

        // Header: the band (left) and its gain (right); the footer carries channel · preset.
        var gain = s.Gain(f.Target) ?? 0;
        var bandOff = !f.Target.IsKnob && band?.Enabled == false;
        var value = bandOff ? "BYPASSED" : EqMath.FormatDb(gain);
        const double valueSize = 20;
        var valueW = StrokeFont.Measure(value, valueSize, FontWeight.Semibold);
        d.Text(value, X1, 23, valueSize, lit && targetOn ? hue.Ink : t.KeyInk, TextAlign.End, FontWeight.Semibold, opacity: targetOn ? null : 0.6);
        var header = EqMath.TargetLabel(s, f.Target);
        header = StrokeFont.Ellipsize(header, X1 - X0 - valueW - 10, Refraction.Deck.DialLabelSize + 1, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper);
        d.Text(header, X0, 22, Refraction.Deck.DialLabelSize + 1, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);

        var footer = f.Channel + " · " + (s.ActivePreset?.Name ?? "");
        Footer(d, t, hue, footer, s.ModifiedFromDefault, f.Chip ?? (!on ? "EQ OFF" : null), f.ChipFilled, f.Warning);
        return d;
    }

    /// <summary>A dial that cannot work right now (Sonar not running, APO not attached, no such band...).</summary>
    public static SvgDocument OfflineDial(RefractionPalette t, string header, string message, string? detail = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, false);
        DrawGrid(d, t);
        d.Line(X0, Mid, X1, Mid, t.KeyMuted, 1.4, LineCap.Butt, 0.45);
        d.Text(StrokeFont.Ellipsize(header, X1 - X0, Refraction.Deck.DialLabelSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper),
            X0, 21, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        var size = StrokeFont.FitSize(message, X1 - X0, 20, 13, FontWeight.Semibold, textCase: TextCase.Upper);
        // A soft panel behind the message so it reads over the grid.
        var w = Math.Min(X1 - X0, StrokeFont.Measure(message, size, FontWeight.Semibold, textCase: TextCase.Upper) + 20);
        d.Rect(100 - w / 2, Mid - 13, w, 26, new Style { Fill = t.IsDark ? t.BgDeep : t.Panel2, Opacity = 0.92 }, rx: 6);
        d.Text(message, 100, Mid, size, t.Warn, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, textCase: TextCase.Upper);
        if (!string.IsNullOrEmpty(detail))
            d.Text(StrokeFont.Ellipsize(detail, X1 - X0, 13, FontWeight.Medium), X0, 95, 13, t.KeyMuted, TextAlign.Start, FontWeight.Medium);
        return d;
    }

    /// <summary>A Sonar channel volume (0..1).</summary>
    public static SvgDocument VolumeDial(RefractionPalette t, string channel, double volume, bool muted, bool active, string? footer = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active && !muted);
        d.Text(channel + " · VOLUME", 16, 22, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold,
            tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        var pct = Math.Round(Math.Clamp(volume, 0, 1) * 100).ToString("0", System.Globalization.CultureInfo.InvariantCulture) + "%";
        if (muted)
        {
            d.Text("MUTED", 16, 62, 30, t.Neg, TextAlign.Start, FontWeight.Semibold);
            d.Text(pct, 184, 62, 20, t.KeyMuted, TextAlign.End, FontWeight.Semibold);
        }
        else d.Text(pct, 16, 62, Refraction.Deck.DialValueSize, active ? hue.Ink : t.KeyInk, TextAlign.Start, FontWeight.Semibold);
        const double mx = 16, mw = 168, my = 74, mh = 6;
        d.Rect(mx, my, mw, mh, Track(t), rx: mh / 2);
        var f = Math.Clamp(volume, 0, 1);
        if (f > 0)
        {
            var grad = d.LinearGradient(mx, 0, mx + mw, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true);
            d.Rect(mx, my, Math.Max(mh, mw * f), mh, new Style { Fill = grad, Opacity = muted ? 0.3 : null, Filter = active && !muted ? d.Glow(2) : null }, rx: mh / 2);
        }
        if (!string.IsNullOrEmpty(footer))
            d.Text(StrokeFont.Ellipsize(footer, 168, 13, FontWeight.Medium, 0.06, TextCase.Upper), 16, 95, 13, t.KeyMuted, TextAlign.Start, FontWeight.Medium, tracking: 0.06, textCase: TextCase.Upper);
        return d;
    }

    /// <summary>ChatMix: game on the left, chat on the right, a center-zero track.</summary>
    public static SvgDocument ChatMixDial(RefractionPalette t, SonarChatMix cm, bool active, string? note = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active && cm.CanWrite);
        d.Text("CHATMIX", 16, 22, Refraction.Deck.DialLabelSize, t.KeyMuted, TextAlign.Start, FontWeight.Semibold,
            tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        if (!string.IsNullOrEmpty(note)) // e.g. "ON HEADSET": Sonar refuses software ChatMix while a wheel is in charge
        {
            // A warn-outlined status chip (the band dials' chip shape), so the note never runs on from the "CHATMIX"
            // label: it keeps at least 12 units of air and ellipsizes inside the chip when it is too long.
            const double chipPad = 15, chipH = 15, gap = 12, capCenter = 17; // caps of the 14-unit label span y 12..22
            var labelW = StrokeFont.Measure("CHATMIX", Refraction.Deck.DialLabelSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper);
            var room = 184 - (16 + labelW + gap) - chipPad;
            var text = StrokeFont.Ellipsize(note, room, 11, FontWeight.Semibold, 0.08, TextCase.Upper);
            var cw = StrokeFont.Measure(text, 11, FontWeight.Semibold, 0.08, TextCase.Upper) + chipPad;
            d.Rect(184 - cw, capCenter - chipH / 2, cw, chipH, new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 1.2 }, rx: chipH / 2);
            d.Text(text, 184 - cw / 2, capCenter, 11, t.Warn, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.08, TextCase.Upper);
        }
        var ink = active && cm.CanWrite ? hue.Ink : t.KeyInk;
        var g = cm.GamePercent.ToString("0", System.Globalization.CultureInfo.InvariantCulture);
        var c = cm.ChatPercent.ToString("0", System.Globalization.CultureInfo.InvariantCulture);
        d.Text(g, 16, 58, 28, ink, TextAlign.Start, FontWeight.Semibold, opacity: cm.CanWrite || cm.OnHardwareWheel ? null : 0.5);
        d.Text(c, 184, 58, 28, ink, TextAlign.End, FontWeight.Semibold, opacity: cm.CanWrite || cm.OnHardwareWheel ? null : 0.5);
        const double tx0 = 16, tx1 = 184, ty = 72;
        d.Rect(tx0, ty - 2.5, tx1 - tx0, 5, Track(t), rx: 2.5);
        var kx = 100 + Math.Clamp(cm.Balance, -1, 1) * (tx1 - tx0) / 2;
        d.Rect(Math.Min(100, kx), ty - 2.5, Math.Abs(kx - 100), 5, hue.Vivid.WithOpacity(0.75));
        d.Line(100, ty - 6, 100, ty + 6, t.KeyMuted, 1, LineCap.Butt, 0.6);
        d.Circle(kx, ty, 5.5, new Style { Fill = hue.Ink, Filter = active && cm.CanWrite ? d.Glow(2) : null });
        d.Text("GAME", 16, 94, 13, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: 0.08, textCase: TextCase.Upper);
        d.Text("CHAT", 184, 94, 13, t.KeyMuted, TextAlign.End, FontWeight.Semibold, tracking: 0.08, textCase: TextCase.Upper);
        return d;
    }

    // ------------------------------------------------------------------ keys

    /// <summary>A preset key: channel, preset name, and (when it is the live preset) its curve.</summary>
    public static SvgDocument PresetKey(RefractionPalette t, string channel, string name, bool active, EqState? live, string? status = null, bool statusIsError = false)
    {
        var hue = Hue(t);
        const double size = KeyArt.Size;
        var d = KeyArt.Base(t, hue, active);
        d.Text(channel, size / 2, 30, 17, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, tracking: 0.08, textCase: TextCase.Upper);
        var showCurve = active && live is not null && status is null;
        var nameY = showCurve || status is not null ? 62 : 72;
        NameLines(d, t, name, nameY, active ? hue.Ink : t.KeyInk, status is not null && statusIsError ? 0.55 : null);
        if (status is not null)
        {
            var sz = StrokeFont.FitSize(status, size - 28, 17, 13, FontWeight.Semibold, 0.04, TextCase.Upper);
            d.Text(status, size / 2, 108, sz, statusIsError ? t.Neg : t.Warn, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.04, TextCase.Upper);
        }
        else if (showCurve) MiniCurve(d, t, hue, live!, 22, 122, 108, 11, glow: true);
        KeyArt.HueIndex(d, hue, active);
        return d;
    }

    /// <summary>The EQ on/off key for one channel.</summary>
    public static SvgDocument ToggleKey(RefractionPalette t, string channel, string what, bool on, EqState? live, string? status = null)
    {
        var hue = Hue(t);
        const double size = KeyArt.Size;
        var d = KeyArt.Base(t, hue, on && status is null);
        var label = channel + " " + what;
        d.Text(label, size / 2, 30, StrokeFont.FitSize(label, size - 24, 17, 13, FontWeight.Semibold, 0.08, TextCase.Upper), t.KeyMuted, TextAlign.Middle, FontWeight.Semibold,
            tracking: 0.08, textCase: TextCase.Upper);
        if (status is not null)
        {
            d.Text("—", size / 2, 66, 40, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
            var sz = StrokeFont.FitSize(status, size - 28, 17, 13, FontWeight.Semibold, 0.04, TextCase.Upper);
            d.Text(status, size / 2, 106, sz, t.Warn, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.04, TextCase.Upper);
        }
        else
        {
            d.Text(on ? "ON" : "OFF", size / 2, 66, Refraction.Deck.ValueSize, on ? hue.Ink : t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle,
                Refraction.Deck.ValueTrackingEm);
            if (on && live is not null) MiniCurve(d, t, hue, live, 22, 122, 106, 10, glow: false);
            else d.Line(28, 106, 116, 106, t.KeyMuted, 2, LineCap.Round, 0.35);
        }
        KeyArt.HueIndex(d, hue, on && status is null);
        return d;
    }

    // ------------------------------------------------------------------ pieces

    /// <summary>A meter track that shows on both themes (Day's panel2 vanishes on the light material).</summary>
    private static Color Track(RefractionPalette t) => t.IsDark ? t.Panel2 : t.Line;

    private static double X(double hz) => X0 + (X1 - X0) * EqMath.LogPosition(hz);
    private static double Y(double db) => Mid - Math.Clamp(db, -DbSpan * 1.1, DbSpan * 1.1) / DbSpan * ((CurveBottom - CurveTop) / 2);

    private static void DrawGrid(SvgDocument d, RefractionPalette t)
    {
        var grid = new PathBuilder();
        foreach (var hz in new[] { 100.0, 1000, 10000 }) grid.MoveTo(X(hz), CurveTop).LineTo(X(hz), CurveBottom);
        grid.MoveTo(X0, Y(6)).LineTo(X1, Y(6)).MoveTo(X0, Y(-6)).LineTo(X1, Y(-6));
        d.Path(grid, Style.Stroked(t.KeyMuted, 0.8, LineCap.Butt) with { Opacity = t.IsDark ? 0.14 : 0.2 });
        d.Line(X0, Mid, X1, Mid, t.KeyMuted, 1, LineCap.Butt, t.IsDark ? 0.3 : 0.38);
    }

    private static void Footer(SvgDocument d, RefractionPalette t, SpectrumColor hue, string preset, bool modified, string? chip, bool chipFilled, string? warning)
    {
        const double y = 95, size = 13;
        var right = X1;
        if (!string.IsNullOrEmpty(chip))
        {
            var cw = StrokeFont.Measure(chip, 11, FontWeight.Semibold, 0.08, TextCase.Upper) + 12;
            d.Rect(right - cw, y - 11, cw, 15, chipFilled ? new Style { Fill = hue.Vivid } : new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 1.2 }, rx: 7.5);
            d.Text(chip, right - cw / 2, y - 3.5, 11, chipFilled ? (t.IsDark ? t.BgDeep : Color.White) : hue.Ink, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.08, TextCase.Upper);
            right -= cw + 6;
        }
        if (!string.IsNullOrEmpty(warning))
        {
            var ww = StrokeFont.Measure(warning, 11, FontWeight.Semibold, 0.06, TextCase.Upper);
            d.Text(warning, right, y - 3.5, 11, t.Warn, TextAlign.End, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
            right -= ww + 6;
        }
        var label = preset + (modified ? " *" : "");
        if (label.Length > 0 && right - X0 > 24)
            d.Text(StrokeFont.Ellipsize(label, right - X0, size, FontWeight.Medium), X0, y, size, t.KeyMuted, TextAlign.Start, FontWeight.Medium);
    }

    private static void MiniCurve(SvgDocument d, RefractionPalette t, SpectrumColor hue, EqState s, double x0, double x1, double mid, double half, bool glow)
    {
        var p = new PathBuilder();
        var first = true;
        foreach (var hz in EqMath.LogFrequencies(40))
        {
            var x = x0 + (x1 - x0) * EqMath.LogPosition(hz);
            var y = mid - Math.Clamp(EqMath.TotalDb(s, hz), -14, 14) / 13 * half;
            if (first) { p.MoveTo(x, y); first = false; } else p.LineTo(x, y);
        }
        d.Line(x0, mid, x1, mid, t.KeyMuted, 1, LineCap.Butt, 0.25);
        d.Path(p, Style.Stroked(hue.Vivid, 3) with { Filter = glow ? d.Glow(1.5) : null });
    }

    /// <summary>One or two centered lines, fitted to the key.</summary>
    private static void NameLines(SvgDocument d, RefractionPalette t, string name, double centerY, Color color, double? opacity)
    {
        const double max = KeyArt.Size - 24;
        var one = StrokeFont.FitSize(name, max, 26, 18, FontWeight.Semibold);
        if (StrokeFont.Measure(name, one, FontWeight.Semibold) <= max + 0.5 || !name.Contains(' '))
        {
            var sz = StrokeFont.FitSize(name, max, 26, 16, FontWeight.Semibold);
            d.Text(StrokeFont.Ellipsize(name, max, sz, FontWeight.Semibold), KeyArt.Size / 2, centerY, sz, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, opacity: opacity);
            return;
        }
        // Split at the space that best balances the two lines.
        var words = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var best = 1;
        var bestDiff = double.MaxValue;
        for (var i = 1; i < words.Length; i++)
        {
            var a = string.Join(' ', words[..i]);
            var b = string.Join(' ', words[i..]);
            var diff = Math.Abs(StrokeFont.Measure(a, 20) - StrokeFont.Measure(b, 20));
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        var l1 = string.Join(' ', words[..best]);
        var l2 = string.Join(' ', words[best..]);
        var size = Math.Min(StrokeFont.FitSize(l1, max, 22, 16, FontWeight.Semibold), StrokeFont.FitSize(l2, max, 22, 16, FontWeight.Semibold));
        var gap = size * 0.62;
        d.Text(StrokeFont.Ellipsize(l1, max, size, FontWeight.Semibold), KeyArt.Size / 2, centerY - gap, size, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, opacity: opacity);
        d.Text(StrokeFont.Ellipsize(l2, max, size, FontWeight.Semibold), KeyArt.Size / 2, centerY + gap, size, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, opacity: opacity);
    }
}
