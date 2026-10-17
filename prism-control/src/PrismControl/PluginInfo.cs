using System.Reflection;

namespace PrismControl;

/// <summary>Plugin identity and manifest constants (the manifest is generated from these plus the action attributes).</summary>
internal static class PluginInfo
{
    public const string Uuid = "com.jeremyfhall.prismcontrol";
    public const string Name = "Prism Control";
    public const string Author = "Jeremy F Hall";
    public const string Description =
        "Turns your Stream Deck into a control surface for your PC in Prism's Refraction look: system stats, audio, " +
        "Spotify now playing and transport, EQ, and macros. First-class on the Corsair Galleon 100 SD and Stream Deck +.";
    public const string Category = "Prism Control";
    public const string Icon = "imgs/plugin/icon";
    public const string CategoryIcon = "imgs/plugin/category";
    public const string CodePath = "bin/PrismControl.exe";
    public const string SoftwareMinimumVersion = "7.1";
    public const string WindowsMinimumVersion = "10";
    public const int SdkVersion = 3;
    public const int ApiVersion = 1;

    /// <summary>x.y.z from the assembly (Directory.Build.props VersionPrefix).</summary>
    public static string Version
    {
        get
        {
            var v = typeof(PluginInfo).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
            var plus = v.IndexOf('+');
            return plus >= 0 ? v[..plus] : v;
        }
    }

    /// <summary>The four-part manifest version (x.y.z.0).</summary>
    public static string ManifestVersion
    {
        get
        {
            var parts = Version.Split('-')[0].Split('.').ToList();
            while (parts.Count < 4) parts.Add("0");
            return string.Join('.', parts.Take(4));
        }
    }
}

/// <summary>Where things live at runtime. Override the per-user folder with PRISM_CONTROL_DIR (tests do).</summary>
internal static class PluginPaths
{
    public const string DirEnv = "PRISM_CONTROL_DIR";

    /// <summary>The .sdPlugin folder: the exe lives in bin/ (never read manifest.json at runtime; DRM forbids it).</summary>
    public static string PluginDirectory
    {
        get
        {
            var exeDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            return string.Equals(Path.GetFileName(exeDir), "bin", StringComparison.OrdinalIgnoreCase)
                ? Path.GetDirectoryName(exeDir) ?? exeDir
                : exeDir;
        }
    }

    /// <summary>%APPDATA%\Prism\control (per user; holds control.json, logs/, modules/).</summary>
    public static string UserDirectory
    {
        get
        {
            var overridden = Environment.GetEnvironmentVariable(DirEnv);
            if (!string.IsNullOrWhiteSpace(overridden)) return Path.GetFullPath(overridden);
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Prism", "control");
        }
    }

    public static string ControlFile => Path.Combine(UserDirectory, "control.json");
    public static string LogDirectory => Path.Combine(UserDirectory, "logs");
    public static string ModuleDirectory(string module) => Path.Combine(UserDirectory, "modules", module.ToLowerInvariant());
}
