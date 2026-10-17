using System.Text.Json.Nodes;
using System.Threading.Channels;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Install;
using PrismControl.Browser.Platform;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.Smtc;
using PrismControl.Browser.State;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

/// <summary>Captures every log line (to prove titles and URLs are never logged).</summary>
public sealed class RecordingLog : ILog
{
    private readonly List<string> _lines = [];
    private readonly string _prefix;
    private readonly RecordingLog? _root;

    public RecordingLog() : this("", null) { }
    private RecordingLog(string prefix, RecordingLog? root) { _prefix = prefix; _root = root; }

    public IReadOnlyList<string> Lines { get { var r = _root ?? this; lock (r._lines) return [.. r._lines]; } }
    public string All => string.Join("\n", Lines);

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
        var r = _root ?? this;
        lock (r._lines) r._lines.Add($"{level}: {_prefix}{message}{(exception is null ? "" : " | " + exception.GetType().Name + ": " + exception.Message)}");
    }

    public ILog For(string category) => new RecordingLog(_prefix + category + ": ", _root ?? this);
    public bool IsEnabled(LogLevel level) => true;
}

/// <summary>A command sink that records every command and answers from a script (ok by default).</summary>
public sealed class RecordingSink : IBrowserCommandSink
{
    private readonly List<(string Browser, string Op, JsonObject Args)> _sent = [];
    public Func<string, JsonObject, CommandResult>? Respond { get; set; }
    public bool IsSafeMode => false;

    public IReadOnlyList<(string Browser, string Op, JsonObject Args)> Sent { get { lock (_sent) return [.. _sent]; } }
    public IReadOnlyList<(string Browser, string Op, JsonObject Args)> Of(string op) => Sent.Where(s => s.Op == op).ToList();
    public void Clear() { lock (_sent) _sent.Clear(); }

    public Task<CommandResult> SendAsync(string browserKey, string op, JsonObject args, CancellationToken ct = default)
    {
        lock (_sent) _sent.Add((browserKey, op, (JsonObject)args.DeepClone()));
        return Task.FromResult(Respond?.Invoke(op, args) ?? new CommandResult(true, op == Wire.Op.TabFocus ? new JsonObject { ["focused"] = true } : new JsonObject()));
    }
}

public sealed class FakeForeground : IForegroundPort
{
    public List<int> Grants { get; } = [];
    public List<nint> Raises { get; } = [];
    public RaiseResult RaiseResult { get; set; } = RaiseResult.Focused;
    public nint Foreground { get; set; } = 0x1000;
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) { lock (Grants) Grants.Add(pid); return Task.FromResult(true); }
    public Task<RaiseResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) { lock (Raises) Raises.Add(hwnd); return Task.FromResult(RaiseResult); }
    public nint GetForeground() => Foreground;
    public nint LastExternalForeground => Foreground;
}

public sealed class FakeInput : IInputPort
{
    public List<ushort> Keys { get; } = [];
    public bool Elevated { get; set; }
    public Action<ushort>? OnKey { get; set; }
    public Task<bool> SendKeyAsync(ushort virtualKey, CancellationToken ct = default)
    {
        lock (Keys) Keys.Add(virtualKey);
        OnKey?.Invoke(virtualKey);
        return Task.FromResult(true);
    }
    public bool TargetIsElevated(nint hwnd) => Elevated;
    /// <summary>Which keys no other app holds as a global hotkey (null = unknown, the default).</summary>
    public Func<ushort, bool>? FreeKeys { get; set; }
    public Task<bool?> IsGlobalKeyFreeAsync(ushort virtualKey, CancellationToken ct = default) => Task.FromResult(FreeKeys is null ? null : (bool?)FreeKeys(virtualKey));
}

public sealed class FakeWindows : IWindowPort
{
    public List<TopWindow> Windows { get; } = [];
    public IReadOnlyList<TopWindow> WindowsOf(int pid) => Windows.Where(w => w.Pid == pid).ToList();
    public int? ProcessIdOf(nint hwnd) => Windows.FirstOrDefault(w => w.Hwnd == hwnd)?.Pid ?? 999;
}

public sealed class FakeShell : IShellPort
{
    public List<string> Opened { get; } = [];
    public bool Open(string path) { Opened.Add("open " + path); return true; }
    public bool ShowInFolder(string path) { Opened.Add("show " + path); return true; }
    public bool OpenFolder(string path) { Opened.Add("folder " + path); return true; }
}

/// <summary>A relay installer that "copies" into a temp folder (never the real AppData).</summary>
public sealed class FakeRelay(string path) : IRelayPort
{
    public int Ensures { get; private set; }
    public bool Fail { get; set; }
    public string ExpectedPath { get; } = path;
    public Task<string> EnsureAsync(CancellationToken ct = default)
    {
        Ensures++;
        if (Fail) throw new IOException("prism-relay.exe is missing from the plugin's bin folder.");
        Directory.CreateDirectory(Path.GetDirectoryName(ExpectedPath)!);
        File.WriteAllText(ExpectedPath, "fake relay");
        return Task.FromResult(ExpectedPath);
    }
}

public sealed class FakeSmtc : ISmtcReader
{
    private SmtcBrowserSession? _current;
    public SmtcBrowserSession? Current => _current;
    public event EventHandler? Changed;
    public Task StartAsync(CancellationToken ct) => Task.CompletedTask;
    public void Set(SmtcBrowserSession? s) { _current = s; Changed?.Invoke(this, EventArgs.Empty); }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

/// <summary>An in-memory relay connection: the plugin side is an <see cref="IFrameConnection"/>; tests drive the browser side.</summary>
public sealed class MemoryConnection : IFrameConnection
{
    private readonly Channel<JsonNode?> _in = Channel.CreateUnbounded<JsonNode?>();
    private readonly Channel<JsonNode> _out = Channel.CreateUnbounded<JsonNode>();
    public MemoryConnection(JsonObject? preamble = null, int? pid = 777, string? image = @"C:\Users\Example\AppData\Roaming\Prism\control\relay\prism-relay.exe")
    {
        Preamble = preamble;
        ClientPid = pid;
        ClientImagePath = image;
    }

    public JsonObject? Preamble { get; }
    public int? ClientPid { get; }
    public string? ClientImagePath { get; }
    public bool Disposed { get; private set; }

    public Task<JsonNode?> ReadAsync(CancellationToken ct) => _in.Reader.ReadAsync(ct).AsTask().ContinueWith(t => t.IsCompletedSuccessfully ? t.Result : t.IsCanceled ? throw new OperationCanceledException() : (JsonNode?)null, TaskScheduler.Default);
    public Task WriteAsync(JsonNode frame, CancellationToken ct)
    {
        if (Disposed) throw new IOException("closed");
        _out.Writer.TryWrite(frame.DeepClone());
        return Task.CompletedTask;
    }
    public ValueTask DisposeAsync() { Disposed = true; _out.Writer.TryComplete(); return ValueTask.CompletedTask; }

    // browser side
    public void Send(JsonNode frame) => _in.Writer.TryWrite(frame);
    public void Eof() => _in.Writer.TryWrite(null);
    public async Task<JsonObject> NextAsync(TimeSpan? timeout = null)
    {
        using var cts = new CancellationTokenSource(timeout ?? TimeSpan.FromSeconds(5));
        var f = await _out.Reader.ReadAsync(cts.Token);
        return (JsonObject)f;
    }
    public bool TryNext(out JsonObject? frame)
    {
        if (_out.Reader.TryRead(out var f)) { frame = (JsonObject)f; return true; }
        frame = null;
        return false;
    }
    public List<JsonObject> Drain() { var list = new List<JsonObject>(); while (TryNext(out var f)) list.Add(f!); return list; }
}

/// <summary>A hub wired to fakes, plus helpers to seed browsers. Disposes the hub.</summary>
public sealed class Rig : IAsyncDisposable
{
    public required BrowserHub Hub { get; init; }
    public required RecordingLog Log { get; init; }
    public required ManualTimeProvider Time { get; init; }
    public RecordingSink? Sink { get; init; }
    public required FakeForeground Foreground { get; init; }
    public required FakeInput Input { get; init; }
    public required FakeWindows Windows { get; init; }
    public required FakeShell Shell { get; init; }
    public required FakeSmtc Smtc { get; init; }
    public HostInstaller? Installer { get; init; }
    public string? TempDir { get; init; }

    public BrowserStore Store => Hub.Store;
    public SafeModeCommandSink? SafeSink => Hub.Commands as SafeModeCommandSink;

    public static Rig Create(bool safeMode = false, ManualTimeProvider? time = null, bool seedChrome = true, string privacy = "full", bool withInstaller = false, BrowserCaps? caps = null)
    {
        time ??= new ManualTimeProvider();
        var log = new RecordingLog();
        var sink = safeMode ? null : new RecordingSink();
        var smtc = new FakeSmtc();
        var fg = new FakeForeground();
        var input = new FakeInput();
        var windows = new FakeWindows();
        windows.Windows.Add(new TopWindow(0x2001, 4242, 0, 0, 1280, 800, false, false));
        windows.Windows.Add(new TopWindow(0x2002, 4242, 100, 100, 1280, 800, false, false));
        var shell = new FakeShell();
        var hub = new BrowserHub(new BrowserHubOptions
        {
            Log = log,
            Time = time,
            SafeMode = safeMode,
            Foreground = fg,
            Input = input,
            Windows = windows,
            Shell = shell,
            Smtc = smtc,
            CommandSinkOverride = sink,
        });
        hub.Start(new NullEndpoint());
        string? temp = null;
        HostInstaller? installer = null;
        if (withInstaller)
        {
            temp = Path.Combine(Path.GetTempPath(), "prism-browser-tests", Guid.NewGuid().ToString("n"));
            installer = new HostInstaller(new HostInstallerOptions
            {
                Registry = new MemoryRegistry(),
                Relay = new FakeRelay(Path.Combine(temp, "relay", "prism-relay.exe")),
                DataDirectory = Path.Combine(temp, "modules", "browser"),
                SafeMode = safeMode,
                Log = log,
                Time = time,
            });
        }
        var rig = new Rig { Hub = hub, Log = log, Time = time, Sink = sink, Foreground = fg, Input = input, Windows = windows, Shell = shell, Smtc = smtc, Installer = installer, TempDir = temp };
        if (seedChrome)
        {
            rig.Store.Upsert(Fx.Instance(privacy: privacy, caps: caps));
            Fx.PutStandardImages(hub.Images);
        }
        return rig;
    }

    /// <summary>Registers the hub (and installer) for an ActionHarness.</summary>
    public void Services(ServiceRegistry s)
    {
        s.Add(Hub);
        if (Installer is not null) s.Add(Installer);
    }

    public void Update(Func<BrowserInstance, BrowserInstance> f, string key = Fx.ChromeKey) => Store.UpdateBrowser(key, f, BrowserChange.All);

    public async ValueTask DisposeAsync()
    {
        await Hub.DisposeAsync();
        if (TempDir is not null) { try { Directory.Delete(TempDir, recursive: true); } catch (Exception) { } }
    }
}

/// <summary>An endpoint that never connects (the hub then reports the platform as available).</summary>
public sealed class NullEndpoint : IFrameEndpoint
{
    public string PipeName => "prism-control-browser-test";
    public string? Token => "test-token";
    public event Func<IFrameConnection, Task>? ConnectionOpened { add { } remove { } }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
