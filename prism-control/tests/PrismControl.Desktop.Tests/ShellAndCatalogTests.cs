using System.Diagnostics;
using System.Runtime.InteropServices;
using PrismControl.Desktop.Interop;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

public class ShellThreadTests
{
    [Test]
    public async Task Runs_work_on_an_STA_thread_with_per_monitor_v2_DPI()
    {
        using var shell = new ShellThread();
        var (apartment, onShell, awareness, id) = await shell.InvokeAsync(() =>
            (Thread.CurrentThread.GetApartmentState(), shell.IsCurrentThread,
             TestNative.GetAwarenessFromDpiAwarenessContext(TestNative.GetThreadDpiAwarenessContext()), Environment.CurrentManagedThreadId));
        Assert.Equal(ApartmentState.STA, apartment);
        Assert.True(onShell);
        Assert.Equal(2, awareness, "DPI_AWARENESS_PER_MONITOR_AWARE");
        Assert.NotEqual(Environment.CurrentManagedThreadId, id);
        Assert.False(shell.IsCurrentThread);
    }

    [Test]
    public async Task Exceptions_propagate_and_the_thread_survives()
    {
        using var shell = new ShellThread();
        await Assert.ThrowsAsync<InvalidOperationException>(() => shell.InvokeAsync<int>(() => throw new InvalidOperationException("boom")));
        Assert.Equal(42, await shell.InvokeAsync(() => 42));
    }

    [Test]
    public async Task Nested_invoke_runs_inline()
    {
        using var shell = new ShellThread();
        var r = await shell.InvokeAsync(() => shell.InvokeAsync(() => 7).IsCompletedSuccessfully);
        Assert.True(r, "an invoke from the shell thread completes synchronously (no deadlock)");
    }

    [Test]
    public async Task Cancelled_work_never_runs()
    {
        using var shell = new ShellThread();
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var ran = false;
        await Assert.ThrowsAsync<TaskCanceledException>(() => shell.InvokeAsync(() => { ran = true; }, cts.Token));
        Assert.False(ran);
    }

    [Test]
    public async Task Thousands_of_invokes_complete_in_order()
    {
        using var shell = new ShellThread();
        var order = new List<int>();
        var tasks = Enumerable.Range(0, 2000).Select(i => shell.InvokeAsync(() => { order.Add(i); return i; })).ToArray();
        await Task.WhenAll(tasks);
        Assert.Equal(2000, order.Count);
        Assert.True(order.SequenceEqual(Enumerable.Range(0, 2000)), "FIFO");
    }

    [Test]
    public void The_window_is_a_hidden_top_level_tool_window()
    {
        using var shell = new ShellThread();
        var h = shell.WindowHandle;
        Assert.True(TestNative.IsWindow(h) != 0);
        Assert.Equal(0, TestNative.IsWindowVisible(h));
        Assert.Equal(TestNative.GetDesktopWindow(), TestNative.GetAncestor(h, 1), "top-level (parent = desktop), so broadcasts reach it");
        Assert.True(((uint)TestNative.GetWindowLongPtrW(h, -20) & 0x80) != 0, "WS_EX_TOOLWINDOW");
    }

    [Test]
    public async Task Broadcasts_are_raised_on_the_thread_pool_in_order_with_payload_copies()
    {
        using var shell = new ShellThread();
        var got = new List<(ShellBroadcast B, bool OnShell)>();
        shell.Broadcast += b => { lock (got) got.Add((b, shell.IsCurrentThread)); };
        var area = Marshal.StringToHGlobalUni("ImmersiveColorSet");
        var setting = Marshal.AllocHGlobal(24);
        try
        {
            // Messages to OUR OWN hidden window only (no system broadcast is sent).
            var guid = new Guid("02731015-4510-4526-99e6-e5a17ebd1aea");
            Marshal.Copy(guid.ToByteArray(), 0, setting, 16);
            Marshal.WriteInt32(setting, 16, 4);
            Marshal.WriteInt32(setting, 20, 1);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_SETTINGCHANGE, 0, area);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_DISPLAYCHANGE, 32, (1440 << 16) | 3440);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_POWERBROADCAST, 0x8013, setting);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_CLIPBOARDUPDATE, 0, 0);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_THEMECHANGED, 0, 0);
            TestNative.SendMessageW(shell.WindowHandle, User32.WM_SETTINGCHANGE, 0, 0);
        }
        finally
        {
            Marshal.FreeHGlobal(area);
            Marshal.FreeHGlobal(setting);
        }
        await shell.DrainEventsAsync();
        lock (got)
        {
            Assert.Equal("SettingChange DisplayChange PowerBroadcast ClipboardUpdate ThemeChanged SettingChange", string.Join(" ", got.Select(g => g.B.Kind)));
            Assert.True(got.All(g => !g.OnShell), "raised off the shell thread");
            Assert.Equal("ImmersiveColorSet", got[0].B.Area);
            Assert.Equal((nint)32, got[1].B.WParam);
            var data = Assert.NotNull(got[2].B.Data);
            Assert.Equal(24, data.Length);
            Assert.Equal(new Guid("02731015-4510-4526-99e6-e5a17ebd1aea"), new Guid(data.AsSpan(0, 16)));
            Assert.Null(got[5].B.Area);
        }
    }

    [Test]
    public async Task A_throwing_subscriber_does_not_stop_later_events()
    {
        using var shell = new ShellThread(new RecordingLog());
        var count = 0;
        shell.Broadcast += _ => { if (Interlocked.Increment(ref count) == 1) throw new InvalidOperationException("subscriber bug"); };
        TestNative.SendMessageW(shell.WindowHandle, User32.WM_THEMECHANGED, 0, 0);
        TestNative.SendMessageW(shell.WindowHandle, User32.WM_THEMECHANGED, 0, 0);
        await shell.DrainEventsAsync();
        Assert.Equal(2, count);
    }

    [Test]
    public async Task Dispose_stops_the_thread_destroys_the_window_and_fails_later_work()
    {
        var shell = new ShellThread();
        var h = shell.WindowHandle;
        Assert.Equal(1, await shell.InvokeAsync(() => 1));
        shell.Dispose();
        Assert.Equal(0, TestNative.IsWindow(h));
        await Assert.ThrowsAsync<ObjectDisposedException>(() => shell.InvokeAsync(() => 2));
        shell.Dispose(); // idempotent
    }

    [Test]
    public async Task Hotkey_and_WinEvent_registration_must_run_on_the_shell_thread()
    {
        using var shell = new ShellThread();
        Assert.Throws<InvalidOperationException>(() => shell.UnregisterHotkey(1));
        Assert.Throws<InvalidOperationException>(() => shell.AddWinEventHook(3, 3, (_, _, _, _, _, _) => { }));
        var hook = await shell.InvokeAsync(() => shell.AddWinEventHook(3, 3, (_, _, _, _, _, _) => { }));
        Assert.NotEqual((nint)0, hook);
        await shell.InvokeAsync(() => shell.RemoveWinEventHook(hook));
    }
}

public class AltTabRuleTests
{
    private static WindowFacts F(uint ex = 0, int title = 5, bool walk = true, uint cloaked = 0, bool? onCurrent = null, bool desk = false, bool visible = true, bool shell = false) =>
        new(visible, shell, ex, title, walk, cloaked, onCurrent, desk);

    [Test]
    public void Normal_windows_are_included()
    {
        Assert.Equal(AltTabVerdict.Include, AltTabRules.Classify(F()));
    }

    [Test]
    public void Exclusions()
    {
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(visible: false)));
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(shell: true)));
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(ex: User32.WS_EX_TOOLWINDOW)), "tool window");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(ex: User32.WS_EX_NOACTIVATE)), "no-activate");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(title: 0)), "untitled");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(walk: false)), "an owned window whose owner shows in alt-tab");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(cloaked: AltTabRules.CloakedApp)), "app-cloaked");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(cloaked: AltTabRules.CloakedInherited)), "inherited cloak");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(cloaked: AltTabRules.CloakedShell, onCurrent: true, desk: false)),
            "a prelaunched/suspended UWP frame: shell-cloaked, 'on the current desktop', no desktop id (this PC: Settings, Xbox)");
        Assert.Equal(AltTabVerdict.Exclude, AltTabRules.Classify(F(cloaked: AltTabRules.CloakedShell, onCurrent: false, desk: false)));
    }

    [Test]
    public void App_windows_override_tool_noactivate_and_owner()
    {
        Assert.Equal(AltTabVerdict.Include, AltTabRules.Classify(F(ex: User32.WS_EX_APPWINDOW | User32.WS_EX_TOOLWINDOW)));
        Assert.Equal(AltTabVerdict.Include, AltTabRules.Classify(F(ex: User32.WS_EX_APPWINDOW | User32.WS_EX_NOACTIVATE)));
        Assert.Equal(AltTabVerdict.Include, AltTabRules.Classify(F(ex: User32.WS_EX_APPWINDOW, walk: false)));
    }

    [Test]
    public void Windows_on_another_virtual_desktop_are_included_flagged()
    {
        Assert.Equal(AltTabVerdict.IncludeCloaked, AltTabRules.Classify(F(cloaked: AltTabRules.CloakedShell, onCurrent: false, desk: true)));
    }
}

public class CatalogIntegrationTests
{
    [Test(Category = "integration")]
    public void Alt_tab_list_is_sane_and_fast()
    {
        // READ-ONLY: enumerates windows. Titles are personal data and are never printed.
        var catalog = new WindowCatalog(null);
        catalog.AltTabWindows(); // warm-up (COM)
        var sw = Stopwatch.StartNew();
        var list = catalog.AltTabWindows();
        sw.Stop();
        Console.WriteLine($"     alt-tab: {list.Count} windows ({list.Count(w => w.IsCloaked)} on other desktops) in {sw.Elapsed.TotalMilliseconds:F1} ms");
        Assert.True(sw.ElapsedMilliseconds < 1000, "enumeration stays cheap");
        Assert.True(list.Count >= 1, "this desktop has at least one window (the terminal running the tests)");
        Assert.Equal(list.Count, list.Select(w => w.Hwnd).Distinct().Count());
        foreach (var w in list)
        {
            Assert.True(TestNative.IsWindowVisible(w.Hwnd) != 0);
            Assert.True(w.Title.Length > 0);
            Assert.True(w.Pid > 0);
            Assert.NotEqual((nint)0, w.Monitor);
            if (w.ExePath is not null) Assert.Equal(Path.GetFileName(w.ExePath), w.ProcessName);
            if (!w.IsMinimized) Assert.False(w.Bounds.IsEmpty, "a restored window has a frame");
        }
    }

    [Test(Category = "integration")]
    public void Get_reads_any_window_and_null_for_dead_handles()
    {
        var catalog = new WindowCatalog(null);
        Assert.Null(catalog.Get(0));
        Assert.Null(catalog.Get(0x7FFF_FFF0));
        var first = catalog.AltTabWindows().FirstOrDefault();
        if (first is null) Assert.Skip("no windows");
        var again = Assert.NotNull(catalog.Get(first!.Hwnd));
        Assert.Equal(first.Pid, again.Pid);
        Assert.Equal(first.ProcessName, again.ProcessName);
        Assert.Equal(first.AppUserModelId, again.AppUserModelId);
    }

    [Test(Category = "integration")]
    public void Elevation_flag_matches_token_integrity()
    {
        var catalog = new WindowCatalog(null);
        foreach (var w in catalog.AltTabWindows())
        {
            var il = ProcessInfo.Integrity((uint)w.Pid, out _);
            var expected = il < 0 || il > ProcessInfo.OwnIntegrity;
            Assert.Equal(expected, w.IsElevated, w.ProcessName);
        }
    }

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task Events_for_a_window_this_test_creates()
    {
        // Our own window (class proc = DefWindowProcW): shown with SW_SHOWNOACTIVATE off-screen, WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW.
        // It never becomes foreground and never appears in alt-tab. It must be visible: Windows raises no NAMECHANGE for hidden
        // windows, and STATIC controls raise none at all (probed in aaa-prism-play/platform/probe2).
        using var shell = new ShellThread();
        using var catalog = new WindowCatalog(shell);
        var events = new List<WindowEvent>();
        catalog.Changed += e => { lock (events) events.Add(e); };
        await catalog.HooksReady!;
        nint hwnd = 0;
        var t = new Thread(() =>
        {
            hwnd = TestNative.CreateOwnTestWindow("prism-test");
            TestNative.ShowWindow(hwnd, 4 /* SW_SHOWNOACTIVATE */);
            TestNative.SetWindowTextW(hwnd, "prism-test-2");
            Thread.Sleep(250);
            TestNative.DestroyWindow(hwnd);
        });
        t.Start();
        t.Join();
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            await shell.DrainEventsAsync();
            lock (events) if (events.Any(e => e.Hwnd == hwnd && e.Kind == WindowEventKind.Destroyed)) break;
            await Task.Delay(20);
        }
        lock (events)
        {
            var mine = events.Where(e => e.Hwnd == hwnd).Select(e => e.Kind).ToList();
            Assert.Equal(WindowEventKind.Created, mine.FirstOrDefault(), string.Join(",", mine));
            Assert.True(mine.Contains(WindowEventKind.Shown), string.Join(",", mine));
            Assert.True(mine.Contains(WindowEventKind.TitleChanged), string.Join(",", mine));
            Assert.Equal(WindowEventKind.Destroyed, mine.LastOrDefault(), string.Join(",", mine));
            Assert.False(mine.Contains(WindowEventKind.Foreground), "the test window must never take the foreground");
        }
    }
}
