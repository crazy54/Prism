using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Render;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

public class ModelTests
{
    [Test]
    public void Generic_descriptions_take_the_adapter_as_title()
    {
        Assert.Equal(("Example USB", (string?)"Headphones"), DeviceNames.Make("Headphones (Example USB)", "Headphones", "Example USB"));
        Assert.Equal(("Example Studio Mic", (string?)"Mic In"), DeviceNames.Make("Mic In (Example Studio Mic)", "Mic In", "Example Studio Mic"));
        Assert.Equal(("Example Voice Filter", (string?)"Speakers"), DeviceNames.Make("Speakers (Example Voice Filter)", "Speakers", "Example Voice Filter"));
    }

    [Test]
    public void Specific_descriptions_stay_and_vendor_product_channel_drops_the_vendor()
    {
        Assert.Equal(("Mixer - Chat", (string?)"Example Mixer Virtual Audio Device"),
            DeviceNames.Make("Example Mixer - Chat (Example Mixer Virtual Audio Device)", "Example Mixer - Chat", "Example Mixer Virtual Audio Device"));
        Assert.Equal(("Monitor 27Q", (string?)"Example HD Audio"), DeviceNames.Make("Monitor 27Q (Example HD Audio)", "Monitor 27Q", "Example HD Audio"));
        // Windows' "2- " prefix for duplicate devices is dropped.
        Assert.Equal(("Example Headset", (string?)"Headphones"), DeviceNames.Make("Headphones (2- Example Headset)", "Headphones", "2- Example Headset"));
        // Without properties, the friendly name is parsed.
        Assert.Equal(("Example USB", (string?)"Speakers"), DeviceNames.Make("Speakers (Example USB)", null, null));
        Assert.Equal(("Just A Name", (string?)null), DeviceNames.Make("Just A Name", null, null));
    }

    [Test]
    public void App_keys_names_and_session_identifiers()
    {
        Assert.Equal("music.exe", AppNames.KeyFor(@"C:\Program Files\Example\Music.exe"));
        Assert.Equal("music.exe", AppNames.KeyFor("MUSIC.EXE"));
        Assert.Equal("Music", AppNames.FromKey("music.exe"));
        Assert.Equal("System Sounds", AppNames.FromKey(AppNames.SystemSoundsKey));
        Assert.Equal(@"\Device\HarddiskVolume3\Program Files\Example\Music.exe",
            AppNames.PathFromSessionIdentifier(@"{0.0.0.00000000}.{00000000-0000-0000-0000-000000000001}|\Device\HarddiskVolume3\Program Files\Example\Music.exe%b{00000000-0000-0000-0000-000000000000}"));
        Assert.Equal("#", AppNames.PathFromSessionIdentifier("{0.0.0.00000000}.{00000000-0000-0000-0000-000000000001}|#%b{A9EF3FD9-4240-455E-A4D5-F2B3301887B2}"));
        Assert.Null(AppNames.PathFromSessionIdentifier("no-bar"));
    }

    [Test]
    public void Sessions_group_per_app_with_a_sensible_primary_session()
    {
        SessionInfo S(string app, string dev, bool active, float v, bool system = false) => new($"{dev}|{app}|{v}", dev, app, "Example " + app, system, active, v, false);
        var sessions = new[]
        {
            S("chat.exe", Headset, false, 0.3f),
            S("chat.exe", Speakers, true, 0.9f),
            S("zebra.exe", Speakers, false, 0.5f),
            S(AppNames.SystemSoundsKey, Speakers, false, 1f, system: true),
            S("alpha.exe", Headset, false, 0.2f),
        };
        var all = SessionGrouping.Group(sessions, null, Speakers);
        Assert.Equal("Example alpha.exe|Example chat.exe|Example zebra.exe|Example #system", string.Join("|", all.Select(a => a.Name)));
        var chat = all.First(a => a.Key == "chat.exe");
        Assert.Equal(0.9f, chat.Volume);
        Assert.Equal(2, chat.SessionCount);
        Assert.True(chat.IsActive);
        Assert.Equal(3, SessionGrouping.Group(sessions, Speakers, Speakers).Count);
    }

    [Test]
    public void Device_refs_resolve_the_follow_the_default_tokens()
    {
        var f = Standard();
        f.ExternalDefault(AudioFlow.Capture, MixerMic, AudioRole.Communications);
        Assert.Equal(Speakers, DeviceRef.Resolve(f, null));
        Assert.Equal(Speakers, DeviceRef.Resolve(f, "", DeviceRef.DefaultOutput));
        Assert.Equal(UsbMic, DeviceRef.Resolve(f, DeviceRef.DefaultInput));
        Assert.Equal(MixerMic, DeviceRef.Resolve(f, "", DeviceRef.CommsInput));
        Assert.Equal(Headset, DeviceRef.Resolve(f, Headset));
        Assert.Null(DeviceRef.Resolve(f, "@unknown-token"));
        Assert.Equal(AudioFlow.Capture, DeviceRef.FlowOf(DeviceRef.CommsInput));
        Assert.True(DeviceRef.FollowsDefault(""));
        Assert.False(DeviceRef.FollowsDefault(Headset));
    }

    [Test]
    public void Meter_math()
    {
        Assert.Equal(-6.0, new MeterReading(0.5f, []).PeakDb);
        Assert.Null(MeterReading.Silent.PeakDb);
        Assert.Equal(1.0, AudioArt.MeterPosition(1));
        Assert.Equal(0.0, AudioArt.MeterPosition(0.0005));
        Assert.Near(40.0 / 60, AudioArt.MeterPosition(0.1), 0.0001);
    }

    [Test]
    public void Dial_ticks_become_list_steps()
    {
        Assert.Equal(0, DialSteps.ListStep(0));
        Assert.Equal(1, DialSteps.ListStep(1));
        Assert.Equal(1, DialSteps.ListStep(4));
        Assert.Equal(2, DialSteps.ListStep(5));
        Assert.Equal(3, DialSteps.ListStep(12));
        Assert.Equal(-3, DialSteps.ListStep(-12));
        Assert.Equal(1, DialSteps.ClampStep(0));
        Assert.Equal(25, DialSteps.ClampStep(99));
    }

    [Test]
    public void Ballistics_attack_fast_fall_smoothly_and_hold_peaks()
    {
        var b = new MeterBallistics();
        b.Update(new MeterReading(1f, [1f, 0.5f]), TimeSpan.FromMilliseconds(100));
        Assert.Equal(1f, b.Levels[0]);
        b.Update(MeterReading.Silent with { Channels = [0f, 0f] }, TimeSpan.FromMilliseconds(100));
        Assert.Near(1 - MeterBallistics.FallRate * 0.1, b.Levels[0], 0.001);
        Assert.Equal(1f, b.Holds[0]);
        for (var i = 0; i < 30; i++) b.Update(new MeterReading(0, [0f, 0f]), TimeSpan.FromMilliseconds(100));
        Assert.Equal(0f, b.Levels[0]);
        Assert.True(b.Holds[0] < 1f, "the hold drops after a moment");
        Assert.True(b.IsIdle);
    }

    [Test]
    public void Text_fitting_wraps_at_the_dash_and_never_drops_characters()
    {
        var (lines, size) = TextFit.Wrap("Example Mixer - Chat", 120, 26, 16, 2); // a key title line
        Assert.Equal("Example Mixer|Chat", string.Join("|", lines));
        Assert.InRange(size, 16, 26);
        foreach (var l in lines) Assert.True(StrokeFont.Measure(l, size) <= 120);
        var (one, _) = TextFit.Wrap("Short", 100, 26, 16, 2);
        Assert.Single(one);
        var (clipped, _) = TextFit.Fit("An Extremely Long Example Device Name That Never Fits", 80, 20, 16);
        Assert.True(clipped.EndsWith('…'));
        // The font draws @ ` { } now, and anything else as one visible box per character: Safe keeps every character.
        Assert.Equal("Example's Mic", TextFit.Safe("Example's Mic"));
        Assert.Equal("Example's @Mic {Desk} `1`", TextFit.Safe("Example's @Mic {Desk} `1`"));
        Assert.True(StrokeFont.Supports(TextFit.Safe("Ünïcode @ {braces} `tick`")));
        Assert.Equal("Mic 例", TextFit.Safe("Mic 例"));
        Assert.Equal("例", TextFit.Safe("例"));
        Assert.Equal("例", string.Join("|", StrokeFont.Unsupported(TextFit.Safe("Mic 例"))), "drawn as one box, not dropped");
        Assert.Equal("Two Spaces", TextFit.Safe("Two  Spaces"));
        var (fitted, _) = TextFit.Fit("Mic 例", 120, 20, 16);
        Assert.Equal("Mic 例", fitted);
        // An app name the font cannot draw falls back to its program name, when that one draws.
        Assert.Equal("Cloudmusic", TextFit.Readable("网易云音乐", "Cloudmusic"));
        Assert.Equal("Example Music", TextFit.Readable("Example Music", "Music"));
        Assert.Equal("网易云音乐", TextFit.Readable("网易云音乐", "网易"), "no better choice: keep the real name");
    }
}
