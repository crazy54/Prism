using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace PrismRelay;

/// <summary>Paths and identity. Mirrors PrismControl.Desktop.DesktopPaths (no reference: the relay stands alone).</summary>
internal static class RelayEnv
{
    public const string DirEnv = "PRISM_CONTROL_DIR";

    public static string UserDirectory
    {
        get
        {
            var overridden = Environment.GetEnvironmentVariable(DirEnv);
            if (!string.IsNullOrWhiteSpace(overridden)) return Path.GetFullPath(overridden);
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Prism", "control");
        }
    }

    public static string IngressFile(string module) => Path.Combine(UserDirectory, "modules", module, "ingress.json");

    /// <summary>"0.1.0" (the assembly version, from Directory.Build.props VersionPrefix).</summary>
    public static string Version
    {
        get
        {
            var v = typeof(RelayEnv).Assembly.GetName().Version;
            return v is null ? "0.0.0" : $"{v.Major}.{v.Minor}.{v.Build}";
        }
    }
}

/// <summary>The contents of an ingress.json discovery file that matter to the relay.</summary>
internal sealed record Discovery(string Pipe, string Token, int Pid, string? OtelToken)
{
    /// <summary>Reads and validates the file (shared read/write/delete, so the plugin's atomic replace never blocks). Null on any problem.</summary>
    public static Discovery? TryRead(string path)
    {
        try
        {
            byte[] bytes;
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (fs.Length is 0 or > 64 * 1024) return null;
                bytes = new byte[fs.Length];
                fs.ReadExactly(bytes);
            }
            using var doc = JsonDocument.Parse(bytes);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("pipe", out var pipe) || pipe.ValueKind != JsonValueKind.String) return null;
            if (!root.TryGetProperty("token", out var token) || token.ValueKind != JsonValueKind.String) return null;
            var p = pipe.GetString()!;
            var t = token.GetString()!;
            if (!IsPipeName(p) || t.Length is < 16 or > 256) return null;
            var pid = root.TryGetProperty("pid", out var pidEl) && pidEl.TryGetInt32(out var x) ? x : 0;
            var otel = root.TryGetProperty("otelToken", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null;
            return new Discovery(p, t, pid, otel);
        }
        catch (Exception) { return null; }
    }

    /// <summary>"prism-control-&lt;name&gt;-&lt;hex&gt;": letters, digits and '-' only, so it can never escape \\.\pipe\.</summary>
    internal static bool IsPipeName(string s) =>
        s.Length is > 14 and <= 96 && s.StartsWith("prism-control-", StringComparison.Ordinal) && s.All(c => char.IsAsciiLetterOrDigit(c) || c == '-');
}

internal static partial class PipeConnector
{
    private const int ErrorFileNotFound = 2;

    [LibraryImport("kernel32.dll", EntryPoint = "WaitNamedPipeW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial int WaitNamedPipe(string name, uint timeout);

    /// <summary>
    /// Connects with <see cref="PipeOptions.CurrentUserOnly"/> (the client verifies that the server's owner is this
    /// user, which defeats squatting by another user). A pipe that does not exist fails at once (WaitNamedPipe answers
    /// ERROR_FILE_NOT_FOUND in ~0.2 ms; NamedPipeClientStream.Connect would spin for the whole timeout). Null on failure.
    /// </summary>
    public static async Task<NamedPipeClientStream?> TryConnectAsync(string pipe, TimeSpan timeout, CancellationToken ct)
    {
        if (!Discovery.IsPipeName(pipe)) return null;
        if (WaitNamedPipe(@"\\.\pipe\" + pipe, 1) == 0 && Marshal.GetLastPInvokeError() == ErrorFileNotFound) return null;
        var client = new NamedPipeClientStream(".", pipe, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        try
        {
            await client.ConnectAsync((int)timeout.TotalMilliseconds, ct).ConfigureAwait(false);
            return client;
        }
        catch (Exception ex) when (ex is TimeoutException or IOException or UnauthorizedAccessException or Win32Exception or OperationCanceledException)
        {
            await client.DisposeAsync().ConfigureAwait(false);
            return null;
        }
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial int GetNamedPipeServerProcessId(nint pipe, out uint pid);

    /// <summary>
    /// <see cref="TryConnectAsync(string, TimeSpan, CancellationToken)"/>, then checks that the server process is the one
    /// the discovery file names (<c>GetNamedPipeServerProcessId == expectedServerPid</c>). A pid ≤ 0, an unreadable server
    /// pid or a mismatch disconnects and returns null: nothing (in particular the token) is ever written to such a server.
    /// </summary>
    public static async Task<NamedPipeClientStream?> TryConnectAsync(string pipe, TimeSpan timeout, int expectedServerPid, CancellationToken ct)
    {
        if (expectedServerPid <= 0) return null;
        var client = await TryConnectAsync(pipe, timeout, ct).ConfigureAwait(false);
        if (client is null) return null;
        if (ServerPidOf(client) == (uint)expectedServerPid) return client;
        await client.DisposeAsync().ConfigureAwait(false);
        return null;
    }

    /// <summary>The pipe server's process id, or 0 when it cannot be read.</summary>
    internal static uint ServerPidOf(NamedPipeClientStream client)
    {
        try
        {
            var h = client.SafePipeHandle;
            var added = false;
            h.DangerousAddRef(ref added);
            try { return GetNamedPipeServerProcessId(h.DangerousGetHandle(), out var pid) != 0 ? pid : 0; }
            finally { if (added) h.DangerousRelease(); }
        }
        catch (Exception ex) when (ex is ObjectDisposedException or InvalidOperationException) { return 0; }
    }
}

/// <summary>One process in the ancestor chain: pid, exe file name, creation time (UTC ms; 0 when unreadable).</summary>
internal readonly record struct ProcEntry(uint Pid, string Exe, long StartedAtMs);

/// <summary>Read-only process-tree walking (one Toolhelp snapshot; creation times guard against pid reuse).</summary>
internal static unsafe partial class ProcessTree
{
    private const uint Th32csSnapProcess = 0x2, ProcessQueryLimitedInformation = 0x1000;

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESSENTRY32W
    {
        public uint dwSize, cntUsage, th32ProcessID;
        public nuint th32DefaultHeapID;
        public uint th32ModuleID, cntThreads, th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        public fixed char szExeFile[260];
    }

    [LibraryImport("kernel32.dll")] private static partial nint CreateToolhelp32Snapshot(uint flags, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int Process32FirstW(nint snap, PROCESSENTRY32W* e);
    [LibraryImport("kernel32.dll")] private static partial int Process32NextW(nint snap, PROCESSENTRY32W* e);
    [LibraryImport("kernel32.dll")] private static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] private static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int GetProcessTimes(nint h, out long creation, out long exit, out long kernel, out long user);
    [LibraryImport("kernel32.dll")] private static partial int GetExitCodeProcess(nint h, out uint code);

    public static Dictionary<uint, (uint Parent, string Exe)> Snapshot()
    {
        var map = new Dictionary<uint, (uint, string)>();
        var snap = CreateToolhelp32Snapshot(Th32csSnapProcess, 0);
        if (snap is 0 or -1) return map;
        try
        {
            PROCESSENTRY32W e = default;
            e.dwSize = (uint)sizeof(PROCESSENTRY32W);
            if (Process32FirstW(snap, &e) == 0) return map;
            do map[e.th32ProcessID] = (e.th32ParentProcessID, new string(e.szExeFile));
            while (Process32NextW(snap, &e) != 0);
        }
        finally { CloseHandle(snap); }
        return map;
    }

    /// <summary>Creation time in UTC ms since the Unix epoch, or 0.</summary>
    public static long StartedAtMs(uint pid)
    {
        var h = OpenProcess(ProcessQueryLimitedInformation, 0, pid);
        if (h == 0) return 0;
        try
        {
            if (GetProcessTimes(h, out var c, out _, out _, out _) == 0 || c <= 0) return 0;
            return DateTimeOffset.FromFileTime(c).ToUnixTimeMilliseconds();
        }
        finally { CloseHandle(h); }
    }

    /// <summary>True when the process exists and has not exited (STILL_ACTIVE).</summary>
    public static bool IsAlive(int pid)
    {
        if (pid <= 0) return false;
        var h = OpenProcess(ProcessQueryLimitedInformation, 0, (uint)pid);
        if (h == 0) return false;
        try { return GetExitCodeProcess(h, out var code) != 0 && code == 259; }
        finally { CloseHandle(h); }
    }

    /// <summary>
    /// Our ancestors, parent first, at most <paramref name="max"/>. Stops at a pid we cannot see, a cycle, or a parent
    /// that was created after its child (the real parent exited and its pid was reused).
    /// </summary>
    public static List<ProcEntry> Ancestors(int max = 16)
    {
        var map = Snapshot();
        var chain = new List<ProcEntry>();
        var self = (uint)Environment.ProcessId;
        var childStart = StartedAtMs(self);
        var seen = new HashSet<uint> { self };
        var pid = map.TryGetValue(self, out var me) ? me.Parent : 0;
        while (pid != 0 && chain.Count < max && seen.Add(pid) && map.TryGetValue(pid, out var p))
        {
            var start = StartedAtMs(pid);
            if (start != 0 && childStart != 0 && start > childStart) break;
            chain.Add(new ProcEntry(pid, p.Exe, start));
            childStart = start;
            pid = p.Parent;
        }
        return chain;
    }
}
