using System.Diagnostics;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.CpuTemp;
using PrismControl.SystemInfo.Sources;

namespace PrismControl.SystemInfo.Telemetry;

/// <summary>Per-tick cost bookkeeping (wall time of the synchronous sampling work).</summary>
public sealed record TelemetryCost(long Ticks, double LastUs, double AverageUs, double MaxUs, string LastBreakdown);

/// <summary>
/// The ONE sampler for the whole plugin (research §2.8). It reads only what at least one consumer needs (a visible
/// action's lease, or the data API while it is polled), at 1 Hz (2 Hz while a fast view is shown), and sleeps
/// otherwise. Thread-safe: the loop writes immutable frames; actions read <see cref="Latest"/> from their mailboxes.
/// </summary>
public sealed class TelemetryService : ITelemetry, IAsyncDisposable
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(1);
    public static readonly TimeSpan FastInterval = TimeSpan.FromMilliseconds(500);
    /// <summary>After a pause, rate counters are primed and read again this much later (instead of averaging over the pause).</summary>
    public static readonly TimeSpan PrimeWindow = TimeSpan.FromMilliseconds(250);
    public static readonly TimeSpan DriveRefresh = TimeSpan.FromSeconds(30);

    private readonly TelemetrySources _sources;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly HashSet<Lease> _leases = [];
    private readonly object _gate = new();
    private DataPublisher<SystemSnapshot>? _publisher;
    private EventHandler? _onDemand;
    private TelemetryFrame? _latest;
    private long _seq;
    private long? _lastTick, _cpuDiskAt, _netAt, _gpuEngAt;
    private TelemetryNeeds _lastNeeds;
    private TaskCompletionSource _wake = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private TaskCompletionSource<TelemetryFrame> _next = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private bool _resetRequested;
    private long _costTicks;
    private double _costLast, _costSum, _costMax;
    private string _breakdown = "";
    private int _errorsLogged;

    public TelemetryService(TelemetrySources sources, TimeProvider time, ILog log)
    {
        _sources = sources;
        _time = time;
        _log = log;
    }

    /// <summary>
    /// The real sources (PDH, GlobalMemoryStatusEx, IP Helper, DriveInfo, NVML, D3DKMT, LHM/HWiNFO). Nothing heavy runs
    /// until the first tick. <paramref name="services"/> lets the CPU temperature fall back to another module's shared
    /// reading (Cooling: iCUE's CPU package sensor) when LibreHardwareMonitor and HWiNFO have none.
    /// </summary>
    public static TelemetryService CreateDefault(ILog log, TimeProvider time, MemorySampler memory, IServiceRegistry? services = null)
    {
        var temp = new CpuTempMonitor(new LhmHttpEndpoint(), new HwInfoSharedMemory(), time, log.For("cputemp"), services);
        var sources = new TelemetrySources(new PdhCpuDiskSource(log), memory, new IpHelperNetworkSource(log), new DriveInfoSource(log, time), new GpuSource(log), temp);
        return new TelemetryService(sources, time, log);
    }

    public TelemetryFrame? Latest => Volatile.Read(ref _latest);
    public TelemetryHistory History { get; } = new(120);
    public CpuTempStatus CpuTemp => _sources.CpuTemp.Status;
    public CpuTempSource CpuTempSource => (_sources.CpuTemp as CpuTempMonitor)?.Source ?? CpuTempSource.Auto;
    public int LhmPort => (_sources.CpuTemp as CpuTempMonitor)?.Port ?? 8085;

    public TelemetryCost Cost
    {
        get
        {
            lock (_gate) return new TelemetryCost(_costTicks, _costLast, _costTicks > 0 ? _costSum / _costTicks : 0, _costMax, _breakdown);
        }
    }

    /// <summary>The union of every lease plus the data API's needs while it is polled.</summary>
    public TelemetryNeeds CurrentNeeds
    {
        get
        {
            var n = TelemetryNeeds.None;
            lock (_gate)
                foreach (var l in _leases) n |= l.Needs;
            if (_publisher?.IsDemanded == true) n |= TelemetryNeeds.Api;
            return n;
        }
    }

    public ITelemetryLease Acquire(TelemetryNeeds needs)
    {
        var lease = new Lease(this, needs);
        lock (_gate) _leases.Add(lease);
        Wake();
        return lease;
    }

    public void ConfigureCpuTemp(CpuTempSource source, int lhmPort) => _sources.CpuTemp.Configure(source, lhmPort);

    /// <summary>Publishes /v1/system while the data API polls it.</summary>
    public void AttachPublisher(DataPublisher<SystemSnapshot>? publisher)
    {
        if (_publisher is not null && _onDemand is not null) _publisher.DemandStarted -= _onDemand;
        _publisher = publisher;
        _onDemand = publisher is null ? null : (_, _) => OnDemandStarted();
        if (publisher is not null) publisher.DemandStarted += _onDemand;
    }

    /// <summary>After a sleep/wake: re-pick adapters and GPUs, restart rate counters, look for a temperature provider again.</summary>
    public void OnSystemWake()
    {
        lock (_gate) _resetRequested = true;
        _sources.CpuTemp.Redetect();
        Wake();
    }

    public async Task<TelemetryFrame?> NextFrameAsync(TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        Task<TelemetryFrame> next;
        lock (_gate) next = _next.Task;
        Wake();
        try { return await next.WaitAsync(timeout, _time, cancellationToken).ConfigureAwait(false); }
        catch (TimeoutException) { return Latest; }
    }

    public void Start(CancellationToken shutdown)
    {
        if (_loop is not null) return;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
        (_sources.CpuTemp as CpuTempMonitor)?.Start(_cts.Token);
        var ct = _cts.Token;
        _loop = Task.Factory.StartNew(() => RunAsync(ct), ct, TaskCreationOptions.LongRunning, TaskScheduler.Default).Unwrap();
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                // Capture the wake signal BEFORE reading the needs: a lease taken after this line completes the captured
                // task, so the wait below returns at once instead of sleeping through it (review B #7, lost wake-up).
                var wake = WakeSignal();
                var needs = CurrentNeeds;
                _sources.CpuTemp.SetWanted(needs.HasFlag(TelemetryNeeds.CpuTemp));
                if ((needs & ~TelemetryNeeds.Fast) == TelemetryNeeds.None)
                {
                    await wake.WaitAsync(ct).ConfigureAwait(false);
                    continue;
                }
                var interval = needs.HasFlag(TelemetryNeeds.Fast) ? FastInterval : Interval;
                var stale = StaleNeeds(needs, interval);
                if (stale != TelemetryNeeds.None)
                {
                    Prime(stale);
                    await Task.Delay(PrimeWindow, _time, ct).ConfigureAwait(false);
                    needs = CurrentNeeds;
                }
                SampleNow(needs);
                await WaitForWakeAsync(interval, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                if (_errorsLogged++ < 5) _log.Error("Telemetry tick failed", ex);
                try { await Task.Delay(Interval, _time, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    /// <summary>
    /// The rate sources (PDH CPU/disk, network byte counters, PDH GPU engines) that have not been read recently enough to
    /// diff against: the first tick, after a pause, or when a consumer newly needs them. Those are primed first, so a
    /// value never averages over an idle hour.
    /// </summary>
    internal TelemetryNeeds StaleNeeds(TelemetryNeeds needs, TimeSpan interval)
    {
        lock (_gate)
        {
            if (_resetRequested) return needs;
            var limit = interval * 2.5;
            bool Old(long? at) => at is not { } t || _time.GetElapsedTime(t) > limit;
            var stale = TelemetryNeeds.None;
            const TelemetryNeeds pdh = TelemetryNeeds.Cpu | TelemetryNeeds.PerCore | TelemetryNeeds.Disk;
            if ((needs & pdh) != 0 && (Old(_cpuDiskAt) || (needs.HasFlag(TelemetryNeeds.PerCore) && !_lastNeeds.HasFlag(TelemetryNeeds.PerCore))))
                stale |= needs & pdh;
            if (needs.HasFlag(TelemetryNeeds.Network) && Old(_netAt)) stale |= TelemetryNeeds.Network;
            if (needs.HasFlag(TelemetryNeeds.GpuEngines) && Old(_gpuEngAt)) stale |= TelemetryNeeds.Gpu | TelemetryNeeds.GpuEngines;
            return stale;
        }
    }

    /// <summary>Starts every rate counter (PDH, network bytes, GPU engines) so the next read covers a short, current window.</summary>
    public void Prime(TelemetryNeeds needs)
    {
        bool reset;
        lock (_gate)
        {
            reset = _resetRequested;
            _resetRequested = false;
        }
        if (reset) Safe("gpu reset", () => _sources.Gpu.Reset());
        bool paused;
        lock (_gate) paused = _lastTick is { } last && _time.GetElapsedTime(last) > Interval * 3;
        if (paused) History.MarkGap();
        if ((needs & (TelemetryNeeds.Cpu | TelemetryNeeds.Disk | TelemetryNeeds.PerCore)) != 0)
            Safe("cpu/disk prime", () => _sources.CpuDisk.Prime(needs.HasFlag(TelemetryNeeds.PerCore)));
        if (needs.HasFlag(TelemetryNeeds.Network)) Safe("network prime", () => _sources.Network.Prime());
        if (needs.HasFlag(TelemetryNeeds.Gpu)) Safe("gpu prime", () => _sources.Gpu.Prime(needs.HasFlag(TelemetryNeeds.GpuEngines)));
        if (needs.HasFlag(TelemetryNeeds.Disk)) _sources.Drives.RefreshIfOlderThan(DriveRefresh);
    }

    /// <summary>One tick: reads what <paramref name="needs"/> asks for, records history, publishes. Called by the loop (and by tests).</summary>
    public TelemetryFrame SampleNow(TelemetryNeeds needs)
    {
        var started = Stopwatch.GetTimestamp();
        CpuFrame? cpu = null;
        DiskTotals? diskTotal = null;
        IReadOnlyList<DiskFrame> disks = [];
        IReadOnlyList<GpuFrame> gpus = [];
        MemoryFrame? memory = null;
        NetworkFrame? network = null;

        if ((needs & (TelemetryNeeds.Cpu | TelemetryNeeds.PerCore | TelemetryNeeds.Disk)) != 0)
        {
            var r = Safe("cpu/disk", () => _sources.CpuDisk.Collect(needs.HasFlag(TelemetryNeeds.PerCore)));
            if (r is not null && (needs & (TelemetryNeeds.Cpu | TelemetryNeeds.PerCore)) != 0)
            {
                var info = _sources.CpuDisk.Info;
                var temp = needs.HasFlag(TelemetryNeeds.CpuTemp) ? _sources.CpuTemp.Current : null;
                cpu = new CpuFrame
                {
                    Name = info.Name,
                    Cores = info.Cores,
                    Threads = info.Threads,
                    UsagePct = r.UsagePct,
                    ClockMhz = r.ClockMhz,
                    PerCorePct = needs.HasFlag(TelemetryNeeds.PerCore) ? r.PerCorePct : null,
                    TempC = temp?.TempC,
                    TempSource = temp?.Provider,
                };
            }
            if (r is not null && needs.HasFlag(TelemetryNeeds.Disk))
            {
                diskTotal = r.DiskTotal;
                _sources.Drives.RefreshIfOlderThan(DriveRefresh);
                disks = MergeDisks(_sources.Drives.Current, r.Volumes);
            }
        }
        var tPdh = Stopwatch.GetTimestamp();
        if (needs.HasFlag(TelemetryNeeds.Memory)) memory = Safe("memory", () => _sources.Memory.Read());
        if (needs.HasFlag(TelemetryNeeds.Network)) network = Safe("network", () => _sources.Network.Read());
        var tNet = Stopwatch.GetTimestamp();
        if (needs.HasFlag(TelemetryNeeds.Gpu))
            gpus = Safe("gpu", () => _sources.Gpu.Read(fan: true, engines: needs.HasFlag(TelemetryNeeds.GpuEngines))) ?? [];
        var tGpu = Stopwatch.GetTimestamp();

        TelemetryFrame frame;
        lock (_gate)
        {
            var stamp = _time.GetTimestamp();
            if ((needs & (TelemetryNeeds.Cpu | TelemetryNeeds.PerCore | TelemetryNeeds.Disk)) != 0) _cpuDiskAt = stamp;
            if (needs.HasFlag(TelemetryNeeds.Network)) _netAt = stamp;
            if (needs.HasFlag(TelemetryNeeds.GpuEngines)) _gpuEngAt = stamp;
            _lastNeeds = needs;
            frame = new TelemetryFrame
            {
                Seq = ++_seq,
                At = _time.GetUtcNow(),
                Cpu = cpu,
                Gpus = gpus,
                Memory = memory,
                DiskTotal = diskTotal,
                Disks = disks,
                Network = network,
                UptimeSec = Math.Round(Environment.TickCount64 / 1000.0),
            };
            _lastTick = stamp;
        }
        Record(frame);
        Volatile.Write(ref _latest, frame);

        var us = Stopwatch.GetElapsedTime(started).TotalMicroseconds;
        static double Us(long a, long b) => (b - a) * 1e6 / Stopwatch.Frequency;
        var breakdown = $"pdh {Us(started, tPdh):0} us, ram+net {Us(tPdh, tNet):0} us, gpu {Us(tNet, tGpu):0} us, history {Us(tGpu, Stopwatch.GetTimestamp()):0} us";
        lock (_gate)
        {
            _breakdown = breakdown;
            _costTicks++;
            _costLast = us;
            _costSum += us;
            _costMax = Math.Max(_costMax, us);
        }

        if (_publisher is { IsDemanded: true } pub) pub.Publish(frame.ToSnapshot());

        TaskCompletionSource<TelemetryFrame> done;
        lock (_gate) done = Interlocked.Exchange(ref _next, new TaskCompletionSource<TelemetryFrame>(TaskCreationOptions.RunContinuationsAsynchronously));
        done.TrySetResult(frame);
        return frame;
    }

    internal static IReadOnlyList<DiskFrame> MergeDisks(IReadOnlyList<DriveSpace> space, IReadOnlyDictionary<string, VolumeActivity> activity)
    {
        var list = new List<DiskFrame>(space.Count);
        foreach (var s in space)
        {
            activity.TryGetValue(s.Name, out var a);
            var used = Math.Max(0, s.TotalGiB - s.FreeGiB);
            list.Add(new DiskFrame
            {
                Name = s.Name,
                Label = s.Label,
                Format = s.Format,
                TotalGiB = s.TotalGiB,
                FreeGiB = s.FreeGiB,
                UsedGiB = used,
                UsagePct = s.TotalGiB > 0 ? used / s.TotalGiB * 100 : null,
                ActivePct = a.ActivePct,
                ReadBps = a.ReadBps,
                WriteBps = a.WriteBps,
            });
        }
        return list;
    }

    private void Record(TelemetryFrame f)
    {
        var h = History;
        if (f.Cpu is { } c)
        {
            h.Add(Series.CpuUsage, c.UsagePct);
            h.Add(Series.CpuClock, c.ClockMhz);
            h.Add(Series.CpuTemp, c.TempC);
        }
        if (f.Memory is { } m)
        {
            h.Add(Series.MemUsage, m.UsagePct);
            h.Add(Series.MemUsed, m.UsedMiB);
        }
        if (f.DiskTotal is { } dt)
        {
            h.Add(Series.DiskActive, dt.ActivePct);
            h.Add(Series.DiskRead, dt.ReadBps);
            h.Add(Series.DiskWrite, dt.WriteBps);
        }
        foreach (var d in f.Disks)
        {
            h.Add(Series.Disk(d.Name, "active"), d.ActivePct);
            h.Add(Series.Disk(d.Name, "read"), d.ReadBps);
            h.Add(Series.Disk(d.Name, "write"), d.WriteBps);
        }
        if (f.Network is { } n)
        {
            h.Add(Series.NetRx, n.RxBps);
            h.Add(Series.NetTx, n.TxBps);
            foreach (var a in n.Adapters)
            {
                h.Add(Series.Net(a.Id, "rx"), a.RxBps);
                h.Add(Series.Net(a.Id, "tx"), a.TxBps);
            }
        }
        foreach (var g in f.Gpus)
        {
            h.Add(Series.Gpu(g.Id, "usage"), g.UsagePct);
            h.Add(Series.Gpu(g.Id, "temp"), g.TempC);
            h.Add(Series.Gpu(g.Id, "power"), g.PowerW);
            h.Add(Series.Gpu(g.Id, "vram"), g.VramUsedMiB);
            h.Add(Series.Gpu(g.Id, "clock"), g.ClockMhz);
        }
    }

    /// <summary>
    /// The first request after an idle API period: publish something real right away (memory, uptime, the static CPU
    /// facts, and the last frame's sections if it is fresh) so the client is not left waiting, then wake the sampler.
    /// Runs on the HTTP request thread; cheap (one GlobalMemoryStatusEx).
    /// </summary>
    private void OnDemandStarted()
    {
        try
        {
            var latest = Latest;
            var fresh = latest is not null && _time.GetUtcNow() - latest.At < TimeSpan.FromSeconds(3);
            var quick = (fresh ? latest! : new TelemetryFrame()) with
            {
                Memory = _sources.Memory.Read(),
                UptimeSec = Math.Round(Environment.TickCount64 / 1000.0),
            };
            _publisher?.Publish(quick.ToSnapshot());
        }
        catch (Exception ex)
        {
            _log.Warn("Quick /v1/system publish failed", ex);
        }
        Wake();
    }

    private void Wake()
    {
        TaskCompletionSource old;
        lock (_gate) old = Interlocked.Exchange(ref _wake, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        old.TrySetResult();
    }

    /// <summary>The task the next <see cref="Wake"/> completes. Capture it before checking what to do, then wait on it.</summary>
    private Task WakeSignal()
    {
        lock (_gate) return _wake.Task;
    }

    /// <summary>Waits out <paramref name="interval"/>; a wake inside it ends the wait only if the needs grew (fast mode,
    /// API demand, a new section). The signal is captured before the needs are read, so no wake is lost.</summary>
    private async Task WaitForWakeAsync(TimeSpan interval, CancellationToken ct)
    {
        var due = _time.GetTimestamp() + (long)(interval.TotalSeconds * _time.TimestampFrequency);
        var wake = WakeSignal();
        var before = CurrentNeeds;
        while (true)
        {
            var left = TimeSpan.FromSeconds((due - _time.GetTimestamp()) / (double)_time.TimestampFrequency);
            if (left <= TimeSpan.Zero) return;
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var delay = Task.Delay(left, _time, cts.Token);
            var first = await Task.WhenAny(wake, delay).ConfigureAwait(false);
            cts.Cancel();
            ct.ThrowIfCancellationRequested();
            if (first == delay) return;
            wake = WakeSignal();
            var now = CurrentNeeds;
            if ((now & ~before) != TelemetryNeeds.None) return; // something new is needed: sample it now
        }
    }

    private T? Safe<T>(string what, Func<T?> read) where T : class
    {
        try { return read(); }
        catch (Exception ex)
        {
            if (_errorsLogged++ < 20) _log.Warn($"Telemetry: reading {what} failed", ex);
            return null;
        }
    }

    private void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception ex)
        {
            if (_errorsLogged++ < 20) _log.Warn($"Telemetry: {what} failed", ex);
        }
    }

    private void Release(Lease lease)
    {
        lock (_gate) _leases.Remove(lease);
    }

    public async ValueTask DisposeAsync()
    {
        AttachPublisher(null);
        _cts?.Cancel();
        if (_loop is not null)
        {
            try { await _loop.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); }
            catch (Exception ex) when (ex is OperationCanceledException or TimeoutException) { }
        }
        _sources.Dispose();
        _cts?.Dispose();
    }

    private sealed class Lease(TelemetryService owner, TelemetryNeeds needs) : ITelemetryLease
    {
        private volatile int _needs = (int)needs;
        private int _disposed;

        public TelemetryNeeds Needs => _disposed == 1 ? TelemetryNeeds.None : (TelemetryNeeds)_needs;

        public void Update(TelemetryNeeds value)
        {
            if (_disposed == 1 || (TelemetryNeeds)_needs == value) return;
            _needs = (int)value;
            owner.Wake();
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
            owner.Release(this);
        }
    }
}
