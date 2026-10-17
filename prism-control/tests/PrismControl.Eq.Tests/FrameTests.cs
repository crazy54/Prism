using System.Globalization;
using System.Text.RegularExpressions;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Eq.Sonar;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>Every EQ frame, including the new "SONAR ERROR" and "CHANNEL MISSING" states, against the deck's SVG rules.</summary>
public class FrameTests
{
    [Test]
    public void Every_eq_frame_lints_clean_in_both_themes()
    {
        var (keys, dials) = EqPreviews.Frames();
        foreach (var (name, svg) in keys) Lint("key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Lint("dial-" + name, svg, SvgCanvas.Dial);
    }

    private static void Lint(string name, SvgDocument svg, SvgCanvas canvas)
    {
        var errors = SvgLint.Check(svg.ToSvg(), canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        Assert.Empty(errors, $"{name}: {string.Join("; ", errors)}");
    }

    /// <summary>The designer's wave-2 fix: the ChatMix note chip keeps 12 units clear of "CHATMIX" (it used to run into "HEADSET WHEEL").</summary>
    [Test]
    public void The_chatmix_note_chip_keeps_clear_of_the_label()
    {
        var labelEnd = 16 + StrokeFont.Measure("CHATMIX", Refraction.Deck.DialLabelSize, FontWeight.Semibold, Refraction.Deck.DialLabelTrackingEm, TextCase.Upper);
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            foreach (var note in new[] { "ON HEADSET", "UNAVAILABLE", "SONAR ERROR", "A NOTE FAR LONGER THAN THE DIAL HAS ROOM FOR" })
            {
                var svg = EqArt.ChatMixDial(t, new SonarChatMix(0.3, "finiteWheel"), false, note).ToSvg();
                var chip = Regex.Match(svg, "<rect x=\"([0-9.]+)\" y=\"9.5\" width=\"([0-9.]+)\" height=\"15\" rx=\"7.5\"");
                Assert.True(chip.Success, $"{t.Name} {note}: no note chip in the frame");
                var x = double.Parse(chip.Groups[1].Value, CultureInfo.InvariantCulture);
                var w = double.Parse(chip.Groups[2].Value, CultureInfo.InvariantCulture);
                Assert.True(x >= labelEnd + 12 - 0.01, $"{t.Name} {note}: the chip starts at {x}, the label ends at {labelEnd}");
                Assert.True(x + w <= 184.01, $"{t.Name} {note}: the chip runs past the right margin");
            }
        }
    }
}
