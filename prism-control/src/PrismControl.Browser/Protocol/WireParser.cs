using System.Collections.Immutable;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace PrismControl.Browser.Protocol;

/// <summary>
/// Turns untrusted frames into models. Everything from the extension is page-influenced data (titles, media metadata,
/// MAIN-world hooks): sizes are capped, strings cleaned of control characters, unknown fields ignored, URLs kept only
/// when http(s), and nothing is ever evaluated. Parsing never throws: bad fields keep their previous/default value.
/// </summary>
public static partial class WireParser
{
    [GeneratedRegex("^(fav|glyph):[a-z0-9-]{1,64}$")]
    private static partial Regex IconPattern();

    [GeneratedRegex("^(fav|art|img|file):[a-z0-9-]{1,64}$")]
    private static partial Regex ImageIdPattern();

    [GeneratedRegex("^[0-9]{1,10}:[0-9]{1,10}(:[0-9]{1,6})?$")]
    private static partial Regex MediaKeyPattern();

    [GeneratedRegex("^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)*$")]
    private static partial Regex HostPattern();

    [GeneratedRegex("^[a-z0-9_-]{1,64}$")]
    private static partial Regex TokenPattern();

    // ------------------------------------------------------------------ envelope

    /// <summary>Depth of a JSON tree (objects and arrays), computed without recursion.</summary>
    public static int Depth(JsonNode? root)
    {
        if (root is null) return 0;
        var max = 0;
        var stack = new Stack<(JsonNode Node, int Depth)>();
        stack.Push((root, 1));
        while (stack.Count > 0)
        {
            var (n, d) = stack.Pop();
            if (d > max) max = d;
            if (d > Wire.Limits.MaxDepth + 1) return d;   // early out: far too deep already
            switch (n)
            {
                case JsonObject o:
                    foreach (var (_, v) in o) if (v is JsonObject or JsonArray) stack.Push((v, d + 1));
                    break;
                case JsonArray a:
                    foreach (var v in a) if (v is JsonObject or JsonArray) stack.Push((v!, d + 1));
                    break;
            }
        }
        return max;
    }

    /// <summary>The envelope type, or null when the frame is not a v1 object frame.</summary>
    public static string? TypeOf(JsonNode? frame, bool requireVersion = true)
    {
        if (frame is not JsonObject o) return null;
        var t = Str(o, "t", 32, clean: false);
        if (t is null || !TokenLike(t)) return null;
        if (!requireVersion) return t;
        return Int(o, "v") == Wire.Proto ? t : null;
    }

    private static bool TokenLike(string s)
    {
        foreach (var c in s) if (!(char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-')) return false;
        return s.Length > 0;
    }

    public static JsonObject? Data(JsonNode? frame) => (frame as JsonObject)?["data"] as JsonObject;

    // ------------------------------------------------------------------ preamble + hello

    public static RelayInfo? ParseRelay(JsonObject o, out string? token)
    {
        token = Str(o, "token", 256, clean: false);
        var origin = Str(o, "origin", 128, clean: false);
        var pid = Int(o, "browserPid") ?? 0;
        var exe = Str(o, "browserExe", 260) ?? "";
        var version = Str(o, "relayVersion", 32) ?? "";
        if (origin is null) return null;
        return new RelayInfo(origin, pid, Path.GetFileName(exe), version);
    }

    /// <param name="ProfileUid">The profile's random uid, lower case; "" when it is missing or malformed (the session then
    /// ignores the hello: an extension that has not finished loading its settings must not open a session, MED 10).</param>
    public sealed record Hello(int Proto, string ExtId, string ExtVersion, string Brand, int Major, string ProfileUid, string ProfileLabel, BrowserCaps Caps, string Privacy,
        PrivacySettings? Settings = null);

    public static Hello? ParseHello(JsonObject? d)
    {
        if (d is null) return null;
        var proto = Int(d, "proto") ?? 0;
        var ext = d["ext"] as JsonObject;
        var browser = d["browser"] as JsonObject;
        var profile = d["profile"] as JsonObject;
        var caps = d["caps"] as JsonObject;
        var uid = profile is null ? null : Str(profile, "uid", 64, clean: false);
        if (uid is not null && !TokenPattern().IsMatch(uid.ToLowerInvariant())) uid = null;
        return new Hello(
            proto,
            ext is null ? "" : Str(ext, "id", 64, clean: false) ?? "",
            ext is null ? "" : Str(ext, "version", 32) ?? "",
            browser is null ? "" : Str(browser, "brand", 48) ?? "",
            browser is null ? 0 : Int(browser, "major") ?? 0,
            uid?.ToLowerInvariant() ?? "",
            profile is null ? "" : Str(profile, "label", Wire.Limits.ProfileLabel) ?? "",
            ParseCaps(caps, null),
            Wire.Privacy.Normalize(Str(d, "privacy", 16, clean: false) ?? Wire.Privacy.Full),
            ParsePrivacySettings(d["privacySettings"] as JsonObject));
    }

    /// <summary>
    /// <c>privacySettings {base, whileStreaming, alwaysHidden}</c> (hello and state.full). Unknown levels count as the
    /// strictest (hidden), a missing count as 0; null when the object is absent (an older extension).
    /// </summary>
    public static PrivacySettings? ParsePrivacySettings(JsonObject? o)
    {
        if (o is null) return null;
        var b = Str(o, "base", 16, clean: false);
        var ws = Str(o, "whileStreaming", 16, clean: false);
        var count = Int(o, "alwaysHidden") is { } n ? Math.Clamp(n, 0, 10_000) : 0;
        return new PrivacySettings(
            b is null ? Wire.Privacy.Full : Wire.Privacy.Normalize(b),
            ws is null ? Wire.Privacy.Domain : Wire.Privacy.Normalize(ws),
            count);
    }

    public static BrowserCaps ParseCaps(JsonObject? c, BrowserCaps? prev)
    {
        var b = prev ?? new BrowserCaps();
        if (c is null) return b;
        var origins = b.GrantedOrigins;
        if (c["grantedOrigins"] is JsonArray arr)
            origins = [.. arr.Take(256).Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) && s.Length <= 256 ? s : null).Where(s => s is not null)!];
        return b with
        {
            Tabs = Bool(c, "tabs") ?? b.Tabs,
            Favicon = Bool(c, "favicon") ?? b.Favicon,
            Downloads = Bool(c, "downloads") ?? b.Downloads,
            TabGroups = Bool(c, "tabGroups") ?? b.TabGroups,
            Sessions = Bool(c, "sessions") ?? b.Sessions,
            Scripting = Bool(c, "scripting") ?? b.Scripting,
            AllUrls = Bool(c, "allUrls") ?? b.AllUrls,
            Split = Bool(c, "split") ?? b.Split,
            HostAccessRequest = Bool(c, "hostAccessRequest") ?? b.HostAccessRequest,
            GrantedOrigins = origins,
        };
    }

    // ------------------------------------------------------------------ objects (full or partial upserts)

    /// <summary>Merges a (partial) tab object over <paramref name="prev"/>. Returns null when the id is missing or invalid.</summary>
    public static BrowserTab? MergeTab(BrowserTab? prev, JsonObject o)
    {
        var id = Int(o, "id");
        if (id is not { } tid || tid < 0) return null;
        var t = prev ?? new BrowserTab { Id = tid };
        return t with
        {
            WindowId = Int(o, "win") ?? Int(o, "windowId") ?? t.WindowId,
            Index = Int(o, "idx") ?? Int(o, "index") ?? t.Index,
            Active = Bool(o, "active") ?? t.Active,
            Pinned = Bool(o, "pinned") ?? t.Pinned,
            Audible = Bool(o, "audible") ?? t.Audible,
            Muted = Bool(o, "muted") ?? t.Muted,
            Title = Has(o, "title") ? Str(o, "title", Wire.Limits.Title) : t.Title,
            Url = Has(o, "url") ? HttpUrl(Str(o, "url", Wire.Limits.Url + 1, clean: false)) : t.Url,
            Domain = Has(o, "domain") ? Host(Str(o, "domain", Wire.Limits.Domain + 1, clean: false)) : t.Domain,
            Host = Has(o, "host") ? Host(Str(o, "host", Wire.Limits.Domain + 1, clean: false)) : t.Host,
            Unread = Has(o, "unread") ? ClampUnread(Int(o, "unread")) : t.Unread,
            Status = Has(o, "status") ? Str(o, "status", 16, clean: false) switch { "loading" => "loading", "unloaded" => "unloaded", _ => "complete" } : t.Status,
            Discarded = Bool(o, "discarded") ?? t.Discarded,
            Frozen = Bool(o, "frozen") ?? t.Frozen,
            Group = Has(o, "group") ? Int(o, "group") ?? -1 : t.Group,
            Split = Has(o, "split") ? Int(o, "split") ?? -1 : t.Split,
            LastAccessed = Has(o, "lastAccessed") ? Long(o, "lastAccessed") : t.LastAccessed,
            Icon = Has(o, "icon") ? Pattern(Str(o, "icon", 80, clean: false), IconPattern()) : t.Icon,
            Hidden = Has(o, "hidden") ? Str(o, "hidden", 16, clean: false) switch { "domain" => "domain", "all" => "all", _ => null } : t.Hidden,
            Zoom = Has(o, "zoom") ? Double(o, "zoom", 0.25, 5) : t.Zoom,
            Access = Has(o, "access") ? Str(o, "access", 16, clean: false) switch { "granted" => "granted", "blocked" => "blocked", "none" => "none", _ => null } : t.Access,
        };
    }

    public static BrowserWindowInfo? MergeWindow(BrowserWindowInfo? prev, JsonObject o)
    {
        if (Int(o, "id") is not { } id) return null;
        var w = prev ?? new BrowserWindowInfo { Id = id };
        var bounds = o["bounds"] as JsonObject ?? o;
        return w with
        {
            Focused = Bool(o, "focused") ?? w.Focused,
            State = Has(o, "state") ? Str(o, "state", 16, clean: false) switch { "minimized" => "minimized", "maximized" => "maximized", "fullscreen" => "fullscreen", "locked-fullscreen" => "fullscreen", _ => "normal" } : w.State,
            Type = Has(o, "type") ? Str(o, "type", 16, clean: false) ?? "normal" : w.Type,
            Left = Int(bounds, "left") ?? w.Left,
            Top = Int(bounds, "top") ?? w.Top,
            Width = Int(bounds, "width") ?? w.Width,
            Height = Int(bounds, "height") ?? w.Height,
            Zoom = Has(o, "zoom") ? Double(o, "zoom", 0.25, 5) : w.Zoom,
        };
    }

    public static TabGroupInfo? MergeGroup(TabGroupInfo? prev, JsonObject o)
    {
        if (Int(o, "id") is not { } id) return null;
        var g = prev ?? new TabGroupInfo { Id = id };
        var color = Has(o, "color") ? Str(o, "color", 16, clean: false) : g.Color;
        return g with
        {
            WindowId = Int(o, "win") ?? Int(o, "windowId") ?? g.WindowId,
            Title = Has(o, "title") ? Str(o, "title", Wire.Limits.GroupTitle) : g.Title,
            Color = color is not null && Wire.GroupColors.Contains(color) ? color : "grey",
            Collapsed = Bool(o, "collapsed") ?? g.Collapsed,
        };
    }

    public static MediaItem? MergeMedia(MediaItem? prev, JsonObject o)
    {
        var key = Pattern(Str(o, "key", 40, clean: false), MediaKeyPattern()) ?? prev?.Key;
        if (key is null) return null;
        var m = prev ?? new MediaItem { Key = key };
        var actions = m.Actions;
        if (o["actions"] is JsonArray arr)
            actions = [.. arr.Take(Wire.Limits.Actions).Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) && s.Length <= Wire.Limits.ActionName ? s : null)
                .Where(s => s is not null && Wire.ReportedActions.Contains(s)).Distinct()!];
        MediaArt? art = m.Art;
        if (Has(o, "art"))
        {
            art = o["art"] is JsonObject a
                ? new MediaArt(HttpsOnly(Str(a, "url", Wire.Limits.Url + 1, clean: false)), Pattern(Str(a, "img", 80, clean: false), ImageIdPattern()))
                : null;
            if (art is { Url: null, Img: null }) art = null;
        }
        var duration = Has(o, "durationMs") ? NonNegativeLong(o, "durationMs") : m.DurationMs;
        var state = Has(o, "state") ? Str(o, "state", 16, clean: false) switch { "playing" => "playing", "paused" => "paused", _ => "none" } : m.State;
        return m with
        {
            TabId = Int(o, "tabId") ?? m.TabId,
            FrameId = Int(o, "frameId") ?? m.FrameId,
            Kind = Has(o, "kind") ? Str(o, "kind", 16, clean: false) switch { "audio" => "audio", "session-only" => "session-only", _ => "video" } : m.Kind,
            State = state,
            Title = Has(o, "title") ? Str(o, "title", Wire.Limits.Title) : m.Title,
            Artist = Has(o, "artist") ? Str(o, "artist", Wire.Limits.Artist) : m.Artist,
            Album = Has(o, "album") ? Str(o, "album", Wire.Limits.Album) : m.Album,
            Art = art,
            DurationMs = duration,
            Live = Bool(o, "live") ?? m.Live,
            PositionMs = Has(o, "positionMs") ? NonNegativeLong(o, "positionMs") : m.PositionMs,
            PositionAt = Has(o, "positionAt") ? Long(o, "positionAt") : m.PositionAt,
            Rate = Double(o, "rate", 0, 16) ?? m.Rate,
            Volume = Has(o, "volume") ? Double(o, "volume", 0, 1) : m.Volume,
            ElementMuted = Has(o, "elementMuted") ? Bool(o, "elementMuted") : m.ElementMuted,
            Pip = Bool(o, "pip") ?? m.Pip,
            Actions = actions,
            Mic = Has(o, "mic") ? Bool(o, "mic") : m.Mic,
            Camera = Has(o, "camera") ? Bool(o, "camera") : m.Camera,
            Source = Has(o, "source") ? Str(o, "source", 32, clean: false) switch { "mediasession" => "mediasession", "mediasession+element" => "mediasession+element", "smtc" => "smtc", _ => "element" } : m.Source,
            NeedsPermission = Bool(o, "needsPermission") ?? Bool(o, "needsHost") ?? m.NeedsPermission,
            Domain = Has(o, "domain") ? Host(Str(o, "domain", Wire.Limits.Domain + 1, clean: false)) : m.Domain,
        };
    }

    public static DownloadItem? MergeDownload(DownloadItem? prev, JsonObject o)
    {
        if (Int(o, "id") is not { } id || id < 0) return null;
        var d = prev ?? new DownloadItem { Id = id };
        return d with
        {
            State = Has(o, "state") ? Str(o, "state", 16, clean: false) switch { "complete" => "complete", "interrupted" => "interrupted", _ => "in_progress" } : d.State,
            Name = Has(o, "name") ? FileNameOnly(Str(o, "name", Wire.Limits.DownloadName)) : d.Name,
            Bytes = NonNegativeLong(o, "bytes") ?? d.Bytes,
            Total = Has(o, "total") ? NonNegativeLong(o, "total") : d.Total,
            EtaAt = Has(o, "etaAt") ? Long(o, "etaAt") : d.EtaAt,
            Paused = Bool(o, "paused") ?? d.Paused,
            CanResume = Bool(o, "canResume") ?? d.CanResume,
            Danger = Has(o, "danger") ? Str(o, "danger", 32, clean: false) ?? "safe" : d.Danger,
            Error = Has(o, "error") ? Str(o, "error", 64, clean: false) : d.Error,
            Icon = Has(o, "icon") ? Pattern(Str(o, "icon", 80, clean: false), ImageIdPattern()) : d.Icon,
            StartedAt = Has(o, "startedAt") ? Long(o, "startedAt") : d.StartedAt,
            Exists = Bool(o, "exists") ?? d.Exists,
        };
    }

    // ------------------------------------------------------------------ images

    public sealed record ImageFrame(string Id, string Mime, int Width, int Height, byte[] Bytes);

    /// <summary>Decodes an img/preview frame: base64 within <paramref name="maxBytes"/>, PNG or JPEG by magic, sane size.</summary>
    public static ImageFrame? ParseImage(JsonObject? d, int maxBytes, bool requireId = true)
    {
        if (d is null) return null;
        var id = Pattern(Str(d, "id", 80, clean: false), ImageIdPattern());
        if (requireId && id is null) return null;
        var b64 = d["b64"] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
        if (b64 is null || b64.Length > (maxBytes + 2) / 3 * 4 + 4) return null;
        byte[] bytes;
        try { bytes = Convert.FromBase64String(b64); }
        catch (FormatException) { return null; }
        if (bytes.Length == 0 || bytes.Length > maxBytes) return null;
        var info = PrismControl.Core.Render.ImageInfo.Probe(bytes);
        if (info is null || info.Mime is not ("image/png" or "image/jpeg")) return null;
        if (info.Width <= 0 || info.Height <= 0 || info.Width > Wire.Limits.ImageMaxPx || info.Height > Wire.Limits.ImageMaxPx) return null;
        return new ImageFrame(id ?? "", info.Mime, info.Width, info.Height, bytes);
    }

    // ------------------------------------------------------------------ results and events

    public sealed record ResultFrame(int Id, bool Ok, JsonObject? Data, string? ErrorCode, string? ErrorMessage);

    public static ResultFrame? ParseResult(JsonObject o)
    {
        if (Int(o, "id") is not { } id || id <= 0) return null;
        var ok = Bool(o, "ok") ?? false;
        var err = o["error"] as JsonObject;
        return new ResultFrame(id, ok, o["data"] as JsonObject,
            err is null ? (ok ? null : "unknown") : Str(err, "code", 32, clean: false) ?? "unknown",
            err is null ? null : Str(err, "message", 200));
    }

    // ------------------------------------------------------------------ primitives

    public static bool Has(JsonObject o, string name) => o.ContainsKey(name);

    public static string? Str(JsonObject o, string name, int maxChars, bool clean = true)
    {
        if (o[name] is not JsonValue v || !v.TryGetValue<string>(out var s)) return null;
        if (clean) s = Clean(s);
        if (s.Length > maxChars) s = Truncate(s, maxChars);
        return s.Length == 0 ? null : s;
    }

    public static int? Int(JsonObject o, string name)
    {
        if (o[name] is not JsonValue v) return null;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<long>(out var l) && l is >= int.MinValue and <= int.MaxValue) return (int)l;
        if (v.TryGetValue<double>(out var d) && double.IsFinite(d) && d == Math.Floor(d) && d is >= int.MinValue and <= int.MaxValue) return (int)d;
        return null;
    }

    public static long? Long(JsonObject o, string name)
    {
        if (o[name] is not JsonValue v) return null;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<double>(out var d) && double.IsFinite(d) && Math.Abs(d) < 9e15) return (long)d;
        return null;
    }

    private static long? NonNegativeLong(JsonObject o, string name) => Long(o, name) is { } l && l >= 0 ? l : null;

    public static double? Double(JsonObject o, string name, double min, double max)
    {
        if (o[name] is not JsonValue v) return null;
        if (!v.TryGetValue<double>(out var d))
        {
            if (v.TryGetValue<long>(out var l)) d = l;
            else if (v.TryGetValue<int>(out var i)) d = i;
            else return null;
        }
        if (!double.IsFinite(d) || d < min || d > max) return null;
        return d;
    }

    public static bool? Bool(JsonObject o, string name) => o[name] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;

    private static int? ClampUnread(int? v) => v is null ? null : v.Value < -1 ? null : Math.Min(v.Value, 99_999);

    private static string? Pattern(string? s, Regex re) => s is not null && re.IsMatch(s) ? s : null;

    /// <summary>Only http(s) URLs within the cap.</summary>
    public static string? HttpUrl(string? s)
    {
        if (s is null || s.Length > Wire.Limits.Url) return null;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u)) return null;
        return u.Scheme is "http" or "https" ? s : null;
    }

    /// <summary>Only https URLs (the only artwork the plugin fetches itself).</summary>
    public static string? HttpsOnly(string? s)
    {
        if (s is null || s.Length > Wire.Limits.Url) return null;
        return Uri.TryCreate(s, UriKind.Absolute, out var u) && u.Scheme == "https" && !string.IsNullOrEmpty(u.Host) ? s : null;
    }

    /// <summary>A host name (or IP literal) in lower case, else null.</summary>
    public static string? Host(string? s)
    {
        if (s is null) return null;
        s = s.Trim().TrimEnd('.').ToLowerInvariant();
        if (s.Length == 0 || s.Length > Wire.Limits.Domain) return null;
        if (System.Net.IPAddress.TryParse(s.Trim('[', ']'), out _)) return s;
        return HostPattern().IsMatch(s) ? s : null;
    }

    private static string? FileNameOnly(string? s)
    {
        if (s is null) return null;
        var i = Math.Max(s.LastIndexOf('\\'), s.LastIndexOf('/'));
        var name = i >= 0 ? s[(i + 1)..] : s;
        return name.Length == 0 ? null : name;
    }

    /// <summary>Removes control and bidi-override characters and collapses whitespace runs.</summary>
    public static string Clean(string s)
    {
        var sb = new StringBuilder(s.Length);
        var space = false;
        foreach (var r in s.EnumerateRunes())
        {
            var cat = Rune.GetUnicodeCategory(r);
            if (cat == UnicodeCategory.Control || r.Value is (>= 0x202A and <= 0x202E) or (>= 0x2066 and <= 0x2069) or 0xFEFF)
            {
                if (r.Value is '\t' or '\n' or '\r') { if (!space && sb.Length > 0) { sb.Append(' '); space = true; } }
                continue;
            }
            if (Rune.IsWhiteSpace(r))
            {
                if (!space && sb.Length > 0) { sb.Append(' '); space = true; }
                continue;
            }
            space = false;
            sb.Append(r.ToString());
        }
        return sb.ToString().TrimEnd();
    }

    /// <summary>Truncates to at most <paramref name="max"/> UTF-16 units without splitting a surrogate pair.</summary>
    public static string Truncate(string s, int max)
    {
        if (s.Length <= max) return s;
        var cut = max;
        if (cut > 0 && char.IsHighSurrogate(s[cut - 1])) cut--;
        return s[..cut];
    }

    /// <summary>A short hash for logs (never log titles, URLs or plain domains).</summary>
    public static string Redact(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "-";
        var h = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return "#" + Convert.ToHexString(h, 0, 4).ToLowerInvariant();
    }

    /// <summary>Serializes a frame as UTF-8 and returns its byte length (for caps).</summary>
    public static int Utf8Length(JsonNode node) => Encoding.UTF8.GetByteCount(node.ToJsonString(JsonOpts));

    public static readonly JsonSerializerOptions JsonOpts = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
}
