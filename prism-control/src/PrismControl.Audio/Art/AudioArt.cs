using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Audio.Art;

// What each frame shows. Actions build a view from engine state; tests assert on the view (text is drawn as paths),
// and AudioArt turns it into a deck-safe SVG. Keys are 144-unit squares, dials 200×100.

internal enum LevelKind { Output, Input, App }

internal sealed record VolumeView(LevelKind Kind, string Label, int Pct, bool Muted, bool Fixed = false, bool Unavailable = false, string? Note = null)
{
    public string Value => Unavailable ? "–" : Muted ? "MUTED" : Fixed ? "FIXED" : Pct.ToString(CultureInfo.InvariantCulture) + "%";
}

/// <summary>
/// <paramref name="Level"/> is a meter position 0..1 (dB scale), null when no meter runs. <paramref name="NoAudio"/>:
/// the audio service is unavailable (or reconnecting), not just this mic.
/// </summary>
internal sealed record MicView(string Device, bool Muted, int Pct, double? Level, bool Unavailable = false, bool NoAudio = false)
{
    public string Value => Unavailable ? (NoAudio ? "NO AUDIO" : "NO MIC") : Muted ? "MUTED" : "LIVE";
}

internal sealed record DeviceView(bool IsOutput, string Title, string? Subtitle, bool Lit, bool IsDefault, int Index, int Count, string? Hint = null, bool Unavailable = false);

internal sealed record MixerView(bool Adjusting, string Name, int Pct, bool Muted, bool Active, int Index, int Count, bool Empty = false, bool Unavailable = false)
{
    public string Value => Muted ? "MUTED" : Pct.ToString(CultureInfo.InvariantCulture) + "%";
}

internal sealed record MeterView(bool IsOutput, string Device, float[] Levels, float[] Holds, double? PeakDb, bool Unavailable = false)
{
    public string DbText => Unavailable ? "–" : PeakDb is { } db ? db.ToString("0", CultureInfo.InvariantCulture).Replace("-", "−") + " dB" : "– dB";
}

internal static class AudioArt
{
    private const double S = KeyArt.Size;
    private const double W = DialArt.W;

    public static SpectrumColor Hue(RefractionPalette t) => Hues.For(t, "audio");

    /// <summary>The negative color as a spectrum entry, so the shared key/dial bases can wash and ring with it.</summary>
    public static SpectrumColor NegHue(RefractionPalette t) => new("neg", 0, "", t.Neg, t.Neg, Paint.Solid(t.Neg, 0.14), null);

    /// <summary>Dark or light ink on a solid negative fill, whichever contrasts more.</summary>
    public static Color OnNeg(RefractionPalette t) => Color.Contrast(t.Neg, t.Bg) >= Color.Contrast(t.Neg, Color.White) ? t.Bg : Color.White;

    /// <summary>Linear peak 0..1 → meter position 0..1 on a −60..0 dBFS scale.</summary>
    public static double MeterPosition(double peak) => peak <= 0.001 ? 0 : Math.Clamp((20 * Math.Log10(peak) + 60) / 60, 0, 1);

    // ================================================================ volume (output, input, app)

    public static SvgDocument VolumeKey(RefractionPalette t, VolumeView v)
    {
        var hue = Hue(t);
        var neg = NegHue(t);
        var d = KeyArt.Base(t, v.Muted ? neg : hue, on: v.Muted);
        IconLabel(d, t, v.Kind, v.Muted, v.Label, 32, v.Muted ? neg.Ink : t.KeyMuted);
        if (v.Note is { } note)
        {
            // "NOT RUNNING", "PICK AN APP": the note takes the value's place.
            var (n, ns) = TextFit.Wrap(note, S - 32, 22, 16, 2, textCase: TextCase.Upper, tracking: 0.04);
            var gap = ns * 1.1;
            for (var i = 0; i < n.Count; i++)
                d.Text(n[i], S / 2, 78 - (n.Count - 1) * gap / 2 + i * gap, ns, t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle, tracking: 0.04, textCase: TextCase.Upper);
        }
        else
        {
            var (text, size) = TextFit.Fit(v.Value, S - 28, Refraction.Deck.ValueSize, 24, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
            var ink = v.Unavailable ? t.Faint : v.Muted ? neg.Ink : t.KeyInk;
            d.Text(text, S / 2, 76, size, ink, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
            if (!v.Unavailable && !v.Fixed) KeyBar(d, t, v.Pct / 100.0, v.Muted ? Paint.Solid(t.Faint) : hue.Vivid);
        }
        KeyArt.HueIndex(d, v.Muted ? neg : hue, v.Muted);
        return d;
    }

    public static SvgDocument VolumeDial(RefractionPalette t, VolumeView v, bool active)
    {
        var hue = Hue(t);
        var neg = NegHue(t);
        var d = DialArt.Base(t, v.Muted ? neg : hue, active || v.Muted);
        DialName(d, t, v.Kind, v.Muted, v.Label);
        var ink = v.Unavailable ? t.Faint : v.Muted ? neg.Ink : active ? hue.Ink : t.KeyInk;
        var (text, size) = TextFit.Fit(v.Value, 120, Refraction.Deck.DialValueSize, 20);
        d.Text(text, 16, 56, size, ink, baseline: TextBaseline.Middle);
        // A big glyph on the right that also reads the level: waves by volume, X when muted.
        var glyphInk = v.Muted ? neg.Ink : t.KeyInk;
        AudioGlyphs.At(d, 144, 34, 40, g =>
        {
            if (v.Kind == LevelKind.Input) { if (v.Muted) AudioGlyphs.MicMuted(g, glyphInk, t.Panel); else AudioGlyphs.Mic(g, glyphInk); }
            else if (v.Muted) AudioGlyphs.SpeakerMuted(g, glyphInk);
            else AudioGlyphs.Speaker(g, glyphInk, v.Unavailable ? 0 : v.Pct == 0 ? 0 : v.Pct < 34 ? 1 : v.Pct < 67 ? 2 : 3);
        });
        if (!v.Unavailable) DialBar(d, t, 16, 82, W - 32, 6, v.Fixed ? 1 : v.Pct / 100.0, v.Muted ? null : hue, active);
        return d;
    }

    // ================================================================ mic

    public static SvgDocument MicKey(RefractionPalette t, MicView v)
    {
        var hue = Hue(t);
        if (v.Muted && !v.Unavailable)
        {
            // Unmistakable from across a room: the whole key turns the negative color.
            var ink = OnNeg(t);
            var d = SvgDocument.Key();
            var fill = d.LinearGradient(0, 0, 0, S, [(0, t.Neg.Mix(Color.White, 0.08)), (0.45, t.Neg), (1, t.Neg.Mix(Color.Black, 0.18))], userSpace: true);
            d.Rect(0, 0, S, S, fill);
            d.Rect(0, 0, S, 2, t.KeyEdge);
            AudioGlyphs.At(d, S / 2 - 28, 14, 56, g => AudioGlyphs.MicMuted(g, ink, t.Neg));
            d.Text("MUTED", S / 2, 104, 28, ink, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, 0.02, TextCase.Upper);
            return d;
        }
        var k = KeyArt.Base(t, hue, on: false);
        var glyph = v.Unavailable ? t.Faint : t.KeyInk;
        AudioGlyphs.At(k, S / 2 - 26, 16, 52, g => AudioGlyphs.Mic(g, glyph));
        var (label, labelSize) = TextFit.Fit(v.Unavailable ? v.Value : "LIVE", S - 28, 22, 16, tracking: 0.06, textCase: TextCase.Upper);
        k.Text(label, S / 2, 96, labelSize, v.Unavailable ? t.Faint : t.Pos, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
        if (v.Level is { } level) KeyBar(k, t, level, t.Pos, y: 114);
        else KeyArt.HueIndex(k, hue, false);
        return k;
    }

    public static SvgDocument MicDial(RefractionPalette t, MicView v, bool active)
    {
        var hue = Hue(t);
        if (v.Muted && !v.Unavailable)
        {
            var ink = OnNeg(t);
            var d = SvgDocument.Dial();
            var fill = d.LinearGradient(0, 0, 0, 100, [(0, t.Neg.Mix(Color.White, 0.06)), (0.45, t.Neg), (1, t.Neg.Mix(Color.Black, 0.16))], userSpace: true);
            d.Rect(0, 0, W, 100, fill);
            d.Rect(0, 0, W, 2, t.KeyEdge);
            AudioGlyphs.At(d, 14, 22, 52, g => AudioGlyphs.MicMuted(g, ink, t.Neg));
            d.Text("MUTED", 78, 46, 32, ink, TextAlign.Start, FontWeight.Bold, TextBaseline.Middle, 0.02, TextCase.Upper);
            var (dev, ds) = TextFit.Fit(v.Device, W - 94, 14, 14);
            d.Text(dev, 78, 76, ds, ink, baseline: TextBaseline.Middle, opacity: 0.85);
            return d;
        }
        var k = DialArt.Base(t, hue, active);
        AudioGlyphs.At(k, 14, 24, 48, g => AudioGlyphs.Mic(g, v.Unavailable ? t.Faint : t.KeyInk));
        var (devText, devSize) = TextFit.Fit(v.Device, W - 78 - 16, Refraction.Deck.DialLabelSize + 1, Refraction.Deck.DialLabelSize, tracking: 0.02);
        k.Text(devText, 78, 20, devSize, t.KeyMuted, baseline: TextBaseline.Middle, tracking: 0.02);
        var (value, valueSize) = v.Unavailable ? TextFit.Fit(v.Value, W - 78 - 16, 30, 18) : (v.Pct.ToString(CultureInfo.InvariantCulture) + "%", 30);
        k.Text(value, 78, 52, valueSize, v.Unavailable ? t.Faint : active ? hue.Ink : t.KeyInk, baseline: TextBaseline.Middle);
        if (!v.Unavailable)
        {
            k.Text("LIVE", W - 16, 52, 16, t.Pos, TextAlign.End, FontWeight.Semibold, TextBaseline.Middle, 0.08, TextCase.Upper);
            if (v.Level is { } level) DialBar(k, t, 78, 82, W - 94, 6, level, null, active, t.Pos);
            else DialBar(k, t, 78, 82, W - 94, 6, v.Pct / 100.0, hue, active);
        }
        return k;
    }

    // ================================================================ device switcher

    public static SvgDocument DeviceKey(RefractionPalette t, DeviceView v)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on: v.Lit);
        var kind = v.IsOutput ? LevelKind.Output : LevelKind.Input;
        IconLabel(d, t, kind, false, v.IsOutput ? "OUTPUT" : "INPUT", 28, t.KeyMuted, TextCase.Upper, Refraction.Deck.MicroTrackingEm, 16);
        var titleInk = v.Unavailable ? t.Faint : v.Lit ? hue.Ink : t.KeyInk;
        // Two lines when they fit; three smaller ones only when two would cut the name. The block stays centered in
        // the band between the label (y 28) and the subtitle (y 108).
        var (lines, size) = TextFit.Wrap(v.Title, S - 24, 26, 16, 2);
        if (string.Join(" ", lines).Contains('…')) (lines, size) = TextFit.Wrap(v.Title, S - 24, 19, 16, 3);
        var gap = size * 1.05;
        for (var i = 0; i < lines.Count; i++)
            d.Text(lines[i], S / 2, 69 - (lines.Count - 1) * gap / 2 + i * gap, size, titleInk, TextAlign.Middle, baseline: TextBaseline.Middle);
        if (v.Subtitle is { } sub)
        {
            var (st, ss) = TextFit.Fit(sub, S - 28, 16, 16);
            d.Text(st, S / 2, 108, ss, t.Dim, TextAlign.Middle, baseline: TextBaseline.Middle);
        }
        if (v.Count > 1 && v.Count <= 8) Dots(d, t, hue, v.Index, v.Count, S / 2, 130);
        else KeyArt.HueIndex(d, hue, v.Lit);
        return d;
    }

    public static SvgDocument DeviceDial(RefractionPalette t, DeviceView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        DialHeader(d, t, v.IsOutput ? LevelKind.Output : LevelKind.Input, false, v.IsOutput ? "OUTPUT" : "INPUT", null);
        if (v.Count > 0) d.Text($"{v.Index + 1}/{v.Count}", W - 16, 20, Refraction.Deck.DialLabelSize, t.Dim, TextAlign.End, baseline: TextBaseline.Middle, tracking: 0.06);
        var (title, size) = TextFit.Fit(v.Title, W - 32, 28, 18);
        d.Text(title, 16, 48, size, v.Unavailable ? t.Faint : active ? hue.Ink : t.KeyInk, baseline: TextBaseline.Middle);
        if (v.Subtitle is { } sub)
        {
            var (st, ss) = TextFit.Fit(sub, W - 32, 14, 14);
            d.Text(st, 16, 69, ss, t.KeyMuted, baseline: TextBaseline.Middle);
        }
        // The status line: this is the default, or push to make it so.
        if (v.IsDefault) Badge(d, t, "DEFAULT", 16, 88, t.Pos, alignStart: true);
        else if (v.Hint is { } hint) d.Text(hint, 16, 88, Refraction.Deck.DialLabelSize, hue.Ink, baseline: TextBaseline.Middle, tracking: 0.06, textCase: TextCase.Upper);
        return d;
    }

    // ================================================================ mixer

    public static SvgDocument MixerDial(RefractionPalette t, MixerView v, bool active)
    {
        var hue = Hue(t);
        var neg = NegHue(t);
        var d = DialArt.Base(t, hue, v.Adjusting || active);
        if (v.Unavailable || v.Empty)
        {
            DialHeader(d, t, LevelKind.App, false, "MIXER", null);
            d.Text(v.Unavailable ? "NO AUDIO" : "NO APPS", W / 2, 54, 26, t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle);
            if (!v.Unavailable) d.Text("NOTHING IS PLAYING", W / 2, 80, 14, t.Dim, TextAlign.Middle, baseline: TextBaseline.Middle, tracking: 0.06, textCase: TextCase.Upper);
            return d;
        }
        if (!v.Adjusting)
        {
            DialHeader(d, t, LevelKind.App, false, "MIXER", null);
            d.Text($"{v.Index + 1}/{v.Count}", W - 16, 20, Refraction.Deck.DialLabelSize, t.Dim, TextAlign.End, baseline: TextBaseline.Middle, tracking: 0.06);
            var (name, size) = TextFit.Fit(v.Name, W - 64, 28, 18);
            d.Text(name, W / 2, 50, size, v.Active ? t.KeyInk : t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle);
            if (v.Index > 0) AudioGlyphs.Chevron(d, 18, 50, 14, -1, t.Dim);
            if (v.Index < v.Count - 1) AudioGlyphs.Chevron(d, W - 18, 50, 14, +1, t.Dim);
            d.Text(v.Value, 16, 80, 14, v.Muted ? neg.Ink : t.KeyMuted, baseline: TextBaseline.Middle, tracking: 0.04, textCase: TextCase.Upper);
            DialBar(d, t, 70, 78, W - 86, 4, v.Pct / 100.0, v.Muted ? null : hue, false);
            return d;
        }
        // Adjusting one app: big value, push goes back to the list.
        var (n, ns) = TextFit.Fit(v.Name, W - 38 - 16, Refraction.Deck.DialLabelSize + 2, Refraction.Deck.DialLabelSize, tracking: 0.04);
        AudioGlyphs.At(d, 14, 11, 18, g => AudioGlyphs.Sliders(g, hue.Ink));
        d.Text(n, 38, 20, ns, hue.Ink, baseline: TextBaseline.Middle, tracking: 0.04);
        d.Text(v.Value, 16, 54, Refraction.Deck.DialValueSize, v.Muted ? neg.Ink : hue.Ink, baseline: TextBaseline.Middle);
        // Push goes back to the list.
        d.Text("← LIST", W - 16, 54, Refraction.Deck.DialLabelSize, t.Dim, TextAlign.End, baseline: TextBaseline.Middle, tracking: 0.06, textCase: TextCase.Upper);
        DialBar(d, t, 16, 82, W - 32, 6, v.Pct / 100.0, v.Muted ? null : hue, true);
        return d;
    }

    // ================================================================ level meter

    public static SvgDocument MeterKey(RefractionPalette t, MeterView v)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on: false);
        IconLabel(d, t, v.IsOutput ? LevelKind.Output : LevelKind.Input, false, v.DbText, 24, v.PeakDb is null ? t.Dim : t.KeyMuted, maxSize: 18);
        const double top = 38, bottom = 112;
        var n = Math.Clamp(v.Levels.Length, 1, 2);
        var bw = n == 1 ? 40.0 : 26.0;
        var gap = 12.0;
        var x0 = S / 2 - (n * bw + (n - 1) * gap) / 2;
        var grad = MeterGradient(d, t, 0, bottom, 0, top);
        var track = new PathBuilder();
        for (var i = 0; i < n; i++) track.RoundedRect(x0 + i * (bw + gap), top, bw, bottom - top, 3);
        d.Path(track, new Style { Fill = t.Panel2 });
        // The scale (-40, -20, -10 and -3 dBFS, the dial's mapping) etched into the track, so a silent meter reads as an
        // instrument at rest rather than an empty slab; the fill covers the marks it passes.
        var marks = new PathBuilder();
        foreach (var db in new[] { -40.0, -20, -10, -3 })
        {
            var y = bottom - (bottom - top) * (db + 60) / 60;
            for (var i = 0; i < n; i++) marks.MoveTo(x0 + i * (bw + gap) + 7, y).LineTo(x0 + i * (bw + gap) + bw - 7, y);
        }
        d.Path(marks, Style.Stroked(t.KeyMuted, 1.5) with { Opacity = t.IsDark ? 0.3 : 0.4 });
        var fill = new PathBuilder();
        var holds = new PathBuilder();
        var idle = new PathBuilder();
        for (var i = 0; i < n; i++)
        {
            var x = x0 + i * (bw + gap);
            var lv = Level(v.Levels, i);
            var h = (bottom - top) * lv;
            if (h >= 1) fill.RoundedRect(x, bottom - h, bw, h, Math.Min(3, h / 2));
            else idle.RoundedRect(x, bottom - 4, bw, 4, 2); // silent: a lit floor in the hue (live, nothing playing)
            var hold = Level(v.Holds, i);
            if (hold > 0.01) holds.Rect(x, bottom - (bottom - top) * hold - 1, bw, 2);
        }
        if (!idle.IsEmpty) d.Path(idle, new Style { Fill = hue.Vivid, Opacity = 0.6 });
        if (!fill.IsEmpty) d.Path(fill, new Style { Fill = grad });
        if (!holds.IsEmpty) d.Path(holds, new Style { Fill = t.KeyInk, Opacity = 0.85 });
        var (lt, ls) = TextFit.Fit(v.Device, S - 28, 16, 16, tracking: 0.02);
        d.Text(lt, S / 2, 128, ls, t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle, tracking: 0.02);
        return d;
    }

    public static SvgDocument MeterDial(RefractionPalette t, MeterView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        DialName(d, t, v.IsOutput ? LevelKind.Output : LevelKind.Input, false, v.Device);
        const double x0 = 16, x1 = W - 16;
        var n = Math.Clamp(v.Levels.Length, 1, 2);
        double[] ys = n == 1 ? [40] : [36, 54];
        var bh = n == 1 ? 18.0 : 12.0;
        var grad = MeterGradient(d, t, x0, 0, x1, 0);
        var track = new PathBuilder();
        foreach (var y in ys) track.RoundedRect(x0, y, x1 - x0, bh, 3);
        d.Path(track, new Style { Fill = t.Panel2 });
        var fill = new PathBuilder();
        var holds = new PathBuilder();
        for (var i = 0; i < n; i++)
        {
            var w = (x1 - x0) * Level(v.Levels, i);
            if (w >= 1) fill.RoundedRect(x0, ys[i], w, bh, Math.Min(3, w / 2));
            var hold = Level(v.Holds, i);
            if (hold > 0.01) holds.Rect(x0 + (x1 - x0) * hold - 1, ys[i], 2, bh);
        }
        if (!fill.IsEmpty) d.Path(fill, new Style { Fill = grad, Filter = active ? d.Glow(2) : null });
        if (!holds.IsEmpty) d.Path(holds, new Style { Fill = t.KeyInk, Opacity = 0.85 });
        // Scale ticks at -40, -20, -10 and 0 dBFS.
        var ticks = new PathBuilder();
        foreach (var db in new[] { -40.0, -20, -10, 0 })
        {
            var x = x0 + (x1 - x0) * (db + 60) / 60;
            ticks.MoveTo(x, 74).LineTo(x, 78);
        }
        d.Path(ticks, Style.Stroked(t.LineStrong, 1.5));
        d.Text("PEAK " + v.DbText, x0, 88, 14, v.PeakDb is null ? t.Dim : t.KeyMuted, baseline: TextBaseline.Middle, tracking: 0.04);
        return d;
    }

    // ================================================================ shared pieces

    private static double Level(float[] values, int i) => values.Length == 0 ? 0 : Math.Clamp(values[Math.Min(i, values.Length - 1)], 0, 1);

    private static Paint MeterGradient(SvgDocument d, RefractionPalette t, double x1, double y1, double x2, double y2) =>
        d.LinearGradient(x1, y1, x2, y2, [(0, t.Spectrum[5].Vivid), (0.68, t.Spectrum[7].Vivid), (0.86, t.Spectrum[9].Vivid), (1, t.Neg)], userSpace: true);

    /// <summary>A glyph + text row centered on the key at <paramref name="cy"/>.</summary>
    private static void IconLabel(SvgDocument d, RefractionPalette t, LevelKind kind, bool muted, string text, double cy, Color color,
        TextCase textCase = TextCase.SmallCaps, double tracking = 0, double maxSize = 20)
    {
        const double glyph = 20, gap = 6, room = S - 28;
        var (label, size) = TextFit.Fit(text, room - glyph - gap, maxSize, 16, tracking: tracking, textCase: textCase);
        if (label != TextFit.Safe(text))
        {
            // The name matters more than the icon: drop the glyph rather than cut the name short.
            var (full, fullSize) = TextFit.Fit(text, room, maxSize, 16, tracking: tracking, textCase: textCase);
            d.Text(full, S / 2, cy, fullSize, color, TextAlign.Middle, baseline: TextBaseline.Middle, tracking: tracking, textCase: textCase);
            return;
        }
        var width = glyph + gap + StrokeFont.Measure(label, size, FontWeight.Semibold, tracking, textCase);
        var x = S / 2 - width / 2;
        AudioGlyphs.At(d, x, cy - glyph / 2, glyph, g => DrawKindGlyph(g, kind, muted, color, t.Panel));
        d.Text(label, x + glyph + gap, cy, size, color, baseline: TextBaseline.Middle, tracking: tracking, textCase: textCase);
    }

    private static void DialHeader(SvgDocument d, RefractionPalette t, LevelKind kind, bool muted, string label, string? right, bool meterGlyph = false)
    {
        var color = muted ? NegHue(t).Ink : t.KeyMuted;
        AudioGlyphs.At(d, 14, 11, 18, g =>
        {
            if (meterGlyph) AudioGlyphs.Bars(g, color);
            else DrawKindGlyph(g, kind, muted, color, t.Panel);
        });
        d.Text(label, 38, 20, Refraction.Deck.DialLabelSize, color, baseline: TextBaseline.Middle, tracking: Refraction.Deck.DialLabelTrackingEm, textCase: TextCase.Upper);
        if (right is null) return;
        var used = 38 + StrokeFont.Measure(label, Refraction.Deck.DialLabelSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper) + 12;
        var room = W - 16 - used;
        if (room < 30) return;
        var (r, rs) = TextFit.Fit(right, room, Refraction.Deck.DialLabelSize, Refraction.Deck.DialLabelSize);
        d.Text(r, W - 16, 20, rs, t.Dim, TextAlign.End, baseline: TextBaseline.Middle);
    }

    /// <summary>Header row: the kind glyph and a name (small caps) using the whole width.</summary>
    private static void DialName(SvgDocument d, RefractionPalette t, LevelKind kind, bool muted, string name)
    {
        var color = muted ? NegHue(t).Ink : t.KeyMuted;
        AudioGlyphs.At(d, 14, 11, 18, g => DrawKindGlyph(g, kind, muted, color, t.Panel));
        var (n, ns) = TextFit.Fit(name, W - 38 - 16, Refraction.Deck.DialLabelSize + 2, Refraction.Deck.DialLabelSize, tracking: 0.02);
        d.Text(n, 38, 20, ns, color, baseline: TextBaseline.Middle, tracking: 0.02);
    }

    private static void DrawKindGlyph(SvgDocument g, LevelKind kind, bool muted, Color color, Color cut)
    {
        switch (kind)
        {
            case LevelKind.Input:
                if (muted) AudioGlyphs.MicMuted(g, color, cut); else AudioGlyphs.Mic(g, color);
                break;
            case LevelKind.App:
                AudioGlyphs.Sliders(g, color);
                break;
            default:
                if (muted) AudioGlyphs.SpeakerMuted(g, color); else AudioGlyphs.Speaker(g, color, 2);
                break;
        }
    }

    private static void KeyBar(SvgDocument d, RefractionPalette t, double fraction, Paint fill, double y = 104)
    {
        const double x = 28, w = S - 56, h = 5;
        d.Rect(x, y, w, h, t.Panel2, rx: h / 2);
        var f = Math.Clamp(fraction, 0, 1);
        if (f > 0) d.Rect(x, y, Math.Max(h, w * f), h, fill, rx: h / 2);
    }

    private static void DialBar(SvgDocument d, RefractionPalette t, double x, double y, double w, double h, double fraction, SpectrumColor? hue, bool active, Color? solid = null)
    {
        d.Rect(x, y, w, h, t.Panel2, rx: h / 2);
        var f = Math.Clamp(fraction, 0, 1);
        if (f <= 0) return;
        Paint fill = solid is { } s ? s
            : hue is not null ? d.LinearGradient(x, 0, x + w, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true)
            : Paint.Solid(t.Faint);
        d.Rect(x, y, Math.Max(h, w * f), h, new Style { Fill = fill, Filter = active && (hue is not null || solid is not null) ? d.Glow(2.5) : null }, rx: h / 2);
    }

    private static void Badge(SvgDocument d, RefractionPalette t, string text, double x, double cy, Color color, bool alignStart = false)
    {
        const double size = 12, padX = 7, h = 16;
        var w = StrokeFont.Measure(text, size, FontWeight.Bold, 0.08, TextCase.Upper) + padX * 2;
        var left = alignStart ? x : x - w;
        d.Rect(left, cy - h / 2, w, h, new Style { Fill = color.WithOpacity(0.16), Stroke = color.WithOpacity(0.7), StrokeWidth = 1 }, rx: h / 2);
        d.Text(text, left + w / 2, cy, size, color, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, 0.08, TextCase.Upper);
    }

    private static void Dots(SvgDocument d, RefractionPalette t, SpectrumColor hue, int index, int count, double cx, double cy)
    {
        const double dot = 5, gap = 5, wide = 14;
        var total = (count - 1) * (dot + gap) + wide;
        var x = cx - total / 2;
        var rest = new PathBuilder();
        for (var i = 0; i < count; i++)
        {
            if (i == index)
            {
                d.Rect(x, cy - dot / 2, wide, dot, hue.Vivid, rx: dot / 2);
                x += wide + gap;
            }
            else
            {
                rest.RoundedRect(x, cy - dot / 2, dot, dot, dot / 2);
                x += dot + gap;
            }
        }
        if (!rest.IsEmpty) d.Path(rest, new Style { Fill = t.LineStrong });
    }
}
