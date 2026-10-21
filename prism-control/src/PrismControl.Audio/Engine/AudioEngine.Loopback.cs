using System.Runtime.InteropServices;
using PrismControl.Audio.Interop;
using PrismControl.Audio.Spectrum;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// Loopback capture for the spectrum (/v1/audio/spectrum): a shared-mode <see cref="IAudioClient"/> with
/// AUDCLNT_STREAMFLAGS_LOOPBACK on a render endpoint, read by polling <see cref="IAudioCaptureClient"/>.
/// <list type="bullet">
/// <item>Everything runs on the engine's worker, like the rest of the engine: a timer posts one frame to it every
/// ~33 ms, and the frame drains every ready packet into the analyzer, analyzes and publishes. No thread-pool hops, so a
/// frame costs one wake-up of the worker. Nothing is buffered here and nothing is ever written anywhere.</item>
/// <item>Read-only toward the PC: our own stream in the mix format, no volume/mute/default/format change. Before the
/// stream starts, its session opts out of Windows' communications ducking, so capturing from the default
/// communications device never turns other apps down.</item>
/// <item>Released deterministically: Dispose stops the stream and releases the client and the capture client on the
/// worker; teardown (audio-service restart, shutdown) and endpoint removal close every open stream first.</item>
/// <item>Errors: AUDCLNT_E_DEVICE_INVALIDATED marks the endpoint for a rescan; a service-down HRESULT starts the
/// engine's recovery. Either way the stream reports <see cref="LoopbackStatus.Failed"/> and the caller reopens.</item>
/// </list>
/// </summary>
public sealed partial class AudioEngine : ILoopbackSource
{
    /// <summary>The shared-mode buffer we ask for; the analyzer drains it every ~33 ms.</summary>
    internal static readonly TimeSpan LoopbackBuffer = TimeSpan.FromMilliseconds(200);

    /// <summary>A read never loops forever on a misbehaving driver.</summary>
    private const int MaxPacketsPerRead = 256;

    private const int AUDCLNT_E_UNSUPPORTED_FORMAT = unchecked((int)0x88890008);

    private readonly List<LoopbackStream> _loopbacks = []; // worker only
    private readonly HashSet<FrameDriver> _drivers = [];    // under _gate
    private int _loopbacksOpen, _framesSkipped;

    /// <summary>Times the frame driver started over after a stall (a frame over two intervals late).</summary>
    internal int FramesSkipped => Volatile.Read(ref _framesSkipped);

    /// <summary>Loopback streams holding live COM objects right now (0 while nobody reads the spectrum).</summary>
    internal int OpenLoopbacks => Volatile.Read(ref _loopbacksOpen);

    /// <summary>Frame timers running right now (0 while nobody reads the spectrum).</summary>
    internal int FrameDrivers { get { lock (_gate) return _drivers.Count; } }

    ILoopbackStream ILoopbackSource.OpenLoopback(string deviceId) => new LoopbackStream(this, deviceId);

    IDisposable ILoopbackSource.StartFrames(TimeSpan interval, Action frame) => new FrameDriver(this, interval, frame);

    /// <summary>Shutdown: no frame timer outlives the engine.</summary>
    private void StopFrameDrivers()
    {
        FrameDriver[] all;
        lock (_gate) all = [.. _drivers];
        foreach (var d in all) d.Dispose();
    }

    /// <summary>Tests: run <paramref name="work"/> on the worker (where loopback streams are read).</summary>
    internal Task<T> RunOnWorkerAsync<T>(Func<T> work) => _worker.InvokeAsync(work);

    /// <summary>Diagnostics: the worker's native thread id.</summary>
    internal Task<int> WorkerThreadIdAsync() => _worker.InvokeAsync(() => (int)GetCurrentThreadId());

    [LibraryImport("kernel32.dll")]
    private static partial uint GetCurrentThreadId();

    /// <summary>Closes the open streams of one endpoint (null = all) and fails them with <paramref name="hr"/>. Worker only.</summary>
    private void CloseLoopbacks(string? deviceId, int hr)
    {
        foreach (var l in _loopbacks.Where(l => deviceId is null || l.DeviceId == deviceId).ToList()) l.Abort(hr);
    }

    /// <summary>
    /// Posts one frame at a time to the worker on a deadline schedule (frame n is due at start + n × interval). A plugin
    /// process has the default 15.6 ms timer granularity, so a plain 33 ms periodic timer would fire every 46.9 ms
    /// (21 fps); aiming each one-shot timer at the next deadline averages the real interval. After a real stall it starts
    /// over rather than bursting frames.
    /// </summary>
    private sealed class FrameDriver : IDisposable
    {
        private readonly AudioEngine _engine;
        private readonly Action _frame;
        private readonly Action _run;
        private readonly Timer _timer;
        private readonly long _interval; // Stopwatch ticks
        private long _deadline;
        private int _stopped;

        public FrameDriver(AudioEngine engine, TimeSpan interval, Action frame)
        {
            _engine = engine;
            _frame = frame;
            _run = Run;
            _interval = Math.Max(1, (long)(interval.TotalSeconds * System.Diagnostics.Stopwatch.Frequency));
            _timer = new Timer(static s => ((FrameDriver)s!).Queue(), this, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            bool start;
            lock (engine._gate)
            {
                start = !engine._disposed;
                if (start) engine._drivers.Add(this);
            }
            _deadline = System.Diagnostics.Stopwatch.GetTimestamp();
            if (start) _timer.Change(TimeSpan.Zero, Timeout.InfiniteTimeSpan);
            else Dispose(); // the engine is shutting down: no frames
        }

        private void Queue()
        {
            if (Volatile.Read(ref _stopped) == 1) return;
            if (!_engine._worker.Post(_run)) Dispose();
        }

        private void Run()
        {
            if (Volatile.Read(ref _stopped) == 1) return;
            try { _frame(); }
            catch (Exception ex) { _engine._log.Warn("audio spectrum frame failed", ex); }
            var now = System.Diagnostics.Stopwatch.GetTimestamp();
            _deadline += _interval;
            if (_deadline < now - _interval)
            {
                _deadline = now; // a real stall (over two intervals late): start over instead of bursting
                Interlocked.Increment(ref _engine._framesSkipped);
            }
            if (Volatile.Read(ref _stopped) == 1) return;
            // Timer lateness here is two 15.6 ms roundings (TickCount64 and the native wait), so a frame can be up to an
            // interval late without any stall; the next one then runs at once and the average stays on schedule.
            var due = _deadline > now ? System.Diagnostics.Stopwatch.GetElapsedTime(now, _deadline) : TimeSpan.Zero;
            try { _timer.Change(due, Timeout.InfiniteTimeSpan); }
            catch (ObjectDisposedException) { }
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _stopped, 1) == 1) return;
            _timer.Dispose();
            lock (_engine._gate) _engine._drivers.Remove(this);
        }
    }

    private sealed class LoopbackStream(AudioEngine engine, string deviceId) : ILoopbackStream
    {
        private IAudioClient? _client;
        private IAudioCaptureClient? _capture;
        private WaveFormat _format;
        private float[] _scratch = [];
        private int _failedHr;
        private bool _open;
        private int _disposed;

        public string DeviceId { get; } = deviceId;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
            if (engine._worker.IsCurrentThread) Close();
            else engine._worker.Post(Close); // if the worker has already stopped, teardown has closed this stream
        }

        /// <summary>Worker: open on first use, then drain every ready packet into the sink.</summary>
        public LoopbackRead Read(ILoopbackSink sink)
        {
            if (!engine._worker.IsCurrentThread) throw new InvalidOperationException("Loopback streams are read on the audio worker (inside a StartFrames frame).");
            if (_failedHr != 0) return LoopbackRead.Fail(_failedHr);
            if (Volatile.Read(ref _disposed) == 1) return LoopbackRead.Fail(HResults.CO_E_OBJNOTCONNECTED);
            if (engine._disposed || engine._recovering || !engine._available) return Fail(HResults.CO_E_OBJNOTCONNECTED);
            if (_capture is null)
            {
                var hr = Open(sink);
                if (hr < 0) return Fail(hr, "IAudioClient (loopback)");
            }
            var capture = _capture!;
            var frames = 0;
            // GetBuffer itself says AUDCLNT_S_BUFFER_EMPTY when nothing is ready: one COM call per packet plus one, no
            // GetNextPacketSize round trip (while nothing plays, a frame costs exactly one call).
            for (var i = 0; i < MaxPacketsPerRead; i++)
            {
                var hr = capture.GetBuffer(out var data, out var n, out var flags, out _, out _);
                if (hr == Wasapi.AUDCLNT_S_BUFFER_EMPTY) break;
                if (hr < 0) return Fail(hr, "IAudioCaptureClient::GetBuffer");
                try
                {
                    if ((flags & Wasapi.AUDCLNT_BUFFERFLAGS_SILENT) != 0 || data == 0) sink.WriteSilence((int)n);
                    else SampleConverter.Write(sink, data, (int)n, _format, ref _scratch);
                }
                finally { hr = capture.ReleaseBuffer(n); }
                if (hr < 0) return Fail(hr, "IAudioCaptureClient::ReleaseBuffer");
                frames += (int)n;
            }
            return LoopbackRead.Ok(frames);
        }

        private int Open(ILoopbackSink sink)
        {
            if (!engine._endpoints.TryGetValue(DeviceId, out var ep)) return HResults.E_NOTFOUND;
            if (ep.Flow != AudioFlow.Render) return unchecked((int)0x80070057); // E_INVALIDARG: loopback needs an output
            var hr = ep.Device.Activate(Wasapi.IID_IAudioClient, Native.CLSCTX_ALL, 0, out var pc);
            if (hr < 0 || pc == 0)
            {
                if (pc != 0) Marshal.Release(pc);
                return hr < 0 ? hr : HResults.E_NOTFOUND;
            }
            _client = Native.Wrap<IAudioClient>(pc);
            hr = _client.GetMixFormat(out var pwfx);
            if (hr < 0 || pwfx == 0) return hr < 0 ? hr : AUDCLNT_E_UNSUPPORTED_FORMAT;
            try
            {
                _format = WaveFormat.Parse(pwfx);
                if (_format.Kind == SampleKind.Unsupported) return AUDCLNT_E_UNSUPPORTED_FORMAT;
                // REFERENCE_TIME is in 100 ns units, the same as TimeSpan ticks.
                hr = _client.Initialize(Wasapi.AUDCLNT_SHAREMODE_SHARED, Wasapi.AUDCLNT_STREAMFLAGS_LOOPBACK, LoopbackBuffer.Ticks, 0, pwfx, 0);
            }
            finally { Marshal.FreeCoTaskMem(pwfx); }
            if (hr < 0) return hr;
            hr = _client.GetService(Wasapi.IID_IAudioCaptureClient, out var pcap);
            if (hr < 0 || pcap == 0)
            {
                if (pcap != 0) Marshal.Release(pcap);
                return hr < 0 ? hr : HResults.E_NOTFOUND;
            }
            _capture = Native.Wrap<IAudioCaptureClient>(pcap);
            OptOutOfDucking();
            sink.SetFormat(_format.SampleRate, _format.Channels);
            engine._loopbacks.Add(this);
            _open = true;
            Interlocked.Increment(ref engine._loopbacksOpen);
            hr = _client.Start();
            return hr < 0 ? hr : 0;
        }

        /// <summary>
        /// Our stream's own session opts out of the default communications ducking ("reduce other sounds by 80%"), so
        /// opening it on the default communications output can never turn other apps down. Best effort; it touches
        /// only this plugin's session, never a device or another app.
        /// </summary>
        private void OptOutOfDucking()
        {
            try
            {
                var hr = _client!.GetService(Wasapi.IID_IAudioSessionControl, out var ps);
                using var session = Native.Own<IAudioSessionControl2>(hr, ps);
                session.Value?.SetDuckingPreference(1);
            }
            catch (Exception ex) { engine._log.Debug($"loopback ducking opt-out: {ex.Message}"); }
        }

        private LoopbackRead Fail(int hr, string? what = null)
        {
            if (hr == HResults.AUDCLNT_E_DEVICE_INVALIDATED && engine._endpoints.TryGetValue(DeviceId, out var ep)) engine.MarkStale(ep);
            else if (what is not null) engine.CheckHr(hr, what);
            Abort(hr);
            return LoopbackRead.Fail(hr);
        }

        /// <summary>Worker: release everything; later reads report <paramref name="hr"/>.</summary>
        public void Abort(int hr)
        {
            if (_failedHr == 0) _failedHr = hr;
            Close();
        }

        /// <summary>Worker: stop, then release the capture client and the client (idempotent).</summary>
        private void Close()
        {
            if (_client is not null && _open)
            {
                try { _client.Stop(); }
                catch (Exception ex) { engine._log.Debug($"loopback Stop: {ex.Message}"); }
            }
            Native.Release(_capture);
            Native.Release(_client);
            _capture = null;
            _client = null;
            engine._loopbacks.Remove(this);
            if (_open)
            {
                _open = false;
                Interlocked.Decrement(ref engine._loopbacksOpen);
            }
            if (_failedHr == 0) _failedHr = HResults.CO_E_OBJNOTCONNECTED;
        }
    }
}
