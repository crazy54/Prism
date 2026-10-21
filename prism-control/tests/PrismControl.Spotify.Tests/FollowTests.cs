using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render.Tokens;
using PrismControl.Spotify.Actions;
using PrismControl.Spotify.Render;
using PrismControl.Spotify.Smtc;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

// ---------------------------------------------------------------------------------------------------- port fakes

/// <summary>One scripted Windows media session behind <see cref="ISmtcSessionPort"/>. Commands are recorded, never real.</summary>
public sealed class FakeSmtcSession(string appId, string? appName = null) : ISmtcSessionPort
{
    public string AppId => appId;
    public string AppName => appName ?? MediaAppNames.FromId(appId);
    public PlayState State { get; set; } = PlayState.Paused;
    public string? Title { get; set; } = "Example Video";
    public string? Artist { get; set; } = "Example Channel";
    public string? Album { get; set; }
    public byte[]? Thumbnail { get; set; } = FictionalArt.WidePng;
    public bool CanNext { get; set; } = true;
    public bool CanPrevious { get; set; } = true;
    public readonly List<string> Commands = [];
    public int MediaReads;

    public event EventHandler? MediaChanged;
    public event EventHandler? PlaybackChanged;
    public event EventHandler? TimelineChanged;

    /// <summary>What Windows would report after the app changed state on its own (or after a real command).</summary>
    public void Report(PlayState state)
    {
        State = state;
        PlaybackChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ReportMedia(string title)
    {
        Title = title;
        MediaChanged?.Invoke(this, EventArgs.Empty);
        TimelineChanged?.Invoke(this, EventArgs.Empty);
    }

    public Task<SmtcMediaRead> ReadMediaAsync()
    {
        Interlocked.Increment(ref MediaReads);
        return Task.FromResult(new SmtcMediaRead { Title = Title, Artist = Artist, AlbumTitle = Album, Thumbnail = Thumbnail, ThumbnailMime = Thumbnail is null ? null : "image/png" });
    }

    public SmtcPlaybackRead ReadPlayback() => new()
    {
        State = State, CanPlay = true, CanPause = true, CanNext = CanNext, CanPrevious = CanPrevious, CanSeek = true, CanShuffle = true, CanRepeat = true,
    };

    public SmtcTimelineRead ReadTimeline() =>
        new(TimeSpan.Zero, TimeSpan.FromMinutes(12.5), TimeSpan.FromMinutes(5), new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero));

    private Task<bool> Cmd(string name)
    {
        lock (Commands) Commands.Add(name);
        return Task.FromResult(true);
    }

    public Task<bool> TogglePlayPauseAsync() => Cmd("toggle");
    public Task<bool> PlayAsync() => Cmd("play");
    public Task<bool> PauseAsync() => Cmd("pause");
    public Task<bool> NextAsync() => Cmd("next");
    public Task<bool> PreviousAsync() => Cmd("previous");
    public Task<bool> SeekAsync(TimeSpan position) => Cmd("seek");
    public Task<bool> SetShuffleAsync(bool on) => Cmd("shuffle");
    public Task<bool> SetRepeatAsync(RepeatMode mode) => Cmd("repeat");
}

/// <summary>A scripted session manager: add/remove sessions and set Windows' current one.</summary>
public sealed class FakeSmtcManager : ISmtcManagerPort
{
    private readonly List<FakeSmtcSession> _sessions = [];
    private FakeSmtcSession? _current;

    public event EventHandler? SessionsChanged;
    public event EventHandler? CurrentSessionChanged;

    public IReadOnlyList<ISmtcSessionPort> GetSessions() { lock (_sessions) return [.. _sessions]; }
    public ISmtcSessionPort? GetCurrentSession() => _current;

    public FakeSmtcSession Add(FakeSmtcSession s)
    {
        lock (_sessions) _sessions.Add(s);
        SessionsChanged?.Invoke(this, EventArgs.Empty);
        return s;
    }

    public void Remove(FakeSmtcSession s)
    {
        lock (_sessions) _sessions.Remove(s);
        if (ReferenceEquals(_current, s)) _current = null;
        SessionsChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetCurrent(FakeSmtcSession? s)
    {
        _current = s;
        CurrentSessionChanged?.Invoke(this, EventArgs.Empty);
    }
}

/// <summary>The real <see cref="SmtcSource"/> (and its policy) over a <see cref="FakeSmtcManager"/> and a manual clock.</summary>
public sealed class SmtcRig : IAsyncDisposable
{
    public ManualTimeProvider Time { get; } = new();
    public FakeSmtcManager Manager { get; } = new();
    public CaptureLog Log { get; } = new();
    public SmtcSource Source { get; }
    public readonly List<SmtcChange> Changes = [];

    private SmtcRig() => Source = new SmtcSource(Log, Time, _ => Task.FromResult<ISmtcManagerPort>(Manager));

    public static async Task<SmtcRig> StartAsync(MediaFollow follow = MediaFollow.SpotifyFirst, params FakeSmtcSession[] sessions)
    {
        var rig = Create(follow, sessions);
        await rig.Source.StartAsync(CancellationToken.None);
        return rig;
    }

    /// <summary>A rig whose source is not started yet (a SpotifyService starts it).</summary>
    public static SmtcRig Create(MediaFollow follow = MediaFollow.SpotifyFirst, params FakeSmtcSession[] sessions)
    {
        var rig = new SmtcRig();
        foreach (var s in sessions) rig.Manager.Add(s);
        rig.Source.Follow = follow;
        rig.Source.Changed += (_, c) => { lock (rig.Changes) rig.Changes.Add(c); };
        return rig;
    }

    /// <summary>The app the deck shows ("Spotify", "Chrome"), or null.</summary>
    public string? Shown => Source.Current?.AppName;

    /// <summary>Moves the clock in 100 ms steps, letting each refresh run (debounces fire at 30/150 ms).</summary>
    public async Task PassAsync(double seconds)
    {
        for (var t = 0.0; t < seconds - 1e-9; t += 0.1)
        {
            Time.Advance(TimeSpan.FromMilliseconds(100));
            await Task.Delay(1);
        }
    }

    public int SessionSwitches { get { lock (Changes) return Changes.Count(c => c.HasFlag(SmtcChange.Session)); } }

    public ValueTask DisposeAsync() => Source.DisposeAsync();
}

// ---------------------------------------------------------------------------------------------------- tests

/// <summary>
/// The media follow policy (global <c>spotify."media.follow"</c>) and everything that follows the shown session:
/// the data API snapshot for other apps, streamer-safe, Spotify-only keys, Core's INowPlayingControl transport, safe
/// mode. Fakes only: nothing here controls real playback.
/// </summary>
public class FollowTests
{
    private static FakeSmtcSession Spotify(PlayState state = PlayState.Paused) =>
        new("Spotify.exe") { State = state, Title = "Night Drive", Artist = "The Example Ensemble", Album = "Examples Vol. 1", Thumbnail = FictionalArt.Png300 };

    private static FakeSmtcSession Chrome(PlayState state = PlayState.Paused) => new("Chrome") { State = state };
    private static FakeSmtcSession Edge(PlayState state = PlayState.Paused) => new("MSEdge") { State = state, Title = "Example Podcast", Artist = "Example Host" };

    // ---------------------------------------------------------------- policy

    [Test]
    public async Task Spotify_playing_beats_youtube()
    {
        var chrome = Chrome(PlayState.Playing);
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, Spotify(PlayState.Playing), chrome);
        Assert.Equal("Spotify", rig.Shown);
        Assert.True(rig.Source.Current!.IsSpotify);
        // YouTube restarting (a new video) while Spotify plays never takes over.
        chrome.Report(PlayState.Paused);
        await rig.PassAsync(0.5);
        chrome.Report(PlayState.Playing);
        await rig.PassAsync(5);
        Assert.Equal("Spotify", rig.Shown);
        Assert.Equal(2, rig.Source.Sessions.Count);
        Assert.True(rig.Source.Sessions.Single(s => s.IsSpotify).IsShown);
    }

    [Test]
    public async Task Spotify_paused_and_youtube_playing_shows_youtube_after_the_hold()
    {
        var spotify = Spotify(PlayState.Playing);
        var chrome = Chrome();
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, spotify, chrome);
        Assert.Equal("Spotify", rig.Shown);
        spotify.Report(PlayState.Paused);
        chrome.Report(PlayState.Playing);
        await rig.PassAsync(1.0);
        Assert.Equal("Spotify", rig.Shown, "hysteresis: not before the 1.5 s hold");
        await rig.PassAsync(0.6);
        Assert.Equal("Chrome", rig.Shown);
        var shown = rig.Source.Current!;
        Assert.False(shown.IsSpotify);
        Assert.Equal("Example Video", shown.Title);
        Assert.True(shown.Thumbnail!.AsSpan().SequenceEqual(FictionalArt.WidePng), "the thumbnail exactly as the session gave it");
        Assert.Equal("Night Drive", rig.Source.Spotify!.Title, "Spotify's own session stays tracked in the background");
        Assert.Equal(PlayState.Paused, rig.Source.Spotify.State);
    }

    [Test]
    public async Task Youtube_pauses_and_spotify_plays_brings_spotify_back()
    {
        var spotify = Spotify();
        var chrome = Chrome(PlayState.Playing);
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, spotify, chrome);
        Assert.Equal("Chrome", rig.Shown, "nothing shown yet: the playing app at once");
        var before = rig.SessionSwitches;
        chrome.Report(PlayState.Paused);
        spotify.Report(PlayState.Playing);
        await rig.PassAsync(1.6);
        Assert.Equal("Spotify", rig.Shown);
        Assert.Equal(before + 1, rig.SessionSwitches, "one switch");
    }

    [Test]
    public async Task Hysteresis_keeps_flapping_sessions_from_flickering()
    {
        var spotify = Spotify(PlayState.Playing);
        var chrome = Chrome(PlayState.Playing);
        var edge = Edge();
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, spotify, chrome, edge);
        Assert.Equal("Spotify", rig.Shown);
        var before = rig.SessionSwitches;
        // Spotify's short pause between tracks while a video plays: never a switch.
        for (var i = 0; i < 3; i++)
        {
            spotify.Report(PlayState.Paused);
            await rig.PassAsync(0.4);
            spotify.Report(PlayState.Playing);
            await rig.PassAsync(2);
        }
        Assert.Equal("Spotify", rig.Shown);
        Assert.Equal(before, rig.SessionSwitches);

        // Spotify stops; the video takes over once.
        spotify.Report(PlayState.Paused);
        await rig.PassAsync(2);
        Assert.Equal("Chrome", rig.Shown);
        var afterTakeover = rig.SessionSwitches;
        // A muted autoplay in another app flapping every second never gets the deck.
        for (var i = 0; i < 6; i++)
        {
            edge.Report(PlayState.Playing);
            await rig.PassAsync(1.0);
            edge.Report(PlayState.Paused);
            await rig.PassAsync(1.0);
        }
        Assert.Equal("Chrome", rig.Shown);
        Assert.Equal(afterTakeover, rig.SessionSwitches, "no flicker");
        Assert.Equal(0, edge.MediaReads, "a session that is never shown never has its title or art read");
    }

    [Test]
    public async Task Nothing_playing_keeps_the_last_shown_session()
    {
        var chrome = Chrome(PlayState.Playing);
        var edge = Edge();
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, Spotify(), chrome, edge);
        Assert.Equal("Chrome", rig.Shown);
        edge.Report(PlayState.Playing);   // plays briefly (less than the hold), so it never shows
        await rig.PassAsync(0.8);
        edge.Report(PlayState.Paused);
        chrome.Report(PlayState.Paused);
        await rig.PassAsync(10);
        Assert.Equal("Chrome", rig.Shown, "the last shown stays, paused");
        Assert.Equal(PlayState.Paused, rig.Source.Current!.State);
        // The tab closes: the deck moves to the session seen playing most recently.
        rig.Manager.Remove(chrome);
        await rig.PassAsync(0.2);
        Assert.Equal("Edge", rig.Shown);
    }

    [Test]
    public async Task The_session_the_user_pressed_play_on_is_preferred()
    {
        var chrome = Chrome();
        var edge = Edge();
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, Spotify(), chrome, edge);
        Assert.Equal("Spotify", rig.Shown, "nothing ever played: Spotify first");
        // Show Chrome (it plays for a while), then it pauses.
        chrome.Report(PlayState.Playing);
        await rig.PassAsync(2);
        chrome.Report(PlayState.Paused);
        await rig.PassAsync(1);
        Assert.Equal("Chrome", rig.Shown);
        // The deck's play key on Chrome; then an autoplay starts in Edge before Chrome reports playing.
        Assert.True(await rig.Source.TogglePlayPauseAsync(rig.Source.Current!.Key));
        Assert.Equal("toggle", Assert.Single(chrome.Commands));
        edge.Report(PlayState.Playing);
        await rig.PassAsync(0.3);
        chrome.Report(PlayState.Playing);
        await rig.PassAsync(5);
        Assert.Equal("Chrome", rig.Shown, "the user's pick beats a later autoplay");
        // When the user's video stops, the other playing session gets the deck after the hold.
        chrome.Report(PlayState.Paused);
        await rig.PassAsync(1.6);
        Assert.Equal("Edge", rig.Shown);
        Assert.Empty(edge.Commands);
    }

    [Test]
    public async Task Spotify_only_and_windows_current_modes()
    {
        var chrome = Chrome(PlayState.Playing);
        var spotify = Spotify();
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyOnly, spotify, chrome);
        Assert.Equal("Spotify", rig.Shown, "spotifyOnly: today's behavior, YouTube never shows");
        await rig.PassAsync(3);
        Assert.Equal("Spotify", rig.Shown);
        rig.Manager.Remove(spotify);
        await rig.PassAsync(0.2);
        Assert.Null(rig.Source.Current, "spotifyOnly without a Spotify session shows nothing from SMTC");

        rig.Manager.Add(spotify);
        spotify.Report(PlayState.Playing);
        rig.Manager.SetCurrent(chrome);
        rig.Source.Follow = MediaFollow.Current;
        await rig.PassAsync(0.2);
        Assert.Equal("Chrome", rig.Shown, "current: Windows' own pick, at once, even while Spotify plays");
        rig.Manager.SetCurrent(spotify);
        await rig.PassAsync(0.2);
        Assert.Equal("Spotify", rig.Shown);
        rig.Source.Follow = MediaFollow.SpotifyFirst;
        await rig.PassAsync(0.2);
        Assert.Equal("Spotify", rig.Shown);
    }

    [Test]
    public async Task Spotify_playing_on_another_device_counts_as_spotify_playing()
    {
        var chrome = Chrome(PlayState.Playing);
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, chrome);
        Assert.Equal("Chrome", rig.Shown);
        rig.Source.SpotifyRemote = PlayState.Playing;   // the Web API: playing on a phone
        await rig.PassAsync(1.6);
        Assert.Null(rig.Source.Current, "Spotify wins; with no local session the service shows the Web API state");
        rig.Source.SpotifyRemote = PlayState.Paused;
        await rig.PassAsync(1.6);
        Assert.Equal("Chrome", rig.Shown);
    }

    [Test]
    public async Task Two_sessions_of_one_app_get_their_own_keys()
    {
        var a = Chrome(PlayState.Playing);
        var b = new FakeSmtcSession("Chrome") { Title = "Second Example Video" };
        await using var rig = await SmtcRig.StartAsync(MediaFollow.SpotifyFirst, a, b);
        Assert.Equal("Chrome,Chrome#2", string.Join(',', rig.Source.Sessions.Select(s => s.Key)));
        Assert.True(await rig.Source.NextAsync("Chrome#2"));
        Assert.Empty(a.Commands);
        Assert.Equal("next", Assert.Single(b.Commands));
        Assert.False(await rig.Source.NextAsync("Firefox"), "an unknown session: no command, false");
    }

    // ---------------------------------------------------------------- settings migration

    [Test]
    public void Old_any_media_app_settings_migrate_and_the_new_default_is_spotify_first()
    {
        static MediaFollow Read(string json) => ActionJson.ReadOrDefault<SpotifyGlobalSettings>(JsonNode.Parse(json)).EffectiveFollow;
        Assert.Equal(MediaFollow.SpotifyFirst, Read("{}"), "the new default: YouTube works out of the box");
        Assert.Equal(MediaFollow.SpotifyFirst, new SpotifyGlobalSettings().EffectiveFollow);
        Assert.Equal(MediaFollow.Current, Read("""{"anyMediaApp":true}"""), "old 'any media app' on → current");
        Assert.Equal(MediaFollow.SpotifyFirst, Read("""{"anyMediaApp":false}"""), "old off → the new default");
        Assert.Equal(MediaFollow.SpotifyOnly, Read("""{"anyMediaApp":true,"media.follow":"spotifyOnly"}"""), "an explicit choice wins");
        Assert.Equal(MediaFollow.Current, Read("""{"media.follow":"CURRENT"}"""));
        Assert.Equal(MediaFollow.Current, Read("""{"anyMediaApp":true,"media.follow":"everything"}"""), "unknown values fall back to the migration");
        Assert.Equal(MediaFollow.SpotifyFirst, Read("""{"media.follow":null}"""));
        var written = ActionJson.ToNode(SpotifyGlobalSettings.For(MediaFollow.SpotifyFirst))!.AsObject();
        Assert.Equal("spotifyFirst", written["media.follow"]!.GetValue<string>());
        Assert.False(written["anyMediaApp"]!.GetValue<bool>());
        Assert.True(ActionJson.ToNode(SpotifyGlobalSettings.For(MediaFollow.Current))!["anyMediaApp"]!.GetValue<bool>(), "kept in step for older builds");
    }

    // ---------------------------------------------------------------- the snapshot for another app

    private static SmtcSnapshot Video(PlayState state = PlayState.Playing, bool canNext = true) => new()
    {
        AppId = "Chrome", SessionKey = "Chrome", IsSpotify = false, AppName = "Chrome", State = state,
        Title = "Example Video: A Walk Through the Demo City", Artist = "Example Channel",
        Duration = TimeSpan.FromMinutes(12.5), Position = TimeSpan.FromMinutes(5), PositionAt = new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero),
        Thumbnail = FictionalArt.WidePng, ThumbnailMime = "image/png", ThumbnailHash = SmtcSource.Hash(FictionalArt.WidePng),
        CanPlay = true, CanPause = true, CanNext = canNext, CanPrevious = true, CanSeek = true,
    };

    [Test]
    public async Task Another_apps_session_publishes_as_smtc_with_its_art_as_given_and_no_spotify_fields()
    {
        await using var rig = await Rig.StartAsync(configure: r => { r.PlayerJson = () => Fx.Player(playing: false, local: false); r.Liked = true; });
        var registry = new DataRegistry(rig.Time);
        rig.Service.AttachPublishers(registry.NowPlaying.Claim("spotify", TimeSpan.Zero), registry.NowPlayingArt.Claim("spotify"));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await Fx.WaitUntil(() => rig.Service.SpotifyCurrent.Liked == true && rig.Service.SpotifyCurrent.Art is not null, "Spotify's state in the background");
        rig.Smtc.Set(Video(), spotify: null);
        await Fx.WaitUntil(() => registry.NowPlaying.Current?.App == "Chrome" && registry.NowPlaying.Current.Art is not null, "the video published");

        var np = registry.NowPlaying.Current!;
        Assert.Equal("smtc", np.Source);
        Assert.Equal("Chrome", np.App, "the friendly name, never a path");
        Assert.Equal("playing", np.State);
        Assert.Equal("Example Video: A Walk Through the Demo City", np.Track!.Title);
        Assert.Equal("Example Channel", Assert.Single(np.Track.Artists));
        Assert.Null(np.Track.Album);
        Assert.Null(np.Track.Uri);
        Assert.Null(np.Track.Url);
        Assert.Equal(750_000L, np.Track.DurationMs);
        Assert.Null(np.Liked, "Spotify-only fields stay null for another app");
        Assert.Null(np.ContextName);
        Assert.Null(np.VolumePct);
        Assert.Equal(400, np.Art!.Width);
        Assert.Equal(240, np.Art.Height);
        var art = Assert.NotNull(await registry.NowPlayingArt.ReadAsync(CancellationToken.None));
        Assert.True(art.Body.AsSpan().SequenceEqual(FictionalArt.WidePng), "art bytes exactly as the session gave them");
        Assert.Equal("image/png", art.ContentType);

        var shown = rig.Service.Current;
        Assert.True(shown.IsOtherApp);
        var display = Assert.NotNull(Core.Render.ImageInfo.Probe(shown.Art!.Display));
        Assert.Near(400.0 / 240, (double)display.Width / display.Height, 0.03, "the frame copy is resized whole, never cropped");
        Assert.Equal("Night Drive", rig.Service.SpotifyCurrent.Title, "Spotify's state is kept for the Spotify-only keys");
        Assert.Equal(62, rig.Service.SpotifyCurrent.VolumePct);
        Assert.Equal(PlayState.Paused, rig.Smtc.SpotifyRemote, "the policy hears Spotify's remote state");
        Assert.False(rig.Http.Api.Any(r => r.Method != HttpMethod.Get), "the Web API stays Spotify-only: nothing sent for the video");
    }

    [Test]
    public async Task Streamer_safe_hides_another_apps_title_artist_album_and_art_but_not_spotifys()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        var registry = new DataRegistry(rig.Time);
        rig.Service.AttachPublishers(registry.NowPlaying.Claim("spotify", TimeSpan.Zero), registry.NowPlayingArt.Claim("spotify"));
        rig.Service.StreamerSafe = true;
        rig.Smtc.Set(Video() with { Album = "Example Playlist" });
        await Fx.WaitUntil(() => registry.NowPlaying.Current?.App == "Chrome", "published");
        await Task.Delay(50);   // let the art load try to land: it must not be published
        var np = registry.NowPlaying.Current!;
        Assert.Equal("playing", np.State);
        Assert.Equal("", np.Track!.Title, "something is loaded, its title withheld");
        Assert.Empty(np.Track.Artists);
        Assert.Null(np.Track.Album);
        Assert.Equal(750_000L, np.Track.DurationMs, "numbers stay");
        Assert.Null(np.Art);
        Assert.False(registry.NowPlayingArt.HasData, "no thumbnail either");

        var snap = rig.Service.Current;
        Assert.True(snap.Private);
        Assert.Null(snap.Title);
        Assert.Null(snap.Art);
        await using var key = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        Assert.Equal(SpotifyArt.GlyphKey(Refraction.Night, Core.Art.Glyphs.MusicNote, "CHROME", on: true).ToDataUri(), key.LastImage, "the app name only");
        await using var dial = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: rig.Services);
        Assert.DoesNotContain("<image", dial.FeedbackSvg(Layouts.Canvas.Frame), "no artwork on the dial");
        dial.AssertFramesAreDeckSafe();

        // Spotify's own track is not hidden (only other apps' titles can be private tab titles).
        rig.Smtc.Set(Fx.SmtcSpotify());
        await Fx.WaitUntil(() => registry.NowPlaying.Current?.Track?.Title == "Night Drive", "Spotify visible");
        rig.Service.StreamerSafe = false;
        rig.Smtc.Set(Video());
        await Fx.WaitUntil(() => registry.NowPlaying.Current?.Track?.Title == "Example Video: A Walk Through the Demo City", "visible again when off");
    }

    // ---------------------------------------------------------------- keys

    [Test]
    public async Task Spotify_only_keys_keep_showing_and_controlling_spotify_while_youtube_is_shown()
    {
        await using var rig = await Rig.StartAsync(configure: r => { r.PlayerJson = () => Fx.Player(playing: false, local: false, shuffle: true); r.Liked = true; });
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        await Fx.WaitUntil(() => rig.Service.SpotifyCurrent.Liked == true, "liked state");
        rig.Smtc.Set(Video(), spotify: null);
        Assert.Equal("Chrome", rig.Service.Current.AppName);
        var d = TestDevices.Galleon;
        await using var like = await ActionHarness<LikeAction>.AppearAsync(d, new(0, 0), configureServices: rig.Services);
        await using var shuffle = await ActionHarness<ShuffleAction>.AppearAsync(d, new(1, 0), configureServices: rig.Services);
        await using var repeat = await ActionHarness<RepeatAction>.AppearAsync(d, new(2, 0), configureServices: rig.Services);
        await using var volume = await ActionHarness<VolumeAction>.AppearAsync(d, new(0, 1), Controller.Keypad, configureServices: rig.Services);
        await using var play = await ActionHarness<PlayPauseAction>.AppearAsync(d, new(1, 1), configureServices: rig.Services);
        await using var next = await ActionHarness<NextAction>.AppearAsync(d, new(2, 1), configureServices: rig.Services);

        var t = Refraction.Night;
        Assert.Equal(SpotifyArt.LikeKey(t, true, true, "SPOTIFY").ToDataUri(), like.LastImage, "Spotify's heart, calmly labeled");
        Assert.Equal(SpotifyArt.ShuffleKey(t, true, true, "SPOTIFY").ToDataUri(), shuffle.LastImage);
        Assert.Equal(SpotifyArt.RepeatKey(t, RepeatMode.Off, true, "SPOTIFY").ToDataUri(), repeat.LastImage);
        Assert.Equal(SpotifyArt.VolumeKey(t, 62, true, caption: "SPOTIFY").ToDataUri(), volume.LastImage);
        Assert.Equal(SpotifyArt.TransportKey(t, TransportGlyph.PlayPause, true, true, "CHROME").ToDataUri(), play.LastImage, "transport names the app it follows");
        Assert.Equal(SpotifyArt.TransportKey(t, TransportGlyph.Next, true, true, "CHROME").ToDataUri(), next.LastImage);

        await like.PressAsync();
        await Fx.WaitUntil(() => rig.Http.Api.Any(r => r.Method == HttpMethod.Delete && r.Path == "/v1/me/library"), "unlike Spotify's track");
        Assert.Contains("4exampletrack00000001b", rig.Http.Api.Last(r => r.Path == "/v1/me/library").Query, "Spotify's track, not the video");
        await shuffle.PressAsync();
        await Fx.WaitUntil(() => rig.Http.Api.Any(r => r.Path == "/v1/me/player/shuffle"), "Spotify's shuffle");
        Assert.Contains("state=false", rig.Http.Api.Last(r => r.Path == "/v1/me/player/shuffle").Query);
        await play.PressAsync();
        await next.PressAsync();
        Assert.Equal("toggle@Chrome,next@Chrome", string.Join(',', rig.Smtc.Commands), "transport went to the video, nothing else to SMTC");
        Assert.False(rig.Http.Api.Any(r => r.Path is "/v1/me/player/pause" or "/v1/me/player/play" or "/v1/me/player/next"), "and not to Spotify");
        Assert.Equal(0, like.Count("showAlert") + shuffle.Count("showAlert") + play.Count("showAlert"));
        like.AssertFramesAreDeckSafe();
        play.AssertFramesAreDeckSafe();

        // Seeking is Spotify's only: a calm notice on the dial, no command anywhere.
        await using var dial = await ActionHarness<NowPlayingAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: rig.Services);
        await dial.RotateAsync(1);
        await dial.AdvanceAsync(TimeSpan.FromMilliseconds(400));
        Assert.False(rig.Http.Api.Any(r => r.Path == "/v1/me/player/seek"));
        Assert.Equal(2, rig.Smtc.Commands.Count);
        dial.AssertFramesAreDeckSafe();
    }

    // ---------------------------------------------------------------- INowPlayingControl

    [Test]
    public async Task Now_playing_control_play_pause_next_previous_follow_the_shown_session()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.PlayerJson = () => Fx.Player(local: false));
        await rig.Service.PollOnceAsync(RequestPriority.Poll);
        INowPlayingControl control = new SpotifyNowPlayingControl(rig.Service);

        // Spotify on another device is shown: the Web API with that device.
        Assert.True(control.Next().Ok);
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Post, "/v1/me/player/next") == 1, "Spotify skip");
        Assert.Contains("device_id=" + Fx.RemoteDeviceId, rig.Http.Api.Last(r => r.Path == "/v1/me/player/next").Query);

        // A video is shown: SMTC on its session, never the Web API.
        rig.Smtc.Set(Video(canNext: false), spotify: null);
        Assert.True(control.PlayPause().Ok);
        Assert.True(control.Previous().Ok);
        await Fx.WaitUntil(() => rig.Smtc.Commands.Count == 2, "two SMTC commands");
        Assert.Equal("toggle@Chrome,previous@Chrome", string.Join(',', rig.Smtc.Commands));
        var next = control.Next();
        Assert.False(next.Ok, "the video's player has no next");
        Assert.Equal("Chrome can't skip", next.Message);
        Assert.Equal(2, rig.Smtc.Commands.Count);
        Assert.Equal(1, rig.Http.Count(HttpMethod.Post, "/v1/me/player/next"));
        Assert.Equal(0, rig.Http.Count(HttpMethod.Put, "/v1/me/player/pause"));

        // Volume and seek stay Spotify-only.
        Assert.True(control.AdjustVolume(+4).Ok, "Spotify's device volume, whatever is shown");
        await Fx.WaitUntil(() => rig.Http.Count(HttpMethod.Put, "/v1/me/player/volume") == 1, "Spotify volume");
        var seek = control.SeekBy(TimeSpan.FromSeconds(10));
        Assert.False(seek.Ok);
        Assert.Equal(SpotifyText.SeekSpotifyOnly, seek.Message);
    }

    [Test]
    public async Task Now_playing_control_says_why_when_there_is_nothing_to_control()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        INowPlayingControl control = new SpotifyNowPlayingControl(rig.Service);
        var r = control.PlayPause();
        Assert.False(r.Ok);
        Assert.Equal(SpotifyText.OpenSpotify, r.Message);
        Assert.False(control.Next().Ok);
        Assert.Empty(rig.Smtc.Commands);
        Assert.Empty(rig.Http.Seen);
    }

    [Test]
    public void Older_now_playing_controls_compile_and_answer_not_supported()
    {
        INowPlayingControl old = new MinimalControl();
        Assert.False(old.PlayPause().Ok);
        Assert.False(old.Next().Ok);
        Assert.False(old.Previous().Ok);
        Assert.True(!string.IsNullOrWhiteSpace(old.Previous().Message));
    }

    private sealed class MinimalControl : INowPlayingControl
    {
        public string Source => "demo";
        public NowPlayingCommandResult SetVolume(int percent) => NowPlayingCommandResult.Success;
        public NowPlayingCommandResult AdjustVolume(int delta) => NowPlayingCommandResult.Success;
        public NowPlayingCommandResult ToggleMute() => NowPlayingCommandResult.Success;
        public NowPlayingCommandResult SeekBy(TimeSpan delta) => NowPlayingCommandResult.Success;
    }

    // ---------------------------------------------------------------- safe mode and end to end

    /// <summary>The real SmtcSource (policy and all) over fake sessions, inside a real SpotifyService.</summary>
    private static async Task<(SpotifyService Service, SmtcRig Smtc)> ServiceOverRealSourceAsync(bool safeMode, params FakeSmtcSession[] sessions)
    {
        var smtc = SmtcRig.Create(MediaFollow.SpotifyFirst, sessions);
        var service = new SpotifyService(smtc.Source, new MemoryVault(), smtc.Time, smtc.Log, new FakeHttp(), new SpotifyServiceOptions
        {
            SafeMode = safeMode, MachineName = "EXAMPLE-PC", LaunchUri = _ => false,
        });
        await service.StartAsync(CancellationToken.None);
        return (service, smtc);
    }

    [Test]
    public async Task End_to_end_youtube_shows_and_its_transport_goes_to_its_own_session()
    {
        var spotify = Spotify();
        var chrome = Chrome(PlayState.Playing);
        var (svc, smtc) = await ServiceOverRealSourceAsync(false, spotify, chrome);
        await using var _ = smtc;
        await using var __ = svc;
        await Fx.WaitUntil(() => svc.Current.AppName == "Chrome", "the playing video shows (Spotify is paused)");
        Assert.Equal("Night Drive", svc.SpotifyCurrent.Title);
        Assert.True((await svc.NextAsync()).Ok);
        Assert.True((await svc.TogglePlayPauseAsync()).Ok);
        Assert.Equal("next,toggle", string.Join(',', chrome.Commands));
        Assert.Empty(spotify.Commands);
        Assert.True((await svc.ToggleShuffleAsync()).Ok, "signed out, Spotify's own session takes Spotify-only commands");
        Assert.Equal("shuffle", Assert.Single(spotify.Commands));
        Assert.Equal(2, chrome.Commands.Count);
    }

    [Test]
    public async Task Safe_mode_gates_other_apps_transport_exactly_like_spotifys()
    {
        var spotify = Spotify();
        var chrome = Chrome(PlayState.Playing);
        var (svc, smtc) = await ServiceOverRealSourceAsync(true, spotify, chrome);
        await using var _ = smtc;
        await using var __ = svc;
        await Fx.WaitUntil(() => svc.Current.AppName == "Chrome", "video shown");
        INowPlayingControl control = new SpotifyNowPlayingControl(svc);

        Assert.True((await svc.TogglePlayPauseAsync()).Ok);
        Assert.Equal(PlayState.Paused, svc.Current.State, "the fake state shows the press");
        Assert.True(control.Next().Ok);
        Assert.True(control.Previous().Ok);
        await Fx.WaitUntil(() => svc.SafeModeWrites.Count("smtc next") == 1 && svc.SafeModeWrites.Count("smtc previous") == 1, "suppressed");
        Assert.True((await svc.ToggleShuffleAsync()).Ok);
        Assert.Empty(chrome.Commands, "nothing reached the browser's session");
        Assert.Empty(spotify.Commands, "nor Spotify's");
        Assert.Equal(1, svc.SafeModeWrites.Count("smtc toggle"));
        Assert.Equal(1, svc.SafeModeWrites.Count("smtc shuffle"));
        Assert.Equal(PlayState.Playing, smtc.Source.Current!.State, "the real session never changed");
        Assert.Equal("Chrome", svc.Current.AppName, "and the policy, reading real state, kept showing it");
    }

    // ---------------------------------------------------------------- read-only probe

    /// <summary>
    /// READ-ONLY probe of this PC: lists every media session Windows has (app names and states only, no titles) and
    /// what each follow mode would show. Commands are impossible: the probe wraps every session in a guard whose
    /// command methods record the attempt and never call Windows, and asserts none was attempted.
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Probe_lists_the_media_sessions_on_this_pc_read_only()
    {
        var guard = new ReadOnlySmtcGuard();
        var log = new CaptureLog();
        await using var smtc = new SmtcSource(log, connect: async ct => guard.Wrap(await WinRtSmtcManager.RequestAsync(ct)));
        await smtc.StartAsync(CancellationToken.None);
        await Task.Delay(400);
        var sessions = smtc.Sessions;
        Console.WriteLine($"     {sessions.Count} media session(s):");
        foreach (var s in sessions)
            Console.WriteLine($"       {s.AppName,-14} id '{s.AppId}', {s.State}{(s.IsSpotify ? ", Spotify" : "")}{(s.IsWindowsCurrent ? ", Windows' current" : "")}{(s.IsShown ? ", shown" : "")}");
        foreach (var mode in new[] { MediaFollow.SpotifyFirst, MediaFollow.SpotifyOnly, MediaFollow.Current })
        {
            smtc.Follow = mode;
            await Task.Delay(200);
            var c = smtc.Current;
            Console.WriteLine($"     {MediaFollowModes.Wire(mode),-12} shows {(c is null ? "nothing" : c.AppName + " (" + c.State + ")")}" +
                $"{(c is { Thumbnail: { } th } ? $", art {th.Length} bytes {c.ThumbnailMime}" : "")}");
            if (c is not null) Assert.DoesNotContain("\\", c.AppName, "a friendly name, never a path");
        }
        Assert.Empty(guard.Attempts, "no transport was ever sent");
        if (sessions.Count == 0) throw new SkipException("no media sessions on this PC right now");
    }
}

/// <summary>Wraps the real manager: reads and events pass through; every command is recorded and refused (never reaches Windows).</summary>
internal sealed class ReadOnlySmtcGuard
{
    public readonly List<string> Attempts = [];
    public ISmtcManagerPort Wrap(ISmtcManagerPort inner) => new Manager(inner, this);

    private sealed class Manager(ISmtcManagerPort inner, ReadOnlySmtcGuard owner) : ISmtcManagerPort
    {
        private readonly Dictionary<ISmtcSessionPort, Session> _wrapped = new(ReferenceEqualityComparer.Instance);
        public IReadOnlyList<ISmtcSessionPort> GetSessions() { lock (_wrapped) return [.. inner.GetSessions().Select(Get)]; }
        public ISmtcSessionPort? GetCurrentSession() { var c = inner.GetCurrentSession(); lock (_wrapped) return c is null ? null : Get(c); }
        private Session Get(ISmtcSessionPort s) => _wrapped.TryGetValue(s, out var w) ? w : _wrapped[s] = new Session(s, owner);
        public event EventHandler? SessionsChanged { add => inner.SessionsChanged += value; remove => inner.SessionsChanged -= value; }
        public event EventHandler? CurrentSessionChanged { add => inner.CurrentSessionChanged += value; remove => inner.CurrentSessionChanged -= value; }
    }

    private sealed class Session(ISmtcSessionPort inner, ReadOnlySmtcGuard owner) : ISmtcSessionPort
    {
        public string AppId => inner.AppId;
        public string AppName => inner.AppName;
        public Task<SmtcMediaRead> ReadMediaAsync() => inner.ReadMediaAsync();
        public SmtcPlaybackRead ReadPlayback() => inner.ReadPlayback();
        public SmtcTimelineRead ReadTimeline() => inner.ReadTimeline();
        public event EventHandler? MediaChanged { add => inner.MediaChanged += value; remove => inner.MediaChanged -= value; }
        public event EventHandler? PlaybackChanged { add => inner.PlaybackChanged += value; remove => inner.PlaybackChanged -= value; }
        public event EventHandler? TimelineChanged { add => inner.TimelineChanged += value; remove => inner.TimelineChanged -= value; }
        private Task<bool> Refuse(string what) { lock (owner.Attempts) owner.Attempts.Add(what); return Task.FromResult(false); }
        public Task<bool> TogglePlayPauseAsync() => Refuse("toggle");
        public Task<bool> PlayAsync() => Refuse("play");
        public Task<bool> PauseAsync() => Refuse("pause");
        public Task<bool> NextAsync() => Refuse("next");
        public Task<bool> PreviousAsync() => Refuse("previous");
        public Task<bool> SeekAsync(TimeSpan position) => Refuse("seek");
        public Task<bool> SetShuffleAsync(bool on) => Refuse("shuffle");
        public Task<bool> SetRepeatAsync(RepeatMode mode) => Refuse("repeat");
    }
}
