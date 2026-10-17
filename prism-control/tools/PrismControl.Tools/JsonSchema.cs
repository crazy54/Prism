using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PrismControl.Tools;

public sealed record SchemaError(string Path, string Message)
{
    public override string ToString() => $"{(Path.Length == 0 ? "$" : Path)}: {Message}";
}

/// <summary>
/// A JSON Schema draft-07 validator covering the keywords the Elgato schemas use: $ref (local, URL-encoded),
/// allOf/anyOf/oneOf/not, if/then/else, type, enum, const, properties, additionalProperties, required,
/// patternProperties, items (schema or tuple), additionalItems, min/maxItems, uniqueItems, minimum/maximum,
/// exclusiveMinimum/Maximum, multipleOf, min/maxLength, pattern, min/maxProperties.
/// Unknown keywords go to <see cref="CustomKeyword"/> (Elgato's filePath and imageDimensions).
/// </summary>
public sealed class JsonSchemaValidator(JsonElement root)
{
    private static readonly HashSet<string> Annotations =
    [
        "$schema", "$id", "$comment", "title", "description", "markdownDescription", "default", "examples", "errorMessage",
        "definitions", "format", "deprecationMessage", "contentMediaType", "contentEncoding", "readOnly", "writeOnly",
    ];

    private readonly Dictionary<string, Regex> _regexCache = [];

    /// <summary>Called for keywords this validator does not know (keyword, its value, the instance, the path, errors).</summary>
    public Action<string, JsonElement, JsonElement, string, List<SchemaError>>? CustomKeyword { get; init; }

    public List<SchemaError> Validate(JsonElement instance)
    {
        var errors = new List<SchemaError>();
        Check(root, instance, "", errors);
        return errors;
    }

    private void Check(JsonElement schema, JsonElement inst, string path, List<SchemaError> errors)
    {
        if (schema.ValueKind == JsonValueKind.True) return;
        if (schema.ValueKind == JsonValueKind.False) { errors.Add(new(path, "not allowed (false schema)")); return; }
        if (schema.ValueKind != JsonValueKind.Object) return;

        if (schema.TryGetProperty("$ref", out var r))
        {
            // Draft-07: $ref siblings are ignored.
            Check(Resolve(r.GetString()!), inst, path, errors);
            return;
        }

        foreach (var kw in schema.EnumerateObject())
        {
            var v = kw.Value;
            switch (kw.Name)
            {
                case "type":
                    if (!TypeMatches(v, inst)) errors.Add(new(path, $"expected type {v.GetRawText()}, got {Kind(inst)}"));
                    break;
                case "enum":
                    if (!v.EnumerateArray().Any(e => DeepEquals(e, inst))) errors.Add(new(path, $"value {Short(inst)} is not one of {Short(v)}"));
                    break;
                case "const":
                    if (!DeepEquals(v, inst)) errors.Add(new(path, $"value {Short(inst)} must equal {Short(v)}"));
                    break;
                case "allOf":
                    foreach (var s in v.EnumerateArray()) Check(s, inst, path, errors);
                    break;
                case "anyOf":
                {
                    var branches = v.EnumerateArray().Select(s => Sub(s, inst, path)).ToList();
                    if (!branches.Any(b => b.Count == 0))
                    {
                        var best = branches.OrderBy(b => b.Count).First();
                        errors.Add(new(path, "matches none of anyOf; closest branch: " + string.Join("; ", best.Take(3))));
                    }
                    break;
                }
                case "oneOf":
                {
                    var ok = v.EnumerateArray().Count(s => Sub(s, inst, path).Count == 0);
                    if (ok != 1) errors.Add(new(path, $"must match exactly one oneOf branch (matched {ok})"));
                    break;
                }
                case "not":
                    if (Sub(v, inst, path).Count == 0) errors.Add(new(path, "must not match the 'not' schema"));
                    break;
                case "if":
                {
                    var passes = Sub(v, inst, path).Count == 0;
                    if (passes && schema.TryGetProperty("then", out var then)) Check(then, inst, path, errors);
                    if (!passes && schema.TryGetProperty("else", out var els)) Check(els, inst, path, errors);
                    break;
                }
                case "then" or "else":
                    break;
                case "properties":
                    if (inst.ValueKind == JsonValueKind.Object)
                        foreach (var p in v.EnumerateObject())
                            if (inst.TryGetProperty(p.Name, out var child)) Check(p.Value, child, path + "." + p.Name, errors);
                    break;
                case "patternProperties":
                    if (inst.ValueKind == JsonValueKind.Object)
                        foreach (var pp in v.EnumerateObject())
                            foreach (var prop in inst.EnumerateObject())
                                if (Re(pp.Name).IsMatch(prop.Name)) Check(pp.Value, prop.Value, path + "." + prop.Name, errors);
                    break;
                case "additionalProperties":
                    if (inst.ValueKind == JsonValueKind.Object)
                    {
                        var known = schema.TryGetProperty("properties", out var props) ? props.EnumerateObject().Select(p => p.Name).ToHashSet() : [];
                        var patterns = schema.TryGetProperty("patternProperties", out var pps) ? pps.EnumerateObject().Select(p => Re(p.Name)).ToList() : [];
                        foreach (var prop in inst.EnumerateObject())
                        {
                            if (known.Contains(prop.Name) || patterns.Any(p => p.IsMatch(prop.Name))) continue;
                            if (v.ValueKind == JsonValueKind.False) errors.Add(new(path, $"property '{prop.Name}' is not allowed"));
                            else Check(v, prop.Value, path + "." + prop.Name, errors);
                        }
                    }
                    break;
                case "required":
                    if (inst.ValueKind == JsonValueKind.Object)
                        foreach (var req in v.EnumerateArray())
                            if (!inst.TryGetProperty(req.GetString()!, out _)) errors.Add(new(path, $"missing required property '{req.GetString()}'"));
                    break;
                case "minProperties":
                    if (inst.ValueKind == JsonValueKind.Object && inst.EnumerateObject().Count() < v.GetInt32()) errors.Add(new(path, $"needs at least {v.GetInt32()} properties"));
                    break;
                case "maxProperties":
                    if (inst.ValueKind == JsonValueKind.Object && inst.EnumerateObject().Count() > v.GetInt32()) errors.Add(new(path, $"allows at most {v.GetInt32()} properties"));
                    break;
                case "items":
                    if (inst.ValueKind == JsonValueKind.Array)
                    {
                        var arr = inst.EnumerateArray().ToList();
                        if (v.ValueKind == JsonValueKind.Array)
                        {
                            var tuple = v.EnumerateArray().ToList();
                            for (var i = 0; i < arr.Count; i++)
                            {
                                if (i < tuple.Count) Check(tuple[i], arr[i], $"{path}[{i}]", errors);
                                else if (schema.TryGetProperty("additionalItems", out var ai))
                                {
                                    if (ai.ValueKind == JsonValueKind.False) errors.Add(new($"{path}[{i}]", "additional items are not allowed"));
                                    else Check(ai, arr[i], $"{path}[{i}]", errors);
                                }
                            }
                        }
                        else for (var i = 0; i < arr.Count; i++) Check(v, arr[i], $"{path}[{i}]", errors);
                    }
                    break;
                case "additionalItems":
                    break;
                case "minItems":
                    if (inst.ValueKind == JsonValueKind.Array && inst.GetArrayLength() < v.GetInt32()) errors.Add(new(path, $"needs at least {v.GetInt32()} items"));
                    break;
                case "maxItems":
                    if (inst.ValueKind == JsonValueKind.Array && inst.GetArrayLength() > v.GetInt32()) errors.Add(new(path, $"allows at most {v.GetInt32()} items"));
                    break;
                case "uniqueItems":
                    if (v.ValueKind == JsonValueKind.True && inst.ValueKind == JsonValueKind.Array)
                    {
                        var items = inst.EnumerateArray().ToList();
                        for (var i = 0; i < items.Count; i++)
                            for (var j = i + 1; j < items.Count; j++)
                                if (DeepEquals(items[i], items[j])) { errors.Add(new(path, $"items {i} and {j} are equal (must be unique)")); i = items.Count; break; }
                    }
                    break;
                case "minimum":
                    if (inst.ValueKind == JsonValueKind.Number && inst.GetDecimal() < v.GetDecimal()) errors.Add(new(path, $"{inst.GetRawText()} < minimum {v.GetRawText()}"));
                    break;
                case "maximum":
                    if (inst.ValueKind == JsonValueKind.Number && inst.GetDecimal() > v.GetDecimal()) errors.Add(new(path, $"{inst.GetRawText()} > maximum {v.GetRawText()}"));
                    break;
                case "exclusiveMinimum":
                    if (inst.ValueKind == JsonValueKind.Number && inst.GetDecimal() <= v.GetDecimal()) errors.Add(new(path, $"{inst.GetRawText()} <= exclusiveMinimum {v.GetRawText()}"));
                    break;
                case "exclusiveMaximum":
                    if (inst.ValueKind == JsonValueKind.Number && inst.GetDecimal() >= v.GetDecimal()) errors.Add(new(path, $"{inst.GetRawText()} >= exclusiveMaximum {v.GetRawText()}"));
                    break;
                case "multipleOf":
                    if (inst.ValueKind == JsonValueKind.Number && inst.GetDecimal() % v.GetDecimal() != 0) errors.Add(new(path, $"{inst.GetRawText()} is not a multiple of {v.GetRawText()}"));
                    break;
                case "minLength":
                    if (inst.ValueKind == JsonValueKind.String && new StringInfo(inst.GetString()!).LengthInTextElements < v.GetInt32()) errors.Add(new(path, $"shorter than {v.GetInt32()}"));
                    break;
                case "maxLength":
                    if (inst.ValueKind == JsonValueKind.String && new StringInfo(inst.GetString()!).LengthInTextElements > v.GetInt32()) errors.Add(new(path, $"longer than {v.GetInt32()}"));
                    break;
                case "pattern":
                    if (inst.ValueKind == JsonValueKind.String && !Re(v.GetString()!).IsMatch(inst.GetString()!))
                        errors.Add(new(path, $"'{inst.GetString()}' does not match {v.GetString()}" + (schema.TryGetProperty("errorMessage", out var em) ? $" ({em.GetString()})" : "")));
                    break;
                default:
                    if (!Annotations.Contains(kw.Name)) CustomKeyword?.Invoke(kw.Name, v, inst, path, errors);
                    break;
            }
        }
    }

    private List<SchemaError> Sub(JsonElement schema, JsonElement inst, string path)
    {
        var e = new List<SchemaError>();
        Check(schema, inst, path, e);
        return e;
    }

    private JsonElement Resolve(string reference)
    {
        if (!reference.StartsWith('#')) throw new NotSupportedException("Only local $ref is supported: " + reference);
        var node = root;
        foreach (var raw in reference.TrimStart('#').Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            var seg = Uri.UnescapeDataString(raw).Replace("~1", "/").Replace("~0", "~");
            node = node.GetProperty(seg);
        }
        return node;
    }

    private Regex Re(string pattern)
    {
        if (!_regexCache.TryGetValue(pattern, out var re))
            _regexCache[pattern] = re = new Regex(pattern, RegexOptions.CultureInvariant);
        return re;
    }

    private static bool TypeMatches(JsonElement type, JsonElement inst) => type.ValueKind == JsonValueKind.Array
        ? type.EnumerateArray().Any(t => TypeIs(t.GetString()!, inst))
        : TypeIs(type.GetString()!, inst);

    private static bool TypeIs(string t, JsonElement i) => t switch
    {
        "object" => i.ValueKind == JsonValueKind.Object,
        "array" => i.ValueKind == JsonValueKind.Array,
        "string" => i.ValueKind == JsonValueKind.String,
        "number" => i.ValueKind == JsonValueKind.Number,
        "integer" => i.ValueKind == JsonValueKind.Number && i.TryGetDecimal(out var d) && d == Math.Floor(d),
        "boolean" => i.ValueKind is JsonValueKind.True or JsonValueKind.False,
        "null" => i.ValueKind == JsonValueKind.Null,
        _ => false,
    };

    public static bool DeepEquals(JsonElement a, JsonElement b)
    {
        if (a.ValueKind == JsonValueKind.Number && b.ValueKind == JsonValueKind.Number) return a.GetDecimal() == b.GetDecimal();
        if (a.ValueKind != b.ValueKind) return false;
        switch (a.ValueKind)
        {
            case JsonValueKind.String: return a.GetString() == b.GetString();
            case JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null: return true;
            case JsonValueKind.Array:
                if (a.GetArrayLength() != b.GetArrayLength()) return false;
                return a.EnumerateArray().Zip(b.EnumerateArray()).All(p => DeepEquals(p.First, p.Second));
            case JsonValueKind.Object:
                var ap = a.EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
                var bp = b.EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
                return ap.Count == bp.Count && ap.All(kv => bp.TryGetValue(kv.Key, out var bv) && DeepEquals(kv.Value, bv));
            default: return false;
        }
    }

    private static string Kind(JsonElement e) => e.ValueKind.ToString().ToLowerInvariant();
    private static string Short(JsonElement e) { var s = e.GetRawText(); return s.Length > 80 ? s[..80] + "…" : s; }
}
