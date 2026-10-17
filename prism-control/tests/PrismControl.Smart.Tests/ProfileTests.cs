using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Smart.Profiles;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>The repository root (tests run from prism-control/; artifacts may live elsewhere).</summary>
public static class Repo
{
    public static string? Root
    {
        get
        {
            foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            {
                for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                    if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
            }
            return null;
        }
    }

    public static string RequireRoot() => Root ?? throw new SkipException("run from prism-control/ (the repository root was not found)");
}

/// <summary>
/// SD2: the one-profile generator. Every device's profile validates, its structure matches the known-good profiles (the
/// hardware lab's Galleon / Stream Deck + profiles that were installed and switched on the real devices, and Prism Deck's
/// shipped exports for the rest), pins use the real Audio action UUIDs, and the setup parser refuses bad input.
/// </summary>
public class ProfileTests
{
    private static readonly Regex UuidRx = new("[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}");

    private static JsonObject KnownGood()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "Fixtures", "known-good", "known-good.json");
        return (JsonObject)JsonNode.Parse(File.ReadAllText(file))!;
    }

    private static Dictionary<string, byte[]?> Unzip(GeneratedProfile p) => ProfileChecker.Read(p.Zip);

    private static JsonObject PageOf(GeneratedProfile p, string id) =>
        (JsonObject)JsonNode.Parse(Unzip(p)[$"Profiles/{p.ProfileId}.sdProfile/Profiles/{id.ToUpperInvariant()}/manifest.json"]!)!;

    private static IEnumerable<string> Keys(JsonNode? o) => o is JsonObject j ? j.Select(kv => kv.Key).Order(StringComparer.Ordinal) : [];

    [Test]
    public void Every_device_gets_a_valid_profile_with_the_default_pins_and_smart_slots_everywhere_else()
    {
        Assert.Equal(7, ProfileDevices.All.Count);
        foreach (var d in ProfileDevices.All)
        {
            var p = ProfileGenerator.Build(ProfileSetup.Default(d));
            var problems = ProfileChecker.Check(p.Zip);
            Assert.Empty(problems, $"{d.Name}: {string.Join("; ", problems)}");
            Assert.Equal($"Prism Smart · {d.Name}", (string?)p.Manifest["Name"]);
            Assert.Equal(d.Model, (string?)p.Package["DeviceModel"]);
            var page = PageOf(p, p.PageId);
            var controllers = (JsonArray)page["Controllers"]!;
            var keys = (JsonObject)controllers.First(c => (string?)c!["Type"] == "Keypad")!["Actions"]!;
            Assert.Equal(d.KeyCount, keys.Count, $"{d.Name}: every key is filled");
            var mic = keys[$"0,{d.Rows - 1}"]!;
            Assert.Equal("com.jeremyfhall.prismcontrol.audio.mic-mute", (string?)mic["UUID"], $"{d.Name}: mic mute bottom-left");
            Assert.Equal(d.KeyCount - ProfileSetup.Default(d).Pins.Count(x => x.Slot.IsKey), keys.Count(kv => (string?)kv.Value!["UUID"] == PinCatalog.SmartKeyUuid));
            if (d.HasDials)
            {
                var dials = (JsonObject)controllers.First(c => (string?)c!["Type"] == "Encoder")!["Actions"]!;
                Assert.Equal(d.Dials * d.Layers, dials.Count, $"{d.Name}: every encoder slot is filled");
                Assert.Equal("com.jeremyfhall.prismcontrol.audio.volume", (string?)dials["0,0"]!["UUID"], $"{d.Name}: headphone volume on the left dial");
                Assert.Equal(d.Dials * d.Layers - 1, dials.Count(kv => (string?)kv.Value!["UUID"] == PinCatalog.SmartDialUuid));
            }
            else Assert.False(controllers.Any(c => (string?)c!["Type"] == "Encoder"), $"{d.Name}: no encoder controller");
        }
    }

    [Test]
    public void Generated_profiles_match_the_known_good_structure_device_by_device()
    {
        var known = KnownGood();
        foreach (var d in ProfileDevices.All)
        {
            var k = known[d.Kind] as JsonObject ?? throw new AssertException("no known-good profile for " + d.Kind);
            var p = ProfileGenerator.Build(ProfileSetup.Default(d));
            var who = $"{d.Name} vs {(string?)k["source"]}";

            // ZIP layout: the same normalized entry set (directories included).
            var mine = p.Entries.Select(e => UuidRx.Replace(e, "<UUID>")).ToHashSet(StringComparer.Ordinal);
            var theirs = ((JsonArray)k["entries"]!).Select(e => (string)e!).ToHashSet(StringComparer.Ordinal);
            Assert.True(mine.SetEquals(theirs), $"{who}: entries {string.Join(",", mine.Order())} vs {string.Join(",", theirs.Order())}");

            // package.json: same keys; same model, format, OS type.
            var kp = (JsonObject)k["package"]!;
            Assert.Equal(string.Join(",", Keys(kp)), string.Join(",", Keys(p.Package)), who + ": package keys");
            foreach (var f in new[] { "DeviceModel", "FormatVersion", "OSType" })
                Assert.Equal(kp[f]!.ToJsonString(), p.Package[f]!.ToJsonString(), $"{who}: package {f}");
            Assert.Null(p.Package["DeviceSettings"], who + ": DeviceSettings null like the app's exports");

            // Top manifest: same keys, Device keys, Pages keys, the nil Current page.
            var km = (JsonObject)k["manifest"]!;
            Assert.Equal(string.Join(",", Keys(km)), string.Join(",", Keys(p.Manifest)), who + ": manifest keys");
            Assert.Equal(string.Join(",", Keys(km["Device"])), string.Join(",", Keys(p.Manifest["Device"])), who + ": Device keys");
            Assert.Equal(string.Join(",", Keys(km["Pages"])), string.Join(",", Keys(p.Manifest["Pages"])), who + ": Pages keys");
            Assert.Equal((string?)km["Pages"]!["Current"], (string?)p.Manifest["Pages"]!["Current"], who + ": Pages.Current");
            Assert.Equal((string?)km["Version"], (string?)p.Manifest["Version"]);

            // Default page: byte-identical shape (controller types, null actions, empty Name/Icon).
            Assert.Equal(k["defaultPage"]!.ToJsonString(), PageOf(p, p.DefaultPageId).ToJsonString(), who + ": Default page");

            // First page: same page keys; each controller type we write exists there with the same keys (Routers on
            // the Galleon, with the same map); every action object has the known-good key set; plugin actions carry
            // States [{}] like the lab profile (no images).
            var kpg = (JsonObject)k["firstPage"]!;
            var page = PageOf(p, p.PageId);
            Assert.Equal(string.Join(",", Keys(kpg)), string.Join(",", Keys(page)), who + ": page keys");
            var kc = ((JsonArray)kpg["Controllers"]!).OfType<JsonObject>().ToDictionary(c => (string)c["Type"]!);
            foreach (var c in ((JsonArray)page["Controllers"]!).OfType<JsonObject>())
            {
                var type = (string)c["Type"]!;
                Assert.True(kc.TryGetValue(type, out var other), $"{who}: the known-good page has no {type} controller");
                Assert.Equal(string.Join(",", Keys(other)), string.Join(",", Keys(c)), $"{who}: {type} controller keys");
                if (c["Routers"] is { } routers) Assert.Equal(other!["Routers"]!.ToJsonString(), routers.ToJsonString(), who + ": Routers");
                var knownActionKeys = ((JsonObject)other!["Actions"]!).Select(kv => (JsonObject)kv.Value!)
                    .Where(a => a["Encoder"] is null).Select(a => string.Join(",", Keys(a))).ToHashSet();
                foreach (var (coord, a) in (JsonObject)c["Actions"]!)
                {
                    Assert.True(knownActionKeys.Contains(string.Join(",", Keys(a))), $"{who}: action {coord} keys {string.Join(",", Keys(a))}");
                    Assert.Equal("[{}]", a!["States"]!.ToJsonString(), $"{who}: action {coord} States");
                    Assert.Equal(string.Join(",", Keys(((JsonObject)other["Actions"]!).First().Value!["Plugin"])), string.Join(",", Keys(a["Plugin"])));
                }
            }
            if (d.HasDials) Assert.True(page["Controllers"]!.AsArray().Any(c => (string?)c!["Type"] == "Encoder"), who + ": encoders written");
        }
    }

    [Test]
    public void The_galleon_profile_is_keyed_column_row_and_dial_layer_with_both_dials_routed_to_layer_0()
    {
        var p = ProfileGenerator.Build(ProfileSetup.Default(ProfileDevices.Galleon));
        var page = PageOf(p, p.PageId);
        var keys = (JsonObject)page["Controllers"]![0]!["Actions"]!;
        var enc = (JsonObject)page["Controllers"]![1]!;
        Assert.Equal("0,0,0,1,0,2,0,3,1,0,1,1,1,2,1,3,2,0,2,1,2,2,2,3", string.Join(",", keys.Select(kv => kv.Key).Order(StringComparer.Ordinal)));
        Assert.Equal("0,0,0,1,1,0,1,1", string.Join(",", ((JsonObject)enc["Actions"]!).Select(kv => kv.Key).Order(StringComparer.Ordinal)));
        Assert.Equal("{\"0,0\":\"0,0\",\"1,0\":\"1,0\"}", enc["Routers"]!.ToJsonString());
        Assert.Equal(11, p.SmartKeys);
        Assert.Equal(3, p.SmartDials);
    }

    [Test]
    public void Bundled_profiles_are_reproducible_and_their_manifest_entries_follow_the_elgato_schema()
    {
        var a = BundledProfiles.Build("0.1.0.0");
        var b = BundledProfiles.Build("0.1.0.0");
        Assert.Equal(7, a.Count);
        for (var i = 0; i < a.Count; i++) Assert.True(a[i].Zip.AsSpan().SequenceEqual(b[i].Zip), $"{a[i].Name}: byte-for-byte reproducible");
        Assert.Equal(7, a.Select(x => x.ProfileId).Distinct().Count());

        var entries = BundledProfiles.ManifestEntries();
        Assert.Equal(7, entries.Count);
        foreach (var e in entries.OfType<JsonObject>())
        {
            Assert.True((bool)e["DontAutoSwitchWhenInstalled"]!, "never switches the deck by itself");
            Assert.Contains("profiles/prism-smart-", (string?)e["Name"]);
        }
        Assert.Equal("12,7,13,0,2,1,9", string.Join(",", entries.Select(e => (int)e!["DeviceType"]!)));

        // The vendored Elgato manifest schema (tools/PrismControl.Tools/schemas, @elgato/schemas 0.5.2): definitions.Profile.
        var schemaFile = Path.Combine(Repo.RequireRoot(), "tools", "PrismControl.Tools", "schemas", "plugin-manifest.schema.json");
        var profile = (JsonObject)JsonNode.Parse(File.ReadAllText(schemaFile))!["definitions"]!["Profile"]!;
        var props = (JsonObject)profile["properties"]!;
        var required = (profile["required"] as JsonArray)?.Select(r => (string)r!).ToList() ?? [];
        Assert.True(required.Contains("Name") && required.Contains("DeviceType"), "schema requires Name and DeviceType");
        foreach (var e in entries.OfType<JsonObject>())
        {
            foreach (var r in required) Assert.True(e.ContainsKey(r), $"missing {r}");
            foreach (var (key, value) in e)
            {
                Assert.True(props.ContainsKey(key) || profile["additionalProperties"] is not JsonValue ap || ap.GetValue<bool>(), $"{key} is not allowed by the schema");
                var p = props[key] as JsonObject;
                if (p is null) continue;
                var type = (string?)p["type"];
                var ok = type switch
                {
                    "boolean" => value!.GetValueKind() is System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False,
                    "number" or "integer" => value!.GetValueKind() == System.Text.Json.JsonValueKind.Number,
                    "string" => value!.GetValueKind() == System.Text.Json.JsonValueKind.String,
                    _ => true,
                };
                Assert.True(ok, $"{key}: expected {type}");
                if (p["enum"] is JsonArray en) Assert.True(en.Any(x => x!.ToJsonString() == value!.ToJsonString()), $"{key} {value} not in the schema enum");
                if (p["pattern"] is JsonValue pat && value is JsonValue sv && sv.TryGetValue<string>(out var s)) Assert.True(Regex.IsMatch(s, pat.GetValue<string>()), $"{key} pattern");
            }
        }
    }

    [Test]
    public void Checked_in_bundled_profiles_are_current()
    {
        var dir = Path.Combine(Repo.RequireRoot(), "src", "PrismControl.Smart", "plugin", "profiles");
        foreach (var p in BundledProfiles.Build())
        {
            var file = Path.Combine(dir, Path.GetFileName(p.Device.BundledName) + ".streamDeckProfile");
            Assert.True(File.Exists(file), $"{file} is missing: run the Smart tests exe with --write-profiles src/PrismControl.Smart/plugin/profiles");
            var onDisk = ProfileChecker.Read(File.ReadAllBytes(file));
            var fresh = ProfileChecker.Read(p.Zip);
            Assert.Equal(string.Join("|", fresh.Keys.Order(StringComparer.Ordinal)), string.Join("|", onDisk.Keys.Order(StringComparer.Ordinal)), p.Name + ": entries");
            foreach (var (name, data) in fresh)
                if (data is not null) Assert.Equal(System.Text.Encoding.UTF8.GetString(data), System.Text.Encoding.UTF8.GetString(onDisk[name]!), $"{p.Name}: {name} is stale; re-run --write-profiles");
        }
        var manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "profiles.manifest.json")))!;
        Assert.Equal(BundledProfiles.ManifestEntries().ToJsonString(), manifest["Profiles"]!.ToJsonString());
    }

    [Test]
    public void Pinned_actions_use_the_real_uuids_and_controllers_of_their_modules()
    {
        var root = Repo.RequireRoot();
        var attrs = new Dictionary<string, (string Name, string Controllers)>(StringComparer.Ordinal);
        var rx = new Regex("StreamDeckAction\\(\"(?<uuid>[^\"]+)\"(?<body>.*?)\\)\\]", RegexOptions.Singleline);
        foreach (var dir in new[] { "PrismControl.Audio", "PrismControl.Smart" })
            foreach (var f in Directory.GetFiles(Path.Combine(root, "src", dir), "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")))
                foreach (Match m in rx.Matches(File.ReadAllText(f)))
                {
                    var body = m.Groups["body"].Value;
                    var name = Regex.Match(body, "Name = \"([^\"]+)\"").Groups[1].Value;
                    var ctl = Regex.Match(body, @"Controllers = ([A-Za-z.| ]+)").Groups[1].Value;
                    attrs[m.Groups["uuid"].Value] = (name, ctl);
                }
        Assert.True(attrs.Count >= 9, "found the Audio and Smart actions");
        foreach (var a in PinCatalog.All)
        {
            Assert.True(attrs.TryGetValue(a.Uuid, out var at), $"{a.Id}: {a.Uuid} is not a [StreamDeckAction] in the source");
            Assert.Equal(at.Name, a.ActionName, $"{a.Id}: action name");
            Assert.Equal(at.Controllers.Contains("Keypad"), a.Controllers.HasFlag(SlotControllers.Key), $"{a.Id}: keys");
            Assert.Equal(at.Controllers.Contains("Encoder"), a.Controllers.HasFlag(SlotControllers.Dial), $"{a.Id}: dials");
        }
        Assert.Equal(PinCatalog.SmartKeyName, attrs[PinCatalog.SmartKeyUuid].Name);
        Assert.Equal(PinCatalog.SmartDialName, attrs[PinCatalog.SmartDialUuid].Name);
    }

    [Test]
    public void The_setup_parser_validates_every_pin_and_keeps_at_least_one_smart_key()
    {
        var problems = new List<string>();
        var ok = ProfileSetup.Parse(JsonNode.Parse("""
            { "device": "stream-deck-plus", "pins": [ { "slot": "dial:3,0", "action": "volume" }, { "slot": "key:3,1", "action": "mic-mute" },
              { "slot": "key:0,0", "action": "app-volume", "app": "Example Chat.exe" }, { "slot": "key:1,0", "action": "smart" } ] }
            """), problems);
        Assert.Empty(problems);
        Assert.Equal(3, ok!.Pins.Count);
        Assert.Equal(6, ok.SmartKeys.Count);
        var p = ProfileGenerator.Build(ok);
        Assert.Empty(ProfileChecker.Check(p.Zip));
        var page = PageOf(p, p.PageId);
        Assert.Equal("{\"app\":\"Example Chat.exe\"}", page["Controllers"]![0]!["Actions"]!["0,0"]!["Settings"]!.ToJsonString());

        foreach (var (json, expect) in new[]
        {
            ("""{ "device": "toaster" }""", "Unknown device"),
            ("""{ "device": "galleon-100-sd", "pins": [ { "slot": "key:3,0", "action": "mic-mute" } ] }""", "not on the Galleon"),
            ("""{ "device": "galleon-100-sd", "pins": [ { "slot": "dial:0,2", "action": "volume" } ] }""", "not on the Galleon"),
            ("""{ "device": "galleon-100-sd", "pins": [ { "slot": "dial:0,0", "action": "smart-lock" } ] }""", "can't go on a dial"),
            ("""{ "device": "stream-deck-plus", "pins": [ { "slot": "key:0,0", "action": "mixer" } ] }""", "can't go on a key"),
            ("""{ "device": "stream-deck-plus", "pins": [ { "slot": "key:0,0", "action": "mic-mute" }, { "slot": "key:0,0", "action": "volume" } ] }""", "pinned twice"),
            ("""{ "device": "stream-deck-plus", "pins": [ { "slot": "key:0,0", "action": "app-volume", "app": "..\\evil" } ] }""", "needs an app"),
            ("""{ "device": "stream-deck-plus", "pins": [ { "slot": "key 0 0", "action": "volume" } ] }""", "Bad slot"),
            ("""{ "device": "stream-deck-plus", "pins": [ { "slot": "key:0,0", "action": "com.example.other" } ] }""", "Unknown action"),
            ("""{ "device": "stream-deck-mini", "pins": [ { "slot": "key:0,0", "action": "volume" }, { "slot": "key:1,0", "action": "volume" }, { "slot": "key:2,0", "action": "volume" }, { "slot": "key:0,1", "action": "volume" }, { "slot": "key:1,1", "action": "volume" }, { "slot": "key:2,1", "action": "volume" } ] }""", "at least one key"),
        })
        {
            var errs = new List<string>();
            ProfileSetup.Parse(JsonNode.Parse(json), errs);
            Assert.True(errs.Any(e => e.Contains(expect, StringComparison.Ordinal)), $"{json}: expected \"{expect}\", got {string.Join(" | ", errs)}");
        }
    }

    [Test]
    public void The_checker_catches_broken_profiles()
    {
        var good = ProfileGenerator.Build(ProfileSetup.Default(ProfileDevices.Galleon));
        Assert.Empty(ProfileChecker.Check(good.Zip));
        Assert.True(ProfileChecker.Check([1, 2, 3]).Count > 0, "not a zip");

        byte[] Mutate(Func<string, string?, string?> edit)
        {
            using var ms = new MemoryStream();
            using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
                foreach (var (name, data) in ProfileChecker.Read(good.Zip))
                {
                    var text = data is null ? null : System.Text.Encoding.UTF8.GetString(data);
                    var next = edit(name, text);
                    if (next is null && data is not null) continue;
                    var e = zip.CreateEntry(name);
                    if (next is null) continue;
                    using var s = e.Open();
                    s.Write(System.Text.Encoding.UTF8.GetBytes(next));
                }
            return ms.ToArray();
        }

        string page = $"Profiles/{good.ProfileId}.sdProfile/Profiles/{good.PageId.ToUpperInvariant()}/manifest.json";
        void Expect(byte[] zip, string what)
        {
            var problems = ProfileChecker.Check(zip);
            Assert.True(problems.Any(p => p.Contains(what, StringComparison.Ordinal)), $"expected \"{what}\", got {string.Join(" | ", problems)}");
        }
        Expect(Mutate((n, t) => n == page ? t!.Replace("\"2,3\":", "\"7,9\":") : t), "outside the Galleon");
        Expect(Mutate((n, t) => n == page ? t!.Replace("\"States\":[{}]", "\"States\":[{\"Image\":\"Images/x.png\"}]") : t), "state image");
        Expect(Mutate((n, t) => n == page ? t!.Replace("\"Routers\"", "\"Routerz\"") : t), "need Routers");
        Expect(Mutate((n, t) => n == page ? t!.Replace("com.jeremyfhall.prismcontrol.audio.volume", "com.example.unknown") : t), "unknown action");
        Expect(Mutate((n, t) => n == "package.json" ? t!.Replace("\"FormatVersion\":1", "\"FormatVersion\":2") : t), "FormatVersion");
        Expect(Mutate((n, t) => n == "package.json" ? t!.Replace("GRETSCH", "20GBD9901") : t), "Device.Model must equal");
        Expect(Mutate((n, t) => n == page ? null : t), "missing");
        var smartDialOnKey = Mutate((n, t) => n == page ? t!.Replace("\"Name\":\"Smart Key\",", "\"Name\":\"Smart Dial\",").Replace(PinCatalog.SmartKeyUuid + "\"", PinCatalog.SmartDialUuid + "\"") : t);
        Expect(smartDialOnKey, "Smart Dial on a key");
        Expect(Mutate((n, t) => n == page ? t!.Replace("\"Name\":\"Prism Smart\"", "\"Name\":\"Prism Smart\",\"Controllers2\":1").Replace("\"Type\":\"Encoder\"", "\"Type\":\"Neo\"") : t), "unexpected controller");
    }

    [Test]
    public void The_wizard_writes_only_into_its_folder_tells_the_user_to_double_click_and_writes_nothing_in_safe_mode()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-sd2-wizard", Guid.NewGuid().ToString("N"));
        try
        {
            var time = new ManualTimeProvider();
            var setup = ProfileSetup.Default(ProfileDevices.Galleon).ToJson();
            var safe = new ProfileWizard(dir, safeMode: true, time).Create(setup);
            Assert.True(safe.Ok && !safe.Written, safe.Message);
            Assert.False(Directory.Exists(dir), "safe mode writes nothing");

            var w = new ProfileWizard(dir, safeMode: false, time);
            var r = w.Create(setup);
            Assert.True(r.Ok && r.Written, r.Message);
            Assert.Equal(Path.Combine(dir, "Prism Smart - Galleon 100 SD.streamDeckProfile"), r.Path);
            Assert.Contains("Double-click", r.Message);
            Assert.Contains("never installs", r.Message);
            Assert.Empty(ProfileChecker.Check(File.ReadAllBytes(r.Path!)));
            Assert.Equal(1, Directory.GetFiles(dir).Length);

            // A second profile for the same device is a different profile (no id clash when both are imported).
            var again = w.Create(setup);
            Assert.NotEqual(r.Profile!.ProfileId, again.Profile!.ProfileId);

            var bad = w.Create(JsonNode.Parse("""{ "device": "galleon-100-sd", "pins": [ { "slot": "key:9,9", "action": "volume" } ] }"""));
            Assert.False(bad.Ok);
            Assert.True(bad.Problems.Count > 0);

            var desc = System.Text.Json.JsonSerializer.SerializeToNode(w.Describe("stream-deck-plus"))!;
            Assert.Equal("stream-deck-plus", (string?)desc["current"]);
            Assert.Equal(7, desc["devices"]!.AsArray().Count);
            Assert.Equal(PinCatalog.All.Count, desc["actions"]!.AsArray().Count);
            Assert.NotNull(desc["defaults"]!["galleon-100-sd"]);
        }
        finally { try { Directory.Delete(Path.GetDirectoryName(dir)!, true); } catch { } }
    }
}
