using System.Net;
using System.Net.Sockets;
using System.Text;

namespace PrismControl.Spotify.Auth;

/// <summary>What the browser brought back to the redirect URI.</summary>
public sealed record CallbackResult(string? Code, string? Error);

/// <summary>
/// The OAuth redirect receiver: a raw <see cref="TcpListener"/> on 127.0.0.1 (no http.sys URL ACL, no firewall prompt;
/// research §2.4). Answers other paths with 404 and a wrong <c>state</c> with 400 and keeps waiting; accepts exactly one
/// valid callback. The reply page is inline HTML (no external resources).
/// </summary>
public sealed class LoopbackReceiver : IDisposable
{
    private readonly TcpListener _listener;
    private volatile bool _disposed;

    private LoopbackReceiver(TcpListener listener, bool usedFallback)
    {
        _listener = listener;
        UsedFallback = usedFallback;
        Port = ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    public int Port { get; }
    /// <summary>The bound address (always 127.0.0.1).</summary>
    internal IPEndPoint Endpoint => (IPEndPoint)_listener.LocalEndpoint;
    /// <summary>True when <c>preferredPort</c> was busy and an ephemeral port was bound (needs the portless redirect URI).</summary>
    public bool UsedFallback { get; }
    public string RedirectUri => $"http://127.0.0.1:{Port}/callback";

    /// <summary>Binds 127.0.0.1:<paramref name="preferredPort"/> (0 = any). If it is busy and <paramref name="allowFallback"/>, binds an ephemeral port.</summary>
    public static LoopbackReceiver Bind(int preferredPort, bool allowFallback = true)
    {
        try { return Start(preferredPort, usedFallback: false); }
        catch (SocketException ex) when (allowFallback && preferredPort != 0 && ex.SocketErrorCode is SocketError.AddressAlreadyInUse or SocketError.AccessDenied)
        {
            return Start(0, usedFallback: true);
        }
    }

    private static LoopbackReceiver Start(int port, bool usedFallback)
    {
        var l = new TcpListener(IPAddress.Loopback, port) { ExclusiveAddressUse = true };
        l.Start();
        return new LoopbackReceiver(l, usedFallback);
    }

    /// <summary>
    /// Waits for <c>GET /callback?code=…&amp;state=…</c>. <paramref name="complete"/> runs while the browser waits
    /// (the token exchange) and returns the text for the reply page.
    /// </summary>
    public async Task<CallbackResult?> WaitAsync(string expectedState, Func<CallbackResult, Task<string>> complete, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(timeout);
        while (!cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(cts.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
            catch (Exception) when (_disposed) { break; }   // closed by a newer Connect (SocketException / ObjectDisposed / not listening)
            using (client)
            {
                NetworkStream ns;
                string? target;
                try
                {
                    ns = client.GetStream();
                    target = await ReadRequestTargetAsync(ns, cts.Token).ConfigureAwait(false);
                }
                catch (Exception) when (!cancellationToken.IsCancellationRequested) { continue; }

                if (target is null || !(target == "/callback" || target.StartsWith("/callback?", StringComparison.Ordinal)))
                {
                    await TryReply(ns, 404, "Not found.").ConfigureAwait(false);     // favicon.ico and friends
                    continue;
                }
                var q = ParseQuery(target);
                if (!q.TryGetValue("state", out var state) || !Pkce.FixedEquals(state, expectedState))
                {
                    await TryReply(ns, 400, "This sign-in link is out of date. Close this tab and click Connect Spotify again.").ConfigureAwait(false);
                    continue;
                }
                if (q.TryGetValue("error", out var error))
                {
                    var result = new CallbackResult(null, error);
                    var text = await SafeComplete(complete, result).ConfigureAwait(false);
                    await TryReply(ns, 200, text).ConfigureAwait(false);
                    return result;
                }
                if (!q.TryGetValue("code", out var code) || code.Length == 0)
                {
                    await TryReply(ns, 400, "Spotify did not send a sign-in code. Close this tab and try again.").ConfigureAwait(false);
                    continue;
                }
                var ok = new CallbackResult(code, null);
                var page = await SafeComplete(complete, ok).ConfigureAwait(false);
                await TryReply(ns, 200, page).ConfigureAwait(false);
                return ok;
            }
        }
        return null;
    }

    private static async Task<string> SafeComplete(Func<CallbackResult, Task<string>> complete, CallbackResult r)
    {
        try { return await complete(r).ConfigureAwait(false); }
        catch (Exception) { return "Spotify sign-in failed. Close this tab and try again."; }
    }

    private static async Task<string?> ReadRequestTargetAsync(NetworkStream ns, CancellationToken ct)
    {
        using var readTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        readTimeout.CancelAfter(TimeSpan.FromSeconds(5));
        var buf = new byte[8192];
        var n = 0;
        while (n < buf.Length)
        {
            var r = await ns.ReadAsync(buf.AsMemory(n), readTimeout.Token).ConfigureAwait(false);
            if (r == 0) break;
            n += r;
            if (buf.AsSpan(0, n).IndexOf("\r\n\r\n"u8) >= 0) break;
        }
        var head = Encoding.ASCII.GetString(buf, 0, n);
        var lineEnd = head.IndexOf("\r\n", StringComparison.Ordinal);
        var first = (lineEnd >= 0 ? head[..lineEnd] : head).Split(' ');
        if (first.Length < 2 || first[0] != "GET") return null;
        return first[1];
    }

    private static async Task TryReply(NetworkStream ns, int status, string text)
    {
        try
        {
            var body = Encoding.UTF8.GetBytes(
                "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Prism Control</title>" +
                "<body style=\"margin:0;padding:48px;font:16px/1.5 Segoe UI,system-ui,sans-serif;background:#0a0c12;color:#f0f0f5\">" +
                "<p style=\"max-width:560px\">" + WebUtility.HtmlEncode(text) + "</p></body></html>");
            var reason = status switch { 200 => "OK", 400 => "Bad Request", _ => "Not Found" };
            var head = Encoding.ASCII.GetBytes($"HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {body.Length}\r\n" +
                "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n");
            await ns.WriteAsync(head).ConfigureAwait(false);
            await ns.WriteAsync(body).ConfigureAwait(false);
        }
        catch (Exception) { }
    }

    internal static Dictionary<string, string> ParseQuery(string target)
    {
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        var i = target.IndexOf('?');
        if (i < 0) return d;
        foreach (var part in target[(i + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=');
            var k = Uri.UnescapeDataString((eq < 0 ? part : part[..eq]).Replace('+', ' '));
            var v = eq < 0 ? "" : Uri.UnescapeDataString(part[(eq + 1)..].Replace('+', ' '));
            d[k] = v;
        }
        return d;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _listener.Stop(); } catch { }
    }
}
