using PrismControl.Core.Hosting;
using PrismControl.Core.Render;
using PrismControl.Testing;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// Read-only checks against THIS PC (category "integration"; skip with --exclude integration). Nothing here changes a
/// display, a DDC/CI value, another app's window, the foreground or a desktop. The only window moved is the tests' own.
/// Titles are never printed.
/// </summary>
public class IntegrationTests
{
    [Test(Category = "integration", TimeoutMs = 30_000)]
    public void Monitors_hdr_and_modes_read_from_displayconfig()
    {
        var r = new Win32DisplayReader();
        var mons = r.Monitors();
        Assert.True(mons.Count >= 1);
        Assert.Single(mons.Where(m => m.IsPrimary));
        foreach (var m in mons)
        {
            Assert.True(m.Id.Length > 0 && m.GdiName.StartsWith(@"\\.\DISPLAY", StringComparison.Ordinal), m.GdiName);
            Assert.True(m.Bounds.Width > 0 && m.WorkArea.Width > 0 && m.WorkArea.Width <= m.Bounds.Width);
            var modes = r.Modes(m.GdiName);
            Assert.True(modes.Count > 0);
            Assert.True(m.Mode is not null && modes.Contains(m.Mode), $"{m.ShortName}: the current mode is in the list");
            Console.WriteLine($"  {m.ShortName}{(m.IsPrimary ? " (primary)" : "")}: {m.Bounds}, {m.Mode}, HDR {(m.Hdr.Supported ? (m.Hdr.On ? "on" : "off") : "unsupported")}, {modes.Count} modes, {m.ScalePercent}%, id {(m.Id.StartsWith(@"\\?\", StringComparison.Ordinal) ? "device path" : "gdi name")}");
        }
        Assert.Equal(mons.Count, mons.Select(m => m.Id).Distinct().Count(), "ids are unique");
        Console.WriteLine($"  SET_HDR_STATE api: {r.HasHdrStateApi}");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task Ddc_gets_and_capabilities_work_read_only()
    {
        await using var disposer = new AsyncDisposer();
        var display = new DisplayService(new Win32DisplayReader(), new SafeDisplayWriter(NullLog.Instance), TimeProvider.System, NullLog.Instance);
        // The writer is the SAFE one: this test cannot write to a monitor even by mistake.
        var ddc = new DdcService(new Win32DdcBus(), new SafeDdcWriter(NullLog.Instance), display, TimeProvider.System, NullLog.Instance);
        disposer.Add(ddc);
        var answered = 0;
        foreach (var m in display.Monitors())
        {
            var b = await ddc.ReadAsync(m.Id, Vcp.Brightness);
            var input = await ddc.ReadAsync(m.Id, Vcp.InputSource);
            if (b is not null) answered++;
            Console.WriteLine($"  {m.ShortName}: brightness {(b is { } x ? $"{x.Current}/{x.Max}" : "no answer")}, input {(input is { } i ? Vcp.InputName(i.Current) : "no answer")}");
        }
        Assert.True(answered >= 1, "at least one monitor answers DDC/CI here");
        var primary = display.Find("")!;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var caps = await ddc.CapabilitiesAsync(primary.Id);
        Console.WriteLine($"  {primary.ShortName} capabilities in {sw.ElapsedMilliseconds} ms: {caps?.Codes.Count ?? 0} codes, inputs [{string.Join(", ", caps?.Inputs.Select(Vcp.InputShort) ?? [])}]");
        sw.Restart();
        var again = await ddc.CapabilitiesAsync(primary.Id);
        Assert.True(ReferenceEquals(caps, again) && sw.ElapsedMilliseconds < 50, "cached");
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Placement_math_on_our_own_window_lands_exactly_in_the_zone()
    {
        using var own = new OwnWindow(OwnWindow.Kind.Resizable, 200, 200, 640, 420);
        await Task.Delay(300);
        var geometry = new Win32WindowGeometry();
        var g = Assert.NotNull(geometry.Read(own.Hwnd));
        Console.WriteLine($"  own window: rect {g.WindowRect}, frame {g.Frame} (borders {g.Frame.Left - g.WindowRect.Left}/{g.Frame.Top - g.WindowRect.Top}/{g.WindowRect.Right - g.Frame.Right}/{g.WindowRect.Bottom - g.Frame.Bottom})");
        Assert.False(g.Elevated);
        Assert.False(g.IsShellSurface);
        var display = new DisplayService(new Win32DisplayReader(), new SafeDisplayWriter(NullLog.Instance), TimeProvider.System, NullLog.Instance);
        var fg = new FakeForeground { LastExternal = own.Hwnd };
        // A REAL window writer, aimed only at our own window (hwnd passed explicitly).
        var placement = new PlacementService(geometry, new Win32WindowWriter(), display, fg, TimeProvider.System, NullLog.Instance);
        var primary = display.Find("")!;
        var r = await placement.ThrowAsync(primary, ZoneId.BottomRight, own.Hwnd);
        var after = geometry.Read(own.Hwnd)!;
        var want = Zones.Rect(ZoneId.BottomRight, primary.WorkArea);
        Console.WriteLine($"  bottom-right of {primary.ShortName}: wanted {want}, got frame {after.Frame} ({r.Outcome}, exact {r.Exact})");
        Assert.Equal(PlaceOutcome.Moved, r.Outcome);
        Assert.True(PlacementMath.Near(after.Frame, want, 2), "the VISIBLE frame matches the zone (invisible borders compensated)");
        var top = await placement.ToggleTopmostAsync(own.Hwnd);
        Assert.Equal(PlaceOutcome.TopmostOn, top.Outcome);
        Assert.True(geometry.Read(own.Hwnd)!.Topmost, "true state from WS_EX_TOPMOST");
        Assert.Equal(PlaceOutcome.TopmostOff, (await placement.ToggleTopmostAsync(own.Hwnd)).Outcome);
        if (display.Monitors().Count > 1)
        {
            var next = await placement.NextMonitorAsync(own.Hwnd);
            Assert.Equal(PlaceOutcome.Moved, next.Outcome);
            Console.WriteLine($"  next monitor: frame {geometry.Read(own.Hwnd)!.Frame}");
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Catalog_lists_our_window_and_a_live_key_shows_its_thumbnail()
    {
        using var own = OwnWindow.InCorner(OwnWindow.Kind.AltTab, 400, 260);
        await Task.Delay(400);
        using var platform = PlatformServices.Standalone(safeMode: true, NullLog.Instance);
        var list = platform.Catalog.AltTabWindows();
        Assert.True(list.Any(w => w.Hwnd == own.Hwnd), "our alt-tab window is listed");
        var me = list.First(w => w.Hwnd == own.Hwnd);
        Assert.False(me.IsElevated);
        Assert.False(me.IsCloaked);
        Console.WriteLine($"  {list.Count} alt-tab windows ({list.Count(w => w.IsElevated)} elevated, {list.Count(w => w.IsMinimized)} minimized, {list.Count(w => w.IsCloaked)} on other desktops)");
        var icon = await platform.Icons.GetAppIconPngAsync(me, 64);
        Console.WriteLine($"  our icon: {(icon is null ? "none" : $"{ImageInfo.Probe(icon)?.Width}px PNG")}");

        var options = new WinShellOptions();
        using var source = new WgcThumbnailSource(NullLog.Instance);
        using var thumbs = new ThumbnailService(source, options, null);
        var services = new Core.Hosting.ServiceRegistry();
        using var windows = new WindowList(platform.Catalog, platform.Foreground, TimeProvider.System);
        services.Add(platform); services.Add(options); services.Add(thumbs); services.Add(windows);
        await using var h = await ActionHarness<WindowKeyAction>.AppearAsync(TestDevices.Galleon, new(0, 0), settings: new WindowKeySettings { Mode = "pinned", App = me.ProcessName },
            configureServices: s => { s.Add(platform); s.Add(options); s.Add(thumbs); s.Add(windows); }, safeMode: true);
        for (var i = 0; i < 50 && h.Action.Model().Thumbnail is null; i++) { await Task.Delay(100); await h.SettleAsync(); }
        var m = h.Action.Model();
        Assert.Equal(own.Hwnd, h.Action.Current!.Hwnd);
        Assert.NotNull(m.Thumbnail, "a live frame of our own window");
        var px = await ImageCodec.DecodeAsync(m.Thumbnail!.Jpeg);
        Assert.NotNull(px);
        long blue = 0, all = 0;
        for (var i = 0; i < px!.Pixels.Length; i += 4) { all++; if (px.Pixels[i] > px.Pixels[i + 2] + 30) blue++; }
        Assert.True(blue * 2 > all, $"the frame shows our blue window ({blue * 100 / Math.Max(1, all)}% blue pixels)");
        h.AssertFramesAreDeckSafe();
        own.Minimize();
        await Task.Delay(500);
        windows.Invalidate();
        await h.AdvanceAsync(TimeSpan.FromSeconds(1.1));
        Assert.True(h.Action.Model().Minimized, "minimized → icon fallback");
    }

    [Test(Category = "integration", TimeoutMs = 10_000)]
    public void Desktops_and_game_state_read_without_changing_anything()
    {
        var d = new RegistryVirtualDesktopReader().Read();
        Assert.True(d.Count >= 1);
        Assert.InRange(d.Current, 0, d.Count - 1);
        using var game = new Win32GameStateReader();
        Thread.Sleep(200);
        var s = game.Read();
        Console.WriteLine($"  desktops: {d.Count}, current {d.Current + 1}; game: QUNS {s.NotificationState}, power mode {s.EffectivePowerMode} → {s.Describe()}");
        Assert.InRange(s.NotificationState, 1, 7);
    }

    private sealed class AsyncDisposer : IAsyncDisposable
    {
        private readonly List<IAsyncDisposable> _items = [];
        public void Add(IAsyncDisposable d) => _items.Add(d);
        public async ValueTask DisposeAsync() { foreach (var d in _items) await d.DisposeAsync(); }
    }
}
