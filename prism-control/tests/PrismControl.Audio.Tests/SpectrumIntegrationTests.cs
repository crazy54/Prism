using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Audio;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>
/// Read-only probe of real loopback capture on this PC: it listens to whatever the default output already plays (if
/// anything) for about a second and measures the CPU cost. It never plays a sound and never changes a device, a
/// volume, a mute or a default; the device state is compared before and after.
/// <para>
/// CPU: every spectrum frame (drain, analysis, publish) runs on the audio COM worker, so the cost is that thread's
/// exact cycle count (QueryThreadCycleTime) while demanded minus the same while idle. Durations:
/// PRISM_SPECTRUM_WARMUP_MS (default 1000) and PRISM_SPECTRUM_MEASURE_MS (default 1500).
/// </para>
/// </summary>
public class SpectrumIntegrationTests
{
    /// <summary>Long enough for ~75 frames, so the hot code is tier-1 JIT code as in a plugin that has been running a while.</summary>
    private static readonly int WarmupMs = Env("PRISM_SPECTRUM_WARMUP_MS", 2500);
    private static readonly int MeasureMs = Env("PRISM_SPECTRUM_MEASURE_MS", 1500);

    /// <summary>
    /// The CPU budget is checked on optimized code: under 1% of a core. A Debug build runs with JIT optimizations off
    /// (the FFT is several times slower), so there the bound is only a sanity check for runaway loops.
    /// </summary>
    private static readonly bool Optimized = typeof(AudioEngine).Assembly.GetCustomAttributes(typeof(DebuggableAttribute), false)
        .OfType<DebuggableAttribute>().All(d => !d.IsJITOptimizerDisabled);
    private static readonly double Budget = Optimized ? 0.01 : 0.03;
    private static string BudgetText => Optimized ? "1% (optimized build)" : "3% (Debug build: JIT optimizations off)";

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Real_loopback_of_the_default_output_is_read_only_and_cheap()
    {
        var cyclesPerSecond = CalibrateCycles();
        var engine = AudioEngine.Start(new WarnLog());
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(10));
        if (!engine.IsAvailable)
        {
            await engine.DisposeAsync();
            Assert.Skip("Core Audio is not available on this machine");
        }
        await using var _engine = engine;
        var stateBefore = DeviceState(engine);
        var worker = await engine.WorkerThreadIdAsync();
        var registry = new DataRegistry();
        await using var data = new AudioDataProviders(engine, registry, TimeProvider.System, NullLog.Instance, CancellationToken.None);
        data.Start();
        Assert.True(data.ClaimedSpectrum);
        var spectrum = data.Spectrum!;
        var topic = registry.AudioSpectrum;
        topic.DemandWindow = TimeSpan.FromMilliseconds(500);

        // Idle: nothing is demanded, so nothing may run.
        await Task.Delay(300);
        var idleCycles = ThreadCycles(worker);
        var sw = Stopwatch.StartNew();
        await Task.Delay(MeasureMs);
        var idleShare = (ThreadCycles(worker) - idleCycles) / cyclesPerSecond / sw.Elapsed.TotalSeconds;
        Assert.Equal(0, engine.OpenLoopbacks, "no capture while nobody asks");
        Assert.Equal(0, engine.FrameDrivers, "no frame timer while nobody asks");
        Assert.False(spectrum.Running);
        Assert.Null(topic.Current);

        // Demanded: poll like a 30 Hz client; warm up (open the stream, JIT), then measure.
        AudioSpectrumSnapshot? last = null;
        int responses = 0, silentFrames = 0, loudFrames = 0, openSeen = 0;
        double maxPeak = 0;
        var maxBands = new double[24];
        async Task PollAsync(int ms, bool record)
        {
            var until = Stopwatch.StartNew();
            while (until.ElapsedMilliseconds < ms)
            {
                var v = await topic.ReadAsync(CancellationToken.None);
                if (record && v is not null && topic.Current is { } s)
                {
                    responses++;
                    last = s;
                    if (s.Silent) silentFrames++;
                    else loudFrames++;
                    maxPeak = Math.Max(maxPeak, s.Peak);
                    for (var i = 0; i < 24; i++) maxBands[i] = Math.Max(maxBands[i], s.Bands[i]);
                }
                openSeen = Math.Max(openSeen, engine.OpenLoopbacks);
                await Task.Delay(33);
            }
        }
        await PollAsync(WarmupMs, record: false);
        var frames0 = spectrum.FramesAnalyzed;
        var work0 = spectrum.WorkTime;
        var (r0, a0, b0, p0) = (spectrum.ReadTicks, spectrum.AnalyzeTicks, spectrum.BuildTicks, spectrum.PublishTicks);
        var busyCycles = ThreadCycles(worker);
        sw.Restart();
        await PollAsync(MeasureMs, record: true);
        var wall = sw.Elapsed;
        var (r1, a1, b1, p1) = (spectrum.ReadTicks, spectrum.AnalyzeTicks, spectrum.BuildTicks, spectrum.PublishTicks);
        var busyShare = (ThreadCycles(worker) - busyCycles) / cyclesPerSecond / wall.TotalSeconds;
        var frames = spectrum.FramesAnalyzed - frames0;
        var workUs = (spectrum.WorkTime - work0).TotalMicroseconds / Math.Max(1, frames);
        var workShare = (spectrum.WorkTime - work0).TotalSeconds / wall.TotalSeconds;
        var fftUs = SyntheticAnalysisMicroseconds(last?.SampleRate ?? 48000);

        // Our own loopback stream has a session on the endpoint; the mixer must not list it as an app.
        bool ownApp;
        using (engine.WatchSessions())
        {
            await PollAsync(400, record: false);
            ownApp = engine.GetApps().Any(a => a.Key == OwnExe);
        }

        Console.WriteLine($"     device: {last?.DeviceName ?? "(none)"}; mix {last?.SampleRate?.ToString() ?? "-"} Hz; streams opened {spectrum.StreamsOpened} ({spectrum.OpenTime.TotalMilliseconds:0.0} ms to open), live max {openSeen}");
        Console.WriteLine($"     {responses} responses in {wall.TotalMilliseconds:0} ms; {frames} frames ({frames / wall.TotalSeconds:0} fps), {spectrum.FftsRun} FFTs, {spectrum.FramesPublished} published; {loudFrames} with sound, {silentFrames} silent; peak max {maxPeak:0.000}");
        Console.WriteLine($"     bands max: {string.Join(" ", maxBands.Select(b => b.ToString("0.00")))}");
        Console.WriteLine($"     frame work (drain + analysis + publish): {workUs:0.0} us per frame = {workShare * 100:0.000}% of one core");
        Console.WriteLine($"     audio worker thread, exact cycles: {busyShare * 100:0.000}% of one core while demanded, {idleShare * 100:0.000}% idle (delta {(busyShare - idleShare) * 100:0.000}%)");
        Console.WriteLine($"     with sound (FFT path, synthetic tone on this CPU): {fftUs:0.0} us per frame = {fftUs * 30 / 1e4:0.000}% of one core at 30 fps");
        Console.WriteLine($"     our own process listed in the mixer during capture: {ownApp}; frames skipped by the driver: {engine.FramesSkipped}");
        double Us(long t) => Stopwatch.GetElapsedTime(0, t).TotalMicroseconds / Math.Max(1, frames);
        Console.WriteLine($"     breakdown per frame (measured window): read {Us(r1 - r0):0.0} us, analyze {Us(a1 - a0):0.0} us, build {Us(b1 - b0):0.0} us, publish {Us(p1 - p0):0.0} us");

        Assert.NotNull(last, "the spectrum answered");
        Assert.Equal(24, last!.Bands.Count);
        Assert.Equal(24, last.BandHz.Count);
        Assert.True(last.Bands.All(b => b is >= 0 and <= 1), "bands are 0..1");
        if (last.DeviceId is not null)
        {
            Assert.Equal(engine.GetDefaultId(AudioFlow.Render, AudioRole.Console), last.DeviceId);
            Assert.True(last.SampleRate is > 0, "the stream opened in the mix format");
            Assert.True(openSeen >= 1, "a loopback stream was open while demanded");
        }
        if (maxPeak == 0) Assert.True(last.Silent, "nothing played, so the spectrum says silent");
        Console.WriteLine($"     budget: {BudgetText}");
        Assert.True(workShare < Budget, $"frame work under {BudgetText} of a core ({workShare * 100:0.000}%)");
        Assert.True(fftUs * 30 / 1e6 < Budget, $"the FFT path is under {BudgetText} of a core too ({fftUs:0} us per frame)");
        Assert.True(busyShare - idleShare < 0.02, $"the worker's extra CPU stays small ({(busyShare - idleShare) * 100:0.000}%)");
        Assert.False(ownApp, "our loopback session is not listed as a mixer app");

        // Demand ends: everything is released and nothing keeps running.
        var stopBy = Environment.TickCount64 + 3000;
        while ((spectrum.Running || engine.OpenLoopbacks > 0 || engine.FrameDrivers > 0) && Environment.TickCount64 < stopBy) await Task.Delay(50);
        Assert.False(spectrum.Running, "frames stopped after the demand window");
        Assert.Equal(0, engine.FrameDrivers, "the frame timer is gone");
        Assert.Equal(0, engine.OpenLoopbacks, "every loopback COM object released");
        Assert.Null(topic.Current, "the topic is cleared while idle");
        Assert.Equal(spectrum.StreamsOpened, spectrum.StreamsClosed);

        Assert.Equal(stateBefore, DeviceState(engine), "no device, volume, mute or default changed");
    }

    /// <summary>
    /// The with-sound cost on real data, read-only: meters every output, and if one is already playing (another app's
    /// sound; this test never plays any), loopback-captures that endpoint for ~1.5 s through the engine's own frame
    /// driver, analyzing every frame like the provider does. Skips when nothing plays anywhere.
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Loopback_with_live_audio_stays_cheap_read_only()
    {
        var cyclesPerSecond = CalibrateCycles();
        var engine = AudioEngine.Start(new WarnLog());
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(10));
        await using var _engine = engine;
        if (!engine.IsAvailable) Assert.Skip("Core Audio is not available on this machine");
        var stateBefore = DeviceState(engine);
        var outputs = engine.GetDevices(AudioFlow.Render);
        var meters = outputs.Select(d => (d, m: engine.OpenMeter(d.Id))).ToList();
        var peaks = outputs.ToDictionary(d => d.Id, _ => 0f);
        for (var i = 0; i < 10; i++)
        {
            await Task.Delay(40);
            foreach (var (d, m) in meters) peaks[d.Id] = Math.Max(peaks[d.Id], m.Take().Peak);
        }
        foreach (var (_, m) in meters) m.Dispose();
        var loudest = outputs.OrderByDescending(d => peaks[d.Id]).FirstOrDefault();
        if (loudest is null || peaks[loudest.Id] <= 0) Assert.Skip("nothing is playing on any output right now (this test never plays a sound)");
        var live = loudest!;

        var source = (Spectrum.ILoopbackSource)engine;
        var analyzer = new Spectrum.SpectrumAnalyzer();
        var worker = await engine.WorkerThreadIdAsync();
        Spectrum.ILoopbackStream? stream = null;
        long frames = 0, packetFrames = 0, workTicks = 0, measuredFrom = 0;
        var failed = 0;
        var measuring = false;
        ulong cycles0 = 0;
        var sw = new Stopwatch();
        using (source.StartFrames(TimeSpan.FromMilliseconds(33), () =>
        {
            var t = Stopwatch.GetTimestamp();
            stream ??= source.OpenLoopback(live.Id);
            var r = stream.Read(analyzer);
            if (r.Status != Spectrum.LoopbackStatus.Ok) failed++;
            analyzer.Analyze();
            if (!measuring) return;
            frames++;
            packetFrames += r.Frames;
            workTicks += Stopwatch.GetTimestamp() - t;
        }))
        {
            await Task.Delay(WarmupMs);
            await engine.WorkerThreadIdAsync(); // a barrier: the frame callback's counters are touched on the worker only
            cycles0 = ThreadCycles(worker);
            measuredFrom = analyzer.FftCount;
            sw.Start();
            measuring = true;
            await Task.Delay(MeasureMs);
            measuring = false;
            sw.Stop();
        }
        var cycles = ThreadCycles(worker) - cycles0;
        var ffts = analyzer.FftCount - measuredFrom;
        await engine.WorkerThreadIdAsync();
        stream?.Dispose();
        await engine.WorkerThreadIdAsync();
        var share = cycles / cyclesPerSecond / sw.Elapsed.TotalSeconds;
        var workUs = Stopwatch.GetElapsedTime(0, workTicks).TotalMicroseconds / Math.Max(1, frames);
        Console.WriteLine($"     live endpoint: {live.Title} (peak {peaks[live.Id]:0.000}); {frames} frames ({frames / sw.Elapsed.TotalSeconds:0} fps), {ffts} FFTs, {packetFrames} audio frames ({packetFrames / sw.Elapsed.TotalSeconds:0}/s), {failed} failed reads");
        Console.WriteLine($"     bands now: {string.Join(" ", analyzer.Bands.ToArray().Select(b => b.ToString("0.00")))}");
        Console.WriteLine($"     drain + analysis {workUs:0.0} us per frame; audio worker thread {share * 100:0.000}% of one core (exact cycles) with sound");
        Assert.Equal(0, failed, "every read worked");
        Assert.True(ffts > 0, "audio arrived and was analyzed");
        Console.WriteLine($"     budget: {BudgetText}");
        Assert.True(share < Budget, $"under {BudgetText} of a core with sound ({share * 100:0.000}%)");
        Assert.Equal(0, engine.OpenLoopbacks, "released");
        Assert.Equal(0, engine.FrameDrivers);
        Assert.Equal(stateBefore, DeviceState(engine), "no device, volume, mute or default changed");
    }

    /// <summary>Write one 33 ms hop of a tone and analyze it (FFT, bands, smoothing), averaged over 300 frames.</summary>
    private static double SyntheticAnalysisMicroseconds(int rate)
    {
        var a = new Spectrum.SpectrumAnalyzer();
        a.SetFormat(rate, 2);
        var hop = new float[rate * 33 / 1000 * 2];
        for (var i = 0; i < hop.Length; i++) hop[i] = (float)(0.5 * Math.Sin(2 * Math.PI * 1000 * (i / 2) / rate));
        for (var i = 0; i < 60; i++) { a.Write(hop); a.Analyze(); }
        var t = Stopwatch.GetTimestamp();
        for (var i = 0; i < 300; i++) { a.Write(hop); a.Analyze(); }
        return Stopwatch.GetElapsedTime(t).TotalMicroseconds / 300;
    }

    private static readonly string OwnExe = Path.GetFileName(Environment.ProcessPath ?? "dotnet.exe").ToLowerInvariant();

    private static string DeviceState(IAudioEngine e) => string.Join(";",
        e.GetDevices(AudioFlow.Render).Concat(e.GetDevices(AudioFlow.Capture)).Select(d => $"{d.Id}={d.Volume:0.0000}/{d.Muted}")
            .Concat(from f in new[] { AudioFlow.Render, AudioFlow.Capture } from r in Enum.GetValues<AudioRole>() select $"{f}/{r}={e.GetDefaultId(f, r)}"));

    private static int Env(string name, int fallback) => int.TryParse(Environment.GetEnvironmentVariable(name), out var v) && v > 0 ? v : fallback;

    // ---------------------------------------------------------------- exact thread CPU (QueryThreadCycleTime)

    private static ulong ThreadCycles(int threadId)
    {
        var h = OpenThread(0x0800, false, (uint)threadId); // THREAD_QUERY_LIMITED_INFORMATION
        if (h == 0) return 0;
        try { return QueryThreadCycleTime(h, out var c) ? c : 0; }
        finally { CloseHandle(h); }
    }

    /// <summary>The cycle counter's rate, from spinning this thread for 200 ms.</summary>
    private static double CalibrateCycles()
    {
        var h = GetCurrentThread();
        QueryThreadCycleTime(h, out var c0);
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < 200) { }
        QueryThreadCycleTime(h, out var c1);
        return (c1 - c0) / sw.Elapsed.TotalSeconds;
    }

    [DllImport("kernel32.dll")] private static extern nint OpenThread(uint access, bool inherit, uint id);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint h);
    [DllImport("kernel32.dll")] private static extern nint GetCurrentThread();
    [DllImport("kernel32.dll")] private static extern bool QueryThreadCycleTime(nint h, out ulong cycles);

    private sealed class WarnLog : ILog
    {
        public void Write(LogLevel level, string message, Exception? exception = null)
        {
            if (level >= LogLevel.Warn) Console.WriteLine($"     [{level}] {message} {exception?.Message}");
        }

        public ILog For(string category) => this;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Warn;
    }
}
