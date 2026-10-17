using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;

namespace PrismRelay.Tests;

/// <summary>A temp PRISM_CONTROL_DIR, deleted on dispose.</summary>
public sealed class TempRoot : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "prism-relay-test-" + Guid.NewGuid().ToString("N")[..8]);
    public TempRoot() => Directory.CreateDirectory(Path);
    public string Ingress(string module) => System.IO.Path.Combine(Path, "modules", module, "ingress.json");
    public void Dispose()
    {
        for (var i = 0; i < 20; i++)
        {
            try { if (Directory.Exists(Path)) Directory.Delete(Path, true); return; }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Thread.Sleep(50); }
        }
    }
}

/// <summary>
/// A fake module pipe server: a CurrentUserOnly NamedPipeServerStream with a random prism-control name, its discovery
/// file, and per-connection scripting. Raw on purpose, so tests can send frames a real PipeEndpoint never would.
/// </summary>
public sealed class FakePipeServer : IAsyncDisposable
{
    private readonly CancellationTokenSource _stop = new();
    private readonly Func<FakeConnection, Task> _onConnection;
    private readonly Task _loop;
    public string Pipe { get; }
    public string Token { get; } = Convert.ToHexString(Guid.NewGuid().ToByteArray()) + Convert.ToHexString(Guid.NewGuid().ToByteArray());
    public List<FakeConnection> Connections { get; } = [];

    public FakePipeServer(string module, string ingressPath, Func<FakeConnection, Task> onConnection, int? pid = null, bool writeDiscovery = true)
    {
        Pipe = $"prism-control-{module}-{Guid.NewGuid():N}";
        _onConnection = onConnection;
        _loop = Task.Run(LoopAsync);
        if (writeDiscovery) WriteDiscovery(ingressPath, Pipe, Token, pid ?? Environment.ProcessId);
    }

    public static void WriteDiscovery(string path, string pipe, string token, int pid)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
        File.WriteAllText(path, new JsonObject { ["v"] = 1, ["pipe"] = pipe, ["token"] = token, ["pid"] = pid, ["startedAt"] = "2026-10-16T12:00:00.000Z" }.ToJsonString());
    }

    private async Task LoopAsync()
    {
        while (!_stop.IsCancellationRequested)
        {
            var s = new NamedPipeServerStream(Pipe, PipeDirection.InOut, 8, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            try { await s.WaitForConnectionAsync(_stop.Token); }
            catch (Exception) { s.Dispose(); return; }
            var c = new FakeConnection(s);
            lock (Connections) Connections.Add(c);
            _ = Task.Run(async () =>
            {
                try { await _onConnection(c); } catch (Exception) { }
            });
        }
    }

    public FakeConnection? First { get { lock (Connections) return Connections.FirstOrDefault(); } }

    public async Task<FakeConnection> WaitForConnectionAsync(int index = 0, int timeoutMs = 5000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            lock (Connections) if (Connections.Count > index) return Connections[index];
            await Task.Delay(10);
        }
        throw new TimeoutException("no relay connected");
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        try { await _loop.WaitAsync(TimeSpan.FromSeconds(2)); } catch (Exception) { }
        lock (Connections) foreach (var c in Connections) c.Stream.Dispose();
    }
}

public sealed class FakeConnection(NamedPipeServerStream stream)
{
    public NamedPipeServerStream Stream { get; } = stream;
    public List<string> Received { get; } = [];

    public async Task<string?> ReadAsync(int timeoutMs = 3000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            var header = new byte[4];
            if (!await Fill(header, cts.Token)) return null;
            var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(header)];
            if (!await Fill(body, cts.Token)) return null;
            var s = Encoding.UTF8.GetString(body);
            lock (Received) Received.Add(s);
            return s;
        }
        catch (OperationCanceledException) { return null; }
    }

    public async Task SendAsync(string json) => await SendRawAsync(Encoding.UTF8.GetBytes(json));

    public async Task SendRawAsync(byte[] body)
    {
        var frame = new byte[4 + body.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(frame, (uint)body.Length);
        body.CopyTo(frame, 4);
        await Stream.WriteAsync(frame);
    }

    private async Task<bool> Fill(Memory<byte> b, CancellationToken ct)
    {
        while (b.Length > 0)
        {
            int n;
            try { n = await Stream.ReadAsync(b, ct); } catch (IOException) { return false; }
            if (n == 0) return false;
            b = b[n..];
        }
        return true;
    }
}

/// <summary>Runs the real prism-relay.exe with redirected binary stdio.</summary>
public sealed class RelayProcess : IDisposable
{
    public static string? Exe
    {
        get
        {
            var env = Environment.GetEnvironmentVariable("PRISM_RELAY_EXE");
            if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;
            var local = System.IO.Path.Combine(AppContext.BaseDirectory, "prism-relay.exe");
            return File.Exists(local) ? local : null;
        }
    }

    public Process P { get; }
    public Stream Stdin => P.StandardInput.BaseStream;
    public Stream Stdout => P.StandardOutput.BaseStream;
    private readonly Task<string> _stderr;

    public RelayProcess(string root, params string[] args)
    {
        var psi = new ProcessStartInfo(Exe ?? throw new InvalidOperationException("prism-relay.exe not found"))
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            WorkingDirectory = System.IO.Path.GetTempPath(),
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment["PRISM_CONTROL_DIR"] = root;
        P = Process.Start(psi)!;
        _stderr = P.StandardError.ReadToEndAsync();
    }

    public async Task<string> StderrAsync() => await _stderr;

    public async Task WriteFrameAsync(string json) => await WriteFrameAsync(Encoding.UTF8.GetBytes(json));

    public async Task WriteFrameAsync(byte[] body)
    {
        var h = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(h, (uint)body.Length);
        await Stdin.WriteAsync(h);
        await Stdin.WriteAsync(body);
        await Stdin.FlushAsync();
    }

    public async Task<string?> ReadFrameAsync(int timeoutMs = 4000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        var header = new byte[4];
        try
        {
            if (!await Fill(header, cts.Token)) return null;
            var body = new byte[BinaryPrimitives.ReadUInt32LittleEndian(header)];
            if (!await Fill(body, cts.Token)) return null;
            return Encoding.UTF8.GetString(body);
        }
        catch (OperationCanceledException) { return null; }
    }

    private async Task<bool> Fill(Memory<byte> b, CancellationToken ct)
    {
        while (b.Length > 0)
        {
            var n = await Stdout.ReadAsync(b, ct);
            if (n == 0) return false;
            b = b[n..];
        }
        return true;
    }

    public async Task<int> WaitAsync(int timeoutMs = 5000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        await P.WaitForExitAsync(cts.Token);
        return P.ExitCode;
    }

    public void Dispose()
    {
        try { if (!P.HasExited) P.Kill(); } catch (Exception) { }
        P.Dispose();
    }

    /// <summary>Runs hook mode to completion: stdin bytes in, (exit code, stdout, stderr, elapsed ms) out.</summary>
    public static async Task<(int Code, string Stdout, string Stderr, double Ms)> RunHookAsync(string root, string agent, string ev, byte[] stdin, int timeoutMs = 10_000)
    {
        var sw = Stopwatch.StartNew();
        using var r = new RelayProcess(root, "hook", agent, ev);
        var outTask = new StreamReader(r.Stdout, Encoding.UTF8).ReadToEndAsync();
        try
        {
            await r.Stdin.WriteAsync(stdin);
            r.Stdin.Close();
        }
        catch (IOException) { /* the relay exited early */ }
        var code = await r.WaitAsync(timeoutMs);
        var ms = sw.Elapsed.TotalMilliseconds;
        return (code, await outTask, await r.StderrAsync(), ms);
    }
}
