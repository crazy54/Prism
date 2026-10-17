using System.Text.Json;
using System.Text.Json.Nodes;
using PrismControl.Core.Actions;
using PrismControl.Core.Layouts;
using PrismControl.Hosting;
using PrismControl.Testing;
using PrismControl.Tools;

namespace PrismControl.Tests;

// Deliberately broken actions, discovered only by the registry tests below (not by the plugin).
[StreamDeckAction("com.example.wrongprefix", Name = "Bad prefix")]
public sealed class BadPrefixAction : KeyAction;

[StreamDeckAction("com.jeremyfhall.prismcontrol.test.key-on-encoder", Name = "Key on encoder", Controllers = Controllers.Encoder)]
public sealed class KeyOnEncoderAction : KeyAction;

[StreamDeckAction("com.jeremyfhall.prismcontrol.test.dup", Name = "Dup A")]
public sealed class DupA : KeyAction;

[StreamDeckAction("com.jeremyfhall.prismcontrol.test.dup", Name = "Dup B")]
public sealed class DupB : KeyAction;

[StreamDeckAction("com.jeremyfhall.prismcontrol.test.bad-layout", Name = "Bad layout", Controllers = Controllers.Encoder, Layout = "$Z9", Icon = "imgs/x.png")]
public sealed class BadLayoutAction : DialAction;

public static class Repo
{
    public static string Root { get; } = Find();

    // The test exe usually sits under the repo (bin/); with --artifacts-path it sits elsewhere, so the working directory
    // (run from prism-control/) is the second place to look.
    private static string Find()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
            for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        throw new InvalidOperationException($"PrismControl.sln not found above {AppContext.BaseDirectory} or {Directory.GetCurrentDirectory()} (run from prism-control/).");
    }

    /// <summary>Builds a plugin folder from the repo's assets/layouts/pi plus each domain's src/*/plugin overlay (no exe), as Packer does, for manifest file checks.</summary>
    public static string StagePluginFolder(JsonObject manifest)
    {
        var dir = Path.Combine(Path.GetTempPath(), "prismcontrol-stage-" + Guid.NewGuid().ToString("N")[..8], "com.jeremyfhall.prismcontrol.sdPlugin");
        Copy(Path.Combine(Root, "assets", "imgs"), Path.Combine(dir, "imgs"));
        Copy(Path.Combine(Root, "layouts"), Path.Combine(dir, "layouts"));
        Copy(Path.Combine(Root, "pi"), Path.Combine(dir, "pi"));
        foreach (var project in Directory.EnumerateDirectories(Path.Combine(Root, "src")).Order(StringComparer.Ordinal))
            foreach (var sub in new[] { "layouts", "pi", "imgs" })
                Copy(Path.Combine(project, "plugin", sub), Path.Combine(dir, sub));
        Directory.CreateDirectory(Path.Combine(dir, "bin"));
        File.WriteAllText(Path.Combine(dir, "bin", "PrismControl.exe"), "stub");
        File.WriteAllText(Path.Combine(dir, "manifest.json"), manifest.ToJsonString());
        return dir;
    }

    private static void Copy(string from, string to)
    {
        if (!Directory.Exists(from)) return;
        foreach (var f in Directory.EnumerateFiles(from, "*", SearchOption.AllDirectories))
        {
            var dest = Path.Combine(to, Path.GetRelativePath(from, f));
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Copy(f, dest, true);
        }
    }
}

public class ManifestTests
{
    private static ActionRegistry Shipped(out List<string> errors, out IReadOnlyList<ModuleDescriptor> modules)
    {
        errors = [];
        modules = ModuleLoader.Load(Core.Hosting.NullLog.Instance, errors);
        return ActionRegistry.Discover(modules.Select(m => m.Assembly).Append(typeof(PluginInfo).Assembly), errors, []);
    }

    [Test]
    public void Module_assemblies_come_from_project_references()
    {
        var names = ModuleLoader.ModuleAssemblyNames();
        foreach (var n in new[] { "PrismControl.Audio", "PrismControl.SystemInfo", "PrismControl.Spotify", "PrismControl.Eq", "PrismControl.Macros", "PrismControl.Cooling",
                                  "PrismControl.Browser", "PrismControl.WinShell", "PrismControl.Ai", "PrismControl.Smart", "PrismControl.Sight" })
            Assert.True(names.Contains(n), $"{n} missing from {string.Join(",", names)}");
        Assert.False(names.Contains("PrismControl.Core"));
        // Desktop is a shared library (it flows in through the modules) and PrismRelay a separate exe: never modules.
        Assert.False(names.Contains("PrismControl.Desktop"), "PrismControl.Desktop is a library (a transitive reference), never a module");
        Assert.False(names.Contains("PrismRelay"), "PrismRelay must not be a ProjectReference of the exe");
    }

    [Test]
    public void Shipped_actions_are_discovered_without_errors()
    {
        var registry = Shipped(out var errors, out _);
        Assert.Empty(errors);
        Assert.True(registry.Actions.All(a => a.Uuid.StartsWith("com.jeremyfhall.prismcontrol.", StringComparison.Ordinal)));
        Assert.NotNull(registry.Find("com.jeremyfhall.prismcontrol.core.diagnostics"));
        Assert.True(registry.Create("com.jeremyfhall.prismcontrol.eq.sample-band") is DialAction<Eq.SampleBandSettings>);
    }

    [Test]
    public void Discovery_rejects_broken_attributes()
    {
        var errors = new List<string>();
        var registry = ActionRegistry.Discover([typeof(ManifestTests).Assembly], errors, []);
        var all = string.Join("\n", errors);
        Assert.Contains("BadPrefixAction", all);
        Assert.Contains("Encoder actions must derive DialAction", all);
        Assert.Contains("duplicate UUID", all);
        Assert.Contains("$Z9", all);
        Assert.Contains("must omit the file extension", all);
        Assert.Null(registry.Find("com.example.wrongprefix"));
    }

    [Test]
    public void Generated_manifest_validates_against_the_elgato_schema_and_files()
    {
        var registry = Shipped(out _, out var modules);
        var manifest = ManifestBuilder.Build(registry, modules, "1.2.3.4");
        Assert.Equal("bin/PrismControl.exe", manifest["CodePathWin"]!.GetValue<string>());
        Assert.Equal("bin/PrismControl.exe", manifest["CodePath"]!.GetValue<string>());
        Assert.Equal(3, manifest["SDKVersion"]!.GetValue<int>());
        Assert.Equal("windows", manifest["OS"]![0]!["Platform"]!.GetValue<string>());
        Assert.Null(manifest["Nodejs"]);
        var monitored = manifest["ApplicationsToMonitor"]!["windows"]!.AsArray().Select(n => n!.GetValue<string>()).ToList();
        Assert.True(monitored.Contains("Spotify.exe"), "ApplicationsToMonitor: " + string.Join(",", monitored)); // Browser and Sight add theirs (sorted)
        var dir = Repo.StagePluginFolder(manifest);
        try
        {
            var problems = PluginValidator.ValidatePlugin(dir);
            Assert.Empty(problems, "manifest/plugin problems");
        }
        finally { Directory.Delete(Path.GetDirectoryName(dir)!, true); }
    }

    [Test]
    public void Schema_validator_rejects_what_elgato_rejects()
    {
        var registry = Shipped(out _, out var modules);
        JsonElement Mutate(Action<JsonObject> change)
        {
            var m = ManifestBuilder.Build(registry, modules, "1.0.0.0");
            change(m);
            return JsonDocument.Parse(m.ToJsonString()).RootElement;
        }
        Assert.Empty(PluginValidator.ValidateManifest(Mutate(_ => { }), null));
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m["UUID"] = "Com.Bad_UUID"), null).Count > 0, "bad UUID accepted");
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m.Remove("CodePath")), null).Count > 0, "missing CodePath accepted");
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m["Version"] = "1.0"), null).Count > 0, "3-part version accepted");
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m["Software"] = new JsonObject { ["MinimumVersion"] = "9.9" }), null).Count > 0, "Software 9.9 accepted");
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m["Bogus"] = 1), null).Count > 0, "unknown property accepted");
        Assert.True(PluginValidator.ValidateManifest(Mutate(m => m["Actions"]![0]!["Encoder"] = new JsonObject { ["layout"] = "$Z9" }), null).Count > 0, "bad layout accepted");
    }

    [Test]
    public void Elgato_reference_manifest_is_accepted()
    {
        var path = Path.Combine(Repo.Root, "..", "..", "aaa-prism-ds", "handoff-from-prism-e0", "research", "schemas", "examples", "prism-deck-minimal", "com.prismdeck.demo.sdPlugin", "manifest.json");
        if (!File.Exists(path)) Assert.Skip("research example not present on this machine");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        Assert.Empty(PluginValidator.ValidateManifest(doc.RootElement, null));
    }

    [Test]
    public void Shipped_layouts_are_valid_and_match_the_catalog()
    {
        foreach (var rel in Layouts.Shipped)
        {
            var file = Path.Combine(Repo.Root, rel);
            Assert.True(File.Exists(file), rel);
            Assert.Empty(PluginValidator.ValidateLayoutFile(file), rel);
        }
        string Keys(string rel) => string.Join(",", JsonNode.Parse(File.ReadAllText(Path.Combine(Repo.Root, rel)))!["items"]!.AsArray().Select(i => i!["key"]!.GetValue<string>()));
        Assert.Equal("canvas", Keys(Layouts.Canvas.Path));
        Assert.Equal("bg,label,value,bar", Keys(Layouts.Value.Path));
        Assert.Equal("bg,art,line1,line2,progress", Keys(Layouts.Media.Path));
        Assert.Equal("bg,label,bar_a,bar_b", Keys(Layouts.Dual.Path));
    }

    [Test]
    public void Layout_geometry_rules_catch_overlap_and_overflow()
    {
        var overlap = JsonDocument.Parse("""{"id":"x","items":[{"key":"a","type":"text","rect":[0,0,100,50]},{"key":"b","type":"text","rect":[50,25,100,50]}]}""").RootElement;
        Assert.Contains("overlap", string.Join(";", PluginValidator.ValidateLayout(overlap)));
        var overflow = JsonDocument.Parse("""{"id":"x","items":[{"key":"a","type":"pixmap","rect":[150,0,100,100]}]}""").RootElement;
        Assert.Contains("leaves the 200x100 canvas", string.Join(";", PluginValidator.ValidateLayout(overflow)));
        var dupe = JsonDocument.Parse("""{"id":"x","items":[{"key":"a","type":"pixmap","rect":[0,0,10,10]},{"key":"a","type":"pixmap","rect":[0,0,10,10],"zOrder":1}]}""").RootElement;
        Assert.Contains("duplicate item key", string.Join(";", PluginValidator.ValidateLayout(dupe)));
        var badOpacity = JsonDocument.Parse("""{"id":"x","items":[{"key":"a","type":"pixmap","rect":[0,0,10,10],"opacity":0.55}]}""").RootElement;
        Assert.True(PluginValidator.ValidateLayout(badOpacity).Count > 0, "opacity 0.55 accepted");
    }

    [Test]
    public void Tokens_are_in_sync_with_tokens_json()
    {
        var tokens = Environment.GetEnvironmentVariable("PRISM_TOKENS_JSON") ?? Path.Combine(Repo.Root, TokensGen.TokensGenerator.DefaultTokensPath);
        if (!File.Exists(tokens)) Assert.Skip("tokens.json not found (set PRISM_TOKENS_JSON)");
        var expected = TokensGen.TokensGenerator.Generate(File.ReadAllText(tokens));
        var actual = File.ReadAllText(Path.Combine(Repo.Root, TokensGen.TokensGenerator.OutputPath)).Replace("\r\n", "\n");
        Assert.True(expected == actual, "Refraction.g.cs is stale: run dotnet run --project tools/PrismControl.TokensGen");
    }
}
