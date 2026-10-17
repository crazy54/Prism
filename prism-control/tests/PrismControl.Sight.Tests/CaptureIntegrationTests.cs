using PrismControl.Desktop.Sight;
using PrismControl.Sight.Capture;
using PrismControl.Sight.Engine;
using PrismControl.Sight.Imaging;
using PrismControl.Sight.Safety;
using PrismControl.Sight.Service;
using PrismControl.Testing;

namespace PrismControl.Sight.Tests;

/// <summary>
/// Real Windows.Graphics.Capture, but only of windows this test process creates (no-activate tool windows, destroyed at
/// the end). Pixels stay in memory. Category "integration".
/// </summary>
public class CaptureIntegrationTests
{
    private static (int X, int Y) Spot()
    {
        var primary = HdrProbe.MonitorFromPoint(0, 1);
        var mb = WindowGeometry.MonitorBounds(primary);
        return (mb.X + 60, mb.Y + 80);
    }

    private static readonly (int X, int Y, Bgra C)[] Markers =
    [
        (8, 8, Bgra.FromRgb(255, 0, 0)), (200, 40, Bgra.FromRgb(0, 200, 90)), (90, 150, Bgra.FromRgb(30, 60, 250)), (300, 170, Bgra.FromRgb(250, 220, 30)),
    ];

    private static SightImage MarkerImage(int w, int h)
    {
        var img = SightImage.Filled(w, h, Bgra.FromRgb(40, 40, 48));
        foreach (var (x, y, c) in Markers) img.FillRect(new PixelRect(x, y, 12, 12), c);
        return img;
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task Crops_are_exactly_the_requested_client_pixels_in_a_bordered_window()
    {
        var (x, y) = Spot();
        using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = 420, H = 260, Bordered = true, Topmost = false, Bottom = true });
        Assert.True(WindowGeometry.TryGetClientOnScreen(win.Hwnd, out var client));
        win.SetImage(MarkerImage(client.W, client.H));
        await Task.Delay(300);
        foreach (var fmt in new[] { CaptureFormatPreference.Bgra8, CaptureFormatPreference.Fp16 })
        {
            var got = new Dictionary<int, Bgra>();
            var crops = Markers.Select((m, i) => new RegionCrop(i, new PixelRect(m.X + 3, m.Y + 3, 6, 6))).ToList();
            using (var cap = new WgcRegionCapture(win.Hwnd, new CaptureOptions { Format = fmt, MinUpdateInterval = TimeSpan.FromMilliseconds(16) },
                       _ => new CropPlan { Regions = crops }, f => { lock (got) foreach (var (k, img) in f.Regions) got[k] = img.Get(3, 3); }))
            {
                cap.Start();
                Assert.True(cap.BorderlessApplied, "borderless capture");
                await Task.Delay(400);
                win.SetImage(MarkerImage(client.W, client.H));   // a repaint makes sure a frame arrives
                await Task.Delay(500);
                if (got.Count == 0) cap.PollCached(TimeSpan.Zero);
            }
            Assert.Equal(Markers.Length, got.Count, $"{fmt}: every crop arrived");
            for (var i = 0; i < Markers.Length; i++)
                Assert.True(got[i].MaxChannelDistance(Markers[i].C) <= 1, $"{fmt}: marker {i} expected {Markers[i].C.ToHex()} got {got[i].ToHex()} (client offset or conversion wrong)");
        }
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public async Task A_minimized_window_delivers_nothing_and_a_static_one_is_cut_from_the_cached_frame()
    {
        var (x, y) = Spot();
        using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = 320, H = 200, Bottom = true });
        win.SetImage(MarkerImage(320, 200));
        await Task.Delay(300);
        var frames = new List<CapturedFrame>();
        var crops = new List<RegionCrop> { new(0, new PixelRect(8, 8, 12, 12)) };
        using var cap = new WgcRegionCapture(win.Hwnd, new CaptureOptions { Format = CaptureFormatPreference.Bgra8, MinUpdateInterval = TimeSpan.FromMilliseconds(16) },
            _ => new CropPlan { Regions = crops }, f => { lock (frames) frames.Add(f); });
        cap.Start();
        await Task.Delay(600);
        var live = frames.Count(f => !f.FromCache);
        Assert.True(live >= 1, "a first frame arrives");
        // Static: WGC goes quiet; the cached copy still answers.
        Assert.True(cap.PollCached(TimeSpan.FromMilliseconds(100)), "cut from the cached frame");
        Assert.True(frames[^1].FromCache);
        Assert.Equal(Bgra.FromRgb(255, 0, 0), frames[^1].Regions[0].Get(5, 5));
        // Minimized: no frames (the service pauses on the minimized state itself).
        win.Minimize();
        await Task.Delay(300);
        var before = frames.Count(f => !f.FromCache);
        await Task.Delay(800);
        Assert.Equal(before, frames.Count(f => !f.FromCache), "a minimized window sends no frames");
        Assert.Equal(WindowVisibility.Minimized, WindowGeometry.Visibility(win.Hwnd));
        win.Restore();
    }

    [Test(Category = "integration", TimeoutMs = 30_000)]
    public void Auto_format_follows_the_monitor_hdr_state()
    {
        var (x, y) = Spot();
        using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = 200, H = 120, Bottom = true });
        var color = DisplayInfo.ForWindow(win.Hwnd);
        using var cap = new WgcRegionCapture(win.Hwnd, new CaptureOptions(), _ => CropPlan.Empty, _ => { });
        cap.Start();
        if (color?.AdvancedColorEnabled == true)
        {
            Assert.Equal(CapturePixelFormat.ScRgbFp16, cap.Format, "HDR output → FP16");
            Assert.Near(color.SdrWhiteNits / 80, cap.PaperWhite, 1e-6, "paper white = the SDR white level");
        }
        else Assert.Equal(CapturePixelFormat.Bgra8, cap.Format);
        Assert.True(cap.MinIntervalApplied, "MinUpdateInterval through the raw ABI");
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task The_service_reads_a_synthetic_hud_window_end_to_end_and_pauses_when_it_is_minimized()
    {
        var (x, y) = Spot();
        var state = new HudState { Bank = -45, Pitch = 15, Length = 21.5 };
        using var win = OwnWindow.Create(new OwnWindowOptions { X = x, Y = y, W = 1280, H = 720, Bottom = true });
        win.SetImage(SyntheticHud.Render(1280, 720, 1, state));
        await Task.Delay(300);
        var recipe = SyntheticHud.Recipe().Recipe;
        var policy = new GamePolicy(new UserGames(null)) { ExtraAllowlist = [new KnownGame("syncoaster", "Synthetic coaster", ["SyntheticCoaster.exe"])] };
        await using var svc = new SightService(new SightServiceOptions
        {
            Recipes = [recipe], Policy = policy, Ocr = null, TickInterval = TimeSpan.FromMilliseconds(100),
            Foreground = () => win.Hwnd,   // our window never takes the foreground (no-activate): pretend it is in front
            Identify = h => h == win.Hwnd ? new WindowIdentity(Environment.ProcessId, "SyntheticCoaster.exe", null, "PrismSightTestWindow") : null,
        });
        svc.Start();
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(8);
        while (DateTime.UtcNow < deadline && svc.Current.Readout("bankAngle")?.Confidence != SightConfidence.Observed) await Task.Delay(100);
        var s = svc.Current;
        Assert.Equal(SightRunState.Running, s.State, s.Reason);
        Assert.Equal("coasterBuilder", s.Context.Id);
        Assert.Equal(-45.0, s.Readout("bankAngle")!.Number);
        Assert.Equal(15.0, s.Readout("pitchAngle")!.Number);
        Assert.Equal(21.5, s.Readout("pieceLength")!.Number);
        // The value changes on screen → the reading follows.
        state.Bank = 30;
        win.SetImage(SyntheticHud.Render(1280, 720, 1, state));
        deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (DateTime.UtcNow < deadline && !(svc.Current.Readout("bankAngle") is { Number: 30, Confidence: SightConfidence.Observed })) await Task.Delay(100);
        Assert.Equal(30.0, svc.Current.Readout("bankAngle")!.Number);
        // Minimized → paused, stale; restored → running again.
        win.Minimize();
        deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        while (DateTime.UtcNow < deadline && svc.Current.State != SightRunState.Paused) await Task.Delay(50);
        Assert.Equal(SightRunState.Paused, svc.Current.State);
        Assert.Equal(SightConfidence.Stale, svc.Current.Readout("bankAngle")!.Confidence);
        win.Restore();
        deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (DateTime.UtcNow < deadline && svc.Current.Readout("bankAngle")?.Confidence != SightConfidence.Observed) await Task.Delay(100);
        Assert.Equal(SightRunState.Running, svc.Current.State);
        Assert.Equal(SightConfidence.Observed, svc.Current.Readout("bankAngle")!.Confidence);
    }
}
