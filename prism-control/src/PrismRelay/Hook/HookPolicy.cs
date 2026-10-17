using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PrismRelay.Hook;

/// <summary>
/// The per-event field allow-list (research/ai-apps.md §7.2, content owned by the Ai engineer) and the identity
/// additions from research/ai-status.md §1.3–§1.4. "What Prism never receives, it can't leak": prompts,
/// last_assistant_message, transcript_path, tool_input and tool_response never leave this process (a PermissionRequest
/// command summary only when the module asks for it with reveal:true, scrubbed and bounded). The schema is documented
/// in aaa-prism-play/platform/USAGE.md § AI hook frames; change both together.
/// </summary>
internal static class HookPolicy
{
    /// <summary>Environment markers we read (non-secret identifiers only). Nothing else in the environment is ever read.</summary>
    public static readonly string[] EnvAllowList =
    [
        "WT_SESSION", "WT_PROFILE_ID", "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "VSCODE_INJECTION", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
        "CLAUDE_PID", "TERMINAL_EMULATOR", "TERM_SESSION_ID", "CURSOR_VERSION", "GEMINI_SESSION_ID",
        "ORCA_TERMINAL_HANDLE", "ORCA_PANE_KEY", "ORCA_TAB_ID", "ORCA_WORKTREE_ID", "ORCA_WORKSPACE_ID",
    ];

    private static readonly string[] Shells = ["cmd.exe", "bash.exe", "sh.exe", "pwsh.exe", "powershell.exe", "wsl.exe", "conhost.exe", "OpenConsole.exe"];

    private static readonly string[] JetBrains = ["idea64.exe", "pycharm64.exe", "webstorm64.exe", "rider64.exe", "clion64.exe", "goland64.exe", "rustrover64.exe", "phpstorm64.exe", "datagrip64.exe"];

    private static readonly string[] Roots = ["explorer.exe", "services.exe", "svchost.exe", "wininit.exe", "sihost.exe", "winlogon.exe", "userinit.exe"];

    public static bool IsEventName(string s) => s.Length is >= 1 and <= 40 && s.All(char.IsAsciiLetter);

    public static bool IsAgentName(string s) => s.Length is >= 1 and <= 24 && s.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-');

    // ------------------------------------------------------------------ process identity

    internal static bool IsAgentExe(string exe, out string tool)
    {
        var e = exe.ToLowerInvariant();
        tool = e switch
        {
            "claude.exe" => "claude",
            "codex.exe" => "codex",
            "cursor-agent.exe" or "agent.exe" => "cursor",
            _ when e.StartsWith("copilot", StringComparison.Ordinal) && e.EndsWith(".exe", StringComparison.Ordinal) => "copilot",
            _ when e.StartsWith("gemini", StringComparison.Ordinal) && e.EndsWith(".exe", StringComparison.Ordinal) => "gemini",
            _ => "",
        };
        return tool.Length > 0;
    }

    private static bool Is(string exe, string[] names) => names.Any(n => n.Equals(exe, StringComparison.OrdinalIgnoreCase));

    /// <summary>The agent process: the first known agent exe up the chain, else the first non-shell ancestor if it is node.exe.</summary>
    internal static (int Index, string Tool) FindAgent(IReadOnlyList<ProcEntry> chain)
    {
        for (var i = 0; i < chain.Count; i++)
            if (IsAgentExe(chain[i].Exe, out var tool)) return (i, tool);
        for (var i = 0; i < chain.Count; i++)
        {
            if (Is(chain[i].Exe, Shells)) continue;
            return chain[i].Exe.Equals("node.exe", StringComparison.OrdinalIgnoreCase) ? (i, "") : (-1, "");
        }
        return (-1, "");
    }

    internal static string HostKind(string exe, bool aboveAgentClaude)
    {
        if (exe.Equals("WindowsTerminal.exe", StringComparison.OrdinalIgnoreCase)) return "windows-terminal";
        if (exe.Equals("Code.exe", StringComparison.OrdinalIgnoreCase) || exe.Equals("Code - Insiders.exe", StringComparison.OrdinalIgnoreCase)) return "vscode";
        if (exe.Equals("Cursor.exe", StringComparison.OrdinalIgnoreCase)) return "cursor";
        if (Is(exe, JetBrains)) return "jetbrains";
        if (exe.Equals("Orca.exe", StringComparison.OrdinalIgnoreCase)) return "orca";
        if (exe.Equals("ChatGPT.exe", StringComparison.OrdinalIgnoreCase)) return "chatgpt";
        if (aboveAgentClaude && exe.Equals("claude.exe", StringComparison.OrdinalIgnoreCase)) return "claude-desktop";
        return "";
    }

    /// <summary>
    /// Trims the chain to "parent … host" and classifies the host: the first known terminal/IDE above the agent; else
    /// "console" (the top-most process below explorer.exe / a service host); else "unknown".
    /// </summary>
    internal static (List<ProcEntry> Chain, string Kind, int HostIndex) ClassifyHost(IReadOnlyList<ProcEntry> chain, int agentIndex)
    {
        for (var i = Math.Max(0, agentIndex + 1); i < chain.Count; i++)
        {
            var kind = HostKind(chain[i].Exe, aboveAgentClaude: agentIndex >= 0);
            if (kind.Length > 0) return ([.. chain.Take(i + 1)], kind, i);
            if (Is(chain[i].Exe, Roots))
                return i == 0 ? ([], "unknown", -1) : ([.. chain.Take(i)], "console", i - 1);
        }
        // No agent found: look from the parent for a host anyway.
        if (agentIndex < 0)
            for (var i = 0; i < chain.Count; i++)
                if (HostKind(chain[i].Exe, false) is { Length: > 0 } k) return ([.. chain.Take(i + 1)], k, i);
        return ([.. chain], "unknown", -1);
    }

    /// <summary>
    /// Which tool invoked the hook (ai-status.md §1.4 gotcha: Cursor and Copilot read Claude-format hooks):
    /// payload/env markers first, then the agent exe, then a Cursor process in the chain, then argv.
    /// </summary>
    internal static string DetectTool(string agent, HookInput input, Func<string, string?> env, string agentExeTool, IReadOnlyList<ProcEntry> chain)
    {
        if (input.Has("cursor_version") || !string.IsNullOrEmpty(env("CURSOR_VERSION"))) return "cursor";
        if (input.Has("sessionId") && !input.Has("session_id")) return "copilot";
        if (agentExeTool.Length > 0) return agentExeTool;
        if (chain.Any(p => p.Exe.Equals("Cursor.exe", StringComparison.OrdinalIgnoreCase) || p.Exe.Equals("cursor-agent.exe", StringComparison.OrdinalIgnoreCase))) return "cursor";
        return agent is "claude" or "codex" or "cursor" or "copilot" or "gemini" ? agent : "unknown";
    }

    // ------------------------------------------------------------------ the frame

    /// <summary>The hook frame protocol version this relay speaks. The module accepts this one and the previous one (review M6).</summary>
    public const int ProtocolVersion = 2;

    /// <param name="AncestryWalked">False when the frame carries no process ancestry by design (none today: every event walks it,
    /// cheaply, see <see cref="ParentWalk"/>); the module then treats the event as a signal for an already known session only.</param>
    internal sealed record Context(string Agent, string EventName, long AtMs, HookInput Input, Func<string, string?> Env,
        IReadOnlyList<ProcEntry> Ancestors, long ConsoleHwnd, int StdinBytes, bool Truncated, bool AncestryWalked = true);


    /// <summary>The detected tool (also used to decide whether a decision may be printed).</summary>
    internal static string ToolOf(Context c)
    {
        var (agentIndex, agentTool) = FindAgent(c.Ancestors);
        return DetectTool(c.Agent, c.Input, c.Env, agentIndex >= 0 ? agentTool : "", c.Ancestors);
    }

    /// <summary>Writes <c>{v:1, token, event:{…}}</c>.</summary>
    internal static byte[] BuildFrame(Context c, string token)
    {
        var (agentIndex, agentTool) = FindAgent(c.Ancestors);
        var tool = DetectTool(c.Agent, c.Input, c.Env, agentIndex >= 0 ? agentTool : "", c.Ancestors);
        var (chain, hostKind, hostIndex) = ClassifyHost(c.Ancestors, agentIndex);
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
            w.WriteNumber("v", ProtocolVersion);
            w.WriteString("token", token);
            w.WritePropertyName("event");
            w.WriteStartObject();
            w.WriteNumber("v", ProtocolVersion);
            w.WriteString("name", c.EventName);
            w.WriteString("agent", c.Agent);
            w.WriteString("tool", tool);
            w.WriteString("origin", tool == c.Agent || tool == "unknown" ? c.Agent : $"{tool}-via-{c.Agent}-hooks");
            w.WriteNumber("at", c.AtMs);
            var sid = Clean(c.Input.Str("session_id") ?? c.Input.Str("sessionId") ?? c.Input.Str("conversation_id") ?? c.Env("GEMINI_SESSION_ID"), 128);
            if (sid is null) w.WriteNull("sessionId"); else w.WriteString("sessionId", sid);

            w.WritePropertyName("fields");
            WriteFields(w, c);

            WriteProc(w, "agentProcess", agentIndex >= 0 ? c.Ancestors[agentIndex] : null);
            WriteProc(w, "parent", c.Ancestors.Count > 0 ? c.Ancestors[0] : null);
            w.WritePropertyName("chain");
            w.WriteStartArray();
            foreach (var p in chain) WriteProcObject(w, p);
            w.WriteEndArray();

            w.WritePropertyName("host");
            w.WriteStartObject();
            w.WriteString("kind", hostKind);
            if (hostIndex >= 0 && hostIndex < chain.Count)
            {
                w.WriteNumber("pid", chain[hostIndex].Pid);
                w.WriteString("exe", chain[hostIndex].Exe);
                w.WriteNumber("startedAt", chain[hostIndex].StartedAtMs);
            }
            w.WriteNumber("consoleHwnd", c.ConsoleHwnd);
            w.WriteEndObject();
            if (!c.AncestryWalked) w.WriteBoolean("ancestry", false);

            w.WritePropertyName("env");
            w.WriteStartObject();
            foreach (var name in EnvAllowList)
                if (EnvValue(name, c.Env(name)) is { Length: > 0 } v) w.WriteString(name, v);
            w.WriteEndObject();

            w.WritePropertyName("stdin");
            w.WriteStartObject();
            w.WriteNumber("bytes", c.StdinBytes);
            w.WriteBoolean("truncated", c.Truncated);
            w.WriteBoolean("parsed", c.Input.Parsed);
            w.WriteEndObject();

            w.WriteEndObject();
            w.WriteEndObject();
        }
        return ms.ToArray();
    }

    private static void WriteFields(Utf8JsonWriter w, Context c)
    {
        var i = c.Input;
        w.WriteStartObject();
        WriteStr(w, "hook_event_name", i.Str("hook_event_name") ?? c.EventName, 64);
        WriteStr(w, "session_id", i.Str("session_id") ?? i.Str("sessionId") ?? i.Str("conversation_id"), 128);
        WriteStr(w, "permission_mode", i.Str("permission_mode"), 32);
        WriteStr(w, "agent_id", i.Str("agent_id"), 128);
        WriteStr(w, "agent_type", i.Str("agent_type"), 64);
        if (i.Str("cwd") is { Length: > 0 } cwd)
        {
            w.WriteString("cwd_hash", CwdHash.Compute(cwd));
            WriteStr(w, "cwd_name", CwdHash.Basename(cwd), 128);
        }
        switch (c.EventName)
        {
            case "PreToolUse" or "PostToolUse" or "PermissionRequest":
                WriteTool(w, i);
                break;
            case "PostToolUseFailure":
                WriteTool(w, i);
                if (i.Bool("is_interrupt") is { } interrupt) w.WriteBoolean("is_interrupt", interrupt);
                w.WriteString("error_category", ErrorCategory(i.Bool("is_interrupt") == true, i.Str("error")));
                break;
            case "Notification":
                WriteStr(w, "notification_type", i.Str("notification_type"), 64);
                break;
            case "StopFailure":
                if (i.Str("error") is { } e && IsEnumToken(e)) w.WriteString("error", e);
                break;
            case "SessionStart":
                WriteStr(w, "source", i.Str("source"), 32);
                WriteStr(w, "model", i.Str("model"), 96);
                break;
            case "SessionEnd":
                WriteStr(w, "reason", i.Str("reason"), 32);
                break;
        }
        w.WriteEndObject();
    }

    private static void WriteTool(Utf8JsonWriter w, HookInput i)
    {
        var tool = Clean(i.Str("tool_name"), 128);
        if (tool is not null) w.WriteString("tool_name", tool);
        var server = Clean(i.Str("mcp_server"), 64) ?? McpServerOf(tool);
        if (server is not null) w.WriteString("mcp_server", server);
    }

    /// <summary>"mcp__github__create_issue" → "github".</summary>
    internal static string? McpServerOf(string? toolName)
    {
        if (toolName is null || !toolName.StartsWith("mcp__", StringComparison.Ordinal)) return null;
        var rest = toolName.AsSpan(5);
        var end = rest.IndexOf("__", StringComparison.Ordinal);
        var server = end > 0 ? rest[..end] : rest;
        return server.Length is > 0 and <= 64 ? server.ToString() : null;
    }

    /// <summary>A coarse category from the error text, which itself is never sent.</summary>
    internal static string ErrorCategory(bool interrupted, string? error)
    {
        if (interrupted) return "interrupted";
        var e = error?.ToLowerInvariant() ?? "";
        if (e.Contains("timed out") || e.Contains("timeout")) return "timeout";
        if (e.Contains("permission") || e.Contains("denied") || e.Contains("not allowed") || e.Contains("eacces")) return "permission";
        if (e.Contains("not found") || e.Contains("no such file") || e.Contains("enoent") || e.Contains("does not exist")) return "not_found";
        return "failed";
    }

    internal static bool IsEnumToken(string s) => s.Length is >= 1 and <= 48 && s.All(ch => ch is >= 'a' and <= 'z' or '_');

    private static void WriteStr(Utf8JsonWriter w, string name, string? value, int max)
    {
        if (Clean(value, max) is { } v) w.WriteString(name, v);
    }

    private static void WriteProc(Utf8JsonWriter w, string name, ProcEntry? p)
    {
        w.WritePropertyName(name);
        if (p is null) w.WriteNullValue(); else WriteProcObject(w, p.Value);
    }

    private static void WriteProcObject(Utf8JsonWriter w, ProcEntry p)
    {
        w.WriteStartObject();
        w.WriteNumber("pid", p.Pid);
        w.WriteString("exe", p.Exe);
        w.WriteNumber("startedAt", p.StartedAtMs);
        w.WriteEndObject();
    }

    /// <summary>
    /// An allow-listed environment marker as it may leave the relay (review L3): Orca's worktree/workspace ids lose everything after
    /// "::" (Orca appends the worktree PATH there); handle/pane/tab ids must look like ids (<c>^[A-Za-z0-9:_-]{1,128}$</c>, no
    /// leading '-', so they can never become a CLI flag); anything else is control-stripped and capped at 128. Null = not sent.
    /// </summary>
    internal static string? EnvValue(string name, string? raw)
    {
        var v = Clean(raw, 512);
        if (v is null) return null;
        switch (name)
        {
            case "ORCA_WORKTREE_ID" or "ORCA_WORKSPACE_ID":
            {
                var cut = v.IndexOf("::", StringComparison.Ordinal);
                if (cut >= 0) v = v[..cut];
                return IsIdToken(v) ? v : null;
            }
            case "ORCA_TERMINAL_HANDLE" or "ORCA_PANE_KEY" or "ORCA_TAB_ID":
                return IsIdToken(v) ? v : null;
            default:
                return Clean(v, 128);
        }
    }

    /// <summary><c>^[A-Za-z0-9:_-]{1,128}$</c> and not starting with '-'.</summary>
    internal static bool IsIdToken(string? s) =>
        s is { Length: >= 1 and <= 128 } && s[0] != '-' && s.All(c => char.IsAsciiLetterOrDigit(c) || c is ':' or '_' or '-');

    /// <summary>Control characters removed, trimmed, capped. Null when empty.</summary>
    internal static string? Clean(string? s, int max)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var sb = new StringBuilder(Math.Min(s.Length, max));
        foreach (var ch in s)
        {
            if (char.IsControl(ch) || ch is '\u2028' or '\u2029') continue;
            if (sb.Length >= max) break;
            sb.Append(ch);
        }
        // Never end on a lone high surrogate.
        if (sb.Length > 0 && char.IsHighSurrogate(sb[^1])) sb.Length--;
        var r = sb.ToString().Trim();
        return r.Length == 0 ? null : r;
    }

    // ------------------------------------------------------------------ PermissionRequest: reveal summary and decisions

    /// <summary>The longest command / path / URL (characters, before masking) the relay sends; longer ones are reported incomplete.</summary>
    internal const int MaxShownChars = 1024;
    /// <summary>MCP / unknown tools: at most this many scalar arguments, each value at most <see cref="MaxArgChars"/>.</summary>
    internal const int MaxArgs = 16, MaxArgChars = 256;

    /// <summary>Tools whose risky input is the file path (the path is shown; their content never leaves the relay).</summary>
    private static readonly HashSet<string> FileTools = new(StringComparer.OrdinalIgnoreCase)
    {
        "Write", "Edit", "MultiEdit", "NotebookEdit", "Read", "write_file", "read_file", "edit_file", "str_replace", "replace", "view",
    };

    /// <summary>Tools whose risky input is the URL.</summary>
    private static readonly HashSet<string> UrlTools = new(StringComparer.OrdinalIgnoreCase) { "WebFetch", "web_fetch", "fetch" };

    /// <summary>
    /// The summary sent only after the module's ack says reveal:true (protocol v2, review H1/M1). Faithful, never silently cut:
    /// <list type="bullet">
    /// <item><c>input</c>: how tool_input was read ("complete", "cut", "ambiguous", "absent", "not_object", "too_many");</item>
    /// <item><c>command</c> (a string, or a Codex argv joined with quoting) exactly as given but secrets masked, or
    /// <c>command_incomplete:true</c> + <c>command_length</c> when it is oversize, not a string/argv of strings, or longer than
    /// <see cref="MaxShownChars"/>;</item>
    /// <item><c>file</c> (file_path / notebook_path / path): workspace-relative with <c>file_scope:"workspace"</c>, else the full
    /// normalized path with <c>file_scope:"outside"</c>; or <c>file_incomplete</c>;</item>
    /// <item><c>url</c> (full, secrets masked) + <c>host</c>; or <c>url_incomplete</c>;</item>
    /// <item><c>args</c>: for MCP and other tools without a command/file/URL, the scalar tool_input members as [key, value] in
    /// order (strings masked, secret-named keys fully masked); <c>args_incomplete</c> when any member is nested, oversize,
    /// unnamed, or there are more than <see cref="MaxArgs"/>;</item>
    /// <item><c>masked</c> / <c>masked_active</c>: how many secrets were masked and whether a mask hid shell-active text.</item>
    /// </list>
    /// No whitespace is collapsed and nothing is stripped here: the module decides what can be shown and locks Approve otherwise.
    /// </summary>
    internal static byte[] RevealFrame(HookInput i)
    {
        var masked = 0;
        var active = false;
        string Scrub(string s)
        {
            var r = PrismShared.SecretScrubber.Scrub(s);
            masked += r.Masked;
            active |= r.MaskedActive;
            return r.Text;
        }

        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
            w.WriteNumber("v", ProtocolVersion);
            w.WriteString("t", "reveal");
            w.WritePropertyName("summary");
            w.WriteStartObject();
            var tool = Clean(i.Str("tool_name"), 128);
            if (tool is not null) w.WriteString("tool", tool);
            w.WriteString("input", i.ToolMembersOverflow ? "too_many" : i.ToolInputState switch
            {
                ToolInputState.Complete => "complete",
                ToolInputState.Cut => "cut",
                ToolInputState.Ambiguous => "ambiguous",
                ToolInputState.NotAnObject => "not_object",
                _ => "absent",
            });

            // The command (Bash, PowerShell, Codex shell / exec).
            var cmd = i.Member("command") ?? i.Member("cmd");
            if (cmd is not null)
            {
                string? text = null;
                long length = 0;
                if (cmd.Kind == JsonTokenType.String && !cmd.Oversize) text = cmd.Text;
                else if (cmd.Kind == JsonTokenType.StartArray && cmd is { ItemsIncomplete: false, Items: { } items }) text = JoinArgv(items);
                else length = cmd.RawLength;
                if (text is not null && text.Length > MaxShownChars) { length = text.Length; text = null; }
                if (text is not null) w.WriteString("command", Scrub(text));
                else
                {
                    w.WriteBoolean("command_incomplete", true);
                    w.WriteNumber("command_length", length);
                }
            }

            // The file.
            var file = i.Member("file_path") ?? i.Member("notebook_path") ?? i.Member("path");
            if (file is not null)
            {
                if (file is { Kind: JsonTokenType.String, Oversize: false, Text: { Length: > 0 and <= MaxShownChars } path })
                {
                    var (shown, inside) = WorkspacePath(path, i.Str("cwd"));
                    w.WriteString("file", Scrub(shown));
                    w.WriteString("file_scope", inside ? "workspace" : "outside");
                }
                else w.WriteBoolean("file_incomplete", true);
            }

            // The URL.
            var url = i.Member("url");
            if (url is not null)
            {
                if (url is { Kind: JsonTokenType.String, Oversize: false, Text: { Length: > 0 and <= MaxShownChars } u })
                {
                    w.WriteString("url", Scrub(u));
                    if (Uri.TryCreate(u, UriKind.Absolute, out var parsed) && parsed.Host.Length > 0) w.WriteString("host", parsed.IdnHost);
                }
                else w.WriteBoolean("url_incomplete", true);
            }

            // MCP and other tools: the scalar arguments.
            if (WantsArgs(tool, cmd, file, url))
            {
                var incomplete = i.ToolMembersOverflow || i.ToolInputState != ToolInputState.Complete || i.ToolMembers.Count > MaxArgs;
                w.WritePropertyName("args");
                w.WriteStartArray();
                foreach (var m in i.ToolMembers.Take(MaxArgs))
                {
                    if (m.Name is null || m.Oversize || m.Kind is JsonTokenType.StartObject or JsonTokenType.StartArray
                        || (m.Kind == JsonTokenType.String && (m.Text?.Length ?? 0) > MaxArgChars))
                    {
                        incomplete = true;
                        continue;
                    }
                    w.WriteStartArray();
                    w.WriteStringValue(m.Name);
                    switch (m.Kind)
                    {
                        case JsonTokenType.String:
                            if (PrismShared.SecretScrubber.IsSecretName(m.Name) && m.Text is { Length: > 0 }) { masked++; w.WriteStringValue(PrismShared.SecretScrubber.Mask); }
                            else w.WriteStringValue(Scrub(m.Text ?? ""));
                            break;
                        case JsonTokenType.Number: w.WriteRawValue(m.Text!, skipInputValidation: false); break;
                        case JsonTokenType.True: w.WriteBooleanValue(true); break;
                        case JsonTokenType.False: w.WriteBooleanValue(false); break;
                        default: w.WriteNullValue(); break;
                    }
                    w.WriteEndArray();
                }
                w.WriteEndArray();
                if (incomplete) w.WriteBoolean("args_incomplete", true);
            }

            if (masked > 0) w.WriteNumber("masked", masked);
            if (active) w.WriteBoolean("masked_active", true);
            w.WriteEndObject();
            w.WriteEndObject();
        }
        return ms.ToArray();
    }

    /// <summary>MCP tools always; other tools when neither a command, nor a file of a file tool, nor a URL of a fetch tool tells what runs.</summary>
    private static bool WantsArgs(string? tool, ToolMember? cmd, ToolMember? file, ToolMember? url)
    {
        if (tool is not null && tool.StartsWith("mcp__", StringComparison.Ordinal)) return true;
        if (cmd is not null) return false;
        if (file is not null && tool is not null && FileTools.Contains(tool)) return false;
        if (url is not null && tool is not null && UrlTools.Contains(tool)) return false;
        return true;
    }

    /// <summary>
    /// argv as one line: elements made of <c>[A-Za-z0-9_@%+=:,./-]</c> as they are, every other element in double quotes (inner
    /// <c>"</c> as <c>\"</c>), so element boundaries stay visible (<c>bash -lc "git status &amp;&amp; npm test"</c>).
    /// </summary>
    internal static string JoinArgv(IReadOnlyList<string> items)
    {
        var sb = new StringBuilder();
        foreach (var item in items)
        {
            if (sb.Length > 0) sb.Append(' ');
            if (item.Length > 0 && item.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '@' or '%' or '+' or '=' or ':' or ',' or '.' or '/' or '-' or '\\'))
            {
                sb.Append(item);
                continue;
            }
            sb.Append('"');
            for (var k = 0; k < item.Length; k++)
            {
                var c = item[k];
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\' && (k + 1 == item.Length || item[k + 1] == '"')) sb.Append("\\\\");
                else sb.Append(c);
            }
            sb.Append('"');
        }
        return sb.ToString();
    }

    /// <summary>
    /// The path as shown: relative to the workspace (cwd) when it resolves inside it, else the full normalized path (outside, or
    /// no cwd to compare with). "." / ".." are resolved, "/" becomes "\", a Git Bash "/c/…" becomes "C:\…". UNC, device and
    /// alternate-data-stream paths, and "~", are always "outside".
    /// </summary>
    internal static (string Shown, bool InWorkspace) WorkspacePath(string path, string? cwd)
    {
        var p = path.Trim();
        var full = Resolve(p, cwd);
        if (full is null) return (p, false);
        var root = cwd is { Length: > 0 } ? Resolve(cwd.Trim(), null) : null;
        if (root is null) return (full, false);
        var prefix = root.EndsWith('\\') ? root : root + "\\";
        if (full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && full.Length > prefix.Length) return (full[prefix.Length..], true);
        return (full, false);
    }

    /// <summary>An absolute, normalized path (drive form), or null when it can't be resolved safely.</summary>
    private static string? Resolve(string path, string? cwd)
    {
        var s = path.Replace('/', '\\');
        if (s.StartsWith(@"\\", StringComparison.Ordinal) || s.StartsWith('~')) return null;   // UNC / \\?\ / device / home
        if (s.Length >= 2 && s[0] == '\\' && char.IsAsciiLetter(s[1]) && (s.Length == 2 || s[2] == '\\'))
            s = char.ToUpperInvariant(s[1]) + ":" + (s.Length == 2 ? "\\" : s[2..]);           // Git Bash /c/x
        string drive;
        string rest;
        if (s.Length >= 2 && char.IsAsciiLetter(s[0]) && s[1] == ':')
        {
            if (s.Length > 2 && s[2] != '\\') return null;                                        // C:relative
            drive = char.ToUpperInvariant(s[0]) + ":";
            rest = s.Length > 2 ? s[3..] : "";
        }
        else
        {
            if (cwd is null || s.StartsWith('\\')) return null;
            var baseFull = Resolve(cwd, null);
            if (baseFull is null) return null;
            return Resolve(baseFull.TrimEnd('\\') + "\\" + s, null);
        }
        var parts = new List<string>();
        foreach (var seg in rest.Split('\\'))
        {
            if (seg.Length == 0 || seg == ".") continue;
            if (seg == "..") { if (parts.Count > 0) parts.RemoveAt(parts.Count - 1); continue; }
            if (seg.Contains(':')) return null;                                                    // alternate data stream
            parts.Add(seg);
        }
        return drive + "\\" + string.Join('\\', parts);
    }

    internal enum Decision { None, Allow, Deny }

    /// <summary>Parses a decision frame: {decision: allow|deny|none, message?, interrupt?}. Anything else is None.</summary>
    internal static (Decision Decision, string? Message, bool Interrupt) ParseDecision(ReadOnlySpan<byte> body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body.ToArray());
            var r = doc.RootElement;
            if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("decision", out var d) || d.ValueKind != JsonValueKind.String) return (Decision.None, null, false);
            var decision = d.GetString() switch { "allow" => Decision.Allow, "deny" => Decision.Deny, _ => Decision.None };
            var message = r.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? Clean(m.GetString(), 500) : null;
            var interrupt = r.TryGetProperty("interrupt", out var it) && it.ValueKind == JsonValueKind.True;
            return (decision, message, interrupt);
        }
        catch (JsonException) { return (Decision.None, null, false); }
    }

    /// <summary>The hook stdout for a decision (Claude and Codex share this shape). Null for None.</summary>
    internal static string? DecisionOutput(Decision decision, string? message, bool interrupt, string tool)
    {
        if (decision == Decision.None || tool is not ("claude" or "codex")) return null;
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
            w.WritePropertyName("hookSpecificOutput");
            w.WriteStartObject();
            w.WriteString("hookEventName", "PermissionRequest");
            w.WritePropertyName("decision");
            w.WriteStartObject();
            if (decision == Decision.Allow) w.WriteString("behavior", "allow");
            else
            {
                w.WriteString("behavior", "deny");
                w.WriteString("message", message ?? "Denied from Stream Deck");
                if (interrupt && tool == "claude") w.WriteBoolean("interrupt", true); // reserved (fails closed) in Codex
            }
            w.WriteEndObject();
            w.WriteEndObject();
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(ms.ToArray());
    }
}

/// <summary>
/// Identical to PrismControl.Desktop.CwdHash (the relay cannot reference Desktop); a test pins both to the same values.
/// </summary>
internal static class CwdHash
{
    public static string Normalize(string cwd)
    {
        var s = cwd.Trim().Replace('/', '\\');
        if (s.StartsWith(@"\\?\", StringComparison.Ordinal)) s = s[4..];
        if (s.Length >= 2 && s[0] == '\\' && char.IsAsciiLetter(s[1]) && (s.Length == 2 || s[2] == '\\'))
            s = char.ToUpperInvariant(s[1]) + ":" + (s.Length == 2 ? "\\" : s[2..]);
        while (s.Length > 1 && s.EndsWith('\\') && !(s.Length == 3 && s[1] == ':')) s = s[..^1];
        return s.ToLowerInvariant();
    }

    public static string Compute(string cwd) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Normalize(cwd))).AsSpan(0, 8)).ToLowerInvariant();

    public static string Basename(string cwd)
    {
        var s = cwd.Trim().Replace('/', '\\').TrimEnd('\\');
        var i = s.LastIndexOf('\\');
        return i >= 0 ? s[(i + 1)..] : s;
    }
}
