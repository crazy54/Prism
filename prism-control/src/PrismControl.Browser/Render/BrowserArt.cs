using System.Globalization;
using PrismControl.Browser.Hub;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Browser.Render;

public enum Tone { Normal, Info, Good, Warn, Error }

/// <summary>A short message drawn in a frame's text area (never over a favicon, artwork or preview).</summary>
public sealed record Notice(string Text, Tone Tone = Tone.Info, string? Sub = null);

public sealed record TabKeyView(StoredImage? Favicon, string Label, int? Unread, bool Audible, bool Muted, bool Active, string? GroupColor, bool Stale, Notice? Notice = null);
public sealed record MediaKeyView(StoredImage? Art, string Title, double? Fraction, bool Playing, bool Live, bool Pip, double Rate, Notice? Notice = null);
public sealed record DownloadKeyView(double? Fraction, string State, string Label, Notice? Notice = null);
public sealed record SiteKeyView(StoredImage? Favicon, string Label, int? Unread, bool Open, Notice? Notice = null);
public sealed record GroupKeyView(string Color, string Label, int Tabs, bool Collapsed, Notice? Notice = null);
public sealed record TabRow(StoredImage? Favicon, string Title, string? Meta, bool Active, bool Audible, bool Muted, int? Unread, bool IsCommand = false);
public sealed record TabsDialView(string Caption, string Position, IReadOnlyList<TabRow> Rows, int Highlight, double ScrollFraction, Notice? Notice = null);
public sealed record NowPlayingView(StoredImage? Art, string Caption, string Title, string? Artist, long? PositionMs, long? DurationMs, bool Playing, bool Live, double Rate, bool Pip, Notice? Notice = null);
public sealed record SpeedView(bool VolumeMode, double Rate, double? Volume, bool Muted, string Caption, Notice? Notice = null);
public sealed record PageView(bool ZoomMode, double Zoom, string Caption, Notice? Notice = null);
public sealed record PreviewView(StoredImage? Frame, string Caption, bool Fresh, Notice? Notice = null);

/// <summary>
/// Browser key and dial frames in the Refraction key grammar. Favicons, artwork and previews are live third-party
/// content shown as-is (the album-art rule: <see cref="ImageFit.Contain"/>, no corner radius, mask, tint or overlay;
/// text, badges and rings sit outside the image box). No browser or site logo is ever drawn as our own art.
/// The domain hue is cerulean (spectrum stop 3), a stop no other module uses.
/// </summary>
public static class BrowserArt
{
    public const int HueIndex = 3;
    public const double K = KeyArt.Size;

    public static SpectrumColor Hue(RefractionPalette t) => t.Spectrum[HueIndex];

    /// <summary>Chrome's nine group colors on the Refraction spectrum (grey is white light).</summary>
    public static SpectrumColor GroupHue(RefractionPalette t, string? color) => color switch
    {
        "blue" => t.Spectrum[2],
        "red" => t.Spectrum[10],
        "yellow" => t.Spectrum[8],
        "green" => t.Spectrum[6],
        "pink" => t.Spectrum[11],
        "purple" => t.Spectrum[0],
        "cyan" => t.Spectrum[4],
        "orange" => t.Spectrum[9],
        _ => Hues.White(t),
    };

    public static Color ToneColor(RefractionPalette t, Tone tone) => tone switch
    {
        Tone.Good => t.Pos,
        Tone.Warn => t.Warn,
        Tone.Error => t.Neg,
        Tone.Info => t.KeyInk,
        _ => t.KeyMuted,
    };

    // ------------------------------------------------------------------ text helpers

    public static string Fit(string text, double width, double size, TextCase textCase = TextCase.SmallCaps, double tracking = 0) =>
        StrokeFont.Ellipsize(text, width, size, FontWeight.Semibold, tracking, textCase);

    /// <summary>Two lines by words; the second is ellipsized. A single word too long for a line is ellipsized.</summary>
    public static (string Line1, string? Line2) Wrap2(string text, double width, double size)
    {
        if (StrokeFont.Measure(text, size) <= width) return (text, null);
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var line = "";
        var i = 0;
        for (; i < words.Length; i++)
        {
            var candidate = line.Length == 0 ? words[i] : line + " " + words[i];
            if (StrokeFont.Measure(candidate, size) > width) break;
            line = candidate;
        }
        if (line.Length == 0) return (Fit(text, width, size), null);
        var rest = string.Join(' ', words.Skip(i));
        return (line, rest.Length == 0 ? null : Fit(rest, width, size));
    }

    private static void Glyph(SvgDocument d, RefractionPalette t, IconGlyph g, SpectrumColor hue, double x, double y, double size, bool on = false, double? opacity = null)
    {
        if (opacity is { } o && o < 1)
        {
            using (d.Group(new Style { Opacity = o })) Icons.DrawOnKey(d, g, t, hue, x, y, size, on);
        }
        else Icons.DrawOnKey(d, g, t, hue, x, y, size, on);
    }

    private static void CenteredLines(SvgDocument d, RefractionPalette t, string text, double y1, double maxSize, double minSize, Color color, double width = 124)
    {
        var size = StrokeFont.FitSize(text, width, maxSize, minSize);
        if (StrokeFont.Measure(text, size) <= width) { d.Text(text, K / 2, y1 + size * 0.5, size, color, TextAlign.Middle); return; }
        var (a, b) = Wrap2(text, width, maxSize);
        d.Text(a, K / 2, y1, maxSize, color, TextAlign.Middle);
        if (b is not null) d.Text(b, K / 2, y1 + maxSize + 2, maxSize, color, TextAlign.Middle);
    }

    private static void Micro(SvgDocument d, RefractionPalette t, string text, double y, Color color) =>
        d.Text(Fit(text, 128, 13, TextCase.Upper, 0.08), K / 2, y, 13, color, TextAlign.Middle, tracking: 0.08, textCase: TextCase.Upper);

    // ------------------------------------------------------------------ generic keys

    /// <summary>A glyph key: the glyph (72 units, or 56 with a label), an optional label and an optional micro line on top.</summary>
    public static SvgDocument GlyphKey(RefractionPalette t, IconGlyph glyph, string? label, bool on = false, bool enabled = true, string? micro = null, Tone microTone = Tone.Normal, SpectrumColor? hue = null)
    {
        var h = hue ?? Hue(t);
        var lit = on && enabled;
        var d = KeyArt.Base(t, h, lit);
        var gy = micro is null ? (label is null ? 30 : 18) : (label is null ? 34 : 26);
        if (label is null) Glyph(d, t, glyph, h, 36, gy, 72, lit, enabled ? null : 0.4);
        else Glyph(d, t, glyph, h, 44, gy, 56, lit, enabled ? null : 0.4);
        if (micro is not null) Micro(d, t, micro, 20, microTone == Tone.Normal ? t.KeyMuted : ToneColor(t, microTone));
        if (label is not null)
        {
            var size = StrokeFont.FitSize(label, K - 24, Refraction.Deck.LabelSize, 15);
            d.Text(Fit(label, K - 20, size), K / 2, 110, size, enabled ? (lit ? h.Ink : t.KeyMuted) : t.Faint, TextAlign.Middle);
        }
        KeyArt.HueIndex(d, h, lit);
        return d;
    }

    /// <summary>A status key (no browser, permission needed, safe mode, refused): glyph, a headline and a one-line fix.</summary>
    public static SvgDocument MessageKey(RefractionPalette t, IconGlyph glyph, string line1, string? line2, Tone tone = Tone.Warn)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, false);
        Glyph(d, t, glyph, hue, 46, 14, 52, false, 0.85);
        var s1 = StrokeFont.FitSize(line1, 128, 20, 14);
        d.Text(Fit(line1, 130, s1), K / 2, 92, s1, ToneColor(t, tone), TextAlign.Middle);
        if (line2 is not null)
        {
            var (a, b) = Wrap2(line2, 124, 14);
            d.Text(a, K / 2, 112, 14, t.KeyMuted, TextAlign.Middle);
            if (b is not null) d.Text(b, K / 2, 128, 14, t.KeyMuted, TextAlign.Middle);
        }
        return d;
    }

    /// <summary>Unread badge: a number in a pill (citrine), or a dot for "activity, no count".</summary>
    private static void Badge(SvgDocument d, RefractionPalette t, int unread, double cx, double cy)
    {
        if (unread < 0)
        {
            d.Circle(cx, cy, 9, t.Warn);
            return;
        }
        var text = unread > 999 ? "999+" : unread.ToString(CultureInfo.InvariantCulture);
        var size = text.Length <= 2 ? 20 : 16;
        var w = Math.Max(34, StrokeFont.Measure(text, size) + 16);
        d.Rect(cx - w / 2, cy - 15, w, 30, t.Warn, rx: 15);
        d.Text(text, cx, cy, size, t.IsDark ? t.BgDeep : Color.White, TextAlign.Middle, baseline: TextBaseline.Middle);
    }

    // ------------------------------------------------------------------ tab key

    /// <summary>
    /// A tab slot: the favicon as-is (52 units, top center), the audible/muted mark top-left, the unread badge top-right,
    /// the title or domain below, the group color as a left edge, lit when it is the active tab. Stale (browser lost) dims.
    /// </summary>
    public static SvgDocument TabKey(RefractionPalette t, TabKeyView v)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, v.Active && !v.Stale);
        using (d.Group(new Style { Opacity = v.Stale ? 0.45 : null }))
        {
            if (v.GroupColor is { } gc) d.Rect(0, 10, 5, 124, GroupHue(t, gc).Vivid, rx: 2.5);
            if (v.Favicon is { } fav) d.Image(fav.Bytes, 46, 16, 52, 52, ImageFit.Contain);
            else Glyph(d, t, BrowserGlyphs.GlobeGlyph, hue, 46, 16, 52);
            if (v.Muted) Glyph(d, t, BrowserGlyphs.SpeakerMuted, hue, 10, 10, 30, false);
            else if (v.Audible) Glyph(d, t, BrowserGlyphs.Speaker, hue, 10, 10, 30, true);
            if (v.Unread is { } u && u != 0) Badge(d, t, u, 116, 26);
            if (v.Notice is null) CenteredLines(d, t, v.Label, 96, 19, 15, v.Active ? t.KeyInk : t.KeyMuted);
        }
        if (v.Notice is { } n)
        {
            // Notices are never dimmed: "RECONNECTING" must read clearly over a stale tab.
            var s = StrokeFont.FitSize(n.Text, 128, 18, 13);
            d.Text(Fit(n.Text, 130, s), K / 2, 98, s, ToneColor(t, n.Tone), TextAlign.Middle);
            if (n.Sub is { } sub) d.Text(Fit(sub, 128, 14), K / 2, 118, 14, t.KeyMuted, TextAlign.Middle);
        }
        KeyArt.HueIndex(d, hue, v.Active && !v.Stale);
        return d;
    }

    /// <summary>After a hold closed a tab: press within the window to bring it back.</summary>
    public static SvgDocument UndoKey(RefractionPalette t, int secondsLeft)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, true);
        Glyph(d, t, BrowserGlyphs.Undo, hue, 46, 14, 52, true);
        d.Text("CLOSED", K / 2, 92, 20, t.KeyInk, TextAlign.Middle);
        d.Text($"PRESS TO UNDO · {Math.Max(1, secondsLeft)}", K / 2, 114, 14, hue.Ink, TextAlign.Middle);
        KeyArt.HueIndex(d, hue, true);
        return d;
    }

    // ------------------------------------------------------------------ media key

    /// <summary>
    /// Media: the artwork whole (66 units) inside a progress ring that never touches it, the title below. Paused text
    /// dims (the art never does). Live streams show a LIVE pill instead of progress.
    /// </summary>
    public static SvgDocument MediaKey(RefractionPalette t, MediaKeyView v)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, false);
        const double cx = 72, cy = 58, r = 52;
        var ring = new PathBuilder().Circle(cx, cy, r);
        d.Path(ring, new Style { Fill = Paint.None, Stroke = t.IsDark ? t.LineStrong : t.Line, StrokeWidth = 5 });
        if (v.Live)
        {
            d.Rect(50, 104, 44, 16, t.Neg, rx: 8);
            d.Text("LIVE", 72, 112, 11, t.IsDark ? t.BgDeep : Color.White, TextAlign.Middle, baseline: TextBaseline.Middle, textCase: TextCase.Upper);
        }
        else if (v.Fraction is { } f && f > 0)
        {
            var end = -90 + 360 * Math.Clamp(f, 0, 0.9999);
            d.Path(new PathBuilder().Arc(cx, cy, r, -90, end), new Style { Fill = Paint.None, Stroke = v.Playing ? hue.Vivid : t.Muted, StrokeWidth = 5, LineCap = LineCap.Round });
        }
        if (v.Art is { } art)
        {
            // Artwork fills the ring (66); a small favicon (the zero-permission tier) stays near its size (48).
            var box = art.Width <= 64 && art.Height <= 64 ? 48 : 66;
            d.Image(art.Bytes, cx - box / 2.0, cy - box / 2.0, box, box, ImageFit.Contain);
        }
        else Glyph(d, t, BrowserGlyphs.Media, hue, cx - 27, cy - 27, 54, v.Playing);
        if (v.Pip) Glyph(d, t, BrowserGlyphs.Pip, hue, 106, 4, 30, true);
        if (Math.Abs(v.Rate - 1) > 0.01)
        {
            var rate = FormatRate(v.Rate);
            d.Text(rate, 10, 22, 15, hue.Ink);
        }
        if (v.Notice is { } n)
        {
            d.Text(Fit(n.Text, 132, 16), K / 2, 137, 16, ToneColor(t, n.Tone), TextAlign.Middle);
            return d;
        }
        var size = StrokeFont.FitSize(v.Title, 128, 18, 15);
        d.Text(Fit(v.Title, 132, size), K / 2, 137, size, v.Playing ? t.KeyInk : t.KeyMuted, TextAlign.Middle);
        return d;
    }

    public static string FormatRate(double rate) => (Math.Abs(rate - Math.Round(rate)) < 0.001 ? rate.ToString("0", CultureInfo.InvariantCulture) : rate.ToString("0.##", CultureInfo.InvariantCulture)) + "×";

    // ------------------------------------------------------------------ download, site, group

    public static SvgDocument DownloadKey(RefractionPalette t, DownloadKeyView v)
    {
        var hue = Hue(t);
        var done = v.State == "done";
        var d = KeyArt.Base(t, hue, v.State == "active");
        const double cx = 72, cy = 60, r = 48;
        d.Path(new PathBuilder().Circle(cx, cy, r), new Style { Fill = Paint.None, Stroke = t.IsDark ? t.LineStrong : t.Line, StrokeWidth = 6 });
        if (done) d.Path(new PathBuilder().Circle(cx, cy, r), new Style { Fill = Paint.None, Stroke = t.Pos, StrokeWidth = 6 });
        else if (v.Fraction is { } f && f > 0)
            d.Path(new PathBuilder().Arc(cx, cy, r, -90, -90 + 360 * Math.Clamp(f, 0, 0.9999)),
                new Style { Fill = Paint.None, Stroke = v.State == "paused" ? t.Muted : v.State == "failed" ? t.Neg : hue.Vivid, StrokeWidth = 6, LineCap = LineCap.Round });
        if (v.State == "active" && v.Fraction is { } pf)
            d.Text((pf * 100).ToString("0", CultureInfo.InvariantCulture) + "%", cx, cy, 30, t.KeyInk, TextAlign.Middle, baseline: TextBaseline.Middle);
        else Glyph(d, t, done ? BrowserGlyphs.DownloadDone : BrowserGlyphs.Download, hue, cx - 24, cy - 24, 48, v.State == "active");
        var label = v.Notice?.Text ?? v.Label;
        var color = v.Notice is { } n ? ToneColor(t, n.Tone) : v.State == "failed" ? t.Neg : done ? t.Pos : t.KeyMuted;
        var size = StrokeFont.FitSize(label, 128, 17, 13);
        d.Text(Fit(label, 132, size), K / 2, 132, size, color, TextAlign.Middle);
        return d;
    }

    public static SvgDocument SiteKey(RefractionPalette t, SiteKeyView v)
    {
        var hue = Hue(t);
        var lit = v.Unread is { } un && un != 0;
        var d = KeyArt.Base(t, hue, lit);
        if (v.Favicon is { } fav) d.Image(fav.Bytes, 52, 12, 40, 40, ImageFit.Contain);
        else Glyph(d, t, BrowserGlyphs.Site, hue, 52, 12, 40, lit);
        if (v.Notice is { } n)
        {
            var s = StrokeFont.FitSize(n.Text, 128, 18, 13);
            d.Text(Fit(n.Text, 130, s), K / 2, 88, s, ToneColor(t, n.Tone), TextAlign.Middle);
            if (n.Sub is { } sub) d.Text(Fit(sub, 128, 14), K / 2, 108, 14, t.KeyMuted, TextAlign.Middle);
        }
        else
        {
            var value = v.Unread switch
            {
                null or 0 => v.Open ? "0" : "–",
                < 0 => "NEW",
                > 9999 => "9999+",
                { } c => c.ToString(CultureInfo.InvariantCulture),
            };
            var vs = StrokeFont.FitSize(value, 120, Refraction.Deck.ValueSize, 26);
            d.Text(value, K / 2, 82, vs, lit ? hue.Ink : t.KeyMuted, TextAlign.Middle, baseline: TextBaseline.Middle);
        }
        var ls = StrokeFont.FitSize(v.Label, 124, 16, 12);
        d.Text(Fit(v.Label, 128, ls), K / 2, 122, ls, v.Open ? t.KeyMuted : t.Faint, TextAlign.Middle);
        KeyArt.HueIndex(d, hue, lit);
        return d;
    }

    public static SvgDocument GroupKey(RefractionPalette t, GroupKeyView v)
    {
        var gh = GroupHue(t, v.Color);
        var d = KeyArt.Base(t, gh, !v.Collapsed);
        Glyph(d, t, BrowserGlyphs.Group, gh, 44, 14, 56, !v.Collapsed);
        if (v.Notice is { } n)
        {
            d.Text(Fit(n.Text, 130, 16), K / 2, 96, 16, ToneColor(t, n.Tone), TextAlign.Middle);
            if (n.Sub is { } sub) d.Text(Fit(sub, 128, 14), K / 2, 116, 14, t.KeyMuted, TextAlign.Middle);
        }
        else
        {
            var size = StrokeFont.FitSize(v.Label, 124, 19, 14);
            d.Text(Fit(v.Label, 128, size), K / 2, 96, size, v.Collapsed ? t.KeyMuted : t.KeyInk, TextAlign.Middle);
            Micro(d, t, v.Collapsed ? "COLLAPSED" : v.Tabs.ToString(CultureInfo.InvariantCulture) + (v.Tabs == 1 ? " TAB" : " TABS"), 116, t.KeyMuted);
        }
        KeyArt.HueIndex(d, gh, !v.Collapsed);
        return d;
    }

    public static SvgDocument PrivacyKey(RefractionPalette t, string level, bool auto, bool panic)
    {
        var glyph = level switch { "domain" => BrowserGlyphs.PrivacyDomain, "hidden" => BrowserGlyphs.PrivacyHidden, _ => BrowserGlyphs.Privacy };
        var label = level switch { "domain" => "DOMAINS", "hidden" => "HIDDEN", _ => "OFF" };
        var micro = panic ? "PANIC" : auto ? "SAFE · AUTO" : "STREAMER SAFE";
        return GlyphKey(t, glyph, label, on: level != "full", micro: micro, microTone: panic ? Tone.Error : level != "full" ? Tone.Good : Tone.Normal);
    }

    public static SvgDocument PanicKey(RefractionPalette t, bool active) =>
        active
            ? GlyphKey(t, BrowserGlyphs.Panic, "PANIC ON", on: true, micro: "PRESS TO END", microTone: Tone.Error, hue: t.Spectrum[10])
            : GlyphKey(t, BrowserGlyphs.Panic, "PANIC", on: false);

    public static SvgDocument MeetKey(RefractionPalette t, string control, bool? state, bool available, Notice? notice = null)
    {
        if (!available)
        {
            var g = control switch { "camera" => BrowserGlyphs.Camera, "hangup" => BrowserGlyphs.HangUp, _ => BrowserGlyphs.Mic };
            return GlyphKey(t, g, notice?.Text ?? "NO MEETING", on: false, enabled: false);
        }
        return control switch
        {
            "camera" => GlyphKey(t, state == false ? BrowserGlyphs.CameraOff : BrowserGlyphs.Camera, state == false ? "CAM OFF" : state == true ? "CAM ON" : "CAMERA",
                on: state == true, micro: notice?.Text, microTone: notice?.Tone ?? Tone.Normal),
            "hangup" => GlyphKey(t, BrowserGlyphs.HangUp, "END CALL", on: false, micro: notice?.Text ?? "HOLD", microTone: notice?.Tone ?? Tone.Normal, hue: t.Spectrum[10]),
            _ => GlyphKey(t, state == false ? BrowserGlyphs.MicOff : BrowserGlyphs.Mic, state == false ? "MUTED" : state == true ? "MIC ON" : "MIC",
                on: state == true, micro: notice?.Text, microTone: notice?.Tone ?? Tone.Normal),
        };
    }

    // ------------------------------------------------------------------ dials (200×100: Stream Deck + segment, Galleon widget)

    private static void Caption(SvgDocument d, RefractionPalette t, string text, double x, double y, double width, Color? color = null) =>
        d.Text(Fit(text, width, 10, TextCase.Upper, 0.08), x, y, 10, color ?? t.Dim, tracking: 0.08, textCase: TextCase.Upper);

    private static void NoticeLine(SvgDocument d, RefractionPalette t, Notice n, double x, double y, double w)
    {
        var size = StrokeFont.FitSize(n.Text, w, 11, 9);
        d.Text(Fit(n.Text, w, size), x, y, size, ToneColor(t, n.Tone == Tone.Info ? Tone.Good : n.Tone));
    }

    /// <summary>A message frame: a glyph tile and up to three lines (no browser, permission, safe mode, refused).</summary>
    public static SvgDocument MessageDial(RefractionPalette t, IconGlyph glyph, string caption, string line1, string? line2, bool active, Tone tone = Tone.Warn)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        // A compact glyph tile leaves 116 units for the text, so the headline usually fits on one line and the fix
        // line gets up to three.
        d.Rect(10, 22, 56, 56, t.IsDark ? Color.FromHex("#141821") : t.Panel2, rx: 8);
        Icons.DrawOnKey(d, glyph, t, hue, 17, 29, 42, active);
        const double x = 76, w = 116;
        Caption(d, t, caption, x, 24, w);
        var c1 = tone == Tone.Normal ? t.KeyInk : ToneColor(t, tone);
        var one = StrokeFont.FitSize(line1, w, 14, 12);
        double y;
        if (StrokeFont.Measure(line1, one) <= w)
        {
            d.Text(line1, x, 45, one, c1);
            y = 62;
        }
        else
        {
            var (a, b) = Wrap2(line1, w, 13);
            d.Text(a, x, 44, 13, c1);
            if (b is not null) d.Text(b, x, 59, 13, c1);
            y = b is null ? 62 : 76;
        }
        if (line2 is not null)
        {
            // The fix line matters most: give it every line that is left (13 units apart), the last one ellipsized.
            var rest = line2;
            while (rest.Length > 0 && y <= 92)
            {
                var last = y + 13 > 92;
                var (c, e) = last ? (Fit(rest, w, 11), (string?)null) : Wrap2(rest, w, 11);
                d.Text(c, x, y, 11, t.Muted);
                if (e is null || last) break;
                rest = rest[Math.Min(rest.Length, c.Length)..].TrimStart();
                y += 13;
            }
        }
        return d;
    }

    /// <summary>
    /// The tab browser (Galleon widget and Stream Deck + segment): caption and position, the previous row, the focused
    /// row (favicon 36, title, meta), the next row and a scrollbar. Favicons are whole; the focus bar sits left of them.
    /// </summary>
    public static SvgDocument TabsDial(RefractionPalette t, TabsDialView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        Caption(d, t, v.Caption, 10, 14, 130, t.Accent);
        d.Text(v.Position, 190, 14, 10, t.Muted, TextAlign.End);
        if (v.Rows.Count == 0)
        {
            d.Text("No tabs", 58, 53, 14, t.KeyMuted);
            return d;
        }
        void Small(int index, double y)
        {
            if (index < 0 || index >= v.Rows.Count) return;
            var row = v.Rows[index];
            if (row.Favicon is { } f) d.Image(f.Bytes, 10, y, 14, 14, ImageFit.Contain);
            else if (row.IsCommand) Icons.DrawOnKey(d, BrowserGlyphs.Tabs, t, hue, 10, y, 14);
            else Icons.DrawOnKey(d, BrowserGlyphs.GlobeGlyph, t, hue, 10, y, 14);
            d.Text(Fit(row.Title, 150, 10), 30, y + 11, 10, row.Active ? t.KeyInk : t.KeyMuted, opacity: 0.65);
        }
        Small(v.Highlight - 1, 19);
        var cur = v.Rows[Math.Clamp(v.Highlight, 0, v.Rows.Count - 1)];
        d.Rect(2, 36, 3, 42, t.Accent, rx: 1.5);
        if (cur.Favicon is { } fav) d.Image(fav.Bytes, 12, 39, 36, 36, ImageFit.Contain);
        else Icons.DrawOnKey(d, cur.IsCommand ? BrowserGlyphs.Tabs : BrowserGlyphs.GlobeGlyph, t, hue, 12, 39, 36, active);
        var marks = 0.0;
        if (cur.Unread is { } u && u != 0)
        {
            var text = u < 0 ? "•" : u > 99 ? "99+" : u.ToString(CultureInfo.InvariantCulture);
            var bw = Math.Max(16, StrokeFont.Measure(text, 10) + 9);
            d.Rect(190 - bw, 41, bw, 15, t.Warn, rx: 7.5);
            d.Text(text, 190 - bw / 2, 48.5, 10, t.IsDark ? t.BgDeep : Color.White, TextAlign.Middle, baseline: TextBaseline.Middle);
            marks = bw + 4;
        }
        var titleWidth = 132 - marks;
        var ts = StrokeFont.FitSize(cur.Title, titleWidth, 14, 12);
        d.Text(Fit(cur.Title, titleWidth, ts), 56, 53, ts, cur.IsCommand ? t.Accent : t.KeyInk);
        if (v.Notice is { } n) NoticeLine(d, t, n, 56, 69, 134);
        else
        {
            var meta = cur.Meta ?? "";
            if (cur.Muted) meta = meta.Length == 0 ? "Muted" : meta + " · Muted";
            else if (cur.Audible) meta = meta.Length == 0 ? "Playing sound" : meta + " · Playing sound";
            if (meta.Length > 0) d.Text(Fit(meta, 134, 10), 56, 69, 10, cur.Audible && !cur.Muted ? hue.Ink : t.Muted);
        }
        Small(v.Highlight + 1, 83);
        if (v.Rows.Count > 1)
        {
            d.Rect(195, 19, 2, 76, t.Line, rx: 1);
            var thumb = Math.Max(8, 76.0 / v.Rows.Count * 3);
            d.Rect(194.5, 19 + (76 - thumb) * Math.Clamp(v.ScrollFraction, 0, 1), 3, thumb, t.Accent, rx: 1.5);
        }
        return d;
    }

    public static string Duration(long? ms)
    {
        if (ms is not { } v || v < 0) return "–:––";
        var s = v / 1000;
        return s >= 3600 ? $"{s / 3600}:{s / 60 % 60:00}:{s % 60:00}" : $"{s / 60}:{s % 60:00}";
    }

    /// <summary>Now playing (scrub dial): artwork whole (76) left, caption, title, artist, progress and times beside it.</summary>
    public static SvgDocument NowPlayingDial(RefractionPalette t, NowPlayingView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        const double ax = 10, ay = 12, asz = 76, x = 96, w = 94;
        if (v.Art is { } art) d.Image(art.Bytes, ax, ay, asz, asz, ImageFit.Contain);
        else
        {
            d.Rect(ax, ay, asz, asz, t.IsDark ? Color.FromHex("#141821") : t.Panel2, rx: 8);
            Icons.DrawOnKey(d, BrowserGlyphs.Media, t, hue, ax + 14, ay + 14, asz - 28, v.Playing);
        }
        var right = 0.0;
        if (v.Pip) { Icons.DrawOnKey(d, BrowserGlyphs.Pip, t, hue, x + w - 14, 13, 14, true); right += 17; }
        if (Math.Abs(v.Rate - 1) > 0.01)
        {
            var rate = FormatRate(v.Rate);
            var rw = StrokeFont.Measure(rate, 10);
            d.Text(rate, x + w - right, 23, 10, hue.Ink, TextAlign.End);
            right += rw + 5;
        }
        Caption(d, t, v.Caption, x, 23, w - right);
        var ts = StrokeFont.FitSize(v.Title, w, 16, 13);
        d.Text(Fit(v.Title, w, ts), x, 43, ts, v.Playing ? t.KeyInk : t.KeyMuted);
        if (v.Notice is { } n) NoticeLine(d, t, n, x, 60, w);
        else if (v.Artist is { Length: > 0 } artist) d.Text(Fit(artist, w, 12), x, 60, 12, t.Muted);
        if (v.Live)
        {
            d.Rect(x, 72, 34, 14, t.Neg, rx: 7);
            d.Text("LIVE", x + 17, 79, 9, t.IsDark ? t.BgDeep : Color.White, TextAlign.Middle, baseline: TextBaseline.Middle, textCase: TextCase.Upper);
            d.Text(Duration(v.PositionMs), x + w, 83, 11, t.Dim, TextAlign.End);
            return d;
        }
        var f = v.DurationMs is > 0 && v.PositionMs is { } p ? Math.Clamp((double)p / v.DurationMs.Value, 0, 1) : 0;
        d.Rect(x, 70, w, 4, t.Panel2, rx: 2);
        if (f > 0) d.Rect(x, 70, Math.Max(4, w * f), 4, v.Playing ? hue.Vivid : t.Muted, rx: 2);
        d.Text(Duration(v.PositionMs), x, 89, 11, t.Dim);
        d.Text(Duration(v.DurationMs), x + w, 89, 11, t.Dim, TextAlign.End);
        return d;
    }

    /// <summary>Speed (the 0.25×–4× ladder as ticks) or volume (a meter); the push hint tells the other mode.</summary>
    public static SvgDocument SpeedDial(RefractionPalette t, SpeedView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        Caption(d, t, v.VolumeMode ? "Volume" : "Speed", 16, 22, 70, t.Accent);
        d.Text(Fit(v.Caption, 100, 10), 184, 22, 10, t.Dim, TextAlign.End);
        string value;
        if (v.VolumeMode) value = v.Muted ? "MUTED" : v.Volume is { } vol ? (vol * 100).ToString("0", CultureInfo.InvariantCulture) + "%" : "--";
        else value = FormatRate(v.Rate);
        var vs = StrokeFont.FitSize(value, 110, Refraction.Deck.DialValueSize, 18);
        d.Text(value, 16, 60, vs, v.Muted ? t.Neg : active ? hue.Ink : t.KeyInk);
        if (v.Notice is { } n) NoticeLine(d, t, n, 112, 58, 76);
        else d.Text(v.VolumeMode ? "push: speed" : "push: volume", 184, 58, 10, t.Faint, TextAlign.End);
        if (v.VolumeMode)
        {
            const double mx = 16, mw = 168, my = 76, mh = 6;
            d.Rect(mx, my, mw, mh, t.Panel2, rx: mh / 2);
            if (!v.Muted && v.Volume is { } vv && vv > 0)
            {
                var grad = d.LinearGradient(mx, 0, mx + mw, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true);
                d.Rect(mx, my, Math.Max(mh, mw * vv), mh, new Style { Fill = grad, Filter = active ? d.Glow(2.5) : null }, rx: mh / 2);
            }
        }
        else
        {
            var ladder = Protocol.Wire.SpeedLadder;
            var path = new PathBuilder();
            var lit = new PathBuilder();
            for (var i = 0; i < ladder.Length; i++)
            {
                var x = 16 + i * (168.0 / (ladder.Length - 1));
                var on = Math.Abs(ladder[i] - v.Rate) < 0.01;
                var tall = Math.Abs(ladder[i] - 1) < 0.01;
                (on ? lit : path).RoundedRect(x - 2, tall ? 72 : 75, 4, tall ? 14 : 8, 2);
            }
            d.Path(path, new Style { Fill = t.IsDark ? t.LineControl : t.Faint });
            if (!lit.IsEmpty) d.Path(lit, new Style { Fill = hue.Vivid, Filter = active ? d.Glow(2) : null });
            d.Text("0.25×", 16, 96, 8, t.Faint);
            d.Text("4×", 184, 96, 8, t.Faint, TextAlign.End);
        }
        return d;
    }

    /// <summary>Page: scroll mode (arrows) or zoom mode (value + Chrome's ladder); push switches.</summary>
    public static SvgDocument PageDial(RefractionPalette t, PageView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        Caption(d, t, v.ZoomMode ? "Zoom" : "Scroll", 16, 22, 70, t.Accent);
        d.Text(Fit(v.Caption, 100, 10), 184, 22, 10, t.Dim, TextAlign.End);
        if (v.ZoomMode)
        {
            var value = (v.Zoom * 100).ToString("0", CultureInfo.InvariantCulture) + "%";
            var vs = StrokeFont.FitSize(value, 110, Refraction.Deck.DialValueSize, 18);
            d.Text(value, 16, 60, vs, active ? hue.Ink : t.KeyInk);
            var ladder = Protocol.Wire.ZoomLadder;
            var path = new PathBuilder();
            var lit = new PathBuilder();
            var nearest = ladder.Select((z, i) => (Math.Abs(z - v.Zoom), i)).Min().i;
            for (var i = 0; i < ladder.Length; i++)
            {
                var x = 16 + i * (168.0 / (ladder.Length - 1));
                var tall = Math.Abs(ladder[i] - 1) < 0.01;
                (i == nearest ? lit : path).RoundedRect(x - 2, tall ? 72 : 75, 4, tall ? 14 : 8, 2);
            }
            d.Path(path, new Style { Fill = t.IsDark ? t.LineControl : t.Faint });
            d.Path(lit, new Style { Fill = hue.Vivid, Filter = active ? d.Glow(2) : null });
        }
        else
        {
            Icons.DrawOnKey(d, BrowserGlyphs.Page, t, hue, 14, 32, 44, active);
            d.Text("Turn to scroll", 66, 52, 14, t.KeyInk);
            if (v.Notice is { } sn) NoticeLine(d, t, sn, 66, 70, 124);
            else d.Text("Fast spins scroll further", 66, 70, 10, t.Muted);
            d.Text("push: zoom", 184, 92, 10, t.Faint, TextAlign.End);
            return d;
        }
        if (v.Notice is { } n) NoticeLine(d, t, n, 112, 58, 76);
        else d.Text("push: scroll", 184, 58, 10, t.Faint, TextAlign.End);
        return d;
    }

    /// <summary>Live preview: the captured frame whole (≤ 2 fps) under a caption strip; stale frames say so.</summary>
    public static SvgDocument PreviewDial(RefractionPalette t, PreviewView v, bool active)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        d.Circle(13, 8, 3, v.Fresh ? t.Neg : t.Faint);
        Caption(d, t, v.Caption, 21, 12, 170, v.Fresh ? t.KeyMuted : t.Dim);
        if (v.Frame is { } f) d.Image(f.Bytes, 14, 15, 172, 83, ImageFit.Contain);
        else
        {
            d.Rect(14, 18, 172, 78, t.IsDark ? Color.FromHex("#141821") : t.Panel2, rx: 6);
            Icons.DrawOnKey(d, BrowserGlyphs.Preview, t, hue, 24, 34, 44);
            var n = v.Notice ?? new Notice("Waiting for the first frame", Tone.Normal);
            var (a, b) = Wrap2(n.Text, 104, 12);
            d.Text(a, 76, 54, 12, n.Tone == Tone.Normal ? t.KeyMuted : ToneColor(t, n.Tone));
            if (b is not null) d.Text(b, 76, 69, 12, n.Tone == Tone.Normal ? t.KeyMuted : ToneColor(t, n.Tone));
            if (n.Sub is { } sub) d.Text(Fit(sub, 104, 10), 76, b is null ? 70 : 85, 10, t.Dim);
        }
        return d;
    }
}
