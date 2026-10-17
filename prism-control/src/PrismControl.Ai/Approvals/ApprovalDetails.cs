using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Ai.Ingress;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Render;
using PrismShared;

namespace PrismControl.Ai.Approvals;

/// <summary>One scalar tool argument of an MCP / unknown tool, as the relay revealed it (strings already masked).</summary>
public sealed record RevealArg(string Key, JsonValueKind Kind, string Value);

/// <summary>
/// The command summary the relay sends only after <c>reveal:true</c> (frame 3, protocol v2: aaa-prism-play/ai-fix/NOTES.md),
/// re-validated and re-scrubbed here. Whatever the relay could not capture whole is flagged, never silently dropped (review H1).
/// A version-1 summary (an old relay) carries no completeness flags and is never complete.
/// </summary>
public sealed record RevealSummary
{
    public int Version { get; init; } = 2;
    public string? Tool { get; init; }
    /// <summary>How the relay read tool_input: "complete", or "cut" / "ambiguous" / "absent" / "not_object" / "too_many".</summary>
    public string? Input { get; init; }
    public string? Command { get; init; }
    public bool CommandIncomplete { get; init; }
    public long CommandLength { get; init; }
    /// <summary>Workspace-relative (<see cref="FileInWorkspace"/> true) or the full path (false).</summary>
    public string? File { get; init; }
    public bool? FileInWorkspace { get; init; }
    public bool FileIncomplete { get; init; }
    public string? Url { get; init; }
    public string? Host { get; init; }
    public bool UrlIncomplete { get; init; }
    public IReadOnlyList<RevealArg>? Args { get; init; }
    public bool ArgsIncomplete { get; init; }
    public int Masked { get; init; }
    /// <summary>A mask hid shell-active text (<c>API_KEY=$(curl …)</c>): never approvable from the deck.</summary>
    public bool MaskedActive { get; init; }

    /// <summary>Frame 3 → a summary, scrubbed and bounded again here (the relay is not trusted to have done it). Null when malformed.</summary>
    public static RevealSummary? FromFrame(JsonObject frame)
    {
        if (HookEventParser.Str(frame["t"], 16) != "reveal" || frame["summary"] is not JsonObject s) return null;
        var version = HookEventParser.Int(frame["v"]) ?? 1;
        var masked = 0;
        var active = false;
        string? Scrub(string? text)
        {
            if (text is null) return null;
            var r = SecretScrubber.Scrub(text);
            masked += r.Masked;
            active |= r.MaskedActive;
            return r.Text;
        }
        static string? Raw(JsonNode? n, int max) => n is JsonValue v && v.TryGetValue<string>(out var t) && t.Length <= max ? t : null;
        static bool Flag(JsonNode? n) => HookEventParser.Bool(n) == true;

        if (version < 2)
        {
            // A legacy relay: a collapsed ≤ 120-char command, a basename, a host. Shown as "details hidden", never approvable.
            return new RevealSummary
            {
                Version = 1,
                Tool = HookEventParser.Str(s["tool"], 128),
                Command = HookEventParser.Str(s["command"], 1024) is { } c ? Privacy.Scrub(c, 120) : null,
                File = Privacy.FileBaseName(HookEventParser.Str(s["file"], 260)),
                Host = Privacy.UrlHost(HookEventParser.Str(s["host"], 260)),
            };
        }

        // Raw strings: newlines, tabs and odd characters are KEPT so the display policy can render or refuse them (an over-long
        // field is not cut: it counts as incomplete).
        var command = Raw(s["command"], 1024);
        var file = Raw(s["file"], 1024);
        var url = Raw(s["url"], 1024);
        var args = new List<RevealArg>();
        var argsIncomplete = Flag(s["args_incomplete"]);
        if (s["args"] is JsonArray arr)
        {
            foreach (var item in arr.Take(17))
            {
                if (item is not JsonArray pair || pair.Count != 2 || Raw(pair[0], 64) is not { Length: > 0 } key) { argsIncomplete = true; continue; }
                switch (pair[1])
                {
                    case null: args.Add(new RevealArg(key, JsonValueKind.Null, "null")); break;
                    case JsonValue v when v.TryGetValue<string>(out var str):
                        if (str.Length > 256) { argsIncomplete = true; break; }
                        args.Add(new RevealArg(key, JsonValueKind.String, SecretScrubber.IsSecretName(key) && str.Length > 0 && str != SecretScrubber.Mask ? SecretScrubber.Mask : Scrub(str)!));
                        break;
                    case JsonValue v when v.TryGetValue<bool>(out var b): args.Add(new RevealArg(key, b ? JsonValueKind.True : JsonValueKind.False, b ? "true" : "false")); break;
                    case JsonValue v when v.GetValueKind() == JsonValueKind.Number:
                        var num = v.ToJsonString();
                        if (num.Length > 64) { argsIncomplete = true; break; }
                        args.Add(new RevealArg(key, JsonValueKind.Number, num));
                        break;
                    default: argsIncomplete = true; break;
                }
            }
            if (arr.Count > 16) argsIncomplete = true;
        }
        var scope = HookEventParser.Str(s["file_scope"], 16);
        return new RevealSummary
        {
            Version = version,
            Tool = HookEventParser.Str(s["tool"], 128),
            Input = HookEventParser.Str(s["input"], 16),
            Command = Scrub(command),
            CommandIncomplete = Flag(s["command_incomplete"]) || (s["command"] is not null && command is null),
            CommandLength = HookEventParser.Long(s["command_length"]) ?? 0,
            File = Scrub(file),
            FileInWorkspace = scope switch { "workspace" => true, "outside" => false, _ => null },
            FileIncomplete = Flag(s["file_incomplete"]) || (s["file"] is not null && file is null),
            Url = Scrub(url),
            Host = Privacy.UrlHost(HookEventParser.Str(s["host"], 260)),
            UrlIncomplete = Flag(s["url_incomplete"]) || (s["url"] is not null && url is null),
            Args = s["args"] is JsonArray ? args : null,
            ArgsIncomplete = argsIncomplete,
            Masked = Math.Max(masked, HookEventParser.Int(s["masked"]) ?? 0),
            MaskedActive = active || Flag(s["masked_active"]),
        };
    }
}

/// <summary>Why the details of a request cannot be fully and faithfully shown (lead decision 1). Each one locks Approve.</summary>
public enum DetailsLock
{
    None,
    /// <summary>No summary (yet), or Private mode.</summary>
    Hidden,
    /// <summary>Something that will run was not captured whole: an oversize / non-string / cut command, a truncated or unparsed
    /// stdin, nested MCP arguments, a mask over shell-active text, an old relay. "REVIEW IN TERMINAL".</summary>
    Incomplete,
    /// <summary>Unicode format characters (bidi, zero-width, BOM, ALM), control characters, odd spaces, or scripts the deck can't
    /// show unambiguously. "UNUSUAL CHARACTERS".</summary>
    Unusual,
    /// <summary>Complete, but it does not fit the surface (measured, never counted). "TOO LONG".</summary>
    TooLong,
}

/// <summary>What a details surface must show for a request: the exact text, and the flag line (e.g. "OUTSIDE WORKSPACE").</summary>
public sealed record DetailsPlan(string Text, DetailsLock Lock, string? Flag)
{
    public static readonly DetailsPlan Hidden = new("", DetailsLock.Hidden, null);
}

/// <summary>
/// The approval display policy (lead decision 1, reviews H1 / M1 / M3 / L2). "Complete" is decided per tool category:
/// <list type="bullet">
/// <item>shell tools (Bash, PowerShell, Codex shell/exec): the whole command, nothing dropped;</item>
/// <item>file tools (Write, Edit, MultiEdit, NotebookEdit, Read …): the workspace-relative path, or the full path with an
/// "OUTSIDE WORKSPACE" flag;</item>
/// <item>fetch tools (WebFetch): the full URL with its path and query (secrets masked, never truncated);</item>
/// <item>MCP and every other tool: the tool name and its scalar <c>key=value</c> arguments, all of them, or nothing.</item>
/// </list>
/// Any stdin truncation / unparsed payload / incomplete flag → <see cref="DetailsLock.Incomplete"/>; Unicode format, control and
/// other unusual characters → <see cref="DetailsLock.Unusual"/> (refused, never stripped); line breaks are drawn as " ⏎ " and tabs
/// as "⇥". Whether the text then FITS is the surface's measured question (<see cref="CardFit"/>, <see cref="KeyFit"/>).
/// </summary>
public static class ApprovalText
{
    public const string LineBreak = " ⏎ ";
    public const string Tab = "⇥";
    /// <summary>Starts a line that continues the previous one mid-word (a break at a space shows no marker: the space is implied).</summary>
    public const string Continuation = "→";

    public enum Kind { Shell, File, Url, Args }

    private static readonly HashSet<string> FileTools = new(StringComparer.OrdinalIgnoreCase)
    {
        "write", "edit", "multiedit", "notebookedit", "read", "write_file", "read_file", "edit_file", "str_replace", "replace", "view",
    };

    private static readonly HashSet<string> UrlTools = new(StringComparer.OrdinalIgnoreCase) { "webfetch", "web_fetch", "fetch" };

    public static Kind KindOf(string? toolName, ToolCategory category)
    {
        if (toolName is not null && toolName.StartsWith("mcp__", StringComparison.OrdinalIgnoreCase)) return Kind.Args;
        if (category == ToolCategory.Bash) return Kind.Shell;
        if (toolName is not null && FileTools.Contains(toolName)) return Kind.File;
        if (toolName is not null && UrlTools.Contains(toolName)) return Kind.Url;
        return Kind.Args;
    }

    /// <summary>The plan for one request (Reveal mode; <paramref name="inputIncomplete"/>: frame 1 said stdin was cut or unparsed).</summary>
    public static DetailsPlan Plan(string? toolName, ToolCategory category, RevealSummary? s, bool inputIncomplete)
    {
        if (s is null) return DetailsPlan.Hidden;
        if (s.Version < 2 || inputIncomplete || s.Input != "complete" || s.MaskedActive) return new("", DetailsLock.Incomplete, null);
        var tool = toolName ?? s.Tool;
        string raw;
        string? flag = null;
        switch (KindOf(tool, category))
        {
            case Kind.Shell:
                if (s.CommandIncomplete || s.Command is null) return new("", DetailsLock.Incomplete, null);
                raw = s.Command;
                break;
            case Kind.File:
                if (s.FileIncomplete || s.File is null || s.FileInWorkspace is null) return new("", DetailsLock.Incomplete, null);
                // A "workspace" path must look relative, an "outside" one absolute: anything else is not trusted as shown.
                if (s.FileInWorkspace == true && LooksAbsolute(s.File)) return new("", DetailsLock.Incomplete, null);
                raw = s.File;
                if (s.FileInWorkspace == false) flag = "OUTSIDE WORKSPACE";
                break;
            case Kind.Url:
                if (s.UrlIncomplete || s.Url is null) return new("", DetailsLock.Incomplete, null);
                raw = s.Url;
                break;
            default:
                if (s.ArgsIncomplete || s.Args is null || string.IsNullOrEmpty(tool)) return new("", DetailsLock.Incomplete, null);
                var sb = new StringBuilder(tool);
                foreach (var a in s.Args)
                {
                    if (!IsArgKey(a.Key)) return new("", DetailsLock.Unusual, null);
                    sb.Append(' ').Append(a.Key).Append('=').Append(a.Kind == JsonValueKind.String ? QuoteArg(a.Value) : a.Value);
                }
                raw = sb.ToString();
                break;
        }
        return Visible(raw) is { } text ? new(text, DetailsLock.None, flag) : new("", DetailsLock.Unusual, null);
    }

    /// <summary>
    /// The text as drawn: "\n" / "\r\n" → " ⏎ ", "\t" → "⇥"; null when it holds anything the deck must not render (it is refused,
    /// never stripped): control characters (a lone "\r" too), Unicode format characters (bidi isolates/overrides U+2066–2069,
    /// U+202A–202E, U+200E/F, zero-width U+200B–200D, U+2060, BOM U+FEFF, ALM U+061C, soft hyphen …), separators other than the
    /// ASCII space, surrogates (emoji), and every character outside printable ASCII and the Latin letters U+00C0–U+017F (minus the
    /// look-alikes × ÷ ı ĸ ŉ ſ).
    /// </summary>
    public static string? Visible(string raw)
    {
        var sb = new StringBuilder(raw.Length + 8);
        for (var i = 0; i < raw.Length; i++)
        {
            var c = raw[i];
            if (c == '\r')
            {
                if (i + 1 < raw.Length && raw[i + 1] == '\n') { sb.Append(LineBreak); i++; continue; }
                return null;
            }
            if (c == '\n') { sb.Append(LineBreak); continue; }
            if (c == '\t') { sb.Append(Tab); continue; }
            if (!IsShowable(c)) return null;
            sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>The characters the deck may draw as they are.</summary>
    public static bool IsShowable(char c)
    {
        if (c is >= ' ' and <= '~') return true;
        if (c == '•') return true;   // the mask "•••"
        if (c is >= 'À' and <= 'ſ' && c is not ('×' or '÷' or 'ı' or 'ĸ' or 'ŉ' or 'ſ'))
            return CharUnicodeInfo.GetUnicodeCategory(c) is UnicodeCategory.UppercaseLetter or UnicodeCategory.LowercaseLetter;
        return false;
    }

    private static bool IsArgKey(string key) => key.Length is >= 1 and <= 64 && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.');

    /// <summary>A string argument as key="…" when it is empty or holds a space, '=', a quote or a backslash; else as it is.</summary>
    internal static string QuoteArg(string v) =>
        v.Length > 0 && !v.Any(c => c is ' ' or '=' or '"' or '\'' or '\\' or '\t' or '\n' or '\r') ? v : "\"" + v.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";

    private static bool LooksAbsolute(string p) => p.Length >= 2 && (p[1] == ':' || p[0] is '\\' or '/' || p.StartsWith('~'));

    /// <summary>The Approve key / card label for a lock.</summary>
    public static string Label(DetailsLock l) => l switch
    {
        DetailsLock.Incomplete => "REVIEW IN TERMINAL",
        DetailsLock.Unusual => "UNUSUAL CHARACTERS",
        DetailsLock.TooLong => "TOO LONG TO SHOW",
        DetailsLock.Hidden => "DETAILS HIDDEN",
        _ => "",
    };

    /// <summary>
    /// Greedy wrap into at most <paramref name="maxLines"/> lines that each fit <paramref name="fits"/>. A break at a space consumes
    /// that one space (it is implied, as in any wrapped text); a break inside a word starts the next line with
    /// <see cref="Continuation"/>. Complete only when nothing is left over.
    /// </summary>
    public static (IReadOnlyList<string> Lines, bool Complete) Wrap(string text, int maxLines, Func<string, bool> fits)
    {
        var lines = new List<string>();
        var rest = text;
        var marker = "";
        while (rest.Length > 0 && lines.Count < maxLines)
        {
            // The longest prefix that fits (with the marker).
            int lo = 0, hi = rest.Length;
            while (lo < hi)
            {
                var mid = (lo + hi + 1) / 2;
                if (fits(marker + rest[..mid])) lo = mid; else hi = mid - 1;
            }
            var n = lo;
            if (n >= rest.Length) { lines.Add(marker + rest); rest = ""; break; }
            if (n == 0) return (lines, false);
            if (char.IsHighSurrogate(rest[n - 1])) n--;
            var sp = rest.LastIndexOf(' ', n);   // a space at index n itself may be consumed
            // Never leave a trailing space on a line (it would be invisible): break at the first space of a run, so any extra
            // spaces start the next line, visibly.
            while (sp > 0 && rest[sp - 1] == ' ') sp--;
            if (sp > 0)
            {
                lines.Add(marker + rest[..sp]);
                rest = rest[(sp + 1)..];
                marker = "";
            }
            else
            {
                lines.Add(marker + rest[..n]);
                rest = rest[n..];
                marker = Continuation;
            }
        }
        return (lines, rest.Length == 0);
    }
}

/// <summary>
/// The approval card's native text lines (layouts/ai-card.json: three items, size 12, weight 600, 180 units wide, rendered by the
/// Stream Deck app in its system font). The fit is MEASURED (review M2), with a conservative worst-case advance per character:
/// the largest advance of that character among the plausible UI fonts at a bold-or-heavier weight (Segoe UI Regular /
/// Semibold / Bold, Arial Bold, Tahoma Bold, Microsoft Sans Serif Bold; measured with GDI at a 1000-px em on 2026-10-17,
/// aaa-prism-play/ai-fix/fontprobe), plus 0.05 em per character for hinting and rounding, against 176 of the 180 units. Characters
/// outside the table count as 1.2 em. Lab L15 can tighten this on hardware; until then long commands lock Approve ("TOO LONG").
/// </summary>
public static class CardFit
{
    public const int Lines = 3;
    public const double FontSize = 12;
    public const double LineWidth = 180;
    public const double Usable = 176;
    public const double PerCharSlackEm = 0.05;
    public const double UnknownEm = 1.2;

    // Advance widths in thousandths of an em (max over the fonts above), U+0020–U+007E.
    private static readonly ushort[] Ascii =
    [
        293, 343, 493, 818, 637, 1199, 850, 293, 454, 454, 637, 818, 313, 431, 313, 577, 637, 637, 637, 637, 637, 637, 637, 637, 637, 637, 363, 363, 818, 818,
        818, 611, 1016, 722, 722, 723, 757, 668, 612, 779, 766, 483, 556, 722, 611, 957, 790, 779, 668, 779, 726, 668, 612, 739, 675, 1028, 685, 670, 623, 454,
        577, 454, 818, 637, 546, 599, 632, 556, 629, 594, 383, 629, 640, 302, 363, 603, 302, 954, 640, 617, 629, 629, 434, 556, 416, 640, 579, 890, 605, 576,
        526, 623, 637, 623, 818,
    ];

    // U+00C0–U+017F.
    private static readonly ushort[] Latin =
    [
        722, 722, 722, 722, 722, 722, 1001, 723, 668, 668, 668, 668, 483, 483, 483, 483, 774, 790, 779, 779, 779, 779, 779, 818, 779, 739, 739, 739, 739, 670,
        668, 646, 599, 599, 599, 599, 599, 599, 937, 556, 594, 594, 594, 594, 302, 302, 302, 302, 620, 640, 617, 617, 617, 617, 617, 818, 617, 640, 640, 640,
        640, 576, 629, 576, 722, 599, 722, 599, 722, 599, 723, 556, 723, 556, 723, 556, 723, 556, 757, 817, 774, 632, 668, 594, 668, 594, 668, 594, 668, 594,
        668, 594, 779, 629, 779, 629, 779, 629, 779, 629, 766, 640, 782, 635, 483, 302, 483, 302, 483, 302, 483, 302, 483, 302, 940, 648, 556, 363, 722, 603,
        603, 611, 302, 611, 302, 611, 490, 611, 487, 611, 335, 790, 640, 790, 640, 790, 640, 742, 790, 640, 779, 617, 779, 617, 779, 617, 1037, 985, 726, 434,
        726, 434, 726, 434, 668, 556, 668, 556, 668, 556, 668, 556, 612, 416, 612, 619, 612, 416, 739, 640, 739, 640, 739, 640, 739, 640, 739, 640, 739, 640,
        1028, 890, 670, 576, 670, 623, 526, 623, 526, 623, 526, 322,
    ];

    /// <summary>The worst-case advance of one character, in em.</summary>
    public static double AdvanceEm(char c)
    {
        if (c is >= ' ' and <= '~') return Ascii[c - ' '] / 1000.0;
        if (c is >= 'À' and <= 'ſ') return Latin[c - 'À'] / 1000.0;
        return c switch
        {
            '•' => 0.7,                       // •
            '⏎' or '⇥' or '→' => 1.1, // ⏎ ⇥ →
            _ => UnknownEm,
        };
    }

    /// <summary>The worst-case width of <paramref name="text"/> at <paramref name="size"/> (layout units).</summary>
    public static double Measure(string text, double size = FontSize)
    {
        double em = 0;
        foreach (var c in text) em += AdvanceEm(c) + PerCharSlackEm;
        return em * size;
    }

    public static bool FitsLine(string line) => Measure(line) <= Usable;

    /// <summary>The card's lines for a plan: complete only when the whole text fits the three lines.</summary>
    public static (IReadOnlyList<string> Lines, bool Complete) Lay(string text) => ApprovalText.Wrap(text, Lines, FitsLine);
}

/// <summary>
/// The details key (keys-only decks): our own stroke font, so the measure is exact. Two lines of 122 units at size 15. Line
/// breaks / tabs are not drawable there (the stroke font has no ⏎ ⇥), and characters it can't draw would be boxes: both
/// count as not fitting. Lowercase letters are small capitals (distinct from capitals by height).
/// </summary>
public static class KeyFit
{
    public const int Lines = 2;
    public const double Size = 15, Width = 122;

    public static bool FitsLine(string line) => StrokeFont.Measure(line, Size, FontWeight.Medium) <= Width;

    public static (IReadOnlyList<string> Lines, bool Complete) Lay(string text)
    {
        if (text.Contains('⏎') || text.Contains('⇥') || !StrokeFont.Supports(text)) return ([], false);
        return ApprovalText.Wrap(text, Lines, FitsLine);
    }
}
