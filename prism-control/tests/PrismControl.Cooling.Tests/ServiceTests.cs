using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Cooling.Api;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Lhm;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

public class ServiceTests
{
    private static RawSensor LhmFan(string name, double rpm, int index) => new()
    {
        Id = $"lhm/lpc/nct6701d/0/fan/{index}", Name = name, Device = "Example Board", Type = name.Contains("Pump") ? RawSensorType.Pump : RawSensorType.Fan,
        Value = rpm, IsBoardHeader = true,
    };

    private static RawSensor LhmCpu(double c) => new() { Id = "lhm/amdcpu/0/temperature/2", Name = "Core (Tctl/Tdie)", Device = "Example CPU", Type = RawSensorType.Temperature, Kind = "package", Value = c };

    [Test]
    public void iCUE_sensors_are_classified_and_grouped()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        icue.Set(ProviderState.Connected, Sample.Icue());
        var s = svc.SampleNow();
        Assert.Equal(CoolingStatus.Ok, s.Status);
        Assert.Equal("icue", s.Cpu!.Source);
        Assert.Equal(SensorKind.Coolant, s.Coolant!.Kind);
        Assert.Equal(10, s.Group(FanGroup.Unassigned).Count);          // LINK fans can't be placed automatically
        Assert.Equal(0, s.Group(FanGroup.Radiator).Count);
        Assert.Equal(FanGroup.AllFans, s.DefaultFanGroup);
        Assert.Equal(1, s.Group(FanGroup.Gpu).Count);
        Assert.Equal(1, s.Group(FanGroup.Pump).Count);
        Assert.Equal(10, s.Group(FanGroup.AllFans).Count);              // GPU fans are not in "all fans"
        Assert.Contains("iCUE connected · ", s.StatusText);
        Assert.Equal(SensorKind.Cpu, s.Sensors[0].Kind);                // CPU, coolant, pump, fans by role, then natural name order
        Assert.Equal(SensorKind.Coolant, s.Sensors[1].Kind);
        Assert.Equal(SensorKind.Pump, s.Sensors[2].Kind);
        Assert.Equal("QX RGB #1,QX RGB #2,QX RGB #3,QX RGB #4,RX RGB #1", string.Join(",", s.Sensors.Where(x => x.Kind == SensorKind.Fan).Take(5).Select(x => x.Name)));
        Assert.Equal("GPU fan 1", s.Sensors.Last(x => x.Kind == SensorKind.Fan).Name);
        Assert.True(CoolingService.NaturalCompare("RX RGB #2", "RX RGB #10") < 0);
    }

    [Test]
    public void Roles_and_names_are_shared_and_saved_to_the_cooling_section()
    {
        var (svc, icue, _, _, globals) = Sample.Service();
        icue.Set(ProviderState.Connected, Sample.Icue());
        var first = svc.SampleNow();
        var rx = first.Sensors.Where(x => x.Name.StartsWith("RX RGB", StringComparison.Ordinal)).Take(3).ToList();
        foreach (var f in rx) svc.SetRole(f.Id, "radiator");
        svc.SetName(rx[0].Id, "Rad top");
        var s = svc.SampleNow();
        Assert.Equal(3, s.Group(FanGroup.Radiator).Count);
        Assert.Equal(FanGroup.Radiator, s.DefaultFanGroup);
        Assert.Equal("Rad top", s.Find(rx[0].Id)!.Name);
        Assert.True(s.Find(rx[0].Id)!.RoleIsUser);
        var saved = globals.GetSection<CoolingGlobalSettings>(CoolingService.SettingsSection);
        Assert.Equal("radiator", saved.Roles[rx[1].Id]);
        Assert.Equal("Rad top", saved.Names[rx[0].Id]);

        svc.SetRole(rx[2].Id, "auto");
        svc.SetName(rx[0].Id, "  ");
        s = svc.SampleNow();
        Assert.Equal(2, s.Group(FanGroup.Radiator).Count);
        Assert.Equal("RX RGB #1", s.Find(rx[0].Id)!.Name);
        Assert.False(globals.GetSection<CoolingGlobalSettings>(CoolingService.SettingsSection).Names.ContainsKey(rx[0].Id));

        // A second service (another plugin start) picks the saved roles up.
        var again = new CoolingService([icue], globals, options: new CoolingServiceOptions { AutoSample = false }).SampleNow();
        Assert.Equal(2, again.Group(FanGroup.Radiator).Count);
    }

    [Test]
    public void LHM_is_the_fallback_for_fans_and_only_supplies_CPU_temperature_while_iCUE_is_connected()
    {
        var (svc, icue, lhm, time, _) = Sample.Service();
        icue.Set(ProviderState.Connected, Sample.Icue());
        lhm.Set(ProviderState.Connected, LhmFan("AIO Pump", 2368, 6), LhmFan("Chassis Fan #1", 0, 0), LhmCpu(58.2));
        var s = svc.SampleNow();
        Assert.False(lhm.Wanted, "iCUE has fans and a CPU package temperature: LHM is not polled");
        Assert.False(s.Sensors.Any(x => x.Source == "lhm" && x.IsRpm), "no duplicate pump from the motherboard header");
        Assert.Equal("icue", s.Cpu!.Source);

        svc.SetCpuTempSource("lhm");
        s = svc.SampleNow();
        Assert.True(lhm.Wanted);
        Assert.Equal("lhm", s.Cpu!.Source);
        Assert.Equal(58.2, s.Cpu.Value);
        Assert.Contains("CPU via LHM", s.StatusText);

        svc.SetCpuTempSource("off");
        Assert.Null(svc.SampleNow().Cpu);
        svc.SetCpuTempSource("auto");

        // iCUE goes away: after its head start, LHM's fans, pump and CPU take over.
        icue.Set(ProviderState.NotRunning);
        svc.SampleNow();
        time.Advance(CoolingService.IcueHeadStart);
        s = svc.SampleNow();
        Assert.True(lhm.Wanted);
        Assert.Equal(1, s.Group(FanGroup.Pump).Count);
        Assert.Equal("lhm", s.Cpu!.Source);
        Assert.Equal(CoolingStatus.Ok, s.Status);
        Assert.Contains("iCUE not running", s.StatusText);
        // The never-spinning chassis header has no fan on it: it is not connected and not in any group.
        Assert.False(s.Find("lhm/lpc/nct6701d/0/fan/0")!.Connected);
        Assert.Equal(0, s.Group(FanGroup.Case).Count);

        lhm.Set(ProviderState.Connected, LhmFan("AIO Pump", 2368, 6), LhmFan("Chassis Fan #1", 900, 0), LhmCpu(58.2));
        s = svc.SampleNow();
        Assert.Equal(1, s.Group(FanGroup.Case).Count);

        svc.SetUseLhm(false);
        s = svc.SampleNow();
        Assert.False(lhm.Wanted);
        Assert.Equal(ProviderState.Disabled, s.Providers.Single(p => p.Name == "lhm").State);
        Assert.Equal(CoolingStatus.Unavailable, s.Status);
    }

    [Test]
    public void LHM_waits_for_iCUE_to_have_its_chance()
    {
        var (svc, icue, lhm, time, _) = Sample.Service();
        icue.Set(ProviderState.Connecting);
        svc.SampleNow();
        Assert.False(lhm.Wanted);
        time.Advance(TimeSpan.FromSeconds(2));
        svc.SampleNow();
        Assert.False(lhm.Wanted);
        time.Advance(CoolingService.IcueHeadStart);
        svc.SampleNow();
        Assert.True(lhm.Wanted);
    }

    [Test(TimeoutMs = 15_000)]
    public async Task Samples_only_while_something_consumes_it()
    {
        var icue = new FakeProvider(IcueProvider.ProviderName);
        icue.Set(ProviderState.Connected, Sample.Icue());
        var stopped = 0;
        await using var svc = new CoolingService([icue], options: new CoolingServiceOptions { SampleInterval = TimeSpan.FromMilliseconds(50), IdleGrace = TimeSpan.FromMilliseconds(200) });
        svc.Stopped += () => Interlocked.Increment(ref stopped);
        await Task.Delay(200);
        Assert.False(svc.IsSampling);
        Assert.Equal(0, icue.Starts);

        var lease = svc.Acquire();
        await TestUtil.Until(() => svc.IsSampling && svc.Current.Sensors.Count > 0, TimeSpan.FromSeconds(3), "sampling");
        Assert.True(icue.Running);
        var lease2 = svc.Acquire();
        lease.Dispose();
        lease.Dispose(); // idempotent
        await Task.Delay(400);
        Assert.True(svc.IsSampling, "one consumer is left");
        lease2.Dispose();
        await TestUtil.Until(() => !svc.IsSampling, TimeSpan.FromSeconds(3), "stop after the grace period");
        Assert.False(icue.Running);
        Assert.Equal(1, Volatile.Read(ref stopped));
        Assert.Equal(CoolingStatus.Idle, svc.Current.Status);

        // A data-API style demand source wakes it too.
        var demanded = true;
        svc.AddDemand(() => demanded);
        svc.Wake();
        await TestUtil.Until(() => svc.IsSampling, TimeSpan.FromSeconds(3), "demand");
        demanded = false;
        await TestUtil.Until(() => !svc.IsSampling, TimeSpan.FromSeconds(3), "demand ended");
    }
}

public class ApiTests
{
    [Test]
    public void Payload_matches_the_wire_conventions()
    {
        var (svc, icue, lhm, _, _) = Sample.Service();
        icue.Set(ProviderState.Connected, Sample.Icue());
        lhm.Set(ProviderState.Standby);
        var snap = svc.SampleNow();
        var json = JsonSerializer.Serialize(CoolingApi.Map(snap), CoolingJsonContext.Wire.CoolingPayload);
        var o = JsonNode.Parse(json)!.AsObject();
        foreach (var key in new[] { "status", "statusText", "sampledAt", "cpu", "coolant", "groups", "sensors", "providers" }) Assert.True(o.ContainsKey(key), key);
        Assert.Equal("ok", o["status"]!.GetValue<string>());
        Assert.True(Regex.IsMatch(o["sampledAt"]!.GetValue<string>(), @"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$"), "UTC ms timestamp");
        Assert.Equal(6, o["groups"]!.AsArray().Count);
        Assert.Equal("radiator", o["groups"]![0]!["group"]!.GetValue<string>());
        Assert.Equal("allFans", o["groups"]![3]!["group"]!.GetValue<string>());
        Assert.True(o["groups"]![0]!.AsObject().ContainsKey("avgRpm") && o["groups"]![0]!["avgRpm"] is null, "nulls are written");
        var fan = o["sensors"]!.AsArray().First(s => s!["kind"]!.GetValue<string>() == "fan")!.AsObject();
        foreach (var key in new[] { "id", "kind", "role", "roleSource", "name", "originalName", "customName", "device", "source", "rpm", "pct", "tempC", "connected", "updatedAt" })
            Assert.True(fan.ContainsKey(key), "sensor." + key);
        Assert.Null(fan["tempC"]);
        Assert.Equal("unassigned", fan["role"]!.GetValue<string>());
        Assert.Equal("icue", o["cpu"]!["source"]!.GetValue<string>());
        Assert.Equal("standby", o["providers"]![1]!["state"]!.GetValue<string>());
        Assert.DoesNotContain("\\u", json);                          // no HTML-safe escaping
        Assert.False(Regex.IsMatch(json, @"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}"), "no GUIDs on the wire");
    }

    [Test]
    public async Task Module_registers_the_service_and_the_endpoint_without_sampling()
    {
        using var ctx = new TestModuleContext();
        var module = new CoolingModule();
        module.Initialize(ctx);
        try
        {
            Assert.True(ctx.Services.TryGet<CoolingService>(out var svc));
            var topic = ctx.Data.Find(CoolingApi.Path);
            Assert.NotNull(topic);
            Assert.Equal("cooling", topic!.Source);
            Assert.Equal(TimeSpan.FromSeconds(1), topic.Cadence);
            await Task.Delay(100);
            Assert.False(svc.IsSampling, "nothing consumes cooling data yet, so nothing is read");
        }
        finally { await module.DisposeAsync(); }
    }
}
