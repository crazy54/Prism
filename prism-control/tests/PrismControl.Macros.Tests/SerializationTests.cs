using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

public class SerializationTests
{
    public static MacroScript AllSteps() => MacroScript.Of(
        new ChordStep("Ctrl+Shift+T") { HoldMs = 30, ScanMode = true },
        new TextStep("Hello, The Example Ensemble 😀\nline two") { CharDelayMs = 5 },
        new MediaKeyStep(MediaKey.VolumeDown),
        new LaunchStep { Target = @"C:\Tools\Example\example.exe", Arguments = "--profile demo", WorkingDirectory = @"C:\Tools\Example", FocusIfRunning = true },
        new OpenUrlStep("https://example.com/docs?q=1"),
        new DelayStep(1500));

    [Test]
    public void Every_step_type_round_trips_through_json_text()
    {
        var json = AllSteps().ToJson().ToJsonString();
        var back = MacroScript.FromJson(JsonNode.Parse(json));
        Assert.Equal(6, back.Steps.Count);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(json), back.ToJson()), "second write differs:\n" + json + "\n" + back.ToJson().ToJsonString());
        Assert.True(back.Steps[0] is ChordStep { Keys: "Ctrl+Shift+T", HoldMs: 30, ScanMode: true });
        Assert.True(back.Steps[1] is TextStep { CharDelayMs: 5 } t && t.Text == "Hello, The Example Ensemble 😀\nline two");
        Assert.True(back.Steps[2] is MediaKeyStep { Key: MediaKey.VolumeDown });
        Assert.True(back.Steps[3] is LaunchStep { FocusIfRunning: true, Arguments: "--profile demo" });
        Assert.True(back.Steps[4] is OpenUrlStep { Url: "https://example.com/docs?q=1" });
        Assert.True(back.Steps[5] is DelayStep { Ms: 1500 });
        Assert.Empty(back.Validate());
    }

    [Test]
    public void Format_is_versioned_with_the_type_first()
    {
        var o = AllSteps().ToJson();
        Assert.Equal(1, o["version"]!.GetValue<int>());
        Assert.Equal(MacroScript.CurrentVersion, o["version"]!.GetValue<int>());
        var first = (JsonObject)o["steps"]![0]!;
        Assert.Equal("type", first.First().Key);
        Assert.Equal("chord", first["type"]!.GetValue<string>());
        Assert.Equal("Ctrl+Shift+T", first["keys"]!.GetValue<string>());
        Assert.Equal("volumeDown", o["steps"]![2]!["key"]!.GetValue<string>(), "enums are camelCase strings");
        Assert.Null(first["chord"], "computed properties are not written");
    }

    [Test]
    public void Reads_leniently()
    {
        // A bare array is version 1; numbers and bools may be strings (PI inputs send strings).
        var s = MacroScript.FromJson(JsonNode.Parse("""[{"type":"delay","ms":"250"},{"type":"chord","keys":"Alt+Tab","scanMode":"on","holdMs":"20"}]"""));
        Assert.Equal(1, s.Version);
        Assert.True(s.Steps[0] is DelayStep { Ms: 250 });
        Assert.True(s.Steps[1] is ChordStep { ScanMode: true, HoldMs: 20 });
        Assert.False(MacroScript.FromJson(null).HasSteps);
        Assert.False(MacroScript.FromJson(JsonValue.Create(42)).HasSteps);
        // A macro stored as a JSON string.
        Assert.Single(MacroScript.FromJson(JsonValue.Create("""{"version":1,"steps":[{"type":"delay","ms":5}]}""")).Steps);
    }

    [Test]
    public void Unknown_step_types_and_properties_survive_a_save()
    {
        const string json = """{"version":1,"author":"The Example Ensemble","steps":[{"type":"chord","keys":"Ctrl+C","futureFlag":true},{"type":"mouse-move","x":10,"y":20}]}""";
        var s = MacroScript.FromJson(JsonNode.Parse(json));
        Assert.True(s.Steps[1] is UnknownStep { TypeName: "mouse-move" });
        var saved = s.ToJson();
        Assert.Equal("The Example Ensemble", saved["author"]?.GetValue<string>(), "unknown top-level property kept");
        Assert.Equal(true, saved["steps"]![0]!["futureFlag"]?.GetValue<bool>(), "unknown property of a known step kept");
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"type":"mouse-move","x":10,"y":20}"""), saved["steps"]![1]), "unknown step kept exactly");
        var again = MacroScript.FromJson(JsonNode.Parse(saved.ToJsonString())).ToJson();
        Assert.True(JsonNode.DeepEquals(saved, again), "a second save changes nothing");
        Assert.Contains("doesn't know", Assert.Single(s.Validate()));
    }

    [Test]
    public void A_newer_format_or_a_bad_step_does_not_run()
    {
        var newer = MacroScript.FromJson(JsonNode.Parse("""{"version":2,"steps":[{"type":"delay","ms":5}]}"""));
        Assert.Contains("newer version", newer.Validate().First());
        var bad = MacroScript.FromJson(JsonNode.Parse("""{"version":1,"steps":[{"type":"delay","ms":"soon"},{"note":"no type"}]}"""));
        Assert.True(bad.Steps.All(x => x is UnknownStep));
        Assert.Contains("could not be read", bad.Validate()[0]);
        Assert.Contains("no type", bad.Validate()[1]);
    }

    [Test]
    public void Action_settings_round_trip_with_the_core_options()
    {
        var settings = new MacroKeySettings { Label = "Ship it", Macro = AllSteps(), LongMacro = MacroScript.Of(new DelayStep(10)) };
        var node = JsonSerializer.SerializeToNode(settings, ActionJson.Options)!;
        Assert.Equal(1, node["macro"]!["version"]!.GetValue<int>());
        var back = node.Deserialize<MacroKeySettings>(ActionJson.Options)!;
        Assert.Equal("Ship it", back.Label);
        Assert.True(JsonNode.DeepEquals(settings.Macro.ToJson(), back.Macro.ToJson()));
        Assert.Single(back.LongMacro.Steps);

        var dial = new MacroDialSettings { Right = new ChordStep("Ctrl+Plus"), Left = null, Push = MacroScript.Of(new MediaKeyStep(MediaKey.Mute)), TicksPerStep = 3 };
        var dn = JsonSerializer.SerializeToNode(dial, ActionJson.Options)!;
        Assert.Equal("chord", dn["right"]!["type"]!.GetValue<string>());
        Assert.Null(dn["left"]);
        var db = dn.Deserialize<MacroDialSettings>(ActionJson.Options)!;
        Assert.True(db.Right is ChordStep { Keys: "Ctrl+Plus" });
        Assert.Null(db.Left);
        Assert.Equal(3, db.TicksPerStep);
    }

    [Test]
    public void A_broken_step_does_not_wipe_the_other_settings()
    {
        var raw = JsonNode.Parse("""{"label":"Keep me","macro":{"version":1,"steps":[{"type":"delay","ms":"later"}]},"longMacro":null}""")!;
        var s = raw.Deserialize<MacroKeySettings>(ActionJson.Options)!;
        Assert.Equal("Keep me", s.Label);
        Assert.True(s.Macro.Steps[0] is UnknownStep);
        Assert.False(s.LongMacro.HasSteps, "null reads as an empty macro");
    }

    [Test]
    public void Settings_hold_no_secrets_only_plain_fields()
    {
        // Settings travel with exported profiles: the macro settings classes only have the documented plain fields.
        string[] allowed = ["Label", "Macro", "LongMacro", "Chord", "ScanMode", "Text", "CharDelayMs", "Target", "Arguments", "WorkingDirectory", "FocusIfRunning", "Key", "Right", "Left", "Push", "TicksPerStep"];
        foreach (var t in new[] { typeof(MacroKeySettings), typeof(HotkeySettings), typeof(TypeTextSettings), typeof(LaunchSettings), typeof(MediaKeySettings), typeof(MacroDialSettings) })
            foreach (var p in t.GetProperties())
                Assert.True(allowed.Contains(p.Name), $"{t.Name}.{p.Name} is not a reviewed setting");
    }
}

/// <summary>A step type defined outside the engine: proves "adding a step type is one class".</summary>
[MacroStep("test-beep", "Beep (test)", Order = 99)]
public sealed class BeepStep : MacroStep
{
    [StepField("Times", Min = 1, Max = 3)]
    public int Times { get; set; } = 1;

    public override string Describe() => $"Beep ×{Times}";

    public override IEnumerable<string> Validate()
    {
        if (Times is < 1 or > 3) yield return "Beep 1-3 times.";
    }

    public override async Task ExecuteAsync(MacroContext ctx)
    {
        for (var i = 0; i < Times; i++) await ctx.SendAsync(InputBuilder.Tap(KeyNames.Find("F24")!, ctx.ScanCodes));
    }
}

public class RegistryTests
{
    [Test]
    public void Discovers_the_six_step_types_in_editor_order()
    {
        var ids = MacroStepRegistry.Default.Types.Select(t => t.Id).ToList();
        Assert.Equal("chord,text,media,launch,url,delay", string.Join(",", ids));
    }

    [Test]
    public void Fields_describe_the_editor()
    {
        var r = MacroStepRegistry.Default;
        var chord = r.Find("chord")!.Fields;
        Assert.Equal("keys:chord,holdMs:number,scanMode:checkbox", string.Join(",", chord.Select(f => f.Name + ":" + f.Kind)));
        var media = Assert.Single(r.Find("media")!.Fields);
        Assert.Equal("select", media.Kind);
        Assert.Equal(7, media.Options!.Count);
        Assert.Equal(("playPause", "Play / pause"), media.Options[0]);
        var delay = Assert.Single(r.Find("delay")!.Fields);
        Assert.Equal(0d, delay.Min);
        Assert.Equal(60000d, delay.Max);
        Assert.Equal("textarea", r.Find("text")!.Fields[0].Kind);
    }

    [Test]
    public void Every_default_step_round_trips()
    {
        foreach (var t in MacroStepRegistry.Default.Types)
        {
            var json = MacroJson.WriteStep(t.Create());
            Assert.Equal(t.Id, json["type"]!.GetValue<string>());
            var back = MacroJson.ReadStep(json);
            Assert.Equal(t.Type, back.GetType(), t.Id);
            Assert.True(JsonNode.DeepEquals(json, MacroJson.WriteStep(back)), t.Id);
        }
    }

    [Test]
    public async Task A_new_step_type_is_one_class()
    {
        var registry = MacroStepRegistry.Default.With(typeof(BeepStep));
        Assert.Equal("test-beep", registry.Types[^1].Id);
        Assert.Equal("times:number", string.Join(",", registry.Find("test-beep")!.Fields.Select(f => f.Name + ":" + f.Kind)));
        var script = MacroJson.ReadScript(JsonNode.Parse("""{"version":1,"steps":[{"type":"test-beep","times":2}]}"""), registry);
        Assert.True(script.Steps[0] is BeepStep { Times: 2 });
        Assert.Equal("""{"type":"test-beep","times":2}""", MacroJson.WriteStep(script.Steps[0], registry).ToJsonString());
        var rig = new TestRig(registry);
        var r = await rig.Engine.RunAsync(script);
        Assert.Equal(MacroRunStatus.Completed, r.Status);
        Assert.Equal(2, rig.Sink.Count);
        Assert.Throws<InvalidOperationException>(() => MacroStepRegistry.Default.With(typeof(UnknownStep)));
    }

    [Test]
    public void Catalog_lists_types_keys_presets_and_limits()
    {
        var c = MacroPi.Catalog();
        Assert.Equal(6, c["stepTypes"]!.AsArray().Count);
        Assert.Equal("chord", c["stepTypes"]![0]!["defaults"]!["type"]!.GetValue<string>());
        Assert.True(c["keys"]!.AsArray().Count > 100);
        Assert.Equal("Ctrl", c["modifiers"]![0]!.GetValue<string>());
        Assert.Equal(7, c["mediaKeys"]!.AsArray().Count);
        Assert.True(c["dialPresets"]!.AsArray().Count >= 6);
        Assert.Equal(100, c["limits"]!["maxSteps"]!.GetValue<int>());
        foreach (var p in DialPresets.All)
        {
            Assert.Empty(p.Right.Validate(), p.Id);
            Assert.Empty(p.Left.Validate(), p.Id);
            Assert.Empty(p.Push.Validate(), p.Id);
        }
    }

    [Test]
    public void Describe_reports_summaries_and_problems()
    {
        var req = new JsonObject
        {
            ["scripts"] = new JsonObject { ["macro"] = MacroScript.Of(new ChordStep("Ctrl+C"), new DelayStep(250), new ChordStep("Ctrl+Bogus")).ToJson() },
            ["steps"] = new JsonObject { ["right"] = MacroJson.WriteStep(new ChordStep("Ctrl+Plus")), ["left"] = null },
            ["chords"] = new JsonObject { ["chord"] = "shift+ctrl+t", ["bad"] = "Win+L" },
        };
        var r = MacroPi.Describe(req);
        var m = r["scripts"]!["macro"]!;
        Assert.Equal("Ctrl+C", m["steps"]![0]!["summary"]!.GetValue<string>());
        Assert.Equal("Wait 250 ms", m["steps"]![1]!["summary"]!.GetValue<string>());
        Assert.Contains("Unknown key", m["steps"]![2]!["problems"]![0]!.GetValue<string>());
        Assert.Contains("Step 3 (Key chord)", m["problems"]![0]!.GetValue<string>());
        Assert.Equal("Ctrl+Plus", r["steps"]!["right"]!["summary"]!.GetValue<string>());
        Assert.Null(r["steps"]!["left"]);
        Assert.Equal("Ctrl+Shift+T", r["chords"]!["chord"]!["canonical"]!.GetValue<string>());
        Assert.Contains("Win+L", r["chords"]!["bad"]!["problems"]![0]!.GetValue<string>());
    }
}
