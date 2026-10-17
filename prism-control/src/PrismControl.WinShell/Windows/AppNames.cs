using System.Collections.Concurrent;
using System.Diagnostics;

namespace PrismControl.WinShell.Switcher;

/// <summary>
/// Friendly app names for keys ("Google Chrome" rather than "chrome.exe"): the exe's FileDescription, then ProductName,
/// then the exe name. Names are text, never logos. Cached per path; never logged.
/// </summary>
public static class AppNames
{
    private static readonly ConcurrentDictionary<string, string> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static string For(string processName, string? exePath)
    {
        if (string.IsNullOrEmpty(exePath)) return WindowSlots.AppName(processName);
        return Cache.GetOrAdd(exePath, p =>
        {
            try
            {
                if (File.Exists(p))
                {
                    var vi = FileVersionInfo.GetVersionInfo(p);
                    foreach (var candidate in new[] { vi.FileDescription, vi.ProductName })
                    {
                        var c = candidate?.Trim();
                        if (c is { Length: >= 2 and <= 28 } && !c.Contains("Host", StringComparison.Ordinal) && !c.Contains(".exe", StringComparison.OrdinalIgnoreCase)) return c;
                    }
                }
            }
            catch { /* unreadable version info: fall through */ }
            return WindowSlots.AppName(processName);
        });
    }
}
