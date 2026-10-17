using System.Text.Json.Serialization;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai;

/// <summary>
/// The global settings section <c>ai</c>. Preferences only: never secrets, never prompts, paths or titles
/// (global settings are plain text and travel with exported profiles).
/// </summary>
public sealed class AiSettings
{
    public const string Section = "ai";

    /// <summary>"private" (default: streamer-safe) or "reveal" (aliases, workspace basenames, bounded command summaries).</summary>
    public string Privacy { get; set; } = "private";
    /// <summary>The ON AIR key: forces Private whatever <see cref="Privacy"/> says.</summary>
    public bool OnAir { get; set; }
    /// <summary>Approve hold, seconds (clamped 0.8–3; default 1.2).</summary>
    public double ApproveHoldSeconds { get; set; } = 1.2;
    /// <summary>How long a request waits on the deck before the agent's own prompt takes over (clamped 10–55; default 30).</summary>
    public int RequestWindowSeconds { get; set; } = 30;
    /// <summary>"Away mode": deny (instead of no decision) when nobody answers in time. Off by default.</summary>
    public bool AwayDenyOnTimeout { get; set; }
    /// <summary>In Private mode, still hold requests so Deny works (Approve stays disabled). Off by default: private = fall through.</summary>
    public bool DenyOnlyInPrivate { get; set; }
    /// <summary>Best effort: also select the Windows Terminal tab by its title (UI Automation) after focusing the window.</summary>
    public bool SelectTerminalTab { get; set; } = true;
    /// <summary>Use Orca's CLI (when installed) for pane handles. Optional enrichment only.</summary>
    public bool OrcaEnrichment { get; set; } = true;
    /// <summary>Extra Claude config dirs to list (each gets its own claude agents call with CLAUDE_CONFIG_DIR).</summary>
    public List<string> ExtraClaudeConfigDirs { get; set; } = [];
    /// <summary>
    /// "Away" (review M5): no deck hold when nobody touched the PC or the deck for this many minutes (match the Stream Deck app's
    /// sleep timeout; default 10, 0 = never by idle time). A locked session always counts as away.
    /// </summary>
    public int AwayAfterMinutes { get; set; } = 10;

    [JsonIgnore] public bool IsPrivate => OnAir || !string.Equals(Privacy?.Trim(), "reveal", StringComparison.OrdinalIgnoreCase);
    [JsonIgnore] public PrivacyMode Mode => IsPrivate ? PrivacyMode.Private : PrivacyMode.Reveal;
    [JsonIgnore] public TimeSpan HoldDuration => TimeSpan.FromSeconds(Math.Clamp(double.IsFinite(ApproveHoldSeconds) ? ApproveHoldSeconds : 1.2, 0.8, 3.0));
    [JsonIgnore] public TimeSpan RequestWindow => TimeSpan.FromSeconds(Math.Clamp(RequestWindowSeconds, 10, 55));
    /// <summary>Zero = idle time never counts as away.</summary>
    [JsonIgnore] public TimeSpan AwayAfter => TimeSpan.FromMinutes(Math.Clamp(AwayAfterMinutes, 0, 120));
}

/// <summary>Reads the <c>ai</c> section once per change and hands out an immutable snapshot. Thread-safe.</summary>
public sealed class AiSettingsService
{
    private readonly IGlobalSettings? _globals;
    private AiSettings _current;

    public AiSettingsService(IGlobalSettings? globals)
    {
        _globals = globals;
        _current = Read();
        if (_globals is not null) _globals.Changed += (_, _) => Reload();
    }

    /// <summary>A fixed-settings service (tests, tools).</summary>
    public AiSettingsService(AiSettings fixedSettings)
    {
        _current = fixedSettings;
    }

    public AiSettings Current => Volatile.Read(ref _current);

    public event Action<AiSettings>? Changed;

    public void Reload()
    {
        var next = Read();
        Volatile.Write(ref _current, next);
        Changed?.Invoke(next);
    }

    /// <summary>Replaces the section (the ON AIR key, the PI). Raises <see cref="Changed"/>.</summary>
    public void Update(Func<AiSettings, AiSettings> change)
    {
        var next = change(Clone(Current));
        Volatile.Write(ref _current, next);
        _globals?.SetSection(AiSettings.Section, next);
        Changed?.Invoke(next);
    }

    private AiSettings Read() => _globals?.GetSection<AiSettings>(AiSettings.Section) ?? _current ?? new AiSettings();

    private static AiSettings Clone(AiSettings s) => new()
    {
        Privacy = s.Privacy,
        OnAir = s.OnAir,
        ApproveHoldSeconds = s.ApproveHoldSeconds,
        RequestWindowSeconds = s.RequestWindowSeconds,
        AwayDenyOnTimeout = s.AwayDenyOnTimeout,
        DenyOnlyInPrivate = s.DenyOnlyInPrivate,
        SelectTerminalTab = s.SelectTerminalTab,
        OrcaEnrichment = s.OrcaEnrichment,
        ExtraClaudeConfigDirs = [.. s.ExtraClaudeConfigDirs],
        AwayAfterMinutes = s.AwayAfterMinutes,
    };
}
