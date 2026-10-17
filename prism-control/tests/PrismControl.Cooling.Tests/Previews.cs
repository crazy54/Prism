using System.Text;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Cooling.Actions;
using PrismControl.Cooling.Art;
using PrismControl.Cooling.Icue;
using PrismControl.Testing;

namespace PrismControl.Cooling.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.Cooling.Tests -- --render-previews &lt;dir&gt;</c>: cooling keys at 72/96/120/144 px
/// and dial views at 200×100 (Stream Deck + segment) and 360×180 (Galleon widget), Night and Day, plus a full Galleon
/// screen (four dials, 720×360). The data is a fictional 5-minute story: a CPU load step, the radiator fans ramping with the
/// coolant, then the pump stepping up and putting a dent in the CPU temperature.
/// </summary>
public static class Previews
{
    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        var (svc, icue, ids) = Story();
        var keys = new List<(string Name, string Svg)>();
        var dials = new List<(string Name, SvgDocument Svg)>();
        var screens = new List<(string Name, SvgDocument[] Widgets)>();
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            keys.Add(($"{t.Name}-fan", RenderKey<FanKey>(t, svc, new SensorKeySettings { SensorId = ids.RadFan, WindowMin = 5 })));
            keys.Add(($"{t.Name}-fan-stats", RenderKey<FanKey>(t, svc, new SensorKeySettings { SensorId = ids.RadFan, WindowMin = 5, ShowStats = true })));
            keys.Add(($"{t.Name}-pump", RenderKey<PumpKey>(t, svc, new SensorKeySettings { WindowMin = 5 })));
            keys.Add(($"{t.Name}-group", RenderKey<FanGroupKey>(t, svc, new FanGroupSettings())));
            keys.Add(($"{t.Name}-case-max", RenderKey<FanGroupKey>(t, svc, new FanGroupSettings { Group = "case", Stat = "max" })));
            keys.Add(($"{t.Name}-no-icue", RenderKey<FanKey>(t, Offline(), new SensorKeySettings())));
            foreach (var view in CoolingDial.Views)
            {
                dials.Add(($"{t.Name}-{view}", CoolingDial.Frame(t, svc, new CoolingDialSettings { View = view }, false)));
                dials.Add(($"{t.Name}-{view}-detail", CoolingDial.Frame(t, svc, new CoolingDialSettings { View = view, Detail = true }, true)));
            }
            dials.Add(($"{t.Name}-offline", CoolingDial.Frame(t, Offline(), new CoolingDialSettings(), false)));
            screens.Add(($"{t.Name}-galleon", CoolingDial.Views.Select(v => CoolingDial.Frame(t, svc, new CoolingDialSettings { View = v }, false)).ToArray()));
        }

        foreach (var (name, svg) in keys) Save(dir, "key-" + name, svg, SvgCanvas.Key);
        foreach (var (name, svg) in dials) Save(dir, "dial-" + name, svg, SvgCanvas.Dial);
        foreach (var (name, widgets) in screens)
            for (var i = 0; i < widgets.Length; i++) Save(dir, $"screen-{name}-{i}", widgets[i], SvgCanvas.Dial);

        var html = new StringBuilder();
        html.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:24px;background:#000;color:#a2a4b4;font:13px Segoe UI,sans-serif}")
            .Append("h2{color:#f0f0f5;font-size:14px;margin:18px 0 8px}.row{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px}")
            .Append("figure{margin:0;text-align:center}figcaption{margin-top:4px}img{display:block}")
            .Append(".screen{display:grid;grid-template-columns:360px 360px;gap:0;width:720px;background:#000;padding:12px 0}</style></head><body>");
        html.Append("<h2>Galleon 100 SD screen: four Cooling dials (dent, overview, fans, pump) at 360×180 each</h2>");
        foreach (var (name, widgets) in screens)
        {
            html.Append($"<figure><div class=\"screen\">");
            for (var i = 0; i < widgets.Length; i++) html.Append($"<img src=\"screen-{name}-{i}.svg\" width=\"360\" height=\"180\">");
            html.Append($"</div><figcaption>{name}</figcaption></figure>");
        }
        html.Append("<h2>Keys at 72 / 96 / 120 / 144 px</h2>");
        foreach (var (name, _) in keys)
        {
            html.Append("<div class=\"row\">");
            foreach (var px in new[] { 72, 96, 120, 144 })
                html.Append($"<figure><img src=\"key-{name}.svg\" width=\"{px}\" height=\"{px}\"><figcaption>{name} {px}</figcaption></figure>");
            html.Append("</div>");
        }
        html.Append("<h2>Dials at 200×100 (Stream Deck + strip segment) and 360×180 (Galleon widget)</h2>");
        foreach (var (name, _) in dials)
            html.Append($"<div class=\"row\"><figure><img src=\"dial-{name}.svg\" width=\"200\" height=\"100\"><figcaption>{name} 200×100</figcaption></figure>")
                .Append($"<figure><img src=\"dial-{name}.svg\" width=\"360\" height=\"180\"><figcaption>{name} 360×180</figcaption></figure></div>");
        html.Append("</body></html>");
        File.WriteAllText(Path.Combine(dir, "index.html"), html.ToString());
        Console.WriteLine($"wrote {keys.Count} keys, {dials.Count} dials, {screens.Count} screens and index.html to {Path.GetFullPath(dir)}");
        return 0;
    }

    private sealed record StoryIds(string RadFan);

    /// <summary>5 minutes at 1 Hz. t=40 s a load step heats the CPU; the radiator fans follow the coolant up; at t=190 s the pump
    /// steps from 1900 to 2700 RPM and the CPU drops ~5 °C while the coolant barely moves: the pump made the dent.</summary>
    private static (CoolingService Svc, FakeProvider Icue, StoryIds Ids) Story()
    {
        var (svc, icue, _, time, _) = Sample.Service();
        double cpu = 44, liquid = 33.5;
        var rng = new Random(7);
        for (var s = 0; s < 300; s++)
        {
            var load = s >= 40;
            var pump = s >= 190 ? 2700 : 1900;
            var radFans = 1050 + Math.Clamp((liquid - 33.5) * 140, 0, 700);
            var target = load ? 71 - (pump - 1900) / 160.0 - (radFans - 1050) / 200.0 : 44;
            cpu += (target - cpu) * (load && s < 60 ? 0.25 : 0.12) + (rng.NextDouble() - 0.5) * 0.6;
            liquid += ((load ? 39.5 : 33.5) - liquid) * 0.012 - (radFans - 1050) / 1e5;
            var list = new List<RawSensor>();
            for (var i = 1; i <= 6; i++) list.Add(Sample.Fan($"iCUE LINK RX RGB #{i}: Fan", Math.Round((i <= 3 ? radFans : 900) + rng.Next(-6, 7) + i)));
            for (var i = 1; i <= 4; i++) list.Add(Sample.Fan($"iCUE LINK QX RGB #{i}: Fan", 1200.0 + rng.Next(-5, 6) + i * 4));
            list.Add(Sample.Pump(pump + rng.Next(-12, 13)));
            list.Add(Sample.Coolant(Math.Round(liquid, 2)));
            list.Add(Sample.Cpu(Math.Round(cpu, 2)));
            list.Add(Sample.Fan("Fan #1", 1650, "NVIDIA GeForce Example GPU"));
            icue.Set(ProviderState.Connected, [.. list]);
            svc.SampleNow();
            if (s == 0)
            {
                foreach (var n in new[] { 1, 2, 3 }) svc.SetRole(svc.Current.Sensors.First(x => x.OriginalName == $"iCUE LINK RX RGB #{n}: Fan").Id, "radiator");
                foreach (var n in new[] { 4, 5, 6 }) svc.SetRole(svc.Current.Sensors.First(x => x.OriginalName == $"iCUE LINK RX RGB #{n}: Fan").Id, "case");
                svc.SetName(svc.Current.Sensors.First(x => x.OriginalName == "iCUE LINK RX RGB #1: Fan").Id, "Rad top");
            }
            time.Advance(TimeSpan.FromSeconds(1));
        }
        return (svc, icue, new StoryIds(svc.Current.Sensors.First(x => x.OriginalName == "iCUE LINK RX RGB #1: Fan").Id));
    }

    private static CoolingService Offline()
    {
        var (svc, icue, _, _, _) = Sample.Service();
        icue.Set(ProviderState.NotRunning);
        svc.SampleNow();
        return svc;
    }

    private static string RenderKey<TAction>(RefractionPalette t, CoolingService svc, object settings) where TAction : Core.Actions.ActionBase, new()
    {
        var globals = new System.Text.Json.Nodes.JsonObject { ["core"] = new System.Text.Json.Nodes.JsonObject { ["theme"] = t.Name } };
        var h = ActionHarness<TAction>.AppearAsync(TestDevices.Plus, new(0, 0), Core.Devices.Controller.Keypad, settings, s => s.Add(svc), globals).GetAwaiter().GetResult();
        var svg = h.LastSvg ?? throw new InvalidOperationException("no frame");
        h.DisposeAsync().AsTask().GetAwaiter().GetResult();
        return svg;
    }

    private static void Save(string dir, string name, SvgDocument svg, SvgCanvas canvas) => Save(dir, name, svg.ToSvg(), canvas);

    private static void Save(string dir, string name, string markup, SvgCanvas canvas)
    {
        var errors = SvgLint.Check(markup, canvas).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        File.WriteAllText(Path.Combine(dir, name + ".svg"), markup);
    }
}
