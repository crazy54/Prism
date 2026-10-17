using System.Diagnostics;
using PrismControl.Core.Render;
using PrismControl.Spotify.Images;
using PrismControl.Spotify.Smtc;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class ArtAndProbeTests
{
    [Test]
    public async Task Scaler_resizes_keeping_the_aspect_ratio()
    {
        var square = Assert.NotNull(await ArtScaler.ToJpegAsync(FictionalArt.Png300, 144));
        var info = Assert.NotNull(ImageInfo.Probe(square));
        Assert.Equal("image/jpeg", info.Mime);
        Assert.Equal(144, info.Width);
        Assert.Equal(144, info.Height);
        Assert.True(square.Length < FictionalArt.Png300.Length / 4, $"{square.Length} bytes");

        var wide = Assert.NotNull(ImageInfo.Probe(Assert.NotNull(await ArtScaler.ToJpegAsync(FictionalArt.WidePng, 144))));
        Assert.Equal(144, wide.Width);
        Assert.Equal(86, wide.Height, "400×240 scales to 144×86: resized, not cropped");
        Assert.Null(await ArtScaler.ToJpegAsync([1, 2, 3, 4], 144));
    }

    [Test]
    public async Task Image_cache_downloads_without_a_token_once_and_clears()
    {
        await using var rig = await Rig.StartAsync();
        var a = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => rig.Service.Images.GetAsync("https://i.scdn.co/image/examples-vol1-300", 144)));
        Assert.True(a.All(x => x is not null && ReferenceEquals(x, a[0])), "in-flight requests are shared");
        var art = a[0]!;
        Assert.True(art.Original.AsSpan().SequenceEqual(FictionalArt.Jpeg300), "the original bytes are kept as downloaded");
        Assert.Equal(144, ImageInfo.Probe(art.Display)!.Width);
        Assert.Equal(1, rig.Http.Seen.Count(r => r.Host == "i.scdn.co"));
        Assert.Null(rig.Http.Seen.Single(r => r.Host == "i.scdn.co").Authorization);
        Assert.NotNull(rig.Service.Images.TryGet("https://i.scdn.co/image/examples-vol1-300", 144));
        Assert.Null(await rig.Service.Images.GetAsync("http://i.scdn.co/image/insecure", 144), "https only");
        rig.Service.Images.Clear();
        Assert.Null(rig.Service.Images.TryGet("https://i.scdn.co/image/examples-vol1-300", 144));
    }

    [Test]
    public void App_names_from_media_session_ids()
    {
        Assert.Equal("Spotify", SmtcSource.AppNameFor("Spotify.exe"));
        Assert.Equal("Spotify", SmtcSource.AppNameFor("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"));
        Assert.Equal("ZuneMusic", SmtcSource.AppNameFor("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"));
        Assert.Equal("Chrome", SmtcSource.AppNameFor("chrome.exe"));
    }

    /// <summary>
    /// READ-ONLY probe of the real Windows media session on this PC: reads Spotify's session (if any) and its thumbnail.
    /// Never calls a Try* command. Prints sizes only (no titles: listening history is personal data).
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Probe_reads_the_spotify_media_session_read_only()
    {
        var log = new CaptureLog();
        await using var smtc = new SmtcSource(log);
        var sw = Stopwatch.StartNew();
        await smtc.StartAsync(CancellationToken.None);
        var start = sw.ElapsedMilliseconds;
        await Task.Delay(300);
        var s = smtc.Current ?? throw new SkipException("no Spotify media session on this PC right now");
        Assert.True(s.IsSpotify, s.AppId);
        var info = s.Thumbnail is { } t ? ImageInfo.Probe(t) : null;
        Console.WriteLine($"     session '{s.AppId}', state {s.State}, title {s.Title?.Length ?? 0} chars, duration {s.Duration?.TotalSeconds:0} s, " +
            $"shuffle {s.Shuffle}, repeat {s.Repeat}, controls play/pause/next/prev/seek {s.CanPlay}/{s.CanPause}/{s.CanNext}/{s.CanPrevious}/{s.CanSeek}, " +
            $"thumbnail {s.Thumbnail?.Length ?? 0} bytes {info?.Mime} {info?.Width}x{info?.Height}, started in {start} ms");
        if (s.HasMedia) Assert.NotNull(s.Title);
        if (s.Thumbnail is { } bytes)
        {
            Assert.NotNull(info);
            var scaled = Assert.NotNull(await ArtScaler.ToJpegAsync(bytes, 144));
            var si = ImageInfo.Probe(scaled)!;
            Console.WriteLine($"     key copy: {scaled.Length} bytes {si.Width}x{si.Height} JPEG (in memory only)");
            Assert.True(si.Width <= 144 && si.Height <= 144);
        }
        Assert.DoesNotContain("Try", log.All);
    }
}
