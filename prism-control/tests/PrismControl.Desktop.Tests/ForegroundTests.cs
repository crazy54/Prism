using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

/// <summary>The foreground ladder against a scripted native layer. Nothing here ever focuses a real window.</summary>
public class ForegroundTests
{
    private const nint Target = 0x100, Other = 0x200, Child = 0x101, Dialog = 0x102;

    private static (ForegroundService Svc, FakeForegroundNative N) Make(Action<FakeForegroundNative>? setup = null)
    {
        var n = new FakeForegroundNative();
        n.Windows.UnionWith([Target, Other, Child, Dialog]);
        n.Roots[Child] = Target;
        n.Foreground = Other;
        setup?.Invoke(n);
        return (new ForegroundService(n, () => 0x777, NullLog.Instance, new ManualTimeProvider()), n);
    }

    [Test]
    public async Task No_window_for_zero_or_a_dead_handle()
    {
        var (svc, n) = Make();
        Assert.Equal(ForegroundResult.NoWindow, await svc.BringToFrontAsync(0));
        Assert.Equal(ForegroundResult.NoWindow, await svc.BringToFrontAsync(0x999));
        Assert.Empty(n.Calls, "no writes for a missing window");
    }

    [Test]
    public async Task Already_focused_changes_nothing()
    {
        var (svc, n) = Make(n => n.Foreground = Target);
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.AlreadyFocused, o.Result);
        Assert.Equal(ForegroundRung.None, o.Rung);
        Assert.Empty(n.Calls);
    }

    [Test]
    public async Task Hotkey_trick_focuses_inside_the_handler()
    {
        var (svc, n) = Make();
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Focused, o.Result);
        Assert.Equal(ForegroundRung.HotkeyTrick, o.Rung);
        Assert.Equal("trick|sfw-in-handler 256", string.Join("|", n.Calls));
        Assert.True(o.Succeeded);
    }

    [Test]
    public async Task Minimized_window_is_restored_before_focusing()
    {
        var (svc, n) = Make(n => n.Minimized.Add(Target));
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Restored, o.Result);
        Assert.Equal("trick|restore 256|sfw-in-handler 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Minimized_and_focused_still_restores()
    {
        var (svc, n) = Make(n => { n.Foreground = Target; n.Minimized.Add(Target); });
        Assert.Equal(ForegroundResult.Restored, await svc.BringToFrontAsync(Target));
        Assert.Contains("restore 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Slow_restore_is_waited_for()
    {
        var (svc, n) = Make(n => { n.Minimized.Add(Target); n.RestoreLag = 3; });
        Assert.Equal(ForegroundResult.Restored, await svc.BringToFrontAsync(Target));
        Assert.True(n.Delays >= 1, "verification polled while the restore landed");
    }

    [Test]
    public async Task Trick_timeout_falls_back_to_SetForegroundWindow()
    {
        var (svc, n) = Make(n => { n.Trick = HotkeyTrickResult.TimedOut; n.SfwWorks = true; });
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Focused, o.Result);
        Assert.Equal(ForegroundRung.SetForegroundWindow, o.Rung);
        Assert.Equal("trick|sfw 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task F22_taken_by_another_app_falls_back()
    {
        var (svc, n) = Make(n => { n.Trick = HotkeyTrickResult.Unavailable; n.SfwWorks = true; });
        Assert.Equal(ForegroundRung.SetForegroundWindow, (await svc.BringToFrontDetailedAsync(Target)).Rung);
    }

    [Test]
    public async Task SwitchToThisWindow_is_the_last_rung()
    {
        var (svc, n) = Make(n => { n.SfwInHandlerWorks = false; n.SwitchWorks = true; });
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Focused, o.Result);
        Assert.Equal(ForegroundRung.SwitchToThisWindow, o.Rung);
        Assert.Equal("trick|sfw-in-handler 256|sfw 256|switch 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Everything_refused_is_Refused()
    {
        var (svc, n) = Make(n => n.SfwInHandlerWorks = false);
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Refused, o.Result);
        Assert.Equal(ForegroundRung.None, o.Rung);
        Assert.False(o.Succeeded);
    }

    [Test]
    public async Task Refused_with_an_elevated_target_is_Elevated()
    {
        var (svc, _) = Make(n => { n.SfwInHandlerWorks = false; n.Elevated.Add(Target); });
        Assert.Equal(ForegroundResult.Elevated, await svc.BringToFrontAsync(Target));
    }

    [Test]
    public async Task Elevated_foreground_skips_the_trick_because_UIPI_drops_F22()
    {
        var (svc, n) = Make(n => n.Elevated.Add(Other));
        Assert.Equal(ForegroundResult.Elevated, await svc.BringToFrontAsync(Target));
        Assert.Equal(0, n.TrickCalls);
        Assert.Equal("sfw 256|switch 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Elevated_foreground_but_SetForegroundWindow_allowed_still_works()
    {
        var (svc, n) = Make(n => { n.Elevated.Add(Other); n.SfwWorks = true; });
        Assert.Equal(ForegroundResult.Focused, await svc.BringToFrontAsync(Target));
    }

    [Test]
    public async Task Our_own_foreground_skips_the_trick()
    {
        var (svc, n) = Make(n => { n.Ours.Add(Other); n.SfwWorks = true; });
        Assert.Equal(ForegroundRung.SetForegroundWindow, (await svc.BringToFrontDetailedAsync(Target)).Rung);
        Assert.Equal(0, n.TrickCalls);
    }

    [Test]
    public async Task A_child_handle_targets_its_top_level_window()
    {
        var (svc, n) = Make();
        var o = await svc.BringToFrontDetailedAsync(Child);
        Assert.Equal(Target, o.Window);
        Assert.Contains("sfw-in-handler 256", string.Join("|", n.Calls));
    }

    [Test]
    public async Task An_owned_dialog_taking_focus_counts_as_success()
    {
        var (svc, n) = Make(n =>
        {
            n.RootOwners[Dialog] = Target;
            n.SfwInHandlerWorks = false;
            n.SwitchWorks = false;
        });
        // Simulate: activating the owner activates its modal dialog.
        n.Foreground = Other;
        var native = n;
        var svc2 = new ForegroundService(new DialogActivatingNative(native, Dialog), () => 0, NullLog.Instance, new ManualTimeProvider());
        Assert.Equal(ForegroundResult.Focused, await svc2.BringToFrontAsync(Target));
    }

    [Test]
    public async Task Cancellation_throws()
    {
        var (svc, _) = Make();
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => svc.BringToFrontAsync(Target, cts.Token));
    }

    [Test]
    public async Task Concurrent_attempts_are_serialized()
    {
        var gate = new GatedNative();
        var svc = new ForegroundService(gate, () => 0, NullLog.Instance, new ManualTimeProvider());
        var a = svc.BringToFrontAsync(Target);
        var b = svc.BringToFrontAsync(Target);
        await Task.Delay(50);
        Assert.Equal(1, gate.MaxConcurrent, "only one ladder runs at a time");
        gate.Release.SetResult();
        await Task.WhenAll(a, b);
        Assert.Equal(1, gate.MaxConcurrent);
    }

    [Test]
    public async Task Elapsed_is_measured_with_the_time_provider()
    {
        var (svc, _) = Make();
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.True(o.Elapsed >= TimeSpan.Zero);
    }

    [Test]
    public void LastExternalForeground_and_GetForeground_are_reads()
    {
        var (svc, n) = Make();
        Assert.Equal((nint)0x777, svc.LastExternalForeground);
        Assert.Equal(Other, svc.GetForeground());
        Assert.Empty(n.Calls);
    }

    // ------------------------------------------------------------------ GrantForegroundAsync

    [Test]
    public async Task Grant_gains_the_right_then_allows_the_pid_inside_the_handler()
    {
        var (svc, n) = Make();
        Assert.True(await svc.GrantForegroundAsync(4242));
        Assert.Equal("trick|asfw-in-handler 4242", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Grant_falls_back_to_a_plain_AllowSetForegroundWindow()
    {
        var (svc, n) = Make(n => { n.Trick = HotkeyTrickResult.TimedOut; n.AsfwWorks = true; });
        Assert.True(await svc.GrantForegroundAsync(4242));
        Assert.Equal("trick|asfw 4242", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Grant_refused_returns_false()
    {
        var (svc, _) = Make(n => n.AsfwInHandlerWorks = false);
        Assert.False(await svc.GrantForegroundAsync(4242));
    }

    [Test]
    public async Task Grant_rejects_bad_pids()
    {
        var (svc, n) = Make();
        Assert.False(await svc.GrantForegroundAsync(0));
        Assert.False(await svc.GrantForegroundAsync(-5));
        Assert.Empty(n.Calls);
    }

    [Test]
    public async Task Grant_when_we_own_the_foreground_needs_no_trick()
    {
        var (svc, n) = Make(n => { n.Ours.Add(Other); n.AsfwWorks = true; });
        Assert.True(await svc.GrantForegroundAsync(4242));
        Assert.Equal("asfw 4242", string.Join("|", n.Calls));
    }

    [Test]
    public async Task Grant_with_an_elevated_foreground_skips_the_trick()
    {
        var (svc, n) = Make(n => n.Elevated.Add(Other));
        Assert.False(await svc.GrantForegroundAsync(4242));
        Assert.Equal(0, n.TrickCalls);
    }

    // ------------------------------------------------------------------ safe mode and the interface default

    [Test]
    public async Task Safe_mode_fake_logs_returns_SafeMode_and_changes_nothing()
    {
        var log = new RecordingLog();
        var svc = new SafeModeForegroundService(log, () => 0x55, () => 0x66);
        Assert.Equal(ForegroundResult.SafeMode, await svc.BringToFrontAsync(0x1234));
        var o = await svc.BringToFrontDetailedAsync(0x1234);
        Assert.Equal(ForegroundResult.SafeMode, o.Result);
        Assert.False(o.Succeeded);
        Assert.False(await svc.GrantForegroundAsync(4242));
        Assert.Equal(3, svc.RequestedWrites);
        Assert.Equal((nint)0x55, svc.GetForeground());
        Assert.Equal((nint)0x66, svc.LastExternalForeground);
        Assert.Contains("[safe mode] would bring window 0x1234 to the front", log.Text);
        Assert.Contains("[safe mode] would allow process 4242", log.Text);
    }

    [Test]
    public async Task Interface_default_detailed_method_wraps_any_implementation()
    {
        IForegroundService svc = new MinimalForeground();
        var o = await svc.BringToFrontDetailedAsync(0x10);
        Assert.Equal(ForegroundResult.Focused, o.Result);
        Assert.Equal(ForegroundRung.None, o.Rung);
    }

    [Test]
    public void Succeeded_extension()
    {
        Assert.True(ForegroundResult.Focused.Succeeded());
        Assert.True(ForegroundResult.AlreadyFocused.Succeeded());
        Assert.True(ForegroundResult.Restored.Succeeded());
        foreach (var r in new[] { ForegroundResult.Refused, ForegroundResult.NoWindow, ForegroundResult.Elevated, ForegroundResult.SafeMode })
            Assert.False(r.Succeeded(), r.ToString());
    }

    private sealed class MinimalForeground : IForegroundService
    {
        public Task<ForegroundResult> BringToFrontAsync(nint hwnd, CancellationToken ct = default) => Task.FromResult(ForegroundResult.Focused);
        public Task<bool> GrantForegroundAsync(int pid, CancellationToken ct = default) => Task.FromResult(true);
        public nint GetForeground() => 0;
        public nint LastExternalForeground => 0;
    }

    /// <summary>SwitchToThisWindow activates the owned dialog instead of the owner (what Windows does for modal dialogs).</summary>
    private sealed class DialogActivatingNative(FakeForegroundNative inner, nint dialog) : IForegroundNative
    {
        public bool IsWindow(nint h) => inner.IsWindow(h);
        public nint RootOf(nint h) => inner.RootOf(h);
        public nint RootOwnerOf(nint h) => inner.RootOwnerOf(h);
        public bool IsMinimized(nint h) => inner.IsMinimized(h);
        public nint GetForeground() => inner.GetForeground();
        public bool IsAboveUs(nint h) => inner.IsAboveUs(h);
        public bool IsOurs(nint h) => inner.IsOurs(h);
        public Task RestoreAsync(nint h) => inner.RestoreAsync(h);
        public Task<bool> SetForegroundAsync(nint h) => inner.SetForegroundAsync(h);
        public Task SwitchToAsync(nint h) { inner.Foreground = dialog; return Task.CompletedTask; }
        public Task<bool> AllowSetForegroundAsync(uint pid) => inner.AllowSetForegroundAsync(pid);
        public Task<HotkeyTrickResult> HotkeyTrickAsync(uint vk, Action a, TimeSpan t, CancellationToken ct) => inner.HotkeyTrickAsync(vk, a, t, ct);
        public bool SetForegroundNow(nint h) => inner.SetForegroundNow(h);
        public void RestoreNow(nint h) => inner.RestoreNow(h);
        public bool AllowSetForegroundNow(uint pid) => inner.AllowSetForegroundNow(pid);
        public Task DelayAsync(TimeSpan d, CancellationToken ct) => inner.DelayAsync(d, ct);
    }

    /// <summary>A native layer whose hotkey trick blocks until released, counting concurrent ladders.</summary>
    private sealed class GatedNative : IForegroundNative
    {
        public readonly TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _running;
        public int MaxConcurrent;
        public bool IsWindow(nint h) => true;
        public nint RootOf(nint h) => h;
        public nint RootOwnerOf(nint h) => h;
        public bool IsMinimized(nint h) => false;
        public nint GetForeground() => _fg;
        private nint _fg = Other;
        public bool IsAboveUs(nint h) => false;
        public bool IsOurs(nint h) => false;
        public Task RestoreAsync(nint h) => Task.CompletedTask;
        public Task<bool> SetForegroundAsync(nint h) => Task.FromResult(false);
        public Task SwitchToAsync(nint h) => Task.CompletedTask;
        public Task<bool> AllowSetForegroundAsync(uint pid) => Task.FromResult(false);
        public async Task<HotkeyTrickResult> HotkeyTrickAsync(uint vk, Action onRights, TimeSpan t, CancellationToken ct)
        {
            var now = Interlocked.Increment(ref _running);
            MaxConcurrent = Math.Max(MaxConcurrent, now);
            await Release.Task;
            onRights();
            Interlocked.Decrement(ref _running);
            return HotkeyTrickResult.Fired;
        }
        public bool SetForegroundNow(nint h) { _fg = h; return true; }
        public void RestoreNow(nint h) { }
        public bool AllowSetForegroundNow(uint pid) => true;
        public Task DelayAsync(TimeSpan d, CancellationToken ct) => Task.CompletedTask;
    }
}
