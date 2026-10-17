namespace PrismControl.Desktop.Interop;

/// <summary>Read-only facts about a process: image path, integrity level, elevation, package AUMID, parent. Never throws.</summary>
internal static unsafe class ProcessInfo
{
    /// <summary>Integrity RIDs: 0x1000 low, 0x2000 medium, 0x3000 high, 0x4000 system.</summary>
    public const int MediumIntegrity = 0x2000;

    private static int _ownIntegrity = -3;

    /// <summary>Our own integrity level (Medium for a Stream Deck plugin). An unreadable token counts as Medium.</summary>
    public static int OwnIntegrity
    {
        get
        {
            if (_ownIntegrity == -3)
            {
                var il = Integrity(Kernel32.GetCurrentProcess(), out _);
                _ownIntegrity = il >= 0 ? il : MediumIntegrity;
            }
            return _ownIntegrity;
        }
    }

    public static string? ImagePath(uint pid)
    {
        if (pid == 0) return null;
        var h = Kernel32.OpenProcess(Kernel32.PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return null;
        try { return ImagePathOf(h); }
        finally { Kernel32.CloseHandle(h); }
    }

    public static string? ImagePathOf(nint process)
    {
        var buf = stackalloc char[1024];
        uint len = 1024;
        return Kernel32.QueryFullProcessImageNameW(process, 0, buf, ref len) != 0 ? new string(buf, 0, (int)len) : null;
    }

    /// <summary>
    /// The process's integrity RID, or -1 when its token cannot be read and -2 when the process cannot be opened.
    /// </summary>
    public static int Integrity(uint pid, out bool elevated)
    {
        elevated = false;
        var h = Kernel32.OpenProcess(Kernel32.PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return -2;
        try { return Integrity(h, out elevated); }
        finally { Kernel32.CloseHandle(h); }
    }

    public static int Integrity(nint process, out bool elevated)
    {
        elevated = false;
        if (Advapi32.OpenProcessToken(process, Advapi32.TOKEN_QUERY, out var token) == 0) return -1;
        try
        {
            uint e;
            if (Advapi32.GetTokenInformation(token, Advapi32.TokenElevation, &e, 4, out _) != 0) elevated = e != 0;
            var buf = stackalloc byte[64];
            if (Advapi32.GetTokenInformation(token, Advapi32.TokenIntegrityLevel, buf, 64, out _) == 0) return -1;
            var sid = *(nint*)buf; // TOKEN_MANDATORY_LABEL.Label.Sid
            var count = *Advapi32.GetSidSubAuthorityCount(sid);
            return count == 0 ? -1 : (int)*Advapi32.GetSidSubAuthority(sid, (uint)(count - 1));
        }
        finally { Kernel32.CloseHandle(token); }
    }

    /// <summary>
    /// True when Windows' UIPI would drop our messages and input to this process: its integrity is above ours, or we
    /// cannot even read it (protected and system processes). Same rule as Macros' foreground inspector.
    /// </summary>
    public static bool IsAboveUs(uint pid)
    {
        if (pid == 0) return false;
        if (pid == (uint)Environment.ProcessId) return false;
        var il = Integrity(pid, out _);
        return il < 0 || il > OwnIntegrity;
    }

    /// <summary>The package AUMID of a packaged process (null for Win32 apps).</summary>
    public static string? ApplicationUserModelId(uint pid)
    {
        var h = Kernel32.OpenProcess(Kernel32.PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return null;
        try
        {
            uint len = 512;
            var buf = stackalloc char[512];
            return Kernel32.GetApplicationUserModelId(h, ref len, buf) == 0 && len > 1 ? new string(buf, 0, (int)len - 1) : null;
        }
        finally { Kernel32.CloseHandle(h); }
    }

    /// <summary>Process creation time (FILETIME ticks), or 0 when unreadable.</summary>
    public static long CreationTime(uint pid)
    {
        var h = Kernel32.OpenProcess(Kernel32.PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (h == 0) return 0;
        try { return Kernel32.GetProcessTimes(h, out var c, out _, out _, out _) != 0 ? c.Ticks : 0; }
        finally { Kernel32.CloseHandle(h); }
    }

    /// <summary>pid → (parent pid, exe file name) for every process, from one Toolhelp snapshot.</summary>
    public static Dictionary<uint, (uint Parent, string Exe)> Snapshot()
    {
        var map = new Dictionary<uint, (uint, string)>();
        var snap = Kernel32.CreateToolhelp32Snapshot(Kernel32.TH32CS_SNAPPROCESS, 0);
        if (snap == 0 || snap == -1) return map;
        try
        {
            PROCESSENTRY32W e = default;
            e.dwSize = (uint)sizeof(PROCESSENTRY32W);
            if (Kernel32.Process32FirstW(snap, &e) == 0) return map;
            do
            {
                map[e.th32ProcessID] = (e.th32ParentProcessID, new string(e.szExeFile));
            } while (Kernel32.Process32NextW(snap, &e) != 0);
        }
        finally { Kernel32.CloseHandle(snap); }
        return map;
    }

    /// <summary>
    /// Our parent process (pid and exe name), guarded against pid reuse: the parent must have been created before us.
    /// </summary>
    public static (uint Pid, string Exe)? Parent(uint pid)
    {
        var map = Snapshot();
        if (!map.TryGetValue(pid, out var me) || me.Parent == 0 || !map.TryGetValue(me.Parent, out var parent)) return null;
        var mine = CreationTime(pid);
        var theirs = CreationTime(me.Parent);
        if (mine != 0 && theirs != 0 && theirs > mine) return null;
        return (me.Parent, parent.Exe);
    }
}
