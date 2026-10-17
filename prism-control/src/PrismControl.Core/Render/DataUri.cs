namespace PrismControl.Core.Render;

/// <summary>Data URL encoding for setImage and layout pixmaps.</summary>
public static class DataUri
{
    public const string SvgPrefix = "data:image/svg+xml,";

    /// <summary>
    /// <c>data:image/svg+xml,</c> + percent-encoded SVG (the documented form; verified on hardware).
    /// Never pass a raw SVG string to the app: it is rejected and the key reverts to its manifest image.
    /// </summary>
    public static string Svg(string svg)
    {
        ArgumentNullException.ThrowIfNull(svg);
        return SvgPrefix + Uri.EscapeDataString(svg);
    }

    /// <summary><c>data:&lt;mime&gt;;base64,…</c> for PNG/JPEG/WebP bytes.</summary>
    public static string Image(ReadOnlySpan<byte> bytes, string mime) => $"data:{mime};base64,{Convert.ToBase64String(bytes)}";

    /// <summary>Detects the type from the header and encodes. Throws for unknown formats.</summary>
    public static string FromImageBytes(ReadOnlySpan<byte> bytes)
    {
        var info = ImageInfo.Probe(bytes) ?? throw new ArgumentException("Unrecognized image data (expected PNG, JPEG, GIF or WebP).", nameof(bytes));
        return Image(bytes, info.Mime);
    }

    public static bool IsSvg(string? value) => value is not null && value.StartsWith("data:image/svg+xml", StringComparison.Ordinal);

    /// <summary>Decodes a <c>data:image/svg+xml</c> URL (percent-encoded or base64) back to markup; for tests and lint.</summary>
    public static bool TryDecodeSvg(string? value, out string svg)
    {
        svg = "";
        if (!IsSvg(value)) return false;
        var comma = value!.IndexOf(',');
        if (comma < 0) return false;
        var meta = value[..comma];
        var payload = value[(comma + 1)..];
        if (meta.EndsWith(";base64", StringComparison.Ordinal))
        {
            try { svg = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(payload)); return true; }
            catch (FormatException) { return false; }
        }
        svg = Uri.UnescapeDataString(payload);
        return true;
    }
}
