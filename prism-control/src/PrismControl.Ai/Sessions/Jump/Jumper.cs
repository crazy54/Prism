using PrismControl.Ai.Platform;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Sessions.Jump;

public enum JumpOutcome
{
    /// <summary>The session's window is in front, and that is all we could target (or all there is).</summary>
    Focused,
    /// <summary>The Windows Terminal window is in front and the tab whose title matched was selected (best effort).</summary>
    TabSelected,
    /// <summary>The terminal window is in front; the tab could not be selected (no supported API): find it.</summary>
    FocusedFindTab,
    /// <summary>A vscode:// or codex:// link was opened; the app focuses the session itself.</summary>
    OpenedLink,
    /// <summary>Orca switched to the pane and its window was focused.</summary>
    OrcaPane,
    NoWindow,
    Refused,
    Elevated,
    SafeMode,
    NoSession,
}

public sealed record JumpResult(JumpOutcome Outcome)
{
    public bool Succeeded => Outcome is JumpOutcome.Focused or JumpOutcome.TabSelected or JumpOutcome.FocusedFindTab or JumpOutcome.OpenedLink or JumpOutcome.OrcaPane;

    /// <summary>A short key label (stroke font; caps).</summary>
    public string Label => Outcome switch
    {
        JumpOutcome.Focused => "FOCUSED",
        JumpOutcome.TabSelected => "TAB FOUND",
        JumpOutcome.FocusedFindTab => "FIND THE TAB",
        JumpOutcome.OpenedLink => "OPENED",
        JumpOutcome.OrcaPane => "PANE FOCUSED",
        JumpOutcome.NoWindow => "NO WINDOW",
        JumpOutcome.Refused => "BLOCKED",
        JumpOutcome.Elevated => "ADMIN WINDOW",
        JumpOutcome.SafeMode => "SAFE MODE",
        _ => "NO SESSION",
    };
}

/// <summary>
/// Press-to-jump without Orca (research/ai-status.md §1.7), in order:
/// <list type="number">
/// <item>a Claude Code session hosted by the VS Code extension → <c>vscode://anthropic.claude-code/open?session=&lt;id&gt;</c>;</item>
/// <item>a Codex thread in the ChatGPT app → <c>codex://threads/&lt;id&gt;</c>;</item>
/// <item>optional Orca enrichment: <c>orca terminal switch --terminal &lt;handle&gt;</c>, then the Orca window;</item>
/// <item>a terminal-hosted session: the window (the relay's console root owner, else the host process's top-level window,
/// else the first ancestor of the agent that owns one) is focused; for Windows Terminal, the tab whose title equals the
/// session name is then selected by UI Automation as a labeled best effort ("FIND THE TAB" otherwise).</item>
/// </list>
/// Safe mode: nothing is focused, opened or switched.
/// </summary>
public sealed class Jumper
{
    public const string TerminalWindowClass = "CASCADIA_HOSTING_WINDOW_CLASS";

    private readonly IWindowHost _windows;
    private readonly ITerminalTabSelector? _tabs;
    private readonly IUriOpener _uris;
    private readonly ICommandRunner _runner;
    private readonly IProcessTree _tree;
    private readonly Func<AiSettings> _settings;
    private readonly Func<string?> _orcaPath;
    private readonly Func<SessionKey, CancellationToken, Task<string?>>? _titleLookup;
    private readonly ILog _log;
    private readonly bool _safeMode;

    /// <param name="titleLookup">
    /// Fetches the session's current name for the tab match only (a fresh <c>claude agents --json</c>); the name is used as a
    /// match key in memory and never stored, shown or logged.
    /// </param>
    public Jumper(IWindowHost windows, ITerminalTabSelector? tabs, IUriOpener uris, ICommandRunner runner, IProcessTree tree,
        Func<AiSettings> settings, Func<string?> orcaPath, Func<SessionKey, CancellationToken, Task<string?>>? titleLookup, ILog log, bool safeMode)
    {
        _windows = windows;
        _tabs = tabs;
        _uris = uris;
        _runner = runner;
        _tree = tree;
        _settings = settings;
        _orcaPath = orcaPath;
        _titleLookup = titleLookup;
        _log = log;
        _safeMode = safeMode;
    }

    public async Task<JumpResult> JumpAsync(SessionView? s, CancellationToken ct)
    {
        if (s is null) return new(JumpOutcome.NoSession);
        if (_safeMode)
        {
            _log.Info($"[safe mode] would jump to session {s.Key} ({s.Host.Kind})");
            return new(JumpOutcome.SafeMode);
        }
        var settings = _settings();

        if (s.Key.Agent == AgentKind.Claude && s.Host.IsVsCodeExtension)
        {
            _uris.Open("vscode://anthropic.claude-code/open?session=" + Uri.EscapeDataString(s.Key.Id));
            return new(JumpOutcome.OpenedLink);
        }
        if (s.Key.Agent == AgentKind.Codex && s.Host.Kind == HostKind.ChatGpt)
        {
            _uris.Open("codex://threads/" + Uri.EscapeDataString(s.Key.Id));
            return new(JumpOutcome.OpenedLink);
        }

        // Review L3: the handle comes from the hook environment or Orca's own output; only an id-shaped one (no leading '-', so it
        // can never become a flag of the orca CLI) is ever passed on.
        if (settings.OrcaEnrichment && s.Orca?.TerminalHandle is { } handle && Ingress.HookEventParser.IsIdToken(handle) && _orcaPath() is { } orca)
        {
            var r = await _runner.RunAsync(new CommandSpec(orca, ["terminal", "switch", "--terminal", handle], TimeSpan.FromSeconds(2), 64 * 1024), ct).ConfigureAwait(false);
            if (r.Ok)
            {
                var orcaWindow = WindowOf(s.Host.Process?.Pid) ?? FirstAncestorWindow(s);
                if (orcaWindow is { } ow)
                {
                    var f = await _windows.FocusAsync(ow, ct).ConfigureAwait(false);
                    return f is FocusResult.Focused or FocusResult.AlreadyFocused or FocusResult.Restored ? new(JumpOutcome.OrcaPane) : Map(f);
                }
                return new(JumpOutcome.OrcaPane);
            }
            _log.Debug("orca terminal switch failed; focusing the window instead");
        }

        var hwnd = HostWindow(s);
        if (hwnd is not { } target) return new(JumpOutcome.NoWindow);
        var focus = await _windows.FocusAsync(target, ct).ConfigureAwait(false);
        if (focus is not (FocusResult.Focused or FocusResult.AlreadyFocused or FocusResult.Restored)) return Map(focus);

        var isTerminal = s.Host.Kind == HostKind.WindowsTerminal || _windows.ClassName(target) == TerminalWindowClass;
        if (!isTerminal) return new(JumpOutcome.Focused);
        if (!settings.SelectTerminalTab || _tabs is null || _titleLookup is null) return new(JumpOutcome.FocusedFindTab);
        var title = await _titleLookup(s.Key, ct).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(title)) return new(JumpOutcome.FocusedFindTab);
        var tab = await _tabs.TrySelectAsync(target, title, ct).ConfigureAwait(false);
        return tab is TabSelectResult.Selected or TabSelectResult.AlreadySelected ? new(JumpOutcome.TabSelected) : new(JumpOutcome.FocusedFindTab);
    }

    /// <summary>The window to focus for a terminal-hosted session (null when none can be found).</summary>
    public nint? HostWindow(SessionView s)
    {
        // 1. The relay's console window (ConPTY's pseudo window is owned by the terminal window; the relay sent its root owner).
        if (s.Host.ConsoleWindow != 0 && _windows.IsWindow(s.Host.ConsoleWindow))
        {
            var root = _windows.RootOwner(s.Host.ConsoleWindow);
            var w = root != 0 ? root : s.Host.ConsoleWindow;
            if (_windows.IsWindow(w)) return w;
        }
        // 2. The host process (WindowsTerminal.exe, Code.exe, idea64.exe, Orca.exe, ChatGPT.exe…): its top-level window.
        if (WindowOf(s.Host.Process?.Pid, s.Host.Kind == HostKind.WindowsTerminal ? TerminalWindowClass : null) is { } hw) return hw;
        // 3. Walk up from the agent process to the first ancestor that owns a window.
        return FirstAncestorWindow(s);
    }

    private nint? WindowOf(int? pid, string? preferClass = null)
    {
        if (pid is not { } p || p <= 0) return null;
        var windows = _windows.TopLevelWindows(p);
        if (windows.Count == 0) return null;
        if (preferClass is not null && windows.FirstOrDefault(w => _windows.ClassName(w) == preferClass) is { } preferred && preferred != 0) return preferred;
        return windows[0];
    }

    private nint? FirstAncestorWindow(SessionView s)
    {
        if (s.Process is not { } agent) return null;
        if (WindowOf(agent.Pid) is { } own) return own;
        foreach (var a in _tree.Ancestors(agent.Pid, 16))
        {
            if (a.Image.Equals("explorer.exe", StringComparison.OrdinalIgnoreCase)) break;
            if (WindowOf(a.Pid, a.Image.Equals("WindowsTerminal.exe", StringComparison.OrdinalIgnoreCase) ? TerminalWindowClass : null) is { } w) return w;
        }
        return null;
    }

    private static JumpResult Map(FocusResult f) => f switch
    {
        FocusResult.Elevated => new(JumpOutcome.Elevated),
        FocusResult.NoWindow => new(JumpOutcome.NoWindow),
        FocusResult.SafeMode => new(JumpOutcome.SafeMode),
        _ => new(JumpOutcome.Refused),
    };
}
