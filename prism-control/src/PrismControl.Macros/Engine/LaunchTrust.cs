using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;

namespace PrismControl.Macros.Engine;

/// <summary>
/// Trust on first use for launch steps (review B #2). Action settings travel with exported profiles, so a launch step from a
/// shared profile is untrusted data: it must not run until the user saw exactly what it starts on this PC. A step is trusted
/// when its exact resolved target + arguments + start folder (<see cref="LaunchTrust.Hash"/>) is in this PC's trust list.
/// Steps authored or edited in this PC's property inspector are trusted when saved; others need the Trust button.
/// The list holds hashes only, lives in the module's DataDirectory and is never written into action settings.
/// </summary>
public interface ILaunchTrust
{
    bool IsTrusted(LaunchSpec spec);

    /// <summary>Trusts <paramref name="spec"/> on this PC. False when it already was.</summary>
    bool Trust(LaunchSpec spec);
}

/// <summary>A launch step of a macro, as the trust check sees it.</summary>
/// <param name="StepIndex">0-based position in its macro.</param>
/// <param name="ConfirmReason">Set for launches that always ask for a confirming second press, even when trusted.</param>
public sealed record LaunchCheck(int StepIndex, LaunchSpec Spec, bool Trusted, string? ConfirmReason)
{
    public string Id => LaunchTrust.Hash(Spec);
    public bool NeedsConfirmation => ConfirmReason is not null;
}

/// <summary>A step that starts a program (the trust check covers every such step).</summary>
public interface ILaunchStep
{
    /// <summary>What the step starts on this PC (quotes stripped, environment variables expanded).</summary>
    LaunchSpec ResolveSpec();
}

public static class LaunchTrust
{
    /// <summary>Trusts nothing: an engine built without a trust list runs no launch step (fail closed).</summary>
    public static readonly ILaunchTrust None = new NoTrust();

    /// <summary>The window for the confirming second press of an "always confirm" launch.</summary>
    public static readonly TimeSpan ConfirmWindow = TimeSpan.FromSeconds(3);

    private static readonly HashSet<string> ShellHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "cmd", "powershell", "powershell_ise", "pwsh", "mshta", "wscript", "cscript", "rundll32", "regsvr32", "msiexec",
        "wsl", "bash", "conhost", "forfiles", "cmstp", "msbuild", "certutil", "bitsadmin", "hh", "wmic", "msdt",
    };

    private static readonly HashSet<string> RiskyExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".hta", ".lnk", ".url", ".scr", ".pif", ".com", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse",
        ".wsf", ".wsh", ".msc", ".cpl", ".reg", ".inf", ".msi", ".msp", ".appref-ms", ".application", ".chm", ".jar",
    };

    /// <summary>
    /// The trust key: SHA-256 of the exact resolved target, arguments and start folder (ordinal; a changed character, path
    /// or environment-variable expansion is a different launch and asks again). Lowercase hex.
    /// </summary>
    public static string Hash(LaunchSpec spec)
    {
        var canonical = $"prism-control/launch/1\n{spec.Target}\n\u0000{spec.Arguments ?? ""}\n\u0000{spec.WorkingDirectory ?? ""}";
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    /// <summary>
    /// Why this launch always asks for a confirming second press (null = it does not): network paths (an SMB connection
    /// can send the Windows sign-in to another computer), command shells, PowerShell, mshta, script hosts, and shortcut or
    /// script files whose real target is hidden (.lnk, .url, .hta, .scr, .bat...).
    /// </summary>
    public static string? ConfirmReason(LaunchSpec spec)
    {
        if (IsNetworkPath(spec.Target) || IsNetworkPath(spec.WorkingDirectory) || (spec.Arguments ?? "").Contains(@"\\", StringComparison.Ordinal))
            return "it uses a network path, which can send your Windows sign-in to another computer";
        if (LaunchPolicy.UriScheme(spec.Target) is not null) return null;
        string name, ext;
        try
        {
            var file = Path.GetFileName(spec.Target.TrimEnd('\\', '/'));
            name = Path.GetFileNameWithoutExtension(file);
            ext = Path.GetExtension(file);
        }
        catch (ArgumentException) { return "its path could not be read"; }
        if (ShellHosts.Contains(name)) return "it starts a command shell or script host";
        if (RiskyExtensions.Contains(ext)) return $"it opens a {ext} file, which can run anything";
        return null;
    }

    /// <summary>Exactly what a press starts, for the property inspector (never logged: it can hold user folders).</summary>
    public static string CommandLine(LaunchSpec spec)
    {
        var sb = new StringBuilder(spec.Target.Contains(' ') ? $"\"{spec.Target}\"" : spec.Target);
        if (spec.Arguments is { Length: > 0 } a) sb.Append(' ').Append(a);
        if (spec.WorkingDirectory is { Length: > 0 } wd) sb.Append("   (start in ").Append(wd).Append(')');
        return sb.ToString();
    }

    /// <summary>Every launch step of the scripts (only steps that pass validation: an invalid step never runs anyway).</summary>
    public static List<LaunchCheck> Check(ILaunchTrust trust, MacroScript script)
    {
        var list = new List<LaunchCheck>();
        for (var i = 0; i < script.Steps.Count; i++)
        {
            if (script.Steps[i] is not ILaunchStep ls || MacroStep.SafeValidate(script.Steps[i]).Any()) continue;
            LaunchSpec spec;
            try { spec = ls.ResolveSpec(); }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException) { continue; }
            list.Add(new LaunchCheck(i, spec, trust.IsTrusted(spec), ConfirmReason(spec)));
        }
        return list;
    }

    /// <summary>The PI's view of launches: <c>[{ id, runs, trusted, confirm }]</c>, de-duplicated.</summary>
    public static JsonArray ToJson(IEnumerable<LaunchCheck> checks) => new(checks.DistinctBy(c => c.Id).Select(c => (JsonNode)new JsonObject
    {
        ["id"] = c.Id,
        ["runs"] = CommandLine(c.Spec),
        ["name"] = c.Spec.DisplayName,
        ["trusted"] = c.Trusted,
        ["confirm"] = c.ConfirmReason,
    }).ToArray());

    private static bool IsNetworkPath(string? path) =>
        path is { Length: >= 2 } p && (p.StartsWith(@"\\", StringComparison.Ordinal) || p.StartsWith("//", StringComparison.Ordinal));

    private sealed class NoTrust : ILaunchTrust
    {
        public bool IsTrusted(LaunchSpec spec) => false;
        public bool Trust(LaunchSpec spec) => false;
    }
}

/// <summary>
/// This PC's trust list: <c>launch-trust.json</c> in the module's DataDirectory, holding only hashes (no paths, so the file
/// reveals nothing about what the keys start). Written atomically. In safe mode (the fake host, E2E) it is read but never
/// written: trust given there lasts for the session only. An unreadable file trusts nothing (fail closed).
/// </summary>
public sealed class LaunchTrustStore : ILaunchTrust
{
    public const string FileName = "launch-trust.json";
    /// <summary>The oldest entries go first beyond this (each edit of a launch step in the PI adds one).</summary>
    public const int MaxEntries = 1000;

    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    private readonly object _gate = new();
    private readonly string? _path;
    private readonly bool _persist;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private Dictionary<string, DateTimeOffset>? _entries;

    /// <param name="directory">The module's DataDirectory; null keeps the list in memory only.</param>
    /// <param name="persist">False in safe mode: the file is read, never written.</param>
    public LaunchTrustStore(string? directory, ILog? log = null, bool persist = true, TimeProvider? time = null)
    {
        _path = string.IsNullOrWhiteSpace(directory) ? null : Path.Combine(directory, FileName);
        _persist = persist && _path is not null;
        _log = log ?? NullLog.Instance;
        _time = time ?? TimeProvider.System;
    }

    /// <summary>A list that lives in memory only (tests, and engines without a data folder).</summary>
    public static LaunchTrustStore InMemory() => new(null);

    /// <summary>True when trusting writes the file.</summary>
    public bool Persists => _persist;

    public int Count
    {
        get { lock (_gate) return Entries().Count; }
    }

    public bool IsTrusted(LaunchSpec spec)
    {
        var hash = LaunchTrust.Hash(spec);
        lock (_gate) return Entries().ContainsKey(hash);
    }

    public bool Trust(LaunchSpec spec)
    {
        var hash = LaunchTrust.Hash(spec);
        lock (_gate)
        {
            var e = Entries();
            if (e.ContainsKey(hash)) return false;
            e[hash] = _time.GetUtcNow();
            while (e.Count > MaxEntries) e.Remove(e.MinBy(kv => kv.Value).Key);
            Save(e);
            return true;
        }
    }

    private Dictionary<string, DateTimeOffset> Entries()
    {
        if (_entries is not null) return _entries;
        _entries = new Dictionary<string, DateTimeOffset>(StringComparer.Ordinal);
        if (_path is null || !File.Exists(_path)) return _entries;
        try
        {
            if (JsonNode.Parse(File.ReadAllText(_path))?["entries"] is JsonArray list)
                foreach (var item in list)
                {
                    var hash = item?["hash"] is JsonValue h && h.TryGetValue<string>(out var s) ? s : null;
                    if (hash is null || hash.Length != 64 || !hash.All(char.IsAsciiHexDigitLower)) continue;
                    var added = item?["added"] is JsonValue a && a.TryGetValue<DateTimeOffset>(out var d) ? d : DateTimeOffset.MinValue;
                    _entries[hash] = added;
                }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or FormatException)
        {
            _entries.Clear();
            SafeLog.Warn(_log, $"The launch trust list could not be read ({ex.GetType().Name}); no launch step is trusted until you trust it again in its settings.");
        }
        return _entries;
    }

    private void Save(Dictionary<string, DateTimeOffset> entries)
    {
        if (!_persist || _path is null) return;
        var json = new JsonObject
        {
            ["version"] = 1,
            ["about"] = "Prism Control: launch steps trusted on this PC (SHA-256 of target, arguments and start folder). Not exported with profiles.",
            ["entries"] = new JsonArray(entries.OrderBy(kv => kv.Value).Select(kv => (JsonNode)new JsonObject { ["hash"] = kv.Key, ["added"] = kv.Value }).ToArray()),
        };
        var tmp = _path + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(tmp, json.ToJsonString(Indented));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            SafeLog.Warn(_log, $"The launch trust list could not be saved ({ex.GetType().Name}); the trust lasts until the plugin restarts.");
        }
    }
}
