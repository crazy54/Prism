using System.Diagnostics;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

/// <summary>Records every batch instead of calling SendInput. Never sends real input.</summary>
public sealed class RecordingSink : IInputSink
{
    private readonly object _gate = new();
    private readonly List<KeyInput[]> _batches = [];

    /// <summary>When set, Send blocks until it is set (to keep a lane busy).</summary>
    public ManualResetEventSlim? Gate { get; set; }
    /// <summary>Accept only this many events of the next batch (simulates a partial SendInput).</summary>
    public int? AcceptNext { get; set; }
    /// <summary>How many events each of the next batches accepts, in order (after <see cref="AcceptNext"/>).</summary>
    public Queue<int> AcceptPlan { get; } = new();
    /// <summary>The next Send throws this (a broken sink); nothing of that batch is recorded.</summary>
    public Exception? ThrowNext { get; set; }

    private int _entered;
    /// <summary>Send calls that started (including one blocked on <see cref="Gate"/>).</summary>
    public int Entered => Volatile.Read(ref _entered);

    public IReadOnlyList<KeyInput[]> Batches { get { lock (_gate) return [.. _batches]; } }
    public IReadOnlyList<KeyInput> All => Batches.SelectMany(b => b).ToList();
    public int Count { get { lock (_gate) return _batches.Count; } }

    public int Send(ReadOnlySpan<KeyInput> inputs)
    {
        var copy = inputs.ToArray();
        Interlocked.Increment(ref _entered);
        Gate?.Wait(TimeSpan.FromSeconds(10));
        lock (_gate)
        {
            if (ThrowNext is { } ex)
            {
                ThrowNext = null;
                throw ex;
            }
            var n = AcceptNext is { } a ? Math.Min(a, copy.Length) : AcceptPlan.Count > 0 ? Math.Min(AcceptPlan.Dequeue(), copy.Length) : copy.Length;
            AcceptNext = null;
            _batches.Add(copy[..n]);
            return n;
        }
    }
}

/// <summary>A scripted foreground window (fictional process names).</summary>
public sealed class FakeForeground : IForegroundInspector
{
    private readonly object _gate = new();
    private readonly Queue<ForegroundInfo> _next = new();
    private int _calls;

    public ForegroundInfo Current { get; set; } = ForegroundInfo.Allowed("ExampleEditor.exe", 1111);
    public int Calls => Volatile.Read(ref _calls);

    public static ForegroundInfo Elevated(string name = "ExampleAdminTool.exe") =>
        new(ForegroundVerdict.Blocked, 4242, name, 0x3000, true, 0x2000);

    public static readonly ForegroundInfo NoWindow = new(ForegroundVerdict.NoWindow, 0, null, -1, false, 0x2000);

    public void Then(params ForegroundInfo[] infos)
    {
        lock (_gate) foreach (var i in infos) _next.Enqueue(i);
    }

    public ForegroundInfo Inspect()
    {
        Interlocked.Increment(ref _calls);
        lock (_gate) return _next.Count > 0 ? _next.Dequeue() : Current;
    }
}

/// <summary>Records launches; never starts anything.</summary>
public sealed class FakeLauncher : IAppLauncher
{
    private readonly object _gate = new();
    public List<LaunchSpec> Launched { get; } = [];
    public List<Uri> Opened { get; } = [];
    public List<LaunchSpec> FocusAttempts { get; } = [];
    /// <summary>TryFocusRunning answers this.</summary>
    public bool Running { get; set; }
    public string? FailWith { get; set; }

    public void Launch(LaunchSpec spec)
    {
        if (FailWith is { } f) throw new MacroStepException(f);
        lock (_gate) Launched.Add(spec);
    }

    public void OpenUrl(Uri url)
    {
        lock (_gate) Opened.Add(url);
    }

    public bool TryFocusRunning(LaunchSpec spec)
    {
        lock (_gate) FocusAttempts.Add(spec);
        return Running;
    }
}

/// <summary>An engine wired to fakes.</summary>
public sealed class TestRig
{
    public RecordingSink Sink { get; } = new();
    public FakeForeground Foreground { get; } = new();
    public FakeLauncher Launcher { get; } = new();
    /// <summary>This "PC's" launch trust list (in memory).</summary>
    public LaunchTrustStore Trust { get; } = LaunchTrustStore.InMemory();
    public MacroEngine Engine { get; }

    public TestRig(MacroStepRegistry? registry = null, CancellationToken shutdown = default, ILog? log = null, bool dryRun = false) =>
        Engine = new MacroEngine(Sink, Foreground, Launcher, StandardScanCodes.Instance, log, registry: registry, shutdown: shutdown, trust: Trust, dryRun: dryRun);

    /// <summary>Trusts every launch step of <paramref name="script"/>, as if it had been authored in this PC's property inspector.</summary>
    public MacroScript Trusted(MacroScript script)
    {
        foreach (var c in Engine.CheckLaunches(script)) Trust.Trust(c.Spec);
        return script;
    }

    public static JsonObject Theme(string theme) => new() { ["core"] = new JsonObject { ["theme"] = theme } };

    public Task<ActionHarness<T>> AppearAsync<T>(DeviceInfo device, Coordinates at, object? settings, Controller controller = Controller.Keypad, string theme = "night", bool safeMode = false)
        where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(device, at, controller, settings, s => s.Add(Engine), Theme(theme), safeMode: safeMode);
}

/// <summary>A log that throws from Write for the first <c>throws</c> calls (a broken log sink), then records.</summary>
public sealed class ThrowingLog(int throws = int.MaxValue) : ILog
{
    private int _left = throws;
    private readonly List<string> _lines = [];
    public IReadOnlyList<string> Lines { get { lock (_lines) return [.. _lines]; } }

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        if (Interlocked.Decrement(ref _left) >= 0) throw new IOException("the log disk is full (test)");
        lock (_lines) _lines.Add($"{level}: {message}");
    }

    public ILog For(string category) => this;
    public bool IsEnabled(LogLevel level) => true;
}

/// <summary>Records every line (never throws). Used to prove what reaches the plugin log.</summary>
public sealed class RecordingLog : ILog
{
    private readonly List<string> _lines = [];
    public IReadOnlyList<string> Lines { get { lock (_lines) return [.. _lines]; } }
    public string Text => string.Join("\n", Lines);

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        lock (_lines) _lines.Add($"{level}: {message}{(exception is null ? "" : " | " + exception)}");
    }

    public ILog For(string category) => this;
    public bool IsEnabled(LogLevel level) => true;
}

/// <summary>Just enough of the host for MacrosModule.Initialize (it only uses the log, services, shutdown, data folder and safe mode).</summary>
public sealed class FakeModuleContext(string dataDirectory, bool safeMode) : IModuleContext
{
    public RecordingLog RecordingLog { get; } = new();
    public ILog Log => RecordingLog;
    public IDataRegistry Data => throw new NotSupportedException("the macros module publishes no data topics");
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings => throw new NotSupportedException();
    public IPluginEvents Events => throw new NotSupportedException();
    public IDeviceDirectory Devices => throw new NotSupportedException();
    public TimeProvider Time => TimeProvider.System;
    public CancellationToken ShutdownToken => CancellationToken.None;
    public string PluginDirectory => dataDirectory;
    public string DataDirectory => dataDirectory;
    public bool SafeMode => safeMode;
    public void OpenUrl(string url) { }
}

/// <summary>A step type whose Validate and Describe throw (a buggy future step type).</summary>
[MacroStep("test-throws", "Throws (test)", Order = 98)]
public sealed class ThrowingStep : MacroStep
{
    public override string Describe() => throw new InvalidOperationException("Describe blew up (test)");
    public override IEnumerable<string> Validate() => throw new InvalidOperationException("Validate blew up (test)");
    public override Task ExecuteAsync(MacroContext ctx) => Task.CompletedTask;
}

/// <summary>A temporary folder (a fake DataDirectory), deleted on dispose.</summary>
public sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "prismcontrol-macros-test-" + Guid.NewGuid().ToString("N")[..8]);
    public TempDir() => Directory.CreateDirectory(Path);
    public void Dispose()
    {
        try { Directory.Delete(Path, recursive: true); }
        catch (IOException) { }
    }
}

/// <summary>Sets an environment variable for the duration of a test and restores it.</summary>
public sealed class EnvScope : IDisposable
{
    private readonly string _name;
    private readonly string? _before;
    public EnvScope(string name, string? value)
    {
        _name = name;
        _before = Environment.GetEnvironmentVariable(name);
        Environment.SetEnvironmentVariable(name, value);
    }
    public void Dispose() => Environment.SetEnvironmentVariable(_name, _before);
}

public static class Drive
{
    /// <summary>
    /// Lets an action's background macro work finish: settles the mailbox, moves the manual clock to the next timer when the
    /// run waits on one (delays), and gives the thread pool a moment otherwise. Fails after 10 s of real time.
    /// </summary>
    public static async Task ToIdleAsync<T>(ActionHarness<T> h) where T : ActionBase, new()
    {
        var host = (IMacroRunHost)h.Action;
        var sw = Stopwatch.StartNew();
        while (true)
        {
            await h.SettleAsync();
            var idle = host.WhenIdleAsync();
            if (await Task.WhenAny(idle, Task.Delay(5)) == idle && !host.IsRunning) break;
            if (sw.Elapsed > TimeSpan.FromSeconds(10)) throw new AssertException("the macro did not finish within 10 s");
            if (h.Time.UntilNextTimer is { } next && next <= TimeSpan.FromSeconds(61)) await h.AdvanceAsync(next <= TimeSpan.Zero ? TimeSpan.FromMilliseconds(1) : next);
        }
        await h.SettleAsync();
    }

    /// <summary>
    /// Waits (in real time, without moving the manual clock) until the action's background run is over and its mailbox is
    /// settled. For runs that wait on no timer, when the test itself controls the clock (confirm windows).
    /// </summary>
    public static async Task RunsDoneAsync<T>(ActionHarness<T> h) where T : ActionBase, new()
    {
        var host = (IMacroRunHost)h.Action;
        await h.SettleAsync();
        await UntilAsync(() => !host.IsRunning, "the run to end");
        await host.WhenIdleAsync().WaitAsync(TimeSpan.FromSeconds(10));
        await h.SettleAsync();
    }

    /// <summary>Polls a condition in real time (background work on the thread pool).</summary>
    public static async Task UntilAsync(Func<bool> condition, string what, int timeoutMs = 5000)
    {
        var sw = Stopwatch.StartNew();
        while (!condition())
        {
            if (sw.ElapsedMilliseconds > timeoutMs) throw new AssertException("timed out waiting for " + what);
            await Task.Delay(2);
        }
    }

    /// <summary>Runs the engine on a manual clock, advancing it whenever the run waits on a timer.</summary>
    public static async Task<MacroRunResult> RunAsync(MacroEngine engine, MacroScript script, ManualTimeProvider? time = null, CancellationToken ct = default)
    {
        time ??= new ManualTimeProvider();
        var run = Task.Run(() => engine.RunAsync(script, new MacroRunOptions { Time = time, Source = "test" }, ct));
        var sw = Stopwatch.StartNew();
        while (!run.IsCompleted)
        {
            if (sw.Elapsed > TimeSpan.FromSeconds(10)) throw new AssertException("the engine did not finish within 10 s");
            if (time.UntilNextTimer is { } next) time.Advance(next);
            else await Task.WhenAny(run, Task.Delay(2));
        }
        return await run;
    }
}

/// <summary>Builders for expected INPUT sequences.</summary>
public static class K
{
    public static KeyInput Down(ushort vk, ushort scan, KeyFlags flags = KeyFlags.None) => new(vk, scan, flags);
    public static KeyInput Up(ushort vk, ushort scan, KeyFlags flags = KeyFlags.None) => new(vk, scan, flags | KeyFlags.KeyUp);

    public static void SequenceEqual(IReadOnlyList<KeyInput> expected, IReadOnlyList<KeyInput> actual, string? what = null)
    {
        if (expected.SequenceEqual(actual)) return;
        throw new AssertException($"{(what is null ? "" : what + ": ")}INPUT sequence differs\n  expected: {string.Join(" | ", expected)}\n  actual:   {string.Join(" | ", actual)}");
    }
}
