using PrismControl.Audio;
using PrismControl.Audio.Art;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Testing;
using static PrismControl.Audio.Tests.FakeAudioEngine;

namespace PrismControl.Audio.Tests;

/// <summary>
/// Safe mode (docs/authoring-actions.md § Safe mode): with <c>safeMode: true</c>, presses and turns on every audio action
/// change nothing in the engine underneath (the fake's write log stays empty), the keys still respond, and the
/// "would have written" log shows what was suppressed.
/// </summary>
public class SafeModeTests
{
    private static SafeAudioEngine Safe(FakeAudioEngine f) => (SafeAudioEngine)SafeAudioEngine.For(f, NullLog.Instance);

    [Test]
    public async Task Volume_turns_and_presses_write_nothing_and_still_respond()
    {
        var f = Standard();
        await using var dial = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            new VolumeSettings { Step = 2 }, H.With(f), safeMode: true);
        await dial.RotateAsync(12);
        Assert.Equal(66, ((VolumeView)dial.Action.LastView!).Pct, "the dial shows the new (simulated) level");
        await dial.DialPressAsync();
        Assert.True(((VolumeView)dial.Action.LastView!).Muted);
        await using var key = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new VolumeSettings { KeyPress = "up" }, H.With(f), safeMode: true);
        Assert.Equal(66, ((VolumeView)key.Action.LastView!).Pct, "every key sees the same simulated state");
        await key.PressAsync();

        Assert.Empty(f.Writes, "nothing reached the engine");
        Assert.Near(0.42, f.GetDevice(Speakers)!.Volume, 0.001);
        Assert.Equal($"volume {Speakers} 0.66|mute {Speakers} True|mute {Speakers} False|volume {Speakers} 0.68", string.Join("|", Safe(f).WouldHaveWritten));
        dial.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Mic_toggle_hold_and_level_write_nothing()
    {
        var f = Standard();
        await using var key = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad, configureServices: H.With(f), safeMode: true);
        await key.PressAsync();
        Assert.True(((MicView)key.Action.LastView!).Muted, "the key turns red as if it worked");
        await key.SettingsFromPropertyInspectorAsync(new MicSettings { Mode = "ptt" });
        await key.KeyDownAsync();
        Assert.False(((MicView)key.Action.LastView!).Muted);
        await key.KeyUpAsync();
        Assert.True(((MicView)key.Action.LastView!).Muted);
        await using var dial = await ActionHarness<MicMuteAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder,
            new MicSettings { Step = 1 }, H.With(f), safeMode: true);
        await dial.RotateAsync(-12);

        Assert.Empty(f.Writes);
        Assert.False(f.GetDevice(UsbMic)!.Muted, "the real mic was never muted");
        Assert.Equal($"mute {UsbMic} True|mute {UsbMic} False|mute {UsbMic} True|volume {UsbMic} 0.68", string.Join("|", Safe(f).WouldHaveWritten));
    }

    [Test]
    public async Task Device_switchers_write_nothing()
    {
        var f = Standard();
        await using var key = await ActionHarness<OutputDeviceAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Keypad,
            new DeviceSwitchSettings { Devices = [Speakers, Headset] }, H.With(f), safeMode: true);
        await key.PressAsync();
        Assert.Equal("The Example Ensemble Headset", ((DeviceView)key.Action.LastView!).Title, "the key shows the simulated default");
        await using var dial = await ActionHarness<InputDeviceAction>.AppearAsync(TestDevices.Galleon, new(1, 0), Controller.Encoder, configureServices: H.With(f), safeMode: true);
        await dial.RotateAsync(1);
        await dial.DialPressAsync();

        Assert.Empty(f.Writes);
        Assert.Equal(Speakers, f.GetDefaultId(AudioFlow.Render, AudioRole.Console));
        Assert.Equal($"default {Headset} All|default {MixerMic} All", string.Join("|", Safe(f).WouldHaveWritten));
    }

    [Test]
    public async Task Mixer_and_app_volume_write_nothing()
    {
        var f = WithApps();
        await using var mixer = await ActionHarness<MixerAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f), safeMode: true);
        await mixer.DialPressAsync();
        await mixer.RotateAsync(-3);
        Assert.Equal(74, ((MixerView)mixer.Action.LastView!).Pct);
        await mixer.TapAsync(100, 50);
        await using var app = await ActionHarness<AppVolumeAction>.AppearAsync(TestDevices.Plus, new(1, 0), Controller.Keypad,
            new AppVolumeSettings { App = "music.exe" }, H.With(f), safeMode: true);
        await app.PressAsync();

        Assert.Empty(f.Writes);
        Assert.Near(0.8, f.GetApps().First(a => a.Key == "browser.exe").Volume, 0.001);
        Assert.Equal($"appvolume browser.exe {Speakers} 0.74|appmute browser.exe {Speakers} True|appmute music.exe * True", string.Join("|", Safe(f).WouldHaveWritten));
    }

    [Test]
    public async Task The_level_meter_writes_nothing_either()
    {
        var f = Standard();
        await using var h = await ActionHarness<LevelMeterAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: H.With(f), safeMode: true);
        await h.RotateAsync(1);
        await h.DialPressAsync();
        await h.AdvanceAsync(TimeSpan.FromSeconds(1));
        Assert.Empty(f.Writes);
        Assert.Empty(Safe(f).WouldHaveWritten);
    }

    [Test]
    public async Task The_module_in_safe_mode_registers_the_safe_engine_for_actions_and_data()
    {
        var f = Standard();
        await using var rig = ModuleRig.Start(f, safeMode: true);
        var registered = rig.Context.Services.Get<IAudioEngine>();
        Assert.True(registered is SafeAudioEngine, "actions get the safe engine");
        Assert.True(ReferenceEquals(registered, Safe(f)), "one wrapper per engine");
        await registered.SetMuteAsync(UsbMic, true);
        Assert.Empty(f.Writes);
        // A plain harness (safeMode off) on the module's services still cannot write: the engine it gets is safe.
        await using var h = await ActionHarness<VolumeAction>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder, configureServices: rig.Services);
        await h.RotateAsync(1);
        Assert.Empty(f.Writes);
        Assert.True(rig.Context.Lines.Lines.Any(l => l.Contains("Safe mode:", StringComparison.Ordinal)), "the module says safe mode is on");
    }

    [Test]
    public async Task Suppressed_writes_are_logged_once_per_process_without_device_names()
    {
        SafeModeLog.ResetForTests();
        var f = Standard();
        var log = new EngineFakeComTests.ListLog();
        var safe = SafeAudioEngine.For(new FakeAudioEngineWrapper(f), log);
        await safe.SetVolumeAsync(Speakers, 0.5f);
        await safe.SetMuteAsync(UsbMic, true);
        await safe.SetDefaultAsync(Headset, DefaultRoles.All);
        var info = log.At(PrismControl.Core.Hosting.LogLevel.Info).ToList();
        Assert.Single(info, "one Info line for the whole process");
        Assert.Contains("[safe mode]", info[0]);
        Assert.Equal(2, log.At(PrismControl.Core.Hosting.LogLevel.Debug).Count(), "the rest at debug level");
        foreach (var line in log.Lines)
        {
            Assert.DoesNotContain("Example", line, "no device names in the log");
            Assert.DoesNotContain("{0.0.", line, "no endpoint ids in the log");
        }
        Assert.Empty(f.Writes);
    }

    /// <summary>A separate engine identity (SafeAudioEngine.For keeps one wrapper per engine, and the log goes to the first caller's log).</summary>
    private sealed class FakeAudioEngineWrapper(FakeAudioEngine f) : IAudioEngine
    {
        public bool IsAvailable => f.IsAvailable;
        public bool CanSetDefault => f.CanSetDefault;
        public event Action<AudioChange>? Changed { add => f.Changed += value; remove => f.Changed -= value; }
        public IReadOnlyList<AudioDevice> GetDevices(AudioFlow flow) => f.GetDevices(flow);
        public AudioDevice? GetDevice(string id) => f.GetDevice(id);
        public string? GetDefaultId(AudioFlow flow, AudioRole role) => f.GetDefaultId(flow, role);
        public Task SetVolumeAsync(string deviceId, float volume) => f.SetVolumeAsync(deviceId, volume);
        public Task SetMuteAsync(string deviceId, bool muted) => f.SetMuteAsync(deviceId, muted);
        public Task SetDefaultAsync(string deviceId, DefaultRoles roles) => f.SetDefaultAsync(deviceId, roles);
        public IDisposable WatchSessions() => f.WatchSessions();
        public IReadOnlyList<AudioApp> GetApps(string? deviceId = null) => f.GetApps(deviceId);
        public Task SetAppVolumeAsync(string appKey, string? deviceId, float volume) => f.SetAppVolumeAsync(appKey, deviceId, volume);
        public Task SetAppMuteAsync(string appKey, string? deviceId, bool muted) => f.SetAppMuteAsync(appKey, deviceId, muted);
        public IAudioMeter OpenMeter(string deviceId) => f.OpenMeter(deviceId);
        public Task<bool?> IsCaptureInUseAsync(string deviceId) => f.IsCaptureInUseAsync(deviceId);
    }
}
