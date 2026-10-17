using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class SampleTests
{
    [Test]
    public async Task Now_playing_key_draws_a_glyph_and_reacts_to_background_events()
    {
        await using var h = await ActionHarness<SampleNowPlayingKey>.AppearAsync(TestDevices.Plus);
        var svg = Assert.NotNull(h.LastSvg);
        Assert.DoesNotContain("<text", svg);
        // The fake source runs on a real thread-pool timer every 2 s and marshals with Post(...).
        var before = h.Count("setImage");
        await Task.Delay(2500);
        await h.SettleAsync();
        Assert.True(h.Count("setImage") > before, "background event did not re-render");
        await h.PressAsync();
        Assert.Equal(1, h.Count("showOk"));
        h.AssertFramesAreDeckSafe();
    }
}
