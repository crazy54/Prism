using System.Reflection;
using System.Text.RegularExpressions;
using PrismControl.Core.Actions;
using PrismControl.Macros.Actions;
using PrismControl.Macros.Engine;
using PrismControl.Testing;

namespace PrismControl.Macros.Tests;

public class MetadataTests
{
    private static readonly Type[] ActionTypes = typeof(MacrosModule).Assembly.GetTypes()
        .Where(t => t.GetCustomAttribute<StreamDeckActionAttribute>() is not null).ToArray();

    [Test]
    public void Actions_follow_the_discovery_rules()
    {
        var uuids = ActionTypes.Select(t => t.GetCustomAttribute<StreamDeckActionAttribute>()!.Uuid).Order().ToList();
        Assert.Equal(string.Join(",", new[] { "dial", "hotkey", "launch", "macro", "media", "sample-counter", "type-text" }.Select(x => "com.jeremyfhall.prismcontrol.macros." + x)),
            string.Join(",", uuids));
        foreach (var t in ActionTypes)
        {
            var a = t.GetCustomAttribute<StreamDeckActionAttribute>()!;
            Assert.True(Regex.IsMatch(a.Uuid, "^com\\.jeremyfhall\\.prismcontrol\\.macros\\.[a-z0-9-]+$"), a.Uuid);
            Assert.True(a.Name.Length is > 0 and <= 30, a.Uuid + " name");
            Assert.False(t.IsAbstract, a.Uuid);
            Assert.NotNull(t.GetConstructor(Type.EmptyTypes), a.Uuid + " needs a parameterless constructor");
            if (a.Controllers.HasFlag(Controllers.Encoder)) Assert.True(Derives(t, typeof(DialAction<>)), a.Uuid + " must derive DialAction<T>");
            else Assert.True(Derives(t, typeof(KeyAction<>)), a.Uuid + " must derive KeyAction<T>");
            _ = Activator.CreateInstance(t); // constructing does no work and needs nothing
        }
    }

    [Test]
    public void Icons_follow_the_designers_paths_and_exist()
    {
        // The designer's set: imgs/actions/macros/<id>/icon + key (+ dial for encoders). The hidden sample keeps the defaults.
        var plugin = Path.Combine(RepoRoot(), "src", "PrismControl.Macros", "plugin");
        foreach (var t in ActionTypes)
        {
            var a = t.GetCustomAttribute<StreamDeckActionAttribute>()!;
            var id = a.Uuid["com.jeremyfhall.prismcontrol.macros.".Length..];
            if (!a.VisibleInActionsList)
            {
                Assert.Null(a.Icon, a.Uuid);
                continue;
            }
            var dir = $"imgs/actions/macros/{id}/";
            Assert.Equal(dir + "icon", a.Icon, a.Uuid);
            Assert.Equal(dir + "key", a.KeyImage, a.Uuid);
            if (a.Controllers.HasFlag(Controllers.Encoder)) Assert.Equal(dir + "dial", a.EncoderIcon, a.Uuid);
            foreach (var image in new[] { a.Icon, a.KeyImage, a.EncoderIcon }.OfType<string>())
            {
                var file = Path.Combine(plugin, image.Replace('/', Path.DirectorySeparatorChar));
                Assert.True(File.Exists(file + ".svg") || File.Exists(file + ".png"), $"{a.Uuid}: {image}.svg/.png is missing under plugin/");
            }
        }
    }

    [Test]
    public void Custom_property_inspector_pages_exist_and_are_offline()
    {
        var plugin = Path.Combine(RepoRoot(), "src", "PrismControl.Macros", "plugin");
        foreach (var page in ActionTypes.Select(t => t.GetCustomAttribute<StreamDeckActionAttribute>()!.PropertyInspector).OfType<string>().Distinct())
        {
            var file = Path.Combine(plugin, page.Replace('/', Path.DirectorySeparatorChar));
            Assert.True(File.Exists(file), page + " is missing under plugin/");
            var html = File.ReadAllText(file);
            foreach (Match m in Regex.Matches(html, "(?:src|href)\\s*=\\s*\"([^\"]+)\""))
                Assert.False(Regex.IsMatch(m.Groups[1].Value, "^(?:[a-z]+:)?//", RegexOptions.IgnoreCase), $"{page} loads an external resource: {m.Groups[1].Value}");
            Assert.DoesNotContain("@import", html);
            Assert.Contains("lib/prism-pi.js", html);
            Assert.Contains("macros.catalog", html);
        }
    }

    [Test]
    public void The_sample_counter_keeps_its_uuid()
    {
        Assert.Equal("com.jeremyfhall.prismcontrol.macros.sample-counter", typeof(SampleCounterKey).GetCustomAttribute<StreamDeckActionAttribute>()!.Uuid);
    }

    [Test]
    public void The_module_registers_as_macros()
    {
        var attr = typeof(MacrosModule).Assembly.GetCustomAttribute<Core.Hosting.PrismModuleAttribute>()!;
        Assert.Equal(typeof(MacrosModule), attr.ModuleType);
        Assert.Equal("macros", new MacrosModule().Name);
        Assert.Equal("PRISM_CONTROL_MACROS_DRY_RUN", MacrosModule.DryRunVariable);
    }

    private static bool Derives(Type t, Type generic)
    {
        for (var c = t.BaseType; c is not null; c = c.BaseType)
            if (c.IsGenericType && c.GetGenericTypeDefinition() == generic) return true;
        return false;
    }

    /// <summary>
    /// The prism-control folder. The test exe usually sits under the repo (bin/); built with --artifacts-path it sits
    /// elsewhere, so the working directory (run from prism-control/) and this source file's folder are searched too.
    /// </summary>
    internal static string RepoRoot([System.Runtime.CompilerServices.CallerFilePath] string sourceFile = "")
    {
        var starts = new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory(), Path.GetDirectoryName(sourceFile) ?? "" };
        foreach (var start in starts.Where(s => s.Length > 0))
            for (var d = new DirectoryInfo(start); d is not null; d = d.Parent)
                if (File.Exists(Path.Combine(d.FullName, "PrismControl.sln"))) return d.FullName;
        throw new InvalidOperationException($"PrismControl.sln not found above {string.Join(" or ", starts)} (run from prism-control/).");
    }
}

/// <summary>Read-only probes against this PC: no input is sent, nothing is launched or focused.</summary>
public class IntegrationTests
{
    [Test(Category = "integration")]
    public void Foreground_integrity_is_readable()
    {
        var inspector = new Win32ForegroundInspector();
        Assert.True(inspector.OwnIntegrity >= 0x1000, "our own integrity level");
        var f = inspector.Inspect();
        Console.WriteLine($"     ours {ForegroundInfo.IntegrityName(f.OwnIntegrity)}; foreground {f.ProcessName ?? "(none)"} {ForegroundInfo.IntegrityName(f.Integrity)} elevated={f.Elevated} -> {f.Verdict}");
        if (f.Verdict == ForegroundVerdict.Allowed) Assert.True(f.Integrity <= f.OwnIntegrity);
        if (f.Verdict == ForegroundVerdict.Blocked && f.Integrity >= 0) Assert.True(f.Integrity > f.OwnIntegrity);
    }

    [Test(Category = "integration")]
    public void Scan_codes_match_the_research_table()
    {
        var map = new Win32ScanCodeMap();
        foreach (var (vk, scan) in new (ushort, ushort)[] { (0xB3, 0xE022), (0xB0, 0xE019), (0xAF, 0xE030), (0x5B, 0xE05B), (0xA5, 0xE038), (0xA2, 0x1D), (0x25, 0x4B), (0x2E, 0x53), (0x7C, 0x64) })
        {
            Assert.Equal(scan, map.ToScanCode(vk), $"vk 0x{vk:X2}");
            Assert.Equal(scan, StandardScanCodes.Instance.ToScanCode(vk), $"standard table vk 0x{vk:X2}");
        }
    }

    [Test(Category = "integration")]
    public void Running_windows_can_be_found_without_focusing_them()
    {
        var launcher = new ShellAppLauncher(Core.Hosting.NullLog.Instance);
        var hwnd = launcher.FindRunningWindow(new LaunchSpec("explorer.exe"));
        Console.WriteLine($"     explorer main window: {(hwnd == 0 ? "none" : "found")}");
        Assert.Equal((nint)0, launcher.FindRunningWindow(new LaunchSpec(@"C:\Example\definitely-not-running-7f3a.exe")));
        Assert.Equal((nint)0, launcher.FindRunningWindow(new LaunchSpec("https://example.com")), "URLs are never focus targets");
    }
}
