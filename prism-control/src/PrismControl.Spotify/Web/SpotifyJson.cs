using System.Text.Json;
using System.Text.Json.Serialization;

namespace PrismControl.Spotify.Web;

// Wire shapes for the Spotify Web API and accounts service (OpenAPI snapshot 2026-10-16), trimmed to what we read.
// Unknown fields are ignored: Spotify adds fields and removes some per quota mode.

public sealed class TokenResponse
{
    public string? AccessToken { get; set; }
    public string? TokenType { get; set; }
    public string? Scope { get; set; }
    public int ExpiresIn { get; set; }
    public string? RefreshToken { get; set; }
}

public sealed class OAuthError
{
    public string? Error { get; set; }
    public string? ErrorDescription { get; set; }
}

public sealed class ApiErrorEnvelope
{
    public ApiError? Error { get; set; }
}

public sealed class ApiError
{
    public int Status { get; set; }
    public string? Message { get; set; }
    /// <summary>Optional: NO_ACTIVE_DEVICE, PREMIUM_REQUIRED, QUOTA_EXCEEDED, UNKNOWN, ...</summary>
    public string? Reason { get; set; }
}

public sealed class ExternalUrls
{
    public string? Spotify { get; set; }
}

public sealed class ImageDto
{
    public string? Url { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
}

public sealed class ArtistDto
{
    public string? Name { get; set; }
    public string? Uri { get; set; }
}

public sealed class AlbumDto
{
    public string? Name { get; set; }
    public string? Uri { get; set; }
    public List<ImageDto>? Images { get; set; }
}

public sealed class ShowDto
{
    public string? Name { get; set; }
    public List<ImageDto>? Images { get; set; }
}

/// <summary>A TrackObject or EpisodeObject (discriminated by <see cref="Type"/>).</summary>
public sealed class ItemDto
{
    public string? Type { get; set; }
    public string? Id { get; set; }
    public string? Uri { get; set; }
    public string? Name { get; set; }
    public long DurationMs { get; set; }
    public bool IsLocal { get; set; }
    public bool? IsPlayable { get; set; }
    public List<ArtistDto>? Artists { get; set; }
    public AlbumDto? Album { get; set; }
    /// <summary>Episodes carry their own images.</summary>
    public List<ImageDto>? Images { get; set; }
    public ShowDto? Show { get; set; }
    public ExternalUrls? ExternalUrls { get; set; }
}

public sealed class DeviceDto
{
    public string? Id { get; set; }
    public bool IsActive { get; set; }
    public bool IsPrivateSession { get; set; }
    public bool IsRestricted { get; set; }
    public string? Name { get; set; }
    public string? Type { get; set; }
    public int? VolumePercent { get; set; }
    public bool SupportsVolume { get; set; }
}

public sealed class DevicesDto
{
    public List<DeviceDto>? Devices { get; set; }
}

public sealed class ContextDto
{
    public string? Type { get; set; }
    public string? Uri { get; set; }
    public string? Href { get; set; }
    public ExternalUrls? ExternalUrls { get; set; }
}

/// <summary>GET /me/player (CurrentlyPlayingContextObject).</summary>
public sealed class PlaybackStateDto
{
    public DeviceDto? Device { get; set; }
    public string? RepeatState { get; set; }
    public bool ShuffleState { get; set; }
    public ContextDto? Context { get; set; }
    public long Timestamp { get; set; }
    public long? ProgressMs { get; set; }
    public bool IsPlaying { get; set; }
    public ItemDto? Item { get; set; }
    public string? CurrentlyPlayingType { get; set; }
    /// <summary>The 2026 reference puts booleans directly here; live responses have long nested them under "disallows". Parse both.</summary>
    public JsonElement? Actions { get; set; }
}

public sealed class OwnerDto
{
    public string? Id { get; set; }
    public string? DisplayName { get; set; }
}

public sealed class TracksRefDto
{
    public string? Href { get; set; }
    public int Total { get; set; }
}

/// <summary>SimplifiedPlaylistObject from GET /me/playlists.</summary>
public sealed class PlaylistDto
{
    public string? Id { get; set; }
    public string? Uri { get; set; }
    public string? Name { get; set; }
    public bool Collaborative { get; set; }
    public bool? Public { get; set; }
    public string? SnapshotId { get; set; }
    public OwnerDto? Owner { get; set; }
    public List<ImageDto>? Images { get; set; }
    /// <summary>The item count ("items.total"); <see cref="Tracks"/> is the deprecated twin.</summary>
    public TracksRefDto? Items { get; set; }
    public TracksRefDto? Tracks { get; set; }
    public ExternalUrls? ExternalUrls { get; set; }
}

/// <summary>PlaylistTrackObject: the row field was renamed track → item (Feb 2026); parse item ?? track.</summary>
public sealed class PlaylistItemRowDto
{
    public bool IsLocal { get; set; }
    public ItemDto? Item { get; set; }
    public ItemDto? Track { get; set; }
}

public sealed class PagingDto<T>
{
    public string? Href { get; set; }
    public int Limit { get; set; }
    public int Offset { get; set; }
    public int Total { get; set; }
    public string? Next { get; set; }
    public List<T>? Items { get; set; }
}

public sealed class MeDto
{
    public string? Id { get; set; }
    public string? DisplayName { get; set; }
    public string? AccountId { get; set; }
}

public sealed class OffsetDto
{
    public int? Position { get; set; }
    public string? Uri { get; set; }
}

/// <summary>PUT /me/player/play body.</summary>
public sealed class PlayBody
{
    public string? ContextUri { get; set; }
    public OffsetDto? Offset { get; set; }
    public List<string>? Uris { get; set; }
    public long? PositionMs { get; set; }
}

public sealed class TransferBody
{
    public List<string> DeviceIds { get; set; } = [];
    public bool Play { get; set; }
}

/// <summary>What we keep in the DPAPI store (never in settings or logs).</summary>
public sealed class StoredTokens
{
    public int V { get; set; } = 1;
    public string? ClientId { get; set; }
    public string? AccessToken { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public string? RefreshToken { get; set; }
    public string? Scope { get; set; }
    public DateTimeOffset AuthorizedAt { get; set; }
    public string? AccountLabel { get; set; }
    public string? UserId { get; set; }
    /// <summary>The redirect URI used at authorization (must match on the token exchange; kept for diagnostics).</summary>
    public string? RedirectUri { get; set; }
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    NumberHandling = JsonNumberHandling.AllowReadingFromString)]
[JsonSerializable(typeof(TokenResponse))]
[JsonSerializable(typeof(OAuthError))]
[JsonSerializable(typeof(ApiErrorEnvelope))]
[JsonSerializable(typeof(PlaybackStateDto))]
[JsonSerializable(typeof(DevicesDto))]
[JsonSerializable(typeof(PagingDto<PlaylistDto>))]
[JsonSerializable(typeof(PagingDto<PlaylistItemRowDto>))]
[JsonSerializable(typeof(MeDto))]
[JsonSerializable(typeof(PlayBody))]
[JsonSerializable(typeof(TransferBody))]
[JsonSerializable(typeof(StoredTokens))]
[JsonSerializable(typeof(List<bool>))]
public sealed partial class SpotifyJsonContext : JsonSerializerContext;

/// <summary>Reads the "actions" object of /me/player in both shapes (flat booleans or nested under "disallows").</summary>
public static class Disallows
{
    public static bool Has(JsonElement? actions, string name)
    {
        if (actions is not { ValueKind: JsonValueKind.Object } a) return false;
        if (a.TryGetProperty("disallows", out var nested) && nested.ValueKind == JsonValueKind.Object
            && nested.TryGetProperty(name, out var v1) && v1.ValueKind == JsonValueKind.True) return true;
        return a.TryGetProperty(name, out var v2) && v2.ValueKind == JsonValueKind.True;
    }
}
