using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Smtc;
using PrismControl.Browser.State;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Render;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>
/// One fictional world full of secrets. Two worlds differ ONLY in their secrets (titles, URLs, domains, media metadata,
/// group titles, file names, favicons, artwork, the SMTC session, the preview frame); everything streamer-safe may show
/// (ids, states, unread counts, progress) is the same. If no secret reaches a key, both worlds render identical frames.
/// </summary>
internal sealed class SecretWorld
{
    /// <summary>A minimal JPEG (SOI, SOF0 with the size, a few bytes, EOI): what preview frames must be.</summary>
    public static byte[] Jpeg(int w, int h, byte seed) =>
    [
        0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(h >> 8), (byte)h, (byte)(w >> 8), (byte)w, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        .. Enumerable.Range(0, 96).Select(i => (byte)(seed + i * 7)), 0xFF, 0xD9,
    ];

    public required string Word { get; init; }
    public required byte[][] Favicons { get; init; }
    public required byte[] Art { get; init; }
    public required byte[] SmtcThumb { get; init; }
    public required byte[] Preview { get; init; }

    public static readonly SecretWorld Alpha = new()
    {
        Word = "Alpha",
        Favicons = [Fx.Favicon(196, 48, 64, 2), Fx.Favicon(40, 96, 200, 0), Fx.Favicon(32, 150, 96, 1), Fx.Favicon(210, 140, 30, 2)],
        Art = Fx.Art(144, 0),
        SmtcThumb = Fx.Art(120, 0),
        Preview = Jpeg(360, 180, 0x11),
    };

    public static readonly SecretWorld Bravo = new()
    {
        Word = "Bravo",
        Favicons = [Fx.Favicon(90, 20, 140, 1), Fx.Favicon(20, 160, 170, 2), Fx.Favicon(170, 60, 20, 0), Fx.Favicon(60, 60, 60, 1)],
        Art = Fx.Art(140, 1),
        SmtcThumb = Fx.Art(124, 1),
        Preview = Jpeg(352, 176, 0x5A),
    };

    private string W => Word.ToLowerInvariant();
    public string Title(int i) => $"{Word} Private Tab Title {i}";
    public string Domain(int i) => $"{W}-site{i}.example";
    public string Url(int i) => $"https://{Domain(i)}/{W}/secret-path?q={W}{i}";
    public string MediaTitle => $"{Word} Unreleased Demo";
    public string MediaArtist => $"{Word} Lantern Collective";
    public string MediaAlbum => $"{Word} Hidden Sessions";
    public string GroupTitle => $"{Word} Job Hunt";
    public string DownloadName => $"{W}-medical-records.pdf";
    public string SmtcTitle => $"{Word} Night Stream Episode";
    public string SmtcArtist => $"{Word} Streamer Name";
    public string FavId(int i) => "fav:" + Fx.Hash(Favicons[i]);
    public string ArtId => "art:" + Fx.Hash(Art);

    public IEnumerable<string> Strings()
    {
        for (var i = 0; i < 5; i++) { yield return Title(i); yield return Domain(i); yield return Url(i); }
        yield return MediaTitle; yield return MediaArtist; yield return MediaAlbum; yield return GroupTitle; yield return DownloadName;
        yield return SmtcTitle; yield return SmtcArtist;
        yield return W + "-site";   // any fragment of a secret domain
    }

    public IEnumerable<byte[]> Images() => [.. Favicons, Art, SmtcThumb, Preview];

    private JsonObject Tab(int id, int win, int idx, int i, bool active = false, bool audible = false, int? unread = null, int group = -1)
    {
        var t = Fx.Tab(id, win, idx, Title(i), Domain(i), active: active, audible: audible, unread: unread, icon: FavId(i % Favicons.Length), group: group);
        t["url"] = Url(i);
        t["host"] = Domain(i);
        return t;
    }

    /// <summary>A snapshot full of secrets that CLAIMS <paramref name="claimed"/> (a hostile or buggy extension lies "full").</summary>
    public JsonObject StateFull(string claimed = "full")
    {
        var media = Fx.Media("12:0", 12, title: MediaTitle, artist: MediaArtist, artImg: ArtId, actions: ["play", "pause", "seekto", "nexttrack", "togglemicrophone", "togglecamera", "hangup"], mic: true, camera: false);
        media["album"] = MediaAlbum;
        media["domain"] = Domain(1);
        var download = Fx.Download(501, name: DownloadName);
        download["icon"] = FavId(3).Replace("fav:", "file:", StringComparison.Ordinal);
        return Fx.Envelope("state.full", new JsonObject
        {
            ["privacy"] = claimed,
            ["windows"] = new JsonArray(Fx.Window(1, true), Fx.Window(2, false, 100, 100)),
            ["tabs"] = new JsonArray(
                Tab(11, 1, 0, 0, unread: 3),
                Tab(12, 1, 1, 1, active: true, audible: true, group: 7),
                Tab(13, 1, 2, 2, group: 7),
                Tab(14, 1, 3, 3, audible: true),
                Tab(21, 2, 0, 4, active: true)),
            ["groups"] = new JsonArray(Fx.Group(7, 1, GroupTitle, "blue")),
            ["media"] = new JsonArray(media),
            ["downloads"] = new JsonArray(download),
            ["activeByWindow"] = new JsonObject { ["1"] = 12, ["2"] = 21 },
            ["focusedWindow"] = 1,
        });
    }

    public IEnumerable<JsonObject> ImageFrames()
    {
        for (var i = 0; i < Favicons.Length; i++) yield return Fx.Img(FavId(i), Favicons[i]);
        yield return Fx.Img(ArtId, Art);
    }

    public SmtcBrowserSession Smtc(TimeProvider time) => new()
    {
        AppId = "Chrome", Brand = "Chrome", Title = SmtcTitle, Artist = SmtcArtist, Album = MediaAlbum, State = "playing",
        DurationMs = 3_600_000, PositionMs = 60_000, PositionAt = time.GetUtcNow(), Thumbnail = SmtcThumb, ThumbnailHash = Fx.Hash(SmtcThumb),
    };

    public BrowserInstance Instance() => Fx.Instance(full: StateFull(), caps: new BrowserCaps
    {
        Tabs = true, Favicon = true, Downloads = true, TabGroups = true, Sessions = true, Scripting = true, Split = true, HostAccessRequest = true, AllUrls = true,
    });

    public void PutImages(ImageStore images)
    {
        for (var i = 0; i < Favicons.Length; i++) images.Put(Fx.Stored(FavId(i), Favicons[i]));
        images.Put(Fx.Stored(ArtId, Art));
        images.Put(Fx.Stored(FavId(3).Replace("fav:", "file:", StringComparison.Ordinal), Favicons[3]));
    }
}

/// <summary>
/// The single choke-point test for streamer-safe (HIGH 1, LOW 11, LOW 15): every browser action, on Galleon and
/// Stream Deck + placements, rendered at "hidden" and at panic, with secrets coming from every source the plugin has:
/// a (lying) extension through the real session ingest, cached state seeded at "full" before the level tightened (live
/// and in the reconnect grace), and the Windows media session (SMTC lite tier, alone and next to a reconnecting browser).
/// Asserted: no secret string or image reaches any frame, PI message or log line, and two worlds that differ only in
/// their secrets render exactly the same frames (titles are drawn as stroke paths, so equality is the real proof).
/// </summary>
public class StreamerSafeTests
{
    private enum Source { Extension, Cached, CachedReconnecting, Smtc, SmtcWhileReconnecting }

    private static readonly (string Name, Func<Rig, DeviceInfo, Coordinates, Task<IActionProbe>> Make)[] Keys =
    [
        ("tab", (r, d, at) => Probe<TabKeyAction>(r, d, at, new TabKeySettings { Slot = "order", Index = 2 })),
        ("tab-recent", (r, d, at) => Probe<TabKeyAction>(r, d, at, new TabKeySettings { Slot = "recent", Index = 1, Label = "title" })),
        ("media", (r, d, at) => Probe<MediaKeyAction>(r, d, at, null)),
        ("nav", (r, d, at) => Probe<NavKeyAction>(r, d, at, new NavKeySettings { Command = "reload" })),
        ("reopen", (r, d, at) => Probe<ReopenKeyAction>(r, d, at, null)),
        ("split", (r, d, at) => Probe<SplitKeyAction>(r, d, at, null)),
        ("group", (r, d, at) => Probe<GroupKeyAction>(r, d, at, new GroupKeySettings { Index = 1 })),
        ("site", (r, d, at) => Probe<SiteKeyAction>(r, d, at, new SiteKeySettings { Site = "mail.example" })),
        ("download", (r, d, at) => Probe<DownloadKeyAction>(r, d, at, null)),
        ("privacy", (r, d, at) => Probe<PrivacyKeyAction>(r, d, at, null, press: false)),
        ("panic", (r, d, at) => Probe<PanicKeyAction>(r, d, at, null, press: false)),
        ("meet", (r, d, at) => Probe<MeetKeyAction>(r, d, at, new MeetKeySettings { Control = "mic" })),
    ];

    private static readonly (string Name, Func<Rig, DeviceInfo, Coordinates, Task<IActionProbe>> Make)[] Dials =
    [
        ("tabs", (r, d, at) => Probe<TabsDialAction>(r, d, at, new TabsDialSettings { Scope = "all" }, dial: true)),
        ("scrub", (r, d, at) => Probe<ScrubDialAction>(r, d, at, null, dial: true)),
        ("speed", (r, d, at) => Probe<SpeedDialAction>(r, d, at, null, dial: true)),
        ("page", (r, d, at) => Probe<PageDialAction>(r, d, at, null, dial: true)),
        ("preview", (r, d, at) => Probe<PreviewDialAction>(r, d, at, null, dial: true)),
    ];

    /// <summary>What one action showed: every channel call (frames, feedback, PI messages) and the PI replies, decoded.</summary>
    private interface IActionProbe { List<string> Output { get; } }

    private sealed class ProbeResult : IActionProbe { public List<string> Output { get; } = []; }

    private static async Task<IActionProbe> Probe<T>(Rig rig, DeviceInfo dev, Coordinates at, object? settings, bool dial = false, bool press = true) where T : ActionBase, new()
    {
        var result = new ProbeResult();
        await using var h = dial ? await H.Dial<T>(rig, dev, settings, at) : await H.Key<T>(rig, dev, settings, at);
        await H.Done(h);
        if (press)
        {
            if (dial)
            {
                await h.RotateAsync(1);
                await H.Done(h);
                await h.DialPressAsync();
            }
            else await h.PressAsync();
            await H.Done(h);
        }
        await h.PropertyInspectorAppearAsync();
        var status = await h.PiMessageAsync("browser.status", requestId: 1);
        var list = await h.PiMessageAsync("browser.list", requestId: 2);
        Assert.NotNull(status, "the PI status reply is captured");
        Assert.NotNull(list, "the PI browser list reply is captured");
        await H.Done(h);
        foreach (var c in h.Calls) result.Output.Add($"{c.Kind}: {Decode(c.Payload)}");
        result.Output.Add("pi.status: " + Decode(status));
        result.Output.Add("pi.list: " + Decode(list));
        h.AssertFramesAreDeckSafe();
        return result;
    }

    /// <summary>A payload as text with every SVG data URI decoded (embedded PNGs stay base64, so images can be searched).</summary>
    internal static string Decode(JsonNode? node)
    {
        var sb = new StringBuilder();
        void Walk(JsonNode? n)
        {
            switch (n)
            {
                case JsonObject o: foreach (var (k, v) in o) { sb.Append(k).Append('='); Walk(v); sb.Append(';'); } break;
                case JsonArray a: foreach (var v in a) { Walk(v); sb.Append(','); } break;
                case JsonValue v when v.TryGetValue<string>(out var s): sb.Append(DataUri.TryDecodeSvg(s, out var svg) ? svg : s); break;
                case null: sb.Append("null"); break;
                default: sb.Append(n.ToJsonString()); break;
            }
        }
        Walk(node);
        return sb.ToString();
    }

    private static async Task<Rig> WorldRig(SecretWorld w, Source source, bool panic)
    {
        var rig = Rig.Create(seedChrome: false);
        if (source is Source.Smtc or Source.SmtcWhileReconnecting) rig.Smtc.Set(w.Smtc(rig.Time));   // seen at full first: the worst case
        if (source is Source.Cached or Source.CachedReconnecting or Source.SmtcWhileReconnecting)
        {
            rig.Store.Upsert(w.Instance());
            w.PutImages(rig.Hub.Images);
            rig.Hub.Previews.Put(Fx.ChromeKey, 1, Fx.Stored("preview:1", w.Preview), rig.Store.NowMs);
            if (source is not Source.Cached) rig.Update(b => b with { Connected = false, LostAt = rig.Store.NowMs });
        }
        if (panic) await rig.Hub.PanicAsync();
        else rig.Hub.SetPrivacySetting(Wire.Privacy.Hidden);
        Assert.Equal(Wire.Privacy.Hidden, rig.Hub.RequestedPrivacy);
        if (source == Source.Extension)
        {
            // A lying extension: it claims "full" everywhere and sends every secret, through the real session ingest.
            var conn = new MemoryConnection();
            _ = rig.Hub.AcceptAsync(conn);
            conn.Send(Fx.Preamble("test-token"));
            conn.Send(Fx.Hello("p1", privacy: "full", allUrls: true));
            foreach (var img in w.ImageFrames()) conn.Send(img);
            conn.Send(w.StateFull("full"));
            conn.Send(Fx.Envelope("media.update", new JsonObject
            {
                ["privacy"] = "full",
                ["upsert"] = new JsonArray(new JsonObject { ["key"] = "12:0", ["title"] = w.MediaTitle + " (live)", ["artist"] = w.MediaArtist, ["art"] = new JsonObject { ["img"] = w.ArtId } }),
                ["remove"] = new JsonArray(),
            }));
            conn.Send(Fx.Envelope("preview.frame", new JsonObject
            {
                ["windowId"] = 1, ["tabId"] = 12, ["mime"] = "image/jpeg", ["w"] = 360, ["h"] = 180, ["b64"] = Convert.ToBase64String(w.Preview),
            }));
            conn.Send(Fx.Envelope("tabs.delta", new JsonObject
            {
                ["privacy"] = "full",
                ["upsert"] = new JsonArray(new JsonObject { ["id"] = 13, ["title"] = w.Title(9), ["url"] = w.Url(9), ["domain"] = w.Domain(9), ["host"] = w.Domain(9), ["unread"] = 4 }),
                ["remove"] = new JsonArray(),
            }));
            await SessionRig.WaitAsync(() => rig.Store.Current.Find(Fx.ChromeKey) is { Synced: true } b && b.Tabs.TryGetValue(13, out var t) && t.Unread == 4,
                why: () => rig.Log.All);
        }
        return rig;
    }

    private static async Task<List<string>> RenderAll(SecretWorld w, Source source, bool panic)
    {
        var output = new List<string>();
        await using var rig = await WorldRig(w, source, panic);
        foreach (var (name, make) in Keys)
            foreach (var (dev, at) in H.KeyPlacements)
                output.AddRange((await make(rig, dev, at)).Output.Select(o => $"{name}@{dev.Type}{at}: {o}"));
        foreach (var (name, make) in Dials)
            foreach (var (dev, at) in H.DialPlacements)
                output.AddRange((await make(rig, dev, at)).Output.Select(o => $"{name}@{dev.Type}{at}: {o}"));
        output.Add("log: " + rig.Log.All);
        return output;
    }

    private static void AssertNoSecrets(SecretWorld w, IEnumerable<string> output, string where)
    {
        var text = string.Join("\n", output);
        foreach (var s in w.Strings())
            Assert.DoesNotContain(s, text, $"{where}: the secret \"{s}\" reached a frame, a PI message or the log");
        foreach (var img in w.Images())
            Assert.DoesNotContain(Convert.ToBase64String(img)[..64], text, $"{where}: a secret image reached a frame");
    }

    private static async Task CheckAsync(Source source, bool panic)
    {
        var where = $"{source} at {(panic ? "panic" : "hidden")}";
        var ra = RenderAll(SecretWorld.Alpha, source, panic);
        var rb = RenderAll(SecretWorld.Bravo, source, panic);
        await Task.WhenAll(ra, rb);
        var (a, b) = (ra.Result, rb.Result);
        AssertNoSecrets(SecretWorld.Alpha, a, where + " (alpha)");
        AssertNoSecrets(SecretWorld.Bravo, b, where + " (bravo)");
        // Frames, feedback and PI messages (not the log, whose session ids differ) must not depend on the secrets at all.
        var fa = a.Where(x => !x.StartsWith("log:", StringComparison.Ordinal)).ToHashSet();
        var fb = b.Where(x => !x.StartsWith("log:", StringComparison.Ordinal)).ToHashSet();
        var onlyA = fa.Except(fb).ToList();
        var onlyB = fb.Except(fa).ToList();
        Assert.True(onlyA.Count == 0 && onlyB.Count == 0,
            $"{where}: {onlyA.Count + onlyB.Count} outputs depend on the secrets, e.g. {(onlyA.FirstOrDefault() ?? onlyB.FirstOrDefault())?[..Math.Min(160, (onlyA.FirstOrDefault() ?? onlyB.FirstOrDefault())!.Length)]}");
    }

    [Test(TimeoutMs = 240_000)]
    public Task A_lying_extension_at_hidden_and_panic_shows_no_secret() => Both(Source.Extension);

    [Test(TimeoutMs = 240_000)]
    public Task Cached_state_from_full_at_hidden_and_panic_shows_no_secret() => Both(Source.Cached);

    [Test(TimeoutMs = 240_000)]
    public Task A_reconnecting_browser_at_hidden_and_panic_shows_no_secret() => Both(Source.CachedReconnecting);

    [Test(TimeoutMs = 240_000)]
    public Task The_SMTC_lite_tier_at_hidden_and_panic_shows_no_secret() => Both(Source.Smtc);

    [Test(TimeoutMs = 240_000)]
    public Task The_SMTC_session_never_replaces_a_reconnecting_browser() => Both(Source.SmtcWhileReconnecting);

    private static async Task Both(Source source)
    {
        await CheckAsync(source, panic: false);
        await CheckAsync(source, panic: true);
    }

    // ------------------------------------------------------------------ focused regressions around the choke point

    [Test]
    public async Task The_lite_tier_at_domain_says_playing_without_title_or_art_and_at_full_shows_both()
    {
        foreach (var (level, showsSecrets) in new[] { (Wire.Privacy.Full, true), (Wire.Privacy.Domain, false) })
        {
            var frames = new List<string>();
            foreach (var w in new[] { SecretWorld.Alpha, SecretWorld.Bravo })
            {
                await using var rig = Rig.Create(seedChrome: false);
                rig.Hub.SetPrivacySetting(level);
                rig.Smtc.Set(w.Smtc(rig.Time));
                await using var key = await H.Key<MediaKeyAction>(rig, TestDevices.Galleon);
                await H.Done(key);
                frames.Add(key.LastSvg!);
                Assert.Equal(showsSecrets, key.LastSvg!.Contains(Convert.ToBase64String(w.SmtcThumb)[..64], StringComparison.Ordinal), $"{level}: the thumbnail");
                Assert.Equal(level, rig.Store.Current.Smtc!.Level);
                if (!showsSecrets) Assert.Null(rig.Store.Current.Smtc!.Media.Title);
            }
            Assert.Equal(!showsSecrets, frames[0] == frames[1], $"{level}: the two titles {(showsSecrets ? "show" : "don't show")}");
        }
    }

    [Test]
    public async Task Tightening_privacy_refilters_the_lite_tier_at_once_and_a_late_scaled_thumbnail_is_dropped()
    {
        await using var rig = Rig.Create(seedChrome: false);
        rig.Smtc.Set(SecretWorld.Alpha.Smtc(rig.Time));
        Assert.Equal(SecretWorld.Alpha.SmtcTitle, rig.Store.Current.Smtc!.Media.Title, "control: full shows the title");
        await rig.Hub.PanicAsync();
        var lite = rig.Store.Current.Smtc!;
        Assert.Equal(Wire.Privacy.Hidden, lite.Level);
        Assert.Null(lite.Media.Title);
        Assert.Null(lite.Media.PositionMs, "panic: the play state only");
        Assert.Null(lite.ThumbnailId);
    }

    [Test]
    public async Task A_profiles_own_level_and_always_hidden_sites_set_the_lite_floor_and_it_survives_a_restart()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-browser-tests", Guid.NewGuid().ToString("n"));
        try
        {
            var file = Path.Combine(dir, PrivacyMemory.FileName);
            {
                var memory = new PrivacyMemory(file);
                Assert.Equal(Wire.Privacy.Full, memory.Floor(streaming: false));
                memory.Remember(Fx.ChromeKey, new PrivacySettings(Wire.Privacy.Full, Wire.Privacy.Hidden, 2));
                Assert.Equal(Wire.Privacy.Domain, memory.Floor(streaming: false), "always-hidden sites: the lite tier can't tell them apart");
                Assert.Equal(Wire.Privacy.Hidden, memory.Floor(streaming: true), "its \"while streaming\" level applies while streaming");
            }
            Assert.DoesNotContain(Fx.ChromeKey, File.ReadAllText(file), "profile keys are stored hashed");
            // Prism Control restarts with no extension connected yet: the floor is already known.
            await using var rig = Rig.Create(seedChrome: false);
            await using var hub = new BrowserHub(new BrowserHubOptions { Log = rig.Log, Time = rig.Time, Smtc = rig.Smtc, PrivacyMemory = new PrivacyMemory(file), CommandSinkOverride = new RecordingSink() });
            hub.Start(new NullEndpoint());
            rig.Smtc.Set(SecretWorld.Alpha.Smtc(rig.Time));
            await SessionRig.WaitAsync(() => hub.Store.Current.Smtc is not null);
            Assert.Equal(Wire.Privacy.Domain, hub.Store.Current.Smtc!.Level);
            Assert.Null(hub.Store.Current.Smtc!.Media.Title, "no SMTC title in the seconds before the extension reconnects");
            File.WriteAllText(file, "{ not json");
            Assert.Equal(Wire.Privacy.Domain, new PrivacyMemory(file).Floor(false), "an unreadable memory fails safe");
        }
        finally { try { Directory.Delete(dir, recursive: true); } catch (Exception) { } }
    }

    [Test]
    public async Task The_extension_reports_its_privacy_settings_in_hello_and_state_full()
    {
        await using var rig = new SessionRig();
        var hello = Fx.Hello("p1");
        hello["data"]!["privacySettings"] = new JsonObject { ["base"] = "full", ["whileStreaming"] = "domain", ["alwaysHidden"] = 0 };
        var conn = await rig.ConnectAsync(hello: hello, full: false);
        Assert.Equal(Wire.Privacy.Full, rig.Hub.LiteLevel);
        var full = Fx.StateFull();
        full["data"]!["privacySettings"] = new JsonObject { ["base"] = "hidden", ["whileStreaming"] = "full", ["alwaysHidden"] = 1 };
        conn.Send(full);
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")?.Settings?.Base == "hidden");
        Assert.Equal(Wire.Privacy.Hidden, rig.Hub.LiteLevel, "the profile turned on its own streamer-safe: the lite tier follows");
    }

    [Test]
    public void An_always_hidden_tab_loses_its_unread_number_and_everything_else_below_the_hidden_level()
    {
        // LOW 11 defense in depth: at full/domain, hidden "all" can only mean an always-hidden site.
        var wire = Fx.Tab(41, 1, 0, "Lab results (127)", "clinic.example", unread: 127);
        wire["hidden"] = "all";
        wire["host"] = "portal.clinic.example";
        foreach (var level in new[] { Wire.Privacy.Full, Wire.Privacy.Domain })
        {
            var t = PrivacyFilter.Apply(WireParser.MergeTab(null, wire)!, level);
            Assert.Null(t.Unread, level);
            Assert.Null(t.Title); Assert.Null(t.Url); Assert.Null(t.Domain); Assert.Null(t.Host);
            Assert.Equal("glyph:globe", t.Icon);
        }
        var normal = Fx.Tab(42, 1, 1, "Inbox (3)", "mail.example", unread: 3);
        Assert.Equal(3, PrivacyFilter.Apply(WireParser.MergeTab(null, normal)!, Wire.Privacy.Hidden).Unread, "other tabs keep their badge at hidden (by design)");
    }

    [Test]
    public async Task A_preview_frame_of_an_always_hidden_or_inactive_tab_is_never_kept()
    {
        await using var rig = new SessionRig();
        var conn = await rig.ConnectAsync();
        var hiddenTab = Fx.Tab(12, 1, 1, "x", "clinic.example", active: true);
        hiddenTab["hidden"] = "all";
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(hiddenTab), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[12].Hidden == "all");
        JsonObject Frame(int tabId) => Fx.Envelope("preview.frame", new JsonObject { ["windowId"] = 1, ["tabId"] = tabId, ["mime"] = "image/jpeg", ["w"] = 360, ["h"] = 180, ["b64"] = Convert.ToBase64String(SecretWorld.Jpeg(360, 180, 3)) });
        conn.Send(Frame(12));   // the always-hidden active tab
        conn.Send(Frame(13));   // not the active tab
        var noTab = Frame(0); noTab["data"]!.AsObject().Remove("tabId");
        conn.Send(noTab);
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(new JsonObject { ["id"] = 11, ["unread"] = 8 }), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[11].Unread == 8);
        Assert.Null(rig.Hub.Previews.Get("chrome:p1", 1), "no frame was kept");
        conn.Send(Fx.Envelope("tabs.delta", new JsonObject { ["upsert"] = new JsonArray(Fx.Tab(12, 1, 1, "Video", "video.example", active: true)), ["remove"] = new JsonArray() }));
        await SessionRig.WaitAsync(() => rig.Hub.Store.Current.Find("chrome:p1")!.Tabs[12].Hidden is null);
        conn.Send(Frame(12));
        await SessionRig.WaitAsync(() => rig.Hub.Previews.Get("chrome:p1", 1) is not null);
    }
}
