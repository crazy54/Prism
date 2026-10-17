using System.Runtime.InteropServices;
using System.Text;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;

namespace PrismControl.Sight.Tests;

/// <summary>
/// "--hdr-probe": read-only HDR verification on windows this process creates. Three sources (a GDI SDR window, a D3D11
/// BGRA8 flip-model swapchain, a D3D11 FP16 scRGB swapchain) show known patches on the primary monitor; each is captured
/// with WGC as B8G8R8A8 and as R16G16B16A16F, and the captured values are printed. Nothing is saved but the text table.
/// </summary>
public static partial class HdrProbe
{
    private const int PatchW = 48, Gap = 8, Margin = 16, Cols = 12, Rows = 2;
    private const int WinW = Margin * 2 + Cols * PatchW + (Cols - 1) * Gap, WinH = Margin * 2 + Rows * PatchW + Gap;

    private static readonly (byte R, byte G, byte B)[] SdrPatches =
    [
        (0, 0, 0), (23, 23, 23), (46, 46, 46), (64, 64, 64), (96, 96, 96), (128, 128, 128), (160, 160, 160), (192, 192, 192), (224, 224, 224), (240, 240, 240), (250, 250, 250), (255, 255, 255),
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 200, 40), (40, 200, 255), (128, 0, 0), (0, 128, 0), (0, 0, 128), (255, 255, 0), (255, 0, 255), (0, 255, 255), (200, 200, 200),
    ];

    private static readonly (float R, float G, float B)[] HdrPatches =
    [
        (0, 0, 0), (0.01f, 0.01f, 0.01f), (0.05f, 0.05f, 0.05f), (0.18f, 0.18f, 0.18f), (0.5f, 0.5f, 0.5f), (1, 1, 1), (1.5f, 1.5f, 1.5f), (2, 2, 2), (3, 3, 3), (3.55f, 3.55f, 3.55f), (5, 5, 5), (10, 10, 10),
        (12.5f, 12.5f, 12.5f), (20, 20, 20), (3.55f, 0, 0), (0, 3.55f, 0), (0, 0, 3.55f), (1, 0, 0), (0, 1, 0), (0, 0, 1), (-0.1f, 1, 1), (0.5f, 0.25f, 0.1f), (8, 4, 1), (2.84f, 2.84f, 2.84f),
    ];

    private static PixelRect PatchRect(int i) => new(Margin + i % Cols * (PatchW + Gap), Margin + i / Cols * (PatchW + Gap), PatchW, PatchW);

    public static async Task<int> RunAsync(string outFile)
    {
        var sb = new StringBuilder();
        void W(string s) { Console.WriteLine(s); sb.AppendLine(s); }
        W($"# Prism Sight HDR probe ({DateTimeOffset.Now:yyyy-MM-dd HH:mm})");
        W("Read-only. Sources are windows this probe created (popup, no-activate, tool window), shown ~2 s each on the primary monitor.");
        foreach (var m in DisplayInfo.All())
            W($"monitor {m.GdiName}: advanced color supported={m.AdvancedColorSupported} enabled={m.AdvancedColorEnabled}, SDR white {m.SdrWhiteNits:F0} nits (scRGB {m.SdrWhiteScRgb:F3}), {m.BitsPerColor} bpc");
        W($"WGC supported: {WgcRegionCapture.IsSupported()}; borderless access: {await WgcRegionCapture.RequestBorderlessAsync()}");

        var primary = MonitorFromPoint(0, 1 /* PRIMARY */);
        var mb = WindowGeometry.MonitorBounds(primary);
        var color = DisplayInfo.ForMonitor(primary);
        W($"primary monitor bounds {mb}, HDR {(color?.AdvancedColorEnabled == true ? "ON" : "off")}");
        int x = mb.Right - WinW - 40, y = mb.Bottom - WinH - 120;

        foreach (var mode in new[] { OwnWindowMode.Gdi, OwnWindowMode.SwapchainBgra8, OwnWindowMode.SwapchainFp16 })
        {
            W("");
            W($"## Source: {mode}");
            using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = WinW, H = WinH, Topmost = true, Mode = mode, FrameIntervalMs = 16 });
            if (mode == OwnWindowMode.Gdi) win.SetImage(SdrImage());
            else if (mode == OwnWindowMode.SwapchainBgra8) win.SetPixels(SdrImage().Pixels, WinW * 4);
            else win.SetPixels(HdrTexels(), WinW * 8);
            await Task.Delay(400);
            var results = new Dictionary<CaptureFormatPreference, (double R, double G, double B)[]>();
            foreach (var fmt in new[] { CaptureFormatPreference.Bgra8, CaptureFormatPreference.Fp16 })
            {
                var (vals, frames) = await CaptureAsync(win.Hwnd, fmt);
                results[fmt] = vals;
                W($"  capture {fmt}: {frames} frames");
            }
            W(mode == OwnWindowMode.SwapchainFp16
                ? "  patch (scRGB linear in)       | BGRA8 capture (R,G,B 0-255)   | FP16 capture (scRGB R,G,B)"
                : "  patch (sRGB in)               | BGRA8 capture (R,G,B 0-255)   | FP16 capture (scRGB R,G,B) → ÷SDRwhite → sRGB8");
            for (var i = 0; i < Cols * Rows; i++)
            {
                var b = results[CaptureFormatPreference.Bgra8][i];
                var f = results[CaptureFormatPreference.Fp16][i];
                var input = mode == OwnWindowMode.SwapchainFp16 ? $"({HdrPatches[i].R:F2},{HdrPatches[i].G:F2},{HdrPatches[i].B:F2})" : $"({SdrPatches[i].R},{SdrPatches[i].G},{SdrPatches[i].B})";
                var pw = color?.SdrWhiteScRgb ?? 1;
                var back = $"({Enc(f.R / pw)},{Enc(f.G / pw)},{Enc(f.B / pw)})";
                W($"  {input,-29} | ({b.R,5:F1},{b.G,5:F1},{b.B,5:F1})         | ({f.R:F3},{f.G:F3},{f.B:F3}) → {back}");
            }
        }
        // Occlusion: does WGC still deliver frames for a window at the bottom of the z-order (the perf window's placement)?
        {
            using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = WinW, H = WinH, Bottom = true, Mode = OwnWindowMode.Gdi,
                Animate = n => { var img = SdrImage(); img.FillRect(new PixelRect((int)(n % 600), 0, 8, 8), Bgra.FromRgb(255, 0, 0)); return img; } });
            await Task.Delay(300);
            var (_, frames) = await CaptureAsync(win.Hwnd, CaptureFormatPreference.Bgra8, TimeSpan.FromSeconds(1.5));
            W("");
            W($"## Bottom-of-z-order window (occluded by other apps), animated: {frames} frames captured in 1.5 s");
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outFile))!);
        await File.WriteAllTextAsync(outFile, sb.ToString());
        Console.WriteLine($"wrote {outFile}");
        return 0;
    }

    private static string Enc(double linear) => ((int)Math.Round(Math.Clamp(ColorPipeline.LinearToSrgb(Math.Clamp(linear, 0, 1)), 0, 1) * 255)).ToString();

    private static SightImage SdrImage()
    {
        var img = SightImage.Filled(WinW, WinH, Bgra.FromRgb(30, 30, 40));
        for (var i = 0; i < SdrPatches.Length; i++) img.FillRect(PatchRect(i), Bgra.FromRgb(SdrPatches[i].R, SdrPatches[i].G, SdrPatches[i].B));
        return img;
    }

    private static byte[] HdrTexels()
    {
        var px = new Half[WinW * WinH * 4];
        void Put(int xx, int yy, float r, float g, float b) { var o = (yy * WinW + xx) * 4; px[o] = (Half)r; px[o + 1] = (Half)g; px[o + 2] = (Half)b; px[o + 3] = (Half)1; }
        for (var yy = 0; yy < WinH; yy++) for (var xx = 0; xx < WinW; xx++) Put(xx, yy, 0.02f, 0.02f, 0.03f);
        for (var i = 0; i < HdrPatches.Length; i++)
        {
            var r = PatchRect(i);
            for (var yy = r.Y; yy < r.Bottom; yy++) for (var xx = r.X; xx < r.Right; xx++) Put(xx, yy, HdrPatches[i].R, HdrPatches[i].G, HdrPatches[i].B);
        }
        return MemoryMarshal.AsBytes(px.AsSpan()).ToArray();
    }

    private static async Task<((double R, double G, double B)[] Values, int Frames)> CaptureAsync(nint hwnd, CaptureFormatPreference fmt, TimeSpan? duration = null)
    {
        var n = Cols * Rows;
        var sums = new (double R, double G, double B)[n];
        var counts = new int[n];
        var frames = 0;
        var crops = Enumerable.Range(0, n).Select(i => { var r = PatchRect(i); return new RegionCrop(i, new PixelRect(r.X + 16, r.Y + 16, 16, 16)); }).ToList();
        var opts = new CaptureOptions
        {
            Format = fmt,
            MinUpdateInterval = TimeSpan.FromMilliseconds(16),
            RawCrops = (region, bytes, w, h, bpp) =>
            {
                double r = 0, g = 0, b = 0;
                var count = w * h;
                for (var i = 0; i < count; i++)
                {
                    if (bpp == 4) { b += bytes[i * 4]; g += bytes[i * 4 + 1]; r += bytes[i * 4 + 2]; }
                    else
                    {
                        r += (float)BitConverter.UInt16BitsToHalf(BitConverter.ToUInt16(bytes, i * 8));
                        g += (float)BitConverter.UInt16BitsToHalf(BitConverter.ToUInt16(bytes, i * 8 + 2));
                        b += (float)BitConverter.UInt16BitsToHalf(BitConverter.ToUInt16(bytes, i * 8 + 4));
                    }
                }
                lock (sums) { sums[region].R += r / count; sums[region].G += g / count; sums[region].B += b / count; counts[region]++; }
            },
        };
        using (var cap = new WgcRegionCapture(hwnd, opts, _ => new CropPlan { Regions = crops }, _ => Interlocked.Increment(ref frames)))
        {
            cap.Start();
            await Task.Delay(duration ?? TimeSpan.FromSeconds(1.2));
        }
        await Task.Delay(100);
        return (Enumerable.Range(0, n).Select(i => counts[i] == 0 ? (double.NaN, double.NaN, double.NaN) : (sums[i].R / counts[i], sums[i].G / counts[i], sums[i].B / counts[i])).ToArray(), frames);
    }

    /// <summary>POINT is passed by value: on x64 it travels as one 64-bit value (x low, y high).</summary>
    [LibraryImport("user32.dll")] internal static partial nint MonitorFromPoint(long point, uint flags);
}
