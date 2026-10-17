using System.Text.Json.Nodes;

namespace PrismControl.Smart.Profiles;

/// <summary>
/// The plugin-bundled copies of the one profile (one per device, the default pins), for the lead's packing step:
/// <c>&lt;plugin&gt;/profiles/prism-smart-&lt;device&gt;.streamDeckProfile</c> plus the manifest <c>Profiles</c> entries.
/// The app installs bundled profiles only after the user accepts its second dialog (RESULTS.md §1), and with
/// <c>DontAutoSwitchWhenInstalled</c> the decks stay on the user's own profile until the user switches.
/// </summary>
public static class BundledProfiles
{
    public static IReadOnlyList<GeneratedProfile> Build(string? pluginVersion = null) =>
        [.. ProfileDevices.All.Select(d => ProfileGenerator.Build(ProfileSetup.Default(d), pluginVersion, "bundled:" + d.Kind))];

    /// <summary>The manifest's <c>Profiles</c> array (Elgato manifest schema: Name, DeviceType 0–13, the three flags).</summary>
    public static JsonArray ManifestEntries() => new([.. ProfileDevices.All.Select(d => (JsonNode)new JsonObject
    {
        ["Name"] = d.BundledName,
        ["DeviceType"] = d.DeviceType,
        ["AutoInstall"] = true,
        ["DontAutoSwitchWhenInstalled"] = true,
        ["Readonly"] = false,
    })]);

    /// <summary>
    /// Writes <c>&lt;dir&gt;/prism-smart-&lt;device&gt;.streamDeckProfile</c> for every device plus
    /// <c>&lt;dir&gt;/profiles.manifest.json</c> (<c>{ "Profiles": [...] }</c>). Returns the files written.
    /// </summary>
    public static IReadOnlyList<string> Write(string dir, string? pluginVersion = null)
    {
        Directory.CreateDirectory(dir);
        var written = new List<string>();
        foreach (var p in Build(pluginVersion))
        {
            var problems = ProfileChecker.Check(p.Zip);
            if (problems.Count > 0) throw new InvalidOperationException($"{p.Name}: {string.Join("; ", problems)}");
            var file = Path.Combine(dir, Path.GetFileName(p.Device.BundledName) + ".streamDeckProfile");
            File.WriteAllBytes(file, p.Zip);
            written.Add(file);
        }
        var manifest = Path.Combine(dir, "profiles.manifest.json");
        File.WriteAllText(manifest, new JsonObject { ["Profiles"] = ManifestEntries() }.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }) + "\n");
        written.Add(manifest);
        return written;
    }
}

/// <summary>What "Create profile" did.</summary>
public sealed record WizardResult(bool Ok, bool Written, string? Path, string? DisplayPath, string Message, IReadOnlyList<string> Problems, GeneratedProfile? Profile);

/// <summary>
/// The setup wizard's back end (the Smart PI's "Your one profile" section): validates the user's choices, generates the
/// profile, checks it, and writes it to a folder the user can see (Documents\Prism\Profiles). It NEVER installs the
/// profile (never opens it, never touches %APPDATA%\Elgato): the user double-clicks the file. In safe mode nothing is
/// written.
/// </summary>
public sealed class ProfileWizard(string outputDirectory, bool safeMode, TimeProvider time)
{
    public static string DefaultOutputDirectory => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Prism", "Profiles");

    public string OutputDirectory => outputDirectory;

    /// <summary>The path as shown in the PI: relative to the user's home ("Documents\Prism\Profiles\…"), never the user name.</summary>
    public static string Display(string path)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return !string.IsNullOrEmpty(home) && path.StartsWith(home + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            ? path[(home.Length + 1)..]
            : System.IO.Path.GetFileName(path);
    }

    /// <summary>What the PI needs to draw the wizard: devices, the action catalog, the defaults, where files go.</summary>
    public object Describe(string? currentDeviceKind) => new
    {
        current = ProfileDevices.Find(currentDeviceKind)?.Kind ?? ProfileDevices.Galleon.Kind,
        devices = ProfileDevices.All.Select(d => new { kind = d.Kind, name = d.Name, columns = d.Columns, rows = d.Rows, dials = d.Dials, layers = d.Layers, file = d.FileName }),
        actions = PinCatalog.All.Select(a => new
        {
            id = a.Id, label = a.Label, description = a.Description, uuid = a.Uuid, needsApp = a.NeedsApp,
            key = a.Controllers.HasFlag(SlotControllers.Key), dial = a.Controllers.HasFlag(SlotControllers.Dial),
        }),
        defaults = ProfileDevices.All.ToDictionary(d => d.Kind, d => ProfileSetup.Default(d).ToJson()),
        folder = Display(outputDirectory),
        safeMode,
    };

    public WizardResult Create(JsonNode? setupJson)
    {
        var problems = new List<string>();
        var setup = ProfileSetup.Parse(setupJson, problems);
        if (setup is null || problems.Count > 0) return new(false, false, null, null, "Fix the setup first.", problems, null);
        // A fresh seed per created profile: importing two setups for the same device gives two profiles, never a clash.
        var seed = $"wizard:{setup.Device.Kind}:{time.GetUtcNow().ToUnixTimeMilliseconds()}:{Guid.NewGuid():N}";
        var profile = ProfileGenerator.Build(setup, seed: seed);
        var check = ProfileChecker.Check(profile.Zip);
        if (check.Count > 0) return new(false, false, null, null, "The generated profile failed its own check; nothing was written.", check, profile);
        var path = System.IO.Path.Combine(outputDirectory, setup.Device.FileName);
        if (safeMode)
            return new(true, false, path, Display(path), "Safe mode: the profile was generated and checked, but not written.", [], profile);
        Directory.CreateDirectory(outputDirectory);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, profile.Zip);
        File.Move(tmp, path, overwrite: true);
        var msg = $"Saved {Display(path)}. Double-click it to import \"{setup.Device.ProfileName}\" into the Stream Deck app " +
                  $"({profile.SmartKeys} Smart Keys{(profile.SmartDials > 0 ? $", {profile.SmartDials} Smart Dials" : "")}). Prism never installs it for you.";
        return new(true, true, path, Display(path), msg, [], profile);
    }
}
