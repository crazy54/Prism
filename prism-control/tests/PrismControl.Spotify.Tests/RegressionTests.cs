using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Render;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// Review A findings (aaa-prism-control/judges/review-a/REPORT.md), turned from the reviewer's repro scripts
/// (judges/review-a/spotify/Repro.cs, rebind.ps1) into regression tests. Fakes only: nothing reaches Spotify or the PC.
/// </summary>
public class RegressionTests
{
    private static HttpResponseMessage TooManyRequests(int retryAfterSeconds)
    {
        var r = FakeHttp.Error(HttpStatusCode.TooManyRequests, "API rate limit exceeded");
        r.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(retryAfterSeconds));
        return r;
    }

    private static int VolumePuts(Rig rig) => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume");

    /// <summary>Lets the coalescing volume sender run its 200 ms spacing and exit (manual clock + real scheduling).</summary>
    private static async Task PumpAsync(Rig rig, int steps = 10)
    {
        for (var i = 0; i < steps; i++)
        {
            await Task.Delay(15);
            rig.Time.Advance(TimeSpan.FromMilliseconds(100));
        }
        await Task.Delay(30);
    }

    // ------------------------------------------------------------------ #2 (high): no waiting out a 429 / quota pause

    [Test]
    public async Task A_429_pause_fails_queued_commands_fast_and_never_replays_them()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        var svc = rig.Service;
        await svc.PollOnceAsync(RequestPriority.Read);
        rig.Http.On(HttpMethod.Post, "api.spotify.com/v1/me/player/previous", _ => TooManyRequests(30));
        var previous = await svc.PreviousAsync();
        Assert.False(previous.Ok);
        Assert.Equal("Spotify busy · try in 30 s", previous.Message);

        // Three skips during the 30 s Retry-After: the clock does not move, so none may wait for the pause.
        var skips = await Task.WhenAll(svc.NextAsync(), svc.NextAsync(), svc.NextAsync()).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(skips.All(r => !r.Ok && r.Message == "Spotify busy · try in 30 s"), string.Join(", ", skips.Select(r => r.Message)));
        for (var i = 0; i < 40; i++)
        {
            rig.Time.Advance(TimeSpan.FromSeconds(1));
            await Task.Delay(5);
        }
        await rig.SettleAsync(60);
        Assert.Equal(0, rig.Http.Count(HttpMethod.Post, "/v1/me/player/next"), "a skip pressed during the pause is dropped, never sent later");
    }

    [Test]
    public void Busy_messages_say_when_to_try_again_and_fit_keys_and_dials()
    {
        Assert.Equal("Spotify busy · try in 30 s", SpotifyText.BusyTryIn(TimeSpan.FromSeconds(29.2)));
        Assert.Equal("BUSY · 30 S", SpotifyText.KeyHint(SpotifyText.BusyTryIn(TimeSpan.FromSeconds(30))));
        Assert.Equal("Busy · try in 30 s", SpotifyText.DialHint(SpotifyText.BusyTryIn(TimeSpan.FromSeconds(30))));
        Assert.Equal("Spotify busy · try in 5 min", SpotifyText.BusyTryIn(TimeSpan.FromSeconds(281)));
        Assert.Equal("Spotify busy · try in 2 h", SpotifyText.BusyTryIn(TimeSpan.FromMinutes(61)));
        Assert.Equal("Spotify busy · try in 30 s", SpotifyText.ForFailure(new SpotifyApiException(ApiFailure.RateLimited, 429, null, "x", TimeSpan.FromSeconds(30))));
        foreach (var seconds in new[] { 1, 9, 59, 60, 599, 3599, 3600, 86_400 })
        {
            var key = SpotifyText.KeyHint(SpotifyText.BusyTryIn(TimeSpan.FromSeconds(seconds)));
            Assert.Empty(Core.Render.StrokeFont.Unsupported(key), key);
            Assert.True(Core.Render.StrokeFont.Measure(key, 16) <= 144 - 28, $"'{key}' is wider than a key label at the smallest size");
            var dial = SpotifyText.DialHint(SpotifyText.BusyTryIn(TimeSpan.FromSeconds(seconds)));
            Assert.True(Core.Render.StrokeFont.Measure(dial, 9) <= 94, $"'{dial}' is wider than the dial notice line");
        }
    }

    [Test]
    public async Task Short_gate_waits_are_capped_and_longer_ones_fail_fast()
    {
        var time = new ManualTimeProvider();
        var gate = new RequestGate(time);
        gate.PauseUntil(time.GetUtcNow().AddSeconds(1.5));
        var command = gate.AcquireAsync(RequestPriority.Command).AsTask();
        await Task.Delay(20);
        Assert.False(command.IsCompleted, "a 1.5 s pause is short enough to wait out");
        time.Advance(TimeSpan.FromSeconds(1.5));
        Assert.True(await command.WaitAsync(TimeSpan.FromSeconds(2)));

        gate.PauseUntil(time.GetUtcNow().AddSeconds(2.5));
        foreach (var priority in new[] { RequestPriority.Command, RequestPriority.Read })
        {
            var e = await Assert.ThrowsAsync<SpotifyApiException>(() => gate.AcquireAsync(priority).AsTask().WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.Equal(ApiFailure.RateLimited, e.Kind, priority.ToString());
            Assert.Near(2.5, e.RetryAfter!.Value.TotalSeconds, 0.01);
        }
        Assert.False(await gate.AcquireAsync(RequestPriority.Poll), "polls are still just dropped");

        // The rolling-minute cap would mean a wait of about a minute: fail fast too.
        var capped = new RequestGate(time, new GateOptions { Burst = 100, RatePerSecond = 100, MaxPerMinute = 3 });
        for (var i = 0; i < 3; i++) Assert.True(await capped.AcquireAsync(RequestPriority.Poll));
        var full = await Assert.ThrowsAsync<SpotifyApiException>(() => capped.AcquireAsync(RequestPriority.Command).AsTask().WaitAsync(TimeSpan.FromSeconds(2)));
        Assert.Equal(ApiFailure.RateLimited, full.Kind);
        Assert.True(full.RetryAfter > TimeSpan.FromSeconds(50), $"{full.RetryAfter}");
    }

    [Test]
    public async Task A_quota_pause_fails_fast_with_the_basic_mode_message()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        rig.Http.On(HttpMethod.Put, "api.spotify.com/v1/me/player/shuffle", _ => FakeHttp.Error(HttpStatusCode.TooManyRequests, "Quota exceeded", "QUOTA_EXCEEDED"));
        Assert.Equal(SpotifyText.BasicMode, (await rig.Service.ToggleShuffleAsync()).Message);
        var like = await rig.Service.ToggleLikeAsync().WaitAsync(TimeSpan.FromSeconds(3));   // 10 minutes of basic mode: never waited out
        Assert.False(like.Ok);
        Assert.Equal(SpotifyText.BasicMode, like.Message);
        Assert.Equal(0, rig.Http.Count(HttpMethod.Put, "/v1/me/library"));
    }

    [Test]
    public async Task Transport_falls_back_to_the_media_session_while_the_web_api_is_paused()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        rig.Smtc.Set(Fx.SmtcSpotify(title: "Example Song 2", state: PlayState.Paused));   // Spotify's own session on this PC
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        rig.Http.On(HttpMethod.Post, "api.spotify.com/v1/me/player/next", _ => TooManyRequests(30));
        var first = await rig.Service.NextAsync();     // remote playback: the Web API, which answers 429
        Assert.False(first.Ok);
        Assert.Empty(rig.Smtc.Commands);
        var next = await rig.Service.NextAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(next.Ok, next.Message);
        var toggle = await rig.Service.TogglePlayPauseAsync().WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(toggle.Ok, toggle.Message);
        Assert.Equal("next,toggle", string.Join(',', rig.Smtc.Commands), "the media session can do these, so it does them during the pause");
        rig.Time.Advance(TimeSpan.FromSeconds(40));
        await rig.SettleAsync(60);
        Assert.Equal(1, rig.Http.Count(HttpMethod.Post, "/v1/me/player/next"), "nothing is replayed after the pause");
        Assert.Equal(0, rig.Http.Count(HttpMethod.Put, "/v1/me/player/pause"));
    }

    [Test]
    public async Task A_busy_key_shows_a_brief_busy_state_and_its_mailbox_never_blocks()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await using var h = await ActionHarness<NextAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services, time: rig.Time);
        await Fx.WaitUntil(() => rig.Service.Current.DeviceId is not null, "remote playback known");
        rig.Http.On(HttpMethod.Post, "api.spotify.com/v1/me/player/next", _ => TooManyRequests(30));
        await h.PressAsync().WaitAsync(TimeSpan.FromSeconds(3));                 // the press that meets the 429
        Assert.Equal(SpotifyArt.GlyphKey(Refraction.Night, SpotifyGlyphs.Next, "BUSY · 30 S", on: false).ToDataUri(), h.LastImage);
        for (var i = 0; i < 3; i++) await h.PressAsync().WaitAsync(TimeSpan.FromSeconds(3));   // during the pause: answered at once
        Assert.Equal(4, h.Count("showAlert"));
        Assert.Equal(SpotifyArt.GlyphKey(Refraction.Night, SpotifyGlyphs.Next, "BUSY · 30 S", on: false).ToDataUri(), h.LastImage);
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.Next, true, true).ToDataUri(), h.LastImage, "the busy state is brief");
        await h.AdvanceAsync(TimeSpan.FromSeconds(40));
        Assert.Equal(1, rig.Http.Count(HttpMethod.Post, "/v1/me/player/next"), "the presses during the pause are never sent");
        h.AssertFramesAreDeckSafe();
    }

    // ------------------------------------------------------------------ #4: network error during a token refresh

    [Test]
    public async Task A_network_error_while_refreshing_the_token_never_wedges_the_volume()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.SeedTokens(expiresAt: r.Time.GetUtcNow().AddMinutes(1)));
        var failures = new List<string>();
        rig.Service.VolumeFailed += (_, m) => { lock (failures) failures.Add(m); };
        rig.Http.On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => throw new HttpRequestException("No such host is known."));
        Assert.True(rig.Service.SetVolume(30).Ok);
        await Fx.WaitUntil(() => { lock (failures) return failures.Count == 1; }, "the failed send is reported");
        Assert.Equal("Offline", failures[0]);
        Assert.Null(rig.Service.Current.VolumePct, "the optimistic level is reverted");

        rig.Http.On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => FakeHttp.Json(Fx.Token(7)));   // network back
        rig.Time.Advance(TimeSpan.FromSeconds(30));
        Assert.True(rig.Service.SetVolume(40).Ok);
        await Fx.WaitUntil(() => VolumePuts(rig) == 1, "the next gesture is sent");
        Assert.Contains("volume_percent=40", rig.Http.Api.Last(r => r.Path == "/v1/me/player/volume").Query);
    }

    [Test]
    public async Task A_network_error_while_refreshing_maps_to_offline_and_reverts_an_optimistic_like()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        await Fx.WaitUntil(() => rig.Service.Current.Liked == false, "liked state");
        rig.Time.Advance(TimeSpan.FromMinutes(56));   // the access token is now inside the refresh margin
        rig.Http.On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => throw new HttpRequestException("No such host is known."));
        var e = await Assert.ThrowsAsync<SpotifyApiException>(() => rig.Service.Auth.GetAccessTokenAsync(CancellationToken.None));
        Assert.Equal(ApiFailure.Network, e.Kind);
        var r = await rig.Service.ToggleLikeAsync();
        Assert.False(r.Ok);
        Assert.Equal("Offline", r.Message);
        Assert.Equal(false, rig.Service.Current.Liked, "the optimistic heart is reverted");
        Assert.Equal(0, rig.Http.Count(HttpMethod.Put, "/v1/me/library"));
        Assert.Equal(AuthState.Connected, rig.Service.Auth.State, "a network error is not a sign-out");
    }

    // ------------------------------------------------------------------ #5: a repeated mute is dropped

    [Test]
    public async Task A_repeated_mute_is_sent_again()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, volume: 50));
        var svc = rig.Service;
        await svc.PollOnceAsync(RequestPriority.Read);
        Assert.True(svc.ToggleMute().Ok);
        await Fx.WaitUntil(() => VolumePuts(rig) == 1, "first mute");
        await PumpAsync(rig);
        rig.PlayerJson = () => Fx.Player(local: false, volume: 0);
        rig.Time.Advance(TimeSpan.FromSeconds(5));
        await svc.PollOnceAsync(RequestPriority.Read);
        rig.PlayerJson = () => Fx.Player(local: false, volume: 50);   // un-muted in the Spotify app
        rig.Time.Advance(TimeSpan.FromSeconds(5));
        await svc.PollOnceAsync(RequestPriority.Read);
        Assert.Equal(50, svc.Current.VolumePct);
        Assert.True(svc.ToggleMute().Ok);
        Assert.Equal(0, svc.Current.VolumePct);
        await Fx.WaitUntil(() => VolumePuts(rig) == 2, "the second mute goes out too");
        Assert.Contains("volume_percent=0", rig.Http.Api.Last(r => r.Path == "/v1/me/player/volume").Query);
    }

    // ------------------------------------------------------------------ #6: the poll loop spins on a stale track end

    [Test]
    public async Task A_stale_track_end_never_spins_the_poll_loop()
    {
        // Remote playback 1.4 s from the end of the track and a gate with no tokens left: every poll after the first is dropped.
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, progress: 220_000, duration: 221_386),
            gate: new GateOptions { Burst = 2, RatePerSecond = 0.0001, MaxPerMinute = 1000 });
        using var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Get, "/v1/me/player") == 1, "first read");
        await rig.SettleAsync(100);
        var before = rig.Service.PollLoopIterations;
        for (var i = 0; i < 100; i++)   // 10 s of simulated time, well past the track end
        {
            rig.Time.Advance(TimeSpan.FromMilliseconds(100));
            await Task.Delay(2);
        }
        await rig.SettleAsync(100);
        var iterations = rig.Service.PollLoopIterations - before;
        Assert.True(iterations <= 60, $"the poll loop went round {iterations} times in 10 s of simulated time");
    }

    [Test]
    public async Task Polls_are_never_closer_than_the_minimum_interval()
    {
        // Two tokens: GET /me (on the first view) and the first poll. The poll after the track end is dropped.
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, progress: 221_000, duration: 221_386),
            gate: new GateOptions { Burst = 2, RatePerSecond = 0.0001, MaxPerMinute = 1000 }, start: false);
        rig.Service.Auth.Load();
        using var view = rig.Service.AttachView(SpotifyView.NowPlaying);
        await rig.Service.PollOnceAsync(RequestPriority.Poll);           // 0.4 s left in the track
        Assert.Equal(1, rig.Http.Count(HttpMethod.Get, "/v1/me/player"));
        rig.Time.Advance(TimeSpan.FromSeconds(1));                       // past the track end
        await rig.Service.PollOnceAsync(RequestPriority.Poll);           // dropped by the gate: the track end is now stale
        Assert.Equal(1, rig.Http.Count(HttpMethod.Get, "/v1/me/player"));
        Assert.Equal(TimeSpan.FromSeconds(2), rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay,
            "a track end at or before the last poll is ignored: back to the 2 s cadence");
        rig.Service.RequestRefresh();                                    // an explicit read due now, right after that poll
        Assert.Equal(SpotifyService.MinPollInterval, rig.Service.NextPoll(rig.Time.GetUtcNow()).Delay, "never closer than the minimum interval");
    }

    // ------------------------------------------------------------------ #9: a second Connect

    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    [Test]
    public async Task A_second_connect_closes_the_first_listener_and_keeps_the_new_attempt()
    {
        var port = FreePort();
        await using var rig = await Rig.StartAsync(connected: false, auth: new AuthOptions { Port = port, AllowFallbackPort = true });
        rig.Service.BeginConnect(Fx.ClientId);
        var first = Assert.NotNull(rig.Service.Auth.PendingConnect);
        var url = rig.Service.BeginConnect(Fx.ClientId);
        var q = LoopbackReceiver.ParseQuery(new Uri(url).PathAndQuery);
        Assert.Equal($"http://127.0.0.1:{port}/callback", q["redirect_uri"], "the second attempt binds the registered port again");
        Assert.False(rig.Service.Status.UsedFallbackPort);
        await first.WaitAsync(TimeSpan.FromSeconds(3));
        await rig.SettleAsync();
        Assert.Equal(AuthState.Connecting, rig.Service.Auth.State, "the old attempt must not reset the new one");
        Assert.Contains("approve", rig.Service.Status.AuthMessage);

        var page = await AuthTests.BrowserGet(port, $"/callback?code=AQB-fake-code&state={Uri.EscapeDataString(q["state"])}");
        Assert.Contains("Prism Control is connected", page);
        await Assert.NotNull(rig.Service.Auth.PendingConnect).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(AuthState.Connected, rig.Service.Auth.State);
    }

    [Test]
    public async Task Cancelling_a_connect_frees_the_port_at_once_and_returns_to_signed_out()
    {
        var port = FreePort();
        await using var rig = await Rig.StartAsync(connected: false, auth: new AuthOptions { Port = port, AllowFallbackPort = false });
        rig.Service.BeginConnect(Fx.ClientId);
        var pending = Assert.NotNull(rig.Service.Auth.PendingConnect);
        Assert.Equal(AuthState.Connecting, rig.Service.Auth.State);
        rig.Service.Auth.CancelPendingConnect();
        Assert.Equal(AuthState.SignedOut, rig.Service.Auth.State);
        using (LoopbackReceiver.Bind(port, allowFallback: false)) { }   // free right away (throws if still bound)
        await pending.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(AuthState.SignedOut, rig.Service.Auth.State);
    }

    [Test]
    public async Task A_like_check_that_met_a_pause_is_retried_on_the_next_good_read()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        var busy = true;
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/library/contains", _ => busy ? TooManyRequests(30) : FakeHttp.Json("[true]"));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Get, "/v1/me/library/contains") == 1, "first check (429)");
        await rig.SettleAsync();
        Assert.Null(rig.Service.Current.Liked);
        busy = false;
        rig.Time.Advance(TimeSpan.FromSeconds(31));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        await Fx.WaitUntil(() => rig.Service.Current.Liked == true, "re-checked after the pause");
        Assert.Equal(2, rig.Http.Count(HttpMethod.Get, "/v1/me/library/contains"));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        await rig.SettleAsync();
        Assert.Equal(2, rig.Http.Count(HttpMethod.Get, "/v1/me/library/contains"), "only once: known states are not re-read");
    }

    [Test]
    public void The_loopback_receiver_binds_127_0_0_1_only()
    {
        using var rx = LoopbackReceiver.Bind(0, allowFallback: false);
        Assert.Equal(IPAddress.Loopback, rx.Endpoint.Address);
        Assert.Equal(rx.Port, rx.Endpoint.Port);
    }

    // ------------------------------------------------------------------ Low: token saves are not serialized

    [Test]
    public async Task Token_saves_are_serialized_and_the_vault_ends_with_the_latest_sign_in()
    {
        using var hold = new ManualResetEventSlim(false);
        using var holding = new ManualResetEventSlim(false);
        var first = 1;
        await using var rig = await Rig.StartAsync(configure: r => r.Vault.BeforeSave = name =>
        {
            if (name == SpotifyAuth.TokensSecret && Interlocked.Exchange(ref first, 0) == 1)
            {
                holding.Set();
                hold.Wait(TimeSpan.FromSeconds(5));
            }
        });
        var auth = rig.Service.Auth;
        var label = Task.Run(() => auth.SetAccount("Example Listener", Fx.Me));   // its save is held open
        Assert.True(holding.Wait(TimeSpan.FromSeconds(3)), "the account save started");
        var refresh = Task.Run(() => auth.RefreshAsync("BQD-fake-access-token-0", CancellationToken.None));
        await Task.Delay(200);                                                      // the refresh exchange completes meanwhile
        hold.Set();
        await Task.WhenAll(label, refresh).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("BQD-fake-access-token-1", refresh.Result);
        Assert.Equal(1, rig.Vault.MaxConcurrentSaves, "token saves run one at a time");
        var stored = Assert.NotNull(rig.Vault.Load(SpotifyAuth.TokensSecret));
        Assert.Contains("BQD-fake-access-token-1", stored, "the vault holds the refreshed sign-in, not the older copy");
        Assert.Contains("AQC-fake-refresh-token-1", stored);
        Assert.Contains("Example Listener", stored, "and the account label set meanwhile");
    }
}
