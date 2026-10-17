using System.Globalization;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify;

/// <summary>User-facing wording (US English, short, no exclamation marks). Matches research/spotify-setup-for-user.md.</summary>
public static class SpotifyText
{
    public const string ConnectHint = "Connect Spotify in the plugin settings";
    public const string OpenSpotify = "Open Spotify on this PC";
    public const string PremiumRequired = "Spotify Premium is required for playback control";
    public const string NotAllowed = "This account isn't allowed to use this app";
    public const string Reconnect = "Spotify sign-in expired, reconnect in settings";
    public const string BasicMode = "Spotify limit reached, basic mode";
    public const string Refused = "Spotify refused that";
    public const string NotOwned = "Track list not available for playlists you don't own";
    /// <summary>The frame-sized version (dials have room for about 30 characters).</summary>
    public const string NotOwnedShort = "Track list not available";
    public const string EqNote = "Spotify's in-app equalizer has no API, so no app can change it. Use the Prism Control EQ actions (SteelSeries Sonar or Equalizer APO) instead.";
    public const string Attribution = "Music data and artwork provided by Spotify.";
    public const string ManageAccessUrl = "https://www.spotify.com/account/apps/";
    public const string DashboardUrl = "https://developer.spotify.com/dashboard";
    public const string RedirectUri = "http://127.0.0.1:43117/callback";

    public static string Busy(DateTimeOffset until, DateTimeOffset now)
    {
        var s = Math.Max(1, (int)Math.Ceiling((until - now).TotalSeconds));
        return $"Spotify is busy, retrying in {s.ToString(CultureInfo.InvariantCulture)} s";
    }

    private const string BusyTryPrefix = "Spotify busy · try in ";

    /// <summary>A command that met a rate-limit pause: it was dropped, not queued ("Spotify busy · try in 30 s").</summary>
    public static string BusyTryIn(TimeSpan retryAfter) => BusyTryPrefix + Span(retryAfter);

    /// <summary>"30 s", "5 min", "2 h" (rounded up).</summary>
    public static string Span(TimeSpan t)
    {
        var s = Math.Max(1, (int)Math.Ceiling(t.TotalSeconds));
        if (s < 60) return s.ToString(CultureInfo.InvariantCulture) + " s";
        var m = (int)Math.Ceiling(s / 60.0);
        if (m < 60) return m.ToString(CultureInfo.InvariantCulture) + " min";
        return ((int)Math.Ceiling(m / 60.0)).ToString(CultureInfo.InvariantCulture) + " h";
    }

    /// <summary>The message for a failed Web API call.</summary>
    public static string ForFailure(SpotifyApiException e) => e.Kind switch
    {
        ApiFailure.NoActiveDevice => OpenSpotify,
        ApiFailure.PremiumRequired => PremiumRequired,
        ApiFailure.NotAllowed => NotAllowed,
        ApiFailure.Reconnect => Reconnect,
        ApiFailure.SignedOut => ConnectHint,
        ApiFailure.Quota => BasicMode,
        ApiFailure.RateLimited => e.RetryAfter is { } wait ? BusyTryIn(wait) : "Spotify is busy, try again in a moment",
        ApiFailure.Network => "Offline",
        _ => Refused,
    };

    /// <summary>The PI's main status line.</summary>
    public static string StatusLine(SpotifyStatus s, DateTimeOffset now) => s.Auth switch
    {
        AuthState.Connected when s.IsBasicMode(now) => "Connected · " + BasicMode,
        AuthState.Connected when s.IsBusy(now) => "Connected · " + Busy(s.BusyUntil!.Value, now),
        AuthState.Connected => s.Account is { Length: > 0 } a ? $"Connected ({a})" : "Connected",
        AuthState.Connecting => "Waiting for Spotify sign-in",
        AuthState.NeedsReconnect => "Reconnect",
        _ => "Not connected",
    };

    /// <summary>The PI's second line: problems first, then auth messages and expiry warnings.</summary>
    public static string? Detail(SpotifyStatus s, DateTimeOffset now, int? daysLeft)
    {
        if (s.Problem is { } p) return p;
        if (s.AuthMessage is { } m) return m;
        if (s.Auth == AuthState.Connected && daysLeft is { } d && d <= 12)
            return d <= 0 ? "Your Spotify sign-in expires today. Click Connect Spotify to renew it."
                : $"Sign-in expires in {d.ToString(CultureInfo.InvariantCulture)} day{(d == 1 ? "" : "s")} (Spotify requires a new sign-in every 6 months).";
        if (s.MissingScopes) return "Reconnect to enable every feature (new permissions are needed).";
        if (s.Auth == AuthState.SignedOut) return "Without connecting, Now Playing, Play/Pause, Next and Previous still work for the Spotify app on this PC.";
        return null;
    }

    /// <summary>A dial-sized version of a message (the text column beside the art fits about 20 characters).</summary>
    public static string DialHint(string message) => message switch
    {
        OpenSpotify => "Open Spotify first",
        ConnectHint => "Connect in settings",
        PremiumRequired => "Premium required",
        NotAllowed => "Account not allowed",
        Reconnect => "Reconnect in settings",
        BasicMode => "Limit reached: basic",
        _ when message.StartsWith("Spotify is busy, retrying in ", StringComparison.Ordinal) => "Busy, retry in " + message["Spotify is busy, retrying in ".Length..],
        _ when message.StartsWith(BusyTryPrefix, StringComparison.Ordinal) => "Busy · try in " + message[BusyTryPrefix.Length..],
        _ => message,
    };

    /// <summary>A short, key-sized version of a message (keys have room for about 12 characters).</summary>
    public static string KeyHint(string message) => message switch
    {
        OpenSpotify => "OPEN SPOTIFY",
        ConnectHint => "SIGN IN",
        PremiumRequired => "PREMIUM ONLY",
        NotAllowed => "NOT ALLOWED",
        Reconnect => "RECONNECT",
        BasicMode => "BASIC MODE",
        "Offline" => "OFFLINE",
        _ when message.StartsWith(BusyTryPrefix, StringComparison.Ordinal) => "BUSY · " + message[BusyTryPrefix.Length..].ToUpperInvariant(),
        _ when message.StartsWith("Spotify is busy", StringComparison.Ordinal) => "BUSY",
        _ when message.Length <= 12 => message.ToUpperInvariant(),
        _ => "FAILED",
    };

    public static string Duration(long? ms)
    {
        if (ms is not { } v || v < 0) return "-:--";
        var t = TimeSpan.FromMilliseconds(v);
        return t.TotalHours >= 1
            ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}"
            : $"{(int)t.TotalMinutes}:{t.Seconds:00}";
    }
}
