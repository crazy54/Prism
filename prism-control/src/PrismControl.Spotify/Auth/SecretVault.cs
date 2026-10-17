using PrismControl.Core.Security;

namespace PrismControl.Spotify.Auth;

/// <summary>Where Spotify secrets live. Real: DPAPI files via <see cref="SecretStore"/>; tests: in memory.</summary>
public interface ISecretVault
{
    void Save(string name, string value);
    string? Load(string name);
    void Delete(string name);
}

/// <summary>DPAPI (current Windows user) files under the module's data folder, written atomically.</summary>
public sealed class DpapiVault(SecretStore store) : ISecretVault
{
    public void Save(string name, string value) => store.Save(name, value);
    public string? Load(string name) => store.Load(name);
    public void Delete(string name) => store.Delete(name);
}
