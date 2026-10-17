using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.Scheduling;
using PrismControl.Testing;
using PrismControl.WinShell.Shared;

namespace PrismControl.WinShell.Tests;

/// <summary>
/// Every W1 action on every deck it can sit on: keys on the Galleon (3×4), Stream Deck +, MK.2, Mini and XL; encoders on
/// all four Galleon widgets (±12 ticks, no touch, no long-press) and all four Stream Deck + dials (±1, touch, long touch).
/// Each gets presses, turns and pushes against the fake PC, normal and safe mode, and every frame must be deck safe.
/// </summary>
public class MatrixTests
{
    private static IEnumerable<(Type Type, StreamDeckActionAttribute Attr)> W1Actions() =>
        typeof(WinShellModule).Assembly.GetTypes()
            .Select(t => (t, a: t.GetCustomAttribute<StreamDeckActionAttribute>()))
            .Where(x => x.a is not null && DiscoveryTests.W1Actions.Contains(x.a.Uuid["com.jeremyfhall.prismcontrol.windows.".Length..]))
            .Select(x => (x.t, x.a!));

    [Test(TimeoutMs = 120_000)]
    public async Task Every_action_on_every_deck_in_normal_and_safe_mode()
    {
        var method = typeof(MatrixTests).GetMethod(nameof(Drive), BindingFlags.NonPublic | BindingFlags.Static)!;
        var runs = 0;
        foreach (var safe in new[] { false, true })
            foreach (var (type, attr) in W1Actions())
            {
                var drive = method.MakeGenericMethod(type);
                if (attr.Controllers.HasFlag(Controllers.Keypad))
                    foreach (var (device, at) in Placements.Keys()) { await (Task)drive.Invoke(null, [device, at, Controller.Keypad, safe])!; runs++; }
                if (attr.Controllers.HasFlag(Controllers.Encoder))
                    foreach (var (device, at) in Placements.Dials()) { await (Task)drive.Invoke(null, [device, at, Controller.Encoder, safe])!; runs++; }
            }
        Console.WriteLine($"  {runs} action × placement × mode runs");
        Assert.True(runs > 150);
    }

    private static async Task Drive<T>(DeviceInfo device, Coordinates at, Controller controller, bool safe) where T : ActionBase, new()
    {
        var trips = TripwireException.Trips;
        await using var rig = new Rig(safeMode: safe, tripwires: safe).WithWindows();
        rig.Geometry.Add(0x1001, new PixelRect(100, 100, 1100, 900));
        await using var h = await rig.AppearAsync<T>(device, at, controller);
        var name = $"{typeof(T).Name} on {device.Name} {at} ({controller}{(safe ? ", safe" : "")})";
        if (controller == Controller.Keypad)
        {
            await h.PressAsync();
            await h.PressAsync(TimeSpan.FromSeconds(1.7)); // a full hold (hold-to-confirm actions fire, others see a long press)
        }
        else
        {
            var big = device.Capabilities.MaxTicksPerEvent;
            await h.RotateAsync(+big);
            await h.RotateAsync(-big);
            await h.DialPressAsync();
            await h.DialPressAsync(); // a second push (confirms arm-then-confirm actions)
            if (device.Capabilities.HasTouchStrip) { await h.TapAsync(100, 50); await h.TapAsync(20, 20, hold: true); }
            else await Assert.ThrowsAsync<InvalidOperationException>(() => h.TapAsync(1, 1));
            await h.DialPressAsync(TimeSpan.FromSeconds(5)); // Galleon: the 4 s hold never reaches us; a long push is a push
        }
        for (var i = 0; i < 40; i++) { await h.AdvanceAsync(TimeSpan.FromMilliseconds(250)); await Task.Yield(); }
        Assert.True(h.Count("setImage") + h.Count("setFeedback") > 0, $"{name}: drew something");
        if (controller == Controller.Encoder) Assert.Equal(Core.Layouts.Layouts.Canvas.Path, h.LastLayout, name);
        else Assert.Equal(0, h.Count("setFeedback"), name);
        h.AssertFramesAreDeckSafe();
        if (safe) Assert.Equal(trips, TripwireException.Trips, $"{name}: safe mode reached a real writer");
        // Keys that only show state never use more than the background tier.
        if (controller == Controller.Keypad && typeof(T).Name is not "DesktopsAction")
            Assert.True(h.CallsOf("setImage").All(c => c.Priority == UpdatePriority.Background), $"{name}: background priority");
    }
}
