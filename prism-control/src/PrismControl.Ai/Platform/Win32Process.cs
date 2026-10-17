using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using PrismControl.Ai.Sessions;
using PrismControl.Core.Hosting;

namespace PrismControl.Ai.Platform;

/// <summary>Read-only process tree facts from a Toolhelp32 snapshot + GetProcessTimes. Never throws for OS failures.</summary>
public sealed unsafe partial class Win32ProcessTree : IProcessTree
{
    private const uint TH32CS_SNAPPROCESS = 0x2;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    public ProcessIdentity? Identity(int pid)
    {
        if (pid <= 0) return null;
        var start = CreationMs(pid);
        if (start == 0) return null;
        return new ProcessIdentity(pid, start, ImageName(pid) ?? "");
    }

    /// <summary>
    /// The parent chain, walked link by link (NtQueryInformationProcess: parent pid and the creation-time image name), which costs
    /// a few OpenProcess calls instead of a snapshot of every process (review L10: the ingress verifies every hook event this way,
    /// and the relay waits for that). Falls back to the snapshot walk when a parent exists but can't be read.
    /// </summary>
    public IReadOnlyList<ProcessIdentity> Ancestors(int pid, int max = 16)
    {
        try
        {
            if (WalkParents(pid, max, out var complete) is { } fast && complete) return fast;
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { }
        return SnapshotAncestors(pid, max);
    }

    private const int ProcessBasicInformation = 0, ProcessImageFileName = 27, ErrorInvalidParameter = 87;
    private const uint StillActive = 259;

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_BASIC_INFORMATION
    {
        public nint ExitStatus, PebBaseAddress, AffinityMask, BasePriority;
        public nuint UniqueProcessId, InheritedFromUniqueProcessId;
    }

    private readonly record struct Link(int Parent, long StartedAtMs, string? Exe, bool Gone);

    private static Link Query(int pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
        if (h == 0) return new Link(0, 0, null, Marshal.GetLastPInvokeError() == ErrorInvalidParameter);
        try
        {
            if (GetExitCodeProcess(h, out var code) && code != StillActive) return new Link(0, 0, null, true);
            PROCESS_BASIC_INFORMATION pbi = default;
            var parent = NtQueryInformationProcess(h, ProcessBasicInformation, &pbi, sizeof(PROCESS_BASIC_INFORMATION), out _) == 0 ? (int)pbi.InheritedFromUniqueProcessId : 0;
            var start = GetProcessTimes(h, out var created, out _, out _, out _) ? DateTime.FromFileTimeUtc(created).Subtract(DateTime.UnixEpoch).Ticks / TimeSpan.TicksPerMillisecond : 0;
            const int size = 2048;
            var buf = stackalloc byte[size];
            string? exe = null;
            if (NtQueryInformationProcess(h, ProcessImageFileName, buf, size, out _) == 0)
            {
                var len = *(ushort*)buf / 2;
                var text = *(char**)(buf + 8);
                if (len > 0 && text != null) exe = Path.GetFileName(new string(text, 0, len));
            }
            return new Link(parent, start, exe, false);
        }
        finally { CloseHandle(h); }
    }

    private static List<ProcessIdentity>? WalkParents(int pid, int max, out bool complete)
    {
        complete = true;
        var result = new List<ProcessIdentity>();
        var me = Query(pid);
        if (me.Exe is null) { complete = false; return null; }
        var seen = new HashSet<int> { pid };
        var cur = me.Parent;
        var curStart = me.StartedAtMs;
        while (cur > 0 && result.Count < max && seen.Add(cur))
        {
            var p = Query(cur);
            if (p.Gone) break;
            if (p.Exe is null) { complete = false; return null; }
            if (p.StartedAtMs == 0 || (curStart != 0 && p.StartedAtMs > curStart)) break;   // a reused pid: never followed
            result.Add(new ProcessIdentity(cur, p.StartedAtMs, p.Exe));
            curStart = p.StartedAtMs;
            cur = p.Parent;
        }
        return result;
    }

    private IReadOnlyList<ProcessIdentity> SnapshotAncestors(int pid, int max)
    {
        var table = Snapshot();
        var result = new List<ProcessIdentity>();
        var cur = pid;
        var curStart = CreationMs(pid);
        for (var i = 0; i < max; i++)
        {
            if (!table.TryGetValue(cur, out var row) || row.Parent <= 0 || row.Parent == cur) break;
            var parentStart = CreationMs(row.Parent);
            // A parent created after its child is a reused pid: stop (contract: never follow it).
            if (parentStart == 0 || (curStart != 0 && parentStart > curStart)) break;
            var exe = table.TryGetValue(row.Parent, out var prow) ? prow.Exe : "";
            result.Add(new ProcessIdentity(row.Parent, parentStart, exe));
            cur = row.Parent;
            curStart = parentStart;
        }
        return result;
    }

    public bool AnyRunning(string imageName) => Snapshot().Values.Any(r => string.Equals(r.Exe, imageName, StringComparison.OrdinalIgnoreCase));

    public static long CreationMs(int pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
        if (h == 0) return 0;
        try
        {
            if (!GetProcessTimes(h, out var created, out _, out _, out _)) return 0;
            return DateTime.FromFileTimeUtc(created).Subtract(DateTime.UnixEpoch).Ticks / TimeSpan.TicksPerMillisecond;
        }
        finally { CloseHandle(h); }
    }

    private static string? ImageName(int pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
        if (h == 0) return null;
        try
        {
            var buf = stackalloc char[1024];
            uint len = 1024;
            return QueryFullProcessImageNameW(h, 0, buf, ref len) ? Path.GetFileName(new string(buf, 0, (int)len)) : null;
        }
        finally { CloseHandle(h); }
    }

    private static Dictionary<int, (int Parent, string Exe)> Snapshot()
    {
        var map = new Dictionary<int, (int, string)>();
        var snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == 0 || snap == -1) return map;
        try
        {
            var e = new PROCESSENTRY32W { dwSize = (uint)sizeof(PROCESSENTRY32W) };
            if (!Process32FirstW(snap, ref e)) return map;
            do
            {
                var name = new string(e.szExeFile, 0, IndexOfNul(e.szExeFile, 260));
                map[(int)e.th32ProcessID] = ((int)e.th32ParentProcessID, name);
            } while (Process32NextW(snap, ref e));
        }
        finally { CloseHandle(snap); }
        return map;
    }

    private static int IndexOfNul(char* s, int max)
    {
        for (var i = 0; i < max; i++) if (s[i] == '\0') return i;
        return max;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PROCESSENTRY32W
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public nuint th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        public fixed char szExeFile[260];
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint CreateToolhelp32Snapshot(uint flags, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32FirstW(nint snapshot, ref PROCESSENTRY32W entry);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32NextW(nint snapshot, ref PROCESSENTRY32W entry);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetProcessTimes(nint process, out long creation, out long exit, out long kernel, out long user);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool QueryFullProcessImageNameW(nint process, uint flags, char* buffer, ref uint size);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseHandle(nint handle);

    [LibraryImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetExitCodeProcess(nint process, out uint code);

    [LibraryImport("ntdll.dll")]
    private static partial int NtQueryInformationProcess(nint process, int infoClass, void* info, int length, out int returned);
}

/// <summary>
/// Instant exit notifications (the process handle's wait, via <see cref="Process.Exited"/>) with the pid-reuse guard: a pid
/// whose creation time differs from the expected one is not the same process. Processes we cannot wait on (elevated)
/// are checked every 5 s instead. Read-only.
/// </summary>
public sealed class ProcessExitWatcher : IProcessWatcher
{
    private readonly object _gate = new();
    private readonly Dictionary<ProcessIdentity, Process?> _watched = new();
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly ITimer _poll;

    public ProcessExitWatcher(TimeProvider time, ILog log)
    {
        _time = time;
        _log = log;
        _poll = time.CreateTimer(_ => PollUnwatchable(), null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
    }

    public event Action<ProcessIdentity, DateTimeOffset>? Exited;

    public ProcessIdentity? Watch(int pid, long expectedStartMs, string image)
    {
        var start = Win32ProcessTree.CreationMs(pid);
        if (start == 0) return null;
        if (expectedStartMs != 0 && Math.Abs(start - expectedStartMs) > 1000) return null;   // a reused pid
        var id = new ProcessIdentity(pid, start, image);
        lock (_gate)
        {
            if (_watched.Keys.Any(k => k.SameAs(id))) return id;
            Process? p = null;
            try
            {
                p = Process.GetProcessById(pid);
                p.EnableRaisingEvents = true;
                p.Exited += (_, _) => OnExited(id);
                if (p.HasExited) { p.Dispose(); return null; }
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                p?.Dispose();
                p = null;   // poll it instead
            }
            _watched[id] = p;
        }
        return id;
    }

    private void OnExited(ProcessIdentity id)
    {
        lock (_gate)
        {
            if (!_watched.Remove(id, out var p)) return;
            p?.Dispose();
        }
        _log.Debug($"process {id.Image} exited");
        Exited?.Invoke(id, _time.GetUtcNow());
    }

    private void PollUnwatchable()
    {
        List<ProcessIdentity> polled;
        lock (_gate) polled = _watched.Where(kv => kv.Value is null).Select(kv => kv.Key).ToList();
        foreach (var id in polled)
        {
            var start = Win32ProcessTree.CreationMs(id.Pid);
            if (start == 0 || Math.Abs(start - id.StartedAtMs) > 1000) OnExited(id);
        }
    }

    public void Dispose()
    {
        _poll.Dispose();
        lock (_gate)
        {
            foreach (var p in _watched.Values) p?.Dispose();
            _watched.Clear();
        }
    }
}

/// <summary>
/// Runs read-only CLIs (<c>claude agents --json</c>, <c>orca … --json</c>): no window, stdout captured up to a cap, stderr
/// drained and discarded (it can hold content, so it is never logged), the working directory off the plugin folder, and the
/// whole process tree killed at the timeout.
/// </summary>
public sealed class CliRunner(ILog log) : ICommandRunner
{
    public async Task<CommandResult> RunAsync(CommandSpec spec, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(spec.File)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetTempPath(),
        };
        foreach (var a in spec.Args) psi.ArgumentList.Add(a);
        if (spec.Environment is not null)
            foreach (var (k, v) in spec.Environment) psi.Environment[k] = v;
        Process? p = null;
        try
        {
            p = Process.Start(psi);
            if (p is null) return CommandResult.NotStarted;
            p.StandardInput.Close();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(spec.Timeout);
            var stderr = p.StandardError.BaseStream.CopyToAsync(Stream.Null, timeout.Token);
            var stdout = ReadCappedAsync(p.StandardOutput, spec.MaxOutputBytes, timeout.Token);
            try
            {
                await p.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
                var text = await stdout.ConfigureAwait(false);
                try { await stderr.ConfigureAwait(false); } catch (Exception) { }
                return new CommandResult(true, p.ExitCode, text, false);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                try { p.Kill(entireProcessTree: true); } catch (Exception) { }
                return new CommandResult(true, null, "", true);
            }
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            log.Debug($"could not run {Path.GetFileName(spec.File)}: {ex.GetType().Name}");
            return CommandResult.NotStarted;
        }
        finally
        {
            if (p is not null && !p.HasExited) { try { p.Kill(entireProcessTree: true); } catch (Exception) { } }
            p?.Dispose();
        }
    }

    private static async Task<string> ReadCappedAsync(StreamReader reader, int cap, CancellationToken ct)
    {
        var sb = new StringBuilder();
        var buf = new char[8192];
        int n;
        while ((n = await reader.ReadAsync(buf.AsMemory(), ct).ConfigureAwait(false)) > 0)
        {
            if (sb.Length + n > cap) { sb.Append(buf, 0, Math.Max(0, cap - sb.Length)); await reader.BaseStream.CopyToAsync(Stream.Null, ct).ConfigureAwait(false); break; }
            sb.Append(buf, 0, n);
        }
        return sb.ToString();
    }

    /// <summary>PATH, then the known per-user install locations (Claude Code native install, Orca).</summary>
    public string? Find(string exeName)
    {
        if (!exeName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) exeName += ".exe";
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            try
            {
                var candidate = Path.Combine(dir.Trim('"'), exeName);
                // claude.exe is also Claude Desktop's packaged image: never mistake it for the Claude Code CLI.
                if (candidate.Contains(@"\WindowsApps\", StringComparison.OrdinalIgnoreCase)) continue;
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException) { }
        }
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] known = exeName.ToLowerInvariant() switch
        {
            "claude.exe" => [Path.Combine(home, ".local", "bin", "claude.exe")],
            "orca.exe" => [Path.Combine(local, "Programs", "orca", "resources", "bin", "orca.exe")],
            _ => [],
        };
        return known.FirstOrDefault(File.Exists);
    }
}
