using System.Runtime.CompilerServices;

namespace PrismControl.Sight.Imaging;

/// <summary>The pixel format a capture delivers.</summary>
public enum CapturePixelFormat
{
    /// <summary>B8G8R8A8 UNORM, sRGB-encoded. What WGC gives for SDR outputs.</summary>
    Bgra8,
    /// <summary>R16G16B16A16 FLOAT, linear scRGB (1.0 = 80 nits). What WGC gives when asked for FP16, on HDR and SDR outputs.</summary>
    ScRgbFp16,
}

/// <summary>
/// The HDR/SDR normalization every detector depends on. All detectors read sRGB-encoded 8-bit pixels in which the
/// game's HUD white is 255. On an SDR output that is what the capture delivers. On an HDR output the capture is taken
/// in FP16 scRGB (linear light, 1.0 = 80 nits) and each region is divided by the <b>paper white</b> (the scRGB value of
/// the HUD's white: the monitor's SDR white level for SDR games, the game's UI brightness for HDR games), clipped to
/// [0, 1] and sRGB-encoded. Highlights above paper white clip, which is harmless for HUD reading. See NOTES.md (HDR).
/// </summary>
public static class ColorPipeline
{
    /// <summary>scRGB 1.0 is 80 nits.</summary>
    public const double ScRgbNits = 80.0;

    private static readonly float[] SrgbToLinearLut = BuildSrgbToLinear();
    private static readonly byte[] LinearToSrgbLut = BuildLinearToSrgb();
    private const int LinearLutSize = 4096;
    private static float[]? _halfLut;

    /// <summary>Paper white in scRGB units for a white level in nits (e.g. 284 nits → 3.55).</summary>
    public static double PaperWhiteFromNits(double nits) => nits / ScRgbNits;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static float SrgbToLinear(byte v) => SrgbToLinearLut[v];

    public static double SrgbToLinear(double v) => v <= 0.04045 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4);

    public static double LinearToSrgb(double v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.Pow(v, 1 / 2.4) - 0.055;

    /// <summary>Linear 0..1 (clipped) → sRGB 8-bit.</summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static byte LinearToSrgb8(float v)
    {
        if (!(v > 0)) return 0;   // also NaN
        if (v >= 1) return 255;
        return LinearToSrgbLut[(int)(v * LinearLutSize + 0.5f)];
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static float HalfToFloat(ushort bits) => (_halfLut ??= BuildHalfLut())[bits];

    /// <summary>
    /// Converts one run of R16G16B16A16 FLOAT scRGB pixels (8 bytes each) to BGRA8 sRGB, dividing by
    /// <paramref name="paperWhite"/> (scRGB units). Negative and NaN components (out-of-gamut scRGB) clip to 0.
    /// </summary>
    public static void ScRgbToSrgb8(ReadOnlySpan<byte> rgbaHalf, Span<byte> bgra, int pixels, double paperWhite)
    {
        // One lookup per channel: half bits -> sRGB8 for this paper white (64 KB, rebuilt only when paper white changes).
        var lut = Srgb8LutFor(paperWhite);
        if (rgbaHalf.Length < pixels * 8 || bgra.Length < pixels * 4) throw new ArgumentException("buffers too small");
        unsafe
        {
            fixed (byte* sp = rgbaHalf, dp = bgra, lp = lut)
            {
                var s = (ushort*)sp;
                var d = dp;
                for (var i = 0; i < pixels; i++, s += 4, d += 4)
                {
                    d[2] = lp[s[0]];
                    d[1] = lp[s[1]];
                    d[0] = lp[s[2]];
                    d[3] = 255;
                }
            }
        }
    }

    private static Tuple<double, byte[]>? _srgb8Lut;

    /// <summary>The half-float bits to sRGB8 table for a paper white (cached; thread-safe by atomic replacement).</summary>
    internal static byte[] Srgb8LutFor(double paperWhite)
    {
        var key = Math.Round(Math.Max(1e-3, paperWhite), 4);
        var c = Volatile.Read(ref _srgb8Lut);
        if (c is not null && c.Item1 == key) return c.Item2;
        var halves = _halfLut ??= BuildHalfLut();
        var k = (float)(1.0 / key);
        var lut = new byte[65536];
        for (var i = 0; i < 65536; i++) lut[i] = LinearToSrgb8(halves[i] * k);
        Volatile.Write(ref _srgb8Lut, Tuple.Create(key, lut));
        return lut;
    }

    /// <summary>A whole FP16 scRGB image (rows of <paramref name="width"/> pixels, <paramref name="rowPitch"/> bytes) → <see cref="SightImage"/>.</summary>
    public static SightImage ScRgbToImage(ReadOnlySpan<byte> rgbaHalf, int width, int height, int rowPitch, double paperWhite)
    {
        var img = new SightImage(width, height);
        for (var y = 0; y < height; y++)
            ScRgbToSrgb8(rgbaHalf.Slice(y * rowPitch, width * 8), img.Pixels.AsSpan(y * width * 4, width * 4), width, paperWhite);
        return img;
    }

    /// <summary>
    /// Simulates what an HDR output shows for SDR (or HDR-UI) content: sRGB → linear × paper white → FP16 scRGB
    /// (R16G16B16A16, 8 bytes per pixel). Tests and the synthetic HDR game use it; the inverse is <see cref="ScRgbToImage"/>.
    /// </summary>
    public static byte[] ImageToScRgb(SightImage img, double paperWhite)
    {
        var dst = new byte[img.Width * img.Height * 8];
        var d = System.Runtime.InteropServices.MemoryMarshal.Cast<byte, Half>(dst.AsSpan());
        var p = img.Pixels;
        for (int i = 0, s = 0; i < img.Width * img.Height; i++, s += 4)
        {
            d[i * 4] = (Half)(SrgbToLinearLut[p[s + 2]] * paperWhite);
            d[i * 4 + 1] = (Half)(SrgbToLinearLut[p[s + 1]] * paperWhite);
            d[i * 4 + 2] = (Half)(SrgbToLinearLut[p[s]] * paperWhite);
            d[i * 4 + 3] = (Half)1f;
        }
        return dst;
    }

    /// <summary>
    /// Estimates paper white from a region known to contain HUD white (text or an icon): the mean of the brightest
    /// <paramref name="topFraction"/> of pixels' max-channel linear values, divided by the expected encoded level.
    /// Returns null when the region is too dark to be a white reference.
    /// </summary>
    public static double? EstimatePaperWhite(ReadOnlySpan<byte> rgbaHalf, int pixels, double expectedLevel = 1.0, double topFraction = 0.05)
    {
        if (pixels <= 0) return null;
        var lut = _halfLut ??= BuildHalfLut();
        var src = System.Runtime.InteropServices.MemoryMarshal.Cast<byte, ushort>(rgbaHalf);
        var v = new float[pixels];
        for (int i = 0, s = 0; i < pixels; i++, s += 4)
        {
            var m = Math.Max(lut[src[s]], Math.Max(lut[src[s + 1]], lut[src[s + 2]]));
            v[i] = float.IsFinite(m) ? m : 0;
        }
        Array.Sort(v);
        var n = Math.Max(1, (int)(pixels * topFraction));
        double sum = 0;
        for (var i = pixels - n; i < pixels; i++) sum += v[i];
        var top = sum / n;
        var expectedLinear = SrgbToLinear(Math.Clamp(expectedLevel, 0.05, 1.0));
        if (top < 0.25) return null;   // below 20 nits: not a lit HUD element
        return top / expectedLinear;
    }

    private static float[] BuildSrgbToLinear()
    {
        var t = new float[256];
        for (var i = 0; i < 256; i++) t[i] = (float)SrgbToLinear(i / 255.0);
        return t;
    }

    private static byte[] BuildLinearToSrgb()
    {
        var t = new byte[LinearLutSize + 1];
        for (var i = 0; i <= LinearLutSize; i++) t[i] = (byte)Math.Clamp(Math.Round(LinearToSrgb((double)i / LinearLutSize) * 255), 0, 255);
        return t;
    }

    private static float[] BuildHalfLut()
    {
        var t = new float[65536];
        for (var i = 0; i < 65536; i++)
        {
            var f = (float)BitConverter.UInt16BitsToHalf((ushort)i);
            t[i] = float.IsFinite(f) ? f : 0f;
        }
        return t;
    }
}
