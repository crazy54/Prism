using System.Buffers.Binary;
using System.IO.Compression;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace PrismControl.WinShell.Shared;

/// <summary>A BGRA8 image in memory (top-down rows, stride = width × 4).</summary>
public sealed class BgraImage(int width, int height, byte[] pixels)
{
    public int Width { get; } = width;
    public int Height { get; } = height;
    public byte[] Pixels { get; } = pixels;

    public static BgraImage Create(int width, int height) => new(width, height, new byte[width * height * 4]);
}

/// <summary>Image helpers: box downscaling, a dependency-free PNG writer, and JPEG through WinRT's BitmapEncoder (WIC).</summary>
public static class ImageCodec
{
    /// <summary>The largest size that fits <paramref name="maxW"/>×<paramref name="maxH"/> keeping the aspect ratio (at least 1×1).</summary>
    public static (int W, int H) FitInside(int srcW, int srcH, int maxW, int maxH)
    {
        if (srcW <= 0 || srcH <= 0) return (Math.Max(1, maxW), Math.Max(1, maxH));
        var s = Math.Min((double)maxW / srcW, (double)maxH / srcH);
        if (s > 1) s = 1; // never upscale a thumbnail
        return (Math.Max(1, (int)Math.Round(srcW * s)), Math.Max(1, (int)Math.Round(srcH * s)));
    }

    /// <summary>
    /// Area-average downscale of a BGRA region (<paramref name="srcW"/>×<paramref name="srcH"/> at <paramref name="src"/>
    /// with <paramref name="stride"/> bytes per row) into a new image. Alpha is forced opaque: thumbnails are composited
    /// on the key, and WGC leaves alpha undefined for most windows.
    /// </summary>
    public static unsafe BgraImage Downscale(byte* src, int srcW, int srcH, int stride, int dstW, int dstH)
    {
        var dst = BgraImage.Create(dstW, dstH);
        fixed (byte* d = dst.Pixels)
        {
            for (var y = 0; y < dstH; y++)
            {
                var y0 = (int)((long)y * srcH / dstH);
                var y1 = Math.Max(y0 + 1, (int)((long)(y + 1) * srcH / dstH));
                for (var x = 0; x < dstW; x++)
                {
                    var x0 = (int)((long)x * srcW / dstW);
                    var x1 = Math.Max(x0 + 1, (int)((long)(x + 1) * srcW / dstW));
                    uint b = 0, g = 0, r = 0, n = 0;
                    // Cap the samples per output pixel (a 4×4 grid) so huge ratios stay cheap.
                    var sy = Math.Max(1, (y1 - y0) / 4);
                    var sx = Math.Max(1, (x1 - x0) / 4);
                    for (var yy = y0; yy < y1; yy += sy)
                    {
                        var row = src + (long)yy * stride;
                        for (var xx = x0; xx < x1; xx += sx)
                        {
                            var p = row + xx * 4;
                            b += p[0]; g += p[1]; r += p[2]; n++;
                        }
                    }
                    var o = d + ((long)y * dstW + x) * 4;
                    o[0] = (byte)(b / n); o[1] = (byte)(g / n); o[2] = (byte)(r / n); o[3] = 255;
                }
            }
        }
        return dst;
    }

    public static unsafe BgraImage Downscale(BgraImage src, int dstW, int dstH)
    {
        fixed (byte* p = src.Pixels) return Downscale(p, src.Width, src.Height, src.Width * 4, dstW, dstH);
    }

    /// <summary>JPEG through BitmapEncoder (WIC). About 0.6–1.7 ms for a key-sized frame on this PC (probe "encode").</summary>
    public static async Task<byte[]> EncodeJpegAsync(BgraImage img, double quality = 0.8)
    {
        using var stream = new InMemoryRandomAccessStream();
        var props = new BitmapPropertySet { { "ImageQuality", new BitmapTypedValue(quality, Windows.Foundation.PropertyType.Single) } };
        var enc = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, stream, props);
        enc.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, (uint)img.Width, (uint)img.Height, 96, 96, img.Pixels);
        await enc.FlushAsync();
        var size = (uint)stream.Size;
        var buffer = new Windows.Storage.Streams.Buffer(size);
        stream.Seek(0);
        var read = await stream.ReadAsync(buffer, size, InputStreamOptions.None);
        return read.ToArray();
    }

    /// <summary>Decodes a PNG/JPEG/ICO/BMP into BGRA (premultiplied alpha is converted to straight).</summary>
    public static async Task<BgraImage?> DecodeAsync(byte[] data)
    {
        try
        {
            using var stream = new InMemoryRandomAccessStream();
            await stream.WriteAsync(data.AsBuffer());
            stream.Seek(0);
            var dec = await BitmapDecoder.CreateAsync(stream);
            var px = await dec.GetPixelDataAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Straight, new BitmapTransform(),
                ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage);
            return new BgraImage((int)dec.PixelWidth, (int)dec.PixelHeight, px.DetachPixelData());
        }
        catch { return null; }
    }

    /// <summary>
    /// A minimal PNG writer (RGBA8, zlib from the BCL, no filters except None). Used for icons and test fixtures; the
    /// output is a valid PNG that <see cref="PrismControl.Core.Render.ImageInfo"/> probes.
    /// </summary>
    public static byte[] EncodePng(BgraImage img, bool premultiplied = false)
    {
        var raw = new byte[img.Height * (img.Width * 4 + 1)];
        var s = img.Pixels;
        var o = 0;
        for (var y = 0; y < img.Height; y++)
        {
            raw[o++] = 0; // filter: None
            for (var x = 0; x < img.Width; x++)
            {
                var i = (y * img.Width + x) * 4;
                byte b = s[i], g = s[i + 1], r = s[i + 2], a = s[i + 3];
                if (premultiplied && a is > 0 and < 255)
                {
                    r = (byte)Math.Min(255, r * 255 / a);
                    g = (byte)Math.Min(255, g * 255 / a);
                    b = (byte)Math.Min(255, b * 255 / a);
                }
                raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
            }
        }
        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        Span<byte> ihdr = stackalloc byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr, img.Width);
        BinaryPrimitives.WriteInt32BigEndian(ihdr[4..], img.Height);
        ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        Chunk(ms, "IHDR", ihdr);
        using (var z = new MemoryStream())
        {
            using (var zs = new ZLibStream(z, CompressionLevel.Fastest, leaveOpen: true)) zs.Write(raw);
            Chunk(ms, "IDAT", z.ToArray());
        }
        Chunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, ReadOnlySpan<byte> data)
    {
        Span<byte> len = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(len, data.Length);
        s.Write(len);
        Span<byte> t = stackalloc byte[4];
        for (var i = 0; i < 4; i++) t[i] = (byte)type[i];
        s.Write(t);
        s.Write(data);
        var crc = Crc32(t, 0xFFFFFFFF);
        crc = Crc32(data, crc) ^ 0xFFFFFFFF;
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
            for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
            t[n] = c;
        }
        return t;
    }

    private static uint Crc32(ReadOnlySpan<byte> data, uint crc)
    {
        foreach (var b in data) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc;
    }
}
