using System.Globalization;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Scheduling;

namespace PrismControl.SystemInfo;

/// <summary>
/// SAMPLE: a stats key. Shared service from the module, a 1 Hz render loop at Background priority (stats never
/// compete with interactive controls), and "only changed frames are sent" for free (same value = same SVG = no send).
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.system.sample-memory", Name = "Memory (sample)",
    Tooltip = "Sample stats key for the telemetry engineer: physical memory in use.",
    VisibleInActionsList = false)] // hidden from users; kept as safe fixtures for the fake host and E2E (FakeHostSafety.SafeActions)
public sealed class SampleMemoryKey : KeyAction
{
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        DefaultPriority = UpdatePriority.Background;
        StartRenderLoop(Render, idleInterval: TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    private void Render()
    {
        var hue = Hues.For(Theme, "system");
        if (!Services.TryGet<MemorySampler>(out var m))
        {
            SetImage(KeyArt.Value(Theme, "MEMORY", "--", hue));
            return;
        }
        m.Sample(); // 0.6 µs; the shared telemetry sampler only runs for leased (real) actions
        SetImage(KeyArt.Value(Theme, "MEMORY", Math.Round(m.UsagePct).ToString(CultureInfo.InvariantCulture) + "%", hue, m.UsagePct / 100));
    }
}
