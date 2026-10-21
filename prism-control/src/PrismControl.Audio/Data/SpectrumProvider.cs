using System.Diagnostics;
using PrismControl.Audio.Spectrum;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;

namespace PrismControl.Audio;

/// <summary>
/// /v1/audio/spectrum (docs/api.md §4.10): 24 smoothed bands of what the default output plays, ~30 Hz, demand-driven.
/// <list type="bullet">
/// <item>Nothing runs until a request (HTTP, or an in-process <see cref="DataTopic.Demand"/> or <see cref="DataTopic.ReadAsync"/>) starts demand. Then the
/// source runs one frame every 33 ms on its capture thread (the audio COM worker): drain the loopback stream of the
/// default render endpoint (console role), analyze, publish. 5 s after the last request
/// (<see cref="DataTopic.DemandWindow"/>) the next frame releases the stream, clears the topic (503 until the next
/// frame) and stops the frames: no timer, thread or COM object is left.</item>
/// <item>It follows default-device changes (checked every frame) and reopens after failures (device removed, audio
/// service restart) with backoff from 250 ms to 10 s.</item>
/// <item>The first frame waits for audio (or <see cref="SpectrumAnalyzer.StarveTimeout"/>), so the first request after
/// idle gets a real frame. Identical frames (silence) are published at most once a second, so pollers get 304s.</item>
/// <item>Privacy: only the band numbers, peak and RMS leave this class; the analyzer keeps ~43 ms of mono samples in
/// memory for the FFT and nothing is stored, recorded, written or sent.</item>
/// </list>
/// </summary>
internal sealed class SpectrumProvider : IAsyncDisposable
{
    public static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(33);
    public static readonly TimeSpan Heartbeat = TimeSpan.FromSeconds(1);
    public static readonly TimeSpan FirstRetry = TimeSpan.FromMilliseconds(250);
    public static readonly TimeSpan MaxRetry = TimeSpan.FromSeconds(10);

    private readonly IAudioEngine _engine;
    private readonly ILoopbackSource _source;
    private readonly DataTopic<AudioSpectrumSnapshot> _topic;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly CancellationToken _shutdown;
    private readonly object _gate = new();
    private DataPublisher<AudioSpectrumSnapshot>? _pub;
    private IDisposable? _frames;            // under _gate
    private Session? _session;               // under _gate; its fields belong to the capture thread
    private TaskCompletionSource _stopped = Completed();
    private bool _disposed;

    // Diagnostics (tests and the CPU probe).
    private long _workTicks, _openTicks, _framesRun, _published, _ffts;
    internal long ReadTicks, AnalyzeTicks, BuildTicks, PublishTicks; // diagnostics breakdown
    private int _opens, _closes, _starts;

    /// <summary>The state of one demand period (one run of frames).</summary>
    private sealed class Session(TimeProvider time)
    {
        public SpectrumAnalyzer Analyzer { get; } = new(time);
        public ILoopbackStream? Stream;
        public long OpenedAt, RetryAt, LastPublishAt;
        public TimeSpan RetryDelay = FirstRetry;
        public string? FailedDevice, WarnedFor;
        public AudioSpectrumSnapshot? Last;
        public bool Ended;
    }

    public SpectrumProvider(IAudioEngine engine, ILoopbackSource source, DataTopic<AudioSpectrumSnapshot> topic, TimeProvider time, ILog log, CancellationToken shutdown)
    {
        _engine = engine;
        _source = source;
        _topic = topic;
        _time = time;
        _log = log;
        _shutdown = shutdown;
    }

    public bool Claimed => _pub is not null;
    /// <summary>Frames are running (a demand period is active).</summary>
    public bool Running { get { lock (_gate) return _frames is not null; } }
    public int StreamsOpened => Volatile.Read(ref _opens);
    public int StreamsClosed => Volatile.Read(ref _closes);
    /// <summary>How many demand periods started frames.</summary>
    public int Starts => Volatile.Read(ref _starts);
    public long FramesAnalyzed => Interlocked.Read(ref _framesRun);
    public long FramesPublished => Interlocked.Read(ref _published);
    public long FftsRun => Interlocked.Read(ref _ffts);
    /// <summary>CPU-side time spent in frames (capture drain + analysis + publish); frames that opened a stream are in <see cref="OpenTime"/>.</summary>
    public TimeSpan WorkTime => Stopwatch.GetElapsedTime(0, Interlocked.Read(ref _workTicks));
    public TimeSpan OpenTime => Stopwatch.GetElapsedTime(0, Interlocked.Read(ref _openTicks));
    /// <summary>Completes when the current demand period (if any) has ended and released everything.</summary>
    public Task Stopped { get { lock (_gate) return _stopped.Task; } }

    public bool Claim()
    {
        _pub = _topic.Claim("audio", Interval);
        if (_pub is null) return false;
        _pub.DemandStarted += (_, _) => Start();
        return true;
    }

    private void Start()
    {
        lock (_gate)
        {
            if (_pub is null || _disposed || _shutdown.IsCancellationRequested || _frames is not null) return;
            _session = new Session(_time);
            _stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            Interlocked.Increment(ref _starts);
            _frames = _source.StartFrames(Interval, Frame);
        }
    }

    /// <summary>One frame, on the capture thread (never two at once).</summary>
    private void Frame()
    {
        Session? s;
        lock (_gate) s = _session;
        if (s is null || s.Ended) return;
        if (!_pub!.IsDemanded || _disposed || _shutdown.IsCancellationRequested)
        {
            End(s);
            return;
        }
        var t0 = Stopwatch.GetTimestamp();
        var opening = false;
        var a = s.Analyzer;
        var id = _engine.IsAvailable ? _engine.GetDefaultId(AudioFlow.Render, AudioRole.Console) : null;
        if (s.Stream is not null && s.Stream.DeviceId != id) Close(s);
        if (s.FailedDevice is not null && s.FailedDevice != id)
        {
            s.FailedDevice = null; // a different device gets a fresh start
            s.RetryDelay = FirstRetry;
            s.RetryAt = 0;
        }
        if (s.Stream is null && id is not null && _time.GetTimestamp() >= s.RetryAt)
        {
            s.Stream = _source.OpenLoopback(id);
            Interlocked.Increment(ref _opens);
            a.Restart();
            s.OpenedAt = _time.GetTimestamp();
            opening = true;
        }
        if (s.Stream is not null)
        {
            var tr = Stopwatch.GetTimestamp();
            var r = s.Stream.Read(a);
            ReadTicks += Stopwatch.GetTimestamp() - tr;
            if (r.Status == LoopbackStatus.Failed)
            {
                Close(s);
                if (s.WarnedFor != id)
                {
                    s.WarnedFor = id;
                    _log.Warn($"Audio spectrum: loopback capture of the default output failed (0x{r.Hr:X8}); retrying.");
                }
                s.FailedDevice = id;
                s.RetryAt = _time.GetTimestamp() + (long)(s.RetryDelay.TotalSeconds * _time.TimestampFrequency);
                s.RetryDelay = TimeSpan.FromTicks(Math.Min(s.RetryDelay.Ticks * 2, MaxRetry.Ticks));
            }
            else if (r.Frames > 0)
            {
                s.RetryDelay = FirstRetry;
                s.WarnedFor = null;
            }
        }
        var ffts = a.FftCount;
        var ta = Stopwatch.GetTimestamp();
        a.Analyze();
        AnalyzeTicks += Stopwatch.GetTimestamp() - ta;
        Interlocked.Add(ref _ffts, a.FftCount - ffts);
        Interlocked.Increment(ref _framesRun);
        // The first frame of a new stream waits for audio (or the starve timeout), so a fresh request sees real bands.
        var warming = s.Stream is not null && !a.HasData && _time.GetElapsedTime(s.OpenedAt) < SpectrumAnalyzer.StarveTimeout;
        if (!warming)
        {
            var tb = Stopwatch.GetTimestamp();
            var now = _time.GetTimestamp();
            int? rate = s.Stream is not null && a.SampleRate > 0 ? a.SampleRate : null;
            var name = id is null ? null : _engine.GetDevice(id)?.FriendlyName;
            // Silence repeats the same frame: compare before building anything, and republish it only once a second.
            var due = s.Last is null || _time.GetElapsedTime(s.LastPublishAt, now) >= Heartbeat || !Unchanged(s.Last, id, name, rate, a);
            var snap = due ? Build(id, name, rate, a) : null;
            BuildTicks += Stopwatch.GetTimestamp() - tb;
            if (snap is not null)
            {
                var tp = Stopwatch.GetTimestamp();
                _pub.Publish(snap);
                PublishTicks += Stopwatch.GetTimestamp() - tp;
                Interlocked.Increment(ref _published);
                s.Last = snap;
                s.LastPublishAt = now;
            }
        }
        Interlocked.Add(ref opening ? ref _openTicks : ref _workTicks, Stopwatch.GetTimestamp() - t0);
    }

    /// <summary>Capture thread: demand is over. Release the stream, clear the topic, stop the frames.</summary>
    private void End(Session s)
    {
        s.Ended = true;
        if (s.Stream is not null) Close(s);
        _pub!.Clear(); // 503 while idle: the next request waits for a fresh frame instead of seeing an old one
        TaskCompletionSource done;
        lock (_gate)
        {
            _frames?.Dispose();
            _frames = null;
            _session = null;
            done = _stopped;
        }
        done.TrySetResult();
        // A request that arrived while this period was ending started nothing (demand was still "on"): start again.
        if (_pub.IsDemanded && !_disposed && !_shutdown.IsCancellationRequested) Start();
    }

    private void Close(Session s)
    {
        s.Stream?.Dispose();
        s.Stream = null;
        Interlocked.Increment(ref _closes);
    }

    private static AudioSpectrumSnapshot Build(string? deviceId, string? deviceName, int? sampleRate, SpectrumAnalyzer a)
    {
        var bands = new List<double>(SpectrumBands.Count);
        foreach (var b in a.Bands) bands.Add(Math.Round(b, 3));
        var hz = new List<double>(SpectrumBands.Count);
        foreach (var c in SpectrumBands.CentersRounded) hz.Add(c);
        return new AudioSpectrumSnapshot
        {
            DeviceId = deviceId,
            DeviceName = deviceName,
            Bands = bands,
            BandHz = hz,
            Peak = Math.Round(a.Peak, 4),
            Rms = Math.Round(a.Rms, 4),
            Silent = a.Silent,
            SampleRate = sampleRate,
        };
    }

    /// <summary>Would <see cref="Build"/> produce exactly <paramref name="last"/> again? (No allocation.)</summary>
    private static bool Unchanged(AudioSpectrumSnapshot last, string? deviceId, string? deviceName, int? sampleRate, SpectrumAnalyzer a)
    {
        if (last.DeviceId != deviceId || last.DeviceName != deviceName || last.SampleRate != sampleRate || last.Silent != a.Silent
            || last.Peak != Math.Round(a.Peak, 4) || last.Rms != Math.Round(a.Rms, 4)) return false;
        var bands = a.Bands;
        for (var i = 0; i < bands.Length; i++) if (last.Bands[i] != Math.Round(bands[i], 3)) return false;
        return true;
    }

    private static TaskCompletionSource Completed()
    {
        var t = new TaskCompletionSource();
        t.SetResult();
        return t;
    }

    /// <summary>Stops the frames and releases the stream (its COM objects are released on the capture thread).</summary>
    public async ValueTask DisposeAsync()
    {
        Task stopped;
        lock (_gate)
        {
            _disposed = true;
            stopped = _stopped.Task;
        }
        // The next frame sees _disposed and ends the period; if frames can no longer run (the worker stopped), end it here.
        try { await stopped.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (TimeoutException)
        {
            Session? s;
            lock (_gate)
            {
                s = _session;
                _frames?.Dispose();
                _frames = null;
                _session = null;
            }
            if (s is not null) s.Stream?.Dispose();
        }
    }
}
