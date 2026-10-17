using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Hosting;
using PrismControl.DataApi;
using PrismControl.Testing;

namespace PrismControl.Tests;

public sealed class DataApiTests : IAsyncDisposable
{
    private readonly DataRegistry _data = new();
    private readonly DataApiServer _server;
    private readonly HttpClient _http = new();

    public DataApiTests()
    {
        _server = new DataApiServer(_data, () => new JsonObject { ["status"] = "ok" }, NullLog.Instance, new DataApiOptions { RequestsPerSecond = 1000 });
        _server.Start();
    }

    private HttpRequestMessage Get(string path, bool token = true)
    {
        var r = new HttpRequestMessage(HttpMethod.Get, _server.BaseUrl + path);
        if (token) r.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _server.Token);
        return r;
    }

    private async Task<(HttpStatusCode Status, JsonNode? Body, HttpResponseMessage Response)> Send(HttpRequestMessage r)
    {
        var resp = await _http.SendAsync(r);
        var text = await resp.Content.ReadAsStringAsync();
        JsonNode? body = null;
        if (resp.Content.Headers.ContentType?.MediaType == "application/json" && text.Length > 0) body = JsonNode.Parse(text);
        return (resp.StatusCode, body, resp);
    }

    [Test]
    public async Task Token_is_256_bits_of_hex()
    {
        Assert.Equal(64, _server.Token.Length);
        Assert.True(_server.Token.All(char.IsAsciiHexDigitLower));
        await Task.CompletedTask;
    }

    [Test]
    public async Task Refuses_missing_or_wrong_token()
    {
        var (s1, b1, r1) = await Send(Get(DataPaths.Health, token: false));
        Assert.Equal(HttpStatusCode.Unauthorized, s1);
        Assert.Equal("unauthorized", b1!["error"]!["code"]!.GetValue<string>());
        Assert.Equal("Bearer", r1.Headers.WwwAuthenticate.Single().Scheme);
        var wrong = Get(DataPaths.Health, token: false);
        wrong.Headers.Authorization = new AuthenticationHeaderValue("Bearer", new string('0', 64));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(wrong)).Status);
    }

    [Test]
    public async Task Refuses_any_origin_header_even_with_the_token()
    {
        var r = Get(DataPaths.Health);
        r.Headers.Add("Origin", "https://evil.example");
        var (s, b, resp) = await Send(r);
        Assert.Equal(HttpStatusCode.Forbidden, s);
        Assert.Equal("origin_refused", b!["error"]!["code"]!.GetValue<string>());
        Assert.False(resp.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Test]
    public async Task Refuses_a_wrong_host_header()
    {
        foreach (var host in new[] { "localhost:" + _server.Port, "evil.example", "127.0.0.1:1" })
        {
            var raw = await RawAsync($"GET /v1/health HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {_server.Token}\r\n\r\n");
            Assert.Contains("421 Misdirected Request", raw, host);
            Assert.Contains("bad_host", raw);
        }
    }

    [Test]
    public async Task Is_read_only()
    {
        var post = new HttpRequestMessage(HttpMethod.Post, _server.BaseUrl + DataPaths.Health) { Content = new StringContent("{}", Encoding.UTF8, "application/json") };
        post.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _server.Token);
        var (s, _, _) = await Send(post);
        Assert.True(s is HttpStatusCode.BadRequest or HttpStatusCode.MethodNotAllowed, s.ToString());
        var del = new HttpRequestMessage(HttpMethod.Delete, _server.BaseUrl + DataPaths.Health);
        del.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _server.Token);
        var (s2, b2, r2) = await Send(del);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, s2);
        Assert.Equal("GET, HEAD", r2.Content.Headers.Allow.Count > 0 ? string.Join(", ", r2.Content.Headers.Allow) : r2.Headers.GetValues("Allow").Single());
        Assert.Equal("method_not_allowed", b2!["error"]!["code"]!.GetValue<string>());
    }

    [Test]
    public async Task Unclaimed_topics_answer_503_and_unknown_paths_404()
    {
        var (s, b, _) = await Send(Get(DataPaths.System));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, s);
        Assert.Equal("unavailable", b!["error"]!["code"]!.GetValue<string>());
        Assert.Equal(1000, b["error"]!["data"]!["retryAfterMs"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.NotFound, (await Send(Get("/v1/nope"))).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(Get(DataPaths.NowPlayingArt))).Status);
    }

    [Test]
    public async Task Published_snapshot_has_the_envelope_and_etag_revalidation()
    {
        var pub = Assert.NotNull(_data.System.Claim("systeminfo", TimeSpan.FromSeconds(1)));
        pub.Publish(new SystemSnapshot { Memory = new MemoryStats { UsedMiB = 1024, TotalMiB = 4096, UsagePct = 25 }, UptimeSec = 10 });
        var (s, b, r) = await Send(Get(DataPaths.System));
        Assert.Equal(HttpStatusCode.OK, s);
        Assert.Equal(1, b!["api"]!.GetValue<int>());
        Assert.Equal("/v1/system", b["path"]!.GetValue<string>());
        Assert.Equal("systeminfo", b["source"]!.GetValue<string>());
        Assert.False(b["demo"]!.GetValue<bool>());
        Assert.Equal(25.0, b["data"]!["memory"]!["usagePct"]!.GetValue<double>());
        Assert.True(b["data"]!.AsObject().ContainsKey("cpu"), "null properties must be present");
        Assert.Equal("no-store", r.Headers.CacheControl!.ToString());
        var etag = r.Headers.ETag!.Tag;
        var again = Get(DataPaths.System);
        again.Headers.TryAddWithoutValidation("If-None-Match", etag);
        Assert.Equal(HttpStatusCode.NotModified, (await Send(again)).Status);
        pub.Publish(new SystemSnapshot { UptimeSec = 11 });
        var changed = Get(DataPaths.System);
        changed.Headers.TryAddWithoutValidation("If-None-Match", etag);
        Assert.Equal(HttpStatusCode.OK, (await Send(changed)).Status);
    }

    [Test]
    public async Task Now_playing_art_is_served_and_inlined_on_request()
    {
        var np = Assert.NotNull(_data.NowPlaying.Claim("spotify", TimeSpan.Zero));
        var art = Assert.NotNull(_data.NowPlayingArt.Claim("spotify"));
        np.Publish(new NowPlayingSnapshot { Source = "spotify", State = "playing", Track = new TrackInfo { Title = "Example Song", Artists = ["The Example Ensemble"] } });
        var png = TinyPng.Gradient(8, 8, (1, 2, 3), (200, 100, 50));
        art.Publish(png, "image/png");
        var (_, b, _) = await Send(Get(DataPaths.NowPlaying));
        Assert.Equal("/v1/now-playing/art", b!["data"]!["art"]!["url"]!.GetValue<string>());
        Assert.Equal(8, b["data"]!["art"]!["width"]!.GetValue<int>());
        Assert.Null(b["data"]!["art"]!["dataUrl"]);
        var (_, inline, _) = await Send(Get(DataPaths.NowPlaying + "?art=dataUrl"));
        Assert.True(inline!["data"]!["art"]!["dataUrl"]!.GetValue<string>().StartsWith("data:image/png;base64,", StringComparison.Ordinal));
        var resp = await _http.SendAsync(Get(DataPaths.NowPlayingArt));
        Assert.Equal("image/png", resp.Content.Headers.ContentType!.MediaType);
        Assert.Equal(png.Length, (await resp.Content.ReadAsByteArrayAsync()).Length);
        var etag = resp.Headers.ETag!.Tag;
        var again = Get(DataPaths.NowPlayingArt);
        again.Headers.TryAddWithoutValidation("If-None-Match", etag);
        Assert.Equal(HttpStatusCode.NotModified, (await _http.SendAsync(again)).StatusCode);
    }

    [Test]
    public async Task Pull_providers_are_cached_and_demand_is_tracked()
    {
        var calls = 0;
        Assert.True(_data.AudioDevices.ClaimPull("audio", _ => { calls++; return ValueTask.FromResult<AudioDevicesSnapshot?>(new AudioDevicesSnapshot()); }, TimeSpan.FromSeconds(10)));
        var demanded = 0;
        _data.AudioDevices.DemandStarted += (_, _) => demanded++;
        Assert.False(_data.AudioDevices.IsDemanded);
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.OK, (await Send(Get(DataPaths.AudioDevices))).Status);
        Assert.Equal(1, calls);
        Assert.Equal(1, demanded);
        Assert.True(_data.AudioDevices.IsDemanded);
    }

    [Test]
    public async Task First_request_waits_briefly_for_a_demand_driven_producer()
    {
        var levels = Assert.NotNull(_data.AudioLevels.Claim("audio", TimeSpan.FromMilliseconds(33)));
        levels.DemandStarted += (_, _) => _ = Task.Run(async () =>
        {
            await Task.Delay(40); // metering spins up
            levels.Publish(new AudioLevelsSnapshot { Output = new LevelInfo { Peak = 0.5, PeakDb = -6 } });
        });
        var (s, b, _) = await Send(Get(DataPaths.AudioLevels));
        Assert.Equal(HttpStatusCode.OK, s);
        Assert.Equal(0.5, b!["data"]!["output"]!["peak"]!.GetValue<double>());
    }

    [Test]
    public async Task Wire_json_is_not_html_escaped_and_timestamps_are_utc_ms()
    {
        var np = Assert.NotNull(_data.NowPlaying.Claim("smtc", TimeSpan.Zero));
        np.Publish(new NowPlayingSnapshot { Track = new TrackInfo { Title = "A+B <C> 'D'" }, PositionAt = new DateTimeOffset(2026, 10, 16, 13, 0, 0, 123, TimeSpan.FromHours(2)) });
        var text = await (await _http.SendAsync(Get(DataPaths.NowPlaying))).Content.ReadAsStringAsync();
        Assert.Contains("\"title\":\"A+B <C> 'D'\"", text);
        Assert.Contains("\"positionAt\":\"2026-10-16T11:00:00.123Z\"", text);
    }

    [Test]
    public async Task Real_providers_replace_demo_claims()
    {
        var demo = Assert.NotNull(_data.Mic.Claim("demo", TimeSpan.Zero, demo: true));
        demo.Publish(new MicSnapshot { Muted = true });
        var real = Assert.NotNull(_data.Mic.Claim("audio", TimeSpan.Zero));
        Assert.Null(_data.Mic.Claim("other", TimeSpan.Zero));
        demo.Publish(new MicSnapshot { Muted = true });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Send(Get(DataPaths.Mic))).Status);
        real.Publish(new MicSnapshot { Muted = false, Name = "Microphone (Example USB)" });
        var (_, b, _) = await Send(Get(DataPaths.Mic));
        Assert.Equal("audio", b!["source"]!.GetValue<string>());
        Assert.False(b["data"]!["muted"]!.GetValue<bool>());
    }

    [Test]
    public async Task Index_lists_endpoints_and_keep_alive_serves_many_requests()
    {
        var raw = await RawAsync(string.Concat(Enumerable.Repeat($"GET /v1 HTTP/1.1\r\nHost: 127.0.0.1:{_server.Port}\r\nAuthorization: Bearer {_server.Token}\r\n\r\n", 3)), expectResponses: 3);
        Assert.Equal(3, raw.Split("HTTP/1.1 200 OK").Length - 1);
        var (_, b, _) = await Send(Get(DataPaths.Index));
        var paths = b!["endpoints"]!.AsArray().Select(e => e!["path"]!.GetValue<string>()).ToList();
        foreach (var p in new[] { DataPaths.Health, DataPaths.System, DataPaths.NowPlaying, DataPaths.NowPlayingArt, DataPaths.AudioLevels, DataPaths.AudioDevices, DataPaths.Mic })
            Assert.True(paths.Contains(p), p);
    }

    [Test]
    public async Task Rate_limit_returns_429()
    {
        await using var limited = new DataApiServer(_data, () => new JsonObject(), NullLog.Instance, new DataApiOptions { RequestsPerSecond = 5 });
        limited.Start();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 30; i++)
        {
            var r = new HttpRequestMessage(HttpMethod.Get, limited.BaseUrl + DataPaths.Health);
            r.Headers.Authorization = new AuthenticationHeaderValue("Bearer", limited.Token);
            codes.Add((await _http.SendAsync(r)).StatusCode);
        }
        Assert.True(codes.Contains(HttpStatusCode.TooManyRequests), string.Join(",", codes.Distinct()));
    }

    [Test]
    public async Task Control_file_is_written_atomically_and_only_its_owner_deletes_it()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pc-control-" + Guid.NewGuid().ToString("N")[..8]);
        var file = Path.Combine(dir, "control.json");
        ControlFile.Write(file, 51234, "aa");
        var o = JsonNode.Parse(File.ReadAllText(file))!;
        Assert.Equal(51234, o["port"]!.GetValue<int>());
        Assert.Equal(Environment.ProcessId, o["pid"]!.GetValue<int>());
        Assert.Equal("http://127.0.0.1:51234", o["baseUrl"]!.GetValue<string>());
        ControlFile.DeleteIfOurs(file, "bb");
        Assert.True(File.Exists(file), "another instance's token must not delete the file");
        ControlFile.DeleteIfOurs(file, "aa");
        Assert.False(File.Exists(file));
        Directory.Delete(dir, true);
        await Task.CompletedTask;
    }

    private async Task<string> RawAsync(string request, int expectResponses = 1)
    {
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(IPAddress.Loopback, _server.Port);
        var s = tcp.GetStream();
        await s.WriteAsync(Encoding.ASCII.GetBytes(request));
        var sb = new StringBuilder();
        var buf = new byte[65536];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            while (true)
            {
                var n = await s.ReadAsync(buf, cts.Token);
                if (n == 0) break;
                sb.Append(Encoding.UTF8.GetString(buf, 0, n));
                if (sb.ToString().Split("HTTP/1.1 ").Length - 1 >= expectResponses && sb.ToString().TrimEnd().EndsWith('}')) break;
            }
        }
        catch (OperationCanceledException) { }
        return sb.ToString();
    }

    public async ValueTask DisposeAsync()
    {
        _http.Dispose();
        await _server.DisposeAsync();
    }
}
