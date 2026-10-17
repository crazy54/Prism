using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Scheduling;

namespace PrismControl.Core.Actions;

/// <summary>
/// What an action instance talks to. The plugin host implements it on top of the update scheduler and the
/// WebSocket; the test harness (PrismControl.Testing) records the calls instead.
/// </summary>
internal interface IActionChannel
{
    void SetImage(string context, string? image, int? state, Target target, UpdatePriority priority);
    void SetTitle(string context, string? title, int? state, Target target, UpdatePriority priority);
    void SetFeedback(string context, JsonObject payload, UpdatePriority priority);
    void SetFeedbackLayout(string context, string layout, UpdatePriority priority);
    /// <summary>Input arrived: the scheduler serves this context first for a moment.</summary>
    void MarkInteractive(string context);
    /// <summary>A direct (unscheduled) command: setState, showOk, showAlert, setSettings, getSettings, setTriggerDescription, sendToPropertyInspector.</summary>
    void Send(string context, string evt, JsonNode? payload, string? action = null);
    void OpenUrl(string url);
    void LogMessage(string message);
    void SwitchToProfile(string deviceId, string? profile, int? page);
}

/// <summary>Everything the host injects into each action instance.</summary>
internal sealed class ActionEnvironment
{
    public required IActionChannel Channel { get; init; }
    public required ILog Log { get; init; }
    public required IServiceRegistry Services { get; init; }
    public required IGlobalSettings GlobalSettings { get; init; }
    public required TimeProvider Time { get; init; }
    /// <summary>Safe mode (see <see cref="SafeModeEnvironment"/>).</summary>
    public bool SafeMode { get; init; }
}

/// <summary>
/// JSON options for action settings and PI payloads (camelCase, lenient reads: PI inputs send numbers as strings).
/// Reads respect nullable annotations: a JSON null for a non-nullable property (an imported profile with
/// <c>"text": null</c>) is an error, never a null that throws later on every render. Use <see cref="ReadOrDefault{T}"/>
/// to read settings: it drops just the invalid properties so they keep their defaults.
/// </summary>
public static class ActionJson
{
    public static readonly JsonSerializerOptions Options = Create(respectNullable: true);

    // Writes fall back to these when an object holds a null in a non-nullable property, so a frame or a PI answer is never lost to it.
    private static readonly JsonSerializerOptions WriteFallback = Create(respectNullable: false);

    private const int MaxRepairs = 16;

    private static JsonSerializerOptions Create(bool respectNullable)
    {
        var o = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            NumberHandling = JsonNumberHandling.AllowReadingFromString,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
            RespectNullableAnnotations = respectNullable,
        };
        o.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        o.Converters.Add(new LenientBoolConverter());
        o.MakeReadOnly(populateMissingResolver: true);
        return o;
    }

    /// <summary>Accepts true/false, "true"/"false", "on"/"off", 1/0 (HTML checkboxes and older PIs send strings).</summary>
    private sealed class LenientBoolConverter : JsonConverter<bool>
    {
        public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.TokenType switch
        {
            JsonTokenType.True => true,
            JsonTokenType.False => false,
            JsonTokenType.Number => reader.TryGetDouble(out var d) && d != 0,
            JsonTokenType.String => reader.GetString()?.Trim().ToLowerInvariant() is "true" or "on" or "1" or "yes",
            JsonTokenType.Null => false,
            _ => throw new JsonException("Expected a boolean."),
        };

        public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options) => writer.WriteBooleanValue(value);
    }

    public static JsonNode? ToNode(object? value) => value switch
    {
        null => null,
        JsonNode n => n.DeepClone(),
        JsonElement e => JsonNode.Parse(e.GetRawText()),
        _ => Serialize(value),
    };

    private static JsonNode? Serialize(object value)
    {
        try { return JsonSerializer.SerializeToNode(value, value.GetType(), Options); }
        catch (JsonException) { return JsonSerializer.SerializeToNode(value, value.GetType(), WriteFallback); }
    }

    /// <summary>
    /// Reads <typeparamref name="T"/> leniently, as the framework reads action and global settings. A property whose value
    /// is invalid (null where the type is non-nullable, a string where a number belongs...) is removed so it keeps its
    /// default, and its JSON path is added to <paramref name="problems"/>. Anything else unreadable (an invalid array
    /// element, a broken converter) gives <c>new T()</c>, with the error in <paramref name="problems"/>. Never throws.
    /// </summary>
    public static T ReadOrDefault<T>(JsonNode? node, List<string>? problems = null) where T : class, new()
    {
        if (node is null) return new T();
        var work = node.DeepClone();
        for (var attempt = 0; ; attempt++)
        {
            try { return work.Deserialize<T>(Options) ?? new T(); }
            catch (Exception ex) when (ex is JsonException or NotSupportedException or InvalidOperationException or FormatException or ArgumentException)
            {
                if (attempt < MaxRepairs && ex is JsonException { Path: { } path } && RemoveProperty(work, path))
                {
                    problems?.Add(path);
                    continue;
                }
                problems?.Add(ex.Message);
                return new T();
            }
        }
    }

    // Removes the object property at a System.Text.Json error path ("$.a.b[0].c", "$['x.y']"). Array elements are
    // never removed (that would silently drop a list item, e.g. a macro step), so those paths return false.
    private static bool RemoveProperty(JsonNode root, string path)
    {
        var segments = ParsePath(path);
        if (segments is null || segments.Count == 0 || segments[^1] is not string last) return false;
        JsonNode? node = root;
        foreach (var s in segments.Take(segments.Count - 1))
        {
            node = s switch
            {
                string name when node is JsonObject o => o[name],
                int index when node is JsonArray a && index >= 0 && index < a.Count => a[index],
                _ => null,
            };
            if (node is null) return false;
        }
        return node is JsonObject parent && parent.Remove(last);
    }

    private static List<object>? ParsePath(string path)
    {
        if (!path.StartsWith('$')) return null;
        var list = new List<object>();
        var i = 1;
        while (i < path.Length)
        {
            if (path[i] == '.')
            {
                var start = ++i;
                while (i < path.Length && path[i] is not '.' and not '[') i++;
                if (i == start) return null;
                list.Add(path[start..i]);
            }
            else if (path[i] == '[')
            {
                if (i + 1 < path.Length && path[i + 1] == '\'')
                {
                    var end = path.IndexOf("']", i + 2, StringComparison.Ordinal);
                    if (end < 0) return null;
                    list.Add(path[(i + 2)..end]);
                    i = end + 2;
                }
                else
                {
                    var end = path.IndexOf(']', i);
                    if (end < 0 || !int.TryParse(path.AsSpan(i + 1, end - i - 1), System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var index)) return null;
                    list.Add(index);
                    i = end + 1;
                }
            }
            else return null;
        }
        return list;
    }
}

/// <summary>Which palette a render should use.</summary>
public static class Themes
{
    public static RefractionPalette Resolve(string? name) =>
        string.Equals(name, "day", StringComparison.OrdinalIgnoreCase) || string.Equals(name, "prism-light", StringComparison.OrdinalIgnoreCase)
            ? Refraction.Day
            : Refraction.Night;
}
