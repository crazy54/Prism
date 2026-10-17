using System.Runtime.InteropServices.WindowsRuntime;
using PrismControl.Desktop.Interop;
using PrismControl.Testing;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace PrismControl.Desktop.Tests;

internal static class Img
{
    /// <summary>Decodes with WinRT (an independent decoder) to straight BGRA.</summary>
    public static async Task<(int W, int H, byte[] Px, Guid Codec)> DecodeAsync(byte[] bytes)
    {
        using var s = new InMemoryRandomAccessStream();
        await s.WriteAsync(bytes.AsBuffer());
        s.Seek(0);
        var d = await BitmapDecoder.CreateAsync(s);
        var data = await d.GetPixelDataAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Straight, new BitmapTransform(), ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage);
        return ((int)d.PixelWidth, (int)d.PixelHeight, data.DetachPixelData(), d.DecoderInformation.CodecId);
    }

    /// <summary>Encodes synthetic straight BGRA with WinRT (PNG or JPEG).</summary>
    public static async Task<byte[]> EncodeAsync(int w, int h, Func<int, int, (byte B, byte G, byte R, byte A)> pixel, Guid encoder)
    {
        var px = new byte[w * h * 4];
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var (pb, pg, pr, pa) = pixel(x, y);
                var i = (y * w + x) * 4;
                px[i] = pb; px[i + 1] = pg; px[i + 2] = pr; px[i + 3] = pa;
            }
        using var s = new InMemoryRandomAccessStream();
        var e = await BitmapEncoder.CreateAsync(encoder, s);
        e.SetPixelData(BitmapPixelFormat.Bgra8, encoder == BitmapEncoder.JpegEncoderId ? BitmapAlphaMode.Ignore : BitmapAlphaMode.Straight, (uint)w, (uint)h, 96, 96, px);
        await e.FlushAsync();
        var bytes = new byte[s.Size];
        s.Seek(0);
        using var r = s.AsStreamForRead();
        await r.ReadExactlyAsync(bytes);
        return bytes;
    }

    public static (byte B, byte G, byte R, byte A) At(byte[] px, int w, int x, int y) { var i = (y * w + x) * 4; return (px[i], px[i + 1], px[i + 2], px[i + 3]); }

    /// <summary>An .ico file with PNG-compressed frames (Vista+ format).</summary>
    public static byte[] Ico(params byte[][] pngFrames)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write((ushort)0); w.Write((ushort)1); w.Write((ushort)pngFrames.Length);
        var offset = 6 + 16 * pngFrames.Length;
        foreach (var f in pngFrames)
        {
            var width = (f[16] << 24) | (f[17] << 16) | (f[18] << 8) | f[19];
            w.Write((byte)(width >= 256 ? 0 : width)); w.Write((byte)(width >= 256 ? 0 : width));
            w.Write((byte)0); w.Write((byte)0); w.Write((ushort)1); w.Write((ushort)32);
            w.Write(f.Length); w.Write(offset);
            offset += f.Length;
        }
        foreach (var f in pngFrames) w.Write(f);
        return ms.ToArray();
    }

    public static uint Crc32(ReadOnlySpan<byte> data)
    {
        var c = 0xFFFFFFFFu;
        foreach (var b in data)
        {
            c ^= b;
            for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        }
        return c ^ 0xFFFFFFFFu;
    }

    public const string WebP40x20 = "UklGRgoCAABXRUJQVlA4WAoAAAAgAAAAJwAAEwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMHAAAAC8nwAQADxDzv//zHw4Ism1qcH/aCRwgov9R4x0=";
}

public class PngAndResampleTests
{
    private static BgraImage Solid(int w, int h, byte b, byte g, byte r, byte a)
    {
        var px = new byte[w * h * 4];
        for (var i = 0; i < w * h; i++) { px[i * 4] = b; px[i * 4 + 1] = g; px[i * 4 + 2] = r; px[i * 4 + 3] = a; }
        return new BgraImage(w, h, px);
    }

    [Test]
    public async Task Png_writer_round_trips_through_an_independent_decoder()
    {
        var px = new byte[7 * 5 * 4];
        for (var i = 0; i < 35; i++) { px[i * 4] = (byte)(i * 7); px[i * 4 + 1] = (byte)(255 - i); px[i * 4 + 2] = (byte)(i * 3); px[i * 4 + 3] = (byte)(i % 3 == 0 ? 0 : 128 + i); }
        var png = PngWriter.Encode(new BgraImage(7, 5, px));
        Assert.Equal(0x89, png[0]);
        var (w, h, back, codec) = await Img.DecodeAsync(png);
        Assert.Equal(BitmapDecoder.PngDecoderId, codec);
        Assert.Equal((7, 5), (w, h));
        for (var i = 0; i < 35; i++)
        {
            Assert.Equal(px[i * 4 + 3], back[i * 4 + 3], "alpha " + i);
            if (px[i * 4 + 3] != 0) Assert.Equal(px[i * 4], back[i * 4], "blue " + i);
        }
    }

    [Test]
    public void Fit_square_keeps_aspect_and_centers_on_transparency()
    {
        var img = Solid(40, 20, 0, 0, 255, 255).FitSquare(16);
        Assert.Equal((16, 16), (img.Width, img.Height));
        Assert.Equal((byte)0, Img.At(img.Pixels, 16, 8, 0).A, "letterboxed top row is transparent");
        Assert.Equal((byte)255, Img.At(img.Pixels, 16, 8, 8).A);
        Assert.Equal((byte)255, Img.At(img.Pixels, 16, 8, 8).R);
    }

    [Test]
    public void Resampling_is_premultiplied_so_translucent_edges_keep_their_color()
    {
        // White at 50% next to transparent black: a straight-alpha filter would darken the white.
        var px = new byte[2 * 1 * 4];
        px[0] = px[1] = px[2] = 255; px[3] = 128;
        var down = new BgraImage(2, 1, px).Resize(1, 1);
        var (b, g, r, a) = Img.At(down.Pixels, 1, 0, 0);
        Assert.InRange(a, 63, 65);
        Assert.Equal((byte)255, r);
        Assert.Equal((byte)255, b);
        var up = Solid(2, 2, 10, 20, 30, 255).Resize(9, 9);
        Assert.Equal((10, 20, 30, 255), ((int)Img.At(up.Pixels, 9, 4, 4).B, (int)Img.At(up.Pixels, 9, 4, 4).G, (int)Img.At(up.Pixels, 9, 4, 4).R, (int)Img.At(up.Pixels, 9, 4, 4).A));
    }

    [Test]
    public void Unpremultiply_only_when_the_data_looks_premultiplied()
    {
        var pre = new byte[] { 64, 64, 64, 128, 0, 0, 0, 0 };
        BgraImage.UnpremultiplyIfNeeded(pre);
        Assert.Equal((byte)128, pre[0]);
        var straight = new byte[] { 200, 200, 200, 128 };
        BgraImage.UnpremultiplyIfNeeded(straight);
        Assert.Equal((byte)200, straight[0], "a channel above alpha proves straight alpha: untouched");
        Assert.Throws<ArgumentException>(() => new BgraImage(2, 2, new byte[3]));
    }
}

public class IconTests
{
    /// <summary>A 16×16 icon from a 32-bpp DIB (left half red opaque, right half green at alpha 128) and an all-opaque mask.</summary>
    private static unsafe nint MakeIcon(bool withAlpha)
    {
        var bmi = new BITMAPINFOHEADER { biSize = (uint)sizeof(BITMAPINFOHEADER), biWidth = 16, biHeight = -16, biPlanes = 1, biBitCount = 32 };
        var color = TestNative.CreateDIBSection(0, &bmi, 0, out var bits, 0, 0);
        var p = (byte*)bits;
        for (var y = 0; y < 16; y++)
            for (var x = 0; x < 16; x++)
            {
                var i = (y * 16 + x) * 4;
                if (x < 8) { p[i] = 0; p[i + 1] = 0; p[i + 2] = 255; p[i + 3] = (byte)(withAlpha ? 255 : 0); }
                else { p[i] = 0; p[i + 1] = 255; p[i + 2] = 0; p[i + 3] = (byte)(withAlpha ? 128 : 0); }
            }
        // Mask (1 bpp, WORD-aligned rows): top half opaque (0), bottom half transparent (1).
        var maskBits = new byte[16 * 2];
        for (var y = 8; y < 16; y++) { maskBits[y * 2] = 0xFF; maskBits[y * 2 + 1] = 0xFF; }
        nint mask;
        fixed (byte* m = maskBits) mask = TestNative.CreateBitmap(16, 16, 1, 1, withAlpha ? null : m);
        if (withAlpha)
        {
            var zeros = new byte[32];
            TestNative.DeleteObject(mask);
            fixed (byte* z = zeros) mask = TestNative.CreateBitmap(16, 16, 1, 1, z);
        }
        var info = new ICONINFO { fIcon = 1, hbmColor = color, hbmMask = mask };
        var icon = TestNative.CreateIconIndirect(&info);
        TestNative.DeleteObject(color);
        TestNative.DeleteObject(mask);
        return icon;
    }

    [Test]
    public void Icon_with_alpha_keeps_it()
    {
        var h = MakeIcon(withAlpha: true);
        try
        {
            var img = Assert.NotNull(IconBitmaps.FromIcon(h));
            Assert.Equal((16, 16), (img.Width, img.Height));
            Assert.Equal((0, 0, 255, 255), Tuple(Img.At(img.Pixels, 16, 2, 2)));
            Assert.Equal((0, 255, 0, 128), Tuple(Img.At(img.Pixels, 16, 12, 2)));
        }
        finally { TestNative.DestroyIcon(h); }
    }

    [Test]
    public void Icon_without_alpha_takes_it_from_the_mask()
    {
        var h = MakeIcon(withAlpha: false);
        try
        {
            var img = Assert.NotNull(IconBitmaps.FromIcon(h));
            Assert.Equal((byte)255, Img.At(img.Pixels, 16, 3, 3).A, "mask bit 0 = opaque");
            Assert.Equal((byte)0, Img.At(img.Pixels, 16, 3, 12).A, "mask bit 1 = transparent");
            Assert.Equal((byte)255, Img.At(img.Pixels, 16, 3, 3).R);
        }
        finally { TestNative.DestroyIcon(h); }
    }

    [Test]
    public void Bad_icon_handles_return_null()
    {
        Assert.Null(IconBitmaps.FromIcon(0));
        Assert.Null(IconBitmaps.FromIcon(0x1234));
    }

    private static (int, int, int, int) Tuple((byte B, byte G, byte R, byte A) p) => (p.B, p.G, p.R, p.A);

    private static WindowInfo Win(string? exe, string? aumid = null, nint hwnd = 0) =>
        new(hwnd, 1, exe is null ? "" : Path.GetFileName(exe), exe, "t", aumid, false, false, false, false, 0, default);

    [Test]
    public async Task Provider_caches_by_aumid_or_exe_and_size()
    {
        var shell = new InlineShell();
        var p = new IconProvider(shell, null, new ManualTimeProvider(), (_, size) => new BgraImage(size, size, new byte[size * size * 4].Select((_, i) => (byte)(i % 4 == 3 ? 255 : 100)).ToArray()));
        var a = await p.GetAppIconPngAsync(Win(@"C:\Apps\one.exe"), 144);
        var b = await p.GetAppIconPngAsync(Win(@"C:\APPS\ONE.EXE", hwnd: 0x55), 144);
        Assert.NotNull(a);
        Assert.True(ReferenceEquals(a, b), "same exe (case-insensitive) → cached");
        Assert.Equal(1, p.Loads);
        await p.GetAppIconPngAsync(Win(@"C:\Apps\one.exe"), 72);
        await p.GetAppIconPngAsync(Win(@"C:\Apps\one.exe", aumid: "Pkg.Example_abc!App"), 144);
        Assert.Equal(3, p.Loads, "size and AUMID are part of the key");
        var (w, h, _, _) = await Img.DecodeAsync(a!);
        Assert.Equal((144, 144), (w, h));
        Assert.Equal("aumid:Pkg.Example_abc!App@144", IconProvider.CacheKey(Win(@"C:\x.exe", "Pkg.Example_abc!App"), 144));
        Assert.Equal("hwnd:9@32", IconProvider.CacheKey(Win(null, hwnd: 9), 32));
    }

    [Test]
    public async Task Missing_icons_are_cached_for_five_minutes()
    {
        var clock = new ManualTimeProvider();
        var p = new IconProvider(new InlineShell(), null, clock, (_, _) => null);
        Assert.Null(await p.GetAppIconPngAsync(Win(@"C:\none.exe"), 64));
        Assert.Null(await p.GetAppIconPngAsync(Win(@"C:\none.exe"), 64));
        Assert.Equal(1, p.Loads);
        clock.Advance(TimeSpan.FromMinutes(6));
        Assert.Null(await p.GetAppIconPngAsync(Win(@"C:\none.exe"), 64));
        Assert.Equal(2, p.Loads);
    }

    [Test]
    public async Task Concurrent_requests_share_one_load_and_failures_are_contained()
    {
        var gate = new TaskCompletionSource();
        var shell = new InlineShell();
        var calls = 0;
        var p = new IconProvider(shell, null, null, (_, s) => { Interlocked.Increment(ref calls); gate.Task.Wait(); return new BgraImage(s, s, new byte[s * s * 4]); });
        var t1 = p.GetAppIconPngAsync(Win(@"C:\a.exe"), 32);
        var t2 = p.GetAppIconPngAsync(Win(@"C:\a.exe"), 32);
        gate.SetResult();
        await Task.WhenAll(t1, t2);
        Assert.Equal(1, calls);
        var failing = new IconProvider(shell, null, null, (_, _) => throw new InvalidOperationException("shell blew up"));
        Assert.Null(await failing.GetAppIconPngAsync(Win(@"C:\b.exe"), 32));
    }

    [Test]
    public async Task Sizes_are_clamped_and_the_cache_is_bounded()
    {
        var p = new IconProvider(new InlineShell(), null, null, (_, s) => new BgraImage(1, 1, [0, 0, 0, 255]));
        var big = await p.GetAppIconPngAsync(Win(@"C:\a.exe"), 5000);
        Assert.Equal(256, (await Img.DecodeAsync(big!)).W);
        var small = await p.GetAppIconPngAsync(Win(@"C:\a.exe"), 1);
        Assert.Equal(16, (await Img.DecodeAsync(small!)).W);
        for (var i = 0; i < 300; i++) await p.GetAppIconPngAsync(Win($@"C:\app{i}.exe"), 16);
        Assert.Equal(256, p.CacheCount);
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => p.GetAppIconPngAsync(Win(@"C:\z.exe"), 16, cts.Token));
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Real_icons_for_an_exe_and_for_alt_tab_windows()
    {
        // READ-ONLY: reads icons through the shell thread.
        using var shell = new ShellThread();
        var p = new IconProvider(shell);
        var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
        var png = Assert.NotNull(await p.GetAppIconPngAsync(Win(explorer), 144), "explorer.exe has an icon");
        var (w, h, px, _) = await Img.DecodeAsync(png);
        Assert.Equal((144, 144), (w, h));
        Assert.True(px.Where((_, i) => i % 4 == 3).Any(a => a > 0), "not blank");
        var windows = new WindowCatalog(null).AltTabWindows().Take(6).ToList();
        var withIcons = 0;
        foreach (var win in windows)
            if (await p.GetAppIconPngAsync(win, 72) is { } b && (await Img.DecodeAsync(b)).W == 72) withIcons++;
        Console.WriteLine($"     icons: {withIcons}/{windows.Count} alt-tab windows");
        Assert.True(windows.Count == 0 || withIcons >= 1);
    }
}

public class ArtScalerTests
{
    [Test]
    public async Task Png_is_fitted_with_contain_and_keeps_alpha()
    {
        var src = await Img.EncodeAsync(400, 100, (x, _) => x < 200 ? ((byte)0, (byte)0, (byte)255, (byte)255) : ((byte)255, (byte)0, (byte)0, (byte)0), BitmapEncoder.PngEncoderId);
        var r = Assert.NotNull(await ArtScaler.ScaleAsync(src, 144, 144, ArtFormat.Png));
        Assert.Equal("image/png", r.Mime);
        Assert.Equal((144, 36), (r.Width, r.Height));
        var (w, h, px, _) = await Img.DecodeAsync(r.Bytes);
        Assert.Equal((144, 36), (w, h));
        Assert.Equal((byte)255, Img.At(px, w, 10, 18).R);
        Assert.Equal((byte)0, Img.At(px, w, 130, 18).A, "transparency survives");
    }

    [Test]
    public async Task No_upscale_by_default_but_upscale_on_request()
    {
        var src = await Img.EncodeAsync(32, 16, (_, _) => (1, 2, 3, 255), BitmapEncoder.PngEncoderId);
        Assert.Equal((32, 16), Dim(await ArtScaler.ScaleAsync(src, 144, 144, ArtFormat.Png)));
        Assert.Equal((144, 72), Dim(await ArtScaler.ScaleAsync(src, 144, 144, ArtFormat.Png, upscale: true)));
    }

    private static (int, int) Dim(ScaledArt? a) => a is null ? (-1, -1) : (a.Width, a.Height);

    [Test]
    public async Task Jpeg_in_and_out()
    {
        var src = await Img.EncodeAsync(640, 640, (x, y) => ((byte)x, (byte)y, (byte)(x ^ y), 255), BitmapEncoder.JpegEncoderId);
        var r = Assert.NotNull(await ArtScaler.ScaleAsync(src, 300, 300, ArtFormat.Jpeg));
        Assert.Equal("image/jpeg", r.Mime);
        var (w, h, _, codec) = await Img.DecodeAsync(r.Bytes);
        Assert.Equal(BitmapDecoder.JpegDecoderId, codec);
        Assert.Equal((300, 300), (w, h));
        var legacy = Assert.NotNull(await ArtScaler.ToJpegAsync(src, 64));
        Assert.Equal(64, (await Img.DecodeAsync(legacy)).W);
    }

    [Test]
    public async Task WebP_decodes()
    {
        var r = await ArtScaler.ScaleAsync(Convert.FromBase64String(Img.WebP40x20), 20, 20, ArtFormat.Png);
        if (r is null) { Assert.Skip("this Windows has no WebP decoder"); return; }
        Assert.Equal((20, 10), (r.Width, r.Height));
        var (w, _, px, _) = await Img.DecodeAsync(r.Bytes);
        Assert.True(Img.At(px, w, 2, 5).R > 200 && Img.At(px, w, 17, 5).B > 200, "red left, blue right");
    }

    [Test]
    public async Task Ico_takes_the_largest_frame()
    {
        var f16 = await Img.EncodeAsync(16, 16, (_, _) => (0, 0, 255, 255), BitmapEncoder.PngEncoderId);
        var f64 = await Img.EncodeAsync(64, 64, (_, _) => (0, 255, 0, 255), BitmapEncoder.PngEncoderId);
        var ico = Img.Ico(f16, f64);
        var r = Assert.NotNull(await ArtScaler.ScaleAsync(ico, 256, 256, ArtFormat.Png));
        Assert.Equal((64, 64), (r.Width, r.Height));
        var (w, _, px, _) = await Img.DecodeAsync(r.Bytes);
        Assert.Equal((byte)255, Img.At(px, w, 10, 10).G, "the 64-px (green) frame");
    }

    [Test]
    public async Task Byte_cap_lowers_jpeg_quality_then_size()
    {
        var src = await Img.EncodeAsync(512, 512, (x, y) => ((byte)(x * 7 ^ y * 13), (byte)(x * y), (byte)(x + y * 3), 255), BitmapEncoder.PngEncoderId);
        var free = Assert.NotNull(await ArtScaler.ScaleAsync(src, 512, 512, ArtFormat.Jpeg));
        var capped = Assert.NotNull(await ArtScaler.ScaleAsync(src, 512, 512, ArtFormat.Jpeg, maxBytes: free.Bytes.Length / 3));
        Assert.True(capped.Bytes.Length <= free.Bytes.Length / 3);
        var tiny = Assert.NotNull(await ArtScaler.ScaleAsync(src, 512, 512, ArtFormat.Png, maxBytes: 20_000));
        Assert.True(tiny.Bytes.Length <= 20_000 && tiny.Width < 512, "PNG shrinks to fit");
        Assert.Null(await ArtScaler.ScaleAsync(src, 512, 512, ArtFormat.Png, maxBytes: 50), "impossible caps give null");
    }

    [Test]
    public async Task Untrusted_input_never_throws()
    {
        Assert.Null(await ArtScaler.ScaleAsync([], 10, 10, ArtFormat.Png));
        Assert.Null(await ArtScaler.ScaleAsync([1, 2, 3, 4, 5], 10, 10, ArtFormat.Png));
        Assert.Null(await ArtScaler.ScaleAsync(new byte[ArtScaler.MaxSourceBytes + 1], 10, 10, ArtFormat.Png));
        var ok = await Img.EncodeAsync(8, 8, (_, _) => (0, 0, 0, 255), BitmapEncoder.PngEncoderId);
        Assert.Null(await ArtScaler.ScaleAsync(ok, 0, 10, ArtFormat.Png));
        Assert.Null(await ArtScaler.ScaleAsync(ok, 10, 10, ArtFormat.Png, maxBytes: 0));
        // A PNG header claiming 100,000 × 100,000 pixels (a decompression bomb) is refused before decoding.
        var bomb = (byte[])ok.Clone();
        bomb[16] = 0; bomb[17] = 0x01; bomb[18] = 0x86; bomb[19] = 0xA0;
        bomb[20] = 0; bomb[21] = 0x01; bomb[22] = 0x86; bomb[23] = 0xA0;
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(bomb.AsSpan(29), Img.Crc32(bomb.AsSpan(12, 17)));
        Assert.Null(await ArtScaler.ScaleAsync(bomb, 10, 10, ArtFormat.Png));
        await Assert.ThrowsAsync<ArgumentNullException>(() => ArtScaler.ScaleAsync(null!, 1, 1, ArtFormat.Png));
    }

    [Test]
    public async Task Cancellation_is_honored()
    {
        var ok = await Img.EncodeAsync(8, 8, (_, _) => (0, 0, 0, 255), BitmapEncoder.PngEncoderId);
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => ArtScaler.ScaleAsync(ok, 4, 4, ArtFormat.Png, ct: cts.Token));
    }
}
