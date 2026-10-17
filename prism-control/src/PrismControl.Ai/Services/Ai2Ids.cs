namespace PrismControl.Ai.Services;

/// <summary>
/// AI2's action UUIDs (prefix com.jeremyfhall.prismcontrol.ai.) and asset paths. Never change a UUID after release.
/// Icons live in plugin/imgs/actions/ai/&lt;id&gt;/{icon,key}.svg next to AI1's.
/// </summary>
public static class Ai2Ids
{
    public const string Prefix = "com.jeremyfhall.prismcontrol.ai.";
    public const string Health = Prefix + "health";
    public const string HealthStrip = Prefix + "healthstrip";
    public const string Usage = Prefix + "usage";
    public const string Ops = Prefix + "ops";
    public const string App = Prefix + "app";
    public const string Ask = Prefix + "ask";
    public const string Dictate = Prefix + "dictate";

    public static readonly IReadOnlyList<string> All = [Health, HealthStrip, Usage, Ops, App, Ask, Dictate];

    /// <summary>The short ids (folder names under imgs/actions/ai).</summary>
    public static readonly IReadOnlyList<string> Short = ["health", "healthstrip", "usage", "ops", "app", "ask", "dictate"];

    public static string Icon(string id) => $"imgs/actions/ai/{id}/icon";
    public static string Key(string id) => $"imgs/actions/ai/{id}/key";
}
