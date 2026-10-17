using System.Globalization;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Status;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Ai.Services.Art;

/// <summary>AI2's glyphs in AI1's icon grammar (24-unit grid, round caps). Generic shapes only: no vendor logos.</summary>
public static class Ai2Glyphs
{
    public static readonly GlyphPart[] Pulse = [new("M2.5 12H7L9.5 6.5L14 17.5L16.5 12H21.5")];
    public static readonly GlyphPart[] Gauge = [new("M4.6 17A8.5 8.5 0 1 1 19.4 17"), new("M12 13.5L16.2 8.8", Accent: true)];
    public static readonly GlyphPart[] Ops = [new("M5 4H19A1 1 0 0 1 20 5V19A1 1 0 0 1 19 20H5A1 1 0 0 1 4 19V5A1 1 0 0 1 5 4Z"), new("M6.5 12.5H9L10.5 9L13.5 15.5L15 12.5H17.5", Accent: true)];
    public static readonly GlyphPart[] Window = [new("M4 5H20A1.5 1.5 0 0 1 21.5 6.5V17.5A1.5 1.5 0 0 1 20 19H4A1.5 1.5 0 0 1 2.5 17.5V6.5A1.5 1.5 0 0 1 4 5Z"), new("M2.5 9H21.5"), new("M9.5 14H15M13 12L15 14L13 16", Accent: true)];
    public static readonly GlyphPart[] Bubble = [new("M5 5H19A2 2 0 0 1 21 7V15A2 2 0 0 1 19 17H11L7 20.5V17H5A2 2 0 0 1 3 15V7A2 2 0 0 1 5 5Z"), new("M8 11H8.1M12 11H12.1M16 11H16.1", Accent: true)];
    public static readonly GlyphPart[] Code = [new("M8.5 7L3.5 12L8.5 17M15.5 7L20.5 12L15.5 17"), new("M13.5 5L10.5 19", Accent: true)];
    public static readonly GlyphPart[] Sparkle = [new("M10 3C10.6 7.6 12.4 9.4 17 10C12.4 10.6 10.6 12.4 10 17C9.4 12.4 7.6 10.6 3 10C7.6 9.4 9.4 7.6 10 3Z"),
        new("M17.5 14.5C17.8 16.3 18.7 17.2 20.5 17.5C18.7 17.8 17.8 18.7 17.5 20.5C17.2 18.7 16.3 17.8 14.5 17.5C16.3 17.2 17.2 16.3 17.5 14.5Z", Accent: true)];
    public static readonly GlyphPart[] Mic = [new("M12 3A3 3 0 0 1 15 6V12A3 3 0 0 1 9 12V6A3 3 0 0 1 12 3Z"), new("M5.5 11A6.5 6.5 0 0 0 18.5 11M12 17.5V21M8.5 21H15.5", Accent: true)];
    public static readonly GlyphPart[] Info = [new("M12 3A9 9 0 1 1 11.99 3Z"), new("M12 11V16.5M12 7.6V7.7", Accent: true)];
    public static readonly GlyphPart[] Partial = [new("M12 3A9 9 0 1 1 11.99 3Z"), new("M12 3A9 9 0 0 1 12 21Z", Fill: true, Accent: true)];
    public static readonly GlyphPart[] Unknown = [new("M12 3A9 9 0 1 1 11.99 3Z"), new("M8.5 12H15.5", Accent: true)];

    public static GlyphPart[] ForHealth(Fact<Health> f) => !f.IsKnown ? Unknown : f.Value switch
    {
        Health.Operational => AiGlyphs.Approve,
        Health.Maintenance => Info,
        Health.Degraded => AiGlyphs.Error,
        Health.PartialOutage => Partial,
        Health.MajorOutage => AiGlyphs.Deny,
        _ => Unknown,
    };

    public static GlyphPart[] ForApp(AppGlyph g) => g switch
    {
        AppGlyph.Bubble => Bubble,
        AppGlyph.Code => Code,
        AppGlyph.Sparkle => Sparkle,
        _ => AiGlyphs.Spark,
    };
}

/// <summary>Colors and words shared by AI2's faces. Status is never color-only: every state also has a word and a glyph shape.</summary>
public static class Ai2Palette
{
    public static Color Health(RefractionPalette t, Fact<Health> f) => !f.IsKnown ? t.Faint : Health(t, f.Value);

    public static Color Health(RefractionPalette t, Health h) => h switch
    {
        Status.Health.Operational => t.Pos,
        Status.Health.Maintenance => t.Info,
        Status.Health.Degraded => t.Warn,
        Status.Health.PartialOutage => t.Spectrum[9].Vivid,
        Status.Health.MajorOutage => t.Neg,
        _ => t.Faint,
    };

    public static Color Usage(RefractionPalette t, double pct) => pct >= 90 ? t.Neg : pct >= 70 ? t.Warn : t.Info;

    /// <summary>12400 → "12.4K", 2_100_000 → "2.1M".</summary>
    public static string Compact(double v)
    {
        if (!double.IsFinite(v)) return "—";
        var a = Math.Abs(v);
        return a >= 1e9 ? (v / 1e9).ToString("0.#", CultureInfo.InvariantCulture) + "B"
            : a >= 1e6 ? (v / 1e6).ToString("0.#", CultureInfo.InvariantCulture) + "M"
            : a >= 1e4 ? (v / 1e3).ToString("0", CultureInfo.InvariantCulture) + "K"
            : a >= 1e3 ? (v / 1e3).ToString("0.#", CultureInfo.InvariantCulture) + "K"
            : v.ToString("0", CultureInfo.InvariantCulture);
    }

    public static string Money(CostSummary c) =>
        (c.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase) ? "$" : c.Currency.ToUpperInvariant() + " ") +
        (c.Amount >= 1000 ? Math.Round(c.Amount).ToString("#,0", CultureInfo.InvariantCulture) : c.Amount.ToString("0.00", CultureInfo.InvariantCulture));

    public static string Age(DateTimeOffset at, DateTimeOffset now) => AiPalette.Ago(now - at);
}

/// <summary>Text fitting on keys (144) and dials (200×100). Every word goes through <see cref="AiText"/> (tests capture them).</summary>
internal static class Ai2Text
{
    public static void Key(SvgDocument d, string? text, double baseline, double size, Paint color, double maxWidth = 116, double x = 72, TextAlign align = TextAlign.Middle)
    {
        if (string.IsNullOrEmpty(text)) return;
        var fit = StrokeFont.FitSize(text, maxWidth, size, Math.Min(size, 14));
        var shown = StrokeFont.Measure(text, fit) > maxWidth ? StrokeFont.Ellipsize(text, maxWidth, fit) : text;
        AiText.Draw(d, shown, x, baseline, fit, color, align);
    }

    public static void Dial(SvgDocument d, string? text, double x, double baseline, double size, Paint color, double maxWidth, TextAlign align = TextAlign.Start,
        FontWeight weight = FontWeight.Semibold, double minSize = 8)
    {
        if (string.IsNullOrEmpty(text)) return;
        var fit = StrokeFont.FitSize(text, maxWidth, size, Math.Min(size, minSize), weight);
        var shown = StrokeFont.Measure(text, fit, weight) > maxWidth ? StrokeFont.Ellipsize(text, maxWidth, fit, weight) : text;
        AiText.Draw(d, shown, x, baseline, fit, color, align, weight);
    }

    public static void StaleBadge(SvgDocument d, RefractionPalette t, double x, double y, double size) => AiGlyphs.Draw(d, AiGlyphs.Stale, x, y, size, t.Dim, t.Dim);

    /// <summary>Splits "OPENED · NOT SENT" into the key's two lines (100 and 120); a phrase without " · " is line 2 only.</summary>
    public static (string? Line1, string Line2) Split(string text)
    {
        var i = text.IndexOf(" · ", StringComparison.Ordinal);
        return i < 0 ? (null, text) : (text[..i], text[(i + 3)..]);
    }
}

/// <summary>Provider health: the key, its details view, and the strip (Galleon widget 2×4, Stream Deck + segment 2×2).</summary>
public static class HealthArt
{
    private const double S = Refraction.Deck.KeySize;

    public static string Detail(ProviderHealthView h, DateTimeOffset now)
    {
        if (!h.Health.IsKnown) return h.State switch { HealthFetchState.NeverFetched => "CHECKING", HealthFetchState.Errored => "NO DATA", _ => "NOT FOUND" };
        if (h.Affected > 0) return h.Affected == 1 && h.Worst is { } w ? w : $"{h.Affected} AFFECTED";
        return Ai2Palette.Age(h.Health.ObservedAt, now);
    }

    public static SvgDocument Key(RefractionPalette t, ProviderHealthView h, DateTimeOffset now, string? flash = null, bool flashBad = false)
    {
        var d = KeyArt.Base(t);
        var conf = h.Health.At(now);
        var stale = conf == Confidence.Stale;
        var color = Ai2Palette.Health(t, h.Health);
        var sev = h.Health.IsKnown ? HealthLevels.Severity(h.Health.Value) : 0;
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            Ai2Text.Key(d, h.Short, 31, 19, t.KeyMuted, maxWidth: stale ? 92 : 116, x: stale ? 64 : 72);
            AiGlyphs.Draw(d, Ai2Glyphs.ForHealth(h.Health), 52, 38, 40, color, color);
            Ai2Text.Key(d, h.Health.IsKnown ? HealthLevels.Word(h.Health.Value) : "—", 100, 19, color);
            if (flash is null) Ai2Text.Key(d, Detail(h, now), 120, 16, t.KeyMuted);
        }
        if (flash is not null) Ai2Text.Key(d, flash, 120, 16, flashBad ? t.Neg : t.Pos);
        if (stale) Ai2Text.StaleBadge(d, t, S - 30, 14, 18);
        // Not just color: a degraded-or-worse provider also gets a ring.
        if (sev >= 2) d.Rect(2, 2, S - 4, S - 4, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = 3, Opacity = stale ? 0.4 : null }, rx: 10);
        KeyArt.HueIndex(d, AiPalette.Module(t), on: sev >= 2 && !stale);
        return d;
    }

    /// <summary>The long-press view (4 s): the components that matter, each with its color dot and word.</summary>
    public static SvgDocument Details(RefractionPalette t, ProviderHealthView h, DateTimeOffset now)
    {
        var d = KeyArt.Base(t);
        Ai2Text.Key(d, h.Short, 27, 17, t.KeyMuted);
        if (h.Components.Count == 0)
        {
            Ai2Text.Key(d, h.Health.IsKnown ? HealthLevels.Word(h.Health.Value) : "NO DATA", 70, 19, Ai2Palette.Health(t, h.Health));
            Ai2Text.Key(d, h.Incident ?? "NO COMPONENTS", 96, 14, t.KeyMuted);
            return d;
        }
        // One row per component: its status glyph (shape + color, like the strip) and its name.
        var rows = h.Components.OrderByDescending(c => HealthLevels.Severity(c.Health)).Take(4).ToList();
        for (var i = 0; i < rows.Count; i++)
        {
            var y = 52 + i * 24;
            var c = Ai2Palette.Health(t, rows[i].Health);
            AiGlyphs.Draw(d, Ai2Glyphs.ForHealth(Fact<Health>.Reported(rows[i].Health, FactSource.StatusPage, now, TimeSpan.Zero)), 8, y - 14, 16, c, c, strokeGrid: 2.2);
            Ai2Text.Key(d, rows[i].Name, y, 15, rows[i].Health == Health.Operational ? t.KeyMuted : t.KeyInk, maxWidth: 108, x: 30, align: TextAlign.Start);
        }
        if (h.Components.Count > 4) Ai2Text.Key(d, $"+{h.Components.Count - 4} MORE", 138, 12, t.Dim);
        return d;
    }

    /// <summary>
    /// The strip. Galleon (<paramref name="galleon"/>, a 360×180 widget): all eight providers in a 4×2 grid, each cell a status
    /// glyph (its shape and color: check / info / triangle / half disc / cross / dash) over the name; the header carries the summary
    /// and the selected provider's word. Stream Deck + (a 200×100 segment, read at 1:1): a 2×2 page of larger cells with the word
    /// under the name; the page follows the selection. The selected cell has a ring.
    /// </summary>
    public static SvgDocument Strip(RefractionPalette t, IReadOnlyList<ProviderHealthView> providers, int selected, bool galleon, DateTimeOffset now, string? flash = null)
    {
        var d = DialArt.Base(t);
        var known = providers.Where(p => p.Health.IsKnown).ToList();
        var issues = known.Count(p => HealthLevels.Severity(p.Health.Value) >= 2);
        var allStale = known.Count > 0 && known.All(p => p.Health.At(now) == Confidence.Stale);
        var summary = known.Count == 0 ? "CHECKING" : allStale ? "STALE" : issues == 0 ? "ALL OK" : issues == 1 ? "1 ISSUE" : $"{issues} ISSUES";
        var summaryColor = known.Count == 0 || allStale ? t.Dim : issues == 0 ? t.Pos : t.Warn;
        if (providers.Count == 0)
        {
            Ai2Text.Dial(d, "AI HEALTH", 10, 15, 11, t.KeyMuted, 90);
            Ai2Text.Dial(d, "NO PROVIDERS PICKED", 100, 60, 12, t.Dim, 180, TextAlign.Middle);
            return d;
        }
        selected = Math.Clamp(selected, 0, providers.Count - 1);
        var sel = providers[selected];
        var cols = galleon ? 4 : 2;
        const int rows = 2;
        var perPage = cols * rows;
        var pages = (providers.Count + perPage - 1) / perPage;
        var page = selected / perPage;
        if (galleon)
        {
            // Header: the summary left, the selected provider and its word right (in its color).
            Ai2Text.Dial(d, summary, 10, 15, 11, summaryColor, 70);
            var word = sel.Health.IsKnown ? HealthLevels.Word(sel.Health.Value) : "—";
            Ai2Text.Dial(d, flash ?? $"{sel.Short} {word}", 190, 15, 11, flash is null ? Ai2Palette.Health(t, sel.Health) : t.KeyInk, 108, TextAlign.End);
        }
        else
        {
            Ai2Text.Dial(d, "AI HEALTH", 10, 15, 11, t.KeyMuted, 74);
            Ai2Text.Dial(d, flash ?? (pages > 1 ? $"{summary} · {page + 1}/{pages}" : summary), 190, 15, 11, flash is null ? summaryColor : t.KeyInk, 104, TextAlign.End);
        }
        const double x0 = 6, y0 = 22, gw = 188, gh = 72, gap = 3;
        var cw = (gw - gap * (cols - 1)) / cols;
        var ch = (gh - gap * (rows - 1)) / rows;
        for (var i = 0; i < perPage; i++)
        {
            var idx = page * perPage + i;
            if (idx >= providers.Count) break;
            var p = providers[idx];
            var x = x0 + i % cols * (cw + gap);
            var y = y0 + i / cols * (ch + gap);
            var stale = p.Health.At(now) == Confidence.Stale;
            var color = Ai2Palette.Health(t, p.Health);
            d.Rect(x, y, cw, ch, new Style { Fill = t.Panel2, Opacity = 0.6 }, rx: 4);
            using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
            {
                var glyph = Ai2Glyphs.ForHealth(p.Health);
                if (galleon)
                {
                    AiGlyphs.Draw(d, glyph, x + cw / 2 - 8, y + 2.5, 16, color, color, strokeGrid: 2.2);
                    Ai2Text.Dial(d, p.Short, x + cw / 2, y + 30, 9, t.KeyInk, cw - 4, TextAlign.Middle, minSize: 7);
                }
                else
                {
                    AiGlyphs.Draw(d, glyph, x + 4, y + 8, 18, color, color, strokeGrid: 2);
                    Ai2Text.Dial(d, p.Short, x + 26, y + 15, 12, t.KeyInk, cw - 30, minSize: 9);
                    Ai2Text.Dial(d, p.Health.IsKnown ? HealthLevels.Word(p.Health.Value) : "—", x + 26, y + 29, 10, color, cw - 30, minSize: 8);
                }
            }
            if (stale) Ai2Text.StaleBadge(d, t, x + cw - 11, y + 2, 9);
            if (idx == selected) d.Rect(x - 1.5, y - 1.5, cw + 3, ch + 3, new Style { Fill = Paint.None, Stroke = t.KeyInk, StrokeWidth = 1.5 }, rx: 5);
        }
        return d;
    }
}

/// <summary>Usage faces: Codex plan windows (rings), Bedrock CloudWatch (sparkline), admin cost (big number).</summary>
public static class UsageArt
{
    private const double S = Refraction.Deck.KeySize;

    private static void Ring(SvgDocument d, double cx, double cy, double r, double width, Color track, Color color, double fraction, bool hollow, double opacity = 1)
    {
        d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = track, StrokeWidth = width, Opacity = opacity < 1 ? opacity : null });
        var f = Math.Clamp(fraction, 0, 1);
        if (hollow)
        {
            d.Circle(cx, cy, r, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = 1.5, Dash = [3, 3], Opacity = 0.7 * opacity });
            return;
        }
        if (f <= 0.002) return;
        var p = new PathBuilder().Arc(cx, cy, r, -90, -90 + 360 * Math.Min(f, 0.9999));
        d.Path(p, new Style { Fill = Paint.None, Stroke = color, StrokeWidth = width, LineCap = LineCap.Round, Opacity = opacity < 1 ? opacity : null });
    }

    private static string Pct(Fact<double> f, DateTimeOffset now) => f.At(now) == Confidence.Inferred ? $"~{f.Value:0}%" : $"{f.Value:0}%";

    /// <summary>Codex on a dial: two rings (5H outside, WEEK inside), the selected window large on the right with its reset countdown.</summary>
    public static SvgDocument CodexDial(RefractionPalette t, IReadOnlyList<CodexWindowView> windows, int selectedMinutes, DateTimeOffset now, DateTimeOffset? lastRecord, string? flash = null)
    {
        var d = DialArt.Base(t);
        if (windows.Count == 0)
        {
            AiGlyphs.Draw(d, Ai2Glyphs.Gauge, 18, 30, 40, t.Faint, t.Faint);
            Ai2Text.Dial(d, "CODEX LIMITS", 70, 40, 13, t.KeyMuted, 120);
            Ai2Text.Dial(d, flash ?? "NO DATA IN THE LOGS YET", 70, 60, 11, t.Dim, 122);
            Ai2Text.Dial(d, "PUSH TO RELOAD", 70, 78, 9, t.Faint, 122);
            return d;
        }
        var outer = windows.FirstOrDefault(w => w.WindowMinutes == 300) ?? windows[0];
        var inner = windows.FirstOrDefault(w => w.WindowMinutes == 10080) ?? (windows.Count > 1 ? windows[^1] : null);
        var sel = windows.FirstOrDefault(w => w.WindowMinutes == selectedMinutes) ?? outer;
        const double cx = 50, cy = 54;
        var stale = sel.UsedPercent.At(now) == Confidence.Stale;
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            Ring(d, cx, cy, 36, 7, t.Panel2, Ai2Palette.Usage(t, outer.UsedPercent.Value), outer.UsedPercent.Value / 100, outer.ResetPassed, outer == sel ? 1 : 0.55);
            if (inner is not null && inner != outer)
                Ring(d, cx, cy, 25, 6, t.Panel2, Ai2Palette.Usage(t, inner.UsedPercent.Value), inner.UsedPercent.Value / 100, inner.ResetPassed, inner == sel ? 1 : 0.55);
            AiText.Draw(d, sel.Label, cx, cy, 10, t.KeyMuted, TextAlign.Middle, FontWeight.Bold, TextBaseline.Middle);
            var color = sel.ResetPassed ? t.KeyMuted : Ai2Palette.Usage(t, sel.UsedPercent.Value);
            Ai2Text.Dial(d, $"CODEX · {(sel.WindowMinutes == 10080 ? "WEEKLY" : sel.Label)}", 98, 22, 11, t.KeyMuted, 92);
            Ai2Text.Dial(d, Pct(sel.UsedPercent, now), 98, 56, 30, color, 92, weight: FontWeight.Semibold, minSize: 16);
            Ai2Text.Dial(d, flash ?? sel.ResetText(now), 98, 74, 11, flash is null ? t.KeyInk : t.Pos, 94);
            var foot = sel.ResetPassed ? "NO NEWER RECORD" : lastRecord is { } lr ? "AS OF " + Ai2Palette.Age(lr, now) : "";
            Ai2Text.Dial(d, foot, 98, 91, 9, t.Dim, 94);
        }
        if (stale) Ai2Text.StaleBadge(d, t, 178, 6, 14);
        return d;
    }

    public static SvgDocument CodexKey(RefractionPalette t, CodexWindowView? w, DateTimeOffset now, string? flash = null)
    {
        var d = KeyArt.Base(t);
        if (w is null)
        {
            Ai2Text.Key(d, "CODEX", 31, 19, t.KeyMuted);
            AiGlyphs.Draw(d, Ai2Glyphs.Gauge, 52, 38, 40, t.Faint, t.Faint);
            Ai2Text.Key(d, flash ?? "NO DATA", 100, 18, t.Dim);
            Ai2Text.Key(d, "USE CODEX ONCE", 120, 15, t.Faint);
            KeyArt.HueIndex(d, AiPalette.Module(t), on: false);
            return d;
        }
        var stale = w.UsedPercent.At(now) == Confidence.Stale;
        var color = w.ResetPassed ? t.KeyMuted : Ai2Palette.Usage(t, w.UsedPercent.Value);
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            Ai2Text.Key(d, $"CODEX {(w.WindowMinutes == 10080 ? "WEEK" : w.Label)}", 31, 18, t.KeyMuted, maxWidth: stale ? 92 : 116, x: stale ? 64 : 72);
            Ring(d, 72, 70, 27, 6, t.Panel2, color, w.UsedPercent.Value / 100, w.ResetPassed);
            AiText.Draw(d, Pct(w.UsedPercent, now), 72, 70, StrokeFont.FitSize(Pct(w.UsedPercent, now), 40, 18, 12), t.KeyInk, TextAlign.Middle, FontWeight.Semibold, TextBaseline.Middle);
            Ai2Text.Key(d, flash ?? w.ResetText(now), 120, 15, flash is null ? t.KeyMuted : t.Pos);
        }
        if (stale) Ai2Text.StaleBadge(d, t, S - 30, 14, 18);
        KeyArt.HueIndex(d, AiPalette.Module(t), on: !w.ResetPassed && w.UsedPercent.Value >= 70);
        return d;
    }

    public static readonly string[] BedrockViews = ["TOKENS", "CALLS", "THROTTLES"];

    public static (string Line1, string? Line2) BedrockStateText(BedrockState s) => s switch
    {
        BedrockState.Off => ("BEDROCK USAGE IS OFF", "OPT IN FROM THIS KEY'S SETTINGS"),
        BedrockState.SafeMode => ("SAFE MODE", "THE AWS CLI NEVER RUNS"),
        BedrockState.NoCli => ("AWS CLI NOT FOUND", "INSTALL AWS CLI V2"),
        BedrockState.NeedsProfile => ("PICK AN AWS PROFILE", "IN THIS KEY'S SETTINGS"),
        BedrockState.SignInNeeded => ("SIGN IN WITH", "AWS SSO LOGIN"),
        BedrockState.ProfileNotFound => ("AWS PROFILE NOT FOUND", "CHECK THE NAME IN SETTINGS"),
        BedrockState.AccessDenied => ("PROFILE CAN'T READ", "CLOUDWATCH METRICS"),
        BedrockState.Throttled => ("CLOUDWATCH THROTTLED", "TRYING AGAIN LATER"),
        BedrockState.Error => ("CLOUDWATCH ERROR", "TRYING AGAIN LATER"),
        _ => ("WAITING FOR DATA", null),
    };

    /// <summary>Bedrock on a dial: a 30-minute sparkline (in/out tokens per minute, or calls, or throttles), throttle ticks, and the scope label.</summary>
    public static SvgDocument BedrockDial(RefractionPalette t, BedrockSnapshot b, int view, DateTimeOffset now, string? flash = null)
    {
        var d = DialArt.Base(t);
        var hue = AiPalette.Module(t);
        Ai2Text.Dial(d, $"BEDROCK · {b.Region.ToUpperInvariant()}", 10, 15, 11, t.KeyMuted, 120);
        Ai2Text.Dial(d, BedrockViews[Math.Clamp(view, 0, 2)], 190, 15, 10, t.Dim, 64, TextAlign.End);
        var series = b.Series.Value;
        if (series is null)
        {
            var (l1, l2) = BedrockStateText(b.State);
            AiGlyphs.Draw(d, Ai2Glyphs.Gauge, 14, 32, 34, b.State is BedrockState.SignInNeeded ? t.Warn : t.Faint, t.Faint);
            Ai2Text.Dial(d, l1, 58, 50, 12, b.State is BedrockState.SignInNeeded ? t.Warn : t.KeyInk, 134);
            Ai2Text.Dial(d, flash ?? l2, 58, 68, 10, t.KeyMuted, 134);
            Ai2Text.Dial(d, "ACCOUNT-WIDE · OPT-IN", 58, 88, 8, t.Faint, 134);
            return d;
        }
        var stale = b.Series.At(now) == Confidence.Stale;
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            const double x0 = 12, x1 = 188, yTop = 24, yBase = 64;
            var start = now - BedrockUsageService.Window;
            double X(DateTimeOffset at) => x0 + (x1 - x0) * Math.Clamp((at - start).TotalSeconds / BedrockUsageService.Window.TotalSeconds, 0, 1);
            var lines = view switch
            {
                1 => new[] { (series.Invocations, hue.Vivid) },
                2 => new[] { (series.Throttles, t.Neg) },
                _ => new[] { (series.InputTokens, hue.Vivid), (series.OutputTokens, t.Pos) },
            };
            var max = Math.Max(1, lines.SelectMany(l => l.Item1).Select(p => p.Value).DefaultIfEmpty(0).Max());
            d.Line(x0, yBase + 0.5, x1, yBase + 0.5, t.Panel2, 1);
            foreach (var (pts, color) in lines)
            {
                if (pts.Count == 0) continue;
                var poly = pts.Select(p => (X(p.At), yBase - (yBase - yTop) * p.Value / max)).ToList();
                if (poly.Count == 1) d.Circle(poly[0].Item1, poly[0].Item2, 2, color);
                else d.Path(new PathBuilder().Polyline(poly), new Style { Fill = Paint.None, Stroke = color, StrokeWidth = 2, LineCap = LineCap.Round, LineJoin = LineJoin.Round });
            }
            // Throttles: a red tick per minute that had any.
            var ticks = new PathBuilder();
            foreach (var p in series.Throttles.Where(p => p.Value > 0)) { var x = X(p.At); ticks.MoveTo(x, 68).LineTo(x, 73); }
            if (!ticks.IsEmpty) d.Path(ticks, new Style { Fill = Paint.None, Stroke = t.Neg, StrokeWidth = 2, LineCap = LineCap.Round });

            var text = view switch
            {
                1 => $"{Ai2Palette.Compact(series.Invocations.LastOrDefault()?.Value ?? 0)} CALLS/MIN · {Ai2Palette.Compact(series.InvocationSum)} IN 30M",
                2 => series.ThrottleSum > 0 ? $"{series.ThrottleSum:0} THROTTLED IN 30M" : "NO THROTTLES IN 30M",
                _ => series.IsEmpty ? "NO BEDROCK CALLS IN 30M" : $"{Ai2Palette.Compact(series.LatestInput ?? 0)} IN · {Ai2Palette.Compact(series.LatestOutput ?? 0)} OUT /MIN",
            };
            Ai2Text.Dial(d, flash ?? text, 10, 85, 11, flash is null ? (view == 2 && series.ThrottleSum > 0 ? t.Neg : t.KeyInk) : t.Pos, 180);
            // Old numbers stay (stale after their TTL); a current problem replaces the footer, e.g. SIGN IN WITH AWS SSO LOGIN.
            if (b.State is not (BedrockState.Ok or BedrockState.Waiting))
            {
                var (p1, p2) = BedrockStateText(b.State);
                Ai2Text.Dial(d, p2 is null ? p1 : $"{p1} {p2}", 10, 97, 8, t.Warn, 180);
            }
            else Ai2Text.Dial(d, $"ACCOUNT-WIDE · 1-MIN · {Ai2Palette.Age(b.Series.ObservedAt, now)}", 10, 97, 8, t.Dim, 180);
        }
        if (stale) Ai2Text.StaleBadge(d, t, 178, 20, 14);
        return d;
    }

    public static SvgDocument BedrockKey(RefractionPalette t, BedrockSnapshot b, DateTimeOffset now, string? flash = null)
    {
        var d = KeyArt.Base(t);
        Ai2Text.Key(d, "BEDROCK", 31, 19, t.KeyMuted);
        if (b.State is not (BedrockState.Ok or BedrockState.Waiting) || b.Series.Value is not { } s)
        {
            var (l1, l2) = BedrockKeyText(b.State);
            AiGlyphs.Draw(d, Ai2Glyphs.Gauge, 52, 38, 40, b.State is BedrockState.SignInNeeded ? t.Warn : t.Faint, t.Faint);
            Ai2Text.Key(d, flash ?? l1, 100, 15, b.State is BedrockState.SignInNeeded ? t.Warn : t.KeyInk);
            Ai2Text.Key(d, l2, 120, 13, t.KeyMuted);
            KeyArt.HueIndex(d, AiPalette.Module(t), on: false);
            return d;
        }
        var stale = b.Series.At(now) == Confidence.Stale;
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            Ai2Text.Key(d, Ai2Palette.Compact((s.LatestInput ?? 0) + (s.LatestOutput ?? 0)), 78, 40, t.KeyInk);
            Ai2Text.Key(d, "TOKENS/MIN", 100, 16, t.KeyMuted);
            Ai2Text.Key(d, flash ?? (s.ThrottleSum > 0 ? $"{s.ThrottleSum:0} THROTTLED" : "ACCOUNT-WIDE"), 120, 14, flash is null ? (s.ThrottleSum > 0 ? t.Neg : t.Dim) : t.Pos);
        }
        if (stale) Ai2Text.StaleBadge(d, t, S - 30, 14, 18);
        KeyArt.HueIndex(d, AiPalette.Module(t), on: s.ThrottleSum > 0);
        return d;
    }

    /// <summary>The same states in key-sized words (at most 13 characters a line).</summary>
    public static (string Line1, string? Line2) BedrockKeyText(BedrockState s) => s switch
    {
        BedrockState.Off => ("OPT-IN OFF", "SEE SETTINGS"),
        BedrockState.SafeMode => ("SAFE MODE", "CLI NEVER RUNS"),
        BedrockState.NoCli => ("NO AWS CLI", "INSTALL CLI V2"),
        BedrockState.NeedsProfile => ("NO PROFILE", "SEE SETTINGS"),
        BedrockState.SignInNeeded => ("SIGN IN WITH", "AWS SSO LOGIN"),
        BedrockState.ProfileNotFound => ("NO SUCH", "PROFILE"),
        BedrockState.AccessDenied => ("NO ACCESS", "CLOUDWATCH"),
        BedrockState.Throttled => ("THROTTLED", "RETRYING"),
        BedrockState.Error => ("CLOUDWATCH", "ERROR"),
        _ => ("WAITING", null),
    };

    public static (string Line1, string? Line2) AdminKeyText(AdminState s) => s switch
    {
        AdminState.Off => ("OPT-IN OFF", "SEE SETTINGS"),
        AdminState.SafeMode => ("SAFE MODE", "NO API CALLS"),
        AdminState.NoKey => ("NO KEY", "SEE SETTINGS"),
        AdminState.Unauthorized => ("KEY REFUSED", "SEE SETTINGS"),
        AdminState.Error => ("API ERROR", "RETRYING"),
        _ => ("WAITING", null),
    };

    public static (string Line1, string? Line2) AdminStateText(AdminState s) => s switch
    {
        AdminState.Off => ("ADMIN USAGE IS OFF", "OPT IN FROM THIS KEY'S SETTINGS"),
        AdminState.SafeMode => ("SAFE MODE", "NO API CALLS"),
        AdminState.NoKey => ("SAVE AN ADMIN KEY", "IN THIS KEY'S SETTINGS"),
        AdminState.Unauthorized => ("THE KEY WAS REFUSED", "CHECK IT IN SETTINGS"),
        AdminState.Error => ("USAGE API ERROR", "TRYING AGAIN LATER"),
        _ => ("WAITING FOR DATA", null),
    };

    /// <summary>Admin cost on a dial: month-to-date cost (or 24 h tokens), always labeled NOT REAL-TIME.</summary>
    public static SvgDocument AdminDial(RefractionPalette t, AdminSnapshot a, int view, DateTimeOffset now, string? flash = null)
    {
        var d = DialArt.Base(t);
        var name = a.Provider == AdminProvider.Anthropic ? "ANTHROPIC API" : "OPENAI API";
        Ai2Text.Dial(d, name, 10, 15, 11, t.KeyMuted, 110);
        Ai2Text.Dial(d, "NOT REAL-TIME", 190, 15, 9, t.Warn, 74, TextAlign.End);
        if (a.State != AdminState.Ok || !a.MonthCost.IsKnown)
        {
            var (l1, l2) = AdminStateText(a.State);
            Ai2Text.Dial(d, l1, 100, 52, 13, t.KeyInk, 180, TextAlign.Middle);
            Ai2Text.Dial(d, flash ?? l2, 100, 72, 10, t.KeyMuted, 180, TextAlign.Middle);
            return d;
        }
        var stale = a.MonthCost.At(now) == Confidence.Stale;
        using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
        {
            var big = view == 1 ? Ai2Palette.Compact(a.Tokens24h.Value) : Ai2Palette.Money(a.MonthCost.Value!);
            var label = view == 1 ? "TOKENS · LAST 24 H" : "COST · MONTH TO DATE";
            Ai2Text.Dial(d, big, 100, 58, 32, t.KeyInk, 180, TextAlign.Middle, minSize: 16);
            Ai2Text.Dial(d, flash ?? label, 100, 78, 11, flash is null ? t.KeyMuted : t.Pos, 180, TextAlign.Middle);
            Ai2Text.Dial(d, $"ORG-WIDE · DAILY DATA · CHECKED {Ai2Palette.Age(a.MonthCost.ObservedAt, now)}", 100, 94, 8, t.Dim, 184, TextAlign.Middle);
        }
        if (stale) Ai2Text.StaleBadge(d, t, 178, 20, 14);
        return d;
    }

    public static SvgDocument AdminKey(RefractionPalette t, AdminSnapshot a, DateTimeOffset now, string? flash = null)
    {
        var d = KeyArt.Base(t);
        Ai2Text.Key(d, a.Provider == AdminProvider.Anthropic ? "ANTHROPIC" : "OPENAI", 31, 18, t.KeyMuted);
        if (a.State != AdminState.Ok || a.MonthCost.Value is not { } cost)
        {
            var (l1, l2) = AdminKeyText(a.State);
            AiGlyphs.Draw(d, Ai2Glyphs.Gauge, 52, 38, 40, t.Faint, t.Faint);
            Ai2Text.Key(d, flash ?? l1, 100, 15, t.KeyInk);
            Ai2Text.Key(d, l2, 120, 13, t.KeyMuted);
            return d;
        }
        Ai2Text.Key(d, Ai2Palette.Money(cost), 78, 36, t.KeyInk);
        Ai2Text.Key(d, "THIS MONTH", 100, 16, t.KeyMuted);
        Ai2Text.Key(d, flash ?? "NOT REAL-TIME", 120, 14, flash is null ? t.Warn : t.Pos);
        return d;
    }
}

/// <summary>The AI OPS widget (Galleon screen first): health pills for every provider, the Codex windows, and one detail line.</summary>
public static class OpsArt
{
    public static SvgDocument Widget(RefractionPalette t, IReadOnlyList<ProviderHealthView> providers, int selected, IReadOnlyList<CodexWindowView> codex,
        BedrockSnapshot bedrock, DateTimeOffset now, string? flash = null)
    {
        var d = DialArt.Base(t);
        var known = providers.Where(p => p.Health.IsKnown).ToList();
        var issues = known.Count(p => HealthLevels.Severity(p.Health.Value) >= 2);
        Ai2Text.Dial(d, "AI OPS", 10, 14, 11, t.KeyMuted, 60);
        var summary = known.Count == 0 ? "CHECKING" : issues == 0 ? "ALL OK" : issues == 1 ? "1 ISSUE" : $"{issues} ISSUES";
        Ai2Text.Dial(d, summary, 190, 14, 11, known.Count == 0 ? t.Dim : issues == 0 ? t.Pos : t.Warn, 110, TextAlign.End);

        // Pills: one column per provider.
        var n = Math.Max(1, providers.Count);
        var cw = 184.0 / n;
        for (var i = 0; i < providers.Count; i++)
        {
            var p = providers[i];
            var cx = 8 + cw * (i + 0.5);
            var stale = p.Health.At(now) == Confidence.Stale;
            var color = Ai2Palette.Health(t, p.Health);
            using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
            {
                // OK is a dot; anything else wears its status glyph (shape, not just color).
                if (p.Health.IsKnown && p.Health.Value != Health.Operational) AiGlyphs.Draw(d, Ai2Glyphs.ForHealth(p.Health), cx - 7, 21, 14, color, color, strokeGrid: 2.4);
                else if (p.Health.IsKnown) d.Circle(cx, 28, 5.5, color);
                else d.Circle(cx, 28, 5, new Style { Fill = Paint.None, Stroke = t.Faint, StrokeWidth = 1.5 });
                Ai2Text.Dial(d, p.Short.Length > 3 ? p.Short[..3] : p.Short, cx, 44, 8, i == selected ? t.KeyInk : t.Dim, cw - 2, TextAlign.Middle, minSize: 6);
            }
            if (i == selected) d.Circle(cx, 28, 9, new Style { Fill = Paint.None, Stroke = t.KeyInk, StrokeWidth = 1.5 });
        }

        // Codex windows as bars.
        var rows = codex.Take(2).ToList();
        if (rows.Count == 0) Ai2Text.Dial(d, "CODEX LIMITS: NO DATA YET", 10, 64, 9, t.Faint, 180);
        for (var r = 0; r < rows.Count; r++)
        {
            var w = rows[r];
            var y = 54 + r * 13;
            var stale = w.UsedPercent.At(now) == Confidence.Stale;
            using (d.Group(new Style { Opacity = stale ? 0.4 : null }))
            {
                Ai2Text.Dial(d, $"CODEX {w.Label}", 10, y + 4, 9, t.KeyMuted, 52);
                d.Rect(66, y - 2, 88, 6, t.Panel2, rx: 3);
                var f = Math.Clamp(w.UsedPercent.Value / 100, 0, 1);
                if (w.ResetPassed) d.Rect(66, y - 2, 88, 6, new Style { Fill = Paint.None, Stroke = t.Dim, StrokeWidth = 1, Dash = [2, 2] }, rx: 3);
                else if (f > 0) d.Rect(66, y - 2, Math.Max(6, 88 * f), 6, Ai2Palette.Usage(t, w.UsedPercent.Value), rx: 3);
                var pct = w.ResetPassed ? "~0%" : $"{w.UsedPercent.Value:0}%";
                AiText.Draw(d, pct, 190, y + 4, 9, t.KeyInk, TextAlign.End);
            }
        }

        // The selected provider's line (Bedrock adds its live usage when opted in).
        var line = flash;
        Color lineColor = flash is null ? t.KeyMuted : t.Pos;
        if (line is null && providers.Count > 0)
        {
            var p = providers[Math.Clamp(selected, 0, providers.Count - 1)];
            var word = p.Health.IsKnown ? HealthLevels.Word(p.Health.Value) : "—";
            var detail = HealthArt.Detail(p, now);
            if (p.Id == "bedrock" && bedrock.State == BedrockState.Ok && bedrock.Series.Value is { } s)
                detail = $"{Ai2Palette.Compact((s.LatestInput ?? 0) + (s.LatestOutput ?? 0))} TOK/MIN" + (s.ThrottleSum > 0 ? $" · {s.ThrottleSum:0} THR" : "");
            line = $"{p.Short} {word} · {detail}";
            lineColor = Ai2Palette.Health(t, p.Health) is var c && p.Health.IsKnown && HealthLevels.Severity(p.Health.Value) >= 2 ? c : t.KeyMuted;
        }
        Ai2Text.Dial(d, line, 100, 93, 10, lineColor, 184, TextAlign.Middle, minSize: 7);
        return d;
    }
}

/// <summary>App keys: running dot, a front ring, a hollow mic when a voice session is (inferred) live, the agent-task count.</summary>
public static class AppArt
{
    private const double S = Refraction.Deck.KeySize;

    public static string StatusWord(AppView a) =>
        !a.Installed && !a.IsRunning ? "NOT INSTALLED" : a.InFront ? "IN FRONT" : a.IsRunning ? "RUNNING" : "NOT RUNNING";

    public static SvgDocument Key(RefractionPalette t, AppView a, DateTimeOffset now, string? flash = null, bool flashBad = false)
    {
        var d = KeyArt.Base(t);
        var hue = AiPalette.Module(t);
        var ink = a.IsRunning ? t.KeyInk : t.Faint;
        Ai2Text.Key(d, a.Def.Short, 31, 19, t.KeyMuted, maxWidth: 96);
        AiGlyphs.Draw(d, Ai2Glyphs.ForApp(a.Def.Glyph), 52, 38, 40, ink, a.IsRunning ? hue.Vivid : t.Faint);
        var word = StatusWord(a);
        Ai2Text.Key(d, word, 100, 17, a.InFront ? t.Info : a.IsRunning ? t.Pos : t.Dim);
        string? line = flash;
        Paint lineColor = flash is null ? t.KeyMuted : flashBad ? t.Neg : t.Pos;
        if (line is null)
        {
            if (a.Voice) { line = "~MIC LIVE"; lineColor = t.Warn; }
            else if (a.AgentTasks.IsKnown && a.AgentTasks.Value > 0) { line = $"~{a.AgentTasks.Value} WORKING"; lineColor = t.Info; }
            else if (a.Installed || a.IsRunning) line = a.IsRunning ? "PRESS: FOCUS" : "PRESS: OPEN";
        }
        Ai2Text.Key(d, line, 120, 15, lineColor);
        // Running: a dot top-right. In front: a ring. Voice (inferred): a hollow mic top-left.
        if (a.IsRunning) d.Circle(S - 18, 18, 5, t.Pos);
        if (a.InFront) d.Rect(2, 2, S - 4, S - 4, new Style { Fill = Paint.None, Stroke = t.Info, StrokeWidth = 3 }, rx: 10);
        if (a.Voice) AiGlyphs.Draw(d, Ai2Glyphs.Mic, 8, 8, 20, t.Warn, t.Warn, hollow: true);
        KeyArt.HueIndex(d, hue, on: a.InFront);
        return d;
    }
}

/// <summary>Ask AI: a key (target + link kind) and a dial (turn to pick a target).</summary>
public static class AskArt
{
    private const double S = Refraction.Deck.KeySize;

    /// <summary>Result words; " · " splits them into the key's two lines (a dial shows them on one).</summary>
    public static string ResultText(AskResult r) => r switch
    {
        AskResult.Opened => "OPENED · NOT SENT",
        AskResult.OpenedClipboardChanged => "OPENED · CLIP CHANGED",
        AskResult.InTerminal => "SELECT TEXT · IN AN EDITOR",
        AskResult.NothingSelected => "NOTHING · SELECTED",
        AskResult.Elevated => "ADMIN APP · CAN'T COPY",
        AskResult.ClipboardBusy => "CLIPBOARD · BUSY",
        AskResult.TargetMissing => "NOT · INSTALLED",
        AskResult.OnAirBlocked => "ON AIR · WEB OFF",
        AskResult.NoForeground => "NO APP · IN FRONT",
        AskResult.SafeMode => "SAFE MODE",
        _ => "DIDN'T · WORK",
    };

    public static string KeyKindLabel(AskTarget t) => t.Kind switch { AskLinkKind.Documented => "DEEP LINK", AskLinkKind.Unofficial => "UNOFFICIAL", _ => "UNDOCUMENTED" };

    public static SvgDocument Key(RefractionPalette t, AskTarget target, bool available, string? flash = null, bool flashBad = false)
    {
        var d = KeyArt.Base(t);
        var hue = AiPalette.Module(t);
        Ai2Text.Key(d, "ASK AI", 31, 19, t.KeyMuted);
        AiGlyphs.Draw(d, AiGlyphs.Input, 52, 38, 40, available ? t.KeyInk : t.Faint, available ? hue.Vivid : t.Faint);
        var flashColor = flashBad ? t.Neg : t.Pos;
        var (f1, f2) = flash is null ? (null, null) : Ai2Text.Split(flash);
        Ai2Text.Key(d, f1 ?? target.Short, 100, 18, f1 is not null ? flashColor : available ? t.KeyInk : t.Dim);
        var line = f2 ?? (available ? KeyKindLabel(target) : "NOT INSTALLED");
        Ai2Text.Key(d, line, 120, 14, flash is not null ? flashColor : target.Kind == AskLinkKind.Documented ? t.Dim : t.Warn);
        KeyArt.HueIndex(d, hue, on: false);
        return d;
    }

    public static SvgDocument Dial(RefractionPalette t, IReadOnlyList<AskTarget> targets, int selected, Func<AskTarget, bool> available, string? flash = null, bool flashBad = false)
    {
        var d = DialArt.Base(t);
        Ai2Text.Dial(d, "ASK AI ABOUT THIS", 10, 15, 11, t.KeyMuted, 120);
        Ai2Text.Dial(d, "NEVER SENDS", 190, 15, 9, t.Dim, 70, TextAlign.End);
        if (targets.Count == 0) { Ai2Text.Dial(d, "NO TARGET INSTALLED", 100, 58, 12, t.Dim, 180, TextAlign.Middle); return d; }
        var sel = targets[Math.Clamp(selected, 0, targets.Count - 1)];
        AiGlyphs.Draw(d, AiGlyphs.Input, 12, 30, 34, t.KeyInk, AiPalette.Module(t).Vivid);
        Ai2Text.Dial(d, sel.Name, 54, 50, 16, available(sel) ? t.KeyInk : t.Dim, 140, minSize: 10);
        Ai2Text.Dial(d, sel.KindLabel, 54, 66, 9, sel.Kind == AskLinkKind.Documented ? t.Dim : t.Warn, 140);
        Ai2Text.Dial(d, flash ?? "TURN: TARGET · PUSH: COPY + OPEN", 100, 90, 10, flash is null ? t.KeyMuted : flashBad ? t.Neg : t.Pos, 184, TextAlign.Middle);
        // Position dots.
        var n = targets.Count;
        var x0 = 100 - (n - 1) * 5.0;
        for (var i = 0; i < n; i++) d.Circle(x0 + i * 10, 77, i == selected ? 2.6 : 1.8, i == selected ? t.KeyInk : t.Faint);
        return d;
    }
}

/// <summary>Dictation: what a press sends now (Win+H, or a Ctrl+I hold into VS Code), and a ring while holding.</summary>
public static class DictateArt
{
    private const double S = Refraction.Deck.KeySize;

    public static string ResultText(DictateResult r) => r switch
    {
        DictateResult.Toggled => "TOGGLED",
        DictateResult.Holding => "HOLDING",
        DictateResult.Released => "RELEASED",
        DictateResult.NotVsCode => "VS CODE · NOT IN FRONT",
        DictateResult.Elevated => "ADMIN APP",
        DictateResult.SafeMode => "SAFE MODE",
        DictateResult.Failed => "DIDN'T WORK",
        _ => "",
    };

    public static SvgDocument Key(RefractionPalette t, string hint, string modeLabel, bool holding, string? flash = null, bool flashBad = false)
    {
        var d = KeyArt.Base(t);
        var hue = AiPalette.Module(t);
        Ai2Text.Key(d, "DICTATE", 31, 19, t.KeyMuted);
        AiGlyphs.Draw(d, Ai2Glyphs.Mic, 52, 38, 40, holding ? t.Pos : t.KeyInk, holding ? t.Pos : hue.Vivid);
        var flashColor = flashBad ? t.Neg : t.Pos;
        var (f1, f2) = flash is null ? (null, null) : Ai2Text.Split(flash);
        Ai2Text.Key(d, holding ? "HOLDING" : f1 ?? hint, 100, 17, holding ? t.Pos : f1 is not null ? flashColor : t.KeyInk);
        Ai2Text.Key(d, holding ? "CTRL+I" : f2 ?? modeLabel, 120, 14, holding ? t.Pos : flash is null ? t.Dim : flashColor);
        if (holding) d.Rect(2, 2, S - 4, S - 4, new Style { Fill = Paint.None, Stroke = t.Pos, StrokeWidth = 4 }, rx: 10);
        KeyArt.HueIndex(d, hue, on: holding);
        return d;
    }

    public static SvgDocument Dial(RefractionPalette t, string hint, string modeLabel, string? flash = null, bool flashBad = false)
    {
        var d = DialArt.Base(t);
        Ai2Text.Dial(d, "DICTATION", 10, 15, 11, t.KeyMuted, 120);
        AiGlyphs.Draw(d, Ai2Glyphs.Mic, 12, 30, 34, t.KeyInk, AiPalette.Module(t).Vivid);
        Ai2Text.Dial(d, hint, 54, 52, 16, t.KeyInk, 140, minSize: 10);
        Ai2Text.Dial(d, modeLabel, 54, 68, 9, t.Dim, 140);
        Ai2Text.Dial(d, flash ?? "TURN: MODE · PUSH: TOGGLE", 100, 90, 10, flash is null ? t.KeyMuted : flashBad ? t.Neg : t.Pos, 184, TextAlign.Middle);
        return d;
    }
}
