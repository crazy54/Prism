using System.Text.Json.Nodes;

namespace PrismControl.Core.PropertyInspector;

/// <summary>
/// A declarative settings form rendered by pi/default.html. Each field binds to a top-level settings property
/// (camelCase), so most actions need no HTML. Buttons send <c>{type: command}</c> to <c>OnPiMessageAsync</c>.
/// Return it from <c>DescribeForm()</c>.
/// <para>
/// A setting named <c>"global:&lt;section&gt;.&lt;key&gt;"</c> (build it with <see cref="Global"/>) binds the field to a
/// key of a global-settings section instead (e.g. <c>global:eq.backend</c>): every action of the plugin sees the same
/// value, and the module gets <c>GlobalSettings.Changed</c> when the user edits it.
/// </para>
/// </summary>
public sealed class PiForm
{
    /// <summary>The prefix that binds a field to a global-settings section key.</summary>
    public const string GlobalPrefix = "global:";

    private readonly List<JsonObject> _fields = [];

    /// <summary>A setting name that binds a field to <paramref name="key"/> of global-settings section <paramref name="section"/>: <c>global:section.key</c>.</summary>
    public static string Global(string section, string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(section);
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        if (section.Contains('.')) throw new ArgumentException("A section name cannot contain '.'.", nameof(section));
        return GlobalPrefix + section + "." + key;
    }

    public PiForm Text(string setting, string label, string? placeholder = null) =>
        Add("text", setting, label, o => { if (placeholder is not null) o["placeholder"] = placeholder; });

    public PiForm Number(string setting, string label, double? min = null, double? max = null, double? step = null) =>
        Add("number", setting, label, o => { Range(o, min, max, step); });

    public PiForm Range(string setting, string label, double min, double max, double step = 1, string? unit = null) =>
        Add("range", setting, label, o => { Range(o, min, max, step); if (unit is not null) o["unit"] = unit; });

    /// <summary>Multi-line text (a string setting; newlines are kept). Saved 300 ms after the user stops typing.</summary>
    public PiForm TextArea(string setting, string label, string? placeholder = null, int rows = 4) =>
        Add("textarea", setting, label, o => { if (placeholder is not null) o["placeholder"] = placeholder; o["rows"] = Math.Clamp(rows, 2, 20); });

    public PiForm Checkbox(string setting, string label) => Add("checkbox", setting, label, null);

    /// <summary>
    /// A select; <paramref name="options"/> are (value, label). Use <paramref name="optionsFrom"/> to have the PI request
    /// the list with a pi.request (answer it in OnPiMessageAsync with <c>[{ value, label }]</c>); call
    /// <c>RefreshPropertyInspectorOptions(optionsFrom)</c> when the list changes.
    /// </summary>
    public PiForm Select(string setting, string label, IEnumerable<(string Value, string Label)>? options = null, string? optionsFrom = null) =>
        Add("select", setting, label, o =>
        {
            if (options is not null)
                o["options"] = new JsonArray(options.Select(x => (JsonNode)new JsonObject { ["value"] = x.Value, ["label"] = x.Label }).ToArray());
            if (optionsFrom is not null) o["optionsFrom"] = optionsFrom;
        });

    /// <summary>
    /// A multi-select: a checklist whose setting is a string array (<c>string[]</c> or <c>List&lt;string&gt;</c>) of the
    /// checked values. With <paramref name="ordered"/> the user also orders the checked items (up/down buttons) and the
    /// array keeps that order, e.g. the devices a switcher cycles through. <paramref name="max"/> caps how many can be
    /// checked. Saved values missing from the options (an unplugged device) stay checked and are shown as unavailable.
    /// </summary>
    public PiForm MultiSelect(string setting, string label, IEnumerable<(string Value, string Label)>? options = null, string? optionsFrom = null,
        bool ordered = false, int? max = null) =>
        Add("multiselect", setting, label, o =>
        {
            if (options is not null)
                o["options"] = new JsonArray(options.Select(x => (JsonNode)new JsonObject { ["value"] = x.Value, ["label"] = x.Label }).ToArray());
            if (optionsFrom is not null) o["optionsFrom"] = optionsFrom;
            if (ordered) o["ordered"] = true;
            if (max is { } m) o["max"] = Math.Max(1, m);
        });

    /// <summary>A button that sends <paramref name="command"/> as a PI message.</summary>
    public PiForm Button(string command, string label) => Add("button", null, label, o => o["command"] = command);

    /// <summary>Read-only text. <paramref name="stateKey"/> shows a value from DescribeState()/pi.state updates.</summary>
    public PiForm Info(string label, string? text = null, string? stateKey = null) =>
        Add("info", null, label, o => { if (text is not null) o["text"] = text; if (stateKey is not null) o["stateKey"] = stateKey; });

    public PiForm Heading(string label) => Add("heading", null, label, null);

    public JsonObject ToJson() => new() { ["fields"] = new JsonArray(_fields.Select(f => (JsonNode)f.DeepClone()).ToArray()) };

    private PiForm Add(string kind, string? setting, string label, Action<JsonObject>? extra)
    {
        var o = new JsonObject { ["kind"] = kind, ["label"] = label };
        if (setting is not null) o["setting"] = setting;
        extra?.Invoke(o);
        _fields.Add(o);
        return this;
    }

    private static void Range(JsonObject o, double? min, double? max, double? step)
    {
        if (min is { } a) o["min"] = a;
        if (max is { } b) o["max"] = b;
        if (step is { } c) o["step"] = c;
    }
}
