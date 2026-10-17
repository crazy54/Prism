using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Smtc;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

/// <summary>
/// Web API fixtures shaped like the OpenAPI snapshot (research/spotify-probe/spotify-openapi-snapshot-2026-10-16.yaml),
/// with fictional data only: "The Example Ensemble", EXAMPLE-PC, example IDs.
/// </summary>
public static class Fx
{
    public const string ClientId = "0123456789abcdef0123456789abcdef";
    public const string LocalDeviceId = "f1e2d3c4b5a6example00000000000000000000aa";
    public const string RemoteDeviceId = "0a9b8c7d6e5fexample00000000000000000000bb";
    public const string TrackUri = "spotify:track:4exampletrack00000001b";
    public const string Me = "exampleuser";

    public static string PlaylistId(int i) => $"6exampleplaylist{i:D6}";
    public static string PlaylistUri(int i) => "spotify:playlist:" + PlaylistId(i);
    public static string TrackUriAt(int playlist, int k) => $"spotify:track:4ex{playlist:D3}track{k:D10}";

    public static readonly string[] Names = ["Night Drive Mix", "Road Trip", "Focus Beats", "Rainy Day", "Morning Coffee", "Late Night Jazz"];
    public static string PlaylistName(int i) => i < Names.Length ? Names[i] : $"Example Mix {i + 1}";
    /// <summary>Every 7th playlist (3, 10, 17, …) is followed, not owned: Spotify won't list its tracks.</summary>
    public static bool Owned(int i) => i % 7 != 3;
    public static int TrackCount(int i) => i == 0 ? 48 : 10 + i % 40;

    public static JsonObject Image(string url, int? size) => new() { ["url"] = url, ["width"] = size, ["height"] = size };

    public static JsonArray AlbumImages(string key) =>
        [Image($"https://i.scdn.co/image/{key}-640", 640), Image($"https://i.scdn.co/image/{key}-300", 300), Image($"https://i.scdn.co/image/{key}-064", 64)];

    public static JsonObject Device(string id, string name, string type, bool active, int? volume = 62, bool supportsVolume = true, bool restricted = false) => new()
    {
        ["id"] = id, ["is_active"] = active, ["is_private_session"] = false, ["is_restricted"] = restricted,
        ["name"] = name, ["type"] = type, ["volume_percent"] = volume, ["supports_volume"] = supportsVolume,
    };

    /// <summary>GET /me/player (CurrentlyPlayingContextObject).</summary>
    public static string Player(bool playing = true, bool local = true, string title = "Night Drive", string uri = TrackUri, int? volume = 62,
        bool shuffle = false, string repeat = "off", long progress = 81_234, long duration = 221_386, int contextPlaylist = 0,
        bool nestedDisallows = true, bool isLocalFile = false, string imageKey = "examples-vol1")
    {
        var o = new JsonObject
        {
            ["device"] = local ? Device(LocalDeviceId, "EXAMPLE-PC", "Computer", true, volume) : Device(RemoteDeviceId, "Living Room", "Speaker", true, volume),
            ["repeat_state"] = repeat,
            ["shuffle_state"] = shuffle,
            ["context"] = new JsonObject
            {
                ["type"] = "playlist", ["uri"] = PlaylistUri(contextPlaylist),
                ["href"] = "https://api.spotify.com/v1/playlists/" + PlaylistId(contextPlaylist),
                ["external_urls"] = new JsonObject { ["spotify"] = "https://open.spotify.com/playlist/" + PlaylistId(contextPlaylist) },
            },
            ["timestamp"] = 1792180000000,
            ["progress_ms"] = progress,
            ["is_playing"] = playing,
            ["currently_playing_type"] = "track",
            ["item"] = new JsonObject
            {
                ["type"] = "track", ["id"] = uri.Split(':')[^1], ["uri"] = isLocalFile ? "spotify:local:Example+Artist:Example+Album:Demo+Take:127" : uri,
                ["name"] = title, ["duration_ms"] = duration, ["explicit"] = false, ["is_local"] = isLocalFile,
                ["artists"] = new JsonArray(new JsonObject { ["name"] = "The Example Ensemble", ["uri"] = "spotify:artist:1exampleartist0000001c" }),
                ["album"] = new JsonObject { ["name"] = "Examples Vol. 1", ["uri"] = "spotify:album:2examplealbum000000001d", ["images"] = AlbumImages(imageKey) },
                ["external_urls"] = new JsonObject { ["spotify"] = "https://open.spotify.com/track/" + uri.Split(':')[^1] },
            },
            ["actions"] = nestedDisallows
                ? new JsonObject { ["disallows"] = new JsonObject { ["resuming"] = playing } }
                : new JsonObject { ["resuming"] = playing, ["skipping_prev"] = false },
        };
        return o.ToJsonString();
    }

    public static string Devices(bool includeLocal = true) => new JsonObject
    {
        ["devices"] = includeLocal
            ? new JsonArray(Device(LocalDeviceId, "EXAMPLE-PC", "Computer", false), Device(RemoteDeviceId, "Living Room", "Speaker", false, 30))
            : new JsonArray(Device(RemoteDeviceId, "Living Room", "Speaker", false, 30)),
    }.ToJsonString();

    public static JsonObject PlaylistJson(int i)
    {
        var id = PlaylistId(i);
        var images = i % 5 == 4
            ? new JsonArray(Image("https://image-cdn-ak.spotifycdn.com/image/custom-" + id, null))
            : new JsonArray(Image($"https://mosaic.scdn.co/640/{id}", 640), Image($"https://mosaic.scdn.co/300/{id}", 300), Image($"https://mosaic.scdn.co/60/{id}", 60));
        var owner = Owned(i) ? Me : "examplefriend";
        return new JsonObject
        {
            ["id"] = id, ["uri"] = PlaylistUri(i), ["name"] = PlaylistName(i), ["collaborative"] = false, ["public"] = !Owned(i),
            ["snapshot_id"] = "AAAAexampleSnapshot" + i + "==",
            ["owner"] = new JsonObject { ["id"] = owner, ["display_name"] = Owned(i) ? "Example User" : "Example Friend", ["uri"] = "spotify:user:" + owner },
            ["images"] = images,
            ["items"] = new JsonObject { ["href"] = $"https://api.spotify.com/v1/playlists/{id}/items", ["total"] = TrackCount(i) },
            ["tracks"] = new JsonObject { ["href"] = $"https://api.spotify.com/v1/playlists/{id}/tracks", ["total"] = TrackCount(i) },
            ["external_urls"] = new JsonObject { ["spotify"] = "https://open.spotify.com/playlist/" + id },
            ["type"] = "playlist",
        };
    }

    /// <summary>GET /me/playlists page (limit 50).</summary>
    public static string PlaylistsPage(int offset, int total)
    {
        var items = new JsonArray();
        for (var i = offset; i < Math.Min(total, offset + 50); i++) items.Add(PlaylistJson(i));
        return new JsonObject
        {
            ["href"] = $"https://api.spotify.com/v1/me/playlists?offset={offset}&limit=50", ["limit"] = 50, ["offset"] = offset, ["total"] = total,
            ["next"] = offset + 50 < total ? $"https://api.spotify.com/v1/me/playlists?offset={offset + 50}&limit=50" : null, ["previous"] = null,
            ["items"] = items,
        }.ToJsonString();
    }

    /// <summary>GET /playlists/{id}/items page. Row 5 is a local file; rows use "item" (or the deprecated "track" with <paramref name="legacyTrackField"/>).</summary>
    public static string ItemsPage(int playlist, int offset, bool legacyTrackField = false, bool emptyRows = false)
    {
        var total = TrackCount(playlist);
        var items = new JsonArray();
        for (var k = offset; k < Math.Min(total, offset + 50); k++)
        {
            if (emptyRows) { items.Add(new JsonObject { ["is_local"] = false }); continue; }
            var local = k == 5;
            var item = new JsonObject
            {
                ["type"] = "track", ["id"] = local ? null : TrackUriAt(playlist, k).Split(':')[^1],
                ["uri"] = local ? "spotify:local:Example+Artist:Example+Album:Demo+Take:127" : TrackUriAt(playlist, k),
                ["name"] = local ? "Demo Take" : k == 0 ? "Night Drive" : $"Example Song {k + 1}",
                ["duration_ms"] = 180_000 + k * 1_000, ["is_local"] = local,
                ["artists"] = new JsonArray(new JsonObject { ["name"] = local ? "Example Artist" : "The Example Ensemble" }),
                ["album"] = new JsonObject
                {
                    ["name"] = local ? "Example Album" : "Examples Vol. 1",
                    ["images"] = local ? new JsonArray() : new JsonArray(Image($"https://i.scdn.co/image/t{playlist}-{k}-300", 300), Image($"https://i.scdn.co/image/t{playlist}-{k}-064", 64)),
                },
            };
            items.Add(new JsonObject { ["is_local"] = local, [legacyTrackField ? "track" : "item"] = item });
        }
        return new JsonObject
        {
            ["total"] = total, ["limit"] = 50, ["offset"] = offset,
            ["next"] = offset + 50 < total ? $"https://api.spotify.com/v1/playlists/{PlaylistId(playlist)}/items?offset={offset + 50}" : null,
            ["items"] = items,
        }.ToJsonString();
    }

    public static string Token(int n, bool includeRefresh = true) => new JsonObject
    {
        ["access_token"] = $"BQD-fake-access-token-{n}", ["token_type"] = "Bearer", ["scope"] = Pkce.Scopes, ["expires_in"] = 3600,
        ["refresh_token"] = includeRefresh ? $"AQC-fake-refresh-token-{n}" : null,
    }.ToJsonString();

    public static string MeJson => """{"id":"exampleuser","display_name":"Example User","account_id":"aB3dE5fG7h","type":"user","uri":"spotify:user:exampleuser"}""";

    /// <summary>Spotify's desktop app on this PC as SMTC reports it.</summary>
    public static SmtcSnapshot SmtcSpotify(string title = "Night Drive", PlayState state = PlayState.Playing, byte[]? thumb = null, DateTimeOffset? at = null) => new()
    {
        AppId = "Spotify.exe", IsSpotify = true, AppName = "Spotify", State = state, Title = title, Artist = "The Example Ensemble", Album = "Examples Vol. 1",
        Duration = TimeSpan.FromMilliseconds(221_386), Position = TimeSpan.FromMilliseconds(81_234), PositionAt = at ?? new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero),
        Shuffle = false, Repeat = PrismControl.Spotify.RepeatMode.Off,
        Thumbnail = thumb ?? FictionalArt.Png300, ThumbnailMime = "image/png", ThumbnailHash = SmtcSource.Hash(thumb ?? FictionalArt.Png300),
        CanPlay = true, CanPause = true, CanNext = true, CanPrevious = true, CanSeek = true, CanShuffle = true, CanRepeat = true,
    };

    public static async Task WaitUntil(Func<bool> condition, string what, int timeoutMs = 4000)
    {
        var sw = Stopwatch.StartNew();
        while (!condition())
        {
            if (sw.ElapsedMilliseconds > timeoutMs) throw new AssertException("timed out waiting for " + what);
            await Task.Delay(5);
        }
    }
}

/// <summary>
/// A SpotifyService wired to fakes: FakeHttp (api/accounts/CDN), FakeSmtc, an in-memory vault, a capturing log and a
/// manual clock. The default routes answer like a Premium account with 120 playlists playing on EXAMPLE-PC.
/// </summary>
public sealed class Rig : IAsyncDisposable
{
    public FakeHttp Http { get; } = new();
    public FakeSmtc Smtc { get; } = new();
    public MemoryVault Vault { get; } = new();
    public CaptureLog Log { get; } = new();
    public ManualTimeProvider Time { get; } = new();
    public SpotifyService Service { get; private set; } = null!;

    /// <summary>The /me/player body (null = 204 No Content).</summary>
    public Func<string?> PlayerJson { get; set; } = () => Fx.Player();
    public int PlaylistTotal { get; set; } = 120;
    public bool Liked { get; set; }
    public bool LocalDeviceListed { get; set; } = true;
    public int TokenCounter;
    /// <summary>"spotify:" launches the service asked for (the launcher itself never starts anything).</summary>
    public int Launches;

    public Action<PrismControl.Core.Hosting.ServiceRegistry> Services => s => s.Add(Service);

    public static async Task<Rig> StartAsync(bool connected = true, Action<Rig>? configure = null, GateOptions? gate = null, AuthOptions? auth = null, bool start = true,
        bool safeMode = false)
    {
        var rig = new Rig();
        rig.InstallRoutes();
        if (connected) rig.SeedTokens();
        configure?.Invoke(rig);
        rig.Service = new SpotifyService(rig.Smtc, rig.Vault, rig.Time, rig.Log, rig.Http, new SpotifyServiceOptions
        {
            Gate = gate ?? new GateOptions { Burst = 10_000, RatePerSecond = 10_000, MaxPerMinute = 100_000 },
            Auth = auth ?? new AuthOptions { Port = 0, AllowFallbackPort = true },
            MachineName = "EXAMPLE-PC",
            SafeMode = safeMode,
            LaunchUri = _ => { Interlocked.Increment(ref rig.Launches); return false; },
            DeviceWait = TimeSpan.FromSeconds(2),
        });
        if (start) await rig.Service.StartAsync(CancellationToken.None);
        return rig;
    }

    public void SeedTokens(DateTimeOffset? expiresAt = null)
    {
        Vault.Save(SpotifyAuth.ClientSecretName, Fx.ClientId);
        Vault.Save(SpotifyAuth.TokensSecret, JsonSerializer.Serialize(new StoredTokens
        {
            ClientId = Fx.ClientId, AccessToken = "BQD-fake-access-token-0", RefreshToken = "AQC-fake-refresh-token-0", Scope = Pkce.Scopes,
            ExpiresAt = expiresAt ?? Time.GetUtcNow().AddHours(1), AuthorizedAt = Time.GetUtcNow().AddDays(-1), AccountLabel = "Example User", UserId = Fx.Me,
        }, SpotifyJsonContext.Default.StoredTokens));
    }

    private static int OffsetOf(SeenRequest r)
    {
        var q = Auth.LoopbackReceiver.ParseQuery(r.Uri.PathAndQuery);
        return q.TryGetValue("offset", out var o) && int.TryParse(o, out var v) ? v : 0;
    }

    private void InstallRoutes()
    {
        const string api = "api.spotify.com/v1";
        Http.On(HttpMethod.Get, api + "/me/player", _ => PlayerJson() is { } j ? FakeHttp.Json(j) : FakeHttp.Status(HttpStatusCode.NoContent))
            .OnJson(HttpMethod.Get, api + "/me/player/devices", _ => Fx.Devices(LocalDeviceListed))
            .On(HttpMethod.Put, api + "/me/player/play", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player/pause", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Post, api + "/me/player/next", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Post, api + "/me/player/previous", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player/shuffle", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player/repeat", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player/volume", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player/seek", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .On(HttpMethod.Put, api + "/me/player", _ => FakeHttp.Status(HttpStatusCode.NoContent))
            .OnJson(HttpMethod.Get, api + "/me", _ => Fx.MeJson)
            .OnJson(HttpMethod.Get, api + "/me/playlists", r => Fx.PlaylistsPage(OffsetOf(r), PlaylistTotal))
            .On(HttpMethod.Get, api + "/playlists/", r =>
            {
                var id = r.Path.Split('/')[3];
                var i = int.Parse(id["6exampleplaylist".Length..], System.Globalization.CultureInfo.InvariantCulture);
                return Fx.Owned(i) ? FakeHttp.Json(Fx.ItemsPage(i, OffsetOf(r))) : FakeHttp.Error(HttpStatusCode.Forbidden, "Forbidden");
            }, prefix: true)
            .OnJson(HttpMethod.Get, api + "/me/library/contains", _ => Liked ? "[true]" : "[false]")
            .On(HttpMethod.Put, api + "/me/library", _ => { Liked = true; return FakeHttp.Status(HttpStatusCode.OK); })
            .On(HttpMethod.Delete, api + "/me/library", _ => { Liked = false; return FakeHttp.Status(HttpStatusCode.OK); })
            .On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => FakeHttp.Json(Fx.Token(Interlocked.Increment(ref TokenCounter))))
            .On(HttpMethod.Get, "i.scdn.co/image/", r => FakeHttp.Image(r.Path.EndsWith("-064", StringComparison.Ordinal) ? FictionalArt.Jpeg64 : FictionalArt.Jpeg300), prefix: true)
            .On(HttpMethod.Get, "mosaic.scdn.co/", r => FakeHttp.Image(r.Path.StartsWith("/60/", StringComparison.Ordinal) ? FictionalArt.Jpeg64Alt : FictionalArt.Jpeg300Alt), prefix: true)
            .On(HttpMethod.Get, "image-cdn-ak.spotifycdn.com/", _ => FakeHttp.Image(FictionalArt.WidePng, "image/png"), prefix: true);
    }

    /// <summary>Lets the background poll loop and event handlers run.</summary>
    public async Task SettleAsync(int ms = 30)
    {
        Time.Advance(TimeSpan.Zero);
        await Task.Delay(ms);
    }

    public async ValueTask DisposeAsync() => await Service.DisposeAsync();
}
