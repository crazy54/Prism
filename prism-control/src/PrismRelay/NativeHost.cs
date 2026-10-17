using System.IO.Pipes;
using System.Text.Json;

namespace PrismRelay;

internal sealed class NativeHostOptions
{
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromMilliseconds(500);
    public TimeSpan RetryInterval { get; init; } = TimeSpan.FromSeconds(1);
    /// <summary>Frames above this are dropped in both directions (Chrome's host→browser cap; the browser pipe's cap).</summary>
    public int MaxFrame { get; init; } = Framing.BrowserCap;
}

/// <summary>
/// Mode 1: Chrome/Edge native-messaging host. stdin/stdout (native-messaging framing) ⇄ the browser module's pipe.
/// <list type="bullet">
/// <item>Finds the browser by walking parents (relay → [cmd.exe →] chrome.exe), never trusting the extension for it.</item>
/// <item>Reads modules\browser\ingress.json, connects (CurrentUserOnly, 500 ms), checks that the pipe server's pid is the
/// discovery file's <c>pid</c> (else it disconnects without writing anything), sends the preamble
/// <c>{t:"relay", v:1, token, origin, browserPid, browserExe, parentWindow, relayVersion}</c>.</item>
/// <item>Pumps frames verbatim both ways. Frames over 1 MB are drained and dropped (toward stdout: Chrome would
/// otherwise kill the port; toward the pipe: the server would close the session).</item>
/// <item>After every successful (re)connect + preamble: <c>{t:"relay.up"}</c> to the browser, before any pipe frame.</item>
/// <item>On pipe loss: <c>{t:"relay.down"}</c> to the browser once, then retries every 1 s, re-reading the discovery
/// file (the plugin rotates name and token on every start). Browser frames are dropped while the pipe is down.</item>
/// <item>Exits on stdin EOF.</item>
/// </list>
/// </summary>
internal sealed class NativeHost(Stream stdin, Stream stdout, string origin, int parentWindow, string discoveryPath, NativeHostOptions options)
{
    private static readonly byte[] RelayDown = Framing.Encode("{\"t\":\"relay.down\"}"u8);
    private static readonly byte[] RelayUp = Framing.Encode("{\"t\":\"relay.up\"}"u8);

    private readonly SemaphoreSlim _stdoutGate = new(1, 1);
    private readonly SemaphoreSlim _pipeWriteGate = new(1, 1);
    private volatile NamedPipeClientStream? _pipe;

    /// <summary>Counters for tests.</summary>
    public int DroppedToBrowser, DroppedToPipe, Connects;

    public async Task<int> RunAsync(CancellationToken ct = default)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var (browserPid, browserExe) = FindBrowser();
        var pipeLoop = Task.Run(() => PipeLoopAsync(browserPid, browserExe, stop.Token));
        try { await StdinLoopAsync(stop.Token).ConfigureAwait(false); }
        catch (Exception) { /* stdin broke: same as EOF */ }
        stop.Cancel();
        _pipe?.Dispose();
        try { await pipeLoop.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); } catch (Exception) { }
        return 0;
    }

    /// <summary>The first ancestor that is not a shell/console shim: Chrome launches hosts directly or via cmd.exe.</summary>
    internal static (int Pid, string Exe) FindBrowser()
    {
        foreach (var p in ProcessTree.Ancestors(4))
        {
            if (p.Exe.Equals("cmd.exe", StringComparison.OrdinalIgnoreCase) || p.Exe.Equals("conhost.exe", StringComparison.OrdinalIgnoreCase)) continue;
            return ((int)p.Pid, p.Exe);
        }
        return (0, "");
    }

    private async Task StdinLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var f = await Framing.ReadAsync(stdin, options.MaxFrame, ct).ConfigureAwait(false);
            if (f.Kind == FrameKind.Eof) return;
            if (f.Kind == FrameKind.Oversize) { Interlocked.Increment(ref DroppedToPipe); continue; }
            var pipe = _pipe;
            if (pipe is null) continue; // down: dropped; the module resyncs on the next session
            await _pipeWriteGate.WaitAsync(ct).ConfigureAwait(false);
            try { await pipe.WriteAsync(Framing.Encode(f.Body), ct).ConfigureAwait(false); }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException) { pipe.Dispose(); } // the pipe loop notices and reconnects
            finally { _pipeWriteGate.Release(); }
        }
    }

    private async Task PipeLoopAsync(int browserPid, string browserExe, CancellationToken ct)
    {
        var downSent = false;
        while (!ct.IsCancellationRequested)
        {
            var d = Discovery.TryRead(discoveryPath);
            // The server must be the process the discovery file names: the token goes to nobody else (review LOW 12).
            var pipe = d is null ? null : await PipeConnector.TryConnectAsync(d.Pipe, options.ConnectTimeout, d.Pid, ct).ConfigureAwait(false);
            if (pipe is not null)
            {
                try
                {
                    await pipe.WriteAsync(Framing.Encode(Preamble(d!.Token, browserPid, browserExe)), ct).ConfigureAwait(false);
                    Interlocked.Increment(ref Connects);
                    _pipe = pipe;
                    downSent = false;
                    // The extension sends its hello on relay.up (extension/PROTOCOL.md §12). Written before any pipe frame is pumped.
                    if (!await WriteStdoutAsync(RelayUp, ct).ConfigureAwait(false)) return;
                    await PumpToBrowserAsync(pipe, ct).ConfigureAwait(false);
                }
                catch (Exception) { /* pipe lost */ }
                finally
                {
                    _pipe = null;
                    await pipe.DisposeAsync().ConfigureAwait(false);
                }
                if (ct.IsCancellationRequested) return;
            }
            if (!downSent)
            {
                downSent = true;
                if (!await WriteStdoutAsync(RelayDown, ct).ConfigureAwait(false)) return;
            }
            try { await Task.Delay(options.RetryInterval, ct).ConfigureAwait(false); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task PumpToBrowserAsync(NamedPipeClientStream pipe, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var f = await Framing.ReadAsync(pipe, options.MaxFrame, ct).ConfigureAwait(false);
            if (f.Kind == FrameKind.Eof) return;
            if (f.Kind == FrameKind.Oversize) { Interlocked.Increment(ref DroppedToBrowser); continue; }
            if (!await WriteStdoutAsync(Framing.Encode(f.Body), ct).ConfigureAwait(false)) throw new OperationCanceledException();
        }
    }

    private async Task<bool> WriteStdoutAsync(byte[] frame, CancellationToken ct)
    {
        await _stdoutGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await stdout.WriteAsync(frame, ct).ConfigureAwait(false);
            await stdout.FlushAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (Exception) { return false; }
        finally { _stdoutGate.Release(); }
    }

    private byte[] Preamble(string token, int browserPid, string browserExe)
    {
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
            w.WriteString("t", "relay");
            w.WriteNumber("v", 1);
            w.WriteString("token", token);
            w.WriteString("origin", origin);
            w.WriteNumber("browserPid", browserPid);
            w.WriteString("browserExe", browserExe);
            w.WriteNumber("parentWindow", parentWindow);
            w.WriteString("relayVersion", RelayEnv.Version);
            w.WriteEndObject();
        }
        return ms.ToArray();
    }

    /// <summary>The caller origin Chrome passes as argv[1]: chrome-extension://&lt;32 a–p&gt;/ (Edge uses the same scheme).</summary>
    internal static bool IsExtensionOrigin(string s)
    {
        const string prefix = "chrome-extension://";
        if (!s.StartsWith(prefix, StringComparison.Ordinal) || !s.EndsWith('/')) return false;
        var id = s.AsSpan(prefix.Length, s.Length - prefix.Length - 1);
        if (id.Length is < 1 or > 64) return false;
        foreach (var c in id) if (!char.IsAsciiLetterLower(c) && !char.IsAsciiDigit(c)) return false;
        return true;
    }

    /// <summary>--parent-window=N (Chrome on Windows; 0 for service workers).</summary>
    internal static int ParentWindow(string[] args)
    {
        foreach (var a in args)
            if (a.StartsWith("--parent-window=", StringComparison.Ordinal) && long.TryParse(a.AsSpan(16), out var v)) return (int)Math.Clamp(v, int.MinValue, int.MaxValue);
        return 0;
    }
}
