using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Desktop;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Glyphs;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Runtime;

namespace PrismControl.Smart.Art;

/// <summary>
/// Smart Key (144 square) and Smart Dial (200×100: the Galleon widget / Stream Deck + strip segment) faces in Prism
/// Control's Refraction grammar: key material, lit edge, the pack's spectral index, Prism Deck glyphs, stroke-font
/// text. Everything goes through SvgDocument (Qt-safe: hex colors, no clipPath, no &lt;text&gt;, ≤ 300 elements).
/// </summary>
public static class SmartArt
{
    private const double S = Refraction.Deck.KeySize;
    private const double W = Refraction.Deck.DialWidth;
    private const double H = Refraction.Deck.DialHeight;
    private const double DimOpacity = 0.36;
    private const double KeyGlyphWeight = 1.15;

    /// <summary>Glyph states that read better than the library default on a plain (non-toggle) verb key.</summary>
    private static readonly Dictionary<string, string> RestState = new(StringComparer.Ordinal) { ["check"] = "done" };

    // ================================================================== keys

    public static SvgDocument Key(RefractionPalette t, SlotView v, GlyphLibrary? glyphs = null)
    {
        glyphs ??= GlyphLibrary.Default;
        var hue = t.Spectrum[Math.Clamp(v.Hue, 0, t.Spectrum.Count - 1)];
        return v.Kind switch
        {
            SlotKind.Verb => VerbKey(t, v, hue, glyphs),
            SlotKind.More => MoreKey(t, v, hue, glyphs),
            SlotKind.Lock => LockKey(t, v, hue, glyphs),
            SlotKind.Readout => ReadoutKey(t, v, hue),
            SlotKind.Idle => IdleKey(t, v),
            _ => EmptyKey(t, hue),
        };
    }

    private static SvgDocument VerbKey(RefractionPalette t, SlotView v, SpectrumColor hue, GlyphLibrary glyphs)
    {
        if (v.Review is { } proposal) return ReviewKey(t, v, hue, glyphs, proposal);
        var a = v.Availability;
        if (!a.Ready && a.Style == "hidden") return Finish(EmptyKey(t, hue), t, v);
        var on = v.IsToggle && v.On == true && a.Ready;
        var d = KeyArt.Base(t, hue, on);
        var dim = !a.Ready && a.Style != "badge";
        var opacity = dim ? DimOpacity : v.StateConfidence == ReadoutConfidence.Stale && v.IsToggle ? 0.55 : 1;
        var eyebrow = v.Eyebrow ?? (!a.Ready ? Eyebrow(a, v.Label) : null);
        if (v.HoldProgress is not null) eyebrow = null;   // the ring draws its own HOLD

        var m = Metrics(v.LabelSize, v.BigIcons, eyebrow is not null || v.HoldProgress is not null);
        var ink = new GlyphInk(on ? hue.Ink : t.KeyInk, on ? hue.Vivid : hue.Ink, t.KeyMuted, hue.Vivid, opacity, KeyGlyphWeight);
        DrawGlyph(d, glyphs, v.Glyph, v.Monogram, v.Label, v.IsToggle ? v.On : null, m.X, m.Y, m.Size, ink);

        if (m.LabelSize > 0)
        {
            var size = StrokeFont.FitSize(v.Label, S - 22, m.LabelSize, 13);
            d.Text(StrokeFont.Ellipsize(v.Label, S - 18, size), S / 2, m.LabelY, size, on ? hue.Ink : t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, opacity: dim ? DimOpacity + 0.2 : null);
        }
        if (eyebrow is not null)
        {
            var color = a.Reason is "sightLost" or "elevated" or "policyBlocked" ? t.Warn : a.Reason == "unbound" ? hue.Ink : t.KeyMuted;
            var es = StrokeFont.FitSize(eyebrow, S - 28, Refraction.Deck.MicroSize, 11, FontWeight.Semibold, Refraction.Deck.MicroTrackingEm, TextCase.Upper);
            d.Text(eyebrow, S / 2, 25, es, color, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        }
        if (a.Style == "badge" && !a.Ready) Notch(d, t.Warn);

        // State: a value badge (non-toggles with a state readout) or the toggle's confidence mark.
        if (v.Badge is { } badge && !dim) Badge(d, t, badge, hue, v.StateConfidence);
        else if (v.IsToggle && a.Ready) ConfidenceMark(d, t, v.On, v.StateConfidence, hue);

        if (v.Safety == Safety.Confirm && a.Ready && v.HoldProgress is null)
            d.Rect(5, 5, S - 10, S - 10, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.Warn, 0.4), StrokeWidth = 2, Dash = [6, 6] }, rx: 10);
        if (v.HoldProgress is { } p) HoldRing(d, t, p, hue);
        if (v.AiBound && !dim && v.HoldProgress is null) AiTag(d, t, hue);
        if (!dim) KeyArt.HueIndex(d, hue, on);
        return Finish(d, t, v);
    }

    /// <summary>"AI": this key's binding is one the user approved from an assistant's proposal (always hold to confirm).</summary>
    private static void AiTag(SvgDocument d, RefractionPalette t, SpectrumColor hue)
    {
        d.Rect(9, 9, 38, 24, new Style { Fill = Paint.Solid(t.Panel2, 0.92), Stroke = Paint.Solid(hue.Vivid, 0.85), StrokeWidth = 2 }, rx: 12);
        d.Text("AI", 28, 21.5, 15, hue.Ink, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, 0.06, TextCase.Upper);
    }

    /// <summary>
    /// A key with an AI proposal waiting (REVIEW, lead decision 2): its glyph and label, a REVIEW band, and nothing runs. While
    /// the user holds it on a physical deck the face shows the proposed key and a ring; a full ring approves.
    /// </summary>
    private static SvgDocument ReviewKey(RefractionPalette t, SlotView v, SpectrumColor hue, GlyphLibrary glyphs, string proposal)
    {
        var d = KeyArt.Base(t, hue);
        if (v.ReviewProgress is { } progress)
        {
            d.Text("NEW KEY", S / 2, 30, Refraction.Deck.MicroSize, t.Warn, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
            var size = StrokeFont.FitSize(proposal, S - 28, 26, 12, FontWeight.Bold);
            d.Text(StrokeFont.Ellipsize(proposal, S - 24, size, FontWeight.Bold), S / 2, 70, size, t.KeyInk, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle);
            d.Text("HOLD TO OK", S / 2, 112, Refraction.Deck.MicroSize, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
            const double inset = 5, r = 10, side = S - 2 * inset;
            var len = 4 * (side - 2 * r) + 2 * Math.PI * r;
            d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.Warn, 0.25), StrokeWidth = 5 }, rx: r);
            if (progress > 0.001)
                d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 5, Dash = [Math.Max(0.1, len * progress), len], LineCap = LineCap.Round }, rx: r);
            return Finish(d, t, v);
        }
        var m = Metrics(v.LabelSize, v.BigIcons, eyebrow: true);
        var ink = new GlyphInk(t.KeyInk, hue.Ink, t.KeyMuted, hue.Vivid, 0.7, KeyGlyphWeight);
        DrawGlyph(d, glyphs, v.Glyph, v.Monogram, v.Label, null, m.X, m.Y, m.Size, ink);
        if (m.LabelSize > 0)
        {
            var size = StrokeFont.FitSize(v.Label, S - 22, m.LabelSize, 13);
            d.Text(StrokeFont.Ellipsize(v.Label, S - 18, size), S / 2, m.LabelY, size, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold);
        }
        // The REVIEW band across the top, in the warn hue, and a dashed warn frame: this key waits for the user.
        d.Rect(5, 5, S - 10, S - 10, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.Warn, 0.7), StrokeWidth = 2, Dash = [6, 6] }, rx: 10);
        d.Rect(26, 12, S - 52, 22, new Style { Fill = Paint.Solid(t.Warn, 0.9) }, rx: 11);
        d.Text("REVIEW", S / 2, 23.5, 13, t.BgDeep, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, 0.08, TextCase.Upper);
        return Finish(d, t, v);
    }

    private readonly record struct KeyMetrics(double X, double Y, double Size, double LabelY, double LabelSize);

    private static KeyMetrics Metrics(string labelSize, bool big, bool eyebrow)
    {
        var (gs, ly, ls) = labelSize switch
        {
            "none" => (82.0, 0.0, 0.0),
            "small" => (66.0, 117.0, 16.0),
            "large" => (46.0, 118.0, 29.0),
            _ => (60.0, 116.0, 21.0),
        };
        if (big) gs += 10;
        if (eyebrow) gs -= 8;
        var top = eyebrow ? 32.0 : ls == 0 ? 10.0 : 12.0;
        var bottom = ls > 0 ? ly - ls * 0.72 - 7 : S - 18;
        var room = bottom - top;
        if (gs > room) gs = room;
        var y = top + Math.Max(0, (room - gs) / 2);
        return new KeyMetrics((S - gs) / 2, y, gs, ly, ls);
    }

    private static void DrawGlyph(SvgDocument d, GlyphLibrary glyphs, string glyph, string? monogram, string label, bool? on, double x, double y, double size, GlyphInk ink)
    {
        if (glyphs.Get(glyph) is { } g)
        {
            var state = on is null && RestState.TryGetValue(glyph, out var rs) ? rs : glyphs.StateFor(g, on);
            glyphs.Draw(d, glyph, state, x, y, size, ink);
        }
        else GlyphLibrary.DrawMonogram(d, GlyphLibrary.MonogramFor(monogram, label), x, y, size, ink);
    }

    private static string? Eyebrow(SlotAvailability a, string verbLabel)
    {
        if (a.Label is { } l && !string.Equals(l, verbLabel, StringComparison.OrdinalIgnoreCase)) return l;
        return a.Reason switch
        {
            "notForeground" => "NOT IN FRONT",
            "sightLost" => "SIGHT",
            "moduleMissing" => "MODULE",
            "notConnected" => "OFFLINE",
            "nothingSelected" => "SELECT",
            "unbound" => "BIND ME",
            "policyBlocked" => "BLOCKED",
            "permissionNeeded" => "ALLOW",
            "busy" => "BUSY",
            "elevated" => "ADMIN",
            _ => null,
        };
    }

    private static void Badge(SvgDocument d, RefractionPalette t, string text, SpectrumColor hue, ReadoutConfidence c)
    {
        const double size = 15;
        var label = (c == ReadoutConfidence.Inferred ? "~" : "") + text;
        var w = Math.Min(S - 24, StrokeFont.Measure(label, size, FontWeight.Semibold, textCase: TextCase.Upper) + 16);
        var x = S - 10 - w;
        d.Rect(x, 10, w, 24, new Style { Fill = Paint.Solid(t.Panel2, 0.9), Stroke = Paint.Solid(hue.Vivid, c == ReadoutConfidence.Stale ? 0.3 : 0.7), StrokeWidth = 1.5 }, rx: 12);
        d.Text(StrokeFont.Ellipsize(label, w - 10, size, textCase: TextCase.Upper), x + w / 2, 22, size, c == ReadoutConfidence.Stale ? t.KeyMuted : t.KeyInk, TextAlign.Middle,
            FontWeight.Semibold, TextBaseline.Middle, textCase: TextCase.Upper);
    }

    /// <summary>Toggle trust: observed = nothing extra; inferred = "~"; stale = a clock; unknown = a dashed dot.</summary>
    private static void ConfidenceMark(SvgDocument d, RefractionPalette t, bool? on, ReadoutConfidence c, SpectrumColor hue)
    {
        const double cx = S - 20, cy = 20;
        switch (on is null ? ReadoutConfidence.Unknown : c)
        {
            case ReadoutConfidence.Observed:
                return;
            case ReadoutConfidence.Inferred:
                d.Text("~", cx, cy, 20, hue.Ink, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle);
                return;
            case ReadoutConfidence.Stale:
                d.Circle(cx, cy, 8, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.KeyMuted, 0.9), StrokeWidth = 2 });
                d.Path(new PathBuilder().MoveTo(cx, cy - 4.5).LineTo(cx, cy).LineTo(cx + 3.5, cy + 2), new Style { Fill = Paint.None, Stroke = t.KeyMuted, StrokeWidth = 2, LineCap = LineCap.Round });
                return;
            default:
                d.Circle(cx, cy, 7, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.KeyMuted, 0.6), StrokeWidth = 1.8, Dash = [3, 3] });
                return;
        }
    }

    private static void Notch(SvgDocument d, Color color) =>
        d.Path(new PathBuilder().MoveTo(S - 30, 0).LineTo(S, 0).LineTo(S, 30).Close(), new Style { Fill = Paint.Solid(color, 0.9) });

    private static void HoldRing(SvgDocument d, RefractionPalette t, double p, SpectrumColor hue)
    {
        // Rounded-rect perimeter at inset 5, radius 10.
        const double inset = 5, r = 10, side = S - 2 * inset;
        var len = 4 * (side - 2 * r) + 2 * Math.PI * r;
        d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.Warn, 0.25), StrokeWidth = 5 }, rx: r);
        if (p > 0.001)
            d.Rect(inset, inset, side, side, new Style { Fill = Paint.None, Stroke = hue.Vivid, StrokeWidth = 5, Dash = [Math.Max(0.1, len * p), len], LineCap = LineCap.Round, Filter = d.Glow(2) }, rx: r);
        d.Text("HOLD", S / 2, 25, Refraction.Deck.MicroSize, t.Warn, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
    }

    private static SvgDocument MoreKey(RefractionPalette t, SlotView v, SpectrumColor hue, GlyphLibrary glyphs)
    {
        var d = KeyArt.Base(t, hue, v.Locked);
        var ink = new GlyphInk(v.Locked ? hue.Ink : t.KeyInk, hue.Ink, t.KeyMuted, hue.Vivid, 1, KeyGlyphWeight);
        var m = Metrics(v.LabelSize == "none" ? "normal" : v.LabelSize, v.BigIcons, eyebrow: true);
        if (!glyphs.Draw(d, v.Locked ? "lock" : "pages", v.Locked ? "locked" : null, m.X, m.Y, m.Size, ink)) GlyphLibrary.DrawMonogram(d, "+", m.X, m.Y, m.Size, ink);
        var label = v.Locked ? "LOCKED" : "MORE";
        d.Text(label, S / 2, m.LabelY, StrokeFont.FitSize(label, S - 24, m.LabelSize > 0 ? m.LabelSize : Refraction.Deck.LabelSize, 13), v.Locked ? hue.Ink : t.KeyMuted, TextAlign.Middle);
        var pages = v.Badge ?? $"{v.Page + 1}/{v.PageCount}";
        d.Text(pages, S / 2, 25, Refraction.Deck.MicroSize, hue.Ink, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        KeyArt.HueIndex(d, hue, v.Locked);
        return Finish(d, t, v);
    }

    private static SvgDocument LockKey(RefractionPalette t, SlotView v, SpectrumColor hue, GlyphLibrary glyphs)
    {
        var d = KeyArt.Base(t, hue, v.Locked);
        var ink = new GlyphInk(v.Locked ? hue.Ink : t.KeyInk, hue.Ink, t.KeyMuted, hue.Vivid, 1, KeyGlyphWeight);
        var m = Metrics(v.LabelSize == "none" ? "normal" : v.LabelSize, v.BigIcons, eyebrow: false);
        if (!glyphs.Draw(d, "lock", v.Locked ? "locked" : "unlocked", m.X, m.Y, m.Size, ink)) GlyphLibrary.DrawMonogram(d, "L", m.X, m.Y, m.Size, ink);
        d.Text(v.Label, S / 2, m.LabelY, StrokeFont.FitSize(v.Label, S - 24, m.LabelSize > 0 ? m.LabelSize : Refraction.Deck.LabelSize, 13), v.Locked ? hue.Ink : t.KeyMuted, TextAlign.Middle);
        KeyArt.HueIndex(d, hue, v.Locked);
        return Finish(d, t, v);
    }

    private static SvgDocument ReadoutKey(RefractionPalette t, SlotView v, SpectrumColor hue)
    {
        var d = KeyArt.Base(t, hue);
        var r = v.Readout;
        d.Text(StrokeFont.Ellipsize(v.Label, S - 28, Refraction.Deck.MicroSize, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper), S / 2, 30,
            Refraction.Deck.MicroSize, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, tracking: Refraction.Deck.MicroTrackingEm, textCase: TextCase.Upper);
        var (text, color, op) = ValueStyle(t, r);
        if (r?.Cells is { Count: >= 2 } cells && r.IsKnown)
        {
            // E / F / N: one row per value (its letter left, the value right), all values at one size: a small scoreboard.
            const double lx = 30, rx = S - 30, top = 42;
            var n = Math.Min(cells.Count, 4);
            var rowH = ((Tag(r) is null ? 120 : 110) - top) / n;
            var ls = Math.Min(17, rowH * 0.66);
            var lw = cells.Take(n).Max(c => StrokeFont.Measure(c.Label, ls, FontWeight.Semibold, 0.06, TextCase.Upper));
            var vs = cells.Take(n).Min(c => StrokeFont.FitSize(c.Value, rx - lx - lw - 10, Math.Min(25, rowH * 0.95), 11, FontWeight.Semibold));
            for (var i = 0; i < n; i++)
            {
                var cy = top + rowH * (i + 0.5);
                d.Text(cells[i].Label, lx, cy, ls, hue.Ink, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
                d.Text(StrokeFont.Ellipsize(cells[i].Value, rx - lx - lw - 6, vs), rx, cy, vs, color, TextAlign.End, FontWeight.Semibold, TextBaseline.Middle, opacity: op);
            }
            StaleTag(d, t, r, S / 2, 122);
            if (Tag(r) is null) KeyArt.HueIndex(d, hue, false);
            return Finish(d, t, v);
        }
        var size = StrokeFont.FitSize(text, S - 22, Refraction.Deck.ValueSize, 16, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
        d.Text(StrokeFont.Ellipsize(text, S - 18, size), S / 2, 74, size, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm, opacity: op);
        if (r?.Fraction is { } f)
        {
            const double mx = 24, mw = S - 48, my = 102;
            d.Rect(mx, my, mw, 5, Track(t), rx: 2.5);
            d.Rect(mx, my, Math.Max(5, mw * f), 5, Paint.Solid(hue.Vivid, op ?? 1), rx: 2.5);
        }
        StaleTag(d, t, r, S / 2, 122);
        if (r?.Fraction is null && Tag(r) is null) KeyArt.HueIndex(d, hue, false);
        return Finish(d, t, v);
    }

    private static SvgDocument IdleKey(RefractionPalette t, SlotView v)
    {
        var white = Hues.White(t);
        var d = KeyArt.Base(t, white);
        var label = v.Label.Length == 0 ? "SMART" : v.Label;
        d.Text(label, S / 2, S / 2 - 4, StrokeFont.FitSize(label, S - 28, 20, 12, textCase: TextCase.Upper), t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle,
            Refraction.Deck.MicroTrackingEm, TextCase.Upper);
        KeyArt.HueIndex(d, white, false);
        return Finish(d, t, v);
    }

    private static SvgDocument EmptyKey(RefractionPalette t, SpectrumColor hue)
    {
        var d = KeyArt.Base(t, hue);
        const double w = 32, h = 4;
        d.Rect((S - w) / 2, S - 12 - h / 2, w, h, hue.Vivid.WithOpacity(0.16), rx: h / 2);
        return d;
    }

    /// <summary>Flash overlay (NOT IN FRONT, ADMIN APP, SIGHT LOST, HOLD…): a scrim over the glyph area; the label stays readable below.</summary>
    private static SvgDocument Finish(SvgDocument d, RefractionPalette t, SlotView v)
    {
        if (v.Flash is not { } text) return d;
        var color = v.FlashIsError ? (t.IsDark ? t.Warn : t.Crit) : t.Pos;
        const double top = 10, bottom = 98;
        d.Rect(6, top, S - 12, bottom - top, new Style { Fill = Paint.Solid(t.BgDeep, 0.94), Stroke = Paint.Solid(color, 0.85), StrokeWidth = 2 }, rx: 10);
        var words = text.Split(' ');
        var mid = (top + bottom) / 2;
        if (words.Length >= 2 && StrokeFont.Measure(text, 22, FontWeight.Bold, textCase: TextCase.Upper) > S - 28)
        {
            var half = (words.Length + 1) / 2;
            var l1 = string.Join(' ', words[..half]);
            var l2 = string.Join(' ', words[half..]);
            var size = Math.Min(StrokeFont.FitSize(l1, S - 28, 22, 12, FontWeight.Bold, textCase: TextCase.Upper), StrokeFont.FitSize(l2, S - 28, 22, 12, FontWeight.Bold, textCase: TextCase.Upper));
            d.Text(l1, S / 2, mid - 12, size, color, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper);
            d.Text(l2, S / 2, mid + 12, size, color, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper);
        }
        else
        {
            var size = StrokeFont.FitSize(text, S - 28, 24, 12, FontWeight.Bold, textCase: TextCase.Upper);
            d.Text(text, S / 2, mid, size, color, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper);
        }
        return d;
    }

    // ================================================================== dials / widgets

    public static SvgDocument Dial(RefractionPalette t, SlotView v, GlyphLibrary? glyphs = null, bool active = false)
    {
        glyphs ??= GlyphLibrary.Default;
        var hue = t.Spectrum[Math.Clamp(v.Hue, 0, t.Spectrum.Count - 1)];
        if (v.Kind == SlotKind.Idle) return IdleDial(t, v);
        var d = DialArt.Base(t, hue, active && v.Availability.Ready);
        var a = v.Availability;
        var dim = !a.Ready && a.Style != "badge";
        var r = v.Readout;

        if (v.Kind == SlotKind.Empty && r is null)
        {
            d.Text("—", W / 2, H / 2, 24, t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle, opacity: 0.4);
            return FinishDial(d, t, v);
        }

        // Left column: the control's glyph, only when the library has one (no redundant letter tile next to the title), and
        // not beside a live horizon (the disc already is the bank picture).
        var hasGlyph = v.Kind == SlotKind.Control && glyphs.Has(v.Glyph) && (dim || r is not { Cells: null, Readout.Widget: "horizon" });
        if (hasGlyph) glyphs.Draw(d, v.Glyph, null, 10, 30, 42, new GlyphInk(t.KeyInk, hue.Ink, t.KeyMuted, hue.Vivid, dim ? DimOpacity : 1));
        var x0 = hasGlyph ? 62.0 : 14.0;
        const double right = W - 12;

        // Header: title left; the push hint right, shrunk or dropped so it never touches the title.
        var titleSize = Refraction.Deck.DialLabelSize;
        var title = StrokeFont.Ellipsize(v.Label, right - x0, titleSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper);
        var titleW = StrokeFont.Measure(title, titleSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper);
        d.Text(title, x0, 22, titleSize, dim ? t.KeyMuted : hue.Ink, TextAlign.Start, FontWeight.Semibold, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        string? footerPush = null;
        if (v.PushLabel is { } push && !dim && !v.Armed && r is not null)
        {
            var avail = right - (x0 + titleW + 10);
            var hint = Fit("PUSH " + push, avail, 11) ?? Fit(push, avail, 11);
            if (hint is not null) d.Text(hint, right, 22, 11, t.KeyMuted, TextAlign.End, FontWeight.Semibold, tracking: 0.06, textCase: TextCase.Upper);
            else footerPush = "PUSH " + push;
        }

        if (dim)
        {
            var lbl = a.Label is { } al && !string.Equals(al, v.Label, StringComparison.OrdinalIgnoreCase) ? al : Eyebrow(a, v.Label) ?? "";
            d.Text(StrokeFont.Ellipsize(lbl, right - x0, 20, textCase: TextCase.Upper), x0, 50, 20, a.Reason is "sightLost" or "elevated" or "policyBlocked" ? t.Warn : t.KeyMuted, TextAlign.Start,
                FontWeight.Semibold, TextBaseline.Middle, textCase: TextCase.Upper);
            WrapHint(d, t, a.Hint ?? "Not available right now.", x0, 72, right - x0);
            return FinishDial(d, t, v);
        }

        if (r is null)
        {
            // A control with nothing to read: say what turning and pushing do.
            if (v.Kind == SlotKind.Control) d.Text("TURN TO ADJUST", x0, 52, 13, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, 0.08, TextCase.Upper);
            if (v.PushLabel is { } p2) d.Text(Fit("PUSH · " + p2, right - x0, 13) ?? "PUSH", x0, 72, 13, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, 0.08, TextCase.Upper);
            return FinishDial(d, t, v);
        }

        var (text, color, vop) = ValueStyle(t, r);
        var widget = r.Readout.Widget;
        var hasDisc = r.Cells is null && widget is "horizon" or "gauge";
        var maxW = right - x0 - (hasDisc ? 60 : 0);
        var subLabel = r.Cells is null && (v.Kind == SlotKind.Readout || !string.Equals(r.Readout.Label, v.Label, StringComparison.OrdinalIgnoreCase));
        if (subLabel)
            d.Text(StrokeFont.Ellipsize(r.Readout.Label, maxW, 11, FontWeight.Semibold, 0.06, TextCase.Upper), x0, 37, 11, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: 0.06, textCase: TextCase.Upper);

        if (r.Cells is { Count: >= 2 } cells && r.IsKnown)
        {
            // E / F / N: one cell per value, label above.
            var n = Math.Min(cells.Count, 4);
            var cw = (right - x0) / n;
            for (var i = 0; i < n; i++)
            {
                var cx = x0 + i * cw;
                d.Text(StrokeFont.Ellipsize(cells[i].Label, cw - 6, 11, FontWeight.Semibold, 0.06, TextCase.Upper), cx, 42, 11, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: 0.06, textCase: TextCase.Upper);
                var cs = StrokeFont.FitSize(cells[i].Value, cw - 8, 30, 12, FontWeight.Semibold);
                d.Text(StrokeFont.Ellipsize(cells[i].Value, cw - 4, cs), cx, 64, cs, color, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, opacity: vop);
            }
        }
        else
        {
            var size = StrokeFont.FitSize(text, maxW, Refraction.Deck.DialValueSize, 13, FontWeight.Semibold);
            d.Text(StrokeFont.Ellipsize(text, maxW, size), x0, subLabel ? 64 : 60, size, color, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, opacity: vop);
            if (widget == "horizon") Horizon(d, t, hue, r, W - 40, 60, 25);
            else if (widget == "gauge") Gauge(d, t, hue, r, W - 40, 62, 23);
            else if (r.Fraction is { } f) Meter(d, t, hue, f, x0, right - x0, vop);
        }
        if (v.Review is not null) d.Text("PUSH: REVIEW IN PI", x0, 90, 10, t.Warn, TextAlign.Start, FontWeight.Semibold, tracking: 0.1, textCase: TextCase.Upper);
        else if (footerPush is not null) d.Text(Fit(footerPush, right - x0, 10) ?? "", x0, 90, 10, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, tracking: 0.1, textCase: TextCase.Upper);
        else StaleTag(d, t, r, x0, 90, TextAlign.Start);
        return FinishDial(d, t, v);
    }

    /// <summary>The text if it fits in <paramref name="maxW"/> at <paramref name="size"/> (micro caps), else null.</summary>
    private static string? Fit(string text, double maxW, double size) =>
        maxW > 24 && StrokeFont.Measure(text, size, FontWeight.Semibold, 0.06, TextCase.Upper) <= maxW ? text : null;

    private static void WrapHint(SvgDocument d, RefractionPalette t, string hint, double x, double y, double maxW)
    {
        const double size = 11;
        var words = hint.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        var cur = "";
        for (var i = 0; i < words.Length; i++)
        {
            var next = cur.Length == 0 ? words[i] : cur + " " + words[i];
            if (StrokeFont.Measure(next, size) <= maxW) { cur = next; continue; }
            if (cur.Length > 0) lines.Add(cur);
            // The second line takes the rest and is ellipsized.
            cur = lines.Count >= 1 ? string.Join(' ', words[i..]) : words[i];
            if (lines.Count >= 1) break;
        }
        if (cur.Length > 0) lines.Add(cur);
        for (var l = 0; l < Math.Min(2, lines.Count); l++)
            d.Text(StrokeFont.Ellipsize(lines[l], maxW, size), x, y + l * 14, size, t.KeyMuted, TextAlign.Start, FontWeight.Medium);
    }

    private static void Horizon(SvgDocument d, RefractionPalette t, SpectrumColor hue, ReadoutView r, double cx, double cy, double rad)
    {
        var known = r.Value.Number is not null && r.IsKnown;
        var angle = known ? Math.Clamp(r.Value.Number!.Value, -180, 180) : 0;
        var op = r.Value.Confidence == ReadoutConfidence.Stale ? 0.45 : 1;
        var mask = d.MaskCircle(cx, cy, rad);
        using (d.Group(new Style { Mask = mask }))
        {
            d.Rect(cx - rad, cy - rad, rad * 2, rad * 2, Paint.Solid(t.Panel2));
            // Ground below the horizon line, rotated by the bank angle (a large rotated rect, masked to the disc).
            d.Rect(cx - rad * 2, cy, rad * 4, rad * 2, new Style { Fill = Paint.Solid(hue.Vivid, 0.3 * op), Transform = Transform.Rotate(-angle, cx, cy) });
        }
        d.Circle(cx, cy, rad, new Style { Fill = Paint.None, Stroke = Paint.Solid(t.KeyMuted, 0.6), StrokeWidth = 1.5 });
        var rad2 = rad - 3;
        var rot = -angle * Math.PI / 180;
        d.Line(cx - rad2 * Math.Cos(rot), cy - rad2 * Math.Sin(rot), cx + rad2 * Math.Cos(rot), cy + rad2 * Math.Sin(rot), Paint.Solid(known ? hue.Vivid : t.KeyMuted, op), 3);
        // The fixed track mark.
        d.Path(new PathBuilder().MoveTo(cx - 12, cy).LineTo(cx - 4, cy).LineTo(cx, cy + 4).LineTo(cx + 4, cy).LineTo(cx + 12, cy), new Style { Fill = Paint.None, Stroke = t.KeyInk, StrokeWidth = 2.2, LineCap = LineCap.Round, LineJoin = LineJoin.Round });
    }

    private static void Gauge(SvgDocument d, RefractionPalette t, SpectrumColor hue, ReadoutView r, double cx, double cy, double rad)
    {
        // A bottom-open gauge: 0 at 7:30, full at 4:30 (PathBuilder angles: 0 = 3 o'clock, clockwise).
        const double start = 135, sweep = 270;
        d.Path(new PathBuilder().Arc(cx, cy, rad, start, start + sweep), new Style { Fill = Paint.None, Stroke = Track(t), StrokeWidth = 6, LineCap = LineCap.Round });
        if (r.Fraction is not { } f || !r.IsKnown) return;
        var paint = Paint.Solid(hue.Vivid, r.Value.Confidence == ReadoutConfidence.Stale ? 0.45 : 1);
        var at = start + sweep * f;
        if (r.Centered)
        {
            // Signed values grow from zero; a tick marks it.
            var zero = start + sweep * Math.Clamp(r.ZeroFraction, 0, 1);
            var (zx, zy) = PathBuilder.Polar(cx, cy, rad, zero);
            var (ox, oy) = PathBuilder.Polar(cx, cy, rad + 6, zero);
            var (ix, iy) = PathBuilder.Polar(cx, cy, rad - 6, zero);
            d.Line(ix, iy, ox, oy, Paint.Solid(t.KeyMuted, 0.8), 1.5);
            if (Math.Abs(at - zero) > 1) d.Path(new PathBuilder().Arc(cx, cy, rad, Math.Min(zero, at), Math.Max(zero, at)), new Style { Fill = Paint.None, Stroke = paint, StrokeWidth = 6, LineCap = LineCap.Round });
            else d.Circle(zx, zy, 3, paint);
        }
        else if (at > start + 0.5)
            d.Path(new PathBuilder().Arc(cx, cy, rad, start, at), new Style { Fill = Paint.None, Stroke = paint, StrokeWidth = 6, LineCap = LineCap.Round });
    }

    private static void Meter(SvgDocument d, RefractionPalette t, SpectrumColor hue, double f, double x, double w, double? op)
    {
        const double y = 79, h = 5;
        d.Rect(x, y, w, h, Track(t), rx: h / 2);
        d.Rect(x, y, Math.Max(h, w * f), h, Paint.Solid(hue.Vivid, op ?? 1), rx: h / 2);
    }

    /// <summary>Gauge and meter tracks: muted ink, visible on Night and Day materials.</summary>
    private static Paint Track(RefractionPalette t) => Paint.Solid(t.KeyMuted, t.IsDark ? 0.22 : 0.3);

    private static (string Text, Color Color, double? Opacity) ValueStyle(RefractionPalette t, ReadoutView? r)
    {
        if (r is null || !r.IsKnown) return ("—", t.KeyMuted, 0.7);
        return r.Value.Confidence switch
        {
            ReadoutConfidence.Inferred => ("~" + r.Text, t.KeyInk, 0.85),
            ReadoutConfidence.Stale => (r.Text, t.KeyMuted, 0.6),
            _ => (r.Text, t.KeyInk, null),
        };
    }

    private static string? Tag(ReadoutView? r) => r is null ? null : r.Value.Confidence switch
    {
        ReadoutConfidence.Stale => "STALE",
        ReadoutConfidence.Inferred => r.Readout.Source.Kind == ReadoutSourceKind.Counted ? "COUNTED" : "INFERRED",
        ReadoutConfidence.Unknown => "NO READING",
        _ => null,
    };

    private static void StaleTag(SvgDocument d, RefractionPalette t, ReadoutView? r, double x, double y, TextAlign align = TextAlign.Middle)
    {
        if (Tag(r) is { } tag) d.Text(tag, x, y, 10, t.KeyMuted, align, FontWeight.Semibold, tracking: 0.1, textCase: TextCase.Upper, opacity: 0.85);
    }

    private static SvgDocument IdleDial(RefractionPalette t, SlotView v)
    {
        var d = DialArt.Base(t);
        d.Text(v.Label.Length == 0 ? "SMART" : v.Label, W / 2, H / 2, 16, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.1, TextCase.Upper);
        return FinishDial(d, t, v);
    }

    /// <summary>The armed countdown and flashes as a band at the bottom (the title row stays clean).</summary>
    private static SvgDocument FinishDial(SvgDocument d, RefractionPalette t, SlotView v)
    {
        string? text = null;
        var color = t.Pos;
        if (v.Armed)
        {
            d.Rect(1.5, 1.5, W - 3, H - 3, new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 3 }, rx: 6);
            text = $"PUSH AGAIN · {Math.Ceiling(v.ArmedSecondsLeft).ToString(CultureInfo.InvariantCulture)}";
            color = t.Warn;
        }
        else if (v.Flash is { } f)
        {
            text = f;
            color = v.FlashIsError ? (t.IsDark ? t.Warn : t.Crit) : t.Pos;
        }
        if (text is null) return d;
        d.Rect(3, H - 24, W - 6, 21, new Style { Fill = Paint.Solid(t.BgDeep, 0.94) }, rx: 4);
        d.Rect(3, H - 24, W - 6, 2, Paint.Solid(color, 0.9));
        d.Text(text, W / 2, H - 13, StrokeFont.FitSize(text, W - 24, 13, 9, FontWeight.Bold, textCase: TextCase.Upper), color, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper);
        return d;
    }
}
