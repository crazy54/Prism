using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.WinShell.Shared;

/// <summary>
/// The windows module's glyphs, drawn in the Prism Control icon family's grammar (24-unit grid, 1.5 hairline, round caps,
/// live area 3–21, ink strokes + hue accents + glass facets). No logos: generic shapes only.
/// The manifest images (plugin/imgs/actions/windows/*) are written from these same paths (WinShell.Tests --write-icons).
/// </summary>
public static class WinGlyphs
{
    private const string Frame = "M5.25 4H18.75A2.25 2.25 0 0 1 21 6.25V13.75A2.25 2.25 0 0 1 18.75 16H5.25A2.25 2.25 0 0 1 3 13.75V6.25A2.25 2.25 0 0 1 5.25 4Z";
    private const string Stand = "M12 16V20M8.5 20H15.5";
    private const string Screen = "M5.25 4H18.75A2.25 2.25 0 0 1 21 6.25V13.75A2.25 2.25 0 0 1 18.75 16H5.25A2.25 2.25 0 0 1 3 13.75V6.25A2.25 2.25 0 0 1 5.25 4Z";

    private static IconGlyph G(string id, params IconPart[] parts) => new("windows." + id, parts);
    private static IconPart S(string d, double o = 1) => new(IconInk.Stroke, d, o);
    private static IconPart A(string d, double o = 1) => new(IconInk.Accent, d, o);
    private static IconPart F(string d, double o = 1) => new(IconInk.Facet, d, o);
    private static IconPart AS(string d, double o = 1) => new(IconInk.AccentSolid, d, o);

    public static readonly IconGlyph Window = G("window",
        F("M3 9H21V16.75A2.25 2.25 0 0 1 18.75 19H5.25A2.25 2.25 0 0 1 3 16.75Z"),
        S("M5.25 5H18.75A2.25 2.25 0 0 1 21 7.25V16.75A2.25 2.25 0 0 1 18.75 19H5.25A2.25 2.25 0 0 1 3 16.75V7.25A2.25 2.25 0 0 1 5.25 5Z"),
        S("M3 9H21"),
        A("M7 12.5H14M7 15.5H11"));

    public static readonly IconGlyph Browser = G("browser",
        F("M5 8H15A2 2 0 0 1 17 10V18A2 2 0 0 1 15 20H5A2 2 0 0 1 3 18V10A2 2 0 0 1 5 8Z"),
        S("M7 8V6A2 2 0 0 1 9 4H19A2 2 0 0 1 21 6V14A2 2 0 0 1 19 16H17", 0.55),
        S("M5 8H15A2 2 0 0 1 17 10V18A2 2 0 0 1 15 20H5A2 2 0 0 1 3 18V10A2 2 0 0 1 5 8Z"),
        A("M3 11.5H17"));

    public static readonly IconGlyph Desktops = G("desktops",
        F("M10.5 7H13.5A1 1 0 0 1 14.5 8V16A1 1 0 0 1 13.5 17H10.5A1 1 0 0 1 9.5 16V8A1 1 0 0 1 10.5 7Z"),
        S("M4 7H7A1 1 0 0 1 8 8V16A1 1 0 0 1 7 17H4A1 1 0 0 1 3 16V8A1 1 0 0 1 4 7Z", 0.6),
        A("M10.5 7H13.5A1 1 0 0 1 14.5 8V16A1 1 0 0 1 13.5 17H10.5A1 1 0 0 1 9.5 16V8A1 1 0 0 1 10.5 7Z"),
        S("M17 7H20A1 1 0 0 1 21 8V16A1 1 0 0 1 20 17H17A1 1 0 0 1 16 16V8A1 1 0 0 1 17 7Z", 0.6));

    public static readonly IconGlyph GameMode = G("game-mode",
        F("M7.5 8H16.5A4.5 4.5 0 0 1 21 12.5V13.5A3.5 3.5 0 0 1 15 15.9L14 15H10L9 15.9A3.5 3.5 0 0 1 3 13.5V12.5A4.5 4.5 0 0 1 7.5 8Z"),
        S("M7.5 8H16.5A4.5 4.5 0 0 1 21 12.5V13.5A3.5 3.5 0 0 1 15 15.9L14 15H10L9 15.9A3.5 3.5 0 0 1 3 13.5V12.5A4.5 4.5 0 0 1 7.5 8Z"),
        S("M7.5 10.5V13.5M6 12H9"),
        A("M15.5 10.75H15.51M17.5 13H17.51"));

    public static readonly IconGlyph Hdr = G("hdr",
        AS("M12 7.5A4.5 4.5 0 0 1 12 16.5Z"),
        S("M12 7.5A4.5 4.5 0 1 1 12 16.5A4.5 4.5 0 1 1 12 7.5Z"),
        A("M12 3V4.5M12 19.5V21M3 12H4.5M19.5 12H21M5.64 5.64L6.7 6.7M17.3 17.3L18.36 18.36M5.64 18.36L6.7 17.3M17.3 6.7L18.36 5.64"));

    public static readonly IconGlyph Refresh = G("refresh",
        F(Screen),
        S(Frame),
        S(Stand),
        A("M6 10C7.2 7 8.4 7 9.6 10S12 13 13.2 10S15.6 7 16.8 10S18 12 18 11"));

    public static readonly IconGlyph Monitor = G("monitor",
        F(Screen),
        S(Frame),
        S(Stand),
        A("M12 7.75A2.25 2.25 0 1 1 12 12.25A2.25 2.25 0 1 1 12 7.75Z"));

    public static readonly IconGlyph InputSource = G("input-source",
        F(Screen),
        S(Frame),
        S(Stand),
        A("M7.5 10H14.5M12 7.5L14.5 10L12 12.5"));

    public static readonly IconGlyph Placer = G("placer",
        F("M5.25 4H12V16H5.25A2.25 2.25 0 0 1 3 13.75V6.25A2.25 2.25 0 0 1 5.25 4Z"),
        S(Frame),
        S(Stand),
        A("M12 4V16"));

    public static readonly IconGlyph Zone = G("zone",
        F("M5.25 4H12V10H3V6.25A2.25 2.25 0 0 1 5.25 4Z"),
        S(Frame),
        S(Stand),
        A("M3 10H12V4"));

    public static readonly IconGlyph NextMonitor = G("next-monitor",
        F("M14.5 5H19.5A1.5 1.5 0 0 1 21 6.5V12.5A1.5 1.5 0 0 1 19.5 14H14.5A1.5 1.5 0 0 1 13 12.5V6.5A1.5 1.5 0 0 1 14.5 5Z"),
        S("M4.5 5H9.5A1.5 1.5 0 0 1 11 6.5V12.5A1.5 1.5 0 0 1 9.5 14H4.5A1.5 1.5 0 0 1 3 12.5V6.5A1.5 1.5 0 0 1 4.5 5Z", 0.6),
        S("M14.5 5H19.5A1.5 1.5 0 0 1 21 6.5V12.5A1.5 1.5 0 0 1 19.5 14H14.5A1.5 1.5 0 0 1 13 12.5V6.5A1.5 1.5 0 0 1 14.5 5Z"),
        A("M7 18.5H17M14.5 16L17 18.5L14.5 21"));

    public static readonly IconGlyph Maximize = G("maximize",
        F("M5.25 3H18.75A2.25 2.25 0 0 1 21 5.25V18.75A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V5.25A2.25 2.25 0 0 1 5.25 3Z", 0.6),
        S("M5.25 3H18.75A2.25 2.25 0 0 1 21 5.25V18.75A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V5.25A2.25 2.25 0 0 1 5.25 3Z"),
        A("M13.5 7H17V10.5M10.5 17H7V13.5M17 7L13 11M7 17L11 13"));

    public static readonly IconGlyph Topmost = G("topmost",
        F("M9 3.5H15L14 9L17 12.5V14H7V12.5L10 9Z"),
        S("M9 3.5H15L14 9L17 12.5V14H7V12.5L10 9Z"),
        A("M12 14V21"));

    public static IReadOnlyList<IconGlyph> All { get; } =
        [Window, Browser, Desktops, GameMode, Hdr, Refresh, Monitor, InputSource, Placer, Zone, NextMonitor, Maximize, Topmost];
}

/// <summary>Drawing helpers shared by the windows module's keys and widgets (Refraction look, Qt-safe subset only).</summary>
public static class WinArt
{
    public const double K = 144;

    /// <summary>The windows module's spectrum stop: periwinkle (λ 472), between Macros' violet and Cooling's azure.</summary>
    public static SpectrumColor Hue(RefractionPalette t) => t.Spectrum[1];

    /// <summary>The status colors: warn (citrine) and neg (coral) are reserved for alerts, never a domain hue.</summary>
    public static Color Warn(RefractionPalette t) => t.Warn;
    public static Color Neg(RefractionPalette t) => t.Neg;

    /// <summary>A glyph key, exactly like the manifest key image without a label; with a label the glyph shrinks.</summary>
    public static SvgDocument GlyphKey(RefractionPalette t, IconGlyph glyph, string? label = null, bool on = false, string? sub = null)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on);
        if (label is null) Icons.DrawOnKey(d, glyph, t, hue, 36, 30, 72, on);
        else
        {
            Icons.DrawOnKey(d, glyph, t, hue, 46, sub is null ? 18 : 12, 52, on);
            CenterText(d, label, sub is null ? 96 : 88, Refraction.Deck.LabelSize, on ? hue.Ink : t.KeyInk);
            if (sub is not null) CenterText(d, sub, 112, 16, t.KeyMuted);
        }
        KeyArt.HueIndex(d, hue, on);
        return d;
    }

    /// <summary>A label (top), a big value and an optional sub line. Alerts get the warn color, a ring and a corner notch.</summary>
    public static SvgDocument ValueKey(RefractionPalette t, string label, string value, string? sub = null, bool on = false, bool alert = false, IconGlyph? glyph = null)
    {
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, on);
        if (glyph is not null)
        {
            Icons.DrawOnKey(d, glyph, t, hue, 14, 14, 26, on);
            Text(d, label, 46, 34, StrokeFont.FitSize(label, K - 58, 18, 14), t.KeyMuted, TextAlign.Start);
        }
        else CenterText(d, label, 34, 20, t.KeyMuted);
        var color = alert ? t.Warn : on ? hue.Ink : t.KeyInk;
        var size = StrokeFont.FitSize(value, K - 24, Refraction.Deck.ValueSize, 20, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
        d.Text(value, K / 2, 74, size, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        if (sub is not null) CenterText(d, sub, 112, 16, alert ? t.Warn : t.KeyMuted);
        if (alert) AlertMarks(d, t);
        KeyArt.HueIndex(d, hue, on);
        return d;
    }

    /// <summary>Alerts never rely on color alone (Hues): a warn ring and a corner notch.</summary>
    public static void AlertMarks(SvgDocument d, RefractionPalette t, double w = K, double h = K)
    {
        // Keys get a 24-unit notch; 2:1 widgets a 14-unit one so it stays clear of their top-right label.
        var notch = w > h ? 14 : 24;
        d.Rect(2, 2, w - 4, h - 4, new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = w > h ? 2 : 3, Opacity = 0.9 }, rx: 8);
        d.Path(new PathBuilder().MoveTo(w - 2 - notch, 2).LineTo(w - 2, 2).LineTo(w - 2, 2 + notch).Close(), new Style { Fill = t.Warn });
    }

    /// <summary>
    /// The hold-to-confirm key (a frame of its own, so nothing behind it competes): a ring fills clockwise from the top over
    /// 1.5 s, "HOLD" on top, and the target named in the middle (<paramref name="what"/>: the app, the monitor...) with the
    /// effect below (<paramref name="effect"/>: "→ HDMI 1", "KILL", "RESTART").
    /// </summary>
    public static SvgDocument HoldKey(RefractionPalette t, double progress, string what, string? effect = null, string verb = "HOLD")
    {
        var d = KeyArt.Base(t);
        const double cx = K / 2, cy = K / 2, r = 60;
        d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = t.KeyMuted, StrokeWidth = 6, Opacity = 0.22 });
        var p = Math.Clamp(progress, 0, 1);
        if (p >= 0.999) d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 6 });
        else if (p > 0.005)
            d.Path(new PathBuilder().Arc(cx, cy, r, -90, -90 + 360 * p), new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 6, LineCap = LineCap.Round });
        CenterText(d, verb, 44, 16, t.Warn, 84);
        CenterText(d, what, effect is null ? 76 : 70, 22, t.KeyInk, 96);
        if (effect is not null) CenterText(d, effect, 98, 18, Hue(t).Ink, 92);
        return d;
    }

    /// <summary>The 2:1 dial version of the arm-then-confirm prompt: "PUSH AGAIN" plus what will happen.</summary>
    public static void ArmedBanner(SvgDocument d, RefractionPalette t, string what, TimeSpan remaining)
    {
        d.Rect(0, 62, 200, 38, t.BgDeep.WithOpacity(0.86));
        d.Rect(0, 62, 200, 2, t.Warn);
        var secs = Math.Max(1, (int)Math.Ceiling(remaining.TotalSeconds));
        d.Text($"PUSH AGAIN · {secs}", 12, 80, 14, t.Warn, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
        var size = StrokeFont.FitSize(what, 176, 14, 12);
        d.Text(StrokeFont.Ellipsize(what, 176, size), 12, 93, size, t.KeyInk, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle);
    }

    public static void CenterText(SvgDocument d, string text, double y, double size, Color color, double maxWidth = K - 20)
    {
        var s = StrokeFont.FitSize(text, maxWidth, size, Math.Min(size, 14));
        d.Text(StrokeFont.Ellipsize(text, maxWidth, s), K / 2, y, s, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
    }

    public static void Text(SvgDocument d, string text, double x, double y, double size, Color color, TextAlign align = TextAlign.Start, double maxWidth = 0, TextCase textCase = TextCase.SmallCaps, double tracking = 0)
    {
        var s = text;
        if (maxWidth > 0) s = StrokeFont.Ellipsize(text, maxWidth, size, FontWeight.Semibold, tracking, textCase);
        d.Text(s, x, y, size, color, align, FontWeight.Semibold, TextBaseline.Middle, tracking, textCase);
    }

    /// <summary>A dial label in the token style (uppercase, tracked, muted).</summary>
    public static void DialLabel(SvgDocument d, RefractionPalette t, string text, double x, double y, double maxWidth, Color? color = null) =>
        Text(d, text, x, y, Refraction.Deck.DialLabelSize, color ?? t.KeyMuted, TextAlign.Start, maxWidth, TextCase.Upper, Refraction.Deck.DialLabelTrackingEm);

    /// <summary>A rounded panel inset (thumbnail wells, list rows).</summary>
    public static void Well(SvgDocument d, RefractionPalette t, double x, double y, double w, double h, double r = 8) =>
        d.Rect(x, y, w, h, new Style { Fill = t.BgDeep, Stroke = t.Line, StrokeWidth = 1 }, rx: r);

    /// <summary>Frame budget check for previews and tests (each frame must stay under the app's 300-element limit).</summary>
    public static int Elements(SvgDocument d) => d.ElementCount;
}
