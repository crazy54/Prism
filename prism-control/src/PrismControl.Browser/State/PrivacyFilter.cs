using System.Collections.Immutable;
using PrismControl.Browser.Protocol;

namespace PrismControl.Browser.State;

/// <summary>
/// Streamer-safe enforcement on the plugin side (research §10). The extension filters at the source; this is defense in
/// depth so a buggy or hostile sender can never put a hidden title on a key: while the effective level is "domain",
/// tab titles and URLs and download names (except the extension) are dropped on ingest; at "hidden" the domain, media
/// metadata and artwork go too. The plugin can never "un-hide": relaxing the level needs a fresh snapshot from the
/// extension.
/// </summary>
public static class PrivacyFilter
{
    public static BrowserTab Apply(BrowserTab t, string level)
    {
        var rank = Wire.Privacy.Rank(level);
        // What the extension says it hid is enforced too: "all" (hidden level, or an always-hidden site) clears everything,
        // "domain" clears the title, URL and host. Below the hidden level, "all" can only mean an always-hidden site, whose
        // unread number came from its title (LOW 11), so it goes as well.
        if (rank == 2 || t.Hidden == "all")
        {
            var unread = rank < 2 ? null : t.Unread;
            var icon = t.Icon is { } i && i.StartsWith("glyph:", StringComparison.Ordinal) ? i : null;
            return t.Title is null && t.Url is null && t.Domain is null && t.Host is null && t.Hidden == "all" && t.Unread == unread && t.Icon == icon
                ? t
                : t with { Title = null, Url = null, Domain = null, Host = null, Hidden = "all", Icon = icon, Unread = unread };
        }
        if (rank == 1 || t.Hidden == "domain")
            return t.Title is null && t.Url is null && t.Host is null && t.Hidden == "domain" ? t : t with { Title = null, Url = null, Host = null, Hidden = "domain" };
        return t;
    }

    public static MediaItem Apply(MediaItem m, string level)
    {
        var rank = Wire.Privacy.Rank(level);
        if (rank < 2) return m;   // "domain": the extension keeps titles only for its media allow-list
        // Hidden: the site goes too (the choke-point test caught Media.domain surviving on the speed dial).
        return m.Title is null && m.Artist is null && m.Album is null && m.Art is null && m.Domain is null
            ? m
            : m with { Title = null, Artist = null, Album = null, Art = null, Domain = null };
    }

    public static DownloadItem Apply(DownloadItem d, string level)
    {
        var rank = Wire.Privacy.Rank(level);
        if (rank == 0) return d;
        // The file icon travels at full only (PROTOCOL.md §6.5).
        if (d.Icon is not null) d = d with { Icon = null };
        if (d.Name is null) return d;
        if (rank == 2) return d with { Name = null };
        var ext = Path.GetExtension(d.Name);
        var name = string.IsNullOrEmpty(ext) || ext.Length > 12 ? null : ext.ToLowerInvariant();
        return d.Name == name ? d : d with { Name = name };
    }

    /// <summary>
    /// The SMTC lite tier (no extension connected) at <paramref name="level"/>, HIGH 1. Windows' media session carries no
    /// site, so nothing can be allowed per site: at <c>full</c> everything shows; at <c>domain</c> the title, artist, album
    /// and thumbnail go (the key says "Playing", progress stays); at <c>hidden</c> (and panic) only the play state stays.
    /// </summary>
    public static MediaItem Lite(MediaItem m, string level) => Wire.Privacy.Rank(level) switch
    {
        0 => m,
        1 => m with { Title = null, Artist = null, Album = null, Art = null },
        _ => m with { Title = null, Artist = null, Album = null, Art = null, DurationMs = null, PositionMs = null, PositionAt = null, Rate = 1 },
    };

    public static TabGroupInfo Apply(TabGroupInfo g, string level) => Wire.Privacy.Rank(level) == 0 || g.Title is null ? g : g with { Title = null };

    /// <summary>Re-applies a (stricter) level to everything an instance already holds.</summary>
    public static BrowserInstance Apply(BrowserInstance b, string level)
    {
        if (Wire.Privacy.Rank(level) == 0) return b with { Privacy = level };
        return b with
        {
            Privacy = level,
            Tabs = b.Tabs.ToImmutableDictionary(kv => kv.Key, kv => Apply(kv.Value, level)),
            Media = b.Media.ToImmutableDictionary(kv => kv.Key, kv => Apply(kv.Value, level)),
            Downloads = b.Downloads.ToImmutableDictionary(kv => kv.Key, kv => Apply(kv.Value, level)),
            Groups = b.Groups.ToImmutableDictionary(kv => kv.Key, kv => Apply(kv.Value, level)),
        };
    }
}
