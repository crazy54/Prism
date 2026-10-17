using System.Globalization;
using System.Text.RegularExpressions;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Render;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public partial class ActionTests
{
    [GeneratedRegex(@"<image\b[^>]*>")] internal static partial Regex ImageTag();
    [GeneratedRegex(@"\s(x|y|width|height)=""([0-9.\-]+)""")] private static partial Regex ImageAttr();

    /// <summary>The (x, y, w, h) of every embedded image, asserting none is masked, faded or rounded.</summary>
    internal static List<(double X, double Y, double W, double H)> Images(string svg)
    {
        var list = new List<(double, double, double, double)>();
        foreach (Match m in ImageTag().Matches(svg))
        {
            var tag = m.Value;
            Assert.DoesNotContain("mask=", tag, "album art must never be masked (no crop, no rounded corners)");
            Assert.DoesNotContain("opacity", tag, "album art must never be faded or tinted");
            Assert.DoesNotContain("filter=", tag);
            Assert.DoesNotContain("transform=", tag);
            var a = ImageAttr().Matches(tag).ToDictionary(x => x.Groups[1].Value, x => double.Parse(x.Groups[2].Value, CultureInfo.InvariantCulture));
            list.Add((a["x"], a["y"], a["width"], a["height"]));
        }
        return list;
    }

    private static readonly (DeviceInfo Device, Coordinates Key, Coordinates Dial)[] Decks =
    [
        (TestDevices.Galleon, new(1, 2), new(0, 0)),
        (TestDevices.Plus, new(2, 1), new(1, 0)),
    ];

    [Test]
    public async Task Now_playing_key_shows_whole_art_and_title_on_galleon_and_plus()
    {
        foreach (var (device, key, _) in Decks)
        {
            await using var rig = await Rig.StartAsync();
            rig.Smtc.Set(Fx.SmtcSpotify());
            await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(device, key, Controller.Keypad, configureServices: rig.Services);
            await Fx.WaitUntil(() => h.LastSvg?.Contains("<image", StringComparison.Ordinal) == true, device.Name + " art");
            await h.SettleAsync();
            var svg = Assert.NotNull(h.LastSvg);
            var art = Assert.Single(Images(svg));
            Assert.Equal((SpotifyArt.KeyArtX, SpotifyArt.KeyArtY, SpotifyArt.KeyArtSize, SpotifyArt.KeyArtSize), art, "square art fills its box exactly");
            Assert.Contains("data:image/jpeg;base64,", svg, "a downscaled JPEG copy is embedded");
            Assert.DoesNotContain("<text", svg);
            Assert.Equal(SpotifyArt.NowPlayingKey(Refraction.Night, rig.Service.Current, h.Time.GetUtcNow()).ToDataUri(), h.LastImage);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Non_square_art_is_letterboxed_never_cropped()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        rig.Smtc.Set(Fx.SmtcSpotify(thumb: FictionalArt.WidePng));
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        await Fx.WaitUntil(() => h.LastSvg?.Contains("<image", StringComparison.Ordinal) == true, "art");
        var (x, y, w, hgt) = Assert.Single(Images(h.LastSvg!));
        Assert.Equal(SpotifyArt.KeyArtX, x);
        Assert.Equal(SpotifyArt.KeyArtSize, w);
        Assert.True(hgt < SpotifyArt.KeyArtSize && y > SpotifyArt.KeyArtY, $"letterboxed (got y={y} h={hgt})");
        Assert.Near(SpotifyArt.KeyArtSize * 240.0 / 400, hgt, 1.0);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Now_playing_without_art_draws_the_music_glyph_tile_not_a_logo()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        Assert.Equal(SpotifyArt.GlyphKey(Refraction.Night, Core.Art.Glyphs.MusicNote, "NOT PLAYING", on: false).ToDataUri(), h.LastImage);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Now_playing_dial_draws_art_left_with_progress_on_galleon_and_plus()
    {
        foreach (var (device, _, dial) in Decks)
        {
            await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
            await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(device, dial, Controller.Encoder, configureServices: rig.Services);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            await Fx.WaitUntil(() => h.FeedbackSvg(Layouts.Canvas.Frame)?.Contains("<image", StringComparison.Ordinal) == true, device.Name + " dial art");
            var svg = h.FeedbackSvg(Layouts.Canvas.Frame)!;
            Assert.Contains("viewBox=\"0 0 200 100\"", svg);
            Assert.Equal((SpotifyArt.DialArtX, SpotifyArt.DialArtY, SpotifyArt.DialArtSize, SpotifyArt.DialArtSize), Assert.Single(Images(svg)));
            // Turning seeks (5 s per tick; Galleon spins carry many ticks): one seek goes out 300 ms after the last tick.
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            var expected = 81_234 + (device.IsGalleon ? 120_000 : 10_000);
            Assert.Near(expected, rig.Service.Current.PositionMs!.Value, 50);
            rig.Time.Advance(TimeSpan.FromMilliseconds(300));
            await Fx.WaitUntil(() => rig.Http.Api.Any(r => r.Path == "/v1/me/player/seek"), "coalesced seek");
            Assert.Equal(1, rig.Http.Count(HttpMethod.Put, "/v1/me/player/seek"));
            Assert.Contains($"position_ms={expected}", rig.Http.Api.Single(r => r.Path == "/v1/me/player/seek").Query);
            // Push = play/pause through the Web API for the remote device.
            await h.DialPressAsync();
            await Fx.WaitUntil(() => rig.Http.Api.Any(r => r.Path == "/v1/me/player/pause"), "pause");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Now_playing_key_press_uses_smtc_locally_and_hold_opens_the_track_in_spotify()
    {
        await using var rig = await Rig.StartAsync();
        rig.Smtc.Set(Fx.SmtcSpotify());
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        await Fx.WaitUntil(() => rig.Service.Current.Uri is not null, "web api enrichment");
        await h.PressAsync();
        Assert.Equal("toggle", Assert.Single(rig.Smtc.Commands));
        await h.PressAsync(TimeSpan.FromMilliseconds(800));
        var open = Assert.Single(h.CallsOf("openUrl"));
        Assert.Equal(Fx.TrackUri, open.Payload!["url"]!.GetValue<string>(), "the link back to Spotify");
        Assert.Single(rig.Smtc.Commands, "a hold does not also toggle");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_touch_toggles_and_long_touch_opens_in_spotify()
    {
        await using var rig = await Rig.StartAsync();
        rig.Smtc.Set(Fx.SmtcSpotify());
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder, configureServices: rig.Services);
        await h.TapAsync(100, 50);
        Assert.Equal("toggle", Assert.Single(rig.Smtc.Commands));
        await h.TapAsync(100, 50, hold: true);
        Assert.Single(h.CallsOf("openUrl"));
        var trig = h.CallsOf("setTriggerDescription").Last().Payload!;
        Assert.Equal("Open in Spotify", trig["longTouch"]!.GetValue<string>());
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Galleon_dial_has_no_touch_triggers()
    {
        await using var rig = await Rig.StartAsync();
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder, configureServices: rig.Services);
        var trig = h.CallsOf("setTriggerDescription").Last().Payload!;
        Assert.Null(trig["touch"]);
        Assert.Null(trig["longTouch"]);
        await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(1, 1));
    }

    [Test]
    public async Task Transport_keys_send_commands_on_galleon_and_plus()
    {
        foreach (var (device, key, _) in Decks)
        {
            await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
            await using var play = await ActionHarness<PlayPauseAction>.AppearAsync(device, key, configureServices: rig.Services);
            await using var next = await ActionHarness<NextAction>.AppearAsync(device, key, configureServices: rig.Services);
            await using var prev = await ActionHarness<PreviousAction>.AppearAsync(device, key, configureServices: rig.Services);
            await Fx.WaitUntil(() => rig.Service.Current.IsPlaying, "playing");
            await play.SettleAsync();
            Assert.Equal(SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.PlayPause, true, true).ToDataUri(), play.LastImage, "shows pause while playing");
            await play.PressAsync();
            await next.PressAsync();
            await prev.PressAsync();
            var cmds = rig.Http.Api.Where(r => r.Method != HttpMethod.Get).Select(r => r.Method + " " + r.Path).ToList();
            Assert.Equal("PUT /v1/me/player/pause|POST /v1/me/player/next|POST /v1/me/player/previous", string.Join('|', cmds));
            await Fx.WaitUntil(() => play.LastImage == SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.PlayPause, false, true).ToDataUri(), "optimistic play glyph");
            play.AssertFramesAreDeckSafe();
            next.AssertFramesAreDeckSafe();
            prev.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Transport_key_failure_alerts_and_shows_a_short_hint()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await ActionHarness<NextAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services);
        Assert.Equal(SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.Next, false, enabled: false).ToDataUri(), h.LastImage, "disabled: no Spotify anywhere");
        await h.PressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Equal(SpotifyArt.GlyphKey(Refraction.Night, SpotifyGlyphs.Next, "OPEN SPOTIFY", on: false).ToDataUri(), h.LastImage);
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(SpotifyArt.TransportKey(Refraction.Night, TransportGlyph.Next, false, enabled: false).ToDataUri(), h.LastImage, "the hint clears");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Like_key_toggles_with_the_library_endpoints_on_galleon_and_plus()
    {
        foreach (var (device, key, _) in Decks)
        {
            await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
            await using var h = await ActionHarness<LikeAction>.AppearAsync(device, key, configureServices: rig.Services);
            await Fx.WaitUntil(() => rig.Service.Current.Liked == false, "liked state");
            await h.SettleAsync();
            Assert.Equal(SpotifyArt.LikeKey(Refraction.Night, false, true).ToDataUri(), h.LastImage);
            await h.PressAsync();
            Assert.True(rig.Liked);
            Assert.Equal(SpotifyArt.LikeKey(Refraction.Night, true, true).ToDataUri(), h.LastImage);
            await h.PressAsync();
            Assert.False(rig.Liked);
            Assert.Equal("PUT /v1/me/library|DELETE /v1/me/library",
                string.Join('|', rig.Http.Api.Where(r => r.Method != HttpMethod.Get).Select(r => r.Method + " " + r.Path)));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Like_key_is_disabled_for_local_files_and_says_sign_in_when_signed_out()
    {
        await using (var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, isLocalFile: true)))
        {
            await using var h = await ActionHarness<LikeAction>.AppearAsync(TestDevices.Plus, new(0, 0), configureServices: rig.Services);
            await Fx.WaitUntil(() => rig.Service.Current.IsLocalFile, "local file");
            await h.SettleAsync();
            Assert.Equal(SpotifyArt.LikeKey(Refraction.Night, null, false).ToDataUri(), h.LastImage);
            await h.PressAsync();
            Assert.Equal(1, h.Count("showAlert"));
            Assert.False(rig.Http.Api.Any(r => r.Path == "/v1/me/library"));
        }
        await using (var rig = await Rig.StartAsync(connected: false))
        {
            await using var h = await ActionHarness<LikeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services);
            Assert.Equal(SpotifyArt.LikeKey(Refraction.Night, null, false, "SIGN IN").ToDataUri(), h.LastImage);
            await h.PressAsync();
            Assert.Equal(1, h.Count("showAlert"));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Shuffle_and_repeat_keys_use_the_web_api_when_connected()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, shuffle: false, repeat: "off"));
        await using var shuffle = await ActionHarness<ShuffleAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services);
        await using var repeat = await ActionHarness<RepeatAction>.AppearAsync(TestDevices.Plus, new(1, 0), configureServices: rig.Services);
        await Fx.WaitUntil(() => rig.Service.Current.Repeat == RepeatMode.Off, "state");
        await shuffle.PressAsync();
        Assert.Equal(SpotifyArt.ShuffleKey(Refraction.Night, true, true).ToDataUri(), shuffle.LastImage);
        await repeat.PressAsync();
        await repeat.PressAsync();
        Assert.Equal(SpotifyArt.RepeatKey(Refraction.Night, RepeatMode.Track, true).ToDataUri(), repeat.LastImage);
        var q = rig.Http.Api.Where(r => r.Method == HttpMethod.Put).Select(r => r.Path + r.Query.Split('&')[0]).ToList();
        Assert.Equal("/v1/me/player/shuffle?state=true|/v1/me/player/repeat?state=context|/v1/me/player/repeat?state=track", string.Join('|', q));
        shuffle.AssertFramesAreDeckSafe();
        repeat.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Shuffle_falls_back_to_smtc_without_a_sign_in()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        rig.Smtc.Set(Fx.SmtcSpotify());
        await using var h = await ActionHarness<ShuffleAction>.AppearAsync(TestDevices.Galleon, new(2, 3), configureServices: rig.Services);
        await h.PressAsync();
        Assert.Equal("shuffle:True", Assert.Single(rig.Smtc.Commands));
        Assert.Empty(rig.Http.Seen);
    }

    [Test]
    public async Task Volume_dial_galleon_spin_and_push_mute_restore()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, volume: 50));
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder,
            settings: new SpotifyVolumeSettings { Step = 2 }, configureServices: rig.Services);
        await Fx.WaitUntil(() => rig.Service.Current.VolumePct == 50, "volume");
        await h.RotateAsync(12);
        Assert.Equal(74, rig.Service.Current.VolumePct);
        await Fx.WaitUntil(() => rig.Http.Api.Any(r => r.Query.Contains("volume_percent=74", StringComparison.Ordinal)), "send 74");
        Assert.Contains($"device_id={Fx.RemoteDeviceId}", rig.Http.Api.Last(r => r.Path == "/v1/me/player/volume").Query);
        await h.DialPressAsync(TimeSpan.FromSeconds(5));   // a long Galleon hold is still a short press for us
        Assert.Equal(0, rig.Service.Current.VolumePct);
        rig.Time.Advance(TimeSpan.FromMilliseconds(250));
        await h.DialPressAsync();
        Assert.Equal(74, rig.Service.Current.VolumePct);
        await h.SettleAsync();
        Assert.Equal(SpotifyArt.VolumeDial(Refraction.Night, 74, "Living Room", true).ToDataUri(), h.FeedbackText(Layouts.Canvas.Frame));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Volume_dial_on_plus_steps_per_tick_and_touch_sets_the_level()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, volume: 50));
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(3, 0), Controller.Encoder, configureServices: rig.Services);
        await Fx.WaitUntil(() => rig.Service.Current.VolumePct == 50, "volume");
        await h.RotateAsync(-1);
        Assert.Equal(48, rig.Service.Current.VolumePct);
        await h.TapAsync(100, 50);
        Assert.Equal(50, rig.Service.Current.VolumePct);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Volume_key_shows_sign_in_without_a_connection()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        Assert.Equal(SpotifyArt.VolumeKey(Refraction.Night, null, false, "SIGN IN").ToDataUri(), h.LastImage);
        await h.PressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Empty(rig.Http.Seen);
    }

    [Test]
    public async Task Pi_connect_opens_the_authorize_url_and_never_puts_the_client_id_in_settings()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        await h.PropertyInspectorAppearAsync();
        var reply = Assert.NotNull(await h.PiMessageAsync("spotify.connect", new { clientId = Fx.ClientId }, requestId: 7));
        Assert.True(reply["ok"]!.GetValue<bool>(), reply.ToJsonString());
        var open = Assert.Single(h.CallsOf("openUrl")).Payload!["url"]!.GetValue<string>();
        Assert.Contains("https://accounts.spotify.com/authorize?client_id=" + Fx.ClientId, open);
        Assert.Contains("code_challenge_method=S256", open);
        Assert.Equal(0, h.Count("setSettings"), "the Client ID is never written to action settings");
        Assert.True(reply["data"]!["connecting"]!.GetValue<bool>());
        var states = h.CallsOf("sendToPropertyInspector").Select(c => c.Payload!.ToJsonString()).ToList();
        Assert.True(states.Any(s => s.Contains("Waiting for Spotify sign-in", StringComparison.Ordinal)), "live status");
        Assert.True(states.All(s => !s.Contains(Fx.ClientId, StringComparison.Ordinal)), "the PI only ever sees the last 4 characters");
        rig.Service.Auth.CancelPendingConnect();
    }

    [Test]
    public async Task Pi_reports_errors_and_says_spotify_eq_has_no_api()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await ActionHarness<LikeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services);
        var bad = Assert.NotNull(await h.PiMessageAsync("spotify.connect", new { clientId = "" }, requestId: 1));
        Assert.False(bad["ok"]!.GetValue<bool>());
        Assert.Contains("Client ID", bad["error"]!.GetValue<string>());
        var status = Assert.NotNull(await h.PiMessageAsync("spotify.status", null, requestId: 2));
        Assert.Equal("Not connected", status["data"]!["status"]!.GetValue<string>());
        Assert.Contains("no API", status["data"]!["eqNote"]!.GetValue<string>());
        Assert.Contains("Spotify", status["data"]!["attribution"]!.GetValue<string>());
        var hello = Assert.NotNull(await h.PiMessageAsync("pi.ready"));
        Assert.Equal("Not connected", hello["data"]!["state"]!["status"]!.GetValue<string>());
        await h.PiMessageAsync("spotify.anyApp", new { value = true }, requestId: 3);
        Assert.True(rig.Smtc.FollowAnyApp);
        Assert.True(h.GlobalSettings.GetSection<SpotifyGlobalSettings>("spotify").AnyMediaApp);
    }

    [Test]
    public async Task Pi_disconnect_signs_out()
    {
        await using var rig = await Rig.StartAsync();
        await using var h = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Galleon, new(0, 0), configureServices: rig.Services);
        var reply = Assert.NotNull(await h.PiMessageAsync("spotify.disconnect", null, requestId: 4));
        Assert.False(reply["data"]!["connected"]!.GetValue<bool>());
        Assert.Null(rig.Vault.Load(Auth.SpotifyAuth.TokensSecret));
    }
}
