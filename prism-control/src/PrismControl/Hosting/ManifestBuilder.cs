using System.Text.Json.Nodes;
using PrismControl.Core.Actions;

namespace PrismControl.Hosting;

/// <summary>
/// Generates manifest.json from the plugin constants and the [StreamDeckAction] attributes
/// (valid against @elgato/schemas 0.5.2 plugin-manifest.schema.json; checked by tools/PrismControl.Tools validate).
/// Run with <c>PrismControl.exe --emit-manifest &lt;path&gt;</c> at pack time. The plugin never reads its manifest at runtime.
/// </summary>
internal static class ManifestBuilder
{
    public const string SchemaUrl = "https://schemas.elgato.com/streamdeck/plugins/manifest.json";

    public static JsonObject Build(ActionRegistry registry, IEnumerable<ModuleDescriptor> modules, string version)
    {
        var actions = new JsonArray();
        foreach (var d in registry.Actions) actions.Add((JsonNode)Action(d));

        var m = new JsonObject
        {
            ["$schema"] = SchemaUrl,
            ["UUID"] = PluginInfo.Uuid,
            ["Name"] = PluginInfo.Name,
            ["Version"] = version,
            ["Author"] = PluginInfo.Author,
            ["Description"] = PluginInfo.Description,
            ["Icon"] = PluginInfo.Icon,
            ["Category"] = PluginInfo.Category,
            ["CategoryIcon"] = PluginInfo.CategoryIcon,
            ["CodePath"] = PluginInfo.CodePath,
            ["CodePathWin"] = PluginInfo.CodePath,
            ["PropertyInspectorPath"] = StreamDeckActionAttribute.DefaultPropertyInspector,
            ["SDKVersion"] = PluginInfo.SdkVersion,
            ["Software"] = new JsonObject { ["MinimumVersion"] = PluginInfo.SoftwareMinimumVersion },
            ["OS"] = new JsonArray(new JsonObject { ["Platform"] = "windows", ["MinimumVersion"] = PluginInfo.WindowsMinimumVersion }),
            ["Actions"] = actions,
        };

        var monitored = modules.SelectMany(x => x.Attribute?.MonitorApplications ?? [])
            .Where(s => !string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();
        if (monitored.Count > 0)
            m["ApplicationsToMonitor"] = new JsonObject { ["windows"] = new JsonArray(monitored.Select(x => (JsonNode)x).ToArray()) };
        return m;
    }

    private static JsonObject Action(ActionDescriptor d)
    {
        var a = d.Attribute;
        var controllers = new JsonArray();
        if (a.Controllers.HasFlag(Controllers.Keypad)) controllers.Add((JsonNode)"Keypad");
        if (a.Controllers.HasFlag(Controllers.Encoder)) controllers.Add((JsonNode)"Encoder");

        var states = new JsonArray(State(a.KeyImage ?? StreamDeckActionAttribute.DefaultKeyImage, a, "Off"));
        if (a.KeyImageAlt is not null) states.Add((JsonNode)State(a.KeyImageAlt, a, "On"));

        var o = new JsonObject
        {
            ["UUID"] = a.Uuid,
            ["Name"] = a.Name,
            ["Icon"] = a.Icon ?? StreamDeckActionAttribute.DefaultIcon,
        };
        if (a.Tooltip is not null) o["Tooltip"] = a.Tooltip;
        o["Controllers"] = controllers;
        o["States"] = states;
        if (a.Controllers.HasFlag(Controllers.Encoder))
        {
            var enc = new JsonObject
            {
                ["layout"] = a.Layout ?? "$X1",
                ["Icon"] = a.EncoderIcon ?? StreamDeckActionAttribute.DefaultEncoderIcon,
            };
            if (a.EncoderBackground is not null) enc["background"] = a.EncoderBackground;
            if (a.StackColor is not null) enc["StackColor"] = a.StackColor;
            var td = new JsonObject();
            if (a.TriggerRotate is not null) td["Rotate"] = a.TriggerRotate;
            if (a.TriggerPush is not null) td["Push"] = a.TriggerPush;
            if (a.TriggerTouch is not null) td["Touch"] = a.TriggerTouch;
            if (a.TriggerLongTouch is not null) td["LongTouch"] = a.TriggerLongTouch;
            if (td.Count > 0) enc["TriggerDescription"] = td;
            o["Encoder"] = enc;
        }
        if (a.PropertyInspector is not null) o["PropertyInspectorPath"] = a.PropertyInspector;
        o["DisableAutomaticStates"] = a.DisableAutomaticStates;
        o["SupportedInMultiActions"] = a.SupportedInMultiActions;
        o["UserTitleEnabled"] = a.UserTitleEnabled;
        o["VisibleInActionsList"] = a.VisibleInActionsList;
        o["OS"] = new JsonArray("windows");
        return o;
    }

    private static JsonObject State(string image, StreamDeckActionAttribute a, string name) => new()
    {
        ["Name"] = name,
        ["Image"] = image,
        ["ShowTitle"] = a.ShowTitle,
        ["TitleAlignment"] = "bottom",
    };
}
