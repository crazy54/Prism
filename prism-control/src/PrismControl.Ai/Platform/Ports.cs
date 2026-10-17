using PrismControl.Ai.Sessions;

namespace PrismControl.Ai.Platform;

// The module talks to the PC only through these narrow ports. Production adapters live next to this file
// (Win32*.cs today; PrismControl.Desktop's IForegroundService / PipeEndpoint / RelayInstaller at integration).
// Tests use fakes. Safe mode swaps every port that writes for a logging fake (AiModule.Initialize).

/// <summary>Exit notifications with a pid-reuse guard (pid + creation time). Reads only.</summary>
public interface IProcessWatcher : IDisposable
{
    /// <summary>
    /// Starts watching <paramref name="pid"/> and returns its identity (with the real creation time), or null if it is not
    /// running or its creation time differs from <paramref name="expectedStartMs"/> (a reused pid). 0 = no expectation.
    /// </summary>
    ProcessIdentity? Watch(int pid, long expectedStartMs, string image);
    /// <summary>Raised once per watched identity, on a thread-pool thread.</summary>
    event Action<ProcessIdentity, DateTimeOffset>? Exited;
}

/// <summary>Read-only process tree facts.</summary>
public interface IProcessTree
{
    /// <summary>The identity of a running pid (null if not running or unreadable).</summary>
    ProcessIdentity? Identity(int pid);
    /// <summary>
    /// The parent chain of <paramref name="pid"/>, parent first, up to <paramref name="max"/>. A parent created after its child
    /// is not followed (pid reuse).
    /// </summary>
    IReadOnlyList<ProcessIdentity> Ancestors(int pid, int max = 16);
    /// <summary>True if any process with this image name (e.g. "codex.exe") runs.</summary>
    bool AnyRunning(string imageName);
}

/// <summary>Runs a read-only CLI (claude agents --json, orca … --json) off the mailbox with a hard timeout.</summary>
public interface ICommandRunner
{
    Task<CommandResult> RunAsync(CommandSpec spec, CancellationToken ct);
    /// <summary>Resolves an executable on PATH (or known locations); null when absent.</summary>
    string? Find(string exeName);
}

public sealed record CommandSpec(string File, IReadOnlyList<string> Args, TimeSpan Timeout, int MaxOutputBytes = 1 << 20,
    IReadOnlyDictionary<string, string?>? Environment = null);

public sealed record CommandResult(bool Started, int? ExitCode, string StdOut, bool TimedOut)
{
    public bool Ok => Started && !TimedOut && ExitCode == 0;
    public static readonly CommandResult NotStarted = new(false, null, "", false);
}

/// <summary>What a focus attempt did (mirrors PrismControl.Desktop.ForegroundResult).</summary>
public enum FocusResult { Focused, AlreadyFocused, Restored, Refused, NoWindow, Elevated, SafeMode }

/// <summary>Window lookup and focus. The only writer is <see cref="FocusAsync"/> (a logging fake in safe mode).</summary>
public interface IWindowHost
{
    Task<FocusResult> FocusAsync(nint hwnd, CancellationToken ct);
    /// <summary>The visible top-level windows of a process (owner-less, not cloaked), in z-order.</summary>
    IReadOnlyList<nint> TopLevelWindows(int pid);
    /// <summary>The root owner of a window (a ConPTY pseudo console window → the terminal window).</summary>
    nint RootOwner(nint hwnd);
    bool IsWindow(nint hwnd);
    int ProcessOf(nint hwnd);
    string ClassName(nint hwnd);
}

public enum TabSelectResult { Selected, AlreadySelected, NoMatch, Ambiguous, Unsupported, Failed, SafeMode }

/// <summary>Best effort: select a Windows Terminal tab whose title matches (UI Automation). Never in safe mode.</summary>
public interface ITerminalTabSelector
{
    Task<TabSelectResult> TrySelectAsync(nint terminalWindow, string title, CancellationToken ct);
}

/// <summary>Opens a URI (vscode://, codex://) through the Stream Deck app's openUrl. A logging fake in safe mode.</summary>
public interface IUriOpener
{
    void Open(string uri);
}

/// <summary>The hook relay binary: where it lives (a stable path) and its SHA-256. Desktop's RelayInstaller at integration.</summary>
public interface IRelayProvider
{
    /// <summary>The stable path hook entries point at, e.g. %APPDATA%\Prism\control\relay\prism-relay.exe.</summary>
    string RelayPath { get; }
    /// <summary>The SHA-256 of the relay that would be installed (null when the plugin ships no relay).</summary>
    string? RelaySha256();
    /// <summary>Copies/refreshes the relay at <see cref="RelayPath"/>. Never called in safe mode.</summary>
    Task<bool> EnsureAsync(CancellationToken ct);
}
