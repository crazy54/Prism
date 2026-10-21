using System.Text;
using System.Text.Json;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Images;
using PrismControl.Spotify.Render;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.Spotify.Tests -- --render-previews &lt;dir&gt;</c> writes every Spotify key and
/// dial frame (Night and Day) as SVG plus index-night.html / index-day.html showing keys at 72/96/120/144 px and dials at
/// 200×100 (Stream Deck + strip) and 360×180 (Galleon widget). All art is generated and fictional.
/// </summary>
public static class Previews
{
    public static async Task<int> WriteAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        var cover = await Art(FictionalArt.Jpeg300, 144);
        var coverFocus = await Art(FictionalArt.Jpeg300, 128);
        var mosaicFocus = await Art(FictionalArt.Jpeg300Alt, 128);
        var mosaicThumb = await Art(FictionalArt.Jpeg64Alt, 64);
        var trackThumb = await Art(FictionalArt.Jpeg64, 64);
        var wide = await Art(FictionalArt.WidePng, 144);
        var at = new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

        var playing = new PlayerSnapshot
        {
            Source = SnapshotSource.WebApi, AppName = "Spotify", State = PlayState.Playing, Title = "Night Drive",
            Artists = ["The Example Ensemble"], Album = "Examples Vol. 1", Uri = Fx.TrackUri, DurationMs = 221_386, PositionMs = 81_234, PositionAt = at,
            Shuffle = true, Repeat = RepeatMode.Context, Liked = true, VolumePct = 62, SupportsVolume = true, DeviceName = "EXAMPLE-PC", Art = cover,
        };
        var paused = playing with { State = PlayState.Paused, Title = "A Much Longer Example Song Title (Extended Mix)", Art = wide };
        var noArt = playing with { Art = null, Title = "Example Song 2" };
        // Another app's session (a video in a browser): SMTC only, its 16:9-ish artwork whole, no Spotify fields.
        var video = new PlayerSnapshot
        {
            Source = SnapshotSource.Smtc, AppName = "Chrome", IsSpotify = false, SessionKey = "Chrome", State = PlayState.Playing,
            Title = "Example Video: A Walk Through the Demo City", Artists = ["Example Channel"], DurationMs = 754_000, PositionMs = 312_000, PositionAt = at, Art = wide,
        };
        var hidden = video with { Private = true, Title = null, Artists = [], Art = null };

        var pages = JsonSerializer.Deserialize(Fx.PlaylistsPage(0, 48), SpotifyJsonContext.Default.PagingDtoPlaylistDto)!;
        var playlists = new PageResult<PlaylistEntry>(0, 48, pages.Items!.Select(PlaylistLibrary.ToEntry).ToList());
        var items = JsonSerializer.Deserialize(Fx.ItemsPage(0, 0), SpotifyJsonContext.Default.PagingDtoPlaylistItemRowDto)!;
        var tracks = new PageResult<TrackEntry>(0, 48, items.Items!.Select((r, i) => PlaylistLibrary.ToTrack(i, r)).ToList());

        SpotifyArt.ArtLookup lookup = (images, focus) =>
        {
            if (images is null || images.Count == 0) return null;
            var mosaic = images[0].Url?.Contains("mosaic", StringComparison.Ordinal) == true || images[0].Url?.Contains("spotifycdn", StringComparison.Ordinal) == true;
            return focus ? (mosaic ? mosaicFocus : coverFocus) : (mosaic ? mosaicThumb : trackThumb);
        };

        BrowserModel Level0(int highlight)
        {
            var m = new BrowserModel();
            m.AddPlaylists(playlists);
            m.Move(highlight - m.Highlight);
            return m;
        }
        BrowserModel Level1(int highlight)
        {
            var m = Level0(1);
            m.OpenPlaylist(playlists.Items[0], canList: true);
            m.AddTracks(playlists.Items[0], tracks);
            m.Move(highlight - m.Highlight);
            return m;
        }
        BrowserModel NotOwned()
        {
            var m = Level0(4);
            m.OpenPlaylist(playlists.Items[3], canList: false);
            m.Move(1);
            return m;
        }

        var keys = new List<(string Name, SvgDocument Svg)>();
        var dials = new List<(string Name, SvgDocument Svg)>();
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            var n = t.Name;
            keys.Add(($"{n}-now-playing", SpotifyArt.NowPlayingKey(t, playing, at)));
            keys.Add(($"{n}-now-playing-paused-wide-art", SpotifyArt.NowPlayingKey(t, paused, at)));
            keys.Add(($"{n}-now-playing-no-art", SpotifyArt.NowPlayingKey(t, noArt, at)));
            keys.Add(($"{n}-now-playing-idle", SpotifyArt.NowPlayingKey(t, PlayerSnapshot.Empty, at)));
            keys.Add(($"{n}-now-playing-hint", SpotifyArt.NowPlayingKey(t, playing, at, "OPEN SPOTIFY")));
            keys.Add(($"{n}-pause", SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, true, true)));
            keys.Add(($"{n}-play", SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, false, true)));
            keys.Add(($"{n}-next", SpotifyArt.TransportKey(t, TransportGlyph.Next, true, true)));
            keys.Add(($"{n}-previous-disabled", SpotifyArt.TransportKey(t, TransportGlyph.Previous, false, false)));
            keys.Add(($"{n}-like-on", SpotifyArt.LikeKey(t, true, true)));
            keys.Add(($"{n}-like-off", SpotifyArt.LikeKey(t, false, true)));
            keys.Add(($"{n}-like-sign-in", SpotifyArt.LikeKey(t, null, false, "SIGN IN")));
            keys.Add(($"{n}-shuffle-on", SpotifyArt.ShuffleKey(t, true, true)));
            keys.Add(($"{n}-shuffle-off", SpotifyArt.ShuffleKey(t, false, true)));
            keys.Add(($"{n}-repeat-context", SpotifyArt.RepeatKey(t, RepeatMode.Context, true)));
            keys.Add(($"{n}-repeat-track", SpotifyArt.RepeatKey(t, RepeatMode.Track, true)));
            keys.Add(($"{n}-volume", SpotifyArt.VolumeKey(t, 62, true)));
            keys.Add(($"{n}-volume-muted", SpotifyArt.VolumeKey(t, 0, true)));
            keys.Add(($"{n}-other-now-playing", SpotifyArt.NowPlayingKey(t, video, at)));
            keys.Add(($"{n}-other-now-playing-hidden", SpotifyArt.NowPlayingKey(t, hidden, at)));
            keys.Add(($"{n}-other-pause", SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, true, true, "CHROME")));
            keys.Add(($"{n}-other-next", SpotifyArt.TransportKey(t, TransportGlyph.Next, true, true, "CHROME")));
            keys.Add(($"{n}-other-previous-disabled", SpotifyArt.TransportKey(t, TransportGlyph.Previous, true, false, "CHROME")));
            keys.Add(($"{n}-spotify-like-while-other", SpotifyArt.LikeKey(t, true, true, "SPOTIFY")));
            keys.Add(($"{n}-spotify-shuffle-while-other", SpotifyArt.ShuffleKey(t, false, true, "SPOTIFY")));
            keys.Add(($"{n}-spotify-volume-while-other", SpotifyArt.VolumeKey(t, 62, true, caption: "SPOTIFY")));

            dials.Add(($"{n}-now-playing", SpotifyArt.NowPlayingDial(t, playing, at, active: false)));
            dials.Add(($"{n}-now-playing-paused-active", SpotifyArt.NowPlayingDial(t, paused, at, active: true)));
            dials.Add(($"{n}-now-playing-notice", SpotifyArt.NowPlayingDial(t, noArt, at, false, new FrameNotice(SpotifyText.OpenSpotify, true))));
            dials.Add(($"{n}-other-now-playing", SpotifyArt.NowPlayingDial(t, video, at, active: false)));
            dials.Add(($"{n}-other-now-playing-hidden", SpotifyArt.NowPlayingDial(t, hidden, at, active: false)));
            dials.Add(($"{n}-other-seek-notice", SpotifyArt.NowPlayingDial(t, video, at, true, new FrameNotice(SpotifyText.SeekSpotifyOnly, false))));
            dials.Add(($"{n}-volume-active", SpotifyArt.VolumeDial(t, 62, "EXAMPLE-PC", true)));
            dials.Add(($"{n}-volume-sign-in", SpotifyArt.VolumeDial(t, null, null, false, new FrameNotice("Connect in settings", false))));
            dials.Add(($"{n}-galleon-playlists", SpotifyArt.BrowserGalleon(t, Level0(12), lookup, active: true)));
            dials.Add(($"{n}-galleon-tracks", SpotifyArt.BrowserGalleon(t, Level1(5), lookup, active: true)));
            dials.Add(($"{n}-galleon-tracks-playing", SpotifyArt.BrowserGalleon(t, Level1(6), lookup, true, new FrameNotice("Playing", false))));
            dials.Add(($"{n}-galleon-back-row", SpotifyArt.BrowserGalleon(t, Level1(0), lookup, active: true)));
            dials.Add(($"{n}-galleon-not-owned", SpotifyArt.BrowserGalleon(t, NotOwned(), lookup, active: true)));
            dials.Add(($"{n}-galleon-loading", SpotifyArt.BrowserGalleon(t, new BrowserModel(), lookup, active: true)));
            dials.Add(($"{n}-plus-playlists", SpotifyArt.BrowserPlus(t, Level0(12), lookup, active: true)));
            dials.Add(($"{n}-plus-tracks", SpotifyArt.BrowserPlus(t, Level1(5), lookup, active: true)));
            dials.Add(($"{n}-plus-not-owned", SpotifyArt.BrowserPlus(t, NotOwned(), lookup, active: true)));
            dials.Add(($"{n}-plus-error", SpotifyArt.BrowserPlus(t, Level1(7), lookup, true, new FrameNotice("Couldn't play that", true))));
            dials.Add(($"{n}-connect", SpotifyArt.MessageDial(t, "Spotify", "Connect Spotify", "in the plugin settings", false)));
        }

        foreach (var (name, svg) in keys) Save(dir, "key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Save(dir, "dial-" + name, svg, SvgCanvas.Dial);
        foreach (var theme in new[] { "night", "day" })
        {
            var bg = theme == "night" ? "#000" : "#dcdbe6";
            var ink = theme == "night" ? "#a2a4b4" : "#55556a";
            string Head(string title) =>
                $"<!doctype html><html><head><meta charset=\"utf-8\"><style>body{{margin:16px;background:{bg};color:{ink};font:11px Segoe UI,sans-serif}}" +
                "h2{font-size:13px;margin:4px 0 10px}.grid{display:flex;flex-wrap:wrap;gap:14px 28px}.item{display:flex;gap:10px;align-items:flex-end}" +
                $"figure{{margin:0;text-align:center}}figcaption{{margin-top:2px}}img{{display:block}}</style></head><body><h2>{title}</h2><div class=\"grid\">";
            var keysHtml = new StringBuilder(Head($"Spotify keys ({theme}) at 72 / 96 / 120 / 144 px"));
            foreach (var (name, _) in keys.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
            {
                keysHtml.Append("<div class=\"item\">");
                foreach (var px in new[] { 72, 96, 120, 144 })
                    keysHtml.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{(px == 144 ? name[(theme.Length + 1)..] : px.ToString(System.Globalization.CultureInfo.InvariantCulture))}</figcaption></figure>");
                keysHtml.Append("</div>");
            }
            File.WriteAllText(Path.Combine(dir, $"keys-{theme}.html"), keysHtml.Append("</div></body></html>").ToString());
            var dialsHtml = new StringBuilder(Head($"Spotify dials ({theme}) at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget)"));
            foreach (var (name, _) in dials.Where(k => k.Name.StartsWith(theme + "-", StringComparison.Ordinal)))
                dialsHtml.Append($"<div class=\"item\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name[(theme.Length + 1)..]}</figcaption></figure>")
                    .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"><figcaption>360×180</figcaption></figure></div>");
            File.WriteAllText(Path.Combine(dir, $"dials-{theme}.html"), dialsHtml.Append("</div></body></html>").ToString());
        }
        Console.WriteLine($"wrote {keys.Count} keys, {dials.Count} dials and keys-/dials-night|day.html to {Path.GetFullPath(dir)}");
        return 0;
    }

    private static async Task<ArtImage> Art(byte[] bytes, int px)
    {
        var display = await ArtScaler.ToJpegAsync(bytes, px) ?? bytes;
        var info = ImageInfo.Probe(bytes)!;
        return new ArtImage { Original = bytes, Mime = info.Mime, Hash = Smtc.SmtcSource.Hash(bytes), Width = info.Width, Height = info.Height, Display = display };
    }

    private static void Save(string dir, string name, SvgDocument svg, SvgCanvas canvas)
    {
        var markup = svg.ToSvg();
        var errors = SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        File.WriteAllText(Path.Combine(dir, name + ".svg"), markup);
    }
}
