using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>
/// Synthetic keyboard input. Real: <see cref="SendInputSender"/>. Safe mode: <see cref="RecordingInputSender"/>.
/// The members added for the Smart Deck engine (mode overloads, holds) have default implementations, so older fakes
/// still compile; the defaults refuse (false) rather than silently changing behavior.
/// </summary>
public interface IInputSender
{
    /// <summary>
    /// Presses <paramref name="keys"/> down in order and releases them in reverse, in one SendInput call (so the user's
    /// own typing cannot interleave). Every key that went down is released, even when Windows accepts only part of the
    /// batch or the call throws. False when refused (the foreground app is elevated, invalid keys) or not fully accepted.
    /// Keys this sender currently holds (<see cref="SendKeysDownAsync"/>) are left held: the chord only taps the rest.
    /// </summary>
    Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default);

    /// <summary>One key tap (down + up).</summary>
    Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default);

    /// <summary>
    /// Types <paramref name="text"/> with KEYEVENTF_UNICODE (layout-independent). \n and \r\n press Enter, \t presses Tab,
    /// other control characters are skipped. Sent in batches; stops (false) if the foreground window changes midway.
    /// At most <see cref="SendInputSender.MaxTextLength"/> characters.
    /// </summary>
    Task<bool> SendTextAsync(string text, CancellationToken ct = default);

    /// <summary>
    /// UIPI: true when <paramref name="hwnd"/>'s process (0 = the current foreground window) runs above our integrity
    /// level, so SendInput into it is dropped silently. Check it first and show a clear message ("admin app").
    /// </summary>
    bool TargetIsElevated(nint hwnd);

    /// <summary>A chord in <paramref name="mode"/> (<see cref="KeyMode.Scancode"/> for games that read raw keys).</summary>
    Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default) =>
        mode == KeyMode.VirtualKey ? SendChordAsync(keys, ct) : Task.FromResult(false);

    /// <summary>One key tap in <paramref name="mode"/>.</summary>
    Task<bool> SendKeyAsync(VirtualKey key, KeyMode mode, CancellationToken ct = default) => SendChordAsync([key], mode, ct);

    /// <summary>
    /// A chord for exactly one window: immediately before the SendInput call (inside the sender's lock) the foreground
    /// window must still be <paramref name="expectedHwnd"/>'s top-level window and not elevated, else nothing is sent
    /// (false, "WINDOW CHANGED" in the log). Keyboard input always goes to the foreground window, so this is how a
    /// multi-press action (a Sight closed loop, a Galleon spin) stops at the first Alt-Tab instead of typing into the
    /// next app. The default refuses (false): a fake that cannot check the foreground must not pretend it did.
    /// </summary>
    Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) =>
        Task.FromResult(false);

    /// <summary>
    /// Presses and HOLDS <paramref name="keys"/> (in order; keys already held are skipped) for "hold" bindings. Release
    /// them with <see cref="SendKeysUpAsync"/>. A watchdog releases any key held longer than the maximum hold (≤ 10 s),
    /// and a failure or dispose releases everything this sender holds. False when refused or not fully accepted.
    /// </summary>
    Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) => Task.FromResult(false);

    /// <summary>Releases those of <paramref name="keys"/> this sender holds (newest first, the same way they went down). Keys it does not hold are never touched.</summary>
    Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => Task.FromResult(false);

    /// <summary>The keys this sender currently holds, in press order.</summary>
    IReadOnlyList<VirtualKey> HeldKeys => [];

    /// <summary>Releases every key this sender holds.</summary>
    Task ReleaseAllAsync() => Task.CompletedTask;

    /// <summary>
    /// Presses and HOLDS <paramref name="keys"/> for <paramref name="owner"/> (a Smart slot, one held tap). Holds are
    /// counted per owner: a key goes up only when the LAST owner holding it lets go, so one slot's release never drops a
    /// key another slot still holds (review E16). With <paramref name="expectedHwnd"/> ≠ 0 the foreground window and its
    /// elevation are re-checked inside the sender's lock right before the presses, like <see cref="SendChordToAsync"/>
    /// (nothing is sent when the window changed). <see cref="SendKeysDownAsync"/> / <see cref="SendKeysUpAsync"/> are one
    /// shared anonymous owner with exactly their old behavior. The default (older fakes) holds without owner counting and
    /// refuses a window-checked hold it cannot verify.
    /// </summary>
    Task<bool> HoldKeysAsync(object owner, nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) =>
        expectedHwnd != 0 ? Task.FromResult(false) : SendKeysDownAsync(keys, mode, ct);

    /// <summary>Drops <paramref name="owner"/>'s hold on <paramref name="keys"/>; keys no owner holds any more go up (newest first). Never blocked by a window check.</summary>
    Task<bool> ReleaseKeysAsync(object owner, IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendKeysUpAsync(keys, ct);

    /// <summary>Drops every hold of <paramref name="owner"/> (a slot that went away, or whose app lost the front).</summary>
    Task ReleaseOwnerAsync(object owner) => Task.CompletedTask;
}

/// <summary>One keyboard event (the KEYBDINPUT fields we fill).</summary>
internal readonly record struct KeyEvent(ushort Vk, ushort Scan, uint Flags)
{
    public bool IsUp => (Flags & User32.KEYEVENTF_KEYUP) != 0;
    public KeyEvent AsUp() => this with { Flags = Flags | User32.KEYEVENTF_KEYUP };
    public bool SameKey(in KeyEvent o) => Vk == o.Vk && Scan == o.Scan && (Flags & User32.KEYEVENTF_UNICODE) == (o.Flags & User32.KEYEVENTF_UNICODE);
}

/// <summary>Where key events go. The real one calls SendInput; tests script it.</summary>
internal interface IKeyboardInjector
{
    /// <summary>Sends one batch (one SendInput call). Returns how many events Windows accepted.</summary>
    int Send(ReadOnlySpan<KeyEvent> events);
    /// <summary>MAPVK_VK_TO_VSC_EX: 0xE0xx for extended keys, 0 when unknown.</summary>
    ushort ScanCode(ushort vk);
    nint Foreground();
    bool IsAboveUs(nint hwnd);
    /// <summary>The top-level window of <paramref name="hwnd"/> (GetAncestor(GA_ROOT)); scripted fakes keep the handle.</summary>
    nint RootOf(nint hwnd) => hwnd;
}

internal sealed unsafe class Win32KeyboardInjector : IKeyboardInjector
{
    public int Send(ReadOnlySpan<KeyEvent> events)
    {
        // Last line of defense: never type in safe mode (the module should have picked RecordingInputSender).
        if (events.IsEmpty || SafeModeEnvironment.FromEnvironment()) return 0;
        var native = new INPUT[events.Length];
        for (var i = 0; i < events.Length; i++)
        {
            var e = events[i];
            native[i] = new INPUT
            {
                type = User32.INPUT_KEYBOARD,
                u = new InputUnion { ki = new KEYBDINPUT { wVk = e.Vk, wScan = e.Scan, dwFlags = e.Flags, dwExtraInfo = Win32ForegroundNative.ExtraInfoMarker } },
            };
        }
        fixed (INPUT* p = native) return (int)User32.SendInput((uint)native.Length, p, sizeof(INPUT));
    }

    public ushort ScanCode(ushort vk) => (ushort)User32.MapVirtualKeyW(vk, User32.MAPVK_VK_TO_VSC_EX);

    public nint Foreground() => User32.GetForegroundWindow();

    public bool IsAboveUs(nint hwnd)
    {
        if (hwnd == 0) return false;
        User32.GetWindowThreadProcessId(hwnd, out var pid);
        return ProcessInfo.IsAboveUs(pid);
    }

    public nint RootOf(nint hwnd)
    {
        if (hwnd == 0) return 0;
        var r = User32.GetAncestor(hwnd, User32.GA_ROOT);
        return r != 0 ? r : hwnd;
    }
}

/// <summary>Builds KEYBDINPUT sequences. Pure.</summary>
internal static class KeySequences
{
    public static KeyEvent Key(VirtualKey key, IKeyboardInjector map, bool up) => Key(key, map, up, KeyMode.VirtualKey)!.Value;

    /// <summary>One event; null when <paramref name="key"/> has no scan code in scancode mode.</summary>
    public static KeyEvent? Key(VirtualKey key, IKeyboardInjector map, bool up, KeyMode mode)
    {
        var upFlag = up ? User32.KEYEVENTF_KEYUP : 0u;
        if (mode == KeyMode.Scancode)
        {
            if (!UsScanCodes.TryGet(key, out var code)) return null;
            var ext = (code >> 8) == 0xE0 ? User32.KEYEVENTF_EXTENDEDKEY : 0u;
            return new KeyEvent(0, (ushort)(code & 0xFF), User32.KEYEVENTF_SCANCODE | ext | upFlag);
        }
        var sc = map.ScanCode((ushort)key);
        var flags = VirtualKeys.IsExtended(key) || (sc >> 8) is 0xE0 or 0xE1 ? User32.KEYEVENTF_EXTENDEDKEY : 0u;
        return new KeyEvent((ushort)key, (ushort)(sc & 0xFF), flags | upFlag);
    }

    /// <summary>Down in order, then up in reverse.</summary>
    public static KeyEvent[] Chord(IReadOnlyList<VirtualKey> keys, IKeyboardInjector map) => Chord(keys, map, KeyMode.VirtualKey)!;

    /// <summary>Down in order, then up in reverse; null when a key has no scan code in scancode mode.</summary>
    public static KeyEvent[]? Chord(IReadOnlyList<VirtualKey> keys, IKeyboardInjector map, KeyMode mode)
    {
        var events = new KeyEvent[keys.Count * 2];
        for (var i = 0; i < keys.Count; i++)
        {
            if (Key(keys[i], map, false, mode) is not { } down) return null;
            events[i] = down;
            events[keys.Count * 2 - 1 - i] = down.AsUp();
        }
        return events;
    }

    /// <summary>Unicode down/up per UTF-16 unit; \n, \r\n → Enter; \t → Tab; other control characters skipped.</summary>
    public static List<KeyEvent> Text(string text, IKeyboardInjector map)
    {
        var list = new List<KeyEvent>(text.Length * 2);
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (c == '\r')
            {
                if (i + 1 < text.Length && text[i + 1] == '\n') continue;
                c = '\n';
            }
            if (c is '\n' or '\t')
            {
                var k = c == '\n' ? VirtualKey.Enter : VirtualKey.Tab;
                list.Add(Key(k, map, false));
                list.Add(Key(k, map, true));
                continue;
            }
            if (char.IsControl(c)) continue;
            list.Add(new KeyEvent(0, c, User32.KEYEVENTF_UNICODE));
            list.Add(new KeyEvent(0, c, User32.KEYEVENTF_UNICODE | User32.KEYEVENTF_KEYUP));
        }
        return list;
    }

    /// <summary>The keys still down after the first <paramref name="sent"/> events of <paramref name="events"/> went in, in press order.</summary>
    public static List<KeyEvent> StillDown(ReadOnlySpan<KeyEvent> events, int sent)
    {
        var down = new List<KeyEvent>();
        for (var i = 0; i < sent && i < events.Length; i++)
        {
            var e = events[i];
            if (!e.IsUp) { down.Add(e); continue; }
            for (var j = down.Count - 1; j >= 0; j--)
            {
                if (down[j].SameKey(e)) { down.RemoveAt(j); break; }
            }
        }
        return down;
    }
}

/// <summary>
/// The real sender: SendInput with scan codes and the extended flag (or pure scancode mode), our dwExtraInfo marker,
/// and the release guarantee. Refuses (false, logged) when the foreground app runs elevated, because UIPI would drop the
/// input without any error. Calls complete synchronously (SendInput takes microseconds); they never block on the target
/// app. Holds are tracked; a watchdog releases keys held longer than <see cref="MaxHold"/>; dispose releases everything.
/// </summary>
public sealed class SendInputSender : IInputSender, IDisposable
{
    /// <summary>The longest text <see cref="SendTextAsync"/> types.</summary>
    public const int MaxTextLength = 10_000;
    /// <summary>The most keys in one chord or hold call.</summary>
    public const int MaxChordKeys = 8;
    /// <summary>The longest a key may be held (the watchdog releases it after that).</summary>
    public static readonly TimeSpan MaxHoldLimit = TimeSpan.FromSeconds(10);
    internal const int TextBatchEvents = 64;

    private readonly IKeyboardInjector _injector;
    private readonly ILog _log;
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private readonly List<(VirtualKey Key, KeyEvent Down, long Since)> _held = [];
    /// <summary>Who holds each held key (E16). The plain SendKeysDown/Up calls are <see cref="HoldOwners.Anonymous"/>.</summary>
    private readonly HoldOwners _owners = new();
    private ITimer? _watchdog;
    private bool _disposed;

    public SendInputSender(ILog? log = null, TimeSpan? maxHold = null) : this(new Win32KeyboardInjector(), log ?? NullLog.Instance, maxHold, null) { }

    internal SendInputSender(IKeyboardInjector injector, ILog log, TimeSpan? maxHold = null, TimeProvider? time = null)
    {
        _injector = injector;
        _log = log.For("input");
        _time = time ?? TimeProvider.System;
        MaxHold = maxHold is { } m && m > TimeSpan.Zero && m < MaxHoldLimit ? m : MaxHoldLimit;
    }

    /// <summary>The stuck-key watchdog's limit (≤ 10 s).</summary>
    public TimeSpan MaxHold { get; }

    public bool TargetIsElevated(nint hwnd) => _injector.IsAboveUs(hwnd == 0 ? _injector.Foreground() : hwnd);

    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendChordAsync([key], KeyMode.VirtualKey, ct);

    public Task<bool> SendKeyAsync(VirtualKey key, KeyMode mode, CancellationToken ct = default) => SendChordAsync([key], mode, ct);

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendChordAsync(keys, KeyMode.VirtualKey, ct);

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!ValidKeys(keys, "chord") || !InputAllowed()) return Task.FromResult(false);
        lock (_gate) return Task.FromResult(ChordLocked(keys, mode));
    }

    public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (expectedHwnd == 0)
        {
            _log.Warn("Refused a chord: no target window was given.");
            return Task.FromResult(false);
        }
        if (!ValidKeys(keys, "chord")) return Task.FromResult(false);
        lock (_gate)
        {
            // Re-verified as late as possible, right before the SendInput call.
            var fg = _injector.Foreground();
            if (fg == 0 || (fg != expectedHwnd && _injector.RootOf(fg) != _injector.RootOf(expectedHwnd)))
            {
                _log.Warn("Refused a chord: WINDOW CHANGED (the expected window is no longer in front).");
                return Task.FromResult(false);
            }
            if (_injector.IsAboveUs(fg))
            {
                _log.Warn("Refused input: the app in front runs as administrator, and Windows drops input from non-admin apps (UIPI).");
                return Task.FromResult(false);
            }
            return Task.FromResult(ChordLocked(keys, mode));
        }
    }

    private bool ChordLocked(IReadOnlyList<VirtualKey> keys, KeyMode mode)
    {
        var tap = keys.Where(k => !_held.Any(h => h.Key == k)).ToList();
        if (tap.Count == 0) return true;
        if (KeySequences.Chord(tap, _injector, mode) is not { } events) return Unsupported(keys);
        return SendBatch(events);
    }

    public async Task<bool> SendTextAsync(string text, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(text);
        if (text.Length == 0) return true;
        if (text.Length > MaxTextLength)
        {
            _log.Warn($"Refused to type {text.Length} characters (the limit is {MaxTextLength}).");
            return false;
        }
        if (!InputAllowed()) return false;
        var events = KeySequences.Text(text, _injector);
        var foreground = _injector.Foreground();
        for (var i = 0; i < events.Count; i += TextBatchEvents)
        {
            if (i > 0)
            {
                await Task.Yield();
                ct.ThrowIfCancellationRequested();
                if (_injector.Foreground() != foreground)
                {
                    _log.Warn("Stopped typing: the foreground window changed.");
                    return false;
                }
            }
            var batch = events.GetRange(i, Math.Min(TextBatchEvents, events.Count - i)).ToArray();
            bool ok;
            lock (_gate) ok = SendBatch(batch);
            if (!ok) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ holds

    public IReadOnlyList<VirtualKey> HeldKeys { get { lock (_gate) return _held.Select(h => h.Key).ToArray(); } }

    public Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!ValidKeys(keys, "hold") || !InputAllowed()) return Task.FromResult(false);
        lock (_gate) return Task.FromResult(HoldLocked(HoldOwners.Anonymous, keys, mode));
    }

    public Task<bool> HoldKeysAsync(object owner, nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ct.ThrowIfCancellationRequested();
        if (!ValidKeys(keys, "hold")) return Task.FromResult(false);
        if (expectedHwnd == 0 && !InputAllowed()) return Task.FromResult(false);
        lock (_gate)
        {
            if (expectedHwnd != 0)
            {
                // Re-verified as late as possible, right before the presses (lead decision 4).
                var fg = _injector.Foreground();
                if (fg == 0 || (fg != expectedHwnd && _injector.RootOf(fg) != _injector.RootOf(expectedHwnd)))
                {
                    _log.Warn("Refused a hold: WINDOW CHANGED (the expected window is no longer in front).");
                    return Task.FromResult(false);
                }
                if (_injector.IsAboveUs(fg))
                {
                    _log.Warn("Refused input: the app in front runs as administrator, and Windows drops input from non-admin apps (UIPI).");
                    return Task.FromResult(false);
                }
            }
            return Task.FromResult(HoldLocked(owner, keys, mode));
        }
    }

    /// <summary>Presses the keys nobody holds yet, then records <paramref name="owner"/> on every one of them. Caller holds the lock.</summary>
    private bool HoldLocked(object owner, IReadOnlyList<VirtualKey> keys, KeyMode mode)
    {
        if (_disposed) return false;
        var press = keys.Where(k => !_held.Any(h => h.Key == k)).ToList();
        if (press.Count == 0)
        {
            _owners.Add(owner, keys);
            return true;
        }
        var downs = new List<KeyEvent>();
        foreach (var k in press)
        {
            if (KeySequences.Key(k, _injector, false, mode) is not { } d) return Unsupported(keys);
            downs.Add(d);
        }
        int sent;
        try { sent = Math.Clamp(_injector.Send(downs.ToArray()), 0, downs.Count); }
        catch (Exception ex)
        {
            // Unknown how many went down: treat all as held, then release everything.
            for (var i = 0; i < downs.Count; i++) _held.Add((press[i], downs[i], _time.GetTimestamp()));
            _log.Warn("SendInput threw " + ex.GetType().Name + " while holding keys; released everything.");
            ReleaseAllLocked();
            return false;
        }
        var now = _time.GetTimestamp();
        for (var i = 0; i < sent; i++) _held.Add((press[i], downs[i], now));
        if (sent < downs.Count)
        {
            _log.Warn($"Windows accepted {sent} of {downs.Count} key presses; released everything held.");
            ReleaseAllLocked();
            return false;
        }
        _owners.Add(owner, keys);
        ArmWatchdogLocked();
        return true;
    }

    public Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(keys);
        lock (_gate) return Task.FromResult(ReleaseLocked(HoldOwners.Anonymous, keys));
    }

    public Task<bool> ReleaseKeysAsync(object owner, IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(keys);
        lock (_gate) return Task.FromResult(ReleaseLocked(owner, keys));
    }

    public Task ReleaseOwnerAsync(object owner)
    {
        ArgumentNullException.ThrowIfNull(owner);
        lock (_gate) ReleaseLocked(owner, _owners.KeysOf(owner));
        return Task.CompletedTask;
    }

    /// <summary>Drops the owner's hold on <paramref name="keys"/>; held keys that nobody holds any more go up, newest first.</summary>
    private bool ReleaseLocked(object owner, IReadOnlyList<VirtualKey> keys)
    {
        _owners.Remove(owner, keys);
        var release = _held.Where(h => keys.Contains(h.Key) && !_owners.IsHeld(h.Key)).Reverse().ToList();
        if (release.Count == 0) return true;
        if (!Release(release.Select(h => h.Down.AsUp()).ToArray()))
        {
            // Keep the refused keys tracked so the release-all retries them too: never leave a key down.
            ReleaseAllLocked();
            return false;
        }
        _held.RemoveAll(h => release.Contains(h));
        ArmWatchdogLocked();
        return true;
    }

    public Task ReleaseAllAsync()
    {
        lock (_gate) ReleaseAllLocked();
        return Task.CompletedTask;
    }

    private void ReleaseAllLocked()
    {
        if (_held.Count > 0)
        {
            Release(_held.AsEnumerable().Reverse().Select(h => h.Down.AsUp()).ToArray());
            _held.Clear();
        }
        _owners.Clear();
        _watchdog?.Dispose();
        _watchdog = null;
    }

    /// <summary>Sends releases, retrying the rest once. True when all went out. Never throws.</summary>
    private bool Release(KeyEvent[] ups)
    {
        var remaining = ups;
        for (var attempt = 0; attempt < 2 && remaining.Length > 0; attempt++)
        {
            int ok;
            try { ok = Math.Clamp(_injector.Send(remaining), 0, remaining.Length); } catch (Exception) { ok = 0; }
            remaining = remaining[ok..];
        }
        if (remaining.Length > 0) _log.Warn($"Windows did not accept {remaining.Length} key releases; press and release those keys to reset them.");
        return remaining.Length == 0;
    }

    private void ArmWatchdogLocked()
    {
        _watchdog?.Dispose();
        _watchdog = null;
        if (_held.Count == 0 || _disposed) return;
        var oldest = _held.Min(h => h.Since);
        var due = MaxHold - _time.GetElapsedTime(oldest);
        _watchdog = _time.CreateTimer(_ => OnWatchdog(), null, due < TimeSpan.Zero ? TimeSpan.Zero : due, Timeout.InfiniteTimeSpan);
    }

    private void OnWatchdog()
    {
        lock (_gate)
        {
            var stuck = _held.Where(h => _time.GetElapsedTime(h.Since) >= MaxHold).ToList();
            if (stuck.Count > 0)
            {
                _log.Warn($"Released {stuck.Count} key(s) held longer than {MaxHold.TotalSeconds:F0} s (stuck-key watchdog).");
                Release(stuck.AsEnumerable().Reverse().Select(h => h.Down.AsUp()).ToArray());
                _held.RemoveAll(h => stuck.Contains(h));
                _owners.Forget(stuck.Select(h => h.Key));
            }
            ArmWatchdogLocked();
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            ReleaseAllLocked();
        }
    }

    // ------------------------------------------------------------------ helpers

    private bool ValidKeys(IReadOnlyList<VirtualKey> keys, string what)
    {
        if (keys is null || keys.Count == 0 || keys.Count > MaxChordKeys || keys.Contains(VirtualKey.None) || keys.Distinct().Count() != keys.Count)
        {
            _log.Warn($"Refused a {what}: 1 to 8 distinct keys are required.");
            return false;
        }
        return true;
    }

    private bool Unsupported(IReadOnlyList<VirtualKey> keys)
    {
        _log.Warn("Refused: " + string.Join("+", keys.Where(k => !UsScanCodes.TryGet(k, out _))) + " has no scan code in scancode mode.");
        return false;
    }

    private bool InputAllowed()
    {
        var fg = _injector.Foreground();
        if (fg != 0 && _injector.IsAboveUs(fg))
        {
            _log.Warn("Refused input: the app in front runs as administrator, and Windows drops input from non-admin apps (UIPI).");
            return false;
        }
        return true;
    }

    private bool SendBatch(KeyEvent[] events)
    {
        int sent;
        try { sent = Math.Clamp(_injector.Send(events), 0, events.Length); }
        catch (Exception ex)
        {
            // We cannot tell how much went out: treat every key this batch presses as down.
            ReleaseStuck(events, events.Length, everyDown: true);
            _log.Warn("SendInput threw " + ex.GetType().Name + "; released the keys.");
            return false;
        }
        if (sent == events.Length) return true;
        ReleaseStuck(events, sent, everyDown: false);
        _log.Warn($"Windows accepted {sent} of {events.Length} key events (another program may be blocking input); released the keys.");
        return false;
    }

    private void ReleaseStuck(KeyEvent[] events, int sent, bool everyDown)
    {
        var down = everyDown ? events.Where(e => !e.IsUp).ToList() : KeySequences.StillDown(events, sent);
        if (down.Count == 0) return;
        Release(Enumerable.Reverse(down).Select(e => e.AsUp()).ToArray());
    }
}

/// <summary>
/// Who holds which key (review E16): a key may be held by several owners at once (two Smart slots that both need
/// Shift); it is physically released only when its last owner lets go. Reference identity. Not thread-safe (callers lock).
/// </summary>
internal sealed class HoldOwners
{
    /// <summary>The owner of the plain SendKeysDownAsync / SendKeysUpAsync calls (their behavior is unchanged).</summary>
    public static readonly object Anonymous = new();

    private readonly Dictionary<VirtualKey, HashSet<object>> _byKey = [];

    public void Add(object owner, IEnumerable<VirtualKey> keys)
    {
        foreach (var k in keys)
        {
            if (!_byKey.TryGetValue(k, out var set)) _byKey[k] = set = new HashSet<object>(ReferenceEqualityComparer.Instance);
            set.Add(owner);
        }
    }

    public void Remove(object owner, IEnumerable<VirtualKey> keys)
    {
        foreach (var k in keys)
            if (_byKey.TryGetValue(k, out var set) && set.Remove(owner) && set.Count == 0) _byKey.Remove(k);
    }

    public bool IsHeld(VirtualKey key) => _byKey.TryGetValue(key, out var set) && set.Count > 0;

    public IReadOnlyList<VirtualKey> KeysOf(object owner) => [.. _byKey.Where(kv => kv.Value.Contains(owner)).Select(kv => kv.Key)];

    /// <summary>Keys that went up without their owners letting go (the stuck-key watchdog).</summary>
    public void Forget(IEnumerable<VirtualKey> keys) { foreach (var k in keys) _byKey.Remove(k); }

    public void Clear() => _byKey.Clear();
}

public enum InputRecordKind { Chord, Key, Text, KeysDown, KeysUp }

/// <summary>One call the recording fake received.</summary>
public sealed record InputRecord(InputRecordKind Kind, IReadOnlyList<VirtualKey> Keys, string? Text, KeyMode Mode = KeyMode.VirtualKey);

/// <summary>
/// Safe mode and tests: records every call, logs one line (key names or a character count, never the text), sends
/// nothing, and returns <see cref="Result"/>. Tracks holds like the real sender. <see cref="TargetIsElevated"/> stays a
/// real read unless a test overrides it. <see cref="SendChordToAsync"/> checks <paramref name="foreground"/> when given
/// (a test's notion of the window in front) and the target's elevation, then records like a chord.
/// </summary>
public sealed class RecordingInputSender(ILog? log = null, Func<nint, bool>? isElevated = null, Func<nint>? foreground = null) : IInputSender, IDisposable
{
    private readonly ILog _log = (log ?? NullLog.Instance).For("input");
    private readonly Func<nint, bool> _isElevated = isElevated ?? (h => new Win32KeyboardInjector() is var i && i.IsAboveUs(h == 0 ? i.Foreground() : h));
    private readonly List<InputRecord> _records = [];
    private readonly List<VirtualKey> _held = [];
    private readonly HoldOwners _owners = new();

    /// <summary>What every Send* call returns (default true: the fake "worked").</summary>
    public bool Result { get; set; } = true;

    public IReadOnlyList<InputRecord> Records { get { lock (_records) return [.. _records]; } }

    public IReadOnlyList<VirtualKey> HeldKeys { get { lock (_records) return [.. _held]; } }

    public void Clear() { lock (_records) _records.Clear(); }

    public bool TargetIsElevated(nint hwnd) => _isElevated(hwnd);

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => SendChordAsync(keys, KeyMode.VirtualKey, ct);

    public Task<bool> SendChordAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Add(new InputRecord(InputRecordKind.Chord, [.. keys], null, mode));
        _log.Info("[safe mode] would press " + string.Join("+", keys) + Suffix(mode));
        return Task.FromResult(Result);
    }

    public Task<bool> SendChordToAsync(nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (expectedHwnd == 0 || (foreground is not null && foreground() != expectedHwnd) || _isElevated(expectedHwnd))
        {
            _log.Info("[safe mode] refused a chord: the expected window is not in front (WINDOW CHANGED) or is elevated");
            return Task.FromResult(false);
        }
        return SendChordAsync(keys, mode, ct);
    }

    public Task<bool> SendKeyAsync(VirtualKey key, CancellationToken ct = default) => SendKeyAsync(key, KeyMode.VirtualKey, ct);

    public Task<bool> SendKeyAsync(VirtualKey key, KeyMode mode, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Add(new InputRecord(InputRecordKind.Key, [key], null, mode));
        _log.Info("[safe mode] would press " + key + Suffix(mode));
        return Task.FromResult(Result);
    }

    public Task<bool> SendTextAsync(string text, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(text);
        Add(new InputRecord(InputRecordKind.Text, [], text));
        _log.Info($"[safe mode] would type {text.Length} characters");
        return Task.FromResult(Result);
    }

    public Task<bool> SendKeysDownAsync(IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default) =>
        HoldCore(HoldOwners.Anonymous, keys, mode, ct);

    public Task<bool> SendKeysUpAsync(IReadOnlyList<VirtualKey> keys, CancellationToken ct = default) => ReleaseCore(HoldOwners.Anonymous, keys);

    /// <summary>Per-owner holds like the real sender (E16); the window check like <see cref="SendChordToAsync"/>.</summary>
    public Task<bool> HoldKeysAsync(object owner, nint expectedHwnd, IReadOnlyList<VirtualKey> keys, KeyMode mode = KeyMode.VirtualKey, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ct.ThrowIfCancellationRequested();
        if (expectedHwnd != 0 && ((foreground is not null && foreground() != expectedHwnd) || _isElevated(expectedHwnd)))
        {
            _log.Info("[safe mode] refused a hold: the expected window is not in front (WINDOW CHANGED) or is elevated");
            return Task.FromResult(false);
        }
        return HoldCore(owner, keys, mode, ct);
    }

    public Task<bool> ReleaseKeysAsync(object owner, IReadOnlyList<VirtualKey> keys, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        return ReleaseCore(owner, keys);
    }

    public Task ReleaseOwnerAsync(object owner)
    {
        ArgumentNullException.ThrowIfNull(owner);
        IReadOnlyList<VirtualKey> keys;
        lock (_records) keys = _owners.KeysOf(owner);
        return keys.Count == 0 ? Task.CompletedTask : ReleaseCore(owner, keys);
    }

    private Task<bool> HoldCore(object owner, IReadOnlyList<VirtualKey> keys, KeyMode mode, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Add(new InputRecord(InputRecordKind.KeysDown, [.. keys], null, mode));
        if (Result)
            lock (_records)
            {
                foreach (var k in keys) if (!_held.Contains(k)) _held.Add(k);
                _owners.Add(owner, keys);
            }
        _log.Info("[safe mode] would hold " + string.Join("+", keys) + Suffix(mode));
        return Task.FromResult(Result);
    }

    private Task<bool> ReleaseCore(object owner, IReadOnlyList<VirtualKey> keys)
    {
        ArgumentNullException.ThrowIfNull(keys);
        Add(new InputRecord(InputRecordKind.KeysUp, [.. keys], null));
        lock (_records)
        {
            _owners.Remove(owner, keys);
            _held.RemoveAll(k => keys.Contains(k) && !_owners.IsHeld(k));
        }
        _log.Info("[safe mode] would release " + string.Join("+", keys));
        return Task.FromResult(Result);
    }

    public Task ReleaseAllAsync()
    {
        VirtualKey[] held;
        lock (_records) { held = [.. _held]; _owners.Clear(); }
        if (held.Length > 0) return SendKeysUpAsync(held);
        return Task.CompletedTask;
    }

    public void Dispose() => _ = ReleaseAllAsync();

    private static string Suffix(KeyMode mode) => mode == KeyMode.Scancode ? " (scancode)" : "";

    private void Add(InputRecord r) { lock (_records) _records.Add(r); }
}
