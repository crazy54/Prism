using System.Reflection;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

public class ArtAndManifestTests
{
    [Test]
    public void Every_audio_frame_is_deck_safe_and_small_in_both_themes()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
            foreach (var (name, key, svg) in AudioPreviews.Frames(t))
            {
                var markup = svg.ToSvg();
                var errors = SvgLint.Check(markup, key ? SvgCanvas.Key : SvgCanvas.Dial).Where(i => i.Severity == LintSeverity.Error).ToList();
                Assert.Empty(errors, $"{t.Name} {name}");
                Assert.True(svg.ElementCount < 120, $"{t.Name} {name}: {svg.ElementCount} elements");
                Assert.DoesNotContain("<text", markup);
            }
    }

    [Test]
    public void Muted_mic_key_and_dial_fill_with_the_negative_color()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            Assert.Contains(t.Neg.Hex, AudioArt.MicKey(t, new MicView("Example USB Audio", true, 80, null)).ToSvg());
            Assert.Contains(t.Neg.Hex, AudioArt.MicDial(t, new MicView("Example USB Audio", true, 80, null), false).ToSvg());
            Assert.True(Color.Contrast(t.Neg, AudioArt.OnNeg(t)) >= 4.5, $"{t.Name}: the MUTED ink reads on the fill");
        }
    }

    [Test]
    public void Long_and_odd_names_still_render_safely()
    {
        var t = Refraction.Night;
        var odd = "An Extremely Long Example Device Name (With Parentheses) That Will Never Fit — Ünïcode's @ 例";
        foreach (var svg in new[]
        {
            AudioArt.DeviceKey(t, new DeviceView(true, odd, odd, true, true, 3, 8)),
            AudioArt.DeviceDial(t, new DeviceView(false, odd, odd, false, false, 7, 30, "PUSH TO SET"), true),
            AudioArt.VolumeKey(t, new VolumeView(LevelKind.App, odd, 100, true)),
            AudioArt.MixerDial(t, new MixerView(true, odd, 7, false, true, 0, 1), true),
            AudioArt.MeterKey(t, new MeterView(false, odd, [1f, 1f], [1f, 1f], 0)),
        })
            Assert.Empty(SvgLint.Check(svg.ToSvg()).Where(i => i.Severity == LintSeverity.Error));
    }

    private static readonly string[] ExpectedUuids =
    [
        "com.jeremyfhall.prismcontrol.audio.app-volume",
        "com.jeremyfhall.prismcontrol.audio.input-device",
        "com.jeremyfhall.prismcontrol.audio.level-meter",
        "com.jeremyfhall.prismcontrol.audio.mic-mute",
        "com.jeremyfhall.prismcontrol.audio.mixer",
        "com.jeremyfhall.prismcontrol.audio.output-device",
        "com.jeremyfhall.prismcontrol.audio.sample-level",
        "com.jeremyfhall.prismcontrol.audio.volume",
    ];

    private static IEnumerable<(Type Type, StreamDeckActionAttribute Attr)> Actions() =>
        typeof(VolumeAction).Assembly.GetTypes()
            .Select(t => (t, a: t.GetCustomAttribute<StreamDeckActionAttribute>(false)))
            .Where(x => x.a is not null)
            .Select(x => (x.t, x.a!));

    [Test]
    public void Action_attributes_follow_the_contract_and_uuids_are_pinned()
    {
        var report = ActionValidator.Scan(typeof(VolumeAction).Assembly); // the host's own rules
        Assert.Empty(report.Errors, string.Join("\n", report.Errors));
        Assert.Empty(report.Warnings, string.Join("\n", report.Warnings));
        var actions = Actions().ToList();
        Assert.Equal(string.Join(",", ExpectedUuids), string.Join(",", actions.Select(a => a.Attr.Uuid).OrderBy(u => u, StringComparer.Ordinal)));
        var uuid = new Regex(@"^com\.jeremyfhall\.prismcontrol\.audio\.[a-z0-9-]+$");
        foreach (var (type, a) in actions)
        {
            Assert.True(uuid.IsMatch(a.Uuid), a.Uuid);
            Assert.True(a.Name.Length is > 0 and <= 30, $"{a.Uuid} name '{a.Name}'");
            if (a.Controllers.HasFlag(Controllers.Encoder))
            {
                Assert.True(a.Layout is Layouts.Canvas.Path or Layouts.Value.Path, $"{a.Uuid} uses a shipped layout");
                Assert.NotNull(a.TriggerRotate);
                Assert.NotNull(a.TriggerPush);
            }
            _ = Activator.CreateInstance(type); // constructors do no work
        }
    }

    [Test]
    public void Every_icon_path_points_at_an_image_the_module_ships()
    {
        // The designer's icons (wave 2): each path is plugin-relative and has an .svg under src/PrismControl.Audio/plugin.
        var plugin = Path.Combine(RepoRoot(), "src", "PrismControl.Audio", "plugin");
        var shipped = 0;
        foreach (var (_, a) in Actions())
            foreach (var (what, path) in new[] { ("Icon", a.Icon), ("KeyImage", a.KeyImage), ("EncoderIcon", a.EncoderIcon) })
            {
                if (path is null)
                {
                    Assert.True(a.Uuid.EndsWith(".sample-level", StringComparison.Ordinal), $"{a.Uuid} has no {what}");
                    continue;
                }
                Assert.True(path.StartsWith("imgs/actions/audio/", StringComparison.Ordinal), $"{a.Uuid} {what} '{path}' lives under imgs/actions/audio/");
                Assert.True(File.Exists(Path.Combine(plugin, path + ".svg")), $"{a.Uuid} {what}: {path}.svg exists");
                shipped++;
            }
        Assert.Equal(7 * 3, shipped, "icon, key image and dial icon for the seven audio actions");
    }

    /// <summary>The test exe usually sits under the repo; with --artifacts-path it does not, so the working directory (run from prism-control/) is tried too.</summary>
    internal static string RepoRoot()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
            for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        throw new InvalidOperationException($"PrismControl.sln not found above {AppContext.BaseDirectory} or {Directory.GetCurrentDirectory()} (run from prism-control/).");
    }


    [Test]
    public async Task Every_form_field_binds_to_a_settings_property()
    {
        await CheckFormAsync<VolumeAction, VolumeSettings>();
        await CheckFormAsync<MicMuteAction, MicSettings>();
        await CheckFormAsync<OutputDeviceAction, DeviceSwitchSettings>();
        await CheckFormAsync<InputDeviceAction, DeviceSwitchSettings>();
        await CheckFormAsync<MixerAction, MixerSettings>();
        await CheckFormAsync<AppVolumeAction, AppVolumeSettings>();
        await CheckFormAsync<LevelMeterAction, LevelMeterSettings>();
    }

    private static async Task CheckFormAsync<TAction, TSettings>() where TAction : ActionBase, new()
    {
        var f = FakeAudioEngine.WithApps();
        await using var h = await ActionHarness<TAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f));
        var hello = await h.PiMessageAsync("pi.ready");
        var form = hello!["data"]!["form"]!["fields"]!.AsArray();
        var props = typeof(TSettings).GetProperties().Select(p => char.ToLowerInvariant(p.Name[0]) + p.Name[1..]).ToHashSet();
        foreach (var field in form)
        {
            if (field!["setting"] is JsonValue s) Assert.True(props.Contains(s.GetValue<string>()), $"{typeof(TAction).Name}: '{s}' is a {typeof(TSettings).Name} property");
            if (field["optionsFrom"] is JsonValue of)
            {
                var reply = await h.PiMessageAsync(of.GetValue<string>(), null, requestId: 1);
                Assert.True(reply!["ok"]!.GetValue<bool>() && reply["data"] is JsonArray { Count: > 0 }, $"{typeof(TAction).Name}: {of} answers with options");
            }
        }
    }
}
