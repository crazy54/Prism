using PrismControl.Core.Hosting;
using PrismControl.Desktop.Interop;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

public class ForegroundTrackerTests
{
    private const uint Own = 10, StreamDeck = 20, App = 30, App2 = 40;

    private static ForegroundTracker Make(Dictionary<nint, (uint, string?, string)> windows, HashSet<nint>? alive = null) =>
        new(new ForegroundFilter { OwnPid = Own }, h => windows.TryGetValue(h, out var d) ? d : (0, null, ""), h => alive?.Contains(h) ?? windows.ContainsKey(h));

    [Test]
    public void Filter_excludes_us_the_Stream_Deck_app_and_shell_surfaces()
    {
        var f = new ForegroundFilter { OwnPid = Own };
        Assert.False(f.IsExternal(Own, "PrismControl.exe", "Chrome_WidgetWin_1"));
        Assert.False(f.IsExternal(StreamDeck, "StreamDeck.exe", "Qt662QWindowIcon"));
        Assert.False(f.IsExternal(StreamDeck, "streamdeck.EXE", "x"), "process names compare case-insensitively");
        Assert.False(f.IsExternal(App, "explorer.exe", "Shell_TrayWnd"));
        Assert.False(f.IsExternal(App, "explorer.exe", "XamlExplorerHostIslandWindow"));
        Assert.False(f.IsExternal(0, null, "x"));
        Assert.True(f.IsExternal(App, "notepad.exe", "Notepad"));
        Assert.True(f.IsExternal(App, null, "Notepad"), "an unreadable process is still external");
        Assert.True(f.IsExternal(App, "explorer.exe", "CabinetWClass"), "a File Explorer window is a real app");
    }

    [Test]
    public void Tracks_the_most_recent_external_window()
    {
        var w = new Dictionary<nint, (uint, string?, string)>
        {
            [1] = (App, "notepad.exe", "Notepad"), [2] = (StreamDeck, "StreamDeck.exe", "Qt"), [3] = (Own, "PrismControl.exe", "x"),
            [4] = (App2, "chrome.exe", "Chrome_WidgetWin_1"), [5] = (App, "explorer.exe", "Shell_TrayWnd"),
        };
        var t = Make(w);
        Assert.Equal((nint)0, t.LastExternal);
        t.Observe(1);
        Assert.Equal((nint)1, t.LastExternal);
        t.Observe(2); t.Observe(3); t.Observe(5);
        Assert.Equal((nint)1, t.LastExternal, "Stream Deck, our own and taskbar windows never become the previous window");
        t.Observe(4);
        Assert.Equal((nint)4, t.LastExternal);
        t.Observe(0);
        Assert.Equal((nint)4, t.LastExternal);
    }

    [Test]
    public void Falls_back_to_the_previous_window_when_the_newest_closes()
    {
        var w = new Dictionary<nint, (uint, string?, string)> { [1] = (App, "a.exe", "A"), [2] = (App2, "b.exe", "B") };
        var alive = new HashSet<nint> { 1, 2 };
        var t = Make(w, alive);
        t.Observe(1);
        t.Observe(2);
        Assert.Equal((nint)2, t.LastExternal);
        alive.Remove(2);
        Assert.Equal((nint)1, t.LastExternal);
        alive.Remove(1);
        Assert.Equal((nint)0, t.LastExternal);
    }

    [Test]
    public void History_is_deduplicated_and_capped_at_eight()
    {
        var w = Enumerable.Range(1, 12).ToDictionary(i => (nint)i, i => ((uint)(100 + i), (string?)"app.exe", "C"));
        var alive = new HashSet<nint>(w.Keys);
        var t = Make(w, alive);
        for (var i = 1; i <= 12; i++) t.Observe(i);
        t.Observe(5); // re-focusing moves it to the front, no duplicate
        Assert.Equal((nint)5, t.LastExternal);
        alive.Remove(5);
        Assert.Equal((nint)12, t.LastExternal);
        foreach (var h in new nint[] { 12, 11, 10, 9, 8, 7, 6 }) alive.Remove(h);
        Assert.Equal((nint)0, t.LastExternal, "only the 8 most recent are kept (5 plus 12..6)");
    }

    [Test(Category = "integration")]
    public async Task Real_tracker_reads_only_external_windows()
    {
        // Read-only: installs an EVENT_SYSTEM_FOREGROUND hook on our own shell thread and reads the current foreground.
        using var shell = new ShellThread();
        using var tracker = new ForegroundTracker(shell);
        await Task.Delay(100);
        var h = tracker.LastExternal;
        if (h != 0)
        {
            TestNative.GetWindowThreadProcessId(h, out var pid);
            Assert.NotEqual((uint)Environment.ProcessId, pid, "never our own window");
        }
    }
}

public class InputTests
{
    private static (SendInputSender S, FakeInjector K, RecordingLog L) Make()
    {
        var k = new FakeInjector();
        var log = new RecordingLog();
        return (new SendInputSender(k, log), k, log);
    }

    private static string Describe(IEnumerable<KeyEvent> events) => string.Join(" ", events.Select(e =>
        (e.IsUp ? "-" : "+") + ((e.Flags & User32.KEYEVENTF_UNICODE) != 0 ? "u" + ((char)e.Scan) : e.Vk.ToString("X2")) + ((e.Flags & User32.KEYEVENTF_EXTENDEDKEY) != 0 ? "e" : "")));

    [Test]
    public async Task Chord_goes_down_in_order_and_up_in_reverse_in_one_batch()
    {
        var (s, k, _) = Make();
        Assert.True(await s.SendChordAsync([VirtualKey.Control, VirtualKey.Shift, VirtualKey.V]));
        Assert.Single(k.Batches);
        Assert.Equal("+11 +10 +56 -56 -10 -11", Describe(k.Batches[0]));
        Assert.Equal((ushort)0x1D, k.Batches[0][0].Scan, "scan codes are filled");
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Extended_keys_carry_the_extended_flag()
    {
        var (s, k, _) = Make();
        Assert.True(await s.SendChordAsync([VirtualKey.RightAlt, VirtualKey.Left]));
        Assert.Equal("+A5e +25e -25e -A5e", Describe(k.Batches[0]));
        Assert.True(await s.SendKeyAsync(VirtualKey.Delete));
        Assert.Equal("+2Ee -2Ee", Describe(k.Batches[1]));
        Assert.True(await s.SendKeyAsync(VirtualKey.F4));
        Assert.Equal("+73 -73", Describe(k.Batches[2]), "F4 is not extended");
        Assert.True(VirtualKeys.IsExtended(VirtualKey.LeftWindows));
        Assert.True(VirtualKeys.IsExtended(VirtualKey.MediaPlayPause));
        Assert.False(VirtualKeys.IsExtended(VirtualKey.A));
        Assert.True(VirtualKeys.IsModifier(VirtualKey.Control) && VirtualKeys.IsModifier(VirtualKey.RightWindows) && !VirtualKeys.IsModifier(VirtualKey.Tab));
    }

    [Test]
    public async Task A_partial_batch_releases_exactly_the_keys_that_went_down()
    {
        var (s, k, log) = Make();
        k.Script.Enqueue(2); // Ctrl and Shift went down, V did not
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.Shift, VirtualKey.V]));
        Assert.Equal(2, k.Batches.Count);
        Assert.Equal("-10 -11", Describe(k.Batches[1]), "released in reverse order");
        Assert.Empty(k.StillDown());
        Assert.Contains("accepted 2 of 6", log.Text);
    }

    [Test]
    public async Task A_batch_cut_after_some_releases_only_releases_what_is_still_down()
    {
        var (s, k, _) = Make();
        k.Script.Enqueue(3); // +Ctrl +V -V | -Ctrl: cut after -V, so Ctrl is still down
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.V]));
        Assert.Equal("-11", Describe(k.Batches[1]));
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task A_throwing_SendInput_releases_every_key_of_the_batch()
    {
        var (s, k, log) = Make();
        k.Script.Enqueue(-2);
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.Alt, VirtualKey.Delete]));
        Assert.Equal("-2Ee -12 -11", Describe(k.Batches[1]));
        Assert.Contains("released the keys", log.Text);
    }

    [Test]
    public async Task A_failed_release_is_retried_once()
    {
        var (s, k, log) = Make();
        k.Script.Enqueue(2);   // the chord: two downs
        k.Script.Enqueue(1);   // first release attempt: only one up accepted
        k.Script.Enqueue(-1);  // retry: the rest
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.Shift, VirtualKey.A]));
        Assert.Equal(3, k.Batches.Count);
        Assert.Empty(k.StillDown());
        Assert.DoesNotContain("did not accept", log.Text);
    }

    [Test]
    public async Task Releases_that_keep_failing_are_reported()
    {
        var (s, k, log) = Make();
        k.Script.Enqueue(1);
        k.Script.Enqueue(0);
        k.Script.Enqueue(0);
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.C]));
        Assert.Contains("did not accept 1 key releases", log.Text);
    }

    [Test]
    public async Task Elevated_foreground_refuses_without_sending()
    {
        var (s, k, log) = Make();
        k.Elevated.Add(k.ForegroundWindow);
        Assert.False(await s.SendChordAsync([VirtualKey.Control, VirtualKey.V]));
        Assert.False(await s.SendTextAsync("hello"));
        Assert.Empty(k.Batches);
        Assert.Contains("administrator", log.Text);
        Assert.True(s.TargetIsElevated(0), "0 = the foreground window");
        Assert.True(s.TargetIsElevated(k.ForegroundWindow));
        Assert.False(s.TargetIsElevated(0x4444));
    }

    [Test]
    public async Task No_foreground_window_still_tries_media_keys()
    {
        var (s, k, _) = Make();
        k.ForegroundWindow = 0;
        Assert.True(await s.SendKeyAsync(VirtualKey.VolumeUp));
        Assert.Single(k.Batches);
    }

    [Test]
    public async Task Invalid_chords_are_refused()
    {
        var (s, k, _) = Make();
        Assert.False(await s.SendChordAsync([]));
        Assert.False(await s.SendChordAsync([VirtualKey.None]));
        Assert.False(await s.SendChordAsync([VirtualKey.A, VirtualKey.A]));
        Assert.False(await s.SendChordAsync(Enumerable.Range(0, 9).Select(i => (VirtualKey)(0x41 + i)).ToList()));
        Assert.Empty(k.Batches);
    }

    [Test]
    public async Task Text_is_unicode_with_enter_and_tab()
    {
        var (s, k, _) = Make();
        Assert.True(await s.SendTextAsync("Hi\r\n\tx\ry\u0007z"));
        var all = k.Batches.SelectMany(b => b).ToList();
        Assert.Equal("+uH -uH +ui -ui +0D -0D +09 -09 +ux -ux +0D -0D +uy -uy +uz -uz", Describe(all), "\\r\\n is one Enter, a lone \\r too, BEL skipped");
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Surrogate_pairs_are_two_units_and_batches_never_split_a_pair()
    {
        var (s, k, _) = Make();
        var text = string.Concat(Enumerable.Repeat("a\U0001F600", 40)); // 120 UTF-16 units → 240 events
        Assert.True(await s.SendTextAsync(text));
        Assert.True(k.Batches.Count >= 4);
        foreach (var b in k.Batches)
        {
            Assert.True(b.Length <= SendInputSender.TextBatchEvents && b.Length % 2 == 0);
            for (var i = 0; i < b.Length; i += 2)
            {
                Assert.False(b[i].IsUp);
                Assert.True(b[i + 1].IsUp && b[i + 1].Scan == b[i].Scan, "a down is always followed by its own up");
            }
        }
        var units = k.Batches.SelectMany(b => b).Where(e => !e.IsUp).Select(e => (char)e.Scan);
        Assert.Equal(text, new string(units.ToArray()));
    }

    [Test]
    public async Task Typing_stops_when_the_foreground_window_changes()
    {
        var (s, k, log) = Make();
        var calls = 0;
        k.ForegroundFunc = () => ++calls > 2 ? 0x2000 : 0x1000; // InputAllowed + start read 0x1000, then it changes
        Assert.False(await s.SendTextAsync(new string('a', 100)));
        Assert.Single(k.Batches);
        Assert.Contains("foreground window changed", log.Text);
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Text_limits_and_empty_text()
    {
        var (s, k, _) = Make();
        Assert.True(await s.SendTextAsync(""));
        Assert.False(await s.SendTextAsync(new string('a', SendInputSender.MaxTextLength + 1)));
        Assert.Empty(k.Batches);
        await Assert.ThrowsAsync<ArgumentNullException>(() => s.SendTextAsync(null!));
    }

    [Test]
    public async Task A_failed_text_batch_releases_and_stops()
    {
        var (s, k, _) = Make();
        k.Script.Enqueue(-1);
        k.Script.Enqueue(3); // second batch: a down, its up, and one more down
        Assert.False(await s.SendTextAsync(new string('b', 64)));
        Assert.Equal(3, k.Batches.Count, "the release batch, then stop");
        Assert.Empty(k.StillDown());
    }

    [Test]
    public async Task Cancellation_stops_between_batches_with_no_stuck_keys()
    {
        var (s, k, _) = Make();
        using var cts = new CancellationTokenSource();
        k.ForegroundFunc = () => { if (k.Batches.Count >= 1) cts.Cancel(); return 0x1000; };
        await Assert.ThrowsAsync<OperationCanceledException>(() => s.SendTextAsync(new string('c', 200), cts.Token));
        Assert.Empty(k.StillDown());
        using var pre = new CancellationTokenSource();
        pre.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => s.SendChordAsync([VirtualKey.A], pre.Token));
    }

    [Test]
    public void Still_down_bookkeeping()
    {
        var k = new FakeInjector();
        var ev = KeySequences.Chord([VirtualKey.Control, VirtualKey.Shift, VirtualKey.A], k);
        Assert.Equal(0, KeySequences.StillDown(ev, 0).Count);
        Assert.Equal(3, KeySequences.StillDown(ev, 3).Count);
        Assert.Equal(1, KeySequences.StillDown(ev, 5).Count);
        Assert.Equal(0, KeySequences.StillDown(ev, 6).Count);
    }

    [Test]
    public async Task Recording_fake_records_and_never_logs_the_text()
    {
        var log = new RecordingLog();
        var r = new RecordingInputSender(log, _ => true);
        Assert.True(await r.SendChordAsync([VirtualKey.Control, VirtualKey.V]));
        Assert.True(await r.SendKeyAsync(VirtualKey.MediaPlayPause));
        Assert.True(await r.SendTextAsync("secret-example-text"));
        Assert.Equal(3, r.Records.Count);
        Assert.Equal(InputRecordKind.Chord, r.Records[0].Kind);
        Assert.Equal("Control,V", string.Join(",", r.Records[0].Keys));
        Assert.Equal("secret-example-text", r.Records[2].Text);
        Assert.Contains("[safe mode] would press Control+V", log.Text);
        Assert.Contains("[safe mode] would type 19 characters", log.Text);
        Assert.DoesNotContain("secret-example-text", log.Text);
        Assert.True(r.TargetIsElevated(0));
        r.Result = false;
        Assert.False(await r.SendKeyAsync(VirtualKey.A));
        r.Clear();
        Assert.Empty(r.Records);
    }

    [Test]
    public void INPUT_layout_matches_x64()
    {
        unsafe
        {
            Assert.Equal(40, sizeof(INPUT));
            Assert.Equal(24, sizeof(KEYBDINPUT));
            Assert.Equal(32, sizeof(MOUSEINPUT));
        }
    }
}
