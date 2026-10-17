using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Ai.Platform;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Hooks;

public enum HookFileKind { Claude, Codex }

/// <summary>Where the hook files live. Tests use <see cref="At"/> (a temporary folder) only.</summary>
public sealed record HookHome(string ClaudeSettings, string CodexHooks, string CodexConfig, IReadOnlyList<string> ClaudeManagedSettings)
{
    /// <summary>The real user's files (honors CLAUDE_CONFIG_DIR and CODEX_HOME). Read by Preview; written only after consent.</summary>
    public static HookHome ForCurrentUser()
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var claudeDir = Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR") is { Length: > 0 } c ? c : Path.Combine(profile, ".claude");
        var codexDir = Environment.GetEnvironmentVariable("CODEX_HOME") is { Length: > 0 } x ? x : Path.Combine(profile, ".codex");
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        return new HookHome(Path.Combine(claudeDir, "settings.json"), Path.Combine(codexDir, "hooks.json"), Path.Combine(codexDir, "config.toml"),
            [Path.Combine(programFiles, "ClaudeCode", "managed-settings.json"), Path.Combine(programData, "ClaudeCode", "managed-settings.json")]);
    }

    /// <summary>A home rooted at <paramref name="root"/> (root\.claude\settings.json, root\.codex\hooks.json, root\managed\…).</summary>
    public static HookHome At(string root) => new(Path.Combine(root, ".claude", "settings.json"), Path.Combine(root, ".codex", "hooks.json"),
        Path.Combine(root, ".codex", "config.toml"), [Path.Combine(root, "managed", "managed-settings.json")]);

    public string PathOf(HookFileKind kind) => kind == HookFileKind.Claude ? ClaudeSettings : CodexHooks;
}

public sealed record HookFilePlan(HookFileKind Kind, string Path, bool Exists, IReadOnlyList<string> EventsToAdd, IReadOnlyList<string> AlreadyOurs,
    int ForeignHandlers, string? Refusal, string Sha256Before);

/// <summary>What a write would do. The <see cref="ConsentToken"/> binds the user's "yes" to exactly this plan.</summary>
public sealed record HookPlan(string Action, IReadOnlyList<HookFilePlan> Files, string RelayPath, string? RelaySha256, IReadOnlyList<string> Notes,
    string ConsentToken, string? RestoreFrom = null)
{
    public bool CanApply => Files.All(f => f.Refusal is null) && (Files.Any(f => f.EventsToAdd.Count > 0) || RestoreFrom is not null);
    /// <summary>The SHA-256 of the backup a restore plan will put back (checked again before it is written).</summary>
    public string? RestoreSha { get; init; }
}

public sealed record HookResult(bool Ok, string Message, IReadOnlyList<string> Backups);

public sealed record HookDrift(HookFileKind Kind, IReadOnlyList<string> Present, IReadOnlyList<string> Missing, bool Readable);

public sealed record DriftReport(IReadOnlyList<HookDrift> Files)
{
    public bool Installed => Files.Any(f => f.Present.Count > 0);
    /// <summary>Installed, but some of our entries are gone (e.g. another tool rewrote the file). Never re-added silently.</summary>
    public bool Drifted => Installed && Files.Any(f => f.Present.Count > 0 && f.Missing.Count > 0);
}

/// <summary>
/// The one-click "Install Prism hooks" flow (research/ai-apps.md §5.7), behind a property-inspector button only:
/// <list type="number">
/// <item><see cref="Preview"/>: a read-only dry run (files, events, relay path + SHA-256, what stays untouched). Refuses files
/// that don't parse, contain JSONC comments, are policy-managed, or set disableAllHooks / allowManagedHooksOnly;</item>
/// <item><see cref="ApplyAsync"/> with the preview's consent token: copy the relay, back up each file byte-for-byte
/// (<c>&lt;file&gt;.prism-backup-&lt;UTC&gt;</c>), append our handler objects to the event arrays (creating arrays only when
/// missing, keeping every other key and the order), write a temp file and <c>File.Replace</c> it in, after a hash check
/// against concurrent edits (one retry, then abort);</item>
/// <item><see cref="CheckDrift"/> on every start: reports missing entries, never re-adds them;</item>
/// <item>uninstall removes exactly the handler objects whose command is our relay; backups stay and can be restored.</item>
/// </list>
/// Never written: the statusLine, Codex <c>notify</c> and <c>config.toml</c>, Codex hook trust, permission rules, env. Safe mode:
/// previews work, nothing is ever written.
/// </summary>
public sealed class HookInstaller
{
    public const string BackupMarker = ".prism-backup-";

    public static readonly IReadOnlyList<string> ClaudeEvents =
    [
        "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PermissionDenied", "PostToolUse", "PostToolUseFailure",
        "Notification", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "Stop", "StopFailure", "SessionEnd",
    ];

    public static readonly IReadOnlyList<string> CodexEvents =
    [
        "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PreCompact", "PostCompact",
        "SubagentStart", "SubagentStop", "Stop", "Interrupt", "SessionEnd",
    ];

    private static readonly HashSet<string> ToolEvents = new(StringComparer.Ordinal) { "PreToolUse", "PermissionRequest", "PermissionDenied", "PostToolUse", "PostToolUseFailure" };

    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly HookHome _home;
    private readonly IRelayProvider _relay;
    private readonly Func<string?, bool> _isOurCommand;
    private readonly ILog _log;
    private readonly bool _safeMode;
    private readonly TimeProvider _time;
    private HookPlan? _lastPlan;

    public HookInstaller(HookHome home, IRelayProvider relay, Func<string?, bool> isOurCommand, ILog log, bool safeMode, TimeProvider time)
    {
        _home = home;
        _relay = relay;
        _isOurCommand = isOurCommand;
        _log = log;
        _safeMode = safeMode;
        _time = time;
    }

    public bool SafeMode => _safeMode;

    /// <summary>Tests only: runs right before the atomic swap (simulates another program writing the file at the worst moment).</summary>
    internal Action<string>? BeforeSwapForTests { get; set; }

    // ------------------------------------------------------------------ preview (read-only)

    public HookPlan Preview() => Remember(BuildPlan("install"));

    public HookPlan PreviewUninstall() => Remember(BuildPlan("uninstall"));

    public HookPlan PreviewRestore(string backupPath)
    {
        var kind = KindOfBackup(backupPath);
        var notes = new List<string>();
        string? refusal = null;
        if (kind is null || !File.Exists(backupPath)) refusal = "not one of our backups";
        else notes.Add($"Restore {Path.GetFileName(_home.PathOf(kind.Value))} from the backup taken {BackupTime(backupPath)}. The current file is backed up first.");
        var path = kind is null ? backupPath : _home.PathOf(kind.Value);
        var file = new HookFilePlan(kind ?? HookFileKind.Claude, path, File.Exists(path), [], [], 0, refusal, Sha(ReadBytes(path)));
        var backupSha = Sha(ReadBytes(backupPath));
        var token = Token("restore", [file], backupPath + "|" + backupSha);
        return Remember(new HookPlan("restore", [file], _relay.RelayPath, _relay.RelaySha256(), notes, token, backupPath) { RestoreSha = backupSha });
    }

    private HookPlan Remember(HookPlan p)
    {
        _lastPlan = p;
        return p;
    }

    private HookPlan BuildPlan(string action)
    {
        var relayPath = _relay.RelayPath;
        var sha = _relay.RelaySha256();
        var notes = new List<string>();
        var managedRefusal = ManagedRefusal();
        var files = new List<HookFilePlan>();
        foreach (var kind in new[] { HookFileKind.Claude, HookFileKind.Codex })
        {
            var path = _home.PathOf(kind);
            var bytes = ReadBytes(path);
            var exists = bytes is not null;
            var (root, refusal) = Parse(bytes, kind);
            if (kind == HookFileKind.Claude && refusal is null && managedRefusal is not null) refusal = managedRefusal;
            var expected = kind == HookFileKind.Claude ? ClaudeEvents : CodexEvents;
            var ours = root is null ? [] : OursPresent(root, kind);
            var foreign = root is null ? 0 : ForeignCount(root, kind);
            IReadOnlyList<string> toAdd = action == "install" ? expected.Where(e => !ours.Contains(e)).ToList() : ours.ToList();
            files.Add(new HookFilePlan(kind, path, exists, refusal is null ? toAdd : [], ours.ToList(), foreign, refusal, Sha(bytes)));
            if (root is not null && kind == HookFileKind.Claude && root["statusLine"] is not null) notes.Add("The existing status line stays untouched.");
        }
        var claude = files[0];
        var codex = files[1];
        if (action == "install")
        {
            notes.Insert(0, $"Adds {claude.EventsToAdd.Count} Claude Code and {codex.EventsToAdd.Count} Codex hook entries that run {Path.GetFileName(relayPath)} (async for status, a 60 s hold for permission requests).");
            notes.Add($"Other tools' entries stay untouched: {claude.ForeignHandlers} Claude Code and {codex.ForeignHandlers} Codex hook handlers (Orca's included).");
            notes.Add("Never written: the status line, Codex notify and config.toml, Codex hook trust, permission rules, env.");
            notes.Add("Each file is backed up first (…" + BackupMarker + "<UTC>): the backup is exactly the bytes that get replaced.");
            notes.Add("Only the \"hooks\" section is rewritten (standard formatting); every other byte of each file stays exactly as it is.");
            notes.Add("Claude Code picks the change up live. Codex: open /hooks in Codex and trust the prism-relay hooks yourself.");
            if (CodexConfigNote() is { } n) notes.Add(n);
        }
        else
        {
            notes.Insert(0, $"Removes exactly our entries: {claude.EventsToAdd.Count} from Claude Code, {codex.EventsToAdd.Count} from Codex. Everything else stays. Backups are kept.");
        }
        var token = Token(action, files, relayPath + "|" + sha);
        return new HookPlan(action, files, relayPath, sha, notes, token);
    }

    // ------------------------------------------------------------------ apply (writes, after consent only)

    /// <summary>
    /// Applies the last preview, if <paramref name="consentToken"/> is its token and no file changed since. Safe mode: never.
    /// </summary>
    public async Task<HookResult> ApplyAsync(string? consentToken, CancellationToken ct)
    {
        if (_safeMode)
        {
            _log.Info("[safe mode] would change the hook files; nothing written");
            return new(false, "Safe mode: nothing was changed.", []);
        }
        var plan = _lastPlan;
        if (plan is null || string.IsNullOrEmpty(consentToken) || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(consentToken), Encoding.ASCII.GetBytes(plan.ConsentToken)))
            return new(false, "Preview the changes first, then confirm.", []);
        _lastPlan = null;   // one consent, one apply
        if (plan.Action == "install" && plan.Files.All(f => f.Refusal is null && f.EventsToAdd.Count == 0) && plan.Files.Any(f => f.AlreadyOurs.Count > 0))
        {
            // Review M6: everything is installed already; refresh the relay copy the entries point at (it may be an old build).
            var refreshed = await _relay.EnsureAsync(ct).ConfigureAwait(false);
            return new(refreshed, refreshed ? "Prism hooks are already installed; the relay was refreshed." : "Prism hooks are installed, but the relay could not be refreshed.", []);
        }
        if (!plan.CanApply) return new(false, plan.Files.FirstOrDefault(f => f.Refusal is not null)?.Refusal ?? "Nothing to change.", []);
        foreach (var f in plan.Files)
            if (Sha(ReadBytes(f.Path)) != f.Sha256Before) return new(false, $"{Path.GetFileName(f.Path)} changed since the preview. Preview again.", []);

        if (plan.Action == "install" && !await _relay.EnsureAsync(ct).ConfigureAwait(false))
            return new(false, "The relay could not be installed; nothing was changed.", []);

        var backups = new List<string>();
        try
        {
            if (plan.Action == "restore") return Restore(plan, backups);
            foreach (var f in plan.Files)
            {
                if (f.EventsToAdd.Count == 0) continue;
                var r = WriteFile(f, plan, backups);
                if (r is not null) return new(false, r, backups);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Warn($"hook {plan.Action} failed: {ex.GetType().Name}");
            return new(false, $"Could not write: {ex.Message}", backups);
        }
        _log.Info($"Prism hooks {plan.Action} done ({backups.Count} backup(s))");
        return new(true, plan.Action == "install" ? "Prism hooks installed." : "Prism hooks removed.", backups);
    }

    private string? WriteFile(HookFilePlan f, HookPlan plan, List<string> backups)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var original = ReadBytes(f.Path);
            if (attempt == 0 && Sha(original) != f.Sha256Before) return $"{Path.GetFileName(f.Path)} changed since the preview. Preview again.";
            var (root, refusal) = Parse(original, f.Kind);
            if (refusal is not null) return $"{Path.GetFileName(f.Path)}: {refusal}";
            root ??= new JsonObject();
            if (plan.Action == "install") AddOurs(root, f.Kind, f.EventsToAdd, plan.RelayPath);
            else RemoveOurs(root, f.Kind);

            // Keep the file's own line endings and its trailing newline.
            var newline = original is not null && Encoding.UTF8.GetString(original).Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
            byte[] output;
            if (original is { Length: > 0 } && !string.IsNullOrWhiteSpace(Encoding.UTF8.GetString(StripBom(original))))
            {
                // Review L6: only the "hooks" value is re-serialized; every other byte is kept as it was.
                if (JsonSplice.ReplaceHooks(original, root["hooks"], newline, WriteOptions) is not { } spliced)
                    return $"{Path.GetFileName(f.Path)}: the hooks section could not be edited safely; nothing was written to it.";
                output = spliced;
            }
            else
            {
                var text = root.ToJsonString(new JsonSerializerOptions(WriteOptions) { NewLine = newline }) + newline;
                output = new UTF8Encoding(false).GetBytes(text);
            }
            var dir = Path.GetDirectoryName(f.Path)!;
            Directory.CreateDirectory(dir);
            var tmp = Path.Combine(dir, Path.GetFileName(f.Path) + ".prism-tmp-" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4)));
            File.WriteAllBytes(tmp, output);
            try
            {
                // Concurrent-edit check: the file must still be what we merged into.
                if (Sha(ReadBytes(f.Path)) != Sha(original))
                {
                    if (attempt == 0) continue;   // retry once on the new content
                    return $"{Path.GetFileName(f.Path)} keeps changing; nothing was written to it.";
                }
                if (original is null)
                {
                    File.Move(tmp, f.Path, overwrite: false);
                    return null;
                }
                // Review L8: File.Replace moves the file it replaces to the backup name in the same atomic step, so the backup is
                // EXACTLY the bytes that were replaced, on every attempt. Then it is verified against what we merged into.
                var backup = NewBackupPath(f.Path);
                BeforeSwapForTests?.Invoke(f.Path);
                File.Replace(tmp, f.Path, backup, ignoreMetadataErrors: true);
                if (Sha(ReadBytes(backup)) == Sha(original))
                {
                    backups.Add(backup);
                    return null;
                }
                // Someone wrote the file between our check and the swap: our merge was based on bytes that are gone. Put theirs
                // back (they are the backup), then retry once on them.
                PutBack(backup, f.Path);
                if (attempt == 0) continue;
                return $"{Path.GetFileName(f.Path)} keeps changing; it was left as the other program wrote it.";
            }
            finally
            {
                if (File.Exists(tmp)) File.Delete(tmp);
            }
        }
        return null;
    }

    /// <summary>Restores <paramref name="from"/>'s bytes into <paramref name="path"/> (temp file + replace), then deletes <paramref name="from"/>.</summary>
    private static void PutBack(string from, string path)
    {
        var tmp = path + ".prism-tmp-" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4));
        File.Copy(from, tmp, overwrite: false);
        try
        {
            File.Replace(tmp, path, destinationBackupFileName: null, ignoreMetadataErrors: true);
            File.Delete(from);
        }
        finally
        {
            if (File.Exists(tmp)) File.Delete(tmp);
        }
    }

    private HookResult Restore(HookPlan plan, List<string> backups)
    {
        var f = plan.Files[0];
        var source = plan.RestoreFrom!;
        var bytes = File.ReadAllBytes(source);
        if (Sha(bytes) != plan.RestoreSha) return new(false, "That backup changed since the preview. Preview again.", []);
        var current = ReadBytes(f.Path);
        var tmp = f.Path + ".prism-tmp-" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4));
        File.WriteAllBytes(tmp, bytes);
        try
        {
            if (current is null) File.Move(tmp, f.Path, overwrite: false);
            else
            {
                // Review L8: the file being replaced becomes the backup in the same atomic step (exactly its bytes).
                var backup = NewBackupPath(f.Path);
                File.Replace(tmp, f.Path, backup, ignoreMetadataErrors: true);
                backups.Add(backup);
            }
        }
        finally
        {
            if (File.Exists(tmp)) File.Delete(tmp);
        }
        if (Sha(ReadBytes(f.Path)) != Sha(bytes)) return new(false, $"{Path.GetFileName(f.Path)} changed while it was restored; check it.", backups);
        _log.Info("restored a hook file from its backup");
        return new(true, $"Restored {Path.GetFileName(f.Path)}.", backups);
    }

    /// <summary>A fresh &lt;file&gt;.prism-backup-&lt;UTC&gt;[-n] name that does not exist yet.</summary>
    private string NewBackupPath(string path)
    {
        var stamp = _time.GetUtcNow().ToString("yyyyMMdd'T'HHmmss'Z'", System.Globalization.CultureInfo.InvariantCulture);
        var target = path + BackupMarker + stamp;
        for (var i = 1; File.Exists(target); i++) target = path + BackupMarker + stamp + "-" + i;
        return target;
    }

    // ------------------------------------------------------------------ drift

    /// <summary>Which of our entries are present and which are missing, per file. Read-only; never re-adds anything.</summary>
    public DriftReport CheckDrift()
    {
        var list = new List<HookDrift>();
        foreach (var kind in new[] { HookFileKind.Claude, HookFileKind.Codex })
        {
            var (root, refusal) = Parse(ReadBytes(_home.PathOf(kind)), kind);
            var expected = kind == HookFileKind.Claude ? ClaudeEvents : CodexEvents;
            if (root is null)
            {
                list.Add(new HookDrift(kind, [], expected.ToList(), refusal is null));
                continue;
            }
            var present = OursPresent(root, kind);
            list.Add(new HookDrift(kind, expected.Where(present.Contains).ToList(), expected.Where(e => !present.Contains(e)).ToList(), true));
        }
        return new DriftReport(list);
    }

    /// <summary>Our backups, newest first.</summary>
    public IReadOnlyList<string> Backups()
    {
        var result = new List<string>();
        foreach (var path in new[] { _home.ClaudeSettings, _home.CodexHooks })
        {
            var dir = Path.GetDirectoryName(path);
            if (dir is null || !Directory.Exists(dir)) continue;
            result.AddRange(Directory.EnumerateFiles(dir, Path.GetFileName(path) + BackupMarker + "*"));
        }
        return result.OrderByDescending(p => p, StringComparer.Ordinal).ToList();
    }

    // ------------------------------------------------------------------ JSON surgery (only the hooks subtree, only our objects)

    private void AddOurs(JsonObject root, HookFileKind kind, IReadOnlyList<string> events, string relayPath)
    {
        if (root["hooks"] is not JsonObject hooks)
        {
            hooks = new JsonObject();
            root["hooks"] = hooks;
        }
        foreach (var ev in events)
        {
            if (hooks[ev] is not JsonArray arr)
            {
                arr = new JsonArray();
                hooks[ev] = arr;
            }
            arr.Add(Group(kind, ev, relayPath));
        }
    }

    /// <summary>The matcher group we append for one event (exec form for Claude; a quoted command for Codex's cmd.exe /C).</summary>
    internal static JsonObject Group(HookFileKind kind, string ev, string relayPath)
    {
        var permission = ev == "PermissionRequest";
        var quick = ev is "SessionEnd" or "Interrupt";
        JsonObject handler;
        if (kind == HookFileKind.Claude)
        {
            handler = new JsonObject
            {
                ["type"] = "command",
                ["command"] = relayPath,
                ["args"] = new JsonArray("hook", "claude", ev),
                ["timeout"] = permission ? 60 : quick ? 1 : 5,
            };
        }
        else
        {
            var cmd = $"\"{relayPath}\" hook codex {ev}";
            handler = new JsonObject
            {
                ["type"] = "command",
                ["command"] = cmd,
                ["commandWindows"] = CodexWindowsCommand(relayPath, ev),
                ["timeout"] = permission ? 60 : quick ? 1 : 5,
            };
        }
        if (!permission) handler["async"] = true;
        var group = new JsonObject();
        if (kind == HookFileKind.Claude && ToolEvents.Contains(ev)) group["matcher"] = "*";
        group["hooks"] = new JsonArray(handler);
        return group;
    }

    /// <summary>cmd.exe's special characters: inside the one pair of quotes they make cmd /C strip the first and last quote.</summary>
    private const string CmdSpecial = "&<>()@^|%!";

    /// <summary>
    /// Codex runs <c>commandWindows</c> with <c>cmd.exe /C</c> (review L9). <c>"path" hook codex Ev</c> survives /C only when the
    /// quoted part has none of <c>&amp;&lt;&gt;()@^|</c> (cmd's rule 1, cmd /?); a profile path such as "C:\Users\Sam (Work)" has
    /// them, so cmd strips the first and last quote and splits the path. Then the whole line is wrapped in one more pair of quotes,
    /// which /C strips, leaving <c>"path" hook codex Ev</c>. (Lab L3 confirms the exact Codex launch on Windows.)
    /// </summary>
    internal static string CodexWindowsCommand(string relayPath, string ev)
    {
        var simple = $"\"{relayPath}\" hook codex {ev}";
        return relayPath.IndexOfAny(CmdSpecial.ToCharArray()) >= 0 ? "\"" + simple + "\"" : simple;
    }

    private void RemoveOurs(JsonObject root, HookFileKind kind)
    {
        if (root["hooks"] is not JsonObject hooks) return;
        foreach (var (ev, node) in hooks.ToList())
        {
            if (node is not JsonArray arr) continue;
            var changed = false;
            foreach (var group in arr.ToList())
            {
                if (group is not JsonObject g || g["hooks"] is not JsonArray handlers) continue;
                var removed = false;
                foreach (var h in handlers.ToList())
                    if (IsOurs(h, kind)) { handlers.Remove(h); removed = true; }
                if (removed && handlers.Count == 0) { arr.Remove(group); }
                changed |= removed;
            }
            if (changed && arr.Count == 0) hooks.Remove(ev);
        }
        if (hooks.Count == 0) root.Remove("hooks");
    }

    private HashSet<string> OursPresent(JsonObject root, HookFileKind kind)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        if (root["hooks"] is not JsonObject hooks) return set;
        foreach (var (ev, node) in hooks)
        {
            if (node is not JsonArray arr) continue;
            foreach (var group in arr)
                if (group is JsonObject g && g["hooks"] is JsonArray handlers && handlers.Any(h => IsOurs(h, kind))) set.Add(ev);
        }
        return set;
    }

    private int ForeignCount(JsonObject root, HookFileKind kind)
    {
        if (root["hooks"] is not JsonObject hooks) return 0;
        var n = 0;
        foreach (var (_, node) in hooks)
            if (node is JsonArray arr)
                foreach (var group in arr)
                    if (group is JsonObject g && g["hooks"] is JsonArray handlers) n += handlers.Count(h => !IsOurs(h, kind));
        return n;
    }

    /// <summary>Ours = the command is our relay (any path under the Prism user folder ending in prism-relay.exe) and it runs "hook".</summary>
    internal bool IsOurs(JsonNode? handler, HookFileKind kind)
    {
        if (handler is not JsonObject h || h["command"] is not JsonValue cv || !cv.TryGetValue<string>(out var command)) return false;
        if (kind == HookFileKind.Claude && h["args"] is JsonArray args)
            return _isOurCommand(command) && args.Count > 0 && args[0] is JsonValue a0 && a0.TryGetValue<string>(out var first) && first == "hook";
        var (exe, tail) = SplitCommand(command);
        return _isOurCommand(exe) && tail.StartsWith("hook ", StringComparison.Ordinal);
    }

    internal static (string Exe, string Tail) SplitCommand(string command)
    {
        var c = command.Trim();
        // The outer-quoted cmd /C form of CodexWindowsCommand: ""path" hook codex Ev".
        if (c.Length > 4 && c.StartsWith("\"\"", StringComparison.Ordinal) && c.EndsWith('"')) c = c[1..^1];
        if (c.StartsWith('"'))
        {
            var end = c.IndexOf('"', 1);
            return end < 0 ? (c.Trim('"'), "") : (c[1..end], c[(end + 1)..].TrimStart());
        }
        var sp = c.IndexOf(' ');
        return sp < 0 ? (c, "") : (c[..sp], c[(sp + 1)..].TrimStart());
    }

    // ------------------------------------------------------------------ reads and refusals

    private static (JsonObject? Root, string? Refusal) Parse(byte[]? bytes, HookFileKind kind)
    {
        if (bytes is null) return (null, null);
        var text = Encoding.UTF8.GetString(StripBom(bytes));
        if (string.IsNullOrWhiteSpace(text)) return (new JsonObject(), null);
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(text, documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Disallow, AllowTrailingCommas = false });
            // Materialize every object now: a duplicate key throws here (an ArgumentException), not later in a caller (review L5).
            Walk(node);
        }
        catch (ArgumentException)
        {
            return (null, "has duplicate keys (a rewrite would silently drop one)");
        }
        catch (JsonException)
        {
            try
            {
                JsonNode.Parse(text, documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
                return (null, "has comments or trailing commas (JSONC) that a rewrite would lose");
            }
            catch (JsonException)
            {
                return (null, "is not valid JSON");
            }
        }
        if (node is not JsonObject root) return (null, "is not a JSON object");
        if (Flag(root, "disableAllHooks")) return (null, "has disableAllHooks set");
        if (Flag(root, "allowManagedHooksOnly")) return (null, "allows managed hooks only");
        if (root["hooks"] is { } h && h is not JsonObject) return (null, "has a hooks value that is not an object");
        if (root["hooks"] is JsonObject hooks && hooks.Any(kv => kv.Value is not null and not JsonArray)) return (null, "has a hook event that is not a list");
        _ = kind;
        return (root, null);
    }

    private static void Walk(JsonNode? n)
    {
        switch (n)
        {
            case JsonObject o: foreach (var (_, v) in o) Walk(v); break;
            case JsonArray a: foreach (var v in a) Walk(v); break;
        }
    }

    private string? ManagedRefusal()
    {
        foreach (var path in _home.ClaudeManagedSettings)
        {
            var bytes = ReadBytes(path);
            if (bytes is null) continue;
            try
            {
                if (JsonNode.Parse(StripBom(bytes), documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true }) is JsonObject m
                    && (Flag(m, "allowManagedHooksOnly") || Flag(m, "disableAllHooks")))
                    return "is managed by policy (managed settings restrict hooks)";
            }
            catch (Exception ex) when (ex is JsonException or ArgumentException) { return "is managed by policy (unreadable managed settings)"; }
        }
        return null;
    }

    private string? CodexConfigNote()
    {
        var bytes = ReadBytes(_home.CodexConfig);
        if (bytes is null) return null;
        var text = Encoding.UTF8.GetString(bytes);
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith("[hooks", StringComparison.Ordinal)) return "Codex config.toml also defines hooks inline; it is never edited.";
            if (line.Replace(" ", "", StringComparison.Ordinal).StartsWith("hooks=false", StringComparison.Ordinal)) return "Codex hooks look disabled in config.toml (features); Codex won't run any hooks until they are enabled.";
        }
        return null;
    }

    private static bool Flag(JsonObject o, string name) => o[name] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    private static byte[]? ReadBytes(string path)
    {
        try { return File.Exists(path) ? File.ReadAllBytes(path) : null; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    private static byte[] StripBom(byte[] b) => b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF ? b[3..] : b;

    private static string Sha(byte[]? bytes) => bytes is null ? "absent" : Convert.ToHexStringLower(SHA256.HashData(bytes));

    private static string Token(string action, IEnumerable<HookFilePlan> files, string extra)
    {
        var sb = new StringBuilder(action).Append('|').Append(extra);
        foreach (var f in files) sb.Append('|').Append(f.Path).Append('|').Append(f.Sha256Before).Append('|').Append(string.Join(',', f.EventsToAdd));
        sb.Append('|').Append(Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8)));
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString())))[..32];
    }

    private HookFileKind? KindOfBackup(string backup)
    {
        var name = Path.GetFileName(backup);
        if (Path.GetDirectoryName(Path.GetFullPath(backup)) is not { } dir) return null;
        foreach (var kind in new[] { HookFileKind.Claude, HookFileKind.Codex })
        {
            var target = _home.PathOf(kind);
            if (string.Equals(Path.GetDirectoryName(Path.GetFullPath(target)), dir, StringComparison.OrdinalIgnoreCase)
                && name.StartsWith(Path.GetFileName(target) + BackupMarker, StringComparison.OrdinalIgnoreCase)) return kind;
        }
        return null;
    }

    private static string BackupTime(string backup)
    {
        var i = backup.LastIndexOf(BackupMarker, StringComparison.Ordinal);
        return i < 0 ? "earlier" : backup[(i + BackupMarker.Length)..];
    }
}
