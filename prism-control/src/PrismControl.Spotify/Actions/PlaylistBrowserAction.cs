using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render.Tokens;
using PrismControl.Core.Theming;
using PrismControl.Core.Render;
using PrismControl.Spotify.Browser;
using PrismControl.Spotify.Images;
using PrismControl.Spotify.Render;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Actions;

public sealed class BrowserSettings;

/// <summary>
/// The dial playlist browser (research §6), all reachable with rotate + short push:
/// push to open the browser, turn to scroll your playlists, push to open one, turn to a track, push to play it in the
/// playlist's context. Row 0 of the track list is "‹ Back to playlists"; row 0 of the playlists is "‹ Now playing".
/// Not-owned playlists offer Play / Shuffle play. After 20 s without input it returns to the now-playing view and keeps
/// its place for 5 minutes. Pages load lazily (50 rows); covers load once the highlight settles (150 ms).
/// Frames go out at most every 33 ms while turning. Stream Deck + extras: tap = push, long touch or dial hold = back.
/// </summary>
[StreamDeckAction("com.jeremyfhall.prismcontrol.spotify.browser", Name = "Playlist Browser",
    Icon = "imgs/actions/spotify/browser/icon", KeyImage = "imgs/actions/spotify/browser/key", EncoderIcon = "imgs/actions/spotify/browser/dial",
    Controllers = Controllers.Encoder,
    Tooltip = "Push to browse your playlists. Turn to scroll, push to open a playlist, then turn to a track and push to play it.",
    Layout = Layouts.Canvas.Path, PropertyInspector = SpotifyBinding.PiPage,
    TriggerRotate = "Scroll", TriggerPush = "Open / Play", TriggerTouch = "Open / Play", TriggerLongTouch = "Back")]
public sealed class PlaylistBrowserAction : DialAction<BrowserSettings>, IDisposable
{
    public static readonly TimeSpan IdleTimeout = TimeSpan.FromSeconds(20);
    public static readonly TimeSpan ResumeWindow = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan SettleDelay = TimeSpan.FromMilliseconds(150);
    public static readonly TimeSpan MinFrameInterval = TimeSpan.FromMilliseconds(33);
    /// <summary>Focused cover: Spotify's 300 px image scaled to 128 px (≈72 px on the Galleon, 70 px on the + strip).</summary>
    public const int FocusArtPx = 128;
    /// <summary>List-row thumbnails: Spotify's 64/60 px image as is.</summary>
    public const int RowArtPx = 64;

    private readonly BrowserModel _m = new();
    private readonly HashSet<string> _loading = new(StringComparer.Ordinal);
    private readonly List<Task> _pending = [];
    private readonly Queue<long> _recentTurns = new();
    private SpotifyBinding? _b;
    private IDisposable? _lookWatch;

    /// <summary>The palette to draw with: Spotify's app look when a Kaleidoscope deck shows Spotify, else Prism (core.theme).</summary>
    private RefractionPalette Look => AppTheming.For(Services, Device.Id, Theme)?.Palette ?? Theme;
    private IDisposable? _openView;
    private RenderLoop? _loop;
    private ITimer? _settle;
    private EventHandler<string>? _onArt;
    private Flash _flash;
    private bool _browsing;
    private bool _dirty = true;
    private bool _userMoved;
    private long _lastInput;
    private long _leftAt;
    private long _lastFrame;
    private int _generation;

    private SpotifyService? Svc => _b?.Service;
    internal BrowserModel Model => _m;
    internal bool IsBrowsing => _browsing;
    /// <summary>Background page loads and play commands in flight (tests await them).</summary>
    internal Task PendingAsync()
    {
        lock (_pending) { _pending.RemoveAll(t => t.IsCompleted); return Task.WhenAll([.. _pending]); }
    }

    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        _b?.Dispose();
        _b = SpotifyBinding.Attach(this, Services, GlobalSettings, SpotifyView.Browser, MarkDirty);
        _lookWatch?.Dispose();
        _lookWatch = AppTheming.Watch(Services, Device.Id, () => Post(MarkDirty));
        if (Svc is { } svc)
        {
            _onArt = (_, _) => Post(MarkDirty);
            svc.ArtLoaded += _onArt;
        }
        SetFeedbackLayout(Layouts.Canvas.Path);
        if (Device.Capabilities.HasTouchStrip) SetTriggerDescription("Scroll", "Open / Play", "Open / Play", "Back");
        else SetTriggerDescription("Scroll", "Open / Play");
        _loop = StartRenderLoop(Tick, TimeSpan.FromSeconds(1), MinFrameInterval);
        return Task.CompletedTask;
    }

    protected override Task OnWillDisappearAsync(WillDisappearEvent e)
    {
        Dispose();
        return Task.CompletedTask;
    }

    // ------------------------------------------------------------------ input

    protected override Task OnDialRotateAsync(DialRotateEvent e)
    {
        _lastInput = Time.GetTimestamp();
        if (Svc is not { IsConnected: true } || e.Ticks == 0) { MarkDirty(); return Task.CompletedTask; }
        if (!_browsing) EnterBrowse();
        var rows = BrowserModel.RowsForTicks(e.Ticks) * Acceleration();
        if (_m.Move(rows))
        {
            _userMoved = true;
            _flash.Clear();
            ScheduleSettle();
        }
        MarkDirty();
        return Task.CompletedTask;
    }

    /// <summary>Stream Deck + sends ±1 per event: more than 4 events within 250 ms triple the step.</summary>
    private int Acceleration()
    {
        if (Device.Capabilities.MaxTicksPerEvent > 1) return 1;
        var now = Time.GetTimestamp();
        _recentTurns.Enqueue(now);
        while (_recentTurns.Count > 0 && Time.GetElapsedTime(_recentTurns.Peek(), now) > TimeSpan.FromMilliseconds(250)) _recentTurns.Dequeue();
        return _recentTurns.Count > 4 ? 3 : 1;
    }

    protected override Task OnDialPressAsync(DialUpEvent e)
    {
        _lastInput = Time.GetTimestamp();
        Press();
        return Task.CompletedTask;
    }

    protected override Task OnDialLongPressAsync(DialDownEvent e)
    {
        _lastInput = Time.GetTimestamp();
        Back();   // Stream Deck + only; the "‹ Back" row does the same everywhere
        return Task.CompletedTask;
    }

    protected override Task OnTouchTapAsync(TouchTapEvent e)
    {
        _lastInput = Time.GetTimestamp();
        if (e.Hold) Back();
        else Press();
        return Task.CompletedTask;
    }

    private void Press()
    {
        var svc = Svc;
        if (svc is null) { ShowAlert(); return; }
        if (!svc.IsConnected)
        {
            ShowAlert();
            _flash.Set(Time, svc.Status.Auth == AuthState.NeedsReconnect ? SpotifyText.Reconnect : SpotifyText.ConnectHint, true, TimeSpan.FromSeconds(3));
            MarkDirty();
            return;
        }
        if (!_browsing)
        {
            EnterBrowse();
            MarkDirty();
            return;
        }
        var row = _m.Current;
        switch (row.Kind)
        {
            case RowKind.NowPlaying:
                ExitBrowse();
                break;
            case RowKind.Playlist:
                _m.OpenPlaylist(row.Playlist!, svc.Library.CanListTracks(row.Playlist!));
                _generation++;
                _flash.Clear();
                LoadWanted();
                RequestCovers();
                break;
            case RowKind.Back:
                Back();
                break;
            case RowKind.PlayAll:
            case RowKind.ShufflePlay:
                StartPlay(svc, row.Playlist!, null, row.Kind == RowKind.ShufflePlay);
                break;
            case RowKind.Track:
                if (!row.Enabled)
                {
                    ShowAlert();
                    _flash.Set(Time, row.Track?.IsLocal == true ? "Local files can't play from here" : "That track isn't available", true, TimeSpan.FromSeconds(2));
                }
                else StartPlay(svc, row.Playlist!, row.Track, shuffle: false);
                break;
        }
        MarkDirty();
    }

    private void Back()
    {
        if (!_browsing) return;
        if (_m.Level == BrowserLevel.Tracks)
        {
            _m.ShowPlaylists();
            _generation++;
            _flash.Clear();
            LoadWanted();
            RequestCovers();
        }
        else ExitBrowse();
        MarkDirty();
    }

    private void EnterBrowse()
    {
        if (Svc is not { } svc) return;
        _browsing = true;
        _openView ??= svc.AttachView(SpotifyView.BrowserOpen);
        if (_leftAt == 0 || Time.GetElapsedTime(_leftAt) > ResumeWindow)
        {
            _m.Reset(dropData: true);
            _userMoved = false;
        }
        svc.Library.MarkStale();
        _generation++;
        _flash.Clear();
        LoadWanted();
        RequestCovers();
    }

    private void ExitBrowse()
    {
        _browsing = false;
        _leftAt = Time.GetTimestamp();
        _openView?.Dispose();
        _openView = null;
        _settle?.Dispose();
        _settle = null;
        MarkDirty();
    }

    private void StartPlay(SpotifyService svc, PlaylistEntry playlist, TrackEntry? track, bool shuffle)
    {
        _flash.Set(Time, "Starting…", false, TimeSpan.FromSeconds(15));
        Track(Task.Run(async () =>
        {
            var r = await svc.PlayPlaylistAsync(playlist, track, shuffle).ConfigureAwait(false);
            Post(() =>
            {
                if (r.Ok) _flash.Set(Time, shuffle ? "Shuffling" : "Playing", false, TimeSpan.FromSeconds(1.5));
                else
                {
                    ShowAlert();
                    _flash.Set(Time, r.Message ?? "Couldn't play that", true, TimeSpan.FromSeconds(2));
                }
                MarkDirty();
            });
        }));
    }

    // ------------------------------------------------------------------ loading

    private void ScheduleSettle()
    {
        _settle ??= Time.CreateTimer(_ => Post(OnSettled), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _settle.Change(SettleDelay, Timeout.InfiniteTimeSpan);
    }

    private void OnSettled()
    {
        if (!_browsing) return;
        LoadWanted();
        RequestCovers();
    }

    private void LoadWanted()
    {
        if (Svc is not { } svc || !_browsing) return;
        var level = _m.Level;
        var playlist = _m.Playlist;
        var gen = _generation;
        foreach (var page in _m.PagesWanted())
        {
            var key = $"{level}:{playlist?.Id}:{playlist?.SnapshotId}:{page}";
            if (!_loading.Add(key)) continue;
            var offset = page * PlaylistLibrary.PageSize;
            Track(Task.Run(async () =>
            {
                try
                {
                    if (level == BrowserLevel.Playlists)
                    {
                        var r = await svc.Library.GetPlaylistsPageAsync(offset, CancellationToken.None).ConfigureAwait(false);
                        Post(() =>
                        {
                            _loading.Remove(key);
                            if (_m.Level == BrowserLevel.Playlists)
                            {
                                _m.AddPlaylists(r);
                                if (!_userMoved && svc.SpotifyCurrent.ContextUri is { } ctx) _m.FocusPlaylist(ctx);
                            }
                            MarkDirty();
                            LoadWanted();
                            RequestCovers();
                        });
                    }
                    else
                    {
                        var r = await svc.Library.GetTracksPageAsync(playlist!, offset, CancellationToken.None).ConfigureAwait(false);
                        Post(() =>
                        {
                            _loading.Remove(key);
                            _m.AddTracks(playlist!, r);
                            MarkDirty();
                            LoadWanted();
                            RequestCovers();
                        });
                    }
                }
                catch (PlaylistNotOwnedException)
                {
                    Post(() =>
                    {
                        _loading.Remove(key);
                        if (_m.Playlist?.Id == playlist?.Id) _m.MarkNotOwned();
                        MarkDirty();
                    });
                }
                catch (Exception ex)
                {
                    var message = ex is SpotifyApiException api ? SpotifyText.ForFailure(api) : "Couldn't load the list";
                    Post(() =>
                    {
                        _loading.Remove(key);
                        if (gen == _generation) _m.Error = message;
                        MarkDirty();
                    });
                }
            }));
        }
    }

    /// <summary>Loads covers for the visible rows ± 3 (the focus at 128 px, the others as small thumbnails).</summary>
    private void RequestCovers()
    {
        if (Svc is not { } svc || !_browsing) return;
        for (var i = _m.Highlight - 3; i <= _m.Highlight + 3; i++)
        {
            if (i < 0 || i >= _m.RowCount) continue;
            var row = _m.RowAt(i);
            if (!row.IsData) continue;
            var focus = i == _m.Highlight;
            if (ImageCache.Pick(row.Images, focus ? 72 : 30)?.Url is { } url && svc.Images.TryGet(url, focus ? FocusArtPx : RowArtPx) is null)
                Track(svc.Images.GetAsync(url, focus ? FocusArtPx : RowArtPx));
        }
    }

    private void Track(Task t)
    {
        lock (_pending)
        {
            _pending.RemoveAll(x => x.IsCompleted);
            _pending.Add(t);
        }
    }

    // ------------------------------------------------------------------ rendering

    private void MarkDirty()
    {
        _dirty = true;
        _loop?.Invalidate();
    }

    private void Tick()
    {
        if (_browsing && Time.GetElapsedTime(_lastInput) >= IdleTimeout) ExitBrowse();
        if (_browsing && !_dirty) return;
        // At most one frame per 33 ms (≤ 30 Hz) however fast the dial turns; the loop comes back within 33 ms.
        if (_lastFrame != 0 && Time.GetElapsedTime(_lastFrame) < MinFrameInterval) return;
        _dirty = false;
        _lastFrame = Time.GetTimestamp();
        Render();
    }

    private ArtImage? Lookup(IReadOnlyList<ImageDto>? images, bool focus)
    {
        if (Svc is not { } svc) return null;
        var pick = ImageCache.Pick(images, focus ? 72 : 30);
        return pick?.Url is { } u ? svc.Images.TryGet(u, focus ? FocusArtPx : RowArtPx) : null;
    }

    private void Render()
    {
        if (!IsVisible) return;
        var svc = Svc;
        var t = Look;
        var now = Time.GetUtcNow();
        var active = IsInteractive;
        var flash = _flash.Get(Time);
        SvgDocument frame;
        if (svc is null)
            frame = SpotifyArt.MessageDial(t, "Spotify", "Spotify is unavailable", "See the plugin log", active, warn: true);
        else if (!svc.IsConnected)
        {
            var snap = svc.SpotifyCurrent;   // the browser is Spotify's, whatever app the deck shows
            var expired = svc.Status.Auth == AuthState.NeedsReconnect;
            frame = snap.HasItem && flash is null
                ? SpotifyArt.NowPlayingDial(t, snap, now, active, new FrameNotice(expired ? "Reconnect to browse" : "Connect Spotify to browse", false))
                : SpotifyArt.MessageDial(t, "Spotify", expired ? "Spotify sign-in expired" : "Connect Spotify", "in the plugin settings", active, warn: flash is not null);
        }
        else if (!_browsing)
        {
            var snap = svc.SpotifyCurrent;
            frame = snap.HasItem
                ? SpotifyArt.NowPlayingDial(t, snap, now, active, flash)
                : SpotifyArt.MessageDial(t, "Spotify", "Push to browse your playlists", null, active);
        }
        else if (svc.Status.IsBasicMode(svc.Time.GetUtcNow()))
            frame = SpotifyArt.MessageDial(t, "Spotify", SpotifyText.BasicMode, "The browser is back in a few minutes", active, warn: true);
        else
        {
            var busy = svc.Status.IsBusy(svc.Time.GetUtcNow()) && _m.IsLoadingFirstPage
                ? new FrameNotice(SpotifyText.Busy(svc.Status.BusyUntil!.Value, svc.Time.GetUtcNow()), true) : null;
            frame = Device.IsGalleon
                ? SpotifyArt.BrowserGalleon(t, _m, Lookup, active, flash ?? busy)
                : SpotifyArt.BrowserPlus(t, _m, Lookup, active, flash ?? busy);
        }
        SetFeedback(new Feedback().Pixmap(Layouts.Canvas.Frame, frame));
    }

    // ------------------------------------------------------------------ PI

    protected override PiForm? DescribeForm() => new PiForm()
        .Heading("Playlist Browser")
        .Info("How to use", "Push to open the browser. Turn to scroll, push to open a playlist; turn to a track and push to play it. The first row takes you back.");

    protected override async Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        _b is { } b && await b.HandlePiAsync(type, data) is { Handled: true } r ? r.Reply : null;

    protected override object? DescribeState() => SpotifyBinding.PiState(Svc, GlobalSettings);

    protected override Task OnPropertyInspectorAppearedAsync()
    {
        _b?.PushPiState(force: true);
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        if (Svc is { } svc && _onArt is not null) svc.ArtLoaded -= _onArt;
        _onArt = null;
        _settle?.Dispose();
        _settle = null;
        _openView?.Dispose();
        _openView = null;
        _b?.Dispose();
        _b = null;
        _lookWatch?.Dispose();
        _lookWatch = null;
    }
}
