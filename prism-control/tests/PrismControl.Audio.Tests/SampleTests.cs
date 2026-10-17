using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

public class SampleTests
{
    [Test]
    public async Task Level_dial_on_galleon_uses_the_value_layout_and_aggregated_ticks()
    {
        await using var h = await ActionHarness<SampleLevelDial>.AppearAsync(TestDevices.Galleon, new(0, 1), Controller.Encoder, new SampleLevelSettings { Level = 50, Step = 2 });
        Assert.Equal(Layouts.Value.Path, h.LastLayout);
        await h.RotateAsync(12); // a fast Galleon spin arrives as one event
        Assert.Equal("74%", h.FeedbackText(Layouts.Value.ValueText));
        Assert.Equal(74, h.LastSettingsAs<SampleLevelSettings>().Level);
        await h.DialPressAsync();
        Assert.Equal("MUTED", h.FeedbackText(Layouts.Value.ValueText));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Level_on_a_key_renders_a_deck_safe_image()
    {
        await using var h = await ActionHarness<SampleLevelDial>.AppearAsync(TestDevices.Plus, new(1, 1), Controller.Keypad);
        Assert.NotNull(h.LastSvg);
        await h.PressAsync();
        Assert.True(h.LastSettingsAs<SampleLevelSettings>().Muted);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Touch_on_plus_sets_the_level()
    {
        await using var h = await ActionHarness<SampleLevelDial>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder);
        await h.TapAsync(50, 40);
        Assert.Equal("25%", h.FeedbackText(Layouts.Value.ValueText));
    }
}
