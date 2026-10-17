using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;
using PrismControl.Protocol;
using PrismControl.Testing;

namespace PrismControl.Tests;

public class ProtocolTests
{
    private const string Info = """
        {"application":{"font":"Segoe UI","language":"en","platform":"windows","platformVersion":"10.0.26300","version":"7.6.0.23012"},
         "colors":{},"devicePixelRatio":2,
         "devices":[{"id":"aa11","name":"Stream Deck +","size":{"columns":4,"rows":2},"type":7},
                    {"id":"bb22","name":"Galleon 100 SD","size":{"columns":3,"rows":4},"type":12},
                    {"id":"cc33","name":"MCP Deck 2","size":{"columns":8,"rows":4},"type":14}],
         "plugin":{"uuid":"com.jeremyfhall.prismcontrol","version":"0.1.0.0"}}
        """;

    [Test]
    public void Launch_args_parse_in_any_order()
    {
        Assert.True(LaunchArgs.TryParse(["-info", Info, "-registerEvent", "registerPlugin", "-port", "28196", "-pluginUUID", "ABC123"], out var a, out var err), err);
        Assert.Equal(28196, a!.Port);
        Assert.Equal("ABC123", a.PluginUuid);
        Assert.Equal("registerPlugin", a.RegisterEvent);
        Assert.Equal(3, a.Info.Devices.Count);
        var galleon = a.Info.Devices[1];
        Assert.Equal(DeviceType.Galleon100SD, galleon.Type);
        Assert.Equal((3, 4), (galleon.Columns, galleon.Rows));
        Assert.Equal(DeviceType.McpDeck, a.Info.Devices[2].Type);
        Assert.Equal("7.6.0.23012", a.Info.Application.Version);
    }

    [Test]
    public void Launch_args_reject_missing_or_bad_values()
    {
        Assert.False(LaunchArgs.TryParse(["-port", "1"], out _, out var e1));
        Assert.Contains("-pluginUUID", e1);
        Assert.False(LaunchArgs.TryParse(["-port", "x", "-pluginUUID", "u", "-registerEvent", "r", "-info", "{}"], out _, out var e2));
        Assert.Contains("port", e2);
        Assert.False(LaunchArgs.TryParse(["-port", "1", "-pluginUUID", "u", "-registerEvent", "r", "-info", "{nope"], out _, out var e3));
        Assert.Contains("-info", e3);
    }

    [Test]
    public void Parses_every_action_event()
    {
        string Msg(string ev, string payload) => $$"""{"action":"com.jeremyfhall.prismcontrol.x","event":"{{ev}}","context":"C1","device":"bb22","payload":{{payload}}}""";
        var appear = (WillAppearEvent)InboundParser.Parse(Msg("willAppear", """{"settings":{"a":1},"coordinates":{"column":1,"row":1},"controller":"Encoder","isInMultiAction":false}"""))!;
        Assert.Equal(Controller.Encoder, appear.Controller);
        Assert.Equal(new Coordinates(1, 1), appear.Coordinates);
        Assert.Equal(1, appear.RawSettings!["a"]!.GetValue<int>());

        var key = (KeyDownEvent)InboundParser.Parse(Msg("keyDown", """{"settings":{},"coordinates":{"column":2,"row":3},"state":1,"userDesiredState":0,"isInMultiAction":false}"""))!;
        Assert.Equal(1, key.State);
        Assert.Equal(0, key.UserDesiredState);
        Assert.True(InboundParser.Parse(Msg("keyUp", """{"settings":{},"coordinates":{"column":2,"row":3}}""")) is KeyUpEvent);

        var rot = (DialRotateEvent)InboundParser.Parse(Msg("dialRotate", """{"settings":{},"coordinates":{"column":0,"row":1},"ticks":-12,"pressed":false,"controller":"Encoder"}"""))!;
        Assert.Equal(-12, rot.Ticks);
        Assert.True(InboundParser.Parse(Msg("dialDown", """{"settings":{},"coordinates":{"column":0,"row":0},"controller":"Encoder"}""")) is DialDownEvent);
        Assert.True(InboundParser.Parse(Msg("dialUp", """{"settings":{},"coordinates":{"column":0,"row":0},"controller":"Encoder"}""")) is DialUpEvent);

        var tap = (TouchTapEvent)InboundParser.Parse(Msg("touchTap", """{"settings":{},"coordinates":{"column":3,"row":0},"tapPos":[80,79],"hold":true,"controller":"Encoder"}"""))!;
        Assert.Equal((80, 79, true), (tap.X, tap.Y, tap.Hold));

        Assert.True(InboundParser.Parse(Msg("didReceiveSettings", """{"settings":{"b":2},"coordinates":{"column":0,"row":0},"isInMultiAction":false}""")) is DidReceiveSettingsEvent { RawSettings: not null });
        Assert.True(InboundParser.Parse(Msg("willDisappear", """{"settings":{},"coordinates":{"column":0,"row":0},"controller":"Keypad"}""")) is WillDisappearEvent);
        Assert.True(InboundParser.Parse("""{"action":"a","event":"propertyInspectorDidAppear","context":"C1","device":"d"}""") is PropertyInspectorDidAppearEvent);
        Assert.True(InboundParser.Parse("""{"action":"a","event":"propertyInspectorDidDisappear","context":"C1","device":"d"}""") is PropertyInspectorDidDisappearEvent);
        var stp = (SendToPluginEvent)InboundParser.Parse("""{"action":"a","event":"sendToPlugin","context":"C1","payload":{"type":"pi.ready"}}""")!;
        Assert.Equal("pi.ready", stp.Payload!["type"]!.GetValue<string>());
        Assert.True(InboundParser.Parse(Msg("titleParametersDidChange", """{"settings":{},"coordinates":{"column":0,"row":0},"title":"Hi","titleParameters":{"fontSize":12},"state":0}""")) is TitleParametersDidChangeEvent { Title: "Hi" });
    }

    [Test]
    public void Parses_plugin_level_events()
    {
        Assert.True(InboundParser.Parse("""{"event":"didReceiveGlobalSettings","payload":{"settings":{"core":{"updateBudget":30}}}}""") is GlobalSettingsMessage g && g.Settings["core"]!["updateBudget"]!.GetValue<int>() == 30);
        var dc = (DeviceConnectedMessage)InboundParser.Parse("""{"event":"deviceDidConnect","device":"bb22","deviceInfo":{"name":"Galleon 100 SD","type":12,"size":{"columns":3,"rows":4}}}""")!;
        Assert.True(dc.Device.IsGalleon);
        Assert.True(InboundParser.Parse("""{"event":"deviceDidDisconnect","device":"bb22"}""") is DeviceDisconnectedMessage { DeviceId: "bb22" });
        Assert.True(InboundParser.Parse("""{"event":"systemDidWakeUp"}""") is SystemWokeMessage);
        Assert.True(InboundParser.Parse("""{"event":"applicationDidLaunch","payload":{"application":"Spotify.exe"}}""") is ApplicationMessage { Launched: true, Application: "Spotify.exe" });
        Assert.True(InboundParser.Parse("""{"event":"didReceiveDeepLink","payload":{"url":"streamdeck://plugins/message/com.jeremyfhall.prismcontrol/x"}}""") is DeepLinkMessage);
        Assert.True(InboundParser.Parse("""{"event":"somethingNew"}""") is UnknownMessage);
        Assert.Null(InboundParser.Parse("not json"));
    }

    [Test]
    public void Outbound_commands_have_the_documented_shapes()
    {
        Assert.Equal("""{"event":"registerPlugin","uuid":"ABC"}""", Outbound.Register("registerPlugin", "ABC"));
        Assert.Equal("""{"event":"setImage","context":"C1","payload":{"image":"data:image/svg+xml,x","state":1}}""",
            Outbound.Command("setImage", "C1", new JsonObject { ["image"] = "data:image/svg+xml,x", ["state"] = 1 }));
        Assert.Equal("""{"event":"showOk","context":"C1"}""", Outbound.Command("showOk", "C1"));
        Assert.Equal("""{"event":"switchToProfile","context":"ABC","device":"bb22","payload":{"profile":"profiles/x","page":0}}""",
            Outbound.SwitchToProfile("ABC", "bb22", "profiles/x", 0));
        Assert.Equal("""{"event":"getGlobalSettings","context":"ABC"}""", Outbound.GetGlobalSettings("ABC"));
        Assert.Equal("""{"event":"openUrl","payload":{"url":"https://example.com/"}}""", Outbound.OpenUrl("https://example.com/"));
        Assert.Equal("""{"event":"sendToPropertyInspector","action":"a.b","context":"C1","payload":{"type":"t"}}""",
            Outbound.Command("sendToPropertyInspector", "C1", new JsonObject { ["type"] = "t" }, action: "a.b"));
        Assert.Equal("""{"event":"logMessage","payload":{"message":"hi"}}""", Outbound.LogMessage("hi"));
    }

    [Test]
    public void Device_capabilities_encode_the_hardware_truths()
    {
        var g = DeviceCapabilities.For(DeviceType.Galleon100SD);
        Assert.Equal((4, 2, 2), (g.EncoderSlots, g.PhysicalDials, g.DialLayers));
        Assert.False(g.HasTouchStrip);
        Assert.False(g.SupportsDialLongPress);
        Assert.Equal(12, g.MaxTicksPerEvent);
        var p = DeviceCapabilities.For(DeviceType.Plus);
        Assert.True(p.HasTouchStrip && p.SupportsDialLongPress);
        Assert.Equal(120, p.KeyPixels);
        var device = new DeviceInfo("x", "Galleon 100 SD", DeviceType.Galleon100SD, 3, 4);
        Assert.Equal(ScreenQuadrant.TopLeft, EncoderPlacement.For(device, new(0, 0)).Quadrant);
        Assert.Equal(ScreenQuadrant.BottomLeft, EncoderPlacement.For(device, new(0, 1)).Quadrant);
        Assert.Equal(ScreenQuadrant.TopRight, EncoderPlacement.For(device, new(1, 0)).Quadrant);
        Assert.Equal(ScreenQuadrant.BottomRight, EncoderPlacement.For(device, new(1, 1)).Quadrant);
        Assert.Equal(DeviceType.Unknown, DeviceInfo.ParseType(99));
    }
}
