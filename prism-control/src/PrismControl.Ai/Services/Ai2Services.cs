using PrismControl.Ai.Apps;
using PrismControl.Ai.Services.StatusPages;
using PrismControl.Ai.Services.Usage;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Services;

/// <summary>
/// Everything AI2's actions and verbs share, registered once by <see cref="ServicesFeatures.Register"/>
/// (actions: <c>Services.Get&lt;Ai2Services&gt;()</c>). Tests build one from fakes. Thread-safe members only.
/// </summary>
public sealed class Ai2Services
{
    public required Ai2SettingsService Settings { get; init; }
    public required HealthService Health { get; init; }
    public required CodexLimitsService Codex { get; init; }
    public required BedrockUsageService Bedrock { get; init; }
    public required AdminUsageService Admin { get; init; }
    public required AppMonitor Apps { get; init; }
    public required IAppLauncher Launcher { get; init; }
    public required AskService Ask { get; init; }
    public required DictationService Dictation { get; init; }
    public required TimeProvider Time { get; init; }
    public required ILog Log { get; init; }
    public bool SafeMode { get; init; }
    /// <summary>The AWS CLI port (only located, never run, by the PI's opt-in check).</summary>
    public IAwsCli? AwsCli { get; init; }
    /// <summary>The clipboard (the PI's "save key from clipboard"); null when there is no shell thread.</summary>
    public IClipboard? Clipboard { get; init; }
    /// <summary>AI1's ON AIR / Private state (streamer-safe). False when the AI1 half is absent.</summary>
    public Func<bool> OnAir { get; init; } = () => false;
    /// <summary>Opens a status page or deep link through the Stream Deck app. Guarded: safe mode logs instead.</summary>
    public required Action<string> OpenUrl { get; init; }

    public event Action? Changed;

    internal void RaiseChanged() => Changed?.Invoke();

    /// <summary>Opens <paramref name="url"/> unless in safe mode. Returns whether it was opened.</summary>
    public bool Open(string url)
    {
        if (SafeMode)
        {
            Log.Info($"[safe mode] would open a {url.Split(':', 2)[0]} link");
            return false;
        }
        OpenUrl(url);
        return true;
    }
}
