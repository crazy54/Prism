using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Devices;

namespace PrismControl.Protocol;

// Plugin-level (non-action) events.
public abstract record PluginMessage(string Event);
public sealed record GlobalSettingsMessage(JsonObject Settings) : PluginMessage("didReceiveGlobalSettings");
public sealed record DeviceConnectedMessage(DeviceInfo Device) : PluginMessage("deviceDidConnect");
public sealed record DeviceChangedMessage(DeviceInfo Device) : PluginMessage("deviceDidChange");
public sealed record DeviceDisconnectedMessage(string DeviceId) : PluginMessage("deviceDidDisconnect");
public sealed record SystemWokeMessage() : PluginMessage("systemDidWakeUp");
public sealed record ApplicationMessage(string Application, bool Launched) : PluginMessage(Launched ? "applicationDidLaunch" : "applicationDidTerminate");
public sealed record DeepLinkMessage(string Url) : PluginMessage("didReceiveDeepLink");
public sealed record UnknownMessage(string Name, JsonObject Raw) : PluginMessage(Name);

/// <summary>Parses app → plugin WebSocket messages into typed events (action events are Core records).</summary>
public static class InboundParser
{
    /// <summary>Returns an <see cref="ActionEvent"/>, a <see cref="PluginMessage"/>, or null for unparseable input.</summary>
    public static object? Parse(string json)
    {
        JsonObject? m;
        try { m = JsonNode.Parse(json) as JsonObject; }
        catch (JsonException) { return null; }
        if (m is null) return null;
        var ev = Json.Str(m, "event");
        if (ev is null) return null;
        var context = Json.Str(m, "context") ?? "";
        var action = Json.Str(m, "action") ?? "";
        var device = Json.Str(m, "device") ?? "";
        var p = m["payload"] as JsonObject;
        var settings = p?["settings"] is JsonObject s ? (JsonObject)s.DeepClone() : null;
        var coords = Json.Coords(p);
        var controller = string.Equals(Json.Str(p, "controller"), "Encoder", StringComparison.OrdinalIgnoreCase) ? Controller.Encoder : Controller.Keypad;

        return ev switch
        {
            "willAppear" => new WillAppearEvent(context, action, device, controller, coords, Json.Int(p, "state"), Json.Bool(p, "isInMultiAction")) { RawSettings = settings },
            "willDisappear" => new WillDisappearEvent(context, action, device, controller, coords) { RawSettings = settings },
            "keyDown" => new KeyDownEvent(context, action, device, coords, Json.Int(p, "state"), Json.Int(p, "userDesiredState"), Json.Bool(p, "isInMultiAction")) { RawSettings = settings },
            "keyUp" => new KeyUpEvent(context, action, device, coords, Json.Int(p, "state"), Json.Int(p, "userDesiredState"), Json.Bool(p, "isInMultiAction")) { RawSettings = settings },
            "dialRotate" => new DialRotateEvent(context, action, device, coords ?? default, Json.Int(p, "ticks") ?? 0, Json.Bool(p, "pressed")) { RawSettings = settings },
            "dialDown" => new DialDownEvent(context, action, device, coords ?? default) { RawSettings = settings },
            "dialUp" => new DialUpEvent(context, action, device, coords ?? default) { RawSettings = settings },
            "touchTap" => TouchTap(context, action, device, coords, p, settings),
            "didReceiveSettings" => new DidReceiveSettingsEvent(context, action, device, coords, Json.Int(p, "state"), Json.Bool(p, "isInMultiAction")) { RawSettings = settings },
            "propertyInspectorDidAppear" => new PropertyInspectorDidAppearEvent(context, action, device),
            "propertyInspectorDidDisappear" => new PropertyInspectorDidDisappearEvent(context, action, device),
            "sendToPlugin" => new SendToPluginEvent(context, action, m["payload"]?.DeepClone()),
            "titleParametersDidChange" => new TitleParametersDidChangeEvent(context, action, device, Json.Str(p, "title"),
                p?["titleParameters"] is JsonObject tp ? (JsonObject)tp.DeepClone() : null, Json.Int(p, "state")) { RawSettings = settings },
            "didReceiveGlobalSettings" => new GlobalSettingsMessage(settings ?? new JsonObject()),
            "deviceDidConnect" => Json.Device(device, m["deviceInfo"] as JsonObject) is { } di ? new DeviceConnectedMessage(di) : new UnknownMessage(ev, m),
            "deviceDidChange" => Json.Device(device, m["deviceInfo"] as JsonObject) is { } dc ? new DeviceChangedMessage(dc) : new UnknownMessage(ev, m),
            "deviceDidDisconnect" => new DeviceDisconnectedMessage(device),
            "systemDidWakeUp" => new SystemWokeMessage(),
            "applicationDidLaunch" => new ApplicationMessage(Json.Str(p, "application") ?? "", true),
            "applicationDidTerminate" => new ApplicationMessage(Json.Str(p, "application") ?? "", false),
            "didReceiveDeepLink" => new DeepLinkMessage(Json.Str(p, "url") ?? ""),
            _ => new UnknownMessage(ev, m),
        };
    }

    private static TouchTapEvent TouchTap(string context, string action, string device, Coordinates? coords, JsonObject? p, JsonObject? settings)
    {
        int x = 0, y = 0;
        if (p?["tapPos"] is JsonArray pos && pos.Count >= 2)
        {
            x = (int)Math.Round(pos[0]?.GetValue<double>() ?? 0);
            y = (int)Math.Round(pos[1]?.GetValue<double>() ?? 0);
        }
        return new TouchTapEvent(context, action, device, coords ?? default, x, y, Json.Bool(p, "hold")) { RawSettings = settings };
    }
}

/// <summary>Builds plugin → app commands (the raw WebSocket protocol, SDK v2/v3 compatible).</summary>
public static class Outbound
{
    /// <summary>No HTML-safe escaping: this JSON only travels over the plugin WebSocket ("svg+xml" stays readable).</summary>
    private static readonly System.Text.Json.JsonSerializerOptions Wire = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static string Register(string registerEvent, string pluginUuid) =>
        new JsonObject { ["event"] = registerEvent, ["uuid"] = pluginUuid }.ToJsonString(Wire);

    /// <summary>{ event, context?, device?, action?, payload? }.</summary>
    public static string Command(string evt, string? context, JsonNode? payload = null, string? device = null, string? action = null)
    {
        var o = new JsonObject { ["event"] = evt };
        if (action is not null) o["action"] = action;
        if (context is not null) o["context"] = context;
        if (device is not null) o["device"] = device;
        if (payload is not null) o["payload"] = payload.Parent is null ? payload : payload.DeepClone();
        return o.ToJsonString(Wire);
    }

    public static string SetGlobalSettings(string pluginUuid, JsonObject settings) => Command("setGlobalSettings", pluginUuid, settings.DeepClone());
    public static string GetGlobalSettings(string pluginUuid) => Command("getGlobalSettings", pluginUuid);
    public static string OpenUrl(string url) => Command("openUrl", null, new JsonObject { ["url"] = url });
    public static string LogMessage(string message) => Command("logMessage", null, new JsonObject { ["message"] = message });

    public static string SwitchToProfile(string pluginUuid, string deviceId, string? profile, int? page)
    {
        var p = new JsonObject();
        if (profile is not null) p["profile"] = profile;
        if (page is not null) p["page"] = page;
        return Command("switchToProfile", pluginUuid, p, device: deviceId);
    }
}
