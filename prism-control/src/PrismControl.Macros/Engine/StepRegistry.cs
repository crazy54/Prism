using System.ComponentModel;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace PrismControl.Macros.Engine;

/// <summary>A setting of a step type, as the property-inspector editor renders it.</summary>
public sealed record StepFieldInfo(string Name, string Label, string Kind, double? Min, double? Max,
    IReadOnlyList<(string Value, string Label)>? Options, string? Placeholder, string? Help)
{
    public JsonObject ToJson()
    {
        var o = new JsonObject { ["name"] = Name, ["label"] = Label, ["kind"] = Kind };
        if (Min is { } a) o["min"] = a;
        if (Max is { } b) o["max"] = b;
        if (Placeholder is not null) o["placeholder"] = Placeholder;
        if (Help is not null) o["help"] = Help;
        if (Options is not null) o["options"] = new JsonArray(Options.Select(x => (JsonNode)new JsonObject { ["value"] = x.Value, ["label"] = x.Label }).ToArray());
        return o;
    }
}

/// <summary>A registered step type.</summary>
public sealed record StepTypeInfo(string Id, string Label, string? Help, int Order, Type Type, IReadOnlyList<StepFieldInfo> Fields)
{
    public MacroStep Create() => (MacroStep)Activator.CreateInstance(Type)!;
}

/// <summary>
/// The step types the engine knows, keyed by their JSON "type". <see cref="Default"/> discovers every
/// <c>[MacroStep]</c> class in this assembly on first use (nothing runs at type load).
/// </summary>
public sealed partial class MacroStepRegistry
{
    private static readonly Lazy<MacroStepRegistry> LazyDefault = new(() => Discover(typeof(MacroStep).Assembly));

    private readonly Dictionary<string, StepTypeInfo> _byId;
    private readonly Dictionary<Type, StepTypeInfo> _byType;

    public static MacroStepRegistry Default => LazyDefault.Value;

    public IReadOnlyList<StepTypeInfo> Types { get; }

    private MacroStepRegistry(IEnumerable<StepTypeInfo> types)
    {
        Types = types.OrderBy(t => t.Order).ThenBy(t => t.Id, StringComparer.Ordinal).ToList();
        _byId = new Dictionary<string, StepTypeInfo>(StringComparer.Ordinal);
        foreach (var t in Types)
            if (!_byId.TryAdd(t.Id, t)) throw new InvalidOperationException($"Two step types use the id \"{t.Id}\" ({_byId[t.Id].Type.Name} and {t.Type.Name}).");
        _byType = Types.ToDictionary(t => t.Type);
    }

    public static MacroStepRegistry Discover(params Assembly[] assemblies) =>
        new(assemblies.SelectMany(a => a.GetTypes())
            .Where(t => t.GetCustomAttribute<MacroStepAttribute>(inherit: false) is not null)
            .Select(Describe));

    /// <summary>A registry with one more step type (plugins of the future, tests).</summary>
    public MacroStepRegistry With(Type stepType) => new(Types.Where(t => t.Type != stepType).Append(Describe(stepType)));

    public StepTypeInfo? Find(string? id) => id is not null && _byId.TryGetValue(id, out var t) ? t : null;

    public StepTypeInfo? For(Type type) => _byType.GetValueOrDefault(type);

    /// <summary>Reads a step type's attribute and fields. Throws when the class breaks the rules.</summary>
    public static StepTypeInfo Describe(Type t)
    {
        var a = t.GetCustomAttribute<MacroStepAttribute>(inherit: false) ?? throw new InvalidOperationException($"{t.Name} has no [MacroStep] attribute.");
        if (t.IsAbstract || !typeof(MacroStep).IsAssignableFrom(t)) throw new InvalidOperationException($"{t.Name} must be a non-abstract MacroStep.");
        if (t.GetConstructor(Type.EmptyTypes) is null) throw new InvalidOperationException($"{t.Name} needs a public parameterless constructor.");
        if (!IdRe().IsMatch(a.Id)) throw new InvalidOperationException($"{t.Name}: step id \"{a.Id}\" must be lowercase letters, digits and '-'.");
        var fields = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => (Prop: p, Attr: p.GetCustomAttribute<StepFieldAttribute>()))
            .Where(x => x.Attr is not null)
            .OrderBy(x => x.Prop.MetadataToken)
            .Select(x => Field(x.Prop, x.Attr!))
            .ToList();
        return new StepTypeInfo(a.Id, a.Label, a.Help, a.Order, t, fields);
    }

    private static StepFieldInfo Field(PropertyInfo p, StepFieldAttribute a)
    {
        var type = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;
        IReadOnlyList<(string, string)>? options = null;
        var kind = a.Kind;
        if (type.IsEnum)
        {
            kind ??= "select";
            options = Enum.GetNames(type).Select(n => (JsonNamingPolicy.CamelCase.ConvertName(n),
                type.GetField(n)?.GetCustomAttribute<DescriptionAttribute>()?.Description ?? n)).ToList();
        }
        kind ??= type == typeof(bool) ? "checkbox"
            : type == typeof(int) || type == typeof(long) || type == typeof(double) ? "number"
            : "text";
        return new StepFieldInfo(JsonNamingPolicy.CamelCase.ConvertName(p.Name), a.Label, kind,
            double.IsNaN(a.Min) ? null : a.Min, double.IsNaN(a.Max) ? null : a.Max, options, a.Placeholder, a.Help);
    }

    /// <summary>The step types for the editor: id, label, help, fields and a default instance.</summary>
    public JsonArray ToCatalogJson() => new(Types.Select(t => (JsonNode)new JsonObject
    {
        ["type"] = t.Id,
        ["label"] = t.Label,
        ["help"] = t.Help,
        ["fields"] = new JsonArray(t.Fields.Select(f => (JsonNode)f.ToJson()).ToArray()),
        ["defaults"] = MacroJson.WriteStep(t.Create(), this),
    }).ToArray());

    [GeneratedRegex("^[a-z][a-z0-9-]*$")]
    private static partial Regex IdRe();
}
