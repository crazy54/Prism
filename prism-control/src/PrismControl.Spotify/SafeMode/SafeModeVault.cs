using PrismControl.Spotify.Auth;

namespace PrismControl.Spotify.SafeMode;

/// <summary>
/// Safe mode's secret store: reads fall through to the real vault (so a saved sign-in still reads now playing), but
/// saves and deletes land in memory only. The DPAPI files in the user's data folder are never written or removed.
/// </summary>
public sealed class SafeModeVault(ISecretVault inner, SafeModeWrites writes) : ISecretVault
{
    private readonly Dictionary<string, string?> _shadow = new(StringComparer.Ordinal);   // null = deleted in this process

    public void Save(string name, string value)
    {
        lock (_shadow) _shadow[name] = value;
        writes.Suppressed("vault save " + name);
    }

    public string? Load(string name)
    {
        lock (_shadow)
        {
            if (_shadow.TryGetValue(name, out var v)) return v;
        }
        return inner.Load(name);
    }

    public void Delete(string name)
    {
        lock (_shadow) _shadow[name] = null;
        writes.Suppressed("vault delete " + name);
    }
}
