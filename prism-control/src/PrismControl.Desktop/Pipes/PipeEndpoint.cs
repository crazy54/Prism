using System.ComponentModel;
using System.Globalization;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

public sealed class PipeEndpointOptions
{
    /// <summary>"browser" or "ai" (lowercase letters, digits, '-'; ≤ 32). The pipe is \\.\pipe\prism-control-&lt;name&gt;-&lt;random 128-bit hex&gt;.</summary>
    public required string Name { get; set; }

    /// <summary>Concurrent connections (listening + connected instances). 1–64.</summary>
    public int MaxInstances { get; set; } = 8;

    /// <summary>The largest frame body in either direction: browser 1 MB, ai 64 KB.</summary>
    public int MaxFrameBytes { get; set; } = 1 << 20;

    /// <summary>The hello (first frame) must arrive within this after connecting; any later frame must complete within it once its first byte arrived. Idle sessions are not timed out.</summary>
    public TimeSpan ReadTimeout { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>Where to publish {v, pipe, token, pid, startedAt}, e.g. DesktopPaths.IngressFile("ai"). Null = no file (tests).</summary>
    public string? DiscoveryFile { get; set; }
}

/// <summary>A per-user named-pipe server for relay clients. Real: <see cref="PipeEndpoint"/>.</summary>
public interface IPipeEndpoint : IAsyncDisposable
{
    /// <summary>The pipe name without the \\.\pipe\ prefix (what NamedPipeClientStream takes), e.g. "prism-control-ai-3f…".</summary>
    string PipeName { get; }

    /// <summary>
    /// Raised once per authenticated client connection, on the thread pool. Read and write frames until you are done;
    /// the session is closed when the returned task completes. Subscribe before <see cref="PipeEndpoint.StartAsync(CancellationToken)"/>.
    /// </summary>
    event Func<PipeSession, Task>? SessionOpened;
}

/// <summary>
/// The pipe server (contract §1.4). Security:
/// <list type="bullet">
/// <item>CreateNamedPipeW with a DACL that allows only the current user's SID and denies NETWORK (S-1-5-2), the owner set
/// to the current user (so <c>PipeOptions.CurrentUserOnly</c> clients accept it), <c>PIPE_REJECT_REMOTE_CLIENTS</c>, and
/// <c>FILE_FLAG_FIRST_PIPE_INSTANCE</c> (a squatter that pre-created the name makes us pick another name);</item>
/// <item>a fresh 128-bit random name and 256-bit token on every start;</item>
/// <item>the client's first frame must carry <c>token</c> (constant-time compare) within <see cref="PipeEndpointOptions.ReadTimeout"/>, else it is dropped unseen;</item>
/// <item>the discovery file is written atomically after listening, readable by the current user only, and deleted on
/// dispose only if it still holds our token.</item>
/// </list>
/// It never interprets messages (beyond the token): the modules do. Safe mode does not apply (reads are reads).
/// </summary>
public sealed partial class PipeEndpoint : IPipeEndpoint
{
    private const uint PipeAccessDuplex = 0x3, FileFlagOverlapped = 0x40000000, FileFlagFirstPipeInstance = 0x80000;
    private const uint PipeRejectRemoteClients = 0x8;
    private const int BufferSize = 64 * 1024;

    private readonly PipeEndpointOptions _options;
    private readonly ILog _log;
    private readonly CancellationTokenSource _stop = new();
    private readonly byte[] _securityDescriptor;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<PipeSession, byte> _sessions = new();
    private SemaphoreSlim? _slots;
    private Task? _acceptLoop;
    private string _token = "";
    private string _pipeName = "";
    private int _active, _rejected, _started, _disposed;

    public PipeEndpoint(PipeEndpointOptions options, ILog? log = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        Validate(options);
        _options = options;
        _log = (log ?? NullLog.Instance).For("pipe:" + options.Name);
        _securityDescriptor = BuildSecurityDescriptor();
    }

    /// <summary>Creates, subscribes <paramref name="onSession"/>, and starts an endpoint.</summary>
    public static async Task<PipeEndpoint> StartAsync(PipeEndpointOptions options, Func<PipeSession, Task> onSession, ILog? log = null, CancellationToken ct = default)
    {
        var ep = new PipeEndpoint(options, log);
        ep.SessionOpened += onSession;
        await ep.StartAsync(ct).ConfigureAwait(false);
        return ep;
    }

    public event Func<PipeSession, Task>? SessionOpened;

    public string PipeName => _pipeName;

    /// <summary>\\.\pipe\&lt;PipeName&gt;.</summary>
    public string PipePath => @"\\.\pipe\" + _pipeName;

    /// <summary>Constant-time check of a token against this endpoint's (for a module's own auxiliary listener, e.g. OTLP Bearer).</summary>
    public bool CheckToken(string? given) => _token.Length > 0 && PipeFraming.TokenEquals(given, _token);

    public int ActiveSessions => Volatile.Read(ref _active);

    /// <summary>Clients dropped for a missing or wrong token, or a bad or late hello.</summary>
    public int RejectedClients => Volatile.Read(ref _rejected);

    /// <summary>Tests: supplies pipe names (to simulate a squatter that took the first one).</summary>
    internal Func<string>? NameFactory { get; set; }

    /// <summary>The token (tests only; never log it).</summary>
    internal string Token => _token;

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,31}$")]
    private static partial Regex NamePattern();

    private static void Validate(PipeEndpointOptions o)
    {
        if (string.IsNullOrEmpty(o.Name) || !NamePattern().IsMatch(o.Name)) throw new ArgumentException("Name must be 1–32 lowercase letters, digits or '-'.", nameof(o));
        if (o.MaxInstances is < 1 or > 64) throw new ArgumentOutOfRangeException(nameof(o), "MaxInstances must be 1–64.");
        if (o.MaxFrameBytes is < 16 or > 64 * 1024 * 1024) throw new ArgumentOutOfRangeException(nameof(o), "MaxFrameBytes must be 16 B–64 MB.");
        if (o.ReadTimeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(o), "ReadTimeout must be positive.");
    }

    /// <summary>Starts listening, then publishes the discovery file. Throws if the pipe cannot be created.</summary>
    public Task StartAsync(CancellationToken ct = default)
    {
        if (Interlocked.Exchange(ref _started, 1) != 0) throw new InvalidOperationException("The endpoint is already started.");
        ct.ThrowIfCancellationRequested();
        _token = PipeFraming.NewToken();
        _slots = new SemaphoreSlim(_options.MaxInstances, _options.MaxInstances);
        NamedPipeServerStream? first = null;
        Exception? last = null;
        for (var attempt = 0; attempt < 4 && first is null; attempt++)
        {
            _pipeName = NameFactory?.Invoke() ?? $"prism-control-{_options.Name}-{PipeFraming.NewNameSuffix()}";
            try { first = CreateInstance(firstInstance: true); }
            catch (Win32Exception ex) { last = ex; _log.Warn($"Pipe name taken or refused ({ex.NativeErrorCode}); retrying with a new name."); }
        }
        if (first is null) throw new IOException("Could not create the pipe.", last);
        _slots.Wait(0); // the first instance holds a slot
        _acceptLoop = Task.Run(() => AcceptLoopAsync(first));
        if (_options.DiscoveryFile is { } file)
        {
            DiscoveryFile.Write(file, new JsonObject
            {
                ["v"] = 1,
                ["pipe"] = _pipeName,
                ["token"] = _token,
                ["pid"] = Environment.ProcessId,
                ["startedAt"] = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture),
            });
        }
        _log.Info($"Listening on a per-user pipe (max {_options.MaxInstances} clients, {_options.MaxFrameBytes} B frames).");
        return Task.CompletedTask;
    }

    private async Task AcceptLoopAsync(NamedPipeServerStream first)
    {
        var ct = _stop.Token;
        NamedPipeServerStream? next = first;
        var slotHeld = true;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!slotHeld) { await _slots!.WaitAsync(ct).ConfigureAwait(false); slotHeld = true; }
                next ??= CreateInstance(firstInstance: false);
                await next.WaitForConnectionAsync(ct).ConfigureAwait(false);
                var connected = next;
                next = null;
                slotHeld = false;
                _ = Task.Run(() => HandleConnectionAsync(connected));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // A client that connected and vanished, or a transient CreateNamedPipe failure: start over with a fresh instance.
                _log.Debug("Pipe accept: " + ex.GetType().Name + ": " + ex.Message);
                next?.Dispose();
                next = null;
                try { await Task.Delay(50, ct).ConfigureAwait(false); } catch (OperationCanceledException) { break; }
            }
        }
        next?.Dispose();
    }

    private async Task HandleConnectionAsync(NamedPipeServerStream stream)
    {
        PipeSession? session = null;
        Interlocked.Increment(ref _active);
        try
        {
            int? pid = Kernel32.GetNamedPipeClientProcessId(stream.SafePipeHandle.DangerousGetHandle(), out var p) != 0 ? (int)p : null;
            JsonNode? hello;
            try { hello = await PipeSession.ReadFrameAsync(stream, _options, wholeFrameTimeout: true, _stop.Token).ConfigureAwait(false); }
            catch (PipeFrameException ex) { Reject(pid, ex.Message); return; }
            if (hello is not JsonObject obj || obj["token"] is not JsonValue tv || !tv.TryGetValue<string>(out var token) || !PipeFraming.TokenEquals(token, _token))
            {
                Reject(pid, hello is null ? "no hello" : "missing or wrong token");
                return;
            }
            obj.Remove("token");
            session = new PipeSession(stream, _options, pid, pid is { } id ? ProcessInfo.ImagePath((uint)id) : null, obj, _log);
            var handlers = SessionOpened?.GetInvocationList().Cast<Func<PipeSession, Task>>().ToArray() ?? [];
            if (handlers.Length == 0)
            {
                _log.Debug("A client connected but no module subscribed; closing it.");
                return;
            }
            _sessions.TryAdd(session, 0);
            session.StartReading();
            await Task.WhenAll(handlers.Select(h => InvokeSafely(h, session))).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException)
        {
            _log.Debug("Pipe session ended: " + ex.GetType().Name);
        }
        finally
        {
            if (session is not null) { _sessions.TryRemove(session, out _); session.Close(); }
            try { stream.Dispose(); } catch (Exception) { }
            Interlocked.Decrement(ref _active);
            try { _slots!.Release(); } catch (ObjectDisposedException) { }
        }
    }

    private async Task InvokeSafely(Func<PipeSession, Task> handler, PipeSession session)
    {
        try { await handler(session).ConfigureAwait(false); }
        catch (Exception ex) { _log.Warn("A pipe session handler threw " + ex.GetType().Name + ": " + ex.Message, ex); }
    }

    private void Reject(int? pid, string why)
    {
        Interlocked.Increment(ref _rejected);
        _log.Warn($"Rejected a pipe client (pid {pid?.ToString(CultureInfo.InvariantCulture) ?? "?"}): {why}.");
    }

    private unsafe NamedPipeServerStream CreateInstance(bool firstInstance)
    {
        fixed (byte* sd = _securityDescriptor)
        {
            var sa = new SECURITY_ATTRIBUTES { nLength = sizeof(SECURITY_ATTRIBUTES), lpSecurityDescriptor = (nint)sd };
            var openMode = PipeAccessDuplex | FileFlagOverlapped | (firstInstance ? FileFlagFirstPipeInstance : 0);
            var h = Kernel32.CreateNamedPipeW(@"\\.\pipe\" + _pipeName, openMode, PipeRejectRemoteClients /* byte mode, wait */,
                (uint)_options.MaxInstances, BufferSize, BufferSize, 0, &sa);
            if (h == -1 || h == 0) throw new Win32Exception(Marshal.GetLastPInvokeError());
            return new NamedPipeServerStream(PipeDirection.InOut, isAsync: true, isConnected: false, new SafePipeHandle(h, ownsHandle: true));
        }
    }

    /// <summary>Owner = current user; DACL (protected) = deny NETWORK full control, allow current user full control.</summary>
    internal static byte[] BuildSecurityDescriptor()
    {
        var me = WindowsIdentity.GetCurrent().User ?? throw new InvalidOperationException("No current user SID.");
        var sec = new PipeSecurity();
        sec.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        sec.SetOwner(me);
        sec.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        // Least privilege: read/write (clients), create-instance (this server, for instances 2..N) and synchronize.
        // No WRITE_DAC / WRITE_OWNER / DELETE for anyone. OWNER RIGHTS replaces the owner's implicit READ_CONTROL +
        // WRITE_DAC, so even the owner cannot rewrite the DACL of a live pipe.
        sec.AddAccessRule(new PipeAccessRule(me, AllowedRights, AccessControlType.Allow));
        sec.AddAccessRule(new PipeAccessRule(OwnerRightsSid, AllowedRights, AccessControlType.Allow));
        return sec.GetSecurityDescriptorBinaryForm();
    }

    /// <summary>What the current user (and OWNER RIGHTS) may do on the pipe.</summary>
    internal const PipeAccessRights AllowedRights = PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance | PipeAccessRights.Synchronize;

    /// <summary>S-1-3-4 OWNER RIGHTS.</summary>
    internal static readonly SecurityIdentifier OwnerRightsSid = new("S-1-3-4");

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        if (_options.DiscoveryFile is { } file && _token.Length > 0) DiscoveryFile.DeleteIfOurs(file, _token);
        _stop.Cancel();
        foreach (var s in _sessions.Keys) s.Close();
        if (_acceptLoop is not null)
        {
            try { await _acceptLoop.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); }
            catch (Exception) { }
        }
    }
}

/// <summary>
/// The discovery file {v, pipe, token, pid, startedAt}: written atomically (temp file + rename) with a protected DACL
/// that allows only the current user, and deleted only if it still holds our token (a newer instance may own it).
/// </summary>
public static class DiscoveryFile
{
    public static void Write(string path, JsonObject content)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Directory.CreateDirectory(dir);
        var tmp = Path.Combine(dir, $".{Path.GetFileName(path)}.{Environment.ProcessId}.{PipeFraming.NewNameSuffix()[..8]}.tmp");
        var bytes = System.Text.Encoding.UTF8.GetBytes(content.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        try
        {
            var security = new FileSecurity();
            var me = WindowsIdentity.GetCurrent().User!;
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            security.SetOwner(me);
            security.AddAccessRule(new FileSystemAccessRule(me, FileSystemRights.FullControl, AccessControlType.Allow));
            using (var fs = new FileInfo(tmp).Create(FileMode.CreateNew, FileSystemRights.FullControl, FileShare.None, 4096, FileOptions.None, security))
            {
                fs.Write(bytes);
                fs.Flush(flushToDisk: true);
            }
            for (var attempt = 0; ; attempt++)
            {
                try { File.Move(tmp, path, overwrite: true); break; }
                catch (IOException) when (attempt < 10) { Thread.Sleep(20); } // a reader holds it without FILE_SHARE_DELETE
                catch (UnauthorizedAccessException) when (attempt < 10) { Thread.Sleep(20); }
            }
        }
        finally
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); } catch (Exception) { }
        }
    }

    /// <summary>Reads a discovery file (shared read/write/delete, so it never blocks a replace). Null when missing or unreadable.</summary>
    public static JsonObject? Read(string path)
    {
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (fs.Length > 64 * 1024) return null;
            return JsonNode.Parse(fs) as JsonObject;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Text.Json.JsonException) { return null; }
    }

    /// <summary>Deletes <paramref name="path"/> only if its token equals <paramref name="token"/> (constant-time).</summary>
    public static bool DeleteIfOurs(string path, string token)
    {
        try
        {
            var o = Read(path);
            if (o?["token"] is JsonValue v && v.TryGetValue<string>(out var t) && PipeFraming.TokenEquals(t, token))
            {
                File.Delete(path);
                return true;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        return false;
    }
}
