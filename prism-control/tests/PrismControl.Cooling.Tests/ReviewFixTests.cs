using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Security.Principal;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Icue.QtRo;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

/// <summary>Regression tests for review B (wave 3): each one reproduces a finding against the code before the fix.</summary>
public class SamplerResilienceTests
{
    private static RawSensor Fan(string name, double rpm) => Sample.Fan(name, rpm);

    [Test]
    public void Natural_sort_takes_non_ascii_digits_as_text()
    {
        // Review B #1: char.IsDigit accepts U+FF11 ("１") but long.Parse rejects it.
        Assert.True(CoolingService.NaturalCompare("ファン１", "ファン２") < 0);
        Assert.True(CoolingService.NaturalCompare("ファン２", "ファン１") > 0);
        Assert.Equal(0, CoolingService.NaturalCompare("ファン１", "ファン１"));
        Assert.True(CoolingService.NaturalCompare("Fan ١", "Fan ٢") < 0, "Arabic-Indic digits");
        Assert.True(CoolingService.NaturalCompare("RX RGB #2", "RX RGB #10") < 0, "ASCII digits still sort naturally");
        Assert.NotEqual(0, CoolingService.NaturalCompare("Fan 007", "Fan 7"));
        Assert.True(CoolingService.NaturalCompare("Fan 007", "Fan 8") < 0, "leading zeros keep the numeric order");
        Assert.True(CoolingService.NaturalCompare("Fan 99999999999999999999999", "Fan 100000000000000000000000") < 0, "digit runs longer than a long");
        Assert.True(CoolingService.NaturalCompare("Fan 2", "Fan 99999999999999999999999") < 0);
    }

    [Test]
    public void Fullwidth_names_sort_in_a_sample()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        icue.Set(ProviderState.Connected, Fan("ファン２", 1400), Fan("ファン１", 1500), Fan("ＲＸ ＲＧＢ １０", 1600), Sample.Pump(2400));
        var s = svc.SampleNow();
        Assert.Equal("ファン１,ファン２,ＲＸ ＲＧＢ １０", string.Join(",", s.Sensors.Where(x => x.Kind == SensorKind.Fan).Select(x => x.Name)));
        // The user's own names go through the same sort.
        svc.SetName(s.Sensors.First(x => x.Kind == SensorKind.Fan).Id, "ラジエーター１");
        Assert.Equal(4, svc.SampleNow().Sensors.Count);
    }

    [Test]
    public void A_bad_sensor_is_skipped_not_fatal()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        var bad = new RawSensor { Id = "icue-badbadbad0", Name = null!, Type = RawSensorType.Fan, Value = 1 }; // a provider bug
        icue.Set(ProviderState.Connected, [.. Sample.Icue(), bad]);
        var s = svc.SampleNow();
        Assert.Equal(Sample.Icue().Length, s.Sensors.Count);
        Assert.Null(s.Find("icue-badbadbad0"));
        Assert.Equal(CoolingStatus.Ok, s.Status);
    }

    [Test(TimeoutMs = 20_000)]
    public async Task The_sampler_never_restarts_its_providers_over_sensor_data()
    {
        // Review B #1 end to end: the sort threw on every tick, so the loop stopped every provider and restarted (~3 s).
        var icue = new FakeProvider(IcueProvider.ProviderName);
        icue.Set(ProviderState.Connected, Fan("ファン１", 1500), Fan("ファン２", 1400), new RawSensor { Id = "icue-badbadbad0", Name = null!, Type = RawSensorType.Fan, Value = 1 });
        await using var svc = new CoolingService([icue], options: new CoolingServiceOptions { SampleInterval = TimeSpan.FromMilliseconds(50) });
        using var lease = svc.Acquire();
        await TestUtil.Until(() => svc.Current.Sensors.Count == 2, TimeSpan.FromSeconds(3), "a sample with the good sensors");
        await Task.Delay(2500);
        Assert.True(svc.IsSampling);
        Assert.Equal(1, icue.Starts);
        Assert.Equal(0, icue.Stops, "one bad sensor must never restart every provider");
    }

    [Test(TimeoutMs = 20_000)]
    public async Task A_provider_that_throws_is_isolated()
    {
        var icue = new ThrowingProvider(IcueProvider.ProviderName);
        var lhm = new FakeProvider(Lhm.LhmProvider.ProviderName);
        await using var svc = new CoolingService([icue, lhm], options: new CoolingServiceOptions { SampleInterval = TimeSpan.FromMilliseconds(50) });
        using var lease = svc.Acquire();
        await TestUtil.Until(() => svc.Current.Providers.Count == 2, TimeSpan.FromSeconds(3), "a sample despite the broken provider");
        await Task.Delay(500);
        Assert.Equal(1, lhm.Starts);
        Assert.Equal(0, lhm.Stops);
    }

    private sealed class ThrowingProvider(string name) : ICoolingProvider
    {
        public string Name { get; } = name;
        public ProviderReading Current => throw new InvalidOperationException("provider bug");
        public bool Wanted { get; set; }
        public void Start() { }
        public Task StopAsync() => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

public class QtRoHardeningTests
{
    [Test]
    public void QReader_bounds_check_cannot_overflow()
    {
        // Review B #9: _p + n overflowed for n near int.MaxValue and passed the check.
        var r = new QReader([0xFE, 0xFF, 0xFF, 0x7F, 0, 0, 0, 0], bigEndian: false);
        Assert.Throws<FormatException>(() => r.QString());
        var r2 = new QReader([0xFF, 0xFF, 0xFF, 0x7F, 1, 2], bigEndian: false);
        Assert.Throws<FormatException>(() => r2.QByteArray());
        var r3 = new QReader(new byte[16], 4, 8, bigEndian: false);
        r3.Raw(8);
        Assert.Throws<FormatException>(() => r3.U8());
    }

    private static byte[] Packet(QtRoPacketType type, Action<QWriter> payload) => QtRoPacket.Build(type, payload);

    [Test(TimeoutMs = 10_000)]
    public async Task A_huge_length_inside_a_packet_is_one_decode_error_not_a_dead_connection()
    {
        var bad = Packet(QtRoPacketType.Handshake, w => w.U32(0x7FFFFFFE));
        var good = Packet(QtRoPacketType.ObjectList, w => w.U32(1).QString("SensorProvider").QString("SensorProvider").QBytes("sig"));
        var stream = new MemoryStream([.. bad, .. good]);
        await using var client = QtRoClient.FromStream(stream);
        var objects = await client.WaitObjectsAsync(TimeSpan.FromSeconds(3), CancellationToken.None);
        Assert.Equal("SensorProvider", objects.Single().TypeName);
        await client.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(client.Completion.IsFaulted, "Completion never faults");
        Assert.Equal(1, client.DecodeErrors);
        Assert.Null(client.Fault);
    }

    [Test(TimeoutMs = 10_000)]
    public async Task Any_unexpected_read_loop_error_ends_the_connection_without_faulting()
    {
        var signal = Packet(QtRoPacketType.InvokePacket, w => w.QString("SensorProvider").S32(0).S32(4).U32(1).VariantString("x").S32(-1).S32(-1));
        await using var client = QtRoClient.FromStream(new MemoryStream(signal));
        client.SignalReceived = (_, _, _) => throw new InvalidOperationException("handler bug");
        await client.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.False(client.Completion.IsFaulted);
    }

    [Test(TimeoutMs = 10_000)]
    public async Task The_client_grants_identification_only()
    {
        // Review B #9: without TokenImpersonationLevel.Identification a squatting server could impersonate this user.
        await using var server = FakeQtRoServer.Widget();
        await using var client = await QtRoClient.ConnectAsync(server.PipeName, TimeSpan.FromSeconds(2), CancellationToken.None);
        await client.WaitObjectsAsync(TimeSpan.FromSeconds(2), CancellationToken.None);
        await client.AcquireAsync("SensorProvider", TimeSpan.FromSeconds(2), CancellationToken.None);
        Assert.Equal(TokenImpersonationLevel.Identification, server.ClientImpersonation);
    }

    [Test(TimeoutMs = 10_000)]
    public async Task The_server_is_checked_before_anything_is_read_or_written()
    {
        // Review B #9: the server check ran after the client had started its read loop on the pipe.
        await using var server = FakeQtRoServer.Widget();
        int? seen = null;
        await Assert.ThrowsAsync<IcueSafetyException>(() => QtRoClient.ConnectAsync(server.PipeName, TimeSpan.FromSeconds(2), CancellationToken.None,
            pid => { seen = pid; throw new IcueSafetyException("not iCUE"); }));
        Assert.Equal(Environment.ProcessId, seen);
        await Task.Delay(100);
        Assert.Empty(server.Received);
    }

    [Test(TimeoutMs = 10_000)]
    public async Task The_provider_refuses_a_pipe_that_iCUE_does_not_serve()
    {
        await using var server = FakeQtRoServer.Widget();
        await using var p = new IcueProvider(options: new IcueOptions { ListPipes = () => [server.PipeName], WidgetPipePrefix = server.PipeName, VerifyServerProcess = true });
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.Error, TimeSpan.FromSeconds(5), "refused");
        Assert.Contains("not iCUE", p.Current.Detail);
        await Task.Delay(200);
        Assert.Empty(server.Received);
        Assert.Equal(1, server.Connections, "an untrusted pipe is left alone (10 min), not hammered");
    }
}

public class PipeChoiceTests
{
    private static string Prefix() => $"PCWidgetTest_{Environment.ProcessId}_{Guid.NewGuid():N}_"[..40];

    private static IcueOptions Options(Func<IEnumerable<string>> pipes, string prefix, string automation = "corsair_automation_sdk") => new()
    {
        ListPipes = pipes,
        WidgetPipePrefix = prefix,
        AutomationPipe = automation,
        VerifyServerProcess = false,
        BackoffMin = TimeSpan.FromMilliseconds(50),
        BackoffMax = TimeSpan.FromMilliseconds(400),
        PollInterval = TimeSpan.FromMilliseconds(100),
        RefreshInterval = TimeSpan.FromMilliseconds(400),
        QuietAfter = TimeSpan.FromMilliseconds(300),
        ConnectTimeout = TimeSpan.FromMilliseconds(500),
        CallTimeout = TimeSpan.FromMilliseconds(400),
    };

    [Test(TimeoutMs = 20_000)]
    public async Task A_squatted_pipe_name_that_sorts_first_does_not_block_iCUE()
    {
        // Review B #9: "Corsair_WB_Plugin_Sensors_0" sorted first and was retried forever.
        var prefix = Prefix();
        await using var squatter = new SilentPipeServer(prefix + "0");
        await using var server = FakeQtRoServer.Widget(pipeName: prefix + "e180fbb8");
        await using var p = new IcueProvider(options: Options(() => [squatter.PipeName, server.PipeName], prefix));
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(6), "the real pipe after the squatter");
        Assert.Equal("widget", p.ConnectedPipe);
        Assert.Equal(1, squatter.Connections);
        await server.DropClientAsync();
        await TestUtil.Until(() => server.Connections >= 2 && p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(6), "reconnect");
        Assert.Equal(1, squatter.Connections, "the failed name is remembered, not retried first again");
    }

    [Test(TimeoutMs = 25_000)]
    public async Task Upgrades_from_the_automation_pipe_when_the_widget_pipe_appears_and_keeps_ids()
    {
        var prefix = Prefix();
        await using var automation = FakeQtRoServer.Automation();
        await using var widget = FakeQtRoServer.Widget(pipeName: prefix + "e180fbb8");
        var widgetUp = false;
        var icue = new IcueProvider(options: Options(() => widgetUp ? [automation.PipeName, widget.PipeName] : [automation.PipeName], prefix, automation.PipeName));
        await using var svc = new CoolingService([icue], new TestGlobalSettings(), options: new CoolingServiceOptions { AutoSample = false });
        icue.Start();
        await TestUtil.Until(() => icue.ConnectedPipe == "automation" && icue.Current.Sensors.Count > 0, TimeSpan.FromSeconds(5), "automation first (iCUE starting)");
        var before = svc.SampleNow();
        var cpuId = before.Cpu!.Id;
        var boardFan = before.Sensors.First(x => x.Kind == SensorKind.Fan && x.Device == "Motherboard");
        svc.SetName(boardFan.Id, "Header 1");
        svc.SetRole(boardFan.Id, "ignore");

        widgetUp = true;
        await TestUtil.Until(() => icue.ConnectedPipe == "widget" && icue.Current.Sensors.Count > 0, TimeSpan.FromSeconds(6), "upgrade to the widget pipe");
        var after = svc.SampleNow();
        Assert.True(after.Sensors.Any(x => x.Kind == SensorKind.Coolant), "the widget pipe's coolant probe is there");
        foreach (var s in before.Sensors)
            Assert.NotNull(after.Find(s.Id), $"{s.OriginalName} ({s.Device}) is still found by its automation-pipe id");
        Assert.Equal(after.Cpu!.Id, after.Find(cpuId)!.Id);
        var fan = after.Find(boardFan.Id)!;
        Assert.Equal("Header 1", fan.Name, "the user's name follows the sensor");
        Assert.Equal(CoolingRole.Ignore, fan.Role);
        Assert.Equal("Header 1", svc.CustomName(fan.Id));
    }

    [Test(TimeoutMs = 25_000)]
    public async Task Falling_back_to_the_automation_pipe_keeps_the_widget_ids()
    {
        var prefix = Prefix();
        await using var automation = FakeQtRoServer.Automation();
        await using var widget = FakeQtRoServer.Widget(pipeName: prefix + "e180fbb8");
        var widgetUp = true;
        await using var icue = new IcueProvider(options: Options(() => widgetUp ? [automation.PipeName, widget.PipeName] : [automation.PipeName], prefix, automation.PipeName));
        icue.Start();
        await TestUtil.Until(() => icue.ConnectedPipe == "widget" && icue.Current.Sensors.Count > 0, TimeSpan.FromSeconds(5), "widget");
        var widgetIds = icue.Current.Sensors.ToDictionary(s => s.Id);

        widgetUp = false;
        await widget.DropClientAsync(stayDown: true);
        await TestUtil.Until(() => icue.ConnectedPipe == "automation" && icue.Current.Sensors.Count > 0, TimeSpan.FromSeconds(6), "fallback");
        foreach (var s in icue.Current.Sensors)
            Assert.True(widgetIds.ContainsKey(s.Id), $"{s.Name} keeps its widget-pipe id ({s.Id})");
    }
}

public class RenameTests
{
    [Test(TimeoutMs = 20_000)]
    public async Task A_device_renamed_in_iCUE_keeps_its_names_roles_and_keys()
    {
        var names = new ConcurrentDictionary<string, string>();
        await using var server = FakeQtRoServer.Widget(names: names);
        var icue = new IcueProvider(options: new IcueOptions
        {
            ListPipes = () => [server.PipeName], WidgetPipePrefix = server.PipeName, VerifyServerProcess = false,
            PollInterval = TimeSpan.FromMilliseconds(100), RefreshInterval = TimeSpan.FromMilliseconds(300), QuietAfter = TimeSpan.FromMilliseconds(300),
        });
        var globals = new TestGlobalSettings();
        await using var svc = new CoolingService([icue], globals, options: new CoolingServiceOptions { AutoSample = false });
        icue.Start();
        await TestUtil.Until(() => icue.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(5), "connect");
        var rx1 = svc.SampleNow().Sensors.Single(s => s.OriginalName == "iCUE LINK RX RGB #1: Fan");
        svc.SetName(rx1.Id, "Top front");
        svc.SetRole(rx1.Id, "radiator");

        // The user renames the fan in iCUE: same sensor, new name (iCUE signals sensorDataChanged, or we notice on refresh).
        names["fixture-sensor-14"] = "Top intake RX: Fan";
        await server.SignalAsync("sensorDataChanged(QString)", "fixture-sensor-14");
        await TestUtil.Until(() => icue.Current.Sensors.Any(s => s.Name == "Top intake RX: Fan"), TimeSpan.FromSeconds(5), "the new name");
        var snap = svc.SampleNow();
        var renamed = snap.Sensors.Single(s => s.OriginalName == "Top intake RX: Fan");
        Assert.Equal("Top front", renamed.Name, "the shared name follows the sensor");
        Assert.Equal(CoolingRole.Radiator, renamed.Role);
        Assert.Equal(renamed.Id, snap.Find(rx1.Id)?.Id, "keys bound to the old id still find it");
        var saved = globals.GetSection<CoolingGlobalSettings>(CoolingService.SettingsSection);
        Assert.Equal("Top front", saved.Names[renamed.Id]);

        // A rename without a signal is noticed on the periodic refresh.
        names["fixture-sensor-18"] = "Loop pump: Pump";
        var pumpId = snap.Sensors.Single(s => s.Kind == SensorKind.Pump).Id;
        await TestUtil.Until(() => icue.Current.Sensors.Any(s => s.Name == "Loop pump: Pump"), TimeSpan.FromSeconds(5), "refresh");
        Assert.NotNull(svc.SampleNow().Find(pumpId));
    }
}

public class CpuTemperatureSourceTests
{
    [Test]
    public void Cooling_shares_its_cpu_temperature_and_a_read_is_demand()
    {
        var (svc, icue, lhm, time, _) = Sample.Service();
        ICpuTemperatureSource src = svc;
        Assert.False(svc.IsDemanded);
        Assert.Null(src.Latest, "nothing sampled yet");
        Assert.True(svc.IsDemanded, "a consumer reading the shared temperature keeps the sampler running");

        icue.Set(ProviderState.Connected, Sample.Icue());
        var snap = svc.SampleNow();
        var r = src.Latest ?? throw new AssertException("no shared reading");
        Assert.Equal(CpuTemperature.Icue, r.Source);
        Assert.Equal(snap.Cpu!.Value!.Value, r.TempC);
        Assert.Equal(snap.Cpu.UpdatedAt ?? snap.At, r.At);

        svc.SetCpuTempSource("lhm");
        lhm.Set(ProviderState.Connected, new RawSensor { Id = "lhm/amdcpu/0/temperature/2", Name = "Core (Tctl/Tdie)", Type = RawSensorType.Temperature, Kind = "package", Value = 57.25, UpdatedAt = time.GetUtcNow() });
        svc.SampleNow();
        Assert.Equal((57.25, CpuTemperature.Lhm), (src.Latest!.Value.TempC, src.Latest!.Value.Source));
        svc.SetCpuTempSource("off");
        svc.SampleNow();
        Assert.Null(src.Latest, "the user turned it off");

        time.Advance(TimeSpan.FromSeconds(30));
        Assert.False(svc.IsDemanded, "demand lapses when nobody reads it");
    }

    [Test]
    public async Task Module_registers_the_shared_cpu_temperature()
    {
        using var ctx = new TestModuleContext();
        var module = new CoolingModule();
        module.Initialize(ctx);
        try
        {
            Assert.True(ctx.Services.TryGet<ICpuTemperatureSource>(out var src));
            Assert.True(ReferenceEquals(ctx.Services.Get<CoolingService>(), src));
        }
        finally { await module.DisposeAsync(); }
    }

    [Test]
    public async Task Module_unsubscribes_its_handlers_on_dispose()
    {
        var globals = new CountingGlobalSettings();
        using var ctx = new TestModuleContext(globals);
        var module = new CoolingModule();
        module.Initialize(ctx);
        Assert.Equal(1, globals.Subscribers);
        await module.DisposeAsync();
        Assert.Equal(0, globals.Subscribers);
    }
}
