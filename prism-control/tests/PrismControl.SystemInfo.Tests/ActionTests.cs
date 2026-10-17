using System.Text.Json.Nodes;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Scheduling;
using PrismControl.SystemInfo.Actions;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

/// <summary>Harness tests on Galleon and Stream Deck + placements, with a fake machine behind the real sampler.</summary>
public class ActionTests
{
    private static (FakeMachine M, TelemetryService Svc) Machine()
    {
        var m = new FakeMachine();
        return (m, m.ServiceWithHistory(45));
    }

    private static Action<Core.Hosting.ServiceRegistry> With(TelemetryService svc) => s => s.Add<ITelemetry>(svc);

    private static readonly (DeviceInfo Device, Coordinates At)[] KeyPlacements =
    [
        (TestDevices.Galleon, new(0, 0)), (TestDevices.Galleon, new(2, 3)), (TestDevices.Plus, new(1, 1)), (TestDevices.StreamDeck, new(4, 2)),
    ];

    // ------------------------------------------------------------------ keys

    [Test]
    public async Task Cpu_key_renders_at_one_hertz_in_the_background_and_press_toggles_per_core()
    {
        var (_, svc) = Machine();
        foreach (var (device, at) in KeyPlacements)
        {
            await using var h = await ActionHarness<CpuKey>.AppearAsync(device, at, configureServices: With(svc));
            Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.Cpu));
            Assert.False(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore), "no per-core counter while the history view shows");
            Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.CpuTemp), "shows the temperature by default");
            var first = h.Count("setImage");
            Assert.True(first >= 1);
            await h.AdvanceAsync(TimeSpan.FromSeconds(3));
            Assert.InRange(h.Count("setImage") - first, 2, 4, "1 Hz");
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background));

            await h.PressAsync();
            Assert.Equal(Views.Detail, h.LastSettingsAs<CpuSettings>().View);
            Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore), "the per-core view samples per-core");
            svc.SampleNow(svc.CurrentNeeds);
            await h.AdvanceAsync(TimeSpan.FromSeconds(1));
            await h.PressAsync();
            Assert.Equal(Views.History, h.LastSettingsAs<CpuSettings>().View);
            Assert.False(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore));
            Assert.DoesNotContain("<text", h.LastSvg);
            h.AssertFramesAreDeckSafe();
        }
        Assert.Equal(TelemetryNeeds.None, svc.CurrentNeeds, "every lease is released on disappear");
    }

    [Test]
    public async Task Every_key_and_metric_renders_deck_safe_on_galleon_and_plus()
    {
        var (m, svc) = Machine();
        svc.SampleNow(TelemetryNeeds.Api | TelemetryNeeds.PerCore);
        foreach (var device in new[] { TestDevices.Galleon, TestDevices.Plus })
        {
            foreach (var metric in new[] { "usage", "clock", "temp" })
                foreach (var view in new[] { Views.History, Views.Detail })
                    await RenderOnce<CpuKey>(device, new CpuSettings { Metric = metric, View = view }, svc);
            foreach (var metric in new[] { "usage", "temp", "power", "vram", "clock" })
                foreach (var gpu in new[] { "", "nvml:0", "d3d:1002:13c0:0" })
                    await RenderOnce<GpuKey>(device, new GpuSettings { Gpu = gpu, Metric = metric }, svc);
            await RenderOnce<GpuKey>(device, new GpuSettings { View = Views.Detail }, svc);
            foreach (var metric in new[] { "usage", "used" }) await RenderOnce<RamKey>(device, new RamSettings { Metric = metric }, svc);
            await RenderOnce<RamKey>(device, new RamSettings { View = Views.Detail }, svc);
            foreach (var metric in new[] { "activity", "free", "throughput" })
                foreach (var drive in new[] { "", "*", "D:", "Q:" })
                    await RenderOnce<DiskKey>(device, new DiskSettings { Drive = drive, Metric = metric }, svc);
            await RenderOnce<DiskKey>(device, new DiskSettings { View = Views.Detail }, svc);
            foreach (var metric in new[] { "both", "down", "up" })
                foreach (var units in new[] { "bytes", "bits" })
                    await RenderOnce<NetworkKey>(device, new NetworkSettings { Metric = metric, Units = units }, svc);
            await RenderOnce<NetworkKey>(device, new NetworkSettings { View = Views.Detail }, svc);
            await RenderOnce<NetworkKey>(device, new NetworkSettings { Adapter = "33333333-3333-3333-3333-333333333333" }, svc); // offline adapter
        }
        Assert.True(m.Cpu.Collects > 0);
    }

    private static async Task RenderOnce<T>(DeviceInfo device, object settings, TelemetryService svc) where T : Core.Actions.ActionBase, new()
    {
        await using var h = await ActionHarness<T>.AppearAsync(device, new Coordinates(1, 0), settings: settings, configureServices: With(svc));
        Assert.NotNull(h.LastSvg, typeof(T).Name);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Gpu_key_asks_for_pdh_engines_only_for_a_non_nvidia_gpu()
    {
        var (_, svc) = Machine();
        await using (var h = await ActionHarness<GpuKey>.AppearAsync(TestDevices.Galleon, new(1, 1), settings: new GpuSettings { Gpu = "nvml:0" }, configureServices: With(svc)))
            Assert.False(svc.CurrentNeeds.HasFlag(TelemetryNeeds.GpuEngines));
        await using (var h = await ActionHarness<GpuKey>.AppearAsync(TestDevices.Plus, new(0, 0), settings: new GpuSettings { Gpu = "d3d:1002:13c0:0" }, configureServices: With(svc)))
        {
            await h.AdvanceAsync(TimeSpan.FromSeconds(1));
            Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.GpuEngines));
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Keys_without_the_telemetry_service_say_no_data()
    {
        await using var h = await ActionHarness<CpuKey>.AppearAsync(TestDevices.Galleon);
        Assert.NotNull(h.LastSvg);
        await h.PressAsync();
        h.AssertFramesAreDeckSafe();
        await using var d = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder);
        Assert.NotNull(d.FeedbackSvg(Layouts.Canvas.Frame));
        d.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Pickers_list_gpus_drives_and_adapters()
    {
        var (_, svc) = Machine();
        await using var gpu = await ActionHarness<GpuKey>.AppearAsync(TestDevices.Galleon, configureServices: With(svc));
        var r = Assert.NotNull(await gpu.PiMessageAsync(PiOptions.Gpus, requestId: 1));
        Assert.Contains("nvml:0", r.ToJsonString());
        Assert.Contains("(integrated)", r.ToJsonString());
        await using var disk = await ActionHarness<DiskKey>.AppearAsync(TestDevices.Galleon, configureServices: With(svc));
        r = Assert.NotNull(await disk.PiMessageAsync(PiOptions.Drives, requestId: 2));
        Assert.Contains("\"value\":\"D:\"", r.ToJsonString());
        Assert.Contains("All drives", r.ToJsonString());
        await using var net = await ActionHarness<NetworkKey>.AppearAsync(TestDevices.Plus, configureServices: With(svc));
        r = Assert.NotNull(await net.PiMessageAsync(PiOptions.Adapters, requestId: 3));
        Assert.Contains("(default route)", r.ToJsonString());
        Assert.Contains("Example VPN", r.ToJsonString());
    }

    [Test]
    public async Task Pi_forms_describe_metrics_pickers_and_the_temperature_source()
    {
        var (m, svc) = Machine();
        await using var h = await ActionHarness<CpuKey>.AppearAsync(TestDevices.Galleon, configureServices: With(svc));
        var hello = Assert.NotNull(await h.PiMessageAsync("pi.ready"));
        var json = hello.ToJsonString();
        Assert.Contains("\"setting\":\"metric\"", json);
        Assert.Contains("\"setting\":\"cpuTempSource\"", json);
        Assert.Contains("never shown as the CPU", json);
        Assert.Contains("tempStatus", json);
        Assert.Contains("No CPU temperature", json, "the plain status, not a fake value");

        // A PI change of the source is plugin-wide: the sampler is reconfigured and the global section is written.
        await h.SettingsFromPropertyInspectorAsync(new CpuSettings { CpuTempSource = "hwinfo", LhmPort = 8085 });
        Assert.Equal(CpuTempSource.HWiNFO, m.Temp.Source);
        Assert.Equal("hwinfo", h.GlobalSettings.GetSection<SystemInfoGlobalSettings>(SystemInfoModule.Section).CpuTempSource);
        var configures = m.Temp.Configures;
        await h.SettingsFromPropertyInspectorAsync(new CpuSettings { CpuTempSource = "hwinfo", Metric = "clock" });
        Assert.Equal(configures, m.Temp.Configures, "unrelated edits do not reconfigure");

        foreach (var (type, setting) in new[] { (typeof(GpuKey), "gpu"), (typeof(DiskKey), "drive"), (typeof(NetworkKey), "adapter") })
        {
            JsonNode? hi = type == typeof(GpuKey) ? await Hello<GpuKey>(svc) : type == typeof(DiskKey) ? await Hello<DiskKey>(svc) : await Hello<NetworkKey>(svc);
            Assert.Contains($"\"setting\":\"{setting}\"", hi!.ToJsonString());
            Assert.Contains("optionsFrom", hi.ToJsonString());
        }
    }

    private static async Task<JsonNode?> Hello<T>(TelemetryService svc) where T : Core.Actions.ActionBase, new()
    {
        await using var h = await ActionHarness<T>.AppearAsync(TestDevices.Plus, configureServices: With(svc));
        return await h.PiMessageAsync("pi.ready");
    }

    // ------------------------------------------------------------------ views (no fake values, honest labels)

    [Test]
    public void Missing_cpu_temperature_is_a_dash_with_a_hint_never_the_igpu()
    {
        var (_, svc) = Machine();
        var f = svc.SampleNow(TelemetryNeeds.Api);
        Assert.Null(f.Cpu!.TempC);
        var usage = StatViews.Cpu(f, svc.History, "usage", showTemp: true, 40);
        Assert.Contains("—°C", usage.Sub);
        var temp = StatViews.Cpu(f, svc.History, "temp", showTemp: true, 40);
        Assert.True(temp.Value.IsMissing);
        Assert.Contains("HWiNFO", temp.Sub);
        Assert.DoesNotContain("41", temp.Value.Text, "the iGPU's 41 °C is never shown as the CPU");
        var igpu = StatViews.Gpu(f, svc.History, "d3d:1002:13c0:0", "temp", 40);
        Assert.Equal("IGPU TEMP", igpu.Label);
        Assert.Equal("41°C", igpu.Value.Text);
        Assert.Equal("GPU", StatViews.Gpu(f, svc.History, "", "usage", 40).Label);
    }

    [Test]
    public void Alerts_trigger_on_hot_parts_full_memory_and_full_disks()
    {
        var m = new FakeMachine();
        var svc = m.Service();
        m.Temp.Current = (96, "LibreHardwareMonitor");
        m.Memory.Frame = m.Memory.Frame! with { UsagePct = 93 };
        m.Gpu.Gpus[0] = m.Gpu.Gpus[0] with { TempC = 93 };
        m.Drives.Current = [new("C:", null, "NTFS", 931, 30)];
        var f = svc.SampleNow(TelemetryNeeds.Api);
        Assert.Equal(Level.Crit, StatViews.Cpu(f, svc.History, "usage", true, 40).Level);
        Assert.Equal(Level.Warn, StatViews.Ram(f, svc.History, "usage", 40).Level);
        Assert.Equal(Level.Crit, StatViews.Gpu(f, svc.History, "", "usage", 40).Level);
        Assert.Equal(Level.Crit, StatViews.Disk(f, svc.History, "C:", "free", 40).Level);
    }

    // ------------------------------------------------------------------ the system dial

    [Test]
    public async Task Dial_defaults_by_placement_so_four_make_a_galleon_dashboard()
    {
        var (_, svc) = Machine();
        var expected = new Dictionary<(int, int), string> { [(0, 0)] = "cpu", [(1, 0)] = "gpu", [(0, 1)] = "ram", [(1, 1)] = "net" };
        foreach (var ((col, row), metric) in expected)
        {
            await using var h = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Galleon, new(col, row), Controller.Encoder, configureServices: With(svc));
            Assert.Equal(metric, h.Action.Metric, $"Galleon {col},{row}");
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            Assert.Equal("setFeedbackLayout", h.Calls.First(c => c.Kind is "setFeedbackLayout" or "setFeedback").Kind, "layout before feedback");
            Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
            Assert.True(h.CallsOf("setFeedback").All(c => c.Priority == UpdatePriority.Background));
            h.AssertFramesAreDeckSafe();
        }
        for (var seg = 0; seg < 4; seg++)
        {
            await using var h = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Plus, new(seg, 0), Controller.Encoder, configureServices: With(svc));
            Assert.Equal(new[] { "cpu", "gpu", "ram", "net" }[seg], h.Action.Metric);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Dial_rotate_cycles_one_metric_per_event_and_push_toggles_detail_on_galleon()
    {
        var (_, svc) = Machine();
        await using var h = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder, configureServices: With(svc));
        Assert.Equal("cpu", h.Action.Metric);
        await h.RotateAsync(12);   // a fast Galleon spin arrives as +12: still one step
        Assert.Equal("gpu", h.LastSettingsAs<SystemDialSettings>().Metric);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal("net", h.Action.Metric);
        await h.RotateAsync(1);
        Assert.Equal("cpu", h.Action.Metric, "wraps around");
        await h.RotateAsync(-3);
        Assert.Equal("net", h.Action.Metric, "one step back, whatever the magnitude");
        await h.RotateAsync(-2);
        Assert.Equal("disk", h.Action.Metric);
        await h.RotateAsync(1);
        await h.RotateAsync(1);
        Assert.Equal("cpu", h.Action.Metric);

        await h.DialPressAsync(TimeSpan.FromSeconds(5)); // a Galleon "hold" is just a press for us
        Assert.Equal(Views.Detail, h.LastSettingsAs<SystemDialSettings>().View);
        Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore), "CPU detail = per-core bars");
        svc.SampleNow(svc.CurrentNeeds);
        foreach (var _ in SystemDial.Metrics)
        {
            await h.RotateAsync(1); // every metric's detail view
            svc.SampleNow(svc.CurrentNeeds);
            await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        }
        await h.DialPressAsync();
        Assert.Equal(Views.History, h.LastSettingsAs<SystemDialSettings>().View);
        Assert.False(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore));
        await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(10, 10)); // no touch on Galleon
        Assert.True(h.Count("setFeedback") >= 10);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Dial_on_plus_tap_does_what_push_does_and_turning_is_interactive()
    {
        var (_, svc) = Machine();
        await using var h = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder,
            settings: new SystemDialSettings { Metric = "disk" }, configureServices: With(svc));
        await h.TapAsync(100, 50);
        Assert.Equal(Views.Detail, h.LastSettingsAs<SystemDialSettings>().View);
        await h.TapAsync(100, 50, hold: true);
        Assert.Equal(Views.History, h.LastSettingsAs<SystemDialSettings>().View);
        await h.RotateAsync(-1);
        Assert.Equal("ram", h.Action.Metric);
        Assert.True(h.Channel.Interactive.Count > 0, "input marks the context interactive (served first, ≤ 30 Hz)");
        await h.AdvanceAsync(TimeSpan.FromSeconds(4));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Dial_pickers_work_from_the_property_inspector()
    {
        var (_, svc) = Machine();
        await using var h = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder, configureServices: With(svc));
        await h.PropertyInspectorAppearAsync();
        Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.Network | TelemetryNeeds.Disk | TelemetryNeeds.Gpu), "pickers get data while the PI is open");
        var r = Assert.NotNull(await h.PiMessageAsync(PiOptions.Adapters, requestId: 7));
        Assert.Contains("Ethernet", r.ToJsonString());
        await h.SettingsFromPropertyInspectorAsync(new SystemDialSettings { Metric = "net", Units = "bits", FastRefresh = true });
        Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.Fast));
        h.AssertFramesAreDeckSafe();
    }
}
