using System.Reflection;
using System.Text.RegularExpressions;

namespace PrismControl.Core.Actions;

/// <summary>An action class found by <see cref="ActionValidator.Scan(IEnumerable{Assembly})"/>.</summary>
public sealed record DiscoveredAction(Type Type, StreamDeckActionAttribute Attribute)
{
    public string Uuid => Attribute.Uuid;
}

/// <summary>What <see cref="ActionValidator.Scan(IEnumerable{Assembly})"/> found: the valid actions plus every error and warning.</summary>
public sealed class ActionValidationReport(IReadOnlyList<DiscoveredAction> actions, IReadOnlyList<string> errors, IReadOnlyList<string> warnings)
{
    /// <summary>Valid actions, one per UUID (an action with an error is left out, as the host skips it).</summary>
    public IReadOnlyList<DiscoveredAction> Actions { get; } = actions;
    /// <summary>"Type (uuid): problem" lines. The host skips these actions and <c>--emit-manifest</c> fails.</summary>
    public IReadOnlyList<string> Errors { get; } = errors;
    /// <summary>Allowed but probably unintended (long names, an Encoder action without a Layout).</summary>
    public IReadOnlyList<string> Warnings { get; } = warnings;
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// The rules the host applies to every <see cref="StreamDeckActionAttribute"/> at discovery. Domain tests call the same
/// code instead of copying the rules:
/// <code>
/// var report = ActionValidator.Scan(typeof(AudioModule).Assembly);
/// Assert.Empty(report.Errors);
/// </code>
/// </summary>
public static partial class ActionValidator
{
    public const int MaxNameLength = 30;

    [GeneratedRegex(@"^com\.jeremyfhall\.prismcontrol(\.[a-z0-9-]+)+$")] private static partial Regex UuidRe();
    [GeneratedRegex(@"^(\$(X1|A0|A1|B1|B2|C1)|layouts/[A-Za-z0-9._-]+\.json)$")] private static partial Regex LayoutRe();
    [GeneratedRegex(@"^#[0-9a-fA-F]{6}$")] private static partial Regex HexRe();

    /// <summary>True for "com.jeremyfhall.prismcontrol.&lt;lowercase-segments&gt;".</summary>
    public static bool IsValidUuid(string uuid) => UuidRe().IsMatch(uuid);

    /// <summary>True for a built-in layout id ($A0 $A1 $B1 $B2 $C1 $X1) or "layouts/&lt;name&gt;.json".</summary>
    public static bool IsValidLayout(string layout) => LayoutRe().IsMatch(layout);

    /// <summary>Scans assemblies for non-abstract classes with [StreamDeckAction] and validates each one.</summary>
    public static ActionValidationReport Scan(params Assembly[] assemblies) => Scan((IEnumerable<Assembly>)assemblies);

    public static ActionValidationReport Scan(IEnumerable<Assembly> assemblies)
    {
        var errors = new List<string>();
        var warnings = new List<string>();
        var map = new Dictionary<string, DiscoveredAction>(StringComparer.Ordinal);
        foreach (var asm in assemblies.Distinct())
        {
            Type[] types;
            try { types = asm.GetTypes(); }
            catch (ReflectionTypeLoadException ex)
            {
                errors.Add($"{asm.GetName().Name}: could not load types ({ex.LoaderExceptions.FirstOrDefault()?.Message})");
                types = ex.Types.Where(t => t is not null).ToArray()!;
            }
            foreach (var t in types)
            {
                var attr = t.GetCustomAttribute<StreamDeckActionAttribute>(inherit: false);
                if (attr is null) continue;
                var where = Where(t, attr);
                var problems = Validate(t, attr);
                if (problems.Count > 0)
                {
                    errors.AddRange(problems.Select(p => $"{where}: {p}"));
                    continue;
                }
                warnings.AddRange(Warnings(t, attr).Select(w => $"{where}: {w}"));
                if (map.TryGetValue(attr.Uuid, out var existing))
                {
                    errors.Add($"{where}: duplicate UUID (also on {existing.Type.FullName}).");
                    continue;
                }
                map[attr.Uuid] = new DiscoveredAction(t, attr);
            }
        }
        return new ActionValidationReport(map.Values.OrderBy(a => a.Uuid, StringComparer.Ordinal).ToList(), errors, warnings);
    }

    /// <summary>The errors for one action class (empty = valid). Duplicate UUIDs are only detectable by <see cref="Scan(IEnumerable{Assembly})"/>.</summary>
    public static IReadOnlyList<string> Validate(Type t, StreamDeckActionAttribute a)
    {
        var p = new List<string>();
        if (!IsValidUuid(a.Uuid)) p.Add("UUID must be com.jeremyfhall.prismcontrol.<lowercase-segments>.");
        if (string.IsNullOrWhiteSpace(a.Name)) p.Add("Name is required.");
        if (t.IsAbstract || !typeof(ActionBase).IsAssignableFrom(t)) p.Add("must be a non-abstract class deriving KeyAction<T> or DialAction<T>.");
        if (t.GetConstructor(Type.EmptyTypes) is null) p.Add("needs a public parameterless constructor (get services in OnWillAppearAsync).");
        if (a.Controllers == Controllers.None) p.Add("Controllers must include Keypad and/or Encoder.");
        var isDial = IsSubclassOfGeneric(t, typeof(DialAction<>));
        var isKey = IsSubclassOfGeneric(t, typeof(KeyAction<>));
        if (a.Controllers.HasFlag(Controllers.Encoder) && !isDial) p.Add("Encoder actions must derive DialAction<T>.");
        if (!a.Controllers.HasFlag(Controllers.Encoder) && !isKey && !isDial) p.Add("Keypad actions must derive KeyAction<T>.");
        if (a.Layout is { } l && !IsValidLayout(l)) p.Add($"Layout '{l}' must be a built-in ($A0 $A1 $B1 $B2 $C1 $X1) or layouts/<name>.json.");
        if (a.StackColor is { } sc && !HexRe().IsMatch(sc)) p.Add("StackColor must be #RRGGBB.");
        foreach (var (name, path) in new[] { ("Icon", a.Icon), ("KeyImage", a.KeyImage), ("KeyImageAlt", a.KeyImageAlt), ("EncoderIcon", a.EncoderIcon), ("EncoderBackground", a.EncoderBackground) })
        {
            if (path is null) continue;
            if (path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".svg", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
                p.Add($"{name} must omit the file extension (the app adds .svg/.png and @2x).");
            if (path.StartsWith('/') || path.StartsWith('.') || path.Contains('\\')) p.Add($"{name} must be a plugin-relative path with forward slashes.");
        }
        if (a.PropertyInspector is { } pi && !(pi.EndsWith(".html", StringComparison.Ordinal) || pi.EndsWith(".htm", StringComparison.Ordinal)))
            p.Add("PropertyInspector must be an .html path.");
        return p;
    }

    /// <summary>Allowed but probably unintended.</summary>
    public static IReadOnlyList<string> Warnings(Type t, StreamDeckActionAttribute a)
    {
        var w = new List<string>();
        if (a.Name.Length > MaxNameLength) w.Add($"Name is longer than {MaxNameLength} characters.");
        if (a.Controllers.HasFlag(Controllers.Encoder) && a.Layout is null) w.Add("Encoder action without Layout uses the app default ($X1).");
        return w;
    }

    private static string Where(Type t, StreamDeckActionAttribute a) => $"{t.FullName} ({a.Uuid})";

    private static bool IsSubclassOfGeneric(Type t, Type generic)
    {
        for (var c = t.BaseType; c is not null; c = c.BaseType)
            if (c.IsGenericType && c.GetGenericTypeDefinition() == generic) return true;
        return false;
    }
}
