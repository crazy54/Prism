using System.Reflection;
using PrismControl.Core.Art;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Theming;
using PrismControl.Testing;

namespace PrismControl.Tests;

public class AppThemeTests
{
    // A look owns its palette instance (as the Smart provider builds them). Never use Refraction.Night/Day itself here:
    // AppTheming.For refuses them, and tagging a shared palette would leak into every other test in the run.
    private static RefractionPalette OwnPalette(RefractionPalette from) =>
        (RefractionPalette)typeof(object).GetMethod("MemberwiseClone", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(from, null)!;

    private static readonly RefractionPalette AppNight = OwnPalette(Refraction.Night);

    private static AppThemePalette Look(string key = "example:player:dark", double radius = 16, AppLabelCase labels = AppLabelCase.Title, RefractionPalette? palette = null) => new()
    {
        Name = "Example (evoked)", Key = key,
        Background = new Color(0x12, 0x12, 0x12), Surface = new Color(0x18, 0x18, 0x18), Raised = new Color(0x28, 0x28, 0x28),
        Line = new Color(0x33, 0x33, 0x33), Text = new Color(0xff, 0xff, 0xff), Dim = new Color(0xb3, 0xb3, 0xb3),
        Accent = new Color(0x1e, 0xd7, 0x60), AccentText = new Color(0x1e, 0xd7, 0x60), Accent2 = new Color(0x50, 0x9b, 0xf5),
        Ok = new Color(0x1e, 0xd7, 0x60), Warn = new Color(0xff, 0xa4, 0x2b), Bad = new Color(0xf1, 0x5e, 0x6c),
        OnAccent = new Color(0, 0, 0), Radius = radius, LabelCase = labels, Palette = palette ?? AppNight,
    };

    private sealed class FakeSource(AppThemePalette? look) : IAppThemeSource
    {
        public string? AskedDevice;
        public RefractionPalette? AskedTheme;
        public AppThemePalette? For(string deviceId, RefractionPalette userTheme) { AskedDevice = deviceId; AskedTheme = userTheme; return look; }
        public event Action<string>? Changed;
        public int Subscribers => Changed?.GetInvocationList().Length ?? 0;
        public void Raise(string deviceId) => Changed?.Invoke(deviceId);
    }

    private static (ServiceRegistry, FakeSource) Rig(AppThemePalette? look)
    {
        var services = new ServiceRegistry();
        var source = new FakeSource(look);
        services.Add<IAppThemeSource>(source);
        return (services, source);
    }

    [Test]
    public void Without_a_source_every_face_stays_prism()
    {
        Assert.True(AppTheming.For(new ServiceRegistry(), "dev-1", Refraction.Night) is null);
    }

    [Test]
    public void A_registered_source_is_asked_per_device_with_the_users_theme()
    {
        var (services, source) = Rig(Look());
        var look = Assert.NotNull(AppTheming.For(services, "galleon-1", Refraction.Day));
        Assert.Equal("galleon-1", source.AskedDevice);
        Assert.True(ReferenceEquals(Refraction.Day, source.AskedTheme));
        Assert.True(look.IsDark, "IsDark follows the palette");
    }

    [Test]
    public void A_look_that_reuses_prisms_own_palette_is_refused()
    {
        var (services, _) = Rig(Look(palette: Refraction.Night));
        Assert.True(AppTheming.For(services, "galleon-1", Refraction.Night) is null);
        Assert.True(AppTheming.LookOf(Refraction.Night) is null);
        Assert.Equal(Refraction.Night.Spectrum[Hues.Index("audio")!.Value].Vivid, Hues.For(Refraction.Night, "audio").Vivid);
    }

    [Test]
    public void Art_on_an_app_palette_wears_the_apps_accent_and_prism_palettes_keep_their_domain_hue()
    {
        var palette = OwnPalette(Refraction.Night);
        var (services, _) = Rig(Look(key: "example:accent", palette: palette));
        var look = Assert.NotNull(AppTheming.For(services, "plus-1", Refraction.Night));
        Assert.True(ReferenceEquals(look, AppTheming.LookOf(palette)));
        Assert.Equal(look.Accent, Hues.For(palette, "spotify").Vivid);
        Assert.Equal(Refraction.Night.Spectrum[Hues.Index("spotify")!.Value].Vivid, Hues.For(Refraction.Night, "spotify").Vivid);
    }

    [Test]
    public void Watch_fires_only_for_its_device_and_unsubscribes_on_dispose()
    {
        var (services, source) = Rig(Look());
        var hits = 0;
        var watch = AppTheming.Watch(services, "galleon-1", () => hits++);
        source.Raise("plus-1");
        source.Raise("galleon-1");
        Assert.Equal(1, hits);
        watch.Dispose();
        watch.Dispose(); // idempotent
        Assert.Equal(0, source.Subscribers);
        source.Raise("galleon-1");
        Assert.Equal(1, hits);
        AppTheming.Watch(new ServiceRegistry(), "galleon-1", () => hits++).Dispose(); // no source: a no-op
    }

    [Test]
    public void Looks_compare_by_value_so_an_unchanged_look_skips_the_re_render()
    {
        Assert.Equal(Look(), Look());
        Assert.False(Look() == Look(key: "example:player:light"));
        Assert.False(Look() == Look(palette: OwnPalette(Refraction.Day)));
    }

    [Test]
    public void Labels_and_radii_follow_the_look()
    {
        Assert.Equal("Now Playing", Look(labels: AppLabelCase.Title).Case("NOW PLAYING"));
        Assert.Equal("Now playing", Look(labels: AppLabelCase.Sentence).Case("NOW PLAYING"));
        Assert.Equal("NOW PLAYING", Look(labels: AppLabelCase.Upper).Case("NOW PLAYING"), "upper keeps the label as authored");
        // Shared with Smart's ApplyCase: acronyms, digits and units survive; small words stay lower in title case.
        Assert.Equal("Start EC2", AppTheming.ApplyCase("START EC2", AppLabelCase.Title));
        Assert.Equal("CPU Temp", AppTheming.ApplyCase("CPU TEMP", AppLabelCase.Title));
        Assert.Equal("Go to File", AppTheming.ApplyCase("GO TO FILE", AppLabelCase.Title));
        Assert.Equal("Skip 10s", AppTheming.ApplyCase("SKIP 10S", AppLabelCase.Sentence));
        Assert.Equal("Play/Pause", AppTheming.ApplyCase("PLAY/PAUSE", AppLabelCase.Title));
        Assert.Equal("Play/pause", AppTheming.ApplyCase("PLAY/PAUSE", AppLabelCase.Sentence));
        Assert.Equal("Fade 500 ms", AppTheming.ApplyCase("FADE 500 MS", AppLabelCase.Sentence));
        Assert.Equal(16.0, Look(radius: 16).R(AppThemePalette.PrismRadius));
        Assert.Equal(24.0, Look(radius: 24).R(12), "clamped to 24");
        Assert.Equal(0.0, Look(radius: 0).R(8));
    }

    [Test]
    public void The_hue_for_art_helpers_is_the_looks_accent()
    {
        var look = Look();
        var hue = AppTheming.Hue(look);
        Assert.Equal(look.Accent, hue.Vivid);
        Assert.Equal(look.AccentText, hue.Ink);
        Assert.True(hue.Sheen is null);
    }
}
