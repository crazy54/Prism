using System.Text.Json.Nodes;
using PrismControl.Testing;

namespace PrismRelay.Tests;

/// <summary>
/// Review LOW 12: the relay only talks to the pipe server the discovery file names. After connecting it compares
/// GetNamedPipeServerProcessId with the discovery file's pid; on a mismatch (or no pid) it disconnects without writing a
/// single byte, so the token never reaches another server. Pipes here are created by this test process only.
/// </summary>
public class ServerPidTests
{
    private const string Origin = "chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/";
    private const string Up = "{\"t\":\"relay.up\"}", Down = "{\"t\":\"relay.down\"}";

    /// <summary>The System process: always alive, never the pipe server.</summary>
    private const int SystemPid = 4;

    [Test(TimeoutMs = 40_000)]
    public async Task The_pid_checked_connect_accepts_only_the_named_server()
    {
        using var root = new TempRoot();
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c => await Task.Delay(3000));
        // Generous timeouts: the fake server re-creates its listening instance on a background task (slow under load).
        var timeout = TimeSpan.FromSeconds(3);
        // Wait for its first instance.
        for (var i = 0; i < 100; i++)
        {
            await using var probe = await PipeConnector.TryConnectAsync(server.Pipe, timeout, CancellationToken.None);
            if (probe is not null) { Console.WriteLine($"     server pid seen: {PipeConnector.ServerPidOf(probe)}, ours: {Environment.ProcessId}"); break; }
            await Task.Delay(20);
        }

        await using (var ok = await PipeConnector.TryConnectAsync(server.Pipe, timeout, Environment.ProcessId, CancellationToken.None))
        {
            Assert.True(ok is not null, "the discovery pid is the server: connected");
            Assert.Equal((uint)Environment.ProcessId, PipeConnector.ServerPidOf(ok!));
        }

        // A second server only ever sees pid-checked attempts naming another live pid: each returns null although it DID
        // connect (so the refusal is the pid check, not a timeout), and nothing is ever written.
        await using (var other = new FakePipeServer("browser", Path.Combine(root.Path, "other.json"), async c => await Task.Delay(3000)))
        {
            // Until the fake server's background loop listens (seconds under a loaded full run), attempts find no pipe.
            var until = DateTime.UtcNow.AddSeconds(15);
            while (DateTime.UtcNow < until)
            {
                Assert.Null(await PipeConnector.TryConnectAsync(other.Pipe, timeout, SystemPid, CancellationToken.None), "another live pid: refused");
                await Task.Delay(50);
                lock (other.Connections) if (other.Connections.Count > 0) break;
            }
            var refused = await other.WaitForConnectionAsync(0, 5000);
            Assert.Null(await refused.ReadAsync(1000), "connected, then hung up without writing a byte");
        }
        Assert.Null(await PipeConnector.TryConnectAsync(server.Pipe, timeout, 0, CancellationToken.None), "no pid in the discovery file: refused");
        Assert.Null(await PipeConnector.TryConnectAsync(server.Pipe, timeout, -1, CancellationToken.None));

        // The old overload (HookRelay.cs still calls it) is unchanged.
        await using var plain = await PipeConnector.TryConnectAsync(server.Pipe, timeout, CancellationToken.None);
        Assert.True(plain is not null, "the pid-less overload still connects");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task The_native_host_never_sends_the_token_to_a_server_with_another_pid()
    {
        Req.Exe();
        using var root = new TempRoot();
        // The handler only holds connections open; the test reads them itself.
        await using var server = new FakePipeServer("browser", root.Ingress("browser"), async c => await Task.Delay(8000), pid: SystemPid);
        using var relay = new RelayProcess(root.Path, Origin, "--parent-window=0");

        Assert.Equal(Down, await relay.ReadFrameAsync(), "a server that is not the named process counts as no server");
        var first = await server.WaitForConnectionAsync();
        Assert.Null(await first.ReadAsync(1500), "the relay connected, checked the pid and hung up without writing a byte (no token)");
        lock (first.Received) Assert.Empty(first.Received);

        // The plugin's own discovery file (the matching pid): the relay connects on its next retry and sends the preamble
        // (the fake pipe has no buffer, so the write completes once we read it), then relay.up.
        int before;
        lock (server.Connections) before = server.Connections.Count;
        FakePipeServer.WriteDiscovery(root.Ingress("browser"), server.Pipe, server.Token, Environment.ProcessId);
        string? preamble = null;
        var deadline = DateTime.UtcNow.AddSeconds(6);
        var seen = before;
        while (preamble is null && DateTime.UtcNow < deadline)
        {
            var c = await server.WaitForConnectionAsync(seen, 6000);
            seen++;
            preamble = await c.ReadAsync(1500);   // null = a refused attempt that raced the rewrite
        }
        Assert.True(preamble is not null, "the preamble went to the right server");
        Assert.Equal(server.Token, JsonNode.Parse(preamble!)!["token"]!.GetValue<string>());
        Assert.Equal(Up, await relay.ReadFrameAsync(4000), "relay.up once the server is the named process");
        List<FakeConnection> refused;
        lock (server.Connections) refused = server.Connections.Take(before).ToList();
        Assert.True(refused.Count >= 1);
        foreach (var c in refused.Skip(1)) Assert.Null(await c.ReadAsync(300), "every refused connection got nothing");
    }
}
