using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using PrismControl.Core.Hosting;
using PrismControl.Spotify.SafeMode;
using PrismControl.Spotify.Web;

namespace PrismControl.Spotify.Auth;

public sealed class AuthOptions
{
    /// <summary>The registered redirect port (http://127.0.0.1:43117/callback).</summary>
    public int Port { get; init; } = 43117;
    /// <summary>Bind an ephemeral port when 43117 is busy (works if the user also registered http://127.0.0.1/callback).</summary>
    public bool AllowFallbackPort { get; init; } = true;
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromMinutes(5);
    /// <summary>Refresh this long before the access token expires.</summary>
    public TimeSpan RefreshMargin { get; init; } = TimeSpan.FromMinutes(5);
    public string TokenEndpoint { get; init; } = Pkce.TokenEndpoint;
}

/// <summary>
/// Spotify sign-in and tokens: the PKCE connect flow over the loopback receiver, the token exchange, single-flight
/// refresh, and DPAPI storage (<see cref="ISecretVault"/>). Tokens never reach settings, the PI or the log; the Client ID
/// is logged and shown by its last 4 characters only. Token saves are serialized and always write the current sign-in,
/// so the vault never ends up older than memory. Only the latest connect attempt may change the state. In safe mode the
/// access token is never refreshed (Spotify rotates refresh tokens, so a refresh would sign the real plugin out).
/// Thread-safe.
/// </summary>
public sealed class SpotifyAuth : IDisposable
{
    public const string TokensSecret = "tokens";
    public const string ClientSecretName = "client";
    /// <summary>Refresh tokens expire 6 months after authorization (Spotify, 2026-06-18).</summary>
    public static readonly TimeSpan AuthorizationLifetime = TimeSpan.FromDays(182);

    private readonly HttpClient _http;
    private readonly ISecretVault _vault;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly AuthOptions _o;
    private readonly object _lock = new();
    private readonly object _saveLock = new();
    private readonly SemaphoreSlim _refreshGate = new(1, 1);
    private readonly SafeModeWrites? _safeMode;
    private StoredTokens? _tokens;
    private long _tokensVersion;      // bumped (under _lock) whenever _tokens changes
    private long _savedVersion;       // the version the vault holds (under _saveLock)
    private string? _clientId;
    private AuthState _state = AuthState.SignedOut;
    private string? _message;
    private bool _usedFallback;
    private ConnectAttempt? _connect;
    private int _attemptCounter;

    /// <summary>One Connect click: its listener (closed before the next attempt binds) and its cancellation.</summary>
    private sealed record ConnectAttempt(int Id, LoopbackReceiver Receiver, CancellationTokenSource Cts);

    public SpotifyAuth(HttpClient http, ISecretVault vault, TimeProvider time, ILog log, AuthOptions? options = null, SafeModeWrites? safeMode = null)
    {
        _http = http;
        _vault = vault;
        _time = time;
        _log = log;
        _o = options ?? new AuthOptions();
        _safeMode = safeMode is { Enabled: true } ? safeMode : null;
    }

    /// <summary>Raised (any thread) when the state, account or message changes.</summary>
    public event EventHandler? Changed;
    /// <summary>Raised after a successful sign-in (the service fetches the account name then).</summary>
    public event EventHandler? Connected;

    public AuthState State { get { lock (_lock) return _state; } }
    public string? Message { get { lock (_lock) return _message; } }
    public bool UsedFallbackPort { get { lock (_lock) return _usedFallback; } }
    public string? ClientIdHint { get { lock (_lock) return _clientId is null ? null : Pkce.Hint(_clientId); } }
    /// <summary>The saved Client ID (used when the PI sends Connect with an empty field). Never logged in full.</summary>
    internal string? SavedClientId { get { lock (_lock) return _clientId; } }
    public string? AccountLabel { get { lock (_lock) return _tokens?.AccountLabel; } }
    public string? UserId { get { lock (_lock) return _tokens?.UserId; } }
    public DateTimeOffset? AuthorizedAt { get { lock (_lock) return _tokens?.AuthorizedAt; } }
    public bool MissingScopes { get { lock (_lock) return _tokens is { } t && Pkce.MissingScopes(t.Scope).Count > 0; } }
    /// <summary>The pending connect attempt (tests await it).</summary>
    public Task? PendingConnect { get; private set; }

    /// <summary>Reads the saved Client ID and tokens.</summary>
    public void Load()
    {
        string? clientId = null, json = null;
        try
        {
            clientId = _vault.Load(ClientSecretName);
            json = _vault.Load(TokensSecret);
        }
        catch (Exception ex) { _log.Warn("Could not read the saved Spotify sign-in", ex); }
        StoredTokens? tokens = null;
        if (json is not null)
        {
            try { tokens = JsonSerializer.Deserialize(json, SpotifyJsonContext.Default.StoredTokens); }
            catch (JsonException) { _log.Warn("The saved Spotify sign-in is unreadable; please reconnect."); }
        }
        lock (_lock)
        {
            _clientId = string.IsNullOrWhiteSpace(clientId) ? tokens?.ClientId : clientId;
            if (tokens is { RefreshToken: not null } && tokens.ClientId is not null)
            {
                _tokens = tokens;
                _state = AuthState.Connected;
            }
            else _state = AuthState.SignedOut;
            _tokensVersion++;
        }
        lock (_saveLock) lock (_lock) _savedVersion = _tokensVersion;   // memory now matches the vault
        if (_state == AuthState.Connected) _log.Info($"Spotify sign-in loaded (client {Pkce.Hint(_clientId)}).");
        Changed?.Invoke(this, EventArgs.Empty);
    }

    // ------------------------------------------------------------------ connect

    /// <summary>
    /// Starts the PKCE flow: binds the loopback receiver first, then returns the authorize URL for the caller to open
    /// (the action uses openUrl). The rest (callback, exchange, save) runs in <see cref="PendingConnect"/>.
    /// </summary>
    public string BeginConnect(string clientId, CancellationToken shutdown = default)
    {
        clientId = clientId.Trim();
        if (!Pkce.LooksLikeClientId(clientId))
            throw new ArgumentException("That doesn't look like a Spotify Client ID (32 letters and digits from the developer dashboard).");

        CancelPending(resetState: false);   // closes the previous attempt's listener now, so this one can bind the registered port
        LoopbackReceiver receiver;
        try { receiver = LoopbackReceiver.Bind(_o.Port, _o.AllowFallbackPort); }
        catch (SocketException)
        {
            SetMessage(AuthState.SignedOut, $"Port {_o.Port} is in use. Close the other app, or add the optional Redirect URI http://127.0.0.1/callback in your Spotify app.");
            throw new InvalidOperationException(Message);
        }

        var verifier = Pkce.NewVerifier();
        var state = Pkce.NewState();
        var redirect = receiver.RedirectUri;
        var url = Pkce.AuthorizeUrl(clientId, redirect, Pkce.Challenge(verifier), state);
        var cts = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
        int id;
        lock (_lock)
        {
            if (_clientId != clientId)
            {
                _clientId = clientId;
                try { _vault.Save(ClientSecretName, clientId); }
                catch (Exception ex) { _log.Warn("Could not save the Spotify Client ID", ex); }
            }
            id = ++_attemptCounter;
            _connect = new ConnectAttempt(id, receiver, cts);
            _usedFallback = receiver.UsedFallback;
            _state = AuthState.Connecting;
            _message = receiver.UsedFallback
                ? $"Waiting for Spotify in your browser (port {_o.Port} was busy, so this needs the optional Redirect URI http://127.0.0.1/callback)."
                : "Waiting for you to approve Prism Control in your browser.";
        }
        _log.Info($"Spotify connect started (client {Pkce.Hint(clientId)}, port {receiver.Port}{(receiver.UsedFallback ? ", fallback" : "")}).");
        Changed?.Invoke(this, EventArgs.Empty);
        PendingConnect = RunConnectAsync(id, receiver, clientId, verifier, state, cts);
        return url;
    }

    /// <summary>The attempt is still waiting for its callback (not cancelled or replaced): it may set messages and tokens. Caller holds _lock.</summary>
    private bool IsCurrentAttempt(int id) => _connect?.Id == id;

    private async Task RunConnectAsync(int id, LoopbackReceiver receiver, string clientId, string verifier, string state, CancellationTokenSource cts)
    {
        var ct = cts.Token;
        try
        {
            var result = await receiver.WaitAsync(state, async cb =>
            {
                if (cb.Error is { } error)
                {
                    SetMessage(AuthState.SignedOut, error == "access_denied" ? "Spotify sign-in was cancelled." : $"Spotify sign-in failed ({error}).", id);
                    return "Spotify sign-in was cancelled. You can close this tab.";
                }
                var failure = await ExchangeAsync(id, clientId, cb.Code!, receiver.RedirectUri, verifier, ct).ConfigureAwait(false);
                return failure is null
                    ? "Prism Control is connected. You can close this tab."
                    : "Spotify sign-in failed: " + failure + " Close this tab and try again.";
            }, _o.ConnectTimeout, ct).ConfigureAwait(false);
            if (result is null && !ct.IsCancellationRequested)
                SetMessage(AuthState.SignedOut, "Sign-in timed out. Click Connect Spotify to try again.", id);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _log.Warn("Spotify connect failed", ex);
            SetMessage(AuthState.SignedOut, "Spotify sign-in failed. Click Connect Spotify to try again.", id);
        }
        finally
        {
            receiver.Dispose();
            var changed = false;
            lock (_lock)
            {
                if (IsCurrentAttempt(id)) _connect = null;
                // Only the latest attempt may reset "Connecting": a superseded one must never reset its successor (#9).
                if (id == _attemptCounter && _state == AuthState.Connecting)
                {
                    _state = _tokens is null ? AuthState.SignedOut : AuthState.Connected;
                    changed = true;
                }
            }
            cts.Dispose();
            if (changed) Changed?.Invoke(this, EventArgs.Empty);
        }
    }

    /// <summary>Exchanges the code. Returns null on success, or a short reason.</summary>
    private async Task<string?> ExchangeAsync(int id, string clientId, string code, string redirectUri, string verifier, CancellationToken ct)
    {
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = clientId,
            ["code_verifier"] = verifier,
        });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        HttpResponseMessage resp;
        try { resp = await _http.PostAsync(_o.TokenEndpoint, form, timeout.Token).ConfigureAwait(false); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            SetMessage(AuthState.SignedOut, "Couldn't reach Spotify to finish signing in. Check the network and try again.", id);
            return "network error.";
        }
        using (resp)
        {
            var body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
            {
                var err = TryParse(body, SpotifyJsonContext.Default.OAuthError);
                var reason = err?.Error ?? ((int)resp.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture);
                _log.Warn($"Spotify token exchange failed: {(int)resp.StatusCode} {err?.Error}");
                SetMessage(AuthState.SignedOut, reason == "invalid_client"
                    ? "Spotify says INVALID_CLIENT: check the Client ID and the Redirect URI in your Spotify app."
                    : $"Spotify sign-in failed ({reason}). Click Connect Spotify to try again.", id);
                return reason + ".";
            }
            var tok = TryParse(body, SpotifyJsonContext.Default.TokenResponse);
            if (tok?.AccessToken is null || tok.RefreshToken is null)
            {
                SetMessage(AuthState.SignedOut, "Spotify sent an unexpected answer. Click Connect Spotify to try again.", id);
                return "unexpected response.";
            }
            var now = _time.GetUtcNow();
            var stored = new StoredTokens
            {
                ClientId = clientId,
                AccessToken = tok.AccessToken,
                ExpiresAt = now.AddSeconds(tok.ExpiresIn > 0 ? tok.ExpiresIn : 3600),
                RefreshToken = tok.RefreshToken,
                Scope = tok.Scope,
                AuthorizedAt = now,
                RedirectUri = redirectUri,
            };
            lock (_lock)
            {
                if (!IsCurrentAttempt(id)) return "this sign-in was replaced by a newer one.";
                _tokens = stored;
                _tokensVersion++;
                _state = AuthState.Connected;
                _message = null;
            }
            SaveTokens();
            var missing = Pkce.MissingScopes(tok.Scope);
            _log.Info($"Spotify connected (client {Pkce.Hint(clientId)}){(missing.Count > 0 ? "; missing scopes: " + string.Join(' ', missing) : "")}.");
            Changed?.Invoke(this, EventArgs.Empty);
            Connected?.Invoke(this, EventArgs.Empty);
            return null;
        }
    }

    /// <summary>Cancels the pending connect attempt and closes its listener at once (the port is free when this returns).</summary>
    public void CancelPendingConnect() => CancelPending(resetState: true);

    private void CancelPending(bool resetState)
    {
        ConnectAttempt? a;
        var changed = false;
        lock (_lock)
        {
            a = _connect;
            _connect = null;
            if (a is not null && resetState && _state == AuthState.Connecting)
            {
                _state = _tokens is null ? AuthState.SignedOut : AuthState.Connected;
                changed = true;
            }
        }
        if (a is null) return;
        try { a.Cts.Cancel(); } catch (ObjectDisposedException) { }
        a.Receiver.Dispose();
        if (changed) Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Deletes the saved sign-in (the Client ID stays, so Connect is one click). Revoke on spotify.com/account/apps.</summary>
    public void Disconnect()
    {
        CancelPendingConnect();
        lock (_lock)
        {
            _tokens = null;
            _tokensVersion++;
            _state = AuthState.SignedOut;
            _message = "Disconnected. To also remove access on Spotify's side, use Manage access on spotify.com.";
        }
        SaveTokens();
        _log.Info("Spotify disconnected.");
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>The sign-in is no longer valid (invalid_grant or a 401 after refresh): drop tokens, ask the user to reconnect.</summary>
    public void MarkNeedsReconnect(string reason)
    {
        lock (_lock)
        {
            if (_state == AuthState.NeedsReconnect && _tokens is null) return;
            _tokens = null;
            _tokensVersion++;
            _state = AuthState.NeedsReconnect;
            _message = "Your Spotify sign-in expired (Spotify requires this every 6 months). Click Connect Spotify again.";
        }
        SaveTokens();
        _log.Warn("Spotify sign-in needs to be renewed: " + reason);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Stores the account's display name and id (from GET /me) next to the tokens.</summary>
    public void SetAccount(string? label, string? userId)
    {
        lock (_lock)
        {
            if (_tokens is null) return;
            if (_tokens.AccountLabel == label && _tokens.UserId == userId) return;
            var updated = Clone(_tokens);
            updated.AccountLabel = label;
            updated.UserId = userId;
            _tokens = updated;
            _tokensVersion++;
        }
        SaveTokens();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    // ------------------------------------------------------------------ tokens

    /// <summary>A valid access token (refreshed when within the margin of expiry), or null when signed out.</summary>
    public async Task<string?> GetAccessTokenAsync(CancellationToken ct)
    {
        StoredTokens? t;
        lock (_lock) t = _state is AuthState.Connected or AuthState.Connecting ? _tokens : null;   // old tokens keep working while re-connecting
        if (t is null) return null;
        if (t.AccessToken is not null && t.ExpiresAt - _time.GetUtcNow() > _o.RefreshMargin) return t.AccessToken;
        return await RefreshAsync(t.AccessToken, ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Single-flight refresh. <paramref name="staleToken"/> is the token that failed or expired: if another caller already
    /// replaced it, that new token is returned without a second refresh (rotation would invalidate it).
    /// </summary>
    public async Task<string?> RefreshAsync(string? staleToken, CancellationToken ct)
    {
        await _refreshGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            StoredTokens? t;
            lock (_lock) t = _tokens;
            if (t is null) return null;
            if (t.AccessToken is not null && t.AccessToken != staleToken && t.ExpiresAt - _time.GetUtcNow() > _o.RefreshMargin) return t.AccessToken;
            if (t.RefreshToken is null || t.ClientId is null)
            {
                MarkNeedsReconnect("no refresh token");
                return null;
            }
            if (_safeMode is { } safe)
            {
                // A refresh rotates the refresh token, which would leave the real saved sign-in invalid. Not in safe mode.
                safe.Suppressed("refresh the access token");
                return null;
            }
            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = t.RefreshToken,
                ["client_id"] = t.ClientId,
            });
            HttpResponseMessage resp;
            string body;
            try
            {
                resp = await _http.PostAsync(_o.TokenEndpoint, form, ct).ConfigureAwait(false);
                try { body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false); }
                catch { resp.Dispose(); throw; }
            }
            catch (Exception ex) when (ex is HttpRequestException or IOException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
            {
                // No network (or a timeout): the sign-in is fine, Spotify is just unreachable right now.
                _log.Debug($"Spotify token refresh failed: {ex.GetType().Name}");
                throw new SpotifyApiException(ApiFailure.Network, 0, null, "Spotify is unreachable.");
            }
            using var response = resp;
            if (!resp.IsSuccessStatusCode)
            {
                var err = TryParse(body, SpotifyJsonContext.Default.OAuthError);
                if (resp.StatusCode == HttpStatusCode.BadRequest && err?.Error is "invalid_grant" or "invalid_client")
                {
                    MarkNeedsReconnect(err.Error!);
                    return null;
                }
                _log.Warn($"Spotify token refresh failed: {(int)resp.StatusCode} {err?.Error}");
                throw new SpotifyApiException(ApiFailure.Server, (int)resp.StatusCode, err?.Error, "Couldn't refresh the Spotify sign-in.");
            }
            var tok = TryParse(body, SpotifyJsonContext.Default.TokenResponse);
            if (tok?.AccessToken is null) throw new SpotifyApiException(ApiFailure.Server, (int)resp.StatusCode, null, "Spotify sent an unexpected token response.");
            StoredTokens updated;
            lock (_lock)
            {
                // Merge into the current sign-in (an account label may have been set meanwhile), not the copy read above.
                var cur = _tokens;
                if (cur is null) return null;                                                                   // disconnected meanwhile
                if (cur.RefreshToken != t.RefreshToken || cur.ClientId != t.ClientId) return cur.AccessToken;   // reconnected meanwhile
                updated = Clone(cur);
                updated.AccessToken = tok.AccessToken;
                updated.ExpiresAt = _time.GetUtcNow().AddSeconds(tok.ExpiresIn > 0 ? tok.ExpiresIn : 3600);
                if (!string.IsNullOrEmpty(tok.RefreshToken)) updated.RefreshToken = tok.RefreshToken;   // rotation: replace atomically
                if (!string.IsNullOrEmpty(tok.Scope)) updated.Scope = tok.Scope;
                _tokens = updated;
                _tokensVersion++;
            }
            SaveTokens();
            _log.Debug("Spotify access token refreshed.");
            return updated.AccessToken;
        }
        finally { _refreshGate.Release(); }
    }

    /// <summary>Days until the 6-month authorization runs out (null when not connected).</summary>
    public int? DaysUntilReauthorization()
    {
        var at = AuthorizedAt;
        if (at is null) return null;
        return (int)Math.Ceiling((at.Value + AuthorizationLifetime - _time.GetUtcNow()).TotalDays);
    }

    /// <summary>
    /// Writes the current sign-in to the vault (or deletes it when there is none). Serialized, and it always writes what
    /// memory holds at that moment, so racing saves (refresh, account label, connect, disconnect) cannot leave an older
    /// sign-in on disk, e.g. a rotated-away refresh token.
    /// </summary>
    private void SaveTokens()
    {
        lock (_saveLock)
        {
            StoredTokens? t;
            long version;
            lock (_lock) { t = _tokens; version = _tokensVersion; }
            if (version == _savedVersion) return;
            try
            {
                if (t is null) _vault.Delete(TokensSecret);
                else _vault.Save(TokensSecret, JsonSerializer.Serialize(t, SpotifyJsonContext.Default.StoredTokens));
                _savedVersion = version;
            }
            catch (Exception ex) { _log.Warn(t is null ? "Could not delete the saved Spotify sign-in" : "Could not save the Spotify sign-in", ex); }
        }
    }

    /// <summary>Sets the state and message. With <paramref name="attempt"/>, only while that connect attempt is still the latest.</summary>
    private void SetMessage(AuthState state, string message, int? attempt = null)
    {
        lock (_lock)
        {
            if (attempt is { } id && !IsCurrentAttempt(id)) return;
            _state = _tokens is not null && state == AuthState.SignedOut ? AuthState.Connected : state;
            _message = message;
        }
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private static StoredTokens Clone(StoredTokens t) => new()
    {
        V = t.V, ClientId = t.ClientId, AccessToken = t.AccessToken, ExpiresAt = t.ExpiresAt, RefreshToken = t.RefreshToken,
        Scope = t.Scope, AuthorizedAt = t.AuthorizedAt, AccountLabel = t.AccountLabel, UserId = t.UserId, RedirectUri = t.RedirectUri,
    };

    private static T? TryParse<T>(string json, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> info) where T : class
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize(json, info); }
        catch (JsonException) { return null; }
    }

    public void Dispose()
    {
        CancelPendingConnect();
        _refreshGate.Dispose();
    }
}
