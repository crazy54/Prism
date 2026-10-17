using System.Runtime.CompilerServices;

namespace PrismControl.Sight.Imaging;

/// <summary>An integer pixel rectangle (X, Y, W, H). Never negative in size.</summary>
public readonly record struct PixelRect(int X, int Y, int W, int H)
{
    public int Right => X + W;
    public int Bottom => Y + H;
    public bool IsEmpty => W <= 0 || H <= 0;
    public int Area => Math.Max(0, W) * Math.Max(0, H);

    /// <summary>The intersection with [0, width) × [0, height).</summary>
    public PixelRect ClampTo(int width, int height)
    {
        var x0 = Math.Clamp(X, 0, width);
        var y0 = Math.Clamp(Y, 0, height);
        var x1 = Math.Clamp(Right, 0, width);
        var y1 = Math.Clamp(Bottom, 0, height);
        return new PixelRect(x0, y0, Math.Max(0, x1 - x0), Math.Max(0, y1 - y0));
    }

    public PixelRect Offset(int dx, int dy) => this with { X = X + dx, Y = Y + dy };

    public override string ToString() => $"{X},{Y} {W}x{H}";
}

/// <summary>One BGRA pixel (sRGB-encoded, 8 bits per channel).</summary>
public readonly record struct Bgra(byte B, byte G, byte R, byte A = 255)
{
    public static Bgra FromRgb(byte r, byte g, byte b) => new(b, g, r, 255);

    /// <summary>"#RRGGBB" or "#RGB".</summary>
    public static Bgra Parse(string hex)
    {
        if (!TryParse(hex, out var c)) throw new FormatException($"'{hex}' is not a #RRGGBB color");
        return c;
    }

    public static bool TryParse(string? hex, out Bgra color)
    {
        color = default;
        if (string.IsNullOrEmpty(hex) || hex[0] != '#') return false;
        var s = hex[1..];
        if (s.Length == 3) s = string.Concat(s[0], s[0], s[1], s[1], s[2], s[2]);
        if (s.Length != 6 || !uint.TryParse(s, System.Globalization.NumberStyles.HexNumber, null, out var v)) return false;
        color = FromRgb((byte)(v >> 16), (byte)(v >> 8), (byte)v);
        return true;
    }

    public string ToHex() => $"#{R:x2}{G:x2}{B:x2}";

    /// <summary>Rec. 709 luma of the encoded values, 0..1 (what "brightness" means for HUD pixels).</summary>
    public double Luma => (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255.0;

    /// <summary>The largest per-channel difference (0..255): a cheap, predictable color tolerance.</summary>
    public int MaxChannelDistance(Bgra o) => Math.Max(Math.Abs(R - o.R), Math.Max(Math.Abs(G - o.G), Math.Abs(B - o.B)));
}

/// <summary>
/// An 8-bit BGRA image, sRGB-encoded, top-down, tightly packed (stride = Width × 4). Every detector reads this format:
/// SDR captures arrive like this; HDR captures are converted to it first (see <see cref="ColorPipeline"/>), which is what
/// makes detectors behave identically on HDR and SDR.
/// </summary>
public sealed class SightImage
{
    public SightImage(int width, int height) : this(width, height, new byte[checked(width * height * 4)]) { }

    public SightImage(int width, int height, byte[] pixels)
    {
        if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width), "image size must be positive");
        if (pixels.Length < width * height * 4) throw new ArgumentException("pixel buffer too small", nameof(pixels));
        Width = width;
        Height = height;
        Pixels = pixels;
    }

    public int Width { get; }
    public int Height { get; }
    public byte[] Pixels { get; }
    public int Stride => Width * 4;

    public static SightImage Filled(int width, int height, Bgra c)
    {
        var img = new SightImage(width, height);
        img.Fill(c);
        return img;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public Bgra Get(int x, int y)
    {
        var i = (y * Width + x) * 4;
        return new Bgra(Pixels[i], Pixels[i + 1], Pixels[i + 2], Pixels[i + 3]);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void Set(int x, int y, Bgra c)
    {
        var i = (y * Width + x) * 4;
        Pixels[i] = c.B; Pixels[i + 1] = c.G; Pixels[i + 2] = c.R; Pixels[i + 3] = c.A;
    }

    public void Fill(Bgra c) => FillRect(new PixelRect(0, 0, Width, Height), c);

    public void FillRect(PixelRect r, Bgra c)
    {
        r = r.ClampTo(Width, Height);
        for (var y = r.Y; y < r.Bottom; y++)
        {
            var i = (y * Width + r.X) * 4;
            for (var x = 0; x < r.W; x++, i += 4)
            {
                Pixels[i] = c.B; Pixels[i + 1] = c.G; Pixels[i + 2] = c.R; Pixels[i + 3] = c.A;
            }
        }
    }

    /// <summary>Alpha-blends <paramref name="c"/> over the rectangle with <paramref name="opacity"/> (0..1).</summary>
    public void BlendRect(PixelRect r, Bgra c, double opacity)
    {
        r = r.ClampTo(Width, Height);
        var a = Math.Clamp(opacity, 0, 1);
        for (var y = r.Y; y < r.Bottom; y++)
        {
            var i = (y * Width + r.X) * 4;
            for (var x = 0; x < r.W; x++, i += 4)
            {
                Pixels[i] = (byte)Math.Round(Pixels[i] * (1 - a) + c.B * a);
                Pixels[i + 1] = (byte)Math.Round(Pixels[i + 1] * (1 - a) + c.G * a);
                Pixels[i + 2] = (byte)Math.Round(Pixels[i + 2] * (1 - a) + c.R * a);
                Pixels[i + 3] = 255;
            }
        }
    }

    /// <summary>A copy of <paramref name="r"/> (clamped to the image; an empty intersection gives a 1×1 black image).</summary>
    public SightImage Crop(PixelRect r)
    {
        r = r.ClampTo(Width, Height);
        if (r.IsEmpty) return new SightImage(1, 1);
        var dst = new SightImage(r.W, r.H);
        for (var y = 0; y < r.H; y++)
            Buffer.BlockCopy(Pixels, ((r.Y + y) * Width + r.X) * 4, dst.Pixels, y * r.W * 4, r.W * 4);
        return dst;
    }

    /// <summary>Copies <paramref name="src"/> to (x, y), clipped.</summary>
    public void Blit(SightImage src, int x, int y)
    {
        for (var sy = 0; sy < src.Height; sy++)
        {
            var dy = y + sy;
            if (dy < 0 || dy >= Height) continue;
            var sx0 = Math.Max(0, -x);
            var sx1 = Math.Min(src.Width, Width - x);
            if (sx1 <= sx0) continue;
            Buffer.BlockCopy(src.Pixels, (sy * src.Width + sx0) * 4, Pixels, (dy * Width + x + sx0) * 4, (sx1 - sx0) * 4);
        }
    }

    public SightImage Clone() => new(Width, Height, (byte[])Pixels.Clone());

    /// <summary>Bilinear resize (encoded values; fine for HUD reading).</summary>
    public SightImage Resize(int width, int height)
    {
        if (width == Width && height == Height) return Clone();
        var dst = new SightImage(Math.Max(1, width), Math.Max(1, height));
        double sx = (double)Width / dst.Width, sy = (double)Height / dst.Height;
        for (var y = 0; y < dst.Height; y++)
        {
            var fy = (y + 0.5) * sy - 0.5;
            var y0 = Math.Clamp((int)Math.Floor(fy), 0, Height - 1);
            var y1 = Math.Min(y0 + 1, Height - 1);
            var wy = Math.Clamp(fy - y0, 0, 1);
            for (var x = 0; x < dst.Width; x++)
            {
                var fx = (x + 0.5) * sx - 0.5;
                var x0 = Math.Clamp((int)Math.Floor(fx), 0, Width - 1);
                var x1 = Math.Min(x0 + 1, Width - 1);
                var wx = Math.Clamp(fx - x0, 0, 1);
                var o = (y * dst.Width + x) * 4;
                for (var c = 0; c < 4; c++)
                {
                    var v = Pixels[(y0 * Width + x0) * 4 + c] * (1 - wx) * (1 - wy) + Pixels[(y0 * Width + x1) * 4 + c] * wx * (1 - wy)
                          + Pixels[(y1 * Width + x0) * 4 + c] * (1 - wx) * wy + Pixels[(y1 * Width + x1) * 4 + c] * wx * wy;
                    dst.Pixels[o + c] = (byte)Math.Clamp(Math.Round(v), 0, 255);
                }
            }
        }
        return dst;
    }

    /// <summary>Rec. 709 luma (0..1) of every pixel.</summary>
    public GrayImage ToGray()
    {
        var g = new GrayImage(Width, Height);
        var p = Pixels;
        for (int i = 0, j = 0; j < g.Data.Length; i += 4, j++)
            g.Data[j] = (0.0722f * p[i] + 0.7152f * p[i + 1] + 0.2126f * p[i + 2]) * (1f / 255f);
        return g;
    }
}

/// <summary>A single-channel float image (0..1 unless stated otherwise), row-major.</summary>
public sealed class GrayImage
{
    public GrayImage(int width, int height) : this(width, height, new float[checked(width * height)]) { }

    public GrayImage(int width, int height, float[] data)
    {
        if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width), "image size must be positive");
        if (data.Length < width * height) throw new ArgumentException("buffer too small", nameof(data));
        Width = width;
        Height = height;
        Data = data;
    }

    public int Width { get; }
    public int Height { get; }
    public float[] Data { get; }

    public float this[int x, int y]
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)] get => Data[y * Width + x];
        [MethodImpl(MethodImplOptions.AggressiveInlining)] set => Data[y * Width + x] = value;
    }

    public GrayImage Crop(PixelRect r)
    {
        r = r.ClampTo(Width, Height);
        if (r.IsEmpty) return new GrayImage(1, 1);
        var g = new GrayImage(r.W, r.H);
        for (var y = 0; y < r.H; y++) Array.Copy(Data, (r.Y + y) * Width + r.X, g.Data, y * r.W, r.W);
        return g;
    }

    /// <summary>Area-averaging when shrinking, bilinear when growing.</summary>
    public GrayImage Resize(int width, int height)
    {
        width = Math.Max(1, width);
        height = Math.Max(1, height);
        if (width == Width && height == Height) return new GrayImage(Width, Height, (float[])Data.Clone());
        var dst = new GrayImage(width, height);
        if (width <= Width && height <= Height)
        {
            double sx = (double)Width / width, sy = (double)Height / height;
            for (var y = 0; y < height; y++)
            {
                double ya = y * sy, yb = (y + 1) * sy;
                for (var x = 0; x < width; x++)
                {
                    double xa = x * sx, xb = (x + 1) * sx, sum = 0, wsum = 0;
                    for (var iy = (int)ya; iy < Math.Min(Height, (int)Math.Ceiling(yb)); iy++)
                    {
                        var wy = Math.Min(yb, iy + 1) - Math.Max(ya, iy);
                        if (wy <= 0) continue;
                        for (var ix = (int)xa; ix < Math.Min(Width, (int)Math.Ceiling(xb)); ix++)
                        {
                            var wx = Math.Min(xb, ix + 1) - Math.Max(xa, ix);
                            if (wx <= 0) continue;
                            sum += Data[iy * Width + ix] * wx * wy;
                            wsum += wx * wy;
                        }
                    }
                    dst.Data[y * width + x] = (float)(wsum > 0 ? sum / wsum : 0);
                }
            }
            return dst;
        }
        double bx = (double)Width / width, by = (double)Height / height;
        for (var y = 0; y < height; y++)
        {
            var fy = (y + 0.5) * by - 0.5;
            var y0 = Math.Clamp((int)Math.Floor(fy), 0, Height - 1);
            var y1 = Math.Min(y0 + 1, Height - 1);
            var wy = (float)Math.Clamp(fy - y0, 0, 1);
            for (var x = 0; x < width; x++)
            {
                var fx = (x + 0.5) * bx - 0.5;
                var x0 = Math.Clamp((int)Math.Floor(fx), 0, Width - 1);
                var x1 = Math.Min(x0 + 1, Width - 1);
                var wx = (float)Math.Clamp(fx - x0, 0, 1);
                dst.Data[y * width + x] = Data[y0 * Width + x0] * (1 - wx) * (1 - wy) + Data[y0 * Width + x1] * wx * (1 - wy)
                                        + Data[y1 * Width + x0] * (1 - wx) * wy + Data[y1 * Width + x1] * wx * wy;
            }
        }
        return dst;
    }

    /// <summary>A 3×3 box blur (edges clamped): makes template matching tolerant to text hinting and sub-pixel scale.</summary>
    public GrayImage BoxBlur3()
    {
        var dst = new GrayImage(Width, Height);
        for (var y = 0; y < Height; y++)
        {
            int y0 = Math.Max(0, y - 1), y1 = Math.Min(Height - 1, y + 1);
            for (var x = 0; x < Width; x++)
            {
                int x0 = Math.Max(0, x - 1), x1 = Math.Min(Width - 1, x + 1);
                float sum = 0;
                for (var yy = y0; yy <= y1; yy++)
                    for (var xx = x0; xx <= x1; xx++) sum += Data[yy * Width + xx];
                dst.Data[y * Width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
            }
        }
        return dst;
    }

    public (float Min, float Max, float Mean) Stats()
    {
        float mn = float.MaxValue, mx = float.MinValue;
        double sum = 0;
        foreach (var v in Data.AsSpan(0, Width * Height)) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
        return (mn, mx, (float)(sum / (Width * Height)));
    }

    /// <summary>To an 8-bit gray BGRA image (for PNG export and OCR).</summary>
    public SightImage ToBgra()
    {
        var img = new SightImage(Width, Height);
        for (var i = 0; i < Width * Height; i++)
        {
            var v = (byte)Math.Clamp(Math.Round(Data[i] * 255), 0, 255);
            img.Pixels[i * 4] = v; img.Pixels[i * 4 + 1] = v; img.Pixels[i * 4 + 2] = v; img.Pixels[i * 4 + 3] = 255;
        }
        return img;
    }
}
