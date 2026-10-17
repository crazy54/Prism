using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using PrismControl.Core.Hosting;

namespace PrismControl.Browser.Hub;

/// <summary>Resolves host names (a seam so tests never touch DNS).</summary>
public interface IHostResolver
{
    Task<IPAddress[]> ResolveAsync(string host, CancellationToken ct);
}

public sealed class DnsHostResolver : IHostResolver
{
    public static readonly DnsHostResolver Instance = new();
    public Task<IPAddress[]> ResolveAsync(string host, CancellationToken ct) => Dns.GetHostAddressesAsync(host, ct);
}

/// <summary>
/// The SSRF guard for plugin-side artwork fetches (research/browser.md §9.4): only addresses on the public internet.
/// Refused: unspecified, loopback, RFC 1918 private, link-local, CGNAT (100.64/10), IETF/benchmark/reserved/multicast/
/// broadcast ranges, IPv6 ULA (fc00::/7), link- and site-local, multicast, discard, and IPv4 embedded in IPv6
/// (mapped, compatible, NAT64, 6to4, Teredo) when the embedded address is refused. The RFC 5737 / 3849 documentation
/// ranges are refused too unless <paramref name="allowDocumentation"/> (tests only: fictional addresses).
/// </summary>
public static class NetGuard
{
    public static bool IsPublic(IPAddress ip, bool allowDocumentation = false)
    {
        if (ip.AddressFamily == AddressFamily.InterNetwork) return IsPublicV4(ip.GetAddressBytes(), allowDocumentation);
        if (ip.AddressFamily != AddressFamily.InterNetworkV6) return false;
        var b = ip.GetAddressBytes();
        if (ip.IsIPv4MappedToIPv6) return IsPublicV4(b[12..], allowDocumentation);
        if (IPAddress.IPv6None.Equals(ip) || IPAddress.IPv6Loopback.Equals(ip)) return false;
        // 64:ff9b::/96 well-known NAT64 prefix: public when the embedded IPv4 is (LOW 14: it sat after the ::/8 check below,
        // which also matches it, so every IPv4-only artwork host was refused on DNS64/NAT64 networks).
        if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B && b[4..12].All(x => x == 0)) return IsPublicV4(b[12..], allowDocumentation);
        // 64:ff9b:1::/48 (RFC 8215, local-use NAT64) and the rest of ::/8 (IPv4-compatible, deprecated)
        if (b[0] == 0) return false;
        if ((b[0] & 0xFE) == 0xFC) return false;                         // fc00::/7 ULA
        if (b[0] == 0xFE && (b[1] & 0xC0) == 0x80) return false;          // fe80::/10 link-local
        if (b[0] == 0xFE && (b[1] & 0xC0) == 0xC0) return false;          // fec0::/10 site-local (deprecated)
        if (b[0] == 0xFF) return false;                                   // multicast
        if (b[0] == 0x01 && b[1] == 0x00 && b[2] == 0 && b[3] == 0 && b[4] == 0 && b[5] == 0 && b[6] == 0 && b[7] == 0) return false;   // 100::/64 discard
        if (b[0] == 0x20 && b[1] == 0x02) return IsPublicV4(b[2..6], allowDocumentation);                                   // 2002::/16 6to4
        if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x00 && b[3] == 0x00) return false;                                       // 2001::/32 Teredo
        if (b[0] == 0x20 && b[1] == 0x01 && (b[2] & 0xFE) == 0x00) return false;                                              // 2001::/23 IETF assignments
        if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) return allowDocumentation;                          // 2001:db8::/32 documentation
        return true;
    }

    private static bool IsPublicV4(byte[] a, bool allowDocumentation)
    {
        if (a.Length != 4) return false;
        return a[0] switch
        {
            0 => false,                                        // 0/8 "this network"
            10 => false,                                       // RFC 1918
            100 when (a[1] & 0xC0) == 64 => false,             // 100.64/10 CGNAT
            127 => false,                                      // loopback
            169 when a[1] == 254 => false,                     // link-local
            172 when (a[1] & 0xF0) == 16 => false,             // RFC 1918
            192 when a[1] == 0 && a[2] == 0 => false,          // 192.0.0/24 IETF
            192 when a[1] == 0 && a[2] == 2 => allowDocumentation,      // TEST-NET-1
            192 when a[1] == 88 && a[2] == 99 => false,        // 6to4 relay anycast
            192 when a[1] == 168 => false,                     // RFC 1918
            198 when (a[1] & 0xFE) == 18 => false,             // 198.18/15 benchmarking
            198 when a[1] == 51 && a[2] == 100 => allowDocumentation,   // TEST-NET-2
            203 when a[1] == 0 && a[2] == 113 => allowDocumentation,    // TEST-NET-3
            >= 224 => false,                                   // multicast, reserved, broadcast
            _ => true,
        };
    }
}

public sealed class ArtFetcherOptions
{
    public int MaxBytes { get; init; } = 2 * 1024 * 1024;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(2);
    public int MaxRedirects { get; init; } = 3;
    public int MaxConcurrent { get; init; } = 2;
    /// <summary>A failed URL is not retried for this long.</summary>
    public TimeSpan NegativeCacheFor { get; init; } = TimeSpan.FromMinutes(5);
    /// <summary>Tests only: let the RFC 5737 / 3849 documentation ranges count as public (fictional fixtures).</summary>
    public bool AllowDocumentationRanges { get; init; }
}

public enum FetchFailure { None, BadUrl, NotHttps, BlockedAddress, ResolveFailed, HttpStatus, NotAnImage, TooLarge, Timeout, TooManyRedirects, Network, Busy, Recent, Proxied }

public sealed record FetchResult(byte[]? Bytes, string? Mime, FetchFailure Failure)
{
    public bool Ok => Bytes is not null;
    public static FetchResult Fail(FetchFailure f) => new(null, null, f);
}

/// <summary>
/// Fetches https artwork for media keys, guarded against SSRF: https only (port 443), every resolved address must be
/// public (checked before the request AND again in the socket connect callback, so a DNS rebind between the two cannot
/// reach a private address), redirects followed manually (≤ 3, each re-checked), no proxy, no cookies, no
/// decompression, image/jpeg or image/png only (content type and magic bytes), ≤ 2 MB, 2 s overall. Failures are
/// remembered for 5 minutes. Thread-safe.
/// </summary>
public sealed class ArtFetcher : IDisposable
{
    private readonly ILog _log;
    private readonly IHostResolver _resolver;
    private readonly ArtFetcherOptions _options;
    private readonly HttpClient _http;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _slots;
    private readonly object _gate = new();
    private readonly Dictionary<string, Task<FetchResult>> _inflight = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _failedAt = new(StringComparer.Ordinal);

    public ArtFetcher(ILog log, IHostResolver? resolver = null, HttpMessageHandler? handler = null, ArtFetcherOptions? options = null, TimeProvider? time = null)
    {
        _log = log;
        _resolver = resolver ?? DnsHostResolver.Instance;
        _options = options ?? new ArtFetcherOptions();
        _time = time ?? TimeProvider.System;
        _slots = new SemaphoreSlim(Math.Max(1, _options.MaxConcurrent));
        // A test handler never talks to the network, so the machine's proxy settings must not change test outcomes.
        ProxyFor = handler is null ? SystemProxyApplies : static _ => false;
        _http = new HttpClient(handler ?? CreateGuardedHandler(), disposeHandler: true) { Timeout = Timeout.InfiniteTimeSpan };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PrismControl/0.1");
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("image/jpeg"));
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("image/png"));
    }

    /// <summary>The image-store id for a fetched URL.</summary>
    public static string IdFor(string url) => "url:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(url)), 0, 8).ToLowerInvariant();

    private SocketsHttpHandler CreateGuardedHandler() => new()
    {
        UseProxy = false,
        UseCookies = false,
        AllowAutoRedirect = false,
        AutomaticDecompression = DecompressionMethods.None,
        MaxResponseHeadersLength = 16,   // KB
        PooledConnectionLifetime = TimeSpan.FromMinutes(1),
        ConnectTimeout = _options.Timeout,
        ConnectCallback = async (ctx, ct) =>
        {
            // Second check at connect time: resolve again and connect ONLY to a vetted address.
            var host = ctx.DnsEndPoint.Host;
            var addresses = IPAddress.TryParse(host.Trim('[', ']'), out var literal) ? [literal] : await _resolver.ResolveAsync(host, ct).ConfigureAwait(false);
            if (addresses.Length == 0 || addresses.Any(a => !NetGuard.IsPublic(a, _options.AllowDocumentationRanges)))
                throw new HttpRequestException("blocked address");
            // LOW 14: try every vetted address in order (the first may be an unreachable IPv6 or a dead host), within the
            // overall timeout. Every one of them passed the guard above.
            Exception? last = null;
            foreach (var address in addresses.Take(8))
            {
                var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try
                {
                    await socket.ConnectAsync(address, ctx.DnsEndPoint.Port, ct).ConfigureAwait(false);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch (SocketException ex)
                {
                    socket.Dispose();
                    last = ex;
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            }
            throw last ?? new HttpRequestException("no address");
        },
    };

    /// <summary>
    /// LOW 14: plugin-side fetches go out directly from this PC (no proxy, our own user agent). When Windows has a proxy
    /// for that URL (corporate proxy, a VPN tool's system proxy), fetching directly would bypass it, and going through it
    /// would defeat the address checks, so such artwork is not fetched (the key shows no art; the extension still
    /// re-encodes blob:/data: art). Tests replace the probe.
    /// </summary>
    public Func<Uri, bool> ProxyFor { get; init; }

    public static bool SystemProxyApplies(Uri uri)
    {
        try
        {
            var proxy = HttpClient.DefaultProxy;
            if (proxy.IsBypassed(uri)) return false;
            var via = proxy.GetProxy(uri);
            return via is not null && via != uri;
        }
        catch (Exception ex) when (ex is PlatformNotSupportedException or InvalidOperationException) { return false; }
    }

    public Task<FetchResult> FetchAsync(string url, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (_failedAt.TryGetValue(url, out var at) && _time.GetElapsedTime(at) < _options.NegativeCacheFor) return Task.FromResult(FetchResult.Fail(FetchFailure.Recent));
            if (_inflight.TryGetValue(url, out var running)) return running;
            var task = RunAsync(url, ct);
            _inflight[url] = task;
            return task;
        }
    }

    private async Task<FetchResult> RunAsync(string url, CancellationToken ct)
    {
        await Task.Yield();
        FetchResult result;
        try
        {
            if (!await _slots.WaitAsync(_options.Timeout, ct).ConfigureAwait(false)) result = FetchResult.Fail(FetchFailure.Busy);
            else
            {
                try
                {
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    cts.CancelAfter(_options.Timeout);
                    try { result = await FetchGuardedAsync(url, cts.Token).ConfigureAwait(false); }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested) { result = FetchResult.Fail(FetchFailure.Timeout); }
                }
                finally { _slots.Release(); }
            }
        }
        catch (OperationCanceledException) { result = FetchResult.Fail(FetchFailure.Timeout); }
        catch (Exception ex)
        {
            _log.Debug("artwork fetch failed: " + ex.GetType().Name);
            result = FetchResult.Fail(FetchFailure.Network);
        }
        lock (_gate)
        {
            _inflight.Remove(url);
            if (!result.Ok && result.Failure != FetchFailure.Busy) _failedAt[url] = _time.GetTimestamp();
            if (_failedAt.Count > 512) _failedAt.Clear();
        }
        if (!result.Ok) _log.Debug($"artwork {IdFor(url)} not fetched: {result.Failure}");
        return result;
    }

    /// <summary>Validates a URL for fetching: absolute https on port 443, a host, no user info.</summary>
    public static FetchFailure CheckUrl(string? url, out Uri? uri)
    {
        uri = null;
        if (url is null || url.Length > Protocol.Wire.Limits.Url || !Uri.TryCreate(url, UriKind.Absolute, out var u)) return FetchFailure.BadUrl;
        if (u.Scheme != Uri.UriSchemeHttps) return FetchFailure.NotHttps;
        if (string.IsNullOrEmpty(u.Host) || u.UserInfo.Length > 0 || u.Port != 443) return FetchFailure.BadUrl;
        uri = u;
        return FetchFailure.None;
    }

    private async Task<FetchResult> FetchGuardedAsync(string url, CancellationToken ct)
    {
        var current = url;
        for (var hop = 0; hop <= _options.MaxRedirects; hop++)
        {
            var check = CheckUrl(current, out var uri);
            if (check != FetchFailure.None) return FetchResult.Fail(check);
            if (ProxyFor(uri!)) return FetchResult.Fail(FetchFailure.Proxied);
            // First check: before any request leaves.
            IPAddress[] addresses;
            if (IPAddress.TryParse(uri!.Host.Trim('[', ']'), out var literal)) addresses = [literal];
            else
            {
                try { addresses = await _resolver.ResolveAsync(uri.IdnHost, ct).ConfigureAwait(false); }
                catch (SocketException) { return FetchResult.Fail(FetchFailure.ResolveFailed); }
            }
            if (addresses.Length == 0) return FetchResult.Fail(FetchFailure.ResolveFailed);
            if (addresses.Any(a => !NetGuard.IsPublic(a, _options.AllowDocumentationRanges))) return FetchResult.Fail(FetchFailure.BlockedAddress);

            using var request = new HttpRequestMessage(HttpMethod.Get, uri) { Version = HttpVersion.Version11, VersionPolicy = HttpVersionPolicy.RequestVersionOrLower };
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
            var status = (int)response.StatusCode;
            if (status is 301 or 302 or 303 or 307 or 308)
            {
                if (response.Headers.Location is not { } loc) return FetchResult.Fail(FetchFailure.HttpStatus);
                current = (loc.IsAbsoluteUri ? loc : new Uri(uri, loc)).ToString();
                continue;
            }
            if (status != 200) return FetchResult.Fail(FetchFailure.HttpStatus);
            var mime = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();
            if (mime is "image/jpg" or "image/pjpeg") mime = "image/jpeg";
            if (mime is not ("image/jpeg" or "image/png")) return FetchResult.Fail(FetchFailure.NotAnImage);
            if (response.Content.Headers.ContentLength is { } len && len > _options.MaxBytes) return FetchResult.Fail(FetchFailure.TooLarge);
            await using var body = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            using var ms = new MemoryStream();
            var buffer = new byte[16 * 1024];
            int n;
            while ((n = await body.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
            {
                ms.Write(buffer, 0, n);
                if (ms.Length > _options.MaxBytes) return FetchResult.Fail(FetchFailure.TooLarge);
            }
            var bytes = ms.ToArray();
            var probed = PrismControl.Core.Render.ImageInfo.Probe(bytes);
            if (probed is null || probed.Mime != mime) return FetchResult.Fail(FetchFailure.NotAnImage);
            return new FetchResult(bytes, mime, FetchFailure.None);
        }
        return FetchResult.Fail(FetchFailure.TooManyRedirects);
    }

    public void Dispose()
    {
        _http.Dispose();
        _slots.Dispose();
    }
}
