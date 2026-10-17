using System.Globalization;
using PrismControl.Core.Actions;
using PrismControl.Core.Art;

namespace PrismControl.Macros;

public sealed class SampleCounterSettings
{
    public int Count { get; set; }
}

/// <summary>
/// SAMPLE (sends no keystrokes): short press vs long press on a key, with typed settings that persist.
/// Press = +1, hold 0.5 s = reset. Key holds work on every device (unlike dial holds on the Galleon).
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.macros.sample-counter", Name = "Counter (sample)",
    Tooltip = "Sample key for the macro engineer: press to count, hold to reset.",
    VisibleInActionsList = false)] // hidden from users; kept as safe fixtures for the fake host and E2E (FakeHostSafety.SafeActions)
public sealed class SampleCounterKey : KeyAction<SampleCounterSettings>
{
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        Settings.Count++;
        SaveSettings();
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyLongPressAsync(KeyDownEvent e)
    {
        Settings.Count = 0;
        SaveSettings();
        Render();
        ShowOk();
        return Task.CompletedTask;
    }

    protected override Task OnSettingsChangedAsync(SampleCounterSettings settings)
    {
        Render();
        return Task.CompletedTask;
    }

    private void Render() =>
        SetImage(KeyArt.Value(Theme, "COUNT", Settings.Count.ToString(CultureInfo.InvariantCulture), Hues.For(Theme, "macros")));
}
