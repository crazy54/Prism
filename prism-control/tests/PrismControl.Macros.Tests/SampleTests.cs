using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

public class SampleTests
{
    [Test]
    public async Task Press_counts_and_hold_resets()
    {
        await using var h = await ActionHarness<SampleCounterKey>.AppearAsync(TestDevices.Galleon, new(2, 3));
        await h.PressAsync();
        await h.PressAsync();
        Assert.Equal(2, h.LastSettingsAs<SampleCounterSettings>().Count);
        await h.PressAsync(TimeSpan.FromSeconds(1)); // long press
        Assert.Equal(0, h.LastSettingsAs<SampleCounterSettings>().Count);
        Assert.Equal(1, h.Count("showOk"));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Settings_survive_a_reappear()
    {
        await using var h = await ActionHarness<SampleCounterKey>.AppearAsync(settings: new SampleCounterSettings { Count = 41 });
        await h.PressAsync();
        Assert.Equal(42, h.LastSettingsAs<SampleCounterSettings>().Count);
    }
}
