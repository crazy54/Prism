using System.Security.Cryptography;
using System.Text;

namespace PrismControl.Desktop;

/// <summary>
/// The privacy-preserving workspace key prism-relay sends instead of a cwd (ai-apps.md §7.2): <c>cwd_hash</c> =
/// lowercase hex of the first 8 bytes of SHA-256 over the UTF-8 of <see cref="Normalize"/>(cwd), and <c>cwd_name</c> =
/// <see cref="Basename"/>. prism-relay carries an identical copy (a test pins both to the same values), so the Ai module
/// can join hook events with <c>claude agents --json</c> cwds exactly.
/// </summary>
public static class CwdHash
{
    /// <summary>'/' → '\'; Git Bash "/c/…" → "C:\…"; "\\?\" removed; trailing '\' trimmed except a drive root; lower-cased (invariant).</summary>
    public static string Normalize(string cwd)
    {
        var s = cwd.Trim().Replace('/', '\\');
        if (s.StartsWith(@"\\?\", StringComparison.Ordinal)) s = s[4..];
        if (s.Length >= 2 && s[0] == '\\' && char.IsAsciiLetter(s[1]) && (s.Length == 2 || s[2] == '\\'))
            s = char.ToUpperInvariant(s[1]) + ":" + (s.Length == 2 ? "\\" : s[2..]);
        while (s.Length > 1 && s.EndsWith('\\') && !(s.Length == 3 && s[1] == ':')) s = s[..^1];
        return s.ToLowerInvariant();
    }

    public static string Compute(string cwd) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Normalize(cwd))).AsSpan(0, 8)).ToLowerInvariant();

    /// <summary>The last path segment in its original case ("C:" for a drive root).</summary>
    public static string Basename(string cwd)
    {
        var s = cwd.Trim().Replace('/', '\\').TrimEnd('\\');
        var i = s.LastIndexOf('\\');
        return i >= 0 ? s[(i + 1)..] : s;
    }
}
