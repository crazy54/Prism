using System.Net;
using System.Text.Json;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class ApiTests
{
    [Test]
    public async Task Gate_allows_a_burst_of_8_then_1_per_second()
    {
        var time = new ManualTimeProvider();
        var gate = new RequestGate(time);
        for (var i = 0; i < 8; i++) Assert.True(await gate.AcquireAsync(RequestPriority.Poll), $"burst #{i + 1}");
        Assert.False(await gate.AcquireAsync(RequestPriority.Poll), "polls are dropped when the bucket is empty");
        var command = gate.AcquireAsync(RequestPriority.Command).AsTask();
        await Task.Delay(20);
        Assert.False(command.IsCompleted, "commands wait for a token");
        time.Advance(TimeSpan.FromSeconds(1));
        await command.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(command.Result);
        Assert.False(await gate.AcquireAsync(RequestPriority.Poll));
    }

    [Test]
    public async Task Gate_caps_requests_at_60_per_rolling_minute()
    {
        var time = new ManualTimeProvider();
        var gate = new RequestGate(time, new GateOptions { Burst = 1000, RatePerSecond = 1000, MaxPerMinute = 60 });
        for (var i = 0; i < 60; i++) Assert.True(await gate.AcquireAsync(RequestPriority.Poll));
        Assert.False(await gate.AcquireAsync(RequestPriority.Poll));
        Assert.Equal(60, gate.RecentCount);
        time.Advance(TimeSpan.FromSeconds(61));
        Assert.True(await gate.AcquireAsync(RequestPriority.Poll));
    }

    [Test]
    public async Task Gate_pause_blocks_everything_until_retry_after()
    {
        var time = new ManualTimeProvider();
        var gate = new RequestGate(time);
        gate.PauseUntil(time.GetUtcNow().AddSeconds(12));
        Assert.False(await gate.AcquireAsync(RequestPriority.Poll));
        // A 12 s pause is far beyond the 2 s wait cap: reads fail at once instead of waiting it out (review A #2).
        var e = await Assert.ThrowsAsync<SpotifyApiException>(() => gate.AcquireAsync(RequestPriority.Read).AsTask().WaitAsync(TimeSpan.FromSeconds(2)));
        Assert.Equal(ApiFailure.RateLimited, e.Kind);
        Assert.Equal(TimeSpan.FromSeconds(12), e.RetryAfter);
        time.Advance(TimeSpan.FromSeconds(11));
        var read = gate.AcquireAsync(RequestPriority.Read).AsTask();   // 1 s left: short enough to wait
        await Task.Delay(20);
        Assert.False(read.IsCompleted);
        time.Advance(TimeSpan.FromSeconds(1.5));
        Assert.True(await read.WaitAsync(TimeSpan.FromSeconds(2)));
    }

    [Test]
    public async Task A_429_pauses_the_gate_for_retry_after_and_shows_busy()
    {
        await using var rig = await Rig.StartAsync(gate: new GateOptions());
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/player", _ =>
        {
            var r = FakeHttp.Error(HttpStatusCode.TooManyRequests, "API rate limit exceeded");
            r.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(12));
            return r;
        });
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        var now = rig.Time.GetUtcNow();
        Assert.Equal(now.AddSeconds(12), rig.Service.Gate.PausedUntil);
        Assert.True(rig.Service.Status.IsBusy(now));
        Assert.Equal("Connected · Spotify is busy, retrying in 12 s", SpotifyText.StatusLine(rig.Service.Status, now));
        var before = rig.Http.Seen.Count;
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        Assert.Equal(before, rig.Http.Seen.Count, "no request may probe while paused");
        Assert.Contains("429", rig.Log.All);
        Assert.DoesNotContain("BQD-fake", rig.Log.All);
    }

    [Test]
    public async Task Quota_exceeded_enters_basic_mode_for_10_minutes_and_stops_polling()
    {
        await using var rig = await Rig.StartAsync();
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/player", _ => FakeHttp.Error(HttpStatusCode.TooManyRequests, "Quota exceeded", "QUOTA_EXCEEDED"));
        rig.Smtc.Set(Fx.SmtcSpotify());
        var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        var now = rig.Time.GetUtcNow();
        Assert.True(rig.Service.Status.IsBasicMode(now));
        Assert.Equal(now.AddMinutes(10), rig.Service.Status.BasicModeUntil);
        var (delay, _) = rig.Service.NextPoll(now);
        Assert.Equal(TimeSpan.FromMinutes(10), delay, "no polls until basic mode ends");
        // SMTC keeps now playing and local transport working.
        Assert.Equal(SnapshotSource.Smtc, rig.Service.Current.Source);
        Assert.Equal("Night Drive", rig.Service.Current.Title);
        Assert.Contains("basic mode", SpotifyText.StatusLine(rig.Service.Status, now));
        // A repeat after basic mode ended doubles it (the view is gone, so only this explicit read runs).
        view.Dispose();
        rig.Time.Advance(TimeSpan.FromMinutes(11));
        rig.Service.Gate.Resume();
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        Assert.Equal(rig.Time.GetUtcNow().AddMinutes(20), rig.Service.Status.BasicModeUntil);
    }

    [Test]
    public void Player_actions_are_read_flat_or_nested_under_disallows()
    {
        var nested = JsonSerializer.Deserialize(Fx.Player(playing: true, nestedDisallows: true), SpotifyJsonContext.Default.PlaybackStateDto)!;
        var flat = JsonSerializer.Deserialize(Fx.Player(playing: true, nestedDisallows: false), SpotifyJsonContext.Default.PlaybackStateDto)!;
        Assert.True(Disallows.Has(nested.Actions, "resuming"));
        Assert.True(Disallows.Has(flat.Actions, "resuming"));
        Assert.False(Disallows.Has(flat.Actions, "skipping_prev"));
        Assert.Equal("EXAMPLE-PC", nested.Device!.Name);
        Assert.Equal(62, nested.Device.VolumePercent);
        Assert.Equal("The Example Ensemble", nested.Item!.Artists![0].Name);
        Assert.Equal(3, nested.Item.Album!.Images!.Count);
    }

    [Test]
    public async Task Get_player_204_means_nothing_is_active()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => null);
        Assert.Null(await rig.Service.Api.GetPlayerAsync(RequestPriority.Read, CancellationToken.None));
        var req = rig.Http.Api.Last();
        Assert.Equal("?additional_types=episode", req.Query);
        Assert.Equal("Bearer BQD-fake-access-token-0", req.Authorization);
    }

    [Test]
    public async Task Like_uses_the_generic_library_endpoints_with_a_uris_query()
    {
        await using var rig = await Rig.StartAsync();
        Assert.Equal(false, await rig.Service.Api.LibraryContainsAsync(Fx.TrackUri, CancellationToken.None));
        await rig.Service.Api.SaveToLibraryAsync(Fx.TrackUri, CancellationToken.None);
        await rig.Service.Api.RemoveFromLibraryAsync(Fx.TrackUri, CancellationToken.None);
        var reqs = rig.Http.Api.ToList();
        Assert.Equal("/v1/me/library/contains", reqs[0].Path);
        Assert.Equal("?uris=spotify%3Atrack%3A4exampletrack00000001b", reqs[0].Query);
        Assert.Equal(HttpMethod.Put, reqs[1].Method);
        Assert.Equal("/v1/me/library", reqs[1].Path);
        Assert.Equal("?uris=spotify%3Atrack%3A4exampletrack00000001b", reqs[1].Query);
        Assert.Equal(HttpMethod.Delete, reqs[2].Method);
        Assert.False(rig.Http.Seen.Any(r => r.Path.StartsWith("/v1/me/tracks", StringComparison.Ordinal)), "the removed /me/tracks endpoints must not be used");
    }

    [Test]
    public async Task Playlist_items_use_the_items_endpoint_keep_local_files_and_read_item_or_track()
    {
        await using var rig = await Rig.StartAsync();
        var lib = rig.Service.Library;
        var page0 = await lib.GetPlaylistsPageAsync(0, CancellationToken.None);
        Assert.Equal(120, page0.Total);
        Assert.Equal(50, page0.Items.Count);
        Assert.Equal("Night Drive Mix", page0.Items[0].Name);
        Assert.Equal(48, page0.Items[0].TrackCount);
        Assert.Equal("?limit=50&offset=0", rig.Http.Api.Last().Query);

        var tracks = await lib.GetTracksPageAsync(page0.Items[0], 0, CancellationToken.None);
        var req = rig.Http.Api.Last();
        Assert.Equal("/v1/playlists/6exampleplaylist000000/items", req.Path);
        Assert.Contains("additional_types=track%2Cepisode", req.Query);
        Assert.Contains("fields=", req.Query);
        Assert.Equal(48, tracks.Total);
        Assert.Equal(48, tracks.Items.Count);
        var local = tracks.Items[5];
        Assert.True(local.IsLocal);
        Assert.False(local.IsPlayable);
        Assert.Equal(5, local.Position, "rows keep their playlist position");
        Assert.Equal("Night Drive", tracks.Items[0].Name);
        Assert.Equal("The Example Ensemble", tracks.Items[0].ArtistLine);

        // The deprecated "track" row field still parses.
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/playlists/", _ => FakeHttp.Json(Fx.ItemsPage(1, 0, legacyTrackField: true)), prefix: true);
        var legacy = await lib.GetTracksPageAsync(page0.Items[1], 0, CancellationToken.None);
        Assert.Equal("Night Drive", legacy.Items[0].Name);
    }

    [Test]
    public async Task Filtered_pages_without_item_rows_are_fetched_again_without_fields()
    {
        await using var rig = await Rig.StartAsync();
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/playlists/", r =>
            FakeHttp.Json(Fx.ItemsPage(2, 0, emptyRows: r.Query.Contains("fields=", StringComparison.Ordinal))), prefix: true);
        var p = PlaylistLibrary.ToEntry(JsonSerializer.Deserialize(Fx.PlaylistJson(2).ToJsonString(), SpotifyJsonContext.Default.PlaylistDto)!);
        var page = await rig.Service.Library.GetTracksPageAsync(p, 0, CancellationToken.None);
        Assert.Equal("Night Drive", page.Items[0].Name);
        var tries = rig.Http.Api.Where(r => r.Path.StartsWith("/v1/playlists/", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, tries.Count);
        Assert.DoesNotContain("fields=", tries[1].Query);
    }

    [Test]
    public async Task Not_owned_playlists_403_once_and_are_remembered()
    {
        await using var rig = await Rig.StartAsync();
        var page = await rig.Service.Library.GetPlaylistsPageAsync(0, CancellationToken.None);
        var followed = page.Items[3];
        await Assert.ThrowsAsync<PlaylistNotOwnedException>(() => rig.Service.Library.GetTracksPageAsync(followed, 0, CancellationToken.None));
        var calls = rig.Http.Api.Count(r => r.Path.Contains(followed.Id, StringComparison.Ordinal));
        await Assert.ThrowsAsync<PlaylistNotOwnedException>(() => rig.Service.Library.GetTracksPageAsync(followed, 0, CancellationToken.None));
        Assert.Equal(calls, rig.Http.Api.Count(r => r.Path.Contains(followed.Id, StringComparison.Ordinal)), "the 403 is cached");
        Assert.False(rig.Service.Library.CanListTracks(followed));
    }

    [Test]
    public async Task Playlist_pages_revalidate_with_if_none_match_and_reuse_the_cache_on_304()
    {
        await using var rig = await Rig.StartAsync();
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/playlists", r =>
        {
            if (r.IfNoneMatch == "\"etag-1\"") return FakeHttp.Status(HttpStatusCode.NotModified);
            var resp = FakeHttp.Json(Fx.PlaylistsPage(0, 3));
            resp.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"etag-1\"");
            return resp;
        });
        var lib = rig.Service.Library;
        var first = await lib.GetPlaylistsPageAsync(0, CancellationToken.None);
        Assert.Equal(3, first.Items.Count);
        await lib.GetPlaylistsPageAsync(0, CancellationToken.None);
        Assert.Equal(1, rig.Http.Count(HttpMethod.Get, "/v1/me/playlists"), "cached for 10 minutes");
        lib.MarkStale();
        var again = await lib.GetPlaylistsPageAsync(0, CancellationToken.None);
        Assert.Equal(2, rig.Http.Count(HttpMethod.Get, "/v1/me/playlists"));
        Assert.Equal("\"etag-1\"", rig.Http.Api.Last().IfNoneMatch);
        Assert.Equal(first.Items[0].Id, again.Items[0].Id);
    }

    [Test]
    public async Task Player_errors_map_to_plain_messages()
    {
        await using var rig = await Rig.StartAsync();
        rig.Http.On(HttpMethod.Post, "api.spotify.com/v1/me/player/next", _ => FakeHttp.Error(HttpStatusCode.Forbidden, "Player command failed: Premium required", "PREMIUM_REQUIRED"));
        var e = await Assert.ThrowsAsync<SpotifyApiException>(() => rig.Service.Api.NextAsync(null, CancellationToken.None));
        Assert.Equal(ApiFailure.PremiumRequired, e.Kind);
        Assert.Equal(SpotifyText.PremiumRequired, SpotifyText.ForFailure(e));
        rig.Http.On(HttpMethod.Post, "api.spotify.com/v1/me/player/previous", _ => FakeHttp.Error(HttpStatusCode.Forbidden, "Player command failed: Restriction violated", "UNKNOWN"));
        e = await Assert.ThrowsAsync<SpotifyApiException>(() => rig.Service.Api.PreviousAsync(null, CancellationToken.None));
        Assert.Equal(ApiFailure.Restricted, e.Kind);
        rig.Http.On(HttpMethod.Put, "api.spotify.com/v1/me/player/pause", _ => FakeHttp.Error(HttpStatusCode.NotFound, "Player command failed: No active device found", "NO_ACTIVE_DEVICE"));
        e = await Assert.ThrowsAsync<SpotifyApiException>(() => rig.Service.Api.PauseAsync(null, CancellationToken.None));
        Assert.Equal(ApiFailure.NoActiveDevice, e.Kind);
        Assert.Equal(SpotifyText.OpenSpotify, SpotifyText.ForFailure(e));
    }
}
