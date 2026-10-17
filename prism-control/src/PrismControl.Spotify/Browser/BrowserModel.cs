using System.Globalization;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Browser;

public enum BrowserLevel { Playlists, Tracks }

public enum RowKind
{
    /// <summary>Level 0, row 0: leave the browser.</summary>
    NowPlaying,
    /// <summary>Level 1, row 0: back to the playlists.</summary>
    Back,
    PlayAll,
    ShufflePlay,
    Playlist,
    Track,
    /// <summary>A row whose page has not loaded yet.</summary>
    Loading,
}

public sealed record BrowserRow(RowKind Kind, string Title, string? Meta, IReadOnlyList<ImageDto>? Images, bool Enabled,
    PlaylistEntry? Playlist = null, TrackEntry? Track = null)
{
    public bool IsData => Kind is RowKind.Playlist or RowKind.Track;
}

/// <summary>
/// The dial browser's state (research §6.1): Level 0 = [‹ Now playing] + the user's playlists; Level 1 = [‹ Back]
/// [Play playlist] [Shuffle play] + the tracks (or just the three rows for playlists Spotify won't list).
/// The highlight stops at the ends (no wrap), so "‹ Back" is reached by spinning left. Pure logic, no I/O: the
/// action loads pages and feeds them in. Not thread-safe (it lives in one action's mailbox).
/// </summary>
public sealed class BrowserModel
{
    private readonly Dictionary<int, PlaylistEntry> _playlists = new();
    private readonly Dictionary<int, TrackEntry> _tracks = new();
    private readonly HashSet<int> _playlistPages = new();
    private readonly HashSet<int> _trackPages = new();
    private int? _playlistTotal;
    private int? _trackTotal;
    private int _savedPlaylistRow = 1;

    public BrowserLevel Level { get; private set; } = BrowserLevel.Playlists;
    public PlaylistEntry? Playlist { get; private set; }
    public int Highlight { get; private set; } = 1;
    /// <summary>Spotify refused to list this playlist's tracks (not owned or collaborative).</summary>
    public bool NotOwned { get; private set; }
    /// <summary>A load error to show instead of rows (cleared by the next successful page).</summary>
    public string? Error { get; set; }

    public int HeaderRows => Level == BrowserLevel.Playlists ? 1 : 3;
    /// <summary>Number of data rows (null until the first page arrived).</summary>
    public int? Total => Level == BrowserLevel.Playlists ? _playlistTotal : NotOwned ? 0 : _trackTotal;
    public bool IsLoadingFirstPage => Total is null && Error is null;
    public int RowCount => HeaderRows + (Total ?? (Error is null ? 1 : 0));

    public BrowserRow Current => RowAt(Highlight);

    // ------------------------------------------------------------------ navigation

    /// <summary>Moves the highlight by <paramref name="rows"/>, clamped to the list (no wrap). Returns true if it moved.</summary>
    public bool Move(int rows)
    {
        var next = Math.Clamp(Highlight + rows, 0, Math.Max(0, RowCount - 1));
        if (next == Highlight) return false;
        Highlight = next;
        return true;
    }

    /// <summary>Galleon spins arrive as up to ±12 ticks per event: small turns move row by row, fast spins jump further (quadratic).</summary>
    public static int RowsForTicks(int ticks)
    {
        var t = Math.Abs(ticks);
        var rows = Math.Max(t, (int)Math.Round(t * t / 4.0));
        return Math.Sign(ticks) * rows;
    }

    /// <summary>Back to Level 0, on the playlist we came from.</summary>
    public void ShowPlaylists()
    {
        Level = BrowserLevel.Playlists;
        Playlist = null;
        NotOwned = false;
        Error = null;
        Highlight = Math.Clamp(_savedPlaylistRow, 0, Math.Max(0, RowCount - 1));
    }

    /// <summary>Opens a playlist: the highlight starts on track 1 (or on "Play playlist" for playlists we can't list).</summary>
    public void OpenPlaylist(PlaylistEntry p, bool canList)
    {
        _savedPlaylistRow = Highlight;
        if (Playlist?.Id != p.Id || Playlist?.SnapshotId != p.SnapshotId)
        {
            _tracks.Clear();
            _trackPages.Clear();
            _trackTotal = null;
        }
        Level = BrowserLevel.Tracks;
        Playlist = p;
        NotOwned = !canList;
        Error = null;
        Highlight = canList ? 3 : 1;
    }

    /// <summary>Puts the highlight on a loaded playlist (e.g. the one playing now). Returns false if it isn't loaded.</summary>
    public bool FocusPlaylist(string uri)
    {
        if (Level != BrowserLevel.Playlists) return false;
        foreach (var (i, p) in _playlists)
        {
            if (p.Uri != uri) continue;
            Highlight = 1 + i;
            _savedPlaylistRow = Highlight;
            return true;
        }
        return false;
    }

    public void MarkNotOwned()
    {
        NotOwned = true;
        Error = null;
        if (Highlight > 2) Highlight = 1;
    }

    /// <summary>Resets to Level 0 (first playlist), e.g. after a long time away or a disconnect.</summary>
    public void Reset(bool dropData)
    {
        if (dropData)
        {
            _playlists.Clear();
            _playlistPages.Clear();
            _playlistTotal = null;
            _tracks.Clear();
            _trackPages.Clear();
            _trackTotal = null;
        }
        Level = BrowserLevel.Playlists;
        Playlist = null;
        NotOwned = false;
        Error = null;
        Highlight = 1;
        _savedPlaylistRow = 1;
    }

    // ------------------------------------------------------------------ data

    public void AddPlaylists(PageResult<PlaylistEntry> page)
    {
        _playlistTotal = page.Total;
        _playlistPages.Add(page.Offset / PlaylistLibrary.PageSize);
        for (var i = 0; i < page.Items.Count; i++) _playlists[page.Offset + i] = page.Items[i];
        if (Level == BrowserLevel.Playlists) { Error = null; Highlight = Math.Clamp(Highlight, 0, Math.Max(0, RowCount - 1)); }
    }

    public void AddTracks(PlaylistEntry p, PageResult<TrackEntry> page)
    {
        if (Playlist?.Id != p.Id) return;
        _trackTotal = page.Total;
        _trackPages.Add(page.Offset / PlaylistLibrary.PageSize);
        foreach (var t in page.Items) _tracks[t.Position] = t;
        Error = null;
        Highlight = Math.Clamp(Highlight, 0, Math.Max(0, RowCount - 1));
    }

    public bool HasPage(int page) => Level == BrowserLevel.Playlists ? _playlistPages.Contains(page) : _trackPages.Contains(page);

    /// <summary>The pages the current view needs: the highlight's page, plus the next one within 10 rows of its end (never further ahead).</summary>
    public IReadOnlyList<int> PagesWanted()
    {
        if (Level == BrowserLevel.Tracks && NotOwned) return [];
        var total = Total;
        if (total is null) return HasPage(0) ? [] : [0];
        var dataIndex = Math.Max(0, Highlight - HeaderRows);
        var page = dataIndex / PlaylistLibrary.PageSize;
        var wanted = new List<int> { page };
        var inPage = dataIndex % PlaylistLibrary.PageSize;
        if (inPage >= PlaylistLibrary.PageSize - 10 && (page + 1) * PlaylistLibrary.PageSize < total) wanted.Add(page + 1);
        if (inPage < 3 && page > 0) wanted.Add(page - 1);
        return wanted.Where(p => !HasPage(p) && p * PlaylistLibrary.PageSize < total).Distinct().ToList();
    }

    public BrowserRow RowAt(int index)
    {
        if (Level == BrowserLevel.Playlists)
        {
            if (index == 0) return new BrowserRow(RowKind.NowPlaying, "Now playing", "Leave the browser", null, true);
            var i = index - 1;
            if (_playlists.TryGetValue(i, out var p))
                return new BrowserRow(RowKind.Playlist, p.Name, PlaylistMeta(p), p.Images, true, Playlist: p);
            return new BrowserRow(RowKind.Loading, "Loading…", null, null, false);
        }
        switch (index)
        {
            case 0: return new BrowserRow(RowKind.Back, "Back to playlists", Playlist?.Name, null, true);
            case 1: return new BrowserRow(RowKind.PlayAll, "Play playlist", Playlist?.Name, null, true, Playlist: Playlist);
            case 2: return new BrowserRow(RowKind.ShufflePlay, "Shuffle play", Playlist?.Name, null, true, Playlist: Playlist);
        }
        var ti = index - 3;
        if (_tracks.TryGetValue(ti, out var t))
            return new BrowserRow(RowKind.Track, t.Name, TrackMeta(t), t.Images, t.IsPlayable, Playlist: Playlist, Track: t);
        return new BrowserRow(RowKind.Loading, "Loading…", null, null, false);
    }

    /// <summary>"12 / 48" for data rows, "– / 48" on the header rows.</summary>
    public string PositionLabel
    {
        get
        {
            var total = Total;
            if (total is null || (Level == BrowserLevel.Tracks && NotOwned)) return "";
            var data = Highlight - HeaderRows + 1;
            var t = total.Value.ToString(CultureInfo.InvariantCulture);
            return data >= 1 ? data.ToString(CultureInfo.InvariantCulture) + " / " + t : "– / " + t;
        }
    }

    /// <summary>The fraction for the scrollbar (0..1).</summary>
    public double ScrollFraction => RowCount <= 1 ? 0 : (double)Highlight / (RowCount - 1);

    public static string PlaylistMeta(PlaylistEntry p)
    {
        var count = p.TrackCount.ToString(CultureInfo.InvariantCulture) + (p.TrackCount == 1 ? " track" : " tracks");
        return string.IsNullOrEmpty(p.OwnerName) ? count : p.OwnerName + " · " + count;
    }

    public static string TrackMeta(TrackEntry t)
    {
        if (t.IsLocal) return "Local file · can't play here";
        if (!t.IsPlayable) return "Unavailable";
        var d = t.DurationMs is { } ms ? SpotifyText.Duration(ms) : null;
        return string.IsNullOrEmpty(t.ArtistLine) ? d ?? "" : d is null ? t.ArtistLine : t.ArtistLine + " · " + d;
    }
}
