using PrismControl.Ai.Apps;
using PrismControl.Ai.Apps.Actions;
using PrismControl.Ai.Art;
using PrismControl.Ai.Services.Art;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Status;
using PrismControl.Core.Render.Tokens;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>
/// Every fixed word AI2 draws fits its place without an ellipsis (stroke font, real widths), on keys and on 200×100 widgets.
/// Only live, open-ended text (component names, incident titles) may ever be shortened.
/// </summary>
public class AI2FitTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);
    private static readonly Health[] Levels = [Health.Operational, Health.Maintenance, Health.Degraded, Health.PartialOutage, Health.MajorOutage];

    private static ProviderHealthView View(ProviderDef p, Health? h, HealthFetchState state = HealthFetchState.Ok, int affected = 0) =>
        new(p.Id, p.Name, p.Short, p.PageUrl,
            h is { } v ? Fact<Health>.Reported(v, FactSource.StatusPage, Now.AddMinutes(-3), TimeSpan.FromMinutes(6)) : Fact<Health>.Unknown,
            Enumerable.Range(0, affected).Select(i => new ServiceComponent("c" + i, "C" + i, Health.Degraded)).ToList(), null, state, Now);

    private static AppView App(AppDef def, bool running, bool front, bool voice, int tasks, bool installed) => new(def, installed,
        Fact<bool>.Observed(running, FactSource.Process, Now, TimeSpan.FromSeconds(6)),
        Fact<bool>.Observed(front, FactSource.WinEvent, Now, TimeSpan.FromSeconds(6)),
        Fact<bool>.Inferred(voice, FactSource.CoreAudio, Now, TimeSpan.FromSeconds(6)),
        Fact<bool>.Unknown,
        tasks < 0 ? Fact<int>.Unknown : Fact<int>.Inferred(tasks, FactSource.Hook, Now, TimeSpan.FromSeconds(6)), running ? [1] : []);

    private static void NoEllipsis(AiText.Capture text)
    {
        var cut = text.Lines.Where(l => l.Contains('…')).Distinct().ToList();
        Assert.Empty(cut.Select(c => "shortened: " + c));
    }

    [Test]
    public void Key_words_fit()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            using var text = AiText.Record();
            foreach (var p in HealthCatalog.Providers)
            {
                foreach (var h in Levels) { HealthArt.Key(t, View(p, h), Now); HealthArt.Key(t, View(p, h, affected: 3), Now); HealthArt.Key(t, View(p, h), Now.AddMinutes(9)); }
                HealthArt.Key(t, View(p, null, HealthFetchState.NeverFetched), Now);
                HealthArt.Key(t, View(p, null, HealthFetchState.Errored), Now);
                HealthArt.Key(t, View(p, null), Now);
                foreach (var f in new[] { "OPENED", "SAFE MODE" }) HealthArt.Key(t, View(p, Health.Operational), Now, f);
                foreach (var h in Levels) HealthArt.Details(t, View(p, h), Now);
                HealthArt.Details(t, View(p, null), Now);
                // The catalog's own component labels (and Bedrock's region labels) must fit the details rows too.
                var labels = p.AwsBedrock ? ["us-east-1", "ap-southeast-2", "eu-central-1"] : p.Components.Select(c => c.Label).ToList();
                HealthArt.Details(t, View(p, Health.Degraded) with { Components = labels.Select(l => new ServiceComponent(l, l, Health.Degraded)).ToList() }, Now);
            }
            foreach (var r in Enum.GetValues<AskResult>()) foreach (var target in AskTargets.All) AskArt.Key(t, target, true, AskArt.ResultText(r), r != AskResult.Opened);
            foreach (var target in AskTargets.All) { AskArt.Key(t, target, true); AskArt.Key(t, target, false); }
            foreach (var m in Enum.GetValues<DictateMode>())
            {
                foreach (var hint in new[] { "WIN+H", "HOLD CTRL+I", "SAFE MODE" }) DictateArt.Key(t, hint, DictateAction.KeyModeLabel(m), false);
                DictateArt.Key(t, "HOLD CTRL+I", DictateAction.KeyModeLabel(m), true);
                foreach (var r in Enum.GetValues<DictateResult>())
                    if (DictateArt.ResultText(r) is { Length: > 0 } s) DictateArt.Key(t, "WIN+H", DictateAction.KeyModeLabel(m), false, s, true);
            }
            foreach (var def in AppCatalog.Apps)
            {
                foreach (var (run, front, voice, tasks, inst) in new[] { (true, true, false, -1, true), (true, false, true, -1, true), (true, false, false, 12, true), (false, false, false, -1, true), (false, false, false, -1, false) })
                    AppArt.Key(t, App(def, run, front, voice, tasks, inst), Now);
                foreach (var r in Enum.GetValues<LaunchResult>()) AppArt.Key(t, App(def, true, false, false, -1, true), Now, AppKeyAction.LaunchText(r), true);
            }
            foreach (var s in Enum.GetValues<BedrockState>())
                UsageArt.BedrockKey(t, new BedrockSnapshot(s, "ap-southeast-2", "p", Fact<BedrockSeries>.Unknown, null, null), Now);
            foreach (var s in Enum.GetValues<AdminState>())
                foreach (var p in Enum.GetValues<AdminProvider>())
                    UsageArt.AdminKey(t, new AdminSnapshot(p, s, Fact<CostSummary>.Unknown, Fact<double>.Unknown, null, null), Now);
            var codex = new CodexLimitsService("unused", new ManualTimeProvider(Now), new CapturingLog());
            codex.Observe(new Sessions.CodexRateLimits("t", [new(100, 300, Now.AddHours(4).AddMinutes(59)), new(99.6, 10080, Now.AddDays(6).AddHours(23))], Now));
            foreach (var w in codex.Windows(Now)) foreach (var f in new string?[] { null, "RELOADING", "RELOADED", "NO NEW DATA" }) UsageArt.CodexKey(t, w, Now, f);
            UsageArt.CodexKey(t, null, Now);
            foreach (var f in new[] { "READING", "UP TO DATE", "NEXT IN 4M", "REFRESHING" })
                UsageArt.BedrockKey(t, new BedrockSnapshot(BedrockState.Waiting, "us-east-1", "p", Fact<BedrockSeries>.Unknown, null, null), Now, f);
            NoEllipsis(text);
        }
    }

    [Test]
    public void Widget_words_fit()
    {
        foreach (var t in new[] { Refraction.Night, Refraction.Day })
        {
            using var text = AiText.Record();
            foreach (var h in Levels)
            {
                var all = HealthCatalog.Providers.Select(p => View(p, h)).ToList();
                for (var sel = 0; sel < all.Count; sel++)
                {
                    HealthArt.Strip(t, all, sel, true, Now);
                    HealthArt.Strip(t, all, sel, false, Now);
                    OpsArt.Widget(t, all, sel, [], new BedrockSnapshot(BedrockState.Off, "us-east-1", null, Fact<BedrockSeries>.Unknown, null, null), Now);
                }
            }
            HealthArt.Strip(t, HealthCatalog.Providers.Select(p => View(p, null, HealthFetchState.NeverFetched)).ToList(), 0, true, Now, "UP TO DATE");
            foreach (var s in Enum.GetValues<BedrockState>())
                for (var v = 0; v < 3; v++) UsageArt.BedrockDial(t, new BedrockSnapshot(s, "ap-southeast-2", "p", Fact<BedrockSeries>.Unknown, null, null), v, Now);
            foreach (var s in Enum.GetValues<AdminState>())
                foreach (var p in Enum.GetValues<AdminProvider>())
                    UsageArt.AdminDial(t, new AdminSnapshot(p, s, Fact<CostSummary>.Unknown, Fact<double>.Unknown, null, null), 0, Now);
            UsageArt.CodexDial(t, [], 300, Now, null);
            foreach (var r in Enum.GetValues<AskResult>()) AskArt.Dial(t, AskTargets.All, 0, _ => true, AskArt.ResultText(r), true);
            for (var i = 0; i < AskTargets.All.Count; i++) AskArt.Dial(t, AskTargets.All, i, _ => true);
            foreach (var m in Enum.GetValues<DictateMode>())
                foreach (var r in Enum.GetValues<DictateResult>())
                    DictateArt.Dial(t, "HOLD CTRL+I", DictateAction.ModeLabel(m), DictateArt.ResultText(r) is { Length: > 0 } s ? s : null);
            NoEllipsis(text);
        }
    }
}
