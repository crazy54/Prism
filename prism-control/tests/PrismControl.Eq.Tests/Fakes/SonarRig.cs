using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Eq.Infrastructure;
using PrismControl.Eq.Sonar;
using PrismControl.Eq.Tests;
using PrismControl.Testing;

namespace PrismControl.Eq.Tests.Fakes;

/// <summary>
/// The whole Sonar chain against fakes: a temp coreProps.json → the fake GG core (TLS, /subApps) → the fake Sonar
/// (HTTP). The backend, mixer and service run on a <see cref="ManualTimeProvider"/>, so coalesced writes only go out
/// when a test advances time or flushes. Nothing touches the real SteelSeries install.
/// </summary>
public sealed class SonarRig : IAsyncDisposable
{
    public string Dir { get; }
    public string CoreProps { get; }
    public FakeGg Gg { get; }
    public FakeSonar Sonar { get; private set; }
    public ManualTimeProvider Time { get; } = new();
    public SonarClient Client { get; }
    public SonarEqBackend Backend { get; }
    public SonarMixer Mixer { get; }
    public EqService Service { get; }

    /// <summary>Set before the service first asks for "apo" to wire a fake APO install.</summary>
    public FakeApoEnvironment? ApoEnv { get; set; }

    /// <summary>The safe-mode gate shared by the client, the APO backend and the service (what the module builds).</summary>
    public EqWriteGate Writes { get; }

    private SonarRig(string dir, FakeGg gg, FakeSonar sonar, TimeSpan? timeout, bool safeMode)
    {
        Dir = dir;
        Gg = gg;
        Sonar = sonar;
        CoreProps = Path.Combine(dir, "GG", "coreProps.json");
        gg.SonarAddress = sonar.Address;
        WriteCoreProps(gg.Http.Authority);
        Writes = new EqWriteGate(safeMode, NullLog.Instance);
        Client = new SonarClient(new SonarDiscovery([CoreProps, Path.Combine(dir, "Engine3", "coreProps.json")], NullLog.Instance), NullLog.Instance, Time, timeout: timeout, writes: Writes);
        Backend = new SonarEqBackend(Client, NullLog.Instance, Time);
        Mixer = new SonarMixer(Client, NullLog.Instance, Time);
        Service = new EqService(id => id == EqService.Sonar ? Backend
                : ApoEnv is { } env ? new PrismControl.Eq.Apo.ApoEqBackend(env, env.DataDir, NullLog.Instance, Time, Writes) : throw new InvalidOperationException("APO is not wired in this rig"),
            NullLog.Instance, Time, EqService.Sonar, Mixer, writes: Writes);
    }

    /// <param name="timeout">The Sonar client's request timeout (real time; default 3 s). Short for timeout tests.</param>
    /// <param name="safeMode">Build everything in safe mode, as <c>EqModule</c> does when <c>IModuleContext.SafeMode</c> is on.</param>
    public static async Task<SonarRig> StartAsync(TimeSpan? timeout = null, bool safeMode = false)
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-eq-tests", Guid.NewGuid().ToString("N")[..10]);
        Directory.CreateDirectory(Path.Combine(dir, "GG"));
        var gg = new FakeGg();
        var sonar = new FakeSonar();
        await Task.Yield();
        return new SonarRig(dir, gg, sonar, timeout, safeMode);
    }

    public void WriteCoreProps(string ggAuthority) =>
        File.WriteAllText(CoreProps, new JsonObject { ["encryptedAddress"] = "127.0.0.1:1", ["ggEncryptedAddress"] = ggAuthority, ["address"] = "127.0.0.1:2" }.ToJsonString());

    /// <summary>Sonar "restarts" on a new random port with the same data; GG reports the new address.</summary>
    public async Task RestartSonarOnNewPortAsync()
    {
        var old = Sonar;
        var fresh = new FakeSonar();
        foreach (var (k, v) in old.Configs) fresh.Configs[k] = (JsonObject)v.DeepClone();
        foreach (var (k, v) in old.Selected) fresh.Selected[k] = v;
        await old.DisposeAsync();
        Sonar = fresh;
        Gg.SonarAddress = fresh.Address;
    }

    /// <summary>Advances the manual clock in small steps, letting HTTP round trips finish between steps.</summary>
    public async Task RunAsync(TimeSpan total, TimeSpan? step = null)
    {
        var s = step ?? TimeSpan.FromMilliseconds(10);
        for (var t = TimeSpan.Zero; t < total; t += s)
        {
            Time.Advance(s);
            await Task.Delay(1);
        }
    }

    /// <summary>Lets pending writes go out (advancing past the debounce) and waits for them.</summary>
    public async Task SettleWritesAsync()
    {
        for (var i = 0; i < 50; i++)
        {
            Time.Advance(TimeSpan.FromMilliseconds(300));
            var all = Task.WhenAll(Backend.WhenWritesIdleAsync(), Mixer.WhenWritesIdleAsync());
            if (await Task.WhenAny(all, Task.Delay(50)) == all) return;
        }
        throw new TimeoutException("writes did not settle");
    }

    public void AssertNoForbiddenCalls()
    {
        var bad = Sonar.Requests.Where(FakeSonar.IsForbidden).Select(r => r.ToString()).ToList();
        Assert.Empty(bad, "forbidden Sonar endpoints were called: " + string.Join(", ", bad));
    }

    public async ValueTask DisposeAsync()
    {
        await Service.DisposeAsync();
        Client.Dispose();
        await Sonar.DisposeAsync();
        await Gg.DisposeAsync();
        try { Directory.Delete(Dir, recursive: true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}
