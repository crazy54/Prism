using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.CpuTemp;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

/// <summary>Regression tests for review B (wave 3): each one reproduces a finding against the code before the fix.</summary>
public class LhmTimeoutTests
{
    /// <summary>Answers "200 OK, Content-Length: 100000", sends 13 body bytes, then stalls (a hung LHM, or another app on the port).</summary>
    private sealed class StallingServer : IAsyncDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource _cts = new();
        private readonly Task _loop;
        private readonly List<TcpClient> _held = [];

        public StallingServer()
        {
            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            _loop = Task.Run(async () =>
            {
                try
                {
                    while (!_cts.IsCancellationRequested)
                    {
                        var c = await _listener.AcceptTcpClientAsync(_cts.Token);
                        lock (_held) _held.Add(c);
                        var s = c.GetStream();
                        var buf = new byte[4096];
                        var req = new StringBuilder();
                        while (!req.ToString().Contains("\r\n\r\n", StringComparison.Ordinal))
                        {
                            var n = await s.ReadAsync(buf, _cts.Token);
                            if (n == 0) break;
                            req.Append(Encoding.ASCII.GetString(buf, 0, n));
                        }
                        await s.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{\"Children\":["), _cts.Token);
                    }
                }
                catch (Exception) { }
            });
        }

        public int Port { get; }

        public async ValueTask DisposeAsync()
        {
            await _cts.CancelAsync();
            _listener.Stop();
            try { await _loop; } catch { }
            lock (_held) foreach (var c in _held) c.Dispose();
            _cts.Dispose();
        }
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Lhm_read_gives_up_when_the_body_stalls_after_the_headers()
    {
        // Review B #4: ResponseHeadersRead meant HttpClient.Timeout stopped at the headers, so the body read hung forever.
        await using var server = new StallingServer();
        using var lhm = new LhmHttpEndpoint();
        var sw = Stopwatch.StartNew();
        var r = await lhm.ReadAsync(server.Port, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(6));
        sw.Stop();
        Assert.Equal(ProviderOutcome.Unreachable, r.Outcome);
        Assert.Equal("timed out", r.Detail);
        Assert.InRange(sw.Elapsed.TotalSeconds, 2.0, 4.5, "one 2.5 s budget for headers and body");
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Lhm_read_still_honours_the_callers_cancellation()
    {
        await using var server = new StallingServer();
        using var lhm = new LhmHttpEndpoint();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        var sw = Stopwatch.StartNew();
        await Assert.ThrowsAsync<OperationCanceledException>(() => lhm.ReadAsync(server.Port, cts.Token));
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(2), "cancelled promptly");
    }
}

public class LostWakeupTests
{
    [Test(TimeoutMs = 15_000)]
    public async Task A_lease_taken_between_the_needs_check_and_the_wait_wakes_the_sampler()
    {
        // Review B #7: the loop read its needs, then captured the wake signal; a lease taken in between was lost and
        // the loop slept with no timeout (the stats keys froze). The fake runs the lease exactly inside that window.
        var m = new FakeMachine();
        await using var svc = m.Service();
        ITelemetryLease? lease = null;
        m.Temp.OnSetWanted = _ => { if (Volatile.Read(ref lease) is null) Volatile.Write(ref lease, svc.Acquire(TelemetryNeeds.Memory)); };
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        svc.Start(cts.Token);
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        while (m.Memory.Reads == 0 && DateTime.UtcNow < deadline) await Task.Delay(20);
        Assert.NotNull(Volatile.Read(ref lease), "the hook ran");
        Assert.True(m.Memory.Reads > 0, "the wake-up was lost: the new key never got a sample");
        lease!.Dispose();
    }

    private sealed class HookLhm : ILhmEndpoint
    {
        public Action<int>? OnRead;
        public readonly List<int> Ports = [];
        public Task<ProviderRead> ReadAsync(int port, CancellationToken cancellationToken)
        {
            lock (Ports) Ports.Add(port);
            OnRead?.Invoke(port);
            return Task.FromResult(new ProviderRead(ProviderOutcome.Unreachable, null, "connection refused"));
        }
        public bool IsAppRunning() => false;
    }

    private sealed class NoHwInfo : IHwInfoEndpoint
    {
        public ProviderRead Read() => new(ProviderOutcome.Unreachable, null, "not running");
    }

    [Test(TimeoutMs = 15_000)]
    public async Task A_settings_change_during_a_probe_is_probed_right_away()
    {
        // Review B #7 in CpuTempMonitor: the step read its state, then the wait captured the signal. A change in between
        // (here: the user picks another port while the probe runs) waited out the 30 s backoff, or forever when idle.
        var time = new ManualTimeProvider(); // its delays never elapse on their own
        var lhm = new HookLhm();
        using var mon = new CpuTempMonitor(lhm, new NoHwInfo(), time, NullLog.Instance);
        var once = 0;
        lhm.OnRead = _ => { if (Interlocked.Exchange(ref once, 1) == 0) mon.Configure(CpuTempSource.LibreHardwareMonitor, 8086); };
        mon.SetWanted(true);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        mon.Start(cts.Token);
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        bool Probed() { lock (lhm.Ports) return lhm.Ports.Contains(8086); }
        while (!Probed() && DateTime.UtcNow < deadline) await Task.Delay(20);
        Assert.True(Probed(), "the new port waited for the backoff: the wake-up was lost");
    }
}

public class ModuleLifetimeTests
{
    private sealed class CountingSettings : IGlobalSettings
    {
        private readonly TestGlobalSettings _inner = new();
        private EventHandler<GlobalSettingsChangedEventArgs>? _changed;
        public int Subscribers => _changed?.GetInvocationList().Length ?? 0;
        public bool IsLoaded => true;
        public Task WaitForLoadAsync(TimeSpan timeout) => Task.CompletedTask;
        public JsonObject Snapshot() => _inner.Snapshot();
        public T GetSection<T>(string section) where T : class, new() => _inner.GetSection<T>(section);
        public void SetSection<T>(string section, T value) where T : class => _inner.SetSection(section, value);
        public CoreSettings Core => _inner.Core;
        public event EventHandler<GlobalSettingsChangedEventArgs>? Changed { add => _changed += value; remove => _changed -= value; }
    }

    private sealed class CountingEvents : IPluginEvents
    {
        private EventHandler? _woke;
        public int WakeSubscribers => _woke?.GetInvocationList().Length ?? 0;
        public event EventHandler? SystemWokeUp { add => _woke += value; remove => _woke -= value; }
#pragma warning disable CS0067 // not raised here
        public event EventHandler<DeviceInfo>? DeviceConnected;
        public event EventHandler<string>? DeviceDisconnected;
        public event EventHandler<string>? ApplicationLaunched;
        public event EventHandler<string>? ApplicationTerminated;
        public event EventHandler<string>? DeepLinkReceived;
        public event EventHandler? Connected;
        public event EventHandler? Disconnected;
#pragma warning restore CS0067
    }

    private sealed class Context(IGlobalSettings settings, IPluginEvents events) : IModuleContext, IDisposable
    {
        private readonly CancellationTokenSource _cts = new();
        public ILog Log { get; } = NullLog.Instance;
        public IDataRegistry Data { get; } = new DataRegistry();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = settings;
        public IPluginEvents Events { get; } = events;
        public IDeviceDirectory Devices => throw new NotSupportedException();
        public TimeProvider Time { get; } = TimeProvider.System;
        public CancellationToken ShutdownToken => _cts.Token;
        public string PluginDirectory => AppContext.BaseDirectory;
        public string DataDirectory => Path.Combine(Path.GetTempPath(), "prismcontrol-systeminfo-tests");
        public void OpenUrl(string url) { }
        public void Dispose() { _cts.Cancel(); _cts.Dispose(); }
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Module_unsubscribes_its_handlers_on_dispose()
    {
        var settings = new CountingSettings();
        var events = new CountingEvents();
        using var ctx = new Context(settings, events);
        var module = new SystemInfoModule();
        module.Initialize(ctx);
        Assert.Equal(1, settings.Subscribers);
        Assert.Equal(1, events.WakeSubscribers);
        await module.DisposeAsync();
        Assert.Equal(0, settings.Subscribers, "GlobalSettings.Changed");
        Assert.Equal(0, events.WakeSubscribers, "SystemWokeUp");
    }
}

public class SharedCpuTemperatureTests
{
    private sealed class SharedSource : ICpuTemperatureSource
    {
        public CpuTemperatureReading? Reading;
        public int Reads;
        public CpuTemperatureReading? Latest { get { Reads++; return Reading; } }
    }

    private sealed class SwitchLhm : ILhmEndpoint
    {
        public ProviderRead Next = new(ProviderOutcome.Unreachable, null, "connection refused");
        public Task<ProviderRead> ReadAsync(int port, CancellationToken cancellationToken) => Task.FromResult(Next);
        public bool IsAppRunning() => true; // this PC: LHM runs, its web server is off
    }

    private sealed class SwitchHwInfo : IHwInfoEndpoint
    {
        public ProviderRead Next = new(ProviderOutcome.Unreachable, null, "not running");
        public ProviderRead Read() => Next;
    }

    private static (CpuTempMonitor Mon, TelemetryService Svc, SharedSource Icue, SwitchLhm Lhm, SwitchHwInfo Hw, ManualTimeProvider Time) Rig()
    {
        var time = new ManualTimeProvider();
        var services = new ServiceRegistry();
        var icue = new SharedSource { Reading = new CpuTemperatureReading(61.38, CpuTemperature.Icue, time.GetUtcNow()) };
        services.Add<ICpuTemperatureSource>(icue);
        var lhm = new SwitchLhm();
        var hw = new SwitchHwInfo();
        var mon = new CpuTempMonitor(lhm, hw, time, NullLog.Instance, services);
        var m = new FakeMachine();
        var svc = new TelemetryService(new TelemetrySources(m.Cpu, m.Memory, m.Network, m.Drives, m.Gpu, mon), time, NullLog.Instance);
        mon.SetWanted(true);
        return (mon, svc, icue, lhm, hw, time);
    }

    private const TelemetryNeeds Needs = TelemetryNeeds.Cpu | TelemetryNeeds.CpuTemp;

    [Test]
    public async Task Without_lhm_or_hwinfo_the_cpu_temperature_is_iCUEs_and_says_so()
    {
        // This PC today: LibreHardwareMonitor runs with its web server off, no HWiNFO, iCUE has the CPU package sensor.
        var (mon, svc, icue, _, _, _) = Rig();
        await using var _svc = svc;
        await mon.StepAsync(CancellationToken.None);
        var f = svc.SampleNow(Needs);
        Assert.Equal(61.38, f.Cpu!.TempC);
        Assert.Equal("iCUE", f.Cpu.TempSource);
        Assert.Equal(61.4, f.ToSnapshot().Cpu!.TempC, "/v1/system cpu.tempC");
        Assert.True(icue.Reads > 0);
        var status = mon.Status;
        Assert.Equal("iCUE", status.Provider);
        Assert.Contains("iCUE: CPU package, shared by the Cooling module.", status.Message);
        Assert.Contains("web server is off", status.Message, "and why LibreHardwareMonitor is not used");
        var view = Render.StatViews.Cpu(f, svc.History, "temp", showTemp: true, 40);
        Assert.Equal("61°C", view.Value.Text);
        Assert.Contains("iCUE", view.Sub);
        Assert.Contains("iCUE", view.SubShort);
    }

    [Test]
    public async Task Lhm_then_hwinfo_then_the_shared_reading()
    {
        var (mon, svc, icue, lhm, hw, _) = Rig();
        await using var _svc = svc;

        hw.Next = new(ProviderOutcome.Ok, new CpuTempReading(58, "CPU (Tctl/Tdie)"));
        await mon.StepAsync(CancellationToken.None);
        var f = svc.SampleNow(Needs);
        Assert.Equal((58.0, "HWiNFO"), (f.Cpu!.TempC!.Value, f.Cpu.TempSource!), "HWiNFO beats the shared reading");
        var reads = icue.Reads;
        svc.SampleNow(Needs);
        Assert.Equal(reads, icue.Reads, "the shared source is not even read while our own provider has a value");

        // HWiNFO stops; LHM's web server comes on: LHM wins (it is probed first).
        hw.Next = new(ProviderOutcome.Inactive, null, "inactive");
        for (var i = 0; i < 3; i++) await mon.StepAsync(CancellationToken.None);
        lhm.Next = new(ProviderOutcome.Ok, new CpuTempReading(52, "Core (Tctl/Tdie)"));
        hw.Next = new(ProviderOutcome.Ok, new CpuTempReading(58, "CPU (Tctl/Tdie)"));
        await mon.StepAsync(CancellationToken.None);
        f = svc.SampleNow(Needs);
        Assert.Equal((52.0, "LibreHardwareMonitor"), (f.Cpu!.TempC!.Value, f.Cpu.TempSource!));
        Assert.Equal("LHM", Render.StatViews.TempSourceLabel(f.Cpu.TempSource));
    }

    [Test]
    public async Task An_explicit_source_off_or_a_stale_shared_reading_never_shows_iCUE()
    {
        var (mon, svc, icue, _, _, time) = Rig();
        await using var _svc = svc;
        mon.Configure(CpuTempSource.LibreHardwareMonitor, 8085);
        await mon.StepAsync(CancellationToken.None);
        Assert.Null(svc.SampleNow(Needs).Cpu!.TempC, "the user chose LibreHardwareMonitor: no fallback");
        mon.Configure(CpuTempSource.Off, 8085);
        await mon.StepAsync(CancellationToken.None);
        Assert.Null(svc.SampleNow(Needs).Cpu!.TempC);

        mon.Configure(CpuTempSource.Auto, 8085);
        await mon.StepAsync(CancellationToken.None);
        Assert.NotNull(svc.SampleNow(Needs).Cpu!.TempSource);
        time.Advance(TimeSpan.FromSeconds(11)); // the shared reading is now older than Core's 10 s limit
        var f = svc.SampleNow(Needs);
        Assert.Null(f.Cpu!.TempC, "a stale shared reading is no reading");
        Assert.Null(f.Cpu.TempSource);
        icue.Reading = null;
        Assert.Contains("No CPU temperature", mon.Status.Message);
    }
}
