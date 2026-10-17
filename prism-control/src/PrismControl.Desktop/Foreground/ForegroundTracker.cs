using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>
/// Which foreground windows count as "external" (a real app the user was working in). Excluded: this process, the Stream
/// Deck app (it hosts the plugin; a deck press never makes it foreground, but its own window can be), and transient
/// shell surfaces the user passes through (taskbar, task switcher, foreground staging), so "the previous window" survives
/// a click on the taskbar.
/// </summary>
public sealed class ForegroundFilter
{
    public static readonly IReadOnlySet<string> DefaultExcludedProcesses =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "StreamDeck.exe" };

    public static readonly IReadOnlySet<string> DefaultExcludedClasses = new HashSet<string>(StringComparer.Ordinal)
    {
        "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "ForegroundStaging", "MultitaskingViewFrame", "XamlExplorerHostIslandWindow",
        "TaskSwitcherWnd", "TaskSwitcherOverlayWnd", "NotifyIconOverflowWindow", "TopLevelWindowForOverflowXamlIsland",
    };

    public required uint OwnPid { get; init; }
    public IReadOnlySet<string> ExcludedProcesses { get; init; } = DefaultExcludedProcesses;
    public IReadOnlySet<string> ExcludedClasses { get; init; } = DefaultExcludedClasses;

    public static ForegroundFilter ForThisProcess() => new() { OwnPid = (uint)Environment.ProcessId };

    public bool IsExternal(uint pid, string? exeName, string className)
    {
        if (pid == 0 || pid == OwnPid) return false;
        if (exeName is not null && ExcludedProcesses.Contains(exeName)) return false;
        return !ExcludedClasses.Contains(className);
    }
}

/// <summary>
/// Tracks <see cref="IForegroundService.LastExternalForeground"/> with SetWinEventHook(EVENT_SYSTEM_FOREGROUND) on the
/// shell thread. Keeps the last 8 external windows, so when the newest one closes or hides, the one before it is returned.
/// </summary>
public sealed class ForegroundTracker : IDisposable
{
    private const uint EventSystemForeground = 0x0003;
    private const int HistorySize = 8;

    private readonly object _gate = new();
    private readonly List<nint> _history = [];
    private readonly ForegroundFilter _filter;
    private readonly Func<nint, (uint Pid, string? Exe, string Class)> _describe;
    private readonly Func<nint, bool> _isUsable;
    private readonly ShellThread? _shell;
    private readonly Dictionary<uint, string?> _exeByPid = new();
    private nint _hook;

    public ForegroundTracker(ShellThread shell, ILog? log = null, ForegroundFilter? filter = null)
        : this(filter ?? ForegroundFilter.ForThisProcess(), null, null, shell)
    {
        var l = (log ?? NullLog.Instance).For("foreground");
        Observe(User32.GetForegroundWindow());
        _ = shell.InvokeAsync(() =>
        {
            _hook = shell.AddWinEventHook(EventSystemForeground, EventSystemForeground, (_, hwnd, idObject, idChild, _, _) =>
            {
                if (idObject == 0 && idChild == 0) Observe(hwnd);
            });
            if (_hook == 0) l.Warn("SetWinEventHook(EVENT_SYSTEM_FOREGROUND) failed; the previous window will not be tracked.");
        });
    }

    /// <summary>Test constructor: <paramref name="describe"/> and <paramref name="isUsable"/> replace the Win32 reads.</summary>
    internal ForegroundTracker(ForegroundFilter filter, Func<nint, (uint, string?, string)>? describe, Func<nint, bool>? isUsable, ShellThread? shell = null)
    {
        _filter = filter;
        _describe = describe ?? Describe;
        _isUsable = isUsable ?? (h => User32.IsWindow(h) != 0 && User32.IsWindowVisible(h) != 0);
        _shell = shell;
    }

    /// <summary>The most recent external foreground window that still exists and is visible, or 0.</summary>
    public nint LastExternal
    {
        get
        {
            nint[] snapshot;
            lock (_gate) snapshot = [.. _history];
            foreach (var h in snapshot)
                if (_isUsable(h)) return h;
            return 0;
        }
    }

    /// <summary>Feeds one foreground change (the hook callback; tests call it directly).</summary>
    internal void Observe(nint hwnd)
    {
        if (hwnd == 0) return;
        var (pid, exe, cls) = _describe(hwnd);
        if (!_filter.IsExternal(pid, exe, cls)) return;
        lock (_gate)
        {
            _history.Remove(hwnd);
            _history.Insert(0, hwnd);
            if (_history.Count > HistorySize) _history.RemoveAt(_history.Count - 1);
        }
    }

    private (uint, string?, string) Describe(nint hwnd)
    {
        User32.GetWindowThreadProcessId(hwnd, out var pid);
        string? exe;
        lock (_gate)
        {
            if (!_exeByPid.TryGetValue(pid, out exe))
            {
                var path = ProcessInfo.ImagePath(pid);
                exe = path is null ? null : Path.GetFileName(path);
                if (_exeByPid.Count > 256) _exeByPid.Clear();
                _exeByPid[pid] = exe;
            }
        }
        return (pid, exe, User32.ClassName(hwnd));
    }

    public void Dispose()
    {
        if (_shell is null || _hook == 0) return;
        var hook = _hook;
        _hook = 0;
        try { _ = _shell.InvokeAsync(() => _shell.RemoveWinEventHook(hook)); }
        catch (ObjectDisposedException) { }
    }
}
