using System.Runtime.InteropServices;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>What Windows says about games right now.</summary>
public sealed record GameState(int NotificationState, int EffectivePowerMode, bool ForegroundCoversMonitor)
{
    public static readonly GameState Idle = new(5, -1, false);

    /// <summary>QUNS_RUNNING_D3D_FULL_SCREEN: an exclusive-fullscreen Direct3D app (a game) is in front.</summary>
    public bool D3DFullscreen => NotificationState == 3;
    /// <summary>QUNS_BUSY: a fullscreen app (borderless game, video, presentation) is in front.</summary>
    public bool BusyFullscreen => NotificationState == 2;
    public bool PresentationMode => NotificationState == 4;
    /// <summary>EFFECTIVE_POWER_MODE_GAME_MODE (5): Windows Game Mode is boosting a game.</summary>
    public bool GameModeActive => EffectivePowerMode == 5;

    /// <summary>Gaming: exclusive fullscreen D3D, or Game Mode, or a borderless app covering its whole monitor.</summary>
    public bool IsGaming => D3DFullscreen || GameModeActive || (BusyFullscreen && ForegroundCoversMonitor);

    public string Describe() => D3DFullscreen ? "Fullscreen game" : GameModeActive ? "Game Mode" : BusyFullscreen && ForegroundCoversMonitor ? "Fullscreen app" : PresentationMode ? "Presenting" : "Desktop";
}

public interface IGameStateReader : IDisposable
{
    GameState Read();
}

/// <summary>
/// SHQueryUserNotificationState (verified: 5 = accepts notifications here) + PowerRegisterForEffectivePowerModeNotifications
/// (V2; the callback fires once at registration with the current mode, then on every change). Reads only.
/// </summary>
internal sealed unsafe class Win32GameStateReader : IGameStateReader
{
    private static volatile int s_powerMode = -1;
    private static int s_refs;
    private static nint s_handle;
    private static readonly object Gate = new();

    public Win32GameStateReader()
    {
        lock (Gate)
        {
            if (s_refs++ == 0)
            {
                nint h;
                if (Native.PowerRegisterForEffectivePowerModeNotifications(2, &OnPowerMode, 0, &h) == 0) s_handle = h;
            }
        }
    }

    [UnmanagedCallersOnly]
    private static void OnPowerMode(int mode, nint ctx) => s_powerMode = mode;

    public GameState Read()
    {
        Native.SHQueryUserNotificationState(out var quns);
        return new GameState(quns, s_powerMode, quns == 2 && ForegroundCoversMonitor());
    }

    private static bool ForegroundCoversMonitor()
    {
        var fg = Native.GetForegroundWindow();
        if (fg == 0 || fg == Native.GetShellWindow()) return false;
        using var dpi = ThreadDpi.PerMonitorV2();
        if (Native.GetWindowRect(fg, out var r) == 0) return false;
        var mon = Native.MonitorFromWindow(fg, Native.MONITOR_DEFAULTTONEAREST);
        var mi = new MONITORINFOEXW { cbSize = (uint)sizeof(MONITORINFOEXW) };
        if (Native.GetMonitorInfoW(mon, &mi) == 0) return false;
        var m = mi.rcMonitor;
        return r.Left <= m.Left && r.Top <= m.Top && r.Right >= m.Right && r.Bottom >= m.Bottom;
    }

    public void Dispose()
    {
        lock (Gate)
        {
            if (--s_refs == 0 && s_handle != 0)
            {
                Native.PowerUnregisterFromEffectivePowerModeNotifications(s_handle);
                s_handle = 0;
            }
        }
    }
}

/// <summary>Game-mode detection for the indicator key and for calming other keys (thumbnails slow down while gaming).</summary>
public sealed class GameModeService : IDisposable
{
    public static readonly TimeSpan Poll = TimeSpan.FromSeconds(2);

    private readonly IGameStateReader _reader;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private GameState _state = GameState.Idle;
    private long _readAt;
    private ITimer? _timer;

    public GameModeService(IGameStateReader reader, TimeProvider time)
    {
        _reader = reader;
        _time = time;
    }

    public event Action? Changed;

    /// <summary>Starts the 2 s poll (cheap: one shell call). Changes raise <see cref="Changed"/>.</summary>
    public void Start()
    {
        lock (_gate) _timer ??= _time.CreateTimer(_ => Current(TimeSpan.Zero), null, TimeSpan.Zero, Poll);
    }

    public GameState Current(TimeSpan? maxAge = null)
    {
        lock (_gate)
        {
            if (_readAt != 0 && _time.GetElapsedTime(_readAt) < (maxAge ?? Poll)) return _state;
        }
        GameState s;
        try { s = _reader.Read(); }
        catch { s = GameState.Idle; }
        bool changed;
        lock (_gate)
        {
            changed = _readAt != 0 && s != _state;
            _state = s;
            _readAt = _time.GetTimestamp();
        }
        if (changed) Changed?.Invoke();
        return s;
    }

    public bool IsGaming => Current().IsGaming;

    public void Dispose()
    {
        lock (_gate)
        {
            _timer?.Dispose();
            _timer = null;
        }
        _reader.Dispose();
    }
}
