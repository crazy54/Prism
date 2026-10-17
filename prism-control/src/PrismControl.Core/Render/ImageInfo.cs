using System.Buffers.Binary;

namespace PrismControl.Core.Render;

/// <summary>Image type and pixel size read from the file header (PNG, JPEG, GIF, WebP). No decoding.</summary>
public sealed record ImageInfo(string Mime, int Width, int Height)
{
    public double Aspect => Height == 0 ? 0 : (double)Width / Height;

    public static ImageInfo? Probe(ReadOnlySpan<byte> d)
    {
        if (d.Length >= 24 && d[..8].SequenceEqual(stackalloc byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
            return new("image/png", BinaryPrimitives.ReadInt32BigEndian(d[16..]), BinaryPrimitives.ReadInt32BigEndian(d[20..]));

        if (d.Length >= 10 && d[0] == (byte)'G' && d[1] == (byte)'I' && d[2] == (byte)'F')
            return new("image/gif", BinaryPrimitives.ReadUInt16LittleEndian(d[6..]), BinaryPrimitives.ReadUInt16LittleEndian(d[8..]));

        if (d.Length >= 4 && d[0] == 0xFF && d[1] == 0xD8)
            return ProbeJpeg(d);

        if (d.Length >= 30 && d[..4].SequenceEqual("RIFF"u8) && d.Slice(8, 4).SequenceEqual("WEBP"u8))
            return ProbeWebp(d);

        return null;
    }

    private static ImageInfo? ProbeJpeg(ReadOnlySpan<byte> d)
    {
        var i = 2;
        while (i + 9 < d.Length)
        {
            if (d[i] != 0xFF) { i++; continue; }
            var marker = d[i + 1];
            if (marker == 0xFF) { i++; continue; }
            if (marker is 0xD8 or 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
            var len = BinaryPrimitives.ReadUInt16BigEndian(d[(i + 2)..]);
            var isSof = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
            if (isSof && i + 9 < d.Length)
                return new("image/jpeg", BinaryPrimitives.ReadUInt16BigEndian(d[(i + 7)..]), BinaryPrimitives.ReadUInt16BigEndian(d[(i + 5)..]));
            i += 2 + len;
        }
        return null;
    }

    private static ImageInfo? ProbeWebp(ReadOnlySpan<byte> d)
    {
        var chunk = d.Slice(12, 4);
        if (chunk.SequenceEqual("VP8X"u8) && d.Length >= 30)
        {
            var w = 1 + (d[24] | d[25] << 8 | d[26] << 16);
            var h = 1 + (d[27] | d[28] << 8 | d[29] << 16);
            return new("image/webp", w, h);
        }
        if (chunk.SequenceEqual("VP8 "u8) && d.Length >= 30)
            return new("image/webp", BinaryPrimitives.ReadUInt16LittleEndian(d[26..]) & 0x3FFF, BinaryPrimitives.ReadUInt16LittleEndian(d[28..]) & 0x3FFF);
        if (chunk.SequenceEqual("VP8L"u8) && d.Length >= 25)
        {
            var b = BinaryPrimitives.ReadUInt32LittleEndian(d[21..]);
            return new("image/webp", (int)(b & 0x3FFF) + 1, (int)((b >> 14) & 0x3FFF) + 1);
        }
        return null;
    }
}
