using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Audio;
using PrismControl.Audio.Spectrum;
using PrismControl.Core.Data;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

/// <summary>
/// /v1/audio/spectrum on a fake loopback source and a <see cref="ManualTimeProvider"/>: frames run inside
/// <c>Advance</c>, so demand, cadence, smoothing and backoff are exact. Synthetic signals only.
/// </summary>
public class SpectrumProviderTests
{
    private static readonly TimeSpan Frame = SpectrumProvider.Interval;

    private sealed class Rig : IAsyncDisposable
    {
        public Rig(Action<FakeAudioEngine>? setup = null)
        {
            setup?.Invoke(Engine);
            Engine.Loopback.Time = Clock;
            Registry = new DataRegistry(Clock);
            Data = new AudioDataProviders(Engine, Registry, Clock, Log, CancellationToken.None);
            Data.Start();
        }

        public ManualTimeProvider Clock { get; } = new();
        public FakeAudioEngine Engine { get; } = Standard();
        public EngineFakeComTests.ListLog Log { get; } = new();
        public DataRegistry Registry { get; }
        public AudioDataProviders Data { get; }
        public DataTopic<AudioSpectrumSnapshot> Topic => Registry.AudioSpectrum;
        public SpectrumProvider Spectrum => Data.Spectrum!;
        public FakeLoopbackSource Loopback => Engine.Loopback;

        /// <summary>One request, like an HTTP poll or an in-process ReadAsync; frames due now run before it is answered.</summary>
        public async Task<JsonNode?> RequestAsync(TimeSpan? runFirst = null)
        {
            var pending = Topic.ReadAsync(CancellationToken.None).AsTask();
            Clock.Advance(runFirst ?? TimeSpan.Zero);
            var v = await pending;
            return v is null ? null : JsonNode.Parse(Encoding.UTF8.GetString(v.Body));
        }

        /// <summary>Lets time pass (frames run every 33 ms) without any request.</summary>
        public void Run(TimeSpan t) => Clock.Advance(t);

        /// <summary>Lets time pass while a client polls once a second (demand stays on).</summary>
        public async Task PollAsync(TimeSpan t)
        {
            var end = Clock.Elapsed + t;
            while (Clock.Elapsed < end)
            {
                await Topic.ReadAsync(CancellationToken.None);
                Clock.Advance(TimeSpan.FromSeconds(1) < end - Clock.Elapsed ? TimeSpan.FromSeconds(1) : end - Clock.Elapsed);
            }
        }

        public AudioSpectrumSnapshot Now => Topic.Current ?? throw new InvalidOperationException("no spectrum published");

        public async ValueTask DisposeAsync()
        {
            var done = Data.DisposeAsync().AsTask();
            Clock.Advance(Frame); // the next frame sees the shutdown and releases everything
            await done;
        }
    }

    private static int BandOf(double hz) => Enumerable.Range(0, SpectrumBands.Count).First(i => hz >= SpectrumBands.LowerEdge(i) && hz < SpectrumBands.UpperEdge(i));

    private static int Loudest(AudioSpectrumSnapshot s) => s.Bands.IndexOf(s.Bands.Max());

    [Test]
    public async Task Nothing_runs_until_requested_and_reading_Current_is_not_demand()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        Assert.True(rig.Data.ClaimedSpectrum);
        Assert.Equal("audio", rig.Topic.Source);
        for (var i = 0; i < 30; i++)
        {
            Assert.Null(rig.Topic.Current, "in-process readers see null while idle");
            rig.Run(TimeSpan.FromMilliseconds(100));
        }
        Assert.False(rig.Topic.IsDemanded, "reading Current records no demand");
        Assert.Equal(0, rig.Loopback.Drivers, "no frame timer");
        Assert.Equal(0, rig.Loopback.Opened.Count, "no capture stream was ever opened");
        Assert.Equal(0L, rig.Spectrum.FramesAnalyzed);
    }

    [Test]
    public async Task A_request_starts_capture_and_serves_the_default_outputs_bands()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        var j = await rig.RequestAsync();
        Assert.NotNull(j, "the first request after idle gets the first frame");
        Assert.Equal(Speakers, j!["deviceId"]!.GetValue<string>());
        Assert.Equal("Speakers (Example USB Audio)", j["deviceName"]!.GetValue<string>());
        Assert.Equal(48000, j["sampleRate"]!.GetValue<int>());
        Assert.False(j["silent"]!.GetValue<bool>());
        Assert.Near(0.5, j["peak"]!.GetValue<double>(), 0.001);
        Assert.Near(0.5 / Math.Sqrt(2), j["rms"]!.GetValue<double>(), 0.005);
        var bands = j["bands"]!.AsArray().Select(b => b!.GetValue<double>()).ToList();
        var hz = j["bandHz"]!.AsArray().Select(b => b!.GetValue<double>()).ToList();
        Assert.Equal(24, bands.Count);
        Assert.Equal(string.Join(",", SpectrumBands.CentersRounded.ToArray()), string.Join(",", hz));
        Assert.Equal(BandOf(1000), bands.IndexOf(bands.Max()), "1 kHz lands in its band");
        Assert.InRange(bands.Max(), 0.85, 0.905);
        Assert.Equal(Speakers, Assert.Single(rig.Loopback.Opened));
        Assert.Equal(1, rig.Loopback.Live);
        Assert.Equal(1, rig.Loopback.Drivers);
        Assert.True(rig.Topic.IsDemanded);
    }

    [Test]
    public async Task ReadAsync_creates_demand_and_capture_stops_5_s_after_the_last_read()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 440, 0.3);
        Assert.NotNull(await rig.RequestAsync());
        var published = rig.Topic.Seq;
        rig.Run(TimeSpan.FromSeconds(4.9));
        Assert.True(rig.Spectrum.Running, "still demanded 4.9 s after the read");
        // A steady tone gives identical (rounded) frames once the bars settle: those go out once a second.
        Assert.True(rig.Topic.Seq >= published + 4, $"published {rig.Topic.Seq - published} times");
        Assert.NotNull(rig.Topic.Current, "in-process readers see every frame through Current");
        var frames = rig.Spectrum.FramesAnalyzed;
        Assert.InRange(frames, 145, 150); // 4.9 s / 33 ms + the first frame

        rig.Run(TimeSpan.FromSeconds(0.2));
        Assert.False(rig.Spectrum.Running, "stopped after the 5 s window");
        Assert.Equal(0, rig.Loopback.Live, "the stream is released");
        Assert.Equal(0, rig.Loopback.Drivers, "the frame timer is gone");
        Assert.Null(rig.Topic.Current, "cleared: the next request waits for a fresh frame");
        var after = rig.Spectrum.FramesAnalyzed;
        rig.Run(TimeSpan.FromSeconds(10));
        rig.Run(TimeSpan.FromSeconds(1));
        Assert.Equal(after, rig.Spectrum.FramesAnalyzed, "zero work while idle");

        // Demand again: a fresh period with a fresh stream.
        Assert.NotNull(await rig.RequestAsync());
        Assert.Equal(2, rig.Spectrum.Starts);
        Assert.Equal(2, rig.Loopback.Opened.Count);
        Assert.Equal(1, rig.Loopback.Live);
    }

    [Test]
    public async Task Demand_starts_the_spectrum_for_in_process_readers_and_keeps_it_alive()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        rig.Topic.Demand(); // what a Kaleidoscope key or the Galleon screen calls while it shows the bars
        Assert.Equal(1, rig.Loopback.Drivers, "frames started");
        rig.Run(TimeSpan.Zero);
        Assert.Equal(BandOf(1000), Loudest(rig.Now), "Current carries the frame");
        for (var i = 0; i < 20; i++)
        {
            rig.Run(TimeSpan.FromSeconds(1));
            rig.Topic.Demand(); // once a second
            Assert.NotNull(rig.Topic.Current);
        }
        Assert.True(rig.Spectrum.Running);
        Assert.Equal(1, rig.Spectrum.Starts);
        Assert.Equal(1, rig.Loopback.Opened.Count, "one stream the whole time");
        rig.Run(TimeSpan.FromSeconds(4.9));
        Assert.True(rig.Spectrum.Running, "inside the window");
        rig.Run(TimeSpan.FromSeconds(0.2));
        Assert.False(rig.Spectrum.Running, "lapsed 5 s after the last Demand()");
        Assert.Equal(0, rig.Loopback.Live);
        Assert.Null(rig.Topic.Current);
    }

    [Test]
    public async Task Steady_polling_keeps_one_stream_open()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 440, 0.3);
        await rig.RequestAsync();
        await rig.PollAsync(TimeSpan.FromSeconds(20));
        Assert.True(rig.Spectrum.Running);
        Assert.Equal(1, rig.Spectrum.Starts);
        Assert.Equal(1, rig.Loopback.Opened.Count, "one stream for the whole session");
        Assert.InRange(rig.Spectrum.FramesAnalyzed, 600, 610); // 30 fps
    }

    [Test]
    public async Task It_follows_a_default_output_change()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 200, 0.5);
        rig.Loopback.Play(Headset, 5000, 0.5);
        var j = await rig.RequestAsync();
        Assert.Equal(BandOf(200), Loudest(rig.Now));
        rig.Engine.ExternalDefault(AudioFlow.Render, Headset);
        rig.Run(Frame);
        Assert.Equal(Headset, rig.Now.DeviceId);
        Assert.Equal("Headphones (The Example Ensemble Headset)", rig.Now.DeviceName);
        Assert.Equal($"{Speakers},{Headset}", string.Join(",", rig.Loopback.Opened));
        Assert.Equal(1, rig.Loopback.Live, "the old stream was released first");
        rig.Run(TimeSpan.FromMilliseconds(1500));
        Assert.Equal(BandOf(5000), Loudest(rig.Now), "the new device's audio");
        Assert.True(rig.Now.Bands[BandOf(200)] < 0.05, "the old device's bars fell away");
    }

    [Test]
    public async Task Nothing_playing_times_out_to_silent()
    {
        await using var rig = new Rig();
        rig.Loopback.Idle(Speakers); // the stream opens, but loopback delivers no packets
        var pending = rig.Topic.ReadAsync(CancellationToken.None).AsTask();
        rig.Run(TimeSpan.FromMilliseconds(100));
        Assert.Null(rig.Topic.Current, "no frame yet: it waits for audio or the starve timeout");
        rig.Run(TimeSpan.FromMilliseconds(100));
        var v = await pending;
        Assert.NotNull(v);
        var s = rig.Now;
        Assert.True(s.Silent);
        Assert.Equal(0.0, s.Bands.Max());
        Assert.Equal(0.0, s.Peak);
        Assert.Equal(0.0, s.Rms);
        Assert.Equal(48000, s.SampleRate, "the stream is open; it just hears nothing");
        Assert.Equal(Speakers, s.DeviceId);
    }

    [Test]
    public async Task Silent_packets_are_silent_at_once()
    {
        await using var rig = new Rig();
        rig.Loopback.SilentPackets(Speakers);
        var j = await rig.RequestAsync();
        Assert.True(j!["silent"]!.GetValue<bool>());
        Assert.Equal(0.0, j["bands"]!.AsArray().Max(b => b!.GetValue<double>()));
    }

    [Test]
    public async Task When_the_music_stops_the_bars_fall_then_it_says_silent()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.8);
        await rig.RequestAsync();
        rig.Run(TimeSpan.FromMilliseconds(300));
        var band = BandOf(1000);
        var top = rig.Now.Bands[band];
        Assert.True(top > 0.9);
        rig.Loopback.Idle(Speakers); // no more packets
        rig.Run(TimeSpan.FromMilliseconds(132));
        Assert.Near(0.8, rig.Now.Peak, 0.001, "a frame without packets keeps the last values until the starve timeout");
        Assert.Equal(top, rig.Now.Bands[band]);
        rig.Run(Frame); // 165 ms ≥ 150 ms: from here the input is silence
        Assert.Equal(0.0, rig.Now.Peak);
        Assert.Equal(0.0, rig.Now.Rms);
        Assert.False(rig.Now.Silent, "the bars are still falling");
        var start = rig.Now.Bands[band];
        rig.Run(TimeSpan.FromMilliseconds(297)); // nine frames ≈ one 300 ms release time constant
        Assert.Near(start * Math.Exp(-0.297 / 0.3), rig.Now.Bands[band], 0.002);
        rig.Run(TimeSpan.FromSeconds(1.5));
        Assert.True(rig.Now.Silent, "every band below 0.01 and no signal");
        Assert.True(rig.Now.Bands.Max() < 0.01);
        rig.Run(TimeSpan.FromSeconds(1));
        Assert.Equal(0.0, rig.Now.Bands.Max(), "snapped to 0");
    }

    [Test]
    public async Task Silence_is_republished_once_a_second_so_pollers_get_304s()
    {
        await using var rig = new Rig();
        rig.Loopback.Idle(Speakers);
        await rig.RequestAsync(TimeSpan.FromMilliseconds(200));
        var seq = rig.Topic.Seq;
        rig.Run(TimeSpan.FromMilliseconds(900));
        Assert.Equal(seq, rig.Topic.Seq, "identical silent frames are not republished");
        rig.Run(TimeSpan.FromSeconds(3));
        Assert.InRange(rig.Topic.Seq - seq, 3, 4, "a heartbeat each second keeps ageMs small");
        Assert.InRange(rig.Spectrum.FramesAnalyzed, 125, 130, "analysis still runs every frame");
        rig.Loopback.Play(Speakers, 1000, 0.5);
        seq = rig.Topic.Seq;
        rig.Run(TimeSpan.FromMilliseconds(330));
        Assert.InRange(rig.Topic.Seq - seq, 9, 11, "while playing, every frame is new");
    }

    [Test]
    public async Task No_default_output_serves_silence_with_a_null_device()
    {
        await using var rig = new Rig(f => f.NoDefault(AudioFlow.Render));
        var j = await rig.RequestAsync();
        Assert.NotNull(j);
        Assert.Null(j!["deviceId"]);
        Assert.Null(j["deviceName"]);
        Assert.Null(j["sampleRate"]);
        Assert.True(j["silent"]!.GetValue<bool>());
        Assert.Equal(24, j["bands"]!.AsArray().Count);
        Assert.Equal(0, rig.Loopback.Opened.Count);
        // The JSON is the contract: camelCase, every property present, nulls written.
        var text = j.ToJsonString();
        Assert.Contains("\"deviceId\":null", text);
        Assert.Contains("\"sampleRate\":null", text);
        Assert.Equal("deviceId,deviceName,bands,bandHz,peak,rms,silent,sampleRate", string.Join(",", j.AsObject().Select(p => p.Key)));
    }

    [Test]
    public async Task An_unavailable_engine_releases_the_stream_until_it_is_back()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        await rig.RequestAsync();
        rig.Engine.IsAvailable = false; // e.g. the audio service restarted
        await rig.PollAsync(TimeSpan.FromSeconds(1));
        Assert.Equal(0, rig.Loopback.Live);
        Assert.Null(rig.Now.DeviceId);
        Assert.Null(rig.Now.SampleRate);
        rig.Engine.IsAvailable = true;
        rig.Run(Frame);
        Assert.Equal(1, rig.Loopback.Live);
        Assert.Equal(2, rig.Loopback.Opened.Count);
        rig.Run(TimeSpan.FromMilliseconds(100));
        Assert.Equal(Speakers, rig.Now.DeviceId);
        Assert.False(rig.Now.Silent);
    }

    [Test]
    public async Task A_stream_that_fails_to_open_is_retried_with_backoff()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        rig.Loopback.FailNextOpens(3);
        var j = await rig.RequestAsync();
        Assert.NotNull(j);
        Assert.Equal(Speakers, j!["deviceId"]!.GetValue<string>());
        Assert.Null(j["sampleRate"], "no stream is open");
        Assert.True(j["silent"]!.GetValue<bool>());
        Assert.Equal(1, rig.Loopback.Opened.Count);
        rig.Run(TimeSpan.FromMilliseconds(240));
        Assert.Equal(1, rig.Loopback.Opened.Count, "waits 250 ms");
        rig.Run(TimeSpan.FromMilliseconds(40));
        Assert.Equal(2, rig.Loopback.Opened.Count);
        rig.Run(TimeSpan.FromMilliseconds(460));
        Assert.Equal(2, rig.Loopback.Opened.Count, "then 500 ms");
        rig.Run(TimeSpan.FromMilliseconds(80));
        Assert.Equal(3, rig.Loopback.Opened.Count);
        rig.Run(TimeSpan.FromMilliseconds(1050));
        Assert.Equal(4, rig.Loopback.Opened.Count, "then 1 s; this one works");
        Assert.Equal(1, rig.Loopback.Live);
        rig.Run(TimeSpan.FromMilliseconds(100));
        Assert.Equal(48000, rig.Now.SampleRate);
        Assert.False(rig.Now.Silent);
        Assert.Equal(1, rig.Log.Lines.Count(l => l.Contains("loopback capture of the default output failed")), "one warning, not one per retry");
    }

    [Test]
    public async Task A_device_that_breaks_mid_stream_is_reopened()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        await rig.RequestAsync();
        rig.Loopback.Break(Speakers); // unplugged, or its format changed
        rig.Run(Frame);
        Assert.Equal(0, rig.Loopback.Live);
        rig.Loopback.Play(Speakers, 2000, 0.5);
        rig.Run(TimeSpan.FromMilliseconds(400));
        Assert.Equal(2, rig.Loopback.Opened.Count);
        Assert.Equal(1, rig.Loopback.Live);
        Assert.Equal(BandOf(2000), Loudest(rig.Now));
    }

    [Test]
    public async Task Other_rates_and_mono_endpoints_work()
    {
        await using var rig = new Rig();
        rig.Loopback.Play(Speakers, 3000, 0.5, rate: 44100, channels: 1);
        await rig.RequestAsync();
        rig.Run(TimeSpan.FromMilliseconds(100));
        Assert.Equal(44100, rig.Now.SampleRate);
        Assert.Equal(BandOf(3000), Loudest(rig.Now));
    }

    [Test]
    public async Task Shutdown_releases_the_stream_and_the_frame_timer()
    {
        var rig = new Rig();
        rig.Loopback.Play(Speakers, 1000, 0.5);
        await rig.RequestAsync();
        Assert.Equal(1, rig.Loopback.Live);
        var dispose = rig.DisposeAsync().AsTask();
        rig.Run(Frame); // the next frame sees the shutdown
        await dispose;
        Assert.Equal(0, rig.Loopback.Live);
        Assert.Equal(0, rig.Loopback.Drivers);
        Assert.False(rig.Spectrum.Running);
        Assert.Null(await rig.RequestAsync(), "no restart after shutdown");
        Assert.Equal(0, rig.Loopback.Drivers);
    }

    [Test]
    public async Task A_second_provider_cannot_take_the_spectrum()
    {
        await using var rig = new Rig();
        await using var second = new AudioDataProviders(rig.Engine, rig.Registry, rig.Clock, rig.Log, CancellationToken.None);
        second.Start();
        Assert.False(second.ClaimedSpectrum);
        Assert.True(rig.Data.ClaimedSpectrum);
    }

    [Test]
    public async Task The_module_serves_the_spectrum_in_safe_mode_and_writes_nothing()
    {
        var fake = Standard();
        fake.Loopback.Play(Speakers, 1000, 0.5);
        await using var rig = ModuleRig.Start(fake, safeMode: true);
        var topic = rig.Context.Data.AudioSpectrum;
        Assert.Equal("audio", topic.Source);
        topic.DemandWindow = TimeSpan.FromMilliseconds(300);
        var v = await topic.ReadAsync(CancellationToken.None); // real clock: frames every 33 ms
        Assert.NotNull(v, "capture is a read, so it runs in safe mode");
        Assert.Equal(Speakers, topic.Current!.DeviceId);
        Assert.Empty(fake.Writes, "no Core Audio write");
        var until = Environment.TickCount64 + 3000;
        while (fake.Loopback.Live > 0 && Environment.TickCount64 < until) await Task.Delay(20);
        Assert.Equal(0, fake.Loopback.Live, "released after the demand window");
        await rig.ShutDownAsync();
        Assert.Equal(0, fake.Loopback.Drivers);
    }
}
