using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Apps;

/// <summary>What kind of window Ask AI is about to press Ctrl+C in.</summary>
public enum WindowHost
{
    /// <summary>An ordinary app: Ctrl+C copies.</summary>
    App,
    /// <summary>A terminal (Windows Terminal, the classic console, mintty, …): Ctrl+C is SIGINT there, so Ask AI refuses.</summary>
    Terminal,
    /// <summary>An editor that embeds terminals (VS Code, Cursor, …): refused only while keyboard focus is in its terminal.</summary>
    EditorWithTerminal,
}

/// <summary>
/// The pure rules (tested): which exes and window classes are terminals. In a terminal, Ctrl+C interrupts the running program
/// (an AI agent included) instead of copying, so Ask AI never sends it there (review A3). Lists are lower-case.
/// </summary>
public static class TerminalRules
{
    /// <summary>Terminal hosts and console programs (a classic console window reports its client's pid, e.g. cmd.exe).</summary>
    public static readonly IReadOnlySet<string> TerminalExes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "WindowsTerminal.exe", "wt.exe", "OpenConsole.exe", "conhost.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "bash.exe", "wsl.exe",
        "wslhost.exe", "mintty.exe", "alacritty.exe", "wezterm-gui.exe", "wezterm.exe", "kitty.exe", "Hyper.exe", "Tabby.exe",
        "ConEmu.exe", "ConEmu64.exe", "ConEmuC.exe", "ConEmuC64.exe", "Cmder.exe", "putty.exe", "kitty_portable.exe", "MobaXterm.exe",
        "Warp.exe", "FluentTerminal.App.exe", "Terminus.exe", "rio.exe", "ghostty.exe",
    };

    /// <summary>Top-level window classes of terminals (whatever the exe is called).</summary>
    public static readonly IReadOnlySet<string> TerminalClasses = new HashSet<string>(StringComparer.Ordinal)
    {
        "ConsoleWindowClass", "CASCADIA_HOSTING_WINDOW_CLASS", "PseudoConsoleWindow", "mintty", "VirtualConsoleClass", "PuTTY", "KiTTY",
        "org.wezfurlong.wezterm",
    };

    /// <summary>Editors with integrated terminals (Electron): keyboard focus decides.</summary>
    public static readonly IReadOnlySet<string> EditorExes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "Code.exe", "Code - Insiders.exe", "VSCodium.exe", "Cursor.exe", "Windsurf.exe", "Positron.exe", "Trae.exe", "Orca.exe",
    };

    public static WindowHost Classify(string? exe, string? windowClass)
    {
        var e = Path.GetFileName(exe ?? "");
        if (TerminalExes.Contains(e)) return WindowHost.Terminal;
        if (windowClass is { Length: > 0 } c && TerminalClasses.Contains(c)) return WindowHost.Terminal;
        if (EditorExes.Contains(e)) return WindowHost.EditorWithTerminal;
        return WindowHost.App;
    }

    /// <summary>
    /// The focused UI Automation element of an Electron editor is its integrated terminal: xterm.js's input is a textarea with
    /// the class <c>xterm-helper-textarea</c> (Chromium exposes HTML classes as the UIA ClassName), named "Terminal n, …".
    /// </summary>
    public static bool IsTerminalFocus(string? className, string? name) =>
        (className?.Contains("xterm", StringComparison.OrdinalIgnoreCase) ?? false)
        || (name is { } n && n.StartsWith("Terminal", StringComparison.OrdinalIgnoreCase) && n.Length < 200 && (n.Length == 8 || n[8] is ' ' or ','));
}

/// <summary>Read-only facts about a window, for <see cref="TerminalRules"/>.</summary>
public interface ITerminalProbe
{
    /// <summary>The exe file name and the class of a top-level window ("" when unreadable).</summary>
    (string Exe, string Class) Describe(nint hwnd);
    /// <summary>Is keyboard focus in an integrated terminal right now? Null when it can't be told (UIA unavailable or slow).</summary>
    Task<bool?> FocusInTerminalAsync(CancellationToken ct);
}

/// <summary>
/// Production probe: GetWindowThreadProcessId + QueryFullProcessImageName + GetClassName (reads only), and a UI Automation read of
/// the focused element's ClassName/Name on its own MTA thread with a 600 ms cap. Never sends input, never changes focus.
/// </summary>
public sealed partial class Win32TerminalProbe(ILog log) : ITerminalProbe
{
    public (string Exe, string Class) Describe(nint hwnd)
    {
        if (hwnd == 0) return ("", "");
        try
        {
            var cls = ClassOf(hwnd);
            _ = GetWindowThreadProcessId(hwnd, out var pid);
            return (pid == 0 ? "" : ExeOf(pid), cls);
        }
        catch (Exception ex)
        {
            log.Debug($"terminal probe failed: {ex.GetType().Name}");
            return ("", "");
        }
    }

    public Task<bool?> FocusInTerminalAsync(CancellationToken ct)
    {
        var tcs = new TaskCompletionSource<bool?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try { tcs.TrySetResult(FocusedIsTerminal()); }
            catch (Exception ex)
            {
                log.Debug($"terminal focus probe failed: {ex.GetType().Name}");
                tcs.TrySetResult(null);
            }
        }) { IsBackground = true, Name = "ai-uia-focus" };
        thread.SetApartmentState(ApartmentState.MTA);
        thread.Start();
        return WithTimeout(tcs.Task, TimeSpan.FromMilliseconds(600), ct);
    }

    private static async Task<bool?> WithTimeout(Task<bool?> t, TimeSpan timeout, CancellationToken ct)
    {
        var done = await Task.WhenAny(t, Task.Delay(timeout, ct)).ConfigureAwait(false);
        return done == t ? await t.ConfigureAwait(false) : null;
    }

    private static bool? FocusedIsTerminal()
    {
        var uia = (IUIAutomation)new CUIAutomation();
        IUIAutomationElement? el = null;
        try
        {
            if (uia.GetFocusedElement(out el) != 0 || el is null) return null;
            el.get_CurrentClassName(out var cls);
            el.get_CurrentName(out var name);
            return TerminalRules.IsTerminalFocus(cls, name);
        }
        finally
        {
            if (el is not null) Marshal.ReleaseComObject(el);
            Marshal.ReleaseComObject(uia);
        }
    }

    private static unsafe string ClassOf(nint hwnd)
    {
        var buf = stackalloc char[256];
        var n = GetClassNameW(hwnd, buf, 256);
        return n > 0 ? new string(buf, 0, n) : "";
    }

    private static unsafe string ExeOf(uint pid)
    {
        var h = OpenProcess(0x1000, false, pid);
        if (h == 0) return "";
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, buf, ref len) ? Path.GetFileName(new string(buf, 0, (int)len)) : "";
        }
        finally { CloseHandle(h); }
    }

    [LibraryImport("user32.dll")]
    private static partial uint GetWindowThreadProcessId(nint hwnd, out uint pid);

    [LibraryImport("user32.dll", EntryPoint = "GetClassNameW")]
    private static unsafe partial int GetClassNameW(nint hwnd, char* name, int max);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static unsafe partial bool QueryFullProcessImageNameW(nint process, uint flags, char* name, ref uint size);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseHandle(nint h);

    // ---- minimal UIAutomationClient interop (vtable order from UIAutomationClient.h; unused slots are placeholders)

    [ComImport, Guid("ff48dba4-60ef-4201-aa87-54103eef594e")]
    private class CUIAutomation;

    [ComImport, Guid("30cbe57d-d9d0-452a-ab13-7ac5ac4825ee"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomation
    {
        void CompareElements();
        void CompareRuntimeIds();
        void GetRootElement();
        void ElementFromHandle();
        void ElementFromPoint();
        [PreserveSig] int GetFocusedElement(out IUIAutomationElement element);
    }

    [ComImport, Guid("d22108aa-8ac5-49a5-837b-37bbb3d7591e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IUIAutomationElement
    {
        void SetFocus();
        void GetRuntimeId();
        void FindFirst();
        void FindAll();
        void FindFirstBuildCache();
        void FindAllBuildCache();
        void BuildUpdatedCache();
        void GetCurrentPropertyValue();
        void GetCurrentPropertyValueEx();
        void GetCachedPropertyValue();
        void GetCachedPropertyValueEx();
        void GetCurrentPatternAs();
        void GetCachedPatternAs();
        void GetCurrentPattern();
        void GetCachedPattern();
        void GetCachedParent();
        void GetCachedChildren();
        void get_CurrentProcessId();
        void get_CurrentControlType();
        void get_CurrentLocalizedControlType();
        [PreserveSig] int get_CurrentName([MarshalAs(UnmanagedType.BStr)] out string? name);
        void get_CurrentAcceleratorKey();
        void get_CurrentAccessKey();
        void get_CurrentHasKeyboardFocus();
        void get_CurrentIsKeyboardFocusable();
        void get_CurrentIsEnabled();
        void get_CurrentAutomationId();
        [PreserveSig] int get_CurrentClassName([MarshalAs(UnmanagedType.BStr)] out string? className);
    }
}
