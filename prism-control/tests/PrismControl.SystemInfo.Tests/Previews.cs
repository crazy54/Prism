using System.Text;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.SystemInfo.Actions;
using PrismControl.SystemInfo.Render;
using PrismControl.SystemInfo.Telemetry;

namespace PrismControl.SystemInfo.Tests;

/// <summary>
/// <c>dotnet run --project tests/PrismControl.SystemInfo.Tests -- --render-previews &lt;dir&gt;</c>: every key and dial view
/// (fictional machine), Night and Day, keys at 72/96/120/144 px, dials at 200×100 (Stream Deck + strip) and 360×180
/// (Galleon widget), plus the Galleon 720×384 dashboard and a Stream Deck + strip. Snap index.html with snap.mjs.
/// </summary>
public static class Previews
{
    public static int Write(string dir)
    {
        Directory.CreateDirectory(dir);
        var m = new FakeMachine();
        m.Temp.Current = (61.4, "LibreHardwareMonitor");
        var svc = m.ServiceWithHistory(70, TelemetryNeeds.Api | TelemetryNeeds.PerCore);
        var f = svc.SampleNow(TelemetryNeeds.Api | TelemetryNeeds.PerCore);
        var h = svc.History;

        var noTemp = new FakeMachine();
        var svcNoTemp = noTemp.ServiceWithHistory(30, TelemetryNeeds.Api);
        var fNoTemp = svcNoTemp.SampleNow(TelemetryNeeds.Api);

        var icue = new FakeMachine(); // LibreHardwareMonitor and HWiNFO absent: the Cooling module's shared iCUE reading
        icue.Temp.Current = (61.4, CpuTemp.CpuTempMonitor.IcueName);
        var svcIcue = icue.ServiceWithHistory(40, TelemetryNeeds.Api);
        var fIcue = svcIcue.SampleNow(TelemetryNeeds.Api);

        var hot = new FakeMachine();
        hot.Temp.Current = (96, "HWiNFO");
        hot.Memory.Frame = hot.Memory.Frame! with { UsagePct = 93, UsedMiB = 89_200 };
        hot.Drives.Current = [new("C:", "System", "NTFS", 931, 31), new("D:", "Data", "NTFS", 1863, 310)];
        var svcHot = hot.ServiceWithHistory(40, TelemetryNeeds.Api);
        var fHot = svcHot.SampleNow(TelemetryNeeds.Api | TelemetryNeeds.PerCore);

        var keys = new List<(string Name, Func<RefractionPalette, SvgDocument> Draw)>
        {
            ("cpu", t => KeyFrames.History(t, StatViews.Cpu(f, h, "usage", true, KeyFrames.Window))),
            ("cpu-clock", t => KeyFrames.History(t, StatViews.Cpu(f, h, "clock", true, KeyFrames.Window))),
            ("cpu-temp", t => KeyFrames.History(t, StatViews.Cpu(f, h, "temp", true, KeyFrames.Window))),
            ("cpu-temp-icue", t => KeyFrames.History(t, StatViews.Cpu(fIcue, svcIcue.History, "temp", true, KeyFrames.Window))),
            ("cpu-temp-none", t => KeyFrames.History(t, StatViews.Cpu(fNoTemp, svcNoTemp.History, "temp", true, KeyFrames.Window))),
            ("cpu-no-temp", t => KeyFrames.History(t, StatViews.Cpu(fNoTemp, svcNoTemp.History, "usage", true, KeyFrames.Window))),
            ("cpu-cores", t => KeyFrames.CpuCores(t, f.Cpu)),
            ("cpu-hot", t => KeyFrames.History(t, StatViews.Cpu(fHot, svcHot.History, "usage", true, KeyFrames.Window))),
            ("gpu", t => KeyFrames.History(t, StatViews.Gpu(f, h, "", "usage", KeyFrames.Window))),
            ("gpu-temp", t => KeyFrames.History(t, StatViews.Gpu(f, h, "", "temp", KeyFrames.Window))),
            ("gpu-power", t => KeyFrames.History(t, StatViews.Gpu(f, h, "", "power", KeyFrames.Window))),
            ("gpu-vram", t => KeyFrames.History(t, StatViews.Gpu(f, h, "", "vram", KeyFrames.Window))),
            ("igpu-temp", t => KeyFrames.History(t, StatViews.Gpu(f, h, "d3d:1002:13c0:0", "temp", KeyFrames.Window))),
            ("gpu-detail", t => KeyFrames.GpuDetail(t, f, "")),
            ("ram", t => KeyFrames.History(t, StatViews.Ram(f, h, "usage", KeyFrames.Window))),
            ("ram-used", t => KeyFrames.History(t, StatViews.Ram(f, h, "used", KeyFrames.Window))),
            ("ram-detail", t => KeyFrames.RamDetail(t, f.Memory)),
            ("ram-hot", t => KeyFrames.History(t, StatViews.Ram(fHot, svcHot.History, "usage", KeyFrames.Window))),
            ("disk", t => KeyFrames.History(t, StatViews.Disk(f, h, "", "activity", KeyFrames.Window))),
            ("disk-free", t => KeyFrames.History(t, StatViews.Disk(f, h, "D:", "free", KeyFrames.Window))),
            ("disk-full", t => KeyFrames.History(t, StatViews.Disk(fHot, svcHot.History, "C:", "free", KeyFrames.Window))),
            ("disk-throughput", t => KeyFrames.History(t, StatViews.Disk(f, h, "*", "throughput", KeyFrames.Window))),
            ("disk-detail", t => KeyFrames.DiskDetail(t, f, "")),
            ("net", t => KeyFrames.History(t, StatViews.Net(f, h, "", "both", false, KeyFrames.Window))),
            ("net-down-bits", t => KeyFrames.History(t, StatViews.Net(f, h, "", "down", true, KeyFrames.Window))),
            ("net-offline", t => KeyFrames.History(t, StatViews.Net(f, h, "33333333-3333-3333-3333-333333333333", "both", false, KeyFrames.Window))),
            ("net-detail", t => KeyFrames.NetDetail(t, StatViews.Net(f, h, "", "both", false, KeyFrames.Window), 1000)),
            ("no-service", t => KeyFrames.Unavailable(t, "CPU", SystemHues.Cpu)),
        };
        var settings = new SystemDialSettings();
        var dials = new List<(string Name, Func<RefractionPalette, SvgDocument> Draw)>();
        foreach (var metric in SystemDial.Metrics)
        {
            dials.Add((metric, t => SystemDial.Frame(t, f, h, metric, false, settings, false)));
            dials.Add((metric + "-detail", t => SystemDial.Frame(t, f, h, metric, true, settings, false)));
        }
        dials.Add(("cpu-turning", t => SystemDial.Frame(t, f, h, "cpu", false, settings, true)));
        dials.Add(("cpu-temp-icue", t => SystemDial.Frame(t, fIcue, svcIcue.History, "cpu", false, settings, false)));
        dials.Add(("cpu-no-temp", t => SystemDial.Frame(t, fNoTemp, svcNoTemp.History, "cpu", false, settings, false)));
        dials.Add(("cpu-hot", t => SystemDial.Frame(t, fHot, svcHot.History, "cpu", false, settings, false)));
        dials.Add(("ram-hot-detail", t => SystemDial.Frame(t, fHot, svcHot.History, "ram", true, settings, false)));
        dials.Add(("disk-full-detail", t => SystemDial.Frame(t, fHot, svcHot.History, "disk", true, settings, false)));
        dials.Add(("net-bits", t => SystemDial.Frame(t, f, h, "net", false, new SystemDialSettings { Units = "bits" }, false)));
        dials.Add(("no-service", t => DialFrames.Unavailable(t, "CPU", SystemHues.Cpu)));

        var themes = new[] { Refraction.Night, Refraction.Day };
        var maxElements = 0;
        foreach (var t in themes)
        {
            foreach (var (name, draw) in keys) maxElements = Math.Max(maxElements, Save(dir, $"key-{t.Name}-{name}", draw(t), SvgCanvas.Key));
            foreach (var (name, draw) in dials) maxElements = Math.Max(maxElements, Save(dir, $"dial-{t.Name}-{name}", draw(t), SvgCanvas.Dial));
        }

        const string css = "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:20px;background:#000;color:#a2a4b4;font:12px Segoe UI,sans-serif}" +
            "h2{color:#f0f0f5;font-size:14px;margin:16px 0 8px}.row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px}" +
            "figure{margin:0;text-align:center}figcaption{margin-top:3px}img{display:block}" +
            ".deck{display:grid;grid-template-columns:360px 360px;grid-template-rows:192px 192px;width:720px;height:384px;background:#000}" +
            ".deck div{display:flex;align-items:center;justify-content:center}.strip{display:flex;width:800px;height:100px}.pair{display:flex;gap:24px}</style></head><body>";
        var pages = new Dictionary<string, StringBuilder>();
        StringBuilder Page(string file) => pages.TryGetValue(file, out var sb) ? sb : pages[file] = new StringBuilder(css);

        var dash = Page("dashboard.html");
        foreach (var t in themes)
        {
            dash.Append($"<h2>Galleon 100 SD screen: 720×384, four 360×180 widgets ({t.Name}) | history views, then push = detail</h2><div class=\"pair\"><div class=\"deck\">");
            foreach (var w in new[] { "cpu", "gpu", "ram", "net" }) dash.Append($"<div><img src=\"dial-{t.Name}-{w}.svg\" width=\"360\" height=\"180\"></div>");
            dash.Append("</div><div class=\"deck\">");
            foreach (var w in new[] { "cpu-detail", "gpu-detail", "ram-detail", "net-detail" }) dash.Append($"<div><img src=\"dial-{t.Name}-{w}.svg\" width=\"360\" height=\"180\"></div>");
            dash.Append("</div></div>");
            dash.Append($"<h2>Stream Deck + strip: 4 × 200×100 ({t.Name})</h2><div class=\"strip\">");
            foreach (var w in new[] { "cpu", "gpu", "ram", "net" }) dash.Append($"<img src=\"dial-{t.Name}-{w}.svg\" width=\"200\" height=\"100\">");
            dash.Append("</div><div class=\"strip\" style=\"margin-top:8px\">");
            foreach (var w in new[] { "disk", "disk-detail", "cpu-turning", "cpu-no-temp" }) dash.Append($"<img src=\"dial-{t.Name}-{w}.svg\" width=\"200\" height=\"100\">");
            dash.Append("</div>");
        }
        foreach (var t in themes)
        {
            var kp = Page($"keys-{t.Name}.html");
            foreach (var px in new[] { 144, 120, 96, 72 })
            {
                kp.Append($"<h2>Keys at {px} px ({t.Name})</h2><div class=\"row\">");
                foreach (var (name, _) in keys)
                    kp.Append($"<figure><img src=\"key-{t.Name}-{name}.svg\" width=\"{px}\" height=\"{px}\">{(px >= 120 ? $"<figcaption>{name}</figcaption>" : "")}</figure>");
                kp.Append("</div>");
            }
            var dp = Page($"dials-{t.Name}.html");
            dp.Append($"<h2>Dials at 360×180 (Galleon) and 200×100 (Stream Deck +) ({t.Name})</h2><div class=\"row\">");
            foreach (var (name, _) in dials)
                dp.Append($"<figure><img src=\"dial-{t.Name}-{name}.svg\" width=\"360\" height=\"180\"><img src=\"dial-{t.Name}-{name}.svg\" width=\"200\" height=\"100\" style=\"margin-top:4px\"><figcaption>{name}</figcaption></figure>");
            dp.Append("</div>");
        }
        var index = Page("index.html");
        foreach (var file in pages.Keys.Where(k => k != "index.html").ToList()) index.Append($"<p><a style=\"color:#b8a2f2\" href=\"{file}\">{file}</a></p>");
        foreach (var (file, sb) in pages) File.WriteAllText(Path.Combine(dir, file), sb.Append("</body></html>").ToString());
        Console.WriteLine($"wrote {keys.Count * 2} keys and {dials.Count * 2} dials (max {maxElements} elements per frame) + pages to {Path.GetFullPath(dir)}");
        return 0;
    }

    /// <summary>
    /// <c>-- --render-live &lt;dir&gt;</c>: samples THIS PC for a few seconds (read-only) and renders the real frames to live.html.
    /// </summary>
    public static async Task<int> WriteLiveAsync(string dir)
    {
        Directory.CreateDirectory(dir);
        await using var svc = TelemetryService.CreateDefault(PrismControl.Core.Hosting.NullLog.Instance, TimeProvider.System, new MemorySampler());
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        svc.Start(cts.Token);
        using var lease = svc.Acquire(TelemetryNeeds.Api | TelemetryNeeds.PerCore);
        for (var i = 0; i < 6; i++) await svc.NextFrameAsync(TimeSpan.FromSeconds(3));
        var f = svc.Latest;
        var h = svc.History;
        var igpu = f?.Gpus.FirstOrDefault(g => g.Integrated)?.Id;
        var s = new SystemDialSettings();
        var frames = new List<(string Name, Func<RefractionPalette, SvgDocument> Draw, bool Key)>
        {
            ("cpu", t => KeyFrames.History(t, StatViews.Cpu(f, h, "usage", true, KeyFrames.Window)), true),
            ("cpu-cores", t => KeyFrames.CpuCores(t, f?.Cpu), true),
            ("cpu-temp", t => KeyFrames.History(t, StatViews.Cpu(f, h, "temp", true, KeyFrames.Window)), true),
            ("gpu", t => KeyFrames.History(t, StatViews.Gpu(f, h, "", "usage", KeyFrames.Window)), true),
            ("gpu-detail", t => KeyFrames.GpuDetail(t, f, ""), true),
            ("igpu-temp", t => KeyFrames.History(t, StatViews.Gpu(f, h, igpu, "temp", KeyFrames.Window)), true),
            ("ram", t => KeyFrames.History(t, StatViews.Ram(f, h, "usage", KeyFrames.Window)), true),
            ("disk", t => KeyFrames.History(t, StatViews.Disk(f, h, "", "activity", KeyFrames.Window)), true),
            ("disk-detail", t => KeyFrames.DiskDetail(t, f, ""), true),
            ("net", t => KeyFrames.History(t, StatViews.Net(f, h, "", "both", false, KeyFrames.Window)), true),
        };
        foreach (var m in SystemDial.Metrics)
        {
            frames.Add(("dial-" + m, t => SystemDial.Frame(t, f, h, m, false, s, false), false));
            frames.Add(("dial-" + m + "-detail", t => SystemDial.Frame(t, f, h, m, true, s, false), false));
        }
        var html = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{margin:16px;background:#000;color:#a2a4b4;font:12px Segoe UI,sans-serif}h2{color:#f0f0f5;font-size:13px}img{margin:4px}</style></head><body>");
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            html.Append($"<h2>Live from this PC ({t.Name}) | CPU temp: {System.Net.WebUtility.HtmlEncode(svc.CpuTemp.Message)}</h2><div>");
            foreach (var (name, draw, key) in frames.Where(x => x.Key))
            {
                Save(dir, $"live-{t.Name}-{name}", draw(t), SvgCanvas.Key);
                html.Append($"<img src=\"live-{t.Name}-{name}.svg\" width=\"144\" height=\"144\">");
            }
            html.Append("</div><div>");
            foreach (var (name, draw, _) in frames.Where(x => !x.Key))
            {
                Save(dir, $"live-{t.Name}-{name}", draw(t), SvgCanvas.Dial);
                html.Append($"<img src=\"live-{t.Name}-{name}.svg\" width=\"360\" height=\"180\">");
            }
            html.Append("</div>");
        }
        File.WriteAllText(Path.Combine(dir, "live.html"), html.Append("</body></html>").ToString());
        Console.WriteLine($"live frames written; {svc.Cost.Ticks} ticks, last {svc.Cost.LastUs / 1000:0.00} ms ({svc.Cost.LastBreakdown}); CPU temp: {svc.CpuTemp.Message}");
        return 0;
    }

    private static int Save(string dir, string name, SvgDocument svg, SvgCanvas canvas)
    {
        var markup = svg.ToSvg();
        var errors = SvgLint.Check(markup, canvas, svg.MaxElements).Where(i => i.Severity == LintSeverity.Error).ToList();
        if (errors.Count > 0) throw new InvalidOperationException($"{name}: " + string.Join("; ", errors));
        File.WriteAllText(Path.Combine(dir, name + ".svg"), markup);
        return svg.ElementCount;
    }
}
