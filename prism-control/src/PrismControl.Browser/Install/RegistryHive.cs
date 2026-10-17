using Microsoft.Win32;

namespace PrismControl.Browser.Install;

/// <summary>
/// A registry root HostInstaller writes under. Production is HKEY_CURRENT_USER; tests use <see cref="MemoryRegistry"/>
/// so they never touch the real registry. Sub-key paths are relative to the root ("Software\Google\Chrome\…").
/// Only default (unnamed) string values are used.
/// </summary>
public interface IRegistryHive
{
    /// <summary>"HKCU" for display.</summary>
    string Name { get; }
    bool KeyExists(string subKey);
    /// <summary>The default value, or null when the key or the value is missing (or not a string).</summary>
    string? GetDefault(string subKey);
    /// <summary>Creates the key path if needed and sets the default value.</summary>
    void SetDefault(string subKey, string value);
    /// <summary>Removes the default value (the key stays).</summary>
    void DeleteDefault(string subKey);
    /// <summary>Deletes the leaf key only if it has no sub-keys and no values left. Returns true if deleted.</summary>
    bool DeleteKeyIfEmpty(string subKey);
}

/// <summary>HKEY_CURRENT_USER. Used only by HostInstaller, only after the user consented in the property inspector.</summary>
public sealed class CurrentUserRegistry : IRegistryHive
{
    public string Name => "HKCU";

    public bool KeyExists(string subKey)
    {
        using var k = Registry.CurrentUser.OpenSubKey(subKey, writable: false);
        return k is not null;
    }

    public string? GetDefault(string subKey)
    {
        using var k = Registry.CurrentUser.OpenSubKey(subKey, writable: false);
        return k?.GetValue(null) as string;
    }

    public void SetDefault(string subKey, string value)
    {
        using var k = Registry.CurrentUser.CreateSubKey(subKey, writable: true) ?? throw new IOException("could not create the registry key");
        k.SetValue(null, value, RegistryValueKind.String);
    }

    public void DeleteDefault(string subKey)
    {
        using var k = Registry.CurrentUser.OpenSubKey(subKey, writable: true);
        k?.DeleteValue("", throwOnMissingValue: false);
    }

    public bool DeleteKeyIfEmpty(string subKey)
    {
        using (var k = Registry.CurrentUser.OpenSubKey(subKey, writable: false))
        {
            if (k is null) return false;
            if (k.SubKeyCount > 0 || k.ValueCount > 0) return false;
        }
        Registry.CurrentUser.DeleteSubKey(subKey, throwOnMissingSubKey: false);
        return true;
    }
}

/// <summary>An in-memory registry for tests (and dry runs): keys are case-insensitive paths.</summary>
public sealed class MemoryRegistry : IRegistryHive
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Dictionary<string, string>> _keys = new(StringComparer.OrdinalIgnoreCase);

    public string Name => "HKCU";
    public List<string> Writes { get; } = [];

    private static string Norm(string k) => k.Trim('\\').Replace('/', '\\');

    public bool KeyExists(string subKey) { lock (_gate) return _keys.ContainsKey(Norm(subKey)); }

    public string? GetDefault(string subKey)
    {
        lock (_gate) return _keys.TryGetValue(Norm(subKey), out var v) && v.TryGetValue("", out var s) ? s : null;
    }

    public void SetDefault(string subKey, string value)
    {
        lock (_gate)
        {
            var path = Norm(subKey);
            // create the whole path, like CreateSubKey
            var parts = path.Split('\\');
            for (var i = 1; i <= parts.Length; i++)
            {
                var p = string.Join('\\', parts.Take(i));
                if (!_keys.ContainsKey(p)) _keys[p] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }
            _keys[path][""] = value;
            Writes.Add($"set {path}");
        }
    }

    public void DeleteDefault(string subKey)
    {
        lock (_gate)
        {
            if (_keys.TryGetValue(Norm(subKey), out var v) && v.Remove("")) Writes.Add($"unset {Norm(subKey)}");
        }
    }

    public bool DeleteKeyIfEmpty(string subKey)
    {
        lock (_gate)
        {
            var path = Norm(subKey);
            if (!_keys.TryGetValue(path, out var v) || v.Count > 0) return false;
            if (_keys.Keys.Any(k => k.Length > path.Length && k.StartsWith(path + "\\", StringComparison.OrdinalIgnoreCase))) return false;
            _keys.Remove(path);
            Writes.Add($"delete {path}");
            return true;
        }
    }

    /// <summary>Test helper: a key with a value set by "someone else".</summary>
    public void Seed(string subKey, string? value)
    {
        lock (_gate)
        {
            var path = Norm(subKey);
            var parts = path.Split('\\');
            for (var i = 1; i <= parts.Length; i++)
            {
                var p = string.Join('\\', parts.Take(i));
                if (!_keys.ContainsKey(p)) _keys[p] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }
            if (value is not null) _keys[path][""] = value;
        }
    }

    public IReadOnlyList<string> AllKeys() { lock (_gate) return [.. _keys.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase)]; }
}
