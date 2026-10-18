using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;
using PrismControl.Spotify.Smtc;

namespace PrismControl.Spotify.Actions;

/// <summary>Plugin-wide Spotify preferences (global settings section "spotify"). No secrets here.</summary>
public sealed class SpotifyGlobalSettings
{
    public const string Section = "spotify";
    /// <summary>The key of <see cref="MediaFollow"/> inside the section (the PI field is <c>global:spotify.media.follow</c>).</summary>
    public const string FollowKey = "media.follow";

    /// <summary>
    /// <c>spotifyFirst</c> (default) | <c>spotifyOnly</c> | <c>current</c>: which media session the deck follows. Null or
    /// unknown = not chosen yet, see <see cref="EffectiveFollow"/>.
    /// </summary>
    [JsonPropertyName(FollowKey)]
    public string? MediaFollow { get; set; }

    /// <summary>
    /// Legacy (before 2026-10-18): "follow Windows' current session when Spotify has none". Read only to migrate:
    /// true → <c>current</c>, false → the new default <c>spotifyFirst</c>. Written alongside new choices so an older
    /// build reading the same profile still does something close.
    /// </summary>
    public bool AnyMediaApp { get; set; }

    /// <summary>The mode in force: an explicit <c>media.follow</c>, else the migrated legacy flag.</summary>
    [JsonIgnore]
    public Smtc.MediaFollow EffectiveFollow => MediaFollowModes.Parse(MediaFollow) ?? (AnyMediaApp ? Smtc.MediaFollow.Current : Smtc.MediaFollow.SpotifyFirst);

    /// <summary>The section with <paramref name="mode"/> chosen (and the legacy flag kept in step).</summary>
    public static SpotifyGlobalSettings For(Smtc.MediaFollow mode) => new() { MediaFollow = MediaFollowModes.Wire(mode), AnyMediaApp = mode == Smtc.MediaFollow.Current };
}

/// <summary>Smart Deck's section, read only: its streamer-safe switch (the same view other modules use).</summary>
public sealed class SmartStreamerView
{
    public bool StreamerSafe { get; set; }
}

/// <summary>The browser module's section, read only: "streamer-safe while OBS runs" (on by default, like the browser's).</summary>
public sealed class BrowserStreamerView
{
    public bool AutoStreamerSafe { get; set; } = true;
}

/// <summary>
/// What every Spotify action shares: the <see cref="SpotifyService"/> subscription (events are marshalled onto the
/// action's mailbox with Post), the visible-view registration that drives polling, live PI status, and the PI's
/// Connect/Disconnect messages. Composition, because key actions and dial actions have different base classes.
/// </summary>
public sealed class SpotifyBinding : IDisposable
{
    public const string PiPage = "pi/spotify.html";

    private readonly ActionBase _action;
    private readonly IGlobalSettings _globals;
    private readonly EventHandler? _onChanged;
    private IDisposable? _view;
    private string? _lastPiState;
    private int _queued;

    private SpotifyBinding(ActionBase action, SpotifyService? service, IGlobalSettings globals, SpotifyView view, Action render)
    {
        _action = action;
        _globals = globals;
        Service = service;
        if (service is null) return;
        _view = service.AttachView(view);
        // Coalesce bursts of service events into one mailbox render.
        _onChanged = (_, _) =>
        {
            if (Interlocked.Exchange(ref _queued, 1) == 1) return;
            _action.Post(() =>
            {
                Volatile.Write(ref _queued, 0);
                render();
                PushPiState();
            });
        };
        service.Changed += _onChanged;
    }

    public SpotifyService? Service { get; }

    public static SpotifyBinding Attach(ActionBase action, IServiceRegistry services, IGlobalSettings globals, SpotifyView view, Action render)
    {
        services.TryGet<SpotifyService>(out var service);
        return new SpotifyBinding(action, service, globals, view, render);
    }

    /// <summary>Sends the current status to the PI if it is open and changed.</summary>
    public void PushPiState(bool force = false)
    {
        if (!_action.IsPropertyInspectorVisible) return;
        var state = PiState(Service, _globals);
        var json = JsonSerializer.Serialize(state, ActionJson.Options);
        if (!force && json == _lastPiState) return;
        _lastPiState = json;
        _action.SendToPropertyInspector("pi.state", state);
    }

    /// <param name="Follow">The <c>media.follow</c> mode in force (<c>spotifyFirst</c> | <c>spotifyOnly</c> | <c>current</c>).</param>
    /// <param name="AnyApp">Legacy: true when <paramref name="Follow"/> is <c>current</c>.</param>
    /// <param name="Showing">The app the deck's now playing shows ("Spotify", "Chrome"), or null.</param>
    public sealed record PiStatus(string Status, string? Detail, string? ClientIdHint, bool Connected, bool Connecting, bool AnyApp,
        string RedirectUri, string EqNote, string Attribution, string Follow = MediaFollowModes.SpotifyFirst, string? Showing = null);

    public static PiStatus PiState(SpotifyService? svc, IGlobalSettings globals)
    {
        var follow = globals.GetSection<SpotifyGlobalSettings>(SpotifyGlobalSettings.Section).EffectiveFollow;
        var wire = MediaFollowModes.Wire(follow);
        var anyApp = follow == MediaFollow.Current;
        if (svc is null)
            return new PiStatus("Spotify is unavailable (the module failed to start; see the plugin log)", null, null, false, false, anyApp,
                SpotifyText.RedirectUri, SpotifyText.EqNote, SpotifyText.Attribution, wire);
        var now = svc.Time.GetUtcNow();
        var s = svc.Status;
        var cur = svc.Current;
        var showing = cur.IsOtherApp ? cur.AppName : cur.HasItem || cur.State != PlayState.None ? "Spotify" : null;
        return new PiStatus(SpotifyText.StatusLine(s, now), SpotifyText.Detail(s, now, svc.Auth.DaysUntilReauthorization()) ?? "", s.ClientIdHint,
            s.Auth == AuthState.Connected, s.Auth == AuthState.Connecting, anyApp, SpotifyText.RedirectUri, SpotifyText.EqNote, SpotifyText.Attribution,
            wire, showing);
    }

    /// <summary>
    /// Handles the shared PI messages. Returns (true, reply) when handled. Errors throw with a user-facing message
    /// (the PI shows it). The Client ID arrives in the message only; it is never written to action settings.
    /// </summary>
    public async Task<(bool Handled, object? Reply)> HandlePiAsync(string type, JsonNode? data)
    {
        var svc = Service;
        switch (type)
        {
            case "spotify.status":
                return (true, PiState(svc, _globals));
            case "spotify.connect":
            {
                if (svc is null) throw new InvalidOperationException("Spotify is unavailable.");
                var id = (data?["clientId"] as JsonValue)?.TryGetValue<string>(out var v) == true ? v.Trim() : "";
                if (id.Length == 0) id = svc.Auth.SavedClientId ?? "";
                if (id.Length == 0) throw new InvalidOperationException("Paste your Spotify Client ID first (from developer.spotify.com/dashboard).");
                var url = svc.BeginConnect(id);   // binds 127.0.0.1:43117 before the browser opens
                _action.OpenUrl(url);
                await Task.Yield();
                PushPiState(force: true);
                return (true, PiState(svc, _globals));
            }
            case "spotify.disconnect":
                svc?.Disconnect();
                PushPiState(force: true);
                return (true, PiState(svc, _globals));
            case "spotify.follow":
            {
                var raw = (data?["value"] as JsonValue)?.TryGetValue<string>(out var fv) == true ? fv : null;
                var mode = MediaFollowModes.Parse(raw) ?? throw new InvalidOperationException("Pick Spotify first, Spotify only, or Windows' current app.");
                ApplyFollow(svc, mode);
                return (true, PiState(svc, _globals));
            }
            case "spotify.anyApp":   // an older PI page: on = Windows' current session, off = the default (Spotify first)
            {
                var on = data?["value"] is JsonValue jv && (jv.TryGetValue<bool>(out var b) ? b : jv.TryGetValue<string>(out var s) && s is "true" or "on" or "1");
                ApplyFollow(svc, on ? MediaFollow.Current : MediaFollow.SpotifyFirst);
                return (true, PiState(svc, _globals));
            }
            case "spotify.manageAccess":
                _action.OpenUrl(SpotifyText.ManageAccessUrl);
                return (true, null);
            case "spotify.dashboard":
                _action.OpenUrl(SpotifyText.DashboardUrl);
                return (true, null);
        }
        return (false, null);
    }

    private void ApplyFollow(SpotifyService? svc, MediaFollow mode)
    {
        _globals.SetSection(SpotifyGlobalSettings.Section, SpotifyGlobalSettings.For(mode));
        if (svc is not null) svc.Follow = mode;
    }

    public void Dispose()
    {
        if (Service is { } s && _onChanged is not null) s.Changed -= _onChanged;
        _view?.Dispose();
        _view = null;
    }
}

/// <summary>A short-lived message on a key/dial (command failures, "Playing").</summary>
internal struct Flash
{
    private string? _text;
    private bool _error;
    private long _until;

    public void Set(TimeProvider time, string text, bool error, TimeSpan duration)
    {
        _text = text;
        _error = error;
        _until = time.GetTimestamp() + (long)(duration.TotalSeconds * time.TimestampFrequency);
    }

    public void Clear() => _text = null;

    public Render.FrameNotice? Get(TimeProvider time) =>
        _text is not null && time.GetTimestamp() < _until ? new Render.FrameNotice(_text, _error) : null;
}
