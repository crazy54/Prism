using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// Generated, fictional "album covers" for tests and previews (no real artwork anywhere): an abstract gradient with
/// rings, encoded with WinRT imaging as JPEG (like Spotify's CDN) or PNG (like the SMTC thumbnail).
/// </summary>
public static class FictionalArt
{
    private static readonly Lazy<byte[]> Jpeg300Lazy = new(() => Encode(300, 300, 0, BitmapEncoder.JpegEncoderId));
    private static readonly Lazy<byte[]> Jpeg64Lazy = new(() => Encode(64, 64, 0, BitmapEncoder.JpegEncoderId));
    private static readonly Lazy<byte[]> Png300Lazy = new(() => Encode(300, 300, 1, BitmapEncoder.PngEncoderId));
    private static readonly Lazy<byte[]> Jpeg300AltLazy = new(() => Encode(300, 300, 2, BitmapEncoder.JpegEncoderId));
    private static readonly Lazy<byte[]> Jpeg64AltLazy = new(() => Encode(64, 64, 2, BitmapEncoder.JpegEncoderId));
    private static readonly Lazy<byte[]> WidePngLazy = new(() => Encode(400, 240, 3, BitmapEncoder.PngEncoderId));

    /// <summary>"Examples Vol. 1" by The Example Ensemble, 300×300 JPEG.</summary>
    public static byte[] Jpeg300 => Jpeg300Lazy.Value;
    public static byte[] Jpeg64 => Jpeg64Lazy.Value;
    /// <summary>The same kind of cover as a 300×300 PNG (what Spotify's SMTC thumbnail looks like).</summary>
    public static byte[] Png300 => Png300Lazy.Value;
    /// <summary>A second, different cover (playlist mosaics).</summary>
    public static byte[] Jpeg300Alt => Jpeg300AltLazy.Value;
    public static byte[] Jpeg64Alt => Jpeg64AltLazy.Value;
    /// <summary>A non-square custom playlist image (must be letterboxed, never cropped).</summary>
    public static byte[] WidePng => WidePngLazy.Value;

    private static byte[] Encode(int w, int h, int variant, Guid encoderId) =>
        Task.Run(async () =>
        {
            var px = Pixels(w, h, variant);
            using var stream = new InMemoryRandomAccessStream();
            var enc = await BitmapEncoder.CreateAsync(encoderId, stream);
            enc.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, (uint)w, (uint)h, 96, 96, px);
            await enc.FlushAsync();
            var bytes = new byte[stream.Size];
            stream.Seek(0);
            using (var s = stream.AsStreamForRead()) await s.ReadExactlyAsync(bytes);
            return bytes;
        }).GetAwaiter().GetResult();

    private static byte[] Pixels(int w, int h, int variant)
    {
        var px = new byte[w * h * 4];
        (double R, double G, double B) a, b;
        switch (variant)
        {
            case 2: a = (238, 140, 90); b = (60, 40, 120); break;     // warm sunset
            case 3: a = (40, 120, 200); b = (20, 30, 60); break;      // deep blue (wide)
            default: a = (170, 140, 245); b = (20, 160, 150); break;  // violet → teal
        }
        double cx = w * 0.62, cy = h * 0.42, rmax = Math.Min(w, h) * 0.45;
        for (var y = 0; y < h; y++)
        for (var x = 0; x < w; x++)
        {
            var t = (x / (double)w * 0.6 + y / (double)h * 0.4);
            double r = a.R + (b.R - a.R) * t, g = a.G + (b.G - a.G) * t, bl = a.B + (b.B - a.B) * t;
            var dist = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            if (dist < rmax)
            {
                var ring = Math.Abs(Math.Sin(dist / rmax * Math.PI * 5));
                var k = 0.25 * ring;
                r = r * (1 - k) + 255 * k; g = g * (1 - k) + 245 * k; bl = bl * (1 - k) + 230 * k;
            }
            if (y > h * 0.8) { r *= 0.55; g *= 0.55; bl *= 0.6; }   // a dark band, like a printed title strip
            var i = (y * w + x) * 4;
            px[i] = (byte)Math.Clamp(bl, 0, 255);
            px[i + 1] = (byte)Math.Clamp(g, 0, 255);
            px[i + 2] = (byte)Math.Clamp(r, 0, 255);
            px[i + 3] = 255;
        }
        return px;
    }
}
