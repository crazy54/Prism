using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Render;

/// <summary>Which transport glyph a key shows.</summary>
public enum TransportGlyph { PlayPause, Next, Previous }

/// <summary>A short message drawn in a frame's text area (never over art).</summary>
public sealed record FrameNotice(string Text, bool IsError);

/// <summary>
/// Spotify key and dial frames. Album art rules (Spotify Developer Terms, TEAM.md): every image is drawn with
/// <see cref="ImageFit.Contain"/>, whole, with no corner radius, mask, tint or overlay; text, progress and focus marks sit
/// outside the art box. No Spotify logo anywhere (placeholders use <see cref="Glyphs.MusicNote"/>); attribution is the
/// plain word "Spotify" in text.
/// </summary>
public static class SpotifyArt
{
    public const double KeyArtX = 24, KeyArtY = 8, KeyArtSize = 96;
    public const double DialArtX = 10, DialArtY = 12, DialArtSize = 76;

    public static SpectrumColor Hue(RefractionPalette t) => Hues.For(t, "spotify");

    // ------------------------------------------------------------------ shared pieces

    /// <summary>Album art, whole and as returned (resized only).</summary>
    public static void Art(SvgDocument d, ArtImage art, double x, double y, double size) =>
        d.Image(art.Display, x, y, size, size, ImageFit.Contain);

    /// <summary>The empty-art tile: a panel square with the generic music note (never the Spotify logo).</summary>
    public static void Placeholder(SvgDocument d, RefractionPalette t, double x, double y, double size, Action<SvgDocument, Color>? glyph = null)
    {
        d.Rect(x, y, size, size, t.IsDark ? Color.FromHex("#14171f") : t.Panel2, rx: Math.Min(6, size / 8));
        var g = size * 0.62;
        using (d.Group(Transform.Translate(x + (size - g) / 2, y + (size - g) / 2).Then(Transform.Scale(g / 64))))
            (glyph ?? Glyphs.MusicNote)(d, t.IsDark ? t.Faint : t.Dim);
    }

    private static void ArtOrPlaceholder(SvgDocument d, RefractionPalette t, ArtImage? art, double x, double y, double size)
    {
        if (art is not null) Art(d, art, x, y, size);
        else Placeholder(d, t, x, y, size);
    }

    private static void Progress(SvgDocument d, RefractionPalette t, double x, double y, double w, double h, double fraction, bool playing)
    {
        var hue = Hue(t);
        d.Rect(x, y, w, h, t.Panel2, rx: h / 2);
        var f = Math.Clamp(fraction, 0, 1);
        if (f > 0) d.Rect(x, y, Math.Max(h, w * f), h, playing ? hue.Vivid : t.Muted, rx: h / 2);
    }

    private static string Fit(string text, double width, double size, FontWeight weight = FontWeight.Semibold, TextCase textCase = TextCase.SmallCaps, double tracking = 0) =>
        StrokeFont.Ellipsize(text, width, size, weight, tracking, textCase);

    /// <summary>Splits text over two lines by words; the second line is ellipsized.</summary>
    public static (string Line1, string? Line2) Wrap2(string text, double width, double size, FontWeight weight = FontWeight.Semibold)
    {
        if (StrokeFont.Measure(text, size, weight) <= width) return (text, null);
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var line = "";
        var i = 0;
        for (; i < words.Length; i++)
        {
            var candidate = line.Length == 0 ? words[i] : line + " " + words[i];
            if (StrokeFont.Measure(candidate, size, weight) > width) break;
            line = candidate;
        }
        if (line.Length == 0) return (Fit(text, width, size, weight), null);
        var rest = string.Join(' ', words.Skip(i));
        return (line, rest.Length == 0 ? null : Fit(rest, width, size, weight));
    }

    // ------------------------------------------------------------------ keys (144-unit square)

    /// <summary>A glyph key in the Refraction key grammar; disabled keys draw the glyph faint.</summary>
    public static SvgDocument GlyphKey(RefractionPalette t, Action<SvgDocument, Color> glyph, string? label, bool on, bool enabled = true)
    {
        var hue = Hue(t);
        var lit = on && enabled;
        var d = KeyArt.Base(t, hue, lit);
        var ink = !enabled ? t.Faint : lit ? hue.Ink : t.KeyInk;
        using (d.Group(Transform.Translate(40, label is null ? 34 : 24)))
            glyph(d, ink);
        if (label is not null)
        {
            var size = StrokeFont.FitSize(label, KeyArt.Size - 28, Refraction.Deck.LabelSize, 16);
            d.Text(label, KeyArt.Size / 2, 114, size, enabled ? t.KeyMuted : t.Faint, TextAlign.Middle);
        }
        KeyArt.HueIndex(d, hue, lit);
        return d;
    }

    /// <summary>
    /// Now Playing key: the art (whole, 96 units) on top, a progress line under it and the title below.
    /// Text dims when paused; the art is never dimmed.
    /// </summary>
    public static SvgDocument NowPlayingKey(RefractionPalette t, PlayerSnapshot s, DateTimeOffset now, string? hint = null)
    {
        // Streamer-safe hid another app's title and art: the app name only, lit while it plays.
        if (s.Private) return GlyphKey(t, Glyphs.MusicNote, hint ?? (s.AppName ?? "MEDIA").ToUpperInvariant(), on: s.IsPlaying && hint is null);
        if (!s.HasItem) return GlyphKey(t, Glyphs.MusicNote, hint ?? "NOT PLAYING", on: false);
        var hue = Hue(t);
        var d = KeyArt.Base(t, hue, false);
        ArtOrPlaceholder(d, t, s.Art, KeyArtX, KeyArtY, KeyArtSize);
        var fraction = s.DurationMs is > 0 && s.PositionNow(now) is { } pos ? (double)pos / s.DurationMs.Value : 0;
        Progress(d, t, KeyArtX, KeyArtY + KeyArtSize + 6, KeyArtSize, 4, fraction, s.IsPlaying);
        var title = hint ?? s.Title!;
        var size = StrokeFont.FitSize(title, 128, 21, 18);
        d.Text(Fit(title, 128, size), KeyArt.Size / 2, 135, size, hint is not null ? t.Warn : s.IsPlaying ? t.KeyInk : t.KeyMuted, TextAlign.Middle);
        return d;
    }

    /// <summary>A transport key. <paramref name="app"/> names the app it controls when that isn't Spotify ("CHROME"): text only.</summary>
    public static SvgDocument TransportKey(RefractionPalette t, TransportGlyph kind, bool playing, bool enabled, string? app = null) => kind switch
    {
        TransportGlyph.PlayPause => GlyphKey(t, playing ? SpotifyGlyphs.Pause : SpotifyGlyphs.Play, app, on: playing, enabled),
        TransportGlyph.Next => GlyphKey(t, SpotifyGlyphs.Next, app, on: false, enabled),
        _ => GlyphKey(t, SpotifyGlyphs.Previous, app, on: false, enabled),
    };

    public static SvgDocument LikeKey(RefractionPalette t, bool? liked, bool enabled, string? label = null) =>
        GlyphKey(t, (d, c) => SpotifyGlyphs.Heart(d, c, liked == true), label, on: liked == true, enabled);

    public static SvgDocument ShuffleKey(RefractionPalette t, bool? on, bool enabled, string? label = null) =>
        GlyphKey(t, SpotifyGlyphs.Shuffle, label, on: on == true, enabled);

    public static SvgDocument RepeatKey(RefractionPalette t, RepeatMode? mode, bool enabled, string? label = null)
    {
        var hue = Hue(t);
        var on = mode is RepeatMode.Context or RepeatMode.Track;
        return GlyphKey(t, (d, c) => SpotifyGlyphs.Repeat(d, c, mode == RepeatMode.Track, t.IsDark ? t.Bg : Color.White), label ?? (mode == RepeatMode.Track ? "TRACK" : null), on, enabled);
    }

    /// <param name="caption">The value caption: "VOLUME", or "SPOTIFY" while another app is shown (it is still Spotify's volume).</param>
    public static SvgDocument VolumeKey(RefractionPalette t, int? percent, bool enabled, string? label = null, string caption = "VOLUME")
    {
        var hue = Hue(t);
        if (!enabled || percent is null) return GlyphKey(t, (d, c) => Glyphs.Speaker(d, c, 2), label ?? caption, on: false, enabled: enabled);
        var muted = percent == 0;
        return KeyArt.Value(t, caption, muted ? "MUTED" : percent.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) + "%", hue,
            muted ? null : percent.Value / 100.0, on: !muted);
    }

    // ------------------------------------------------------------------ dials (200×100 canvas, Stream Deck + strip and Galleon widgets)

    /// <summary>Now playing on a dial: art left (whole, 76 units), caption, title, artist, progress and times beside it.</summary>
    public static SvgDocument NowPlayingDial(RefractionPalette t, PlayerSnapshot s, DateTimeOffset now, bool active, FrameNotice? notice = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        const double x = 96, w = 94;
        ArtOrPlaceholder(d, t, s.HasItem ? s.Art : null, DialArtX, DialArtY, DialArtSize);
        var caption = s.IsSpotify ? "Spotify" : s.AppName ?? "Media";
        d.Text(Fit(caption, w - 14, 10, textCase: TextCase.Upper, tracking: 0.08), x, 23, 10, t.Dim, tracking: 0.08, textCase: TextCase.Upper);
        if (s.State == PlayState.Paused)
            d.Path(new PathBuilder().RoundedRect(x + w - 9, 15, 3, 8, 1).RoundedRect(x + w - 3.5, 15, 3, 8, 1), new Style { Fill = t.Dim });
        if (s.Private)
        {
            // Streamer-safe: the app and its state, never the (possibly private) tab title or artwork.
            d.Text(s.IsPlaying ? "Playing" : s.State == PlayState.Paused ? "Paused" : "Loaded", x, 43, 16, s.IsPlaying ? t.KeyInk : t.KeyMuted);
            NoticeText(d, notice?.Text ?? SpotifyText.HiddenTitle, x, 60, w, notice is { IsError: true } ? t.Warn : t.Muted);
            var ppos = s.PositionNow(now);
            Progress(d, t, x, 70, w, 4, s.DurationMs is > 0 && ppos is { } pp ? (double)pp / s.DurationMs.Value : 0, s.IsPlaying);
            d.Text(SpotifyText.Duration(ppos), x, 89, 11, t.Dim);
            d.Text(SpotifyText.Duration(s.DurationMs), x + w, 89, 11, t.Dim, TextAlign.End);
            return d;
        }
        if (!s.HasItem)
        {
            d.Text("Nothing playing", x, 47, 14, t.KeyInk);
            NoticeText(d, notice?.Text ?? (s.IsSpotify ? "Play something in Spotify" : "No track info"), x, 64, w, notice is { IsError: true } ? t.Warn : t.Muted);
            return d;
        }
        var titleSize = StrokeFont.FitSize(s.Title!, w, 16, 13);
        d.Text(Fit(s.Title!, w, titleSize), x, 43, titleSize, s.IsPlaying ? t.KeyInk : t.KeyMuted);
        if (notice is not null) NoticeText(d, notice.Text, x, 60, w, notice.IsError ? t.Warn : t.Pos);
        else if (s.ArtistLine.Length > 0) d.Text(Fit(s.ArtistLine, w, 12), x, 60, 12, t.Muted);
        var pos = s.PositionNow(now);
        var fraction = s.DurationMs is > 0 && pos is { } p ? (double)p / s.DurationMs.Value : 0;
        Progress(d, t, x, 70, w, 4, fraction, s.IsPlaying);
        d.Text(SpotifyText.Duration(pos), x, 89, 11, t.Dim);
        d.Text(SpotifyText.Duration(s.DurationMs), x + w, 89, 11, t.Dim, TextAlign.End);
        return d;
    }

    /// <summary>A short message line that shrinks (11 → 9) before it ellipsizes.</summary>
    private static void NoticeText(SvgDocument d, string text, double x, double y, double w, Color color)
    {
        text = SpotifyText.DialHint(text);
        var size = StrokeFont.FitSize(text, w, 11, 9);
        d.Text(Fit(text, w, size), x, y, size, color);
    }

    /// <summary>Spotify's device volume on a dial: caption, big value with the device name beside it, meter.</summary>
    public static SvgDocument VolumeDial(RefractionPalette t, int? percent, string? device, bool active, FrameNotice? notice = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        d.Text("Spotify volume", 16, 24, 12, t.KeyMuted, tracking: 0.08, textCase: TextCase.Upper);
        var muted = percent == 0;
        var value = percent is null ? "--" : muted ? "MUTED" : percent.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) + "%";
        var size = StrokeFont.FitSize(value, 100, Refraction.Deck.DialValueSize, 18);
        d.Text(value, 16, 62, size, percent is null || muted ? t.KeyMuted : active ? hue.Ink : t.KeyInk);
        var valueRight = 16 + StrokeFont.Measure(value, size) + 10;
        var sideWidth = Math.Max(30, 184 - valueRight);
        if (notice is not null)
        {
            var text = SpotifyText.DialHint(notice.Text);
            var ns = StrokeFont.FitSize(text, sideWidth, 11, 9);
            d.Text(Fit(text, sideWidth, ns), 184, 62, ns, notice.IsError ? t.Warn : t.Muted, TextAlign.End);
        }
        else if (device is { Length: > 0 }) d.Text(Fit(device, sideWidth, 11), 184, 62, 11, t.Dim, TextAlign.End);
        const double mx = 16, mw = 168, my = 78, mh = 6;
        d.Rect(mx, my, mw, mh, t.Panel2, rx: mh / 2);
        if (percent is > 0)
        {
            var f = percent.Value / 100.0;
            var grad = d.LinearGradient(mx, 0, mx + mw, 0, [(0, hue.Vivid, 0.55), (1, hue.Vivid)], userSpace: true);
            d.Rect(mx, my, Math.Max(mh, mw * f), mh, new Style { Fill = grad, Filter = active ? d.Glow(2.5) : null }, rx: mh / 2);
        }
        return d;
    }

    /// <summary>A message frame (signed out, errors, empty lists): a glyph tile and two lines.</summary>
    public static SvgDocument MessageDial(RefractionPalette t, string caption, string line1, string? line2, bool active, Action<SvgDocument, Color>? glyph = null, bool warn = false)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        Placeholder(d, t, DialArtX, DialArtY, DialArtSize, glyph);
        const double x = 96, w = 94;
        d.Text(Fit(caption, w, 10, textCase: TextCase.Upper, tracking: 0.08), x, 23, 10, t.Dim, tracking: 0.08, textCase: TextCase.Upper);
        var (a, b) = Wrap2(line1, w, 14);
        d.Text(a, x, 46, 14, warn ? t.Warn : t.KeyInk);
        if (b is not null) d.Text(b, x, 63, 14, warn ? t.Warn : t.KeyInk);
        if (line2 is not null)
        {
            var (c, e) = Wrap2(line2, w, 11);
            d.Text(c, x, b is null ? 63 : 79, 11, t.Muted);
            if (e is not null && b is null) d.Text(e, x, 77, 11, t.Muted);
        }
        return d;
    }

    // ------------------------------------------------------------------ browser

    /// <summary>Supplies cached art for a row (null = not loaded yet; the frame shows a placeholder).</summary>
    public delegate ArtImage? ArtLookup(IReadOnlyList<ImageDto>? images, bool focus);

    private static Action<SvgDocument, Color>? RowGlyph(RowKind k) => k switch
    {
        RowKind.Back => SpotifyGlyphs.Back,
        RowKind.NowPlaying => Glyphs.MusicNote,
        RowKind.PlayAll => SpotifyGlyphs.Play,
        RowKind.ShufflePlay => SpotifyGlyphs.Shuffle,
        _ => null,
    };

    private static void RowTile(SvgDocument d, RefractionPalette t, BrowserRow row, ArtLookup art, bool focus, double x, double y, double size)
    {
        if (row.Kind == RowKind.Loading)
        {
            d.Rect(x, y, size, size, t.IsDark ? Color.FromHex("#1a1e29") : t.LineSoft, rx: Math.Min(4, size / 6));
            return;
        }
        if (row.IsData && art(row.Images, focus) is { } a) { Art(d, a, x, y, size); return; }
        Placeholder(d, t, x, y, size, RowGlyph(row.Kind));
    }

    private static string Header(BrowserModel m) => m.Level == BrowserLevel.Playlists ? "Spotify playlists" : m.Playlist?.Name ?? "Playlist";

    /// <summary>
    /// Galleon focus list (research §6.4 A): header + position, the previous row, the focused row (cover 40 units,
    /// name, meta) and the next row. The focus bar sits left of the cover, outside the art.
    /// </summary>
    public static SvgDocument BrowserGalleon(RefractionPalette t, BrowserModel m, ArtLookup art, bool active, FrameNotice? flash = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        var accent = t.Accent;
        d.Text(Fit(Header(m), 128, 10, textCase: TextCase.Upper, tracking: 0.06), 10, 14, 10, accent, tracking: 0.06, textCase: TextCase.Upper);
        d.Text(m.PositionLabel, 190, 14, 10, t.Muted, TextAlign.End);

        if (m.IsLoadingFirstPage)
        {
            var skel = t.IsDark ? Color.FromHex("#1a1e29") : t.LineSoft;
            d.Rect(10, 21, 120, 8, skel, rx: 3);
            d.Rect(10, 37, 40, 40, skel, rx: 4);
            d.Rect(58, 44, 110, 10, skel, rx: 3);
            d.Rect(58, 62, 70, 8, skel, rx: 3);
            d.Rect(10, 85, 100, 8, skel, rx: 3);
            return d;
        }
        if (m.Error is { } err && m.Total is null)
        {
            Placeholder(d, t, 10, 37, 40);
            var (a, b) = Wrap2(err, 130, 12);
            d.Text(a, 58, 52, 12, t.Warn);
            if (b is not null) d.Text(b, 58, 67, 12, t.Warn);
            return d;
        }

        // previous and next rows: 14-unit tiles, text at 0.6
        void SmallRow(int index, double y)
        {
            if (index < 0 || index >= m.RowCount) return;
            var row = m.RowAt(index);
            RowTile(d, t, row, art, focus: false, 10, y, 14);
            d.Text(Fit(row.Title, 156, 10), 30, y + 11, 10, row.Enabled ? t.KeyInk : t.Faint, opacity: 0.6);
        }
        SmallRow(m.Highlight - 1, 18);
        var cur = m.Current;
        d.Rect(2, 36, 3, 42, accent, rx: 1.5);
        RowTile(d, t, cur, art, focus: true, 10, 37, 40);
        var nameSize = StrokeFont.FitSize(cur.Title, 132, 14, 12);
        d.Text(Fit(cur.Title, 132, nameSize), 58, 53, nameSize, cur.Enabled ? t.KeyInk : t.Faint);
        if (flash is not null) d.Text(Fit(SpotifyText.DialHint(flash.Text), 132, 10), 58, 69, 10, flash.IsError ? t.Warn : t.Pos);
        else if (cur.Meta is { Length: > 0 } meta) d.Text(Fit(meta, 132, 10), 58, 69, 10, t.Muted);
        if (m.Level == BrowserLevel.Tracks && m.NotOwned && m.Highlight >= m.RowCount - 1)
            d.Text(Fit(SpotifyText.NotOwnedShort, 180, 10), 10, 93, 10, t.Dim);
        else SmallRow(m.Highlight + 1, 82);
        Scrollbar(d, t, m, 195, 18, 78);
        return d;
    }

    /// <summary>
    /// Stream Deck + single segment (research §6.3 A): header + position, a 70-unit cover, the name over two lines,
    /// the meta line and a "next" hint; scrollbar on the right.
    /// </summary>
    public static SvgDocument BrowserPlus(RefractionPalette t, BrowserModel m, ArtLookup art, bool active, FrameNotice? flash = null)
    {
        var hue = Hue(t);
        var d = DialArt.Base(t, hue, active);
        var accent = t.Accent;
        d.Text(Fit(Header(m), 120, 10, textCase: TextCase.Upper, tracking: 0.06), 8, 14, 10, accent, tracking: 0.06, textCase: TextCase.Upper);
        d.Text(m.PositionLabel, 188, 14, 10, t.Muted, TextAlign.End);
        const double cx = 8, cy = 22, cs = 70, tx = 86, tw = 102;

        if (m.IsLoadingFirstPage)
        {
            var skel = t.IsDark ? Color.FromHex("#1a1e29") : t.LineSoft;
            d.Rect(cx, cy, cs, cs, skel, rx: 4);
            d.Rect(tx, 30, 96, 12, skel, rx: 3);
            d.Rect(tx, 50, 70, 9, skel, rx: 3);
            d.Rect(tx, 82, 80, 8, skel, rx: 3);
            return d;
        }
        if (m.Error is { } err && m.Total is null)
        {
            Placeholder(d, t, cx, cy, cs);
            var (a, b) = Wrap2(err, tw, 13);
            d.Text(a, tx, 44, 13, t.Warn);
            if (b is not null) d.Text(b, tx, 61, 13, t.Warn);
            return d;
        }

        var cur = m.Current;
        RowTile(d, t, cur, art, focus: true, cx, cy, cs);
        // One line if it fits at 12.5 or more; otherwise two lines at 15.
        var single = StrokeFont.FitSize(cur.Title, tw, 15, 12.5);
        var (l1, l2) = StrokeFont.Measure(cur.Title, single) <= tw ? (cur.Title, (string?)null) : Wrap2(cur.Title, tw, 15);
        var nameSize = l2 is null ? single : 15;
        var ink = cur.Enabled ? t.KeyInk : t.Faint;
        d.Text(l1, tx, 39, nameSize, ink);
        if (l2 is not null) d.Text(l2, tx, 56, nameSize, ink);
        var metaY = l2 is null ? 57 : 72;
        if (flash is not null) NoticeText(d, flash.Text, tx, metaY, tw, flash.IsError ? t.Warn : t.Pos);
        else if (cur.Meta is { Length: > 0 } meta) d.Text(Fit(meta, tw, 11), tx, metaY, 11, t.Muted);
        if (m.Level == BrowserLevel.Tracks && m.NotOwned && m.Highlight >= m.RowCount - 1)
        {
            var size = StrokeFont.FitSize(SpotifyText.NotOwnedShort, tw, 10, 8.5);
            d.Text(Fit(SpotifyText.NotOwnedShort, tw, size), tx, 91, size, t.Dim);
        }
        else if (m.Highlight + 1 < m.RowCount)
        {
            var next = m.RowAt(m.Highlight + 1);
            d.Text(Fit("Next → " + next.Title, tw, 10), tx, 91, 10, t.Dim);
        }
        Scrollbar(d, t, m, 194, 22, 70);
        return d;
    }

    private static void Scrollbar(SvgDocument d, RefractionPalette t, BrowserModel m, double x, double y, double h)
    {
        if (m.RowCount <= 1) return;
        d.Rect(x, y, 2, h, t.Line, rx: 1);
        var thumb = Math.Max(8, h / Math.Max(1, m.RowCount) * 3);
        var ty = y + (h - thumb) * m.ScrollFraction;
        d.Rect(x - 0.5, ty, 3, thumb, t.Accent, rx: 1.5);
    }
}
