using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>The audio module on a fake engine, with host events the tests raise.</summary>
internal sealed class ModuleRig : IAsyncDisposable
{
    private bool _disposed;

    private ModuleRig(FakeAudioEngine fake, bool safeMode)
    {
        Fake = fake;
        Context = new AudioModuleContext(safeMode);
        Module = new AudioModule(fake);
        Module.Initialize(Context);
    }

    public static ModuleRig Start(FakeAudioEngine fake, bool safeMode = false) => new(fake, safeMode);

    public FakeAudioEngine Fake { get; }
    public AudioModuleContext Context { get; }
    public AudioModule Module { get; }
    public FakePluginEvents Events => Context.FakeEvents;

    /// <summary>For harnesses: the services the module registered (the engine and the mic-hold guard).</summary>
    public Action<ServiceRegistry> Services => s =>
    {
        s.Add(Context.Services.Get<IAudioEngine>());
        s.Add(Context.Services.Get<MicHoldGuard>());
    };

    public async Task ShutDownAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await Module.DisposeAsync();
    }

    public async ValueTask DisposeAsync() => await ShutDownAsync();
}

internal sealed class AudioModuleContext(bool safeMode) : IModuleContext
{
    public FakePluginEvents FakeEvents { get; } = new();
    public EngineFakeComTests.ListLog Lines { get; } = new();
    public ILog Log => Lines;
    public IDataRegistry Data { get; } = new DataRegistry();
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings();
    public IPluginEvents Events => FakeEvents;
    public IDeviceDirectory Devices => throw new NotSupportedException("the audio module does not look devices up");
    public TimeProvider Time => TimeProvider.System;
    public CancellationToken ShutdownToken => CancellationToken.None;
    public string PluginDirectory => AppContext.BaseDirectory;
    public string DataDirectory => Path.GetTempPath();
    public void OpenUrl(string url) { }
    public bool SafeMode => safeMode;
}

internal sealed class FakePluginEvents : IPluginEvents
{
    public event EventHandler<DeviceInfo>? DeviceConnected;
    public event EventHandler<string>? DeviceDisconnected;
    public event EventHandler? SystemWokeUp;
    public event EventHandler<string>? ApplicationLaunched;
    public event EventHandler<string>? ApplicationTerminated;
    public event EventHandler<string>? DeepLinkReceived;
    public event EventHandler? Connected;
    public event EventHandler? Disconnected;

    public void RaiseDeviceDisconnected(string deviceId) => DeviceDisconnected?.Invoke(this, deviceId);
    public void RaiseSystemWokeUp() => SystemWokeUp?.Invoke(this, EventArgs.Empty);

    /// <summary>How many handlers listen (the module must unsubscribe on shutdown).</summary>
    public int Listeners => (DeviceDisconnected?.GetInvocationList().Length ?? 0) + (SystemWokeUp?.GetInvocationList().Length ?? 0);

    // Not used by the audio module; referenced so the compiler does not warn about unused events.
    internal void Touch()
    {
        DeviceConnected?.Invoke(this, null!);
        ApplicationLaunched?.Invoke(this, "");
        ApplicationTerminated?.Invoke(this, "");
        DeepLinkReceived?.Invoke(this, "");
        Connected?.Invoke(this, EventArgs.Empty);
        Disconnected?.Invoke(this, EventArgs.Empty);
    }
}
