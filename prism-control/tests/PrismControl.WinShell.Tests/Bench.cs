using System.Diagnostics;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// <c>-- --bench-thumbnails 30</c>: the CPU cost of 12 live thumbnail keys + 1 focused widget, measured as this process's
/// CPU time over the run (capture readback, downscale, JPEG, SVG frames, mailboxes: everything the plugin would do).
/// <list type="bullet">
/// <item>A, realistic: 12 real Live Window actions over this PC's real windows (read-only capture; safe mode, so a press
///   could change nothing) and the real Window Browser kept focused (≤ 10 fps).</item>
/// <item>B, worst case: 12 of the tests' OWN windows repainting at 60 Hz (so every key always has a new frame) + 1 focused
///   widget lease on a 13th, through the same lease → frame pipeline.</item>
/// </list>
/// No pixels are saved. Results go to stdout (and NOTES.md by hand).
/// </summary>
public static class Bench
{
    public static async Task<int> RunAsync(int seconds)
    {
        Console.WriteLine($"# thumbnail CPU benchmark, {seconds} s per scenario, {Environment.ProcessorCount} logical CPUs");
        var idle = await Measure(TimeSpan.FromSeconds(3), () => Task.CompletedTask);
        Console.WriteLine($"  idle baseline: {idle.Cpu:0.00}% of one core");
        await Realistic(seconds);
        await WorstCase(seconds);
        return 0;
    }

    private sealed record Sample(double Cpu, TimeSpan Wall);

    private static async Task<Sample> Measure(TimeSpan duration, Func<Task> tick)
    {
        var p = Process.GetCurrentProcess();
        p.Refresh();
        var cpu0 = p.TotalProcessorTime;
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed < duration)
        {
            await tick();
            await Task.Delay(100);
        }
        p.Refresh();
        var cpu = (p.TotalProcessorTime - cpu0).TotalMilliseconds / sw.Elapsed.TotalMilliseconds * 100;
        return new Sample(cpu, sw.Elapsed);
    }

    private static async Task Realistic(int seconds)
    {
        using var platform = PlatformServices.Standalone(safeMode: true, NullLog.Instance);
        var options = new WinShellOptions();
        using var source = new WgcThumbnailSource(NullLog.Instance);
        using var thumbs = new ThumbnailService(source, options, null);
        using var windows = new WindowList(platform.Catalog, platform.Foreground, TimeProvider.System);
        var count = windows.Current().Count;
        var time = new ManualTimeProvider();
        void Configure(ServiceRegistry s) { s.Add(platform); s.Add(options); s.Add(thumbs); s.Add(windows); }
        var keys = new List<ActionHarness<WindowKeyAction>>();
        for (var i = 0; i < 12; i++)
        {
            // Twelve keys: slots 1..N of the real alt-tab list, wrapping (two keys can share a window, like a real profile).
            var slot = count == 0 ? 1 : i % count + 1;
            keys.Add(await ActionHarness<WindowKeyAction>.AppearAsync(TestDevices.Galleon, new(i % 3, i / 3 % 4), settings: new WindowKeySettings { Slot = slot },
                configureServices: Configure, time: time, safeMode: true, context: $"k{i}"));
        }
        await using var browser = await ActionHarness<BrowserDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: Configure, time: time, safeMode: true, context: "browser");
        await Task.Delay(1500); // sessions start, first frames arrive
        var f0 = source.Stats.FramesDelivered;
        var b0 = source.Stats.BytesDelivered;
        var images0 = keys.Sum(k => k.Count("setImage"));
        var feedback0 = browser.Count("setFeedback");
        var ticks = 0;
        var s = await Measure(TimeSpan.FromSeconds(seconds), async () =>
        {
            time.Advance(TimeSpan.FromMilliseconds(100));
            if (++ticks % 50 == 1) await browser.RotateAsync(ticks % 100 == 1 ? 1 : -1); // keep the widget focused (10 fps)
        });
        var frames = source.Stats.FramesDelivered - f0;
        Console.WriteLine($"  A realistic: {count} real windows behind 12 keys + browser: CPU {s.Cpu:0.0}% of one core ({s.Cpu / Environment.ProcessorCount:0.00}% of the PC), " +
                          $"{frames / s.Wall.TotalSeconds:0.0} thumbnails/s delivered, {(source.Stats.BytesDelivered - b0) / s.Wall.TotalSeconds / 1024:0.0} KB/s JPEG, " +
                          $"{(keys.Sum(k => k.Count("setImage")) - images0) / s.Wall.TotalSeconds:0.0} key frames/s + {(browser.Count("setFeedback") - feedback0) / s.Wall.TotalSeconds:0.0} widget frames/s requested, {source.Stats.Sessions} capture sessions");
        foreach (var k in keys) await k.DisposeAsync();
    }

    private static async Task WorstCase(int seconds)
    {
        var work = OwnWindow.PrimaryWork();
        var own = new List<OwnWindow>();
        for (var i = 0; i < 13; i++)
            own.Add(new OwnWindow(OwnWindow.Kind.Popup, work.Right - 24 - (i % 5 + 1) * 168, work.Bottom - 24 - (i / 5 + 1) * 108, 160, 100));
        try
        {
            await Task.Delay(400);
            var options = new WinShellOptions();
            using var source = new WgcThumbnailSource(NullLog.Instance);
            using var thumbs = new ThumbnailService(source, options, null);
            var leases = own.Take(12).Select(w => thumbs.ForKey(w.Hwnd)).ToList();
            var widget = thumbs.ForWidget(own[12].Hwnd);
            thumbs.Focus(widget);
            long rendered = 0, renderedBytes = 0;
            var t = Refraction.Night;
            foreach (var l in leases)
            {
                var lease = l;
                lease.Updated += () =>
                {
                    // The same frame build the Live Window action does on every new thumbnail.
                    var uri = WindowArt.Key(t, new WindowKeyModel { Caption = "Prism Play test window", AppName = "Test", Thumbnail = lease.Latest, Icon = Samples.IconPng }).ToDataUri();
                    Interlocked.Increment(ref rendered);
                    Interlocked.Add(ref renderedBytes, uri.Length);
                };
            }
            widget.Updated += () =>
            {
                var uri = new Feedback().Pixmap(Layouts.Canvas.Frame, WindowArt.Browser(t, new BrowserModel { Count = 13, Index = 12, AppName = "Test", Thumbnail = widget.Latest, Active = true })).ToJson().ToJsonString();
                Interlocked.Increment(ref rendered);
                Interlocked.Add(ref renderedBytes, uri.Length);
            };
            await Task.Delay(1500);
            var f0 = source.Stats.FramesDelivered;
            var a0 = source.Stats.FramesArrived;
            var r0 = Interlocked.Read(ref rendered);
            var rb0 = source.Stats.ReadbackTime;
            var e0 = source.Stats.EncodeTime;
            var s = await Measure(TimeSpan.FromSeconds(seconds), () => Task.CompletedTask);
            var frames = source.Stats.FramesDelivered - f0;
            Console.WriteLine($"  B worst case: 12 keys + 1 focused widget on 13 windows repainting at 60 Hz: CPU {s.Cpu:0.0}% of one core ({s.Cpu / Environment.ProcessorCount:0.00}% of the PC), " +
                              $"{frames / s.Wall.TotalSeconds:0.0} thumbnails/s (WGC sent {(source.Stats.FramesArrived - a0) / s.Wall.TotalSeconds:0} frames/s after MinUpdateInterval), " +
                              $"{(Interlocked.Read(ref rendered) - r0) / s.Wall.TotalSeconds:0.0} frames/s built ({renderedBytes / Math.Max(1, rendered) / 1024.0:0.0} KB each), " +
                              $"readback {(source.Stats.ReadbackTime - rb0).TotalMilliseconds / Math.Max(1, frames):0.00} ms + encode {(source.Stats.EncodeTime - e0).TotalMilliseconds / Math.Max(1, frames):0.00} ms per thumbnail");
            foreach (var l in leases) l.Dispose();
            widget.Dispose();
        }
        finally
        {
            foreach (var w in own) w.Dispose();
        }
    }
}
