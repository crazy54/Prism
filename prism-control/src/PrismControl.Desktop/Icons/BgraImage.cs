using System.Buffers.Binary;
using System.IO.Compression;

namespace PrismControl.Desktop;

/// <summary>A small 32-bit image: straight (non-premultiplied) BGRA, top-down rows, stride = 4 × width.</summary>
internal sealed class BgraImage
{
    public BgraImage(int width, int height, byte[] pixels)
    {
        if (width <= 0 || height <= 0 || pixels.Length != width * height * 4) throw new ArgumentException("Bad image dimensions.");
        Width = width;
        Height = height;
        Pixels = pixels;
    }

    public int Width { get; }
    public int Height { get; }
    public byte[] Pixels { get; }

    public bool IsFullyTransparent()
    {
        for (var i = 3; i < Pixels.Length; i += 4)
            if (Pixels[i] != 0) return false;
        return true;
    }

    /// <summary>
    /// Fits the image inside <paramref name="size"/>×<paramref name="size"/> (Contain: aspect kept, never cropped),
    /// centered on a transparent square. Filtering is done on premultiplied values (no dark fringes): an area average
    /// when shrinking, bilinear when enlarging.
    /// </summary>
    public BgraImage FitSquare(int size)
    {
        var scale = Math.Min((double)size / Width, (double)size / Height);
        var w = Math.Max(1, (int)Math.Round(Width * scale));
        var h = Math.Max(1, (int)Math.Round(Height * scale));
        var scaled = w == Width && h == Height ? this : Resize(w, h);
        if (w == size && h == size) return scaled;
        var px = new byte[size * size * 4];
        int ox = (size - w) / 2, oy = (size - h) / 2;
        for (var y = 0; y < h; y++)
            Buffer.BlockCopy(scaled.Pixels, y * w * 4, px, ((oy + y) * size + ox) * 4, w * 4);
        return new BgraImage(size, size, px);
    }

    public BgraImage Resize(int w, int h)
    {
        // Premultiply into floats.
        var src = new float[Width * Height * 4];
        for (int i = 0, n = Width * Height; i < n; i++)
        {
            var a = Pixels[i * 4 + 3] / 255f;
            src[i * 4] = Pixels[i * 4] * a;
            src[i * 4 + 1] = Pixels[i * 4 + 1] * a;
            src[i * 4 + 2] = Pixels[i * 4 + 2] * a;
            src[i * 4 + 3] = Pixels[i * 4 + 3];
        }
        var dst = new float[w * h * 4];
        Span<double> acc = stackalloc double[4];
        var sx = (double)Width / w;
        var sy = (double)Height / h;
        for (var y = 0; y < h; y++)
        {
            for (var x = 0; x < w; x++)
            {
                acc.Clear();
                if (sx >= 1 && sy >= 1)
                {
                    // Area average over the source box [x*sx, (x+1)*sx) × [y*sy, (y+1)*sy).
                    double x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy, total = 0;
                    for (var yy = (int)y0; yy < Math.Min(Height, (int)Math.Ceiling(y1)); yy++)
                    {
                        var wy = Math.Min(y1, yy + 1) - Math.Max(y0, yy);
                        for (var xx = (int)x0; xx < Math.Min(Width, (int)Math.Ceiling(x1)); xx++)
                        {
                            var wgt = wy * (Math.Min(x1, xx + 1) - Math.Max(x0, xx));
                            var o = (yy * Width + xx) * 4;
                            for (var c = 0; c < 4; c++) acc[c] += src[o + c] * wgt;
                            total += wgt;
                        }
                    }
                    for (var c = 0; c < 4; c++) acc[c] /= total;
                }
                else
                {
                    // Bilinear (pixel centers).
                    var fx = Math.Clamp((x + 0.5) * sx - 0.5, 0, Width - 1);
                    var fy = Math.Clamp((y + 0.5) * sy - 0.5, 0, Height - 1);
                    int ix = (int)fx, iy = (int)fy, ix1 = Math.Min(ix + 1, Width - 1), iy1 = Math.Min(iy + 1, Height - 1);
                    double tx = fx - ix, ty = fy - iy;
                    for (var c = 0; c < 4; c++)
                    {
                        var top = src[(iy * Width + ix) * 4 + c] * (1 - tx) + src[(iy * Width + ix1) * 4 + c] * tx;
                        var bottom = src[(iy1 * Width + ix) * 4 + c] * (1 - tx) + src[(iy1 * Width + ix1) * 4 + c] * tx;
                        acc[c] = top * (1 - ty) + bottom * ty;
                    }
                }
                var d = (y * w + x) * 4;
                for (var c = 0; c < 4; c++) dst[d + c] = (float)acc[c];
            }
        }
        // Un-premultiply.
        var px = new byte[w * h * 4];
        for (int i = 0, n = w * h; i < n; i++)
        {
            var a = dst[i * 4 + 3];
            px[i * 4 + 3] = (byte)Math.Clamp(Math.Round(a), 0, 255);
            if (a <= 0.5f) continue;
            var inv = 255f / a;
            for (var c = 0; c < 3; c++) px[i * 4 + c] = (byte)Math.Clamp(Math.Round(dst[i * 4 + c] * inv), 0, 255);
        }
        return new BgraImage(w, h, px);
    }

    /// <summary>
    /// Converts premultiplied pixels to straight alpha in place, if they look premultiplied (every channel ≤ alpha).
    /// Shell bitmaps (IShellItemImageFactory) are premultiplied; icon DIBs are straight.
    /// </summary>
    public static void UnpremultiplyIfNeeded(byte[] px)
    {
        var premultiplied = true;
        var hasPartial = false;
        for (var i = 0; i < px.Length; i += 4)
        {
            var a = px[i + 3];
            if (px[i] > a || px[i + 1] > a || px[i + 2] > a) { premultiplied = false; break; }
            if (a is > 0 and < 255) hasPartial = true;
        }
        if (!premultiplied || !hasPartial) return;
        for (var i = 0; i < px.Length; i += 4)
        {
            var a = px[i + 3];
            if (a is 0 or 255) continue;
            for (var c = 0; c < 3; c++) px[i + c] = (byte)Math.Min(255, (px[i + c] * 255 + a / 2) / a);
        }
    }
}

/// <summary>A minimal PNG encoder (RGBA 8-bit, adaptive per-row filters, zlib). Deterministic; no WIC.</summary>
internal static class PngWriter
{
    private static readonly byte[] Signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    public static byte[] Encode(BgraImage img)
    {
        int w = img.Width, h = img.Height, stride = w * 4;
        var raw = new byte[h * (stride + 1)];
        var prev = new byte[stride];
        var cur = new byte[stride];
        var candidate = new byte[stride];
        var best = new byte[stride];
        for (var y = 0; y < h; y++)
        {
            for (var x = 0; x < w; x++)
            {
                var s = (y * w + x) * 4;
                cur[x * 4] = img.Pixels[s + 2];     // R
                cur[x * 4 + 1] = img.Pixels[s + 1]; // G
                cur[x * 4 + 2] = img.Pixels[s];     // B
                cur[x * 4 + 3] = img.Pixels[s + 3]; // A
            }
            byte bestType = 0;
            long bestScore = long.MaxValue;
            for (byte type = 0; type <= 4; type++)
            {
                long score = 0;
                for (var i = 0; i < stride; i++)
                {
                    int a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
                    var predictor = type switch { 0 => 0, 1 => a, 2 => b, 3 => (a + b) / 2, _ => Paeth(a, b, c) };
                    var v = (byte)(cur[i] - predictor);
                    candidate[i] = v;
                    score += v < 128 ? v : 256 - v;
                }
                if (score < bestScore) { bestScore = score; bestType = type; (best, candidate) = (candidate, best); }
            }
            raw[y * (stride + 1)] = bestType;
            Buffer.BlockCopy(best, 0, raw, y * (stride + 1) + 1, stride);
            (prev, cur) = (cur, prev);
        }

        using var ms = new MemoryStream();
        ms.Write(Signature);
        Span<byte> ihdr = stackalloc byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr, w);
        BinaryPrimitives.WriteInt32BigEndian(ihdr[4..], h);
        ihdr[8] = 8;  // bit depth
        ihdr[9] = 6;  // RGBA
        ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        Chunk(ms, "IHDR"u8, ihdr);
        using (var z = new MemoryStream())
        {
            using (var zl = new ZLibStream(z, CompressionLevel.SmallestSize, leaveOpen: true)) zl.Write(raw);
            Chunk(ms, "IDAT"u8, z.ToArray());
        }
        Chunk(ms, "IEND"u8, []);
        return ms.ToArray();
    }

    private static int Paeth(int a, int b, int c)
    {
        var p = a + b - c;
        int pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }

    private static void Chunk(Stream s, ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
    {
        Span<byte> len = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(len, data.Length);
        s.Write(len);
        s.Write(type);
        s.Write(data);
        var crc = Crc32(type, data);
        BinaryPrimitives.WriteUInt32BigEndian(len, crc);
        s.Write(len);
    }

    private static readonly uint[] CrcTable = BuildCrc();

    private static uint[] BuildCrc()
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

    private static uint Crc32(ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
    {
        var c = 0xFFFFFFFFu;
        foreach (var b in type) c = CrcTable[(c ^ b) & 0xFF] ^ (c >> 8);
        foreach (var b in data) c = CrcTable[(c ^ b) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFFu;
    }
}
