using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Smart.Control;
using PrismControl.Smart.Providers;
using PrismControl.Testing;

namespace PrismControl.Smart.Tests;

/// <summary>
/// SD2 through the real module wiring (safe mode, the per-user folder redirected to a temp one): "Allow AI preferences"
/// in global settings starts and stops the smart pipe (discovery file appears / disappears), the PI extras and the
/// pairing service are registered, and the Sight readout provider is in the verb registry.
/// </summary>
public class ModuleAiTests
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
        public IReadOnlyCollection<DeviceInfo> All => [TestDevices.Galleon];
        public DeviceInfo? Find(string deviceId) => All.FirstOrDefault(d => d.Id == deviceId);
    }

    private sealed class Context(string root, TestGlobalSettings globals, CancellationToken shutdown) : IModuleContext
    {
        public ILog Log { get; } = NullLog.Instance;
        public IDataRegistry Data => throw new NotSupportedException();
        public IServiceRegistry Services { get; } = new ServiceRegistry();
        public IGlobalSettings GlobalSettings => globals;
        public IPluginEvents Events { get; } = new Events();
        public IDeviceDirectory Devices { get; } = new Devices();
        public TimeProvider Time => TimeProvider.System;
        public CancellationToken ShutdownToken => shutdown;
        public string PluginDirectory => Path.Combine(root, "plugin");
        public string DataDirectory => Path.Combine(root, "control", "modules", "smart");
        public void OpenUrl(string url) => throw new InvalidOperationException();
        public bool SafeMode => true;
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Allow_AI_preferences_starts_and_stops_the_smart_pipe()
    {
        var root = Path.Combine(Path.GetTempPath(), "prism-sd2-module", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var saved = Environment.GetEnvironmentVariable(DesktopPaths.DirEnv);
        Environment.SetEnvironmentVariable(DesktopPaths.DirEnv, Path.Combine(root, "control"));
        using var cts = new CancellationTokenSource();
        var module = new SmartModule();
        var globals = new TestGlobalSettings();
        try
        {
            var ctx = new Context(root, globals, cts.Token);
            module.Initialize(ctx);
            var ingress = DesktopPaths.IngressFile("smart");
            Assert.Equal(Path.Combine(root, "control", "modules", "smart", "ingress.json"), ingress);
            Assert.True(ctx.Services.TryGet<PairingService>(out _));
            Assert.True(ctx.Services.TryGet<SmartPiExtras>(out _));
            Assert.True(ctx.Services.Get<IVerbRegistry>().Providers.Any(p => p is SightReadoutProvider), "sight readouts registered");
            await Task.Delay(200);
            Assert.False(File.Exists(ingress), "off by default");

            globals.ReceiveFromStreamDeck(new JsonObject { ["smartai"] = new JsonObject { ["allowAi"] = true } });
            for (var i = 0; i < 100 && !File.Exists(ingress); i++) await Task.Delay(20);
            Assert.True(File.Exists(ingress), "on: the pipe listens and publishes its discovery file");
            var d = DiscoveryFile.Read(ingress)!;
            Assert.True(((string)d["pipe"]!).StartsWith("prism-control-smart-", StringComparison.Ordinal));

            globals.ReceiveFromStreamDeck(new JsonObject { ["smartai"] = new JsonObject { ["allowAi"] = false } });
            for (var i = 0; i < 100 && File.Exists(ingress); i++) await Task.Delay(20);
            Assert.False(File.Exists(ingress), "off: the file is gone");
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

public class SightReadoutProviderTests
{
    [Test]
    public void Sight_state_game_context_and_recording_are_readouts_and_nothing_can_be_invoked()
    {
        using var rig = new Rig();
        var p = new SightReadoutProvider(rig.Sight, rig.Time);
        rig.SightFake.Visible.Add("pc2.builder.editPanel");
        rig.SightFake.Publish();
        Assert.True(p.TryReadReadout("sight.state", out var st));
        Assert.Equal("READING", st.Text);
        Assert.True(p.TryReadReadout("sight.game", out var game));
        Assert.Equal("PC2", game.Text);
        Assert.True(p.TryReadReadout("sight.recording", out var rec));
        Assert.False(rec.State!.Value);
        Assert.False(p.TryReadReadout("sight.secret", out _));
        Assert.Empty(p.Verbs);
        Assert.False(p.GetStatus("sight.calibrate").IsReady);
        Assert.False(p.InvokeAsync(new VerbInvocation { VerbId = "sight.calibrate" }).Result.Ok);
        Assert.Equal(4, p.Readouts.Count);

        using var none = new Rig(withSight: false);
        var q = new SightReadoutProvider(none.Sight, none.Time);
        Assert.True(q.TryReadReadout("sight.state", out var unknown), "a known id even without Sight");
        Assert.Equal(ReadoutConfidence.Unknown, unknown.Confidence);
    }
}
