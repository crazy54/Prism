using System.Text.Json.Nodes;
using PrismControl.Macros.Engine;

namespace PrismControl.Macros.Actions;

/// <summary>
/// Property-inspector messages shared by the macro actions (pi/macros-editor.html):
/// <list type="bullet">
/// <item><c>macros.catalog</c>: step types with their fields and defaults (the editor is generic: a new step type needs no HTML),
/// key names, modifiers, media keys, dial presets and limits.</item>
/// <item><c>macros.describe</c>: <c>{ scripts: {name: macro}, steps: {name: step}, chords: {name: "Ctrl+T"} }</c> →
/// summaries and problems for each, so the editor shows exactly what the engine will accept.</item>
/// </list>
/// </summary>
internal static class MacroPi
{
    public const string Page = "pi/macros-editor.html";

    public static object? Handle(string type, JsonNode? data) => type switch
    {
        "macros.catalog" => Catalog(),
        "macros.describe" => Describe(data),
        _ => null,
    };

    public static JsonObject Catalog()
    {
        var registry = MacroStepRegistry.Default;
        return new JsonObject
        {
            ["version"] = MacroScript.CurrentVersion,
            ["stepTypes"] = registry.ToCatalogJson(),
            ["keys"] = new JsonArray(KeyNames.All.Select(k => (JsonNode)k.Name).ToArray()),
            ["modifiers"] = new JsonArray(KeyNames.Modifiers.Select(m => (JsonNode)m.Key.Name).ToArray()),
            ["mediaKeys"] = new JsonArray(Enum.GetValues<MediaKey>().Select(k => (JsonNode)new JsonObject { ["value"] = MediaKeys.Value(k), ["label"] = MediaKeys.Label(k) }).ToArray()),
            ["dialPresets"] = new JsonArray(DialPresets.All.Select(p => (JsonNode)new JsonObject
            {
                ["id"] = p.Id,
                ["short"] = p.Short,
                ["label"] = p.Label,
                ["right"] = MacroJson.WriteStep(p.Right),
                ["left"] = MacroJson.WriteStep(p.Left),
                ["push"] = p.Push.ToJson(),
            }).ToArray()),
            ["limits"] = new JsonObject
            {
                ["maxSteps"] = MacroScript.MaxSteps,
                ["maxTextLength"] = TextStep.MaxLength,
                ["maxDelayMs"] = DelayStep.MaxMs,
                ["maxTicksPerStep"] = MacroDial.MaxTicksPerStep,
            },
        };
    }

    public static JsonObject Describe(JsonNode? data)
    {
        var result = new JsonObject();
        if (data?["scripts"] is JsonObject scripts)
        {
            var o = new JsonObject();
            foreach (var (name, node) in scripts) o[name] = DescribeScript(MacroScript.FromJson(node));
            result["scripts"] = o;
        }
        if (data?["steps"] is JsonObject steps)
        {
            var o = new JsonObject();
            foreach (var (name, node) in steps) o[name] = node is null ? null : DescribeStep(MacroJson.ReadStep(node));
            result["steps"] = o;
        }
        if (data?["chords"] is JsonObject chords)
        {
            var o = new JsonObject();
            foreach (var (name, node) in chords)
            {
                var text = node is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";
                var problems = new JsonArray();
                string? canonical = null;
                if (string.IsNullOrWhiteSpace(text)) { }
                else if (!KeyChord.TryParse(text, out var chord, out var error)) problems.Add(error);
                else
                {
                    canonical = chord.ToString();
                    if (chord.ReservedReason() is { } reserved) problems.Add(reserved);
                }
                o[name] = new JsonObject { ["canonical"] = canonical, ["problems"] = problems };
            }
            result["chords"] = o;
        }
        return result;
    }

    public static JsonObject DescribeScript(MacroScript script) => new()
    {
        ["summary"] = script.Describe(),
        ["problems"] = new JsonArray(script.Validate().Select(p => (JsonNode)p).ToArray()),
        ["steps"] = new JsonArray(script.Steps.Select(s => (JsonNode)DescribeStep(s)).ToArray()),
    };

    public static JsonObject DescribeStep(MacroStep step) => new()
    {
        ["summary"] = MacroStep.SafeDescribe(step),
        ["problems"] = new JsonArray(MacroStep.SafeValidate(step).Select(p => (JsonNode)p).ToArray()),
    };

    /// <summary>
    /// Adds the state every macro action shares to <paramref name="own"/>: <c>status</c>, <c>launches</c>
    /// (<c>[{ id, runs, name, trusted, confirm }]</c>), <c>review</c> (one line) and <c>wouldRun</c> (exactly what a press
    /// starts). Full paths go to the PI only, never to the log.
    /// </summary>
    public static JsonObject LaunchState(JsonObject own, string status, IReadOnlyCollection<LaunchCheck> checks)
    {
        own["status"] = status;
        own["launches"] = LaunchTrust.ToJson(checks);
        own["review"] = ReviewText(checks);
        own["wouldRun"] = checks.Count == 0 ? "Nothing (no program to start)." : string.Join("\n", checks.Select(c => LaunchTrust.CommandLine(c.Spec)).Distinct());
        return own;
    }

    /// <summary>One line about the launch steps' trust, for the PI ("" when the action starts no program).</summary>
    public static string ReviewText(IReadOnlyCollection<LaunchCheck> checks)
    {
        if (checks.Count == 0) return "";
        if (checks.Any(c => !c.Trusted))
            return "Not trusted on this PC yet: this came with a profile or changed outside this editor. Check exactly what it starts, then press Trust.";
        return checks.FirstOrDefault(c => c.NeedsConfirmation) is { } risky
            ? $"Trusted on this PC. It still asks for a second press each time: {risky.ConfirmReason}."
            : "Trusted on this PC.";
    }
}

/// <summary>Ready-made dial setups the editor offers (turn right / turn left / push).</summary>
internal static class DialPresets
{
    public sealed record Preset(string Id, string Short, string Label, MacroStep Right, MacroStep Left, MacroScript Push);

    public static IReadOnlyList<Preset> All =>
    [
        new("zoom", "Zoom", "Zoom (Ctrl+Plus / Ctrl+Minus, push Ctrl+0)", new ChordStep("Ctrl+Plus"), new ChordStep("Ctrl+Minus"), MacroScript.Of(new ChordStep("Ctrl+0"))),
        new("arrows", "Arrows", "Left / right arrows (push Enter)", new ChordStep("Right"), new ChordStep("Left"), MacroScript.Of(new ChordStep("Enter"))),
        new("scroll", "Scroll", "Up / down arrows (push Enter)", new ChordStep("Down"), new ChordStep("Up"), MacroScript.Of(new ChordStep("Enter"))),
        new("tabs", "Tabs", "Switch tabs (push: new tab)", new ChordStep("Ctrl+Tab"), new ChordStep("Ctrl+Shift+Tab"), MacroScript.Of(new ChordStep("Ctrl+T"))),
        new("undo", "Undo", "Undo / redo", new ChordStep("Ctrl+Y"), new ChordStep("Ctrl+Z"), new MacroScript()),
        new("volume", "Volume", "System volume (push: mute)", new MediaKeyStep(MediaKey.VolumeUp), new MediaKeyStep(MediaKey.VolumeDown), MacroScript.Of(new MediaKeyStep(MediaKey.Mute))),
        new("tracks", "Tracks", "Tracks (push: play / pause)", new MediaKeyStep(MediaKey.Next), new MediaKeyStep(MediaKey.Previous), MacroScript.Of(new MediaKeyStep(MediaKey.PlayPause))),
        new("brush", "Brush", "Brush size ] / [", new ChordStep("BracketRight"), new ChordStep("BracketLeft"), new MacroScript()),
    ];
}
