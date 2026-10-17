using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using PrismControl.Core.Hosting;

namespace PrismControl.Macros.Engine;

/// <summary>A program, document, folder or app URI to start. Environment variables (%USERPROFILE%) are already expanded.</summary>
public sealed record LaunchSpec(string Target, string? Arguments = null, string? WorkingDirectory = null, string? FocusProcess = null)
{
    /// <summary>The file name or URI scheme only (safe for logs: no user folders).</summary>
    public string DisplayName => LaunchPolicy.ShortName(Target);
}

/// <summary>Starts programs and opens URLs. The real one goes through Core's ProcessLauncher; tests use a recording fake.</summary>
public interface IAppLauncher
{
    /// <summary>Starts the target with ShellExecute. Throws <see cref="MacroStepException"/> with a user-facing reason on failure.</summary>
    void Launch(LaunchSpec spec);

    /// <summary>Opens an http(s) URL in the default browser.</summary>
    void OpenUrl(Uri url);

    /// <summary>Brings an already running instance of the target to the front. False when none is running (then launch it).</summary>
    bool TryFocusRunning(LaunchSpec spec);
}

/// <summary>Open URL rules: absolute http/https only, a host, no user name or password (settings are plain text).</summary>
public static class UrlPolicy
{
    public const int MaxLength = 2048;

    public static bool TryParse(string? text, out Uri uri, out string error)
    {
        uri = null!;
        error = "";
        var s = (text ?? "").Trim();
        if (s.Length == 0) { error = "Enter a URL that starts with https://."; return false; }
        if (s.Length > MaxLength) { error = $"The URL is longer than {MaxLength} characters."; return false; }
        if (s.Any(char.IsControl)) { error = "The URL contains control characters."; return false; }
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u) || u.IsFile || u.IsUnc)
        {
            error = "Enter a full URL that starts with https:// (or http://).";
            return false;
        }
        if (u.Scheme != Uri.UriSchemeHttps && u.Scheme != Uri.UriSchemeHttp)
        {
            error = $"Only http and https URLs can be opened (not \"{u.Scheme}:\").";
            return false;
        }
        if (string.IsNullOrEmpty(u.Host)) { error = "The URL has no host name."; return false; }
        if (!string.IsNullOrEmpty(u.UserInfo))
        {
            error = "URLs with a user name or password are not allowed (settings are stored in plain text and exported with profiles).";
            return false;
        }
        uri = u;
        return true;
    }

    /// <summary>"https · example.com": what the property inspector shows before anything is opened.</summary>
    public static string Describe(Uri uri) => $"{uri.Scheme} · {uri.IdnHost}";
}

/// <summary>Launch rules (research/windows.md §3.2): never a command string, ShellExecute with separate arguments, no web URLs.</summary>
public static partial class LaunchPolicy
{
    public const int MaxTargetLength = 1024;
    public const int MaxArgumentsLength = 2048;

    /// <summary>App URI schemes "Launch app" accepts besides paths (ShellExecute routes them to the registered app).</summary>
    public static readonly IReadOnlySet<string> AppUriSchemes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { "shell", "ms-settings", "ms-windows-store", "steam", "spotify", "discord", "obsidian", "mailto" };

    public static bool IsWebUrl(string? target)
    {
        var t = (target ?? "").Trim();
        return t.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || t.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
    }

    public static List<string> Validate(string? target, string? arguments, string? workingDirectory)
    {
        var p = new List<string>();
        var t = Environment.ExpandEnvironmentVariables(Unquote(target));
        if (t.Length == 0) { p.Add("Choose a program, file or folder to open."); return p; }
        if (t.Length > MaxTargetLength) p.Add($"The path is longer than {MaxTargetLength} characters.");
        if (t.Any(char.IsControl) || t.Contains('"')) p.Add("The path contains quotes or control characters.");
        if (IsWebUrl(t)) p.Add("This is a web address: use an Open URL step.");
        else if (UriScheme(t) is { } scheme)
        {
            if (scheme.Equals("file", StringComparison.OrdinalIgnoreCase)) p.Add("Use the file's path instead of a file: URI.");
            else if (!AppUriSchemes.Contains(scheme)) p.Add($"\"{scheme}:\" links are not allowed here. Allowed: {string.Join(", ", AppUriSchemes.Order())}.");
        }
        else if (!Path.IsPathFullyQualified(t) && (t.Contains('\\') || t.Contains('/')))
            p.Add("Use a full path (C:\\...) or just a program name such as notepad.exe.");
        if ((arguments ?? "").Length > MaxArgumentsLength) p.Add($"The arguments are longer than {MaxArgumentsLength} characters.");
        if ((arguments ?? "").Any(c => char.IsControl(c) && c != '\t')) p.Add("The arguments contain line breaks or control characters.");
        var wd = Unquote(workingDirectory);
        if (wd.Length > 0 && !Path.IsPathFullyQualified(Environment.ExpandEnvironmentVariables(wd))) p.Add("The start folder must be a full path.");
        return p;
    }

    /// <summary>The spec to run: quotes stripped, environment variables expanded, empty fields as null.</summary>
    public static LaunchSpec Resolve(string? target, string? arguments, string? workingDirectory, string? focusProcess = null)
    {
        static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : Environment.ExpandEnvironmentVariables(Unquote(s));
        return new LaunchSpec(Clean(target) ?? "", string.IsNullOrWhiteSpace(arguments) ? null : arguments.Trim(), Clean(workingDirectory), Clean(focusProcess));
    }

    /// <summary>The process name used for "focus if already running": the explicit one, or the exe's name.</summary>
    public static string? FocusName(LaunchSpec spec)
    {
        if (spec.FocusProcess is { Length: > 0 } f) return Path.GetFileNameWithoutExtension(f);
        if (UriScheme(spec.Target) is null && spec.Target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            return Path.GetFileNameWithoutExtension(spec.Target);
        return null;
    }

    public static string ShortName(string target)
    {
        var t = Unquote(target);
        if (UriScheme(t) is { } scheme) return scheme + ":";
        try { return Path.GetFileName(t.TrimEnd('\\', '/')) is { Length: > 0 } n ? n : t; }
        catch (ArgumentException) { return t; }
    }

    /// <summary>The URI scheme of the target, or null for a path (a drive letter like C: is not a scheme).</summary>
    public static string? UriScheme(string target)
    {
        var m = SchemeRe().Match(target);
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string Unquote(string? s)
    {
        var t = (s ?? "").Trim();
        if (t.Length >= 2 && t[0] == '"' && t[^1] == '"') t = t[1..^1].Trim();
        return t;
    }

    [GeneratedRegex(@"^([A-Za-z][A-Za-z0-9+.\-]+):")]
    private static partial Regex SchemeRe();
}

/// <summary>
/// The real launcher. ShellExecute through <see cref="ProcessLauncher.Start"/>: the working directory is never the plugin
/// folder, the Stream Deck app's QT_* variables were scrubbed at startup, and children break away from the plugin's job.
/// Safe mode: ProcessLauncher starts nothing, and focusing a window is refused here too (the module never builds this
/// launcher in safe mode or a dry run; these checks are the last line).
/// </summary>
internal sealed partial class ShellAppLauncher(ILog log) : IAppLauncher
{
    public void Launch(LaunchSpec spec)
    {
        if (spec.WorkingDirectory is { } wd && !Directory.Exists(wd))
            throw new MacroStepException($"The start folder for {spec.DisplayName} was not found.");
        try
        {
            using var p = ProcessLauncher.Start(spec.Target, spec.Arguments, useShellExecute: true, workingDirectory: spec.WorkingDirectory);
        }
        catch (Win32Exception ex)
        {
            throw new MacroStepException(LaunchFailure(spec, ex));
        }
        catch (InvalidOperationException)
        {
            throw new MacroStepException($"{spec.DisplayName} could not be started.");
        }
    }

    public void OpenUrl(Uri url)
    {
        try
        {
            using var p = ProcessLauncher.Start(url.AbsoluteUri, useShellExecute: true);
        }
        catch (Win32Exception ex)
        {
            throw new MacroStepException(UrlFailure(url, ex));
        }
    }

    /// <summary>
    /// The user-facing (and logged) reason a start failed. Never <c>ex.Message</c>: for ShellExecute it can hold the full path,
    /// the start folder (C:\Users\&lt;name&gt;\...) or the whole URL with its query. The system text for the code has none of that.
    /// </summary>
    internal static string LaunchFailure(LaunchSpec spec, Win32Exception ex) => ex.NativeErrorCode switch
    {
        2 or 3 => $"{spec.DisplayName} was not found.",
        1223 => $"Starting {spec.DisplayName} was cancelled.",
        5 => $"Windows denied access to {spec.DisplayName}.",
        var code => $"{spec.DisplayName} could not be started ({SystemMessage(code)}).",
    };

    /// <summary>Why a URL did not open: the host only, never the path or query.</summary>
    internal static string UrlFailure(Uri url, Win32Exception ex) => $"No browser opened {url.IdnHost} ({SystemMessage(ex.NativeErrorCode)}).";

    private static string SystemMessage(int code) => new Win32Exception(code).Message.Trim().TrimEnd('.');

    public bool TryFocusRunning(LaunchSpec spec)
    {
        if (SafeModeEnvironment.FromEnvironment()) return false; // never SetForegroundWindow / SwitchToThisWindow in safe mode
        var hwnd = FindRunningWindow(spec);
        if (hwnd == 0) return false;
        if (IsIconic(hwnd) != 0) ShowWindow(hwnd, 9 /* SW_RESTORE */);
        if (SetForegroundWindow(hwnd) == 0 || GetForegroundWindow() != hwnd)
            SwitchToThisWindow(hwnd, 1); // background processes may not steal focus; this one is allowed to ask
        log.Debug($"Focused the running {spec.DisplayName}.");
        return true;
    }

    /// <summary>The main window of a running instance (read-only: changes nothing).</summary>
    internal nint FindRunningWindow(LaunchSpec spec)
    {
        var name = LaunchPolicy.FocusName(spec);
        if (name is null) return 0;
        var wantPath = Path.IsPathFullyQualified(spec.Target) ? Path.GetFullPath(spec.Target) : null;
        var processes = Process.GetProcessesByName(name);
        try
        {
            foreach (var p in processes)
            {
                nint hwnd;
                try { hwnd = p.MainWindowHandle; }
                catch (InvalidOperationException) { continue; }
                if (hwnd == 0) continue;
                if (wantPath is not null && spec.FocusProcess is null && ImagePath((uint)p.Id) is { } path
                    && !string.Equals(path, wantPath, StringComparison.OrdinalIgnoreCase))
                    continue;
                return hwnd;
            }
            return 0;
        }
        finally
        {
            foreach (var p in processes) p.Dispose();
        }
    }

    private static unsafe string? ImagePath(uint pid)
    {
        var h = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, 0, pid);
        if (h == 0) return null;
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, buf, ref len) != 0 ? new string(buf, 0, (int)len) : null;
        }
        finally { CloseHandle(h); }
    }

    [LibraryImport("user32.dll")] private static partial int IsIconic(nint hwnd);
    [LibraryImport("user32.dll")] private static partial int ShowWindow(nint hwnd, int cmd);
    [LibraryImport("user32.dll")] private static partial int SetForegroundWindow(nint hwnd);
    [LibraryImport("user32.dll")] private static partial nint GetForegroundWindow();
    [LibraryImport("user32.dll")] private static partial void SwitchToThisWindow(nint hwnd, int altTab);
    [LibraryImport("kernel32.dll", SetLastError = true)] private static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] private static unsafe partial int QueryFullProcessImageNameW(nint h, uint flags, char* buf, ref uint size);
}
