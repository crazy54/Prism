using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Audio.Interop;
using PrismControl.Audio.Spectrum;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>
/// The real engine's WASAPI loopback code against <see cref="FakeAudioService"/>'s fake IAudioClient/IAudioCaptureClient:
/// stream setup, packet draining, silent packets, PCM conversion, failures, service restarts and deterministic release,
/// without touching this PC's audio.
/// </summary>
public class LoopbackFakeComTests
{
    private const string Speakers = "{fake}.speakers", Headset = "{fake}.headset", Mic = "{fake}.mic";

    private static async Task<AudioEngine> StartAsync(FakeAudioService svc, bool safeMode = false)
    {
        var engine = AudioEngine.Start(NullLog.Instance, svc.Options(safeMode));
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(5));
        return engine;
    }

    private static async Task Until(Func<bool> condition, string what, int timeoutMs = 3000)
    {
        var sw = Stopwatch.StartNew();
        while (!condition())
        {
            if (sw.ElapsedMilliseconds > timeoutMs) Assert.Fail($"timed out waiting for: {what}");
            await Task.Delay(10);
        }
    }

    /// <summary>Records what a stream delivers.</summary>
    private sealed class Recorder : ILoopbackSink
    {
        public int Rate, Channels, Silence;
        public List<float> Samples { get; } = [];
        public void SetFormat(int sampleRate, int channels) { Rate = sampleRate; Channels = channels; }
        public void Write(ReadOnlySpan<float> interleaved) => Samples.AddRange(interleaved.ToArray());
        public void WriteSilence(int frames) => Silence += frames;
    }

    private static float[] Packet(int frames, float value, int channels = 2) => Enumerable.Range(0, frames * channels).Select(i => value * (i % 2 == 0 ? 1 : -1)).ToArray();

    private static List<(object Object, int Refs)> StreamObjects(FakeAudioService svc) =>
        svc.Outstanding().Where(o => o.Object is FakeAudioClient or FakeCaptureClient or FakeStreamSession).ToList();

    [Test]
    public async Task A_stream_opens_shared_loopback_in_the_mix_format_and_opts_out_of_ducking()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var source = (ILoopbackSource)engine;
        var sink = new Recorder();
        var stream = source.OpenLoopback(Speakers);
        var r = await engine.RunOnWorkerAsync(() => stream.Read(sink));
        Assert.Equal(LoopbackStatus.Ok, r.Status);
        Assert.Equal(0, r.Frames, "nothing plays yet");
        var client = Assert.Single(svc.Find(Speakers)!.ClientsSnapshot());
        Assert.Equal(Wasapi.AUDCLNT_SHAREMODE_SHARED, client.ShareMode);
        Assert.Equal(Wasapi.AUDCLNT_STREAMFLAGS_LOOPBACK, client.StreamFlags);
        Assert.Equal(AudioEngine.LoopbackBuffer.Ticks, client.BufferDuration);
        Assert.True(client.Started);
        Assert.Equal(1, client.Session.DuckingOptOut ?? -1, "our stream's session opts out of communications ducking");
        Assert.Equal(48000, sink.Rate);
        Assert.Equal(2, sink.Channels);
        Assert.Equal(1, engine.OpenLoopbacks);
        Assert.Equal(0, svc.Setters, "no volume, mute or default was set");
        stream.Dispose();
    }

    [Test]
    public async Task Packets_reach_the_sink_and_silent_packets_count_as_zeros()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var ep = svc.Find(Speakers)!;
        var sink = new Recorder();
        var stream = ((ILoopbackSource)engine).OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(sink));
        ep.Play(Packet(480, 0.25f));
        ep.Play(Packet(480, 0.5f));
        ep.Play(Packet(480, 0f), Wasapi.AUDCLNT_BUFFERFLAGS_SILENT); // its buffer holds garbage on purpose
        var r = await engine.RunOnWorkerAsync(() => stream.Read(sink));
        Assert.Equal(1440, r.Frames);
        Assert.Equal(1920, sink.Samples.Count, "two real packets, interleaved stereo");
        Assert.True(sink.Samples.Take(960).All(x => Math.Abs(x) == 0.25f) && sink.Samples.Skip(960).All(x => Math.Abs(x) == 0.5f));
        Assert.Equal(480, sink.Silence, "the silent packet arrives as 480 frames of zeros; its data is never read");
        var capture = svc.Find(Speakers)!.ClientsSnapshot()[0].Capture;
        Assert.Equal(3, capture.Released, "every packet was released");
        Assert.Equal(0, capture.Pending);
        Assert.Equal(0, (await engine.RunOnWorkerAsync(() => stream.Read(sink))).Frames, "nothing new: one GetBuffer call says empty");
        stream.Dispose();
    }

    [Test]
    public async Task Pcm16_mix_formats_are_converted()
    {
        var svc = FakeAudioService.Standard();
        svc.Find(Speakers)!.MixIsPcm16 = true;
        svc.Find(Speakers)!.MixRate = 44100;
        await using var engine = await StartAsync(svc);
        var sink = new Recorder();
        var stream = ((ILoopbackSource)engine).OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(sink));
        svc.Find(Speakers)!.Play(Packet(441, 0.5f));
        await engine.RunOnWorkerAsync(() => stream.Read(sink));
        Assert.Equal(44100, sink.Rate);
        Assert.Equal(882, sink.Samples.Count);
        Assert.True(sink.Samples.All(x => Math.Abs(Math.Abs(x) - 0.5f) < 0.0001f), "16-bit samples arrive as floats");
        stream.Dispose();
    }

    [Test]
    public async Task Dispose_stops_and_releases_every_stream_object()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var stream = ((ILoopbackSource)engine).OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        Assert.True(StreamObjects(svc).Count > 0);
        stream.Dispose();
        await engine.RunOnWorkerAsync(() => 0); // the release runs on the worker
        var client = svc.Find(Speakers)!.ClientsSnapshot()[0];
        Assert.Equal(1, client.StopCalls, "stopped before release");
        Assert.Empty(StreamObjects(svc).Select(o => $"{o.Object.GetType().Name}×{o.Refs}"), "IAudioClient, IAudioCaptureClient and the session are released");
        Assert.Equal(0, engine.OpenLoopbacks);
        Assert.Equal(LoopbackStatus.Failed, (await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()))).Status, "a disposed stream never reopens");
        Assert.Equal(1, svc.Find(Speakers)!.ClientsSnapshot().Length);
    }

    [Test]
    public async Task An_invalidated_device_fails_the_stream_and_a_new_one_works()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var source = (ILoopbackSource)engine;
        var stream = source.OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        svc.Find(Speakers)!.ClientsSnapshot()[0].FailWith = HResults.AUDCLNT_E_DEVICE_INVALIDATED; // e.g. its format was changed
        var r = await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        Assert.Equal(LoopbackStatus.Failed, r.Status);
        Assert.Equal(HResults.AUDCLNT_E_DEVICE_INVALIDATED, r.Hr);
        Assert.Equal(0, engine.OpenLoopbacks, "released on failure");
        Assert.Empty(StreamObjects(svc));
        Assert.Equal(LoopbackStatus.Failed, (await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()))).Status, "stays failed");
        stream.Dispose();
        await Task.Delay(400); // DEVICE_INVALIDATED marked the endpoint stale: let the debounced rescan rebuild it
        Assert.NotNull(engine.GetDevice(Speakers), "the endpoint is back after the rescan");
        var again = source.OpenLoopback(Speakers);
        Assert.Equal(LoopbackStatus.Ok, (await engine.RunOnWorkerAsync(() => again.Read(new Recorder()))).Status);
        Assert.Equal(2, svc.Find(Speakers)!.ClientsSnapshot().Length);
        again.Dispose();
    }

    [Test]
    public async Task An_audio_service_restart_fails_the_stream_and_recovery_brings_it_back()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var source = (ILoopbackSource)engine;
        var stream = source.OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        svc.Stop();
        var r = await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        Assert.Equal(LoopbackStatus.Failed, r.Status);
        Assert.Equal(FakeAudioService.Down, r.Hr);
        await Until(() => !engine.IsAvailable, "the engine noticed the outage from the capture call");
        Assert.Equal(0, engine.OpenLoopbacks);
        stream.Dispose();
        svc.Restart();
        await Until(() => engine.IsAvailable, "the engine reconnected");
        var again = source.OpenLoopback(Speakers);
        var sink = new Recorder();
        Assert.Equal(LoopbackStatus.Ok, (await engine.RunOnWorkerAsync(() => again.Read(sink))).Status);
        svc.Find(Speakers)!.Play(Packet(480, 0.1f));
        Assert.Equal(480, (await engine.RunOnWorkerAsync(() => again.Read(sink))).Frames, "the new generation's stream delivers");
        again.Dispose();
        await engine.RunOnWorkerAsync(() => 0);
        Assert.Empty(StreamObjects(svc));
    }

    [Test]
    public async Task Unplugging_the_endpoint_closes_its_stream()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var stream = ((ILoopbackSource)engine).OpenLoopback(Headset);
        await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        Assert.Equal(1, engine.OpenLoopbacks);
        svc.Unplug(Headset);
        await Until(() => engine.OpenLoopbacks == 0, "the removed endpoint's stream is closed");
        Assert.Empty(StreamObjects(svc));
        Assert.Equal(LoopbackStatus.Failed, (await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()))).Status);
        stream.Dispose();
    }

    [Test]
    public async Task Loopback_needs_an_output_and_reads_only_on_the_worker()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var source = (ILoopbackSource)engine;
        var mic = source.OpenLoopback(Mic);
        Assert.Equal(LoopbackStatus.Failed, (await engine.RunOnWorkerAsync(() => mic.Read(new Recorder()))).Status, "a capture endpoint has nothing to loop back");
        var unknown = source.OpenLoopback("{fake}.nothing");
        Assert.Equal(HResults.E_NOTFOUND, (await engine.RunOnWorkerAsync(() => unknown.Read(new Recorder()))).Hr);
        var off = source.OpenLoopback(Speakers);
        Assert.Throws<InvalidOperationException>(() => off.Read(new Recorder()));
        mic.Dispose();
        unknown.Dispose();
        off.Dispose();
        Assert.Equal(0, svc.Find(Mic)!.ClientsSnapshot().Length);
    }

    [Test]
    public async Task Teardown_closes_streams_and_frame_timers()
    {
        var svc = FakeAudioService.Standard();
        var engine = await StartAsync(svc);
        var source = (ILoopbackSource)engine;
        var stream = source.OpenLoopback(Speakers);
        var frames = 0;
        var onWorker = true;
        var driver = source.StartFrames(TimeSpan.FromMilliseconds(10), () =>
        {
            onWorker &= engine.RunOnWorkerAsync(() => 0).IsCompletedSuccessfully; // InvokeAsync runs inline on the worker
            stream.Read(new Recorder());
            frames++;
        });
        await Until(() => frames >= 5, "frames run");
        Assert.True(onWorker, "frames run on the audio worker");
        Assert.Equal(1, engine.FrameDrivers);
        Assert.Equal(1, engine.OpenLoopbacks);
        await engine.DisposeAsync(); // the driver was never disposed by its owner
        Assert.Equal(0, engine.FrameDrivers, "no frame timer outlives the engine");
        Assert.Equal(0, engine.OpenLoopbacks);
        Assert.Empty(StreamObjects(svc));
        var stopped = frames;
        await Task.Delay(100);
        Assert.Equal(stopped, frames);
        driver.Dispose();
        stream.Dispose();
    }

    [Test]
    public async Task Frame_driver_keeps_30_fps_on_average()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var frames = 0;
        var sw = Stopwatch.StartNew();
        using (((ILoopbackSource)engine).StartFrames(TimeSpan.FromMilliseconds(33), () => frames++))
            await Task.Delay(1000);
        var fps = frames / sw.Elapsed.TotalSeconds;
        Console.WriteLine($"     {frames} frames in {sw.ElapsedMilliseconds} ms ({fps:0.0} fps); restarts after stalls: {engine.FramesSkipped}");
        Assert.InRange(fps, 26, 33); // a plain 33 ms periodic timer gives ~21 fps at the default 15.6 ms timer granularity
        await Task.Delay(100);
        Assert.Equal(0, engine.FrameDrivers);
    }

    [Test]
    public async Task Safe_mode_still_captures_and_never_calls_a_setter()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc, safeMode: true);
        var stream = ((ILoopbackSource)engine).OpenLoopback(Speakers);
        await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()));
        svc.Find(Speakers)!.Play(Packet(480, 0.3f));
        Assert.Equal(480, (await engine.RunOnWorkerAsync(() => stream.Read(new Recorder()))).Frames);
        Assert.Equal(0, svc.Setters);
        stream.Dispose();
    }

    [Test]
    public async Task The_spectrum_topic_runs_end_to_end_on_the_real_engine()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        var registry = new DataRegistry();
        await using var data = new AudioDataProviders(engine, registry, TimeProvider.System, NullLog.Instance, CancellationToken.None);
        data.Start();
        var topic = registry.AudioSpectrum;
        topic.DemandWindow = TimeSpan.FromMilliseconds(400);
        Assert.Equal(0, engine.FrameDrivers);
        await topic.ReadAsync(CancellationToken.None);
        await Until(() => svc.Find(Speakers)!.ClientsSnapshot().Any(c => c.Started), "the provider opened loopback on the default output");
        var ep = svc.Find(Speakers)!;
        // 1 kHz at −6 dBFS, fed as 10 ms packets while polling.
        var phase = 0.0;
        JsonNode? j = null;
        for (var i = 0; i < 40; i++)
        {
            var p = new float[480 * 2];
            for (var f = 0; f < 480; f++, phase += 2 * Math.PI * 1000 / 48000) p[2 * f] = p[2 * f + 1] = (float)(0.5 * Math.Sin(phase));
            ep.Play(p);
            if (i % 3 == 0)
            {
                var v = await topic.ReadAsync(CancellationToken.None);
                if (v is not null) j = JsonNode.Parse(Encoding.UTF8.GetString(v.Body));
            }
            await Task.Delay(10);
        }
        Assert.NotNull(j);
        var bands = j!["bands"]!.AsArray().Select(b => b!.GetValue<double>()).ToList();
        Assert.Equal(Speakers, j["deviceId"]!.GetValue<string>());
        Assert.Equal(48000, j["sampleRate"]!.GetValue<int>());
        Assert.False(j["silent"]!.GetValue<bool>());
        Assert.Equal(Enumerable.Range(0, 24).First(i => 1000 >= SpectrumBands.LowerEdge(i) && 1000 < SpectrumBands.UpperEdge(i)), bands.IndexOf(bands.Max()));
        await Until(() => engine.FrameDrivers == 0 && engine.OpenLoopbacks == 0, "demand ended: frames stopped and the stream released");
        Assert.Empty(StreamObjects(svc));
        Assert.Null(topic.Current);
    }
}
