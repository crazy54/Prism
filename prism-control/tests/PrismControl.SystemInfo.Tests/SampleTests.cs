using PrismControl.Core.Scheduling;
using PrismControl.Testing;

namespace PrismControl.SystemInfo.Tests;

public class SampleTests
{
    [Test]
    public async Task Memory_key_polls_at_one_hertz_with_background_priority()
    {
        var sampler = new MemorySampler();
        sampler.Sample();
        await using var h = await ActionHarness<SampleMemoryKey>.AppearAsync(TestDevices.Galleon, configureServices: s => s.Add(sampler));
        var first = h.Count("setImage");
        Assert.True(first >= 1);
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        Assert.InRange(h.Count("setImage") - first, 2, 4, "renders in 3 s");
        Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background));
        Assert.DoesNotContain("<text", Assert.NotNull(h.LastSvg)); // value text is drawn as paths
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public void Sampler_reads_physical_memory()
    {
        var s = new MemorySampler();
        s.Sample();
        Assert.True(s.TotalMiB > 0);
        Assert.InRange(s.UsagePct, 0.1, 100);
    }
}
