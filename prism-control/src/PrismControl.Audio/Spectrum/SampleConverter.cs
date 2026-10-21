using PrismControl.Audio.Interop;

namespace PrismControl.Audio.Spectrum;

/// <summary>
/// Hands a captured packet to a sink as float samples. 32-bit float (what shared-mode mix formats use) passes straight
/// through without a copy; 16/24/32-bit PCM is converted through a reusable scratch buffer, in whole frames.
/// </summary>
internal static class SampleConverter
{
    public static unsafe void Write(ILoopbackSink sink, nint data, int frames, in WaveFormat format, ref float[] scratch)
    {
        if (data == 0 || frames <= 0 || format.Channels <= 0) return;
        var channels = format.Channels;
        if (format.Kind == SampleKind.Float32)
        {
            sink.Write(new ReadOnlySpan<float>((void*)data, frames * channels));
            return;
        }
        if (format.Kind == SampleKind.Unsupported) return;
        var want = Math.Max(4096, channels * 256);
        if (scratch.Length < want) scratch = new float[want];
        var chunk = scratch.Length / channels;
        var src = (byte*)data;
        for (var done = 0; done < frames; done += chunk)
        {
            var n = Math.Min(chunk, frames - done);
            var dst = scratch.AsSpan(0, n * channels);
            Convert(src + (long)done * format.BlockAlign, dst, format.Kind);
            sink.Write(dst);
        }
    }

    private static unsafe void Convert(byte* p, Span<float> dst, SampleKind kind)
    {
        switch (kind)
        {
            case SampleKind.Pcm16:
                for (var i = 0; i < dst.Length; i++, p += 2) dst[i] = *(short*)p / 32768f;
                break;
            case SampleKind.Pcm24:
                for (var i = 0; i < dst.Length; i++, p += 3) dst[i] = (p[0] | (p[1] << 8) | ((sbyte)p[2] << 16)) / 8388608f;
                break;
            case SampleKind.Pcm32:
                for (var i = 0; i < dst.Length; i++, p += 4) dst[i] = (float)(*(int*)p / 2147483648.0);
                break;
        }
    }
}
