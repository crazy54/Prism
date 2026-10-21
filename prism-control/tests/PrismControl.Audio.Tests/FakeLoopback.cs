using PrismControl.Audio.Spectrum;

namespace PrismControl.Audio.Tests;

/// <summary>
/// A fake loopback capture source for the spectrum provider: per device a synthetic signal (a sine, silent packets, or
/// nothing at all, like real loopback while nothing plays). Every read delivers 33 ms of audio. Frames run on a timer of
/// the given <see cref="TimeProvider"/>, so a <c>ManualTimeProvider</c> drives them deterministically. Counts opens and disposals.
/// </summary>
internal sealed class FakeLoopbackSource(TimeProvider? time = null) : ILoopbackSource
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Signal> _signals = new(StringComparer.Ordinal);
    private readonly List<string> _opened = [];
    private int _disposed, _reads, _failOpens, _drivers;

    private sealed record Signal(double Hz, double Amplitude, int Rate, int Channels, bool Packets, bool SilentFlag, int FailHr);

    /// <summary>The clock frames run on (the system clock by default).</summary>
    public TimeProvider Time { get; set; } = time ?? TimeProvider.System;

    /// <summary>Device ids in the order streams were opened.</summary>
    public IReadOnlyList<string> Opened { get { lock (_gate) return [.. _opened]; } }
    /// <summary>Streams opened and not yet disposed.</summary>
    public int Live { get { lock (_gate) return _opened.Count - _disposed; } }
    public int Reads => Volatile.Read(ref _reads);
    /// <summary>Frame timers running.</summary>
    public int Drivers => Volatile.Read(ref _drivers);

    /// <summary>The device plays a sine at <paramref name="hz"/> (amplitude linear 0..1) in every channel.</summary>
    public void Play(string deviceId, double hz, double amplitude, int rate = 48000, int channels = 2) =>
        Set(deviceId, new Signal(hz, amplitude, rate, channels, Packets: true, SilentFlag: false, FailHr: 0));

    /// <summary>Nothing plays: the stream opens but delivers no packets.</summary>
    public void Idle(string deviceId, int rate = 48000, int channels = 2) =>
        Set(deviceId, new Signal(0, 0, rate, channels, Packets: false, SilentFlag: false, FailHr: 0));

    /// <summary>Packets arrive flagged AUDCLNT_BUFFERFLAGS_SILENT.</summary>
    public void SilentPackets(string deviceId, int rate = 48000, int channels = 2) =>
        Set(deviceId, new Signal(0, 0, rate, channels, Packets: true, SilentFlag: true, FailHr: 0));

    /// <summary>Every read of this device fails (it was unplugged, or the format changed).</summary>
    public void Break(string deviceId, int hr = unchecked((int)0x88890004)) =>
        Set(deviceId, new Signal(0, 0, 48000, 2, Packets: false, SilentFlag: false, FailHr: hr));

    /// <summary>The next <paramref name="n"/> streams fail on their first read.</summary>
    public void FailNextOpens(int n) => Volatile.Write(ref _failOpens, n);

    private void Set(string id, Signal s)
    {
        lock (_gate) _signals[id] = s;
    }

    private Signal? SignalOf(string id)
    {
        lock (_gate) return _signals.GetValueOrDefault(id);
    }

    public ILoopbackStream OpenLoopback(string deviceId)
    {
        lock (_gate) _opened.Add(deviceId);
        return new Stream(this, deviceId);
    }

    public IDisposable StartFrames(TimeSpan interval, Action frame) => new Driver(this, interval, frame);

    /// <summary>Frames on the source's clock; a frame never overlaps the previous one.</summary>
    private sealed class Driver : IDisposable
    {
        private readonly FakeLoopbackSource _owner;
        private readonly Action _frame;
        private readonly ITimer _timer;
        private int _running, _stopped;

        public Driver(FakeLoopbackSource owner, TimeSpan interval, Action frame)
        {
            _owner = owner;
            _frame = frame;
            Interlocked.Increment(ref owner._drivers);
            _timer = owner.Time.CreateTimer(_ => Tick(), null, TimeSpan.Zero, interval);
        }

        private void Tick()
        {
            if (Volatile.Read(ref _stopped) == 1 || Interlocked.Exchange(ref _running, 1) == 1) return;
            try { _frame(); }
            finally { Volatile.Write(ref _running, 0); }
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _stopped, 1) == 1) return;
            _timer.Dispose();
            Interlocked.Decrement(ref _owner._drivers);
        }
    }

    private sealed class Stream(FakeLoopbackSource owner, string deviceId) : ILoopbackStream
    {
        private bool _started, _failed, _disposed;
        private double _phase;
        private float[] _buffer = [];

        public string DeviceId { get; } = deviceId;

        public LoopbackRead Read(ILoopbackSink sink)
        {
            Interlocked.Increment(ref owner._reads);
            if (_disposed || _failed) return LoopbackRead.Fail(unchecked((int)0x800401FD));
            var s = owner.SignalOf(DeviceId) ?? new Signal(0, 0, 48000, 2, false, false, 0);
            if (!_started)
            {
                if (Interlocked.Decrement(ref owner._failOpens) >= 0 || s.FailHr != 0)
                {
                    _failed = true;
                    return LoopbackRead.Fail(s.FailHr != 0 ? s.FailHr : unchecked((int)0x8889000A)); // AUDCLNT_E_DEVICE_IN_USE
                }
                _started = true;
                sink.SetFormat(s.Rate, s.Channels);
            }
            if (s.FailHr != 0)
            {
                _failed = true;
                return LoopbackRead.Fail(s.FailHr);
            }
            if (!s.Packets) return LoopbackRead.Ok(0);
            var frames = s.Rate * 33 / 1000;
            if (s.SilentFlag)
            {
                sink.WriteSilence(frames);
                return LoopbackRead.Ok(frames);
            }
            if (_buffer.Length != frames * s.Channels) _buffer = new float[frames * s.Channels];
            var step = 2 * Math.PI * s.Hz / s.Rate;
            for (var f = 0; f < frames; f++)
            {
                var v = (float)(s.Amplitude * Math.Sin(_phase));
                _phase += step;
                for (var c = 0; c < s.Channels; c++) _buffer[f * s.Channels + c] = v;
            }
            _phase %= 2 * Math.PI;
            sink.Write(_buffer);
            return LoopbackRead.Ok(frames);
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            lock (owner._gate) owner._disposed++;
        }
    }
}
