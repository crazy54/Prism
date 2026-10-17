using PrismControl.Ai.Apps;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Desktop;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>The Apps layer: detection by image path, foreground, inferred voice, generating = unknown, focus-or-launch.</summary>
public class AI2AppsTests
{
    [Test]
    public async Task Apps_are_told_apart_by_image_path_not_bare_name()
    {
        var rig = new Ai2Rig();
        rig.TypicalProcesses();
        await rig.S.Apps.TickAsync();
        var claude = rig.S.Apps.Get("claude-desktop");
        Assert.True(claude.IsRunning);
        Assert.Equal("2001,2002", string.Join(",", claude.Pids), "the Claude Code CLI under ~/.local/bin is not Claude Desktop");
        Assert.True(rig.S.Apps.Get("chatgpt").IsRunning);
        Assert.True(rig.S.Apps.Get("copilot").IsRunning);
        Assert.False(rig.S.Apps.Get("vscode").IsRunning);
        Assert.True(rig.S.Apps.Get("vscode").Installed, "installed but not running");
        Assert.False(rig.S.Apps.Get("cursor").Installed);
        Assert.Equal(FactSource.Process, claude.Running.Source);
        Assert.Equal(Confidence.Observed, claude.Running.Confidence);

        // An unreadable image path: ambiguous names don't count, unique ones do.
        rig.Scanner.Procs = [new(7001, 100, "ChatGPT.exe", null), new(7002, 100, "Code.exe", null)];
        await rig.S.Apps.TickAsync();
        Assert.False(rig.S.Apps.Get("chatgpt").IsRunning);
        Assert.True(rig.S.Apps.Get("vscode").IsRunning);
    }

    [Test]
    public async Task Generating_is_always_unknown_and_voice_is_inferred_through_helper_processes()
    {
        var rig = new Ai2Rig();
        rig.TypicalProcesses();
        rig.Voice.Pids = [4002];   // msedgewebview2.exe, a child of mscopilot.exe, holds the microphone
        rig.ForegroundProbe.Value = (3002, "ChatGPT.exe");
        await rig.S.Apps.TickAsync();
        foreach (var a in rig.S.Apps.All())
        {
            Assert.False(a.Generating.IsKnown, a.Def.Id);
            Assert.Equal(Confidence.Unknown, a.Generating.Confidence);
        }
        var copilot = rig.S.Apps.Get("copilot");
        Assert.True(copilot.Voice);
        Assert.Equal(Confidence.Inferred, copilot.VoiceLive.Confidence);
        Assert.Equal(FactSource.CoreAudio, copilot.VoiceLive.Source);
        Assert.False(rig.S.Apps.Get("claude-desktop").Voice);
        Assert.True(rig.S.Apps.Get("chatgpt").InFront);
        Assert.False(rig.S.Apps.Get("claude-desktop").InFront);
        Assert.Equal(Confidence.Unknown, rig.S.Apps.Get("chatgpt").AgentTasks.Confidence, "no session hosted in ChatGPT yet");
    }

    [Test]
    public async Task Codex_tasks_hosted_in_the_ChatGPT_app_are_counted_as_inferred()
    {
        var aiRig = new TestRig();
        aiRig.Hook("UserPromptSubmit", "s-1", agent: "codex");
        var view = aiRig.Sessions.Snapshot(PrivacyMode.Private).Single();
        var hosted = view with { Host = new HostInfo(HostKind.ChatGpt, null, 0, false, null, null) };
        var rig = new Ai2Rig();
        rig.TypicalProcesses();
        rig.Sessions.Add(hosted);
        await rig.S.Apps.TickAsync();
        var chatgpt = rig.S.Apps.Get("chatgpt");
        Assert.Equal(1, chatgpt.AgentTasks.Value);
        Assert.Equal(Confidence.Inferred, chatgpt.AgentTasks.Confidence);
        aiRig.Dispose();
    }

    [Test]
    public async Task Nothing_is_scanned_until_a_surface_asks_and_changes_are_signaled_once()
    {
        var rig = new Ai2Rig();
        Assert.Equal(0, rig.Scanner.Scans);
        var changes = 0;
        rig.S.Apps.Changed += () => changes++;
        using (rig.S.Apps.Demand())
        {
            Assert.Equal(1, rig.Scanner.Scans);
            await rig.S.Apps.TickAsync();
            Assert.Equal(1, changes, "an identical second scan raises nothing");
            rig.TypicalProcesses();
            await rig.S.Apps.TickAsync();
            Assert.Equal(2, changes);
        }
        Assert.False(rig.S.Apps.Demanded);
    }

    [Test]
    public async Task Press_focuses_a_running_window_or_launches_by_aumid()
    {
        var rig = new Ai2Rig();
        rig.TypicalProcesses();
        rig.Windows.Add(0x7701, 3001, "ChatGPT.exe", @"C:\Program Files\WindowsApps\OpenAI.Codex_26.1013.3656.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe");
        await rig.S.Apps.TickAsync();
        Assert.Equal(LaunchResult.Focused, await rig.S.Launcher.FocusOrLaunchAsync(rig.S.Apps.Get("chatgpt"), CancellationToken.None));
        Assert.Equal(0x7701, Assert.Single(rig.Foreground.Raised));
        Assert.Empty(rig.Started);

        // Claude Desktop runs without a window → activate it by AUMID; VS Code isn't running → start it by AUMID.
        Assert.Equal(LaunchResult.Launched, await rig.S.Launcher.FocusOrLaunchAsync(rig.S.Apps.Get("claude-desktop"), CancellationToken.None));
        Assert.Equal(LaunchResult.Launched, await rig.S.Launcher.FocusOrLaunchAsync(rig.S.Apps.Get("vscode"), CancellationToken.None));
        Assert.Equal(@"explorer.exe shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude", $"{rig.Started[0].Target} {rig.Started[0].Args}");
        Assert.Equal(@"shell:AppsFolder\Microsoft.VisualStudioCode", rig.Started[1].Args);
        Assert.Equal(LaunchResult.NotInstalled, await rig.S.Launcher.FocusOrLaunchAsync(rig.S.Apps.Get("cursor"), CancellationToken.None));

        rig.Foreground.Next = ForegroundResult.Elevated;
        Assert.Equal(LaunchResult.Elevated, await rig.S.Launcher.FocusOrLaunchAsync(rig.S.Apps.Get("chatgpt"), CancellationToken.None));

        Assert.Equal(LaunchResult.OpenedNewChat, await rig.S.Launcher.NewChatAsync(rig.S.Apps.Get("claude-desktop"), CancellationToken.None));
        Assert.Equal("claude://claude.ai/new", rig.Opened.Last());
    }

    [Test]
    public async Task Safe_mode_never_focuses_launches_or_opens()
    {
        var rig = new Ai2Rig(safeMode: true);
        rig.TypicalProcesses();
        rig.Windows.Add(0x7701, 3001, "ChatGPT.exe", null);
        await rig.S.Apps.TickAsync();
        foreach (var a in rig.S.Apps.All())
        {
            Assert.Equal(LaunchResult.SafeMode, await rig.S.Launcher.FocusOrLaunchAsync(a, CancellationToken.None));
            Assert.Equal(LaunchResult.SafeMode, await rig.S.Launcher.NewChatAsync(a, CancellationToken.None));
        }
        Assert.Empty(rig.Foreground.Raised);
        Assert.Empty(rig.Started);
        Assert.Empty(rig.Opened);
    }

    /// <summary>Read-only probes of this PC: the real Toolhelp scan, foreground probe, Core Audio capture sessions and shell/registry lookups run without throwing.</summary>
    [Test(Category = "integration")]
    public void Real_probes_are_read_only_and_do_not_throw()
    {
        var procs = new Win32ProcessScanner().Scan();
        Assert.True(procs.Count > 10, "a real process table");
        Assert.True(procs.Any(p => p.Pid == Environment.ProcessId), "this test process is listed");
        _ = new Win32ForegroundProbe().Foreground();
        var mics = new CoreAudioVoiceProbe().ActiveCapturePids();
        Assert.True(mics.All(p => p > 0));
        var probe = new Win32AppProbe();
        Assert.False(probe.IsInstalled(AppCatalog.Find("chatgpt")! with { Aumid = "Example.NotInstalled_0000000000000!App", ExePath = null }));
        Assert.True(probe.SchemeRegistered("http"));
        Assert.False(probe.SchemeRegistered("prism-example-scheme-that-does-not-exist"));
        Assert.False(probe.SchemeRegistered("bad scheme; rm"));
        Console.WriteLine($"  scanned {procs.Count} processes; {mics.Count} active capture sessions; AI apps running: " +
            string.Join(", ", procs.Select(p => AppCatalog.ForImage(p.Exe, p.ImagePath)?.Id).Where(i => i is not null).Distinct()));
    }

    [Test]
    public void The_catalog_uses_generic_ids_and_documented_links()
    {
        Assert.Equal("claude-desktop,chatgpt,copilot,vscode,cursor,gemini", string.Join(",", AppCatalog.Apps.Select(a => a.Id)));
        Assert.Equal("OpenAI.Codex_2p2nqsd0c76g0!App", AppCatalog.Find("chatgpt")!.Aumid);
        Assert.True(AppCatalog.Apps.All(a => a.NewChatUri is null || a.NewChatUri.StartsWith("claude://", StringComparison.Ordinal) || a.NewChatUri.StartsWith("codex://", StringComparison.Ordinal)));
        Assert.False(AppCatalog.Find("claude-desktop")!.MatchesImage("claude.exe", @"C:\Users\example\.local\bin\claude.exe"));
        Assert.True(AppCatalog.Find("claude-desktop")!.MatchesImage("claude.exe", @"C:\Users\example\AppData\Local\AnthropicClaude\app-1.0.0\claude.exe"));
    }
}

/// <summary>Ask AI (pre-fill only) and dictation, against fake input, clipboard and foreground: nothing real is touched.</summary>
public class AI2AskDictateTests
{
    private static AskTarget T(string id) => AskTargets.Find(id)!;

    [Test]
    public async Task Ask_copies_restores_the_clipboard_and_opens_a_prefilled_link()
    {
        var rig = new Ai2Rig();
        rig.Selection = "Why does 2 + 2 = 4? & ünïcödé ✓";
        var (r, chars) = await rig.S.Ask.AskAsync(T("claude-desktop"), "Explain:\n{selection}", 2000, CancellationToken.None);
        Assert.Equal(AskResult.Opened, r);
        Assert.Equal(rig.Selection.Length, chars);
        var link = Assert.Single(rig.Opened);
        Assert.True(link.StartsWith("claude://claude.ai/new?q=", StringComparison.Ordinal), link);
        Assert.Equal("Explain:\n" + rig.Selection, Uri.UnescapeDataString(link["claude://claude.ai/new?q=".Length..]));
        Assert.Equal("chord:Control+C", string.Join(",", rig.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")), "one Ctrl+C, never Enter");
        Assert.Equal("original clipboard text", rig.Clipboard.RestoredText, "the user's clipboard is put back");
        Assert.DoesNotContain("Why does", rig.Log.All);
        Assert.Contains("not sent", rig.Log.All);
    }

    [Test]
    public async Task Every_target_prefills_and_none_sends()
    {
        var rig = new Ai2Rig();
        rig.Probe.Schemes.Add("cursor");
        foreach (var t in AskTargets.All)
        {
            rig.Opened.Clear();
            var (r, _) = await rig.S.Ask.AskAsync(t, "{selection}", 2000, CancellationToken.None);
            Assert.Equal(AskResult.Opened, r, t.Id);
            Assert.True(rig.Opened.Single().StartsWith(t.Prefix, StringComparison.Ordinal));
        }
        Assert.False(rig.Input.Calls.Any(c => c.Keys.Contains("Enter", StringComparison.Ordinal)));
        Assert.True(AskTargets.All.Where(t => t.Kind != AskLinkKind.Documented).All(t => t.Note.Contains("UN", StringComparison.Ordinal)), "unofficial / undocumented targets say so");
    }

    [Test]
    public async Task Nothing_selected_elevated_busy_missing_and_on_air_are_refused_honestly()
    {
        var rig = new Ai2Rig { Selection = null };
        Assert.Equal(AskResult.NothingSelected, (await rig.S.Ask.AskAsync(T("chatgpt"), "{selection}", 2000, CancellationToken.None)).Result);
        Assert.Empty(rig.Opened);

        rig.Selection = "x";
        rig.Input.Elevated = true;
        Assert.Equal(AskResult.Elevated, (await rig.S.Ask.AskAsync(T("chatgpt"), "{selection}", 2000, CancellationToken.None)).Result);
        rig.Input.Elevated = false;

        rig.Clipboard.SnapshotFails = true;
        var before = rig.Input.Calls.Count;
        Assert.Equal(AskResult.ClipboardBusy, (await rig.S.Ask.AskAsync(T("chatgpt"), "{selection}", 2000, CancellationToken.None)).Result);
        Assert.Equal(before, rig.Input.Calls.Count, "no Ctrl+C when the clipboard can't be saved first");
        rig.Clipboard.SnapshotFails = false;

        Assert.Equal(AskResult.TargetMissing, (await rig.S.Ask.AskAsync(T("cursor"), "{selection}", 2000, CancellationToken.None)).Result);

        rig.OnAir = true;
        Assert.Equal(AskResult.OnAirBlocked, (await rig.S.Ask.AskAsync(T("chatgpt-web"), "{selection}", 2000, CancellationToken.None)).Result);
        Assert.Equal(AskResult.Opened, (await rig.S.Ask.AskAsync(T("chatgpt"), "{selection}", 2000, CancellationToken.None)).Result, "app links still work on air");
        rig.Configure(s => s.WebTargetsOnAir = true);
        Assert.Equal(AskResult.Opened, (await rig.S.Ask.AskAsync(T("chatgpt-web"), "{selection}", 2000, CancellationToken.None)).Result);

        rig.Foreground.External = 0;
        Assert.Equal(AskResult.NoForeground, (await rig.S.Ask.AskAsync(T("chatgpt"), "{selection}", 2000, CancellationToken.None)).Result);
    }

    [Test]
    public void Links_cap_the_text_on_a_whole_character_and_respect_the_template()
    {
        var t = T("claude-cli");
        var emoji = new string('a', 4999) + "😀tail";
        var link = AskTargets.BuildLink(t, "{selection}", emoji, 14_000);
        var text = Uri.UnescapeDataString(link[t.Prefix.Length..]);
        Assert.Equal(4999, text.Length, "5,000 for claude-cli, and a surrogate pair is never split");
        Assert.Equal("Q: hi", Uri.UnescapeDataString(AskTargets.BuildLink(T("chatgpt"), "Q: {selection}", " hi ", 2000)[T("chatgpt").Prefix.Length..]));
        Assert.Equal("Summarize\n\nhi", Uri.UnescapeDataString(AskTargets.BuildLink(T("chatgpt"), "Summarize", "hi", 2000)[T("chatgpt").Prefix.Length..]));
        Assert.Equal(100, Uri.UnescapeDataString(AskTargets.BuildLink(T("claude-web"), "{selection}", new string('b', 500), 10)[T("claude-web").Prefix.Length..]).Length, "user cap floor 100");
    }

    [Test]
    public async Task Dictation_toggles_win_h_or_holds_ctrl_i_only_into_vs_code()
    {
        var rig = new Ai2Rig();
        rig.ForegroundProbe.Value = (900, "notepad.exe");
        Assert.Equal(DictateResult.Toggled, await rig.S.Dictation.KeyDownAsync(DictateMode.Auto, CancellationToken.None));
        Assert.Equal(DictateResult.Nothing, await rig.S.Dictation.KeyUpAsync(CancellationToken.None));
        Assert.Equal(DictateResult.NotVsCode, await rig.S.Dictation.KeyDownAsync(DictateMode.VsCode, CancellationToken.None), "Ctrl+I is italic elsewhere");

        rig.ForegroundProbe.Value = (901, "Code.exe");
        Assert.Equal("HOLD CTRL+I", rig.S.Dictation.Hint(DictateMode.Auto));
        Assert.Equal(DictateResult.Holding, await rig.S.Dictation.KeyDownAsync(DictateMode.Auto, CancellationToken.None));
        Assert.Equal(DictateResult.Released, await rig.S.Dictation.KeyUpAsync(CancellationToken.None));
        Assert.Equal(DictateResult.Toggled, await rig.S.Dictation.ToggleAsync(DictateMode.Auto, CancellationToken.None));
        Assert.Equal(DictateResult.Toggled, await rig.S.Dictation.KeyDownAsync(DictateMode.Windows, CancellationToken.None));
        Assert.Equal("chord:LeftWindows+H,down:Control+I,up:Control+I,chord:Control+I,chord:LeftWindows+H",
            string.Join(",", rig.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")));

        rig.Input.Elevated = true;
        Assert.Equal(DictateResult.Elevated, await rig.S.Dictation.ToggleAsync(DictateMode.Auto, CancellationToken.None));
    }

    [Test]
    public async Task Safe_mode_sends_no_input_touches_no_clipboard_and_opens_nothing()
    {
        var rig = new Ai2Rig(safeMode: true);
        rig.ForegroundProbe.Value = (901, "Code.exe");
        foreach (var t in AskTargets.All)
            Assert.Equal(AskResult.SafeMode, (await rig.S.Ask.AskAsync(t, "{selection}", 2000, CancellationToken.None)).Result);
        Assert.Equal(DictateResult.SafeMode, await rig.S.Dictation.KeyDownAsync(DictateMode.Auto, CancellationToken.None));
        Assert.Equal(DictateResult.Nothing, await rig.S.Dictation.KeyUpAsync(CancellationToken.None));
        Assert.Equal(DictateResult.SafeMode, await rig.S.Dictation.ToggleAsync(DictateMode.Windows, CancellationToken.None));
        Assert.Empty(rig.Input.Calls);
        Assert.Equal(0, rig.Clipboard.Snapshots + rig.Clipboard.Restores + rig.Clipboard.Reads);
        Assert.Empty(rig.Opened);
    }
}
