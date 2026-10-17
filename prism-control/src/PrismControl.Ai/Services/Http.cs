using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;

namespace PrismControl.Ai.Services;

/// <summary>One GET. <see cref="Headers"/> may carry an admin key: implementations never log them.</summary>
public sealed record HttpFetchRequest(Uri Url, string? ETag = null, string? LastModified = null,
    IReadOnlyDictionary<string, string>? Headers = null, int MaxBytes = 4 << 20);

/// <summary>The answer: status (0 on a network failure), the body (empty on 304), the validators and Retry-After.</summary>
public sealed record HttpFetchResult(int Status, byte[] Body, string? ETag, string? LastModified, TimeSpan? RetryAfter, string? ContentType)
{
    public bool NotModified => Status == 304;
    public bool Ok => Status is >= 200 and < 300;
    public bool NetworkError => Status == 0;
    public static HttpFetchResult Failed { get; } = new(0, [], null, null, null, null);
}

/// <summary>The only way AI2 talks HTTP. Tests use a recorded-fixture fake; production uses <see cref="HttpClientFetcher"/>.</summary>
public interface IHttpFetcher
{
    Task<HttpFetchResult> GetAsync(HttpFetchRequest request, CancellationToken ct);
}

/// <summary>
/// One shared fetcher for the whole module (status pages and admin APIs): User-Agent <c>PrismControl/&lt;ver&gt; (status widget)</c>,
/// gzip/brotli, conditional GETs, a size cap, and ONE 20 s deadline that covers the whole exchange (connect, headers AND the body
/// read: <see cref="HttpClient.Timeout"/> alone stops at the headers with <see cref="HttpCompletionOption.ResponseHeadersRead"/>, so
/// a server that stalls mid-body would otherwise hang the caller forever).
/// <para>Requests that carry headers (admin keys: <c>x-api-key</c>, <c>Authorization</c>) go through a second client that never
/// follows redirects: a key must never be replayed to another host. A 3xx then is simply a failed answer. Status pages (no
/// headers) may follow up to 3 redirects.</para>
/// Never throws for network failures or timeouts (status 0); never logs URLs with keys, headers or bodies.
/// </summary>
public sealed class HttpClientFetcher : IHttpFetcher, IDisposable
{
    public static readonly string UserAgent = $"PrismControl/{Version()} (status widget)";
    /// <summary>The whole exchange, body included.</summary>
    public static readonly TimeSpan Deadline = TimeSpan.FromSeconds(20);
    private readonly HttpClient _client;
    private readonly HttpClient _noRedirect;
    private readonly TimeProvider _time;
    private readonly TimeSpan _deadline;

    public HttpClientFetcher() : this(null, null, null) { }

    /// <summary>Tests: inject handlers (the first follows redirects, the second must not), a clock and a deadline.</summary>
    internal HttpClientFetcher(HttpMessageHandler? redirecting, HttpMessageHandler? nonRedirecting, TimeProvider? time, TimeSpan? deadline = null)
    {
        _time = time ?? TimeProvider.System;
        _deadline = deadline ?? Deadline;
        _client = Configure(new HttpClient(redirecting ?? Handler(allowRedirects: true)));
        _noRedirect = Configure(new HttpClient(nonRedirecting ?? Handler(allowRedirects: false)));
    }

    /// <summary>The production handler. Admin requests use <paramref name="allowRedirects"/> = false.</summary>
    internal static SocketsHttpHandler Handler(bool allowRedirects) => new()
    {
        AutomaticDecompression = DecompressionMethods.All,
        PooledConnectionLifetime = TimeSpan.FromMinutes(10),
        ConnectTimeout = TimeSpan.FromSeconds(10),
        AllowAutoRedirect = allowRedirects,
        MaxAutomaticRedirections = 3,
        UseCookies = false,
    };

    private static HttpClient Configure(HttpClient c)
    {
        // Our own deadline (below) covers the body too; this is only a backstop for the headers.
        c.Timeout = Deadline + TimeSpan.FromSeconds(5);
        c.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        c.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return c;
    }

    /// <summary>True when the request carries headers (an admin key): it never follows a redirect.</summary>
    public static bool IsKeyed(HttpFetchRequest request) => request.Headers is { Count: > 0 };

    public async Task<HttpFetchResult> GetAsync(HttpFetchRequest request, CancellationToken ct)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Get, request.Url);
        if (!string.IsNullOrEmpty(request.ETag)) msg.Headers.TryAddWithoutValidation("If-None-Match", request.ETag);
        if (!string.IsNullOrEmpty(request.LastModified)) msg.Headers.TryAddWithoutValidation("If-Modified-Since", request.LastModified);
        if (request.Headers is not null)
            foreach (var (k, v) in request.Headers) msg.Headers.TryAddWithoutValidation(k, v);
        var client = IsKeyed(request) ? _noRedirect : _client;
        // One deadline for send + body (linked to the caller's token).
        using var deadline = new CancellationTokenSource(_deadline, _time);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, deadline.Token);
        try
        {
            using var resp = await client.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false);
            var etag = resp.Headers.ETag?.ToString();
            var lastModified = resp.Content.Headers.LastModified?.ToString("R");
            var retryAfter = resp.Headers.RetryAfter is { } ra ? ra.Delta ?? (ra.Date is { } d ? d - DateTimeOffset.UtcNow : null) : null;
            var contentType = resp.Content.Headers.ContentType?.ToString();
            if (resp.StatusCode == HttpStatusCode.NotModified) return new(304, [], etag, lastModified, retryAfter, contentType);
            var body = await ReadCappedAsync(resp.Content, request.MaxBytes, linked.Token).ConfigureAwait(false);
            return new((int)resp.StatusCode, body ?? [], etag, lastModified, retryAfter, contentType);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or IOException && !ct.IsCancellationRequested)
        {
            return HttpFetchResult.Failed;
        }
    }

    private static async Task<byte[]?> ReadCappedAsync(HttpContent content, int max, CancellationToken ct)
    {
        await using var s = await content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        using var ms = new MemoryStream();
        var buf = new byte[16384];
        int n;
        while ((n = await s.ReadAsync(buf, ct).ConfigureAwait(false)) > 0)
        {
            if (ms.Length + n > max) return null;   // over the cap: treated as a bad answer, never parsed
            ms.Write(buf, 0, n);
        }
        return ms.ToArray();
    }

    private static string Version()
    {
        var v = typeof(HttpClientFetcher).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.1.0";
        var plus = v.IndexOf('+');
        return plus > 0 ? v[..plus] : v;
    }

    public void Dispose()
    {
        _client.Dispose();
        _noRedirect.Dispose();
    }
}

/// <summary>Decodes a response body: BOM first (the AWS feed is UTF-16 big-endian with a BOM), then the charset, else UTF-8.</summary>
public static class HttpText
{
    public static string Decode(ReadOnlySpan<byte> body, string? contentType = null)
    {
        if (body.Length >= 2 && body[0] == 0xFE && body[1] == 0xFF) return Encoding.BigEndianUnicode.GetString(body[2..]);
        if (body.Length >= 2 && body[0] == 0xFF && body[1] == 0xFE) return Encoding.Unicode.GetString(body[2..]);
        if (body.Length >= 3 && body[0] == 0xEF && body[1] == 0xBB && body[2] == 0xBF) return Encoding.UTF8.GetString(body[3..]);
        var charset = contentType?.Split(';').Select(p => p.Trim()).FirstOrDefault(p => p.StartsWith("charset=", StringComparison.OrdinalIgnoreCase))?[8..].Trim('"');
        if (charset is not null && charset.StartsWith("utf-16", StringComparison.OrdinalIgnoreCase))
        {
            // No BOM: guess the byte order from the first character (JSON starts with ASCII).
            var be = body.Length >= 2 && body[0] == 0 && body[1] != 0;
            return (be ? Encoding.BigEndianUnicode : Encoding.Unicode).GetString(body);
        }
        return Encoding.UTF8.GetString(body);
    }
}
