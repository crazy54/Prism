using System.Runtime.InteropServices;

namespace PrismControl.Macros.Engine;

public enum ForegroundVerdict
{
    /// <summary>The foreground app runs at our integrity level or lower: input reaches it.</summary>
    Allowed,
    /// <summary>The foreground app runs at a higher integrity level (usually "as administrator"): Windows drops our input silently (UIPI).</summary>
    Blocked,
    /// <summary>No foreground window (the PC is locked, a UAC prompt or another secure desktop is showing, or focus is changing).</summary>
    NoWindow,
}

/// <summary>What owns the foreground window, and whether injected input can reach it.</summary>
public sealed record ForegroundInfo(ForegroundVerdict Verdict, uint ProcessId, string? ProcessName, int Integrity, bool Elevated, int OwnIntegrity)
{
    public static ForegroundInfo Allowed(string? name = null, uint pid = 0) => new(ForegroundVerdict.Allowed, pid, name, 0x2000, false, 0x2000);

    /// <summary>A sentence for the log and the property inspector.</summary>
    public string Describe() => Verdict switch
    {
        ForegroundVerdict.Blocked => $"{ProcessName ?? "The app in front"} runs as administrator; Windows blocks input from non-admin apps. Run it without admin rights, or focus another window.",
        ForegroundVerdict.NoWindow => "No app has focus (the PC may be locked or a Windows security prompt is open), so the input would be lost.",
        _ => $"{ProcessName ?? "The app in front"} accepts input.",
    };

    public static string IntegrityName(int rid) => rid switch
    {
        >= 0x4000 => "System",
        >= 0x3000 => "High",
        >= 0x2100 => "Medium+",
        >= 0x2000 => "Medium",
        >= 0x1000 => "Low",
        >= 0 => "Untrusted",
        _ => "unknown",
    };
}

/// <summary>Reads the foreground window's integrity level before input is sent (research/windows.md §3.3). Read-only.</summary>
public interface IForegroundInspector
{
    ForegroundInfo Inspect();
}

/// <summary>
/// GetForegroundWindow → GetWindowThreadProcessId → OpenProcess(QUERY_LIMITED) → OpenProcessToken(TOKEN_QUERY) →
/// TokenIntegrityLevel / TokenElevation. A token we cannot open (ACCESS_DENIED) counts as higher integrity.
/// </summary>
internal sealed unsafe partial class Win32ForegroundInspector : IForegroundInspector
{
    private int _own = -2;

    public int OwnIntegrity
    {
        get
        {
            if (_own == -2)
            {
                var il = ProcessIntegrity(GetCurrentProcess(), out _);
                _own = il >= 0 ? il : 0x2000; // unreadable (never seen): assume the Stream Deck default, Medium
            }
            return _own;
        }
    }

    public ForegroundInfo Inspect()
    {
        var own = OwnIntegrity;
        var hwnd = GetForegroundWindow();
        if (hwnd == 0) return new ForegroundInfo(ForegroundVerdict.NoWindow, 0, null, -1, false, own);
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0) return new ForegroundInfo(ForegroundVerdict.NoWindow, 0, null, -1, false, own);

        var h = OpenProcess(ProcessQueryLimitedInformation, 0, pid);
        if (h == 0)
        {
            // Protected or otherwise inaccessible: treat as higher integrity (input would be dropped).
            return new ForegroundInfo(ForegroundVerdict.Blocked, pid, null, -1, false, own);
        }
        try
        {
            var name = ImageName(h);
            var il = ProcessIntegrity(h, out var elevated);
            var blocked = il >= 0 ? il > own : true;
            return new ForegroundInfo(blocked ? ForegroundVerdict.Blocked : ForegroundVerdict.Allowed, pid, name, il, elevated, own);
        }
        finally { CloseHandle(h); }
    }

    private static int ProcessIntegrity(nint process, out bool elevated)
    {
        elevated = false;
        if (OpenProcessToken(process, TokenQuery, out var token) == 0) return -1;
        try
        {
            uint e;
            if (GetTokenInformation(token, TokenElevationClass, &e, 4, out _) != 0) elevated = e != 0;
            var buf = stackalloc byte[64];
            if (GetTokenInformation(token, TokenIntegrityLevelClass, buf, 64, out _) == 0) return -1;
            var sid = *(nint*)buf; // TOKEN_MANDATORY_LABEL.Label.Sid
            var count = *GetSidSubAuthorityCount(sid);
            return count == 0 ? -1 : (int)*GetSidSubAuthority(sid, (uint)(count - 1));
        }
        finally { CloseHandle(token); }
    }

    private static string? ImageName(nint process)
    {
        var buf = stackalloc char[1024];
        uint len = 1024;
        if (QueryFullProcessImageNameW(process, 0, buf, ref len) == 0) return null;
        return Path.GetFileName(new string(buf, 0, (int)len));
    }

    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const uint TokenQuery = 0x0008;
    private const int TokenElevationClass = 20;
    private const int TokenIntegrityLevelClass = 25;

    [LibraryImport("user32.dll")] private static partial nint GetForegroundWindow();
    [LibraryImport("user32.dll")] private static partial uint GetWindowThreadProcessId(nint hwnd, out uint pid);
    [LibraryImport("kernel32.dll")] private static partial nint GetCurrentProcess();
    [LibraryImport("kernel32.dll", SetLastError = true)] private static partial nint OpenProcess(uint access, int inherit, uint pid);
    [LibraryImport("kernel32.dll")] private static partial int CloseHandle(nint h);
    [LibraryImport("kernel32.dll")] private static partial int QueryFullProcessImageNameW(nint h, uint flags, char* buf, ref uint size);
    [LibraryImport("advapi32.dll", SetLastError = true)] private static partial int OpenProcessToken(nint h, uint access, out nint token);
    [LibraryImport("advapi32.dll", SetLastError = true)] private static partial int GetTokenInformation(nint token, int cls, void* info, uint len, out uint ret);
    [LibraryImport("advapi32.dll")] private static partial byte* GetSidSubAuthorityCount(nint sid);
    [LibraryImport("advapi32.dll")] private static partial uint* GetSidSubAuthority(nint sid, uint index);
}
