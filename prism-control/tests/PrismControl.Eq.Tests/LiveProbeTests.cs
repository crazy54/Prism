using System.Net.Http;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Apo;
using PrismControl.Eq.Sonar;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests;

/// <summary>Refuses anything but GET, so a live probe can never write to the user's Sonar.</summary>
public sealed class ReadOnlyGuardHandler() : DelegatingHandler(new SocketsHttpHandler { UseProxy = false })
{
    public int Gets;
    public readonly List<string> Paths = [];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.Method != HttpMethod.Get) throw new InvalidOperationException($"live probes are read-only; refused {request.Method} {request.RequestUri?.AbsolutePath}");
        Interlocked.Increment(ref Gets);
        lock (Paths) Paths.Add(request.RequestUri?.PathAndQuery ?? "");
        return base.SendAsync(request, ct);
    }
}

/// <summary>
/// Read-only probes against the real SteelSeries GG / Sonar on this PC (category "integration"): discovery over the
/// GG core TLS, /v1/status, /configs/selected and the preset lists. The clients run in safe mode and every request goes
/// through <see cref="ReadOnlyGuardHandler"/>, so nothing can be written. Skips when GG is not running.
/// </summary>
public class LiveProbeTests
{
    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Live_sonar_discovery_status_configs_and_presets_read_only()
    {
        var guard = new ReadOnlyGuardHandler();
        using var client = new SonarClient(new SonarDiscovery(SonarDiscovery.DefaultCorePropsPaths(), NullLog.Instance), NullLog.Instance, TimeProvider.System, guard,
            writes: new Infrastructure.EqWriteGate(safeMode: true, NullLog.Instance)); // a second lock: safe mode stops writes before the guard does
        await using var backend = new SonarEqBackend(client, NullLog.Instance, TimeProvider.System);
        var a = await backend.ProbeAsync(CancellationToken.None);
        if (a.Code is EqAvailabilityCode.NotRunning or EqAvailabilityCode.Disabled) Assert.Skip($"SteelSeries GG/Sonar not available here: {a.Reason}");
        Assert.True(a.Available, $"{a.Reason} {a.Detail}");
        Console.WriteLine($"     sonar at {client.BaseUri} (mode {client.LastStatus?.Mode})");

        var channels = await backend.GetChannelsAsync(CancellationToken.None);
        Assert.Equal(5, channels.Count);
        foreach (var ch in channels)
        {
            var s = await backend.GetStateAsync(ch.Id, TimeSpan.FromSeconds(30), CancellationToken.None);
            Assert.True(s.Bands.Count == 10, $"{ch.Id}: {s.Bands.Count} filters");
            Console.WriteLine($"     {ch.Name,-6} {(ch.IsActive ? "on " : "off")} preset \"{s.ActivePreset?.Name}\"{(s.ModifiedFromDefault ? " (modified)" : "")}, EQ {(s.Enabled ? "on" : "off")}, " +
                $"{s.Bands.Count(b => b.Enabled)} bands on, knobs [{string.Join(", ", s.Knobs.Select(k => $"{k.Key} {k.Value:0.#}"))}], curve peak {EqMath.PeakDb(s):0.0} dB");
        }
        var game = await backend.GetPresetsAsync(SonarChannels.Game, TimeSpan.Zero, CancellationToken.None);
        Assert.True(game.Count > 0);
        Console.WriteLine($"     game presets: {game.Count} ({game.Count(p => p.IsFavorite)} favorites); chat: {(await backend.GetPresetsAsync(SonarChannels.Chat, TimeSpan.Zero, CancellationToken.None)).Count}");
        Assert.Equal(0, backend.WritesStarted);
        Assert.True(guard.Paths.All(p => p.StartsWith("/v1/status", StringComparison.Ordinal) || p.StartsWith("/configs/selected", StringComparison.Ordinal) || p.StartsWith("/presets/", StringComparison.Ordinal)),
            string.Join(", ", guard.Paths));
        Console.WriteLine($"     {guard.Gets} GET requests, 0 writes");
    }

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Live_sonar_volumes_and_chatmix_read_only()
    {
        var guard = new ReadOnlyGuardHandler();
        using var client = new SonarClient(new SonarDiscovery(SonarDiscovery.DefaultCorePropsPaths(), NullLog.Instance), NullLog.Instance, TimeProvider.System, guard,
            writes: new Infrastructure.EqWriteGate(safeMode: true, NullLog.Instance)); // a second lock: safe mode stops writes before the guard does
        await using var mixer = new SonarMixer(client, NullLog.Instance, TimeProvider.System);
        var a = await client.EnsureAsync(CancellationToken.None);
        if (!a.Available) Assert.Skip($"Sonar not available here: {a.Reason}");
        var master = await mixer.GetVolumeAsync(SonarMixer.Master, "monitoring", TimeSpan.Zero, CancellationToken.None);
        var chat = await mixer.GetChatMixAsync(TimeSpan.Zero, CancellationToken.None);
        Assert.InRange(master.Volume, 0, 1);
        Console.WriteLine($"     master {master.Volume:P0}{(master.Muted ? " muted" : "")}; chatmix {chat.Balance:0.00} ({chat.State}, writable: {chat.CanWrite})");
        Console.WriteLine($"     {guard.Gets} GET requests, 0 writes");
    }

    [Test(Category = "integration")]
    public void Live_equalizer_apo_detection_read_only()
    {
        var env = new RegistryApoEnvironment();
        var install = env.FindInstall();
        var devices = install is null ? [] : env.ListDevices();
        Console.WriteLine(install is null
            ? "     Equalizer APO is not installed on this PC (expected: research eq.md §6.1)."
            : $"     Equalizer APO {install.Version} at {install.ConfigPath}, {devices.Count} device(s) with APO, attached: {ApoConfigFiles.IsAttached(install.ConfigPath)}");
    }
}
