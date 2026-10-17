using System.Runtime.InteropServices;
using System.Security.Cryptography;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Ai.Platform;

/// <summary>
/// Window lookup on Desktop's <see cref="IWindowCatalog"/> and focus through Desktop's <see cref="IForegroundService"/>
/// (the F22 trick, then SetForegroundWindow, then SwitchToThisWindow). In safe mode Desktop already hands out its
/// logging fake; this adapter adds its own guard so a safe-mode run can never focus anything.
/// </summary>
public sealed partial class DesktopWindowHost(IForegroundService foreground, IWindowCatalog catalog, bool safeMode, ILog log) : IWindowHost
{
    public async Task<FocusResult> FocusAsync(nint hwnd, CancellationToken ct)
    {
        if (safeMode)
        {
            log.Info("[safe mode] would focus a session window");
            return FocusResult.SafeMode;
        }
        var r = await foreground.BringToFrontAsync(hwnd, ct).ConfigureAwait(false);
        return r switch
        {
            ForegroundResult.Focused => FocusResult.Focused,
            ForegroundResult.AlreadyFocused => FocusResult.AlreadyFocused,
            ForegroundResult.Restored => FocusResult.Restored,
            ForegroundResult.NoWindow => FocusResult.NoWindow,
            ForegroundResult.Elevated => FocusResult.Elevated,
            ForegroundResult.SafeMode => FocusResult.SafeMode,
            _ => FocusResult.Refused,
        };
    }

    public IReadOnlyList<nint> TopLevelWindows(int pid) =>
        catalog.AltTabWindows().Where(w => w.Pid == pid && !w.IsCloaked).Select(w => w.Hwnd).ToList();

    public nint RootOwner(nint hwnd) => hwnd == 0 ? 0 : GetAncestor(hwnd, 3 /* GA_ROOTOWNER */);

    public bool IsWindow(nint hwnd) => hwnd != 0 && IsWindowNative(hwnd);

    public int ProcessOf(nint hwnd)
    {
        if (hwnd == 0) return 0;
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        return (int)pid;
    }

    public unsafe string ClassName(nint hwnd)
    {
        if (hwnd == 0) return "";
        var buf = stackalloc char[256];
        var n = GetClassNameW(hwnd, buf, 256);
        return n > 0 ? new string(buf, 0, n) : "";
    }

    [LibraryImport("user32.dll")]
    private static partial nint GetAncestor(nint hwnd, uint flags);

    [LibraryImport("user32.dll", EntryPoint = "IsWindow")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool IsWindowNative(nint hwnd);

    [LibraryImport("user32.dll")]
    private static partial uint GetWindowThreadProcessId(nint hwnd, out uint pid);

    [LibraryImport("user32.dll")]
    private static unsafe partial int GetClassNameW(nint hwnd, char* name, int max);
}

/// <summary>The hook relay through Desktop's <see cref="RelayInstaller"/>: one stable path every hook entry uses.</summary>
public sealed class DesktopRelayProvider(RelayInstaller installer) : IRelayProvider
{
    public string RelayPath => installer.StablePath;

    public string? RelaySha256()
    {
        var source = File.Exists(installer.SourcePath) ? installer.SourcePath : File.Exists(installer.StablePath) ? installer.StablePath : null;
        if (source is null) return null;
        try
        {
            using var fs = File.OpenRead(source);
            return Convert.ToHexStringLower(SHA256.HashData(fs));
        }
        catch (IOException) { return null; }
    }

    public async Task<bool> EnsureAsync(CancellationToken ct)
    {
        try
        {
            await installer.EnsureAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (RelayInstallException) { return false; }
    }

    /// <summary>Our hook entries: any command under the Prism user folder ending in prism-relay.exe (lead decision).</summary>
    public bool IsOurCommand(string? command) => installer.IsOurCommand(command);
}

/// <summary>Opens vscode:// and codex:// URIs through the Stream Deck app (openUrl). Safe mode logs instead.</summary>
public sealed class AppUriOpener(Action<string> openUrl, bool safeMode, ILog log) : IUriOpener
{
    public void Open(string uri)
    {
        var scheme = uri.Split(':', 2)[0];
        if (safeMode)
        {
            log.Info($"[safe mode] would open a {scheme}: link");
            return;
        }
        openUrl(uri);
    }
}
