using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Audio.Interop;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Audio.Tests;

/// <summary>
/// The real <see cref="AudioEngine"/> against <see cref="FakeAudioService"/>: COM lifetimes, callback order, audio
/// service restarts and the safe-mode backstop, all without touching this PC's audio.
/// </summary>
public class EngineFakeComTests
{
    private const string Speakers = "{fake}.speakers", Headset = "{fake}.headset", Mic = "{fake}.mic";

    private static async Task<AudioEngine> StartAsync(FakeAudioService svc, bool safeMode = false, ILog? log = null, int probeMs = 40, int firstRetryMs = 30, int maxRetryMs = 200)
    {
        var engine = AudioEngine.Start(log ?? NullLog.Instance, svc.Options(safeMode, probeMs, firstRetryMs, maxRetryMs));
        await engine.Ready.WaitAsync(TimeSpan.FromSeconds(5));
        return engine;
    }

    private static async Task Until(Func<bool> condition, string what, int timeoutMs = 3000)
    {
        var sw = Stopwatch.StartNew();
        while (!condition())
        {
            if (sw.ElapsedMilliseconds > timeoutMs) Assert.Fail($"timed out waiting for: {what}");
            await Task.Delay(10);
        }
    }

    private static string Describe(IEnumerable<(object Object, int Refs)> outstanding) =>
        string.Join(", ", outstanding.Select(o => $"{o.Object.GetType().Name}×{o.Refs}"));

    [Test]
    public async Task The_fake_service_drives_the_real_engine()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        Assert.True(engine.IsAvailable);
        Assert.Equal(2, engine.GetDevices(AudioFlow.Render).Count);
        Assert.Equal(Speakers, engine.GetDefaultId(AudioFlow.Render, AudioRole.Console));
        Assert.Equal("Example USB Audio", engine.GetDevice(Speakers)!.Title);
        Assert.Near(0.42, engine.GetDevice(Speakers)!.Volume, 0.001);
        using (engine.WatchSessions())
        {
            await Until(() => engine.GetApps().Count == 2, "two apps");
            Assert.Equal("Example Chat|Example Music", string.Join("|", engine.GetApps().Select(a => a.Name)));
            Assert.Equal(2, engine.GetApps().First(a => a.Key == "chat.exe").SessionCount);
        }
    }

    [Test]
    public async Task Without_safe_mode_writes_reach_the_service()
    {
        // The control for the safe-mode test below: the fake counts every setter that reaches it.
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        await engine.SetVolumeAsync(Speakers, 0.9f);
        await engine.SetDefaultAsync(Headset, DefaultRoles.Communications);
        Assert.Equal(2, svc.Setters);
        Assert.Near(0.9, svc.Find(Speakers)!.Volume, 0.001);
        Assert.Equal(Headset, svc.DefaultOf(EDataFlow.eRender, ERole.eCommunications));
    }

    [Test]
    public async Task Safe_mode_backstop_never_calls_a_core_audio_setter()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc, safeMode: true);
        using var watch = engine.WatchSessions();
        await Until(() => engine.GetApps().Count == 2, "two apps");

        await engine.SetVolumeAsync(Speakers, 0.9f);
        await engine.SetMuteAsync(Mic, true);
        await engine.SetDefaultAsync(Headset, DefaultRoles.All);
        await engine.SetAppVolumeAsync("music.exe", null, 0.1f);
        await engine.SetAppMuteAsync("chat.exe", null, true);

        Assert.Equal(0, svc.Setters, "no setter reached the (fake) audio service");
        Assert.Near(0.42, svc.Find(Speakers)!.Volume, 0.001);
        Assert.False(svc.Find(Mic)!.Muted);
        Assert.Equal(Speakers, svc.DefaultOf(EDataFlow.eRender, ERole.eConsole));
        // ...while the engine's own state moved, so keys still respond.
        Assert.Near(0.9, engine.GetDevice(Speakers)!.Volume, 0.001);
        Assert.True(engine.GetDevice(Mic)!.Muted);
        Assert.Equal(Headset, engine.GetDefaultId(AudioFlow.Render, AudioRole.Console));
        Assert.Near(0.1, engine.GetApps().First(a => a.Key == "music.exe").Volume, 0.001);
        Assert.True(engine.GetApps().First(a => a.Key == "chat.exe").Muted);
        Assert.Equal(7, engine.SuppressedWrites, "volume, mute, three default roles, app volume, app mute");
    }

    [Test]
    public async Task Dispose_unregisters_every_callback_and_releases_every_com_object()
    {
        var svc = FakeAudioService.Standard();
        svc.Find(Mic)!.Peak = 0.5f;
        var engine = await StartAsync(svc);
        var watch = engine.WatchSessions();
        await Until(() => engine.GetApps().Count == 2, "two apps");
        using (var meter = engine.OpenMeter(Mic))
        {
            await Until(() => meter.Take().Peak > 0, "the meter reads the fake peak");
        }
        Assert.True(await engine.IsCaptureInUseAsync(Mic) is not null);
        var r = await engine.RegistrationsAsync();
        Assert.Equal((3, 3, 2, 2, 3, 3), r);
        Assert.True(svc.Outstanding().Count > 0, "the engine holds objects while it runs");

        watch.Dispose();
        await engine.DisposeAsync();

        Assert.Empty(svc.Outstanding(), "every COM object was released at once: " + Describe(svc.Outstanding()));
        var e = svc.Enumerator!;
        Assert.Equal(e.Registered, e.Unregistered, "IMMNotificationClient unregistered");
        foreach (var ep in new[] { Speakers, Headset, Mic }.Select(id => svc.Find(id)!))
            foreach (var o in ep.AllObjects())
            {
                Assert.Equal(0, o.Volume.Callbacks, $"{ep.Id}: endpoint volume callback unregistered");
                Assert.Equal(0, o.SessionManager.Notifications, $"{ep.Id}: session notification unregistered");
                foreach (var s in o.SessionObjects()) Assert.Empty(s.EventsSnapshot(), $"{ep.Id}: session events unregistered");
            }
        Assert.True(svc.Policies.All(p => p.Disposed), "the policy client was released");
    }

    [Test]
    public async Task Unplugging_an_output_unregisters_its_session_callbacks_before_releasing_them()
    {
        // Review A #10: RefreshDevices released the session manager before SyncSessionManagers unregistered from it, so
        // with a working release the unregister call hit a dead wrapper and the audio service kept our callback.
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc);
        using var watch = engine.WatchSessions();
        await Until(() => engine.GetApps(Headset).Count == 1, "the headset session");
        var headset = svc.Find(Headset)!.ObjectsFor(svc, 0);
        Assert.Equal(1, headset.SessionManager.Registered);

        svc.Unplug(Headset);
        await Until(() => engine.GetDevice(Headset) is null, "the headset leaves the list");

        Assert.Equal(1, headset.SessionManager.Unregistered, "UnregisterSessionNotification reached the session manager");
        Assert.Equal(0, headset.SessionManager.Notifications);
        foreach (var s in headset.SessionObjects()) Assert.Empty(s.EventsSnapshot(), "the session's events were unregistered");
        Assert.Equal(0, headset.Volume.Callbacks, "the endpoint volume callback was unregistered");
        var held = headset.All().Select(o => (o, FakeAudioService.Refs(o))).Where(x => x.Item2 > 0).ToList();
        Assert.Empty(held, "the headset's objects were released: " + Describe(held));
        var r = await engine.RegistrationsAsync();
        Assert.Equal((2, 2, 1, 1, 2, 2), r);
    }

    [Test]
    public async Task An_audio_service_restart_reports_unavailable_then_reconnects()
    {
        var svc = FakeAudioService.Standard();
        var log = new ListLog();
        await using var engine = await StartAsync(svc, log: log);
        var changes = new ConcurrentQueue<AudioChange>();
        engine.Changed += changes.Enqueue;
        using var watch = engine.WatchSessions();
        await Until(() => engine.GetApps().Count == 2, "two apps");

        svc.Stop(); // nobody writes: the health check notices
        await Until(() => !engine.IsAvailable, "the engine reports unavailable");
        Assert.Equal(1, engine.Recoveries);
        Assert.True(changes.Any(c => c.Kind == AudioChangeKind.Availability));
        Assert.Empty(engine.GetDevices(AudioFlow.Render), "no stale devices while the service is gone");
        Assert.Empty(engine.GetApps());
        await Until(() => svc.Outstanding().Count == 0, "the dead objects are released");

        await Task.Delay(150); // a few failed attempts while it is down
        Assert.False(engine.IsAvailable);
        svc.Restart();
        await Until(() => engine.IsAvailable, "the engine reconnects");
        Assert.Equal(2, engine.GetDevices(AudioFlow.Render).Count);
        await Until(() => engine.GetApps().Count == 2, "sessions are watched again");
        Assert.Equal((3, 3, 2, 2, 3, 3), await engine.RegistrationsAsync());
        Assert.Equal(1, engine.Recoveries);
        Assert.True(log.Lines.Any(l => l.Contains("Core Audio stopped answering", StringComparison.Ordinal)), string.Join("\n", log.Lines));
        Assert.True(log.Lines.Any(l => l.Contains("Core Audio is back", StringComparison.Ordinal)), string.Join("\n", log.Lines));
        // Writes work again, on the new objects.
        await engine.SetVolumeAsync(Speakers, 0.3f);
        Assert.Near(0.3, svc.Find(Speakers)!.Volume, 0.001);
    }

    [Test]
    public async Task A_write_that_finds_the_service_gone_fails_and_starts_reconnecting()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc, probeMs: 0); // no health check: the write must notice
        svc.Stop();
        var ex = await Assert.ThrowsAsync<COMException>(() => engine.SetVolumeAsync(Speakers, 0.5f));
        Assert.Equal(HResults.AUDCLNT_E_SERVICE_NOT_RUNNING, ex.HResult);
        await Until(() => !engine.IsAvailable, "unavailable after the failed write");
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.SetVolumeAsync(Speakers, 0.5f)); // no device while down
        svc.Restart();
        await Until(() => engine.IsAvailable, "reconnected");
        Assert.Equal(1, engine.Recoveries);
    }

    [Test]
    public async Task A_session_reporting_server_shutdown_starts_reconnecting()
    {
        var svc = FakeAudioService.Standard();
        await using var engine = await StartAsync(svc, probeMs: 0);
        using var watch = engine.WatchSessions();
        await Until(() => engine.GetApps().Count == 2, "two apps");
        svc.Stop();
        svc.SessionsReportShutdown(); // IAudioSessionEvents::OnSessionDisconnected(DisconnectReasonServerShutdown)
        await Until(() => !engine.IsAvailable, "unavailable after the session said the service shut down");
        svc.Restart();
        await Until(() => engine.IsAvailable && engine.GetApps().Count == 2, "reconnected with sessions");
    }

    [Test]
    public async Task Reconnect_attempts_back_off_and_are_capped()
    {
        var svc = FakeAudioService.Standard();
        svc.Stop(); // the audio service is not running when the plugin starts
        await using var engine = await StartAsync(svc, probeMs: 0, firstRetryMs: 40, maxRetryMs: 160);
        Assert.False(engine.IsAvailable);
        await Until(() => svc.Attempts.Count >= 6, "six attempts", 5000);
        var t = svc.Attempts;
        var gaps = t.Zip(t.Skip(1), (a, b) => Stopwatch.GetElapsedTime(a, b).TotalMilliseconds).ToList();
        var text = string.Join(", ", gaps.Select(g => g.ToString("0")));
        Assert.True(gaps[1] > gaps[0] * 1.4 && gaps[2] > gaps[1] * 1.4, "the wait doubles: " + text);
        Assert.True(gaps.Skip(3).All(g => g is > 120 and < 400), "and stays at the cap: " + text);
        svc.Restart();
        await Until(() => engine.IsAvailable, "connects once the service is up", 5000);
        Assert.Equal(2, engine.GetDevices(AudioFlow.Render).Count);
    }

    [Test]
    public async Task Startup_keeps_trying_until_the_audio_service_answers()
    {
        var svc = FakeAudioService.Standard();
        svc.FailNextConnects(2);
        await using var engine = await StartAsync(svc, probeMs: 0, firstRetryMs: 20);
        Assert.False(engine.IsAvailable, "the first try failed; keys show 'no audio'");
        await Until(() => engine.IsAvailable, "the third try connects");
        Assert.Equal(3, svc.Attempts.Count);
        Assert.Equal(0, engine.Recoveries, "a slow start is not a lost service");
    }

    /// <summary>Collects log lines.</summary>
    internal sealed class ListLog : ILog
    {
        private readonly ConcurrentQueue<string> _lines = new();
        public IReadOnlyList<string> Lines => [.. _lines];
        public IEnumerable<string> At(LogLevel level) => _lines.Where(l => l.StartsWith(level + " ", StringComparison.Ordinal));
        public void Write(LogLevel level, string message, Exception? exception = null) => _lines.Enqueue($"{level} {message}");
        public ILog For(string category) => this;
        public bool IsEnabled(LogLevel level) => true;
    }
}
