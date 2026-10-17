using System.ComponentModel;
using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

/// <summary>
/// Safe mode and the dry run (review B #3), log privacy (#8), and the Type Text default form. The engine under test is
/// always wired to fakes; the module tests only build dry-run engines, and nothing is pressed before that is proven.
/// </summary>
public class SafeModeTests
{
    [Test]
    public void The_dry_run_switch_fails_closed()
    {
        foreach (var (value, dry) in new (string?, bool)[]
        {
            (null, false), ("", false), ("0", false), ("false", false), ("FALSE", false), (" False ", false), (" 0 ", false),
            ("1", true), ("true", true), ("True", true), ("yes", true), ("on", true), ("no", true), ("off", true), ("2", true), (" ", true),
        })
            Assert.Equal(dry, DryRun.Requested(value), $"\"{value ?? "null"}\"");
        Assert.True(DryRun.IsOn(safeMode: true, "0"), "safe mode wins over an explicit 0");
        Assert.False(DryRun.IsOn(safeMode: false, null));
        Assert.Equal(Core.Hosting.SafeModeEnvironment.MacrosDryRunVariable, MacrosModule.DryRunVariable);
    }

    [Test]
    public async Task Presses_and_turns_change_nothing_real_in_safe_mode()
    {
        // A live engine wired to the recording fakes: a safe-mode action must not reach even those.
        var rig = new TestRig();
        var launch = new LaunchStep { Target = @"C:\Tools\Example\example.exe", FocusIfRunning = true };
        var macro = rig.Trusted(MacroScript.Of(new ChordStep("Ctrl+C"), new TextStep("Hi\n"), new MediaKeyStep(MediaKey.Mute), launch, new OpenUrlStep("https://example.com/status")));
        await using (var a = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), new MacroKeySettings { Macro = macro }, safeMode: true))
        {
            await a.PressAsync();
            await Drive.ToIdleAsync(a);
            Assert.Equal("Done: 5 steps.", a.Action.Status, "the UI still responds");
            Assert.Equal(1, a.Count("showOk"));
        }
        await using (var b = await rig.AppearAsync<HotkeyKey>(TestDevices.Galleon, new(1, 0), new HotkeySettings { Chord = "Win+Shift+S" }, safeMode: true))
        {
            await b.PressAsync();
            await Drive.ToIdleAsync(b);
        }
        await using (var c = await rig.AppearAsync<TypeTextKey>(TestDevices.Plus, new(2, 0), new TypeTextSettings { Text = "The Example Ensemble" }, safeMode: true))
        {
            await c.PressAsync();
            await Drive.ToIdleAsync(c);
        }
        await using (var d = await rig.AppearAsync<MediaKeyAction>(TestDevices.Plus, new(3, 0), new MediaKeySettings { Key = "volumeUp" }, safeMode: true))
        {
            await d.PressAsync();
            await Drive.ToIdleAsync(d);
        }
        await using (var e = await rig.AppearAsync<LaunchKey>(TestDevices.Plus, new(0, 1), new LaunchSettings { Target = "https://example.com/docs" }, safeMode: true))
        {
            await e.PressAsync();
            await Drive.ToIdleAsync(e);
        }
        var zoom = DialPresets.All.Single(p => p.Id == "zoom");
        await using (var f = await rig.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0),
            new MacroDialSettings { Right = zoom.Right, Left = zoom.Left, Push = zoom.Push }, Controller.Encoder, safeMode: true))
        {
            await f.RotateAsync(3);
            await Drive.ToIdleAsync(f);
            await f.RotateAsync(-1);
            await Drive.ToIdleAsync(f);
            await f.DialPressAsync();
            await Drive.ToIdleAsync(f);
            f.AssertFramesAreDeckSafe();
        }

        Assert.Equal(0, rig.Sink.Count, "no SendInput");
        Assert.Empty(rig.Launcher.Launched);
        Assert.Empty(rig.Launcher.Opened);
        Assert.Empty(rig.Launcher.FocusAttempts);
        var dry = rig.Engine.Dry;
        Assert.Equal(1, dry.Launches, "would have started example.exe");
        Assert.Equal(1, dry.FocusRequests, "would have looked for its window");
        Assert.Equal(2, dry.UrlsOpened);
        // Macro: chord + 3 text pairs + media = 3 calls; hotkey 1; text 1; media 1; dial 3 right + 1 left + 1 push.
        Assert.Equal(3 + 1 + 1 + 1 + 5, dry.SendCalls);
        Assert.True(dry.KeyEvents > 40, dry.KeyEvents.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    [Test]
    public async Task A_dry_run_engine_never_uses_the_real_sink_or_launcher()
    {
        var rig = new TestRig(dryRun: true);
        Assert.True(rig.Engine.IsDryRun);
        Assert.True(ReferenceEquals(rig.Engine.Dry.Input, rig.Engine.Input));
        Assert.True(ReferenceEquals(rig.Engine.Dry.Launcher, rig.Engine.Launcher));
        var r = await rig.Engine.RunAsync(rig.Trusted(MacroScript.Of(new ChordStep("Ctrl+V"), new LaunchStep { Target = "notepad.exe" }, new OpenUrlStep("https://example.com"))));
        Assert.Equal(MacroRunStatus.Completed, r.Status, r.Describe());
        Assert.Equal(0, rig.Sink.Count);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Empty(rig.Launcher.Opened);
        Assert.Equal(3, rig.Engine.Dry.Total);
    }

    [Test]
    public async Task The_safe_mode_module_suppresses_everything_and_logs_no_private_data()
    {
        using var env = new EnvScope(MacrosModule.DryRunVariable, null);
        using var dir = new TempDir();
        var ctx = new FakeModuleContext(dir.Path, safeMode: true);
        var module = new MacrosModule();
        module.Initialize(ctx);
        var engine = ctx.Services.Get<MacroEngine>();
        // Proven dry before anything runs: the real sink and launcher were never built.
        Assert.True(engine.IsDryRun);
        Assert.True(ReferenceEquals(engine.Dry.Input, engine.Input));
        Assert.True(ReferenceEquals(engine.Dry.Launcher, engine.Launcher));
        Assert.Contains("Macro engine ready (DRY RUN: safe mode", ctx.RecordingLog.Text);

        // URL and launch steps need no foreground check, so this touches nothing on the PC (not even a read).
        var script = MacroScript.Of(new OpenUrlStep("https://example.com/private/path?token=demo-secret"),
            new LaunchStep { Target = @"C:\Users\Example\AppData\Local\Example\example.exe", Arguments = "--token demo-secret" });
        foreach (var c in engine.CheckLaunches(script)) engine.Trust.Trust(c.Spec);
        for (var i = 0; i < 2; i++)
        {
            var r = await engine.RunAsync(script, new MacroRunOptions { Source = "test" });
            Assert.Equal(MacroRunStatus.Completed, r.Status, r.Describe());
        }
        Assert.Equal(2, engine.Dry.UrlsOpened);
        Assert.Equal(2, engine.Dry.Launches);
        var log = ctx.RecordingLog.Text;
        Assert.Contains("example.com", log);
        foreach (var leak in new[] { "token", "demo-secret", "/private", @"C:\Users", "AppData" })
            Assert.DoesNotContain(leak, log, "the log carries hosts and file names only");
        Assert.True(ctx.RecordingLog.Lines.Count(l => l.Contains("would open", StringComparison.Ordinal) && l.StartsWith("Info", StringComparison.Ordinal)) <= 1,
            "suppressed writes are logged at Info once per process, then at Debug");
        await module.DisposeAsync();
    }

    // ------------------------------------------------------------------ #8 no user paths or URL queries in logs

    [Test]
    public void Launch_errors_carry_no_user_paths_or_url_queries()
    {
        var spec = LaunchPolicy.Resolve(@"C:\Users\Example\AppData\Local\Example\example.exe", null, @"C:\Users\Example\Documents");
        // ShellExecute's own message names the full path and the start folder.
        var ex = new Win32Exception(1155, @"No application is associated with C:\Users\Example\AppData\Local\Example\example.exe (C:\Users\Example\Documents)");
        var message = ShellAppLauncher.LaunchFailure(spec, ex);
        Assert.DoesNotContain(@"C:\Users", message);
        Assert.Contains("example.exe could not be started", message);
        Assert.Contains(new Win32Exception(1155).Message.Trim().TrimEnd('.'), message, "the system text for the code instead");
        Assert.Equal("example.exe was not found.", ShellAppLauncher.LaunchFailure(spec, new Win32Exception(2, @"C:\Users\Example\x")));
        Assert.Equal("Windows denied access to example.exe.", ShellAppLauncher.LaunchFailure(spec, new Win32Exception(5, @"C:\Users\Example\x")));

        var url = new Uri("https://example.com/private/path?token=demo-secret");
        var u = ShellAppLauncher.UrlFailure(url, new Win32Exception(1155, url.AbsoluteUri + " could not be opened"));
        Assert.Contains("example.com", u);
        foreach (var leak in new[] { "token", "demo-secret", "/private" }) Assert.DoesNotContain(leak, u);
    }

    [Test]
    public async Task Unexpected_step_errors_log_the_type_only()
    {
        var log = new RecordingLog();
        var registry = MacroStepRegistry.Default.With(typeof(PathThrowingStep));
        var rig = new TestRig(registry, log: log);
        var r = await rig.Engine.RunAsync(MacroScript.Of(new PathThrowingStep()));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        Assert.Equal("Step 1 failed: Unexpected error (IOException).", r.Describe());
        Assert.Contains("IOException", log.Text);
        Assert.DoesNotContain(@"C:\Users", log.Text);
        Assert.DoesNotContain("secret", log.Text);
    }

    // ------------------------------------------------------------------ Type Text on the default page (PiForm.TextArea)

    [Test]
    public async Task Type_text_uses_the_default_form_with_a_text_area()
    {
        Assert.Null(typeof(TypeTextKey).GetCustomAttribute<StreamDeckActionAttribute>()!.PropertyInspector);
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<TypeTextKey>(TestDevices.Galleon, new(0, 0), new TypeTextSettings());
        var hello = await h.PiMessageAsync("pi.ready");
        var fields = hello!["data"]!["form"]!["fields"]!.AsArray();
        Assert.Equal("text,charDelayMs,label", string.Join(",", fields.Select(f => f!["setting"]?.GetValue<string>()).OfType<string>()));
        var text = fields.Single(f => f!["setting"]?.GetValue<string>() == "text")!;
        Assert.Equal("textarea", text["kind"]!.GetValue<string>());
        var delay = fields.Single(f => f!["setting"]?.GetValue<string>() == "charDelayMs")!;
        Assert.Equal((double)TextStep.MaxCharDelayMs, delay["max"]!.GetValue<double>());

        await h.SettingsFromPropertyInspectorAsync(new TypeTextSettings { Text = "line one\nline two" });
        await h.PressAsync();
        await Drive.ToIdleAsync(h);
        Assert.Equal(2 * ("line one".Length + 1 + "line two".Length), rig.Sink.All.Count, "a down and an up per character, Enter for the new line");
        h.AssertFramesAreDeckSafe();
    }
}

/// <summary>A step that fails with an exception whose message holds a user path (as IO errors do).</summary>
[MacroStep("test-path-throws", "Path throws (test)", Order = 97)]
public sealed class PathThrowingStep : MacroStep
{
    public override string Describe() => "Throws an IO error";
    public override Task ExecuteAsync(MacroContext ctx) => throw new IOException(@"Could not read C:\Users\Example\secret.txt");
}
