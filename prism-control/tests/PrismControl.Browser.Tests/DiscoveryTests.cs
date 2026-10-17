using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Install;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

public class DiscoveryTests
{
    public static readonly string[] ExpectedUuids =
    [
        "tab", "tabs", "media", "scrub", "speed", "page", "download", "site", "nav", "reopen", "group", "split", "privacy", "panic", "meet", "preview",
    ];

    [Test]
    public void Every_action_passes_the_host_validator()
    {
        var scan = ActionValidator.Scan(typeof(BrowserModule).Assembly);
        Assert.Empty(scan.Errors, string.Join("; ", scan.Errors));
        var uuids = scan.Actions.Select(a => a.Attribute.Uuid).OrderBy(x => x).ToList();
        Assert.Equal(string.Join(",", ExpectedUuids.Select(x => "com.jeremyfhall.prismcontrol.browser." + x).OrderBy(x => x)), string.Join(",", uuids));
        foreach (var a in scan.Actions)
        {
            Assert.True(a.Attribute.Name.Length is > 0 and <= 30, a.Attribute.Uuid + " name");
            Assert.Equal("pi/browser.html", a.Attribute.PropertyInspector);
        }
    }

    [Test]
    public void Every_action_icon_exists_in_the_module_plugin_folder()
    {
        var root = RepoRoot();
        var scan = ActionValidator.Scan(typeof(BrowserModule).Assembly);
        foreach (var a in scan.Actions)
        {
            foreach (var path in new[] { a.Attribute.Icon, a.Attribute.KeyImage, a.Attribute.EncoderIcon }.Where(p => p is not null))
            {
                var file = Path.Combine(root, "src", "PrismControl.Browser", "plugin", path!.Replace('/', Path.DirectorySeparatorChar) + ".svg");
                Assert.True(File.Exists(file), "missing " + file);
                var svg = File.ReadAllText(file);
                Assert.DoesNotContain("rgba(", svg);
                Assert.DoesNotContain("<text", svg);
            }
        }
        Assert.True(File.Exists(Path.Combine(root, "src", "PrismControl.Browser", "plugin", "pi", "browser.html")));
    }

    [Test]
    public void The_PI_page_has_no_external_resources()
    {
        var html = File.ReadAllText(Path.Combine(RepoRoot(), "src", "PrismControl.Browser", "plugin", "pi", "browser.html"));
        Assert.DoesNotContain("http://", html);
        Assert.DoesNotContain("https://", html);
        Assert.Contains("'.plan'", html, "the consent step asks for the plan first");
        Assert.Contains("consent: true", html);
        Assert.Contains("planId: plan.id", html, "and applies only the plan that was shown");
    }

    public static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) d = d.Parent;
        if (d is not null) return d.FullName;
        var cwd = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (cwd is not null && !File.Exists(Path.Combine(cwd.FullName, "PrismControl.sln"))) cwd = cwd.Parent;
        return cwd?.FullName ?? throw new InvalidOperationException("run from inside the repo");
    }
}

/// <summary>A minimal module context (temp data folder, safe mode on, nothing real).</summary>
public sealed class TestModuleContext : IModuleContext
{
    public TestModuleContext(string root)
    {
        DataDirectory = Path.Combine(root, "modules", "browser");
        PluginDirectory = Path.Combine(root, "plugin");
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(PluginDirectory);
    }

    public ILog Log { get; } = new RecordingLog();
    public IDataRegistry Data => throw new NotSupportedException("the browser module claims no data topic");
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
    public IPluginEvents Events { get; } = new TestEvents();
    public IDeviceDirectory Devices { get; } = new NoDevices();
    public TimeProvider Time => TimeProvider.System;
    public CancellationTokenSource Cts { get; } = new();
    public CancellationToken ShutdownToken => Cts.Token;
    public string PluginDirectory { get; }
    public string DataDirectory { get; }
    public bool SafeMode { get; init; } = true;
    public void OpenUrl(string url) { }

    public sealed class TestEvents : IPluginEvents
    {
        public event EventHandler<DeviceInfo>? DeviceConnected;
        public event EventHandler<string>? DeviceDisconnected;
        public event EventHandler? SystemWokeUp;
        public event EventHandler<string>? ApplicationLaunched;
        public event EventHandler<string>? ApplicationTerminated;
        public event EventHandler<string>? DeepLinkReceived;
        public event EventHandler? Connected;
        public event EventHandler? Disconnected;
        public void Launch(string app) => ApplicationLaunched?.Invoke(this, app);
        public void Terminate(string app) => ApplicationTerminated?.Invoke(this, app);
        public void Touch() { _ = DeviceConnected; _ = DeviceDisconnected; _ = SystemWokeUp; _ = DeepLinkReceived; _ = Connected; _ = Disconnected; }
    }

    private sealed class NoDevices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [];
        public DeviceInfo? Find(string deviceId) => null;
    }
}

public class ModuleTests
{
    /// <summary>
    /// Start-up never installs anything: Initialize registers the hub and HostInstaller, starts the pipe (discovery file
    /// in the module's own temp data folder), and writes no host manifest, record or extension copy. The real HKCU is
    /// only read here (read-only probe), never written.
    /// </summary>
    [Test(Category = "integration")]
    public async Task Initialize_starts_the_pipe_and_installs_nothing()
    {
        var root = Path.Combine(Path.GetTempPath(), "prism-browser-module", Guid.NewGuid().ToString("n"));
        var ctx = new TestModuleContext(root);
        var chromeBefore = new CurrentUserRegistry().GetDefault(HostInstaller.ChromeKey);
        var module = new BrowserModule();
        try
        {
            module.Initialize(ctx);
            Assert.True(ctx.Services.TryGet<BrowserHub>(out var hub));
            Assert.True(ctx.Services.TryGet<HostInstaller>(out var installer));
            Assert.True(hub.SafeMode);
            await SessionRig.WaitAsync(() => File.Exists(Path.Combine(ctx.DataDirectory, "ingress.json")), 5000);
            Assert.True(hub.PlatformAvailable);
            Assert.False(File.Exists(installer.ManifestPath), "no host manifest at start-up");
            Assert.False(File.Exists(installer.RecordPath));
            Assert.False(Directory.Exists(installer.ExtensionFolder));
            Assert.Equal(chromeBefore, new CurrentUserRegistry().GetDefault(HostInstaller.ChromeKey), "HKCU untouched");

            ((TestModuleContext.TestEvents)ctx.Events).Launch("obs64.exe");
            Assert.True(hub.Store.Current.StreamingDetected);
            Assert.Equal("domain", hub.Store.Current.RequestedPrivacy);
            ((TestModuleContext.TestEvents)ctx.Events).Terminate("obs64.exe");
            Assert.False(hub.Store.Current.StreamingDetected);
            Assert.Equal("full", hub.Store.Current.RequestedPrivacy);
        }
        finally
        {
            ctx.Cts.Cancel();
            await module.DisposeAsync();
            Assert.False(File.Exists(Path.Combine(ctx.DataDirectory, "ingress.json")), "the discovery file is removed on shutdown");
            try { Directory.Delete(root, true); } catch (Exception) { }
        }
    }
}
