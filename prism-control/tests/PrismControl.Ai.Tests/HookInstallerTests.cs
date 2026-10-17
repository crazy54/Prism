using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Ai.Hooks;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>
/// research/ai-apps.md §5.7 on temporary home folders ONLY (fixture copies under %TEMP%\prism-ai-tests). These tests never
/// read or write the user's real ~/.claude or ~/.codex: every HookHome comes from HookHome.At(tempRoot).
/// </summary>
public class HookInstallerTests
{
    private static (TestRig Rig, string Home) Orca()
    {
        var home = TempDirs.CopyFixture("home-orca");
        return (new TestRig(home: home), home);
    }

    private static string Claude(string home) => Path.Combine(home, ".claude", "settings.json");
    private static string Codex(string home) => Path.Combine(home, ".codex", "hooks.json");
    private static JsonObject Json(string path) => JsonNode.Parse(File.ReadAllText(path))!.AsObject();
    private static void Same(byte[] expected, byte[] actual, string? why = null) => Assert.Equal(Convert.ToHexString(expected), Convert.ToHexString(actual), why);

    [Test]
    public void Tests_only_ever_use_temporary_homes()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        Assert.True(home.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase));
        var h = HookHome.At(home);
        foreach (var p in new[] { h.ClaudeSettings, h.CodexHooks, h.CodexConfig })
        {
            Assert.False(p.StartsWith(Path.Combine(profile, ".claude"), StringComparison.OrdinalIgnoreCase));
            Assert.False(p.StartsWith(Path.Combine(profile, ".codex"), StringComparison.OrdinalIgnoreCase));
        }
    }

    [Test]
    public void Preview_is_read_only_and_explains_everything()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var before = File.ReadAllBytes(Claude(home));
        var plan = rig.Hooks.Preview();
        Assert.True(plan.CanApply);
        Same(before, File.ReadAllBytes(Claude(home)));
        var claude = plan.Files[0];
        Assert.Equal(HookInstaller.ClaudeEvents.Count, claude.EventsToAdd.Count);
        Assert.Equal(3, claude.ForeignHandlers);
        Assert.Equal(3, plan.Files[1].ForeignHandlers);
        var notes = string.Join("\n", plan.Notes);
        Assert.Contains("Orca's included", notes);
        Assert.Contains("status line stays untouched", notes);
        Assert.Contains("open /hooks in Codex", notes);
        Assert.Contains("Never written", notes);
        Assert.Equal(rig.Relay.RelayPath, plan.RelayPath);
        Assert.NotNull(plan.RelaySha256);
        Assert.Empty(rig.Hooks.Backups());
    }

    [Test]
    public async Task Install_appends_after_foreign_entries_and_touches_nothing_else()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var original = Json(Claude(home));
        var originalCodex = Json(Codex(home));
        var plan = rig.Hooks.Preview();
        var r = await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        Assert.True(r.Ok, r.Message);
        Assert.Equal(1, rig.Relay.Ensured, "the relay is copied first");
        var after = Json(Claude(home));

        // Every top-level key other than hooks is identical, in the same order.
        Assert.Equal(string.Join(",", original.Select(kv => kv.Key)), string.Join(",", after.Select(kv => kv.Key)));
        foreach (var (k, v) in original.Where(kv => kv.Key != "hooks"))
            Assert.Equal(v!.ToJsonString(), after[k]!.ToJsonString(), k);
        Assert.Equal("Grüße — café ✓", after["unicodeKey"]!.GetValue<string>(), "non-ASCII is not rewritten");
        Assert.DoesNotContain("\\u00FC", File.ReadAllText(Claude(home)));

        // Orca's handlers stay first and byte-identical; ours are appended.
        var hooks = after["hooks"]!.AsObject();
        foreach (var (ev, node) in original["hooks"]!.AsObject())
        {
            var arr = hooks[ev]!.AsArray();
            Assert.Equal(node![0]!.ToJsonString(), arr[0]!.ToJsonString(), ev + " Orca entry first and unchanged");
            Assert.Equal(2, arr.Count);
        }
        var perm = hooks["PermissionRequest"]![1]!.AsObject();
        Assert.Equal("*", perm["matcher"]!.GetValue<string>());
        var h = perm["hooks"]![0]!.AsObject();
        Assert.Equal("command", h["type"]!.GetValue<string>());
        Assert.Equal(rig.Relay.RelayPath, h["command"]!.GetValue<string>());
        Assert.Equal("[\"hook\",\"claude\",\"PermissionRequest\"]", h["args"]!.ToJsonString());
        Assert.Equal(60, h["timeout"]!.GetValue<int>());
        Assert.False(h.ContainsKey("async"), "the permission hook blocks (it decides)");
        var stop = hooks["Stop"]![1]!["hooks"]![0]!.AsObject();
        Assert.Equal(true, stop["async"]!.GetValue<bool>(), "status events never slow the agent down");
        Assert.Equal(1, hooks["SessionEnd"]![0]!["hooks"]![0]!["timeout"]!.GetValue<int>());
        Assert.Equal(HookInstaller.ClaudeEvents.Count, hooks.Count(kv => kv.Value!.AsArray().Any(g => g!["hooks"]![0]!["command"]!.GetValue<string>() == rig.Relay.RelayPath)));

        // Codex: a quoted command for cmd.exe /C, commandWindows, no matcher.
        var codexHooks = Json(Codex(home))["hooks"]!.AsObject();
        Assert.Equal(originalCodex["hooks"]!["SessionStart"]![0]!.ToJsonString(), codexHooks["SessionStart"]![0]!.ToJsonString());
        var cp = codexHooks["PermissionRequest"]![1]!["hooks"]![0]!.AsObject();
        Assert.Equal($"\"{rig.Relay.RelayPath}\" hook codex PermissionRequest", cp["command"]!.GetValue<string>());
        Assert.Equal(cp["command"]!.GetValue<string>(), cp["commandWindows"]!.GetValue<string>());
        Assert.False(codexHooks["PermissionRequest"]![1]!.AsObject().ContainsKey("matcher"));
        Assert.Equal(1, codexHooks["Interrupt"]![1]!["hooks"]![0]!["timeout"]!.GetValue<int>());
    }

    [Test]
    public async Task Install_backs_up_byte_for_byte_and_keeps_line_endings()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var crlf = File.ReadAllText(Claude(home)).Replace("\r\n", "\n").Replace("\n", "\r\n");
        File.WriteAllText(Claude(home), crlf);
        var original = File.ReadAllBytes(Claude(home));
        var r = await rig.Hooks.ApplyAsync(rig.Hooks.Preview().ConsentToken, CancellationToken.None);
        Assert.Equal(2, r.Backups.Count);
        var backup = r.Backups.Single(b => b.StartsWith(Claude(home) + HookInstaller.BackupMarker, StringComparison.Ordinal));
        Same(original, File.ReadAllBytes(backup));
        Assert.Contains("20261016T120000Z", backup, "UTC stamp");
        var text = File.ReadAllText(Claude(home));
        Assert.Contains("\r\n", text);
        Assert.False(text.Replace("\r\n", "").Contains('\n'), "no mixed line endings");
        Assert.Equal(2, rig.Hooks.Backups().Count);
    }

    [Test]
    public async Task Install_creates_missing_files_and_arrays_only_when_missing()
    {
        var home = TempDirs.New("empty-home");
        using var rig = new TestRig(home: home);
        var plan = rig.Hooks.Preview();
        Assert.False(plan.Files[0].Exists);
        var r = await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        Assert.True(r.Ok, r.Message);
        Assert.Empty(r.Backups);
        var root = Json(Claude(home));
        Assert.Equal("hooks", Assert.Single(root.Select(kv => kv.Key)));
        Assert.Equal(HookInstaller.ClaudeEvents.Count, root["hooks"]!.AsObject().Count);
        Assert.True(File.Exists(Codex(home)));
        Assert.False(File.Exists(Path.Combine(home, ".codex", "config.toml")), "config.toml is never created or written");
    }

    [Test]
    public async Task Consent_is_required_and_bound_to_the_preview()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var before = File.ReadAllBytes(Claude(home));
        Assert.False((await rig.Hooks.ApplyAsync(null, CancellationToken.None)).Ok);
        Assert.False((await rig.Hooks.ApplyAsync("forged-token", CancellationToken.None)).Ok);
        var plan = rig.Hooks.Preview();
        Assert.False((await rig.Hooks.ApplyAsync(plan.ConsentToken + "x", CancellationToken.None)).Ok);
        var newer = rig.Hooks.Preview();
        Assert.False((await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None)).Ok, "an older preview's token is void");
        Same(before, File.ReadAllBytes(Claude(home)));
        Assert.True((await rig.Hooks.ApplyAsync(newer.ConsentToken, CancellationToken.None)).Ok);
        Assert.False((await rig.Hooks.ApplyAsync(newer.ConsentToken, CancellationToken.None)).Ok, "one consent, one apply");
    }

    [Test]
    public async Task A_file_changed_after_the_preview_is_not_written()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var plan = rig.Hooks.Preview();
        var edited = Json(Claude(home));
        edited["theme"] = "light";   // the user (or Orca) edits the file before the click
        File.WriteAllText(Claude(home), edited.ToJsonString());
        var bytes = File.ReadAllBytes(Claude(home));
        var r = await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        Assert.False(r.Ok);
        Assert.Contains("changed since the preview", r.Message);
        Same(bytes, File.ReadAllBytes(Claude(home)));
        Assert.Empty(rig.Hooks.Backups());
    }

    [Test]
    public async Task Refusals()
    {
        async Task Refused(string content, string why, Action<string>? extra = null)
        {
            var home = TempDirs.New("refuse");
            using var rig = new TestRig(home: home);
            Directory.CreateDirectory(Path.GetDirectoryName(Claude(home))!);
            File.WriteAllText(Claude(home), content);
            extra?.Invoke(home);
            var plan = rig.Hooks.Preview();
            Assert.False(plan.CanApply, why);
            Assert.Contains(why, plan.Files[0].Refusal, content);
            Assert.False((await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None)).Ok);
            Assert.Equal(content, File.ReadAllText(Claude(home)));
            Assert.False(File.Exists(Codex(home)), "a refusal anywhere means no write anywhere");
        }
        await Refused("{ // my settings\n \"theme\": \"dark\" }", "JSONC");
        await Refused("{ \"theme\": \"dark\", }", "JSONC");
        await Refused("{ \"theme\": ", "not valid JSON");
        await Refused("[1,2]", "not a JSON object");
        await Refused("{ \"disableAllHooks\": true }", "disableAllHooks");
        await Refused("{ \"allowManagedHooksOnly\": true }", "managed hooks only");
        await Refused("{ \"hooks\": [] }", "not an object");
        await Refused("{ \"hooks\": { \"Stop\": {} } }", "not a list");
        await Refused("{ \"theme\": \"dark\" }", "managed by policy", home =>
        {
            Directory.CreateDirectory(Path.Combine(home, "managed"));
            File.WriteAllText(Path.Combine(home, "managed", "managed-settings.json"), "{ \"allowManagedHooksOnly\": true }");
        });
    }

    [Test]
    public async Task Drift_is_reported_never_repaired()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        Assert.False(rig.Hooks.CheckDrift().Installed);
        await rig.Hooks.ApplyAsync(rig.Hooks.Preview().ConsentToken, CancellationToken.None);
        var ok = rig.Hooks.CheckDrift();
        Assert.True(ok.Installed);
        Assert.False(ok.Drifted);
        // Another tool rewrites settings.json and drops our Stop entry.
        var root = Json(Claude(home));
        root["hooks"]!["Stop"]!.AsArray().RemoveAt(1);
        File.WriteAllText(Claude(home), root.ToJsonString());
        var bytes = File.ReadAllBytes(Claude(home));
        var d = rig.Hooks.CheckDrift();
        Assert.True(d.Drifted);
        Assert.Equal("Stop", Assert.Single(d.Files[0].Missing));
        Same(bytes, File.ReadAllBytes(Claude(home)), "never silently re-added");
        var again = rig.Hooks.Preview();
        Assert.Equal("Stop", Assert.Single(again.Files[0].EventsToAdd), "a re-install adds only what is missing");
    }

    [Test]
    public async Task Uninstall_removes_exactly_ours()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var original = Json(Claude(home)).ToJsonString();
        var originalCodex = Json(Codex(home)).ToJsonString();
        await rig.Hooks.ApplyAsync(rig.Hooks.Preview().ConsentToken, CancellationToken.None);
        var plan = rig.Hooks.PreviewUninstall();
        Assert.Equal(HookInstaller.ClaudeEvents.Count, plan.Files[0].EventsToAdd.Count);
        var r = await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        Assert.True(r.Ok, r.Message);
        Assert.Equal(original, Json(Claude(home)).ToJsonString(), "back to exactly the original content");
        Assert.Equal(originalCodex, Json(Codex(home)).ToJsonString());
        Assert.Equal(4, rig.Hooks.Backups().Count, "install and uninstall backups are kept");
        Assert.False(rig.Hooks.CheckDrift().Installed);
    }

    [Test]
    public async Task Ours_is_any_relay_under_the_prism_folder_with_hook_args()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        // An older install pointing at a versioned relay path is still ours; a lookalike elsewhere is not.
        var root = Json(Claude(home));
        var relayDir = Path.GetDirectoryName(rig.Relay.RelayPath)!;
        root["hooks"]!["Stop"]!.AsArray().Add(HookInstaller.Group(HookFileKind.Claude, "Stop", Path.Combine(relayDir, "0.1.0", "prism-relay.exe")));
        root["hooks"]!["Stop"]!.AsArray().Add(HookInstaller.Group(HookFileKind.Claude, "Stop", @"C:\Tools\prism-relay.exe"));
        var notHook = HookInstaller.Group(HookFileKind.Claude, "Stop", rig.Relay.RelayPath);
        notHook["hooks"]![0]!["args"] = new JsonArray("otel-headers");
        root["hooks"]!["Stop"]!.AsArray().Add(notHook);
        File.WriteAllText(Claude(home), root.ToJsonString());
        var plan = rig.Hooks.PreviewUninstall();
        Assert.Equal("Stop", Assert.Single(plan.Files[0].EventsToAdd));
        await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        var stop = Json(Claude(home))["hooks"]!["Stop"]!.AsArray();
        Assert.Equal(3, stop.Count, "Orca's + the lookalike + the non-hook command stay");
        Assert.Equal(("C:\\Tools\\prism-relay.exe", "hook claude Stop"), HookInstaller.SplitCommand("\"C:\\Tools\\prism-relay.exe\" hook claude Stop"));
    }

    [Test]
    public async Task Restore_puts_a_backup_back()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var original = File.ReadAllBytes(Claude(home));
        await rig.Hooks.ApplyAsync(rig.Hooks.Preview().ConsentToken, CancellationToken.None);
        var backup = rig.Hooks.Backups().Single(b => b.Contains("settings.json", StringComparison.Ordinal));
        rig.Time.Advance(TimeSpan.FromMinutes(1));
        var plan = rig.Hooks.PreviewRestore(backup);
        Assert.True(plan.CanApply);
        Assert.True((await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None)).Ok);
        Same(original, File.ReadAllBytes(Claude(home)));
        Assert.False(rig.Hooks.PreviewRestore(Path.Combine(home, "elsewhere.json")).CanApply, "only our own backups");
    }

    [Test]
    public async Task Safe_mode_never_writes()
    {
        var home = TempDirs.CopyFixture("home-orca");
        using var rig = new TestRig(safeMode: true, home: home);
        var files = Directory.EnumerateFiles(home, "*", SearchOption.AllDirectories).ToDictionary(f => f, File.ReadAllBytes);
        var plan = rig.Hooks.Preview();
        Assert.True(plan.CanApply, "previews still work in safe mode");
        var r = await rig.Hooks.ApplyAsync(plan.ConsentToken, CancellationToken.None);
        Assert.False(r.Ok);
        Assert.Contains("Safe mode", r.Message);
        Assert.Equal(0, rig.Relay.Ensured, "not even the relay copy");
        var now = Directory.EnumerateFiles(home, "*", SearchOption.AllDirectories).ToList();
        Assert.Equal(files.Count, now.Count, "no backups, no temp files");
        foreach (var (f, b) in files) Assert.Equal(Convert.ToHexString(b), Convert.ToHexString(File.ReadAllBytes(f)), f);
    }

    [Test]
    public async Task The_pi_flow_is_preview_then_token()
    {
        var (rig, home) = Orca();
        using var _ = rig;
        var before = File.ReadAllBytes(Claude(home));
        var noToken = await Actions.AiPi.HandleAsync(rig.Services, "hooks.apply", new JsonObject());
        Same(before, File.ReadAllBytes(Claude(home)));
        Assert.Contains("Preview the changes first", System.Text.Json.JsonSerializer.Serialize(noToken));
        var preview = System.Text.Json.JsonSerializer.SerializeToNode(await Actions.AiPi.HandleAsync(rig.Services, "hooks.preview", null))!;
        var token = preview["token"]!.GetValue<string>();
        var applied = System.Text.Json.JsonSerializer.SerializeToNode(await Actions.AiPi.HandleAsync(rig.Services, "hooks.apply", new JsonObject { ["token"] = token }))!;
        Assert.Equal(true, applied["ok"]!.GetValue<bool>());
        Assert.NotEqual(Convert.ToHexString(before), Convert.ToHexString(File.ReadAllBytes(Claude(home))));
        Assert.Null(await Actions.AiPi.HandleAsync(rig.Services, "approve", null), "the PI has no approve message");
    }
}
