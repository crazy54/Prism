using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.Ai.Hooks;

/// <summary>
/// Review L6: the installer edits ONLY the top-level <c>"hooks"</c> value of a settings / hooks file. Everything else (key order,
/// indentation, escapes such as <c>é</c>, number spellings such as <c>1.50</c>, other tools' formatting, line endings) stays
/// byte-for-byte. The result is re-parsed and must equal the intended document, else nothing is written.
/// </summary>
internal static class JsonSplice
{
    /// <summary>
    /// <paramref name="original"/> with its top-level "hooks" value replaced by <paramref name="hooks"/> (inserted when missing,
    /// removed when <paramref name="hooks"/> is null). Null when the file is not a plain JSON object or the result would not match.
    /// </summary>
    public static byte[]? ReplaceHooks(byte[] original, JsonNode? hooks, string newline, JsonSerializerOptions writeOptions)
    {
        var bom = original.Length >= 3 && original[0] == 0xEF && original[1] == 0xBB && original[2] == 0xBF;
        var body = bom ? original.AsSpan(3).ToArray() : original;
        if (!Locate(body, out var loc)) return null;

        var indent = loc.Indent ?? "  ";
        string Value(JsonNode node)
        {
            var o = new JsonSerializerOptions(writeOptions) { NewLine = newline, IndentCharacter = indent[0], IndentSize = Math.Clamp(indent.Length, 1, 127) };
            if (indent.Any(c => c != indent[0])) o = new JsonSerializerOptions(writeOptions) { NewLine = newline };
            var text = node.ToJsonString(o);
            // Nest it one level: every line after the first gets the property's indentation.
            return text.Replace(newline, newline + indent, StringComparison.Ordinal);
        }

        byte[] result;
        var utf8 = new UTF8Encoding(false);
        if (loc.HooksValueStart >= 0)
        {
            if (hooks is not null)
                result = [.. body.AsSpan(0, loc.HooksValueStart), .. utf8.GetBytes(Value(hooks)), .. body.AsSpan(loc.HooksValueEnd)];
            else if (loc.NextAfterHooks >= 0)
                // Not the last property: drop `"hooks": …,` up to the next property (its indentation is reused).
                result = [.. body.AsSpan(0, loc.HooksNameStart), .. body.AsSpan(loc.NextAfterHooks)];
            else
                // The last property: drop from the end of the previous value (its comma included) through the hooks value.
                result = [.. body.AsSpan(0, loc.PrevValueEnd), .. body.AsSpan(loc.HooksValueEnd)];
        }
        else
        {
            if (hooks is null) return original;
            var insert = loc.LastPropertyEnd < 0
                ? newline + indent + "\"hooks\": " + Value(hooks) + newline                    // {} → { "hooks": … }
                : "," + newline + indent + "\"hooks\": " + Value(hooks);
            var at = loc.LastPropertyEnd < 0 ? loc.RootStart + 1 : loc.LastPropertyEnd;
            var tail = loc.LastPropertyEnd < 0 ? loc.RootEnd : at;   // an empty object's inner whitespace is replaced
            result = [.. body.AsSpan(0, at), .. utf8.GetBytes(insert), .. body.AsSpan(tail)];
        }
        if (bom) result = [0xEF, 0xBB, 0xBF, .. result];

        // The edit must be exactly the intended document.
        try
        {
            var expected = JsonNode.Parse(body)!.AsObject().DeepClone().AsObject();
            if (hooks is null) expected.Remove("hooks");
            else expected["hooks"] = hooks.DeepClone();
            var actual = JsonNode.Parse(bom ? result.AsSpan(3) : result);
            return JsonNode.DeepEquals(actual, expected) ? result : null;
        }
        catch (Exception ex) when (ex is JsonException or ArgumentException or InvalidOperationException)
        {
            return null;
        }
    }

    private struct Location
    {
        public int RootStart, RootEnd;
        public int HooksNameStart, HooksValueStart, HooksValueEnd;
        /// <summary>Where the property after "hooks" starts (-1 when hooks is the last one).</summary>
        public int NextAfterHooks;
        /// <summary>The end of the value before "hooks" (or just after the root '{').</summary>
        public int PrevValueEnd;
        /// <summary>The end of the last property's value (-1 for an empty object).</summary>
        public int LastPropertyEnd;
        public string? Indent;
    }

    private static bool Locate(byte[] body, out Location loc)
    {
        loc = new Location { HooksNameStart = -1, HooksValueStart = -1, HooksValueEnd = -1, NextAfterHooks = -1, PrevValueEnd = -1, LastPropertyEnd = -1, RootEnd = -1 };
        try
        {
            var reader = new Utf8JsonReader(body, new JsonReaderOptions { CommentHandling = JsonCommentHandling.Disallow, AllowTrailingCommas = false });
            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) return false;
            loc.RootStart = (int)reader.TokenStartIndex;
            var prevEnd = loc.RootStart + 1;
            var afterHooks = false;
            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndObject && reader.CurrentDepth == 0)
                {
                    loc.RootEnd = (int)reader.TokenStartIndex;
                    break;
                }
                if (reader.TokenType != JsonTokenType.PropertyName || reader.CurrentDepth != 1) return false;
                var nameStart = (int)reader.TokenStartIndex;
                if (afterHooks) { loc.NextAfterHooks = nameStart; afterHooks = false; }
                loc.Indent ??= IndentBefore(body, nameStart);
                var isHooks = reader.ValueTextEquals("hooks"u8) && loc.HooksValueStart < 0;
                if (!reader.Read()) return false;
                var valueStart = (int)reader.TokenStartIndex;
                if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray) reader.Skip();
                var valueEnd = (int)reader.BytesConsumed;
                if (isHooks)
                {
                    loc.HooksNameStart = nameStart;
                    loc.HooksValueStart = valueStart;
                    loc.HooksValueEnd = valueEnd;
                    loc.PrevValueEnd = prevEnd;
                    afterHooks = true;
                }
                prevEnd = valueEnd;
                loc.LastPropertyEnd = valueEnd;
            }
            if (loc.RootEnd < 0) return false;
            // Only whitespace may follow the root object.
            for (var i = loc.RootEnd + 1; i < body.Length; i++) if (body[i] is not ((byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')) return false;
            return true;
        }
        catch (JsonException) { return false; }
    }

    /// <summary>The spaces/tabs between the line start and a property name; null when the property is not on a line of its own.</summary>
    private static string? IndentBefore(byte[] body, int nameStart)
    {
        var i = nameStart;
        while (i > 0 && body[i - 1] is (byte)' ' or (byte)'\t') i--;
        if (i == 0 || body[i - 1] != (byte)'\n' || i == nameStart) return null;
        return Encoding.ASCII.GetString(body, i, nameStart - i);
    }
}
