using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Runtime;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>
/// The real module wiring in safe mode: Desktop's services (recording input/mouse senders, read-only foreground and
/// window catalog), the embedded packs, the user's real rebind files read read-only, the verb registry. Nothing is
/// typed, clicked or focused; the per-user folder is redirected to a temporary one.
/// </summary>
public class ModuleSmokeTests
{
    private sealed class Events : IPluginEvents
    {
        public event EventHandler<DeviceInfo>? DeviceConnected { add { } remove { } }
        public event EventHandler<string>? DeviceDisconnected { add { } remove { } }
        public event EventHandler? SystemWokeUp { add { } remove { } }
        public event EventHandler<string>? ApplicationLaunched { add { } remove { } }
        public event EventHandler<string>? ApplicationTerminated { add { } remove { } }
        public event EventHandler<string>? DeepLinkReceived { add { } remove { } }
        public event EventHandler? Connected { add { } remove { } }
        public event EventHandler? Disconnected { add { } remove { } }
    }

    private sealed class Devices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [TestDevices.Galleon, TestDevices.Plus];
        public DeviceInfo? Find(string deviceId) => All.FirstOrDefault(d => d.Id == deviceId);
    }

    private sealed class Context(string root, CancellationToken shutdown) : IModuleContext
    {
        public ILog Log { get; } = NullLog.Instance;
        public IDataRegistry Data => throw new NotSupportedException("the smart module claims no data topics");
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
        public IPluginEvents Events { get; } = new Events();
        public IDeviceDirectory Devices { get; } = new Devices();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => shutdown;
        public string PluginDirectory => Path.Combine(root, "plugin");
        public string DataDirectory => Path.Combine(root, "control", "modules", "smart");
        public void OpenUrl(string url) => throw new InvalidOperationException("nothing opens in safe mode");
        public bool SafeMode => true;
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task The_module_wires_up_in_safe_mode_and_loads_every_shipped_pack()
    {
        var root = Path.Combine(Path.GetTempPath(), "prism-smart-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var saved = Environment.GetEnvironmentVariable(DesktopPaths.DirEnv);
        Environment.SetEnvironmentVariable(DesktopPaths.DirEnv, Path.Combine(root, "control"));
        using var cts = new CancellationTokenSource();
        var module = new SmartModule();
        try
        {
            var ctx = new Context(root, cts.Token);
            module.Initialize(ctx);
            var engine = ctx.Services.Get<SmartEngine>();
            var status = ctx.Services.Get<SmartModuleStatus>();
            for (var i = 0; i < 200 && status.Library.Packs.Count == 0; i++) await Task.Delay(25);
            Assert.True(status.Library.Packs.Count >= 15, $"packs loaded: {status.Library.Packs.Count}");
            Assert.True(status.Library.Status.All(s => s.Loaded && s.Errors == 0), string.Join("; ", status.Library.Status.Where(s => s.Errors > 0).Select(s => s.Id)));
            Assert.True(ctx.Services.Get<IInputSender>() is RecordingInputSender, "safe mode: recording keyboard");
            Assert.True(ctx.Services.Get<IMouseSender>() is RecordingMouseSender, "safe mode: recording mouse");
            Assert.True(ctx.Services.Get<IVerbRegistry>().TryResolveVerb("smart.page.lock", out _, out _));
            Assert.NotNull(engine.Status());
        }
        finally
        {
            await module.DisposeAsync();
            cts.Cancel();
            Environment.SetEnvironmentVariable(DesktopPaths.DirEnv, saved);
            try { Directory.Delete(root, true); } catch { /* best effort */ }
        }
    }
}
