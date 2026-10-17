using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Placement;

/// <summary>The deck as a miniature of your monitors.</summary>
public static class PlacementArt
{
    private const double K = WinArt.K;

    /// <summary>
    /// Draws every monitor at its real relative position and size inside the box, the chosen monitor outlined in the hue and,
    /// if <paramref name="zone"/> is set, that zone of its work area lit.
    /// </summary>
    public static void MonitorMap(SvgDocument d, RefractionPalette t, IReadOnlyList<PixelRect> monitors, IReadOnlyList<PixelRect> workAreas,
        double x, double y, double w, double h, int selected, ZoneId? zone)
    {
        var hue = WinArt.Hue(t);
        if (monitors.Count == 0) return;
        int l = monitors.Min(m => m.Left), tp = monitors.Min(m => m.Top), r = monitors.Max(m => m.Right), b = monitors.Max(m => m.Bottom);
        double uw = Math.Max(1, r - l), uh = Math.Max(1, b - tp);
        var s = Math.Min(w / uw, h / uh);
        var ox = x + (w - uw * s) / 2;
        var oy = y + (h - uh * s) / 2;
        (double X, double Y, double W, double H) Map(PixelRect p) => (ox + (p.Left - l) * s, oy + (p.Top - tp) * s, p.Width * s, p.Height * s);
        const double inset = 1.5;
        for (var i = 0; i < monitors.Count; i++)
        {
            var (mx, my, mw, mh) = Map(monitors[i]);
            var sel = i == selected;
            d.Rect(mx + inset, my + inset, Math.Max(2, mw - 2 * inset), Math.Max(2, mh - 2 * inset), new Style
            {
                Fill = sel ? t.Panel2 : t.Panel,
                Stroke = sel ? hue.Vivid : t.LineStrong,
                StrokeWidth = sel ? 2 : 1.2,
            }, rx: 3);
            if (sel && zone is { } z && i < workAreas.Count)
            {
                var zr = Zones.Rect(z, workAreas[i]);
                var (zx, zy, zw, zh) = Map(zr);
                const double zi = 3.5;
                d.Rect(zx + zi, zy + zi, Math.Max(2, zw - 2 * zi), Math.Max(2, zh - 2 * zi), new Style { Fill = hue.Vivid, Opacity = 0.85 }, rx: 2);
            }
        }
    }

    public static SvgDocument ZoneKey(RefractionPalette t, IReadOnlyList<PixelRect> monitors, IReadOnlyList<PixelRect> work, int monitor, ZoneId zone,
        string monitorName, string? flash = null, bool alert = false, string? app = null, bool blocked = false)
    {
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue);
        if (monitors.Count == 0) Icons.DrawOnKey(d, WinGlyphs.Zone, t, hue, 40, 14, 64, false);
        else
        {
            // Only the chosen monitor, big, so the zone reads at 72 px.
            MonitorMap(d, t, [monitors[Math.Clamp(monitor, 0, monitors.Count - 1)]], [work[Math.Clamp(monitor, 0, work.Count - 1)]], 16, 14, K - 32, 66, 0, zone);
        }
        WinArt.CenterText(d, blocked ? "CAN'T MOVE" : Zones.Name(zone).ToUpperInvariant(), 96, 18, blocked ? t.Warn : t.KeyInk);
        WinArt.CenterText(d, flash ?? app ?? monitorName, 118, 15, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyMuted);
        if (alert) WinArt.AlertMarks(d, t);
        else KeyArt.HueIndex(d, hue, false);
        return d;
    }

    public static SvgDocument PlacerDial(RefractionPalette t, IReadOnlyList<PixelRect> monitors, IReadOnlyList<PixelRect> work, int monitor, ZoneId zone,
        string monitorName, string? app, bool active, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var d = DialArt.Base(t, hue, active);
        if (monitors.Count == 0)
        {
            WinArt.DialLabel(d, t, "WINDOW PLACER", 16, 20, 170);
            WinArt.Text(d, "No displays", 16, 54, 18, t.KeyInk, TextAlign.Start, 170);
            return d;
        }
        MonitorMap(d, t, monitors, work, 10, 6, 180, 58, monitor, zone);
        WinArt.Text(d, Zones.Name(zone).ToUpperInvariant() + " · " + monitorName, 12, 76, 14, active ? hue.Ink : t.KeyInk, TextAlign.Start, 176, TextCase.Upper, 0.04);
        var line = flash ?? (app is null ? "NO WINDOW TO MOVE" : "PUSH: MOVE " + app.ToUpperInvariant());
        WinArt.Text(d, line, 12, 92, 12, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyMuted, TextAlign.Start, 176, TextCase.Upper, 0.04);
        if (alert) WinArt.AlertMarks(d, t, 200, 100);
        return d;
    }
}
