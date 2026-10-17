using System.Net;
using System.Text.Json;
using PrismControl.Core.Data;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class ServiceTests
{
    private static int PlayerReads(Rig rig) => rig.Http.Count(HttpMethod.Get, "/v1/me/player");

    [Test]
    public async Task Polls_only_while_a_spotify_action_is_visible()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.SettleAsync(60);
        Assert.Equal(0, PlayerReads(rig), "nothing visible: no polling");
        var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await Fx.WaitUntil(() => PlayerReads(rig) == 1, "first read when a view appears");
        view.Dispose();
        rig.Time.Advance(TimeSpan.FromSeconds(30));
        await rig.SettleAsync(60);
        Assert.Equal(1, PlayerReads(rig), "no polling after the last view went away");
    }

    [Test]
    public async Task Remote_playback_polls_every_2_s_and_paused_every_5_s()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        using var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await Fx.WaitUntil(() => PlayerReads(rig) == 1, "first read");
        rig.Time.Advance(TimeSpan.FromSeconds(1.9));
        await rig.SettleAsync();
        Assert.Equal(1, PlayerReads(rig));
        rig.Time.Advance(TimeSpan.FromSeconds(0.2));
        await Fx.WaitUntil(() => PlayerReads(rig) == 2, "2 s remote cadence");
        rig.PlayerJson = () => Fx.Player(local: false, playing: false);
        rig.Time.Advance(TimeSpan.FromSeconds(2));
        await Fx.WaitUntil(() => PlayerReads(rig) == 3, "read that sees the pause");
        var paused = rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay!.Value.TotalSeconds;
        Assert.InRange(paused, 4.8, 5.0);   // 5 s after the last read (the manual clock fires timers at their due time)
    }

    [Test]
    public async Task Local_playback_is_event_driven_with_a_30_s_safety_read()
    {
        await using var rig = await Rig.StartAsync();
        rig.Smtc.Set(Fx.SmtcSpotify());
        using var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await Fx.WaitUntil(() => PlayerReads(rig) >= 1, "first read");
        rig.Time.Advance(TimeSpan.FromMilliseconds(350));          // the read the SMTC event asked for
        await Fx.WaitUntil(() => PlayerReads(rig) == 2, "SMTC-triggered read");
        await rig.SettleAsync();
        var reads = PlayerReads(rig);
        var next = rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay;
        Assert.True(next is { } n && n > TimeSpan.FromSeconds(25) && n <= TimeSpan.FromSeconds(30), $"safety read in 30 s, got {next}");
        // A track change on SMTC is the fast signal: one read 300 ms later.
        rig.Smtc.Set(Fx.SmtcSpotify(title: "Example Song 2"), Smtc.SmtcChange.Media);
        await rig.SettleAsync();                                    // let the poll loop re-arm on the wake
        rig.Time.Advance(TimeSpan.FromMilliseconds(250));
        await rig.SettleAsync();
        Assert.Equal(reads, PlayerReads(rig));
        rig.Time.Advance(TimeSpan.FromMilliseconds(60));
        await Fx.WaitUntil(() => PlayerReads(rig) == reads + 1, "debounced SMTC-triggered read");
        // Timeline-only updates (every 4.5 s) do not cause reads.
        rig.Smtc.Set(Fx.SmtcSpotify(title: "Example Song 2") with { Position = TimeSpan.FromSeconds(90) }, Smtc.SmtcChange.Timeline);
        rig.Time.Advance(TimeSpan.FromSeconds(1));
        await rig.SettleAsync();
        Assert.Equal(reads + 1, PlayerReads(rig));
    }

    [Test]
    public async Task Idle_polls_every_10_s_then_30_s_after_2_minutes_and_browser_open_relaxes_to_30_s()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => null, start: false);
        rig.Service.Auth.Load();
        using var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        Assert.Equal(TimeSpan.Zero, rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay, "never polled: read now");
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal(TimeSpan.FromSeconds(10), rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay);
        rig.Time.Advance(TimeSpan.FromMinutes(2.5));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal(TimeSpan.FromSeconds(30), rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay);
        rig.PlayerJson = () => Fx.Player(local: false);
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal(TimeSpan.FromSeconds(2), rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay);
        using (rig.Service.AttachView(SpotifyView.BrowserOpen))
            Assert.Equal(TimeSpan.FromSeconds(30), rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay, "browser open: 30 s safety tier");
    }

    [Test]
    public async Task Commands_are_confirmed_by_reads_at_350_ms_and_1500_ms()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        using var view = rig.Service.AttachView(SpotifyView.Transport);
        await Fx.WaitUntil(() => rig.Service.Current.DeviceId is not null, "first read processed");
        var r = await rig.Service.NextAsync();
        Assert.True(r.Ok, r.Message);
        Assert.Equal($"?device_id={Fx.RemoteDeviceId}", rig.Http.Api.Last(x => x.Path == "/v1/me/player/next").Query);
        rig.Time.Advance(TimeSpan.FromMilliseconds(340));
        await rig.SettleAsync();
        Assert.Equal(1, PlayerReads(rig));
        rig.Time.Advance(TimeSpan.FromMilliseconds(20));
        await Fx.WaitUntil(() => PlayerReads(rig) == 2, "+350 ms confirmation");
        rig.Time.Advance(TimeSpan.FromMilliseconds(1150));
        await Fx.WaitUntil(() => PlayerReads(rig) == 3, "+1500 ms confirmation");
    }

    [Test]
    public async Task Transport_goes_through_smtc_when_spotify_plays_on_this_pc()
    {
        await using var rig = await Rig.StartAsync();
        rig.Smtc.Set(Fx.SmtcSpotify());
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.True((await rig.Service.TogglePlayPauseAsync()).Ok);
        Assert.True((await rig.Service.NextAsync()).Ok);
        Assert.True((await rig.Service.PreviousAsync()).Ok);
        Assert.Equal("toggle,next,previous", string.Join(',', rig.Smtc.Commands));
        Assert.False(rig.Http.Api.Any(x => x.Method != HttpMethod.Get), "no Web API commands for local playback");
        Assert.Equal(PlayState.Paused, rig.Service.Current.State, "optimistic pause until SMTC reports");
    }

    [Test]
    public async Task Transport_uses_the_web_api_with_the_device_for_remote_playback()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal("Living Room", rig.Service.Current.DeviceName);
        Assert.True((await rig.Service.TogglePlayPauseAsync()).Ok);
        var pause = rig.Http.Api.Last();
        Assert.Equal(HttpMethod.Put, pause.Method);
        Assert.Equal("/v1/me/player/pause", pause.Path);
        Assert.Equal($"?device_id={Fx.RemoteDeviceId}", pause.Query);
        Assert.Empty(rig.Smtc.Commands);
    }

    [Test]
    public async Task Any_app_mode_controls_the_session_on_screen_when_spotify_is_idle()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => null);
        rig.Service.FollowAnyApp = true;
        rig.Smtc.Set(Fx.SmtcSpotify(title: "Example Podcast") with { AppId = "chrome.exe", IsSpotify = false, AppName = "Chrome" });
        await rig.Service.PollOnceAsync(RequestPriority.Poll);   // Spotify: nothing active
        Assert.Equal("Chrome", rig.Service.Current.AppName);
        Assert.True((await rig.Service.TogglePlayPauseAsync()).Ok);
        Assert.Equal("toggle", Assert.Single(rig.Smtc.Commands));
        Assert.False(rig.Http.Api.Any(r => r.Method != HttpMethod.Get), "the shown app is controlled, not Spotify");
    }

    [Test]
    public async Task Playing_with_no_active_device_targets_this_pc()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => null);
        await rig.Service.PollOnceAsync(RequestPriority.Poll);   // 204: nothing active
        var lib = rig.Service.Library;
        var p0 = (await lib.GetPlaylistsPageAsync(0, CancellationToken.None)).Items[0];
        var t12 = (await lib.GetTracksPageAsync(p0, 0, CancellationToken.None)).Items[12];
        var r = await rig.Service.PlayPlaylistAsync(p0, t12, shuffle: false);
        Assert.True(r.Ok, r.Message);
        var reqs = rig.Http.Api.ToList();
        Assert.Equal("/v1/me/player/devices", reqs[^2].Path);
        var play = reqs[^1];
        Assert.Equal("/v1/me/player/play", play.Path);
        Assert.Equal($"?device_id={Fx.LocalDeviceId}", play.Query);
        var body = JsonDocument.Parse(play.Body!).RootElement;
        Assert.Equal(Fx.PlaylistUri(0), body.GetProperty("context_uri").GetString());
        Assert.Equal(12, body.GetProperty("offset").GetProperty("position").GetInt32());
        Assert.Equal(0, body.GetProperty("position_ms").GetInt32());
    }

    [Test]
    public async Task A_404_no_active_device_retries_on_this_pcs_device()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, playing: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        var first = true;
        rig.Http.On(HttpMethod.Put, "api.spotify.com/v1/me/player/play", r =>
        {
            if (first && !r.Query.Contains("device_id", StringComparison.Ordinal)) { first = false; return FakeHttp.Error(HttpStatusCode.NotFound, "Player command failed: No active device found", "NO_ACTIVE_DEVICE"); }
            return FakeHttp.Status(HttpStatusCode.NoContent);
        });
        var r = await rig.Service.TogglePlayPauseAsync();
        Assert.True(r.Ok, r.Message);
        var transfer = rig.Http.Api.Last();
        Assert.Equal("/v1/me/player", transfer.Path, "plain resume transfers to the local device with play:true");
        var body = JsonDocument.Parse(transfer.Body!).RootElement;
        Assert.Equal(Fx.LocalDeviceId, body.GetProperty("device_ids")[0].GetString());
        Assert.True(body.GetProperty("play").GetBoolean());
    }

    [Test]
    public async Task No_device_anywhere_says_open_spotify()
    {
        await using var rig = await Rig.StartAsync(configure: r => { r.PlayerJson = () => null; r.LocalDeviceListed = false; });
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        var r = await rig.Service.TogglePlayPauseAsync();
        Assert.False(r.Ok);
        Assert.Equal(SpotifyText.OpenSpotify, r.Message);
        Assert.Contains("Open Spotify on this PC", rig.Service.Status.Notice);
    }

    [Test]
    public async Task Volume_is_optimistic_and_coalesced_latest_wins()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal(62, rig.Service.Current.VolumePct);
        for (var i = 0; i < 10; i++) Assert.True(rig.Service.AdjustVolume(+2).Ok);
        Assert.Equal(82, rig.Service.Current.VolumePct, "the display follows the dial immediately");
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume") == 1, "first send");
        await rig.SettleAsync();
        Assert.Equal(1, rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume"), "at most one send per 200 ms");
        rig.Time.Advance(TimeSpan.FromMilliseconds(200));
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume") == 2, "latest value after 200 ms");
        Assert.Contains("volume_percent=82", rig.Http.Api.Last(x => x.Path == "/v1/me/player/volume").Query);
        rig.Time.Advance(TimeSpan.FromMilliseconds(400));
        await rig.SettleAsync(60);
        Assert.Equal(2, rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume"));
    }

    [Test]
    public async Task Mute_remembers_the_level_and_restores_it()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, volume: 40));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.True(rig.Service.ToggleMute().Ok);
        Assert.Equal(0, rig.Service.Current.VolumePct);
        await Fx.WaitUntil(() => rig.Http.Api.Any(x => x.Query.Contains("volume_percent=0", StringComparison.Ordinal)), "mute send");
        rig.Time.Advance(TimeSpan.FromMilliseconds(250));
        await rig.SettleAsync();
        Assert.True(rig.Service.ToggleMute().Ok);
        Assert.Equal(40, rig.Service.Current.VolumePct);
        rig.Time.Advance(TimeSpan.FromMilliseconds(250));
        await Fx.WaitUntil(() => rig.Http.Api.Any(x => x.Query.Contains("volume_percent=40", StringComparison.Ordinal)), "restore send");
    }

    [Test]
    public async Task Like_is_optimistic_and_reverts_when_spotify_refuses()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await Fx.WaitUntil(() => rig.Service.Current.Liked == false, "liked state checked once for the new track");
        Assert.True((await rig.Service.ToggleLikeAsync()).Ok);
        Assert.Equal(true, rig.Service.Current.Liked);
        rig.Http.On(HttpMethod.Delete, "api.spotify.com/v1/me/library", _ => FakeHttp.Error(HttpStatusCode.BadGateway, "Bad gateway"));
        var r = await rig.Service.ToggleLikeAsync();
        Assert.False(r.Ok);
        Assert.Equal(true, rig.Service.Current.Liked, "reverted to the last known state");
        Assert.Equal(1, rig.Http.Count(HttpMethod.Get, "/v1/me/library/contains"), "never polled");
        rig.Time.Advance(TimeSpan.FromSeconds(3));
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Get, "/v1/me/library/contains") == 2, "re-check 3 s after the failure");
    }

    [Test]
    public async Task Data_api_gets_web_api_art_bytes_exactly_as_returned()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        var registry = new DataRegistry(rig.Time);
        rig.Service.AttachPublishers(registry.NowPlaying.Claim("spotify", TimeSpan.Zero), registry.NowPlayingArt.Claim("spotify"));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await Fx.WaitUntil(() => registry.NowPlayingArt.HasData && registry.NowPlaying.Current?.Liked is not null, "art + liked");
        var art = Assert.NotNull(await registry.NowPlayingArt.ReadAsync(CancellationToken.None));
        Assert.True(art.Body.AsSpan().SequenceEqual(FictionalArt.Jpeg300), "art bytes must be Spotify's bytes, unmodified");
        Assert.Equal("image/jpeg", art.ContentType);
        var cdn = rig.Http.Seen.Where(x => x.Host == "i.scdn.co").ToList();
        Assert.Equal("/image/examples-vol1-300", Assert.Single(cdn).Path);
        Assert.Null(cdn[0].Authorization, "no token to the image CDN");
        var np = Assert.NotNull(registry.NowPlaying.Current);
        Assert.Equal("spotify", np.Source);
        Assert.Equal("playing", np.State);
        Assert.Equal("Night Drive", np.Track!.Title);
        Assert.Equal("The Example Ensemble", Assert.Single(np.Track.Artists));
        Assert.Equal(Fx.TrackUri, np.Track.Uri);
        Assert.Equal("https://open.spotify.com/track/4exampletrack00000001b", np.Track.Url);
        Assert.Equal(false, np.Liked);
        Assert.Equal(62.0, np.VolumePct);
        Assert.Equal("off", np.Repeat);
        Assert.Equal(300, np.Art!.Width);
    }

    [Test]
    public async Task Signed_out_now_playing_comes_from_smtc_with_its_png_as_is()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        var registry = new DataRegistry(rig.Time);
        rig.Service.AttachPublishers(registry.NowPlaying.Claim("spotify", TimeSpan.Zero), registry.NowPlayingArt.Claim("spotify"));
        rig.Smtc.Set(Fx.SmtcSpotify());
        await Fx.WaitUntil(() => registry.NowPlayingArt.HasData, "smtc art");
        var art = Assert.NotNull(await registry.NowPlayingArt.ReadAsync(CancellationToken.None));
        Assert.True(art.Body.AsSpan().SequenceEqual(FictionalArt.Png300));
        Assert.Equal("image/png", art.ContentType);
        var np = Assert.NotNull(registry.NowPlaying.Current);
        Assert.Equal("smtc", np.Source);
        Assert.Null(np.Track!.Uri);
        Assert.Null(np.Liked);
        Assert.Empty(rig.Http.Seen);
        var snap = rig.Service.Current;
        Assert.Equal(SnapshotSource.Smtc, snap.Source);
        Assert.True(snap.Art!.Display.Length < snap.Art.Original.Length, "display copy is downscaled for frames");
        Assert.False(snap.CanLike);
    }

    [Test]
    public async Task Smtc_and_web_api_merge_when_the_titles_match()
    {
        await using var rig = await Rig.StartAsync();
        rig.Smtc.Set(Fx.SmtcSpotify());
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        var s = rig.Service.Current;
        Assert.Equal(SnapshotSource.WebApi, s.Source, "enriched by the Web API");
        Assert.Equal(Fx.TrackUri, s.Uri);
        Assert.True(s.DeviceIsLocal);
        Assert.True(s.CanLike);
        // SMTC moves to the next track before the API caught up: the heart is disabled until the read lands.
        rig.Smtc.Set(Fx.SmtcSpotify(title: "Example Song 2"), Smtc.SmtcChange.Media);
        s = rig.Service.Current;
        Assert.Equal("Example Song 2", s.Title);
        Assert.Null(s.Uri);
        Assert.False(s.CanLike);
    }

    [Test]
    public async Task Disconnect_deletes_the_sign_in_and_every_cache()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await Fx.WaitUntil(() => rig.Service.Current.Art is not null, "art cached");
        await rig.Service.Library.GetPlaylistsPageAsync(0, CancellationToken.None);
        rig.Service.Disconnect();
        Assert.Null(rig.Vault.Load(SpotifyAuth.TokensSecret));
        Assert.Equal(0, rig.Service.Images.Count);
        Assert.Null(rig.Service.Library.CachedPlaylists(0));
        Assert.Equal(AuthState.SignedOut, rig.Service.Status.Auth);
        Assert.False(rig.Service.Current.HasItem);
        Assert.Contains("spotify.com", rig.Service.Status.AuthMessage);
    }

    [Test]
    public async Task Logs_never_contain_tokens_queries_or_the_full_client_id()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        using var view = rig.Service.AttachView(SpotifyView.Like);
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await rig.Service.ToggleLikeAsync();
        await rig.Service.Library.GetPlaylistsPageAsync(0, CancellationToken.None);
        rig.Service.Auth.MarkNeedsReconnect("test");
        var log = rig.Log.All;
        Assert.DoesNotContain("BQD-fake", log);
        Assert.DoesNotContain("AQC-fake", log);
        Assert.DoesNotContain(Fx.ClientId, log);
        Assert.DoesNotContain("spotify:track", log);
        Assert.DoesNotContain("uris=", log);
        Assert.DoesNotContain("Bearer", log);
    }

    [Test]
    public void Repeat_cycles_off_context_track()
    {
        Assert.Equal(RepeatMode.Context, SpotifyService.NextRepeat(RepeatMode.Off));
        Assert.Equal(RepeatMode.Track, SpotifyService.NextRepeat(RepeatMode.Context));
        Assert.Equal(RepeatMode.Off, SpotifyService.NextRepeat(RepeatMode.Track));
        Assert.Equal(RepeatMode.Context, SpotifyService.NextRepeat(null));
    }

    [Test]
    public async Task Image_picks_follow_the_research_table()
    {
        var images = JsonSerializer.Deserialize(Fx.AlbumImages("k").ToJsonString(), SpotifyJsonContext.Default.ListImageDto)!;
        Assert.Contains("-300", Images.ImageCache.Pick(images, 144)!.Url, "keys use the 300 px image");
        Assert.Contains("-064", Images.ImageCache.Pick(images, 30)!.Url, "lists use the 64 px image");
        Assert.Contains("-640", Images.ImageCache.Pick(images, 400)!.Url);
        await Task.CompletedTask;
    }
}
