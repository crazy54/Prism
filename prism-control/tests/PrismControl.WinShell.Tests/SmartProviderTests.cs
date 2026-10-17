#if PRISM_DESKTOP
using System.Text.Json.Nodes;
using PrismControl.Desktop;
using PrismControl.Testing;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.SmartProvider;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// SD2: the windows module's Smart Deck provider (SmartProvider/, additive). It drives W1's real service graph on the
/// rig's fakes and manual clock, so these tests exercise the same refusals, resyncs and reverts the actions have.
/// </summary>
public class SmartProviderTests
{
    private const nint Editor = 0x1001, Browser = 0x1002, Chat = 0x1003;

    private sealed class Fixture : IAsyncDisposable
    {
        public readonly Rig Rig;
        public readonly VerbRegistry Registry = new();
        public readonly W1VerbPart Part;
        public readonly WindowsVerbProvider Provider;
        public readonly List<string> Urls = [];

        public Fixture(bool safeMode = false, bool tripwires = false)
        {
            Rig = new Rig(safeMode, tripwires).WithWindows();
            Rig.Geometry.Add(Editor, new PixelRect(100, 100, 1100, 900), "editor.exe");
            Rig.Geometry.Add(Browser, new PixelRect(200, 120, 1400, 1000), "browser.exe");
            Provider = WindowsVerbProvider.GetOrRegister(Registry, Rig.Time);
            Part = new W1VerbPart(Rig.Services, Rig.Time, u => Urls.Add(u));
            Provider.Add(Part);
        }

        public async Task<VerbResult> Invoke(string verb, object? args = null, int ticks = 0, bool direct = true, nint target = 0)
        {
            var t = Provider.InvokeAsync(new VerbInvocation
            {
                VerbId = verb, Args = args is null ? null : JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(args)) as JsonObject,
                Ticks = ticks, Gesture = ticks != 0 ? VerbGestureKind.DialTurn : VerbGestureKind.KeyPress, DirectGesture = direct, TargetWindow = target,
            });
            for (var i = 0; i < 600 && !t.IsCompleted; i++)
            {
                await Task.Yield();
                Rig.Time.Advance(TimeSpan.FromMilliseconds(50));
                if (i % 20 == 19) await Task.Delay(1);
            }
            Assert.True(t.IsCompleted, verb + " never finished");
            return await t;
        }

        public ReadoutValue Read(string id)
        {
            Assert.True(Registry.TryReadReadout(id, out var v), id + " is a readout");
            return v;
        }

        public async ValueTask DisposeAsync()
        {
            Part.Dispose();
            await Rig.DisposeAsync();
        }
    }

    // Every W1 verb the windows-shell pack binds (packs/windows-shell.json, "kind": "module").
    private static readonly string[] PackVerbs =
    [
        "windows.window.focus", "windows.window.maximize", "windows.window.topmost", "windows.desktops.next", "windows.desktops.prev",
        "windows.placer.zone", "windows.placer.nextMonitor", "windows.placer.next", "windows.placer.prev", "windows.placer.throw",
        "windows.hdr.toggle", "windows.display.refreshToggle", "windows.monitor.next", "windows.monitor.brightnessUp",
        "windows.monitor.brightnessDown", "windows.browser.next", "windows.browser.prev", "windows.browser.focus",
    ];

    private static readonly string[] PackReadouts =
    [
        "windows.window.maximized", "windows.window.topmost", "windows.desktops.current", "windows.placer.zone", "windows.hdr.state",
        "windows.display.refreshRate", "windows.monitor.brightness", "windows.gameMode.active", "windows.browser.preview",
    ];

    [Test]
    public async Task One_composite_windows_provider_resolves_every_W1_verb_and_readout_the_pack_uses()
    {
        await using var f = new Fixture();
        Assert.True(ReferenceEquals(f.Provider, WindowsVerbProvider.GetOrRegister(f.Registry, f.Rig.Time)), "one provider per module: W2 adds a part");
        Assert.Single(f.Registry.Providers.Where(p => p.Module == "windows"));
        foreach (var v in PackVerbs) Assert.True(f.Registry.TryResolveVerb(v, out _, out _), v);
        foreach (var r in PackReadouts) Assert.True(f.Registry.TryReadReadout(r, out _), r);
        // The pack file itself, when the tests run from prism-control/.
        var pack = Path.Combine(Directory.GetCurrentDirectory(), "packs", "windows-shell.json");
        if (File.Exists(pack))
        {
            var text = File.ReadAllText(pack);
            foreach (var v in PackVerbs) Assert.Contains($"\"{v}\"", text);
        }
        // W2's verbs are not W1's: they stay "not built" until W2 adds its part.
        Assert.False(f.Registry.TryResolveVerb("windows.power.lock", out _, out _));
        Assert.Equal(VerbAvailability.ModuleMissing, f.Provider.GetStatus("windows.power.lock").Availability);
        Assert.Equal(f.Part.Verbs.Count, f.Provider.Verbs.Count);
    }

    [Test]
    public async Task Focus_maximize_and_topmost_act_on_the_target_window_and_report_the_true_state()
    {
        await using var f = new Fixture();
        Assert.True((await f.Invoke("windows.window.focus", new { mode = "zorder", slot = 2 })).Ok);
        Assert.Equal(Browser, f.Rig.Foreground.Calls[^1]);
        Assert.False((await f.Invoke("windows.window.focus", new { mode = "pinned", app = "absent.exe" })).Ok);

        f.Rig.Foreground.LastExternal = Editor;
        Assert.False(f.Read("windows.window.topmost").State!.Value);
        Assert.True((await f.Invoke("windows.window.topmost", target: Editor)).Ok);
        Assert.Contains("topmost True", string.Join("|", f.Rig.WindowWriter.Calls));
        Assert.True(f.Read("windows.window.topmost").State!.Value, "re-read after the change");
        Assert.True((await f.Invoke("windows.window.maximize", target: Editor)).Ok);
        Assert.True(f.Read("windows.window.maximized").State!.Value);

        // An admin window is refused up front: nothing is written.
        f.Rig.Geometry.Add(0x1009, new PixelRect(0, 0, 500, 500), "admin.exe", elevated: true);
        var calls = f.Rig.WindowWriter.Calls.Count;
        var r = await f.Invoke("windows.placer.zone", new { zone = "leftHalf" }, target: 0x1009);
        Assert.False(r.Ok);
        Assert.Contains("ADMIN", r.Message);
        Assert.Equal(calls, f.Rig.WindowWriter.Calls.Count);
    }

    [Test]
    public async Task Zones_parse_the_packs_camelCase_and_the_placer_cursor_walks_every_monitor()
    {
        await using var f = new Fixture();
        Assert.Equal(Placement.ZoneId.LeftHalf, W1VerbPart.ParseZone("leftHalf"));
        Assert.Equal(Placement.ZoneId.RightTwoThirds, W1VerbPart.ParseZone("rightTwoThirds"));
        Assert.Equal(Placement.ZoneId.TopLeft, W1VerbPart.ParseZone("top-left"));
        Assert.Null(W1VerbPart.ParseZone("sideways"));
        Assert.False((await f.Invoke("windows.placer.zone", new { zone = "sideways" }, target: Editor)).Ok, "an unknown zone is never a silent default");

        f.Rig.Foreground.LastExternal = Editor;
        Assert.True((await f.Invoke("windows.placer.zone", new { zone = "rightHalf", monitor = "primary" }, target: Editor)).Ok);
        Assert.Contains("bounds", string.Join("|", f.Rig.WindowWriter.Calls));
        var first = f.Read("windows.placer.zone").Text;
        await f.Invoke("windows.placer.next", ticks: 3);
        var later = f.Read("windows.placer.zone").Text;
        Assert.NotEqual(first, later);
        await f.Invoke("windows.placer.prev", ticks: -99);
        Assert.Equal(first, f.Read("windows.placer.zone").Text, "clamped at the first zone");
        var before = f.Rig.WindowWriter.Calls.Count;
        Assert.True((await f.Invoke("windows.placer.throw", target: Editor)).Ok);
        Assert.True(f.Rig.WindowWriter.Calls.Count > before);
        Assert.True((await f.Invoke("windows.placer.nextMonitor", new { direction = "next" }, target: Editor)).Ok);
    }

    [Test]
    public async Task Desktops_step_once_per_turn_event_and_report_index_of_count()
    {
        await using var f = new Fixture();
        Assert.Equal("1/3", f.Read("windows.desktops.current").Text);
        Assert.True((await f.Invoke("windows.desktops.next", ticks: 7)).Ok);
        Assert.Equal(1, f.Rig.Desktops.Current);
        await f.Invoke("windows.desktops.next", ticks: 1);   // within 300 ms of the last step: ignored
        Assert.Equal(1, f.Rig.Desktops.Current);
        f.Rig.Time.Advance(TimeSpan.FromMilliseconds(400));
        await f.Invoke("windows.desktops.goto", new { index = 3 });
        Assert.Equal(2, f.Rig.Desktops.Current);
        var d = f.Read("windows.desktops.current");
        Assert.Equal("3", d.Fields!["index"]);
        Assert.Equal("Desktop 3", d.Fields["name"]);
        f.Rig.Time.Advance(TimeSpan.FromMilliseconds(400));
        Assert.False((await f.Invoke("windows.desktops.goto", new { index = 9 })).Ok);
    }

    [Test]
    public async Task Hdr_and_refresh_go_through_the_display_service_with_resync_and_keep()
    {
        await using var f = new Fixture();
        Assert.False(f.Read("windows.hdr.state").State!.Value, "the primary UW34 starts with HDR off");
        Assert.True((await f.Invoke("windows.hdr.toggle", new { monitor = "primary" })).Ok);
        Assert.Equal("hdr on type 16", f.Rig.DisplayWriter.Calls.Single());
        f.Rig.Services.Display.Invalidate();
        Assert.True(f.Read("windows.hdr.state").State!.Value);

        Assert.Equal(240, f.Read("windows.display.refreshRate").Number);
        var r = await f.Invoke("windows.display.refreshToggle");
        Assert.True(r.Ok);
        Assert.Contains("KEEP", r.Message);
        Assert.Contains("apply 3440x1440 @ 120 Hz", string.Join("|", f.Rig.DisplayWriter.Calls));
        Assert.True((await f.Invoke("windows.display.refreshToggle")).Ok, "the second press keeps it");
        Assert.Contains("apply 3440x1440 @ 120 Hz persist", string.Join("|", f.Rig.DisplayWriter.Calls));
        Assert.Equal((240, 120), W1VerbPart.Presets([new(3440, 1440, 240), new(3440, 1440, 120), new(3440, 1440, 60)], new(3440, 1440, 240), 0, 0));
        Assert.Equal((165, 144), W1VerbPart.Presets([new(2560, 1440, 165), new(2560, 1440, 144)], new(2560, 1440, 165), 0, 0));
    }

    [Test]
    public async Task Brightness_steps_over_ddc_on_the_selected_monitor()
    {
        await using var f = new Fixture();
        _ = f.Read("windows.monitor.brightness");               // warms the first monitor's value (a background GET)
        for (var i = 0; i < 200 && f.Read("windows.monitor.brightness").Number is null; i++) await Task.Delay(5);
        Assert.Equal(90, f.Read("windows.monitor.brightness").Number);
        Assert.Equal("QH32", f.Read("windows.monitor.current").Text);
        Assert.True((await f.Invoke("windows.monitor.brightnessDown", new { step = 5 }, ticks: -2)).Ok);
        Assert.Equal(80, f.Read("windows.monitor.brightness").Number, "the target shows at once");
        for (var i = 0; i < 40 && !f.Rig.DdcWriter.Snapshot().Any(w => w.Value == 80); i++) { f.Rig.Time.Advance(TimeSpan.FromMilliseconds(100)); await Task.Delay(5); }
        Assert.True(f.Rig.DdcWriter.Snapshot().Any(w => w.Code == Vcp.Brightness && w.Value == 80));
        await f.Invoke("windows.monitor.next");
        Assert.Equal("UW34", f.Read("windows.monitor.current").Text);
    }

    [Test]
    public async Task The_window_browser_cursor_previews_without_titles_in_streamer_safe_mode()
    {
        await using var f = new Fixture();
        f.Rig.Foreground.LastExternal = Editor;
        Assert.Equal("Editor · notes.example — Example Editor", f.Read("windows.browser.preview").Text);
        f.Rig.Options.Apply(new WinShellGlobalSettings { StreamerSafe = true });
        Assert.Equal("Editor", f.Read("windows.browser.preview").Text);
        await f.Invoke("windows.browser.next", ticks: 1);
        Assert.Equal("Browser", f.Read("windows.browser.preview").Text);
        Assert.True((await f.Invoke("windows.browser.focus")).Ok);
        Assert.Equal(Browser, f.Rig.Foreground.Calls[^1]);
        Assert.True(f.Registry.Providers.Single(p => p.Module == "windows").Readouts.Single(r => r.Id == "windows.browser.preview").Privacy == "streamer-hide");
    }

    [Test]
    public async Task Nothing_runs_without_a_direct_deck_gesture_and_game_mode_reads_are_live()
    {
        await using var f = new Fixture();
        var r = await f.Invoke("windows.window.topmost", direct: false, target: Editor);
        Assert.False(r.Ok);
        Assert.Empty(f.Rig.WindowWriter.Calls);
        Assert.False(f.Read("windows.gameMode.active").State!.Value);
        f.Rig.Game.State = new Switcher.GameState(3, 5, false);
        f.Rig.Time.Advance(TimeSpan.FromSeconds(3));
        Assert.True(f.Read("windows.gameMode.active").State!.Value);
        Assert.Equal("Fullscreen game", f.Read("windows.gameMode.state").Text);
        await f.Invoke("windows.gameMode.settings");
        Assert.Equal("ms-settings:gaming-gamemode", f.Urls.Single());
    }

    [Test]
    public async Task Safe_mode_never_reaches_a_real_writer_through_the_provider()
    {
        await using var f = new Fixture(safeMode: true, tripwires: true);
        f.Rig.Foreground.LastExternal = Editor;
        var before = TripwireException.Trips;
        foreach (var (verb, args) in new (string, object?)[]
        {
            ("windows.window.topmost", null), ("windows.window.maximize", null), ("windows.placer.zone", new { zone = "leftHalf" }),
            ("windows.placer.nextMonitor", null), ("windows.placer.throw", null), ("windows.hdr.toggle", null), ("windows.display.refreshToggle", null),
            ("windows.desktops.next", null), ("windows.window.focus", new { slot = 2 }), ("windows.browser.focus", null),
        })
        {
            f.Rig.Time.Advance(TimeSpan.FromMilliseconds(400));
            await f.Invoke(verb, args, target: Editor);
        }
        Assert.Equal(before, TripwireException.Trips, "a real writer was reached in safe mode: " + string.Join(", ", TripwireException.What));
    }
}
#endif
