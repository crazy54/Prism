using System.Text.Json.Nodes;
using PrismControl.Core.Data;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Testing;
using PrismControl.WinShell.Display;
using PrismControl.WinShell.Placement;
using PrismControl.WinShell.Shared;
using PrismControl.WinShell.Switcher;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// Safe mode (authoring-actions.md § Safe mode): every write path is a no-op or a fake, reads stay real. The rig here wires
/// TRIPWIRES as the "real" writers (they throw and count), so a single write that slips through fails the test even if a
/// handler swallowed the exception. The model still responds (keys show what the fake "did").
/// </summary>
public class SafeModeTests
{
    private const nint Win = 0x2001;

    private static Rig SafeRig()
    {
        var rig = new Rig(safeMode: true, tripwires: true).WithWindows();
        rig.Geometry.Add(Win, new PixelRect(100, 100, 1100, 900));
        rig.Catalog.Windows.Add(Samples.Window(Win, "editor2.exe", "draft"));
        rig.Foreground.LastExternal = Win;
        return rig;
    }

    private static void AssertNoTrips(int before)
    {
        if (TripwireException.Trips != before)
        {
            string what;
            lock (TripwireException.What) what = string.Join(", ", TripwireException.What);
            Assert.Fail($"a real writer was reached in safe mode: {what}");
        }
    }

    [Test]
    public void Building_in_safe_mode_never_constructs_the_real_writers()
    {
        var calls = 0;
        var rig = new Rig();
        var platform = new PlatformServices(rig.Catalog, rig.Foreground, rig.Input, rig.Icons, writersAreSafe: false);
        var readers = new WinShellReaders(rig.DisplayReader, rig.Ddc, rig.Geometry, rig.Desktops, rig.Game, rig.Thumbs);
        var s = WinShellServices.Build(platform, rig.Options, safeMode: true, rig.Time, NullLog.Instance, readers, () => { calls++; return WinShellWriters.Real(); });
        Assert.Equal(0, calls, "the real writers' factory is not even called");
        Assert.True(s.Writers.Display is SafeDisplayWriter && s.Writers.Ddc is SafeDdcWriter && s.Writers.Window is SafeWindowWriter);
        Assert.True(s.Platform.WritersAreSafe);
        Assert.True(s.Platform.Foreground is SafeModeForeground && s.Platform.Input is SafeModeInput);
        Assert.True(s.Display.Writer is SafeDisplayWriter && s.Ddc.Writer is SafeDdcWriter && s.Placement.Writer is SafeWindowWriter);
        var live = WinShellServices.Build(platform, rig.Options, safeMode: false, rig.Time, NullLog.Instance, readers, () => { calls++; return new WinShellWriters(rig.DisplayWriter, rig.DdcWriter, rig.WindowWriter); });
        Assert.Equal(1, calls);
        Assert.True(ReferenceEquals(live.Platform.Foreground, rig.Foreground));
    }

    [Test]
    public async Task Window_keys_and_browser_never_change_the_foreground()
    {
        var before = TripwireException.Trips;
        await using var rig = SafeRig();
        await using var key = await rig.AppearAsync<WindowKeyAction>(TestDevices.Galleon, new(0, 0), settings: new WindowKeySettings { Slot = 2 });
        await key.PressAsync();
        Assert.Equal("SAFE MODE", key.Action.Model().Flash);
        await using var browser = await rig.AppearAsync<BrowserDial>(TestDevices.Plus, new(0, 0), Controller.Encoder, context: "b");
        await browser.RotateAsync(1);
        await browser.DialPressAsync();
        await browser.TapAsync(10, 10);
        Assert.Equal("SAFE MODE", browser.Action.Model().Flash);
        AssertNoTrips(before);
        Assert.Empty(rig.Foreground.Calls);
        Assert.True(((SafeModeForeground)rig.Services.Platform.Foreground).Calls >= 3);
        key.AssertFramesAreDeckSafe();
        browser.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Desktop_switches_are_recorded_not_sent_and_the_pager_still_moves()
    {
        var before = TripwireException.Trips;
        await using var rig = SafeRig();
        await using var h = await rig.AppearAsync<DesktopsAction>(TestDevices.Galleon, new(1, 1), Controller.Encoder);
        await h.RotateAsync(12);
        // Wait for the simulated switch WITHOUT moving the clock, so the second turn below is surely within 300 ms of this one.
        // (Stepping the clock while the switch ran off the mailbox let a slow thread pool push it past the gap.)
        await h.Action.Work;
        await h.SettleAsync();
        Assert.False(h.Action.Switching);
        Assert.Equal(1, rig.Services.Desktops.Current(TimeSpan.Zero).Current, "the in-memory model moved");
        Assert.Equal(0, rig.Desktops.Current, "the real desktop did not");
        Assert.Equal("SAFE MODE", h.Action.FlashText);
        await h.RotateAsync(12);
        await rig.Until(h, () => !h.Action.Switching);
        Assert.Equal(1, rig.Services.Desktops.Current(TimeSpan.Zero).Current, "a second turn within 300 ms is ignored");
        Assert.Equal("0x5B+0x11+0x27", ((SafeModeInput)rig.Services.Platform.Input).Sent.Single());
        Assert.Empty(rig.Input.Chords);
        AssertNoTrips(before);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Desktops_simulate_in_safe_mode_even_with_desktops_own_recording_input()
    {
        // With PrismControl.Desktop, safe-mode input is Desktop's RecordingInputSender (not our SafeModeInput) and the
        // platform reports WritersAreSafe: the pager must still simulate instead of waiting for Explorer.
        var rig = new Rig();
        rig.Input.Desktops = null;
        var platform = new PlatformServices(rig.Catalog, rig.Foreground, rig.Input, rig.Icons, writersAreSafe: true);
        var readers = new WinShellReaders(rig.DisplayReader, rig.Ddc, rig.Geometry, rig.Desktops, rig.Game, rig.Thumbs);
        await using var s = WinShellServices.Build(platform, rig.Options, safeMode: true, rig.Time, NullLog.Instance, readers, () => throw new InvalidOperationException("never"));
        Assert.True(ReferenceEquals(s.Platform.Input, rig.Input), "an already-safe platform is not wrapped again");
        Assert.Equal(DesktopSwitchOutcome.Simulated, await s.Desktops.StepAsync(+1));
        Assert.Equal(1, s.Desktops.Current(TimeSpan.Zero).Current);
        Assert.Equal(0, rig.Desktops.Current);
        await rig.DisposeAsync();
    }

    [Test]
    public async Task Hdr_and_refresh_are_simulated_with_resync_countdown_and_revert()
    {
        var before = TripwireException.Trips;
        await using var rig = SafeRig();
        await using var hdr = await rig.AppearAsync<HdrKey>(TestDevices.Plus, new(0, 1), settings: new MonitorSettings());
        Assert.Equal(HdrView.Off, hdr.Action.LastView);
        await hdr.PressAsync();
        await rig.Until(hdr, () => !hdr.Action.Toggling);
        Assert.Equal(HdrView.On, hdr.Action.LastView, "the fake writer's state is what the key shows");
        Assert.False(rig.DisplayReader.List.First(m => m.Id == Samples.UwId).Hdr.On, "the real monitor is untouched");
        hdr.AssertFramesAreDeckSafe();

        await using var refresh = await rig.AppearAsync<RefreshKey>(TestDevices.Galleon, new(1, 2), settings: new RefreshSettings(), context: "r");
        await rig.Until(refresh, () => rig.Services.Display.CachedModes(rig.Services.Display.Find("")!) is not null);
        await refresh.PressAsync();
        await rig.Until(refresh, () => !refresh.Action.Busy && refresh.Action.LastSeconds is not null);
        Assert.Equal(120, refresh.Action.LastHz);
        await refresh.AdvanceAsync(TimeSpan.FromSeconds(16));
        Assert.Equal(240, refresh.Action.LastHz, "the simulated change reverts too");
        Assert.Equal("REVERTED", refresh.Action.FlashText);
        var writes = ((SafeDisplayWriter)rig.Services.Display.Writer).Writes;
        Assert.Contains("would turn HDR on", string.Join("|", writes));
        Assert.Contains("would test 3440x1440 @ 120 Hz", string.Join("|", writes));
        Assert.Empty(rig.DisplayWriter.Calls);
        AssertNoTrips(before);
        refresh.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Ddc_dials_keys_and_input_switches_never_reach_a_monitor()
    {
        var before = TripwireException.Trips;
        await using var rig = SafeRig();
        await using var dial = await rig.AppearAsync<MonitorDial>(TestDevices.Galleon, new(1, 0), Controller.Encoder, new MonitorDialSettings { Monitor = "all" });
        for (var i = 0; i < 20 && rig.Services.Ddc.PendingWork > 0; i++) { await dial.AdvanceAsync(TimeSpan.FromMilliseconds(100)); await rig.Services.Ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); }
        await Rig.Drain(dial);
        await dial.RotateAsync(-12);
        for (var i = 0; i < 20 && rig.Services.Ddc.PendingWork > 0; i++) { await dial.AdvanceAsync(TimeSpan.FromMilliseconds(100)); await rig.Services.Ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); }
        await Rig.Drain(dial);
        Assert.Equal(66u, dial.Action.LastValue!.Shown, "the dial shows the simulated value");
        Assert.Equal(DdcStatus.Ok, dial.Action.LastValue!.Status, "verification reads the fake's value, so no false 'locked'");
        Assert.Equal(90u, rig.Ddc.Values[(Samples.UwId, Vcp.Brightness)].Cur, "the monitor itself is untouched");
        dial.AssertFramesAreDeckSafe();

        await using var input = await rig.AppearAsync<InputSourceAction>(TestDevices.Plus, new(2, 0), Controller.Encoder, new InputSourceSettings { Monitor = Samples.UwId }, context: "i");
        await rig.Until(input, () => input.Action.Inputs().Count == 4);
        await input.RotateAsync(1);
        await input.DialPressAsync();
        await input.DialPressAsync();
        await rig.Until(input, () => !input.Action.Switching && input.Action.FlashText is not null);
        Assert.Equal("SWITCHED", input.Action.FlashText);
        Assert.Contains("Input=17", string.Join("|", ((SafeDdcWriter)rig.Services.Ddc.Writer).Writes));
        Assert.Empty(rig.DdcWriter.Snapshot());
        AssertNoTrips(before);
        input.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Placement_keys_and_the_placer_log_instead_of_moving()
    {
        var before = TripwireException.Trips;
        await using var rig = SafeRig();
        var frame = rig.Geometry.Windows[Win].Frame;
        await using (var placer = await rig.AppearAsync<PlacerDial>(TestDevices.Galleon, new(0, 1), Controller.Encoder))
        {
            await placer.RotateAsync(5);
            await placer.DialPressAsync();
            await rig.Until(placer, () => !placer.Action.Moving);
            Assert.Equal("SAFE MODE", placer.Action.FlashText);
            placer.AssertFramesAreDeckSafe();
        }
        await using (var zone = await rig.AppearAsync<ZoneKey>(TestDevices.Plus, new(0, 0), settings: new ZoneSettings()))
        {
            await zone.PressAsync();
            await rig.Until(zone, () => !zone.Action.Moving);
            Assert.Equal("SAFE MODE", zone.Action.FlashText);
        }
        await using (var next = await rig.AppearAsync<NextMonitorKey>(TestDevices.Mini, new(0, 0)))
        {
            await next.PressAsync();
            await rig.Until(next, () => !next.Action.Moving);
            Assert.Equal("SAFE MODE", next.Action.FlashText);
        }
        await using (var max = await rig.AppearAsync<MaximizeKey>(TestDevices.XL, new(0, 0)))
        {
            await max.PressAsync();
            await rig.Until(max, () => !max.Action.Busy);
            Assert.True(max.Action.LastOn, "the fake's maximized state");
        }
        await using (var top = await rig.AppearAsync<TopmostKey>(TestDevices.StreamDeck, new(0, 0)))
        {
            await top.PressAsync();
            await rig.Until(top, () => !top.Action.Busy);
            Assert.True(top.Action.LastOn);
            top.AssertFramesAreDeckSafe();
        }
        Assert.Equal(frame, rig.Geometry.Windows[Win].Frame, "the real window never moved");
        Assert.False(rig.Geometry.Windows[Win].Topmost);
        Assert.True(((SafeWindowWriter)rig.Services.Placement.Writer).Writes.Count >= 5);
        Assert.Empty(rig.WindowWriter.Calls);
        AssertNoTrips(before);
    }

    [Test(Category = "integration", TimeoutMs = 60_000)]
    public async Task The_real_module_in_safe_mode_registers_only_safe_writers()
    {
        var ctx = new TestModuleContext(safeMode: true);
        var module = new WinShellModule();
        module.Initialize(ctx);
        try
        {
            var s = ctx.Services.Get<WinShellServices>();
            Assert.True(s.SafeMode);
            Assert.True(s.Writers.Display is SafeDisplayWriter && s.Writers.Ddc is SafeDdcWriter && s.Writers.Window is SafeWindowWriter);
            Assert.True(s.Platform.WritersAreSafe, "Desktop's foreground/input are its safe-mode fakes");
            Assert.Equal(ForegroundResult.SafeMode, await ctx.Services.Get<IForegroundService>().BringToFrontAsync(ctx.Services.Get<IForegroundService>().GetForeground()));
            Assert.True(ctx.Services.TryGet<DisplayService>(out _) && ctx.Services.TryGet<DdcService>(out _) && ctx.Services.TryGet<PlacementService>(out _));
            Assert.True(ctx.Services.Get<DisplayService>().Monitors().Count >= 1, "reads stay real");
        }
        finally
        {
            await module.DisposeAsync();
            ctx.Shutdown();
        }
    }
}

/// <summary>A minimal module context for the real module (no Stream Deck app).</summary>
public sealed class TestModuleContext(bool safeMode) : IModuleContext
{
    private readonly CancellationTokenSource _cts = new();
    public ILog Log => NullLog.Instance;
    public IDataRegistry Data { get; } = new DataRegistry();
    public IServiceRegistry Services { get; } = new ServiceRegistry();
    public IGlobalSettings GlobalSettings { get; } = new TestGlobalSettings(new JsonObject { ["windows"] = new JsonObject { ["streamerSafe"] = true } });
    public IPluginEvents Events { get; } = new NoEvents();
    public IDeviceDirectory Devices { get; } = new NoDevices();
    public TimeProvider Time => TimeProvider.System;
    public CancellationToken ShutdownToken => _cts.Token;
    public string PluginDirectory => AppContext.BaseDirectory;
    public string DataDirectory => Path.Combine(Path.GetTempPath(), "prism-w1-tests");
    public bool SafeMode => safeMode;
    public void OpenUrl(string url) { }
    public void Shutdown() => _cts.Cancel();

    private sealed class NoDevices : IDeviceDirectory
    {
        public IReadOnlyCollection<DeviceInfo> All => [];
        public DeviceInfo? Find(string deviceId) => null;
    }

    private sealed class NoEvents : IPluginEvents
    {
#pragma warning disable CS0067
        public event EventHandler<DeviceInfo>? DeviceConnected;
        public event EventHandler<string>? DeviceDisconnected;
        public event EventHandler? SystemWokeUp;
        public event EventHandler<string>? ApplicationLaunched;
        public event EventHandler<string>? ApplicationTerminated;
        public event EventHandler<string>? DeepLinkReceived;
        public event EventHandler? Connected;
        public event EventHandler? Disconnected;
#pragma warning restore CS0067
    }
}
