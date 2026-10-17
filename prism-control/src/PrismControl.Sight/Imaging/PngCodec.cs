using System.Buffers.Binary;
using System.IO.Compression;

namespace PrismControl.Sight.Imaging;

/// <summary>
/// A small, dependency-free PNG codec (BCL ZLibStream). Encodes 8-bit RGBA. Decodes non-interlaced PNGs of every
/// color type (gray, RGB, palette, gray+alpha, RGBA) at 1/2/4/8/16 bits, which covers screenshots and the calibration
/// recorder's own files. Untrusted input: images above 64 MP or 16384 px per side are refused before inflating.
/// Encoding is in memory only; the one place that writes PNG files from live captures is the calibration recorder.
/// </summary>
public static class PngCodec
{
    private static readonly byte[] Signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private const int MaxSide = 16384;
    private const long MaxPixels = 64L * 1024 * 1024;

    public static byte[] Encode(SightImage img, CompressionLevel level = CompressionLevel.Fastest)
    {
        using var ms = new MemoryStream();
        ms.Write(Signature);
        Span<byte> ihdr = stackalloc byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr, img.Width);
        BinaryPrimitives.WriteInt32BigEndian(ihdr[4..], img.Height);
        ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        WriteChunk(ms, "IHDR", ihdr);

        var stride = img.Width * 4;
        var raw = new byte[(stride + 1) * img.Height];
        var prev = new byte[stride];
        var cur = new byte[stride];
        var cand = new byte[stride];
        var best = new byte[stride];
        for (var y = 0; y < img.Height; y++)
        {
            // BGRA → RGBA
            var src = y * stride;
            for (var x = 0; x < stride; x += 4)
            {
                cur[x] = img.Pixels[src + x + 2];
                cur[x + 1] = img.Pixels[src + x + 1];
                cur[x + 2] = img.Pixels[src + x];
                cur[x + 3] = img.Pixels[src + x + 3];
            }
            // Adaptive filter: the smallest sum of absolute (signed) residuals.
            long bestScore = long.MaxValue;
            byte bestType = 0;
            for (byte t = 0; t <= 4; t++)
            {
                long score = 0;
                for (var i = 0; i < stride; i++)
                {
                    int a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
                    var v = (byte)(t switch { 0 => cur[i], 1 => cur[i] - a, 2 => cur[i] - b, 3 => cur[i] - ((a + b) >> 1), _ => cur[i] - Paeth(a, b, c) });
                    cand[i] = v;
                    score += v < 128 ? v : 256 - v;
                }
                if (score < bestScore) { bestScore = score; bestType = t; Buffer.BlockCopy(cand, 0, best, 0, stride); }
            }
            raw[y * (stride + 1)] = bestType;
            Buffer.BlockCopy(best, 0, raw, y * (stride + 1) + 1, stride);
            (prev, cur) = (cur, prev);
        }
        using (var z = new MemoryStream())
        {
            using (var zs = new ZLibStream(z, level, leaveOpen: true)) zs.Write(raw);
            WriteChunk(ms, "IDAT", z.ToArray());
        }
        WriteChunk(ms, "IEND", []);
        return ms.ToArray();
    }

    public static SightImage Decode(byte[] png)
    {
        ArgumentNullException.ThrowIfNull(png);
        if (png.Length < 8 || !png.AsSpan(0, 8).SequenceEqual(Signature)) throw new InvalidDataException("not a PNG file");
        int width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
        byte[]? palette = null, trns = null;
        using var idat = new MemoryStream();
        var pos = 8;
        var sawHeader = false;
        while (pos + 8 <= png.Length)
        {
            var len = BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(pos));
            if (len < 0 || pos + 12 + (long)len > png.Length) throw new InvalidDataException("truncated PNG chunk");
            var type = System.Text.Encoding.ASCII.GetString(png, pos + 4, 4);
            var data = png.AsSpan(pos + 8, len);
            switch (type)
            {
                case "IHDR":
                    width = BinaryPrimitives.ReadInt32BigEndian(data);
                    height = BinaryPrimitives.ReadInt32BigEndian(data[4..]);
                    depth = data[8]; colorType = data[9]; interlace = data[12];
                    if (width <= 0 || height <= 0 || width > MaxSide || height > MaxSide || (long)width * height > MaxPixels)
                        throw new InvalidDataException($"PNG size {width}x{height} is out of range");
                    sawHeader = true;
                    break;
                case "PLTE": palette = data.ToArray(); break;
                case "tRNS": trns = data.ToArray(); break;
                case "IDAT": idat.Write(data); break;
                case "IEND": pos = png.Length; continue;
            }
            pos += 12 + len;
        }
        if (!sawHeader) throw new InvalidDataException("PNG has no IHDR");
        if (interlace != 0) throw new NotSupportedException("interlaced PNGs are not supported; re-save the frame without interlacing");
        var channels = colorType switch { 0 => 1, 2 => 3, 3 => 1, 4 => 2, 6 => 4, _ => throw new InvalidDataException($"PNG color type {colorType}") };
        if (depth is not (1 or 2 or 4 or 8 or 16)) throw new InvalidDataException($"PNG bit depth {depth}");
        if (colorType == 3 && palette is null) throw new InvalidDataException("palette PNG without PLTE");
        var bitsPerPixel = channels * depth;
        var bpp = Math.Max(1, bitsPerPixel / 8);
        var stride = (int)(((long)width * bitsPerPixel + 7) / 8);
        var raw = new byte[(long)(stride + 1) * height];
        idat.Position = 0;
        using (var zs = new ZLibStream(idat, CompressionMode.Decompress))
        {
            var read = 0;
            while (read < raw.Length)
            {
                var n = zs.Read(raw, read, raw.Length - read);
                if (n == 0) throw new InvalidDataException("PNG image data is truncated");
                read += n;
            }
        }
        var img = new SightImage(width, height);
        var prev = new byte[stride];
        var line = new byte[stride];
        for (var y = 0; y < height; y++)
        {
            var f = raw[(long)y * (stride + 1)];
            Buffer.BlockCopy(raw, y * (stride + 1) + 1, line, 0, stride);
            for (var i = 0; i < stride; i++)
            {
                int a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
                line[i] = (byte)(f switch
                {
                    0 => line[i],
                    1 => line[i] + a,
                    2 => line[i] + b,
                    3 => line[i] + ((a + b) >> 1),
                    4 => line[i] + Paeth(a, b, c),
                    _ => throw new InvalidDataException($"PNG filter {f}"),
                });
            }
            for (var x = 0; x < width; x++)
            {
                byte r, g, bl, al = 255;
                switch (colorType)
                {
                    case 0:
                    {
                        var v = Sample(line, x, depth);
                        r = g = bl = v;
                        if (trns is { Length: >= 2 } && depth <= 8 && Raw(line, x, depth) == BinaryPrimitives.ReadUInt16BigEndian(trns)) al = 0;
                        break;
                    }
                    case 2:
                        r = Channel(line, x * 3, depth); g = Channel(line, x * 3 + 1, depth); bl = Channel(line, x * 3 + 2, depth);
                        break;
                    case 3:
                    {
                        var idx = Raw(line, x, depth);
                        if (idx * 3 + 2 >= palette!.Length) throw new InvalidDataException("PNG palette index out of range");
                        r = palette[idx * 3]; g = palette[idx * 3 + 1]; bl = palette[idx * 3 + 2];
                        if (trns is not null && idx < trns.Length) al = trns[idx];
                        break;
                    }
                    case 4:
                        r = g = bl = Channel(line, x * 2, depth); al = Channel(line, x * 2 + 1, depth);
                        break;
                    default:
                        r = Channel(line, x * 4, depth); g = Channel(line, x * 4 + 1, depth); bl = Channel(line, x * 4 + 2, depth); al = Channel(line, x * 4 + 3, depth);
                        break;
                }
                var o = (y * width + x) * 4;
                img.Pixels[o] = bl; img.Pixels[o + 1] = g; img.Pixels[o + 2] = r; img.Pixels[o + 3] = al;
            }
            (prev, line) = (line, prev);
        }
        return img;
    }

    public static SightImage Load(string path) => Decode(File.ReadAllBytes(path));

    private static byte Channel(byte[] line, int index, int depth) => depth == 16 ? line[index * 2] : line[index];

    private static int Raw(byte[] line, int x, int depth)
    {
        if (depth == 8) return line[x];
        if (depth == 16) return BinaryPrimitives.ReadUInt16BigEndian(line.AsSpan(x * 2));
        var perByte = 8 / depth;
        var b = line[x / perByte];
        var shift = 8 - depth * (x % perByte + 1);
        return (b >> shift) & ((1 << depth) - 1);
    }

    private static byte Sample(byte[] line, int x, int depth)
    {
        if (depth == 16) return line[x * 2];
        var v = Raw(line, x, depth);
        return depth == 8 ? (byte)v : (byte)(v * 255 / ((1 << depth) - 1));
    }

    private static int Paeth(int a, int b, int c)
    {
        var p = a + b - c;
        int pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }

    private static void WriteChunk(Stream s, string type, ReadOnlySpan<byte> data)
    {
        Span<byte> head = stackalloc byte[8];
        BinaryPrimitives.WriteInt32BigEndian(head, data.Length);
        System.Text.Encoding.ASCII.GetBytes(type, head[4..]);
        s.Write(head);
        s.Write(data);
        var crc = Crc32.Update(Crc32.Update(0xFFFFFFFFu, head[4..]), data) ^ 0xFFFFFFFFu;
        Span<byte> tail = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(tail, crc);
        s.Write(tail);
    }

    private static class Crc32
    {
        private static readonly uint[] Table = Build();

        private static uint[] Build()
        {
            var t = new uint[256];
            for (uint n = 0; n < 256; n++)
            {
                var c = n;
                for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                t[n] = c;
            }
            return t;
        }

        public static uint Update(uint crc, ReadOnlySpan<byte> data)
        {
            foreach (var b in data) crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
            return crc;
        }
    }
}
