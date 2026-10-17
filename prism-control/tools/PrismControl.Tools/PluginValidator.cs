using System.Buffers.Binary;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PrismControl.Tools;

/// <summary>
/// Validates an .sdPlugin folder: manifest.json against the vendored Elgato manifest schema (plus the CLI's
/// filePath / imageDimensions checks against real files), every layouts/*.json against the layout schema plus the
/// app's geometry rules (inside 200×100, unique keys, no overlap on the same zOrder), and cross-references
/// (Encoder layouts and PI pages exist).
/// </summary>
public static partial class PluginValidator
{
    public static string SchemaDirectory => Path.Combine(AppContext.BaseDirectory, "schemas");

    public static List<string> ValidatePlugin(string pluginDir)
    {
        var problems = new List<string>();
        var manifestPath = Path.Combine(pluginDir, "manifest.json");
        if (!File.Exists(manifestPath)) return ["manifest.json is missing"];
        using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
        problems.AddRange(ValidateManifest(manifest.RootElement, pluginDir).Select(e => "manifest " + e));

        var layoutsDir = Path.Combine(pluginDir, "layouts");
        if (Directory.Exists(layoutsDir))
            foreach (var f in Directory.EnumerateFiles(layoutsDir, "*.json").Order(StringComparer.Ordinal))
                problems.AddRange(ValidateLayoutFile(f).Select(e => $"layouts/{Path.GetFileName(f)} {e}"));

        foreach (var action in manifest.RootElement.GetProperty("Actions").EnumerateArray())
        {
            var uuid = action.GetProperty("UUID").GetString();
            if (action.TryGetProperty("Encoder", out var enc) && enc.TryGetProperty("layout", out var layout) && layout.GetString() is { } l && !l.StartsWith('$')
                && !File.Exists(Path.Combine(pluginDir, l)))
                problems.Add($"action {uuid}: Encoder.layout {l} does not exist");
            if (action.TryGetProperty("PropertyInspectorPath", out var pi) && !File.Exists(Path.Combine(pluginDir, pi.GetString()!)))
                problems.Add($"action {uuid}: PropertyInspectorPath {pi.GetString()} does not exist");
        }
        if (manifest.RootElement.TryGetProperty("PropertyInspectorPath", out var rootPi) && !File.Exists(Path.Combine(pluginDir, rootPi.GetString()!)))
            problems.Add($"PropertyInspectorPath {rootPi.GetString()} does not exist");
        return problems;
    }

    public static List<SchemaError> ValidateManifest(JsonElement manifest, string? pluginDir)
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(SchemaDirectory, "plugin-manifest.schema.json")));
        var validator = new JsonSchemaValidator(schema.RootElement)
        {
            CustomKeyword = pluginDir is null ? null : (kw, value, inst, path, errors) => FileKeyword(pluginDir, kw, value, inst, path, errors),
        };
        return validator.Validate(manifest);
    }

    public static List<string> ValidateLayoutFile(string file)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(file));
        return ValidateLayout(doc.RootElement);
    }

    public static List<string> ValidateLayout(JsonElement layout)
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(SchemaDirectory, "plugin-layout.schema.json")));
        var problems = new JsonSchemaValidator(schema.RootElement).Validate(layout).Select(e => e.ToString()).ToList();
        if (!layout.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array) return problems;
        var isNeo = layout.TryGetProperty("controller", out var c) && c.GetString() == "Neo";
        double cw = isNeo ? 232 : 200, ch = isNeo ? 50 : 100;
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var rects = new List<(string Key, double Z, double X, double Y, double W, double H)>();
        foreach (var item in items.EnumerateArray())
        {
            var key = item.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
            if (!keys.Add(key)) problems.Add($"duplicate item key '{key}'");
            if (!item.TryGetProperty("rect", out var r) || r.GetArrayLength() != 4) continue;
            var v = r.EnumerateArray().Select(e => e.GetDouble()).ToArray();
            if (v[0] < 0 || v[1] < 0 || v[0] + v[2] > cw || v[1] + v[3] > ch)
                problems.Add($"item '{key}' rect [{string.Join(",", v)}] leaves the {cw}x{ch} canvas (the layout would not render)");
            var z = item.TryGetProperty("zOrder", out var zo) ? zo.GetDouble() : 0;
            rects.Add((key, z, v[0], v[1], v[2], v[3]));
        }
        for (var i = 0; i < rects.Count; i++)
            for (var j = i + 1; j < rects.Count; j++)
            {
                var a = rects[i];
                var b = rects[j];
                if (a.Z != b.Z) continue;
                var overlap = a.X < b.X + b.W && b.X < a.X + a.W && a.Y < b.Y + b.H && b.Y < a.Y + a.H;
                if (overlap) problems.Add($"items '{a.Key}' and '{b.Key}' overlap on zOrder {a.Z} (the layout would not render)");
            }
        return problems;
    }

    /// <summary>Elgato's non-standard keywords: filePath (the file must exist) and imageDimensions (PNG/SVG size, @2x too).</summary>
    private static void FileKeyword(string pluginDir, string keyword, JsonElement value, JsonElement inst, string path, List<SchemaError> errors)
    {
        if (inst.ValueKind != JsonValueKind.String) return;
        var rel = inst.GetString()!;
        if (rel.StartsWith('$')) return; // built-in layout ids
        if (keyword == "filePath")
        {
            if (value.ValueKind == JsonValueKind.True)
            {
                if (!File.Exists(Path.Combine(pluginDir, rel))) errors.Add(new(path, $"file '{rel}' does not exist"));
                return;
            }
            if (value.ValueKind != JsonValueKind.Object) return;
            var exts = value.TryGetProperty("extensions", out var e) ? e.EnumerateArray().Select(x => x.GetString()!).ToArray() : [];
            var include = value.TryGetProperty("includeExtension", out var ie) && ie.ValueKind == JsonValueKind.True;
            if (include)
            {
                if (!File.Exists(Path.Combine(pluginDir, rel))) errors.Add(new(path, $"file '{rel}' does not exist"));
            }
            else if (!exts.Any(x => File.Exists(Path.Combine(pluginDir, rel + x))))
                errors.Add(new(path, $"none of {string.Join(", ", exts.Select(x => rel + x))} exists"));
            return;
        }
        if (keyword == "imageDimensions" && value.ValueKind == JsonValueKind.Array)
        {
            var dims = value.EnumerateArray().Select(x => x.GetInt32()).ToArray();
            foreach (var ext in new[] { ".png", ".svg", ".gif" })
            {
                var f = Path.Combine(pluginDir, rel + ext);
                if (!File.Exists(f)) continue;
                CheckSize(f, dims[0], dims[1], path, errors);
                var hi = Path.Combine(pluginDir, rel + "@2x" + ext);
                if (ext != ".svg" && File.Exists(hi)) CheckSize(hi, dims[0] * 2, dims[1] * 2, path, errors);
            }
        }
    }

    private static void CheckSize(string file, int w, int h, string path, List<SchemaError> errors)
    {
        var size = ImageSize(file);
        if (size is null) { errors.Add(new(path, $"{Path.GetFileName(file)}: cannot read the image size")); return; }
        var (iw, ih) = size.Value;
        var isSvg = file.EndsWith(".svg", StringComparison.OrdinalIgnoreCase);
        var ok = isSvg ? Math.Abs((double)iw / ih - (double)w / h) < 0.01 && (iw == w || iw == w * 2) : iw == w && ih == h;
        if (!ok) errors.Add(new(path, $"{Path.GetFileName(file)} is {iw}x{ih}, expected {w}x{h}"));
    }

    public static (int W, int H)? ImageSize(string file)
    {
        var bytes = File.ReadAllBytes(file);
        if (bytes.Length > 24 && bytes[0] == 0x89 && bytes[1] == 0x50)
            return (BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16)), BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20)));
        if (bytes.Length > 10 && bytes[0] == 'G' && bytes[1] == 'I')
            return (BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(6)), BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(8)));
        var text = System.Text.Encoding.UTF8.GetString(bytes);
        var root = SvgRootRe().Match(text);
        if (!root.Success) return null;
        var wm = SvgWidthRe().Match(root.Value);
        var hm = SvgHeightRe().Match(root.Value);
        if (wm.Success && hm.Success)
            return ((int)double.Parse(wm.Groups[1].Value, CultureInfo.InvariantCulture), (int)double.Parse(hm.Groups[1].Value, CultureInfo.InvariantCulture));
        var vb = SvgViewBoxRe().Match(root.Value);
        if (!vb.Success) return null;
        var p = vb.Groups[1].Value.Split([' ', ','], StringSplitOptions.RemoveEmptyEntries);
        return ((int)double.Parse(p[2], CultureInfo.InvariantCulture), (int)double.Parse(p[3], CultureInfo.InvariantCulture));
    }

    [GeneratedRegex(@"<svg\b[^>]*>")] private static partial Regex SvgRootRe();
    [GeneratedRegex(@"\swidth=""([0-9.]+)(?:px)?""")] private static partial Regex SvgWidthRe();
    [GeneratedRegex(@"\sheight=""([0-9.]+)(?:px)?""")] private static partial Regex SvgHeightRe();
    [GeneratedRegex(@"\sviewBox=""([^""]+)""")] private static partial Regex SvgViewBoxRe();
}
