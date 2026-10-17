using System.Runtime.InteropServices;

namespace PrismControl.Ai.Platform;

/// <summary>
/// Is anybody at the PC (review M5, ai-apps.md §6.5)? Read-only: the Windows session's lock state and the time since the last
/// keyboard/mouse input. A request is not held on the deck while the session is locked or the user has been away longer than
/// the deck's sleep timeout: the agent's own prompt takes over at once.
/// </summary>
public interface IUserPresence
{
    /// <summary>The interactive session is locked or disconnected (false when it can't be told).</summary>
    bool SessionLocked { get; }
    /// <summary>Time since the last keyboard or mouse input in this session (zero when it can't be told).</summary>
    TimeSpan IdleFor { get; }
}

/// <summary>WTSQuerySessionInformation(WTSSessionInfoEx) for the lock state, GetLastInputInfo for the idle time.</summary>
public sealed partial class Win32UserPresence : IUserPresence
{
    private const int WTSSessionInfoEx = 25;
    private const int WTS_SESSIONSTATE_LOCK = 0;
    private const int WTSActive = 0;

    public bool SessionLocked
    {
        get
        {
            try
            {
                if (!WTSQuerySessionInformationW(0, -1, WTSSessionInfoEx, out var buffer, out var bytes) || buffer == 0) return false;
                try
                {
                    // WTSINFOEXW { DWORD Level; (pad: the union holds LARGE_INTEGERs) WTSINFOEX_LEVEL1_W { ULONG SessionId;
                    // WTS_CONNECTSTATE_CLASS SessionState; LONG SessionFlags; … } }: SessionId at 8, state at 12, flags at 16.
                    // The session id must be ours, else the layout is not what we think: "can't tell".
                    if (bytes < 20 || Marshal.ReadInt32(buffer) != 1) return false;
                    if (Marshal.ReadInt32(buffer, 8) != CurrentSessionId()) return false;
                    var state = Marshal.ReadInt32(buffer, 12);
                    var flags = Marshal.ReadInt32(buffer, 16);
                    return state != WTSActive || flags == WTS_SESSIONSTATE_LOCK;
                }
                finally { WTSFreeMemory(buffer); }
            }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { return false; }
        }
    }

    public TimeSpan IdleFor
    {
        get
        {
            var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
            if (!GetLastInputInfo(ref info)) return TimeSpan.Zero;
            var idle = unchecked((uint)Environment.TickCount - info.dwTime);
            return TimeSpan.FromMilliseconds(idle);
        }
    }

    private static int CurrentSessionId()
    {
        using var p = System.Diagnostics.Process.GetCurrentProcess();
        return p.SessionId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetLastInputInfo(ref LASTINPUTINFO info);

    [LibraryImport("wtsapi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool WTSQuerySessionInformationW(nint server, int sessionId, int infoClass, out nint buffer, out uint bytes);

    [LibraryImport("wtsapi32.dll")]
    private static partial void WTSFreeMemory(nint memory);
}
