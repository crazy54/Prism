using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;
using PrismControl.Core.Render;

namespace PrismControl.Browser.Actions;

/// <summary>Pure lookups shared by the actions (tested directly).</summary>
public static class Selectors
{
    /// <summary>
    /// A tab slot (research §5.1): "order" = Nth tab of the current window, "pinned" = Nth pinned tab there, "recent" = Nth
    /// most recently used tab of the browser, "audible" = Nth tab playing (or muted) sound, most recent first.
    /// Tab ids change on every browser restart, so slots are positions, never ids.
    /// </summary>
    public static BrowserTab? Slot(BrowserInstance b, string slot, int index)
    {
        if (index < 1) index = 1;
        var win = b.CurrentWindowId;
        IEnumerable<BrowserTab> pool = slot switch
        {
            "pinned" => win is { } w1 ? b.TabsInWindow(w1).Where(t => t.Pinned) : [],
            "recent" => b.Tabs.Values.OrderByDescending(t => t.Active && t.WindowId == win ? long.MaxValue : t.LastAccessed ?? 0).ThenBy(t => t.Id),
            "audible" => b.Tabs.Values.Where(t => t.Audible || t.Muted).OrderByDescending(t => t.Audible).ThenByDescending(t => t.LastAccessed ?? 0).ThenBy(t => t.Id),
            _ => win is { } w2 ? b.TabsInWindow(w2) : [],
        };
        return pool.Skip(index - 1).FirstOrDefault();
    }

    /// <summary>What a tab key or row shows: the title when allowed and drawable, else the domain, else a placeholder.</summary>
    public static string Label(BrowserTab t, bool preferDomain, string fallback)
    {
        if (!preferDomain && t.Title is { Length: > 0 } title && StrokeFont.Supports(title)) return title;
        if (t.Domain is { Length: > 0 } domain) return StripWww(domain);
        if (t.Title is { Length: > 0 } any && !preferDomain) return any;   // boxes beat nothing when there is no domain
        return fallback;
    }

    public static string StripWww(string domain) => domain.StartsWith("www.", StringComparison.Ordinal) ? domain[4..] : domain;

    /// <summary>
    /// The media a media key follows: playing first, real players before meeting sessions (those have their own keys),
    /// then the audible tab, then the newest; paused items with metadata after that.
    /// </summary>
    public static MediaItem? Media(BrowserInstance b) =>
        b.Media.Values.Where(m => b.Tabs.ContainsKey(m.TabId) || m.TabId == 0)
            .OrderByDescending(m => m.IsPlaying)
            .ThenByDescending(m => m.Kind != "session-only")
            .ThenByDescending(m => b.Tabs.TryGetValue(m.TabId, out var t) && t.Audible)
            .ThenByDescending(m => m.Seen)
            .ThenBy(m => m.Key, StringComparer.Ordinal)
            .FirstOrDefault(m => m.State != "none" || m.Title is not null);

    /// <summary>An audible tab without any media item (the zero-permission tier): usually a site with no host access yet.</summary>
    public static BrowserTab? AudibleWithoutMedia(BrowserInstance b) =>
        b.Tabs.Values.Where(t => t.Audible && !b.Media.Values.Any(m => m.TabId == t.Id)).OrderByDescending(t => t.Access == "none").ThenByDescending(t => t.LastAccessed ?? 0).FirstOrDefault();

    /// <summary>A meeting: media whose site registered the mic/camera/hang-up handlers, the one with state first.</summary>
    public static MediaItem? Meeting(BrowserInstance b) =>
        b.Media.Values.Where(m => m.Has("togglemicrophone") || m.Has("togglecamera") || m.Has("hangup"))
            .OrderByDescending(m => m.Mic is not null || m.Camera is not null).ThenByDescending(m => m.Seen).FirstOrDefault();

    /// <summary>The download ring follows the newest in-progress download, else the newest finished one.</summary>
    public static DownloadItem? Download(BrowserInstance b) =>
        b.Downloads.Values.Where(d => d.State == "in_progress").OrderByDescending(d => d.StartedAt ?? 0).ThenByDescending(d => d.Id).FirstOrDefault()
        ?? b.Downloads.Values.OrderByDescending(d => d.StartedAt ?? 0).ThenByDescending(d => d.Id).FirstOrDefault();

    /// <summary>Groups of the current window in strip order (by their first tab).</summary>
    public static IReadOnlyList<(TabGroupInfo Group, int Tabs)> Groups(BrowserInstance b)
    {
        var win = b.CurrentWindowId;
        return b.Groups.Values.Where(g => win is null || g.WindowId == win)
            .Select(g => (Group: g, First: b.Tabs.Values.Where(t => t.Group == g.Id).Select(t => t.Index).DefaultIfEmpty(int.MaxValue).Min(), Tabs: b.Tabs.Values.Count(t => t.Group == g.Id)))
            .OrderBy(x => x.First).ThenBy(x => x.Group.Id)
            .Select(x => (x.Group, x.Tabs)).ToList();
    }

    /// <summary>The host name of a tab: Tab.host (level full), else the host of its URL (also full only), else null.</summary>
    public static string? HostOf(BrowserTab t)
    {
        if (t.Host is { } h) return h;
        if (t.Url is { } url && Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Host.Length > 0) return WireParser.Host(u.Host);
        return null;
    }

    private static bool HostMatches(string host, string site) =>
        host == site || host.EndsWith("." + site, StringComparison.Ordinal) || StripWww(host) == StripWww(site);

    /// <summary>
    /// A watched site's tab, the one with the most unread first (HIGH 2). Tab.domain is the registrable domain
    /// (app.chat.example → chat.example), so the site setting is matched against the tab's HOST first (Tab.host / the URL,
    /// at level full): the site itself or a sub-domain of it. Without a host (streamer-safe "domain"), a tab matches when
    /// the site lies inside its registrable domain; the tab matched before wins then, so two sites of one domain keep
    /// their own tabs. Hidden mode drops domains but keeps unread counts: the remembered tab keeps being followed.
    /// </summary>
    public static BrowserTab? SiteTab(BrowserInstance b, string site, int? rememberedTabId)
    {
        var s = WireParser.Host(site.Trim().Replace("https://", "", StringComparison.OrdinalIgnoreCase).Replace("http://", "", StringComparison.OrdinalIgnoreCase).Split('/')[0]);
        BrowserTab? remembered = rememberedTabId is { } rid && b.Tabs.TryGetValue(rid, out var r) ? r : null;
        if (s is not null)
        {
            static double Rank(BrowserTab t) => t.Unread is > 0 ? t.Unread.Value : t.Unread == -1 ? 0.5 : 0;
            var byHost = b.Tabs.Values.Where(t => HostOf(t) is { } h && HostMatches(h, s))
                .OrderByDescending(Rank).ThenByDescending(t => t.LastAccessed ?? 0).FirstOrDefault();
            if (byHost is not null) return byHost;
            bool ByDomain(BrowserTab t) => HostOf(t) is null && t.Domain is { } d && (HostMatches(d, s) || s.EndsWith("." + d, StringComparison.Ordinal));
            if (remembered is not null && ByDomain(remembered)) return remembered;
            var byDomain = b.Tabs.Values.Where(ByDomain).OrderByDescending(Rank).ThenByDescending(t => t.LastAccessed ?? 0).FirstOrDefault();
            if (byDomain is not null) return byDomain;
        }
        return remembered is { Domain: null } ? remembered : null;
    }

    /// <summary>The image for an id, or null (asking the browser to resend once if it was evicted).</summary>
    public static StoredImage? Image(BrowserHub? hub, string browserKey, string? id)
    {
        if (hub is null || id is null || id.StartsWith("glyph:", StringComparison.Ordinal)) return null;
        var img = hub.Images.Get(id);
        if (img is null && !id.StartsWith("url:", StringComparison.Ordinal) && !id.StartsWith("art:smtc-", StringComparison.Ordinal)) hub.RequestImage(browserKey, id);
        return img;
    }

    /// <summary>Artwork for media: the extension's re-encoded image, else what the plugin fetched from the https URL.</summary>
    public static StoredImage? Art(BrowserHub? hub, string browserKey, MediaItem m)
    {
        if (hub is null || m.Art is null) return null;
        if (m.Art.Img is { } img && hub.Images.Get(img) is { } a) return a;
        return m.Art.Url is { } url ? hub.Images.Get(ArtFetcher.IdFor(url)) : null;
    }

    /// <summary>Speed ladder: the step from the current rate (snapping to the ladder first).</summary>
    public static double LadderStep(double[] ladder, double current, int steps)
    {
        var i = 0;
        var best = double.MaxValue;
        for (var k = 0; k < ladder.Length; k++)
        {
            var dist = Math.Abs(ladder[k] - current);
            if (dist < best) { best = dist; i = k; }
        }
        // Off-ladder values step to the neighbor in the direction of travel.
        if (best > 0.001 && steps != 0)
        {
            if (steps > 0 && ladder[i] > current) steps--;
            else if (steps < 0 && ladder[i] < current) steps++;
        }
        return ladder[Math.Clamp(i + steps, 0, ladder.Length - 1)];
    }

    public static string Domain(BrowserInstance b, int tabId) =>
        b.Tabs.TryGetValue(tabId, out var t) && t.Domain is { } d ? StripWww(d) : b.Brand;
}
