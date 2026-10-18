using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Images;
using PrismControl.Spotify.SafeMode;
using PrismControl.Spotify.Smtc;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify;

/// <summary>Kinds of visible Spotify actions (they drive the Web API poll cadence).</summary>
public enum SpotifyView { NowPlaying, Transport, Like, Volume, Browser, BrowserOpen }

public sealed class SpotifyServiceOptions
{
    public GateOptions Gate { get; init; } = new();
    public AuthOptions Auth { get; init; } = new();
    /// <summary>The desktop app's Connect device is a "Computer" named after the PC (research §3.3).</summary>
    public string MachineName { get; init; } = Environment.MachineName;
    /// <summary>Display size for key/dial art (Spotify's 300 px image, scaled down).</summary>
    public int KeyArtPx { get; init; } = 144;
    /// <summary>Starts the Spotify desktop app ("spotify:" URI). Null = never launch.</summary>
    public Func<string, bool>? LaunchUri { get; init; }
    public TimeSpan ConfirmFirst { get; init; } = TimeSpan.FromMilliseconds(350);
    public TimeSpan ConfirmSecond { get; init; } = TimeSpan.FromMilliseconds(1500);
    public TimeSpan DeviceWait { get; init; } = TimeSpan.FromSeconds(15);
    /// <summary>
    /// Safe mode (IModuleContext.SafeMode): SMTC commands, Web API PUT/POST/DELETE, the "spotify:" launch, token refreshes
    /// and vault writes are suppressed and counted in <see cref="SpotifyService.SafeModeWrites"/>; keys update local fake
    /// state only. Reads (SMTC, GET requests with a still-valid saved token) stay real.
    /// </summary>
    public bool SafeMode { get; init; }
}

/// <summary>
/// The one Spotify service shared by every Spotify action (registered by <see cref="SpotifyModule"/>):
/// <list type="bullet">
/// <item>merges the Windows media session (SMTC: no login, instant) with the Web API (after Connect: any device, like,
/// volume, context) into one <see cref="PlayerSnapshot"/> (research §5.6);</item>
/// <item>polls GET /me/player only while a Spotify action (or a data-API client) is looking, with the §4.2 cadence,
/// using SMTC events as the fast signal and confirmation reads after every command;</item>
/// <item>routes commands: SMTC for local transport (no quota), the Web API for everything else, with the
/// no-active-device recipe (§3.3);</item>
/// <item>publishes /v1/now-playing and the art bytes exactly as returned.</item>
/// </list>
/// Thread-safe. <see cref="Changed"/> is raised on arbitrary threads; actions marshal with Post.
/// </summary>
public sealed class SpotifyService : IAsyncDisposable
{
    private static readonly TimeSpan OverrideTtl = TimeSpan.FromSeconds(3);
    /// <summary>Two GET /me/player are never closer than this, whatever asks for them (#6: no spinning).</summary>
    internal static readonly TimeSpan MinPollInterval = TimeSpan.FromMilliseconds(250);

    private readonly IMediaSessionSource _smtc;
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly SpotifyServiceOptions _o;
    private readonly object _lock = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly Dictionary<SpotifyView, int> _views = new();
    private readonly Dictionary<string, bool> _liked = new(StringComparer.Ordinal);
    private readonly HashSet<string> _likedChecking = new(StringComparer.Ordinal);
    private string? _likedRetry;   // a like check that failed transiently (rate limit, offline): re-run after the next good read
    private readonly Queue<DateTimeOffset> _confirmations = new();

    // Web API state
    private ApiPlayer? _player;
    private bool _playerKnown;
    private DateTimeOffset? _idleSince;
    private DateTimeOffset? _lastPollAt;
    private DateTimeOffset? _explicitDue;
    private (string ItemUri, ArtImage Art)? _apiArt;
    private string? _apiArtLoading;
    private string? _localDeviceId;
    private bool _meFetched;

    // SMTC art: the shown session's and Spotify's (by thumbnail hash; at most a few kept)
    private readonly Dictionary<string, ArtImage> _smtcArts = new(StringComparer.Ordinal);
    private string? _lastSpotifySig;
    private string? _lastShownSig;
    private volatile bool _streamerSafe;

    // optimistic overrides (the play override names its target: SpotifyTarget, or another app's session key)
    private const string SpotifyTarget = "spotify";
    private (PlayState Value, DateTimeOffset Until, string Target)? _playOverride;
    private (bool Value, DateTimeOffset Until)? _shuffleOverride;
    private (RepeatMode Value, DateTimeOffset Until)? _repeatOverride;
    private (long PositionMs, DateTimeOffset At, DateTimeOffset Until)? _seekOverride;
    private int? _volumeTarget;
    private int? _volumeSent;
    private DateTimeOffset _volumeOverrideUntil;
    private bool _volumeSending;
    private int _volumeSenderId;
    private int? _preMuteVolume;

    // seek coalescing
    private ITimer? _seekTimer;
    private long _seekBaseMs;
    private long _seekAccumMs;
    private bool _seekPending;

    // status
    private string? _problem;
    private string? _notice;
    private DateTimeOffset? _noticeUntil;
    private DateTimeOffset? _busyUntil;
    private DateTimeOffset? _basicUntil;
    private int _basicStreak;
    private DateTimeOffset? _lastQuotaAt;

    private volatile PlayerSnapshot _current = PlayerSnapshot.Empty;
    private volatile PlayerSnapshot _spotifyCurrent = PlayerSnapshot.Empty;
    private volatile SpotifyStatus _status = new();
    private TaskCompletionSource _wake = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _pollLoop;
    private DataPublisher<NowPlayingSnapshot>? _npPublisher;
    private BinaryPublisher? _artPublisher;
    private string? _lastPublishedSig;
    private (long Pos, DateTimeOffset At, bool Playing)? _lastPublishedPos;
    private string? _lastArtHash;
    private int _disposed;
    private long _loopIterations;

    private sealed record ApiPlayer(PlaybackStateDto Dto, DateTimeOffset ReceivedAt);

    public SpotifyService(IMediaSessionSource smtc, ISecretVault vault, TimeProvider time, ILog log,
        HttpMessageHandler? handler = null, SpotifyServiceOptions? options = null)
    {
        _time = time;
        _log = log;
        _o = options ?? new SpotifyServiceOptions();
        SafeModeWrites = new SafeModeWrites(log, _o.SafeMode);
        if (_o.SafeMode)
        {
            smtc = new SafeModeMediaSession(smtc, SafeModeWrites, time);   // reads real, commands fake
            vault = new SafeModeVault(vault, SafeModeWrites);              // reads real, writes in memory
        }
        _smtc = smtc;
        if (handler is null)
        {
            handler = new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                AutomaticDecompression = System.Net.DecompressionMethods.All,
                ConnectTimeout = TimeSpan.FromSeconds(10),
            };
            _ownsHttp = true;
        }
        _http = new HttpClient(handler, disposeHandler: _ownsHttp) { Timeout = TimeSpan.FromSeconds(20) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PrismControl/1.0");

        Auth = new SpotifyAuth(_http, vault, time, log, _o.Auth, SafeModeWrites);
        Gate = new RequestGate(time, _o.Gate);
        Api = new SpotifyApi(_http, Auth, Gate, time, log, SafeModeWrites);
        Images = new ImageCache(_http, time, log);
        Library = new PlaylistLibrary(Api, time, log);

        Auth.Changed += (_, _) => { if (Auth.State != AuthState.Connected) ClearApiState(); Recompute(); };
        Auth.Connected += (_, _) => { lock (_lock) { _meFetched = false; _lastPollAt = null; _problem = null; } _ = EnsureMeAsync(); Wake(); };
        Api.RateLimited += OnRateLimited;
        Api.Succeeded += (_, _) => OnApiSucceeded();
        _smtc.Changed += OnSmtcChanged;
        Images.Loaded += (_, url) => ArtLoaded?.Invoke(this, url);
    }

    public SpotifyAuth Auth { get; }
    public SpotifyApi Api { get; }
    public RequestGate Gate { get; }
    public ImageCache Images { get; }
    public PlaylistLibrary Library { get; }
    public IMediaSessionSource Smtc => _smtc;
    public TimeProvider Time => _time;
    /// <summary>What safe mode suppressed (empty and disabled outside safe mode).</summary>
    public SafeModeWrites SafeModeWrites { get; }

    /// <summary>Raised (any thread) whenever the snapshot or status may have changed.</summary>
    public event EventHandler? Changed;
    /// <summary>Raised (any thread) when a cover finished downloading (browser lists redraw).</summary>
    public event EventHandler<string>? ArtLoaded;

    /// <summary>
    /// What the deck shows (now playing, play/pause, next, previous and /v1/now-playing): Spotify, or another app's
    /// session when <see cref="Follow"/> picked one (YouTube in a browser, any player).
    /// </summary>
    public PlayerSnapshot Current
    {
        get
        {
            var now = _time.GetUtcNow();
            lock (_lock)
            {
                if (PruneOverrides(now)) (_current, _spotifyCurrent) = BuildAll(now);
                return _current;
            }
        }
    }

    /// <summary>
    /// Spotify's own state, whatever is shown: what the Spotify-only keys (like, shuffle, repeat, Spotify volume, the
    /// playlist browser) draw and control. The same object as <see cref="Current"/> while Spotify is shown.
    /// </summary>
    public PlayerSnapshot SpotifyCurrent
    {
        get
        {
            var now = _time.GetUtcNow();
            lock (_lock)
            {
                if (PruneOverrides(now)) (_current, _spotifyCurrent) = BuildAll(now);
                return _spotifyCurrent;
            }
        }
    }

    /// <summary>True when another app's session is shown (the Spotify-only keys then show a calm "Spotify" state).</summary>
    public bool OtherAppShown => Current.IsOtherApp;

    public SpotifyStatus Status => _status;
    public bool IsConnected => Auth.State == AuthState.Connected;

    /// <summary>Which media session the deck follows (global setting <c>spotify."media.follow"</c>).</summary>
    public MediaFollow Follow
    {
        get => _smtc.Follow;
        set => _smtc.Follow = value;
    }

    /// <summary>
    /// Streamer-safe (Smart's <c>smart.streamerSafe</c>, or OBS running with the browser's auto streamer-safe): another
    /// app's title, artist, album and art are hidden on keys, dials and /v1/now-playing (a browser tab title can be
    /// private). Spotify's own track stays visible.
    /// </summary>
    public bool StreamerSafe
    {
        get => _streamerSafe;
        set
        {
            if (_streamerSafe == value) return;
            _streamerSafe = value;
            Recompute();
        }
    }

    /// <summary>Starts SMTC, loads the saved sign-in and the poll loop.</summary>
    public async Task StartAsync(CancellationToken shutdown)
    {
        shutdown.Register(() => { try { _cts.Cancel(); } catch (ObjectDisposedException) { } });
        Auth.Load();
        try { await _smtc.StartAsync(_cts.Token).ConfigureAwait(false); }
        catch (Exception ex) when (ex is not OperationCanceledException) { _log.Warn("Windows media session unavailable; now playing needs the Web API", ex); }
        _pollLoop = PollLoopAsync(_cts.Token);
        Recompute();
    }

    /// <summary>The data-API topics this service fills (null when another provider owns them).</summary>
    public void AttachPublishers(DataPublisher<NowPlayingSnapshot>? nowPlaying, BinaryPublisher? art)
    {
        _npPublisher = nowPlaying;
        _artPublisher = art;
        if (art is not null) art.Topic.DemandStarted += (_, _) => Wake();
        if (nowPlaying is not null) nowPlaying.DemandStarted += (_, _) => Wake();
        Recompute();
    }

    // ------------------------------------------------------------------ views (poll cadence)

    /// <summary>Registers a visible action; dispose the token on willDisappear.</summary>
    public IDisposable AttachView(SpotifyView view)
    {
        lock (_lock) _views[view] = _views.GetValueOrDefault(view) + 1;
        if (IsConnected) _ = EnsureMeAsync();
        Wake();
        return new ViewToken(this, view);
    }

    private sealed class ViewToken(SpotifyService owner, SpotifyView view) : IDisposable
    {
        private int _done;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _done, 1) == 1) return;
            lock (owner._lock) owner._views[view] = Math.Max(0, owner._views.GetValueOrDefault(view) - 1);
            owner.Wake();
        }
    }

    /// <summary>How many times the poll loop has gone round (tests prove it never spins).</summary>
    internal long PollLoopIterations => Interlocked.Read(ref _loopIterations);

    public int ViewCount
    {
        get { lock (_lock) return _views.Values.Sum(); }
    }

    // ------------------------------------------------------------------ snapshot building

    private void Recompute()
    {
        if (Volatile.Read(ref _disposed) == 1) return;
        var now = _time.GetUtcNow();
        PlayerSnapshot snap;
        PlayState? remote;
        lock (_lock)
        {
            PruneOverrides(now);
            (snap, _spotifyCurrent) = BuildAll(now);
            _current = snap;
            _status = BuildStatus();
            remote = SpotifyRemoteState(now);
        }
        // The follow policy counts Spotify playing on a phone or speaker as "Spotify is playing" (spotifyFirst).
        if (_smtc.SpotifyRemote != remote) _smtc.SpotifyRemote = remote;
        Publish(snap, now);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Spotify playback the Web API reports on another device (caller holds the lock).</summary>
    private PlayState? SpotifyRemoteState(DateTimeOffset now)
    {
        if (!ApiUsable(now) || _player is not { } p || p.Dto.Item is null || p.Dto.Device is null || IsLocalDevice(p.Dto.Device)) return null;
        return p.Dto.IsPlaying ? PlayState.Playing : PlayState.Paused;
    }

    private SpotifyStatus BuildStatus() => new()
    {
        Auth = Auth.State,
        Account = Auth.AccountLabel,
        ClientIdHint = Auth.ClientIdHint,
        Problem = _problem,
        AuthMessage = Auth.Message,
        Notice = _notice,
        NoticeUntil = _noticeUntil,
        BusyUntil = _busyUntil,
        BasicModeUntil = _basicUntil,
        AuthorizedAt = Auth.AuthorizedAt,
        UsedFallbackPort = Auth.UsedFallbackPort,
        MissingScopes = Auth.MissingScopes,
    };

    private bool ApiUsable(DateTimeOffset now) => Auth.State == AuthState.Connected && !(_basicUntil is { } b && b > now);

    private bool IsLocalDevice(DeviceDto? d) =>
        d is not null && ((d.Id is not null && d.Id == _localDeviceId)
            || (string.Equals(d.Type, "computer", StringComparison.OrdinalIgnoreCase) && string.Equals(d.Name, _o.MachineName, StringComparison.OrdinalIgnoreCase)));

    private static bool SameTitle(string? a, string? b) =>
        a is not null && b is not null && string.Equals(a.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);

    /// <summary>Spotify is playing (or paused) in the desktop app on this PC, per SMTC and the API.</summary>
    private bool IsLocalPlayback(SmtcSnapshot? s, ApiPlayer? p) =>
        s is { IsSpotify: true, HasMedia: true } && s.State is PlayState.Playing or PlayState.Paused
        && (p is null || IsLocalDevice(p.Dto.Device) || SameTitle(s.Title, p.Dto.Item?.Name));

    /// <summary>Spotify's own media session (whatever is shown).</summary>
    private SmtcSnapshot? SpotifySmtc() => _smtc.Spotify ?? (_smtc.Current is { IsSpotify: true } c ? c : null);

    /// <summary>The shown snapshot and Spotify's (the same object while Spotify is shown). Caller holds the lock.</summary>
    private (PlayerSnapshot Shown, PlayerSnapshot Spotify) BuildAll(DateTimeOffset now)
    {
        var spotify = BuildSpotify(now);
        return _smtc.Current is { IsSpotify: false } other ? (BuildOther(other, now), spotify) : (spotify, spotify);
    }

    /// <summary>
    /// Another app's session (YouTube in a browser, any player): everything from SMTC, the thumbnail exactly as given.
    /// Spotify-only fields (liked, context, Spotify volume, device) stay null. Streamer-safe hides title, artist, album
    /// and art. Caller holds the lock.
    /// </summary>
    private PlayerSnapshot BuildOther(SmtcSnapshot s, DateTimeOffset now)
    {
        var snap = FromSmtc(s) with
        {
            SessionKey = s.Key,
            Art = SmtcArtFor(s),
            CanPlayPause = s.CanPlay || s.CanPause,
            CanSkipNext = s.CanNext,
            CanSkipPrevious = s.CanPrevious,
        };
        if (_streamerSafe && s.HasMedia) snap = snap with { Private = true, Title = null, Artists = [], Album = null, Art = null };
        if (_playOverride is { } po && po.Until > now && po.Target == s.Key)
        {
            snap = snap.IsPlaying && po.Value != PlayState.Playing
                ? snap with { State = po.Value, PositionMs = snap.PositionNow(now), PositionAt = now }
                : snap with { State = po.Value };
        }
        return snap;
    }

    private PlayerSnapshot BuildSpotify(DateTimeOffset now)
    {
        var s = SpotifySmtc();
        var p = ApiUsable(now) ? _player : null;
        var item = p?.Dto.Item;
        var smtcSpotify = s is { IsSpotify: true, HasMedia: true };
        var matches = item is not null && SameTitle(s?.Title, item.Name);
        PlayerSnapshot snap;
        if (smtcSpotify && (item is null || matches || IsLocalDevice(p!.Dto.Device)))
        {
            snap = FromSmtc(s!);
            if (p is not null)
            {
                snap = WithDevice(snap, p.Dto);
                if (matches) snap = Enrich(snap, p.Dto, item!);
            }
            snap = snap with { Art = SmtcArtFor(s!) ?? (matches ? ApiArtFor(item!) : null) };
        }
        else if (p is not null)
        {
            snap = FromApi(p, now);
        }
        else if (s is { HasMedia: true })
        {
            snap = FromSmtc(s) with { Art = SmtcArtFor(s) };
        }
        else snap = PlayerSnapshot.Empty;

        // Optimistic overrides from our own commands (until confirmed or expired).
        if (_playOverride is { } po && po.Until > now && po.Target == SpotifyTarget)
        {
            // Pausing freezes the interpolated position where it is now.
            snap = snap.IsPlaying && po.Value != PlayState.Playing
                ? snap with { State = po.Value, PositionMs = snap.PositionNow(now), PositionAt = now }
                : snap with { State = po.Value };
        }
        if (_shuffleOverride is { } so && so.Until > now) snap = snap with { Shuffle = so.Value };
        if (_repeatOverride is { } ro && ro.Until > now) snap = snap with { Repeat = ro.Value };
        if (_seekOverride is { } sk && sk.Until > now) snap = snap with { PositionMs = sk.PositionMs, PositionAt = sk.At };
        if (_volumeTarget is { } vt && (_volumeSending || _volumeOverrideUntil > now)) snap = snap with { VolumePct = vt };
        if (snap.Uri is { } uri && _liked.TryGetValue(uri, out var liked)) snap = snap with { Liked = liked };
        return snap;
    }

    /// <summary>Drops expired optimistic overrides (caller holds the lock). True if any was dropped.</summary>
    private bool PruneOverrides(DateTimeOffset now)
    {
        var changed = false;
        if (_playOverride is { } a && a.Until <= now) { _playOverride = null; changed = true; }
        if (_shuffleOverride is { } b && b.Until <= now) { _shuffleOverride = null; changed = true; }
        if (_repeatOverride is { } c && c.Until <= now) { _repeatOverride = null; changed = true; }
        if (_seekOverride is { } d && d.Until <= now && !_seekPending) { _seekOverride = null; changed = true; }
        if (_volumeTarget is not null && !_volumeSending && _volumeOverrideUntil <= now) { _volumeTarget = null; changed = true; }
        return changed;
    }

    private static PlayerSnapshot FromSmtc(SmtcSnapshot s) => new()
    {
        Source = SnapshotSource.Smtc,
        AppName = s.AppName,
        IsSpotify = s.IsSpotify,
        State = s.State,
        Title = s.Title,
        Artists = SplitArtists(s.Artist),
        Album = s.Album,
        DurationMs = s.Duration is { } d ? (long)d.TotalMilliseconds : null,
        PositionMs = s.Position is { } pos ? (long)pos.TotalMilliseconds : null,
        PositionAt = s.PositionAt,
        Shuffle = s.Shuffle,
        Repeat = s.Repeat,
    };

    private static IReadOnlyList<string> SplitArtists(string? artist) =>
        string.IsNullOrWhiteSpace(artist) ? [] : artist.Split(", ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private PlayerSnapshot WithDevice(PlayerSnapshot snap, PlaybackStateDto d) => snap with
    {
        DeviceId = d.Device?.Id,
        DeviceName = d.Device?.Name,
        DeviceIsLocal = IsLocalDevice(d.Device),
        DeviceRestricted = d.Device?.IsRestricted ?? false,
        VolumePct = d.Device?.VolumePercent,
        SupportsVolume = d.Device?.SupportsVolume ?? false,
    };

    private PlayerSnapshot Enrich(PlayerSnapshot snap, PlaybackStateDto d, ItemDto item) => snap with
    {
        Source = SnapshotSource.WebApi,
        Uri = item.Uri,
        Url = item.ExternalUrls?.Spotify,
        ItemType = item.Type ?? d.CurrentlyPlayingType,
        IsLocalFile = item.IsLocal || (item.Uri?.StartsWith("spotify:local:", StringComparison.Ordinal) ?? false),
        DurationMs = snap.DurationMs ?? (item.DurationMs > 0 ? item.DurationMs : null),
        ContextUri = d.Context?.Uri,
        ContextName = ContextNameFor(d.Context),
        Shuffle = snap.Shuffle ?? d.ShuffleState,
        Repeat = snap.Repeat ?? SpotifyApi.ParseRepeat(d.RepeatState),
    };

    private PlayerSnapshot FromApi(ApiPlayer p, DateTimeOffset now)
    {
        var d = p.Dto;
        var item = d.Item;
        var title = item?.Name ?? (d.CurrentlyPlayingType == "ad" ? "Advertisement" : null);
        var artists = item?.Artists is { Count: > 0 } a ? a.Select(x => x.Name ?? "").Where(n => n.Length > 0).ToList()
            : item?.Show?.Name is { } show ? [show] : [];
        var snap = new PlayerSnapshot
        {
            Source = SnapshotSource.WebApi,
            AppName = "Spotify",
            IsSpotify = true,
            State = title is null && d.Device is null ? PlayState.None : d.IsPlaying ? PlayState.Playing : PlayState.Paused,
            ItemType = item?.Type ?? d.CurrentlyPlayingType,
            Title = title,
            Artists = artists,
            Album = item?.Album?.Name ?? item?.Show?.Name,
            Uri = item?.Uri,
            Url = item?.ExternalUrls?.Spotify,
            IsLocalFile = item is not null && (item.IsLocal || (item.Uri?.StartsWith("spotify:local:", StringComparison.Ordinal) ?? false)),
            DurationMs = item is { DurationMs: > 0 } ? item.DurationMs : null,
            PositionMs = d.ProgressMs,
            PositionAt = p.ReceivedAt,
            Shuffle = d.ShuffleState,
            Repeat = SpotifyApi.ParseRepeat(d.RepeatState),
            ContextUri = d.Context?.Uri,
            ContextName = ContextNameFor(d.Context),
            Art = item is null ? null : ApiArtFor(item),
        };
        return WithDevice(snap, d);
    }

    private string? ContextNameFor(ContextDto? c)
    {
        if (c?.Uri is not { } uri || c.Type != "playlist") return null;
        for (var offset = 0; offset < 100_000; offset += PlaylistLibrary.PageSize)
        {
            var page = Library.CachedPlaylists(offset);
            if (page is null) break;
            if (page.Items.FirstOrDefault(x => x.Uri == uri) is { } hit) return hit.Name;
        }
        return null;
    }

    private ArtImage? SmtcArtFor(SmtcSnapshot s) => s.ThumbnailHash is { } h && _smtcArts.TryGetValue(h, out var a) ? a : null;
    private ArtImage? ApiArtFor(ItemDto item) => _apiArt is { } a && a.ItemUri == item.Uri ? a.Art : null;

    // ------------------------------------------------------------------ data API

    private void Publish(PlayerSnapshot snap, DateTimeOffset now)
    {
        var np = _npPublisher;
        var art = _artPublisher;
        if (np is null && art is null) return;
        lock (_lock)
        {
            var pos = snap.PositionNow(now);
            var sig = snap.Signature;
            var drift = _lastPublishedPos is { } lp && pos is { } cur
                ? Math.Abs(cur - (lp.Pos + (lp.Playing ? (long)(now - lp.At).TotalMilliseconds : 0))) : long.MaxValue;
            if (sig == _lastPublishedSig && (pos is null || drift < 1500)) return;
            _lastPublishedSig = sig;
            _lastPublishedPos = pos is { } p0 ? (p0, now, snap.IsPlaying) : null;

            if (art is not null && snap.Art?.Hash != _lastArtHash)
            {
                if (snap.Art is { } a) art.Publish(a.Original, a.Mime);   // exactly as returned
                else art.Clear();
                _lastArtHash = snap.Art?.Hash;
            }
            np?.Publish(new NowPlayingSnapshot
            {
                Source = snap.Source == SnapshotSource.WebApi ? "spotify" : "smtc",
                App = snap.AppName,
                State = snap.State switch { PlayState.Playing => "playing", PlayState.Paused => "paused", PlayState.Stopped => "stopped", _ => "none" },
                Track = snap.HasItem ? new TrackInfo
                {
                    Title = snap.Title!,
                    Artists = [.. snap.Artists],
                    Album = snap.Album,
                    DurationMs = snap.DurationMs,
                    Uri = snap.Uri,
                    Url = snap.Url,
                }
                // Streamer-safe: something is loaded, but its title, artists and album are withheld (and art is cleared).
                : snap.Private ? new TrackInfo { Title = "", Artists = [], Album = null, DurationMs = snap.DurationMs } : null,
                PositionMs = pos,
                PositionAt = pos is null ? null : now,
                Shuffle = snap.Shuffle,
                Repeat = snap.Repeat is { } r ? SpotifyApi.RepeatWire(r) : null,
                Liked = snap.Liked,
                VolumePct = snap.VolumePct,
                ContextName = snap.ContextName,
                Art = snap.Art is { } ai ? new ArtInfo { Etag = art?.Topic.CurrentEtag ?? "\"" + ai.Hash + "\"", Mime = ai.Mime, Width = ai.Width, Height = ai.Height } : null,
            });
        }
    }

    // ------------------------------------------------------------------ SMTC events

    /// <summary>What a session change means for the deck (title, state, shuffle/repeat; not the position).</summary>
    private static string? Sig(SmtcSnapshot? s) => s is null ? null : string.Join('\n', s.Key, s.Title, s.Artist, s.Album, s.State, s.Shuffle, s.Repeat);

    private void OnSmtcChanged(object? sender, SmtcChange what)
    {
        var shown = _smtc.Current;
        var spotify = SpotifySmtc();
        _ = LoadSmtcArtAsync(shown);
        if (!ReferenceEquals(spotify, shown)) _ = LoadSmtcArtAsync(spotify);
        var spotifySig = Sig(spotify);
        var shownSig = Sig(shown);
        var fastRead = false;
        lock (_lock)
        {
            if (spotifySig != _lastSpotifySig)
            {
                _lastSpotifySig = spotifySig;
                if (spotify is not null)
                {
                    // The fast signal: one debounced read 300 ms after a meaningful local change in Spotify's session.
                    _explicitDue = _time.GetUtcNow() + TimeSpan.FromMilliseconds(300);
                    fastRead = true;
                }
                if (_playOverride is { Target: SpotifyTarget }) _playOverride = null;   // the session reported the new state
            }
            if (shownSig != _lastShownSig)
            {
                _lastShownSig = shownSig;
                if (shown is { IsSpotify: false } && _playOverride is { } po && po.Target == shown.Key) _playOverride = null;
            }
            if (what.HasFlag(SmtcChange.Timeline)) _seekOverride = null;
        }
        if (fastRead) Wake();
        Recompute();
    }

    private async Task LoadSmtcArtAsync(SmtcSnapshot? s)
    {
        if (s?.Thumbnail is not { } bytes || s.ThumbnailHash is not { } hash) return;
        lock (_lock) if (_smtcArts.ContainsKey(hash)) return;
        var art = await Images.FromBytesAsync(bytes, _o.KeyArtPx).ConfigureAwait(false);
        if (art is null) return;
        lock (_lock)
        {
            _smtcArts[hash] = art;
            // Keep only what is shown and Spotify's own (art is cached in memory only, and briefly).
            var keep = new HashSet<string?>(StringComparer.Ordinal) { hash, _smtc.Current?.ThumbnailHash, SpotifySmtc()?.ThumbnailHash };
            foreach (var old in _smtcArts.Keys.Where(k => !keep.Contains(k)).ToList()) _smtcArts.Remove(old);
        }
        Recompute();
    }

    // ------------------------------------------------------------------ polling

    private void Wake()
    {
        var old = Interlocked.Exchange(ref _wake, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        old.TrySetResult();
    }

    /// <summary>Asks for a playback read soon (e.g. after the browser started a track).</summary>
    public void RequestRefresh(TimeSpan? after = null)
    {
        lock (_lock) _explicitDue = _time.GetUtcNow() + (after ?? TimeSpan.Zero);
        Wake();
    }

    private void ConfirmSoon()
    {
        var now = _time.GetUtcNow();
        lock (_lock)
        {
            _confirmations.Clear();
            _confirmations.Enqueue(now + _o.ConfirmFirst);
            _confirmations.Enqueue(now + _o.ConfirmSecond);
        }
        Wake();
    }

    /// <summary>When the next GET /me/player is due (null = no polling) and at which priority.</summary>
    internal (TimeSpan? Delay, RequestPriority Priority) NextPoll(DateTimeOffset now)
    {
        lock (_lock)
        {
            if (!ApiUsable(now))
                return (_basicUntil is { } b && b > now && Auth.State == AuthState.Connected ? b - now : null, RequestPriority.Poll);
            var demanded = (_npPublisher?.IsDemanded ?? false) || (_artPublisher?.IsDemanded ?? false);
            var views = _views.Values.Sum();
            if (views == 0 && !demanded) return (null, RequestPriority.Poll);
            if (_busyUntil is { } busy && busy > now) return (busy - now, RequestPriority.Poll);
            if (_confirmations.Count > 0) return (Guarded(_confirmations.Peek(), now), RequestPriority.Read);
            if (_lastPollAt is not { } last) return (TimeSpan.Zero, RequestPriority.Poll);
            var cadence = Cadence(now, out var trackEnd);
            var due = last + cadence;
            // A track end at or before the last poll is stale (that poll was dropped, or Spotify had not moved on yet):
            // honoring it would make a poll due "now" forever (#6, a spinning core).
            if (trackEnd is { } te && te > last && te < due) due = te;
            if (_explicitDue is { } e && e < due) due = e;
            return (Guarded(due, now), RequestPriority.Poll);
        }
    }

    /// <summary>The delay until <paramref name="due"/>, but never sooner than <see cref="MinPollInterval"/> after the last poll (caller holds the lock).</summary>
    private TimeSpan Guarded(DateTimeOffset due, DateTimeOffset now)
    {
        if (_lastPollAt is { } last && due < last + MinPollInterval) due = last + MinPollInterval;
        return Max0(due - now);
    }

    /// <summary>The §4.2 cadence (caller holds the lock).</summary>
    private TimeSpan Cadence(DateTimeOffset now, out DateTimeOffset? trackEnd)
    {
        trackEnd = null;
        if (_views.GetValueOrDefault(SpotifyView.BrowserOpen) > 0) return TimeSpan.FromSeconds(30);
        var s = SpotifySmtc();
        if (IsLocalPlayback(s, _player)) return TimeSpan.FromSeconds(30);   // event-driven + safety read
        if (_player is null)
            return _idleSince is { } idle && now - idle > TimeSpan.FromMinutes(2) ? TimeSpan.FromSeconds(30) : TimeSpan.FromSeconds(10);
        var d = _player.Dto;
        if (d.IsPlaying)
        {
            if (d.Item is { DurationMs: > 0 } item && d.ProgressMs is { } prog)
                trackEnd = _player.ReceivedAt + TimeSpan.FromMilliseconds(Math.Max(0, item.DurationMs - prog) + 300);
            return TimeSpan.FromSeconds(2);
        }
        return TimeSpan.FromSeconds(5);
    }

    private static TimeSpan Max0(TimeSpan t) => t < TimeSpan.Zero ? TimeSpan.Zero : t;

    private async Task PollLoopAsync(CancellationToken ct)
    {
        await Task.Yield();
        while (!ct.IsCancellationRequested)
        {
            Interlocked.Increment(ref _loopIterations);
            try
            {
                var wake = Volatile.Read(ref _wake).Task;
                var (delay, priority) = NextPoll(_time.GetUtcNow());
                if (delay is null)
                {
                    await wake.WaitAsync(ct).ConfigureAwait(false);
                    continue;
                }
                if (delay > TimeSpan.Zero)
                {
                    using var delayCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    var timer = Task.Delay(delay.Value, _time, delayCts.Token);
                    var first = await Task.WhenAny(wake, timer).ConfigureAwait(false);
                    delayCts.Cancel();
                    if (first == wake) continue;       // something changed: re-evaluate
                    (delay, priority) = NextPoll(_time.GetUtcNow());
                    if (delay is null || delay > TimeSpan.Zero) continue;
                }
                lock (_lock)
                {
                    var now = _time.GetUtcNow();
                    if (_confirmations.Count > 0 && _confirmations.Peek() <= now) _confirmations.Dequeue();
                    if (_explicitDue is { } e && e <= now) _explicitDue = null;
                }
                await PollOnceAsync(priority, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _log.Warn("Spotify poll loop error", ex);
                try { await Task.Delay(TimeSpan.FromSeconds(5), _time, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    /// <summary>One GET /me/player and the follow-ups it implies (like state, art). Public for tests.</summary>
    public async Task PollOnceAsync(RequestPriority priority, CancellationToken ct = default)
    {
        lock (_lock) _lastPollAt = _time.GetUtcNow();
        PlaybackStateDto? dto;
        try { dto = await Api.GetPlayerAsync(priority, ct).ConfigureAwait(false); }
        catch (SpotifyApiException e) when (e.Kind == ApiFailure.Dropped) { return; }
        catch (SpotifyApiException e)
        {
            HandleFailure(e);
            return;
        }
        var now = _time.GetUtcNow();
        string? newUri;
        string? newLikeCheck = null;
        lock (_lock)
        {
            var prev = _player?.Dto.Item?.Uri;
            _player = dto is null ? null : new ApiPlayer(dto, now);
            _playerKnown = true;
            if (dto is null) _idleSince ??= now;
            else _idleSince = null;
            newUri = dto?.Item?.Uri is { } u && u != prev ? u : null;
            if (dto?.Item?.Uri is { } cur && (_apiArt is null || _apiArt.Value.ItemUri != cur)) newUri ??= cur;
            // A fresh read confirms (or corrects) our optimistic overrides.
            if (_shuffleOverride is { } so && dto?.ShuffleState == so.Value) _shuffleOverride = null;
            if (_repeatOverride is { } ro && SpotifyApi.ParseRepeat(dto?.RepeatState) == ro.Value) _repeatOverride = null;
            if (_playOverride is { Target: SpotifyTarget } po && dto is not null && (dto.IsPlaying ? PlayState.Playing : PlayState.Paused) == po.Value) _playOverride = null;
            if (!_volumeSending && _volumeTarget is { } vt && dto?.Device?.VolumePercent == vt) _volumeTarget = null;
            if (_likedRetry is { } retry && retry == dto?.Item?.Uri && newUri is null) { _likedRetry = null; newLikeCheck = retry; }
        }
        if (newUri is not null && dto?.Item is { } item)
        {
            _ = CheckLikedAsync(item.Uri);
            _ = LoadApiArtAsync(item);
        }
        else if (newLikeCheck is not null) _ = CheckLikedAsync(newLikeCheck);
        Recompute();
    }

    private async Task LoadApiArtAsync(ItemDto item)
    {
        var images = item.Album?.Images is { Count: > 0 } ai ? ai : item.Images ?? item.Show?.Images;
        var pick = ImageCache.Pick(images, _o.KeyArtPx);
        if (pick?.Url is not { } url || item.Uri is null) return;
        lock (_lock)
        {
            if (_apiArtLoading == item.Uri) return;
            _apiArtLoading = item.Uri;
        }
        try
        {
            var art = await Images.GetAsync(url, _o.KeyArtPx).ConfigureAwait(false);
            if (art is null) return;
            lock (_lock) _apiArt = (item.Uri, art);
            Recompute();
        }
        finally
        {
            lock (_lock) if (_apiArtLoading == item.Uri) _apiArtLoading = null;
        }
    }

    private async Task CheckLikedAsync(string? uri)
    {
        if (uri is null || uri.StartsWith("spotify:local:", StringComparison.Ordinal)) return;
        if (!(uri.StartsWith("spotify:track:", StringComparison.Ordinal) || uri.StartsWith("spotify:episode:", StringComparison.Ordinal))) return;
        lock (_lock)
        {
            if (_liked.ContainsKey(uri) || !_likedChecking.Add(uri)) return;
        }
        try
        {
            var liked = await Api.LibraryContainsAsync(uri, _cts.Token).ConfigureAwait(false);
            if (liked is { } v) lock (_lock) _liked[uri] = v;
            Recompute();
        }
        catch (SpotifyApiException e)
        {
            // Not waited out (#2): a transient failure is re-checked after the next successful read of this item.
            if (e.Kind is ApiFailure.RateLimited or ApiFailure.Quota or ApiFailure.Network or ApiFailure.Server) lock (_lock) _likedRetry = uri;
            HandleFailure(e);
        }
        catch (OperationCanceledException) { }
        finally { lock (_lock) _likedChecking.Remove(uri); }
    }

    private async Task EnsureMeAsync()
    {
        lock (_lock)
        {
            if (_meFetched) return;
            _meFetched = true;
        }
        try
        {
            var me = await Api.GetMeAsync(_cts.Token).ConfigureAwait(false);
            Library.MeId = me?.Id;
            Auth.SetAccount(me?.DisplayName ?? me?.Id, me?.Id);
            lock (_lock) if (_problem == SpotifyText.NotAllowed) _problem = null;
            Recompute();
        }
        catch (SpotifyApiException e)
        {
            lock (_lock) if (e.Kind is not (ApiFailure.NotAllowed or ApiFailure.Reconnect or ApiFailure.SignedOut)) _meFetched = false;
            HandleFailure(e);
        }
        catch (OperationCanceledException) { }
    }

    // ------------------------------------------------------------------ status handling

    private void OnRateLimited(object? sender, RateLimitEventArgs e)
    {
        var now = _time.GetUtcNow();
        lock (_lock)
        {
            if (e.Quota && !(_basicUntil is { } current && current > now))
            {
                // Only a quota error after basic mode ended escalates it (10 min, doubling to 1 h); parallel 429s count once.
                if (_lastQuotaAt is { } last && now - last > TimeSpan.FromHours(2)) _basicStreak = 0;
                _basicStreak++;
                _lastQuotaAt = now;
                var minutes = Math.Min(60, 10 * Math.Pow(2, _basicStreak - 1));
                _basicUntil = now + TimeSpan.FromMinutes(minutes);
                Gate.PauseUntil(_basicUntil.Value, quota: true);
            }
            if (_busyUntil is null || e.Until > _busyUntil) _busyUntil = e.Until;
        }
        Recompute();
        Wake();
    }

    private void OnApiSucceeded()
    {
        var changed = false;
        lock (_lock)
        {
            var now = _time.GetUtcNow();
            if (_busyUntil is { } b && b <= now) { _busyUntil = null; changed = true; }
            if (_notice == "Offline") { _notice = null; changed = true; }
        }
        if (changed) Recompute();
    }

    private void HandleFailure(SpotifyApiException e)
    {
        lock (_lock)
        {
            switch (e.Kind)
            {
                case ApiFailure.PremiumRequired: _problem = SpotifyText.PremiumRequired + "."; break;
                case ApiFailure.NotAllowed: _problem = SpotifyText.NotAllowed + ". Add it under User Management in your Spotify app, or sign in with the owner account."; break;
                case ApiFailure.Network: _notice = "Offline"; _noticeUntil = _time.GetUtcNow() + TimeSpan.FromMinutes(5); break;
            }
        }
        if (e.Kind is not (ApiFailure.Dropped or ApiFailure.RateLimited or ApiFailure.Quota)) _log.Debug($"Spotify API failure: {e.Kind} ({e.Status})");
        Recompute();
    }

    private void SetNotice(string? text, TimeSpan? duration = null)
    {
        lock (_lock)
        {
            _notice = text;
            _noticeUntil = text is null ? null : _time.GetUtcNow() + (duration ?? TimeSpan.FromSeconds(5));
        }
        Recompute();
    }

    private void ClearApiState()
    {
        lock (_lock)
        {
            _player = null;
            _playerKnown = false;
            _apiArt = null;
            _liked.Clear();
            _problem = null;
            _confirmations.Clear();
            _lastPollAt = null;
        }
    }

    // ------------------------------------------------------------------ connect / disconnect

    public string BeginConnect(string clientId) => Auth.BeginConnect(clientId, _cts.Token);

    /// <summary>Deletes the saved sign-in and every cache (art, playlists, liked state).</summary>
    public void Disconnect()
    {
        Auth.Disconnect();
        Images.Clear();
        Library.Clear();
        lock (_lock)
        {
            _meFetched = false;
            _basicUntil = null;
            _busyUntil = null;
        }
        ClearApiState();
        Recompute();
    }

    // ------------------------------------------------------------------ commands

    private enum Route { None, Smtc, Api }

    /// <summary>
    /// Where a transport command goes. <paramref name="smtcCan"/> says whether the media session can do this command; while
    /// the Web API is paused (a 429 Retry-After beyond the gate's wait cap), Spotify's own session does it instead of the
    /// command failing (#2).
    /// </summary>
    private (Route Route, SmtcSnapshot? Smtc, ApiPlayer? Player) RouteForTransport(Func<SmtcSnapshot, bool>? smtcCan = null)
    {
        // Spotify only: another app's session is routed by the caller (OtherTransportAsync) before this is asked.
        var now = _time.GetUtcNow();
        lock (_lock)
        {
            var s = SpotifySmtc();
            var apiOk = ApiUsable(now);
            var p = apiOk ? _player : null;
            if (s is not null && (!apiOk || p is null || IsLocalPlayback(s, p) || IsLocalDevice(p.Dto.Device))) return (Route.Smtc, s, p);
            if (s is not null && Gate.IsPausedBeyondMaxWait(now) && (smtcCan?.Invoke(s) ?? true)) return (Route.Smtc, s, p);
            return apiOk ? (Route.Api, s, p) : (Route.None, s, p);
        }
    }

    private string? ActiveDeviceId()
    {
        lock (_lock) return _player?.Dto.Device is { IsActive: true, Id: { } id } ? id : null;
    }

    private void SetPlayOverride(PlayState s, string target = SpotifyTarget)
    {
        lock (_lock) _playOverride = (s, _time.GetUtcNow() + OverrideTtl, target);
    }

    /// <summary>The transport commands that follow the shown session (any app); everything else is Spotify-only.</summary>
    public enum Transport { PlayPause, Next, Previous }

    /// <summary>
    /// Whether the shown session can take <paramref name="command"/> right now, without sending anything: another app's
    /// session by its Windows control flags, Spotify by whether there is anything to control at all. The Web API's own
    /// refusals (no Premium, a restricted device) only show once the command is sent.
    /// </summary>
    public CommandResult CheckTransport(Transport command)
    {
        var shown = Current;
        if (shown.IsOtherApp) return CheckOther(shown, command);
        var (route, _, _) = RouteForTransport();
        if (route != Route.None) return CommandResult.Success;
        return command == Transport.PlayPause && IsConnected ? CommandResult.Success : CommandResult.Fail(SpotifyText.OpenSpotify);
    }

    /// <summary>
    /// Sends a transport command to the shown session in the background (for <see cref="SpotifyNowPlayingControl"/>,
    /// whose contract is synchronous): a clear failure when the session can't do it, otherwise success once sent. A later
    /// refusal is logged (type only) and the snapshot shows the real state again.
    /// </summary>
    public CommandResult StartTransport(Transport command)
    {
        var check = CheckTransport(command);
        if (!check.Ok) return check;
        _ = RunTransportAsync(command);
        return CommandResult.Success;
    }

    private async Task RunTransportAsync(Transport command)
    {
        try
        {
            var r = await (command switch
            {
                Transport.Next => NextAsync(),
                Transport.Previous => PreviousAsync(),
                _ => TogglePlayPauseAsync(),
            }).ConfigureAwait(false);
            if (!r.Ok) _log.Debug($"Now-playing control: {command} was refused.");
        }
        catch (Exception ex) { _log.Warn($"Now-playing control: {command} failed unexpectedly: {ex.GetType().Name}"); }
    }

    /// <summary>
    /// Play/pause, next or previous on another app's session (YouTube in a browser, any player): SMTC on exactly the
    /// session the user saw (safe mode fakes it, like Spotify's). Spotify's Web API is never involved.
    /// </summary>
    private static CommandResult CheckOther(PlayerSnapshot shown, Transport command) => command switch
    {
        Transport.PlayPause when !shown.CanPlayPause => CommandResult.Fail(SpotifyText.CantPlayPause(shown.AppName)),
        Transport.Next when !shown.CanSkipNext => CommandResult.Fail(SpotifyText.CantSkip(shown.AppName)),
        Transport.Previous when !shown.CanSkipPrevious => CommandResult.Fail(SpotifyText.CantGoBack(shown.AppName)),
        _ => CommandResult.Success,
    };

    private async Task<CommandResult> OtherTransportAsync(PlayerSnapshot shown, Transport command)
    {
        var check = CheckOther(shown, command);
        if (!check.Ok) return check;
        var key = shown.SessionKey!;
        bool ok;
        switch (command)
        {
            case Transport.PlayPause:
                ok = await _smtc.TogglePlayPauseAsync(key).ConfigureAwait(false);
                if (ok) SetPlayOverride(shown.IsPlaying ? PlayState.Paused : PlayState.Playing, key);
                break;
            case Transport.Next:
                ok = await _smtc.NextAsync(key).ConfigureAwait(false);
                break;
            default:
                ok = await _smtc.PreviousAsync(key).ConfigureAwait(false);
                break;
        }
        Recompute();
        if (ok) return CommandResult.Success;
        return _smtc.Sessions.Any(x => x.Key == key) ? CommandResult.Fail(SpotifyText.NoResponse) : CommandResult.Fail(SpotifyText.Gone(shown.AppName));
    }

    private bool InBasicMode()
    {
        var now = _time.GetUtcNow();
        lock (_lock) return _basicUntil is { } b && b > now;
    }

    /// <summary>True when Spotify's own media session should do a toggle/shuffle/repeat because the Web API is paused.</summary>
    private bool SmtcWhilePaused(Func<SmtcSnapshot, bool> can) =>
        SpotifySmtc() is { } s && can(s) && Gate.IsPausedBeyondMaxWait(_time.GetUtcNow());

    private async Task<CommandResult> ApiCommand(Func<CancellationToken, Task> call)
    {
        try
        {
            await call(_cts.Token).ConfigureAwait(false);
            ConfirmSoon();
            return CommandResult.Success;
        }
        catch (SpotifyApiException e)
        {
            HandleFailure(e);
            return CommandResult.Fail(SpotifyText.ForFailure(e));
        }
        catch (OperationCanceledException) { return CommandResult.Fail("Cancelled"); }
        catch (Exception ex)
        {
            // Never let a surprise skip the caller's revert of its optimistic state. Type only: messages can carry URLs.
            _log.Warn($"Spotify command failed unexpectedly: {ex.GetType().Name}");
            return CommandResult.Fail(SpotifyText.Refused);
        }
    }

    /// <summary>Play/pause on the shown session: another app's via SMTC, Spotify's via SMTC (this PC) or the Web API.</summary>
    public async Task<CommandResult> TogglePlayPauseAsync()
    {
        var cur = Current;
        if (cur.IsOtherApp) return await OtherTransportAsync(cur, Transport.PlayPause).ConfigureAwait(false);
        var (route, s, _) = RouteForTransport(x => x.CanPlay || x.CanPause);
        switch (route)
        {
            case Route.Smtc:
                var ok = await _smtc.TogglePlayPauseAsync(s!.Key).ConfigureAwait(false);
                if (!ok) return CommandResult.Fail(SpotifyText.NoResponse);
                SetPlayOverride(cur.IsPlaying ? PlayState.Paused : PlayState.Playing);
                if (IsConnected) ConfirmSoon();
                Recompute();
                return CommandResult.Success;
            case Route.Api:
                if (cur.IsPlaying)
                {
                    SetPlayOverride(PlayState.Paused);
                    Recompute();
                    var r = await ApiCommand(ct => Api.PauseAsync(ActiveDeviceId(), ct)).ConfigureAwait(false);
                    if (!r.Ok) { lock (_lock) _playOverride = null; Recompute(); }
                    return r;
                }
                return await PlayWithRecipeAsync(null).ConfigureAwait(false);
            default:
                return IsConnected ? await PlayWithRecipeAsync(null).ConfigureAwait(false) : CommandResult.Fail(SpotifyText.OpenSpotify);
        }
    }

    public Task<CommandResult> NextAsync() => SkipAsync(next: true);
    public Task<CommandResult> PreviousAsync() => SkipAsync(next: false);

    private async Task<CommandResult> SkipAsync(bool next)
    {
        var cur = Current;
        if (cur.IsOtherApp) return await OtherTransportAsync(cur, next ? Transport.Next : Transport.Previous).ConfigureAwait(false);
        var (route, s, _) = RouteForTransport(x => next ? x.CanNext : x.CanPrevious);
        switch (route)
        {
            case Route.Smtc:
                var ok = next ? await _smtc.NextAsync(s!.Key).ConfigureAwait(false) : await _smtc.PreviousAsync(s!.Key).ConfigureAwait(false);
                if (ok && IsConnected) ConfirmSoon();
                return ok ? CommandResult.Success : CommandResult.Fail(SpotifyText.NoResponse);
            case Route.Api:
                var device = ActiveDeviceId();
                return await ApiCommand(ct => next ? Api.NextAsync(device, ct) : Api.PreviousAsync(device, ct)).ConfigureAwait(false);
            default:
                return CommandResult.Fail(SpotifyText.OpenSpotify);
        }
    }

    /// <summary>Spotify's shuffle (Web API, or Spotify's own session), whatever app is shown.</summary>
    public async Task<CommandResult> ToggleShuffleAsync()
    {
        var cur = SpotifyCurrent;
        var target = !(cur.Shuffle ?? false);
        lock (_lock) _shuffleOverride = (target, _time.GetUtcNow() + OverrideTtl);
        Recompute();
        CommandResult r;
        var s = SpotifySmtc();
        if (ApiUsable(_time.GetUtcNow()) && !SmtcWhilePaused(x => x.CanShuffle)) r = await ApiCommand(ct => Api.SetShuffleAsync(target, ActiveDeviceId(), ct)).ConfigureAwait(false);
        else if (s is { CanShuffle: true }) r = await _smtc.SetShuffleAsync(s.Key, target).ConfigureAwait(false) ? CommandResult.Success : CommandResult.Fail(SpotifyText.NoResponse);
        else r = CommandResult.Fail(s is null ? SpotifyText.OpenSpotify : SpotifyText.ConnectHint);
        if (!r.Ok) { lock (_lock) _shuffleOverride = null; Recompute(); }
        return r;
    }

    public static RepeatMode NextRepeat(RepeatMode? m) => m switch
    {
        RepeatMode.Off or null => RepeatMode.Context,
        RepeatMode.Context => RepeatMode.Track,
        _ => RepeatMode.Off,
    };

    /// <summary>Spotify's repeat (Web API, or Spotify's own session), whatever app is shown.</summary>
    public async Task<CommandResult> CycleRepeatAsync()
    {
        var target = NextRepeat(SpotifyCurrent.Repeat);
        lock (_lock) _repeatOverride = (target, _time.GetUtcNow() + OverrideTtl);
        Recompute();
        CommandResult r;
        var s = SpotifySmtc();
        if (ApiUsable(_time.GetUtcNow()) && !SmtcWhilePaused(x => x.CanRepeat)) r = await ApiCommand(ct => Api.SetRepeatAsync(target, ActiveDeviceId(), ct)).ConfigureAwait(false);
        else if (s is { CanRepeat: true }) r = await _smtc.SetRepeatAsync(s.Key, target).ConfigureAwait(false) ? CommandResult.Success : CommandResult.Fail(SpotifyText.NoResponse);
        else r = CommandResult.Fail(s is null ? SpotifyText.OpenSpotify : SpotifyText.ConnectHint);
        if (!r.Ok) { lock (_lock) _repeatOverride = null; Recompute(); }
        return r;
    }

    /// <summary>
    /// Like/unlike the current item (PUT/DELETE /me/library?uris=…), optimistic. Any failure reverts the heart, and a
    /// re-check follows 3 s later.
    /// </summary>
    public async Task<CommandResult> ToggleLikeAsync()
    {
        if (!IsConnected) return CommandResult.Fail(SpotifyText.ConnectHint);
        if (InBasicMode()) return CommandResult.Fail(SpotifyText.BasicMode);
        var cur = SpotifyCurrent;   // Spotify's track, even while another app is shown
        if (!cur.CanLike || cur.Uri is not { } uri) return CommandResult.Fail(cur.IsLocalFile ? "Local files can't be liked" : "Nothing to like");
        var was = cur.Liked;
        if (was is null)
        {
            try { was = await Api.LibraryContainsAsync(uri, _cts.Token).ConfigureAwait(false) ?? false; }
            catch (SpotifyApiException e) { HandleFailure(e); return CommandResult.Fail(SpotifyText.ForFailure(e)); }
            catch (OperationCanceledException) { return CommandResult.Fail("Cancelled"); }
        }
        var target = !was.Value;
        lock (_lock) _liked[uri] = target;
        Recompute();
        var done = false;
        try
        {
            if (target) await Api.SaveToLibraryAsync(uri, _cts.Token).ConfigureAwait(false);
            else await Api.RemoveFromLibraryAsync(uri, _cts.Token).ConfigureAwait(false);
            done = true;
            return CommandResult.Success;
        }
        catch (SpotifyApiException e)
        {
            HandleFailure(e);
            return CommandResult.Fail(SpotifyText.ForFailure(e));
        }
        catch (OperationCanceledException) { return CommandResult.Fail("Cancelled"); }
        catch (Exception ex)
        {
            _log.Warn($"Spotify like failed unexpectedly: {ex.GetType().Name}");
            return CommandResult.Fail(SpotifyText.Refused);
        }
        finally
        {
            if (!done)
            {
                lock (_lock) _liked[uri] = was.Value;   // revert the optimistic heart, then re-check in 3 s
                _ = RecheckLikedLaterAsync(uri);
            }
            Recompute();
        }
    }

    private async Task RecheckLikedLaterAsync(string uri)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), _time, _cts.Token).ConfigureAwait(false);
            lock (_lock) _liked.Remove(uri);
            await CheckLikedAsync(uri).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { }
    }

    // ---- volume (Web API only: Spotify's own device volume)

    /// <summary>Sets Spotify's device volume. Optimistic; sends the latest value at most every 200 ms (latest-wins).</summary>
    public CommandResult SetVolume(int percent)
    {
        if (!IsConnected) return CommandResult.Fail(SpotifyText.ConnectHint);
        if (InBasicMode()) return CommandResult.Fail(SpotifyText.BasicMode);
        var cur = SpotifyCurrent;   // Spotify's device volume, whatever app is shown
        if (cur.DeviceId is not null && !cur.SupportsVolume) return CommandResult.Fail("This device doesn't support volume control");
        var v = Math.Clamp(percent, 0, 100);
        var sender = 0;
        lock (_lock)
        {
            _volumeTarget = v;
            _volumeOverrideUntil = _time.GetUtcNow() + OverrideTtl;
            if (!_volumeSending)
            {
                _volumeSending = true;
                sender = ++_volumeSenderId;
            }
        }
        Recompute();
        if (sender != 0) _ = VolumeSenderAsync(sender);
        return CommandResult.Success;
    }

    public CommandResult AdjustVolume(int delta) => SetVolume((SpotifyCurrent.VolumePct ?? 50) + delta);

    /// <summary>Mute (remembering the level) or restore it.</summary>
    public CommandResult ToggleMute()
    {
        var v = SpotifyCurrent.VolumePct;
        if (v is > 0)
        {
            lock (_lock) _preMuteVolume = v;
            return SetVolume(0);
        }
        int restore;
        lock (_lock) restore = _preMuteVolume ?? 50;
        return SetVolume(restore);
    }

    public bool IsMuted => SpotifyCurrent.VolumePct == 0;

    /// <summary>
    /// The one coalescing volume sender (<paramref name="id"/> owns <c>_volumeSending</c> until it exits). Every exit path
    /// releases it and clears <c>_volumeSent</c>, so the next gesture always goes out, even the same value again (#5);
    /// a failure of any kind also drops the optimistic level (#4).
    /// </summary>
    private async Task VolumeSenderAsync(int id)
    {
        var released = false;
        string? failure = null;
        try
        {
            while (true)
            {
                int target;
                lock (_lock)
                {
                    if (_volumeTarget is not { } t || t == _volumeSent)
                    {
                        // Release in the same lock as the check, so a gesture arriving now starts a new sender.
                        _volumeSending = false;
                        _volumeSent = null;
                        _volumeOverrideUntil = _time.GetUtcNow() + OverrideTtl;
                        released = true;
                        return;
                    }
                    target = t;
                }
                await Api.SetVolumeAsync(target, ActiveDeviceId(), _cts.Token).ConfigureAwait(false);
                lock (_lock) _volumeSent = target;
                await Task.Delay(TimeSpan.FromMilliseconds(200), _time, _cts.Token).ConfigureAwait(false);
            }
        }
        catch (SpotifyApiException e)
        {
            HandleFailure(e);
            failure = SpotifyText.ForFailure(e);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _log.Warn($"Spotify volume send failed unexpectedly: {ex.GetType().Name}");
            failure = SpotifyText.Refused;
        }
        finally
        {
            if (!released)
            {
                lock (_lock)
                {
                    if (_volumeSenderId == id && _volumeSending)
                    {
                        _volumeSending = false;
                        _volumeSent = null;
                        if (failure is not null) _volumeTarget = null;   // show what Spotify reports again
                    }
                }
            }
            if (failure is not null) VolumeFailed?.Invoke(this, failure);
            ConfirmSoon();
            Recompute();
        }
    }

    /// <summary>Raised when a coalesced volume send failed (the dial flashes the message).</summary>
    public event EventHandler<string>? VolumeFailed;

    // ---- seek

    /// <summary>
    /// Moves Spotify's position by <paramref name="delta"/>; ticks accumulate and one seek goes out 300 ms after the last.
    /// Spotify only: while another app is shown it fails calmly (a seek must never land on a track nobody sees).
    /// </summary>
    public CommandResult SeekBy(TimeSpan delta)
    {
        var cur = Current;
        if (cur.IsOtherApp) return CommandResult.Fail(SpotifyText.SeekSpotifyOnly);
        if (!cur.HasItem || cur.DurationMs is null) return CommandResult.Fail("Nothing to seek");
        var now = _time.GetUtcNow();
        lock (_lock)
        {
            if (!_seekPending)
            {
                _seekBaseMs = cur.PositionNow(now) ?? 0;
                _seekAccumMs = 0;
                _seekPending = true;
            }
            _seekAccumMs += (long)delta.TotalMilliseconds;
            var target = Math.Clamp(_seekBaseMs + _seekAccumMs, 0, Math.Max(0, cur.DurationMs.Value - 1000));
            _seekOverride = (target, now, now + OverrideTtl);
            _seekTimer ??= _time.CreateTimer(_ => _ = FlushSeekAsync(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
            _seekTimer.Change(TimeSpan.FromMilliseconds(300), Timeout.InfiniteTimeSpan);
        }
        Recompute();
        return CommandResult.Success;
    }

    private async Task FlushSeekAsync()
    {
        long target;
        lock (_lock)
        {
            if (!_seekPending || _seekOverride is not { } so) return;
            _seekPending = false;
            target = so.PositionMs;
            _seekOverride = (target, _time.GetUtcNow(), _time.GetUtcNow() + OverrideTtl);
        }
        var (route, s, _) = RouteForTransport(x => x.CanSeek);
        var ok = route switch
        {
            Route.Smtc => await _smtc.SeekAsync(s!.Key, TimeSpan.FromMilliseconds(target)).ConfigureAwait(false),
            Route.Api => (await ApiCommand(ct => Api.SeekAsync(target, ActiveDeviceId(), ct)).ConfigureAwait(false)).Ok,
            _ => false,
        };
        if (!ok)
        {
            lock (_lock) if (!_seekPending) _seekOverride = null;   // show the real position again
            Recompute();
        }
    }

    // ---- playlists

    /// <summary>
    /// Plays a playlist: at a track (offset.position from the row index; offset.uri if the playlist changed since it was
    /// listed), from the top, or shuffled (shuffle on, then the context with no offset).
    /// </summary>
    public async Task<CommandResult> PlayPlaylistAsync(PlaylistEntry playlist, TrackEntry? track, bool shuffle)
    {
        if (!IsConnected) return CommandResult.Fail(SpotifyText.ConnectHint);
        if (track is { IsPlayable: false }) return CommandResult.Fail(track.IsLocal ? "Local files can't be played from here" : "That track isn't available");
        PlayBody body;
        var shuffleAfterPlay = false;
        if (shuffle)
        {
            var r = await ApiCommand(ct => Api.SetShuffleAsync(true, ActiveDeviceId(), ct)).ConfigureAwait(false);
            if (!r.Ok && r.Message != SpotifyText.OpenSpotify) return r;
            shuffleAfterPlay = !r.Ok;   // no active device yet: shuffle once the recipe has started one
            lock (_lock) _shuffleOverride = (true, _time.GetUtcNow() + OverrideTtl);
            body = new PlayBody { ContextUri = playlist.Uri };
        }
        else if (track is not null)
        {
            var latest = LatestSnapshot(playlist.Id);
            var changed = latest is not null && playlist.SnapshotId is not null && latest != playlist.SnapshotId;
            body = new PlayBody
            {
                ContextUri = playlist.Uri,
                Offset = changed && track.Uri is not null ? new OffsetDto { Uri = track.Uri } : new OffsetDto { Position = track.Position },
                PositionMs = 0,
            };
        }
        else body = new PlayBody { ContextUri = playlist.Uri };
        var result = await PlayWithRecipeAsync(body).ConfigureAwait(false);
        if (result.Ok && shuffleAfterPlay) await ApiCommand(ct => Api.SetShuffleAsync(true, null, ct)).ConfigureAwait(false);
        return result;
    }

    private string? LatestSnapshot(string playlistId)
    {
        for (var offset = 0; offset < 100_000; offset += PlaylistLibrary.PageSize)
        {
            var page = Library.CachedPlaylists(offset);
            if (page is null) return null;
            if (page.Items.FirstOrDefault(p => p.Id == playlistId) is { } hit) return hit.SnapshotId;
        }
        return null;
    }

    /// <summary>
    /// PUT /me/player/play with the research §3.3 recipe when nothing is active: find this PC's device and target it,
    /// nudge the local app through SMTC, or start Spotify and wait for its device to appear.
    /// </summary>
    private async Task<CommandResult> PlayWithRecipeAsync(PlayBody? body)
    {
        bool idle;
        lock (_lock) idle = _playerKnown && _player is null;
        var ct = _cts.Token;
        try
        {
            if (!idle)
            {
                try
                {
                    if (body is null) SetPlayOverride(PlayState.Playing);
                    await Api.PlayAsync(body, null, ct).ConfigureAwait(false);
                    ConfirmSoon();
                    Recompute();
                    return CommandResult.Success;
                }
                catch (SpotifyApiException e) when (e.Kind == ApiFailure.NoActiveDevice)
                {
                    lock (_lock) _playOverride = null;
                }
            }

            var local = await FindLocalDeviceAsync(ct).ConfigureAwait(false);
            if (local is null && SpotifySmtc() is { } spotifySession)
            {
                await _smtc.PlayAsync(spotifySession.Key).ConfigureAwait(false);   // makes the desktop app's device active
                await Task.Delay(TimeSpan.FromSeconds(1), _time, ct).ConfigureAwait(false);
                local = await FindLocalDeviceAsync(ct).ConfigureAwait(false);
            }
            if (local is null && _o.LaunchUri is { } launch && Launch(launch))
            {
                SetNotice("Starting Spotify…", _o.DeviceWait + TimeSpan.FromSeconds(1));
                var deadline = _time.GetUtcNow() + _o.DeviceWait;
                while (local is null && _time.GetUtcNow() < deadline)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), _time, ct).ConfigureAwait(false);
                    local = await FindLocalDeviceAsync(ct).ConfigureAwait(false);
                }
            }
            if (local?.Id is not { } id)
            {
                SetNotice("No Spotify device. " + SpotifyText.OpenSpotify + ".", TimeSpan.FromSeconds(30));
                return CommandResult.Fail(SpotifyText.OpenSpotify);
            }
            if (body is null) await Api.TransferAsync(id, play: true, ct).ConfigureAwait(false);
            else await Api.PlayAsync(body, id, ct).ConfigureAwait(false);
            SetNotice(null);
            ConfirmSoon();
            return CommandResult.Success;
        }
        catch (SpotifyApiException e)
        {
            lock (_lock) _playOverride = null;
            HandleFailure(e);
            return CommandResult.Fail(SpotifyText.ForFailure(e));
        }
        catch (OperationCanceledException) { return CommandResult.Fail("Cancelled"); }
    }

    /// <summary>Starts the desktop app ("spotify:"). In safe mode nothing is started (and the recipe reports no device).</summary>
    private bool Launch(Func<string, bool> launch)
    {
        if (SafeModeWrites.Enabled)
        {
            SafeModeWrites.Suppressed("launch spotify");
            return false;
        }
        return launch("spotify:");
    }

    /// <summary>This PC's Spotify Connect device: a Computer named like the PC, else the only Computer (research §3.3).</summary>
    private async Task<DeviceDto?> FindLocalDeviceAsync(CancellationToken ct)
    {
        var devices = (await Api.GetDevicesAsync(ct).ConfigureAwait(false)).Where(d => d.Id is not null && !d.IsRestricted).ToList();
        var computers = devices.Where(d => string.Equals(d.Type, "computer", StringComparison.OrdinalIgnoreCase)).ToList();
        var local = computers.FirstOrDefault(d => string.Equals(d.Name, _o.MachineName, StringComparison.OrdinalIgnoreCase))
            ?? (computers.Count == 1 ? computers[0] : null);
        if (local?.Id is { } id) lock (_lock) _localDeviceId = id;
        return local;
    }

    /// <summary>Spotify's current item, to open in the Spotify app (the link back Spotify requires near art).</summary>
    public string? LinkBack()
    {
        var cur = SpotifyCurrent;
        if (cur.Uri is { } uri && !cur.IsLocalFile) return uri;   // spotify:track:… opens the desktop app
        return cur.Url;
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
        try { _cts.Cancel(); } catch (ObjectDisposedException) { }
        Wake();
        if (_pollLoop is { } loop)
        {
            try { await loop.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); }
            catch (Exception) { }
        }
        _seekTimer?.Dispose();
        _smtc.Changed -= OnSmtcChanged;
        await _smtc.DisposeAsync().ConfigureAwait(false);
        Auth.Dispose();
        _http.Dispose();
        _cts.Dispose();
    }
}
