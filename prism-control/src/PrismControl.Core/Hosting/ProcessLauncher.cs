using System.Collections;
using System.Diagnostics;

namespace PrismControl.Core.Hosting;

/// <summary>
/// Starting other programs from the plugin safely (research/windows.md §3.2):
/// the plugin inherits the Stream Deck app's Qt variables (QT_SCALE_FACTOR, QT_SCREEN_SCALE_FACTORS,
/// QTWEBENGINE_CHROMIUM_FLAGS, ...) and its working directory is the .sdPlugin folder. A Qt app we launch would then
/// ignore Windows DPI scaling, and any child would hold a handle on the plugin folder (blocking updates).
/// The host calls <see cref="ScrubInheritedEnvironment"/> at startup (ShellExecute cannot take a custom environment);
/// use <see cref="Start"/> so the working directory is never the plugin folder.
/// </summary>
public static class ProcessLauncher
{
    public static readonly string[] ScrubbedPrefixes = ["QT_", "QTWEBENGINE_", "QML_", "QML2_"];

    /// <summary>Removes Qt host variables from this process's environment (children inherit the cleaned block).</summary>
    public static IReadOnlyList<string> ScrubInheritedEnvironment()
    {
        var removed = new List<string>();
        foreach (DictionaryEntry e in Environment.GetEnvironmentVariables())
        {
            var name = (string)e.Key;
            if (ScrubbedPrefixes.Any(p => name.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
            {
                Environment.SetEnvironmentVariable(name, null);
                removed.Add(name);
            }
        }
        return removed;
    }

    /// <summary>
    /// Starts a program, document or URL. Working directory: the target's folder for files, the user profile otherwise.
    /// Children break away from the plugin's job object, so they keep running when the plugin stops.
    /// In safe mode (<see cref="SafeModeEnvironment"/>, the fake host and E2E) nothing is started and null is returned.
    /// </summary>
    public static Process? Start(string target, string? arguments = null, bool useShellExecute = true, string? workingDirectory = null)
    {
        if (SafeModeEnvironment.FromEnvironment()) return null;
        var psi = new ProcessStartInfo(target)
        {
            UseShellExecute = useShellExecute,
            WorkingDirectory = workingDirectory ?? DefaultWorkingDirectory(target),
        };
        if (arguments is not null) psi.Arguments = arguments;
        if (!useShellExecute)
        {
            foreach (var key in psi.Environment.Keys.ToList())
                if (ScrubbedPrefixes.Any(p => key.StartsWith(p, StringComparison.OrdinalIgnoreCase))) psi.Environment.Remove(key);
        }
        return Process.Start(psi);
    }

    private static string DefaultWorkingDirectory(string target)
    {
        try
        {
            if (Path.IsPathFullyQualified(target) && File.Exists(target)) return Path.GetDirectoryName(target)!;
        }
        catch (ArgumentException) { }
        return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    }
}
