using System.Diagnostics;
using System.Text;
using PrismControl.Audio;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>
/// Read-only probes against this PC's real Core Audio. They enumerate, read and meter; they never change a volume,
/// mute or default device. (The one write probe is opt-in, same-value, and documented on the test.)
/// </summary>
public class EngineIntegrationTests
{
    private static async Task<AudioEngine> StartAsync()
    {
        var engine = AudioEngine.Start(new ConsoleLog());
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(10));
        if (!engine.IsAvailable)
        {
            await engine.DisposeAsync();
            Assert.Skip("Core Audio is not available on this machine");
        }
        return engine;
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Enumerates_endpoints_defaults_volumes_and_mutes_read_only()
    {
        var sw = Stopwatch.StartNew();
        await using var engine = await StartAsync();
        Console.WriteLine($"     engine ready in {sw.ElapsedMilliseconds} ms; default switching available: {engine.CanSetDefault}");
        var render = engine.GetDevices(AudioFlow.Render);
        var capture = engine.GetDevices(AudioFlow.Capture);
        Assert.True(render.Count + capture.Count > 0, "expected at least one active endpoint");
        foreach (var d in render.Concat(capture))
        {
            Assert.False(string.IsNullOrWhiteSpace(d.FriendlyName), "every endpoint has a friendly name");
            Assert.False(string.IsNullOrWhiteSpace(d.Title));
            Assert.InRange(d.Volume, 0, 1);
            Console.WriteLine($"     {(d.Flow == AudioFlow.Render ? "out" : "in "),-3} {d.VolumePct,3}%{(d.Muted ? " muted" : "      ")}{(d.HasVolume ? "      " : " fixed")} {d.Title} | {d.Subtitle}");
        }
        foreach (var flow in new[] { AudioFlow.Render, AudioFlow.Capture })
            foreach (var role in Enum.GetValues<AudioRole>())
            {
                var id = engine.GetDefaultId(flow, role);
                if (id is null) continue;
                Assert.NotNull(engine.GetDevice(id), $"the {flow}/{role} default is in the device list");
            }
        var defOut = engine.GetDefaultId(AudioFlow.Render, AudioRole.Console);
        var defIn = engine.GetDefaultId(AudioFlow.Capture, AudioRole.Communications);
        Console.WriteLine($"     default output: {engine.GetDevice(defOut ?? "")?.FriendlyName}; default comms input: {engine.GetDevice(defIn ?? "")?.FriendlyName}");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Tracks_sessions_per_app_read_only()
    {
        await using var engine = await StartAsync();
        var changed = new TaskCompletionSource();
        engine.Changed += c => { if (c.Kind == AudioChangeKind.Sessions) changed.TrySetResult(); };
        var sw = Stopwatch.StartNew();
        using (engine.WatchSessions())
        {
            await Task.WhenAny(changed.Task, Task.Delay(5000));
            Console.WriteLine($"     session scan took {sw.ElapsedMilliseconds} ms");
            var all = engine.GetApps();
            var onDefault = engine.GetApps(engine.GetDefaultId(AudioFlow.Render, AudioRole.Console));
            Console.WriteLine($"     {all.Count} apps on any output, {onDefault.Count} on the default output");
            foreach (var a in all)
            {
                Assert.False(string.IsNullOrWhiteSpace(a.Name));
                Assert.InRange(a.Volume, 0, 1);
                Assert.True(a.Key != "audiodg.exe", "audio engine processing is hidden");
                Console.WriteLine($"     {a.Key,-28} {a.VolumePct,3}%{(a.Muted ? " muted" : "")}{(a.IsActive ? " playing" : "")} '{a.Name}' sessions={a.SessionCount} devices={a.DeviceIds.Count}");
            }
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Meters_the_default_output_and_input_read_only()
    {
        await using var engine = await StartAsync();
        foreach (var flow in new[] { AudioFlow.Render, AudioFlow.Capture })
        {
            var id = engine.GetDefaultId(flow, AudioRole.Console);
            if (id is null) continue;
            using var meter = engine.OpenMeter(id);
            var max = 0f;
            var channels = 0;
            for (var i = 0; i < 10; i++)
            {
                await Task.Delay(40);
                var r = meter.Take();
                Assert.InRange(r.Peak, 0, 1);
                max = Math.Max(max, r.Peak);
                channels = Math.Max(channels, r.Channels.Length);
            }
            Console.WriteLine($"     {flow}: peak max {max:0.000} over 400 ms, {channels} channels ({engine.GetDevice(id)?.Title})");
        }
        // Every active endpoint at once (one sampler serves all leases), to show live signal wherever audio plays.
        var all = engine.GetDevices(AudioFlow.Render).Concat(engine.GetDevices(AudioFlow.Capture)).ToList();
        var leases = all.Select(d => (d, m: engine.OpenMeter(d.Id))).ToList();
        var peaks = all.ToDictionary(d => d.Id, _ => 0f);
        for (var i = 0; i < 10; i++)
        {
            await Task.Delay(40);
            foreach (var (d, m) in leases) peaks[d.Id] = Math.Max(peaks[d.Id], m.Take().Peak);
        }
        foreach (var (_, m) in leases) m.Dispose();
        Console.WriteLine("     live: " + string.Join(", ", all.Where(d => peaks[d.Id] > 0).Select(d => $"{d.Title} ({(d.Flow == AudioFlow.Render ? "out" : "in")}) {peaks[d.Id]:0.000}")));
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Reports_whether_the_default_mic_is_in_use_read_only()
    {
        await using var engine = await StartAsync();
        var id = engine.GetDefaultId(AudioFlow.Capture, AudioRole.Console);
        if (id is null) Assert.Skip("no capture device");
        var inUse = await engine.IsCaptureInUseAsync(id!);
        Console.WriteLine($"     default mic in use: {inUse?.ToString() ?? "unknown"}");
        Assert.NotNull((object?)inUse, "the capture sessions can be read");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Data_topics_serve_real_values_read_only()
    {
        await using var engine = await StartAsync();
        var registry = new DataRegistry();
        await using var data = new AudioDataProviders(engine, registry, TimeProvider.System, NullLog.Instance, CancellationToken.None);
        data.Start();
        Assert.True(data.ClaimedDevices && data.ClaimedMic && data.ClaimedLevels);

        var devices = await ReadAsync(registry.AudioDevices);
        Assert.Contains("\"defaultId\":\"{", devices);
        Console.WriteLine($"     /v1/audio/devices: {devices.Length} bytes");

        await Task.Delay(300); // the first mic publish runs on the thread pool
        var mic = await ReadAsync(registry.Mic);
        Assert.Contains("\"muted\":", mic);
        Console.WriteLine("     /v1/mic: " + Scrub(mic));

        await ReadAsync(registry.AudioLevels, allowEmpty: true); // starts demand
        await Task.Delay(200);
        var levels = await ReadAsync(registry.AudioLevels);
        Assert.Contains("\"intervalMs\":33", levels);
        Console.WriteLine("     /v1/audio/levels: " + Scrub(levels));
    }

    /// <summary>
    /// OPT-IN (PRISM_AUDIO_OBSERVE_SECONDS=n): watches for n seconds and logs every change Windows reports
    /// (apps starting/stopping playback, volume changes made elsewhere, default switches). Read-only.
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 300_000)]
    public async Task Observes_live_notifications_when_opted_in()
    {
        if (!int.TryParse(Environment.GetEnvironmentVariable("PRISM_AUDIO_OBSERVE_SECONDS"), out var seconds) || seconds <= 0)
            Assert.Skip("opt-in: set PRISM_AUDIO_OBSERVE_SECONDS");
        await using var engine = await StartAsync();
        var counts = new System.Collections.Concurrent.ConcurrentDictionary<AudioChangeKind, int>();
        var sw = Stopwatch.StartNew();
        engine.Changed += c =>
        {
            counts.AddOrUpdate(c.Kind, 1, (_, n) => n + 1);
            var what = c.Kind switch
            {
                AudioChangeKind.Endpoint => $"{engine.GetDevice(c.DeviceId ?? "")?.Title}: {engine.GetDevice(c.DeviceId ?? "")?.VolumePct}%{(engine.GetDevice(c.DeviceId ?? "")?.Muted == true ? " muted" : "")}",
                AudioChangeKind.Defaults => $"{c.Flow} default -> {engine.GetDevice(c.DeviceId ?? "")?.Title}",
                AudioChangeKind.Sessions => $"{engine.GetApps().Count(a => a.IsActive)} playing of {engine.GetApps().Count}",
                _ => "",
            };
            Console.WriteLine($"     +{sw.Elapsed.TotalSeconds,5:0.0}s {c.Kind} {what}");
        };
        using (engine.WatchSessions()) await Task.Delay(TimeSpan.FromSeconds(seconds));
        Console.WriteLine("     totals: " + string.Join(", ", counts.Select(kv => $"{kv.Key}={kv.Value}")));
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Every_callback_registers_read_only()
    {
        await using var engine = await StartAsync();
        var changed = new TaskCompletionSource();
        engine.Changed += c => { if (c.Kind == AudioChangeKind.Sessions) changed.TrySetResult(); };
        using (engine.WatchSessions())
        {
            await Task.WhenAny(changed.Task, Task.Delay(5000));
            var r = await engine.RegistrationsAsync();
            Console.WriteLine($"     endpoints {r.Endpoints}, volume callbacks {r.VolumeCallbacks}; session managers {r.SessionManagersRegistered}/{r.SessionManagers}; session event sinks {r.SessionEvents}/{r.Sessions}");
            Assert.True(r.Endpoints > 0);
            Assert.Equal(r.Endpoints, r.VolumeCallbacks, "IAudioEndpointVolumeCallback on every endpoint");
            Assert.Equal(r.SessionManagers, r.SessionManagersRegistered, "IAudioSessionNotification on every output");
            Assert.Equal(r.Sessions, r.SessionEvents, "IAudioSessionEvents on every session");
        }
    }

    /// <summary>
    /// The service-restart detection, checked from the healthy side only (restarting the audio service is not ours to do):
    /// the health check runs every 100 ms for a second and must never mistake this PC's working audio for an outage;
    /// a session scan, a meter and a full teardown with unique RCWs run cleanly on the real objects. Read-only.
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Health_check_and_release_run_cleanly_on_this_pc_read_only()
    {
        var engine = AudioEngine.Start(new ConsoleLog(), new AudioEngineOptions { ProbeInterval = TimeSpan.FromMilliseconds(100) });
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(10));
        if (!engine.IsAvailable)
        {
            await engine.DisposeAsync();
            Assert.Skip("Core Audio is not available on this machine");
        }
        using (engine.WatchSessions())
        {
            var id = engine.GetDefaultId(AudioFlow.Render, AudioRole.Console);
            using var meter = id is null ? null : engine.OpenMeter(id);
            await Task.Delay(1000);
            meter?.Take();
            Assert.True(engine.IsAvailable);
            Assert.Equal(0, engine.Recoveries, "no false alarm from the health check");
            Console.WriteLine($"     10 health checks, {engine.GetApps().Count} apps, recoveries {engine.Recoveries}");
        }
        var sw = Stopwatch.StartNew();
        await engine.DisposeAsync();
        Console.WriteLine($"     teardown (unregister + release every object) in {sw.ElapsedMilliseconds} ms");
        Assert.True(sw.ElapsedMilliseconds < 1500, "teardown finished inside its budget");
    }

    /// <summary>
    /// OPT-IN (PRISM_AUDIO_SAME_VALUE_WRITE=1). Proves the write paths and the live callbacks end to end with
    /// same-value writes only (nothing audible or routable changes):
    /// a "writer" engine with its own event context sets the default output's volume and mute to their current
    /// values and re-asserts the current default COMMUNICATIONS output (the role media players do not follow, as in
    /// research/windows.md §1.6); an "observer" engine must receive the endpoint and default-device callbacks.
    /// A third fresh engine reads the values back. Anything that differs is restored at once. (Windows reports no
    /// endpoint-volume callback for a same-value write, so only the default-device callback can be proven this way.)
    /// </summary>
    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Same_value_writes_round_trip_and_reach_other_listeners_when_opted_in()
    {
        if (Environment.GetEnvironmentVariable("PRISM_AUDIO_SAME_VALUE_WRITE") != "1") Assert.Skip("opt-in: set PRISM_AUDIO_SAME_VALUE_WRITE=1");
        await using var observer = await StartAsync();
        await using var writer = AudioEngine.Start(new ConsoleLog(), Guid.NewGuid());
        await writer.Ready.WaitAsync(TimeSpan.FromSeconds(10));
        var id = writer.GetDefaultId(AudioFlow.Render, AudioRole.Console) ?? throw new InvalidOperationException("no default output");
        var comms = writer.GetDefaultId(AudioFlow.Render, AudioRole.Communications) ?? throw new InvalidOperationException("no communications output");
        var before = writer.GetDevice(id)!;
        var defaultsBefore = Snapshot(writer);
        var endpointCalls = observer.EndpointNotifications;
        var defaultCalls = observer.DefaultNotifications;
        try
        {
            await writer.SetVolumeAsync(id, before.Volume); // HRESULTs checked: these throw on failure
            await writer.SetMuteAsync(id, before.Muted);
            if (writer.CanSetDefault) await writer.SetDefaultAsync(comms, DefaultRoles.Communications);
            await Task.Delay(400);
            await using var check = await StartAsync();
            var after = check.GetDevice(id)!;
            Console.WriteLine($"     same-value writes on '{before.Title}': volume {before.Volume:0.0000} -> {after.Volume:0.0000}, muted {before.Muted} -> {after.Muted}");
            Console.WriteLine($"     observer callbacks: endpoint +{observer.EndpointNotifications - endpointCalls}, default device +{observer.DefaultNotifications - defaultCalls}");
            Assert.Near(before.Volume, after.Volume, 0.0005);
            Assert.Equal(before.Muted, after.Muted);
            Assert.Equal(defaultsBefore, Snapshot(check), "every default is unchanged");
            // Windows sends no IAudioEndpointVolumeCallback for a same-value write (SetMute even answers S_FALSE, "no
            // change"), so endpoint delivery is reported here, not asserted; proving it needs a real volume change.
            if (writer.CanSetDefault) Assert.True(observer.DefaultNotifications > defaultCalls, "IMMNotificationClient delivered a default-device change");
        }
        finally
        {
            // Belt and braces: if anything differs, put the user's values back right away.
            await using var now = await StartAsync();
            var d = now.GetDevice(id);
            if (d is not null && (Math.Abs(d.Volume - before.Volume) > 0.0005 || d.Muted != before.Muted))
            {
                await writer.SetVolumeAsync(id, before.Volume);
                await writer.SetMuteAsync(id, before.Muted);
                Console.WriteLine("     RESTORED the original volume and mute");
            }
        }
    }

    private static string Snapshot(IAudioEngine e) => string.Join(";", from f in new[] { AudioFlow.Render, AudioFlow.Capture }
                                                                    from r in Enum.GetValues<AudioRole>()
                                                                    select $"{f}/{r}={e.GetDefaultId(f, r)}");

    private static async Task<string> ReadAsync(DataTopic topic, bool allowEmpty = false)
    {
        var v = await topic.ReadAsync(CancellationToken.None);
        if (v is null)
        {
            if (allowEmpty) return "";
            Assert.Fail($"{topic.Path} has no data");
        }
        return Encoding.UTF8.GetString(v!.Body);
    }

    /// <summary>Shortens endpoint ids for the log.</summary>
    private static string Scrub(string json) => System.Text.RegularExpressions.Regex.Replace(json, @"\{0\.0\.\d\.00000000\}\.\{[0-9a-f-]{36}\}", "{…}");

    private sealed class ConsoleLog : ILog
    {
        public void Write(LogLevel level, string message, Exception? exception = null)
        {
            if (level >= LogLevel.Warn) Console.WriteLine($"     [{level}] {message} {exception?.Message}");
        }

        public ILog For(string category) => this;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Info;
    }
}
