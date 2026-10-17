using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace PrismControl.Smart.Profiles;

/// <summary>
/// Structural check of a <c>.streamDeckProfile</c> (FormatVersion 1). There is no official schema for profiles (the
/// format is reverse-engineered, formats.md §5), so this encodes what the app's own exports and the profiles proven on
/// the hardware have: package fields, exactly one <c>.sdProfile</c>, every listed page plus the Default page present,
/// coordinates inside the grid, complete action objects, only known Prism Control actions on controllers they support,
/// no state images, unique ActionIDs, the Galleon's Routers, and RequiredPlugins covering every plugin used.
/// The setup wizard runs it before writing a file; the tests run it on every generated profile.
/// </summary>
public static partial class ProfileChecker
{
    [GeneratedRegex("^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$")]
    private static partial Regex UpperUuid();

    [GeneratedRegex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
    private static partial Regex AnyUuid();

    [GeneratedRegex(@"^Profiles/([^/]+)\.sdProfile/")]
    private static partial Regex RootPattern();

    [GeneratedRegex(@"^(\d+),(\d+)$")]
    private static partial Regex CoordPattern();

    private static readonly string[] ActionFields = ["ActionID", "LinkedTitle", "Name", "Plugin", "Resources", "Settings", "State", "States", "UUID"];

    /// <summary>Problems found (empty = the profile is well-formed).</summary>
    public static IReadOnlyList<string> Check(byte[] zip)
    {
        var found = new List<string>();
        Dictionary<string, byte[]?> entries;
        try
        {
            entries = Read(zip, found);
        }
        catch (InvalidDataException ex) { return [$"zip: {ex.Message}"]; }
        if (found.Count > 0) return found;

        JsonObject? Json(string name)
        {
            if (!entries.TryGetValue(name, out var data) || data is null) { found.Add($"missing {name}"); return null; }
            try { return JsonNode.Parse(data) as JsonObject ?? throw new JsonException("not an object"); }
            catch (JsonException) { found.Add($"{name}: invalid JSON"); return null; }
        }

        var pkg = Json("package.json");
        if (pkg is not null)
        {
            if (Int(pkg["FormatVersion"]) != 1) found.Add("package.json: FormatVersion must be 1");
            foreach (var f in new[] { "AppVersion", "DeviceModel", "OSType", "OSVersion" })
                if (Str(pkg[f]) is not { Length: > 0 }) found.Add($"package.json: {f} must be a string");
            if (!pkg.ContainsKey("DeviceSettings")) found.Add("package.json: DeviceSettings missing (null in the app's exports)");
            if (pkg["RequiredPlugins"] is not JsonArray rp || !rp.Any(x => Str(x) == PinCatalog.PluginUuid)) found.Add("package.json: RequiredPlugins must list " + PinCatalog.PluginUuid);
        }

        var roots = entries.Keys.Select(n => RootPattern().Match(n)).Where(m => m.Success).Select(m => m.Groups[1].Value).Distinct().ToList();
        if (roots.Count != 1) { found.Add($"expected exactly one Profiles/<UUID>.sdProfile, found {roots.Count}"); return found; }
        if (!UpperUuid().IsMatch(roots[0])) found.Add("the profile folder name must be an uppercase UUID");
        var root = $"Profiles/{roots[0]}.sdProfile/";
        var top = Json(root + "manifest.json");
        if (top is null) return found;
        if (Str(top["Version"]) != "3.0") found.Add("manifest: Version must be \"3.0\"");
        var model = Str(top["Device"]?["Model"]);
        if (pkg is not null && model != Str(pkg["DeviceModel"])) found.Add("manifest: Device.Model must equal package.json DeviceModel");
        var device = ProfileDevices.ForModel(model);
        if (device is null) found.Add($"manifest: unknown Device.Model {model}");
        if (Str(top["Name"]) is not { Length: > 0 }) found.Add("manifest: Name required");
        var pagesObj = top["Pages"] as JsonObject;
        var pageIds = (pagesObj?["Pages"] as JsonArray)?.Select(Str).ToList() ?? [];
        var defaultId = Str(pagesObj?["Default"]);
        var current = Str(pagesObj?["Current"]);
        if (pageIds.Count == 0) found.Add("manifest: Pages.Pages must list at least one page");
        if (defaultId is null || !AnyUuid().IsMatch(defaultId)) found.Add("manifest: Pages.Default must be a page UUID");
        if (current is null || (current != ProfileGenerator.NilUuid && !pageIds.Contains(current))) found.Add("manifest: Pages.Current must be the nil UUID or one of Pages.Pages");

        var plugins = new HashSet<string>(StringComparer.Ordinal);
        var actionIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in pageIds.Append(defaultId).Where(i => i is not null).Distinct())
        {
            if (!AnyUuid().IsMatch(id!)) { found.Add($"page id {id} is not a UUID"); continue; }
            var isDefault = id == defaultId;
            var dir = $"{root}Profiles/{id!.ToUpperInvariant()}/";
            var page = Json(dir + "manifest.json");
            if (page is null) continue;
            if (page["Controllers"] is not JsonArray controllers) { found.Add($"page {id}: Controllers must be an array"); continue; }
            if (!page.ContainsKey("Name") || !page.ContainsKey("Icon")) found.Add($"page {id}: Name and Icon are required (\"\" when unset)");
            var types = new List<string>();
            foreach (var c in controllers.OfType<JsonObject>())
            {
                var type = Str(c["Type"]) ?? "";
                types.Add(type);
                if (type is not ("Keypad" or "Encoder")) { found.Add($"page {id}: unexpected controller {type}"); continue; }
                if (type == "Encoder" && device is { HasDials: false }) found.Add($"page {id}: the {device.Name} has no dials");
                if (c["Actions"] is null)
                {
                    if (!isDefault) found.Add($"page {id} {type}: Actions is null (only the Default page has null actions)");
                    continue;
                }
                if (isDefault) found.Add($"page {id} (Default) {type}: the Default page carries no actions");
                if (c["Actions"] is not JsonObject actions) { found.Add($"page {id} {type}: Actions must be an object"); continue; }
                if (type == "Encoder" && device is { Layers: > 1 })
                {
                    if (c["Routers"] is not JsonObject routers) found.Add($"page {id}: the Galleon's encoders need Routers");
                    else foreach (var (k, v) in routers)
                            if (!CoordPattern().IsMatch(k) || Str(v) is not { } rv || !CoordPattern().IsMatch(rv)) found.Add($"page {id}: bad router {k}");
                }
                foreach (var (coord, node) in actions)
                {
                    var where = $"page {id} {type} {coord}";
                    var m = CoordPattern().Match(coord);
                    if (!m.Success) { found.Add($"{where}: bad coordinate"); continue; }
                    var slot = new ProfileSlot(type == "Keypad", int.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture), int.Parse(m.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture));
                    if (device is not null && !device.Contains(slot)) found.Add($"{where}: outside the {device.Name}");
                    if (node is not JsonObject a) { found.Add($"{where}: the action must be an object"); continue; }
                    foreach (var f in ActionFields) if (!a.ContainsKey(f)) found.Add($"{where}: missing {f}");
                    var actionId = Str(a["ActionID"]);
                    if (actionId is null || !AnyUuid().IsMatch(actionId)) found.Add($"{where}: ActionID must be a UUID");
                    else if (!actionIds.Add(actionId)) found.Add($"{where}: ActionID {actionId} is used twice");
                    if (a["Plugin"] is not JsonObject plugin || Str(plugin["UUID"]) is not { } pu || Str(plugin["Name"]) is null || Str(plugin["Version"]) is null)
                        found.Add($"{where}: Plugin must be {{ Name, UUID, Version }}");
                    else plugins.Add(pu);
                    if (a["Settings"] is not JsonObject) found.Add($"{where}: Settings must be an object");
                    if (Int(a["State"]) != 0) found.Add($"{where}: State must be 0");
                    if (a["States"] is not JsonArray states || states.Count == 0) found.Add($"{where}: States must be a non-empty array");
                    else if (states.OfType<JsonObject>().Any(s => s.ContainsKey("Image"))) found.Add($"{where}: a state image would block the plugin's setImage");
                    var uuid = Str(a["UUID"]);
                    if (uuid is null || !PinCatalog.KnownUuids.Contains(uuid)) { found.Add($"{where}: unknown action {uuid}"); continue; }
                    if (Str(a["Plugin"]?["UUID"]) != PinCatalog.PluginUuid) found.Add($"{where}: {uuid} belongs to {PinCatalog.PluginUuid}");
                    if (uuid == PinCatalog.SmartKeyUuid && !slot.IsKey && !IsLock(a)) found.Add($"{where}: a Smart Key on a dial");
                    if (uuid == PinCatalog.SmartDialUuid && slot.IsKey) found.Add($"{where}: a Smart Dial on a key");
                    var pinned = PinCatalog.All.FirstOrDefault(p => p.Uuid == uuid && p.Uuid != PinCatalog.SmartKeyUuid);
                    if (pinned is not null && !pinned.Supports(slot)) found.Add($"{where}: {pinned.ActionName} can't run on a {(slot.IsKey ? "key" : "dial")}");
                    if (uuid == PinCatalog.SmartKeyUuid && IsLock(a) && !slot.IsKey) found.Add($"{where}: a lock key must be a key");
                }
            }
            if (!types.Contains("Keypad")) found.Add($"page {id}: no Keypad controller");
            if (device is { HasDials: true } && !types.Contains("Encoder")) found.Add($"page {id}: no Encoder controller");
        }
        if (pkg?["RequiredPlugins"] is JsonArray req)
            foreach (var p in plugins)
                if (!req.Any(x => Str(x) == p)) found.Add($"package.json: RequiredPlugins misses {p}");
        return found;
    }

    private static bool IsLock(JsonObject a) => Str(a["Settings"]?["role"]) == "lock";

    /// <summary>The ZIP's entries (directories map to null). Rejects path tricks (absolute, "..", backslashes).</summary>
    public static Dictionary<string, byte[]?> Read(byte[] zip, List<string>? problems = null)
    {
        var map = new Dictionary<string, byte[]?>(StringComparer.Ordinal);
        using var ms = new MemoryStream(zip, writable: false);
        using var archive = new ZipArchive(ms, ZipArchiveMode.Read);
        foreach (var e in archive.Entries)
        {
            var n = e.FullName;
            if (n.Contains('\\') || n.StartsWith('/') || n.Split('/').Contains("..") || n.Contains(':')) { problems?.Add($"zip: bad entry name {n}"); continue; }
            if (e.Length > 4 * 1024 * 1024) { problems?.Add($"zip: {n} is too large"); continue; }
            if (n.EndsWith('/')) { map[n] = null; continue; }
            using var s = e.Open();
            using var buf = new MemoryStream();
            s.CopyTo(buf);
            map[n] = buf.ToArray();
        }
        return map;
    }

    private static string? Str(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
    private static int? Int(JsonNode? n) => n is JsonValue v && v.TryGetValue<int>(out var i) ? i : null;
}
