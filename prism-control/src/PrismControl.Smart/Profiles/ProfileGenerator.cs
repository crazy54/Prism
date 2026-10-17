using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PrismControl.Smart.Profiles;

/// <summary>A generated <c>.streamDeckProfile</c>: the ZIP bytes plus what is inside (for the PI, the tests and previews).</summary>
public sealed record GeneratedProfile(
    ProfileSetup Setup,
    byte[] Zip,
    string ProfileId,
    string PageId,
    string DefaultPageId,
    JsonObject Package,
    JsonObject Manifest,
    JsonObject Page,
    IReadOnlyList<string> Entries)
{
    public ProfileDevice Device => Setup.Device;
    public string Name => Setup.Device.ProfileName;
    public int SmartKeys => Setup.SmartKeys.Count;
    public int SmartDials => Setup.SmartDials.Count;
}

/// <summary>
/// Writes the one profile, "Prism Smart · &lt;device&gt;", as a Stream Deck 7 export (<c>FormatVersion 1</c>,
/// ProfilesV3 inside; formats.md §5.2–§5.4). The structure is the one the hardware lab installed and switched on the
/// owner's Galleon 100 SD and Stream Deck + (aaa-prism-ds/hardware-lab RESULTS.md §1–§2: willAppear arrived for every
/// key and widget) and that Prism Deck's exporter ships:
/// <list type="bullet">
/// <item><c>package.json</c> (DeviceModel, FormatVersion 1, RequiredPlugins = Prism Control);</item>
/// <item><c>Profiles/&lt;UUID&gt;.sdProfile/manifest.json</c> (Version "3.0", Pages.Current = the nil UUID, a Default page);</item>
/// <item>one page: every slot either a pinned Prism Control action (Audio by UUID) or a Smart Key / Smart Dial; coordinates
/// "column,row" for keys and "dial,layer" for encoders, with the Galleon's <c>Routers</c>;</item>
/// <item>the Default page with <c>Actions: null</c> per controller.</item>
/// </list>
/// Actions carry <c>States: [{}]</c>: no profile image, because a user-set image would block the plugin's setImage.
/// Ids are derived from <c>seed</c> (SHA-1, v4-shaped), so a bundled profile is byte-for-byte reproducible.
/// </summary>
public static class ProfileGenerator
{
    public const string AppVersion = "7.6.0.23012";
    public const string OsVersion = "10.0.26300";
    public const string NilUuid = "00000000-0000-0000-0000-000000000000";
    public const string PageName = "Prism Smart";
    public static readonly DateTimeOffset EntryTime = new(2026, 10, 17, 12, 0, 0, TimeSpan.Zero);

    private static readonly JsonSerializerOptions Compact = new() { WriteIndented = false, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>The plugin version written into each action's <c>Plugin.Version</c> (the manifest's x.y.z.w).</summary>
    public static string DefaultPluginVersion
    {
        get
        {
            var v = typeof(ProfileGenerator).Assembly.GetName().Version ?? new Version(0, 1, 0, 0);
            return $"{Math.Max(0, v.Major)}.{Math.Max(0, v.Minor)}.{Math.Max(0, v.Build)}.{Math.Max(0, v.Revision)}";
        }
    }

    /// <summary>Deterministic v4-shaped UUID from a seed.</summary>
    public static string DetUuid(string seed)
    {
        var h = SHA1.HashData(Encoding.UTF8.GetBytes("prism-control-smart:" + seed));
        h[6] = (byte)((h[6] & 0x0f) | 0x40);
        h[8] = (byte)((h[8] & 0x3f) | 0x80);
        var x = Convert.ToHexString(h, 0, 16).ToLowerInvariant();
        return $"{x[..8]}-{x[8..12]}-{x[12..16]}-{x[16..20]}-{x[20..32]}";
    }

    /// <param name="seed">Same seed + same setup = same bytes. The wizard passes a fresh seed per profile it creates.</param>
    public static GeneratedProfile Build(ProfileSetup setup, string? pluginVersion = null, string? seed = null)
    {
        var d = setup.Device;
        var version = pluginVersion ?? DefaultPluginVersion;
        var basis = seed ?? "bundled:" + d.Kind;
        var profileId = DetUuid(basis + ":profile").ToUpperInvariant();
        var pageId = DetUuid(basis + ":page:0");
        var defaultId = DetUuid(basis + ":default");

        var keypad = new JsonObject();
        var encoders = new JsonObject();
        foreach (var slot in d.AllSlots())
        {
            var pin = setup.PinAt(slot);
            var action = pin is null
                ? ActionObject(DetUuid($"{basis}:{slot}"), slot.IsKey ? PinCatalog.SmartKeyName : PinCatalog.SmartDialName,
                    slot.IsKey ? PinCatalog.SmartKeyUuid : PinCatalog.SmartDialUuid, [], version)
                : ActionObject(DetUuid($"{basis}:{slot}"), pin.Action.ActionName, pin.Action.Uuid, pin.Action.Settings(pin.App), version);
            (slot.IsKey ? keypad : encoders)[slot.Coordinate] = action;
        }

        var controllers = new JsonArray { new JsonObject { ["Actions"] = keypad, ["Type"] = "Keypad" } };
        if (d.HasDials)
        {
            var enc = new JsonObject { ["Actions"] = encoders };
            // The Galleon's per-dial active-layer map (its own profiles and the lab's: both dials start on layer 0).
            if (d.Layers > 1) enc["Routers"] = new JsonObject([.. Enumerable.Range(0, d.Dials).Select(i => KeyValuePair.Create($"{i},0", (JsonNode?)$"{i},0"))]);
            enc["Type"] = "Encoder";
            controllers.Add(enc);
        }
        var page = new JsonObject { ["Controllers"] = controllers, ["Icon"] = "", ["Name"] = PageName };
        var defaultControllers = new JsonArray { new JsonObject { ["Actions"] = null, ["Type"] = "Keypad" } };
        if (d.HasDials) defaultControllers.Add(new JsonObject { ["Actions"] = null, ["Type"] = "Encoder" });
        var defaultPage = new JsonObject { ["Controllers"] = defaultControllers, ["Icon"] = "", ["Name"] = "" };

        var manifest = new JsonObject
        {
            ["Device"] = new JsonObject { ["Model"] = d.Model, ["UUID"] = DetUuid(basis + ":device") },
            ["Name"] = d.ProfileName,
            ["Pages"] = new JsonObject { ["Current"] = NilUuid, ["Default"] = defaultId, ["Pages"] = new JsonArray(pageId) },
            ["Version"] = "3.0",
        };
        var package = new JsonObject
        {
            ["AppVersion"] = AppVersion,
            ["DeviceModel"] = d.Model,
            ["DeviceSettings"] = null,
            ["FormatVersion"] = 1,
            ["OSType"] = "Windows",
            ["OSVersion"] = OsVersion,
            ["RequiredPlugins"] = new JsonArray(PinCatalog.PluginUuid),
        };

        var root = $"Profiles/{profileId}.sdProfile/";
        var pageDir = $"{root}Profiles/{pageId.ToUpperInvariant()}/";
        var defaultDir = $"{root}Profiles/{defaultId.ToUpperInvariant()}/";
        var files = new List<(string Name, byte[]? Data)>
        {
            ("package.json", Json(package)),
            ("Profiles/", null),
            (root, null),
            (root + "manifest.json", Json(manifest)),
            (root + "Profiles/", null),
            (pageDir, null),
            (pageDir + "Images/", null),
            (pageDir + "manifest.json", Json(page)),
            (defaultDir, null),
            (defaultDir + "Images/", null),
            (defaultDir + "manifest.json", Json(defaultPage)),
        };
        return new GeneratedProfile(setup, Zip(files), profileId, pageId, defaultId, package, manifest, page, [.. files.Select(f => f.Name)]);
    }

    /// <summary>An action instance, keys in the app's (alphabetical) order.</summary>
    private static JsonObject ActionObject(string actionId, string name, string uuid, JsonObject settings, string version) => new()
    {
        ["ActionID"] = actionId,
        ["LinkedTitle"] = true,
        ["Name"] = name,
        ["Plugin"] = new JsonObject { ["Name"] = PinCatalog.PluginName, ["UUID"] = PinCatalog.PluginUuid, ["Version"] = version },
        ["Resources"] = null,
        ["Settings"] = settings,
        ["State"] = 0,
        ["States"] = new JsonArray(new JsonObject()),
        ["UUID"] = uuid,
    };

    public static byte[] Json(JsonNode node) => Encoding.UTF8.GetBytes(node.ToJsonString(Compact));

    /// <summary>A plain ZIP: forward slashes, explicit directory entries, a fixed time stamp, deflate.</summary>
    private static byte[] Zip(IEnumerable<(string Name, byte[]? Data)> files)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true, entryNameEncoding: Encoding.UTF8))
        {
            foreach (var (name, data) in files)
            {
                var e = zip.CreateEntry(name, data is null ? CompressionLevel.NoCompression : CompressionLevel.Optimal);
                e.LastWriteTime = EntryTime;
                if (data is null) continue;
                using var s = e.Open();
                s.Write(data);
            }
        }
        return ms.ToArray();
    }
}
