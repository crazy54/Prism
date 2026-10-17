using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using PrismControl.Core.Hosting;

namespace PrismControl.Desktop;

/// <summary>
/// One authenticated client connection (a relay instance). Frames are u32 little-endian length + UTF-8 JSON, the
/// native-messaging framing. A background loop reads frames as they arrive (a small bounded queue, so a slow module
/// back-pressures the client); <see cref="ReadAsync"/> takes the next one. Cancelling a read only abandons the wait:
/// no data is lost. The session is closed when the client disconnects, a frame breaks the rules, or you dispose it.
/// </summary>
public sealed class PipeSession : IAsyncDisposable
{
    private readonly PipeStream _stream;
    private readonly PipeEndpointOptions _options;
    private readonly ILog _log;
    private readonly Channel<JsonNode> _frames = Channel.CreateBounded<JsonNode>(new BoundedChannelOptions(4) { SingleReader = false, SingleWriter = true });
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private readonly CancellationTokenSource _closing = new();
    private readonly TaskCompletionSource _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _closed;

    internal PipeSession(PipeStream stream, PipeEndpointOptions options, int? clientPid, string? clientImagePath, JsonObject hello, ILog log)
    {
        _stream = stream;
        _options = options;
        ClientPid = clientPid;
        ClientImagePath = clientImagePath;
        Hello = hello;
        _log = log;
    }

    /// <summary>The client's first frame, already token-checked, with the <c>token</c> property removed.</summary>
    public JsonObject Hello { get; }

    /// <summary>GetNamedPipeClientProcessId (null if Windows did not say).</summary>
    public int? ClientPid { get; }

    /// <summary>The client process's image path (e.g. to check that it is our installed prism-relay.exe), or null.</summary>
    public string? ClientImagePath { get; }

    public bool IsConnected => Volatile.Read(ref _closed) == 0 && _stream.IsConnected;

    /// <summary>Completes when the session has closed (either side).</summary>
    public Task Completion => _completion.Task;

    internal void StartReading() => _ = Task.Run(ReadLoopAsync);

    /// <summary>
    /// The next frame, or null at end of stream (the client disconnected, or the session was closed). Throws
    /// <see cref="PipeFrameException"/> when a frame was over <see cref="PipeEndpointOptions.MaxFrameBytes"/>, not
    /// JSON, or stalled for longer than <see cref="PipeEndpointOptions.ReadTimeout"/> once started; the session is
    /// closed then.
    /// </summary>
    public async Task<JsonNode?> ReadAsync(CancellationToken ct)
    {
        try
        {
            if (await _frames.Reader.WaitToReadAsync(ct).ConfigureAwait(false) && _frames.Reader.TryRead(out var frame)) return frame;
            return null;
        }
        catch (ChannelClosedException ex) when (ex.InnerException is not null) { throw ex.InnerException; }
        catch (PipeFrameException) { throw; }
    }

    /// <summary>
    /// Writes one frame. Throws <see cref="PipeFrameException"/> (nothing written, session kept) when it is over the cap,
    /// and <see cref="IOException"/> when the session is closed. Cancelling mid-write closes the session (the frame
    /// boundary is lost). Writes are serialized.
    /// </summary>
    public async Task WriteAsync(JsonNode frame, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(frame);
        var bytes = PipeFraming.Encode(frame);
        if (bytes.Length - 4 > _options.MaxFrameBytes)
            throw new PipeFrameException($"A {bytes.Length - 4}-byte frame exceeds the {_options.MaxFrameBytes}-byte cap.");
        await _writeGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (Volatile.Read(ref _closed) != 0) throw new IOException("The pipe session is closed.");
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _closing.Token);
            try { await _stream.WriteAsync(bytes, linked.Token).ConfigureAwait(false); }
            catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException)
            {
                Close();
                if (ex is OperationCanceledException && ct.IsCancellationRequested) throw;
                throw new IOException("The pipe session closed during a write.", ex);
            }
        }
        finally { _writeGate.Release(); }
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            while (true)
            {
                var frame = await ReadFrameAsync(_stream, _options, wholeFrameTimeout: false, _closing.Token).ConfigureAwait(false);
                if (frame is null) break;
                await _frames.Writer.WriteAsync(frame, _closing.Token).ConfigureAwait(false);
            }
            _frames.Writer.TryComplete();
        }
        catch (PipeFrameException ex)
        {
            _log.Debug("Closing a pipe session: " + ex.Message);
            _frames.Writer.TryComplete(ex);
        }
        catch (Exception)
        {
            _frames.Writer.TryComplete();
        }
        finally { Close(); }
    }

    /// <summary>
    /// Reads one frame. Null on a clean end of stream (or a stream that ends mid-frame). With
    /// <paramref name="wholeFrameTimeout"/> the read timeout covers the wait for the first byte too (the hello);
    /// otherwise it starts at the first byte, so idle sessions are fine but a stalled frame is not.
    /// </summary>
    internal static async Task<JsonNode?> ReadFrameAsync(Stream stream, PipeEndpointOptions options, bool wholeFrameTimeout, CancellationToken ct)
    {
        var header = new byte[4];
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (wholeFrameTimeout) timeout.CancelAfter(options.ReadTimeout);
        int got;
        try { got = await stream.ReadAsync(header.AsMemory(0, 4), timeout.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new PipeFrameException("No frame arrived within the read timeout."); }
        if (got == 0) return null;
        if (!wholeFrameTimeout) timeout.CancelAfter(options.ReadTimeout);
        try
        {
            if (got < 4 && !await FillAsync(stream, header.AsMemory(got), timeout.Token).ConfigureAwait(false)) return null;
            var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
            if (length == 0) throw new PipeFrameException("Empty frame.");
            if (length > (uint)options.MaxFrameBytes) throw new PipeFrameException($"A {length}-byte frame exceeds the {options.MaxFrameBytes}-byte cap.");
            var body = new byte[length];
            if (!await FillAsync(stream, body, timeout.Token).ConfigureAwait(false)) return null;
            return PipeFraming.Parse(body);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new PipeFrameException($"A frame stalled for longer than {options.ReadTimeout.TotalMilliseconds:F0} ms.");
        }
    }

    private static async Task<bool> FillAsync(Stream stream, Memory<byte> buffer, CancellationToken ct)
    {
        while (buffer.Length > 0)
        {
            var n = await stream.ReadAsync(buffer, ct).ConfigureAwait(false);
            if (n == 0) return false;
            buffer = buffer[n..];
        }
        return true;
    }

    /// <summary>Closes the session (idempotent): the client sees end of stream.</summary>
    public void Close()
    {
        if (Interlocked.Exchange(ref _closed, 1) != 0) return;
        try { _closing.Cancel(); } catch (ObjectDisposedException) { }
        _frames.Writer.TryComplete();
        try { _stream.Dispose(); } catch (Exception) { }
        _completion.TrySetResult();
    }

    public ValueTask DisposeAsync()
    {
        Close();
        return ValueTask.CompletedTask;
    }
}
