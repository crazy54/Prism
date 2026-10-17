using System.Collections.Immutable;

namespace PrismControl.Browser.Protocol;

/// <summary>One browser tab (research §9.3 Tab). Strings are already capped and cleaned; titles/URLs are null when hidden.</summary>
public sealed record BrowserTab
{
    public required int Id { get; init; }
    public int WindowId { get; init; }
    public int Index { get; init; }
    public bool Active { get; init; }
    public bool Pinned { get; init; }
    public bool Audible { get; init; }
    public bool Muted { get; init; }
    public string? Title { get; init; }
    public string? Url { get; init; }
    /// <summary>The registrable domain (eTLD+1, e.g. <c>chat.example</c> for app.chat.example) at every level but hidden.</summary>
    public string? Domain { get; init; }
    /// <summary>The page's host name (<c>app.chat.example</c>): only at level full (PROTOCOL.md §6.2), else null.</summary>
    public string? Host { get; init; }
    /// <summary>Unread count parsed by the extension: a number, -1 for "activity, no count", null for none.</summary>
    public int? Unread { get; init; }
    public string Status { get; init; } = "complete";
    public bool Discarded { get; init; }
    public bool Frozen { get; init; }
    /// <summary>Tab group id, -1 for none.</summary>
    public int Group { get; init; } = -1;
    /// <summary>Split view id, -1 for none.</summary>
    public int Split { get; init; } = -1;
    public long? LastAccessed { get; init; }
    /// <summary>"fav:&lt;hash&gt;" (an image in the store) or "glyph:&lt;name&gt;".</summary>
    public string? Icon { get; init; }
    /// <summary>null, "domain" or "all": what the extension hid at the source.</summary>
    public string? Hidden { get; init; }
    /// <summary>Zoom factor (0.25–5) when known (tabs.getZoom / onZoomChange).</summary>
    public double? Zoom { get; init; }
    /// <summary>Host access for the page: granted, none (needs the one-click runtime grant) or blocked (browser pages).</summary>
    public string? Access { get; init; }
}

public sealed record BrowserWindowInfo
{
    public required int Id { get; init; }
    public bool Focused { get; init; }
    /// <summary>normal, minimized, maximized, fullscreen.</summary>
    public string State { get; init; } = "normal";
    public string Type { get; init; } = "normal";
    public int Left { get; init; }
    public int Top { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }
    public double? Zoom { get; init; }
    /// <summary>Store clock (ms) when this window last got the focus (plugin-side; 0 = never seen focused). Windows keeps a
    /// process's frames in activation order, so this ranks frames whose bounds tie (two maximized windows).</summary>
    public long FocusedAt { get; init; }
}

public sealed record TabGroupInfo
{
    public required int Id { get; init; }
    public int WindowId { get; init; }
    public string? Title { get; init; }
    public string Color { get; init; } = "grey";
    public bool Collapsed { get; init; }
}

public sealed record MediaArt(string? Url, string? Img);

public sealed record MediaItem
{
    /// <summary>"tabId:frameId[:n]".</summary>
    public required string Key { get; init; }
    public int TabId { get; init; }
    public int FrameId { get; init; }
    public string Kind { get; init; } = "video";
    /// <summary>playing, paused or none.</summary>
    public string State { get; init; } = "none";
    public string? Title { get; init; }
    public string? Artist { get; init; }
    public string? Album { get; init; }
    public MediaArt? Art { get; init; }
    public long? DurationMs { get; init; }
    public bool Live { get; init; }
    public long? PositionMs { get; init; }
    /// <summary>Sender clock (UTC ms) of <see cref="PositionMs"/>.</summary>
    public long? PositionAt { get; init; }
    public double Rate { get; init; } = 1;
    public double? Volume { get; init; }
    public bool? ElementMuted { get; init; }
    public bool Pip { get; init; }
    public ImmutableArray<string> Actions { get; init; } = [];
    public bool? Mic { get; init; }
    public bool? Camera { get; init; }
    /// <summary>mediasession, element, mediasession+element, smtc.</summary>
    public string Source { get; init; } = "element";
    /// <summary>Set by the plugin: the site has no host permission yet ("press to allow").</summary>
    public bool NeedsPermission { get; init; }
    /// <summary>Store clock (ms) of the last update (plugin-side recency, for "the media key follows the latest").</summary>
    public long Seen { get; init; }
    /// <summary>The tab's registrable domain when the privacy level allows it ("Playing on video.example").</summary>
    public string? Domain { get; init; }

    public bool IsPlaying => State == "playing";
    public bool Has(string action) => Actions.Contains(action);

    /// <summary>Position now, extrapolated like the data API: position + (now − at) × rate while playing.</summary>
    public long? PositionNow(long nowMs, long clockOffsetMs = 0)
    {
        if (PositionMs is not { } p) return null;
        if (!IsPlaying || PositionAt is not { } at || Live) return p;
        var elapsed = Math.Max(0, nowMs - (at - clockOffsetMs));
        var pos = p + (long)(elapsed * Math.Clamp(Rate, 0, 16));
        return DurationMs is { } d && d > 0 ? Math.Min(pos, d) : pos;
    }
}

public sealed record DownloadItem
{
    public required int Id { get; init; }
    /// <summary>in_progress, interrupted, complete.</summary>
    public string State { get; init; } = "in_progress";
    public string? Name { get; init; }
    public long Bytes { get; init; }
    public long? Total { get; init; }
    public long? EtaAt { get; init; }
    public bool Paused { get; init; }
    public bool CanResume { get; init; }
    public string Danger { get; init; } = "safe";
    public string? Error { get; init; }
    public string? Icon { get; init; }
    public long? StartedAt { get; init; }
    /// <summary>The file still exists on disk (Chrome's DownloadItem.exists).</summary>
    public bool Exists { get; init; } = true;

    public double? Fraction => Total is > 0 ? Math.Clamp((double)Bytes / Total.Value, 0, 1) : null;
}

public sealed record BrowserCaps
{
    public bool Tabs { get; init; } = true;
    public bool Favicon { get; init; }
    public bool Downloads { get; init; }
    public bool TabGroups { get; init; }
    public bool Sessions { get; init; }
    public bool Scripting { get; init; }
    public bool AllUrls { get; init; }
    public ImmutableArray<string> GrantedOrigins { get; init; } = [];
    public bool Split { get; init; }
    /// <summary>permissions.addHostAccessRequest exists (Chrome 133+): "press to allow" shows a toolbar request.</summary>
    public bool HostAccessRequest { get; init; }
}

/// <summary>
/// The user's own privacy choices in one browser profile (hello/state.full <c>privacySettings</c>): the base level, the
/// "while streaming" level (<c>full</c> = off) and how many always-hidden sites are listed (a count, never the list).
/// </summary>
public sealed record PrivacySettings(string Base, string WhileStreaming, int AlwaysHidden)
{
    public static readonly PrivacySettings Default = new(Wire.Privacy.Full, Wire.Privacy.Domain, 0);
}

/// <summary>What the relay told us in its preamble (trusted: the relay walks its own parent chain).</summary>
public sealed record RelayInfo(string Origin, int BrowserPid, string BrowserExe, string RelayVersion);
