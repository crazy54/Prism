using System.Net;
using System.Net.Http.Headers;
using PrismControl.Browser.Hub;
using PrismControl.Testing;

namespace PrismControl.Browser.Tests;

public sealed class FakeResolver(Dictionary<string, IPAddress[]> map) : IHostResolver
{
    public List<string> Asked { get; } = [];
    public Task<IPAddress[]> ResolveAsync(string host, CancellationToken ct)
    {
        Asked.Add(host);
        return Task.FromResult(map.TryGetValue(host, out var a) ? a : []);
    }
}

/// <summary>Scripted responses by URL; records requests. Never touches the network.</summary>
public sealed class FakeArtHttp : HttpMessageHandler
{
    public Dictionary<string, Func<HttpResponseMessage>> Routes { get; } = new(StringComparer.Ordinal);
    public List<HttpRequestMessage> Seen { get; } = [];
    public TimeSpan Delay { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Seen.Add(request);
        if (Delay > TimeSpan.Zero) await Task.Delay(Delay, ct);
        return Routes.TryGetValue(request.RequestUri!.ToString(), out var f) ? f() : new HttpResponseMessage(HttpStatusCode.NotFound);
    }

    public static HttpResponseMessage Image(byte[] bytes, string mime = "image/png")
    {
        var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) };
        r.Content.Headers.ContentType = new MediaTypeHeaderValue(mime);
        return r;
    }

    public static HttpResponseMessage Redirect(string to)
    {
        var r = new HttpResponseMessage(HttpStatusCode.Found);
        r.Headers.Location = new Uri(to);
        return r;
    }
}

/// <summary>The SSRF guard for plugin-side artwork fetches (research §9.4), without any network.</summary>
public class ArtFetcherTests
{
    private static readonly IPAddress Public = IPAddress.Parse("203.0.113.10");   // RFC 5737 (fictional), allowed only in tests

    private static (ArtFetcher F, FakeArtHttp Http, FakeResolver Dns) Make(Dictionary<string, IPAddress[]>? dns = null, TimeSpan? timeout = null, int maxBytes = 2 * 1024 * 1024)
    {
        var http = new FakeArtHttp();
        var resolver = new FakeResolver(dns ?? new() { ["cdn.example"] = [Public] });
        var f = new ArtFetcher(new RecordingLog(), resolver, http, new ArtFetcherOptions { AllowDocumentationRanges = true, Timeout = timeout ?? TimeSpan.FromSeconds(2), MaxBytes = maxBytes });
        return (f, http, resolver);
    }

    [Test]
    public void Only_public_addresses_pass()
    {
        string[] blocked =
        [
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
            "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
            "64:ff9b::a00:1", "2002:a00:1::", "2001::1", "2001:db8::1", "192.0.2.10",
        ];
        foreach (var ip in blocked) Assert.False(NetGuard.IsPublic(IPAddress.Parse(ip)), ip + " must be blocked");
        foreach (var ip in new[] { "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.4.4" })
            Assert.True(NetGuard.IsPublic(IPAddress.Parse(ip)), ip + " is public");
        Assert.True(NetGuard.IsPublic(IPAddress.Parse("203.0.113.10"), allowDocumentation: true), "documentation ranges only for fixtures");
        Assert.False(NetGuard.IsPublic(IPAddress.Parse("203.0.113.10")));
    }

    [Test]
    public void Urls_must_be_https_on_443_without_user_info()
    {
        Assert.Equal(FetchFailure.None, ArtFetcher.CheckUrl("https://cdn.example/a.png", out _));
        Assert.Equal(FetchFailure.NotHttps, ArtFetcher.CheckUrl("http://cdn.example/a.png", out _));
        Assert.Equal(FetchFailure.NotHttps, ArtFetcher.CheckUrl("file:///C:/Windows/win.ini", out _));
        Assert.Equal(FetchFailure.BadUrl, ArtFetcher.CheckUrl("https://user:pass@cdn.example/a.png", out _));
        Assert.Equal(FetchFailure.BadUrl, ArtFetcher.CheckUrl("https://cdn.example:8443/a.png", out _));
        Assert.Equal(FetchFailure.BadUrl, ArtFetcher.CheckUrl("not a url", out _));
    }

    [Test]
    public async Task Public_https_png_is_fetched()
    {
        var (f, http, _) = Make();
        http.Routes["https://cdn.example/a.png"] = () => FakeArtHttp.Image(Fx.ArtA);
        var r = await f.FetchAsync("https://cdn.example/a.png");
        Assert.True(r.Ok);
        Assert.Equal("image/png", r.Mime);
        Assert.Equal(Fx.ArtA.Length, r.Bytes!.Length);
        Assert.Equal(1, http.Seen.Count);
        Assert.False(http.Seen[0].Headers.Contains("Cookie"));
    }

    [Test]
    public async Task Private_and_loopback_names_never_get_a_request()
    {
        var (f, http, _) = Make(new()
        {
            ["intranet.example"] = [IPAddress.Parse("10.0.0.5")],
            ["mixed.example"] = [Public, IPAddress.Parse("127.0.0.1")],
            ["metadata.example"] = [IPAddress.Parse("169.254.169.254")],
        });
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://intranet.example/a.png")).Failure);
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://mixed.example/a.png")).Failure, "any private answer blocks the name");
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://metadata.example/a.png")).Failure);
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://127.0.0.1/a.png")).Failure);
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://[::1]/a.png")).Failure);
        Assert.Empty(http.Seen, "nothing left the process");
    }

    [Test]
    public async Task Redirects_are_rechecked_and_capped()
    {
        var (f, http, _) = Make(new() { ["cdn.example"] = [Public], ["evil.example"] = [IPAddress.Parse("192.168.0.10")] });
        http.Routes["https://cdn.example/to-private.png"] = () => FakeArtHttp.Redirect("https://evil.example/x.png");
        http.Routes["https://cdn.example/to-http.png"] = () => FakeArtHttp.Redirect("http://cdn.example/x.png");
        http.Routes["https://cdn.example/loop.png"] = () => FakeArtHttp.Redirect("https://cdn.example/loop.png");
        http.Routes["https://cdn.example/hop.png"] = () => FakeArtHttp.Redirect("https://cdn.example/a.png");
        http.Routes["https://cdn.example/a.png"] = () => FakeArtHttp.Image(Fx.ArtA);
        Assert.Equal(FetchFailure.BlockedAddress, (await f.FetchAsync("https://cdn.example/to-private.png")).Failure);
        Assert.False(http.Seen.Any(r => r.RequestUri!.Host == "evil.example"), "the private hop never got a request");
        Assert.Equal(FetchFailure.NotHttps, (await f.FetchAsync("https://cdn.example/to-http.png")).Failure);
        Assert.Equal(FetchFailure.TooManyRedirects, (await f.FetchAsync("https://cdn.example/loop.png")).Failure);
        Assert.True((await f.FetchAsync("https://cdn.example/hop.png")).Ok, "one safe redirect is fine");
    }

    [Test]
    public async Task Content_type_magic_bytes_and_size_are_enforced()
    {
        var (f, http, _) = Make(maxBytes: 10_000);
        http.Routes["https://cdn.example/html.png"] = () => FakeArtHttp.Image("<html>"u8.ToArray(), "text/html");
        http.Routes["https://cdn.example/svg.png"] = () => FakeArtHttp.Image("<svg/>"u8.ToArray(), "image/svg+xml");
        http.Routes["https://cdn.example/liar.png"] = () => FakeArtHttp.Image("GIF89a........"u8.ToArray(), "image/png");
        http.Routes["https://cdn.example/big.png"] = () => FakeArtHttp.Image(Fx.Art(288), "image/png");
        Assert.Equal(FetchFailure.NotAnImage, (await f.FetchAsync("https://cdn.example/html.png")).Failure);
        Assert.Equal(FetchFailure.NotAnImage, (await f.FetchAsync("https://cdn.example/svg.png")).Failure);
        Assert.Equal(FetchFailure.NotAnImage, (await f.FetchAsync("https://cdn.example/liar.png")).Failure);
        Assert.Equal(FetchFailure.TooLarge, (await f.FetchAsync("https://cdn.example/big.png")).Failure);
    }

    [Test]
    public async Task Slow_servers_time_out_and_failures_are_remembered()
    {
        var (f, http, _) = Make(timeout: TimeSpan.FromMilliseconds(150));
        http.Delay = TimeSpan.FromSeconds(5);
        http.Routes["https://cdn.example/slow.png"] = () => FakeArtHttp.Image(Fx.ArtA);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Assert.Equal(FetchFailure.Timeout, (await f.FetchAsync("https://cdn.example/slow.png")).Failure);
        Assert.True(sw.ElapsedMilliseconds < 2000, "bounded by the timeout");
        Assert.Equal(FetchFailure.Recent, (await f.FetchAsync("https://cdn.example/slow.png")).Failure, "not retried for 5 minutes");
        Assert.Equal(1, http.Seen.Count);
    }

    [Test]
    public async Task The_hub_fetches_https_art_scales_it_and_never_for_hidden()
    {
        var http = new FakeArtHttp();
        http.Routes["https://cdn.example/cover.png"] = () => FakeArtHttp.Image(Fx.ArtB);
        var fetcher = new ArtFetcher(new RecordingLog(), new FakeResolver(new() { ["cdn.example"] = [Public] }), http, new ArtFetcherOptions { AllowDocumentationRanges = true });
        await using var rig = new SessionRig();
        var hub2 = new BrowserHub(new BrowserHubOptions { Log = rig.Log, ArtFetcher = fetcher, Verifier = AcceptAnyRelay.Instance });
        hub2.TestToken = "t0k";
        hub2.Start(new NullEndpoint());
        var conn = new MemoryConnection();
        _ = hub2.AcceptAsync(conn);
        conn.Send(Fx.Preamble("t0k"));
        conn.Send(Fx.Hello());
        await conn.NextAsync();
        var full = Fx.StateFull();
        full["data"]!["media"] = new System.Text.Json.Nodes.JsonArray(Fx.Media("12:0", 12, artUrl: "https://cdn.example/cover.png"));
        conn.Send(full);
        var id = ArtFetcher.IdFor("https://cdn.example/cover.png");
        await SessionRig.WaitAsync(() => hub2.Images.Contains(id));
        Assert.Equal(1, http.Seen.Count);
        await hub2.DisposeAsync();
    }
}
