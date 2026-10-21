using PrismControl.Core.Data;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>Core's INowPlayingControl lets other modules' dials (Kaleidoscope) drive Spotify through the same service rules.</summary>
public class NowPlayingControlTests
{
    [Test]
    public async Task Another_modules_dial_drives_spotify_volume_through_the_same_coalescing()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        INowPlayingControl control = new SpotifyNowPlayingControl(rig.Service);
        Assert.Equal("spotify", control.Source);

        for (var i = 0; i < 5; i++) Assert.True(control.AdjustVolume(+2).Ok);
        Assert.Equal(72, rig.Service.Current.VolumePct, "optimistic, like Spotify's own dial");
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume") == 1, "one coalesced send");
        rig.Time.Advance(TimeSpan.FromMilliseconds(200));
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume") == 2, "latest value");
        Assert.Contains("volume_percent=72", rig.Http.Api.Last(x => x.Path == "/v1/me/player/volume").Query);
    }

    [Test]
    public async Task Failures_come_back_as_short_messages()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        INowPlayingControl control = new SpotifyNowPlayingControl(rig.Service);
        var volume = control.SetVolume(40);
        Assert.False(volume.Ok);
        Assert.True(!string.IsNullOrWhiteSpace(volume.Message), "says why (connect Spotify)");
        var seek = control.SeekBy(TimeSpan.FromSeconds(5));
        Assert.False(seek.Ok, "nothing to seek");
    }
}
