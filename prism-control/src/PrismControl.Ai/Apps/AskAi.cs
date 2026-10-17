using System.Globalization;
using System.Text;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;

namespace PrismControl.Ai.Apps;

public enum AskLinkKind
{
    /// <summary>A deep link the vendor documents as "pre-filled, not sent".</summary>
    Documented,
    /// <summary>Reverse-engineered (ms-copilot:), labeled as such.</summary>
    Unofficial,
    /// <summary>A web prefill (?q=) the vendor does not document: lands in the browser's address bar and history. Labeled.</summary>
    UndocumentedWeb,
}

/// <summary>
/// Where "Ask AI about this" sends the selection (ai-apps.md §2.1 #5, §7.4). Every link pre-fills; none sends.
/// <see cref="MaxChars"/> caps the selection in characters; <see cref="MaxLink"/> caps the whole ENCODED link (what really travels:
/// a non-ASCII character becomes 6–12 characters of percent-encoding). Windows command lines end at 32,767 characters, and the
/// app's registered handler adds its own exe path, so app links stay ≤ 30,000; links that pass through a terminal or a web
/// server get less.
/// </summary>
public sealed record AskTarget(string Id, string Name, string Short, string Prefix, int MaxChars, AskLinkKind Kind, string? Scheme, string? AppId, string Note,
    int MaxLink = AskTargets.AppLinkLimit)
{
    public bool IsWeb => Kind == AskLinkKind.UndocumentedWeb;
    public string KindLabel => Kind switch { AskLinkKind.Documented => "DEEP LINK", AskLinkKind.Unofficial => "UNOFFICIAL", _ => "WEB · UNDOCUMENTED" };
}

public static class AskTargets
{
    /// <summary>App deep links: below CreateProcess's 32,767-character command line, leaving room for the handler's exe path.</summary>
    public const int AppLinkLimit = 30_000;
    /// <summary>Links that open a terminal (claude-cli) or a web page: they are re-quoted or sent to a server, so keep them shorter.</summary>
    public const int ShortLinkLimit = 8_000;

    public static readonly IReadOnlyList<AskTarget> All =
    [
        new("claude-desktop", "Claude Desktop", "CLAUDE", "claude://claude.ai/new?q=", 14_000, AskLinkKind.Documented, "claude", "claude-desktop",
            "Documented deep link: opens a new Claude Desktop chat with the text filled in, not sent."),
        new("claude-code-desktop", "Claude Code (Desktop)", "CLAUDE CODE", "claude://code/new?q=", 14_000, AskLinkKind.Documented, "claude", "claude-desktop",
            "Documented deep link: a new Code session in Claude Desktop, text filled in, not sent."),
        new("claude-cli", "Claude Code (terminal)", "CLAUDE CLI", "claude-cli://open?q=", 5_000, AskLinkKind.Documented, "claude-cli", null,
            "Documented deep link: a new terminal with Claude Code and the text filled in (it warns \"Prompt from an external link\"). The text is visible in that process's command line.",
            ShortLinkLimit),
        new("chatgpt", "ChatGPT app", "CHATGPT", "codex://new?prompt=", 10_000, AskLinkKind.Documented, "codex", "chatgpt",
            "Documented deep link of the ChatGPT app (package OpenAI.Codex): text filled in, not sent."),
        new("vscode", "VS Code agent", "VS CODE", "vscode://agents/new?prompt=", 10_000, AskLinkKind.Documented, "vscode", "vscode",
            "Documented VS Code link: a new agent chat with the text as a draft, not sent."),
        new("cursor", "Cursor", "CURSOR", "cursor://anysphere.cursor-deeplink/prompt?text=", 10_000, AskLinkKind.Documented, "cursor", "cursor",
            "Documented Cursor deep link: fills the prompt, never runs it."),
        new("copilot", "Copilot", "COPILOT", "ms-copilot:chat?q=", 2_000, AskLinkKind.Unofficial, "ms-copilot", "copilot",
            "UNOFFICIAL (reverse-engineered) Copilot link; Microsoft may change it.", ShortLinkLimit),
        new("claude-web", "claude.ai (web)", "CLAUDE WEB", "https://claude.ai/new?q=", 2_000, AskLinkKind.UndocumentedWeb, null, null,
            "UNDOCUMENTED web prefill: the text goes into the browser's address bar and history.", ShortLinkLimit),
        new("chatgpt-web", "chatgpt.com (web)", "CHATGPT WEB", "https://chatgpt.com/?q=", 2_000, AskLinkKind.UndocumentedWeb, null, null,
            "UNDOCUMENTED web prefill: the text goes into the browser's address bar and history, and when you are signed out chatgpt.com has been reported to SEND it.",
            ShortLinkLimit),
    ];

    public static AskTarget? Find(string? id) => All.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Builds the link. The selection is capped to <paramref name="userCap"/> (≤ the target's MaxChars) whole characters, the
    /// template's {selection} is replaced (or the text appended), and then the ENCODED link is capped to the target's
    /// <see cref="AskTarget.MaxLink"/>: the selection loses whole characters (never half a surrogate pair, emoji or accent) until
    /// the percent-encoded link fits. Lone surrogates become U+FFFD first (they can't be encoded).
    /// </summary>
    public static string BuildLink(AskTarget t, string template, string selection, int userCap)
    {
        var cap = Math.Clamp(userCap, 100, t.MaxChars);
        var text = Cap(Sanitize(selection).Trim(), cap);
        var tpl = string.IsNullOrWhiteSpace(template) ? "{selection}" : Sanitize(template);
        string Prompt(string x) => Cap(tpl.Contains("{selection}", StringComparison.Ordinal) ? tpl.Replace("{selection}", x, StringComparison.Ordinal) : tpl.TrimEnd() + "\n\n" + x, t.MaxChars);
        var budget = t.MaxLink - t.Prefix.Length;
        var full = Uri.EscapeDataString(Prompt(text));
        if (full.Length <= budget) return t.Prefix + full;

        // Too long once encoded: keep the most whole characters of the selection that fit (binary search on text elements).
        var starts = StringInfo.ParseCombiningCharacters(text);
        int lo = 0, hi = starts.Length;   // number of text elements kept
        while (lo < hi)
        {
            var mid = (lo + hi + 1) / 2;
            var cut = mid < starts.Length ? starts[mid] : text.Length;
            if (Uri.EscapeDataString(Prompt(text[..cut])).Length <= budget) lo = mid; else hi = mid - 1;
        }
        var kept = lo < starts.Length ? text[..starts[lo]] : text;
        var encoded = Uri.EscapeDataString(Prompt(kept));
        // Even an empty selection is too long (a huge template): cap the prompt itself, element by element.
        if (encoded.Length > budget) encoded = EscapeWithin(Prompt(kept), budget);
        return t.Prefix + encoded;
    }

    /// <summary>The longest whole-character prefix of <paramref name="s"/> whose percent-encoding fits <paramref name="budget"/>, encoded.</summary>
    private static string EscapeWithin(string s, int budget)
    {
        var sb = new StringBuilder();
        var e = StringInfo.GetTextElementEnumerator(s);
        while (e.MoveNext())
        {
            var part = Uri.EscapeDataString((string)e.Current);
            if (sb.Length + part.Length > budget) break;
            sb.Append(part);
        }
        return sb.ToString();
    }

    /// <summary>At most <paramref name="max"/> UTF-16 units, cut between whole characters (text elements: never inside a surrogate pair, emoji sequence or accent).</summary>
    public static string Cap(string s, int max)
    {
        if (s.Length <= max) return s;
        var starts = StringInfo.ParseCombiningCharacters(s);
        var end = 0;
        for (var i = 0; i < starts.Length; i++)
        {
            var next = i + 1 < starts.Length ? starts[i + 1] : s.Length;
            if (next > max) break;
            end = next;
        }
        return s[..end];
    }

    /// <summary>Lone surrogates (invalid UTF-16, unencodable) become U+FFFD.</summary>
    internal static string Sanitize(string s)
    {
        StringBuilder? sb = null;
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            var bad = char.IsHighSurrogate(c) ? i + 1 >= s.Length || !char.IsLowSurrogate(s[i + 1]) : char.IsLowSurrogate(c) && (i == 0 || !char.IsHighSurrogate(s[i - 1]));
            if (bad) (sb ??= new StringBuilder(s, 0, i, s.Length)).Append('�');
            else sb?.Append(c);
        }
        return sb?.ToString() ?? s;
    }
}

public enum AskResult
{
    Opened,
    /// <summary>Opened, but the clipboard was NOT put back: something newer was copied meanwhile, and it is never clobbered.</summary>
    OpenedClipboardChanged,
    NothingSelected,
    Elevated,
    ClipboardBusy,
    TargetMissing,
    OnAirBlocked,
    NoForeground,
    /// <summary>The app in front is a terminal (Ctrl+C there interrupts the running program): select the text in an editor.</summary>
    InTerminal,
    SafeMode,
    Failed,
}

/// <summary>
/// "Ask AI about this": remember the app the user was in, save the clipboard, send Ctrl+C, wait for the clipboard to change,
/// read the text, restore the clipboard, then open the target with the text PRE-FILLED (never sent).
/// <list type="bullet">
/// <item>The selected text is never logged, stored, drawn on a key or kept after the link is opened.</item>
/// <item>If the clipboard can't be saved first, nothing is copied (the user's clipboard is never lost).</item>
/// <item>Never in a terminal (Windows Terminal, the console, mintty, …, or an editor whose keyboard focus is in its integrated
/// terminal): Ctrl+C there is SIGINT and would interrupt the program, an AI agent included (review A3). The key says
/// "SELECT TEXT IN AN EDITOR".</item>
/// <item>A slow copy: the fast path waits 400 ms, then keeps watching up to 2 s, so a late copy is still read and the clipboard
/// still put back. The clipboard is restored only if it still holds exactly our copy (the sequence number we saw after it):
/// anything newer the user or an app copied is never overwritten, and the key says so (review A4).</item>
/// <item>Elevated (admin) windows are refused (UIPI would drop the keystroke silently).</item>
/// <item>ON AIR (streamer-safe): web prefills (address bar + history) are blocked unless the user allowed them.</item>
/// <item>Safe mode: no keystroke, no clipboard access, no link.</item>
/// </list>
/// The copied selection passes through the clipboard like any copy: Windows clipboard history (Win+V) and the cloud clipboard
/// may keep it (only our restore is marked "no history"). The PI says so.
/// </summary>
public sealed class AskService(IForegroundService? foreground, IInputSender? input, IClipboard? clipboard, IAppProbe probe, Action<string> openUrl,
    Func<Ai2SettingsView> settings, ILog log, bool safeMode, Func<TimeSpan, CancellationToken, Task>? delay = null, ITerminalProbe? terminals = null)
{
    /// <summary>The fast path: most apps copy within this.</summary>
    public static readonly TimeSpan CopyWait = TimeSpan.FromMilliseconds(400);
    /// <summary>How long a slow copy is still awaited (then: nothing selected).</summary>
    public static readonly TimeSpan LateCopyWait = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan PollStep = TimeSpan.FromMilliseconds(20);
    /// <summary>After the first change, the clipboard must be quiet this long before we read it (an app may set several formats).</summary>
    public static readonly TimeSpan Settle = TimeSpan.FromMilliseconds(40);
    private readonly Func<TimeSpan, CancellationToken, Task> _delay = delay ?? ((t, ct) => Task.Delay(t, ct));
    private int _busy;

    public bool TargetAvailable(AskTarget t) => t.Scheme is null || probe.SchemeRegistered(t.Scheme);

    /// <summary>The kind of window <paramref name="hwnd"/> is (App when no probe is wired).</summary>
    public WindowHost HostOf(nint hwnd)
    {
        if (terminals is null || hwnd == 0) return WindowHost.App;
        var (exe, cls) = terminals.Describe(hwnd);
        return TerminalRules.Classify(exe, cls);
    }

    public async Task<(AskResult Result, int Chars)> AskAsync(AskTarget target, string template, int userCap, CancellationToken ct)
    {
        if (safeMode)
        {
            log.Info($"[safe mode] would copy the selection and open {target.Id} pre-filled");
            return (AskResult.SafeMode, 0);
        }
        var s = settings();
        if (target.IsWeb && s.OnAir && !s.WebTargetsOnAir) return (AskResult.OnAirBlocked, 0);
        if (!TargetAvailable(target)) return (AskResult.TargetMissing, 0);
        if (foreground is null || input is null || clipboard is null) return (AskResult.Failed, 0);
        if (Interlocked.Exchange(ref _busy, 1) == 1) return (AskResult.Failed, 0);
        try
        {
            var hwnd = foreground.LastExternalForeground;
            if (hwnd == 0) return (AskResult.NoForeground, 0);
            if (input.TargetIsElevated(hwnd)) return (AskResult.Elevated, 0);
            // Never Ctrl+C into a terminal: it is SIGINT there.
            var host = HostOf(hwnd);
            if (host == WindowHost.Terminal) return (AskResult.InTerminal, 0);
            if (foreground.GetForeground() != hwnd)
            {
                var r = await foreground.BringToFrontAsync(hwnd, ct).ConfigureAwait(false);
                if (r == ForegroundResult.Elevated) return (AskResult.Elevated, 0);
                if (!r.Succeeded()) return (AskResult.NoForeground, 0);
            }
            // An editor with integrated terminals: refuse while keyboard focus is in one (unknown = an ordinary editor pane).
            if (host == WindowHost.EditorWithTerminal && terminals is not null && await terminals.FocusInTerminalAsync(ct).ConfigureAwait(false) == true)
                return (AskResult.InTerminal, 0);

            var saved = await clipboard.SnapshotAsync(ct).ConfigureAwait(false);
            if (saved is null) return (AskResult.ClipboardBusy, 0);
            var before = clipboard.SequenceNumber();
            if (!await input.SendChordAsync([VirtualKey.Control, VirtualKey.C], ct).ConfigureAwait(false)) return (AskResult.Failed, 0);

            // Fast path 400 ms, then keep watching up to 2 s for a slow copy.
            var waited = TimeSpan.Zero;
            while (clipboard.SequenceNumber() == before && waited < LateCopyWait)
            {
                await _delay(PollStep, ct).ConfigureAwait(false);
                waited += PollStep;
            }
            if (clipboard.SequenceNumber() == before) return (AskResult.NothingSelected, 0);
            if (waited > CopyWait) log.Debug($"Ask AI: the copy took {waited.TotalMilliseconds:0} ms");
            // Let a multi-format copy finish (the sequence stops moving), within a short bound.
            var seen = clipboard.SequenceNumber();
            for (var i = 0; i < 10; i++)
            {
                await _delay(Settle, ct).ConfigureAwait(false);
                var now = clipboard.SequenceNumber();
                if (now == seen) break;
                seen = now;
            }

            var text = await clipboard.ReadTextAsync(ct).ConfigureAwait(false);
            var ours = clipboard.SequenceNumber();
            var restoreSkipped = false;
            if (s.RestoreClipboard)
            {
                // Put the user's clipboard back only if it still holds exactly our copy: never clobber something newer.
                if (ours == seen) await clipboard.RestoreAsync(saved, ct).ConfigureAwait(false);
                else
                {
                    restoreSkipped = true;
                    log.Info("Ask AI: the clipboard changed again before it could be restored; it was left alone");
                }
            }
            if (string.IsNullOrWhiteSpace(text)) return (AskResult.NothingSelected, 0);

            var link = AskTargets.BuildLink(target, template, text, userCap);
            var chars = Math.Min(text.Trim().Length, Math.Clamp(userCap, 100, target.MaxChars));
            text = null;
            openUrl(link);
            log.Info($"Ask AI: opened {target.Id} pre-filled ({chars} chars, not sent)");
            return (restoreSkipped ? AskResult.OpenedClipboardChanged : AskResult.Opened, chars);
        }
        finally { Volatile.Write(ref _busy, 0); }
    }
}

/// <summary>What <see cref="AskService"/> needs from the settings (AI1's ON AIR + AI2's preferences).</summary>
public sealed record Ai2SettingsView(bool OnAir, bool WebTargetsOnAir, bool RestoreClipboard);
