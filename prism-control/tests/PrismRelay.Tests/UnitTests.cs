using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Testing;
using PrismRelay.Hook;

namespace PrismRelay.Tests;

public class FramingTests
{
    private static MemoryStream Frames(params byte[][] bodies)
    {
        var ms = new MemoryStream();
        foreach (var b in bodies) ms.Write(Framing.Encode(b));
        ms.Position = 0;
        return ms;
    }

    [Test]
    public async Task Reads_frames_drops_oversize_and_reports_eof()
    {
        var big = new byte[5000];
        var s = Frames("{\"a\":1}"u8.ToArray(), big, "{\"b\":2}"u8.ToArray());
        var f1 = await Framing.ReadAsync(s, 1024, CancellationToken.None);
        Assert.Equal(FrameKind.Frame, f1.Kind);
        Assert.Equal("{\"a\":1}", Encoding.UTF8.GetString(f1.Body));
        var f2 = await Framing.ReadAsync(s, 1024, CancellationToken.None);
        Assert.Equal(FrameKind.Oversize, f2.Kind);
        Assert.Equal(5000u, f2.Length);
        var f3 = await Framing.ReadAsync(s, 1024, CancellationToken.None);
        Assert.Equal("{\"b\":2}", Encoding.UTF8.GetString(f3.Body), "the stream stays in sync after a drop");
        Assert.Equal(FrameKind.Eof, (await Framing.ReadAsync(s, 1024, CancellationToken.None)).Kind);
    }

    [Test]
    public async Task Eof_mid_frame_and_hard_cap()
    {
        var cut = new MemoryStream([10, 0, 0, 0, 1, 2]);
        Assert.Equal(FrameKind.Eof, (await Framing.ReadAsync(cut, 1024, CancellationToken.None)).Kind);
        var header = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, Framing.HardCap + 1);
        await Assert.ThrowsAsync<InvalidDataException>(() => Framing.ReadAsync(new MemoryStream(header), 1024, CancellationToken.None));
        Assert.Equal(FrameKind.Eof, (await Framing.ReadAsync(new MemoryStream([1, 0]), 1024, CancellationToken.None)).Kind);
        Assert.Equal(1024 * 1024, Framing.BrowserCap);
    }
}

public class DiscoveryTests
{
    [Test]
    public void Valid_files_parse_and_invalid_ones_are_null()
    {
        using var root = new TempRoot();
        var p = root.Ingress("ai");
        Assert.Null(Discovery.TryRead(p), "missing");
        FakePipeServer.WriteDiscovery(p, "prism-control-ai-" + new string('a', 32), new string('b', 64), 1234);
        var d = Assert.NotNull(Discovery.TryRead(p));
        Assert.Equal(1234, d.Pid);
        Assert.Equal(new string('b', 64), d.Token);
        foreach (var bad in new[]
        {
            "{\"pipe\":\"..\\\\..\\\\evil\",\"token\":\"" + new string('b', 64) + "\"}",
            "{\"pipe\":\"other-pipe-name-here\",\"token\":\"" + new string('b', 64) + "\"}",
            "{\"pipe\":\"prism-control-ai-x\",\"token\":\"short\"}",
            "{\"pipe\":\"prism-control-ai-xyz\"}",
            "{\"pipe\":5,\"token\":\"" + new string('b', 64) + "\"}",
            "[]", "not json", "",
        })
        {
            File.WriteAllText(p, bad);
            Assert.Null(Discovery.TryRead(p), bad);
        }
        File.WriteAllText(p, "{\"pipe\":\"prism-control-ai-" + new string('a', 32) + "\",\"token\":\"" + new string('b', 64) + "\",\"otelToken\":\"" + new string('c', 64) + "\"}");
        Assert.Equal(new string('c', 64), Discovery.TryRead(p)!.OtelToken);
        Assert.Equal(0, Discovery.TryRead(p)!.Pid);
    }

    [Test]
    public void Paths_follow_PRISM_CONTROL_DIR()
    {
        using var root = new TempRoot();
        var before = Environment.GetEnvironmentVariable(RelayEnv.DirEnv);
        try
        {
            Environment.SetEnvironmentVariable(RelayEnv.DirEnv, root.Path);
            Assert.Equal(Path.Combine(root.Path, "modules", "ai", "ingress.json"), RelayEnv.IngressFile("ai"));
            Assert.Equal(PrismControl.Desktop.DesktopPaths.IngressFile("ai"), RelayEnv.IngressFile("ai"), "same path as the plugin side");
        }
        finally { Environment.SetEnvironmentVariable(RelayEnv.DirEnv, before); }
        Assert.Equal("0.1.0", RelayEnv.Version);
    }
}

public class NativeHostArgTests
{
    [Test]
    public void Origins_and_parent_window()
    {
        Assert.True(NativeHost.IsExtensionOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop/"));
        Assert.False(NativeHost.IsExtensionOrigin("chrome-extension://abc"));
        Assert.False(NativeHost.IsExtensionOrigin("https://example.com/"));
        Assert.False(NativeHost.IsExtensionOrigin("chrome-extension://ABC/"));
        Assert.False(NativeHost.IsExtensionOrigin("chrome-extension:///"));
        Assert.Equal(0, NativeHost.ParentWindow(["x"]));
        Assert.Equal(1234, NativeHost.ParentWindow(["chrome-extension://a/", "--parent-window=1234"]));
    }
}

public class HookInputTests
{
    [Test]
    public void Reads_wanted_fields_and_skips_the_rest_without_decoding_it()
    {
        var json = """{"session_id":"s-1","transcript_path":"C:\\x","cwd":"C:\\Users\\Example\\repo","hook_event_name":"PreToolUse","prompt":"secret prompt","tool_name":"Bash","tool_input":{"command":"ls -la","content":"big","nested":{"a":[1,2]},"file_path":"C:\\a\\b.txt"},"tool_response":{"stdout":"…"},"is_interrupt":false}""";
        var i = HookInput.Read(Encoding.UTF8.GetBytes(json), complete: true);
        Assert.True(i.Parsed);
        Assert.Equal("s-1", i.Str("session_id"));
        Assert.Equal("Bash", i.Str("tool_name"));
        Assert.Equal(false, i.Bool("is_interrupt"));
        Assert.False(i.Has("prompt"), "never materialized");
        Assert.False(i.Has("transcript_path"));
        Assert.Equal("ls -la", i.ToolString("command"));
        Assert.Equal(@"C:\a\b.txt", i.ToolString("file_path"));
        Assert.Equal(ToolInputState.Complete, i.ToolInputState);
        Assert.Equal(System.Text.Json.JsonTokenType.StartObject, i.Member("nested")!.Kind, "nested values are recorded as nested, never decoded");
        Assert.Null(i.Member("nested")!.Text);
    }

    [Test]
    public void A_payload_cut_at_the_cap_keeps_the_fields_before_the_cut()
    {
        var json = Encoding.UTF8.GetBytes("""{"session_id":"s-2","hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"content":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa""");
        var i = HookInput.Read(json, complete: false);
        Assert.False(i.Parsed);
        Assert.Equal("s-2", i.Str("session_id"));
        Assert.Equal("Write", i.Str("tool_name"));
    }

    [Test]
    public void Codex_command_arrays_are_joined_and_garbage_is_harmless()
    {
        var i = HookInput.Read("""{"tool_input":{"command":["bash","-lc","git status"]}}"""u8, complete: true);
        Assert.Equal("bash|-lc|git status", string.Join("|", i.Member("command")!.Items!));
        Assert.Equal("bash -lc \"git status\"", HookPolicy.JoinArgv(i.Member("command")!.Items!), "element boundaries stay visible");
        Assert.False(HookInput.Read("not json"u8, true).Parsed);
        Assert.False(HookInput.Read("[1,2]"u8, true).Parsed);
        Assert.False(HookInput.Read(""u8, true).Parsed);
        Assert.Null(HookInput.Read("""{"session_id":null}"""u8, true).Str("session_id"));
        var dup = HookInput.Read("""{"session_id":"first","session_id":"second"}"""u8, true);
        Assert.Equal("first", dup.Str("session_id"), "the first occurrence wins");
    }
}

public class HookPolicyTests
{
    private static readonly ProcEntry Claude = new(4242, "claude.exe", 1_000), Pwsh = new(4100, "pwsh.exe", 900), Wt = new(77, "WindowsTerminal.exe", 500), Explorer = new(5, "explorer.exe", 100);

    private static JsonObject Event(string agent, string ev, string payload, IReadOnlyList<ProcEntry>? chain = null, Dictionary<string, string>? env = null, bool truncated = false)
    {
        var input = HookInput.Read(Encoding.UTF8.GetBytes(payload), complete: !truncated);
        var ctx = new HookPolicy.Context(agent, ev, 1792212345678, input, n => env?.GetValueOrDefault(n), chain ?? [Claude, Pwsh, Wt, Explorer], 0x1234, payload.Length, truncated);
        var frame = JsonNode.Parse(HookPolicy.BuildFrame(ctx, "tok"))!.AsObject();
        Assert.Equal("tok", frame["token"]!.GetValue<string>());
        Assert.Equal(HookPolicy.ProtocolVersion, frame["v"]!.GetValue<int>());
        Assert.Equal(2, frame["event"]!["v"]!.GetValue<int>());
        return frame["event"]!.AsObject();
    }

    private const string Common = """ "session_id":"sess-1","transcript_path":"C:\\t.jsonl","cwd":"C:\\Users\\Example\\Repo","permission_mode":"default","agent_id":"ag-1","agent_type":"Explore" """;

    private static string Keys(JsonObject fields) => string.Join(",", fields.Select(kv => kv.Key).OrderBy(k => k, StringComparer.Ordinal));

    private const string CommonKeys = "agent_id,agent_type,cwd_hash,cwd_name,hook_event_name,permission_mode,session_id";

    /// <summary>The common keys plus <paramref name="extra"/>, sorted the same way as <see cref="Keys"/>.</summary>
    private static string With(params string[] extra) => string.Join(",", CommonKeys.Split(',').Concat(extra).OrderBy(k => k, StringComparer.Ordinal));

    [Test]
    public void Common_envelope_and_identity()
    {
        var e = Event("claude", "Stop", "{" + Common + ""","hook_event_name":"Stop","last_assistant_message":"SECRET","stop_hook_active":true}""");
        Assert.Equal("Stop", e["name"]!.GetValue<string>());
        Assert.Equal("claude", e["agent"]!.GetValue<string>());
        Assert.Equal("claude", e["tool"]!.GetValue<string>());
        Assert.Equal("claude", e["origin"]!.GetValue<string>());
        Assert.Equal(1792212345678, e["at"]!.GetValue<long>());
        Assert.Equal("sess-1", e["sessionId"]!.GetValue<string>());
        Assert.Equal(CommonKeys, Keys(e["fields"]!.AsObject()), "Stop: common fields only");
        Assert.Equal(PrismControl.Desktop.CwdHash.Compute(@"C:\Users\Example\Repo"), e["fields"]!["cwd_hash"]!.GetValue<string>());
        Assert.Equal("Repo", e["fields"]!["cwd_name"]!.GetValue<string>());
        Assert.Equal(4242, e["agentProcess"]!["pid"]!.GetValue<int>());
        Assert.Equal(1000, e["agentProcess"]!["startedAt"]!.GetValue<long>());
        Assert.Equal(4242, e["parent"]!["pid"]!.GetValue<int>());
        Assert.Equal("claude.exe,pwsh.exe,WindowsTerminal.exe", string.Join(",", e["chain"]!.AsArray().Select(p => p!["exe"]!.GetValue<string>())));
        Assert.Equal("windows-terminal", e["host"]!["kind"]!.GetValue<string>());
        Assert.Equal(77, e["host"]!["pid"]!.GetValue<int>());
        Assert.Equal(0x1234, e["host"]!["consoleHwnd"]!.GetValue<long>());
        Assert.Equal(false, e["stdin"]!["truncated"]!.GetValue<bool>());
        Assert.Equal(true, e["stdin"]!["parsed"]!.GetValue<bool>());
        var text = e.ToJsonString();
        Assert.DoesNotContain("SECRET", text);
        Assert.DoesNotContain("t.jsonl", text);
        Assert.DoesNotContain(@"Users\\Example", text, "the full cwd never leaves the relay");
    }

    [Test]
    public void Per_event_allow_list_matches_research_7_2()
    {
        string P(string extra) => "{" + Common + "," + extra + "}";
        var tool = """ "tool_name":"mcp__github__create_issue","tool_input":{"command":"rm -rf /"},"tool_response":{"x":1} """;
        Assert.Equal(With("mcp_server", "tool_name"), Keys(Event("claude", "PreToolUse", P(tool))["fields"]!.AsObject()));
        Assert.Equal("github", Event("claude", "PreToolUse", P(tool))["fields"]!["mcp_server"]!.GetValue<string>());
        Assert.Equal(With("mcp_server", "tool_name"), Keys(Event("claude", "PostToolUse", P(tool))["fields"]!.AsObject()));
        Assert.Equal(With("tool_name"), Keys(Event("claude", "PermissionRequest", P("\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"x\"},\"permission_suggestions\":[1]"))["fields"]!.AsObject()));
        var failure = Event("claude", "PostToolUseFailure", P("\"tool_name\":\"Bash\",\"error\":\"Command timed out after 2m\",\"is_interrupt\":false"))["fields"]!.AsObject();
        Assert.Equal(With("error_category", "is_interrupt", "tool_name"), Keys(failure));
        Assert.Equal("timeout", failure["error_category"]!.GetValue<string>());
        Assert.DoesNotContain("2m", failure.ToJsonString(), "the error text is dropped");
        Assert.Equal(With("notification_type"), Keys(Event("claude", "Notification", P("\"notification_type\":\"permission_prompt\",\"message\":\"Claude needs your permission to use Bash\""))["fields"]!.AsObject()));
        Assert.Equal(With("error"), Keys(Event("claude", "StopFailure", P("\"error\":\"rate_limit\",\"error_details\":\"…\",\"last_assistant_message\":\"x\""))["fields"]!.AsObject()));
        Assert.Equal(CommonKeys, Keys(Event("claude", "StopFailure", P("\"error\":\"Free text with a path C:\\\\x\""))["fields"]!.AsObject()), "only enum tokens");
        Assert.Equal(With("model", "source"), Keys(Event("claude", "SessionStart", P("\"source\":\"startup\",\"model\":\"claude-example-1\""))["fields"]!.AsObject()));
        Assert.Equal(With("reason"), Keys(Event("claude", "SessionEnd", P("\"reason\":\"clear\""))["fields"]!.AsObject()));
        Assert.Equal(CommonKeys, Keys(Event("claude", "UserPromptSubmit", P("\"prompt\":\"MY PROMPT\""))["fields"]!.AsObject()));
        Assert.DoesNotContain("MY PROMPT", Event("claude", "UserPromptSubmit", P("\"prompt\":\"MY PROMPT\"")).ToJsonString());
        Assert.Equal(CommonKeys, Keys(Event("codex", "Interrupt", P("\"anything\":\"else\""))["fields"]!.AsObject()));
        Assert.Equal(CommonKeys, Keys(Event("claude", "SubagentStop", P("\"agent_transcript_path\":\"x\""))["fields"]!.AsObject()));
    }

    [Test]
    public void Strings_are_capped_and_control_characters_removed()
    {
        var e = Event("claude", "SessionStart", "{\"session_id\":\"" + new string('s', 500) + "\",\"model\":\"a\\u0007b\\nc\",\"source\":\"\"}");
        Assert.Equal(128, e["fields"]!["session_id"]!.GetValue<string>().Length);
        Assert.Equal("abc", e["fields"]!["model"]!.GetValue<string>());
        Assert.Null(e["fields"]!["source"], "empty strings are omitted");
        Assert.Equal("a", HookPolicy.Clean("a\uD83D", 2));
    }

    [Test]
    public void Error_categories()
    {
        Assert.Equal("interrupted", HookPolicy.ErrorCategory(true, "whatever"));
        Assert.Equal("timeout", HookPolicy.ErrorCategory(false, "Timed out"));
        Assert.Equal("permission", HookPolicy.ErrorCategory(false, "EACCES: permission denied"));
        Assert.Equal("not_found", HookPolicy.ErrorCategory(false, "ENOENT: no such file"));
        Assert.Equal("failed", HookPolicy.ErrorCategory(false, "exit code 1"));
        Assert.Equal("failed", HookPolicy.ErrorCategory(false, null));
        Assert.Null(HookPolicy.McpServerOf("Bash"));
        Assert.Equal("srv", HookPolicy.McpServerOf("mcp__srv"));
    }

    [Test]
    public void Tool_detection_and_origin()
    {
        Assert.Equal("cursor-via-claude-hooks", Event("claude", "Stop", """{"session_id":"x","cursor_version":"1.2"}""")["origin"]!.GetValue<string>());
        Assert.Equal("cursor", Event("claude", "Stop", """{"session_id":"x"}""", env: new() { ["CURSOR_VERSION"] = "1.2" })["tool"]!.GetValue<string>());
        var copilot = Event("claude", "Stop", """{"sessionId":"cp-1"}""");
        Assert.Equal("copilot", copilot["tool"]!.GetValue<string>());
        Assert.Equal("copilot-via-claude-hooks", copilot["origin"]!.GetValue<string>());
        Assert.Equal("cp-1", copilot["sessionId"]!.GetValue<string>());
        Assert.Equal("codex", Event("codex", "Stop", """{"session_id":"x"}""", [new(9, "cmd.exe", 2_000), new(8, "codex.exe", 1_500), new(7, "ChatGPT.exe", 1_000)])["tool"]!.GetValue<string>());
        Assert.Equal("codex-via-claude-hooks", Event("claude", "Stop", "{}", [new(8, "codex.exe", 1)])["origin"]!.GetValue<string>(), "the process chain beats argv");
        Assert.Equal("claude", Event("claude", "Stop", "{}", [new(8, "node.exe", 1)])["tool"]!.GetValue<string>(), "fallback: argv");
        Assert.Equal("unknown", Event("someagent", "Stop", "{}", [new(8, "node.exe", 1)])["tool"]!.GetValue<string>());
        Assert.Equal("someagent", Event("someagent", "Stop", "{}", [new(8, "node.exe", 1)])["origin"]!.GetValue<string>());
        Assert.Equal("g-1", Event("gemini", "AfterAgent", "{}", env: new() { ["GEMINI_SESSION_ID"] = "g-1" })["sessionId"]!.GetValue<string>());
        Assert.Null(Event("claude", "Stop", "{}")["sessionId"]?.GetValue<string>());
    }

    [Test]
    public void Host_classification()
    {
        string Kind(params ProcEntry[] chain) => Event("claude", "Stop", "{}", chain)["host"]!["kind"]!.GetValue<string>();
        Assert.Equal("vscode", Kind(Claude, new(3, "Code.exe", 1)));
        Assert.Equal("cursor", Kind(new(9, "node.exe", 2), new(3, "Cursor.exe", 1)));
        Assert.Equal("jetbrains", Kind(Claude, Pwsh, new(3, "idea64.exe", 1)));
        Assert.Equal("orca", Kind(Claude, new(4, "cmd.exe", 3), new(3, "Orca.exe", 2), new(2, "Orca.exe", 1), Explorer));
        Assert.Equal("chatgpt", Kind(new(9, "cmd.exe", 3), new(8, "codex.exe", 2), new(7, "ChatGPT.exe", 1)));
        Assert.Equal("claude-desktop", Kind(Claude, new(3, "claude.exe", 1)));
        var console = Event("claude", "Stop", "{}", [Claude, Pwsh, Explorer]);
        Assert.Equal("console", console["host"]!["kind"]!.GetValue<string>());
        Assert.Equal(4100, console["host"]!["pid"]!.GetValue<int>(), "the top-most process below explorer");
        Assert.Equal(2, console["chain"]!.AsArray().Count);
        Assert.Equal("unknown", Kind());
        Assert.Equal("unknown", Kind(Explorer));
        Assert.Equal("unknown", Kind(Claude, Pwsh));
        var node = Event("claude", "Stop", "{}", [new(9, "bash.exe", 3), new(8, "node.exe", 2), Wt]);
        Assert.Equal(8, node["agentProcess"]!["pid"]!.GetValue<int>(), "node.exe after shells is the agent");
        Assert.Null(Event("claude", "Stop", "{}", [new(9, "python.exe", 3), Wt])["agentProcess"], "an unknown non-shell parent is not guessed");
    }

    [Test]
    public void Env_allow_list_is_exact()
    {
        var env = new Dictionary<string, string>
        {
            ["WT_SESSION"] = "11111111-2222-3333-4444-555555555555", ["ORCA_PANE_KEY"] = "pane-7", ["ORCA_TERMINAL_HANDLE"] = "t-3",
            ["TERM_PROGRAM"] = "vscode", ["ORCA_HOOK_TOKEN"] = "SECRET-TOKEN", ["ANTHROPIC_API_KEY"] = "SECRET-KEY", ["PATH"] = "C:\\x",
            ["CLAUDE_PID"] = "4242",
        };
        var e = Event("claude", "Stop", "{}", env: env);
        Assert.Equal("CLAUDE_PID,ORCA_PANE_KEY,ORCA_TERMINAL_HANDLE,TERM_PROGRAM,WT_SESSION", string.Join(",", e["env"]!.AsObject().Select(kv => kv.Key).OrderBy(k => k, StringComparer.Ordinal)));
        Assert.DoesNotContain("SECRET", e.ToJsonString());
    }

    [Test]
    public void Truncated_stdin_is_reported()
    {
        var e = Event("claude", "PostToolUse", """{"session_id":"s","tool_name":"Write","tool_input":{"content":"aaaa""", truncated: true);
        Assert.Equal(true, e["stdin"]!["truncated"]!.GetValue<bool>());
        Assert.Equal(false, e["stdin"]!["parsed"]!.GetValue<bool>());
        Assert.Equal("Write", e["fields"]!["tool_name"]!.GetValue<string>());
    }

    [Test]
    public void Names_are_validated()
    {
        Assert.True(HookPolicy.IsEventName("PermissionRequest"));
        Assert.False(HookPolicy.IsEventName("Bad-Name"));
        Assert.False(HookPolicy.IsEventName(""));
        Assert.False(HookPolicy.IsEventName(new string('a', 41)));
        Assert.True(HookPolicy.IsAgentName("claude"));
        Assert.True(HookPolicy.IsAgentName("copilot-cli"));
        Assert.False(HookPolicy.IsAgentName("Claude"));
        Assert.False(HookPolicy.IsAgentName("a b"));
    }

    [Test]
    public void Reveal_summary_is_faithful_scrubbed_and_flags_what_it_could_not_capture()
    {
        var i = HookInput.Read(Encoding.UTF8.GetBytes("""{"cwd":"C:\\Users\\Example","tool_name":"Bash","tool_input":{"command":"curl -H 'Authorization: Bearer abcdef123456' https://user:hunter2@api.example.com/v1\n&& export API_KEY=sk-example-0123456789abcdefghijklmnop","file_path":"C:\\Users\\Example\\secret\\notes.txt","url":"https://docs.example.com/path?q=1"}}"""), true);
        var r = JsonNode.Parse(HookPolicy.RevealFrame(i))!.AsObject();
        Assert.Equal("reveal", r["t"]!.GetValue<string>());
        Assert.Equal(2, r["v"]!.GetValue<int>());
        var s = r["summary"]!.AsObject();
        var cmd = s["command"]!.GetValue<string>();
        Assert.Contains("\n&& export", cmd, "nothing is collapsed: the module renders line breaks");
        Assert.DoesNotContain("abcdef123456", cmd);
        Assert.DoesNotContain("hunter2", cmd);
        Assert.Equal("complete", s["input"]!.GetValue<string>());
        Assert.Equal(@"secret\notes.txt", s["file"]!.GetValue<string>(), "workspace-relative");
        Assert.Equal("workspace", s["file_scope"]!.GetValue<string>());
        Assert.Equal("https://docs.example.com/path?q=1", s["url"]!.GetValue<string>(), "the full URL, path and query");
        Assert.Equal("docs.example.com", s["host"]!.GetValue<string>());
        Assert.Equal("Bash", s["tool"]!.GetValue<string>());
        Assert.True(s["masked"]!.GetValue<int>() >= 3);
        Assert.Null(s["args"], "a shell tool sends no arguments");
        var empty = JsonNode.Parse(HookPolicy.RevealFrame(HookInput.Read("{}"u8, true)))!["summary"]!.AsObject();
        Assert.Equal("absent", empty["input"]!.GetValue<string>());
    }

    [Test]
    public void Decision_output_shapes()
    {
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}""", HookPolicy.DecisionOutput(HookPolicy.Decision.Allow, "ignored", true, "claude"));
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from Stream Deck"}}}""", HookPolicy.DecisionOutput(HookPolicy.Decision.Deny, null, false, "claude"));
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"No","interrupt":true}}}""", HookPolicy.DecisionOutput(HookPolicy.Decision.Deny, "No", true, "claude"));
        Assert.Equal("""{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"No"}}}""", HookPolicy.DecisionOutput(HookPolicy.Decision.Deny, "No", true, "codex"), "interrupt is reserved in Codex");
        Assert.Null(HookPolicy.DecisionOutput(HookPolicy.Decision.None, null, false, "claude"));
        Assert.Null(HookPolicy.DecisionOutput(HookPolicy.Decision.Allow, null, false, "cursor"), "never decide for cross-talk tools");
        Assert.Null(HookPolicy.DecisionOutput(HookPolicy.Decision.Allow, null, false, "copilot"));
        Assert.Null(HookPolicy.DecisionOutput(HookPolicy.Decision.Allow, null, false, "unknown"));
    }

    [Test]
    public void Decision_and_ack_parsing()
    {
        Assert.Equal(HookPolicy.Decision.Allow, HookPolicy.ParseDecision("""{"decision":"allow"}"""u8).Decision);
        var d = HookPolicy.ParseDecision("""{"decision":"deny","message":"x\u0000y","interrupt":true}"""u8);
        Assert.Equal((HookPolicy.Decision.Deny, "xy", true), d);
        Assert.Equal(HookPolicy.Decision.None, HookPolicy.ParseDecision("""{"decision":"ALLOW"}"""u8).Decision);
        Assert.Equal(HookPolicy.Decision.None, HookPolicy.ParseDecision("""{"decision":true}"""u8).Decision);
        Assert.Equal(HookPolicy.Decision.None, HookPolicy.ParseDecision("nope"u8).Decision);
        Assert.Equal(500, HookPolicy.ParseDecision(Encoding.UTF8.GetBytes("{\"decision\":\"deny\",\"message\":\"" + new string('m', 900) + "\"}")).Message!.Length);
        Assert.Equal((true, true, 30000), HookRelay.ParseAck("""{"hold":true,"reveal":true,"deadlineMs":30000}"""u8.ToArray()));
        Assert.Equal((false, false, 0), HookRelay.ParseAck("""{"hold":false}"""u8.ToArray()));
        Assert.Equal((false, false, 0), HookRelay.ParseAck("""{"hold":"yes"}"""u8.ToArray()));
        Assert.Equal((false, false, 0), HookRelay.ParseAck("garbage"u8.ToArray()));
        Assert.Equal((true, false, 0), HookRelay.ParseAck("""{"hold":true}"""u8.ToArray()));
    }

    [Test]
    public void Cwd_hash_is_identical_to_the_plugin_side()
    {
        foreach (var p in new[] { @"C:\Users\Example\Repo", "/c/Users/Example/Repo/", @"\\?\D:\work\", @"C:\", @"\\nas.example\share\x", "relative\\path", "  E:/Mixed/Case  " })
        {
            Assert.Equal(PrismControl.Desktop.CwdHash.Normalize(p), CwdHash.Normalize(p), p);
            Assert.Equal(PrismControl.Desktop.CwdHash.Compute(p), CwdHash.Compute(p), p);
            Assert.Equal(PrismControl.Desktop.CwdHash.Basename(p), CwdHash.Basename(p), p);
        }
    }
}
