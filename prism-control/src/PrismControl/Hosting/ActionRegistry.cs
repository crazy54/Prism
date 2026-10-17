using System.Reflection;
using PrismControl.Core.Actions;
using PrismControl.Core.Hosting;

namespace PrismControl.Hosting;

public sealed record ActionDescriptor(string Uuid, Type Type, StreamDeckActionAttribute Attribute, string AssemblyName);

public sealed record ModuleDescriptor(Assembly Assembly, Type? ModuleType, PrismModuleAttribute? Attribute);

/// <summary>Loads module assemblies (every ProjectReference of the exe, recorded as AssemblyMetadata("PrismModule", …)).</summary>
internal static class ModuleLoader
{
    public static IReadOnlyList<string> ModuleAssemblyNames() =>
        typeof(PluginInfo).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Where(a => a.Key == "PrismModule" && !string.IsNullOrEmpty(a.Value))
            .Select(a => a.Value!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    public static IReadOnlyList<ModuleDescriptor> Load(ILog log, List<string>? errors = null)
    {
        var list = new List<ModuleDescriptor>();
        foreach (var name in ModuleAssemblyNames())
        {
            try
            {
                var asm = Assembly.Load(new AssemblyName(name));
                var attr = asm.GetCustomAttribute<PrismModuleAttribute>();
                list.Add(new ModuleDescriptor(asm, attr?.ModuleType, attr));
            }
            catch (Exception ex)
            {
                log.Error($"Module assembly {name} could not be loaded", ex);
                errors?.Add($"module {name}: {ex.Message}");
            }
        }
        return list;
    }
}

/// <summary>
/// Attribute-based action discovery: every non-abstract ActionBase subclass with [StreamDeckAction]. The rules live in
/// <see cref="ActionValidator"/> (Core) so domain tests run exactly what the host runs.
/// </summary>
public sealed class ActionRegistry
{
    private readonly Dictionary<string, ActionDescriptor> _byUuid;

    private ActionRegistry(Dictionary<string, ActionDescriptor> map) => _byUuid = map;

    public IReadOnlyList<ActionDescriptor> Actions => _byUuid.Values.OrderBy(a => a.Uuid, StringComparer.Ordinal).ToList();

    public ActionDescriptor? Find(string uuid) => _byUuid.TryGetValue(uuid, out var d) ? d : null;

    public ActionBase? Create(string uuid) =>
        _byUuid.TryGetValue(uuid, out var d) ? (ActionBase)Activator.CreateInstance(d.Type)! : null;

    public static ActionRegistry Discover(IEnumerable<Assembly> assemblies, List<string> errors, List<string> warnings)
    {
        var report = ActionValidator.Scan(assemblies);
        errors.AddRange(report.Errors);
        warnings.AddRange(report.Warnings);
        var map = new Dictionary<string, ActionDescriptor>(StringComparer.Ordinal);
        foreach (var a in report.Actions)
            map[a.Uuid] = new ActionDescriptor(a.Uuid, a.Type, a.Attribute, a.Type.Assembly.GetName().Name ?? "");
        return new ActionRegistry(map);
    }
}
