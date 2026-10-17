using System.Reflection;
using System.Text.Json.Nodes;
using PrismControl.Core.Hosting;

namespace PrismControl.Smart.Packs;

/// <summary>One pack file: where it came from and its text.</summary>
public sealed record PackSourceFile(string Name, PackOrigin Origin, string Text);

/// <summary>How a pack id fared: the files it was built from, what was wrong, and whether it loaded.</summary>
public sealed record PackStatus(string Id, IReadOnlyList<string> Files, IReadOnlyList<PackProblem> Problems, bool Loaded, PackOrigin Origin, string? Version)
{
    public int Errors => Problems.Count(p => p.Severity == ProblemSeverity.Error);
    public int Warnings => Problems.Count(p => p.Severity == ProblemSeverity.Warning);
}

/// <summary>
/// JSON-level merging. User overrides patch a shipped pack per item id, property by property (later wins), so a user
/// file can be as small as <c>{ "id": "planet-coaster-2", "verbs": [ { "id": "edit.undo", "binding": { … } } ] }</c>.
/// <c>extends</c> inherits whole items (contexts, verbs, controls, readouts, Sight regions); the child's items win.
/// </summary>
public static class PackMerger
{
    private static readonly string[] ItemLists = ["contexts", "verbs", "controls", "readouts", "sightRegions", "sources"];
    private static readonly string[] InheritedLists = ["contexts", "verbs", "controls", "readouts", "sightRegions"];

    public static JsonObject MergeOverride(JsonObject baseJson, JsonObject patch)
    {
        var result = (JsonObject)baseJson.DeepClone();
        foreach (var (key, value) in patch)
        {
            if (value is null) continue;
            if (ItemLists.Contains(key) && value is JsonArray pa && result[key] is JsonArray ba)
                result[key] = MergeById(ba, pa, deep: true);
            else if (key == "layouts" && value is JsonArray pl && result[key] is JsonArray bl)
                result[key] = MergeLayouts(bl, pl);
            else
                result[key] = value.DeepClone();
        }
        return result;
    }

    public static JsonObject Inherit(JsonObject child, JsonObject parentResolved)
    {
        var result = (JsonObject)child.DeepClone();
        var childHasDefault = child["contexts"] is JsonArray cc && cc.OfType<JsonObject>().Any(c => c["default"] is JsonValue d && d.TryGetValue<bool>(out var b) && b);
        foreach (var key in InheritedLists)
        {
            if (parentResolved[key] is not JsonArray pa) continue;
            var inherited = (JsonArray)pa.DeepClone();
            // The child's own default context wins (a site's "browse" over the browser's "browser").
            if (key == "contexts" && childHasDefault)
                foreach (var c in inherited.OfType<JsonObject>()) c.Remove("default");
            result[key] = result[key] is JsonArray ca ? MergeInherited(key, inherited, ca) : inherited;
        }
        return result;
    }

    /// <summary>
    /// The child's items over the parent's: a COMPLETE child item (a site's own media.playPause) replaces the parent's
    /// whole; a PARTIAL one (an override file's <c>{ id, priority }</c> for an inherited verb) patches it property by
    /// property, the way overrides of the pack's own items do (review B, partial overrides of inherited items).
    /// </summary>
    private static JsonArray MergeInherited(string key, JsonArray inherited, JsonArray child)
    {
        var complete = new JsonArray();
        var partial = new JsonArray();
        foreach (var n in child)
        {
            if (n is JsonObject o && !IsComplete(key, o) && o["id"] is JsonValue idv && idv.TryGetValue<string>(out var id)
                && inherited.OfType<JsonObject>().Any(p => p["id"] is JsonValue pv && pv.TryGetValue<string>(out var pid) && pid == id))
                partial.Add(n.DeepClone());
            else complete.Add(n?.DeepClone());
        }
        var merged = MergeById(inherited, partial, deep: true);
        return MergeById(merged, complete, deep: false);
    }

    /// <summary>Whether an item carries everything the parser needs (a redefinition), not just a few overridden fields.</summary>
    private static bool IsComplete(string key, JsonObject o) => key switch
    {
        "verbs" => o.ContainsKey("label") && o.ContainsKey("category") && o.ContainsKey("contexts") && o.ContainsKey("binding"),
        "controls" => o.ContainsKey("label") && o.ContainsKey("contexts") && o.ContainsKey("turn"),
        "readouts" => o.ContainsKey("label") && o.ContainsKey("source"),
        "contexts" => o.ContainsKey("detect"),
        _ => true,
    };

    private static JsonArray MergeById(JsonArray baseItems, JsonArray later, bool deep)
    {
        var order = new List<string>();
        var map = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        var anonymous = new List<JsonNode>();
        foreach (var n in baseItems)
        {
            if (n is JsonObject o && o["id"]?.GetValueKind() == System.Text.Json.JsonValueKind.String)
            {
                var id = o["id"]!.GetValue<string>();
                if (map.TryAdd(id, (JsonObject)o.DeepClone())) order.Add(id);
            }
            else if (n is not null) anonymous.Add(n.DeepClone());
        }
        foreach (var n in later)
        {
            if (n is not JsonObject o || o["id"]?.GetValueKind() != System.Text.Json.JsonValueKind.String) continue;
            var id = o["id"]!.GetValue<string>();
            if (map.TryGetValue(id, out var existing) && deep)
            {
                foreach (var (k, v) in o) existing[k] = v?.DeepClone();
            }
            else
            {
                if (!map.ContainsKey(id)) order.Add(id);
                map[id] = (JsonObject)o.DeepClone();
            }
        }
        var arr = new JsonArray();
        foreach (var id in order) arr.Add(map[id]);
        foreach (var a in anonymous) arr.Add(a);
        return arr;
    }

    private static JsonArray MergeLayouts(JsonArray baseItems, JsonArray later)
    {
        static string Key(JsonNode? n) => n is JsonObject o ? $"{o["device"]}/{o["context"]}" : "";
        var list = baseItems.Select(n => n?.DeepClone()).ToList();
        foreach (var n in later)
        {
            var i = list.FindIndex(x => Key(x) == Key(n));
            if (i >= 0) list[i] = n?.DeepClone();
            else list.Add(n?.DeepClone());
        }
        return new JsonArray([.. list]);
    }
}

/// <summary>
/// All packs: shipped (embedded in this assembly from prism-control/packs/), the plugin folder's packs/ (if any), and the
/// user's overrides in %APPDATA%\Prism\control\packs\. Thread-safe; <see cref="Reload"/> swaps the whole set atomically.
/// </summary>
public sealed class PackLibrary
{
    private readonly Func<IEnumerable<PackSourceFile>> _sources;
    private readonly ILog _log;
    private volatile Snapshot _current = new([], []);

    private sealed record Snapshot(IReadOnlyList<ContextPack> Packs, IReadOnlyList<PackStatus> Status);

    public PackLibrary(Func<IEnumerable<PackSourceFile>> sources, ILog? log = null)
    {
        _sources = sources;
        _log = (log ?? NullLog.Instance).For("packs");
    }

    /// <summary>Loaded packs, ordered by id.</summary>
    public IReadOnlyList<ContextPack> Packs => _current.Packs;
    public IReadOnlyList<PackStatus> Status => _current.Status;
    public event Action? Changed;

    public ContextPack? Find(string id) => _current.Packs.FirstOrDefault(p => p.Id == id);

    public void Reload()
    {
        var snap = Load(_sources());
        _current = snap;
        foreach (var s in snap.Status)
        {
            if (!s.Loaded) _log.Warn($"Pack {s.Id} not loaded: {string.Join("; ", s.Problems.Where(p => p.Severity == ProblemSeverity.Error).Take(3))}");
            else if (s.Errors > 0) _log.Warn($"Pack {s.Id} loaded with {s.Errors} error(s); the broken items were dropped. First: {s.Problems.First(p => p.Severity == ProblemSeverity.Error)}");
        }
        _log.Info($"{snap.Packs.Count} pack(s) loaded: {string.Join(", ", snap.Packs.Select(p => $"{p.Id} {p.PackVersion}"))}");
        Changed?.Invoke();
    }

    private static Snapshot Load(IEnumerable<PackSourceFile> files)
    {
        // 1. Parse every file; group by pack id in source order (shipped, plugin, user).
        var byId = new Dictionary<string, (JsonObject Json, List<string> Files, List<PackProblem> Problems, PackOrigin Origin)>(StringComparer.Ordinal);
        var order = new List<string>();
        var orphanProblems = new List<PackStatus>();
        // Within the user's folder, the AI channel's <pack>.ai.json files load FIRST, so every hand-written file of the
        // user wins over an assistant's override, whatever the file names (review E15).
        foreach (var f in files.OrderBy(f => f.Origin).ThenBy(f => f.Origin == PackOrigin.User && IsAiFile(f.Name) ? 0 : 1))
        {
            var problems = new List<PackProblem>();
            var json = PackParser.ParseObject(f.Text, f.Name, problems);
            var id = json is null ? null : PackParser.Str(json, "id");
            if (json is null || string.IsNullOrEmpty(id))
            {
                if (json is not null) problems.Add(new(ProblemSeverity.Error, f.Name, "no pack id"));
                orphanProblems.Add(new PackStatus(Path.GetFileNameWithoutExtension(f.Name), [f.Name], problems, false, f.Origin, null));
                continue;
            }
            var stem = Path.GetFileNameWithoutExtension(f.Name);
            if (f.Origin != PackOrigin.User && !string.Equals(stem, id, StringComparison.Ordinal))
                problems.Add(new(ProblemSeverity.Warning, f.Name, $"file name should be {id}.json"));
            if (byId.TryGetValue(id, out var existing))
            {
                existing.Files.Add(f.Name);
                existing.Problems.AddRange(problems);
                byId[id] = (PackMerger.MergeOverride(existing.Json, json), existing.Files, existing.Problems, f.Origin);
            }
            else
            {
                byId[id] = (json, [f.Name], problems, f.Origin);
                order.Add(id);
            }
        }

        // 2. Resolve extends (depth first, cycles refused), then parse + validate.
        var resolved = new Dictionary<string, JsonObject?>(StringComparer.Ordinal);
        JsonObject? Resolve(string id, HashSet<string> stack, List<PackProblem> problems)
        {
            if (resolved.TryGetValue(id, out var done)) return done;
            if (!byId.TryGetValue(id, out var entry)) return null;
            if (!stack.Add(id)) { problems.Add(new(ProblemSeverity.Error, "pack " + id, "extends forms a cycle")); return null; }
            var json = entry.Json;
            foreach (var parent in PackParser.Strings(json["extends"]))
            {
                var pj = Resolve(parent, stack, problems);
                if (pj is null) { problems.Add(new(ProblemSeverity.Error, "pack " + id, $"extends \"{parent}\", which is missing or broken")); continue; }
                json = PackMerger.Inherit(json, pj);
            }
            stack.Remove(id);
            resolved[id] = json;
            return json;
        }

        var packs = new List<ContextPack>();
        var status = new List<PackStatus>(orphanProblems);
        foreach (var id in order)
        {
            var entry = byId[id];
            var problems = entry.Problems;
            var json = Resolve(id, [], problems);
            ContextPack? pack = null;
            if (json is not null)
            {
                var parsed = PackParser.Parse(json, problems, entry.Origin, entry.Files);
                if (parsed is not null) pack = PackValidator.Validate(parsed, problems);
            }
            if (pack is not null) packs.Add(pack);
            status.Add(new PackStatus(id, entry.Files, problems, pack is not null, entry.Origin, pack?.PackVersion));
        }
        return new Snapshot([.. packs.OrderBy(p => p.Id, StringComparer.Ordinal)], [.. status.OrderBy(s => s.Id, StringComparer.Ordinal)]);
    }

    /// <summary>An AI override file (<c>&lt;pack&gt;.ai.json</c>, written only by the AI preferences channel).</summary>
    public static bool IsAiFile(string name) => name.EndsWith(".ai.json", StringComparison.OrdinalIgnoreCase);

    // ------------------------------------------------------------------ sources

    /// <summary>The packs embedded in this assembly (prism-control/packs/*.json at build time).</summary>
    public static IEnumerable<PackSourceFile> Embedded()
    {
        var asm = typeof(PackLibrary).Assembly;
        foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith("smart/packs/", StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            using var s = asm.GetManifestResourceStream(name);
            if (s is null) continue;
            using var r = new StreamReader(s);
            yield return new PackSourceFile(name["smart/packs/".Length..], PackOrigin.Shipped, r.ReadToEnd());
        }
    }

    /// <summary>Every *.json in a folder (missing folder = none). Files over 2 MB are skipped.</summary>
    public static IEnumerable<PackSourceFile> Folder(string? dir, PackOrigin origin, ILog? log = null)
    {
        if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) yield break;
        string[] files;
        try { files = Directory.GetFiles(dir, "*.json", SearchOption.TopDirectoryOnly); }
        catch (Exception ex) { log?.Warn($"Cannot list packs in {dir}: {ex.GetType().Name}"); yield break; }
        foreach (var f in files.Order(StringComparer.OrdinalIgnoreCase))
        {
            string? text = null;
            try
            {
                if (new FileInfo(f).Length <= 2 * 1024 * 1024) text = File.ReadAllText(f);
                else log?.Warn($"Skipped pack {Path.GetFileName(f)}: larger than 2 MB");
            }
            catch (Exception ex) { log?.Warn($"Cannot read pack {Path.GetFileName(f)}: {ex.GetType().Name}"); }
            if (text is not null) yield return new PackSourceFile(origin == PackOrigin.User ? "user:" + Path.GetFileName(f) : Path.GetFileName(f), origin, text);
        }
    }

    internal static Assembly Assembly => typeof(PackLibrary).Assembly;
}
