namespace PrismControl.SystemInfo.Telemetry;

/// <summary>Well-known history series names (per-device series append an id).</summary>
public static class Series
{
    public const string CpuUsage = "cpu.usage";
    public const string CpuClock = "cpu.clock";
    public const string CpuTemp = "cpu.temp";
    public const string MemUsage = "mem.usage";
    public const string MemUsed = "mem.used";
    public const string DiskActive = "disk.active";
    public const string DiskRead = "disk.read";
    public const string DiskWrite = "disk.write";
    public const string NetRx = "net.rx";
    public const string NetTx = "net.tx";

    public static string Gpu(string gpuId, string metric) => $"gpu.{gpuId}.{metric}";
    public static string Disk(string drive, string metric) => $"disk.{drive}.{metric}";
    public static string Net(string adapterId, string metric) => $"net.{adapterId}.{metric}";
}

/// <summary>
/// Thread-safe ring buffers of recent samples, one per series (written by the sampler, read by renders).
/// A NaN marks a gap (no sample), so sparklines break instead of drawing a straight line across idle time.
/// </summary>
public sealed class TelemetryHistory
{
    private readonly int _capacity;
    private readonly Dictionary<string, Ring> _series = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    public TelemetryHistory(int capacity = 120) => _capacity = Math.Max(2, capacity);

    public int Capacity => _capacity;

    public void Add(string series, double? value)
    {
        lock (_gate)
        {
            if (!_series.TryGetValue(series, out var r)) _series[series] = r = new Ring(_capacity);
            r.Add(value is { } v && double.IsFinite(v) ? v : double.NaN);
        }
    }

    /// <summary>Appends a gap marker to every series (sampling resumed after a pause).</summary>
    public void MarkGap()
    {
        lock (_gate)
            foreach (var r in _series.Values)
                if (r.Count > 0 && !double.IsNaN(r.Newest)) r.Add(double.NaN);
    }

    /// <summary>The last <paramref name="count"/> samples, oldest first (shorter if fewer exist).</summary>
    public double[] Last(string series, int count)
    {
        lock (_gate) return _series.TryGetValue(series, out var r) ? r.Last(count) : [];
    }

    public void Clear()
    {
        lock (_gate) _series.Clear();
    }

    private sealed class Ring(int capacity)
    {
        private readonly double[] _items = new double[capacity];
        private int _start;
        public int Count { get; private set; }
        public double Newest => _items[(_start + Count - 1) % _items.Length];

        public void Add(double v)
        {
            if (Count < _items.Length) _items[(_start + Count++) % _items.Length] = v;
            else
            {
                _items[_start] = v;
                _start = (_start + 1) % _items.Length;
            }
        }

        public double[] Last(int count)
        {
            var n = Math.Clamp(count, 0, Count);
            var result = new double[n];
            for (var i = 0; i < n; i++) result[i] = _items[(_start + Count - n + i) % _items.Length];
            return result;
        }
    }
}
