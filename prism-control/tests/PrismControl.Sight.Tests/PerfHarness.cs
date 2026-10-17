using System.Diagnostics;
using System.Globalization;
using System.Text;
using PrismControl.Sight.Calibration;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Recipes;
using PrismControl.Sight.Text;

namespace PrismControl.Sight.Tests;

/// <summary>
/// "--perf [seconds]": CPU% and frame cost of Sight with 6 regions at default rates (2 bars 10 Hz, 1 color 10 Hz,
/// 1 template 5 Hz, 2 OCR 3 Hz) on a synthetic 3440×1440 game window. The game runs in a CHILD process (like a real
/// game), animating its HUD at 60 Hz and timing its own frames; the parent measures a baseline, then captures, then
/// measures again, and reports both sides. The child window sits at the bottom of the z-order (WGC captures occluded
/// windows), so the desktop stays usable. The child is killed at the end, whatever happens.
/// </summary>
public static class PerfHarness
{
    private const int W = 3440, H = 1440;

    public static async Task<int> RunAsync(int seconds)
    {
        seconds = Math.Clamp(seconds, 5, 120);
        var exe = Environment.ProcessPath!;
        var dll = typeof(PerfHarness).Assembly.Location;
        var psi = new ProcessStartInfo(exe.EndsWith("dotnet.exe", StringComparison.OrdinalIgnoreCase) ? exe : exe)
        {
            RedirectStandardInput = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true,
        };
        if (exe.EndsWith("dotnet.exe", StringComparison.OrdinalIgnoreCase)) psi.ArgumentList.Add(dll);
        foreach (var a in new[] { "--synthetic-game", W.ToString(), H.ToString(), (seconds * 4 + 90).ToString() }) psi.ArgumentList.Add(a);
        using var child = Process.Start(psi)!;
        var report = new StringBuilder();
        void Line(string s) { Console.WriteLine(s); report.AppendLine(s); }
        try
        {
            var hello = await child.StandardOutput.ReadLineAsync();
            if (hello is null || !hello.StartsWith("hwnd ", StringComparison.Ordinal)) { Console.Error.WriteLine("child did not start: " + hello); return 1; }
            var hwnd = (nint)long.Parse(hello[5..], CultureInfo.InvariantCulture);
            Line($"# Prism Sight perf ({DateTimeOffset.Now:yyyy-MM-dd HH:mm}), synthetic {W}x{H} game window in a child process, {seconds} s per phase");
            foreach (var m in DisplayInfo.All()) Line($"monitor {m.GdiName}: HDR {(m.AdvancedColorEnabled ? "on" : "off")}, SDR white {m.SdrWhiteNits:F0} nits");
            await Task.Delay(1500);
            await child.StandardInput.WriteLineAsync("phase baseline");
            // The test process's own idle cost (runtime, timers), to separate Sight's share below.
            var self = Process.GetCurrentProcess();
            self.Refresh();
            var idle0 = self.TotalProcessorTime;
            var idleWall = Stopwatch.StartNew();
            await Task.Delay(TimeSpan.FromSeconds(seconds));
            self.Refresh();
            var idlePct = (self.TotalProcessorTime - idle0).TotalSeconds / idleWall.Elapsed.TotalSeconds * 100;
            Line($"test process idle (no capture): {idlePct:F2}% of one core");

            foreach (var mode in new[] { "default glyphs + Windows OCR", "calibrated glyphs" })
            {
                var recipe = PerfRecipe(mode.StartsWith("calibrated", StringComparison.Ordinal));
                using var ocr = new WindowsOcrRecognizer();
                var engine = new SightEngine(recipe, new SightEngineOptions { Ocr = ocr });
                var frames = 0;
                double copyMs = 0, convertMs = 0, engineMs = 0, engineMax = 0;
                var queue = System.Threading.Channels.Channel.CreateBounded<CapturedFrame>(new System.Threading.Channels.BoundedChannelOptions(2) { FullMode = System.Threading.Channels.BoundedChannelFullMode.DropOldest });
                using var cts = new CancellationTokenSource();
                var consumer = Task.Run(async () =>
                {
                    await foreach (var f in queue.Reader.ReadAllAsync(cts.Token))
                    {
                        var sw = Stopwatch.StartNew();
                        await engine.ProcessAsync(new RegionFrame { At = f.At, ContentWidth = f.ContentWidth, ContentHeight = f.ContentHeight, Regions = f.Regions }, cts.Token);
                        var ms = sw.Elapsed.TotalMilliseconds;
                        engineMs += ms; engineMax = Math.Max(engineMax, ms);
                        frames++; copyMs += f.CopyMs; convertMs += f.ConvertMs;
                    }
                });
                await child.StandardInput.WriteLineAsync("phase capture-" + (mode.StartsWith("calibrated", StringComparison.Ordinal) ? "calibrated" : "default"));
                var me = Process.GetCurrentProcess();
                CaptureStats stats;
                CapturePixelFormat fmt;
                TimeSpan cpu0;
                Stopwatch wall;
                (long Arrived, long Used, double Copy, double Convert, double HandlerCpu) s0;
                IReadOnlyList<(string Detector, long Runs, double TotalMs)> d0;
                int f0;
                double e0;
                using (var cap = new WgcRegionCapture(hwnd, new CaptureOptions(), t => new CropPlan { Regions = engine.Plan(t.ContentWidth, t.ContentHeight, t.At) }, f => queue.Writer.TryWrite(f)))
                {
                    cap.Start();
                    fmt = cap.Format;
                    // Warm up (JIT tiering, the default glyph set's one-time build, OCR engine start), then measure.
                    await Task.Delay(TimeSpan.FromSeconds(6));
                    lock (cap.Stats) s0 = (cap.Stats.FramesArrived, cap.Stats.FramesUsed, cap.Stats.CopyMsTotal, cap.Stats.ConvertMsTotal, cap.Stats.HandlerCpuMsTotal);
                    d0 = engine.DetectorCosts();
                    (f0, e0) = (frames, engineMs);
                    engineMax = 0;
                    me.Refresh();
                    cpu0 = me.TotalProcessorTime;
                    wall = Stopwatch.StartNew();
                    await Task.Delay(TimeSpan.FromSeconds(seconds));
                    stats = cap.Stats;
                }
                queue.Writer.TryComplete();
                try { await consumer.WaitAsync(TimeSpan.FromSeconds(5)); } catch (Exception) { cts.Cancel(); }
                me.Refresh();
                var cpu = (me.TotalProcessorTime - cpu0).TotalSeconds / wall.Elapsed.TotalSeconds * 100;
                var (_, ro, _, _) = engine.State();
                Line("");
                Line($"## Sight, {mode} ({fmt}, MinUpdateInterval 100 ms)");
                Line($"  CPU: {cpu:F2}% of one core over {wall.Elapsed.TotalSeconds:F1} s (whole test process, idle runner included)");
                var used = stats.FramesUsed - s0.Used;
                Line($"  WGC frames arrived {stats.FramesArrived - s0.Arrived}, used {used} ({used / wall.Elapsed.TotalSeconds:F1}/s); GPU crop+map avg {(stats.CopyMsTotal - s0.Copy) / Math.Max(1, used):F2} ms (max {stats.CopyMsMax:F2}); FP16 to sRGB8 convert avg {(stats.ConvertMsTotal - s0.Convert) / Math.Max(1, used):F3} ms");
                Line($"  capture handler CPU (GPU crop, map, convert) {(stats.HandlerCpuMsTotal - s0.HandlerCpu) / Math.Max(1, used):F2} ms per frame = {(stats.HandlerCpuMsTotal - s0.HandlerCpu) / wall.Elapsed.TotalMilliseconds * 100:F2}% of one core");
                Line($"  engine per frame avg {(engineMs - e0) / Math.Max(1, frames - f0):F2} ms (max {engineMax:F1}) = {(engineMs - e0) / wall.Elapsed.TotalMilliseconds * 100:F2}% of one core; detector skips (unchanged regions) {engine.RegionsSkipped}");
                var d1 = engine.DetectorCosts();
                Line("  detectors over the measured window (runs, total ms): " + string.Join(", ", d1.Select((c, i) => $"{c.Detector} {c.Runs - d0[i].Runs}x {c.TotalMs - d0[i].TotalMs:F0} ms")));
                Line($"  last readouts: " + string.Join(", ", ro.Values.Select(r => $"{r.Id}={(r.Number?.ToString(CultureInfo.InvariantCulture) ?? r.Text ?? "—")}[{r.Confidence}]")));
                await child.StandardInput.WriteLineAsync("phase after");
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
            await child.StandardInput.WriteLineAsync("report");
            string? l;
            Line("");
            Line("## The synthetic game's own frame times (its paint loop, 60 Hz target)");
            while ((l = await child.StandardOutput.ReadLineAsync()) is not null && l != "end") Line("  " + l);
            var outFile = Path.Combine(Fx.ScratchDir, "perf.txt");
            await File.WriteAllTextAsync(outFile, report.ToString());
            Console.WriteLine($"wrote {outFile}");
            return 0;
        }
        finally
        {
            try { if (!child.HasExited) { child.StandardInput.WriteLine("quit"); if (!child.WaitForExit(3000)) child.Kill(true); } } catch (Exception) { }
        }
    }

    /// <summary>6 regions of the synthetic recipe at default rates.</summary>
    private static CompiledRecipe PerfRecipe(bool calibrated)
    {
        var (full, assets) = SyntheticHud.Recipe();
        var dto = full.Source;
        string[] keep = ["syn.tool", "syn.builder.header", "syn.builder.bankValue", "syn.builder.pitchValue", "syn.results.excitement", "syn.results.fear"];
        var json = RecipeLoader.Serialize(dto);
        var copy = RecipeLoader.ParseDto(json);
        copy.Regions = copy.Regions.Where(r => keep.Contains(r.Id)).ToList();
        copy.Detectors = copy.Detectors.Where(d => keep.Contains(d.Region)).ToList();
        copy.Controls = [];
        copy.Readouts = copy.Readouts.Where(r => copy.Detectors.Any(d => d.Id == r.From)).ToList();
        copy.Contexts = [new ContextDto { Id = "coasterBuilder", When = "builderPanel & tool=coaster", EnterMs = 150, ExitMs = 300 }];
        foreach (var r in copy.Readouts) r.Contexts = null;
        if (calibrated)
        {
            // Harvest the HUD font once (what calibration does), so Windows OCR is only a fallback.
            var samples = new List<(PreparedText, string)>();
            var tmp = RecipeLoader.Compile(copy, assets);
            foreach (var b in new[] { -123.0, 45, 67, -8, 90, 12 })
            {
                var f = SyntheticHud.Render(1920, 1080, 1, new HudState { Bank = b, Pitch = -b / 2 });
                samples.Add((RecipeRunner.PrepareText(tmp, f, "bankText")!, $"{b:0}"));
                samples.Add((RecipeRunner.PrepareText(tmp, f, "pitchText")!, $"{-b / 2:0}"));
            }
            assets.Add("perf-glyphs.json", Encoding.UTF8.GetBytes(GlyphSet.Harvest("perf", samples).ToJson()));
            foreach (var d in copy.Detectors.Where(d => d.Kind == "ocr")) d.Glyphs = "perf-glyphs.json";
        }
        return RecipeLoader.Compile(copy, assets);
    }

    /// <summary>The child: a game-like window that repaints its HUD at 60 Hz with changing values; times its own frames.</summary>
    public static async Task<int> SyntheticGameAsync(int w, int h, int seconds)
    {
        var primary = HdrProbe.MonitorFromPoint(0, 1);
        var mb = WindowGeometry.MonitorBounds(primary);
        // Pre-render a few HUD states (the paint loop only blits: like a game, its cost is the present, not our C#).
        var states = Enumerable.Range(0, 24).Select(i => SyntheticHud.Render(w, h, 1, new HudState
        {
            Bank = -45 + 15 * (i / 4 % 7), Pitch = 5 * (i / 6), Length = 12.5, Results = true, Excitement = (i % 12) * 0.8, Fear = 9.6 - (i % 12) * 0.8, Seed = 1,
        })).ToArray();
        var phase = "warmup";
        var intervals = new Dictionary<string, List<double>>();
        var last = Stopwatch.GetTimestamp();
        using var win = OwnWindow.Create(new OwnWindowOptions
        {
            X = mb.X, Y = mb.Y, W = w, H = h, Bottom = true, Topmost = false, FrameIntervalMs = 16,
            Animate = n =>
            {
                var now = Stopwatch.GetTimestamp();
                var ms = (now - last) * 1000.0 / Stopwatch.Frequency;
                last = now;
                lock (intervals) { if (!intervals.TryGetValue(phase, out var l)) intervals[phase] = l = []; l.Add(ms); }
                return states[(int)(n / 8 % states.Length)];
            },
        });
        Console.WriteLine($"hwnd {(long)win.Hwnd}");
        Console.Out.Flush();
        var stop = DateTime.UtcNow + TimeSpan.FromSeconds(seconds);
        while (DateTime.UtcNow < stop)
        {
            var left = stop - DateTime.UtcNow;
            if (left <= TimeSpan.Zero) break;
            var line = await Console.In.ReadLineAsync().WaitAsync(left).ContinueWith(t => t.IsCompletedSuccessfully ? t.Result : null);
            if (line is null || line == "quit") break;
            if (line.StartsWith("phase ", StringComparison.Ordinal)) lock (intervals) phase = line[6..];
            if (line == "report")
            {
                lock (intervals)
                    foreach (var (p, l) in intervals.Where(kv => kv.Key != "warmup" && kv.Key != "after"))
                    {
                        var s = l.Order().ToList();
                        double Pct(double q) => s[Math.Clamp((int)(q * (s.Count - 1)), 0, s.Count - 1)];
                        Console.WriteLine($"{p,-20} frames {s.Count,5}  mean {s.Average():F2} ms  p50 {Pct(0.5):F2}  p95 {Pct(0.95):F2}  p99 {Pct(0.99):F2}  max {s[^1]:F2}");
                    }
                Console.WriteLine("end");
                Console.Out.Flush();
            }
        }
        return 0;
    }
}

public static class Probes
{
    /// <summary>"--ocr-probe": Windows.Media.Ocr availability unpackaged, languages, wall and CPU time per call.</summary>
    public static async Task<int> OcrProbeAsync()
    {
        foreach (var l in Windows.Media.Ocr.OcrEngine.AvailableRecognizerLanguages) Console.WriteLine($"OCR language {l.LanguageTag}");
        using var ocr = new WindowsOcrRecognizer();
        Console.WriteLine($"available {ocr.IsAvailable} ({ocr.Language}), max image {Windows.Media.Ocr.OcrEngine.MaxImageDimension}");
        var img = SightImage.Filled(240, 60, Bgra.FromRgb(20, 22, 30));
        SyntheticHud.Text(img, "-30°", new PixelRect(0, 0, 240, 60), 1, 32, new HudState());
        var prep = TextPreprocessor.Prepare(img, TextPolarity.Light, stripSuperscript: true).ToOcrImage();
        var me = Process.GetCurrentProcess();
        for (var i = 0; i < 5; i++) await ocr.RecognizeAsync(prep);
        me.Refresh();
        var cpu0 = me.TotalProcessorTime;
        var sw = Stopwatch.StartNew();
        string? text = null;
        const int n = 100;
        for (var i = 0; i < n; i++) text = await ocr.RecognizeAsync(prep);
        me.Refresh();
        Console.WriteLine($"'{text}': {sw.Elapsed.TotalMilliseconds / n:F2} ms wall, {(me.TotalProcessorTime - cpu0).TotalMilliseconds / n:F2} ms CPU per call");
        var p2 = TextPreprocessor.Prepare(img, TextPolarity.Light, stripSuperscript: true);
        sw.Restart();
        var build = GlyphSet.Default.Templates.Count;   // the one-time build (fonts rendered with GDI)
        Console.WriteLine($"default glyph set built once in {sw.Elapsed.TotalMilliseconds:F0} ms ({build} templates)");
        sw.Restart();
        for (var i = 0; i < n; i++) TextPreprocessor.Prepare(img, TextPolarity.Light, stripSuperscript: true);
        Console.WriteLine($"preprocessing (binarize, components, superscript strip): {sw.Elapsed.TotalMilliseconds / n:F2} ms per region");
        sw.Restart();
        for (var i = 0; i < n; i++) GlyphReader.Read(p2, GlyphSet.Default, "-+0123456789");
        Console.WriteLine($"glyph reader (default set, {GlyphSet.Default.Templates.Count} templates): {sw.Elapsed.TotalMilliseconds / n:F2} ms per read");
        return 0;
    }
}
