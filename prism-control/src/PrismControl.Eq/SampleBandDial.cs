using System.Globalization;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;

namespace PrismControl.Eq;

public sealed class SampleBandSettings
{
    public double GainDb { get; set; }
    public string Band { get; set; } = "1 kHz";
}

/// <summary>
/// SAMPLE (changes no EQ): a dial drawn entirely as a 200×100 SVG frame on the full-canvas layout, with path text.
/// While the dial turns, frames go out at up to 30 Hz (the scheduler's interactive tier); when idle nothing is sent.
/// Press resets to 0 dB (works on Galleon too: a short press is a normal dialDown/dialUp there).
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.eq.sample-band", Name = "EQ Band (sample)",
    Controllers = Controllers.Encoder,
    Tooltip = "Sample dial for the EQ engineer. Changes an in-memory gain only.",
    Layout = Layouts.Canvas.Path, TriggerRotate = "Gain", TriggerPush = "Reset to 0 dB", TriggerTouch = "Set gain",
    VisibleInActionsList = false)] // hidden from users; kept as safe fixtures for the fake host and E2E (FakeHostSafety.SafeActions)
public sealed class SampleBandDial : DialAction<SampleBandSettings>
{
    public const double MaxGain = 12;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        SetFeedbackLayout(Layouts.Canvas.Path);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        Settings.GainDb = Math.Clamp(Math.Round(Settings.GainDb + e.Ticks * 0.5, 1), -MaxGain, MaxGain);
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        Settings.GainDb = 0;
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        Settings.GainDb = Math.Round((e.X / 200.0 * 2 - 1) * MaxGain * 2) / 2;
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    /// <summary>Public so tests and the preview tool can render a frame without a host.</summary>
    public static SvgDocument Frame(Core.Render.Tokens.RefractionPalette t, string band, double gainDb, bool active)
    {
        var hue = Hues.For(t, "eq");
        var d = DialArt.Base(t, hue, active);
        // Small caps (the default) keep unit casing readable: "1 kHz", "+4.5 dB".
        d.Text(band, 16, 24, Core.Render.Tokens.Refraction.Deck.DialLabelSize + 1, t.KeyMuted, tracking: 0.06);
        var value = (gainDb > 0 ? "+" : "") + gainDb.ToString("0.0", CultureInfo.InvariantCulture) + " dB";
        d.Text(value, 184, 24, Core.Render.Tokens.Refraction.Deck.DialLabelSize + 2, active ? hue.Ink : t.KeyInk, TextAlign.End);
        // A bell curve for the band: one path, centered, height proportional to the gain.
        const double baseY = 66, x0 = 16, x1 = 184;
        var amp = gainDb / MaxGain * 26;
        var curve = new PathBuilder().MoveTo(x0, baseY);
        for (var i = 1; i <= 48; i++)
        {
            var x = x0 + (x1 - x0) * i / 48.0;
            var u = (x - 100) / 34.0;
            curve.LineTo(x, baseY - amp * Math.Exp(-u * u));
        }
        d.Line(x0, baseY, x1, baseY, t.Line, 1);
        d.Path(curve, Style.Stroked(hue.Vivid, 3) with { Filter = active ? d.Glow(2) : null });
        // The gain scale: -12 … +12 as a slim track with a knob.
        const double ty = 88;
        d.Rect(x0, ty - 2, x1 - x0, 4, t.Panel2, rx: 2);
        var kx = x0 + (gainDb + MaxGain) / (2 * MaxGain) * (x1 - x0);
        d.Rect(100, ty - 2, kx - 100, 4, hue.Vivid.WithOpacity(0.7));
        d.Circle(kx, ty, 5, hue.Ink);
        return d;
    }

    private void Render() => SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, Frame(Theme, Settings.Band, Settings.GainDb, IsInteractive)));
}
