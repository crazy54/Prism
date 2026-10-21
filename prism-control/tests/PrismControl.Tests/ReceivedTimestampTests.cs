using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Protocol;
using PrismControl.Testing;

namespace PrismControl.Tests;

/// <summary>Action events carry the host-clock time their frame arrived (used to drop stale input, e.g. the secure keypad).</summary>
public class ReceivedTimestampTests
{
    private const string KeyDown = """{"action":"com.jeremyfhall.prismcontrol.x","event":"keyDown","context":"C1","device":"bb22","payload":{"settings":{},"coordinates":{"column":2,"row":3}}}""";

    [Test]
    public void The_parser_stamps_action_events_with_the_receive_time()
    {
        var e = (KeyDownEvent)InboundParser.Parse(KeyDown, 123_456_789)!;
        Assert.Equal(123_456_789L, e.ReceivedTimestamp);
        Assert.Equal(0L, ((KeyDownEvent)InboundParser.Parse(KeyDown)!).ReceivedTimestamp, "unknown without a stamp");
        Assert.Equal(0L, ((KeyDownEvent)InboundParser.Parse(KeyDown, 0)!).ReceivedTimestamp);
        var plugin = InboundParser.Parse("""{"event":"systemDidWakeUp"}""", 42);
        Assert.False(plugin is ActionEvent, "plugin messages are not action events and are passed through");
    }

    private sealed class ProbeAction : KeyAction
    {
        public long LastStamp;
        protected override Task OnKeyDownAsync(KeyDownEvent e) { LastStamp = e.ReceivedTimestamp; return Task.CompletedTask; }
    }

    [Test]
    public async Task The_harness_stamps_events_on_its_manual_clock_so_age_checks_are_deterministic()
    {
        await using var h = await ActionHarness<ProbeAction>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Keypad);
        await h.KeyDownAsync();
        Assert.Equal(h.Time.GetTimestamp(), h.Action.LastStamp);
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Near(2.0, h.Time.GetElapsedTime(h.Action.LastStamp).TotalSeconds, 0.001);

        var stale = new KeyDownEvent(h.Action.Context, "com.jeremyfhall.prismcontrol.x", TestDevices.Galleon.Id, new(0, 0), null, null, false)
        { ReceivedTimestamp = h.Time.GetTimestamp() - TimeSpan.FromSeconds(5).Ticks };
        await h.DeliverRawAsync(stale);
        Assert.Near(5.0, h.Time.GetElapsedTime(h.Action.LastStamp).TotalSeconds, 0.001);
    }
}
