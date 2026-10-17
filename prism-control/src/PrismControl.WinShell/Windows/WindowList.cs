using PrismControl.Desktop;

namespace PrismControl.WinShell.Switcher;

/// <summary>
/// The alt-tab list every switcher key and the browser share. Desktop's catalog costs about 1 ms per window, so the list
/// is enumerated at most every <see cref="MinInterval"/> and otherwise only when the catalog's WinEvents say something
/// changed (or every <see cref="MaxAge"/> as a safety net). Changes are coalesced into one <see cref="Changed"/>. A
/// most-recently-activated order is tracked from foreground changes. Windows on other virtual desktops and prelaunched
/// UWP frames (cloaked) are left out.
/// </summary>
public sealed class WindowList : IDisposable
{
    public static readonly TimeSpan Coalesce = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan MinInterval = TimeSpan.FromMilliseconds(300);
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(3);

    private readonly IWindowCatalog _catalog;
    private readonly IForegroundService _foreground;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly List<nint> _mru = [];
    private IReadOnlyList<WindowInfo> _cache = [];
    private long _readAt;
    private bool _dirty = true;
    private ITimer? _timer;
    private nint _lastForeground;
    private bool _disposed;

    public WindowList(IWindowCatalog catalog, IForegroundService foreground, TimeProvider time)
    {
        _catalog = catalog;
        _foreground = foreground;
        _time = time;
        _catalog.Changed += OnCatalogChanged;
    }

    /// <summary>The list changed (raised on a timer thread, at most every 100 ms, after the list was re-read).</summary>
    public event Action? Changed;

    /// <summary>Enumerations so far (diagnostics and the cost tests).</summary>
    public int Enumerations { get; private set; }

    public nint Foreground => _foreground.GetForeground();

    /// <summary>Alt-tab windows on the current desktop, in z-order (top first).</summary>
    public IReadOnlyList<WindowInfo> Current()
    {
        lock (_gate)
        {
            var age = _readAt == 0 ? TimeSpan.MaxValue : _time.GetElapsedTime(_readAt);
            // Fresh, or changed but read very recently (the pending timer will re-read and notify).
            if (age < MaxAge && (!_dirty || age < MinInterval)) return _cache;
        }
        return Refresh();
    }

    private IReadOnlyList<WindowInfo> Refresh()
    {
        var all = _catalog.AltTabWindows().Where(w => !w.IsCloaked).ToList();
        lock (_gate)
        {
            Enumerations++;
            _cache = all;
            _readAt = _time.GetTimestamp();
            _dirty = false;
            // Seed / extend the MRU order: new windows join after the known ones, in z-order.
            _mru.RemoveAll(h => all.All(w => w.Hwnd != h));
            foreach (var w in all) if (!_mru.Contains(w.Hwnd)) _mru.Add(w.Hwnd);
            TrackForeground();
            return _cache;
        }
    }

    /// <summary>The same windows, most recently activated first (minimized windows keep their place).</summary>
    public IReadOnlyList<WindowInfo> MostRecent()
    {
        var list = Current();
        lock (_gate)
        {
            var order = _mru.Select((h, i) => (h, i)).ToDictionary(x => x.h, x => x.i);
            return list.OrderBy(w => order.TryGetValue(w.Hwnd, out var i) ? i : int.MaxValue).ToList();
        }
    }

    public WindowInfo? Get(nint hwnd) => _catalog.Get(hwnd);

    private void TrackForeground()
    {
        var fg = _foreground.GetForeground();
        if (fg == 0 || fg == _lastForeground) return;
        _lastForeground = fg;
        var i = _mru.IndexOf(fg);
        if (i > 0) { _mru.RemoveAt(i); _mru.Insert(0, fg); }
        else if (i < 0 && _cache.Any(w => w.Hwnd == fg)) _mru.Insert(0, fg);
    }

    /// <summary>Forget the cache: the next <see cref="Current"/> re-reads (after our own focus change, and in tests).</summary>
    public void Invalidate()
    {
        lock (_gate) _readAt = 0;
    }

    private void OnCatalogChanged(WindowEvent e)
    {
        lock (_gate)
        {
            if (_disposed) return;
            _dirty = true;
            TrackForeground();
            if (_timer is not null) return;
            var age = _readAt == 0 ? TimeSpan.MaxValue : _time.GetElapsedTime(_readAt);
            var wait = age < MinInterval ? MinInterval - age : Coalesce;
            if (wait < Coalesce) wait = Coalesce;
            _timer = _time.CreateTimer(_ =>
            {
                lock (_gate)
                {
                    _timer?.Dispose();
                    _timer = null;
                    if (_disposed) return;
                }
                Refresh();
                Changed?.Invoke();
            }, null, wait, Timeout.InfiniteTimeSpan);
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _disposed = true;
            _timer?.Dispose();
            _timer = null;
        }
        _catalog.Changed -= OnCatalogChanged;
    }
}

/// <summary>How a live window key picks its window.</summary>
public enum SlotMode
{
    /// <summary>The Nth alt-tab window in z-order (what Alt+Tab shows).</summary>
    ZOrder,
    /// <summary>The Nth most recently activated window (minimized windows keep their place).</summary>
    Recent,
    /// <summary>Always one app (an exe name such as "Discord.exe"): its most recent window.</summary>
    Pinned,
}

/// <summary>Slot selection (pure, unit-tested).</summary>
public static class WindowSlots
{
    public static SlotMode ParseMode(string? s) => s?.Trim().ToLowerInvariant() switch
    {
        "recent" or "mru" => SlotMode.Recent,
        "pinned" or "app" => SlotMode.Pinned,
        _ => SlotMode.ZOrder,
    };

    public static string ModeKey(SlotMode m) => m switch { SlotMode.Recent => "recent", SlotMode.Pinned => "pinned", _ => "zorder" };

    /// <summary>
    /// The window for slot <paramref name="slot"/> (1-based). <paramref name="zOrder"/> and <paramref name="recent"/> are the
    /// same windows in the two orders. Pinned matches the exe name with or without ".exe", case-insensitively.
    /// </summary>
    public static WindowInfo? Pick(SlotMode mode, int slot, string? app, IReadOnlyList<WindowInfo> zOrder, IReadOnlyList<WindowInfo> recent)
    {
        if (mode == SlotMode.Pinned)
        {
            if (string.IsNullOrWhiteSpace(app)) return null;
            var matches = recent.Where(w => SameApp(w.ProcessName, app)).ToList();
            return matches.ElementAtOrDefault(Math.Max(0, slot - 1)) ?? matches.FirstOrDefault();
        }
        var list = mode == SlotMode.Recent ? recent : zOrder;
        return slot >= 1 && slot <= list.Count ? list[slot - 1] : null;
    }

    public static bool SameApp(string processName, string app)
    {
        static string Norm(string s)
        {
            s = s.Trim();
            return s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? s[..^4] : s;
        }
        return string.Equals(Norm(processName), Norm(app), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>A friendly app name from an exe name ("msedge.exe" → "Msedge", "Discord.exe" → "Discord").</summary>
    public static string AppName(string processName)
    {
        var n = processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? processName[..^4] : processName;
        if (n.Length == 0 || n == "?") return "App";
        return char.ToUpperInvariant(n[0]) + n[1..];
    }
}
