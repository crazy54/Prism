using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace PrismControl.Cooling.Icue.QtRo;

/// <summary>
/// A read-only Qt Remote Objects ("QtRO 2.0") client over a Windows named pipe (QLocalSocket on the server side).
/// Wire format verified against qtremoteobjects 6.7.1 and 6.9.3 (research/icue-probe/qtro-src):
/// <code>
/// packet = quint32 sizeOfRest | quint16 type | payload                (little-endian)
/// server → client on connect: Handshake("QtRO 2.0"), ObjectList([{name, type, signature}])
/// client → server: AddObject(name, isDynamic=true) ⇒ InitDynamicPacket(definition + property values)
/// client → server: InvokePacket(name, call=0, methodIndex, [QVariant args], serialId, propertyIndex=-1)
/// server → client: InvokeReplyPacket(name, serialId, QVariant); InvokePacket(...) for signals
/// </code>
/// One background loop reads every packet; replies complete the matching invoke, signals go to
/// <see cref="SignalReceived"/> (called on the read loop, so handlers must be quick and must not await an invoke).
/// SAFETY: <see cref="InvokeAsync"/> refuses anything not in <see cref="IcueSafety"/>; the only other packet ever
/// written is AddObject.
/// </summary>
internal sealed partial class QtRoClient : IAsyncDisposable
{
    public const int MaxPacketBytes = 16 * 1024 * 1024;

    private readonly Stream _stream;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private readonly ConcurrentDictionary<int, TaskCompletionSource<object?>> _pending = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<QClassDef>> _acquires = new(StringComparer.Ordinal);
    private readonly TaskCompletionSource<IReadOnlyList<QtRoObjectInfo>> _objects = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly QVariantDecoder _decoder = new();
    private readonly Task _readLoop;
    private int _serial;
    private int _disposed;

    private QtRoClient(Stream stream, string name)
    {
        _stream = stream;
        Name = name;
        _readLoop = Task.Run(ReadLoopAsync);
    }

    /// <summary>The pipe (or test stream) name.</summary>
    public string Name { get; }
    public string? ProtocolVersion { get; private set; }
    /// <summary>Completes when the server closes the connection (or the client is disposed). Never faults.</summary>
    public Task Completion => _readLoop;
    /// <summary>The reason the read loop ended (null while running or after a clean close).</summary>
    public Exception? Fault { get; private set; }
    /// <summary>Packets that could not be decoded and were skipped.</summary>
    public int DecodeErrors => Volatile.Read(ref _decodeErrors);
    private int _decodeErrors;
    /// <summary>Packets written: AddObject + allowlisted InvokePackets only (tests assert this).</summary>
    public int PacketsWritten => Volatile.Read(ref _written);
    private int _written;

    /// <summary>(objectName, signalIndex, args). Runs on the read loop.</summary>
    public Action<string, int, IReadOnlyList<object?>>? SignalReceived { get; set; }
    /// <summary>Raised when the server removes an object we hold a replica of (treat it like a disconnect).</summary>
    public Action<string>? ObjectRemoved { get; set; }

    /// <summary>
    /// Connects to <c>\\.\pipe\<paramref name="pipeName"/></c>. The pipe is opened with
    /// <see cref="TokenImpersonationLevel.Identification"/>, so whoever serves it can identify this user but never act as
    /// them (a squatting server would otherwise impersonate us once we write). <paramref name="verifyServer"/> gets the
    /// serving process id (null if unknown) and runs BEFORE a single byte is read; it throws to refuse the server.
    /// </summary>
    public static async Task<QtRoClient> ConnectAsync(string pipeName, TimeSpan timeout, CancellationToken ct, Action<int?>? verifyServer = null)
    {
        var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        try
        {
            await pipe.ConnectAsync((int)Math.Clamp(timeout.TotalMilliseconds, 1, 60_000), ct).ConfigureAwait(false);
            verifyServer?.Invoke(ServerPid(pipe));
        }
        catch
        {
            await pipe.DisposeAsync().ConfigureAwait(false);
            throw;
        }
        return new QtRoClient(pipe, pipeName);
    }

    /// <summary>For tests: a client over any duplex stream.</summary>
    internal static QtRoClient FromStream(Stream stream, string name = "test") => new(stream, name);

    /// <summary>The process id serving the pipe (null for non-pipe streams or on failure).</summary>
    public int? ServerProcessId => _stream is NamedPipeClientStream p ? ServerPid(p) : null;

    private static int? ServerPid(NamedPipeClientStream p)
    {
        if (!p.IsConnected) return null;
        try { return GetNamedPipeServerProcessId(p.SafePipeHandle, out var pid) ? (int)pid : null; }
        catch (ObjectDisposedException) { return null; }
    }

    /// <summary>Waits for the server's ObjectList (sent right after the handshake).</summary>
    public Task<IReadOnlyList<QtRoObjectInfo>> WaitObjectsAsync(TimeSpan timeout, CancellationToken ct) =>
        _objects.Task.WaitAsync(timeout, ct);

    /// <summary>Acquires a dynamic replica of <paramref name="objectName"/>: returns its class definition and property values.</summary>
    public async Task<QClassDef> AcquireAsync(string objectName, TimeSpan timeout, CancellationToken ct)
    {
        var tcs = _acquires.GetOrAdd(objectName, _ => new TaskCompletionSource<QClassDef>(TaskCreationOptions.RunContinuationsAsynchronously));
        await WriteAsync(QtRoPacket.Build(QtRoPacketType.AddObject, w => w.QString(objectName).Bool(true)), ct).ConfigureAwait(false);
        return await tcs.Task.WaitAsync(timeout, ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Invokes an ALLOWLISTED read method by exact signature (e.g. <c>"getSensorValue(QString)"</c>) with string
    /// arguments and returns the decoded reply. Throws <see cref="IcueSafetyException"/> (before anything is written)
    /// for any other method.
    /// </summary>
    public async Task<object?> InvokeAsync(QClassDef def, string objectName, string signature, IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct)
    {
        IcueSafety.EnsureAllowed(def.TypeName, signature);
        var expected = ParamCount(signature);
        if (expected != args.Count || (expected > 0 && !signature.EndsWith("(QString)", StringComparison.Ordinal)))
            throw new IcueSafetyException($"Refusing {signature}: only QString arguments are supported ({args.Count} given).");
        var index = def.MethodIndex(signature);
        if (index < 0) throw new KeyNotFoundException($"{def.TypeName} has no method {signature} (unsupported iCUE version?).");

        var serial = Interlocked.Increment(ref _serial);
        var tcs = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[serial] = tcs;
        try
        {
            var packet = QtRoPacket.Build(QtRoPacketType.InvokePacket, w =>
            {
                w.QString(objectName).S32(0 /* InvokeMetaMethod: never WriteProperty */).S32(index).U32((uint)args.Count);
                foreach (var a in args) w.VariantString(a);
                w.S32(serial).S32(-1);
            });
            await WriteAsync(packet, ct).ConfigureAwait(false);
            return await tcs.Task.WaitAsync(timeout, ct).ConfigureAwait(false);
        }
        finally { _pending.TryRemove(serial, out _); }
    }

    public Task<object?> InvokeAsync(QClassDef def, string objectName, string signature, TimeSpan timeout, CancellationToken ct) =>
        InvokeAsync(def, objectName, signature, [], timeout, ct);

    private static int ParamCount(string signature)
    {
        var open = signature.IndexOf('(');
        var inner = open < 0 ? "" : signature[(open + 1)..].TrimEnd(')');
        return inner.Length == 0 ? 0 : inner.Count(c => c == ',') + 1;
    }

    private async Task WriteAsync(byte[] packet, CancellationToken ct)
    {
        if (Volatile.Read(ref _disposed) != 0) throw new ObjectDisposedException(nameof(QtRoClient));
        await _writeGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await _stream.WriteAsync(packet, ct).ConfigureAwait(false);
            await _stream.FlushAsync(ct).ConfigureAwait(false);
            Interlocked.Increment(ref _written);
        }
        finally { _writeGate.Release(); }
    }

    // ------------------------------------------------------------------ read loop

    private async Task ReadLoopAsync()
    {
        var ct = _cts.Token;
        var header = new byte[4];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await _stream.ReadExactlyAsync(header, ct).ConfigureAwait(false);
                var size = BinaryPrimitives.ReadUInt32LittleEndian(header);
                if (size < 2 || size > MaxPacketBytes) throw new InvalidDataException($"Bad QtRO packet size {size}.");
                var body = new byte[size];
                await _stream.ReadExactlyAsync(body, ct).ConfigureAwait(false);
                Dispatch(body);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (EndOfStreamException) { }
        catch (Exception ex)
        {
            // Anything else (a decoder or handler bug included) ends this connection; Completion itself never faults.
            Fault = ex;
        }
        finally
        {
            var closed = new IOException("The iCUE pipe closed.");
            foreach (var p in _pending.Values) p.TrySetException(closed);
            foreach (var a in _acquires.Values) a.TrySetException(closed);
            _objects.TrySetException(closed);
        }
    }

    private void Dispatch(byte[] body)
    {
        var r = new QReader(body, bigEndian: false);
        var type = (QtRoPacketType)r.U16();
        try
        {
            switch (type)
            {
                case QtRoPacketType.Handshake:
                    ProtocolVersion = r.QString();
                    break;
                case QtRoPacketType.ObjectList:
                {
                    var n = r.Count(4096);
                    var list = new List<QtRoObjectInfo>(n);
                    for (var i = 0; i < n; i++) list.Add(new QtRoObjectInfo(r.QString() ?? "", r.QString() ?? "", r.QBytes()));
                    _objects.TrySetResult(list);
                    break;
                }
                case QtRoPacketType.InitDynamicPacket:
                {
                    var name = r.QString() ?? "";
                    QClassDef def;
                    try
                    {
                        def = _decoder.ParseDefinition(r);
                        var np = r.Count();
                        for (var i = 0; i < np; i++) def.PropValues.Add(_decoder.ReadVariant(r));
                    }
                    catch (FormatException ex)
                    {
                        if (_acquires.TryGetValue(name, out var failed)) failed.TrySetException(ex);
                        throw;
                    }
                    if (_acquires.TryGetValue(name, out var tcs)) tcs.TrySetResult(def);
                    break;
                }
                case QtRoPacketType.InvokeReplyPacket:
                {
                    r.QString();
                    var serial = r.S32();
                    if (!_pending.TryGetValue(serial, out var tcs)) break;
                    try { tcs.TrySetResult(_decoder.ReadVariant(r)); }
                    catch (FormatException ex) { tcs.TrySetException(ex); throw; }
                    break;
                }
                case QtRoPacketType.InvokePacket:
                {
                    // A signal from the source. Skip the decode entirely when nobody listens.
                    var handler = SignalReceived;
                    if (handler is null) break;
                    var name = r.QString() ?? "";
                    r.S32(); // call
                    var index = r.S32();
                    var argc = r.Count(64);
                    var args = new List<object?>(argc);
                    for (var i = 0; i < argc; i++) args.Add(_decoder.ReadVariant(r));
                    handler(name, index, args);
                    break;
                }
                case QtRoPacketType.RemoveObject:
                    ObjectRemoved?.Invoke(r.QString() ?? "");
                    break;
                // PropertyChangePacket, InitPacket, Ping, Pong: nothing to do for a read-only sensor client.
            }
        }
        catch (FormatException)
        {
            Interlocked.Increment(ref _decodeErrors); // the packet is length-delimited, so the stream stays aligned
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        _cts.Cancel();
        try { await _stream.DisposeAsync().ConfigureAwait(false); } catch (IOException) { }
        try { await _readLoop.ConfigureAwait(false); } catch (Exception) { }
        _cts.Dispose();
        _writeGate.Dispose();
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint serverProcessId);
}
