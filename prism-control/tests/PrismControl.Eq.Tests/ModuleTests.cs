using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Tests.Fakes;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

public class ModuleTests
{
    /// <summary>Core's ActionValidator: exactly the rules the host applies at start-up and when it emits the manifest.</summary>
    [Test]
    public void Every_eq_action_passes_the_discovery_rules()
    {
        var report = ActionValidator.Scan(typeof(EqModule).Assembly);
        Assert.Empty(report.Errors, string.Join("; ", report.Errors));
        Assert.Empty(report.Warnings, string.Join("; ", report.Warnings));
        Assert.Equal(
            "com.jeremyfhall.prismcontrol.eq.band,com.jeremyfhall.prismcontrol.eq.band-browser,com.jeremyfhall.prismcontrol.eq.preset," +
            "com.jeremyfhall.prismcontrol.eq.sample-band,com.jeremyfhall.prismcontrol.eq.sonar-volume,com.jeremyfhall.prismcontrol.eq.toggle",
            string.Join(",", report.Actions.Select(a => a.Uuid)));
        foreach (var a in report.Actions)
            Assert.NotNull((ActionBase)Activator.CreateInstance(a.Type)!, a.Uuid); // constructors do no work
    }

    /// <summary>The designer's icons (wave 2): every visible action names its images, and the SVGs exist in the module's plugin overlay.</summary>
    [Test]
    public void Every_visible_action_points_at_icons_that_exist()
    {
        var plugin = Path.Combine(RepoRoot.Find(), "src", "PrismControl.Eq", "plugin");
        foreach (var a in ActionValidator.Scan(typeof(EqModule).Assembly).Actions.Where(a => a.Attribute.VisibleInActionsList))
        {
            var attr = a.Attribute;
            var paths = new List<(string What, string? Path)> { ("Icon", attr.Icon), ("KeyImage", attr.KeyImage) };
            if (attr.Controllers.HasFlag(Controllers.Encoder)) paths.Add(("EncoderIcon", attr.EncoderIcon));
            foreach (var (what, path) in paths)
            {
                Assert.NotNull(path, $"{a.Uuid}: {what} is not set");
                Assert.True(path!.StartsWith("imgs/actions/eq/", StringComparison.Ordinal), $"{a.Uuid}: {what} {path}");
                Assert.True(File.Exists(Path.Combine(plugin, path.Replace('/', Path.DirectorySeparatorChar) + ".svg")), $"{a.Uuid}: {what} {path}.svg is missing");
            }
        }
    }

    [Test]
    public async Task In_safe_mode_the_module_builds_every_writer_behind_one_gate()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-eq-tests", "module-" + Guid.NewGuid().ToString("N")[..8]);
        var ctx = new FakeModuleContext(dir, new TestGlobalSettings(), safeMode: true);
        var module = new EqModule();
        module.Initialize(ctx);
        try
        {
            var svc = ctx.Services.Get<EqService>();
            Assert.True(svc.Writes.SafeMode);
            Assert.True(svc.Mixer!.Client.SafeMode);
            Assert.True(ReferenceEquals(svc.Writes, svc.Mixer.Client.Writes), "Sonar shares the module's gate");
            Assert.True(ReferenceEquals(svc.Writes, svc.ApoBackend!.Writes), "APO shares the module's gate");
            Assert.False(Directory.Exists(dir), "nothing was written to the data folder");
        }
        finally
        {
            await module.DisposeAsync();
            try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    [Test]
    public async Task The_module_registers_one_service_and_follows_the_eq_backend_setting()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-eq-tests", "module-" + Guid.NewGuid().ToString("N")[..8]);
        var ctx = new FakeModuleContext(dir, new TestGlobalSettings(new JsonObject { ["eq"] = new JsonObject { ["backend"] = "sonar" } }));
        var module = new EqModule();
        module.Initialize(ctx);
        try
        {
            var svc = ctx.Services.Get<EqService>();
            Assert.Equal("sonar", svc.BackendId);
            Assert.NotNull(svc.Mixer);
            var switched = 0;
            svc.BackendChanged += (_, _) => switched++;
            ctx.GlobalSettings.SetSection("eq", new EqGlobalSettings { Backend = "apo" });
            Assert.Equal("apo", svc.BackendId);
            ctx.GlobalSettings.SetSection("eq", new EqGlobalSettings { Backend = "APO" }); // idempotent, normalized
            Assert.Equal(1, switched);
            ctx.GlobalSettings.SetSection("eq", new EqGlobalSettings { Backend = "nonsense" }); // unknown → the default
            Assert.Equal("sonar", svc.BackendId);
            Assert.False(File.Exists(Path.Combine(dir, "apo-state.json")), "creating the APO backend writes nothing");
        }
        finally
        {
            await module.DisposeAsync();
            try { Directory.Delete(dir, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    [Test]
    public async Task The_poll_loop_runs_only_while_an_action_holds_a_lease()
    {
        await using var rig = await SonarRig.StartAsync();
        var lease = rig.Service.Watch();
        for (var i = 0; i < 100 && !rig.Sonar.Requests.Any(r => r.Path == "/v1/status"); i++) await Task.Delay(10);
        Assert.True(rig.Sonar.Requests.Any(r => r.Path == "/v1/status"), "polled on the first lease");
        lease.Dispose();
        await Task.Delay(50);
        rig.Sonar.Http.ClearLog();
        rig.Time.Advance(TimeSpan.FromSeconds(10));
        await Task.Delay(100);
        Assert.Empty(rig.Sonar.Requests.Where(r => r.Path == "/v1/status")); // nobody visible: no polling
    }
}

/// <summary>Just enough of the host for EqModule.Initialize (it never touches the data API).</summary>
public sealed class FakeModuleContext(string dataDirectory, TestGlobalSettings globals, bool safeMode = false) : IModuleContext
{
    public ILog Log => NullLog.Instance;
    public IDataRegistry Data => throw new NotSupportedException("the EQ module publishes no data topics");
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings => globals;
    public IPluginEvents Events => throw new NotSupportedException();
    public IDeviceDirectory Devices => throw new NotSupportedException();
    public TimeProvider Time => TimeProvider.System;
    public CancellationToken ShutdownToken => CancellationToken.None;
    public string PluginDirectory => dataDirectory;
    public string DataDirectory => dataDirectory;
    public bool SafeMode => safeMode;
    public void OpenUrl(string url) { }
}

/// <summary>
/// The repo root (prism-control/, where PrismControl.sln is): above the test exe when it builds into bin/, else above
/// the working directory (an --artifacts-path build sits outside the repo; run from prism-control/).
/// </summary>
public static class RepoRoot
{
    public static string Find()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
            for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        throw new InvalidOperationException($"PrismControl.sln not found above {AppContext.BaseDirectory} or {Directory.GetCurrentDirectory()} (run from prism-control/).");
    }
}
