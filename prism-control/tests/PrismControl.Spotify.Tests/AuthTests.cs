using System.Net;
using System.Net.Sockets;
using System.Text;
using PrismControl.Spotify.Auth;
using PrismControl.Spotify.Web;
using PrismControl.Testing;

namespace PrismControl.Spotify.Tests;

public class AuthTests
{
    [Test]
    public void Pkce_challenge_matches_the_rfc7636_test_vector()
    {
        // RFC 7636 appendix B.
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
        var v = Pkce.NewVerifier();
        Assert.Equal(86, v.Length);
        Assert.True(v.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'), "verifier must be base64url");
        Assert.NotEqual(Pkce.NewState(), Pkce.NewState());
        Assert.Equal(43, Pkce.Challenge(v).Length);
    }

    [Test]
    public void Authorize_url_carries_exactly_the_research_parameters()
    {
        var url = new Uri(Pkce.AuthorizeUrl(Fx.ClientId, "http://127.0.0.1:43117/callback", "chal", "st8"));
        Assert.Equal("accounts.spotify.com", url.Host);
        Assert.Equal("/authorize", url.AbsolutePath);
        var q = LoopbackReceiver.ParseQuery(url.PathAndQuery);
        Assert.Equal(Fx.ClientId, q["client_id"]);
        Assert.Equal("code", q["response_type"]);
        Assert.Equal("http://127.0.0.1:43117/callback", q["redirect_uri"]);
        Assert.Equal("S256", q["code_challenge_method"]);
        Assert.Equal("chal", q["code_challenge"]);
        Assert.Equal("st8", q["state"]);
        Assert.Equal(Pkce.Scopes, q["scope"]);
        Assert.Equal(7, q["scope"].Split(' ').Length);
        Assert.Contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A43117%2Fcallback", url.OriginalString);
        Assert.DoesNotContain("client_secret", url.OriginalString);
        Assert.Equal("••••cdef", Pkce.Hint(Fx.ClientId));
    }

    internal static async Task<string> BrowserGet(int port, string target)
    {
        using var c = new TcpClient();
        await c.ConnectAsync(IPAddress.Loopback, port);
        using var ns = c.GetStream();
        await ns.WriteAsync(Encoding.ASCII.GetBytes($"GET {target} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"));
        using var sr = new StreamReader(ns);
        return await sr.ReadToEndAsync();
    }

    [Test]
    public async Task Loopback_receiver_answers_favicon_404_and_wrong_state_400_then_accepts_one_code()
    {
        using var rx = LoopbackReceiver.Bind(0, allowFallback: false);
        Assert.Equal($"http://127.0.0.1:{rx.Port}/callback", rx.RedirectUri);
        string? exchanged = null;
        var wait = rx.WaitAsync("good-state", cb => { exchanged = cb.Code; return Task.FromResult("Prism Control is connected. You can close this tab."); },
            TimeSpan.FromSeconds(10), CancellationToken.None);
        Assert.Contains("404", (await BrowserGet(rx.Port, "/favicon.ico")).Split("\r\n")[0]);
        Assert.Contains("400", (await BrowserGet(rx.Port, "/callback?code=AQB-evil&state=other")).Split("\r\n")[0]);
        var ok = await BrowserGet(rx.Port, "/callback?code=AQB-fake-code&state=good-state");
        Assert.Contains("200", ok.Split("\r\n")[0]);
        Assert.Contains("Prism Control is connected. You can close this tab.", ok);
        Assert.Contains("Cache-Control: no-store", ok);
        var result = Assert.NotNull(await wait);
        Assert.Equal("AQB-fake-code", result.Code);
        Assert.Equal("AQB-fake-code", exchanged);
    }

    [Test]
    public async Task Loopback_receiver_reports_a_denied_sign_in()
    {
        using var rx = LoopbackReceiver.Bind(0, allowFallback: false);
        var wait = rx.WaitAsync("s1", _ => Task.FromResult("cancelled"), TimeSpan.FromSeconds(10), CancellationToken.None);
        await BrowserGet(rx.Port, "/callback?error=access_denied&state=s1");
        var r = Assert.NotNull(await wait);
        Assert.Equal("access_denied", r.Error);
        Assert.Null(r.Code);
    }

    [Test]
    public async Task Connect_flow_uses_pkce_exchange_stores_tokens_only_in_the_vault_and_logs_the_client_id_by_last_4()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        Assert.Equal(AuthState.SignedOut, rig.Service.Auth.State);
        var url = rig.Service.BeginConnect(Fx.ClientId);
        Assert.Equal(AuthState.Connecting, rig.Service.Status.Auth);
        var q = LoopbackReceiver.ParseQuery(new Uri(url).PathAndQuery);
        var redirect = new Uri(q["redirect_uri"]);
        Assert.Equal("127.0.0.1", redirect.Host);

        var page = await BrowserGet(redirect.Port, $"/callback?code=AQB-fake-code&state={Uri.EscapeDataString(q["state"])}");
        Assert.Contains("Prism Control is connected. You can close this tab.", page);
        await Assert.NotNull(rig.Service.Auth.PendingConnect);
        Assert.Equal(AuthState.Connected, rig.Service.Auth.State);

        var token = Assert.Single(rig.Http.Seen.Where(r => r.Host == "accounts.spotify.com"));
        Assert.Equal(HttpMethod.Post, token.Method);
        Assert.Null(token.Authorization, "PKCE sends no Authorization header (no client secret)");
        var form = LoopbackReceiver.ParseQuery("?" + token.Body);
        Assert.Equal("authorization_code", form["grant_type"]);
        Assert.Equal("AQB-fake-code", form["code"]);
        Assert.Equal(q["redirect_uri"], form["redirect_uri"]);
        Assert.Equal(Fx.ClientId, form["client_id"]);
        Assert.Equal(q["code_challenge"], Pkce.Challenge(form["code_verifier"]));
        Assert.False(form.ContainsKey("client_secret"));

        // GET /me labels the account.
        await Fx.WaitUntil(() => rig.Service.Status.Account == "Example User", "account label");
        var stored = Assert.NotNull(rig.Vault.Load(SpotifyAuth.TokensSecret));
        Assert.Contains("BQD-fake-access-token-1", stored);
        Assert.Contains("AQC-fake-refresh-token-1", stored);
        Assert.Equal(Fx.ClientId, rig.Vault.Load(SpotifyAuth.ClientSecretName));

        var log = rig.Log.All;
        Assert.DoesNotContain("BQD-fake", log);
        Assert.DoesNotContain("AQC-fake", log);
        Assert.DoesNotContain("AQB-fake-code", log);
        Assert.DoesNotContain(Fx.ClientId, log);
        Assert.Contains("••••cdef", log);
    }

    [Test]
    public async Task Refresh_is_single_flight_and_keeps_a_rotated_refresh_token()
    {
        await using var rig = await Rig.StartAsync(configure: r => r.SeedTokens(expiresAt: r.Time.GetUtcNow().AddMinutes(1)));
        var tokens = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => rig.Service.Auth.GetAccessTokenAsync(CancellationToken.None)));
        Assert.True(tokens.All(t => t == "BQD-fake-access-token-1"), string.Join(",", tokens));
        var refresh = Assert.Single(rig.Http.Seen.Where(r => r.Host == "accounts.spotify.com"));
        var form = LoopbackReceiver.ParseQuery("?" + refresh.Body);
        Assert.Equal("refresh_token", form["grant_type"]);
        Assert.Equal("AQC-fake-refresh-token-0", form["refresh_token"]);
        Assert.Equal(Fx.ClientId, form["client_id"]);
        Assert.Contains("AQC-fake-refresh-token-1", rig.Vault.Load(SpotifyAuth.TokensSecret));

        // A refresh response without refresh_token keeps the stored one.
        rig.Http.On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => FakeHttp.Json(Fx.Token(9, includeRefresh: false)));
        rig.Time.Advance(TimeSpan.FromMinutes(58));
        Assert.Equal("BQD-fake-access-token-9", await rig.Service.Auth.GetAccessTokenAsync(CancellationToken.None));
        Assert.Contains("AQC-fake-refresh-token-1", rig.Vault.Load(SpotifyAuth.TokensSecret));
    }

    [Test]
    public async Task Invalid_grant_needs_reconnect_and_deletes_the_tokens()
    {
        await using var rig = await Rig.StartAsync(configure: r =>
        {
            r.SeedTokens(expiresAt: r.Time.GetUtcNow().AddMinutes(-1));
            r.Http.On(HttpMethod.Post, "accounts.spotify.com/api/token", _ => FakeHttp.Json("{\"error\":\"invalid_grant\",\"error_description\":\"Refresh token expired\"}", HttpStatusCode.BadRequest));
        });
        Assert.Null(await rig.Service.Auth.GetAccessTokenAsync(CancellationToken.None));
        Assert.Equal(AuthState.NeedsReconnect, rig.Service.Status.Auth);
        Assert.Null(rig.Vault.Load(SpotifyAuth.TokensSecret));
        Assert.Equal(Fx.ClientId, rig.Vault.Load(SpotifyAuth.ClientSecretName), "the Client ID stays so Connect is one click");
        Assert.Contains("6 months", rig.Service.Status.AuthMessage);
        Assert.Equal("Reconnect", SpotifyText.StatusLine(rig.Service.Status, rig.Time.GetUtcNow()));
    }

    [Test]
    public async Task A_401_refreshes_once_and_retries_the_call()
    {
        await using var rig = await Rig.StartAsync();
        var calls = 0;
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/player/devices", r =>
            Interlocked.Increment(ref calls) == 1 ? FakeHttp.Error(HttpStatusCode.Unauthorized, "The access token expired") : FakeHttp.Json(Fx.Devices()));
        var devices = await rig.Service.Api.GetDevicesAsync(CancellationToken.None);
        Assert.Equal(2, devices.Count);
        Assert.Equal(2, calls);
        var tries = rig.Http.Seen.Where(r => r.Path == "/v1/me/player/devices").ToList();
        Assert.Equal("Bearer BQD-fake-access-token-0", tries[0].Authorization);
        Assert.Equal("Bearer BQD-fake-access-token-1", tries[1].Authorization);
    }

    [Test]
    public async Task A_second_401_after_refresh_asks_to_reconnect()
    {
        await using var rig = await Rig.StartAsync();
        rig.Http.On(HttpMethod.Get, "api.spotify.com/v1/me/player/devices", _ => FakeHttp.Error(HttpStatusCode.Unauthorized, "Invalid access token"));
        var e = await Assert.ThrowsAsync<SpotifyApiException>(() => rig.Service.Api.GetDevicesAsync(CancellationToken.None));
        Assert.Equal(ApiFailure.Reconnect, e.Kind);
        Assert.Equal(AuthState.NeedsReconnect, rig.Service.Status.Auth);
    }

    [Test]
    public async Task A_busy_redirect_port_falls_back_and_says_the_optional_redirect_uri_is_needed()
    {
        var blocker = new TcpListener(IPAddress.Loopback, 0);
        blocker.Start();
        var busyPort = ((IPEndPoint)blocker.LocalEndpoint).Port;
        try
        {
            await using var rig = await Rig.StartAsync(connected: false, auth: new AuthOptions { Port = busyPort });
            var url = rig.Service.BeginConnect(Fx.ClientId);
            var redirect = new Uri(LoopbackReceiver.ParseQuery(new Uri(url).PathAndQuery)["redirect_uri"]);
            Assert.NotEqual(busyPort, redirect.Port);
            Assert.True(rig.Service.Status.UsedFallbackPort);
            Assert.Contains("http://127.0.0.1/callback", rig.Service.Status.AuthMessage);
            rig.Service.Auth.CancelPendingConnect();
        }
        finally { blocker.Stop(); }
    }

    [Test]
    public async Task Bad_client_ids_are_rejected_before_anything_is_bound()
    {
        await using var rig = await Rig.StartAsync(connected: false);
        Assert.Throws<ArgumentException>(() => rig.Service.BeginConnect("not a client id!"));
        Assert.Equal(AuthState.SignedOut, rig.Service.Auth.State);
    }

    [Test(Category = "integration")]
    public void Dpapi_vault_round_trips_in_a_temp_folder()
    {
        var dir = Path.Combine(Path.GetTempPath(), "prism-spotify-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var vault = new DpapiVault(new Core.Security.SecretStore(dir, "prismcontrol/spotify"));
            vault.Save("tokens", "{\"v\":1,\"access_token\":\"fake\"}");
            var file = Assert.Single(Directory.GetFiles(dir));
            Assert.DoesNotContain("fake", File.ReadAllText(file, Encoding.Latin1), "the file must be encrypted");
            Assert.Equal("{\"v\":1,\"access_token\":\"fake\"}", vault.Load("tokens"));
            vault.Delete("tokens");
            Assert.Null(vault.Load("tokens"));
        }
        finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }
}
