using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Hosting;
using PrismControl.Desktop;
using PrismControl.Testing;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// The module's REAL service graph (WinShellServices.Build) wired to fakes and one manual clock. With safeMode the graph
/// gets the safe-mode writers exactly as the module does; the rig's recording writers then must stay untouched.
/// </summary>
public sealed class Rig : IAsyncDisposable
{
    public readonly ManualTimeProvider Time = new();
    public readonly FakeCatalog Catalog = new();
    public readonly FakeForeground Foreground = new();
    public readonly FakeInput Input = new();
    public readonly FakeIcons Icons = new();
    public readonly FakeThumbs Thumbs = new();
    public readonly FakeDisplayReader DisplayReader = new();
    public readonly RecordingDisplayWriter DisplayWriter;
    public readonly FakeDdcBus Ddc;
    public readonly RecordingDdcWriter DdcWriter;
    public readonly FakeGeometry Geometry = new();
    public readonly RecordingWindowWriter WindowWriter;
    public readonly FakeDesktops Desktops = new();
    public readonly FakeGame Game = new();
    public readonly WinShellOptions Options = new();
    public readonly WinShellServices Services;
    public readonly bool SafeMode;

    public Rig(bool safeMode = false, bool tripwires = false)
    {
        SafeMode = safeMode;
        DisplayWriter = new RecordingDisplayWriter(DisplayReader);
        Ddc = new FakeDdcBus();
        DdcWriter = new RecordingDdcWriter(Ddc, Time);
        WindowWriter = new RecordingWindowWriter(Geometry);
        Input.Desktops = Desktops;
        IForegroundService fg = tripwires ? new TripwireForeground(Foreground) : Foreground;
        IInputSender input = tripwires ? new TripwireInput() : Input;
        var platform = new PlatformServices(Catalog, fg, input, Icons, writersAreSafe: false);
        var readers = new WinShellReaders(DisplayReader, Ddc, Geometry, Desktops, Game, Thumbs);
        Services = WinShellServices.Build(platform, Options, safeMode, Time, NullLog.Instance, readers,
            () => tripwires
                ? new WinShellWriters(new TripwireDisplayWriter(), new TripwireDdcWriter(), new TripwireWindowWriter())
                : new WinShellWriters(DisplayWriter, DdcWriter, WindowWriter));
        // Typical PC: three monitors with DDC/CI (the third has no input or volume codes), three windows.
        foreach (var m in Samples.Monitors())
        {
            Ddc.Seed(m.Id, Display.Vcp.Brightness, m.Id == Samples.Qh27Id ? 65u : 90u);
            Ddc.Seed(m.Id, Display.Vcp.Contrast, 80, m.Id == Samples.Qh27Id ? 150u : 100u);
            if (m.Id != Samples.Qh27Id) { Ddc.Seed(m.Id, Display.Vcp.InputSource, 0x0F); Ddc.Seed(m.Id, Display.Vcp.Volume, 75); }
        }
    }

    /// <summary>Three windows: an editor (front), a browser, a minimized chat app.</summary>
    public Rig WithWindows()
    {
        Catalog.Set(
            Samples.Window(0x1001, "editor.exe", "notes.example — Example Editor"),
            Samples.Window(0x1002, "browser.exe", "The Example Ensemble — tour dates"),
            Samples.Window(0x1003, "chat.exe", "General · Example Chat", minimized: true));
        Foreground.Foreground = Foreground.LastExternal = 0x1001;
        return this;
    }

    public Task<ActionHarness<T>> AppearAsync<T>(DeviceInfo device, Coordinates at, Controller controller = Controller.Keypad, object? settings = null, string context = "ctx-test")
        where T : ActionBase, new() =>
        ActionHarness<T>.AppearAsync(device, at, controller, settings, s => Services.Register(s), time: Time, safeMode: SafeMode, context: context);

    /// <summary>
    /// Service-level tests (no action, so no render loop on the clock): runs <paramref name="work"/> to the end, moving the clock
    /// ONLY to timers it has armed. While the work is on the thread pool the clock stands still, however slow the pool is.
    /// (A fixed number of clock steps could be used up before a busy pool had even armed the delay; the test then hung.)
    /// </summary>
    public async Task<T> Drive<T>(Task<T> work, TimeSpan? max = null)
    {
        var limit = max ?? TimeSpan.FromSeconds(30);
        var start = Time.Elapsed;
        while (!work.IsCompleted)
        {
            if (Time.UntilNextTimer is { } next)
            {
                if (Time.Elapsed - start + next > limit) throw new AssertException($"not done within {limit.TotalSeconds:0.#} s of clock time");
                Time.Advance(next);
            }
            await Task.WhenAny(work, Task.Delay(1));
        }
        return await work;
    }

    /// <summary>Advances the clock in small steps (letting thread-pool continuations run) until <paramref name="done"/> holds.</summary>
    public async Task Until<T>(ActionHarness<T> h, Func<bool> done, TimeSpan? max = null, TimeSpan? step = null) where T : ActionBase, new()
    {
        var limit = max ?? TimeSpan.FromSeconds(30);
        var by = step ?? TimeSpan.FromMilliseconds(50);
        for (var t = TimeSpan.Zero; t <= limit; t += by)
        {
            if (await Settled(h, done, slow: false)) return;
            await h.AdvanceAsync(by);
        }
        if (!await Settled(h, done, slow: true)) throw new AssertException($"condition not reached within {limit.TotalSeconds:0.#} s of clock time");
    }

    /// <summary>Gives queued thread-pool work a chance (without moving the clock) and reports whether <paramref name="done"/> holds.</summary>
    private static async Task<bool> Settled<T>(ActionHarness<T> h, Func<bool> done, bool slow) where T : ActionBase, new()
    {
        var spins = slow ? 200 : 6;
        for (var i = 0; i < spins; i++)
        {
            if (done()) return true;
            if (slow) Thread.Sleep(2);
            else Thread.SpinWait(2000);
            await Task.Yield();
            await h.SettleAsync();
        }
        return done();
    }

    /// <summary>Lets queued thread-pool work (Task.Run in actions) finish without moving the clock.</summary>
    public static async Task Drain<T>(ActionHarness<T> h) where T : ActionBase, new()
    {
        for (var i = 0; i < 40; i++)
        {
            if (i % 8 == 7) Thread.Sleep(1);
            await Task.Yield();
            await h.SettleAsync();
        }
    }

    public async ValueTask DisposeAsync() => await Services.DisposeAsync();
}

/// <summary>Every device a key or widget can sit on, with a valid placement.</summary>
public static class Placements
{
    public static IEnumerable<(DeviceInfo Device, Coordinates At)> Keys() =>
    [
        (TestDevices.Galleon, new(0, 0)), (TestDevices.Galleon, new(2, 3)),
        (TestDevices.Plus, new(0, 0)), (TestDevices.Plus, new(3, 1)),
        (TestDevices.StreamDeck, new(4, 2)), (TestDevices.Mini, new(2, 1)), (TestDevices.XL, new(7, 3)),
    ];

    /// <summary>All four Galleon widgets (dial × layer) and all four Stream Deck + dials.</summary>
    public static IEnumerable<(DeviceInfo Device, Coordinates At)> Dials() =>
    [
        (TestDevices.Galleon, new(0, 0)), (TestDevices.Galleon, new(0, 1)), (TestDevices.Galleon, new(1, 0)), (TestDevices.Galleon, new(1, 1)),
        (TestDevices.Plus, new(0, 0)), (TestDevices.Plus, new(1, 0)), (TestDevices.Plus, new(2, 0)), (TestDevices.Plus, new(3, 0)),
    ];
}
