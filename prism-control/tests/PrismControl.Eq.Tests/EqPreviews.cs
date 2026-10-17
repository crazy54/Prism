using System.Text;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Eq.Sonar;
using PrismControl.Eq.Tests.Fakes;

namespace PrismControl.Eq.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.Eq.Tests -- --render-previews &lt;dir&gt;</c>: every EQ frame in Night and Day,
/// keys at 72/96/120/144 px and dials at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget). Fictional data.
/// </summary>
public static class EqPreviews
{
    /// <summary>Every frame the EQ actions draw, both themes (also linted by the test suite).</summary>
    public static (List<(string Name, SvgDocument Svg)> Keys, List<(string Name, SvgDocument Svg)> Dials) Frames()
    {
        var fake = new FakeSonarData();
        var game = fake.State(SonarChannels.Game);
        var chat = fake.State(SonarChannels.Chat);
        var media = fake.State(SonarChannels.Media);
        var aux = fake.State(SonarChannels.Aux);
        var keys = new List<(string Name, SvgDocument Svg)>();
        var dials = new List<(string Name, SvgDocument Svg)>();
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            var n = t.Name;
            dials.Add(($"{n}-band-active", EqArt.BandDial(t, new BandFrame("Game", game, EqTarget.ForBand(2), BandMark.Lit, Active: true))));
            dials.Add(($"{n}-band-idle", EqArt.BandDial(t, new BandFrame("Chat", chat with { Bands = chat.Bands.Select(b => b.Index == 6 ? b with { GainDb = -4.5 } : b).ToList() }, EqTarget.ForBand(6)))));
            dials.Add(($"{n}-band-knob", EqArt.BandDial(t, new BandFrame("Media", media, EqTarget.ForKnob(EqKnob.TrebleBoost), Warning: "CH OFF"))));
            dials.Add(($"{n}-band-eq-off", EqArt.BandDial(t, new BandFrame("Game", game with { Enabled = false }, EqTarget.ForBand(5)))));
            dials.Add(($"{n}-band-sonar-error", EqArt.BandDial(t, new BandFrame("Game", game, EqTarget.ForBand(2), Warning: "SONAR ERROR")))); // the last good curve, marked
            dials.Add(($"{n}-browser-pick", EqArt.BandDial(t, new BandFrame("Aux", aux with { Bands = aux.Bands.Select(b => b.Index == 3 ? b with { GainDb = 3 } : b).ToList() }, EqTarget.ForBand(3), BandMark.Pick, Chip: "PICK 3/8"))));
            dials.Add(($"{n}-browser-adjust", EqArt.BandDial(t, new BandFrame("Game", game, EqTarget.ForBand(7), BandMark.Adjust, Active: true, Chip: "ADJUST", ChipFilled: true))));
            dials.Add(($"{n}-browser-sonar-error", EqArt.BandDial(t, new BandFrame("Game", game, EqTarget.ForBand(7), BandMark.Adjust, Chip: "ADJUST", ChipFilled: true, Warning: "SONAR ERROR"))));
            dials.Add(($"{n}-offline", EqArt.OfflineDial(t, "EQ · GAME", "GG NOT RUNNING", "SteelSeries GG isn't running.")));
            dials.Add(($"{n}-offline-sonar-error", EqArt.OfflineDial(t, "EQ · GAME", "SONAR ERROR", "HTTP 500 · retrying")));
            dials.Add(($"{n}-offline-channel-missing", EqArt.OfflineDial(t, "EQ · SPEAKERS", "CHANNEL MISSING", "Pick another in its settings.")));
            dials.Add(($"{n}-volume", EqArt.VolumeDial(t, "Chat", 0.67, false, true)));
            dials.Add(($"{n}-volume-muted", EqArt.VolumeDial(t, "Master", 0.8, true, false, "Monitor mix")));
            dials.Add(($"{n}-volume-sonar-error", EqArt.VolumeDial(t, "Chat", 0.67, false, false, "SONAR ERROR")));
            dials.Add(($"{n}-chatmix-wheel", EqArt.ChatMixDial(t, new SonarChatMix(0.3, "finiteWheel"), false, "ON HEADSET")));
            dials.Add(($"{n}-chatmix-sonar-error", EqArt.ChatMixDial(t, new SonarChatMix(-0.2, "enabled"), false, "ERROR")));
            keys.Add(($"{n}-preset-active", EqArt.PresetKey(t, "Game", "Example Arena", true, game)));
            keys.Add(($"{n}-preset-idle", EqArt.PresetKey(t, "Chat", "Example Broadcast", false, null)));
            keys.Add(($"{n}-preset-long", EqArt.PresetKey(t, "Media", "Example Music: Punchy Night Drive", false, null)));
            keys.Add(($"{n}-preset-deleted", EqArt.PresetKey(t, "Game", "Example Favorite One", false, null, "DELETED", statusIsError: true)));
            keys.Add(($"{n}-preset-offline", EqArt.PresetKey(t, "Game", "Example Arena", false, null, "SONAR IS OFF")));
            keys.Add(($"{n}-preset-sonar-error", EqArt.PresetKey(t, "Game", "Example Arena", true, game, "SONAR ERROR")));
            keys.Add(($"{n}-preset-channel-missing", EqArt.PresetKey(t, "Speakers", "Example Flat", false, null, "CHANNEL MISSING")));
            keys.Add(($"{n}-toggle-on", EqArt.ToggleKey(t, "Game", "EQ", true, game)));
            keys.Add(($"{n}-toggle-off", EqArt.ToggleKey(t, "Chat", "FX", false, chat)));
            keys.Add(($"{n}-toggle-offline", EqArt.ToggleKey(t, "", "EQ", false, null, "GG NOT RUNNING")));
            keys.Add(($"{n}-toggle-sonar-error", EqArt.ToggleKey(t, "Game", "EQ", false, null, "SONAR ERROR")));
        }
        return (keys, dials);
    }

    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        var (keys, dials) = Frames();
        foreach (var (name, svg) in keys) Save(dir, "key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Save(dir, "dial-" + name, svg, SvgCanvas.Dial);

        Page(dir, "dials-night.html", dials.Where(x => x.Name.StartsWith("night", StringComparison.Ordinal)).Select(x => x.Name), [], "#000");
        Page(dir, "dials-day.html", dials.Where(x => x.Name.StartsWith("day", StringComparison.Ordinal)).Select(x => x.Name), [], "#8a8c9d");
        Page(dir, "keys.html", [], keys.Select(x => x.Name), "#000");
        Page(dir, "index.html", dials.Select(x => x.Name), keys.Select(x => x.Name), "#000");
        Console.WriteLine($"wrote {keys.Count} keys, {dials.Count} dials and index.html to {Path.GetFullPath(dir)}; max elements {keys.Concat(dials).Max(x => x.Svg.ElementCount)}");
        return 0;
    }

    private static void Page(string dir, string file, IEnumerable<string> dials, IEnumerable<string> keys, string bg)
    {
        var html = new StringBuilder();
        html.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:16px;background:").Append(bg).Append(";color:#a2a4b4;font:12px Segoe UI,sans-serif}")
            .Append("h2{color:#f0f0f5;font-size:13px;margin:12px 0 6px}.row{display:flex;gap:12px;align-items:flex-end;flex-wrap:nowrap;margin-bottom:8px}")
            .Append("figure{margin:0;text-align:center}figcaption{margin-top:2px;font-size:10px}img{display:block}</style></head><body>");
        if (dials.Any())
        {
            html.Append("<h2>EQ dials at 200×100 (Stream Deck + strip) and 360×180 (Galleon widget)</h2>");
            foreach (var name in dials)
                html.Append($"<div class=\"row\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name}</figcaption></figure>")
                    .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"></figure></div>");
        }
        if (keys.Any())
        {
            html.Append("<h2>EQ keys at 72 / 96 / 120 / 144 px</h2>");
            foreach (var name in keys)
            {
                html.Append("<div class=\"row\">");
                foreach (var px in new[] { 72, 96, 120, 144 })
                    html.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{(px == 72 ? name : px.ToString(System.Globalization.CultureInfo.InvariantCulture))}</figcaption></figure>");
                html.Append("</div>");
            }
        }
        html.Append("</body></html>");
        File.WriteAllText(Path.Combine(dir, file), html.ToString());
    }

    private static void Save(string dir, string name, SvgDocument svg, SvgCanvas canvas)
    {
        var markup = svg.ToSvg();
        var errors = SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        foreach (var w in SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Warning)) Console.WriteLine($"  {name}: {w}");
        File.WriteAllText(Path.Combine(dir, name + ".svg"), markup);
    }
}

/// <summary>The fake Sonar's fixtures as states, without a server.</summary>
internal sealed class FakeSonarData
{
    private readonly SonarFixtureState _s = new();

    public FakeSonarData() => SonarFixtures.Populate(_s);

    public EqState State(string vad) => SonarConfig.ToState(vad, _s.Configs[_s.Selected[vad]], 1);
}
