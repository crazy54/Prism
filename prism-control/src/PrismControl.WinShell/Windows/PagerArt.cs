using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>Virtual desktop pager and game-mode frames.</summary>
public static class PagerArt
{
    private const double K = WinArt.K;

    public static SvgDocument DesktopsKey(RefractionPalette t, DesktopsState s, string? flash = null, bool alert = false, string? hint = null)
    {
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue);
        WinArt.CenterText(d, "DESKTOP", 26, 18, t.KeyMuted);
        Tiles(d, t, s, 14, 40, K - 28, 24);
        var value = s.Current >= 0 ? $"{s.Current + 1} / {s.Count}" : $"? / {s.Count}";
        var size = StrokeFont.FitSize(value, K - 24, 36, 20);
        d.Text(value, K / 2, 88, size, t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        var line = flash ?? (s.Current >= 0 ? s.NameOf(s.Current) : "Unknown");
        WinArt.CenterText(d, line, 116, 16, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyMuted);
        if (alert) WinArt.AlertMarks(d, t);
        else if (hint is not null) WinArt.CenterText(d, hint, 134, 14, t.Faint);
        if (!alert && hint is null) KeyArt.HueIndex(d, hue, false);
        return d;
    }

    /// <summary>One tile per desktop (up to 9 drawn), the current one lit.</summary>
    public static void Tiles(SvgDocument d, RefractionPalette t, DesktopsState s, double x, double y, double w, double h, bool numbers = false)
    {
        var hue = WinArt.Hue(t);
        var n = Math.Clamp(s.Count, 1, 9);
        const double gap = 6;
        var tw = Math.Min(h * 1.6, (w - gap * (n - 1)) / n);
        var total = tw * n + gap * (n - 1);
        var x0 = x + (w - total) / 2;
        for (var i = 0; i < n; i++)
        {
            var tx = x0 + i * (tw + gap);
            var current = i == s.Current;
            d.Rect(tx, y, tw, h, current
                ? new Style { Fill = hue.Vivid, Opacity = 0.9 }
                : new Style { Fill = t.Panel2, Stroke = t.LineStrong, StrokeWidth = 1.5 }, rx: 4);
            if (numbers) d.Text((i + 1).ToString(System.Globalization.CultureInfo.InvariantCulture), tx + tw / 2, y + h / 2, Math.Min(16, h * 0.5), current ? t.BgDeep : t.KeyMuted, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        }
    }

    public static SvgDocument DesktopsDial(RefractionPalette t, DesktopsState s, bool active, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var d = DialArt.Base(t, hue, active);
        WinArt.DialLabel(d, t, "VIRTUAL DESKTOPS", 12, 14, 176);
        Tiles(d, t, s, 12, 28, 176, 32, numbers: true);
        var name = flash ?? (s.Current >= 0 ? s.NameOf(s.Current) : "Unknown");
        WinArt.Text(d, name, 12, 80, 18, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyInk, TextAlign.Start, 150);
        d.Text(s.Current >= 0 ? $"{s.Current + 1}/{s.Count}" : $"?/{s.Count}", 188, 80, 14, t.KeyMuted, TextAlign.End, FontWeight.Semibold, TextBaseline.Middle);
        if (alert) WinArt.AlertMarks(d, t, 200, 100);
        return d;
    }

    public static SvgDocument GameKey(RefractionPalette t, GameState s)
    {
        var on = s.IsGaming;
        return WinArt.GlyphKey(t, WinGlyphs.GameMode, on ? "GAMING" : "DESKTOP", on, s.Describe().ToUpperInvariant() switch
        {
            "DESKTOP" => "GAME MODE OFF",
            var x => x,
        });
    }
}
