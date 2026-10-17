using System.Text.Json.Nodes;
using PrismControl.Desktop;
using PrismControl.Smart.Glyphs;
using PrismControl.Smart.Packs;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

public class ChordTests
{
    [Test]
    public void Parses_canonical_chords_with_side_specific_modifiers()
    {
        var c = Chord.Parse("RCtrl+RShift+G");
        Assert.Equal("RCtrl+RShift+G", c.ToString());
        Assert.Equal(VirtualKey.RightControl, c.Keys[0].Vk);
        Assert.Equal(VirtualKey.RightShift, c.Keys[1].Vk);
        Assert.Equal(VirtualKey.G, c.Key.Vk);
        Assert.Equal(VirtualKey.Oem3, Chord.Parse("Win+Backquote").Key.Vk);
        Assert.Equal(VirtualKey.LeftShift, Chord.Parse("LShift").Key.Vk);
        Assert.Equal(VirtualKey.OemPlus, Chord.Parse("Alt+Shift+Equal").Key.Vk);
        Assert.Equal(VirtualKey.NumPad4, Chord.Parse("Numpad4").Key.Vk);
    }

    [Test]
    public void Rejects_bad_order_unknown_keys_and_empties()
    {
        Assert.False(Chord.TryParse("Shift+Ctrl+T", out _, out var e1));
        Assert.Contains("order", e1);
        Assert.False(Chord.TryParse("Ctrl+Banana", out _, out _));
        Assert.False(Chord.TryParse("Ctrl+", out _, out _));
        Assert.False(Chord.TryParse("", out _, out _));
        Assert.False(Chord.TryParse("T+Ctrl", out _, out _));
    }

    [Test]
    public void Loose_parts_are_normalized_to_canonical_order()
    {
        Assert.True(Chord.TryFromParts(["Shift", "Ctrl"], "P", out var c));
        Assert.Equal("Ctrl+Shift+P", c!.ToString());
        Assert.False(Chord.TryFromParts(["Ctrl", "RCtrl"], "P", out _));
    }
}

public class PackLoadingTests
{
    [Test]
    public void Every_shipped_pack_loads_without_errors()
    {
        var lib = TestPacks.Library;
        Assert.True(lib.Packs.Count >= 15, $"expected the 15 starter packs, got {lib.Packs.Count}");
        foreach (var s in lib.Status)
        {
            Assert.True(s.Loaded, $"{s.Id} did not load: {string.Join("; ", s.Problems)}");
            Assert.Equal(0, s.Errors, $"{s.Id}: {string.Join("; ", s.Problems.Where(p => p.Severity == ProblemSeverity.Error))}");
        }
        var pc2 = TestPacks.Get("planet-coaster-2");
        var raw = System.Text.Json.Nodes.JsonNode.Parse(PackLibrary.Embedded().Single(f => f.Name == "planet-coaster-2.json").Text)!;
        Assert.Equal(raw["contexts"]!.AsArray().Count, pc2.Contexts.Count);
        Assert.Equal(raw["verbs"]!.AsArray().Count, pc2.Verbs.Count, "no verb dropped");
        Assert.Equal(raw["controls"]!.AsArray().Count, pc2.Controls.Count, "no control dropped");
        Assert.True(pc2.Verbs.Count >= 100);
        Assert.Equal(50, pc2.KeyHoldMs, "Cobra-engine taps are held");
        Assert.Equal(0, TestPacks.Get("windows-terminal").KeyHoldMs);
        Assert.Equal(PackKeyMode.Scancode, pc2.KeyMode);
        Assert.True(pc2.Policy.AllowsClosedLoop);
        Assert.Equal("park", pc2.DefaultContext.Id);
    }

    [Test]
    public void Site_overlays_inherit_the_browser_and_keep_their_own_default_context()
    {
        var yt = TestPacks.Get("site-youtube");
        Assert.Equal(PackLayer.Overlay, yt.Layer);
        Assert.Equal("browse", yt.DefaultContext.Id);
        Assert.Single(yt.Contexts.Where(c => c.IsDefault));
        Assert.NotNull(yt.FindVerb("yt.captions"));
        Assert.NotNull(yt.FindVerb("tab.new"), "inherited from chromium-browser");
        Assert.Equal(PackLayer.Base, TestPacks.Get("windows-shell").Layer);
    }

    [Test]
    public void A_user_override_patches_one_verb_property_and_adds_a_verb()
    {
        var shipped = TestPacks.Minimal();
        var patch = new JsonObject
        {
            ["id"] = "example-app",
            ["verbs"] = new JsonArray(
                new JsonObject { ["id"] = "app.save", ["binding"] = new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+Alt+S" } },
                TestPacks.Verb("app.export", "EXPORT", "tool", 40, new JsonObject { ["kind"] = "chord", ["chord"] = "Ctrl+E" })),
        };
        var lib = TestPacks.FromJson(("example-app.json", PackOrigin.Shipped, shipped.ToJsonString()), ("user:example-app.json", PackOrigin.User, patch.ToJsonString()));
        var p = lib.Find("example-app")!;
        Assert.Equal("Ctrl+Alt+S", p.FindVerb("app.save")!.Binding.Describe());
        Assert.Equal("SAVE", p.FindVerb("app.save")!.Label, "untouched properties survive");
        Assert.NotNull(p.FindVerb("app.export"));
        Assert.Equal(2, lib.Status.Single().Files.Count);
    }

    [Test]
    public void A_broken_user_file_never_breaks_the_shipped_pack()
    {
        var lib = TestPacks.FromJson(("example-app.json", PackOrigin.Shipped, TestPacks.Minimal().ToJsonString()), ("user:broken.json", PackOrigin.User, "{ not json"));
        Assert.NotNull(lib.Find("example-app"));
        Assert.True(lib.Status.Any(s => !s.Loaded && s.Problems.Any(p => p.Message.Contains("not valid JSON"))));
    }

    [Test]
    public void Bad_items_are_dropped_and_the_rest_loads()
    {
        var j = TestPacks.Minimal();
        ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.bad", "BAD", "tool", 10, new JsonObject { ["kind"] = "chord", ["chord"] = "Shift+Ctrl+Q" }));
        ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.ghost", "GHOST", "tool", 10, new JsonObject { ["kind"] = "chord", ["chord"] = "Q" }, contexts: "nowhere"));
        var problems = new List<PackProblem>();
        var p = TestPacks.Parse(j, problems);
        Assert.Null(p.FindVerb("app.bad"));
        Assert.Null(p.FindVerb("app.ghost"));
        Assert.NotNull(p.FindVerb("app.save"));
        Assert.True(problems.Count(x => x.Severity == ProblemSeverity.Error) >= 2);
    }

    [Test]
    public void Extends_cycles_are_refused()
    {
        var a = TestPacks.Minimal("pack-a");
        a["extends"] = new JsonArray("pack-b");
        var b = TestPacks.Minimal("pack-b");
        b["extends"] = new JsonArray("pack-a");
        var lib = TestPacks.FromJson(("pack-a.json", PackOrigin.Shipped, a.ToJsonString()), ("pack-b.json", PackOrigin.Shipped, b.ToJsonString()));
        Assert.True(lib.Status.SelectMany(s => s.Problems).Any(p => p.Message.Contains("cycle")));
    }

    [Test]
    public void Macro_bindings_parse_with_their_sight_steps_and_cap_them()
    {
        var gm = TestPacks.Get("site-gmail");
        Assert.True(gm.FindVerb("gm.toggleShortcuts")!.Binding is MacroBinding { Steps.Count: 3 });
        Assert.True(TestPacks.Get("planet-coaster-2").FindVerb("builder.chainLift")!.Binding is MacroBinding { Steps.Count: 2 } m && m.Steps.All(s => s is SightClickBinding));
        var j = TestPacks.Minimal(policyClass: "safe-offline", sight: true, closedLoop: true);
        var click = new JsonObject { ["kind"] = "sightClick", ["sight"] = "a.b" };
        ((JsonArray)j["verbs"]!).Add(TestPacks.Verb("app.fiveClicks", "FIVE", "tool", 10, new JsonObject { ["kind"] = "macro", ["steps"] = new JsonArray([.. Enumerable.Range(0, 5).Select(_ => click.DeepClone())]) }));
        var problems = new List<PackProblem>();
        var p = TestPacks.Parse(j, problems);
        Assert.Null(p.FindVerb("app.fiveClicks"));
        Assert.True(problems.Any(x => x.Message.Contains("at most 4 Sight steps")));
    }

    [Test]
    public void Glyph_library_has_the_prism_deck_set_and_monograms_cover_the_rest()
    {
        var g = GlyphLibrary.Default;
        // The library grows as Prism Deck adds glyphs (56 originally); the original set must always be there.
        Assert.True(g.Count >= 56, $"{g.Count} glyphs");
        foreach (var id in new[] { "play-pause", "search", "camera", "back", "check", "lock", "pages", "terminal" }) Assert.True(g.Has(id), id);
        Assert.False(g.Has("no-such-glyph-for-tests"));
        Assert.True(g.Has("trash"));   // an alias (prism-deck's _aliases.js: trash = delete)
        // Aliases that name a state keep it, also on toggles: PAUSE draws the pause bars, HIDE UI the hidden eye.
        Assert.Equal("playing", g.StateFor(g.Get("pause")!, null));
        Assert.Equal("playing", g.StateFor(g.Get("pause")!, false));
        Assert.Equal("hidden", g.StateFor(g.Get("eye-off")!, true));
        Assert.Equal("shown", g.StateFor(g.Get("eye")!, true));
        Assert.Equal("CL", GlyphLibrary.MonogramFor(null, "CHAIN LIFT"));
        Assert.Equal("LP", GlyphLibrary.MonogramFor("LP", "LOOPS"));
        Assert.Equal("UN", GlyphLibrary.MonogramFor(null, "UNDO"));
    }
}
