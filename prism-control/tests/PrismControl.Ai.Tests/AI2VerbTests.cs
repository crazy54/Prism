using System.Text.Json.Nodes;
using PrismControl.Ai.Apps;
using PrismControl.Ai.Services;
using PrismControl.Ai.Services.Usage;
using PrismControl.Ai.Services.Verbs;
using PrismControl.Ai.Sessions;
using PrismControl.Ai.Status;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>The Smart Deck contract (SD1's IVerbRegistry): one composite "ai" provider, AI2's verbs and readouts.</summary>
public class AI2VerbTests
{
    private static (Ai2Rig Rig, VerbRegistry Registry, AiVerbProvider Provider) Setup(bool safe = false)
    {
        var rig = new Ai2Rig(safeMode: safe);
        var registry = new VerbRegistry();
        var provider = AiVerbProvider.GetOrRegister(registry, rig.Time);
        provider.Add(new Ai2VerbPart(rig.S));
        return (rig, registry, provider);
    }

    [Test]
    public void One_ai_provider_with_unique_well_formed_verbs()
    {
        var (rig, registry, provider) = Setup();
        Assert.True(ReferenceEquals(provider, AiVerbProvider.GetOrRegister(registry, rig.Time)), "a second caller (AI1 later) gets the same composite");
        Assert.Equal("ai", Assert.Single(registry.Providers).Module);
        var ids = provider.Verbs.Select(v => v.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
        Assert.True(ids.All(i => i.StartsWith("ai.", StringComparison.Ordinal)));
        Assert.True(provider.Verbs.All(v => v.Label.Length <= 12), string.Join(",", provider.Verbs.Where(v => v.Label.Length > 12).Select(v => v.Label)));
        Assert.True(provider.Verbs.All(v => v.Safety is "safe" or "confirm" or "never-auto"));
        Assert.True(provider.Verbs.Where(v => v.Id.StartsWith("ai.ask.", StringComparison.Ordinal)).All(v => v.Safety == "never-auto"), "Ask copies the selection: only a direct press");
        foreach (var expected in new[] { "ai.app.claudeDesktop.open", "ai.app.chatgpt.open", "ai.ask.claudeDesktop", "ai.ask.chatgptWeb", "ai.dictate.toggle", "ai.health.claude.open", "ai.usage.refresh" })
            Assert.True(registry.TryResolveVerb(expected, out _, out _), expected);
        var readouts = provider.Readouts.Select(r => r.Id).ToList();
        Assert.Equal(readouts.Count, readouts.Distinct().Count());
        foreach (var expected in new[] { "ai.health.claude", "ai.health.worst", "ai.usage.codex.fiveHour", "ai.usage.codex.week", "ai.usage.bedrock.tokensPerMin", "ai.app.chatgpt.running", "ai.app.copilot.voice" })
            Assert.True(readouts.Contains(expected), expected);
        Assert.True(provider.Verbs.Where(v => v.StateReadout is not null).All(v => readouts.Contains(v.StateReadout!)), "toggles point at real readouts");
    }

    [Test]
    public void Readouts_keep_their_confidence_and_a_read_warms_the_source()
    {
        var (rig, registry, _) = Setup();
        rig.TypicalProcesses();
        rig.Voice.Pids = [4002];
        Assert.True(registry.TryReadReadout("ai.health.claude", out var health));
        Assert.Equal("OK", health.Text);
        Assert.Equal(ReadoutConfidence.Observed, health.Confidence);
        Assert.Equal(1, rig.Http.Count("status.claude.com"), "the read itself started the fetch");

        Assert.True(registry.TryReadReadout("ai.app.chatgpt.running", out var running));
        Assert.True(running.State == true);
        Assert.True(registry.TryReadReadout("ai.app.copilot.voice", out var voice));
        Assert.Equal(ReadoutConfidence.Inferred, voice.Confidence, "a microphone session is an inference");

        rig.S.Codex.Observe(new CodexRateLimits("t", [new(42, 300, rig.Time.GetUtcNow().AddHours(2))], rig.Time.GetUtcNow()));
        Assert.True(registry.TryReadReadout("ai.usage.codex.fiveHour", out var codex));
        Assert.Equal(42, codex.Number);
        Assert.Equal("RESETS 2H 0M", codex.Fields!["resets"]);
        Assert.True(registry.TryReadReadout("ai.usage.codex.week", out var week));
        Assert.Equal(ReadoutConfidence.Unknown, week.Confidence, "no weekly record: unknown, never 0");
        Assert.True(registry.TryReadReadout("ai.usage.bedrock.tokensPerMin", out var bedrock));
        Assert.Equal(ReadoutConfidence.Unknown, bedrock.Confidence, "opt-in feature off");
        Assert.Empty(rig.Aws.Calls);
        Assert.False(registry.TryReadReadout("ai.nothing.here", out _));

        rig.Http.ByHost["status.claude.com"] = _ => FakeHttp.Status(0);   // the re-check fails: the old reading ages out
        rig.Time.Advance(TimeSpan.FromMinutes(7));
        Assert.True(registry.TryReadReadout("ai.health.claude", out var later));
        Assert.Equal(ReadoutConfidence.Stale, later.Confidence);
    }

    [Test]
    public async Task Invocations_route_and_never_auto_needs_a_direct_gesture()
    {
        var (rig, registry, provider) = Setup();
        rig.TypicalProcesses();
        await rig.S.Apps.TickAsync();
        var refused = await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.ask.chatgpt", DirectGesture = false });
        Assert.False(refused.Ok);
        Assert.Empty(rig.Opened);
        Assert.True((await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.ask.chatgpt" })).Ok);
        Assert.True(rig.Opened.Single().StartsWith("codex://new?prompt=", StringComparison.Ordinal));
        Assert.True((await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.app.vscode.open" })).Ok);
        Assert.Equal(@"shell:AppsFolder\Microsoft.VisualStudioCode", rig.Started.Single().Args);
        rig.ForegroundProbe.Value = (900, "notepad.exe");
        Assert.True((await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.dictate.toggle" })).Ok);
        Assert.Equal("chord:LeftWindows+H", $"{rig.Input.Calls.Last().Kind}:{rig.Input.Calls.Last().Keys}");
        Assert.True((await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.health.github.open" })).Ok);
        Assert.Equal("https://www.githubstatus.com", rig.Opened.Last());
        Assert.False((await provider.InvokeAsync(new VerbInvocation { VerbId = "ai.unknown" })).Ok);

        Assert.Equal(VerbAvailability.Unavailable, provider.GetStatus("ai.app.cursor.open").Availability);
        Assert.Equal(VerbAvailability.ModuleMissing, provider.GetStatus("ai.ask.cursor").Availability);
        Assert.True(provider.GetStatus("ai.ask.claudeDesktop").IsReady);
        rig.OnAir = true;
        Assert.Equal("on air", provider.GetStatus("ai.ask.claudeWeb").Hint);
    }

    [Test]
    public async Task Safe_mode_verbs_report_unavailable_and_do_nothing()
    {
        var (rig, _, provider) = Setup(safe: true);
        rig.TypicalProcesses();
        await rig.S.Apps.TickAsync();
        Assert.Equal("safe mode", provider.GetStatus("ai.app.chatgpt.open").Hint);
        Assert.Equal("safe mode", provider.GetStatus("ai.ask.chatgpt").Hint);
        foreach (var v in provider.Verbs) await provider.InvokeAsync(new VerbInvocation { VerbId = v.Id });
        Assert.Empty(rig.Opened);
        Assert.Empty(rig.Started);
        Assert.Empty(rig.Input.Calls);
        Assert.Empty(rig.Foreground.Raised);
    }

    [Test]
    public void Changed_is_coalesced_to_ten_hertz()
    {
        var (rig, _, provider) = Setup();
        var n = 0;
        provider.Changed += () => n++;
        rig.Time.Advance(TimeSpan.FromSeconds(1));
        n = 0;
        for (var i = 0; i < 5; i++) rig.S.Codex.Observe(new CodexRateLimits("t", [new(i * 10, 300, null)], rig.Time.GetUtcNow().AddSeconds(i)));
        Assert.Equal(0, n);
        rig.Time.Advance(TimeSpan.FromMilliseconds(100));
        Assert.Equal(1, n);
    }

    [Test]
    public void Build_registers_services_and_verbs_and_starts_nothing()
    {
        var ctx = new Ai2TestContext();
        var aiRig = new TestRig();
        var services = ServicesFeatures.Build(ctx, aiRig.Services.Status, aiRig.Services.Status);
        Assert.True(ctx.Services.TryGet<Ai2Services>(out var registered) && ReferenceEquals(registered, services));
        Assert.True(ctx.Services.TryGet<IVerbRegistry>(out var registry));
        Assert.True(registry.TryResolveVerb("ai.dictate.toggle", out _, out _));
        Assert.False(services.Health.EverDemanded, "no status page is fetched before something asks");
        Assert.Equal(BedrockState.Off, services.Bedrock.Snapshot().State);
        Assert.Equal(AdminState.Off, services.Admin.Snapshot(AdminProvider.Anthropic).State);
        ctx.Time.Advance(TimeSpan.FromMinutes(30));   // the schedulers tick: nothing is demanded, nothing runs
        Assert.False(services.Health.EverDemanded);
        Assert.Contains("opt-in", ctx.Log.All);
        aiRig.Dispose();
    }

    private sealed class Ai2TestContext : IModuleContext
    {
        public CapturingLog Log { get; } = new();
        public ManualTimeProvider Time { get; } = new();
        ILog IModuleContext.Log => Log;
        public IDataRegistry Data => throw new NotSupportedException();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
        public IPluginEvents Events { get; } = new FakePluginEvents();
        public IDeviceDirectory Devices => throw new NotSupportedException();
        TimeProvider IModuleContext.Time => Time;
        public CancellationToken ShutdownToken => CancellationToken.None;
        public string PluginDirectory => "";
        public string DataDirectory => "";
        public void OpenUrl(string url) => throw new InvalidOperationException("nothing may open a link here");
        public bool SafeMode => false;
    }
}
