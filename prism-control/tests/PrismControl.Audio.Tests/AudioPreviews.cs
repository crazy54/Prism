using System.Text;
using PrismControl.Audio.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;

namespace PrismControl.Audio.Tests;

/// <summary>
/// Every audio frame in Night and Day, for looking at real sizes:
/// <c>dotnet run --project tests/PrismControl.Audio.Tests -- --render-previews &lt;dir&gt;</c>, then
/// <c>node aaa-prism-deck-team/lead/tools/snap.mjs &lt;dir&gt;/index.html out.png</c>.
/// </summary>
public static class AudioPreviews
{
    internal static IEnumerable<(string Name, bool Key, SvgDocument Svg)> Frames(RefractionPalette t)
    {
        // Volume
        yield return ("volume", true, AudioArt.VolumeKey(t, new VolumeView(LevelKind.Output, "Mixer - Chat", 42, false)));
        yield return ("volume-muted", true, AudioArt.VolumeKey(t, new VolumeView(LevelKind.Output, "Mixer - Chat", 42, true)));
        yield return ("volume-fixed", true, AudioArt.VolumeKey(t, new VolumeView(LevelKind.Output, "Example Voice Filter", 100, false, Fixed: true)));
        yield return ("app", true, AudioArt.VolumeKey(t, new VolumeView(LevelKind.App, "Example Music", 64, false)));
        yield return ("app-not-running", true, AudioArt.VolumeKey(t, new VolumeView(LevelKind.App, "Music", 0, false, Unavailable: true, Note: "NOT RUNNING")));
        // Mic
        yield return ("mic-live", true, AudioArt.MicKey(t, new MicView("Example USB Audio", false, 80, null)));
        yield return ("mic-live-meter", true, AudioArt.MicKey(t, new MicView("Example USB Audio", false, 80, 0.62)));
        yield return ("mic-muted", true, AudioArt.MicKey(t, new MicView("Example USB Audio", true, 80, null)));
        yield return ("mic-no-audio", true, AudioArt.MicKey(t, new MicView("Audio service", false, 0, null, Unavailable: true, NoAudio: true)));
        // Devices
        yield return ("device-cycle", true, AudioArt.DeviceKey(t, new DeviceView(true, "Mixer - Chat", "Example Mixer Virtual Audio Device", false, true, 1, 3)));
        yield return ("device-set-lit", true, AudioArt.DeviceKey(t, new DeviceView(true, "The Example Ensemble Headset", "Headphones", true, true, 0, 1)));
        yield return ("device-input", true, AudioArt.DeviceKey(t, new DeviceView(false, "Example USB Audio", "Microphone", false, true, 0, 0)));
        // Meter
        yield return ("meter", true, AudioArt.MeterKey(t, new MeterView(true, "Mixer - Chat", [0.72f, 0.64f], [0.81f, 0.77f], -11)));
        yield return ("meter-mono-silent", true, AudioArt.MeterKey(t, new MeterView(false, "Example USB Audio", [0f], [0f], null)));

        yield return ("volume", false, AudioArt.VolumeDial(t, new VolumeView(LevelKind.Output, "Mixer - Chat", 42, false), active: false));
        yield return ("volume-active", false, AudioArt.VolumeDial(t, new VolumeView(LevelKind.Output, "Mixer - Chat", 74, false), active: true));
        yield return ("volume-muted", false, AudioArt.VolumeDial(t, new VolumeView(LevelKind.Output, "Mixer - Chat", 42, true), active: false));
        yield return ("app", false, AudioArt.VolumeDial(t, new VolumeView(LevelKind.App, "Example Music", 64, false), active: false));
        yield return ("mic-live", false, AudioArt.MicDial(t, new MicView("Example USB Audio", false, 80, 0.55), active: false));
        yield return ("mic-muted", false, AudioArt.MicDial(t, new MicView("Example USB Audio", true, 80, null), active: false));
        yield return ("mic-no-audio", false, AudioArt.MicDial(t, new MicView("Audio service", false, 0, null, Unavailable: true, NoAudio: true), active: false));
        yield return ("device-browse", false, AudioArt.DeviceDial(t, new DeviceView(true, "The Example Ensemble Headset", "Headphones", false, false, 2, 6, "PUSH TO SET"), active: true));
        yield return ("device-default", false, AudioArt.DeviceDial(t, new DeviceView(true, "Mixer - Chat", "Example Mixer Virtual Audio Device", true, true, 1, 6), active: false));
        yield return ("mixer-list", false, AudioArt.MixerDial(t, new MixerView(false, "Example Music", 50, false, true, 1, 4), active: false));
        yield return ("mixer-adjust", false, AudioArt.MixerDial(t, new MixerView(true, "Example Music", 58, false, true, 1, 4), active: true));
        yield return ("mixer-adjust-muted", false, AudioArt.MixerDial(t, new MixerView(true, "Example Chat", 0, true, true, 2, 4), active: true));
        yield return ("mixer-empty", false, AudioArt.MixerDial(t, new MixerView(false, "", 0, false, false, 0, 0, Empty: true), active: false));
        yield return ("meter", false, AudioArt.MeterDial(t, new MeterView(true, "Mixer - Chat", [0.72f, 0.58f], [0.84f, 0.7f], -9), active: false));
        yield return ("meter-input", false, AudioArt.MeterDial(t, new MeterView(false, "Example USB Audio", [0.4f], [0.52f], -31), active: true));
    }

    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        const string style = "<style>body{margin:16px;color:#a2a4b4;font:11px Segoe UI,sans-serif}body.night{background:#000}body.day{background:#d9d8e0;color:#333}"
            + "h2{font-size:13px;margin:4px 0 10px}.groups{display:flex;flex-wrap:wrap;gap:18px 28px}.row{display:flex;gap:10px;align-items:flex-end}"
            + "figure{margin:0;text-align:center}figcaption{margin-top:2px;font-size:10px}img{display:block}</style>";
        var index = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"></head><body><ul>");
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            var frames = Frames(t).ToList();
            var keys = new StringBuilder($"<!doctype html><html><head><meta charset=\"utf-8\">{style}</head><body class=\"{t.Name}\"><h2>{t.Name}: keys at 72 / 96 / 120 / 144 px</h2><div class=\"groups\">");
            foreach (var (name, _, svg) in frames.Where(f => f.Key))
            {
                var file = $"key-{t.Name}-{name}.svg";
                Save(dir, file, svg, SvgCanvas.Key);
                keys.Append("<div class=\"row\">");
                foreach (var px in new[] { 72, 96, 120, 144 })
                    keys.Append($"<figure><img src=\"{file}\" width=\"{px}\" height=\"{px}\"><figcaption>{(px == 144 ? name + " " : "")}{px}</figcaption></figure>");
                keys.Append("</div>");
            }
            keys.Append("</div></body></html>");
            File.WriteAllText(Path.Combine(dir, $"{t.Name}-keys.html"), keys.ToString());

            var dials = new StringBuilder($"<!doctype html><html><head><meta charset=\"utf-8\">{style}</head><body class=\"{t.Name}\"><h2>{t.Name}: dials at 200×100 (Stream Deck +) and 360×180 (Galleon widget)</h2><div class=\"groups\">");
            foreach (var (name, _, svg) in frames.Where(f => !f.Key))
            {
                var file = $"dial-{t.Name}-{name}.svg";
                Save(dir, file, svg, SvgCanvas.Dial);
                dials.Append($"<div class=\"row\"><figure><img src=\"{file}\" width=\"200\" height=\"100\"><figcaption>{name} 200×100</figcaption></figure>")
                    .Append($"<figure><img src=\"{file}\" width=\"360\" height=\"180\"><figcaption>360×180</figcaption></figure></div>");
            }
            dials.Append("</div></body></html>");
            File.WriteAllText(Path.Combine(dir, $"{t.Name}-dials.html"), dials.ToString());
            index.Append($"<li><a href=\"{t.Name}-keys.html\">{t.Name} keys</a></li><li><a href=\"{t.Name}-dials.html\">{t.Name} dials</a></li>");
        }
        index.Append("</ul></body></html>");
        File.WriteAllText(Path.Combine(dir, "index.html"), index.ToString());
        Console.WriteLine($"wrote audio previews to {Path.GetFullPath(dir)} (night-keys, night-dials, day-keys, day-dials .html)");
        return 0;
    }

    private static void Save(string dir, string file, SvgDocument svg, SvgCanvas canvas)
    {
        var markup = svg.ToSvg();
        var errors = SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{file}: " + string.Join("; ", errors));
        File.WriteAllText(Path.Combine(dir, file), markup);
    }
}
