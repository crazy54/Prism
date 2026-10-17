using System.Runtime.InteropServices;

namespace PrismRelay.Hook;

/// <summary>
/// Review L10: the hook relay's process ancestry without a Toolhelp snapshot. The snapshot of every process on the machine was
/// the relay's biggest cost (≈ 50–80 ms in-process on this PC, more under load: aaa-prism-play/ai-fix/NOTES.md); walking the
/// parent links one process at a time costs a few OpenProcess calls. Same contract as <see cref="ProcessTree.Ancestors"/>:
/// parent first, at most <c>max</c>, exe names as at process creation (a renamed exe, e.g. Claude's self-update moving
/// claude.exe aside, still reads "claude.exe"), stops at a parent that exited, a cycle, or a parent created after its child
/// (pid reuse). When a parent exists but can't be read (another user's or a protected process), it falls back to the snapshot.
/// </summary>
internal static unsafe partial class ParentWalk
{
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const int ProcessBasicInformation = 0, ProcessImageFileName = 27;
    private const int ErrorInvalidParameter = 87;   // OpenProcess: no such process (the chain simply ends there)
    private const uint StillActive = 259;

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_BASIC_INFORMATION
    {
        public nint ExitStatus;
        public nint PebBaseAddress;
        public nint AffinityMask;
        public nint BasePriority;
        public nuint UniqueProcessId;
        public nuint InheritedFromUniqueProcessId;
    }

    [LibraryImport("ntdll.dll")] private static partial int NtQueryInformationProcess(nint process, int infoClass, void* info, int length, out int returned);
    [LibraryImport("kernel32.dll", SetLastError = true)] private static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] private static partial int GetProcessTimes(nint h, out long creation, out long exit, out long kernel, out long user);
    [LibraryImport("kernel32.dll")] private static partial int GetExitCodeProcess(nint h, out uint code);

    /// <summary>Where the last walk stopped and why (tests and diagnostics only; never printed by the relay).</summary>
    internal static string? LastStop;

    public static List<ProcEntry> Ancestors(int max = 16)
    {
        try
        {
            var chain = Walk(max, out var complete);
            return complete ? chain : ProcessTree.Ancestors(max);
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { return ProcessTree.Ancestors(max); }
    }

    /// <param name="complete">False when a parent exists but could not be read (the caller then uses the snapshot walk).</param>
    internal static List<ProcEntry> Walk(int max, out bool complete)
    {
        complete = true;
        LastStop = null;
        var chain = new List<ProcEntry>();
        var self = (uint)Environment.ProcessId;
        var me = Query(self);
        if (me.Exe is null || me.Parent is null) { complete = false; return chain; }
        var seen = new HashSet<uint> { self };
        var childStart = me.StartedAtMs;
        var pid = me.Parent.Value;
        while (pid != 0 && chain.Count < max && seen.Add(pid))
        {
            var p = Query(pid);
            if (p.Gone) { LastStop = $"{pid}: exited"; break; }                     // explorer's parent (userinit), typically
            if (p.Exe is null) { complete = false; LastStop = $"{pid}: unreadable"; break; }
            if (p.StartedAtMs != 0 && childStart != 0 && p.StartedAtMs > childStart) { LastStop = $"{pid}: reused"; break; }
            chain.Add(new ProcEntry(pid, p.Exe, p.StartedAtMs));
            childStart = p.StartedAtMs;
            pid = p.Parent ?? 0;
        }
        return chain;
    }

    private readonly record struct Info(uint? Parent, long StartedAtMs, string? Exe, bool Gone);

    /// <summary>One process: parent pid, creation time (UTC ms), exe file name at creation; Gone when it doesn't exist (any more).</summary>
    private static Info Query(uint pid)
    {
        var h = OpenProcess(ProcessQueryLimitedInformation, 0, pid);
        if (h == 0) return new Info(null, 0, null, Marshal.GetLastPInvokeError() == ErrorInvalidParameter);
        try
        {
            if (GetExitCodeProcess(h, out var code) != 0 && code != StillActive) return new Info(null, 0, null, true);
            PROCESS_BASIC_INFORMATION pbi = default;
            uint? parent = NtQueryInformationProcess(h, ProcessBasicInformation, &pbi, sizeof(PROCESS_BASIC_INFORMATION), out _) == 0 ? (uint)pbi.InheritedFromUniqueProcessId : null;
            var start = GetProcessTimes(h, out var c, out _, out _, out _) != 0 && c > 0 ? DateTimeOffset.FromFileTime(c).ToUnixTimeMilliseconds() : 0;
            // ProcessImageFileName: the NT path the process was created from (a UNICODE_STRING followed by its buffer).
            const int size = 2048;
            var buf = stackalloc byte[size];
            string? exe = null;
            if (NtQueryInformationProcess(h, ProcessImageFileName, buf, size, out _) == 0)
            {
                var len = *(ushort*)buf / 2;
                var text = *(char**)(buf + 8);
                if (len > 0 && text != null)
                {
                    var full = new string(text, 0, len);
                    var slash = full.LastIndexOf('\\');
                    exe = slash >= 0 ? full[(slash + 1)..] : full;
                }
            }
            return new Info(parent, start, exe, false);
        }
        finally { CloseHandle(h); }
    }
}
