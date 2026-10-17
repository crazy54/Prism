using System.Globalization;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;

namespace PrismControl.Desktop;

/// <summary>A point in absolute virtual-desktop coordinates, physical pixels (per-monitor-v2), as GetCursorPos reports on a PMv2 thread.</summary>
public readonly record struct PointI(int X, int Y)
{
    public override string ToString() => string.Create(CultureInfo.InvariantCulture, $"({X},{Y})");
}

public enum MouseButton { Left, Right, Middle, X1, X2 }

[Flags]
public enum ModifierKeys { None = 0, Shift = 1, Control = 2, Alt = 4, Windows = 8 }

/// <summary>What a mouse call did. Only <see cref="Sent"/> means input went out.</summary>
public enum MouseResult
{
    Sent,
    /// <summary>The window under the point runs above our integrity level: UIPI would drop the input silently.</summary>
    Elevated,
    /// <summary>The window under the point is not <see cref="MouseOptions.ExpectedHwnd"/> (something covers it, or it moved): refused, so we never click into the wrong app.</summary>
    WrongWindow,
    /// <summary>No window under the point (or the expected window no longer exists).</summary>
    NoWindow,
    /// <summary>The point is outside the virtual desktop, or the arguments are invalid.</summary>
    OutOfBounds,
    /// <summary>Windows did not accept every event (a secure desktop, a hook). Buttons and modifiers were released.</summary>
    Failed,
}

public static class MouseResultExtensions
{
    public static bool Succeeded(this MouseResult r) => r == MouseResult.Sent;
}

public sealed class MouseOptions
{
    public static readonly MouseOptions Default = new();

    /// <summary>Put the cursor back where it was afterwards (default true).</summary>
    public bool RestoreCursor { get; init; } = true;

    /// <summary>The minimum time between successive input batches (clicks of a multi-click, drag steps, wheel notches).</summary>
    public TimeSpan MinInterval { get; init; } = TimeSpan.FromMilliseconds(15);

    /// <summary>
    /// When non-zero, the top-level window under every target point (WindowFromPoint → GetAncestor(GA_ROOT)) must be this
    /// window's top-level window, or the call is refused with <see cref="MouseResult.WrongWindow"/>. Strongly recommended.
    /// Checked before every batch: each click of a multi-click and each wheel notch.
    /// </summary>
    public nint ExpectedHwnd { get; init; }

    /// <summary>
    /// With <see cref="ExpectedHwnd"/>: the FOREGROUND window must be that window too, re-checked before every batch (each
    /// click, drag step and wheel notch). The call stops with <see cref="MouseResult.WrongWindow"/> as soon as the user
    /// switches away (WINDOW CHANGED). Prism Sight sets it for every action.
    /// </summary>
    public bool RequireForeground { get; init; }
}

/// <summary>
/// Synthetic mouse input in absolute virtual-desktop coordinates (physical pixels; monitors may sit at negative
/// coordinates). Real: <see cref="SendInputMouseSender"/>. Safe mode: <see cref="RecordingMouseSender"/>.
/// Every call checks the window under each target point first (elevated → refused; not the expected window → refused),
/// releases every button and modifier that went down even on failure or cancellation, and restores the cursor.
/// </summary>
public interface IMouseSender
{
    Task<MouseResult> MoveAsync(PointI to, MouseOptions? options = null, CancellationToken ct = default);

    /// <summary>
    /// 1–3 clicks (double/triple click) at <paramref name="at"/>, or at the current cursor when null (no move, nothing to
    /// restore). <paramref name="mods"/> are held around the clicks: modifiers down → [move] → button down/up → modifiers
    /// up in reverse, always released.
    /// </summary>
    Task<MouseResult> ClickAsync(PointI? at, MouseButton button, int count = 1, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default);

    /// <summary>
    /// Modifiers down → button down at <paramref name="from"/> → <paramref name="steps"/> (1–500) moves spread over
    /// <paramref name="duration"/> (≤ 10 s) → button up at <paramref name="to"/> → modifiers up in reverse.
    /// </summary>
    Task<MouseResult> DragAsync(PointI from, PointI to, TimeSpan duration, int steps, MouseButton button = MouseButton.Left, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default);

    /// <summary>
    /// <paramref name="notches"/> wheel notches (positive = away from the user; ±1–±50), one 120-unit event per notch,
    /// with <paramref name="mods"/> held. At <paramref name="at"/> (the cursor is moved there) or at the current cursor.
    /// </summary>
    Task<MouseResult> WheelAsync(int notches, ModifierKeys mods = ModifierKeys.None, PointI? at = null, MouseOptions? options = null, CancellationToken ct = default);
}

/// <summary>Coordinate math (pure).</summary>
public static class ScreenMath
{
    /// <summary>
    /// SendInput's MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK coordinates (0–65535 across the virtual desktop) that
    /// land exactly on pixel <paramref name="p"/>. Windows maps back with floor(n × size / 65536), so we take the ceiling.
    /// </summary>
    public static (int Dx, int Dy) Normalize(PointI p, RectI virtualScreen) =>
        (Axis(p.X - virtualScreen.Left, virtualScreen.Width), Axis(p.Y - virtualScreen.Top, virtualScreen.Height));

    /// <summary>The pixel Windows maps normalized coordinates to (the inverse of <see cref="Normalize"/>).</summary>
    public static PointI Denormalize(int dx, int dy, RectI virtualScreen) =>
        new(virtualScreen.Left + (int)((long)dx * virtualScreen.Width / 65536), virtualScreen.Top + (int)((long)dy * virtualScreen.Height / 65536));

    private static int Axis(int offset, int size) => size <= 0 ? 0 : (int)Math.Clamp(((long)offset * 65536 + size - 1) / size, 0, 65535);

    public static bool Contains(RectI r, PointI p) => p.X >= r.Left && p.X < r.Right && p.Y >= r.Top && p.Y < r.Bottom;

    /// <summary>
    /// A pixel found in a capture of a window (e.g. by Prism Sight) → a screen point. <paramref name="captureScale"/> is
    /// capture pixels per screen pixel (0.5 for a half-size capture); <paramref name="windowBounds"/> is the window's DWM
    /// frame in physical pixels (WindowInfo.Bounds), which is never DPI-virtualized.
    /// </summary>
    public static PointI FromCapture(RectI windowBounds, PointI capturePx, double captureScale = 1.0)
    {
        if (captureScale <= 0 || double.IsNaN(captureScale)) throw new ArgumentOutOfRangeException(nameof(captureScale));
        return new(windowBounds.Left + (int)Math.Round(capturePx.X / captureScale), windowBounds.Top + (int)Math.Round(capturePx.Y / captureScale));
    }

    /// <summary>A point in a DPI-unaware (96-DPI logical) coordinate space → physical, for a monitor at <paramref name="dpi"/>.</summary>
    public static PointI LogicalToPhysical(PointI logical, RectI monitorPhysical, PointI monitorLogicalOrigin, uint dpi) =>
        new(monitorPhysical.Left + (int)Math.Round((logical.X - monitorLogicalOrigin.X) * dpi / 96.0),
            monitorPhysical.Top + (int)Math.Round((logical.Y - monitorLogicalOrigin.Y) * dpi / 96.0));
}

/// <summary>One INPUT the mouse sender builds: a mouse event (absolute move, button, wheel) or a modifier key.</summary>
internal readonly record struct MouseEvt(bool IsKey, uint Flags, int Dx, int Dy, int Data, ushort Vk, ushort Scan)
{
    public const uint Move = 0x1, LeftDown = 0x2, LeftUp = 0x4, RightDown = 0x8, RightUp = 0x10, MiddleDown = 0x20, MiddleUp = 0x40,
        XDown = 0x80, XUp = 0x100, Wheel = 0x800, VirtualDesk = 0x4000, Absolute = 0x8000;

    public static MouseEvt MoveTo((int Dx, int Dy) n) => new(false, Move | Absolute | VirtualDesk, n.Dx, n.Dy, 0, 0, 0);

    public static MouseEvt Button(MouseButton b, bool down) => b switch
    {
        MouseButton.Left => new(false, down ? LeftDown : LeftUp, 0, 0, 0, 0, 0),
        MouseButton.Right => new(false, down ? RightDown : RightUp, 0, 0, 0, 0, 0),
        MouseButton.Middle => new(false, down ? MiddleDown : MiddleUp, 0, 0, 0, 0, 0),
        MouseButton.X1 => new(false, down ? XDown : XUp, 0, 0, 1, 0, 0),
        _ => new(false, down ? XDown : XUp, 0, 0, 2, 0, 0),
    };

    public static MouseEvt WheelNotch(int sign) => new(false, Wheel, 0, 0, sign * 120, 0, 0);

    public static MouseEvt Key(ushort vk, ushort scan, bool extended, bool up) =>
        new(true, (extended ? User32.KEYEVENTF_EXTENDEDKEY : 0) | (up ? User32.KEYEVENTF_KEYUP : 0), 0, 0, 0, vk, scan);

    public bool IsButtonDown => !IsKey && (Flags & (LeftDown | RightDown | MiddleDown | XDown)) != 0;
    public bool IsKeyDown => IsKey && (Flags & User32.KEYEVENTF_KEYUP) == 0;

    /// <summary>The release for a down event (button or key).</summary>
    public MouseEvt Release() => IsKey ? this with { Flags = Flags | User32.KEYEVENTF_KEYUP } : this with { Flags = Flags << 1 };
}

/// <summary>The OS side of the mouse sender (every call runs in its own per-monitor-v2 DPI scope). Tests script it.</summary>
internal interface IMouseNative
{
    RectI VirtualScreen();
    PointI? CursorPos();
    /// <summary>The top-level window under the point (WindowFromPoint → GetAncestor(GA_ROOT)), 0 when none.</summary>
    nint WindowAt(PointI p);
    nint RootOf(nint hwnd);
    bool IsWindow(nint hwnd);
    bool IsAboveUs(nint hwnd);
    /// <summary>The foreground window (0 = unknown: <see cref="MouseOptions.RequireForeground"/> then refuses).</summary>
    nint Foreground() => 0;
    ushort ScanCode(ushort vk);
    /// <summary>One SendInput call; returns how many events Windows accepted.</summary>
    int Send(ReadOnlySpan<MouseEvt> events);
    Task DelayAsync(TimeSpan delay, CancellationToken ct);
}

internal sealed unsafe class Win32MouseNative : IMouseNative
{
    public RectI VirtualScreen()
    {
        using var dpi = DpiScope.PerMonitorV2();
        int x = User32.GetSystemMetrics(User32.SM_XVIRTUALSCREEN), y = User32.GetSystemMetrics(User32.SM_YVIRTUALSCREEN);
        return new RectI(x, y, x + User32.GetSystemMetrics(User32.SM_CXVIRTUALSCREEN), y + User32.GetSystemMetrics(User32.SM_CYVIRTUALSCREEN));
    }

    public PointI? CursorPos()
    {
        using var dpi = DpiScope.PerMonitorV2();
        return User32.GetCursorPos(out var p) != 0 ? new PointI(p.X, p.Y) : null;
    }

    public nint WindowAt(PointI p)
    {
        using var dpi = DpiScope.PerMonitorV2();
        var h = User32.WindowFromPoint(new POINT { X = p.X, Y = p.Y });
        return h == 0 ? 0 : RootOf(h);
    }

    public nint RootOf(nint hwnd) { var r = User32.GetAncestor(hwnd, User32.GA_ROOT); return r != 0 ? r : hwnd; }
    public bool IsWindow(nint hwnd) => hwnd != 0 && User32.IsWindow(hwnd) != 0;

    public bool IsAboveUs(nint hwnd)
    {
        User32.GetWindowThreadProcessId(hwnd, out var pid);
        return ProcessInfo.IsAboveUs(pid);
    }

    public ushort ScanCode(ushort vk) => (ushort)User32.MapVirtualKeyW(vk, User32.MAPVK_VK_TO_VSC_EX);

    public nint Foreground() => User32.GetForegroundWindow();

    public int Send(ReadOnlySpan<MouseEvt> events)
    {
        // Last line of defense: never inject in safe mode (the module should have picked RecordingMouseSender).
        if (events.IsEmpty || SafeModeEnvironment.FromEnvironment()) return 0;
        using var dpi = DpiScope.PerMonitorV2();
        var native = new INPUT[events.Length];
        for (var i = 0; i < events.Length; i++)
        {
            var e = events[i];
            native[i] = e.IsKey
                ? new INPUT { type = User32.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = e.Vk, wScan = e.Scan, dwFlags = e.Flags, dwExtraInfo = Win32ForegroundNative.ExtraInfoMarker } } }
                : new INPUT { type = User32.INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dx = e.Dx, dy = e.Dy, mouseData = (uint)e.Data, dwFlags = e.Flags, dwExtraInfo = Win32ForegroundNative.ExtraInfoMarker } } };
        }
        fixed (INPUT* p = native) return (int)User32.SendInput((uint)native.Length, p, sizeof(INPUT));
    }

    public Task DelayAsync(TimeSpan delay, CancellationToken ct) => delay <= TimeSpan.Zero ? Task.CompletedTask : Task.Delay(delay, ct);
}

/// <summary>
/// The real mouse sender: SendInput with MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK (exact pixels, negative monitor
/// origins included), metrics and hit tests read on a per-monitor-v2 thread (the plugin itself is DPI-unaware), our
/// dwExtraInfo marker, target checks before every batch, and the release guarantee. Attempts are serialized.
/// </summary>
public sealed class SendInputMouseSender : IMouseSender
{
    public const int MaxClicks = 3, MaxSteps = 500, MaxNotches = 50;
    public static readonly TimeSpan MaxDragDuration = TimeSpan.FromSeconds(10);

    private readonly IMouseNative _native;
    private readonly ILog _log;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public SendInputMouseSender(ILog? log = null) : this(new Win32MouseNative(), log ?? NullLog.Instance) { }

    internal SendInputMouseSender(IMouseNative native, ILog log)
    {
        _native = native;
        _log = log.For("mouse");
    }

    public Task<MouseResult> MoveAsync(PointI to, MouseOptions? options = null, CancellationToken ct = default) =>
        RunAsync(options ?? MouseOptions.Default, [to], restoreAllowed: false, ct, async (o, vs, held) =>
            await SendAsync([MouseEvt.MoveTo(ScreenMath.Normalize(to, vs))], held).ConfigureAwait(false));

    public Task<MouseResult> ClickAsync(PointI? at, MouseButton button, int count = 1, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (count is < 1 or > MaxClicks || !Enum.IsDefined(button) || !ValidMods(mods)) return Task.FromResult(MouseResult.OutOfBounds);
        var point = at ?? _native.CursorPos();
        if (point is null) return Task.FromResult(MouseResult.NoWindow);
        return RunAsync(options ?? MouseOptions.Default, [point.Value], restoreAllowed: at is not null, ct, async (o, vs, held) =>
        {
            for (var i = 0; i < count; i++)
            {
                var batch = new List<MouseEvt>();
                if (i == 0) batch.AddRange(ModifierDowns(mods));
                else
                {
                    await _native.DelayAsync(o.MinInterval, ct).ConfigureAwait(false);
                    var now = at ?? _native.CursorPos();
                    if (now is null) return MouseResult.NoWindow;
                    if (Check(o, now.Value) is { } refused) return refused; // the window under the point may have changed
                }
                // [modifiers +] move + down + up in one SendInput: the user's own input cannot interleave.
                if (at is { } p) batch.Add(MouseEvt.MoveTo(ScreenMath.Normalize(p, vs)));
                batch.Add(MouseEvt.Button(button, true));
                batch.Add(MouseEvt.Button(button, false));
                var r = await SendAsync([.. batch], held).ConfigureAwait(false);
                if (r != MouseResult.Sent) return r;
            }
            return await ReleaseModifiersAsync(held).ConfigureAwait(false);
        });
    }

    public Task<MouseResult> DragAsync(PointI from, PointI to, TimeSpan duration, int steps, MouseButton button = MouseButton.Left, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (steps is < 1 or > MaxSteps || duration < TimeSpan.Zero || duration > MaxDragDuration || !Enum.IsDefined(button) || !ValidMods(mods)) return Task.FromResult(MouseResult.OutOfBounds);
        return RunAsync(options ?? MouseOptions.Default, [from, to], restoreAllowed: true, ct, async (o, vs, held) =>
        {
            var r = await SendAsync([.. ModifierDowns(mods), MouseEvt.MoveTo(ScreenMath.Normalize(from, vs)), MouseEvt.Button(button, true)], held).ConfigureAwait(false);
            if (r != MouseResult.Sent) return r;
            var pause = TimeSpan.FromTicks(Math.Max(o.MinInterval.Ticks, duration.Ticks / steps));
            for (var i = 1; i <= steps; i++)
            {
                await _native.DelayAsync(pause, ct).ConfigureAwait(false);
                var p = new PointI(from.X + (int)Math.Round((to.X - from.X) * (double)i / steps), from.Y + (int)Math.Round((to.Y - from.Y) * (double)i / steps));
                // The button is held: stop (and release) the moment the user switches away.
                if (o.RequireForeground && Check(o, p) is { } moved) return moved;
                r = await SendAsync([MouseEvt.MoveTo(ScreenMath.Normalize(p, vs))], held).ConfigureAwait(false);
                if (r != MouseResult.Sent) return r;
            }
            r = await SendAsync([MouseEvt.Button(button, false)], held).ConfigureAwait(false);
            return r != MouseResult.Sent ? r : await ReleaseModifiersAsync(held).ConfigureAwait(false);
        });
    }

    public Task<MouseResult> WheelAsync(int notches, ModifierKeys mods = ModifierKeys.None, PointI? at = null, MouseOptions? options = null, CancellationToken ct = default)
    {
        if (notches == 0 || Math.Abs(notches) > MaxNotches || !ValidMods(mods)) return Task.FromResult(MouseResult.OutOfBounds);
        var point = at ?? _native.CursorPos();
        if (point is null) return Task.FromResult(MouseResult.NoWindow);
        return RunAsync(options ?? MouseOptions.Default, [point.Value], restoreAllowed: at is not null, ct, async (o, vs, held) =>
        {
            var first = ModifierDowns(mods);
            if (at is { } p) first.Add(MouseEvt.MoveTo(ScreenMath.Normalize(p, vs)));
            var sign = Math.Sign(notches);
            first.Add(MouseEvt.WheelNotch(sign));
            var r = await SendAsync([.. first], held).ConfigureAwait(false);
            for (var i = 1; i < Math.Abs(notches) && r == MouseResult.Sent; i++)
            {
                await _native.DelayAsync(o.MinInterval, ct).ConfigureAwait(false);
                // Every notch re-checks the window under the point (and the foreground with RequireForeground): a notch
                // never scrolls whatever moved in front since the first one.
                var now = at ?? _native.CursorPos();
                if (now is null) return MouseResult.NoWindow;
                if (Check(o, now.Value) is { } refused) return refused;
                r = await SendAsync([MouseEvt.WheelNotch(sign)], held).ConfigureAwait(false);
            }
            return r != MouseResult.Sent ? r : await ReleaseModifiersAsync(held).ConfigureAwait(false);
        });
    }

    private static bool ValidMods(ModifierKeys mods) => (mods & ~(ModifierKeys.Shift | ModifierKeys.Control | ModifierKeys.Alt | ModifierKeys.Windows)) == 0;

    /// <summary>Modifier downs in a fixed order: Ctrl, Shift, Alt, Win.</summary>
    private List<MouseEvt> ModifierDowns(ModifierKeys mods)
    {
        var list = new List<MouseEvt>();
        foreach (var (flag, vk, ext) in new (ModifierKeys, ushort, bool)[] { (ModifierKeys.Control, 0x11, false), (ModifierKeys.Shift, 0x10, false), (ModifierKeys.Alt, 0x12, false), (ModifierKeys.Windows, 0x5B, true) })
            if ((mods & flag) != 0) list.Add(MouseEvt.Key(vk, (ushort)(_native.ScanCode(vk) & 0xFF), ext, up: false));
        return list;
    }

    /// <summary>Releases the held modifiers in reverse (the normal end of a call; the finally in RunAsync covers failures).</summary>
    private async Task<MouseResult> ReleaseModifiersAsync(List<MouseEvt> held)
    {
        if (held.Count == 0) return MouseResult.Sent;
        return await SendAsync(held.AsEnumerable().Reverse().Select(e => e.Release()).ToArray(), held).ConfigureAwait(false);
    }

    /// <summary>Checks, saves the cursor, runs the body, and always releases what is held and restores the cursor.</summary>
    private async Task<MouseResult> RunAsync(MouseOptions o, PointI[] targets, bool restoreAllowed, CancellationToken ct,
        Func<MouseOptions, RectI, List<MouseEvt>, Task<MouseResult>> body)
    {
        ct.ThrowIfCancellationRequested();
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        var held = new List<MouseEvt>();
        PointI? saved = null;
        RectI vs = default;
        try
        {
            vs = _native.VirtualScreen();
            if (vs.IsEmpty || targets.Any(t => !ScreenMath.Contains(vs, t))) return Log(MouseResult.OutOfBounds, targets[0]);
            foreach (var t in targets)
                if (Check(o, t) is { } refused) return Log(refused, t);
            if (o.RestoreCursor && restoreAllowed) saved = _native.CursorPos();
            return Log(await body(o, vs, held).ConfigureAwait(false), targets[0]);
        }
        finally
        {
            ReleaseHeld(held);
            if (saved is { } back && ScreenMath.Contains(vs, back))
            {
                try { _native.Send([MouseEvt.MoveTo(ScreenMath.Normalize(back, vs))]); } catch (Exception) { }
            }
            _gate.Release();
        }
    }

    /// <summary>Null when input may go to the window under <paramref name="p"/>; else why not.</summary>
    private MouseResult? Check(MouseOptions o, PointI p)
    {
        var under = _native.WindowAt(p);
        if (under == 0) return MouseResult.NoWindow;
        if (o.ExpectedHwnd != 0)
        {
            if (!_native.IsWindow(o.ExpectedHwnd)) return MouseResult.NoWindow;
            var root = _native.RootOf(o.ExpectedHwnd);
            if (root != under) return MouseResult.WrongWindow;
            if (o.RequireForeground)
            {
                var fg = _native.Foreground();
                if (fg == 0 || _native.RootOf(fg) != root)
                {
                    _log.Debug("mouse: WINDOW CHANGED (the expected window is no longer in front)");
                    return MouseResult.WrongWindow;
                }
            }
        }
        return _native.IsAboveUs(under) ? MouseResult.Elevated : null;
    }

    /// <summary>Sends one batch and tracks what went down. A partial or throwing send releases at once and fails.</summary>
    private Task<MouseResult> SendAsync(MouseEvt[] batch, List<MouseEvt> held)
    {
        int sent;
        try { sent = Math.Clamp(_native.Send(batch), 0, batch.Length); }
        catch (Exception ex)
        {
            foreach (var e in batch) if (e.IsButtonDown || e.IsKeyDown) Hold(held, e);
            _log.Warn("SendInput threw " + ex.GetType().Name + "; releasing.");
            ReleaseHeld(held);
            return Task.FromResult(MouseResult.Failed);
        }
        for (var i = 0; i < sent; i++) Track(held, batch[i]);
        if (sent == batch.Length) return Task.FromResult(MouseResult.Sent);
        _log.Warn($"Windows accepted {sent} of {batch.Length} mouse events; releasing.");
        ReleaseHeld(held);
        return Task.FromResult(MouseResult.Failed);
    }

    private static void Track(List<MouseEvt> held, MouseEvt e)
    {
        if (e.IsButtonDown || e.IsKeyDown) { Hold(held, e); return; }
        var i = held.FindLastIndex(h => h.Release() == e);
        if (i >= 0) held.RemoveAt(i);
    }

    private static void Hold(List<MouseEvt> held, MouseEvt e) { if (!held.Contains(e)) held.Add(e); }

    /// <summary>Releases everything still down, newest first; retried once; never throws.</summary>
    private void ReleaseHeld(List<MouseEvt> held)
    {
        if (held.Count == 0) return;
        var remaining = held.AsEnumerable().Reverse().Select(e => e.Release()).ToArray();
        held.Clear();
        for (var attempt = 0; attempt < 2 && remaining.Length > 0; attempt++)
        {
            int ok;
            try { ok = Math.Clamp(_native.Send(remaining), 0, remaining.Length); } catch (Exception) { ok = 0; }
            remaining = remaining[ok..];
        }
        if (remaining.Length > 0) _log.Warn($"Windows did not accept {remaining.Length} releases; press and release the mouse button or modifier to reset it.");
    }

    private MouseResult Log(MouseResult r, PointI p)
    {
        if (r != MouseResult.Sent) _log.Debug($"mouse at {p}: {r}");
        return r;
    }
}

public enum MouseRecordKind { Move, Click, Drag, Wheel }

/// <summary>One call the recording fake received.</summary>
public sealed record MouseRecord(MouseRecordKind Kind, PointI? At, PointI? To, MouseButton Button, int Count, int Notches, ModifierKeys Mods, MouseOptions Options);

/// <summary>Safe mode and tests: records every call, logs one line, sends nothing, returns <see cref="Result"/> (default Sent).</summary>
public sealed class RecordingMouseSender(ILog? log = null) : IMouseSender
{
    private readonly ILog _log = (log ?? NullLog.Instance).For("mouse");
    private readonly List<MouseRecord> _records = [];

    public MouseResult Result { get; set; } = MouseResult.Sent;

    public IReadOnlyList<MouseRecord> Records { get { lock (_records) return [.. _records]; } }

    public void Clear() { lock (_records) _records.Clear(); }

    public Task<MouseResult> MoveAsync(PointI to, MouseOptions? options = null, CancellationToken ct = default) =>
        Add(new(MouseRecordKind.Move, to, null, MouseButton.Left, 0, 0, ModifierKeys.None, options ?? MouseOptions.Default), $"move to {to}", ct);

    public Task<MouseResult> ClickAsync(PointI? at, MouseButton button, int count = 1, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default) =>
        Add(new(MouseRecordKind.Click, at, null, button, count, 0, mods, options ?? MouseOptions.Default), $"click {(mods == ModifierKeys.None ? "" : mods + "+")}{button} ×{count} at {(at?.ToString() ?? "the cursor")}", ct);

    public Task<MouseResult> DragAsync(PointI from, PointI to, TimeSpan duration, int steps, MouseButton button = MouseButton.Left, ModifierKeys mods = ModifierKeys.None, MouseOptions? options = null, CancellationToken ct = default) =>
        Add(new(MouseRecordKind.Drag, from, to, button, steps, 0, mods, options ?? MouseOptions.Default), $"drag {(mods == ModifierKeys.None ? "" : mods + "+")}{button} {from} → {to}", ct);

    public Task<MouseResult> WheelAsync(int notches, ModifierKeys mods = ModifierKeys.None, PointI? at = null, MouseOptions? options = null, CancellationToken ct = default) =>
        Add(new(MouseRecordKind.Wheel, at, null, MouseButton.Left, 0, notches, mods, options ?? MouseOptions.Default), $"wheel {notches:+#;-#} {(mods == ModifierKeys.None ? "" : "with " + mods + " ")}at {(at?.ToString() ?? "the cursor")}", ct);

    private Task<MouseResult> Add(MouseRecord r, string what, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        lock (_records) _records.Add(r);
        _log.Info("[safe mode] would " + what);
        return Task.FromResult(Result);
    }
}
