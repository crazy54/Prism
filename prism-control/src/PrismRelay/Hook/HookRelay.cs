using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace PrismRelay.Hook;

internal sealed class HookOptions
{
    public const int StdinCap = 1024 * 1024;
    /// <summary>The ai pipe's frame cap (the module's MaxFrameBytes).</summary>
    public int MaxFrame { get; init; } = 64 * 1024;
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromMilliseconds(150);
    public TimeSpan AckTimeout { get; init; } = TimeSpan.FromMilliseconds(300);
    /// <summary>How long to wait for stdin to finish when there is a listener (Claude writes it at spawn).</summary>
    public TimeSpan StdinTimeout { get; init; } = TimeSpan.FromMilliseconds(1000);
    /// <summary>How long to keep draining stdin before a silent exit when nothing listens (so the writer never sees EPIPE).</summary>
    public TimeSpan QuietDrain { get; init; } = TimeSpan.FromMilliseconds(100);
    /// <summary>The longest hold we accept (the hook timeout we install is 60 s).</summary>
    public int MaxHoldMs { get; init; } = 55_000;
}

/// <summary>
/// Mode 2: <c>prism-relay.exe hook &lt;agent&gt; &lt;EventName&gt;</c>. Minimizes the event (HookPolicy), sends it to the
/// ai module, waits for the ack, follows the PermissionRequest hold protocol (ai-apps.md §5.5), and prints a decision only
/// for allow or deny. Always exit code 0; never writes to stderr; any failure is silent.
/// </summary>
internal sealed partial class HookRelay(string agent, string eventName, Stream stdin, Stream stdout, Func<string, string?> env, string discoveryPath, HookOptions options)
{
    [LibraryImport("kernel32.dll")] private static partial nint GetConsoleWindow();
    [LibraryImport("user32.dll")] private static partial nint GetAncestor(nint hwnd, uint flags);

    private readonly StdinReader _stdin = new(stdin, HookOptions.StdinCap);

    /// <summary>What happened (tests and diagnostics; never printed).</summary>
    public string Outcome { get; private set; } = "started";

    /// <summary>Phase timestamps in ms since <see cref="RunAsync"/> began (tests and profiling only; never printed).</summary>
    public List<(string Phase, double Ms)> Phases { get; } = [];

    private readonly long _t0 = System.Diagnostics.Stopwatch.GetTimestamp();

    private void Mark(string phase) => Phases.Add((phase, System.Diagnostics.Stopwatch.GetElapsedTime(_t0).TotalMilliseconds));

    public async Task<int> RunAsync(CancellationToken ct = default)
    {
        try { await RunCoreAsync(ct).ConfigureAwait(false); }
        catch (Exception ex) { Outcome = "error:" + ex.GetType().Name; }
        return 0;
    }

    private async Task RunCoreAsync(CancellationToken ct)
    {
        var at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _stdin.Start();
        if (!HookPolicy.IsAgentName(agent) || !HookPolicy.IsEventName(eventName))
        {
            Outcome = "bad-args";
            await _stdin.WaitAsync(options.QuietDrain).ConfigureAwait(false);
            return;
        }

        // Is anyone listening? A missing/invalid file, a dead plugin pid or a missing pipe all mean "no": exit quietly.
        var d = Discovery.TryRead(discoveryPath);
        if (d is null || (d.Pid > 0 && !ProcessTree.IsAlive(d.Pid)))
        {
            Outcome = d is null ? "no-listener" : "stale";
            await _stdin.WaitAsync(options.QuietDrain).ConfigureAwait(false);
            return;
        }

        Mark("discovery");
        // Only the server the discovery file names (GetNamedPipeServerProcessId == its pid) ever gets the token.
        var connect = PipeConnector.TryConnectAsync(d.Pipe, options.ConnectTimeout, d.Pid, ct);
        // Review L10: the Toolhelp snapshot was the relay's biggest cost; the parent links are walked one by one instead.
        var ancestors = ParentWalk.Ancestors();
        Mark("ancestry");
        var console = ConsoleOwner();
        var stdinDone = await _stdin.WaitAsync(options.StdinTimeout).ConfigureAwait(false);
        Mark("stdin");
        await using var pipe = await connect.ConfigureAwait(false);
        Mark("connect");
        if (pipe is null)
        {
            Outcome = "no-connect";
            if (!stdinDone) await _stdin.WaitAsync(options.QuietDrain).ConfigureAwait(false);
            return;
        }

        var captured = _stdin.Snapshot();
        var input = HookInput.Read(captured, complete: stdinDone && !_stdin.Truncated);
        var context = new HookPolicy.Context(agent, eventName, at, input, env, ancestors, console, captured.Length, _stdin.Truncated || !stdinDone);
        await pipe.WriteAsync(Framing.Encode(HookPolicy.BuildFrame(context, d.Token)), ct).ConfigureAwait(false);
        Mark("frame");

        var ack = await ReadWithTimeoutAsync(pipe, options.AckTimeout, ct).ConfigureAwait(false);
        Mark("ack");
        if (ack is null) { Outcome = "no-ack"; return; }
        if (eventName != "PermissionRequest") { Outcome = "acked"; return; }

        var (hold, reveal, deadlineMs) = ParseAck(ack);
        if (!hold) { Outcome = "no-hold"; return; }
        var tool = HookPolicy.ToolOf(context);
        if (reveal) await pipe.WriteAsync(Framing.Encode(HookPolicy.RevealFrame(input)), ct).ConfigureAwait(false);

        var decisionFrame = await ReadWithTimeoutAsync(pipe, TimeSpan.FromMilliseconds(Math.Clamp(deadlineMs, 0, options.MaxHoldMs)), ct).ConfigureAwait(false);
        if (decisionFrame is null) { Outcome = "hold-timeout"; return; }
        var (decision, message, interrupt) = HookPolicy.ParseDecision(decisionFrame);
        var output = HookPolicy.DecisionOutput(decision, message, interrupt, tool);
        Outcome = "decision:" + decision.ToString().ToLowerInvariant() + (output is null ? ":silent" : "");
        if (output is null) return;
        var bytes = System.Text.Encoding.UTF8.GetBytes(output);
        await stdout.WriteAsync(bytes, ct).ConfigureAwait(false);
        await stdout.FlushAsync(ct).ConfigureAwait(false);
    }

    /// <summary>{hold:false} or {hold:true, reveal, deadlineMs}. Anything unexpected is "no hold".</summary>
    internal static (bool Hold, bool Reveal, int DeadlineMs) ParseAck(byte[] body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var r = doc.RootElement;
            if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("hold", out var h) || h.ValueKind != JsonValueKind.True) return (false, false, 0);
            var reveal = r.TryGetProperty("reveal", out var rv) && rv.ValueKind == JsonValueKind.True;
            var deadline = r.TryGetProperty("deadlineMs", out var dl) && dl.TryGetInt32(out var ms) ? ms : 0;
            return (true, reveal, deadline);
        }
        catch (JsonException) { return (false, false, 0); }
    }

    private async Task<byte[]?> ReadWithTimeoutAsync(NamedPipeClientStream pipe, TimeSpan timeout, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        try
        {
            var f = await Framing.ReadAsync(pipe, options.MaxFrame, cts.Token).ConfigureAwait(false);
            return f.Kind == FrameKind.Frame ? f.Body : null;
        }
        catch (Exception) { return null; }
    }

    /// <summary>GetAncestor(GetConsoleWindow(), GA_ROOTOWNER): the terminal window under ConPTY, 0 without a console.</summary>
    private static long ConsoleOwner()
    {
        try
        {
            var w = GetConsoleWindow();
            if (w == 0) return 0;
            var owner = GetAncestor(w, 3);
            return owner != 0 ? owner : w;
        }
        catch (Exception) { return 0; }
    }
}

/// <summary>
/// Reads stdin on a background thread: the first <c>cap</c> bytes are kept, the rest is drained and discarded until EOF.
/// </summary>
internal sealed class StdinReader(Stream stdin, int cap)
{
    private readonly TaskCompletionSource _done = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private byte[] _buffer = new byte[Math.Min(cap, 64 * 1024)];
    private int _length;
    private long _total;
    private Thread? _thread;

    public bool Truncated => Volatile.Read(ref _total) > cap;
    /// <summary>A copy of what was captured so far (the reader thread may still be draining).</summary>
    public byte[] Snapshot() { lock (this) return _buffer.AsSpan(0, _length).ToArray(); }
    public long TotalBytes => Volatile.Read(ref _total);

    public void Start()
    {
        _thread = new Thread(Run) { IsBackground = true, Name = "stdin" };
        _thread.Start();
    }

    /// <summary>True when EOF arrived within <paramref name="timeout"/>.</summary>
    public async Task<bool> WaitAsync(TimeSpan timeout)
    {
        if (_done.Task.IsCompleted) return true;
        return await Task.WhenAny(_done.Task, Task.Delay(timeout)).ConfigureAwait(false) == _done.Task;
    }

    private void Run()
    {
        try
        {
            var scratch = new byte[64 * 1024];
            while (true)
            {
                var n = stdin.Read(scratch, 0, scratch.Length);
                if (n <= 0) break;
                lock (this)
                {
                    var keep = (int)Math.Min(n, Math.Max(0, cap - _length));
                    if (keep > 0)
                    {
                        if (_length + keep > _buffer.Length) Array.Resize(ref _buffer, Math.Min(cap, Math.Max(_buffer.Length * 2, _length + keep)));
                        Buffer.BlockCopy(scratch, 0, _buffer, _length, keep);
                        Volatile.Write(ref _length, _length + keep);
                    }
                    Interlocked.Add(ref _total, n);
                }
            }
        }
        catch (Exception) { }
        _done.TrySetResult();
    }
}
