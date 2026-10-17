using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Devices;

namespace PrismControl.Protocol;

public sealed record ApplicationInfo(string? Font, string? Language, string? Platform, string? PlatformVersion, string? Version);

/// <summary>The -info registration payload.</summary>
public sealed record RegistrationInfo(ApplicationInfo Application, double DevicePixelRatio, IReadOnlyList<DeviceInfo> Devices, string? PluginUuid, string? PluginVersion)
{
    public static RegistrationInfo Parse(string json)
    {
        var root = JsonNode.Parse(json) as JsonObject ?? throw new FormatException("-info is not a JSON object.");
        var app = root["application"] as JsonObject;
        var devices = new List<DeviceInfo>();
        if (root["devices"] is JsonArray arr)
        {
            foreach (var d in arr.OfType<JsonObject>())
                if (Json.Device(d["id"]?.GetValue<string>(), d) is { } info) devices.Add(info);
        }
        return new RegistrationInfo(
            new ApplicationInfo(Json.Str(app, "font"), Json.Str(app, "language"), Json.Str(app, "platform"), Json.Str(app, "platformVersion"), Json.Str(app, "version")),
            Json.Num(root, "devicePixelRatio") ?? 1,
            devices,
            Json.Str(root["plugin"] as JsonObject, "uuid"),
            Json.Str(root["plugin"] as JsonObject, "version"));
    }
}

/// <summary>
/// The command line the Stream Deck app starts the plugin with:
/// <c>-port &lt;n&gt; -pluginUUID &lt;registration id&gt; -registerEvent &lt;event&gt; -info &lt;json&gt;</c>.
/// </summary>
public sealed record LaunchArgs(int Port, string PluginUuid, string RegisterEvent, string InfoJson, RegistrationInfo Info)
{
    public static bool TryParse(IReadOnlyList<string> args, out LaunchArgs? result, out string error)
    {
        result = null;
        error = "";
        string? port = null, uuid = null, reg = null, info = null;
        for (var i = 0; i < args.Count; i++)
        {
            var a = args[i];
            if (!a.StartsWith('-')) continue;
            var key = a.TrimStart('-').ToLowerInvariant();
            var value = i + 1 < args.Count ? args[i + 1] : null;
            switch (key)
            {
                case "port": port = value; i++; break;
                case "pluginuuid": uuid = value; i++; break;
                case "registerevent": reg = value; i++; break;
                case "info": info = value; i++; break;
            }
        }
        if (port is null || uuid is null || reg is null || info is null)
        {
            error = "expected -port <n> -pluginUUID <id> -registerEvent <event> -info <json> (the Stream Deck app passes these)";
            return false;
        }
        if (!int.TryParse(port, out var p) || p is <= 0 or > 65535)
        {
            error = $"invalid -port '{port}'";
            return false;
        }
        RegistrationInfo parsed;
        try { parsed = RegistrationInfo.Parse(info); }
        catch (Exception ex) when (ex is JsonException or FormatException or InvalidOperationException)
        {
            error = "invalid -info JSON: " + ex.Message;
            return false;
        }
        result = new LaunchArgs(p, uuid, reg, info, parsed);
        return true;
    }
}

/// <summary>Small helpers for reading loosely-typed protocol JSON without throwing.</summary>
internal static class Json
{
    public static string? Str(JsonObject? o, string key) =>
        o?[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    public static double? Num(JsonObject? o, string key)
    {
        if (o?[key] is not JsonValue v) return null;
        if (v.TryGetValue<double>(out var d)) return d;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<string>(out var s) && double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var ps)) return ps;
        return null;
    }

    public static int? Int(JsonObject? o, string key) => Num(o, key) is { } d ? (int)Math.Round(d) : null;

    public static bool Bool(JsonObject? o, string key) =>
        o?[key] is JsonValue v && ((v.TryGetValue<bool>(out var b) && b) || (v.TryGetValue<string>(out var s) && s == "true"));

    public static Coordinates? Coords(JsonObject? payload) =>
        payload?["coordinates"] is JsonObject c && Int(c, "column") is { } col && Int(c, "row") is { } row ? new Coordinates(col, row) : null;

    public static DeviceInfo? Device(string? id, JsonObject? info)
    {
        if (id is null || info is null) return null;
        var size = info["size"] as JsonObject;
        return new DeviceInfo(id, Str(info, "name") ?? "Stream Deck", DeviceInfo.ParseType(Int(info, "type") ?? -1),
            Int(size, "columns") ?? 0, Int(size, "rows") ?? 0);
    }
}
