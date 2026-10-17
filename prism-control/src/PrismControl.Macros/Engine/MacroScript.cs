using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PrismControl.Core.Actions;

namespace PrismControl.Macros.Engine;

/// <summary>
/// A macro: an ordered list of steps with a format version. Stored in action settings as plain JSON (no secrets):
/// <code>
/// { "version": 1, "steps": [ { "type": "chord", "keys": "Ctrl+Shift+T" }, { "type": "delay", "ms": 250 }, { "type": "text", "text": "hi\n" } ] }
/// </code>
/// Reading is lenient: a bare array is read as version 1, numbers may be strings, and unknown step types or properties
/// (from a newer version) are kept as they are so saving never loses them. A macro with a newer version or an unknown step
/// does not run.
/// </summary>
[JsonConverter(typeof(MacroScriptJsonConverter))]
public sealed class MacroScript
{
    /// <summary>The format this version writes. Bump it when a change would make older plugins misread a macro.</summary>
    public const int CurrentVersion = 1;
    public const int MaxSteps = 100;

    public int Version { get; init; } = CurrentVersion;
    public List<MacroStep> Steps { get; init; } = [];
    /// <summary>Top-level properties this version does not know (kept on save).</summary>
    internal JsonObject? Extra { get; init; }

    public bool HasSteps => Steps.Count > 0;

    public static MacroScript Of(params MacroStep[] steps) => new() { Steps = [.. steps] };

    /// <summary>
    /// Problems that stop the macro from running, as sentences ("Step 2 (Key chord): Unknown key \"Ctrl+Q+\""). Never throws:
    /// a step whose own check throws is reported as a problem (settings come from imported profiles).
    /// </summary>
    public List<string> Validate(MacroStepRegistry? registry = null)
    {
        registry ??= MacroStepRegistry.Default;
        var p = new List<string>();
        if (Version > CurrentVersion)
            p.Add($"This macro was saved by a newer version of Prism Control (format {Version}). Update the plugin to run it.");
        if (Steps.Count > MaxSteps) p.Add($"A macro can have up to {MaxSteps} steps (this one has {Steps.Count}).");
        for (var i = 0; i < Steps.Count; i++)
        {
            if (Steps[i] is not { } step)
            {
                p.Add(string.Create(CultureInfo.InvariantCulture, $"Step {i + 1}: this step is empty. Fix it in settings."));
                continue;
            }
            var label = registry.For(step.GetType())?.Label ?? "Step";
            foreach (var problem in MacroStep.SafeValidate(step))
                p.Add(string.Create(CultureInfo.InvariantCulture, $"Step {i + 1} ({label}): {problem}"));
        }
        return p;
    }

    /// <summary>"Ctrl+C", or "3 steps: Ctrl+C, Wait 250 ms, Ctrl+V". Never throws.</summary>
    public string Describe()
    {
        if (Steps.Count == 0) return "No steps yet";
        if (Steps.Count == 1) return Steps[0] is { } only ? MacroStep.SafeDescribe(only) : "Unreadable step";
        var list = string.Join(", ", Steps.Take(3).Select(s => s is null ? "Unreadable step" : MacroStep.SafeDescribe(s)));
        return string.Create(CultureInfo.InvariantCulture, $"{Steps.Count} steps: {list}{(Steps.Count > 3 ? ", …" : "")}");
    }

    public JsonObject ToJson() => MacroJson.WriteScript(this);
    public static MacroScript FromJson(JsonNode? node) => MacroJson.ReadScript(node);
}

/// <summary>The macro JSON format (reads leniently, writes canonically). Uses the core's settings options (camelCase, lenient numbers and bools).</summary>
public static class MacroJson
{
    public static JsonSerializerOptions Options => ActionJson.Options;

    public static MacroScript ReadScript(JsonNode? node, MacroStepRegistry? registry = null, int depth = 0)
    {
        registry ??= MacroStepRegistry.Default;
        switch (node)
        {
            case JsonArray legacy:
                return new MacroScript { Version = 1, Steps = ReadSteps(legacy, registry) };
            case JsonObject o:
                var version = ReadInt(o["version"]) ?? 1;
                JsonObject? extra = null;
                foreach (var (k, v) in o)
                {
                    if (k is "version" or "steps") continue;
                    (extra ??= [])[k] = v?.DeepClone();
                }
                return new MacroScript { Version = version, Steps = o["steps"] is JsonArray steps ? ReadSteps(steps, registry) : [], Extra = extra };
            case JsonValue v when depth == 0 && v.TryGetValue<string>(out var text) && text.TrimStart() is ['{' or '[', ..]:
                // A property inspector that stored the macro as a JSON string.
                try { return ReadScript(JsonNode.Parse(text), registry, depth + 1); }
                catch (JsonException) { return new MacroScript(); }
            default:
                return new MacroScript();
        }
    }

    public static JsonObject WriteScript(MacroScript script, MacroStepRegistry? registry = null)
    {
        var o = new JsonObject
        {
            ["version"] = script.Version,
            ["steps"] = new JsonArray(script.Steps.Select(s => (JsonNode)WriteStep(s, registry)).ToArray()),
        };
        if (script.Extra is { } extra)
            foreach (var (k, v) in extra) o[k] = v?.DeepClone();
        return o;
    }

    public static MacroStep ReadStep(JsonNode? node, MacroStepRegistry? registry = null)
    {
        registry ??= MacroStepRegistry.Default;
        if (node is not JsonObject o) return new UnknownStep(new JsonObject { ["value"] = node?.DeepClone() }, "A step must be a JSON object.");
        var type = o["type"] is JsonValue tv && tv.TryGetValue<string>(out var t) ? t : null;
        if (type is null) return new UnknownStep((JsonObject)o.DeepClone(), "A step has no type.");
        var info = registry.Find(type);
        if (info is null)
            return new UnknownStep((JsonObject)o.DeepClone(), $"This macro uses a \"{type}\" step that this version of Prism Control doesn't know. Update the plugin.");
        var body = (JsonObject)o.DeepClone();
        body.Remove("type");
        try
        {
            // ActionJson.Options respects nullable annotations: an imported "text": null is an error here, never a null
            // property that throws later on every render. The step is kept as it is (round trips) and does not run.
            return (MacroStep?)body.Deserialize(info.Type, Options) ?? info.Create();
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException or InvalidOperationException or FormatException or ArgumentException)
        {
            var what = ex is JsonException { Path: { Length: > 2 } path } && path.StartsWith("$.", StringComparison.Ordinal)
                ? $"its \"{path[2..]}\" value is missing or invalid"
                : $"its values are invalid ({ex.GetType().Name})";
            return new UnknownStep((JsonObject)o.DeepClone(), $"A {info.Label} step could not be read: {what}. Fix it in settings.", info.Label);
        }
    }

    public static JsonObject WriteStep(MacroStep step, MacroStepRegistry? registry = null)
    {
        if (step is UnknownStep unknown) return (JsonObject)unknown.Raw.DeepClone();
        registry ??= MacroStepRegistry.Default;
        var info = registry.For(step.GetType()) ?? throw new InvalidOperationException($"{step.GetType().Name} is not a registered step type.");
        var o = new JsonObject { ["type"] = info.Id };
        if (JsonSerializer.SerializeToNode(step, step.GetType(), Options) is JsonObject body)
            foreach (var (k, v) in body)
                if (k != "type") o[k] = v?.DeepClone();
        return o;
    }

    private static List<MacroStep> ReadSteps(JsonArray steps, MacroStepRegistry registry) => steps.Select(s => ReadStep(s, registry)).ToList();

    private static int? ReadInt(JsonNode? n) => n switch
    {
        JsonValue v when v.TryGetValue<int>(out var i) => i,
        JsonValue v when v.TryGetValue<double>(out var d) => (int)d,
        JsonValue v when v.TryGetValue<string>(out var s) && int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var p) => p,
        _ => null,
    };
}

/// <summary>Settings property converter: a macro reads from an object, an array or null, and always writes { version, steps }.</summary>
public sealed class MacroScriptJsonConverter : JsonConverter<MacroScript>
{
    public override bool HandleNull => true;

    public override MacroScript Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        MacroJson.ReadScript(JsonNode.Parse(ref reader));

    public override void Write(Utf8JsonWriter writer, MacroScript value, JsonSerializerOptions options) =>
        MacroJson.WriteScript(value ?? new MacroScript()).WriteTo(writer);
}

/// <summary>Settings property converter for a single step (the dial's turn steps). Null stays null.</summary>
public sealed class MacroStepJsonConverter : JsonConverter<MacroStep>
{
    public override MacroStep? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        JsonNode.Parse(ref reader) is { } node ? MacroJson.ReadStep(node) : null;

    public override void Write(Utf8JsonWriter writer, MacroStep value, JsonSerializerOptions options) =>
        MacroJson.WriteStep(value).WriteTo(writer);
}
