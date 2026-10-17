using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Desktop.Sight;
using PrismControl.Sight.Control;
using PrismControl.Sight.Service;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

public sealed class SightTestContext : IModuleContext
{
    public SightTestContext(string root, bool safe)
    {
        DataDirectory = Path.Combine(root, "modules", "sight");
        PluginDirectory = Path.Combine(root, "plugin");
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(PluginDirectory);
        SafeMode = safe;
    }

    public MemoryLog MemLog { get; } = new();
    public ILog Log => MemLog;
    public IDataRegistry Data => throw new NotSupportedException("sight claims no data topic");
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
    public IPluginEvents Events { get; } = new NoEvents();
    public IDeviceDirectory Devices { get; } = new NoDevices();
    public TimeProvider Time => TimeProvider.System;
    public CancellationTokenSource Cts { get; } = new();
    public CancellationToken ShutdownToken => Cts.Token;
    public string PluginDirectory { get; }
    public string DataDirectory { get; }
    public bool SafeMode { get; }
    public void OpenUrl(string url) { }

    private sealed class NoEvents : IPluginEvents
    {
#pragma warning disable CS0067
        public event EventHandler<DeviceInfo>? DeviceConnected;
        public event EventHandler<string>? DeviceDisconnected;
        public event EventHandler? SystemWokeUp;
        public event EventHandler<string>? ApplicationLaunched;
        public event EventHandler<string>? ApplicationTerminated;
        public event EventHandler<string>? DeepLinkReceived;
        public event EventHandler? Connected;
        public event EventHandler? Disconnected;
#pragma warning restore CS0067
    }

    private sealed class NoDevices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [];
        public DeviceInfo? Find(string deviceId) => null;
    }
}

public class ModuleTests
{
    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task The_module_registers_the_contract_and_uses_the_recording_senders_in_safe_mode()
    {
        var root = Fx.TempDir("module");
        var ctx = new SightTestContext(root, safe: true);
        // A user recipe overrides by id; a broken one is skipped with a warning.
        Directory.CreateDirectory(Path.Combine(ctx.DataDirectory, "recipes"));
        File.WriteAllText(Path.Combine(ctx.DataDirectory, "recipes", "broken.json"), "{ \"v\": 1 }");
        var module = new SightModule();
        module.Initialize(ctx);
        try
        {
            Assert.True(ctx.Services.TryGet<ISightService>(out var sight));
            Assert.True(ctx.Services.TryGet<ISightControl>(out var control));
            Assert.True(control is SightControl);
            Assert.True(ctx.Services.TryGet<IInputSender>(out var input) && input is RecordingInputSender, "safe mode: recording keyboard");
            Assert.True(ctx.Services.TryGet<IMouseSender>(out var mouse) && mouse is RecordingMouseSender, "safe mode: recording mouse");
            Assert.Equal("Allowlisted", sight.Access("PlanetCoaster2.exe").Verdict);
            Assert.Equal("Denied", sight.Access("Overwatch.exe").Verdict);
            Assert.Contains("broken.json skipped", ctx.MemLog.All);
            Assert.Contains("Safe mode: Sight reads", ctx.MemLog.All);
            var service = ctx.Services.Get<SightService>();
            Assert.True(service.Recipes.Any(r => r.Id == "pc2-coaster-builder") && service.Recipes.Any(r => r.Id == "nms-hud"));
            Assert.False(File.Exists(Path.Combine(ctx.DataDirectory, "games.json")), "safe mode writes no settings file");
        }
        finally
        {
            ctx.Cts.Cancel();
            await module.DisposeAsync();
        }
    }
}
