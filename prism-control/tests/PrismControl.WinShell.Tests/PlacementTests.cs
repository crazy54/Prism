using PrismControl.Core.Devices;
using PrismControl.Core.Layouts;
using PrismControl.Testing;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Tests;

public class PlacementMathTests
{
    private static readonly PixelRect Work = new(0, 0, 3440, 1388);

    [Test]
    public void Zones_tile_the_work_area_exactly()
    {
        var l = Zones.Rect(ZoneId.LeftHalf, Work);
        var r = Zones.Rect(ZoneId.RightHalf, Work);
        Assert.Equal(new PixelRect(0, 0, 1720, 1388), l);
        Assert.Equal(l.Right, r.Left, "no gap, no overlap");
        Assert.Equal(Work.Right, r.Right);
        var thirds = new[] { ZoneId.LeftThird, ZoneId.CenterThird, ZoneId.RightThird }.Select(z => Zones.Rect(z, Work)).ToList();
        Assert.Equal(thirds[0].Right, thirds[1].Left);
        Assert.Equal(thirds[1].Right, thirds[2].Left);
        Assert.Equal(Work.Width, thirds.Sum(t => t.Width));
        Assert.Equal(Zones.Rect(ZoneId.LeftTwoThirds, Work).Right, thirds[1].Right);
        var quads = new[] { ZoneId.TopLeft, ZoneId.TopRight, ZoneId.BottomLeft, ZoneId.BottomRight }.Select(z => Zones.Rect(z, Work)).ToList();
        Assert.Equal(Work.Area, quads.Sum(q => q.Area));
        // Offset work areas (a monitor left of the primary, a taskbar at the top).
        var left = new PixelRect(-2560, 48, 0, 1440);
        Assert.Equal(new PixelRect(-1280, 48, 0, 1440), Zones.Rect(ZoneId.RightHalf, left));
        Assert.Equal(Work, Zones.Rect(ZoneId.Maximize, Work));
        var c = Zones.Rect(ZoneId.Center, Work);
        Assert.Equal(Work.CenterX, c.CenterX);
        foreach (var z in Zones.All) Assert.Equal(z, Zones.Parse(Zones.Key(z)));
        Assert.Equal(ZoneId.LeftHalf, Zones.Parse("nonsense"));
        Assert.Equal(4, Zones.Set(null).Count);
        Assert.Equal(13, Zones.Set("all").Count);
    }

    [Test]
    public void Frame_compensation_adds_the_invisible_borders()
    {
        // GetWindowRect vs DWM frame on this PC: 7/0/7/7 for Win32/Electron windows; 0 for some apps.
        var window = new PixelRect(93, 100, 1107, 907);
        var frame = new PixelRect(100, 100, 1100, 900);
        Assert.Equal(new PixelRect(-7, 0, 1727, 1395), PlacementMath.WindowRectForFrame(new PixelRect(0, 0, 1720, 1388), window, frame));
        Assert.Equal(new PixelRect(0, 0, 50, 50), PlacementMath.WindowRectForFrame(new PixelRect(0, 0, 50, 50), frame, frame), "no borders");
        Assert.Equal(new PixelRect(0, 0, 50, 50), PlacementMath.WindowRectForFrame(new PixelRect(0, 0, 50, 50), new PixelRect(0, 0, 900, 900), frame), "absurd borders (mid-animation) are ignored");
    }

    [Test]
    public void Cross_monitor_moves_keep_relative_geometry_and_fit()
    {
        var from = new PixelRect(0, 0, 3440, 1388);
        var to = new PixelRect(-2560, 0, 0, 1392);
        var mapped = PlacementMath.MapToWorkArea(new PixelRect(1720, 0, 3440, 1388), from, to);
        Assert.Equal(new PixelRect(-1280, 0, 0, 1392), mapped, "the right half stays the right half");
        var big = PlacementMath.MapToWorkArea(new PixelRect(-100, -100, 5000, 3000), from, to);
        Assert.True(big.Left >= to.Left && big.Right <= to.Right && big.Top >= to.Top && big.Bottom <= to.Bottom, "clamped to the target");
        var mons = Samples.Monitors().Select(m => m.Bounds).ToList();
        Assert.Equal(1, PlacementMath.MonitorIndexOf(new PixelRect(100, 100, 900, 900), mons));
        Assert.Equal(0, PlacementMath.MonitorIndexOf(new PixelRect(-500, 100, 300, 900), mons), "most of the area wins");
        Assert.Equal(2, PlacementMath.MonitorIndexOf(new PixelRect(500, -3000, 900, -2000), mons), "off-screen: the nearest");
        Assert.True(PlacementMath.Near(new PixelRect(0, 0, 100, 100), new PixelRect(5, -5, 103, 108)));
        Assert.False(PlacementMath.Near(new PixelRect(0, 0, 100, 100), new PixelRect(0, 0, 120, 100)));
    }

    [Test]
    public void Dpi_scope_makes_the_thread_per_monitor_aware_and_restores_it()
    {
        var before = ThreadDpi.IsPerMonitorAware;
        using (ThreadDpi.PerMonitorV2()) Assert.True(ThreadDpi.IsPerMonitorAware);
        Assert.Equal(before, ThreadDpi.IsPerMonitorAware);
    }
}

public class PlacementServiceTests
{
    private const nint Win = 0x2001;

    private static Rig WithTarget(PixelRect? frame = null, bool maximized = false, bool elevated = false, bool hung = false)
    {
        var rig = new Rig();
        rig.Geometry.Add(Win, frame ?? new PixelRect(100, 100, 1100, 900), maximized: maximized, elevated: elevated, hung: hung);
        rig.Foreground.LastExternal = Win;
        rig.Catalog.Set(Samples.Window(Win, "editor.exe", "notes"));
        return rig;
    }

    private static Task<PlaceResult> Run(Rig rig, Func<Task<PlaceResult>> f) => rig.Drive(f());

    [Test]
    public async Task Throw_restores_a_maximized_window_and_compensates_the_frame()
    {
        await using var rig = WithTarget(maximized: true);
        var uw = rig.Services.Display.Find(Samples.UwId)!;
        var r = await Run(rig, () => rig.Services.Placement.ThrowAsync(uw, ZoneId.LeftHalf));
        Assert.Equal(PlaceOutcome.Moved, r.Outcome);
        Assert.True(r.Exact);
        Assert.Equal("restore|bounds -7,0,1734x1395", string.Join("|", rig.WindowWriter.Calls));
        Assert.Equal(new PixelRect(0, 0, 1720, 1388), rig.Geometry.Windows[Win].Frame, "the visible frame fills the zone exactly");
    }

    [Test]
    public async Task Dpi_change_on_arrival_is_measured_and_applied_again()
    {
        await using var rig = WithTarget();
        rig.WindowWriter.DpiJolt = true;
        var left = rig.Services.Display.Find(Samples.Qh32Id)!;
        var r = await Run(rig, () => rig.Services.Placement.ThrowAsync(left, ZoneId.RightHalf));
        Assert.Equal(PlaceOutcome.Moved, r.Outcome);
        Assert.Equal(2, rig.WindowWriter.Calls.Count(c => c.StartsWith("bounds", StringComparison.Ordinal)));
        Assert.Equal(new PixelRect(-1280, 0, 0, 1392), rig.Geometry.Windows[Win].Frame);
    }

    [Test]
    public async Task Elevated_hung_fullscreen_and_shell_windows_are_refused_without_a_write()
    {
        var uwZone = ZoneId.Maximize;
        foreach (var (setup, expected) in new (Action<Rig>, PlaceOutcome)[]
        {
            (r => r.Geometry.Add(Win, new PixelRect(0, 0, 800, 600), elevated: true), PlaceOutcome.Elevated),
            (r => r.Geometry.Add(Win, new PixelRect(0, 0, 800, 600), hung: true), PlaceOutcome.Hung),
            (r => { r.Geometry.Add(Win, new PixelRect(0, 0, 3440, 1440)); r.Geometry.Fullscreen.Add(Win); }, PlaceOutcome.Fullscreen),
            (r => r.Geometry.Windows[Win] = r.Geometry.Add(Win, new PixelRect(0, 1388, 3440, 1440)) with { IsShellSurface = true }, PlaceOutcome.ShellSurface),
            (r => r.Geometry.Windows.Clear(), PlaceOutcome.NoWindow),
        })
        {
            await using var rig = WithTarget();
            setup(rig);
            var uw = rig.Services.Display.Find("")!;
            var p = rig.Services.Placement;
            foreach (var r in new[] { await Run(rig, () => p.ThrowAsync(uw, uwZone)), await Run(rig, () => p.NextMonitorAsync()), await Run(rig, () => p.ToggleMaximizeAsync()) })
            {
                Assert.Equal(expected, r.Outcome);
                Assert.True(r.Blocked);
            }
            Assert.Empty(rig.WindowWriter.Calls);
        }
        Assert.Equal("CAN'T MOVE: ADMIN APP", new PlaceResult(PlaceOutcome.Elevated).Message);
        Assert.Equal("CAN'T MOVE: FULLSCREEN", new PlaceResult(PlaceOutcome.Fullscreen).Message);
    }

    [Test]
    public async Task Next_monitor_wraps_and_keeps_a_maximized_window_maximized()
    {
        await using var rig = WithTarget(new PixelRect(1720, 0, 3440, 1388), maximized: true);
        var r = await Run(rig, () => rig.Services.Placement.NextMonitorAsync());
        Assert.Equal(PlaceOutcome.Moved, r.Outcome);
        Assert.Equal("restore", rig.WindowWriter.Calls[0]);
        Assert.Equal("maximize", rig.WindowWriter.Calls[^1]);
        Assert.Equal(2, PlacementMath.MonitorIndexOf(rig.Geometry.Windows[Win].Frame, rig.Services.Display.Monitors().Select(m => m.Bounds).ToList()), "the primary's next is the one above (left to right order)");
        var back = await Run(rig, () => rig.Services.Placement.NextMonitorAsync());
        Assert.Equal(PlaceOutcome.Moved, back.Outcome);
        Assert.Equal(0, PlacementMath.MonitorIndexOf(rig.Geometry.Windows[Win].Frame, rig.Services.Display.Monitors().Select(m => m.Bounds).ToList()), "wraps to the first");
    }

    [Test]
    public async Task Maximize_and_topmost_report_the_true_state()
    {
        await using var rig = WithTarget();
        var p = rig.Services.Placement;
        Assert.Equal(PlaceOutcome.Maximized, (await Run(rig, () => p.ToggleMaximizeAsync())).Outcome);
        Assert.Equal(PlaceOutcome.Restored, (await Run(rig, () => p.ToggleMaximizeAsync())).Outcome);
        Assert.Equal(PlaceOutcome.TopmostOn, (await Run(rig, () => p.ToggleTopmostAsync())).Outcome);
        Assert.True(p.IsTopmost(Win) == true);
        rig.WindowWriter.IgnoreTopmost = true;
        Assert.Equal(PlaceOutcome.Failed, (await Run(rig, () => p.ToggleTopmostAsync())).Outcome, "a write that didn't take is reported");
        Assert.True(p.IsTopmost(Win) == true, "still the true state");
    }
}

public class PlacementActionTests
{
    private const nint Win = 0x2001;

    private static Rig Target()
    {
        var rig = new Rig();
        rig.Geometry.Add(Win, new PixelRect(100, 100, 1100, 900));
        rig.Foreground.LastExternal = Win;
        rig.Catalog.Set(Samples.Window(Win, "editor.exe", "notes"));
        return rig;
    }

    [Test]
    public async Task Placer_turns_through_every_monitors_zones_and_push_throws()
    {
        foreach (var (device, at) in Placements.Dials())
        {
            await using var rig = Target();
            await using var h = await rig.AppearAsync<PlacerDial>(device, at, Controller.Encoder, new PlacerSettings { Zones = "halves" });
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            // 3 monitors × 4 zones; index 5 = the primary's (2nd monitor) "left half".
            await h.RotateAsync(device.IsGalleon ? 5 : 1);
            if (!device.IsGalleon) for (var i = 0; i < 4; i++) await h.RotateAsync(1);
            Assert.Equal(5, h.Action.Index);
            if (device.IsPlus) await h.TapAsync(50, 50); else await h.DialPressAsync();
            await rig.Until(h, () => !h.Action.Moving);
            Assert.Equal("MOVED", h.Action.FlashText);
            Assert.Equal(new PixelRect(0, 0, 1720, 1388), rig.Geometry.Windows[Win].Frame);
            await h.RotateAsync(+40);
            Assert.Equal(11, h.Action.Index, "clamped at the last zone");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Placer_says_why_a_window_cannot_move()
    {
        await using var rig = Target();
        rig.Geometry.Add(Win, new PixelRect(0, 0, 800, 600), elevated: true);
        await using var h = await rig.AppearAsync<PlacerDial>(TestDevices.Galleon, new(0, 1), Controller.Encoder);
        await h.DialPressAsync();
        await rig.Until(h, () => !h.Action.Moving);
        Assert.Equal("CAN'T MOVE: ADMIN APP", h.Action.FlashText);
        Assert.True(h.Action.FlashAlert);
        Assert.Empty(rig.WindowWriter.Calls);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Zone_next_monitor_maximize_and_topmost_keys_work_on_every_deck()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = Target();
            await using (var zone = await rig.AppearAsync<ZoneKey>(device, at, settings: new ZoneSettings { Monitor = Samples.Qh32Id, Zone = "top-right" }))
            {
                await zone.PressAsync();
                await rig.Until(zone, () => !zone.Action.Moving);
                Assert.Equal(new PixelRect(-1280, 0, 0, 696), rig.Geometry.Windows[Win].Frame, device.Name);
                Assert.Null(zone.Action.FlashText, "a clean move needs no message");
                zone.AssertFramesAreDeckSafe();
            }
            await using (var next = await rig.AppearAsync<NextMonitorKey>(device, at))
            {
                await next.PressAsync();
                await rig.Until(next, () => !next.Action.Moving);
                Assert.Equal(1, PlacementMath.MonitorIndexOf(rig.Geometry.Windows[Win].Frame, rig.Services.Display.Monitors().Select(m => m.Bounds).ToList()));
                next.AssertFramesAreDeckSafe();
            }
            await using (var max = await rig.AppearAsync<MaximizeKey>(device, at))
            {
                Assert.False(max.Action.LastOn);
                await max.PressAsync();
                await rig.Until(max, () => !max.Action.Busy);
                Assert.True(max.Action.LastOn, "true state: IsZoomed");
                max.AssertFramesAreDeckSafe();
            }
            await using (var top = await rig.AppearAsync<TopmostKey>(device, at))
            {
                await top.PressAsync();
                await rig.Until(top, () => !top.Action.Busy);
                Assert.True(top.Action.LastOn);
                rig.WindowWriter.IgnoreTopmost = true;
                await top.PressAsync();
                await rig.Until(top, () => !top.Action.Busy);
                Assert.True(top.Action.LastOn, "the write didn't take: the key keeps the real state");
                Assert.Equal("DIDN'T TAKE", top.Action.FlashText);
                top.AssertFramesAreDeckSafe();
            }
        }
    }

    [Test]
    public async Task Keys_without_a_target_window_say_so()
    {
        await using var rig = new Rig();
        await using var top = await rig.AppearAsync<TopmostKey>(TestDevices.Galleon, new(0, 0));
        await top.PressAsync();
        await rig.Until(top, () => !top.Action.Busy);
        Assert.Equal("NO WINDOW", top.Action.FlashText);
        top.AssertFramesAreDeckSafe();
        await using var zone = await rig.AppearAsync<ZoneKey>(TestDevices.Plus, new(0, 0), settings: new ZoneSettings { Monitor = "gone" });
        await zone.PressAsync();
        Assert.Equal("NO DISPLAY", zone.Action.FlashText);
        zone.AssertFramesAreDeckSafe();
    }
}
