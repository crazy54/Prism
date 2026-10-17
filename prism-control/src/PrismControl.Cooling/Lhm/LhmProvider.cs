using System.Net;
using PrismControl.Core.Hosting;

namespace PrismControl.Cooling.Lhm;

public sealed class LhmOptions
{
    /// <summary>LHM's default Remote Web Server port.</summary>
    public const int DefaultPort = 8085;
    /// <summary>Always the IPv4 loopback ("localhost" costs ~2 s here and LHM listens on IPv4).</summary>
    public string Host { get; init; } = "127.0.0.1";
    /// <summary>Windows retries a refused loopback SYN for ~2 s; cut it short (research/windows.md §2.7).</summary>
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromMilliseconds(400);
    public TimeSpan RequestTimeout { get; init; } = TimeSpan.FromSeconds(2);
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(1);
    public TimeSpan BackoffMin { get; init; } = TimeSpan.FromSeconds(5);
    public TimeSpan BackoffMax { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>Tests substitute a handler.</summary>
    public Func<HttpMessageHandler>? HandlerFactory { get; init; }
}

/// <summary>
/// LibreHardwareMonitor's web server (<c>http://127.0.0.1:8085/data.json</c>): the fallback for fans/pumps when iCUE is not
/// available, and a CPU temperature source ("Core (Tctl/Tdie)" / "CPU Package"). LHM itself must run (as admin) with
/// Options → Remote Web Server on; this reader needs no rights. It only polls while <see cref="Wanted"/>; detection runs
/// on its own task with a 400 ms connect timeout and 5 → 30 s backoff, never on the sampler's tick.
/// </summary>
public sealed class LhmProvider : ICoolingProvider
{
    public const string ProviderName = "lhm";
    private const long MaxBytes = 8 * 1024 * 1024;

    private readonly LhmOptions _o;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly SemaphoreSlim _wake = new(0, 1);
    private HttpClient? _http;
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private ProviderReading _current = ProviderReading.Off;
    private volatile bool _wanted;
    private volatile int _port = LhmOptions.DefaultPort;
    private ProviderState _lastLoggedState = ProviderState.Off;

    public LhmProvider(ILog? log = null, TimeProvider? time = null, LhmOptions? options = null)
    {
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
        _o = options ?? new LhmOptions();
    }

    public string Name => ProviderName;
    public ProviderReading Current { get { lock (_gate) return _current; } }

    public int Port
    {
        get => _port;
        set
        {
            var p = value is > 0 and < 65536 ? value : LhmOptions.DefaultPort;
            if (p == _port) return;
            _port = p;
            Poke();
        }
    }

    public Uri Endpoint => new($"http://{_o.Host}:{_port}/data.json");

    public bool Wanted
    {
        get => _wanted;
        set
        {
            if (_wanted == value) return;
            _wanted = value;
            if (value) Poke();
        }
    }

    private void Poke()
    {
        try { if (_wake.CurrentCount == 0) _wake.Release(); } catch (SemaphoreFullException) { }
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_loop is not null) return;
            _http = new HttpClient(_o.HandlerFactory?.Invoke() ?? new SocketsHttpHandler
            {
                ConnectTimeout = _o.ConnectTimeout,
                UseProxy = false,
                AutomaticDecompression = DecompressionMethods.None,
                PooledConnectionIdleTimeout = TimeSpan.FromSeconds(10),
                MaxConnectionsPerServer = 1,
            }, disposeHandler: true)
            {
                Timeout = _o.RequestTimeout,
                MaxResponseContentBufferSize = MaxBytes,
            };
            _cts = new CancellationTokenSource();
            var ct = _cts.Token;
            _current = new ProviderReading(_wanted ? ProviderState.Connecting : ProviderState.Standby, _wanted ? "Looking for LibreHardwareMonitor…" : StandbyText, []);
            _loop = Task.Run(() => RunAsync(ct));
        }
    }

    private const string StandbyText = "Standby (iCUE provides fans and CPU temperature)";

    public async Task StopAsync()
    {
        Task? loop;
        CancellationTokenSource? cts;
        HttpClient? http;
        lock (_gate)
        {
            loop = _loop;
            cts = _cts;
            http = _http;
            _loop = null;
            _cts = null;
            _http = null;
        }
        if (cts is null) return;
        await cts.CancelAsync().ConfigureAwait(false);
        if (loop is not null) { try { await loop.ConfigureAwait(false); } catch (OperationCanceledException) { } }
        cts.Dispose();
        http?.Dispose();
        lock (_gate) _current = ProviderReading.Off;
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        _wake.Dispose();
    }

    private void Set(ProviderState state, string detail, IReadOnlyList<RawSensor>? sensors = null)
    {
        lock (_gate)
        {
            if (_loop is null) return;
            _current = new ProviderReading(state, detail, sensors ?? []);
        }
        if (state != _lastLoggedState)
        {
            _lastLoggedState = state;
            _log.Info($"LHM {state}: {detail}");
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var backoff = _o.BackoffMin;
        while (!ct.IsCancellationRequested)
        {
            if (!_wanted)
            {
                Set(ProviderState.Standby, StandbyText);
                try { await _wake.WaitAsync(ct).ConfigureAwait(false); } catch (OperationCanceledException) { break; }
                continue;
            }
            var port = _port;
            try
            {
                var http = _http ?? throw new ObjectDisposedException(nameof(LhmProvider));
                using var resp = await http.GetAsync(Endpoint, HttpCompletionOption.ResponseContentRead, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) throw new HttpRequestException($"HTTP {(int)resp.StatusCode}");
                var bytes = await resp.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
                var sensors = LhmParser.Parse(bytes, _time.GetUtcNow());
                Set(ProviderState.Connected, $"LibreHardwareMonitor web server · {sensors.Count} sensors", sensors);
                backoff = _o.BackoffMin;
                if (!await DelayAsync(_o.PollInterval, ct).ConfigureAwait(false)) break;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or TimeoutException or System.Text.Json.JsonException or IOException or InvalidOperationException)
            {
                Set(ProviderState.NotRunning, $"LibreHardwareMonitor web server not reachable on {_o.Host}:{port} (LHM → Options → Remote Web Server)");
                if (!await DelayAsync(backoff, ct).ConfigureAwait(false)) break;
                backoff = TimeSpan.FromTicks(Math.Min(_o.BackoffMax.Ticks, backoff.Ticks * 2));
            }
        }
    }

    /// <summary>Waits <paramref name="t"/>, or less if the port changes or the service wakes us. False when cancelled.</summary>
    private async Task<bool> DelayAsync(TimeSpan t, CancellationToken ct)
    {
        try
        {
            await _wake.WaitAsync(t, ct).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) { return false; }
    }
}
