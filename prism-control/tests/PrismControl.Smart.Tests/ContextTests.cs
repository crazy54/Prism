using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Smart.Context;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

public class ContextEngineTests
{
    private static readonly DeviceInfo Galleon = TestDevices.Galleon;

    [Test]
    public async Task Matches_planet_coaster_by_process_and_starts_in_the_park()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        var c = rig.Engine.Context.Current;
        Assert.Equal("planet-coaster-2/park", c.Key);
        Assert.Contains("process PlanetCoaster2.exe", c.Reason);
        var sw = rig.Events.Last(e => e.Kind == ContextEventKind.Switched);
        Assert.Equal("planet-coaster-2/park", sw.To);
    }

    [Test]
    public async Task Sight_context_switches_only_after_the_hysteresis()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.SightFake.Visible.Add("pc2.builder.editPanel");
        rig.SightFake.Publish();
        await rig.AdvanceAsync(200);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key, "400 ms hysteresis not reached");
        await rig.AdvanceAsync(250);
        Assert.Equal("planet-coaster-2/trackBuilder", rig.Engine.Context.Current.Key);
        Assert.Contains("pc2.builder.editPanel visible", rig.Engine.Context.Current.Reason);
    }

    [Test]
    public async Task A_flicker_shorter_than_the_hysteresis_never_switches()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        for (var i = 0; i < 5; i++)
        {
            rig.SightFake.Visible.Add("pc2.builder.editPanel");
            rig.SightFake.Publish();
            await rig.AdvanceAsync(150);
            rig.SightFake.Visible.Clear();
            rig.SightFake.Publish();
            await rig.AdvanceAsync(150);
        }
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key);
        Assert.Equal(1, rig.Events.Count(e => e.Kind == ContextEventKind.Switched));
    }

    [Test]
    public async Task Highest_priority_matching_context_wins()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.SightFake.Visible.Add("pc2.builder.editPanel");      // trackBuilder 80
        rig.SightFake.Visible.Add("pc2.menu.fullscreen");         // menus 90
        rig.SightFake.Publish();
        await rig.AdvanceAsync(500);
        Assert.Equal("planet-coaster-2/menus", rig.Engine.Context.Current.Key);
    }

    [Test]
    public async Task App_switches_are_debounced()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.Foreground.Set(Apps.Terminal);
        await rig.AdvanceAsync(60);
        rig.Foreground.Set(Apps.PlanetCoaster2);     // alt-tab straight back
        await rig.AdvanceAsync(400);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key);
        Assert.Equal(1, rig.Events.Count(e => e.Kind == ContextEventKind.Switched));
        rig.Foreground.Set(Apps.Terminal);
        await rig.AdvanceAsync(200);
        Assert.Equal("windows-terminal/terminal", rig.Engine.Context.Current.Key);
    }

    [Test]
    public async Task A_held_key_defers_the_switch_until_release()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        var slot = rig.Engine.Attach("k", Galleon, Controller.Keypad, new(0, 0), () => { });
        await rig.AdvanceAsync(100);
        rig.Engine.KeyDown(slot, Token(rig, new KeyDownEvent("k", "a", Galleon.Id, new(0, 0), 0, null, false)));
        rig.SightFake.Visible.Add("pc2.builder.editPanel");
        rig.SightFake.Publish();
        await rig.AdvanceAsync(1000);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key, "never swap under a held key");
        Assert.True(rig.Events.Any(e => e.Kind == ContextEventKind.Deferred && e.Reason.Contains("held")));
        rig.Engine.KeyUp(slot, Token(rig, new KeyUpEvent("k", "a", Galleon.Id, new(0, 0), 0, null, false)));
        await rig.AdvanceAsync(20);
        Assert.Equal("planet-coaster-2/trackBuilder", rig.Engine.Context.Current.Key);
    }

    [Test]
    public async Task A_turning_dial_defers_the_switch_for_its_grace()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        var dial = rig.Engine.Attach("d", Galleon, Controller.Encoder, new(0, 0), () => { });
        await rig.AdvanceAsync(100);
        rig.SightFake.Visible.Add("pc2.terrain.panel");
        rig.SightFake.Publish();
        for (var i = 0; i < 8; i++)
        {
            rig.Engine.DialRotate(dial, 1, Token(rig, new DialRotateEvent("d", "a", Galleon.Id, new(0, 0), 1, false)));
            await rig.AdvanceAsync(100);
        }
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key, "a dial in use never changes under the hand");
        await rig.AdvanceAsync(600);
        Assert.Equal("planet-coaster-2/terrain", rig.Engine.Context.Current.Key);
    }

    [Test]
    public async Task Lock_page_holds_the_context_until_unlocked()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        rig.Engine.Context.SetLocked(true);
        await rig.FrontAsync(Apps.Terminal);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key);
        Assert.True(rig.Events.Any(e => e.Kind == ContextEventKind.Deferred && e.Reason.Contains("page locked")));
        rig.Engine.Context.SetLocked(false);
        await rig.AdvanceAsync(10);
        Assert.Equal("windows-terminal/terminal", rig.Engine.Context.Current.Key);
        Assert.True(rig.Events.Any(e => e.Kind == ContextEventKind.Locked) && rig.Events.Any(e => e.Kind == ContextEventKind.Unlocked));
    }

    [Test]
    public async Task An_app_without_a_pack_falls_to_the_windows_shell_base_layer()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.PlanetCoaster2);
        await rig.FrontAsync(Apps.Notepad);
        Assert.Equal("windows-shell/desktop", rig.Engine.Context.Current.Key);
        Assert.Contains("base layer", rig.Engine.Context.Current.Reason);
        await rig.FrontAsync(Apps.Explorer);
        Assert.Equal("windows-shell/explorer", rig.Engine.Context.Current.Key, "explorer.exe + CabinetWClass (a built-in foreground field)");
    }

    [Test]
    public async Task Without_a_base_layer_the_last_pack_stays_dimmed()
    {
        using var rig = new Rig(TestPacks.All.Where(p => p.Id != "windows-shell").ToList());
        await rig.FrontAsync(Apps.PlanetCoaster2);
        await rig.FrontAsync(Apps.Notepad);
        Assert.Equal("planet-coaster-2/park", rig.Engine.Context.Current.Key);
    }

    [Test]
    public async Task Sites_win_over_the_browser_when_the_extension_reports_them()
    {
        using var rig = new Rig();
        var browser = new FakeVerbProvider("browser");
        rig.Verbs.Register(browser);
        await rig.FrontAsync(Apps.Chrome);
        Assert.Equal("chromium-browser", rig.Engine.Context.Current.Pack!.Id);
        browser.Set("browser.site.host", new ReadoutValue { Text = "www.youtube.com", At = rig.Time.GetUtcNow() });
        browser.Set("browser.site.path", new ReadoutValue { Text = "/watch?v=example", At = rig.Time.GetUtcNow() });
        await rig.AdvanceAsync(500);
        Assert.Equal("site-youtube/watch", rig.Engine.Context.Current.Key);
        browser.Set("browser.site.host", new ReadoutValue { Text = "music.youtube.com", At = rig.Time.GetUtcNow() });
        await rig.AdvanceAsync(500);
        Assert.Equal("chromium-browser", rig.Engine.Context.Current.Pack!.Id, "excluded host");
    }

    [Test]
    public async Task Every_switch_carries_its_reason_in_the_event_stream()
    {
        using var rig = new Rig();
        await rig.FrontAsync(Apps.Terminal);
        await rig.FrontAsync(Apps.PlanetCoaster2);
        var switches = rig.Events.Where(e => e.Kind == ContextEventKind.Switched).ToList();
        Assert.Equal(2, switches.Count);
        Assert.True(switches.All(e => e.Reason.Length > 10));
        Assert.Contains("WindowsTerminal.exe", switches[0].Reason);
        Assert.Equal("windows-terminal/terminal", switches[1].From);
        Assert.Equal(switches.Count, rig.Engine.Context.History.Count(e => e.Kind == ContextEventKind.Switched));
    }

    internal static PrismControl.Smart.Execution.DeckGesture Token(Rig rig, PrismControl.Core.Actions.ActionEvent e) => PrismControl.Smart.Execution.DeckGesture.FromDeckEvent(e, rig.Time);
}
