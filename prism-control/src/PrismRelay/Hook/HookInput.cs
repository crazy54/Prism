using System.Text.Json;

namespace PrismRelay.Hook;

/// <summary>A scalar JSON value we kept: a string, a number (as its raw text), or a bool.</summary>
internal readonly record struct Scalar(JsonValueKind Kind, string? Text, bool Bool)
{
    public string? AsString => Kind == JsonValueKind.String ? Text : null;
}

/// <summary>
/// One top-level member of <c>tool_input</c>, as far as the reveal summary may need it. Strings are materialized only up to
/// <see cref="HookInput.MaxValueBytes"/> raw bytes; a longer one is recorded as <see cref="Oversize"/> with its raw length, never
/// silently dropped (review H1: an oversize command must make the summary incomplete, not vanish).
/// </summary>
internal sealed class ToolMember
{
    /// <summary>The member name, or null when it was longer than 64 bytes (it can then never be shown).</summary>
    public string? Name { get; init; }
    public JsonTokenType Kind { get; init; }
    /// <summary>The string value, or a number's raw text; "true"/"false"/"null" for those tokens.</summary>
    public string? Text { get; init; }
    /// <summary>A string (or number) over the cap: not materialized.</summary>
    public bool Oversize { get; init; }
    /// <summary>The raw (escaped) byte length of an oversize string.</summary>
    public long RawLength { get; init; }
    /// <summary>For <c>command</c> / <c>cmd</c> arrays (Codex argv): the elements that were strings within the cap.</summary>
    public List<string>? Items { get; init; }
    /// <summary>The array had a non-string element, too many elements, or an oversize one: it can't be shown faithfully.</summary>
    public bool ItemsIncomplete { get; init; }
}

/// <summary>Whether <c>tool_input</c> was read whole.</summary>
internal enum ToolInputState
{
    /// <summary>No tool_input in the payload.</summary>
    Absent,
    /// <summary>Read to its closing brace.</summary>
    Complete,
    /// <summary>The payload ended (the 1 MB cap, or broken JSON) inside tool_input.</summary>
    Cut,
    /// <summary>A member name (or tool_input itself) appeared twice: which one the agent uses is not certain.</summary>
    Ambiguous,
    /// <summary>tool_input was not an object.</summary>
    NotAnObject,
}

/// <summary>
/// The parts of a hook payload the policy may use, read with a streaming reader so a payload cut at the 1 MB cap still
/// yields the top-level fields that came before the cut. Only wanted names are ever materialized; everything else
/// (prompts, tool output, file contents over the value cap) is skipped without being decoded.
/// </summary>
internal sealed class HookInput
{
    /// <summary>tool_input strings longer than this (raw bytes) are recorded as oversize, not materialized.</summary>
    public const int MaxValueBytes = 16 * 1024;
    /// <summary>tool_input members recorded (beyond this, <see cref="ToolMembersOverflow"/>).</summary>
    public const int MaxMembers = 32;
    /// <summary>argv elements recorded for a command array (beyond this, the array is incomplete).</summary>
    public const int MaxItems = 64;

    private const int MaxStringBytes = 64 * 1024;

    /// <summary>Top-level names we may read (the allow-list sources, the tool-detection markers, and tool_input).</summary>
    private static readonly HashSet<string> WantedTop = new(StringComparer.Ordinal)
    {
        "hook_event_name", "session_id", "sessionId", "conversation_id", "permission_mode", "agent_id", "agent_type", "cwd",
        "tool_name", "mcp_server", "is_interrupt", "error", "notification_type", "source", "model", "reason", "cursor_version",
    };

    public Dictionary<string, Scalar> Top { get; } = new(StringComparer.Ordinal);
    /// <summary>tool_input's top-level members, in order (≤ <see cref="MaxMembers"/>).</summary>
    public List<ToolMember> ToolMembers { get; } = [];
    public ToolInputState ToolInputState { get; private set; } = ToolInputState.Absent;
    /// <summary>tool_input had more than <see cref="MaxMembers"/> members.</summary>
    public bool ToolMembersOverflow { get; private set; }
    /// <summary>The whole document was valid JSON.</summary>
    public bool Parsed { get; private set; }

    public string? Str(string name) => Top.TryGetValue(name, out var s) ? s.AsString : null;
    public bool? Bool(string name) => Top.TryGetValue(name, out var s) && s.Kind is JsonValueKind.True or JsonValueKind.False ? s.Bool : null;
    public bool Has(string name) => Top.ContainsKey(name);

    /// <summary>The first tool_input member with this name (null when absent).</summary>
    public ToolMember? Member(string name) => ToolMembers.FirstOrDefault(m => m.Name == name);

    /// <summary>A tool_input string member's value (null when absent, not a string, or oversize).</summary>
    public string? ToolString(string name) => Member(name) is { Kind: JsonTokenType.String, Oversize: false } m ? m.Text : null;

    public static HookInput Read(ReadOnlySpan<byte> json, bool complete)
    {
        var input = new HookInput();
        try
        {
            var reader = new Utf8JsonReader(json, isFinalBlock: complete, new JsonReaderState(new JsonReaderOptions { MaxDepth = 64 }));
            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) return input;
            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndObject) { input.Parsed = complete && reader.CurrentDepth == 0; break; }
                if (reader.TokenType != JsonTokenType.PropertyName) return input;
                var name = reader.ValueSpan.Length <= 64 ? reader.GetString()! : "";
                if (!reader.Read())
                {
                    if (name == "tool_input") input.ToolInputState = ToolInputState.Cut;   // cut right here
                    return input;
                }
                if (name == "tool_input")
                {
                    if (input.ToolInputState != ToolInputState.Absent)
                    {
                        // A second tool_input: the agent's JSON.parse keeps the LAST one. Never show either.
                        input.ToolInputState = ToolInputState.Ambiguous;
                        if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray && !reader.TrySkip()) return input;
                        continue;
                    }
                    if (reader.TokenType != JsonTokenType.StartObject)
                    {
                        input.ToolInputState = ToolInputState.NotAnObject;
                        if (reader.TokenType == JsonTokenType.StartArray && !reader.TrySkip()) return input;
                        continue;
                    }
                    input.ToolInputState = ToolInputState.Cut;
                    if (!input.ReadToolInput(ref reader)) return input;
                    continue;
                }
                switch (reader.TokenType)
                {
                    case JsonTokenType.String or JsonTokenType.Number or JsonTokenType.True or JsonTokenType.False or JsonTokenType.Null:
                        if (WantedTop.Contains(name) && !input.Top.ContainsKey(name) && TryScalar(ref reader, out var s)) input.Top[name] = s;
                        break;
                    default:
                        if (!reader.TrySkip()) return input; // a nested value that was cut off
                        break;
                }
            }
        }
        catch (JsonException) { /* keep what we have */ }
        catch (InvalidOperationException) { }
        return input;
    }

    private static bool TryScalar(ref Utf8JsonReader reader, out Scalar s)
    {
        s = default;
        switch (reader.TokenType)
        {
            case JsonTokenType.String:
                if (reader.ValueSpan.Length > MaxStringBytes) return false;
                s = new Scalar(JsonValueKind.String, reader.GetString(), false);
                return true;
            case JsonTokenType.Number:
                s = new Scalar(JsonValueKind.Number, System.Text.Encoding.UTF8.GetString(reader.ValueSpan), false);
                return true;
            case JsonTokenType.True: s = new Scalar(JsonValueKind.True, null, true); return true;
            case JsonTokenType.False: s = new Scalar(JsonValueKind.False, null, false); return true;
            default: return false; // null: treat as absent
        }
    }

    /// <summary>Reads tool_input's members. False when the payload ended inside it (the state stays <see cref="ToolInputState.Cut"/>).</summary>
    private bool ReadToolInput(ref Utf8JsonReader reader)
    {
        var depth = reader.CurrentDepth;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var ambiguous = false;
        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.EndObject && reader.CurrentDepth == depth)
            {
                ToolInputState = ambiguous ? ToolInputState.Ambiguous : ToolInputState.Complete;
                return true;
            }
            if (reader.TokenType != JsonTokenType.PropertyName) return false;
            var name = reader.ValueSpan.Length <= 64 ? reader.GetString() : null;
            if (name is not null && !seen.Add(name)) ambiguous = true;
            if (!reader.Read()) return false;
            var keep = ToolMembers.Count < MaxMembers;
            if (!keep) ToolMembersOverflow = true;
            switch (reader.TokenType)
            {
                case JsonTokenType.String:
                {
                    var raw = reader.ValueSpan.Length;
                    if (keep)
                        ToolMembers.Add(raw <= MaxValueBytes
                            ? new ToolMember { Name = name, Kind = JsonTokenType.String, Text = reader.GetString() }
                            : new ToolMember { Name = name, Kind = JsonTokenType.String, Oversize = true, RawLength = raw });
                    break;
                }
                case JsonTokenType.Number:
                    if (keep)
                        ToolMembers.Add(reader.ValueSpan.Length <= 64
                            ? new ToolMember { Name = name, Kind = JsonTokenType.Number, Text = System.Text.Encoding.UTF8.GetString(reader.ValueSpan) }
                            : new ToolMember { Name = name, Kind = JsonTokenType.Number, Oversize = true, RawLength = reader.ValueSpan.Length });
                    break;
                case JsonTokenType.True or JsonTokenType.False or JsonTokenType.Null:
                    if (keep) ToolMembers.Add(new ToolMember { Name = name, Kind = reader.TokenType, Text = reader.TokenType switch { JsonTokenType.True => "true", JsonTokenType.False => "false", _ => "null" } });
                    break;
                case JsonTokenType.StartArray when name is "command" or "cmd":
                {
                    // Codex: ["bash", "-lc", "…"]. Every element must be a string within the cap, else the array is incomplete.
                    var items = new List<string>();
                    var incomplete = false;
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                    {
                        if (reader.TokenType == JsonTokenType.String && reader.ValueSpan.Length <= MaxValueBytes && items.Count < MaxItems)
                            items.Add(reader.GetString()!);
                        else
                        {
                            incomplete = true;
                            if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray && !reader.TrySkip()) return false;
                        }
                    }
                    if (reader.TokenType != JsonTokenType.EndArray) return false;
                    if (keep) ToolMembers.Add(new ToolMember { Name = name, Kind = JsonTokenType.StartArray, Items = items, ItemsIncomplete = incomplete });
                    break;
                }
                case JsonTokenType.StartObject or JsonTokenType.StartArray:
                    if (keep) ToolMembers.Add(new ToolMember { Name = name, Kind = reader.TokenType });
                    if (!reader.TrySkip()) return false;
                    break;
                default:
                    return false;
            }
        }
        return false;
    }
}
