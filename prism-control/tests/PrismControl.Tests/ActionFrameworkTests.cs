using System.Reflection;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Core.PropertyInspector;
using PrismControl.Core.Render;
using PrismControl.Hosting;
using PrismControl.Testing;

namespace PrismControl.Tests;

public sealed class ProbeSettings
{
    public string Label { get; set; } = "";
    public int Count { get; set; }
    public bool Flag { get; set; }
}

public sealed class PressProbe : KeyAction<ProbeSettings>
{
    public readonly List<string> Seen = [];
    public int Changed;
    protected override Task OnKeyDownAsync(KeyDownEvent e) { Seen.Add("down"); return Task.CompletedTask; }
    protected override Task OnKeyUpAsync(KeyUpEvent e) { Seen.Add("up"); return Task.CompletedTask; }
    protected override Task OnKeyPressAsync(KeyUpEvent e) { Seen.Add("press"); Settings.Count++; SaveSettings(); return Task.CompletedTask; }
    protected override Task OnKeyLongPressAsync(KeyDownEvent e) { Seen.Add("long"); return Task.CompletedTask; }
    protected override Task OnSettingsChangedAsync(ProbeSettings s) { Changed++; return Task.CompletedTask; }
    protected override PiForm? DescribeForm() => new PiForm().Text("label", "Label").Number("count", "Count", 0, 99);
    protected override Task<object?> OnPiMessageAsync(string type, JsonNode? data) =>
        type == "boom" ? throw new InvalidOperationException("nope") : Task.FromResult<object?>(new { echo = data?.ToString(), type });
}

public sealed class PlainPressProbe : KeyAction
{
    public int Presses;
    public bool ThrowOnce = true;
    protected override Task OnKeyPressAsync(KeyUpEvent e)
    {
        if (ThrowOnce) { ThrowOnce = false; throw new InvalidOperationException("first press fails"); }
        Presses++;
        return Task.CompletedTask;
    }
}

public sealed class DialProbe : DialAction<ProbeSettings>
{
    public readonly List<string> Seen = [];
    protected override Task OnDialRotateAsync(DialRotateEvent e) { Seen.Add("rotate" + e.Ticks); return Task.CompletedTask; }
    protected override Task OnDialPressAsync(DialUpEvent e) { Seen.Add("press"); return Task.CompletedTask; }
    protected override Task OnDialLongPressAsync(DialDownEvent e) { Seen.Add("long"); return Task.CompletedTask; }
    protected override Task OnTouchTapAsync(TouchTapEvent e) { Seen.Add($"tap{e.X},{e.Y}{(e.Hold ? "h" : "")}"); return Task.CompletedTask; }
}

public sealed class LoopProbe : KeyAction
{
    public int Renders;
    protected override Task OnWillAppearAsync(WillAppearEvent e)
    {
        StartRenderLoop(() => { Renders++; SetImage(SvgDocument.Key().Text(Renders.ToString(), 72, 80, 44, Color.White, TextAlign.Middle)); },
            idleInterval: TimeSpan.FromSeconds(1), activeInterval: TimeSpan.FromMilliseconds(100));
        return Task.CompletedTask;
    }
}

public sealed class PostProbe : KeyAction
{
    public int Counter;
    public int Concurrent;
    public int MaxConcurrent;
    protected override async Task OnKeyPressAsync(KeyUpEvent e) => await Bump();
    public async Task Bump()
    {
        var c = Interlocked.Increment(ref Concurrent);
        MaxConcurrent = Math.Max(MaxConcurrent, c);
        var v = Counter;
        await Task.Yield();
        Counter = v + 1;
        Interlocked.Decrement(ref Concurrent);
    }
}

public class ActionFrameworkTests
{
    [Test]
    public async Task Short_and_long_key_presses_are_distinguished()
    {
        await using var h = await ActionHarness<PressProbe>.AppearAsync(TestDevices.Galleon, new(1, 2));
        await h.PressAsync(TimeSpan.FromMilliseconds(80));
        Assert.Equal("down,up,press", string.Join(",", h.Action.Seen));
        h.Action.Seen.Clear();
        await h.PressAsync(TimeSpan.FromMilliseconds(900));
        Assert.Equal("down,long,up", string.Join(",", h.Action.Seen));
    }

    [Test]
    public async Task Without_a_long_press_handler_a_long_hold_is_a_press()
    {
        await using var h = await ActionHarness<PlainPressProbe>.AppearAsync();
        await h.PressAsync(); // first press throws: logged, mailbox survives
        await h.PressAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(1, h.Action.Presses);
    }

    [Test]
    public async Task Dial_long_press_exists_on_plus_but_never_on_galleon()
    {
        await using (var plus = await ActionHarness<DialProbe>.AppearAsync(TestDevices.Plus, new(2, 0), Controller.Encoder))
        {
            await plus.DialPressAsync(TimeSpan.FromSeconds(1));
            Assert.Equal("long", string.Join(",", plus.Action.Seen));
            Assert.Equal(2, plus.Action.Encoder!.StripSegment);
        }
        await using var galleon = await ActionHarness<DialProbe>.AppearAsync(TestDevices.Galleon, new(1, 1), Controller.Encoder);
        await galleon.DialPressAsync(TimeSpan.FromSeconds(1));
        Assert.Equal("press", string.Join(",", galleon.Action.Seen));
        Assert.Equal(ScreenQuadrant.BottomRight, galleon.Action.Encoder!.Quadrant);
        Assert.Equal(1, galleon.Action.Encoder!.Layer);
    }

    [Test]
    public async Task Galleon_aggregated_ticks_and_plus_touch_reach_the_action()
    {
        await using var g = await ActionHarness<DialProbe>.AppearAsync(TestDevices.Galleon, new(0, 0), Controller.Encoder);
        await g.RotateAsync(12);
        await g.RotateAsync(-7);
        Assert.Equal("rotate12,rotate-7", string.Join(",", g.Action.Seen));
        await Assert.ThrowsAsync<InvalidOperationException>(() => g.TapAsync(10, 10));

        await using var p = await ActionHarness<DialProbe>.AppearAsync(TestDevices.Plus, new(0, 0), Controller.Encoder);
        await p.TapAsync(80, 79);
        await p.TapAsync(10, 10, hold: true);
        Assert.Equal("tap80,79,tap10,10h", string.Join(",", p.Action.Seen));
        Assert.True(p.Channel.Interactive.Count(c => c == p.Context) >= 2, "input marks the context interactive for the scheduler");
    }

    [Test]
    public async Task Typed_settings_read_leniently_and_save_camel_case()
    {
        await using var h = await ActionHarness<PressProbe>.AppearAsync(settings: new JsonObject { ["label"] = "Hi", ["count"] = "5", ["flag"] = "on" });
        Assert.Equal("Hi", h.Action.Settings.Label);
        Assert.Equal(5, h.Action.Settings.Count);
        Assert.True(h.Action.Settings.Flag);
        await h.PressAsync();
        Assert.Equal(6, h.LastSettings!["count"]!.GetValue<int>());
        await h.SettingsFromPropertyInspectorAsync(new { label = "PI", count = 1 });
        Assert.Equal("PI", h.Action.Settings.Label);
        Assert.Equal(1, h.Action.Changed);
    }

    [Test]
    public async Task Corrupt_settings_fall_back_to_defaults()
    {
        await using var h = await ActionHarness<PressProbe>.AppearAsync(settings: new JsonObject { ["count"] = new JsonObject { ["nested"] = true } });
        Assert.Equal(0, h.Action.Settings.Count);
    }

    [Test]
    public async Task Render_loop_polls_slowly_when_idle_and_fast_while_interacting()
    {
        await using var h = await ActionHarness<LoopProbe>.AppearAsync();
        var start = h.Action.Renders;
        await h.AdvanceAsync(TimeSpan.FromSeconds(3));
        var idle = h.Action.Renders - start;
        Assert.InRange(idle, 2, 4, "idle renders in 3 s");
        await h.KeyDownAsync();
        var before = h.Action.Renders;
        for (var i = 0; i < 10; i++) await h.AdvanceAsync(TimeSpan.FromMilliseconds(100));
        Assert.InRange(h.Action.Renders - before, 9, 12, "active renders in 1 s");
        await h.AdvanceAsync(TimeSpan.FromSeconds(3)); // the active window (2 s) passes
        before = h.Action.Renders;
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.InRange(h.Action.Renders - before, 1, 3, "back to idle");
        await h.DisappearAsync();
        before = h.Action.Renders;
        await h.AdvanceAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(before, h.Action.Renders);
    }

    [Test]
    public async Task Post_from_other_threads_is_serialized_with_handlers()
    {
        await using var h = await ActionHarness<PostProbe>.AppearAsync();
        var posts = Enumerable.Range(0, 200).Select(_ => Task.Run(() => h.Action.Post(h.Action.Bump))).ToArray();
        await Task.WhenAll(posts);
        for (var i = 0; i < 20; i++) await h.PressAsync();
        await h.SettleAsync();
        Assert.Equal(220, h.Action.Counter);
        Assert.Equal(1, h.Action.MaxConcurrent);
    }

    [Test]
    public async Task Pi_hello_and_request_response()
    {
        await using var h = await ActionHarness<PressProbe>.AppearAsync(TestDevices.Galleon, settings: new { label = "X" });
        var hello = Assert.NotNull(await h.PiMessageAsync("pi.ready"));
        Assert.Equal("pi.hello", hello["type"]!.GetValue<string>());
        var data = hello["data"]!;
        Assert.Equal("X", data["settings"]!["label"]!.GetValue<string>());
        Assert.True(data["device"]!["isGalleon"]!.GetValue<bool>());
        Assert.False(data["device"]!["hasTouch"]!.GetValue<bool>());
        Assert.Equal(2, data["form"]!["fields"]!.AsArray().Count);

        var reply = Assert.NotNull(await h.PiMessageAsync("ping", "hello", requestId: 7));
        Assert.Equal("pi.response", reply["type"]!.GetValue<string>());
        Assert.Equal(7, reply["requestId"]!.GetValue<int>());
        Assert.True(reply["ok"]!.GetValue<bool>());
        Assert.Equal("ping", reply["data"]!["type"]!.GetValue<string>());

        var failed = Assert.NotNull(await h.PiMessageAsync("boom", null, requestId: 8));
        Assert.False(failed["ok"]!.GetValue<bool>());
        Assert.Equal("nope", failed["error"]!.GetValue<string>());
    }

    [Test]
    public async Task Multi_action_instances_never_render()
    {
        await using var h = await ActionHarness<LoopProbe>.AppearAsync(inMultiAction: true);
        await h.AdvanceAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(0, h.Count("setImage"));
    }

    [Test]
    public async Task Raw_svg_markup_is_converted_to_a_data_url()
    {
        await using var h = await ActionHarness<PlainPressProbe>.AppearAsync();
        h.Action.SetImage("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 144 144\"/>");
        Assert.True(h.LastImage!.StartsWith(DataUri.SvgPrefix, StringComparison.Ordinal));
    }

    /// <summary>Every shipped action, on every controller it declares, on Galleon / Stream Deck + / classic: only deck-safe frames.</summary>
    [Test(Category = "integration")]
    public async Task All_shipped_actions_render_deck_safe_frames()
    {
        var errors = new List<string>();
        var registry = ActionRegistry.Discover(ModuleLoader.Load(Core.Hosting.NullLog.Instance).Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly), errors, []);
        Assert.Empty(errors);
        Assert.True(registry.Actions.Count >= 6, "expected the sample actions");
        var placements = new List<(DeviceInfo Device, Coordinates Coords, Controller Controller)>
        {
            (TestDevices.Galleon, new(2, 3), Controller.Keypad),
            (TestDevices.Galleon, new(0, 1), Controller.Encoder),
            (TestDevices.Plus, new(3, 1), Controller.Keypad),
            (TestDevices.Plus, new(1, 0), Controller.Encoder),
            (TestDevices.StreamDeck, new(4, 2), Controller.Keypad),
        };
        foreach (var d in registry.Actions)
        {
            foreach (var p in placements)
            {
                if (p.Controller == Controller.Encoder && !d.Attribute.Controllers.HasFlag(Controllers.Encoder)) continue;
                if (p.Controller == Controller.Keypad && !d.Attribute.Controllers.HasFlag(Controllers.Keypad)) continue;
                var harnessType = typeof(ActionHarness<>).MakeGenericType(d.Type);
                var appear = harnessType.GetMethod("AppearAsync", BindingFlags.Public | BindingFlags.Static)!;
                object?[] args = [.. appear.GetParameters().Select(pi => pi.Position switch
                {
                    0 => p.Device,
                    1 => p.Coords,
                    2 => p.Controller,
                    _ => pi.HasDefaultValue ? pi.DefaultValue : null,
                })];
                var task = (Task)appear.Invoke(null, args)!;
                await task;
                var h = task.GetType().GetProperty("Result")!.GetValue(task)!;
                try
                {
                    var advance = harnessType.GetMethod("AdvanceAsync")!;
                    if (p.Controller == Controller.Encoder)
                    {
                        await (Task)harnessType.GetMethod("RotateAsync")!.Invoke(h, [p.Device.IsGalleon ? 12 : 1, false])!;
                        await (Task)harnessType.GetMethod("DialPressAsync")!.Invoke(h, [null])!;
                        if (p.Device.Capabilities.HasTouchStrip) await (Task)harnessType.GetMethod("TapAsync")!.Invoke(h, [150, 50, false])!;
                    }
                    else await (Task)harnessType.GetMethod("PressAsync")!.Invoke(h, [null])!;
                    await (Task)advance.Invoke(h, [TimeSpan.FromSeconds(2)])!;
                    var calls = (IReadOnlyList<ChannelCall>)harnessType.GetProperty("Calls")!.GetValue(h)!;
                    var frames = calls.Count(c => c.Kind is "setImage" or "setFeedback");
                    Assert.True(frames > 0, $"{d.Uuid} on {p.Device.Name} {p.Controller} rendered nothing");
                    try { harnessType.GetMethod("AssertFramesAreDeckSafe")!.Invoke(h, null); }
                    catch (TargetInvocationException tie) { errors.Add($"{d.Uuid} on {p.Device.Name} {p.Controller}: {tie.InnerException!.Message}"); }
                }
                finally { await ((IAsyncDisposable)h).DisposeAsync(); }
            }
        }
        Assert.Empty(errors);
    }
}
