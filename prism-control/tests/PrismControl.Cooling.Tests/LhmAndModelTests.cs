using System.Text;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Lhm;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

public class LhmTests
{
    [Test]
    public void Parses_fans_controls_pump_and_cpu_temperature_from_the_fixture()
    {
        var s = LhmParser.Parse(Fixtures.LhmData(), DateTimeOffset.UnixEpoch);
        var pump = s.Single(x => x.Type == RawSensorType.Pump);
        Assert.Equal("AIO Pump", pump.Name);
        Assert.Equal(2373.0, pump.Value);
        Assert.Equal(100.0, pump.Pct);
        Assert.Equal("lhm/lpc/nct6701d/0/fan/6", pump.Id);
        Assert.True(pump.IsBoardHeader);
        Assert.Equal("ASUS ROG STRIX X870E-E GAMING WIFI", pump.Device);   // the board, not its Super I/O chip

        var cpu = s.Single(x => x.Kind == "package");
        Assert.Equal("Core (Tctl/Tdie)", cpu.Name);
        Assert.Equal(52.0, cpu.Value);

        var chassis = s.Single(x => x.Name == "Chassis Fan #1");
        Assert.Equal(0.0, chassis.Value);
        Assert.Equal(66.7, chassis.Pct);
        Assert.True(s.Any(x => x.Name == "GPU Fan 1" && x.Value == 1568 && x.Pct == 67 && !x.IsBoardHeader));
        Assert.False(s.Any(x => x.Device.Contains("EXAMPLE-PC", StringComparison.Ordinal) || x.Name == "Motherboard"), "machine node and board temps are not sensors here");
    }

    [Test]
    public void Parses_legacy_builds_without_SensorId_and_culture_formatted_values()
    {
        const string json = """
        {"id":0,"Text":"Sensor","Value":"","Children":[{"id":1,"Text":"EXAMPLE-PC","Value":"","Children":[
          {"id":2,"Text":"Example Board","HardwareId":"/motherboard","Value":"","Children":[
            {"id":3,"Text":"Fans","Value":"","Children":[{"id":4,"Text":"CPU Fan","Value":"1 234 RPM","Children":[]},{"id":5,"Text":"W_PUMP+","Value":"2100 RPM","Children":[]}]}]},
          {"id":6,"Text":"Example CPU","HardwareId":"/intelcpu/0","Value":"","Children":[
            {"id":7,"Text":"Temperatures","Value":"","Children":[{"id":8,"Text":"CPU Package","Value":"71,5 °C","Children":[]},{"id":9,"Text":"Core Average","Value":"60,0 °C","Children":[]}]}]}]}]}
        """;
        var s = LhmParser.Parse(Encoding.UTF8.GetBytes(json), DateTimeOffset.UnixEpoch);
        Assert.Equal(71.5, s.Single(x => x.Kind == "package").Value);
        Assert.Equal("CPU Package", s.Single(x => x.Kind == "package").Name);
        Assert.Equal(RawSensorType.Pump, s.Single(x => x.Name == "W_PUMP+").Type);
        Assert.Equal("lhm/motherboard/fan/cpu-fan", s.Single(x => x.Name == "CPU Fan").Id);
    }

    [Test(TimeoutMs = 15_000)]
    public async Task Provider_polls_only_while_wanted_and_backs_off_when_the_server_is_gone()
    {
        var server = new FakeLhmServer(Fixtures.LhmData());
        await using var p = new LhmProvider(options: new LhmOptions { PollInterval = TimeSpan.FromMilliseconds(100), BackoffMin = TimeSpan.FromMilliseconds(300), BackoffMax = TimeSpan.FromSeconds(1) })
        {
            Port = server.Port,
        };
        p.Start();
        await Task.Delay(300);
        Assert.Equal(ProviderState.Standby, p.Current.State);
        Assert.Equal(0, server.Requests);                      // not wanted: no traffic at all

        p.Wanted = true;
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(3), "LHM connect");
        Assert.True(p.Current.Sensors.Any(x => x.Kind == "package"));
        Assert.Contains("LibreHardwareMonitor web server", p.Current.Detail);

        await server.DisposeAsync();                            // LHM closed
        await TestUtil.Until(() => p.Current.State == ProviderState.NotRunning, TimeSpan.FromSeconds(5), "notice LHM is gone");
        Assert.Contains($"127.0.0.1:{server.Port}", p.Current.Detail);

        p.Wanted = false;
        await TestUtil.Until(() => p.Current.State == ProviderState.Standby, TimeSpan.FromSeconds(3), "standby");
    }

    [Test(TimeoutMs = 10_000)]
    public async Task A_refused_port_is_detected_quickly_off_the_tick()
    {
        // Find a free port, then nobody listens on it.
        var probe = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        probe.Start();
        var port = ((System.Net.IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        await using var p = new LhmProvider(options: new LhmOptions { BackoffMin = TimeSpan.FromSeconds(5) }) { Port = port, Wanted = true };
        var sw = System.Diagnostics.Stopwatch.StartNew();
        p.Start();
        Assert.True(sw.ElapsedMilliseconds < 100, "Start() must not block");
        await TestUtil.Until(() => p.Current.State == ProviderState.NotRunning, TimeSpan.FromSeconds(3), "refused");
        Assert.True(sw.ElapsedMilliseconds < 2500, $"detection took {sw.ElapsedMilliseconds} ms");
    }
}

public class ClassifierTests
{
    [Test]
    public void Roles_follow_names_and_devices()
    {
        Assert.Equal(CoolingRole.Unassigned, SensorClassifier.AutoRole(SensorKind.Fan, "iCUE LINK RX RGB #1: Fan", IcueProvider.LinkHubDevice));
        Assert.Equal(CoolingRole.Gpu, SensorClassifier.AutoRole(SensorKind.Fan, "Fan #1", "NVIDIA GeForce Example GPU"));
        Assert.Equal(CoolingRole.Radiator, SensorClassifier.AutoRole(SensorKind.Fan, "CPU Fan", "Example Board"));
        Assert.Equal(CoolingRole.Case, SensorClassifier.AutoRole(SensorKind.Fan, "Chassis Fan #2", "Example Board"));
        Assert.Equal(CoolingRole.Radiator, SensorClassifier.AutoRole(SensorKind.Fan, "H150i ELITE: Fan #1", "iCUE Commander", ["H150i ELITE"]));
        Assert.Equal(CoolingRole.Radiator, SensorClassifier.AutoRole(SensorKind.Fan, "Fan #2", "H150i ELITE CAPELLIX"));
        Assert.Equal(CoolingRole.Unassigned, SensorClassifier.AutoRole(SensorKind.Fan, "Fan #1", "DOMINATOR TITANIUM"), "TITANIUM memory is not a TITAN cooler");
        Assert.Equal(CoolingRole.Pump, SensorClassifier.AutoRole(SensorKind.Pump, "AIO Pump", "Example Board"));
    }

    [Test]
    public void Kinds()
    {
        Assert.Equal(SensorKind.Pump, SensorClassifier.KindOf(new RawSensor { Id = "x", Name = "AIO Pump", Type = RawSensorType.Fan }));
        Assert.Equal(SensorKind.Coolant, SensorClassifier.KindOf(new RawSensor { Id = "x", Name = "Liquid Temperature", Type = RawSensorType.Temperature }));
        Assert.Null(SensorClassifier.KindOf(new RawSensor { Id = "x", Name = "Temp #3", Type = RawSensorType.Temperature }));
    }

    [Test]
    public void Short_names()
    {
        Assert.Equal("RX RGB #1", SensorClassifier.ShortName("iCUE LINK RX RGB #1: Fan", IcueProvider.LinkHubDevice, SensorKind.Fan));
        Assert.Equal("TITAN 360 LCD", SensorClassifier.ShortName("iCUE LINK TITAN 360 LCD: Pump", IcueProvider.LinkHubDevice, SensorKind.Pump));
        Assert.Equal("GPU fan 2", SensorClassifier.ShortName("Fan #2", "NVIDIA GeForce Example GPU", SensorKind.Fan));
        Assert.Equal("Board fan 1", SensorClassifier.ShortName("Fan #1", "ASUSTeK COMPUTER INC. EXAMPLE BOARD X1", SensorKind.Fan));
        Assert.Equal("CPU package", SensorClassifier.ShortName("Package", "Example CPU", SensorKind.Cpu));
        Assert.Equal("AIO Pump", SensorClassifier.ShortName("AIO Pump", "Example Board", SensorKind.Pump));
    }

    [Test]
    public void Numbers_and_units()
    {
        Assert.Equal(1470.0, SensorClassifier.ParseNumber("1470.00"));
        Assert.Equal(2364.0, SensorClassifier.ParseNumber("2364 RPM"));
        Assert.Equal(61.1, SensorClassifier.ParseNumber("61,1 °C"));
        Assert.Null(SensorClassifier.ParseNumber(""));
        Assert.Null(SensorClassifier.ParseNumber("-"));
        Assert.True(SensorClassifier.IsFahrenheit("°F"));
        Assert.False(SensorClassifier.IsFahrenheit("°C"));
        Assert.Equal(40.0, SensorClassifier.ToCelsius(104));
    }

    [Test]
    public void Ids_are_stable_opaque_and_lowercase()
    {
        var a = SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK RX RGB #1: Fan", RawSensorType.Fan, "default");
        Assert.Equal(a, SensorClassifier.IcueId(" iCUE LINK System Hub ", "iCUE LINK RX RGB #1: Fan ", RawSensorType.Fan, "default"));
        Assert.True(System.Text.RegularExpressions.Regex.IsMatch(a, "^icue-[0-9a-f]{10}$"), a);
        Assert.NotEqual(a, SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK RX RGB #2: Fan", RawSensorType.Fan, "default"));
    }
}

public class HistoryTests
{
    [Test]
    public void Keeps_a_bounded_window_and_stats()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        Sample.Feed(svc, icue, time, 120);
        var now = svc.Current.At;
        var cpu = svc.History.Get(CoolingHistory.CpuKey, TimeSpan.FromMinutes(1), now);
        Assert.InRange(cpu.Count, 59, 61);
        var all = svc.History.Get(CoolingHistory.CpuKey, TimeSpan.FromMinutes(15), now);
        Assert.Equal(120, all.Count);
        var st = svc.History.Stats(CoolingHistory.GroupKey(FanGroup.Pump), TimeSpan.FromMinutes(5), now)!.Value;
        Assert.InRange(st.Min, 2310, 2400);
        Assert.InRange(st.Max, 2380, 2450);

        var h = new CoolingHistory(capacity: 16);
        for (var i = 0; i < 40; i++)
            h.Append(new CoolingSnapshot(DateTimeOffset.UnixEpoch.AddSeconds(i), [], new CoolingSensor { Id = "c", Source = "icue", Kind = SensorKind.Cpu, Name = "c", ShortName = "c", OriginalName = "c", Value = i }, null, [], CoolingStatus.Ok, ""));
        var pts = h.Get(CoolingHistory.CpuKey, TimeSpan.FromDays(1), DateTimeOffset.UnixEpoch.AddSeconds(40));
        Assert.Equal(16, pts.Count);
        Assert.Equal(39.0, pts[^1].Value);
    }
}
