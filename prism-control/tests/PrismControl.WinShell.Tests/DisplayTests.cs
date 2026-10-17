using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Core.Layouts;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;
using PrismControl.WinShell.Display;

namespace PrismControl.WinShell.Tests;

public class DisplayServiceTests
{
    [Test]
    public async Task Finds_monitors_by_id_gdi_name_model_or_primary()
    {
        await using var rig = new Rig();
        var d = rig.Services.Display;
        Assert.Equal(Samples.UwId, d.Find("")!.Id, "empty = primary");
        Assert.Equal(Samples.UwId, d.Find(null)!.Id);
        Assert.Equal(Samples.Qh32Id, d.Find(Samples.Qh32Id)!.Id);
        Assert.Equal(Samples.Qh27Id, d.Find(@"\\.\DISPLAY1")!.Id);
        Assert.Equal(Samples.Qh27Id, d.Find("QH27")!.Id);
        Assert.Null(d.Find("nope"));
        Assert.Equal("QH32,UW34,QH27", string.Join(",", d.Monitors().Select(m => m.ShortName)), "left to right");
        Assert.Equal("UW34", MonitorInfo.ShortModel("Example Ultra UW34", @"\\.\DISPLAY2"));
        Assert.Equal("Display 4", MonitorInfo.ShortModel("", @"\\.\DISPLAY4"));
        // Reads are cached for a second (one read serves every key).
        var reads = rig.DisplayReader.MonitorReads;
        for (var i = 0; i < 10; i++) d.Monitors();
        Assert.Equal(reads, rig.DisplayReader.MonitorReads);
        rig.Time.Advance(TimeSpan.FromSeconds(1.1));
        d.Monitors();
        Assert.Equal(reads + 1, rig.DisplayReader.MonitorReads);
    }

    [Test]
    public async Task Hdr_toggle_resyncs_for_two_seconds_then_reads_the_true_state()
    {
        await using var rig = new Rig();
        var d = rig.Services.Display;
        var t = d.ToggleHdrAsync("");
        Assert.True(d.IsResyncing(Samples.UwId));
        Assert.Equal("hdr on type 16", rig.DisplayWriter.Calls.Single(), "24H2+: SET_HDR_STATE (16)");
        rig.Time.Advance(TimeSpan.FromSeconds(2.1));
        Assert.Equal(HdrOutcome.TurnedOn, await t);
        Assert.False(d.IsResyncing(Samples.UwId));
        Assert.True(d.Find("")!.Hdr.On);
        // Older builds or a refused type 16: SET_ADVANCED_COLOR_STATE (10).
        rig.DisplayWriter.HdrStatus16 = 87;
        var t2 = d.ToggleHdrAsync("");
        rig.Time.Advance(TimeSpan.FromSeconds(2.1));
        Assert.Equal(HdrOutcome.TurnedOff, await t2);
        Assert.Equal("hdr off type 10", rig.DisplayWriter.Calls[^1]);
        // A toggle Windows ignored: the true state wins.
        rig.DisplayWriter.HdrStatus16 = 0;
        rig.DisplayWriter.IgnoreHdr = true;
        var t3 = d.ToggleHdrAsync("");
        rig.Time.Advance(TimeSpan.FromSeconds(2.1));
        Assert.Equal(HdrOutcome.DidNotTake, await t3);
        Assert.False(d.Find("")!.Hdr.On);
        Assert.Equal(HdrOutcome.Unsupported, await d.ToggleHdrAsync(Samples.Qh27Id));
        Assert.Equal(HdrOutcome.NoMonitor, await d.ToggleHdrAsync("missing"));
    }

    [Test]
    public async Task Refresh_change_tests_first_applies_unsaved_and_reverts_after_fifteen_seconds()
    {
        await using var rig = new Rig();
        var d = rig.Services.Display;
        Assert.Equal(ModeOutcome.Pending, await d.ChangeRefreshAsync("", 120));
        Assert.Equal("test 3440x1440 @ 120 Hz|apply 3440x1440 @ 120 Hz", string.Join("|", rig.DisplayWriter.Calls), "CDS_TEST before applying, and not saved");
        var p = Assert.NotNull(d.Pending(Samples.UwId));
        Assert.Equal(240, p.Previous.Hz);
        Assert.Equal(120, d.Find("", TimeSpan.Zero)!.Mode!.Hz);
        Assert.Equal(ModeOutcome.Busy, await d.ChangeRefreshAsync("", 144), "one pending change per monitor");
        rig.Time.Advance(TimeSpan.FromSeconds(14));
        Assert.NotNull(d.Pending(Samples.UwId));
        Assert.Equal(1, (int)Math.Ceiling(d.Remaining(p).TotalSeconds));
        rig.Time.Advance(TimeSpan.FromSeconds(1.1));
        Assert.Null(d.Pending(Samples.UwId), "no confirmation → reverted");
        Assert.Equal(ModeEnd.Reverted, d.LastEnd(Samples.UwId)!.Kind);
        Assert.Equal("apply 3440x1440 @ 240 Hz", rig.DisplayWriter.Calls[^1]);
        Assert.Equal(240, d.Find("", TimeSpan.Zero)!.Mode!.Hz);
    }

    [Test]
    public async Task Keep_saves_the_mode_and_bad_modes_never_get_applied()
    {
        await using var rig = new Rig();
        var d = rig.Services.Display;
        await d.ChangeRefreshAsync("", 144);
        Assert.True(await d.KeepAsync(Samples.UwId) == true);
        Assert.Equal(ModeEnd.Kept, d.LastEnd(Samples.UwId)!.Kind);
        Assert.Equal("apply 3440x1440 @ 144 Hz persist", rig.DisplayWriter.Calls[^1]);
        rig.Time.Advance(TimeSpan.FromSeconds(20));
        Assert.Equal(144, d.Find("", TimeSpan.Zero)!.Mode!.Hz, "kept: no revert");
        Assert.Null(await d.KeepAsync(Samples.UwId), "nothing pending");
        Assert.Equal(ModeOutcome.AlreadySet, await d.ChangeRefreshAsync("", 144));
        Assert.Equal(ModeOutcome.Unsupported, await d.ChangeRefreshAsync("", 75), "not in the mode list: nothing is sent");
        rig.DisplayWriter.TestResult = ModeChangeResult.BadMode;
        var before = rig.DisplayWriter.Calls.Count;
        Assert.Equal(ModeOutcome.Rejected, await d.ChangeRefreshAsync("", 240));
        Assert.Equal(before + 1, rig.DisplayWriter.Calls.Count, "only the CDS_TEST, no apply");
        Assert.Equal(1, rig.DisplayReader.ModeReads, "the mode list is read once and cached");
    }

    [Test]
    public async Task A_keep_or_revert_still_counts_as_pending_until_its_outcome_is_recorded()
    {
        // Regression (the WinShell load flake): keys read Pending, then LastEnd, on their own threads while a keep or revert
        // writes the mode on another (ChangeDisplaySettingsEx is slow on a real PC). A redraw in a gap where neither is set
        // drops the key's REVERTED/KEPT for good, and a second change could start mid-revert.
        await using var rig = new Rig();
        var d = rig.Services.Display;
        var seen = new List<string>();
        string State() => d.Pending(Samples.UwId) is not null ? "pending" : d.LastEnd(Samples.UwId)?.Kind.ToString() ?? "neither";
        Assert.Equal(ModeOutcome.Pending, await d.ChangeRefreshAsync("", 120));
        rig.DisplayWriter.DuringApply = (_, _) =>
        {
            seen.Add(State());
            rig.DisplayWriter.DuringApply = null;
            seen.Add(d.ChangeRefreshAsync("", 144).GetAwaiter().GetResult().ToString());
        };
        rig.Time.Advance(TimeSpan.FromSeconds(15.1));
        Assert.Equal("pending|Busy", string.Join("|", seen), "mid-revert: still pending, and no other change can start");
        Assert.Equal(ModeEnd.Reverted, d.LastEnd(Samples.UwId)!.Kind);
        Assert.Null(d.Pending(Samples.UwId));
        Assert.Equal(240, d.Find("", TimeSpan.Zero)!.Mode!.Hz);
        seen.Clear();
        Assert.Equal(ModeOutcome.Pending, await d.ChangeRefreshAsync("", 144));
        rig.DisplayWriter.DuringApply = (_, persist) => seen.Add($"{State()}{(persist ? " persist" : "")}");
        Assert.True(await d.KeepAsync(Samples.UwId) == true);
        Assert.Equal("pending persist", string.Join("|", seen), "mid-keep: still pending");
        Assert.Equal(ModeEnd.Kept, d.LastEnd(Samples.UwId)!.Kind);
        Assert.Null(d.Pending(Samples.UwId));
    }

    [Test]
    public async Task Two_keys_racing_on_one_monitor_cannot_stack_unconfirmed_modes()
    {
        await using var rig = new Rig();
        var d = rig.Services.Display;
        var a = d.ChangeRefreshAsync("", 120);
        var b = d.ChangeRefreshAsync("", 144);
        var c = d.ToggleHdrAsync("");
        var hdr2 = d.ToggleHdrAsync("");
        var results = await Task.WhenAll(a, b);
        Assert.Equal(1, results.Count(r => r == ModeOutcome.Pending), string.Join(",", results));
        Assert.Equal(1, results.Count(r => r == ModeOutcome.Busy));
        Assert.Equal(HdrOutcome.Busy, await hdr2);
        rig.Time.Advance(TimeSpan.FromSeconds(16));
        await c;
        Assert.Equal(240, d.Find("", TimeSpan.Zero)!.Mode!.Hz, "the original mode is back");
        Assert.Equal(1, rig.DisplayWriter.Calls.Count(x => x.StartsWith("hdr", StringComparison.Ordinal)), "one HDR toggle");
    }

    [Test]
    public async Task Shutdown_with_a_pending_mode_reverts_it()
    {
        var rig = new Rig();
        await rig.Services.Display.ChangeRefreshAsync(Samples.Qh32Id, 120);
        await rig.DisposeAsync();
        Assert.Equal("apply 2560x1440 @ 165 Hz", rig.DisplayWriter.Calls[^1]);
    }

    [Test]
    public void Rates_at_resolution_are_distinct_and_sorted()
    {
        var modes = new FakeDisplayReader().ModeLists[@"\\.\DISPLAY2"];
        Assert.Equal("240,180,144,120,100,60", string.Join(",", DisplayService.RatesAtResolution(modes, new DisplayMode(3440, 1440, 240))));
        Assert.Equal("240", string.Join(",", DisplayService.RatesAtResolution(modes, new DisplayMode(2560, 1440, 240))));
    }
}

public class HdrKeyTests
{
    [Test]
    public async Task Shows_true_state_resyncs_and_alerts_when_a_toggle_did_not_take()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<HdrKey>(device, at, settings: new MonitorSettings { Monitor = Samples.Qh32Id });
            Assert.Equal(HdrView.On, h.Action.LastView, device.Name);
            await h.PressAsync();
            await rig.Until(h, () => h.Action.LastView == HdrView.Resyncing, TimeSpan.FromSeconds(1));
            await rig.Until(h, () => !h.Action.Toggling);
            Assert.Equal(HdrView.Off, h.Action.LastView);
            rig.DisplayWriter.IgnoreHdr = true;
            await h.PressAsync();
            await rig.Until(h, () => !h.Action.Toggling);
            Assert.Equal(HdrView.Off, h.Action.LastView, "the key shows what Windows reports");
            Assert.Equal("DIDN'T TAKE", h.Action.FlashText);
            Assert.True(h.Action.FlashAlert);
            // Someone turns HDR on in Windows Settings: the key follows within two seconds. It polls once a second through the
            // shared monitor cache, which is itself up to a second old (here the toggle's own re-read refreshed it, at a phase
            // set by how fast the toggle ran, so 1.2 s only held when the two lined up).
            rig.DisplayReader.Update(Samples.Qh32Id, m => m with { Hdr = m.Hdr with { On = true } });
            await h.AdvanceAsync(TimeSpan.FromSeconds(2));
            Assert.Equal(HdrView.On, h.Action.LastView);
            Assert.True(h.CallsOf("setImage").All(c => c.Priority is UpdatePriority.Background), "state keys use the background tier");
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Monitor_without_hdr_says_so_and_changes_nothing()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<HdrKey>(TestDevices.Galleon, new(0, 2), settings: new MonitorSettings { Monitor = Samples.Qh27Id });
        Assert.Equal(HdrView.Unsupported, h.Action.LastView);
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Toggling);
        Assert.Empty(rig.DisplayWriter.Calls);
        Assert.Equal("NO HDR HERE", h.Action.FlashText);
        var opts = await h.PiMessageAsync("monitors.list", null, 1);
        Assert.Contains("QH27", opts!.ToJsonString());
        h.AssertFramesAreDeckSafe();
    }
}

public class RefreshKeyTests
{
    [Test]
    public async Task Press_switches_preset_shows_keep_countdown_and_press_again_keeps()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<RefreshKey>(device, at, settings: new RefreshSettings());
            await rig.Until(h, () => h.Action.LastHz == 240 && rig.Services.Display.CachedModes(rig.Services.Display.Find("")!) is not null);
            await h.PressAsync();
            // Wait for the press's off-mailbox work WITHOUT moving the clock: the 15 s window then starts at the press, in step
            // with the 500 ms render loop. (Stepping the clock meanwhile started it 50 ms late at random: 11 at +5 s.)
            await h.Action.Work;
            await h.SettleAsync();
            Assert.False(h.Action.Busy);
            Assert.Equal(120, h.Action.LastHz, "automatic presets: highest ⇄ 120");
            Assert.Equal(15, h.Action.LastSeconds);
            await h.AdvanceAsync(TimeSpan.FromSeconds(5));
            Assert.Equal(10, h.Action.LastSeconds);
            await h.PressAsync();
            await h.Action.Work; // the keep, again without moving the clock (stepping it raced the 10 s left on the countdown)
            await h.SettleAsync();
            Assert.False(h.Action.Busy);
            Assert.Equal("KEPT", h.Action.FlashText);
            Assert.Null(h.Action.LastSeconds);
            Assert.Equal("apply 3440x1440 @ 120 Hz persist", rig.DisplayWriter.Calls[^1]);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task No_confirmation_reverts_and_the_key_says_reverted()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<RefreshKey>(TestDevices.Galleon, new(1, 2), settings: new RefreshSettings { Monitor = Samples.Qh32Id, RateA = 165, RateB = 100 });
        await rig.Until(h, () => rig.Services.Display.CachedModes(rig.Services.Display.Find(Samples.Qh32Id)!) is not null);
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Busy && h.Action.LastSeconds is not null);
        Assert.Equal(100, h.Action.LastHz);
        await h.AdvanceAsync(TimeSpan.FromSeconds(15.5));
        Assert.Null(h.Action.LastSeconds);
        Assert.Equal(165, h.Action.LastHz);
        Assert.Equal("REVERTED", h.Action.FlashText);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task The_key_still_says_reverted_when_it_redraws_while_the_revert_is_being_written()
    {
        // Regression: a render-loop tick that lands while the revert's mode write runs (the write takes a while on a real PC;
        // in the suite it was a tick due at the same instant) used to see "no pending change, no outcome" and lost REVERTED.
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<RefreshKey>(TestDevices.Galleon, new(1, 2), settings: new RefreshSettings { Monitor = Samples.Qh32Id, RateA = 165, RateB = 100 });
        await rig.Until(h, () => rig.Services.Display.CachedModes(rig.Services.Display.Find(Samples.Qh32Id)!) is not null);
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Busy && h.Action.LastSeconds is not null);
        var redrawnMidWrite = false;
        rig.DisplayWriter.DuringApply = (mode, _) =>
        {
            if (mode.Hz != 165) return;
            rig.DisplayWriter.DuringApply = null;
            rig.Services.Display.Find(Samples.Qh32Id, TimeSpan.Zero); // the monitor reads 165 Hz now: Changed, the key redraws
            h.SettleAsync().GetAwaiter().GetResult();
            redrawnMidWrite = h.Action.LastHz == 165;
        };
        await h.AdvanceAsync(TimeSpan.FromSeconds(15.5));
        Assert.True(redrawnMidWrite, "the key redrew while the revert was still being written");
        Assert.Null(h.Action.LastSeconds);
        Assert.Equal("REVERTED", h.Action.FlashText);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Unsupported_preset_and_driver_refusal_alert_without_changing_anything()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<RefreshKey>(TestDevices.Plus, new(1, 1), settings: new RefreshSettings { RateA = 240, RateB = 75 });
        await rig.Until(h, () => rig.Services.Display.CachedModes(rig.Services.Display.Find("")!) is not null);
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Busy);
        Assert.Equal("NO 75 HZ HERE", h.Action.FlashText);
        Assert.Empty(rig.DisplayWriter.Calls);
        rig.DisplayWriter.TestResult = ModeChangeResult.Failed;
        await h.SettingsFromPropertyInspectorAsync(new RefreshSettings { RateA = 240, RateB = 120 });
        await h.PressAsync();
        await rig.Until(h, () => !h.Action.Busy);
        Assert.Equal("DRIVER SAID NO", h.Action.FlashText);
        Assert.True(rig.DisplayWriter.Calls.All(c => c.StartsWith("test", StringComparison.Ordinal)));
        var rates = await h.PiMessageAsync("rates.list", null, 7);
        Assert.Contains("240 Hz", rates!.ToJsonString());
        h.AssertFramesAreDeckSafe();
    }
}

public class DdcTests
{
    [Test]
    public void Capabilities_parse_codes_and_inputs()
    {
        var caps = DdcCapabilities.Parse(new FakeDdcBus().CapsString!);
        Assert.Equal("EXUW34", caps.Model);
        Assert.Equal("2.0", caps.MccsVersion);
        Assert.True(caps.Supports(Vcp.Brightness) && caps.Supports(Vcp.Contrast) && caps.Supports(Vcp.Volume) && caps.Supports(Vcp.InputSource));
        Assert.Equal("15,17,18,26", string.Join(",", caps.Inputs));
        Assert.False(caps.Supports(0x14 + 0x80));
        var none = DdcCapabilities.Parse("(prot(monitor)type(LCD)model(EX27)vcp(02 04 10 12 16 18 1A 52 AC AE B6 C6 C8 C9 D6(01 04) DF)mccs_ver(2.2))");
        Assert.Empty(none.Inputs);
        Assert.False(none.Supports(Vcp.InputSource));
        Assert.Equal("DisplayPort 1", Vcp.InputName(0x0F));
        Assert.Equal("HDMI 2", Vcp.InputName(0x112), "only the low byte counts");
        Assert.Equal("Input 0x1A", Vcp.InputName(0x1A));
        Assert.Equal("DP 1", Vcp.InputShort(0x0F));
        Assert.Empty(DdcCapabilities.Parse("garbage").Codes);
    }

    [Test]
    public async Task Writes_are_debounced_final_value_always_written_and_verified()
    {
        await using var rig = new Rig();
        var ddc = rig.Services.Ddc;
        Assert.Null(ddc.Peek(Samples.UwId, Vcp.Brightness), "first peek starts a read");
        await ddc.WhenIdleAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(90u, ddc.Peek(Samples.UwId, Vcp.Brightness)!.Current);
        for (var i = 1; i <= 10; i++)
        {
            ddc.Adjust(Samples.UwId, Vcp.Brightness, -2);
            rig.Time.Advance(TimeSpan.FromMilliseconds(30)); // a fast spin: one event every 30 ms
            await Task.Yield();
        }
        Assert.Equal(70u, ddc.Peek(Samples.UwId, Vcp.Brightness)!.Shown, "the UI shows the target at once");
        for (var i = 0; i < 40 && ddc.PendingWork > 0; i++) { rig.Time.Advance(TimeSpan.FromMilliseconds(50)); await ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); }
        var writes = rig.DdcWriter.Snapshot().Where(w => w.Code == Vcp.Brightness).ToList();
        Assert.Equal(70u, writes[^1].Value, "the final value is always written");
        Assert.True(writes.Count is >= 2 and <= 4, $"debounced: {writes.Count} writes for 10 steps");
        for (var i = 1; i < writes.Count; i++)
            Assert.True(rig.Time.GetElapsedTime(writes[i - 1].At, writes[i].At) >= DdcService.Debounce, "≥ 150 ms between writes");
        var v = ddc.Peek(Samples.UwId, Vcp.Brightness)!;
        Assert.Equal(DdcStatus.Ok, v.Status);
        Assert.Equal(70u, v.Current);
        Assert.Null(v.Target);
    }

    [Test]
    public async Task A_write_the_monitor_ignored_shows_the_real_value_as_locked()
    {
        await using var rig = new Rig();
        var ddc = rig.Services.Ddc;
        await ddc.ReadAsync(Samples.UwId, Vcp.Brightness);
        rig.Ddc.Locked.Add((Samples.UwId, Vcp.Brightness));
        ddc.Set(Samples.UwId, Vcp.Brightness, 40);
        for (var i = 0; i < 20 && ddc.PendingWork > 0; i++) { rig.Time.Advance(TimeSpan.FromMilliseconds(100)); await ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); }
        var v = ddc.Peek(Samples.UwId, Vcp.Brightness)!;
        Assert.Equal(DdcStatus.Locked, v.Status);
        Assert.Equal(90u, v.Current, "true state, not the optimistic 40");
        Assert.Equal("LOCKED IN HDR", DisplayArt.StatusText(v.Status, hdrOn: true));
        Assert.Equal("NOT APPLIED", DisplayArt.StatusText(v.Status, hdrOn: false));
    }

    [Test]
    public async Task The_same_value_is_sent_again_after_an_ignored_write_and_a_reread_clears_locked()
    {
        await using var rig = new Rig();
        var ddc = rig.Services.Ddc;
        async Task Settle() { for (var i = 0; i < 20 && ddc.PendingWork > 0; i++) { rig.Time.Advance(TimeSpan.FromMilliseconds(100)); await ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); } }
        await ddc.ReadAsync(Samples.UwId, Vcp.Brightness);
        rig.Ddc.Locked.Add((Samples.UwId, Vcp.Brightness));
        ddc.Set(Samples.UwId, Vcp.Brightness, 40);
        await Settle();
        Assert.Equal(DdcStatus.Locked, ddc.Peek(Samples.UwId, Vcp.Brightness, refresh: false)!.Status);
        rig.Ddc.Locked.Clear(); // e.g. HDR turned off
        ddc.Set(Samples.UwId, Vcp.Brightness, 40);
        await Settle();
        Assert.Equal(2, rig.DdcWriter.Snapshot().Count(w => w.Value == 40), "the same value is written again in a new run");
        var v = ddc.Peek(Samples.UwId, Vcp.Brightness, refresh: false)!;
        Assert.Equal(DdcStatus.Ok, v.Status);
        Assert.Equal(40u, v.Current);
        // Locked is a brief alert: the next periodic read shows the true value as OK again.
        rig.Ddc.Locked.Add((Samples.UwId, Vcp.Brightness));
        ddc.Set(Samples.UwId, Vcp.Brightness, 55);
        await Settle();
        Assert.Equal(DdcStatus.Locked, ddc.Peek(Samples.UwId, Vcp.Brightness, refresh: false)!.Status);
        rig.Ddc.Seed(Samples.UwId, Vcp.Brightness, 45); // changed on the monitor's own menu
        rig.Time.Advance(DdcService.RefreshEvery + TimeSpan.FromSeconds(1));
        ddc.Peek(Samples.UwId, Vcp.Brightness);
        await ddc.WhenIdleAsync(TimeSpan.FromSeconds(1));
        v = ddc.Peek(Samples.UwId, Vcp.Brightness, refresh: false)!;
        Assert.Equal(DdcStatus.Ok, v.Status);
        Assert.Equal(45u, v.Current);
    }

    [Test]
    public async Task Unsupported_codes_and_monitors_without_ddc_are_reported_not_invented()
    {
        await using var rig = new Rig();
        rig.Ddc.NoDdc.Add(Samples.Qh32Id);
        var ddc = rig.Services.Ddc;
        await ddc.ReadAsync(Samples.Qh27Id, Vcp.Volume);
        Assert.Equal(DdcStatus.Unsupported, ddc.Peek(Samples.Qh27Id, Vcp.Volume)!.Status);
        Assert.Null(await ddc.ReadAsync(Samples.Qh32Id, Vcp.Brightness));
        Assert.False(ddc.Adjust(Samples.Qh27Id, Vcp.Volume, 5), "no write for an unsupported code");
        Assert.Empty(rig.DdcWriter.Snapshot());
        // A failed GET is retried later, not stuck forever.
        var gets = rig.Ddc.Gets;
        ddc.Peek(Samples.Qh27Id, Vcp.Volume);
        Assert.Equal(gets, rig.Ddc.Gets);
        rig.Time.Advance(DdcService.RetryUnsupported + TimeSpan.FromSeconds(1));
        ddc.Peek(Samples.Qh27Id, Vcp.Volume);
        await ddc.WhenIdleAsync(TimeSpan.FromSeconds(1));
        Assert.Equal(gets + 1, rig.Ddc.Gets);
    }

    [Test]
    public async Task Capabilities_are_read_once_per_monitor()
    {
        await using var rig = new Rig();
        var a = await rig.Services.Ddc.CapabilitiesAsync(Samples.UwId);
        var b = await rig.Services.Ddc.CapabilitiesAsync(Samples.UwId);
        Assert.True(ReferenceEquals(a, b));
        Assert.Equal(1, rig.Ddc.CapsReads);
        Assert.Equal(4, rig.Services.Ddc.CachedCapabilities(Samples.UwId)!.Inputs.Count);
    }

    [Test]
    public async Task Input_switch_verifies_and_reports_a_monitor_that_stops_answering()
    {
        await using var rig = new Rig();
        var ddc = rig.Services.Ddc;
        Assert.Equal(InputSwitchOutcome.AlreadyActive, await ddc.SwitchInputAsync(Samples.UwId, 0x0F));
        Assert.Equal(InputSwitchOutcome.Switched, await rig.Drive(ddc.SwitchInputAsync(Samples.UwId, 0x11)));
        Assert.Equal(0x11u, rig.DdcWriter.Snapshot().Single().Value);
        rig.Ddc.InputStopsAnswering = true;
        Assert.Equal(InputSwitchOutcome.SwitchedUnverified, await rig.Drive(ddc.SwitchInputAsync(Samples.UwId, 0x12)));
    }
}

public class MonitorDialTests
{
    private static async Task Settle(Rig rig, ActionHarness<MonitorDial> h)
    {
        for (var i = 0; i < 30 && rig.Services.Ddc.PendingWork > 0; i++) { await h.AdvanceAsync(TimeSpan.FromMilliseconds(100)); await rig.Services.Ddc.WhenIdleAsync(TimeSpan.FromMilliseconds(30)); }
        await Rig.Drain(h);
    }

    [Test]
    public async Task Galleon_ticks_move_brightness_and_push_cycles_monitors_then_all()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<MonitorDial>(TestDevices.Galleon, new(1, 0), Controller.Encoder, new MonitorDialSettings { Step = 2 });
        await Settle(rig, h);
        Assert.Equal(90u, h.Action.LastValue!.Current);
        Assert.Equal("UW34", h.Action.LastMonitor);
        await h.RotateAsync(-12);
        Assert.Equal(66u, h.Action.LastValue!.Shown, "12 ticks × 2");
        await Settle(rig, h);
        Assert.Equal(66u, rig.DdcWriter.Snapshot()[^1].Value);
        Assert.Equal(DdcStatus.Ok, h.Action.LastValue!.Status);
        // Push: next monitor (left to right, wrapping), then ALL (brightness sync).
        await h.DialPressAsync();
        Assert.Equal("QH27", h.Action.LastMonitor);
        Assert.Equal(Samples.Qh27Id, h.LastSettingsAs<MonitorDialSettings>().Monitor, "the choice is saved");
        await h.DialPressAsync();
        Assert.Equal("ALL", h.Action.LastMonitor);
        await Settle(rig, h);
        await h.RotateAsync(+2);
        await Settle(rig, h);
        var last = rig.DdcWriter.Snapshot().GroupBy(w => w.Monitor).ToDictionary(g => g.Key, g => g.Last().Value);
        Assert.Equal(3, last.Count, "all three monitors written");
        Assert.True(last.Values.Distinct().Count() == 1, "same value everywhere");
        await h.DialPressAsync();
        Assert.Equal("QH32", h.Action.LastMonitor, "wraps to the first");
        await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(1, 1));
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task All_monitors_sync_scales_to_each_monitors_range()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<MonitorDial>(TestDevices.Plus, new(1, 0), Controller.Encoder, new MonitorDialSettings { Feature = "contrast", Monitor = "all", Step = 5 });
        await Settle(rig, h);
        await h.RotateAsync(+1);
        await Settle(rig, h);
        var w = rig.DdcWriter.Snapshot().GroupBy(x => x.Monitor).ToDictionary(g => g.Key, g => g.Last().Value);
        Assert.Equal(85u, w[Samples.Qh32Id]);
        Assert.Equal(128u, w[Samples.Qh27Id], "85% of 150");
        await h.TapAsync(50, 50);
        Assert.Equal("QH32", h.Action.LastMonitor, "touch = next monitor");
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Locked_brightness_in_hdr_says_so_on_the_dial()
    {
        await using var rig = new Rig();
        rig.Ddc.Locked.Add((Samples.Qh32Id, Vcp.Brightness));
        await using var h = await rig.AppearAsync<MonitorDial>(TestDevices.Galleon, new(1, 1), Controller.Encoder, new MonitorDialSettings { Monitor = Samples.Qh32Id });
        await Settle(rig, h);
        await h.RotateAsync(-5);
        await Settle(rig, h);
        Assert.Equal(DdcStatus.Locked, h.Action.LastValue!.Status);
        Assert.Equal(90u, h.Action.LastValue!.Current);
        Assert.Equal("LOCKED IN HDR", h.Action.LastStatus);
        h.AssertFramesAreDeckSafe();
    }

    [Test]
    public async Task Keys_cycle_presets_or_step_on_every_deck()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<MonitorDial>(device, at, Controller.Keypad, new MonitorDialSettings { Presets = "25, 50,100" });
            await Settle(rig, h);
            await h.PressAsync();
            await Settle(rig, h);
            Assert.Equal(100u, rig.DdcWriter.Snapshot()[^1].Value, "90 → next preset above: 100");
            await h.PressAsync();
            await Settle(rig, h);
            Assert.Equal(25u, rig.DdcWriter.Snapshot()[^1].Value, "wraps to the first");
            await h.SettingsFromPropertyInspectorAsync(new MonitorDialSettings { KeyAction = "down", Step = 2 });
            await h.PressAsync();
            await Settle(rig, h);
            Assert.Equal(15u, rig.DdcWriter.Snapshot()[^1].Value, "down by 5 × step");
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background));
            h.AssertFramesAreDeckSafe();
        }
        Assert.Equal("0,25,50,100", string.Join(",", MonitorDial.ParsePresets("100;50 25, 0, x, 250")).Replace("100", "100"));
    }

    [Test]
    public async Task Every_widget_placement_renders_deck_safe_frames()
    {
        foreach (var (device, at) in Placements.Dials())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<MonitorDial>(device, at, Controller.Encoder, new MonitorDialSettings { Feature = "volume" });
            await Settle(rig, h);
            await h.RotateAsync(device.IsGalleon ? 12 : 1);
            await h.DialPressAsync();
            await Settle(rig, h);
            Assert.Equal(Layouts.Canvas.Path, h.LastLayout);
            h.AssertFramesAreDeckSafe();
        }
    }
}

public class InputSourceTests
{
    [Test]
    public async Task Key_needs_a_full_hold_and_names_the_target()
    {
        foreach (var (device, at) in Placements.Keys())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<InputSourceAction>(device, at, Controller.Keypad, new InputSourceSettings { Monitor = Samples.UwId, Input = 0x11 });
            await rig.Services.Ddc.WhenIdleAsync(TimeSpan.FromSeconds(1));
            await h.PressAsync(TimeSpan.FromMilliseconds(900));
            Assert.Empty(rig.DdcWriter.Snapshot());
            Assert.Equal("HOLD TO SWITCH", h.Action.FlashText);
            await h.KeyDownAsync();
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(800));
            Assert.True(h.Action.Hold!.IsHolding);
            Assert.InRange(h.Action.Hold.Progress, 0.5, 0.6);
            await h.AdvanceAsync(TimeSpan.FromMilliseconds(800));
            await h.KeyUpAsync();
            await rig.Until(h, () => !h.Action.Switching);
            Assert.Equal(0x11u, rig.DdcWriter.Snapshot().Single().Value);
            Assert.Equal("SWITCHED", h.Action.FlashText);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Dial_turn_picks_push_arms_second_push_switches()
    {
        foreach (var (device, at) in Placements.Dials())
        {
            await using var rig = new Rig();
            await using var h = await rig.AppearAsync<InputSourceAction>(device, at, Controller.Encoder, new InputSourceSettings { Monitor = Samples.UwId });
            await rig.Until(h, () => h.Action.Inputs().Count == 4);
            await h.RotateAsync(1);
            Assert.Equal(1, h.Action.SelectedIndex);
            await h.DialPressAsync();
            Assert.True(h.Action.Arm!.IsArmed, "first push arms");
            Assert.Empty(rig.DdcWriter.Snapshot());
            await h.AdvanceAsync(TimeSpan.FromSeconds(3.2));
            Assert.False(h.Action.Arm.IsArmed, "disarms after 3 s");
            await h.DialPressAsync();
            await h.RotateAsync(1);
            Assert.False(h.Action.Arm.IsArmed, "turning cancels");
            await h.DialPressAsync();
            await h.AdvanceAsync(TimeSpan.FromSeconds(1));
            if (device.IsPlus) await h.TapAsync(100, 50); else await h.DialPressAsync();
            await rig.Until(h, () => !h.Action.Switching && rig.DdcWriter.Snapshot().Count == 1);
            Assert.Equal(0x12u, rig.DdcWriter.Snapshot().Single().Value);
            h.AssertFramesAreDeckSafe();
        }
    }

    [Test]
    public async Task Active_input_and_unset_input_never_write()
    {
        await using var rig = new Rig();
        await using var h = await rig.AppearAsync<InputSourceAction>(TestDevices.Galleon, new(0, 0), Controller.Keypad, new InputSourceSettings { Monitor = Samples.UwId, Input = 0x0F });
        await rig.Services.Ddc.WhenIdleAsync(TimeSpan.FromSeconds(1));
        await Rig.Drain(h);
        await h.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("ALREADY ACTIVE", h.Action.FlashText);
        await h.SettingsFromPropertyInspectorAsync(new InputSourceSettings { Monitor = Samples.UwId, Input = 0 });
        await h.PressAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("PICK AN INPUT", h.Action.FlashText);
        Assert.Empty(rig.DdcWriter.Snapshot());
        var list = await h.PiMessageAsync("inputs.list", null, 3);
        Assert.Contains("HDMI 1", list!.ToJsonString());
        h.AssertFramesAreDeckSafe();
    }
}
