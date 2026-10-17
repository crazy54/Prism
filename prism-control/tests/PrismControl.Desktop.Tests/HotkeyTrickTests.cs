using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;
using PrismControl.Testing;

namespace PrismControl.Desktop.Tests;

/// <summary>
/// Review MED 6 (Desktop part): the focus trick's key is configurable (F13–F24, default F22) and the trick can be turned
/// off; a key another app registered is never sent and is reported as KeyInUse. All ladder tests use the scripted native
/// layer: nothing is focused and no key is pressed.
/// </summary>
public partial class HotkeyTrickTests
{
    private const nint Target = 0x100, Other = 0x200;

    private static (ForegroundService Svc, FakeForegroundNative N, RecordingLog Log) Make(Action<FakeForegroundNative>? setup = null)
    {
        var n = new FakeForegroundNative();
        n.Windows.UnionWith([Target, Other]);
        n.Foreground = Other;
        setup?.Invoke(n);
        var log = new RecordingLog();
        return (new ForegroundService(n, () => 0, log, new ManualTimeProvider()), n, log);
    }

    [Test]
    public async Task The_default_key_is_F22_and_a_configured_key_reaches_the_native_trick()
    {
        var (svc, n, _) = Make();
        Assert.Equal(VirtualKey.F22, svc.HotkeyTrickKey);
        Assert.True(svc.HotkeyTrickEnabled);
        Assert.Equal(HotkeyTrickStatus.NotTried, svc.LastTrick);
        await svc.BringToFrontAsync(Target);
        Assert.Equal(0x85u, n.TrickKeys[^1], "F22");
        Assert.Equal(HotkeyTrickStatus.Fired, svc.LastTrick);

        svc.HotkeyTrickKey = VirtualKey.F19;
        n.Foreground = Other;
        await svc.GrantForegroundAsync(4242);
        Assert.Equal(0x82u, n.TrickKeys[^1], "F19 for the grant too");
    }

    [Test]
    public async Task Trick_off_never_presses_a_key_bring_falls_back_and_grant_only_allows()
    {
        var (svc, n, log) = Make(n => { n.SfwWorks = true; n.AsfwWorks = true; });
        svc.HotkeyTrickEnabled = false;
        Assert.Contains("Focus trick off", log.Text);

        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundResult.Focused, o.Result);
        Assert.Equal(ForegroundRung.SetForegroundWindow, o.Rung, "the other rungs still run");
        Assert.Equal(HotkeyTrickStatus.Disabled, svc.LastTrick);

        n.Foreground = Other;
        n.Calls.Clear();
        Assert.True(await svc.GrantForegroundAsync(4242));
        Assert.Equal("asfw 4242", string.Join("|", n.Calls), "a plain AllowSetForegroundWindow, no key");
        Assert.Equal(0, n.TrickCalls, "no trick call at all");

        // Refused without the trick: false (the browser's own focus then flashes its taskbar button).
        n.AsfwWorks = false;
        Assert.False(await svc.GrantForegroundAsync(4242));
        Assert.Equal(0, n.TrickCalls);
    }

    [Test]
    public async Task A_key_another_app_registered_falls_back_and_is_logged_once()
    {
        var (svc, n, log) = Make(n => { n.Trick = HotkeyTrickResult.KeyInUse; n.SfwWorks = true; });
        var o = await svc.BringToFrontDetailedAsync(Target);
        Assert.Equal(ForegroundRung.SetForegroundWindow, o.Rung);
        Assert.Equal(HotkeyTrickStatus.KeyInUse, svc.LastTrick);
        n.Foreground = Other;
        await svc.BringToFrontAsync(Target);
        var info = log.Lines.Where(l => l.StartsWith("Info:", StringComparison.Ordinal) && l.Contains("F22 is registered by another app")).ToList();
        Assert.Single(info, "once per key at Info, then Debug");
        Assert.Contains("never sent", info[0]);

        svc.HotkeyTrickKey = VirtualKey.F13;
        n.Foreground = Other;
        await svc.BringToFrontAsync(Target);
        Assert.Single(log.Lines.Where(l => l.StartsWith("Info:", StringComparison.Ordinal) && l.Contains("F13 is registered by another app")));
    }

    [Test]
    public async Task Other_outcomes_are_recorded()
    {
        var (svc, n, _) = Make(n => { n.Trick = HotkeyTrickResult.TimedOut; n.SfwWorks = true; });
        await svc.BringToFrontAsync(Target);
        Assert.Equal(HotkeyTrickStatus.TimedOut, svc.LastTrick);
        n.Trick = HotkeyTrickResult.Unavailable;
        n.Foreground = Other;
        await svc.BringToFrontAsync(Target);
        Assert.Equal(HotkeyTrickStatus.Failed, svc.LastTrick);
        n.Elevated.Add(Other);
        n.Foreground = Other;
        await svc.BringToFrontAsync(Target);
        Assert.Equal(HotkeyTrickStatus.Skipped, svc.LastTrick, "an elevated app in front: not tried");
    }

    [Test]
    public void Only_F13_to_F24_are_accepted()
    {
        var (svc, _, _) = Make();
        Assert.Throws<ArgumentOutOfRangeException>(() => svc.HotkeyTrickKey = VirtualKey.F12);
        Assert.Throws<ArgumentOutOfRangeException>(() => svc.HotkeyTrickKey = VirtualKey.A);
        Assert.Equal(VirtualKey.F22, svc.HotkeyTrickKey, "unchanged");
        var safe = new SafeModeForegroundService(NullLog.Instance, () => 0, () => 0);
        IHotkeyTrickSettings s = safe;
        Assert.Throws<ArgumentOutOfRangeException>(() => s.HotkeyTrickKey = VirtualKey.Enter);
        s.HotkeyTrickKey = VirtualKey.F24;
        s.HotkeyTrickEnabled = false;
        Assert.Equal(VirtualKey.F24, s.HotkeyTrickKey);
        Assert.False(s.HotkeyTrickEnabled);
        Assert.Equal(HotkeyTrickStatus.NotTried, s.LastTrick, "safe mode never presses anything");
    }

    [Test]
    public void FunctionKeys_parse_and_name()
    {
        Assert.Equal(VirtualKey.F13, FunctionKeys.Parse("F13"));
        Assert.Equal(VirtualKey.F24, FunctionKeys.Parse(" f24 "));
        Assert.Equal(VirtualKey.F22, FunctionKeys.Parse("F22"));
        foreach (var bad in new[] { null, "", "F12", "F25", "F1", "G13", "F13x", "13", "F-13", "F013" })
            Assert.Null(FunctionKeys.Parse(bad), bad ?? "null");
        Assert.Equal("F22", FunctionKeys.Name(VirtualKey.F22));
        Assert.Equal("F13", FunctionKeys.Name(VirtualKey.F13));
        Assert.True(FunctionKeys.IsF13ToF24(VirtualKey.F24));
        Assert.False(FunctionKeys.IsF13ToF24(VirtualKey.F12));
        for (var i = 13; i <= 24; i++) Assert.Equal("F" + i, FunctionKeys.Name(FunctionKeys.Parse("F" + i)!.Value));
    }

    // ------------------------------------------------------------------ the "desktop" global section

    [Test(Category = "integration")]
    public async Task Desktop_settings_apply_through_GetOrCreate_and_follow_changes()
    {
        using var dir = new TempDir();
        using var ctx = new FakeModuleContext(dir.Path, dir.Path, safeMode: true);
        var globals = new TestGlobalSettings(new JsonObject { ["desktop"] = new JsonObject { ["focusTrick"] = false, ["focusTrickKey"] = "F19" } });
        ctx.Globals = globals;
        var d = DesktopServices.GetOrCreate(ctx);
        var trick = (IHotkeyTrickSettings)d.Foreground;
        await WaitAsync(() => !trick.HotkeyTrickEnabled && trick.HotkeyTrickKey == VirtualKey.F19);
        Assert.True(ReferenceEquals(ctx.Services.Get<IHotkeyProbe>(), d.Hotkeys), "the probe is a shared service");

        globals.SetSection(DesktopGlobalSettings.Section, new DesktopGlobalSettings { FocusTrick = true, FocusTrickKey = "F23" });
        Assert.True(trick.HotkeyTrickEnabled);
        Assert.Equal(VirtualKey.F23, trick.HotkeyTrickKey);

        globals.SetSection(DesktopGlobalSettings.Section, new DesktopGlobalSettings { FocusTrick = true, FocusTrickKey = "F12" });
        globals.SetSection(DesktopGlobalSettings.Section, new DesktopGlobalSettings { FocusTrick = true, FocusTrickKey = "F12" });
        Assert.Equal(VirtualKey.F23, trick.HotkeyTrickKey, "an invalid key keeps the current one");
        Assert.Equal(1, ctx.RecordingLog.Lines.Count(l => l.Contains("focusTrickKey must be F13–F24")), "logged once");
        ctx.Shutdown();
    }

    [Test(Category = "integration")]
    public void A_host_without_global_settings_keeps_the_defaults()
    {
        using var dir = new TempDir();
        using var ctx = new FakeModuleContext(dir.Path, dir.Path, safeMode: true);   // GlobalSettings throws
        var d = DesktopServices.GetOrCreate(ctx);
        var trick = (IHotkeyTrickSettings)d.Foreground;
        Assert.True(trick.HotkeyTrickEnabled);
        Assert.Equal(VirtualKey.F22, trick.HotkeyTrickKey);
        d.ApplySettings(new DesktopGlobalSettings { FocusTrick = false, FocusTrickKey = "f14" });
        Assert.False(trick.HotkeyTrickEnabled);
        Assert.Equal(VirtualKey.F14, trick.HotkeyTrickKey);
        ctx.Shutdown();
    }

    [Test(Category = "integration")]
    public void The_real_foreground_service_takes_the_settings_too()
    {
        // No foreground request is made here: only the switches are set.
        using var d = DesktopServices.Create(safeMode: false);
        d.ApplySettings(new DesktopGlobalSettings { FocusTrick = false, FocusTrickKey = "F21" });
        var fg = (ForegroundService)d.Foreground;
        Assert.False(fg.HotkeyTrickEnabled);
        Assert.Equal(VirtualKey.F21, fg.HotkeyTrickKey);
    }

    // ------------------------------------------------------------------ IHotkeyProbe on a real shell thread

    [Test(Category = "integration", TimeoutMs = 20_000)]
    public async Task The_probe_sees_a_registration_and_leaves_nothing_registered()
    {
        // Only RegisterHotKey/UnregisterHotKey on windows/threads of this process: no key is ever pressed.
        using var shell = new ShellThread();
        IHotkeyProbe probe = new ShellHotkeyProbe(shell, NullLog.Instance);
        VirtualKey? key = null;
        foreach (var k in new[] { VirtualKey.F19, VirtualKey.F17, VirtualKey.F15, VirtualKey.F21, VirtualKey.F14 })
            if (await probe.IsFreeAsync(k) == true) { key = k; break; }
        if (key is not { } free) { Console.WriteLine("     every candidate key is registered by another app on this PC; nothing to prove"); return; }

        using var holder = new ThreadHotkey(free);   // a thread hotkey of our own, on another thread
        Assert.True(holder.Registered, "our own registration succeeded (so the probe released the key)");
        Assert.Equal(false, await probe.IsFreeAsync(free), "taken");
        holder.Release();
        Assert.Equal(true, await probe.IsFreeAsync(free), "free again");
        using var again = new ThreadHotkey(free);
        Assert.True(again.Registered, "the probe left nothing registered");
        Console.WriteLine($"     probed {FunctionKeys.Name(free)}");
    }

    private static async Task WaitAsync(Func<bool> cond, int ms = 3000)
    {
        var until = Environment.TickCount64 + ms;
        while (!cond())
        {
            if (Environment.TickCount64 > until) throw new AssertException("timed out waiting for the settings to apply");
            await Task.Delay(10);
        }
    }

    /// <summary>RegisterHotKey(NULL, …) on a dedicated thread (a thread hotkey must be unregistered by the same thread).</summary>
    private sealed partial class ThreadHotkey : IDisposable
    {
        [LibraryImport("user32.dll", SetLastError = true)] private static partial int RegisterHotKey(nint h, int id, uint mods, uint vk);
        [LibraryImport("user32.dll")] private static partial int UnregisterHotKey(nint h, int id);

        private const int Id = 0x7E57;
        private readonly Thread _thread;
        private readonly ManualResetEventSlim _ready = new(), _release = new(), _done = new();

        public ThreadHotkey(VirtualKey key)
        {
            _thread = new Thread(() =>
            {
                Registered = RegisterHotKey(0, Id, 0, (uint)key) != 0;
                _ready.Set();
                _release.Wait(TimeSpan.FromSeconds(10));
                if (Registered) UnregisterHotKey(0, Id);
                _done.Set();
            }) { IsBackground = true };
            _thread.Start();
            _ready.Wait(TimeSpan.FromSeconds(5));
        }

        public bool Registered { get; private set; }

        public void Release() { _release.Set(); _done.Wait(TimeSpan.FromSeconds(5)); }

        public void Dispose() { Release(); _ready.Dispose(); }
    }
}
