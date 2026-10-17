using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Cooling.Api;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Lhm;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

/// <summary>
/// Read-only probes against the real PC. They skip cleanly when iCUE / LibreHardwareMonitor are not running.
/// Nothing here writes to iCUE: the client only sends AddObject and allowlisted getters (enforced in QtRoClient).
/// </summary>
public class IntegrationTests
{
    private static bool IcuePresent() => IcueOptions.DefaultListPipes().Any(p =>
        p.StartsWith("Corsair_WB_Plugin_Sensors_", StringComparison.OrdinalIgnoreCase) || p.Equals("corsair_automation_sdk", StringComparison.OrdinalIgnoreCase));

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Reads_live_iCUE_sensors_read_only()
    {
        if (!IcuePresent()) Assert.Skip("iCUE is not running (no sensor pipe)");
        await using var p = new IcueProvider();   // production options: the pipe must be served by iCUE
        p.Start();
        await TestUtil.Until(() => p.Current.State is ProviderState.Connected or ProviderState.Error, TimeSpan.FromSeconds(10), "iCUE connect");
        Assert.Equal(ProviderState.Connected, p.Current.State, p.Current.Detail);
        await Task.Delay(1500); // a couple of value signals
        var s = p.Current.Sensors;
        var fans = s.Where(x => x.Type == RawSensorType.Fan).ToList();
        var pumps = s.Where(x => x.Type == RawSensorType.Pump).ToList();
        Console.WriteLine($"     live iCUE via {p.ConnectedPipe} pipe: {fans.Count} fans, {pumps.Count} pumps, " +
            $"{s.Count(x => x.Kind == "coolant")} coolant, {s.Count(x => x.Kind == "package")} CPU package, {s.Count(x => x.Kind == "air")} air probes");
        foreach (var x in s.Where(x => x.Type != RawSensorType.Fan || x.Name.Contains("LINK", StringComparison.Ordinal)).Take(8))
            Console.WriteLine($"       {x.Name,-40} {x.Value,8} {(x.Type == RawSensorType.Temperature ? "°C" : "RPM")}");
        Assert.True(fans.Count + pumps.Count > 0, "iCUE reports no fans or pumps");
        foreach (var x in s)
        {
            Assert.True(Regex.IsMatch(x.Id, "^icue-[0-9a-f]{10}(-[0-9]+)?$"), "opaque id: " + x.Id);
            if (x.Value is { } v)
            {
                if (x.Type == RawSensorType.Temperature) Assert.InRange(v, -20, 130);
                else Assert.InRange(v, 0, 12_000);
            }
        }
        await p.StopAsync();
        Assert.Equal(ProviderState.Off, p.Current.State);
    }

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Reads_live_LibreHardwareMonitor_when_its_web_server_is_on()
    {
        using (var tcp = new TcpClient())
        {
            try { await tcp.ConnectAsync("127.0.0.1", LhmOptions.DefaultPort).WaitAsync(TimeSpan.FromMilliseconds(500)); }
            catch (Exception) { Assert.Skip("LibreHardwareMonitor's web server is off (127.0.0.1:8085)"); }
        }
        await using var p = new LhmProvider { Wanted = true };
        p.Start();
        await TestUtil.Until(() => p.Current.State is ProviderState.Connected or ProviderState.NotRunning, TimeSpan.FromSeconds(8), "LHM");
        Assert.Equal(ProviderState.Connected, p.Current.State, p.Current.Detail);
        var cpu = p.Current.Sensors.FirstOrDefault(x => x.Kind == "package");
        Console.WriteLine($"     live LHM: {p.Current.Sensors.Count} sensors, CPU {cpu?.Name} {cpu?.Value} °C");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Module_shares_iCUEs_live_cpu_package_temperature()
    {
        // What SystemInfo reads for /v1/system cpu.tempC when LibreHardwareMonitor and HWiNFO are absent.
        if (!IcuePresent()) Assert.Skip("iCUE is not running (no sensor pipe)");
        using var ctx = new TestModuleContext();
        var module = new CoolingModule();
        module.Initialize(ctx);
        try
        {
            Core.Data.CpuTemperatureReading? r = null;
            var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(15);
            while (r is null && DateTime.UtcNow < deadline)
            {
                r = Core.Data.CpuTemperature.ReadShared(ctx.Services, DateTimeOffset.UtcNow); // a read is demand: sampling starts
                if (r is null) await Task.Delay(250);
            }
            var reading = r ?? throw new SkipException("iCUE reports no CPU package sensor on this PC");
            Console.WriteLine($"     shared CPU temperature: {reading.TempC} °C from {reading.Source}, {(DateTimeOffset.UtcNow - reading.At).TotalSeconds:0.0} s old");
            Assert.Equal(Core.Data.CpuTemperature.Icue, reading.Source);
            Assert.InRange(reading.TempC, 10, 115);
        }
        finally { await module.DisposeAsync(); }
    }

    [Test(Category = "integration", TimeoutMs = 40_000)]
    public async Task Module_serves_live_cooling_data_on_v1_cooling()
    {
        if (!IcuePresent()) Assert.Skip("iCUE is not running (no sensor pipe)");
        using var ctx = new TestModuleContext();
        var module = new CoolingModule();
        module.Initialize(ctx);
        try
        {
            var topic = ctx.Data.Find(CoolingApi.Path)!;
            JsonObject? data = null;
            var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(20);
            while (DateTime.UtcNow < deadline)
            {
                var v = await topic.ReadAsync(CancellationToken.None);   // a poll = demand: sampling starts
                if (v is not null)
                {
                    data = JsonNode.Parse(v.Body)!.AsObject();
                    if (data["sensors"]!.AsArray().Any(s => s!["rpm"] is not null)) break;
                }
                await Task.Delay(500);
            }
            Assert.NotNull(data, "no payload");
            Console.WriteLine($"     /v1/cooling: status {data!["status"]}, \"{data["statusText"]}\", cpu {data["cpu"]?["tempC"]} ({data["cpu"]?["source"]}), coolant {data["coolant"]?["tempC"]}");
            Assert.True(data["status"]!.GetValue<string>() is "ok" or "partial", data["statusText"]!.ToString());
            Assert.Equal(6, data["groups"]!.AsArray().Count);
            Assert.True(ctx.Services.Get<CoolingService>().IsSampling);
        }
        finally { await module.DisposeAsync(); }
    }
}
