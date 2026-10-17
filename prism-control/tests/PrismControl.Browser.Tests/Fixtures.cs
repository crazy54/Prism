using System.Buffers.Binary;
using System.Collections.Immutable;
using System.IO.Compression;
using System.Text.Json.Nodes;
using PrismControl.Browser.Hub;
using PrismControl.Browser.Protocol;
using PrismControl.Browser.State;

namespace PrismControl.Browser.Tests;

/// <summary>
/// Fictional fixtures: .example sites, made-up titles, generated abstract images (no real favicon, logo or artwork).
/// </summary>
public static class Fx
{
    public const string ChromeKey = "chrome:p1";
    public const string EdgeKey = "msedge:p2";
    public static readonly string Origin = Wire.OriginFor(Wire.ExtensionId);

    // ------------------------------------------------------------------ images (generated)

    /// <summary>A tiny RGBA PNG from a pixel function.</summary>
    public static byte[] Png(int w, int h, Func<int, int, (byte R, byte G, byte B, byte A)> px)
    {
        var raw = new byte[(w * 4 + 1) * h];
        for (var y = 0; y < h; y++)
        {
            raw[y * (w * 4 + 1)] = 0;
            for (var x = 0; x < w; x++)
            {
                var (r, g, b, a) = px(x, y);
                var o = y * (w * 4 + 1) + 1 + x * 4;
                raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
            }
        }
        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        var ihdr = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr, w);
        BinaryPrimitives.WriteInt32BigEndian(ihdr.AsSpan(4), h);
        ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        Chunk(ms, "IHDR", ihdr);
        using (var z = new MemoryStream())
        {
            using (var zs = new ZLibStream(z, CompressionLevel.Optimal, leaveOpen: true)) zs.Write(raw);
            Chunk(ms, "IDAT", z.ToArray());
        }
        Chunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, byte[] data)
    {
        Span<byte> len = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(len, data.Length);
        s.Write(len);
        var t = System.Text.Encoding.ASCII.GetBytes(type);
        s.Write(t);
        s.Write(data);
        var crc = Crc32(t, data);
        Span<byte> c = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(c, crc);
        s.Write(c);
    }

    private static uint Crc32(byte[] a, byte[] b)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var arr in new[] { a, b })
            foreach (var x in arr)
            {
                crc ^= x;
                for (var k = 0; k < 8; k++) crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
            }
        return ~crc;
    }

    /// <summary>An abstract 32 px "favicon": a rounded square in a color with a lighter inner ring (fictional, generic).</summary>
    public static byte[] Favicon(byte r, byte g, byte b, int shape = 0) => Png(32, 32, (x, y) =>
    {
        double dx = x - 15.5, dy = y - 15.5;
        var d = Math.Sqrt(dx * dx + dy * dy);
        var inSquare = Math.Max(Math.Abs(dx), Math.Abs(dy)) < 15 && (Math.Abs(dx) < 11 || Math.Abs(dy) < 11 || Math.Sqrt(Math.Pow(Math.Abs(dx) - 11, 2) + Math.Pow(Math.Abs(dy) - 11, 2)) < 4);
        if (!inSquare) return (0, 0, 0, 0);
        var ring = shape switch
        {
            1 => Math.Abs(dx) < 3 || Math.Abs(dy) < 3,       // plus
            2 => d is > 6 and < 10,                           // ring
            _ => d < 6,                                        // dot
        };
        return ring ? ((byte)Math.Min(255, r + 110), (byte)Math.Min(255, g + 110), (byte)Math.Min(255, b + 110), (byte)255) : (r, g, b, (byte)255);
    });

    public static readonly byte[] FavRed = Favicon(196, 48, 64, 2);
    public static readonly byte[] FavBlue = Favicon(40, 96, 200, 0);
    public static readonly byte[] FavGreen = Favicon(32, 150, 96, 1);
    public static readonly byte[] FavAmber = Favicon(210, 140, 30, 2);

    /// <summary>Abstract "album art": diagonal color bands (fictional).</summary>
    public static byte[] Art(int px = 144, int seed = 0) => Png(px, px, (x, y) =>
    {
        var t = (x + y * (seed == 0 ? 1.0 : 0.6)) / (px * 2.0);
        var band = (int)(t * 6) % 3;
        var (r, g, b) = (seed, band) switch
        {
            (0, 0) => (40, 32, 96), (0, 1) => (210, 90, 120), (0, _) => (250, 190, 110),
            (_, 0) => (20, 70, 80), (_, 1) => (60, 170, 160), (_, _) => (230, 240, 200),
        };
        var shade = 0.75 + 0.25 * Math.Sin((x - y) / 9.0);
        return ((byte)(r * shade), (byte)(g * shade), (byte)(b * shade), (byte)255);
    });

    public static readonly byte[] ArtA = Art(144, 0);
    public static readonly byte[] ArtB = Art(144, 1);

    /// <summary>A fictional "page" preview frame (JPEG is what the wire carries; the store only needs PNG/JPEG bytes).</summary>
    public static byte[] PreviewFrame(int w = 360, int h = 180) => Png(w, h, (x, y) =>
    {
        if (y < 18) return (36, 40, 52, 255);                               // toolbar
        if (x > 20 && x < 220 && y > 34 && y < 44) return (220, 222, 230, 255); // heading
        if (x > 20 && x < 300 && (y - 56) % 14 is > 0 and < 6 && y < 150) return (150, 154, 170, 255);
        if (x > 250 && x < 340 && y > 60 && y < 150) return (80, 140, 200, 255);   // image block
        return (246, 246, 250, 255);
    });

    public static string Hash(byte[] bytes) => Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(bytes))[..16].ToLowerInvariant();

    public static StoredImage Stored(string id, byte[] png)
    {
        var info = PrismControl.Core.Render.ImageInfo.Probe(png)!;
        return new StoredImage(id, info.Mime, info.Width, info.Height, png);
    }

    // ------------------------------------------------------------------ wire frames

    public static JsonObject Envelope(string t, JsonObject? data, int seq = 1) =>
        new() { ["v"] = 1, ["t"] = t, ["seq"] = seq, ["at"] = 1_792_212_345_678, ["data"] = data ?? new JsonObject() };

    public static JsonObject Preamble(string? token, string? origin = null, int pid = 4242, string exe = "chrome.exe", int v = 1) => new()
    {
        ["t"] = "relay",
        ["v"] = v,
        ["token"] = token,
        ["origin"] = origin ?? Origin,
        ["browserPid"] = pid,
        ["browserExe"] = @"C:\Program Files\Example\" + exe,
        ["relayVersion"] = "0.1.0",
    };

    public static JsonObject Hello(string uid = "p1", string brand = "Google Chrome", string privacy = "full", bool downloads = true, bool groups = true, bool sessions = true, bool allUrls = false, string? extId = null) =>
        Envelope("hello", new JsonObject
        {
            ["proto"] = 1,
            ["ext"] = new JsonObject { ["id"] = extId ?? Wire.ExtensionId, ["version"] = "0.1.0" },
            ["browser"] = new JsonObject { ["brand"] = brand, ["major"] = 155 },
            ["profile"] = new JsonObject { ["uid"] = uid, ["label"] = "Work" },
            ["caps"] = new JsonObject
            {
                ["tabs"] = true, ["favicon"] = true, ["downloads"] = downloads, ["tabGroups"] = groups, ["sessions"] = sessions,
                ["scripting"] = true, ["allUrls"] = allUrls, ["split"] = true, ["hostAccessRequest"] = true,
                ["grantedOrigins"] = new JsonArray("https://video.example/*"),
            },
            ["privacy"] = privacy,
        });

    public static JsonObject Tab(int id, int win, int idx, string title, string domain, bool active = false, bool audible = false, bool muted = false,
        int? unread = null, string? icon = null, bool pinned = false, int group = -1, string access = "granted", long? lastAccessed = null) => new()
    {
        ["id"] = id, ["win"] = win, ["idx"] = idx, ["active"] = active, ["pinned"] = pinned, ["audible"] = audible, ["muted"] = muted,
        ["title"] = title, ["url"] = $"https://{domain}/page", ["domain"] = domain, ["unread"] = unread, ["status"] = "complete",
        ["discarded"] = false, ["frozen"] = false, ["group"] = group, ["split"] = -1, ["lastAccessed"] = lastAccessed ?? 1_792_212_000_000 + id,
        ["access"] = access, ["icon"] = icon ?? "glyph:globe", ["hidden"] = null,
    };

    public static JsonObject Window(int id, bool focused, int left = 0, int top = 0, int width = 1280, int height = 800, string state = "normal") => new()
    {
        ["id"] = id, ["focused"] = focused, ["state"] = state, ["type"] = "normal", ["left"] = left, ["top"] = top, ["width"] = width, ["height"] = height,
    };

    public static JsonObject Media(string key, int tabId, string state = "playing", string? title = "Night Drive", string? artist = "The Example Ensemble",
        long duration = 221_000, long position = 81_000, double rate = 1, double? volume = 0.8, string[]? actions = null, string? artImg = null, string? artUrl = null,
        bool live = false, bool? mic = null, bool? camera = null) => new()
    {
        ["key"] = key, ["tabId"] = tabId, ["frameId"] = 0, ["kind"] = "video", ["state"] = state, ["title"] = title, ["artist"] = artist, ["album"] = null,
        ["art"] = artImg is null && artUrl is null ? null : new JsonObject { ["url"] = artUrl, ["img"] = artImg },
        ["chapters"] = new JsonArray(), ["durationMs"] = live ? null : duration, ["live"] = live, ["positionMs"] = position, ["positionAt"] = 1_792_212_345_000,
        ["rate"] = rate, ["volume"] = volume, ["elementMuted"] = false, ["pip"] = false,
        ["actions"] = new JsonArray([.. (actions ?? ["play", "pause", "seekto", "nexttrack", "previoustrack"]).Select(a => (JsonNode)JsonValue.Create(a)!)]),
        ["mic"] = mic, ["camera"] = camera, ["source"] = "mediasession+element", ["domain"] = "video.example", ["hidden"] = null,
    };

    public static JsonObject Download(int id, string state = "in_progress", string name = "example-report.zip", long bytes = 4_200_000, long? total = 10_000_000, string danger = "safe") => new()
    {
        ["id"] = id, ["state"] = state, ["name"] = name, ["bytes"] = bytes, ["total"] = total, ["etaAt"] = null, ["paused"] = false, ["canResume"] = false,
        ["danger"] = danger, ["error"] = null, ["exists"] = true, ["icon"] = null, ["hidden"] = null,
    };

    public static JsonObject Group(int id, int win, string title, string color, bool collapsed = false) => new()
    {
        ["id"] = id, ["win"] = win, ["title"] = title, ["color"] = color, ["collapsed"] = collapsed, ["hidden"] = null,
    };

    /// <summary>A typical Chrome profile: two windows, five tabs (one audible video, one mail tab with unread), a group, a download.</summary>
    public static JsonObject StateFull(string privacy = "full") => Envelope("state.full", new JsonObject
    {
        ["privacy"] = privacy,
        ["windows"] = new JsonArray(Window(1, true), Window(2, false, 100, 100)),
        ["tabs"] = new JsonArray(
            Tab(11, 1, 0, "Inbox (3) - Example Mail", "mail.example", unread: 3, icon: "fav:" + Hash(FavRed), pinned: true),
            Tab(12, 1, 1, "Night Drive - Example Video", "video.example", active: true, audible: true, icon: "fav:" + Hash(FavBlue), group: 7),
            Tab(13, 1, 2, "Quarterly Plan Draft - Example Docs", "docs.example", icon: "fav:" + Hash(FavGreen), group: 7),
            Tab(14, 1, 3, "Example News: Local Team Wins", "news.example", icon: "fav:" + Hash(FavAmber)),
            Tab(21, 2, 0, "Recipes for Rainy Days", "food.example", active: true)),
        ["groups"] = new JsonArray(Group(7, 1, "Research", "blue")),
        ["media"] = new JsonArray(Media("12:0", 12, artImg: "art:" + Hash(ArtA))),
        ["downloads"] = new JsonArray(Download(501)),
        ["activeByWindow"] = new JsonObject { ["1"] = 12, ["2"] = 21 },
        ["focusedWindow"] = 1,
    });

    public static JsonObject Img(string id, byte[] png) => Envelope("img", new JsonObject
    {
        ["id"] = id, ["mime"] = "image/png", ["w"] = 32, ["h"] = 32, ["b64"] = Convert.ToBase64String(png),
    });

    public static IEnumerable<JsonObject> StandardImages() =>
    [
        Img("fav:" + Hash(FavRed), FavRed), Img("fav:" + Hash(FavBlue), FavBlue), Img("fav:" + Hash(FavGreen), FavGreen),
        Img("fav:" + Hash(FavAmber), FavAmber), Img("art:" + Hash(ArtA), ArtA),
    ];

    // ------------------------------------------------------------------ store seeding (no session)

    /// <summary>Builds a connected instance from wire objects, through the real parser and privacy filter.</summary>
    public static BrowserInstance Instance(string key = ChromeKey, string exe = "chrome.exe", JsonObject? full = null, string privacy = "full", BrowserCaps? caps = null, int pid = 4242)
    {
        var d = (full ?? StateFull(privacy))["data"]!.AsObject();
        var tabs = d["tabs"]!.AsArray().OfType<JsonObject>().Select(o => PrivacyFilter.Apply(WireParser.MergeTab(null, o)!, privacy)).ToImmutableDictionary(t => t.Id);
        var windows = d["windows"]!.AsArray().OfType<JsonObject>().Select(o => WireParser.MergeWindow(null, o)!).ToImmutableDictionary(w => w.Id);
        var groups = d["groups"]!.AsArray().OfType<JsonObject>().Select(o => PrivacyFilter.Apply(WireParser.MergeGroup(null, o)!, privacy)).ToImmutableDictionary(g => g.Id);
        var media = d["media"]!.AsArray().OfType<JsonObject>().Select(o => PrivacyFilter.Apply(WireParser.MergeMedia(null, o)!, privacy)).ToImmutableDictionary(m => m.Key, StringComparer.Ordinal);
        var downloads = d["downloads"]!.AsArray().OfType<JsonObject>().Select(o => PrivacyFilter.Apply(WireParser.MergeDownload(null, o)!, privacy)).ToImmutableDictionary(x => x.Id);
        var focused = WireParser.Int(d, "focusedWindow") is { } f && f >= 0 ? f : (int?)null;
        return new BrowserInstance
        {
            Key = key,
            SessionId = "seed-" + key,
            Brand = BrowserSession.BrandFor(exe, null),
            Exe = exe,
            Pid = pid,
            Major = 155,
            ProfileUid = key.Split(':')[1],
            ProfileLabel = "Work",
            ExtVersion = "0.1.0",
            Caps = caps ?? new BrowserCaps { Tabs = true, Favicon = true, Downloads = true, TabGroups = true, Sessions = true, Scripting = true, Split = true, HostAccessRequest = true },
            Privacy = privacy,
            Connected = true,
            Synced = true,
            ConnectedAt = 1,
            FocusedAt = 10,
            FocusedWindowId = focused,
            LastFocusedWindowId = focused,
            Tabs = tabs,
            Windows = windows,
            Groups = groups,
            Media = media,
            Downloads = downloads,
        };
    }

    public static void PutStandardImages(ImageStore images)
    {
        images.Put(Stored("fav:" + Hash(FavRed), FavRed));
        images.Put(Stored("fav:" + Hash(FavBlue), FavBlue));
        images.Put(Stored("fav:" + Hash(FavGreen), FavGreen));
        images.Put(Stored("fav:" + Hash(FavAmber), FavAmber));
        images.Put(Stored("art:" + Hash(ArtA), ArtA));
    }
}
