using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using PrismControl.Core.Hosting;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.SafeMode;

namespace PrismControl.Spotify.Web;

public enum ApiFailure
{
    /// <summary>A poll was dropped by the client-side limiter (no request was made).</summary>
    Dropped,
    SignedOut,
    /// <summary>The sign-in is no longer valid; the user must reconnect.</summary>
    Reconnect,
    NoActiveDevice,
    PremiumRequired,
    /// <summary>403 on everything: the account is not on the app's User Management list.</summary>
    NotAllowed,
    /// <summary>403 "Player command failed: Restriction violated" (e.g. previous on the first track, during an ad).</summary>
    Restricted,
    Forbidden,
    NotFound,
    BadRequest,
    RateLimited,
    /// <summary>429 with reason QUOTA_EXCEEDED (Development Mode quota).</summary>
    Quota,
    Server,
    Network,
}

public sealed class SpotifyApiException(ApiFailure kind, int status, string? reason, string message, TimeSpan? retryAfter = null) : Exception(message)
{
    public ApiFailure Kind { get; } = kind;
    public int Status { get; } = status;
    public string? Reason { get; } = reason;
    public TimeSpan? RetryAfter { get; } = retryAfter;
}

public sealed record ApiResult(HttpStatusCode Status, byte[] Body, string? ETag);

public sealed class RateLimitEventArgs(DateTimeOffset until, bool quota) : EventArgs
{
    public DateTimeOffset Until { get; } = until;
    public bool Quota { get; } = quota;
}

/// <summary>
/// The Spotify Web API client (research/spotify.md §3): every request goes through the <see cref="RequestGate"/>,
/// carries the bearer token, refreshes once on 401, pauses the gate on 429 (Retry-After, else 2→60 s backoff with
/// jitter), retries GETs on 5xx (1, 2, 4 s) and maps errors to <see cref="ApiFailure"/>. A request never waits for the
/// gate longer than <see cref="RequestGate.MaxWait"/> in total: past that it fails with RateLimited (nothing is queued
/// to fire later). In safe mode PUT/POST/DELETE are never sent; they update a fake player laid over the real reads.
/// Logs method and path only: never tokens, never query strings.
/// </summary>
public sealed class SpotifyApi
{
    public const string Base = "https://api.spotify.com/v1";

    public const string ItemFields =
        "total,limit,offset,next,items(is_local,item(type,id,uri,name,duration_ms,is_local,is_playable,artists(name),album(name,images),show(name),images))";

    private readonly HttpClient _http;
    private readonly SpotifyAuth _auth;
    private readonly RequestGate _gate;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly SafeModeWrites? _writes;
    private readonly SafeModePlayer? _fake;
    private int _backoffLevel;

    public SpotifyApi(HttpClient http, SpotifyAuth auth, RequestGate gate, TimeProvider time, ILog log, SafeModeWrites? safeMode = null)
    {
        _http = http;
        _auth = auth;
        _gate = gate;
        _time = time;
        _log = log;
        if (safeMode is { Enabled: true })
        {
            _writes = safeMode;
            _fake = new SafeModePlayer();
        }
    }

    public RequestGate Gate => _gate;

    /// <summary>Raised on every 429 (the gate is already paused until <see cref="RateLimitEventArgs.Until"/>).</summary>
    public event EventHandler<RateLimitEventArgs>? RateLimited;

    /// <summary>Raised when any request succeeds (clears "busy"/"offline" states).</summary>
    public event EventHandler? Succeeded;

    // ------------------------------------------------------------------ player

    /// <summary>GET /me/player. Null = 204 (nothing active).</summary>
    public async Task<PlaybackStateDto?> GetPlayerAsync(RequestPriority priority, CancellationToken ct)
    {
        var r = await SendAsync(HttpMethod.Get, "/me/player?additional_types=episode", null, priority, ct).ConfigureAwait(false);
        var dto = r.Status == HttpStatusCode.NoContent || r.Body.Length == 0 ? null : Parse(r, SpotifyJsonContext.Default.PlaybackStateDto);
        _fake?.Overlay(dto, _time.GetUtcNow());
        return dto;
    }

    public async Task<List<DeviceDto>> GetDevicesAsync(CancellationToken ct)
    {
        var r = await SendAsync(HttpMethod.Get, "/me/player/devices", null, RequestPriority.Read, ct).ConfigureAwait(false);
        return Parse(r, SpotifyJsonContext.Default.DevicesDto)?.Devices ?? [];
    }

    public Task PlayAsync(PlayBody? body, string? deviceId, CancellationToken ct) =>
        SendAsync(HttpMethod.Put, Q("/me/player/play", ("device_id", deviceId)),
            body is null ? null : JsonSerializer.Serialize(body, SpotifyJsonContext.Default.PlayBody), RequestPriority.Command, ct);

    public Task PauseAsync(string? deviceId, CancellationToken ct) => Command(HttpMethod.Put, Q("/me/player/pause", ("device_id", deviceId)), ct);
    public Task NextAsync(string? deviceId, CancellationToken ct) => Command(HttpMethod.Post, Q("/me/player/next", ("device_id", deviceId)), ct);
    public Task PreviousAsync(string? deviceId, CancellationToken ct) => Command(HttpMethod.Post, Q("/me/player/previous", ("device_id", deviceId)), ct);

    public Task SeekAsync(long positionMs, string? deviceId, CancellationToken ct) =>
        Command(HttpMethod.Put, Q("/me/player/seek", ("position_ms", Math.Max(0, positionMs).ToString(CultureInfo.InvariantCulture)), ("device_id", deviceId)), ct);

    public Task SetShuffleAsync(bool on, string? deviceId, CancellationToken ct) =>
        Command(HttpMethod.Put, Q("/me/player/shuffle", ("state", on ? "true" : "false"), ("device_id", deviceId)), ct);

    public Task SetRepeatAsync(RepeatMode mode, string? deviceId, CancellationToken ct) =>
        Command(HttpMethod.Put, Q("/me/player/repeat", ("state", RepeatWire(mode)), ("device_id", deviceId)), ct);

    public Task SetVolumeAsync(int percent, string? deviceId, CancellationToken ct) =>
        Command(HttpMethod.Put, Q("/me/player/volume", ("volume_percent", Math.Clamp(percent, 0, 100).ToString(CultureInfo.InvariantCulture)), ("device_id", deviceId)), ct);

    /// <summary>PUT /me/player {device_ids:[id], play} (exactly one id).</summary>
    public Task TransferAsync(string deviceId, bool play, CancellationToken ct) =>
        SendAsync(HttpMethod.Put, "/me/player", JsonSerializer.Serialize(new TransferBody { DeviceIds = [deviceId], Play = play }, SpotifyJsonContext.Default.TransferBody),
            RequestPriority.Command, ct);

    // ------------------------------------------------------------------ library (Feb 2026 generic endpoints)

    /// <summary>GET /me/library/contains?uris=… (uris is a query parameter per the OpenAPI schema).</summary>
    public async Task<bool?> LibraryContainsAsync(string uri, CancellationToken ct)
    {
        if (_fake?.Liked(uri) is { } fakeLiked) return fakeLiked;
        var r = await SendAsync(HttpMethod.Get, Q("/me/library/contains", ("uris", uri)), null, RequestPriority.Read, ct).ConfigureAwait(false);
        var list = Parse(r, SpotifyJsonContext.Default.ListBoolean);
        return list is { Count: > 0 } ? list[0] : null;
    }

    public Task SaveToLibraryAsync(string uri, CancellationToken ct) => Command(HttpMethod.Put, Q("/me/library", ("uris", uri)), ct);
    public Task RemoveFromLibraryAsync(string uri, CancellationToken ct) => Command(HttpMethod.Delete, Q("/me/library", ("uris", uri)), ct);

    // ------------------------------------------------------------------ user, playlists

    public async Task<MeDto?> GetMeAsync(CancellationToken ct)
    {
        var r = await SendAsync(HttpMethod.Get, "/me", null, RequestPriority.Read, ct).ConfigureAwait(false);
        return Parse(r, SpotifyJsonContext.Default.MeDto);
    }

    /// <summary>GET /me/playlists (limit 50). With <paramref name="ifNoneMatch"/>, a 304 returns NotModified = true.</summary>
    public async Task<(PagingDto<PlaylistDto>? Page, string? ETag, bool NotModified)> GetPlaylistsAsync(int offset, string? ifNoneMatch, CancellationToken ct)
    {
        var r = await SendAsync(HttpMethod.Get, Q("/me/playlists", ("limit", "50"), ("offset", offset.ToString(CultureInfo.InvariantCulture))), null,
            RequestPriority.Read, ct, ifNoneMatch).ConfigureAwait(false);
        if (r.Status == HttpStatusCode.NotModified) return (null, r.ETag ?? ifNoneMatch, true);
        return (Parse(r, SpotifyJsonContext.Default.PagingDtoPlaylistDto), r.ETag, false);
    }

    /// <summary>GET /playlists/{id}/items (owned or collaborative playlists only; others are 403).</summary>
    public async Task<PagingDto<PlaylistItemRowDto>?> GetPlaylistItemsAsync(string playlistId, int offset, bool withFields, CancellationToken ct)
    {
        var path = Q("/playlists/" + Uri.EscapeDataString(playlistId) + "/items",
            ("limit", "50"), ("offset", offset.ToString(CultureInfo.InvariantCulture)), ("additional_types", "track,episode"),
            ("fields", withFields ? ItemFields : null));
        var r = await SendAsync(HttpMethod.Get, path, null, RequestPriority.Read, ct).ConfigureAwait(false);
        return Parse(r, SpotifyJsonContext.Default.PagingDtoPlaylistItemRowDto);
    }

    // ------------------------------------------------------------------ transport

    private Task Command(HttpMethod method, string pathAndQuery, CancellationToken ct) => SendAsync(method, pathAndQuery, null, RequestPriority.Command, ct);

    /// <summary>Sends one API request through the gate. Throws <see cref="SpotifyApiException"/> for every failure.</summary>
    public async Task<ApiResult> SendAsync(HttpMethod method, string pathAndQuery, string? jsonBody, RequestPriority priority, CancellationToken ct, string? ifNoneMatch = null)
    {
        var path = PathOnly(pathAndQuery);
        if (_fake is not null && method != HttpMethod.Get)
        {
            // Safe mode: the write never leaves the process; the fake player shows its effect on the next read.
            _writes!.Suppressed($"{method.Method} {path}");
            _fake.Apply(method, pathAndQuery, jsonBody, _time.GetUtcNow());
            return new ApiResult(HttpStatusCode.NoContent, [], null);
        }
        var refreshed = false;
        var rateRetried = false;
        var serverTries = 0;
        var started = _time.GetTimestamp();
        TimeSpan Budget() => _gate.MaxWait - _time.GetElapsedTime(started);   // one wait budget for the gate across retries
        while (true)
        {
            if (!await _gate.AcquireAsync(priority, ct, Budget()).ConfigureAwait(false))
                throw new SpotifyApiException(ApiFailure.Dropped, 0, null, "Dropped by the client-side limiter.");
            var token = await _auth.GetAccessTokenAsync(ct).ConfigureAwait(false);
            if (token is null)
            {
                var state = _auth.State;
                throw new SpotifyApiException(state == AuthState.NeedsReconnect ? ApiFailure.Reconnect : ApiFailure.SignedOut, 0, null, "Not connected to Spotify.");
            }

            using var req = new HttpRequestMessage(method, Base + pathAndQuery);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (ifNoneMatch is not null) req.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
            if (jsonBody is not null) req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
            else if (method == HttpMethod.Put || method == HttpMethod.Post) req.Content = new ByteArrayContent([]);   // Content-Length: 0

            HttpResponseMessage resp;
            try { resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct).ConfigureAwait(false); }
            catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
            {
                _log.Debug($"{method} {path} failed: {ex.GetType().Name}");
                if (method == HttpMethod.Get && serverTries < 2)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1 << serverTries++), _time, ct).ConfigureAwait(false);
                    continue;
                }
                throw new SpotifyApiException(ApiFailure.Network, 0, null, "Spotify is unreachable.");
            }
            using (resp)
            {
                var status = (int)resp.StatusCode;
                var body = await resp.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
                _log.Debug($"{method} {path} -> {status}");
                if (resp.IsSuccessStatusCode || resp.StatusCode == HttpStatusCode.NotModified)
                {
                    _backoffLevel = 0;
                    Succeeded?.Invoke(this, EventArgs.Empty);
                    return new ApiResult(resp.StatusCode, body, resp.Headers.ETag?.ToString());
                }
                var err = ParseError(body);
                if (resp.StatusCode == HttpStatusCode.Unauthorized)
                {
                    if (!refreshed)
                    {
                        refreshed = true;
                        if (await _auth.RefreshAsync(token, ct).ConfigureAwait(false) is not null) continue;
                    }
                    _auth.MarkNeedsReconnect("401 after refresh");
                    throw new SpotifyApiException(ApiFailure.Reconnect, status, err?.Reason, "Spotify sign-in expired.");
                }
                if (resp.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    var quota = string.Equals(err?.Reason, "QUOTA_EXCEEDED", StringComparison.OrdinalIgnoreCase);
                    var wait = RetryAfter(resp) ?? NextBackoff();
                    var until = _time.GetUtcNow() + wait;
                    _gate.PauseUntil(until, quota);
                    _log.Warn($"Spotify 429 on {method} {path}: retry after {wait.TotalSeconds:0.#} s{(quota ? " (QUOTA_EXCEEDED)" : "")}.");
                    RateLimited?.Invoke(this, new RateLimitEventArgs(until, quota));
                    if (!quota && priority == RequestPriority.Command && !rateRetried && wait <= Budget())
                    {
                        rateRetried = true;
                        continue;   // a short pause: the gate holds us until it ends (within the wait budget)
                    }
                    throw new SpotifyApiException(quota ? ApiFailure.Quota : ApiFailure.RateLimited, status, err?.Reason, "Spotify rate limit.", wait);
                }
                if (status >= 500 && method == HttpMethod.Get && serverTries < 3)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1 << serverTries++), _time, ct).ConfigureAwait(false);
                    continue;
                }
                throw Map(status, err, path);
            }
        }
    }

    private static SpotifyApiException Map(int status, ApiError? err, string path)
    {
        var reason = err?.Reason;
        var message = err?.Message ?? "";
        var player = path.StartsWith("/me/player", StringComparison.Ordinal);
        var kind = status switch
        {
            400 => ApiFailure.BadRequest,
            403 when string.Equals(reason, "PREMIUM_REQUIRED", StringComparison.OrdinalIgnoreCase) => ApiFailure.PremiumRequired,
            403 when player && (message.Contains("Restriction violated", StringComparison.OrdinalIgnoreCase) || string.Equals(reason, "UNKNOWN", StringComparison.OrdinalIgnoreCase)) => ApiFailure.Restricted,
            403 when path == "/me" => ApiFailure.NotAllowed,
            403 => ApiFailure.Forbidden,
            404 when player || string.Equals(reason, "NO_ACTIVE_DEVICE", StringComparison.OrdinalIgnoreCase) => ApiFailure.NoActiveDevice,
            404 => ApiFailure.NotFound,
            >= 500 => ApiFailure.Server,
            _ => ApiFailure.BadRequest,
        };
        return new SpotifyApiException(kind, status, reason, string.IsNullOrEmpty(message) ? $"HTTP {status}" : message);
    }

    private TimeSpan? RetryAfter(HttpResponseMessage resp)
    {
        var h = resp.Headers.RetryAfter;
        if (h?.Delta is { } d && d > TimeSpan.Zero) return d;
        if (h?.Date is { } date)
        {
            var w = date - _time.GetUtcNow();
            if (w > TimeSpan.Zero) return w;
        }
        return null;
    }

    /// <summary>2 → 4 → 8 → … → 60 s with ±20% jitter.</summary>
    private TimeSpan NextBackoff()
    {
        var level = Math.Min(Interlocked.Increment(ref _backoffLevel), 6);
        var seconds = Math.Min(60, Math.Pow(2, level));
        var jitter = 1 + (Random.Shared.NextDouble() * 0.4 - 0.2);
        return TimeSpan.FromSeconds(seconds * jitter);
    }

    private static ApiError? ParseError(byte[] body)
    {
        if (body.Length == 0) return null;
        try { return JsonSerializer.Deserialize(body, SpotifyJsonContext.Default.ApiErrorEnvelope)?.Error; }
        catch (JsonException) { return null; }
    }

    private static T? Parse<T>(ApiResult r, JsonTypeInfo<T> info) where T : class
    {
        if (r.Body.Length == 0) return null;
        try { return JsonSerializer.Deserialize(r.Body, info); }
        catch (JsonException ex) { throw new SpotifyApiException(ApiFailure.Server, (int)r.Status, null, "Unexpected response: " + ex.Message); }
    }

    public static string RepeatWire(RepeatMode m) => m switch { RepeatMode.Context => "context", RepeatMode.Track => "track", _ => "off" };

    public static RepeatMode? ParseRepeat(string? s) => s switch
    {
        "context" => RepeatMode.Context,
        "track" => RepeatMode.Track,
        "off" => RepeatMode.Off,
        _ => null,
    };

    /// <summary>Builds "/path?k=v&amp;…", skipping null values.</summary>
    public static string Q(string path, params (string Key, string? Value)[] query)
    {
        var parts = query.Where(q => q.Value is not null).Select(q => q.Key + "=" + Uri.EscapeDataString(q.Value!)).ToList();
        return parts.Count == 0 ? path : path + "?" + string.Join('&', parts);
    }

    private static string PathOnly(string pathAndQuery)
    {
        var i = pathAndQuery.IndexOf('?');
        return i < 0 ? pathAndQuery : pathAndQuery[..i];
    }
}
