using System.Diagnostics;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Testing;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

/// <summary>Windows.Graphics.Capture against OUR OWN test window (read-only otherwise). Pixels stay in memory.</summary>
public class CaptureIntegrationTests
{
    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Own_window_thumbnail_arrives_as_a_small_jpeg_through_the_gpu_mip_path()
    {
        using var w = OwnWindow.InCorner(OwnWindow.Kind.Popup, 640, 400);
        using var src = new WgcThumbnailSource(NullLog.Instance);
        Assert.True(await src.EnsureAvailableAsync(), "WGC + borderless capture available");
        using var lease = src.Subscribe(w.Hwnd, new ThumbnailRequest(136, 88, TimeSpan.FromMilliseconds(100)));
        var got = new TaskCompletionSource();
        lease.Updated += () => { if (lease.Latest is not null) got.TrySetResult(); };
        if (lease.Latest is null) await got.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var f = Assert.NotNull(lease.Latest);
        var info = Assert.NotNull(ImageInfo.Probe(f.Jpeg));
        Assert.Equal("image/jpeg", info.Mime);
        Assert.True(info.Width <= 136 && info.Height <= 88, $"{info.Width}x{info.Height}");
        Assert.True(info.Width >= 130 || info.Height >= 84, "fills the box");
        Assert.Equal(CaptureState.Live, lease.State);
        Console.WriteLine($"  first frame {info.Width}x{info.Height} {f.Jpeg.Length} B; readback {src.Stats.ReadbackTime.TotalMilliseconds:0.00} ms total, encode {src.Stats.EncodeTime.TotalMilliseconds:0.00} ms");
        // Rate: a 60 Hz animated window, 100 ms interval → about 10 fps, never 30+.
        var before = src.Stats.FramesDelivered;
        await Task.Delay(2000);
        var fps = (src.Stats.FramesDelivered - before) / 2.0;
        Console.WriteLine($"  delivered {fps:0.0} fps at a 100 ms interval (arrived {src.Stats.FramesArrived}, processed {src.Stats.FramesProcessed})");
        Assert.InRange(fps, 3, 11);
    }
}
