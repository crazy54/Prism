using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.CpuTemp;
using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

/// <summary>
/// READ-ONLY probes against the real counters on this PC (PDH, GlobalMemoryStatusEx, IP Helper, DriveInfo, NVML,
/// D3DKMT, LibreHardwareMonitor/HWiNFO if present). Nothing is written anywhere. Run: -- --category integration
/// </summary>
public class IntegrationTests
{
    private static string F(double? v, string fmt = "0.0") => v is { } x ? x.ToString(fmt, CultureInfo.InvariantCulture) : "null";

    [Test(Category = "integration")]
    public unsafe void Struct_layouts_match_the_research()
    {
        Assert.Equal(64, sizeof(MEMORYSTATUSEX));
        Assert.Equal(16, sizeof(PDH_FMT_COUNTERVALUE));
        Assert.Equal(24, sizeof(PDH_FMT_COUNTERVALUE_ITEM_W));
        Assert.Equal(1352, sizeof(MIB_IF_ROW2));
        Assert.Equal(1208, (int)Marshal.OffsetOf<MIB_IF_ROW2>(nameof(MIB_IF_ROW2.InOctets)));
        Assert.Equal(64, sizeof(D3DKMT_ADAPTER_PERFDATA));
        Assert.Equal(56, sizeof(D3DKMT_NODE_PERFDATA));
        Assert.Equal(48, sizeof(MEMORY_BASIC_INFORMATION));
        Assert.Equal(40, sizeof(NvmlMemoryV2));
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Real_sampler_reads_every_section_and_reports_its_tick_cost()
    {
        var log = new ConsoleLog();
        await using var svc = TelemetryService.CreateDefault(log, TimeProvider.System, new MemorySampler());
        var needs = TelemetryNeeds.Api | TelemetryNeeds.PerCore;
        svc.Prime(needs);
        await Task.Delay(1000);
        var f = svc.SampleNow(needs);
        await Task.Delay(1000);
        f = svc.SampleNow(needs);

        var c = Assert.NotNull(f.Cpu, "cpu");
        Console.WriteLine($"  cpu '{c.Name}' {c.Cores}C/{c.Threads}T usage {F(c.UsagePct)}% clock {F(c.ClockMhz, "0")} MHz temp {F(c.TempC)} perCore[{c.PerCorePct?.Count}]");
        Assert.True(c.UsagePct is >= 0 and <= 100, "usage in 0-100");
        Assert.True(c.ClockMhz > 100, "effective clock");
        Assert.Equal(c.Threads, c.PerCorePct?.Count);
        var m = Assert.NotNull(f.Memory);
        Console.WriteLine($"  ram {F(m.UsedMiB, "0")}/{F(m.TotalMiB, "0")} MiB ({F(m.UsagePct)}%) commit {F(m.CommitUsedMiB, "0")}/{F(m.CommitLimitMiB, "0")}");
        Assert.True(m.TotalMiB > 1000);
        Console.WriteLine($"  disk total active {F(f.DiskTotal?.ActivePct)}% r {F(f.DiskTotal?.ReadBps / 1e6, "0.00")} w {F(f.DiskTotal?.WriteBps / 1e6, "0.00")} MB/s");
        foreach (var d in f.Disks)
            Console.WriteLine($"  disk {d.Name} {d.Format} free {F(d.FreeGiB, "0")} of {F(d.TotalGiB, "0")} GiB active {F(d.ActivePct)}% r {F(d.ReadBps / 1e6, "0.00")} w {F(d.WriteBps / 1e6, "0.00")} MB/s");
        Assert.True(f.Disks.Any(d => d.Name.Equals(Path.GetPathRoot(Environment.SystemDirectory)!.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)), "system drive listed");
        var n = Assert.NotNull(f.Network);
        Console.WriteLine($"  net total rx {F(n.RxBps / 1e3, "0.0")} tx {F(n.TxBps / 1e3, "0.0")} KB/s, {n.Adapters.Count} adapters");
        foreach (var a in n.Adapters)
            Console.WriteLine($"    {(a.IsDefaultRoute ? "*" : " ")} '{a.Name}' hw={a.Hardware} up={a.Up} link {F(a.LinkMbps, "0")} Mb/s rx {F(a.RxBps / 1e3)} tx {F(a.TxBps / 1e3)} KB/s");
        Assert.True(n.Adapters.Any(a => a.IsDefaultRoute), "a default-route adapter");
        foreach (var g in f.Gpus)
            Console.WriteLine($"  gpu[{g.Index}] {g.Id} '{g.Name}' {g.Vendor}/{g.Source} igpu={g.Integrated} use {F(g.UsagePct)}% temp {F(g.TempC)} (warn {F(g.TempWarnC)}) power {F(g.PowerW)}/{F(g.PowerLimitW)} W vram {F(g.VramUsedMiB, "0")}/{F(g.VramTotalMiB, "0")} MiB clk {F(g.ClockMhz, "0")} mem {F(g.MemClockMhz, "0")} fan {F(g.FanPct, "0")}%");
        Assert.True(f.Gpus.Count > 0, "at least one GPU");
        Assert.True(f.Gpus.Count(g => g.Vendor == "nvidia") <= 1 || f.Gpus.Select(g => g.Name).Distinct().Count() == f.Gpus.Count, "NVIDIA not listed twice");
        Console.WriteLine($"  cpu temp: {svc.CpuTemp.Message}");

        // Warm cost of a full tick (what the plugin pays per second while everything is visible + the API is polled).
        var costs = new List<double>();
        for (var i = 0; i < 6; i++)
        {
            await Task.Delay(500);
            var t0 = Stopwatch.GetTimestamp();
            svc.SampleNow(TelemetryNeeds.Api);
            costs.Add(Stopwatch.GetElapsedTime(t0).TotalMilliseconds);
            Console.WriteLine($"    full tick {costs[^1]:0.00} ms: {svc.Cost.LastBreakdown}");
        }
        var perCore = new List<double>();
        for (var i = 0; i < 4; i++)
        {
            await Task.Delay(500);
            var t0 = Stopwatch.GetTimestamp();
            svc.SampleNow(needs);
            perCore.Add(Stopwatch.GetElapsedTime(t0).TotalMilliseconds);
        }
        var light = new List<double>();
        for (var i = 0; i < 6; i++)
        {
            await Task.Delay(300);
            var t0 = Stopwatch.GetTimestamp();
            svc.SampleNow(TelemetryNeeds.Cpu | TelemetryNeeds.Memory | TelemetryNeeds.Gpu | TelemetryNeeds.Network);
            light.Add(Stopwatch.GetElapsedTime(t0).TotalMilliseconds);
            Console.WriteLine($"    keys tick {light[^1]:0.00} ms: {svc.Cost.LastBreakdown}");
        }
        Console.WriteLine($"  TICK COST full API (cpu+disk+ram+net+gpu incl. PDH GPU engines): median {Median(costs):0.00} ms, max {costs.Max():0.00} ms");
        Console.WriteLine($"  TICK COST full API + per-core: median {Median(perCore):0.00} ms, max {perCore.Max():0.00} ms");
        Console.WriteLine($"  TICK COST keys-only (cpu+ram+NVML/D3DKMT+net, no PDH GPU engines): median {Median(light):0.00} ms, max {light.Max():0.00} ms");
        Assert.True(Median(costs) < 25, "a tick stays cheap");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Per_source_cost_breakdown()
    {
        var log = new ConsoleLog();
        using var pdh = new PdhCpuDiskSource(log);
        using var net = new IpHelperNetworkSource(log);
        using var gpu = new GpuSource(log);
        var mem = new MemorySampler();
        pdh.Prime(false);
        net.Prime();
        gpu.Prime(true);
        await Task.Delay(600);
        double Time(Action a, int n = 8)
        {
            a();
            var t0 = Stopwatch.GetTimestamp();
            for (var i = 0; i < n; i++) a();
            return Stopwatch.GetElapsedTime(t0).TotalMilliseconds / n;
        }
        var results = new (string, double)[]
        {
            ("PDH collect (cpu + PhysicalDisk + LogicalDisk(*))", Time(() => pdh.Collect(false))),
            ("PDH collect + per-core array", Time(() => pdh.Collect(true))),
            ("GlobalMemoryStatusEx", Time(() => mem.Read(), 1000)),
            ("network (GetIfEntry2 x listed adapters)", Time(() => net.Read(), 50)),
            ("GPUs without fan / PDH engines (NVML + D3DKMT)", Time(() => gpu.Read(fan: false, engines: false), 50)),
            ("GPUs with PDH GPU Engine + Adapter Memory", Time(() => gpu.Read(fan: false, engines: true), 1)),
            ("DriveInfo free space (background, every 30 s)", Time(() => DriveInfoSource.ReadNow(), 4)),
        };
        foreach (var (what, ms) in results) Console.WriteLine($"  COST {what,-52} {ms * 1000,8:0} us");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Module_serves_real_counters_to_the_data_api_and_reports_the_temperature_honestly()
    {
        using var ctx = new TestModuleContext();
        var module = new SystemInfoModule();
        module.Initialize(ctx);
        try
        {
            var svc = ctx.Services.Get<TelemetryService>();
            Assert.NotNull(ctx.Services.Get<MemorySampler>(), "the sample key's service is still registered");
            var t0 = Stopwatch.GetTimestamp();
            var first = await ctx.Data.System.ReadAsync(CancellationToken.None); // first request after idle
            var firstMs = Stopwatch.GetElapsedTime(t0).TotalMilliseconds;
            var body = System.Text.Json.JsonDocument.Parse(Assert.NotNull(first).Body).RootElement;
            Assert.True(body.GetProperty("memory").GetProperty("totalMiB").GetDouble() > 0);
            Console.WriteLine($"  first /v1/system request answered in {firstMs:0} ms with memory + uptime");

            using var cpuKey = svc.Acquire(TelemetryNeeds.Cpu | TelemetryNeeds.CpuTemp); // a CPU key showing the temperature
            await Task.Delay(3200);
            var v = await ctx.Data.System.ReadAsync(CancellationToken.None);
            body = System.Text.Json.JsonDocument.Parse(v!.Body).RootElement;
            var cpu = body.GetProperty("cpu");
            Console.WriteLine($"  /v1/system: cpu {cpu.GetProperty("usagePct")} % @ {cpu.GetProperty("clockMhz")} MHz, tempC {cpu.GetProperty("tempC")}, " +
                $"{body.GetProperty("gpus").GetArrayLength()} GPUs, {body.GetProperty("disks").GetArrayLength()} disks, {body.GetProperty("network").GetProperty("adapters").GetArrayLength()} adapters");
            Assert.Equal(System.Text.Json.JsonValueKind.Number, cpu.GetProperty("usagePct").ValueKind);
            Assert.True(body.GetProperty("gpus").GetArrayLength() >= 1);
            Console.WriteLine($"  CPU temperature status: {svc.CpuTemp.Message}");
            if (svc.CpuTemp.Provider is null) Assert.Equal(System.Text.Json.JsonValueKind.Null, cpu.GetProperty("tempC").ValueKind, "no provider: null, not a guess");
            var cost = svc.Cost;
            Console.WriteLine($"  loop: {cost.Ticks} ticks, last {cost.LastUs / 1000:0.00} ms, average {cost.AverageUs / 1000:0.00} ms, max {cost.MaxUs / 1000:0.00} ms ({cost.LastBreakdown})");
        }
        finally
        {
            ctx.Shutdown();
            await module.DisposeAsync();
        }
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Tick_cpu_time_measured_in_thread_cycles()
    {
        await using var svc = TelemetryService.CreateDefault(new ConsoleLog(), TimeProvider.System, new MemorySampler());
        svc.Prime(TelemetryNeeds.Api);
        await Task.Delay(600);
        svc.SampleNow(TelemetryNeeds.Api);
        double mhz;
        using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
            mhz = Convert.ToDouble(key?.GetValue("~MHz") ?? 1000, CultureInfo.InvariantCulture);
        foreach (var (name, needs) in new[] { ("full API", TelemetryNeeds.Api), ("CPU + RAM + NVML + net (typical keys)", TelemetryNeeds.Cpu | TelemetryNeeds.Memory | TelemetryNeeds.Gpu | TelemetryNeeds.Network), ("RAM only", TelemetryNeeds.Memory) })
        {
            var samples = new List<double>();
            for (var i = 0; i < 6; i++)
            {
                await Task.Delay(400);
                var us = await Task.Run(() =>
                {
                    QueryThreadCycleTime(GetCurrentThread(), out var c0);
                    svc.SampleNow(needs);
                    QueryThreadCycleTime(GetCurrentThread(), out var c1);
                    return (c1 - c0) / mhz;
                });
                samples.Add(us);
            }
            Console.WriteLine($"  CPU TIME per tick, {name}: median {Median(samples) / 1000:0.00} ms (thread cycles at {mhz:0} MHz), max {samples.Max() / 1000:0.00} ms");
        }
    }

    [DllImport("kernel32.dll")]
    private static extern bool QueryThreadCycleTime(nint thread, out ulong cycles);

    [DllImport("kernel32.dll")]
    private static extern nint GetCurrentThread();

    private static double Median(List<double> v)
    {
        var s = v.OrderBy(x => x).ToList();
        return s[s.Count / 2];
    }

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Lhm_live_probe_only_if_it_answers()
    {
        using var lhm = new LhmHttpEndpoint();
        var t0 = Stopwatch.GetTimestamp();
        var r = await lhm.ReadAsync(8085, CancellationToken.None);
        var ms = Stopwatch.GetElapsedTime(t0).TotalMilliseconds;
        Console.WriteLine($"  LHM 127.0.0.1:8085 -> {r.Outcome} {r.Detail} {r.Reading} in {ms:0} ms (LibreHardwareMonitor.exe running: {lhm.IsAppRunning()})");
        Assert.True(ms < 2000, "the short connect timeout keeps a refused probe well under the 2 s SYN-retry cost");
        if (r.Outcome != ProviderOutcome.Ok) throw new SkipException($"LHM's web server is not answering ({r.Outcome}); parsing is covered by the fixture tests.");
        Assert.InRange(r.Reading!.TempC, 10, 110);
    }

    [Test(Category = "integration")]
    public void Hwinfo_live_probe_only_if_present()
    {
        using var hw = new HwInfoSharedMemory();
        var r = hw.Read();
        Console.WriteLine($"  HWiNFO shared memory -> {r.Outcome} {r.Detail} {r.Reading}");
        if (r.Outcome != ProviderOutcome.Ok) throw new SkipException($"HWiNFO is not providing sensors ({r.Outcome}).");
        Assert.InRange(r.Reading!.TempC, 10, 110);
    }

    internal sealed class TestModuleContext : IModuleContext, IDisposable
    {
        private readonly CancellationTokenSource _cts = new();
        public ILog Log { get; } = new ConsoleLog();
        public PrismControl.Core.Data.IDataRegistry Data { get; } = new PrismControl.Core.Data.DataRegistry();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
        public IPluginEvents Events { get; } = new NoEvents();
        public IDeviceDirectory Devices { get; } = new NoDevices();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => _cts.Token;
        public string PluginDirectory => AppContext.BaseDirectory;
        public string DataDirectory => Path.Combine(Path.GetTempPath(), "prismcontrol-systeminfo-tests"); // never written by this module
        public void OpenUrl(string url) { }
        public void Shutdown() => _cts.Cancel();
        public void Dispose() => _cts.Dispose();

        private sealed class NoDevices : IDeviceDirectory
        {
            public IReadOnlyCollection<PrismControl.Core.Devices.DeviceInfo> All => [];
            public PrismControl.Core.Devices.DeviceInfo? Find(string deviceId) => null;
        }

        private sealed class NoEvents : IPluginEvents
        {
            public event EventHandler<PrismControl.Core.Devices.DeviceInfo>? DeviceConnected { add { } remove { } }
            public event EventHandler<string>? DeviceDisconnected { add { } remove { } }
            public event EventHandler? SystemWokeUp { add { } remove { } }
            public event EventHandler<string>? ApplicationLaunched { add { } remove { } }
            public event EventHandler<string>? ApplicationTerminated { add { } remove { } }
            public event EventHandler<string>? DeepLinkReceived { add { } remove { } }
            public event EventHandler? Connected { add { } remove { } }
            public event EventHandler? Disconnected { add { } remove { } }
        }
    }

    private sealed class ConsoleLog : ILog
    {
        public void Write(LogLevel level, string message, Exception? exception = null) =>
            Console.WriteLine($"    [{level}] {message}{(exception is null ? "" : " " + exception.Message)}");
        public ILog For(string category) => this;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Info;
    }
}
