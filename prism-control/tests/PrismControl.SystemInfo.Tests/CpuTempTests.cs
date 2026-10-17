using System.Text;
using PrismControl.Core.Hosting;
using PrismControl.SystemInfo.CpuTemp;
using PrismControl.SystemInfo.Native;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

public class CpuTempTests
{
    private static byte[] Fixture() => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "lhm-data.json"));

    // ------------------------------------------------------------------ LibreHardwareMonitor

    [Test]
    public void Lhm_fixture_from_this_pc_yields_core_tctl_tdie_and_nothing_from_the_igpu()
    {
        var json = Fixture();
        var r = Assert.NotNull(LhmParser.FindCpuTemperature(json));
        Assert.Equal("Core (Tctl/Tdie)", r.SensorName);
        Assert.Equal(52.0, r.TempC);
        var all = LhmParser.CpuTemperatures(json);
        Assert.Equal("Core (Tctl/Tdie),CCD1 (Tdie)", string.Join(",", all.Select(a => a.Name)), "only the CPU's sensors");
        Assert.True(all.All(a => a.Amd));
        Assert.DoesNotContain("GPU VR SoC", string.Join(",", all.Select(a => a.Name)), "the Radeon iGPU sensor is never the CPU");
    }

    [Test]
    public void Lhm_parser_handles_intel_older_builds_locales_and_fahrenheit()
    {
        var intel = """
        {"id":0,"Text":"Sensor","Children":[{"id":1,"Text":"EXAMPLE-PC","Children":[
          {"id":2,"Text":"Example Core i9","HardwareId":"/intelcpu/0","ImageURL":"images_icon/cpu.png","Children":[
            {"id":3,"Text":"Temperatures","Children":[
              {"id":4,"Text":"CPU Core #1","Value":"61,0 °C","SensorId":"/intelcpu/0/temperature/0","Type":"Temperature","Children":[]},
              {"id":5,"Text":"Core #1 Distance to TjMax","Value":"39,0 °C","SensorId":"/intelcpu/0/temperature/9","Type":"Temperature","Children":[]},
              {"id":6,"Text":"CPU Package","Value":"149.0 °F","SensorId":"/intelcpu/0/temperature/10","Type":"Temperature","Children":[]}]},
            {"id":7,"Text":"Load","Children":[{"id":8,"Text":"CPU Total","Value":"12.5 %","SensorId":"/intelcpu/0/load/0","Type":"Load","Children":[]}]}]},
          {"id":9,"Text":"Example Graphics","HardwareId":"/gpu-intel/0","Children":[
            {"id":10,"Text":"Temperatures","Children":[{"id":11,"Text":"GPU Core","Value":"70.0 °C","SensorId":"/gpu-intel/0/temperature/0","Type":"Temperature","Children":[]}]}]}]}]}
        """u8;
        var r = Assert.NotNull(LhmParser.FindCpuTemperature(intel));
        Assert.Equal("CPU Package", r.SensorName);
        Assert.Equal(65.0, r.TempC, "149 °F");
        Assert.DoesNotContain("Distance", string.Join(",", LhmParser.CpuTemperatures(intel).Select(t => t.Name)));

        // An older build: no HardwareId / SensorId / Type; the CPU node carries the cpu icon.
        var old = """
        {"Text":"Sensor","Children":[{"Text":"EXAMPLE-PC","Children":[
          {"Text":"AMD Example 8-Core","ImageURL":"images_icon/cpu.png","Children":[
            {"Text":"Temperatures","ImageURL":"images_icon/temperature.png","Children":[{"Text":"Core (Tctl/Tdie)","Value":"48.5 °C","Children":[]}]}]},
          {"Text":"AMD Example Graphics","ImageURL":"images_icon/ati.png","Children":[
            {"Text":"Temperatures","Children":[{"Text":"GPU Core","Value":"39.0 °C","Children":[]}]}]}]}]}
        """u8;
        Assert.Equal(48.5, Assert.NotNull(LhmParser.FindCpuTemperature(old)).TempC);

        var gpuOnly = """{"Text":"Sensor","Children":[{"Text":"Example","HardwareId":"/gpu-amd/0","Children":[{"Text":"Temperatures","Children":[{"Text":"GPU VR SoC","Value":"42.0 °C","SensorId":"/gpu-amd/0/temperature/4","Type":"Temperature","Children":[]}]}]}]}"""u8;
        Assert.Null(LhmParser.FindCpuTemperature(gpuOnly), "no CPU node: no CPU temperature");
    }

    [Test]
    public void Celsius_parsing_is_strict()
    {
        Assert.True(LhmParser.TryParseCelsius("52.0 °C", out var a) && a == 52.0);
        Assert.True(LhmParser.TryParseCelsius("52,0 °C", out var b) && b == 52.0);
        Assert.True(LhmParser.TryParseCelsius("212 °F", out var c) && c == 100.0);
        Assert.False(LhmParser.TryParseCelsius("12.5 %", out _));
        Assert.False(LhmParser.TryParseCelsius("", out _));
        Assert.False(LhmParser.TryParseCelsius("999 °C", out _), "implausible values are rejected");
    }

    // ------------------------------------------------------------------ HWiNFO

    private static byte[] HwInfoBuffer() => HwInfoParser.Build(
        ["System: Example Board", "CPU [#0]: Example CPU 8-Core: Enhanced", "GPU [#0]: Example GPU"],
        [
            (HwInfoParser.TypeTemperature, 0, "Motherboard", "°C", 33),
            (HwInfoParser.TypeTemperature, 1, "CPU (Tctl/Tdie)", "°C", 63.25),
            (HwInfoParser.TypeTemperature, 1, "GPU Temperature", "°C", 41),
            (7, 1, "Total CPU Usage", "%", 17),
            (HwInfoParser.TypeTemperature, 2, "GPU Temperature", "°C", 49),
        ]);

    [Test]
    public void Hwinfo_layout_is_parsed_with_bounds_checks_and_only_cpu_sensors()
    {
        var buf = HwInfoBuffer();
        var r = Assert.NotNull(HwInfoParser.FindCpuTemperature(buf));
        Assert.Equal("CPU (Tctl/Tdie)", r.SensorName);
        Assert.Equal(63.25, r.TempC);

        Assert.Null(HwInfoParser.FindCpuTemperature(buf.AsSpan(0, buf.Length - 50), out var truncated));
        Assert.Contains("truncated", truncated);
        var dead = (byte[])buf.Clone();
        Encoding.ASCII.GetBytes("DAED").CopyTo(dead, 0);
        Assert.Null(HwInfoParser.FindCpuTemperature(dead, out var inactive));
        Assert.Contains("inactive", inactive);
        var gpuOnly = HwInfoParser.Build(["GPU [#0]: Example GPU"], [(HwInfoParser.TypeTemperature, 0, "GPU Temperature", "°C", 50)]);
        Assert.Null(HwInfoParser.FindCpuTemperature(gpuOnly), "a GPU sensor is never the CPU");
    }

    [Test]
    public unsafe void Hwinfo_reader_maps_a_named_section_read_only()
    {
        var name = $@"Local\PrismControlTest_HWiNFO_{Guid.NewGuid():N}";
        var buf = HwInfoBuffer();
        var h = Win32.CreateFileMapping(-1, 0, 0x04 /* PAGE_READWRITE */, 0, (uint)buf.Length, name);
        Assert.True(h != 0, "test mapping");
        try
        {
            var view = (byte*)Win32.MapViewOfFile(h, 0x0002 /* FILE_MAP_WRITE */, 0, 0, 0);
            buf.CopyTo(new Span<byte>(view, buf.Length));
            Win32.UnmapViewOfFile(view);
            using var reader = new HwInfoSharedMemory(name);
            var r = reader.Read();
            Assert.Equal(ProviderOutcome.Ok, r.Outcome);
            Assert.Equal(63.25, r.Reading!.TempC);
            using var absent = new HwInfoSharedMemory(name + "-absent");
            Assert.Equal(ProviderOutcome.Unreachable, absent.Read().Outcome);
        }
        finally { Win32.CloseHandle(h); }
    }

    // ------------------------------------------------------------------ the monitor (detection, backoff, honesty)

    private sealed class FakeLhm : ILhmEndpoint
    {
        public ProviderRead Next = new(ProviderOutcome.Unreachable, null, "connection refused");
        public bool Running;
        public int Reads, AppChecks;
        public Task<ProviderRead> ReadAsync(int port, CancellationToken cancellationToken) { Reads++; return Task.FromResult(Next); }
        public bool IsAppRunning() { AppChecks++; return Running; }
    }

    private sealed class FakeHwInfo : IHwInfoEndpoint
    {
        public ProviderRead Next = new(ProviderOutcome.Unreachable, null, "not running");
        public int Reads;
        public ProviderRead Read() { Reads++; return Next; }
    }

    [Test]
    public async Task Monitor_probes_only_when_wanted_and_backs_off()
    {
        var time = new ManualTimeProvider();
        var lhm = new FakeLhm();
        var hw = new FakeHwInfo();
        using var mon = new CpuTempMonitor(lhm, hw, time, NullLog.Instance);
        Assert.Null(await mon.StepAsync(CancellationToken.None), "not wanted: sleep until woken");
        Assert.Equal(0, lhm.Reads + hw.Reads);

        mon.SetWanted(true);
        var delays = new List<TimeSpan?>();
        for (var i = 0; i < 6; i++) delays.Add(await mon.StepAsync(CancellationToken.None));
        Assert.Equal("30,30,60,60,120,120", string.Join(",", delays.Select(d => d!.Value.TotalSeconds)));
        Assert.Equal(6, lhm.Reads);
        Assert.Equal(6, hw.Reads);
        Assert.Null(mon.Current);
        Assert.Contains("No CPU temperature", mon.Status.Message);
        Assert.Equal(1, lhm.AppChecks, "the process check (~20 ms) runs at most every 2 minutes");
    }

    [Test]
    public async Task Monitor_explains_a_running_lhm_with_its_web_server_off()
    {
        var lhm = new FakeLhm { Running = true };
        using var mon = new CpuTempMonitor(lhm, new FakeHwInfo(), new ManualTimeProvider(), NullLog.Instance);
        mon.SetWanted(true);
        await mon.StepAsync(CancellationToken.None);
        Assert.Contains("web server is off", mon.Status.Message);
        Assert.Contains("Remote Web Server", mon.Status.Message);
    }

    [Test]
    public async Task Monitor_uses_hwinfo_when_lhm_is_absent_and_drops_a_stale_reading()
    {
        var time = new ManualTimeProvider();
        var hw = new FakeHwInfo { Next = new(ProviderOutcome.Ok, new CpuTempReading(58, "CPU (Tctl/Tdie)")) };
        using var mon = new CpuTempMonitor(new FakeLhm(), hw, time, NullLog.Instance);
        mon.SetWanted(true);
        Assert.Equal(CpuTempMonitor.HwInfoPollInterval, await mon.StepAsync(CancellationToken.None));
        Assert.Equal((58.0, "HWiNFO"), mon.Current);
        Assert.Contains("HWiNFO", mon.Status.Message);
        time.Advance(TimeSpan.FromSeconds(11));
        Assert.Null(mon.Current, "older than 10 s: not shown");
        hw.Next = new(ProviderOutcome.Inactive, null, "inactive");
        for (var i = 0; i < 3; i++) await mon.StepAsync(CancellationToken.None);
        Assert.Contains("stopped answering", mon.Status.Message);
    }

    [Test]
    public async Task Monitor_respects_the_chosen_source_and_off()
    {
        var lhm = new FakeLhm { Next = new(ProviderOutcome.Ok, new CpuTempReading(52, "Core (Tctl/Tdie)")) };
        var hw = new FakeHwInfo();
        using var mon = new CpuTempMonitor(lhm, hw, new ManualTimeProvider(), NullLog.Instance);
        mon.SetWanted(true);
        mon.Configure(CpuTempSource.HWiNFO, 8085);
        await mon.StepAsync(CancellationToken.None);
        Assert.Equal(0, lhm.Reads, "HWiNFO only");
        Assert.Null(mon.Current);
        mon.Configure(CpuTempSource.LibreHardwareMonitor, 8086);
        await mon.StepAsync(CancellationToken.None);
        Assert.Equal((52.0, "LibreHardwareMonitor"), mon.Current);
        mon.Configure(CpuTempSource.Off, 8086);
        Assert.Null(await mon.StepAsync(CancellationToken.None));
        Assert.Null(mon.Current);
        Assert.Contains("Off", mon.Status.Message);
    }
}
