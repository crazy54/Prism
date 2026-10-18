using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Theming;
using PrismControl.Spotify.Actions;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>Under Kaleidoscope, Spotify's own keys wear the app's look (Core/Theming); without it they stay Prism.</summary>
public class AppThemeTests
{
    private static readonly Color Green = new(0x1e, 0xd7, 0x60);

    private sealed class Source : IAppThemeSource
    {
        // A look owns its palette instance (never Refraction.Night itself, which AppTheming refuses).
        private static readonly RefractionPalette Own =
            (RefractionPalette)typeof(object).GetMethod("MemberwiseClone", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(Refraction.Night, null)!;

        public AppThemePalette? Current { get; set; }
        public event Action<string>? Changed;
        public AppThemePalette? For(string deviceId, RefractionPalette userTheme) => Current;
        public void Raise(string deviceId) => Changed?.Invoke(deviceId);

        public static AppThemePalette SpotifyLook() => new()
        {
            Name = "Spotify (evoked)", Key = "spotify:player:dark",
            Background = new Color(0x12, 0x12, 0x12), Surface = new Color(0x18, 0x18, 0x18), Raised = new Color(0x28, 0x28, 0x28),
            Line = new Color(0x33, 0x33, 0x33), Text = new Color(0xff, 0xff, 0xff), Dim = new Color(0xb3, 0xb3, 0xb3),
            Accent = Green, AccentText = Green, Accent2 = new Color(0x50, 0x9b, 0xf5),
            Ok = Green, Warn = new Color(0xff, 0xa4, 0x2b), Bad = new Color(0xf1, 0x5e, 0x6c), OnAccent = new Color(0, 0, 0),
            Palette = Own,
        };
    }

    [Test]
    public async Task Spotify_keys_wear_the_app_look_under_kaleidoscope_and_prism_otherwise()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        var source = new Source { Current = Source.SpotifyLook() };
        await using (var themed = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad,
            configureServices: s => { rig.Services(s); s.Add<IAppThemeSource>(source); }))
        {
            await Fx.WaitUntil(() => themed.LastSvg is not null, "first frame");
            Assert.Contains(Green.Hex, themed.LastSvg!);
            themed.AssertFramesAreDeckSafe();
        }

        await using var prism = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad, configureServices: rig.Services);
        await Fx.WaitUntil(() => prism.LastSvg is not null, "first frame");
        Assert.DoesNotContain(Green.Hex, prism.LastSvg!);
    }

    [Test]
    public async Task A_look_change_on_this_deck_redraws_the_key()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        var source = new Source();   // starts with no look: Prism
        await using var h = await ActionHarness<PlayPauseAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            configureServices: s => { rig.Services(s); s.Add<IAppThemeSource>(source); });
        await Fx.WaitUntil(() => h.LastSvg is not null, "first frame");
        Assert.DoesNotContain(Green.Hex, h.LastSvg!);

        source.Current = Source.SpotifyLook();
        source.Raise("another-deck");                  // not ours: no redraw needed
        source.Raise(TestDevices.Plus.Id);
        await Fx.WaitUntil(() => h.LastSvg?.Contains(Green.Hex, StringComparison.Ordinal) == true, "redraw in the app look");
        h.AssertFramesAreDeckSafe();
    }
}
