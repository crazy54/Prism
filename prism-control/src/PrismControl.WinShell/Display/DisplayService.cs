using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using PrismControl.Core.Hosting;

namespace PrismControl.WinShell.Display;

public enum HdrOutcome { TurnedOn, TurnedOff, Unsupported, NoMonitor, Failed, DidNotTake, Busy }

public enum ModeOutcome { Pending, AlreadySet, Unsupported, Rejected, Failed, NoMonitor, Busy }

/// <summary>How the last pending mode change of a monitor ended (any key on any deck can end it).</summary>
public enum ModeEnd { Kept, NotSaved, Reverted }

public sealed record ModeEndInfo(ModeEnd Kind, string Reason, long At);

/// <summary>An applied-but-unconfirmed mode: reverted at <see cref="Deadline"/> unless the user presses Keep.</summary>
public sealed record PendingModeChange(string MonitorId, string GdiName, DisplayMode Previous, DisplayMode Target, long StartedAt, long Deadline);

/// <summary>
/// Monitors, HDR and display modes for every action (one instance per module). True state comes from re-reading Windows;
/// HDR toggles show a 2 s resync; mode changes are CDS_TEST-ed, applied dynamically (not saved), and revert after 15 s
/// unless kept (spec principle 4). The revert timer lives here, not in a key, so it fires even after a profile switch.
/// </summary>
public sealed class DisplayService : IDisposable
{
    public static readonly TimeSpan KeepWindow = TimeSpan.FromSeconds(15);
    public static readonly TimeSpan HdrResync = TimeSpan.FromSeconds(2);

    private readonly IDisplayReader _reader;
    private readonly IDisplayWriter _writer;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly object _gate = new();
    private IReadOnlyList<MonitorInfo> _monitors = [];
    private long _readAt;
    private string _signature = "";
    private readonly ConcurrentDictionary<string, Task<IReadOnlyList<DisplayMode>>> _modes = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, long> _resyncUntil = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, PendingEntry> _pending = new(StringComparer.OrdinalIgnoreCase);
    // One display change at a time per monitor: two keys (two decks, two presets) can never interleave a test/apply/revert.
    private readonly ConcurrentDictionary<string, byte> _busy = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ModeEndInfo> _ended = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;

    public DisplayService(IDisplayReader reader, IDisplayWriter writer, TimeProvider time, ILog log)
    {
        _reader = reader;
        _writer = writer;
        _time = time;
        _log = log;
    }

    public IDisplayWriter Writer => _writer;

    /// <summary>Topology, HDR or mode changed (raised on the caller's or a timer thread; actions Post a redraw).</summary>
    public event Action? Changed;

    // ---------------------------------------------------------------- monitors

    /// <summary>The active monitors, left to right. Cached for <paramref name="maxAge"/> (default 1 s; a read costs ~1 ms).</summary>
    public IReadOnlyList<MonitorInfo> Monitors(TimeSpan? maxAge = null)
    {
        bool changed;
        IReadOnlyList<MonitorInfo> list;
        lock (_gate)
        {
            var age = maxAge ?? TimeSpan.FromSeconds(1);
            if (_readAt != 0 && _time.GetElapsedTime(_readAt) < age) return _monitors;
            list = Overlay(_reader.Monitors());
            var sig = string.Join("|", list.Select(m => $"{m.Id}:{m.Bounds}:{m.Hdr.On}:{m.Hdr.Supported}:{m.Mode}:{m.IsPrimary}"));
            changed = _readAt != 0 && sig != _signature;
            var topology = string.Join("|", list.Select(m => m.Id + m.Bounds)) != string.Join("|", _monitors.Select(m => m.Id + m.Bounds));
            if (topology) _modes.Clear();
            _signature = sig;
            _monitors = list;
            _readAt = _time.GetTimestamp();
        }
        if (changed) Changed?.Invoke();
        return list;
    }

    private IReadOnlyList<MonitorInfo> Overlay(IReadOnlyList<MonitorInfo> real)
    {
        if (_writer is not IDisplayOverlay o) return real;
        return real.Select(m => m with
        {
            Hdr = m.Target is { } t && o.HdrOverride(t) is { } on && m.Hdr.Supported ? m.Hdr with { On = on } : m.Hdr,
            Mode = o.ModeOverride(m.GdiName) ?? m.Mode,
        }).ToList();
    }

    /// <summary>A monitor by id (device path), GDI name or short model name; null/empty = the primary monitor.</summary>
    public MonitorInfo? Find(string? id, TimeSpan? maxAge = null)
    {
        var list = Monitors(maxAge);
        if (string.IsNullOrEmpty(id) || id == "primary") return list.FirstOrDefault(m => m.IsPrimary) ?? list.FirstOrDefault();
        return list.FirstOrDefault(m => string.Equals(m.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? list.FirstOrDefault(m => string.Equals(m.GdiName, id, StringComparison.OrdinalIgnoreCase))
            ?? list.FirstOrDefault(m => string.Equals(m.ShortName, id, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Forces the next <see cref="Monitors"/> call to read Windows again.</summary>
    public void Invalidate()
    {
        lock (_gate) _readAt = 0;
    }

    // ---------------------------------------------------------------- modes (EnumDisplaySettingsEx: 130–195 ms per monitor, cached)

    public Task<IReadOnlyList<DisplayMode>> ModesAsync(MonitorInfo m)
    {
        var t = _modes.GetOrAdd(m.Id, _ => Task.Run(() => _reader.Modes(m.GdiName)));
        // A failed or empty read (e.g. during a display resync) is not cached: the next caller reads again.
        if (t.IsFaulted || t.IsCanceled || (t.IsCompletedSuccessfully && t.Result.Count == 0))
        {
            _modes.TryRemove(new KeyValuePair<string, Task<IReadOnlyList<DisplayMode>>>(m.Id, t));
            t = _modes.GetOrAdd(m.Id, _ => Task.Run(() => _reader.Modes(m.GdiName)));
        }
        return t;
    }

    public IReadOnlyList<DisplayMode>? CachedModes(MonitorInfo m) =>
        _modes.TryGetValue(m.Id, out var t) && t.IsCompletedSuccessfully ? t.Result : null;

    /// <summary>Refresh rates available at the monitor's current resolution (from the cached list), highest first.</summary>
    public static IReadOnlyList<int> RatesAtResolution(IReadOnlyList<DisplayMode> modes, DisplayMode current) =>
        modes.Where(x => x.Width == current.Width && x.Height == current.Height && x.Bpp == current.Bpp).Select(x => x.Hz).Distinct().OrderByDescending(h => h).ToList();

    // ---------------------------------------------------------------- HDR

    public bool IsResyncing(string monitorId) =>
        _resyncUntil.TryGetValue(monitorId, out var until) && _time.GetTimestamp() < until;

    /// <summary>Toggles HDR on one monitor, then re-reads the true state after the 2 s resync.</summary>
    public async Task<HdrOutcome> ToggleHdrAsync(string? monitorId)
    {
        var m = Find(monitorId, TimeSpan.Zero);
        if (m is null) return HdrOutcome.NoMonitor;
        if (m.Target is not { } target || !m.Hdr.Supported) return HdrOutcome.Unsupported;
        if (!_busy.TryAdd("hdr|" + m.Id, 0)) return HdrOutcome.Busy;
        try { return await ToggleHdrCoreAsync(m, target).ConfigureAwait(false); }
        finally { _busy.TryRemove("hdr|" + m.Id, out _); }
    }

    private async Task<HdrOutcome> ToggleHdrCoreAsync(MonitorInfo m, DisplayTarget target)
    {
        var want = !m.Hdr.On;
        var status = _writer.SetHdr(target, want, _reader.HasHdrStateApi);
        if (status != 0 && _reader.HasHdrStateApi) status = _writer.SetHdr(target, want, useHdrStateApi: false);
        if (status != 0)
        {
            _log.Warn($"HDR {(want ? "on" : "off")} failed on {m.ShortName}: status {status}");
            return HdrOutcome.Failed;
        }
        _resyncUntil[m.Id] = _time.GetTimestamp() + (long)(HdrResync.TotalSeconds * _time.TimestampFrequency);
        Changed?.Invoke();
        await Task.Delay(HdrResync, _time).ConfigureAwait(false);
        _resyncUntil.TryRemove(m.Id, out _);
        var fresh = Find(m.Id, TimeSpan.Zero);
        Changed?.Invoke();
        if (fresh is null) return HdrOutcome.NoMonitor;
        if (fresh.Hdr.On != want)
        {
            _log.Warn($"HDR {(want ? "on" : "off")} on {m.ShortName} did not take (Windows still reports {(fresh.Hdr.On ? "on" : "off")})");
            return HdrOutcome.DidNotTake;
        }
        return want ? HdrOutcome.TurnedOn : HdrOutcome.TurnedOff;
    }

    // ---------------------------------------------------------------- refresh rate with auto-revert

    /// <summary>The monitor's unconfirmed change; it stays non-null until the keep or revert that ends it has finished.</summary>
    public PendingModeChange? Pending(string monitorId) => _pending.TryGetValue(monitorId, out var p) ? p.Change : null;

    public TimeSpan Remaining(PendingModeChange p)
    {
        var left = p.Deadline - _time.GetTimestamp();
        return left <= 0 ? TimeSpan.Zero : TimeSpan.FromSeconds((double)left / _time.TimestampFrequency);
    }

    /// <summary>
    /// CDS_TEST, then apply <paramref name="hz"/> at the current resolution without saving it. The change reverts by itself
    /// after <see cref="KeepWindow"/> unless <see cref="Keep"/> is called.
    /// </summary>
    public async Task<ModeOutcome> ChangeRefreshAsync(string? monitorId, int hz)
    {
        var m = Find(monitorId, TimeSpan.Zero);
        if (m is null) return ModeOutcome.NoMonitor;
        if (!_busy.TryAdd(m.Id, 0)) return ModeOutcome.Busy;
        try { return await ChangeRefreshCoreAsync(m, hz).ConfigureAwait(false); }
        finally { _busy.TryRemove(m.Id, out _); }
    }

    private async Task<ModeOutcome> ChangeRefreshCoreAsync(MonitorInfo m, int hz)
    {
        if (_pending.ContainsKey(m.Id)) return ModeOutcome.Busy;
        if (m.Mode is not { } current) return ModeOutcome.Failed;
        if (current.Hz == hz) return ModeOutcome.AlreadySet;
        var modes = await ModesAsync(m).ConfigureAwait(false);
        var target = modes.FirstOrDefault(x => x.Width == current.Width && x.Height == current.Height && x.Bpp == current.Bpp && x.Hz == hz);
        if (target is null) return ModeOutcome.Unsupported;
        var test = _writer.TestMode(m.GdiName, target);
        if (test != ModeChangeResult.Successful)
        {
            _log.Warn($"{m.ShortName}: the driver rejected {target} (CDS_TEST {test})");
            return ModeOutcome.Rejected;
        }
        var applied = _writer.ApplyMode(m.GdiName, target, persist: false);
        if (applied != ModeChangeResult.Successful)
        {
            _log.Warn($"{m.ShortName}: applying {target} failed ({applied}); restoring {current}");
            _writer.ApplyMode(m.GdiName, current, persist: false);
            Invalidate();
            return ModeOutcome.Failed;
        }
        var now = _time.GetTimestamp();
        var change = new PendingModeChange(m.Id, m.GdiName, current, target, now, now + (long)(KeepWindow.TotalSeconds * _time.TimestampFrequency));
        var id = m.Id;
        var timer = _time.CreateTimer(_ => Revert(id, "no confirmation"), null, KeepWindow, Timeout.InfiniteTimeSpan);
        _pending[id] = new PendingEntry(change, timer);
        _ended.TryRemove(id, out _);
        _log.Info($"{m.ShortName}: {current.Hz} Hz → {target.Hz} Hz applied; reverting in {KeepWindow.TotalSeconds:0} s unless kept");
        Invalidate();
        Changed?.Invoke();
        return ModeOutcome.Pending;
    }

    /// <summary>
    /// The user confirmed: save the pending mode (CDS_UPDATEREGISTRY, off the caller's thread). Null if nothing was pending,
    /// true when saved, false when Windows refused to save it (the mode stays applied for this session only).
    /// </summary>
    public async Task<bool?> KeepAsync(string monitorId)
    {
        if (!TryClaim(monitorId, out var p)) return null;
        p.Timer.Dispose();
        var r = ModeChangeResult.Failed;
        try { r = await Task.Run(() => _writer.ApplyMode(p.Change.GdiName, p.Change.Target, persist: true)).ConfigureAwait(false); }
        finally { End(monitorId, p, new ModeEndInfo(r == ModeChangeResult.Successful ? ModeEnd.Kept : ModeEnd.NotSaved, r.ToString(), _time.GetTimestamp())); }
        var ok = r == ModeChangeResult.Successful;
        if (ok) _log.Info($"kept {p.Change.Target}");
        else _log.Warn($"keeping {p.Change.Target} failed to save ({r}); it stays until the next restart or mode change");
        Invalidate();
        Changed?.Invoke();
        return ok;
    }

    /// <summary>How the monitor's last pending change ended (null while one is pending or none ended yet).</summary>
    public ModeEndInfo? LastEnd(string monitorId) => _ended.TryGetValue(monitorId, out var e) ? e : null;

    /// <summary>Restores the previous mode now (timeout, cancel, or shutdown).</summary>
    public bool Revert(string monitorId, string reason = "cancelled")
    {
        if (!TryClaim(monitorId, out var p)) return false;
        p.Timer.Dispose();
        var r = ModeChangeResult.Failed;
        try { r = _writer.ApplyMode(p.Change.GdiName, p.Change.Previous, persist: false); }
        finally { End(monitorId, p, new ModeEndInfo(ModeEnd.Reverted, reason, _time.GetTimestamp())); }
        _log.Info($"reverted to {p.Change.Previous} ({reason}; {r})");
        Invalidate();
        if (!_disposed) Changed?.Invoke();
        return true;
    }

    /// <summary>Claims the monitor's pending change for a keep or a revert; false when none is pending or the other got it first.</summary>
    private bool TryClaim(string monitorId, [NotNullWhen(true)] out PendingEntry? entry) =>
        _pending.TryGetValue(monitorId, out entry) && entry.TryClaim();

    /// <summary>
    /// Ends a claimed change. The outcome is recorded BEFORE the pending entry goes, so whoever sees no pending change also
    /// sees how it ended: keys read Pending, then LastEnd, on their own threads while the slow mode write runs on another.
    /// </summary>
    private void End(string monitorId, PendingEntry entry, ModeEndInfo end)
    {
        _ended[monitorId] = end;
        _pending.TryRemove(new KeyValuePair<string, PendingEntry>(monitorId, entry));
    }

    /// <summary>A pending change and its revert timer. Exactly one keep or revert claims it; it stays listed until that one has ended it.</summary>
    private sealed class PendingEntry(PendingModeChange change, ITimer timer)
    {
        private int _claimed;
        public PendingModeChange Change { get; } = change;
        public ITimer Timer { get; } = timer;
        public bool TryClaim() => Interlocked.Exchange(ref _claimed, 1) == 0;
    }

    public void Dispose()
    {
        _disposed = true;
        // Never leave an unconfirmed mode behind.
        foreach (var id in _pending.Keys.ToList()) Revert(id, "shutting down");
    }
}
