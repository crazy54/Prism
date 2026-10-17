using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;

namespace PrismControl.Spotify.Actions;

/// <summary>Plugin-wide Spotify preferences (global settings section "spotify"). No secrets here.</summary>
public sealed class SpotifyGlobalSettings
{
    public const string Section = "spotify";
    /// <summary>Follow Windows' current media session (any app) when Spotify has none.</summary>
    public bool AnyMediaApp { get; set; }
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

    public sealed record PiStatus(string Status, string? Detail, string? ClientIdHint, bool Connected, bool Connecting, bool AnyApp,
        string RedirectUri, string EqNote, string Attribution);

    public static PiStatus PiState(SpotifyService? svc, IGlobalSettings globals)
    {
        var anyApp = globals.GetSection<SpotifyGlobalSettings>(SpotifyGlobalSettings.Section).AnyMediaApp;
        if (svc is null)
            return new PiStatus("Spotify is unavailable (the module failed to start; see the plugin log)", null, null, false, false, anyApp,
                SpotifyText.RedirectUri, SpotifyText.EqNote, SpotifyText.Attribution);
        var now = svc.Time.GetUtcNow();
        var s = svc.Status;
        return new PiStatus(SpotifyText.StatusLine(s, now), SpotifyText.Detail(s, now, svc.Auth.DaysUntilReauthorization()) ?? "", s.ClientIdHint,
            s.Auth == AuthState.Connected, s.Auth == AuthState.Connecting, anyApp, SpotifyText.RedirectUri, SpotifyText.EqNote, SpotifyText.Attribution);
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
            case "spotify.anyApp":
            {
                var on = data?["value"] is JsonValue jv && (jv.TryGetValue<bool>(out var b) ? b : jv.TryGetValue<string>(out var s) && s is "true" or "on" or "1");
                _globals.SetSection(SpotifyGlobalSettings.Section, new SpotifyGlobalSettings { AnyMediaApp = on });
                if (svc is not null) svc.FollowAnyApp = on;
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
