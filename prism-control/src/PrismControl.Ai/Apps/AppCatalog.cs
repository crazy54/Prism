namespace PrismControl.Ai.Apps;

/// <summary>
/// A native desktop AI app. Detected by image path or package family, never by a bare process name where it is ambiguous
/// (<c>claude.exe</c> is both Claude Desktop and the Claude Code CLI; <c>ChatGPT.exe</c> can be either ChatGPT app).
/// </summary>
public sealed record AppDef(
    string Id,
    string Name,
    string Short,
    // The camelCase id used in Smart Deck verb ids (<c>ai.app.claudeDesktop.open</c>).
    string VerbId,
    IReadOnlyList<string> ExeNames,
    // True when the exe name alone is enough (an unreadable image path still counts).
    bool NameIsUnique,
    // Path fragments one of which the image path must contain (case-insensitive). Empty = any path.
    IReadOnlyList<string> PathHints,
    string? Aumid,
    // A per-user exe path (environment variables allowed) for apps without an AUMID launch.
    string? ExePath,
    // A documented "new chat" deep link for a long-press (null: none documented).
    string? NewChatUri,
    // Chat apps have no supported "generating" signal: it stays unknown.
    bool IsChat,
    AppGlyph Glyph)
{
    public bool MatchesImage(string exeName, string? imagePath)
    {
        if (!ExeNames.Any(e => string.Equals(e, exeName, StringComparison.OrdinalIgnoreCase))) return false;
        if (imagePath is null) return NameIsUnique;
        if (PathHints.Count == 0) return true;
        var p = imagePath.Replace('/', '\\');
        return PathHints.Any(h => p.Contains(h, StringComparison.OrdinalIgnoreCase));
    }

    public string? ExpandedExePath => ExePath is null ? null : Environment.ExpandEnvironmentVariables(ExePath);
}

public enum AppGlyph { Bubble, Spark, Code, Sparkle }

/// <summary>The apps from research/ai-status.md §2.1 / ai-apps.md §4 (AUMIDs verified on this PC with Get-StartApps).</summary>
public static class AppCatalog
{
    public static readonly IReadOnlyList<AppDef> Apps =
    [
        new("claude-desktop", "Claude Desktop", "CLAUDE", "claudeDesktop", ["claude.exe"], false,
            [@"\WindowsApps\Claude_", @"\AnthropicClaude\"], "Claude_pzs8sxrjxfjjc!Claude", null, "claude://claude.ai/new", true, AppGlyph.Spark),
        new("chatgpt", "ChatGPT", "CHATGPT", "chatgpt", ["ChatGPT.exe"], false,
            [@"\WindowsApps\OpenAI."], "OpenAI.Codex_2p2nqsd0c76g0!App", null, "codex://new", true, AppGlyph.Bubble),
        new("copilot", "Copilot", "COPILOT", "copilot", ["mscopilot.exe", "Copilot.exe"], false,
            [@"\Microsoft\Copilot\", @"\WindowsApps\Microsoft.Copilot_"], "Microsoft.Copilot_8wekyb3d8bbwe!App", null, null, true, AppGlyph.Sparkle),
        new("vscode", "VS Code", "VS CODE", "vscode", ["Code.exe"], true, [], "Microsoft.VisualStudioCode",
            @"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe", null, false, AppGlyph.Code),
        new("cursor", "Cursor", "CURSOR", "cursor", ["Cursor.exe"], true, [], null, @"%LOCALAPPDATA%\Programs\cursor\Cursor.exe", null, false, AppGlyph.Code),
        new("gemini", "Gemini", "GEMINI", "gemini", ["Gemini.exe"], false, [@"\Google\Gemini\"], null,
            @"%LOCALAPPDATA%\Google\Gemini\Gemini.exe", null, true, AppGlyph.Sparkle),
    ];

    public static AppDef? Find(string? id) => Apps.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));

    public static AppDef? ForImage(string exeName, string? imagePath) => Apps.FirstOrDefault(a => a.MatchesImage(exeName, imagePath));

    /// <summary>Every exe name worth resolving an image path for.</summary>
    public static readonly IReadOnlySet<string> WatchedExes = Apps.SelectMany(a => a.ExeNames).ToHashSet(StringComparer.OrdinalIgnoreCase);
}
