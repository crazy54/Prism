using System.Globalization;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Display;

public enum HdrView { On, Off, Unsupported, Resyncing, NoMonitor }

/// <summary>Frames for the display actions (keys 144, widgets 200×100).</summary>
public static class DisplayArt
{
    private const double K = WinArt.K;

    public static SvgDocument HdrKey(RefractionPalette t, string monitor, HdrView view, double resyncProgress = 0, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var on = view == HdrView.On;
        var d = KeyArt.Base(t, hue, on);
        Icons.DrawOnKey(d, WinGlyphs.Hdr, t, hue, 14, 12, 28, on);
        WinArt.Text(d, "HDR", 48, 26, 20, t.KeyMuted, TextAlign.Start, 84);
        var (value, color) = view switch
        {
            HdrView.On => ("ON", hue.Ink),
            HdrView.Off => ("OFF", t.KeyInk),
            HdrView.Resyncing => ("WAIT", t.KeyMuted),
            HdrView.Unsupported => ("NO HDR", t.Faint),
            _ => ("NO DISPLAY", t.Faint),
        };
        var size = StrokeFont.FitSize(value, K - 24, Refraction.Deck.ValueSize, 20);
        d.Text(value, K / 2, 72, size, alert ? t.Warn : color, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        if (view == HdrView.Resyncing)
        {
            WinArt.CenterText(d, "RESYNCING", 104, 16, t.KeyMuted);
            d.Rect(24, 116, K - 48, 4, t.Panel2, rx: 2);
            d.Rect(24, 116, Math.Max(4, (K - 48) * Math.Clamp(resyncProgress, 0, 1)), 4, hue.Vivid, rx: 2);
        }
        else WinArt.CenterText(d, flash ?? monitor, 108, 16, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyMuted);
        if (alert) WinArt.AlertMarks(d, t);
        else KeyArt.HueIndex(d, hue, on);
        return d;
    }

    /// <param name="pendingSeconds">Non-null while a change waits for KEEP (auto-revert countdown).</param>
    public static SvgDocument RefreshKey(RefractionPalette t, string monitor, int? currentHz, int? nextHz, int? pendingSeconds, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue, pendingSeconds is not null);
        if (pendingSeconds is { } secs)
        {
            // KEEP? 15: a draining ring, the countdown, and what pressing does.
            const double cx = K / 2, cy = 66, r = 46;
            d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = t.KeyMuted, StrokeWidth = 5, Opacity = 0.25 });
            var frac = Math.Clamp(secs / DisplayService.KeepWindow.TotalSeconds, 0, 1);
            if (frac > 0.005) d.Path(new PathBuilder().Arc(cx, cy, r, -90, -90 + 360 * frac), new Style { Fill = Paint.None, Stroke = t.Warn, StrokeWidth = 5, LineCap = LineCap.Round });
            WinArt.CenterText(d, "KEEP?", 50, 20, t.Warn);
            d.Text(secs.ToString(CultureInfo.InvariantCulture), cx, 80, 34, t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
            WinArt.CenterText(d, currentHz is { } c ? $"{c} HZ · PRESS" : "PRESS TO KEEP", 126, 15, hue.Ink);
            return d;
        }
        Icons.DrawOnKey(d, WinGlyphs.Refresh, t, hue, 14, 12, 28, false);
        WinArt.Text(d, "REFRESH", 48, 26, 18, t.KeyMuted, TextAlign.Start, 86);
        var value = currentHz is { } hz ? $"{hz}" : "--";
        var size = StrokeFont.FitSize(value, 80, Refraction.Deck.ValueSize, 24);
        var vw = StrokeFont.Measure(value, size, FontWeight.Semibold, Refraction.Deck.ValueTrackingEm);
        var x0 = K / 2 - (vw + 30) / 2;
        d.Text(value, x0, 72, size, t.KeyInk, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, Refraction.Deck.ValueTrackingEm);
        d.Text("HZ", x0 + vw + 4, 80, 16, t.KeyMuted, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle, 0.06, TextCase.Upper);
        var sub = flash ?? (nextHz is { } n ? $"→ {n} HZ" : monitor);
        WinArt.CenterText(d, sub, 106, 16, flash is not null ? (alert ? t.Warn : hue.Ink) : hue.Ink);
        WinArt.CenterText(d, monitor, 124, 14, t.KeyMuted);
        if (alert) WinArt.AlertMarks(d, t);
        return d;
    }

    /// <summary>The DDC value line under a meter: "LOCKED IN HDR", "READING…", "NOT SUPPORTED".</summary>
    public static string? StatusText(DdcStatus status, bool hdrOn) => status switch
    {
        DdcStatus.Locked => hdrOn ? "LOCKED IN HDR" : "NOT APPLIED",
        DdcStatus.Unsupported => "NOT SUPPORTED",
        DdcStatus.Unknown => "READING…",
        _ => null,
    };

    public static string ValueText(VcpView? v) => v is null ? "--"
        : v.Max == 100 ? v.Shown.ToString(CultureInfo.InvariantCulture)
        : $"{Math.Round(v.Fraction * 100):0}%";

    public static SvgDocument MonitorKey(RefractionPalette t, string feature, string monitor, VcpView? v, string? status, string? flash = null, bool alert = false)
    {
        var warn = v?.Status == DdcStatus.Locked || alert;
        var d = WinArt.ValueKey(t, feature.ToUpperInvariant(), ValueText(v), flash ?? status ?? monitor, on: false, alert: warn, glyph: WinGlyphs.Monitor);
        return Meter(d, t, v);
    }

    private static SvgDocument Meter(SvgDocument d, RefractionPalette t, VcpView? v)
    {
        if (v is null) return d;
        var hue = WinArt.Hue(t);
        const double mx = 24, mw = K - 48, my = 94;
        d.Rect(mx, my, mw, 4, t.Panel2, rx: 2);
        d.Rect(mx, my, Math.Max(4, mw * v.Fraction), 4, hue.Vivid, rx: 2);
        return d;
    }

    public static SvgDocument MonitorDial(RefractionPalette t, string feature, string monitor, VcpView? v, string? status, bool active, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var d = DialArt.Base(t, hue, active);
        var warnTop = alert || v?.Status == DdcStatus.Locked;
        WinArt.DialLabel(d, t, feature, 16, 18, 112);
        WinArt.Text(d, monitor, warnTop ? 178 : 184, 18, 14, t.KeyMuted, TextAlign.End, 52, TextCase.Upper, 0.06);
        var value = ValueText(v);
        var size = StrokeFont.FitSize(value, 120, Refraction.Deck.DialValueSize, 18);
        d.Text(value, 16, 50, size, active ? hue.Ink : t.KeyInk, TextAlign.Start, FontWeight.Semibold, TextBaseline.Middle);
        const double mx = 16, mw = 168, my = 70, mh = 6;
        d.Rect(mx, my, mw, mh, t.Panel2, rx: mh / 2);
        if (v is not null && v.Fraction > 0)
        {
            var grad = d.LinearGradient(mx, 0, mx + mw, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true);
            d.Rect(mx, my, Math.Max(mh, mw * v.Fraction), mh, new Style { Fill = grad, Filter = active ? d.Glow(2.5) : null }, rx: mh / 2);
        }
        var line = flash ?? status;
        var warn = alert || v?.Status == DdcStatus.Locked;
        if (line is not null) WinArt.Text(d, line, 16, 89, 13, warn ? t.Warn : t.KeyMuted, TextAlign.Start, 168, TextCase.Upper, 0.06);
        if (warn) WinArt.AlertMarks(d, t, 200, 100);
        return d;
    }

    public static SvgDocument InputKey(RefractionPalette t, string monitor, string input, bool active, double holdProgress, string? flash = null, bool alert = false, string? sub = null)
    {
        var hue = WinArt.Hue(t);
        var d = KeyArt.Base(t, hue, active);
        Icons.DrawOnKey(d, WinGlyphs.InputSource, t, hue, 14, 12, 28, active);
        WinArt.Text(d, "INPUT", 48, 26, 18, t.KeyMuted, TextAlign.Start, 86);
        var size = StrokeFont.FitSize(input, K - 24, 34, 18);
        d.Text(StrokeFont.Ellipsize(input, K - 20, size), K / 2, 70, size, active ? hue.Ink : t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        WinArt.CenterText(d, flash ?? sub ?? (active ? "ACTIVE" : "HOLD TO SWITCH"), 104, 15, flash is not null ? (alert ? t.Warn : hue.Ink) : active ? hue.Ink : t.KeyMuted);
        WinArt.CenterText(d, monitor, 124, 14, t.KeyMuted);
        if (holdProgress > 0) return WinArt.HoldKey(t, holdProgress, monitor, "→ " + input);
        if (alert) WinArt.AlertMarks(d, t);
        return d;
    }

    public static SvgDocument InputDial(RefractionPalette t, string monitor, IReadOnlyList<uint> inputs, int selected, uint? current, bool active, TimeSpan? armed, string? flash = null, bool alert = false)
    {
        var hue = WinArt.Hue(t);
        var d = DialArt.Base(t, hue, active);
        WinArt.DialLabel(d, t, "INPUT · " + monitor, 16, 16, 172);
        if (inputs.Count == 0)
        {
            WinArt.Text(d, flash ?? "Reading inputs…", 16, 52, 18, alert ? t.Warn : t.KeyInk, TextAlign.Start, 170);
            return d;
        }
        // A row of chips; the selected one is outlined, the active one filled.
        var n = Math.Min(inputs.Count, 5);
        var first = Math.Clamp(selected - n / 2, 0, Math.Max(0, inputs.Count - n));
        const double gap = 6, x0 = 16, w = 168, y = 30, h = 30;
        var cw = (w - gap * (n - 1)) / n;
        for (var i = 0; i < n; i++)
        {
            var idx = first + i;
            var x = x0 + i * (cw + gap);
            var isActive = current is { } c && (c & 0xFF) == (inputs[idx] & 0xFF);
            var isSel = idx == selected;
            d.Rect(x, y, cw, h, new Style
            {
                Fill = isActive ? hue.Vivid : t.Panel2,
                Stroke = isSel ? hue.Ink : t.LineStrong,
                StrokeWidth = isSel ? 2.4 : 1,
                Opacity = isActive ? 0.92 : 1,
            }, rx: 6);
            var label = Vcp.InputShort(inputs[idx]);
            var s = StrokeFont.FitSize(label, cw - 6, 13, 8);
            d.Text(label, x + cw / 2, y + h / 2, s, isActive ? t.BgDeep : t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        }
        if (armed is { } left) WinArt.ArmedBanner(d, t, $"Switch {monitor} to {Vcp.InputName(inputs[selected])}", left);
        else
        {
            var line = flash ?? (current is { } cur && (cur & 0xFF) == (inputs[selected] & 0xFF) ? "ACTIVE NOW" : "PUSH TO SWITCH");
            WinArt.Text(d, line, 16, 80, 13, flash is not null ? (alert ? t.Warn : hue.Ink) : t.KeyMuted, TextAlign.Start, 168, TextCase.Upper, 0.06);
            if (alert) WinArt.AlertMarks(d, t, 200, 100);
        }
        return d;
    }
}
