using PrismControl.Core.Devices;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;
using static PrismControl.Macros.Tests.K;

namespace PrismControl.Macros.Tests;

public class MacroKeyTests
{
    private static MacroKeySettings CopyPaste(bool withHold) => new()
    {
        Label = "Copy",
        Macro = MacroScript.Of(new ChordStep("Ctrl+C")),
        LongMacro = withHold ? MacroScript.Of(new ChordStep("Ctrl+V")) : new MacroScript(),
    };

    [Test]
    public async Task Press_runs_the_macro_on_galleon_and_plus()
    {
        foreach (var (device, at) in new[] { (TestDevices.Galleon, new Coordinates(2, 3)), (TestDevices.Plus, new Coordinates(3, 1)) })
        foreach (var theme in new[] { "night", "day" })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<MacroKey>(device, at, CopyPaste(false), theme: theme);
            await h.PressAsync();
            await Drive.ToIdleAsync(h);
            K.SequenceEqual([Down(0xA2, 0x1D), Down(0x43, 0x2E), Up(0x43, 0x2E), Up(0xA2, 0x1D)], Assert.Single(rig.Sink.Batches), device.Name);
            Assert.Equal(1, h.Count("showOk"));
            Assert.Equal(0, h.Count("showAlert"));
            Assert.Equal("Done.", h.Action.Status);
            Assert.NotNull(h.LastSvg);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Hold_runs_the_alternate_list_and_a_short_press_the_main_one()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), CopyPaste(true));
        await h.PressAsync(TimeSpan.FromSeconds(1));
        await Drive.ToIdleAsync(h);
        Assert.Equal((ushort)'V', Assert.Single(rig.Sink.Batches)[1].Vk, "hold = Ctrl+V");
        await h.PressAsync(TimeSpan.FromMilliseconds(100));
        await Drive.ToIdleAsync(h);
        Assert.Equal(2, rig.Sink.Count);
        Assert.Equal((ushort)'C', rig.Sink.Batches[1][1].Vk, "short press = Ctrl+C");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Without_a_hold_list_a_long_hold_is_one_press()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Plus, new(0, 0), CopyPaste(false));
        await h.PressAsync(TimeSpan.FromSeconds(2));
        await Drive.ToIdleAsync(h);
        Assert.Single(rig.Sink.Batches);
    }

    [Test]
    public async Task Presses_while_running_are_ignored_and_the_key_beats()
    {
        var rig = new TestRig();
        var settings = new MacroKeySettings { Label = "Slow", Macro = MacroScript.Of(new ChordStep("A"), new DelayStep(2000), new ChordStep("B")) };
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(1, 1), settings);
        var idle = h.LastImage;
        Assert.NotNull(idle);
        await h.KeyDownAsync();
        await Drive.UntilAsync(() => rig.Sink.Count == 1, "the first step");
        await h.KeyUpAsync();
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(600));
        var running = h.LastImage;
        Assert.NotEqual(idle, running, "a running face replaces the idle face");
        await h.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        Assert.NotEqual(running, h.LastImage, "the beat alternates");
        await h.PressAsync(); // ignored: still running
        await Drive.ToIdleAsync(h);
        Assert.Equal(2, rig.Sink.Count, "A and B once each; the second press did not queue another run");
        Assert.Equal(idle, h.LastImage, "back to the idle face");
        Assert.Equal(1, h.Count("showOk"));
        h.AssertFramesAreDeckSafe();
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(4, rig.Sink.Count, "after it finished, a press runs it again");
    }

    [Test]
    public async Task Blocked_by_an_elevated_window_alerts_and_sends_nothing()
    {
        var rig = new TestRig();
        rig.Foreground.Current = FakeForeground.Elevated("ExampleAdminTool.exe");
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 2), CopyPaste(false));
        await h.PropertyInspectorAppearAsync();
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Equal(0, h.Count("showOk"));
        Assert.Contains("ExampleAdminTool.exe runs as administrator", h.Action.Status);
        var state = h.CallsOf("sendToPropertyInspector").Last().Payload!;
        Assert.Equal("pi.state", state["type"]!.GetValue<string>());
        Assert.Contains("administrator", state["data"]!["status"]!.GetValue<string>());
    }

    [Test]
    public async Task An_empty_macro_does_nothing_and_says_so()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Plus, new(1, 0), new MacroKeySettings());
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Contains("set it up", h.Action.Status);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Removing_the_key_cancels_its_macro()
    {
        var rig = new TestRig();
        var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), new MacroKeySettings { Macro = MacroScript.Of(new DelayStep(30_000), new ChordStep("A")) });
        await h.PressAsync();
        await Drive.UntilAsync(() => h.Time.UntilNextTimer is not null, "the delay");
        await h.DisposeAsync();
        await ((IMacroRunHost)h.Action).WhenIdleAsync().WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(0, rig.Sink.Count);
    }

    [Test]
    public async Task Pi_catalog_and_describe_round_trip()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), CopyPaste(true));
        var hello = await h.PiMessageAsync("pi.ready");
        Assert.Equal("pi.hello", hello!["type"]!.GetValue<string>());
        Assert.Equal(1, hello["data"]!["settings"]!["macro"]!["version"]!.GetValue<int>());
        Assert.Equal("Ctrl+C", hello["data"]!["state"]!["summary"]!.GetValue<string>());
        var catalog = await h.PiMessageAsync("macros.catalog", null, requestId: 7);
        Assert.Equal(true, catalog!["ok"]!.GetValue<bool>());
        Assert.Equal(6, catalog["data"]!["stepTypes"]!.AsArray().Count);
        var described = await h.PiMessageAsync("macros.describe", new { chords = new { chord = "ctrl+alt+del" } }, requestId: 8);
        Assert.Contains("Ctrl+Alt+Delete", described!["data"]!["chords"]!["chord"]!["problems"]![0]!.GetValue<string>());
    }
}

public class SimpleKeyTests
{
    [Test]
    public async Task Hotkey_sends_its_chord_on_key_down()
    {
        foreach (var (device, at) in new[] { (TestDevices.Galleon, new Coordinates(1, 0)), (TestDevices.Plus, new Coordinates(0, 1)) })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<HotkeyKey>(device, at, new HotkeySettings { Chord = "win+shift+s" });
            await h.KeyDownAsync();
            await Drive.ToIdleAsync(h);
            K.SequenceEqual(
            [
                Down(0xA0, 0x2A), Down(0x5B, 0x5B, KeyFlags.ExtendedKey), Down(0x53, 0x1F),
                Up(0x53, 0x1F), Up(0x5B, 0x5B, KeyFlags.ExtendedKey), Up(0xA0, 0x2A),
            ], Assert.Single(rig.Sink.Batches), device.Name);
            await h.KeyUpAsync();
            Assert.Equal(0, h.Count("showOk"), "a hotkey does not flash a check mark");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Hotkey_without_a_chord_or_with_a_bad_one_alerts()
    {
        foreach (var chord in new[] { null, "Ctrl+Bogus", "Ctrl+Alt+Del" })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<HotkeyKey>(TestDevices.Galleon, new(0, 0), new HotkeySettings { Chord = chord }, theme: "day");
            await h.PressAsync();
            await Drive.ToIdleAsync(h);
            Assert.Equal(0, rig.Sink.Count, chord ?? "null");
            Assert.Equal(1, h.Count("showAlert"), chord ?? "null");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Hotkey_redraws_when_the_pi_changes_the_chord()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<HotkeyKey>(TestDevices.Plus, new(0, 0), new HotkeySettings());
        var unset = h.LastImage;
        await h.SettingsFromPropertyInspectorAsync(new HotkeySettings { Chord = "Ctrl+Shift+T", Label = "Reopen" });
        Assert.NotEqual(unset, h.LastImage);
        await h.KeyDownAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal((ushort)'T', rig.Sink.Batches[0][2].Vk);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Type_text_types_unicode()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<TypeTextKey>(TestDevices.Galleon, new(2, 0), new TypeTextSettings { Text = "Hi 😀\n" });
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        var all = rig.Sink.All;
        Assert.Equal(12, all.Count, "H, i, space, two surrogate units, Enter: six pairs");
        Assert.Equal((ushort)0xD83D, all[6].Scan);
        Assert.Equal((ushort)0x0D, all[10].Vk);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Launch_opens_urls_through_the_launcher()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Plus, new(2, 0), new LaunchSettings { Target = "https://www.example.com/docs" });
        Assert.Equal("https · www.example.com", h.Action.Opens());
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal("https://www.example.com/docs", Assert.Single(rig.Launcher.Opened).AbsoluteUri);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Equal(0, rig.Sink.Count);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Launch_starts_or_focuses_an_app()
    {
        var rig = new TestRig();
        rig.Launcher.Running = true;
        var settings = new LaunchSettings { Target = @"C:\Tools\Example\example.exe", Arguments = "--new-window", FocusIfRunning = true };
        // Authored in this PC's property inspector: trusted as saved.
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(1, 2), new LaunchSettings());
        await h.SettingsFromPropertyInspectorAsync(settings);
        Assert.Equal("example.exe (focus if running)", h.Action.Opens());
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Single(rig.Launcher.FocusAttempts);
        Assert.Empty(rig.Launcher.Launched);
        rig.Launcher.Running = false;
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        var spec = Assert.Single(rig.Launcher.Launched);
        Assert.Equal("--new-window", spec.Arguments);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Launch_refuses_unsafe_targets_before_anything_runs()
    {
        foreach (var target in new[] { "javascript:alert(1)", "ftp://example.com/file", @"..\x.exe", "https://user:pw@example.com" })
        {
            var rig = new TestRig();
            await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 0), new LaunchSettings { Target = target });
            await h.PressAsync();
            await Drive.ToIdleAsync(h);
            Assert.Empty(rig.Launcher.Launched);
            Assert.Empty(rig.Launcher.Opened);
            Assert.Equal(1, h.Count("showAlert"), target);
            Assert.DoesNotContain("·", h.Action.Opens(), target);
        }
    }

    [Test]
    public async Task Launch_and_media_use_the_default_form()
    {
        var rig = new TestRig();
        await using var launch = await rig.AppearAsync<LaunchKey>(TestDevices.Plus, new(0, 0), new LaunchSettings());
        var hello = await launch.PiMessageAsync("pi.ready");
        var fields = hello!["data"]!["form"]!["fields"]!.AsArray().Select(f => f!["setting"]?.GetValue<string>()).Where(s => s is not null).ToList();
        Assert.Equal("target,arguments,workingDirectory,focusIfRunning,label", string.Join(",", fields));
        await using var media = await rig.AppearAsync<MediaKeyAction>(TestDevices.Plus, new(1, 0), new MediaKeySettings());
        var mh = await media.PiMessageAsync("pi.ready");
        var options = mh!["data"]!["form"]!["fields"]![0]!["options"]!.AsArray();
        Assert.Equal("", options[0]!["value"]!.GetValue<string>(), "a fresh media key starts unset");
        Assert.Equal(8, options.Count);
    }

    [Test]
    public async Task Media_key_sends_the_key_and_starts_unset()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<MediaKeyAction>(TestDevices.Galleon, new(0, 3), new MediaKeySettings());
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(0, rig.Sink.Count, "nothing is sent until a key is chosen");
        Assert.Equal(1, h.Count("showAlert"));
        await h.SettingsFromPropertyInspectorAsync(new MediaKeySettings { Key = "volumeUp" });
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        K.SequenceEqual([Down(0xAF, 0x30, KeyFlags.ExtendedKey), Up(0xAF, 0x30, KeyFlags.ExtendedKey)], Assert.Single(rig.Sink.Batches));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Fresh_actions_are_inert()
    {
        // The fake host places every action with empty settings and presses at random: nothing may be typed or launched.
        var rig = new TestRig();
        await using (var a = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), null)) { await a.PressAsync(TimeSpan.FromSeconds(1)); await Drive.ToIdleAsync(a); }
        await using (var b = await rig.AppearAsync<HotkeyKey>(TestDevices.Galleon, new(1, 0), null)) { await b.PressAsync(); await Drive.ToIdleAsync(b); }
        await using (var c = await rig.AppearAsync<TypeTextKey>(TestDevices.Galleon, new(2, 0), null)) { await c.PressAsync(); await Drive.ToIdleAsync(c); }
        await using (var d = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 1), null)) { await d.PressAsync(); await Drive.ToIdleAsync(d); }
        await using (var e = await rig.AppearAsync<MediaKeyAction>(TestDevices.Galleon, new(1, 1), null)) { await e.PressAsync(); await Drive.ToIdleAsync(e); }
        await using (var f = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0), null, Core.Devices.Controller.Encoder))
        {
            await f.RotateAsync(12);
            await f.DialPressAsync();
            await Drive.ToIdleAsync(f);
            f.AssertFramesAreDeckSafe();
        }
        Assert.Equal(0, rig.Sink.Count);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Empty(rig.Launcher.Opened);
        Assert.Empty(rig.Launcher.FocusAttempts);
    }

    [Test]
    public async Task Sample_counter_still_works()
    {
        await using var h = await ActionHarness<SampleCounterKey>.AppearAsync(TestDevices.Plus, new(0, 0));
        await h.PressAsync();
        Assert.Equal(1, h.LastSettingsAs<SampleCounterSettings>().Count);
        h.AssertFramesAreDeckSafe();
    }
}
