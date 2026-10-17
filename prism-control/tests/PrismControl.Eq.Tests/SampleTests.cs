using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

public class SampleTests
{
    [Test]
    public async Task Band_dial_draws_full_canvas_frames()
    {
        await using var h = await ActionHarness<SampleBandDial>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder);
        Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
        await h.RotateAsync(9);
        Assert.Equal(4.5, h.LastSettingsAs<SampleBandSettings>().GainDb);
        var svg = Assert.NotNull(h.FeedbackSvg(Layouts.Canvas.Frame));
        Assert.Contains("viewBox=\"0 0 200 100\"", svg);
        await h.DialPressAsync();
        Assert.Equal(0.0, h.LastSettingsAs<SampleBandSettings>().GainDb);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public void Frame_stays_under_the_element_budget_at_the_extremes()
    {
        foreach (var gain in new[] { -12.0, 0, 12 })
        {
            var d = SampleBandDial.Frame(Refraction.Night, "16 kHz", gain, active: true);
            Assert.True(d.ElementCount < 60, $"{d.ElementCount} elements");
            Assert.Empty(SvgLint.Check(d.ToSvg(), SvgCanvas.Dial));
        }
    }
}
