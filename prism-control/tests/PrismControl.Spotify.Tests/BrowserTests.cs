using System.Text.Json;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Browser;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class BrowserTests
{
    private static async Task<ActionHarness<PlaylistBrowserAction>> AppearAsync(Rig rig, DeviceInfo device, Coordinates at)
    {
        var h = await ActionHarness<PlaylistBrowserAction>.AppearAsync(device, at, Controller.Encoder, configureServices: rig.Services);
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        return h;
    }

    /// <summary>Lets background page loads, cover downloads and play commands finish and their Posts run.</summary>
    private static async Task DrainAsync(ActionHarness<PlaylistBrowserAction> h)
    {
        for (var i = 0; i < 8; i++)
        {
            await h.Action.PendingAsync();
            await Task.Delay(5);
            await h.SettleAsync();
        }
    }

    private static JsonElement LastPlayBody(Rig rig) =>
        JsonDocument.Parse(rig.Http.Api.Last(r => r.Path == "/v1/me/player/play").Body!).RootElement;

    private static int PlaylistPageRequests(Rig rig, int offset) =>
        rig.Http.Api.Count(r => r.Path == "/v1/me/playlists" && r.Query.Contains($"offset={offset}", StringComparison.Ordinal));

    [Test]
    public async Task Galleon_push_browse_open_and_play_a_track_in_its_playlist()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        Assert.False(h.Action.IsBrowsing);
        Assert.Equal(0, PlaylistPageRequests(rig, 0), "nothing is fetched until the user pushes");

        // 1. Push: the browser opens on the playlists.
        await h.DialPressAsync();
        await DrainAsync(h);
        var m = h.Action.Model;
        Assert.True(h.Action.IsBrowsing);
        Assert.Equal(BrowserLevel.Playlists, m.Level);
        Assert.Equal(120, m.Total);
        Assert.Equal("Night Drive Mix", m.Current.Title);
        Assert.Equal("1 / 120", m.PositionLabel);

        // 2. Turn to a playlist.
        await h.RotateAsync(2);
        Assert.Equal("Focus Beats", m.Current.Title);
        Assert.Equal("3 / 120", m.PositionLabel);

        // 3. Push: open it; the highlight starts on its first track.
        await h.DialPressAsync();
        await DrainAsync(h);
        Assert.Equal(BrowserLevel.Tracks, m.Level);
        Assert.Equal(RowKind.Track, m.Current.Kind);
        Assert.Equal("Night Drive", m.Current.Title);
        Assert.Equal("1 / 12", m.PositionLabel);
        Assert.Equal(1, rig.Http.Api.Count(r => r.Path == $"/v1/playlists/{Fx.PlaylistId(2)}/items"));

        // 4. Turn to a track and push: it plays in the playlist's context, and the list stays open.
        await h.RotateAsync(1);
        Assert.Equal("Example Song 2", m.Current.Title);
        await h.DialPressAsync();
        await DrainAsync(h);
        var body = LastPlayBody(rig);
        Assert.Equal(Fx.PlaylistUri(2), body.GetProperty("context_uri").GetString());
        Assert.Equal(1, body.GetProperty("offset").GetProperty("position").GetInt32());
        Assert.Equal(0, body.GetProperty("position_ms").GetInt32());
        Assert.Equal(BrowserLevel.Tracks, m.Level);

        // 5. "Back" is the first row: a fast left spin reaches it; push returns to the playlist we came from.
        await h.RotateAsync(-12);
        Assert.Equal(RowKind.Back, m.Current.Kind);
        await h.DialPressAsync();
        Assert.Equal(BrowserLevel.Playlists, m.Level);
        Assert.Equal("Focus Beats", m.Current.Title);

        // 6. Row 0 of the playlists leaves the browser.
        await h.RotateAsync(-12);
        Assert.Equal(RowKind.NowPlaying, m.Current.Kind);
        await h.DialPressAsync();
        Assert.False(h.Action.IsBrowsing);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_flow_with_touch_tap_long_touch_and_dial_hold_back()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Plus, new(1, 0));
        var trig = h.CallsOf("setTriggerDescription").Last().Payload!;
        Assert.Equal("Back", trig["longTouch"]!.GetValue<string>());

        await h.TapAsync(100, 50);                       // tap = push: open the browser
        await DrainAsync(h);
        var m = h.Action.Model;
        Assert.True(h.Action.IsBrowsing);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal("Focus Beats", m.Current.Title);
        await h.DialPressAsync();                        // open
        await DrainAsync(h);
        await h.RotateAsync(4);
        Assert.Equal("Example Song 5", m.Current.Title);
        await h.DialPressAsync();                        // play track #5 (row index 4)
        await DrainAsync(h);
        Assert.Equal(4, LastPlayBody(rig).GetProperty("offset").GetProperty("position").GetInt32());

        await h.TapAsync(20, 20, hold: true);            // long touch = back
        Assert.Equal(BrowserLevel.Playlists, m.Level);
        Assert.Equal("Focus Beats", m.Current.Title);
        await h.DialPressAsync();                        // open again
        await DrainAsync(h);
        Assert.Equal(BrowserLevel.Tracks, m.Level);
        await h.DialPressAsync(TimeSpan.FromMilliseconds(800));   // dial hold = back (Stream Deck + only)
        Assert.Equal(BrowserLevel.Playlists, m.Level);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Galleon_long_hold_is_just_a_press_never_back()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 1));
        await h.DialPressAsync();
        await DrainAsync(h);
        await h.DialPressAsync(TimeSpan.FromSeconds(5));
        await DrainAsync(h);
        Assert.Equal(BrowserLevel.Tracks, h.Action.Model.Level, "the hold opened the playlist like a short push");
        var trig = h.CallsOf("setTriggerDescription").Last().Payload!;
        Assert.Null(trig["longTouch"]);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Galleon_spins_jump_further_and_stop_at_the_ends()
    {
        Assert.Equal(1, BrowserModel.RowsForTicks(1));
        Assert.Equal(3, BrowserModel.RowsForTicks(3));
        Assert.Equal(9, BrowserModel.RowsForTicks(6));
        Assert.Equal(36, BrowserModel.RowsForTicks(12));
        Assert.Equal(-36, BrowserModel.RowsForTicks(-12));

        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 30));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(1, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        var m = h.Action.Model;
        Assert.Equal("31 / 120", m.PositionLabel, "opens on the playlist that is playing");
        for (var i = 0; i < 3; i++) await h.RotateAsync(12);
        Assert.Equal("120 / 120", m.PositionLabel, "stops at the end (no wrap)");
        for (var i = 0; i < 6; i++) await h.RotateAsync(-12);
        Assert.Equal(RowKind.NowPlaying, m.Current.Kind, "stops at the top row");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Plus_fast_turns_accelerate()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Plus, new(0, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        var m = h.Action.Model;
        for (var i = 0; i < 4; i++) await h.RotateAsync(1);   // 4 events in a burst: 1 row each
        Assert.Equal(5, m.Highlight);
        await h.RotateAsync(1);                               // the 5th within 250 ms: ×3
        Assert.Equal(8, m.Highlight);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(400));
        await h.RotateAsync(1);
        Assert.Equal(9, m.Highlight, "slow turns are row by row again");
    }

    [Test]
    public async Task Pages_load_lazily_one_page_ahead_near_the_end()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 0));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        var m = h.Action.Model;
        Assert.Equal(1, PlaylistPageRequests(rig, 0));
        Assert.Equal(0, PlaylistPageRequests(rig, 50));
        await h.RotateAsync(12);                    // row 37 (playlist 37): not near the end of page 0
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        await DrainAsync(h);
        Assert.Equal(0, PlaylistPageRequests(rig, 50));
        await h.RotateAsync(4);                     // playlist 41: within 10 rows of page 0's end
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        await DrainAsync(h);
        Assert.Equal(1, PlaylistPageRequests(rig, 50));
        Assert.Equal(0, PlaylistPageRequests(rig, 100), "never more than one page ahead");
        await h.RotateAsync(12);
        await h.RotateAsync(12);                    // playlist 113: page 2, loaded after the highlight settles
        Assert.Equal(RowKind.Loading, m.Current.Kind);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        await DrainAsync(h);
        Assert.Equal(1, PlaylistPageRequests(rig, 100));
        Assert.Equal("Example Mix 113", m.Current.Title);
        Assert.Equal("113 / 120", m.PositionLabel);
        // Covers: the focused one at 128 px after the settle; neighbours as 60/64 px thumbnails.
        Assert.True(rig.Http.Seen.Any(r => r.Host == "mosaic.scdn.co" && r.Path.StartsWith("/300/", StringComparison.Ordinal)), "focused cover");
        Assert.True(rig.Http.Seen.Any(r => r.Host == "mosaic.scdn.co" && r.Path.StartsWith("/60/", StringComparison.Ordinal)), "row thumbnails");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Playlists_we_dont_own_offer_play_and_shuffle_play()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        var m = h.Action.Model;
        await h.RotateAsync(3);
        Assert.Equal("Rainy Day", m.Current.Title);                 // playlist 3 is followed, not owned
        await h.DialPressAsync();
        await DrainAsync(h);
        Assert.True(m.NotOwned);
        Assert.Equal(3, m.RowCount, "Back, Play playlist, Shuffle play");
        Assert.Equal(RowKind.PlayAll, m.Current.Kind);
        await h.DialPressAsync();
        await DrainAsync(h);
        var body = LastPlayBody(rig);
        Assert.Equal(Fx.PlaylistUri(3), body.GetProperty("context_uri").GetString());
        Assert.False(body.TryGetProperty("offset", out _), "plays from the top");
        await h.RotateAsync(1);
        Assert.Equal(RowKind.ShufflePlay, m.Current.Kind);
        await h.DialPressAsync();
        await DrainAsync(h);
        var puts = rig.Http.Api.Where(r => r.Method == HttpMethod.Put).Select(r => r.Path + r.Query.Split('&')[0]).ToList();
        Assert.Equal("/v1/me/player/shuffle?state=true", puts[^2]);
        Assert.Equal("/v1/me/player/play", puts[^1]);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Local_files_stay_in_the_list_but_cannot_be_played()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(1, 1));
        await h.DialPressAsync();
        await DrainAsync(h);
        await h.DialPressAsync();                                   // open "Night Drive Mix"
        await DrainAsync(h);
        await h.RotateAsync(4);
        await h.RotateAsync(1);
        var m = h.Action.Model;
        Assert.Equal("Demo Take", m.Current.Title);
        Assert.Equal("6 / 48", m.PositionLabel);
        await h.DialPressAsync();
        await DrainAsync(h);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.False(rig.Http.Api.Any(r => r.Path == "/v1/me/player/play"));
    }

    [Test]
    public async Task Twenty_seconds_idle_returns_to_now_playing_and_resumes_within_5_minutes()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        await h.RotateAsync(4);
        var m = h.Action.Model;
        Assert.Equal("Morning Coffee", m.Current.Title);
        await h.AdvanceAsync(TimeSpan.FromSeconds(21));
        Assert.False(h.Action.IsBrowsing, "back to the now-playing view");
        Assert.Contains("<image", h.FeedbackSvg(Layouts.Canvas.Frame), "now playing art is shown again");
        await h.DialPressAsync();
        await DrainAsync(h);
        Assert.Equal("Morning Coffee", m.Current.Title, "resumes where it was");
        await h.AdvanceAsync(TimeSpan.FromSeconds(21));
        await h.AdvanceAsync(TimeSpan.FromMinutes(6));
        await h.DialPressAsync();
        await DrainAsync(h);
        Assert.Equal("Night Drive Mix", m.Current.Title, "after 5 minutes it starts over");
    }

    [Test]
    public async Task Frames_stay_at_or_under_30_hz_while_turning()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false, contextPlaylist: 99));
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        await h.DialPressAsync();
        await DrainAsync(h);
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
        var before = h.Count("setFeedback");
        for (var i = 0; i < 100; i++)
        {
            await h.RotateAsync(i % 2 == 0 ? 1 : -1);
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(5));
        }
        var frames = h.Count("setFeedback") - before;
        Assert.InRange(frames, 5, 17);   // 500 ms of turning at ≤ 30 Hz
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Signed_out_push_alerts_and_points_to_the_settings()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        await using var h = await AppearAsync(rig, TestDevices.Galleon, new(0, 0));
        await h.DialPressAsync();
        Assert.Equal(1, h.Count("showAlert"));
        Assert.False(h.Action.IsBrowsing);
        await h.RotateAsync(3);
        Assert.False(h.Action.IsBrowsing);
        Assert.Empty(rig.Http.Seen);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Browser_frames_are_deck_safe_in_every_state_on_both_layouts()
    {
        var p = PlaylistLibrary.ToEntry(JsonSerializer.Deserialize(Fx.PlaylistJson(0).ToJsonString(), Web.SpotifyJsonContext.Default.PlaylistDto)!);
        var m = new BrowserModel();
        foreach (var t in new[] { Core.Render.Tokens.Refraction.Night, Core.Render.Tokens.Refraction.Day })
        {
            Check(Render.SpotifyArt.BrowserGalleon(t, m, (_, _) => null, true));
            Check(Render.SpotifyArt.BrowserPlus(t, m, (_, _) => null, true));
            m.AddPlaylists(new PageResult<PlaylistEntry>(0, 1, [p]));
            Check(Render.SpotifyArt.BrowserGalleon(t, m, (_, _) => null, false));
            Check(Render.SpotifyArt.BrowserPlus(t, m, (_, _) => null, false));
            m.OpenPlaylist(p, canList: false);
            Check(Render.SpotifyArt.BrowserGalleon(t, m, (_, _) => null, false));
            Check(Render.SpotifyArt.BrowserPlus(t, m, (_, _) => null, false, new Render.FrameNotice("Couldn't play that", true)));
            m.Reset(dropData: true);
        }

        static void Check(Core.Render.SvgDocument d)
        {
            var errors = Core.Render.SvgLint.Check(d.ToSvg(), Core.Render.SvgCanvas.Dial).Where(i => i.Severity == Core.Render.LintSeverity.Error).ToList();
            Assert.Empty(errors);
            Assert.True(d.ElementCount < 120, $"{d.ElementCount} elements");
        }
    }
}
