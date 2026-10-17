using System.Globalization;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;

namespace PrismControl.Audio;

public sealed class SampleLevelSettings
{
    public int Level { get; set; } = 50;
    public bool Muted { get; set; }
    public int Step { get; set; } = 2;
}

/// <summary>
/// SAMPLE (pattern proof, touches no real audio): a dial + key action with typed settings, the shared
/// "prism-value" layout (native text + bar), Galleon-aware ticks, and a property-inspector form.
/// Turn = level, press = mute toggle, Stream Deck + touch = jump to the tapped position.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.audio.sample-level", Name = "Level (sample)",
    Controllers = Controllers.Encoder | Controllers.Keypad,
    Tooltip = "Sample dial for the audio engineer. Changes an in-memory value only.",
    Layout = Layouts.Value.Path, TriggerRotate = "Adjust", TriggerPush = "Mute", TriggerTouch = "Set level",
    VisibleInActionsList = false)] // hidden from users; kept as safe fixtures for the fake host and E2E (FakeHostSafety.SafeActions)
public sealed class SampleLevelDial : DialAction<SampleLevelSettings>
{
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        if (IsDial) SetFeedbackLayout(Layouts.Value.Path);
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        // Galleon aggregates fast spins (up to ±12 ticks per event); Stream Deck + sends ±1. Scale by the step either way.
        Settings.Level = Math.Clamp(Settings.Level + e.Ticks * Settings.Step, 0, 100);
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnDialPressAsync(DialUpEvent e) => ToggleMute();

    protected override Task OnKeyPressAsync(KeyUpEvent e) => ToggleMute();

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        Settings.Level = Math.Clamp((int)Math.Round(e.X / 200.0 * 100), 0, 100);
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(SampleLevelSettings settings)
    {
        Render();
        return Task.CompletedTask;
    }

    protected override PiForm? DescribeForm() => new PiForm()
        .Range("level", "Level", 0, 100, 1, "%")
        .Checkbox("muted", "Muted")
        .Number("step", "Step per tick", 1, 10, 1);

    private Task ToggleMute()
    {
        Settings.Muted = !Settings.Muted;
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    private void Render()
    {
        var hue = Hues.For(Theme, "audio");
        var text = Settings.Muted ? "MUTED" : Settings.Level.ToString(CultureInfo.InvariantCulture) + "%";
        if (IsDial)
        {
            SetFeedback(new Feedback()
                .Text(Layouts.Value.Label, "LEVEL")
                .Text(Layouts.Value.ValueText, text, color: Settings.Muted ? Theme.Muted : Theme.Ink)
                .Bar(Layouts.Value.Bar, Settings.Muted ? 0 : Settings.Level));
        }
        else
        {
            SetImage(KeyArt.Value(Theme, "LEVEL", text, hue, Settings.Muted ? 0 : Settings.Level / 100.0, on: !Settings.Muted));
        }
    }
}
