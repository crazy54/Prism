using System.Globalization;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Apps.Actions;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.Actions;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Core.Actions;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

// Regression tests for the AI2 review findings A1–A12 (aaa-prism-play/review-ai/REPORT.md). Fakes only: no network, no real
// input, no real clipboard. One test (or more) per finding; the names start with the finding id.

public class AI2FixTests
{
    // ------------------------------------------------------------------ A1: a stalled body / fetch never freezes polling

    [Test]
    public async Task A1_one_deadline_covers_the_headers_and_a_stalled_body()
    {
        using var f = new HttpClientFetcher(new StallingBodyHandler(), new StallingBodyHandler(), TimeProvider.System, TimeSpan.FromMilliseconds(300));
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = await f.GetAsync(new HttpFetchRequest(new Uri("https://status.example.invalid/api/v2/summary.json")), CancellationToken.None)
            .WaitAsync(TimeSpan.FromSeconds(10));
        Assert.True(r.NetworkError, "a body that never ends is a failed fetch, not a hang");
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(5), $"ended after {sw.Elapsed.TotalMilliseconds:0} ms");
    }

    [Test]
    public async Task A1_a_stalled_source_never_starves_the_others_and_its_deadline_frees_it()
    {
        var time = new ManualTimeProvider();
        var http = new HangingHostFetcher("health.aws.amazon.com");
        var health = new HealthService(http, time, new CapturingLog(), () => new Ai2Settings(), () => 0.5);
        using var aws = health.Demand(["bedrock"]);          // its fetch never answers
        using var claude = health.Demand(["claude"]);        // a new demand while AWS hangs
        Assert.Equal(1, http.Count("status.claude.com"), "claude is fetched although AWS is stuck (before: 0, starved)");
        time.Advance(TimeSpan.FromSeconds(20));
        await health.TickAsync(CancellationToken.None);
        Assert.Equal(1, http.Count("health.aws.amazon.com"), "the stuck source is never fetched twice at once");
        Assert.Equal(HealthFetchState.NeverFetched, health.Get("bedrock", time.GetUtcNow())!.State, "still in flight");

        time.Advance(HealthService.FetchDeadline);           // the per-fetch deadline (this service's clock)
        await Task.Delay(100);
        Assert.Equal(HealthFetchState.Errored, health.Get("bedrock", time.GetUtcNow())!.State, "the stalled fetch ended as an error");
        time.Advance(TimeSpan.FromSeconds(80));
        await health.TickAsync(CancellationToken.None);
        Assert.Equal(2, http.Count("status.claude.com"), "claude keeps its 2-minute cadence");
        time.Advance(TimeSpan.FromMinutes(5));
        var stuckAgain = health.TickAsync(CancellationToken.None);   // (it hangs again: not awaited)
        Assert.Equal(2, http.Count("health.aws.amazon.com"), "the AWS source is free again after its backoff");
        Assert.False(stuckAgain.IsCompleted);
        time.Advance(HealthService.FetchDeadline);
        await stuckAgain.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Test]
    public async Task A1_admin_refreshes_have_a_deadline_too()
    {
        var rig = new Ai2Rig(settings: new Ai2Settings { AnthropicAdminEnabled = true });
        var http = new HangingHostFetcher("api.anthropic.com");
        var admin = new AdminUsageService(http, rig.Vault, () => rig.Settings, rig.Time, rig.Log, false);
        admin.SaveKey(AdminProvider.Anthropic, "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd");
        using var lease = admin.Demand(AdminProvider.Anthropic);
        await Task.Delay(50);
        Assert.Equal(AdminState.Waiting, admin.Snapshot(AdminProvider.Anthropic).State);
        rig.Time.Advance(AdminUsageService.RefreshDeadline);
        await Task.Delay(100);
        Assert.Equal(AdminState.Error, admin.Snapshot(AdminProvider.Anthropic).State, "a stalled answer ends as an error");
    }

    // ------------------------------------------------------------------ A2: a quick dictation tap never leaves Ctrl+I held

    [Test]
    public async Task A2_a_quick_tap_releases_ctrl_i_even_when_key_up_is_queued_right_behind_key_down()
    {
        var rig = new Ai2Rig();
        rig.ForegroundProbe.Value = (901, "Code.exe");
        var h = await rig.AppearAsync<DictateAction>(TestDevices.Galleon, new(1, 3));
        var deliver = typeof(ActionBase).GetMethod("Deliver", BindingFlags.NonPublic | BindingFlags.Instance)!;
        deliver.Invoke(h.Action, [new KeyDownEvent(h.Context, h.ActionUuid, h.Device.Id, h.Coordinates, 0, null, false)]);
        deliver.Invoke(h.Action, [new KeyUpEvent(h.Context, h.ActionUuid, h.Device.Id, h.Coordinates, 0, null, false)]);
        await h.SettleAsync();
        Assert.Equal("down:Control+I,up:Control+I", string.Join(",", rig.Input.Calls.Select(c => $"{c.Kind}:{c.Keys}")));
        Assert.False(rig.S.Dictation.Holding, "nothing is held after the key is up");
        await h.DisposeAsync();
    }

    // ------------------------------------------------------------------ A3: never Ctrl+C into a terminal

    [Test]
    public async Task A3_ask_ai_refuses_terminals_without_pressing_anything()
    {
        foreach (var (exe, cls) in new[]
        {
            ("WindowsTerminal.exe", "CASCADIA_HOSTING_WINDOW_CLASS"), ("conhost.exe", "ConsoleWindowClass"), ("cmd.exe", "ConsoleWindowClass"),
            ("mintty.exe", "mintty"), ("SomeNewTerminal.exe", "ConsoleWindowClass"), ("wezterm-gui.exe", "org.wezfurlong.wezterm"),
        })
        {
            var rig = new Ai2Rig();
            rig.Terminals.Exe = exe;
            rig.Terminals.Class = cls;
            var (r, _) = await rig.S.Ask.AskAsync(AskTargets.Find("claude-desktop")!, "{selection}", 2000, CancellationToken.None);
            Assert.Equal(AskResult.InTerminal, r, exe);
            Assert.Empty(rig.Input.Calls, $"{exe}: no keystroke at all");
            Assert.Equal(0, rig.Clipboard.Snapshots, $"{exe}: the clipboard is never touched");
            Assert.Empty(rig.Opened);
        }
        Assert.Equal("SELECT TEXT · IN AN EDITOR", AskArt.ResultText(AskResult.InTerminal));
    }

    [Test]
    public async Task A3_vs_code_is_refused_only_while_its_terminal_has_focus()
    {
        var rig = new Ai2Rig();
        rig.Terminals.Exe = "Code.exe";
        rig.Terminals.Class = "Chrome_WidgetWin_1";
        rig.Terminals.FocusInTerminal = true;
        Assert.Equal(AskResult.InTerminal, (await rig.S.Ask.AskAsync(AskTargets.Find("chatgpt")!, "{selection}", 2000, CancellationToken.None)).Result);
        Assert.Empty(rig.Input.Calls, "no Ctrl+C into VS Code's terminal");
        rig.Terminals.FocusInTerminal = false;
        Assert.Equal(AskResult.Opened, (await rig.S.Ask.AskAsync(AskTargets.Find("chatgpt")!, "{selection}", 2000, CancellationToken.None)).Result, "an editor pane copies");
        rig.Terminals.FocusInTerminal = null;
        Assert.Equal(AskResult.Opened, (await rig.S.Ask.AskAsync(AskTargets.Find("chatgpt")!, "{selection}", 2000, CancellationToken.None)).Result, "unknown focus = an editor");

        Assert.True(TerminalRules.IsTerminalFocus("xterm-helper-textarea", "Terminal 1, bash"));
        Assert.True(TerminalRules.IsTerminalFocus(null, "Terminal 2, pwsh Run the command: Ctrl+Enter"));
        Assert.False(TerminalRules.IsTerminalFocus("inputarea monaco-mouse-cursor-text", "Editor content"));
        Assert.False(TerminalRules.IsTerminalFocus(null, "TerminalGuard.cs"));
        Assert.Equal(WindowHost.App, TerminalRules.Classify(@"C:\Program Files\Notepad++\notepad++.exe", "Notepad++"));
        Assert.Equal(WindowHost.EditorWithTerminal, TerminalRules.Classify("Cursor.exe", "Chrome_WidgetWin_1"));
    }

    // ------------------------------------------------------------------ A4: a slow copy is still read; a newer copy is never clobbered

    [Test]
    public async Task A4_a_copy_that_lands_after_400_ms_is_still_read_and_the_clipboard_restored()
    {
        var rig = new Ai2Rig();
        ITimer? late = null;
        rig.Input.OnCopy = () => late = rig.Time.CreateTimer(_ => rig.Clipboard.Copy("the selected example text"), null, TimeSpan.FromMilliseconds(700), Timeout.InfiniteTimeSpan);
        var (r, chars) = await rig.S.Ask.AskAsync(AskTargets.Find("claude-desktop")!, "{selection}", 2000, CancellationToken.None);
        late?.Dispose();
        Assert.Equal(AskResult.Opened, r);
        Assert.Equal("the selected example text".Length, chars);
        Assert.Equal(1, rig.Clipboard.Restores);
        Assert.Equal("original clipboard text", rig.Clipboard.Text, "the user's clipboard is back");
    }

    [Test]
    public async Task A4_a_newer_copy_is_never_overwritten_by_the_restore()
    {
        var rig = new Ai2Rig();
        rig.Clipboard.AfterRead = () => { rig.Clipboard.AfterRead = null; rig.Clipboard.Copy("something the user copied just now"); };
        var (r, _) = await rig.S.Ask.AskAsync(AskTargets.Find("claude-desktop")!, "{selection}", 2000, CancellationToken.None);
        Assert.Equal(AskResult.OpenedClipboardChanged, r);
        Assert.Equal(0, rig.Clipboard.Restores);
        Assert.Equal("something the user copied just now", rig.Clipboard.Text);
        Assert.Single(rig.Opened);
        Assert.Equal("OPENED · CLIP CHANGED", AskArt.ResultText(r));
    }

    [Test]
    public async Task A4_nothing_selected_waits_the_full_late_copy_window()
    {
        var rig = new Ai2Rig { Selection = null };
        var t0 = rig.Time.GetUtcNow();
        Assert.Equal(AskResult.NothingSelected, (await rig.S.Ask.AskAsync(AskTargets.Find("chatgpt")!, "{selection}", 2000, CancellationToken.None)).Result);
        Assert.True(rig.Time.GetUtcNow() - t0 >= AskService.LateCopyWait, "watched for 2 s");
        Assert.Equal(0, rig.Clipboard.Restores, "nothing changed, nothing to put back");
    }

    // ------------------------------------------------------------------ A5: user refreshes respect Retry-After, in-flight and backoff

    [Test]
    public async Task A5_user_refreshes_respect_retry_after_and_in_flight_and_count_from_the_start()
    {
        var http = FakeHttp.AllHealthy();
        http.ByHost["status.claude.com"] = _ => FakeHttp.Status(429, TimeSpan.FromMinutes(30));
        var rig = new Ai2Rig(http: http);
        using var lease = rig.S.Health.Demand(["claude"]);
        rig.Time.Advance(TimeSpan.FromSeconds(121));
        Assert.False(rig.S.Health.RequestRefresh("claude"), "Retry-After 30 min is running");
        await Task.Delay(20);
        Assert.Equal(1, http.Count("status.claude.com"));
        rig.Time.Advance(TimeSpan.FromMinutes(29));
        Assert.True(rig.S.Health.RequestRefresh("claude"), "after Retry-After");
        Assert.Equal(2, http.Count("status.claude.com"));

        // In flight (the reviewer's repro D): the cadence fetch is running when the user pushes. Before, the floor was checked
        // against the PREVIOUS attempt (2.5 min ago) and a second fetch followed 7 s later. Now: refused while in flight, and the
        // floor counts from this fetch's START.
        var time = new ManualTimeProvider();
        var gate = new GateFetcher();
        var health = new HealthService(gate, time, new CapturingLog(), () => new Ai2Settings(), () => 0.5);
        using var l2 = health.Demand(["github"]);
        gate.Release();
        await Task.Delay(20);
        time.Advance(TimeSpan.FromMinutes(2.5));
        var tick = health.TickAsync(CancellationToken.None);      // the cadence fetch starts and waits on the gate
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.False(health.RequestRefresh("github"), "refused: that source is in flight");
        gate.Release();
        await tick;
        time.Advance(TimeSpan.FromSeconds(6));
        Assert.False(health.RequestRefresh("github"), "refused: 7 s after the last fetch STARTED");
        await health.TickAsync(CancellationToken.None);
        Assert.Equal(2, gate.Starts, "no extra fetch");
        time.Advance(TimeSpan.FromSeconds(54));
        Assert.True(health.RequestRefresh("github"), "61 s after the start: allowed");
        Assert.Equal(3, gate.Starts);
        gate.Release();
    }

    // ------------------------------------------------------------------ A6: "Check now" refreshes only the action's providers

    [Test]
    public async Task A6_check_now_refreshes_only_the_actions_own_providers()
    {
        var rig = new Ai2Rig();
        Assert.Equal("Checking now.", Ai2Pi.RefreshProviders(rig.S, ["github"]));
        await Task.Delay(10);
        Assert.Equal(1, rig.Http.Count("www.githubstatus.com"));
        foreach (var host in new[] { "status.claude.com", "status.openai.com", "status.cursor.com", "health.aws.amazon.com", "www.google.com", "status.cloud.google.com" })
            Assert.Equal(0, rig.Http.Count(host), host);
        // And only that source joins the background poll.
        for (var i = 0; i < 30; i++) { rig.Time.Advance(TimeSpan.FromMinutes(1)); await rig.S.Health.TickAsync(CancellationToken.None); }
        Assert.Equal(0, rig.Http.Requests.Count(r => r.Url.Host != "www.githubstatus.com"), "no other source was enrolled");
        Assert.Equal("Nothing to check here.", Ai2Pi.RefreshProviders(rig.S, null));

        // Through a real health key's PI.
        var rig2 = new Ai2Rig();
        var h = await rig2.AppearAsync<HealthKeyAction>(TestDevices.Galleon, new(0, 0), settings: new HealthKeySettings { Provider = "cursor" });
        rig2.Time.Advance(TimeSpan.FromSeconds(61));
        await h.PiMessageAsync("health.refresh");
        await Task.Delay(50);
        Assert.Equal(2, rig2.Http.Count("status.cursor.com"));
        Assert.Equal(0, rig2.Http.Requests.Count(r => r.Url.Host != "status.cursor.com"));
        await h.DisposeAsync();
    }

    // ------------------------------------------------------------------ A7: the ENCODED link is capped, on whole characters

    [Test]
    public void A7_links_cap_the_encoded_length_on_whole_characters()
    {
        var cjk = string.Concat(Enumerable.Repeat("日本語のテキストを説明してください。", 1000));
        foreach (var t in AskTargets.All)
        {
            var link = AskTargets.BuildLink(t, "{selection}", cjk, 14_000);
            Assert.True(link.Length <= t.MaxLink, $"{t.Id}: {link.Length} > {t.MaxLink}");
            var text = Uri.UnescapeDataString(link[t.Prefix.Length..]);
            Assert.True(cjk.StartsWith(text, StringComparison.Ordinal), $"{t.Id}: a clean prefix of the selection");
            Assert.True(text.Length > 0);
        }
        Assert.True(AskTargets.All.All(t => t.MaxLink <= 30_000), "every link stays below the 32,767-character command line");

        // Emoji (surrogate pairs, ZWJ sequences, flags) are never split, whatever the budget cuts.
        var family = "👨‍👩‍👧‍👦";
        var emoji = string.Concat(Enumerable.Repeat(family + "🇺🇸é", 600));
        var cli = AskTargets.Find("claude-cli")!;
        var decoded = Uri.UnescapeDataString(AskTargets.BuildLink(cli, "{selection}", emoji, 5_000)[cli.Prefix.Length..]);
        var elements = StringInfo.ParseCombiningCharacters(decoded);
        var last = decoded[elements[^1]..];
        Assert.True(last is "é" or "🇺🇸" || last == family, $"the last character is whole: {string.Join(" ", last.Select(c => ((int)c).ToString("X4", CultureInfo.InvariantCulture)))}");
        Assert.True(AskTargets.BuildLink(cli, "{selection}", emoji, 5_000).Length <= cli.MaxLink);

        // A lone surrogate never throws.
        var lone = AskTargets.BuildLink(AskTargets.All[0], "{selection}", "ab" + (char)0xD800 + "cd", 2000);
        Assert.Contains("%EF%BF%BD", lone);
        // ASCII well under every cap is untouched.
        Assert.Equal("Q: hi", Uri.UnescapeDataString(AskTargets.BuildLink(AskTargets.Find("chatgpt")!, "Q: {selection}", " hi ", 2000)[AskTargets.Find("chatgpt")!.Prefix.Length..]));
    }

    // ------------------------------------------------------------------ A8: safe-mode Forget reports the truth

    [Test]
    public async Task A8_safe_mode_forget_says_nothing_was_removed_and_changes_nothing()
    {
        var rig = new Ai2Rig(safeMode: true, settings: new Ai2Settings { AnthropicAdminEnabled = true });
        rig.Vault.Items[AdminUsageService.SecretName(AdminProvider.Anthropic)] = "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd";
        var message = Message(await Ai2Pi.HandleAsync(rig.S, "admin.anthropic.forget", null));
        Assert.Contains("NOT removed", message);
        Assert.True(rig.Vault.Items.ContainsKey(AdminUsageService.SecretName(AdminProvider.Anthropic)), "safe mode wrote nothing");
        Assert.True(rig.Settings.AnthropicAdminEnabled, "and did not pretend to turn it off");
        Assert.Equal(KeyChange.SafeMode, rig.S.Admin.ForgetKey(AdminProvider.Anthropic));

        var live = new Ai2Rig(settings: new Ai2Settings { AnthropicAdminEnabled = true });
        live.S.Admin.SaveKey(AdminProvider.Anthropic, "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd");
        Assert.Contains("key removed", Message(await Ai2Pi.HandleAsync(live.S, "admin.anthropic.forget", null)));
        Assert.Null(live.S.Admin.KeyHint(AdminProvider.Anthropic));
        Assert.False(live.Settings.AnthropicAdminEnabled);
    }

    // ------------------------------------------------------------------ A9: admin keys never follow a redirect

    [Test]
    public async Task A9_keyed_requests_go_through_the_client_that_never_redirects()
    {
        var follow = new RecordingHandler();
        var noFollow = new RecordingHandler();
        using var f = new HttpClientFetcher(follow, noFollow, TimeProvider.System);
        var (cost, usage) = AdminUsageService.Requests(AdminProvider.Anthropic, "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd", DateTimeOffset.UtcNow);
        var (ocost, _) = AdminUsageService.Requests(AdminProvider.OpenAi, "sk-admin-EXAMPLEEXAMPLEEXAMPLE-abcd", DateTimeOffset.UtcNow);
        foreach (var r in new[] { cost, usage, ocost })
        {
            Assert.True(HttpClientFetcher.IsKeyed(r));
            var res = await f.GetAsync(r, CancellationToken.None);
            Assert.Equal(302, res.Status, "a redirect is a failed answer, never followed");
        }
        Assert.Equal(3, noFollow.Count);
        Assert.Equal(0, follow.Count);
        await f.GetAsync(new HttpFetchRequest(new Uri("https://status.example.invalid/x")), CancellationToken.None);
        Assert.Equal(1, follow.Count, "status pages may follow redirects");
        Assert.False(HttpClientFetcher.Handler(allowRedirects: false).AllowAutoRedirect);
        Assert.True(HttpClientFetcher.Handler(allowRedirects: true).AllowAutoRedirect);
    }

    // ------------------------------------------------------------------ A10: a result for an old profile is dropped

    [Test]
    public async Task A10_a_result_for_the_previous_profile_never_shows_under_the_new_one()
    {
        var rig = new Ai2Rig(settings: new Ai2Settings { BedrockUsageEnabled = true, AwsProfile = "prod-readonly" });
        var cli = new GateCli();
        var svc = new BedrockUsageService(cli, () => rig.S.Settings.Current, rig.Time, rig.Log, false);
        using var lease = svc.Demand();          // run #1 starts for prod-readonly and waits
        await Task.Delay(20);
        rig.Configure(x => x.AwsProfile = "dev-readonly");
        cli.Release();
        await Task.Delay(50);
        var after = svc.Snapshot();
        Assert.Equal("prod-readonly", cli.Profiles[0]);
        Assert.Equal("dev-readonly", after.Profile);
        Assert.False(after.Series.IsKnown, "prod's numbers were dropped");
        Assert.NotEqual(BedrockState.Ok, after.State);
    }

    // ------------------------------------------------------------------ A11: the key hint is cached; vault errors never reach a face

    [Test]
    public void A11_the_hint_is_read_once_and_a_broken_vault_reads_as_no_key()
    {
        var vault = new CountingVault { ["anthropic-admin"] = "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd" };
        var rig = new Ai2Rig(settings: new Ai2Settings { AnthropicAdminEnabled = true });
        var admin = new AdminUsageService(rig.Http, vault, () => rig.Settings, rig.Time, rig.Log, false);
        for (var i = 0; i < 100; i++) Assert.Equal("••••abcd", admin.Snapshot(AdminProvider.Anthropic).KeyHint);
        Assert.Equal(1, vault.Loads, "one DPAPI read, not one per frame");

        vault.Throw = true;
        var broken = new AdminUsageService(rig.Http, vault, () => rig.Settings, rig.Time, rig.Log, false);
        var snap = broken.Snapshot(AdminProvider.Anthropic);   // must not throw
        Assert.Equal(AdminState.NoKey, snap.State);
        Assert.Null(snap.KeyHint);
        Assert.Equal(KeyChange.StoreFailed, broken.TrySaveKey(AdminProvider.Anthropic, "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd", out _));
        Assert.Equal(KeyChange.StoreFailed, broken.ForgetKey(AdminProvider.Anthropic));
        Assert.DoesNotContain("EXAMPLEEXAMPLE", string.Join("\n", rig.Log.Lines));
    }

    // ------------------------------------------------------------------ A12: the saved key doesn't stay on the clipboard

    [Test]
    public async Task A12_saving_a_key_clears_the_clipboard_it_came_from_and_discloses_history()
    {
        var rig = new Ai2Rig();
        rig.Clipboard.Text = "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd";
        var message = Message(await Ai2Pi.HandleAsync(rig.S, "admin.anthropic.saveKey", null));
        Assert.Contains("Saved ••••abcd", message);
        Assert.Contains("clipboard was cleared", message);
        Assert.Contains("Win+V", message);
        Assert.Equal(1, rig.Clipboard.Clears);
        Assert.Null(rig.Clipboard.Text);
        Assert.DoesNotContain("EXAMPLEEXAMPLE", message);

        // Something newer was copied between our read and the clear: it stays.
        var rig2 = new Ai2Rig();
        rig2.Clipboard.Text = "sk-ant-admin01-EXAMPLEEXAMPLEEXAMPLE-abcd";
        rig2.Clipboard.AfterRead = () => { rig2.Clipboard.AfterRead = null; rig2.Clipboard.Copy("a newer copy"); };
        var m2 = Message(await Ai2Pi.HandleAsync(rig2.S, "admin.anthropic.saveKey", null));
        Assert.Contains("Clear your clipboard now", m2);
        Assert.Equal(0, rig2.Clipboard.Clears);
        Assert.Equal("a newer copy", rig2.Clipboard.Text);
    }

    // ------------------------------------------------------------------ helpers

    private static string Message(object? state) => JsonSerializer.SerializeToNode(state)?["message"]?.GetValue<string>() ?? "";

    /// <summary>Headers arrive; the body never does (until cancelled).</summary>
    private sealed class StallingBodyHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new NeverEndingStream()) });
    }

    private sealed class NeverEndingStream : Stream
    {
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default) { await Task.Delay(Timeout.Infinite, ct); return 0; }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => 0; set { } }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => 0;
        public override void SetLength(long value) { }
        public override void Write(byte[] buffer, int offset, int count) { }
    }

    /// <summary>Answers every request with a 302 to another host, counting them (the redirect is never followed here).</summary>
    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int Count;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Count);
            var r = new HttpResponseMessage(HttpStatusCode.Found) { Content = new ByteArrayContent([]) };
            r.Headers.Location = new Uri("https://elsewhere.example/steal");
            return Task.FromResult(r);
        }
    }

    /// <summary>One host never answers (it honors cancellation); the others answer from the fixtures.</summary>
    private sealed class HangingHostFetcher(string hangingHost) : IHttpFetcher
    {
        private readonly FakeHttp _ok = FakeHttp.AllHealthy();
        private readonly List<string> _hosts = [];
        public int Count(string host) { lock (_hosts) return _hosts.Count(h => h == host); }
        public async Task<HttpFetchResult> GetAsync(HttpFetchRequest request, CancellationToken ct)
        {
            lock (_hosts) _hosts.Add(request.Url.Host);
            if (request.Url.Host == hangingHost) await Task.Delay(Timeout.Infinite, ct);
            return await _ok.GetAsync(request, ct);
        }
    }

    /// <summary>Every fetch waits until released.</summary>
    private sealed class GateFetcher : IHttpFetcher
    {
        private readonly Queue<TaskCompletionSource> _waits = new();
        public int Starts;
        public async Task<HttpFetchResult> GetAsync(HttpFetchRequest request, CancellationToken ct)
        {
            TaskCompletionSource tcs;
            lock (_waits) { tcs = new(TaskCreationOptions.RunContinuationsAsynchronously); _waits.Enqueue(tcs); Starts++; }
            await tcs.Task.WaitAsync(ct);
            return FakeHttp.Ok(AI2Fixtures.StatuspageSummary(("pjmpxvq2cmr2", "Copilot", "operational")));
        }
        public void Release() { lock (_waits) if (_waits.Count > 0) _waits.Dequeue().TrySetResult(); }
    }

    private sealed class GateCli : IAwsCli
    {
        private readonly TaskCompletionSource _go = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly List<string> Profiles = [];
        public string? Locate() => @"C:\fake\aws.exe";
        public async Task<AwsCliResult> RunAsync(IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct)
        {
            Profiles.Add(args[args.ToList().IndexOf("--profile") + 1]);
            await _go.Task;
            return new AwsCliResult(true, 0, AI2Fixtures.MetricData(), AwsCliProblem.None, false);
        }
        public void Release() => _go.TrySetResult();
    }

    private sealed class CountingVault : ISecretVault, System.Collections.IEnumerable
    {
        private readonly Dictionary<string, string> _items = new(StringComparer.Ordinal);
        public int Loads;
        public bool Throw;
        public string this[string name] { set => _items[name] = value; }
        public System.Collections.IEnumerator GetEnumerator() => _items.GetEnumerator();
        public string? Load(string name)
        {
            Loads++;
            if (Throw) throw new IOException("the store file is locked");
            return _items.TryGetValue(name, out var v) ? v : null;
        }
        public void Save(string name, string secret) { if (Throw) throw new IOException("the store file is locked"); _items[name] = secret; }
        public void Delete(string name) { if (Throw) throw new IOException("the store file is locked"); _items.Remove(name); }
    }
}
