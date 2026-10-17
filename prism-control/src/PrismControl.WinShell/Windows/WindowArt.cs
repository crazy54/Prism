using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>What a live window key shows (built by the action, drawn by <see cref="WindowArt.Key"/>).</summary>
public sealed record WindowKeyModel
{
    /// <summary>Title, or the app name in streamer-safe mode. Null for an empty slot.</summary>
    public string? Caption { get; init; }
    public string AppName { get; init; } = "";
    public ThumbnailFrame? Thumbnail { get; init; }
    /// <summary>App icon PNG (64 px).</summary>
    public byte[]? Icon { get; init; }
    public bool Minimized { get; init; }
    public bool Elevated { get; init; }
    public bool Foreground { get; init; }
    /// <summary>No window for this slot: <see cref="EmptyLabel"/> explains ("NO WINDOW", "NOT RUNNING").</summary>
    public bool Empty { get; init; }
    public string? EmptyLabel { get; init; }
    public string? Flash { get; init; }
    public bool FlashAlert { get; init; }
    public int Slot { get; init; } = 1;
}

/// <summary>What the browser widget shows.</summary>
public sealed record BrowserModel
{
    public int Index { get; init; }
    public int Count { get; init; }
    public string AppName { get; init; } = "";
    /// <summary>The title overlay; null in streamer-safe mode.</summary>
    public string? Title { get; init; }
    public ThumbnailFrame? Thumbnail { get; init; }
    public byte[]? Icon { get; init; }
    public bool Minimized { get; init; }
    public bool Elevated { get; init; }
    public bool Foreground { get; init; }
    public bool Active { get; init; }
    public string? Flash { get; init; }
    public bool FlashAlert { get; init; }
    public bool Unavailable { get; init; }
}

/// <summary>Frames for the live window key and the window browser (Qt-safe; &lt; 60 elements each).</summary>
public static class WindowArt
{
    private const double K = WinArt.K;
    // The thumbnail well on a key: 132×86 units (the thumbnail lease asks for 136×88 px).
    private const double WellX = 6, WellY = 6, WellW = 132, WellH = 86;

    public static SvgDocument Key(RefractionPalette t, WindowKeyModel m)
    {
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue, m.Foreground && !m.Empty);
        if (m.Empty)
        {
            Icons.DrawOnKey(d, WinGlyphs.Window, t, hue, 46, 20, 52, false);
            WinArt.CenterText(d, m.EmptyLabel ?? "NO WINDOW", 94, 18, t.KeyMuted);
            if (m.Caption is { Length: > 0 } app) WinArt.CenterText(d, app, 116, 16, t.KeyMuted);
            else WinArt.CenterText(d, $"SLOT {m.Slot}", 116, 16, t.Faint);
            KeyArt.HueIndex(d, hue, false);
            return d;
        }

        WinArt.Well(d, t, WellX, WellY, WellW, WellH, 7);
        var showThumb = !m.Minimized && m.Thumbnail is { } thumb;
        if (showThumb)
        {
            var f = m.Thumbnail!;
            d.Image(DataUri.Image(f.Jpeg, "image/jpeg"), f.Width, f.Height, WellX + 1, WellY + 1, WellW - 2, WellH - 2, ImageFit.Contain, cornerRadius: 6);
        }
        else if (m.Icon is { } icon)
        {
            // Minimized (no frames) or not captured yet: the app icon, big, in the well.
            d.Image(icon, K / 2 - 26, WellY + 10, 52, 52, ImageFit.Contain);
        }
        else Icons.DrawOnKey(d, WinGlyphs.Window, t, hue, K / 2 - 24, WellY + 12, 48, false);

        if (m.Minimized) Pill(d, t, "MINIMIZED", K / 2, WellY + WellH - 12, t.KeyMuted, center: true);
        if (m.Elevated) Pill(d, t, "ADMIN", WellX + WellW - 6, WellY + 12, t.Warn, center: false);

        // Bottom row: icon badge + caption (or a flash message).
        var hasBadge = m.Icon is not null && showThumb;
        if (hasBadge)
        {
            d.Rect(8, 98, 30, 30, new Style { Fill = t.BgDeep, Stroke = t.Line, StrokeWidth = 1 }, rx: 7);
            d.Image(m.Icon!, 11, 101, 24, 24, ImageFit.Contain);
        }
        var textX = hasBadge ? 44 : 10;
        var width = K - textX - 10;
        if (m.Flash is { } flash)
        {
            var c = m.FlashAlert ? t.Warn : hue.Ink;
            var size = StrokeFont.FitSize(flash, width, 18, 14);
            WinArt.Text(d, flash, textX, 113, size, c, TextAlign.Start, width);
            if (m.FlashAlert) WinArt.AlertMarks(d, t);
        }
        else
        {
            var caption = m.Caption ?? m.AppName;
            WinArt.Text(d, caption, textX, 113, 18, m.Foreground ? hue.Ink : t.KeyInk, TextAlign.Start, width);
        }
        KeyArt.HueIndex(d, hue, m.Foreground);
        return d;
    }

    /// <summary>A small rounded label (MINIMIZED, ADMIN). <paramref name="center"/>: x is the center; else x is the right edge.</summary>
    public static void Pill(SvgDocument d, RefractionPalette t, string text, double x, double y, Color color, bool center, double size = 13)
    {
        var w = StrokeFont.Measure(text, size, FontWeight.Semibold, 0.06, TextCase.Upper) + 12;
        var left = center ? x - w / 2 : x - w;
        d.Rect(left, y - 9, w, 18, new Style { Fill = t.BgDeep, Stroke = color, StrokeWidth = 1.2, Opacity = 0.95 }, rx: 9);
        d.Text(text, left + w / 2, y, size, color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
    }

    // ---------------------------------------------------------------- the browser widget (200×100 canvas)

    private const double PX = 6, PY = 6, PW = 124, PH = 88;

    public static SvgDocument Browser(RefractionPalette t, BrowserModel m)
    {
        var hue = WinArt.Hue(t);
        var d = DialArt.Base(t, hue, m.Active);
        if (m.Unavailable || m.Count == 0)
        {
            Icons.DrawOnKey(d, WinGlyphs.Browser, t, hue, 16, 24, 52, false);
            WinArt.DialLabel(d, t, "WINDOWS", 84, 36, 110);
            WinArt.Text(d, m.Unavailable ? "Unavailable" : "No windows", 84, 60, 18, t.KeyInk, TextAlign.Start, 110);
            return d;
        }
        d.Rect(PX, PY, PW, PH, new Style { Fill = t.BgDeep, Stroke = m.Foreground ? hue.Vivid : t.Line, StrokeWidth = m.Foreground ? 1.6 : 1 }, rx: 6);
        if (!m.Minimized && m.Thumbnail is { } f)
            d.Image(DataUri.Image(f.Jpeg, "image/jpeg"), f.Width, f.Height, PX + 1, PY + 1, PW - 2, PH - 2, ImageFit.Contain, cornerRadius: 5);
        else if (m.Icon is { } icon) d.Image(icon, PX + PW / 2 - 20, PY + 16, 40, 40, ImageFit.Contain);
        else Icons.DrawOnKey(d, WinGlyphs.Window, t, hue, PX + PW / 2 - 18, PY + 18, 36, false);
        if (m.Minimized) Pill(d, t, "MINIMIZED", PX + PW / 2, PY + PH - 12, t.KeyMuted, center: true, size: 10);
        else if (m.Title is { Length: > 0 } title)
        {
            d.Rect(PX + 1, PY + PH - 19, PW - 2, 18, new Style { Fill = t.BgDeep, Opacity = 0.82 }, rx: 4);
            WinArt.Text(d, title, PX + 6, PY + PH - 10, 11, t.KeyInk, TextAlign.Start, PW - 12);
        }

        // Right column: position, icon, app name, state.
        const double cx = 165;
        d.Text($"{m.Index + 1} / {m.Count}", cx, 14, 11, t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        if (m.Icon is { } ic) d.Image(ic, cx - 15, 24, 30, 30, ImageFit.Contain);
        else Icons.DrawOnKey(d, WinGlyphs.Window, t, hue, cx - 14, 25, 28, m.Active);
        var nameSize = StrokeFont.FitSize(m.AppName, 60, 14, 10);
        d.Text(StrokeFont.Ellipsize(m.AppName, 62, nameSize), cx, 66, nameSize, m.Active ? hue.Ink : t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        string? state = m.Flash ?? (m.Elevated ? "ADMIN" : m.Foreground ? "IN FRONT" : null);
        if (state is not null)
        {
            var c = m.Flash is not null ? (m.FlashAlert ? t.Warn : hue.Ink) : m.Elevated ? t.Warn : hue.Ink;
            var size = StrokeFont.FitSize(state, 62, 11, 8, FontWeight.Semibold, 0.04, TextCase.Upper);
            d.Text(StrokeFont.Ellipsize(state, 62, size, FontWeight.Semibold, 0.04, TextCase.Upper), cx, 84, size, c, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, 0.04, TextCase.Upper);
        }
        // Scroll position: a thin rail with the window's place in the list.
        const double rx = 198, ry = 8, rh = 84;
        d.Rect(rx - 1, ry, 2, rh, t.Line, rx: 1);
        var seg = Math.Max(6, rh / Math.Max(1, m.Count));
        var y = ry + (rh - seg) * (m.Count <= 1 ? 0 : (double)m.Index / (m.Count - 1));
        d.Rect(rx - 1.5, y, 3, seg, hue.Vivid, rx: 1.5);
        if (m.FlashAlert) WinArt.AlertMarks(d, t, 200, 100);
        return d;
    }
}
