using System.Runtime.InteropServices;
using PrismControl.Audio.Interop;
using PrismControl.Audio.Spectrum;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>The spectrum's math: FFT, band layout, dB scale, smoothing, silence, sample formats. Synthetic signals only.</summary>
public class SpectrumDspTests
{
    private const int Rate = 48000;

    private static float[] Sine(double hz, double amplitude, int frames, int channels = 2, int rate = Rate, double phase = 0)
    {
        var s = new float[frames * channels];
        for (var f = 0; f < frames; f++)
        {
            var v = (float)(amplitude * Math.Sin(phase + 2 * Math.PI * hz * f / rate));
            for (var c = 0; c < channels; c++) s[f * channels + c] = v;
        }
        return s;
    }

    private static float[] Mix(params float[][] signals)
    {
        var s = new float[signals[0].Length];
        foreach (var x in signals)
            for (var i = 0; i < s.Length; i++) s[i] += x[i];
        return s;
    }

    /// <summary>The band whose [lower, upper) edges contain <paramref name="hz"/>.</summary>
    private static int BandOf(double hz) => Enumerable.Range(0, SpectrumBands.Count).First(i => hz >= SpectrumBands.LowerEdge(i) && hz < SpectrumBands.UpperEdge(i));

    private static int ArgMax(ReadOnlySpan<double> v)
    {
        var best = 0;
        for (var i = 1; i < v.Length; i++) if (v[i] > v[best]) best = i;
        return best;
    }

    private static (SpectrumAnalyzer A, ManualTimeProvider Clock) Analyzer(int rate = Rate, int channels = 2)
    {
        var clock = new ManualTimeProvider();
        var a = new SpectrumAnalyzer(clock);
        a.SetFormat(rate, channels);
        return (a, clock);
    }

    private static double[] TargetsOf(float[] samples, int channels = 2, int rate = Rate)
    {
        var (a, _) = Analyzer(rate, channels);
        a.Write(samples);
        a.Analyze();
        return a.Targets.ToArray();
    }

    // ---------------------------------------------------------------- FFT

    [Test]
    public void Fft_matches_a_direct_dft()
    {
        const int n = 64;
        var rng = new Random(7);
        var re = Enumerable.Range(0, n).Select(_ => rng.NextDouble() * 2 - 1).ToArray();
        var im = Enumerable.Range(0, n).Select(_ => rng.NextDouble() * 2 - 1).ToArray();
        var (r0, i0) = ((double[])re.Clone(), (double[])im.Clone());
        new Fft(n).Forward(re, im);
        for (var k = 0; k < n; k++)
        {
            double sr = 0, si = 0;
            for (var t = 0; t < n; t++)
            {
                var a = -2 * Math.PI * k * t / n;
                sr += r0[t] * Math.Cos(a) - i0[t] * Math.Sin(a);
                si += r0[t] * Math.Sin(a) + i0[t] * Math.Cos(a);
            }
            Assert.Near(sr, re[k], 1e-9, $"re[{k}]");
            Assert.Near(si, im[k], 1e-9, $"im[{k}]");
        }
    }

    [Test]
    public void Fft_of_an_impulse_is_flat_and_sizes_must_be_powers_of_two()
    {
        var re = new double[2048];
        var im = new double[2048];
        re[0] = 1;
        new Fft(2048).Forward(re, im);
        for (var k = 0; k < 2048; k++) Assert.Near(1, Math.Sqrt(re[k] * re[k] + im[k] * im[k]), 1e-12);
        Assert.Throws<ArgumentOutOfRangeException>(() => new Fft(1000));
        Assert.Throws<ArgumentOutOfRangeException>(() => new Fft(1));
    }

    // ---------------------------------------------------------------- known signals

    [Test]
    public void A_pure_sine_lands_in_its_band_at_its_level()
    {
        foreach (var band in new[] { 2, 6, 9, 12, 15, 18, 21, 23 })
        {
            var hz = SpectrumBands.Center(band);
            var t = TargetsOf(Sine(hz, 0.5, 4096));
            Assert.Equal(band, ArgMax(t), $"{hz:0} Hz lands in band {band}: [{string.Join(", ", t.Select(x => x.ToString("0.00")))}]");
            // −6 dBFS → 0.90, minus at most the Hann window's 1.4 dB scalloping loss.
            Assert.InRange(t[band], 0.87, 0.905);
            if (band >= 9) // narrower bands are within the Hann window's ±2-bin main lobe of their neighbors
            {
                Assert.True(t[band - 1] < t[band] - 0.3, $"band {band - 1} stays well below ({t[band - 1]:0.00})");
                if (band < 23) Assert.True(t[band + 1] < t[band] - 0.3, $"band {band + 1} stays well below ({t[band + 1]:0.00})");
            }
        }
    }

    [Test]
    public void A_full_scale_sine_reads_0_dbfs_and_overs_clamp_to_1()
    {
        var hz = Rate / 2048.0 * 43; // exactly bin 43 (1007.8 Hz): no scalloping loss
        var t = TargetsOf(Sine(hz, 1.0, 2048));
        Assert.Near(1.0, t[BandOf(hz)], 0.002);
        var (a, _) = Analyzer();
        a.Write(Sine(hz, 4.0, 2048)); // float mixes can exceed full scale
        a.Analyze();
        Assert.Equal(1.0, a.Targets[BandOf(hz)]);
        Assert.Equal(1.0, a.Peak, "peak clamps to 1");
        Assert.Equal(1.0, a.Rms, "rms clamps to 1");
    }

    [Test]
    public void Two_tones_land_in_two_bands()
    {
        double lo = 200, hi = 5000;
        var t = TargetsOf(Mix(Sine(lo, 0.5, 4096), Sine(hi, 0.25, 4096)));
        var bl = BandOf(lo);
        var bh = BandOf(hi);
        var top2 = t.Select((v, i) => (v, i)).OrderByDescending(x => x.v).Take(2).Select(x => x.i).OrderBy(i => i).ToArray();
        Assert.Equal($"{bl},{bh}", string.Join(",", top2), $"[{string.Join(", ", t.Select(x => x.ToString("0.00")))}]");
        Assert.InRange(t[bl], 0.86, 0.905); // −6 dBFS
        Assert.InRange(t[bh], 0.76, 0.805); // −12 dBFS
        for (var i = bl + 2; i <= bh - 2; i++) Assert.True(t[i] < 0.5, $"between the tones, band {i} stays low ({t[i]:0.00})");
    }

    [Test]
    public void White_noise_is_roughly_flat()
    {
        var (a, clock) = Analyzer(Rate, 1);
        var rng = new Random(42);
        var sums = new double[SpectrumBands.Count];
        const int frames = 60;
        var hop = new float[1600];
        for (var f = 0; f < frames + 2; f++)
        {
            for (var i = 0; i < hop.Length; i++) hop[i] = (float)(rng.NextDouble() - 0.5); // uniform ±0.5: −15.6 dBFS RMS
            a.Write(hop);
            clock.Advance(TimeSpan.FromMilliseconds(33));
            a.Analyze();
            if (f < 2) continue; // let the window fill
            for (var b = 0; b < sums.Length; b++) sums[b] += a.Targets[b];
        }
        var mean = sums.Select(s => s / frames).ToArray();
        var median = mean.OrderBy(x => x).ElementAt(mean.Length / 2);
        Console.WriteLine($"     white noise bands: {string.Join(" ", mean.Select(x => x.ToString("0.00")))}");
        Assert.InRange(median, 0.3, 0.5);
        // Each band reads its loudest bin, so the wide top bands sit a few dB above the one-bin bass bands (≈ ±7 dB).
        foreach (var (v, i) in mean.Select((v, i) => (v, i))) Assert.InRange(v, median - 0.13, median + 0.13, $"band {i} = {v:0.00}, median {median:0.00}");
        var lowThird = mean.Take(8).Average();
        var highThird = mean.Skip(16).Average();
        Assert.True(Math.Abs(highThird - lowThird) < 0.2, $"no strong tilt (low {lowThird:0.00}, high {highThird:0.00}); summed band power would tilt ~0.45");
    }

    [Test]
    public void Stereo_mixes_to_mono_and_surround_keeps_stereo_levels()
    {
        var hz = Rate / 2048.0 * 100; // exactly bin 100 (2343.75 Hz)
        var stereo = TargetsOf(Sine(hz, 0.5, 2048, channels: 2));
        var eight = new float[2048 * 8]; // 7.1 endpoint, stereo content in FL/FR only
        var two = Sine(hz, 0.5, 2048, channels: 2);
        for (var f = 0; f < 2048; f++) { eight[f * 8] = two[f * 2]; eight[f * 8 + 1] = two[f * 2 + 1]; }
        var surround = TargetsOf(eight, channels: 8);
        Assert.Near(stereo[BandOf(hz)], surround[BandOf(hz)], 0.001, "Σ channels ÷ 2 keeps the level");
        var lOnly = new float[2048 * 2];
        for (var f = 0; f < 2048; f++) lOnly[f * 2] = two[f * 2];
        Assert.Near(SpectrumBands.DbToLevel(-12.04), TargetsOf(lOnly)[BandOf(hz)], 0.003, "(L+R)/2: one side alone reads 6 dB lower");
    }

    // ---------------------------------------------------------------- dB scale, bands, sizes

    [Test]
    public void Db_mapping_is_linear_from_minus_60_to_0_and_clamps()
    {
        Assert.Equal(0.0, SpectrumBands.DbToLevel(-60));
        Assert.Equal(0.0, SpectrumBands.DbToLevel(-90));
        Assert.Equal(0.0, SpectrumBands.DbToLevel(double.NegativeInfinity));
        Assert.Equal(0.0, SpectrumBands.DbToLevel(double.NaN));
        Assert.Equal(1.0, SpectrumBands.DbToLevel(0));
        Assert.Equal(1.0, SpectrumBands.DbToLevel(6));
        Assert.Near(0.5, SpectrumBands.DbToLevel(-30), 1e-12);
        Assert.Near(0.9, SpectrumBands.DbToLevel(-6), 1e-12);
        Assert.Near(0, SpectrumBands.PowerToDb(1), 1e-12);
        Assert.Near(-6.0206, SpectrumBands.PowerToDb(0.25), 1e-4);
        Assert.Equal(double.NegativeInfinity, SpectrumBands.PowerToDb(0));
        // A −70 dBFS tone is below the floor: its band reads 0.
        var t = TargetsOf(Sine(1000, Math.Pow(10, -70 / 20.0), 4096));
        Assert.Equal(0.0, t.Max());
    }

    [Test]
    public void Band_centers_are_24_log_spaced_from_40_hz_to_16_khz()
    {
        Assert.Equal(24, SpectrumBands.Count);
        Assert.Equal(24, SpectrumBands.Centers.Length);
        Assert.Near(40, SpectrumBands.Center(0), 1e-9);
        Assert.Near(16000, SpectrumBands.Center(23), 1e-6);
        for (var i = 1; i < 24; i++)
        {
            Assert.Near(SpectrumBands.Ratio, SpectrumBands.Center(i) / SpectrumBands.Center(i - 1), 1e-9, "constant ratio");
            Assert.Near(SpectrumBands.UpperEdge(i - 1), SpectrumBands.LowerEdge(i), 1e-6, "edges touch");
            Assert.True(SpectrumBands.Center(i) > SpectrumBands.LowerEdge(i) && SpectrumBands.Center(i) < SpectrumBands.UpperEdge(i));
        }
        Assert.Near(1.2976, SpectrumBands.Ratio, 1e-4);
        var rounded = SpectrumBands.CentersRounded.ToArray();
        Assert.Equal("40,51.9,67.3,87.4,113.4,147.1,190.9,247.7,321.5,417.1,541.2,702.3,911.3,1182.5,1534.3,1990.9,2583.4,3352.1,4349.7,5644,7323.5,9502.9,12330.7,16000",
            string.Join(",", rounded.Select(x => x.ToString(System.Globalization.CultureInfo.InvariantCulture))));
    }

    [Test]
    public void Fft_size_follows_the_mix_rate_and_every_band_is_readable()
    {
        Assert.Equal(2048, SpectrumBands.FftSizeFor(44100));
        Assert.Equal(2048, SpectrumBands.FftSizeFor(48000));
        Assert.Equal(4096, SpectrumBands.FftSizeFor(88200));
        Assert.Equal(4096, SpectrumBands.FftSizeFor(96000));
        Assert.Equal(8192, SpectrumBands.FftSizeFor(192000));
        Assert.Equal(1024, SpectrumBands.FftSizeFor(32000));
        Assert.Equal(512, SpectrumBands.FftSizeFor(16000));
        foreach (var rate in new[] { 44100, 48000, 96000, 192000 })
        {
            var n = SpectrumBands.FftSizeFor(rate);
            var plan = SpectrumBands.Plan(rate, n);
            for (var b = 0; b < SpectrumBands.Count; b++)
            {
                Assert.True(plan.First[b] >= 1, $"{rate} Hz: band {b} has data");
                if (plan.Interpolate[b] < 0) Assert.True(plan.Last[b] >= plan.First[b]);
            }
            // Bins are never shared between two bands.
            for (var b = 1; b < SpectrumBands.Count; b++)
                if (plan.Interpolate[b] < 0 && plan.Interpolate[b - 1] < 0) Assert.True(plan.First[b] > plan.Last[b - 1]);
        }
        // At 48 kHz the lowest bands are narrower than one 23.4 Hz bin and are interpolated at their centers.
        var p48 = SpectrumBands.Plan(48000, 2048);
        Assert.True(p48.Interpolate[0] >= 0 && p48.Interpolate[23] < 0);
        Assert.Equal((int)Math.Ceiling(SpectrumBands.UpperEdge(23) / (48000.0 / 2048)) - 1, p48.Last[23]);
        // At 32 kHz the top band is cut at Nyquist; a 16 kHz rate cannot show it at all.
        Assert.Equal(1024 / 2 - 1, SpectrumBands.Plan(32000, 1024).Last[23]);
        Assert.Equal(0, SpectrumBands.Plan(16000, 512).First[23]);
    }

    [Test]
    public void Other_rates_analyze_correctly()
    {
        foreach (var rate in new[] { 44100, 96000 })
        {
            var hz = SpectrumBands.Center(14);
            var t = TargetsOf(Sine(hz, 0.5, SpectrumBands.FftSizeFor(rate) * 2, rate: rate), rate: rate);
            Assert.Equal(14, ArgMax(t), $"{rate} Hz mix");
            Assert.InRange(t[14], 0.87, 0.905);
        }
    }

    // ---------------------------------------------------------------- smoothing (ManualTimeProvider)

    [Test]
    public void Smoothing_attacks_fast_and_releases_with_a_300_ms_time_constant()
    {
        var (a, clock) = Analyzer();
        var hz = Rate / 2048.0 * 43;
        var band = BandOf(hz);
        a.WriteSilence(4096);
        a.Analyze();
        Assert.Equal(0.0, a.Bands[band]);

        clock.Advance(TimeSpan.FromMilliseconds(33));
        a.Write(Sine(hz, 1.0, 2048));
        a.Analyze();
        var target = a.Targets[band];
        Assert.Near(1.0, target, 0.002);
        Assert.True(a.Bands[band] > 0.95 * target, $"one 33 ms frame reaches > 95% (attack τ 10 ms): {a.Bands[band]:0.000}");

        clock.Advance(TimeSpan.FromMilliseconds(33));
        a.Write(Sine(hz, 1.0, 2048));
        a.Analyze();
        var start = a.Bands[band];
        Assert.Near(target, start, 0.002, "settled");

        // Release: silence from now on, 33 ms frames for 297 ms ≈ one time constant.
        var elapsed = 0;
        while (elapsed < 297)
        {
            clock.Advance(TimeSpan.FromMilliseconds(33));
            elapsed += 33;
            a.WriteSilence(4096);
            a.Analyze();
            Assert.Equal(0.0, a.Targets[band]);
        }
        Assert.Near(start * Math.Exp(-0.297 / 0.3), a.Bands[band], 0.002, "e^(−t/300 ms)");
        Assert.InRange(a.Bands[band], 0.35, 0.39);
        Assert.False(a.Silent, "still falling");

        for (var i = 0; i < 60; i++) // ~2 s more
        {
            clock.Advance(TimeSpan.FromMilliseconds(33));
            a.WriteSilence(1600);
            a.Analyze();
        }
        Assert.Equal(0.0, a.Bands[band], "snapped to 0");
        Assert.True(a.Silent);

        Assert.Near(Math.Exp(-1), SpectrumAnalyzer.Smooth(1, 0, 0.3, 0.01, 0.3), 1e-12);
        Assert.Near(1 - Math.Exp(-3.3), SpectrumAnalyzer.Smooth(0, 1, 0.033, 0.01, 0.3), 1e-12);
        Assert.Equal(0.5, SpectrumAnalyzer.Smooth(0.5, 1, 0, 0.01, 0.3), "no time, no change");
    }

    // ---------------------------------------------------------------- silence

    [Test]
    public void Silent_means_nothing_audible_and_no_packets_time_out_to_silent()
    {
        var (a, clock) = Analyzer();
        a.Analyze();
        Assert.True(a.Silent, "no audio yet");
        Assert.False(a.HasData);

        a.Write(Sine(1000, 0.3, 1600));
        a.Analyze();
        Assert.False(a.Silent);
        Assert.Near(0.3, a.Peak, 0.001);
        Assert.Near(0.3 / Math.Sqrt(2), a.Rms, 0.005);

        // Loopback delivers nothing while nothing plays: after the starve timeout the input counts as silence.
        clock.Advance(TimeSpan.FromMilliseconds(100));
        a.Analyze();
        Assert.Near(0.3, a.Peak, 0.001, "a frame without new packets keeps the last values");
        clock.Advance(SpectrumAnalyzer.StarveTimeout);
        a.Analyze();
        Assert.Equal(0.0, a.Peak);
        Assert.Equal(0.0, a.Rms);
        Assert.Equal(0.0, a.Targets.ToArray().Max());
        Assert.False(a.Silent, "bars still falling");
        for (var i = 0; i < 60; i++)
        {
            clock.Advance(TimeSpan.FromMilliseconds(33));
            a.Analyze();
        }
        Assert.True(a.Silent);
        Assert.Equal(0.0, a.Bands.ToArray().Max());
    }

    [Test]
    public void Silent_packets_and_inaudible_levels_count_as_silent()
    {
        var (a, clock) = Analyzer();
        a.WriteSilence(4800);
        a.Analyze();
        Assert.True(a.Silent, "AUDCLNT_BUFFERFLAGS_SILENT packets");
        Assert.Equal(0L, a.FftCount, "an all-zero window skips the FFT");

        a.Write(Sine(1000, Math.Pow(10, -70 / 20.0), 4096)); // −70 dBFS
        clock.Advance(TimeSpan.FromMilliseconds(33));
        a.Analyze();
        Assert.True(a.Silent, "below −60 dBFS is silent");

        a.Write(Sine(1000, Math.Pow(10, -50 / 20.0), 4096)); // −50 dBFS
        clock.Advance(TimeSpan.FromMilliseconds(33));
        a.Analyze();
        Assert.False(a.Silent, "−50 dBFS is not");
    }

    [Test]
    public void Restart_forgets_the_old_stream_but_lets_the_bars_fall()
    {
        var (a, clock) = Analyzer();
        a.Write(Sine(1000, 0.5, 4096));
        a.Analyze();
        var band = ArgMax(a.Bands);
        var before = a.Bands[band];
        a.Restart();
        Assert.False(a.HasData);
        clock.Advance(TimeSpan.FromMilliseconds(33));
        a.Analyze();
        Assert.Equal(0.0, a.Targets[band]);
        Assert.True(a.Bands[band] > 0 && a.Bands[band] < before, "falling, not cut");
    }

    [Test]
    public void Analysis_allocates_nothing_per_frame()
    {
        var (a, clock) = Analyzer();
        var hop = Sine(440, 0.5, 1600);
        for (var i = 0; i < 5; i++) { a.Write(hop); clock.Advance(TimeSpan.FromMilliseconds(33)); a.Analyze(); }
        long bytes = 0;
        for (var i = 0; i < 300; i++)
        {
            clock.Advance(TimeSpan.FromMilliseconds(33)); // the test clock allocates; only the analyzer is measured
            var before = GC.GetAllocatedBytesForCurrentThread();
            a.Write(hop);
            a.WriteSilence(10);
            a.Analyze();
            bytes += GC.GetAllocatedBytesForCurrentThread() - before;
        }
        Assert.Equal(0L, bytes, "bytes allocated over 300 frames");
        Assert.True(a.FftCount >= 300);
    }

    // ---------------------------------------------------------------- sample formats

    private sealed class Collect : ILoopbackSink
    {
        public List<float> Samples { get; } = [];
        public int Silence;
        public void SetFormat(int sampleRate, int channels) { }
        public void Write(ReadOnlySpan<float> interleaved) => Samples.AddRange(interleaved.ToArray());
        public void WriteSilence(int frames) => Silence += frames;
    }

    [Test]
    public unsafe void Pcm_and_float_packets_convert_to_floats()
    {
        var sink = new Collect();
        var scratch = Array.Empty<float>();
        short[] pcm16 = [0, 16384, -32768, 32767];
        fixed (short* p = pcm16) SampleConverter.Write(sink, (nint)p, 2, new WaveFormat(48000, 2, 16, 4, SampleKind.Pcm16), ref scratch);
        Assert.Equal("0,0.5,-1,0.99997", string.Join(",", sink.Samples.Select(x => Math.Round(x, 5).ToString(System.Globalization.CultureInfo.InvariantCulture))));

        sink.Samples.Clear();
        byte[] pcm24 = [0x00, 0x00, 0x40, 0x00, 0x00, 0xC0]; // +0.5, −0.5
        fixed (byte* p = pcm24) SampleConverter.Write(sink, (nint)p, 2, new WaveFormat(48000, 1, 24, 3, SampleKind.Pcm24), ref scratch);
        Assert.Equal("0.5,-0.5", string.Join(",", sink.Samples.Select(x => x.ToString(System.Globalization.CultureInfo.InvariantCulture))));

        sink.Samples.Clear();
        int[] pcm32 = [int.MinValue, 1 << 30];
        fixed (int* p = pcm32) SampleConverter.Write(sink, (nint)p, 1, new WaveFormat(48000, 2, 32, 8, SampleKind.Pcm32), ref scratch);
        Assert.Equal("-1,0.5", string.Join(",", sink.Samples.Select(x => x.ToString(System.Globalization.CultureInfo.InvariantCulture))));

        sink.Samples.Clear();
        float[] f32 = [0.25f, -0.75f];
        fixed (float* p = f32) SampleConverter.Write(sink, (nint)p, 1, new WaveFormat(48000, 2, 32, 8, SampleKind.Float32), ref scratch);
        Assert.Equal("0.25,-0.75", string.Join(",", sink.Samples.Select(x => x.ToString(System.Globalization.CultureInfo.InvariantCulture))));

        sink.Samples.Clear();
        fixed (float* p = f32) SampleConverter.Write(sink, (nint)p, 1, new WaveFormat(48000, 2, 64, 16, SampleKind.Unsupported), ref scratch);
        Assert.Empty(sink.Samples);

        // A long PCM packet goes through the scratch buffer in whole frames.
        sink.Samples.Clear();
        var big = new short[10_000 * 2];
        for (var i = 0; i < big.Length; i++) big[i] = (short)(i % 2 == 0 ? 8192 : -8192);
        fixed (short* p = big) SampleConverter.Write(sink, (nint)p, 10_000, new WaveFormat(48000, 2, 16, 4, SampleKind.Pcm16), ref scratch);
        Assert.Equal(20_000, sink.Samples.Count);
        Assert.True(sink.Samples.Where((_, i) => i % 2 == 0).All(x => x == 0.25f) && sink.Samples.Where((_, i) => i % 2 == 1).All(x => x == -0.25f), "frames never split");
    }

    [Test]
    public unsafe void Wave_formats_parse_plain_and_extensible()
    {
        var p = Marshal.AllocHGlobal(40);
        try
        {
            var b = (byte*)p;
            new Span<byte>(b, 40).Clear();
            *(ushort*)b = Wasapi.WAVE_FORMAT_EXTENSIBLE;
            *(ushort*)(b + 2) = 2;
            *(uint*)(b + 4) = 48000;
            *(ushort*)(b + 12) = 8;
            *(ushort*)(b + 14) = 32;
            *(ushort*)(b + 16) = 22;
            *(Guid*)(b + 24) = Wasapi.KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
            Assert.Equal(new WaveFormat(48000, 2, 32, 8, SampleKind.Float32), WaveFormat.Parse(p));
            *(Guid*)(b + 24) = Wasapi.KSDATAFORMAT_SUBTYPE_PCM;
            Assert.Equal(SampleKind.Pcm32, WaveFormat.Parse(p).Kind);
            *(ushort*)(b + 14) = 24;
            *(ushort*)(b + 12) = 6;
            Assert.Equal(SampleKind.Pcm24, WaveFormat.Parse(p).Kind);

            new Span<byte>(b, 40).Clear();
            *(ushort*)b = Wasapi.WAVE_FORMAT_PCM;
            *(ushort*)(b + 2) = 1;
            *(uint*)(b + 4) = 44100;
            *(ushort*)(b + 12) = 2;
            *(ushort*)(b + 14) = 16;
            Assert.Equal(new WaveFormat(44100, 1, 16, 2, SampleKind.Pcm16), WaveFormat.Parse(p));
            *(ushort*)(b + 12) = 3; // block align disagrees with channels × bits
            Assert.Equal(SampleKind.Unsupported, WaveFormat.Parse(p).Kind);
            *(ushort*)b = 0x0055; // MP3
            *(ushort*)(b + 12) = 2;
            Assert.Equal(SampleKind.Unsupported, WaveFormat.Parse(p).Kind);
        }
        finally { Marshal.FreeHGlobal(p); }
        Assert.Equal(default, WaveFormat.Parse(0));
    }
}
