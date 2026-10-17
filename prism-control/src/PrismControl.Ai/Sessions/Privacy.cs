using System.Security.Cryptography;
using System.Text;

namespace PrismControl.Ai.Sessions;

/// <summary>
/// Privacy helpers (research/ai-apps.md §7). What Prism never keeps, it can't leak:
/// <list type="bullet">
/// <item>cwds become a hash + basename at the edge (<see cref="CwdHash"/>, the same function the relay and Desktop use);</item>
/// <item>logs carry event types, counts, 6-hex hashes (<see cref="Hash6"/>) and decisions only;</item>
/// <item>a revealed command summary is bounded and scrubbed again here (<see cref="Scrub"/>), whatever the relay did.</item>
/// </list>
/// </summary>
public static partial class Privacy
{
    /// <summary>A 6-hex SHA-256 prefix: the only form an id may take in a log line.</summary>
    public static string Hash6(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "------";
        Span<byte> h = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(value), h);
        return Convert.ToHexStringLower(h[..3]);
    }

    /// <summary>
    /// The cwd join key: exactly PrismControl.Desktop.CwdHash (the relay carries an identical copy), so agent-list rows join
    /// hook rows. Null for an empty cwd.
    /// </summary>
    public static string? CwdHash(string? cwd) => string.IsNullOrWhiteSpace(cwd) ? null : PrismControl.Desktop.CwdHash.Compute(cwd);

    /// <summary>The last path segment, original case (null for a root or nothing).</summary>
    public static string? CwdName(string? cwd)
    {
        if (string.IsNullOrWhiteSpace(cwd)) return null;
        var t = cwd.Trim().Replace('/', '\\').TrimEnd('\\');
        var i = t.LastIndexOf('\\');
        var name = i >= 0 ? t[(i + 1)..] : t;
        if (name.Length == 0 || (name.Length == 2 && name[1] == ':')) return null;
        return Clean(name, 128);
    }

    /// <summary>
    /// Strips control characters, line/paragraph separators and every Unicode FORMAT character (bidi marks, embeddings, overrides
    /// AND isolates U+2066\u20132069, zero-width U+200B\u2013200D / U+2060, BOM U+FEFF, ALM U+061C, soft hyphen \u2026: review M3), then caps the
    /// length. For identifiers and labels (aliases, workspace names). Approval summaries are never cleaned: what they show is
    /// refused instead when it holds such characters (<see cref="Approvals.ApprovalText.Visible"/>).
    /// </summary>
    public static string? Clean(string? s, int max)
    {
        if (s is null) return null;
        var sb = new StringBuilder(Math.Min(s.Length, max));
        foreach (var ch in s)
        {
            if (sb.Length >= max) break;
            if (char.IsControl(ch) || ch is '\u2028' or '\u2029' || char.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.Format) continue;
            sb.Append(ch);
        }
        return sb.ToString();
    }

    /// <summary>
    /// Masks secrets (ai-apps.md §7.2) with the ONE shared, table-driven scrubber the relay uses too (review L1:
    /// <see cref="PrismShared.SecretScrubber"/>), then caps at <paramref name="max"/>. For display decisions use
    /// <see cref="PrismShared.SecretScrubber.Scrub"/> directly: it also says whether a mask hid shell-active text.
    /// </summary>
    public static string Scrub(string? text, int max = 120)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var s = PrismShared.SecretScrubber.ScrubText(Clean(text, 4096));
        if (s.Length > max) s = s[..(max - 1)] + "…";
        return s;
    }

    /// <summary>The file basename only (no folders) for a revealed summary.</summary>
    public static string? FileBaseName(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var t = path.Replace('/', '\\').TrimEnd('\\');
        var i = t.LastIndexOf('\\');
        return Clean(i >= 0 ? t[(i + 1)..] : t, 64);
    }

    /// <summary>The host only (no path, query or credentials) for a revealed URL.</summary>
    public static string? UrlHost(string? hostOrUrl)
    {
        if (string.IsNullOrWhiteSpace(hostOrUrl)) return null;
        if (Uri.TryCreate(hostOrUrl, UriKind.Absolute, out var u) && !string.IsNullOrEmpty(u.Host)) return Clean(u.Host, 64);
        var h = hostOrUrl.Trim();
        var at = h.LastIndexOf('@');
        if (at >= 0) h = h[(at + 1)..];
        var cut = h.IndexOfAny(['/', '?', '#', ' ']);
        if (cut >= 0) h = h[..cut];
        return Clean(h, 64);
    }
}
