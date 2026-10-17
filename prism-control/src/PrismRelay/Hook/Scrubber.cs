using System.Text;

namespace PrismShared;

/// <summary>What <see cref="SecretScrubber.Scrub"/> did to one text.</summary>
/// <param name="Text">The text with every secret replaced by <see cref="SecretScrubber.Mask"/>; everything else kept exactly.</param>
/// <param name="Masked">How many regions were masked.</param>
/// <param name="MaskedActive">
/// A masked region contained shell-active characters (<c>$(</c>, a backtick, <c>| ; &amp; &lt; &gt;</c> or a line break), e.g.
/// <c>API_KEY=$(curl …|sh)</c>. A mask must never hide what runs, so the ai module locks Approve for such a summary.
/// </param>
internal readonly record struct ScrubResult(string Text, int Masked, bool MaskedActive);

/// <summary>
/// The ONE secret scrubber (review L1). This file is compiled into prism-relay (src/PrismRelay/Hook) AND linked into the ai
/// module (PrismControl.Ai.csproj), and both test projects run the same case table (tests/PrismRelay.Tests/ScrubberCases.cs).
/// Table-driven and Regex-free (NativeAOT-friendly). Rules, per whitespace-separated word:
/// <list type="number">
/// <item>secret NAMES (<see cref="IsSecretName"/>: last segment in <see cref="SecretSegments"/>, "&lt;qualifier&gt;_key", or a
/// suffix in <see cref="SecretSuffixes"/>; so PGPASSWORD, MYSQL_PWD, X-Api-Key, apiKey, AWS_SECRET_ACCESS_KEY all match):
/// <c>NAME=value</c> / <c>NAME:value</c> in one word, <c>--name value</c> / <c>-name value</c>, and header words
/// <c>Name: value</c> (an auth scheme such as Bearer/Basic stays visible, the credential after it is masked);</item>
/// <item><c>Bearer x</c> anywhere;</item>
/// <item>per-tool flags (<see cref="ToolFlags"/>): <c>sshpass -p x</c>, <c>mysql -px</c>, <c>curl -u user:pass</c>,
/// <c>docker login -p x</c>, <c>smbclient -U user%pass</c>, …;</item>
/// <item>URLs: the whole userinfo (<c>https://•••@host</c>) and secret query/fragment parameters (<c>?token=•••</c>,
/// <c>&amp;sig=•••</c>);</item>
/// <item>secret-looking runs: AWS key ids, known token prefixes (<see cref="TokenPrefixes"/>), hex runs ≥ 24, and base64-like
/// runs ≥ 32 that mix digits, upper and lower case (plain long words and paths stay readable).</item>
/// </list>
/// Nothing else changes: whitespace, line breaks and every other character are kept exactly (the module renders them; it never
/// gets a collapsed or truncated text from here). A quoted secret that spans words (<c>--password "a b c"</c>) is masked up to
/// its closing quote. A mask never swallows a shell operator or the word after one (<c>--token; rm x</c> keeps <c>rm</c>).
/// </summary>
internal static class SecretScrubber
{
    public const string Mask = "\u2022\u2022\u2022";

    /// <summary>A name is secret when its last segment (split on _ - . and camelCase) is one of these.</summary>
    internal static readonly string[] SecretSegments =
        ["password", "passwd", "passphrase", "pwd", "pass", "secret", "token", "apikey", "credential", "credentials", "auth", "authorization", "cookie"];

    /// <summary>... or its last segment is "key" right after one of these (API_KEY, x-api-key, AWS_SECRET_ACCESS_KEY, clientKey).</summary>
    internal static readonly string[] KeyQualifiers =
        ["api", "access", "secret", "private", "client", "master", "encryption", "signing", "account", "subscription", "license", "auth", "admin", "service", "session"];

    /// <summary>... or the whole name, letters and digits only, lower case, ends with one of these (PGPASSWORD, GHTOKEN, MYAPIKEY).</summary>
    internal static readonly string[] SecretSuffixes =
        ["password", "passwd", "passphrase", "secret", "token", "apikey", "accesskey", "privatekey", "secretkey"];

    /// <summary>Header names whose value is a credential even though the name rule would not say so.</summary>
    internal static readonly string[] SecretHeaders = ["authorization", "proxy-authorization", "cookie", "set-cookie"];

    /// <summary>Auth schemes kept visible after a secret header name: the credential after them is masked.</summary>
    internal static readonly string[] AuthSchemes = ["bearer", "basic", "token", "digest", "negotiate", "ntlm", "hmac", "aws4-hmac-sha256"];

    /// <summary>URL query / fragment parameter names that carry secrets beyond the name rule (signed URLs, OAuth).</summary>
    internal static readonly string[] UrlSecretParams =
        ["sig", "signature", "key", "access_token", "refresh_token", "id_token", "client_secret", "x-amz-signature", "x-amz-credential", "x-amz-security-token", "x-goog-signature", "x-goog-credential"];

    /// <summary>How a per-tool flag's value is masked.</summary>
    internal enum FlagValue { Whole, AfterColon, AfterPercent }

    /// <param name="Tool">The command word (basename, lower case, without .exe).</param>
    /// <param name="Sub">A sub-command that must follow the tool (docker LOGIN), or null.</param>
    /// <param name="Flag">The flag, exactly (case-sensitive).</param>
    /// <param name="Attached">The value may be glued to the flag (<c>-pSECRET</c>).</param>
    /// <param name="Separate">The value may be the next word (<c>-p SECRET</c>).</param>
    /// <param name="Value">Which part of the value is the secret.</param>
    internal sealed record ToolFlag(string Tool, string? Sub, string Flag, bool Attached, bool Separate, FlagValue Value);

    internal static readonly ToolFlag[] ToolFlags =
    [
        new("sshpass", null, "-p", true, true, FlagValue.Whole),
        new("mysql", null, "-p", true, false, FlagValue.Whole),
        new("mysqldump", null, "-p", true, false, FlagValue.Whole),
        new("mysqladmin", null, "-p", true, false, FlagValue.Whole),
        new("mysqlimport", null, "-p", true, false, FlagValue.Whole),
        new("mysqlshow", null, "-p", true, false, FlagValue.Whole),
        new("mysqlcheck", null, "-p", true, false, FlagValue.Whole),
        new("mariadb", null, "-p", true, false, FlagValue.Whole),
        new("mariadb-dump", null, "-p", true, false, FlagValue.Whole),
        new("curl", null, "-u", true, true, FlagValue.AfterColon),
        new("curl", null, "--user", false, true, FlagValue.AfterColon),
        new("curl", null, "-U", true, true, FlagValue.AfterColon),
        new("curl", null, "--proxy-user", false, true, FlagValue.AfterColon),
        new("docker", "login", "-p", true, true, FlagValue.Whole),
        new("podman", "login", "-p", true, true, FlagValue.Whole),
        new("nerdctl", "login", "-p", true, true, FlagValue.Whole),
        new("smbclient", null, "-U", true, true, FlagValue.AfterPercent),
        new("smbclient", null, "--user", false, true, FlagValue.AfterPercent),
        new("sqlcmd", null, "-P", true, true, FlagValue.Whole),
        new("redis-cli", null, "-a", false, true, FlagValue.Whole),
        new("openssl", null, "-passin", false, true, FlagValue.Whole),
        new("openssl", null, "-passout", false, true, FlagValue.Whole),
        new("openssl", null, "-pass", false, true, FlagValue.Whole),
        new("zip", null, "-P", false, true, FlagValue.Whole),
        new("unzip", null, "-P", false, true, FlagValue.Whole),
        new("7z", null, "-p", true, false, FlagValue.Whole),
        new("7za", null, "-p", true, false, FlagValue.Whole),
        new("ssh-keygen", null, "-N", false, true, FlagValue.Whole),
        new("ssh-keygen", null, "-P", false, true, FlagValue.Whole),
    ];

    /// <summary>Commands that run the next word as the real command (<c>sudo mysql -p…</c>).</summary>
    internal static readonly string[] CommandPrefixes = ["sudo", "doas", "env", "time", "nohup", "exec", "command", "builtin", "xargs", "nice", "stdbuf", "timeout"];

    /// <summary>Known token prefixes (case-sensitive): a run that starts with one and has ≥ 16 more characters is masked.</summary>
    internal static readonly string[] TokenPrefixes =
    [
        "github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "glpat-", "xoxb-", "xoxp-", "xoxa-", "xoxr-", "xoxs-", "sk-", "sk_live_", "sk_test_",
        "rk_live_", "rk_test_", "whsec_", "AIza", "npm_", "pypi-", "hf_", "dop_v1_", "shpat_", "shpss_", "sq0atp-", "sq0csp-",
    ];

    internal static readonly string[] AwsKeyPrefixes = ["AKIA", "ASIA", "AGPA", "AIDA", "AROA", "ANPA", "ANVA", "AIPA", "ABIA", "ACCA"];

    private static readonly char[] Separators = [';', '|', '&', '(', ')', '{', '}', '`'];

    public static string ScrubText(string? text) => Scrub(text).Text;

    public static ScrubResult Scrub(string? text)
    {
        if (string.IsNullOrEmpty(text)) return new ScrubResult("", 0, false);
        var words = Tokenize(text);
        var ctx = new State { ExpectTool = true };
        for (var i = 0; i < words.Count; i++)
        {
            var w = words[i];
            if (w.Text.Length == 0) continue;
            if (w.IsSpace)
            {
                if (w.Text.Contains('\n') || w.Text.Contains('\r')) { ctx.MaskWords = 0; ctx.ResetCommand(); }
                continue;
            }
            if (ctx.MaskWords > 0)
            {
                // The value of "--password", "Authorization:", "Bearer", "sshpass -p" …. Never a shell operator: "--token | sh"
                // keeps "| sh" visible.
                if (IsOperator(w.Text)) { ctx.MaskWords = 0; ctx.KeepScheme = false; ctx.ResetCommand(); continue; }
                ctx.MaskWords--;
                var keepScheme = ctx.KeepScheme && IsAuthScheme(Bare(w.Text));
                ctx.KeepScheme = false;
                if (keepScheme) { ctx.MaskWords = 1; continue; }
                MaskValueFrom(words, i, 0, ctx.FlagValue, ref ctx);
                ctx.FlagValue = FlagValue.Whole;
                // A value glued to a separator ("x;") ends the command.
                if (words[i].Text.IndexOfAny(Separators) >= 0) ctx.ResetCommand();
                continue;
            }
            ProcessWord(words, i, ref ctx);
        }
        var sb = new StringBuilder(text.Length);
        foreach (var w in words) sb.Append(w.Text);
        return new ScrubResult(sb.ToString(), ctx.Masked, ctx.Active);
    }

    /// <summary>
    /// The name rule: last segment in <see cref="SecretSegments"/>, "&lt;qualifier&gt; key" as the last two segments, or the
    /// letters-and-digits name ending in a <see cref="SecretSuffixes"/> word. Leading dashes, $ and braces are ignored.
    /// </summary>
    public static bool IsSecretName(string? raw)
    {
        if (string.IsNullOrEmpty(raw)) return false;
        var name = raw.Trim().TrimStart('-', '$', '{', '"', '\'', '`', '(', '@').TrimEnd('}', '"', '\'', '`', ':', '=', ')');
        if (name.Length is 0 or > 96) return false;
        var segments = Segments(name);
        if (segments.Count == 0) return false;
        var last = segments[^1];
        if (Array.IndexOf(SecretSegments, last) >= 0) return true;
        if (last == "key" && segments.Count >= 2 && Array.IndexOf(KeyQualifiers, segments[^2]) >= 0) return true;
        var flat = new StringBuilder(name.Length);
        foreach (var c in name) if (char.IsAsciiLetterOrDigit(c)) flat.Append(char.ToLowerInvariant(c));
        var f = flat.ToString();
        foreach (var s in SecretSuffixes) if (f.EndsWith(s, StringComparison.Ordinal)) return true;
        return false;
    }

    /// <summary>Shell-active characters: command substitution, pipes, lists, redirections, line breaks.</summary>
    internal static bool IsActive(string s) =>
        s.Contains("$(", StringComparison.Ordinal) || s.IndexOfAny(['`', '|', ';', '&', '<', '>', '\n', '\r']) >= 0;

    // ------------------------------------------------------------------ internals

    private struct State
    {
        public int Masked;
        public bool Active;
        public int MaskWords;
        public bool KeepScheme;
        public FlagValue FlagValue;
        /// <summary>The current simple command's tool word (null until seen) and its first non-flag argument.</summary>
        public string? Tool;
        public string? FirstArg;
        public bool ExpectTool;

        public void ResetCommand()
        {
            Tool = null;
            FirstArg = null;
            ExpectTool = true;
        }
    }

    private sealed class Word(string text, bool isSpace)
    {
        public string Text = text;
        public readonly bool IsSpace = isSpace;
    }

    private static List<Word> Tokenize(string text)
    {
        var list = new List<Word>();
        var sb = new StringBuilder();
        var space = false;
        foreach (var ch in text)
        {
            var s = char.IsWhiteSpace(ch);
            if (sb.Length > 0 && s != space)
            {
                list.Add(new Word(sb.ToString(), space));
                sb.Clear();
            }
            space = s;
            sb.Append(ch);
        }
        if (sb.Length > 0) list.Add(new Word(sb.ToString(), space));
        return list;
    }

    private static bool IsOperator(string w) => w is "|" or "||" or "&&" or "&" or ";" or ";;" or ">" or ">>" or "<" or "<<" or "2>" or "2>>" or "&>" or "|&" or "(" or ")";

    private static void ProcessWord(List<Word> words, int i, ref State ctx)
    {
        var w = words[i].Text;
        var bare = Bare(w);
        // A word glued to a separator ("--token;" / "Bearer|") never masks the word after it.
        var endsCommand = w.Length > 0 && Array.IndexOf(Separators, w[^1]) >= 0;

        // Bearer x.
        if (bare.Equals("bearer", StringComparison.OrdinalIgnoreCase))
        {
            if (!endsCommand) ctx.MaskWords = 1;
            else ctx.ResetCommand();
            return;
        }

        // A header word: "Authorization:" / "'X-Api-Key:" / "-HCookie:" or a word that ends with a secret label
        // (git -c http.extraheader="AUTHORIZATION: basic …").
        if (!endsCommand && EndsWithSecretLabel(bare))
        {
            ctx.MaskWords = 1;
            ctx.KeepScheme = true;
            return;
        }

        // A per-tool flag: sshpass -p x, mysql -px, curl -u user:pass, docker login -p x.
        if (ctx.Tool is { } tool && w.StartsWith('-'))
        {
            foreach (var f in ToolFlags)
            {
                if (f.Tool != tool || (f.Sub is not null && !string.Equals(ctx.FirstArg, f.Sub, StringComparison.Ordinal))) continue;
                if (f.Separate && w == f.Flag) { ctx.MaskWords = 1; ctx.FlagValue = f.Value; return; }
                if (f.Attached && w.Length > f.Flag.Length && w.StartsWith(f.Flag, StringComparison.Ordinal) && (f.Flag.Length > 2 || w[f.Flag.Length] != '-'))
                {
                    MaskValueFrom(words, i, f.Flag.Length, f.Value, ref ctx);
                    if (words[i].Text.IndexOfAny(Separators) >= 0) ctx.ResetCommand();
                    return;
                }
                if (f.Flag.StartsWith("--", StringComparison.Ordinal) && w.StartsWith(f.Flag + "=", StringComparison.Ordinal))
                {
                    MaskValueFrom(words, i, f.Flag.Length + 1, f.Value, ref ctx);
                    if (words[i].Text.IndexOfAny(Separators) >= 0) ctx.ResetCommand();
                    return;
                }
            }
        }

        // --password value / -token value (no '=' in the word).
        if (bare.StartsWith('-') && !bare.Contains('=') && !bare.Contains(':') && IsSecretName(bare))
        {
            if (!endsCommand) ctx.MaskWords = 1;
            else ctx.ResetCommand();
            return;
        }

        // NAME=value / NAME:value inside the word (not a URL scheme), and one nested level (--header=X-Api-Key:abc).
        var offset = 0;
        for (var level = 0; level < 2; level++)
        {
            var sep = AssignmentAt(w, offset);
            if (sep < 0) break;
            if (IsSecretName(w[offset..sep]))
            {
                if (sep + 1 < w.Length)
                {
                    MaskValueFrom(words, i, sep + 1, FlagValue.Whole, ref ctx);
                    if (words[i].Text.IndexOfAny(Separators) >= 0) ctx.ResetCommand();
                }
                // "Name: value" (header style) masks the next word; "NAME= cmd" never does (cmd is what runs).
                else if (w[sep] == ':') { ctx.MaskWords = 1; ctx.KeepScheme = true; }
                return;
            }
            offset = sep + 1;
        }

        TrackCommand(ref ctx, w);
        words[i].Text = ScrubUrlsAndRuns(w, ref ctx);
    }

    /// <summary>Follows the current simple command's tool word (for the per-tool flag table).</summary>
    private static void TrackCommand(ref State ctx, string w)
    {
        // A separator inside the word starts a new command after it ("a;mysql", "x|curl").
        var last = w.LastIndexOfAny(Separators);
        if (last >= 0)
        {
            ctx.ResetCommand();
            w = w[(last + 1)..];
            if (w.Length == 0) return;
        }
        if (ctx.ExpectTool)
        {
            var t = w.Trim('"', '\'');
            // Assignments before a command (FOO=1 mysql …) and prefixes (sudo mysql …) keep waiting for the tool.
            if (t.Length == 0 || (t.Contains('=') && !t.StartsWith('-'))) return;
            if (t.StartsWith('-')) return;
            var name = ToolName(t);
            if (Array.IndexOf(CommandPrefixes, name) >= 0) return;
            ctx.Tool = name;
            ctx.FirstArg = null;
            ctx.ExpectTool = false;
            return;
        }
        if (ctx.FirstArg is null && !w.StartsWith('-')) ctx.FirstArg = w.Trim('"', '\'').ToLowerInvariant();
    }

    private static string ToolName(string word)
    {
        var s = word.Replace('\\', '/');
        var slash = s.LastIndexOf('/');
        if (slash >= 0) s = s[(slash + 1)..];
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s[..^4];
        return s.ToLowerInvariant();
    }

    /// <summary>
    /// The index of the '=' or ':' of a NAME=value / NAME:value word at or after <paramref name="from"/> (not "://", not a drive
    /// "C:\"), else -1. NAME is letters, digits and _ - . $ { }, after optional leading quotes.
    /// </summary>
    private static int AssignmentAt(string w, int from)
    {
        var start = from;
        while (start < w.Length && w[start] is '"' or '\'' or '`' or '(') start++;
        for (var k = start; k < w.Length; k++)
        {
            var c = w[k];
            if (c == '=') return k > start ? k : -1;
            if (c == ':')
            {
                if (k == start || w.AsSpan(k).StartsWith("://")) return -1;
                if (k == start + 1 && char.IsAsciiLetter(w[start]) && k + 1 < w.Length && w[k + 1] is '\\' or '/') return -1;   // C:\ / C:/
                return k;
            }
            if (!(char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.' or '$' or '{' or '}')) return -1;
        }
        return -1;
    }

    /// <summary>"Authorization:", "'X-Api-Key:", "-HCookie:", "http.extraheader=\"AUTHORIZATION:" …</summary>
    private static bool EndsWithSecretLabel(string bare)
    {
        if (bare.Length < 2 || bare[^1] != ':') return false;
        var name = bare[..^1];
        var cut = name.LastIndexOfAny(['=', '"', '\'']);
        if (cut >= 0) name = name[(cut + 1)..];
        if (name.StartsWith("-H", StringComparison.Ordinal) && name.Length > 2) name = name[2..];
        if (name.Length == 0) return false;
        foreach (var h in SecretHeaders) if (name.Equals(h, StringComparison.OrdinalIgnoreCase)) return true;
        return IsSecretName(name);
    }

    private static bool IsAuthScheme(string bare)
    {
        foreach (var s in AuthSchemes) if (bare.Equals(s, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    /// <summary>
    /// Masks the value that starts at <paramref name="from"/> in word <paramref name="i"/>: to the end of the word (closing quotes and
    /// , ; ) kept), or, when the value opens a quote that the word does not close, through the word that closes it (≤ 16 words).
    /// </summary>
    private static void MaskValueFrom(List<Word> words, int i, int from, FlagValue how, ref State ctx)
    {
        var w = words[i].Text;
        if (from >= w.Length) return;
        var value = w[from..];
        var lead = 0;
        while (lead < value.Length && value[lead] is '"' or '\'') lead++;
        var quote = lead > 0 ? value[lead - 1] : '\0';
        if (quote != '\0' && value.IndexOf(quote, lead) < 0)
        {
            // A quoted secret with spaces: mask through the closing quote.
            var sb = new StringBuilder(value[lead..]);
            var end = -1;
            for (var j = i + 1; j < words.Count && j <= i + 16; j++)
            {
                sb.Append(words[j].Text);
                if (!words[j].IsSpace && words[j].Text.Contains(quote)) { end = j; break; }
            }
            if (end > 0)
            {
                var closing = words[end].Text;
                var q = closing.IndexOf(quote);
                var secret = sb.ToString();
                secret = secret[..(secret.Length - (closing.Length - q))];
                Note(secret, ref ctx);
                words[i].Text = w[..(from + lead)] + Mask;
                for (var k = i + 1; k < end; k++) words[k].Text = "";
                words[end].Text = closing[q..];
                return;
            }
        }
        var trail = 0;
        while (trail < value.Length - lead && value[value.Length - 1 - trail] is '"' or '\'' or '`' or ',' or ';' or ')' or '|' or '&') trail++;
        var core = value[lead..(value.Length - trail)];
        if (core.Length == 0) return;
        var keep = "";
        if (how == FlagValue.AfterColon && core.IndexOf(':') is var c and > 0) { keep = core[..(c + 1)]; core = core[(c + 1)..]; }
        else if (how == FlagValue.AfterPercent && core.IndexOf('%') is var p and > 0) { keep = core[..(p + 1)]; core = core[(p + 1)..]; }
        if (core.Length == 0) return;
        Note(core, ref ctx);
        words[i].Text = w[..(from + lead)] + keep + Mask + value[(value.Length - trail)..];
    }

    private static void Note(string secret, ref State ctx)
    {
        ctx.Masked++;
        if (IsActive(secret)) ctx.Active = true;
    }

    /// <summary>URL userinfo and secret query parameters, then secret-looking runs, within one word.</summary>
    private static string ScrubUrlsAndRuns(string w, ref State ctx)
    {
        var scheme = w.IndexOf("://", StringComparison.Ordinal);
        if (scheme > 0)
        {
            var start = scheme + 3;
            var authorityEnd = w.IndexOfAny(['/', '?', '#'], start);
            if (authorityEnd < 0) authorityEnd = w.Length;
            var at = authorityEnd > start ? w.LastIndexOf('@', authorityEnd - 1, authorityEnd - start) : -1;
            if (at > start)
            {
                Note(w[start..at], ref ctx);
                w = w[..start] + Mask + w[at..];
            }
            w = ScrubQuery(w, ref ctx);
        }
        return MaskRuns(w, ref ctx);
    }

    private static string ScrubQuery(string w, ref State ctx)
    {
        var q = w.IndexOfAny(['?', '#']);
        if (q < 0) return w;
        var sb = new StringBuilder(w.Length);
        sb.Append(w, 0, q + 1);
        var i = q + 1;
        while (i < w.Length)
        {
            var end = w.IndexOfAny(['&', '#', '?'], i);
            if (end < 0) end = w.Length;
            var pair = w[i..end];
            var eq = pair.IndexOf('=');
            if (eq > 0 && eq + 1 < pair.Length && IsSecretParam(pair[..eq]))
            {
                var value = pair[(eq + 1)..];
                var trail = 0;
                while (trail < value.Length && value[value.Length - 1 - trail] is '"' or '\'' or ')' or ',' or ';') trail++;
                if (value.Length - trail > 0)
                {
                    Note(value[..(value.Length - trail)], ref ctx);
                    pair = pair[..(eq + 1)] + Mask + value[(value.Length - trail)..];
                }
            }
            sb.Append(pair);
            if (end < w.Length) sb.Append(w[end]);
            i = end + 1;
        }
        return sb.ToString();
    }

    private static bool IsSecretParam(string name)
    {
        foreach (var p in UrlSecretParams) if (name.Equals(p, StringComparison.OrdinalIgnoreCase)) return true;
        return IsSecretName(name);
    }

    private static string MaskRuns(string word, ref State ctx)
    {
        StringBuilder? sb = null;
        var i = 0;
        while (i < word.Length)
        {
            if (!IsRunChar(word[i])) { sb?.Append(word[i]); i++; continue; }
            var j = i;
            while (j < word.Length && IsRunChar(word[j])) j++;
            var pad = 0;
            while (j + pad < word.Length && pad < 2 && word[j + pad] == '=') pad++;
            var run = word.AsSpan(i, j - i);
            if (IsSecretRun(run))
            {
                sb ??= new StringBuilder(word.Length).Append(word, 0, i);
                Note(word[i..(j + pad)], ref ctx);
                sb.Append(Mask);
                i = j + pad;
                continue;
            }
            sb?.Append(run);
            i = j;
        }
        return sb?.ToString() ?? word;
    }

    private static bool IsRunChar(char c) => char.IsAsciiLetterOrDigit(c) || c is '+' or '_' or '-';

    internal static bool IsSecretRun(ReadOnlySpan<char> run)
    {
        if (run.Length == 20 && AllUpperOrDigit(run))
            foreach (var p in AwsKeyPrefixes) if (run.StartsWith(p, StringComparison.Ordinal)) return true;
        foreach (var p in TokenPrefixes)
            if (run.StartsWith(p, StringComparison.Ordinal) && run.Length >= p.Length + 16) return true;
        if (run.Length >= 24)
        {
            var hex = true;
            foreach (var c in run) if (!char.IsAsciiHexDigit(c)) { hex = false; break; }
            if (hex) return true;
        }
        if (run.Length < 32) return false;
        bool digit = false, upper = false, lower = false;
        foreach (var c in run) { digit |= char.IsAsciiDigit(c); upper |= char.IsAsciiLetterUpper(c); lower |= char.IsAsciiLetterLower(c); }
        return digit && upper && lower;
    }

    private static bool AllUpperOrDigit(ReadOnlySpan<char> s)
    {
        foreach (var c in s) if (!(char.IsAsciiLetterUpper(c) || char.IsAsciiDigit(c))) return false;
        return true;
    }

    /// <summary>The word without surrounding quotes and , ; ( ) punctuation.</summary>
    private static string Bare(string w) => w.Trim('"', '\'', '`', ',', ';', '(', ')', '|', '&');

    /// <summary>Lower-case segments split on _ - . / and camelCase boundaries ("X-Api-Key" → x, api, key; "apiKey" → api, key).</summary>
    private static List<string> Segments(string name)
    {
        var list = new List<string>();
        var sb = new StringBuilder();
        for (var k = 0; k < name.Length; k++)
        {
            var c = name[k];
            if (!char.IsAsciiLetterOrDigit(c))
            {
                if (sb.Length > 0) { list.Add(sb.ToString()); sb.Clear(); }
                continue;
            }
            if (char.IsAsciiLetterUpper(c) && k > 0 && char.IsAsciiLetterLower(name[k - 1]) && sb.Length > 0) { list.Add(sb.ToString()); sb.Clear(); }
            sb.Append(char.ToLowerInvariant(c));
        }
        if (sb.Length > 0) list.Add(sb.ToString());
        return list;
    }
}
