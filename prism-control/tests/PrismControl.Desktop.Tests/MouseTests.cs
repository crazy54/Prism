using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

/// <summary>A scripted mouse OS: records batches, models the cursor, never touches the real mouse.</summary>
internal sealed class FakeMouseNative : IMouseNative
{
    // This PC's layout: a monitor at (-2560, 0), the primary at (0, 0), one above at (188, -1440).
    public RectI Screen = new(-2560, -1440, 3440, 1440);
    public PointI? Cursor = new(500, 500);
    public Func<PointI, nint> Under = _ => 0x100;
    public readonly Dictionary<nint, nint> Roots = new();
    public readonly HashSet<nint> Elevated = [];
    public readonly HashSet<nint> Dead = [];
    public readonly List<MouseEvt[]> Batches = [];
    public readonly Queue<int> Script = new(); // per Send: accepted count (-1 all, -2 throw)
    public readonly List<TimeSpan> Delays = [];
    public Action<int>? OnDelay;

    public RectI VirtualScreen() => Screen;
    public PointI? CursorPos() => Cursor;
    public nint WindowAt(PointI p) => Under(p);
    public nint RootOf(nint h) => Roots.TryGetValue(h, out var r) ? r : h;
    public bool IsWindow(nint h) => !Dead.Contains(h);
    public bool IsAboveUs(nint h) => Elevated.Contains(h);
    public ushort ScanCode(ushort vk) => vk switch { 0x11 => 0x1D, 0x10 => 0x2A, 0x12 => 0x38, 0x5B => 0xE05B, _ => 0 };

    public int Send(ReadOnlySpan<MouseEvt> events)
    {
        var b = events.ToArray();
        Batches.Add(b);
        var take = Script.Count > 0 ? Script.Dequeue() : -1;
        if (take == -2) throw new InvalidOperationException("simulated SendInput failure");
        var n = take < 0 ? b.Length : Math.Min(take, b.Length);
        foreach (var e in b.Take(n))
            if ((e.Flags & MouseEvt.Absolute) != 0) Cursor = ScreenMath.Denormalize(e.Dx, e.Dy, Screen);
        return n;
    }

    public Task DelayAsync(TimeSpan delay, CancellationToken ct)
    {
        Delays.Add(delay);
        OnDelay?.Invoke(Delays.Count);
        ct.ThrowIfCancellationRequested();
        return Task.CompletedTask;
    }

    public IEnumerable<MouseEvt> All => Batches.SelectMany(b => b);

    /// <summary>Buttons and keys whose down was sent without a later up (should always be empty).</summary>
    public List<MouseEvt> StillDown()
    {
        var down = new List<MouseEvt>();
        foreach (var e in All)
        {
            if (e.IsButtonDown || e.IsKeyDown) down.Add(e);
            else { var i = down.FindLastIndex(d => d.Release() == e); if (i >= 0) down.RemoveAt(i); }
        }
        return down;
    }

    public string Describe() => string.Join(" | ", Batches.Select(b => string.Join(" ", b.Select(D))));

    private string D(MouseEvt e)
    {
        if (e.IsKey) return (e.IsKeyDown ? "+" : "-") + e.Vk.ToString("X2");
        if ((e.Flags & MouseEvt.Absolute) != 0) return "move" + ScreenMath.Denormalize(e.Dx, e.Dy, Screen);
        if ((e.Flags & MouseEvt.Wheel) != 0) return "wheel" + e.Data;
        return e.Flags switch { MouseEvt.LeftDown => "L↓", MouseEvt.LeftUp => "L↑", MouseEvt.RightDown => "R↓", MouseEvt.RightUp => "R↑", MouseEvt.MiddleDown => "M↓", MouseEvt.MiddleUp => "M↑", MouseEvt.XDown => "X" + e.Data + "↓", MouseEvt.XUp => "X" + e.Data + "↑", _ => "?" };
    }
}

public class ScreenMathTests
{
    [Test]
    public void Normalization_hits_every_pixel_exactly_including_negative_origins()
    {
        RectI[] desktops =
        [
            new(-2560, -1440, 3440, 1440),   // this PC: three monitors, two at negative coordinates
            new(0, 0, 1920, 1080),
            new(-3840, 0, 2560, 2160),       // a 3840×2160 at 150 % left of a 2560×1440 at 100 % (physical pixels)
            new(-1, -1, 1, 1),               // tiny
            new(-7, 3, 65543, 9),            // wider than 65536
        ];
        foreach (var vs in desktops)
        {
            var xs = new[] { vs.Left, vs.Left + 1, vs.Right - 1, 0, -1 }.Concat(Enumerable.Range(0, 400).Select(i => vs.Left + (int)((long)vs.Width * i / 400)));
            var ys = new[] { vs.Top, vs.Bottom - 1, 0, -1 }.Concat(Enumerable.Range(0, 100).Select(i => vs.Top + (int)((long)vs.Height * i / 100)));
            foreach (var x in xs)
                foreach (var y in ys.Take(8))
                {
                    var p = new PointI(x, y);
                    if (!ScreenMath.Contains(vs, p)) continue;
                    var (dx, dy) = ScreenMath.Normalize(p, vs);
                    Assert.InRange(dx, 0, 65535);
                    Assert.InRange(dy, 0, 65535);
                    if (vs.Width <= 65536 && vs.Height <= 65536) Assert.Equal(p, ScreenMath.Denormalize(dx, dy, vs), $"{p} on {vs}");
                }
        }
    }

    [Test]
    public void Normalization_clamps_and_containment()
    {
        var vs = new RectI(-2560, -1440, 3440, 1440);
        Assert.Equal((0, 0), ScreenMath.Normalize(new PointI(-9999, -9999), vs));
        Assert.Equal((65535, 65535), ScreenMath.Normalize(new PointI(9999, 9999), vs));
        Assert.True(ScreenMath.Contains(vs, new PointI(-2560, -1440)));
        Assert.False(ScreenMath.Contains(vs, new PointI(3440, 0)), "Right is exclusive");
        Assert.False(ScreenMath.Contains(vs, new PointI(0, 1440)));
    }

    [Test]
    public void Capture_pixels_and_logical_points_map_to_physical()
    {
        var window = new RectI(-2400, 120, -1000, 900);           // a window on the left monitor
        Assert.Equal(new PointI(-2300, 170), ScreenMath.FromCapture(window, new PointI(100, 50)));
        Assert.Equal(new PointI(-2200, 220), ScreenMath.FromCapture(window, new PointI(100, 50), 0.5), "half-size capture");
        Assert.Equal(new PointI(-2333, 153), ScreenMath.FromCapture(window, new PointI(100, 50), 1.5));
        Assert.Throws<ArgumentOutOfRangeException>(() => ScreenMath.FromCapture(window, default, 0));
        // A 150 % monitor whose physical origin is (-3840, 0) and logical (96-DPI) origin is (-2560, 0).
        Assert.Equal(new PointI(-3690, 150), ScreenMath.LogicalToPhysical(new PointI(-2460, 100), new RectI(-3840, 0, 0, 2160), new PointI(-2560, 0), 144));
        Assert.Equal(new PointI(10, 20), ScreenMath.LogicalToPhysical(new PointI(10, 20), new RectI(0, 0, 100, 100), new PointI(0, 0), 96));
    }
}

public class MouseTests
{
    private static (SendInputMouseSender S, FakeMouseNative N, RecordingLog L) Make(Action<FakeMouseNative>? setup = null)
    {
        var n = new FakeMouseNative();
        setup?.Invoke(n);
        var log = new RecordingLog();
        return (new SendInputMouseSender(n, log), n, log);
    }

    private static readonly PointI Target = new(-1200, 300); // on the left monitor (negative x)

    [Test]
    public async Task Click_is_move_down_up_in_one_batch_then_the_cursor_returns()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.ClickAsync(Target, MouseButton.Left));
        Assert.Equal("move(-1200,300) L↓ L↑ | move(500,500)", n.Describe());
        Assert.Equal(new PointI(500, 500), n.Cursor);
        Assert.Empty(n.StillDown());
    }

    [Test]
    public async Task Double_click_waits_the_minimum_interval_and_RestoreCursor_can_be_off()
    {
        var (s, n, _) = Make();
        var o = new MouseOptions { RestoreCursor = false, MinInterval = TimeSpan.FromMilliseconds(40) };
        Assert.Equal(MouseResult.Sent, await s.ClickAsync(Target, MouseButton.Right, 2, options: o));
        Assert.Equal("move(-1200,300) R↓ R↑ | move(-1200,300) R↓ R↑", n.Describe());
        Assert.Equal(TimeSpan.FromMilliseconds(40), Assert.Single(n.Delays));
        Assert.Equal(Target, n.Cursor);
    }

    [Test]
    public async Task Every_button_maps_to_its_flags()
    {
        var (s, n, _) = Make();
        foreach (var b in new[] { MouseButton.Middle, MouseButton.X1, MouseButton.X2 })
            Assert.Equal(MouseResult.Sent, await s.ClickAsync(Target, b, options: new MouseOptions { RestoreCursor = false }));
        Assert.Equal("move(-1200,300) M↓ M↑ | move(-1200,300) X1↓ X1↑ | move(-1200,300) X2↓ X2↑", n.Describe());
    }

    [Test]
    public async Task Refusals_send_nothing()
    {
        var (s, n, _) = Make(n => n.Elevated.Add(0x100));
        Assert.Equal(MouseResult.Elevated, await s.ClickAsync(Target, MouseButton.Left));
        n.Elevated.Clear();
        Assert.Equal(MouseResult.WrongWindow, await s.ClickAsync(Target, MouseButton.Left, options: new MouseOptions { ExpectedHwnd = 0x200 }), "another app covers the point");
        n.Dead.Add(0x300);
        Assert.Equal(MouseResult.NoWindow, await s.ClickAsync(Target, MouseButton.Left, options: new MouseOptions { ExpectedHwnd = 0x300 }), "the expected window is gone");
        Assert.Equal(MouseResult.OutOfBounds, await s.ClickAsync(new PointI(5000, 0), MouseButton.Left));
        Assert.Equal(MouseResult.OutOfBounds, await s.ClickAsync(Target, MouseButton.Left, 4));
        Assert.Equal(MouseResult.OutOfBounds, await s.ClickAsync(Target, (MouseButton)9));
        n.Under = _ => 0;
        Assert.Equal(MouseResult.NoWindow, await s.ClickAsync(Target, MouseButton.Left));
        Assert.Empty(n.Batches);
    }

    [Test]
    public async Task The_expected_window_is_compared_by_its_top_level_window()
    {
        var (s, n, _) = Make(n => n.Roots[0x101] = 0x100);
        Assert.Equal(MouseResult.Sent, await s.ClickAsync(Target, MouseButton.Left, options: new MouseOptions { ExpectedHwnd = 0x101 }), "a child handle of the window under the point");
    }

    [Test]
    public async Task A_window_change_between_clicks_stops_the_rest()
    {
        var (s, n, _) = Make();
        n.OnDelay = _ => n.Under = _ => 0x999;
        Assert.Equal(MouseResult.WrongWindow, await s.ClickAsync(Target, MouseButton.Left, 3, options: new MouseOptions { ExpectedHwnd = 0x100 }));
        Assert.Equal(2, n.Batches.Count, "first click, then the cursor restore");
        Assert.Empty(n.StillDown());
    }

    [Test]
    public async Task A_partial_batch_releases_the_button_and_restores_the_cursor()
    {
        var (s, n, log) = Make();
        n.Script.Enqueue(2); // move + down accepted, up lost
        Assert.Equal(MouseResult.Failed, await s.ClickAsync(Target, MouseButton.Left));
        Assert.Equal("move(-1200,300) L↓ L↑ | L↑ | move(500,500)", n.Describe());
        Assert.Empty(n.StillDown());
        Assert.Equal(new PointI(500, 500), n.Cursor);
        Assert.Contains("accepted 2 of 3", log.Text);
    }

    [Test]
    public async Task A_throwing_SendInput_releases_and_reports_failure()
    {
        var (s, n, _) = Make();
        n.Script.Enqueue(-2);
        Assert.Equal(MouseResult.Failed, await s.ClickAsync(Target, MouseButton.Left));
        Assert.Equal("move(-1200,300) L↓ L↑ | L↑ | move(500,500)", n.Describe());
    }

    [Test]
    public async Task Click_with_modifiers_orders_down_and_up_and_releases_them()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.ClickAsync(Target, MouseButton.Left, 2, ModifierKeys.Shift | ModifierKeys.Control));
        Assert.Equal("+11 +10 move(-1200,300) L↓ L↑ | move(-1200,300) L↓ L↑ | -10 -11 | move(500,500)", n.Describe());
        Assert.Empty(n.StillDown());
    }

    [Test]
    public async Task Click_at_the_cursor_neither_moves_nor_restores()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.ClickAsync(null, MouseButton.Left, mods: ModifierKeys.Alt));
        Assert.Equal("+12 L↓ L↑ | -12", n.Describe());
        Assert.Equal(new PointI(500, 500), n.Cursor);
        n.Batches.Clear();
        n.Under = p => p == new PointI(500, 500) ? 0x200 : 0x100;
        Assert.Equal(MouseResult.WrongWindow, await s.ClickAsync(null, MouseButton.Left, options: new MouseOptions { ExpectedHwnd = 0x100 }), "the window under the cursor is checked too");
        Assert.Empty(n.Batches);
        n.Cursor = null;
        Assert.Equal(MouseResult.NoWindow, await s.ClickAsync(null, MouseButton.Left));
    }

    [Test]
    public async Task A_failed_modified_click_releases_button_and_modifiers()
    {
        var (s, n, _) = Make();
        n.Script.Enqueue(3); // +Ctrl, move, L down accepted; L up lost
        Assert.Equal(MouseResult.Failed, await s.ClickAsync(Target, MouseButton.Left, mods: ModifierKeys.Control));
        Assert.Equal("+11 move(-1200,300) L↓ L↑ | L↑ -11 | move(500,500)", n.Describe(), "newest first: the button, then the modifier");
        Assert.Empty(n.StillDown());
        Assert.Equal(MouseResult.OutOfBounds, await s.ClickAsync(Target, MouseButton.Left, mods: (ModifierKeys)32));
    }

    [Test]
    public async Task Drag_with_modifiers_holds_them_for_the_whole_drag()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.DragAsync(new PointI(0, 0), new PointI(10, 0), TimeSpan.FromMilliseconds(20), 2, MouseButton.Right, ModifierKeys.Shift));
        Assert.Equal("+10 move(0,0) R↓ | move(5,0) | move(10,0) | R↑ | -10 | move(500,500)", n.Describe());
        Assert.Empty(n.StillDown());
    }

    [Test]
    public async Task Drag_steps_linearly_over_the_duration_and_releases_at_the_end()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.DragAsync(new PointI(-100, 0), new PointI(300, 400), TimeSpan.FromMilliseconds(400), 4));
        Assert.Equal("move(-100,0) L↓ | move(0,100) | move(100,200) | move(200,300) | move(300,400) | L↑ | move(500,500)", n.Describe());
        Assert.True(n.Delays.All(d => d == TimeSpan.FromMilliseconds(100)));
        Assert.Empty(n.StillDown());
        n.Batches.Clear(); n.Delays.Clear();
        await s.DragAsync(new PointI(0, 0), new PointI(10, 0), TimeSpan.Zero, 2, options: new MouseOptions { MinInterval = TimeSpan.FromMilliseconds(20) });
        Assert.True(n.Delays.All(d => d == TimeSpan.FromMilliseconds(20)), "never faster than MinInterval");
    }

    [Test]
    public async Task Drag_checks_both_ends_and_validates()
    {
        var (s, n, _) = Make(n => n.Under = p => p.X > 1000 ? 0x200 : 0x100);
        Assert.Equal(MouseResult.WrongWindow, await s.DragAsync(new PointI(0, 0), new PointI(2000, 0), TimeSpan.FromMilliseconds(10), 2, options: new MouseOptions { ExpectedHwnd = 0x100 }));
        Assert.Equal(MouseResult.OutOfBounds, await s.DragAsync(new PointI(0, 0), new PointI(1, 0), TimeSpan.FromSeconds(11), 2));
        Assert.Equal(MouseResult.OutOfBounds, await s.DragAsync(new PointI(0, 0), new PointI(1, 0), TimeSpan.Zero, 0));
        Assert.Empty(n.Batches);
    }

    [Test]
    public async Task Cancelling_mid_drag_releases_the_button_and_restores_the_cursor()
    {
        var (s, n, _) = Make();
        using var cts = new CancellationTokenSource();
        n.OnDelay = i => { if (i == 2) cts.Cancel(); };
        await Assert.ThrowsAsync<OperationCanceledException>(() => s.DragAsync(new PointI(0, 0), new PointI(100, 100), TimeSpan.FromMilliseconds(100), 5, ct: cts.Token));
        Assert.Empty(n.StillDown());
        Assert.Equal(new PointI(500, 500), n.Cursor);
        Assert.Contains("L↑", n.Describe());
    }

    [Test]
    public async Task A_failed_drag_step_releases()
    {
        var (s, n, _) = Make();
        n.Script.Enqueue(-1);
        n.Script.Enqueue(0); // the first step is refused
        Assert.Equal(MouseResult.Failed, await s.DragAsync(new PointI(0, 0), new PointI(100, 0), TimeSpan.FromMilliseconds(20), 2));
        Assert.Empty(n.StillDown());
    }

    [Test]
    public async Task Wheel_holds_modifiers_sends_one_event_per_notch_and_releases_in_reverse()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.WheelAsync(-3, ModifierKeys.Control | ModifierKeys.Shift, Target));
        Assert.Equal("+11 +10 move(-1200,300) wheel-120 | wheel-120 | wheel-120 | -10 -11 | move(500,500)", n.Describe(), "modifiers first, then the move");
        Assert.Equal(2, n.Delays.Count);
        Assert.Empty(n.StillDown());
        Assert.Equal((ushort)0x1D, n.Batches[0][0].Scan, "scan codes for modifiers");
    }

    [Test]
    public async Task Wheel_at_the_cursor_does_not_move_it()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.WheelAsync(2, ModifierKeys.Windows));
        Assert.Equal("+5B wheel120 | wheel120 | -5B", n.Describe());
        Assert.True((n.Batches[0][0].Flags & User32.KEYEVENTF_EXTENDEDKEY) != 0, "Win is extended");
        n.Cursor = null;
        Assert.Equal(MouseResult.NoWindow, await s.WheelAsync(1));
    }

    [Test]
    public async Task Wheel_failure_releases_held_modifiers_and_validates()
    {
        var (s, n, _) = Make();
        n.Script.Enqueue(-1);
        n.Script.Enqueue(-2);
        Assert.Equal(MouseResult.Failed, await s.WheelAsync(3, ModifierKeys.Alt, Target));
        Assert.Empty(n.StillDown());
        Assert.Equal(MouseResult.OutOfBounds, await s.WheelAsync(0));
        Assert.Equal(MouseResult.OutOfBounds, await s.WheelAsync(51));
        Assert.Equal(MouseResult.OutOfBounds, await s.WheelAsync(1, (ModifierKeys)64));
    }

    [Test]
    public async Task Move_goes_to_the_exact_pixel_and_stays()
    {
        var (s, n, _) = Make();
        Assert.Equal(MouseResult.Sent, await s.MoveAsync(new PointI(-2560, -1440)));
        Assert.Equal(new PointI(-2560, -1440), n.Cursor);
        Assert.Equal(MouseResult.Sent, await s.MoveAsync(new PointI(3439, 1439)));
        Assert.Equal(new PointI(3439, 1439), n.Cursor);
        Assert.Equal(2, n.Batches.Count, "a move is never undone");
    }

    [Test]
    public async Task Recording_fake_records_and_logs()
    {
        var log = new RecordingLog();
        var r = new RecordingMouseSender(log);
        var o = new MouseOptions { ExpectedHwnd = 0x42 };
        Assert.Equal(MouseResult.Sent, await r.ClickAsync(Target, MouseButton.Left, 2, options: o));
        Assert.Equal(MouseResult.Sent, await r.DragAsync(new PointI(1, 2), new PointI(3, 4), TimeSpan.FromMilliseconds(5), 3));
        Assert.Equal(MouseResult.Sent, await r.WheelAsync(-2, ModifierKeys.Control));
        Assert.Equal(MouseResult.Sent, await r.MoveAsync(new PointI(7, 8)));
        Assert.Equal(4, r.Records.Count);
        Assert.Equal((nint)0x42, r.Records[0].Options.ExpectedHwnd);
        Assert.Equal(2, r.Records[0].Count);
        Assert.Contains("[safe mode] would click Left ×2 at (-1200,300)", log.Text);
        Assert.Contains("[safe mode] would wheel -2 with Control at the cursor", log.Text);
        r.Result = MouseResult.WrongWindow;
        Assert.Equal(MouseResult.WrongWindow, await r.MoveAsync(default));
        r.Clear();
        Assert.Empty(r.Records);
        Assert.False(MouseResult.Failed.Succeeded());
        Assert.True(MouseResult.Sent.Succeeded());
    }

    [Test(Category = "integration")]
    public void Real_virtual_screen_contains_the_cursor()
    {
        // READ-ONLY: system metrics and the cursor position on a PMv2 thread.
        var n = new Win32MouseNative();
        var vs = n.VirtualScreen();
        var c = n.CursorPos();
        Console.WriteLine($"     virtual desktop {vs}");
        Assert.False(vs.IsEmpty);
        if (c is { } p) Assert.True(ScreenMath.Contains(vs, p), $"{p} in {vs}");
    }
}

/// <summary>
/// The ONLY real-input test (lead rule): move and click inside a window this test creates and owns. The window is
/// topmost, WS_EX_NOACTIVATE and a tool window (never focused, never in alt-tab), 80×80 near the primary monitor's
/// corner, shown for a fraction of a second; the expected-window check means a click can never land in another app.
/// </summary>
public partial class MouseRealInputTests
{
    private static readonly ConcurrentQueue<uint> Messages = new();

    [UnmanagedCallersOnly]
    private static nint Proc(nint h, uint msg, nint wp, nint lp)
    {
        if (msg is 0x0200 or 0x0201 or 0x0202) Messages.Enqueue(msg); // WM_MOUSEMOVE, WM_LBUTTONDOWN, WM_LBUTTONUP
        if (msg == 0x0021) return 3;                                  // WM_MOUSEACTIVATE → MA_NOACTIVATE
        return Win.DefWindowProcW(h, msg, wp, lp);
    }

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Click_lands_in_our_own_window_without_taking_focus_and_the_cursor_returns()
    {
        while (Messages.TryDequeue(out _)) { }
        var native = new Win32MouseNative();
        var cursorBefore = native.CursorPos();
        var foregroundBefore = Win.GetForegroundWindow();
        nint hwnd = 0;
        var ready = new ManualResetEventSlim();
        var stop = new ManualResetEventSlim();
        var ui = new Thread(() =>
        {
            hwnd = Win.CreateTestWindow();
            Win.ShowWindow(hwnd, 4 /* SW_SHOWNOACTIVATE */);
            ready.Set();
            while (!stop.IsSet)
            {
                while (Win.PeekMessageW(out var m, 0, 0, 0, 1) != 0) Win.DispatchMessageW(m);
                Thread.Sleep(5);
            }
            Win.DestroyWindow(hwnd);
        }) { IsBackground = true };
        ui.Start();
        ready.Wait();
        try
        {
            await Task.Delay(100);
            var sender = new SendInputMouseSender(new RecordingLog());
            var inside = new PointI(140, 140); // the window spans (100,100)-(180,180) on the primary monitor
            var r = await sender.ClickAsync(inside, MouseButton.Left, options: new MouseOptions { ExpectedHwnd = hwnd });
            if (r == MouseResult.WrongWindow) Assert.Skip("another topmost window covers the test spot; nothing was sent");
            Assert.Equal(MouseResult.Sent, r);
            await Task.Delay(200);
            var got = Messages.ToArray();
            Assert.True(got.Contains(0x0201u) && got.Contains(0x0202u), "WM_LBUTTONDOWN and WM_LBUTTONUP reached our window: " + string.Join(",", got.Select(m => m.ToString("X"))));
            Assert.Equal(foregroundBefore, Win.GetForegroundWindow(), "the click did not take the foreground");
            if (cursorBefore is { } c) Assert.Equal(c, native.CursorPos(), "cursor restored");
            Assert.Equal(MouseResult.WrongWindow, await sender.ClickAsync(new PointI(140, 140), MouseButton.Left, options: new MouseOptions { ExpectedHwnd = Win.GetShellWindow() }), "never clicks when the window under the point is not the expected one");
        }
        finally
        {
            stop.Set();
            ui.Join(2000);
        }
    }

    private static unsafe partial class Win
    {
        [LibraryImport("user32.dll")] public static partial nint DefWindowProcW(nint h, uint m, nint w, nint l);
        [LibraryImport("user32.dll")] public static partial nint GetForegroundWindow();
        [LibraryImport("user32.dll")] public static partial nint GetShellWindow();
        [LibraryImport("user32.dll")] public static partial int ShowWindow(nint h, int c);
        [LibraryImport("user32.dll")] public static partial int DestroyWindow(nint h);
        [LibraryImport("user32.dll")] public static partial int PeekMessageW(out TMSG m, nint h, uint a, uint b, uint r);
        [StructLayout(LayoutKind.Sequential)] public struct TMSG { public nint hwnd; public uint message; public nint wParam, lParam; public uint time; public int x, y; public uint priv; }
        [LibraryImport("user32.dll")] public static partial nint DispatchMessageW(in TMSG m);
        [LibraryImport("user32.dll")] public static partial ushort RegisterClassExW(WNDCLASSEXW* wc);
        [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial nint CreateWindowExW(uint ex, string cls, string t, uint st, int x, int y, int w, int h, nint p, nint m, nint i, nint pa);
        [LibraryImport("kernel32.dll", StringMarshalling = StringMarshalling.Utf16)] public static partial nint GetModuleHandleW(string? n);

        private static bool _registered;

        public static nint CreateTestWindow()
        {
            if (!_registered)
            {
                fixed (char* name = "PrismMouseTestWindow")
                {
                    var wc = new WNDCLASSEXW { cbSize = (uint)sizeof(WNDCLASSEXW), lpfnWndProc = &Proc, hInstance = GetModuleHandleW(null), lpszClassName = name };
                    RegisterClassExW(&wc);
                }
                _registered = true;
            }
            // WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE; WS_POPUP (hidden until SW_SHOWNOACTIVATE).
            using var dpi = DpiScope.PerMonitorV2();
            return CreateWindowExW(0x08000088, "PrismMouseTestWindow", "prism-mouse-test", 0x80000000, 100, 100, 80, 80, 0, 0, GetModuleHandleW(null), 0);
        }
    }
}
