using PrismControl.Core.Actions;
using PrismControl.Core.Art;
using PrismControl.Core.Render;

namespace PrismControl.Spotify;

/// <summary>
/// SAMPLE: a key fed by events from a background source (like SMTC, whose callbacks arrive on pool threads).
/// The source raises events on its own thread; the action marshals with <see cref="ActionBase.Post(Action)"/>
/// so its state is only touched in its mailbox. Draws a generic music glyph (never the Spotify logo).
/// Changes no playback.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.sample-now-playing", Name = "Now Playing (sample)",
    Tooltip = "Sample key for the Spotify engineer: a music glyph that pulses when a fake source ticks.",
    VisibleInActionsList = false)] // hidden from users; kept as safe fixtures for the fake host and E2E (FakeHostSafety.SafeActions)
public sealed class SampleNowPlayingKey : KeyAction, IDisposable
{
    private Timer? _fakeSource;
    private bool _pulse;

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        // Stand-in for an SMTC MediaPropertiesChanged handler running on a thread-pool thread.
        _fakeSource = new Timer(_ => Post(() => { _pulse = !_pulse; Render(); }), null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
        Render();
        return Task.CompletedTask;
    }

    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        ShowOk();
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    private void Render()
    {
        var hue = Hues.For(Theme, "spotify");
        SetImage(KeyArt.Glyph(Theme, Glyphs.MusicNote, "NOW PLAYING", hue, on: _pulse));
    }

    public void Dispose()
    {
        _fakeSource?.Dispose();
        _fakeSource = null;
    }
}
