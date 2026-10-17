using System.Text.Json;
using PrismControl.Core.Data;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Sources;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

public class TelemetryTests
{
    // ------------------------------------------------------------------ history

    [Test]
    public void History_keeps_the_newest_samples_oldest_first_and_marks_gaps()
    {
        var h = new TelemetryHistory(4);
        for (var i = 1; i <= 6; i++) h.Add("x", i);
        Assert.Equal("3,4,5,6", string.Join(",", h.Last("x", 10)));
        Assert.Equal("5,6", string.Join(",", h.Last("x", 2)));
        h.MarkGap();
        h.MarkGap(); // one marker, not two
        Assert.True(double.IsNaN(h.Last("x", 1)[0]));
        Assert.Equal(4, h.Last("x", 10).Length);
        Assert.Equal(1, h.Last("x", 10).Count(double.IsNaN));
        h.Add("y", null);
        Assert.True(double.IsNaN(h.Last("y", 1)[0]), "unknown values are gaps, never zeros");
        Assert.Empty(h.Last("missing", 5));
    }

    // ------------------------------------------------------------------ formatting

    [Test]
    public void Units_are_formatted_cleanly_and_unknowns_are_a_dash()
    {
        Assert.Equal("42%", Fmt.Percent(41.6).Text);
        Assert.Equal("100%", Fmt.Percent(117).Text);
        Assert.Equal("61°C", Fmt.Temp(61.4).Text);
        Assert.Equal("5.31 GHz", Fmt.Clock(5310).Text);
        Assert.Equal("850 MHz", Fmt.Clock(850).Text);
        Assert.Equal("154 W", Fmt.Power(153.8).Text);
        Assert.Equal("7.5 W", Fmt.Power(7.5).Text);
        Assert.Equal("7.3 GiB", Fmt.MiBAsGiB(7447).Text);
        Assert.Equal("412 GiB", Fmt.GiB(412.2).Text);
        Assert.Equal("1.82 TiB", Fmt.GiB(1863).Text);
        Assert.Equal("512 B/s", Fmt.Rate(512).Text);
        Assert.Equal("12.4 KB/s", Fmt.Rate(12_400).Text);
        Assert.Equal("1.23 MB/s", Fmt.Rate(1_234_000).Text);
        Assert.Equal("124 MB/s", Fmt.Rate(124_000_000).Text);
        Assert.Equal("99.2 Mbit/s", Fmt.Rate(12_400_000, bits: true).Text, "bits spelled out: small caps would make Mb/s look like MB/s");
        Assert.Equal(("1.58", "0.35", "MB/s"), Fmt.RatePair(1_580_000, 350_000));
        Assert.Equal("1.00 MB/s", Fmt.Rate(999_600).Text, "rounds up into the next unit instead of showing 1000 KB/s");
        foreach (var r in new[] { Fmt.Percent(null), Fmt.Temp(null), Fmt.Clock(null), Fmt.Power(double.NaN), Fmt.GiB(null), Fmt.Rate(null) })
            Assert.Equal("—", r.Text);
        Assert.Equal("51.1 / 93.6 GiB", Fmt.UsedOfTotal(Fmt.GiB(51.1), Fmt.GiB(93.6)));
        Assert.Equal("5.31 GHz · 61°C", Fmt.Join("5.31 GHz", null, "61°C"));
    }

    // ------------------------------------------------------------------ parsers

    [Test]
    public void Pdh_instance_names_parse_processors_and_lettered_volumes_only()
    {
        Assert.True(InstanceNames.TryParseProcessor("0,15", out var a));
        Assert.True(InstanceNames.TryParseProcessor("1,2", out var b));
        Assert.True(b > a, "group 1 sorts after group 0");
        Assert.False(InstanceNames.TryParseProcessor("_Total", out _));
        Assert.False(InstanceNames.TryParseProcessor("0,_Total", out _));
        Assert.True(InstanceNames.IsDriveLetter("C:"));
        Assert.False(InstanceNames.IsDriveLetter("_Total"));
        Assert.False(InstanceNames.IsDriveLetter("HarddiskVolume3"));
    }

    [Test]
    public void Gpu_engine_instance_names_parse_without_allocating()
    {
        Assert.True(GpuInstanceNames.TryParseEngine("pid_1234_luid_0x00000000_0x0000D1A4_phys_0_eng_3_engtype_3D", out var luid, out var eng));
        Assert.Equal(0xD1A4L, luid);
        Assert.Equal(3, eng);
        Assert.True(GpuInstanceNames.TryParseLuid("luid_0x00000001_0x0000ABCD_phys_0", out var l2));
        Assert.Equal((1L << 32) | 0xABCD, l2);
        Assert.False(GpuInstanceNames.TryParseEngine("pid_1_luid_0xZZ", out _, out _));
        Assert.False(GpuInstanceNames.TryParseLuid("_Total", out _));
    }

    [Test]
    public void Gpu_vendors_come_from_pci_ids_then_names()
    {
        Assert.Equal("nvidia", GpuVendors.From(0x10DE, null));
        Assert.Equal("amd", GpuVendors.From(0x1002, null));
        Assert.Equal("intel", GpuVendors.From(0x8086, null));
        Assert.Equal("amd", GpuVendors.From(0, "AMD Radeon(TM) Graphics"));
        Assert.Equal("other", GpuVendors.From(0, "Example Display Adapter"));
    }

    [Test]
    public void Network_lists_real_adapters_and_totals_hardware_only()
    {
        Assert.True(NetworkMath.IsInteresting(1, 1, 6));
        Assert.False(NetworkMath.IsInteresting(2, 1, 6), "down");
        Assert.False(NetworkMath.IsInteresting(1, 2 | 1, 6), "filter shim");
        Assert.False(NetworkMath.IsInteresting(1, 0, 24), "loopback");
        Assert.True(NetworkMath.IsPlumbing("WAN Miniport (IP)"));
        Assert.True(NetworkMath.IsPlumbing("Hyper-V Virtual Switch Extension Adapter"));
        Assert.False(NetworkMath.IsPlumbing("Example 5GbE Controller"));

        var adapters = new List<NetAdapterFrame>
        {
            new() { Id = "a", Name = "Ethernet", RxBps = 100, TxBps = 10, Up = true, Hardware = true, IsDefaultRoute = true },
            new() { Id = "b", Name = "vEthernet (Example)", RxBps = 100, TxBps = 10, Up = true, Hardware = false },
            new() { Id = "c", Name = "Wi-Fi", RxBps = 5, TxBps = 1, Up = true, Hardware = true },
        };
        var (rx, tx) = NetworkMath.Totals(adapters);
        Assert.Equal(105.0, rx);
        Assert.Equal(11.0, tx);
        var virtualOnly = new List<NetAdapterFrame> { new() { Id = "v", Name = "Example VPN", RxBps = 7, TxBps = 3, Up = true, Hardware = false, IsDefaultRoute = true } };
        Assert.Equal(7.0, NetworkMath.Totals(virtualOnly).Rx);
        Assert.Null(NetworkMath.Totals([]).Rx);
    }

    // ------------------------------------------------------------------ the sampler

    [Test]
    public async Task Sampler_reads_nothing_until_a_consumer_needs_it()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        Assert.Equal(TelemetryNeeds.None, svc.CurrentNeeds);
        using (var lease = svc.Acquire(TelemetryNeeds.Memory))
        {
            Assert.Equal(TelemetryNeeds.Memory, svc.CurrentNeeds);
            lease.Update(TelemetryNeeds.Memory | TelemetryNeeds.Fast);
            Assert.Equal(TelemetryNeeds.Memory | TelemetryNeeds.Fast, svc.CurrentNeeds);
        }
        Assert.Equal(TelemetryNeeds.None, svc.CurrentNeeds, "a disposed lease stops the sampling");
    }

    [Test]
    public async Task A_tick_reads_only_the_needed_sections_and_leaves_the_rest_null()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        var f = svc.SampleNow(TelemetryNeeds.Memory);
        Assert.NotNull(f.Memory);
        Assert.Null(f.Cpu);
        Assert.Null(f.Network);
        Assert.Empty(f.Gpus);
        Assert.Empty(f.Disks);
        Assert.Equal(0, m.Cpu.Collects);
        Assert.Equal(0, m.Gpu.Reads);
        Assert.Equal(0, m.Network.Reads);

        f = svc.SampleNow(TelemetryNeeds.Cpu);
        Assert.Null(Assert.NotNull(f.Cpu).PerCorePct, "per-core only while a per-core view is visible");
        Assert.False(m.Cpu.LastPerCore);
        f = svc.SampleNow(TelemetryNeeds.Cpu | TelemetryNeeds.PerCore);
        Assert.Equal(16, Assert.NotNull(f.Cpu!.PerCorePct).Count);

        f = svc.SampleNow(TelemetryNeeds.Gpu);
        Assert.False(m.Gpu.LastEngines, "PDH GPU engines only for a non-NVIDIA GPU that is shown");
        Assert.Equal(2, f.Gpus.Count);
    }

    [Test]
    public async Task Cpu_temperature_comes_only_from_the_external_provider()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        var f = svc.SampleNow(TelemetryNeeds.Cpu | TelemetryNeeds.CpuTemp);
        Assert.Null(f.Cpu!.TempC, "no provider: null, never the iGPU's 41 °C");
        m.Temp.Current = (57.5, "LibreHardwareMonitor");
        f = svc.SampleNow(TelemetryNeeds.Cpu | TelemetryNeeds.CpuTemp);
        Assert.Equal(57.5, f.Cpu!.TempC);
        f = svc.SampleNow(TelemetryNeeds.Cpu);
        Assert.Null(f.Cpu!.TempC, "not wanted: not read");
    }

    [Test]
    public async Task Disks_merge_free_space_with_per_volume_activity()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        var f = svc.SampleNow(TelemetryNeeds.Disk);
        var c = Assert.NotNull(f.FindDisk("C:"));
        Assert.Equal(66.0, c.FreeGiB);
        Assert.Equal(865.0, c.UsedGiB);
        Assert.Near(92.9, c.UsagePct ?? 0, 0.1);
        Assert.Equal(4.0, c.ActivePct);
        Assert.Null(f.FindDisk("E:")!.ActivePct, "no PDH instance: unknown, not zero");
        Assert.Equal(3.0, f.DiskTotal!.ActivePct);
        Assert.True(m.Drives.Refreshes > 0);
    }

    [Test]
    public async Task Rate_sources_are_primed_after_a_pause_or_when_newly_needed()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        var all = TelemetryNeeds.Cpu | TelemetryNeeds.Network | TelemetryNeeds.Gpu | TelemetryNeeds.GpuEngines;
        Assert.Equal(TelemetryNeeds.Cpu | TelemetryNeeds.Network | TelemetryNeeds.Gpu | TelemetryNeeds.GpuEngines, svc.StaleNeeds(all, TelemetryService.Interval));
        svc.SampleNow(all);
        Assert.Equal(TelemetryNeeds.None, svc.StaleNeeds(all, TelemetryService.Interval));
        Assert.True(svc.StaleNeeds(all | TelemetryNeeds.PerCore, TelemetryService.Interval).HasFlag(TelemetryNeeds.PerCore), "the per-core counter is new");
        Assert.Equal(TelemetryNeeds.None, svc.StaleNeeds(TelemetryNeeds.Memory, TelemetryService.Interval), "memory is not a rate");
    }

    [Test]
    public void Snapshot_fills_known_fields_rounds_them_and_keeps_unknowns_null()
    {
        var m = new FakeMachine();
        var svc = m.Service();
        var f = svc.SampleNow(TelemetryNeeds.Api);
        var s = f.ToSnapshot();
        Assert.Equal("Example CPU 8-Core Processor", s.Cpu!.Name);
        Assert.Equal(8, s.Cpu.Cores);
        Assert.Equal(16, s.Cpu.Threads);
        Assert.Null(s.Cpu.TempC);
        Assert.Null(s.Cpu.PerCorePct);
        Assert.Equal(2, s.Gpus.Count);
        Assert.Equal("nvidia", s.Gpus[0].Vendor);
        Assert.Null(s.Gpus[1].PowerW, "D3DKMT has no reliable power reading");
        Assert.Equal(154.0, Math.Round(s.Gpus[0].PowerW!.Value));
        Assert.Equal(3, s.Disks.Count);
        Assert.Equal("C:", s.Disks[0].Name);
        Assert.Equal(2, s.Network!.Adapters.Count);
        Assert.Equal(12_400_000.0, s.Network.RxBps, "hardware adapters only");
        Assert.True(s.UptimeSec > 0);
        var json = JsonSerializer.Serialize(s, DataJsonContext.Wire.SystemSnapshot);
        Assert.Contains("\"tempC\":null", json);
        Assert.Contains("\"vendor\":\"amd\"", json);
    }

    [Test]
    public async Task Data_api_demand_starts_sampling_and_answers_the_first_request_with_real_memory()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        var registry = new DataRegistry();
        svc.AttachPublisher(registry.System.Claim("systeminfo", TimeSpan.FromSeconds(1)));
        Assert.Equal(TelemetryNeeds.None, svc.CurrentNeeds);
        var v = await registry.System.ReadAsync(CancellationToken.None); // the first request after idle
        var body = JsonDocument.Parse(Assert.NotNull(v).Body).RootElement;
        Assert.True(body.GetProperty("memory").GetProperty("totalMiB").GetDouble() > 0);
        Assert.Equal(TelemetryNeeds.Api, svc.CurrentNeeds, "while polled, the API's sections are sampled (not per-core, not 2 Hz)");
        svc.SampleNow(svc.CurrentNeeds);
        v = await registry.System.ReadAsync(CancellationToken.None);
        body = JsonDocument.Parse(v!.Body).RootElement;
        Assert.Equal(42.0, body.GetProperty("cpu").GetProperty("usagePct").GetDouble());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("cpu").GetProperty("tempC").ValueKind);
    }

    [Test]
    public async Task The_loop_samples_while_leased_and_sleeps_after()
    {
        var m = new FakeMachine();
        await using var svc = m.Service();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        svc.Start(cts.Token);
        await Task.Delay(200);
        Assert.Equal(0, m.Memory.Reads, "nothing visible: no sampling");
        using (svc.Acquire(TelemetryNeeds.Memory | TelemetryNeeds.Fast))
        {
            var f = await svc.NextFrameAsync(TimeSpan.FromSeconds(3));
            Assert.NotNull(f?.Memory);
            await Task.Delay(1100);
            Assert.InRange(m.Memory.Reads, 2, 5);
        }
        await Task.Delay(700);
        var reads = m.Memory.Reads;
        await Task.Delay(1200);
        Assert.Equal(reads, m.Memory.Reads, "no consumer: the sampler sleeps");
        Assert.True(svc.Cost.Ticks >= 2);
    }
}
