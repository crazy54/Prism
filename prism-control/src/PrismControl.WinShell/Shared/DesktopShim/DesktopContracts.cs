#if !PRISM_DESKTOP
// TEMPORARY. A copy of the interfaces in aaa-prism-play/lead/CONTRACT-platform.md §1.1–§1.3, compiled only while the shared
// Desktop library is not referenced (PrismUseDesktop=false in PrismControl.WinShell.csproj). When Desktop is integrated
// this file and the Local* adapters next to it compile away and the real PrismControl.Desktop types take over unchanged.
// Module code may use ONLY the members named in the contract (plus VirtualKeys below, which casts raw VK codes).
namespace PrismControl.Desktop;

public interface IForegroundService
{
    /// <summary>Brings hwnd to the foreground from a background process (restoring it if minimized).</summary>
    Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default);
    /// <summary>Lets another process take the foreground itself (AllowSetForegroundWindow(pid)).</summary>
    Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default);
    nint GetForeground();
    /// <summary>The most recent foreground window not owned by the Stream Deck app or by us.</summary>
    nint LastExternalForeground { get; }
}

public enum ForegroundResult { Focused, AlreadyFocused, Restored, Refused, NoWindow, Elevated, SafeMode }

public interface IInputSender
{
    Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default);
    Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default);
    Task<bool> SendTextAsync(string text, CancellationToken ct = default);
    bool TargetIsElevated(nint hwnd);
}

/// <summary>Windows virtual-key codes (only the ones the shim needs are named; module code casts raw codes).</summary>
public enum VirtualKey : ushort
{
    Control = 0x11,
    Menu = 0x12,
    Left = 0x25,
    Right = 0x27,
    LeftWindows = 0x5B,
    F22 = 0x85,
}

public readonly record struct RectI(int Left, int Top, int Right, int Bottom)
{
    public int Width => Right - Left;
    public int Height => Bottom - Top;
}

public sealed record WindowInfo(nint Hwnd, int Pid, string ProcessName, string? ExePath, string Title, string? AppUserModelId,
    bool IsMinimized, bool IsMaximized, bool IsCloaked, bool IsElevated, nint Monitor, RectI Bounds);

public enum WindowEventKind { Created, Destroyed, TitleChanged, Minimized, Restored, Foreground, Cloaked, Uncloaked, Shown, Hidden }

public sealed record WindowEvent(WindowEventKind Kind, nint Hwnd);

public interface IWindowCatalog
{
    IReadOnlyList<WindowInfo> AltTabWindows();
    WindowInfo? Get(nint hwnd);
    event Action<WindowEvent>? Changed;
}

public interface IIconProvider
{
    Task<byte[]?> GetAppIconPngAsync(WindowInfo w, int sizePx, CancellationToken ct = default);
}
#endif
