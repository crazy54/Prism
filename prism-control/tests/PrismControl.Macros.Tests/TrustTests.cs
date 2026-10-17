using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

/// <summary>
/// Review B #2: trust on first use for launch steps. Settings travel with exported profiles, so a launch step from a shared
/// profile must not run until the user saw exactly what it starts on this PC. Fakes only: nothing is started.
/// </summary>
public class LaunchTrustTests
{
    private static LaunchSettings Example() => new() { Target = @"C:\Tools\Example\example.exe", Arguments = "--profile demo", WorkingDirectory = @"C:\Tools\Example" };

    private static async Task PressAndWaitAsync<T>(ActionHarness<T> h) where T : Core.Actions.ActionBase, new()
    {
        await h.PressAsync();
        await Drive.RunsDoneAsync(h);
    }

    [Test]
    public async Task An_imported_profile_does_not_run_until_trusted_here()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 0), Example()); // arrives with the profile
        Assert.Equal("review", h.Action.Face, "the key says so before anyone presses it");
        await PressAndWaitAsync(h);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Empty(rig.Launcher.FocusAttempts);
        Assert.Equal(1, h.Count("showAlert"));
        Assert.Contains("isn't trusted on this PC", h.Action.Status);
        Assert.Equal("review", h.Action.Face);

        // The PI shows exactly what would run, and a Trust button.
        var hello = await h.PiMessageAsync("pi.ready");
        var fields = hello!["data"]!["form"]!["fields"]!.AsArray();
        Assert.True(fields.Any(f => f!["kind"]!.GetValue<string>() == "button" && f["command"]?.GetValue<string>() == "macros.trust"), "a Trust button");
        var state = hello["data"]!["state"]!;
        Assert.Equal(@"C:\Tools\Example\example.exe --profile demo   (start in C:\Tools\Example)", state["wouldRun"]!.GetValue<string>());
        Assert.Contains("Not trusted", state["review"]!.GetValue<string>());
        Assert.False(state["launches"]![0]!["trusted"]!.GetValue<bool>());

        // Trust: it runs.
        var answer = await h.PiMessageAsync("macros.trust", null, requestId: 3);
        Assert.True(answer!["ok"]!.GetValue<bool>());
        Assert.True(answer["data"]!["launches"]![0]!["trusted"]!.GetValue<bool>());
        Assert.Equal("Trusted on this PC.", answer["data"]!["review"]!.GetValue<string>());
        Assert.Equal("idle", h.Action.Face);
        await PressAndWaitAsync(h);
        var spec = Assert.Single(rig.Launcher.Launched);
        Assert.Equal("--profile demo", spec.Arguments);
        Assert.Equal(@"C:\Tools\Example", spec.WorkingDirectory);
        Assert.Equal(0, h.Count("setSettings"), "trust is never written into the action's settings (it would travel with the profile)");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Authoring_in_this_pi_trusts_the_step_but_resaving_an_import_does_not()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Plus, new(1, 0), Example());
        await h.PropertyInspectorAppearAsync();
        // Opening the PI of an imported key and changing another field re-saves the launch unchanged: still untrusted.
        var s = Example();
        s.Label = "Example";
        await h.SettingsFromPropertyInspectorAsync(s);
        Assert.Equal("review", h.Action.Face);
        await PressAndWaitAsync(h);
        Assert.Empty(rig.Launcher.Launched);

        // Typing a new target in this PC's PI is the user's own launch: trusted when saved.
        s.Target = @"C:\Tools\Example\other.exe";
        await h.SettingsFromPropertyInspectorAsync(s);
        Assert.Equal("idle", h.Action.Face);
        var pushed = h.CallsOf("sendToPropertyInspector").Last().Payload!;
        Assert.Equal("pi.state", pushed["type"]!.GetValue<string>());
        Assert.True(pushed["data"]!["launches"]![0]!["trusted"]!.GetValue<bool>());
        await PressAndWaitAsync(h);
        Assert.Equal(@"C:\Tools\Example\other.exe", Assert.Single(rig.Launcher.Launched).Target);
    }

    [Test]
    public async Task An_edited_target_asks_again()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 0), new LaunchSettings());
        await h.SettingsFromPropertyInspectorAsync(Example()); // authored here: trusted
        await PressAndWaitAsync(h);
        Assert.Single(rig.Launcher.Launched);

        // The key comes back with an edited launch (a re-imported profile, or settings changed outside this PC's editor).
        foreach (var edited in new[]
        {
            new LaunchSettings { Target = @"C:\Tools\Example\example.exe", Arguments = "--profile other", WorkingDirectory = @"C:\Tools\Example" },
            new LaunchSettings { Target = @"C:\Tools\Example\example.exe", Arguments = "--profile demo", WorkingDirectory = @"C:\Tools" },
            new LaunchSettings { Target = @"C:\Tools\Example\Example2.exe", Arguments = "--profile demo", WorkingDirectory = @"C:\Tools\Example" },
        })
        {
            await using var again = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(1, 0), edited);
            Assert.Equal("review", again.Action.Face, edited.Arguments + " " + edited.WorkingDirectory);
            await PressAndWaitAsync(again);
            Assert.Single(rig.Launcher.Launched, "the changed launch did not run");
            Assert.Equal(1, again.Count("showAlert"));
        }

        // The unchanged launch is still trusted (the trust is per exact launch, not per key).
        await using var same = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(2, 0), Example());
        Assert.Equal("idle", same.Action.Face);
    }

    [Test]
    public async Task The_engine_checks_every_launch_before_running_anything()
    {
        var rig = new TestRig();
        var trusted = new LaunchStep { Target = "notepad.exe" };
        rig.Trusted(MacroScript.Of(trusted));
        var r = await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+C"), trusted, new LaunchStep { Target = "notepad.exe", Arguments = "notes.txt" }));
        Assert.Equal(MacroRunStatus.NeedsReview, r.Status);
        Assert.Equal(2, r.FailedStep);
        Assert.Equal(0, rig.Sink.Count, "not even the chord before it");
        Assert.Empty(rig.Launcher.Launched);

        // An engine built without a trust list never launches.
        var launcher = new FakeLauncher();
        var bare = new MacroEngine(new RecordingSink(), new FakeForeground(), launcher);
        Assert.Equal(MacroRunStatus.NeedsReview, (await bare.RunAsync(MacroScript.Of(new LaunchStep { Target = "notepad.exe" }))).Status);
        Assert.Empty(launcher.Launched);

        // The backstop: right before a launch starts, the exact spec is checked again.
        var ctx = new MacroContext(rig.Engine, TimeProvider.System, CancellationToken.None);
        Assert.Throws<LaunchNotTrustedException>(() => ctx.EnsureLaunchAllowed(new LaunchSpec("notepad.exe", "other.txt")));
        ctx.EnsureLaunchAllowed(new LaunchSpec("notepad.exe"));
        var shell = new LaunchSpec("cmd.exe", "/c exit");
        rig.Trust.Trust(shell);
        Assert.Contains("always asks first", Assert.Throws<MacroStepException>(() => ctx.EnsureLaunchAllowed(shell)).Message);
        new MacroContext(rig.Engine, TimeProvider.System, CancellationToken.None, confirmed: true).EnsureLaunchAllowed(shell);
    }

    [Test]
    public void Risky_launches_always_confirm()
    {
        foreach (var (target, args, wd) in new (string, string?, string?)[]
        {
            ("cmd.exe", "/c dir", null), ("cmd", "/c dir", null), (@"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", "-c exit", null),
            ("pwsh.exe", null, null), ("mshta.exe", "https://example.com/x.hta", null), ("wscript.exe", @"C:\Tools\Example\x.vbs", null),
            ("cscript", null, null), ("rundll32.exe", "example.dll,Entry", null), (@"C:\Tools\Example\setup.hta", null, null),
            (@"C:\Users\Public\Desktop\Example.lnk", null, null), (@"C:\Tools\Example\site.url", null, null), (@"C:\Tools\Example\saver.scr", null, null),
            (@"C:\Tools\Example\run.bat", null, null), (@"C:\Tools\Example\run.ps1", null, null),
            (@"\\fileserver.example\share\tool.exe", null, null), ("//fileserver.example/share/tool.exe", null, null),
            ("notepad.exe", @"\\fileserver.example\share\notes.txt", null), (@"C:\Tools\Example\example.exe", null, @"\\fileserver.example\share"),
        })
            Assert.NotNull(LaunchTrust.ConfirmReason(LaunchPolicy.Resolve(target, args, wd)), $"{target} {args} {wd}");
        foreach (var (target, args, wd) in new (string, string?, string?)[]
        {
            ("notepad.exe", null, null), (@"C:\Tools\Example\example.exe", "--profile demo", @"C:\Tools\Example"), ("ms-settings:sound", null, null),
            (@"C:\Docs\report.example.pdf", null, null), (@"C:\Tools\Example", null, null), ("spotify:", null, null),
        })
            Assert.Null(LaunchTrust.ConfirmReason(LaunchPolicy.Resolve(target, args, wd)), target);
        Assert.Contains("network path", LaunchTrust.ConfirmReason(new LaunchSpec(@"\\fileserver.example\share\tool.exe")));
        Assert.Contains("command shell", LaunchTrust.ConfirmReason(new LaunchSpec("powershell.exe")));
        Assert.Contains(".lnk", LaunchTrust.ConfirmReason(new LaunchSpec(@"C:\Users\Public\Desktop\Example.lnk")));
    }

    [Test]
    public async Task A_trusted_shell_still_needs_a_second_press_each_time()
    {
        var rig = new TestRig();
        await using var h = await rig.AppearAsync<LaunchKey>(TestDevices.Galleon, new(0, 0), new LaunchSettings());
        await h.SettingsFromPropertyInspectorAsync(new LaunchSettings { Target = "cmd.exe", Arguments = "/c echo The Example Ensemble" }); // trusted as saved
        Assert.Equal("idle", h.Action.Face);
        var hello = await h.PiMessageAsync("pi.ready");
        Assert.Contains("second press", hello!["data"]!["state"]!["review"]!.GetValue<string>());

        await PressAndWaitAsync(h);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Equal("confirm", h.Action.Face);
        Assert.Contains("Press again", h.Action.Status);
        Assert.Equal(0, h.Count("showAlert"), "asking is not an error");

        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        await PressAndWaitAsync(h);
        Assert.Single(rig.Launcher.Launched);
        Assert.Equal("idle", h.Action.Face);

        // The next press asks again, and the key goes back to its own face once the window passes.
        await PressAndWaitAsync(h);
        Assert.Single(rig.Launcher.Launched);
        Assert.Equal("confirm", h.Action.Face);
        await h.AdvanceAsync(TimeSpan.FromSeconds(4));
        Assert.Equal("idle", h.Action.Face);
        var frames = h.CallsOf("setImage").Count;
        await h.AdvanceAsync(TimeSpan.FromMinutes(2));
        Assert.Equal(frames, h.CallsOf("setImage").Count, "parked again: no redraws");
        await PressAndWaitAsync(h);
        Assert.Single(rig.Launcher.Launched, "a press after the window asks again");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task The_macro_editor_lists_every_launch_and_trusts_what_it_showed()
    {
        var rig = new TestRig();
        var imported = new MacroKeySettings
        {
            Macro = MacroScript.Of(new ChordStep("Ctrl+S"), new LaunchStep { Target = @"C:\Tools\Example\example.exe" }),
            LongMacro = MacroScript.Of(new LaunchStep { Target = "notepad.exe", Arguments = "notes.txt" }),
        };
        await using var h = await rig.AppearAsync<MacroKey>(TestDevices.Galleon, new(0, 0), imported);
        Assert.Equal("review", h.Action.Face);
        var launches = (await h.PiMessageAsync("pi.ready"))!["data"]!["state"]!["launches"]!.AsArray();
        Assert.Equal(2, launches.Count);
        Assert.Equal("notepad.exe notes.txt", launches[1]!["runs"]!.GetValue<string>());

        // Trust only what the PI showed (by id): the other launch stays untrusted.
        var first = launches[0]!["id"]!.GetValue<string>();
        var after = (await h.PiMessageAsync("macros.trust", new { ids = new[] { first } }, requestId: 1))!["data"]!["launches"]!.AsArray();
        Assert.True(after[0]!["trusted"]!.GetValue<bool>());
        Assert.False(after[1]!["trusted"]!.GetValue<bool>());
        Assert.Equal("review", h.Action.Face, "the hold list still has an untrusted launch");
        await h.PiMessageAsync("macros.trust", new { ids = new[] { "0000" } }, requestId: 2); // a stale id trusts nothing
        Assert.Equal("review", h.Action.Face);
        await h.PiMessageAsync("macros.trust", null, requestId: 3);
        Assert.Equal("idle", h.Action.Face);
        await h.PressAsync(TimeSpan.FromMilliseconds(100));
        await Drive.ToIdleAsync(h);
        Assert.Single(rig.Launcher.Launched);
        Assert.Equal(1, rig.Sink.Count, "Ctrl+S, then the launch");
    }

    [Test]
    public async Task The_dial_reviews_imports_and_confirms_risky_launches_with_a_second_push()
    {
        var rig = new TestRig();
        var imported = new MacroDialSettings { Push = MacroScript.Of(new LaunchStep { Target = @"C:\Tools\Example\example.exe" }) };
        await using var d = await rig.AppearAsync<MacroDial>(TestDevices.Plus, new(0, 0), imported, Controller.Encoder);
        Assert.Equal("review", d.Action.Face);
        await d.DialPressAsync();
        await Drive.RunsDoneAsync(d);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Equal(1, d.Count("showAlert"));
        await d.PiMessageAsync("macros.trust", null, requestId: 1);
        Assert.Equal("idle", d.Action.Face);
        await d.DialPressAsync();
        await Drive.RunsDoneAsync(d);
        Assert.Single(rig.Launcher.Launched);

        var rig2 = new TestRig();
        await using var h = await rig2.AppearAsync<MacroDial>(TestDevices.Galleon, new(0, 0), new MacroDialSettings(), Controller.Encoder);
        await h.SettingsFromPropertyInspectorAsync(new MacroDialSettings
        {
            Right = new LaunchStep { Target = "cmd.exe", Arguments = "/c echo turn" },
            Push = MacroScript.Of(new LaunchStep { Target = "powershell.exe", Arguments = "-c exit" }),
        }); // authored here: trusted, but both always ask first
        await h.RotateAsync(1);
        await Drive.RunsDoneAsync(h);
        Assert.Empty(rig2.Launcher.Launched);
        Assert.Contains("Turning the dial cannot confirm", h.Action.Status);
        Assert.Equal(1, h.Count("showAlert"));
        await h.DialPressAsync();
        await Drive.RunsDoneAsync(h);
        Assert.Empty(rig2.Launcher.Launched);
        Assert.Equal("confirm", h.Action.Face);
        await h.DialPressAsync();
        await Drive.RunsDoneAsync(h);
        Assert.Equal("powershell.exe", Assert.Single(rig2.Launcher.Launched).Target);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public void Trust_is_saved_on_this_pc_as_hashes_only()
    {
        using var dir = new TempDir();
        var spec = LaunchPolicy.Resolve(@"C:\Tools\Example\example.exe", "--profile demo", @"C:\Tools\Example");
        var store = new LaunchTrustStore(dir.Path);
        Assert.False(store.IsTrusted(spec));
        Assert.True(store.Trust(spec));
        Assert.False(store.Trust(spec), "already trusted");
        var file = Path.Combine(dir.Path, LaunchTrustStore.FileName);
        var text = File.ReadAllText(file);
        Assert.Contains(LaunchTrust.Hash(spec), text);
        foreach (var leak in new[] { "Tools", "example.exe", "--profile", "demo" })
            Assert.DoesNotContain(leak, text, "the trust file holds hashes only");
        Assert.True(new LaunchTrustStore(dir.Path).IsTrusted(spec), "a restart keeps it");
        using (var otherPc = new TempDir())
            Assert.False(new LaunchTrustStore(otherPc.Path).IsTrusted(spec), "another PC (an exported profile) does not trust it");
        Assert.False(store.IsTrusted(spec with { Arguments = "--profile demo2" }));
        Assert.False(store.IsTrusted(spec with { WorkingDirectory = @"C:\Tools" }));
        Assert.False(store.IsTrusted(spec with { Target = @"C:\Tools\Example\Example.exe" }), "exact: even a changed letter case asks again");

        // Safe mode reads the list but never writes it.
        using (var safeDir = new TempDir())
        {
            var safe = new LaunchTrustStore(safeDir.Path, persist: false);
            Assert.True(safe.Trust(spec));
            Assert.True(safe.IsTrusted(spec), "for this session");
            Assert.False(File.Exists(Path.Combine(safeDir.Path, LaunchTrustStore.FileName)));
        }

        // A damaged file trusts nothing (fail closed).
        File.WriteAllText(file, "{ not json");
        Assert.False(new LaunchTrustStore(dir.Path).IsTrusted(spec));
    }

    [Test]
    public async Task The_module_keeps_trust_in_its_data_directory_and_never_writes_it_in_safe_mode()
    {
        var spec = new LaunchSpec(@"C:\Tools\Example\example.exe");
        using (var env = new EnvScope(MacrosModule.DryRunVariable, "1")) // a dry run: the real sink and launcher are never built
        using (var dir = new TempDir())
        {
            var ctx = new FakeModuleContext(dir.Path, safeMode: false);
            var module = new MacrosModule();
            module.Initialize(ctx);
            var engine = ctx.Services.Get<MacroEngine>();
            Assert.True(engine.IsDryRun);
            engine.Trust.Trust(spec);
            Assert.True(File.Exists(Path.Combine(dir.Path, LaunchTrustStore.FileName)));
            await module.DisposeAsync();
        }
        using (var env = new EnvScope(MacrosModule.DryRunVariable, null))
        using (var dir = new TempDir())
        {
            var ctx = new FakeModuleContext(dir.Path, safeMode: true);
            var module = new MacrosModule();
            module.Initialize(ctx);
            var engine = ctx.Services.Get<MacroEngine>();
            Assert.True(engine.IsDryRun);
            engine.Trust.Trust(spec);
            Assert.True(engine.Trust.IsTrusted(spec));
            Assert.False(File.Exists(Path.Combine(dir.Path, LaunchTrustStore.FileName)), "safe mode never writes the trust list");
            Assert.Contains("for this session only", ctx.RecordingLog.Text);
            await module.DisposeAsync();
        }
    }

    [Test]
    public void Launch_settings_still_hold_no_trust_field()
    {
        var node = Core.Actions.ActionJson.ToNode(Example())!.AsObject();
        Assert.Equal("target,arguments,workingDirectory,focusIfRunning", string.Join(",", node.Select(p => p.Key)));
    }
}
