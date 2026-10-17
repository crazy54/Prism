namespace PrismControl.Cooling;

/// <summary>A sample: Unix time in ms and the value (RPM or °C).</summary>
public readonly record struct HistoryPoint(long UnixMs, double Value);

/// <summary>Min / average / max over a window.</summary>
public readonly record struct HistoryStats(double Min, double Avg, double Max, int Count);

/// <summary>
/// 1 Hz history per sensor plus derived series ("cpu", "coolant", "group:radiator" averages…), kept for
/// <see cref="Capacity"/> samples (15 minutes by default). Only grows while the service samples, i.e. while something
/// consumes cooling data. Thread-safe: the sampler appends, actions read.
/// </summary>
public sealed class CoolingHistory
{
    public const string CpuKey = "cpu";
    public const string CoolantKey = "coolant";

    private readonly object _gate = new();
    private readonly Dictionary<string, Ring> _series = new(StringComparer.Ordinal);
    private int _appends;

    public CoolingHistory(int capacity = 900) => Capacity = Math.Max(16, capacity);

    public int Capacity { get; }

    public static string GroupKey(FanGroup g) => "group:" + g.ToString().ToLowerInvariant();

    public void Append(CoolingSnapshot s)
    {
        var t = s.At.ToUnixTimeMilliseconds();
        lock (_gate)
        {
            foreach (var x in s.Sensors)
                if (x.HasValue) Add(x.Id, t, x.Value!.Value);
            if (s.Cpu?.Value is { } cpu) Add(CpuKey, t, cpu);
            if (s.Coolant?.Value is { } liq) Add(CoolantKey, t, liq);
            foreach (var g in Enum.GetValues<FanGroup>())
                if (s.Group(g).Avg is { } avg) Add(GroupKey(g), t, avg);
            if (++_appends % 60 == 0) Prune(t);
        }
    }

    /// <summary>Points of <paramref name="key"/> newer than <paramref name="now"/> − <paramref name="window"/>, oldest first.</summary>
    public IReadOnlyList<HistoryPoint> Get(string key, TimeSpan window, DateTimeOffset now)
    {
        var from = (now - window).ToUnixTimeMilliseconds();
        lock (_gate)
        {
            if (!_series.TryGetValue(key, out var r)) return [];
            return r.Since(from);
        }
    }

    public HistoryStats? Stats(string key, TimeSpan window, DateTimeOffset now)
    {
        var pts = Get(key, window, now);
        if (pts.Count == 0) return null;
        double min = double.MaxValue, max = double.MinValue, sum = 0;
        foreach (var p in pts)
        {
            min = Math.Min(min, p.Value);
            max = Math.Max(max, p.Value);
            sum += p.Value;
        }
        return new HistoryStats(min, sum / pts.Count, max, pts.Count);
    }

    public void Clear()
    {
        lock (_gate) _series.Clear();
    }

    private void Add(string key, long t, double v)
    {
        if (!_series.TryGetValue(key, out var r)) _series[key] = r = new Ring(Capacity);
        r.Add(t, v);
    }

    private void Prune(long now)
    {
        // Sensors that disappeared stop costing memory once their newest point is older than the whole window.
        var horizon = now - (long)Capacity * 1000 * 2;
        foreach (var k in _series.Where(kv => kv.Value.Newest < horizon).Select(kv => kv.Key).ToList()) _series.Remove(k);
    }

    private sealed class Ring(int capacity)
    {
        private readonly long[] _t = new long[capacity];
        private readonly double[] _v = new double[capacity];
        private int _start, _count;

        public long Newest => _count == 0 ? long.MinValue : _t[(_start + _count - 1) % _t.Length];

        public void Add(long t, double v)
        {
            if (_count > 0 && t <= Newest) return; // same tick (or clock went back): keep the first
            if (_count < _t.Length)
            {
                var i = (_start + _count) % _t.Length;
                _t[i] = t;
                _v[i] = v;
                _count++;
            }
            else
            {
                _t[_start] = t;
                _v[_start] = v;
                _start = (_start + 1) % _t.Length;
            }
        }

        public List<HistoryPoint> Since(long from)
        {
            var list = new List<HistoryPoint>(_count);
            for (var k = 0; k < _count; k++)
            {
                var i = (_start + k) % _t.Length;
                if (_t[i] >= from) list.Add(new HistoryPoint(_t[i], _v[i]));
            }
            return list;
        }
    }
}
