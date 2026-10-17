using PrismControl.Core.Hosting;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Browser;

public sealed record PlaylistEntry(string Id, string Uri, string Name, string? OwnerId, string? OwnerName, bool Collaborative, int TrackCount,
    string? SnapshotId, IReadOnlyList<ImageDto> Images, string? Url);

/// <summary>One playlist row; <see cref="Position"/> is its index in the playlist (for offset.position).</summary>
public sealed record TrackEntry(int Position, string? Uri, string Name, string ArtistLine, long? DurationMs, bool IsLocal, bool IsPlayable,
    string? Album, IReadOnlyList<ImageDto> Images, string? Type);

public sealed record PageResult<T>(int Offset, int Total, IReadOnlyList<T> Items);

/// <summary>The playlist's tracks can't be listed: Spotify only lists playlists you own or collaborate on (403).</summary>
public sealed class PlaylistNotOwnedException() : Exception("Track list not available for playlists you don't own.");

/// <summary>
/// The user's playlists and their tracks for the dial browser (research §3.4–3.5): pages of 50, the list cached for
/// 10 minutes and revalidated with If-None-Match when the browser opens, track pages cached by
/// (playlist, snapshot, offset). Local files and unavailable rows are kept so that row index == playlist position.
/// </summary>
public sealed class PlaylistLibrary
{
    public const int PageSize = 50;
    private static readonly TimeSpan ListTtl = TimeSpan.FromMinutes(10);

    private readonly SpotifyApi _api;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly object _lock = new();
    private readonly Dictionary<int, (PageResult<PlaylistEntry> Page, string? ETag, DateTimeOffset At)> _playlistPages = new();
    private readonly Dictionary<(string Id, string? Snapshot, int Offset), PageResult<TrackEntry>> _trackPages = new();
    private readonly HashSet<string> _notOwned = new(StringComparer.Ordinal);
    private bool _revalidate = true;

    public PlaylistLibrary(SpotifyApi api, TimeProvider time, ILog log)
    {
        _api = api;
        _time = time;
        _log = log;
    }

    /// <summary>The signed-in user's id (from GET /me), used to know which playlists can list tracks.</summary>
    public string? MeId { get; set; }

    /// <summary>Next page requests revalidate with If-None-Match (called when the browser opens).</summary>
    public void MarkStale()
    {
        lock (_lock) _revalidate = true;
    }

    public bool CanListTracks(PlaylistEntry p)
    {
        lock (_lock)
        {
            if (_notOwned.Contains(p.Id)) return false;
        }
        return p.Collaborative || MeId is null || string.Equals(p.OwnerId, MeId, StringComparison.Ordinal);
    }

    public bool IsKnownNotOwned(string playlistId)
    {
        lock (_lock) return _notOwned.Contains(playlistId);
    }

    public PageResult<PlaylistEntry>? CachedPlaylists(int offset)
    {
        lock (_lock) return _playlistPages.TryGetValue(offset, out var p) ? p.Page : null;
    }

    public async Task<PageResult<PlaylistEntry>> GetPlaylistsPageAsync(int offset, CancellationToken ct)
    {
        offset = offset / PageSize * PageSize;
        (PageResult<PlaylistEntry> Page, string? ETag, DateTimeOffset At) cached;
        bool have, revalidate;
        lock (_lock)
        {
            have = _playlistPages.TryGetValue(offset, out cached);
            revalidate = _revalidate || (have && _time.GetUtcNow() - cached.At >= ListTtl);
            if (_revalidate && offset == 0) _revalidate = false;
        }
        if (have && !revalidate) return cached.Page;

        var (page, etag, notModified) = await _api.GetPlaylistsAsync(offset, have ? cached.ETag : null, ct).ConfigureAwait(false);
        if (notModified && have)
        {
            lock (_lock) _playlistPages[offset] = (cached.Page, etag, _time.GetUtcNow());
            return cached.Page;
        }
        var items = (page?.Items ?? []).Where(p => p.Id is not null && p.Uri is not null).Select(ToEntry).ToList();
        var result = new PageResult<PlaylistEntry>(offset, page?.Total ?? items.Count, items);
        lock (_lock)
        {
            // A snapshot change invalidates that playlist's cached track pages.
            if (have)
            {
                foreach (var e in result.Items)
                {
                    var old = cached.Page.Items.FirstOrDefault(o => o.Id == e.Id);
                    if (old is not null && old.SnapshotId != e.SnapshotId)
                        foreach (var k in _trackPages.Keys.Where(k => k.Id == e.Id).ToList()) _trackPages.Remove(k);
                }
            }
            _playlistPages[offset] = (result, etag, _time.GetUtcNow());
        }
        return result;
    }

    public PageResult<TrackEntry>? CachedTracks(PlaylistEntry p, int offset)
    {
        lock (_lock) return _trackPages.TryGetValue((p.Id, p.SnapshotId, offset / PageSize * PageSize), out var v) ? v : null;
    }

    /// <summary>A page of tracks. Throws <see cref="PlaylistNotOwnedException"/> for playlists Spotify won't list (403).</summary>
    public async Task<PageResult<TrackEntry>> GetTracksPageAsync(PlaylistEntry p, int offset, CancellationToken ct)
    {
        offset = offset / PageSize * PageSize;
        var key = (p.Id, p.SnapshotId, offset);
        lock (_lock)
        {
            if (_notOwned.Contains(p.Id)) throw new PlaylistNotOwnedException();
            if (_trackPages.TryGetValue(key, out var hit)) return hit;
        }
        PagingDto<PlaylistItemRowDto>? page;
        try
        {
            page = await _api.GetPlaylistItemsAsync(p.Id, offset, withFields: true, ct).ConfigureAwait(false);
            // A filtered page whose rows came back without item/track: retry once without the fields filter.
            if (page?.Items is { Count: > 0 } rows && rows.All(r => r.Item is null && r.Track is null))
                page = await _api.GetPlaylistItemsAsync(p.Id, offset, withFields: false, ct).ConfigureAwait(false);
        }
        catch (SpotifyApiException e) when (e.Status == 403 && e.Kind is ApiFailure.Forbidden or ApiFailure.NotAllowed)
        {
            lock (_lock) _notOwned.Add(p.Id);
            throw new PlaylistNotOwnedException();
        }
        var list = new List<TrackEntry>();
        var i = offset;
        foreach (var row in page?.Items ?? [])
            list.Add(ToTrack(i++, row));
        var result = new PageResult<TrackEntry>(offset, page?.Total ?? list.Count, list);
        lock (_lock) _trackPages[key] = result;
        return result;
    }

    public void Clear()
    {
        lock (_lock)
        {
            _playlistPages.Clear();
            _trackPages.Clear();
            _notOwned.Clear();
            _revalidate = true;
        }
        MeId = null;
    }

    internal static PlaylistEntry ToEntry(PlaylistDto p) => new(
        p.Id!, p.Uri!, string.IsNullOrWhiteSpace(p.Name) ? "Untitled playlist" : p.Name!, p.Owner?.Id, p.Owner?.DisplayName ?? p.Owner?.Id,
        p.Collaborative, p.Items?.Total ?? p.Tracks?.Total ?? 0, p.SnapshotId, p.Images ?? [], p.ExternalUrls?.Spotify);

    internal static TrackEntry ToTrack(int position, PlaylistItemRowDto row)
    {
        var item = row.Item ?? row.Track;
        if (item is null) return new TrackEntry(position, null, "Unavailable", "", null, row.IsLocal, false, null, [], null);
        var local = row.IsLocal || item.IsLocal || (item.Uri?.StartsWith("spotify:local:", StringComparison.Ordinal) ?? false);
        var artists = item.Artists is { Count: > 0 } a ? string.Join(", ", a.Select(x => x.Name).Where(n => !string.IsNullOrEmpty(n)))
            : item.Show?.Name ?? "";
        var images = item.Album?.Images is { Count: > 0 } ai ? ai : item.Images ?? item.Show?.Images ?? [];
        return new TrackEntry(position, item.Uri, string.IsNullOrWhiteSpace(item.Name) ? "Untitled" : item.Name!, artists,
            item.DurationMs > 0 ? item.DurationMs : null, local, !local && item.IsPlayable != false && item.Uri is not null,
            item.Album?.Name, images, item.Type);
    }
}
