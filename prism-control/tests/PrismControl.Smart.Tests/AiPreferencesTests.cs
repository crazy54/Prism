using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Actions;
using PrismControl.Smart.Control;
using PrismControl.Smart.Packs;
using PrismControl.Smart.Profiles;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>
/// SD2's AI preferences: the engine rig + the real pairing service, change log and operations over a temporary user pack
/// folder and audit file. Smart Keys are real action instances in harnesses sharing the rig's clock.
/// </summary>
public sealed class AiRig : IAsyncDisposable
{
    public static readonly DeviceInfo McpDeck = new("dev-mcp", "MCP Deck", DeviceType.McpDeck, 8, 4);
    public static readonly DeviceInfo VirtualDeck = new("dev-virtual", "Virtual Stream Deck", DeviceType.Virtual, 4, 2);
    public static readonly DeviceInfo Mobile = new("dev-mobile", "Stream Deck Mobile", DeviceType.Mobile, 5, 3);

    public Rig Rig { get; }
    public string Dir { get; } = Path.Combine(Path.GetTempPath(), "prism-sd2-ai", Guid.NewGuid().ToString("N"));
    public string UserPacks => Path.Combine(Dir, "packs");
    public PackLibrary Library { get; }
    public PairingService Pairing { get; }
    public ChangeLog Log { get; }
    public SmartOps Ops { get; }
    public bool AllowAi { get; set; } = true;
    public List<ActionHarness<SmartKeyAction>> Keys { get; } = [];

    public AiRig(bool safeMode = false)
    {
        Directory.CreateDirectory(Dir);
        Library = new PackLibrary(Sources);
        Library.Reload();
        Rig = new Rig(Library.Packs);
        Pairing = new PairingService(Rig.Time);
        Log = new ChangeLog(Path.Combine(Dir, "audit.jsonl"), Rig.Time);
        Ops = new SmartOps(new SmartOpsParts
        {
            Engine = Rig.Engine, Library = Library, Sources = Sources, Reload = () => { Library.Reload(); Rig.SetPacks(Library.Packs); },
            UserPackDirectory = UserPacks, Pairing = Pairing, Log = Log, AllowAi = () => AllowAi, Time = Rig.Time, SafeMode = safeMode,
        });
        // Like the module: a hold on a REVIEW key of a physical deck approves the AI proposal.
        Rig.Engine.ReviewApprover = Ops.ApproveReview;
    }

    public IEnumerable<PackSourceFile> Sources() => PackLibrary.Embedded().Concat(PackLibrary.Folder(UserPacks, PackOrigin.User));

    public async Task<ActionHarness<SmartKeyAction>> KeyAsync(DeviceInfo device, int x, int y)
    {
        var h = await ActionHarness<SmartKeyAction>.AppearAsync(device, new Coordinates(x, y), Controller.Keypad,
            configureServices: s => { s.Add(Rig.Engine); s.Add(Pairing); }, time: Rig.Time, context: $"{device.Id}-k{x}{y}");
        Keys.Add(h);
        return h;
    }

    /// <summary>A whole Galleon of Smart Keys (12) and returns the top-left one.</summary>
    public async Task<ActionHarness<SmartKeyAction>> GalleonAsync()
    {
        ActionHarness<SmartKeyAction>? first = null;
        for (var y = 0; y < 4; y++)
            for (var x = 0; x < 3; x++)
            {
                var h = await KeyAsync(TestDevices.Galleon, x, y);
                first ??= h;
            }
        return first!;
    }

    /// <summary>The per-pairing secret the approved poll handed out (B3); <see cref="Call"/> sends it with every operation.</summary>
    public string? Secret { get; set; }

    public JsonNode Call(string op, object? args = null)
    {
        var a = (args is null ? null : ActionJson.ToNode(args) as JsonObject) ?? [];
        if (Secret is not null && !a.ContainsKey("pairingSecret")) a["pairingSecret"] = Secret;
        var r = Ops.Handle(op, a, "Test Assistant");
        if (op == "pair" && r["pairingSecret"] is JsonValue s) Secret = s.GetValue<string>();
        return r;
    }

    public OpException Refused(string op, object? args = null) => Assert.Throws<OpException>(() => Call(op, args));

    /// <summary>Starts pairing, has "the user" hold the prompt key for 1.6 s, and polls once for the secret.</summary>
    public async Task PairAsync(ActionHarness<SmartKeyAction> key)
    {
        var r = Call("pair");
        Assert.Equal("pending", (string?)r["status"]);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(1600));
        await key.KeyUpAsync();
        Assert.True(Pairing.IsPaired, "paired after the hold");
        var poll = Call("pair", new { pairingId = (string)r["pairingId"]! });
        Assert.Equal("approved", (string?)poll["status"]);
        Assert.NotNull(Secret, "the approved poll hands out the pairing secret");
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var k in Keys) await k.DisposeAsync();
        Pairing.Dispose();
        Rig.Dispose();
        try { Directory.Delete(Dir, true); } catch { /* best effort */ }
    }
}

public class PairingTests
{
    [Test]
    public async Task Virtual_decks_never_show_or_approve_the_prompt()
    {
        await using var ai = new AiRig();
        var mcp = await ai.KeyAsync(AiRig.McpDeck, 0, 0);
        await ai.KeyAsync(AiRig.VirtualDeck, 0, 0);
        await ai.KeyAsync(AiRig.Mobile, 0, 0);
        var e = ai.Refused("pair");
        Assert.Equal("no_physical_key", e.Code);

        var galleon = await ai.KeyAsync(TestDevices.Galleon, 0, 0);
        ai.Call("pair");
        await galleon.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        Assert.True(ai.Pairing.IsPrompt(galleon.Context), "the Galleon key shows the prompt");
        Assert.False(ai.Pairing.IsPrompt(mcp.Context), "the MCP Deck key never does");
        Assert.Null(ai.Pairing.PromptFor(mcp.Context));

        // Holding the MCP Deck's key for 3 s never approves (an assistant could press it itself).
        await mcp.KeyDownAsync();
        await mcp.AdvanceAsync(TimeSpan.FromSeconds(3));
        await mcp.KeyUpAsync();
        Assert.False(ai.Pairing.IsPaired);
        // Nor does a virtual device that claims a physical deck's prompt context.
        Assert.False(ai.Pairing.HoldBegin(galleon.Context, AiRig.McpDeck), "a virtual device is refused even on the prompt key");
        Assert.False(ai.Pairing.HoldBegin(galleon.Context, AiRig.VirtualDeck));
        Assert.False(ai.Pairing.HoldBegin(galleon.Context, AiRig.Mobile));
        Assert.False(ai.Pairing.IsPaired);
        foreach (var t in new[] { DeviceType.Mobile, DeviceType.Virtual, DeviceType.McpDeck, DeviceType.Unknown, DeviceType.Pedal, DeviceType.Studio })
            Assert.False(PairingService.PhysicalTypes.Contains(t), t + " can't approve");
    }

    [Test]
    public async Task A_tap_never_approves_and_a_full_hold_does()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        var r = ai.Call("pair");
        Assert.Equal(4, ((string)r["code"]!).Length);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(500));
        foreach (var held in new[] { 50, 400, 1000, 1400 })
        {
            await key.KeyDownAsync();
            await key.AdvanceAsync(TimeSpan.FromMilliseconds(held));
            await key.KeyUpAsync();
            await key.AdvanceAsync(TimeSpan.FromMilliseconds(2000));
            Assert.False(ai.Pairing.IsPaired, $"a {held} ms press never approves");
        }
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(800));
        Assert.InRange(ai.Pairing.PromptFor(key.Context)!.Progress, 0.45, 0.6);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(750));
        Assert.True(ai.Pairing.IsPaired, "1.5 s hold approves (while still held)");
        await key.KeyUpAsync();
        Assert.Equal("Test Assistant", ai.Pairing.PairedClient);
        Assert.Null(ai.Pairing.PromptFor(key.Context));
        Assert.Equal("approved", (string?)ai.Call("pair", new { pairingId = (string)r["pairingId"]! })["status"]);
        key.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task A_press_that_began_right_as_the_prompt_appeared_never_approves()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        ai.Call("pair");
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(100));
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromSeconds(3));
        await key.KeyUpAsync();
        Assert.False(ai.Pairing.IsPaired, "pressed within 400 ms of the prompt");
    }

    [Test]
    public async Task The_request_expires_after_two_minutes_and_the_key_goes_back()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        var r = ai.Call("pair");
        var id = (string)r["pairingId"]!;
        await key.AdvanceAsync(TimeSpan.FromSeconds(119));
        Assert.Equal("pending", (string?)ai.Call("pair", new { pairingId = id })["status"]);
        Assert.NotNull(ai.Pairing.PromptFor(key.Context));
        await key.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("expired", (string?)ai.Call("pair", new { pairingId = id })["status"]);
        Assert.Null(ai.Pairing.PromptFor(key.Context));
        Assert.False(ai.Pairing.IsPrompt(key.Context));
        Assert.Null(ai.Status()["pendingPrompt"]);
        await key.KeyDownAsync();
        await key.AdvanceAsync(TimeSpan.FromSeconds(2));
        await key.KeyUpAsync();
        Assert.False(ai.Pairing.IsPaired, "an expired prompt approves nothing");
    }

    [Test]
    public async Task Deny_and_revoke_from_the_PI_and_switching_AI_off()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        ai.Call("pair");
        Assert.True(ai.Pairing.Deny());
        Assert.Null(ai.Pairing.PromptFor(key.Context));
        await key.AdvanceAsync(TimeSpan.FromSeconds(4));
        await ai.PairAsync(key);
        Assert.Equal("Test Assistant", (string?)ai.Call("status")["client"]);
        Assert.True(ai.Pairing.Revoke("revoked in the property inspector"));
        Assert.Equal("not_paired", ai.Refused("prefs.get").Code);
        ai.AllowAi = false;
        Assert.Equal("ai_off", ai.Refused("pair").Code);
        Assert.Equal("ai_off", ai.Refused("prefs.set", new { patch = new { labelSize = "large" } }).Code);
        Assert.False((bool)ai.Call("status")["allowAi"]!, "status always answers");
    }

    [Test]
    public async Task The_prompt_is_drawn_on_the_top_left_smart_key_and_its_presses_never_run_the_verb()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        await ai.Rig.FrontAsync(Apps.VsCode);
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(200));
        var normal = key.LastSvg;
        ai.Call("pair");
        await key.AdvanceAsync(TimeSpan.FromMilliseconds(600));
        Assert.NotEqual(normal, key.LastSvg);
        Assert.True(ai.Keys.Skip(1).All(k => !ai.Pairing.IsPrompt(k.Context)), "only the top-left Smart Key prompts");
        // A tap on the prompt key sends nothing to VS Code (its verb would have).
        var before = ai.Rig.KeysSent().Count;
        await key.PressAsync(TimeSpan.FromMilliseconds(80));
        await ai.Rig.IdleAsync();
        Assert.Equal(before, ai.Rig.KeysSent().Count);
        // Once the key is gone (page switch), the next Smart Key on that deck takes the prompt.
        await key.DisappearAsync();
        Assert.True(ai.Pairing.IsPrompt(ai.Keys[1].Context));
        foreach (var k in ai.Keys) k.AssertFramesAreDeckSafe();
    }

    [Test]
    public void The_client_name_is_sanitized_and_rate_limited_starts()
    {
        Assert.Equal("Example Bot", PairingService.SanitizeClient("  Example\u0007 Bot‮ "));
        Assert.Equal("AI assistant", PairingService.SanitizeClient("\u0000\u0001"));
        Assert.Equal(64, PairingService.SanitizeClient(new string('x', 200)).Length);
    }
}

internal static class AiRigExtensions
{
    public static JsonNode Status(this AiRig ai) => ai.Call("status");
}

public class AiOperationTests
{
    private static readonly string Vs = "vscode";

    [Test]
    public async Task Only_status_and_pair_work_before_the_user_approved_on_the_deck()
    {
        await using var ai = new AiRig();
        await ai.GalleonAsync();
        foreach (var op in new[] { "prefs.get", "prefs.set", "pin", "explain", "list", "override", "undo" })
            Assert.Equal("not_paired", ai.Refused(op).Code, op);
        Assert.Equal(1, (int)ai.Call("status")["api"]!);
        Assert.Equal("unknown_op", ai.Refused("rm -rf").Code);
    }

    [Test]
    public async Task Prefs_set_changes_preferences_in_plain_terms_and_undo_restores_them()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        var r = ai.Call("prefs.set", new { patch = new { labelSize = "large", streamerSafe = true, dialCategories = new { camera = "left", tool = "1" }, bogus = 1 } });
        var changed = r["changed"]!.AsArray().Select(x => (string)x!).ToList();
        Assert.True(changed.Contains("labelSize") && changed.Contains("streamerSafe") && changed.Contains("dialCategories"), string.Join(",", changed));
        Assert.Contains("bogus", r["ignored"]!.ToJsonString());
        var p = ai.Rig.Engine.Preferences;
        Assert.Equal("large", p.LabelSize);
        Assert.True(p.StreamerSafe);
        Assert.Equal("left", p.DialCategories["camera"]);
        Assert.Equal("large", ai.Rig.Saved?.LabelSize, "saved to global settings");

        // Hidden verbs per app, then un-setting one dial category.
        var verb = TestPacks.Get(Vs).Verbs[0].Id;
        ai.Call("prefs.set", new { hidden = new { app = Vs, hide = new[] { verb } } });
        Assert.True(ai.Rig.Engine.Preferences.For(Vs).Hidden.Contains(verb));
        ai.Call("prefs.set", new { patch = new { dialCategories = new Dictionary<string, string?> { ["tool"] = null } } });
        Assert.False(ai.Rig.Engine.Preferences.DialCategories.ContainsKey("tool"));
        Assert.Equal(3, ai.Log.UndoDepth);

        var u = ai.Call("undo", new { steps = 2 });
        Assert.Equal(2, u["undone"]!.AsArray().Count);
        Assert.False(ai.Rig.Engine.Preferences.For(Vs).Hidden.Contains(verb), "hidden undone");
        Assert.Equal("large", ai.Rig.Engine.Preferences.LabelSize);
        var last = ai.Call("undo");
        Assert.Equal("normal", ai.Rig.Engine.Preferences.LabelSize);
        Assert.True(ai.Rig.Engine.Preferences.StreamerSafe, "an assistant's undo never turns streamer-safe off (decision 2)");
        Assert.Contains("streamerSafe", last["kept"]!.ToJsonString());
        Assert.Equal("nothing_to_undo", ai.Refused("undo").Code);

        Assert.Equal("invalid_argument", ai.Refused("prefs.set", new { patch = new { labelSize = "gigantic" } }).Code);
        Assert.Equal("unknown_pack", ai.Refused("prefs.set", new { hidden = new { app = "no-such-app", hide = new[] { "x" } } }).Code);
        Assert.Equal("unknown_item", ai.Refused("prefs.set", new { hidden = new { app = Vs, hide = new[] { "no.such.verb" } } }).Code);
        var dry = ai.Call("prefs.set", new { patch = new { bigIcons = true }, dryRun = true });
        Assert.True((bool)dry["dryRun"]!);
        Assert.False(ai.Rig.Engine.Preferences.BigIcons, "dry run changes nothing");
    }

    [Test]
    public async Task Undo_keeps_fifty_steps_and_refuses_to_clobber_the_users_own_edits_unless_forced()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        for (var i = 0; i < 55; i++) ai.Call("prefs.set", new { patch = new { appDebounceMs = 100 + i } });
        Assert.Equal(50, ai.Log.UndoDepth);
        // B4: an unrelated edit the user makes in the PI never blocks an undo, and the undo never wipes it.
        ai.Rig.Engine.EditPreferences(p => p.BigIcons = true);
        ai.Call("undo");
        Assert.Equal(153, ai.Rig.Engine.Preferences.AppDebounceMs);
        Assert.True(ai.Rig.Engine.Preferences.BigIcons, "the user's own edit survives");
        // The user changes the SAME field after the AI's change: changed_since, unless forced.
        ai.Rig.Engine.EditPreferences(p => p.AppDebounceMs = 333);
        var e = ai.Refused("undo");
        Assert.Equal("changed_since", e.Code);
        Assert.Equal(333, ai.Rig.Engine.Preferences.AppDebounceMs);
        ai.Call("undo", new { force = true });
        Assert.Equal(152, ai.Rig.Engine.Preferences.AppDebounceMs);
        ai.Call("undo", new { steps = 50 });
        Assert.Equal(104, ai.Rig.Engine.Preferences.AppDebounceMs, "50 steps back from 154");
        Assert.True(ai.Rig.Engine.Preferences.BigIcons);
        Assert.Equal(0, ai.Log.UndoDepth);
    }

    [Test]
    public async Task Pin_validates_and_the_layout_and_explain_follow_it()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        await ai.Rig.FrontAsync(Apps.VsCode);
        var pack = TestPacks.Get(Vs);
        var verb = pack.Verbs.OrderBy(v => v.Priority).First(v => v.Contexts.Contains("*") || v.Contexts.Contains(pack.DefaultContext.Id));
        var r = ai.Call("pin", new { app = Vs, device = "galleon-100-sd", kind = "key", x = 2, y = 1, item = verb.Id, context = pack.DefaultContext.Id });
        Assert.Contains(verb.Id, r["pins"]!.ToJsonString());
        await ai.Rig.AdvanceAsync(200);
        Assert.Equal(verb.Id, (ai.Rig.Engine.LayoutFor(TestDevices.Galleon.Id).KeyAt(new Layout.KeySlot(2, 1)) as Layout.VerbKey)?.Verb.Id);

        var why = ai.Call("explain", new { deviceId = TestDevices.Galleon.Id, kind = "key", x = 2, y = 1 });
        Assert.True((bool)why["smart"]!);
        Assert.Equal(verb.Id, (string?)why["item"]!["id"]);
        Assert.True((bool)why["item"]!["pinned"]!);
        Assert.Contains("pin", ((string?)why["item"]!["why"])?.ToLowerInvariant());

        Assert.Equal("unknown_pack", ai.Refused("pin", new { app = "nope", device = "galleon-100-sd", kind = "key", x = 0, y = 0, item = verb.Id }).Code);
        Assert.Equal("invalid_slot", ai.Refused("pin", new { app = Vs, device = "galleon-100-sd", kind = "key", x = 3, y = 0, item = verb.Id }).Code);
        Assert.Equal("invalid_slot", ai.Refused("pin", new { app = Vs, device = "stream-deck-xl", kind = "dial", x = 0, y = 0, item = verb.Id }).Code);
        Assert.Equal("unknown_item", ai.Refused("pin", new { app = Vs, device = "galleon-100-sd", kind = "key", x = 0, y = 0, item = "no.such.verb" }).Code);
        Assert.Equal("unknown_item", ai.Refused("pin", new { app = Vs, device = "galleon-100-sd", kind = "dial", x = 0, y = 0, item = verb.Id }).Code, "a verb is not a dial control");
        Assert.Equal("unknown_device", ai.Refused("pin", new { app = Vs, device = "toaster", kind = "key", x = 0, y = 0, item = verb.Id }).Code);

        ai.Call("pin", new { app = Vs, device = TestDevices.Galleon.Id, kind = "key", x = 2, y = 1, unpin = true });
        Assert.Empty(ai.Rig.Engine.Preferences.For(Vs).Pins);
        Assert.Equal("nothing_pinned", ai.Refused("pin", new { app = Vs, device = "galleon-100-sd", kind = "key", x = 2, y = 1, unpin = true }).Code);
        ai.Call("undo");
        Assert.Single(ai.Rig.Engine.Preferences.For(Vs).Pins);

        var none = ai.Call("explain", new { deviceId = TestDevices.Galleon.Id, kind = "dial", x = 0, y = 0 });
        Assert.False((bool)none["smart"]!, "no Smart Dial placed there");
        Assert.Contains("pinned", (string?)none["why"]);
    }

    [Test]
    public async Task List_answers_packs_contexts_verbs_controls_and_devices()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        var packs = ai.Call("list", new { what = "packs" })["packs"]!.AsArray();
        Assert.True(packs.Count >= 15);
        Assert.True(packs.Any(p => (string?)p!["id"] == Vs));
        Assert.True(ai.Call("list", new { what = "contexts", pack = Vs })["contexts"]!.AsArray().Count >= 1);
        var verbs = ai.Call("list", new { what = "verbs", pack = Vs })["verbs"]!.AsArray();
        Assert.Equal(TestPacks.Get(Vs).Verbs.Count, verbs.Count);
        Assert.NotNull(verbs[0]!["binding"]);
        Assert.True(ai.Call("list", new { what = "controls", pack = "windows-shell" })["controls"]!.AsArray().Count > 0);
        var devices = ai.Call("list", new { what = "devices" });
        Assert.Equal(1, devices["devices"]!.AsArray().Count);
        Assert.Equal(12, (int)devices["devices"]![0]!["smartKeys"]!);
        Assert.True((bool)devices["devices"]![0]!["canApprove"]!);
        Assert.Equal(7, devices["kinds"]!.AsArray().Count);
        Assert.Equal("invalid_argument", ai.Refused("list", new { what = "secrets" }).Code);
    }

    [Test]
    public async Task Overrides_are_validated_per_item_written_to_the_user_folder_reloaded_and_undoable()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        var pack = TestPacks.Get(Vs);
        var verb = pack.Verbs.First(v => v.Binding is ChordBinding);
        var r = ai.Call("override", new { pack = Vs, items = new[] { new { type = "verb", id = verb.Id, set = new Dictionary<string, object> { ["label"] = "MY KEY", ["binding"] = new { kind = "chord", chord = "Ctrl+Alt+F12" } } } } });
        Assert.True((bool)r["written"]!);
        var file = Path.Combine(ai.UserPacks, Vs + ".ai.json");
        Assert.True(File.Exists(file));
        var v2 = ai.Library.Find(Vs)!.FindVerb(verb.Id)!;
        Assert.Equal("MY KEY", v2.Label);
        // Decision 2: the binding is only a proposal: the old key still runs until the user approves it.
        Assert.Equal(verb.Binding.Describe(), v2.Binding.Describe());
        Assert.Equal("Ctrl+Alt+F12", ((ChordBinding)v2.PendingBinding!).Chord.ToString());
        Assert.Equal(SmartOps.PendingStatus, (string?)r["pending"]![0]!["status"]);
        Assert.Equal(0, ai.Library.Status.First(s => s.Id == Vs).Errors - TestPacks.Library.Status.First(s => s.Id == Vs).Errors);

        // Refused, and nothing written: a text binding, a module binding, loosening safety, an unknown field, a bad chord.
        var text = File.ReadAllText(file);
        object Item(Dictionary<string, object> set) => new { pack = Vs, items = new[] { new { type = "verb", id = verb.Id, set } } };
        Assert.Equal("not_allowed", ai.Refused("override", Item(new() { ["binding"] = new { kind = "text", text = "hello" } })).Code);
        Assert.Equal("not_allowed", ai.Refused("override", Item(new() { ["binding"] = new { kind = "module", verb = "windows.power.shutdown" } })).Code);
        Assert.Equal("not_allowed", ai.Refused("override", Item(new() { ["appAction"] = "x" })).Code);
        Assert.Equal("invalid_chord", ai.Refused("override", Item(new() { ["binding"] = new { kind = "chord", chord = "Ctrl+Nope" } })).Code);
        Assert.Equal("invalid_argument", ai.Refused("override", Item(new() { ["label"] = "A LABEL THAT IS FAR TOO LONG" })).Code);
        var confirmVerb = TestPacks.All.SelectMany(p => p.Verbs.Select(v => (p, v))).First(x => x.v.Safety == Safety.Confirm);
        Assert.Equal("not_allowed", ai.Refused("override", new { pack = confirmVerb.p.Id, items = new[] { new { type = "verb", id = confirmVerb.v.Id, set = new { safety = "safe" } } } }).Code, "safety only gets stricter");
        Assert.Equal(text, File.ReadAllText(file));

        // A dry run validates without writing; undo restores (deletes the file it created) and reloads.
        var dry = ai.Call("override", new { pack = Vs, items = new[] { new { type = "verb", id = verb.Id, set = new { priority = 99 } } }, dryRun = true });
        Assert.True((bool)dry["valid"]!);
        Assert.Equal(text, File.ReadAllText(file));
        ai.Call("undo");
        Assert.False(File.Exists(file), "undo removed the override file it created");
        Assert.Equal(verb.Label, ai.Library.Find(Vs)!.FindVerb(verb.Id)!.Label);
        Assert.Null(ai.Library.Find(Vs)!.FindVerb(verb.Id)!.PendingBinding, "the proposal went with it");
    }

    [Test]
    public async Task Safe_mode_never_writes_override_files_but_dry_runs_work()
    {
        await using var ai = new AiRig(safeMode: true);
        await ai.PairAsync(await ai.GalleonAsync());
        var verb = TestPacks.Get(Vs).Verbs[0];
        object Args(bool dry) => new { pack = Vs, items = new[] { new { type = "verb", id = verb.Id, set = new { label = "SAFE" } } }, dryRun = dry };
        Assert.True((bool)ai.Call("override", Args(true))["valid"]!);
        Assert.Equal("safe_mode", ai.Refused("override", Args(false)).Code);
        Assert.False(Directory.Exists(ai.UserPacks));
    }

    [Test]
    public async Task Every_change_is_audited_without_secrets()
    {
        await using var ai = new AiRig();
        await ai.PairAsync(await ai.GalleonAsync());
        ai.Call("prefs.set", new { patch = new { bigIcons = true } });
        ai.Call("undo");
        var lines = File.ReadAllLines(Path.Combine(ai.Dir, "audit.jsonl")).Select(l => JsonNode.Parse(l)!).ToList();
        var kinds = lines.Select(l => (string?)l["kind"]).ToList();
        Assert.True(kinds.Contains("pair") && kinds.Contains("prefs.set") && kinds.Contains("undo"), string.Join(",", kinds));
        Assert.True(lines.All(l => l["at"] is not null));
        Assert.Equal("Test Assistant", (string?)lines.First(l => (string?)l["kind"] == "prefs.set")["client"]);
        Assert.Equal(lines.Count, ai.Log.RecentAudit(200).Count);
    }
}

/// <summary>The real named-pipe endpoint, a real pipe client (framing by hand), and the real operations.</summary>
public class SmartPipeTests
{
    private sealed class PipeClient : IAsyncDisposable
    {
        private readonly NamedPipeClientStream _pipe;
        private int _id;

        private PipeClient(NamedPipeClientStream pipe) => _pipe = pipe;

        public static async Task<PipeClient> ConnectAsync(string pipeName, string token, string client = "Test Assistant", int v = 1)
        {
            var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await pipe.ConnectAsync(2000);
            var c = new PipeClient(pipe);
            await c.WriteAsync(new JsonObject { ["v"] = v, ["token"] = token, ["client"] = client });
            return c;
        }

        public async Task WriteAsync(JsonNode frame)
        {
            var bytes = PipeFraming.Encode(frame);
            await _pipe.WriteAsync(bytes);
            await _pipe.FlushAsync();
        }

        public async Task<JsonNode?> ReadAsync(int timeoutMs = 5000)
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            var head = new byte[4];
            if (!await FillAsync(head, cts.Token)) return null;
            var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(head)];
            if (!await FillAsync(body, cts.Token)) return null;
            return JsonNode.Parse(Encoding.UTF8.GetString(body));
        }

        private async Task<bool> FillAsync(byte[] buf, CancellationToken ct)
        {
            var at = 0;
            while (at < buf.Length)
            {
                var n = await _pipe.ReadAsync(buf.AsMemory(at), ct);
                if (n == 0) return false;
                at += n;
            }
            return true;
        }

        public async Task<JsonNode> CallAsync(string op, object? args = null)
        {
            var id = ++_id;
            await WriteAsync(new JsonObject { ["id"] = id, ["op"] = op, ["args"] = args is null ? null : ActionJson.ToNode(args) });
            var r = await ReadAsync() ?? throw new AssertException("no answer");
            Assert.Equal(id, (int)r["id"]!);
            return r;
        }

        public ValueTask DisposeAsync() => _pipe.DisposeAsync();
    }

    private static (string Pipe, string Token) Discovery(string file)
    {
        var d = DiscoveryFile.Read(file) ?? throw new AssertException("no discovery file");
        return ((string)d["pipe"]!, (string)d["token"]!);
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task The_pipe_exists_only_while_allowed_checks_the_token_and_serves_the_operations()
    {
        await using var ai = new AiRig();
        var key = await ai.GalleonAsync();
        var discovery = Path.Combine(ai.Dir, "modules", "smart", "ingress.json");
        await using var channel = new SmartControlChannel(ai.Ops, ai.Pairing, ai.Log, ai.Rig.Time, discovery);
        Assert.False(File.Exists(discovery), "off by default: no file, no pipe");

        await channel.SetEnabledAsync(true);
        var (pipe, token) = Discovery(discovery);
        Assert.True(pipe.StartsWith("prism-control-smart-", StringComparison.Ordinal) && pipe.Length == "prism-control-smart-".Length + 32);
        Assert.Equal(64, token.Length);

        // A wrong token is dropped unseen.
        await using (var bad = await PipeClient.ConnectAsync(pipe, new string('0', 64)))
        {
            await bad.WriteAsync(new JsonObject { ["id"] = 1, ["op"] = "status" });
            Assert.Null(await bad.ReadAsync(3000));
        }
        Assert.True(channel.RejectedClients >= 1);

        await using (var c = await PipeClient.ConnectAsync(pipe, token))
        {
            var st = await c.CallAsync("status");
            Assert.True((bool)st["ok"]!);
            Assert.True((bool)st["result"]!["allowAi"]!);
            Assert.False((bool)st["result"]!["paired"]!);
            Assert.Equal("not_paired", (string?)(await c.CallAsync("prefs.get"))["error"]!["code"]);
            var pair = await c.CallAsync("pair");
            var code = (string)pair["result"]!["code"]!;
            // An unpaired status says a prompt waits, never its code or id (B LOW).
            var waiting = (await c.CallAsync("status"))["result"]!;
            Assert.True((bool)waiting["pairingPending"]!);
            Assert.DoesNotContain(code, waiting.ToJsonString());
            // The user holds the glowing key.
            await key.AdvanceAsync(TimeSpan.FromMilliseconds(500));
            await key.KeyDownAsync();
            await key.AdvanceAsync(TimeSpan.FromMilliseconds(1600));
            await key.KeyUpAsync();
            var approved = (await c.CallAsync("pair", new { pairingId = (string)pair["result"]!["pairingId"]! }))["result"]!;
            Assert.Equal("approved", (string?)approved["status"]);
            var secret = (string)approved["pairingSecret"]!;
            Assert.Equal("not_paired", (string?)(await c.CallAsync("prefs.set", new { patch = new { labelSize = "small" } }))["error"]!["code"], "no secret, no service (B3)");
            var set = await c.CallAsync("prefs.set", new { patch = new { labelSize = "small" }, pairingSecret = secret });
            Assert.True((bool)set["ok"]!, set.ToJsonString());
            Assert.Equal("small", ai.Rig.Engine.Preferences.LabelSize);
            Assert.True((bool)(await c.CallAsync("undo", new { pairingSecret = secret }))["ok"]!);
            Assert.Equal("normal", ai.Rig.Engine.Preferences.LabelSize);
            Assert.Equal("unknown_op", (string?)(await c.CallAsync("format c:"))["error"]!["code"]);
            await c.WriteAsync(new JsonObject { ["nope"] = true });
            Assert.Equal("bad_request", (string?)(await c.ReadAsync())!["error"]!["code"]);
        }

        // Audit lines never carry the token, the pipe name or the pairing secret.
        var audit = File.ReadAllText(Path.Combine(ai.Dir, "audit.jsonl"));
        Assert.DoesNotContain(token, audit);
        Assert.DoesNotContain(pipe, audit);
        Assert.DoesNotContain("pairingSecret", audit);

        // Switching "Allow AI preferences" off closes the pipe, deletes the file and revokes the pairing.
        ai.AllowAi = false;
        await channel.SetEnabledAsync(false);
        Assert.False(File.Exists(discovery));
        Assert.False(ai.Pairing.IsPaired);
        await Assert.ThrowsAsync<TimeoutException>(async () =>
        {
            await using var gone = new NamedPipeClientStream(".", pipe, PipeDirection.InOut, PipeOptions.CurrentUserOnly);
            await gone.ConnectAsync(300);
        });
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Requests_are_rate_limited_and_a_wrong_api_version_is_refused()
    {
        await using var ai = new AiRig();
        await ai.GalleonAsync();
        var discovery = Path.Combine(ai.Dir, "ingress.json");
        await using var channel = new SmartControlChannel(ai.Ops, ai.Pairing, ai.Log, ai.Rig.Time, discovery);
        await channel.SetEnabledAsync(true);
        var (pipe, token) = Discovery(discovery);
        await using (var c = await PipeClient.ConnectAsync(pipe, token))
        {
            var limited = 0;
            for (var i = 0; i < 45; i++)
                if ((string?)(await c.CallAsync("status"))["error"]?["code"] == "rate_limited") limited++;
            Assert.Equal(45 - SmartControlChannel.RequestBurst, limited, "the clock never moved: the burst, then rate_limited");
        }
        await using (var old = await PipeClient.ConnectAsync(pipe, token, v: 2))
        {
            var r = await old.ReadAsync();
            Assert.Equal("bad_version", (string?)r!["error"]!["code"]);
        }
    }
}
