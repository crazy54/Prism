using PrismControl.Core.Hosting;

[assembly: PrismModule(typeof(PrismControl.Audio.AudioModule))]

namespace PrismControl.Audio;

/// <summary>
/// Windows Core Audio for Prism Control: master and per-app volume, default-device switching, mic mute and meters.
/// Registers one <see cref="IAudioEngine"/> (actions get it from <c>Services</c>), the <see cref="MicHoldGuard"/> that
/// keeps held mic keys from leaving the mic live, and serves the audio data topics.
/// <para>
/// Safe mode (<see cref="IModuleContext.SafeMode"/>): the registered engine is a <see cref="SafeAudioEngine"/>, so every
/// volume, mute, default-device and app write only changes an in-memory overlay; the real engine is also started with
/// its own backstop that never calls a Core Audio setter. Reads stay real.
/// </para>
/// </summary>
public sealed class AudioModule : IPrismModule, IAsyncDisposable
{
    private readonly IAudioEngine? _given;
    private AudioEngine? _engine;
    private AudioDataProviders? _data;
    private MicHoldGuard? _holds;
    private IPluginEvents? _events;
    private ILog? _log;

    public AudioModule() { }

    /// <summary>Tests: run the module on a given engine (a fake) instead of Core Audio.</summary>
    internal AudioModule(IAudioEngine engine) => _given = engine;

    public string Name => "audio";

    /// <summary>The engine actions get (the safe-mode wrapper in safe mode).</summary>
    internal IAudioEngine? Engine { get; private set; }

    internal MicHoldGuard? Holds => _holds;

    public void Initialize(IModuleContext context)
    {
        _log = context.Log;
        var safe = context.SafeMode;
        // Start returns at once; the first device scan runs on the engine's own COM thread.
        IAudioEngine engine = _given ?? (_engine = AudioEngine.Start(context.Log, new AudioEngineOptions { SafeMode = safe }));
        Engine = safe ? SafeAudioEngine.For(engine, context.Log) : engine;
        if (safe) context.Log.Info("Safe mode: audio volume, mute, default-device and app changes are simulated in memory and never applied to Windows.");
        context.Services.Add<IAudioEngine>(Engine);

        _holds = new MicHoldGuard(Engine, context.Log);
        context.Services.Add(_holds);
        _events = context.Events;
        _events.DeviceDisconnected += OnDeckDisconnected;
        _events.SystemWokeUp += OnSystemWoke;

        _data = new AudioDataProviders(Engine, context.Data, context.Time, context.Log, context.ShutdownToken);
        _data.Start();
    }

    private void OnDeckDisconnected(object? sender, string deckId) => _ = _holds?.ReleaseDeckAsync(deckId, "was held on a Stream Deck that disconnected");

    private void OnSystemWoke(object? sender, EventArgs e) => _ = _holds?.ReleaseAllAsync("was held when the PC went to sleep");

    public async ValueTask DisposeAsync()
    {
        if (_events is not null)
        {
            _events.DeviceDisconnected -= OnDeckDisconnected;
            _events.SystemWokeUp -= OnSystemWoke;
            _events = null;
        }
        if (_holds is not null)
        {
            // Before the engine goes: a key still held must not leave the mic live after the plugin is gone.
            try
            {
                await _holds.ReleaseAllAsync("was held when the plugin shut down").WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                await _holds.DrainAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
            }
            catch (Exception ex) { _log?.Warn("restoring held mic keys at shutdown failed", ex); }
            _holds.Dispose();
        }
        if (_data is not null) await _data.DisposeAsync().ConfigureAwait(false);
        if (_engine is not null) await _engine.DisposeAsync().ConfigureAwait(false);
    }
}
