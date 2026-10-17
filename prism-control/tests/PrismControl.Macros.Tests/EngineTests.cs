using PrismControl.Macros.Engine;
using PrismControl.Testing;
using static PrismControl.Macros.Tests.K;

namespace PrismControl.Macros.Tests;

public class EngineTests
{
    [Test]
    public async Task Runs_every_step_in_order_against_fakes()
    {
        var rig = new TestRig();
        var r = await Drive.RunAsync(rig.Engine, rig.Trusted(SerializationTests.AllSteps()));
        Assert.Equal(MacroRunStatus.Completed, r.Status, r.Describe());
        Assert.Equal(6, r.StepsCompleted);
        var b = rig.Sink.Batches;
        Assert.Equal(3, b[0].Length, "the held chord: Ctrl, Shift and T down");
        Assert.True(b[0].All(k => (k.Flags & KeyFlags.ScanCode) != 0 && !k.IsUp), "in scan-code mode");
        Assert.True(b[1].Length == 3 && b[1].All(k => k.IsUp), "then the three ups, after the hold");
        var text = b.Skip(2).Take(b.Count - 3).ToList();
        Assert.True(text.All(x => x.Length == 2 && ((x[0].Flags & KeyFlags.Unicode) != 0 || x[0].Vk == 0x0D)), "then the text, one character per batch (char delay)");
        K.SequenceEqual([Down(0xAE, 0x2E, KeyFlags.ExtendedKey), Up(0xAE, 0x2E, KeyFlags.ExtendedKey)], b[^1], "then the media key");
        var launched = Assert.Single(rig.Launcher.Launched);
        Assert.Equal(@"C:\Tools\Example\example.exe", launched.Target);
        Assert.Equal("--profile demo", launched.Arguments);
        Assert.Equal(@"C:\Tools\Example", launched.WorkingDirectory);
        Assert.Single(rig.Launcher.FocusAttempts);
        Assert.Equal("https://example.com/docs?q=1", Assert.Single(rig.Launcher.Opened).AbsoluteUri);
    }

    [Test]
    public async Task A_chord_is_one_atomic_batch()
    {
        var rig = new TestRig();
        await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+Shift+T")));
        var batch = Assert.Single(rig.Sink.Batches);
        K.SequenceEqual(InputBuilder.Chord(KeyChord.Parse("Ctrl+Shift+T"), StandardScanCodes.Instance), batch);
    }

    [Test]
    public async Task Delays_wait_on_the_clock()
    {
        var rig = new TestRig();
        var time = new ManualTimeProvider();
        var run = Task.Run(() => rig.Engine.RunAsync(MacroScript.Of(new ChordStep("A"), new DelayStep(1000), new ChordStep("B")), new MacroRunOptions { Time = time }));
        await Drive.UntilAsync(() => rig.Sink.Count == 1 && time.UntilNextTimer is not null, "the first chord and the delay");
        Assert.Equal(TimeSpan.FromSeconds(1), time.UntilNextTimer);
        time.Advance(TimeSpan.FromMilliseconds(999));
        await Task.Delay(30);
        Assert.Equal(1, rig.Sink.Count, "B waits for the whole delay");
        time.Advance(TimeSpan.FromMilliseconds(1));
        var r = await run.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(MacroRunStatus.Completed, r.Status);
        Assert.Equal((ushort)'B', rig.Sink.Batches[1][0].Vk);
    }

    [Test]
    public async Task An_invalid_step_anywhere_means_nothing_runs()
    {
        var rig = new TestRig();
        var r = await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+C"), new OpenUrlStep("javascript:alert(1)")));
        Assert.Equal(MacroRunStatus.Invalid, r.Status);
        Assert.Contains("Only http and https", r.Message);
        Assert.Equal(0, rig.Sink.Count);
        Assert.Equal(0, rig.Foreground.Calls);
        Assert.Equal(MacroRunStatus.Empty, (await rig.Engine.RunAsync(new MacroScript())).Status);
    }

    [Test]
    public async Task Elevated_foreground_blocks_input_and_says_why()
    {
        var rig = new TestRig();
        rig.Foreground.Then(ForegroundInfo.Allowed("ExampleEditor.exe"), FakeForeground.Elevated());
        var r = await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+C"), new ChordStep("Ctrl+V"), new MediaKeyStep(MediaKey.Mute)));
        Assert.Equal(MacroRunStatus.Blocked, r.Status);
        Assert.Equal(1, r.StepsCompleted);
        Assert.Equal(1, r.FailedStep);
        Assert.Contains("ExampleAdminTool.exe runs as administrator", r.Message);
        Assert.Equal(1, rig.Sink.Count, "only the chord before the switch went out");
        Assert.Contains("Not sent", r.Describe());
    }

    [Test]
    public async Task Launching_and_urls_need_no_foreground_check()
    {
        var rig = new TestRig();
        rig.Foreground.Current = FakeForeground.Elevated();
        var r = await rig.Engine.RunAsync(rig.Trusted(MacroScript.Of(new LaunchStep { Target = "notepad.exe" }, new OpenUrlStep("https://example.com"))));
        Assert.Equal(MacroRunStatus.Completed, r.Status, r.Describe());
        Assert.Equal(0, rig.Foreground.Calls);
        Assert.Single(rig.Launcher.Launched);
    }

    [Test]
    public async Task No_foreground_window_is_retried_once_then_reported()
    {
        var rig = new TestRig();
        rig.Foreground.Then(FakeForeground.NoWindow, ForegroundInfo.Allowed());
        var ok = await Drive.RunAsync(rig.Engine, MacroScript.Of(new ChordStep("A")));
        Assert.Equal(MacroRunStatus.Completed, ok.Status, "focus arrived during the retry");
        Assert.Equal(2, rig.Foreground.Calls);

        rig.Foreground.Then(FakeForeground.NoWindow, FakeForeground.NoWindow);
        var blocked = await Drive.RunAsync(rig.Engine, MacroScript.Of(new ChordStep("A")));
        Assert.Equal(MacroRunStatus.Blocked, blocked.Status);
        Assert.Contains("No app has focus", blocked.Message);
        Assert.Equal(1, rig.Sink.Count);
    }

    [Test]
    public async Task Cancelling_a_held_chord_still_releases_the_keys()
    {
        var rig = new TestRig();
        var time = new ManualTimeProvider();
        using var cts = new CancellationTokenSource();
        var run = Task.Run(() => rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+A") { HoldMs = 500 }, new ChordStep("B")), new MacroRunOptions { Time = time }, cts.Token));
        await Drive.UntilAsync(() => rig.Sink.Count == 1, "the key-downs");
        cts.Cancel();
        var r = await run.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(MacroRunStatus.Cancelled, r.Status);
        Assert.Equal(2, rig.Sink.Count);
        K.SequenceEqual([Up(0x41, 0x1E), Up(0xA2, 0x1D)], rig.Sink.Batches[1], "released in reverse");
    }

    [Test]
    public async Task A_partial_send_releases_what_went_down()
    {
        var rig = new TestRig();
        rig.Sink.AcceptNext = 2; // Ctrl and Shift went down, then Windows stopped accepting
        var r = await rig.Engine.RunAsync(MacroScript.Of(new ChordStep("Ctrl+Shift+T")));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        Assert.Contains("accepted 2 of 6", r.Message);
        K.SequenceEqual([Up(0xA0, 0x2A), Up(0xA2, 0x1D)], rig.Sink.Batches[1], "exactly the keys that went down (T never did), in reverse order");
    }

    [Test]
    public async Task Text_with_a_character_delay_types_one_pair_per_tick()
    {
        var rig = new TestRig();
        var r = await Drive.RunAsync(rig.Engine, MacroScript.Of(new TextStep("abc") { CharDelayMs = 10 }));
        Assert.Equal(MacroRunStatus.Completed, r.Status);
        Assert.Equal(3, rig.Sink.Count);
        Assert.True(rig.Sink.Batches.All(b => b.Length == 2));
        var fast = new TestRig();
        await fast.Engine.RunAsync(MacroScript.Of(new TextStep(new string('x', 40))));
        Assert.Equal(2, fast.Sink.Count, "without a delay: 32 characters per SendInput");
    }

    [Test]
    public async Task Launch_focuses_a_running_app_instead_of_starting_another()
    {
        var rig = new TestRig();
        rig.Launcher.Running = true;
        var step = new LaunchStep { Target = @"C:\Tools\Example\example.exe", FocusIfRunning = true };
        Assert.Equal(MacroRunStatus.Completed, (await rig.Engine.RunAsync(rig.Trusted(MacroScript.Of(step)))).Status);
        Assert.Empty(rig.Launcher.Launched);
        Assert.Equal("example", LaunchPolicy.FocusName(Assert.Single(rig.Launcher.FocusAttempts)));
        step.FocusIfRunning = false;
        await rig.Engine.RunAsync(MacroScript.Of(step));
        Assert.Single(rig.Launcher.Launched);
        Assert.Single(rig.Launcher.FocusAttempts, "no focus attempt when the option is off");
    }

    [Test]
    public async Task Launch_failures_are_reported_not_thrown()
    {
        var rig = new TestRig();
        rig.Launcher.FailWith = "example.exe was not found.";
        var r = await rig.Engine.RunAsync(rig.Trusted(MacroScript.Of(new DelayStep(0), new LaunchStep { Target = "example.exe" })));
        Assert.Equal(MacroRunStatus.Failed, r.Status);
        Assert.Equal(1, r.FailedStep);
        Assert.Equal("Step 2 failed: example.exe was not found.", r.Describe());
    }

    [Test]
    public async Task Shutdown_cancels_running_macros()
    {
        using var shutdown = new CancellationTokenSource();
        var rig = new TestRig(shutdown: shutdown.Token);
        var time = new ManualTimeProvider();
        var run = Task.Run(() => rig.Engine.RunAsync(MacroScript.Of(new DelayStep(60_000), new ChordStep("A")), new MacroRunOptions { Time = time }));
        await Drive.UntilAsync(() => time.UntilNextTimer is not null, "the delay");
        shutdown.Cancel();
        Assert.Equal(MacroRunStatus.Cancelled, (await run.WaitAsync(TimeSpan.FromSeconds(5))).Status);
        Assert.Equal(0, rig.Sink.Count);
    }

    [Test]
    public async Task Runner_ignores_a_start_while_running()
    {
        var runner = new MacroRunner();
        var gate = new TaskCompletionSource();
        var runs = 0;
        Assert.True(runner.TryStart(async _ => { Interlocked.Increment(ref runs); await gate.Task; }));
        Assert.True(runner.IsRunning);
        Assert.False(runner.TryStart(_ => { Interlocked.Increment(ref runs); return Task.CompletedTask; }), "ignored, not queued");
        gate.SetResult();
        await runner.WhenIdleAsync();
        Assert.False(runner.IsRunning);
        Assert.True(runner.TryStart(_ => { Interlocked.Increment(ref runs); return Task.CompletedTask; }));
        await runner.WhenIdleAsync();
        Assert.Equal(2, runs);
    }
}

public class PolicyTests
{
    [Test]
    public void Urls_must_be_http_or_https_with_a_host_and_no_credentials()
    {
        Assert.True(UrlPolicy.TryParse("  https://example.com/a b  ", out var u, out _));
        Assert.Equal("https://example.com/a%20b", u.AbsoluteUri);
        Assert.Equal("https · example.com", UrlPolicy.Describe(u));
        Assert.True(UrlPolicy.TryParse("http://192.0.2.10:8080/status", out _, out _));
        foreach (var (url, why) in new[]
        {
            ("", "Enter a URL"), ("example.com", "full URL"), ("javascript:alert(1)", "Only http and https"), ("file:///C:/Windows/notepad.exe", "full URL"),
            ("ftp://example.com", "Only http and https"), ("mailto:someone@example.com", "Only http and https"),
            ("https://user:secret@example.com", "user name or password"), ("https://exa\nmple.com", "control characters"),
            (@"\\server.example\share", "full URL"),
        })
        {
            Assert.False(UrlPolicy.TryParse(url, out _, out var error), url);
            Assert.Contains(why, error, url);
        }
    }

    [Test]
    public void Launch_targets_are_paths_names_or_allowed_app_links()
    {
        Assert.Empty(LaunchPolicy.Validate(@"C:\Windows\notepad.exe", "--x", null));
        Assert.Empty(LaunchPolicy.Validate("\"C:\\Program Files\\Example\\app.exe\"", null, null));
        Assert.Empty(LaunchPolicy.Validate("notepad.exe", null, null));
        Assert.Empty(LaunchPolicy.Validate("ms-settings:sound", null, null));
        Assert.Empty(LaunchPolicy.Validate(@"shell:AppsFolder\Example.App_1234!App", null, null));
        Assert.Empty(LaunchPolicy.Validate(@"%SystemRoot%\notepad.exe", null, @"%USERPROFILE%"));
        foreach (var (target, args, why) in new[]
        {
            ("", (string?)null, "Choose a program"), ("https://example.com", null, "Open URL step"), ("javascript:alert(1)", null, "not allowed"),
            ("file:///C:/x.exe", null, "file: URI"), (@"tools\x.exe", null, "full path"), ("notepad.exe", "a\nb", "line breaks"),
            ("C:\\a\"b.exe", null, "quotes"),
        })
        {
            var p = LaunchPolicy.Validate(target, args, null);
            Assert.True(p.Count > 0, target);
            Assert.Contains(why, string.Join(" ", p), target);
        }
        Assert.Contains("full path", string.Join(" ", LaunchPolicy.Validate("notepad.exe", null, "relative\\dir")));
    }

    [Test]
    public void Resolve_expands_variables_and_names_safely()
    {
        var spec = LaunchPolicy.Resolve(@"%SystemRoot%\notepad.exe", "  ", null);
        Assert.DoesNotContain("%", spec.Target);
        Assert.True(spec.Target.EndsWith(@"\notepad.exe", StringComparison.OrdinalIgnoreCase));
        Assert.Null(spec.Arguments);
        Assert.Equal("notepad.exe", spec.DisplayName, "logs show the file name only");
        Assert.Equal("ms-settings:", LaunchPolicy.ShortName("ms-settings:sound"));
        Assert.Equal("notepad", LaunchPolicy.FocusName(spec));
        Assert.Null(LaunchPolicy.FocusName(new LaunchSpec(@"C:\Docs\report.example.pdf")), "documents are not focus targets");
    }
}
