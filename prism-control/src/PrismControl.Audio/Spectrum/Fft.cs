namespace PrismControl.Audio.Spectrum;

/// <summary>
/// An in-place iterative radix-2 complex FFT (forward, unnormalized: X[k] = Σ x[n]·e^(−2πikn/N)).
/// The bit-reversal table and twiddles are computed once per size; <see cref="Forward"/> allocates nothing.
/// </summary>
internal sealed class Fft
{
    private readonly int[] _reverse;
    private readonly double[] _cos;
    private readonly double[] _sin;

    public Fft(int size)
    {
        if (size < 2 || (size & (size - 1)) != 0) throw new ArgumentOutOfRangeException(nameof(size), size, "The FFT size must be a power of two.");
        Size = size;
        var bits = System.Numerics.BitOperations.Log2((uint)size);
        _reverse = new int[size];
        for (var i = 0; i < size; i++)
        {
            int r = 0, x = i;
            for (var b = 0; b < bits; b++, x >>= 1) r = (r << 1) | (x & 1);
            _reverse[i] = r;
        }
        _cos = new double[size / 2];
        _sin = new double[size / 2];
        for (var k = 0; k < size / 2; k++)
        {
            var a = 2 * Math.PI * k / size;
            _cos[k] = Math.Cos(a);
            _sin[k] = -Math.Sin(a); // e^(-iθ)
        }
    }

    public int Size { get; }

    /// <summary>Transforms <paramref name="re"/> + i·<paramref name="im"/> in place (both of length <see cref="Size"/>).</summary>
    public void Forward(double[] re, double[] im)
    {
        var n = Size;
        if (re.Length != n || im.Length != n) throw new ArgumentException("Buffers must match the FFT size.");
        for (var i = 0; i < n; i++)
        {
            var j = _reverse[i];
            if (j <= i) continue;
            (re[i], re[j]) = (re[j], re[i]);
            (im[i], im[j]) = (im[j], im[i]);
        }
        for (var len = 2; len <= n; len <<= 1)
        {
            var half = len >> 1;
            var step = n / len;
            for (var start = 0; start < n; start += len)
            {
                for (int k = 0, t = 0; k < half; k++, t += step)
                {
                    var wr = _cos[t];
                    var wi = _sin[t];
                    var a = start + k;
                    var b = a + half;
                    var tr = re[b] * wr - im[b] * wi;
                    var ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
        }
    }
}
