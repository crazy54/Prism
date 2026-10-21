namespace PrismControl.Audio.Spectrum;

/// <summary>
/// The fixed band layout and level scale of /v1/audio/spectrum (docs/api.md §4.10), as pure functions:
/// <list type="bullet">
/// <item>24 bands, log-spaced: centers from 40 Hz to 16 kHz (each ×1.2976, about 0.38 octave); a band spans the
/// geometric midpoints to its neighbors.</item>
/// <item>Levels are dBFS mapped linearly −60 … 0 → 0 … 1 and clamped. A full-scale sine reads 0 dBFS in its band.</item>
/// <item>The FFT size is the power of two nearest to 2048 × rate / 48 kHz (2048 at 44.1/48 kHz, 4096 at 96 kHz).</item>
/// </list>
/// </summary>
internal static class SpectrumBands
{
    public const int Count = 24;
    public const double LowHz = 40;
    public const double HighHz = 16000;
    public const double FloorDb = -60;

    /// <summary>The ratio between neighboring band centers.</summary>
    public static readonly double Ratio = Math.Pow(HighHz / LowHz, 1.0 / (Count - 1));

    private static readonly double[] s_centers = Enumerable.Range(0, Count).Select(Center).ToArray();
    private static readonly double[] s_rounded = s_centers.Select(c => Math.Round(c, 1)).ToArray();

    /// <summary>Band <paramref name="index"/>'s center in Hz.</summary>
    public static double Center(int index) => LowHz * Math.Pow(HighHz / LowHz, (double)index / (Count - 1));

    public static double LowerEdge(int index) => Center(index) / Math.Sqrt(Ratio);
    public static double UpperEdge(int index) => Center(index) * Math.Sqrt(Ratio);

    /// <summary>Every band center in Hz (exact).</summary>
    public static ReadOnlySpan<double> Centers => s_centers;

    /// <summary>Every band center rounded to 0.1 Hz (what the payload's <c>bandHz</c> carries).</summary>
    public static ReadOnlySpan<double> CentersRounded => s_rounded;

    /// <summary>dBFS → 0..1 (−60 dBFS and below = 0, 0 dBFS and above = 1). NaN and −∞ map to 0.</summary>
    public static double DbToLevel(double db)
    {
        if (double.IsNaN(db) || db <= FloorDb) return 0;
        return db >= 0 ? 1 : (db - FloorDb) / -FloorDb;
    }

    /// <summary>Power (amplitude²) → dBFS; −∞ for zero.</summary>
    public static double PowerToDb(double power) => power > 0 ? 10 * Math.Log10(power) : double.NegativeInfinity;

    /// <summary>The FFT size for a mix rate: ~43 ms of audio, a power of two between 256 and 16384.</summary>
    public static int FftSizeFor(int sampleRate)
    {
        if (sampleRate <= 0) return 2048;
        var exp = (int)Math.Round(Math.Log2(sampleRate * 2048.0 / 48000.0));
        return 1 << Math.Clamp(exp, 8, 14);
    }

    /// <summary>
    /// Which FFT bins feed each band at this rate and size: the bins whose center frequency lies in [lower edge, upper edge).
    /// A band narrower than one bin (the lowest bands) has none and is read by interpolating at its center instead.
    /// Bands above Nyquist stay at 0.
    /// </summary>
    public static BandPlan Plan(int sampleRate, int fftSize)
    {
        var df = (double)sampleRate / fftSize;
        var maxBin = fftSize / 2 - 1; // leave out DC and Nyquist
        var plan = new BandPlan(new int[Count], new int[Count], new double[Count]);
        for (var i = 0; i < Count; i++)
        {
            var lo = (int)Math.Ceiling(LowerEdge(i) / df);
            var hi = (int)Math.Ceiling(UpperEdge(i) / df) - 1;
            lo = Math.Max(lo, 1);
            hi = Math.Min(hi, maxBin);
            if (lo <= hi)
            {
                plan.First[i] = lo;
                plan.Last[i] = hi;
                plan.Interpolate[i] = -1;
                continue;
            }
            var x = Center(i) / df;
            if (x >= maxBin)
            {
                plan.First[i] = plan.Last[i] = 0; // above Nyquist: nothing to read
                plan.Interpolate[i] = -1;
                continue;
            }
            var k = Math.Max(1, (int)Math.Floor(x));
            plan.First[i] = plan.Last[i] = k;
            plan.Interpolate[i] = Math.Max(0, x - k);
        }
        return plan;
    }
}

/// <summary>
/// Per band: <see cref="First"/>..<see cref="Last"/> (inclusive) bins, read as the loudest bin in the band; or, when
/// <see cref="Interpolate"/> is ≥ 0, the power between bins First and First+1 at that fraction. First = 0 means no data.
/// </summary>
internal sealed record BandPlan(int[] First, int[] Last, double[] Interpolate);
