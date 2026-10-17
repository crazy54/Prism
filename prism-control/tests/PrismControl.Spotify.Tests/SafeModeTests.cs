using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Render;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// Safe mode (docs/authoring-actions.md § Safe mode): presses and turns change nothing real. Every write path in the
/// review inventory is covered: SMTC transport (works signed out), Web API PUT/POST/DELETE, the "spotify:" launch, and
/// DPAPI token writes (plus the token refresh, which would rotate the real refresh token). The fakes record every real
/// call; <see cref="SpotifyService.SafeModeWrites"/> counts what was suppressed.
/// </summary>
public class SafeModeTests
{
    private static List<string> RealWrites(Rig rig) =>
        rig.Http.Seen.Where(r => r.Method != HttpMethod.Get).Select(r => r.Method + " " + r.Host + r.Path).ToList();

    [Test]
    public async Task Signed_out_transport_keys_change_only_fake_state()
    {
        await using var rig = await Rig.StartAsync(connected: false, safeMode: true);
        rig.Smtc.Set(Fx.SmtcSpotify());   // Spotify playing on this PC: SMTC transport works without a sign-in
        var t = rig.Time;
        await using var play = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var next = await ActionHarness<NextAction>.AppearAsync(TestDevices.Galleon, new(1, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var prev = await ActionHarness<PreviousAction>.AppearAsync(TestDevices.Galleon, new(2, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var shuffle = await ActionHarness<ShuffleAction>.AppearAsync(TestDevices.Galleon, new(3, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var repeat = await ActionHarness<RepeatAction>.AppearAsync(TestDevices.Plus, new(0, 1), configureServices: rig.Services, time: t, safeMode: true);
        await using var dial = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: rig.Services, time: t, safeMode: true);
        Assert.True(play.Action.SafeMode);

        await play.PressAsync();
        Assert.Equal(PlayState.Paused, rig.Service.Current.State, "the fake session paused");
        await play.AdvanceAsync(TimeSpan.FromSeconds(4));   // past the optimistic override: the fake state itself holds
        Assert.Equal(PlayState.Paused, rig.Service.Current.State);
        Assert.Equal(SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.PlayPause, false, true).ToDataUri(), play.LastImage, "the key shows play");
        await next.PressAsync();
        await prev.PressAsync();
        await shuffle.PressAsync();
        await repeat.PressAsync();
        await dial.RotateAsync(3);                                   // seek +15 s, sent 300 ms after the last tick
        await dial.AdvanceAsync(TimeSpan.FromMilliseconds(400));
        await dial.DialPressAsync();                                 // play again

        Assert.Empty(rig.Smtc.Commands, "no real media-session command");
        Assert.Empty(rig.Http.Seen, "signed out: no network at all");
        var s = rig.Service.Current;
        Assert.Equal(PlayState.Playing, s.State);
        Assert.Equal(true, s.Shuffle);
        Assert.Equal(RepeatMode.Context, s.Repeat);
        Assert.Equal(SpotifyArt.ShuffleKey(Refraction.Night, true, true).ToDataUri(), shuffle.LastImage);
        var w = rig.Service.SafeModeWrites;
        Assert.True(w.Enabled);
        Assert.Equal(2, w.Count("smtc toggle"));
        Assert.Equal(1, w.Count("smtc next"));
        Assert.Equal(1, w.Count("smtc previous"));
        Assert.Equal(1, w.Count("smtc shuffle"));
        Assert.Equal(1, w.Count("smtc repeat"));
        Assert.Equal(1, w.Count("smtc seek"));
        Assert.Contains("[safe mode]", rig.Log.All);
        play.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Connected_presses_and_turns_never_send_a_web_api_write()
    {
        await using var rig = await Rig.StartAsync(safeMode: true, configure: r => r.PlayerJson = () => Fx.Player(local: false, volume: 50, shuffle: false, repeat: "off"));
        var t = rig.Time;
        await using var play = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var like = await ActionHarness<LikeAction>.AppearAsync(TestDevices.Galleon, new(1, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var next = await ActionHarness<NextAction>.AppearAsync(TestDevices.Galleon, new(2, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var shuffle = await ActionHarness<ShuffleAction>.AppearAsync(TestDevices.Plus, new(0, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var repeat = await ActionHarness<RepeatAction>.AppearAsync(TestDevices.Plus, new(1, 0), configureServices: rig.Services, time: t, safeMode: true);
        await using var volume = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            settings: new SpotifyVolumeSettings { Step = 2 }, configureServices: rig.Services, time: t, safeMode: true);
        await Fx.WaitUntil(() => rig.Service.Current.Liked == false && rig.Service.Current.VolumePct == 50, "remote playback and liked state read (reads stay real)");

        await play.PressAsync();
        await like.PressAsync();
        await next.PressAsync();
        await shuffle.PressAsync();
        await repeat.PressAsync();
        await volume.RotateAsync(5);
        await volume.AdvanceAsync(TimeSpan.FromSeconds(1));
        await play.AdvanceAsync(TimeSpan.FromSeconds(4));   // confirmation reads ran; optimistic overrides expired

        Assert.Empty(RealWrites(rig), "no PUT/POST/DELETE left the process");
        Assert.True(rig.Http.Count(HttpMethod.Get, "/v1/me/player") >= 2, "reads stay real");
        var s = rig.Service.Current;
        Assert.Equal(PlayState.Paused, s.State, "the fake player paused, and the real reads agree with it");
        Assert.Equal(true, s.Liked);
        Assert.Equal(true, s.Shuffle);
        Assert.Equal(RepeatMode.Context, s.Repeat);
        Assert.Equal(60, s.VolumePct);
        Assert.False(rig.Liked, "the user's library is untouched");
        Assert.Equal(SpotifyArt.LikeKey(Refraction.Night, true, true).ToDataUri(), like.LastImage);
        Assert.Equal(SpotifyArt.VolumeDial(Refraction.Night, 60, "Living Room", false).ToDataUri(), volume.FeedbackText(Layouts.Canvas.Frame));

        // The browser's play paths (with and without shuffle) are faked the same way.
        var lib = rig.Service.Library;
        var p0 = (await lib.GetPlaylistsPageAsync(0, CancellationToken.None)).Items[0];
        var t3 = (await lib.GetTracksPageAsync(p0, 0, CancellationToken.None)).Items[3];
        Assert.True((await rig.Service.PlayPlaylistAsync(p0, t3, shuffle: false)).Ok);
        Assert.True((await rig.Service.PlayPlaylistAsync(p0, null, shuffle: true)).Ok);
        Assert.Empty(RealWrites(rig));

        var w = rig.Service.SafeModeWrites;
        Assert.Equal(1, w.Count("PUT /me/player/pause"));
        Assert.Equal(1, w.Count("PUT /me/library"));
        Assert.Equal(1, w.Count("POST /me/player/next"));
        Assert.Equal(2, w.Count("PUT /me/player/shuffle"));
        Assert.Equal(1, w.Count("PUT /me/player/repeat"));
        Assert.True(w.Count("PUT /me/player/volume") >= 1);
        Assert.Equal(2, w.Count("PUT /me/player/play"));
        Assert.DoesNotContain("spotify:track", rig.Log.All);
        Assert.DoesNotContain("uris=", rig.Log.All);
        volume.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Safe_mode_never_launches_spotify()
    {
        await using var rig = await Rig.StartAsync(safeMode: true, configure: r => { r.PlayerJson = () => null; r.LocalDeviceListed = false; });
        await rig.Service.PollOnceAsync(RequestPriority.Poll);   // nothing active, and no device for this PC
        var r = await rig.Service.TogglePlayPauseAsync();
        Assert.False(r.Ok);
        Assert.Equal(SpotifyText.OpenSpotify, r.Message);
        Assert.Equal(0, rig.Launches, "the launcher is never called");
        Assert.Equal(1, rig.Service.SafeModeWrites.Count("launch spotify"));
        Assert.Empty(RealWrites(rig));
    }

    [Test]
    public async Task Safe_mode_keeps_the_saved_sign_in_untouched()
    {
        await using var rig = await Rig.StartAsync(safeMode: true, configure: r => r.SeedTokens(expiresAt: r.Time.GetUtcNow().AddMinutes(1)));
        var seeded = rig.Vault.All;
        var writes = rig.Vault.Writes;
        var auth = rig.Service.Auth;
        Assert.Equal(AuthState.Connected, auth.State, "the saved sign-in is read");

        // An access token inside the refresh margin is not refreshed: Spotify rotates refresh tokens, which would sign the real plugin out.
        Assert.Null(await auth.GetAccessTokenAsync(CancellationToken.None));
        Assert.False(rig.Http.Seen.Any(x => x.Host == "accounts.spotify.com"), "no token request");
        Assert.Equal(AuthState.Connected, auth.State, "and the sign-in is not marked expired");

        auth.SetAccount("Example Listener", Fx.Me);
        auth.MarkNeedsReconnect("test");
        rig.Service.Disconnect();
        var url = rig.Service.BeginConnect("fedcba9876543210fedcba9876543210");
        Assert.Contains("accounts.spotify.com/authorize", url);
        rig.Service.Auth.CancelPendingConnect();

        Assert.Equal(writes, rig.Vault.Writes, "the real vault was never written or deleted");
        foreach (var (k, v) in seeded) Assert.Equal(v, rig.Vault.Load(k), k);
        var w = rig.Service.SafeModeWrites;
        Assert.Equal(1, w.Count("refresh the access token"));
        Assert.True(w.Count("vault save tokens") >= 1);
        Assert.True(w.Count("vault delete tokens") >= 1);
        Assert.Equal(1, w.Count("vault save client"));
        Assert.Equal(AuthState.SignedOut, auth.State, "in-process state still follows the clicks");
    }

    [Test]
    public async Task Outside_safe_mode_nothing_is_suppressed()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Read);
        Assert.True((await rig.Service.NextAsync()).Ok);
        Assert.False(rig.Service.SafeModeWrites.Enabled);
        Assert.Equal(0, rig.Service.SafeModeWrites.Total);
        Assert.Equal(1, rig.Http.Count(HttpMethod.Post, "/v1/me/player/next"));
    }
}
