namespace PrismControl.Audio.Spectrum;

/// <summary>
/// Turns loopback audio into the 24 smoothed bands of /v1/audio/spectrum.
/// <list type="number">
/// <item><see cref="Write"/> (capture thread) mixes each frame to mono (Σ channels ÷ min(channels, 2), so stereo is
/// (L+R)/2 and stereo content on a 7.1 endpoint keeps its level) into a ring of the last <see cref="FftSize"/>
/// samples, and tracks the frame's peak and RMS over every channel sample.</item>
/// <item><see cref="Analyze"/> (once per published frame, ~30 Hz) applies a periodic Hann window, runs the FFT,
/// reads each band as its loudest bin (calibrated so a full-scale sine reads 0 dBFS), maps dBFS −60…0 → 0…1, and
/// smooths: fast attack (10 ms time constant), 300 ms release time constant.</item>
/// </list>
/// Loopback delivers no packets while nothing plays, so after <see cref="StarveTimeout"/> without any the input
/// counts as silence. An all-zero window skips the FFT. Nothing allocates per frame; only a format change does.
/// Not thread-safe: the writer and the analyzer must take turns (the provider awaits each read before analyzing).
/// </summary>
internal sealed class SpectrumAnalyzer : ILoopbackSink
{
    public static readonly TimeSpan DefaultAttack = TimeSpan.FromMilliseconds(10);
    public static readonly TimeSpan DefaultRelease = TimeSpan.FromMilliseconds(300);
    /// <summary>No packet for this long = nothing is playing.</summary>
    public static readonly TimeSpan StarveTimeout = TimeSpan.FromMilliseconds(150);
    /// <summary><see cref="Silent"/> needs every band below this …</summary>
    public const double SilentLevel = 0.01;
    /// <summary>… and the last frame's peak below −60 dBFS.</summary>
    public const double SilentPeak = 0.001;
    /// <summary>Smoothed levels below this snap to 0.</summary>
    public const double SnapToZero = 0.001;

    private readonly TimeProvider _time;
    private readonly double _attackSec, _releaseSec;
    private readonly double[] _target = new double[SpectrumBands.Count];
    private readonly double[] _level = new double[SpectrumBands.Count];

    private Fft? _fft;
    private BandPlan? _plan;
    private double[] _window = [], _re = [], _im = [];
    private float[] _ring = [];
    private int _ringPos;
    private int _zeroRun;
    private double _powerScale;

    private float _hopPeak;
    private double _hopSumSq;
    private long _hopCount;
    private long _lastWrite, _lastAnalyze;
    private bool _analyzed;

    public SpectrumAnalyzer(TimeProvider? time = null, TimeSpan? attack = null, TimeSpan? release = null)
    {
        _time = time ?? TimeProvider.System;
        _attackSec = (attack ?? DefaultAttack).TotalSeconds;
        _releaseSec = (release ?? DefaultRelease).TotalSeconds;
    }

    public int SampleRate { get; private set; }
    public int Channels { get; private set; }
    public int FftSize => _fft?.Size ?? 0;

    /// <summary>Smoothed band levels 0..1, low to high (valid after <see cref="Analyze"/>).</summary>
    public ReadOnlySpan<double> Bands => _level;

    /// <summary>This frame's unsmoothed band levels 0..1 (what the smoothing moves toward).</summary>
    public ReadOnlySpan<double> Targets => _target;

    /// <summary>Linear 0..1 sample peak of the last frame (every channel sample written since the previous <see cref="Analyze"/>).</summary>
    public double Peak { get; private set; }
    public double Rms { get; private set; }
    public bool Silent { get; private set; } = true;

    /// <summary>Some packet (silent or not) arrived since the last <see cref="Restart"/>.</summary>
    public bool HasData { get; private set; }

    /// <summary>FFTs run (an all-zero window skips it).</summary>
    public long FftCount { get; private set; }

    // ---------------------------------------------------------------- input (capture thread)

    public void SetFormat(int sampleRate, int channels)
    {
        if (sampleRate <= 0 || channels <= 0) throw new ArgumentOutOfRangeException(nameof(sampleRate), "A stream needs a positive rate and channel count.");
        Channels = channels;
        if (sampleRate == SampleRate && _fft is not null) return;
        SampleRate = sampleRate;
        var n = SpectrumBands.FftSizeFor(sampleRate);
        if (_fft?.Size != n)
        {
            _fft = new Fft(n);
            _window = new double[n];
            double sum = 0;
            for (var i = 0; i < n; i++)
            {
                _window[i] = 0.5 * (1 - Math.Cos(2 * Math.PI * i / n)); // periodic Hann
                sum += _window[i];
            }
            // A sine of amplitude A peaks at |X| = A·Σw/2, so this makes its bin read A² (0 dBFS at full scale).
            _powerScale = 4.0 / (sum * sum);
            _re = new double[n];
            _im = new double[n];
            _ring = new float[n];
        }
        _plan = SpectrumBands.Plan(sampleRate, n);
        ClearRing();
    }

    public void Write(ReadOnlySpan<float> interleaved)
    {
        var ch = Channels;
        if (ch <= 0 || _ring.Length == 0) return;
        var frames = interleaved.Length / ch;
        var mix = 1f / Math.Min(ch, 2);
        var ring = _ring;
        var pos = _ringPos;
        var zeroRun = _zeroRun;
        var peak = _hopPeak;
        var sumSq = _hopSumSq;
        for (int f = 0, i = 0; f < frames; f++)
        {
            float sum = 0;
            for (var c = 0; c < ch; c++, i++)
            {
                var s = interleaved[i];
                if (!float.IsFinite(s)) s = 0;
                sum += s;
                var a = Math.Abs(s);
                if (a > peak) peak = a;
                sumSq += (double)s * s;
            }
            var mono = sum * mix;
            ring[pos] = mono;
            if (++pos == ring.Length) pos = 0;
            zeroRun = mono == 0 ? Math.Min(zeroRun + 1, ring.Length) : 0;
        }
        _ringPos = pos;
        _zeroRun = zeroRun;
        _hopPeak = peak;
        _hopSumSq = sumSq;
        _hopCount += (long)frames * ch;
        Touch();
    }

    public void WriteSilence(int frames)
    {
        if (Channels <= 0 || _ring.Length == 0 || frames <= 0) return;
        var n = Math.Min(frames, _ring.Length);
        for (var i = 0; i < n; i++)
        {
            _ring[_ringPos] = 0;
            if (++_ringPos == _ring.Length) _ringPos = 0;
        }
        _zeroRun = Math.Min(_zeroRun + frames, _ring.Length);
        _hopCount += (long)frames * Channels;
        Touch();
    }

    private void Touch()
    {
        _lastWrite = _time.GetTimestamp();
        HasData = true;
    }

    /// <summary>A new stream starts (device change or reopen): forget its audio, keep the smoothed bars falling naturally.</summary>
    public void Restart()
    {
        ClearRing();
        HasData = false;
        _lastWrite = 0;
    }

    private void ClearRing()
    {
        Array.Clear(_ring);
        _ringPos = 0;
        _zeroRun = _ring.Length;
        _hopPeak = 0;
        _hopSumSq = 0;
        _hopCount = 0;
    }

    // ---------------------------------------------------------------- analysis (once per frame)

    /// <summary>Analyzes the latest window and advances the smoothing to now.</summary>
    public void Analyze()
    {
        var now = _time.GetTimestamp();
        var starved = !HasData || _time.GetElapsedTime(_lastWrite, now) >= StarveTimeout;
        if (starved)
        {
            if (_zeroRun < _ring.Length) ClearRing();
            Peak = Rms = 0;
        }
        else if (_hopCount > 0)
        {
            Peak = Math.Min(1, _hopPeak);
            Rms = Math.Min(1, Math.Sqrt(_hopSumSq / _hopCount));
            _hopPeak = 0;
            _hopSumSq = 0;
            _hopCount = 0;
        }

        if (_fft is null || _plan is null || _zeroRun >= _ring.Length) Array.Clear(_target);
        else ComputeTargets();

        var dt = _analyzed ? _time.GetElapsedTime(_lastAnalyze, now).TotalSeconds : 0;
        var max = 0.0;
        for (var i = 0; i < _level.Length; i++)
        {
            _level[i] = _analyzed ? Smooth(_level[i], _target[i], dt, _attackSec, _releaseSec) : _target[i];
            if (_level[i] < SnapToZero) _level[i] = 0;
            max = Math.Max(max, _level[i]);
        }
        _analyzed = true;
        _lastAnalyze = now;
        Silent = max < SilentLevel && Peak < SilentPeak;
    }

    private void ComputeTargets()
    {
        var n = _ring.Length;
        var re = _re;
        var im = _im;
        var w = _window;
        // Oldest sample first: the ring's write position is the oldest.
        for (int i = 0, j = _ringPos; i < n; i++)
        {
            re[i] = _ring[j] * w[i];
            im[i] = 0;
            if (++j == n) j = 0;
        }
        _fft!.Forward(re, im);
        FftCount++;
        var plan = _plan!;
        for (var b = 0; b < SpectrumBands.Count; b++)
        {
            var first = plan.First[b];
            double power;
            if (first == 0) power = 0;
            else if (plan.Interpolate[b] >= 0)
            {
                var f = plan.Interpolate[b];
                power = (1 - f) * BinPower(first) + f * BinPower(first + 1);
            }
            else
            {
                power = 0;
                for (var k = first; k <= plan.Last[b]; k++) power = Math.Max(power, BinPower(k));
            }
            _target[b] = SpectrumBands.DbToLevel(SpectrumBands.PowerToDb(power));
        }
    }

    private double BinPower(int k) => (_re[k] * _re[k] + _im[k] * _im[k]) * _powerScale;

    /// <summary>
    /// One smoothing step over <paramref name="dtSec"/>: toward a higher target with the attack time constant, toward a
    /// lower one with the release time constant (exponential: 63% of the way in one time constant).
    /// </summary>
    public static double Smooth(double level, double target, double dtSec, double attackSec, double releaseSec)
    {
        if (dtSec <= 0) return level;
        var tau = target > level ? attackSec : releaseSec;
        if (tau <= 0) return target;
        return target + (level - target) * Math.Exp(-dtSec / tau);
    }
}
