using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Execution;
using PrismControl.Smart.Layout;
using PrismControl.Smart.Packs;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

public class ReadoutTests
{
    [Test]
    public void Window_titles_drop_the_app_name_and_read_the_dirty_mark()
    {
        var vs = TestPacks.Get("vscode");
        var v = WindowTitle.Parse("● main.example.ts - demo - Visual Studio Code", vs, badge: false, DateTimeOffset.UnixEpoch);
        Assert.Equal("main.example.ts - demo", v.Text);
        Assert.Equal("main.example.ts", v.Fields!["activeEditorShort"]);
        Assert.Equal("demo", v.Fields["rootName"]);
        var title = vs.FindReadout("windowTitle")!;
        Assert.Equal("main.example.ts", ReadoutResolver.Format(title, v));
        var dirty = WindowTitle.Parse("● main.example.ts - demo - Visual Studio Code", vs, badge: true, DateTimeOffset.UnixEpoch);
        Assert.Equal(true, dirty.State);
        Assert.Equal("●", ReadoutResolver.Format(vs.FindReadout("dirtyState")!, dirty));
        Assert.Equal("○", ReadoutResolver.Format(vs.FindReadout("dirtyState")!, WindowTitle.Parse("main.example.ts - demo - Visual Studio Code", vs, true, DateTimeOffset.UnixEpoch)));
        var docs = WindowTitle.Parse("Quarterly plan - Google Docs - Google Chrome", TestPacks.Get("site-google-docs"), false, DateTimeOffset.UnixEpoch);
        Assert.Equal("Quarterly plan", docs.Text);
    }

    [Test]
    public void Numbers_group_thousands_use_a_real_minus_and_keep_one_decimal()
    {
        Assert.Equal("48,250", ReadoutResolver.Num(48250));
        Assert.Equal("−12", ReadoutResolver.Num(-12));
        Assert.Equal("7.2", ReadoutResolver.Num(7.2));
        Assert.Equal("1312", ReadoutResolver.Num(1312));
        var cash = TestPacks.Get("planet-coaster-2").FindReadout("parkCash")!;
        Assert.Equal("$48,250", ReadoutResolver.Format(cash, new ReadoutValue { Number = 48250 }));
        Assert.Equal("—", ReadoutResolver.Format(cash, ReadoutValue.Unknown));
        var font = TestPacks.Get("windows-terminal").FindReadout("fontSizeSteps")!;
        Assert.Equal("+3 pt", ReadoutResolver.Format(font, new ReadoutValue { Number = 3 }));
        Assert.Equal("−2 pt", ReadoutResolver.Format(font, new ReadoutValue { Number = -2 }));
    }

    [Test]
    public async Task Readouts_go_stale_when_sight_stops_updating()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        Pc2.Builder(rig, bank: 10);
        var pack = Pc2.Pack;
        var r = rig.Engine.Readouts.Read(pack, pack.FindReadout("bankAngle")!, Apps.PlanetCoaster2);
        Assert.Equal(ReadoutConfidence.Observed, r.Value.Confidence);
        rig.Time.Advance(TimeSpan.FromSeconds(5));
        r = rig.Engine.Readouts.Read(pack, pack.FindReadout("bankAngle")!, Apps.PlanetCoaster2);
        Assert.Equal(ReadoutConfidence.Stale, r.Value.Confidence);
        Assert.Equal("10°", r.Text, "a stale value is still shown, just dimmed");
        var counted = rig.Engine.Readouts.Read(pack, pack.FindReadout("bankCounted")!, Apps.PlanetCoaster2);
        Assert.Equal(ReadoutConfidence.Inferred, counted.Value.Confidence);
    }
}

public class ModuleFallbackTests
{
    [Test]
    public async Task Module_verbs_fall_back_to_their_chord_until_the_module_answers()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Chrome);
        var slot = rig.Engine.Attach("k", TestDevices.XL, PrismControl.Core.Devices.Controller.Keypad, new(0, 0), () => { });
        var tab1 = TestPacks.Get("chromium-browser").FindVerb("tab.go1")!;
        Assert.True(tab1.Binding is ModuleBinding);
        Assert.Equal("Ctrl+1", rig.Engine.Effective(tab1).Describe());

        var browser = new FakeVerbProvider("browser");
        browser.VerbList.Add(new VerbDescriptor { Id = "browser.tab.focus", Label = "TAB" });
        rig.Verbs.Register(browser);
        Assert.True(rig.Engine.Effective(tab1) is ModuleBinding, "the module wins once it is there and ready");
        browser.Statuses["browser.tab.focus"] = new VerbStatus(VerbAvailability.NotConnected, "extension offline");
        Assert.Equal("Ctrl+1", rig.Engine.Effective(tab1).Describe(), "and the chord is back when it goes offline");
        rig.Engine.Detach(slot);
    }

    [Test]
    public async Task A_press_on_a_fallback_key_sends_the_chord()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Chrome);
        await using var deck = await Deck.CreateAsync(rig, TestDevices.Galleon, dials: false);
        var tab1 = deck.Keys.Single(k => deck.View(k.Key).ItemId == "tab.go1");
        Assert.True(deck.View(tab1.Key).Availability.Ready, "usable through its chord");
        await tab1.Value.PressAsync();
        await rig.IdleAsync();
        Assert.Equal("Control+D1", Assert.Single(rig.KeysSent()));
        deck.AssertDeckSafe();
    }
}

public class VerbRegistryTests
{
    [Test]
    public void The_registry_is_one_per_process_and_routes_by_module_prefix()
    {
        var services = new ServiceRegistry();
        var a = VerbRegistry.GetOrCreate(services);
        Assert.True(ReferenceEquals(a, VerbRegistry.GetOrCreate(services)));
        var changed = 0;
        a.Changed += () => changed++;
        var w1 = new FakeVerbProvider("windows");
        w1.VerbList.Add(new VerbDescriptor { Id = "windows.window.topmost", Label = "ON TOP" });
        w1.Values["windows.window.topmost"] = new ReadoutValue { State = true };
        a.Register(w1);
        Assert.True(a.TryResolveVerb("windows.window.topmost", out var p, out var d) && ReferenceEquals(p, w1) && d.Label == "ON TOP");
        Assert.False(a.TryResolveVerb("windows.nope", out _, out _));
        Assert.False(a.TryResolveVerb("browser.tab.new", out _, out _));
        Assert.True(a.TryReadReadout("windows.window.topmost", out var v) && v.State == true);
        var w2 = new FakeVerbProvider("windows");
        a.Register(w2);
        Assert.Single(a.Providers);
        var before = changed;
        w1.Raise();
        w2.Raise();
        Assert.Equal(before + 1, changed, "only the current provider's changes are relayed");
        a.Unregister(w2);
        Assert.Empty(a.Providers);
        Assert.Throws<ArgumentException>(() => a.Register(new FakeVerbProvider("bad.name")));
    }
}
