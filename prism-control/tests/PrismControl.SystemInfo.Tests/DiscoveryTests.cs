using System.Reflection;
using System.Text.RegularExpressions;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.SystemInfo.Actions;
using PrismControl.SystemInfo.Telemetry;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

public class DiscoveryTests
{
    private static List<(Type Type, StreamDeckActionAttribute Attr)> Actions() =>
        typeof(SystemInfoModule).Assembly.GetTypes()
            .Select(t => (t, t.GetCustomAttribute<StreamDeckActionAttribute>()))
            .Where(x => x.Item2 is not null)
            .Select(x => (x.t, x.Item2!))
            .ToList();

    /// <summary>The same rules ActionRegistry.Validate applies at start-up (src/PrismControl/Hosting/ActionRegistry.cs).</summary>
    [Test]
    public void Every_action_passes_the_discovery_rules()
    {
        var actions = Actions();
        var uuids = actions.Select(a => a.Attr.Uuid).OrderBy(u => u).ToList();
        Assert.Equal(
            "com.jeremyfhall.prismcontrol.system.cpu,com.jeremyfhall.prismcontrol.system.dial,com.jeremyfhall.prismcontrol.system.disk," +
            "com.jeremyfhall.prismcontrol.system.gpu,com.jeremyfhall.prismcontrol.system.network,com.jeremyfhall.prismcontrol.system.ram," +
            "com.jeremyfhall.prismcontrol.system.sample-memory",
            string.Join(",", uuids));
        foreach (var (t, a) in actions)
        {
            Assert.True(Regex.IsMatch(a.Uuid, @"^com\.jeremyfhall\.prismcontrol(\.[a-z0-9-]+)+$"), a.Uuid);
            Assert.True(a.Name.Length is > 0 and <= 30, $"{a.Uuid} name");
            Assert.False(t.IsAbstract, a.Uuid);
            Assert.NotNull(t.GetConstructor(Type.EmptyTypes), $"{a.Uuid} constructor");
            var isDial = Derives(t, typeof(DialAction<>));
            var isKey = Derives(t, typeof(KeyAction<>));
            if (a.Controllers.HasFlag(Controllers.Encoder)) Assert.True(isDial, $"{a.Uuid}: Encoder needs DialAction<T>");
            else Assert.True(isKey || isDial, $"{a.Uuid}: Keypad needs KeyAction<T>");
            if (a.Layout is { } l) Assert.True(Regex.IsMatch(l, @"^(\$(X1|A0|A1|B1|B2|C1)|layouts/[A-Za-z0-9._-]+\.json)$"), l);
            // The designer's icons (wave 2): imgs/actions/system/<action>/icon + key (+ dial for the encoder); the hidden sample keeps the defaults.
            var name = a.Uuid["com.jeremyfhall.prismcontrol.system.".Length..];
            var folder = $"imgs/actions/system/{name}/";
            Assert.Equal(name == "sample-memory" ? null : folder + "icon", a.Icon, a.Uuid);
            Assert.Equal(name == "sample-memory" ? null : folder + "key", a.KeyImage, a.Uuid);
            Assert.Equal(a.Controllers.HasFlag(Controllers.Encoder) ? folder + "dial" : null, a.EncoderIcon, a.Uuid);
            Assert.Empty(ActionValidator.Validate(t, a));
        }
        Assert.Equal(Layouts.Canvas.Path, typeof(SystemDial).GetCustomAttribute<StreamDeckActionAttribute>()!.Layout);
    }

    private static bool Derives(Type t, Type generic)
    {
        for (var c = t.BaseType; c is not null; c = c.BaseType)
            if (c.IsGenericType && c.GetGenericTypeDefinition() == generic) return true;
        return false;
    }

    [Test]
    public void Constructors_do_no_work()
    {
        // The manifest generator loads our types; construction must not touch services, the OS or the sampler.
        foreach (var (t, _) in Actions()) Assert.NotNull(Activator.CreateInstance(t));
    }

    /// <summary>The sample stays as it was: the core E2E suite places it on the Galleon.</summary>
    [Test]
    public async Task Sample_memory_key_still_works_without_the_sampler_running()
    {
        var sampler = new MemorySampler();
        await using var h = await ActionHarness<SampleMemoryKey>.AppearAsync(TestDevices.Galleon, configureServices: s => s.Add(sampler));
        Assert.True(sampler.TotalMiB > 0, "the key samples on render (0.6 µs)");
        h.AssertFramesAreDeckSafe();
    }
}

/// <summary>Live: the real sampler behind real actions (read-only).</summary>
public class LiveActionTests
{
    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Real_actions_render_live_data_on_galleon_and_plus()
    {
        await using var svc = TelemetryService.CreateDefault(PrismControl.Core.Hosting.NullLog.Instance, TimeProvider.System, new MemorySampler());
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(50));
        svc.Start(cts.Token);
        await using var cpu = await ActionHarness<CpuKey>.AppearAsync(TestDevices.Galleon, new(0, 0), settings: new CpuSettings { View = Views.Detail }, configureServices: s => s.Add<ITelemetry>(svc));
        await using var gpu = await ActionHarness<GpuKey>.AppearAsync(TestDevices.Plus, new(1, 0), configureServices: s => s.Add<ITelemetry>(svc));
        await using var net = await ActionHarness<NetworkKey>.AppearAsync(TestDevices.Plus, new(2, 0), configureServices: s => s.Add<ITelemetry>(svc));
        await using var dial = await ActionHarness<SystemDial>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder, configureServices: s => s.Add<ITelemetry>(svc));
        Assert.True(svc.CurrentNeeds.HasFlag(TelemetryNeeds.PerCore | TelemetryNeeds.Gpu | TelemetryNeeds.Network | TelemetryNeeds.Cpu));
        for (var i = 0; i < 3; i++) await svc.NextFrameAsync(TimeSpan.FromSeconds(3));
        var f = Assert.NotNull(svc.Latest);
        Assert.NotNull(f.Cpu?.PerCorePct, "the per-core view is visible");
        Assert.True(f.Gpus.Count > 0);
        foreach (var h in new[] { cpu.AdvanceAsync(TimeSpan.FromSeconds(1)), gpu.AdvanceAsync(TimeSpan.FromSeconds(1)), net.AdvanceAsync(TimeSpan.FromSeconds(1)), dial.AdvanceAsync(TimeSpan.FromSeconds(1)) }) await h;
        cpu.AssertFramesAreDeckSafe();
        gpu.AssertFramesAreDeckSafe();
        net.AssertFramesAreDeckSafe();
        dial.AssertFramesAreDeckSafe();
        Assert.Contains("<path", dial.FeedbackSvg(Layouts.Canvas.Frame));
        Console.WriteLine($"  {svc.Cost.Ticks} ticks (the first includes NVML/PDH/D3DKMT start-up), last {svc.Cost.LastUs / 1000:0.00} ms: {svc.Cost.LastBreakdown}");
    }
}
