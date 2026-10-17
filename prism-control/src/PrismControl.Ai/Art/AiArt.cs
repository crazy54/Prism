using PrismControl.Ai.Approvals;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Ai.Art;

/// <summary>State colors, slot hues and formatting shared by every AI face.</summary>
public static class AiPalette
{
    /// <summary>The module's own hue (periwinkle, λ 472: free among the domain hues).</summary>
    public const int ModuleHueIndex = 1;

    private static readonly int[] SlotOrder = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];

    public static SpectrumColor Module(RefractionPalette t) => t.Spectrum[ModuleHueIndex];

    /// <summary>A stable hue per slot, spread around the spectrum so neighbors differ.</summary>
    public static SpectrumColor Slot(RefractionPalette t, int slot) => t.Spectrum[SlotOrder[((Math.Max(1, slot) - 1) % 12 + 12) % 12]];

    /// <summary>Codex Micro's proven mapping: blue thinking, amber needs you, green done, red error, white idle.</summary>
    public static Color State(RefractionPalette t, SessionState s) => s switch
    {
        SessionState.Working => t.Info,
        SessionState.NeedsPermission => t.Warn,
        SessionState.NeedsInput => t.Warn,
        SessionState.Error => t.Neg,
        SessionState.Done => t.Pos,
        SessionState.Idle => t.KeyMuted,
        SessionState.Stale => t.Dim,
        SessionState.Dead => t.Neg,
        _ => t.Faint,
    };

    public static GlyphPart[] Glyph(SessionState s) => s switch
    {
        SessionState.Working => AiGlyphs.Working,
        SessionState.NeedsPermission => AiGlyphs.Permission,
        SessionState.NeedsInput => AiGlyphs.Input,
        SessionState.Error => AiGlyphs.Error,
        SessionState.Done => AiGlyphs.Done,
        SessionState.Idle => AiGlyphs.Idle,
        SessionState.Stale => AiGlyphs.Stale,
        SessionState.Dead => AiGlyphs.Dead,
        _ => AiGlyphs.Ended,
    };

    /// <summary>Elapsed time: m:ss under 10 min, then 12m, then 1h4 (ai-apps.md §2.1). Inferred values get a "~".</summary>
    public static string Elapsed(TimeSpan e, bool inferred = false)
    {
        if (e < TimeSpan.Zero) e = TimeSpan.Zero;
        var s = e.TotalMinutes < 10 ? $"{(int)e.TotalMinutes}:{e.Seconds:00}"
            : e.TotalHours < 1 ? $"{(int)e.TotalMinutes}m"
            : e.TotalHours < 100 ? $"{(int)e.TotalHours}h{e.Minutes}"
            : "99h+";
        return inferred ? "~" + s : s;
    }

    /// <summary>A short "ago" for idle cards ("4M AGO").</summary>
    public static string Ago(TimeSpan e) => e.TotalMinutes < 1 ? "JUST NOW" : e.TotalHours < 1 ? $"{(int)e.TotalMinutes}M AGO" : $"{(int)e.TotalHours}H AGO";

    public static Color InkOn(RefractionPalette t, Color fill) => Color.Contrast(fill, t.Bg) >= Color.Contrast(fill, t.KeyInk) ? t.Bg : t.KeyInk;
}

/// <summary>Everything a session key needs to draw one frame.</summary>
public sealed record SessionKeyModel(int Slot, SessionView? Session, DateTimeOffset Now, bool PulseOn, string? Flash = null, bool FlashBad = false);

/// <summary>Key faces (144-unit square canvas). Every frame stays far under the 300-element budget.</summary>
public static class AiKeyArt
{
    private const double S = Refraction.Deck.KeySize;

    public static SvgDocument Session(RefractionPalette t, SessionKeyModel m)
    {
        var hue = AiPalette.Slot(t, m.Slot);
        var d = KeyArt.Base(t);
        var s = m.Session;
        if (s is null)
        {
            Fitted(d, $"SLOT {m.Slot}", 31, 19, t.Faint);
            AiGlyphs.Draw(d, AiGlyphs.Ended, 52, 38, 40, t.Faint, t.Faint);
            Fitted(d, "NO SESSION", 100, 17, t.Faint);
            KeyArt.HueIndex(d, hue, on: false);
            return d;
        }

        var state = s.State.Value;
        var conf = s.State.At(m.Now);
        var color = AiPalette.State(t, state);
        var dim = conf == Confidence.Stale || state == SessionState.Stale || s.Offline;
        var inferred = conf == Confidence.Inferred || s.Since.Confidence == Confidence.Inferred;
        // A stale fact (old data, not a stale state, whose glyph is already a clock) gets a small clock badge, top right.
        var badge = conf == Confidence.Stale && state != SessionState.Stale && !s.Offline;
        using (d.Group(new Style { Opacity = dim ? 0.4 : null }))
        {
            if (badge) Fitted(d, s.Alias, 31, 19, t.KeyMuted, maxWidth: 92, x: 64);
            else Fitted(d, s.Alias, 31, 19, t.KeyMuted);
            AiGlyphs.Draw(d, AiPalette.Glyph(state), 52, 38, 40, color, color, hollow: conf == Confidence.Inferred);
            if (m.Flash is { } flash) Fitted(d, flash, 100, 18, m.FlashBad ? t.Neg : t.Pos);
            else Fitted(d, SessionStates.Label(state), 100, 19, color);
            var since = state is SessionState.Idle or SessionState.Ended ? "" : " " + AiPalette.Elapsed(m.Now - s.Since.Value, inferred);
            Fitted(d, SessionStates.AgentLabel(s.Key.Agent) + since, 120, 16, t.KeyMuted);
        }
        // Subagents: "+n" beside the state glyph.
        if (s.Subagents.Value > 0) AiText.Draw(d, $"+{s.Subagents.Value}", 98, 58, 18, t.Info, TextAlign.Start, baseline: TextBaseline.Middle);
        if (badge) AiGlyphs.Draw(d, AiGlyphs.Stale, S - 30, 14, 18, t.Dim, t.Dim);
        if (s.NeedsYou)
        {
            // The "needs you" pulse (2 Hz, background tier): a ring in the state color.
            d.Rect(2, 2, S - 4, S - 4, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = 4, Opacity = m.PulseOn ? 1 : 0.3 }, rx: 10);
        }
        if (s.Unprotected)
        {
            // bypassPermissions / dontAsk: the deck can't protect it. A red corner notch + dashed ring.
            d.Path("M0 0H30L0 30Z", new Style { Fill = t.Neg });
            d.Rect(5, 5, S - 10, S - 10, new Style { Fill = Paint.None, Stroke = t.Neg, StrokeWidth = 2, Dash = [6, 5] }, rx: 8);
        }
        if (s.Pinned) d.Circle(14, 14, 3.5, t.KeyMuted.WithOpacity(0.8));
        KeyArt.HueIndex(d, hue, on: s.NeedsYou);
        return d;
    }

    public static SvgDocument Next(RefractionPalette t, SessionView? top, int count, DateTimeOffset now, string? flash = null, bool flashBad = false)
    {
        var hue = AiPalette.Module(t);
        var d = KeyArt.Base(t);
        Fitted(d, "NEXT", 31, 19, t.KeyMuted);
        if (top is null || count == 0)
        {
            AiGlyphs.Draw(d, AiGlyphs.Done, 52, 40, 40, t.Pos, t.Pos, opacity: 0.55);
            Fitted(d, flash ?? "ALL CLEAR", 104, 18, flash is null ? t.KeyMuted : flashBad ? t.Neg : t.Pos);
            KeyArt.HueIndex(d, hue, on: false);
            return d;
        }
        var color = AiPalette.State(t, top.State.Value);
        d.Circle(72, 62, 25, new Style { Fill = color.WithOpacity(0.18), Stroke = color, StrokeWidth = 3 });
        AiText.Draw(d, count > 99 ? "99" : count.ToString(System.Globalization.CultureInfo.InvariantCulture), 72, 62, 32, t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
        Fitted(d, flash ?? SessionStates.Label(top.State.Value), 104, 18, flash is null ? color : flashBad ? t.Neg : t.Pos);
        Fitted(d, $"{top.Alias} {AiPalette.Elapsed(now - top.Since.Value, top.Since.Confidence == Confidence.Inferred)}", 123, 16, t.KeyMuted);
        KeyArt.HueIndex(d, hue, on: true);
        return d;
    }

    /// <summary>The Approve key. <paramref name="progress"/> is the hold fraction (null when not holding).</summary>
    public static SvgDocument Approve(RefractionPalette t, ApproveBlock block, double? progress, bool pulseOn, string? flash, bool flashBad, TimeSpan hold)
    {
        var d = KeyArt.Base(t);
        var hue = AiPalette.Module(t);
        if (flash is not null)
        {
            var c = flashBad ? t.Neg : t.Pos;
            Ring(d, c, 1, 6);
            if (TwoLines(flash, 19) is { } fl)
            {
                AiGlyphs.Draw(d, flashBad ? AiGlyphs.Deny : AiGlyphs.Approve, 54, 24, 36, c, c);
                Fitted(d, fl.First, 90, 16, c);
                Fitted(d, fl.Second, 110, 16, c);
                return d;
            }
            AiGlyphs.Draw(d, flashBad ? AiGlyphs.Deny : AiGlyphs.Approve, 48, 32, 48, c, c);
            Fitted(d, flash, 106, 19, c);
            return d;
        }
        if (progress is { } p)
        {
            Ring(d, t.Panel2, 1, 8);
            Ring(d, t.Pos, Math.Clamp(p, 0, 1), 8);
            AiGlyphs.Draw(d, AiGlyphs.Approve, 48, 34, 48, t.Pos, t.Pos);
            Fitted(d, "HOLD", 106, 20, t.Pos);
            return d;
        }
        if (block == ApproveBlock.None)
        {
            // Armed: the same inset 2 Hz ring as a session that needs you (it never crosses the text).
            d.Rect(2, 2, S - 4, S - 4, new Style { Fill = Paint.None, Stroke = t.Pos, StrokeWidth = 4, Opacity = pulseOn ? 1 : 0.3 }, rx: 10);
            AiGlyphs.Draw(d, AiGlyphs.Approve, 48, 26, 48, t.Pos, t.Pos);
            Fitted(d, "APPROVE", 98, 19, t.KeyInk);
            Fitted(d, $"HOLD {hold.TotalSeconds:0.0} S", 119, 16, t.KeyMuted);
            KeyArt.HueIndex(d, hue, on: true);
            return d;
        }
        var label = BlockLabel(block);
        // The details locks (reviews H1/M1/M2/M3) explain themselves on two lines: REVIEW IN / TERMINAL, UNUSUAL / CHARACTERS.
        var warn = block is ApproveBlock.UnknownSession or ApproveBlock.UnusualCharacters;
        var labelColor = warn ? t.Neg : block is ApproveBlock.ReviewInTerminal or ApproveBlock.TooLong ? t.Warn : t.Dim;
        if (TwoLines(label, 16) is { } two)
        {
            AiGlyphs.Draw(d, AiGlyphs.Lock, 56, 14, 32, t.Faint, t.Faint);
            Fitted(d, "APPROVE", 74, 17, t.Dim);
            Fitted(d, two.First, 100, 16, labelColor);
            Fitted(d, two.Second, 119, 16, labelColor);
        }
        else
        {
            AiGlyphs.Draw(d, AiGlyphs.Lock, 52, 28, 40, t.Faint, t.Faint);
            Fitted(d, "APPROVE", 98, 19, t.Dim);
            Fitted(d, label, 119, 16, labelColor);
        }
        KeyArt.HueIndex(d, hue, on: false);
        return d;
    }

    /// <summary>Splits a label at the space nearest its middle when it does not fit one line at ≥ 14 units (null when it fits).</summary>
    private static (string First, string Second)? TwoLines(string text, double size)
    {
        if (StrokeFont.Measure(text, Math.Min(size, 14)) <= 116 || !text.Contains(' ')) return null;
        var mid = text.Length / 2;
        var best = -1;
        for (var i = 0; i < text.Length; i++)
            if (text[i] == ' ' && (best < 0 || Math.Abs(i - mid) < Math.Abs(best - mid))) best = i;
        return (text[..best], text[(best + 1)..]);
    }

    public static string BlockLabel(ApproveBlock b) => b switch
    {
        ApproveBlock.ReviewInTerminal => "REVIEW IN TERMINAL",
        ApproveBlock.UnusualCharacters => "UNUSUAL CHARACTERS",
        ApproveBlock.TooLong => "TOO LONG",
        ApproveBlock.NoRequest => "NO REQUEST",
        ApproveBlock.SafeMode => "SAFE MODE",
        ApproveBlock.PrivateMode => "PRIVATE",
        ApproveBlock.UnknownSession => "UNKNOWN",
        ApproveBlock.DetailsHidden => "NO DETAILS",
        ApproveBlock.TooSoon => "READ FIRST",
        ApproveBlock.MultiAction => "NOT HERE",
        ApproveBlock.DeviceDisconnected => "OFFLINE",
        ApproveBlock.NotDecidable => "TERMINAL ONLY",
        ApproveBlock.Changed => "CHANGED",
        ApproveBlock.Released => "HOLD LONGER",
        ApproveBlock.Expired => "EXPIRED",
        _ => "",
    };

    public static SvgDocument Deny(RefractionPalette t, bool enabled, bool canInterrupt, double? progress, string? flash, bool flashBad)
    {
        var d = KeyArt.Base(t);
        if (flash is not null)
        {
            var c = flashBad ? t.Dim : t.Neg;
            Ring(d, c, 1, 6);
            AiGlyphs.Draw(d, AiGlyphs.Deny, 48, 32, 48, c, c);
            Fitted(d, flash, 106, 19, c);
            return d;
        }
        if (progress is { } p)
        {
            Ring(d, t.Panel2, 1, 8);
            Ring(d, t.Neg, Math.Clamp(p, 0, 1), 8);
            AiGlyphs.Draw(d, AiGlyphs.Deny, 48, 34, 48, t.Neg, t.Neg);
            Fitted(d, "STOP", 106, 20, t.Neg);
            return d;
        }
        var color = enabled ? t.Neg : t.Faint;
        AiGlyphs.Draw(d, AiGlyphs.Deny, 48, 26, 48, color, color);
        Fitted(d, "DENY", 98, 19, enabled ? t.KeyInk : t.Dim);
        Fitted(d, !enabled ? "NO REQUEST" : canInterrupt ? "HOLD: STOP" : "PRESS", 119, 16, enabled ? t.KeyMuted : t.Faint);
        KeyArt.HueIndex(d, AiPalette.Module(t), on: enabled);
        return d;
    }

    public static SvgDocument Privacy(RefractionPalette t, AiSettings s)
    {
        var d = KeyArt.Base(t);
        if (s.OnAir)
        {
            d.Rect(0, 0, S, S, new Style { Fill = t.Neg, Opacity = 0.14 });
            AiGlyphs.Draw(d, AiGlyphs.OnAir, 50, 22, 44, t.Neg, t.Neg);
            d.Rect(30, 80, 84, 30, new Style { Fill = t.Neg }, rx: 15);
            AiText.Draw(d, "ON AIR", 72, 95, 18, t.Bg, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle, textCase: TextCase.Upper);
            Fitted(d, "PRIVATE", 128, 16, t.KeyMuted);
            return d;
        }
        var priv = s.IsPrivate;
        AiGlyphs.Draw(d, priv ? AiGlyphs.EyeOff : AiGlyphs.Eye, 50, 28, 44, priv ? t.KeyInk : t.Warn, priv ? t.KeyMuted : t.Warn);
        Fitted(d, priv ? "PRIVATE" : "REVEAL", 98, 19, priv ? t.KeyInk : t.Warn);
        Fitted(d, "PRESS: ON AIR", 119, 16, t.KeyMuted);
        KeyArt.HueIndex(d, AiPalette.Module(t), on: !priv);
        return d;
    }

    /// <summary>The tool as the band / key shows it: the real tool name in Reveal (POWERSHELL is not BASH), else the category.</summary>
    public static string ToolText(ApprovalView r, int maxChars = 14) =>
        r.ToolName is { Length: > 0 } n && n.Length <= maxChars && !n.StartsWith("mcp__", StringComparison.OrdinalIgnoreCase) && n.All(c => c is >= ' ' and <= '~')
            ? n.ToUpperInvariant()
            : SessionStates.ToolLabel(r.Category);

    /// <summary>
    /// The details key (keys-only decks): alias, tool and, in Reveal mode, the summary laid out by the shared display policy
    /// (<see cref="ApprovalText"/>, <see cref="KeyFit"/>: the stroke font is measured exactly). Returns why the details are NOT
    /// fully shown (<see cref="DetailsLock.None"/> = they are: only then may an Approve key on this device approve).
    /// </summary>
    public static (SvgDocument Doc, DetailsLock Lock) Details(RefractionPalette t, ApprovalView? r, SessionView? s, DateTimeOffset now, bool pulseOn)
    {
        var d = KeyArt.Base(t);
        if (r is null)
        {
            AiGlyphs.Draw(d, AiGlyphs.Card, 52, 30, 40, t.Faint, t.Faint);
            Fitted(d, "NO REQUESTS", 100, 17, t.Dim);
            KeyArt.HueIndex(d, AiPalette.Module(t), on: false);
            return (d, DetailsLock.Hidden);
        }
        // Band: session hue (red for an unknown session) with the alias and the pending index; a countdown bar at the bottom.
        var hue = AiPalette.Slot(t, s?.Slot ?? 1);
        var band = !r.Known || r.Unprotected ? t.Neg : hue.Vivid;
        var ink = AiPalette.InkOn(t, band);
        d.Rect(0, 0, S, 32, new Style { Fill = band });
        var count = r.Count > 1 ? $"{r.Index + 1}/{r.Count}" : null;
        Fitted(d, !r.Known ? "UNKNOWN" : s?.Alias ?? "AGENT", 22, 16, ink, maxWidth: count is null ? 120 : 88, x: 12, align: TextAlign.Start);
        if (count is not null) AiText.Draw(d, count, S - 12, 22, 16, ink, TextAlign.End);
        var remaining = Math.Clamp((r.Deadline - now).TotalSeconds / Math.Max(1, (r.Deadline - r.CreatedAt).TotalSeconds), 0, 1);
        d.Rect(16, 128, S - 32, 4, t.Panel2, rx: 2);
        if (remaining > 0) d.Rect(16, 128, Math.Max(4, (S - 32) * remaining), 4, new Style { Fill = r.Known ? t.Warn : t.Neg }, rx: 2);

        if (!r.Known)
        {
            Fitted(d, "UNKNOWN", 62, 22, t.Neg);
            Fitted(d, "SESSION", 86, 22, t.Neg);
            Fitted(d, "DENY ONLY", 114, 16, t.KeyMuted);
            return (d, DetailsLock.Hidden);
        }
        Fitted(d, ToolText(r), 54, 20, pulseOn ? t.Warn : t.KeyInk);
        if (!r.DetailsComplete || r.Summary is null)
        {
            Fitted(d, "DETAILS HIDDEN", 88, 16, t.KeyMuted);
            Fitted(d, "PUSH: REVIEW", 110, 16, t.KeyMuted);
            return (d, DetailsLock.Hidden);
        }
        var plan = r.Plan;
        if (plan.Lock is DetailsLock.Incomplete or DetailsLock.Unusual)
        {
            // Nothing of it is drawn: what is there can't be shown faithfully.
            var c = plan.Lock == DetailsLock.Unusual ? t.Neg : t.Warn;
            if (plan.Lock == DetailsLock.Unusual) { Fitted(d, "UNUSUAL", 82, 17, c); Fitted(d, "CHARACTERS", 101, 17, c); }
            else { Fitted(d, "REVIEW IN", 82, 17, c); Fitted(d, "TERMINAL", 101, 17, c); }
            Fitted(d, "APPROVE OFF", 120, 13, t.KeyMuted);
            return (d, plan.Lock);
        }
        // The exact text in the stroke font (measured exactly). Lowercase letters are small capitals.
        const double lineSize = KeyFit.Size;
        var (lines, fits) = KeyFit.Lay(plan.Text);
        var shown = lines.ToList();
        if (!fits)
        {
            if (shown.Count == 0) shown.Add(StrokeFont.Supports(plan.Text) ? plan.Text : "");
            shown[^1] = StrokeFont.Ellipsize(shown[^1] + " …", KeyFit.Width, lineSize, FontWeight.Medium);
        }
        for (var i = 0; i < shown.Count && i < KeyFit.Lines; i++) AiText.Draw(d, shown[i], 72, 78 + i * 19, lineSize, t.KeyInk, TextAlign.Middle, FontWeight.Medium);
        var flag = !fits ? "TOO LONG" : plan.Flag ?? (r.Via is { } via ? "VIA " + via.ToUpperInvariant() : null);
        if (flag is not null) Fitted(d, flag, 118, 12, !fits || plan.Flag is not null || r.Via is not null ? t.Warn : t.KeyMuted);
        return (d, fits ? DetailsLock.None : DetailsLock.TooLong);
    }

    private static void Ring(SvgDocument d, Color color, double fraction, double width)
    {
        const double cx = 72, cy = 72, r = 64;
        if (fraction >= 0.999) { d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = width }); return; }
        if (fraction <= 0.001) return;
        var p = new PathBuilder().Arc(cx, cy, r, -90, -90 + 360 * fraction);
        d.Path(p, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = width, LineCap = LineCap.Round });
    }

    internal static void Fitted(SvgDocument d, string text, double baseline, double size, Color color, double maxWidth = 116, double x = 72, TextAlign align = TextAlign.Middle)
    {
        if (string.IsNullOrEmpty(text)) return;
        var fit = StrokeFont.FitSize(text, maxWidth, size, Math.Min(size, 14));
        var shown = StrokeFont.Measure(text, fit) > maxWidth ? StrokeFont.Ellipsize(text, maxWidth, fit) : text;
        AiText.Draw(d, shown, x, baseline, fit, color, align);
    }
}

/// <summary>Dial / Galleon widget faces (200×100 canvas, shown at ~360×180 on the Galleon).</summary>
public static class AiDialArt
{
    private const double W = 200, H = 100;

    public sealed record FleetCell(int Slot, SessionView? Session);

    /// <summary>
    /// The fleet overview: a header of counts and a grid of state-colored cells (6×2 on the Galleon, 4×2 on a Stream Deck +
    /// segment). The turned-to cell gets a ring; a cell with a pending approval pulses. <paramref name="banner"/> replaces the
    /// grid for 4 s when a session starts needing you.
    /// </summary>
    public static SvgDocument Fleet(RefractionPalette t, IReadOnlyList<SessionView> sessions, int columns, int firstSlot, int selectedSlot,
        DateTimeOffset now, bool pulseOn, SessionTransition? banner)
    {
        var d = DialArt.Base(t);
        var working = sessions.Count(s => s.State.Value == SessionState.Working);
        var needs = sessions.Count(s => s.NeedsYou);
        var done = sessions.Count(s => s.State.Value == SessionState.Done);
        var header = sessions.Count == 0 ? "NO AGENTS" : $"{working} WORKING · {needs} NEEDS YOU · {done} DONE";
        var hs = StrokeFont.FitSize(header, W - 16, 13, 9);
        AiText.Draw(d, header, W / 2, 15, hs, needs > 0 ? t.Warn : t.KeyMuted, TextAlign.Middle);

        if (banner is not null && sessions.FirstOrDefault(s => s.Key == banner.Key) is { } b)
        {
            var c = AiPalette.State(t, banner.To);
            var ink = AiPalette.InkOn(t, c);
            d.Rect(8, 24, W - 16, 68, new Style { Fill = c }, rx: 8);
            var l1 = b.Alias;
            var l2 = banner.To switch
            {
                SessionState.NeedsPermission => "NEEDS PERMISSION",
                SessionState.NeedsInput => "NEEDS INPUT",
                SessionState.Error => "HIT AN ERROR",
                _ => SessionStates.Label(banner.To),
            };
            AiText.Draw(d, StrokeFont.Ellipsize(l1, W - 40, 16), W / 2, 50, 16, ink, TextAlign.Middle);
            AiText.Draw(d, l2, W / 2, 74, StrokeFont.FitSize(l2, W - 40, 16, 10), ink, TextAlign.Middle);
            return d;
        }

        var rows = 2;
        const double gap = 5, x0 = 8, y0 = 24, gridW = W - 16, gridH = 70;
        var cw = (gridW - (columns - 1) * gap) / columns;
        var ch = (gridH - (rows - 1) * gap) / rows;
        var bySlot = sessions.Where(s => s.Slot > 0).GroupBy(s => s.Slot).ToDictionary(g => g.Key, g => g.First());
        for (var i = 0; i < columns * rows; i++)
        {
            var slot = firstSlot + i;
            var x = x0 + i % columns * (cw + gap);
            var y = y0 + i / columns * (ch + gap);
            bySlot.TryGetValue(slot, out var s);
            if (s is null)
            {
                d.Rect(x, y, cw, ch, new Style { Fill = t.Panel2, Opacity = 0.6 }, rx: 5);
                AiText.Draw(d, slot.ToString(System.Globalization.CultureInfo.InvariantCulture), x + cw / 2, y + ch / 2, 12, t.Faint, TextAlign.Middle, baseline: TextBaseline.Middle);
            }
            else
            {
                var state = s.State.Value;
                var c = AiPalette.State(t, state);
                var strong = state is SessionState.Working or SessionState.NeedsPermission or SessionState.NeedsInput or SessionState.Error or SessionState.Done;
                var pending = s.PendingRequestId is not null;
                var op = !strong ? 0.28 : pending && !pulseOn ? 0.45 : 0.92;
                if (s.State.At(now) == Confidence.Stale || s.Offline) op *= 0.5;
                d.Rect(x, y, cw, ch, new Style { Fill = c, Opacity = op }, rx: 5);
                d.Rect(x + 4, y + ch - 4, cw - 8, 2.5, AiPalette.Slot(t, slot).Vivid, rx: 1.25);
                var label = slot.ToString(System.Globalization.CultureInfo.InvariantCulture);
                AiText.Draw(d, label, x + cw / 2, y + ch / 2 - 1, 13, strong ? AiPalette.InkOn(t, c) : t.KeyInk, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle);
                if (s.Unprotected) d.Rect(x + 1, y + 1, cw - 2, ch - 2, new Style { Fill = Paint.None, Stroke = t.Neg, StrokeWidth = 1.5, Dash = [3, 2] }, rx: 4.5);
            }
            if (slot == selectedSlot) d.Rect(x - 2, y - 2, cw + 4, ch + 4, new Style { Fill = Paint.None, Stroke = t.KeyInk, StrokeWidth = 2 }, rx: 6.5);
        }
        return d;
    }

    /// <summary>
    /// The approval card's canvas. The command lines themselves are the layout's native text items (system font: "-r" and
    /// "-R" stay distinct), filled by the caller only in Reveal mode.
    /// </summary>
    /// <param name="detailsFit">The summary fits the two native text lines in full (when not, Approve is locked for it).</param>
    public static SvgDocument Card(RefractionPalette t, ApprovalView? r, SessionView? s, DateTimeOffset now, bool pulseOn, DateTimeOffset? lastRequestAt,
        bool approveVisible, bool detailsFit = true) =>
        Card(t, r, s, now, pulseOn, lastRequestAt, approveVisible, r is null || !r.DetailsComplete ? DetailsLock.Hidden : r.Plan.Lock != DetailsLock.None ? r.Plan.Lock
            : detailsFit ? DetailsLock.None : DetailsLock.TooLong);

    /// <summary>
    /// The approval card's canvas; the command lines are the layout's three native text items (system font: "-r" and "-R" stay
    /// distinct, the fit is measured by <see cref="CardFit"/>). <paramref name="shown"/> is what the card can show of the request:
    /// None (everything, Approve may arm), TooLong (the lines that fit are drawn, Approve locked), Incomplete / Unusual (nothing of it
    /// is drawn: "REVIEW IN TERMINAL" / "UNUSUAL CHARACTERS"), Hidden (Private, or no summary yet). Flags (OUTSIDE WORKSPACE, VIA
    /// another program) are drawn in the footer in the warning color.
    /// </summary>
    public static SvgDocument Card(RefractionPalette t, ApprovalView? r, SessionView? s, DateTimeOffset now, bool pulseOn, DateTimeOffset? lastRequestAt,
        bool approveVisible, DetailsLock shown)
    {
        var d = DialArt.Base(t);
        if (r is null)
        {
            AiGlyphs.Draw(d, AiGlyphs.Card, 88, 22, 24, t.Faint, t.Faint);
            AiText.Draw(d, "NO REQUESTS", W / 2, 66, 15, t.KeyMuted, TextAlign.Middle);
            AiText.Draw(d, lastRequestAt is { } l ? "LAST " + AiPalette.Ago(now - l) : "ALL CLEAR", W / 2, 84, 11, t.Faint, TextAlign.Middle);
            return d;
        }
        var hue = AiPalette.Slot(t, s?.Slot ?? 1);
        var band = !r.Known ? t.Neg : r.Unprotected ? t.Neg : hue.Vivid;
        d.Rect(0, 0, W, 24, new Style { Fill = band });
        var ink = AiPalette.InkOn(t, band);
        var secs = Math.Max(0, (int)Math.Ceiling((r.Deadline - now).TotalSeconds));
        var bandText = !r.Known ? "UNKNOWN SESSION" : $"{s?.Alias ?? "AGENT"} · {AiKeyArt.ToolText(r)} · {secs} S";
        var bandSize = StrokeFont.FitSize(bandText, r.Count > 1 ? 150 : 180, 13, 9);
        AiText.Draw(d, bandText, 10, 17, bandSize, ink, TextAlign.Start);
        if (r.Count > 1) AiText.Draw(d, $"{r.Index + 1}/{r.Count}", W - 10, 17, 12, ink, TextAlign.End);

        if (!r.Known)
        {
            AiText.Draw(d, "NOT FROM A KNOWN LIVE SESSION", W / 2, 48, StrokeFont.FitSize("NOT FROM A KNOWN LIVE SESSION", W - 20, 12, 9), t.KeyInk, TextAlign.Middle);
            AiText.Draw(d, "PUSH TO REVIEW IN TERMINAL", W / 2, 66, 11, t.KeyMuted, TextAlign.Middle);
        }
        else if (shown == DetailsLock.Hidden || !r.DetailsComplete)
        {
            AiText.Draw(d, r.Summary is null && r.ToolName is not null ? "WAITING FOR DETAILS" : "DETAILS HIDDEN", W / 2, 48, 14, t.KeyInk, TextAlign.Middle);
            AiText.Draw(d, "PUSH TO REVIEW IN TERMINAL", W / 2, 66, 11, t.KeyMuted, TextAlign.Middle);
        }
        else if (shown is DetailsLock.Incomplete or DetailsLock.Unusual)
        {
            // Nothing of the request is drawn: it can't be shown fully and faithfully (reviews H1/M1/M3).
            var head = shown == DetailsLock.Unusual ? "UNUSUAL CHARACTERS" : "REVIEW IN TERMINAL";
            var sub = shown == DetailsLock.Unusual ? "HIDDEN OR LOOK-ALIKE TEXT" : "NOT ALL OF IT CAN BE SHOWN";
            AiText.Draw(d, head, W / 2, 48, StrokeFont.FitSize(head, W - 20, 15, 10), shown == DetailsLock.Unusual ? t.Neg : t.Warn, TextAlign.Middle);
            AiText.Draw(d, sub, W / 2, 66, StrokeFont.FitSize(sub, W - 20, 11, 8), t.KeyMuted, TextAlign.Middle);
        }
        // (Reveal, None / TooLong: the line1–line3 native text items sit at y 25–76.)

        var total = Math.Max(1, (r.Deadline - r.CreatedAt).TotalSeconds);
        var frac = Math.Clamp((r.Deadline - now).TotalSeconds / total, 0, 1);
        d.Rect(10, 78, W - 20, 3, t.Panel2, rx: 1.5);
        if (frac > 0) d.Rect(10, 78, Math.Max(3, (W - 20) * frac), 3, new Style { Fill = pulseOn || frac > 0.25 ? t.Warn : t.Neg }, rx: 1.5);

        var flag = r.Plan.Flag ?? (r.Via is { } via ? "VIA " + via.ToUpperInvariant() : null);
        var footer = !r.Known ? "APPROVE LOCKED · PRESS DENY"
            : r.Unprotected ? $"MODE {r.PermissionMode?.ToUpperInvariant()} · CAN'T PROTECT"
            : shown == DetailsLock.Hidden ? "PRESS DENY · APPROVE OFF"
            : shown is DetailsLock.Incomplete or DetailsLock.Unusual ? "PUSH: REVIEW · PRESS DENY · APPROVE OFF"
            : shown == DetailsLock.TooLong ? "TOO LONG TO SHOW · PRESS DENY"
            : flag is not null ? $"{flag} · {(approveVisible ? "HOLD APPROVE" : "PRESS DENY")}"
            : approveVisible ? "HOLD APPROVE · PRESS DENY" : "PRESS DENY · NO APPROVE KEY";
        var footerColor = r.Unprotected || !r.Known ? t.Neg : (flag is not null && shown == DetailsLock.None) || shown == DetailsLock.TooLong ? t.Warn : t.KeyMuted;
        AiText.Draw(d, footer, W / 2, 94, StrokeFont.FitSize(footer, W - 20, 11, 8), footerColor, TextAlign.Middle);
        return d;
    }
}
