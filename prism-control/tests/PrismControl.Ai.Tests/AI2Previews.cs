using System.Net;
using System.Text;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Art;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Status;
using PrismControl.Core.Art;
using PrismControl.Core.Render;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>
/// AI2's preview pages and icons (category <c>ai2-tools</c>; AI1 owns Program.cs). They only write when asked:
/// <c>PRISM_AI2_OUT=&lt;dir&gt;</c> → night/day SVG frames + index-ai2-night.html / index-ai2-day.html at real sizes;
/// <c>PRISM_AI2_ICONS=&lt;dir&gt;</c> → imgs/actions/ai/&lt;id&gt;/{icon,key}.svg. Otherwise they skip.
/// </summary>
public class AI2Tools
{
    private sealed record Frame(string Name, string Svg);

    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

    private static ProviderHealthView H(string id, Health? h, params (string Name, Health Health)[] comps)
    {
        var p = HealthCatalog.Find(id)!;
        var fact = h is { } v ? Fact<Health>.Reported(v, FactSource.StatusPage, Now.AddMinutes(-2), TimeSpan.FromMinutes(6)) : Fact<Health>.Unknown;
        return new ProviderHealthView(p.Id, p.Name, p.Short, p.PageUrl, fact, comps.Select((c, i) => new ServiceComponent("c" + i, c.Name, c.Health)).ToList(), null,
            h is null ? HealthFetchState.NeverFetched : HealthFetchState.Ok, Now.AddMinutes(-2));
    }

    private static AppView App(string id, bool running, bool front = false, bool voice = false, int tasks = -1, bool installed = true)
    {
        var def = AppCatalog.Find(id)!;
        return new AppView(def, installed,
            Fact<bool>.Observed(running, FactSource.Process, Now, TimeSpan.FromSeconds(6)),
            Fact<bool>.Observed(front, FactSource.WinEvent, Now, TimeSpan.FromSeconds(6)),
            running ? Fact<bool>.Inferred(voice, FactSource.CoreAudio, Now, TimeSpan.FromSeconds(6)) : Fact<bool>.Observed(false, FactSource.Process, Now, TimeSpan.FromSeconds(6)),
            Fact<bool>.Unknown,
            tasks < 0 ? Fact<int>.Unknown : Fact<int>.Inferred(tasks, FactSource.Hook, Now, TimeSpan.FromSeconds(6)),
            running ? [1] : []);
    }

    private static IReadOnlyList<CodexWindowView> Codex(double five, double week, bool reset = false)
    {
        var svc = new CodexLimitsService("unused", new ManualTimeProvider(Now), new CapturingLog());
        svc.Observe(new Sessions.CodexRateLimits("t", [new(five, 300, reset ? Now.AddMinutes(-5) : Now.AddHours(2).AddMinutes(14)), new(week, 10080, Now.AddDays(3).AddHours(4))], Now.AddMinutes(-12)));
        return svc.Windows(Now);
    }

    private static BedrockSnapshot Bedrock(BedrockState state, double throttles = 0)
    {
        var series = BedrockUsageService.Parse(AI2Fixtures.MetricData(Now, 12_400, 3_100, throttles));
        var full = new BedrockSeries(
            Enumerable.Range(0, 28).Select(i => new UsagePoint(Now.AddMinutes(-29 + i), 6000 + 5000 * Math.Sin(i / 3.0) + i * 150)).ToList(),
            Enumerable.Range(0, 28).Select(i => new UsagePoint(Now.AddMinutes(-29 + i), 1800 + 900 * Math.Cos(i / 4.0))).ToList(),
            Enumerable.Range(0, 28).Select(i => new UsagePoint(Now.AddMinutes(-29 + i), 8 + 4 * Math.Sin(i / 2.0))).ToList(),
            Enumerable.Range(0, 28).Select(i => new UsagePoint(Now.AddMinutes(-29 + i), i is 9 or 17 or 18 ? throttles : 0)).ToList());
        _ = series;
        var fact = state == BedrockState.Ok ? Fact<BedrockSeries>.Reported(full, FactSource.CloudWatch, Now.AddMinutes(-2), TimeSpan.FromMinutes(15)) : Fact<BedrockSeries>.Unknown;
        return new BedrockSnapshot(state, "us-east-1", "PrismReadOnly", fact, Now.AddMinutes(-2), null);
    }

    private static AdminSnapshot Admin(AdminState state) => new(AdminProvider.Anthropic, state,
        state == AdminState.Ok ? Fact<CostSummary>.Reported(new CostSummary(342.18m, "USD", "month to date", "org · daily · not real-time"), FactSource.AdminApi, Now.AddMinutes(-6), TimeSpan.FromHours(1)) : Fact<CostSummary>.Unknown,
        state == AdminState.Ok ? Fact<double>.Reported(2_140_000, FactSource.AdminApi, Now.AddMinutes(-6), TimeSpan.FromHours(1)) : Fact<double>.Unknown,
        Now.AddMinutes(-6), "••••abcd");

    [Test(Category = "ai2-tools")]
    public void Write_previews()
    {
        var dir = Environment.GetEnvironmentVariable("PRISM_AI2_OUT");
        if (string.IsNullOrWhiteSpace(dir)) Assert.Skip("set PRISM_AI2_OUT to write previews");
        Directory.CreateDirectory(dir!);
        var mixed = new List<ProviderHealthView>
        {
            H("claude", Health.Degraded, ("Claude Code", Health.Degraded), ("Claude API", Health.Operational), ("claude.ai", Health.Operational), ("Console", Health.Operational)),
            H("openai", Health.Operational, ("Chat Completions", Health.Operational)),
            H("codex", Health.MajorOutage, ("Codex CLI", Health.MajorOutage), ("Codex app", Health.PartialOutage)),
            H("github", Health.Operational, ("Copilot", Health.Operational)),
            H("cursor", Health.Maintenance, ("Cursor IDE", Health.Maintenance)),
            H("bedrock", Health.PartialOutage, ("us-west-2", Health.PartialOutage), ("us-east-1", Health.Operational)),
            H("gemini", Health.Operational, ("Gemini", Health.Operational)),
            H("vertex", null),
        };
        foreach (var theme in new[] { "night", "day" })
        {
            var t = theme == "night" ? Refraction.Night : Refraction.Day;
            var keys = new List<Frame>();
            var dials = new List<Frame>();
            keys.Add(new("health-claude-degraded", HealthArt.Key(t, mixed[0], Now).ToSvg()));
            keys.Add(new("health-openai-ok", HealthArt.Key(t, mixed[1], Now).ToSvg()));
            keys.Add(new("health-codex-outage", HealthArt.Key(t, mixed[2], Now).ToSvg()));
            keys.Add(new("health-cursor-maint", HealthArt.Key(t, mixed[4], Now).ToSvg()));
            keys.Add(new("health-bedrock-partial", HealthArt.Key(t, mixed[5], Now).ToSvg()));
            keys.Add(new("health-vertex-checking", HealthArt.Key(t, mixed[7], Now).ToSvg()));
            keys.Add(new("health-github-stale", HealthArt.Key(t, mixed[3], Now.AddMinutes(9)).ToSvg()));
            keys.Add(new("health-github-opened", HealthArt.Key(t, mixed[3], Now, "OPENED").ToSvg()));
            keys.Add(new("health-claude-details", HealthArt.Details(t, mixed[0], Now).ToSvg()));
            var codex = Codex(42, 18);
            keys.Add(new("usage-codex-5h", UsageArt.CodexKey(t, codex[0], Now).ToSvg()));
            keys.Add(new("usage-codex-week-91", UsageArt.CodexKey(t, Codex(30, 91)[1], Now).ToSvg()));
            keys.Add(new("usage-codex-reset", UsageArt.CodexKey(t, Codex(97, 40, reset: true)[0], Now).ToSvg()));
            keys.Add(new("usage-codex-none", UsageArt.CodexKey(t, null, Now).ToSvg()));
            keys.Add(new("usage-bedrock-ok", UsageArt.BedrockKey(t, Bedrock(BedrockState.Ok, 3), Now).ToSvg()));
            keys.Add(new("usage-bedrock-signin", UsageArt.BedrockKey(t, Bedrock(BedrockState.SignInNeeded), Now).ToSvg()));
            keys.Add(new("usage-admin-ok", UsageArt.AdminKey(t, Admin(AdminState.Ok), Now).ToSvg()));
            keys.Add(new("usage-admin-off", UsageArt.AdminKey(t, Admin(AdminState.Off), Now).ToSvg()));
            keys.Add(new("app-claude-front", AppArt.Key(t, App("claude-desktop", true, front: true), Now).ToSvg()));
            keys.Add(new("app-chatgpt-tasks", AppArt.Key(t, App("chatgpt", true, tasks: 2), Now).ToSvg()));
            keys.Add(new("app-copilot-voice", AppArt.Key(t, App("copilot", true, voice: true), Now).ToSvg()));
            keys.Add(new("app-vscode-off", AppArt.Key(t, App("vscode", false), Now).ToSvg()));
            keys.Add(new("app-cursor-missing", AppArt.Key(t, App("cursor", false, installed: false), Now).ToSvg()));
            keys.Add(new("app-chatgpt-focused", AppArt.Key(t, App("chatgpt", true), Now, "FOCUSED").ToSvg()));
            keys.Add(new("ask-claude", AskArt.Key(t, AskTargets.Find("claude-desktop")!, true).ToSvg()));
            keys.Add(new("ask-chatgpt-web", AskArt.Key(t, AskTargets.Find("chatgpt-web")!, true).ToSvg()));
            keys.Add(new("ask-opened", AskArt.Key(t, AskTargets.Find("chatgpt")!, true, "OPENED · NOT SENT").ToSvg()));
            keys.Add(new("ask-cursor-missing", AskArt.Key(t, AskTargets.Find("cursor")!, false).ToSvg()));
            keys.Add(new("dictate-winh", DictateArt.Key(t, "WIN+H", Apps.Actions.DictateAction.KeyModeLabel(DictateMode.Auto), false).ToSvg()));
            keys.Add(new("dictate-holding", DictateArt.Key(t, "HOLD CTRL+I", Apps.Actions.DictateAction.KeyModeLabel(DictateMode.Auto), true).ToSvg()));
            keys.Add(new("dictate-notvscode", DictateArt.Key(t, "HOLD CTRL+I", Apps.Actions.DictateAction.KeyModeLabel(DictateMode.VsCode), false, DictateArt.ResultText(DictateResult.NotVsCode), true).ToSvg()));

            dials.Add(new("strip-galleon", HealthArt.Strip(t, mixed, 2, true, Now).ToSvg()));
            dials.Add(new("strip-plus-page2", HealthArt.Strip(t, mixed, 5, false, Now).ToSvg()));
            dials.Add(new("strip-checking", HealthArt.Strip(t, mixed.Select(m => H(m.Id, null)).ToList(), 0, true, Now).ToSvg()));
            dials.Add(new("codex-5h", UsageArt.CodexDial(t, codex, 300, Now, Now.AddMinutes(-12)).ToSvg()));
            dials.Add(new("codex-week", UsageArt.CodexDial(t, Codex(76, 93), 10080, Now, Now.AddMinutes(-12)).ToSvg()));
            dials.Add(new("codex-reset", UsageArt.CodexDial(t, Codex(97, 40, reset: true), 300, Now, Now.AddHours(-6)).ToSvg()));
            dials.Add(new("codex-none", UsageArt.CodexDial(t, [], 300, Now, null).ToSvg()));
            dials.Add(new("bedrock-tokens", UsageArt.BedrockDial(t, Bedrock(BedrockState.Ok, 3), 0, Now).ToSvg()));
            dials.Add(new("bedrock-throttles", UsageArt.BedrockDial(t, Bedrock(BedrockState.Ok, 3), 2, Now).ToSvg()));
            dials.Add(new("bedrock-signin", UsageArt.BedrockDial(t, Bedrock(BedrockState.SignInNeeded), 0, Now).ToSvg()));
            dials.Add(new("bedrock-off", UsageArt.BedrockDial(t, Bedrock(BedrockState.Off), 0, Now).ToSvg()));
            dials.Add(new("admin-cost", UsageArt.AdminDial(t, Admin(AdminState.Ok), 0, Now).ToSvg()));
            dials.Add(new("admin-nokey", UsageArt.AdminDial(t, Admin(AdminState.NoKey), 0, Now).ToSvg()));
            dials.Add(new("ops-galleon", OpsArt.Widget(t, mixed, 0, codex, Bedrock(BedrockState.Ok), Now).ToSvg()));
            dials.Add(new("ops-bedrock-selected", OpsArt.Widget(t, mixed, 5, codex, Bedrock(BedrockState.Ok, 2), Now).ToSvg()));
            var rot = AskTargets.All.Where(x => x.Kind == AskLinkKind.Documented && x.Id != "cursor").ToList();
            dials.Add(new("ask-dial", AskArt.Dial(t, rot, 0, _ => true).ToSvg()));
            dials.Add(new("ask-dial-opened", AskArt.Dial(t, rot, 3, _ => true, "OPENED · NOT SENT").ToSvg()));
            dials.Add(new("dictate-dial", DictateArt.Dial(t, "WIN+H", Apps.Actions.DictateAction.ModeLabel(DictateMode.Auto)).ToSvg()));

            foreach (var f in keys.Concat(dials))
            {
                var errors = SvgLint.Check(f.Svg, keys.Contains(f) ? SvgCanvas.Key : SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).ToList();
                Assert.Empty(errors.Select(e => $"{f.Name}: {e}"));
                File.WriteAllText(Path.Combine(dir!, $"ai2-{theme}-{f.Name}.svg"), f.Svg);
            }
            File.WriteAllText(Path.Combine(dir!, $"index-ai2-{theme}.html"), Page(theme, t, keys, dials));
        }
    }

    private static string Page(string theme, RefractionPalette t, List<Frame> keys, List<Frame> dials)
    {
        var sb = new StringBuilder();
        sb.Append($"<!doctype html><html><head><meta charset=\"utf-8\"><title>AI2 previews ({theme})</title><style>");
        sb.Append($"body{{margin:0;padding:20px;background:{(theme == "night" ? "#05060a" : "#e9e8f0")};color:{t.Ink.Hex};font:12px Segoe UI,sans-serif}}");
        sb.Append("h2{font-size:14px;margin:18px 0 8px;font-weight:600}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}");
        sb.Append(".cell{display:flex;flex-direction:column;align-items:center;gap:4px}.cell span{font-size:10px;opacity:.7;max-width:170px;text-align:center}");
        sb.Append("img{display:block;border-radius:12px}.dial img{border-radius:6px}</style></head><body>");
        sb.Append($"<h2>AI2 keys at 160 px (Galleon) · {theme}</h2><div class=\"row\">");
        foreach (var k in keys) sb.Append($"<div class=\"cell\"><img src=\"ai2-{theme}-{k.Name}.svg\" width=\"160\" height=\"160\"><span>{WebUtility.HtmlEncode(k.Name)}</span></div>");
        sb.Append("</div><h2>Keys at 120 px (Stream Deck +) and 72 px (Standard)</h2><div class=\"row\">");
        foreach (var k in keys)
            sb.Append($"<div class=\"cell\"><img src=\"ai2-{theme}-{k.Name}.svg\" width=\"120\" height=\"120\"><img src=\"ai2-{theme}-{k.Name}.svg\" width=\"72\" height=\"72\"></div>");
        sb.Append("</div><h2>Widgets at 360×180 (Galleon screen)</h2><div class=\"row\">");
        foreach (var d in dials) sb.Append($"<div class=\"cell dial\"><img src=\"ai2-{theme}-{d.Name}.svg\" width=\"360\" height=\"180\"><span>{WebUtility.HtmlEncode(d.Name)}</span></div>");
        sb.Append("</div><h2>Widgets at 200×100 (Stream Deck + strip segment)</h2><div class=\"row\">");
        foreach (var d in dials) sb.Append($"<div class=\"cell dial\"><img src=\"ai2-{theme}-{d.Name}.svg\" width=\"200\" height=\"100\"><span>{WebUtility.HtmlEncode(d.Name)}</span></div>");
        sb.Append("</div></body></html>");
        return sb.ToString();
    }

    /// <summary>
    /// The one live fetch per endpoint (saved with curl on 2026-10-16 into PRISM_AI2_LIVE_DIR): every real body parses and every
    /// provider projects to a reading. No network here: the files are read from disk.
    /// </summary>
    [Test(Category = "ai2-tools")]
    public void Saved_live_bodies_parse()
    {
        var dir = Environment.GetEnvironmentVariable("PRISM_AI2_LIVE_DIR");
        if (string.IsNullOrWhiteSpace(dir)) Assert.Skip("set PRISM_AI2_LIVE_DIR to the saved bodies");
        var files = new Dictionary<string, (string File, string? ContentType)>
        {
            ["anthropic"] = ("anthropic-summary.body", "application/json; charset=utf-8"),
            ["openai"] = ("openai-components.body", "application/json"),
            ["github"] = ("github-summary.body", "application/json; charset=utf-8"),
            ["cursor"] = ("cursor-summary.body", "application/json; charset=utf-8"),
            ["aws"] = ("aws-currentevents.body", "application/json;charset=utf-16"),
            ["gworkspace"] = ("workspace-incidents.body", "application/json"),
            ["gcloud"] = ("gcloud-incidents.body", "application/json"),
        };
        foreach (var src in HealthCatalog.Sources)
        {
            var (file, ct) = files[src.Id];
            var page = StatusParsers.Parse(src.Kind, File.ReadAllBytes(Path.Combine(dir!, file)), ct, Now);
            Assert.NotNull(page, src.Id);
            foreach (var p in HealthCatalog.Providers.Where(p => p.SourceId == src.Id))
            {
                var r = HealthCatalog.Project(p, page!, ["us-east-1", "us-east-2", "us-west-2"]);
                Assert.NotNull(r, p.Id);
                if (p.Components.Count > 0) Assert.Equal(p.Components.Count, r!.Components.Count, p.Id + ": every pinned id is on the live page");
                Console.WriteLine($"  live {p.Id,-8} {r!.Health,-14} {r.Components.Count} components");
            }
        }
    }

    [Test(Category = "ai2-tools")]
    public void Write_icons()
    {
        var dir = Environment.GetEnvironmentVariable("PRISM_AI2_ICONS");
        if (string.IsNullOrWhiteSpace(dir)) Assert.Skip("set PRISM_AI2_ICONS to write icons");
        var t = Refraction.Night;
        var items = new (string Id, GlyphPart[] Glyph, string Label)[]
        {
            ("health", Ai2Glyphs.Pulse, "HEALTH"),
            ("healthstrip", Ai2Glyphs.Pulse, "AI STATUS"),
            ("usage", Ai2Glyphs.Gauge, "USAGE"),
            ("ops", Ai2Glyphs.Ops, "AI OPS"),
            ("app", Ai2Glyphs.Window, "AI APP"),
            ("ask", AiGlyphs.Input, "ASK AI"),
            ("dictate", Ai2Glyphs.Mic, "DICTATE"),
        };
        foreach (var (id, glyph, label) in items)
        {
            var d = Path.Combine(dir!, id);
            Directory.CreateDirectory(d);
            var key = KeyArt.Base(t);
            var hue = AiPalette.Module(t);
            AiGlyphs.Draw(key, glyph, 48, 26, 48, t.KeyInk, hue.Vivid);
            AiText.Draw(key, label, 72, 104, 19, t.KeyMuted, TextAlign.Middle);
            KeyArt.HueIndex(key, hue, on: false);
            File.WriteAllText(Path.Combine(d, "icon.svg"), AiGlyphs.ActionIcon(glyph));
            File.WriteAllText(Path.Combine(d, "key.svg"), key.ToSvg());
        }
    }
}
