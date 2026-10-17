using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace PrismControl.Desktop;

public enum ArtFormat { Png, Jpeg }

/// <summary>An encoded image and its pixel size.</summary>
public sealed record ScaledArt(byte[] Bytes, string Mime, int Width, int Height);

/// <summary>
/// Decode (PNG, JPEG, WebP, ICO, GIF, BMP: whatever WIC decodes), resize to fit (Contain: aspect kept, never cropped,
/// no tint), and encode PNG or JPEG within a byte cap. WinRT imaging (WIC underneath), the same logic as Spotify's
/// ArtScaler (decode → Fant scale → encode), copied and extended. Untrusted input is fine: sizes are checked before
/// decoding, and every failure returns null.
/// </summary>
public static class ArtScaler
{
    /// <summary>Inputs larger than this are refused (favicons and album art are far smaller).</summary>
    public const int MaxSourceBytes = 16 * 1024 * 1024;
    /// <summary>Decoded images above this many pixels are refused (decompression bombs).</summary>
    public const long MaxSourcePixels = 64L * 1024 * 1024;
    /// <summary>The byte-cap loop never shrinks below this edge length.</summary>
    public const int MinEdge = 16;

    private static readonly double[] JpegQualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

    /// <summary>
    /// Fits <paramref name="source"/> inside <paramref name="maxWidth"/>×<paramref name="maxHeight"/> and encodes it in
    /// <paramref name="format"/>. When the result would exceed <paramref name="maxBytes"/>, JPEG steps the quality down
    /// (0.9 → 0.4), then both formats shrink by 15% steps. Null when undecodable, too large, or impossible under the cap.
    /// JPEG has no alpha: transparent areas come out black.
    /// </summary>
    public static async Task<ScaledArt?> ScaleAsync(byte[] source, int maxWidth, int maxHeight, ArtFormat format,
        int maxBytes = int.MaxValue, bool upscale = false, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        if (source.Length == 0 || source.Length > MaxSourceBytes || maxWidth < 1 || maxHeight < 1 || maxBytes < 1) return null;
        try
        {
            using var input = new InMemoryRandomAccessStream();
            await input.WriteAsync(source.AsBuffer()).AsTask(ct).ConfigureAwait(false);
            input.Seek(0);
            var decoder = await BitmapDecoder.CreateAsync(input).AsTask(ct).ConfigureAwait(false);
            var frame = await BestFrameAsync(decoder, ct).ConfigureAwait(false);
            var (w, h) = (frame.OrientedPixelWidth, frame.OrientedPixelHeight);
            if (w == 0 || h == 0 || (long)w * h > MaxSourcePixels) return null;

            var scale = Math.Min((double)maxWidth / w, (double)maxHeight / h);
            if (!upscale) scale = Math.Min(1.0, scale);
            var tw = Math.Max(1, (int)Math.Round(w * scale));
            var th = Math.Max(1, (int)Math.Round(h * scale));

            while (true)
            {
                ct.ThrowIfCancellationRequested();
                var alpha = format == ArtFormat.Png ? BitmapAlphaMode.Premultiplied : BitmapAlphaMode.Ignore;
                using var bitmap = await frame.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, alpha,
                    new BitmapTransform { ScaledWidth = (uint)tw, ScaledHeight = (uint)th, InterpolationMode = BitmapInterpolationMode.Fant },
                    ExifOrientationMode.RespectExifOrientation, ColorManagementMode.DoNotColorManage).AsTask(ct).ConfigureAwait(false);
                if (format == ArtFormat.Png)
                {
                    using var straight = SoftwareBitmap.Convert(bitmap, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Straight);
                    var png = await EncodeAsync(straight, BitmapEncoder.PngEncoderId, null, ct).ConfigureAwait(false);
                    if (png.Length <= maxBytes) return new ScaledArt(png, "image/png", bitmap.PixelWidth, bitmap.PixelHeight);
                }
                else
                {
                    foreach (var q in JpegQualities)
                    {
                        var jpeg = await EncodeAsync(bitmap, BitmapEncoder.JpegEncoderId, q, ct).ConfigureAwait(false);
                        if (jpeg.Length <= maxBytes) return new ScaledArt(jpeg, "image/jpeg", bitmap.PixelWidth, bitmap.PixelHeight);
                    }
                }
                if (Math.Min(tw, th) <= MinEdge) return null;
                tw = Math.Max(MinEdge, (int)(tw * 0.85));
                th = Math.Max(MinEdge, (int)(th * 0.85));
            }
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { return null; }
    }

    /// <summary>A JPEG whose longer side is at most <paramref name="maxPx"/> (Spotify's signature). Null if decoding failed.</summary>
    public static async Task<byte[]?> ToJpegAsync(byte[] source, int maxPx, int maxBytes = int.MaxValue, CancellationToken ct = default) =>
        (await ScaleAsync(source, maxPx, maxPx, ArtFormat.Jpeg, maxBytes, upscale: false, ct).ConfigureAwait(false))?.Bytes;

    /// <summary>A PNG (alpha kept) whose longer side is at most <paramref name="maxPx"/>. Null if decoding failed.</summary>
    public static async Task<byte[]?> ToPngAsync(byte[] source, int maxPx, int maxBytes = int.MaxValue, CancellationToken ct = default) =>
        (await ScaleAsync(source, maxPx, maxPx, ArtFormat.Png, maxBytes, upscale: false, ct).ConfigureAwait(false))?.Bytes;

    /// <summary>ICO files hold several sizes: take the largest. Everything else: the first frame.</summary>
    private static async Task<BitmapFrame> BestFrameAsync(BitmapDecoder decoder, CancellationToken ct)
    {
        if (decoder.FrameCount <= 1 || decoder.DecoderInformation?.CodecId != BitmapDecoder.IcoDecoderId)
            return await decoder.GetFrameAsync(0).AsTask(ct).ConfigureAwait(false);
        BitmapFrame? best = null;
        for (uint i = 0; i < Math.Min(decoder.FrameCount, 32u); i++)
        {
            var f = await decoder.GetFrameAsync(i).AsTask(ct).ConfigureAwait(false);
            if (best is null || f.PixelWidth * f.PixelHeight > best.PixelWidth * best.PixelHeight) best = f;
        }
        return best!;
    }

    private static async Task<byte[]> EncodeAsync(SoftwareBitmap bitmap, Guid encoderId, double? quality, CancellationToken ct)
    {
        using var output = new InMemoryRandomAccessStream();
        var encoder = quality is { } q
            ? await BitmapEncoder.CreateAsync(encoderId, output, new BitmapPropertySet { { "ImageQuality", new BitmapTypedValue(q, Windows.Foundation.PropertyType.Single) } }).AsTask(ct).ConfigureAwait(false)
            : await BitmapEncoder.CreateAsync(encoderId, output).AsTask(ct).ConfigureAwait(false);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync().AsTask(ct).ConfigureAwait(false);
        var bytes = new byte[output.Size];
        output.Seek(0);
        using (var s = output.AsStreamForRead()) await s.ReadExactlyAsync(bytes, ct).ConfigureAwait(false);
        return bytes;
    }
}
