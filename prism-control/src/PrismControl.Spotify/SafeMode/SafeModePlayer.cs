using System.Globalization;
using System.Text.Json;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.SafeMode;

/// <summary>
/// Safe mode's stand-in for Spotify's player and library: Web API PUT/POST/DELETE are never sent; instead they update
/// this overlay, which is laid over the real GET /me/player and /me/library/contains answers. So a fake-host press
/// shows its effect (paused, shuffled, louder, liked) and the confirmation reads agree, while the real player and the
/// user's library stay untouched. Play/position overlays are dropped when the real player moves to another item.
/// </summary>
internal sealed class SafeModePlayer
{
    private readonly object _lock = new();
    private readonly Dictionary<string, bool> _liked = new(StringComparer.Ordinal);
    private string? _itemUri;
    private bool? _playing;
    private (long Ms, DateTimeOffset At)? _position;
    private (long? Ms, DateTimeOffset At, bool Playing, long DurationMs)? _last;
    private bool? _shuffle;
    private string? _repeat;
    private int? _volume;

    /// <summary>Applies a suppressed write (method, path and query as the API client built them).</summary>
    public void Apply(HttpMethod method, string pathAndQuery, string? jsonBody, DateTimeOffset now)
    {
        var q = pathAndQuery.IndexOf('?');
        var path = q < 0 ? pathAndQuery : pathAndQuery[..q];
        var query = Auth.LoopbackReceiver.ParseQuery(pathAndQuery);
        lock (_lock)
        {
            switch (path)
            {
                case "/me/player/pause":
                    SetPlaying(false, now);
                    break;
                case "/me/player/play":
                    SetPlaying(true, now);
                    if (jsonBody is not null && TryGetPosition(jsonBody) is { } start) _position = (start, now);
                    else if (jsonBody is not null) _position = (0, now);
                    break;
                case "/me/player":   // transfer
                    if (jsonBody is not null && jsonBody.Contains("\"play\":true", StringComparison.Ordinal)) SetPlaying(true, now);
                    break;
                case "/me/player/next":
                case "/me/player/previous":
                    _position = (0, now);   // a fake skip cannot change the item; it restarts it
                    break;
                case "/me/player/seek":
                    if (query.TryGetValue("position_ms", out var p) && long.TryParse(p, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ms)) _position = (Math.Max(0, ms), now);
                    break;
                case "/me/player/shuffle":
                    if (query.TryGetValue("state", out var sh)) _shuffle = sh == "true";
                    break;
                case "/me/player/repeat":
                    if (query.TryGetValue("state", out var rp)) _repeat = rp;
                    break;
                case "/me/player/volume":
                    if (query.TryGetValue("volume_percent", out var v) && int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var pct)) _volume = Math.Clamp(pct, 0, 100);
                    break;
                case "/me/library":
                    if (query.TryGetValue("uris", out var uris))
                        foreach (var uri in uris.Split(',', StringSplitOptions.RemoveEmptyEntries)) _liked[uri] = method == HttpMethod.Put;
                    break;
            }
        }
    }

    private static long? TryGetPosition(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("position_ms", out var p) && p.TryGetInt64(out var v) ? v : null;
        }
        catch (JsonException) { return null; }
    }

    /// <summary>The position shown now (caller holds the lock).</summary>
    private long? PositionNow(DateTimeOffset now)
    {
        var playing = _playing ?? _last?.Playing ?? false;
        long? pos;
        if (_position is { } o) pos = o.Ms + (playing ? (long)Math.Max(0, (now - o.At).TotalMilliseconds) : 0);
        else if (_last is { Ms: { } lm } l) pos = lm + (l.Playing ? (long)Math.Max(0, (now - l.At).TotalMilliseconds) : 0);
        else return null;
        if (_last is { DurationMs: > 0 } d) pos = Math.Min(pos.Value, d.DurationMs);
        return pos;
    }

    private void SetPlaying(bool playing, DateTimeOffset now)
    {
        if (PositionNow(now) is { } pos) _position = (pos, now);
        _playing = playing;
    }

    /// <summary>Lays the fake state over a real GET /me/player answer (null = nothing active stays null).</summary>
    public void Overlay(PlaybackStateDto? dto, DateTimeOffset now)
    {
        if (dto is null) return;
        lock (_lock)
        {
            var uri = dto.Item?.Uri;
            if (_itemUri is not null && uri != _itemUri)
            {
                _playing = null;
                _position = null;
            }
            _itemUri = uri;
            _last = (dto.ProgressMs, now, dto.IsPlaying, dto.Item?.DurationMs ?? 0);
            if (_playing is { } playing) dto.IsPlaying = playing;
            if (_position is not null && PositionNow(now) is { } pos) dto.ProgressMs = pos;
            if (_shuffle is { } shuffle) dto.ShuffleState = shuffle;
            if (_repeat is { } repeat) dto.RepeatState = repeat;
            if (_volume is { } volume && dto.Device is { } device) device.VolumePercent = volume;
        }
    }

    /// <summary>The fake liked state for <paramref name="uri"/>, if a suppressed like/unlike set one.</summary>
    public bool? Liked(string uri)
    {
        lock (_lock) return _liked.TryGetValue(uri, out var v) ? v : null;
    }
}
