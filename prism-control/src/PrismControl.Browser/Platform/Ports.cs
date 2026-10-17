using System.Text.Json.Nodes;

namespace PrismControl.Browser.Platform;

// The module talks to the PC only through these narrow ports. Production adapters wrap PrismControl.Desktop
// (IForegroundService, IInputSender, IWindowCatalog, IPipeEndpoint, ArtScaler, RelayInstaller); safe mode swaps in
// the logging fakes below; tests use recording fakes. Nothing here touches the OS by itself.

/// <summary>What a raise attempt did (mirrors Desktop's ForegroundResult, plus Unavailable when no platform is wired).</summary>
public enum RaiseResult { Focused, AlreadyFocused, Restored, Refused, NoWindow, Elevated, SafeMode, Unavailable }

public interface IForegroundPort
{
    /// <summary>Gains foreground rights (F22 trick) and lets <paramref name="pid"/> take the foreground itself (AllowSetForegroundWindow).</summary>
    Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default);
    /// <summary>Raises a window ourselves (the fallback when the browser's own focus did not stick).</summary>
    Task<RaiseResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default);
    nint GetForeground();
    /// <summary>The most recent foreground window that is not the Stream Deck app or us.</summary>
    nint LastExternalForeground { get; }
}

public interface IInputPort
{
    /// <summary>One key down + up (always released).</summary>
    Task<bool> SendKeyAsync(ushort virtualKey, CancellationToken ct = default);
    /// <summary>UIPI: SendInput cannot reach an elevated foreground window.</summary>
    bool TargetIsElevated(nint hwnd);

    /// <summary>
    /// Whether no other app holds <paramref name="virtualKey"/> (no modifiers) as a global hotkey: RegisterHotKey succeeds,
    /// then is undone at once. True = free (hotkeys done with keyboard hooks can't be detected); false = taken; null =
    /// unknown. The PiP key is a real global keystroke, so it is checked before every press (MED 6).
    /// </summary>
    Task<bool?> IsGlobalKeyFreeAsync(ushort virtualKey, CancellationToken ct = default) => Task.FromResult<bool?>(null);
}

/// <param name="Title">The frame's title (Chrome: "&lt;active tab title&gt; - Google Chrome"), only used in memory to tell
/// tied frames apart; never logged.</param>
public sealed record TopWindow(nint Hwnd, int Pid, int Left, int Top, int Width, int Height, bool Minimized, bool Elevated, string? Title = null);

public interface IWindowPort
{
    /// <summary>Visible top-level windows of a process (browser frames: Chrome_WidgetWin_1), with DWM bounds.</summary>
    IReadOnlyList<TopWindow> WindowsOf(int pid);
    int? ProcessIdOf(nint hwnd);
}

/// <summary>Copies prism-relay.exe to its per-user versioned folder (Desktop RelayInstaller).</summary>
public interface IRelayPort
{
    /// <summary>Where the relay will live, without writing anything (shown in the consent step).</summary>
    string ExpectedPath { get; }
    /// <summary>Copies (atomic, SHA-256 verified) and returns the path. Only ever called after the user consented.</summary>
    Task<string> EnsureAsync(CancellationToken ct = default);
}

/// <summary>Downscales fetched artwork before it is embedded in frames (Desktop ArtScaler).</summary>
public interface IImageScaler
{
    /// <summary>PNG/JPEG/WebP in, JPEG (or PNG) out with the longest side ≤ <paramref name="maxPx"/>; null if it cannot decode.</summary>
    Task<byte[]?> ScaleAsync(byte[] bytes, int maxPx, CancellationToken ct = default);
}

/// <summary>One relay connection on the pipe: u32 LE length + UTF-8 JSON frames (the native-messaging framing).</summary>
public interface IFrameConnection : IAsyncDisposable
{
    /// <summary>
    /// The relay preamble when the endpoint already authenticated it (Desktop's PipeEndpoint checks and strips the
    /// token from the first frame); null when the session must read and check the first frame itself.
    /// </summary>
    JsonObject? Preamble { get; }
    /// <summary>The next frame; null on EOF. Throws on an oversize frame or bad JSON (the connection is then closed).</summary>
    Task<JsonNode?> ReadAsync(CancellationToken ct);
    Task WriteAsync(JsonNode frame, CancellationToken ct);
    /// <summary>GetNamedPipeClientProcessId (the relay's pid).</summary>
    int? ClientPid { get; }
    /// <summary>The client process's image path, when the endpoint could read it.</summary>
    string? ClientImagePath { get; }
}

/// <summary>The per-user pipe server ("browser") with its discovery file.</summary>
public interface IFrameEndpoint : IAsyncDisposable
{
    string PipeName { get; }
    /// <summary>The token sessions must check themselves; null when the endpoint authenticates clients (Desktop).</summary>
    string? Token { get; }
    event Func<IFrameConnection, Task>? ConnectionOpened;
}

/// <summary>Reads a process's image path (relay identity check). Read-only.</summary>
public interface IProcessInfo
{
    string? ImagePathOf(int pid);
}

/// <summary>Opens a downloaded file or shows it in Explorer (ShellExecute, so Mark-of-the-Web and SmartScreen apply).</summary>
public interface IShellPort
{
    bool Open(string path);
    bool ShowInFolder(string path);
    bool OpenFolder(string path);
}

// ---------------------------------------------------------------------- safe mode + unavailable fallbacks

/// <summary>Safe mode: never grants or raises; reports <see cref="RaiseResult.SafeMode"/>.</summary>
public sealed class SafeModeForeground : IForegroundPort
{
    private int _grants, _raises;
    public int Grants => _grants;
    public int Raises => _raises;
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) { Interlocked.Increment(ref _grants); return Task.FromResult(false); }
    public Task<RaiseResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) { Interlocked.Increment(ref _raises); return Task.FromResult(RaiseResult.SafeMode); }
    public nint GetForeground() => 0;
    public nint LastExternalForeground => 0;
}

/// <summary>Safe mode: records keys instead of sending them.</summary>
public sealed class SafeModeInput : IInputPort
{
    private readonly List<ushort> _keys = [];
    public IReadOnlyList<ushort> Keys { get { lock (_keys) return [.. _keys]; } }
    public Task<bool> SendKeyAsync(ushort virtualKey, CancellationToken ct = default) { lock (_keys) _keys.Add(virtualKey); return Task.FromResult(false); }
    public bool TargetIsElevated(nint hwnd) => false;
}

/// <summary>Safe mode: never copies the relay.</summary>
public sealed class SafeModeRelay(string expectedPath) : IRelayPort
{
    public string ExpectedPath { get; } = expectedPath;
    public Task<string> EnsureAsync(CancellationToken ct = default) => Task.FromResult(ExpectedPath);
}

/// <summary>Safe mode: opens nothing.</summary>
public sealed class SafeModeShell : IShellPort
{
    private int _calls;
    public int Calls => _calls;
    public bool Open(string path) { Interlocked.Increment(ref _calls); return false; }
    public bool ShowInFolder(string path) { Interlocked.Increment(ref _calls); return false; }
    public bool OpenFolder(string path) { Interlocked.Increment(ref _calls); return false; }
}

/// <summary>No platform wired (Desktop missing): every write says Unavailable.</summary>
public sealed class UnavailableForeground : IForegroundPort
{
    public static readonly UnavailableForeground Instance = new();
    public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) => Task.FromResult(false);
    public Task<RaiseResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) => Task.FromResult(RaiseResult.Unavailable);
    public nint GetForeground() => 0;
    public nint LastExternalForeground => 0;
}

public sealed class UnavailableInput : IInputPort
{
    public static readonly UnavailableInput Instance = new();
    public Task<bool> SendKeyAsync(ushort virtualKey, CancellationToken ct = default) => Task.FromResult(false);
    public bool TargetIsElevated(nint hwnd) => false;
}

public sealed class NoWindows : IWindowPort
{
    public static readonly NoWindows Instance = new();
    public IReadOnlyList<TopWindow> WindowsOf(int pid) => [];
    public int? ProcessIdOf(nint hwnd) => null;
}

/// <summary>Keeps images as they are (artwork larger than the cap is then skipped).</summary>
public sealed class PassThroughScaler : IImageScaler
{
    public static readonly PassThroughScaler Instance = new();
    public Task<byte[]?> ScaleAsync(byte[] bytes, int maxPx, CancellationToken ct = default) =>
        Task.FromResult<byte[]?>(bytes.Length <= Protocol.Wire.Limits.ArtMaxBytes * 2 ? bytes : null);
}

public static class VirtualKeys
{
    /// <summary>F24 (0x87): a non-modifier key no browser binds; its keydown grants user activation for PiP (research §3.6).</summary>
    public const ushort F24 = 0x87;
}
