using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Prefs;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

public class LayoutGeneratorTests
{
    private static DeckLayout Gen(string pack, string ctx, DeviceGeometry geo, SmartPreferences? prefs = null, int page = 0,
        IEnumerable<KeySlot>? keys = null, IEnumerable<DialSlot>? dials = null) =>
        LayoutGenerator.Generate(new LayoutRequest(TestPacks.Get(pack), ctx, geo, [.. keys ?? geo.AllKeys()], [.. dials ?? geo.AllDials()], prefs ?? new SmartPreferences(), page,
            TestPacks.All.FirstOrDefault(p => p.Layer == PackLayer.Base)));

    private static string? VerbAt(DeckLayout l, int x, int y) => (l.KeyAt(new KeySlot(x, y)) as VerbKey)?.Verb.Id;

    [Test]
    public void Same_inputs_give_the_same_layout_every_time()
    {
        foreach (var geo in DeviceGeometry.Known)
            foreach (var (pack, ctx) in new[] { ("planet-coaster-2", "trackBuilder"), ("planet-coaster-2", "park"), ("vscode", "editor"), ("windows-terminal", "terminal"), ("chromium-browser", "browser") })
            {
                var a = Gen(pack, ctx, geo).Describe();
                var b = Gen(pack, ctx, geo).Describe();
                Assert.Equal(a, b, $"{pack}/{ctx} on {geo.Kind}");
            }
    }

    [Test]
    public void Context_flips_come_back_to_the_identical_layout()
    {
        var builder1 = Gen("planet-coaster-2", "trackBuilder", DeviceGeometry.Galleon).Describe();
        _ = Gen("planet-coaster-2", "terrain", DeviceGeometry.Galleon);
        _ = Gen("planet-coaster-2", "park", DeviceGeometry.Galleon);
        var builder2 = Gen("planet-coaster-2", "trackBuilder", DeviceGeometry.Galleon).Describe();
        Assert.Equal(builder1, builder2);
    }

    [Test]
    public void The_coaster_console_follows_the_pack_proposal_on_the_galleon()
    {
        var prefs = new SmartPreferences { Paging = "none" };
        var l = Gen("planet-coaster-2", "trackBuilder", DeviceGeometry.Galleon, prefs);
        var proposal = TestPacks.Get("planet-coaster-2").Layouts.Single(p => p.Device == "galleon-100-sd" && p.Context == "trackBuilder");
        foreach (var k in proposal.Keys) Assert.Equal(k.Verb, VerbAt(l, k.X, k.Y), $"key {k.X},{k.Y}");
        Assert.Equal("bank", l.DialAt(new DialSlot(0, 0)).Control!.Id);
        Assert.Equal("pitch", l.DialAt(new DialSlot(1, 0)).Control!.Id);
        Assert.Equal("curve", l.DialAt(new DialSlot(0, 1)).Control!.Id);
        Assert.Equal("length", l.DialAt(new DialSlot(1, 1)).Control!.Id);
        Assert.Equal("bankAngle", l.DialAt(new DialSlot(0, 0)).Readout!.Id);
        // Each widget shows its own dial's value; the ride ratings have their own key (RATINGS).
        Assert.Equal("pieceLength", l.DialAt(new DialSlot(1, 1)).Readout!.Id);
        Assert.Equal("builder.ratings", VerbAt(l, 2, 2));
    }

    [Test]
    public void Pinned_slots_are_never_touched_and_the_highest_priority_verbs_stay_on_page_one()
    {
        // The user's own action sits on 0,0 (BUILD's proposed slot): that key isn't a smart slot.
        var geo = DeviceGeometry.Galleon;
        var keys = geo.AllKeys().Where(k => k != new KeySlot(0, 0)).ToList();
        var l = Gen("planet-coaster-2", "trackBuilder", geo, new SmartPreferences { Paging = "none" }, keys: keys);
        Assert.False(l.Keys.ContainsKey(new KeySlot(0, 0)), "pinned slot excluded");
        var placed = l.Keys.Values.OfType<VerbKey>().Select(v => v.Verb.Id).ToList();
        Assert.True(placed.Contains("builder.build"), "BUILD (priority 95) moves rather than dropping off");
        Assert.False(placed.Contains("builder.special"), "the lowest-priority proposal verb (SPECIALS, 55) makes room");
        Assert.Equal("edit.undo", VerbAt(l, 1, 0), "everything else keeps its proposed slot");
        Assert.Equal("builder.testRide", VerbAt(l, 0, 3));
    }

    [Test]
    public void User_pins_and_hidden_verbs_apply_per_app()
    {
        var prefs = new SmartPreferences { Paging = "none" };
        prefs.Apps["planet-coaster-2"] = new AppPreferences
        {
            Pins = [new SlotPin { Device = "galleon-100-sd", Kind = "key", X = 2, Y = 0, Item = "camera.focus" }],
            Hidden = ["builder.delete"],
        };
        var l = Gen("planet-coaster-2", "trackBuilder", DeviceGeometry.Galleon, prefs);
        Assert.Equal("camera.focus", VerbAt(l, 2, 0));
        Assert.Contains("pinned by you", l.KeyAt(new KeySlot(2, 0)).Why);
        Assert.False(l.Keys.Values.OfType<VerbKey>().Any(v => v.Verb.Id == "builder.delete"));
        // Other apps are unaffected.
        var wt = Gen("windows-terminal", "terminal", DeviceGeometry.Galleon, prefs);
        Assert.Equal(Gen("windows-terminal", "terminal", DeviceGeometry.Galleon, new SmartPreferences { Paging = "none" }).Describe(), wt.Describe());
    }

    [Test]
    public void Every_device_geometry_gets_a_full_valid_layout()
    {
        foreach (var geo in DeviceGeometry.Known)
            foreach (var pack in TestPacks.All.Where(p => p.Layer != PackLayer.Base))
                foreach (var ctx in pack.Contexts.Select(c => c.Id))
                {
                    var l = Gen(pack.Id, ctx, geo);
                    var where = $"{pack.Id}/{ctx} on {geo.Kind}";
                    Assert.Equal(geo.KeyCount, l.Keys.Count, where + ": every smart key is assigned");
                    Assert.True(l.Keys.Keys.All(geo.Contains), where);
                    var ids = l.Keys.Values.OfType<VerbKey>().Select(v => v.Verb.Id).ToList();
                    Assert.Equal(ids.Count, ids.Distinct().Count(), where + ": no verb twice");
                    Assert.True(l.Keys.Values.OfType<VerbKey>().All(v => v.From is not null || pack.ValidityTier(v.Verb.Contexts, ctx) >= 0), where + ": only verbs valid here");
                    Assert.Equal(geo.EncoderSlots, l.Dials.Count, where);
                    var controls = l.Dials.Values.Where(d => d.Control is not null).Select(d => d.Control!.Id).ToList();
                    Assert.Equal(controls.Count, controls.Distinct().Count(), where + ": no control twice");
                }
    }

    [Test]
    public void Overflow_pages_cover_every_verb_exactly_once_behind_a_more_key()
    {
        foreach (var geo in new[] { DeviceGeometry.Galleon, DeviceGeometry.Plus, DeviceGeometry.Mini, DeviceGeometry.MK2 })
        {
            var pack = TestPacks.Get("planet-coaster-2");
            // Every verb valid here, except a parent-context verb that does what one of the context's own verbs does (one DELETE).
            var own = pack.Verbs.Where(v => pack.ValidityTier(v.Contexts, "trackBuilder") == 0).Select(LayoutGenerator.FunctionKey).OfType<string>().ToHashSet();
            var valid = pack.Verbs.Where(v => pack.ValidityTier(v.Contexts, "trackBuilder") is var tier && (tier == 0 || tier == 1 && (LayoutGenerator.FunctionKey(v) is not { } fk || !own.Contains(fk))))
                .Select(v => v.Id).ToHashSet();
            var first = Gen("planet-coaster-2", "trackBuilder", geo);
            Assert.True(first.PageCount > 1, geo.Kind);
            var seen = new List<string>();
            KeySlot? moreAt = null;
            for (var p = 0; p < first.PageCount; p++)
            {
                var l = Gen("planet-coaster-2", "trackBuilder", geo, page: p);
                Assert.Equal(p, l.Page);
                var more = Assert.Single(l.Keys.Where(k => k.Value is MoreKey));
                moreAt ??= more.Key;
                Assert.Equal(moreAt, more.Key, "MORE never moves");
                Assert.Equal(geo.AllKeys()[^1], more.Key, "MORE sits in the last smart slot");
                seen.AddRange(l.Keys.Values.OfType<VerbKey>().Select(v => v.Verb.Id));
            }
            Assert.Equal(seen.Count, seen.Distinct().Count(), geo.Kind + ": a verb on two pages");
            Assert.True(valid.SetEquals(seen), $"{geo.Kind}: pages miss {string.Join(",", valid.Except(seen).Take(5))}");
            var p1 = Gen("planet-coaster-2", "trackBuilder", geo).Keys.Values.OfType<VerbKey>().Select(v => v.Verb.Priority).Min();
            var p2 = Gen("planet-coaster-2", "trackBuilder", geo, page: 1).Keys.Values.OfType<VerbKey>().Select(v => v.Verb.Priority).Max();
            Assert.True(geo.Kind is "galleon-100-sd" or "stream-deck-plus" || p1 >= p2, $"{geo.Kind}: page 1 keeps the highest priorities");
        }
    }

    [Test]
    public void Zones_put_primary_on_top_and_nav_system_at_the_bottom()
    {
        foreach (var geo in new[] { DeviceGeometry.XL, DeviceGeometry.MK2 })
        {
            var l = Gen("windows-terminal", "terminal", geo);
            var placed = l.Keys.Where(k => k.Value is VerbKey).Select(k => (Slot: k.Key, ((VerbKey)k.Value).Verb)).ToList();
            var primaries = placed.Where(p => p.Verb.Category == VerbCategory.Primary).ToList();
            var bottoms = placed.Where(p => p.Verb.Category is VerbCategory.Nav or VerbCategory.System).ToList();
            Assert.True(primaries.Count > 0 && bottoms.Count > 0, geo.Kind);
            // Primary verbs fill the deck from the top-left; nav/system verbs fill it from the bottom-right.
            Assert.True(primaries.Max(p => p.Slot).CompareTo(placed.Where(p => p.Verb.Category is not VerbCategory.Primary).Min(p => p.Slot)) < 0, geo.Kind + ": primary first");
            Assert.True(bottoms.Min(p => p.Slot).CompareTo(placed.Where(p => p.Verb.Category is not (VerbCategory.Nav or VerbCategory.System)).Max(p => p.Slot)) > 0, geo.Kind + ": nav/system last");
            if (primaries.Count <= geo.Columns) Assert.True(primaries.All(p => p.Slot.Y == 0), geo.Kind + ": primaries on the top row");
        }
    }

    [Test]
    public void Dial_preferences_beat_the_pack_proposal()
    {
        var prefs = new SmartPreferences { DialCategories = { ["camera"] = "right" } };
        var l = Gen("planet-coaster-2", "park", DeviceGeometry.Galleon, prefs);
        Assert.Equal(VerbCategory.Camera, l.DialAt(new DialSlot(1, 0)).Control!.Category);
        Assert.Equal(VerbCategory.Camera, l.DialAt(new DialSlot(1, 1)).Control!.Category);
        Assert.Contains("your preference", l.DialAt(new DialSlot(1, 0)).Why);
        var plus = Gen("planet-coaster-2", "trackBuilder", DeviceGeometry.Plus, new SmartPreferences { DialCategories = { ["camera"] = "left" } });
        Assert.Equal(VerbCategory.Camera, plus.DialAt(new DialSlot(0, 0)).Control!.Category);
    }

    [Test]
    public void Streamer_safe_hides_private_readouts()
    {
        var normal = Gen("windows-terminal", "terminal", DeviceGeometry.Galleon);
        Assert.Equal("windowTitle", normal.DialAt(new DialSlot(0, 0)).Readout?.Id);
        var safe = Gen("windows-terminal", "terminal", DeviceGeometry.Galleon, new SmartPreferences { StreamerSafe = true });
        Assert.True(safe.Dials.Values.All(d => d.Readout?.Id != "windowTitle"));
    }

    [Test]
    public void Devices_without_screens_put_spare_keys_to_work()
    {
        var l = Gen("no-mans-sky", "onFoot", DeviceGeometry.XL);
        Assert.True(l.Keys.Values.All(k => k is not EmptyKey), "XL spare keys get base-layer verbs or readouts");
        Assert.True(l.Keys.Values.OfType<VerbKey>().Any(v => v.From?.Id == "windows-shell"), "the windows-shell underlay fills the spare keys");
        Assert.Equal(1, l.PageCount);
    }

    [Test]
    public void Neo_and_mini_layouts_fit_their_grids()
    {
        var neo = Gen("vscode", "editor", DeviceGeometry.Neo);
        Assert.Equal(8, neo.Keys.Count);
        Assert.True(neo.Keys.Keys.All(k => k.X < 4 && k.Y < 2));
        var mini = Gen("vscode", "editor", DeviceGeometry.Mini);
        Assert.Equal(6, mini.Keys.Count);
        Assert.Single(mini.Keys.Values.OfType<MoreKey>());
    }
}
