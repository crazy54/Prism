using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.Desktop;

/// <summary>A frame broke the rules (over the size cap, not JSON, empty, too slow). The session is closed.</summary>
public sealed class PipeFrameException(string message) : IOException(message);

/// <summary>
/// The wire format shared with prism-relay and Chrome native messaging: a u32 little-endian byte count, then that many
/// bytes of UTF-8 JSON.
/// </summary>
public static class PipeFraming
{
    /// <summary>JSON nesting limit for parsed frames.</summary>
    public const int MaxDepth = 64;

    private static readonly JsonSerializerOptions Compact = new() { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>The frame bytes (header + body) for <paramref name="node"/>.</summary>
    public static byte[] Encode(JsonNode node)
    {
        var body = Encoding.UTF8.GetBytes(node.ToJsonString(Compact));
        var frame = new byte[4 + body.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(frame, (uint)body.Length);
        body.CopyTo(frame, 4);
        return frame;
    }

    /// <summary>Parses a frame body. Throws <see cref="PipeFrameException"/> on invalid UTF-8 or JSON.</summary>
    public static JsonNode Parse(ReadOnlySpan<byte> body)
    {
        try
        {
            var reader = new Utf8JsonReader(body, new JsonReaderOptions { MaxDepth = MaxDepth });
            return JsonNode.Parse(ref reader) ?? throw new PipeFrameException("The frame is JSON null.");
        }
        catch (JsonException ex) { throw new PipeFrameException("The frame is not valid JSON: " + ex.Message); }
        catch (ArgumentException ex) { throw new PipeFrameException("The frame is not valid UTF-8: " + ex.Message); }
    }

    /// <summary>Constant-time token comparison (both sides as UTF-8 bytes).</summary>
    public static bool TokenEquals(string? given, string expected)
    {
        if (given is null) return false;
        var a = Encoding.UTF8.GetBytes(given);
        var b = Encoding.UTF8.GetBytes(expected);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    /// <summary>A new 256-bit token as 64 lowercase hex characters.</summary>
    public static string NewToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    /// <summary>A new 128-bit pipe-name suffix as 32 lowercase hex characters.</summary>
    public static string NewNameSuffix() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
}
