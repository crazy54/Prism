using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using PrismControl.Cooling.Icue;
using PrismControl.Cooling.Icue.QtRo;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

public class QtRoProtocolTests
{
    [Test]
    public void Recorded_widget_definition_decodes_to_the_SensorProvider_getters_and_signals()
    {
        var def = new QVariantDecoder().ParseDefinition(new QReader(Fixtures.Definition("widget"), false));
        Assert.Equal("SensorProvider", def.TypeName);
        Assert.Equal(8, def.MethodIndex("getAllSensorIds()"));
        Assert.Equal(0, def.MethodIndex("getSensorValue(QString)"));
        Assert.True(def.SignalIndex("sensorValueChanged(QString,QString)") >= 0);
        Assert.True(def.SignalIndex("sensorAdded(QString)") >= 0);
    }

    [Test]
    public void Recorded_automation_definition_decodes_and_GetSensors_is_method_23()
    {
        var dec = new QVariantDecoder();
        var def = dec.ParseDefinition(new QReader(Fixtures.Definition("automation"), false));
        Assert.Equal("AutomationSdkIpc", def.TypeName);
        Assert.Equal(23, def.MethodIndex("GetSensors()"));
        Assert.True(def.Gadgets.Any(g => g.ClassName == "AuSdkSensor" && g.Props.Select(p => p.Name).SequenceEqual(["id", "name", "value"])));
        Assert.True(def.Methods.Count >= 40, "the automation SDK exposes ~42 methods (most of them writes we never call)");
    }

    [Test]
    public void Allowlist_contains_only_reads()
    {
        foreach (var (type, sig) in IcueSafety.All)
        {
            Assert.False(IcueSafety.LooksLikeWrite(sig), $"{type}::{sig} looks like a write");
            Assert.True(sig.StartsWith("get", StringComparison.OrdinalIgnoreCase) || sig.StartsWith("Get", StringComparison.Ordinal) || sig.StartsWith("sensorIs", StringComparison.Ordinal), sig);
        }
        Assert.Equal(10, IcueSafety.All.Count());
    }

    [Test]
    public void Every_non_allowlisted_automation_method_is_refused()
    {
        var def = new QVariantDecoder().ParseDefinition(new QReader(Fixtures.Definition("automation"), false));
        var refused = def.Methods.Where(m => !IcueSafety.IsAllowed(def.TypeName, m.Signature)).Select(m => m.Signature).ToList();
        Assert.Equal(def.Methods.Count - 2, refused.Count);
        foreach (var bad in new[] { "ActivateProfile(QString)", "ActivateCoolingPreset(QString,QString)", "notifyAppId(QString)", "DeactivateMural()", "ActivateLightingLinkEffect(AuSdkLightingLinkEffect)" })
            Assert.Contains(bad, string.Join("\n", refused));
        // Even a "getter" on the wrong replica type is refused.
        Assert.False(IcueSafety.IsAllowed("StreamDeckProvider", "getAllSensorIds()"));
    }

    [Test]
    public async Task Refused_invoke_writes_nothing_to_the_pipe()
    {
        await using var server = FakeQtRoServer.Automation();
        await using var client = await QtRoClient.ConnectAsync(server.PipeName, TimeSpan.FromSeconds(2), CancellationToken.None);
        var objects = await client.WaitObjectsAsync(TimeSpan.FromSeconds(2), CancellationToken.None);
        var def = await client.AcquireAsync(objects[0].Name, TimeSpan.FromSeconds(2), CancellationToken.None);
        var before = client.PacketsWritten;
        await Assert.ThrowsAsync<IcueSafetyException>(() => client.InvokeAsync(def, objects[0].Name, "ActivateCoolingPreset(QString,QString)", ["dev", "preset"], TimeSpan.FromSeconds(1), CancellationToken.None));
        await Assert.ThrowsAsync<IcueSafetyException>(() => client.InvokeAsync(def, objects[0].Name, "notifyAppId(QString)", ["x"], TimeSpan.FromSeconds(1), CancellationToken.None));
        Assert.Equal(before, client.PacketsWritten);
        await Task.Delay(100);
        Assert.Empty(server.Invoked);
    }

    [Test]
    public async Task Client_reads_the_widget_pipe_and_receives_signals()
    {
        await using var server = FakeQtRoServer.Widget();
        await using var client = await QtRoClient.ConnectAsync(server.PipeName, TimeSpan.FromSeconds(2), CancellationToken.None);
        var objects = await client.WaitObjectsAsync(TimeSpan.FromSeconds(2), CancellationToken.None);
        Assert.Equal("QtRO 2.0", client.ProtocolVersion);
        var def = await client.AcquireAsync("SensorProvider", TimeSpan.FromSeconds(2), CancellationToken.None);
        var ids = await client.InvokeAsync(def, "SensorProvider", "getAllSensorIds()", TimeSpan.FromSeconds(2), CancellationToken.None) as IEnumerable<string?>;
        Assert.True(ids!.Count() > 20);
        var name = await client.InvokeAsync(def, "SensorProvider", "getSensorName(QString)", ["fixture-sensor-18"], TimeSpan.FromSeconds(2), CancellationToken.None);
        Assert.Equal("iCUE LINK TITAN 360 LCD: Pump", name);
        Assert.Equal(true, await client.InvokeAsync(def, "SensorProvider", "sensorIsConnected(QString)", ["fixture-sensor-18"], TimeSpan.FromSeconds(2), CancellationToken.None));

        var got = new TaskCompletionSource<IReadOnlyList<object?>>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.SignalReceived = (_, idx, args) => { if (idx == def.SignalIndex("sensorValueChanged(QString,QString)")) got.TrySetResult(args); };
        await server.SignalAsync("sensorValueChanged(QString,QString)", "fixture-sensor-18", "2401.00");
        var sig = await got.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("2401.00", sig[1]);
        Assert.Equal(0, client.DecodeErrors);
    }

    [Test]
    public async Task Automation_GetSensors_decodes_the_gadget_vector()
    {
        await using var server = FakeQtRoServer.Automation();
        await using var client = await QtRoClient.ConnectAsync(server.PipeName, TimeSpan.FromSeconds(2), CancellationToken.None);
        await client.WaitObjectsAsync(TimeSpan.FromSeconds(2), CancellationToken.None);
        var def = await client.AcquireAsync("AutomationSdkIpc", TimeSpan.FromSeconds(2), CancellationToken.None);
        var list = (await client.InvokeAsync(def, "AutomationSdkIpc", "GetSensors()", TimeSpan.FromSeconds(2), CancellationToken.None) as IEnumerable<object?>)!.OfType<QGadget>().ToList();
        Assert.Equal(Fixtures.Sensors("automation").Count, list.Count);
        Assert.Equal("iCUE LINK TITAN 360 LCD: Pump", list[^1]["name"]);
        Assert.Equal("2389 RPM", list[^1]["value"]);
    }
}

public class IcueProviderTests
{
    private static IcueOptions Fast(Func<IEnumerable<string>> pipes) => new()
    {
        ListPipes = pipes,
        VerifyServerProcess = false,
        BackoffMin = TimeSpan.FromMilliseconds(50),
        BackoffMax = TimeSpan.FromMilliseconds(200),
        PollInterval = TimeSpan.FromMilliseconds(100),
        RefreshInterval = TimeSpan.FromMilliseconds(400),
        QuietAfter = TimeSpan.FromMilliseconds(300),
    };

    private static readonly Regex GuidRe = new(@"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-|\{|\}|fixture-sensor", RegexOptions.Compiled);

    private static void AssertOnlyReads(FakeQtRoServer server)
    {
        foreach (var (type, sig) in server.Received)
        {
            Assert.True(type is QtRoPacketType.AddObject or QtRoPacketType.InvokePacket, "unexpected packet " + type);
            if (type == QtRoPacketType.InvokePacket) Assert.True(IcueSafety.IsAllowed(server.Definition.TypeName, sig!), "non-allowlisted call " + sig);
        }
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Widget_pipe_yields_classified_cooling_sensors_with_stable_opaque_ids()
    {
        await using var server = FakeQtRoServer.Widget();
        await using var p = new IcueProvider(options: Redirect(Fast(() => ["Corsair_WB_Plugin_Sensors_x", "corsair_automation_sdk_not_used"]), server.PipeName));
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(5), "widget connect");
        var s = p.Current.Sensors;
        Assert.Equal("widget", p.ConnectedPipe);
        Assert.Equal(10 + 2 + 2, s.Count(x => x.Type == RawSensorType.Fan));   // 10 LINK + 2 board + 2 GPU (the disconnected one is dropped)
        Assert.Equal(1, s.Count(x => x.Type == RawSensorType.Pump));
        Assert.Equal("coolant", s.Single(x => x.Name.EndsWith("Coolant Temp", StringComparison.Ordinal)).Kind);
        Assert.Equal("package", s.Single(x => x.Name == "Package").Kind);
        Assert.Equal(2, s.Count(x => x.Kind == "air"));                        // QX fan probes
        Assert.False(s.Any(x => x.Name is "Temp #10" or "Temp" or "Total Power Draw" or "Load"), "non-cooling sensors are dropped");
        foreach (var x in s) Assert.False(GuidRe.IsMatch(x.Id), "id leaks iCUE's runtime id: " + x.Id);
        var pump = s.Single(x => x.Type == RawSensorType.Pump);
        Assert.Equal(2383.0, pump.Value);
        Assert.Equal(SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK TITAN 360 LCD: Pump", RawSensorType.Pump, "default"), pump.Id);

        // A push signal updates the value (~1 Hz in real iCUE).
        await server.SignalAsync("sensorValueChanged(QString,QString)", "fixture-sensor-18", "2412.00");
        await TestUtil.Until(() => p.Current.Sensors.Single(x => x.Type == RawSensorType.Pump).Value == 2412, TimeSpan.FromSeconds(3), "signal value");
        AssertOnlyReads(server);
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Reconnects_when_iCUE_restarts()
    {
        await using var server = FakeQtRoServer.Widget();
        var up = true;
        await using var p = new IcueProvider(options: Redirect(Fast(() => up ? ["Corsair_WB_Plugin_Sensors_x"] : []), server.PipeName));
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(5), "first connect");

        up = false;
        await server.DropClientAsync(stayDown: true);
        await TestUtil.Until(() => p.Current.State is ProviderState.NotRunning or ProviderState.Connecting, TimeSpan.FromSeconds(5), "notice the exit");
        Assert.Empty(p.Current.Sensors);

        server.Accepting = true;
        up = true;
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected && p.Current.Sensors.Count > 0, TimeSpan.FromSeconds(5), "reconnect");
        Assert.True(server.Connections >= 2);
        AssertOnlyReads(server);
    }

    [Test(TimeoutMs = 20_000)]
    public async Task Falls_back_to_the_automation_pipe_with_matching_LINK_ids()
    {
        await using var server = FakeQtRoServer.Automation();
        await using var p = new IcueProvider(options: new IcueOptions
        {
            ListPipes = () => [server.PipeName],
            AutomationPipe = server.PipeName,
            VerifyServerProcess = false,
            PollInterval = TimeSpan.FromMilliseconds(100),
        });
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.Connected, TimeSpan.FromSeconds(5), "automation connect");
        Assert.Equal("automation", p.ConnectedPipe);
        var s = p.Current.Sensors;
        var pump = s.Single(x => x.Type == RawSensorType.Pump);
        Assert.Equal(2389.0, pump.Value);
        // Same id as the widget pipe gives the same LINK sensor, so keys keep their binding across pipes.
        Assert.Equal(SensorClassifier.IcueId(IcueProvider.LinkHubDevice, "iCUE LINK TITAN 360 LCD: Pump", RawSensorType.Pump, "default"), pump.Id);
        Assert.Equal(61.0, s.Single(x => x.Kind == "package").Value);
        Assert.Equal(2 + 2 + 4, s.Count(x => x.Type == RawSensorType.Fan));   // board 2, GPU 2, LINK 4
        Assert.False(s.Any(x => x.Id.Contains("EXAMPLE", StringComparison.OrdinalIgnoreCase) || x.Name.Contains("serial", StringComparison.Ordinal)), "serials never leave the provider");
        Assert.Equal("GPU #2", s.First(x => x.Name == "Fan #1" && x.Device.StartsWith("GPU", StringComparison.Ordinal)).Device);
        AssertOnlyReads(server);
    }

    [Test]
    public async Task Reports_not_running_without_a_pipe()
    {
        await using var p = new IcueProvider(options: new IcueOptions { ListPipes = () => ["some_other_pipe"], BackoffMin = TimeSpan.FromMilliseconds(20) });
        p.Start();
        await TestUtil.Until(() => p.Current.State == ProviderState.NotRunning, TimeSpan.FromSeconds(3), "not running");
        Assert.Contains("not running", p.Current.Detail);
        await p.StopAsync();
        Assert.Equal(ProviderState.Off, p.Current.State);
    }

    [Test]
    public void Automation_mapping_drops_serials_and_non_cooling_sensors()
    {
        var gadgets = Fixtures.Sensors("automation").Select(n =>
        {
            var g = new QGadget { Type = "AuSdkSensor" };
            g.Fields.Add(("id", n!["id"]!.GetValue<string>()));
            g.Fields.Add(("name", n["name"]!.GetValue<string>()));
            g.Fields.Add(("value", n["value"]!.GetValue<string>()));
            return (object?)g;
        });
        var s = IcueProvider.MapAutomation(gadgets, DateTimeOffset.UnixEpoch);
        Assert.Equal(10, s.Count);   // 4 board/GPU fans, 4 LINK fans, the pump, the CPU package
        Assert.False(s.Any(x => x.Name is "FPS" or "Load" or "Temp #1" or "VCPU #1"));
        Assert.Equal("Motherboard", s.First(x => x.Name == "Fan #1").Device);
    }

    [Test]
    public void Temperature_kinds()
    {
        Assert.Equal("coolant", IcueProvider.TemperatureKind("iCUE LINK TITAN 360 LCD: Coolant Temp", IcueProvider.LinkHubDevice, "default"));
        Assert.Equal("air", IcueProvider.TemperatureKind("iCUE LINK QX RGB #1: Temp", IcueProvider.LinkHubDevice, "default"));
        Assert.Equal("package", IcueProvider.TemperatureKind("Package", "Example CPU", "package"));
        Assert.Equal("default", IcueProvider.TemperatureKind("Temp #10", "ASUSTeK EXAMPLE BOARD", "default"));
    }

    /// <summary>Test plumbing: the provider lists "Corsair_WB_Plugin_Sensors_x" but must connect to the fake's real pipe.</summary>
    private static IcueOptions Redirect(IcueOptions o, string realPipe) => new()
    {
        ListPipes = () => o.ListPipes().Select(n => n.StartsWith("Corsair_WB_Plugin_Sensors_", StringComparison.Ordinal) ? realPipe : n).ToList(),
        WidgetPipePrefix = realPipe,
        AutomationPipe = o.AutomationPipe,
        VerifyServerProcess = false,
        BackoffMin = o.BackoffMin, BackoffMax = o.BackoffMax, PollInterval = o.PollInterval, RefreshInterval = o.RefreshInterval, QuietAfter = o.QuietAfter,
        ConnectTimeout = TimeSpan.FromMilliseconds(500), CallTimeout = TimeSpan.FromSeconds(2),
    };
}
