using System.Text.Json.Nodes;
using PrismControl.Ai.Actions;
using PrismControl.Ai.Art;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Testing;

namespace PrismControl.Ai.Tests;

/// <summary>Discovery rules (the same code the host runs), layouts, icons and the status model.</summary>
public class MetadataTests
{
    private static string ModuleDir => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "src", "PrismControl.Ai"));

    private static string SourceDir()
    {
        // The test exe runs from <artifacts>/bin/...: find the repo through the working directory or the known layout.
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                var candidate = Path.Combine(dir.FullName, "src", "PrismControl.Ai");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
        }
        var fallback = Path.Combine("E:", "Development Workspaces", "Prism-control", "prism-control", "src", "PrismControl.Ai");
        return Directory.Exists(fallback) ? fallback : ModuleDir;
    }

    [Test]
    public void Actions_pass_the_host_discovery_rules()
    {
        var scan = ActionValidator.Scan(typeof(AiModule).Assembly);
        Assert.Empty(scan.Errors);
        var ids = scan.Actions.Select(a => a.Uuid).OrderBy(x => x).ToList();
        // The sessions half's actions must all be present; AI2 (apps + services) adds its own to the same assembly.
        foreach (var id in new[] { AiIds.Approve, AiIds.Deny, AiIds.Fleet, AiIds.Next, AiIds.Privacy, AiIds.Request, AiIds.Session })
            Assert.True(ids.Contains(id), id);
        Assert.Equal(ids.Count, ids.Distinct().Count());
        Assert.True(ids.All(i => i.StartsWith("com.jeremyfhall.prismcontrol.ai.", StringComparison.Ordinal)));
    }

    [Test]
    public void The_module_declares_itself()
    {
        var attr = typeof(AiModule).Assembly.GetCustomAttributes(typeof(PrismModuleAttribute), false).OfType<PrismModuleAttribute>().Single();
        Assert.Equal(typeof(AiModule), attr.ModuleType);
        Assert.Equal("ai", new AiModule().Name);
    }

    [Test]
    public void The_approve_and_deny_keys_are_not_offered_in_multi_actions()
    {
        foreach (var t in new[] { typeof(ApproveKeyAction), typeof(DenyKeyAction) })
        {
            var a = (StreamDeckActionAttribute)t.GetCustomAttributes(typeof(StreamDeckActionAttribute), false).Single();
            Assert.False(a.SupportedInMultiActions, t.Name);
        }
    }

    [Test]
    public void Card_layout_is_valid()
    {
        var path = Path.Combine(SourceDir(), "plugin", "layouts", "ai-card.json");
        var root = JsonNode.Parse(File.ReadAllText(path))!.AsObject();
        Assert.True(ActionValidator.IsValidLayout(AiIds.CardLayout));
        var items = root["items"]!.AsArray();
        var keys = items.Select(i => i!["key"]!.GetValue<string>()).ToList();
        Assert.Equal("canvas,line1,line2,line3", string.Join(",", keys), "three measured native lines (review M2)");
        foreach (var i in items)
        {
            var r = i!["rect"]!.AsArray().Select(n => n!.GetValue<int>()).ToArray();
            Assert.True(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 200 && r[1] + r[3] <= 100, "inside 200×100");
            Assert.False(keys.Contains("title") || keys.Contains("icon"));
        }
        // Text items in the same zOrder must not overlap.
        var l1 = items[1]!["rect"]!.AsArray().Select(n => n!.GetValue<int>()).ToArray();
        var l2 = items[2]!["rect"]!.AsArray().Select(n => n!.GetValue<int>()).ToArray();
        Assert.True(l1[1] + l1[3] <= l2[1], "line1 above line2");
    }

    [Test]
    public void Every_action_has_its_icon_and_key_image()
    {
        var imgs = Path.Combine(SourceDir(), "plugin", "imgs", "actions", "ai");
        foreach (var id in new[] { "session", "next", "fleet", "request", "approve", "deny", "privacy" })
        {
            foreach (var f in new[] { "icon.svg", "key.svg" })
            {
                var file = Path.Combine(imgs, id, f);
                Assert.True(File.Exists(file), file);
                var svg = File.ReadAllText(file);
                var errors = SvgLint.Check(svg, f == "key.svg" ? SvgCanvas.Key : SvgCanvas.Any).Where(i => i.Severity == LintSeverity.Error).ToList();
                Assert.Empty(errors.Select(e => $"{id}/{f}: {e}"));
            }
        }
    }

    [Test]
    public void Elapsed_formatting()
    {
        Assert.Equal("0:05", AiPalette.Elapsed(TimeSpan.FromSeconds(5)));
        Assert.Equal("9:59", AiPalette.Elapsed(TimeSpan.FromSeconds(599)));
        Assert.Equal("12m", AiPalette.Elapsed(TimeSpan.FromMinutes(12.5)));
        Assert.Equal("1h4", AiPalette.Elapsed(TimeSpan.FromMinutes(64)));
        Assert.Equal("~3:00", AiPalette.Elapsed(TimeSpan.FromMinutes(3), inferred: true));
        Assert.Equal("0:00", AiPalette.Elapsed(TimeSpan.FromSeconds(-3)));
    }

    [Test]
    public void Status_hub_layers_and_ai2_sink()
    {
        using var rig = new TestRig();
        var hub = rig.Services.Status;
        var changes = 0;
        hub.Changed += () => changes++;
        rig.Hook("UserPromptSubmit");
        hub.PublishApps([new Status.AppStatus { Id = "chatgpt", Name = "ChatGPT", Generating = Status.Fact<bool>.Unknown }]);
        hub.PublishServices([new Status.ServiceStatus { Provider = "anthropic", Name = "Claude" }]);
        var s = hub.Snapshot();
        Assert.Single(s.Sessions);
        Assert.Equal("chatgpt", Assert.Single(s.Apps).Id);
        Assert.Equal(Status.Confidence.Unknown, s.Apps[0].Generating.Confidence, "chat apps' generating is always unknown");
        Assert.Equal("anthropic", Assert.Single(s.Services).Provider);
        Assert.True(changes >= 3);
        CodexRateLimits? seen = null;
        ((Status.IAiStatusSink)hub).CodexLimitsObserved += l => seen = l;
        hub.ReportCodexLimits(new CodexRateLimits("t", [new CodexLimitWindow(10, 300, null)], rig.Time.GetUtcNow()));
        Assert.True(seen is not null);
    }

    [Test]
    public void Services_features_stub_is_callable()
    {
        using var rig = new TestRig();
        ServicesFeatures.Register(new NullContext(), rig.Services.Status, rig.Services.Status);
    }

    private sealed class NullContext : IModuleContext
    {
        public ILog Log => NullLog.Instance;
        public Core.Data.IDataRegistry Data => throw new NotSupportedException();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
        public IPluginEvents Events { get; } = new FakePluginEvents();
        public IDeviceDirectory Devices => throw new NotSupportedException();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => CancellationToken.None;
        public string PluginDirectory => "";
        public string DataDirectory => "";
        public void OpenUrl(string url) { }
    }
}
