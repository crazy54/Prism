using System.Globalization;

namespace PrismControl.Eq;

/// <summary>Curve math (RBJ Audio EQ Cookbook biquads at 48 kHz), dial tick mapping, and label formatting.</summary>
public static class EqMath
{
    public const double SampleRate = 48000;
    public const double MinHz = 20, MaxHz = 20000;

    /// <summary>Where Sonar's UI draws its tone knobs: (type, frequency, Q).</summary>
    public static (EqFilterType Type, double Hz, double Q) KnobShape(EqKnob knob) => knob switch
    {
        EqKnob.BassBoost => (EqFilterType.LowShelf, 80, 0.707),
        EqKnob.VoiceClarity => (EqFilterType.Peaking, 2000, 0.5),
        EqKnob.TrebleBoost => (EqFilterType.HighShelf, 8000, 0.707),
        _ => (EqFilterType.Peaking, 1000, 1),
    };

    /// <summary>The response of one filter in dB at <paramref name="hz"/>.</summary>
    public static double ResponseDb(EqFilterType type, double f0, double gainDb, double q, double hz)
    {
        f0 = Math.Clamp(f0, 1, SampleRate / 2 * 0.999);
        q = Math.Max(0.05, q);
        var a = Math.Pow(10, gainDb / 40);
        var w0 = 2 * Math.PI * f0 / SampleRate;
        var cos = Math.Cos(w0);
        var alpha = Math.Sin(w0) / (2 * q);
        double b0, b1, b2, a0, a1, a2;
        switch (type)
        {
            case EqFilterType.Peaking:
                b0 = 1 + alpha * a; b1 = -2 * cos; b2 = 1 - alpha * a;
                a0 = 1 + alpha / a; a1 = -2 * cos; a2 = 1 - alpha / a;
                break;
            case EqFilterType.LowShelf:
            {
                var s = 2 * Math.Sqrt(a) * alpha;
                b0 = a * ((a + 1) - (a - 1) * cos + s);
                b1 = 2 * a * ((a - 1) - (a + 1) * cos);
                b2 = a * ((a + 1) - (a - 1) * cos - s);
                a0 = (a + 1) + (a - 1) * cos + s;
                a1 = -2 * ((a - 1) + (a + 1) * cos);
                a2 = (a + 1) + (a - 1) * cos - s;
                break;
            }
            case EqFilterType.HighShelf:
            {
                var s = 2 * Math.Sqrt(a) * alpha;
                b0 = a * ((a + 1) + (a - 1) * cos + s);
                b1 = -2 * a * ((a - 1) + (a + 1) * cos);
                b2 = a * ((a + 1) + (a - 1) * cos - s);
                a0 = (a + 1) - (a - 1) * cos + s;
                a1 = 2 * ((a - 1) - (a + 1) * cos);
                a2 = (a + 1) - (a - 1) * cos - s;
                break;
            }
            case EqFilterType.LowPass:
                b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
                a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
                break;
            case EqFilterType.HighPass:
                b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
                a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
                break;
            case EqFilterType.Notch:
                b0 = 1; b1 = -2 * cos; b2 = 1;
                a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
                break;
            case EqFilterType.BandPass:
                b0 = alpha; b1 = 0; b2 = -alpha;
                a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
                break;
            default: // AllPass: flat magnitude
                return 0;
        }
        // |H(e^jw)| with z^-1 = e^-jw.
        var w = 2 * Math.PI * hz / SampleRate;
        double c1 = Math.Cos(w), s1 = Math.Sin(w), c2 = Math.Cos(2 * w), s2 = Math.Sin(2 * w);
        var nr = b0 + b1 * c1 + b2 * c2;
        var ni = -(b1 * s1 + b2 * s2);
        var dr = a0 + a1 * c1 + a2 * c2;
        var di = -(a1 * s1 + a2 * s2);
        var mag2 = (nr * nr + ni * ni) / Math.Max(1e-300, dr * dr + di * di);
        return 10 * Math.Log10(Math.Max(1e-12, mag2));
    }

    public static double ResponseDb(EqBand band, double hz) =>
        band.Enabled ? ResponseDb(band.Type, band.FrequencyHz, band.GainDb, band.Q, hz) : 0;

    /// <summary>The summed response of the enabled filters and tone knobs (preamp excluded) at <paramref name="hz"/>.</summary>
    public static double TotalDb(EqState state, double hz)
    {
        if (!state.Enabled) return 0;
        double sum = 0;
        foreach (var b in state.Bands) sum += ResponseDb(b, hz);
        foreach (var (k, v) in state.Knobs)
        {
            if (k == EqKnob.Preamp || v == 0) continue;
            var (t, f, q) = KnobShape(k);
            sum += ResponseDb(t, f, v, q, hz);
        }
        return sum;
    }

    /// <summary>The response of one target alone (for lighting the active band).</summary>
    public static double TargetDb(EqState state, EqTarget target, double hz)
    {
        if (target.Knob is { } k)
        {
            if (k == EqKnob.Preamp || !state.Knobs.TryGetValue(k, out var v)) return 0;
            var (t, f, q) = KnobShape(k);
            return ResponseDb(t, f, v, q, hz);
        }
        return state.Band(target.Band) is { } b ? ResponseDb(b with { Enabled = true }, hz) : 0;
    }

    /// <summary>The frequency a target sits at on the curve.</summary>
    public static double TargetHz(EqState state, EqTarget target) =>
        target.Knob is { } k ? KnobShape(k).Hz : state.Band(target.Band)?.FrequencyHz ?? 1000;

    /// <summary>Log-spaced frequencies from 20 Hz to 20 kHz.</summary>
    public static IEnumerable<double> LogFrequencies(int points)
    {
        for (var i = 0; i < points; i++)
            yield return MinHz * Math.Pow(MaxHz / MinHz, i / (double)(points - 1));
    }

    /// <summary>0..1 position of a frequency on the log axis.</summary>
    public static double LogPosition(double hz) =>
        Math.Clamp(Math.Log(Math.Clamp(hz, MinHz, MaxHz) / MinHz) / Math.Log(MaxHz / MinHz), 0, 1);

    /// <summary>The highest point of the summed curve (for APO's automatic preamp headroom).</summary>
    public static double PeakDb(EqState state) => LogFrequencies(96).Select(f => TotalDb(state, f)).DefaultIfEmpty(0).Max();

    // ------------------------------------------------------------------ dial ticks

    /// <summary>Galleon sends up to ±12 aggregated ticks per event: treat them as magnitude, capped at ±6 per event.</summary>
    public const int MaxTicksPerEvent = 6;
    /// <summary>
    /// The new gain after a turn: ticks capped to ±6, times the step, clamped to the limits, rounded to 0.01 dB (so
    /// 0.25 dB steps stay exact), and stopped at 0 dB when the move crosses zero: a soft detent, so a fast spin
    /// cannot fly past flat; the next turn continues on the other side.
    /// </summary>
    public static double StepGain(double current, int ticks, double stepDb, double min, double max)
    {
        if (ticks == 0) return current;
        var t = Math.Clamp(ticks, -MaxTicksPerEvent, MaxTicksPerEvent);
        var next = Math.Round(current + t * Math.Clamp(stepDb, 0.05, 6), 2);
        if (Math.Abs(next) < 0.005 || (current != 0 && Math.Sign(next) != Math.Sign(current))) next = 0;
        return Math.Round(Math.Clamp(next, min, max), 2);
    }

    /// <summary>How many list items one rotate event moves (1 per Stream Deck + tick; a fast Galleon flick moves up to 3).</summary>
    public static int BrowseSteps(int ticks) => ticks == 0 ? 0 : Math.Sign(ticks) * Math.Min(3, (Math.Abs(ticks) + 3) / 4);

    // ------------------------------------------------------------------ labels

    public static string FormatHz(double hz)
    {
        if (hz >= 1000)
        {
            var k = hz / 1000;
            var s = k >= 10 || Math.Abs(k - Math.Round(k)) < 0.05 ? Math.Round(k).ToString("0", CultureInfo.InvariantCulture) : k.ToString("0.#", CultureInfo.InvariantCulture);
            return s + " kHz";
        }
        return Math.Round(hz).ToString("0", CultureInfo.InvariantCulture) + " Hz";
    }

    /// <summary>"+4.5 dB", "−0.25 dB", "0.0 dB" (two decimals only when the value needs them).</summary>
    public static string FormatDb(double db)
    {
        var r = Math.Round(db, 2, MidpointRounding.AwayFromZero);
        if (Math.Abs(r) < 0.005) return "0.0 dB";
        var fine = Math.Abs(r * 10 - Math.Round(r * 10)) > 0.001;
        return (r > 0 ? "+" : "−") + Math.Abs(r).ToString(fine ? "0.00" : "0.0", CultureInfo.InvariantCulture) + " dB";
    }

    public static string KnobName(EqKnob knob) => knob switch
    {
        EqKnob.BassBoost => "Bass",
        EqKnob.VoiceClarity => "Voice",
        EqKnob.TrebleBoost => "Treble",
        _ => "Gain",
    };

    /// <summary>"1 kHz", "BASS".</summary>
    public static string TargetLabel(EqState? state, EqTarget target) =>
        target.Knob is { } k ? KnobName(k) : state?.Band(target.Band) is { } b ? FormatHz(b.FrequencyHz) : "Band " + target.Band.ToString(CultureInfo.InvariantCulture);
}
