using System.Security.Cryptography;
using System.Text;

namespace PrismControl.Spotify.Auth;

/// <summary>Authorization Code with PKCE (S256), research/spotify.md §2. No client secret is ever involved.</summary>
public static class Pkce
{
    public const string AuthorizeEndpoint = "https://accounts.spotify.com/authorize";
    public const string TokenEndpoint = "https://accounts.spotify.com/api/token";

    /// <summary>Exactly the scopes in research §2.1, space-separated.</summary>
    public const string Scopes = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-library-modify";

    /// <summary>64 random bytes, base64url: 86 characters (RFC 7636 allows 43–128).</summary>
    public static string NewVerifier() => Base64Url(RandomNumberGenerator.GetBytes(64));

    public static string Challenge(string verifier) => Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

    public static string NewState() => Base64Url(RandomNumberGenerator.GetBytes(16));

    public static string AuthorizeUrl(string clientId, string redirectUri, string challenge, string state, bool showDialog = false)
    {
        var sb = new StringBuilder(AuthorizeEndpoint).Append('?');
        void Add(string k, string v) => sb.Append(k).Append('=').Append(Uri.EscapeDataString(v)).Append('&');
        Add("client_id", clientId);
        Add("response_type", "code");
        Add("redirect_uri", redirectUri);
        Add("code_challenge_method", "S256");
        Add("code_challenge", challenge);
        Add("state", state);
        Add("scope", Scopes);
        if (showDialog) Add("show_dialog", "true");
        sb.Length--;
        return sb.ToString();
    }

    /// <summary>Scopes from <see cref="Scopes"/> missing in a token response's space-separated "scope".</summary>
    public static IReadOnlyList<string> MissingScopes(string? granted)
    {
        var have = (granted ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.Ordinal);
        return Scopes.Split(' ').Where(s => !have.Contains(s)).ToList();
    }

    /// <summary>A Spotify Client ID is 32 hex characters; accept 16–64 letters/digits to be lenient.</summary>
    public static bool LooksLikeClientId(string? id) =>
        id is { Length: >= 16 and <= 64 } && id.All(char.IsAsciiLetterOrDigit);

    /// <summary>Client IDs are logged and shown by their last 4 characters only.</summary>
    public static string Hint(string? clientId) => string.IsNullOrEmpty(clientId) ? "" : "••••" + clientId[^Math.Min(4, clientId.Length)..];

    public static string Base64Url(ReadOnlySpan<byte> bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    internal static bool FixedEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
