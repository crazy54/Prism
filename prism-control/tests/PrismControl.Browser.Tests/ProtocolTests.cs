using System.Text.Json.Nodes;
using PrismControl.Browser.Actions;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>Untrusted-frame parsing: caps, cleaning, merge rules (PROTOCOL.md §4.3), privacy filter, pure selectors.</summary>
public class ProtocolTests
{
    [Test]
    public void Tab_merge_new_ids_whole_known_ids_field_by_field_null_clears()
    {
        var t = WireParser.MergeTab(null, Fx.Tab(5, 1, 0, "Inbox (2)", "mail.example", unread: 2))!;
        Assert.Equal("Inbox (2)", t.Title);
        Assert.Equal(2, t.Unread);
        var t2 = WireParser.MergeTab(t, new JsonObject { ["id"] = 5, ["unread"] = 4 })!;
        Assert.Equal("Inbox (2)", t2.Title, "unchanged fields stay");
        Assert.Equal(4, t2.Unread);
        var t3 = WireParser.MergeTab(t2, new JsonObject { ["id"] = 5, ["title"] = null, ["url"] = null })!;
        Assert.Null(t3.Title, "null clears");
        Assert.Null(t3.Url);
        Assert.Equal("mail.example", t3.Domain);
        Assert.Null(WireParser.MergeTab(null, new JsonObject { ["title"] = "no id" }), "an upsert without id is dropped");
    }

    [Test]
    public void Strings_are_capped_and_cleaned()
    {
        var hostile = "A\u202Eevil\u0007 title\t\twith   spaces" + new string('x', 2000);
        var t = WireParser.MergeTab(null, new JsonObject { ["id"] = 1, ["title"] = hostile, ["url"] = "javascript:alert(1)", ["domain"] = "BAD DOMAIN!", ["icon"] = "fav:../../x" })!;
        Assert.True(t.Title!.Length <= Wire.Limits.Title);
        Assert.DoesNotContain("\u202E", t.Title);
        Assert.DoesNotContain("\u0007", t.Title);
        Assert.DoesNotContain("  ", t.Title);
        Assert.Null(t.Url, "only http(s) URLs are kept");
        Assert.Null(t.Domain, "an invalid host is dropped");
        Assert.Null(t.Icon, "an icon id outside the pattern is dropped");
        var url = "https://video.example/" + new string('a', 3000);
        Assert.Null(WireParser.MergeTab(null, new JsonObject { ["id"] = 2, ["url"] = url })!.Url, "URLs over 2 KB are dropped");
    }

    [Test]
    public void Surrogate_pairs_are_never_split()
    {
        var s = new string('a', 511) + "\U0001F600";
        var cut = WireParser.Truncate(s, 512);
        Assert.Equal(511, cut.Length);
    }

    [Test]
    public void Depth_is_measured_without_recursion()
    {
        JsonNode deep = new JsonObject();
        var cur = (JsonObject)deep;
        for (var i = 0; i < 40; i++) { var next = new JsonObject(); cur["x"] = next; cur = next; }
        Assert.True(WireParser.Depth(deep) > Wire.Limits.MaxDepth);
        Assert.True(WireParser.Depth(Fx.StateFull()) <= Wire.Limits.MaxDepth);
    }

    [Test]
    public void Media_parse_keeps_only_known_actions_and_https_art()
    {
        var m = WireParser.MergeMedia(null, new JsonObject
        {
            ["key"] = "12:0", ["tabId"] = 12, ["state"] = "playing", ["rate"] = 99, ["volume"] = 3,
            ["actions"] = new JsonArray("play", "seekto", "evil", "hangup"),
            ["art"] = new JsonObject { ["url"] = "http://cdn.example/a.jpg", ["img"] = null },
        })!;
        Assert.Equal("play,seekto,hangup", string.Join(",", m.Actions));
        Assert.Equal(1.0, m.Rate, "out-of-range rate keeps the default");
        Assert.Null(m.Volume);
        Assert.Null(m.Art, "http artwork is never fetched by the plugin");
        Assert.Null(WireParser.MergeMedia(null, new JsonObject { ["key"] = "../x" }), "bad key");
    }

    [Test]
    public void Position_extrapolates_while_playing_and_clamps_to_duration()
    {
        var m = new MediaItem { Key = "1:0", State = "playing", PositionMs = 10_000, PositionAt = 1_000_000, DurationMs = 12_000, Rate = 2 };
        Assert.Equal(12_000L, m.PositionNow(1_002_000));
        Assert.Equal(11_000L, m.PositionNow(1_000_500));
        Assert.Equal(10_000L, (m with { State = "paused" }).PositionNow(1_002_000));
        Assert.Equal(10_000L, (m with { Live = true }).PositionNow(1_002_000));
    }

    [Test]
    public void Images_must_be_png_or_jpeg_within_caps()
    {
        var ok = WireParser.ParseImage(Fx.Img("fav:" + Fx.Hash(Fx.FavRed), Fx.FavRed)["data"]!.AsObject(), Wire.Limits.FavMaxBytes);
        Assert.NotNull(ok);
        Assert.Equal("image/png", ok!.Mime);
        var notImage = new JsonObject { ["id"] = "fav:abc", ["b64"] = Convert.ToBase64String("<svg onload=x>"u8.ToArray()) };
        Assert.Null(WireParser.ParseImage(notImage, Wire.Limits.FavMaxBytes), "SVG / unknown bytes are refused");
        var big = new JsonObject { ["id"] = "art:abc", ["b64"] = Convert.ToBase64String(new byte[200_000]) };
        Assert.Null(WireParser.ParseImage(big, Wire.Limits.ArtMaxBytes));
        Assert.Null(WireParser.ParseImage(new JsonObject { ["id"] = "fav:abc", ["b64"] = "%%%" }, 1000), "bad base64");
    }

    [Test]
    public void Privacy_filter_drops_titles_at_domain_and_everything_at_hidden()
    {
        var t = WireParser.MergeTab(null, Fx.Tab(1, 1, 0, "Secret Title", "bank.example", unread: 2, icon: "fav:0123456789abcdef"))!;
        var d = PrivacyFilter.Apply(t, Wire.Privacy.Domain);
        Assert.Null(d.Title);
        Assert.Null(d.Url);
        Assert.Equal("bank.example", d.Domain);
        var h = PrivacyFilter.Apply(t, Wire.Privacy.Hidden);
        Assert.Null(h.Domain);
        Assert.Null(h.Icon, "favicons are dropped at hidden");
        Assert.Equal(2, h.Unread, "unread counts are kept at every level");
        var m = PrivacyFilter.Apply(WireParser.MergeMedia(null, Fx.Media("1:0", 1, artImg: "art:0123456789abcdef"))!, Wire.Privacy.Hidden);
        Assert.Null(m.Title);
        Assert.Null(m.Art);
        var dl = PrivacyFilter.Apply(WireParser.MergeDownload(null, Fx.Download(1, name: "Tax Return 2026.PDF"))!, Wire.Privacy.Domain);
        Assert.Equal(".pdf", dl.Name);
        Assert.Equal(Wire.Privacy.Hidden, Wire.Privacy.Stricter("domain", "garbage"), "unknown levels count as hidden");
    }

    [Test]
    public void Slots_resolve_order_pinned_recent_audible()
    {
        var b = Fx.Instance();
        Assert.Equal(11, Selectors.Slot(b, "order", 1)!.Id);
        Assert.Equal(14, Selectors.Slot(b, "order", 4)!.Id);
        Assert.Null(Selectors.Slot(b, "order", 5), "window 1 has four tabs");
        Assert.Equal(11, Selectors.Slot(b, "pinned", 1)!.Id);
        Assert.Equal(12, Selectors.Slot(b, "recent", 1)!.Id, "the active tab of the focused window is the most recent");
        Assert.Equal(12, Selectors.Slot(b, "audible", 1)!.Id);
        Assert.Null(Selectors.Slot(b, "audible", 2));
    }

    [Test]
    public void Labels_fall_back_to_the_domain_for_undrawable_titles()
    {
        var latin = WireParser.MergeTab(null, Fx.Tab(1, 1, 0, "Café Menu", "www.food.example"))!;
        Assert.Equal("Café Menu", Selectors.Label(latin, false, "TAB"));
        Assert.Equal("food.example", Selectors.Label(latin, true, "TAB"));
        var cjk = WireParser.MergeTab(null, Fx.Tab(2, 1, 1, "東京の天気", "weather.example"))!;
        Assert.Equal("weather.example", Selectors.Label(cjk, false, "TAB"));
    }

    [Test]
    public void Ladder_steps_snap_and_clamp()
    {
        Assert.Equal(1.25, Selectors.LadderStep(Wire.SpeedLadder, 1, 1));
        Assert.Equal(1.5, Selectors.LadderStep(Wire.SpeedLadder, 1, 2));
        Assert.Equal(4.0, Selectors.LadderStep(Wire.SpeedLadder, 3, 5));
        Assert.Equal(0.25, Selectors.LadderStep(Wire.SpeedLadder, 0.5, -3));
        Assert.Equal(1.25, Selectors.LadderStep(Wire.SpeedLadder, 1.1, 1), "off-ladder values step to the next rung up");
        Assert.Equal(1.0, Selectors.LadderStep(Wire.SpeedLadder, 1.1, -1));
        Assert.Equal(1.1, Selectors.LadderStep(Wire.ZoomLadder, 1, 1));
    }

    [Test]
    public void Site_watch_matches_subdomains_and_remembers_hidden_tabs()
    {
        var b = Fx.Instance();
        Assert.Equal(11, Selectors.SiteTab(b, "mail.example", null)!.Id);
        Assert.Equal(11, Selectors.SiteTab(b, "https://mail.example/inbox", null)!.Id);
        var hidden = Fx.Instance(privacy: "hidden");
        Assert.Null(Selectors.SiteTab(hidden, "mail.example", null));
        Assert.Equal(11, Selectors.SiteTab(hidden, "mail.example", 11)!.Id, "hidden drops the domain: keep following the remembered tab");
    }

    [Test]
    public void Safe_mode_summaries_never_contain_urls_or_titles()
    {
        var s = SafeModeCommandSink.Summarize(Wire.Op.TabCreate, new JsonObject { ["url"] = "https://secret.example/path?q=private", ["windowId"] = 3 });
        Assert.DoesNotContain("secret", s);
        Assert.Contains("windowId=3", s);
        var t = SafeModeCommandSink.Summarize(Wire.Op.GroupUpdate, new JsonObject { ["groupId"] = 2, ["title"] = "My Private Taxes" });
        Assert.DoesNotContain("Private", t);
    }

    [Test]
    public void Relay_image_check_accepts_renamed_running_copies()
    {
        Assert.True(RelayImageVerifier.IsRelayImage(@"C:\Users\Example\AppData\Roaming\Prism\control\relay\prism-relay.exe"));
        Assert.True(RelayImageVerifier.IsRelayImage(@"C:\x\prism-relay.old-20261016T120000000Z-ab12cd34.exe"));
        Assert.False(RelayImageVerifier.IsRelayImage(@"C:\x\powershell.exe"));
    }
}
