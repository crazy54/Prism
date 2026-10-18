namespace PrismControl.Audio.Spectrum;

/// <summary>
/// Opens loopback capture ("what the endpoint plays") of render endpoints and runs the analysis frames on the capture
/// thread. The real one is <see cref="AudioEngine"/> (shared-mode WASAPI on its COM worker); tests use a fake.
/// Capture is a read: it never changes a device, a volume, a default or another app's session, so it also runs in
/// safe mode.
/// </summary>
internal interface ILoopbackSource
{
    /// <summary>A stream for <paramref name="deviceId"/>; it opens on its first <see cref="ILoopbackStream.Read"/>.</summary>
    ILoopbackStream OpenLoopback(string deviceId);

    /// <summary>
    /// Calls <paramref name="frame"/> on the capture thread about every <paramref name="interval"/> (the first call right
    /// away), never twice at once, until the returned handle is disposed. Frames that fall behind are skipped, not queued.
    /// </summary>
    IDisposable StartFrames(TimeSpan interval, Action frame);
}

/// <summary>One loopback capture stream. Dispose (any thread) releases every object it holds, on the capture thread.</summary>
internal interface ILoopbackStream : IDisposable
{
    string DeviceId { get; }

    /// <summary>
    /// Capture thread only (inside a <see cref="ILoopbackSource.StartFrames"/> frame): moves every packet captured since
    /// the previous call into <paramref name="sink"/>, opening the stream on the first call. Once a read says
    /// <see cref="LoopbackStatus.Failed"/>, the stream stays failed: dispose it and open a new one.
    /// </summary>
    LoopbackRead Read(ILoopbackSink sink);
}

internal enum LoopbackStatus
{
    /// <summary>The stream is running; <see cref="LoopbackRead.Frames"/> may be 0 (loopback delivers nothing while nothing plays).</summary>
    Ok,
    /// <summary>It could not open or stopped working (device gone, format changed, audio service down). Reopen later.</summary>
    Failed,
}

/// <param name="Frames">Frames delivered by this read (silent packets included).</param>
/// <param name="Hr">The failing HRESULT (0 when Ok).</param>
internal readonly record struct LoopbackRead(LoopbackStatus Status, int Frames, int Hr)
{
    public static LoopbackRead Ok(int frames) => new(LoopbackStatus.Ok, frames, 0);
    public static LoopbackRead Fail(int hr) => new(LoopbackStatus.Failed, 0, hr);
}

/// <summary>
/// Receives captured audio on the capture thread. Only <see cref="SpectrumAnalyzer"/> implements it: it keeps the last
/// ~43 ms of mono samples for the FFT and nothing else; audio is never stored, recorded, written or sent.
/// </summary>
internal interface ILoopbackSink
{
    /// <summary>The stream's format, before its first samples (and again if a new stream has another format).</summary>
    void SetFormat(int sampleRate, int channels);

    /// <summary>Interleaved samples (whole frames), linear −1..1.</summary>
    void Write(ReadOnlySpan<float> interleaved);

    /// <summary>A packet flagged AUDCLNT_BUFFERFLAGS_SILENT: <paramref name="frames"/> frames of zeros.</summary>
    void WriteSilence(int frames);
}
