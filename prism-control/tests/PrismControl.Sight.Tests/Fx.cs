using PrismControl.Core.Hosting;

namespace PrismControl.Sight.Tests;

/// <summary>Shared test helpers.</summary>
public static class Fx
{
    /// <summary>The Sight scratch folder (aaa-prism-play/sight), for probe outputs and synthetic frames.</summary>
    public static string ScratchDir => Environment.GetEnvironmentVariable("PRISM_SIGHT_SCRATCH") ?? @"E:\Development Workspaces\aaa-prism-play\sight";

    public static string TempDir(string name)
    {
        var d = Path.Combine(Path.GetTempPath(), "prism-sight-tests", name + "-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(d);
        return d;
    }
}

/// <summary>A log that keeps lines in memory (tests assert on them; tokens must never appear).</summary>
public sealed class MemoryLog : ILog
{
    private readonly List<string> _lines = [];
    private readonly string _prefix;
    public MemoryLog(string prefix = "") { _prefix = prefix; }
    private MemoryLog(string prefix, List<string> shared) { _prefix = prefix; _lines = shared; }
    public IReadOnlyList<string> Lines { get { lock (_lines) return [.. _lines]; } }
    public void Write(LogLevel level, string message, Exception? exception = null) { lock (_lines) _lines.Add($"{level} {_prefix}{message}"); }
    public ILog For(string category) => new MemoryLog(_prefix + category + ": ", _lines);
    public bool IsEnabled(LogLevel level) => true;
    public string All => string.Join("\n", Lines);
}
