using Microsoft.Win32;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Switcher;

/// <summary>Virtual desktops as Explorer records them: count, current (0-based, -1 unknown) and names.</summary>
public sealed record DesktopsState(int Count, int Current, IReadOnlyList<string> Names)
{
    public static readonly DesktopsState Single = new(1, 0, ["Desktop 1"]);
    public string NameOf(int i) => i >= 0 && i < Names.Count ? Names[i] : $"Desktop {i + 1}";
}

public interface IVirtualDesktopReader
{
    DesktopsState Read();
}

/// <summary>
/// HKCU\…\Explorer\VirtualDesktops: VirtualDesktopIDs (16 bytes per desktop, in order), CurrentVirtualDesktop (also under
/// SessionInfo\&lt;session&gt;\VirtualDesktops on some builds) and Desktops\{GUID}\Name. Undocumented but stable since
/// Windows 10 1803; verified read-only on this PC (3 desktops). Reads only.
/// </summary>
internal sealed class RegistryVirtualDesktopReader : IVirtualDesktopReader
{
    private const string Root = @"Software\Microsoft\Windows\CurrentVersion\Explorer";

    public DesktopsState Read()
    {
        try
        {
            using var vd = Registry.CurrentUser.OpenSubKey(Root + @"\VirtualDesktops");
            if (vd?.GetValue("VirtualDesktopIDs") is not byte[] ids || ids.Length < 16) return DesktopsState.Single;
            var guids = Enumerable.Range(0, ids.Length / 16).Select(i => new Guid(ids.AsSpan(i * 16, 16))).ToList();
            var current = CurrentGuid(vd);
            var names = guids.Select((g, i) =>
            {
                using var k = vd.OpenSubKey($@"Desktops\{{{g}}}");
                return k?.GetValue("Name") is string { Length: > 0 } n ? n : $"Desktop {i + 1}";
            }).ToList();
            return new DesktopsState(guids.Count, current is { } c ? guids.IndexOf(c) : -1, names);
        }
        catch
        {
            return DesktopsState.Single;
        }
    }

    private static Guid? CurrentGuid(RegistryKey vd)
    {
        try
        {
            var session = System.Diagnostics.Process.GetCurrentProcess().SessionId;
            using var s = Registry.CurrentUser.OpenSubKey($@"{Root}\SessionInfo\{session}\VirtualDesktops");
            if (s?.GetValue("CurrentVirtualDesktop") is byte[] { Length: 16 } b1) return new Guid(b1);
        }
        catch { /* fall back to the shared value */ }
        return vd.GetValue("CurrentVirtualDesktop") is byte[] { Length: 16 } b ? new Guid(b) : null;
    }
}

public enum DesktopSwitchOutcome { Switched, AlreadyThere, NotConfirmed, Simulated, Failed, NoSuchDesktop }

/// <summary>
/// The pager: reads desktops from the registry and switches with Win+Ctrl+←/→ through Desktop's IInputSender (there is no
/// public API to switch). "Jump to N" is |N − current| steps; each switch is verified by re-reading the registry.
/// There is NO documented way to move another app's window to another desktop (IVirtualDesktopManager.MoveWindowToDesktop
/// only works for the caller's own windows), so that option is not offered.
/// </summary>
public sealed class VirtualDesktopService
{
    public static readonly TimeSpan StepGap = TimeSpan.FromMilliseconds(140);
    public static readonly TimeSpan VerifyDelay = TimeSpan.FromMilliseconds(400);

    private readonly IVirtualDesktopReader _reader;
    private readonly IInputSender _input;
    private readonly TimeProvider _time;
    private readonly ILog _log;
    private readonly object _gate = new();
    private DesktopsState _cache = DesktopsState.Single;
    private long _readAt;
    private int? _simulatedCurrent;
    private bool _busy;

    private readonly bool _simulated;

    /// <param name="simulated">Safe mode: the input sender only records (Desktop's RecordingInputSender or ours), so
    /// switches update an in-memory "current desktop" instead of waiting for Explorer.</param>
    public VirtualDesktopService(IVirtualDesktopReader reader, IInputSender input, TimeProvider time, ILog log, bool simulated = false)
    {
        _reader = reader;
        _input = input;
        _time = time;
        _log = log;
        _simulated = simulated;
    }

    private bool Simulated => _simulated || _input is SafeModeInput;

    public event Action? Changed;

    public DesktopsState Current(TimeSpan? maxAge = null)
    {
        lock (_gate)
        {
            if (_readAt != 0 && _time.GetElapsedTime(_readAt) < (maxAge ?? TimeSpan.FromMilliseconds(500))) return _cache;
        }
        var s = _reader.Read();
        bool changed;
        lock (_gate)
        {
            if (_simulatedCurrent is { } sim && sim < s.Count) s = s with { Current = sim };
            changed = _readAt != 0 && (s.Count != _cache.Count || s.Current != _cache.Current || !s.Names.SequenceEqual(_cache.Names));
            _cache = s;
            _readAt = _time.GetTimestamp();
        }
        if (changed) Changed?.Invoke();
        return s;
    }

    /// <summary>Next (+1) or previous (−1) desktop; at the ends it wraps around (Windows itself stops at the ends).</summary>
    public Task<DesktopSwitchOutcome> StepAsync(int delta, bool wrap = true)
    {
        var s = Current(TimeSpan.Zero);
        if (s.Count <= 1 || s.Current < 0) return Task.FromResult(s.Count <= 1 ? DesktopSwitchOutcome.AlreadyThere : DesktopSwitchOutcome.Failed);
        var target = s.Current + delta;
        if (wrap) target = ((target % s.Count) + s.Count) % s.Count;
        else target = Math.Clamp(target, 0, s.Count - 1);
        return GoToAsync(target);
    }

    /// <summary>Goes to desktop <paramref name="index"/> (0-based).</summary>
    public async Task<DesktopSwitchOutcome> GoToAsync(int index)
    {
        var s = Current(TimeSpan.Zero);
        if (index < 0 || index >= s.Count) return DesktopSwitchOutcome.NoSuchDesktop;
        if (s.Current == index) return DesktopSwitchOutcome.AlreadyThere;
        if (s.Current < 0) return DesktopSwitchOutcome.Failed;
        lock (_gate)
        {
            if (_busy) return DesktopSwitchOutcome.Failed;
            _busy = true;
        }
        try
        {
            var steps = index - s.Current;
            var arrow = steps > 0 ? VkCodes.Right : VkCodes.Left;
            for (var i = 0; i < Math.Abs(steps); i++)
            {
                if (i > 0 && !Simulated) await Task.Delay(StepGap, _time).ConfigureAwait(false);
                if (!await _input.SendChordAsync([VkCodes.Win, VkCodes.Ctrl, arrow]).ConfigureAwait(false))
                {
                    _log.Warn("desktop switch: the input was not accepted");
                    return DesktopSwitchOutcome.Failed;
                }
            }
            if (Simulated)
            {
                lock (_gate) { _simulatedCurrent = index; _readAt = 0; }
                Changed?.Invoke();
                return DesktopSwitchOutcome.Simulated;
            }
            await Task.Delay(VerifyDelay, _time).ConfigureAwait(false);
            var after = Current(TimeSpan.Zero);
            Changed?.Invoke();
            return after.Current == index ? DesktopSwitchOutcome.Switched : DesktopSwitchOutcome.NotConfirmed;
        }
        finally
        {
            lock (_gate) _busy = false;
        }
    }
}
