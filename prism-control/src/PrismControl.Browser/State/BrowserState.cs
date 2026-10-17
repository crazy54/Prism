using System.Collections.Immutable;
using PrismControl.Browser.Protocol;

namespace PrismControl.Browser.State;

/// <summary>What changed in a store update (subscribers re-render only what they show).</summary>
[Flags]
public enum BrowserChange
{
    None = 0,
    /// <summary>A browser connected, disconnected, re-identified or changed caps.</summary>
    Browsers = 1,
    Tabs = 2,
    Windows = 4,
    Groups = 8,
    Media = 16,
    Downloads = 32,
    Images = 64,
    Preview = 128,
    /// <summary>The effective privacy level, panic or streamer-safe auto mode.</summary>
    Privacy = 256,
    /// <summary>The SMTC lite-tier media changed.</summary>
    Smtc = 512,
    All = 0x3FF,
}

/// <summary>One connected (or recently lost) browser profile with the extension: everything its keys can show.</summary>
public sealed record BrowserInstance
{
    /// <summary>Stable within a run: "&lt;exe&gt;:&lt;profile uid&gt;" (e.g. "chrome:3f2a…"). Used by action settings.</summary>
    public required string Key { get; init; }
    /// <summary>Unique per pipe connection.</summary>
    public required string SessionId { get; init; }
    /// <summary>"Chrome", "Edge", "Brave"… (from the relay's parent exe, which is authoritative).</summary>
    public string Brand { get; init; } = "Browser";
    public string Exe { get; init; } = "";
    public int Pid { get; init; }
    public int Major { get; init; }
    public string ProfileUid { get; init; } = "default";
    public string ProfileLabel { get; init; } = "";
    public string ExtVersion { get; init; } = "";
    public BrowserCaps Caps { get; init; } = new();
    /// <summary>The stricter of what the extension reports and what the deck asked for.</summary>
    public string Privacy { get; init; } = Wire.Privacy.Full;
    /// <summary>The profile's own privacy choices (hello / state.full privacySettings); null from an older extension.</summary>
    public PrivacySettings? Settings { get; init; }
    public bool Connected { get; init; } = true;
    /// <summary>state.full arrived.</summary>
    public bool Synced { get; init; }
    /// <summary>Store clock (ms) of the connect / last focus / loss.</summary>
    public long ConnectedAt { get; init; }
    public long FocusedAt { get; init; }
    public long LostAt { get; init; }
    /// <summary>Extension clock minus ours (ms), from hello.at.</summary>
    public long ClockOffsetMs { get; init; }
    public int? FocusedWindowId { get; init; }
    public int? LastFocusedWindowId { get; init; }
    public ImmutableDictionary<int, BrowserTab> Tabs { get; init; } = ImmutableDictionary<int, BrowserTab>.Empty;
    public ImmutableDictionary<int, BrowserWindowInfo> Windows { get; init; } = ImmutableDictionary<int, BrowserWindowInfo>.Empty;
    public ImmutableDictionary<int, TabGroupInfo> Groups { get; init; } = ImmutableDictionary<int, TabGroupInfo>.Empty;
    public ImmutableDictionary<string, MediaItem> Media { get; init; } = ImmutableDictionary<string, MediaItem>.Empty;
    public ImmutableDictionary<int, DownloadItem> Downloads { get; init; } = ImmutableDictionary<int, DownloadItem>.Empty;

    public string DisplayName => ProfileLabel.Length > 0 ? $"{Brand} ({ProfileLabel})" : Brand;

    /// <summary>The window keys act on: the focused one, else the last focused, else the first normal window.</summary>
    public int? CurrentWindowId =>
        FocusedWindowId is { } f && Windows.ContainsKey(f) ? f
        : LastFocusedWindowId is { } l && Windows.ContainsKey(l) ? l
        : Windows.Values.Where(w => w.Type == "normal").OrderBy(w => w.Id).Select(w => (int?)w.Id).FirstOrDefault()
          ?? Tabs.Values.Select(t => (int?)t.WindowId).FirstOrDefault();

    public IEnumerable<BrowserTab> TabsInWindow(int windowId) => Tabs.Values.Where(t => t.WindowId == windowId).OrderBy(t => t.Index).ThenBy(t => t.Id);

    /// <summary>Every tab, windows in id order (current window first), tabs in strip order.</summary>
    public IEnumerable<BrowserTab> AllTabsOrdered()
    {
        var current = CurrentWindowId;
        return Tabs.Values.OrderBy(t => t.WindowId == current ? 0 : 1).ThenBy(t => t.WindowId).ThenBy(t => t.Index).ThenBy(t => t.Id);
    }

    public BrowserTab? ActiveTab(int? windowId = null)
    {
        var w = windowId ?? CurrentWindowId;
        return w is null ? null : Tabs.Values.FirstOrDefault(t => t.WindowId == w && t.Active);
    }
}

/// <summary>An immutable view of every browser plus the plugin-side privacy state. Read freely from any thread.</summary>
public sealed record BrowserSnapshot
{
    public static readonly BrowserSnapshot Empty = new();

    public ImmutableArray<BrowserInstance> Browsers { get; init; } = [];
    public long Version { get; init; }
    /// <summary>What the deck asks the extensions for (global setting, OBS auto-switch, panic).</summary>
    public string RequestedPrivacy { get; init; } = Wire.Privacy.Full;
    public bool Panic { get; init; }
    public bool StreamingDetected { get; init; }
    /// <summary>
    /// The SMTC lite tier: the browser media session Windows shows, ALREADY filtered at <see cref="SmtcMedia.Level"/> by the
    /// hub (the only place raw SMTC data is read). Shown only while <see cref="LiteTierActive"/>.
    /// </summary>
    public SmtcMedia? Smtc { get; init; }

    public bool AnyConnected => Browsers.Any(b => b.Connected);

    /// <summary>
    /// The lite tier is used only when no browser with the extension is known at all: not while one is connected, and not
    /// during a lost browser's reconnect grace (its keys say "reconnecting" instead, HIGH 1).
    /// </summary>
    public bool LiteTierActive => Browsers.IsDefaultOrEmpty && Smtc is not null;

    public BrowserInstance? Find(string key) => Browsers.FirstOrDefault(b => b.Key == key);

    /// <summary>
    /// Resolves a "browser" setting: "auto" = the most recently focused connected browser; "chrome"/"edge"/… = that
    /// family; anything else = an exact instance key. Recently lost browsers are returned only when nothing else matches,
    /// so keys can show "reconnecting" instead of "no browser".
    /// </summary>
    public BrowserInstance? Target(string? selector)
    {
        IEnumerable<BrowserInstance> pool = Browsers;
        var s = (selector ?? "auto").Trim().ToLowerInvariant();
        if (s is not ("" or "auto"))
        {
            pool = s switch
            {
                "chrome" => pool.Where(b => b.Exe.Equals("chrome.exe", StringComparison.OrdinalIgnoreCase)),
                "edge" => pool.Where(b => b.Exe.Equals("msedge.exe", StringComparison.OrdinalIgnoreCase)),
                "brave" => pool.Where(b => b.Exe.Equals("brave.exe", StringComparison.OrdinalIgnoreCase)),
                "vivaldi" => pool.Where(b => b.Exe.Equals("vivaldi.exe", StringComparison.OrdinalIgnoreCase)),
                "opera" => pool.Where(b => b.Exe.Equals("opera.exe", StringComparison.OrdinalIgnoreCase)),
                _ => pool.Where(b => b.Key.Equals(s, StringComparison.OrdinalIgnoreCase)),
            };
        }
        var list = pool.ToList();
        return list.Where(b => b.Connected).OrderByDescending(b => b.FocusedAt).ThenByDescending(b => b.ConnectedAt).FirstOrDefault()
            ?? list.OrderByDescending(b => b.LostAt).FirstOrDefault();
    }
}

/// <summary>
/// The SMTC view of a browser's media session: one per browser app, no tab identity, read-only. <see cref="Media"/> and
/// <see cref="ThumbnailId"/> are already filtered at <see cref="Level"/> (the thumbnail is null unless the level is full).
/// </summary>
public sealed record SmtcMedia(string AppId, string Brand, MediaItem Media, string? ThumbnailId, string Level = Wire.Privacy.Full);
