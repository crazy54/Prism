using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace PrismControl.Eq.Tests.Fakes;

public sealed record FakeRequest(string Method, string Path, string Query, string Body, TimeSpan At)
{
    public string Target => Query.Length > 0 ? Path + "?" + Query : Path;
    public override string ToString() => $"{Method} {Target}";
}

/// <param name="Delay">Wait this long (real time) before answering: a hung server, for client timeouts.</param>
public sealed record FakeResponse(int Status, string Body, string ContentType = "application/json", TimeSpan Delay = default)
{
    public static FakeResponse Json(string json) => new(200, json);
    public static FakeResponse NotFound() => new(404, "{\"error\":\"not found\"}");
}

/// <summary>
/// A tiny HTTP/1.1 server on 127.0.0.1:0 (raw TcpListener, so no http.sys URL ACLs), optionally over TLS with a
/// self-signed certificate. Keep-alive, Content-Length bodies only. Records every request. Test-only.
/// </summary>
public sealed class FakeHttpServer : IAsyncDisposable
{
    private readonly TcpListener _listener;
    private readonly Func<FakeRequest, FakeResponse> _handler;
    private readonly X509Certificate2? _cert;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<FakeRequest> _log = [];
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly Task _accept;

    public FakeHttpServer(Func<FakeRequest, FakeResponse> handler, X509Certificate2? tlsCertificate = null, int port = 0)
    {
        _handler = handler;
        _cert = tlsCertificate;
        _listener = new TcpListener(IPAddress.Loopback, port);
        _listener.Start();
        _accept = AcceptLoopAsync();
    }

    public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;
    public string Authority => "127.0.0.1:" + Port;
    public IReadOnlyList<FakeRequest> Requests { get { lock (_log) return [.. _log]; } }
    public void ClearLog() { lock (_log) _log.Clear(); }

    /// <summary>A self-signed server certificate (ECDSA P-256) with SAN IP 127.0.0.1 and DNS localhost. Not added to any store.</summary>
    public static X509Certificate2 CreateCertificate(string subject)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest(subject, key, HashAlgorithmName.SHA256);
        var san = new SubjectAlternativeNameBuilder();
        san.AddIpAddress(IPAddress.Loopback);
        san.AddDnsName("localhost");
        req.CertificateExtensions.Add(san.Build());
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.1")], false));
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        // SChannel needs a key it can reach: round-trip through PKCS#12 (the temporary key is removed on Dispose).
        return X509CertificateLoader.LoadPkcs12(cert.Export(X509ContentType.Pkcs12), null);
    }

    private async Task AcceptLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_cts.Token); }
            catch { return; }
            _ = Task.Run(() => ServeAsync(client));
        }
    }

    private async Task ServeAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                Stream stream = client.GetStream();
                if (_cert is not null)
                {
                    var ssl = new SslStream(stream, false);
                    await ssl.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = _cert }, _cts.Token);
                    stream = ssl;
                }
                await using (stream)
                {
                    var buffer = new byte[64 * 1024];
                    var pending = new MemoryStream();
                    while (!_cts.IsCancellationRequested)
                    {
                        var req = await ReadRequestAsync(stream, buffer, pending);
                        if (req is null) return;
                        lock (_log) _log.Add(req);
                        FakeResponse resp;
                        try { resp = _handler(req); }
                        catch (Exception ex) { resp = new FakeResponse(500, "{\"error\":" + System.Text.Json.JsonSerializer.Serialize(ex.Message) + "}"); }
                        if (resp.Delay > TimeSpan.Zero) await Task.Delay(resp.Delay, _cts.Token);
                        var body = Encoding.UTF8.GetBytes(resp.Body);
                        var head = $"HTTP/1.1 {resp.Status} {Reason(resp.Status)}\r\nContent-Type: {resp.ContentType}; charset=utf-8\r\nContent-Length: {body.Length}\r\nConnection: keep-alive\r\n\r\n";
                        await stream.WriteAsync(Encoding.ASCII.GetBytes(head), _cts.Token);
                        await stream.WriteAsync(body, _cts.Token);
                        await stream.FlushAsync(_cts.Token);
                    }
                }
            }
            catch (Exception) { /* client went away, TLS rejected, or shutdown */ }
        }
    }

    private async Task<FakeRequest?> ReadRequestAsync(Stream s, byte[] buffer, MemoryStream pending)
    {
        while (true)
        {
            var data = pending.ToArray();
            var end = IndexOf(data, "\r\n\r\n"u8);
            if (end >= 0)
            {
                var head = Encoding.ASCII.GetString(data, 0, end);
                var lines = head.Split("\r\n");
                var parts = lines[0].Split(' ');
                var length = 0;
                foreach (var l in lines.Skip(1))
                {
                    var i = l.IndexOf(':');
                    if (i > 0 && l[..i].Trim().Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) length = int.Parse(l[(i + 1)..].Trim());
                }
                while (data.Length < end + 4 + length)
                {
                    var n = await s.ReadAsync(buffer, _cts.Token);
                    if (n == 0) return null;
                    pending.Write(buffer, 0, n);
                    data = pending.ToArray();
                }
                var body = Encoding.UTF8.GetString(data, end + 4, length);
                var rest = data[(end + 4 + length)..];
                pending.SetLength(0);
                pending.Write(rest);
                var target = parts.Length > 1 ? parts[1] : "/";
                var q = target.IndexOf('?');
                return new FakeRequest(parts[0], Uri.UnescapeDataString(q < 0 ? target : target[..q]), q < 0 ? "" : target[(q + 1)..], body, _clock.Elapsed);
            }
            var read = await s.ReadAsync(buffer, _cts.Token);
            if (read == 0) return null;
            pending.Write(buffer, 0, read);
        }
    }

    private static int IndexOf(byte[] data, ReadOnlySpan<byte> needle) => data.AsSpan().IndexOf(needle);

    private static string Reason(int status) => status switch { 200 => "OK", 400 => "Bad Request", 403 => "Forbidden", 404 => "Not Found", 500 => "Internal Server Error", 502 => "Bad Gateway", 503 => "Service Unavailable", _ => "Status" };

    private int _disposed;

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
        _cts.Cancel();
        _listener.Stop();
        try { await _accept.WaitAsync(TimeSpan.FromSeconds(2)); } catch { }
        _cert?.Dispose();
        _cts.Dispose();
    }
}
